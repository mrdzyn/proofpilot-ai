// UI-C3-02-D9-I1/I15: durable spent-run record with exclusive ownership.
// A restart — or a second process — must never recreate spent
// authorization: missing/empty records initialize only with an explicit
// owner bootstrap approval, exactly one holder owns the record at a time,
// rollback is detected via the lock tip, and unsafe files refuse.
// Injected temp paths only; no credentials anywhere.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, symlinkSync, mkdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
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

test('L-REC-8: stale lock with an in-chain tip is taken over; a foreign tip proves rollback', () => {
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
  const successor = openSpentRecord(p);
  assert.equal(successor.countSpent('analyze'), 2, 'takeover sees the recorded spends');
  successor.record({ runId: 'r-3', sha256: SHA_A, kind: 'propose', spentAt: 3 });
  assert.equal(successor.countSpent('propose'), 1);
  successor.release();
  // The pre-crash holder lost ownership: its sends are now denied.
  assert.throws(() => holder.record({ runId: 'r-x', sha256: SHA_A, kind: 'analyze', spentAt: 9 }), LiveSpendRecordError);
  holder.release();

  // Rollback: the record is rewound behind the stale lock tip.
  const q = sub('rollback.jsonl');
  const h2 = openSpentRecord(q, { bootstrapApprovalId: BOOT });
  h2.record({ runId: 'r-1', sha256: SHA_A, kind: 'analyze', spentAt: 1 });
  h2.record({ runId: 'r-2', sha256: SHA_B, kind: 'analyze', spentAt: 2 });
  h2.release();
  const full = readFileSync(q, 'utf8');
  const nonEmpty = full.split('\n').filter((l) => l.trim() !== '');
  const genesisOnly = nonEmpty[0] as string;
  writeFileSync(q, `${genesisOnly}\n`, 'utf8');
  // Reconstruct the true tip: it is the digest of the second spend line.
  const secondLine = JSON.parse(nonEmpty[1] as string) as { digest: string };
  writeFileSync(
    `${q}.lock`,
    JSON.stringify({ pid: DEAD_PID, nonce: 'stale-nonce-00000001', createdAt: 1, tip: secondLine.digest }),
    { encoding: 'utf8', mode: 0o600 },
  );
  assert.throws(
    () => openSpentRecord(q),
    (error: unknown) => error instanceof LiveSpendRecordError && error.code === 'LIVE_SPEND_RECORD_ROLLBACK',
    'a record rewound behind the surviving lock tip refuses to re-arm',
  );
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
