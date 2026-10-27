import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertVideoConsent, ConsentError, createVideoConsent, isValidRunId } from '../../packages/intake/src/index.ts';

const SHA = 'a'.repeat(64);
const OTHER_SHA = 'b'.repeat(64);
const expected = { runId: 'run-1', providerId: 'meta', videoSha256: SHA };
const good = () => createVideoConsent({ runId: 'run-1', videoSha256: SHA, now: () => new Date('2026-10-27T00:00:00Z') });
const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof ConsentError, `expected ConsentError, got ${e}`);
    return e.code;
  }
  return 'NO_ERROR';
};

test('createVideoConsent binds run, provider, video hash and attestations', () => {
  assert.deepEqual(good(), {
    granted: true,
    scope: 'meta-video-analysis',
    provider: 'meta',
    runId: 'run-1',
    videoSha256: SHA,
    grantedAt: '2026-10-27T00:00:00.000Z',
    attestations: { ownedOrSynthetic: true, noCustomerOrPaymentData: true },
  });
  assert.doesNotThrow(() => assertVideoConsent(good(), expected));
});

test('missing consent is CONSENT_MISSING', () => {
  assert.equal(codeOf(() => assertVideoConsent(undefined, expected)), 'CONSENT_MISSING');
  assert.equal(codeOf(() => assertVideoConsent(null, expected)), 'CONSENT_MISSING');
});

test('anything short of an explicit, complete grant is CONSENT_INVALID', () => {
  const c = good();
  const bad: unknown[] = [
    false,
    true,
    'yes',
    1,
    {},
    [],
    { ...c, granted: false },
    { ...c, granted: 'true' },
    { ...c, granted: 1 },
    { ...c, scope: 'anything' },
    { ...c, provider: 'baseten' },
    { ...c, runId: '../x' },
    { ...c, videoSha256: 'abc' },
    { ...c, videoSha256: 'A'.repeat(64) },
    { ...c, grantedAt: 'not a date' },
    { ...c, grantedAt: undefined },
    { ...c, attestations: undefined },
    { ...c, attestations: { ownedOrSynthetic: true } },
    { ...c, attestations: { ownedOrSynthetic: true, noCustomerOrPaymentData: false } },
    { ...c, attestations: { ownedOrSynthetic: 'true', noCustomerOrPaymentData: true } },
  ];
  for (const b of bad) assert.equal(codeOf(() => assertVideoConsent(b, expected)), 'CONSENT_INVALID', JSON.stringify(b));
});

test('consent cannot be reused for a different run, video or provider', () => {
  assert.equal(codeOf(() => assertVideoConsent(good(), { ...expected, runId: 'run-2' })), 'CONSENT_MISMATCH');
  assert.equal(codeOf(() => assertVideoConsent(good(), { ...expected, videoSha256: OTHER_SHA })), 'CONSENT_MISMATCH');
  assert.equal(codeOf(() => assertVideoConsent(good(), { ...expected, providerId: 'baseten' })), 'CONSENT_MISMATCH');
});

test('createVideoConsent refuses malformed inputs; run ids are tightly constrained', () => {
  assert.equal(codeOf(() => createVideoConsent({ runId: 'bad id', videoSha256: SHA })), 'CONSENT_INVALID');
  assert.equal(codeOf(() => createVideoConsent({ runId: 'ok', videoSha256: 'zz' })), 'CONSENT_INVALID');
  for (const ok of ['a', 'run-1', 'F01.run_2026-10-27', 'x'.repeat(64)]) assert.equal(isValidRunId(ok), true, ok);
  for (const bad of ['', '-x', '.x', 'a b', 'a/b', 'a\0', 'x'.repeat(65), 5, null]) assert.equal(isValidRunId(bad), false, String(bad));
});
