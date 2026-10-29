// C3-LIVE-01B-PREP static boundary: the production proposal runner exists but is DORMANT, sealed behind the production gate, and the
// activation locks are untouched. (Runtime behaviour: tests/unit/proposal-production.test.ts and live01b-prep-install-copy.test.ts.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { APPROVED_LIVE_QUOTA } from '../../packages/inference/src/index.ts';

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
const ORCH = 'packages/inference/src/proposal-orchestrator.ts';
const TRANSPORT = 'packages/inference/src/meta-proposal-transport.ts';
const exportsOf = (text: string) => [...text.matchAll(/^export (?:async )?(?:function|class|const|type) (\w+)/gm)].map((m) => m[1]).sort();
const body = (text: string, start: string, end: string) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start) + 1));

test('every activation lock is unchanged: quota 0, empty register, empty pin, proposeCandidate unconditionally rejects, no approval or CLI', () => {
  assert.deepEqual({ ...APPROVED_LIVE_QUOTA }, { meta: 0, baseten: 0 });
  assert.match(code('packages/inference/src/reservations.ts'), /APPROVED_LIVE_QUOTA[^=]*= Object\.freeze\(\{ meta: 0, baseten: 0 \}\)/);
  assert.deepEqual(JSON.parse(read('config/live-authorization.json')).decisions, []);
  assert.equal(JSON.parse(read('config/live-activation.json')).activation, null);
  const fn = code('packages/inference/src/patch-proposal.ts');
  assert.match(fn.slice(fn.indexOf('export async function proposeCandidate')), /^export async function proposeCandidate\(_input\?: unknown\): Promise<never> \{\n  throw new ProposalError\('LIVE_NOT_APPROVED'/);
  // there is no executable live CLI: the only scripts that touch this area are the existing zero-network or interactive-approval ones
  const scripts = readdirSync(path.join(root, 'scripts')).filter((f) => /^c3-/.test(f)).sort();
  assert.deepEqual(scripts, ['c3-activation-digest.ts', 'c3-approve-live-run.ts', 'c3-live-rehearsal.ts', 'c3-offline-verification.ts', 'c3-proposal-preflight.ts', 'c3-stage-spike.ts']);
  for (const f of walk(path.join(root, 'scripts'))) assert.doesNotMatch(readFileSync(f, 'utf8'), /runProductionProposalAttempt|meta-proposal-transport|openMetaProposalCall/, rel(f));
});

test('the production runner is dormant: nothing but its definition mentions it, and the index, the disabled entry point and the CLIs cannot reach it', () => {
  const mentions = prod().filter((f) => /runProductionProposalAttempt/.test(readFileSync(f, 'utf8'))).map(rel);
  assert.deepEqual(mentions, [ORCH]);
  const index = code('packages/inference/src/index.ts');
  assert.doesNotMatch(index, /proposal-orchestrator|meta-proposal-transport|runProductionProposalAttempt|productionEvidenceRoot|settleProductionAttempt|openMetaProposalCall/);
  assert.doesNotMatch(code('packages/inference/src/patch-proposal.ts'), /proposal-orchestrator|meta-proposal-transport|live-gate|runProductionProposalAttempt/);
  assert.doesNotMatch(code('packages/inference/src/approval-cli.ts'), /proposal-orchestrator|meta-proposal-transport|runProductionProposalAttempt/);
  for (const f of ['packages/core/src/candidate-stage.ts', 'packages/core/src/candidate-coordinator.ts']) assert.doesNotMatch(code(f), /proposal-orchestrator|meta-proposal-transport|inference\/src/, f);
});

test('the production runner takes only a run id and the bounded request, and derives every trusted input inside the production gate', () => {
  const text = code(ORCH);
  assert.match(text, /export type ProductionProposalAttempt = \{ runId: string; request: BuiltProposalRequest \};/);
  assert.match(text, /export async function runProductionProposalAttempt\(attempt: ProductionProposalAttempt\): Promise<AttemptOutcome> \{/);
  const fn = body(text, 'export async function runProductionProposalAttempt', '// ------------------------------------------------------------------ the shared tail');
  // the production gate, never the injectable core, the synthetic context or a scripted transport
  assert.doesNotMatch(fn, /prepareAttemptCore|createSyntheticContext|createInstallContext|live-gate-core|scriptedTransport|SCRIPTED|a\.ctx|attempt\.(ctx|store|provider|transport|call|git|now|evidenceRoot|consent)/);
  assert.doesNotMatch(fn, /process\.env|apiKey|MODEL_API_KEY|fetch|createProvider|\.structuredResponse|readFile|child_process/);
  // the only things read from the argument are the two attempt facts
  assert.deepEqual([...fn.matchAll(/\battempt\??\.(\w+)/g)].map((m) => m[1]).sort(), ['request', 'runId']);
  assert.deepEqual([...fn.matchAll(/\battempt\b/g)].length, 3, 'the argument is only ever read as attempt?.runId and attempt?.request (plus its declaration)');
  assert.doesNotMatch(fn, /\bas any\b|\(attempt as|\[['"`]/);
  // the order: credential-free pre-flight, read-only authorization, credential/provider, consume + claim, shared tail
  const order = ['readMetaProposalDescriptor()', 'preflightProposal(', 'await authorizeProductionAttempt(', 'openMetaProposalCall()', 'await prepareProductionAttempt(', 'return finishAttempt('].map((n) => fn.indexOf(n));
  assert.ok(order.every((i) => i >= 0) && [...order].sort((a, b) => a - b).join() === order.join(), `unexpected order ${order}`);
  // the synthetic runner is the only user of the injectable core, and refuses anything but synthetic trust
  const syn = body(text, 'export async function runSyntheticProposalAttempt', '// ------------------------------------------------------------------ the production runner');
  assert.match(syn, /a\.ctx\?\.kind !== 'synthetic'/);
  assert.match(syn, /prepareAttemptCore\(/);
  assert.equal((text.match(/prepareAttemptCore\(/g) ?? []).length, 1, 'prepareAttemptCore appears once, in the synthetic runner');
  // one shared post-claim tail, module-private, with exactly two callers
  assert.equal((text.match(/^async function finishAttempt/gm) ?? []).length, 1);
  assert.equal((text.match(/finishAttempt\(\{/g) ?? []).length, 2);
  assert.doesNotMatch(text, /export (async )?function finishAttempt/);
  assert.equal((text.match(/await t\.call\(/g) ?? []).length, 1, 'exactly one provider invocation in the whole file');
});

test('the Meta transport is zero-argument, retry-free, imported only by the production runner and is the only production call site of structuredResponse', () => {
  const text = code(TRANSPORT);
  assert.deepEqual(exportsOf(text), ['openMetaProposalCall', 'readMetaProposalDescriptor']);
  assert.match(text, /export function readMetaProposalDescriptor\(\)/);
  assert.match(text, /export function openMetaProposalCall\(\)/);
  assert.match(text, /loadProviderConfig\('meta', process\.env, \{ readApiKey: false \}\)/);
  assert.match(text, /createProvider\(\{ \.\.\.config, maxRetries: 0 \}\)/);
  assert.match(text, /config\.models\.visual !== META_PROPOSAL_MODEL/);
  assert.doesNotMatch(text, /fetch|baseten|retry\(|setTimeout|while \(|prepareProductionAttempt|authorizeProductionAttempt|live-gate|readFile|child_process/i);
  const importers = prod().filter((f) => /from '[^']*\/meta-proposal-transport\.ts'/.test(readFileSync(f, 'utf8'))).map(rel);
  assert.deepEqual(importers, [ORCH]);
  assert.deepEqual(prod().filter((f) => /\.structuredResponse\(/.test(readFileSync(f, 'utf8'))).map(rel), [TRANSPORT]);
  // the credential is reachable only from the transport (plus the pre-existing config/client/video/readiness code), never from the runner or the gate
  for (const f of [ORCH, 'packages/inference/src/live-gate.ts', 'packages/inference/src/live-gate-core.ts', 'packages/inference/src/live-approval.ts']) assert.doesNotMatch(code(f), /process\.env|MODEL_API_KEY|BASETEN_API_KEY|apiKey|(?<![A-Za-z])Authorization\b/, f);
});

test('the production gate gained only fixed-location helpers; nothing the caller passes can choose a root, store, probe, quota or clock', () => {
  const gate = code('packages/inference/src/live-gate.ts');
  assert.deepEqual(exportsOf(gate), ['ProductionAttempt', 'authorizeProductionAttempt', 'prepareProductionAttempt', 'productionEvidenceRoot', 'runProductionApprovalCli', 'settleProductionAttempt']);
  assert.match(gate, /export const productionEvidenceRoot = \(\): string => path\.join\(INSTALL_ROOT, '\.proofpilot', 'evidence'\);/);
  assert.match(gate, /export const settleProductionAttempt = \(prepared: PreparedAttempt, info: \{ status: string; reason: string \| null \}\)/);
  assert.match(gate, /createReservationStore\(path\.join\(INSTALL_ROOT, DEFAULT_RESERVATIONS_ROOT\)\)\.settle\(prepared\.claim, info\)/);
  assert.match(code('packages/inference/src/index.ts'), /export \{ authorizeProductionAttempt, prepareProductionAttempt, runProductionApprovalCli, type ProductionAttempt \} from '\.\/live-gate\.ts';/);
});

test('model output stays untrusted data: the new modules cannot stage, execute or verify a proposal, and persist only through the sanitizing tail', () => {
  for (const f of [ORCH, TRANSPORT]) {
    const text = code(f);
    assert.doesNotMatch(text, /candidate-stage|candidate-coordinator|runCandidate|runOfflineVerification|playwright|child_process|\bspawn\b|execFile|\beval\(|new Function|renderedCss.*(write|exec)/, f);
    assert.doesNotMatch(text, /['"`]VERIFIED['"`]/, f);
  }
  const text = code(ORCH);
  assert.match(text, /failureReason\(e\)/);
  assert.match(text, /processProposalResponse\(res, t\.model\)/);
  assert.match(text, /persistProposalArtifact\(artifact, t\.evidenceRoot\)/);
  assert.doesNotMatch(text, /e\.message|String\(e\)|JSON\.stringify\(e\)|\.stack/, 'no exception text is stored');
});
