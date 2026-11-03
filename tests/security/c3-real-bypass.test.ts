// C3 real-run bypass resistance: direct calls, importer allow-list, guard-removal mutants,
// and single-use consumption across the exported E2 boundary.
//
// Synthetic only: test keys are generated in memory per run; the real stored proposal is never
// read, no browser runs, no provider is contacted. A fake stage runner and a fake Git stand in
// for the browser and the repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isRealRunAuthorized,
  mintSingleUseRealAuthorization,
  ModelAuthorizationError,
  REAL_ARTIFACT_RUN_ID,
} from '../../packages/core/src/model-real-authorization.ts';
import {
  candidateIdOf,
  finalizeEvidence,
  modelProposalIdOf,
  ModelVerificationError,
  registerModelProposal,
  renderCssAdjustments,
  verifyRegisteredProposal,
  type CandidateRecord,
  type CssAdjustment,
  type ModelGit,
  type Runner,
} from '../../packages/core/src/index.ts';
import { manifestTextFor, TEST_ANALYSIS_ID } from '../support/artifact-auth-fixture.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const V = '3'.repeat(40);
const SRC = '4'.repeat(40);
const H1 = 'd'.repeat(64);
const H2 = 'e'.repeat(64);
const TREE = 'f'.repeat(40);
const PC1: CssAdjustment[] = [{ selector: '.promo-overlay', property: 'pointer-events', value: 'none' }];
const CSS = renderCssAdjustments(PC1);
const sha256Hex = (b: string | Buffer) => createHash('sha256').update(b).digest('hex');
const tmp = (p = 'pp-c3-bypass-') => mkdtempSync(path.join(os.tmpdir(), p));
const KEY_ID = 'c3-real-bypass-test-01';
const REQUIRED = ['oracle-report.json', 'oracle-stdout.txt', 'a/obs-m.json', 'a/trace-m.zip', 'b/obs-d.json', 'b/trace-d.zip'];
const TRUSTED = { 'verifier/f01/f01.oracle.spec.ts': { gitBlob: 'b'.repeat(40), sha256: 'c'.repeat(64), bytes: 10 } };
let nonceCounter = 0;

type Kind = 'pass' | 'fail-baseline-sig';
function record(sha: string, adjustments: CssAdjustment[], kind: Kind): CandidateRecord {
  const css = renderCssAdjustments(adjustments);
  const nonce = `bypass-${++nonceCounter}`;
  const cssSha = sha256Hex(`css:${css}:${nonce}`);
  const pass = kind === 'pass';
  const t = (ok: boolean) => ({ status: ok ? 'passed' : 'failed', hitTestTarget: ok ? 'add-to-cart' : 'promo-overlay', cartCountAfter: ok ? '1' : '0' });
  const proof = (n: string) => ({ test: n, served: true, bytesEqualStaged: true, hasNonce: true, servedSha256: cssSha });
  return {
    schemaVersion: 1, label: 'x', approvedSha: sha, outcome: pass ? 'ORACLE_PASS' : 'PATCH_FAILED', failure: null, oracleRan: true, oracleExitCode: pass ? 0 : 1,
    adjustments, renderedCss: css,
    manifest: { approvedSha: sha, trusted: TRUSTED, candidateCss: { path: 'p', sha256: cssSha, bytes: 1, nonce }, dependencies: { files: 1, sha256: 'd'.repeat(64) }, workspaceConfig: 'none present at the approved SHA' },
    mobile: t(pass), desktop: t(true), baselineIdentical: !pass,
    sourceProof: [proof('F01-MOBILE'), proof('F01-DESKTOP')], integrityAfterRun: 'intact', stageRemoved: true,
    requiredEvidence: [...REQUIRED], evidence: [], evidenceFinalized: true,
  };
}

const honest: Runner = (async (opts: Parameters<Runner>[0]) => {
  const isBaseline = opts.evidenceDir.includes(`${path.sep}baseline${path.sep}`) || opts.evidenceDir.includes('/baseline/');
  const rec = record(opts.approvedSha, [...opts.adjustments], isBaseline ? 'fail-baseline-sig' : 'pass');
  rec.label = opts.label;
  mkdirSync(opts.evidenceDir, { recursive: true });
  for (const f of REQUIRED) {
    mkdirSync(path.dirname(path.join(opts.evidenceDir, f)), { recursive: true });
    writeFileSync(path.join(opts.evidenceDir, f), `${opts.label} ${f}\n`);
  }
  await finalizeEvidence(rec, opts.evidenceDir, { hashFile: async (f) => { const b = readFileSync(f); return { sha256: sha256Hex(b), bytes: b.length }; }, writeRecord: async (f, t) => writeFileSync(f, t) });
  return rec;
}) as Runner;

const fakeGit: ModelGit = {
  commitExists: async () => true,
  isAncestor: async () => true,
  treeOf: async () => TREE,
};

const attestation = () => ({
  sourceHead: SRC,
  verificationHead: V,
  sourceFixtureTree: TREE,
  sourceAnalysisId: 'synthetic-bypass',
  inputSha256: H1,
  artifactInputSha256: H1,
  artifactHash: H2,
  ancestryOk: true,
  treesEqual: true,
  classes: {
    sourceHead: 'operator-reported',
    sourceFixtureTree: 'operator-reported',
    sourceAnalysisId: 'operator-reported',
    verificationHead: 'operator-reported',
    inputSha256: 'recomputed',
    artifactInputSha256: 'local-file',
    artifactHash: 'local-file',
    ancestryOk: 'local-git',
    treesEqual: 'local-git',
  },
});

const realProposal = () => registerModelProposal({
  triples: PC1.map((a) => ({ ...a })),
  renderedCss: CSS,
  runId: REAL_ARTIFACT_RUN_ID,
  approvedSha: V,
  sourceSha: SRC,
  inputSha256: H1,
  artifactSha256: H2,
});

const runOpts = (root: string, proposal = realProposal()) => ({
  repoRoot: root,
  verificationSha: V,
  sourceSha: SRC,
  inputSha256: H1,
  artifactSha256: H2,
  proposal,
  outDir: path.join(root, 'out'),
  lockPath: path.join(root, 'stage.lock'),
  coordinatorLockPath: path.join(root, 'coord.lock'),
  git: fakeGit,
  runner: honest,
  sourceAttestation: attestation(),
});

/** Fully consistent synthetic mint inputs for the reserved real id. */
const mintSetup = () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeySpkiBase64 = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  const trustRootsText = JSON.stringify({
    version: 1,
    keys: [{ keyId: KEY_ID, algorithm: 'ed25519', publicKeySpkiBase64, status: 'active' }],
  });
  const manifest = {
    authVersion: 1 as const,
    keyId: KEY_ID,
    runId: REAL_ARTIFACT_RUN_ID,
    artifactSha256: H2,
    inputSha256: H1,
    sourceSha: SRC,
    sourceFixtureTree: TREE,
    sourceAnalysisId: 'synthetic-bypass',
  };
  const manifestText = manifestTextFor(manifest);
  const canonical: Record<string, unknown> = {};
  for (const k of Object.keys(manifest).sort()) canonical[k] = manifest[k as keyof typeof manifest];
  const signatureText = sign(
    null,
    Buffer.from(`PP-ARTIFACT-AUTH-v1\n${JSON.stringify(canonical)}`, 'utf8'),
    privateKey,
  ).toString('base64');
  const record = {
    runId: REAL_ARTIFACT_RUN_ID,
    artifactSha256: H2,
    verificationParentSha: V,
    trustRootsSha256: sha256Hex(trustRootsText),
    sourceSha: SRC,
    sourceFixtureTree: TREE,
    sourceAnalysisId: 'synthetic-bypass',
    keyId: KEY_ID,
    approvalId: 'D-R1-synthetic-bypass',
  };
  return {
    args: {
      proposal: realProposal(),
      manifestText,
      signatureText,
      trustRootsText,
      recordText: JSON.stringify(record),
      cliValues: {
        runId: REAL_ARTIFACT_RUN_ID,
        sourceSha: SRC,
        sourceFixtureTree: TREE,
        sourceAnalysisId: 'synthetic-bypass',
        verificationSha: V,
      },
      observed: {
        head: '9'.repeat(40),
        parent: V,
        parentCount: 1,
        clean: true,
        diffNames: ['config/artifact-trust-roots.json', 'config/c3-real-run-authorization.json'],
      },
    },
  };
};

const codeOf = async (fn: () => unknown): Promise<string> => {
  try {
    await fn();
    return 'NO_ERROR';
  } catch (e) {
    if (e instanceof ModelVerificationError) return `E2:${e.code}`;
    if (e instanceof ModelAuthorizationError) return `MINT:${e.code}`;
    return `OTHER:${(e as Error).message}`;
  }
};

// ------------------------------------------------------------ direct-call default-deny

test('bypass: a direct call with the real id and no minted membership throws REAL_ARTIFACT_DISABLED', async () => {
  const dir = tmp();
  const code = await codeOf(() => verifyRegisteredProposal(runOpts(dir)));
  assert.equal(code, 'E2:REAL_ARTIFACT_DISABLED');
  assert.ok(!existsSync(path.join(dir, 'out')), 'no evidence directory is created');
  assert.ok(!existsSync(path.join(dir, 'coord.lock')), 'no lock is taken');
});

// ------------------------------------------------------------ single-use across the boundary

test('bypass: one mint admits exactly one run; the retry refuses without a fresh gate', async () => {
  const dir = tmp();
  const s = mintSetup();
  mintSingleUseRealAuthorization(s.args);
  const entry = await verifyRegisteredProposal(runOpts(dir, s.args.proposal));
  assert.equal(entry.status, 'VERIFIED', 'the minted synthetic run verifies');
  assert.equal(entry.candidateId, modelProposalIdOf(V, REAL_ARTIFACT_RUN_ID, CSS), 'provenance-tagged identity, never PC-1');
  assert.notEqual(entry.candidateId, candidateIdOf(V, CSS), 'identical CSS never inherits the PC-1 identity');
  assert.ok(existsSync(path.join(dir, 'out', `MODEL-${REAL_ARTIFACT_RUN_ID}`)), 'evidence is namespaced away from hand-authored rows');
  const retry = await codeOf(() => verifyRegisteredProposal(runOpts(tmp(), s.args.proposal)));
  assert.equal(retry, 'E2:REAL_ARTIFACT_DISABLED', 'the consumed membership cannot be replayed');
});

// ------------------------------------------------------------ importer allow-list

const stripComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');

test('bypass: the mint module has a minimal direct edge and Zone E stays separate', () => {
  const f = 'packages/core/src/model-real-authorization.ts';
  const text = stripComments(readFileSync(path.join(ROOT, f), 'utf8'));
  const specs = [...new Set([...text.matchAll(/from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!))].sort();
  assert.deepEqual(specs, ['./model-proposal.ts', 'node:crypto'], 'no other module edge out of the mint module');
  assert.doesNotMatch(text, /import\s*\(|require\s*\(/, 'no dynamic import or require in the mint module');
  assert.doesNotMatch(text, /node:fs|node:child_process|process\.env|process\.argv/, 'no filesystem, process or environment capability');
  assert.doesNotMatch(text, /inference\/src|packages\/provenance|provenance-input/, 'the mint closure reaches no inference or provenance file');
});

test('bypass: the mint module importers are exactly the allow-list', () => {
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      if (name.name === 'node_modules') continue;
      const p = path.join(dir, name.name);
      if (name.isDirectory()) { walk(p); continue; }
      if (!p.endsWith('.ts')) continue;
      if (readFileSync(p, 'utf8').includes('model-real-authorization')) hits.push(path.relative(ROOT, p));
    }
  };
  walk(path.join(ROOT, 'packages'));
  walk(path.join(ROOT, 'scripts'));
  assert.deepEqual(hits.sort(), [
    'packages/core/src/model-verification.ts',
    'scripts/c3-b2b-verify-authenticated.ts',
  ]);
});

test('bypass: the E2 module consults the mint predicate at the real-id boundary', () => {
  const text = stripComments(readFileSync(path.join(ROOT, 'packages/core/src/model-verification.ts'), 'utf8'));
  assert.match(text, /from '\.\/model-real-authorization\.ts'/, 'the predicate edge exists (mutant: deleted membership check is caught here)');
  assert.match(text, /isRealRunAuthorized/, 'the real-id branch consults the predicate');
  assert.match(text, /REAL_ARTIFACT_DISABLED/, 'the unminted path keeps its dedicated code');
  const specs = [...new Set([...text.matchAll(/from\s*['"]([^'"]+)['"]/g)].map((m) => m[1]!))].sort();
  assert.deepEqual(
    specs,
    ['./candidate-coordinator.ts', './candidate-stage.ts', './css-adjustments.ts', './model-proposal.ts', './model-real-authorization.ts', 'node:fs/promises', 'node:path'],
  );
});

// ------------------------------------------------------------ guard-removal mutants

test('bypass mutant M1: deleting the CLI parent/diff gate is caught by source order', () => {
  const text = stripComments(readFileSync(path.join(ROOT, 'scripts/c3-b2b-verify-authenticated.ts'), 'utf8'));
  const branchAt = text.indexOf('runId === REAL_ARTIFACT_RUN_ID');
  const gateAt = text.indexOf('refuseUnlessRealRunAuthorized()');
  const loadAt = text.indexOf('await loadAndAuthenticateProposalArtifact');
  assert.ok(branchAt !== -1 && gateAt !== -1 && loadAt !== -1, 'branch, gate and loader are all present');
  assert.ok(branchAt < gateAt && gateAt < loadAt, 'the real-id branch runs the gate before any artifact read');
  for (const needle of ["rev-list', '--parents'", "'--name-only'", 'status', '--porcelain', 'NOT_SINGLE_PARENT', 'DIRTY_TREE', 'DIFF_NOT_ALLOWLISTED']) {
    assert.ok(text.includes(needle), `CLI gate checks parent count, tree and diff (${needle})`);
  }
  assert.ok(text.indexOf('mintSingleUseRealAuthorization({') > loadAt, 'minting happens after authentication, before the run');
  assert.doesNotMatch(text, /--trust-roots|--approval|--auth-record|--allow-/, 'no approval/trust-root/bypass flags exist');
});

test('bypass mutant M2: deleting the mint signature re-verification is caught by crypto', async () => {
  const s = mintSetup();
  const other = generateKeyPairSync('ed25519');
  const manifest = JSON.parse(s.args.manifestText as string) as Record<string, unknown>;
  const canonical: Record<string, unknown> = {};
  for (const k of Object.keys(manifest).sort()) canonical[k] = manifest[k];
  const foreignSig = sign(null, Buffer.from(`PP-ARTIFACT-AUTH-v1\n${JSON.stringify(canonical)}`, 'utf8'), other.privateKey).toString('base64');
  const code = await codeOf(() => mintSingleUseRealAuthorization({ ...s.args, signatureText: foreignSig }));
  assert.equal(code, 'MINT:AUTH_SIGNATURE_INVALID', 'a parse-valid manifest with a foreign signature never mints');
  assert.equal(isRealRunAuthorized(s.args.proposal), false);
});

test('bypass mutant M4: deleting single-use consumption is caught by the second check', async () => {
  const s = mintSetup();
  mintSingleUseRealAuthorization(s.args);
  assert.equal(isRealRunAuthorized(s.args.proposal), true, 'first consumption succeeds');
  assert.equal(isRealRunAuthorized(s.args.proposal), false, 'second consumption refuses: already spent');
  // A busy-lock-style throw after consumption still spends the authorization.
  const t = mintSetup();
  mintSingleUseRealAuthorization(t.args);
  assert.equal(isRealRunAuthorized(t.args.proposal), true);
  const retry = await codeOf(() => verifyRegisteredProposal(runOpts(tmp(), t.args.proposal)));
  assert.equal(retry, 'E2:REAL_ARTIFACT_DISABLED', 'no retained authorization survives consumption');
});

test('bypass: synthetic fixtures can never reach the real-id path', async () => {
  const dir = tmp();
  const code = await codeOf(() => verifyRegisteredProposal(runOpts(dir, registerModelProposal({
    triples: PC1.map((a) => ({ ...a })),
    renderedCss: CSS,
    runId: 'c3-test-source-001',
    approvedSha: V,
    sourceSha: SRC,
    inputSha256: H1,
    artifactSha256: H2,
  }))));
  assert.notEqual(code, 'E2:REAL_ARTIFACT_DISABLED', 'synthetic ids take the normal path, not the real-id gate');
  assert.ok(!existsSync(path.join(dir, 'out', `MODEL-${REAL_ARTIFACT_RUN_ID}`)), 'no real-id evidence can come from a synthetic path');
  rmSync(dir, { recursive: true, force: true });
});
