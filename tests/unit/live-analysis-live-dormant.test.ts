// UI-C3-02-BT-LIVE-01: live dormancy at the server boundary. The injected
// Baseten transport (mock fetch double, fake key) must never be invoked
// while D9 is pending: attempts refuse MODEL_UNAVAILABLE_OR_UNAPPROVED
// before any slot, permit, or quota is touched. Socket-free dispatch only.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCompanion, type ApiMeta, type Companion } from '../../packages/live-analysis/src/server.ts';
import { LocalSessionManager } from '../../packages/live-analysis/src/local-session.ts';
import { OfflineMockPermitLedger } from '../../packages/live-analysis/src/mock-permits.ts';
import { BASETEN_DOCUMENTED_DIRECT_MODEL } from '../../packages/live-analysis/src/config.ts';
import {
  createBasetenTransport,
  type BasetenTransport,
  type LiveFetch,
  type LiveFetchResponse,
} from '../../packages/live-analysis/src/baseten-transport.ts';
import { BASETEN_APPROVED_ENDPOINT } from '../../packages/live-analysis/src/config.ts';
import { StagedUploads } from '../../packages/live-analysis/src/uploads.ts';
import type { MediaDeps } from '../../packages/intake/src/media.ts';

const HOST = '127.0.0.1:5188';
const PORT = 5188;
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

/**
 * Injected fetch double. Records invocations; returns a well-formed live
 * envelope so any accidental invocation completes instead of hanging — the
 * tests assert the count stays zero.
 */
function countingDouble(calls: { count: number }): LiveFetch {
  return (url, init) => {
    calls.count += 1;
    assert.equal(url, BASETEN_APPROVED_ENDPOINT);
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['Authorization'], 'Bearer NOT-A-REAL-KEY-0000');
    const response: LiveFetchResponse = {
      status: 200,
      url,
      json: () => Promise.resolve({
        model: BASETEN_DOCUMENTED_DIRECT_MODEL,
        choices: [{ message: { content: 'live tap then count one' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    };
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

async function freshLiveApp(calls: { count: number }): Promise<Companion> {
  const sub = mkdtempSync(path.join(root, 'app-'));
  const app = await createCompanion({
    port: PORT,
    bind: false,
    serveRoot: null,
    uploads: StagedUploads.openDir(sub, { mediaDeps: stubMedia }),
    runTimeoutMs: 5000,
    session: new LocalSessionManager(),
    permits: new OfflineMockPermitLedger(),
    liveTransport: liveTransportDouble(calls),
    liveModel: BASETEN_DOCUMENTED_DIRECT_MODEL,
  });
  closers.push(() => app.close().catch(() => undefined));
  return app;
}

before(() => {
  root = mkdtempSync(path.join(tmpdir(), 'pp-live-dormant-'));
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

async function pair(app: Companion): Promise<string> {
  const code = app.sessions.issueTerminalCode();
  const out = await app.dispatch(
    meta({ method: 'POST', path: '/api/pair', origin: ORIGIN, contentType: 'application/json' }),
    json({ code }),
  );
  assert.equal(out.status, 200, JSON.stringify(out.body));
  return (out.body as { sessionToken: string }).sessionToken;
}

test('L-LIVE-1: live analyze refuses D9-first with zero provider calls and no slot, permit, or quota spent', async () => {
  const calls = { count: 0 };
  const app = await freshLiveApp(calls);
  const session = await pair(app);
  const sha = shaOf(GOOD_BYTES);
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
  assert.equal(out.status, 403, JSON.stringify(out.body));
  assert.equal((out.body as { code: string }).code, 'MODEL_UNAVAILABLE_OR_UNAPPROVED');
  assert.equal(calls.count, 0, 'the live transport was never invoked');
  const status = await app.dispatch(meta({ method: 'GET', path: '/api/status' }, session), new Uint8Array(0));
  assert.equal(((status.body as { quota: { analysesLeft: number } }).quota).analysesLeft, 3, 'no quota spent');
  assert.equal(((status.body as { busy: boolean }).busy), false, 'no slot taken');
  const second = app.terminalPermit('propose', shaOf(GOOD_BYTES), GOOD_BYTES.length);
  assert.equal(second.ok, false, 'the first permit is still pending, not consumed');
  assert.equal((second as { ok: false; code: string }).code, 'PERMIT_PENDING');
});

test('L-LIVE-2: live propose refuses the same way; concurrent live attempts serialize as refusals', async () => {
  const calls = { count: 0 };
  const app = await freshLiveApp(calls);
  const session = await pair(app);
  const sha = shaOf(GOOD_BYTES);
  assert.equal(app.terminalPermit('propose', sha, GOOD_BYTES.length).ok, true);
  const up = await app.dispatch(
    meta({ method: 'POST', path: '/api/upload', origin: ORIGIN, contentType: 'application/octet-stream', declaredSha256: sha, declaredBytes: String(GOOD_BYTES.length), declaredKind: 'propose' }, session),
    GOOD_BYTES,
  );
  assert.equal(up.status, 200, JSON.stringify(up.body));
  const attempt = (): Promise<{ status: number; body: unknown }> => app.dispatch(
    meta({ method: 'POST', path: '/api/propose', origin: ORIGIN, contentType: 'application/json' }, session),
    json({ uploadId: (up.body as { uploadId: string }).uploadId, sha256: sha, bytes: GOOD_BYTES.length }),
  );
  const [first, second] = await Promise.all([attempt(), attempt()]);
  assert.equal(first.status, 403);
  assert.equal(second.status, 403);
  assert.equal((first.body as { code: string }).code, 'MODEL_UNAVAILABLE_OR_UNAPPROVED');
  assert.equal((second.body as { code: string }).code, 'MODEL_UNAVAILABLE_OR_UNAPPROVED');
  assert.equal(calls.count, 0, 'no provider call under concurrency either');
});
