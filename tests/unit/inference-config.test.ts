import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InferenceError, loadProviderConfig } from '../../packages/inference/src/index.ts';
import { SENTINEL_KEY } from '../helpers.ts';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as InferenceError).code;
  }
  return 'NO_ERROR';
};

test('meta defaults: base URL, exact Muse model IDs, safe bounds, billable off', () => {
  const c = loadProviderConfig('meta', { MODEL_API_KEY: SENTINEL_KEY });
  assert.equal(c.baseUrl, 'https://api.meta.ai/v1');
  assert.deepEqual(c.models, { visual: 'muse-spark-1.3', code: 'muse-wonder-1.0' });
  assert.equal(c.textApi, 'responses');
  assert.equal(c.timeoutMs, 60_000);
  assert.equal(c.maxRetries, 0);
  assert.equal(c.billableCallsAllowed, false);
});

test('baseten defaults to the hackathon-specific versioned model ID', () => {
  const c = loadProviderConfig('baseten', {});
  assert.equal(c.baseUrl, 'https://inference.baseten.co/v1');
  assert.deepEqual(c.models, { visual: 'meta-models/muse-spark-open-1026' });
  assert.equal(c.textApi, 'chat.completions');
  assert.equal(c.apiKey, undefined);
});

test('model IDs are configurable but format-validated', () => {
  assert.equal(loadProviderConfig('meta', { META_MODEL_CODE: 'muse-wonder-1.1' }).models.code, 'muse-wonder-1.1');
  for (const bad of ['../etc', 'a b', 'x'.repeat(200), 'muse;rm', 'a/b/c']) {
    assert.equal(code(() => loadProviderConfig('meta', { META_MODEL_VISUAL: bad })), 'CONFIG', bad);
  }
});

test('base URL must be https, allowlisted, credential-free', () => {
  for (const bad of [
    'http://api.meta.ai/v1',
    'https://evil.example/v1',
    'https://api.meta.ai.evil.example/v1',
    'https://user:pw@api.meta.ai/v1',
    'https://api.meta.ai/v1?x=1',
    'not a url',
    'https://inference.baseten.co/v1',
  ]) {
    assert.equal(code(() => loadProviderConfig('meta', { META_API_BASE_URL: bad })), 'CONFIG', bad);
  }
  assert.equal(loadProviderConfig('meta', { META_API_BASE_URL: 'https://api.meta.ai/v1/' }).baseUrl, 'https://api.meta.ai/v1');
});

test('timeout and retries are bounded; out-of-range values are rejected, not clamped', () => {
  assert.equal(loadProviderConfig('meta', { PROOFPILOT_INFERENCE_TIMEOUT_MS: '5000' }).timeoutMs, 5000);
  for (const bad of ['0', '999', '120001', '-1', '1e4', 'abc']) {
    assert.equal(code(() => loadProviderConfig('meta', { PROOFPILOT_INFERENCE_TIMEOUT_MS: bad })), 'CONFIG', bad);
  }
  assert.equal(loadProviderConfig('meta', { PROOFPILOT_INFERENCE_MAX_RETRIES: '2' }).maxRetries, 2);
  assert.equal(code(() => loadProviderConfig('meta', { PROOFPILOT_INFERENCE_MAX_RETRIES: '3' })), 'CONFIG');
});

test('billable calls require the exact opt-in value', () => {
  assert.equal(loadProviderConfig('meta', { PROOFPILOT_ALLOW_BILLABLE_CALLS: '1' }).billableCallsAllowed, true);
  for (const v of ['true', 'yes', '0', '']) {
    assert.equal(loadProviderConfig('meta', { PROOFPILOT_ALLOW_BILLABLE_CALLS: v }).billableCallsAllowed, false);
  }
});

test('malformed key is rejected without echoing it', () => {
  try {
    loadProviderConfig('meta', { MODEL_API_KEY: 'has space secretvalue' });
    assert.fail('expected error');
  } catch (e) {
    assert.equal((e as InferenceError).code, 'CONFIG');
    assert.ok(!(e as Error).message.includes('secretvalue'));
  }
});
