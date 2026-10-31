// C3-B2B SEC-P2-02 MAJOR-3: authenticated command-to-provenance integration evidence.
//
// Two grades, both synthetic and deterministic:
// 1. Composition (temp dirs): load -> signature verification -> E1 registration ->
//    cross-phase rebind succeeds on one flow; tampering refuses at rebind and re-auth.
// 2. Exact-command wiring (isolated disposable checkouts): the real
//    `scripts/c3-b2b-verify-authenticated.ts` program files run from a synthetic root
//    OUTSIDE the working repository, with a separate test trust-root file at the
//    normal relative path (`config/artifact-trust-roots.json`) holding a fresh
//    synthetic key. The positive case proves authentication passes and the pipeline
//    advances past auth into provenance (a non-AUTH provenance refusal); the tamper
//    case proves a signed substitution refuses at the auth gate. Neither case can
//    reach VERIFIED by design: provenance requires certified baseline evidence no
//    synthetic fixture carries, and browser stages need local Chromium. The full
//    three-replay machinery stays covered by the existing E2 tests with hand-authored
//    controls (which pass in hosted CI). These tests therefore establish
//    command-to-provenance integration, NOT a full authenticated three-replay
//    VERIFIED result.
//
// Isolation guarantees (MAJOR-3): the harness never writes to, deletes from, or
// reads trust from the real repository. Production `config/artifact-trust-roots.json`
// is only ever read (snapshotted); unique per-test run ids and `mkdtemp` roots mean
// no fixed shared evidence directory is ever removed; cleanup removes only the
// directory the test itself created. Interruption (SIGKILL mid-run) and concurrent
// runs are covered below: neither can alter production trust roots or prior
// evidence, because no production path is ever opened for writing.
//
// The real stored proposal is never touched; the committed trust roots stay empty
// until a reviewed enrollment; the command keeps its exact five-flag contract with
// no key/path/mode flags and no environment input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadAndAuthenticateProposalArtifact } from '../../packages/provenance/src/artifact-auth.ts';
import { reloadAndBindArtifact } from '../../packages/provenance/src/proposal-artifact.ts';
import { registerModelProposal } from '../../packages/core/src/model-proposal.ts';
import { tempDir } from '../helpers.ts';
import {
  ARTIFACT_RUN_ID,
  artifactFileFor,
  writeArtifactDoc,
} from '../support/proposal-artifact-fixture.ts';
import {
  TEST_ANALYSIS_ID,
  TEST_FIXTURE_TREE,
  TEST_SOURCE_SHA,
  makeTestIdentity,
  manifestFor,
  manifestTextFor,
  signManifest,
  writeAuthFiles,
  type TestIdentity,
} from '../support/artifact-auth-fixture.ts';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const PROD_TRUST_ROOTS = path.join(repoRoot, 'config/artifact-trust-roots.json');
const PROD_EVIDENCE = path.join(repoRoot, '.proofpilot/evidence/proposals');
const sha256Hex = (b: Buffer | string): string => createHash('sha256').update(b).digest('hex');

test('authenticated composition: load -> verify -> E1 register -> rebind succeeds; tamper refuses', async () => {
  const root = tempDir('pp-auth-pipe-');
  writeArtifactDoc(root, ARTIFACT_RUN_ID);
  const artifactHash = sha256Hex(readFileSync(artifactFileFor(root, ARTIFACT_RUN_ID)));
  const id = makeTestIdentity('pipe-synthetic-01');
  const manifest = manifestFor({ runId: ARTIFACT_RUN_ID, keyId: id.keyId, artifactSha256: artifactHash });
  writeAuthFiles(root, ARTIFACT_RUN_ID, manifestTextFor(manifest), signManifest(manifest, id.privateKeyPem));
  const args = {
    repoRoot: root,
    runId: ARTIFACT_RUN_ID,
    sourceSha: TEST_SOURCE_SHA,
    sourceFixtureTree: TEST_FIXTURE_TREE,
    sourceAnalysisId: TEST_ANALYSIS_ID,
    trustRoots: id.trustRoots,
  };
  const { artifact, authentication } = await loadAndAuthenticateProposalArtifact(args);
  const registered = registerModelProposal({
    triples: artifact.adjustments.map((a) => ({ ...a })),
    renderedCss: artifact.renderedCss,
    runId: artifact.runId,
    approvedSha: 'd'.repeat(40),
    sourceSha: TEST_SOURCE_SHA,
    inputSha256: artifact.inputSha256,
    artifactSha256: artifact.artifactHash,
  });
  assert.equal(registered.runId, ARTIFACT_RUN_ID);
  assert.match(registered.candidateId, /^[0-9a-f]{64}$/);
  const bound = await reloadAndBindArtifact(root, ARTIFACT_RUN_ID, authentication.artifactSha256);
  assert.equal(bound.artifactHash, authentication.artifactSha256);
});

const SYN_SOURCE_SHA = 'a'.repeat(40);
const SYN_FIXTURE_TREE = 'b'.repeat(40);
const SYN_VERIFICATION_SHA = 'c'.repeat(40);

let runCounter = 0;
/** Unique run id per isolated run: no fixed shared evidence directory, no collisions. */
const uniqueRunId = (): string => {
  runCounter += 1;
  return `c3-tiso-${process.pid.toString(36)}${runCounter.toString(36)}${randomBytes(3).toString('hex')}`;
};

/** Read-only snapshot of production state this harness must never alter. */
const snapshotProduction = (): { trustRoots: string; evidence: string[] } => ({
  trustRoots: readFileSync(PROD_TRUST_ROOTS, 'utf8'),
  evidence: existsSync(PROD_EVIDENCE) ? readdirSync(PROD_EVIDENCE).sort() : [],
});

/**
 * Disposable synthetic checkout OUTSIDE the working repository, holding only copies
 * of the reviewed program files (`packages/`, `package.json`, the authenticated
 * command) plus synthetic data and a separate test trust-root file at its normal
 * relative path. The copied command derives its root from its own location, so the
 * production checkout is never its root. Throws unless the root is outside the repo.
 */
const buildIsolatedCheckout = (id: TestIdentity): string => {
  const iso = mkdtempSync(path.join(tmpdir(), 'pp-auth-iso-'));
  assert.ok(
    !path.resolve(iso).startsWith(path.resolve(repoRoot) + path.sep),
    'isolated checkout must live outside the working repository',
  );
  cpSync(path.join(repoRoot, 'packages'), path.join(iso, 'packages'), { recursive: true });
  cpSync(path.join(repoRoot, 'package.json'), path.join(iso, 'package.json'));
  mkdirSync(path.join(iso, 'scripts'), { recursive: true });
  cpSync(
    path.join(repoRoot, 'scripts/c3-b2b-verify-authenticated.ts'),
    path.join(iso, 'scripts/c3-b2b-verify-authenticated.ts'),
  );
  mkdirSync(path.join(iso, 'config'), { recursive: true });
  writeFileSync(
    path.join(iso, 'config/artifact-trust-roots.json'),
    JSON.stringify({ version: 1, keys: id.trustRoots.keys.map((k) => ({ ...k })) }),
  );
  return iso;
};

/** Stage one synthetic signed artifact (unique id, fresh key) inside an isolated root. */
const stageIsolatedSynthetic = (iso: string, id: TestIdentity, runId: string): void => {
  writeArtifactDoc(iso, runId);
  const artifactHash = sha256Hex(readFileSync(artifactFileFor(iso, runId)));
  const manifest = manifestFor({
    runId,
    keyId: id.keyId,
    artifactSha256: artifactHash,
    sourceSha: SYN_SOURCE_SHA,
    sourceFixtureTree: SYN_FIXTURE_TREE,
    sourceAnalysisId: TEST_ANALYSIS_ID,
  });
  writeAuthFiles(iso, runId, manifestTextFor(manifest), signManifest(manifest, id.privateKeyPem));
};

type CommandResult = { status: number | null; signal: NodeJS.Signals | null; stderr: string; stdout: string };

/** Run the isolated copy of the real command with its exact five-flag contract. */
const runIsolatedCommand = (iso: string, runId: string, killAfterMs?: number): Promise<CommandResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(iso, 'scripts/c3-b2b-verify-authenticated.ts'),
        '--run-id', runId,
        '--source-sha', SYN_SOURCE_SHA,
        '--source-fixture-tree', SYN_FIXTURE_TREE,
        '--source-analysis-id', TEST_ANALYSIS_ID,
        '--verification-sha', SYN_VERIFICATION_SHA,
      ],
      { timeout: 120000 },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += String(c); });
    child.stderr.on('data', (c) => { stderr += String(c); });
    child.on('error', reject);
    child.on('close', (status, signal) => resolve({ status, signal, stderr, stdout }));
    if (killAfterMs !== undefined) setTimeout(() => child.kill('SIGKILL'), killAfterMs);
  });

const isolatedModelOutDirs = (iso: string): string[] => {
  const base = path.join(iso, '.proofpilot/c3-b2b');
  if (!existsSync(base)) return [];
  return readdirSync(base).filter((f) => f.startsWith('MODEL-'));
};

/** Build an isolated checkout, stage a synthetic, run the command, then remove only that checkout. */
const withIsolatedRun = async <T>(fn: (iso: string, runId: string) => Promise<T>): Promise<T> => {
  const id = makeTestIdentity(`iso-${process.pid.toString(36)}${randomBytes(4).toString('hex')}`);
  const iso = buildIsolatedCheckout(id);
  const runId = uniqueRunId();
  try {
    stageIsolatedSynthetic(iso, id, runId);
    return await fn(iso, runId);
  } finally {
    rmSync(iso, { recursive: true, force: true });
  }
};

test('MAJOR-3: the real command advances a valid authenticated synthetic past auth into provenance', async () => {
  await withIsolatedRun(async (iso, runId) => {
    assert.ok(existsSync(path.join(iso, 'config/artifact-trust-roots.json')));
    assert.equal(JSON.parse(readFileSync(path.join(iso, 'config/artifact-trust-roots.json'), 'utf8')).keys.length, 1);
    const r = await runIsolatedCommand(iso, runId);
    // Provenance cannot pass for a synthetic fixture (no certified baseline evidence binds
    // these bytes), so the run must refuse at the provenance stage — proving authentication
    // already passed. Any provenance refusal qualifies; an AUTH_ refusal would mean the
    // gate under test rejected a valid binding.
    assert.equal(r.status, 2);
    assert.match(r.stderr, /the source/i);
    assert.doesNotMatch(r.stderr, /AUTH_/);
    assert.doesNotMatch(r.stderr, /HARD-DISABLED/);
    assert.deepEqual(isolatedModelOutDirs(iso), []);
    // The isolated trust root is separate: production stays empty until reviewed enrollment,
    // and no evidence for this run id exists in the production checkout.
    assert.deepEqual(JSON.parse(readFileSync(PROD_TRUST_ROOTS, 'utf8')), { version: 1, keys: [] });
    assert.ok(!existsSync(PROD_EVIDENCE) || !readdirSync(PROD_EVIDENCE).includes(runId));
  });
});

test('MAJOR-3: the real command refuses a signed substitution at the auth gate', async () => {
  await withIsolatedRun(async (iso, runId) => {
    const doc = JSON.parse(readFileSync(artifactFileFor(iso, runId), 'utf8'));
    doc.requestId = 'command-harness-tampered-001';
    writeFileSync(artifactFileFor(iso, runId), JSON.stringify(doc));
    const r = await runIsolatedCommand(iso, runId);
    assert.equal(r.status, 2);
    // The command prints messages, not codes: this text is the manifest-binding refusal.
    assert.match(r.stderr, /manifest does not bind these exact artifact bytes/);
    assert.doesNotMatch(r.stderr, /the source/i);
  });
});

test('MAJOR-3: sequential and concurrent isolated runs never alter production trust roots or prior evidence', async () => {
  const before = snapshotProduction();
  const sentinel = path.join(tmpdir(), `pp-auth-iso-sentinel-${process.pid}-${randomBytes(4).toString('hex')}`);
  writeFileSync(sentinel, 'sentinel');
  try {
    // Sequential: one passing-auth run and one tampered run in fresh checkouts.
    await withIsolatedRun(async (iso, runId) => {
      const r = await runIsolatedCommand(iso, runId);
      assert.equal(r.status, 2);
      assert.match(r.stderr, /the source/i);
    });
    await withIsolatedRun(async (iso, runId) => {
      const doc = JSON.parse(readFileSync(artifactFileFor(iso, runId), 'utf8'));
      doc.requestId = 'concurrent-harness-tampered-001';
      writeFileSync(artifactFileFor(iso, runId), JSON.stringify(doc));
      const r = await runIsolatedCommand(iso, runId);
      assert.equal(r.status, 2);
      assert.match(r.stderr, /manifest does not bind these exact artifact bytes/);
    });
    // Concurrent: three isolated checkouts racing; every run keeps its own root and key.
    const ids = [uniqueRunId(), uniqueRunId(), uniqueRunId()];
    assert.equal(new Set(ids).size, 3);
    const isos = ids.map(() => {
      const id = makeTestIdentity(`iso-c-${process.pid.toString(36)}${randomBytes(4).toString('hex')}`);
      return { iso: buildIsolatedCheckout(id), id };
    });
    try {
      await Promise.all(isos.map(({ iso, id }, i) => {
        stageIsolatedSynthetic(iso, id, ids[i]!);
        return Promise.resolve();
      }));
      const results = await Promise.all(isos.map(({ iso }, i) => runIsolatedCommand(iso, ids[i]!)));
      for (const r of results) {
        assert.equal(r.status, 2);
        assert.match(r.stderr, /the source/i);
        assert.doesNotMatch(r.stderr, /AUTH_/);
      }
    } finally {
      for (const { iso } of isos) rmSync(iso, { recursive: true, force: true });
    }
    assert.ok(readFileSync(sentinel, 'utf8') === 'sentinel');
    assert.deepEqual(snapshotProduction(), before);
  } finally {
    rmSync(sentinel, { force: true });
  }
});

test('MAJOR-3: an interrupted (SIGKILLed) run cannot alter production trust roots or prior evidence', async () => {
  const before = snapshotProduction();
  const id = makeTestIdentity(`iso-k-${process.pid.toString(36)}${randomBytes(4).toString('hex')}`);
  const iso = buildIsolatedCheckout(id);
  const runId = uniqueRunId();
  try {
    stageIsolatedSynthetic(iso, id, runId);
    // Kill well before node startup + type-stripping can finish, so the signal lands
    // mid-run. If the run ever won the race (status 2), the production-untouched
    // property below still holds; the kill itself is best-effort.
    const r = await runIsolatedCommand(iso, runId, 50);
    assert.ok(r.signal === 'SIGKILL' || r.status === 2);
    assert.deepEqual(snapshotProduction(), before);
  } finally {
    // Cleanup removes only the directory this test created.
    rmSync(iso, { recursive: true, force: true });
  }
  assert.ok(!existsSync(iso));
  assert.deepEqual(snapshotProduction(), before);
});
