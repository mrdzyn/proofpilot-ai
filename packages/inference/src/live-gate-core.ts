// C3-LIVE-01A: the authorization core. NOT a production API and NOT exported from the package index.
//
// The core never trusts its own arguments to be authoritative: everything it believes comes from a TrustContext. There are exactly
// two ways to obtain one:
//   * createInstallContext(installRoot, liveQuota)  - derives the register, the owner-pinned activation revision, the real Git state,
//     the approvals directory and the reservation directory from ONE install root. live-gate.ts calls it with the fixed location of
//     this checkout and the code constant APPROVED_LIVE_QUOTA.meta; nothing a caller passes can change either.
//   * createSyntheticContext(parts)                  - hand-built parts, kind 'synthetic'. It can never produce a context the production
//     API will use, and an authorization obtained from it is flagged synthetic. Used only by the zero-network rehearsal and tests.
// Future live code must call live-gate.ts (authorizeProductionAttempt / prepareProductionAttempt). A static security test limits who may
// import this file.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isValidRunId } from '../../intake/src/consent.ts';
import type { InferenceProvider } from './client.ts';
import { createGitProbe } from './git-probe.ts';
import {
  ACTIVATION_PIN_PATH, APPROVAL_TTL_MS, AuthorizationError, CLOCK_SKEW_MS, consumeApproval, consumedPath, DECISION_ID, DEFAULT_APPROVALS_DIR, DEFAULT_RESERVATIONS_ROOT, findApprovedDecision,
  LIVE_LIMITS, loadActivationPin, loadDecisionRegister, readApprovalRecord,
  type ActivationPin, type AuthorizedAttempt, type Decision, type GitProbe, type LoadedPin, type LoadedRegister,
} from './live-approval.ts';
import { buildProposalRequestHashOk, expectedProposalModel, ProposalError, type BuiltProposalRequest } from './patch-proposal.ts';
import { createReservationStore, inspectReservation, type Claim, type ReservationStore } from './reservations.ts';

const fail = (code: ConstructorParameters<typeof AuthorizationError>[0], message: string): never => {
  throw new AuthorizationError(code, message);
};

export type TrustContext = Readonly<{
  kind: 'production' | 'synthetic';
  register: LoadedRegister;
  pin: LoadedPin;
  git: GitProbe;
  approvalsDir: string;
  reservationsRoot: string;
  liveQuota: number;
  store: ReservationStore;
}>;

/** Everything derived from one install root: file sources, real Git probe, private directories. Kind 'production' (synthetic decisions rejected). */
export async function createInstallContext(installRoot: string, liveQuota: number): Promise<TrustContext> {
  const [register, pin] = await Promise.all([loadDecisionRegister(installRoot), loadActivationPin(installRoot)]);
  const reservationsRoot = path.join(installRoot, DEFAULT_RESERVATIONS_ROOT);
  return Object.freeze({ kind: 'production', register, pin, git: createGitProbe(installRoot), approvalsDir: path.join(installRoot, DEFAULT_APPROVALS_DIR), reservationsRoot, liveQuota, store: createReservationStore(reservationsRoot) });
}

/** Hand-built parts for the rehearsal and tests. Synthetic by construction. */
export function createSyntheticContext(parts: Omit<TrustContext, 'kind' | 'store'> & { store?: ReservationStore }): TrustContext {
  return Object.freeze({ ...parts, kind: 'synthetic', store: parts.store ?? createReservationStore(parts.reservationsRoot) });
}

export type AuthorizeRequest = {
  runId: string;
  request: BuiltProposalRequest;
  provider: Pick<InferenceProvider, 'id' | 'models'>;
  maxOutputTokens: number;
  now?: () => Date;
};

/**
 * Is the repository revision the owner-pinned activation revision? The pin must exist and belong to this decision and reference, the
 * pinned commit must still hash to the pinned digest, and so must HEAD (the pin file is excluded from both digests).
 */
export async function checkActivation(ctx: TrustContext, decision: Decision): Promise<ActivationPin> {
  const act = ctx.pin.activation;
  if (!act) return fail('ACTIVATION_NOT_PINNED', `no owner-pinned activation revision in ${ACTIVATION_PIN_PATH}`);
  if (act.synthetic !== undefined && ctx.kind !== 'synthetic') return fail('SYNTHETIC_NOT_ALLOWED', 'a synthetic activation pin can never authorize live activity');
  if (ctx.kind === 'synthetic' && (act.synthetic === true) !== (decision.synthetic === true)) return fail('ACTIVATION_MISMATCH', 'pin and decision disagree about being synthetic');
  if (act.decisionId !== DECISION_ID || act.decisionReference !== decision.reference) return fail('ACTIVATION_MISMATCH', 'the activation pin names a different decision reference');
  try {
    await ctx.git.head();
  } catch {
    return fail('GIT_UNAVAILABLE', 'repository state could not be determined');
  }
  let pinned: string;
  try {
    pinned = await ctx.git.treeDigest(act.activationCommit, ACTIVATION_PIN_PATH);
  } catch {
    return fail('ACTIVATION_MISMATCH', 'the pinned activation commit cannot be hashed');
  }
  if (pinned !== act.activationDigest) return fail('ACTIVATION_MISMATCH', 'the pinned commit does not hash to the pinned digest');
  let head: string;
  try {
    head = await ctx.git.treeDigest('HEAD', ACTIVATION_PIN_PATH);
  } catch {
    return fail('GIT_UNAVAILABLE', 'repository state could not be determined');
  }
  if (head !== act.activationDigest) return fail('REVISION_NOT_APPROVED', 'HEAD is not the owner-approved activation revision (it differs from the pinned tree digest)');
  return act;
}

/** Fail-closed authorization. Throws AuthorizationError on the first failed condition; never consumes or reserves anything. */
export async function evaluateAuthorizationCore(ctx: TrustContext, input: AuthorizeRequest, mode: { afterConsume?: boolean } = {}): Promise<AuthorizedAttempt> {
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
    const decision = findApprovedDecision(ctx.register, ctx.kind === 'synthetic');
    if (!Number.isInteger(ctx.liveQuota) || ctx.liveQuota < 1) fail('QUOTA_ZERO', 'the live quota is 0');
    const act = await checkActivation(ctx, decision);

    if (!isValidRunId(input.runId)) fail('APPROVAL_MALFORMED', 'run id is malformed');
    if (!request || typeof request.prompt !== 'string' || !buildProposalRequestHashOk(request)) fail('INPUT_MISMATCH', 'the request does not match its hash');
    if (request.prompt.length > Math.min(LIVE_LIMITS.maxInputChars, decision.maxInputChars)) fail('BOUNDS', 'input exceeds the approved character bound');
    if (!Number.isInteger(input.maxOutputTokens) || input.maxOutputTokens < 1 || input.maxOutputTokens > Math.min(LIVE_LIMITS.maxOutputTokens, decision.maxOutputTokens)) fail('BOUNDS', 'output tokens exceed the approved bound');

    const rec = await readApprovalRecord(ctx.approvalsDir, input.runId);
    if (rec.synthetic && ctx.kind !== 'synthetic') fail('SYNTHETIC_NOT_ALLOWED', 'a synthetic approval can never authorize live activity');
    if (rec.synthetic !== (decision.synthetic === true)) fail('APPROVAL_MISMATCH', 'approval and decision disagree about being synthetic');
    if (rec.runId !== input.runId) fail('APPROVAL_MISMATCH', 'approval is for a different run');
    if (rec.providerId !== provider.id || rec.model !== provider.models.visual) fail('APPROVAL_MISMATCH', 'approval is for a different provider or model');
    if (rec.inputSha256 !== request.inputSha256 || rec.inputChars !== request.prompt.length) fail('INPUT_MISMATCH', 'approval is for a different input');
    if (rec.registerSha256 !== ctx.register.sha256) fail('APPROVAL_MISMATCH', 'the decision register changed since this approval');
    if (rec.activationDigest !== act.activationDigest || rec.activationCommit !== act.activationCommit) fail('REVISION_NOT_APPROVED', 'approval was made for a different activation revision');
    if (rec.bounds.maxInputChars !== LIVE_LIMITS.maxInputChars || rec.bounds.maxOutputTokens !== LIVE_LIMITS.maxOutputTokens || rec.bounds.maxBillableAttempts !== 1 || rec.bounds.retries !== 0 || rec.bounds.textOnly !== true) fail('BOUNDS', 'approval bounds differ from the code limits');

    const approvedAt = Date.parse(rec.approvedAt);
    const expiresAt = Date.parse(rec.expiresAt);
    if (!(expiresAt > approvedAt) || expiresAt - approvedAt > APPROVAL_TTL_MS.max) fail('APPROVAL_MALFORMED', 'approval lifetime is invalid');
    if (approvedAt > now.getTime() + CLOCK_SKEW_MS) fail('APPROVAL_MALFORMED', 'approval is dated in the future');
    if (now.getTime() >= expiresAt) fail('APPROVAL_EXPIRED', 'approval has expired');

    const marker = await readFile(consumedPath(ctx.approvalsDir, input.runId), 'utf8').then((t) => t, (e: NodeJS.ErrnoException) => (e.code === 'ENOENT' ? null : fail('APPROVAL_UNSAFE_FILE', 'consumption marker cannot be read')));
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
      head = await ctx.git.head();
      clean = await ctx.git.clean();
    } catch {
      return fail('GIT_UNAVAILABLE', 'repository state could not be determined');
    }
    if (head !== rec.repoSha) fail('REPO_MISMATCH', 'repository HEAD differs from the revision this approval was made at');
    if (!clean) fail('TREE_DIRTY', 'the working tree is not clean');

    const res = await inspectReservation(ctx.reservationsRoot, 'meta', input.runId);
    if (res.runSpent) fail('RESERVATION_SPENT', 'this run id already has a reservation');
    if (res.lockPresent) fail('LOCK_STALE', 'a reservation lock is present (live or crashed); refusing');
    if (res.slotsSpent >= ctx.liveQuota) fail('QUOTA_EXHAUSTED', 'no unspent quota slot remains');

    return Object.freeze({ runId: rec.runId, approvalId: rec.approvalId, recordSha256: rec.recordSha256, repoSha: rec.repoSha, activationDigest: rec.activationDigest, model: rec.model, inputSha256: rec.inputSha256, expiresAt: rec.expiresAt, decisionReference: decision.reference, synthetic: ctx.kind === 'synthetic' });
  } catch (e) {
    if (e instanceof AuthorizationError) throw e;
    throw new AuthorizationError('INTERNAL', 'authorization failed closed on an unexpected error');
  }
}

export type PreparedAttempt = { authorized: AuthorizedAttempt; claim: Claim };

/**
 * The only sanctioned order for a live attempt:
 *   1. authorize (read-only)  2. consume the approval atomically  3. re-check expiry, activation revision, HEAD, tree and reservation state
 *   4. claim the reservation (run id + quota slot)  5. only then may a provider be called.
 * A crash after 2 spends the approval and nothing else (the operator approves a NEW run id); a crash after 4 leaves a CLAIMED run and a
 * spent slot. Neither is ever released, so no crash can produce an extra billable attempt.
 */
export async function prepareAttemptCore(ctx: TrustContext, input: AuthorizeRequest): Promise<PreparedAttempt> {
  const authorized = await evaluateAuthorizationCore(ctx, input);
  await consumeApproval(ctx.approvalsDir, authorized, input.now);
  const again = await evaluateAuthorizationCore(ctx, input, { afterConsume: true });
  if (again.approvalId !== authorized.approvalId || again.recordSha256 !== authorized.recordSha256) fail('APPROVAL_MISMATCH', 'approval changed between checks');
  try {
    const claim = await ctx.store.claim({ providerId: 'meta', runId: input.runId, quota: ctx.liveQuota });
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
