// T26-style boundary: the patch agent's write policy must deny the trusted
// oracle, the verdict engine and every other trust root.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { checkPatchPath, type PatchPolicy } from '../../packages/core/src/index.ts';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const policy = JSON.parse(readFileSync(path.join(repoRoot, 'config/patch-policy.json'), 'utf8')) as PatchPolicy;

function walk(dir: string): string[] {
  return readdirSync(path.join(repoRoot, dir), { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => path.relative(repoRoot, path.join(e.parentPath, e.name)).split(path.sep).join('/'));
}

test('every file in verifier/ is denied to the patcher', () => {
  const files = walk('verifier');
  assert.ok(files.includes('verifier/f01/f01.oracle.spec.ts'));
  for (const f of files) assert.equal(checkPatchPath(policy, 'F01', f).allowed, false, f);
});

test('verdict engine, tests, policy, CI and fixture server are denied', () => {
  for (const f of [
    'packages/core/src/f01-baseline.ts',
    'tests/security/trust-root.test.ts',
    'config/patch-policy.json',
    '.github/workflows/ci.yml',
    'scripts/f01-baseline.ts',
    'fixtures/sample-store/server.mjs',
    'fixtures/sample-store/README.md',
    'package.json',
    'pnpm-lock.yaml',
  ]) {
    assert.equal(checkPatchPath(policy, 'F01', f).allowed, false, f);
  }
});

test('traversal, absolute, backslash, NUL and secret-file paths are denied', () => {
  for (const f of [
    'fixtures/sample-store/src/../../../verifier/f01/f01.oracle.spec.ts',
    'fixtures/sample-store/src/./../server.mjs',
    '/etc/passwd',
    'C:/x.js',
    'fixtures\\sample-store\\src\\app.js',
    'fixtures/sample-store/src/app.js\0',
    'fixtures/sample-store/src/.env',
    'fixtures/sample-store/src/.env.local',
    'fixtures/sample-store/src/id.pem',
    'fixtures/sample-store/src/payload.sh',
    '',
  ]) {
    assert.equal(checkPatchPath(policy, 'F01', f).allowed, false, JSON.stringify(f));
  }
});

test('fixture source files are the only writable scope', () => {
  for (const f of walk('fixtures/sample-store/src')) assert.equal(checkPatchPath(policy, 'F01', f).allowed, true, f);
  assert.equal(checkPatchPath(policy, 'F99', 'fixtures/sample-store/src/app.js').allowed, false);
});

test('trust roots hold independently of the writable allowlist', () => {
  for (const root of ['verifier/', 'packages/', 'tests/', 'config/', 'scripts/', '.github/']) {
    assert.ok(policy.trustRoots.includes(root), `policy must list ${root} as a trust root`);
  }
  // Even a misconfigured, repo-wide writable scope must not open a trust root.
  const broadened: PatchPolicy = {
    ...policy,
    fixtures: { F01: { writable: [''], allowedExtensions: ['.ts', '.js', '.json', '.mjs', '.css', '.html'] } },
  };
  for (const f of ['verifier/f01/f01.oracle.spec.ts', 'verifier/playwright.config.ts', 'packages/core/src/f01-baseline.ts', 'config/patch-policy.json', 'fixtures/sample-store/server.mjs']) {
    assert.equal(checkPatchPath(broadened, 'F01', f).allowed, false, f);
  }
});
