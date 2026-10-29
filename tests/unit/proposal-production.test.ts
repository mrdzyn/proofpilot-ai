// C3-LIVE-01B-PREP: the dormant production proposal runner and its zero-argument Meta transport. Mock fetch only; the global fetch is
// trapped, no real credential is used (only the repository's sentinel test key), and nothing here can authorize anything: the real
// repository has an empty decision register, an empty activation pin and a live quota of 0.
import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseSymptom } from '../../packages/core/src/index.ts';
import { APPROVED_LIVE_QUOTA, buildProposalRequest, InferenceError, META_PROPOSAL_MODEL, ProposalError, trustedFactsFromBaseline } from '../../packages/inference/src/index.ts';
import { openMetaProposalCall, readMetaProposalDescriptor } from '../../packages/inference/src/meta-proposal-transport.ts';
import { runProductionProposalAttempt } from '../../packages/inference/src/proposal-orchestrator.ts';
import { json, responsesOk, SENTINEL_KEY, validSymptom } from '../helpers.ts';
import { expectedGateCode } from '../support/real-gate.ts';

const REAL_ROOT = path.resolve(import.meta.dirname, '../..');
const realFetch = globalThis.fetch;
const realEnv = process.env;
let fetchCalls: { url: string; init: RequestInit }[] = [];
let queue: Array<Response | Error> = [];
let keyReads = 0;
const KEY_NAMES = ['MODEL_API_KEY', 'BASETEN_API_KEY'];

const PV1 = JSON.stringify({ adjustments: [{ selector: '.promo-overlay', property: 'pointer-events', value: 'none' }] });
const request = buildProposalRequest({ symptom: parseSymptom(validSymptom(), { videoDurationSec: 10 }), facts: trustedFactsFromBaseline({ viewport: { width: 390, height: 844 }, tapPoint: { x: 1, y: 1 }, hitTestTarget: 'promo-overlay', cartCountBefore: '0', cartCountAfter: '0' }, true) });

/** An env whose credential fields are spied on: reading any key name is counted. */
function spyEnv(values: Record<string, string>) {
  return new Proxy({ ...values } as Record<string, string | undefined>, {
    get(t, k) {
      if (typeof k === 'string' && KEY_NAMES.includes(k)) keyReads++;
      return t[k as string];
    },
  });
}
const setEnv = (values: Record<string, string>) => {
  process.env = spyEnv({ PATH: realEnv.PATH ?? '', ...values }) as NodeJS.ProcessEnv;
};

before(() => {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    fetchCalls.push({ url: String(url), init });
    const next = queue.shift();
    if (!next) throw new Error('unexpected network request');
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
});
beforeEach(() => {
  fetchCalls = [];
  queue = [];
  keyReads = 0;
});
afterEach(() => {
  process.env = realEnv;
});

const stateOfRealRepo = () => ['approvals', 'reservations', 'evidence'].map((d) => { const p = path.join(REAL_ROOT, '.proofpilot', d); return existsSync(p) ? readdirSync(p).sort().join(',') : null; });
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'NO_ERROR';
  } catch (e) {
    return e instanceof ProposalError ? `P:${e.code}` : e instanceof InferenceError ? `I:${e.code}` : `${(e as { code?: string }).code ?? (e as Error).message}`;
  }
};

// ---------------------------------------------------------------- dormancy against the REAL repository

test('with positive quota and the registered decision, the real checkout stops at authorization with the exact code of its pin state (unpinned: ACTIVATION_NOT_PINNED; validly pinned without an operator approval: APPROVAL_MISSING): no credential read, no network, no reservation, no approval touched', async () => {
  assert.deepEqual({ ...APPROVED_LIVE_QUOTA }, { meta: 1, baseten: 0 });
  setEnv({ MODEL_API_KEY: SENTINEL_KEY, PROOFPILOT_ALLOW_BILLABLE_CALLS: '1', PROOFPILOT_INFERENCE_MAX_RETRIES: '2' });
  const before = stateOfRealRepo();
  assert.equal(await code(runProductionProposalAttempt({ runId: 'c3-live-meta-001', request })), await expectedGateCode(REAL_ROOT));
  assert.equal(keyReads, 0, 'the credential field was never read');
  assert.equal(fetchCalls.length, 0);
  assert.deepEqual(stateOfRealRepo(), before, 'nothing was created in the approvals, reservations or evidence directories');
});

test('pre-flight refusals (billable flag off, model override, malformed run id or request) stop even earlier, and never read the credential', async () => {
  setEnv({ MODEL_API_KEY: SENTINEL_KEY });
  assert.equal(await code(runProductionProposalAttempt({ runId: 'c3-live-meta-001', request })), 'P:BILLABLE_NOT_AUTHORIZED');
  setEnv({ MODEL_API_KEY: SENTINEL_KEY, PROOFPILOT_ALLOW_BILLABLE_CALLS: '1', META_MODEL_VISUAL: 'muse-spark-1.3-other' });
  assert.equal(await code(runProductionProposalAttempt({ runId: 'c3-live-meta-001', request })), 'P:MODEL_NOT_ALLOWED');
  setEnv({ MODEL_API_KEY: SENTINEL_KEY, PROOFPILOT_ALLOW_BILLABLE_CALLS: '1' });
  assert.equal(await code(runProductionProposalAttempt({ runId: '../escape', request })), 'P:INVALID_INPUT');
  assert.equal(await code(runProductionProposalAttempt({ runId: 'c3-live-meta-001', request: { ...request, prompt: request.prompt + 'x' } })), 'P:INVALID_INPUT');
  assert.equal(await code(runProductionProposalAttempt(undefined as never)), 'P:INVALID_INPUT');
  assert.equal(keyReads, 0);
  assert.equal(fetchCalls.length, 0);
});

test('caller-supplied trust is ignored: forged provider, transport, store, context, roots, Git facts, clock, evidence directory, consent and approval cannot bypass authorization', async () => {
  setEnv({ MODEL_API_KEY: SENTINEL_KEY, PROOFPILOT_ALLOW_BILLABLE_CALLS: '1' });
  const forged = {
    runId: 'c3-live-meta-001', request,
    provider: { id: 'meta', models: { visual: META_PROPOSAL_MODEL }, billableCallsAllowed: true, structuredResponse: () => { throw new Error('forged provider invoked'); } },
    transport: { call: () => { throw new Error('forged transport invoked'); } }, call: () => { throw new Error('forged call invoked'); },
    ctx: { kind: 'production', liveQuota: 5 }, store: {}, liveQuota: 5, quota: 5, repoRoot: '/tmp/forged', installRoot: '/tmp/forged', approvalsDir: '/tmp/forged', reservationsRoot: '/tmp/forged',
    git: { head: async () => 'f'.repeat(40), clean: async () => true, treeDigest: async () => 'e'.repeat(64) }, now: () => new Date(0), evidenceRoot: '/tmp/forged', consent: { granted: true }, approval: { approved: true }, synthetic: true, allowSynthetic: true,
  };
  assert.equal(await code(runProductionProposalAttempt(forged as never)), await expectedGateCode(REAL_ROOT));
  assert.equal(keyReads, 0);
  assert.equal(fetchCalls.length, 0);
  assert.equal(existsSync('/tmp/forged'), false);
});

// ---------------------------------------------------------------- the zero-argument Meta transport (mock fetch)

test('the credential-free descriptor never reads the key field and reflects the billable flag and the pinned model', () => {
  setEnv({ MODEL_API_KEY: SENTINEL_KEY });
  assert.deepEqual(readMetaProposalDescriptor(), { id: 'meta', models: { visual: 'muse-spark-1.3' }, billableCallsAllowed: false });
  setEnv({ MODEL_API_KEY: SENTINEL_KEY, PROOFPILOT_ALLOW_BILLABLE_CALLS: '1' });
  assert.equal(readMetaProposalDescriptor().billableCallsAllowed, true);
  assert.equal(keyReads, 0);
  assert.equal(fetchCalls.length, 0);
});

test('opening the call needs the credential, the pinned model and the billable flag, and fails before any request', () => {
  setEnv({ PROOFPILOT_ALLOW_BILLABLE_CALLS: '1' });
  assert.throws(() => openMetaProposalCall(), (e: unknown) => e instanceof InferenceError && e.code === 'CONFIG');
  setEnv({ MODEL_API_KEY: 'short', PROOFPILOT_ALLOW_BILLABLE_CALLS: '1' });
  assert.throws(() => openMetaProposalCall(), (e: unknown) => e instanceof InferenceError && e.code === 'CONFIG' && !String(e.message).includes('short'));
  setEnv({ MODEL_API_KEY: SENTINEL_KEY, PROOFPILOT_ALLOW_BILLABLE_CALLS: '1', META_MODEL_VISUAL: 'other-model' });
  assert.throws(() => openMetaProposalCall(), (e: unknown) => e instanceof InferenceError && e.code === 'CONFIG');
  setEnv({ MODEL_API_KEY: SENTINEL_KEY });
  assert.throws(() => openMetaProposalCall(), (e: unknown) => e instanceof InferenceError && e.code === 'BILLABLE_NOT_AUTHORIZED');
  setEnv({ MODEL_API_KEY: SENTINEL_KEY, PROOFPILOT_ALLOW_BILLABLE_CALLS: '1', META_API_BASE_URL: 'https://evil.example/v1' });
  assert.throws(() => openMetaProposalCall(), (e: unknown) => e instanceof InferenceError && e.code === 'CONFIG');
  assert.equal(fetchCalls.length, 0, 'opening never makes a request');
});

test('the opened call is exactly one strict, low-reasoning, 3072-token, text-only Responses request to api.meta.ai, even if retries are configured and the call fails', async () => {
  setEnv({ MODEL_API_KEY: SENTINEL_KEY, PROOFPILOT_ALLOW_BILLABLE_CALLS: '1', PROOFPILOT_INFERENCE_MAX_RETRIES: '2' });
  const call = openMetaProposalCall();
  assert.equal(fetchCalls.length, 0);
  queue.push(responsesOk(PV1, { status: 'completed' }));
  const res = await call({ model: META_PROPOSAL_MODEL, prompt: request.prompt, schemaName: 'proofpilot_css_adjustments', schema: { type: 'object' }, maxOutputTokens: 3072 });
  assert.equal(res.lifecycle.completed, true);
  assert.equal(fetchCalls.length, 1);
  const c = fetchCalls[0]!;
  assert.equal(new URL(c.url).host, 'api.meta.ai');
  assert.match(new URL(c.url).pathname, /\/responses$/);
  const body = JSON.parse(String(c.init.body));
  assert.equal(body.model, 'muse-spark-1.3');
  assert.equal(body.max_output_tokens, 3072);
  assert.deepEqual(body.reasoning, { effort: 'low' });
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal(body.text.format.strict, true);
  for (const k of ['tools', 'tool_choice', 'stream', 'previous_response_id', 'background']) assert.ok(!(k in body), `no ${k}`);
  assert.doesNotMatch(JSON.stringify(body.input), /input_file|input_image|input_video/);

  // a server error is never retried, whatever PROOFPILOT_INFERENCE_MAX_RETRIES says
  fetchCalls = [];
  queue.push(json({ error: { message: 'boom RAW-ERR-TEXT' } }, 500));
  await assert.rejects(call({ model: META_PROPOSAL_MODEL, prompt: request.prompt, schemaName: 'proofpilot_css_adjustments', schema: { type: 'object' }, maxOutputTokens: 3072 }));
  assert.equal(fetchCalls.length, 1, 'no retry');
});
