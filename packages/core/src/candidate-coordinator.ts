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

/** Identity of a candidate across replays: the approved SHA plus the exact host-rendered CSS. */
export function candidateIdOf(approvedSha: string, renderedCss: string): string {
  return sha256(`${approvedSha}\n${renderedCss}`);
}

// ------------------------------------------------------------ pure decisions

/** Reasons a replay is NOT a complete, clean, fresh oracle pass. Empty means it is. */
export function replayPassProblems(e: ReplayEvidence): string[] {
  const r = e.record;
  const p: string[] = [];
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
  if (r.sourceProof.length !== 2) p.push(`expected 2 source proofs, found ${r.sourceProof.length}`);
  for (const s of r.sourceProof) {
    if (!s.served || !s.bytesEqualStaged || !s.hasNonce) p.push(`source proof failed for ${s.test}`);
    if (r.manifest && s.servedSha256 !== r.manifest.candidateCss.sha256) p.push(`served CSS hash differs from the staged candidate for ${s.test}`);
  }
  if (r.requiredEvidence.length < 6) p.push('required evidence list is incomplete');
  return p;
}

/** A certified baseline: the unmodified F01 reproduces the defect (mobile fails by interception, desktop passes) with intact evidence. */
export function baselineGate(e: ReplayEvidence): { reproduced: boolean; reasons: string[] } {
  const r = e.record;
  const reasons: string[] = [];
  if (r.outcome !== 'PATCH_FAILED') reasons.push(`baseline stage outcome is ${r.outcome}, expected PATCH_FAILED`);
  if (!r.baselineIdentical) reasons.push('the oracle did not classify the run as REPRODUCED');
  if (r.oracleExitCode !== 1) reasons.push(`baseline oracle exit ${r.oracleExitCode}, expected 1`);
  if (r.renderedCss !== '') reasons.push('the baseline stage must carry no adjustments');
  if (r.mobile?.status !== 'failed' || r.mobile.cartCountAfter !== '0' || r.mobile.hitTestTarget === 'add-to-cart' || r.mobile.hitTestTarget === null) reasons.push('mobile did not fail by interception with the cart unchanged');
  if (r.desktop?.status !== 'passed') reasons.push('the desktop control did not pass');
  if (!r.evidenceFinalized) reasons.push('baseline evidence was not finalized');
  for (const x of e.evidenceProblems) reasons.push(`evidence: ${x}`);
  if (r.integrityAfterRun !== 'intact' || !r.stageRemoved) reasons.push('baseline stage integrity or cleanup failed');
  if (r.sourceProof.length !== 2 || r.sourceProof.some((s) => !s.served || !s.bytesEqualStaged || !s.hasNonce)) reasons.push('baseline source proof failed');
  return { reproduced: reasons.length === 0, reasons };
}

export type Decision = { status: CandidateStatus; replaysPassed: number; reason: string | null };

/**
 * The only place VERIFIED is decided. Pure, so it can be recomputed from persisted evidence.
 * VERIFIED requires: a reproduced baseline, exactly three replays, every replay a complete clean
 * pass, and all replays identical in approved SHA, candidate CSS, adjustments and trusted-file
 * manifest while each carries its own fresh nonce.
 */
export function decideVerification(input: { baselineReproduced: boolean; replays: ReplayEvidence[] }): Decision {
  const { baselineReproduced, replays } = input;
  if (!baselineReproduced) return { status: 'NOT_REPRODUCED', replaysPassed: 0, reason: 'the baseline was not certified as REPRODUCED' };
  if (replays.length === 0) return { status: 'INCONCLUSIVE', replaysPassed: 0, reason: 'no replay was run' };
  let passed = 0;
  for (let i = 0; i < replays.length; i++) {
    const problems = replayPassProblems(replays[i]!);
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
  const nonces = new Set<string>();
  for (const { record } of replays) {
    if (record.approvedSha !== first.approvedSha) return { status: 'INCONCLUSIVE', replaysPassed: passed, reason: 'replays ran under different approved SHAs' };
    if (record.renderedCss !== first.renderedCss || JSON.stringify(record.adjustments) !== JSON.stringify(first.adjustments)) return { status: 'INCONCLUSIVE', replaysPassed: passed, reason: 'replays ran different candidates' };
    if (JSON.stringify(record.manifest!.trusted) !== JSON.stringify(first.manifest!.trusted)) return { status: 'INCONCLUSIVE', replaysPassed: passed, reason: 'trusted file hashes differ between replays' };
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
export const HAND_AUTHORED_CONTROLS: readonly Control[] = [
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

export type Scoreboard = {
  schemaVersion: 1;
  label: 'HAND-AUTHORED CONTROLS ONLY — NO MODEL INPUT';
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
};

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

async function entryOf(n: number, e: ReplayEvidence, evidenceDir: string, rel: string): Promise<ReplayEntry> {
  const r = e.record;
  const raw = await readFile(path.join(evidenceDir, RECORD_FILE)).catch(() => null);
  return {
    n, outcome: r.outcome, failureCode: r.failure?.code ?? null, failureMessage: r.failure?.message ?? null, oracleExitCode: r.oracleExitCode,
    evidenceDir: rel, recordSha256: raw ? sha256(raw) : null, candidateCssSha256: r.manifest?.candidateCss.sha256 ?? null, nonce: r.manifest?.candidateCss.nonce ?? null,
    mobile: r.mobile, desktop: r.desktop, servedCssSha256: r.sourceProof.map((s) => s.servedSha256 ?? ''), evidenceFinalized: r.evidenceFinalized, evidenceProblems: e.evidenceProblems,
  };
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
    const gate = baselineGate(b.evidence);

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
          if (replayPassProblems(r.evidence).length > 0) break; // stop at the first replay that is not a clean pass
        }
      }
      const d = decideVerification({ baselineReproduced: gate.reproduced, replays });
      const expectationProblems = [...(d.status === c.expect ? [] : [`status ${d.status}, expected ${c.expect}`]), ...(c.check && gate.reproduced ? c.check(replays) : [])];
      evidenceByControl.set(c.id, replays);
      candidates.push({
        id: c.id, description: c.description, provenance: 'hand-authored-control', candidateId: candidateIdOf(opts.approvedSha, renderedCss),
        adjustments: c.adjustments.map((a) => ({ ...a })), renderedCss, fault: c.fault ?? null, replaysRequired: c.replays, replaysAttempted: entries.length,
        replaysPassed: d.replaysPassed, status: d.status, reason: d.reason, expected: c.expect, expectationMet: expectationProblems.length === 0, expectationProblems, replays: entries,
      });
    }

    // ---- NC-5: the verdict logic on a real tree where the oracle passes ----
    const pc1 = evidenceByControl.get('PC-1') ?? [];
    const asBaseline = pc1[0] ? baselineGate(pc1[0]) : { reproduced: false, reasons: ['no PC-1 replay available'] };
    const nc5Decision = decideVerification({ baselineReproduced: asBaseline.reproduced, replays: pc1 });
    const nc5 = {
      description: 'verdict logic applied to a real staged tree whose oracle passes (the PC-1 stage) as if it were the baseline',
      baselineReproduced: asBaseline.reproduced,
      status: nc5Decision.status,
      neverVerified: nc5Decision.status !== 'VERIFIED',
    };

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

/**
 * Recompute every status from the persisted evidence and compare with the scoreboard. Any missing,
 * tampered or inconsistent artifact is a problem; a scoreboard with problems must not be trusted.
 */
export async function verifyScoreboard(outDir: string): Promise<string[]> {
  const problems: string[] = [];
  let board: Scoreboard;
  try {
    board = JSON.parse(await readFile(path.join(outDir, SCOREBOARD_FILE), 'utf8'));
  } catch {
    return ['scoreboard.json is missing or unreadable'];
  }
  if (board.schemaVersion !== 1 || board.complete !== true) problems.push('scoreboard is not complete');
  if (board.modelOrProviderCalls !== 0 || board.modalCalls !== 0) problems.push('scoreboard claims provider or Modal calls');
  if (!Array.isArray(board.candidates)) return [...problems, 'scoreboard has no candidates'];
  if ((board as unknown as { did1?: unknown }).did1 !== undefined || board.candidates.some((c) => (c.id as string).startsWith('DID'))) problems.push('DID-1 must not appear among candidates or in the scoreboard verdicts');

  const load = async (entry: ReplayEntry): Promise<ReplayEvidence | null> => {
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
    return { record, evidenceProblems };
  };

  const b = await load(board.baseline.replay);
  const gate = b ? baselineGate(b) : { reproduced: false, reasons: ['baseline evidence unavailable'] };
  if (gate.reproduced !== board.baseline.reproduced) problems.push('baseline verdict does not match its evidence');

  for (const c of board.candidates) {
    if (c.provenance !== 'hand-authored-control') problems.push(`${c.id}: unexpected provenance`);
    if (c.candidateId !== candidateIdOf(board.approvedSha, c.renderedCss)) problems.push(`${c.id}: candidate id does not match the approved SHA and rendered CSS`);
    if (c.renderedCss !== renderCssAdjustments(c.adjustments)) problems.push(`${c.id}: rendered CSS does not match its adjustments`);
    const replays: ReplayEvidence[] = [];
    for (const entry of c.replays) {
      const ev = await load(entry);
      if (ev) {
        replays.push(ev);
        if (ev.record.approvedSha !== board.approvedSha) problems.push(`${c.id}: replay ${entry.n} ran under a different SHA`);
        if (ev.record.renderedCss !== c.renderedCss) problems.push(`${c.id}: replay ${entry.n} ran different CSS`);
      }
    }
    if (replays.length !== c.replays.length) {
      problems.push(`${c.id}: evidence unavailable`);
      continue;
    }
    const d = decideVerification({ baselineReproduced: gate.reproduced, replays });
    if (d.status !== c.status) problems.push(`${c.id}: scoreboard says ${c.status} but the evidence gives ${d.status}`);
    if (c.status === 'VERIFIED' && (c.replays.length !== REPLAYS_REQUIRED_FOR_VERIFIED || c.replaysPassed !== REPLAYS_REQUIRED_FOR_VERIFIED)) problems.push(`${c.id}: VERIFIED without 3/3 replays`);
  }
  return problems;
}
