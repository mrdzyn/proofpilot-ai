// C3-LIVE-01B0: the proposal attempt orchestration, runnable ONLY against a synthetic trust context and a scripted (data-only) transport.
//
//   (validated Symptom + trusted F01 facts -> bounded request, built by the caller)
//   -> preflightProposal (pure; consent shape, pinned model, billable gate)              nothing is spent if it refuses
//   -> gate.prepare: authorize -> consume the approval atomically -> re-check -> claim the reservation
//   -> ONE structured response request (retries 0, no fallback)                          from here the attempt is spent whatever happens
//   -> processProposalResponse (lifecycle, exact model, strict closed-grammar parser)
//   -> persist a sanitized `UNTRUSTED PROPOSAL — NOT VERIFIED` artifact (never raw provider text)
//   -> settle the reservation -> STOP.  Nothing here stages, runs or verifies a proposal.
//
// `runSyntheticProposalAttempt` refuses a production context and any transport that is not a `scriptedTransport` (a closure over canned
// data: it has no fetch, no credential and no provider). The sibling `runProductionProposalAttempt` (C3-LIVE-01B-PREP) is DORMANT: it
// uses the production gate (live-gate.ts, never the injectable core), takes only a run id and the bounded request, and shares the same
// private tail. Nothing exported here is reachable from the hard-disabled production proposal entry point, and the tail is
// module-private so it cannot be driven with an arbitrary caller-supplied function and an unchecked reservation.
import { proposalJsonSchema, type CssAdjustment } from '../../core/src/index.ts';
import { InferenceError } from './errors.ts';
import type { StructuredRequest, StructuredResponse } from './client.ts';
import {
  createProposalConsent, failureReason, PROPOSAL_LABEL, PROPOSAL_LIMITS, PROPOSAL_SCHEMA_NAME, persistProposalArtifact, preflightProposal, processProposalResponse, ProposalError,
  type BuiltProposalRequest, type ProposalArtifact, type ProposalConsent, type ProposalOutcome,
} from './patch-proposal.ts';
import { prepareAttemptCore, type PreparedAttempt, type TrustContext } from './live-gate-core.ts';
import { authorizeProductionAttempt, prepareProductionAttempt, productionEvidenceRoot, settleProductionAttempt } from './live-gate.ts';
import { openMetaProposalCall, readMetaProposalDescriptor } from './meta-proposal-transport.ts';

// ------------------------------------------------------------------ scripted transport (data only)

export type ScriptedOutcome = StructuredResponse | Error | { crash: true };
const SCRIPTED = new WeakSet<object>();
export type ScriptedTransport = Readonly<{ kind: 'scripted'; calls: StructuredRequest[]; call(req: StructuredRequest): Promise<StructuredResponse> }>;

/**
 * A transport that answers from a fixed list of canned outcomes (a response, an error to throw, or a simulated process death). It makes
 * no network request, reads no environment and holds no credential. It answers at most once per queued outcome and records the request it
 * was handed so tests can assert the exact request contract. Anything beyond the script fails (there is never a retry or fallback).
 */
export function scriptedTransport(outcomes: ScriptedOutcome[]): ScriptedTransport {
  const queue = [...outcomes];
  const calls: StructuredRequest[] = [];
  const t: ScriptedTransport = Object.freeze({
    kind: 'scripted' as const,
    calls,
    async call(req: StructuredRequest) {
      calls.push(req);
      const next = queue.shift();
      if (next === undefined) throw new InferenceError('NETWORK', 'scripted', 'no scripted outcome left');
      if (next instanceof Error) throw next;
      if ('crash' in next) throw new CrashSignal();
      return next;
    },
  });
  SCRIPTED.add(t);
  return t;
}
/** Simulated process death while a call is in flight; the orchestrator must treat it as an uncertain, spent attempt. */
export class CrashSignal extends Error {
  constructor() {
    super('simulated crash');
    this.name = 'CrashSignal';
  }
}

// ------------------------------------------------------------------ the synthetic runner

export type ProviderDescriptor = { id: string; models: { visual?: string }; billableCallsAllowed: boolean };
export type SyntheticStep = 'after-preflight' | 'after-prepare' | 'after-call' | 'after-persist';
export type SyntheticAttempt = {
  ctx: TrustContext;
  transport: ScriptedTransport;
  provider: ProviderDescriptor;
  runId: string;
  consent: ProposalConsent;
  request: BuiltProposalRequest;
  evidenceRoot: string;
  now?: () => Date;
  /** Test-only crash injection: throw from here to simulate the process dying at that boundary. */
  onStep?: (step: SyntheticStep) => void | Promise<void>;
};
export type AttemptOutcome = ProposalOutcome & { synthetic: boolean; settled: boolean };

export async function runSyntheticProposalAttempt(a: SyntheticAttempt): Promise<AttemptOutcome> {
  // the synthetic runner can never be pointed at production trust or a real transport
  if (a.ctx?.kind !== 'synthetic') throw new ProposalError('LIVE_NOT_APPROVED', 'the synthetic runner only accepts a synthetic trust context');
  if (!a.transport || !SCRIPTED.has(a.transport)) throw new ProposalError('LIVE_NOT_APPROVED', 'the synthetic runner only accepts a scripted transport');
  const now = a.now ?? (() => new Date());

  // 1. pure pre-flight: nothing is consumed or reserved if it refuses
  const { model, providerId } = preflightProposal({ provider: a.provider, runId: a.runId, consent: a.consent, request: a.request });
  await a.onStep?.('after-preflight');

  // 2. authorize -> consume -> re-check -> claim (the shared core; a production runner uses prepareProductionAttempt instead)
  const prepared = await prepareAttemptCore(a.ctx, { runId: a.runId, request: a.request, provider: { id: providerId, models: { visual: model } }, maxOutputTokens: PROPOSAL_LIMITS.maxOutputTokens, now });
  await a.onStep?.('after-prepare');

  return finishAttempt({
    prepared, settle: (info) => a.ctx.store.settle(prepared.claim, info), request: a.request, runId: a.runId, model, providerId, evidenceRoot: a.evidenceRoot, now,
    call: (req) => a.transport.call(req), onStep: a.onStep,
  });
}

// ------------------------------------------------------------------ the production runner (DORMANT)

export type ProductionProposalAttempt = { runId: string; request: BuiltProposalRequest };

/**
 * The future production attempt. DORMANT: nothing imports or calls it (a static test pins that), the owner-operated CLI that would
 * is not part of this milestone, and the hard-disabled production proposal entry point never reaches it. Even if something called it
 * today it would stop at the read-only authorization step (empty decision register, empty activation pin, live quota 0), before any
 * credential is read or any provider is built.
 *
 * It accepts only the two facts about the attempt (run id and the bounded request). It has NO parameter for a provider, transport, key,
 * root, store, Git probe, clock, evidence directory or consent: all of those are derived inside, and the trust is derived by
 * live-gate.ts (never the injectable core).
 *   1. pure pre-flight with the credential-free Meta descriptor (billable flag, pinned model, input bounds, hash)
 *   2. authorizeProductionAttempt        read-only; every gate must pass; no credential has been read yet
 *   3. openMetaProposalCall              reads the key and builds the provider; no request; a missing key fails HERE, before anything is spent
 *   4. prepareProductionAttempt          consume the single-use approval, re-check, claim the reservation
 *   5. the shared tail                   exactly one request, strict validation, sanitized artifact, settlement, STOP
 */
export async function runProductionProposalAttempt(attempt: ProductionProposalAttempt): Promise<AttemptOutcome> {
  const runId = attempt?.runId;
  const request = attempt?.request;
  const now = () => new Date();
  const descriptor = readMetaProposalDescriptor();
  const consent = createProposalConsent({ runId, providerId: 'meta', inputSha256: request?.inputSha256, now });
  const { model, providerId } = preflightProposal({ provider: descriptor, runId, consent, request });
  const facts = { runId, request, provider: { id: providerId, models: { visual: model } }, maxOutputTokens: PROPOSAL_LIMITS.maxOutputTokens };

  await authorizeProductionAttempt(facts);
  const call = openMetaProposalCall();
  const prepared = await prepareProductionAttempt(facts);

  return finishAttempt({
    prepared, settle: (info) => settleProductionAttempt(prepared, info), request, runId, model, providerId, evidenceRoot: productionEvidenceRoot(), now, call,
  });
}

// ------------------------------------------------------------------ the shared tail (module-private on purpose)

type Tail = {
  prepared: PreparedAttempt;
  settle: (info: { status: string; reason: string | null }) => Promise<boolean>;
  request: BuiltProposalRequest;
  runId: string;
  model: string;
  providerId: 'meta' | 'baseten';
  evidenceRoot: string;
  now: () => Date;
  call: (req: StructuredRequest) => Promise<StructuredResponse>;
  onStep?: (step: SyntheticStep) => void | Promise<void>;
};

/**
 * Everything after the reservation is claimed. The attempt is already spent: no outcome releases, retries or falls back. Exactly one
 * request is made. Only sanitized fields reach the artifact: typed failure codes (never exception text), hashes, lifecycle, usage and,
 * only when the strict parser accepted it, host-validated adjustments. Raw provider text is never stored.
 */
async function finishAttempt(t: Tail): Promise<AttemptOutcome> {
  const { claim } = t.prepared;
  const artifact: ProposalArtifact = {
    schemaVersion: 1, label: PROPOSAL_LABEL, provenance: 'model-hypothesis', runId: t.runId, providerId: t.providerId, requestedModel: t.model, respondedModel: null,
    inputSha256: t.request.inputSha256, outputSha256: null, outputBytes: null, status: 'PROPOSAL_FAILED', reason: null, forbiddenClass: null,
    adjustments: null, renderedCss: null, requestId: null, usage: null, lifecycle: null, limits: PROPOSAL_LIMITS, slot: claim.slot, createdAt: t.now().toISOString(),
  };
  let adjustments: CssAdjustment[] | null = null;
  let crashed = false;
  let res: StructuredResponse | null = null;
  try {
    res = await t.call({ model: t.model, prompt: t.request.prompt, schemaName: PROPOSAL_SCHEMA_NAME, schema: proposalJsonSchema(), maxOutputTokens: PROPOSAL_LIMITS.maxOutputTokens });
  } catch (e) {
    crashed = e instanceof CrashSignal;
    artifact.status = 'PROPOSAL_FAILED';
    artifact.reason = crashed ? 'UNCERTAIN_COMPLETION' : failureReason(e);
    artifact.adjustments = null;
    artifact.renderedCss = null;
  }
  if (crashed) {
    // the process "died" mid-call: no artifact, no settlement. The claim stays CLAIMED and the attempt stays spent.
    throw new CrashSignal();
  }
  await t.onStep?.('after-call'); // test-only crash point: the response exists but nothing is recorded yet
  if (res) {
    try {
      Object.assign(artifact, processProposalResponse(res, t.model));
      adjustments = artifact.adjustments;
    } catch {
      artifact.status = 'PROPOSAL_FAILED';
      artifact.reason = 'UNEXPECTED_ERROR';
      artifact.adjustments = null;
      artifact.renderedCss = null;
    }
  }
  let artifactPath: string | null = null;
  try {
    artifactPath = await persistProposalArtifact(artifact, t.evidenceRoot);
  } catch {
    artifactPath = null;
  }
  if (!artifactPath) {
    artifact.status = 'PROPOSAL_FAILED';
    artifact.reason = 'ARTIFACT_WRITE_FAILED';
    artifact.adjustments = null;
    artifact.renderedCss = null;
    adjustments = null;
  }
  await t.onStep?.('after-persist');
  let settled = false;
  try {
    settled = await t.settle({ status: artifact.status, reason: artifact.reason });
  } catch {
    settled = false; // best effort by design: a failed settlement leaves the claim spent, never released
  }
  return { label: PROPOSAL_LABEL, status: artifact.status, reason: artifact.reason, adjustments, artifact, artifactPath, synthetic: t.prepared.authorized.synthetic, settled };
}
