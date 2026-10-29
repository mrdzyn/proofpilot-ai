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
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
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

async function makeInstall(o: { quota?: number; noPin?: boolean; registerOverride?: (d: Record<string, unknown>) => Record<string, unknown> } = {}): Promise<Install> {
  const dir = tempDir('pp-install-');
  const root = path.join(dir, 'install');
  mkdirSync(root);
  for (const d of ['packages', 'config', 'fixtures']) cpSync(path.join(REAL_ROOT, d), path.join(root, d), { recursive: true, filter: (s) => !s.includes('node_modules') });
  cpSync(path.join(REAL_ROOT, '.gitignore'), path.join(root, '.gitignore'));
  // the copy carries the REAL shipped quota constant and the REAL owner decision; only the activation pin (which the real repository leaves empty
  // until a separate reviewed pin-only commit) and an optional override are fixture-specific
  const res = path.join(root, 'packages/inference/src/reservations.ts');
  if (o.quota !== undefined) {
    const text = readFileSync(res, 'utf8');
    assert.ok(text.includes('Object.freeze({ meta: 1, baseten: 0 })'));
    writeFileSync(res, text.replace('Object.freeze({ meta: 1, baseten: 0 })', `Object.freeze({ meta: ${o.quota}, baseten: 0 })`));
  }
  if (o.registerOverride) {
    const reg = JSON.parse(readFileSync(path.join(root, 'config/live-authorization.json'), 'utf8'));
    assert.equal(reg.decisions.length, 1);
    reg.decisions = [o.registerOverride(reg.decisions[0])];
    writeFileSync(path.join(root, 'config/live-authorization.json'), JSON.stringify(reg, null, 2) + '\n');
  }
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'A');
  const A = git(root, 'rev-parse', 'HEAD');
  const digest = await createGitProbe(root).treeDigest(A, ACTIVATION_PIN_PATH);
  const decisionRef = (JSON.parse(readFileSync(path.join(root, 'config/live-authorization.json'), 'utf8')).decisions[0] as { reference: string }).reference;
  if (o.noPin) return { dir, root, A, Aprime: A, digest, approve: async (runId, over = {}) => { const register = await loadDecisionRegister(root); await writeApprovalRecord(path.join(root, '.proofpilot/approvals'), buildApprovalRecord({ runId, repoSha: A, activation: { commit: A, digest }, inputSha256: request.inputSha256, inputChars: request.prompt.length, register, declaredBy: 'fixture-operator', now: new Date(), ...over } as never)); } };
  writeFileSync(path.join(root, ACTIVATION_PIN_PATH), JSON.stringify({ schemaVersion: 1, activation: { decisionId: DECISION_ID, decisionReference: decisionRef, activationCommit: A, activationDigest: digest, recordedBy: 'FIXTURE', recordedAt: '2026-10-30T00:00:00.000Z', reference: 'fixture pin' } }, null, 2) + '\n');
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
let keyReads = 0;
process.env = new Proxy({ ...process.env }, { get(t, k) { if (k === 'MODEL_API_KEY' || k === 'BASETEN_API_KEY') keyReads++; return t[k]; } });
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
writeFileSync(outFile, JSON.stringify({ result, events, keyReads }));
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
  const out = JSON.parse(readFileSync(outFile, 'utf8')) as { result: Record<string, any>; events: Array<Record<string, any>>; keyReads: number };
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
    if (!name.startsWith('credential')) assert.equal(out.keyReads, 0, 'the credential field was never read');
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

test('hostile Git environment variables cannot point the Git probe at another repository, and the provider key never reaches the git child process', async () => {
  const inst = await makeInstall();
  const decoy = path.join(inst.dir, 'decoy');
  mkdirSync(decoy);
  git(decoy, 'init', '-q', '-b', 'main');
  writeFileSync(path.join(decoy, 'x'), 'x');
  git(decoy, 'add', '-A');
  git(decoy, 'commit', '-q', '-m', 'decoy');
  await inst.approve('c3-live-meta-gitenv');
  const out = runChild(inst, 'ok', 'c3-live-meta-gitenv', { GIT_DIR: path.join(decoy, '.git'), GIT_WORK_TREE: decoy, GIT_INDEX_FILE: path.join(decoy, '.git/index') });
  assert.equal(out.result.ok, true, out.stdout);
  assert.equal(out.result.status, 'PROPOSAL_ACCEPTED');
  assert.equal(out.events.length, 1);
  // the only reads of the key are the provider's own, after authorization (never via an inherited child environment)
  assert.ok(out.keyReads >= 1 && out.keyReads <= 2, `unexpected number of credential reads: ${out.keyReads}`);
});

test('the EMPTY activation pin alone stops everything: shipped quota 1 and the owner decision registered, an approval present, a credential available, yet no credential read, consumption, reservation, artifact or request', async () => {
  const inst = await makeInstall({ noPin: true });
  assert.equal(JSON.parse(readFileSync(path.join(inst.root, 'config/live-activation.json'), 'utf8')).activation, null);
  assert.match(readFileSync(path.join(inst.root, 'packages/inference/src/reservations.ts'), 'utf8'), /Object\.freeze\(\{ meta: 1, baseten: 0 \}\)/);
  await inst.approve('c3-live-meta-nopin');
  const out = runChild(inst, 'ok', 'c3-live-meta-nopin');
  assert.equal(out.result.ok, false, out.stdout);
  assert.equal(out.result.code, 'ACTIVATION_NOT_PINNED');
  assert.equal(out.keyReads, 0, 'the credential field was never read');
  assert.equal(out.events.length, 0);
  assert.equal(existsSync(markerOf(inst, 'c3-live-meta-nopin')), false, 'approval not consumed');
  assert.equal(existsSync(runFileOf(inst, 'c3-live-meta-nopin')), false, 'no reservation');
  assert.equal(existsSync(path.join(inst.root, '.proofpilot/evidence')), false, 'no artifact');
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

test('the real repository carries exactly the owner decision, quota 1 for Meta only, and an EMPTY activation pin; no approval or fixture state exists', () => {
  assert.match(readFileSync(path.join(REAL_ROOT, 'packages/inference/src/reservations.ts'), 'utf8'), /Object\.freeze\(\{ meta: 1, baseten: 0 \}\)/);
  assert.equal(JSON.parse(readFileSync(path.join(REAL_ROOT, 'config/live-activation.json'), 'utf8')).activation, null);
  const reg = JSON.parse(readFileSync(path.join(REAL_ROOT, 'config/live-authorization.json'), 'utf8'));
  assert.equal(reg.decisions.length, 1);
  assert.equal('synthetic' in reg.decisions[0], false);
  assert.equal(execFileSync('git', ['-C', REAL_ROOT, 'ls-files', '.proofpilot'], { encoding: 'utf8' }).trim(), '');
});

// ================================================================ the owner CLI end to end (C3-LIVE-01B)
// Real evidence verification, real gate, real entry point, real runner from the copy; scripted terminal I/O and a mock Meta endpoint.
import { readFixtureTree, loadCertifiedProposalInput } from '../../packages/inference/src/index.ts';
import { edit, writeEvidence } from '../support/live-evidence.ts';

const CLI_CHILD = `
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const [root, scenario, runId, analysisId, answersFile, outFile, extra] = process.argv.slice(2);
let keyReads = 0;
process.env = new Proxy({ ...process.env }, { get(t, k) { if (k === 'MODEL_API_KEY' || k === 'BASETEN_API_KEY') keyReads++; return t[k]; } });
const events = [];
const marker = path.join(root, '.proofpilot/approvals', runId + '.consumed');
const runFile = path.join(root, '.proofpilot/reservations/meta/runs', runId + '.json');
const ok = (text, e = {}) => new Response(JSON.stringify({ id: 'resp_fixture', model: 'muse-spark-1.3', status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text }] }], usage: { input_tokens: 1200, output_tokens: 300, total_tokens: 1500 }, ...e }), { status: 200, headers: { 'content-type': 'application/json', 'x-request-id': 'req-fixture' } });
globalThis.fetch = async (url, init) => {
  events.push({ url: String(url), consumedAtCall: existsSync(marker), runStatusAtCall: existsSync(runFile) ? JSON.parse(readFileSync(runFile, 'utf8')).status : null });
  if (scenario === 'http500') return new Response(JSON.stringify({ error: { message: ${JSON.stringify(RAW)} } }), { status: 500, headers: { 'content-type': 'application/json' } });
  return ok(${JSON.stringify(PV1)});
};
const inf = await import(pathToFileURL(path.join(root, 'packages/inference/src/index.ts')).href);
const cli = await import(pathToFileURL(path.join(root, 'packages/inference/src/live-proposal-cli.ts')).href);
const answers = JSON.parse(readFileSync(answersFile, 'utf8'));
const lines = [];
const asked = [];
const argv = ['--analysis', analysisId, '--run-id', runId, ...(extra ? extra.split(' ') : [])];
const code = await cli.runLiveProposalCli(argv, {
  io: { stdinIsTTY: true, stdoutIsTTY: true, ask: async (q) => { asked.push(q); return answers.shift() ?? ''; }, print: (l) => lines.push(l) },
  repoRoot: root, propose: inf.proposeCandidate, authorize: inf.authorizeProductionAttempt,
});
writeFileSync(outFile, JSON.stringify({ code, lines, asked, events, keyReads }));
`;

async function cliSetup(o: Parameters<typeof makeInstall>[0] = {}) {
  const inst = await makeInstall(o);
  const head = git(inst.root, 'rev-parse', 'HEAD');
  const fixtureTree = await readFixtureTree(inst.root);
  const ev = writeEvidence(inst.root, { head, fixtureTree });
  const input = await loadCertifiedProposalInput({ repoRoot: inst.root, head, fixtureTree, analysisId: ev.analysisId });
  const req = buildProposalRequest({ symptom: input.symptom, facts: input.facts });
  const approve = (runId: string, over: Record<string, unknown> = {}) => inst.approve(runId, { inputSha256: req.inputSha256, inputChars: req.chars, ...over });
  const phrase = (runId: string) => `SEND ONE META REQUEST ${runId} ${req.inputSha256.slice(0, 12)}`;
  const runCli = (runId: string, answers: string[], opts: { scenario?: string; env?: Record<string, string>; extra?: string } = {}) => {
    const answersFile = path.join(inst.dir, `answers-${runId}.json`);
    writeFileSync(answersFile, JSON.stringify(answers));
    const outFile = path.join(inst.dir, `cli-${runId}-${Math.random().toString(36).slice(2)}.json`);
    const script = path.join(inst.dir, 'cli-child.ts');
    writeFileSync(script, CLI_CHILD);
    const r = spawnSync(process.execPath, [script, inst.root, opts.scenario ?? 'ok', runId, ev.analysisId, answersFile, outFile, opts.extra ?? ''], {
      env: { PATH: process.env.PATH ?? '', HOME: inst.dir, MODEL_API_KEY: FAKE_KEY, PROOFPILOT_ALLOW_BILLABLE_CALLS: '1', ...(opts.env ?? {}) }, encoding: 'utf8', timeout: 60_000,
    });
    assert.equal(r.status, 0, `cli child failed: ${r.stderr.slice(0, 600)}`);
    const out = JSON.parse(readFileSync(outFile, 'utf8')) as { code: number; lines: string[]; asked: string[]; events: Array<Record<string, any>>; keyReads: number };
    return { ...out, text: out.lines.join('\n'), stdout: r.stdout + r.stderr };
  };
  return { inst, ev, req, approve, phrase, runCli };
}

test('CLI end to end: verified evidence, hash shown, real gate open, confirmation, then approval consumed -> reservation claimed -> ONE request -> sanitized report -> STOP', async () => {
  const c = await cliSetup();
  const id = 'c3-live-meta-001';
  await c.approve(id);
  const out = c.runCli(id, [c.phrase(id)]);
  assert.equal(out.code, 0, out.text);
  assert.ok(out.text.includes(c.req.inputSha256));
  assert.match(out.text, /production authorization \(read-only\): every gate passes/);
  assert.match(out.text, /UNTRUSTED PROPOSAL — NOT VERIFIED/);
  assert.equal(out.events.length, 1);
  assert.equal(out.events[0]!.consumedAtCall, true);
  assert.equal(out.events[0]!.runStatusAtCall, 'CLAIMED');
  assert.ok(!out.text.includes(FAKE_KEY) && !out.stdout.includes(FAKE_KEY) && !out.text.includes(PV1));
  assert.ok(existsSync(artifactOf(c.inst, id)));
  const again = c.runCli(id, [c.phrase(id)]);
  assert.equal(again.code, 3);
  assert.match(again.text, /REFUSED \(APPROVAL_SPENT\)/);
  assert.equal(again.events.length, 0);
  assert.equal(again.asked.length, 0);
});

test('CLI: every provider outcome prints sanitized fields only, makes one request and spends the attempt; the command never retries', async () => {
  const c = await cliSetup();
  const id = 'c3-live-meta-002';
  await c.approve(id);
  const out = c.runCli(id, [c.phrase(id)], { scenario: 'http500', env: { PROOFPILOT_INFERENCE_MAX_RETRIES: '2' } });
  assert.equal(out.code, 1, out.text);
  assert.equal(out.events.length, 1, 'one request even with retries configured');
  assert.ok(!out.text.includes(RAW) && !out.stdout.includes(RAW));
  assert.match(out.text, /PROPOSAL_FAILED/);
  assert.match(out.text, /attempt is spent/);
  await c.approve('c3-live-meta-003');
  const next = c.runCli('c3-live-meta-003', [c.phrase('c3-live-meta-003')]);
  assert.equal(next.code, 3);
  assert.match(next.text, /REFUSED \(QUOTA_EXHAUSTED\)/);
  assert.equal(next.events.length, 0);
});

test('CLI: the empty activation pin stops it at the read-only gate: no confirmation prompt, no credential read, no consumption, no reservation, no request', async () => {
  const c = await cliSetup({ noPin: true });
  await c.approve('c3-live-meta-001');
  const out = c.runCli('c3-live-meta-001', [c.phrase('c3-live-meta-001')]);
  assert.equal(out.code, 3);
  assert.match(out.text, /REFUSED \(ACTIVATION_NOT_PINNED\)/);
  assert.equal(out.asked.length, 0);
  assert.equal(out.keyReads, 0);
  assert.equal(out.events.length, 0);
  assert.equal(existsSync(markerOf(c.inst, 'c3-live-meta-001')), false);
  assert.equal(existsSync(runFileOf(c.inst, 'c3-live-meta-001')), false);
});

test('CLI: missing, expired, synthetic, mismatched and other-input operator approvals each stop it before the prompt', async () => {
  const cases: Array<[string, (c: Awaited<ReturnType<typeof cliSetup>>, id: string) => Promise<void>, string]> = [
    ['missing', async () => undefined, 'APPROVAL_MISSING'],
    ['expired', (c, id) => c.approve(id, { now: new Date(Date.now() - 20 * 60_000) }), 'APPROVAL_EXPIRED'],
    ['synthetic', (c, id) => c.approve(id, { synthetic: true }), 'SYNTHETIC_NOT_ALLOWED'],
    ['other input hash', (c, id) => c.approve(id, { inputSha256: 'a'.repeat(64) }), 'INPUT_MISMATCH'],
    ['other revision', (c, id) => c.approve(id, { repoSha: 'c'.repeat(40) }), 'REPO_MISMATCH'],
  ];
  for (const [name, setup, code] of cases) {
    const c = await cliSetup();
    const id = 'c3-live-meta-001';
    await setup(c, id);
    const out = c.runCli(id, [c.phrase(id)]);
    assert.equal(out.code, 3, name);
    assert.match(out.text, new RegExp(`REFUSED \\(${code}\\)`), name);
    assert.equal(out.asked.length, 0, name);
    assert.equal(out.events.length, 0, name);
    assert.equal(out.keyReads, 0, name);
    assert.equal(existsSync(markerOf(c.inst, id)), false, name);
  }
});

test('CLI: it cannot bypass trusted F01 provenance: an uncertified, tampered, mismatched or mock-sourced input is refused before the gate is even consulted', async () => {
  const mutations: Array<[string, (c: Awaited<ReturnType<typeof cliSetup>>) => void, string]> = [
    ['uncertified baseline', (c) => edit(path.join(c.ev.baselineDir, 'baseline-summary.json'), (d) => { d.certified = false; }), 'BASELINE_NOT_CERTIFIED'],
    ['tampered baseline', (c) => appendFileSync(path.join(c.ev.baselineDir, 'oracle-report.json'), ' '), 'BASELINE_TAMPERED'],
    ['baseline for another revision', (c) => edit(path.join(c.ev.baselineDir, 'baseline-summary.json'), (d) => { d.gitHead = 'e'.repeat(40); }), 'BASELINE_MISSING'],
    ['mock analysis', (c) => edit(c.ev.analysisFile, (d) => { d.evidenceKind = 'mock'; }), 'ANALYSIS_NOT_LIVE'],
    ['tampered recording', (c) => appendFileSync(c.ev.mp4, 'x'), 'RECORDING_TAMPERED'],
  ];
  for (const [name, mutate, code] of mutations) {
    const c = await cliSetup();
    await c.approve('c3-live-meta-001');
    mutate(c);
    const out = c.runCli('c3-live-meta-001', [c.phrase('c3-live-meta-001')]);
    assert.equal(out.code, 2, name);
    assert.match(out.text, new RegExp(code), name);
    assert.ok(!out.text.includes('production authorization'), `${name}: the gate was never consulted`);
    assert.equal(out.events.length, 0, name);
    assert.equal(existsSync(markerOf(c.inst, 'c3-live-meta-001')), false, name);
  }
});

test('CLI: a wrong confirmation phrase, extra options or a missing credential send nothing and consume nothing', async () => {
  const c = await cliSetup();
  const id = 'c3-live-meta-001';
  await c.approve(id);
  const wrong = c.runCli(id, ['yes']);
  assert.equal(wrong.code, 1);
  assert.equal(wrong.events.length, 0);
  assert.equal(existsSync(markerOf(c.inst, id)), false);
  const flag = c.runCli(id, [c.phrase(id)], { extra: '--provider baseten' });
  assert.equal(flag.code, 2);
  assert.equal(flag.events.length, 0);
  const noKey = c.runCli(id, [c.phrase(id)], { env: { MODEL_API_KEY: '' } });
  assert.equal(noKey.code, 3);
  assert.match(noKey.text, /\(CONFIG\)/);
  assert.equal(noKey.events.length, 0);
  assert.equal(existsSync(markerOf(c.inst, id)), false, 'a missing credential consumed nothing');
  assert.equal(existsSync(runFileOf(c.inst, id)), false);
  // the same approval still works afterwards: nothing was spent
  const ok = c.runCli(id, [c.phrase(id)]);
  assert.equal(ok.code, 0, ok.text);
});
