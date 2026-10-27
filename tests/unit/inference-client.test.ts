import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProvider, InferenceError, loadProviderConfig } from '../../packages/inference/src/index.ts';
import { json, metaEnv, mockFetch, SENTINEL_KEY } from '../helpers.ts';

const noSleep = async () => {};
const rejectsWith = async (p: Promise<unknown>, code: string) =>
  assert.rejects(p, (e: InferenceError) => e instanceof InferenceError && e.code === code);

test('listModels hits GET {base}/models with bearer auth, no redirects, timeout signal', async () => {
  const m = mockFetch([json({ data: [{ id: 'muse-spark-1.3' }, { id: 'muse-wonder-1.0' }] })]);
  const p = createProvider(loadProviderConfig('meta', metaEnv()), { fetch: m.fetch });
  assert.deepEqual(await p.listModels(), ['muse-spark-1.3', 'muse-wonder-1.0']);
  const [call] = m.calls;
  assert.equal(call!.url, 'https://api.meta.ai/v1/models');
  assert.equal(call!.init.method, 'GET');
  assert.equal((call!.init.headers as Record<string, string>).authorization, `Bearer ${SENTINEL_KEY}`);
  assert.equal(call!.init.redirect, 'error');
  assert.ok(call!.init.signal instanceof AbortSignal);
});

test('availability is exact-match only; related IDs are reported, never substituted', async () => {
  const m = mockFetch([json({ data: [{ id: 'meta-models/muse-spark-open' }, { id: 'other/model' }] })]);
  const p = createProvider(loadProviderConfig('baseten', { BASETEN_API_KEY: SENTINEL_KEY }), { fetch: m.fetch });
  const a = await p.checkModelAvailability('meta-models/muse-spark-open-1026');
  assert.equal(a.available, false);
  assert.deepEqual(a.relatedIds, ['meta-models/muse-spark-open']);
});

test('missing API key fails before any network call', async () => {
  const m = mockFetch([]);
  const p = createProvider(loadProviderConfig('baseten', {}), { fetch: m.fetch });
  await rejectsWith(p.listModels(), 'CONFIG');
  assert.equal(m.calls.length, 0);
});

test('generateText is blocked unless billable calls are authorized', async () => {
  const m = mockFetch([]);
  const p = createProvider(loadProviderConfig('meta', metaEnv()), { fetch: m.fetch });
  await rejectsWith(p.generateText({ model: 'muse-wonder-1.0', prompt: 'hi', maxOutputTokens: 10 }), 'BILLABLE_NOT_AUTHORIZED');
  assert.equal(m.calls.length, 0);
});

test('generateText validates input before network', async () => {
  const m = mockFetch([]);
  const p = createProvider(loadProviderConfig('meta', metaEnv({ PROOFPILOT_ALLOW_BILLABLE_CALLS: '1' })), { fetch: m.fetch });
  const ok = { model: 'muse-wonder-1.0', prompt: 'hi', maxOutputTokens: 10 };
  await rejectsWith(p.generateText({ ...ok, model: 'gpt-something' }), 'INVALID_INPUT');
  await rejectsWith(p.generateText({ ...ok, prompt: '   ' }), 'INVALID_INPUT');
  await rejectsWith(p.generateText({ ...ok, prompt: 'x'.repeat(32_001) }), 'INVALID_INPUT');
  await rejectsWith(p.generateText({ ...ok, maxOutputTokens: 0 }), 'INVALID_INPUT');
  await rejectsWith(p.generateText({ ...ok, maxOutputTokens: 1.5 }), 'INVALID_INPUT');
  assert.equal(m.calls.length, 0);
});

test('meta generateText uses /responses and parses output content', async () => {
  const m = mockFetch([
    json(
      { id: 'resp_1', model: 'muse-wonder-1.0', output: [{ type: 'message', content: [{ type: 'output_text', text: 'hello' }] }], usage: { input_tokens: 3, output_tokens: 1 } },
      200,
      { 'x-request-id': 'req-abc' },
    ),
  ]);
  const p = createProvider(loadProviderConfig('meta', metaEnv({ PROOFPILOT_ALLOW_BILLABLE_CALLS: '1' })), { fetch: m.fetch });
  const r = await p.generateText({ model: 'muse-wonder-1.0', prompt: 'say hello', maxOutputTokens: 16 });
  assert.equal(m.calls[0]!.url, 'https://api.meta.ai/v1/responses');
  assert.deepEqual(JSON.parse(String(m.calls[0]!.init.body)), { model: 'muse-wonder-1.0', input: 'say hello', max_output_tokens: 16 });
  assert.deepEqual(r, { providerId: 'meta', model: 'muse-wonder-1.0', text: 'hello', requestId: 'req-abc', usage: { inputTokens: 3, outputTokens: 1 } });
});

test('baseten generateText uses /chat/completions', async () => {
  const m = mockFetch([json({ id: 'c1', choices: [{ message: { content: 'ok' } }] })]);
  const p = createProvider(loadProviderConfig('baseten', { BASETEN_API_KEY: SENTINEL_KEY, PROOFPILOT_ALLOW_BILLABLE_CALLS: '1' }), { fetch: m.fetch });
  const r = await p.generateText({ model: 'meta-models/muse-spark-open-1026', prompt: 'p', maxOutputTokens: 8 });
  assert.equal(m.calls[0]!.url, 'https://inference.baseten.co/v1/chat/completions');
  assert.equal(r.text, 'ok');
  assert.equal(r.requestId, 'c1');
});

test('HTTP errors map to typed codes', async () => {
  const cases: Array<[number, string]> = [[401, 'AUTH'], [403, 'AUTH'], [404, 'NOT_FOUND'], [429, 'RATE_LIMITED'], [503, 'PROVIDER_ERROR'], [400, 'HTTP']];
  for (const [status, expected] of cases) {
    const m = mockFetch([json({ error: 'x' }, status)]);
    const p = createProvider(loadProviderConfig('meta', metaEnv()), { fetch: m.fetch });
    await rejectsWith(p.listModels(), expected);
  }
});

test('retries are bounded to maxRetries for 429/5xx only', async () => {
  const m = mockFetch([json({}, 503), json({}, 429), json({}, 503)]);
  const p = createProvider(loadProviderConfig('meta', metaEnv({ PROOFPILOT_INFERENCE_MAX_RETRIES: '2' })), { fetch: m.fetch, sleep: noSleep });
  await rejectsWith(p.listModels(), 'PROVIDER_ERROR');
  assert.equal(m.calls.length, 3);

  const once = mockFetch([json({}, 400)]);
  const q = createProvider(loadProviderConfig('meta', metaEnv({ PROOFPILOT_INFERENCE_MAX_RETRIES: '2' })), { fetch: once.fetch, sleep: noSleep });
  await rejectsWith(q.listModels(), 'HTTP');
  assert.equal(once.calls.length, 1);
});

test('timeout surfaces as TIMEOUT via a real AbortSignal deadline', async () => {
  const hang = mockFetch([]);
  const fetch = (url: string, init: RequestInit) =>
    new Promise<Response>((_, reject) => {
      hang.calls.push({ url, init });
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason));
    });
  const p = createProvider(loadProviderConfig('meta', metaEnv({ PROOFPILOT_INFERENCE_TIMEOUT_MS: '1000' })), { fetch });
  const t0 = Date.now();
  await rejectsWith(p.listModels(), 'TIMEOUT');
  assert.ok(Date.now() - t0 < 5_000);
});

test('network failure and invalid JSON / shapes are typed', async () => {
  const net = mockFetch([new TypeError('fetch failed')]);
  await rejectsWith(createProvider(loadProviderConfig('meta', metaEnv()), { fetch: net.fetch }).listModels(), 'NETWORK');
  const bad = mockFetch([new Response('<html>', { status: 200 })]);
  await rejectsWith(createProvider(loadProviderConfig('meta', metaEnv()), { fetch: bad.fetch }).listModels(), 'INVALID_RESPONSE');
  const shape = mockFetch([json({ data: [{ name: 'x' }] })]);
  await rejectsWith(createProvider(loadProviderConfig('meta', metaEnv()), { fetch: shape.fetch }).listModels(), 'INVALID_RESPONSE');
  const empty = mockFetch([json({ output: [] })]);
  const p = createProvider(loadProviderConfig('meta', metaEnv({ PROOFPILOT_ALLOW_BILLABLE_CALLS: '1' })), { fetch: empty.fetch });
  await rejectsWith(p.generateText({ model: 'muse-spark-1.3', prompt: 'p', maxOutputTokens: 4 }), 'INVALID_RESPONSE');
});
