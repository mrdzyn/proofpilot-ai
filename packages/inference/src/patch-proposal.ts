// C3-A Muse Spark candidate-proposal building blocks (mock-tested only; LIVE-C3-01 is NOT approved).
//
// symptom (untrusted) + trusted F01 facts -> bounded deterministic prompt -> ONE structured
// generation -> lifecycle/model checks -> strict local validation -> an UNTRUSTED PROPOSAL artifact.
// Nothing here executes a proposal, imports the staging runner, or can produce VERIFIED.
//
// The production entry point `proposeCandidate` is HARD-DISABLED while LIVE-C3-01 is unapproved: it
// rejects before touching any provider object, reservation or file. The pure pieces below (pre-flight,
// response processing, artifact persistence) are what a separately approved live commit would wire
// together, and what the mock-only test harness (kept under tests/, never imported here) exercises today.
// The pure provenance pieces (trusted facts, request builder) moved to the neutral Zone P module and are
// re-exported above; they are no longer defined here.
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseProposal, proposalJsonSchema, type CssAdjustment, type ForbiddenClass } from '../../core/src/index.ts';
import { isValidRunId } from '../../intake/src/consent.ts';
// C3-B2B P1: the pure provenance pieces (error, limits, trusted facts, request builder) moved unchanged into
// the neutral Zone P read-only module below; they are re-exported here so this module's API is unchanged.
import { buildProposalRequest, PROPOSAL_LIMITS, ProposalError, trustedFactsFromBaseline } from '../../provenance/src/provenance-input.ts';
import type { BuiltProposalRequest, ProposalErrorCode, TrustedReproductionFacts } from '../../provenance/src/provenance-input.ts';

export { buildProposalRequest, PROPOSAL_LIMITS, ProposalError, trustedFactsFromBaseline };
export type { BuiltProposalRequest, ProposalErrorCode, TrustedReproductionFacts };
import { PROVIDERS } from './config.ts';
import { InferenceError } from './errors.ts';
import type { InferenceProvider, ResponseLifecycle, StructuredResponse, VideoUsage } from './client.ts';
import { APPROVED_LIVE_QUOTA } from './reservations.ts';

export const PROPOSAL_LABEL = 'UNTRUSTED PROPOSAL — NOT VERIFIED' as const;
export const PROPOSAL_SCHEMA_NAME = 'proofpilot_css_proposal';
/** The exact Meta model; no alias, prefix or fallback. */
export const META_PROPOSAL_MODEL = 'muse-spark-1.3';

// ---------------------------------------------------------------- consent

export const PROPOSAL_CONSENT_SCOPE = 'c3-candidate-proposal' as const;
export type ProposalConsent = {
  granted: true;
  scope: typeof PROPOSAL_CONSENT_SCOPE;
  runId: string;
  providerId: string;
  inputSha256: string;
  grantedAt: string;
};
/** Build a consent record from an explicit opt-in. Never call this on the user's behalf. */
export function createProposalConsent(input: { runId: string; providerId: string; inputSha256: string; now?: () => Date }): ProposalConsent {
  if (!isValidRunId(input.runId) || !/^[0-9a-f]{64}$/.test(input.inputSha256) || !/^[a-z][a-z0-9-]{0,31}$/.test(input.providerId)) {
    throw new ProposalError('INVALID_INPUT', 'consent fields are malformed');
  }
  return { granted: true, scope: PROPOSAL_CONSENT_SCOPE, runId: input.runId, providerId: input.providerId, inputSha256: input.inputSha256, grantedAt: (input.now?.() ?? new Date()).toISOString() };
}
function assertProposalConsent(c: unknown, expected: { runId: string; providerId: string; inputSha256: string }): void {
  const x = c as Partial<ProposalConsent> | null;
  if (!x || typeof x !== 'object' || x.granted !== true || x.scope !== PROPOSAL_CONSENT_SCOPE) throw new ProposalError('CONSENT_MISSING', 'explicit per-run consent is required');
  if (x.runId !== expected.runId || x.providerId !== expected.providerId || x.inputSha256 !== expected.inputSha256) {
    throw new ProposalError('CONSENT_MISMATCH', 'consent is bound to a different run, provider or input');
  }
}

// (C3-B2B P1: the trusted-facts mapping and the deterministic request builder now live in the neutral
// Zone P module `packages/provenance/src/provenance-input.ts`; this file re-exports them unchanged.)

// ---------------------------------------------------------------- adapter pieces

/** True when the request's hash is the SHA-256 of its prompt (recomputed, not trusted). */
export function buildProposalRequestHashOk(request: BuiltProposalRequest): boolean {
  return typeof request?.prompt === 'string' && request.fixtureId === 'F01' && createHash('sha256').update(request.prompt, 'utf8').digest('hex') === request.inputSha256;
}

export type ProposalStatus = 'PROPOSAL_ACCEPTED' | 'PROPOSAL_REJECTED' | 'PROPOSAL_BLOCKED' | 'PROPOSAL_FAILED';

export type ProposalArtifact = {
  schemaVersion: 1;
  label: typeof PROPOSAL_LABEL;
  provenance: 'model-hypothesis';
  runId: string;
  providerId: string;
  requestedModel: string;
  respondedModel: string | null;
  inputSha256: string;
  outputSha256: string | null;
  outputBytes: number | null;
  status: ProposalStatus;
  reason: string | null;
  forbiddenClass: ForbiddenClass | null;
  /** Host-validated values only (present when accepted). The raw model text is never stored. */
  adjustments: CssAdjustment[] | null;
  renderedCss: string | null;
  requestId: string | null;
  usage: VideoUsage | null;
  lifecycle: ResponseLifecycle | null;
  limits: typeof PROPOSAL_LIMITS;
  slot: number;
  createdAt: string;
};

export type ProposalOutcome = {
  label: typeof PROPOSAL_LABEL;
  status: ProposalStatus;
  reason: string | null;
  adjustments: CssAdjustment[] | null;
  artifact: ProposalArtifact;
  artifactPath: string | null;
};

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,100}$/;

/** The exact model a provider may be asked for; throws for anything else. */
export function expectedProposalModel(provider: Pick<InferenceProvider, 'id' | 'models'>): string {
  if (provider.id === 'meta') {
    if (provider.models.visual !== META_PROPOSAL_MODEL) throw new ProposalError('MODEL_NOT_ALLOWED', `the Meta proposal model must be exactly ${META_PROPOSAL_MODEL}`);
    return META_PROPOSAL_MODEL;
  }
  if (provider.id === 'baseten') {
    const pinned = PROVIDERS.baseten.models.visual!.default;
    if (provider.models.visual !== pinned) throw new ProposalError('MODEL_NOT_ALLOWED', 'the Baseten model must be the repository-pinned versioned id');
    return pinned;
  }
  throw new ProposalError('INVALID_INPUT', 'unknown provider');
}

/**
 * Pure pre-flight checks that need no reservation and no network: input integrity and bounds, pinned
 * model, per-run consent and the billable gate. Throws ProposalError. Does NOT decide quota.
 */
export function preflightProposal(input: { provider: Pick<InferenceProvider, 'id' | 'models' | 'billableCallsAllowed'>; runId: string; consent: unknown; request: BuiltProposalRequest }): { model: string; providerId: 'meta' | 'baseten' } {
  const { provider, runId, consent, request } = input;
  if (!isValidRunId(runId)) throw new ProposalError('INVALID_INPUT', 'run id is malformed');
  if (!request || typeof request.prompt !== 'string' || request.prompt.length === 0 || request.fixtureId !== 'F01') throw new ProposalError('INVALID_INPUT', 'the request was not built by buildProposalRequest');
  if (createHash('sha256').update(request.prompt, 'utf8').digest('hex') !== request.inputSha256) throw new ProposalError('INVALID_INPUT', 'request hash does not match its prompt');
  if (request.prompt.length > PROPOSAL_LIMITS.maxInputChars) throw new ProposalError('BOUNDS', `input exceeds ${PROPOSAL_LIMITS.maxInputChars} characters`);
  const model = expectedProposalModel(provider);
  assertProposalConsent(consent, { runId, providerId: provider.id, inputSha256: request.inputSha256 });
  if (!provider.billableCallsAllowed) throw new ProposalError('BILLABLE_NOT_AUTHORIZED', 'billable inference is not enabled');
  return { model, providerId: provider.id as 'meta' | 'baseten' };
}

const LIFECYCLE_STATUSES = new Set(['completed', 'failed', 'in_progress', 'cancelled', 'queued', 'incomplete']);
const MACHINE_CODE = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;
// a segment that names a credential-shaped value (sk-..., Bearer ..., key/secret/token/password) is never a machine code
const SECRET_SHAPE = /(^|[^A-Za-z0-9])(sk|pk|key|secret|token|bearer|password|passwd|authorization)([^A-Za-z0-9]|$)/i;
const MAX_TOKEN_COUNT = 1_000_000_000;
const INVALID_CODE = 'INVALID_CODE';

function safeCount(v: unknown): number | null {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= MAX_TOKEN_COUNT ? v : null;
}

/** A short machine code or null. Anything else (free text, secret-shaped, oversized, non-string) becomes INVALID_CODE so a bad code can never read as "no error". */
function safeCode(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return typeof v === 'string' && MACHINE_CODE.test(v) && !SECRET_SHAPE.test(v) ? v : INVALID_CODE;
}

/** Fresh usage object from the five documented counters only; unknown keys are dropped, malformed numbers become null. */
export function sanitizeUsage(u: unknown): VideoUsage | null {
  if (u === null || typeof u !== 'object' || Array.isArray(u)) return null;
  const r = u as Record<string, unknown>;
  return {
    inputTokens: safeCount(r.inputTokens),
    outputTokens: safeCount(r.outputTokens),
    totalTokens: safeCount(r.totalTokens),
    reasoningTokens: safeCount(r.reasoningTokens),
    videoFramesProcessed: safeCount(r.videoFramesProcessed),
  };
}

/**
 * Fresh lifecycle object from the five documented fields only. Fails closed: an unknown status becomes null, a malformed error or
 * incomplete code becomes INVALID_CODE, and a refusal or completed flag that is not a literal boolean reads as refusal / not completed.
 */
export function sanitizeLifecycle(l: unknown): ResponseLifecycle | null {
  if (l === null || typeof l !== 'object' || Array.isArray(l)) return null;
  const r = l as Record<string, unknown>;
  return {
    status: typeof r.status === 'string' && LIFECYCLE_STATUSES.has(r.status) ? r.status : null,
    errorCode: safeCode(r.errorCode),
    incompleteReason: safeCode(r.incompleteReason),
    refusal: r.refusal !== false,
    completed: r.completed === true,
  };
}

export type ProcessedResponse = Pick<ProposalArtifact, 'respondedModel' | 'requestId' | 'usage' | 'lifecycle' | 'outputSha256' | 'outputBytes' | 'status' | 'reason' | 'forbiddenClass' | 'adjustments' | 'renderedCss'>;

/**
 * Pure: turn a provider response into artifact fields. Only an EXPLICIT `status: "completed"` (no
 * error, incomplete_details or refusal), the exact requested model and non-empty output can reach the
 * strict parser. No I/O, no provider call.
 */
export function processProposalResponse(res: StructuredResponse, model: string): ProcessedResponse {
  const lifecycle = sanitizeLifecycle(res.lifecycle);
  const out: ProcessedResponse = {
    respondedModel: typeof res.model === 'string' && /^[A-Za-z0-9._/-]{1,128}$/.test(res.model) && !SECRET_SHAPE.test(res.model) ? res.model : null,
    requestId: typeof res.requestId === 'string' && REQUEST_ID.test(res.requestId) && !SECRET_SHAPE.test(res.requestId) ? res.requestId : null,
    usage: sanitizeUsage(res.usage),
    lifecycle,
    outputSha256: null,
    outputBytes: null,
    status: 'PROPOSAL_FAILED',
    reason: null,
    forbiddenClass: null,
    adjustments: null,
    renderedCss: null,
  };
  if (!lifecycle || lifecycle.completed !== true || lifecycle.status !== 'completed' || lifecycle.errorCode !== null || lifecycle.incompleteReason !== null || lifecycle.refusal) {
    out.reason = 'RESPONSE_NOT_COMPLETED';
  } else if (res.model !== model) {
    out.reason = 'MODEL_MISMATCH';
  } else if (typeof res.text !== 'string' || res.text.trim().length === 0) {
    out.reason = 'EMPTY_OUTPUT';
  } else {
    const parsed = parseProposal(res.text);
    out.outputSha256 = parsed.rawSha256;
    out.outputBytes = parsed.rawBytes;
    if (parsed.ok) {
      out.status = 'PROPOSAL_ACCEPTED';
      out.adjustments = parsed.adjustments;
      out.renderedCss = parsed.renderedCss;
    } else {
      out.status = parsed.status === 'SECURITY_BLOCKED' ? 'PROPOSAL_BLOCKED' : 'PROPOSAL_REJECTED';
      out.reason = parsed.reason;
      out.forbiddenClass = parsed.forbiddenClass;
    }
  }
  return out;
}

/** Reason code for a provider failure: only the typed code, never the message (it may echo provider text). */
export function failureReason(e: unknown): string {
  return e instanceof InferenceError ? `PROVIDER_${e.code}` : 'UNEXPECTED_ERROR';
}

/** Write the untrusted artifact exclusively (0600) under <evidenceRoot>/proposals/<runId>/. Returns its path, or null on failure. */
export async function persistProposalArtifact(artifact: ProposalArtifact, evidenceRoot: string): Promise<string | null> {
  try {
    const dir = path.join(evidenceRoot, 'proposals', artifact.runId);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const file = path.join(dir, 'proposal.json');
    await writeFile(file, JSON.stringify(artifact, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return file;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- production entry point (gated)

export type ProposeCandidateInput = { runId: string; request: BuiltProposalRequest };

/**
 * Production proposal entry point (LIVE-C3-01, owner-approved October 29, 2026). It delegates to exactly one thing,
 * `runProductionProposalAttempt`, and reads exactly two fields of its argument. It has no other path: no caller-supplied root,
 * provider, transport, Git probe, store, credential, quota, clock, evidence directory or consent is ever consulted. Whether anything
 * happens is decided by the production gate (live-gate.ts), which refuses unless the register decision, the owner-pinned activation
 * revision, a clean tree at that revision, a single-use operator approval for this run and input, and the quota all hold; the empty
 * activation pin alone makes this reject before any credential is read, approval consumed, reservation made or request sent.
 * The module is loaded lazily to keep the import graph acyclic.
 */
export async function proposeCandidate(input: ProposeCandidateInput): Promise<ProposalOutcome & { synthetic: boolean; settled: boolean }> {
  const { runProductionProposalAttempt } = await import('./proposal-orchestrator.ts');
  return runProductionProposalAttempt({ runId: input?.runId, request: input?.request });
}
