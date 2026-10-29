// C3-LIVE-01B0 boundary: the proposal orchestration is synthetic-only and unreachable from the disabled production entry point.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { APPROVED_LIVE_QUOTA, authorizeProductionAttempt, proposeCandidate, ProposalError, buildProposalRequest, META_PROPOSAL_MODEL, trustedFactsFromBaseline } from '../../packages/inference/src/index.ts';
import { parseSymptom } from '../../packages/core/src/index.ts';
import { validSymptom } from '../helpers.ts';

import { expectedGateCode, readPinState } from '../support/real-gate.ts';
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

test('positive quota and the registered owner decision authorize nothing without every gate: the real checkout refuses with the exact code of its pin state, and the entry point reads only runId and request', async () => {
  assert.deepEqual({ ...APPROVED_LIVE_QUOTA }, { meta: 1, baseten: 0 });
  assert.equal(Object.isFrozen(APPROVED_LIVE_QUOTA), true);
  assert.equal(JSON.parse(read('config/live-authorization.json')).decisions.length, 1);
  readPinState(root);
  const reads: string[] = [];
  const spy = new Proxy({}, { get(_t, k) { reads.push(String(k)); return undefined; }, has() { reads.push('has'); return false; }, ownKeys() { reads.push('ownKeys'); return []; }, getOwnPropertyDescriptor() { reads.push('gopd'); return undefined; } });
  const saved = { ...process.env };
  Object.assign(process.env, { PROOFPILOT_ALLOW_BILLABLE_CALLS: '1', PROOFPILOT_ALLOW_LIVE_PROPOSALS: '1', PROOFPILOT_LIVE_QUOTA: '5', MODEL_API_KEY: 'pp-env-flag-should-not-matter-0001', META_LIVE_QUOTA: '5' });
  try {
    for (const arg of [spy, undefined, { quota: 5, provider: 'forged', approved: true }]) {
      await assert.rejects(proposeCandidate(arg as never), (e: unknown) => e instanceof ProposalError && e.code === 'INVALID_INPUT');
    }
    assert.deepEqual([...new Set(reads)].sort(), ['request', 'runId'], 'the entry point reads exactly the two attempt facts');
    const request = buildProposalRequest({ symptom: parseSymptom(validSymptom(), { videoDurationSec: 10 }), facts: trustedFactsFromBaseline({ viewport: { width: 390, height: 844 }, tapPoint: { x: 1, y: 1 }, hitTestTarget: 'promo-overlay', cartCountBefore: '0', cartCountAfter: '0' }, true) });
    // a perfectly formed call, with every credential-free flag on, is stopped by the gate (no pin, or no operator approval) before anything else
    const gateCode = await expectedGateCode(root);
    await assert.rejects(proposeCandidate({ runId: 'c3-live-meta-001', request }), (e: unknown) => (e as { code?: string }).code === gateCode);
    await assert.rejects(authorizeProductionAttempt({ runId: 'c3-live-meta-001', request, provider: { id: 'meta', models: { visual: META_PROPOSAL_MODEL } }, maxOutputTokens: 3072 }), (e: unknown) => (e as { code?: string }).code === gateCode);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
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

test('the orchestrator is isolated: synthetic-only runner, data-only transport, module-private tail; the only production runner is the dormant one', () => {
  const text = code(ORCH);
  assert.match(text, /if \(a\.ctx\?\.kind !== 'synthetic'\) throw new ProposalError\('LIVE_NOT_APPROVED'/);
  assert.match(text, /!SCRIPTED\.has\(a\.transport\)\) throw new ProposalError\('LIVE_NOT_APPROVED'/);
  assert.match(text, /^async function finishAttempt/m, 'the tail is not exported');
  assert.deepEqual([...text.matchAll(/^export (?:async )?(?:function|class|const|type) (\w+)/gm)].map((m) => m[1]).sort(), ['AttemptOutcome', 'CrashSignal', 'ProductionProposalAttempt', 'ProviderDescriptor', 'ScriptedOutcome', 'ScriptedTransport', 'SyntheticAttempt', 'SyntheticStep', 'runProductionProposalAttempt', 'runSyntheticProposalAttempt', 'scriptedTransport']);
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
  // the production entry point reaches the orchestrator through ONE lazy import and nothing else (it never names the synthetic runner or the gate)
  const entryPoint = code('packages/inference/src/patch-proposal.ts');
  assert.equal((entryPoint.match(/proposal-orchestrator/g) ?? []).length, 1);
  assert.match(entryPoint, /await import\('\.\/proposal-orchestrator\.ts'\)/);
  assert.doesNotMatch(entryPoint, /live-gate|prepareProductionAttempt|runSyntheticProposalAttempt|scriptedTransport/);
  for (const f of ['packages/core/src/candidate-stage.ts', 'packages/core/src/candidate-coordinator.ts']) assert.doesNotMatch(code(f), /proposal-orchestrator|inference\/src|PROPOSAL_ACCEPTED|ProposalArtifact/, f);
  assert.doesNotMatch(code('scripts/c3-live-rehearsal.ts'), /process\.env|fetch|createProvider/);
  // scripts reach the rehearsal only through the index
  for (const f of prod().filter((f) => rel(f).startsWith('scripts/'))) assert.doesNotMatch(readFileSync(f, 'utf8'), /proposal-orchestrator/, rel(f));
});

test('documentation no longer mentions the removed authorizeLiveAttempt, and no operator approval or activation pin is recorded anywhere', () => {
  for (const d of ['docs/SECURITY.md', 'docs/TESTING.md', 'docs/META-ACTIVATION-CHECKLIST.md', 'tasks/PP-META-I2-C3-LIVE-01B0.md']) assert.doesNotMatch(read(d), /authorizeLiveAttempt/, d);
  assert.match(read('docs/LIVE-C3-01-DECISION-RECORD.md'), /Activation revision pin[^\n]*config\/live-activation\.json[^\n]*pin-only/);
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n');
  assert.deepEqual(tracked.filter((f) => /(^|\/)\.proofpilot\/|\.consumed$|(^|\/)approvals\//.test(f)), []);
});

test('nested provider metadata is rebuilt by explicit allow-lists: processProposalResponse never copies res.usage or res.lifecycle', () => {
  const src = code('packages/inference/src/patch-proposal.ts');
  assert.match(src, /usage: sanitizeUsage\(res\.usage\)/);
  assert.match(src, /sanitizeLifecycle\(res\.lifecycle\)/);
  assert.doesNotMatch(src, /usage: res\.usage|lifecycle: res\.lifecycle|\.\.\.(r|res|u|l)\b[,\s]/);
  assert.doesNotMatch(code(ORCH), /Object\.assign\(artifact, res\b|usage: res|lifecycle: res/);
});
