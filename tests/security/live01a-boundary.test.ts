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
const APPROVAL_FILES = ['packages/inference/src/live-approval.ts', 'packages/inference/src/approval-cli.ts', 'packages/inference/src/live-rehearsal.ts'];

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
  assert.match(code('packages/inference/src/git-probe.ts'), /execFile\)?\('git'|run\('git'/);
});

test('the staging runner and the coordinator never import the approval modules (model proposals stay disconnected)', () => {
  for (const f of ['packages/core/src/candidate-stage.ts', 'packages/core/src/candidate-coordinator.ts', 'packages/core/src/patch-proposal.ts']) {
    assert.doesNotMatch(code(f), /live-approval|approval-cli|live-rehearsal|inference\/src/, f);
  }
  const importers = walk(path.join(root, 'packages')).concat(walk(path.join(root, 'scripts'))).filter((f) => /from '[^']*\/(live-approval|live-rehearsal|approval-cli)\.ts'/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(importers.map(rel).sort(), ['packages/inference/src/approval-cli.ts', 'packages/inference/src/git-probe.ts', 'packages/inference/src/index.ts', 'packages/inference/src/live-rehearsal.ts']);
  // scripts reach them only through the inference package index; nothing under packages/core does
  assert.deepEqual(walk(path.join(root, 'packages/core')).filter((f) => /inference\//.test(readFileSync(f, 'utf8'))).map(rel), []);
});

test('test-only injection cannot be reached from production: synthetic decisions and quotas exist only in the rehearsal and the CLI test seam', () => {
  const users = walk(path.join(root, 'packages')).concat(walk(path.join(root, 'scripts'))).filter((f) => /evaluateAuthorization|prepareAttempt|allowSynthetic/.test(code(rel(f))));
  assert.deepEqual(users.map(rel).sort(), ['packages/inference/src/live-approval.ts', 'packages/inference/src/live-rehearsal.ts']);
  const live = code('packages/inference/src/live-approval.ts');
  assert.match(live, /liveQuota: APPROVED_LIVE_QUOTA\.meta, allowSynthetic: false/, 'the production wrapper fixes the quota and forbids synthetic decisions');
  const rehearsal = code('packages/inference/src/live-rehearsal.ts');
  assert.match(rehearsal, /liveQuota: 1, allowSynthetic: true/);
  assert.match(rehearsal, /mkdtemp\(path\.join\(os\.tmpdir\(\)/, 'the synthetic quota only ever applies to a disposable directory');
  // the CLI never accepts a synthetic decision unless its caller says so, and the real script never does
  assert.doesNotMatch(code('scripts/c3-approve-live-run.ts'), /synthetic/);
  // no production call site wires the approval into a provider call
  assert.doesNotMatch(code('packages/inference/src/patch-proposal.ts'), /live-approval|prepareAttempt|authorizeLiveAttempt/);
});

test('approval records are gitignored and no approval, marker, credential or raw model output is tracked', () => {
  execFileSync('git', ['check-ignore', '-q', '.proofpilot/approvals/x.json'], { cwd: root });
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n');
  assert.deepEqual(tracked.filter((f) => /(^|\/)\.proofpilot\/|\.consumed$|(^|\/)approvals\//.test(f)), []);
});

test('the validator keeps its fail-closed order: approval spend before the claim, re-check after, no release anywhere', () => {
  const text = code('packages/inference/src/live-approval.ts');
  const prep = text.slice(text.indexOf('export async function prepareAttempt'), text.indexOf('export async function listStrandedApprovals'));
  const order = ['evaluateAuthorization(input, injected)', 'consumeApproval(', 'afterConsume: true', 'store.claim('].map((n) => prep.indexOf(n));
  assert.ok(order.every((i) => i >= 0) && [...order].sort((a, b) => a - b).join() === order.join(), `unexpected order ${order}`);
  assert.doesNotMatch(text, /\bunlink\([^)]*consumed|rm\([^)]*consumed|rename\([^)]*consumed/, 'a consumption marker is never removed or replaced');
  assert.match(text, /O_NOFOLLOW/);
  assert.match(text, /'wx'/);
  assert.match(text, /await link\(/);
});
