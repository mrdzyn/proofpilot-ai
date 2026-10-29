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
import { buildProposalRequest, createProposalConsent, PROPOSAL_LABEL, PROPOSAL_LIMITS, META_PROPOSAL_MODEL, type TrustedReproductionFacts } from './patch-proposal.ts';
import { AuthorizationError, DECISION_ID, parseActivationPin, parseDecisionRegister, type GitProbe } from './live-approval.ts';
import { createSyntheticContext } from './live-gate-core.ts';
import { runSyntheticProposalAttempt, scriptedTransport } from './proposal-orchestrator.ts';
import { authorizeProductionAttempt } from './live-gate.ts';
import { confirmationPhrase, runApprovalCli, type ApprovalIo } from './approval-cli.ts';

export const REHEARSAL_LABEL = 'SYNTHETIC REHEARSAL — NOT A GENUINE AUTHORIZATION' as const;
const SYNTHETIC_SHA = 'a'.repeat(40);
const SYNTHETIC_DIGEST = 'e'.repeat(64);
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

export async function runActivationRehearsal(input: { symptom: Symptom; facts: TrustedReproductionFacts; scenario?: MockScenario; checkProduction?: boolean; now?: () => Date }): Promise<RehearsalReport> {
  const scenario = input.scenario ?? 'accepted';
  const now = input.now ?? (() => new Date('2026-10-30T00:00:00.000Z'));
  const steps: RehearsalStep[] = [];
  const step = (id: string, ok: boolean, detail: string) => steps.push({ id, ok, detail });
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pp-rehearsal-'));
  // same layout as the real tree (<root>/.proofpilot/...), so the ancestor checks see a private root even when the system temp dir is shared
  const approvalsDir = path.join(dir, '.proofpilot', 'approvals');
  const reservationsRoot = path.join(dir, '.proofpilot', 'reservations');
  const evidenceRoot = path.join(dir, 'evidence');
  let proposal: RehearsalReport['proposal'] = null;
  let productionValidatorRefusal: string | null = null;
  const runId = 'rehearsal-run-1';
  try {
    const request = buildProposalRequest({ symptom: input.symptom, facts: input.facts });
    step('request-built', request.chars <= PROPOSAL_LIMITS.maxInputChars, `${request.chars} characters; sha256 ${request.inputSha256.slice(0, 12)}…`);

    const register = parseDecisionRegister(JSON.stringify({ schemaVersion: 1, decisions: [{ decisionId: DECISION_ID, status: 'APPROVED', provider: 'meta', model: META_PROPOSAL_MODEL, maxBillableAttempts: 1, maxInputChars: 12_000, maxOutputTokens: 3_072, approvedBy: 'SYNTHETIC-REHEARSAL', approvedAt: '2026-10-30T00:00:00.000Z', reference: 'synthetic: not a real decision', synthetic: true }] }));
    const pin = parseActivationPin(JSON.stringify({ schemaVersion: 1, activation: { decisionId: DECISION_ID, decisionReference: 'synthetic: not a real decision', activationCommit: SYNTHETIC_SHA, activationDigest: SYNTHETIC_DIGEST, recordedBy: 'SYNTHETIC-REHEARSAL', recordedAt: '2026-10-30T00:00:00.000Z', reference: 'synthetic', synthetic: true } }));
    const git: GitProbe = { head: async () => SYNTHETIC_SHA, clean: async () => true, treeDigest: async () => SYNTHETIC_DIGEST, pinOnlyDescent: async () => ({ ok: true }) }; // synthetic repository facts
    // a synthetic context: it can never be used by the production API, and a synthetic quota applies to the temp tree only
    const ctx = createSyntheticContext({ register, pin, git, approvalsDir, reservationsRoot, liveQuota: 1 });
    const code = await runApprovalCli(['--run-id', runId, '--input-sha256', request.inputSha256, '--input-chars', String(request.chars)], {
      io: scriptedTerminal(['SYNTHETIC-REHEARSAL', confirmationPhrase(runId, request.inputSha256)]), ctx, now,
    });
    step('simulated-approval-recorded', code === 0, 'a synthetic, self-declared record in a disposable directory (scripted terminal, synthetic decision)');

    const provider = { id: 'meta' as const, models: { visual: META_PROPOSAL_MODEL } };
    const store = ctx.store;
    if (scenario === 'duplicate-run') await store.claim({ providerId: 'meta', runId, quota: 1 });
    // the whole attempt runs through the synthetic orchestrator (preflight -> authorize/consume/claim -> ONE scripted response -> strict validation -> artifact -> settle)
    const transport = scriptedTransport([mockFor(scenario, META_PROPOSAL_MODEL)]);
    try {
      const out = await runSyntheticProposalAttempt({
        ctx, transport, provider: { ...provider, billableCallsAllowed: true }, runId, consent: createProposalConsent({ runId, providerId: 'meta', inputSha256: request.inputSha256, now }), request, evidenceRoot, now,
      });
      step('authorized-and-reserved', true, `approval consumed, reservation slot ${out.artifact.slot} claimed (synthetic)`);
      proposal = { label: PROPOSAL_LABEL, status: out.status, reason: out.reason, renderedCss: out.artifact.renderedCss, forbiddenClass: out.artifact.forbiddenClass };
      step('mock-response-processed', transport.calls.length === 1, `injected mock (${scenario}) -> ${out.status}; one attempt spent, ${transport.calls.length} scripted request, no retry, no fallback`);
    } catch (e) {
      const expected = scenario === 'duplicate-run' && e instanceof AuthorizationError && e.code === 'RESERVATION_SPENT' && transport.calls.length === 0;
      step('authorized-and-reserved', expected, e instanceof AuthorizationError ? `refused ${e.code}${expected ? ' (expected: a spent run id is never reused; the approval stays unspent)' : ''}` : 'refused');
    }

    // the production path, against the repository's real register, must refuse: nothing is approved
    if (input.checkProduction) {
      try {
        await authorizeProductionAttempt({ runId, request, provider, maxOutputTokens: PROPOSAL_LIMITS.maxOutputTokens });
        step('production-validator-refuses', false, 'the production validator authorized something it must not');
      } catch (e) {
        productionValidatorRefusal = e instanceof AuthorizationError ? e.code : 'ERROR';
        step('production-validator-refuses', e instanceof AuthorizationError && e.code === 'LIVE_NOT_APPROVED', `production validator: ${productionValidatorRefusal} (the repository register holds no approved decision and no activation revision is pinned)`);
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
