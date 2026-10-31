// UI-C3-01B: dashboard evidence-import validation. Synthetic fixtures only,
// plus the committed example (read, never modified). No provider, no browser,
// no stored-artifact access. T-IMPORT-REAL / T-IMPORT-FAKE / T-IMPORT-FORGED-EXAMPLE.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  importBaselineSummary,
  importEvidence,
  importScoreboard,
  MAX_FILE_CHARS,
} from '../../packages/dashboard-import/src/validate.ts';
import { DashboardImportError, type ScoreboardView } from '../../packages/dashboard-import/src/types.ts';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const examplePath = path.join(repoRoot, 'docs/examples/c3-b1-scoreboard.example.json');
const exampleText = readFileSync(examplePath, 'utf8');

const codeOf = (fn: () => unknown): string => {
  try {
    fn();
    return 'NO_ERROR';
  } catch (e) {
    return e instanceof DashboardImportError ? e.code : `OTHER:${(e as Error).message}`;
  }
};

const minimalReplay = {
  n: 1,
  outcome: 'ORACLE_PASS',
  failureCode: null,
  failureMessage: null,
  oracleExitCode: 0,
  evidenceDir: 'PC-1/replay-1',
  recordSha256: 'a'.repeat(64),
  candidateCssSha256: 'b'.repeat(64),
  nonce: 'c'.repeat(24),
  mobile: { status: 'passed', hitTestTarget: 'add-to-cart', cartCountAfter: '1' },
  desktop: { status: 'passed', hitTestTarget: 'add-to-cart', cartCountAfter: '1' },
  servedCssSha256: ['d'.repeat(64)],
  evidenceFinalized: true,
  evidenceProblems: [],
};

const minimalCandidate = {
  id: 'PC-1',
  description: 'hand-authored correct fix',
  provenance: 'hand-authored-control',
  candidateId: 'e'.repeat(64),
  adjustments: [{ selector: '.promo-overlay', property: 'pointer-events', value: 'none' }],
  renderedCss: '.promo-overlay{pointer-events:none}',
  fault: null,
  replaysRequired: 3,
  replaysAttempted: 3,
  replaysPassed: 3,
  status: 'VERIFIED',
  reason: null,
  expected: 'VERIFIED',
  expectationMet: true,
  expectationProblems: [],
  replays: [minimalReplay, { ...minimalReplay, n: 2 }, { ...minimalReplay, n: 3 }],
};

const minimalScoreboard = {
  schemaVersion: 1,
  label: 'HAND-AUTHORED CONTROLS ONLY — NO MODEL INPUT',
  complete: true,
  approvedSha: 'f'.repeat(40),
  createdAt: '2026-10-28T08:45:41.462Z',
  modelOrProviderCalls: 0,
  modalCalls: 0,
  baseline: { reproduced: true, reasons: [], replay: minimalReplay },
  candidates: [minimalCandidate],
  nc5: { description: 'x', baselineReproduced: false, status: 'NOT_REPRODUCED', neverVerified: true },
  notes: ['n/a'],
};

const minimalBaseline = {
  runId: 'f01-baseline-20261028T000000Z-000000',
  oracleExitCode: 1,
  classification: { verdict: 'REPRODUCED', regression: 'PASS', interceptedBy: 'promo-overlay', reasons: [] },
  gitHead: 'f'.repeat(40),
  fixtureTree: '0'.repeat(40),
  worktreeDirty: false,
  worktree: { kind: 'clean' },
  certified: true,
  certificationReasons: [],
  artifacts: [{ relativePath: 'baseline-summary.json', sha256: 'a'.repeat(64), bytes: 12 }],
};

const doc = (v: unknown): string => JSON.stringify(v);

test('T-IMPORT-REAL: the committed example imports with its real verdicts, tagged owner-imported', () => {
  const view = importScoreboard(exampleText);
  assert.equal(view.kind, 'scoreboard');
  assert.equal(view.baselineReproduced, true);
  assert.equal(view.rows.length, 6);
  const pc1 = (view as ScoreboardView).rows.find((r) => r.id === 'PC-1');
  assert.ok(pc1);
  assert.equal(pc1.status, 'VERIFIED');
  assert.deepEqual([pc1.replaysPassed, pc1.replaysAttempted], [3, 3]);
  // Picked bytes never reproduce the bundled "committed example" rendering.
  assert.equal(view.sourceTag, 'owner-imported evidence');
});

test('T-IMPORT-REAL: producer-shaped baseline fixture imports', () => {
  const view = importBaselineSummary(doc(minimalBaseline));
  assert.equal(view.kind, 'baseline');
  assert.equal(view.verdict, 'REPRODUCED');
  assert.equal(view.certified, true);
  assert.equal(view.sourceTag, 'owner-imported evidence');
});

test('T-IMPORT-REAL: importEvidence dispatches scoreboard vs baseline by shape', () => {
  assert.equal(importEvidence(doc(minimalScoreboard)).kind, 'scoreboard');
  assert.equal(importEvidence(doc(minimalBaseline)).kind, 'baseline');
});

test('T-IMPORT-FAKE: crafted hand-authored VERIFIED row stays an unverified owner import', () => {
  const view = importScoreboard(doc(minimalScoreboard));
  assert.equal(view.sourceTag, 'owner-imported evidence');
  assert.equal(view.rows[0]?.status, 'VERIFIED');
  // The view-model carries no independence claim: no trusted chip flag exists.
  assert.deepEqual(Object.keys(view).sort(), [
    'approvedSha',
    'baselineReproduced',
    'claimsExampleNote',
    'createdAt',
    'kind',
    'label',
    'rows',
    'sourceTag',
  ]);
});

test('T-IMPORT-FAKE: forged certified:true baseline stays an unverified owner import', () => {
  const view = importBaselineSummary(doc({ ...minimalBaseline, certified: true }));
  assert.equal(view.certified, true);
  assert.equal(view.sourceTag, 'owner-imported evidence');
});

test('T-IMPORT-FORGED-EXAMPLE: _example on a picked file never confers committed-example status', () => {
  const forged = { ...minimalScoreboard, _example: 'Real scoreboard from a real run' };
  const view = importScoreboard(doc(forged));
  assert.equal(view.sourceTag, 'owner-imported evidence');
  assert.equal(view.claimsExampleNote, true);
});

test('refusals: empty, oversize, malformed, trailing, duplicate key, over-depth', () => {
  assert.equal(codeOf(() => importScoreboard('')), 'EMPTY');
  assert.equal(codeOf(() => importScoreboard('x'.repeat(MAX_FILE_CHARS + 1))), 'TOO_LARGE');
  assert.equal(codeOf(() => importScoreboard('{oops')), 'MALFORMED_JSON');
  assert.equal(codeOf(() => importScoreboard('{} x')), 'MALFORMED_JSON');
  assert.equal(codeOf(() => importScoreboard('{"a":1,"a":2}')), 'DUPLICATE_KEY');
  let deep: unknown = 0;
  for (let i = 0; i < 10; i++) deep = [deep];
  assert.equal(codeOf(() => importScoreboard(doc(deep))), 'TOO_DEEP');
  assert.equal(codeOf(() => importScoreboard(doc({ ...minimalScoreboard, notes: ['x'.repeat(5000)] }))), 'STRING_TOO_LONG');
  assert.equal(codeOf(() => importScoreboard(doc({ ...minimalScoreboard, candidates: new Array(65).fill(minimalCandidate) }))), 'TOO_MANY_ITEMS');
});

test('refusals: unknown keys, bad types, bad enums, bad sha, bad schemaVersion', () => {
  assert.equal(codeOf(() => importScoreboard(doc({ ...minimalScoreboard, stowaway: 1 }))), 'BAD_SHAPE');
  assert.equal(codeOf(() => importScoreboard(doc({ ...minimalScoreboard, complete: 'yes' }))), 'BAD_SHAPE');
  assert.equal(codeOf(() => importScoreboard(doc({ ...minimalScoreboard, approvedSha: 'xyz' }))), 'BAD_SHAPE');
  assert.equal(codeOf(() => importScoreboard(doc({ ...minimalScoreboard, schemaVersion: 2 }))), 'BAD_SHAPE');
  assert.equal(
    codeOf(() => importScoreboard(doc({ ...minimalScoreboard, candidates: [{ ...minimalCandidate, status: 'VERIFIED*' }] }))),
    'BAD_SHAPE',
  );
  const badReplay = { ...minimalReplay, mobile: { status: 'passed' } };
  assert.equal(
    codeOf(() => importScoreboard(doc({ ...minimalScoreboard, candidates: [{ ...minimalCandidate, replays: [badReplay] }] }))),
    'BAD_SHAPE',
  );
  assert.equal(codeOf(() => importScoreboard(doc({ ...minimalScoreboard, baseline: { reproduced: true } }))), 'BAD_SHAPE');
  assert.equal(
    codeOf(() => importBaselineSummary(doc({ ...minimalBaseline, artifacts: [{ path: 'x', sha256: 'y' }] }))),
    'BAD_SHAPE',
  );
  assert.equal(codeOf(() => importBaselineSummary(doc({ ...minimalBaseline, worktree: { kind: 'maybe' } }))), 'BAD_SHAPE');
  assert.equal(
    codeOf(() => importBaselineSummary(doc({ ...minimalBaseline, classification: { ...minimalBaseline.classification, verdict: 'FIXED' } }))),
    'BAD_SHAPE',
  );
});
