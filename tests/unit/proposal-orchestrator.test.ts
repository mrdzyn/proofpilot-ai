// C3-LIVE-01B0: the proposal orchestration, end to end with SYNTHETIC trust and SCRIPTED responses only. No provider, no network, no
// credential, no genuine approval. A global fetch trap fails the run if anything touches the network.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseSymptom, proposalJsonSchema } from '../../packages/core/src/index.ts';
import {
  buildProposalRequest, createProposalConsent, createProvider, createReservationStore, DECISION_ID, InferenceError, loadProviderConfig, META_PROPOSAL_MODEL, PROPOSAL_LABEL, PROPOSAL_LIMITS,
  PROPOSAL_SCHEMA_NAME, ProposalError, trustedFactsFromBaseline, type ReservationStore, type StructuredResponse,
} from '../../packages/inference/src/index.ts';
import { AuthorizationError, buildApprovalRecord, listStrandedApprovals, parseActivationPin, parseDecisionRegister, writeApprovalRecord, type GitProbe } from '../../packages/inference/src/live-approval.ts';
import { createInstallContext, createSyntheticContext, type TrustContext } from '../../packages/inference/src/live-gate-core.ts';
import { CrashSignal, runSyntheticProposalAttempt, scriptedTransport, type ProviderDescriptor, type ScriptedOutcome, type SyntheticStep } from '../../packages/inference/src/proposal-orchestrator.ts';
import { json, liveEnv, mockFetch, responsesOk, tempDir, validSymptom } from '../helpers.ts';

const realFetch = globalThis.fetch;
let trapped = 0;
before(() => {
  globalThis.fetch = (() => {
    trapped++;
    throw new Error('no network in the orchestration tests');
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
  assert.equal(trapped, 0);
});

const REAL_ROOT = path.resolve(import.meta.dirname, '../..');
const SHA = 'b'.repeat(40);
const DIGEST = 'e'.repeat(64);
const T0 = new Date('2026-10-30T10:00:00.000Z');
const PV1 = JSON.stringify({ adjustments: [{ selector: '.promo-overlay', property: 'pointer-events', value: 'none' }] });
const RAW_MARKER = 'RAW-MODEL-TEXT-MARKER-91f3';
const SECRET_IN_ERROR = 'sk-LEAKED-SECRET-7731abcd';
const symptom = parseSymptom(validSymptom(), { videoDurationSec: 10 });
const facts = trustedFactsFromBaseline({ viewport: { width: 390, height: 844 }, tapPoint: { x: 1, y: 1 }, hitTestTarget: 'promo-overlay', cartCountBefore: '0', cartCountAfter: '0' }, true);
const REGISTER = JSON.stringify({ schemaVersion: 1, decisions: [{ decisionId: DECISION_ID, status: 'APPROVED', provider: 'meta', model: META_PROPOSAL_MODEL, maxBillableAttempts: 1, maxInputChars: 12000, maxOutputTokens: 3072, approvedBy: 'SYNTHETIC', approvedAt: '2026-10-30T00:00:00.000Z', reference: 'synthetic test decision', synthetic: true }] });
const PIN = JSON.stringify({ schemaVersion: 1, activation: { decisionId: DECISION_ID, decisionReference: 'synthetic test decision', activationCommit: SHA, activationDigest: DIGEST, recordedBy: 'SYNTHETIC', recordedAt: '2026-10-30T00:00:00.000Z', reference: 'synthetic', synthetic: true } });

const okResponse = (over: Partial<Omit<StructuredResponse, 'lifecycle'>> & { lifecycle?: Partial<StructuredResponse['lifecycle']> } = {}): StructuredResponse => {
  const { lifecycle, ...rest } = over;
  return { providerId: 'mock', model: META_PROPOSAL_MODEL, text: PV1, requestId: 'mock-request', usage: { inputTokens: 1200, outputTokens: 300, totalTokens: 1500, reasoningTokens: 100, videoFramesProcessed: null }, lifecycle: { status: 'completed', errorCode: null, incompleteReason: null, refusal: false, completed: true, ...lifecycle }, ...rest };
};

function setup(o: { runId?: string; store?: (real: ReservationStore) => ReservationStore; liveQuota?: number } = {}) {
  const dir = tempDir();
  const runId = o.runId ?? 'run-1';
  const request = buildProposalRequest({ symptom, facts });
  const clock = { t: T0 };
  const probe: GitProbe = { head: async () => SHA, clean: async () => true, treeDigest: async () => DIGEST, pinOnlyDescent: async () => ({ ok: true }) };
  const approvalsDir = path.join(dir, '.proofpilot', 'approvals');
  const reservationsRoot = path.join(dir, '.proofpilot', 'reservations');
  const real = createReservationStore(reservationsRoot);
  const register = parseDecisionRegister(REGISTER);
  const ctx: TrustContext = createSyntheticContext({ register, pin: parseActivationPin(PIN), git: probe, approvalsDir, reservationsRoot, liveQuota: o.liveQuota ?? 1, store: o.store ? o.store(real) : real });
  const provider: ProviderDescriptor = { id: 'meta', models: { visual: META_PROPOSAL_MODEL }, billableCallsAllowed: true };
  const evidenceRoot = path.join(dir, 'evidence');
  const approve = (id = runId) => writeApprovalRecord(approvalsDir, buildApprovalRecord({ runId: id, repoSha: SHA, activation: { commit: SHA, digest: DIGEST }, inputSha256: request.inputSha256, inputChars: request.prompt.length, register, declaredBy: 'tester', now: T0, synthetic: true }));
  const run = (outcomes: ScriptedOutcome[], over: Partial<Parameters<typeof runSyntheticProposalAttempt>[0]> = {}) => {
    const transport = scriptedTransport(outcomes);
    const attempt = { ctx, transport, provider, runId, consent: createProposalConsent({ runId, providerId: 'meta', inputSha256: request.inputSha256, now: () => T0 }), request, evidenceRoot, now: () => clock.t, ...over };
    return { transport, promise: runSyntheticProposalAttempt(attempt) };
  };
  const runFile = (id = runId) => path.join(reservationsRoot, 'meta', 'runs', `${id}.json`);
  const marker = (id = runId) => path.join(approvalsDir, `${id}.consumed`);
  const artifactFile = (id = runId) => path.join(evidenceRoot, 'proposals', id, 'proposal.json');
  return { dir, runId, request, clock, ctx, provider, approvalsDir, reservationsRoot, evidenceRoot, approve, run, runFile, marker, artifactFile, real };
}
const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'NO_ERROR';
  } catch (e) {
    return e instanceof AuthorizationError ? e.code : e instanceof ProposalError ? `P:${e.code}` : e instanceof CrashSignal ? 'CRASH' : `OTHER:${(e as Error).message}`;
  }
};
const status = (file: string) => JSON.parse(readFileSync(file, 'utf8')).status as string;

// ------------------------------------------------------------ the happy path and the request contract

test('a completed, schema-valid synthetic response ends as a sanitized UNTRUSTED proposal artifact, one request, then STOP', async () => {
  const w = setup();
  await w.approve();
  const { transport, promise } = w.run([okResponse()]);
  const out = await promise;
  assert.equal(out.label, 'UNTRUSTED PROPOSAL — NOT VERIFIED');
  assert.equal(out.artifact.label, PROPOSAL_LABEL);
  assert.equal(out.artifact.provenance, 'model-hypothesis');
  assert.equal(out.status, 'PROPOSAL_ACCEPTED');
  assert.deepEqual(out.adjustments, [{ selector: '.promo-overlay', property: 'pointer-events', value: 'none' }]);
  assert.equal(out.artifact.renderedCss, '.promo-overlay{pointer-events:none}\n');
  assert.equal(out.synthetic, true);
  assert.equal(out.settled, true);
  // exactly one request, with exactly the contracted shape
  assert.equal(transport.calls.length, 1);
  const req = transport.calls[0]!;
  assert.deepEqual(Object.keys(req).sort(), ['maxOutputTokens', 'model', 'prompt', 'schema', 'schemaName']);
  assert.equal(req.model, 'muse-spark-1.3');
  assert.equal(req.maxOutputTokens, 3072);
  assert.equal(req.schemaName, PROPOSAL_SCHEMA_NAME);
  assert.deepEqual(req.schema, proposalJsonSchema());
  assert.equal(req.prompt, w.request.prompt);
  assert.ok(req.prompt.length <= 12_000);
  // evidence: private artifact, settled reservation, spent approval
  assert.equal(statSync(w.artifactFile()).mode & 0o777, 0o600);
  const saved = JSON.parse(readFileSync(w.artifactFile(), 'utf8'));
  assert.deepEqual(Object.keys(saved).sort(), ['adjustments', 'createdAt', 'forbiddenClass', 'inputSha256', 'label', 'lifecycle', 'limits', 'outputBytes', 'outputSha256', 'provenance', 'providerId', 'reason', 'renderedCss', 'requestId', 'requestedModel', 'respondedModel', 'runId', 'schemaVersion', 'slot', 'status', 'usage'], 'only the sanitized, allow-listed fields are persisted');
  assert.equal(saved.label, PROPOSAL_LABEL);
  assert.equal(saved.requestedModel, 'muse-spark-1.3');
  assert.equal(saved.respondedModel, 'muse-spark-1.3');
  assert.equal(saved.inputSha256, w.request.inputSha256);
  assert.match(saved.outputSha256, /^[0-9a-f]{64}$/);
  assert.equal(saved.requestId, 'mock-request');
  assert.equal(saved.usage.outputTokens, 300);
  assert.equal(saved.lifecycle.status, 'completed');
  assert.equal(status(w.runFile()), 'PROPOSAL_ACCEPTED');
  assert.ok(existsSync(w.marker()));
  // a second attempt, even with a fresh transport, is impossible
  const again = w.run([okResponse()]);
  assert.equal(await codeOf(again.promise), 'APPROVAL_SPENT');
  assert.equal(again.transport.calls.length, 0);
  // no verdict value exists anywhere in the outcome
  assert.doesNotMatch(JSON.stringify(out), /(?<!NOT )VERIFIED|PATCH_FAILED|ORACLE_PASS/);
});

test('every response outcome is classified, spends the attempt, makes exactly one request and stores no raw text', async () => {
  const rows: Array<[string, ScriptedOutcome, string, string | null]> = [
    ['incomplete', okResponse({ text: RAW_MARKER, lifecycle: { status: 'incomplete', incompleteReason: 'max_output_tokens', completed: false } }), 'PROPOSAL_FAILED', 'RESPONSE_NOT_COMPLETED'],
    ['refusal', okResponse({ text: RAW_MARKER, lifecycle: { refusal: true, completed: false } }), 'PROPOSAL_FAILED', 'RESPONSE_NOT_COMPLETED'],
    ['missing lifecycle status', okResponse({ text: RAW_MARKER, lifecycle: { status: null } }), 'PROPOSAL_FAILED', 'RESPONSE_NOT_COMPLETED'],
    ['provider error status', okResponse({ text: RAW_MARKER, lifecycle: { status: 'failed', errorCode: 'server_error', completed: false } }), 'PROPOSAL_FAILED', 'RESPONSE_NOT_COMPLETED'],
    ['wrong response model', okResponse({ model: 'muse-spark-1.3-preview', text: RAW_MARKER }), 'PROPOSAL_FAILED', 'MODEL_MISMATCH'],
    ['empty output', okResponse({ text: '' }), 'PROPOSAL_FAILED', 'EMPTY_OUTPUT'],
    ['malformed JSON', okResponse({ text: `{"adjustments":[ "${RAW_MARKER}` }), 'PROPOSAL_REJECTED', 'MALFORMED_JSON'],
    ['forbidden content', okResponse({ text: `{"adjustments":[],"path":"verifier/x","note":"${RAW_MARKER}"}` }), 'PROPOSAL_BLOCKED', 'FORBIDDEN_CONTENT'],
    ['out-of-grammar CSS', okResponse({ text: '{"adjustments":[{"selector":"body","property":"display","value":"none"}]}' }), 'PROPOSAL_REJECTED', 'UNKNOWN_SELECTOR'],
    ['unknown key', okResponse({ text: `{"adjustments":[],"${RAW_MARKER}":1}` }), 'PROPOSAL_REJECTED', null],
    ['timeout', new InferenceError('TIMEOUT', 'meta', `request timed out ${SECRET_IN_ERROR}`), 'PROPOSAL_FAILED', 'PROVIDER_TIMEOUT'],
    ['transport error', new InferenceError('NETWORK', 'meta', `connection reset ${SECRET_IN_ERROR}`), 'PROPOSAL_FAILED', 'PROVIDER_NETWORK'],
    ['unexpected exception', new Error(`boom ${SECRET_IN_ERROR} Bearer abc.def.ghi`), 'PROPOSAL_FAILED', 'UNEXPECTED_ERROR'],
  ];
  for (const [name, outcome, expectedStatus, expectedReason] of rows) {
    const w = setup();
    await w.approve();
    const { transport, promise } = w.run([outcome, okResponse()]); // a second (valid) outcome must never be used: no retry, no fallback
    const out = await promise;
    assert.equal(out.status, expectedStatus, name);
    if (expectedReason !== null) assert.equal(out.reason, expectedReason, name);
    assert.equal(out.adjustments, null, name);
    assert.equal(out.label, 'UNTRUSTED PROPOSAL — NOT VERIFIED', name);
    assert.equal(transport.calls.length, 1, `${name}: exactly one request, no retry or fallback`);
    assert.equal(status(w.runFile()), expectedStatus, `${name}: settled`);
    assert.ok(existsSync(w.marker()), `${name}: the approval is spent`);
    const text = readFileSync(w.artifactFile(), 'utf8') + readFileSync(w.runFile(), 'utf8');
    assert.ok(!text.includes(RAW_MARKER), `${name}: raw provider text must not be stored`);
    assert.ok(!text.includes(SECRET_IN_ERROR) && !/Bearer/.test(text), `${name}: exception text must not be stored`);
    const again = w.run([okResponse()]);
    assert.notEqual(await codeOf(again.promise), 'NO_ERROR', `${name}: no second attempt`);
    assert.equal(again.transport.calls.length, 0, name);
  }
});

test('the request contract matches the real Meta adapter: strict json_schema, low reasoning, 3072 tokens, no tools, one call, no retry (mock fetch only)', async () => {
  const m = mockFetch([json({ error: { message: 'server' } }, 500)]);
  const provider = createProvider(loadProviderConfig('meta', liveEnv({ PROOFPILOT_INFERENCE_MAX_RETRIES: '2' })), { fetch: m.fetch });
  const w = setup();
  const req = { model: META_PROPOSAL_MODEL, prompt: w.request.prompt, schemaName: PROPOSAL_SCHEMA_NAME, schema: proposalJsonSchema(), maxOutputTokens: PROPOSAL_LIMITS.maxOutputTokens };
  await assert.rejects(provider.structuredResponse(req), InferenceError);
  assert.equal(m.calls.length, 1, 'a 500 with retries configured still sends exactly one request');
  const body = JSON.parse(String(m.calls[0]!.init.body));
  assert.equal(body.model, 'muse-spark-1.3');
  assert.deepEqual(body.reasoning, { effort: 'low' });
  assert.equal(body.max_output_tokens, 3072);
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal(body.text.format.strict, true);
  assert.equal(body.tools, undefined);
  assert.equal(body.stream, undefined);
  assert.ok(!JSON.stringify(body).includes('input_file') && !JSON.stringify(body).includes('input_video'), 'text only');
  assert.equal(new URL(m.calls[0]!.url).host, 'api.meta.ai');
  // and a response produced by that adapter flows through the orchestrator
  const ok = mockFetch([responsesOk(PV1, { status: 'completed' })]);
  const adapter = createProvider(loadProviderConfig('meta', liveEnv()), { fetch: ok.fetch });
  const res = await adapter.structuredResponse(req);
  const w2 = setup();
  await w2.approve();
  const out = await w2.run([res]).promise;
  assert.equal(out.status, 'PROPOSAL_ACCEPTED');
  assert.equal(ok.calls.length, 1);
});

// ------------------------------------------------------------ persistence, settlement, crashes

test('an artifact persistence failure fails the attempt (adjustments dropped), keeps the slot spent and still settles', async () => {
  const w = setup();
  await w.approve();
  writeFileSync(path.join(w.dir, 'a-file'), 'x');
  const out = await w.run([okResponse()], { evidenceRoot: path.join(w.dir, 'a-file', 'under-a-file') }).promise;
  assert.equal(out.status, 'PROPOSAL_FAILED');
  assert.equal(out.reason, 'ARTIFACT_WRITE_FAILED');
  assert.equal(out.adjustments, null);
  assert.equal(out.artifactPath, null);
  assert.equal(out.artifact.renderedCss, null);
  assert.equal(out.artifact.adjustments, null, 'the in-memory artifact no longer carries the accepted adjustments either');
  assert.equal(status(w.runFile()), 'PROPOSAL_FAILED');
  assert.ok(existsSync(w.marker()));
});

test('a settlement failure (false or thrown) leaves the claim spent as CLAIMED and the approval consumed; nothing is released', async () => {
  for (const mode of ['false', 'throws'] as const) {
    const w = setup({ store: (real) => ({ claim: real.claim, settle: async () => { if (mode === 'throws') throw new Error(`disk ${SECRET_IN_ERROR}`); return false; } }) });
    await w.approve();
    const out = await w.run([okResponse()]).promise;
    assert.equal(out.settled, false, mode);
    assert.equal(out.status, 'PROPOSAL_ACCEPTED', 'the artifact was already recorded');
    assert.ok(existsSync(w.artifactFile()));
    assert.equal(status(w.runFile()), 'CLAIMED', mode);
    assert.ok(existsSync(w.marker()));
    assert.equal(await codeOf(w.run([okResponse()]).promise), 'APPROVAL_SPENT');
    await w.approve('run-2'); // a new approval cannot reuse the only slot either
    assert.equal(await codeOf(w.run([okResponse()], { runId: 'run-2', consent: createProposalConsent({ runId: 'run-2', providerId: 'meta', inputSha256: w.request.inputSha256 }) }).promise), 'QUOTA_EXHAUSTED');
  }
});

test('crashes and uncertain completion: the attempt stays spent at every boundary and is never replayed or retried', async () => {
  // process dies before anything is spent: the approval is still valid
  const early = setup();
  await early.approve();
  const e1 = early.run([okResponse()], { onStep: (s: SyntheticStep) => { if (s === 'after-preflight') throw new Error('died'); } });
  assert.match(await codeOf(e1.promise), /OTHER:died/);
  assert.equal(e1.transport.calls.length, 0);
  assert.equal(existsSync(early.marker()), false, 'nothing was consumed');
  assert.equal(existsSync(early.runFile()), false);
  assert.equal((await early.run([okResponse()]).promise).status, 'PROPOSAL_ACCEPTED', 'safe to run: nothing had been spent');

  // dies right after the claim, before any request
  const afterPrepare = setup();
  await afterPrepare.approve();
  const e2 = afterPrepare.run([okResponse()], { onStep: (s) => { if (s === 'after-prepare') throw new Error('died'); } });
  assert.match(await codeOf(e2.promise), /OTHER:died/);
  assert.equal(e2.transport.calls.length, 0);
  assert.equal(status(afterPrepare.runFile()), 'CLAIMED');
  assert.ok(existsSync(afterPrepare.marker()));
  assert.equal(await codeOf(afterPrepare.run([okResponse()]).promise), 'APPROVAL_SPENT');
  assert.deepEqual(await listStrandedApprovals(afterPrepare.approvalsDir, afterPrepare.reservationsRoot), [], 'claimed, so not stranded');

  // dies during the call (uncertain completion): no artifact, no settlement, still spent
  const during = setup();
  await during.approve();
  const e3 = during.run([{ crash: true }, okResponse()]);
  assert.equal(await codeOf(e3.promise), 'CRASH');
  assert.equal(e3.transport.calls.length, 1);
  assert.equal(existsSync(during.artifactFile()), false);
  assert.equal(status(during.runFile()), 'CLAIMED');
  assert.equal(await codeOf(during.run([okResponse()]).promise), 'APPROVAL_SPENT');

  // dies after the response, before it is recorded / after it is recorded but before settlement
  for (const step of ['after-call', 'after-persist'] as const) {
    const w = setup();
    await w.approve();
    const e = w.run([okResponse()], { onStep: (s) => { if (s === step) throw new Error('died'); } });
    assert.match(await codeOf(e.promise), /OTHER:died/);
    assert.equal(e.transport.calls.length, 1, step);
    assert.equal(existsSync(w.artifactFile()), step === 'after-persist', step);
    assert.equal(status(w.runFile()), 'CLAIMED', step);
    assert.equal(await codeOf(w.run([okResponse()]).promise), 'APPROVAL_SPENT', step);
  }

  // dies after consuming the approval but before the claim: stranded, listed read-only, the run id can be neither re-approved nor reused
  const w = setup({ store: () => ({ claim: async () => { throw new Error('died before claim'); }, settle: async () => true }) });
  await w.approve();
  const e = w.run([okResponse()]);
  assert.equal(await codeOf(e.promise), 'INTERNAL');
  assert.equal(e.transport.calls.length, 0);
  assert.ok(existsSync(w.marker()));
  assert.deepEqual(await listStrandedApprovals(w.approvalsDir, w.reservationsRoot), ['run-1']);
  assert.equal(await codeOf(w.approve()), 'APPROVAL_DUPLICATE');
});

// ------------------------------------------------------------ authorization order and fail-closed behaviour

test('authorization failures make no request, spend no slot and (before consumption) leave the approval unspent', async () => {
  // duplicate run id
  const dup = setup();
  await dup.approve();
  await dup.real.claim({ providerId: 'meta', runId: 'run-1', quota: 1 });
  const d = dup.run([okResponse()]);
  assert.equal(await codeOf(d.promise), 'RESERVATION_SPENT');
  assert.equal(d.transport.calls.length, 0);
  assert.equal(existsSync(dup.marker()), false);
  // quota exhausted by another run
  const q = setup();
  await q.approve();
  await q.real.claim({ providerId: 'meta', runId: 'other', quota: 1 });
  const qq = q.run([okResponse()]);
  assert.equal(await codeOf(qq.promise), 'QUOTA_EXHAUSTED');
  assert.equal(qq.transport.calls.length, 0);
  // zero quota
  const z = setup({ liveQuota: 0 });
  await z.approve();
  assert.equal(await codeOf(z.run([okResponse()]).promise), 'QUOTA_ZERO');
  // expired approval
  const x = setup();
  await x.approve();
  x.clock.t = new Date(T0.getTime() + 11 * 60_000);
  const xx = x.run([okResponse()]);
  assert.equal(await codeOf(xx.promise), 'APPROVAL_EXPIRED');
  assert.equal(xx.transport.calls.length, 0);
  // missing approval
  const m = setup();
  const mm = m.run([okResponse()]);
  assert.equal(await codeOf(mm.promise), 'APPROVAL_MISSING');
  assert.equal(mm.transport.calls.length, 0);
  // approval for another input
  const o = setup();
  await writeApprovalRecord(o.approvalsDir, buildApprovalRecord({ runId: 'run-1', repoSha: SHA, activation: { commit: SHA, digest: DIGEST }, inputSha256: 'd'.repeat(64), inputChars: o.request.prompt.length, register: o.ctx.register, declaredBy: 'tester', now: T0, synthetic: true }));
  assert.equal(await codeOf(o.run([okResponse()]).promise), 'INPUT_MISMATCH');
});

test('pure pre-flight refusals happen BEFORE any approval is consumed or reservation made', async () => {
  const cases: Array<[string, (w: ReturnType<typeof setup>) => Partial<Parameters<typeof runSyntheticProposalAttempt>[0]>, string]> = [
    ['missing consent', () => ({ consent: undefined as never }), 'P:CONSENT_MISSING'],
    ['foreign consent', (w) => ({ consent: createProposalConsent({ runId: 'other-run', providerId: 'meta', inputSha256: w.request.inputSha256 }) }), 'P:CONSENT_MISMATCH'],
    ['model mismatch', (w) => ({ provider: { ...w.provider, models: { visual: 'muse-spark-1.2' } } }), 'P:MODEL_NOT_ALLOWED'],
    ['billable gate off', (w) => ({ provider: { ...w.provider, billableCallsAllowed: false } }), 'P:BILLABLE_NOT_AUTHORIZED'],
    ['tampered request', (w) => ({ request: { ...w.request, prompt: `${w.request.prompt} x` } }), 'P:INVALID_INPUT'],
    ['malformed run id', () => ({ runId: '../evil' }), 'P:INVALID_INPUT'],
  ];
  for (const [name, over, expected] of cases) {
    const w = setup();
    await w.approve();
    const r = w.run([okResponse()], over(w));
    assert.equal(await codeOf(r.promise), expected, name);
    assert.equal(r.transport.calls.length, 0, name);
    assert.equal(existsSync(w.marker()), false, `${name}: approval not consumed`);
    assert.equal(existsSync(path.join(w.reservationsRoot, 'meta')), false, `${name}: nothing reserved`);
  }
});

test('synthetic authorization cannot be promoted: production contexts and non-scripted transports are refused before anything happens', async () => {
  const w = setup();
  await w.approve();
  const prod = await createInstallContext(REAL_ROOT, 1); // a simulated positive quota against the real, empty register
  const a = w.run([okResponse()], { ctx: prod });
  assert.equal(await codeOf(a.promise), 'P:LIVE_NOT_APPROVED');
  assert.equal(a.transport.calls.length, 0);
  // a look-alike transport (plain object, spread copy, function) is not a scripted transport
  let called = 0;
  const lookalike = { kind: 'scripted' as const, calls: [], call: async () => { called++; return okResponse(); } };
  for (const t of [lookalike, { ...scriptedTransport([okResponse()]) }, Object.create(scriptedTransport([okResponse()])), undefined, null]) {
    assert.equal(await codeOf(runSyntheticProposalAttempt({ ctx: w.ctx, transport: t as never, provider: w.provider, runId: 'run-1', consent: createProposalConsent({ runId: 'run-1', providerId: 'meta', inputSha256: w.request.inputSha256 }), request: w.request, evidenceRoot: w.evidenceRoot })), 'P:LIVE_NOT_APPROVED');
  }
  assert.equal(called, 0);
  assert.equal(existsSync(w.marker()), false, 'the approval was never touched');
  // the same approval still works afterwards with the proper scripted transport
  assert.equal((await w.run([okResponse()]).promise).status, 'PROPOSAL_ACCEPTED');
  // anything authorized through this runner is flagged synthetic
  assert.equal((await setupAndRun()).synthetic, true);
});
async function setupAndRun() {
  const w = setup();
  await w.approve();
  return w.run([okResponse()]).promise;
}

test('a private-permission regression: the artifact directory and file are not world-readable', async () => {
  const w = setup();
  await w.approve();
  await w.run([okResponse()]).promise;
  assert.equal(statSync(path.dirname(w.artifactFile())).mode & 0o077, 0);
  assert.equal(statSync(w.artifactFile()).mode & 0o077, 0);
});
