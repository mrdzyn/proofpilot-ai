// C3-LIVE-01B-PREP: the REAL production code path, exercised end to end against a THROWAWAY COPY of this repository.
//
// The production gate derives its install root from where its own file lives, so the only way to run it without a
// dependency-injection backdoor is to give it a different install: a temp copy of `packages/` and `config/` in its own git repository,
// with a register entry, a pin and a quota of 1 that exist ONLY in that copy (they are test fixtures; the real repository's quota,
// register and pin are asserted untouched at the end). The Meta endpoint is a mock `fetch` installed in a child process; there is no
// network, no real credential (a made-up key string), no real approval and nothing here can authorize anything in the real checkout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseSymptom } from '../../packages/core/src/index.ts';
import { ACTIVATION_PIN_PATH, buildProposalRequest, createGitProbe, DECISION_ID, META_PROPOSAL_MODEL, trustedFactsFromBaseline } from '../../packages/inference/src/index.ts';
import { buildApprovalRecord, loadDecisionRegister, writeApprovalRecord } from '../../packages/inference/src/live-approval.ts';
import { tempDir, validSymptom } from '../helpers.ts';

const REAL_ROOT = path.resolve(import.meta.dirname, '../..');
const FAKE_KEY = 'pp-made-up-key-not-a-credential-0001';
const RAW = 'RAW-PROVIDER-TEXT-MARKER-77aa';
const PV1 = JSON.stringify({ adjustments: [{ selector: '.promo-overlay', property: 'pointer-events', value: 'none' }] });
const request = buildProposalRequest({ symptom: parseSymptom(validSymptom(), { videoDurationSec: 10 }), facts: trustedFactsFromBaseline({ viewport: { width: 390, height: 844 }, tapPoint: { x: 1, y: 1 }, hitTestTarget: 'promo-overlay', cartCountBefore: '0', cartCountAfter: '0' }, true) });

const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args], { encoding: 'utf8' }).trim();

type Install = { dir: string; root: string; A: string; Aprime: string; digest: string; approve: (runId: string, over?: Record<string, unknown>) => Promise<void> };

async function makeInstall(o: { quota?: number; registerOverride?: (d: Record<string, unknown>) => Record<string, unknown> } = {}): Promise<Install> {
  const dir = tempDir('pp-install-');
  const root = path.join(dir, 'install');
  mkdirSync(root);
  for (const d of ['packages', 'config']) cpSync(path.join(REAL_ROOT, d), path.join(root, d), { recursive: true, filter: (s) => !s.includes('node_modules') });
  cpSync(path.join(REAL_ROOT, '.gitignore'), path.join(root, '.gitignore'));
  // the quota constant exists only in this copy
  const res = path.join(root, 'packages/inference/src/reservations.ts');
  const text = readFileSync(res, 'utf8');
  assert.ok(text.includes('Object.freeze({ meta: 0, baseten: 0 })'));
  writeFileSync(res, text.replace('Object.freeze({ meta: 0, baseten: 0 })', `Object.freeze({ meta: ${o.quota ?? 1}, baseten: 0 })`));
  const decision = { decisionId: DECISION_ID, status: 'APPROVED', provider: 'meta', model: META_PROPOSAL_MODEL, maxBillableAttempts: 1, maxInputChars: 12000, maxOutputTokens: 3072, approvedBy: 'FIXTURE (temp copy only)', approvedAt: '2026-10-30T00:00:00.000Z', reference: 'fixture decision in a throwaway copy' };
  writeFileSync(path.join(root, 'config/live-authorization.json'), JSON.stringify({ schemaVersion: 1, decisions: [o.registerOverride ? o.registerOverride(decision) : decision] }, null, 2) + '\n');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'A');
  const A = git(root, 'rev-parse', 'HEAD');
  const digest = await createGitProbe(root).treeDigest(A, ACTIVATION_PIN_PATH);
  writeFileSync(path.join(root, ACTIVATION_PIN_PATH), JSON.stringify({ schemaVersion: 1, activation: { decisionId: DECISION_ID, decisionReference: 'fixture decision in a throwaway copy', activationCommit: A, activationDigest: digest, recordedBy: 'FIXTURE', recordedAt: '2026-10-30T00:00:00.000Z', reference: 'fixture pin' } }, null, 2) + '\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', "A'");
  const Aprime = git(root, 'rev-parse', 'HEAD');
  const approve = async (runId: string, over: Record<string, unknown> = {}) => {
    const register = await loadDecisionRegister(root);
    const rec = buildApprovalRecord({ runId, repoSha: Aprime, activation: { commit: A, digest }, inputSha256: request.inputSha256, inputChars: request.prompt.length, register, declaredBy: 'fixture-operator', now: new Date(), ...over } as never);
    await writeApprovalRecord(path.join(root, '.proofpilot/approvals'), rec);
  };
  return { dir, root, A, Aprime, digest, approve };
}

// the child installs a mock Meta endpoint and runs the real production runner of the copy
const CHILD = `
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [root, scenario, runId, requestFile, outFile] = process.argv.slice(2);
const events = [];
const marker = path.join(root, '.proofpilot/approvals', runId + '.consumed');
const runFile = path.join(root, '.proofpilot/reservations/meta/runs', runId + '.json');
const ok = (text, extra = {}) => new Response(JSON.stringify({ id: 'resp_fixture', model: 'muse-spark-1.3', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }], usage: { input_tokens: 1200, output_tokens: 300, total_tokens: 1500 }, ...extra }), { status: 200, headers: { 'content-type': 'application/json', 'x-request-id': 'req-fixture' } });
globalThis.fetch = async (url, init) => {
  events.push({ url: String(url), method: init?.method, consumedAtCall: existsSync(marker), runStatusAtCall: existsSync(runFile) ? JSON.parse(readFileSync(runFile, 'utf8')).status : null, body: JSON.parse(String(init.body)) });
  switch (scenario) {
    case 'ok': return ok(${JSON.stringify(PV1)});
    case 'http500': return new Response(JSON.stringify({ error: { message: ${JSON.stringify(RAW)} } }), { status: 500, headers: { 'content-type': 'application/json' } });
    case 'network': throw new TypeError(${JSON.stringify(RAW)});
    case 'timeout': throw Object.assign(new Error(${JSON.stringify(RAW)}), { name: 'TimeoutError' });
    case 'incomplete': return ok('', { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } });
    case 'wrongModel': return ok(${JSON.stringify(PV1)}, { model: 'other-model' });
    case 'malformed': return ok(${JSON.stringify(RAW)} + ' not json');
    case 'forbidden': return ok(JSON.stringify({ adjustments: [{ selector: '.promo-overlay', property: 'background', value: 'url(https://evil.example/x)' }] }));
    case 'settlefail': chmodSync(path.dirname(runFile), 0o500); return ok(${JSON.stringify(PV1)});
    case 'artfail': writeFileSync(path.join(root, '.proofpilot/evidence'), 'not a directory'); return ok(${JSON.stringify(PV1)});
    case 'nested': return ok(${JSON.stringify(PV1)}, { usage: { input_tokens: 5, output_tokens: 6, debug: ${JSON.stringify(RAW)} } });
    default: throw new Error('unknown scenario');
  }
};
const orch = await import(pathToFileURL(path.join(root, 'packages/inference/src/proposal-orchestrator.ts')).href);
const request = JSON.parse(readFileSync(requestFile, 'utf8'));
let result;
try {
  const forged = process.env.FORGE ? { evidenceRoot: path.join(root, '..', 'forged-evidence'), approvalsDir: path.join(root, '..', 'forged-approvals'), reservationsRoot: path.join(root, '..', 'forged-reservations'), liveQuota: 9, now: () => new Date(0), provider: { id: 'meta' }, call: () => { throw new Error('forged call invoked'); }, consent: { granted: true } } : {};
  const out = await orch.runProductionProposalAttempt({ ...forged, runId, request });
  result = { ok: true, status: out.status, reason: out.reason, label: out.label, synthetic: out.synthetic, settled: out.settled, artifactPath: out.artifactPath, adjustments: out.adjustments };
} catch (e) {
  result = { ok: false, name: e?.constructor?.name, code: e?.code ?? null };
}
writeFileSync(outFile, JSON.stringify({ result, events }));
`;

function runChild(inst: Install, scenario: string, runId: string, env: Record<string, string> = {}) {
  const requestFile = path.join(inst.dir, 'request.json');
  const outFile = path.join(inst.dir, `out-${runId}-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(requestFile, JSON.stringify(request));
  const script = path.join(inst.dir, 'child.ts');
  writeFileSync(script, CHILD);
  const r = spawnSync(process.execPath, [script, inst.root, scenario, runId, requestFile, outFile], {
    env: { PATH: process.env.PATH ?? '', HOME: inst.dir, MODEL_API_KEY: FAKE_KEY, PROOFPILOT_ALLOW_BILLABLE_CALLS: '1', ...env }, encoding: 'utf8', timeout: 60_000,
  });
  assert.equal(r.status, 0, `child failed: ${r.stderr.slice(0, 600)}`);
  const out = JSON.parse(readFileSync(outFile, 'utf8')) as { result: Record<string, any>; events: Array<Record<string, any>> };
  return { ...out, stdout: r.stdout + r.stderr };
}
const approvalsDir = (i: Install) => path.join(i.root, '.proofpilot/approvals');
const runFileOf = (i: Install, id: string) => path.join(i.root, '.proofpilot/reservations/meta/runs', `${id}.json`);
const markerOf = (i: Install, id: string) => path.join(approvalsDir(i), `${id}.consumed`);
const artifactOf = (i: Install, id: string) => path.join(i.root, '.proofpilot/evidence/proposals', id, 'proposal.json');
const state = (i: Install) => [existsSync(approvalsDir(i)) ? readdirSync(approvalsDir(i)).sort().join(',') : '', existsSync(path.join(i.root, '.proofpilot/reservations')) ? 'reservations' : null];

// ---------------------------------------------------------------- the successful path, in order

test('production runner, authorized fixture install: approval consumed, then reservation claimed, then exactly one Meta request, then sanitized artifact, then settlement, then STOP', async () => {
  const inst = await makeInstall();
  await inst.approve('c3-live-meta-001');
  const { result, events, stdout } = runChild(inst, 'ok', 'c3-live-meta-001');
  assert.equal(result.ok, true, stdout);
  assert.equal(result.status, 'PROPOSAL_ACCEPTED');
  assert.equal(result.label, 'UNTRUSTED PROPOSAL — NOT VERIFIED');
  assert.equal(result.synthetic, false);
  assert.equal(result.settled, true);
  // exactly one request, made AFTER the approval was consumed and the reservation claimed
  assert.equal(events.length, 1);
  const ev = events[0]!;
  assert.equal(ev.consumedAtCall, true, 'the approval was already consumed when the provider was invoked');
  assert.equal(ev.runStatusAtCall, 'CLAIMED', 'the reservation was already claimed when the provider was invoked');
  assert.equal(new URL(ev.url).host, 'api.meta.ai');
  assert.equal(ev.method, 'POST');
  // the request contract
  assert.equal(ev.body.model, 'muse-spark-1.3');
  assert.equal(ev.body.max_output_tokens, 3072);
  assert.deepEqual(ev.body.reasoning, { effort: 'low' });
  assert.equal(ev.body.text.format.type, 'json_schema');
  assert.equal(ev.body.text.format.strict, true);
  for (const k of ['tools', 'tool_choice', 'stream', 'previous_response_id']) assert.ok(!(k in ev.body), k);
  assert.ok(JSON.stringify(ev.body.input).length < 13_000);
  // evidence: settled, private, labelled, no raw text; the run is spent
  assert.equal(JSON.parse(readFileSync(runFileOf(inst, 'c3-live-meta-001'), 'utf8')).status, 'PROPOSAL_ACCEPTED');
  const art = JSON.parse(readFileSync(artifactOf(inst, 'c3-live-meta-001'), 'utf8'));
  assert.equal(art.label, 'UNTRUSTED PROPOSAL — NOT VERIFIED');
  assert.equal(art.provenance, 'model-hypothesis');
  assert.equal(art.requestedModel, 'muse-spark-1.3');
  assert.deepEqual(art.usage, { inputTokens: 1200, outputTokens: 300, totalTokens: 1500, reasoningTokens: null, videoFramesProcessed: null });
  assert.equal(statSync(artifactOf(inst, 'c3-live-meta-001')).mode & 0o777, 0o600);
  assert.ok(!readFileSync(artifactOf(inst, 'c3-live-meta-001'), 'utf8').includes(FAKE_KEY));
  // STOP: nothing was staged or verified, and no further attempt is possible
  assert.ok(!existsSync(path.join(inst.root, '.proofpilot/candidates')));
  const again = runChild(inst, 'ok', 'c3-live-meta-001');
  assert.equal(again.result.code, 'APPROVAL_SPENT');
  assert.equal(again.events.length, 0);
  await inst.approve('c3-live-meta-002');
  const next = runChild(inst, 'ok', 'c3-live-meta-002');
  assert.equal(next.result.code, 'QUOTA_EXHAUSTED', 'the single approved attempt is permanently spent');
  assert.equal(next.events.length, 0);
});

test('caller-supplied roots, stores, quota, clock, provider, call and consent are ignored by the real production runner: evidence and reservation land in the install\'s own fixed directories', async () => {
  const inst = await makeInstall();
  await inst.approve('c3-live-meta-forge');
  const out = runChild(inst, 'ok', 'c3-live-meta-forge', { FORGE: '1' });
  assert.equal(out.result.ok, true, out.stdout);
  assert.equal(out.result.status, 'PROPOSAL_ACCEPTED');
  assert.equal(out.events.length, 1);
  assert.ok(existsSync(artifactOf(inst, 'c3-live-meta-forge')));
  assert.ok(existsSync(runFileOf(inst, 'c3-live-meta-forge')));
  for (const d of ['forged-evidence', 'forged-approvals', 'forged-reservations']) assert.equal(existsSync(path.join(inst.dir, d)), false, d);
  const next = await (async () => { await inst.approve('c3-live-meta-forge-2'); return runChild(inst, 'ok', 'c3-live-meta-forge-2', { FORGE: '1' }); })();
  assert.equal(next.result.code, 'QUOTA_EXHAUSTED', 'a forged liveQuota of 9 does not raise the installed quota of 1');
});

// ---------------------------------------------------------------- every post-claim outcome leaves the attempt spent, with one request

const OUTCOMES: Array<[string, string, string | null]> = [
  ['http500', 'PROPOSAL_FAILED', 'PROVIDER_'],
  ['network', 'PROPOSAL_FAILED', 'PROVIDER_NETWORK'],
  ['timeout', 'PROPOSAL_FAILED', 'PROVIDER_TIMEOUT'],
  ['incomplete', 'PROPOSAL_FAILED', 'RESPONSE_NOT_COMPLETED'],
  ['wrongModel', 'PROPOSAL_FAILED', 'MODEL_MISMATCH'],
  ['malformed', 'PROPOSAL_REJECTED', null],
  ['forbidden', 'PROPOSAL_BLOCKED', null],
  ['nested', 'PROPOSAL_ACCEPTED', null],
];
for (const [scenario, status, reason] of OUTCOMES) {
  test(`production runner outcome ${scenario}: one request, ${status}, no retry, no raw text stored, the attempt stays spent`, async () => {
    const inst = await makeInstall();
    const id = `c3-live-meta-${scenario.toLowerCase()}`.slice(0, 40);
    await inst.approve(id);
    const out = runChild(inst, scenario, id, { PROOFPILOT_INFERENCE_MAX_RETRIES: '2' });
    assert.equal(out.result.ok, true, out.stdout);
    assert.equal(out.result.status, status);
    if (reason) assert.match(String(out.result.reason), new RegExp(reason));
    assert.equal(out.events.length, 1, 'exactly one request even with retries configured');
    assert.equal(out.events[0]!.consumedAtCall, true);
    assert.equal(out.events[0]!.runStatusAtCall, 'CLAIMED');
    const stored = readFileSync(artifactOf(inst, id), 'utf8') + readFileSync(runFileOf(inst, id), 'utf8');
    for (const secret of [RAW, FAKE_KEY, 'Bearer']) assert.ok(!stored.includes(secret), `${secret} must not be stored`);
    assert.ok(!out.stdout.includes(FAKE_KEY));
    assert.ok(existsSync(markerOf(inst, id)));
    // the same run cannot repeat, and a new run cannot start: the quota slot is spent whatever happened
    assert.equal(runChild(inst, 'ok', id).result.code, 'APPROVAL_SPENT');
    await inst.approve(`${id}-2`);
    const second = runChild(inst, 'ok', `${id}-2`);
    assert.equal(second.result.code, 'QUOTA_EXHAUSTED');
    assert.equal(second.events.length, 0);
  });
}

test('production runner: a settlement failure leaves the claim CLAIMED and spent (never released); an artifact write failure drops the adjustments and still settles', async () => {
  const a = await makeInstall();
  await a.approve('c3-live-meta-setl');
  const s = runChild(a, 'settlefail', 'c3-live-meta-setl');
  assert.equal(s.result.ok, true, s.stdout);
  assert.equal(s.result.settled, false);
  assert.equal(s.events.length, 1);
  assert.equal(JSON.parse(readFileSync(runFileOf(a, 'c3-live-meta-setl'), 'utf8')).status, 'CLAIMED');
  assert.ok(existsSync(markerOf(a, 'c3-live-meta-setl')));
  await a.approve('c3-live-meta-setl-2');
  assert.equal(runChild(a, 'ok', 'c3-live-meta-setl-2').result.code, 'QUOTA_EXHAUSTED');
  const b = await makeInstall();
  await b.approve('c3-live-meta-artf');
  const f = runChild(b, 'artfail', 'c3-live-meta-artf');
  assert.equal(f.result.ok, true, f.stdout);
  assert.equal(f.result.status, 'PROPOSAL_FAILED');
  assert.equal(f.result.reason, 'ARTIFACT_WRITE_FAILED');
  assert.equal(f.result.adjustments, null);
  assert.equal(f.events.length, 1);
  assert.equal(JSON.parse(readFileSync(runFileOf(b, 'c3-live-meta-artf'), 'utf8')).status, 'PROPOSAL_FAILED');
});

// ---------------------------------------------------------------- authorization failures: nothing is consumed, reserved or called

const refuse = (name: string, setup: (i: Install) => Promise<{ runId: string; env?: Record<string, string>; scenario?: string; expect: string; consumed?: boolean }>) =>
  test(`production runner refuses (${name}): no request, nothing reserved${name.startsWith('credential') ? '' : ', approval unspent'}`, async () => {
    const inst = await makeInstall();
    const plan = await setup(inst);
    const before = state(inst);
    const out = runChild(inst, plan.scenario ?? 'ok', plan.runId, plan.env);
    assert.equal(out.result.ok, false, out.stdout);
    assert.equal(out.result.code ?? out.result.name, plan.expect);
    assert.equal(out.events.length, 0, 'no provider request');
    assert.equal(existsSync(markerOf(inst, plan.runId)), plan.consumed === true);
    assert.equal(existsSync(runFileOf(inst, plan.runId)), false, 'no reservation');
    assert.equal(existsSync(artifactOf(inst, plan.runId)), false);
    if (plan.consumed !== true) assert.deepEqual(state(inst), before);
  });

refuse('no approval record', async () => ({ runId: 'c3-live-meta-noappr', expect: 'APPROVAL_MISSING' }));
refuse('expired approval', async (i) => {
  await i.approve('c3-live-meta-exp', { now: new Date(Date.now() - 20 * 60_000) });
  return { runId: 'c3-live-meta-exp', expect: 'APPROVAL_EXPIRED' };
});
refuse('approval for another input', async (i) => {
  await i.approve('c3-live-meta-other', { inputSha256: 'a'.repeat(64) });
  return { runId: 'c3-live-meta-other', expect: 'INPUT_MISMATCH' };
});
refuse('approval for another repository revision (forged Git state)', async (i) => {
  await i.approve('c3-live-meta-rev', { repoSha: 'c'.repeat(40) });
  return { runId: 'c3-live-meta-rev', expect: 'REPO_MISMATCH' };
});
refuse('approval for another activation revision', async (i) => {
  await i.approve('c3-live-meta-act', { activation: { commit: 'd'.repeat(40), digest: i.digest } });
  return { runId: 'c3-live-meta-act', expect: 'REVISION_NOT_APPROVED' };
});
refuse('a synthetic approval', async (i) => {
  await i.approve('c3-live-meta-syn', { synthetic: true });
  return { runId: 'c3-live-meta-syn', expect: 'SYNTHETIC_NOT_ALLOWED' };
});
refuse('a dirty working tree', async (i) => {
  await i.approve('c3-live-meta-dirty');
  writeFileSync(path.join(i.root, 'untracked.txt'), 'x');
  return { runId: 'c3-live-meta-dirty', expect: 'TREE_DIRTY' };
});
refuse('a commit after the pin that is not pin-only', async (i) => {
  await i.approve('c3-live-meta-desc');
  writeFileSync(path.join(i.root, 'packages/inference/src/extra.ts'), '// changed after the pin\n');
  git(i.root, 'add', '-A');
  git(i.root, 'commit', '-q', '-m', 'sneaky');
  return { runId: 'c3-live-meta-desc', expect: 'REVISION_NOT_APPROVED' };
});
refuse('credential missing: stops after read-only authorization, BEFORE the approval is consumed', async (i) => {
  await i.approve('c3-live-meta-nokey');
  return { runId: 'c3-live-meta-nokey', env: { MODEL_API_KEY: '' }, expect: 'CONFIG' };
});
refuse('billable flag off', async (i) => {
  await i.approve('c3-live-meta-bill');
  return { runId: 'c3-live-meta-bill', env: { PROOFPILOT_ALLOW_BILLABLE_CALLS: '0' }, expect: 'BILLABLE_NOT_AUTHORIZED' };
});
refuse('model override', async (i) => {
  await i.approve('c3-live-meta-model');
  return { runId: 'c3-live-meta-model', env: { META_MODEL_VISUAL: 'other-model' }, expect: 'MODEL_NOT_ALLOWED' };
});

test('quota 0 in the copy (the real constant) refuses before the approval is even read; the register decision alone authorizes nothing', async () => {
  const inst = await makeInstall({ quota: 0 });
  await inst.approve('c3-live-meta-q0');
  const out = runChild(inst, 'ok', 'c3-live-meta-q0');
  assert.equal(out.result.code, 'QUOTA_ZERO');
  assert.equal(out.events.length, 0);
  assert.equal(existsSync(markerOf(inst, 'c3-live-meta-q0')), false);
  assert.equal(existsSync(runFileOf(inst, 'c3-live-meta-q0')), false);
});

test('a synthetic register decision is rejected by the production gate even with a matching approval', async () => {
  const inst = await makeInstall({ registerOverride: (d) => ({ ...d, synthetic: true }) });
  await inst.approve('c3-live-meta-synreg');
  const out = runChild(inst, 'ok', 'c3-live-meta-synreg');
  assert.equal(out.result.code, 'SYNTHETIC_NOT_ALLOWED');
  assert.equal(out.events.length, 0);
});

test('the real repository is untouched: quota 0, empty register and pin, no approvals, no fixture state', () => {
  const quota = readFileSync(path.join(REAL_ROOT, 'packages/inference/src/reservations.ts'), 'utf8');
  assert.match(quota, /Object\.freeze\(\{ meta: 0, baseten: 0 \}\)/);
  assert.deepEqual(JSON.parse(readFileSync(path.join(REAL_ROOT, 'config/live-authorization.json'), 'utf8')).decisions, []);
  assert.equal(JSON.parse(readFileSync(path.join(REAL_ROOT, 'config/live-activation.json'), 'utf8')).activation, null);
});
