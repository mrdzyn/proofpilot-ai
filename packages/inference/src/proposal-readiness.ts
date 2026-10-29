// C3-B2A zero-network readiness preflight for the first controlled Muse Spark / Baseten proposal.
//
// It checks, deterministically and offline, that every pre-condition a future live activation would rely on
// is in place and that every unsafe path is refused. It never creates a provider, never calls fetch, never
// reads a provider response from anywhere but built-in mock literals, never executes a proposal, and cannot
// authorize anything: the live authorization (LIVE-C3-01) is reported NOT APPROVED by construction.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ResponseLifecycle, StructuredResponse } from './client.ts';
import { loadProviderConfig, PROVIDERS, type ProviderId } from './config.ts';
import { InferenceError } from './errors.ts';
import {
  buildProposalRequest,
  createProposalConsent,
  expectedProposalModel,
  preflightProposal,
  processProposalResponse,
  proposeCandidate,
  PROPOSAL_LABEL,
  PROPOSAL_LIMITS,
  ProposalError,
  type TrustedReproductionFacts,
} from './patch-proposal.ts';
import { APPROVED_LIVE_QUOTA, createReservationStore, listOrphanSlots, ReservationError } from './reservations.ts';
import type { Symptom } from '../../core/src/index.ts';

export type CheckStatus = 'PASS' | 'FAIL' | 'BLOCKED_BY_DESIGN' | 'NOT_CHECKED' | 'INFO';
export type PreflightCheck = { id: string; status: CheckStatus; detail: string };

export type PreflightReport = {
  schemaVersion: 1;
  kind: 'PROPOSAL_PREFLIGHT';
  label: typeof PROPOSAL_LABEL;
  providerId: ProviderId;
  generatedAt: string;
  /** Always 0: this module has no way to make a provider request. */
  providerRequests: 0;
  requestedModel: string | null;
  inputSha256: string | null;
  inputChars: number | null;
  credential: { checked: boolean; present: boolean | null };
  checks: PreflightCheck[];
  technicalChecksPassed: boolean;
  liveAuthorization: 'NOT AUTHORIZED BY THIS REPORT (LIVE-C3-01 owner decision recorded; the production gate decides)';
  liveQuota: number;
  blockers: string[];
  verdict: 'NOT_AUTHORIZED_TECHNICALLY_READY' | 'TECHNICAL_BLOCKERS';
};

export type PreflightInput = {
  providerId: ProviderId;
  env: Record<string, string | undefined>;
  symptom: Symptom;
  facts: TrustedReproductionFacts;
  /** Report only whether a key is present (a boolean). Off by default: it must be explicitly authorized. */
  checkCredentialPresence?: boolean;
  /** Read-only inspection of an existing reservation tree, if the operator wants the counts. */
  reservationRoot?: string;
  now?: () => Date;
  /**
   * Test seams that let a test simulate a REGRESSED repository (an enabled entry point, a raised quota) and
   * prove the preflight reports it. They can only make the report worse: nothing they return authorizes anything.
   */
  inspect?: { entryPoint?: (arg: unknown) => unknown | Promise<unknown>; liveQuota?: Partial<Record<ProviderId, number>> };
};

const PV1 = JSON.stringify({ adjustments: [{ selector: '.promo-overlay', property: 'pointer-events', value: 'none' }] });

function mockResponse(model: string, over: Partial<Omit<StructuredResponse, 'lifecycle'>> & { lifecycle?: Partial<ResponseLifecycle> } = {}): StructuredResponse {
  const { lifecycle, ...rest } = over;
  return {
    providerId: 'mock', model, text: PV1, requestId: 'mock-request', usage: null,
    lifecycle: { status: 'completed', errorCode: null, incompleteReason: null, refusal: false, completed: true, ...lifecycle },
    ...rest,
  };
}

const refuses = async (fn: () => unknown | Promise<unknown>, code: string): Promise<boolean> => {
  try {
    await fn();
    return false;
  } catch (e) {
    return (e instanceof ProposalError || e instanceof ReservationError || e instanceof InferenceError) && e.code === code;
  }
};

export async function runProposalPreflight(input: PreflightInput): Promise<PreflightReport> {
  const checks: PreflightCheck[] = [];
  const add = (id: string, ok: boolean, detail: string, status: CheckStatus = ok ? 'PASS' : 'FAIL') => checks.push({ id, status, detail });
  const { providerId } = input;

  // ---- configuration (never echoes the key; loadProviderConfig errors do not contain it) ----
  let config: ReturnType<typeof loadProviderConfig> | null = null;
  try {
    config = loadProviderConfig(providerId, input.env, { readApiKey: input.checkCredentialPresence === true }); // the key field is read only on explicit opt-in
    add('config-loads', true, `base URL ${config.baseUrl}; host allowlisted; timeout ${config.timeoutMs} ms; maxRetries ${config.maxRetries} (ignored by the proposal path, which always uses 0)`);
  } catch (e) {
    add('config-loads', false, `configuration is invalid: ${e instanceof InferenceError ? e.code : 'error'}`);
  }
  const models = config?.models ?? {};
  let model: string | null = null;
  if (config) {
    try {
      model = expectedProposalModel({ id: providerId, models });
      add('model-pinned', true, `exact model ${JSON.stringify(model)}; no alias, prefix or fallback is accepted`);
    } catch (e) {
      add('model-pinned', false, e instanceof ProposalError ? e.message : 'model check failed');
    }
  }

  // ---- credential presence: a boolean, only when explicitly asked ----
  const credential: PreflightReport['credential'] = { checked: false, present: null };
  if (input.checkCredentialPresence === true) {
    credential.checked = true;
    credential.present = Boolean(config?.apiKey);
    add('credential-presence', credential.present, credential.present ? `${PROVIDERS[providerId].apiKeyEnv} is present (value never read into the report)` : `${PROVIDERS[providerId].apiKeyEnv} is not set`);
  } else {
    add('credential-presence', true, 'not checked (explicit authorization required); no secret is read into this report', 'NOT_CHECKED');
  }
  add('billable-flag', true, config?.billableCallsAllowed ? 'PROOFPILOT_ALLOW_BILLABLE_CALLS=1 is set in this environment (it does not authorize anything)' : 'PROOFPILOT_ALLOW_BILLABLE_CALLS is not set (required at run time, per invocation)', 'INFO');

  // ---- request construction and bounds ----
  let request: ReturnType<typeof buildProposalRequest> | null = null;
  try {
    request = buildProposalRequest({ symptom: input.symptom, facts: input.facts });
    add('request-bounded', request.chars <= PROPOSAL_LIMITS.maxInputChars, `${request.chars} of ${PROPOSAL_LIMITS.maxInputChars} input characters; max ${PROPOSAL_LIMITS.maxOutputTokens} output tokens (reasoning included); sha256 ${request.inputSha256.slice(0, 16)}…`);
  } catch (e) {
    add('request-bounded', false, e instanceof ProposalError ? e.message : 'request could not be built');
  }

  // ---- unsafe paths must refuse (mock literals only) ----
  if (config && model && request) {
    const base = { provider: { id: providerId, models, billableCallsAllowed: true }, runId: 'preflight-run', request };
    const good = createProposalConsent({ runId: 'preflight-run', providerId, inputSha256: request.inputSha256 });
    add('pre-flight-accepts-valid-input', (() => { try { preflightProposal({ ...base, consent: good }); return true; } catch { return false; } })(), 'a fully valid mock input passes pre-flight (this alone does not run anything)');
    const refusals: Array<[string, () => unknown, string]> = [
      ['missing-consent-refused', () => preflightProposal({ ...base, consent: undefined }), 'CONSENT_MISSING'],
      ['foreign-consent-refused', () => preflightProposal({ ...base, consent: createProposalConsent({ runId: 'other-run', providerId, inputSha256: request!.inputSha256 }) }), 'CONSENT_MISMATCH'],
      ['model-mismatch-refused', () => preflightProposal({ ...base, provider: { ...base.provider, models: { visual: providerId === 'meta' ? 'muse-spark-1.2' : 'meta-models/muse-spark-open' } }, consent: good }), 'MODEL_NOT_ALLOWED'],
      ['billable-gate-refused', () => preflightProposal({ ...base, provider: { ...base.provider, billableCallsAllowed: false }, consent: good }), 'BILLABLE_NOT_AUTHORIZED'],
      ['tampered-request-refused', () => preflightProposal({ ...base, request: { ...request!, prompt: `${request!.prompt} tampered` }, consent: good }), 'INVALID_INPUT'],
    ];
    for (const [id, fn, code] of refusals) add(id, await refuses(fn, code), `refused with ${code}`);

    // response handling: only an explicit, complete, exact-model, strictly valid answer can be ACCEPTED; nothing here is executed
    const verdict = (r: StructuredResponse) => processProposalResponse(r, model!).status;
    const mustNotAdvance: Array<[string, StructuredResponse]> = [
      ['missing-status', mockResponse(model, { lifecycle: { status: null, completed: true } })],
      ['failed-status', mockResponse(model, { lifecycle: { status: 'failed', completed: false } })],
      ['incomplete-status', mockResponse(model, { lifecycle: { status: 'incomplete', incompleteReason: 'max_output_tokens', completed: false } })],
      ['refusal', mockResponse(model, { lifecycle: { refusal: true, completed: false } })],
      ['model-mismatch', mockResponse(`${model}-preview`)],
      ['empty-output', mockResponse(model, { text: '' })],
      ['malformed-json', mockResponse(model, { text: '{"adjustments":[' })],
      ['forbidden-content', mockResponse(model, { text: '{"adjustments":[],"path":"verifier/x"}' })],
      ['unknown-key', mockResponse(model, { text: '{"adjustments":[],"note":"hi"}' })],
      ['out-of-grammar', mockResponse(model, { text: '{"adjustments":[{"selector":"body","property":"display","value":"none"}]}' })],
    ];
    for (const [id, r] of mustNotAdvance) add(`response-${id}-cannot-advance`, verdict(r) !== 'PROPOSAL_ACCEPTED', `classified ${verdict(r)}`);
    add('response-valid-is-only-an-untrusted-proposal', verdict(mockResponse(model)) === 'PROPOSAL_ACCEPTED', `a valid mock answer is ${PROPOSAL_LABEL}; it is never handed to execution`);

    // quota and reservations on a throw-away tree
    const dir = await mkdtemp(path.join(os.tmpdir(), 'pp-preflight-'));
    try {
      const store = createReservationStore(dir);
      add('quota-zero-refused', await refuses(() => store.claim({ providerId, runId: 'q0', quota: 0 }), 'QUOTA_EXHAUSTED'), 'a zero quota never claims');
      await store.claim({ providerId, runId: 'q1', quota: 1 });
      add('duplicate-run-refused', await refuses(() => store.claim({ providerId, runId: 'q1', quota: 1 }), 'RUN_ID_SPENT'), 'a spent run id is refused');
      add('exhausted-quota-refused', await refuses(() => store.claim({ providerId, runId: 'q2', quota: 1 }), 'QUOTA_EXHAUSTED'), 'a spent slot is never recycled');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  // ---- the production entry point and the live quota ----
  // Only a MALFORMED call is made here, and it can never get past input validation, so this check can never reach the gate or a provider.
  add('entry-point-rejects-malformed-calls', await refuses(() => (input.inspect?.entryPoint ?? proposeCandidate)({ runId: '', request: undefined } as never), 'INVALID_INPUT'), 'proposeCandidate() rejects a malformed call before the gate, a credential or a provider is touched');
  const liveQuota = input.inspect?.liveQuota?.[providerId] ?? APPROVED_LIVE_QUOTA[providerId];
  const quotaOk = liveQuota === APPROVED_LIVE_QUOTA[providerId] && (providerId === 'meta' ? liveQuota === 1 : liveQuota === 0);
  add('live-quota-is-the-approved-constant', quotaOk, `APPROVED_LIVE_QUOTA.${providerId} = ${liveQuota} (a code constant: a lifetime total, not per run; a positive value authorizes nothing without the pinned revision, an operator approval and a credential)`, quotaOk ? (liveQuota === 0 ? 'BLOCKED_BY_DESIGN' : 'INFO') : 'FAIL');
  add('model-proposals-not-executable', true, 'model-derived adjustments are not connected to the staging runner or the offline coordinator in C3-B2A', 'BLOCKED_BY_DESIGN');

  if (input.reservationRoot) {
    const orphans = await listOrphanSlots(input.reservationRoot, providerId).catch(() => []);
    add('reservation-state', true, `${orphans.length} orphan slot(s) in the supplied reservation tree (read-only; never recycled)`, 'INFO');
  }

  const technicalChecksPassed = checks.every((c) => c.status !== 'FAIL');
  const blockers = [
    'this preflight never authorizes anything: the production gate (owner-pinned activation revision, clean tree, single-use operator approval for the exact run and input hash, credential) is evaluated separately and read-only',
    ...checks.filter((c) => c.status === 'FAIL').map((c) => `technical: ${c.id}`),
  ];
  return {
    schemaVersion: 1,
    kind: 'PROPOSAL_PREFLIGHT',
    label: PROPOSAL_LABEL,
    providerId,
    generatedAt: (input.now?.() ?? new Date()).toISOString(),
    providerRequests: 0,
    requestedModel: model,
    inputSha256: request?.inputSha256 ?? null,
    inputChars: request?.chars ?? null,
    credential,
    checks,
    technicalChecksPassed,
    liveAuthorization: 'NOT AUTHORIZED BY THIS REPORT (LIVE-C3-01 owner decision recorded; the production gate decides)',
    liveQuota,
    blockers,
    verdict: technicalChecksPassed ? 'NOT_AUTHORIZED_TECHNICALLY_READY' : 'TECHNICAL_BLOCKERS',
  };
}
