// UI-C3-02-D9 (activation): owner-supervised, non-inference account-availability
// preflight. Injected fetch doubles only, fake credentials only: exactly one
// catalog GET is permitted per call, no inference, and the key must never
// appear in any result, log, or error.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASETEN_APPROVED_BASE_URL } from '../../packages/live-analysis/src/config.ts';
import {
  checkAccountAvailability,
  type PreflightFetch,
  type PreflightInput,
} from '../../packages/live-analysis/src/preflight.ts';

const FAKE_KEY = 'NOT-A-REAL-KEY-0000-PREFLIGHT';
const PINNED = 'meta-models/muse-spark-open-1026';
const GENERIC_PUBLIC = 'meta-models/muse-spark-open';

interface RecordedCall {
  url: string;
  init: { method: string; headers: Record<string, string> };
}

function makeDouble(
  status: number,
  jsonValue: unknown,
  opts: { jsonThrows?: boolean; throwNetwork?: boolean } = {},
): { fetchImpl: PreflightFetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl: PreflightFetch = (url, init) => {
    calls.push({ url, init: { method: init.method, headers: init.headers } });
    if (opts.throwNetwork === true) return Promise.reject(new Error('socket down (test double)'));
    return Promise.resolve({
      status,
      url,
      json: () => (opts.jsonThrows === true
        ? Promise.reject(new Error('not json (test double)'))
        : Promise.resolve(jsonValue)),
    });
  };
  return { fetchImpl, calls };
}

const input = (overrides: Partial<PreflightInput> = {}): PreflightInput => ({
  baseUrl: BASETEN_APPROVED_BASE_URL,
  model: PINNED,
  apiKey: FAKE_KEY,
  ...overrides,
});

function assertKeyFree(where: string, value: unknown): void {
  assert.ok(!JSON.stringify(value).includes(FAKE_KEY), `${where}: the key must never appear in results`);
}

test('L-PRE-1: reachable account listing the pinned model reports ok', async () => {
  const { fetchImpl, calls } = makeDouble(200, { data: [{ id: 'other-model' }, { id: PINNED }] });
  const result = await checkAccountAvailability(fetchImpl, input());
  assert.deepEqual(result, {
    ok: true,
    modelListed: true,
    catalogCount: 2,
    endpoint: BASETEN_APPROVED_BASE_URL,
  });
  assert.equal(calls.length, 1, 'exactly one catalog GET, no retries');
  assert.equal(calls[0]?.url, `${BASETEN_APPROVED_BASE_URL}/models`);
  assert.equal(calls[0]?.init.method, 'GET');
  assertKeyFree('success result', result);
});

test('L-PRE-2: reachable account without the pinned model signals model-absent', async () => {
  const { fetchImpl } = makeDouble(200, { data: [{ id: 'other-model' }] });
  const result = await checkAccountAvailability(fetchImpl, input());
  assert.deepEqual(result, { ok: true, modelListed: false, catalogCount: 1, endpoint: BASETEN_APPROVED_BASE_URL });
  assertKeyFree('model-absent result', result);
});

test('L-PRE-3: rejected key refuses unauthorized with no inference', async () => {
  for (const status of [401, 403]) {
    const { fetchImpl, calls } = makeDouble(status, { error: 'bad key' });
    const result = await checkAccountAvailability(fetchImpl, input());
    assert.deepEqual(result, {
      ok: false,
      code: 'PREFLIGHT_UNAUTHORIZED',
      detail: 'the account rejected the key; no inference attempted',
    });
    assert.equal(calls.length, 1, 'the single catalog call was the only egress');
    assertKeyFree(`unauthorized result (${status})`, result);
  }
});

test('L-PRE-3b: unauthorized with a non-JSON body still reports unauthorized', async () => {
  for (const status of [401, 403]) {
    const { fetchImpl, calls } = makeDouble(status, {}, { jsonThrows: true });
    const result = await checkAccountAvailability(fetchImpl, input());
    assert.deepEqual(result, {
      ok: false,
      code: 'PREFLIGHT_UNAUTHORIZED',
      detail: 'the account rejected the key; no inference attempted',
    });
    assert.equal(calls.length, 1, 'the single catalog call was the only egress');
    assertKeyFree(`non-JSON unauthorized result (${status})`, result);
  }
});

test('L-PRE-4: transport and shape faults refuse with status-only details', async () => {
  const http = await checkAccountAvailability(makeDouble(500, {}).fetchImpl, input());
  assert.deepEqual(http, {
    ok: false,
    code: 'PREFLIGHT_HTTP',
    detail: 'catalog endpoint refused with HTTP 500',
  });
  assertKeyFree('http result', http);
  const down = await checkAccountAvailability(makeDouble(200, {}, { throwNetwork: true }).fetchImpl, input());
  assert.deepEqual(down, {
    ok: false,
    code: 'PREFLIGHT_HTTP',
    detail: 'catalog request failed before a response',
  });
  const badJson = await checkAccountAvailability(makeDouble(200, {}, { jsonThrows: true }).fetchImpl, input());
  assert.deepEqual(badJson, { ok: false, code: 'PREFLIGHT_SHAPE', detail: 'catalog response was not a model list' });
  for (const shape of [null, {}, { data: [{ id: 42 }] }, { data: 'x' }]) {
    const shaped = await checkAccountAvailability(makeDouble(200, shape).fetchImpl, input());
    assert.deepEqual(shaped, { ok: false, code: 'PREFLIGHT_SHAPE', detail: 'catalog response was not a model list' });
    assertKeyFree('shape result', shaped);
  }
});

test('L-PRE-5: misconfigured inputs refuse before any egress', async () => {
  const cases: PreflightInput[] = [
    input({ baseUrl: 'https://evil.example/v1' }),
    input({ baseUrl: 'https://inference.baseten.co/v1/chat/completions' }),
    input({ model: 'meta/muse-spark-open' }),
    input({ model: 'meta-models/muse-spark-open' }),
    input({ model: '' }),
    input({ apiKey: '' }),
    input({ apiKey: undefined }),
  ];
  for (const bad of cases) {
    const { fetchImpl, calls } = makeDouble(200, { data: [{ id: PINNED }] });
    const result = await checkAccountAvailability(fetchImpl, bad);
    assert.equal(result.ok, false);
    assert.equal((result as { code: string }).code, 'PREFLIGHT_MISCONFIGURED');
    assert.equal(typeof (result as { detail: unknown }).detail, 'string');
    assert.equal(calls.length, 0, 'no egress before the gates pass');
    assertKeyFree('misconfigured result', result);
  }
});

test('L-PRE-6: the D9 pin is enforced in preflight, not just in the gate', async () => {
  const { fetchImpl, calls } = makeDouble(200, { data: [{ id: 'meta/muse-spark-open' }] });
  const result = await checkAccountAvailability(fetchImpl, input({ model: 'meta/muse-spark-open' }));
  assert.equal(result.ok, false, 'an alias never reaches the account even when listed');
  assert.equal((result as { code: string }).code, 'PREFLIGHT_MISCONFIGURED');
  assert.equal(calls.length, 0);
});

test('L-PRE-7: preflight checks the hackathon ID and never infers access from the public ID', async () => {
  // The unsuffixed public ID was approved in error (PR #36); it refuses at
  // the gate even when the account lists it — public listing is not key
  // authorization.
  const listed = makeDouble(200, { data: [{ id: GENERIC_PUBLIC }] });
  const gated = await checkAccountAvailability(listed.fetchImpl, input({ model: GENERIC_PUBLIC }));
  assert.equal(gated.ok, false);
  assert.equal((gated as { code: string }).code, 'PREFLIGHT_MISCONFIGURED');
  assert.equal(listed.calls.length, 0, 'no egress for the refused public ID');
  // A catalog that lists only the public ID does not list the hackathon ID:
  // preflight reports model-absent so the owner CLI stops before any send.
  const { fetchImpl, calls } = makeDouble(200, { data: [{ id: GENERIC_PUBLIC }, { id: 'other-model' }] });
  const absent = await checkAccountAvailability(fetchImpl, input());
  assert.deepEqual(absent, {
    ok: true,
    modelListed: false,
    catalogCount: 2,
    endpoint: BASETEN_APPROVED_BASE_URL,
  }, 'access is never inferred from the general model');
  assert.equal(calls.length, 1, 'the single catalog call was the only egress');
  assertKeyFree('model-absent result', absent);
  // The hackathon ID listed: reachable and named.
  const okDouble = makeDouble(200, { data: [{ id: GENERIC_PUBLIC }, { id: PINNED }] });
  const ok = await checkAccountAvailability(okDouble.fetchImpl, input());
  assert.deepEqual(ok, {
    ok: true,
    modelListed: true,
    catalogCount: 2,
    endpoint: BASETEN_APPROVED_BASE_URL,
  });
});
