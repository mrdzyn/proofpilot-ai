// UI-C3-02-BT-LIVE-01 MAJOR-2: live provider-attempt accounting is separate
// from the mock success quota, spent exactly once at the irreversible
// outbound-send boundary, and never restored by timeout, cancellation,
// transport failure, or sanitizer refusal.
//
// D9 approved: the live branch is exercised end to end with injected fetch
// doubles (L-ATT-6). The remaining tests pin the units the live branch is
// wired from: the ledger, the exactly-once send spender, and the absence of
// any refund path.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createLiveAttemptLedger,
  createLiveSendSpender,
  type LiveAttemptLedger,
} from '../../packages/live-analysis/src/live-attempts.ts';
import { openSpentRecord } from '../../packages/live-analysis/src/live-spent-record.ts';
import { createCompanion, type ApiMeta, type Companion } from '../../packages/live-analysis/src/server.ts';
import { LocalSessionManager } from '../../packages/live-analysis/src/local-session.ts';
import { OfflineMockPermitLedger } from '../../packages/live-analysis/src/mock-permits.ts';
import {
  D9_APPROVED_MODEL,
  BASETEN_APPROVED_ENDPOINT,
} from '../../packages/live-analysis/src/config.ts';
import {
  createBasetenTransport,
  type BasetenTransport,
  type LiveFetch,
  type LiveFetchResponse,
} from '../../packages/live-analysis/src/baseten-transport.ts';
import { StagedUploads } from '../../packages/live-analysis/src/uploads.ts';
import type { MediaDeps } from '../../packages/intake/src/media.ts';

test('L-ATT-1: ledger floors seeded budgets, spends per action, and clamps at zero', () => {
  const ledger = createLiveAttemptLedger({ analyses: 2, proposals: 1 });
  assert.equal(ledger.left('analyze'), 2);
  assert.equal(ledger.left('propose'), 1);
  assert.equal(ledger.consume('analyze'), true);
  assert.equal(ledger.left('analyze'), 1);
  assert.equal(ledger.left('propose'), 1, 'actions spend independently');
  assert.equal(ledger.consume('propose'), true);
  assert.equal(ledger.consume('propose'), false, 'exhausted action refuses');
  assert.equal(ledger.left('propose'), 0, 'never negative');
  assert.equal(ledger.consume('analyze'), true);
  assert.equal(ledger.consume('analyze'), false);
  assert.equal(ledger.left('analyze'), 0);
});

test('L-ATT-2: hostile seeds floor to zero, never to credit', () => {
  for (const seed of [-1, 1.5, Number.NaN, 'many', null, undefined, Number.MAX_SAFE_INTEGER + 1]) {
    const ledger = createLiveAttemptLedger({ analyses: seed, proposals: seed });
    assert.equal(ledger.left('analyze'), 0, `analyses floors: ${String(seed)}`);
    assert.equal(ledger.left('propose'), 0, `proposals floors: ${String(seed)}`);
    assert.equal(ledger.consume('analyze'), false);
    assert.equal(ledger.consume('propose'), false);
  }
});

test('L-ATT-2b: unlimited analyses never exhaust; proposals stay numeric', () => {
  const ledger = createLiveAttemptLedger({ analyses: Number.POSITIVE_INFINITY, proposals: 0 });
  assert.equal(ledger.left('analyze'), Number.POSITIVE_INFINITY, 'unlimited stays unlimited');
  for (let i = 0; i < 3; i++) {
    assert.equal(ledger.consume('analyze'), true, `unlimited consume ${i + 1} authorizes`);
    assert.equal(ledger.left('analyze'), Number.POSITIVE_INFINITY, 'unlimited never depletes');
  }
  assert.equal(ledger.consume('propose'), false, 'zero proposals still refuse under unlimited analyses');
});

test('L-ATT-3: no refund path exists on the ledger surface', () => {
  const ledger = createLiveAttemptLedger({ analyses: 1, proposals: 0 });
  assert.deepEqual(Object.keys(ledger).sort(), ['consume', 'left'], 'consume is the only mutation entry');
  assert.equal(ledger.consume('analyze'), true);
  // Every post-send failure outcome — timeout, cancel-after-send, HTTP
  // error, malformed reply, model mismatch, sanitizer refusal — holds no
  // ledger handle and calls nothing: the spent attempt stays spent.
  assert.equal(ledger.left('analyze'), 0);
  assert.equal(ledger.consume('analyze'), false);
  assert.equal(ledger.left('analyze'), 0);
});

test('L-ATT-4: the send spender authorizes one send, then refuses repeats', () => {
  const ledger = createLiveAttemptLedger({ analyses: 1, proposals: 1 });
  const spendAnalyze = createLiveSendSpender(ledger, 'analyze');
  assert.deepEqual(spendAnalyze(), { ok: true }, 'first invocation authorizes the send');
  assert.deepEqual(
    spendAnalyze(),
    { ok: false, code: 'LIVE_ATTEMPT_EXHAUSTED' },
    'a repeat invocation is not a second authorization',
  );
  assert.deepEqual(
    spendAnalyze(),
    { ok: false, code: 'LIVE_ATTEMPT_EXHAUSTED' },
    'a third invocation authorizes nothing either',
  );
  assert.equal(ledger.left('analyze'), 0, 'one run spends one attempt despite a triple-fired hook');
  assert.equal(ledger.left('propose'), 1, 'the other action is untouched');
  const spendPropose = createLiveSendSpender(ledger, 'propose');
  assert.deepEqual(spendPropose(), { ok: true });
  assert.equal(ledger.left('propose'), 0);
});

test('L-ATT-5: one-attempt-only under concurrency; budget of N yields exactly N sends', async () => {
  const ledger: LiveAttemptLedger = createLiveAttemptLedger({ analyses: 1, proposals: 3 });
  const racers = Array.from({ length: 10 }, () => createLiveSendSpender(ledger, 'analyze'));
  const outcomes = await Promise.all(racers.map((spend) => Promise.resolve().then(spend)));
  assert.equal(outcomes.filter((o) => o.ok).length, 1, 'a budget of one authorizes exactly one sender');
  assert.equal(outcomes.filter((o) => !o.ok).length, 9, 'the other nine racers are refused');
  for (const denied of outcomes.filter((o) => !o.ok)) {
    assert.deepEqual(denied, { ok: false, code: 'LIVE_ATTEMPT_EXHAUSTED' });
  }
  assert.equal(ledger.left('analyze'), 0, 'a budget of one survives a ten-way race with exactly one spend');
  const proposeRacers = Array.from({ length: 10 }, () => createLiveSendSpender(ledger, 'propose'));
  const proposeOutcomes = await Promise.all(proposeRacers.map((spend) => Promise.resolve().then(spend)));
  assert.equal(proposeOutcomes.filter((o) => o.ok).length, 3, 'a budget of three authorizes exactly three senders');
  assert.equal(ledger.left('propose'), 0, 'a budget of three is fully spent, never overdrawn');
  assert.equal(ledger.consume('propose'), false, 'no credit beyond the budget');
});

test('L-ATT-7: an exhausted ledger authorizes nothing and spends nothing', () => {
  const ledger = createLiveAttemptLedger({ analyses: 0, proposals: 0 });
  const spend = createLiveSendSpender(ledger, 'analyze');
  assert.deepEqual(spend(), { ok: false, code: 'LIVE_ATTEMPT_EXHAUSTED' });
  assert.equal(ledger.left('analyze'), 0, 'failed authorization consumes no attempt');
  assert.deepEqual(spend(), { ok: false, code: 'LIVE_ATTEMPT_EXHAUSTED' }, 'a refused spender stays refused');
  assert.equal(ledger.consume('analyze'), false, 'still nothing to consume');
});

test('L-ATT-8: the authorize callback fires exactly once per authorized send', () => {
  const ledger = createLiveAttemptLedger({ analyses: 1, proposals: 0 });
  let calls = 0;
  const spend = createLiveSendSpender(ledger, 'analyze', () => {
    calls += 1;
  });
  assert.deepEqual(spend(), { ok: true });
  assert.equal(calls, 1, 'recorded exactly once at the send boundary');
  assert.deepEqual(spend(), { ok: false, code: 'LIVE_ATTEMPT_EXHAUSTED' });
  assert.equal(calls, 1, 'repeat invocation records nothing more');
});

test('L-ATT-9: a throwing authorize callback denies the send without restoring', () => {
  const ledger = createLiveAttemptLedger({ analyses: 1, proposals: 0 });
  const spend = createLiveSendSpender(ledger, 'analyze', () => {
    throw new Error('disk unavailable (test double)');
  });
  assert.throws(() => spend(), /disk unavailable/, 'the failure propagates so the send never happens');
  assert.equal(ledger.left('analyze'), 0, 'the ledger stays consumed — a retry cannot double-spend');
  assert.deepEqual(spend(), { ok: false, code: 'LIVE_ATTEMPT_EXHAUSTED' }, 'the failed run stays denied');
});

test('L-ATT-10: the authorize callback composes with the durable record', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pp-att-record-'));
  try {
    const recordPath = path.join(dir, 'spent.jsonl');
    const ledger = createLiveAttemptLedger({ analyses: 1, proposals: 0 });
    const spend = createLiveSendSpender(ledger, 'analyze', () => {
      const handle = openSpentRecord(recordPath, { bootstrapApprovalId: 'd9i1-test-bootstrap-att-10' });
      try {
        handle.record({ runId: 'r-1', sha256: 'a'.repeat(64), kind: 'analyze', spentAt: 1 });
      } finally {
        handle.release();
      }
    });
    assert.deepEqual(spend(), { ok: true });
    const reopened = openSpentRecord(recordPath);
    assert.equal(reopened.countSpent('analyze'), 1, 'the send-boundary callback durably recorded the spend');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// D9 approved: the live branch is exercised end to end with injected fetch
// doubles (fake key, pinned endpoint/model assertions inside the double).
const HOST = '127.0.0.1:5189';
const ORIGIN = `http://${HOST}`;

const ftyp = (size: number): Uint8Array => {
  const buf = Buffer.alloc(size);
  buf.writeUInt32BE(24, 0);
  buf.write('ftypisom', 4, 'ascii');
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
};
const GOOD_BYTES = ftyp(4096);
const shaOf = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

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

function countingDouble(calls: { count: number; bodies: unknown[] }): LiveFetch {
  return (url, init) => {
    calls.count += 1;
    assert.equal(url, BASETEN_APPROVED_ENDPOINT);
    calls.bodies.push(JSON.parse(init.body));
    const response: LiveFetchResponse = {
      status: 200,
      url,
      json: () => Promise.resolve({
        model: D9_APPROVED_MODEL,
        choices: [{ message: { content: 'live tap then count one' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    };
    return Promise.resolve(response);
  };
}

function liveTransportDouble(calls: { count: number; bodies: unknown[] }): BasetenTransport {
  const created = createBasetenTransport({
    model: D9_APPROVED_MODEL,
    apiKey: 'NOT-A-REAL-KEY-0000',
    fetchImpl: countingDouble(calls),
    timeoutMs: 2000,
  });
  assert.equal(created.ok, true, JSON.stringify(created));
  return (created as { ok: true; transport: BasetenTransport }).transport;
}

before(() => {
  root = mkdtempSync(path.join(tmpdir(), 'pp-live-attempts-'));
});

after(async () => {
  for (const close of closers.splice(0)) await close();
  rmSync(root, { recursive: true, force: true });
});

const meta = (parts: Partial<ApiMeta>, sessionToken?: string): ApiMeta => ({
  method: 'GET',
  path: '/api/health',
  host: HOST,
  ...parts,
  ...(sessionToken === undefined ? {} : { sessionToken }),
});
const json = (value: unknown): Uint8Array => new Uint8Array(Buffer.from(JSON.stringify(value), 'utf8'));

async function awaitLiveRun(app: Companion, session: string, runId: string): Promise<Record<string, unknown>> {
  const start = Date.now();
  for (;;) {
    const events = await app.dispatch(meta({ method: 'GET', path: '/api/events' }, session), new Uint8Array(0));
    const record = ((events.body as { runs: Array<{ runId: string; state: string }> }).runs).find((r) => r.runId === runId);
    if (record !== undefined && record.state === 'done') return record as unknown as Record<string, unknown>;
    if (record !== undefined && record.state !== 'analyzing') {
      throw new Error(`live run ${runId} settled as ${record.state}, wanted done`);
    }
    if (Date.now() - start > 10_000) throw new Error(`timed out waiting for live run ${runId}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

// D9 approved end to end: the pinned demo media flows pair → permit → upload
// → analyze through the live branch with an injected fetch double. Exactly
// the approved model goes out, the spend is durably recorded, the result
// carries baseten-live provenance with reported usage, mock quota is
// untouched, a foreign-bytes attempt is pinned out with zero extra egress,
// and the exhausted budget refuses without another POST.
test('L-ATT-6: approved D9 sends one live request — pin, permit, spend, provenance', async () => {
  const calls = { count: 0, bodies: [] as unknown[] };
  const sub = mkdtempSync(path.join(root, 'app-'));
  // The record lives outside the staging dir: close() sweeps staging.
  const recordPath = path.join(root, 'att-6-spent.jsonl');
  const sha = shaOf(GOOD_BYTES);
  const app: Companion = await createCompanion({
    port: 5189,
    bind: false,
    serveRoot: null,
    uploads: StagedUploads.openDir(sub, { mediaDeps: stubMedia }),
    runTimeoutMs: 5000,
    session: new LocalSessionManager(),
    permits: new OfflineMockPermitLedger(),
    liveTransport: liveTransportDouble(calls),
    liveModel: D9_APPROVED_MODEL,
    liveAnalysesLeft: 2,
    liveProposalsLeft: 0,
    liveSpentRecordPath: recordPath,
    liveBootstrapApprovalId: 'd9i1-test-bootstrap-att-6',
    liveMediaSha256: sha,
  });
  closers.push(() => app.close().catch(() => undefined));
  const code = app.sessions.issueTerminalCode();
  const pairOut = await app.dispatch(
    meta({ method: 'POST', path: '/api/pair', origin: ORIGIN, contentType: 'application/json' }),
    json({ code }),
  );
  assert.equal(pairOut.status, 200, JSON.stringify(pairOut.body));
  const session = (pairOut.body as { sessionToken: string }).sessionToken;
  assert.equal(app.terminalPermit('analyze', sha, GOOD_BYTES.length).ok, true);
  const up = await app.dispatch(
    meta({ method: 'POST', path: '/api/upload', origin: ORIGIN, contentType: 'application/octet-stream', declaredSha256: sha, declaredBytes: String(GOOD_BYTES.length), declaredKind: 'analyze' }, session),
    GOOD_BYTES,
  );
  assert.equal(up.status, 200, JSON.stringify(up.body));
  const out = await app.dispatch(
    meta({ method: 'POST', path: '/api/analyze', origin: ORIGIN, contentType: 'application/json' }, session),
    json({ uploadId: (up.body as { uploadId: string }).uploadId, sha256: sha, bytes: GOOD_BYTES.length }),
  );
  assert.equal(out.status, 200, JSON.stringify(out.body));
  assert.deepEqual(
    { model: (out.body as { model: string }).model, provider: (out.body as { provider: string }).provider, transport: (out.body as { transport: string }).transport },
    { model: 'meta-models/muse-spark-open-1026', provider: 'baseten', transport: 'baseten-live' },
    'the accept names the exact approved model and live provenance',
  );
  const record = await awaitLiveRun(app, session, (out.body as { runId: string }).runId);
  const result = record['result'] as Record<string, unknown>;
  assert.equal(result['transport'], 'baseten-live');
  assert.equal(result['liveInference'], true);
  assert.equal(result['provider'], 'baseten');
  assert.equal(result['model'], 'meta-models/muse-spark-open-1026');
  assert.equal(result['observations'], 'live tap then count one');
  assert.deepEqual(result['usage'], { promptTokens: 10, completionTokens: 5, totalTokens: 15 }, 'reported usage, never billing');
  assert.equal(calls.count, 1, 'exactly one outbound POST for the authorized attempt');
  assert.equal((calls.bodies[0] as { model: string }).model, 'meta-models/muse-spark-open-1026', 'the egress names the exact approved model');
  const spends = readFileSync(recordPath, 'utf8').split('\n').filter((l) => l.includes('"entry":"spend"'));
  assert.equal(spends.length, 1, 'the send-boundary spend is durably recorded while the companion holds the lock');
  const status = await app.dispatch(meta({ method: 'GET', path: '/api/status' }, session), new Uint8Array(0));
  assert.equal(((status.body as { quota: { analysesLeft: number } }).quota).analysesLeft, 3, 'mock success quota untouched by the live send');
  // Media pinning: foreign bytes are refused before any second egress.
  const other = ftyp(2048);
  const sha2 = shaOf(other);
  assert.equal(app.terminalPermit('analyze', sha2, other.length).ok, true);
  const up2 = await app.dispatch(
    meta({ method: 'POST', path: '/api/upload', origin: ORIGIN, contentType: 'application/octet-stream', declaredSha256: sha2, declaredBytes: String(other.length), declaredKind: 'analyze' }, session),
    other,
  );
  assert.equal(up2.status, 200, JSON.stringify(up2.body));
  const pinned = await app.dispatch(
    meta({ method: 'POST', path: '/api/analyze', origin: ORIGIN, contentType: 'application/json' }, session),
    json({ uploadId: (up2.body as { uploadId: string }).uploadId, sha256: sha2, bytes: other.length }),
  );
  assert.equal(pinned.status, 422, JSON.stringify(pinned.body));
  assert.equal((pinned.body as { code: string }).code, 'MEDIA_NOT_PINNED');
  assert.equal(calls.count, 1, 'the pinned-out attempt sends nothing');
  // The refused permit stays pending by design; the owner revokes, re-pairs,
  // and re-permits. Budget: the second authorized analysis sends once more,
  // then refuses.
  app.terminalRevoke();
  const code2 = app.sessions.issueTerminalCode();
  const pairOut2 = await app.dispatch(
    meta({ method: 'POST', path: '/api/pair', origin: ORIGIN, contentType: 'application/json' }),
    json({ code: code2 }),
  );
  assert.equal(pairOut2.status, 200, JSON.stringify(pairOut2.body));
  const session2 = (pairOut2.body as { sessionToken: string }).sessionToken;
  assert.equal(app.terminalPermit('analyze', sha, GOOD_BYTES.length).ok, true);
  const up3 = await app.dispatch(
    meta({ method: 'POST', path: '/api/upload', origin: ORIGIN, contentType: 'application/octet-stream', declaredSha256: sha, declaredBytes: String(GOOD_BYTES.length), declaredKind: 'analyze' }, session2),
    GOOD_BYTES,
  );
  assert.equal(up3.status, 200, JSON.stringify(up3.body));
  const out2 = await app.dispatch(
    meta({ method: 'POST', path: '/api/analyze', origin: ORIGIN, contentType: 'application/json' }, session2),
    json({ uploadId: (up3.body as { uploadId: string }).uploadId, sha256: sha, bytes: GOOD_BYTES.length }),
  );
  assert.equal(out2.status, 200, JSON.stringify(out2.body));
  await awaitLiveRun(app, session2, (out2.body as { runId: string }).runId);
  assert.equal(calls.count, 2, 'the two authorized attempts send exactly twice');
  assert.equal(app.terminalPermit('analyze', sha, GOOD_BYTES.length).ok, true);
  const up4 = await app.dispatch(
    meta({ method: 'POST', path: '/api/upload', origin: ORIGIN, contentType: 'application/octet-stream', declaredSha256: sha, declaredBytes: String(GOOD_BYTES.length), declaredKind: 'analyze' }, session2),
    GOOD_BYTES,
  );
  assert.equal(up4.status, 200, JSON.stringify(up4.body));
  const spent = await app.dispatch(
    meta({ method: 'POST', path: '/api/analyze', origin: ORIGIN, contentType: 'application/json' }, session2),
    json({ uploadId: (up4.body as { uploadId: string }).uploadId, sha256: sha, bytes: GOOD_BYTES.length }),
  );
  assert.equal(spent.status, 403, JSON.stringify(spent.body));
  assert.equal((spent.body as { code: string }).code, 'QUOTA_SPENT');
  assert.equal(calls.count, 2, 'the exhausted budget sends nothing more');
  await app.close();
  const stored = openSpentRecord(recordPath);
  assert.equal(stored.countSpent('analyze'), 2, 'both authorized sends are durably recorded');
  stored.release();
});

// Repeatable-session helpers: every provider attempt is a manual
// permit → upload → click cycle; nothing sends on its own.
async function pairSession(app: Companion, port: number): Promise<string> {
  const host = `127.0.0.1:${port}`;
  const code = app.sessions.issueTerminalCode();
  const pairOut = await app.dispatch(
    meta({ method: 'POST', path: '/api/pair', origin: `http://${host}`, host, contentType: 'application/json' }),
    json({ code }),
  );
  assert.equal(pairOut.status, 200, JSON.stringify(pairOut.body));
  return (pairOut.body as { sessionToken: string }).sessionToken;
}

async function manualLiveAttempt(app: Companion, port: number, session: string, sha: string, bytes: Uint8Array): Promise<{ runId: string; uploadId: string }> {
  const host = `127.0.0.1:${port}`;
  const origin = `http://${host}`;
  assert.equal(app.terminalPermit('analyze', sha, bytes.length).ok, true, 'each attempt needs a fresh terminal permit');
  const up = await app.dispatch(
    meta({ method: 'POST', path: '/api/upload', origin, host, contentType: 'application/octet-stream', declaredSha256: sha, declaredBytes: String(bytes.length), declaredKind: 'analyze' }, session),
    bytes,
  );
  assert.equal(up.status, 200, JSON.stringify(up.body));
  const uploadId = (up.body as { uploadId: string }).uploadId;
  const out = await app.dispatch(
    meta({ method: 'POST', path: '/api/analyze', origin, host, contentType: 'application/json' }, session),
    json({ uploadId, sha256: sha, bytes: bytes.length }),
  );
  assert.equal(out.status, 200, JSON.stringify(out.body));
  const runId = (out.body as { runId: string }).runId;
  await awaitLiveRunHost(app, port, session, runId);
  return { runId, uploadId };
}

async function awaitLiveRunHost(app: Companion, port: number, session: string, runId: string): Promise<Record<string, unknown>> {
  const host = `127.0.0.1:${port}`;
  const start = Date.now();
  for (;;) {
    const events = await app.dispatch(meta({ method: 'GET', path: '/api/events', host }, session), new Uint8Array(0));
    const record = ((events.body as { runs: Array<{ runId: string; state: string }> }).runs).find((r) => r.runId === runId);
    if (record !== undefined && record.state === 'done') return record as unknown as Record<string, unknown>;
    if (record !== undefined && record.state !== 'analyzing') {
      throw new Error(`live run ${runId} settled as ${record.state}, wanted done`);
    }
    if (Date.now() - start > 10_000) throw new Error(`timed out waiting for live run ${runId}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

async function awaitSettled(app: Companion, port: number, session: string, runId: string): Promise<Record<string, unknown>> {
  const host = `127.0.0.1:${port}`;
  const start = Date.now();
  for (;;) {
    const events = await app.dispatch(meta({ method: 'GET', path: '/api/events', host }, session), new Uint8Array(0));
    const record = ((events.body as { runs: Array<{ runId: string; state: string }> }).runs).find((r) => r.runId === runId);
    if (record !== undefined && record.state !== 'analyzing') return record as unknown as Record<string, unknown>;
    if (Date.now() - start > 10_000) throw new Error(`timed out waiting for run ${runId} to settle`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

function spendRunIds(recordPath: string): string[] {
  return readFileSync(recordPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('"entry":"spend"'))
    .map((l) => (JSON.parse(l) as { runId: string }).runId);
}

test('L-ATT-11: unlimited session sends repeatedly, each manual; no auto re-send', async () => {
  const calls = { count: 0, bodies: [] as unknown[] };
  const sub = mkdtempSync(path.join(root, 'app-11-'));
  const recordPath = path.join(root, 'att-11-spent.jsonl');
  const sha = shaOf(GOOD_BYTES);
  const app: Companion = await createCompanion({
    port: 5191,
    bind: false,
    serveRoot: null,
    uploads: StagedUploads.openDir(sub, { mediaDeps: stubMedia }),
    runTimeoutMs: 5000,
    session: new LocalSessionManager(),
    permits: new OfflineMockPermitLedger(),
    liveTransport: liveTransportDouble(calls),
    liveModel: D9_APPROVED_MODEL,
    liveAnalysesLeft: Number.POSITIVE_INFINITY,
    liveProposalsLeft: 0,
    liveSpentRecordPath: recordPath,
    liveBootstrapApprovalId: 'd9live-v2-test-att-11',
    liveMediaSha256: sha,
  });
  closers.push(() => app.close().catch(() => undefined));
  const session = await pairSession(app, 5191);
  for (let i = 1; i <= 3; i++) {
    await manualLiveAttempt(app, 5191, session, sha, GOOD_BYTES);
    assert.equal(calls.count, i, `manual attempt ${i} sends exactly once`);
  }
  // The settled run consumed its staging and its permit: re-analyzing the
  // same upload without a fresh permit/upload/click refuses with no egress.
  const stale = await app.dispatch(
    meta({ method: 'POST', path: '/api/analyze', origin: 'http://127.0.0.1:5191', host: '127.0.0.1:5191', contentType: 'application/json' }, session),
    json({ uploadId: 'stale-upload-id', sha256: sha, bytes: GOOD_BYTES.length }),
  );
  assert.equal(stale.status, 403, JSON.stringify(stale.body));
  assert.equal((stale.body as { code: string }).code, 'NO_PERMIT');
  assert.equal(calls.count, 3, 'no auto-run follows a settled attempt');
  // A fresh manual cycle sends again: repeatable, never automatic.
  await manualLiveAttempt(app, 5191, session, sha, GOOD_BYTES);
  assert.equal(calls.count, 4, 'the fourth manual attempt sends once');
  const ids = spendRunIds(recordPath);
  assert.equal(ids.length, 4, 'every send appended exactly one durable spend');
  assert.equal(new Set(ids).size, 4, 'durable run ids are unique within the ledger');
  for (const [index, id] of ids.entries()) {
    assert.match(id, new RegExp(`^local-.*#spend-${index + 1}$`), `spend ${index + 1} carries the ledger sequence`);
  }
  const status = await app.dispatch(meta({ method: 'GET', path: '/api/status', host: '127.0.0.1:5191' }, session), new Uint8Array(0));
  const live = (status.body as { live: { unlimited: boolean; attemptsLeft: { analyze: unknown }; spent: { analyze: number } } }).live;
  assert.equal(live.unlimited, true, 'status marks the unlimited opt-in');
  assert.equal(live.attemptsLeft.analyze, Number.POSITIVE_INFINITY, 'attempts never deplete');
  assert.equal(live.spent.analyze, 4, 'status exposes the durable spend count');
  await app.close();
});

test('L-ATT-12: HTTP failure keeps the spend; the next manual attempt sends again, never retries', async () => {
  const calls = { count: 0, bodies: [] as unknown[] };
  const scripted: LiveFetch = (url, init) => {
    calls.count += 1;
    calls.bodies.push(JSON.parse(init.body));
    const status = calls.count === 1 ? 500 : 200;
    return Promise.resolve({
      status,
      url,
      json: () => Promise.resolve({
        model: D9_APPROVED_MODEL,
        choices: [{ message: { content: 'live tap then count one' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    });
  };
  const created = createBasetenTransport({ model: D9_APPROVED_MODEL, apiKey: 'NOT-A-REAL-KEY-0000', fetchImpl: scripted, timeoutMs: 2000 });
  assert.equal(created.ok, true, JSON.stringify(created));
  const sub = mkdtempSync(path.join(root, 'app-12-'));
  const recordPath = path.join(root, 'att-12-spent.jsonl');
  const sha = shaOf(GOOD_BYTES);
  const app: Companion = await createCompanion({
    port: 5192,
    bind: false,
    serveRoot: null,
    uploads: StagedUploads.openDir(sub, { mediaDeps: stubMedia }),
    runTimeoutMs: 5000,
    session: new LocalSessionManager(),
    permits: new OfflineMockPermitLedger(),
    liveTransport: (created as { ok: true; transport: BasetenTransport }).transport,
    liveModel: D9_APPROVED_MODEL,
    liveAnalysesLeft: 2,
    liveProposalsLeft: 0,
    liveSpentRecordPath: recordPath,
    liveBootstrapApprovalId: 'd9live-v2-test-att-12',
    liveMediaSha256: sha,
  });
  closers.push(() => app.close().catch(() => undefined));
  const session = await pairSession(app, 5192);
  // First manual attempt: the provider answers 500 — settled refused, spend kept.
  assert.equal(app.terminalPermit('analyze', sha, GOOD_BYTES.length).ok, true);
  const up = await app.dispatch(
    meta({ method: 'POST', path: '/api/upload', origin: 'http://127.0.0.1:5192', host: '127.0.0.1:5192', contentType: 'application/octet-stream', declaredSha256: sha, declaredBytes: String(GOOD_BYTES.length), declaredKind: 'analyze' }, session),
    GOOD_BYTES,
  );
  const out = await app.dispatch(
    meta({ method: 'POST', path: '/api/analyze', origin: 'http://127.0.0.1:5192', host: '127.0.0.1:5192', contentType: 'application/json' }, session),
    json({ uploadId: (up.body as { uploadId: string }).uploadId, sha256: sha, bytes: GOOD_BYTES.length }),
  );
  const failed = await awaitSettled(app, 5192, session, (out.body as { runId: string }).runId);
  assert.equal((failed['result'] as { code: string }).code, 'TRANSPORT_HTTP');
  assert.equal(calls.count, 1, 'the failed attempt sent exactly once — no automatic retry');
  // A separately user-initiated attempt afterwards sends exactly once more.
  await manualLiveAttempt(app, 5192, session, sha, GOOD_BYTES);
  assert.equal(calls.count, 2, 'the next manual attempt sends once; still no retry');
  const ids = spendRunIds(recordPath);
  assert.equal(ids.length, 2, 'failed and successful sends each recorded one spend — none refunded');
  assert.equal(new Set(ids).size, 2, 'durable run ids stay unique across failure and success');
  await app.close();
});

test('L-ATT-13: restart retains all spends; durable ids stay unique across the reset', async () => {
  const recordPath = path.join(root, 'att-13-spent.jsonl');
  const sha = shaOf(GOOD_BYTES);
  const openApp = async (port: number, sub: string, approvalId?: string): Promise<Companion> => {
    const calls = { count: 0, bodies: [] as unknown[] };
    return createCompanion({
      port,
      bind: false,
      serveRoot: null,
      uploads: StagedUploads.openDir(sub, { mediaDeps: stubMedia }),
      runTimeoutMs: 5000,
      session: new LocalSessionManager(),
      permits: new OfflineMockPermitLedger(),
      liveTransport: liveTransportDouble(calls),
      liveModel: D9_APPROVED_MODEL,
      liveAnalysesLeft: Number.POSITIVE_INFINITY,
      liveProposalsLeft: 0,
      liveSpentRecordPath: recordPath,
      liveBootstrapApprovalId: approvalId,
      liveMediaSha256: sha,
    });
  };
  const subA = mkdtempSync(path.join(root, 'app-13a-'));
  const first = await openApp(5193, subA, 'd9live-v2-test-att-13');
  const sessionA = await pairSession(first, 5193);
  await manualLiveAttempt(first, 5193, sessionA, sha, GOOD_BYTES);
  await first.close();
  // Reopen the same ledger with the same standing approval identity:
  // spends retained, no re-arm, no repurposing refusal.
  const subB = mkdtempSync(path.join(root, 'app-13b-'));
  const second = await openApp(5194, subB, 'd9live-v2-test-att-13');
  closers.push(() => second.close().catch(() => undefined));
  const sessionB = await pairSession(second, 5194);
  const status = await second.dispatch(meta({ method: 'GET', path: '/api/status', host: '127.0.0.1:5194' }, sessionB), new Uint8Array(0));
  const live = (status.body as { live: { spent: { analyze: number }; unlimited: boolean } }).live;
  assert.equal(live.spent.analyze, 1, 'the restart sees the pre-restart spend');
  assert.equal(live.unlimited, true, 'the unlimited opt-in survives the restart');
  await manualLiveAttempt(second, 5194, sessionB, sha, GOOD_BYTES);
  const ids = spendRunIds(recordPath);
  assert.equal(ids.length, 2, 'both generations recorded');
  assert.equal(new Set(ids).size, 2, 'durable ids unique despite the per-process run counter reset');
  assert.match(ids[0] as string, /#spend-1$/);
  assert.match(ids[1] as string, /#spend-2$/);
  await second.close();
});
