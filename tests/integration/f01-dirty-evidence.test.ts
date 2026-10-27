// End-to-end regression for the exact-SHA evidence rule: the real baseline runner
// is executed in a throwaway git copy of this repository. Needs Chromium
// (`pnpm exec playwright install chromium`); not part of the default CI test steps.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../..');
let copy: string;

const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', ...args], { cwd: copy, encoding: 'utf8' });

function runBaseline() {
  const r = spawnSync(process.execPath, ['scripts/f01-baseline.ts'], { cwd: copy, encoding: 'utf8', env: { ...process.env } });
  const runsDir = path.join(copy, '.proofpilot/runs');
  const run = readdirSync(runsDir).sort().at(-1)!;
  const summary = JSON.parse(readFileSync(path.join(runsDir, run, 'baseline-summary.json'), 'utf8'));
  return { status: r.status, stdout: r.stdout, summary };
}

before(() => {
  copy = mkdtempSync(path.join(os.tmpdir(), 'proofpilot-dirty-'));
  // Copy the working tree as it is (tracked + untracked, minus ignored), so the test also works
  // before new files are committed. A file deleted from the tree is simply not copied.
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .filter((file) => file.length > 0 && existsSync(path.join(repoRoot, file)));
  for (const file of files) {
    mkdirSync(path.dirname(path.join(copy, file)), { recursive: true });
    cpSync(path.join(repoRoot, file), path.join(copy, file));
  }
  symlinkSync(path.join(repoRoot, 'node_modules'), path.join(copy, 'node_modules'));
  git('init', '-q', '-b', 'main');
  git('add', '-A', '--', '.', ':!node_modules');
  git('commit', '-q', '-m', 'copy');
});

after(() => rmSync(copy, { recursive: true, force: true }));

test('control: clean worktree → REPRODUCED, certified, exit 0', { timeout: 120_000 }, () => {
  const r = runBaseline();
  assert.equal(r.status, 0, r.stdout);
  assert.equal(r.summary.classification.verdict, 'REPRODUCED');
  assert.equal(r.summary.certified, true);
});

test('dirty fixture that still reproduces → exit 2, artifacts kept, not certified', { timeout: 120_000 }, () => {
  // Harmless edit: the defect still reproduces, but HEAD no longer identifies the tested bytes.
  appendFileSync(path.join(copy, 'fixtures/sample-store/src/styles.css'), '\n/* uncommitted */\n');
  const r = runBaseline();
  assert.equal(r.status, 2, r.stdout);
  assert.equal(r.summary.classification.verdict, 'REPRODUCED');
  assert.equal(r.summary.classification.regression, 'PASS');
  assert.equal(r.summary.certified, false);
  assert.equal(r.summary.worktree.kind, 'dirty');
  assert.ok(r.summary.worktree.paths.includes('fixtures/sample-store/src/styles.css'));
  assert.ok(r.summary.artifacts.length > 0, 'diagnostic artifacts are preserved');
  assert.match(r.stdout, /NOT CERTIFIED/);
  git('checkout', '--', 'fixtures/sample-store/src/styles.css');
});

test('an untracked file in a verifier path also blocks certification', { timeout: 120_000 }, () => {
  writeFileSync(path.join(copy, 'verifier/untracked.txt'), 'x');
  const r = runBaseline();
  assert.equal(r.status, 2, r.stdout);
  assert.equal(r.summary.certified, false);
  rmSync(path.join(copy, 'verifier/untracked.txt'));
});
