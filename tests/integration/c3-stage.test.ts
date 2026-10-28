// C3-0 real-browser regression: the unmodified trusted oracle runs inside a disposable stage built
// from the real repository HEAD. Needs Chromium (`pnpm exec playwright install chromium`) and a
// clean trusted tree; not part of the default CI test steps. No model or network call is made.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { acquireOracleLock, readWorktreeState, runCandidate, STAGED_GIT_PATHS, type RunCandidateOptions } from '../../packages/core/src/index.ts';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
const scratch = mkdtempSync(path.join(os.tmpdir(), 'pp-c3-int-'));
after(() => rmSync(scratch, { recursive: true, force: true }));

const trustedClean = readWorktreeState(repoRoot, STAGED_GIT_PATHS).kind === 'clean';
const opts = (label: string, adjustments: RunCandidateOptions['adjustments'], extra: Partial<RunCandidateOptions> = {}): RunCandidateOptions => ({
  repoRoot,
  approvedSha: sha,
  label,
  adjustments,
  evidenceDir: path.join(scratch, label),
  lockPath: path.join(scratch, 'oracle.lock'),
  stageRoot: path.join(scratch, 'stages'),
  ...extra,
});
const stagesLeft = () => (existsSync(path.join(scratch, 'stages')) ? readdirSync(path.join(scratch, 'stages')).length : 0);
const PC1 = [{ selector: '.promo-overlay', property: 'pointer-events', value: 'none' }];

test('NC-1 no-op: mobile fails with the baseline signature, desktop passes, served CSS proven', { skip: !trustedClean, timeout: 180_000 }, async () => {
  const r = await runCandidate(opts('nc1', []));
  assert.equal(r.outcome, 'PATCH_FAILED', JSON.stringify(r.failure));
  assert.equal(r.mobile?.hitTestTarget, 'promo-overlay');
  assert.equal(r.mobile?.cartCountAfter, '0');
  assert.equal(r.desktop?.status, 'passed');
  assert.equal(r.baselineIdentical, true);
  assert.ok(r.sourceProof.length === 2 && r.sourceProof.every((p) => p.served && p.bytesEqualStaged && p.hasNonce));
  assert.equal(r.integrityAfterRun, 'intact');
  assert.equal(r.stageRemoved, true);
  assert.equal(stagesLeft(), 0);
});

test('PC-1 hand-written fix: mobile and desktop pass, tap received by add-to-cart', { skip: !trustedClean, timeout: 180_000 }, async () => {
  const r = await runCandidate(opts('pc1', PC1));
  assert.equal(r.outcome, 'ORACLE_PASS', JSON.stringify(r.failure));
  assert.deepEqual([r.mobile?.status, r.mobile?.hitTestTarget, r.mobile?.cartCountAfter], ['passed', 'add-to-cart', '1']);
  assert.deepEqual([r.desktop?.status, r.desktop?.cartCountAfter], ['passed', '1']);
  assert.equal(r.baselineIdentical, false);
  assert.ok(r.sourceProof.every((p) => p.servedSha256 === r.manifest!.candidateCss.sha256));
  assert.equal(stagesLeft(), 0);
});

test('NC-6 stage tamper between manifest and run: INCONCLUSIVE and the oracle never runs', { skip: !trustedClean, timeout: 180_000 }, async () => {
  const r = await runCandidate(opts('nc6', PC1, { hooks: { beforeRun: (s) => appendFileSync(path.join(s, 'verifier/f01/f01.oracle.spec.ts'), '\n// tampered\n') } }));
  assert.equal(r.outcome, 'INCONCLUSIVE');
  assert.equal(r.failure?.code, 'TAMPER');
  assert.equal(r.oracleRan, false);
  assert.equal(stagesLeft(), 0);
});

test('dependency tamper during the run is detected after the run', { skip: !trustedClean, timeout: 180_000 }, async () => {
  const r = await runCandidate(opts('deptamper', PC1, { hooks: { afterRun: (s) => writeFileSync(path.join(s, 'node_modules/@playwright/test/injected.js'), '// x') } }));
  assert.equal(r.outcome, 'INCONCLUSIVE');
  assert.equal(r.failure?.code, 'DEPENDENCY_TAMPER');
  assert.equal(r.integrityAfterRun, 'violated');
  assert.equal(stagesLeft(), 0);
});

test('NC-7 busy port 4173: INCONCLUSIVE and the oracle never runs against the unknown server', { skip: !trustedClean, timeout: 60_000 }, async () => {
  const holder = createServer();
  await new Promise<void>((resolve, reject) => holder.once('error', reject).listen(4173, '127.0.0.1', () => resolve()));
  try {
    const r = await runCandidate(opts('nc7', PC1));
    assert.equal(r.outcome, 'INCONCLUSIVE');
    assert.equal(r.failure?.code, 'PORT_BUSY');
    assert.equal(r.oracleRan, false);
    assert.equal(stagesLeft(), 0);
    assert.equal(existsSync(path.join(scratch, 'oracle.lock')), false, 'the lock is released on failure');
  } finally {
    await new Promise<void>((resolve) => holder.close(() => resolve()));
  }
});

test('a held lock blocks a second run (no concurrent oracle runs)', { skip: !trustedClean, timeout: 60_000 }, async () => {
  const release = await acquireOracleLock(path.join(scratch, 'oracle.lock'));
  try {
    const r = await runCandidate(opts('locked', PC1));
    assert.equal(r.failure?.code, 'LOCK_HELD');
    assert.equal(r.oracleRan, false);
    assert.equal(existsSync(path.join(scratch, 'oracle.lock')), true, 'the other holder’s lock is not removed');
  } finally {
    await release();
  }
});

test('a wrong approved SHA is refused before any stage exists', { skip: !trustedClean, timeout: 60_000 }, async () => {
  const r = await runCandidate(opts('badsha', PC1, { approvedSha: '0'.repeat(40) }));
  assert.equal(r.failure?.code, 'SHA_MISMATCH');
  assert.equal(r.oracleRan, false);
  assert.equal(stagesLeft(), 0);
});

test('an out-of-grammar candidate is PATCH_REJECTED with no lock, stage or browser', { timeout: 30_000 }, async () => {
  const r = await runCandidate(opts('rejected', [{ selector: 'body', property: 'display', value: 'none' }]));
  assert.equal(r.outcome, 'PATCH_REJECTED');
  assert.equal(r.oracleRan, false);
  assert.equal(r.manifest, null);
  assert.equal(stagesLeft(), 0);
  assert.equal(existsSync(path.join(scratch, 'oracle.lock')), false);
});
