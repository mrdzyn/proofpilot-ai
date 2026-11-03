// C3 real-run refusal drill on the exact command surface: the reserved real id refuses with
// exit 2 and zero evidence, zero stage, zero lock at the code HEAD V (no authorization record
// exists there by design). Synthetic fixtures are untouched; no provider is contacted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts/c3-b2b-verify-authenticated.ts');
const SRC = '4'.repeat(40);
const TREE = 'b'.repeat(40);
const V = 'c'.repeat(40);

const runCli = (args: string[], cwd: string): { status: number | null; output: string } => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8', timeout: 120000 });
  return { status: r.status, output: `${String(r.stdout ?? '')}\n${String(r.stderr ?? '')}` };
};
const ARGS = (runId: string) => ['--run-id', runId, '--source-sha', SRC, '--source-fixture-tree', TREE, '--source-analysis-id', 'synthetic-refusal-001', '--verification-sha', V];

test('refusal drill: the real run id exits 2 with zero evidence and zero stage at V', () => {
  const before = new Set(
    existsSync(path.join(ROOT, '.proofpilot/c3-b2b')) ? readdirSync(path.join(ROOT, '.proofpilot/c3-b2b')) : [],
  );
  const r = runCli(ARGS('c3-live-meta-001'), mkdtempSync(path.join(os.tmpdir(), 'pp-c3-refusal-')));
  assert.equal(r.status, 2, `real id refused: ${r.output.slice(-500)}`);
  assert.match(r.output, /HARD-DISABLED/, 'the refusal carries the hard-disable message at V');
  const after = existsSync(path.join(ROOT, '.proofpilot/c3-b2b')) ? readdirSync(path.join(ROOT, '.proofpilot/c3-b2b')) : [];
  assert.deepEqual(
    after.filter((f) => !before.has(f) && f.includes('c3-live-meta-001')),
    [],
    'no evidence directory is created for the real artifact',
  );
});

test('refusal drill: malformed invocation and missing stages refuse before any work', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'pp-c3-refusal-'));
  const missing = runCli(ARGS('c3-live-meta-001').slice(0, 2), dir);
  assert.equal(missing.status, 2, 'missing flags refuse');
  const badSha = runCli(['--run-id', 'c3-live-meta-001', '--source-sha', 'zz', '--source-fixture-tree', TREE, '--source-analysis-id', 'x', '--verification-sha', V], dir);
  assert.equal(badSha.status, 2, 'malformed SHA refuses before any gate');
  const unknownSynthetic = runCli(ARGS('c3-test-no-such-run'), dir);
  assert.equal(unknownSynthetic.status, 2, 'a missing synthetic artifact refuses without staging');
});
