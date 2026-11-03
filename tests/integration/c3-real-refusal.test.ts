// C3 real-run refusal drill on the exact command surface: the reserved real id refuses with
// exit 2 and zero evidence, zero stage, zero lock at the code HEAD V (no authorization record
// exists there by design). Synthetic fixtures are untouched; no provider is contacted.
//
// The second half runs the REAL `refuseUnlessRealRunAuthorized` gate (not a re-implementation)
// against disposable synthetic git repos: the reviewed command file itself is copied into a
// temp checkout, so a CLI regression in git observation, record parsing, parent binding, the
// diff allow-list or CLI-value comparison fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts/c3-b2b-verify-authenticated.ts');
const SRC = '4'.repeat(40);
const TREE = 'b'.repeat(40);
const V = 'c'.repeat(40);

const runCli = (args: string[], cwd: string): { status: number | null; output: string } => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8', timeout: 120000 });
  return { status: r.status, output: `${String(r.stdout ?? '')}\n${String(r.stderr ?? '')}` };
};
const ARGS = (runId: string) => ['--run-id', runId, '--source-sha', SRC, '--source-fixture-tree', TREE, '--source-analysis-id', 'synthetic-refusal-001', '--verification-sha', V];

test('refusal drill: the real run id exits 2 with zero evidence and zero stage at V', () => {
  const before = new Set(
    existsSync(path.join(ROOT, '.proofpilot/c3-b2b')) ? readdirSync(path.join(ROOT, '.proofpilot/c3-b2b')) : [],
  );
  const r = runCli(ARGS('c3-live-meta-001'), mkdtempSync(path.join(os.tmpdir(), 'pp-c3-refusal-')));
  assert.equal(r.status, 2, `real id refused: ${r.output.slice(-500)}`);
  assert.match(r.output, /HARD-DISABLED/, 'the refusal carries the hard-disable message at V');
  const after = existsSync(path.join(ROOT, '.proofpilot/c3-b2b')) ? readdirSync(path.join(ROOT, '.proofpilot/c3-b2b')) : [];
  assert.deepEqual(
    after.filter((f) => !before.has(f) && f.includes('c3-live-meta-001')),
    [],
    'no evidence directory is created for the real artifact',
  );
});

test('refusal drill: malformed invocation and missing stages refuse before any work', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pp-c3-refusal-'));
  const missing = runCli(ARGS('c3-live-meta-001').slice(0, 2), dir);
  assert.equal(missing.status, 2, 'missing flags refuse');
  const badSha = runCli(['--run-id', 'c3-live-meta-001', '--source-sha', 'zz', '--source-fixture-tree', TREE, '--source-analysis-id', 'x', '--verification-sha', V], dir);
  assert.equal(badSha.status, 2, 'malformed SHA refuses before any gate');
  const unknownSynthetic = runCli(ARGS('c3-test-no-such-run'), dir);
  assert.equal(unknownSynthetic.status, 2, 'a missing synthetic artifact refuses without staging');
});

// ------------------------------------------------- the real gate on disposable git repos

const GATE_ANALYSIS = 'synthetic-gate-001';
const REAL_ID = 'c3-live-meta-001';
const sha256Hex = (b: string | Buffer) => createHash('sha256').update(b).digest('hex');
const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, encoding: 'utf8', timeout: 30000 }).trim();

const gateRecord = (v: string, rootsText: string, over: Record<string, string> = {}): string => JSON.stringify({
  runId: REAL_ID,
  artifactSha256: 'a'.repeat(64),
  verificationParentSha: v,
  trustRootsSha256: sha256Hex(rootsText),
  sourceSha: SRC,
  sourceFixtureTree: TREE,
  sourceAnalysisId: GATE_ANALYSIS,
  keyId: 'gate-test-key-01',
  approvalId: 'D-R1-gate-test-001',
  ...over,
});

type GateKind = 'valid' | 'dirty' | 'merge' | 'bad-parent' | 'extra-diff' | 'record-runid' | 'no-record';

/** Disposable git checkout running the REAL copied command: code at V, W per kind. */
const buildGateRepo = (kind: GateKind): { dir: string; script: string; v: string; cliSha: string } => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pp-c3-gate-'));
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'gate@test');
  git(dir, 'config', 'user.name', 'gate-test');
  cpSync(path.join(ROOT, 'packages'), path.join(dir, 'packages'), { recursive: true });
  cpSync(path.join(ROOT, 'package.json'), path.join(dir, 'package.json'));
  mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  cpSync(SCRIPT, path.join(dir, 'scripts/c3-b2b-verify-authenticated.ts'));
  writeFileSync(path.join(dir, '.gitignore'), '.proofpilot/\n');
  writeFileSync(path.join(dir, 'code.ts'), 'v\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'V');
  const v = git(dir, 'rev-parse', 'HEAD');
  const rootsText = '{"version":1,"keys":[]}';
  const recordText = gateRecord(v, rootsText, kind === 'bad-parent' ? { verificationParentSha: '0'.repeat(40) } : kind === 'record-runid' ? { runId: 'c3-test-source-001' } : {});
  if (kind === 'no-record') return { dir, script: path.join(dir, 'scripts/c3-b2b-verify-authenticated.ts'), v, cliSha: v };
  if (kind === 'merge') {
    writeFileSync(path.join(dir, 'config-roots.json'), rootsText);
    writeFileSync(path.join(dir, 'config-record.json'), recordText);
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'W1-record');
    const main = git(dir, 'rev-parse', '--abbrev-ref', 'HEAD');
    git(dir, 'checkout', '-qb', 'side');
    writeFileSync(path.join(dir, 'code.ts'), 'v\nside\n');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'side');
    git(dir, 'checkout', '-q', main);
    git(dir, 'merge', '--no-ff', 'side', '-m', 'merge');
    mkdirSync(path.join(dir, 'config'));
    writeFileSync(path.join(dir, 'config', 'c3-real-run-authorization.json'), recordText);
    writeFileSync(path.join(dir, 'config', 'artifact-trust-roots.json'), rootsText);
  } else {
    mkdirSync(path.join(dir, 'config'));
    writeFileSync(path.join(dir, 'config', 'c3-real-run-authorization.json'), recordText);
    writeFileSync(path.join(dir, 'config', 'artifact-trust-roots.json'), rootsText);
    if (kind === 'extra-diff') writeFileSync(path.join(dir, 'extra.txt'), 'not allow-listed\n');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-qm', 'W');
    if (kind === 'dirty') writeFileSync(path.join(dir, 'code.ts'), 'v\ndirty\n');
    if (kind === 'valid') {
      // Dummy sidecars so the gate can read them; Zone P refuses the missing artifact next,
      // which proves the gate passed. The directory is gitignored, so the tree stays clean.
      const sidecars = path.join(dir, '.proofpilot/evidence/proposals', REAL_ID);
      mkdirSync(sidecars, { recursive: true });
      writeFileSync(path.join(sidecars, 'auth-manifest.json'), '{}');
      writeFileSync(path.join(sidecars, 'auth-manifest.sig'), 'x');
    }
  }
  const cliSha = kind === 'bad-parent' ? '0'.repeat(40) : v;
  return { dir, script: path.join(dir, 'scripts/c3-b2b-verify-authenticated.ts'), v, cliSha };
};

const gateArgs = (cliSha: string, over: Record<string, string> = {}): string[] => [
  '--run-id', REAL_ID,
  '--source-sha', over['sourceSha'] ?? SRC,
  '--source-fixture-tree', over['sourceFixtureTree'] ?? TREE,
  '--source-analysis-id', over['sourceAnalysisId'] ?? GATE_ANALYSIS,
  '--verification-sha', over['verificationSha'] ?? cliSha,
];

const runGate = (kind: GateKind, over: Record<string, string> = {}): { status: number | null; output: string } => {
  const { dir, script, cliSha } = buildGateRepo(kind);
  const r = spawnSync(process.execPath, [script, ...gateArgs(cliSha, over)], { cwd: dir, encoding: 'utf8', timeout: 120000 });
  return { status: r.status, output: `${String(r.stdout ?? '')}\n${String(r.stderr ?? '')}` };
};

test('real gate on disposable repos: no record, dirty tree and merge commits refuse', () => {
  const absent = runGate('no-record');
  assert.equal(absent.status, 2, `no record refuses: ${absent.output.slice(-300)}`);
  assert.match(absent.output, /HARD-DISABLED/, 'the V state carries the hard-disable message');
  const dirty = runGate('dirty');
  assert.equal(dirty.status, 2, `dirty tree refuses: ${dirty.output.slice(-300)}`);
  assert.match(dirty.output, /DIRTY_TREE/, 'a dirty checkout never reaches the artifact');
  const merge = runGate('merge');
  assert.equal(merge.status, 2, `merge commit refuses: ${merge.output.slice(-300)}`);
  assert.match(merge.output, /NOT_SINGLE_PARENT/, 'a two-parent HEAD is unrunnable');
});

test('real gate on disposable repos: non-parent V, extra diff and foreign run ids refuse', () => {
  const badParent = runGate('bad-parent');
  assert.equal(badParent.status, 2, `non-parent V refuses: ${badParent.output.slice(-300)}`);
  assert.match(badParent.output, /NOT_PARENT_CHILD/, 'parent binding is enforced against real git');
  const extra = runGate('extra-diff');
  assert.equal(extra.status, 2, `extra diff refuses: ${extra.output.slice(-300)}`);
  assert.match(extra.output, /DIFF_NOT_ALLOWLISTED/, 'the diff allow-list is enforced against real git');
  const foreign = runGate('record-runid');
  assert.equal(foreign.status, 2, `foreign run id refuses: ${foreign.output.slice(-300)}`);
  assert.match(foreign.output, /HARD-DISABLED/, 'a record for another run never authorizes this one');
});

test('real gate on disposable repos: each mismatched CLI value refuses before artifact access', () => {
  for (
    const [name, over] of [
      ['source revision', { sourceSha: '0'.repeat(40) }],
      ['fixture tree', { sourceFixtureTree: SRC }],
      ['analysis id', { sourceAnalysisId: 'something-else' }],
      ['verification revision', { verificationSha: '1'.repeat(40) }],
    ] as const
  ) {
    const r = runGate('valid', over as unknown as Record<string, string>);
    assert.equal(r.status, 2, `${name} mismatch refuses: ${r.output.slice(-300)}`);
    assert.match(r.output, /RECORD_MISMATCH/, `${name}: the CLI value is checked against the record`);
  }
});

test('real gate on disposable repos: a fully consistent child passes the gate into Zone P', () => {
  const r = runGate('valid');
  assert.equal(r.status, 2, `gate passage still refuses without an artifact: ${r.output.slice(-300)}`);
  assert.match(r.output, /no proposal artifact/, 'the refusal comes from Zone P artifact loading, past the gate');
  assert.doesNotMatch(
    r.output,
    /HARD-DISABLED|NOT_SINGLE_PARENT|DIRTY_TREE|NOT_PARENT_CHILD|DIFF_NOT_ALLOWLISTED|RECORD_MISMATCH/,
    'no gate code fires on the fully consistent child',
  );
});
