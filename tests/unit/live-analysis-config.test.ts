// UI-C3-02-I1: L-CFG-1 configuration-matrix tests, no environment or transport.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APPROVED_F01_MEDIA_SHA256,
  BASETEN_APPROVED_BASE_URL,
  BASETEN_APPROVED_ENDPOINT,
  BASETEN_DOCUMENTED_DIRECT_MODEL,
  D9_APPROVED_MODEL,
  evaluateOfflineLiveConfiguration,
  validateBasetenBaseUrl,
  validateLiveModel,
} from '../../packages/live-analysis/src/config.ts';

test('L-CFG-1: exact owner base URL and one trailing slash resolve to the same pinned destination', () => {
  for (const input of [BASETEN_APPROVED_BASE_URL, BASETEN_APPROVED_BASE_URL + '/']) {
    assert.deepEqual(validateBasetenBaseUrl(input), {
      ok: true,
      baseUrl: BASETEN_APPROVED_BASE_URL,
      endpoint: BASETEN_APPROVED_ENDPOINT,
    });
  }
});

test('L-CFG-1: hostile, malformed and non-string URL values fail closed', () => {
  const rejected: unknown[] = [
    undefined,
    null,
    1,
    {},
    '',
    ' https://inference.baseten.co/v1',
    'https://inference.baseten.co/v1 ',
    'http://inference.baseten.co/v1',
    'https://inference.baseten.co:443/v1',
    'https://inference.baseten.co:1234/v1',
    'https://evil.example/v1',
    'https://inference.baseten.co.evil.example/v1',
    'https://user@inference.baseten.co/v1',
    'https://user:pass@inference.baseten.co/v1',
    'https://inference.baseten.co/v1?x=1',
    'https://inference.baseten.co/v1#fragment',
    'https://inference.baseten.co/v2',
    'https://inference.baseten.co/v1/v1',
    'https://inference.baseten.co/v1//',
    'https://inference.baseten.co/',
    'https://inference.baseten.co/v1/chat/completions',
    'https://inference.baseten.co\\@evil.example/v1',
    'https://inference.baseten.co/v1%2f',
  ];
  for (const input of rejected) {
    assert.deepEqual(validateBasetenBaseUrl(input), { ok: false, code: 'ENDPOINT_UNAPPROVED' }, String(input));
  }
});

test('L-CFG-1: URL rejection precedes the D9 model-ID block', () => {
  assert.deepEqual(evaluateOfflineLiveConfiguration({ baseUrl: 'https://other.example/v1', model: BASETEN_DOCUMENTED_DIRECT_MODEL }), {
    ok: false,
    code: 'ENDPOINT_UNAPPROVED',
    blockedBy: 'URL_GATE',
  });
});

test('L-CFG-1: offline evaluation rejects the reported OpenRouter model and the superseded model', () => {
  for (const model of ['meta/muse-spark-open', 'meta-models/muse-spark-open-1026', '', null]) {
    assert.deepEqual(evaluateOfflineLiveConfiguration({ baseUrl: BASETEN_APPROVED_BASE_URL, model }), {
      ok: false,
      code: 'MODEL_UNAVAILABLE_OR_UNAPPROVED',
      blockedBy: 'D9',
    });
  }
});

test('L-CFG-1: offline evaluation never authorizes a live call, even for the documented ID', () => {
  assert.deepEqual(evaluateOfflineLiveConfiguration({
    baseUrl: BASETEN_APPROVED_BASE_URL,
    model: BASETEN_DOCUMENTED_DIRECT_MODEL,
  }), {
    ok: false,
    code: 'MODEL_UNAVAILABLE_OR_UNAPPROVED',
    blockedBy: 'D9',
  });
});

test('L-CFG-1: this module exposes neither a transport nor a positive live authorization', async () => {
  const module = await import('../../packages/live-analysis/src/config.ts');
  assert.deepEqual(Object.keys(module).sort(), [
    'APPROVED_F01_MEDIA_SHA256',
    'BASETEN_APPROVED_BASE_URL',
    'BASETEN_APPROVED_ENDPOINT',
    'BASETEN_DOCUMENTED_DIRECT_MODEL',
    'D9_APPROVED_MODEL',
    'evaluateOfflineLiveConfiguration',
    'validateBasetenBaseUrl',
    'validateLiveModel',
  ]);
  for (const model of [BASETEN_DOCUMENTED_DIRECT_MODEL, 'meta/muse-spark-open']) {
    assert.equal(module.evaluateOfflineLiveConfiguration({ baseUrl: BASETEN_APPROVED_BASE_URL, model }).ok, false);
  }
});

test('L-CFG-3: the approved F01 media pin is exactly the certified clip SHA-256', () => {
  assert.equal(
    APPROVED_F01_MEDIA_SHA256,
    'e9df68b14c48300818f9ec9407b884413037f29305f17a5da3cc4fac05eeafdf',
    'the pin is the owner-approved F01 mobile recording SHA-256',
  );
  assert.match(APPROVED_F01_MEDIA_SHA256, /^[0-9a-f]{64}$/, 'the pin is a well-formed 64-hex SHA-256');
});

test('L-CFG-2: D9 approves exactly one byte-identical model ID', () => {
  assert.equal(D9_APPROVED_MODEL, 'meta-models/muse-spark-open');
  assert.equal(D9_APPROVED_MODEL, BASETEN_DOCUMENTED_DIRECT_MODEL, 'the pin is the documented direct-Baseten ID');
  assert.deepEqual(validateLiveModel(BASETEN_DOCUMENTED_DIRECT_MODEL), {
    ok: true,
    model: 'meta-models/muse-spark-open',
  });
  for (const value of [
    'meta/muse-spark-open',
    'meta-models/muse-spark-open-1026',
    'META-MODELS/MUSE-SPARK-OPEN',
    ' meta-models/muse-spark-open',
    '',
    null,
    undefined,
    42,
    {},
  ]) {
    assert.deepEqual(validateLiveModel(value), {
      ok: false,
      code: 'MODEL_UNAVAILABLE_OR_UNAPPROVED',
    }, `D9 refuses ${JSON.stringify(value)}`);
  }
});
