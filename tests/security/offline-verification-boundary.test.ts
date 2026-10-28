// C3-B1 boundary: the offline coordinator, the scoreboard and the DID-1 demonstration contain no path
// to a provider, to Modal, to a model proposal, or to a VERIFIED verdict other than the one pure decision.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { APPROVED_LIVE_QUOTA, proposeCandidate, ProposalError } from '../../packages/inference/src/index.ts';

const root = path.resolve(import.meta.dirname, '../..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
const OFFLINE = ['packages/core/src/candidate-coordinator.ts', 'packages/core/src/containment-demo.ts', 'scripts/c3-offline-verification.ts'];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (['node_modules', '.git', '.proofpilot'].includes(e)) continue;
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|mjs|js)$/.test(e)) out.push(full);
  }
  return out;
}
const importsOf = (text: string) => [...text.matchAll(/(?:^|\n)\s*import[^'"\n]*['"]([^'"]+)['"]/g)].map((m) => m[1]!);

test('the offline coordinator, DID-1 and the script import no provider, inference or proposal code, and name no provider endpoint', () => {
  for (const f of OFFLINE) {
    const text = src(f);
    for (const imp of importsOf(text)) assert.doesNotMatch(imp, /inference|patch-proposal|intake|modal|baseten|reservations/i, `${f} imports ${imp}`);
    assert.doesNotMatch(text, /api\.meta\.ai|inference\.baseten|modal\.com|MODEL_API_KEY|BASETEN_API_KEY|proposeCandidate|structuredResponse|generateText|globalThis\.fetch/, f);
  }
});

test('VERIFIED is decided in exactly one place and nothing reads a model verdict', () => {
  const producers = walk(path.join(root, 'packages')).filter((f) => /status:\s*'VERIFIED'/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(producers.map((f) => path.relative(root, f)), ['packages/core/src/candidate-coordinator.ts']);
  const occurrences = src('packages/core/src/candidate-coordinator.ts').match(/status:\s*'VERIFIED'/g) ?? [];
  assert.equal(occurrences.length, 1, 'only decideVerification returns VERIFIED');
  // the coordinator takes hand-authored controls and never parses model text
  assert.doesNotMatch(src('packages/core/src/candidate-coordinator.ts'), /parseProposal|parseSymptom|processProposalResponse/);
});

test('DID-1 is a separate demonstration: its result can never be a candidate verdict and the module is not exported from the package index', () => {
  const demo = src('packages/core/src/containment-demo.ts');
  assert.match(demo, /isCandidateVerdict: false/);
  assert.match(demo, /NOT proof that candidate runs are sandboxed/);
  assert.doesNotMatch(src('packages/core/src/index.ts'), /containment-demo/);
  assert.doesNotMatch(src('packages/core/src/candidate-coordinator.ts'), /containment-demo|runDid1/);
  assert.doesNotMatch(demo, /VERIFIED|ORACLE_PASS|PATCH_FAILED/);
});

test('the zero live quota and the hard-disabled proposal entry point are untouched', async () => {
  assert.deepEqual({ ...APPROVED_LIVE_QUOTA }, { meta: 0, baseten: 0 });
  assert.equal(Object.isFrozen(APPROVED_LIVE_QUOTA), true);
  await assert.rejects(proposeCandidate({ anything: true } as never), (e: unknown) => e instanceof ProposalError && e.code === 'LIVE_NOT_APPROVED');
});

test('hand-authored only: no control is built from a file, an environment variable or model text', () => {
  const text = src('packages/core/src/candidate-coordinator.ts');
  const controls = text.slice(text.indexOf('export const HAND_AUTHORED_CONTROLS'), text.indexOf('// ------------------------------------------------------------ coordinator'));
  assert.doesNotMatch(controls, /process\.env|readFile|JSON\.parse|fetch|import\(/);
});
