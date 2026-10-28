// C3-0 zero-model staging spike (tasks/PP-META-I2-C3.md, SEC-C3-01 approved for this spike only).
//
// Runs the UNMODIFIED trusted F01 oracle inside a disposable stage built from the approved Git
// SHA, once per hand-written control, and checks that the oracle can tell a correct host-rendered
// CSS adjustment (PC-1) from no-ops (NC-1, NC-1b). No model, provider or network call is made:
// this script imports no inference code and the oracle runs with a scrubbed environment.
//
// Exit 0: every expectation met and the harness tree is clean. Exit 1: an expectation failed or a
// run was inconclusive. Exit 2: expectations met, but the harness itself is not committed
// (the evidence cannot be tied to a SHA).
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { readWorktreeState, runCandidate, verifyPersistedEvidence, type CandidateRecord, type CssAdjustment } from '../packages/core/src/index.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');
const git = (...args: string[]) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();

const { values } = parseArgs({ options: { 'approved-sha': { type: 'string' } }, strict: true });
const head = git('rev-parse', 'HEAD');
const approvedSha = values['approved-sha'] ?? head;
if (approvedSha !== head) {
  console.log(`refused: --approved-sha ${approvedSha.slice(0, 12)} is not the checked-out HEAD ${head.slice(0, 12)}`);
  process.exit(1);
}

type Control = { label: string; description: string; adjustments: CssAdjustment[]; oracleExit: number; expect: (r: CandidateRecord) => string[] };
const CONTROLS: Control[] = [
  {
    label: 'NC-1',
    description: 'no-op: empty adjustments',
    adjustments: [],
    oracleExit: 1,
    expect: (r) => [
      ...(r.outcome === 'PATCH_FAILED' ? [] : [`outcome ${r.outcome}, expected PATCH_FAILED`]),
      ...(r.baselineIdentical ? [] : ['mobile failure signature differs from the original baseline']),
      ...(r.desktop?.status === 'passed' ? [] : ['desktop control did not pass']),
    ],
  },
  {
    label: 'NC-1b',
    description: 'irrelevant allowed rule: .promo z-index 5',
    adjustments: [{ selector: '.promo', property: 'z-index', value: '5' }],
    oracleExit: 1,
    expect: (r) => [
      ...(r.outcome === 'PATCH_FAILED' ? [] : [`outcome ${r.outcome}, expected PATCH_FAILED`]),
      ...(r.baselineIdentical ? [] : ['mobile failure signature differs from the original baseline']),
    ],
  },
  {
    label: 'PC-1',
    description: 'hand-written correct fix: .promo-overlay pointer-events none',
    adjustments: [{ selector: '.promo-overlay', property: 'pointer-events', value: 'none' }],
    oracleExit: 0,
    expect: (r) => [
      ...(r.outcome === 'ORACLE_PASS' ? [] : [`outcome ${r.outcome}, expected ORACLE_PASS`]),
      ...(r.mobile?.status === 'passed' && r.mobile.hitTestTarget === 'add-to-cart' && r.mobile.cartCountAfter === '1' ? [] : ['mobile did not pass with the tap received by add-to-cart']),
      ...(r.desktop?.status === 'passed' && r.desktop.cartCountAfter === '1' ? [] : ['desktop did not pass']),
    ],
  },
];

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const spikeId = `c3-0-${stamp}-${randomBytes(3).toString('hex')}`;
const spikeDir = path.join(repoRoot, '.proofpilot/c3-spike', spikeId);
await mkdir(spikeDir, { recursive: true });
const lockPath = path.join(repoRoot, '.proofpilot/locks/oracle-4173.lock');

console.log(`=== C3-0 staging spike ${spikeId} (approved SHA ${approvedSha}) ===`);
const problems: string[] = [];
const summary: Array<{ label: string; description: string; outcome: string; expectationFailures: string[]; evidenceDir: string }> = [];
for (const c of CONTROLS) {
  const evidenceDir = path.join(spikeDir, c.label);
  const r = await runCandidate({ repoRoot, approvedSha, label: c.label, adjustments: c.adjustments, evidenceDir, lockPath });
  // Mandatory evidence gate: the persisted record must exist, be marked finalized, list every required
  // artifact (report, stdout, both traces, both observations) and every hash must match the files on disk.
  const evidenceProblems = await verifyPersistedEvidence(evidenceDir);
  const gate = [
    ...evidenceProblems.map((p) => `evidence: ${p}`),
    ...(r.evidenceFinalized ? [] : ['evidence was not finalized']),
    ...(r.oracleExitCode === c.oracleExit ? [] : [`oracle process exit ${r.oracleExitCode}, expected ${c.oracleExit}`]),
    ...(r.stageRemoved ? [] : ['stage was not removed']),
    ...(r.integrityAfterRun === 'intact' ? [] : [`integrity after run: ${r.integrityAfterRun}`]),
  ];
  const failures = r.outcome === 'INCONCLUSIVE' || r.outcome === 'PATCH_REJECTED' ? [`${r.outcome}: ${r.failure?.code} ${r.failure?.message}`, ...gate] : [...c.expect(r), ...gate];
  console.log(`\n[${c.label}] ${c.description}`);
  console.log(`  rendered css:      ${JSON.stringify(r.renderedCss)}`);
  console.log(`  outcome:           ${r.outcome}${r.failure ? ` (${r.failure.code})` : ''}`);
  console.log(`  mobile:            ${r.mobile ? `${r.mobile.status}, tap received by ${r.mobile.hitTestTarget}, cart after ${r.mobile.cartCountAfter}` : 'n/a'}`);
  console.log(`  desktop:           ${r.desktop ? `${r.desktop.status}, tap received by ${r.desktop.hitTestTarget}, cart after ${r.desktop.cartCountAfter}` : 'n/a'}`);
  console.log(`  baseline-identical: ${r.baselineIdentical}`);
  console.log(`  served css proof:  ${r.sourceProof.map((p) => `${p.test}: bytes-equal=${p.bytesEqualStaged} nonce=${p.hasNonce} sha256=${p.servedSha256?.slice(0, 16)}`).join(' | ') || 'n/a'}`);
  console.log(`  evidence:          ${evidenceProblems.length === 0 && r.evidenceFinalized ? `COMPLETE (${r.evidence.length} files hashed, ${r.requiredEvidence.length} required, record persisted and read back)` : 'INCOMPLETE: ' + (evidenceProblems.join('; ') || 'not finalized')}; oracle exit ${r.oracleExitCode}`);
  console.log(`  integrity (post):  ${r.integrityAfterRun}; stage removed: ${r.stageRemoved}; trusted files hashed: ${r.manifest ? Object.keys(r.manifest.trusted).length : 0}`);
  console.log(`  expectation:       ${failures.length === 0 ? 'MET' : 'NOT MET: ' + failures.join('; ')}`);
  for (const f of failures) problems.push(`${c.label}: ${f}`);
  summary.push({ label: c.label, description: c.description, outcome: r.outcome, expectationFailures: failures, evidenceDir: path.relative(repoRoot, evidenceDir) });
}

const harness = readWorktreeState(repoRoot, ['packages/core', 'scripts/c3-stage-spike.ts', 'tests']);
await writeFile(
  path.join(spikeDir, 'spike-summary.json'),
  JSON.stringify({ schemaVersion: 1, spikeId, approvedSha, modelOrProviderCalls: 0, harnessWorktree: harness, controls: summary, problems }, null, 2) + '\n',
);
console.log(`\nmodel/provider calls: 0 (none are possible from this script)`);
console.log(`harness worktree:     ${harness.kind}${harness.kind === 'dirty' ? ` (${harness.paths.join(', ')})` : ''}`);
console.log(`evidence:             ${path.relative(repoRoot, spikeDir)}`);
console.log(`result:               ${problems.length === 0 ? 'ALL EXPECTATIONS MET' : 'FAILED'}`);
process.exitCode = problems.length ? 1 : harness.kind === 'clean' ? 0 : 2;
