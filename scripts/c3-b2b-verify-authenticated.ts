// C3-B2B SEC-P2-02: authenticated offline verification of a registered stored-model proposal.
//
// Narrow surface, same as `scripts/c3-b2b-verify-proposal.ts`: --run-id, --source-sha,
// --source-fixture-tree, --source-analysis-id and --verification-sha. No blanket execution
// flag exists; running the command IS the request to verify. This command additionally
// requires a detached authentication binding beside the artifact
// (`auth-manifest.json` + `auth-manifest.sig` under the run's evidence directory) verified
// against the pinned trust roots in `config/artifact-trust-roots.json`. There is no key
// flag, no trust-root flag, no bypass flag and no environment input: nothing in the
// environment, credentials or config can widen either gate.
//
// The real stored artifact `c3-live-meta-001` passes through an ordered authorization gate:
// parent-binding record plus diff allow-list (exactly one parent, clean tree,
// HEAD~1 == verificationParentSha, V..HEAD limited to the record and the enrollment),
// then the usual authenticated path, with single-use minting before the run. Without a
// complete gate the command refuses that run id before reading any artifact file, staging
// anything or running anything, whatever the environment holds. There is no flag, variable
// or trust-root entry that lifts this refusal.
//
// Exit codes mirror the C3-B1 script: 0 means VERIFIED; 1 means the pipeline completed with
// a non-VERIFIED verdict; 2 means refused or errored before completing.
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import {
  AuthError,
  loadAndAuthenticateProposalArtifact,
  parseTrustRoots,
} from '../packages/provenance/src/artifact-auth.ts';
import { ArtifactError, openNoFollowReadOnly, readBoundedBytes, reloadAndBindArtifact } from '../packages/provenance/src/proposal-artifact.ts';
import { verifySourceProvenance, SourceProvenanceError } from '../packages/provenance/src/source-provenance.ts';
import { registerModelProposal, ModelProposalError } from '../packages/core/src/model-proposal.ts';
import {
  AUTHORIZATION_DIFF_ALLOWLIST,
  AUTHORIZATION_RECORD_PATH,
  AUTHORIZATION_TRUST_ROOTS_PATH,
  mintSingleUseRealAuthorization,
  ModelAuthorizationError,
} from '../packages/core/src/model-real-authorization.ts';
import {
  verifyRegisteredProposal,
  ModelVerificationError,
  VERIFICATION_FILE,
  type ModelGit,
} from '../packages/core/src/model-verification.ts';
import { CoordinatorBusyError, modelVerificationProblems } from '../packages/core/src/index.ts';

const REAL_ARTIFACT_RUN_ID = 'c3-live-meta-001';
const REAL_ARTIFACT_MESSAGE =
  `refused: ${REAL_ARTIFACT_RUN_ID} is the real stored model proposal and its execution path is HARD-DISABLED ` +
  `(no owner execution approval, no security review of a real run). This command verifies synthetic fixtures only.`;

/** Sidecar bounds mirror `artifact-auth.ts` (manifest 2048, signature 256). */
const SIDECAR_MANIFEST_BOUND = 2048;
const SIDECAR_SIGNATURE_BOUND = 256;

const { values } = parseArgs({
  options: {
    'run-id': { type: 'string' },
    'source-sha': { type: 'string' },
    'source-fixture-tree': { type: 'string' },
    'source-analysis-id': { type: 'string' },
    'verification-sha': { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
  strict: true,
});

if (values.help) {
  console.log('usage: node scripts/c3-b2b-verify-authenticated.ts --run-id <id> --source-sha <sha> --source-fixture-tree <tree> --source-analysis-id <id> --verification-sha <sha>');
  process.exit(0);
}

const fail = (code: 1 | 2, message: string): never => {
  console.error(message);
  process.exit(code);
};

const runId = values['run-id'];
const sourceSha = values['source-sha'];
const sourceFixtureTree = values['source-fixture-tree'];
const sourceAnalysisId = values['source-analysis-id'];
const verificationSha = values['verification-sha'];
if (!runId || !sourceSha || !sourceFixtureTree || !sourceAnalysisId || !verificationSha) {
  fail(2, 'refused: --run-id, --source-sha, --source-fixture-tree, --source-analysis-id and --verification-sha are all required');
}
const SHA40 = /^[0-9a-f]{40}$/;
for (const [name, sha] of [['source-sha', sourceSha], ['source-fixture-tree', sourceFixtureTree], ['verification-sha', verificationSha]] as const) {
  if (!SHA40.test(sha as string)) fail(2, `refused: --${name} must be 40 lowercase hex characters`);
}
const repoRoot = path.resolve(import.meta.dirname, '..');
const git = (...args: string[]): string => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', timeout: 30000 }).trim();

// The real-id authorization gate precedes every artifact file read, stage, browser and
// Git-gated call. At V (no authorization record) it refuses with the hard-disable message.
let realRun: RealRunContext | null = null;
if (runId === REAL_ARTIFACT_RUN_ID) realRun = await refuseUnlessRealRunAuthorized();
const modelGit: ModelGit = {
  commitExists: async (sha) => {
    try {
      git('cat-file', '-e', `${sha}^{commit}`);
      return true;
    } catch {
      return false;
    }
  },
  isAncestor: async (ancestor, descendant) => {
    try {
      git('merge-base', '--is-ancestor', ancestor, descendant);
      return true;
    } catch {
      return false;
    }
  },
  treeOf: async (rev, p) => {
    try {
      return git('rev-parse', `${rev}:${p}`);
    } catch {
      return null;
    }
  },
};

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

let entry;
try {
  // Pinned trust roots: the single committed file. No flag, file or environment value
  // substitutes for it, and an empty key list trusts nothing.
  const trustRoots = parseTrustRoots(await readFile(path.join(repoRoot, 'config/artifact-trust-roots.json'), 'utf8'));
  // Zone P, read-only: load the stored artifact as untrusted data, then require a valid
  // detached authentication binding it before anything may register or stage it.
  const { artifact } = await loadAndAuthenticateProposalArtifact({
    repoRoot,
    runId: runId as string,
    sourceSha: sourceSha as string,
    sourceFixtureTree: sourceFixtureTree as string,
    sourceAnalysisId: sourceAnalysisId as string,
    trustRoots,
  });
  // Zone P source check with explicit operator-supplied revision parameters.
  const provenance = await verifySourceProvenance({
    repoRoot,
    sourceHead: sourceSha as string,
    sourceFixtureTree: sourceFixtureTree as string,
    sourceAnalysisId: sourceAnalysisId as string,
    verificationHead: verificationSha as string,
    artifact,
    git: modelGit,
  });
  // Zone E bridge: plain triples plus labels only; the registration revalidates the grammar.
  const registered = registerModelProposal({
    triples: artifact.adjustments.map((a) => ({ ...a })),
    renderedCss: artifact.renderedCss,
    runId,
    approvedSha: verificationSha,
    sourceSha,
    inputSha256: artifact.inputSha256,
    artifactSha256: artifact.artifactHash,
  });
  // Cross-phase binding: re-load the bytes immediately before the run and refuse unless they
  // are the exact bytes validated, authenticated and registered above.
  const bound = await reloadAndBindArtifact(repoRoot, runId as string, artifact.artifactHash);
  // Same-bytes guarantee for the real id: the mint must verify the exact bytes Zone P
  // authenticated. Re-read the sidecars through the pinned-descriptor reader and refuse on
  // any difference from the gate texts — a mid-flight swap fails closed instead of splitting
  // the two verifications across different bytes.
  let rezonedManifestText = '';
  let rezonedSignatureText = '';
  if (realRun !== null) {
    rezonedManifestText = await readSidecarHardened(`.proofpilot/evidence/proposals/${runId}/auth-manifest.json`, SIDECAR_MANIFEST_BOUND, 'manifest');
    rezonedSignatureText = await readSidecarHardened(`.proofpilot/evidence/proposals/${runId}/auth-manifest.sig`, SIDECAR_SIGNATURE_BOUND, 'signature');
    if (rezonedManifestText !== realRun.manifestText || rezonedSignatureText !== realRun.signatureText) {
      fail(2, 'refused: sidecar bytes changed between the gate read and the authenticated read');
    }
  }
  // Single-use minting for the real id only: re-verifies the signature from the re-read
  // bytes and binds proposal, manifest, record and observed V. Direct programmatic calls
  // without this step still throw REAL_ARTIFACT_DISABLED at the E2 boundary.
  if (realRun !== null) {
    mintSingleUseRealAuthorization({
      proposal: registered,
      manifestText: rezonedManifestText,
      signatureText: rezonedSignatureText,
      trustRootsText: realRun.trustRootsText,
      recordText: realRun.recordText,
      cliValues: {
        runId: runId as string,
        sourceSha: sourceSha as string,
        sourceFixtureTree: sourceFixtureTree as string,
        sourceAnalysisId: sourceAnalysisId as string,
        verificationSha: verificationSha as string,
      },
      observed: realRun.observed,
    });
  }
  // Zone E replay path: identity-checked, three fresh stages, verdict from persisted evidence.
  // The Zone P attestation travels with the run and is persisted beside the evidence.
  const outDir = path.join(repoRoot, '.proofpilot/c3-b2b', `MODEL-${runId}-${stamp}`);
  entry = await verifyRegisteredProposal({
    repoRoot,
    verificationSha,
    sourceSha,
    inputSha256: bound.inputSha256,
    artifactSha256: bound.artifactHash,
    proposal: registered,
    outDir,
    lockPath: path.join(repoRoot, '.proofpilot/locks/oracle-4173.lock'),
    coordinatorLockPath: path.join(repoRoot, '.proofpilot/locks/c3-b1-coordinator.lock'),
    git: modelGit,
    sourceAttestation: provenance,
  });
  // Never report a certified verification from the in-memory row alone: revalidate the
  // persisted bundle (verification.json, attestation, replay evidence) before printing.
  const revalidation = await modelVerificationProblems(entry, verificationSha as string, outDir);
  if (revalidation.length > 0) {
    fail(2, `refused: persisted evidence failed independent revalidation: ${revalidation.join('; ')}`);
  }
  console.log(`\n=== C3-B2B authenticated model verification ${runId} at ${verificationSha} ===`);
  console.log(`baseline: ${entry.baseline.reproduced ? 'REPRODUCED' : `NOT REPRODUCED: ${entry.baseline.reasons.join('; ')}`}`);
  console.log(`replays: ${entry.replaysPassed}/${entry.replaysAttempted} passed, verdict ${entry.status}${entry.reason ? ` (${entry.reason})` : ''}`);
  console.log(`candidate: ${entry.candidateId} (provenance-tagged; never inherits PC-1)`);
  console.log(`anchors: source fixture ${entry.fixtureTreeSource}, verification fixture ${entry.fixtureTreeVerification}`);
  console.log(`provenance: source ${provenance.classes.sourceHead}, input ${provenance.classes.inputSha256}`);
  console.log(`evidence: ${path.join(outDir, `MODEL-${runId}`, VERIFICATION_FILE)}`);
} catch (e) {
  if (e instanceof AuthError || e instanceof ArtifactError || e instanceof SourceProvenanceError || e instanceof ModelProposalError || e instanceof ModelVerificationError || e instanceof ModelAuthorizationError) {
    fail(2, `refused: ${e.message}`);
  }
  if (e instanceof CoordinatorBusyError) fail(2, `refused: ${e.message}`);
  throw e;
}
process.exit(entry.status === 'VERIFIED' ? 0 : 1);

type RealRunContext = {
  recordText: string;
  trustRootsText: string;
  manifestText: string;
  signatureText: string;
  observed: { head: string; parent: string; parentCount: number; clean: boolean; diffNames: string[] };
};

/**
 * Re-read one sidecar through the pinned read-only descriptor (no-follow, bounded, read from
 * the descriptor rather than the pathname), for the post-authentication same-bytes check.
 */
async function readSidecarHardened(rel: string, bound: number, what: string): Promise<string> {
  const target = path.join(repoRoot, ...rel.split('/'));
  let handle;
  try {
    handle = await openNoFollowReadOnly(target, `refused: ${what} sidecar is unreadable before the run`);
  } catch (e) {
    if (e instanceof ArtifactError) fail(2, `refused: ${e.message}`);
    throw e;
  }
  try {
    const bytes = await readBoundedBytes(handle!, bound);
    if (bytes.length > bound) fail(2, `refused: ${what} sidecar exceeds its fixed bound`);
    return bytes.toString('utf8');
  } finally {
    await handle!.close().catch(() => undefined);
  }
}

/**
 * Ordered real-id authorization gate. Runs before any artifact, manifest or sidecar read.
 * The fixed-path record comes first so the V state (no record) always refuses with the
 * hard-disable message, whatever the checkout looks like; git parent-binding, tree and
 * diff checks follow, then the fixed trust-roots and sidecar texts for the mint. Any
 * failure exits 2. No flags, no environment input, no alternate paths: every location
 * below is a fixed repository-relative constant.
 */
async function refuseUnlessRealRunAuthorized(): Promise<RealRunContext> {
  let recordText: string;
  try {
    recordText = await readFile(path.join(repoRoot, AUTHORIZATION_RECORD_PATH), 'utf8');
  } catch {
    fail(2, REAL_ARTIFACT_MESSAGE);
  }
  let shape: unknown;
  try {
    shape = JSON.parse(recordText!);
  } catch {
    fail(2, REAL_ARTIFACT_MESSAGE);
  }
  const rec = shape as Record<string, unknown>;
  if (rec['runId'] !== runId) {
    fail(2, REAL_ARTIFACT_MESSAGE);
  }
  // All five CLI values are cross-checked against the record before any artifact, manifest
  // or sidecar access (§3): the remaining four here, the parent binding below.
  const cliChecks = [
    ['--source-sha', 'sourceSha', sourceSha],
    ['--source-fixture-tree', 'sourceFixtureTree', sourceFixtureTree],
    ['--source-analysis-id', 'sourceAnalysisId', sourceAnalysisId],
    ['--verification-sha', 'verificationParentSha', verificationSha],
  ] as const;
  for (const [flag, field, value] of cliChecks) {
    if (typeof rec[field] !== 'string' || rec[field] !== value) {
      fail(2, `refused: ${flag} does not match the authorization record (RECORD_MISMATCH)`);
    }
  }
  const authorizedParent = rec['verificationParentSha'] as string;
  let parentsLine: string;
  let statusOut: string;
  try {
    parentsLine = git('rev-list', '--parents', '-n', '1', 'HEAD');
    statusOut = git('status', '--porcelain');
  } catch {
    fail(2, 'refused: cannot observe the checkout before any artifact access (git rev-list/status failed)');
  }
  const parts = parentsLine!.trim().split(/\s+/);
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    fail(2, 'refused: HEAD must have exactly one parent; a merge commit cannot be parent-bound (NOT_SINGLE_PARENT)');
  }
  const head = parts[0] as string;
  const parent = parts[1] as string;
  if (statusOut!.trim() !== '') fail(2, 'refused: the checkout tree is not clean (DIRTY_TREE)');
  if (authorizedParent !== parent || authorizedParent !== verificationSha) {
    fail(2, 'refused: HEAD is not the authorized child of the recorded parent (NOT_PARENT_CHILD)');
  }
  let diffOut: string;
  try {
    diffOut = git('diff', '--name-only', `${parent}..HEAD`);
  } catch {
    fail(2, 'refused: cannot observe the V..HEAD diff before any artifact access');
  }
  const names = diffOut!.split('\n').map((l) => l.trim()).filter((l) => l.length > 0).sort();
  if (JSON.stringify(names) !== JSON.stringify([...AUTHORIZATION_DIFF_ALLOWLIST].sort())) {
    fail(2, 'refused: V..HEAD carries files outside the authorization allow-list (DIFF_NOT_ALLOWLISTED)');
  }
  const readFixed = async (rel: string): Promise<string> =>
    readFile(path.join(repoRoot, ...rel.split('/')), 'utf8').catch((): string =>
      fail(2, `refused: ${rel} is unreadable before any artifact access`));
  const trustRootsText = await readFixed(AUTHORIZATION_TRUST_ROOTS_PATH);
  const manifestText = await readFixed(`.proofpilot/evidence/proposals/${runId}/auth-manifest.json`);
  const signatureText = await readFixed(`.proofpilot/evidence/proposals/${runId}/auth-manifest.sig`);
  return {
    recordText: recordText!,
    trustRootsText,
    manifestText,
    signatureText,
    observed: { head, parent, parentCount: 1, clean: true, diffNames: names },
  };
}
