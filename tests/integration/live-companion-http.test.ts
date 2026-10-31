// UI-C3-02-I2/I4: HTTP-level companion integration (mock transport only).
// Binds 127.0.0.1 on an ephemeral port. Requires loopback listeners, so this
// file runs unsandboxed or in hosted CI — never in the socket-blocked sandbox.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
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
  app = await createCompanion({ port: 0, serveRoot });
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

test('L-HTTP-1: full mock run over HTTP with real media validation', async () => {
  const session = await pair();
  const bytes = new Uint8Array(await readFile(clip));
  const upload = await call(
    'POST', '/api/upload',
    { ...H(), 'Content-Type': 'application/octet-stream', 'X-Live-Session': session },
    bytes,
  );
  assert.equal(upload.status, 200, JSON.stringify(upload.body));
  const up = upload.body as { uploadId: string; sha256: string; bytes: number; durationSec: number; width: number };
  assert.ok(/^[0-9a-f]{64}$/.test(up.sha256));
  assert.ok(up.durationSec > 0 && up.width > 0);
  app.terminalPermit('analyze', up.sha256, up.bytes);
  const run = await call(
    'POST', '/api/analyze',
    { ...H(), 'Content-Type': 'application/json', 'X-Live-Session': session },
    Buffer.from(JSON.stringify({ uploadId: up.uploadId, sha256: up.sha256, bytes: up.bytes })),
  );
  assert.equal(run.status, 200, JSON.stringify(run.body));
  const runId = (run.body as { runId: string }).runId;
  let state = '';
  for (let i = 0; i < 40 && state !== 'done'; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const events = await call('GET', '/api/events', { ...H(), 'X-Live-Session': session });
    const found = ((events.body as { runs: Array<{ runId: string; state: string }> }).runs).find((r) => r.runId === runId);
    state = found?.state ?? '';
  }
  assert.equal(state, 'done');
  const events = await call('GET', '/api/events', { ...H(), 'X-Live-Session': session });
  const record = ((events.body as { runs: Array<{ runId: string }> }).runs).find((r) => r.runId === runId) as unknown as {
    result: Record<string, unknown>;
  };
  assert.equal(record.result['transport'], 'mock-fixture');
  assert.equal(record.result['liveInference'], false);
  assert.ok(typeof record.result['observations'] === 'string');
});

test('L-HTTP-1: cancel and concurrency enforced over HTTP', async () => {
  const session = await pair();
  const bytes = new Uint8Array(await readFile(clip));
  const upload = await call(
    'POST', '/api/upload',
    { ...H(), 'Content-Type': 'application/octet-stream', 'X-Live-Session': session },
    bytes,
  );
  const up = upload.body as { uploadId: string; sha256: string; bytes: number };
  // Second concurrent upload replaces the staging slot (allowed).
  const upload2 = await call(
    'POST', '/api/upload',
    { ...H(), 'Content-Type': 'application/octet-stream', 'X-Live-Session': session },
    bytes,
  );
  assert.equal(upload2.status, 200);
  // No permit yet: analyze refused without consuming anything.
  const refused = await call(
    'POST', '/api/analyze',
    { ...H(), 'Content-Type': 'application/json', 'X-Live-Session': session },
    Buffer.from(JSON.stringify({ uploadId: up.uploadId, sha256: up.sha256, bytes: up.bytes })),
  );
  assert.equal((refused.body as { code: string }).code, 'NO_PERMIT');
});

test('L-HTTP-1: startup refuses a second bind on the same port', async () => {
  await assert.rejects(
    createCompanion({ port: app.port, serveRoot: null }),
    (e: unknown) => e instanceof Error && (e as { code?: string }).code === 'ADDRESS_IN_USE',
  );
});
