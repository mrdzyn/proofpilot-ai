// C3-LIVE-01B0 boundary: the proposal orchestration is synthetic-only and unreachable from the disabled production entry point.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { APPROVED_LIVE_QUOTA, authorizeProductionAttempt, proposeCandidate, ProposalError, buildProposalRequest, META_PROPOSAL_MODEL, trustedFactsFromBaseline } from '../../packages/inference/src/index.ts';
import { parseSymptom } from '../../packages/core/src/index.ts';
import { validSymptom } from '../helpers.ts';

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
const ORCH = 'packages/inference/src/proposal-orchestrator.ts';
const prod = () => walk(path.join(root, 'packages')).concat(walk(path.join(root, 'scripts')));

const realFetch = globalThis.fetch;
let trapped = 0;
before(() => {
  globalThis.fetch = (() => {
    trapped++;
    throw new Error('no network');
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
  assert.equal(trapped, 0);
});

test('the kill switch is intact: quota 0, empty register, empty pin, proposeCandidate rejects before touching its argument whatever the environment says', async () => {
  assert.deepEqual({ ...APPROVED_LIVE_QUOTA }, { meta: 0, baseten: 0 });
  assert.equal(Object.isFrozen(APPROVED_LIVE_QUOTA), true);
  assert.deepEqual(JSON.parse(read('config/live-authorization.json')).decisions, []);
  assert.equal(JSON.parse(read('config/live-activation.json')).activation, null);
  let touched = 0;
  const trap = new Proxy({}, { get() { touched++; throw new Error('argument was read'); }, has() { touched++; return false; }, ownKeys() { touched++; return []; }, getOwnPropertyDescriptor() { touched++; return undefined; } });
  const saved = { ...process.env };
  Object.assign(process.env, { PROOFPILOT_ALLOW_BILLABLE_CALLS: '1', PROOFPILOT_ALLOW_LIVE_PROPOSALS: '1', PROOFPILOT_LIVE_QUOTA: '5', MODEL_API_KEY: 'pp-env-flag-should-not-matter-0001', META_LIVE_QUOTA: '5' });
  try {
    for (const arg of [trap, undefined, { quota: 5, provider: 'forged', approved: true }]) {
      await assert.rejects(proposeCandidate(arg as never), (e: unknown) => e instanceof ProposalError && e.code === 'LIVE_NOT_APPROVED');
    }
    assert.equal(touched, 0, 'the entry point never touched its argument');
    const request = buildProposalRequest({ symptom: parseSymptom(validSymptom(), { videoDurationSec: 10 }), facts: trustedFactsFromBaseline({ viewport: { width: 390, height: 844 }, tapPoint: { x: 1, y: 1 }, hitTestTarget: 'promo-overlay', cartCountBefore: '0', cartCountAfter: '0' }, true) });
    await assert.rejects(authorizeProductionAttempt({ runId: 'run-1', request, provider: { id: 'meta', models: { visual: META_PROPOSAL_MODEL } }, maxOutputTokens: 3072 }), (e: unknown) => (e as { code?: string }).code === 'LIVE_NOT_APPROVED');
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
  const fn = code('packages/inference/src/patch-proposal.ts');
  assert.match(fn.slice(fn.indexOf('export async function proposeCandidate')), /^export async function proposeCandidate\(_input\?: unknown\): Promise<never> \{\n  throw new ProposalError\('LIVE_NOT_APPROVED'/);
});

test('the orchestrator has no provider, network, environment, credential, spawn or execution capability', () => {
  const text = code(ORCH);
  assert.doesNotMatch(text, /\bfetch\b|createProvider|\.structuredResponse|generateText|process\.env|process\.argv|child_process|\bspawn\b|execFile|playwright|\beval\(|new Function|readFile|MODEL_API_KEY|BASETEN_API_KEY|apiKey|Authorization/);
  assert.doesNotMatch(text, /candidate-stage|candidate-coordinator|runCandidate|runOfflineVerification|acceptedAdjustments|proposeCandidate/);
  assert.doesNotMatch(text, /['"`]VERIFIED['"`]/);
  assert.doesNotMatch(text, /retry|retries|fallback|setTimeout|while \(/i, 'no retry loop or fallback in the orchestrator');
  // exactly one call site for the transport
  assert.equal((text.match(/\.call\(/g) ?? []).length, 2, 'one definition-site wrapper (a.transport.call) and the single tail invocation (t.call)');
  assert.equal((text.match(/await t\.call\(/g) ?? []).length, 1);
});

test('the orchestrator is isolated: synthetic-only runner, data-only transport, module-private tail, and no production runner exists yet', () => {
  const text = code(ORCH);
  assert.match(text, /if \(a\.ctx\?\.kind !== 'synthetic'\) throw new ProposalError\('LIVE_NOT_APPROVED'/);
  assert.match(text, /!SCRIPTED\.has\(a\.transport\)\) throw new ProposalError\('LIVE_NOT_APPROVED'/);
  assert.match(text, /^async function finishAttempt/m, 'the tail is not exported');
  assert.deepEqual([...text.matchAll(/^export (?:async )?(?:function|class|const|type) (\w+)/gm)].map((m) => m[1]).sort(), ['AttemptOutcome', 'CrashSignal', 'ProviderDescriptor', 'ScriptedOutcome', 'ScriptedTransport', 'SyntheticAttempt', 'SyntheticStep', 'runSyntheticProposalAttempt', 'scriptedTransport']);
  // the scripted transport is data only: it never receives a function from the caller
  assert.match(text, /export function scriptedTransport\(outcomes: ScriptedOutcome\[\]\)/);
  // no production module wires the production gate to a model call in this milestone
  for (const f of prod()) {
    const c = code(rel(f));
    assert.ok(!(/prepareProductionAttempt/.test(c) && /structuredResponse/.test(c)), `${rel(f)} must not combine the production gate with a model call before the approved activation PR`);
  }
  assert.doesNotMatch(code('packages/inference/src/live-gate.ts'), /proposal-orchestrator|finishAttempt|persistProposalArtifact|processProposalResponse/);
});

test('nothing outside the synthetic rehearsal imports the orchestrator; the index and the disabled entry point do not reach it; proposals never reach staging', () => {
  const importers = prod().filter((f) => /from '[^']*\/proposal-orchestrator\.ts'/.test(readFileSync(f, 'utf8'))).map(rel).sort();
  assert.deepEqual(importers, ['packages/inference/src/live-rehearsal.ts']);
  assert.doesNotMatch(code('packages/inference/src/index.ts'), /proposal-orchestrator|scriptedTransport|runSyntheticProposalAttempt/);
  assert.doesNotMatch(code('packages/inference/src/patch-proposal.ts'), /proposal-orchestrator|live-gate|prepareProductionAttempt|runSyntheticProposalAttempt/);
  for (const f of ['packages/core/src/candidate-stage.ts', 'packages/core/src/candidate-coordinator.ts']) assert.doesNotMatch(code(f), /proposal-orchestrator|inference\/src|PROPOSAL_ACCEPTED|ProposalArtifact/, f);
  assert.doesNotMatch(code('scripts/c3-live-rehearsal.ts'), /process\.env|fetch|createProvider/);
  // scripts reach the rehearsal only through the index
  for (const f of prod().filter((f) => rel(f).startsWith('scripts/'))) assert.doesNotMatch(readFileSync(f, 'utf8'), /proposal-orchestrator/, rel(f));
});

test('documentation no longer mentions the removed authorizeLiveAttempt, and no approval, quota or decision is recorded anywhere', () => {
  for (const d of ['docs/SECURITY.md', 'docs/TESTING.md', 'docs/META-ACTIVATION-CHECKLIST.md', 'tasks/PP-META-I2-C3-LIVE-01B0.md']) assert.doesNotMatch(read(d), /authorizeLiveAttempt/, d);
  assert.match(read('docs/LIVE-C3-01-DECISION-RECORD.md'), /\| LIVE-C3-01 \(Meta, `muse-spark-1\.3`\) \| _none recorded_ \| _none_ \|/);
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n');
  assert.deepEqual(tracked.filter((f) => /(^|\/)\.proofpilot\/|\.consumed$|(^|\/)approvals\//.test(f)), []);
});
