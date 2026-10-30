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
// The real stored artifact `c3-live-meta-001` is HARD-DISABLED: the command refuses that run
// id before reading any file, staging anything or touching Git, whatever the environment
// holds. Enabling the real artifact needs a separate owner decision, a code change and a
// new security review — there is no flag, variable or trust-root entry that lifts this
// refusal.
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
import { ArtifactError, reloadAndBindArtifact } from '../packages/provenance/src/proposal-artifact.ts';
import { verifySourceProvenance, SourceProvenanceError } from '../packages/provenance/src/source-provenance.ts';
import { registerModelProposal, ModelProposalError } from '../packages/core/src/model-proposal.ts';
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
// The hard disable precedes every file read, stage, browser and Git call.
if (runId === REAL_ARTIFACT_RUN_ID) fail(2, REAL_ARTIFACT_MESSAGE);

const repoRoot = path.resolve(import.meta.dirname, '..');
const git = (...args: string[]): string => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', timeout: 30000 }).trim();
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
  if (e instanceof AuthError || e instanceof ArtifactError || e instanceof SourceProvenanceError || e instanceof ModelProposalError || e instanceof ModelVerificationError) {
    fail(2, `refused: ${e.message}`);
  }
  if (e instanceof CoordinatorBusyError) fail(2, `refused: ${e.message}`);
  throw e;
}
process.exit(entry.status === 'VERIFIED' ? 0 : 1);
