// C3-B2B E1 registration bridge with SYNTHETIC triples only: no artifact, no browser,
// no network, no provider. Proves the data-only bridge, the identity isolation between a
// stored model proposal and the hand-authored PC-1 control, and the scoreboard integration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assertRegisteredModelProposal,
  candidateIdOf,
  MODEL_BOARD_LABEL,
  ModelProposalError,
  modelProposalEntryOf,
  modelProposalIdOf,
  modelProposalTagOf,
  modelRowProblems,
  nc5Of,
  registerModelProposal,
  renderCssAdjustments,
  runOfflineVerification,
  SCOREBOARD_FILE,
  verifyScoreboard,
  type Control,
  type CssAdjustment,
  type ModelProposalEntry,
  type ModelProposalInput,
  type Runner,
} from '../../packages/core/src/index.ts';

const SHA = 'a'.repeat(40);
const SRC = 'b'.repeat(40);
const H1 = 'c'.repeat(64);
const H2 = 'd'.repeat(64);
const PC1: CssAdjustment[] = [{ selector: '.promo-overlay', property: 'pointer-events', value: 'none' }];
const CSS = renderCssAdjustments(PC1);
const RUN = 'c3-live-meta-001';

const baseInput = (): ModelProposalInput => ({
  triples: PC1.map((a) => ({ ...a })),
  renderedCss: CSS,
  runId: RUN,
  approvedSha: SHA,
  sourceSha: SRC,
  inputSha256: H1,
  artifactSha256: H2,
});

const throwsCode = (mut: (i: ModelProposalInput) => void, code: string, name: string) => {
  const input = baseInput();
  mut(input);
  assert.throws(() => registerModelProposal(input), (e: unknown) => e instanceof ModelProposalError && e.code === code, name);
};

// ------------------------------------------------------------ registration

test('E1 registers PC-1-identical synthetic triples with frozen provenance-tagged output', () => {
  const reg = registerModelProposal(baseInput());
  assert.equal(reg.kind, 'model-proposal');
  assert.equal(reg.runId, RUN);
  assert.equal(reg.approvedSha, SHA);
  assert.equal(reg.sourceSha, SRC);
  assert.equal(reg.inputSha256, H1);
  assert.equal(reg.artifactSha256, H2);
  assert.deepEqual([...reg.adjustments], PC1);
  assert.equal(reg.renderedCss, CSS);
  assert.equal(reg.candidateId, modelProposalIdOf(SHA, RUN, CSS));
  assert.ok(Object.isFrozen(reg) && Object.isFrozen(reg.adjustments) && Object.isFrozen(reg.adjustments[0]), 'deeply frozen');

  const row = modelProposalEntryOf(reg);
  assert.equal(
    row.description,
    `Stored model proposal ${RUN}: 1 adjustment(s), registered for isolated verification; never run, never verified`,
    'description is the canonical producer text (the verifier requires it byte-identical)',
  );
  assert.equal(
    row.note,
    'E1 registration only: no replay has run and this row claims no verdict.',
    'note is the canonical producer text',
  );
  assert.equal(row.id, `MODEL-${RUN}`);
  assert.equal(row.provenance, 'model-proposal');
  assert.equal(row.candidateId, reg.candidateId);
  assert.equal(row.approvedSha, SHA);
  assert.equal(row.sourceProvenance, 'operator-reported');
  assert.deepEqual(row.replays, []);
  assert.deepEqual(modelRowProblems(row, SHA), [], 'the canonical row verifies clean');
});

test('E1 identity: identical CSS gets separate ids across provenances; hand-authored ids are unchanged', () => {
  const reg = registerModelProposal(baseInput());
  const handId = candidateIdOf(SHA, CSS);
  assert.notEqual(reg.candidateId, handId, 'the proposal never shares PC-1 identity');
  assert.equal(handId, createHash('sha256').update(`${SHA}\n${CSS}`, 'utf8').digest('hex'), 'two-arg ids are byte-identical to before');
  assert.equal(modelProposalIdOf(SHA, RUN, CSS), candidateIdOf(SHA, CSS, modelProposalTagOf(RUN)), 'single identity function');
  assert.equal(modelProposalTagOf(RUN), `model-proposal:${RUN}`);
  assert.notEqual(modelProposalIdOf(SHA, RUN, CSS), modelProposalIdOf(SHA, 'other-run-1', CSS), 'run id participates in identity');
});

test('E1 refuses every malformed bridge input fail-closed', () => {
  throwsCode((i) => { i.triples = { selector: '.promo-overlay', property: 'pointer-events', value: 'none' }; }, 'NOT_A_LIST', 'triples not a list');
  throwsCode((i) => { i.triples = []; }, 'EMPTY', 'no adjustments');
  throwsCode((i) => { i.triples = Array.from({ length: 5 }, () => ({ ...PC1[0]! })); }, 'TOO_MANY', 'over the policy maximum');
  throwsCode((i) => { (i.triples as unknown[])[0] = null; }, 'NOT_PLAIN_OBJECT', 'null triple');
  throwsCode((i) => { (i.triples as unknown[])[0] = Object.assign(Object.create({ smuggled: 1 }), PC1[0]); }, 'NOT_PLAIN_OBJECT', 'non-plain triple');
  throwsCode((i) => { (i.triples as Record<string, unknown>[])[0] = { ...PC1[0], extra: 'x' }; }, 'BAD_SHAPE', 'extra triple key');
  throwsCode((i) => { (i.triples as Record<string, unknown>[])[0] = { selector: '.promo-overlay', property: 'pointer-events' }; }, 'BAD_SHAPE', 'missing triple key');
  throwsCode((i) => { (i.triples as Record<string, unknown>[])[0] = { ...PC1[0], value: 0 }; }, 'BAD_TYPE', 'non-string triple field');
  throwsCode((i) => { (i.triples as Record<string, unknown>[])[0] = { ...PC1[0], selector: '.evil' }; }, 'UNKNOWN_SELECTOR', 'out-of-grammar selector');
  throwsCode((i) => { (i.triples as Record<string, unknown>[])[0] = { ...PC1[0], value: 'hidden!' }; }, 'VALUE_NOT_ALLOWED', 'out-of-grammar value');
  throwsCode((i) => { i.triples = [{ ...PC1[0] }, { ...PC1[0] }]; }, 'DUPLICATE_PAIR', 'duplicate pair');
  throwsCode((i) => { i.renderedCss = '.promo-overlay{pointer-events:none}'; }, 'RENDER_MISMATCH', 'tampered rendered CSS');
  throwsCode((i) => { i.renderedCss = 42; }, 'RENDER_MISMATCH', 'non-string rendered CSS');
  throwsCode((i) => { i.runId = ''; }, 'BAD_RUN_ID', 'empty run id');
  throwsCode((i) => { i.runId = 'run\nid'; }, 'BAD_RUN_ID', 'run id outside the grammar');
  throwsCode((i) => { i.sourceSha = 'ABC'; }, 'BAD_SHA', 'short source SHA');
  throwsCode((i) => { i.sourceSha = SRC.toUpperCase(); }, 'BAD_SHA', 'non-lowercase source SHA');
  throwsCode((i) => { i.inputSha256 = H1.slice(0, 63); }, 'BAD_SHA', 'short input hash');
  throwsCode((i) => { i.artifactSha256 = null; }, 'BAD_SHA', 'null artifact hash');
  throwsCode((i) => { i.approvedSha = 'abc'; }, 'BAD_APPROVED_SHA', 'malformed verification revision');
});

// ------------------------------------------------------------ identity isolation

test('E1 isolation: copies and lookalikes are refused; only the registered object passes', () => {
  const reg = registerModelProposal(baseInput());
  assert.doesNotThrow(() => assertRegisteredModelProposal(reg));
  assert.throws(() => assertRegisteredModelProposal({ ...reg }), (e: unknown) => e instanceof ModelProposalError && e.code === 'NOT_REGISTERED', 'spread copy refused');
  assert.throws(() => assertRegisteredModelProposal(JSON.parse(JSON.stringify(reg))), /NOT_REGISTERED/, 'serialized clone refused');
  assert.throws(() => modelProposalEntryOf({ ...reg }), /NOT_REGISTERED/, 'no row for a copy');
});

test('E1 isolation: the hand-authored execution path refuses a registered proposal without running it', async () => {
  const reg = registerModelProposal(baseInput());
  let calls = 0;
  const runner: Runner = (async () => {
    calls++;
    throw new Error('must never run');
  }) as Runner;
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pp-e1-'));
  await assert.rejects(
    runOfflineVerification({
      repoRoot: dir,
      approvedSha: SHA,
      outDir: path.join(dir, 'out'),
      lockPath: path.join(dir, 'stage.lock'),
      coordinatorLockPath: path.join(dir, 'coord.lock'),
      controls: [reg as unknown as Control],
      runner,
    }),
    /not one of the in-code hand-authored/,
  );
  assert.equal(calls, 0, 'the runner was never invoked');
});

// ------------------------------------------------------------ scoreboard rows

test('E1 rows: the verifier accepts the truthful row and refuses each tamper', () => {
  const good = modelProposalEntryOf(registerModelProposal(baseInput()));
  const mutate = (f: (r: ModelProposalEntry) => void, re: RegExp, name: string) => {
    const row = JSON.parse(JSON.stringify(good)) as ModelProposalEntry;
    f(row);
    assert.match(modelRowProblems(row, SHA).join(' | '), re, name);
  };
  mutate((r) => { r.provenance = 'hand-authored-control' as never; }, /provenance is "hand-authored-control"/, 'swapped provenance');
  mutate((r) => { r.id = 'PC-1'; }, /expected "MODEL-c3-live-meta-001"/, 'renamed id');
  mutate((r) => { r.candidateId = candidateIdOf(SHA, CSS); }, /provenance-tagged identity/, 'hand-authored candidate id on a model row');
  mutate((r) => { r.renderedCss = '.promo-overlay{pointer-events:auto}\n'; }, /freshly rendered bytes/, 'altered CSS');
  mutate((r) => { (r.adjustments[0] as CssAdjustment).value = 'auto'; }, /freshly rendered bytes/, 'altered triple without re-render');
  mutate((r) => { r.sourceProvenance = 'verified' as never; }, /operator-reported/, 'upgraded source class');
  mutate((r) => { r.approvedSha = 'b'.repeat(40); }, /not bound to the scoreboard approved SHA/, 'rebound revision');
  mutate((r) => { r.inputSha256 = 'zz'; }, /inputSha256/, 'malformed input hash');
  mutate((r) => { (r as unknown as Record<string, unknown>).replays = [{}]; }, /not authorized before E2/, 'premature replay');
  mutate((r) => { r.note = ''; }, /note is missing/, 'missing note');
  mutate((r) => { (r.adjustments[0] as Record<string, unknown>).extra = 1; }, /exactly selector, property and value/, 'extra triple key in the row');
});

test('E1 rows: additive verdict fields are refused as model-row problems (MAJOR-1)', () => {
  const good = modelProposalEntryOf(registerModelProposal(baseInput()));
  // The auditor's exact repro: verdict keys on a zero-replay row must be flagged as row problems.
  const forged = { ...good, status: 'VERIFIED', replaysPassed: 3, replaysAttempted: 3, evidenceFinalized: true };
  const problems = modelRowProblems(forged, SHA);
  assert.ok(problems.length > 0, 'the forged row is refused');
  for (const k of ['status', 'replaysPassed', 'replaysAttempted', 'evidenceFinalized']) {
    assert.ok(problems.some((x) => x === `unexpected model-proposal field: ${k}`), `injected ${k} reported exactly`);
  }
  // Multiple injected keys plus an innocuous one: every unknown key is reported.
  const multi = { ...good, expected: 'VERIFIED', complete: true, extra: 1 };
  const multiProblems = modelRowProblems(multi, SHA).join(' | ');
  for (const k of ['expected', 'complete', 'extra']) {
    assert.match(multiProblems, new RegExp(`unexpected model-proposal field: ${k}`), `injected ${k} reported`);
  }
  // Removed required keys are reported alongside the shape problems they cause.
  const dropped = JSON.parse(JSON.stringify(good)) as Record<string, unknown>;
  delete dropped.note;
  delete dropped.sourceSha;
  const droppedProblems = modelRowProblems(dropped, SHA).join(' | ');
  assert.match(droppedProblems, /missing model-proposal field: note/, 'removed note reported');
  assert.match(droppedProblems, /missing model-proposal field: sourceSha/, 'removed sourceSha reported');
  // Permitted free-text fields cannot launder a verdict.
  const laundered = (f: (r: ModelProposalEntry) => void, re: RegExp, name: string) => {
    const row = JSON.parse(JSON.stringify(good)) as ModelProposalEntry;
    f(row);
    assert.match(modelRowProblems(row, SHA).join(' | '), re, name);
  };
  laundered((r) => { r.description = 'Stored model proposal c3-live-meta-001: VERIFIED 3/3 replays passed'; }, /canonical E1 registration text/, 'VERIFIED description refused as non-canonical');
  laundered((r) => { r.description = 'Stored model proposal c3-live-meta-001: 1 adjustment(s), registered for isolated verification; never run, never passed'; }, /verdict language/, 'passed-language description refused');
  laundered((r) => { r.note = 'Model VERIFIED after review'; }, /canonical E1 registration text/, 'VERIFIED note refused');
  laundered((r) => { r.note = 'E1 registration only: No replay has run and this row claims ORACLE_PASS.'; }, /canonical E1 registration text/, 'ORACLE_PASS note refused');
});

test('E1 scoreboard: model rows verify without browser evidence; label and section stay separate', async () => {
  const good = modelProposalEntryOf(registerModelProposal(baseInput()));
  const boardFor = (label: string, models?: unknown[]) => ({
    schemaVersion: 1,
    label,
    complete: true,
    approvedSha: SHA,
    createdAt: '2026-10-30T00:00:00.000Z',
    modelOrProviderCalls: 0,
    modalCalls: 0,
    baseline: {
      reproduced: false,
      reasons: ['baseline evidence unavailable'],
      replay: { n: 1, evidenceDir: 'BASELINE/replay-1', recordSha256: 'x'.repeat(64) },
    },
    candidates: [],
    nc5: nc5Of(SHA, []),
    notes: [],
    ...(models !== undefined ? { modelProposals: models } : {}),
  });
  const dirFor = (board: unknown) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'pp-e1-board-'));
    writeFileSync(path.join(dir, SCOREBOARD_FILE), JSON.stringify(board));
    return dir;
  };
  const truthful = await verifyScoreboard(dirFor(boardFor(MODEL_BOARD_LABEL, [good])));
  assert.match(truthful.join(' | '), /record missing/, 'missing evidence still reported');
  assert.ok(!truthful.some((x) => x.includes('model-proposal')), `no model-row problem on the truthful board: ${truthful.join(' | ')}`);

  const forged = await verifyScoreboard(dirFor(boardFor(MODEL_BOARD_LABEL, [{ ...good, candidateId: candidateIdOf(SHA, CSS) }])));
  assert.ok(forged.some((x) => /model-proposal\[0\].*(provenance-tagged identity|collides)/.test(x)), `forged model id caught: ${forged.join(' | ')}`);

  const verdictForged = await verifyScoreboard(
    dirFor(boardFor(MODEL_BOARD_LABEL, [{ ...good, status: 'VERIFIED', replaysPassed: 3, replaysAttempted: 3, evidenceFinalized: true }])),
  );
  assert.ok(
    verdictForged.some((x) => /model-proposal\[0\]: unexpected model-proposal field: status/.test(x)),
    `injected verdict fields rejected on the integrated path: ${verdictForged.join(' | ')}`,
  );

  const wrongLabel = await verifyScoreboard(dirFor(boardFor('HAND-AUTHORED CONTROLS ONLY — NO MODEL INPUT', [good])));
  assert.ok(wrongLabel.some((x) => x.includes('model-rows label')), `model rows with the hand-authored-only label caught: ${wrongLabel.join(' | ')}`);

  const preE1 = await verifyScoreboard(dirFor(boardFor('HAND-AUTHORED CONTROLS ONLY — NO MODEL INPUT')));
  assert.ok(!preE1.some((x) => /modelProposals|model-rows label|hand-authored-controls label/.test(x)), `pre-E1 boards verify exactly as before: ${preE1.join(' | ')}`);
});
