// UI-C3-02-I2: zero-I/O request/session/mock-permit adversarial battery.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCompanionRequest, type RequestMetadata } from '../../packages/live-analysis/src/request-guard.ts';
import { LocalSessionManager } from '../../packages/live-analysis/src/local-session.ts';
import { OfflineMockPermitLedger } from '../../packages/live-analysis/src/mock-permits.ts';
import { evaluateOfflineLiveConfiguration } from '../../packages/live-analysis/src/config.ts';

const port = 5188;
const host = `127.0.0.1:${port}`;
const origin = `http://${host}`;
const base: RequestMetadata = { method: 'GET', path: '/api/status', host, fetchSite: 'same-origin', bodyBytes: 0 };
const guarded = (parts: Partial<RequestMetadata>, authenticated = false) =>
  checkCompanionRequest({ ...base, ...parts }, port, authenticated);

test('L-CSRF-1: Host exact match only; rebinding, ports, userinfo and wrong routes fail closed', () => {
  for (const badHost of ['evil.example:5188', '127.0.0.1.evil.example:5188', '127.0.0.1:5173', '127.0.0.1', '127.0.0.1:5188@evil', '', null]) {
    assert.deepEqual(guarded({ host: badHost }, true), { ok: false, code: 'BAD_HOST' }, String(badHost));
  }
  assert.equal(guarded({ host: 'localhost:5188' }, true).ok, true);
  for (const [method, path] of [['DELETE', '/api/status'], ['GET', '/api/pair'], ['GET', '/api/status?x=1'], ['GET', '/api/%73tatus'], ['GET', '/api/../api/status']]) {
    assert.deepEqual(guarded({ method, path }, true), { ok: false, code: 'INVALID_ROUTE' });
  }
});

test('L-CSRF-1: state-free health GET remains available without a session or Origin', () => {
  assert.deepEqual(guarded({ method: 'GET', path: '/api/health', fetchSite: 'cross-site', origin: undefined }), {
    ok: true, endpoint: '/api/health', preSession: true,
  });
});

test('L-CSRF-1: authenticated polling GET accepts absent Origin and absent fetch metadata', () => {
  for (const endpoint of ['/api/status', '/api/events']) {
    assert.deepEqual(guarded({ path: endpoint, origin: undefined }, true), { ok: true, endpoint, preSession: false });
    assert.deepEqual(guarded({ path: endpoint, origin: undefined, fetchSite: undefined }, true), { ok: true, endpoint, preSession: false });
    assert.deepEqual(guarded({ path: endpoint, origin }, true), { ok: true, endpoint, preSession: false });
  }
});

test('L-CSRF-1: polling rejects no session, wrong/null Origin, or hostile fetch metadata', () => {
  assert.deepEqual(guarded({ origin: undefined }, false), { ok: false, code: 'SESSION_REQUIRED' });
  for (const badOrigin of ['null', 'http://evil.example', 'http://localhost:5173', 'http://127.0.0.1:5173']) {
    assert.deepEqual(guarded({ origin: badOrigin }, true), { ok: false, code: 'BAD_ORIGIN' });
  }
  for (const fetchSite of ['cross-site', 'same-site', 'none', 'garbage']) {
    assert.deepEqual(guarded({ origin: undefined, fetchSite }, true), { ok: false, code: 'BAD_FETCH_METADATA' });
  }
});

test('L-CSRF-1: live POST requires same-origin Origin, session, and correct body type', () => {
  for (const path of ['/api/analyze', '/api/propose']) {
    const req: Partial<RequestMetadata> = { method: 'POST', path, origin, contentType: 'application/json', bodyBytes: 100 };
    assert.equal(guarded(req, true).ok, true);
    assert.deepEqual(guarded({ ...req, origin: undefined }, true), { ok: false, code: 'BAD_ORIGIN' });
    assert.deepEqual(guarded({ ...req, origin: 'null' }, true), { ok: false, code: 'BAD_ORIGIN' });
    assert.deepEqual(guarded(req, false), { ok: false, code: 'SESSION_REQUIRED' });
    assert.deepEqual(guarded({ ...req, contentType: 'text/plain' }, true), { ok: false, code: 'BAD_CONTENT_TYPE' });
  }
  assert.deepEqual(guarded({
    method: 'POST', path: '/api/upload', origin, contentType: 'application/octet-stream', bodyBytes: 2_000,
  }, true), { ok: true, endpoint: '/api/upload', preSession: false });
});

test('L-PAIR-1: pairing is the sole pre-session POST, strict Origin/Host/JSON/size', () => {
  const req: Partial<RequestMetadata> = { method: 'POST', path: '/api/pair', origin, contentType: 'application/json', bodyBytes: 26 };
  assert.deepEqual(guarded(req), { ok: true, endpoint: '/api/pair', preSession: true });
  assert.deepEqual(guarded({ ...req, origin: undefined }), { ok: false, code: 'BAD_ORIGIN' });
  assert.deepEqual(guarded({ ...req, origin: 'null' }), { ok: false, code: 'BAD_ORIGIN' });
  assert.deepEqual(guarded({ ...req, origin: 'https://evil.example' }), { ok: false, code: 'BAD_ORIGIN' });
  assert.deepEqual(guarded({ ...req, fetchSite: 'cross-site' }), { ok: false, code: 'BAD_FETCH_METADATA' });
  assert.deepEqual(guarded({ ...req, contentType: 'application/x-www-form-urlencoded' }), { ok: false, code: 'BAD_CONTENT_TYPE' });
  assert.deepEqual(guarded({ ...req, bodyBytes: 1025 }), { ok: false, code: 'BAD_BODY_SIZE' });
});

test('L-LIMIT-1: bodies have bounded sizes and GET cannot carry a body', () => {
  for (const bytes of [Number.NaN, Infinity, -1, 1.25, 30_000_001, Number.MAX_SAFE_INTEGER + 1]) {
    assert.deepEqual(guarded({
      method: 'POST', path: '/api/upload', origin, contentType: 'application/octet-stream', bodyBytes: bytes,
    }, true), { ok: false, code: 'BAD_BODY_SIZE' });
  }
  assert.equal(guarded({ method: 'POST', path: '/api/upload', origin, contentType: 'application/octet-stream', bodyBytes: 30_000_000 }, true).ok, true);
  assert.deepEqual(guarded({ bodyBytes: 1 }, true), { ok: false, code: 'BAD_BODY_SIZE' });
});

test('L-PAIR-1: pairing code single-use; session only after terminal code', () => {
  let now = 10_000;
  const auth = new LocalSessionManager(() => now);
  assert.equal(auth.pair('12345678').ok, false);
  const code = auth.issueTerminalCode();
  assert.match(code, /^\d{8}$/);
  assert.deepEqual(auth.pair('wrong'), { ok: false, code: 'PAIR_INVALID' });
  const good = auth.pair(code);
  assert.equal(good.ok, true);
  if (!good.ok) return;
  assert.match(good.sessionToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(auth.authenticate(good.sessionToken), true);
  assert.equal(auth.pair(code).ok, false);
  assert.equal(auth.authenticate('not-a-real-session'), false);
  auth.revokeAll();
  assert.equal(auth.authenticate(good.sessionToken), false);
});

test('L-PAIR-1: 2-minute pairing expiration and five-failure lockout', () => {
  let now = 50_000;
  const auth = new LocalSessionManager(() => now);
  const expired = auth.issueTerminalCode();
  now += 120_000;
  assert.deepEqual(auth.pair(expired), { ok: false, code: 'PAIR_EXPIRED' });
  const valid = auth.issueTerminalCode();
  for (let n = 0; n < 4; n++) assert.deepEqual(auth.pair('not-a-code'), { ok: false, code: 'PAIR_INVALID' });
  assert.deepEqual(auth.pair('bad'), { ok: false, code: 'PAIR_LOCKED' });
  assert.deepEqual(auth.pair(valid), { ok: false, code: 'PAIR_LOCKED' });
  now += 60_001;
  assert.equal(auth.pair(valid).ok, false); // locked code was consumed; owner must reissue.
  assert.equal(auth.pair(auth.issueTerminalCode()).ok, true);
});

test('L-PAIR-1: rejected session tokens never refresh idle lifetime', () => {
  let now = 1_000;
  const auth = new LocalSessionManager(() => now);
  const paired = auth.pair(auth.issueTerminalCode());
  assert.equal(paired.ok, true);
  if (!paired.ok) return;
  now += 29 * 60_000;
  assert.equal(auth.authenticate('not-a-token'), false);
  now += 61_000;
  assert.equal(auth.authenticate(paired.sessionToken), false);
});

test('L-PAIR-1: session absolute expiration despite successful activity; rollback does not extend', () => {
  let now = 1_000;
  const auth = new LocalSessionManager(() => now);
  const paired = auth.pair(auth.issueTerminalCode());
  assert.equal(paired.ok, true);
  if (!paired.ok) return;
  for (let n = 1; n <= 7; n++) {
    now = 1_000 + n * 29 * 60_000;
    assert.equal(auth.authenticate(paired.sessionToken), true);
  }
  now = 1_000 + 4 * 60 * 60_000;
  assert.equal(auth.authenticate(paired.sessionToken), false);
  now = 1_000;
  assert.equal(auth.authenticate(paired.sessionToken), false);
});

const identity = { runId: 'demo-f01-001', sha256: 'a'.repeat(64), bytes: 1_000, kind: 'analyze' as const };

test('L-AUTH-1: mock permits are hash, byte, run, action bound and consumed on mismatch', () => {
  let now = 5_000;
  const permits = new OfflineMockPermitLedger(() => now);
  assert.deepEqual(permits.consumeMockAttempt(identity), { ok: false, code: 'NO_PERMIT' });
  assert.deepEqual(permits.issueTerminalMockPermit(identity), { ok: true });
  assert.deepEqual(permits.issueTerminalMockPermit({ ...identity, runId: 'demo-f01-002' }), { ok: false, code: 'PERMIT_PENDING' });
  assert.deepEqual(permits.consumeMockAttempt({ ...identity, sha256: 'b'.repeat(64) }), { ok: false, code: 'PERMIT_MISMATCH' });
  assert.deepEqual(permits.consumeMockAttempt(identity), { ok: false, code: 'NO_PERMIT' });
  assert.deepEqual(permits.issueTerminalMockPermit(identity), { ok: false, code: 'RUN_SPENT' });
});

test('L-AUTH-1: successful mock consumption cannot replay; expiry spends permit', () => {
  let now = 5_000;
  const permits = new OfflineMockPermitLedger(() => now);
  assert.deepEqual(permits.issueTerminalMockPermit(identity), { ok: true });
  assert.deepEqual(permits.consumeMockAttempt(identity), { ok: true });
  assert.deepEqual(permits.consumeMockAttempt(identity), { ok: false, code: 'NO_PERMIT' });
  assert.deepEqual(permits.issueTerminalMockPermit(identity), { ok: false, code: 'RUN_SPENT' });
  const next = { ...identity, runId: 'demo-f01-002', kind: 'propose' as const };
  assert.deepEqual(permits.issueTerminalMockPermit(next), { ok: true });
  now += 120_000;
  assert.deepEqual(permits.consumeMockAttempt(next), { ok: false, code: 'PERMIT_EXPIRED' });
  assert.deepEqual(permits.issueTerminalMockPermit(next), { ok: false, code: 'RUN_SPENT' });
});

test('L-AUTH-1: invalid mock permits and revoked permits refuse', () => {
  const permits = new OfflineMockPermitLedger(() => 10_000);
  assert.deepEqual(permits.issueTerminalMockPermit({ ...identity, bytes: 25_000_001 }), { ok: false, code: 'INVALID_IDENTITY' });
  assert.deepEqual(permits.issueTerminalMockPermit(identity), { ok: true });
  permits.revokePending();
  assert.deepEqual(permits.consumeMockAttempt(identity), { ok: false, code: 'NO_PERMIT' });
  assert.deepEqual(permits.issueTerminalMockPermit(identity), { ok: false, code: 'RUN_SPENT' });
});

test('L-ONE-1: no I2 positive permit can authorize inference before D9', () => {
  const permits = new OfflineMockPermitLedger(() => 10_000);
  assert.deepEqual(permits.issueTerminalMockPermit(identity), { ok: true });
  assert.deepEqual(permits.consumeMockAttempt(identity), { ok: true });
  assert.deepEqual(evaluateOfflineLiveConfiguration({ baseUrl: 'https://inference.baseten.co/v1', model: 'meta-models/muse-spark-open' }), {
    ok: false, code: 'MODEL_UNAVAILABLE_OR_UNAPPROVED', blockedBy: 'D9',
  });
});
