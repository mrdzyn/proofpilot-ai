// C3-LIVE-01A primitives: decision register, activation pin, approval records, private file handling and the single
// atomic approval spend. These are LOW-LEVEL building blocks and make no authorization decision on their own. The only
// production authorization API is live-gate.ts (it derives every trusted input internally); the injectable core used by
// the synthetic rehearsal and the tests is live-gate-core.ts, which is not exported from the package index. This module
// enables nothing: APPROVED_LIVE_QUOTA is 0 and both owner-controlled files are empty.
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
import { constants as fsc, existsSync, type Stats } from 'node:fs';
import { link, lstat, mkdir, open, readdir, readFile, unlink, chmod } from 'node:fs/promises';
import path from 'node:path';
import { isValidRunId } from '../../intake/src/consent.ts';
import { META_PROPOSAL_MODEL, PROPOSAL_CONSENT_SCOPE, PROPOSAL_LIMITS } from './patch-proposal.ts';
import { inspectReservation } from './reservations.ts';

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
  | 'ACTIVATION_NOT_PINNED' | 'ACTIVATION_MISMATCH' | 'REVISION_NOT_APPROVED' | 'PIN_INVALID' | 'REPO_MISMATCH' | 'TREE_DIRTY' | 'GIT_UNAVAILABLE' | 'RESERVATION_SPENT' | 'LOCK_STALE' | 'INTERNAL';

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

/** Read-only repository facts. `treeDigest(rev, exclude)` is the activation digest of a revision (see ACTIVATION below). */
export type PinDescent = { ok: true } | { ok: false; reason: string };
export type GitProbe = {
  head(): Promise<string>;
  clean(): Promise<boolean>;
  treeDigest(rev: string, excludePath: string): Promise<string>;
  /**
   * Revision relationship (not just tree contents): `activationCommit` is an ancestor of HEAD and EVERY commit in activationCommit..HEAD is a
   * linear, non-merge commit whose only change is `pinPath`. An empty commit, a revert/recommit, a code or config change, or a merge breaks it.
   */
  pinOnlyDescent(activationCommit: string, pinPath: string): Promise<PinDescent>;
};

// ------------------------------------------------------------------ owner-pinned activation revision
//
// MAJOR-2. A register that lives inside a commit cannot name that commit's own SHA. Instead the owner pins a DIGEST OF THE
// TREE EXCLUDING THE PIN FILE ITSELF (config/live-activation.json). Safe sequence (docs/META-ACTIVATION-CHECKLIST.md C0):
//   1. the reviewed C3-LIVE-01B PR (register entry + code) is audited and merged -> commit A exists;
//   2. the owner computes `node scripts/c3-activation-digest.ts <A>` and records A plus that digest, with the decision
//      reference, in a separate pin-only commit A' (reviewed) -> the pin file is the only difference between A and A';
//   3. production accepts HEAD only if (a) its tree digest (pin file excluded) equals the pinned digest AND A still hashes to it, AND
//      (b) the REVISION RELATIONSHIP holds: A is an ancestor of HEAD and every commit in A..HEAD is linear and changes ONLY the pin
//      file. (a) alone would accept an unauthorized empty or revert/recommit descendant with an identical tree; (b) rejects it,
//      because such a commit changes nothing, or something other than, the pin file.
//   Re-pinning: a corrected pin is another reviewed pin-only commit on top of the chain (still pin-only descent from A); authorizing
//   NEW code means merging a reviewed activation commit A2 and then a pin-only commit naming A2 and its digest. Old approvals bind
//   the activation commit and digest, so they stop working. Honest boundary: git cannot prove a commit's SHA from inside the tree.
//   What is enforced is structure (only the pin file changes after A); that the pin-file edit itself was the owner's is the review of
//   that commit (protected main + owner review). A commit that edits only the pin file is, by definition, an owner pin action.
export const ACTIVATION_PIN_PATH = 'config/live-activation.json' as const;
export type ActivationPin = {
  decisionId: typeof DECISION_ID;
  decisionReference: string;
  activationCommit: string;
  activationDigest: string;
  recordedBy: string;
  recordedAt: string;
  reference: string;
  synthetic?: true;
};
export type LoadedPin = { activation: ActivationPin | null; sha256: string };

export function parseActivationPin(text: string): LoadedPin {
  let raw: { schemaVersion?: unknown; activation?: unknown; note?: unknown } | null;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('PIN_INVALID', 'the activation pin is not valid JSON');
  }
  if (!raw || typeof raw !== 'object' || raw.schemaVersion !== 1 || !('activation' in raw) || Object.keys(raw).some((k) => !['schemaVersion', 'note', 'activation'].includes(k))) return fail('PIN_INVALID', 'the activation pin has an unexpected shape');
  const sha256 = createHash('sha256').update(text, 'utf8').digest('hex');
  if (raw.activation === null) return { activation: null, sha256 };
  const a = raw.activation as Record<string, unknown>;
  const keys = ['decisionId', 'decisionReference', 'activationCommit', 'activationDigest', 'recordedBy', 'recordedAt', 'reference', 'synthetic'];
  const text300 = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 300;
  if (!a || typeof a !== 'object' || Object.keys(a).some((k) => !keys.includes(k)) || a.decisionId !== DECISION_ID || !text300(a.decisionReference) || typeof a.activationCommit !== 'string' || !SHA1.test(a.activationCommit) ||
    typeof a.activationDigest !== 'string' || !SHA256.test(a.activationDigest) || !text300(a.recordedBy) || typeof a.recordedAt !== 'string' || !ISO.test(a.recordedAt) || !text300(a.reference) || (a.synthetic !== undefined && a.synthetic !== true)) {
    return fail('PIN_INVALID', 'the activation pin entry is malformed');
  }
  return { activation: a as unknown as ActivationPin, sha256 };
}

export async function loadActivationPin(repoRoot: string): Promise<LoadedPin> {
  const text = await readFile(path.join(repoRoot, ACTIVATION_PIN_PATH), 'utf8').catch(() => null);
  if (text === null) return fail('PIN_INVALID', `${ACTIVATION_PIN_PATH} is missing`);
  return parseActivationPin(text);
}

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
export function findApprovedDecision(register: LoadedRegister, syntheticContext: boolean): Decision {
  const candidates = register.decisions.filter((d) => d?.decisionId === DECISION_ID);
  if (candidates.length === 0) return fail('LIVE_NOT_APPROVED', 'LIVE-C3-01 has no decision in config/live-authorization.json (NOT APPROVED)');
  if (candidates.length > 1) return fail('REGISTER_INVALID', 'LIVE-C3-01 appears more than once in the register');
  const d = candidates[0]!;
  if (d.status !== 'APPROVED') return fail('LIVE_NOT_APPROVED', 'LIVE-C3-01 is not APPROVED in the register');
  if (d.synthetic !== undefined && (d.synthetic !== true || !syntheticContext)) return fail('SYNTHETIC_NOT_ALLOWED', 'a synthetic decision can never authorize live activity');
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
  activationCommit: string;
  activationDigest: string;
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

const BODY_KEYS: Array<keyof ApprovalBody> = ['schemaVersion', 'label', 'approvalId', 'decisionId', 'registerSha256', 'repoSha', 'activationCommit', 'activationDigest', 'runId', 'providerId', 'model', 'inputSha256', 'inputChars', 'scope', 'bounds', 'declaredBy', 'approvedAt', 'expiresAt', 'synthetic'];
const canonicalBody = (b: ApprovalBody): string => JSON.stringify(BODY_KEYS.reduce<Record<string, unknown>>((o, k) => ((o[k] = b[k]), o), {}));
export const digestOf = (b: ApprovalBody): string => createHash('sha256').update(canonicalBody(b), 'utf8').digest('hex');

export function newApprovalId(): string {
  return randomBytes(16).toString('hex');
}

export function buildApprovalRecord(input: {
  runId: string; repoSha: string; activation: { commit: string; digest: string }; inputSha256: string; inputChars: number; register: LoadedRegister; declaredBy: string; now: Date; ttlMs?: number; synthetic?: boolean; approvalId?: string;
}): ApprovalRecord {
  const ttl = input.ttlMs ?? APPROVAL_TTL_MS.default;
  if (!isValidRunId(input.runId) || !SHA1.test(input.repoSha) || !SHA1.test(input.activation?.commit) || !SHA256.test(input.activation?.digest) || !SHA256.test(input.inputSha256) || !DECLARED_BY.test(input.declaredBy)) return fail('APPROVAL_MALFORMED', 'approval fields are malformed');
  if (!Number.isInteger(input.inputChars) || input.inputChars < 1 || input.inputChars > LIVE_LIMITS.maxInputChars) return fail('BOUNDS', `input must be 1..${LIVE_LIMITS.maxInputChars} characters`);
  if (!Number.isInteger(ttl) || ttl < 1_000 || ttl > APPROVAL_TTL_MS.max) return fail('APPROVAL_MALFORMED', `ttl must be 1 s .. ${APPROVAL_TTL_MS.max / 60_000} min`);
  const body: ApprovalBody = {
    schemaVersion: 1, label: APPROVAL_LABEL, approvalId: input.approvalId ?? newApprovalId(), decisionId: DECISION_ID, registerSha256: input.register.sha256, repoSha: input.repoSha, activationCommit: input.activation.commit, activationDigest: input.activation.digest,
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
    r.schemaVersion === 1 && r.label === APPROVAL_LABEL && /^[0-9a-f]{32}$/.test(r.approvalId) && r.decisionId === DECISION_ID && SHA256.test(r.registerSha256) && SHA1.test(r.repoSha) && SHA1.test(r.activationCommit) && SHA256.test(r.activationDigest) &&
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

/**
 * Create (0700) or verify the private approvals directory and its mutable ancestors. The existing `.proofpilot` parent and
 * the directory above it must be real directories (not symlinks), owned by us, and not writable by group or others, so
 * nobody else can swap the private directory out; an unsafe existing ancestor is REFUSED, never chmod-ed. The approvals
 * directory itself must have no group/other access at all. This does not defend against the same OS user.
 */
export async function ensureApprovalsDir(dir: string): Promise<void> {
  const parent = path.dirname(dir);
  const grand = path.dirname(parent);
  const check = (st: Stats, name: string, strict: boolean) => {
    if (st.isSymbolicLink() || !st.isDirectory()) return fail('APPROVAL_UNSAFE_FILE', `${name} is a symlink or not a directory`);
    if (ownUid() !== null && st.uid !== ownUid()) return fail('APPROVAL_UNSAFE_FILE', `${name} is owned by another user`);
    if ((st.mode & (strict ? 0o077 : 0o022)) !== 0) return fail('APPROVAL_UNSAFE_FILE', `${name} is ${strict ? 'accessible' : 'writable'} by other users`);
  };
  const gst = await lstat(grand).catch(() => null);
  if (gst) check(gst, path.basename(grand) || 'the repository directory', false);
  if ((await lstat(parent).catch(() => null)) === null) await mkdir(parent, { recursive: true, mode: 0o700 });
  check(await lstat(parent), path.basename(parent), false);
  if ((await lstat(dir).catch(() => null)) === null) {
    await mkdir(dir, { mode: 0o700 });
    await chmod(dir, 0o700);
  }
  check(await lstat(dir), path.basename(dir), true);
}

const recordPath = (dir: string, runId: string) => path.join(dir, `${runId}.json`);
export const consumedPath = (dir: string, runId: string) => path.join(dir, `${runId}.consumed`);

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

export type AuthorizedAttempt = Readonly<{ runId: string; approvalId: string; recordSha256: string; repoSha: string; activationDigest: string; model: string; inputSha256: string; expiresAt: string; decisionReference: string; synthetic: boolean }>;

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
