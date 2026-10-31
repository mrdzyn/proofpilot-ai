// UI-C3-02-I2: abnormal-shutdown cleanup (SIGTERM with a staged clip).
// Spawns the real owner CLI, stages a clip over HTTP, then SIGTERMs it and
// proves the staging tree is gone and the process exits cleanly. Requires
// loopback listeners: unsandboxed or hosted CI only.
//
// SIGKILL-class deaths cannot run handlers by definition; crash leftovers are
// covered by the L-SWEEP-1 unit test and documented in uploads.ts/CLI output.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { get, request } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const tmp = mkdtempSync(path.join(tmpdir(), 'pp-live-shutdown-'));
const clip = path.join(tmp, 'clip.mp4');

let child: ChildProcess | null = null;
let childOut = '';
let origin = '';
let stagingDir = '';

function waitForOutput(re: RegExp, timeoutMs: number, group = 1): Promise<string> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      const m = childOut.match(re);
      if (m?.[group] !== undefined) {
        clearInterval(timer);
        resolve(m[group]);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`never saw ${String(re)} in CLI output:\n${childOut}`));
      }
    }, 100);
  });
}

function waitForHttpOk(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = (): void => {
      const req = get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else if (Date.now() - start > timeoutMs) reject(new Error(`last status ${String(res.statusCode)}`));
        else setTimeout(attempt, 500);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error(`never reachable: ${url}`));
        else setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

function post(target: string, headers: Record<string, string>, body: Uint8Array): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(target, origin);
    const req = request(
      { host: '127.0.0.1', port: Number(url.port), path: url.pathname, method: 'POST', headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          let parsed: unknown = Buffer.concat(chunks).toString('utf8');
          try {
            parsed = JSON.parse(parsed as string);
          } catch {
            /* keep raw */
          }
          resolve({ status: res.statusCode ?? 0, body: parsed });
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

before(async () => {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=390x844:rate=15:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', clip], { stdio: ['ignore', 'ignore', 'inherit'] });
  child = spawn('node', ['scripts/c3-live-analysis.ts', '--port', '0', '--serve', 'none'], {
    cwd: repoRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (d: Buffer) => {
    childOut += d.toString();
  });
  child.stderr?.on('data', (d: Buffer) => {
    childOut += d.toString();
  });
  const port = await waitForOutput(/on http:\/\/127\.0\.0\.1:(\d+)/, 60_000);
  origin = `http://127.0.0.1:${port}`;
  stagingDir = await waitForOutput(/^staging: (\S+)/m, 15_000);
  await waitForHttpOk(`${origin}/api/health`, 60_000);
});

after(async () => {
  if (child !== null && child.exitCode === null) {
    child.kill('SIGKILL');
    await new Promise((r) => child!.once('close', r));
  }
  rmSync(tmp, { recursive: true, force: true });
});

test('L-SHUTDOWN-1: SIGTERM with a staged clip deletes staging and exits 0', async () => {
  assert.ok(origin.length > 0 && stagingDir.length > 0, 'CLI printed its port and staging dir');
  assert.ok(existsSync(stagingDir), 'staging root exists while running');
  const bytes = new Uint8Array(readFileSync(clip));
  const sha = createHash('sha256').update(bytes).digest('hex');
  // Pair + permit + upload through the real CLI/HTTP path.
  child!.stdin!.write('pair\n');
  const code = await waitForOutput(/pairing code.*?: (\d{8})/, 15_000);
  const host = new URL(origin).host;
  const paired = await post('/api/pair', { Host: host, Origin: origin, 'Content-Type': 'application/json' }, Buffer.from(JSON.stringify({ code })));
  assert.equal(paired.status, 200);
  const session = (paired.body as { sessionToken: string }).sessionToken;
  child!.stdin!.write(`permit analyze ${sha} ${String(bytes.length)}\n`);
  await new Promise((r) => setTimeout(r, 500));
  const upload = await post(
    '/api/upload',
    {
      Host: host,
      Origin: origin,
      'Content-Type': 'application/octet-stream',
      'X-Live-Session': session,
      'X-Live-Sha256': sha,
      'X-Live-Bytes': String(bytes.length),
      'X-Live-Action': 'analyze',
    },
    Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
  );
  assert.equal(upload.status, 200, JSON.stringify(upload.body));
  const staged = readdirSync(stagingDir, { recursive: true }) as string[];
  assert.ok(staged.some((e) => e.endsWith('upload.mp4')), `clip staged on disk, saw: ${staged.join(',')}`);
  // SIGTERM: the handler cancels runs, deletes staged bytes, exits 0.
  const closed = new Promise<number | null>((resolve) => child!.once('close', (c) => resolve(c)));
  child!.kill('SIGTERM');
  const exitCode = await closed;
  assert.equal(exitCode, 0, `CLI exits 0 on SIGTERM, got ${String(exitCode)}`);
  assert.ok(childOut.includes('closing on SIGTERM'), 'SIGTERM handler ran (not a kill fallback)');
  assert.ok(!existsSync(stagingDir), 'staging tree deleted on SIGTERM');
});
