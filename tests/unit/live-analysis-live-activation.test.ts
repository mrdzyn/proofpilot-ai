// UI-C3-02-D9-I1: live activation readiness at the server boundary.
// Everything here runs with D9 pending (null), injected fetch doubles, and
// temp-dir records — zero provider calls, zero credentials. The live branch
// itself stays unreachable; these tests pin the gates around it: startup
// refusal without a record, corrupt-record fail-closed, effective budgets
// minus durable spend, the precheck decision table, and status provenance.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  checkLivePrecheck,
  createCompanion,
  describeActivationState,
  type ApiMeta,
  type Companion,
} from '../../packages/live-analysis/src/server.ts';
import { LocalSessionManager } from '../../packages/live-analysis/src/local-session.ts';
import { OfflineMockPermitLedger } from '../../packages/live-analysis/src/mock-permits.ts';
import { BASETEN_DOCUMENTED_DIRECT_MODEL } from '../../packages/live-analysis/src/config.ts';
import {
  createBasetenTransport,
  type BasetenTransport,
  type LiveFetch,
  type LiveFetchResponse,
} from '../../packages/live-analysis/src/baseten-transport.ts';
import { openSpentRecord } from '../../packages/live-analysis/src/live-spent-record.ts';
import { StagedUploads } from '../../packages/live-analysis/src/uploads.ts';
import type { MediaDeps } from '../../packages/intake/src/media.ts';

const HOST = '127.0.0.1:5190';
const ORIGIN = `http://${HOST}`;
const SHA_A = 'a'.repeat(64);

const stubMedia: MediaDeps = {
  probe: async () => ({
    formatName: 'mp4',
    formatDurationSec: 3,
    streams: [{ codecType: 'video', codecName: 'h264', durationSec: 3, width: 390, height: 844 }],
  }),
  decodeCheck: async () => ({ ok: true, detail: '' }),
};

let root = '';
const closers: Array<() => Promise<void>> = [];
before(() => {
  root = mkdtempSync(path.join(tmpdir(), 'pp-live-activation-'));
});
after(async () => {
  for (const close of closers.splice(0)) await close();
  rmSync(root, { recursive: true, force: true });
});

function countingDouble(calls: { count: number }): LiveFetch {
  return (url, init) => {
    calls.count += 1;
    const response: LiveFetchResponse = {
      status: 200,
      url,
      json: () => Promise.resolve({
        model: BASETEN_DOCUMENTED_DIRECT_MODEL,
        choices: [{ message: { content: 'live tap then count one' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    };
    void init;
    return Promise.resolve(response);
  };
}

function liveTransportDouble(calls: { count: number }): BasetenTransport {
  const created = createBasetenTransport({
    model: BASETEN_DOCUMENTED_DIRECT_MODEL,
    apiKey: 'NOT-A-REAL-KEY-0000',
    fetchImpl: countingDouble(calls),
    timeoutMs: 2000,
  });
  assert.equal(created.ok, true, JSON.stringify(created));
  return (created as { ok: true; transport: BasetenTransport }).transport;
}

const meta = (parts: Partial<ApiMeta>, sessionToken?: string): ApiMeta => ({
  method: 'GET',
  path: '/api/health',
  host: HOST,
  ...parts,
  ...(sessionToken === undefined ? {} : { sessionToken }),
});

async function freshUploads(name: string): Promise<StagedUploads> {
  const sub = mkdtempSync(path.join(root, `${name}-`));
  return StagedUploads.openDir(sub, { mediaDeps: stubMedia });
}

test('L-ACT-0: activation wording is derived from the gate, never hardcoded', () => {
  assert.deepEqual(describeActivationState({ liveConfigured: false, d9Approved: false }), {
    transport: 'mock-fixture (no live inference; D9 pending)',
    liveTransport: 'none',
    d9: 'pending (blocks any live call)',
    modelOk: false,
  });
  assert.deepEqual(describeActivationState({ liveConfigured: true, d9Approved: false }), {
    transport: 'mock-fixture + baseten-live (D9-gated; no live call without owner approval)',
    liveTransport: 'baseten-live (D9-gated)',
    d9: 'pending (blocks any live call)',
    modelOk: false,
  });
  assert.deepEqual(describeActivationState({ liveConfigured: true, d9Approved: true }), {
    transport: 'mock-fixture + baseten-live (owner-approved)',
    liveTransport: 'baseten-live (owner-approved)',
    d9: 'approved',
    modelOk: true,
  }, 'a hypothetical approved gate reports approved — never claims live is disabled when armed');
});

test('L-ACT-1: precheck decision table — D9 first, then record health, then budget', () => {
  assert.deepEqual(
    checkLivePrecheck({ d9Approved: false, poisoned: false, attemptsLeft: 1 }),
    { ok: false, code: 'MODEL_UNAVAILABLE_OR_UNAPPROVED' },
  );
  assert.deepEqual(
    checkLivePrecheck({ d9Approved: true, poisoned: true, attemptsLeft: 1 }),
    { ok: false, code: 'LIVE_SPEND_RECORD_FAILED' },
  );
  assert.deepEqual(
    checkLivePrecheck({ d9Approved: true, poisoned: false, attemptsLeft: 0 }),
    { ok: false, code: 'QUOTA_SPENT' },
  );
  assert.deepEqual(
    checkLivePrecheck({ d9Approved: true, poisoned: false, attemptsLeft: 2 }),
    { ok: true },
  );
  assert.deepEqual(
    checkLivePrecheck({ d9Approved: false, poisoned: true, attemptsLeft: 0 }),
    { ok: false, code: 'MODEL_UNAVAILABLE_OR_UNAPPROVED' },
    'D9 refusal keeps priority',
  );
});

test('L-ACT-2: nonzero live budget without a record path refuses startup', async () => {
  const calls = { count: 0 };
  await assert.rejects(
    createCompanion({
      port: 5190,
      bind: false,
      serveRoot: null,
      uploads: await freshUploads('no-record'),
      session: new LocalSessionManager(),
      permits: new OfflineMockPermitLedger(),
      liveTransport: liveTransportDouble(calls),
      liveModel: BASETEN_DOCUMENTED_DIRECT_MODEL,
      liveAnalysesLeft: 1,
    }),
    (error: unknown) => (error as { code?: string }).code === 'LIVE_BUDGET_REQUIRES_RECORD',
    'a restart would re-arm an in-memory-only budget',
  );
  assert.equal(calls.count, 0);
});

test('L-ACT-3: malformed media pin refuses startup', async () => {
  const calls = { count: 0 };
  for (const pin of ['short', 'ZZ'.repeat(32), 42, '']) {
    await assert.rejects(
      createCompanion({
        port: 5190,
        bind: false,
        serveRoot: null,
        uploads: await freshUploads('bad-pin'),
        session: new LocalSessionManager(),
        permits: new OfflineMockPermitLedger(),
        liveTransport: liveTransportDouble(calls),
        liveModel: BASETEN_DOCUMENTED_DIRECT_MODEL,
        liveSpentRecordPath: path.join(root, 'pin-record.jsonl'),
        liveMediaSha256: pin as string,
      }),
      (error: unknown) => (error as { code?: string }).code === 'LIVE_MEDIA_PIN_INVALID',
      `pin rejected: ${String(pin)}`,
    );
  }
});

test('L-ACT-4: corrupt spent record refuses startup', async () => {
  const calls = { count: 0 };
  const { chmodSync, writeFileSync } = await import('node:fs');
  const corrupt = path.join(root, 'corrupt.jsonl');
  writeFileSync(corrupt, '{"v":1,"broken":true}\n', { encoding: 'utf8', mode: 0o600 });
  chmodSync(corrupt, 0o600);
  await assert.rejects(
    createCompanion({
      port: 5190,
      bind: false,
      serveRoot: null,
      uploads: await freshUploads('corrupt-record'),
      session: new LocalSessionManager(),
      permits: new OfflineMockPermitLedger(),
      liveTransport: liveTransportDouble(calls),
      liveModel: BASETEN_DOCUMENTED_DIRECT_MODEL,
      liveAnalysesLeft: 1,
      liveSpentRecordPath: corrupt,
    }),
    (error: unknown) => (error as { code?: string }).code === 'LIVE_SPEND_RECORD_CORRUPT',
    'tampered state fails closed',
  );
  assert.equal(calls.count, 0);
});

test('L-ACT-4b: missing record without a bootstrap approval refuses startup', async () => {
  const calls = { count: 0 };
  await assert.rejects(
    createCompanion({
      port: 5190,
      bind: false,
      serveRoot: null,
      uploads: await freshUploads('missing-record'),
      session: new LocalSessionManager(),
      permits: new OfflineMockPermitLedger(),
      liveTransport: liveTransportDouble(calls),
      liveModel: BASETEN_DOCUMENTED_DIRECT_MODEL,
      liveAnalysesLeft: 1,
      liveSpentRecordPath: path.join(root, 'never-created.jsonl'),
    }),
    (error: unknown) => (error as { code?: string }).code === 'LIVE_SPEND_RECORD_MISSING',
    'deletion must not silently re-arm: a fresh owner approval is required',
  );
  assert.equal(calls.count, 0);
});

test('L-ACT-4c: two companions cannot share one record; the second is refused', async () => {
  const calls = { count: 0 };
  const recordPath = path.join(root, 'contended.jsonl');
  const holds = openSpentRecord(recordPath, { bootstrapApprovalId: 'd9i1-test-bootstrap-act-4c' });
  closers.push(() => Promise.resolve().then(() => holds.release()));
  const blocked: Companion | null = await createCompanion({
    port: 5190,
    bind: false,
    serveRoot: null,
    uploads: await freshUploads('contended-second'),
    session: new LocalSessionManager(),
    permits: new OfflineMockPermitLedger(),
    liveTransport: liveTransportDouble(calls),
    liveModel: BASETEN_DOCUMENTED_DIRECT_MODEL,
    liveAnalysesLeft: 1,
    liveSpentRecordPath: recordPath,
  }).then(
    () => null,
    (error: unknown) => {
      assert.equal((error as { code?: string }).code, 'LIVE_RECORD_LOCKED');
      return null;
    },
  );
  assert.equal(blocked, null, 'no second companion starts on a held record');
  assert.equal(calls.count, 0, 'zero provider calls across both attempts');
});

test('L-ACT-5: effective budget subtracts durable spend; restart cannot re-arm', async () => {
  const calls = { count: 0 };
  const recordPath = path.join(root, 'shared-spent.jsonl');
  const seed = openSpentRecord(recordPath, { bootstrapApprovalId: 'd9i1-test-bootstrap-act-5' });
  seed.record({ runId: 'local-prior-001', sha256: SHA_A, kind: 'analyze', spentAt: 1 });
  seed.release();
  const first: Companion = await createCompanion({
    port: 5190,
    bind: false,
    serveRoot: null,
    uploads: await freshUploads('restart-a'),
    session: new LocalSessionManager(),
    permits: new OfflineMockPermitLedger(),
    liveTransport: liveTransportDouble(calls),
    liveModel: BASETEN_DOCUMENTED_DIRECT_MODEL,
    liveAnalysesLeft: 1,
    liveProposalsLeft: 2,
    liveSpentRecordPath: recordPath,
  });
  closers.push(() => first.close().catch(() => undefined));
  const code = first.sessions.issueTerminalCode();
  const pairOut = await first.dispatch(
    meta({ method: 'POST', path: '/api/pair', origin: ORIGIN, contentType: 'application/json' }),
    new Uint8Array(Buffer.from(JSON.stringify({ code }), 'utf8')),
  );
  assert.equal(pairOut.status, 200, JSON.stringify(pairOut.body));
  const session = (pairOut.body as { sessionToken: string }).sessionToken;
  const status = await first.dispatch(meta({ method: 'GET', path: '/api/status' }, session), new Uint8Array(0));
  assert.equal(status.status, 200, JSON.stringify(status.body));
  const live = (status.body as { live: { attemptsLeft: { analyze: number; propose: number }; spentRecord: string; mediaPin: boolean; poisoned: boolean; transport: string; d9: string; modelOk: boolean } }).live;
  assert.equal(live.attemptsLeft.analyze, 0, 'configured 1 minus recorded 1 is 0');
  assert.equal(live.attemptsLeft.propose, 2, 'actions spend independently');
  assert.equal(live.spentRecord, 'configured');
  assert.equal(live.mediaPin, false);
  assert.equal(live.poisoned, false);
  // MINOR-1: status words reflect the real gate — D9 pending, not hardcoded.
  assert.equal(live.transport, 'baseten-live (D9-gated)');
  assert.equal(live.d9, 'pending (blocks any live call)');
  assert.equal(live.modelOk, false);
  const config = (status.body as { config: { modelOk: boolean; d9: string } }).config;
  assert.equal(config.modelOk, false);
  assert.equal(config.d9, 'pending (blocks any live call)');
  assert.equal(
    (status.body as { transport: string }).transport,
    'mock-fixture + baseten-live (D9-gated; no live call without owner approval)',
  );
  const quota = (status.body as { quota: { analysesLeft: number } }).quota;
  assert.equal(quota.analysesLeft, 3, 'mock quota untouched by recorded live spend');
  // A second companion on the same record path sees the same spent state.
  // The first releases its exclusive lock on close before the handover.
  await first.close();
  const second: Companion = await createCompanion({
    port: 5190,
    bind: false,
    serveRoot: null,
    uploads: await freshUploads('restart-b'),
    session: new LocalSessionManager(),
    permits: new OfflineMockPermitLedger(),
    liveTransport: liveTransportDouble(calls),
    liveModel: BASETEN_DOCUMENTED_DIRECT_MODEL,
    liveAnalysesLeft: 1,
    liveSpentRecordPath: recordPath,
  });
  closers.push(() => second.close().catch(() => undefined));
  const code2 = second.sessions.issueTerminalCode();
  const pairOut2 = await second.dispatch(
    meta({ method: 'POST', path: '/api/pair', origin: ORIGIN, contentType: 'application/json' }),
    new Uint8Array(Buffer.from(JSON.stringify({ code: code2 }), 'utf8')),
  );
  assert.equal(pairOut2.status, 200, JSON.stringify(pairOut2.body));
  const session2 = (pairOut2.body as { sessionToken: string }).sessionToken;
  const status2 = await second.dispatch(meta({ method: 'GET', path: '/api/status' }, session2), new Uint8Array(0));
  assert.equal(status2.status, 200, JSON.stringify(status2.body));
  assert.equal(
    (status2.body as { live: { attemptsLeft: { analyze: number } } }).live.attemptsLeft.analyze,
    0,
    'restart-equivalent instance cannot re-arm the spent attempt',
  );
  assert.equal(calls.count, 0, 'zero provider calls across both instances');
});
