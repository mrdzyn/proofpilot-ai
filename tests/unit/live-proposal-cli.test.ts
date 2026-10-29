// C3-LIVE-01B: the owner-operated single-call CLI logic with scripted terminal I/O and MOCK propose/authorize functions. No provider, no
// network, no credential. (The real gate and the real entry point are exercised in tests/security/live01b-activation-install-copy.test.ts.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AuthorizationError, buildProposalRequest, loadCertifiedProposalInput, ProposalError, readFixtureTree } from '../../packages/inference/src/index.ts';
import { DEFAULT_LIVE_RUN_ID, liveConfirmationPhrase, runLiveProposalCli, type LiveCliDeps } from '../../packages/inference/src/live-proposal-cli.ts';
import { tempDir } from '../helpers.ts';
import { writeEvidence } from '../support/live-evidence.ts';

const git = (cwd: string, ...a: string[]) => execFileSync('git', ['-C', cwd, '-c', 'user.name=T', '-c', 'user.email=t@example.invalid', ...a], { encoding: 'utf8' }).trim();
const SECRET = 'sk-LEAKED-IN-ERROR-8891abcd';
const RAW = 'RAW-PROVIDER-TEXT-MARKER-1c9d';

async function repo(opts: { evidence?: boolean } = {}) {
  const root = tempDir('pp-cli-');
  git(root, 'init', '-q', '-b', 'main');
  writeFileSync(path.join(root, '.gitignore'), '.proofpilot/\n');
  mkdirSync(path.join(root, 'fixtures/sample-store'), { recursive: true });
  writeFileSync(path.join(root, 'fixtures/sample-store/index.html'), '<html></html>');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  const head = git(root, 'rev-parse', 'HEAD');
  const fixtureTree = await readFixtureTree(root);
  const e = opts.evidence === false ? null : writeEvidence(root, { head, fixtureTree });
  const input = e ? await loadCertifiedProposalInput({ repoRoot: root, head, fixtureTree, analysisId: e.analysisId }) : null;
  const request = input ? buildProposalRequest({ symptom: input.symptom, facts: input.facts }) : null;
  return { root, head, fixtureTree, e, request };
}

function harness(over: Partial<LiveCliDeps> & { answers?: string[]; tty?: boolean; authorize?: LiveCliDeps['authorize']; propose?: LiveCliDeps['propose'] } = {}) {
  const lines: string[] = [];
  const asked: string[] = [];
  const answers = [...(over.answers ?? [])];
  const calls = { authorize: [] as unknown[], propose: [] as unknown[] };
  const deps = (root: string): LiveCliDeps => ({
    io: { stdinIsTTY: over.tty !== false, stdoutIsTTY: over.tty !== false, ask: async (q) => { asked.push(q); return answers.shift() ?? ''; }, print: (l) => lines.push(l) },
    repoRoot: root,
    authorize: over.authorize ?? (async (a) => { calls.authorize.push(a); return {}; }),
    propose: over.propose ?? (async (i) => { calls.propose.push(i); return { status: 'PROPOSAL_ACCEPTED', reason: null, artifactPath: path.join(root, '.proofpilot/evidence/proposals', i.runId, 'proposal.json'), settled: true, artifact: { requestId: 'req-1', usage: { inputTokens: 10 }, lifecycle: { status: 'completed' }, respondedModel: 'muse-spark-1.3', slot: 1, rawText: RAW } as never }; }),
  });
  return { lines, asked, calls, deps, text: () => lines.join('\n') };
}
test('a non-interactive invocation is refused before anything is read or sent', async () => {
  const r = await repo();
  const h = harness({ tty: false });
  assert.equal(await runLiveProposalCli(['--analysis', r.e!.analysisId], h.deps(r.root)), 2);
  assert.match(h.text(), /interactive terminal/);
  assert.equal(h.calls.authorize.length + h.calls.propose.length, 0);
});

test('there is no loop, batch, retry, fallback, provider, model, limit, credential or root option; arguments are strict', async () => {
  const r = await repo();
  for (const argv of [
    ['--analysis', 'c2b-live-smoke-002', '--provider', 'baseten'], ['--analysis', 'c2b-live-smoke-002', '--model', 'other'], ['--analysis', 'c2b-live-smoke-002', '--retries', '2'],
    ['--analysis', 'c2b-live-smoke-002', '--loop'], ['--analysis', 'c2b-live-smoke-002', '--batch', '3'], ['--analysis', 'c2b-live-smoke-002', '--fallback'],
    ['--analysis', 'c2b-live-smoke-002', '--root', '/tmp'], ['--analysis', 'c2b-live-smoke-002', '--api-key', 'x'], ['--analysis', 'c2b-live-smoke-002', '--max-tokens', '9999'],
    ['--analysis', 'a', '--analysis', 'b'], ['--run-id', 'c3-live-meta-001'], ['--analysis', '../etc'], ['--analysis', 'c2b-live-smoke-002', '--run-id', '../x'], ['--analysis'],
  ]) {
    const h = harness();
    assert.equal(await runLiveProposalCli(argv, h.deps(r.root)), 2, argv.join(' '));
    assert.equal(h.calls.authorize.length + h.calls.propose.length, 0, argv.join(' '));
  }
});

test('it refuses a dirty tree and any evidence that cannot be validated, before authorization', async () => {
  const dirty = await repo();
  writeFileSync(path.join(dirty.root, 'untracked.txt'), 'x');
  const h1 = harness();
  assert.equal(await runLiveProposalCli(['--analysis', dirty.e!.analysisId], h1.deps(dirty.root)), 2);
  assert.match(h1.text(), /TREE_DIRTY/);
  const none = await repo({ evidence: false });
  const h2 = harness();
  assert.equal(await runLiveProposalCli(['--analysis', 'c2b-live-smoke-002'], h2.deps(none.root)), 2);
  assert.match(h2.text(), /BASELINE_MISSING/);
  const bad = await repo();
  writeFileSync(bad.e!.mp4, 'tampered');
  const h3 = harness();
  assert.equal(await runLiveProposalCli(['--analysis', bad.e!.analysisId], h3.deps(bad.root)), 2);
  assert.match(h3.text(), /RECORDING_TAMPERED/);
  for (const h of [h1, h2, h3]) assert.equal(h.calls.authorize.length + h.calls.propose.length, 0);
});

test('--preflight shows the exact input hash and size, evaluates the gate read-only, and never asks for confirmation or sends anything', async () => {
  const r = await repo();
  const h = harness();
  assert.equal(await runLiveProposalCli(['--analysis', r.e!.analysisId, '--preflight'], h.deps(r.root)), 0);
  const t = h.text();
  assert.ok(t.includes(r.request!.inputSha256), 'the exact input SHA-256 is displayed');
  assert.ok(t.includes(`${r.request!.chars} characters`));
  assert.ok(t.includes(`--run-id ${DEFAULT_LIVE_RUN_ID} --input-sha256 ${r.request!.inputSha256} --input-chars ${r.request!.chars}`), 'the exact approval command');
  assert.match(t, /muse-spark-1\.3/);
  assert.equal(h.calls.authorize.length, 1);
  assert.equal(h.calls.propose.length, 0);
  assert.equal(h.asked.length, 0);
  // a refused gate is reported without failing the preflight
  const h2 = harness({ authorize: async () => { throw new AuthorizationError('ACTIVATION_NOT_PINNED', 'no owner-pinned activation revision'); } });
  assert.equal(await runLiveProposalCli(['--analysis', r.e!.analysisId, '--preflight'], h2.deps(r.root)), 0);
  assert.match(h2.text(), /REFUSED \(ACTIVATION_NOT_PINNED\)/);
  assert.equal(h2.asked.length, 0);
});

test('--show-prompt prints the exact prompt that is hashed', async () => {
  const r = await repo();
  const h = harness();
  await runLiveProposalCli(['--analysis', r.e!.analysisId, '--preflight', '--show-prompt'], h.deps(r.root));
  for (const line of r.request!.prompt.split('\n').filter(Boolean)) assert.ok(h.lines.includes(line), `prompt line shown: ${line.slice(0, 40)}`);
});

test('a closed gate (no pin, no approval, spent, expired...) stops the command before confirmation, consumption or any call', async () => {
  const r = await repo();
  for (const code of ['ACTIVATION_NOT_PINNED', 'APPROVAL_MISSING', 'APPROVAL_EXPIRED', 'APPROVAL_SPENT', 'INPUT_MISMATCH', 'REPO_MISMATCH', 'TREE_DIRTY', 'SYNTHETIC_NOT_ALLOWED'] as const) {
    const h = harness({ authorize: async () => { throw new AuthorizationError(code, 'refused'); } });
    assert.equal(await runLiveProposalCli(['--analysis', r.e!.analysisId], h.deps(r.root)), 3, code);
    assert.match(h.text(), new RegExp(`REFUSED \\(${code}\\)`));
    assert.equal(h.asked.length, 0, 'never asks the operator to confirm a closed gate');
    assert.equal(h.calls.propose.length, 0);
  }
});

test('an open gate still needs the exact confirmation phrase; anything else sends nothing', async () => {
  const r = await repo();
  const phrase = liveConfirmationPhrase(DEFAULT_LIVE_RUN_ID, r.request!.inputSha256);
  assert.equal(phrase, `SEND ONE META REQUEST c3-live-meta-001 ${r.request!.inputSha256.slice(0, 12)}`);
  for (const wrong of ['', 'yes', 'y', phrase.toLowerCase(), `${phrase} now`, liveConfirmationPhrase('c3-live-meta-002', r.request!.inputSha256), liveConfirmationPhrase(DEFAULT_LIVE_RUN_ID, 'f'.repeat(64))]) {
    const h = harness({ answers: [wrong] });
    assert.equal(await runLiveProposalCli(['--analysis', r.e!.analysisId], h.deps(r.root)), 1, JSON.stringify(wrong));
    assert.equal(h.calls.propose.length, 0, 'nothing sent');
    assert.equal(h.asked.length, 1, 'one prompt, no re-ask');
  }
});

test('confirmed: exactly ONE call with exactly {runId, request}; only sanitized fields are printed; the command stops', async () => {
  const r = await repo();
  const phrase = liveConfirmationPhrase('c3-live-meta-007', r.request!.inputSha256);
  const h2 = harness({ answers: [phrase] });
  assert.equal(await runLiveProposalCli(['--analysis', r.e!.analysisId, '--run-id', 'c3-live-meta-007'], h2.deps(r.root)), 0);
  assert.equal(h2.calls.propose.length, 1);
  assert.deepEqual(Object.keys(h2.calls.propose[0] as object).sort(), ['request', 'runId']);
  assert.equal((h2.calls.propose[0] as { runId: string }).runId, 'c3-live-meta-007');
  assert.deepEqual((h2.calls.propose[0] as { request: unknown }).request, r.request);
  const t = h2.text();
  assert.match(t, /UNTRUSTED PROPOSAL — NOT VERIFIED/);
  assert.match(t, /status:\s+PROPOSAL_ACCEPTED/);
  assert.match(t, /response id:\s+req-1/);
  assert.match(t, /artifact:\s+\.proofpilot\/evidence\/proposals\/c3-live-meta-007\/proposal\.json/);
  assert.ok(!t.includes(RAW), 'raw provider text is never printed');
  assert.ok(!/adjustments|renderedCss|apiKey|MODEL_API_KEY|Bearer/i.test(t));
  assert.match(t, /No further call will be made/);
});

test('a failed, rejected or blocked proposal is reported and still makes no second call', async () => {
  const r = await repo();
  for (const [status, exit] of [['PROPOSAL_FAILED', 1], ['PROPOSAL_REJECTED', 1], ['PROPOSAL_BLOCKED', 1]] as const) {
    const h = harness({ answers: [liveConfirmationPhrase(DEFAULT_LIVE_RUN_ID, r.request!.inputSha256)], propose: undefined });
    const calls: unknown[] = [];
    const deps = h.deps(r.root);
    deps.propose = async (i) => { calls.push(i); return { status, reason: 'PROVIDER_TIMEOUT', artifactPath: null, settled: false, artifact: { requestId: null, usage: null, lifecycle: null, respondedModel: null, slot: 1 } }; };
    assert.equal(await runLiveProposalCli(['--analysis', r.e!.analysisId], deps), exit);
    assert.equal(calls.length, 1, 'one attempt, never repeated');
    assert.match(h.text(), /NOT WRITTEN/);
    assert.match(h.text(), /NOT settled \(still spent\)/);
  }
});

test('an error from the entry point prints only its typed code (never the message, a secret or a stack) and is never retried', async () => {
  const r = await repo();
  for (const err of [new AuthorizationError('INTERNAL', SECRET), new ProposalError('INVALID_INPUT', SECRET), new Error(`boom ${SECRET}`)]) {
    const calls: unknown[] = [];
    const h = harness({ answers: [liveConfirmationPhrase(DEFAULT_LIVE_RUN_ID, r.request!.inputSha256)] });
    const deps = h.deps(r.root);
    deps.propose = async (i) => { calls.push(i); throw err; };
    assert.equal(await runLiveProposalCli(['--analysis', r.e!.analysisId], deps), 3);
    assert.equal(calls.length, 1);
    assert.ok(!h.text().includes(SECRET), 'no exception text is printed');
    assert.match(h.text(), /No retry was made/);
  }
});
