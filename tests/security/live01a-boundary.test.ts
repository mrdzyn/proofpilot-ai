// C3-LIVE-01A boundary: the approval workflow enables nothing live. Static and behavioural checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { APPROVED_LIVE_QUOTA, proposeCandidate, ProposalError } from '../../packages/inference/src/index.ts';

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
const APPROVAL_FILES = ['packages/inference/src/live-approval.ts', 'packages/inference/src/live-gate-core.ts', 'packages/inference/src/live-gate.ts', 'packages/inference/src/approval-cli.ts', 'packages/inference/src/live-rehearsal.ts'];

test('nothing is approved: empty register, quota 0, disabled entry point, LIVE-C3-01 NOT APPROVED in every document', async () => {
  const reg = JSON.parse(read('config/live-authorization.json'));
  assert.deepEqual(reg.decisions, []);
  assert.deepEqual({ ...APPROVED_LIVE_QUOTA }, { meta: 0, baseten: 0 });
  await assert.rejects(proposeCandidate({ provider: 'forged', quota: 5 }), (e: unknown) => e instanceof ProposalError && e.code === 'LIVE_NOT_APPROVED');
  const record = read('docs/LIVE-C3-01-DECISION-RECORD.md');
  assert.match(record, /NOT APPROVED/);
  assert.match(record, /\| LIVE-C3-01 \(Meta, `muse-spark-1\.3`\) \| _none recorded_ \| _none_ \|/);
  assert.doesNotMatch(read('docs/STATUS.md'), /LIVE-C3-01[^\n]*\bAPPROVED\b(?<!NOT APPROVED)[^\n]*quota [1-9]/);
});

test('the approval modules cannot reach a provider, the environment, credentials or an execution path', () => {
  for (const f of APPROVAL_FILES) {
    const text = code(f);
    assert.doesNotMatch(text, /\bfetch\b|createProvider|\.structuredResponse|generateText|process\.env|child_process|\bspawn\b|execFile|playwright|\beval\(|new Function/, f);
    assert.doesNotMatch(text, /candidate-stage|candidate-coordinator|runCandidate|runOfflineVerification|acceptedAdjustments|proposeCandidate|MODEL_API_KEY|BASETEN_API_KEY|apiKey/, f);
    assert.doesNotMatch(text, /['"`]VERIFIED['"`]/, f);
    assert.doesNotMatch(text, /readFile\([^)]*(\.env|credential|secret)/i, f);
  }
  assert.doesNotMatch(code('scripts/c3-approve-live-run.ts'), /process\.env|fetch|createProvider/);
  assert.doesNotMatch(code('scripts/c3-live-rehearsal.ts'), /process\.env|fetch|createProvider|MODEL_API_KEY/);
  // only the git probe spawns anything, and only git
  assert.match(code('packages/inference/src/git-probe.ts'), /run\('git'/);
});

test('the staging runner and the coordinator never import the approval modules (model proposals stay disconnected)', () => {
  for (const f of ['packages/core/src/candidate-stage.ts', 'packages/core/src/candidate-coordinator.ts', 'packages/core/src/patch-proposal.ts']) {
    assert.doesNotMatch(code(f), /live-approval|live-gate|approval-cli|live-rehearsal|inference\/src/, f);
  }
  assert.deepEqual(walk(path.join(root, 'packages/core')).filter((f) => /inference\//.test(readFileSync(f, 'utf8'))).map(rel), []);
});

test('MAJOR-1: the injectable core is unreachable from production code: only the production gate, the CLI logic and the synthetic rehearsal import it, and the index never exports it', () => {
  const all = walk(path.join(root, 'packages')).concat(walk(path.join(root, 'scripts')));
  const importing = (name: string) => all.filter((f) => new RegExp(`from '[^']*\\/${name}\\.ts'`).test(readFileSync(f, 'utf8'))).map(rel).sort();
  // the synthetic proposal orchestrator (C3-LIVE-01B0) runs the core against a synthetic context only; it refuses production contexts at runtime
  assert.deepEqual(importing('live-gate-core'), ['packages/inference/src/approval-cli.ts', 'packages/inference/src/live-gate.ts', 'packages/inference/src/live-rehearsal.ts', 'packages/inference/src/proposal-orchestrator.ts']);
  assert.deepEqual(importing('approval-cli'), ['packages/inference/src/index.ts', 'packages/inference/src/live-gate.ts', 'packages/inference/src/live-rehearsal.ts']);
  assert.deepEqual(importing('live-gate'), ['packages/inference/src/index.ts', 'packages/inference/src/live-rehearsal.ts']);
  // the package index exports no injectable or low-level symbol
  const index = code('packages/inference/src/index.ts');
  assert.doesNotMatch(index, /live-gate-core|createSyntheticContext|createInstallContext|evaluateAuthorizationCore|prepareAttemptCore|runApprovalCli|consumeApproval|writeApprovalRecord|buildApprovalRecord|parseDecisionRegister|parseActivationPin|loadDecisionRegister/);
  assert.match(index, /authorizeProductionAttempt, prepareProductionAttempt, runProductionApprovalCli/);
  // scripts reach the approval code only through the package index
  for (const f of all.filter((f) => rel(f).startsWith('scripts/'))) assert.doesNotMatch(readFileSync(f, 'utf8'), /live-gate-core|live-approval\.ts|approval-cli|createSyntheticContext/, rel(f));
  // synthetic contexts exist only in the core and the rehearsal; nothing else mentions them
  assert.deepEqual(all.filter((f) => /createSyntheticContext/.test(code(rel(f)))).map(rel).sort(), ['packages/inference/src/live-gate-core.ts', 'packages/inference/src/live-rehearsal.ts']);
});

test('MAJOR-1: the production gate derives every trusted input internally and accepts only facts about the attempt', () => {
  const gate = code('packages/inference/src/live-gate.ts');
  assert.match(gate, /const INSTALL_ROOT = path\.resolve\(import\.meta\.dirname, '\.\.\/\.\.\/\.\.'\)/);
  assert.match(gate, /createInstallContext\(INSTALL_ROOT, APPROVED_LIVE_QUOTA\.meta\)/);
  assert.equal((gate.match(/createInstallContext\(/g) ?? []).length, 1, 'one derivation point');
  assert.doesNotMatch(gate, /createSyntheticContext|repoRoot|allowSynthetic|liveQuota|git:|register:|approvalsDir|reservationsRoot|process\.cwd|process\.argv|process\.env/);
  assert.match(gate, /export type ProductionAttempt = \{ runId: string; request: BuiltProposalRequest; provider: Pick<InferenceProvider, 'id' \| 'models'>; maxOutputTokens: number \};/, 'the argument type carries no trust parameter');
  assert.match(gate, /const attemptOf = \(a: ProductionAttempt\): ProductionAttempt => \(\{ runId: a\?\.runId, request: a\?\.request, provider: a\?\.provider, maxOutputTokens: a\?\.maxOutputTokens \}\);/, 'only the four attempt facts are forwarded: no caller clock, store or context');
  assert.doesNotMatch(gate, /\bnow\b/, 'the caller cannot supply a clock');
  assert.match(gate, /a\.synthetic/);
  assert.match(gate, /p\.authorized\.synthetic/);
  // no old injectable entry points remain anywhere
  for (const f of walk(path.join(root, 'packages')).concat(walk(path.join(root, 'scripts')))) assert.doesNotMatch(code(rel(f)), /authorizeLiveAttempt|\bevaluateAuthorization\(|\bprepareAttempt\(|allowSynthetic/, rel(f));
  // the core derives the Git probe, register, pin and directories from one root; no trust-bearing parameter besides that root and the quota
  const core = code('packages/inference/src/live-gate-core.ts');
  assert.match(core, /export async function createInstallContext\(installRoot: string, liveQuota: number\)/);
  assert.match(core, /git: createGitProbe\(installRoot\)/);
  assert.doesNotMatch(core, /process\.env|process\.cwd/);
});

test('MAJOR-2: authorization requires the owner-pinned activation revision, checked before any approval is read, and both owner files are empty', () => {
  const core = code('packages/inference/src/live-gate-core.ts');
  assert.ok(core.indexOf('checkActivation(ctx, decision)') > 0 && core.indexOf('checkActivation(ctx, decision)') < core.indexOf('readApprovalRecord('), 'the revision check precedes reading an approval');
  assert.match(core, /REVISION_NOT_APPROVED/);
  assert.match(core, /ctx\.git\.pinOnlyDescent\(act\.activationCommit, ACTIVATION_PIN_PATH\)/, 'the revision relationship, not only the tree digest, is enforced');
  assert.match(core, /if \(!descent\.ok\) return fail\('REVISION_NOT_APPROVED'/);
  const probe = code('packages/inference/src/git-probe.ts');
  for (const needle of ["'merge-base', '--is-ancestor'", "'rev-list', '--merges'", "'diff-tree'", 'commits.length === 0', 'MAX_PIN_CHAIN']) assert.ok(probe.includes(needle), needle);
  assert.match(code('packages/inference/src/approval-cli.ts'), /checkActivation\(ctx, decision\)/);
  assert.match(code('packages/inference/src/approval-cli.ts'), /QUOTA_ZERO/);
  assert.equal(JSON.parse(read('config/live-activation.json')).activation, null);
  assert.deepEqual(JSON.parse(read('config/live-authorization.json')).decisions, []);
});

test('approval records are gitignored and no approval, marker, credential or raw model output is tracked', () => {
  execFileSync('git', ['check-ignore', '-q', '.proofpilot/approvals/x.json'], { cwd: root });
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n');
  assert.deepEqual(tracked.filter((f) => /(^|\/)\.proofpilot\/|\.consumed$|(^|\/)approvals\//.test(f)), []);
});

test('the validator keeps its fail-closed order: approval spend before the claim, re-check after, no release anywhere', () => {
  const text = code('packages/inference/src/live-approval.ts');
  const core = code('packages/inference/src/live-gate-core.ts');
  const prep = core.slice(core.indexOf('export async function prepareAttemptCore'));
  const order = ['evaluateAuthorizationCore(ctx, input)', 'consumeApproval(', 'afterConsume: true', 'ctx.store.claim('].map((n) => prep.indexOf(n));
  assert.ok(order.every((i) => i >= 0) && [...order].sort((a, b) => a - b).join() === order.join(), `unexpected order ${order}`);
  assert.doesNotMatch(text, /\bunlink\([^)]*consumed|rm\([^)]*consumed|rename\([^)]*consumed/, 'a consumption marker is never removed or replaced');
  assert.match(text, /O_NOFOLLOW/);
  assert.match(text, /'wx'/);
  assert.match(text, /await link\(/);
});
