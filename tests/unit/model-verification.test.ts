// C3-B2B E2 verification path with SYNTHETIC fixtures only: a fake stage runner and a fake
// Git stand in for the browser and the repository. No artifact is read, no browser runs, no
// provider is contacted. Proves the registered-only replay path, the recomputed verdicts and
// every refusal boundary, including the hard-disabled real artifact via the operator command.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  candidateIdOf,
  finalizeEvidence,
  MODEL_VERIFICATION_LABEL,
  modelProposalEntryOf,
  modelProposalIdOf,
  modelVerificationProblems,
  nc5Of,
  registerModelProposal,
  renderCssAdjustments,
  verifyRegisteredProposal,
  verifyScoreboard,
  ModelProposalError,
  ModelVerificationError,
  RECORD_FILE,
  SCOREBOARD_FILE,
  VERIFICATION_FILE,
  type CandidateRecord,
  type CssAdjustment,
  type ModelGit,
  type ModelVerificationEntry,
  type Runner,
} from '../../packages/core/src/index.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const V = 'c'.repeat(40);
const SRC = 'b'.repeat(40);
const H1 = 'd'.repeat(64);
const H2 = 'e'.repeat(64);
const RUN = 'e2-model-001';
const PC1: CssAdjustment[] = [{ selector: '.promo-overlay', property: 'pointer-events', value: 'none' }];
const CSS = renderCssAdjustments(PC1);
const FIXTURE_TREE = 'f'.repeat(40);
const OTHER_TREE = '0'.repeat(40);
const sha256 = (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex');
const tmp = (p = 'pp-e2-') => mkdtempSync(path.join(os.tmpdir(), p));
const TRUSTED = { 'verifier/f01/f01.oracle.spec.ts': { gitBlob: 'b'.repeat(40), sha256: 'c'.repeat(64), bytes: 10 } };
const REQUIRED = ['oracle-report.json', 'oracle-stdout.txt', 'a/obs-m.json', 'a/trace-m.zip', 'b/obs-d.json', 'b/trace-d.zip'];
let nonceCounter = 0;

type Kind = 'pass' | 'fail-baseline-sig' | 'fail-both' | 'desktop-fail';
/** A synthetic record shaped exactly like runCandidate's output, bound to the given SHA. */
function record(sha: string, adjustments: CssAdjustment[], kind: Kind, over: Partial<CandidateRecord> = {}): CandidateRecord {
  const css = renderCssAdjustments(adjustments);
  const nonce = `n${++nonceCounter}`;
  const cssSha = sha256(`css:${css}:${nonce}`);
  const pass = kind === 'pass';
  const mobileOk = pass;
  const desktopOk = pass || kind === 'fail-baseline-sig';
  const t = (ok: boolean) => ({ status: ok ? 'passed' : 'failed', hitTestTarget: ok ? 'add-to-cart' : 'promo-overlay', cartCountAfter: ok ? '1' : '0' });
  const proof = (n: string) => ({ test: n, served: true, bytesEqualStaged: true, hasNonce: true, servedSha256: cssSha });
  return {
    schemaVersion: 1, label: 'x', approvedSha: sha, outcome: pass ? 'ORACLE_PASS' : 'PATCH_FAILED', failure: null, oracleRan: true, oracleExitCode: pass ? 0 : 1,
    adjustments, renderedCss: css,
    manifest: { approvedSha: sha, trusted: TRUSTED, candidateCss: { path: 'p', sha256: cssSha, bytes: 1, nonce }, dependencies: { files: 1, sha256: 'd'.repeat(64) }, workspaceConfig: 'none present at the approved SHA' },
    mobile: t(mobileOk), desktop: t(desktopOk), baselineIdentical: kind === 'fail-baseline-sig',
    sourceProof: [proof('F01-MOBILE'), proof('F01-DESKTOP')], integrityAfterRun: 'intact', stageRemoved: true,
    requiredEvidence: [...REQUIRED], evidence: [], evidenceFinalized: true, ...over,
  };
}

const fakeGit = (trees: Record<string, string> = {}, ancestors = true): ModelGit => ({
  commitExists: async (sha) => sha === SRC || sha === V,
  isAncestor: async (a, d) => ancestors && a === SRC && d === V,
  treeOf: async (rev, p) => trees[`${rev}:${p}`] ?? null,
});
const fullTrees = (tree = FIXTURE_TREE): Record<string, string> => {
  const o: Record<string, string> = {};
  for (const rev of [SRC, V]) for (const p of ['fixtures/sample-store', 'verifier', 'config/patch-policy.json']) o[`${rev}:${p}`] = tree;
  return o;
};

const honestPass = (_adj: CssAdjustment[], isBaseline: boolean) => ({ kind: (isBaseline ? 'fail-baseline-sig' : 'pass') as Kind });

function fakeRunner(script: (adj: CssAdjustment[], isBaseline: boolean) => { kind: Kind; over?: Partial<CandidateRecord> }, calls: string[] = []): Runner {
  return async (opts) => {
    const n = Number(/replay-(\d+)$/.exec(opts.evidenceDir)![1]);
    const isBaseline = opts.evidenceDir.includes(`${path.sep}baseline${path.sep}`) || opts.evidenceDir.includes('/baseline/');
    calls.push(`${isBaseline ? 'BASELINE' : 'replay'}#${n}`);
    const { kind, over } = script([...opts.adjustments], isBaseline);
    const rec = record(opts.approvedSha, [...opts.adjustments], kind, over);
    rec.label = opts.label;
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

const register = () => registerModelProposal({
  triples: PC1.map((a) => ({ ...a })),
  renderedCss: CSS,
  runId: RUN,
  approvedSha: V,
  sourceSha: SRC,
  inputSha256: H1,
  artifactSha256: H2,
});

const runOpts = (
  root: string,
  runner: Runner,
  git: ModelGit,
  proposal = register(),
  over: Partial<Parameters<typeof verifyRegisteredProposal>[0]> = {},
) => ({
  repoRoot: root,
  verificationSha: V,
  sourceSha: SRC,
  inputSha256: H1,
  artifactSha256: H2,
  proposal,
  outDir: path.join(root, 'out'),
  lockPath: path.join(root, 'stage.lock'),
  coordinatorLockPath: path.join(root, 'coord.lock'),
  git,
  runner,
  ...over,
});

// ------------------------------------------------------------ the happy path

test('E2 verifies a registered synthetic proposal through three fresh replays with recomputed verdicts', async () => {
  const dir = tmp();
  const calls: string[] = [];
  const entry = await verifyRegisteredProposal(runOpts(dir, fakeRunner(honestPass, calls), fakeGit(fullTrees())));
  assert.deepEqual(calls, ['BASELINE#1', 'replay#1', 'replay#2', 'replay#3']);
  assert.equal(entry.status, 'VERIFIED');
  assert.equal(entry.replaysPassed, 3);
  assert.equal(entry.replaysAttempted, 3);
  assert.equal(entry.reason, null);
  assert.equal(entry.schemaVersion, 2);
  assert.equal(entry.kind, 'model-proposal-verification');
  assert.equal(entry.id, `MODEL-${RUN}`);
  assert.equal(entry.candidateId, modelProposalIdOf(V, RUN, CSS));
  assert.notEqual(entry.candidateId, candidateIdOf(V, CSS), 'identical CSS never inherits the PC-1 identity');
  assert.equal(entry.verificationSha, V);
  assert.equal(entry.sourceSha, SRC);
  assert.equal(entry.sourceProvenance, 'operator-reported');
  assert.equal(entry.fixtureTreeSource, FIXTURE_TREE);
  assert.equal(entry.fixtureTreeVerification, FIXTURE_TREE);
  assert.ok(entry.replays.every((e) => e.evidenceDir.startsWith(`MODEL-${RUN}/`)), 'evidence is namespaced away from hand-authored rows');
  assert.equal(entry.baseline.replay.evidenceDir, `MODEL-${RUN}/baseline/replay-1`);
  const nonces = new Set(entry.replays.map((e) => e.nonce));
  assert.equal(nonces.size, 3, 'three distinct nonces');
  const file = path.join(dir, 'out', `MODEL-${RUN}`, VERIFICATION_FILE);
  assert.ok(existsSync(file), 'the verification file is persisted');
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).candidateId, entry.candidateId);
  // Independent revalidation from the persisted bytes: no row problem.
  assert.deepEqual(await modelVerificationProblems(entry, V, path.join(dir, 'out')), []);
});

test('E2 records a failing baseline honestly: NOT_REPRODUCED, no replay runs', async () => {
  const dir = tmp();
  const calls: string[] = [];
  const entry = await verifyRegisteredProposal(
    runOpts(dir, fakeRunner((adj) => (adj.length === 0 ? { kind: 'pass' } : { kind: 'pass' }), calls), fakeGit(fullTrees())),
  );
  assert.deepEqual(calls, ['BASELINE#1']);
  assert.equal(entry.status, 'NOT_REPRODUCED');
  assert.equal(entry.replaysPassed, 0);
  assert.equal(entry.replaysAttempted, 0);
  assert.deepEqual(await modelVerificationProblems(entry, V, path.join(dir, 'out')), [], 'the honest recording revalidates');
});

test('E2 stops at the first non-clean replay and records PATCH_FAILED', async () => {
  const dir = tmp();
  const calls: string[] = [];
  let n = 0;
  const entry = await verifyRegisteredProposal(
    runOpts(dir, fakeRunner((_adj, isBase) => (isBase ? { kind: 'fail-baseline-sig' as Kind } : (++n <= 2 ? { kind: 'pass' as Kind } : { kind: 'desktop-fail' as Kind })), calls), fakeGit(fullTrees())),
  );
  assert.deepEqual(calls, ['BASELINE#1', 'replay#1', 'replay#2', 'replay#3'], 'three replays attempted, then stop');
  assert.equal(entry.status, 'PATCH_FAILED');
  assert.equal(entry.replaysPassed, 2);
  assert.match(entry.reason ?? '', /replay 3/, 'the failing replay is named');
  assert.deepEqual(await modelVerificationProblems(entry, V, path.join(dir, 'out')), []);
});

// ------------------------------------------------------------ refusal boundaries

test('E2 refuses everything before running: forgery, SHA mismatch, unknown revisions, drift', async () => {
  const git = fakeGit(fullTrees());
  const strict = async (over: Partial<Parameters<typeof verifyRegisteredProposal>[0]>, re: RegExp, name: string) => {
    const calls: string[] = [];
    await assert.rejects(verifyRegisteredProposal(runOpts(tmp(), fakeRunner(honestPass, calls), git, undefined, over)), re, name);
    assert.deepEqual(calls, [], `${name}: the runner never ran`);
  };
  await strict({ proposal: { ...register() } }, /NOT_REGISTERED/, 'spread-copy forgery refused by identity');
  await strict({ proposal: 'not-an-object' }, /NOT_REGISTERED/, 'non-object proposal refused');
  await strict({ verificationSha: 'd'.repeat(40) }, /SHA_MISMATCH/, 'revision rebound away from the registration');
  await strict({ verificationSha: 'zz' }, /BAD_SHA/, 'malformed verification SHA');
  await strict({ sourceSha: 'zz' }, /BAD_SHA/, 'malformed source SHA');
  await strict({ inputSha256: H1.slice(0, 63) }, /BAD_SHA/, 'malformed input hash');
  // Source equal to verification is conflated even when the registration agrees with it.
  const regAtSrc = registerModelProposal({
    triples: PC1.map((a) => ({ ...a })), renderedCss: CSS, runId: RUN, approvedSha: SRC,
    sourceSha: SRC, inputSha256: H1, artifactSha256: H2,
  });
  {
    const calls: string[] = [];
    await assert.rejects(
      verifyRegisteredProposal(runOpts(tmp(), fakeRunner(honestPass, calls), git, regAtSrc, { verificationSha: SRC, sourceSha: SRC })),
      /CONFLATED/,
      'source equal to verification is refused',
    );
    assert.deepEqual(calls, [], 'conflated: the runner never ran');
  }
  // Unknown revisions, non-ancestry, unresolvable anchors and drift use dedicated fakes.
  for (
    const [name, g, re] of [
      ['non-ancestor source', fakeGit(fullTrees(), false), /NOT_ANCESTOR/],
      ['unresolvable anchor', fakeGit({}, true), /ANCHOR_UNRESOLVABLE/],
    ] as const
  ) {
    const calls: string[] = [];
    await assert.rejects(verifyRegisteredProposal(runOpts(tmp(), fakeRunner(honestPass, calls), g)), re, name);
    assert.deepEqual(calls, [], `${name}: the runner never ran`);
  }
  const drifted = fullTrees();
  drifted[`${V}:fixtures/sample-store`] = OTHER_TREE;
  {
    const calls: string[] = [];
    await assert.rejects(
      verifyRegisteredProposal(runOpts(tmp(), fakeRunner(honestPass, calls), fakeGit(drifted))),
      /ANCHOR_DRIFT/,
      'fixture drift between anchors is refused',
    );
    assert.deepEqual(calls, [], 'drift: the runner never ran');
  }
  const noSource = fakeGit(fullTrees());
  noSource.commitExists = async (sha) => sha === V;
  {
    const calls: string[] = [];
    await assert.rejects(
      verifyRegisteredProposal(runOpts(tmp(), fakeRunner(honestPass, calls), noSource)),
      /UNKNOWN_SOURCE/,
      'missing source commit is refused',
    );
    assert.deepEqual(calls, [], 'unknown source: the runner never ran');
  }
  // The forgery refusal carries the E1 identity error, not a verification code.
  await assert.rejects(
    verifyRegisteredProposal(runOpts(tmp(), fakeRunner(honestPass, []), git, { ...register() })),
    (e: unknown) => e instanceof ModelProposalError && e.code === 'NOT_REGISTERED',
    'forgery is an identity refusal',
  );
});

test('E2 revalidation catches tampered evidence, duplicate nonces and forged verdicts', async () => {
  const dir = tmp();
  const outDir = path.join(dir, 'out');
  const entry = await verifyRegisteredProposal(runOpts(dir, fakeRunner(honestPass), fakeGit(fullTrees())));
  assert.deepEqual(await modelVerificationProblems(entry, V, outDir), [], 'baseline: honest entry verifies');
  // Tampered replay bytes fail the hash binding.
  const recPath = path.join(outDir, `MODEL-${RUN}`, 'replay-2', RECORD_FILE);
  writeFileSync(recPath, `${readFileSync(recPath, 'utf8')} `);
  assert.match((await modelVerificationProblems(entry, V, outDir)).join(' | '), /record hash mismatch/, 'tampered bytes caught');
  // A duplicated nonce can never verify: force the collision deterministically by rewriting
  // one persisted nonce to match another, then revalidate from the persisted bytes.
  const forceDup = async () => {
    const d = tmp();
    const e = await verifyRegisteredProposal(runOpts(d, fakeRunner(honestPass), fakeGit(fullTrees())));
    const o = path.join(d, 'out');
    const nonces = e.replays.map((r) => r.nonce);
    assert.equal(new Set(nonces).size, 3, 'precondition: distinct nonces');
    const p2 = path.join(o, `MODEL-${RUN}`, 'replay-2', RECORD_FILE);
    const raw = JSON.parse(readFileSync(p2, 'utf8')) as CandidateRecord;
    raw.manifest!.candidateCss.nonce = nonces[0]!;
    writeFileSync(p2, JSON.stringify(raw));
    return { e, o };
  };
  const { e: dupEntry, o: dupOut } = await forceDup();
  const dupProblems = await modelVerificationProblems(dupEntry, V, dupOut);
  assert.ok(dupProblems.some((x) => /not match the persisted record|replays were not fresh/.test(x)), `duplicate nonce caught: ${dupProblems.join(' | ')}`);
  // A zero-evidence VERIFIED claim is rejected four ways.
  const forged = { ...dupEntry, replays: [], replaysAttempted: 3, replaysPassed: 3, status: 'VERIFIED', reason: null };
  const forgedProblems = (await modelVerificationProblems(forged, V, dupOut)).join(' | ');
  assert.match(forgedProblems, /replaysAttempted 3 does not match 0 replay/, 'attempt count mismatch');
  assert.match(forgedProblems, /truncated or padded/, 'truncation mismatch');
  assert.match(forgedProblems, /row says VERIFIED but the evidence gives INCONCLUSIVE/, 'verdict mismatch');
  assert.match(forgedProblems, /VERIFIED without 3\/3 replays/, 'explicit never-VERIFIED-without-evidence rule');
  // Malformed provenance classes are refused.
  for (const [mut, re] of [
    [(r: ModelVerificationEntry) => { r.provenance = 'hand-authored-control' as never; }, /expected "model-proposal"/],
    [(r: ModelVerificationEntry) => { r.kind = 'model-proposal' as never; }, /expected "model-proposal-verification"/],
    [(r: ModelVerificationEntry) => { r.schemaVersion = 1 as never; }, /unsupported model-verification schema version/],
    [(r: ModelVerificationEntry) => { r.sourceProvenance = 'verified' as never; }, /operator-reported/],
    [(r: ModelVerificationEntry) => { r.verificationSha = SRC; }, /not bound to the scoreboard approved SHA/],
  ] as const) {
    const row = JSON.parse(JSON.stringify(dupEntry)) as ModelVerificationEntry;
    mut(row);
    assert.match((await modelVerificationProblems(row, V, dupOut)).join(' | '), re, 'malformed provenance class refused');
  }
});

// ------------------------------------------------------------ scoreboard integration

test('E2 scoreboard: verification rows verify from persisted evidence; collisions and labels enforced', async () => {
  const dir = tmp();
  const outDir = path.join(dir, 'out');
  const entry = await verifyRegisteredProposal(runOpts(dir, fakeRunner(honestPass), fakeGit(fullTrees())));
  const boardFor = (label: string, verifications: unknown[], candidates: unknown[] = []) => ({
    schemaVersion: 1,
    label,
    complete: true,
    approvedSha: V,
    createdAt: '2026-10-30T00:00:00.000Z',
    modelOrProviderCalls: 0,
    modalCalls: 0,
    baseline: {
      reproduced: false,
      reasons: ['baseline evidence unavailable'],
      replay: { n: 1, evidenceDir: 'BASELINE/replay-1', recordSha256: 'x'.repeat(64) },
    },
    candidates,
    nc5: nc5Of(V, []),
    notes: [],
    modelVerifications: verifications,
  });
  const dirFor = (board: unknown) => {
    writeFileSync(path.join(outDir, SCOREBOARD_FILE), JSON.stringify(board));
    return outDir;
  };
  const truthful = await verifyScoreboard(dirFor(boardFor(MODEL_VERIFICATION_LABEL, [entry])));
  assert.ok(!truthful.some((x) => x.includes('model-verification')), `truthful verification board: ${truthful.join(' | ')}`);
  // A model row with the hand-authored candidate id collides with the PC-1 row.
  const handId = candidateIdOf(V, CSS);
  const colliding = await verifyScoreboard(
    dirFor(boardFor(MODEL_VERIFICATION_LABEL, [{ ...entry, candidateId: handId }], [{ id: 'PC-1', candidateId: handId }])),
  );
  assert.ok(
    colliding.some((x) => /model-verification\[0\].*(provenance-tagged identity|collides with a hand-authored row)/.test(x)),
    `identity collision caught: ${colliding.join(' | ')}`,
  );
  // Wrong label for verification rows.
  const wrongLabel = await verifyScoreboard(dirFor(boardFor(MODEL_VERIFICATION_LABEL.replace('VERIFICATION', 'X') as never, [entry])));
  assert.ok(wrongLabel.some((x) => x.includes('model-verification label')), `wrong label caught: ${wrongLabel.join(' | ')}`);
  // E1 rows keep verifying unchanged beside E2 rows under the verification label.
  const e1row = modelProposalEntryOf(register());
  const bothBoard = {
    schemaVersion: 1,
    label: MODEL_VERIFICATION_LABEL,
    complete: true,
    approvedSha: V,
    createdAt: '2026-10-30T00:00:00.000Z',
    modelOrProviderCalls: 0,
    modalCalls: 0,
    baseline: {
      reproduced: false,
      reasons: ['baseline evidence unavailable'],
      replay: { n: 1, evidenceDir: 'BASELINE/replay-1', recordSha256: 'x'.repeat(64) },
    },
    candidates: [],
    nc5: nc5Of(V, []),
    notes: [],
    modelProposals: [e1row],
    modelVerifications: [entry],
  };
  const both = await verifyScoreboard(dirFor(bothBoard));
  assert.ok(!both.some((x) => x.includes('model-proposal[')), `E1 row unchanged beside E2: ${both.join(' | ')}`);
  assert.ok(!both.some((x) => x.includes('model-verification')), `E2 row verifies beside E1: ${both.join(' | ')}`);
});

// ------------------------------------------------------------ operator command: hard-disabled real artifact

const SCRIPT = path.join(ROOT, 'scripts/c3-b2b-verify-proposal.ts');
const runCli = (args: string[], extraEnv: Record<string, string> = {}): { status: number; output: string } => {
  try {
    const out = execFileSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, timeout: 90000, encoding: 'utf8', env: { ...process.env, ...extraEnv } });
    return { status: 0, output: String(out) };
  } catch (e) {
    const err = e as { status?: number; stdout?: unknown; stderr?: unknown };
    return { status: err.status ?? -1, output: `${String(err.stdout ?? '')}\n${String(err.stderr ?? '')}` };
  }
};
const ARGS = (runId: string) => ['--run-id', runId, '--source-sha', SRC, '--source-fixture-tree', FIXTURE_TREE, '--source-analysis-id', 'synthetic-e2', '--verification-sha', V];

test('E2 command refuses the real stored artifact before any read, even with credentials present', () => {
  const envs: Record<string, string>[] = [{}, { META_API_KEY: 'fake-key', PROOFPILOT_ALLOW_ANYTHING: '1', MODAL_TOKEN: 'fake' }];
  for (const extra of envs) {
    const r = runCli(ARGS('c3-live-meta-001'), extra);
    assert.equal(r.status, 2, `real artifact refused (env ${Object.keys(extra).join(',') || 'clean'})`);
    assert.match(r.output, /HARD-DISABLED/, 'the hard-disable message names the block');
  }
  const c3b2b = path.join(ROOT, '.proofpilot/c3-b2b');
  const leaked = existsSync(c3b2b) ? readdirSync(c3b2b).filter((f) => f.includes('c3-live-meta-001')) : [];
  assert.deepEqual(leaked, [], 'no evidence dir is created for the real artifact');
});

test('E2 command refuses malformed input and missing artifacts without staging', () => {
  const badId = runCli(ARGS('bad id!'));
  assert.equal(badId.status, 2);
  assert.match(badId.output, /run id is malformed|refused/, 'bad run id refused');
  const missing = runCli(ARGS('e2-no-such-run'));
  assert.equal(missing.status, 2, 'missing artifact refused');
  const badSha = runCli(['--run-id', 'e2-no-such-run', '--source-sha', 'zz', '--source-fixture-tree', FIXTURE_TREE, '--source-analysis-id', 'x', '--verification-sha', V]);
  assert.equal(badSha.status, 2, 'malformed SHA refused');
  const help = runCli(['--help']);
  assert.equal(help.status, 0, 'help exits cleanly');
  assert.match(help.output, /--run-id.*--source-sha.*--verification-sha/s, 'usage lists the narrow surface');
});
