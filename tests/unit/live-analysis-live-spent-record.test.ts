// UI-C3-02-D9-I1/I17: durable spent-run record with exclusive ownership.
// A restart — or a second process — must never recreate spent
// authorization: missing/empty records initialize only with an explicit
// owner bootstrap approval, exactly one holder owns the record at a time,
// any existing lock (live or stale) refuses with no automatic takeover,
// and unsafe files refuse. Crash recovery is owner-supervised only.
// Injected temp paths only; no credentials anywhere.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, symlinkSync, mkdirSync, chmodSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  checkSnapshotContinuity,
  LiveSpendRecordError,
  openSpentRecord,
  remainingLiveBudget,
} from '../../packages/live-analysis/src/live-spent-record.ts';

let root = '';
before(() => {
  root = mkdtempSync(path.join(tmpdir(), 'pp-spent-record-'));
});
after(() => {
  rmSync(root, { recursive: true, force: true });
});

const sub = (name: string): string => path.join(root, name);
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const BOOT = 'test-bootstrap-approval-001';
// A PID that cannot exist on macOS/Linux (above the maximum PID).
const DEAD_PID = 2147483647;

function lastDigest(recordPath: string): string {
  const lines = readFileSync(recordPath, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l !== '');
  const last = JSON.parse(lines[lines.length - 1] as string) as { digest: string };
  return last.digest;
}

test('L-REC-1: missing record refuses without a bootstrap approval; with one it initializes', () => {
  const p = sub('fresh.jsonl');
  assert.throws(
    () => openSpentRecord(p),
    (error: unknown) => error instanceof LiveSpendRecordError && error.code === 'LIVE_SPEND_RECORD_MISSING',
    'no silent auto-create: deletion must not re-arm',
  );
  const rec = openSpentRecord(p, { bootstrapApprovalId: BOOT });
  assert.equal(rec.countSpent('analyze'), 0);
  assert.equal(rec.countSpent('propose'), 0);
  rec.release();
  // The initialized record opens without a further approval.
  const reopened = openSpentRecord(p);
  assert.equal(reopened.countSpent('analyze'), 0);
  reopened.release();
});

test('L-REC-2: recorded sends survive a reopen; budgets subtract recorded spend', () => {
  const p = sub('roundtrip.jsonl');
  const first = openSpentRecord(p, { bootstrapApprovalId: BOOT });
  first.record({ runId: 'local-2026-11-02-001', sha256: SHA_A, kind: 'analyze', spentAt: 1000 });
  assert.equal(first.countSpent('analyze'), 1);
  first.release();
  const second = openSpentRecord(p);
  assert.equal(second.countSpent('analyze'), 1, 'a restart-equivalent reopen sees the spent attempt');
  assert.equal(second.countSpent('propose'), 0);
  second.record({ runId: 'local-2026-11-02-002', sha256: SHA_B, kind: 'propose', spentAt: 2000 });
  second.release();
  const third = openSpentRecord(p);
  assert.equal(third.countSpent('analyze'), 1);
  assert.equal(third.countSpent('propose'), 1);
  assert.equal(remainingLiveBudget(1, third.countSpent('analyze')), 0, 'budget of one is spent');
  assert.equal(remainingLiveBudget(3, third.countSpent('propose')), 2);
  third.release();
});

test('L-REC-3: hostile budgets floor to zero, never to credit', () => {
  for (const seed of [-1, 1.5, Number.NaN, 'many', null, undefined]) {
    assert.equal(remainingLiveBudget(seed, 0), 0, `configured floors: ${String(seed)}`);
  }
  assert.equal(remainingLiveBudget(2, 5), 0, 'over-spend clamps at zero');
  assert.equal(remainingLiveBudget(2, -3), 2, 'hostile spent count ignored');
});

test('L-REC-4: corrupt records fail closed, with or without an approval id', () => {
  const badJson = sub('bad-json.jsonl');
  writeFileSync(badJson, '{"v":1,\n', { encoding: 'utf8', mode: 0o600 });
  assert.throws(() => openSpentRecord(badJson), LiveSpendRecordError);
  assert.throws(
    () => openSpentRecord(badJson, { bootstrapApprovalId: BOOT }),
    (error: unknown) => error instanceof LiveSpendRecordError && error.code === 'LIVE_SPEND_RECORD_CORRUPT',
    'an approval id cannot launder corruption',
  );
  const badShape = sub('bad-shape.jsonl');
  writeFileSync(badShape, '{"v":1,"runId":"","sha256":"zz","kind":"analyze","spentAt":-1,"prev":"x","digest":"y"}\n', { encoding: 'utf8', mode: 0o600 });
  assert.throws(() => openSpentRecord(badShape), LiveSpendRecordError);
  const p = sub('tamper.jsonl');
  const rec = openSpentRecord(p, { bootstrapApprovalId: BOOT });
  rec.record({ runId: 'r-1', sha256: SHA_A, kind: 'analyze', spentAt: 1000 });
  rec.release();
  const tampered = readFileSync(p, 'utf8').replace(SHA_A, SHA_B);
  writeFileSync(p, tampered, 'utf8');
  assert.throws(() => openSpentRecord(p), LiveSpendRecordError, 'edited entry breaks the chain');
});

test('L-REC-5: malformed entries and approval ids are refused, never recorded', () => {
  const rec = openSpentRecord(sub('refuse.jsonl'), { bootstrapApprovalId: BOOT });
  for (const bad of [
    { runId: '', sha256: SHA_A, kind: 'analyze', spentAt: 1 },
    { runId: 'r', sha256: 'short', kind: 'analyze', spentAt: 1 },
    { runId: 'r', sha256: SHA_A, kind: 'analyze', spentAt: -1 },
    { runId: 'r', sha256: SHA_A, kind: 'other', spentAt: 1 },
  ]) {
    assert.throws(
      () => rec.record(bad as { runId: string; sha256: string; kind: 'analyze'; spentAt: number }),
      LiveSpendRecordError,
    );
  }
  assert.equal(rec.countSpent('analyze'), 0, 'refused entries spend nothing');
  rec.release();
  const reopened = openSpentRecord(sub('refuse.jsonl'));
  assert.equal(reopened.countSpent('analyze'), 0);
  reopened.release();
  for (const badId of ['', 'x', '../escape', 'has space', 'a'.repeat(200)]) {
    assert.throws(
      () => openSpentRecord(sub(`bad-id-${badId.length}.jsonl`), { bootstrapApprovalId: badId }),
      LiveSpendRecordError,
      `malformed approval id refused: ${badId.slice(0, 12)}`,
    );
  }
});

test('L-REC-6: no credential names, bodies, or provider text in record or lock', () => {
  const p = sub('hygiene.jsonl');
  const rec = openSpentRecord(p, { bootstrapApprovalId: BOOT });
  rec.record({ runId: 'local-2026-11-02-007', sha256: SHA_A, kind: 'analyze', spentAt: 7000 });
  rec.release();
  for (const file of [p, `${p}.lock`]) {
    let body = '';
    try {
      body = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    assert.ok(!/apikey|api_key|bearer|secret|credential/i.test(body), `${file}: no credential surface`);
  }
  assert.ok(!readFileSync(p, 'utf8').includes('data:video'), 'no media bytes in the record');
  assert.ok(readFileSync(p, 'utf8').includes(SHA_A), 'media identity (hash only) is recorded');
});

test('L-REC-7: exactly one holder owns the record; release hands over cleanly', () => {
  const p = sub('contention.jsonl');
  const first = openSpentRecord(p, { bootstrapApprovalId: BOOT });
  assert.throws(
    () => openSpentRecord(p),
    (error: unknown) => error instanceof LiveSpendRecordError && error.code === 'LIVE_RECORD_LOCKED',
    'a second handle (same process, live PID) is refused',
  );
  first.record({ runId: 'r-1', sha256: SHA_A, kind: 'analyze', spentAt: 1 });
  first.release();
  const second = openSpentRecord(p);
  assert.equal(second.countSpent('analyze'), 1, 'the released record opens with its spend intact');
  second.record({ runId: 'r-2', sha256: SHA_B, kind: 'analyze', spentAt: 2 });
  assert.equal(second.countSpent('analyze'), 2);
  second.release();
});

test('L-REC-8: a stale lock refuses even with an in-chain tip; only supervised recovery resumes', () => {
  const p = sub('stale.jsonl');
  const holder = openSpentRecord(p, { bootstrapApprovalId: BOOT });
  holder.record({ runId: 'r-1', sha256: SHA_A, kind: 'analyze', spentAt: 1 });
  holder.record({ runId: 'r-2', sha256: SHA_B, kind: 'analyze', spentAt: 2 });
  const tipNow = lastDigest(p);
  // Simulate a crashed holder: replace the lock with a dead PID but the
  // current tip (crash after the spend, before release).
  writeFileSync(
    `${p}.lock`,
    JSON.stringify({ pid: DEAD_PID, nonce: 'stale-nonce-00000000', createdAt: 1, tip: tipNow }),
    'utf8',
  );
  const lockBefore = readFileSync(`${p}.lock`, 'utf8');
  assert.throws(
    () => openSpentRecord(p),
    (error: unknown) => error instanceof LiveSpendRecordError && error.code === 'LIVE_RECORD_LOCKED',
    'an in-chain stale tip no longer authorizes a takeover',
  );
  assert.equal(readFileSync(`${p}.lock`, 'utf8'), lockBefore, 'the refused open leaves the lock untouched');
  // The pre-crash holder lost ownership: its sends are now denied.
  assert.throws(() => holder.record({ runId: 'r-x', sha256: SHA_A, kind: 'analyze', spentAt: 9 }), LiveSpendRecordError);
  holder.release();
  // Supervised recovery: the holder is dead, the lock is cleared by hand,
  // and the owner resumes with the spends intact.
  unlinkSync(`${p}.lock`);
  const resumed = openSpentRecord(p);
  assert.equal(resumed.countSpent('analyze'), 2, 'recovery resumes with the recorded spends intact');
  resumed.record({ runId: 'r-3', sha256: SHA_A, kind: 'propose', spentAt: 3 });
  assert.equal(resumed.countSpent('propose'), 1);
  resumed.release();

  // Rollback residual: a record rewound behind a REMOVED lock is locally
  // indistinguishable from an earlier legitimate state — the runtime cannot
  // detect it, so the runbook requires owner reconciliation on any
  // unexpected budget restoration (§4b STOP), never silent trust.
  const q = sub('rollback.jsonl');
  const h2 = openSpentRecord(q, { bootstrapApprovalId: BOOT });
  h2.record({ runId: 'r-1', sha256: SHA_A, kind: 'analyze', spentAt: 1 });
  h2.record({ runId: 'r-2', sha256: SHA_B, kind: 'analyze', spentAt: 2 });
  h2.release();
  const full = readFileSync(q, 'utf8');
  const nonEmpty = full.split('\n').filter((l) => l.trim() !== '');
  const genesisOnly = nonEmpty[0] as string;
  writeFileSync(q, `${genesisOnly}\n`, 'utf8');
  const rewound = openSpentRecord(q);
  assert.equal(rewound.countSpent('analyze'), 0, 'a rewound record presents the earlier budget: the owner must reconcile, never auto-trust');
  rewound.release();
});

test('L-REC-9: unsafe record files refuse: symlink, directory, group-readable, wrong owner, relative path', () => {
  const linkTarget = sub('link-target.jsonl');
  openSpentRecord(linkTarget, { bootstrapApprovalId: BOOT }).release();
  const link = sub('link.jsonl');
  symlinkSync(linkTarget, link);
  assert.throws(() => openSpentRecord(link), LiveSpendRecordError, 'symlink refused');
  const dir = sub('not-a-file');
  mkdirSync(dir);
  assert.throws(() => openSpentRecord(dir), LiveSpendRecordError, 'directory refused');
  const openMode = sub('open-mode.jsonl');
  openSpentRecord(openMode, { bootstrapApprovalId: BOOT }).release();
  chmodSync(openMode, 0o644);
  assert.throws(
    () => openSpentRecord(openMode),
    (error: unknown) => error instanceof LiveSpendRecordError && error.code === 'LIVE_RECORD_UNSAFE',
    'group-readable refused',
  );
  assert.throws(() => openSpentRecord('relative/path.jsonl'), LiveSpendRecordError, 'relative path refused');
  assert.throws(() => openSpentRecord(`${root}/../escape.jsonl`), LiveSpendRecordError, 'non-canonical path refused');
  // Wrong-owner simulation: lie about our own uid in-process, restored after.
  const realGetuid = process.getuid;
  assert.ok(typeof realGetuid === 'function', 'test platform exposes getuid');
  try {
    (process as unknown as { getuid: () => number }).getuid = () => (realGetuid as () => number)() + 100000;
    assert.throws(
      () => openSpentRecord(linkTarget),
      (error: unknown) => error instanceof LiveSpendRecordError && error.code === 'LIVE_RECORD_UNSAFE',
      'foreign-owned file refused',
    );
  } finally {
    process.getuid = realGetuid;
  }
});

test('L-REC-11: continuity table — match authorizes, drift refuses', () => {
  const base = { tip: 't1', analyses: 1, proposals: 0 };
  assert.deepEqual(checkSnapshotContinuity(base, { ...base }), { ok: true });
  assert.deepEqual(
    checkSnapshotContinuity(base, { ...base, analyses: 2 }),
    { ok: false, code: 'LIVE_SPEND_RECORD_FAILED' },
    'count drift under the lock fails closed',
  );
  assert.deepEqual(
    checkSnapshotContinuity(base, { tip: 't2', analyses: 1, proposals: 0 }),
    { ok: false, code: 'LIVE_SPEND_RECORD_FAILED' },
    'tip drift under the lock fails closed',
  );
  assert.deepEqual(
    checkSnapshotContinuity(base, { ...base, proposals: 1 }),
    { ok: false, code: 'LIVE_SPEND_RECORD_FAILED' },
    'proposal drift under the lock fails closed',
  );
});

test('L-REC-12: genesis rules — spend-only, duplicate, and misplaced genesis refuse', () => {
  // Independent reimplementation of the chain digest format pins it:
  // sha256(`${prev}\\n${body}`), body `genesis\\n<id>\\n<ts>` or
  // `spend\\n<runId>\\n<sha>\\n<kind>\\n<ts>`, first prev GENESIS-PREV.
  const GENESIS_PREV = 'GENESIS-LIVE-SPEND-RECORD-v1';
  const digestOf = (prev: string, body: string): string =>
    createHash('sha256').update(`${prev}\n${body}`, 'utf8').digest('hex');
  const spendLine = (prev: string, runId: string): string => {
    const body = `spend\n${runId}\n${SHA_A}\nanalyze\n1000`;
    return JSON.stringify({ v: 1, entry: 'spend', runId, sha256: SHA_A, kind: 'analyze', spentAt: 1000, prev, digest: digestOf(prev, body) });
  };
  const genesisLine = (prev: string, id: string, ts: number): string => {
    const body = `genesis\n${id}\n${ts}`;
    return JSON.stringify({ v: 1, entry: 'genesis', approvalId: id, createdAt: ts, prev, digest: digestOf(prev, body) });
  };
  // Spend-only chain with otherwise valid hashes: no genesis, no authority.
  const spendOnly = sub('spend-only.jsonl');
  writeFileSync(spendOnly, `${spendLine(GENESIS_PREV, 'r-1')}\n`, { encoding: 'utf8', mode: 0o600 });
  assert.throws(
    () => openSpentRecord(spendOnly),
    (error: unknown) => error instanceof LiveSpendRecordError && error.code === 'LIVE_SPEND_RECORD_CORRUPT',
    'a spend without a prior approval genesis can never authorize',
  );
  // Duplicate genesis: second approval line after a valid opening.
  const dupe = sub('dupe-genesis.jsonl');
  const g1 = JSON.parse(genesisLine(GENESIS_PREV, BOOT, 1000)) as { digest: string };
  writeFileSync(
    dupe,
    `${genesisLine(GENESIS_PREV, BOOT, 1000)}\n${genesisLine(g1.digest, BOOT, 2000)}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
  assert.throws(
    () => openSpentRecord(dupe),
    (error: unknown) => error instanceof LiveSpendRecordError && error.code === 'LIVE_SPEND_RECORD_CORRUPT',
    'exactly one genesis is allowed',
  );
  // Genesis not first: a spend line precedes the approval.
  const late = sub('late-genesis.jsonl');
  const s1 = JSON.parse(spendLine(GENESIS_PREV, 'r-1')) as { digest: string };
  writeFileSync(
    late,
    `${spendLine(GENESIS_PREV, 'r-1')}\n${genesisLine(s1.digest, BOOT, 2000)}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
  assert.throws(
    () => openSpentRecord(late),
    (error: unknown) => error instanceof LiveSpendRecordError && error.code === 'LIVE_SPEND_RECORD_CORRUPT',
    'a genesis after spends cannot retroactively approve them',
  );
});

test('L-REC-13: initialization, restart, and the first spend preserve the approval identity', () => {
  const p = sub('identity.jsonl');
  const id = 'd9i1-test-bootstrap-identity';
  const first = openSpentRecord(p, { bootstrapApprovalId: id });
  first.release();
  const lines = (): Array<Record<string, unknown>> =>
    readFileSync(p, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l !== '')
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  assert.equal(lines().length, 1, 'bootstrap writes exactly the genesis');
  assert.equal(lines()[0]?.['entry'], 'genesis');
  assert.equal(lines()[0]?.['approvalId'], id, 'genesis binds the owner approval');
  const second = openSpentRecord(p);
  second.record({ runId: 'r-1', sha256: SHA_A, kind: 'analyze', spentAt: 1000 });
  second.release();
  const reopened = openSpentRecord(p);
  assert.equal(reopened.countSpent('analyze'), 1);
  reopened.release();
  const after = lines();
  assert.equal(after.length, 2, 'one spend appended after the genesis');
  assert.equal(after[0]?.['entry'], 'genesis');
  assert.equal(after[0]?.['approvalId'], id, 'restart and spend preserve the approval identity');
  assert.equal(after[1]?.['entry'], 'spend');
  assert.equal(after[1]?.['prev'], after[0]?.['digest'], 'the spend chains from the approved genesis');
});

const RACER = path.resolve(import.meta.dirname, '../helpers/record-racer.ts');

interface RacerOutcome {
  code: number | null;
}

function runRacer(args: string[]): Promise<RacerOutcome> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [RACER, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`racer timed out: ${args.join(' ')} stderr=${stderr}`));
    }, 30000);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code });
    });
  });
}

function readOutcomes(resultPath: string): string[] {
  return readFileSync(resultPath, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l !== '');
}

// MAJOR-1: N real OS processes race open()+spend on one record. Mutual
// exclusion makes exactly one winner in every interleaving (the hold window
// dwarfs spawn skew, and losers fail closed instead of retrying): exactly
// one spend lands, the chain stays valid, every loser reports LOCKED.
test('L-REC-14: concurrent processes share one authorization at most', async () => {
  const p = sub('race-spend.jsonl');
  const results = sub('race-spend.out');
  writeFileSync(results, '', 'utf8');
  const bootstrap = openSpentRecord(p, { bootstrapApprovalId: BOOT });
  bootstrap.release();
  const racers = Array.from({ length: 5 }, (_, i) =>
    runRacer([p, results, 'hold-spend', `race-spend-${i}`]),
  );
  const outcomes = await Promise.all(racers);
  assert.ok(outcomes.every((o) => o.code === 0 || o.code === 2), 'no racer crashes');
  const lines = readOutcomes(results);
  assert.equal(lines.filter((l) => l.endsWith(' ok')).length, 1, 'exactly one process wins authorization');
  assert.equal(
    lines.filter((l) => l.includes('LIVE_RECORD_LOCKED')).length,
    4,
    'every loser fails closed on contention, never on corruption',
  );
  const reopened = openSpentRecord(p);
  assert.equal(reopened.countSpent('analyze'), 1, 'exactly one spend is recorded');
  reopened.release();
  const stored = readFileSync(p, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l !== '');
  assert.equal(stored.length, 2, 'genesis plus exactly one spend: no forked chain');
});

// MAJOR-1 no-takeover policy: an abandon step leaves a genuine stale lock,
// then N processes race the former check-then-unlink setup — every contender
// inspects the same dead holder. With no unlink path, all refuse
// LIVE_RECORD_LOCKED, the lock file is byte-identical afterwards (no process
// can ever replace another's lock), and the chain is unchanged. Refusal does
// not depend on timing, so this holds in every interleaving.
test('L-REC-15: stale locks refuse every contender; no lock replacement', async () => {
  const p = sub('race-stale.jsonl');
  const results = sub('race-stale.out');
  writeFileSync(results, '', 'utf8');
  const bootstrap = openSpentRecord(p, { bootstrapApprovalId: BOOT });
  bootstrap.record({ runId: 'prior-1', sha256: SHA_A, kind: 'analyze', spentAt: 1 });
  bootstrap.release();
  const abandon = await runRacer([p, results, 'abandon']);
  assert.equal(abandon.code, 0, 'abandon step opens then exits without release');
  const lockPath = `${p}.lock`;
  const lockBefore = readFileSync(lockPath, 'utf8');
  const racers = Array.from({ length: 4 }, (_, i) =>
    runRacer([p, results, 'hold-spend', `race-stale-${i}`]),
  );
  const outcomes = await Promise.all(racers);
  assert.ok(outcomes.every((o) => o.code === 0 || o.code === 2), 'no racer crashes');
  const lines = readOutcomes(results);
  assert.equal(lines.filter((l) => l.endsWith(' ok')).length, 0, 'no contender takes over a stale lock');
  assert.equal(
    lines.filter((l) => l.includes('LIVE_RECORD_LOCKED')).length,
    4,
    'every contender fails closed on contention, never on corruption',
  );
  assert.equal(
    readFileSync(lockPath, 'utf8'),
    lockBefore,
    'the stale lock is byte-identical: refused opens never modify it',
  );
  unlinkSync(lockPath);
  const reopened = openSpentRecord(p);
  assert.equal(reopened.countSpent('analyze'), 1, 'the prior spend is untouched: no contender spent');
  reopened.release();
});

// MAJOR-1 supervised recovery: a stale lock refuses even a bootstrap-attested
// open (no approval can launder a held lock), and the legitimate owner
// resumes only by following the documented recovery workflow — verify the
// holder is dead, confirm no companion runs, clear the lock by hand, reopen.
// The chain, the prior spend, and the approval identity all survive.
test('L-REC-17: a stale lock refuses without sending; the owner resumes only via supervised recovery', async () => {
  const p = sub('recover.jsonl');
  const results = sub('recover.out');
  writeFileSync(results, '', 'utf8');
  const id = 'd9i1-test-recovery-identity';
  const first = openSpentRecord(p, { bootstrapApprovalId: id });
  first.record({ runId: 'r-0', sha256: SHA_A, kind: 'analyze', spentAt: 1 });
  first.release();
  const abandon = await runRacer([p, results, 'abandon']);
  assert.equal(abandon.code, 0, 'abandon step leaves a genuine stale lock');
  const lockPath = `${p}.lock`;
  const lockBefore = readFileSync(lockPath, 'utf8');
  for (const opts of [{}, { bootstrapApprovalId: id }]) {
    assert.throws(
      () => openSpentRecord(p, opts),
      (error: unknown) => error instanceof LiveSpendRecordError && error.code === 'LIVE_RECORD_LOCKED',
      'a held lock refuses with or without a bootstrap approval',
    );
  }
  assert.equal(
    readFileSync(lockPath, 'utf8'),
    lockBefore,
    'refused opens never modify the lock',
  );
  const holder = JSON.parse(lockBefore) as { pid: number };
  assert.throws(
    () => process.kill(holder.pid, 0),
    (error: unknown) => (error as NodeJS.ErrnoException).code === 'ESRCH',
    'supervised step 1: the holder is dead before the lock is touched',
  );
  unlinkSync(lockPath);
  const resumed = openSpentRecord(p);
  assert.equal(resumed.countSpent('analyze'), 1, 'prior spend survives recovery: no re-arm, no loss');
  resumed.record({ runId: 'r-1', sha256: SHA_A, kind: 'analyze', spentAt: 2 });
  resumed.release();
  const stored = readFileSync(p, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l !== '')
    .map((l) => JSON.parse(l) as { entry: string; approvalId?: string });
  assert.equal(stored.length, 3, 'genesis plus exactly two spends');
  assert.equal(stored[0]?.approvalId, id, 'recovery preserves the approval identity');
});

// MAJOR-2 concurrent bootstrap: N processes initialize one missing record.
// Exclusive file creation plus lock contention elect exactly one genesis.
test('L-REC-16: concurrent bootstraps yield exactly one approval genesis', async () => {
  const p = sub('race-init.jsonl');
  const results = sub('race-init.out');
  writeFileSync(results, '', 'utf8');
  const racers = Array.from({ length: 4 }, (_, i) =>
    runRacer([p, results, 'hold-open', `race-init-${i}`, `d9i1-race-init-${i}`]),
  );
  const outcomes = await Promise.all(racers);
  assert.ok(outcomes.every((o) => o.code === 0 || o.code === 2), 'no racer crashes');
  const lines = readOutcomes(results);
  assert.equal(lines.filter((l) => l.endsWith(' ok')).length, 1, 'exactly one initializer wins');
  const stored = readFileSync(p, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l !== '')
    .map((l) => JSON.parse(l) as { entry: string; approvalId?: string });
  assert.equal(stored.length, 1, 'exactly one genesis line, no duplication');
  assert.equal(stored[0]?.entry, 'genesis');
  assert.match(stored[0]?.approvalId ?? '', /^d9i1-race-init-[0-3]$/, 'genesis binds one of the supplied approvals');
  const reopened = openSpentRecord(p);
  assert.equal(reopened.countSpent('analyze'), 0);
  reopened.release();
});

test('L-REC-10: empty file is ambiguous with truncation: refused without approval, initialized with it', () => {
  const p = sub('empty.jsonl');
  writeFileSync(p, '', 'utf8');
  chmodSync(p, 0o600);
  assert.throws(
    () => openSpentRecord(p),
    (error: unknown) => error instanceof LiveSpendRecordError && error.code === 'LIVE_SPEND_RECORD_MISSING',
    'empty without attestation refuses',
  );
  const rec = openSpentRecord(p, { bootstrapApprovalId: BOOT });
  assert.equal(rec.countSpent('analyze'), 0);
  rec.release();
});
