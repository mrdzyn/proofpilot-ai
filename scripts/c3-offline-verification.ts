// C3-B1: offline candidate verification over HAND-AUTHORED controls only (no model, no provider, no
// Modal). Runs the certified-baseline gate, NC-1, NC-1b, NC-3, NC-6, NC-7 and PC-1 (3 fresh replays),
// derives NC-5, writes a machine-readable scoreboard, re-verifies it from the persisted evidence, and
// runs the separate DID-1 demonstration (never part of the scoreboard verdicts).
//
// Exit 0: every expectation met, the scoreboard re-verifies and the harness tree is clean.
// Exit 1: any expectation failed, a run was inconclusive, or the scoreboard failed re-verification.
// Exit 2: expectations met but the harness is not committed (evidence cannot be tied to a SHA).
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { readWorktreeState, runOfflineVerification, verifyScoreboard, CoordinatorBusyError } from '../packages/core/src/index.ts';
import { runDid1 } from '../packages/core/src/containment-demo.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');
const git = (...args: string[]) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
const { values } = parseArgs({ options: { 'approved-sha': { type: 'string' } }, strict: true });
const head = git('rev-parse', 'HEAD');
const approvedSha = values['approved-sha'] ?? head;
if (approvedSha !== head) {
  console.log(`refused: --approved-sha ${approvedSha.slice(0, 12)} is not the checked-out HEAD ${head.slice(0, 12)}`);
  process.exit(1);
}

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const runId = `c3-b1-${stamp}-${randomBytes(3).toString('hex')}`;
const outDir = path.join(repoRoot, '.proofpilot/c3-b1', runId);
console.log(`=== C3-B1 offline verification ${runId} (approved SHA ${approvedSha}) ===`);

let board;
try {
  board = await runOfflineVerification({
    repoRoot, approvedSha, outDir,
    lockPath: path.join(repoRoot, '.proofpilot/locks/oracle-4173.lock'),
    coordinatorLockPath: path.join(repoRoot, '.proofpilot/locks/c3-b1-coordinator.lock'),
  });
} catch (e) {
  if (e instanceof CoordinatorBusyError) {
    console.log(`refused: ${e.message}`);
    process.exit(1);
  }
  throw e;
}

console.log(`\nbaseline gate:       ${board.baseline.reproduced ? 'REPRODUCED (certified in a fresh stage)' : 'NOT REPRODUCED: ' + board.baseline.reasons.join('; ')}`);
const problems: string[] = [];
for (const c of board.candidates) {
  console.log(`\n[${c.id}] ${c.description}`);
  console.log(`  candidate id:      ${c.candidateId.slice(0, 16)}…  rendered: ${JSON.stringify(c.renderedCss)}`);
  console.log(`  status:            ${c.status}  (replays passed ${c.replaysPassed}/${c.replaysRequired}, attempted ${c.replaysAttempted})${c.reason ? ` — ${c.reason}` : ''}`);
  for (const r of c.replays) console.log(`    replay ${r.n}: ${r.outcome}${r.failureCode ? ` (${r.failureCode})` : ''}, oracle exit ${r.oracleExitCode}, evidence ${r.evidenceFinalized ? 'finalized' : 'NOT finalized'}, mobile ${r.mobile?.status ?? 'n/a'}/${r.mobile?.hitTestTarget ?? 'n/a'}, desktop ${r.desktop?.status ?? 'n/a'}`);
  console.log(`  expectation:       ${c.expectationMet ? 'MET' : 'NOT MET: ' + c.expectationProblems.join('; ')}`);
  for (const p of c.expectationProblems) problems.push(`${c.id}: ${p}`);
}
console.log(`\n[NC-5] ${board.nc5.description}\n  baseline reproduced: ${board.nc5.baselineReproduced}; status ${board.nc5.status}; never VERIFIED: ${board.nc5.neverVerified}`);
if (board.nc5.baselineReproduced || board.nc5.status !== 'NOT_REPRODUCED') problems.push('NC-5: a tree where the oracle passes was accepted as a reproduced baseline');
if (!board.baseline.reproduced) problems.push('baseline was not reproduced');

const verification = await verifyScoreboard(outDir);
console.log(`\nscoreboard re-verified from persisted evidence: ${verification.length === 0 ? 'OK' : 'PROBLEMS: ' + verification.join('; ')}`);
for (const p of verification) problems.push(`scoreboard: ${p}`);

console.log('\n--- DID-1 (separate demonstration; not a candidate verdict, not in the scoreboard) ---');
const did1 = await runDid1();
console.log(`  passed: ${did1.passed}; blocked: ${did1.blockedUrls.length} URL(s); canary connections while routed: ${did1.canaryConnections}; control without routing: ${did1.controlCanaryConnectionsWithoutRouting}`);
console.log(`  limits: ${did1.limits[0]}`);
if (!did1.passed) problems.push('DID-1 demonstration did not pass');
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'did1-result.json'), JSON.stringify(did1, null, 2) + '\n', { mode: 0o600 });

const harness = readWorktreeState(repoRoot, ['packages/core', 'scripts/c3-offline-verification.ts', 'tests']);
console.log(`\nmodel/provider/Modal calls: 0 (none are possible from this script)`);
console.log(`harness worktree:   ${harness.kind}${harness.kind === 'dirty' ? ` (${harness.paths.join(', ')})` : ''}`);
console.log(`evidence:           ${path.relative(repoRoot, outDir)}/scoreboard.json`);
console.log(`result:             ${problems.length === 0 ? 'ALL EXPECTATIONS MET' : 'FAILED: ' + problems.join(' | ')}`);
process.exitCode = problems.length ? 1 : harness.kind === 'clean' ? 0 : 2;
