// Regression: a source change DURING recording must not leave `certifiedExactSha: true`
// in the persisted metadata, and the process exit status must agree. Runs the real
// recorder (Chromium + ffmpeg) in a throwaway git copy; not part of the default CI steps.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../..');
let copy: string;

const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', ...args], { cwd: copy, encoding: 'utf8' });

before(() => {
  copy = mkdtempSync(path.join(os.tmpdir(), 'proofpilot-rec-'));
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

type Rec = { source: { certifiedExactSha: boolean; worktreeBefore: { kind: string }; worktreeAfter: { kind: string } } };
const recordings = () => {
  const base = path.join(copy, '.proofpilot/recordings');
  const set = readdirSync(base).sort().at(-1)!;
  return ['mobile-defect', 'desktop-control'].map((k) => JSON.parse(readFileSync(path.join(base, set, k, 'recording.json'), 'utf8')) as Rec);
};

function runRecorder(midRun?: () => void): Promise<{ status: number | null; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/f01-record.ts'], { cwd: copy, env: { ...process.env } });
    let stdout = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout }));
    if (midRun) {
      const preexisting = new Set(existsSync(path.join(copy, '.proofpilot/recordings')) ? readdirSync(path.join(copy, '.proofpilot/recordings')) : []);
      // The per-clip directory is created only after the "before" check has passed, so a
      // change made once it exists is a genuine mid-recording modification.
      const poll = setInterval(() => {
        const base = path.join(copy, '.proofpilot/recordings');
        const set = existsSync(base) ? readdirSync(base).filter((n) => !preexisting.has(n)).sort().at(-1) : undefined;
        if (set && existsSync(path.join(base, set, 'mobile-defect/raw'))) {
          clearInterval(poll);
          midRun();
        }
      }, 25);
      child.on('close', () => clearInterval(poll));
    }
  });
}

test('control: clean throughout → certified in every clip, exit 0', { timeout: 240_000 }, async () => {
  const r = await runRecorder();
  assert.equal(r.status, 0, r.stdout);
  for (const rec of recordings()) {
    assert.equal(rec.source.certifiedExactSha, true);
    assert.equal(rec.source.worktreeBefore.kind, 'clean');
    assert.equal(rec.source.worktreeAfter.kind, 'clean');
  }
});

test('source modified during recording → exit 2 AND no clip says certifiedExactSha: true', { timeout: 240_000 }, async () => {
  const r = await runRecorder(() => appendFileSync(path.join(copy, 'fixtures/sample-store/src/styles.css'), '\n/* changed mid-run */\n'));
  assert.equal(r.status, 2, r.stdout);
  assert.match(r.stdout, /certified exact-SHA: NO/);
  const recs = recordings();
  assert.equal(recs.length, 2);
  for (const rec of recs) {
    assert.equal(rec.source.certifiedExactSha, false, 'persisted metadata must agree with the exit status');
    assert.equal(rec.source.worktreeBefore.kind, 'clean');
    assert.equal(rec.source.worktreeAfter.kind, 'dirty');
  }
});
