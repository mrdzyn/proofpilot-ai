// C3-B2B P1 boundary: the neutral Zone P provenance module has a fixed, allow-listed transitive import set
// (static and dynamic imports), can reach no network/credential/process/write capability, and Zone E still
// imports neither inference nor provenance code. No provider is contacted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const MODULE = 'packages/provenance/src/provenance-input.ts';
const LEGACY_INPUT = 'packages/inference/src/live-input.ts';
const LEGACY_PIPELINE = 'packages/inference/src/patch-proposal.ts';

/** The complete transitive import set Zone P is allowed: the module itself, the core parser leaves (plus the
 *  type-only status leaf), the intake run-id check (plus its error leaf), and nothing else. */
const ALLOW_FILES = [
  'packages/provenance/src/provenance-input.ts',
  'packages/core/src/symptom.ts',
  'packages/core/src/f01-baseline.ts',
  'packages/core/src/status.ts',
  'packages/core/src/css-adjustments.ts',
  'packages/intake/src/consent.ts',
  'packages/intake/src/errors.ts',
].sort();
const ALLOW_BUILTINS = ['node:crypto', 'node:fs/promises', 'node:path'].sort();
/** Read-only filesystem members: a write here would break the read-only zone. */
const ALLOW_FS_MEMBERS = ['readFile', 'readdir', 'stat'].sort();

const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
/** Source without comments, so prose that mentions a capability cannot trip a code-shape check. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');

type Closure = { files: string[]; builtins: string[]; bare: string[]; dynamic: string[]; fsMembers: string[] };
function closureOf(entry: string): Closure {
  const files = new Set<string>();
  const builtins = new Set<string>();
  const bare = new Set<string>();
  const dynamic: string[] = [];
  const fsMembers = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const rel = queue.pop()!;
    if (files.has(rel)) continue;
    files.add(rel);
    const text = read(rel);
    const dir = path.posix.dirname(rel);
    for (const m of text.matchAll(/\bfrom\s*'([^']+)'/g)) {
      const spec = m[1]!;
      if (spec.startsWith('.')) {
        const resolved = path.posix.normalize(path.posix.join(dir, spec));
        queue.push(resolved);
      } else if (spec.startsWith('node:')) {
        builtins.add(spec);
        if (spec === 'node:fs/promises') {
          for (const im of text.matchAll(/\bimport\s*\{([^}]*)\}\s*from\s*'node:fs\/promises'/g)) {
            for (const name of im[1]!.split(',').map((s) => s.trim().split(/\s+/)[0]).filter(Boolean)) fsMembers.add(name!);
          }
        }
      } else {
        bare.add(`${rel} -> ${spec}`);
      }
    }
    for (const m of text.matchAll(/\bimport\s*\(\s*'([^']+)'/g)) {
      const spec = m[1]!;
      dynamic.push(`${rel} -> ${spec}`);
      if (spec.startsWith('.')) queue.push(path.posix.normalize(path.posix.join(dir, spec)));
      else if (spec.startsWith('node:')) builtins.add(spec);
      else bare.add(`${rel} -> ${spec}`);
    }
  }
  return { files: [...files].sort(), builtins: [...builtins].sort(), bare: [...bare].sort(), dynamic, fsMembers: [...fsMembers].sort() };
}

test('Zone P has exactly the allow-listed transitive import set: no network, provider, credential, env, process or write capability', () => {
  const c = closureOf(MODULE);
  assert.deepEqual(c.files, ALLOW_FILES, 'the transitive file set is exactly the allow-list');
  assert.deepEqual(c.builtins, ALLOW_BUILTINS, 'only crypto, read-only fs and path builtins');
  assert.deepEqual(c.bare, [], 'no bare package import');
  assert.deepEqual(c.dynamic, [], 'no dynamic import() anywhere in the closure');
  assert.deepEqual(c.fsMembers, ALLOW_FS_MEMBERS, 'only read-only filesystem members are imported');
  for (const f of c.files) {
    const text = code(read(f));
    assert.doesNotMatch(text, /process\.(env|argv|cwd|exit|stdin|stdout)/, f);
    assert.doesNotMatch(text, /(?<![A-Za-z_.])fetch\s*\(/, f);
    assert.doesNotMatch(text, /child_process|execFile|spawnSync|\bspawn\b/, f);
    assert.doesNotMatch(text, /writeFile|appendFile|mkdir|rm\s*\(|unlink|rename|copyFile|chmod|createWriteStream|\.open\s*\(/, f);
    assert.doesNotMatch(text, /\beval\s*\(|new Function/, f);
    assert.doesNotMatch(text, /node:(net|http|https|dgram|tls|dns|worker_threads|cluster)/, f);
    assert.doesNotMatch(text, /structuredResponse|createProvider|apiKey|credential|reservation|quota/i, f);
  }
});

test('the legacy live-input.ts adds no capability beyond one re-export edge', () => {
  const input = closureOf(LEGACY_INPUT);
  assert.deepEqual(input.files, [LEGACY_INPUT, ...ALLOW_FILES].sort(), 'the shim reaches exactly the allow-list and nothing else');
  assert.deepEqual(input.builtins, ALLOW_BUILTINS);
  assert.deepEqual(input.dynamic, [], 'the shim has no dynamic import');
});

test('the check discriminates, statically and dynamically: the inference pipeline violates the allow-list (negative control)', () => {
  const pipe = closureOf(LEGACY_PIPELINE);
  assert.ok(pipe.files.some((f) => /inference\/src\/(reservations|config|client)\.ts/.test(f)), 'static imports reach reservation, config and client capabilities');
  assert.ok(pipe.dynamic.some((d) => d.endsWith('proposal-orchestrator.ts')), 'the lazy production-runner import is followed');
  assert.ok(pipe.files.some((f) => f.endsWith('proposal-orchestrator.ts')), '... and its dynamic target is in the closure');
  assert.notDeepEqual(pipe.files, ALLOW_FILES, 'the pipeline genuinely violates the allow-list, so the check is not vacuous');
});

test('the legacy live-input.ts is a pure delegation shim: one re-export, no logic of its own', () => {
  const text = read(LEGACY_INPUT);
  assert.deepEqual([...text.matchAll(/\bfrom\s*'([^']+)'/g)].map((m) => m[1]), ['../../provenance/src/provenance-input.ts']);
  assert.doesNotMatch(code(text), /\bfunction\b|\bconst\b|\bclass\b|\bimport\s*\(/);
  assert.match(text, /^export \* from '\.\.\/\.\.\/provenance\/src\/provenance-input\.ts';$/m);
});

test('Zone E stays separate: staging and the coordinator import no inference or provenance code', () => {
  for (const f of ['packages/core/src/candidate-stage.ts', 'packages/core/src/candidate-coordinator.ts']) {
    assert.doesNotMatch(code(read(f)), /inference\/src|packages\/provenance|provenance-input/, f);
  }
});
