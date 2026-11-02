// UI-C3-02-D9 (activation): owner-started CLI activation gates. Spawns the
// real script with controlled environments (fake credentials override any
// inherited values, so the real `.env.local` is never read): `--live`
// requires the D9 pin plus key/URL/model gates, mock mode never arms live
// or prints keys, and no provider traffic is possible without --live.
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

test('L-CLI-1: --live passes the D9 pin and arms with zero budgets, without leaking', async () => {
  const out = await runCli(['--live', '--port', '0', '--serve', 'none'], fakeEnv());
  assert.equal(out.code, 0, `zero-budget live companion starts and exits cleanly (got ${out.code}): ${out.stdout} ${out.stderr}`);
  const combined = `${out.stdout}\n${out.stderr}`;
  assert.match(combined, /LIVE Baseten path ARMED/, 'armed banner shown after the pin');
  assert.match(combined, /model=meta-models\/muse-spark-open/, 'banner names the exact approved model');
  assert.match(combined, /budget=analyses:0 proposals:0/, 'live budgets stay zero by default');
  assertNoKeyLeak('live startup', combined);
});

test('L-CLI-2: --live without a key refuses, naming the missing key', async () => {
  const out = await runCli(['--live', '--port', '0'], {
    BASETEN_API_KEY: undefined,
    BASETEN_API_BASE_URL: FAKE_BASE,
    BASETEN_MODEL: FAKE_MODEL,
  });
  assert.equal(out.code, 2, `refuses with exit 2 (got ${out.code}): ${out.stdout} ${out.stderr}`);
  assert.match(`${out.stdout}\n${out.stderr}`, /BASETEN_API_KEY/, 'missing-key gate fires');
  assert.ok(!`${out.stdout}\n${out.stderr}`.includes('on http://127.0.0.1'), 'no listener starts on refusal');
});

test('L-CLI-4: --live refuses a mismatched model and a budget without a record', async () => {
  const wrongModel = await runCli(['--live', '--port', '0'], { ...fakeEnv(), BASETEN_MODEL: 'meta/muse-spark-open' });
  assert.equal(wrongModel.code, 2, `alias model refuses (got ${wrongModel.code})`);
  assert.match(`${wrongModel.stdout}\n${wrongModel.stderr}`, /live model is not approved/, 'no alias, no translation');
  assertNoKeyLeak('model refusal', `${wrongModel.stdout}\n${wrongModel.stderr}`);
  const noRecord = await runCli(['--live', '--port', '0', '--live-analyses', '1'], fakeEnv());
  assert.equal(noRecord.code, 2, `nonzero budget without a record refuses (got ${noRecord.code})`);
  assert.match(`${noRecord.stdout}\n${noRecord.stderr}`, /--live-spent-record/, 'restart cannot re-arm an in-memory-only budget');
  assertNoKeyLeak('record refusal', `${noRecord.stdout}\n${noRecord.stderr}`);
});

test('L-CLI-5: --preflight gates before any fetch; combined flags refuse', async () => {
  // Wrong model: the D9 gate fires before any network is possible.
  const wrongModel = await runCli(['--preflight'], { ...fakeEnv(), BASETEN_MODEL: 'meta/muse-spark-open' });
  assert.equal(wrongModel.code, 2, `preflight model gate refuses (got ${wrongModel.code})`);
  assert.match(`${wrongModel.stdout}\n${wrongModel.stderr}`, /live model is not approved/);
  // Missing key: the credential gate fires before any network is possible.
  const noKey = await runCli(['--preflight'], { ...fakeEnv(), BASETEN_API_KEY: undefined });
  assert.equal(noKey.code, 2, `preflight key gate refuses (got ${noKey.code})`);
  assert.match(`${noKey.stdout}\n${noKey.stderr}`, /BASETEN_API_KEY/);
  // Combined flags are never ambiguous.
  const both = await runCli(['--live', '--preflight', '--port', '0'], fakeEnv());
  assert.equal(both.code, 2, `combined flags refuse (got ${both.code})`);
  assert.match(`${both.stdout}\n${both.stderr}`, /cannot be combined/);
  for (const out of [wrongModel, noKey, both]) {
    assertNoKeyLeak('preflight refusal', `${out.stdout}\n${out.stderr}`);
    assert.ok(!`${out.stdout}\n${out.stderr}`.includes('on http://127.0.0.1'), 'preflight never binds');
  }
});

test('L-CLI-3: mock mode ignores the live variables and never arms live', async () => {
  const out = await runCli(['--port', '0', '--serve', 'none'], fakeEnv(), 'ignore');
  assert.equal(out.code, 0, `mock companion starts and exits cleanly (got ${out.code}): ${out.stdout} ${out.stderr}`);
  assert.match(out.stdout, /mock transport, no live inference/, 'mock banner shown');
  assert.ok(!out.stdout.includes('ARMED'), 'live is never armed without --live, even with the variables set');
  assertNoKeyLeak('mock startup', `${out.stdout}\n${out.stderr}`);
});
