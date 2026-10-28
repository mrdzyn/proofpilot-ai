// MOCK-ONLY harness for the C3-A proposal flow. It lives under tests/ on purpose: the production entry
// point `proposeCandidate` is hard-disabled while LIVE-C3-01 is unapproved, so this is the only place
// the full flow (pre-flight, reservation, one structured call, response processing, artifact,
// settlement) runs, and only with a provider whose transport the test itself supplies as a mock.
// Nothing under packages/ or scripts/ may import this file (asserted by tests/security).
import {
  failureReason,
  PROPOSAL_LABEL,
  PROPOSAL_LIMITS,
  PROPOSAL_SCHEMA_NAME,
  persistProposalArtifact,
  preflightProposal,
  processProposalResponse,
  ProposalError,
  type BuiltProposalRequest,
  type InferenceProvider,
  type ProposalArtifact,
  type ProposalConsent,
  type ProposalOutcome,
  type ReservationStore,
} from '../../packages/inference/src/index.ts';
import { proposalJsonSchema, type CssAdjustment } from '../../packages/core/src/index.ts';

export type HarnessInput = {
  /** Must be built with a mock `fetch`. */
  provider: InferenceProvider;
  store: ReservationStore;
  runId: string;
  consent: ProposalConsent;
  request: BuiltProposalRequest;
  evidenceRoot: string;
  /** Mock quota; absent or 0 means nothing runs (the default). */
  mockQuota?: number;
  clock?: () => Date;
};

export async function runMockProposalAttempt(input: HarnessInput): Promise<ProposalOutcome> {
  const { provider, store, runId, consent, request } = input;
  const now = input.clock ?? (() => new Date());

  // ---- pre-flight: nothing is reserved and nothing is sent ----
  const { model, providerId } = preflightProposal({ provider, runId, consent, request });
  const quota = input.mockQuota ?? 0;
  if (!Number.isInteger(quota) || quota <= 0) throw new ProposalError('LIVE_NOT_APPROVED', 'no mock quota was granted to this attempt');

  // ---- claim: from here the attempt is spent whatever happens ----
  const claim = await store.claim({ providerId, runId, quota });
  const artifact: ProposalArtifact = {
    schemaVersion: 1, label: PROPOSAL_LABEL, provenance: 'model-hypothesis', runId, providerId, requestedModel: model, respondedModel: null,
    inputSha256: request.inputSha256, outputSha256: null, outputBytes: null, status: 'PROPOSAL_FAILED', reason: null, forbiddenClass: null,
    adjustments: null, renderedCss: null, requestId: null, usage: null, lifecycle: null, limits: PROPOSAL_LIMITS, slot: claim.slot, createdAt: now().toISOString(),
  };
  let adjustments: CssAdjustment[] | null = null;
  try {
    const res = await provider.structuredResponse({ model, prompt: request.prompt, schemaName: PROPOSAL_SCHEMA_NAME, schema: proposalJsonSchema(), maxOutputTokens: PROPOSAL_LIMITS.maxOutputTokens });
    Object.assign(artifact, processProposalResponse(res, model));
    adjustments = artifact.adjustments;
  } catch (e) {
    artifact.status = 'PROPOSAL_FAILED';
    artifact.reason = failureReason(e);
  }
  const artifactPath = await persistProposalArtifact(artifact, input.evidenceRoot);
  if (!artifactPath) {
    artifact.status = 'PROPOSAL_FAILED';
    artifact.reason = 'ARTIFACT_WRITE_FAILED';
    artifact.adjustments = null;
    artifact.renderedCss = null;
    adjustments = null;
  }
  await store.settle(claim, { status: artifact.status, reason: artifact.reason });
  return { label: PROPOSAL_LABEL, status: artifact.status, reason: artifact.reason, adjustments, artifact, artifactPath };
}

