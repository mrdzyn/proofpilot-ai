// UI-C3-02-D9-I1: durable spent-run record batteries. A restart must never
// recreate spent authorization: every authorized send is hash-chained to
// disk, the effective budget subtracts recorded spend, and corrupt state
// fails closed. Injected temp paths only; no credentials anywhere.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
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

test('L-REC-1: missing file is created empty; counts start at zero', () => {
  const rec = openSpentRecord(sub('fresh.jsonl'));
  assert.equal(rec.countSpent('analyze'), 0);
  assert.equal(rec.countSpent('propose'), 0);
  const mode = readFileSync(sub('fresh.jsonl'), { encoding: 'utf8' });
  assert.equal(mode, '', 'created file starts empty');
});

test('L-REC-2: recorded sends survive a reopen; budgets subtract recorded spend', () => {
  const p = sub('roundtrip.jsonl');
  const first = openSpentRecord(p);
  first.record({ runId: 'local-2026-11-02-001', sha256: SHA_A, kind: 'analyze', spentAt: 1000 });
  assert.equal(first.countSpent('analyze'), 1);
  const second = openSpentRecord(p);
  assert.equal(second.countSpent('analyze'), 1, 'a restart-equivalent reopen sees the spent attempt');
  assert.equal(second.countSpent('propose'), 0);
  second.record({ runId: 'local-2026-11-02-002', sha256: SHA_B, kind: 'propose', spentAt: 2000 });
  const third = openSpentRecord(p);
  assert.equal(third.countSpent('analyze'), 1);
  assert.equal(third.countSpent('propose'), 1);
  assert.equal(remainingLiveBudget(1, third.countSpent('analyze')), 0, 'budget of one is spent');
  assert.equal(remainingLiveBudget(3, third.countSpent('propose')), 2);
});

test('L-REC-3: hostile budgets floor to zero, never to credit', () => {
  for (const seed of [-1, 1.5, Number.NaN, 'many', null, undefined]) {
    assert.equal(remainingLiveBudget(seed, 0), 0, `configured floors: ${String(seed)}`);
  }
  assert.equal(remainingLiveBudget(2, 5), 0, 'over-spend clamps at zero');
  assert.equal(remainingLiveBudget(2, -3), 2, 'hostile spent count ignored');
});

test('L-REC-4: corrupt records fail closed', () => {
  const badJson = sub('bad-json.jsonl');
  writeFileSync(badJson, '{"v":1,\n', 'utf8');
  assert.throws(() => openSpentRecord(badJson), LiveSpendRecordError);
  const badShape = sub('bad-shape.jsonl');
  writeFileSync(badShape, '{"v":1,"runId":"","sha256":"zz","kind":"analyze","spentAt":-1,"prev":"x","digest":"y"}\n', 'utf8');
  assert.throws(() => openSpentRecord(badShape), LiveSpendRecordError);
  const p = sub('tamper.jsonl');
  const rec = openSpentRecord(p);
  rec.record({ runId: 'r-1', sha256: SHA_A, kind: 'analyze', spentAt: 1000 });
  const tampered = readFileSync(p, 'utf8').replace(SHA_A, SHA_B);
  writeFileSync(p, tampered, 'utf8');
  assert.throws(() => openSpentRecord(p), LiveSpendRecordError, 'edited entry breaks the chain');
  const truncated = sub('truncated.jsonl');
  writeFileSync(truncated, '', 'utf8');
  assert.doesNotThrow(() => openSpentRecord(truncated), 'empty file is a valid empty record');
});

test('L-REC-5: malformed entries are refused, never recorded', () => {
  const rec = openSpentRecord(sub('refuse.jsonl'));
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
  const reopened = openSpentRecord(sub('refuse.jsonl'));
  assert.equal(reopened.countSpent('analyze'), 0);
});

test('L-REC-6: no credential names, bodies, or provider text in the record format', () => {
  const p = sub('hygiene.jsonl');
  const rec = openSpentRecord(p);
  rec.record({ runId: 'local-2026-11-02-007', sha256: SHA_A, kind: 'analyze', spentAt: 7000 });
  const body = readFileSync(p, 'utf8');
  assert.ok(!/apikey|api_key|bearer|secret|credential/i.test(body), 'no credential surface in the record');
  assert.ok(!body.includes('data:video'), 'no media bytes in the record');
  assert.ok(body.includes(SHA_A), 'media identity (hash only) is recorded');
});
