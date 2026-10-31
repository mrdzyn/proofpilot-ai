// UI-C3-02-I2/I4: companion dispatch battery over the socket-free seam.
// No listener is bound here (bind:false); stub media deps stand in for
// ffprobe; each test owns an isolated app + staging directory.
//
// Contract under test (GPT-6 remediation of PR #31):
// - permit BEFORE upload: /api/upload declares sha256/bytes/action and is
//   refused (NO_PERMIT) before staging or decoding anything without a live
//   eligible terminal permit.
// - /api/analyze|propose accept promptly with a runId (state analyzing) and
//   settle in the background; Cancel reaches the in-flight run.
// - single-flight: upload/analyze/propose serialize on one slot acquired
//   before the first await; revoke bumps the epoch and never frees a new slot.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCompanion, type ApiMeta, type Companion } from '../../packages/live-analysis/src/server.ts';
import { LocalSessionManager } from '../../packages/live-analysis/src/local-session.ts';
import { OfflineMockPermitLedger } from '../../packages/live-analysis/src/mock-permits.ts';
import { StagedUploads } from '../../packages/live-analysis/src/uploads.ts';
import type { MediaDeps } from '../../packages/intake/src/media.ts';

const PORT = 5188;
const HOST = `127.0.0.1:${PORT}`;
const ORIGIN = `http://${HOST}`;

const ftyp = (size: number, brand = 'isom'): Uint8Array => {
  const buf = Buffer.alloc(size);
  buf.writeUInt32BE(24, 0);
  buf.write(`ftyp${brand}`, 4, 'ascii');
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
};
const GOOD_BYTES = ftyp(4096);

function stubMediaWithCounter(counter: { probeCalls: number }): MediaDeps {
  return {
    probe: async () => {
      counter.probeCalls += 1;
      return {
        formatName: 'mp4',
        formatDurationSec: 3,
        streams: [{ codecType: 'video', codecName: 'h264', durationSec: 3, width: 390, height: 844 }],
      };
    },
    decodeCheck: async () => ({ ok: true, detail: '' }),
  };
}

const stubMedia: MediaDeps = stubMediaWithCounter({ probeCalls: 0 });

let root = '';
const closers: Array<() => Promise<void>> = [];

async function freshApp(extra?: {
  transportLatencyMs?: number;
  runTimeoutMs?: number;
  session?: LocalSessionManager;
  permits?: OfflineMockPermitLedger;
  mediaDeps?: MediaDeps;
  analysesLeft?: number;
  proposalsLeft?: number;
}): Promise<Companion> {
  const sub = mkdtempSync(path.join(root, 'app-'));
  const app = await createCompanion({
    port: PORT,
    bind: false,
    serveRoot: null,
    uploads: StagedUploads.openDir(sub, { mediaDeps: extra?.mediaDeps ?? stubMedia }),
    transportLatencyMs: extra?.transportLatencyMs ?? 0,
    runTimeoutMs: extra?.runTimeoutMs ?? 5000,
    session: extra?.session,
    permits: extra?.permits,
    analysesLeft: extra?.analysesLeft,
    proposalsLeft: extra?.proposalsLeft,
  });
  closers.push(() => app.close().catch(() => undefined));
  return app;
}

before(() => {
  root = mkdtempSync(path.join(tmpdir(), 'pp-live-unit-'));
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
const EMPTY = new Uint8Array(0);

async function pair(app: Companion): Promise<string> {
  const code = app.sessions.issueTerminalCode();
  const out = await app.dispatch(
    meta({ method: 'POST', path: '/api/pair', origin: ORIGIN, contentType: 'application/json' }),
    json({ code }),
  );
  assert.equal(out.status, 200, JSON.stringify(out.body));
  return (out.body as { sessionToken: string }).sessionToken;
}

function permit(app: Companion, kind: 'analyze' | 'propose', sha256: string, bytes: number): void {
  const out = app.terminalPermit(kind, sha256, bytes);
  assert.equal(out.ok, true, JSON.stringify(out));
}

function declareUpload(sha256: string, bytes: number, kind: 'analyze' | 'propose'): Partial<ApiMeta> {
  return {
    method: 'POST',
    path: '/api/upload',
    origin: ORIGIN,
    contentType: 'application/octet-stream',
    declaredSha256: sha256,
    declaredBytes: String(bytes),
    declaredKind: kind,
  };
}

async function uploadVideo(
  app: Companion,
  bytes: Uint8Array,
  session: string,
  declared: { sha256: string; bytes: number; kind: 'analyze' | 'propose' },
): Promise<{ uploadId: string; sha256: string; bytes: number }> {
  const out = await app.dispatch(
    meta(
      { ...declareUpload(declared.sha256, declared.bytes, declared.kind) },
      session,
    ),
    bytes,
  );
  assert.equal(out.status, 200, JSON.stringify(out.body));
  return out.body as { uploadId: string; sha256: string; bytes: number };
}

function analyze(app: Companion, session: string, up: { uploadId: string; sha256: string; bytes: number }, kind: 'analyze' | 'propose' = 'analyze') {
  return app.dispatch(
    meta({ method: 'POST', path: `/api/${kind}`, origin: ORIGIN, contentType: 'application/json' }, session),
    json({ uploadId: up.uploadId, sha256: up.sha256, bytes: up.bytes }),
  );
}

async function awaitRunState(
  app: Companion,
  session: string,
  runId: string,
  want: string,
  timeoutMs = 10_000,
): Promise<Record<string, unknown>> {
  const start = Date.now();
  for (;;) {
    const events = await app.dispatch(meta({ method: 'GET', path: '/api/events' }, session), EMPTY);
    const record = ((events.body as { runs: Array<{ runId: string; state: string }> }).runs).find((r) => r.runId === runId);
    if (record !== undefined && record.state === want) return record as unknown as Record<string, unknown>;
    if (record !== undefined && record.state !== 'analyzing') {
      throw new Error(`run ${runId} settled as ${record.state}, wanted ${want}`);
    }
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for run ${runId} to reach ${want}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

test('L-AUTH-1: health is public; status and events require a session', async () => {
  const app = await freshApp();
  const health = await app.dispatch(meta({ method: 'GET', path: '/api/health' }), EMPTY);
  assert.equal(health.status, 200);
  const noSession = await app.dispatch(meta({ method: 'GET', path: '/api/status' }), EMPTY);
  assert.deepEqual([noSession.status, (noSession.body as { code: string }).code], [401, 'SESSION_REQUIRED']);
  const session = await pair(app);
  const status = await app.dispatch(meta({ method: 'GET', path: '/api/status' }, session), EMPTY);
  assert.equal(status.status, 200);
  assert.equal((status.body as { paired: boolean }).paired, true);
});

test('L-CSRF-1: hostile Host and Origin refused; absent Origin polling allowed with session', async () => {
  const app = await freshApp();
  const session = await pair(app);
  for (const host of ['evil.example:5188', '127.0.0.1:5173', '127.0.0.1', '']) {
    const out = await app.dispatch(meta({ method: 'GET', path: '/api/status', host }, session), EMPTY);
    assert.equal(out.status, 403, host === '' ? '(empty)' : host);
    assert.equal((out.body as { code: string }).code, 'BAD_HOST');
  }
  for (const badOrigin of ['null', 'http://evil.example', 'http://localhost:5173']) {
    const out = await app.dispatch(meta({ method: 'GET', path: '/api/status', origin: badOrigin }, session), EMPTY);
    assert.equal(out.status, 403, String(badOrigin));
  }
  // Absent Origin + valid session + valid Host: the legitimate polling path.
  const allowed = await app.dispatch(
    meta({ method: 'GET', path: '/api/events', origin: undefined, fetchSite: 'same-origin' }, session),
    EMPTY,
  );
  assert.equal(allowed.status, 200);
  // POST without Origin is always refused, session or not.
  const noOriginPost = await app.dispatch(
    meta({
      method: 'POST', path: '/api/analyze', origin: undefined,
      contentType: 'application/json', fetchSite: 'same-origin',
    }, session),
    json({ uploadId: 'x', sha256: 'e'.repeat(64), bytes: GOOD_BYTES.length }),
  );
  assert.equal(noOriginPost.status, 403);
});

test('L-PAIR-1: wrong codes refused, lockout after five failures', async () => {
  const app = await freshApp();
  app.sessions.issueTerminalCode();
  const guess = (code: string) => app.dispatch(
    meta({ method: 'POST', path: '/api/pair', origin: ORIGIN, contentType: 'application/json' }),
    json({ code }),
  );
  for (let i = 0; i < 4; i++) {
    const out = await guess('00000000');
    assert.equal((out.body as { code: string }).code, 'PAIR_INVALID');
  }
  const locked = await guess('00000001');
  assert.equal((locked.body as { code: string }).code, 'PAIR_LOCKED');
  // Lockout state is terminal-scoped: revoke clears it and pairing works again.
  app.terminalRevoke();
  const fresh = await pair(app);
  assert.ok(fresh.length > 20);
});

test('L-PAIR-2: pair with JSON null is a typed BAD_PAYLOAD, not a 500', async () => {
  const app = await freshApp();
  const out = await app.dispatch(
    meta({ method: 'POST', path: '/api/pair', origin: ORIGIN, contentType: 'application/json' }),
    json(null),
  );
  assert.equal(out.status, 400);
  assert.equal((out.body as { code: string }).code, 'BAD_PAYLOAD');
});

test('L-AUTH-1: full analyze flow — permit, upload, prompt accept, done, mock-labelled', async () => {
  const app = await freshApp();
  const session = await pair(app);
  permit(app, 'analyze', shaOf(GOOD_BYTES), GOOD_BYTES.length);
  const up = await uploadVideo(app, GOOD_BYTES, session, { sha256: shaOf(GOOD_BYTES), bytes: GOOD_BYTES.length, kind: 'analyze' });
  assert.ok(/^[0-9a-f]{64}$/.test(up.sha256));
  const run = await analyze(app, session, up);
  assert.equal(run.status, 200, JSON.stringify(run.body));
  const runId = (run.body as { runId: string }).runId;
  assert.ok(runId.startsWith('local-'));
  assert.equal((run.body as { state: string }).state, 'analyzing');
  const record = await awaitRunState(app, session, runId, 'done');
  const result = (record as unknown as { result: Record<string, unknown> }).result;
  assert.equal(result['transport'], 'mock-fixture');
  assert.equal(result['liveInference'], false);
  assert.ok(typeof result['observations'] === 'string');
  assert.deepEqual(result['usage'], { promptTokens: 410, completionTokens: 96, totalTokens: 506 });
});

function shaOf(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

test('L-PERMIT-1: upload without a live permit is refused before staging or decoding anything', async () => {
  const counter = { probeCalls: 0 };
  const app = await freshApp({ mediaDeps: stubMediaWithCounter(counter) });
  const session = await pair(app);
  const out = await app.dispatch(
    meta({ ...declareUpload(shaOf(GOOD_BYTES), GOOD_BYTES.length, 'analyze') }, session),
    GOOD_BYTES,
  );
  assert.equal(out.status, 403);
  assert.equal((out.body as { code: string }).code, 'NO_PERMIT');
  // Zero staged bytes and zero trusted-boundary decode work.
  assert.deepEqual(readdirSync(app.uploads.stagingRoot), []);
  assert.equal(counter.probeCalls, 0);
});

test('L-PERMIT-1: upload with an expired permit refuses PERMIT_EXPIRED without staging', async () => {
  let clock = 1_000_000;
  const ledger = new OfflineMockPermitLedger(() => clock);
  const app = await freshApp({ permits: ledger });
  const session = await pair(app);
  permit(app, 'analyze', shaOf(GOOD_BYTES), GOOD_BYTES.length);
  clock += 3 * 60_000;
  const out = await app.dispatch(
    meta({ ...declareUpload(shaOf(GOOD_BYTES), GOOD_BYTES.length, 'analyze') }, session),
    GOOD_BYTES,
  );
  assert.equal(out.status, 403);
  assert.equal((out.body as { code: string }).code, 'PERMIT_EXPIRED');
  assert.deepEqual(readdirSync(app.uploads.stagingRoot), []);
});

test('L-PERMIT-1: malformed upload declarations are typed BAD_PAYLOAD', async () => {
  const app = await freshApp();
  const session = await pair(app);
  permit(app, 'analyze', shaOf(GOOD_BYTES), GOOD_BYTES.length);
  for (const bad of [
    { declaredSha256: 'zzz', declaredBytes: String(GOOD_BYTES.length), declaredKind: 'analyze' },
    { declaredSha256: shaOf(GOOD_BYTES), declaredBytes: 'many', declaredKind: 'analyze' },
    { declaredSha256: shaOf(GOOD_BYTES), declaredBytes: String(GOOD_BYTES.length), declaredKind: 'launch' },
  ]) {
    const out = await app.dispatch(
      meta({ method: 'POST', path: '/api/upload', origin: ORIGIN, contentType: 'application/octet-stream', ...bad }, session),
      GOOD_BYTES,
    );
    assert.equal(out.status, 400, JSON.stringify(out.body));
    assert.equal((out.body as { code: string }).code, 'BAD_PAYLOAD');
  }
  assert.deepEqual(readdirSync(app.uploads.stagingRoot), []);
});

test('L-AUTH-1: propose flow renders the closed-grammar triple as untrusted text', async () => {
  const app = await freshApp();
  const session = await pair(app);
  permit(app, 'propose', shaOf(GOOD_BYTES), GOOD_BYTES.length);
  const up = await uploadVideo(app, GOOD_BYTES, session, { sha256: shaOf(GOOD_BYTES), bytes: GOOD_BYTES.length, kind: 'propose' });
  const run = await analyze(app, session, up, 'propose');
  assert.equal(run.status, 200, JSON.stringify(run.body));
  const runId = (run.body as { runId: string }).runId;
  const record = await awaitRunState(app, session, runId, 'done');
  const result = (record as unknown as { result: Record<string, unknown> }).result;
  assert.deepEqual(result['adjustments'], [{ selector: '.promo-overlay', property: 'pointer-events', value: 'none' }]);
  assert.ok((result['renderedCss'] as string).includes('.promo-overlay'));
});

test('L-ONE-1: single-use permits cannot be replayed; quota exhaustion is terminal', async () => {
  const app = await freshApp({ analysesLeft: 2 });
  const session = await pair(app);
  permit(app, 'analyze', shaOf(GOOD_BYTES), GOOD_BYTES.length);
  const up = await uploadVideo(app, GOOD_BYTES, session, { sha256: shaOf(GOOD_BYTES), bytes: GOOD_BYTES.length, kind: 'analyze' });
  const first = await analyze(app, session, up);
  assert.equal(first.status, 200);
  await awaitRunState(app, session, (first.body as { runId: string }).runId, 'done');
  // Same payload replayed: permit already consumed.
  const replay = await analyze(app, session, up);
  assert.equal((replay.body as { code: string }).code, 'NO_PERMIT');
  // Spend the last demo analysis, then prove the quota gate is terminal.
  permit(app, 'analyze', shaOf(GOOD_BYTES), GOOD_BYTES.length);
  const up2 = await uploadVideo(app, GOOD_BYTES, session, { sha256: shaOf(GOOD_BYTES), bytes: GOOD_BYTES.length, kind: 'analyze' });
  const second = await analyze(app, session, up2);
  assert.equal(second.status, 200);
  await awaitRunState(app, session, (second.body as { runId: string }).runId, 'done');
  permit(app, 'analyze', shaOf(GOOD_BYTES), GOOD_BYTES.length);
  const up3 = await uploadVideo(app, GOOD_BYTES, session, { sha256: shaOf(GOOD_BYTES), bytes: GOOD_BYTES.length, kind: 'analyze' });
  const spent = await analyze(app, session, up3);
  assert.equal((spent.body as { code: string }).code, 'QUOTA_SPENT');
});

test('L-LIMIT-1: oversize and non-MP4 uploads refused; shape limits hold under the new order', async () => {
  const app = await freshApp();
  const session = await pair(app);
  // Above the request-guard body cap: refused by the loopback boundary itself.
  const huge = new Uint8Array(30_000_001);
  const tooLarge = await app.dispatch(
    meta({ method: 'POST', path: '/api/upload', origin: ORIGIN, contentType: 'application/octet-stream' }, session),
    huge,
  );
  assert.equal((tooLarge.body as { code: string }).code, 'BAD_BODY_SIZE');
  // Valid MP4 shape above the 25 MB media cap: a small-identity permit plus a
  // big body still fails trusted validation (permit names the declared bytes).
  const overMedia = ftyp(26_000_000);
  const declaredBytes = 4096;
  permit(app, 'analyze', shaOf(GOOD_BYTES), declaredBytes);
  const overMediaOut = await app.dispatch(
    meta({ ...declareUpload(shaOf(GOOD_BYTES), declaredBytes, 'analyze') }, session),
    overMedia,
  );
  assert.equal((overMediaOut.body as { code: string }).code, 'UPLOAD_TOO_LARGE');
  // Peeked permits are not consumed by refused uploads: revoke clears the
  // first permit so the second shape case can issue its own (revoke also
  // ends the session, so re-pair first).
  app.terminalRevoke();
  const session2 = await pair(app);
  const fake = new TextEncoder().encode('this is not a video....................');
  permit(app, 'analyze', shaOf(fake), fake.length);
  const notMp4 = await app.dispatch(
    meta({ ...declareUpload(shaOf(fake), fake.length, 'analyze') }, session2),
    fake,
  );
  assert.equal((notMp4.body as { code: string }).code, 'NOT_MP4');
});

test('L-BIND-1: declared-then-staged mismatch fails closed at upload; the permit survives', async () => {
  const app = await freshApp();
  const session = await pair(app);
  // Same shape, different bytes: the declaration names GOOD_BYTES but the
  // request carries other valid MP4 bytes.
  const swapped = ftyp(4096, 'mp42');
  assert.notEqual(shaOf(swapped), shaOf(GOOD_BYTES));
  permit(app, 'analyze', shaOf(GOOD_BYTES), GOOD_BYTES.length);
  const out = await app.dispatch(
    meta({ ...declareUpload(shaOf(GOOD_BYTES), GOOD_BYTES.length, 'analyze') }, session),
    swapped,
  );
  assert.equal(out.status, 422);
  assert.equal((out.body as { code: string }).code, 'MEDIA_CHANGED');
  assert.deepEqual(readdirSync(app.uploads.stagingRoot), []);
  // The permit was NOT consumed by the refused upload: the corrected upload
  // with the same permit succeeds and the run completes.
  const up = await uploadVideo(app, GOOD_BYTES, session, { sha256: shaOf(GOOD_BYTES), bytes: GOOD_BYTES.length, kind: 'analyze' });
  const run = await analyze(app, session, up);
  assert.equal(run.status, 200);
  await awaitRunState(app, session, (run.body as { runId: string }).runId, 'done');
});

test('L-BIND-2: analyze with a foreign uploadId fails closed and spends the permit', async () => {
  const app = await freshApp();
  const session = await pair(app);
  permit(app, 'analyze', shaOf(GOOD_BYTES), GOOD_BYTES.length);
  const up = await uploadVideo(app, GOOD_BYTES, session, { sha256: shaOf(GOOD_BYTES), bytes: GOOD_BYTES.length, kind: 'analyze' });
  const out = await analyze(app, session, { ...up, uploadId: 'up-0123456789ab-cdef9876' });
  assert.equal(out.status, 422);
  assert.equal((out.body as { code: string }).code, 'MEDIA_CHANGED');
  // The mismatched attempt consumed the permit: a retry needs a new one.
  const again = await analyze(app, session, { ...up, uploadId: 'up-0123456789ab-cdef9876' });
  assert.equal((again.body as { code: string }).code, 'NO_PERMIT');
});

test('L-RUN-1: analyze accepts promptly with a runId while processing continues', async () => {
  const app = await freshApp({ transportLatencyMs: 1500 });
  const session = await pair(app);
  permit(app, 'analyze', shaOf(GOOD_BYTES), GOOD_BYTES.length);
  const up = await uploadVideo(app, GOOD_BYTES, session, { sha256: shaOf(GOOD_BYTES), bytes: GOOD_BYTES.length, kind: 'analyze' });
  const started = Date.now();
  const accepted = await analyze(app, session, up);
  const elapsed = Date.now() - started;
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal((accepted.body as { state: string }).state, 'analyzing');
  assert.ok(elapsed < 1000, `accept took ${String(elapsed)}ms; must return before the 1500ms mock transport`);
  const runId = (accepted.body as { runId: string }).runId;
  const events = await app.dispatch(meta({ method: 'GET', path: '/api/events' }, session), EMPTY);
  assert.equal(((events.body as { runs: Array<{ runId: string; state: string }> }).runs).find((r) => r.runId === runId)?.state, 'analyzing');
  await awaitRunState(app, session, runId, 'done', 15_000);
});

test('L-CANCEL-1: cancel reaches the in-flight run; quota preserved, bytes deleted', async () => {
  // Latency comfortably exceeds the accept→cancel gap (cancel lands in
  // flight) but stays well under the 5 s ceiling so the follow-up run can
  // complete deterministically.
  const app = await freshApp({ transportLatencyMs: 1500 });
  const session = await pair(app);
  permit(app, 'analyze', shaOf(GOOD_BYTES), GOOD_BYTES.length);
  const up = await uploadVideo(app, GOOD_BYTES, session, { sha256: shaOf(GOOD_BYTES), bytes: GOOD_BYTES.length, kind: 'analyze' });
  const accepted = await analyze(app, session, up);
  const runId = (accepted.body as { runId: string }).runId;
  const cancel = await app.dispatch(
    meta({ method: 'POST', path: '/api/cancel', origin: ORIGIN, contentType: 'application/json' }, session),
    json({ runId }),
  );
  assert.equal(cancel.status, 200);
  assert.equal((cancel.body as { state: string }).state, 'cancelled');
  const record = await awaitRunState(app, session, runId, 'cancelled', 15_000);
  assert.equal(((record as unknown as { result: { code: string } }).result).code, 'CANCELLED');
  const status = await app.dispatch(meta({ method: 'GET', path: '/api/status' }, session), EMPTY);
  assert.equal(((status.body as { quota: { analysesLeft: number } }).quota).analysesLeft, 3);
  // Staged bytes are gone: a fresh permit + upload + analyze completes.
  permit(app, 'analyze', shaOf(GOOD_BYTES), GOOD_BYTES.length);
  const up2 = await uploadVideo(app, GOOD_BYTES, session, { sha256: shaOf(GOOD_BYTES), bytes: GOOD_BYTES.length, kind: 'analyze' });
  const second = await analyze(app, session, up2);
  await awaitRunState(app, session, (second.body as { runId: string }).runId, 'done');
});

test('L-RACE-1: two concurrent analyzes serialize — one accepted, one RUN_BUSY', async () => {
  const app = await freshApp({ transportLatencyMs: 500 });
  const session = await pair(app);
  permit(app, 'analyze', shaOf(GOOD_BYTES), GOOD_BYTES.length);
  const up = await uploadVideo(app, GOOD_BYTES, session, { sha256: shaOf(GOOD_BYTES), bytes: GOOD_BYTES.length, kind: 'analyze' });
  const [first, second] = await Promise.all([analyze(app, session, up), analyze(app, session, up)]);
  const codes = [first, second].map((r) => (r.body as { code?: string; runId?: string }).code ?? 'accepted').sort();
  assert.deepEqual(codes, ['RUN_BUSY', 'accepted']);
  const accepted = [first, second].find((r) => (r.body as { runId?: string }).runId !== undefined);
  await awaitRunState(app, session, ((accepted as unknown as { body: { runId: string } }).body).runId, 'done', 15_000);
  const status = await app.dispatch(meta({ method: 'GET', path: '/api/status' }, session), EMPTY);
  assert.equal(((status.body as { quota: { analysesLeft: number } }).quota).analysesLeft, 2);
});

test('L-RACE-2: a second valid permit waits while a run is in flight, then proceeds', async () => {
  const app = await freshApp({ transportLatencyMs: 500 });
  const session = await pair(app);
  permit(app, 'analyze', shaOf(GOOD_BYTES), GOOD_BYTES.length);
  const up = await uploadVideo(app, GOOD_BYTES, session, { sha256: shaOf(GOOD_BYTES), bytes: GOOD_BYTES.length, kind: 'analyze' });
  const first = await analyze(app, session, up);
  assert.equal(first.status, 200);
  // The first permit is consumed, so a second permit issues cleanly — but the
  // in-flight run still owns the single slot.
  permit(app, 'analyze', shaOf(GOOD_BYTES), GOOD_BYTES.length);
  const busy = await analyze(app, session, up);
  assert.equal((busy.body as { code: string }).code, 'RUN_BUSY');
  await awaitRunState(app, session, (first.body as { runId: string }).runId, 'done', 15_000);
  const up3 = await uploadVideo(app, GOOD_BYTES, session, { sha256: shaOf(GOOD_BYTES), bytes: GOOD_BYTES.length, kind: 'analyze' });
  const second = await analyze(app, session, up3);
  assert.equal(second.status, 200);
  await awaitRunState(app, session, (second.body as { runId: string }).runId, 'done', 15_000);
});

test('L-RACE-3: upload during an in-flight run is refused with RUN_BUSY', async () => {
  const app = await freshApp({ transportLatencyMs: 500 });
  const session = await pair(app);
  permit(app, 'analyze', shaOf(GOOD_BYTES), GOOD_BYTES.length);
  const up = await uploadVideo(app, GOOD_BYTES, session, { sha256: shaOf(GOOD_BYTES), bytes: GOOD_BYTES.length, kind: 'analyze' });
  const first = await analyze(app, session, up);
  assert.equal(first.status, 200);
  permit(app, 'analyze', shaOf(GOOD_BYTES), GOOD_BYTES.length);
  const clash = await app.dispatch(
    meta({ ...declareUpload(shaOf(GOOD_BYTES), GOOD_BYTES.length, 'analyze') }, session),
    GOOD_BYTES,
  );
  assert.equal(clash.status, 409);
  assert.equal((clash.body as { code: string }).code, 'RUN_BUSY');
  await awaitRunState(app, session, (first.body as { runId: string }).runId, 'done', 15_000);
  const up2 = await uploadVideo(app, GOOD_BYTES, session, { sha256: shaOf(GOOD_BYTES), bytes: GOOD_BYTES.length, kind: 'analyze' });
  assert.ok(up2.uploadId.length > 0);
});

test('L-RACE-4: revoke cancels the in-flight run; a re-paired session runs cleanly', async () => {
  const app = await freshApp({ transportLatencyMs: 2000 });
  const session = await pair(app);
  permit(app, 'analyze', shaOf(GOOD_BYTES), GOOD_BYTES.length);
  const up = await uploadVideo(app, GOOD_BYTES, session, { sha256: shaOf(GOOD_BYTES), bytes: GOOD_BYTES.length, kind: 'analyze' });
  const first = await analyze(app, session, up);
  const runId = (first.body as { runId: string }).runId;
  app.terminalRevoke();
  const session2 = await pair(app);
  const record = await awaitRunState(app, session2, runId, 'cancelled', 15_000);
  assert.equal(((record as unknown as { result: { code: string } }).result).code, 'CANCELLED');
  // The stale run must not hold the slot: a fresh permit/upload/analyze works.
  permit(app, 'analyze', shaOf(GOOD_BYTES), GOOD_BYTES.length);
  const up2 = await uploadVideo(app, GOOD_BYTES, session2, { sha256: shaOf(GOOD_BYTES), bytes: GOOD_BYTES.length, kind: 'analyze' });
  const second = await analyze(app, session2, up2);
  assert.equal(second.status, 200);
  await awaitRunState(app, session2, (second.body as { runId: string }).runId, 'done', 15_000);
});

test('L-TIMEOUT-1: runs exceeding the total ceiling fail closed without a response', async () => {
  const app = await freshApp({ transportLatencyMs: 1500, runTimeoutMs: 200 });
  const session = await pair(app);
  permit(app, 'analyze', shaOf(GOOD_BYTES), GOOD_BYTES.length);
  const up = await uploadVideo(app, GOOD_BYTES, session, { sha256: shaOf(GOOD_BYTES), bytes: GOOD_BYTES.length, kind: 'analyze' });
  const accepted = await analyze(app, session, up);
  assert.equal((accepted.body as { state: string }).state, 'analyzing');
  const record = await awaitRunState(app, session, (accepted.body as { runId: string }).runId, 'cancelled', 15_000);
  assert.equal(((record as unknown as { result: { code: string } }).result).code, 'TIMEOUT');
});

test('L-AUTH-1: expired sessions are rejected', async () => {
  let clock = 1_000_000;
  const app = await freshApp({ session: new LocalSessionManager(() => clock) });
  const code = app.sessions.issueTerminalCode();
  const paired = await app.dispatch(
    meta({ method: 'POST', path: '/api/pair', origin: ORIGIN, contentType: 'application/json' }),
    json({ code }),
  );
  const token = (paired.body as { sessionToken: string }).sessionToken;
  clock += 31 * 60_000;
  const stale = await app.dispatch(meta({ method: 'GET', path: '/api/status' }, token), EMPTY);
  assert.equal((stale.body as { code: string }).code, 'SESSION_REQUIRED');
});
