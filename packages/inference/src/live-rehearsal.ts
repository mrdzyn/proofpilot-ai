// C3-LIVE-01A: deterministic, ZERO-NETWORK rehearsal of the future activation order, entirely synthetic.
//
//   validated Symptom + trusted F01 facts -> bounded request -> SIMULATED operator approval (scripted terminal, synthetic
//   decision) -> authorization validation -> synthetic reservation claim -> INJECTED mock response -> lifecycle/model checks
//   -> strict proposal validation -> sanitized UNTRUSTED proposal artifact.
//
// It never constructs a provider, never calls fetch, reads no environment or credential, and everything it writes lives in a
// disposable temp directory that is removed afterwards. Nothing here is a genuine authorization: the decision and the approval
// are marked synthetic, which the production validator rejects. Model-derived adjustments stop at the artifact: nothing here
// imports the staging runner or the coordinator, and no VERIFIED value exists in this module.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Symptom } from '../../core/src/index.ts';
import type { ResponseLifecycle, StructuredResponse } from './client.ts';
import {
  buildProposalRequest, failureReason, PROPOSAL_LABEL, PROPOSAL_LIMITS, persistProposalArtifact, processProposalResponse, META_PROPOSAL_MODEL,
  type ProposalArtifact, type TrustedReproductionFacts,
} from './patch-proposal.ts';
import { createReservationStore } from './reservations.ts';
import { authorizeLiveAttempt, AuthorizationError, DECISION_ID, parseDecisionRegister, prepareAttempt, type GitProbe } from './live-approval.ts';
import { confirmationPhrase, runApprovalCli, type ApprovalIo } from './approval-cli.ts';

export const REHEARSAL_LABEL = 'SYNTHETIC REHEARSAL — NOT A GENUINE AUTHORIZATION' as const;
const SYNTHETIC_SHA = 'a'.repeat(40);
const PV1 = JSON.stringify({ adjustments: [{ selector: '.promo-overlay', property: 'pointer-events', value: 'none' }] });

export type MockScenario = 'accepted' | 'refusal' | 'incomplete' | 'missing-status' | 'wrong-model' | 'empty' | 'malformed' | 'forbidden' | 'out-of-grammar' | 'provider-error' | 'duplicate-run';
const mockFor = (s: MockScenario, model: string): StructuredResponse | Error => {
  const lifecycle = (o: Partial<ResponseLifecycle> = {}): ResponseLifecycle => ({ status: 'completed', errorCode: null, incompleteReason: null, refusal: false, completed: true, ...o });
  const base = { providerId: 'mock', model, text: PV1, requestId: 'mock-request', usage: null, lifecycle: lifecycle() };
  switch (s) {
    case 'refusal': return { ...base, lifecycle: lifecycle({ refusal: true, completed: false }) };
    case 'incomplete': return { ...base, lifecycle: lifecycle({ status: 'incomplete', incompleteReason: 'max_output_tokens', completed: false }) };
    case 'missing-status': return { ...base, lifecycle: lifecycle({ status: null }) };
    case 'wrong-model': return { ...base, model: `${model}-preview` };
    case 'empty': return { ...base, text: '' };
    case 'malformed': return { ...base, text: '{"adjustments":[' };
    case 'forbidden': return { ...base, text: '{"adjustments":[],"path":"verifier/x"}' };
    case 'out-of-grammar': return { ...base, text: '{"adjustments":[{"selector":"body","property":"display","value":"none"}]}' };
    case 'provider-error': return new Error('mock transport failure');
    default: return base;
  }
};

export type RehearsalStep = { id: string; ok: boolean; detail: string };
export type RehearsalReport = {
  schemaVersion: 1;
  label: typeof REHEARSAL_LABEL;
  scenario: MockScenario;
  providerRequests: 0;
  realAuthorization: 'NONE';
  steps: RehearsalStep[];
  productionValidatorRefusal: string | null;
  proposal: { label: typeof PROPOSAL_LABEL; status: string; reason: string | null; renderedCss: string | null; forbiddenClass: string | null } | null;
  verified: false;
  providerCalls: 0;
  ok: boolean;
};

/** Scripted stand-in for the terminal (this is what makes it synthetic): it answers the two prompts. */
const scriptedTerminal = (answers: string[]): ApprovalIo => ({ stdinIsTTY: true, stdoutIsTTY: true, ask: async () => answers.shift() ?? '', print: () => undefined });

export async function runActivationRehearsal(input: { symptom: Symptom; facts: TrustedReproductionFacts; scenario?: MockScenario; repoRoot?: string; now?: () => Date }): Promise<RehearsalReport> {
  const scenario = input.scenario ?? 'accepted';
  const now = input.now ?? (() => new Date('2026-10-30T00:00:00.000Z'));
  const steps: RehearsalStep[] = [];
  const step = (id: string, ok: boolean, detail: string) => steps.push({ id, ok, detail });
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pp-rehearsal-'));
  const approvalsDir = path.join(dir, 'approvals');
  const reservationsRoot = path.join(dir, 'reservations');
  const evidenceRoot = path.join(dir, 'evidence');
  let proposal: RehearsalReport['proposal'] = null;
  let productionValidatorRefusal: string | null = null;
  const runId = 'rehearsal-run-1';
  try {
    const request = buildProposalRequest({ symptom: input.symptom, facts: input.facts });
    step('request-built', request.chars <= PROPOSAL_LIMITS.maxInputChars, `${request.chars} characters; sha256 ${request.inputSha256.slice(0, 12)}…`);

    const register = parseDecisionRegister(JSON.stringify({ schemaVersion: 1, decisions: [{ decisionId: DECISION_ID, status: 'APPROVED', provider: 'meta', model: META_PROPOSAL_MODEL, maxBillableAttempts: 1, maxInputChars: 12_000, maxOutputTokens: 3_072, approvedBy: 'SYNTHETIC-REHEARSAL', approvedAt: '2026-10-30T00:00:00.000Z', reference: 'synthetic: not a real decision', synthetic: true }] }));
    const git: GitProbe = { head: async () => SYNTHETIC_SHA, clean: async () => true }; // synthetic repository facts
    const code = await runApprovalCli(['--run-id', runId, '--input-sha256', request.inputSha256, '--input-chars', String(request.chars)], {
      io: scriptedTerminal(['SYNTHETIC-REHEARSAL', confirmationPhrase(runId, request.inputSha256)]), git, register, approvalsDir, reservationsRoot, now, synthetic: true,
    });
    step('simulated-approval-recorded', code === 0, 'a synthetic, self-declared record in a disposable directory (scripted terminal, synthetic decision)');

    const provider = { id: 'meta' as const, models: { visual: META_PROPOSAL_MODEL } };
    const common = { approvalsDir, reservationsRoot, runId, request, provider, maxOutputTokens: PROPOSAL_LIMITS.maxOutputTokens, git, now };
    const store = createReservationStore(reservationsRoot);
    const injected = { register, liveQuota: 1, allowSynthetic: true }; // synthetic quota for the temp tree only
    if (scenario === 'duplicate-run') await store.claim({ providerId: 'meta', runId, quota: 1 });
    let prepared;
    try {
      prepared = await prepareAttempt(common, injected, store);
      step('authorized-and-reserved', true, `approval consumed, reservation slot ${prepared.claim.slot} claimed (synthetic)`);
    } catch (e) {
      const expected = scenario === 'duplicate-run' && e instanceof AuthorizationError && e.code === 'RESERVATION_SPENT';
      step('authorized-and-reserved', expected, e instanceof AuthorizationError ? `refused ${e.code}${expected ? ' (expected: a spent run id is never reused; the approval stays unspent)' : ''}` : 'refused');
    }

    if (prepared) {
      const mock = mockFor(scenario, META_PROPOSAL_MODEL);
      const artifact: ProposalArtifact = {
        schemaVersion: 1, label: PROPOSAL_LABEL, provenance: 'model-hypothesis', runId, providerId: 'meta', requestedModel: META_PROPOSAL_MODEL, respondedModel: null,
        inputSha256: request.inputSha256, outputSha256: null, outputBytes: null, status: 'PROPOSAL_FAILED', reason: null, forbiddenClass: null, adjustments: null, renderedCss: null,
        requestId: null, usage: null, lifecycle: null, limits: PROPOSAL_LIMITS, slot: prepared.claim.slot, createdAt: now().toISOString(),
      };
      if (mock instanceof Error) artifact.reason = failureReason(mock);
      else Object.assign(artifact, processProposalResponse(mock, META_PROPOSAL_MODEL));
      const written = await persistProposalArtifact(artifact, evidenceRoot);
      if (!written) {
        artifact.status = 'PROPOSAL_FAILED';
        artifact.reason = 'ARTIFACT_WRITE_FAILED';
        artifact.adjustments = null;
        artifact.renderedCss = null;
      }
      await store.settle(prepared.claim, { status: artifact.status, reason: artifact.reason });
      proposal = { label: PROPOSAL_LABEL, status: artifact.status, reason: artifact.reason, renderedCss: artifact.renderedCss, forbiddenClass: artifact.forbiddenClass };
      step('mock-response-processed', true, `injected mock (${scenario}) -> ${artifact.status}; one attempt spent, no retry, no fallback`);
    }

    // the production path, against the repository's real register, must refuse: nothing is approved
    if (input.repoRoot) {
      try {
        await authorizeLiveAttempt({ ...common, repoRoot: input.repoRoot, approvalsDir: path.join(dir, 'none') });
        step('production-validator-refuses', false, 'the production validator authorized something it must not');
      } catch (e) {
        productionValidatorRefusal = e instanceof AuthorizationError ? e.code : 'ERROR';
        step('production-validator-refuses', e instanceof AuthorizationError && e.code === 'LIVE_NOT_APPROVED', `production validator: ${productionValidatorRefusal} (the repository register holds no approved decision)`);
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return {
    schemaVersion: 1, label: REHEARSAL_LABEL, scenario, providerRequests: 0, realAuthorization: 'NONE', steps, productionValidatorRefusal, proposal, verified: false, providerCalls: 0,
    ok: steps.every((s) => s.ok),
  };
}
