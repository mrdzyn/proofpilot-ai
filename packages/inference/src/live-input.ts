// C3-LIVE-01B: the provenance gate for the ONE real proposal input. The owner CLI never accepts "trusted facts" or a Symptom from its
// caller; it derives both from persisted evidence and re-verifies that evidence here, with no network and no provider:
//
//   trusted F01 facts  <- a CERTIFIED F01 baseline run (.proofpilot/runs/f01-baseline-*) produced by the trusted oracle at EXACTLY the
//                         current HEAD on a clean tree, for the current fixture tree. Every hashed artifact is re-hashed, the artifact
//                         set must be exactly the recorded set, and the verdict is RE-DERIVED from the oracle report and its
//                         observation attachments (extractOracleResults + classifyF01Baseline + certifyF01Baseline). The summary's own
//                         verdict is only cross-checked, never trusted.
//   validated Symptom  <- a LIVE (not mock) C2B video analysis whose video is bound by SHA-256 (and re-hashed on disk) to a certified
//                         exact-SHA F01 mobile-defect recording of the current fixture tree; the Symptom is re-validated with parseSymptom
//                         against the clip duration and must be assessed as worth a reproduction attempt. It stays an untrusted hypothesis.
//
// Local disk write access defeats any file-based provenance; this layer detects corruption, staleness and mix-ups, binds the evidence to
// the exact revision and fixture, and makes the operator approve the resulting input hash. It does not replace that approval.
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  assessSymptom, certifyF01Baseline, classifyF01Baseline, extractOracleResults, F01_MOBILE_TEST, F01_OBSERVATION_ATTACHMENT, parseSymptom,
  type F01Observation, type Symptom, type WorktreeState,
} from '../../core/src/index.ts';
import { isValidRunId } from '../../intake/src/consent.ts';
import { trustedFactsFromBaseline, type TrustedReproductionFacts } from './patch-proposal.ts';

export type LiveInputErrorCode =
  | 'ANALYSIS_ID_INVALID' | 'BASELINE_MISSING' | 'BASELINE_NOT_CERTIFIED' | 'BASELINE_REVISION' | 'BASELINE_TAMPERED' | 'BASELINE_NOT_REPRODUCED'
  | 'ANALYSIS_MISSING' | 'ANALYSIS_NOT_LIVE' | 'ANALYSIS_INVALID' | 'RECORDING_MISSING' | 'RECORDING_NOT_CERTIFIED' | 'RECORDING_TAMPERED' | 'SYMPTOM_INVALID' | 'SYMPTOM_INSUFFICIENT';

export class LiveInputError extends Error {
  readonly code: LiveInputErrorCode;
  constructor(code: LiveInputErrorCode, message: string) {
    super(message);
    this.name = 'LiveInputError';
    this.code = code;
  }
}
const fail = (code: LiveInputErrorCode, message: string): never => {
  throw new LiveInputError(code, message);
};

export type CertifiedInputSources = {
  baselineRunId: string;
  recordingSet: string;
  analysisId: string;
  gitHead: string;
  fixtureTree: string;
  videoSha256: string;
};
export type LiveProposalInput = { symptom: Symptom; facts: TrustedReproductionFacts; sources: CertifiedInputSources };

const SHA256 = /^[0-9a-f]{64}$/;
const SHA1 = /^[0-9a-f]{40}$/;
const BASELINE_DIR = /^f01-baseline-\d{8}T\d{6}Z-[0-9a-f]{6}$/;
const RECORDING_DIR = /^f01-\d{8}T\d{6}Z-[0-9a-f]{6}$/;
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const readJson = async (file: string): Promise<unknown> => JSON.parse(await readFile(file, 'utf8'));

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile()).map((e) => path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join('/'));
}

/** A relative path under `dir` with no traversal; anything else is evidence tampering. */
function inside(dir: string, rel: string): string {
  if (typeof rel !== 'string' || rel.length === 0 || path.isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) return fail('BASELINE_TAMPERED', 'an evidence path escapes its run directory');
  return path.join(dir, rel);
}

export async function loadCertifiedBaselineFacts(opts: { repoRoot: string; head: string; fixtureTree: string }): Promise<{ facts: TrustedReproductionFacts; runId: string }> {
  const { repoRoot, head, fixtureTree } = opts;
  if (!SHA1.test(head) || !SHA1.test(fixtureTree)) return fail('BASELINE_REVISION', 'the current revision or fixture tree is not a full Git object id');
  const runsDir = path.join(repoRoot, '.proofpilot/runs');
  const names = (await readdir(runsDir).catch(() => [] as string[])).filter((n) => BASELINE_DIR.test(n)).sort().reverse();
  let sawRevision = false;
  for (const name of names) {
    const runDir = path.join(runsDir, name);
    let summary: Record<string, any>;
    try {
      const raw = await readJson(path.join(runDir, 'baseline-summary.json'));
      if (!isRecord(raw)) continue;
      summary = raw;
    } catch {
      continue;
    }
    if (summary.gitHead !== head) continue;
    sawRevision = true;
    if (summary.certified !== true) continue;
    return verifyBaselineRun(runDir, name, summary, fixtureTree);
  }
  return sawRevision
    ? fail('BASELINE_NOT_CERTIFIED', `no certified F01 baseline run exists for HEAD ${head}; run \`pnpm f01:baseline\` on a clean checkout of exactly this revision`)
    : fail('BASELINE_MISSING', `no F01 baseline run exists for HEAD ${head}; run \`pnpm f01:baseline\` on a clean checkout of exactly this revision`);
}

async function verifyBaselineRun(runDir: string, name: string, summary: Record<string, any>, fixtureTree: string): Promise<{ facts: TrustedReproductionFacts; runId: string }> {
  if (summary.runId !== name) fail('BASELINE_TAMPERED', 'the summary names a different run');
  if (summary.fixtureTree !== fixtureTree) fail('BASELINE_REVISION', 'the baseline was recorded for a different fixture tree');
  if (summary.worktreeDirty !== false || !isRecord(summary.worktree) || summary.worktree.kind !== 'clean') fail('BASELINE_NOT_CERTIFIED', 'the baseline was not recorded on a clean evidence tree');
  if (!Number.isInteger(summary.oracleExitCode) || summary.oracleExitCode === 0) fail('BASELINE_NOT_REPRODUCED', 'the oracle must have failed on the baseline');
  if (!Array.isArray(summary.artifacts) || summary.artifacts.length === 0) fail('BASELINE_TAMPERED', 'the summary lists no artifacts');

  // 1. every recorded artifact still has its recorded size and SHA-256, and the artifact set is exactly the recorded set
  const recorded = new Map<string, string>();
  for (const a of summary.artifacts as Array<Record<string, unknown>>) {
    if (!isRecord(a) || typeof a.relativePath !== 'string' || typeof a.sha256 !== 'string' || !SHA256.test(a.sha256) || !Number.isInteger(a.bytes) || recorded.has(a.relativePath)) return fail('BASELINE_TAMPERED', 'an artifact entry is malformed or duplicated');
    const bytes = await readFile(inside(runDir, a.relativePath)).catch(() => null);
    if (!bytes || bytes.length !== a.bytes || sha256(bytes) !== a.sha256) return fail('BASELINE_TAMPERED', `artifact ${a.relativePath} is missing or changed`);
    recorded.set(a.relativePath, a.sha256);
  }
  const actual = (await listFiles(runDir)).filter((f) => f !== 'baseline-summary.json' && f !== 'metrics.json').sort();
  if (actual.join('\n') !== [...recorded.keys()].sort().join('\n')) fail('BASELINE_TAMPERED', 'the run directory holds files that are not in the recorded artifact set');
  if (!recorded.has('oracle-report.json')) fail('BASELINE_TAMPERED', 'the oracle report is not among the recorded artifacts');

  // 2. re-derive the verdict from the oracle report and its observation attachments; the summary's own verdict is not trusted
  const report = JSON.parse(await readFile(path.join(runDir, 'oracle-report.json'), 'utf8'));
  const results = extractOracleResults(report);
  for (const r of results) {
    const att = r.attachments.find((a) => a.name === F01_OBSERVATION_ATTACHMENT && a.path);
    if (!att?.path) {
      r.observation = null;
      continue;
    }
    const marker = att.path.split(path.sep).join('/').lastIndexOf('/test-results/');
    const rel = path.isAbsolute(att.path) ? (att.path.startsWith(runDir + path.sep) ? path.relative(runDir, att.path) : marker >= 0 ? att.path.split(path.sep).join('/').slice(marker + 1) : '') : att.path;
    if (!recorded.has(rel.split(path.sep).join('/'))) fail('BASELINE_TAMPERED', 'an observation attachment is outside the recorded artifact set');
    r.observation = JSON.parse(await readFile(inside(runDir, rel), 'utf8')) as F01Observation;
  }
  const classification = classifyF01Baseline(results);
  const certification = certifyF01Baseline({ classification, oracleExitCode: summary.oracleExitCode as number, worktree: summary.worktree as WorktreeState });
  if (classification.verdict !== 'REPRODUCED' || classification.regression !== 'PASS' || !certification.certified) fail('BASELINE_NOT_REPRODUCED', `the baseline is not a certified reproduction: ${[...classification.reasons, ...certification.reasons].join('; ') || classification.verdict}`);
  if (!isRecord(summary.classification) || summary.classification.verdict !== classification.verdict || summary.classification.regression !== classification.regression) fail('BASELINE_TAMPERED', 'the summary disagrees with the re-derived classification');
  const mobile = results.find((r) => r.title === F01_MOBILE_TEST);
  if (!mobile?.observation) return fail('BASELINE_NOT_REPRODUCED', 'the mobile observation is missing');
  return { facts: trustedFactsFromBaseline(mobile.observation, true), runId: name };
}

export async function loadCertifiedProposalInput(opts: { repoRoot: string; head: string; fixtureTree: string; analysisId: string }): Promise<LiveProposalInput> {
  const { repoRoot, head, fixtureTree, analysisId } = opts;
  if (!isValidRunId(analysisId)) return fail('ANALYSIS_ID_INVALID', 'the analysis id is malformed');
  const { facts, runId: baselineRunId } = await loadCertifiedBaselineFacts({ repoRoot, head, fixtureTree });

  // the video analysis: LIVE evidence only, a completed Meta response, a valid clip
  const file = path.join(repoRoot, '.proofpilot/analysis', analysisId, 'analysis.json');
  const doc = await readJson(file).catch(() => null);
  if (!isRecord(doc)) return fail('ANALYSIS_MISSING', `no analysis record at .proofpilot/analysis/${analysisId}/analysis.json`);
  if (doc.schemaVersion !== 1 || !isRecord(doc.result)) return fail('ANALYSIS_INVALID', 'the analysis record has an unexpected shape');
  if (doc.evidenceKind !== 'live') return fail('ANALYSIS_NOT_LIVE', 'only a live (not mock) analysis can seed a real proposal');
  const result = doc.result as Record<string, any>;
  const prov = result.provenance;
  if (result.status !== 'VIDEO_ANALYZED' || !isRecord(prov) || prov.providerId !== 'meta' || prov.runId !== analysisId || !isRecord(prov.responseLifecycle) || prov.responseLifecycle.completed !== true || !isRecord(prov.video)) return fail('ANALYSIS_INVALID', 'the analysis is not a completed Meta video analysis for this run id');
  const videoSha = prov.video.sha256;
  const duration = prov.video.durationSec;
  if (typeof videoSha !== 'string' || !SHA256.test(videoSha) || typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) return fail('ANALYSIS_INVALID', 'the analysis does not identify its video');

  // the video is bound to a certified exact-SHA mobile-defect recording of THIS fixture
  const recRoot = path.join(repoRoot, '.proofpilot/recordings');
  let recordingSet: string | null = null;
  for (const set of (await readdir(recRoot).catch(() => [] as string[])).filter((n) => RECORDING_DIR.test(n)).sort().reverse()) {
    const meta = await readJson(path.join(recRoot, set, 'mobile-defect/recording.json')).catch(() => null);
    if (!isRecord(meta) || !isRecord(meta.video) || meta.video.sha256 !== videoSha) continue;
    const src = meta.source;
    if (meta.kind !== 'mobile-defect' || meta.outcomeAsExpected !== true || !isRecord(src) || src.certifiedExactSha !== true || src.fixtureTree !== fixtureTree) return fail('RECORDING_NOT_CERTIFIED', 'the recording of this video is not a certified exact-SHA recording of the current fixture');
    const mp4 = await readFile(path.join(recRoot, set, 'mobile-defect', path.basename(String(meta.video.path)))).catch(() => null);
    if (!mp4 || sha256(mp4) !== videoSha || mp4.length !== meta.video.bytes) return fail('RECORDING_TAMPERED', 'the recorded video file is missing or changed');
    recordingSet = set;
    break;
  }
  if (!recordingSet) return fail('RECORDING_MISSING', 'no certified F01 mobile-defect recording matches the analyzed video');

  // the Symptom is re-validated against the clip; it remains an untrusted hypothesis
  const { schemaVersion, provenance, ...body } = (result.symptom ?? {}) as Record<string, unknown>;
  if (schemaVersion !== 1 || provenance !== 'model-hypothesis') return fail('SYMPTOM_INVALID', 'the stored symptom is not a model-hypothesis record');
  let symptom: Symptom;
  try {
    symptom = parseSymptom(body, { videoDurationSec: duration });
  } catch {
    return fail('SYMPTOM_INVALID', 'the stored symptom does not pass validation');
  }
  if (!assessSymptom(symptom).canAttemptReproduction) return fail('SYMPTOM_INSUFFICIENT', 'the symptom is not sufficient for a reproduction attempt');
  await stat(file); // (kept for symmetry: the analysis file existed when read)
  return { symptom, facts, sources: { baselineRunId, recordingSet, analysisId, gitHead: head, fixtureTree, videoSha256: videoSha } };
}
