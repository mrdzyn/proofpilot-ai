// UI-C3-02-D9 (activation): owner-started CLI activation gates. Spawns the
// real script with controlled environments (fake credentials override any
// inherited values, so the real `.env.local` is never read): `--live`
// requires the D9 pin plus key/URL/model gates, mock mode never arms live
// or prints keys, and no provider traffic is possible without --live.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { APPROVED_F01_MEDIA_SHA256 } from '../../packages/live-analysis/src/config.ts';
import { openSpentRecord } from '../../packages/live-analysis/src/live-spent-record.ts';

const SCRIPT = path.resolve(import.meta.dirname, '../../scripts/c3-live-analysis.ts');
const FAKE_KEY = 'NOT-A-REAL-KEY-0000-D9I1';
const FAKE_BASE = 'https://inference.baseten.co/v1';
const FAKE_MODEL = 'meta-models/muse-spark-open-1026';
// Owner-approved F01 media pin under test (byte-identical to the certified
// F01 mobile recording; asserted in L-CFG). Never a real credential.
const F01_PIN = APPROVED_F01_MEDIA_SHA256;
assert.equal(F01_PIN, 'e9df68b14c48300818f9ec9407b884413037f29305f17a5da3cc4fac05eeafdf');

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
  assert.match(combined, /model=meta-models\/muse-spark-open-1026/, 'banner names the exact hackathon-approved model');
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
  // The unsuffixed public ID was approved in error (PR #36); the
  // hackathon-issued key authorizes only the -1026 ID, so it refuses here —
  // in --live and in --preflight — with no listener and no network.
  for (const mode of [['--live', '--port', '0'], ['--preflight']] as const) {
    const generic = await runCli([...mode], { ...fakeEnv(), BASETEN_MODEL: 'meta-models/muse-spark-open' });
    const combined = `${generic.stdout}\n${generic.stderr}`;
    assert.equal(generic.code, 2, `unsuffixed public ID refuses in ${mode[0]} (got ${generic.code})`);
    assert.match(combined, /live model is not approved/, 'no public-listing fallback, no translation');
    assert.ok(!combined.includes('on http://127.0.0.1'), 'no listener starts on refusal');
    assertNoKeyLeak('unsuffixed-model refusal', combined);
  }
  const noRecord = await runCli(['--live', '--port', '0', '--live-analyses', '1', '--live-media-sha256', F01_PIN, '--live-approval-id', 'd9live-v2-test-cli-4'], fakeEnv());
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

test('L-CLI-6: proposals refuse (zero-proposal policy); repeatable analysis counts arm', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pp-cli-record-'));
  try {
    const record = path.join(dir, 'spent.jsonl');
    // Any proposal budget refuses with no listener and no egress — finite
    // or proposal-only (and `unlimited` is not even a proposals value).
    const refusals: { args: string[]; pattern: RegExp; label: string }[] = [
      {
        args: ['--live', '--port', '0', '--live-analyses', '1', '--live-proposals', '1', '--live-media-sha256', F01_PIN, '--live-spent-record', record],
        pattern: /--live-proposals must be 0/,
        label: '1 proposal',
      },
      {
        args: ['--live', '--port', '0', '--live-proposals', '1', '--live-spent-record', record],
        pattern: /--live-proposals must be 0/,
        label: 'proposal-only budget',
      },
      {
        args: ['--live', '--port', '0', '--live-analyses', '1', '--live-proposals', 'unlimited', '--live-media-sha256', F01_PIN, '--live-spent-record', record],
        pattern: /--live-proposals must be a canonical non-negative integer/,
        label: 'unlimited proposals',
      },
    ];
    for (const { args, pattern, label } of refusals) {
      const out = await runCli(args, fakeEnv());
      const combined = `${out.stdout}\n${out.stderr}`;
      assert.equal(out.code, 2, `${label} refuses with exit 2 (got ${out.code}): ${combined}`);
      assert.match(combined, pattern, `${label} names the zero-proposal bound`);
      assert.ok(!combined.includes('on http://127.0.0.1'), `${label}: no listener starts on refusal`);
      assertNoKeyLeak(label, combined);
    }
    // Repeatable analysis budgets arm cleanly (standing policy, issue #39):
    // finite counts start with the exact pin, a record path, and a fresh
    // bootstrap approval (one ledger per count, so no genesis is reused).
    for (const analyses of ['2', '10']) {
      const out = await runCli(
        ['--live', '--port', '0', '--serve', 'none',
          '--live-analyses', analyses, '--live-proposals', '0',
          '--live-spent-record', path.join(dir, `spent-${analyses}.jsonl`),
          '--live-media-sha256', F01_PIN,
          '--live-approval-id', `d9live-v2-test-cli-6-${analyses}`],
        fakeEnv(),
      );
      const combined = `${out.stdout}\n${out.stderr}`;
      assert.equal(out.code, 0, `analyses=${analyses} arms (got ${out.code}): ${combined}`);
      assert.match(combined, new RegExp(`budget=analyses:${analyses} proposals:0`), 'banner names the finite budget');
      assertNoKeyLeak(`analyses=${analyses}`, combined);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('L-CLI-6b: unlimited analyses arm only under the versioned standing identity', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pp-cli-unlimited-'));
  try {
    // Unlimited with the versioned standing identity arms cleanly.
    const ok = await runCli(
      ['--live', '--port', '0', '--serve', 'none',
        '--live-analyses', 'unlimited', '--live-proposals', '0',
        '--live-spent-record', path.join(dir, 'spent.jsonl'),
        '--live-media-sha256', F01_PIN,
        '--live-approval-id', 'd9live-v2-test-cli-6b'],
      fakeEnv(),
    );
    const okCombined = `${ok.stdout}\n${ok.stderr}`;
    assert.equal(ok.code, 0, `unlimited with standing identity arms (got ${ok.code}): ${okCombined}`);
    assert.match(okCombined, /budget=analyses:unlimited proposals:0/, 'banner names the unlimited opt-in');
    assertNoKeyLeak('unlimited arming', okCombined);
    // Unlimited with a legacy (non-namespaced) approval id refuses before
    // the companion starts — no listener, no network.
    const legacy = await runCli(
      ['--live', '--port', '0', '--serve', 'none',
        '--live-analyses', 'unlimited',
        '--live-spent-record', path.join(dir, 'legacy.jsonl'),
        '--live-media-sha256', F01_PIN,
        '--live-approval-id', 'd9i1-test-bootstrap-cli-legacy'],
      fakeEnv(),
    );
    const legacyCombined = `${legacy.stdout}\n${legacy.stderr}`;
    assert.equal(legacy.code, 2, `legacy approval id refuses unlimited (got ${legacy.code}): ${legacyCombined}`);
    assert.match(legacyCombined, /requires an explicit versioned standing approval id/, 'names the identity requirement');
    assert.ok(!legacyCombined.includes('on http://127.0.0.1'), 'no listener starts on refusal');
    assertNoKeyLeak('legacy identity refusal', legacyCombined);
    // Unlimited with an omitted approval id refuses too — omission never
    // implicitly adopts a ledger.
    const omitted = await runCli(
      ['--live', '--port', '0', '--serve', 'none',
        '--live-analyses', 'unlimited',
        '--live-spent-record', path.join(dir, 'omitted.jsonl'),
        '--live-media-sha256', F01_PIN],
      fakeEnv(),
    );
    const omittedCombined = `${omitted.stdout}\n${omitted.stderr}`;
    assert.equal(omitted.code, 2, `omitted approval id refuses unlimited (got ${omitted.code}): ${omittedCombined}`);
    assert.match(omittedCombined, /requires an explicit versioned standing approval id/, 'omission refuses');
    assert.ok(!omittedCombined.includes('on http://127.0.0.1'), 'no listener starts on refusal');
    assertNoKeyLeak('omitted identity refusal', omittedCombined);
    // Unlimited without a record path refuses (restart can never re-arm
    // an in-memory-only budget).
    const noRecord = await runCli(
      ['--live', '--port', '0', '--live-analyses', 'unlimited',
        '--live-media-sha256', F01_PIN,
        '--live-approval-id', 'd9live-v2-test-cli-6b-norecord'],
      fakeEnv(),
    );
    const noRecordCombined = `${noRecord.stdout}\n${noRecord.stderr}`;
    assert.equal(noRecord.code, 2, `unlimited without a record refuses (got ${noRecord.code}): ${noRecordCombined}`);
    assert.match(noRecordCombined, /--live-spent-record/, 'record rule holds for unlimited');
    assertNoKeyLeak('unlimited record refusal', noRecordCombined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('L-CLI-7: malformed live-budget numerics refuse instead of truncating', async () => {
  for (const value of ['1junk', '1.0', '+1', ' 1', '', '00x', '-1', '-0']) {
    const out = await runCli(['--live', '--port', '0', '--live-analyses', value], fakeEnv());
    const combined = `${out.stdout}\n${out.stderr}`;
    assert.equal(out.code, 2, `analyses=${JSON.stringify(value)} refuses (got ${out.code}): ${combined}`);
    assert.match(combined, /canonical non-negative integer/, 'names the malformed numeric');
    assert.ok(!combined.includes('on http://127.0.0.1'), 'no listener starts on refusal');
    assertNoKeyLeak('malformed numeric', combined);
  }
});

test('L-CLI-8: positive live-analysis budgets require the exact F01 media pin', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pp-cli-pin-'));
  try {
    const record = path.join(dir, 'spent.jsonl');
    const base = ['--live', '--port', '0', '--live-analyses', '1', '--live-spent-record', record];
    const wrongPin = '0'.repeat(64);
    const cases: { args: string[]; pattern: RegExp; label: string }[] = [
      { args: base, pattern: /--live-media-sha256/, label: 'omitted pin' },
      { args: [...base, '--live-media-sha256', wrongPin], pattern: /--live-media-sha256/, label: 'mismatched pin' },
      { args: [...base, '--live-media-sha256', 'not-hex'], pattern: /--live-media-sha256/, label: 'malformed pin' },
      { args: [...base, '--live-media-sha256', ''], pattern: /--live-media-sha256/, label: 'empty pin' },
    ];
    for (const { args, pattern, label } of cases) {
      const out = await runCli(args, fakeEnv());
      const combined = `${out.stdout}\n${out.stderr}`;
      assert.equal(out.code, 2, `${label} refuses with exit 2 (got ${out.code}): ${combined}`);
      assert.match(combined, pattern, `${label} names the pin requirement`);
      assert.ok(!combined.includes('on http://127.0.0.1'), `${label}: no listener starts on refusal`);
      assertNoKeyLeak(label, combined);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('L-CLI-9: the approved 1-analysis/0-proposal budget with the exact F01 pin arms cleanly', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pp-cli-approved-'));
  try {
    const record = path.join(dir, 'spent.jsonl');
    const out = await runCli(
      ['--live', '--port', '0', '--serve', 'none',
        '--live-analyses', '1', '--live-proposals', '0',
        '--live-spent-record', record,
        '--live-media-sha256', F01_PIN,
        '--live-approval-id', 'd9live-v2-test-cli-9'],
      fakeEnv(),
    );
    const combined = `${out.stdout}\n${out.stderr}`;
    assert.equal(out.code, 0, `approved 1/0 budget with the exact pin starts (got ${out.code}): ${combined}`);
    assert.match(combined, /LIVE Baseten path ARMED/, 'armed banner shown');
    assert.match(combined, /budget=analyses:1 proposals:0/, 'configured budget is exactly the approved 1/0');
    assert.match(combined, /pin=set/, 'pin is recorded as set without printing its value');
    assert.ok(!combined.includes(F01_PIN), 'the pin value itself is never printed');
    assertNoKeyLeak('approved budget', combined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('L-CLI-10: MAJOR-1 — positive finite budgets cannot reuse a historical ledger', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pp-cli-major1-'));
  try {
    // A seeded historical one-shot ledger: legacy (non-namespaced) genesis
    // plus one durable spend.
    const historical = path.join(dir, 'historical.jsonl');
    const seed = openSpentRecord(historical, { bootstrapApprovalId: 'd9i1-legacy-one-shot' });
    seed.record({ runId: 'local-2026-11-02-001', sha256: F01_PIN, kind: 'analyze', spentAt: 1 });
    seed.release();
    const beforeHistorical = readFileSync(historical, 'utf8');
    // A seeded standing ledger: versioned genesis plus one spend.
    const standing = path.join(dir, 'standing.jsonl');
    const seedStanding = openSpentRecord(standing, { bootstrapApprovalId: 'd9live-v2-test-cli-10' });
    seedStanding.record({ runId: 'local-2026-11-02-001', sha256: F01_PIN, kind: 'analyze', spentAt: 1 });
    seedStanding.release();
    const beforeStanding = readFileSync(standing, 'utf8');

    const refusals: { args: string[]; label: string }[] = [
      // Historical ledger + finite budget, id omitted.
      { args: ['--live', '--port', '0', '--live-analyses', '2', '--live-media-sha256', F01_PIN, '--live-spent-record', historical], label: 'historical + 2, id omitted' },
      // Historical ledger + finite budget 10, legacy id supplied.
      { args: ['--live', '--port', '0', '--live-analyses', '10', '--live-media-sha256', F01_PIN, '--live-spent-record', historical, '--live-approval-id', 'd9i1-legacy-one-shot'], label: 'historical + 10, legacy id' },
      // Historical ledger + finite budget, foreign v2 id (genesis mismatch).
      { args: ['--live', '--port', '0', '--live-analyses', '2', '--live-media-sha256', F01_PIN, '--live-spent-record', historical, '--live-approval-id', 'd9live-v2-test-cli-10-other'], label: 'historical + 2, foreign v2 id' },
      // Existing standing ledger + finite budget, id omitted.
      { args: ['--live', '--port', '0', '--live-analyses', '2', '--live-media-sha256', F01_PIN, '--live-spent-record', standing], label: 'standing + 2, id omitted' },
      // Existing standing ledger + mismatched standing id.
      { args: ['--live', '--port', '0', '--live-analyses', '2', '--live-media-sha256', F01_PIN, '--live-spent-record', standing, '--live-approval-id', 'd9live-v2-test-cli-10-other'], label: 'standing + 2, mismatched id' },
    ];
    for (const { args, label } of refusals) {
      const out = await runCli(args, fakeEnv());
      const combined = `${out.stdout}\n${out.stderr}`;
      assert.equal(out.code, 2, `${label} refuses with exit 2 (got ${out.code}): ${combined}`);
      assert.match(combined, /versioned standing approval id|does not match the record genesis/, `${label} names the identity rule`);
      assert.ok(!combined.includes('on http://127.0.0.1'), `${label}: no listener starts on refusal`);
      assertNoKeyLeak(label, combined);
    }
    assert.equal(readFileSync(historical, 'utf8'), beforeHistorical, 'historical ledger bytes unchanged');
    assert.equal(readFileSync(standing, 'utf8'), beforeStanding, 'standing ledger bytes unchanged');

    // Restart with the matching standing identity proceeds (same ledger, same id).
    const first = await runCli(
      ['--live', '--port', '0', '--serve', 'none',
        '--live-analyses', '2', '--live-proposals', '0',
        '--live-spent-record', standing,
        '--live-media-sha256', F01_PIN,
        '--live-approval-id', 'd9live-v2-test-cli-10'],
      fakeEnv(),
    );
    assert.equal(first.code, 0, `matching-id reopen arms (got ${first.code}): ${first.stdout}\n${first.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('L-CLI-10b: MAJOR-1 — zero-spend historical ledger cannot seed a finite budget', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pp-cli-major1b-'));
  try {
    // A historical genesis with NO spends: still not a standing ledger.
    const empty = path.join(dir, 'historical-empty.jsonl');
    openSpentRecord(empty, { bootstrapApprovalId: 'd9i1-legacy-empty' }).release();
    const before = readFileSync(empty, 'utf8');
    const out = await runCli(
      ['--live', '--port', '0', '--live-analyses', '2',
        '--live-media-sha256', F01_PIN,
        '--live-spent-record', empty,
        '--live-approval-id', 'd9live-v2-test-cli-10b'],
      fakeEnv(),
    );
    const combined = `${out.stdout}\n${out.stderr}`;
    assert.equal(out.code, 2, `zero-spend historical ledger refuses (got ${out.code}): ${combined}`);
    assert.match(combined, /does not match the record genesis/, 'genesis binding refuses the foreign ledger');
    assert.ok(!combined.includes('on http://127.0.0.1'), 'no listener starts on refusal');
    assertNoKeyLeak('zero-spend historical', combined);
    assert.equal(readFileSync(empty, 'utf8'), before, 'historical ledger bytes unchanged');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('L-CLI-3: mock mode ignores the live variables and never arms live', async () => {
  const out = await runCli(['--port', '0', '--serve', 'none'], fakeEnv(), 'ignore');
  assert.equal(out.code, 0, `mock companion starts and exits cleanly (got ${out.code}): ${out.stdout} ${out.stderr}`);
  assert.match(out.stdout, /mock transport, no live inference/, 'mock banner shown');
  assert.ok(!out.stdout.includes('ARMED'), 'live is never armed without --live, even with the variables set');
  assertNoKeyLeak('mock startup', `${out.stdout}\n${out.stderr}`);
});
