// C3-B2B P2: the section 3.3 source-provenance checks, tested with synthetic evidence and a fake Git only.
// The real stored artifact and the real repository history are never touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { buildProposalRequest, loadCertifiedProposalInput } from '../../packages/provenance/src/provenance-input.ts';
import { loadAndValidateProposalArtifact } from '../../packages/provenance/src/proposal-artifact.ts';
import { SourceProvenanceError, verifySourceProvenance, type SourceGit } from '../../packages/provenance/src/source-provenance.ts';
import { tempDir } from '../helpers.ts';
import { edit, writeEvidence } from '../support/live-evidence.ts';
import { validArtifactDoc, writeArtifactDoc } from '../support/proposal-artifact-fixture.ts';

const SOURCE = '1'.repeat(40);
const VERIF = '2'.repeat(40);
const TREE = '3'.repeat(40);
const ANALYSIS = 'c2b-live-smoke-002';
const RUN = 'c3-test-source-001';

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'NO_ERROR';
  } catch (e) {
    return e instanceof SourceProvenanceError ? e.code : `OTHER:${(e as Error).message}`;
  }
};

/** In-memory Git double: no process, no repository, fully deterministic. */
const makeGit = (over: { commits?: string[]; ancestor?: boolean; trees?: Record<string, Record<string, string | null>> } = {}): SourceGit => {
  const commits = new Set(over.commits ?? [SOURCE, VERIF]);
  return {
    commitExists: async (sha: string) => commits.has(sha),
    isAncestor: async (a: string, d: string) => over.ancestor ?? (a === SOURCE && d === VERIF),
    treeOf: async (rev: string, p: string) => {
      const perRev = over.trees?.[rev];
      if (perRev && p in perRev) return perRev[p]!;
      return p === 'fixtures/sample-store' ? TREE : `tree:${p}`;
    },
  };
};

const setup = async () => {
  const root = tempDir('pp-source-');
  const e = writeEvidence(root, { head: SOURCE, fixtureTree: TREE });
  const input = await loadCertifiedProposalInput({ repoRoot: root, head: SOURCE, fixtureTree: TREE, analysisId: e.analysisId });
  const req = buildProposalRequest({ symptom: input.symptom, facts: input.facts });
  writeArtifactDoc(root, RUN, validArtifactDoc(RUN, { inputSha256: req.inputSha256 }));
  const artifact = await loadAndValidateProposalArtifact({ repoRoot: root, runId: RUN });
  return { root, e, artifact, req };
};
const check = (s: Awaited<ReturnType<typeof setup>>, git: SourceGit, over: Record<string, unknown> = {}) =>
  verifySourceProvenance({ repoRoot: s.root, sourceHead: SOURCE, sourceFixtureTree: TREE, sourceAnalysisId: ANALYSIS, verificationHead: VERIF, artifact: s.artifact, git, ...over } as Parameters<typeof verifySourceProvenance>[0]);

test('recomputed input, anchors and classes: operator-reported facts stay labelled', async () => {
  const s = await setup();
  const r = await check(s, makeGit());
  assert.equal(r.inputSha256, s.req.inputSha256);
  assert.equal(r.artifactInputSha256, s.req.inputSha256);
  assert.equal(r.artifactHash, s.artifact.artifactHash);
  assert.equal(r.baselineRunId, s.e.baselineName);
  assert.equal(r.recordingSet, s.e.recordingSet);
  assert.equal(r.videoSha256, s.e.videoSha);
  assert.equal(r.ancestryOk, true);
  assert.equal(r.treesEqual, true);
  assert.deepEqual(r.classes, {
    sourceHead: 'operator-reported', sourceFixtureTree: 'operator-reported', sourceAnalysisId: 'operator-reported', verificationHead: 'operator-reported',
    inputSha256: 'recomputed', artifactInputSha256: 'local-file', artifactHash: 'local-file',
    baselineRunId: 'recomputed', recordingSet: 'recomputed', videoSha256: 'recomputed',
    ancestryOk: 'local-git', treesEqual: 'local-git',
  });
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.classes));
  assert.ok(path, 'imports used');
});

test('malformed revisions and a conflated source revision are refused', async () => {
  const s = await setup();
  assert.equal(await codeOf(check(s, makeGit(), { sourceHead: 'short' })), 'SOURCE_REVISION_INVALID');
  assert.equal(await codeOf(check(s, makeGit(), { sourceFixtureTree: 'xyz' })), 'SOURCE_REVISION_INVALID');
  assert.equal(await codeOf(check(s, makeGit(), { verificationHead: 'HEAD' })), 'SOURCE_REVISION_INVALID');
  // the verification checkout revision must never serve as the source revision
  assert.equal(await codeOf(check(s, makeGit(), { sourceHead: VERIF, verificationHead: VERIF })), 'SOURCE_CONFLATED');
});

test('an artifact answering a different input is refused', async () => {
  const s = await setup();
  writeArtifactDoc(s.root, RUN, validArtifactDoc(RUN, { inputSha256: 'c'.repeat(64) }));
  const tampered = await loadAndValidateProposalArtifact({ repoRoot: s.root, runId: RUN });
  assert.equal(await codeOf(check({ ...s, artifact: tampered }, makeGit())), 'SOURCE_INPUT_MISMATCH');
});

test('broken source evidence is refused without trusting the summary', async () => {
  const s = await setup();
  assert.equal(await codeOf(check(s, makeGit(), { sourceAnalysisId: 'c2b-live-smoke-404' })), 'SOURCE_EVIDENCE');
  edit(path.join(s.e.baselineDir, 'baseline-summary.json'), (d) => { d.certified = false; });
  assert.equal(await codeOf(check(s, makeGit())), 'SOURCE_EVIDENCE');
});

test('unknown source commits, non-ancestors and drifted trees are refused', async () => {
  const s = await setup();
  assert.equal(await codeOf(check(s, makeGit({ commits: [VERIF] }))), 'SOURCE_COMMIT_UNKNOWN');
  assert.equal(await codeOf(check(s, makeGit({ ancestor: false }))), 'SOURCE_NOT_ANCESTOR');
  const drift = { [SOURCE]: { 'fixtures/sample-store': TREE, verifier: 'v1', 'config/patch-policy.json': 'p1' }, [VERIF]: { 'fixtures/sample-store': TREE, verifier: 'v2', 'config/patch-policy.json': 'p1' } };
  assert.equal(await codeOf(check(s, makeGit({ trees: drift }))), 'SOURCE_IMMUTABLE');
  const unresolvable = { [SOURCE]: { 'fixtures/sample-store': TREE, verifier: 'v1', 'config/patch-policy.json': 'p1' }, [VERIF]: { 'fixtures/sample-store': TREE, verifier: 'v1', 'config/patch-policy.json': null } };
  assert.equal(await codeOf(check(s, makeGit({ trees: unresolvable }))), 'SOURCE_IMMUTABLE');
});

test('the Git fixture trees must equal the archived baseline claim, not just each other', async () => {
  const s = await setup();
  // both revisions agree with each other but not with the baseline claim
  const coherent = '4'.repeat(40);
  const both = { [SOURCE]: { 'fixtures/sample-store': coherent }, [VERIF]: { 'fixtures/sample-store': coherent } };
  assert.equal(await codeOf(check(s, makeGit({ trees: both }))), 'SOURCE_FIXTURE_TREE');
  // source matches the claim but verification drifted
  const oneSide = { [SOURCE]: { 'fixtures/sample-store': TREE }, [VERIF]: { 'fixtures/sample-store': coherent } };
  assert.equal(await codeOf(check(s, makeGit({ trees: oneSide }))), 'SOURCE_FIXTURE_TREE');
  // unresolvable source tree
  const missing = { [SOURCE]: { 'fixtures/sample-store': null }, [VERIF]: { 'fixtures/sample-store': TREE } };
  assert.equal(await codeOf(check(s, makeGit({ trees: missing }))), 'SOURCE_FIXTURE_TREE');
});
