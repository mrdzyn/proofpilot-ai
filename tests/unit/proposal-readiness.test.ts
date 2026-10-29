// C3-B2A zero-network readiness preflight. No provider, no Modal, no model: the preflight has no way to make a
// request, and a global fetch trap fails the run if anything tries.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseSymptom } from '../../packages/core/src/index.ts';
import { runProposalPreflight, trustedFactsFromBaseline, type PreflightInput, type PreflightReport } from '../../packages/inference/src/index.ts';
import { liveEnv, SENTINEL_KEY, tempDir, validSymptom } from '../helpers.ts';

const realFetch = globalThis.fetch;
let trapped = 0;
before(() => {
  globalThis.fetch = (() => {
    trapped++;
    throw new Error('the preflight must not touch the network');
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
  assert.equal(trapped, 0);
});

const symptom = parseSymptom(validSymptom(), { videoDurationSec: 10 });
const facts = trustedFactsFromBaseline({ viewport: { width: 390, height: 844 }, tapPoint: { x: 1, y: 1 }, hitTestTarget: 'promo-overlay', cartCountBefore: '0', cartCountAfter: '0' }, true);
const NOW = () => new Date('2026-10-29T00:00:00.000Z');
const run = (over: Partial<PreflightInput> = {}): Promise<PreflightReport> => runProposalPreflight({ providerId: 'meta', env: {}, symptom, facts, now: NOW, ...over });
const status = (r: PreflightReport, id: string) => r.checks.find((c) => c.id === id)?.status;

test('the preflight is deterministic: identical inputs give a byte-identical report', async () => {
  for (const providerId of ['meta', 'baseten'] as const) {
    const a = JSON.stringify(await run({ providerId }));
    const b = JSON.stringify(await run({ providerId }));
    assert.equal(a, b, providerId);
  }
});

test('zero provider requests, whatever the environment holds (credentials, billable and upload flags)', async () => {
  const env = { ...liveEnv(), MODEL_API_KEY: SENTINEL_KEY, BASETEN_API_KEY: SENTINEL_KEY };
  for (const providerId of ['meta', 'baseten'] as const) {
    const r = await run({ providerId, env, checkCredentialPresence: true });
    assert.equal(r.providerRequests, 0);
    assert.equal(r.liveAuthorization, 'NOT APPROVED (LIVE-C3-01)');
    assert.equal(r.liveQuota, 0);
    assert.equal(r.verdict, 'NOT_AUTHORIZED_TECHNICALLY_READY');
    assert.ok(r.blockers.some((b) => /LIVE-C3-01 is NOT APPROVED/.test(b)));
    assert.equal(status(r, 'entry-point-hard-disabled'), 'PASS');
    assert.equal(status(r, 'live-quota-frozen-at-zero'), 'BLOCKED_BY_DESIGN');
    assert.equal(status(r, 'model-proposals-not-executable'), 'BLOCKED_BY_DESIGN');
  }
  assert.equal(trapped, 0);
});

test('every unsafe path is exercised and refused: consent, foreign consent, model, billable gate, tampering, quota, duplicates', async () => {
  for (const providerId of ['meta', 'baseten'] as const) {
    const r = await run({ providerId });
    assert.equal(r.technicalChecksPassed, true, JSON.stringify(r.checks.filter((c) => c.status === 'FAIL')));
    for (const id of ['missing-consent-refused', 'foreign-consent-refused', 'model-mismatch-refused', 'billable-gate-refused', 'tampered-request-refused', 'quota-zero-refused', 'duplicate-run-refused', 'exhausted-quota-refused', 'pre-flight-accepts-valid-input']) {
      assert.equal(status(r, id), 'PASS', `${providerId}: ${id}`);
    }
    for (const id of ['missing-status', 'failed-status', 'incomplete-status', 'refusal', 'model-mismatch', 'empty-output', 'malformed-json', 'forbidden-content', 'unknown-key', 'out-of-grammar']) {
      assert.equal(status(r, `response-${id}-cannot-advance`), 'PASS', `${providerId}: ${id}`);
    }
    assert.equal(status(r, 'response-valid-is-only-an-untrusted-proposal'), 'PASS');
    assert.match(r.label, /NOT VERIFIED/);
  }
});

test('the exact pinned model is reported; the public Baseten alias is never accepted', async () => {
  assert.equal((await run({ providerId: 'meta' })).requestedModel, 'muse-spark-1.3');
  assert.equal((await run({ providerId: 'baseten' })).requestedModel, 'meta-models/muse-spark-open-1026');
  for (const [providerId, env] of [['meta', { META_MODEL_VISUAL: 'muse-spark-1.2' }], ['meta', { META_MODEL_VISUAL: 'muse-spark-1.3-contributor' }], ['baseten', { BASETEN_MODEL_VISUAL: 'meta-models/muse-spark-open' }]] as const) {
    const r = await run({ providerId, env });
    assert.equal(status(r, 'model-pinned'), 'FAIL', JSON.stringify(env));
    assert.equal(r.technicalChecksPassed, false);
    assert.equal(r.verdict, 'TECHNICAL_BLOCKERS');
    assert.equal(r.requestedModel, null);
  }
});

test('bad configuration cannot advance: unapproved host, malformed key, nothing after the failure runs', async () => {
  const bad = await run({ env: { META_API_BASE_URL: 'https://evil.example/v1' } });
  assert.equal(status(bad, 'config-loads'), 'FAIL');
  assert.equal(bad.verdict, 'TECHNICAL_BLOCKERS');
  assert.equal(bad.checks.some((c) => c.id === 'missing-consent-refused'), false, 'the unsafe-path checks are not run on an invalid config');
  const malformed = await run({ env: { MODEL_API_KEY: 'short' }, checkCredentialPresence: true });
  assert.equal(status(malformed, 'config-loads'), 'FAIL');
  assert.ok(!JSON.stringify(malformed).includes('short'.repeat(2)));
});

test('credential presence is a boolean and only when asked; no secret value ever reaches the report', async () => {
  const env = { MODEL_API_KEY: SENTINEL_KEY };
  const off = await run({ env });
  assert.deepEqual(off.credential, { checked: false, present: null });
  assert.equal(status(off, 'credential-presence'), 'NOT_CHECKED');
  const on = await run({ env, checkCredentialPresence: true });
  assert.deepEqual(on.credential, { checked: true, present: true });
  const missing = await run({ env: {}, checkCredentialPresence: true });
  assert.deepEqual(missing.credential, { checked: true, present: false });
  assert.equal(missing.technicalChecksPassed, false, 'a requested presence check that finds no key is a technical blocker');
  for (const r of [off, on, missing]) {
    const text = JSON.stringify(r);
    assert.ok(!text.includes(SENTINEL_KEY));
    assert.ok(!/Bearer\s/i.test(text));
  }
});

test('the report holds no raw model output and no mock answer text', async () => {
  const text = JSON.stringify(await run());
  for (const forbidden of ['"selector"', 'pointer-events', 'adjustments":[', 'verifier/']) assert.ok(!text.includes(forbidden), forbidden);
});

test('a supplied reservation tree is inspected read-only and orphan slots are reported, not recycled', async () => {
  const root = path.join(tempDir('pp-readiness-'), 'reservations');
  mkdirSync(path.join(root, 'meta/slots'), { recursive: true });
  writeFileSync(path.join(root, 'meta/slots/slot-001'), '');
  const r = await run({ reservationRoot: root });
  const c = r.checks.find((x) => x.id === 'reservation-state')!;
  assert.equal(c.status, 'INFO');
  assert.match(c.detail, /1 orphan slot/);
  assert.deepEqual(readdirSync(path.join(root, 'meta/slots')), ['slot-001'], 'nothing was modified');
});

test('the preflight leaves no temporary reservation directory behind', async () => {
  const before = readdirSync(os.tmpdir()).filter((n) => n.startsWith('pp-preflight-')).length;
  await run();
  await run({ providerId: 'baseten' });
  assert.equal(readdirSync(os.tmpdir()).filter((n) => n.startsWith('pp-preflight-')).length, before);
});

test('a regressed repository is reported, not hidden: an enabled entry point or a raised live quota fails the preflight', async () => {
  const enabled = await run({ inspect: { entryPoint: async () => ({ accepted: true }) } });
  assert.equal(status(enabled, 'entry-point-hard-disabled'), 'FAIL');
  assert.equal(enabled.technicalChecksPassed, false);
  assert.equal(enabled.verdict, 'TECHNICAL_BLOCKERS');
  assert.ok(enabled.blockers.some((b) => /entry-point-hard-disabled/.test(b)));
  const wrongRefusal = await run({ inspect: { entryPoint: async () => { throw new Error('some other failure'); } } });
  assert.equal(status(wrongRefusal, 'entry-point-hard-disabled'), 'FAIL', 'only LIVE_NOT_APPROVED counts as the refusal');
  const raised = await run({ inspect: { liveQuota: { meta: 1 } } });
  assert.equal(status(raised, 'live-quota-frozen-at-zero'), 'FAIL');
  assert.equal(raised.verdict, 'TECHNICAL_BLOCKERS');
  assert.equal(raised.liveAuthorization, 'NOT APPROVED (LIVE-C3-01)', 'the preflight never reports an authorization');
  assert.equal((await run({ providerId: 'baseten', inspect: { liveQuota: { meta: 1 } } })).technicalChecksPassed, true, 'another provider is judged on its own quota');
});

// ---- MINOR-2: provider key fields are read only on explicit credential-check authorization ----
const SECRET_FIELDS = ['MODEL_API_KEY', 'BASETEN_API_KEY'];
function instrumentedEnv(extra: Record<string, string> = {}): { env: Record<string, string | undefined>; reads: string[] } {
  const reads: string[] = [];
  const target: Record<string, string | undefined> = { MODEL_API_KEY: SENTINEL_KEY, BASETEN_API_KEY: SENTINEL_KEY, ...extra };
  const env = new Proxy(target, {
    get(t, k) {
      if (typeof k === 'string') reads.push(k);
      return t[k as string];
    },
    has(t, k) {
      if (typeof k === 'string') reads.push(k);
      return k in t;
    },
    ownKeys(t) {
      reads.push('<ownKeys>');
      return Reflect.ownKeys(t);
    },
    getOwnPropertyDescriptor(t, k) {
      if (typeof k === 'string') reads.push(k);
      return Reflect.getOwnPropertyDescriptor(t, k);
    },
  });
  return { env, reads };
}

test('MINOR-2: the default preflight never accesses any provider API-key field, for either provider', async () => {
  for (const providerId of ['meta', 'baseten'] as const) {
    for (const checkCredentialPresence of [undefined, false]) {
      const { env, reads } = instrumentedEnv();
      const report = await run({ providerId, env, checkCredentialPresence });
      assert.equal(report.verdict, 'NOT_AUTHORIZED_TECHNICALLY_READY');
      assert.deepEqual(report.credential, { checked: false, present: null });
      for (const f of SECRET_FIELDS) assert.equal(reads.includes(f), false, `${providerId}: ${f} was accessed without authorization`);
      assert.equal(reads.includes('<ownKeys>'), false, 'the environment was enumerated');
      assert.ok(!JSON.stringify(report).includes(SENTINEL_KEY));
    }
  }
});

test('MINOR-2: with explicit authorization only the selected provider key is read, and only presence is reported', async () => {
  for (const [providerId, field, other] of [['meta', 'MODEL_API_KEY', 'BASETEN_API_KEY'], ['baseten', 'BASETEN_API_KEY', 'MODEL_API_KEY']] as const) {
    const { env, reads } = instrumentedEnv();
    const report = await run({ providerId, env, checkCredentialPresence: true });
    assert.equal(reads.includes(field), true);
    assert.equal(reads.includes(other), false, 'the other provider key was read');
    assert.deepEqual(report.credential, { checked: true, present: true });
    assert.ok(!JSON.stringify(report).includes(SENTINEL_KEY));
    assert.ok(!/Bearer\s/i.test(JSON.stringify(report)));
  }
  const { env } = instrumentedEnv();
  delete env.MODEL_API_KEY;
  assert.deepEqual((await run({ env, checkCredentialPresence: true })).credential, { checked: true, present: false });
});

test('MINOR-2: a malformed key does not fail a default run (it is not read) and fails an authorized one without echoing it', async () => {
  const env = { MODEL_API_KEY: 'bad key with spaces' };
  assert.equal((await run({ env })).verdict, 'NOT_AUTHORIZED_TECHNICALLY_READY');
  const on = await run({ env, checkCredentialPresence: true });
  assert.equal(on.verdict, 'TECHNICAL_BLOCKERS');
  assert.ok(!JSON.stringify(on).includes('bad key'));
});
