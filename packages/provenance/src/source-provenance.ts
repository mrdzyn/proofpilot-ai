// C3-B2B P2 — Zone P: source-provenance checks for a validated proposal artifact (section 3.3).
//
// The artifact does not record the repository revision it was produced at, so this module invents no
// binding. Instead it takes the claimed source revision as explicit, operator-reported parameters
// (`sourceHead`, `sourceFixtureTree`, `sourceAnalysisId`) plus the future verification revision
// (`verificationHead`), and checks: the archived certified evidence at exactly the source revision still
// recomputes the artifact's input hash; the source commit exists locally and is an ancestor of the
// verification revision; and the fixture tree, verifier files and patch policy are identical at both
// revisions. Every output field carries its provenance class, so operator-reported facts are never
// presented as cryptographically verified ones.
//
// Git bytes come from an injected narrow `SourceGit` interface (implemented against the existing read-only
// Git probe by the future narrow command); this module starts no child process and stays inside the Zone P
// import allow-list. Nothing here executes, stages or verifies a proposal.
import { buildProposalRequest, loadCertifiedBaselineFacts, loadCertifiedProposalInput, LiveInputError, ProposalError } from './provenance-input.ts';
import { ArtifactError, type ValidatedProposal } from './proposal-artifact.ts';

export type SourceProvenanceErrorCode =
  | 'SOURCE_REVISION_INVALID' | 'SOURCE_CONFLATED' | 'SOURCE_EVIDENCE' | 'SOURCE_INPUT_MISMATCH'
  | 'SOURCE_COMMIT_UNKNOWN' | 'SOURCE_NOT_ANCESTOR' | 'SOURCE_IMMUTABLE' | 'SOURCE_FIXTURE_TREE';

export class SourceProvenanceError extends Error {
  readonly code: SourceProvenanceErrorCode;
  constructor(code: SourceProvenanceErrorCode, message: string) {
    super(message);
    this.name = 'SourceProvenanceError';
    this.code = code;
  }
}

/** Narrow read-only Git access, wired to the existing read-only probe by the future command. */
export type SourceGit = {
  /** True when the commit object exists in the local repository. */
  commitExists(sha: string): Promise<boolean>;
  /** True when `ancestor` is an ancestor of `descendant` in the local repository. */
  isAncestor(ancestor: string, descendant: string): Promise<boolean>;
  /** The Git tree id of a directory, or the blob id of a file, at a revision; null when unresolvable. */
  treeOf(rev: string, path: string): Promise<string | null>;
};

export type ProvenanceClass = 'operator-reported' | 'recomputed' | 'local-file' | 'local-git';

/** The verified source-provenance record. Every field names the class of evidence behind it. */
export type SourceProvenance = {
  readonly sourceHead: string;
  readonly sourceFixtureTree: string;
  readonly sourceAnalysisId: string;
  readonly verificationHead: string;
  /** The input SHA-256 recomputed from the archived certified evidence at the source revision. */
  readonly inputSha256: string;
  readonly artifactInputSha256: string;
  readonly artifactHash: string;
  readonly baselineRunId: string;
  readonly recordingSet: string;
  readonly videoSha256: string;
  readonly ancestryOk: boolean;
  readonly treesEqual: boolean;
  readonly classes: Readonly<Record<string, ProvenanceClass>>;
};

/** The fixture tree is bound explicitly to the baseline claim below; these paths must be identical at the
 *  source and verification revisions. */
export const IMMUTABLE_PATHS = ['verifier', 'config/patch-policy.json'] as const;
/** The fixture tree, bound separately to the certified baseline's claimed tree at both revisions. */
export const FIXTURE_PATH = 'fixtures/sample-store';

const SHA1 = /^[0-9a-f]{40}$/;

function freeze<T>(v: T): T {
  if (Array.isArray(v)) {
    for (const e of v) freeze(e);
    return Object.freeze(v);
  }
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    for (const e of Object.values(v)) freeze(e as T);
    return Object.freeze(v);
  }
  return v;
}

export async function verifySourceProvenance(opts: {
  repoRoot: string;
  sourceHead: string;
  sourceFixtureTree: string;
  sourceAnalysisId: string;
  verificationHead: string;
  artifact: ValidatedProposal;
  git: SourceGit;
}): Promise<SourceProvenance> {
  const { repoRoot, sourceHead, sourceFixtureTree, sourceAnalysisId, verificationHead, artifact, git } = opts;
  const bad = (code: SourceProvenanceErrorCode, message: string): never => {
    throw new SourceProvenanceError(code, message);
  };
  if (!SHA1.test(sourceHead) || !SHA1.test(sourceFixtureTree) || !SHA1.test(verificationHead)) {
    return bad('SOURCE_REVISION_INVALID', 'source and verification revisions must be full Git object ids');
  }
  if (sourceHead === verificationHead) {
    return bad('SOURCE_CONFLATED', 'the source revision must not be the verification checkout revision');
  }
  // The archived certified evidence at exactly the claimed source revision must still recompute the input.
  let baselineRunId = '';
  let facts: Awaited<ReturnType<typeof loadCertifiedBaselineFacts>>['facts'] | null = null;
  try {
    const base = await loadCertifiedBaselineFacts({ repoRoot, head: sourceHead, fixtureTree: sourceFixtureTree });
    facts = base.facts;
    baselineRunId = base.runId;
  } catch (e) {
    const code = e instanceof LiveInputError || e instanceof ProposalError || e instanceof ArtifactError ? e.code : 'UNEXPECTED_ERROR';
    return bad('SOURCE_EVIDENCE', `the source baseline evidence does not recompute: ${code}`);
  }
  let input: Awaited<ReturnType<typeof loadCertifiedProposalInput>>;
  try {
    input = await loadCertifiedProposalInput({ repoRoot, head: sourceHead, fixtureTree: sourceFixtureTree, analysisId: sourceAnalysisId });
  } catch (e) {
    const code = e instanceof LiveInputError || e instanceof ProposalError || e instanceof ArtifactError ? e.code : 'UNEXPECTED_ERROR';
    return bad('SOURCE_EVIDENCE', `the source proposal input does not recompute: ${code}`);
  }
  if (JSON.stringify(input.facts) !== JSON.stringify(facts)) {
    return bad('SOURCE_EVIDENCE', 'the recomputed facts disagree between the baseline and input loaders');
  }
  const rebuilt = buildProposalRequest({ symptom: input.symptom, facts: input.facts });
  if (rebuilt.inputSha256 !== artifact.inputSha256) {
    return bad('SOURCE_INPUT_MISMATCH', 'the artifact answers a different input than the source evidence produces');
  }
  // Local Git: the source commit exists and is an ancestor of the verification revision.
  if (!(await git.commitExists(sourceHead))) return bad('SOURCE_COMMIT_UNKNOWN', 'the source commit is not present locally');
  if (!(await git.isAncestor(sourceHead, verificationHead))) {
    return bad('SOURCE_NOT_ANCESTOR', 'the source commit is not an ancestor of the verification revision');
  }
  // Fixture-tree binding: the actual Git tree at the source revision must equal the certified baseline's
  // claimed tree, and the verification revision must match it too. Two revisions agreeing with each other
  // is not enough; both must equal the archived claim.
  const [sourceTree, verificationTree] = await Promise.all([git.treeOf(sourceHead, FIXTURE_PATH), git.treeOf(verificationHead, FIXTURE_PATH)]);
  if (!sourceTree || sourceTree !== sourceFixtureTree) {
    return bad('SOURCE_FIXTURE_TREE', 'the source revision does not contain the claimed fixture tree');
  }
  if (!verificationTree || verificationTree !== sourceFixtureTree) {
    return bad('SOURCE_FIXTURE_TREE', 'the verification revision does not match the claimed fixture tree');
  }
  // Oracle immutability between the two anchors, by Git tree/blob ids.
  for (const p of IMMUTABLE_PATHS) {
    const [a, b] = await Promise.all([git.treeOf(sourceHead, p), git.treeOf(verificationHead, p)]);
    if (!a || !b || a !== b) return bad('SOURCE_IMMUTABLE', `path ${p} differs between the source and verification revisions`);
  }
  return freeze({
    sourceHead,
    sourceFixtureTree,
    sourceAnalysisId,
    verificationHead,
    inputSha256: rebuilt.inputSha256,
    artifactInputSha256: artifact.inputSha256,
    artifactHash: artifact.artifactHash,
    baselineRunId,
    recordingSet: input.sources.recordingSet,
    videoSha256: input.sources.videoSha256,
    ancestryOk: true,
    treesEqual: true,
    classes: freeze({
      sourceHead: 'operator-reported',
      sourceFixtureTree: 'operator-reported',
      sourceAnalysisId: 'operator-reported',
      verificationHead: 'operator-reported',
      inputSha256: 'recomputed',
      artifactInputSha256: 'local-file',
      artifactHash: 'local-file',
      baselineRunId: 'recomputed',
      recordingSet: 'recomputed',
      videoSha256: 'recomputed',
      ancestryOk: 'local-git',
      treesEqual: 'local-git',
    } as Record<string, ProvenanceClass>),
  });
}
