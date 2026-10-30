// C3-B1 offline candidate verification coordinator (hand-authored controls only).
//
// It drives the existing C3-0 staging runner (runCandidate) serially: one fresh disposable stage per
// replay, the unmodified oracle, trace-based proof that the staged CSS was served, mandatory hashed
// evidence. A single oracle pass is only ORACLE_PASS. VERIFIED needs a certified REPRODUCED baseline
// and three complete, mutually consistent, fresh passing replays of the identical candidate under one
// approved SHA, and it is recomputed from the persisted evidence by verifyScoreboard() so a forged or
// stale scoreboard cannot claim it. Inputs are host-rendered hand-authored adjustments: no model text
// reaches this module, and nothing here imports a provider.
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import path from 'node:path';
import { renderCssAdjustments, type CssAdjustment } from './css-adjustments.ts';
import { ORACLE_PORT, runCandidate, verifyPersistedEvidence, RECORD_FILE, type CandidateRecord, type RunCandidateOptions } from './candidate-stage.ts';

export const REPLAYS_REQUIRED_FOR_VERIFIED = 3;
export const SCOREBOARD_FILE = 'scoreboard.json';

export type CandidateStatus = 'VERIFIED' | 'ORACLE_PASS' | 'PATCH_FAILED' | 'PATCH_REJECTED' | 'INCONCLUSIVE' | 'NOT_REPRODUCED';

export type ReplayEvidence = { record: CandidateRecord; evidenceProblems: string[] };

const sha256 = (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex');

/**
 * Identity of a candidate across replays: the approved SHA plus the exact host-rendered CSS.
 * Hand-authored callers pass two arguments and their ids are byte-identical to before. A stored
 * model proposal passes a provenance tag (`model-proposal:<runId>`, via modelProposalIdOf in
 * model-proposal.ts), so identical CSS never collides with, merges into or satisfies a
 * hand-authored row.
 */
export function candidateIdOf(approvedSha: string, renderedCss: string, provenanceTag?: string): string {
  return provenanceTag === undefined
    ? sha256(`${approvedSha}\n${renderedCss}`)
    : sha256(`${provenanceTag}\n${approvedSha}\n${renderedCss}`);
}

// ------------------------------------------------------------ pure decisions

/** Reasons a replay is NOT a complete, clean, fresh oracle pass. Empty means it is. */
const PROOF_TESTS = ['F01-MOBILE', 'F01-DESKTOP'] as const;

/** Exactly one valid source proof per viewport: no duplicates, no missing or misnamed identities. */
function sourceProofProblems(r: CandidateRecord): string[] {
  const p: string[] = [];
  const names = r.sourceProof.map((s) => s.test);
  if (r.sourceProof.length !== PROOF_TESTS.length) p.push(`expected ${PROOF_TESTS.length} source proofs, found ${r.sourceProof.length}`);
  for (const t of PROOF_TESTS) {
    const n = names.filter((x) => x === t).length;
    if (n !== 1) p.push(`expected exactly one ${t} source proof, found ${n}`);
  }
  for (const n of names) if (!(PROOF_TESTS as readonly string[]).includes(n)) p.push(`unexpected source proof label ${JSON.stringify(n)}`);
  for (const s of r.sourceProof) {
    if (!s.served || !s.bytesEqualStaged || !s.hasNonce) p.push(`source proof failed for ${s.test}`);
    if (r.manifest && s.servedSha256 !== r.manifest.candidateCss.sha256) p.push(`served CSS hash differs from the staged candidate for ${s.test}`);
  }
  return p;
}

/** The record and its manifest must both name the scoreboard's approved SHA. */
function shaProblems(r: CandidateRecord, approvedSha: string): string[] {
  const p: string[] = [];
  if (r.approvedSha !== approvedSha) p.push(`ran under ${String(r.approvedSha).slice(0, 12)}, not the approved SHA`);
  if (r.manifest && r.manifest.approvedSha !== approvedSha) p.push('manifest names a different approved SHA');
  return p;
}

export function replayPassProblems(e: ReplayEvidence, approvedSha: string): string[] {
  const r = e.record;
  const p: string[] = [...shaProblems(r, approvedSha)];
  if (r.outcome !== 'ORACLE_PASS') p.push(`outcome is ${r.outcome}`);
  if (r.failure) p.push(`failure recorded: ${r.failure.code}`);
  if (!r.oracleRan) p.push('the oracle did not run');
  if (r.oracleExitCode !== 0) p.push(`oracle exit code ${r.oracleExitCode}`);
  if (!r.evidenceFinalized) p.push('evidence was not finalized');
  for (const x of e.evidenceProblems) p.push(`evidence: ${x}`);
  if (r.integrityAfterRun !== 'intact') p.push(`integrity after run: ${r.integrityAfterRun}`);
  if (!r.stageRemoved) p.push('the stage was not removed');
  if (!r.manifest) p.push('no manifest');
  const ok = (t: CandidateRecord['mobile']) => t !== null && t.status === 'passed' && t.hitTestTarget === 'add-to-cart' && t.cartCountAfter === '1';
  if (!ok(r.mobile)) p.push('mobile did not pass with the tap received by add-to-cart and cart 1');
  if (!ok(r.desktop)) p.push('desktop regression control did not pass with the tap received by add-to-cart and cart 1');
  p.push(...sourceProofProblems(r));
  if (r.requiredEvidence.length < 6) p.push('required evidence list is incomplete');
  return p;
}

/** A certified baseline: the unmodified F01 reproduces the defect (mobile fails by interception, desktop passes) with intact evidence. */
export function baselineGate(e: ReplayEvidence, approvedSha: string): { reproduced: boolean; reasons: string[] } {
  const r = e.record;
  const reasons: string[] = [...shaProblems(r, approvedSha).map((x) => `baseline ${x}`)];
  if (!r.manifest) reasons.push('baseline has no manifest');
  if (r.outcome !== 'PATCH_FAILED') reasons.push(`baseline stage outcome is ${r.outcome}, expected PATCH_FAILED`);
  if (!r.baselineIdentical) reasons.push('the oracle did not classify the run as REPRODUCED');
  if (r.oracleExitCode !== 1) reasons.push(`baseline oracle exit ${r.oracleExitCode}, expected 1`);
  if (r.renderedCss !== '') reasons.push('the baseline stage must carry no adjustments');
  if (r.mobile?.status !== 'failed' || r.mobile.cartCountAfter !== '0' || r.mobile.hitTestTarget === 'add-to-cart' || r.mobile.hitTestTarget === null) reasons.push('mobile did not fail by interception with the cart unchanged');
  if (r.desktop?.status !== 'passed') reasons.push('the desktop control did not pass');
  if (!r.evidenceFinalized) reasons.push('baseline evidence was not finalized');
  for (const x of e.evidenceProblems) reasons.push(`evidence: ${x}`);
  if (r.integrityAfterRun !== 'intact' || !r.stageRemoved) reasons.push('baseline stage integrity or cleanup failed');
  for (const x of sourceProofProblems(r)) reasons.push(`baseline ${x}`);
  return { reproduced: reasons.length === 0, reasons };
}

export type Decision = { status: CandidateStatus; replaysPassed: number; reason: string | null };

/**
 * The only place VERIFIED is decided. Pure, so it can be recomputed from persisted evidence.
 * VERIFIED requires: a reproduced baseline, exactly three replays, every replay a complete clean
 * pass, and all replays identical in approved SHA, candidate CSS, adjustments and trusted-file
 * manifest while each carries its own fresh nonce.
 */
export function decideVerification(input: { approvedSha: string; baseline: ReplayEvidence | null; replays: ReplayEvidence[] }): Decision {
  const { approvedSha, baseline, replays } = input;
  const gate = baseline ? baselineGate(baseline, approvedSha) : { reproduced: false, reasons: ['no baseline evidence'] };
  if (!gate.reproduced) return { status: 'NOT_REPRODUCED', replaysPassed: 0, reason: `the baseline was not certified as REPRODUCED under the approved SHA${gate.reasons[0] ? ` (${gate.reasons[0]})` : ''}` };
  if (replays.length === 0) return { status: 'INCONCLUSIVE', replaysPassed: 0, reason: 'no replay was run' };
  let passed = 0;
  for (let i = 0; i < replays.length; i++) {
    const problems = replayPassProblems(replays[i]!, approvedSha);
    if (problems.length === 0) {
      passed++;
      continue;
    }
    const outcome = replays[i]!.record.outcome;
    const clean = replays[i]!.evidenceProblems.length === 0 && replays[i]!.record.evidenceFinalized;
    const status: CandidateStatus = outcome === 'PATCH_REJECTED' ? 'PATCH_REJECTED' : outcome === 'PATCH_FAILED' && clean ? 'PATCH_FAILED' : 'INCONCLUSIVE';
    return { status, replaysPassed: passed, reason: `replay ${i + 1}: ${problems[0]}` };
  }
  if (replays.length > REPLAYS_REQUIRED_FOR_VERIFIED) return { status: 'INCONCLUSIVE', replaysPassed: passed, reason: 'unexpected number of replays' };
  if (replays.length < REPLAYS_REQUIRED_FOR_VERIFIED) return { status: 'ORACLE_PASS', replaysPassed: passed, reason: `${passed} of ${REPLAYS_REQUIRED_FOR_VERIFIED} replays; not verified` };

  const first = replays[0]!.record;
  const baselineTrusted = JSON.stringify(baseline!.record.manifest!.trusted);
  const nonces = new Set<string>();
  for (const { record } of replays) {
    if (record.renderedCss !== first.renderedCss || JSON.stringify(record.adjustments) !== JSON.stringify(first.adjustments)) return { status: 'INCONCLUSIVE', replaysPassed: passed, reason: 'replays ran different candidates' };
    const trusted = JSON.stringify(record.manifest!.trusted);
    if (trusted !== JSON.stringify(first.manifest!.trusted)) return { status: 'INCONCLUSIVE', replaysPassed: passed, reason: 'trusted file hashes differ between replays' };
    if (trusted !== baselineTrusted) return { status: 'INCONCLUSIVE', replaysPassed: passed, reason: 'trusted file hashes differ from the certified baseline' };
    nonces.add(record.manifest!.candidateCss.nonce);
  }
  if (nonces.size !== replays.length) return { status: 'INCONCLUSIVE', replaysPassed: passed, reason: 'replays were not fresh (a nonce repeated)' };
  return { status: 'VERIFIED', replaysPassed: passed, reason: null };
}

// ------------------------------------------------------------ controls

export type FaultKind = 'stage-tamper' | 'busy-port';
export type Control = {
  id: string;
  description: string;
  adjustments: CssAdjustment[];
  /** Replays attempted while they keep passing; only a control that passes all of them can be VERIFIED. */
  replays: number;
  expect: CandidateStatus;
  /** Hand-authored fault injected into the stage run (negative controls NC-6 and NC-7). */
  fault?: FaultKind;
  /** Extra expectations on the evidence, returning problems. */
  check?: (replays: ReplayEvidence[]) => string[];
};

const add = (selector: string, property: string, value: string): CssAdjustment => ({ selector, property, value });

/** Every control is hand-authored: no model, provider or user text produces any of these inputs. */
const DEFINED_CONTROLS: Control[] = [
  {
    id: 'NC-1', description: 'no-op: empty adjustments', adjustments: [], replays: 1, expect: 'PATCH_FAILED',
    check: (r) => (r[0]?.record.baselineIdentical ? [] : ['not baseline-identical']),
  },
  {
    id: 'NC-1b', description: 'irrelevant allowed rule: .promo z-index 5', adjustments: [add('.promo', 'z-index', '5')], replays: 1, expect: 'PATCH_FAILED',
    check: (r) => (r[0]?.record.baselineIdentical ? [] : ['not baseline-identical']),
  },
  {
    id: 'NC-3', description: 'regression: .add-to-cart pointer-events none (both oracle tests must fail)', adjustments: [add('.add-to-cart', 'pointer-events', 'none')], replays: 1, expect: 'PATCH_FAILED',
    check: (r) => [...(r[0]?.record.mobile?.status === 'failed' ? [] : ['mobile did not fail']), ...(r[0]?.record.desktop?.status === 'failed' ? [] : ['desktop did not fail'])],
  },
  { id: 'NC-6', description: 'stage tamper between manifest and run (verifier file edited in the stage)', adjustments: [add('.promo-overlay', 'pointer-events', 'none')], replays: 1, expect: 'INCONCLUSIVE', fault: 'stage-tamper', check: (r) => (r[0]?.record.oracleRan === false && r[0]?.record.failure?.code === 'TAMPER' ? [] : ['expected TAMPER with the oracle never run']) },
  { id: 'NC-7', description: 'port 4173 held by another listener', adjustments: [add('.promo-overlay', 'pointer-events', 'none')], replays: 1, expect: 'INCONCLUSIVE', fault: 'busy-port', check: (r) => (r[0]?.record.oracleRan === false && r[0]?.record.failure?.code === 'PORT_BUSY' ? [] : ['expected PORT_BUSY with the oracle never run']) },
  { id: 'PC-1', description: 'hand-written correct fix: .promo-overlay pointer-events none', adjustments: [add('.promo-overlay', 'pointer-events', 'none')], replays: REPLAYS_REQUIRED_FOR_VERIFIED, expect: 'VERIFIED' },
];

/**
 * Provenance by construction (C3-B2A MAJOR-1): the only controls the coordinator will run are these exact objects. They are
 * deep-frozen (adjustments, the control itself and the list) and registered by identity in a module-private set, so a copy
 * with identical fields, a model-derived clone, or a control carrying a foreign `check` callback is not one of them, whatever
 * its CSS says. There is deliberately no production way to add to the set.
 */
const TRUSTED_CONTROLS = new WeakSet<object>();
for (const c of DEFINED_CONTROLS) {
  for (const a of c.adjustments) Object.freeze(a);
  Object.freeze(c.adjustments);
  Object.freeze(c);
  TRUSTED_CONTROLS.add(c);
}
export const HAND_AUTHORED_CONTROLS: readonly Control[] = Object.freeze(DEFINED_CONTROLS);


export const NC5_DESCRIPTION = 'verdict logic applied to a real staged tree whose oracle passes (the PC-1 stage) as if it were the baseline';

/** Expectation problems for a control, recomputable from persisted evidence. */
export function expectationProblemsOf(c: Control, d: Decision, replays: ReplayEvidence[], baselineReproduced: boolean): string[] {
  return [...(d.status === c.expect ? [] : [`status ${d.status}, expected ${c.expect}`]), ...(c.check && baselineReproduced ? c.check(replays) : [])];
}

/** NC-5: the verdict logic with a real tree whose oracle PASSES (the first PC-1 stage) standing in for the baseline. */
export function nc5Of(approvedSha: string, pc1: ReplayEvidence[]): Scoreboard['nc5'] {
  const asBaseline = pc1[0] ?? null;
  const gate = asBaseline ? baselineGate(asBaseline, approvedSha) : { reproduced: false };
  const d = decideVerification({ approvedSha, baseline: asBaseline, replays: pc1 });
  return { description: NC5_DESCRIPTION, baselineReproduced: gate.reproduced, status: d.status, neverVerified: d.status !== 'VERIFIED' };
}

/** How many replays a truthful run attempted: it stops at the first replay that is not a clean pass, and attempts none without a reproduced baseline. */
export function expectedAttempts(c: Control, baselineReproduced: boolean, replays: ReplayEvidence[], approvedSha: string): boolean {
  if (!baselineReproduced) return replays.length === 0;
  const firstBad = replays.findIndex((r) => replayPassProblems(r, approvedSha).length > 0);
  return firstBad >= 0 ? replays.length === firstBad + 1 : replays.length === c.replays;
}

// ------------------------------------------------------------ coordinator

export type Runner = (opts: RunCandidateOptions) => Promise<CandidateRecord>;

export type ReplayEntry = {
  n: number;
  outcome: CandidateRecord['outcome'];
  failureCode: string | null;
  failureMessage: string | null;
  oracleExitCode: number | null;
  evidenceDir: string;
  recordSha256: string | null;
  candidateCssSha256: string | null;
  nonce: string | null;
  mobile: CandidateRecord['mobile'];
  desktop: CandidateRecord['desktop'];
  servedCssSha256: string[];
  evidenceFinalized: boolean;
  evidenceProblems: string[];
};

export type CandidateEntry = {
  id: string;
  description: string;
  provenance: 'hand-authored-control';
  candidateId: string;
  adjustments: CssAdjustment[];
  renderedCss: string;
  fault: FaultKind | null;
  replaysRequired: number;
  replaysAttempted: number;
  replaysPassed: number;
  status: CandidateStatus;
  reason: string | null;
  expected: CandidateStatus;
  expectationMet: boolean;
  expectationProblems: string[];
  replays: ReplayEntry[];
};

/**
 * A board that carries registered model-proposal rows must use this label instead of the
 * hand-authored-only label, so no reader can mistake the board for model-free. The rows
 * themselves are never `VERIFIED`: E1 registers, it never runs.
 */
export const MODEL_BOARD_LABEL = 'HAND-AUTHORED CONTROLS PLUS REGISTERED MODEL-PROPOSAL ROWS — NOT RUN, NOT VERIFIED';

/**
 * A registered stored-model-proposal row (C3-B2B E1). It lives in its own scoreboard section,
 * never in `candidates`, carries the provenance-tagged identity, and claims no verdict: E1
 * registers, it never runs. `sourceProvenance` is always the literal `operator-reported`; the
 * row is bound to one verification revision by both `approvedSha` and the candidate id.
 */
export type ModelProposalEntry = {
  id: string;
  description: string;
  provenance: 'model-proposal';
  candidateId: string;
  adjustments: CssAdjustment[];
  renderedCss: string;
  runId: string;
  approvedSha: string;
  sourceSha: string;
  sourceProvenance: 'operator-reported';
  inputSha256: string;
  artifactSha256: string;
  /** E1: always empty. Any replay here is refused until E2 authorizes execution. */
  replays: ReplayEntry[];
  note: string;
};

export type Scoreboard = {
  schemaVersion: 1;
  label: 'HAND-AUTHORED CONTROLS ONLY — NO MODEL INPUT' | typeof MODEL_BOARD_LABEL;
  complete: boolean;
  approvedSha: string;
  createdAt: string;
  modelOrProviderCalls: 0;
  modalCalls: 0;
  baseline: { reproduced: boolean; reasons: string[]; replay: ReplayEntry };
  candidates: CandidateEntry[];
  /** NC-5: the verdict logic applied to a real staged tree where the oracle PASSES (the PC-1 stage) in place of the baseline. */
  nc5: { description: string; baselineReproduced: boolean; status: CandidateStatus; neverVerified: boolean };
  notes: string[];
  /** Optional separate section for registered model-proposal rows. Absent on pre-E1 boards. */
  modelProposals?: ModelProposalEntry[];
};

/**
 * Fail-closed field checks for one model-proposal row, recomputed from the persisted row and
 * the trusted grammar. The identity, CSS and hashes are re-derived; the provenance classes are
 * asserted literally. Cross-row separation (distinct ids, no hand-authored collision) is
 * checked by verifyScoreboard below.
 */
export function modelRowProblems(m: unknown, sha: string): string[] {
  if (typeof m !== 'object' || m === null || Array.isArray(m)) return ['model-proposal row is not an object'];
  const p: string[] = [];
  const r = m as Record<string, unknown>;
  if (r.provenance !== 'model-proposal') p.push(`provenance is ${JSON.stringify(r.provenance)}, expected "model-proposal"`);
  if (typeof r.runId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(r.runId)) {
    p.push('runId is missing or malformed');
  } else if (r.id !== `MODEL-${r.runId}`) {
    p.push(`id is ${JSON.stringify(r.id)}, expected "MODEL-${r.runId}"`);
  }
  if (typeof r.description !== 'string' || r.description.length === 0 || r.description.length > 300) {
    p.push('description is missing or oversized');
  }
  if (r.sourceProvenance !== 'operator-reported') p.push('source revision must stay labelled operator-reported, never verified');
  if (typeof r.sourceSha !== 'string' || !/^[0-9a-f]{40}$/.test(r.sourceSha)) p.push('sourceSha is missing or malformed');
  if (typeof r.inputSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(r.inputSha256)) p.push('inputSha256 is missing or malformed');
  if (typeof r.artifactSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(r.artifactSha256)) p.push('artifactSha256 is missing or malformed');
  if (typeof r.approvedSha !== 'string' || r.approvedSha !== sha) p.push('row is not bound to the scoreboard approved SHA');
  const triples = r.adjustments;
  if (!Array.isArray(triples) || triples.length === 0) {
    p.push('adjustments must be a non-empty list');
  } else {
    const clean: CssAdjustment[] = [];
    triples.forEach((t, i) => {
      if (typeof t !== 'object' || t === null) {
        p.push(`adjustment ${i} is not an object`);
        return;
      }
      const proto: unknown = Object.getPrototypeOf(t);
      if (proto !== Object.prototype && proto !== null) {
        p.push(`adjustment ${i} is not plain data`);
        return;
      }
      const keys = Object.keys(t);
      if (keys.length !== 3 || !['selector', 'property', 'value'].every((k) => keys.includes(k))) {
        p.push(`adjustment ${i} must hold exactly selector, property and value`);
        return;
      }
      const rec = t as Record<string, unknown>;
      if (typeof rec.selector !== 'string' || typeof rec.property !== 'string' || typeof rec.value !== 'string') {
        p.push(`adjustment ${i} fields must be strings`);
        return;
      }
      clean.push({ selector: rec.selector, property: rec.property, value: rec.value });
    });
    if (clean.length === triples.length) {
      let rendered: string | null = null;
      try {
        rendered = renderCssAdjustments(clean);
      } catch (e) {
        p.push(`adjustments violate the closed grammar: ${(e as Error).message}`);
      }
      if (rendered !== null) {
        if (r.renderedCss !== rendered) p.push('renderedCss differs from the freshly rendered bytes');
        // The tag template is restated here (canonical: modelProposalTagOf in model-proposal.ts)
        // so the coordinator keeps no runtime edge to the bridge module.
        if (typeof r.runId === 'string' && r.candidateId !== candidateIdOf(sha, rendered, `model-proposal:${r.runId}`)) {
          p.push('candidate id does not match the provenance-tagged identity');
        }
      }
    }
  }
  if (!Array.isArray(r.replays)) {
    p.push('replays is not a list');
  } else if (r.replays.length > 0) {
    p.push('model-proposal replays are not authorized before E2 (E1 registers only)');
  }
  if (typeof r.note !== 'string' || r.note.length === 0) p.push('note is missing');
  return p;
}

export class UntrustedControlError extends Error {
  constructor(detail: string) {
    super(`refused: ${detail}. The offline coordinator only runs the in-code hand-authored controls; model-derived proposals may not enter this path (C3-B2A).`);
    this.name = 'UntrustedControlError';
  }
}

/** Every control handed to the coordinator must BE one of the trusted in-code control objects (identity, not field equality), once each. */
export function assertHandAuthoredControls(controls: readonly Control[]): void {
  if (!Array.isArray(controls)) throw new UntrustedControlError('controls is not a list');
  const seen = new Set<object>();
  for (const c of controls) {
    if (typeof c !== 'object' || c === null || !TRUSTED_CONTROLS.has(c)) throw new UntrustedControlError(`control ${JSON.stringify((c as Control | undefined)?.id)} is not one of the in-code hand-authored controls (copies are refused even when every field matches)`);
    if (seen.has(c)) throw new UntrustedControlError(`control ${c.id} is duplicated`);
    seen.add(c);
  }
}

export class CoordinatorBusyError extends Error {
  constructor() {
    super('another coordinator run holds the lock (or a crashed run left it); nothing was run and nothing can be verified');
    this.name = 'CoordinatorBusyError';
  }
}

function holdPort(port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(port, '127.0.0.1', () => resolve(s));
  });
}

async function readEvidence(record: CandidateRecord, evidenceDir: string): Promise<ReplayEvidence> {
  const finalizedVerdict = record.outcome === 'ORACLE_PASS' || record.outcome === 'PATCH_FAILED';
  return { record, evidenceProblems: finalizedVerdict ? await verifyPersistedEvidence(evidenceDir) : [] };
}

/**
 * The single source of every published ReplayEntry field. The coordinator publishes what this returns and
 * verifyScoreboard() rebuilds it from the persisted record, its file bytes and the independent evidence
 * check, then compares EVERY field, so no display field can be edited without detection.
 */
export function buildReplayEntry(n: number, e: ReplayEvidence, rel: string, recordBytes: Uint8Array | null): ReplayEntry {
  const r = e.record;
  return {
    n, outcome: r.outcome, failureCode: r.failure?.code ?? null, failureMessage: r.failure?.message ?? null, oracleExitCode: r.oracleExitCode,
    evidenceDir: rel, recordSha256: recordBytes ? sha256(recordBytes) : null, candidateCssSha256: r.manifest?.candidateCss.sha256 ?? null, nonce: r.manifest?.candidateCss.nonce ?? null,
    mobile: r.mobile, desktop: r.desktop, servedCssSha256: r.sourceProof.map((s) => s.servedSha256 ?? ''), evidenceFinalized: r.evidenceFinalized, evidenceProblems: e.evidenceProblems,
  };
}

async function entryOf(n: number, e: ReplayEvidence, evidenceDir: string, rel: string): Promise<ReplayEntry> {
  return buildReplayEntry(n, e, rel, await readFile(path.join(evidenceDir, RECORD_FILE)).catch(() => null));
}

export type CoordinatorOptions = {
  repoRoot: string;
  approvedSha: string;
  /** Run directory (gitignored): evidence per replay and the scoreboard are written here. */
  outDir: string;
  lockPath: string;
  coordinatorLockPath: string;
  controls?: readonly Control[];
  runner?: Runner;
  stageRoot?: string;
  now?: () => Date;
};

/** Runs the baseline gate and then each control serially. Never runs two coordinators at once. */
export async function runOfflineVerification(opts: CoordinatorOptions): Promise<Scoreboard> {
  const runner = opts.runner ?? runCandidate;
  const controls = opts.controls ?? HAND_AUTHORED_CONTROLS;
  assertHandAuthoredControls(controls); // before any lock, stage or browser
  const now = opts.now ?? (() => new Date());

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
    const rel = (d: string) => path.relative(opts.outDir, d).split(path.sep).join('/');
    const base = { repoRoot: opts.repoRoot, approvedSha: opts.approvedSha, lockPath: opts.lockPath, stageRoot: opts.stageRoot };

    const run = async (label: string, id: string, n: number, adjustments: CssAdjustment[], fault?: FaultKind) => {
      const evidenceDir = path.join(opts.outDir, id, `replay-${n}`);
      let holder: Server | null = null;
      try {
        if (fault === 'busy-port') holder = await holdPort(ORACLE_PORT);
        const record = await runner({
          ...base, label, adjustments, evidenceDir,
          hooks: fault === 'stage-tamper' ? { beforeRun: (stage: string) => appendFileSync(path.join(stage, 'verifier/f01/f01.oracle.spec.ts'), '\n// tampered by NC-6\n') } : undefined,
        });
        const evidence = await readEvidence(record, evidenceDir);
        return { evidence, entry: await entryOf(n, evidence, evidenceDir, rel(evidenceDir)) };
      } finally {
        if (holder) await new Promise<void>((r) => holder!.close(() => r()));
      }
    };

    // ---- baseline gate (fresh stage, no adjustments) ----
    const b = await run('BASELINE', 'BASELINE', 1, []);
    const gate = baselineGate(b.evidence, opts.approvedSha);

    // ---- controls ----
    const candidates: CandidateEntry[] = [];
    const evidenceByControl = new Map<string, ReplayEvidence[]>();
    for (const c of controls) {
      const renderedCss = renderCssAdjustments(c.adjustments);
      const replays: ReplayEvidence[] = [];
      const entries: ReplayEntry[] = [];
      if (gate.reproduced) {
        for (let n = 1; n <= c.replays; n++) {
          const r = await run(c.id, c.id, n, c.adjustments, c.fault);
          replays.push(r.evidence);
          entries.push(r.entry);
          if (replayPassProblems(r.evidence, opts.approvedSha).length > 0) break; // stop at the first replay that is not a clean pass
        }
      }
      const d = decideVerification({ approvedSha: opts.approvedSha, baseline: b.evidence, replays });
      const expectationProblems = expectationProblemsOf(c, d, replays, gate.reproduced);
      evidenceByControl.set(c.id, replays);
      candidates.push({
        id: c.id, description: c.description, provenance: 'hand-authored-control', candidateId: candidateIdOf(opts.approvedSha, renderedCss),
        adjustments: c.adjustments.map((a) => ({ ...a })), renderedCss, fault: c.fault ?? null, replaysRequired: c.replays, replaysAttempted: entries.length,
        replaysPassed: d.replaysPassed, status: d.status, reason: d.reason, expected: c.expect, expectationMet: expectationProblems.length === 0, expectationProblems, replays: entries,
      });
    }

    // ---- NC-5: the verdict logic on a real tree where the oracle passes ----
    const nc5 = nc5Of(opts.approvedSha, evidenceByControl.get('PC-1') ?? []);

    const board: Scoreboard = {
      schemaVersion: 1,
      label: 'HAND-AUTHORED CONTROLS ONLY — NO MODEL INPUT',
      complete: true,
      approvedSha: opts.approvedSha,
      createdAt: now().toISOString(),
      modelOrProviderCalls: 0,
      modalCalls: 0,
      baseline: { reproduced: gate.reproduced, reasons: gate.reasons, replay: b.entry },
      candidates,
      nc5,
      notes: [
        'ORACLE_PASS is a single oracle pass. VERIFIED needs 3 fresh, consistent, evidence-intact replays under the approved SHA and a REPRODUCED baseline.',
        'Not a sandbox: candidates are host-rendered CSS from a closed grammar run through the unmodified oracle; the network-containment demonstration is separate and proves nothing about candidate runs.',
      ],
    };
    const file = path.join(opts.outDir, SCOREBOARD_FILE);
    await writeFile(`${file}.tmp`, JSON.stringify(board, null, 2) + '\n', { mode: 0o600 });
    await rename(`${file}.tmp`, file);
    return board;
  } finally {
    await rm(opts.coordinatorLockPath, { force: true });
  }
}

// ------------------------------------------------------------ scoreboard verification (fail closed)

const TOP_KEYS = ['schemaVersion', 'label', 'complete', 'approvedSha', 'createdAt', 'modelOrProviderCalls', 'modalCalls', 'baseline', 'candidates', 'nc5', 'notes'];
/** Top-level keys an E1 board may carry in addition to TOP_KEYS. Absent on pre-E1 boards. */
const OPTIONAL_TOP_KEYS = ['modelProposals'];
const SCOREBOARD_LABEL = 'HAND-AUTHORED CONTROLS ONLY — NO MODEL INPUT';
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Recompute everything from the persisted evidence and trusted in-code control definitions, and compare
 * with the scoreboard. The expected inventory (BASELINE, NC-1, NC-1b, NC-3, NC-6, NC-7, PC-1 and the derived
 * NC-5) is not taken from the scoreboard. A truthful scoreboard of a run whose expectations were NOT met still
 * verifies (it records what happened); a scoreboard that is incomplete, forged, truncated or inconsistent
 * with its evidence does not. Any missing, tampered or inconsistent artifact is a problem.
 */
export async function verifyScoreboard(outDir: string): Promise<string[]> {
  const problems: string[] = [];
  let board: Scoreboard;
  try {
    board = JSON.parse(await readFile(path.join(outDir, SCOREBOARD_FILE), 'utf8'));
  } catch {
    return ['scoreboard.json is missing or unreadable'];
  }
  if (board === null || typeof board !== 'object' || Array.isArray(board)) return ['scoreboard is not an object'];
  if ((board as unknown as Record<string, unknown>).did1 !== undefined) problems.push('DID-1 must not appear in the scoreboard verdicts');
  for (const k of Object.keys(board)) if (!TOP_KEYS.includes(k) && !OPTIONAL_TOP_KEYS.includes(k) && k !== 'did1') problems.push(`unexpected scoreboard field: ${k}`);
  for (const k of TOP_KEYS) if (!(k in board)) problems.push(`missing scoreboard field: ${k}`);
  if (board.schemaVersion !== 1) problems.push('unsupported schema version');
  if (board.complete !== true) problems.push('scoreboard is not complete');
  if (board.modelProposals !== undefined && !Array.isArray(board.modelProposals)) problems.push('modelProposals is not a list');
  const models: unknown[] = Array.isArray(board.modelProposals) ? board.modelProposals : [];
  if (models.length > 0 && board.label !== MODEL_BOARD_LABEL) {
    problems.push('scoreboard with model-proposal rows must carry the model-rows label, never the hand-authored-only label');
  }
  if (models.length === 0 && board.label !== SCOREBOARD_LABEL) problems.push('scoreboard label is not the hand-authored-controls label');
  if (board.modelOrProviderCalls !== 0 || board.modalCalls !== 0) problems.push('scoreboard claims provider or Modal calls');
  if (typeof board.approvedSha !== 'string' || !/^[0-9a-f]{40}$/.test(board.approvedSha)) return [...problems, 'scoreboard approvedSha is missing or malformed'];
  if (!Array.isArray(board.candidates)) return [...problems, 'scoreboard has no candidate list'];
  if (!board.baseline || typeof board.baseline !== 'object' || !board.baseline.replay) return [...problems, 'scoreboard has no baseline entry'];
  const sha = board.approvedSha;

  const load = async (entry: ReplayEntry): Promise<ReplayEvidence | null> => {
    if (!entry || typeof entry.evidenceDir !== 'string' || entry.evidenceDir.split('/').includes('..') || path.isAbsolute(entry.evidenceDir)) {
      problems.push('a replay entry has a missing or unsafe evidence path');
      return null;
    }
    const dir = path.join(outDir, entry.evidenceDir);
    const raw = await readFile(path.join(dir, RECORD_FILE)).catch(() => null);
    if (!raw) {
      problems.push(`record missing: ${entry.evidenceDir}`);
      return null;
    }
    if (sha256(raw) !== entry.recordSha256) problems.push(`record hash mismatch: ${entry.evidenceDir}`);
    const record = JSON.parse(raw.toString('utf8')) as CandidateRecord;
    const finalizedVerdict = record.outcome === 'ORACLE_PASS' || record.outcome === 'PATCH_FAILED';
    const evidenceProblems = finalizedVerdict ? await verifyPersistedEvidence(dir) : [];
    for (const x of evidenceProblems) problems.push(`${entry.evidenceDir}: ${x}`);
    // Rebuild the entire published entry from the persisted record and compare every field (and reject extras).
    const rebuilt = buildReplayEntry(entry.n, { record, evidenceProblems }, entry.evidenceDir, raw) as unknown as Record<string, unknown>;
    const published = entry as unknown as Record<string, unknown>;
    for (const key of new Set([...Object.keys(rebuilt), ...Object.keys(published)])) {
      if (!sameJson(published[key], rebuilt[key])) problems.push(`${entry.evidenceDir}: scoreboard ${key} does not match the persisted record and evidence`);
    }
    return { record, evidenceProblems };
  };

  // ---- baseline: same approved SHA, same evidence, same verdict ----
  const b = await load(board.baseline.replay);
  if (board.baseline.replay.n !== 1) problems.push('baseline replay number must be 1');
  if (board.baseline.replay.evidenceDir !== 'BASELINE/replay-1') problems.push(`baseline evidence must be BASELINE/replay-1, not ${String(board.baseline.replay.evidenceDir)}`);
  if (b && b.record.label !== 'BASELINE') problems.push(`baseline record is labelled ${JSON.stringify(b.record.label)}, expected "BASELINE"`);
  const gate = b ? baselineGate(b, sha) : { reproduced: false, reasons: ['baseline evidence unavailable'] };
  if (gate.reproduced !== board.baseline.reproduced) problems.push('baseline verdict does not match its evidence');
  if (!sameJson(gate.reasons, board.baseline.reasons)) problems.push('baseline reasons do not match its evidence');

  // ---- exact control inventory, from trusted code ----
  const expectedIds = HAND_AUTHORED_CONTROLS.map((c) => c.id);
  const gotIds = board.candidates.map((c) => c?.id);
  if (new Set(gotIds).size !== gotIds.length) problems.push(`duplicate control ids: ${gotIds.join(', ')}`);
  if (!sameJson(gotIds, expectedIds)) problems.push(`control inventory is ${JSON.stringify(gotIds)}, expected ${JSON.stringify(expectedIds)}`);

  const evidenceByControl = new Map<string, ReplayEvidence[]>();
  for (const control of HAND_AUTHORED_CONTROLS) {
    const c = board.candidates.find((x) => x?.id === control.id);
    if (!c) continue; // already reported as a missing control
    const where = control.id;
    const renderedCss = renderCssAdjustments(control.adjustments);
    if (c.provenance !== 'hand-authored-control') problems.push(`${where}: unexpected provenance`);
    if (c.description !== control.description) problems.push(`${where}: description was altered`);
    if (!sameJson(c.adjustments, control.adjustments)) problems.push(`${where}: adjustments differ from the hand-authored control`);
    if (c.renderedCss !== renderedCss) problems.push(`${where}: rendered CSS differs from the hand-authored control`);
    if (c.candidateId !== candidateIdOf(sha, renderedCss)) problems.push(`${where}: candidate id does not match the approved SHA and rendered CSS`);
    if ((c.fault ?? null) !== (control.fault ?? null)) problems.push(`${where}: fault kind differs from the control`);
    if (c.replaysRequired !== control.replays) problems.push(`${where}: replaysRequired ${c.replaysRequired}, expected ${control.replays}`);
    if (c.expected !== control.expect) problems.push(`${where}: expected status was altered`);
    if (!Array.isArray(c.replays)) {
      problems.push(`${where}: replays is not a list`);
      continue;
    }
    c.replays.forEach((r, i) => {
      if (r?.n !== i + 1) problems.push(`${where}: replay numbering is not sequential`);
      if (r?.evidenceDir !== `${control.id}/replay-${i + 1}`) problems.push(`${where}: replay ${i + 1} points at ${String(r?.evidenceDir)}`);
    });
    const replays: ReplayEvidence[] = [];
    for (const entry of c.replays) {
      const ev = await load(entry);
      if (ev) {
        replays.push(ev);
        if (ev.record.label !== control.id) problems.push(`${where}: replay record is labelled ${JSON.stringify(ev.record.label)}, expected ${JSON.stringify(control.id)}`);
      }
    }
    if (replays.length !== c.replays.length) {
      problems.push(`${where}: evidence unavailable`);
      continue;
    }
    evidenceByControl.set(control.id, replays);
    if (!expectedAttempts(control, gate.reproduced, replays, sha)) problems.push(`${where}: the replay list is truncated or padded relative to the evidence (${replays.length} replay(s))`);
    if (c.replaysAttempted !== replays.length) problems.push(`${where}: replaysAttempted ${c.replaysAttempted} does not match ${replays.length} replay(s) of evidence`);
    const d = decideVerification({ approvedSha: sha, baseline: b, replays });
    if (d.status !== c.status) problems.push(`${where}: scoreboard says ${c.status} but the evidence gives ${d.status}`);
    if (c.replaysPassed !== d.replaysPassed) problems.push(`${where}: replaysPassed ${c.replaysPassed} but the evidence gives ${d.replaysPassed}`);
    if (c.reason !== d.reason) problems.push(`${where}: reason does not match the evidence`);
    const expectationProblems = expectationProblemsOf(control, d, replays, gate.reproduced);
    if (c.expectationMet !== (expectationProblems.length === 0)) problems.push(`${where}: expectationMet does not match the evidence`);
    if (!sameJson(c.expectationProblems, expectationProblems)) problems.push(`${where}: expectationProblems do not match the evidence`);
    if (c.status === 'VERIFIED' && (replays.length !== REPLAYS_REQUIRED_FOR_VERIFIED || d.replaysPassed !== REPLAYS_REQUIRED_FOR_VERIFIED)) problems.push(`${where}: VERIFIED without 3/3 replays`);
  }

  // ---- model-proposal rows: separate section, separate ids, no verdict, no evidence ----
  {
    const boardIds = new Set(board.candidates.map((c) => c?.id));
    const handIds = new Set(board.candidates.map((c) => c?.candidateId));
    const seenModels = new Set<string>();
    models.forEach((row, i) => {
      const where = `model-proposal[${i}]`;
      for (const x of modelRowProblems(row, sha)) problems.push(`${where}: ${x}`);
      const rec = (typeof row === 'object' && row !== null ? row : {}) as { id?: unknown; candidateId?: unknown };
      if (typeof rec.id === 'string') {
        if (boardIds.has(rec.id) || seenModels.has(rec.id)) problems.push(`${where}: id ${JSON.stringify(rec.id)} is not separate from the board inventory`);
        seenModels.add(rec.id);
      }
      if (typeof rec.candidateId === 'string' && handIds.has(rec.candidateId)) {
        problems.push(`${where}: candidate id collides with a hand-authored row`);
      }
    });
  }

  // ---- NC-5: recomputed from the persisted PC-1 evidence, never trusted ----
  const nc5 = nc5Of(sha, evidenceByControl.get('PC-1') ?? []);
  if (!board.nc5 || !sameJson(board.nc5, nc5)) problems.push(`NC-5 does not match the recomputation from the persisted PC-1 evidence (expected ${JSON.stringify(nc5)})`);
  if (board.nc5?.status === 'VERIFIED' || board.nc5?.neverVerified === false) problems.push('NC-5 claims a verified outcome');
  return problems;
}
