// T25-style checks: credentials never appear in errors, are never sent to a
// non-allowlisted host, and never reach the browser/oracle child process.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createProvider, InferenceError, loadProviderConfig, redact } from '../../packages/inference/src/index.ts';
import { scrubEnv } from '../../packages/core/src/index.ts';
import { json, metaEnv, mockFetch, SENTINEL_KEY } from '../helpers.ts';

const leaks = (e: unknown) => {
  const err = e as InferenceError;
  return [err.message, String(err.stack), JSON.stringify(err), String(err)].some((s) => s.includes(SENTINEL_KEY));
};

test('provider error bodies echoing the key are redacted everywhere on the error', async () => {
  const m = mockFetch([json({ error: `invalid key ${SENTINEL_KEY}`, hdr: `Bearer ${SENTINEL_KEY}` }, 401)]);
  const p = createProvider(loadProviderConfig('meta', metaEnv()), { fetch: m.fetch });
  try {
    await p.listModels();
    assert.fail('expected rejection');
  } catch (e) {
    assert.equal((e as InferenceError).code, 'AUTH');
    assert.equal(leaks(e), false);
    assert.match((e as Error).message, /\[REDACTED\]/);
  }
});

test('network error messages containing the key are redacted', async () => {
  const m = mockFetch([new TypeError(`connect failed with ${SENTINEL_KEY}`)]);
  const p = createProvider(loadProviderConfig('meta', metaEnv()), { fetch: m.fetch });
  await assert.rejects(p.listModels(), (e) => !leaks(e));
});

test('error detail is truncated', async () => {
  const m = mockFetch([new Response('x'.repeat(10_000), { status: 500 })]);
  const p = createProvider(loadProviderConfig('meta', metaEnv()), { fetch: m.fetch });
  await assert.rejects(p.listModels(), (e: Error) => e.message.length < 500);
});

test('key is never sent to a non-allowlisted host (config refuses first)', () => {
  assert.throws(() => loadProviderConfig('meta', metaEnv({ META_API_BASE_URL: 'https://attacker.example/v1' })), /not allowlisted/);
});

test('generic token patterns are redacted', () => {
  assert.equal(redact('auth Bearer abc.def-123 and sk-ABCDEF123456', []), 'auth Bearer [REDACTED] and [REDACTED]');
});

test('scrubEnv removes credentials before spawning the oracle', () => {
  const out = scrubEnv({ MODEL_API_KEY: SENTINEL_KEY, BASETEN_API_KEY: 'x', GITHUB_TOKEN: 'y', AWS_SECRET_ACCESS_KEY: 'z', PATH: '/bin', HOME: '/h' });
  assert.deepEqual(out, { PATH: '/bin', HOME: '/h' });
});

test('no local environment file is tracked by git', () => {
  const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n');
  const envFiles = tracked.filter((f) => /(^|\/)\.env(\.[^/]+)?$/.test(f) && !f.endsWith('.env.example'));
  assert.deepEqual(envFiles, []);
});

// A key that matches no generic token pattern, so only exact-value redaction can catch it.
const PLAIN_KEY = 'Zq8vN3mWxT7LrB2cHd5YjKe9';

test('a key echoed across the error-detail cutoff never leaks even a partial fragment', async () => {
  const cutoff = 300;
  const fourGrams = Array.from({ length: PLAIN_KEY.length - 3 }, (_, i) => PLAIN_KEY.slice(i, i + 4));
  // Place the key so the 300-char cutoff falls at every position inside it.
  for (let inside = 1; inside < PLAIN_KEY.length; inside++) {
    const body = `${'x'.repeat(cutoff - inside)}${PLAIN_KEY}${'y'.repeat(50)}`;
    const m = mockFetch([new Response(body, { status: 401 })]);
    const p = createProvider(loadProviderConfig('meta', { MODEL_API_KEY: PLAIN_KEY }), { fetch: m.fetch });
    await assert.rejects(p.listModels(), (e: InferenceError) => {
      assert.equal(e.code, 'AUTH');
      for (const gram of fourGrams) assert.ok(!e.message.includes(gram), `cutoff inside key at ${inside}: leaked fragment ${JSON.stringify(gram)}`);
      assert.ok(e.message.length < 500, 'error detail stays bounded');
      return true;
    });
  }
});
