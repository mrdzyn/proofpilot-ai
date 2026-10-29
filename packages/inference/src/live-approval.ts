// C3-LIVE-01A: single-use, auditable operator approval and a fail-closed authorization validator for a FUTURE
// Meta Muse Spark 1.3 proposal attempt. This module enables nothing: the production entry point is still
// hard-disabled, APPROVED_LIVE_QUOTA is 0 and config/live-authorization.json holds no approved decision, so
// every production path through `authorizeLiveAttempt` fails with LIVE_NOT_APPROVED.
//
// Trust boundaries (see docs/SECURITY.md):
//  * The repository's decision register (reviewed, owner-committed) says whether a live decision exists.
//  * The local approval record (.proofpilot/approvals/<runId>.json) is a SELF-DECLARED, per-run record made at
//    a terminal. It is NOT authenticated identity and cannot substitute for the register. Its integrity digest
//    detects accidents and casual edits, not an attacker with write access to the operator's account.
//  * consumeApproval is the single atomic spend: exclusive creation of <runId>.consumed.
// Order for a future activation: authorize -> consume -> re-check volatile facts -> claim reservation -> one call.
// Every step fails closed; nothing is ever released or recycled.
import { createHash, randomBytes } from 'node:crypto';
import { constants as fsc, existsSync } from 'node:fs';
import { link, lstat, mkdir, open, readdir, readFile, unlink, chmod } from 'node:fs/promises';
import path from 'node:path';
import { isValidRunId } from '../../intake/src/consent.ts';
import type { InferenceProvider } from './client.ts';
import { buildProposalRequestHashOk, expectedProposalModel, META_PROPOSAL_MODEL, PROPOSAL_CONSENT_SCOPE, PROPOSAL_LIMITS, ProposalError, type BuiltProposalRequest } from './patch-proposal.ts';
import { APPROVED_LIVE_QUOTA, inspectReservation, type Claim, type ReservationStore } from './reservations.ts';

export const DECISION_ID = 'LIVE-C3-01' as const;
export const APPROVAL_LABEL = 'SELF-DECLARED OPERATOR APPROVAL — NOT AUTHENTICATED IDENTITY' as const;
export const LIVE_LIMITS = Object.freeze({ maxBillableAttempts: 1, retries: 0, maxInputChars: PROPOSAL_LIMITS.maxInputChars, maxOutputTokens: PROPOSAL_LIMITS.maxOutputTokens, textOnly: true } as const);
export const APPROVAL_TTL_MS = Object.freeze({ default: 10 * 60_000, max: 15 * 60_000 } as const);
export const CLOCK_SKEW_MS = 60_000;
export const DEFAULT_APPROVALS_DIR = '.proofpilot/approvals';
export const DEFAULT_RESERVATIONS_ROOT = '.proofpilot/reservations';
const MAX_RECORD_BYTES = 8_192;
const SHA256 = /^[0-9a-f]{64}$/;
const SHA1 = /^[0-9a-f]{40}$/;
const DECLARED_BY = /^[A-Za-z0-9][A-Za-z0-9 ._@-]{0,63}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export type AuthorizationErrorCode =
  | 'LIVE_NOT_APPROVED' | 'REGISTER_INVALID' | 'SYNTHETIC_NOT_ALLOWED' | 'QUOTA_ZERO' | 'QUOTA_EXHAUSTED'
  | 'PROVIDER_NOT_ALLOWED' | 'MODEL_NOT_ALLOWED' | 'INPUT_MISMATCH' | 'BOUNDS'
  | 'APPROVAL_MISSING' | 'APPROVAL_MALFORMED' | 'APPROVAL_UNSAFE_FILE' | 'APPROVAL_MODIFIED' | 'APPROVAL_EXPIRED'
  | 'APPROVAL_SPENT' | 'APPROVAL_DUPLICATE' | 'APPROVAL_MISMATCH'
  | 'REPO_MISMATCH' | 'TREE_DIRTY' | 'GIT_UNAVAILABLE' | 'RESERVATION_SPENT' | 'LOCK_STALE' | 'INTERNAL';

export class AuthorizationError extends Error {
  readonly code: AuthorizationErrorCode;
  constructor(code: AuthorizationErrorCode, message: string) {
    super(message);
    this.name = 'AuthorizationError';
    this.code = code;
  }
}
const fail = (code: AuthorizationErrorCode, message: string): never => {
  throw new AuthorizationError(code, message);
};

// ------------------------------------------------------------------ git probe

export type GitProbe = { head(): Promise<string>; clean(): Promise<boolean> };

// ------------------------------------------------------------------ decision register

export type Decision = {
  decisionId: typeof DECISION_ID;
  status: 'APPROVED';
  provider: 'meta';
  model: typeof META_PROPOSAL_MODEL;
  maxBillableAttempts: number;
  maxInputChars: number;
  maxOutputTokens: number;
  approvedBy: string;
  approvedAt: string;
  reference: string;
  synthetic?: true;
};
export type LoadedRegister = { decisions: Decision[]; sha256: string };

/** Parse register text strictly. The digest is over the exact bytes, so any edit changes every bound approval. */
export function parseDecisionRegister(text: string): LoadedRegister {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('REGISTER_INVALID', 'the decision register is not valid JSON');
  }
  const r = raw as { schemaVersion?: unknown; decisions?: unknown; note?: unknown } | null;
  if (!r || typeof r !== 'object' || r.schemaVersion !== 1 || !Array.isArray(r.decisions)) return fail('REGISTER_INVALID', 'the decision register has an unexpected shape');
  for (const k of Object.keys(r)) if (!['schemaVersion', 'note', 'decisions'].includes(k)) fail('REGISTER_INVALID', `unexpected register key ${JSON.stringify(k)}`);
  const decisions: Decision[] = [];
  for (const d of r.decisions as Array<Record<string, unknown>>) {
    const keys = ['decisionId', 'status', 'provider', 'model', 'maxBillableAttempts', 'maxInputChars', 'maxOutputTokens', 'approvedBy', 'approvedAt', 'reference', 'synthetic'];
    if (!d || typeof d !== 'object' || Object.keys(d).some((k) => !keys.includes(k))) return fail('REGISTER_INVALID', 'a register entry has an unexpected shape');
    decisions.push(d as unknown as Decision);
  }
  return { decisions, sha256: createHash('sha256').update(text, 'utf8').digest('hex') };
}

export async function loadDecisionRegister(repoRoot: string): Promise<LoadedRegister> {
  const text = await readFile(path.join(repoRoot, 'config/live-authorization.json'), 'utf8').catch(() => null);
  if (text === null) return fail('REGISTER_INVALID', 'config/live-authorization.json is missing');
  return parseDecisionRegister(text);
}

/** The one APPROVED LIVE-C3-01 entry for Meta muse-spark-1.3 whose limits do not exceed the code limits; otherwise LIVE_NOT_APPROVED. */
export function findApprovedDecision(register: LoadedRegister, allowSynthetic: boolean): Decision {
  const candidates = register.decisions.filter((d) => d?.decisionId === DECISION_ID);
  if (candidates.length === 0) return fail('LIVE_NOT_APPROVED', 'LIVE-C3-01 has no decision in config/live-authorization.json (NOT APPROVED)');
  if (candidates.length > 1) return fail('REGISTER_INVALID', 'LIVE-C3-01 appears more than once in the register');
  const d = candidates[0]!;
  if (d.status !== 'APPROVED') return fail('LIVE_NOT_APPROVED', 'LIVE-C3-01 is not APPROVED in the register');
  if (d.synthetic !== undefined && (d.synthetic !== true || !allowSynthetic)) return fail('SYNTHETIC_NOT_ALLOWED', 'a synthetic decision can never authorize live activity');
  const okText = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 300;
  if (d.provider !== 'meta' || d.model !== META_PROPOSAL_MODEL) return fail('LIVE_NOT_APPROVED', 'the approved decision does not name Meta muse-spark-1.3');
  if (!okText(d.approvedBy) || !okText(d.reference) || typeof d.approvedAt !== 'string' || !ISO.test(d.approvedAt)) return fail('REGISTER_INVALID', 'the approved decision lacks approver, date or reference');
  const within = (v: unknown, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= max;
  if (!within(d.maxBillableAttempts, LIVE_LIMITS.maxBillableAttempts) || !within(d.maxInputChars, LIVE_LIMITS.maxInputChars) || !within(d.maxOutputTokens, LIVE_LIMITS.maxOutputTokens)) {
    return fail('LIVE_NOT_APPROVED', 'the approved decision exceeds the code limits or is malformed');
  }
  return d;
}

// ------------------------------------------------------------------ approval record

export type ApprovalBody = {
  schemaVersion: 1;
  label: typeof APPROVAL_LABEL;
  approvalId: string;
  decisionId: typeof DECISION_ID;
  registerSha256: string;
  repoSha: string;
  runId: string;
  providerId: 'meta';
  model: typeof META_PROPOSAL_MODEL;
  inputSha256: string;
  inputChars: number;
  scope: typeof PROPOSAL_CONSENT_SCOPE;
  bounds: { maxBillableAttempts: 1; retries: 0; maxInputChars: number; maxOutputTokens: number; textOnly: true };
  declaredBy: string;
  approvedAt: string;
  expiresAt: string;
  synthetic: boolean;
};
export type ApprovalRecord = ApprovalBody & { recordSha256: string };

const BODY_KEYS: Array<keyof ApprovalBody> = ['schemaVersion', 'label', 'approvalId', 'decisionId', 'registerSha256', 'repoSha', 'runId', 'providerId', 'model', 'inputSha256', 'inputChars', 'scope', 'bounds', 'declaredBy', 'approvedAt', 'expiresAt', 'synthetic'];
const canonicalBody = (b: ApprovalBody): string => JSON.stringify(BODY_KEYS.reduce<Record<string, unknown>>((o, k) => ((o[k] = b[k]), o), {}));
export const digestOf = (b: ApprovalBody): string => createHash('sha256').update(canonicalBody(b), 'utf8').digest('hex');

export function newApprovalId(): string {
  return randomBytes(16).toString('hex');
}

export function buildApprovalRecord(input: {
  runId: string; repoSha: string; inputSha256: string; inputChars: number; register: LoadedRegister; declaredBy: string; now: Date; ttlMs?: number; synthetic?: boolean; approvalId?: string;
}): ApprovalRecord {
  const ttl = input.ttlMs ?? APPROVAL_TTL_MS.default;
  if (!isValidRunId(input.runId) || !SHA1.test(input.repoSha) || !SHA256.test(input.inputSha256) || !DECLARED_BY.test(input.declaredBy)) return fail('APPROVAL_MALFORMED', 'approval fields are malformed');
  if (!Number.isInteger(input.inputChars) || input.inputChars < 1 || input.inputChars > LIVE_LIMITS.maxInputChars) return fail('BOUNDS', `input must be 1..${LIVE_LIMITS.maxInputChars} characters`);
  if (!Number.isInteger(ttl) || ttl < 1_000 || ttl > APPROVAL_TTL_MS.max) return fail('APPROVAL_MALFORMED', `ttl must be 1 s .. ${APPROVAL_TTL_MS.max / 60_000} min`);
  const body: ApprovalBody = {
    schemaVersion: 1, label: APPROVAL_LABEL, approvalId: input.approvalId ?? newApprovalId(), decisionId: DECISION_ID, registerSha256: input.register.sha256, repoSha: input.repoSha,
    runId: input.runId, providerId: 'meta', model: META_PROPOSAL_MODEL, inputSha256: input.inputSha256, inputChars: input.inputChars, scope: PROPOSAL_CONSENT_SCOPE,
    bounds: { maxBillableAttempts: 1, retries: 0, maxInputChars: LIVE_LIMITS.maxInputChars, maxOutputTokens: LIVE_LIMITS.maxOutputTokens, textOnly: true },
    declaredBy: input.declaredBy, approvedAt: input.now.toISOString(), expiresAt: new Date(input.now.getTime() + ttl).toISOString(), synthetic: input.synthetic === true,
  };
  return { ...body, recordSha256: digestOf(body) };
}

/** Strict shape + integrity check of untrusted parsed JSON. */
export function parseApprovalRecord(raw: unknown): ApprovalRecord {
  const r = raw as Record<string, any> | null;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return fail('APPROVAL_MALFORMED', 'approval record is not an object');
  const keys = Object.keys(r).sort().join(',');
  if (keys !== [...BODY_KEYS, 'recordSha256'].sort().join(',')) return fail('APPROVAL_MALFORMED', 'approval record has missing or unexpected keys');
  const b = r.bounds;
  const ok =
    r.schemaVersion === 1 && r.label === APPROVAL_LABEL && /^[0-9a-f]{32}$/.test(r.approvalId) && r.decisionId === DECISION_ID && SHA256.test(r.registerSha256) && SHA1.test(r.repoSha) &&
    isValidRunId(r.runId) && r.providerId === 'meta' && r.model === META_PROPOSAL_MODEL && SHA256.test(r.inputSha256) && Number.isInteger(r.inputChars) && r.inputChars >= 1 && r.scope === PROPOSAL_CONSENT_SCOPE &&
    b && typeof b === 'object' && Object.keys(b).sort().join(',') === 'maxBillableAttempts,maxInputChars,maxOutputTokens,retries,textOnly' &&
    typeof r.declaredBy === 'string' && DECLARED_BY.test(r.declaredBy) && typeof r.approvedAt === 'string' && ISO.test(r.approvedAt) && typeof r.expiresAt === 'string' && ISO.test(r.expiresAt) &&
    typeof r.synthetic === 'boolean' && typeof r.recordSha256 === 'string' && SHA256.test(r.recordSha256);
  if (!ok) return fail('APPROVAL_MALFORMED', 'approval record fields are malformed');
  const rec = r as ApprovalRecord;
  if (digestOf(rec) !== rec.recordSha256) return fail('APPROVAL_MODIFIED', 'approval record does not match its integrity digest');
  return rec;
}

// ------------------------------------------------------------------ private file handling

const ownUid = (): number | null => (typeof process.getuid === 'function' ? process.getuid() : null);

/** Create (0700) or verify the private approvals directory: a real directory, not a symlink, owned by us, no group/other access. */
export async function ensureApprovalsDir(dir: string): Promise<void> {
  const parent = path.dirname(dir);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  for (const p of [parent, dir]) {
    const st = await lstat(p).catch(() => null);
    if (p === dir && st === null) {
      await mkdir(dir, { mode: 0o700 });
      await chmod(dir, 0o700);
    }
    const now = await lstat(p);
    if (now.isSymbolicLink() || !now.isDirectory()) return fail('APPROVAL_UNSAFE_FILE', `${path.basename(p)} is a symlink or not a directory`);
    if (p === dir) {
      if ((now.mode & 0o077) !== 0) return fail('APPROVAL_UNSAFE_FILE', 'the approvals directory is accessible to other users');
      if (ownUid() !== null && now.uid !== ownUid()) return fail('APPROVAL_UNSAFE_FILE', 'the approvals directory is owned by another user');
    }
  }
}

const recordPath = (dir: string, runId: string) => path.join(dir, `${runId}.json`);
const consumedPath = (dir: string, runId: string) => path.join(dir, `${runId}.consumed`);

/** Atomic exclusive publication: full content in a private temp file, then link() which fails if the name exists. */
export async function writeApprovalRecord(dir: string, record: ApprovalRecord): Promise<string> {
  if (!isValidRunId(record.runId)) return fail('APPROVAL_MALFORMED', 'run id is malformed');
  await ensureApprovalsDir(dir);
  if (existsSync(consumedPath(dir, record.runId))) return fail('APPROVAL_DUPLICATE', 'this run id already has a consumed approval');
  const tmp = path.join(dir, `.${record.runId}.${randomBytes(6).toString('hex')}.tmp`);
  const h = await open(tmp, 'wx', 0o600);
  try {
    await h.writeFile(JSON.stringify(record, null, 2) + '\n');
    await h.sync();
  } finally {
    await h.close();
  }
  try {
    await link(tmp, recordPath(dir, record.runId));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return fail('APPROVAL_DUPLICATE', 'an approval for this run id already exists');
    throw e;
  } finally {
    await unlink(tmp).catch(() => undefined);
  }
  return recordPath(dir, record.runId);
}

/** Open without following symlinks and verify the opened file itself (not the path) is a private regular file. */
async function readPrivateFile(file: string, missing: AuthorizationErrorCode): Promise<string> {
  let h;
  try {
    h = await open(file, fsc.O_RDONLY | fsc.O_NOFOLLOW);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return fail(missing, 'no such approval');
    return fail('APPROVAL_UNSAFE_FILE', `approval file cannot be opened safely (${code ?? 'error'})`);
  }
  try {
    const st = await h.stat();
    if (!st.isFile() || st.nlink !== 1) return fail('APPROVAL_UNSAFE_FILE', 'approval file is not a plain single-link file');
    if ((st.mode & 0o077) !== 0) return fail('APPROVAL_UNSAFE_FILE', 'approval file is accessible to other users');
    if (ownUid() !== null && st.uid !== ownUid()) return fail('APPROVAL_UNSAFE_FILE', 'approval file is owned by another user');
    if (st.size > MAX_RECORD_BYTES) return fail('APPROVAL_MALFORMED', 'approval file is too large');
    return await h.readFile('utf8');
  } finally {
    await h.close();
  }
}

export async function readApprovalRecord(dir: string, runId: string): Promise<ApprovalRecord> {
  if (!isValidRunId(runId)) return fail('APPROVAL_MALFORMED', 'run id is malformed');
  await ensureApprovalsDir(dir);
  const text = await readPrivateFile(recordPath(dir, runId), 'APPROVAL_MISSING');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('APPROVAL_MALFORMED', 'approval record is not valid JSON');
  }
  return parseApprovalRecord(raw);
}

// ------------------------------------------------------------------ the validator

export type AuthorizeInput = {
  approvalsDir: string;
  reservationsRoot: string;
  runId: string;
  request: BuiltProposalRequest;
  provider: Pick<InferenceProvider, 'id' | 'models'>;
  maxOutputTokens: number;
  git: GitProbe;
  now?: () => Date;
};
/** Fields only tests may supply; the production wrapper `authorizeLiveAttempt` fixes every one of them. */
export type AuthorizeInjected = { register: LoadedRegister; liveQuota: number; allowSynthetic: boolean };

export type AuthorizedAttempt = Readonly<{ runId: string; approvalId: string; recordSha256: string; repoSha: string; model: string; inputSha256: string; expiresAt: string; decisionReference: string; synthetic: boolean }>;

/**
 * Fail-closed authorization check. Throws AuthorizationError on the first failed condition; never consumes or reserves anything.
 * `afterConsume` is used only for the re-check between consuming the approval and claiming the reservation.
 * EXPLICITLY TEST-ONLY interface: the `injected` argument. Production callers use `authorizeLiveAttempt`.
 */
export async function evaluateAuthorization(input: AuthorizeInput, injected: AuthorizeInjected, mode: { afterConsume?: boolean } = {}): Promise<AuthorizedAttempt> {
  try {
    const now = (input.now ?? (() => new Date()))();
    const { request, provider } = input;
    if (provider?.id !== 'meta') fail('PROVIDER_NOT_ALLOWED', 'only the Meta provider may be authorized');
    try {
      expectedProposalModel(provider);
    } catch (e) {
      if (e instanceof ProposalError) fail('MODEL_NOT_ALLOWED', 'the model must be exactly muse-spark-1.3');
      throw e;
    }
    const decision = findApprovedDecision(injected.register, injected.allowSynthetic);
    if (!Number.isInteger(injected.liveQuota) || injected.liveQuota < 1) fail('QUOTA_ZERO', 'the live quota is 0');

    if (!isValidRunId(input.runId)) fail('APPROVAL_MALFORMED', 'run id is malformed');
    if (!request || typeof request.prompt !== 'string' || !buildProposalRequestHashOk(request)) fail('INPUT_MISMATCH', 'the request does not match its hash');
    if (request.prompt.length > Math.min(LIVE_LIMITS.maxInputChars, decision.maxInputChars)) fail('BOUNDS', 'input exceeds the approved character bound');
    if (!Number.isInteger(input.maxOutputTokens) || input.maxOutputTokens < 1 || input.maxOutputTokens > Math.min(LIVE_LIMITS.maxOutputTokens, decision.maxOutputTokens)) fail('BOUNDS', 'output tokens exceed the approved bound');

    const rec = await readApprovalRecord(input.approvalsDir, input.runId);
    if (rec.synthetic && !injected.allowSynthetic) fail('SYNTHETIC_NOT_ALLOWED', 'a synthetic approval can never authorize live activity');
    if (rec.synthetic !== (decision.synthetic === true)) fail('APPROVAL_MISMATCH', 'approval and decision disagree about being synthetic');
    if (rec.runId !== input.runId) fail('APPROVAL_MISMATCH', 'approval is for a different run');
    if (rec.providerId !== provider.id || rec.model !== provider.models.visual) fail('APPROVAL_MISMATCH', 'approval is for a different provider or model');
    if (rec.inputSha256 !== request.inputSha256 || rec.inputChars !== request.prompt.length) fail('INPUT_MISMATCH', 'approval is for a different input');
    if (rec.registerSha256 !== injected.register.sha256) fail('APPROVAL_MISMATCH', 'the decision register changed since this approval');
    if (rec.bounds.maxInputChars !== LIVE_LIMITS.maxInputChars || rec.bounds.maxOutputTokens !== LIVE_LIMITS.maxOutputTokens || rec.bounds.maxBillableAttempts !== 1 || rec.bounds.retries !== 0 || rec.bounds.textOnly !== true) fail('BOUNDS', 'approval bounds differ from the code limits');

    const approvedAt = Date.parse(rec.approvedAt);
    const expiresAt = Date.parse(rec.expiresAt);
    if (!(expiresAt > approvedAt) || expiresAt - approvedAt > APPROVAL_TTL_MS.max) fail('APPROVAL_MALFORMED', 'approval lifetime is invalid');
    if (approvedAt > now.getTime() + CLOCK_SKEW_MS) fail('APPROVAL_MALFORMED', 'approval is dated in the future');
    if (now.getTime() >= expiresAt) fail('APPROVAL_EXPIRED', 'approval has expired');

    const marker = await readFile(consumedPath(input.approvalsDir, input.runId), 'utf8').then((t) => t, (e: NodeJS.ErrnoException) => (e.code === 'ENOENT' ? null : fail('APPROVAL_UNSAFE_FILE', 'consumption marker cannot be read')));
    if (mode.afterConsume) {
      let m: { approvalId?: unknown; recordSha256?: unknown } | null = null;
      try {
        m = marker === null ? null : JSON.parse(marker);
      } catch { /* handled below */ }
      if (!m || m.approvalId !== rec.approvalId || m.recordSha256 !== rec.recordSha256) fail('APPROVAL_MISMATCH', 'the consumption marker does not match this approval');
    } else if (marker !== null) {
      fail('APPROVAL_SPENT', 'this approval has already been used');
    }

    let head: string;
    let clean: boolean;
    try {
      head = await input.git.head();
      clean = await input.git.clean();
    } catch {
      return fail('GIT_UNAVAILABLE', 'repository state could not be determined');
    }
    if (head !== rec.repoSha) fail('REPO_MISMATCH', 'repository HEAD differs from the approved revision');
    if (!clean) fail('TREE_DIRTY', 'the working tree is not clean');

    const res = await inspectReservation(input.reservationsRoot, 'meta', input.runId);
    if (res.runSpent) fail('RESERVATION_SPENT', 'this run id already has a reservation');
    if (res.lockPresent) fail('LOCK_STALE', 'a reservation lock is present (live or crashed); refusing');
    if (res.slotsSpent >= injected.liveQuota) fail('QUOTA_EXHAUSTED', 'no unspent quota slot remains');

    return Object.freeze({ runId: rec.runId, approvalId: rec.approvalId, recordSha256: rec.recordSha256, repoSha: rec.repoSha, model: rec.model, inputSha256: rec.inputSha256, expiresAt: rec.expiresAt, decisionReference: decision.reference, synthetic: rec.synthetic });
  } catch (e) {
    if (e instanceof AuthorizationError) throw e;
    throw new AuthorizationError('INTERNAL', 'authorization failed closed on an unexpected error');
  }
}

/** Production wrapper: the register comes from the repository file, synthetic decisions are impossible and the quota is the code constant. */
export async function authorizeLiveAttempt(input: AuthorizeInput & { repoRoot: string }): Promise<AuthorizedAttempt> {
  const register = await loadDecisionRegister(input.repoRoot).catch((e) => {
    throw e instanceof AuthorizationError ? e : new AuthorizationError('INTERNAL', 'authorization failed closed');
  });
  return evaluateAuthorization(input, { register, liveQuota: APPROVED_LIVE_QUOTA.meta, allowSynthetic: false });
}

// ------------------------------------------------------------------ consumption and the activation order

/** The single atomic spend of an approval: exclusive creation. The second concurrent caller gets APPROVAL_SPENT. Never undone. */
export async function consumeApproval(dir: string, a: AuthorizedAttempt, now: () => Date = () => new Date()): Promise<void> {
  try {
    const h = await open(consumedPath(dir, a.runId), 'wx', 0o600);
    try {
      await h.writeFile(JSON.stringify({ schemaVersion: 1, runId: a.runId, approvalId: a.approvalId, recordSha256: a.recordSha256, consumedAt: now().toISOString() }) + '\n');
      await h.sync();
    } finally {
      await h.close();
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') return fail('APPROVAL_SPENT', 'this approval has already been used');
    throw e;
  }
}

export type PreparedAttempt = { authorized: AuthorizedAttempt; claim: Claim };

/**
 * The only sanctioned order for a future live attempt (used today only by the synthetic rehearsal):
 *   1. authorize (read-only)  2. consume the approval atomically  3. re-check expiry, HEAD, tree and reservation state
 *   4. claim the reservation (run id + quota slot)  5. only then may a provider be called.
 * A crash after 2 spends the approval and nothing else (the operator must approve a NEW run id); a crash after 4 leaves a
 * CLAIMED run and a spent slot. Neither is ever released, so no crash can produce an extra billable attempt.
 */
export async function prepareAttempt(input: AuthorizeInput, injected: AuthorizeInjected, store: ReservationStore): Promise<PreparedAttempt> {
  const authorized = await evaluateAuthorization(input, injected);
  await consumeApproval(input.approvalsDir, authorized, input.now);
  const again = await evaluateAuthorization(input, injected, { afterConsume: true });
  if (again.approvalId !== authorized.approvalId || again.recordSha256 !== authorized.recordSha256) fail('APPROVAL_MISMATCH', 'approval changed between checks');
  try {
    const claim = await store.claim({ providerId: 'meta', runId: input.runId, quota: injected.liveQuota });
    return { authorized: again, claim };
  } catch (e) {
    if (e instanceof AuthorizationError) throw e;
    const code = (e as { code?: string })?.code;
    if (code === 'RUN_ID_SPENT') return fail('RESERVATION_SPENT', 'this run id already has a reservation');
    if (code === 'QUOTA_EXHAUSTED') return fail('QUOTA_EXHAUSTED', 'no unspent quota slot remains');
    if (code === 'LOCK_UNAVAILABLE') return fail('LOCK_STALE', 'the reservation lock is unavailable');
    return fail('INTERNAL', 'reservation failed closed');
  }
}

/** Read-only reconciliation: approvals that were consumed but never reached a reservation (crash between steps 2 and 4). */
export async function listStrandedApprovals(approvalsDir: string, reservationsRoot: string): Promise<string[]> {
  const out: string[] = [];
  for (const name of await readdir(approvalsDir).catch(() => [] as string[])) {
    const m = /^(.+)\.consumed$/.exec(name);
    if (!m || !isValidRunId(m[1])) continue;
    const res = await inspectReservation(reservationsRoot, 'meta', m[1]).catch(() => null);
    if (!res || !res.runSpent) out.push(m[1]);
  }
  return out.sort();
}
