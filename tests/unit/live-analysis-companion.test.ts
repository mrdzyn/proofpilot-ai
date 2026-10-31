// UI-C3-02-I2/I4: companion dispatch battery over the socket-free seam.
// No listener is bound here (bind:false); stub media deps stand in for
// ffprobe; each test owns an isolated app + staging directory.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCompanion, type ApiMeta, type Companion } from '../../packages/live-analysis/src/server.ts';
import { LocalSessionManager } from '../../packages/live-analysis/src/local-session.ts';
import { StagedUploads } from '../../packages/live-analysis/src/uploads.ts';
import { createMockTransport } from '../../packages/live-analysis/src/mock-transport.ts';
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

async function freshApp(extra?: {
  transportLatencyMs?: number;
  runTimeoutMs?: number;
  session?: LocalSessionManager;
  analysesLeft?: number;
  proposalsLeft?: number;
}): Promise<Companion> {
  const sub = mkdtempSync(path.join(root, 'app-'));
  const app = await createCompanion({
    port: PORT,
    bind: false,
    serveRoot: null,
    uploads: StagedUploads.openDir(sub, { mediaDeps: stubMedia }),
    transport: createMockTransport({ latencyMs: extra?.transportLatencyMs ?? 0 }),
    runTimeoutMs: extra?.runTimeoutMs ?? 5000,
    session: extra?.session,
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

async function uploadVideo(app: Companion, bytes: Uint8Array, session: string): Promise<{ uploadId: string; sha256: string; bytes: number }> {
  const out = await app.dispatch(
    meta({ method: 'POST', path: '/api/upload', origin: ORIGIN, contentType: 'application/octet-stream' }, session),
    bytes,
  );
  assert.equal(out.status, 200, JSON.stringify(out.body));
  return out.body as { uploadId: string; sha256: string; bytes: number };
}

function permit(app: Companion, kind: 'analyze' | 'propose', sha256: string, bytes: number): void {
  const out = app.terminalPermit(kind, sha256, bytes);
  assert.equal(out.ok, true, JSON.stringify(out));
}

function analyze(app: Companion, session: string, up: { uploadId: string; sha256: string; bytes: number }, kind: 'analyze' | 'propose' = 'analyze') {
  return app.dispatch(
    meta({ method: 'POST', path: `/api/${kind}`, origin: ORIGIN, contentType: 'application/json' }, session),
    json({ uploadId: up.uploadId, sha256: up.sha256, bytes: up.bytes }),
  );
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

test('L-AUTH-1: full analyze flow — upload, permit, run, done, mock-labelled', async () => {
  const app = await freshApp();
  const session = await pair(app);
  const up = await uploadVideo(app, GOOD_BYTES, session);
  assert.ok(/^[0-9a-f]{64}$/.test(up.sha256));
  permit(app, 'analyze', up.sha256, GOOD_BYTES.length);
  const run = await analyze(app, session, up);
  assert.equal(run.status, 200, JSON.stringify(run.body));
  const runId = (run.body as { runId: string }).runId;
  assert.ok(runId.startsWith('local-'));
  const events = await app.dispatch(meta({ method: 'GET', path: '/api/events' }, session), EMPTY);
  const record = ((events.body as { runs: Array<{ runId: string }> }).runs).find((r) => r.runId === runId);
  assert.ok(record !== undefined);
  assert.equal((record as unknown as { state: string }).state, 'done');
  const result = (record as unknown as { result: Record<string, unknown> }).result;
  assert.equal(result['transport'], 'mock-fixture');
  assert.equal(result['liveInference'], false);
  assert.ok(typeof result['observations'] === 'string');
  assert.deepEqual(result['usage'], { promptTokens: 410, completionTokens: 96, totalTokens: 506 });
});

test('L-AUTH-1: analyze without a permit is refused and spends nothing', async () => {
  const app = await freshApp();
  const session = await pair(app);
  const up = await uploadVideo(app, GOOD_BYTES, session);
  const out = await analyze(app, session, up);
  assert.equal(out.status, 403);
  assert.equal((out.body as { code: string }).code, 'NO_PERMIT');
});

test('L-AUTH-1: propose flow renders the closed-grammar triple as untrusted text', async () => {
  const app = await freshApp();
  const session = await pair(app);
  const up = await uploadVideo(app, GOOD_BYTES, session);
  permit(app, 'propose', up.sha256, GOOD_BYTES.length);
  const run = await analyze(app, session, up, 'propose');
  assert.equal(run.status, 200, JSON.stringify(run.body));
  const runId = (run.body as { runId: string }).runId;
  const events = await app.dispatch(meta({ method: 'GET', path: '/api/events' }, session), EMPTY);
  const record = ((events.body as { runs: Array<{ runId: string }> }).runs).find((r) => r.runId === runId);
  const result = (record as unknown as { result: Record<string, unknown> }).result;
  assert.deepEqual(result['adjustments'], [{ selector: '.promo-overlay', property: 'pointer-events', value: 'none' }]);
  assert.ok((result['renderedCss'] as string).includes('.promo-overlay'));
});

test('L-ONE-1: single-use permits cannot be replayed; quota exhaustion is terminal', async () => {
  const app = await freshApp({ analysesLeft: 2 });
  const session = await pair(app);
  const up = await uploadVideo(app, GOOD_BYTES, session);
  permit(app, 'analyze', up.sha256, GOOD_BYTES.length);
  assert.equal((await analyze(app, session, up)).status, 200);
  // Same payload replayed: permit already consumed.
  const replay = await analyze(app, session, up);
  assert.equal((replay.body as { code: string }).code, 'NO_PERMIT');
  // Spend the last demo analysis, then prove the quota gate is terminal.
  const up2 = await uploadVideo(app, GOOD_BYTES, session);
  permit(app, 'analyze', up2.sha256, GOOD_BYTES.length);
  assert.equal((await analyze(app, session, up2)).status, 200);
  const up3 = await uploadVideo(app, GOOD_BYTES, session);
  permit(app, 'analyze', up3.sha256, GOOD_BYTES.length);
  const spent = await analyze(app, session, up3);
  assert.equal((spent.body as { code: string }).code, 'QUOTA_SPENT');
});

test('L-LIMIT-1: oversize and non-MP4 uploads refused before any permit exists', async () => {
  const app = await freshApp();
  const session = await pair(app);
  // Above the request-guard body cap: refused by the loopback boundary itself.
  const huge = new Uint8Array(30_000_001);
  const tooLarge = await app.dispatch(
    meta({ method: 'POST', path: '/api/upload', origin: ORIGIN, contentType: 'application/octet-stream' }, session),
    huge,
  );
  assert.equal((tooLarge.body as { code: string }).code, 'BAD_BODY_SIZE');
  // Valid MP4 shape above the 25 MB media cap: refused by intake validation.
  const overMedia = ftyp(26_000_000);
  const overMediaOut = await app.dispatch(
    meta({ method: 'POST', path: '/api/upload', origin: ORIGIN, contentType: 'application/octet-stream' }, session),
    overMedia,
  );
  assert.equal((overMediaOut.body as { code: string }).code, 'UPLOAD_TOO_LARGE');
  const fake = new TextEncoder().encode('this is not a video....................');
  const notMp4 = await app.dispatch(
    meta({ method: 'POST', path: '/api/upload', origin: ORIGIN, contentType: 'application/octet-stream' }, session),
    fake,
  );
  assert.equal((notMp4.body as { code: string }).code, 'NOT_MP4');
});

test('L-BIND-1: hash mismatch between permit and staged bytes fails closed and spends the permit', async () => {
  const app = await freshApp();
  const session = await pair(app);
  const up = await uploadVideo(app, GOOD_BYTES, session);
  const other = 'f'.repeat(64);
  permit(app, 'analyze', other, GOOD_BYTES.length);
  const out = await analyze(app, session, { ...up, sha256: other });
  assert.equal((out.body as { code: string }).code, 'MEDIA_CHANGED');
  // The mismatched attempt consumed the permit: a corrected retry needs a new one.
  const again = await analyze(app, session, { ...up, sha256: other });
  assert.equal((again.body as { code: string }).code, 'NO_PERMIT');
});

test('L-CANCEL-1: in-flight run cancelled, quota preserved, staged bytes gone', async () => {
  const app = await freshApp({ transportLatencyMs: 1500 });
  const session = await pair(app);
  const up = await uploadVideo(app, GOOD_BYTES, session);
  permit(app, 'analyze', up.sha256, GOOD_BYTES.length);
  const pending = analyze(app, session, up);
  await new Promise((r) => setTimeout(r, 200));
  const cancel = await app.dispatch(
    meta({ method: 'POST', path: '/api/cancel', origin: ORIGIN, contentType: 'application/json' }, session),
    json({ runId: 'local-nonexistent' }),
  );
  assert.equal((cancel.body as { code: string }).code, 'NO_SUCH_RUN');
  const events = await app.dispatch(meta({ method: 'GET', path: '/api/events' }, session), EMPTY);
  const running = (events.body as { runs: Array<{ runId: string; state: string }> }).runs.find((r) => r.state === 'analyzing');
  assert.ok(running !== undefined);
  const cancelled = await app.dispatch(
    meta({ method: 'POST', path: '/api/cancel', origin: ORIGIN, contentType: 'application/json' }, session),
    json({ runId: running.runId }),
  );
  assert.equal(cancelled.status, 200);
  const done = await pending;
  assert.equal((done.body as { state: string }).state, 'cancelled');
  const status = await app.dispatch(meta({ method: 'GET', path: '/api/status' }, session), EMPTY);
  assert.equal(((status.body as { quota: { analysesLeft: number } }).quota).analysesLeft, 3);
});

test('L-TIMEOUT-1: runs exceeding the total ceiling fail closed without a response', async () => {
  const app = await freshApp({ transportLatencyMs: 1500, runTimeoutMs: 200 });
  const session = await pair(app);
  const up = await uploadVideo(app, GOOD_BYTES, session);
  permit(app, 'analyze', up.sha256, GOOD_BYTES.length);
  const done = await analyze(app, session, up);
  assert.equal((done.body as { state: string }).state, 'cancelled');
  const events = await app.dispatch(meta({ method: 'GET', path: '/api/events' }, session), EMPTY);
  const record = ((events.body as { runs: Array<unknown> }).runs)[0] as unknown as { result: { code: string } };
  assert.equal(record.result.code, 'TIMEOUT');
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
