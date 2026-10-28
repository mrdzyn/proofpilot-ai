// C3-B1 real-browser run: baseline gate, NC-1/NC-1b/NC-3/NC-6/NC-7, PC-1 with 3 fresh replays, the derived
// NC-5, scoreboard re-verification and tamper detection, plus DID-1. Hand-authored inputs only; no model,
// provider or Modal call. Needs Chromium; local only (hosted CI does not run it).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readWorktreeState, runOfflineVerification, SCOREBOARD_FILE, STAGED_GIT_PATHS, verifyScoreboard, type Scoreboard } from '../../packages/core/src/index.ts';
import { runDid1 } from '../../packages/core/src/containment-demo.ts';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
const scratch = mkdtempSync(path.join(os.tmpdir(), 'pp-c3b1-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
const clean = readWorktreeState(repoRoot, STAGED_GIT_PATHS).kind === 'clean';

let board: Scoreboard;
const outDir = path.join(scratch, 'run');

test('coordinator over the real oracle: expected statuses, PC-1 VERIFIED 3/3, NC-5 NOT_REPRODUCED', { skip: !clean, timeout: 540_000 }, async () => {
  board = await runOfflineVerification({
    repoRoot, approvedSha: sha, outDir,
    lockPath: path.join(scratch, 'stage.lock'), coordinatorLockPath: path.join(scratch, 'coord.lock'), stageRoot: path.join(scratch, 'stages'),
  });
  assert.equal(board.baseline.reproduced, true, board.baseline.reasons.join('; '));
  const got = Object.fromEntries(board.candidates.map((c) => [c.id, c.status]));
  assert.deepEqual(got, { 'NC-1': 'PATCH_FAILED', 'NC-1b': 'PATCH_FAILED', 'NC-3': 'PATCH_FAILED', 'NC-6': 'INCONCLUSIVE', 'NC-7': 'INCONCLUSIVE', 'PC-1': 'VERIFIED' });
  for (const c of board.candidates) assert.deepEqual([c.id, c.expectationMet, c.expectationProblems], [c.id, true, []]);
  const pc1 = board.candidates.find((c) => c.id === 'PC-1')!;
  assert.equal(pc1.replaysPassed, 3);
  assert.equal(new Set(pc1.replays.map((r) => r.nonce)).size, 3);
  assert.ok(pc1.replays.every((r) => r.oracleExitCode === 0 && r.evidenceFinalized));
  assert.equal(board.nc5.status, 'NOT_REPRODUCED');
  assert.equal(board.nc5.neverVerified, true);
  const nc3 = board.candidates.find((c) => c.id === 'NC-3')!;
  assert.deepEqual([nc3.replays[0]!.mobile?.status, nc3.replays[0]!.desktop?.status], ['failed', 'failed']);
  assert.equal(board.candidates.find((c) => c.id === 'NC-7')!.replays[0]!.failureCode, 'PORT_BUSY');
  assert.equal(board.candidates.find((c) => c.id === 'NC-6')!.replays[0]!.failureCode, 'TAMPER');
  assert.equal(existsSync(path.join(scratch, 'coord.lock')), false);
  assert.equal(existsSync(path.join(scratch, 'stages')) ? readdirSync(path.join(scratch, 'stages')).length : 0, 0, 'every stage removed');
});

test('the persisted scoreboard re-verifies from its evidence; tampering with real evidence fails closed', { skip: !clean, timeout: 120_000 }, async () => {
  assert.deepEqual(await verifyScoreboard(outDir), []);
  const tampered = path.join(scratch, 'tampered');
  cpSync(outDir, tampered, { recursive: true });
  const file = path.join(tampered, 'PC-1/replay-2/oracle-stdout.txt');
  writeFileSync(file, readFileSync(file, 'utf8') + 'tampered');
  assert.match((await verifyScoreboard(tampered)).join(), /hash mismatch: oracle-stdout\.txt/);
  const forged = path.join(scratch, 'forged');
  cpSync(outDir, forged, { recursive: true });
  const sb = JSON.parse(readFileSync(path.join(forged, SCOREBOARD_FILE), 'utf8'));
  sb.candidates.find((c: { id: string }) => c.id === 'NC-1').status = 'VERIFIED';
  writeFileSync(path.join(forged, SCOREBOARD_FILE), JSON.stringify(sb));
  assert.match((await verifyScoreboard(forged)).join(), /NC-1: scoreboard says VERIFIED/);
});

test('DID-1: routing aborts everything outside the one allowed origin; it is a separate demonstration, not a verdict', { timeout: 90_000 }, async () => {
  const r = await runDid1();
  assert.equal(r.passed, true);
  assert.equal(r.isCandidateVerdict, false);
  assert.deepEqual(r.pageFetchOutcomes, { invalidHost: 'rejected', canary: 'rejected' });
  assert.equal(r.canaryConnections, 0);
  assert.ok(r.controlCanaryConnectionsWithoutRouting >= 1, 'the canary detector is sensitive');
  assert.match(r.limits.join(' '), /NOT proof that candidate runs are sandboxed/);
});
