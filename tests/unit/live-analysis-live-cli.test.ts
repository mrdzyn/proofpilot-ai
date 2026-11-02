// UI-C3-02-D9-I1: owner-started CLI activation gates. Spawns the real
// script with controlled environments (fake credentials override any
// inherited values, so the real `.env.local` is never read): `--live`
// refuses while D9 is pending, mock mode never arms live or prints keys,
// and no provider traffic is possible (no listener is even bound on refusal).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';

const SCRIPT = path.resolve(import.meta.dirname, '../../scripts/c3-live-analysis.ts');
const FAKE_KEY = 'NOT-A-REAL-KEY-0000-D9I1';
const FAKE_BASE = 'https://inference.baseten.co/v1';
const FAKE_MODEL = 'meta-models/muse-spark-open';

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runCli(args: string[], env: Record<string, string | undefined>, stdin: 'ignore' | 'pipe' = 'pipe'): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], {
      env: { ...process.env, ...env },
      stdio: [stdin, 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`CLI did not exit in time: ${args.join(' ')}\nstdout=${stdout}\nstderr=${stderr}`));
    }, 30_000);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    if (stdin === 'pipe') {
      child.stdin?.end();
    }
  });
}

function fakeEnv(): Record<string, string | undefined> {
  return {
    BASETEN_API_KEY: FAKE_KEY,
    BASETEN_API_BASE_URL: FAKE_BASE,
    BASETEN_MODEL: FAKE_MODEL,
  };
}

function assertNoKeyLeak(where: string, output: string): void {
  assert.ok(!output.includes(FAKE_KEY), `${where}: credential value must never be printed`);
}

test('L-CLI-1: --live refuses while D9 is pending, without binding or leaking', async () => {
  const out = await runCli(['--live', '--port', '0'], fakeEnv());
  assert.equal(out.code, 2, `refuses with exit 2 (got ${out.code}): ${out.stdout} ${out.stderr}`);
  const combined = `${out.stdout}\n${out.stderr}`;
  assert.match(combined, /D9 pending/, 'refusal names the D9 gate');
  assertNoKeyLeak('live refusal', combined);
  assert.ok(!combined.includes('on http://127.0.0.1'), 'no listener starts on refusal');
});

test('L-CLI-2: --live without a key still refuses at the D9 gate first', async () => {
  const out = await runCli(['--live', '--port', '0'], {
    BASETEN_API_KEY: undefined,
    BASETEN_API_BASE_URL: FAKE_BASE,
    BASETEN_MODEL: FAKE_MODEL,
  });
  assert.equal(out.code, 2, `refuses with exit 2 (got ${out.code}): ${out.stdout} ${out.stderr}`);
  assert.match(`${out.stdout}\n${out.stderr}`, /D9 pending/, 'D9 gate fires before credential checks');
});

test('L-CLI-3: mock mode ignores the live variables and never arms live', async () => {
  const out = await runCli(['--port', '0', '--serve', 'none'], fakeEnv(), 'ignore');
  assert.equal(out.code, 0, `mock companion starts and exits cleanly (got ${out.code}): ${out.stdout} ${out.stderr}`);
  assert.match(out.stdout, /mock transport, no live inference/, 'mock banner shown');
  assert.ok(!out.stdout.includes('ARMED'), 'live is never armed without --live, even with the variables set');
  assertNoKeyLeak('mock startup', `${out.stdout}\n${out.stderr}`);
});
