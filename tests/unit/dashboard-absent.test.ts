// UI-C3-01B T-ABSENT-1: static scan of the dashboard shell source.
// The shell must contain no Run/Verify/Approve/Deploy control label, no
// provider endpoint string, no `.proofpilot` path literal, and no credential
// or approval identifier. Pure source scan: no browser, no provider.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const shellRoots = [
  path.join(repoRoot, 'dashboard', 'src'),
  path.join(repoRoot, 'dashboard', 'index.html'),
  path.join(repoRoot, 'dashboard', 'vite.config.ts'),
];

function collect(dirOrFile: string, out: string[]): void {
  const st = statSync(dirOrFile);
  if (!st.isDirectory()) {
    out.push(dirOrFile);
    return;
  }
  for (const entry of readdirSync(dirOrFile)) collect(path.join(dirOrFile, entry), out);
}

const files: string[] = [];
for (const root of shellRoots) collect(root, files);
assert.ok(files.length > 5, 'shell source files found');

const hits: Array<{ file: string; rule: string; line: string }> = [];
for (const file of files) {
  const rel = path.relative(repoRoot, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((raw, i) => {
    const line = raw.trim();
    // Skip the documented CSP allowlist (loopback-only connect-src for Vite
    // dev HMR): it is the one deliberate network-adjacent string, and the
    // T-NET walkthrough proves it never leaves loopback.
    if (rel === 'dashboard/index.html' && /connect-src/.test(line)) return;
    const check = (rule: string, re: RegExp): void => {
      if (re.test(line)) hits.push({ file: rel, rule, line: line.slice(0, 160) });
    };
    check(
      'prohibited-control',
      /\bRun AI\b|\bVerify (Model )?Proposal\b|\bApprove Patch\b|\bDeploy\b/i,
    );
    check(
      'provider-endpoint',
      /baseten|modal\.com|api\.meta\.com|graph\.facebook\.com|openai\.com\/v1|anthropic\.com/i,
    );
    check('hidden-path', /\.proofpilot/);
    check(
      'credential',
      /api[_-]?key\s*[:=]|client[_-]?secret|-----BEGIN [A-Z ]*PRIVATE KEY|gh[op]_[A-Za-z0-9]+|sk-(live|test)-[A-Za-z0-9]/i,
    );
  });
}

test('T-ABSENT-1: no prohibited control, endpoint, hidden path, or credential in shell source', () => {
  assert.deepEqual(hits, [], `forbidden strings in shell source: ${JSON.stringify(hits, null, 2)}`);
});
