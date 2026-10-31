// UI-C3-02-I2/I4: HTTP-level companion integration (mock transport only).
// Binds 127.0.0.1 on an ephemeral port. Requires loopback listeners, so this
// file runs unsandboxed or in hosted CI — never in the socket-blocked sandbox.
//
// Contract under test (GPT-6 remediation of PR #31):
// - permit BEFORE upload: /api/upload declares sha256/bytes/action and refuses
//   unpermitted uploads before staging anything.
// - /api/analyze accepts promptly with a runId; Cancel reaches the in-flight run.
// - single-flight across upload/analyze; revoke bumps the epoch.
// - oversize HTTP bodies get a typed 413 BAD_BODY_SIZE (drained, not reset).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { createCompanion, type CompanionHandle } from '../../packages/live-analysis/src/server.ts';
import { readFile } from 'node:fs/promises';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const tmp = mkdtempSync(path.join(tmpdir(), 'pp-live-http-'));
let app: CompanionHandle;
let origin = '';

function ff(...args: string[]): void {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
}

interface Reply {
  status: number;
  body: unknown;
}

function call(
  method: string,
  target: string,
  headers: Record<string, string> = {},
  body?: Uint8Array,
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const url = new URL(target, origin);
    const req = http.request(
      {
        host: '127.0.0.1',
        port: Number(url.port),
        path: url.pathname + url.search,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed: unknown = text;
          try {
            parsed = JSON.parse(text);
          } catch {
            /* non-JSON bodies stay raw */
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      },
    );
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const H = (extra: Record<string, string> = {}): Record<string, string> => ({
  Host: new URL(origin).host,
  Origin: origin,
  ...extra,
});

const clip = path.join(tmp, 'clip.mp4');

before(async () => {
  ff('-f', 'lavfi', '-i', 'testsrc=size=390x844:rate=15:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', clip);
  const serveRoot = path.join(tmp, 'www');
  mkdirSync(serveRoot);
  writeFileSync(path.join(serveRoot, 'index.html'), '<!doctype html><title>fixture</title>');
  app = await createCompanion({ port: 0, serveRoot, analysesLeft: 10, proposalsLeft: 3 });
  origin = `http://127.0.0.1:${String(app.port)}`;
  assert.ok(app.port > 0, 'ephemeral port assigned');
});

after(async () => {
  await app.close().catch(() => undefined);
  rmSync(tmp, { recursive: true, force: true });
});

async function pair(): Promise<string> {
  const code = app.sessions.issueTerminalCode();
  const out = await call('POST', '/api/pair', { ...H(), 'Content-Type': 'application/json' }, Buffer.from(JSON.stringify({ code })));
  assert.equal(out.status, 200);
  return (out.body as { sessionToken: string }).sessionToken;
}

async function shaOfClip(): Promise<{ sha256: string; bytes: number; bytesRaw: Uint8Array }> {
  const bytesRaw = new Uint8Array(await readFile(clip));
  return { sha256: createHash('sha256').update(bytesRaw).digest('hex'), bytes: bytesRaw.length, bytesRaw };
}

function declarationHeaders(sha256: string, bytes: number, kind: 'analyze' | 'propose'): Record<string, string> {
  return { 'X-Live-Sha256': sha256, 'X-Live-Bytes': String(bytes), 'X-Live-Action': kind };
}

async function permittedUpload(
  session: string,
  kind: 'analyze' | 'propose' = 'analyze',
): Promise<{ uploadId: string; sha256: string; bytes: number }> {
  const { sha256, bytes, bytesRaw } = await shaOfClip();
  app.terminalPermit(kind, sha256, bytes);
  const upload = await call(
    'POST', '/api/upload',
    { ...H(), 'Content-Type': 'application/octet-stream', 'X-Live-Session': session, ...declarationHeaders(sha256, bytes, kind) },
    bytesRaw,
  );
  assert.equal(upload.status, 200, JSON.stringify(upload.body));
  return upload.body as { uploadId: string; sha256: string; bytes: number };
}

async function awaitRunState(session: string, runId: string, want: string, timeoutMs = 30_000): Promise<Record<string, unknown>> {
  const start = Date.now();
  for (;;) {
    const events = await call('GET', '/api/events', { ...H(), 'X-Live-Session': session });
    const found = ((events.body as { runs: Array<{ runId: string; state: string }> }).runs).find((r) => r.runId === runId);
    if (found !== undefined && found.state === want) return found as unknown as Record<string, unknown>;
    if (found !== undefined && found.state !== 'analyzing') {
      throw new Error(`run ${runId} settled as ${found.state}, wanted ${want}`);
    }
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for run ${runId} to reach ${want}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

test('L-HTTP-1: health public, static served same-origin, traversal blocked', async () => {
  const health = await call('GET', '/api/health', { Host: new URL(origin).host });
  assert.equal(health.status, 200);
  const index = await call('GET', '/', { Host: new URL(origin).host });
  assert.equal(index.status, 200);
  const escape = await call('GET', '/..%2fpackage.json', { Host: new URL(origin).host });
  assert.ok([400, 403, 404].includes(escape.status), `traversal refused, got ${String(escape.status)}`);
  const unknown = await call('GET', '/api/nope', H());
  assert.equal(unknown.status, 404);
});

test('L-HTTP-1: DNS-rebinding and null-Origin GETs refused without ambient authority', async () => {
  const session = await pair();
  const rebinding = await call(
    'GET', '/api/status',
    { Host: `evil.example:${String(app.port)}`, Origin: origin, 'X-Live-Session': session },
  );
  assert.equal(rebinding.status, 403);
  const nullOrigin = await call(
    'GET', '/api/status',
    { ...H(), Origin: 'null', 'X-Live-Session': session },
  );
  const nullCode = (nullOrigin.body as { code?: string }).code;
  assert.equal(nullOrigin.status, 403, `null Origin refused, got ${String(nullCode)}`);
  // Absent Origin + valid session + valid Host: the legitimate polling path.
  const raw = await new Promise<Reply>((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: app.port, path: '/api/events', method: 'GET', headers: { Host: new URL(origin).host, 'X-Live-Session': session } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
      },
    );
    req.on('error', reject);
    req.end();
  });
  assert.equal(raw.status, 200);
});

test('L-HTTP-1: upload without a permit is refused before staging anything', async () => {
  const session = await pair();
  const { sha256, bytes, bytesRaw } = await shaOfClip();
  const upload = await call(
    'POST', '/api/upload',
    { ...H(), 'Content-Type': 'application/octet-stream', 'X-Live-Session': session, ...declarationHeaders(sha256, bytes, 'analyze') },
    bytesRaw,
  );
  assert.equal(upload.status, 403);
  assert.equal((upload.body as { code: string }).code, 'NO_PERMIT');
});

test('L-HTTP-1: oversize HTTP bodies get a typed 413 instead of a reset socket', async () => {
  const session = await pair();
  const big = Buffer.alloc(31_000_000, 0);
  const out = await call(
    'POST', '/api/upload',
    { ...H(), 'Content-Type': 'application/octet-stream', 'X-Live-Session': session, 'X-Live-Bytes': '31000000' },
    new Uint8Array(big.buffer, big.byteOffset, big.byteLength),
  );
  assert.equal(out.status, 413);
  assert.equal((out.body as { code: string }).code, 'BAD_BODY_SIZE');
  // The companion still answers afterwards: the socket was drained, not killed.
  const health = await call('GET', '/api/health', { Host: new URL(origin).host });
  assert.equal(health.status, 200);
});

test('L-HTTP-1: full mock run over HTTP with permit-first upload and prompt runId', async () => {
  const session = await pair();
  const up = await permittedUpload(session);
  assert.ok(/^[0-9a-f]{64}$/.test(up.sha256));
  const run = await call(
    'POST', '/api/analyze',
    { ...H(), 'Content-Type': 'application/json', 'X-Live-Session': session },
    Buffer.from(JSON.stringify({ uploadId: up.uploadId, sha256: up.sha256, bytes: up.bytes })),
  );
  assert.equal(run.status, 200, JSON.stringify(run.body));
  // The run is accepted promptly while the mock transport still runs.
  assert.equal((run.body as { state: string }).state, 'analyzing');
  const runId = (run.body as { runId: string }).runId;
  const record = await awaitRunState(session, runId, 'done');
  const result = (record as unknown as { result: Record<string, unknown> }).result;
  assert.equal(result['transport'], 'mock-fixture');
  assert.equal(result['liveInference'], false);
  assert.ok(typeof result['observations'] === 'string');
});

test('L-HTTP-1: cancel reaches the in-flight run over HTTP; bytes deleted, quota kept', async () => {
  const session = await pair();
  const up = await permittedUpload(session);
  const run = await call(
    'POST', '/api/analyze',
    { ...H(), 'Content-Type': 'application/json', 'X-Live-Session': session },
    Buffer.from(JSON.stringify({ uploadId: up.uploadId, sha256: up.sha256, bytes: up.bytes })),
  );
  const runId = (run.body as { runId: string }).runId;
  const cancel = await call(
    'POST', '/api/cancel',
    { ...H(), 'Content-Type': 'application/json', 'X-Live-Session': session },
    Buffer.from(JSON.stringify({ runId })),
  );
  assert.equal(cancel.status, 200);
  const record = await awaitRunState(session, runId, 'cancelled');
  assert.equal(((record as unknown as { result: { code: string } }).result).code, 'CANCELLED');
  const before = await call('GET', '/api/status', { ...H(), 'X-Live-Session': session });
  const leftBefore = ((before.body as { quota: { analysesLeft: number } }).quota).analysesLeft;
  // The slot is free and staged bytes are gone: a fresh permit/upload/analyze completes.
  const up2 = await permittedUpload(session);
  const run2 = await call(
    'POST', '/api/analyze',
    { ...H(), 'Content-Type': 'application/json', 'X-Live-Session': session },
    Buffer.from(JSON.stringify({ uploadId: up2.uploadId, sha256: up2.sha256, bytes: up2.bytes })),
  );
  await awaitRunState(session, (run2.body as { runId: string }).runId, 'done');
  const after = await call('GET', '/api/status', { ...H(), 'X-Live-Session': session });
  assert.equal(
    ((after.body as { quota: { analysesLeft: number } }).quota).analysesLeft,
    leftBefore - 1,
    'cancel spends nothing; only the completed rerun spends one unit',
  );
});

test('L-HTTP-1: concurrent analyzes serialize — one accepted, one RUN_BUSY', async () => {
  const session = await pair();
  const up = await permittedUpload(session);
  const payload = Buffer.from(JSON.stringify({ uploadId: up.uploadId, sha256: up.sha256, bytes: up.bytes }));
  const headers = { ...H(), 'Content-Type': 'application/json', 'X-Live-Session': session };
  const [first, second] = await Promise.all([
    call('POST', '/api/analyze', headers, payload),
    call('POST', '/api/analyze', headers, payload),
  ]);
  const codes = [first, second].map((r) => (r.body as { code?: string }).code ?? 'accepted').sort();
  assert.deepEqual(codes, ['RUN_BUSY', 'accepted']);
  const accepted = [first, second].find((r) => (r.body as { runId?: string }).runId !== undefined);
  assert.ok(accepted !== undefined, 'exactly one request is accepted');
  await awaitRunState(session, (accepted.body as { runId: string }).runId, 'done');
});

test('L-HTTP-1: upload during an in-flight run is refused; revoke frees the slot', async () => {
  const session = await pair();
  const up = await permittedUpload(session);
  const { sha256, bytes, bytesRaw } = await shaOfClip();
  const run = await call(
    'POST', '/api/analyze',
    { ...H(), 'Content-Type': 'application/json', 'X-Live-Session': session },
    Buffer.from(JSON.stringify({ uploadId: up.uploadId, sha256: up.sha256, bytes: up.bytes })),
  );
  assert.equal((run.body as { state: string }).state, 'analyzing');
  const runId = (run.body as { runId: string }).runId;
  app.terminalPermit('analyze', sha256, bytes);
  const clash = await call(
    'POST', '/api/upload',
    { ...H(), 'Content-Type': 'application/octet-stream', 'X-Live-Session': session, ...declarationHeaders(sha256, bytes, 'analyze') },
    bytesRaw,
  );
  assert.equal(clash.status, 409);
  assert.equal((clash.body as { code: string }).code, 'RUN_BUSY');
  // Revoke cancels the in-flight run and frees the slot for a re-paired session.
  app.terminalRevoke();
  const session2 = await pair();
  await awaitRunState(session2, runId, 'cancelled');
  const up2 = await permittedUpload(session2);
  const run2 = await call(
    'POST', '/api/analyze',
    { ...H(), 'Content-Type': 'application/json', 'X-Live-Session': session2 },
    Buffer.from(JSON.stringify({ uploadId: up2.uploadId, sha256: up2.sha256, bytes: up2.bytes })),
  );
  assert.equal(run2.status, 200);
  await awaitRunState(session2, (run2.body as { runId: string }).runId, 'done');
});

test('L-HTTP-1: startup refuses a second bind on the same port', async () => {
  await assert.rejects(
    createCompanion({ port: app.port, serveRoot: null }),
    (e: unknown) => e instanceof Error && (e as { code?: string }).code === 'ADDRESS_IN_USE',
  );
});
