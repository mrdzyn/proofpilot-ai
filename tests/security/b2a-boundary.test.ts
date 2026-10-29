// C3-B2A boundary: live proposals stay impossible, model-derived proposals cannot reach execution, the new
// preflight and discovery tools cannot reach the network by default, and no secret or raw model output is committed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  assertHandAuthoredControls,
  HAND_AUTHORED_CONTROLS,
  parseProposal,
  acceptedAdjustments,
  runOfflineVerification,
  UntrustedControlError,
  type Control,
  type Runner,
} from '../../packages/core/src/index.ts';
import { APPROVED_LIVE_QUOTA, createProvider, loadProviderConfig, proposeCandidate, ProposalError } from '../../packages/inference/src/index.ts';
import { liveEnv, SENTINEL_KEY, tempDir } from '../helpers.ts';

const root = path.resolve(import.meta.dirname, '../..');
const src = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
const realFetch = globalThis.fetch;
let fetchCalls = 0;
before(() => {
  globalThis.fetch = (() => {
    fetchCalls++;
    throw new Error('real network must not be used');
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
  assert.equal(fetchCalls, 0);
});

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (['node_modules', '.git', '.proofpilot'].includes(e)) continue;
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|mjs|js)$/.test(e)) out.push(full);
  }
  return out;
}
const rel = (f: string) => path.relative(root, f);
/** Source without comments, so prose that mentions a word cannot trip a code-shape check. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');

test('no configuration or provider can change the live quota (Meta 1 lifetime attempt, Baseten 0), and the entry point only ever delegates to the production gate', async () => {
  assert.deepEqual({ ...APPROVED_LIVE_QUOTA }, { meta: 1, baseten: 0 });
  assert.equal(Object.isFrozen(APPROVED_LIVE_QUOTA), true);
  const env = { ...liveEnv(), BASETEN_API_KEY: SENTINEL_KEY, PROOFPILOT_ALLOW_PROVIDER_DISCOVERY: '1', PROOFPILOT_ALLOW_LIVE_PROPOSALS: '1', PROOFPILOT_LIVE_QUOTA: '5' };
  for (const id of ['meta', 'baseten'] as const) {
    const provider = createProvider(loadProviderConfig(id, env), { fetch: realFetch });
    const forged = { id, models: provider.models, billableCallsAllowed: true, structuredResponse: () => { throw new Error('must not be called'); } };
    for (const arg of [undefined, { provider }, { provider: forged, quota: 5, injectedTransportQuota: 5, mockQuota: 5 }]) {
      await assert.rejects(proposeCandidate(arg as never), (e: unknown) => e instanceof ProposalError && e.code === 'INVALID_INPUT', 'a call without a run id and a built request is malformed whatever else it carries');
    }
  }
  // no environment variable name can raise a quota
  for (const f of walk(path.join(root, 'packages'))) assert.doesNotMatch(readFileSync(f, 'utf8'), /process\.env\.[A-Z_]*QUOTA|env\.[A-Z_]*LIVE_QUOTA|ALLOW_LIVE_PROPOSALS/, rel(f));
});

test('model-derived proposals cannot enter the C3-B1 execution path: the coordinator refuses any control that is not an in-code hand-authored control', async () => {
  const accepted = parseProposal('{"adjustments":[{"selector":".promo-overlay","property":"pointer-events","value":"none"}]}');
  assert.equal(accepted.ok, true);
  const modelControl: Control = { id: 'MODEL-1', description: 'from a model', adjustments: acceptedAdjustments(accepted), replays: 3, expect: 'VERIFIED' };
  let runnerCalls = 0;
  const runner: Runner = async () => {
    runnerCalls++;
    throw new Error('runner must not be reached');
  };
  const base = { repoRoot: root, approvedSha: 'a'.repeat(40), outDir: path.join(tempDir(), 'out'), lockPath: path.join(tempDir(), 's.lock'), coordinatorLockPath: path.join(tempDir(), 'c.lock'), runner };
  // a model-derived control under a new id, under a trusted id, with altered CSS, duplicated, or among the trusted ones
  const trusted = HAND_AUTHORED_CONTROLS.find((c) => c.id === 'PC-1')!;
  const variants: Control[][] = [
    [modelControl],
    [{ ...trusted, adjustments: acceptedAdjustments(parseProposal('{"adjustments":[{"selector":".promo-overlay","property":"z-index","value":"-1"}]}')) }],
    [{ ...trusted, replays: 1 }],
    [{ ...trusted, expect: 'ORACLE_PASS' }],
    [{ ...trusted, description: 'renamed' }],
    [trusted, trusted],
    [...HAND_AUTHORED_CONTROLS, modelControl],
  ];
  for (const controls of variants) {
    assert.throws(() => assertHandAuthoredControls(controls), UntrustedControlError);
    await assert.rejects(runOfflineVerification({ ...base, controls }), UntrustedControlError);
  }
  assert.equal(runnerCalls, 0, 'the runner (and therefore any stage or browser) was never reached');
  assert.doesNotThrow(() => assertHandAuthoredControls(HAND_AUTHORED_CONTROLS));
  assert.doesNotThrow(() => assertHandAuthoredControls([trusted]));
});

test('MAJOR-1: provenance is identity, not field equality; clones, foreign check callbacks and mutation attempts are refused before any lock, stage or runner', async () => {
  const parsed = parseProposal('{"adjustments":[{"selector":".promo-overlay","property":"pointer-events","value":"none"}]}');
  assert.equal(parsed.ok, true);
  const pc1 = HAND_AUTHORED_CONTROLS.find((c) => c.id === 'PC-1')!;
  const nc1 = HAND_AUTHORED_CONTROLS.find((c) => c.id === 'NC-1')!;
  let runnerCalls = 0;
  let foreignChecks = 0;
  const runner: Runner = async () => {
    runnerCalls++;
    throw new Error('runner must not be reached');
  };
  const dir = tempDir();
  const base = { repoRoot: root, approvedSha: 'a'.repeat(40), outDir: path.join(dir, 'out'), lockPath: path.join(dir, 's.lock'), coordinatorLockPath: path.join(dir, 'locks', 'c.lock'), stageRoot: path.join(dir, 'stages'), runner };
  const foreign = () => {
    foreignChecks++;
    return [] as string[];
  };
  const variants: Control[][] = [
    // model-derived adjustments identical to trusted PC-1, wearing PC-1's metadata
    [{ id: pc1.id, description: pc1.description, adjustments: acceptedAdjustments(parsed), replays: pc1.replays, expect: pc1.expect }],
    // a plain structural copy of PC-1, and a deep copy
    [{ ...pc1 }],
    [structuredClone({ id: pc1.id, description: pc1.description, adjustments: pc1.adjustments, replays: pc1.replays, expect: pc1.expect })],
    // foreign check callbacks on PC-1 and NC-1
    [{ ...pc1, check: foreign }],
    [{ ...nc1, check: foreign }],
    [Object.create(pc1) as Control],
  ];
  for (const controls of variants) {
    assert.throws(() => assertHandAuthoredControls(controls), UntrustedControlError);
    await assert.rejects(runOfflineVerification({ ...base, controls }), UntrustedControlError);
  }
  assert.equal(runnerCalls, 0, 'the runner was never reached');
  assert.equal(foreignChecks, 0, 'no caller-supplied check callback ran');
  for (const p of [base.coordinatorLockPath, path.dirname(base.coordinatorLockPath), base.lockPath, base.outDir, base.stageRoot]) assert.equal(existsSync(p), false, `${path.basename(p)} was created before the refusal`);

  // the trusted definitions cannot be mutated, so a reference taken earlier cannot be altered into a model control
  assert.equal(Object.isFrozen(HAND_AUTHORED_CONTROLS), true);
  for (const c of HAND_AUTHORED_CONTROLS) {
    assert.equal(Object.isFrozen(c), true, c.id);
    assert.equal(Object.isFrozen(c.adjustments), true, c.id);
    for (const a of c.adjustments) assert.equal(Object.isFrozen(a), true, c.id);
  }
  const css = JSON.stringify(pc1.adjustments);
  const check = nc1.check;
  assert.throws(() => { (pc1.adjustments[0] as { value: string }).value = 'auto'; }, TypeError);
  assert.throws(() => { (pc1.adjustments as unknown[]).push({ selector: 'a', property: 'color', value: 'red' }); }, TypeError);
  assert.throws(() => { (nc1 as { check?: unknown }).check = foreign; }, TypeError);
  assert.throws(() => { (pc1 as { id: string }).id = 'X'; }, TypeError);
  assert.throws(() => { (HAND_AUTHORED_CONTROLS as Control[]).push({ ...pc1 }); }, TypeError);
  assert.throws(() => { (HAND_AUTHORED_CONTROLS as Control[])[5] = { ...pc1 }; }, TypeError);
  assert.equal(JSON.stringify(pc1.adjustments), css);
  assert.equal(nc1.check, check);
  assert.equal(HAND_AUTHORED_CONTROLS.length, 6);

  // the legitimate controls, whole or as a subset, are still accepted
  assert.doesNotThrow(() => assertHandAuthoredControls(HAND_AUTHORED_CONTROLS));
  assert.doesNotThrow(() => assertHandAuthoredControls([pc1]));
  assert.doesNotThrow(() => assertHandAuthoredControls([nc1, pc1]));
});

test('no production file connects an accepted proposal to execution: acceptedAdjustments is defined once and used nowhere in production', () => {
  const prod = walk(path.join(root, 'packages')).concat(walk(path.join(root, 'scripts')));
  const users = prod.filter((f) => /\bacceptedAdjustments\b/.test(readFileSync(f, 'utf8'))).map(rel);
  assert.deepEqual(users.filter((f) => f !== 'packages/core/src/patch-proposal.ts' && f !== 'packages/core/src/index.ts'), []);
  for (const f of ['packages/core/src/candidate-stage.ts', 'packages/core/src/candidate-coordinator.ts', 'scripts/c3-offline-verification.ts', 'scripts/c3-stage-spike.ts']) {
    const text = src(f);
    assert.doesNotMatch(text, /patch-proposal|proposal-readiness|parseProposal|processProposalResponse|reservations|baseten-discovery/, f);
  }
  // the preflight and the discovery tools never import the staging runner or the coordinator
  for (const f of ['packages/inference/src/proposal-readiness.ts', 'packages/inference/src/baseten-discovery.ts', 'scripts/c3-proposal-preflight.ts', 'scripts/baseten-model-discovery.ts']) {
    assert.doesNotMatch(src(f), /candidate-stage|candidate-coordinator|runCandidate|runOfflineVerification/, f);
  }
});

test('the preflight cannot reach the network or read secrets: no fetch, provider, env or file reads', () => {
  const text = code(src('packages/inference/src/proposal-readiness.ts'));
  assert.doesNotMatch(text, /\bfetch\b|createProvider|structuredResponse|process\.env|readFile|child_process/);
  assert.doesNotMatch(code(src('scripts/c3-proposal-preflight.ts')), /\bfetch\b|createProvider|structuredResponse|MODEL_API_KEY|BASETEN_API_KEY/);
});

test('the Baseten discovery tool is owner-run only: nothing else imports it, it defaults to a dry run, and it hardcodes retries 0', () => {
  const importers = walk(path.join(root, 'packages')).concat(walk(path.join(root, 'scripts'))).concat(walk(path.join(root, 'tests'))).filter((f) => /baseten-discovery/.test(readFileSync(f, 'utf8'))).map(rel).sort();
  assert.deepEqual(importers, ['packages/inference/src/index.ts', 'scripts/baseten-model-discovery.ts', 'tests/security/b2a-boundary.test.ts'].sort());
  const text = src('packages/inference/src/baseten-discovery.ts');
  assert.match(text, /PROOFPILOT_INFERENCE_MAX_RETRIES: '0'/);
  assert.match(text, /PROOFPILOT_ALLOW_PROVIDER_DISCOVERY !== '1'/);
  assert.doesNotMatch(text, /generateText|structuredResponse|respondWithVideo|uploadVideoFile|BASETEN_PUBLIC_ALIAS\s*[,)]\s*\n?\s*\)\s*;?\s*return/);
  assert.doesNotMatch(src('package.json'), /baseten-model-discovery|c3-proposal-preflight/, 'no package script runs these implicitly');
});

test('the LIVE-C3-01 decision record states the owner-approved limits, the remaining gates and what is still NOT approved', () => {
  const text = src('docs/LIVE-C3-01-DECISION-RECORD.md');
  assert.match(text, /issuecomment-6496850990/);
  assert.match(text, /not authorization to make a provider request now/i);
  assert.match(text, /Activation revision pin[^\n]*NOT RECORDED/);
  assert.match(text, /Real provider invocation[^\n]*NOT AUTHORIZED YET/);
  for (const needle of ['muse-spark-1.3', 'Maximum number of billable attempts', 'per-run', 'No retries', 'No fallback', 'Stop conditions', 'credit balance', 'Baseten', 'api.meta.ai', '12,000', '3,072']) {
    assert.match(text, new RegExp(needle, 'i'), needle);
  }
  assert.match(text, /C3-B2B[^\n]*NOT APPROVED/);
  assert.match(src('tasks/PP-META-I2-C3.md'), /LIVE-C3-01 \| .*APPROVED/);
});

test('no provider secret, key-shaped string or raw model output is committed', () => {
  const files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  const textFiles = files.filter((f) => /\.(ts|mjs|js|json|md|yml|yaml|txt|example)$/.test(f) || /^\.env/.test(path.basename(f)));
  const patterns: Array<[RegExp, string]> = [
    [/\b(?:sk|pk|rk)-[A-Za-z0-9]{24,}\b/, 'API-key-shaped token'],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key block'],
    [/\b(?:MODEL_API_KEY|BASETEN_API_KEY)[ \t]*=[ \t]*["']?[A-Za-z0-9_\-]{12,}/, 'assigned provider key'],
    [/Bearer\s+[A-Za-z0-9._\-]{20,}/, 'bearer token'],
    [/op:\/\/[^\s]+\/[^\s]+\/credential/i, '1Password secret reference to a credential'],
  ];
  for (const f of textFiles) {
    if (f === 'tests/security/b2a-boundary.test.ts') continue; // contains the patterns themselves
    let text: string;
    try {
      text = readFileSync(path.join(root, f), 'utf8');
    } catch {
      continue;
    }
    for (const [re, label] of patterns) {
      const m = re.exec(text);
      assert.ok(!m, `${f}: ${label} (match starts with ${JSON.stringify(m?.[0]?.slice(0, 6))}…)`);
    }
  }
  assert.equal(files.filter((f) => /\.(mp4|webm)$/.test(f) || f.startsWith('.proofpilot/')).length, 0);
  // committed example scoreboards hold hashes and statuses, never provider output
  const board = JSON.parse(readFileSync(path.join(root, 'docs/examples/c3-b1-scoreboard.example.json'), 'utf8'));
  assert.equal(board.modelOrProviderCalls, 0);
});

test('existing C3-B1 VERIFIED semantics are untouched: one producer, three replays, exact inventory', () => {
  const text = src('packages/core/src/candidate-coordinator.ts');
  assert.equal((text.match(/status:\s*'VERIFIED'/g) ?? []).length, 1);
  assert.match(text, /export const REPLAYS_REQUIRED_FOR_VERIFIED = 3;/);
  assert.deepEqual(HAND_AUTHORED_CONTROLS.map((c) => c.id), ['NC-1', 'NC-1b', 'NC-3', 'NC-6', 'NC-7', 'PC-1']);
});
