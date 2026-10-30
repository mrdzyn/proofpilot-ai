// C3-B2B E2: registered-only model-proposal verification path (Zone E).
//
// Only an object that BEARS a live E1 registration may enter: `assertRegisteredModelProposal`
// refuses copies, clones and hand-built lookalikes before any lock, stage or browser. The run
// reuses the trusted C3-B1 machinery without rebuilding it — the existing stage runner, the
// unmodified oracle evidence checks, `baselineGate`/`decideVerification` (the sole VERIFIED
// authority) and the shared evidence loader — over namespaced evidence (`MODEL-<runId>/...`)
// so model evidence can never satisfy a hand-authored row and vice versa. Zone P provenance
// work stays in Zone P; the command wires it in. This module imports no inference or
// provenance code and stages no model text beyond the registered triples (already revalidated
// by E1): only the freshly host-rendered CSS reaches a stage.
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renderCssAdjustments, type CssAdjustment } from './css-adjustments.ts';
import { runCandidate, verifyPersistedEvidence, RECORD_FILE } from './candidate-stage.ts';
import {
  baselineGate,
  buildReplayEntry,
  CoordinatorBusyError,
  decideVerification,
  replayPassProblems,
  REPLAYS_REQUIRED_FOR_VERIFIED,
  type ModelVerificationEntry,
  type ReplayEntry,
  type ReplayEvidence,
  type Runner,
} from './candidate-coordinator.ts';
import { assertRegisteredModelProposal, modelProposalIdOf } from './model-proposal.ts';

export type ModelVerificationErrorCode =
  | 'BAD_SHA'
  | 'SHA_MISMATCH'
  | 'CONFLATED'
  | 'UNKNOWN_SOURCE'
  | 'UNKNOWN_VERIFICATION'
  | 'NOT_ANCESTOR'
  | 'ANCHOR_UNRESOLVABLE'
  | 'ANCHOR_DRIFT'
  | 'RENDER_MISMATCH'
  | 'RECORD_MISMATCH'
  | 'PROVENANCE_MISMATCH'
  | 'ATTESTATION_MALFORMED'
  | 'ATTESTATION_MISMATCH';

export class ModelVerificationError extends Error {
  readonly code: ModelVerificationErrorCode;
  constructor(code: ModelVerificationErrorCode, detail: string) {
    super(`refused model verification: ${detail} (${code})`);
    this.name = 'ModelVerificationError';
    this.code = code;
  }
}

/**
 * Narrow read-only Git access for the E2 revision gates. Same shape as the Zone P `SourceGit`
 * interface, restated locally so Zone E keeps no provenance import; wired to real Git by the
 * command, to fakes by tests.
 */
export type ModelGit = {
  /** True when the commit object exists in the local repository. */
  commitExists(sha: string): Promise<boolean>;
  /** True when `ancestor` is an ancestor of `descendant` in the local repository. */
  isAncestor(ancestor: string, descendant: string): Promise<boolean>;
  /** The Git tree id of a directory, or the blob id of a file, at a revision; null when unresolvable. */
  treeOf(rev: string, path: string): Promise<string | null>;
};

/** Restated from the Zone P anchors (source-provenance.ts): the fixture must be identical at both revisions. */
const MODEL_FIXTURE_PATH = 'fixtures/sample-store';
/** Restated from the Zone P `IMMUTABLE_PATHS`: the oracle inputs must be identical at both revisions. */
const MODEL_IMMUTABLE_PATHS = ['verifier', 'config/patch-policy.json'] as const;

/** Evidence file written beside the namespaced replays. */
export const VERIFICATION_FILE = 'verification.json';
/** Persisted Zone P source attestation, written beside the namespaced replays when supplied. */
export const ATTESTATION_FILE = 'source-provenance.json';

/**
 * The persisted Zone P source-provenance record (structural subset). The run function validates
 * this shape and binds every value to the registration and the Git-observed anchors before any
 * staging; the verifier cross-checks the persisted file against the presented row.
 */
export type SourceAttestation = {
  sourceHead: string;
  verificationHead: string;
  sourceFixtureTree: string;
  inputSha256: string;
  artifactInputSha256: string;
  artifactHash: string;
  ancestryOk: boolean;
  treesEqual: boolean;
  classes: Record<string, string>;
};

const EXPECTED_CLASSES: Record<string, string> = {
  sourceHead: 'operator-reported',
  sourceFixtureTree: 'operator-reported',
  sourceAnalysisId: 'operator-reported',
  verificationHead: 'operator-reported',
  inputSha256: 'recomputed',
  artifactInputSha256: 'local-file',
  artifactHash: 'local-file',
  ancestryOk: 'local-git',
  treesEqual: 'local-git',
};

function readAttestation(a: unknown): SourceAttestation {
  const malformed = (detail: string): never => {
    throw new ModelVerificationError('ATTESTATION_MALFORMED', `source attestation ${detail}`);
  };
  if (typeof a !== 'object' || a === null || Array.isArray(a)) malformed('is not an object');
  const o = a as Record<string, unknown>;
  const hex = (k: string, bits: 40 | 64): string => {
    const v = o[k];
    const re = bits === 40 ? /^[0-9a-f]{40}$/ : /^[0-9a-f]{64}$/;
    if (typeof v !== 'string' || !re.test(v)) malformed(`field ${k} is missing or malformed`);
    return v as string;
  };
  const att: SourceAttestation = {
    sourceHead: hex('sourceHead', 40),
    verificationHead: hex('verificationHead', 40),
    sourceFixtureTree: hex('sourceFixtureTree', 40),
    inputSha256: hex('inputSha256', 64),
    artifactInputSha256: hex('artifactInputSha256', 64),
    artifactHash: hex('artifactHash', 64),
    ancestryOk: o.ancestryOk as boolean,
    treesEqual: o.treesEqual as boolean,
    classes: (typeof o.classes === 'object' && o.classes !== null && !Array.isArray(o.classes) ? o.classes : {}) as Record<string, string>,
  };
  if (att.ancestryOk !== true || att.treesEqual !== true) malformed('does not certify ancestry and tree equality');
  for (const [k, v] of Object.entries(EXPECTED_CLASSES)) {
    if (att.classes[k] !== v) malformed(`class ${k} is not ${JSON.stringify(v)}`);
  }
  return att;
}

const SHA40 = /^[0-9a-f]{40}$/;
const SHA64 = /^[0-9a-f]{64}$/;

const sha40 = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !SHA40.test(value)) {
    throw new ModelVerificationError('BAD_SHA', `${field} must be 40 lowercase hex characters`);
  }
  return value;
};

const sha64 = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !SHA64.test(value)) {
    throw new ModelVerificationError('BAD_SHA', `${field} must be 64 lowercase hex characters`);
  }
  return value;
};

export type VerifyRegisteredProposalOptions = {
  repoRoot: string;
  /** Exact verification revision V. Must equal the registration's bound revision. */
  verificationSha: unknown;
  /** Claimed source revision of the original proposal (operator-reported). */
  sourceSha: unknown;
  /** Recomputed input hash and local artifact hash, carried as Zone P data. */
  inputSha256: unknown;
  artifactSha256: unknown;
  /** Must BE a registered proposal (identity, not field equality). */
  proposal: unknown;
  /** Run directory (gitignored): namespaced evidence and the verification file are written here. */
  outDir: string;
  lockPath: string;
  /** Shared with hand-authored runs: model and control replays never touch a stage at once. */
  coordinatorLockPath: string;
  git: ModelGit;
  runner?: Runner;
  stageRoot?: string;
  /**
   * Optional Zone P source-provenance record. When supplied it is structurally validated and
   * bound to the registration and the observed anchors before any staging, persisted beside
   * the evidence, and cross-checked by the verifier. Without it the row verifies Tier B
   * (replays recomputed, provenance unattested).
   */
  sourceAttestation?: unknown;
};

/**
 * Verify one registered stored-model proposal: certified REPRODUCED baseline at exactly V,
 * then up to three fresh disposable-stage replays, stopping at the first replay that is not
 * a complete clean pass. The returned entry's verdict fields come from `decideVerification`
 * over the persisted evidence. A refused run writes no scoreboard and (except for the lock
 * it holds) leaves no trace; a completed run records honestly whatever the evidence says.
 */
export async function verifyRegisteredProposal(opts: VerifyRegisteredProposalOptions): Promise<ModelVerificationEntry> {
  assertRegisteredModelProposal(opts.proposal);
  const proposal = opts.proposal;
  const runId = proposal.runId;
  const verificationSha = sha40(opts.verificationSha, 'verificationSha');
  const sourceSha = sha40(opts.sourceSha, 'sourceSha');
  const inputSha256 = sha64(opts.inputSha256, 'inputSha256');
  const artifactSha256 = sha64(opts.artifactSha256, 'artifactSha256');
  if (verificationSha !== proposal.approvedSha) {
    throw new ModelVerificationError('SHA_MISMATCH', 'the verification revision does not match the registration binding');
  }
  // The run labels must be the registered proposal's labels: valid-format but different hashes
  // can never produce a row, whatever they claim.
  if (sourceSha !== proposal.sourceSha || inputSha256 !== proposal.inputSha256 || artifactSha256 !== proposal.artifactSha256) {
    throw new ModelVerificationError('PROVENANCE_MISMATCH', 'the run labels do not match the registered proposal provenance');
  }
  if (verificationSha === sourceSha) throw new ModelVerificationError('CONFLATED', 'the source revision must not be the verification revision');
  if (!(await opts.git.commitExists(sourceSha))) throw new ModelVerificationError('UNKNOWN_SOURCE', 'the source commit is not present locally');
  if (!(await opts.git.commitExists(verificationSha))) throw new ModelVerificationError('UNKNOWN_VERIFICATION', 'the verification revision is not present locally');
  if (!(await opts.git.isAncestor(sourceSha, verificationSha))) {
    throw new ModelVerificationError('NOT_ANCESTOR', 'the source commit is not an ancestor of the verification revision');
  }
  const anchorPaths = [MODEL_FIXTURE_PATH, ...MODEL_IMMUTABLE_PATHS];
  const atSource = await Promise.all(anchorPaths.map((p) => opts.git.treeOf(sourceSha, p)));
  const atVerification = await Promise.all(anchorPaths.map((p) => opts.git.treeOf(verificationSha, p)));
  for (let i = 0; i < anchorPaths.length; i++) {
    if (!atSource[i] || !atVerification[i]) {
      throw new ModelVerificationError('ANCHOR_UNRESOLVABLE', `anchor ${anchorPaths[i]} is unresolvable at one revision`);
    }
    if (atSource[i] !== atVerification[i]) {
      throw new ModelVerificationError('ANCHOR_DRIFT', `anchor ${anchorPaths[i]} differs between the source and verification revisions`);
    }
  }
  const attestation = opts.sourceAttestation === undefined ? null : readAttestation(opts.sourceAttestation);
  if (attestation !== null) {
    const mismatch = (detail: string): never => {
      throw new ModelVerificationError('ATTESTATION_MISMATCH', `source attestation ${detail}`);
    };
    // The attestation is bound to this exact run: the registered provenance, the verification
    // revision and the Git-observed anchors. A well-formed attestation for another bundle is refused.
    if (attestation.sourceHead !== sourceSha) mismatch('names a different source revision');
    if (attestation.verificationHead !== verificationSha) mismatch('names a different verification revision');
    if (attestation.sourceFixtureTree !== atSource[0]) mismatch('names a different fixture tree');
    if (attestation.inputSha256 !== inputSha256) mismatch('recomputed a different input');
    if (attestation.artifactInputSha256 !== inputSha256) mismatch('artifact answers a different input');
    if (attestation.artifactHash !== artifactSha256) mismatch('names a different artifact');
  }
  // Belt-and-braces re-render: the frozen registered triples must still render to the bound CSS.
  let rendered: string;
  try {
    rendered = renderCssAdjustments(proposal.adjustments.map((a: CssAdjustment) => ({ ...a })));
  } catch (e) {
    throw new ModelVerificationError('RENDER_MISMATCH', `registered triples no longer render: ${(e as Error).message}`);
  }
  if (rendered !== proposal.renderedCss) throw new ModelVerificationError('RENDER_MISMATCH', 'registered CSS differs from a fresh render');

  const runner = opts.runner ?? runCandidate;
  const modelDir = path.join(opts.outDir, `MODEL-${runId}`);
  const rel = (d: string) => path.relative(opts.outDir, d).split(path.sep).join('/');

  await mkdir(path.dirname(opts.coordinatorLockPath), { recursive: true });
  let lock;
  try {
    lock = await open(opts.coordinatorLockPath, 'wx', 0o600);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new CoordinatorBusyError();
    throw e;
  }
  await lock.close();
  try {
    await mkdir(opts.outDir, { recursive: true, mode: 0o700 });
    const base = { repoRoot: opts.repoRoot, approvedSha: verificationSha, lockPath: opts.lockPath, stageRoot: opts.stageRoot };

    // The runner must attest the requested candidate: a record for a different patch is refused
    // before any evidence is finalized or persisted, so a faulty runner can never produce a
    // VERIFIED-looking bundle for the wrong CSS.
    const normTriples = (xs: unknown): string => {
      if (!Array.isArray(xs)) return 'not-a-list';
      return JSON.stringify(xs.map((x) => {
        const o = ((x ?? {}) as Record<string, unknown>);
        return [o.selector, o.property, o.value];
      }));
    };
    const run = async (n: number, dir: string, adjustments: CssAdjustment[]) => {
      const evidenceDir = path.join(modelDir, dir);
      const record = await runner({ ...base, label: `MODEL-${runId}`, adjustments, evidenceDir });
      const wantCss = renderCssAdjustments(adjustments);
      if (normTriples(record.adjustments) !== normTriples(adjustments) || record.renderedCss !== wantCss) {
        throw new ModelVerificationError('RECORD_MISMATCH', `replay ${n} record does not attest the requested candidate`);
      }
      const finalizedVerdict = record.outcome === 'ORACLE_PASS' || record.outcome === 'PATCH_FAILED';
      const evidence: ReplayEvidence = {
        record,
        evidenceProblems: finalizedVerdict ? await verifyPersistedEvidence(evidenceDir) : [],
      };
      const raw = await readFile(path.join(evidenceDir, RECORD_FILE)).catch(() => null);
      return { evidence, entry: buildReplayEntry(n, evidence, rel(evidenceDir), raw) };
    };

    const b = await run(1, path.join('baseline', 'replay-1'), []);
    const gate = baselineGate(b.evidence, verificationSha);

    const replays: ReplayEvidence[] = [];
    const entries: ReplayEntry[] = [];
    if (gate.reproduced) {
      for (let n = 1; n <= REPLAYS_REQUIRED_FOR_VERIFIED; n++) {
        const r = await run(n, path.join(`replay-${n}`), proposal.adjustments.map((a: CssAdjustment) => ({ ...a })));
        replays.push(r.evidence);
        entries.push(r.entry);
        if (replayPassProblems(r.evidence, verificationSha).length > 0) break; // stop at the first replay that is not a clean pass
      }
    }
    const d = decideVerification({ approvedSha: verificationSha, baseline: b.evidence, replays });
    const entry: ModelVerificationEntry = {
      schemaVersion: 2,
      kind: 'model-proposal-verification',
      id: `MODEL-${runId}`,
      provenance: 'model-proposal',
      candidateId: modelProposalIdOf(verificationSha, runId, rendered),
      adjustments: proposal.adjustments.map((a: CssAdjustment) => ({ ...a })),
      renderedCss: rendered,
      runId,
      verificationSha,
      sourceSha,
      sourceProvenance: 'operator-reported',
      inputSha256,
      artifactSha256,
      fixtureTreeSource: atSource[0]!,
      fixtureTreeVerification: atVerification[0]!,
      provenanceAttested: attestation !== null,
      baseline: { reproduced: gate.reproduced, reasons: gate.reasons, replay: b.entry },
      replays: entries,
      replaysRequired: REPLAYS_REQUIRED_FOR_VERIFIED,
      replaysAttempted: entries.length,
      replaysPassed: d.replaysPassed,
      status: d.status,
      reason: d.reason,
      complete: true,
    };
    const file = path.join(modelDir, VERIFICATION_FILE);
    await mkdir(modelDir, { recursive: true });
    await writeFile(`${file}.tmp`, JSON.stringify(entry, null, 2) + '\n', { mode: 0o600 });
    await rename(`${file}.tmp`, file);
    if (attestation !== null) {
      const attFile = path.join(modelDir, ATTESTATION_FILE);
      await writeFile(`${attFile}.tmp`, JSON.stringify(attestation, null, 2) + '\n', { mode: 0o600 });
      await rename(`${attFile}.tmp`, attFile);
    }
    return entry;
  } finally {
    await rm(opts.coordinatorLockPath, { force: true });
  }
}
