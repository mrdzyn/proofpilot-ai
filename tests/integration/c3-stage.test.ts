// C3-0 real-browser regression: the unmodified trusted oracle runs inside a disposable stage built
// from the real repository HEAD. Needs Chromium (`pnpm exec playwright install chromium`) and a
// clean trusted tree; not part of the default CI test steps. No model or network call is made.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { acquireOracleLock, readWorktreeState, RECORD_FILE, runCandidate, STAGED_GIT_PATHS, verifyPersistedEvidence, type RunCandidateOptions } from '../../packages/core/src/index.ts';

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
  assert.equal(r.oracleExitCode, 0);
  assert.equal(r.evidenceFinalized, true);
  assert.deepEqual(await verifyPersistedEvidence(path.join(scratch, 'pc1')), [], 'record persisted, required artifacts present, hashes match');
  assert.equal(r.requiredEvidence.length, 6);
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

const persistedOutcome = (label: string) => JSON.parse(readFileSync(path.join(scratch, label, RECORD_FILE), 'utf8')).outcome;

test('MAJOR-1: both trusted tests pass but the oracle process exits nonzero -> INCONCLUSIVE, never ORACLE_PASS', { skip: !trustedClean, timeout: 180_000 }, async () => {
  const r = await runCandidate(opts('exit7', PC1, { hooks: { adjustOracleExit: () => 7 } }));
  assert.equal(r.mobile?.status, 'passed');
  assert.equal(r.desktop?.status, 'passed');
  assert.equal(r.outcome, 'INCONCLUSIVE');
  assert.equal(r.failure?.code, 'ORACLE_EXIT_ABNORMAL');
  assert.notEqual(persistedOutcome('exit7'), 'ORACLE_PASS');
});

test('MAJOR-1: a genuinely failing candidate keeps PATCH_FAILED, but not with an exit code other than 1', { skip: !trustedClean, timeout: 240_000 }, async () => {
  const ok = await runCandidate(opts('nc1-exit1', []));
  assert.equal(ok.outcome, 'PATCH_FAILED');
  assert.equal(ok.oracleExitCode, 1);
  const odd = await runCandidate(opts('nc1-exit0', [], { hooks: { adjustOracleExit: () => 0 } }));
  assert.equal(odd.outcome, 'INCONCLUSIVE');
  assert.equal(odd.failure?.code, 'ORACLE_EXIT_ABNORMAL');
});

test('MAJOR-2: a failed record write cannot leave an ORACLE_PASS (INCONCLUSIVE/EVIDENCE_INCOMPLETE, no stale passing record)', { skip: !trustedClean, timeout: 180_000 }, async () => {
  const r = await runCandidate(opts('faultwrite', PC1, { io: { writeRecord: async () => { throw new Error('ENOSPC: simulated'); } } }));
  assert.equal(r.outcome, 'INCONCLUSIVE');
  assert.equal(r.failure?.code, 'EVIDENCE_INCOMPLETE');
  assert.equal(r.evidenceFinalized, false);
  assert.equal(existsSync(path.join(scratch, 'faultwrite', RECORD_FILE)), false);
});

test('MAJOR-2: a hashing failure cannot leave an ORACLE_PASS', { skip: !trustedClean, timeout: 180_000 }, async () => {
  const r = await runCandidate(opts('faulthash', PC1, { io: { hashFile: async () => { throw new Error('EIO: simulated'); } } }));
  assert.equal(r.outcome, 'INCONCLUSIVE');
  assert.equal(r.failure?.code, 'EVIDENCE_INCOMPLETE');
  assert.notEqual(r.evidenceFinalized, true);
});

test('MAJOR-2: missing evidence (trace deleted before finalization) cannot be a pass or a fail', { skip: !trustedClean, timeout: 240_000 }, async () => {
  const dropTrace = (dir: string) => {
    const found = execFileSync('find', [dir, '-name', 'trace.zip'], { encoding: 'utf8' }).trim().split('\n')[0]!;
    rmSync(found);
  };
  for (const [label, adj] of [['missing-pass', PC1], ['missing-fail', []]] as const) {
    const r = await runCandidate(opts(label, adj, { hooks: { beforeFinalize: dropTrace } }));
    assert.equal(r.outcome, 'INCONCLUSIVE', label);
    assert.equal(r.failure?.code, 'EVIDENCE_INCOMPLETE', label);
    assert.notEqual(persistedOutcome(label), 'ORACLE_PASS');
    assert.notEqual(persistedOutcome(label), 'PATCH_FAILED');
  }
});

test('MAJOR-2: if read-back verification fails and the downgraded record cannot be written, no stale passing record remains', { skip: !trustedClean, timeout: 180_000 }, async () => {
  let writes = 0;
  let hashes = 0;
  const r = await runCandidate(
    opts('stale', PC1, {
      io: {
        // First pass hashes honestly; the verification pass sees a different hash for one file.
        hashFile: async (f) => {
          const b = readFileSync(f);
          const sha = createHash('sha256').update(b).digest('hex');
          return { sha256: ++hashes > 9 && f.endsWith('oracle-stdout.txt') ? '0'.repeat(64) : sha, bytes: b.length };
        },
        // The first write (the passing record) lands; the downgrade write fails.
        writeRecord: async (file, text) => {
          if (++writes > 1) throw new Error('ENOSPC: simulated');
          writeFileSync(file, text);
        },
      },
    }),
  );
  assert.equal(r.outcome, 'INCONCLUSIVE');
  assert.equal(r.failure?.code, 'EVIDENCE_INCOMPLETE');
  assert.equal(existsSync(path.join(scratch, 'stale', RECORD_FILE)), false, 'the earlier ORACLE_PASS record was removed');
});
