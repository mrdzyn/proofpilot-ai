// C3-LIVE-01B static boundary: the guarded entry point, the owner CLI and the provenance gate cannot grow a second production path, a
// caller-controlled trust input, a loop, a retry, a credential read or a route from model output to execution.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
const code = (rel: string) => read(rel).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.git' || e === '.proofpilot') continue;
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|mjs|js)$/.test(e)) out.push(full);
  }
  return out;
}
const rel = (f: string) => path.relative(root, f).split(path.sep).join('/');
const prod = () => walk(path.join(root, 'packages')).concat(walk(path.join(root, 'scripts')));
const SCRIPT = 'scripts/c3-live-proposal.ts';
const CLI = 'packages/inference/src/live-proposal-cli.ts';
const INPUT = 'packages/inference/src/live-input.ts';

test('the owner script is a thin wiring of the real terminal and the two real production functions: no env, fetch, provider, root or trust parameter', () => {
  const text = code(SCRIPT);
  assert.deepEqual([...text.matchAll(/from '([^']+)'/g)].map((m) => m[1]).sort(), ['../packages/inference/src/index.ts', '../packages/inference/src/live-proposal-cli.ts', 'node:path', 'node:readline/promises']);
  assert.match(text, /import \{ authorizeProductionAttempt, proposeCandidate \} from '\.\.\/packages\/inference\/src\/index\.ts';/);
  assert.match(text, /runLiveProposalCli\(process\.argv\.slice\(2\), \{ io, repoRoot: path\.resolve\(import\.meta\.dirname, '\.\.'\), propose: proposeCandidate, authorize: authorizeProductionAttempt \}\)/);
  assert.equal((text.match(/runLiveProposalCli\(/g) ?? []).length, 1, 'one invocation, no loop');
  assert.doesNotMatch(text, /process\.env|\bfetch\b|createProvider|structuredResponse|MODEL_API_KEY|apiKey|\bwhile\b|\bfor\b|setTimeout|setInterval|retry|retries|fallback|child_process|prepareProductionAttempt|prepareAttemptCore|runProductionProposalAttempt/);
});

test('the CLI logic calls the gated entry point exactly once, in straight-line code, behind the confirmation, and prints no raw text or exception text', () => {
  const text = code(CLI);
  assert.equal((text.match(/deps\.propose\(/g) ?? []).length, 1);
  assert.equal((text.match(/deps\.authorize\(/g) ?? []).length, 1);
  // after the operator's confirmation there is no loop, no timer, no recursion and no concurrency: straight-line code to the single call and the report
  const afterConfirm = text.slice(text.indexOf('const phrase = liveConfirmationPhrase('));
  assert.doesNotMatch(afterConfirm, /\bwhile\b|\bfor \(|\bdo \{|setTimeout|setInterval|\.map\(|Promise\.all|\.forEach\(|runLiveProposalCli\(/);
  assert.doesNotMatch(text, /setTimeout|setInterval|Promise\.all|\.forEach\(|runLiveProposalCli\([^)]*\)\s*;?\s*$/m);
  assert.deepEqual([...text.matchAll(/\b(?:while|for) \(/g)].map((m) => m[0]).length, 2, 'only the argument parser and the optional prompt echo iterate');
  assert.doesNotMatch(text, /process\.env|process\.argv|\bfetch\b|createProvider|structuredResponse|child_process|MODEL_API_KEY|BASETEN|apiKey|(?<![A-Za-z])Authorization\b|readFile|writeFile/);
  assert.doesNotMatch(text, /live-gate-core|live-approval\.ts'.*(?:prepare|consume|evaluate)|prepareProductionAttempt|prepareAttemptCore|createSyntheticContext|runProductionProposalAttempt|proposal-orchestrator|meta-proposal-transport/);
  // order: the confirmation precedes the single call, and the call is the last statement that can send anything
  assert.ok(text.indexOf('liveConfirmationPhrase(args.runId') < text.indexOf('deps.propose('), 'the typed confirmation comes before the call');
  assert.ok(text.indexOf('deps.authorize(') < text.indexOf('io.ask('), 'the read-only gate is evaluated before the operator is asked');
  assert.doesNotMatch(text, /String\(e\)|JSON\.stringify\(e\)|\.stack|rawText|renderedCss|\.adjustments/);
  // the only exception messages printed are our own fixed-text messages of two known classes; the entry point's errors print the typed code only
  assert.equal((text.match(/\be\.message\b/g) ?? []).length, 2);
  assert.match(text, /e instanceof LiveInputError \? e\.message/);
  assert.match(text, /e instanceof AuthorizationError \? `: \$\{e\.message\}`/);
  // only typed codes of known error classes are printed
  assert.match(text, /const codeOf = \(e: unknown\): string => \(e instanceof AuthorizationError \|\| e instanceof ProposalError \|\| e instanceof InferenceError \|\| e instanceof LiveInputError \? e\.code : 'UNEXPECTED_ERROR'\);/);
});

test('the provenance gate is read-only and offline: no network, environment, credential, spawn or write', () => {
  const text = code(INPUT);
  assert.doesNotMatch(text, /process\.env|\bfetch\b|createProvider|structuredResponse|child_process|execFile|\bspawn\b|writeFile|appendFile|rm\(|unlink|rename|MODEL_API_KEY|apiKey|\beval\(|new Function/);
  assert.match(text, /extractOracleResults/);
  assert.match(text, /classifyF01Baseline/);
  assert.match(text, /certifyF01Baseline/);
  assert.match(text, /evidenceKind !== 'live'/);
  assert.match(text, /sha256\(bytes\) !== a\.sha256/);
  assert.match(text, /parseSymptom\(body, \{ videoDurationSec: duration \}\)/);
  assert.doesNotMatch(text, /trustedFactsFromBaseline\([^)]*(?:args|input|opts|process)/, 'facts come from the re-derived oracle observation only');
});

test('the entry point and the gate keep a single production path: one runner, one transport, one importer chain, no caller-controlled trust', () => {
  const entry = code('packages/inference/src/patch-proposal.ts');
  const fn = entry.slice(entry.indexOf('export async function proposeCandidate'));
  assert.equal(fn, "export async function proposeCandidate(input: ProposeCandidateInput): Promise<ProposalOutcome & { synthetic: boolean; settled: boolean }> {\n  const { runProductionProposalAttempt } = await import('./proposal-orchestrator.ts');\n  return runProductionProposalAttempt({ runId: input?.runId, request: input?.request });\n}\n");
  assert.deepEqual(prod().filter((f) => /\.structuredResponse\(/.test(readFileSync(f, 'utf8'))).map(rel), ['packages/inference/src/meta-proposal-transport.ts']);
  assert.deepEqual(prod().filter((f) => /prepareProductionAttempt\(/.test(code(rel(f)))).map(rel).sort(), ['packages/inference/src/live-gate.ts', 'packages/inference/src/proposal-orchestrator.ts']);
  // the production gate still takes only the four attempt facts
  assert.match(code('packages/inference/src/live-gate.ts'), /export type ProductionAttempt = \{ runId: string; request: BuiltProposalRequest; provider: Pick<InferenceProvider, 'id' \| 'models'>; maxOutputTokens: number \};/);
  // the synthetic path stays isolated: its runner still refuses production trust and is imported only by the rehearsal
  const orch = code('packages/inference/src/proposal-orchestrator.ts');
  assert.match(orch, /if \(a\.ctx\?\.kind !== 'synthetic'\) throw new ProposalError\('LIVE_NOT_APPROVED'/);
  assert.match(orch, /!SCRIPTED\.has\(a\.transport\)\) throw new ProposalError\('LIVE_NOT_APPROVED'/);
  assert.deepEqual(prod().filter((f) => /from '[^']*\/proposal-orchestrator\.ts'/.test(readFileSync(f, 'utf8'))).map(rel), ['packages/inference/src/live-rehearsal.ts']);
});

test('Baseten and Modal stay unauthorized: quota 0, provider refused by the gate, and no Modal/hosted-backend code exists', () => {
  assert.match(code('packages/inference/src/reservations.ts'), /Object\.freeze\(\{ meta: 1, baseten: 0 \}\)/);
  assert.match(code('packages/inference/src/live-gate-core.ts'), /provider\?\.id !== 'meta'\) fail\('PROVIDER_NOT_ALLOWED'/);
  assert.match(code('packages/inference/src/patch-proposal.ts'), /META_PROPOSAL_MODEL/);
  for (const f of prod()) assert.doesNotMatch(code(rel(f)), /\bmodal\.com|from 'modal'|@modal|MODAL_TOKEN/i, rel(f));
  assert.match(read('docs/LIVE-C3-01-DECISION-RECORD.md'), /Baseten or Modal calls/);
});

test('model-generated CSS cannot reach the staging runner, the offline coordinator or the trusted verifier', () => {
  for (const f of ['packages/core/src/candidate-stage.ts', 'packages/core/src/candidate-coordinator.ts', 'packages/core/src/patch-proposal.ts']) {
    assert.doesNotMatch(code(f), /inference\/src|proposal-orchestrator|live-proposal-cli|live-input|PROPOSAL_ACCEPTED|ProposalArtifact|proposeCandidate/, f);
  }
  for (const f of walk(path.join(root, 'verifier'))) assert.doesNotMatch(readFileSync(f, 'utf8'), /patch-proposal|inference|proposeCandidate|proposal-orchestrator/, f);
  for (const f of [CLI, INPUT, SCRIPT, 'packages/inference/src/proposal-orchestrator.ts', 'packages/inference/src/meta-proposal-transport.ts']) {
    assert.doesNotMatch(code(f), /candidate-stage|candidate-coordinator|runCandidate|runOfflineVerification|playwright|['"`]VERIFIED['"`]/, f);
  }
});


test('hosted CI validates the exact revision with full history, keeps every required gate, and the pin-lineage check is read-only', () => {
  const ci = read('.github/workflows/ci.yml');
  const stack = ci.slice(ci.indexOf('stack-validation:'));
  // exact PR head (or the dispatched SHA), full history, no synthetic merge commit
  assert.match(stack, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(stack, /fetch-depth: 0/);
  assert.match(stack, /persist-credentials: false/);
  assert.match(stack, /EXPECTED_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(stack, /test "\$\{actual\}" = "\$\{EXPECTED_SHA\}"/);
  assert.match(stack, /git rev-parse --is-shallow-repository/);
  assert.match(stack, /git status --porcelain/);
  assert.ok(stack.indexOf('Verify the checked-out revision') < stack.indexOf('Install pnpm and dependencies'), 'verified before anything runs');
  // the pin file may only change together with a valid lineage
  assert.match(stack, /grep -qx 'config\/live-activation\.json'/);
  assert.match(stack, /require="--require-valid"/);
  // the existing required gates are all still there, in order, and the triggers are unchanged
  assert.match(ci, /on:\n  pull_request:\n  workflow_dispatch:/);
  assert.match(ci, /uses: \.\/\.github\/workflows\/common-validation\.yml/);
  const steps = ['pnpm install --frozen-lockfile', 'pnpm lint', 'pnpm typecheck', 'pnpm test:unit', 'pnpm test:security', 'playwright install --with-deps chromium', 'pnpm f01:baseline'].map((n) => stack.indexOf(n));
  assert.ok(steps.every((i) => i > 0) && [...steps].sort((a, b) => a - b).join() === steps.join(), 'required gates present and ordered');
  // actions stay pinned by commit SHA
  for (const m of ci.matchAll(/uses: ([^\s]+)/g)) assert.ok(m[1]!.startsWith('./') || /@[0-9a-f]{40}$/.test(m[1]!), `unpinned action ${m[1]}`);
  const check = code('scripts/c3-pin-check.ts');
  assert.deepEqual([...check.matchAll(/from '([^']+)'/g)].map((m) => m[1]).sort(), ['../packages/inference/src/index.ts', 'node:fs', 'node:path']);
  assert.doesNotMatch(check, /process\.env|\bfetch\b|createProvider|structuredResponse|child_process|writeFile|appendFile|rm\(|unlink|rename|MODEL_API_KEY|prepareProductionAttempt|proposeCandidate/);
});
