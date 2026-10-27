// F01 baseline reproduction: runs the trusted oracle against the unmodified
// fixture, classifies the result deterministically, hashes the evidence and
// records observed impact metrics.
//
// Exit 0 only when the expected baseline failure is REPRODUCED and the desktop
// control PASSES. The underlying oracle run itself still reports 1 failed.
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { appendFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  certifyF01Baseline,
  classifyF01Baseline,
  extractOracleResults,
  F01_EVIDENCE_PATHS,
  F01_OBSERVATION_ATTACHMENT,
  readWorktreeState,
  scrubEnv,
  startClock,
  validateImpactMetrics,
  type ImpactMetrics,
  type F01Observation,
  type WorktreeState,
} from '../packages/core/src/index.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');
const git = (...args: string[]) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();

const total = startClock();
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const runId = `f01-baseline-${stamp}-${randomBytes(3).toString('hex')}`;
const runDir = path.join(repoRoot, '.proofpilot/runs', runId);
await mkdir(runDir, { recursive: true });

const gitHead = git('rev-parse', 'HEAD');
const worktreeBefore = readWorktreeState(repoRoot, F01_EVIDENCE_PATHS);
let fixtureTree: string | null = null;
try {
  fixtureTree = git('rev-parse', 'HEAD:fixtures/sample-store');
} catch {
  fixtureTree = null;
}

// The oracle process gets no credentials.
const oracleEnv = { ...scrubEnv(process.env), PROOFPILOT_EVIDENCE_DIR: runDir };
const verification = startClock();
const exitCode: number = await new Promise((resolve, reject) => {
  const child = spawn(
    process.execPath,
    [path.join(repoRoot, 'node_modules/@playwright/test/cli.js'), 'test', '-c', 'verifier/playwright.config.ts'],
    { cwd: repoRoot, env: oracleEnv, stdio: ['ignore', 'inherit', 'inherit'] },
  );
  child.on('error', reject);
  child.on('close', (code) => resolve(code ?? -1));
});
const verificationExecutionMs = verification.elapsedMs();
// Re-check after the oracle ran: the tested bytes must also be unchanged during the run.
const worktreeAfter = readWorktreeState(repoRoot, F01_EVIDENCE_PATHS);
const worktree: WorktreeState =
  worktreeBefore.kind !== 'clean' ? worktreeBefore : worktreeAfter;
const worktreeDirty = worktree.kind !== 'clean';

let results: ReturnType<typeof extractOracleResults> = [];
try {
  results = extractOracleResults(JSON.parse(await readFile(path.join(runDir, 'oracle-report.json'), 'utf8')));
} catch {
  results = [];
}
for (const r of results) {
  const obs = r.attachments.find((a) => a.name === F01_OBSERVATION_ATTACHMENT && a.path);
  r.observation = obs ? (JSON.parse(await readFile(obs.path!, 'utf8')) as F01Observation) : null;
}
const classification = classifyF01Baseline(results);
const certification = certifyF01Baseline({ classification, oracleExitCode: exitCode, worktree });
const mobile = results.find((r) => r.title.startsWith('F01-MOBILE'));

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name));
}
const artifacts = [];
for (const file of (await listFiles(runDir)).sort()) {
  const bytes = await readFile(file);
  artifacts.push({
    relativePath: path.relative(runDir, file),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
  });
}

const playwrightVersion = JSON.parse(
  await readFile(path.join(repoRoot, 'node_modules/@playwright/test/package.json'), 'utf8'),
).version as string;

const metrics: ImpactMetrics = validateImpactMetrics({
  schemaVersion: 1,
  provenance: 'observed',
  runId,
  fixtureId: 'F01',
  recordedAt: new Date().toISOString(),
  workflowScope: 'baseline-reproduction-only',
  source: { gitHead, fixtureTree, worktreeDirty, certified: certification.certified },
  environment: { os: `${os.type()} ${os.release()}`, arch: os.arch(), node: process.version, playwright: playwrightVersion },
  measurements: {
    bugReproductionMs: mobile && Number.isFinite(mobile.durationMs) ? mobile.durationMs : null,
    verificationExecutionMs,
    totalWorkflowMs: total.elapsedMs(),
  },
  results: { baselineFailure: classification.verdict, regression: classification.regression },
  notes: [
    'Single local run on the machine described in environment; not a benchmark.',
    ...(certification.certified ? [] : ['NOT CERTIFIED exact-SHA evidence: ' + (certification.reasons.join('; ') || 'baseline not reproduced')]),
    'No patch or candidate stage exists in C1, so this is not a verified-fix workflow and no time-saved claim is made.',
  ],
});

const summary = {
  runId,
  oracleExitCode: exitCode,
  classification,
  gitHead,
  fixtureTree,
  worktreeDirty,
  worktree,
  certified: certification.certified,
  certificationReasons: certification.reasons,
  artifacts,
};
await writeFile(path.join(runDir, 'baseline-summary.json'), JSON.stringify(summary, null, 2) + '\n');
await writeFile(path.join(runDir, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
await appendFile(path.join(repoRoot, '.proofpilot/metrics.jsonl'), JSON.stringify(metrics) + '\n');

console.log('\n=== F01 baseline reproduction ===');
console.log(`run:                 ${runId}`);
console.log(`git HEAD:            ${gitHead}${worktreeDirty ? ` (evidence paths ${worktree.kind.toUpperCase()}: evidence not bound to this SHA)` : ''}`);
console.log(`oracle exit code:    ${exitCode} (non-zero expected: the mobile oracle fails on baseline)`);
for (const r of results) console.log(`oracle test:         ${r.status.toUpperCase().padEnd(7)} ${r.title} (${r.durationMs} ms)`);
console.log(`baseline verdict:    ${classification.verdict}`);
console.log(`desktop regression:  ${classification.regression}`);
console.log(`intercepted by:      ${classification.interceptedBy ?? 'n/a'}`);
for (const reason of classification.reasons) console.log(`reason:              ${reason}`);
console.log(`metrics (observed):  reproduction=${metrics.measurements.bugReproductionMs} ms, verification=${verificationExecutionMs} ms, total=${metrics.measurements.totalWorkflowMs} ms`);
console.log(`evidence dir:        ${path.relative(repoRoot, runDir)} (${artifacts.length} files hashed in baseline-summary.json)`);

console.log(`certified exact-SHA: ${certification.certified ? 'YES' : 'NO'}`);
for (const reason of certification.reasons) console.log(`certification:      ${reason}`);
if (!certification.certified && certification.exitCode === 2) {
  console.log('NOT CERTIFIED: diagnostic artifacts were kept, but this run is not exact-SHA evidence. Commit or revert the listed paths and re-run.');
}
process.exitCode = certification.exitCode;
