// C3-B1 coordinator logic with SYNTHETIC records and a fake runner: no browser, no network, no provider.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  baselineGate,
  candidateIdOf,
  CoordinatorBusyError,
  decideVerification,
  finalizeEvidence,
  HAND_AUTHORED_CONTROLS,
  RECORD_FILE,
  renderCssAdjustments,
  replayPassProblems,
  REPLAYS_REQUIRED_FOR_VERIFIED,
  runOfflineVerification,
  SCOREBOARD_FILE,
  verifyPersistedEvidence,
  verifyScoreboard,
  type CandidateRecord,
  type CssAdjustment,
  type Runner,
  type Scoreboard,
} from '../../packages/core/src/index.ts';

const SHA = 'a'.repeat(40);
const sha256 = (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex');
const tmp = (p = 'pp-coord-') => mkdtempSync(path.join(os.tmpdir(), p));
const TRUSTED = { 'verifier/f01/f01.oracle.spec.ts': { gitBlob: 'b'.repeat(40), sha256: 'c'.repeat(64), bytes: 10 } };
const REQUIRED = ['oracle-report.json', 'oracle-stdout.txt', 'a/obs-m.json', 'a/trace-m.zip', 'b/obs-d.json', 'b/trace-d.zip'];
let nonceCounter = 0;

type Kind = 'pass' | 'fail-baseline-sig' | 'fail-both' | 'desktop-fail' | 'mobile-pass-no-regression';
/** A synthetic record shaped exactly like runCandidate's output. */
function record(adjustments: CssAdjustment[], kind: Kind, over: Partial<CandidateRecord> = {}): CandidateRecord {
  const css = renderCssAdjustments(adjustments);
  const nonce = `n${++nonceCounter}`;
  const cssSha = sha256(`css:${css}:${nonce}`);
  const pass = kind === 'pass';
  const mobileOk = pass || kind === 'desktop-fail' || kind === 'mobile-pass-no-regression';
  const desktopOk = pass || kind === 'fail-baseline-sig';
  const t = (ok: boolean) => ({ status: ok ? 'passed' : 'failed', hitTestTarget: ok ? 'add-to-cart' : 'promo-overlay', cartCountAfter: ok ? '1' : '0' });
  const proof = (n: string) => ({ test: n, served: true, bytesEqualStaged: true, hasNonce: true, servedSha256: cssSha });
  return {
    schemaVersion: 1, label: 'x', approvedSha: SHA, outcome: pass ? 'ORACLE_PASS' : 'PATCH_FAILED', failure: null, oracleRan: true, oracleExitCode: pass ? 0 : 1,
    adjustments, renderedCss: css,
    manifest: { approvedSha: SHA, trusted: TRUSTED, candidateCss: { path: 'p', sha256: cssSha, bytes: 1, nonce }, dependencies: { files: 1, sha256: 'd'.repeat(64) }, workspaceConfig: 'none present at the approved SHA' },
    mobile: t(mobileOk), desktop: t(desktopOk), baselineIdentical: kind === 'fail-baseline-sig',
    sourceProof: [proof('F01-MOBILE'), proof('F01-DESKTOP')], integrityAfterRun: 'intact', stageRemoved: true,
    requiredEvidence: [...REQUIRED], evidence: [], evidenceFinalized: true, ...over,
  };
}
const ev = (r: CandidateRecord, evidenceProblems: string[] = []) => ({ record: r, evidenceProblems });
const PC1: CssAdjustment[] = [{ selector: '.promo-overlay', property: 'pointer-events', value: 'none' }];
const GOOD_BASELINE = () => ev(record([], 'fail-baseline-sig'));
const decide = (replays: ReturnType<typeof ev>[], baseline: ReturnType<typeof ev> | null = GOOD_BASELINE()) => decideVerification({ approvedSha: SHA, baseline, replays });
const three = () => [ev(record(PC1, 'pass')), ev(record(PC1, 'pass')), ev(record(PC1, 'pass'))];

// ------------------------------------------------------------ replayPassProblems

test('a complete clean pass has no problems; every missing property is reported', () => {
  assert.deepEqual(replayPassProblems(ev(record(PC1, 'pass')), SHA), []);
  const bad: Array<[string, Partial<CandidateRecord>]> = [
    ['outcome', { outcome: 'INCONCLUSIVE' }], ['failure', { failure: { code: 'TAMPER', message: 'x' } }], ['oracle not run', { oracleRan: false }],
    ['exit', { oracleExitCode: 1 }], ['null exit', { oracleExitCode: null }], ['not finalized', { evidenceFinalized: false }], ['integrity', { integrityAfterRun: 'violated' }],
    ['stage kept', { stageRemoved: false }], ['no manifest', { manifest: null }], ['short required list', { requiredEvidence: ['x'] }], ['one proof', { sourceProof: [] }],
    ['mobile', { mobile: { status: 'passed', hitTestTarget: 'promo-overlay', cartCountAfter: '1' } }], ['desktop null', { desktop: null }],
    ['desktop cart', { desktop: { status: 'passed', hitTestTarget: 'add-to-cart', cartCountAfter: '0' } }],
  ];
  for (const [name, over] of bad) assert.ok(replayPassProblems(ev(record(PC1, 'pass', over)), SHA).length > 0, name);
  const r = record(PC1, 'pass');
  r.sourceProof[0]!.hasNonce = false;
  assert.ok(replayPassProblems(ev(r), SHA).some((p) => /source proof failed/.test(p)));
  const r2 = record(PC1, 'pass');
  r2.sourceProof[1]!.servedSha256 = 'e'.repeat(64);
  assert.ok(replayPassProblems(ev(r2), SHA).some((p) => /served CSS hash differs/.test(p)));
  assert.ok(replayPassProblems(ev(record(PC1, 'pass'), ['hash mismatch: x']), SHA).some((p) => /evidence: hash mismatch/.test(p)));
});

// ------------------------------------------------------------ decideVerification (MAJOR gate)

test('VERIFIED needs a reproduced baseline AND exactly three complete clean replays', () => {
  assert.deepEqual(decide(three()), { status: 'VERIFIED', replaysPassed: 3, reason: null });
  assert.equal(REPLAYS_REQUIRED_FOR_VERIFIED, 3);
});

test('one or two passes are ORACLE_PASS, never VERIFIED; no replay is INCONCLUSIVE', () => {
  assert.equal(decide(three().slice(0, 1)).status, 'ORACLE_PASS');
  assert.equal(decide(three().slice(0, 2)).status, 'ORACLE_PASS');
  assert.equal(decide([]).status, 'INCONCLUSIVE');
});

test('baseline NOT_REPRODUCED prevents verification even with three perfect replays', () => {
  const d = decide(three(), ev(record([], 'pass')));
  assert.equal(d.status, 'NOT_REPRODUCED');
  assert.equal(d.replaysPassed, 0);
});

test('a failed desktop regression, or any non-clean replay, prevents verification', () => {
  const withDesktopFail = [ev(record(PC1, 'pass')), ev(record(PC1, 'pass')), ev(record(PC1, 'desktop-fail'))];
  const d = decide(withDesktopFail);
  assert.equal(d.status, 'PATCH_FAILED');
  assert.equal(d.replaysPassed, 2);
  // forged: claims ORACLE_PASS but the desktop row failed
  const forged = record(PC1, 'pass', { desktop: { status: 'failed', hitTestTarget: 'promo-overlay', cartCountAfter: '0' } });
  assert.notEqual(decide([ev(record(PC1, 'pass')), ev(record(PC1, 'pass')), ev(forged)]).status, 'VERIFIED');
  // each of: missing/tampered evidence, bad exit, integrity, inconclusive
  for (const bad of [ev(record(PC1, 'pass'), ['hash mismatch: a']), ev(record(PC1, 'pass', { oracleExitCode: 2 })), ev(record(PC1, 'pass', { integrityAfterRun: 'violated' })), ev(record(PC1, 'pass', { outcome: 'INCONCLUSIVE', failure: { code: 'TAMPER', message: 'x' } })), ev(record(PC1, 'pass', { evidenceFinalized: false }))]) {
    const r = decide([ev(record(PC1, 'pass')), ev(record(PC1, 'pass')), bad]);
    assert.notEqual(r.status, 'VERIFIED');
    assert.equal(r.replaysPassed, 2);
  }
});

test('replays must be the identical candidate under one approved SHA with fresh nonces and identical trusted hashes', () => {
  const base = three();
  const sets: Array<[string, ReturnType<typeof three>]> = [
    ['different sha', [base[0]!, base[1]!, ev(record(PC1, 'pass', { approvedSha: 'f'.repeat(40) }))]],
    ['different css', [base[0]!, base[1]!, ev(record([{ selector: '.promo-overlay', property: 'z-index', value: '-1' }], 'pass'))]],
    ['different trusted hashes', [base[0]!, base[1]!, ev((() => { const r = record(PC1, 'pass'); r.manifest!.trusted = { ...TRUSTED, 'verifier/x': TRUSTED['verifier/f01/f01.oracle.spec.ts'] }; return r; })())]],
    ['repeated nonce (not fresh)', [base[0]!, base[1]!, ev((() => { const r = record(PC1, 'pass'); r.manifest!.candidateCss.nonce = base[0]!.record.manifest!.candidateCss.nonce; return r; })())]],
    ['same adjustments but different rendered css', [base[0]!, base[1]!, ev(record(PC1, 'pass', { renderedCss: '.promo-overlay{pointer-events:auto}\n' }))]],
    ['same css but different adjustments', [base[0]!, base[1]!, ev(record(PC1, 'pass', { adjustments: [{ selector: '.promo-overlay', property: 'pointer-events', value: 'auto' }] }))]],
    ['four replays', [...base, ev(record(PC1, 'pass'))]],
  ];
  for (const [name, replays] of sets) assert.equal(decide(replays).status, 'INCONCLUSIVE', name);
});

test('failed candidates are recorded honestly: PATCH_FAILED, PATCH_REJECTED, INCONCLUSIVE', () => {
  assert.equal(decide([ev(record([], 'fail-baseline-sig'))]).status, 'PATCH_FAILED');
  assert.equal(decide([ev(record([], 'fail-baseline-sig'), ['hash mismatch: x'])]).status, 'INCONCLUSIVE');
  assert.equal(decide([ev(record([], 'fail-baseline-sig', { outcome: 'PATCH_REJECTED' }))]).status, 'PATCH_REJECTED');
  assert.equal(decide([ev(record([], 'fail-baseline-sig', { outcome: 'INCONCLUSIVE', failure: { code: 'PORT_BUSY', message: 'x' } }))]).status, 'INCONCLUSIVE');
});

test('the same candidate and SHA are identified identically across replays; any change changes the id', () => {
  const css = renderCssAdjustments(PC1);
  assert.equal(candidateIdOf(SHA, css), candidateIdOf(SHA, css));
  assert.notEqual(candidateIdOf(SHA, css), candidateIdOf('b'.repeat(40), css));
  assert.notEqual(candidateIdOf(SHA, css), candidateIdOf(SHA, ''));
});

// ------------------------------------------------------------ baseline gate

test('baselineGate certifies only the genuine REPRODUCED signature', () => {
  const good = record([], 'fail-baseline-sig');
  assert.deepEqual(baselineGate(ev(good), SHA), { reproduced: true, reasons: [] });
  const cases: Array<[string, CandidateRecord]> = [
    ['mobile passes (defect absent)', record([], 'pass')],
    ['desktop also fails', record([], 'fail-both')],
    ['exit 0', record([], 'fail-baseline-sig', { oracleExitCode: 0 })],
    ['adjustments present', record(PC1, 'fail-baseline-sig')],
    ['not finalized', record([], 'fail-baseline-sig', { evidenceFinalized: false })],
    ['not classified REPRODUCED', record([], 'fail-baseline-sig', { baselineIdentical: false })],
    ['desktop control failed (other signals intact)', record([], 'fail-baseline-sig', { desktop: { status: 'failed', hitTestTarget: 'promo-overlay', cartCountAfter: '0' } })],
    ['no source proof', record([], 'fail-baseline-sig', { sourceProof: [] })],
    ['stage kept', record([], 'fail-baseline-sig', { stageRemoved: false })],
  ];
  for (const [name, r] of cases) assert.equal(baselineGate(ev(r), SHA).reproduced, false, name);
  assert.equal(baselineGate(ev(good, ['hash mismatch: x']), SHA).reproduced, false);
});

// ------------------------------------------------------------ coordinator with a fake runner

type Script = (label: string, n: number, adjustments: CssAdjustment[]) => CandidateRecord;
function fakeRunner(script: Script, calls: string[] = [], delayMs = 0): Runner {
  return async (opts) => {
    const n = Number(/replay-(\d+)$/.exec(opts.evidenceDir)![1]);
    calls.push(`${opts.label}#${n}`);
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    const rec = script(opts.label, n, [...opts.adjustments]);
    mkdirSync(opts.evidenceDir, { recursive: true });
    for (const f of REQUIRED) {
      mkdirSync(path.dirname(path.join(opts.evidenceDir, f)), { recursive: true });
      writeFileSync(path.join(opts.evidenceDir, f), `${opts.label} ${n} ${f}\n`);
    }
    if (rec.outcome === 'ORACLE_PASS' || rec.outcome === 'PATCH_FAILED') {
      await finalizeEvidence(rec, opts.evidenceDir, { hashFile: async (f) => { const b = readFileSync(f); return { sha256: sha256(b), bytes: b.length }; }, writeRecord: async (f, t) => writeFileSync(f, t) });
    } else {
      rec.requiredEvidence = [];
      writeFileSync(path.join(opts.evidenceDir, RECORD_FILE), JSON.stringify(rec));
    }
    return rec;
  };
}
const honest: Script = (label, _n, adj) => {
  if (label === 'BASELINE' || /^NC-1/.test(label)) return record(adj, 'fail-baseline-sig');
  if (label === 'NC-3') return record(adj, 'fail-both');
  if (label === 'NC-6') return record(adj, 'fail-baseline-sig', { outcome: 'INCONCLUSIVE', oracleRan: false, oracleExitCode: null, mobile: null, desktop: null, sourceProof: [], evidenceFinalized: false, stageRemoved: true, failure: { code: 'TAMPER', message: 'x' } });
  if (label === 'NC-7') return record(adj, 'fail-baseline-sig', { outcome: 'INCONCLUSIVE', oracleRan: false, oracleExitCode: null, mobile: null, desktop: null, sourceProof: [], evidenceFinalized: false, stageRemoved: true, failure: { code: 'PORT_BUSY', message: 'x' } });
  return record(adj, 'pass');
};
const coordOpts = (runner: Runner, root = tmp()) => ({ repoRoot: root, approvedSha: SHA, outDir: path.join(root, 'out'), lockPath: path.join(root, 'stage.lock'), coordinatorLockPath: path.join(root, 'coord.lock'), runner, now: () => new Date('2026-10-28T00:00:00Z') });
const byId = (b: Scoreboard, id: string) => b.candidates.find((c) => c.id === id)!;

test('coordinator: honest run gives the expected statuses, PC-1 is VERIFIED only after 3 serial fresh replays, scoreboard re-verifies', async () => {
  const calls: string[] = [];
  const o = coordOpts(fakeRunner(honest, calls));
  const board = await runOfflineVerification(o);
  assert.deepEqual(calls, ['BASELINE#1', 'NC-1#1', 'NC-1b#1', 'NC-3#1', 'NC-6#1', 'NC-7#1', 'PC-1#1', 'PC-1#2', 'PC-1#3']);
  assert.equal(board.baseline.reproduced, true);
  assert.deepEqual(board.candidates.map((c) => [c.id, c.status, c.expectationMet]), [['NC-1', 'PATCH_FAILED', true], ['NC-1b', 'PATCH_FAILED', true], ['NC-3', 'PATCH_FAILED', true], ['NC-6', 'INCONCLUSIVE', true], ['NC-7', 'INCONCLUSIVE', true], ['PC-1', 'VERIFIED', true]]);
  const pc1 = byId(board, 'PC-1');
  assert.equal(pc1.replaysPassed, 3);
  assert.equal(pc1.replays.length, 3);
  assert.equal(new Set(pc1.replays.map((r) => r.nonce)).size, 3, 'fresh nonce per replay');
  assert.equal(board.nc5.status, 'NOT_REPRODUCED');
  assert.equal(board.nc5.neverVerified, true);
  assert.equal(board.modelOrProviderCalls, 0);
  assert.equal(board.modalCalls, 0);
  assert.ok(board.candidates.every((c) => c.provenance === 'hand-authored-control'));
  assert.deepEqual(await verifyScoreboard(o.outDir), []);
  assert.equal(existsSync(o.coordinatorLockPath), false, 'lock released');
});

test('coordinator: a baseline that is NOT reproduced stops everything; no candidate is run or verified', async () => {
  const calls: string[] = [];
  const o = coordOpts(fakeRunner((label, _n, adj) => (label === 'BASELINE' ? record(adj, 'pass') : honest(label, _n, adj)), calls));
  const board = await runOfflineVerification(o);
  assert.deepEqual(calls, ['BASELINE#1'], 'no candidate replay ran');
  assert.equal(board.baseline.reproduced, false);
  assert.ok(board.candidates.every((c) => c.status === 'NOT_REPRODUCED' && c.replaysAttempted === 0 && c.expectationMet === (c.expected === 'NOT_REPRODUCED')));
  assert.equal(byId(board, 'PC-1').status, 'NOT_REPRODUCED');
  assert.deepEqual(await verifyScoreboard(o.outDir), []);
});

test('coordinator: a failing third replay (desktop regression) leaves PC-1 PATCH_FAILED with 2 of 3 and stops', async () => {
  const calls: string[] = [];
  const o = coordOpts(fakeRunner((label, n, adj) => (label === 'PC-1' && n === 3 ? record(adj, 'desktop-fail') : honest(label, n, adj)), calls));
  const board = await runOfflineVerification(o);
  const pc1 = byId(board, 'PC-1');
  assert.deepEqual([pc1.status, pc1.replaysPassed, pc1.replaysAttempted, pc1.expectationMet], ['PATCH_FAILED', 2, 3, false]);
  assert.match(pc1.reason!, /replay 3/);
  assert.deepEqual(await verifyScoreboard(o.outDir), []);
});

test('coordinator: an inconclusive second replay stops further replays and is not promoted', async () => {
  const calls: string[] = [];
  const inconclusive = (adj: CssAdjustment[]) => record(adj, 'pass', { outcome: 'INCONCLUSIVE', oracleExitCode: null, evidenceFinalized: false, failure: { code: 'PORT_BUSY', message: 'x' } });
  const o = coordOpts(fakeRunner((label, n, adj) => (label === 'PC-1' && n === 2 ? inconclusive(adj) : honest(label, n, adj)), calls));
  const board = await runOfflineVerification(o);
  assert.deepEqual(calls.filter((c) => c.startsWith('PC-1')), ['PC-1#1', 'PC-1#2']);
  const pc1 = byId(board, 'PC-1');
  assert.deepEqual([pc1.status, pc1.replaysPassed], ['INCONCLUSIVE', 1]);
});

test('coordinator: concurrent coordinators do not interleave; the second is refused and awards nothing', async () => {
  const calls: string[] = [];
  const root = tmp();
  const a = coordOpts(fakeRunner(honest, calls, 15), root);
  const b = { ...coordOpts(fakeRunner(honest, calls, 15), root), outDir: path.join(root, 'out-b') };
  const results = await Promise.allSettled([runOfflineVerification(a), runOfflineVerification(b)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
  assert.ok(rejected.reason instanceof CoordinatorBusyError);
  assert.equal(calls.length, 9, 'only one coordinator ran its controls');
  assert.equal(existsSync(path.join(root, 'out-b', SCOREBOARD_FILE)), false);
  assert.equal(existsSync(a.coordinatorLockPath), false);
});

test('coordinator: an interrupted run writes no scoreboard, releases the lock, and cannot verify', async () => {
  const root = tmp();
  const o = coordOpts(fakeRunner((label, n, adj) => { if (label === 'PC-1' && n === 2) throw new Error('crash'); return honest(label, n, adj); }), root);
  await assert.rejects(runOfflineVerification(o), /crash/);
  assert.equal(existsSync(path.join(o.outDir, SCOREBOARD_FILE)), false);
  assert.equal(existsSync(o.coordinatorLockPath), false);
  assert.match((await verifyScoreboard(o.outDir)).join(), /missing or unreadable/);
});

// ------------------------------------------------------------ verifyScoreboard fails closed

async function honestBoard() {
  const o = coordOpts(fakeRunner(honest));
  await runOfflineVerification(o);
  return o.outDir;
}
const copy = (dir: string) => { const d = tmp('pp-coord-copy-'); cpSync(dir, d, { recursive: true }); return d; };
const edit = (dir: string, f: (b: any) => void) => { const p = path.join(dir, SCOREBOARD_FILE); const b = JSON.parse(readFileSync(p, 'utf8')); f(b); writeFileSync(p, JSON.stringify(b)); };

test('verifyScoreboard detects forged statuses, dropped replays, tampered or missing evidence, and a DID-1 verdict', async () => {
  const base = await honestBoard();
  assert.deepEqual(await verifyScoreboard(base), []);

  const forged = copy(base);
  edit(forged, (b) => { b.candidates.find((c: any) => c.id === 'NC-1').status = 'VERIFIED'; });
  assert.match((await verifyScoreboard(forged)).join(), /NC-1: scoreboard says VERIFIED but the evidence gives PATCH_FAILED/);

  const dropped = copy(base);
  edit(dropped, (b) => { const c = b.candidates.find((x: any) => x.id === 'PC-1'); c.replays = c.replays.slice(0, 2); });
  const droppedProblems = (await verifyScoreboard(dropped)).join();
  assert.match(droppedProblems, /PC-1: scoreboard says VERIFIED but the evidence gives ORACLE_PASS/);
  assert.match(droppedProblems, /VERIFIED without 3\/3 replays/);

  const tampered = copy(base);
  writeFileSync(path.join(tampered, 'PC-1/replay-2/oracle-stdout.txt'), 'tampered');
  assert.match((await verifyScoreboard(tampered)).join(), /hash mismatch: oracle-stdout\.txt/);

  const rewritten = copy(base);
  const recPath = path.join(rewritten, 'PC-1/replay-3', RECORD_FILE);
  const rec = JSON.parse(readFileSync(recPath, 'utf8'));
  rec.desktop.status = 'failed';
  writeFileSync(recPath, JSON.stringify(rec));
  assert.match((await verifyScoreboard(rewritten)).join(), /record hash mismatch/);

  const missing = copy(base);
  rmSync(path.join(missing, 'PC-1/replay-1', RECORD_FILE));
  assert.match((await verifyScoreboard(missing)).join(), /record missing/);

  const baselineForged = copy(base);
  edit(baselineForged, (b) => { b.baseline.reproduced = false; });
  assert.match((await verifyScoreboard(baselineForged)).join(), /baseline verdict does not match its evidence/);

  const did1 = copy(base);
  edit(did1, (b) => { b.did1 = { passed: true }; });
  assert.match((await verifyScoreboard(did1)).join(), /DID-1 must not appear/);

  const providerClaim = copy(base);
  edit(providerClaim, (b) => { b.modelOrProviderCalls = 1; });
  assert.match((await verifyScoreboard(providerClaim)).join(), /provider or Modal calls/);

  const wrongCss = copy(base);
  edit(wrongCss, (b) => { b.candidates.find((c: any) => c.id === 'PC-1').renderedCss = '.x{}'; });
  assert.match((await verifyScoreboard(wrongCss)).join(), /rendered CSS differs from the hand-authored control/);
});

// ------------------------------------------------------------ controls are hand-authored

test('every control is a fixed hand-authored literal that renders through the closed grammar', () => {
  assert.deepEqual(HAND_AUTHORED_CONTROLS.map((c) => c.id), ['NC-1', 'NC-1b', 'NC-3', 'NC-6', 'NC-7', 'PC-1']);
  for (const c of HAND_AUTHORED_CONTROLS) {
    assert.ok(typeof renderCssAdjustments(c.adjustments) === 'string', c.id);
    assert.ok(c.replays >= 1 && c.replays <= 3);
  }
  assert.equal(HAND_AUTHORED_CONTROLS.find((c) => c.id === 'PC-1')!.replays, 3);
  assert.equal(HAND_AUTHORED_CONTROLS.filter((c) => c.expect === 'VERIFIED').length, 1);
  void readdirSync;
  void verifyPersistedEvidence;
});

// ============================================================ remediation: MAJOR-1 (complete, recomputed scoreboard)

test('MAJOR-1: an empty candidate list, an omitted PC-1, duplicated or renamed controls all fail verification', async () => {
  const base = await honestBoard();
  const empty = copy(base);
  edit(empty, (b) => { b.candidates = []; });
  assert.match((await verifyScoreboard(empty)).join(), /control inventory is \[\]/);

  const noPc1 = copy(base);
  edit(noPc1, (b) => { b.candidates = b.candidates.filter((c: any) => c.id !== 'PC-1'); });
  assert.match((await verifyScoreboard(noPc1)).join(), /control inventory is .*expected/);

  const dup = copy(base);
  edit(dup, (b) => { b.candidates.push(JSON.parse(JSON.stringify(b.candidates[0]))); });
  assert.match((await verifyScoreboard(dup)).join(), /duplicate control ids/);

  const renamed = copy(base);
  edit(renamed, (b) => { b.candidates.find((c: any) => c.id === 'PC-1').id = 'PC-9'; });
  assert.match((await verifyScoreboard(renamed)).join(), /control inventory/);

  const extra = copy(base);
  edit(extra, (b) => { const c = JSON.parse(JSON.stringify(b.candidates.find((x: any) => x.id === 'PC-1'))); c.id = 'PC-2'; b.candidates.push(c); });
  assert.match((await verifyScoreboard(extra)).join(), /control inventory/);

  const reordered = copy(base);
  edit(reordered, (b) => { b.candidates.reverse(); });
  assert.match((await verifyScoreboard(reordered)).join(), /control inventory/);
});

test('MAJOR-1: forged NC-5 (VERIFIED, neverVerified false, removed, altered) fails; NC-5 is recomputed from the persisted PC-1 evidence', async () => {
  const base = await honestBoard();
  for (const [name, mutate] of [
    ['status VERIFIED', (b: any) => { b.nc5.status = 'VERIFIED'; }],
    ['neverVerified false', (b: any) => { b.nc5.neverVerified = false; }],
    ['baselineReproduced true', (b: any) => { b.nc5.baselineReproduced = true; }],
    ['removed', (b: any) => { delete b.nc5; }],
    ['null', (b: any) => { b.nc5 = null; }],
    ['description altered', (b: any) => { b.nc5.description = 'trust me'; }],
    ['extra field', (b: any) => { b.nc5.extra = 1; }],
    ['status ORACLE_PASS', (b: any) => { b.nc5.status = 'ORACLE_PASS'; }],
  ] as Array<[string, (b: any) => void]>) {
    const d = copy(base);
    edit(d, mutate);
    const problems = (await verifyScoreboard(d)).join();
    assert.match(problems, /NC-5|missing scoreboard field: nc5/, name);
  }
  const claimsVerified = copy(base);
  edit(claimsVerified, (b) => { b.nc5.status = 'VERIFIED'; b.nc5.neverVerified = false; b.nc5.baselineReproduced = true; });
  assert.match((await verifyScoreboard(claimsVerified)).join(), /NC-5 claims a verified outcome/);
});

test('MAJOR-1: fake counts, a truncated replay list, altered metadata, a false complete flag and extra fields fail', async () => {
  const base = await honestBoard();
  const cases: Array<[string, (b: any) => void, RegExp]> = [
    ['fake replaysAttempted', (b) => { b.candidates.find((c: any) => c.id === 'PC-1').replaysAttempted = 5; }, /replaysAttempted 5/],
    ['fake replaysPassed', (b) => { b.candidates.find((c: any) => c.id === 'NC-1').replaysPassed = 1; }, /replaysPassed 1/],
    ['wrong replaysRequired', (b) => { b.candidates.find((c: any) => c.id === 'PC-1').replaysRequired = 1; }, /replaysRequired 1/],
    ['truncated PC-1 with consistent counts', (b) => { const c = b.candidates.find((x: any) => x.id === 'PC-1'); c.replays = c.replays.slice(0, 2); c.replaysAttempted = 2; c.replaysPassed = 2; c.status = 'ORACLE_PASS'; c.reason = '2 of 3 replays; not verified'; c.expectationMet = false; }, /truncated or padded/],
    ['no replays at all for PC-1', (b) => { const c = b.candidates.find((x: any) => x.id === 'PC-1'); c.replays = []; c.replaysAttempted = 0; c.replaysPassed = 0; c.status = 'INCONCLUSIVE'; c.reason = 'no replay was run'; }, /truncated or padded|unavailable/],
    ['altered reason', (b) => { b.candidates.find((c: any) => c.id === 'NC-1').reason = 'looks fine'; }, /reason does not match/],
    ['expectationMet forged', (b) => { b.candidates.find((c: any) => c.id === 'NC-6').expectationMet = false; }, /expectationMet does not match/],
    ['expected status altered', (b) => { b.candidates.find((c: any) => c.id === 'NC-3').expected = 'VERIFIED'; }, /expected status was altered/],
    ['description altered', (b) => { b.candidates.find((c: any) => c.id === 'NC-1').description = 'x'; }, /description was altered/],
    ['adjustments altered', (b) => { b.candidates.find((c: any) => c.id === 'NC-1').adjustments = [{ selector: '.promo-overlay', property: 'pointer-events', value: 'none' }]; }, /adjustments differ/],
    ['fault kind altered', (b) => { b.candidates.find((c: any) => c.id === 'NC-7').fault = null; }, /fault kind/],
    ['provenance altered', (b) => { b.candidates.find((c: any) => c.id === 'PC-1').provenance = 'model'; }, /provenance/],
    ['replay metadata altered', (b) => { b.candidates.find((c: any) => c.id === 'PC-1').replays[1].oracleExitCode = 1; }, /oracleExitCode does not match/],
    ['replay nonce altered', (b) => { b.candidates.find((c: any) => c.id === 'PC-1').replays[0].nonce = 'zzz'; }, /nonce does not match/],
    ['replay path redirected', (b) => { b.candidates.find((c: any) => c.id === 'PC-1').replays[2].evidenceDir = 'PC-1/replay-1'; }, /points at/],
    ['complete false', (b) => { b.complete = false; }, /not complete/],
    ['complete missing', (b) => { delete b.complete; }, /missing scoreboard field: complete/],
    ['extra top-level field', (b) => { b.verdict = 'VERIFIED'; }, /unexpected scoreboard field: verdict/],
    ['label altered', (b) => { b.label = 'model proposals verified'; }, /label/],
    ['approvedSha malformed', (b) => { b.approvedSha = 'main'; }, /approvedSha/],
    ['baseline reasons altered', (b) => { b.baseline.reasons = ['fine']; }, /baseline reasons/],
    ['unsafe evidence path', (b) => { b.baseline.replay.evidenceDir = '../../etc'; }, /unsafe evidence path/],
  ];
  for (const [name, mutate, expect] of cases) {
    const d = copy(base);
    edit(d, mutate);
    assert.match((await verifyScoreboard(d)).join(' | '), expect, name);
  }
});

test('MAJOR-1: a truthful scoreboard of a run whose expectations were NOT met still verifies', async () => {
  // PC-1 fails its third replay (desktop regression)
  const failing = coordOpts(fakeRunner((label, n, adj) => (label === 'PC-1' && n === 3 ? record(adj, 'desktop-fail') : honest(label, n, adj))));
  const board = await runOfflineVerification(failing);
  assert.equal(byId(board, 'PC-1').expectationMet, false);
  assert.deepEqual(await verifyScoreboard(failing.outDir), []);
  // baseline not reproduced: nothing ran, everything NOT_REPRODUCED, NC-5 recomputed from "no PC-1 evidence"
  const nobase = coordOpts(fakeRunner((label, n, adj) => (label === 'BASELINE' ? record(adj, 'pass') : honest(label, n, adj))));
  const b2 = await runOfflineVerification(nobase);
  assert.equal(b2.baseline.reproduced, false);
  assert.deepEqual(await verifyScoreboard(nobase.outDir), []);
  // ...and a forged claim that this run reproduced the baseline fails
  edit(nobase.outDir, (b) => { b.baseline.reproduced = true; });
  assert.match((await verifyScoreboard(nobase.outDir)).join(), /baseline verdict does not match/);
});

// ============================================================ remediation: MAJOR-2 (SHA, manifest and viewport proof binding)

test('MAJOR-2: a certified baseline from another SHA cannot certify a candidate; three perfect replays do not help', () => {
  const OTHER = 'f'.repeat(40);
  const crossSha = record([], 'fail-baseline-sig', { approvedSha: OTHER });
  crossSha.manifest!.approvedSha = OTHER;
  const d = decide(three(), ev(crossSha));
  assert.equal(d.status, 'NOT_REPRODUCED');
  assert.match(d.reason!, /approved SHA/);
  // record SHA right, manifest SHA wrong (and vice versa)
  const manifestOnly = record([], 'fail-baseline-sig');
  manifestOnly.manifest!.approvedSha = OTHER;
  assert.equal(decide(three(), ev(manifestOnly)).status, 'NOT_REPRODUCED');
  const recordOnly = record([], 'fail-baseline-sig', { approvedSha: OTHER });
  assert.equal(decide(three(), ev(recordOnly)).status, 'NOT_REPRODUCED');
  assert.equal(baselineGate(ev(crossSha), SHA).reproduced, false);
  assert.equal(baselineGate(ev(crossSha), OTHER).reproduced, true, 'the same record is a valid baseline under its own SHA');
  assert.equal(decide(three(), null).status, 'NOT_REPRODUCED');
});

test('MAJOR-2: every replay must name the approved SHA in both record and manifest', () => {
  const OTHER = 'f'.repeat(40);
  const wrongManifest = record(PC1, 'pass');
  wrongManifest.manifest!.approvedSha = OTHER;
  assert.ok(replayPassProblems(ev(wrongManifest), SHA).some((p) => /manifest names a different approved SHA/.test(p)));
  const wrongRecord = record(PC1, 'pass', { approvedSha: OTHER });
  assert.ok(replayPassProblems(ev(wrongRecord), SHA).some((p) => /not the approved SHA/.test(p)));
  for (const bad of [wrongManifest, wrongRecord]) {
    const r = decide([ev(record(PC1, 'pass')), ev(record(PC1, 'pass')), ev(bad)]);
    assert.notEqual(r.status, 'VERIFIED');
    assert.equal(r.replaysPassed, 2);
  }
});

test('MAJOR-2: replays must match the certified baseline\'s trusted-file manifest, not just each other', () => {
  const drift = { ...TRUSTED, 'verifier/f01/f01.oracle.spec.ts': { gitBlob: '9'.repeat(40), sha256: '8'.repeat(64), bytes: 10 } };
  const same = () => { const r = record(PC1, 'pass'); r.manifest!.trusted = drift; return ev(r); };
  const r = decide([same(), same(), same()]);
  assert.equal(r.status, 'INCONCLUSIVE');
  assert.match(r.reason!, /differ from the certified baseline/);
  // a baseline with the drifted manifest and matching replays verifies (the binding is equality, not a fixed value)
  const driftedBaseline = record([], 'fail-baseline-sig');
  driftedBaseline.manifest!.trusted = drift;
  assert.equal(decide([same(), same(), same()], ev(driftedBaseline)).status, 'VERIFIED');
});

test('MAJOR-2: exactly one F01-MOBILE and one F01-DESKTOP proof per run; duplicates, missing and mislabeled proofs never promote', () => {
  const withProofs = (labels: string[]) => {
    const r = record(PC1, 'pass');
    r.sourceProof = labels.map((test) => ({ test, served: true, bytesEqualStaged: true, hasNonce: true, servedSha256: r.manifest!.candidateCss.sha256 }));
    return r;
  };
  assert.deepEqual(replayPassProblems(ev(withProofs(['F01-MOBILE', 'F01-DESKTOP'])), SHA), [], 'one good copy of each passes');
  assert.deepEqual(replayPassProblems(ev(withProofs(['F01-DESKTOP', 'F01-MOBILE'])), SHA), [], 'order does not matter');
  const bad: Array<[string, string[]]> = [
    ['two mobile', ['F01-MOBILE', 'F01-MOBILE']],
    ['two desktop', ['F01-DESKTOP', 'F01-DESKTOP']],
    ['missing desktop', ['F01-MOBILE']],
    ['missing mobile', ['F01-DESKTOP']],
    ['mislabeled', ['F01-MOBILE', 'F01-TABLET']],
    ['both mislabeled', ['mobile', 'desktop']],
    ['three proofs', ['F01-MOBILE', 'F01-DESKTOP', 'F01-MOBILE']],
    ['none', []],
  ];
  for (const [name, labels] of bad) {
    const problems = replayPassProblems(ev(withProofs(labels)), SHA);
    assert.ok(problems.length > 0, name);
    const r = decide([ev(record(PC1, 'pass')), ev(record(PC1, 'pass')), ev(withProofs(labels))]);
    assert.notEqual(r.status, 'VERIFIED', name);
    assert.equal(r.replaysPassed, 2, name);
  }
  // the same rule binds the baseline
  const base = (labels: string[]) => { const r = record([], 'fail-baseline-sig'); r.sourceProof = labels.map((test) => ({ test, served: true, bytesEqualStaged: true, hasNonce: true, servedSha256: r.manifest!.candidateCss.sha256 })); return ev(r); };
  assert.equal(baselineGate(base(['F01-MOBILE', 'F01-DESKTOP']), SHA).reproduced, true);
  for (const [name, labels] of bad) assert.equal(baselineGate(base(labels), SHA).reproduced, false, `baseline: ${name}`);
});

test('MAJOR-2: through the coordinator, a cross-SHA baseline stops the run, awards nothing, and its truthful scoreboard verifies', async () => {
  const OTHER = 'f'.repeat(40);
  const calls: string[] = [];
  const o = coordOpts(fakeRunner((label, n, adj) => {
    if (label !== 'BASELINE') return honest(label, n, adj);
    const r = record(adj, 'fail-baseline-sig', { approvedSha: OTHER });
    r.manifest!.approvedSha = OTHER;
    return r;
  }, calls));
  const board = await runOfflineVerification(o);
  assert.deepEqual(calls, ['BASELINE#1']);
  assert.equal(board.baseline.reproduced, false);
  assert.ok(board.candidates.every((c) => c.status === 'NOT_REPRODUCED'));
  assert.deepEqual(await verifyScoreboard(o.outDir), []);
  edit(o.outDir, (b) => { b.baseline.reproduced = true; });
  assert.match((await verifyScoreboard(o.outDir)).join(), /baseline verdict does not match/);
});
