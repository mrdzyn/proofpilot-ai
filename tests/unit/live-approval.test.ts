// C3-LIVE-01A: operator approval records, the fail-closed authorization validator, single-use consumption, the interactive
// CLI logic and the synthetic rehearsal. Everything is mock/synthetic: no provider, no network, no real authorization.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, linkSync, mkdirSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseSymptom } from '../../packages/core/src/index.ts';
import {
  APPROVAL_TTL_MS, AuthorizationError, authorizeProductionAttempt, buildProposalRequest, createReservationStore, DECISION_ID, LIVE_LIMITS, META_PROPOSAL_MODEL, prepareProductionAttempt,
  ReservationError, runActivationRehearsal, runProductionApprovalCli, trustedFactsFromBaseline, type ReservationStore,
} from '../../packages/inference/src/index.ts';
import { buildApprovalRecord, consumeApproval, digestOf, ensureApprovalsDir, listStrandedApprovals, parseActivationPin, parseDecisionRegister, readApprovalRecord, writeApprovalRecord, type GitProbe } from '../../packages/inference/src/live-approval.ts';
import { confirmationPhrase, runApprovalCli, type ApprovalIo } from '../../packages/inference/src/approval-cli.ts';
import { createInstallContext, createSyntheticContext, evaluateAuthorizationCore, prepareAttemptCore, type AuthorizeRequest, type TrustContext } from '../../packages/inference/src/live-gate-core.ts';
import { activationDigestOf } from '../../packages/inference/src/git-probe.ts';
import { tempDir, validSymptom } from '../helpers.ts';

const realFetch = globalThis.fetch;
let trapped = 0;
before(() => {
  globalThis.fetch = (() => {
    trapped++;
    throw new Error('no network in the approval tests');
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
  assert.equal(trapped, 0);
});

const repoRoot = path.resolve(import.meta.dirname, '../..');
const SHA = 'b'.repeat(40);
const T0 = new Date('2026-10-30T10:00:00.000Z');
const symptom = parseSymptom(validSymptom(), { videoDurationSec: 10 });
const facts = trustedFactsFromBaseline({ viewport: { width: 390, height: 844 }, tapPoint: { x: 1, y: 1 }, hitTestTarget: 'promo-overlay', cartCountBefore: '0', cartCountAfter: '0' }, true);
const SYNTH_REGISTER_TEXT = JSON.stringify({ schemaVersion: 1, decisions: [{ decisionId: DECISION_ID, status: 'APPROVED', provider: 'meta', model: META_PROPOSAL_MODEL, maxBillableAttempts: 1, maxInputChars: 12000, maxOutputTokens: 3072, approvedBy: 'SYNTHETIC', approvedAt: '2026-10-30T00:00:00.000Z', reference: 'synthetic test decision', synthetic: true }] });

const HEAD_DIGEST = 'e'.repeat(64);
const SYNTH_PIN_TEXT = JSON.stringify({ schemaVersion: 1, activation: { decisionId: DECISION_ID, decisionReference: 'synthetic test decision', activationCommit: SHA, activationDigest: HEAD_DIGEST, recordedBy: 'SYNTHETIC', recordedAt: '2026-10-30T00:00:00.000Z', reference: 'synthetic', synthetic: true } });

function world(over: { runId?: string; ttlMs?: number; clock?: { t: Date } } = {}) {
  const dir = tempDir();
  const clock = over.clock ?? { t: T0 };
  const runId = over.runId ?? 'run-1';
  const request = buildProposalRequest({ symptom, facts });
  const register = parseDecisionRegister(SYNTH_REGISTER_TEXT);
  const pin = parseActivationPin(SYNTH_PIN_TEXT);
  const git = { head: SHA, clean: true, fail: false, headDigest: HEAD_DIGEST, pinDigest: HEAD_DIGEST };
  const probe: GitProbe = {
    head: async () => (git.fail ? Promise.reject(new Error('no git')) : git.head),
    clean: async () => git.clean,
    treeDigest: async (rev) => (git.fail ? Promise.reject(new Error('no git')) : rev === 'HEAD' ? git.headDigest : git.pinDigest),
  };
  const approvalsDir = path.join(dir, '.proofpilot', 'approvals');
  const reservationsRoot = path.join(dir, '.proofpilot', 'reservations');
  const input: AuthorizeRequest = { runId, request, provider: { id: 'meta', models: { visual: META_PROPOSAL_MODEL } }, maxOutputTokens: LIVE_LIMITS.maxOutputTokens, now: () => clock.t };
  const injected = { register, pin, liveQuota: 1 };
  const store = createReservationStore(reservationsRoot);
  const ctx = (s: ReservationStore = store): TrustContext => createSyntheticContext({ register: injected.register, pin: injected.pin, git: probe, approvalsDir, reservationsRoot, liveQuota: injected.liveQuota, store: s });
  const evaluate = (mode?: { afterConsume?: boolean }, o: Partial<AuthorizeRequest> = {}) => evaluateAuthorizationCore(ctx(), { ...input, ...o }, mode);
  const prepare = (s?: ReservationStore, o: Partial<AuthorizeRequest> = {}) => prepareAttemptCore(ctx(s), { ...input, ...o });
  const record = (o: Partial<Parameters<typeof buildApprovalRecord>[0]> = {}) =>
    buildApprovalRecord({ runId, repoSha: SHA, activation: { commit: SHA, digest: HEAD_DIGEST }, inputSha256: request.inputSha256, inputChars: request.prompt.length, register: injected.register, declaredBy: 'tester', now: T0, ttlMs: over.ttlMs, synthetic: true, ...o });
  const approve = (o: Partial<Parameters<typeof buildApprovalRecord>[0]> = {}) => writeApprovalRecord(approvalsDir, record(o));
  return { dir, clock, runId, request, register, git, probe, input, injected, store, approvalsDir, reservationsRoot, ctx, evaluate, prepare, record, approve };
}
const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'NO_ERROR';
  } catch (e) {
    return e instanceof AuthorizationError ? e.code : e instanceof ReservationError ? `R:${e.code}` : `OTHER:${(e as Error).message}`;
  }
};
const resetRecord = (w: ReturnType<typeof world>, edit: (r: Record<string, any>) => void, redigest = false) => {
  const file = path.join(w.approvalsDir, `${w.runId}.json`);
  const r = JSON.parse(readFileSync(file, 'utf8'));
  edit(r);
  if (redigest) r.recordSha256 = digestOf(r);
  chmodSync(file, 0o600);
  writeFileSync(file, JSON.stringify(r));
  chmodSync(file, 0o600);
};

// ------------------------------------------------------------ happy path and single use

test('a valid synthetic approval authorizes exactly one attempt: authorize, consume, claim; the second use is refused', async () => {
  const w = world();
  await w.approve();
  const p = await w.prepare();
  assert.equal(p.authorized.runId, 'run-1');
  assert.equal(p.claim.slot, 1);
  assert.equal(Object.isFrozen(p.authorized), true);
  assert.ok(existsSync(path.join(w.approvalsDir, 'run-1.consumed')));
  assert.equal(await codeOf(w.prepare()), 'APPROVAL_SPENT', 'replaying the same approval');
  assert.equal(await codeOf(w.evaluate()), 'APPROVAL_SPENT');
});

test('createProposalConsent-style consent is not an approval: with no operator record nothing is authorized', async () => {
  const w = world();
  assert.equal(await codeOf(w.evaluate()), 'APPROVAL_MISSING');
});

// ------------------------------------------------------------ refusals

test('every mismatch fails closed with its own reason', async () => {
  const cases: Array<[string, string, (w: ReturnType<typeof world>) => Promise<void> | void]> = [
    ['expired', 'APPROVAL_EXPIRED', (w) => { w.clock.t = new Date(T0.getTime() + APPROVAL_TTL_MS.default + 1); }],
    ['future-dated', 'APPROVAL_MALFORMED', (w) => { w.clock.t = new Date(T0.getTime() - 5 * 60_000); }],
    ['wrong provider', 'PROVIDER_NOT_ALLOWED', (w) => { (w.input.provider as { id: string }).id = 'baseten'; }],
    ['wrong model', 'MODEL_NOT_ALLOWED', (w) => { (w.input.provider.models as { visual: string }).visual = 'muse-spark-1.2'; }],
    ['alias model', 'MODEL_NOT_ALLOWED', (w) => { (w.input.provider.models as { visual: string }).visual = 'muse-spark-1.3-preview'; }],
    ['other input', 'INPUT_MISMATCH', (w) => { w.input.request = buildProposalRequest({ symptom: { ...symptom, summary: 'A different symptom.' }, facts }); }],
    ['tampered request', 'INPUT_MISMATCH', (w) => { w.input.request = { ...w.request, prompt: `${w.request.prompt} x` }; }],
    ['other revision', 'REPO_MISMATCH', (w) => { w.git.head = 'c'.repeat(40); }],
    ['dirty tree', 'TREE_DIRTY', (w) => { w.git.clean = false; }],
    ['git unavailable', 'GIT_UNAVAILABLE', (w) => { w.git.fail = true; }],
    ['output bound', 'BOUNDS', (w) => { w.input.maxOutputTokens = 3_073; }],
    ['zero output bound', 'BOUNDS', (w) => { w.input.maxOutputTokens = 0; }],
    ['quota zero', 'QUOTA_ZERO', (w) => { w.injected.liveQuota = 0; }],
    ['register changed', 'APPROVAL_MISMATCH', (w) => { w.injected.register = parseDecisionRegister(SYNTH_REGISTER_TEXT.replace('"approvedBy":"SYNTHETIC"', '"approvedBy":"SYNTHETIC-2"')); }],
    ['decision reference changed', 'ACTIVATION_MISMATCH', (w) => { w.injected.register = parseDecisionRegister(SYNTH_REGISTER_TEXT.replace('synthetic test decision', 'edited reference')); }],
    ['activation not pinned', 'ACTIVATION_NOT_PINNED', (w) => { w.injected.pin = parseActivationPin(JSON.stringify({ schemaVersion: 1, activation: null })); }],
    ['HEAD is not the pinned revision', 'REVISION_NOT_APPROVED', (w) => { w.git.headDigest = 'f'.repeat(64); }],
    ['pinned commit hashes differently', 'ACTIVATION_MISMATCH', (w) => { w.git.pinDigest = 'f'.repeat(64); }],
    ['spent run id', 'RESERVATION_SPENT', async (w) => { await w.store.claim({ providerId: 'meta', runId: w.runId, quota: 1 }); }],
    ['other run took the slot', 'QUOTA_EXHAUSTED', async (w) => { await w.store.claim({ providerId: 'meta', runId: 'someone-else', quota: 1 }); }],
    ['stale claim lock', 'LOCK_STALE', (w) => { mkdirSync(path.join(w.reservationsRoot, 'meta'), { recursive: true }); writeFileSync(path.join(w.reservationsRoot, 'meta', '.claim.lock'), ''); }],
  ];
  for (const [name, expected, mutate] of cases) {
    const w = world();
    await w.approve();
    await mutate(w);
    assert.equal(await codeOf(w.evaluate()), expected, name);
    assert.equal(existsSync(path.join(w.approvalsDir, 'run-1.consumed')), false, `${name}: a refused authorization must not consume the approval`);
  }
});

test('oversized input is refused; an undecided or non-approved register is LIVE_NOT_APPROVED', async () => {
  const w = world();
  const big = 'x'.repeat(12_001);
  const { createHash } = await import('node:crypto');
  w.input.request = { fixtureId: 'F01', prompt: big, inputSha256: createHash('sha256').update(big).digest('hex'), chars: big.length };
  await w.approve({ inputSha256: w.input.request.inputSha256, inputChars: 12_000 });
  assert.equal(await codeOf(w.evaluate()), 'BOUNDS');
  const w2 = world();
  await w2.approve();
  for (const text of [JSON.stringify({ schemaVersion: 1, decisions: [] }), SYNTH_REGISTER_TEXT.replace('"APPROVED"', '"PROPOSED"')]) {
    w2.injected.register = parseDecisionRegister(text);
    assert.equal(await codeOf(w2.evaluate()), 'LIVE_NOT_APPROVED');
  }
  for (const [needle, value] of [['"provider":"meta"', '"provider":"baseten"'], ['"muse-spark-1.3"', '"muse-spark-1.2"'], ['"maxBillableAttempts":1', '"maxBillableAttempts":2'], ['"maxOutputTokens":3072', '"maxOutputTokens":9999'], ['"maxInputChars":12000', '"maxInputChars":99999']] as const) {
    w2.injected.register = parseDecisionRegister(SYNTH_REGISTER_TEXT.replace(needle, value));
    assert.equal(await codeOf(w2.evaluate()), 'LIVE_NOT_APPROVED', value);
  }
  assert.equal(await codeOf(Promise.resolve().then(() => parseDecisionRegister('{not json'))), 'REGISTER_INVALID');
  assert.equal(await codeOf(Promise.resolve().then(() => parseDecisionRegister(JSON.stringify({ schemaVersion: 1, decisions: [], extra: 1 })))), 'REGISTER_INVALID');
});

test('forged, modified, malformed, over-long and unbound approval records are refused', async () => {
  const edits: Array<[string, string, (r: Record<string, any>) => void, boolean]> = [
    ['edited field, stale digest', 'APPROVAL_MODIFIED', (r) => { r.declaredBy = 'someone else'; }, false],
    ['edited expiry, stale digest', 'APPROVAL_MODIFIED', (r) => { r.expiresAt = '2027-01-01T00:00:00.000Z'; }, false],
    ['extra key', 'APPROVAL_MALFORMED', (r) => { r.extra = 1; }, true],
    ['missing key', 'APPROVAL_MALFORMED', (r) => { delete r.approvalId; }, true],
    ['wrong label', 'APPROVAL_MALFORMED', (r) => { r.label = 'AUTHENTICATED'; }, true],
    ['wrong provider, re-digested', 'APPROVAL_MALFORMED', (r) => { r.providerId = 'baseten'; }, true],
    ['wrong model, re-digested', 'APPROVAL_MALFORMED', (r) => { r.model = 'muse-spark-1.2'; }, true],
    ['lifetime over the maximum, re-digested', 'APPROVAL_MALFORMED', (r) => { r.expiresAt = new Date(T0.getTime() + 3_600_000).toISOString(); }, true],
    ['other run id, re-digested', 'APPROVAL_MISMATCH', (r) => { r.runId = 'run-2'; }, true],
    ['other input hash, re-digested', 'INPUT_MISMATCH', (r) => { r.inputSha256 = 'd'.repeat(64); }, true],
    ['raised bounds, re-digested', 'BOUNDS', (r) => { r.bounds.maxOutputTokens = 9999; }, true],
    ['not an object', 'APPROVAL_MALFORMED', () => undefined, true],
  ];
  for (const [name, expected, edit, redigest] of edits) {
    const w = world();
    await w.approve();
    if (name === 'not an object') writeFileSync(path.join(w.approvalsDir, 'run-1.json'), '[1]', { mode: 0o600 });
    else resetRecord(w, edit, redigest);
    assert.equal(await codeOf(w.evaluate()), expected, name);
  }
  const w = world();
  await w.approve();
  writeFileSync(path.join(w.approvalsDir, 'run-1.json'), '{broken', { mode: 0o600 });
  assert.equal(await codeOf(w.evaluate()), 'APPROVAL_MALFORMED');
});

test('a synthetic approval is flagged synthetic, and a non-synthetic record cannot ride on a synthetic decision', async () => {
  const w = world();
  await w.approve();
  assert.equal((await w.evaluate()).synthetic, true, 'anything authorized through a hand-built context is flagged synthetic');
  const w2 = world();
  await w2.approve({ synthetic: false });
  assert.equal(await codeOf(w2.evaluate()), 'APPROVAL_MISMATCH');
});

// ------------------------------------------------------------ private files

test('records are private, exclusive and tamper-evident: modes, duplicates, symlinks, hard links, traversal', async () => {
  const w = world();
  const file = await w.approve();
  assert.equal(statSync(w.approvalsDir).mode & 0o777, 0o700);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.deepEqual(readdirSync(w.approvalsDir), ['run-1.json'], 'no temp file is left behind');
  assert.equal(await codeOf(w.approve()), 'APPROVAL_DUPLICATE');
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).approvalId.length, 32, 'the first record is intact after the duplicate attempt');

  // loose file / directory permissions
  chmodSync(file, 0o644);
  assert.equal(await codeOf(readApprovalRecord(w.approvalsDir, 'run-1')), 'APPROVAL_UNSAFE_FILE');
  chmodSync(file, 0o600);
  chmodSync(w.approvalsDir, 0o755);
  assert.equal(await codeOf(readApprovalRecord(w.approvalsDir, 'run-1')), 'APPROVAL_UNSAFE_FILE');
  chmodSync(w.approvalsDir, 0o700);
  assert.equal((await readApprovalRecord(w.approvalsDir, 'run-1')).runId, 'run-1');

  // hard link and symlink replacement of the record
  linkSync(file, path.join(w.dir, 'alias.json'));
  assert.equal(await codeOf(readApprovalRecord(w.approvalsDir, 'run-1')), 'APPROVAL_UNSAFE_FILE', 'nlink > 1');
  const w2 = world({ runId: 'run-2' });
  await w2.approve();
  const real = path.join(w2.dir, 'elsewhere.json');
  writeFileSync(real, readFileSync(path.join(w2.approvalsDir, 'run-2.json')), { mode: 0o600 });
  const link = path.join(w2.approvalsDir, 'run-2.json');
  writeFileSync(path.join(w2.dir, 'x'), '');
  (await import('node:fs')).unlinkSync(link);
  symlinkSync(real, link);
  assert.equal(await codeOf(readApprovalRecord(w2.approvalsDir, 'run-2')), 'APPROVAL_UNSAFE_FILE', 'symlinked record');

  // a symlinked approvals directory
  const w3 = world();
  mkdirSync(path.join(w3.dir, 'target'), { mode: 0o700 });
  mkdirSync(path.join(w3.dir, '.proofpilot'), { recursive: true });
  symlinkSync(path.join(w3.dir, 'target'), w3.approvalsDir);
  assert.equal(await codeOf(w3.approve()), 'APPROVAL_UNSAFE_FILE');
  assert.deepEqual(readdirSync(path.join(w3.dir, 'target')), []);

  // traversal in the run id never reaches the filesystem
  for (const bad of ['../evil', 'a/b', '..', '.hidden', '', 'x'.repeat(65), 'a\u0000b']) {
    assert.equal(await codeOf(readApprovalRecord(w.approvalsDir, bad)), 'APPROVAL_MALFORMED', JSON.stringify(bad));
    assert.throws(() => w.record({ runId: bad }), AuthorizationError);
  }
});

test('records and markers hold no credential and no model output', async () => {
  const w = world();
  const file = await w.approve();
  await consumeApproval(w.approvalsDir, await w.evaluate(), () => T0);
  const text = readFileSync(file, 'utf8') + readFileSync(path.join(w.approvalsDir, 'run-1.consumed'), 'utf8');
  assert.doesNotMatch(text, /api[_-]?key|bearer|secret|password|PRIVATE KEY|MODEL_API_KEY|BASETEN/i);
  assert.doesNotMatch(text, /adjustments|pointer-events|prompt/);
});

// ------------------------------------------------------------ concurrency, crashes, TOCTOU

test('concurrent use of one approval: exactly one caller proceeds', async () => {
  const w = world();
  await w.approve();
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => w.prepare()));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  for (const r of results) if (r.status === 'rejected') assert.ok(r.reason instanceof AuthorizationError, String(r.reason));
  assert.equal(readdirSync(path.join(w.reservationsRoot, 'meta', 'slots')).length, 1, 'exactly one slot was spent');
});

test('a crash between approval validation and quota reservation spends the approval and nothing else', async () => {
  const w = world();
  await w.approve();
  const authorized = await w.evaluate();
  await consumeApproval(w.approvalsDir, authorized, () => T0); // ...process dies here
  assert.equal(await codeOf(w.prepare()), 'APPROVAL_SPENT');
  assert.deepEqual(await listStrandedApprovals(w.approvalsDir, w.reservationsRoot), ['run-1']);
  assert.equal(existsSync(path.join(w.reservationsRoot, 'meta', 'slots')), false, 'no slot was spent by the crash');
  assert.equal(await codeOf(w.approve()), 'APPROVAL_DUPLICATE', 'the run id cannot be re-approved');
  // a fresh run id needs a fresh approval and can still use the unspent slot
  const w2 = { ...w, runId: 'run-2', input: { ...w.input, runId: 'run-2' } };
  await writeApprovalRecord(w.approvalsDir, w.record({ runId: 'run-2' }));
  assert.equal((await w.prepare(undefined, { runId: 'run-2' })).claim.slot, 1);
});

test('consumption is itself exclusive, and a consumed run id can never be re-approved even if its record is gone', async () => {
  const w = world();
  await w.approve();
  const a = await w.evaluate();
  const results = await Promise.allSettled([consumeApproval(w.approvalsDir, a, () => T0), consumeApproval(w.approvalsDir, a, () => T0), consumeApproval(w.approvalsDir, a, () => T0)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1, 'exactly one consume wins');
  for (const r of results) if (r.status === 'rejected') assert.equal((r.reason as AuthorizationError).code, 'APPROVAL_SPENT');
  (await import('node:fs')).unlinkSync(path.join(w.approvalsDir, 'run-1.json'));
  assert.equal(await codeOf(w.approve()), 'APPROVAL_DUPLICATE');
});

test('a crash after the claim leaves a spent slot and a CLAIMED run; nothing can be replayed or recycled', async () => {
  const w = world();
  await w.approve();
  await w.prepare(); // ...process dies before the call/settlement
  assert.equal(await codeOf(w.prepare()), 'APPROVAL_SPENT');
  const run = JSON.parse(readFileSync(path.join(w.reservationsRoot, 'meta', 'runs', 'run-1.json'), 'utf8'));
  assert.equal(run.status, 'CLAIMED');
  assert.deepEqual(await listStrandedApprovals(w.approvalsDir, w.reservationsRoot), []);
  await writeApprovalRecord(w.approvalsDir, w.record({ runId: 'run-9' }));
  assert.equal(await codeOf(w.prepare(undefined, { runId: 'run-9' })), 'QUOTA_EXHAUSTED', 'the only slot stays spent');
});

test('a failure after consumption (lock taken between check and claim) fails closed and leaves the approval spent', async () => {
  const w = world();
  await w.approve();
  const racing: ReservationStore = { claim: async () => { throw new ReservationError('LOCK_UNAVAILABLE', 'held'); }, settle: async () => true };
  assert.equal(await codeOf(w.prepare(racing)), 'LOCK_STALE');
  assert.equal(await codeOf(w.prepare()), 'APPROVAL_SPENT');
  const w2 = world();
  await w2.approve();
  const broken: ReservationStore = { claim: async () => { throw new Error('disk'); }, settle: async () => true };
  assert.equal(await codeOf(w2.prepare(broken)), 'INTERNAL');
});

test('time-of-check/time-of-use: HEAD or expiry that changes after the first check is caught before any claim', async () => {
  const w = world();
  await w.approve();
  let calls = 0;
  w.probe.head = async () => (++calls > 1 ? 'c'.repeat(40) : SHA);
  assert.equal(await codeOf(w.prepare()), 'REPO_MISMATCH');
  assert.equal(existsSync(path.join(w.reservationsRoot, 'meta', 'runs')), false, 'nothing was claimed');

  const w2 = world();
  await w2.approve();
  let n = 0;
  w2.input.now = () => new Date(n++ < 2 ? T0.getTime() : T0.getTime() + APPROVAL_TTL_MS.default + 5);
  assert.equal(await codeOf(w2.prepare()), 'APPROVAL_EXPIRED');
  assert.equal(existsSync(path.join(w2.reservationsRoot, 'meta', 'runs')), false);

  // the consumption marker must be this approval's
  const w3 = world();
  await w3.approve();
  const a = await w3.evaluate();
  writeFileSync(path.join(w3.approvalsDir, 'run-1.consumed'), JSON.stringify({ approvalId: 'f'.repeat(32), recordSha256: a.recordSha256 }), { mode: 0o600 });
  assert.equal(await codeOf(w3.evaluate({ afterConsume: true })), 'APPROVAL_MISMATCH');
});

test('no automatic retry and no recycling: a failed attempt keeps its slot, so another run needs the quota raised again', async () => {
  const w = world();
  await w.approve();
  const p = await w.prepare();
  await w.store.settle(p.claim, { status: 'PROPOSAL_FAILED', reason: 'PROVIDER_TIMEOUT' });
  await writeApprovalRecord(w.approvalsDir, w.record({ runId: 'run-2' }));
  assert.equal(await codeOf(w.prepare(undefined, { runId: 'run-2' })), 'QUOTA_EXHAUSTED');
  assert.equal(LIVE_LIMITS.retries, 0);
  assert.equal(LIVE_LIMITS.maxBillableAttempts, 1);
});

// ------------------------------------------------------------ the interactive CLI

function terminal(answers: string[], tty = { in: true, out: true }) {
  const lines: string[] = [];
  const asked: string[] = [];
  const io: ApprovalIo = { stdinIsTTY: tty.in, stdoutIsTTY: tty.out, ask: async (q) => { asked.push(q); return answers.shift() ?? ''; }, print: (l) => lines.push(l) };
  return { io, lines, asked };
}
function cliWorld(over: { register?: ReturnType<typeof parseDecisionRegister>; liveQuota?: number } = {}) {
  const w = world();
  if (over.register) w.injected.register = over.register;
  if (over.liveQuota !== undefined) w.injected.liveQuota = over.liveQuota;
  const deps = (io: ApprovalIo) => ({ io, ctx: w.ctx(), now: () => T0 });
  const argv = ['--run-id', w.runId, '--input-sha256', w.request.inputSha256, '--input-chars', String(w.request.prompt.length)];
  return { w, deps, argv, phrase: confirmationPhrase(w.runId, w.request.inputSha256) };
}

test('CLI: non-interactive, piped or scripted invocations are refused and record nothing', async () => {
  process.env.PROOFPILOT_AUTO_APPROVE = '1'; // no environment flag may stand in for a person
  process.env.PROOFPILOT_ALLOW_BILLABLE_CALLS = '1';
  try {
    for (const tty of [{ in: false, out: true }, { in: true, out: false }, { in: false, out: false }]) {
      const c = cliWorld();
      const t = terminal(['me', c.phrase], tty);
      assert.equal(await runApprovalCli(c.argv, c.deps(t.io)), 2);
      assert.equal(t.asked.length, 0, 'no question was even asked');
      assert.equal(existsSync(c.w.approvalsDir), false);
    }
  } finally {
    delete process.env.PROOFPILOT_AUTO_APPROVE;
    delete process.env.PROOFPILOT_ALLOW_BILLABLE_CALLS;
  }
});

test('CLI: it shows the exact operation and records only after the exact confirmation phrase', async () => {
  const c = cliWorld();
  const t = terminal(['Test Operator', c.phrase]);
  assert.equal(await runApprovalCli(c.argv, c.deps(t.io)), 0);
  const shown = t.lines.join('\n');
  for (const needle of ['Meta Model API / muse-spark-1.3', 'run-1', c.w.request.inputSha256, SHA, '3072 tokens including reasoning', '0 retries', 'no fallback', '10 minutes', 'text only', 'does not authenticate', 'permanently spends']) assert.ok(shown.includes(needle) || shown.toLowerCase().includes(needle.toLowerCase()), needle);
  const rec = await readApprovalRecord(c.w.approvalsDir, 'run-1');
  assert.equal(rec.declaredBy, 'Test Operator');
  assert.equal(rec.label, 'SELF-DECLARED OPERATOR APPROVAL — NOT AUTHENTICATED IDENTITY');
  assert.equal(rec.providerId, 'meta');
  assert.equal(rec.model, 'muse-spark-1.3');
  assert.equal(rec.repoSha, SHA);
  assert.equal(rec.inputSha256, c.w.request.inputSha256);
  assert.equal(Date.parse(rec.expiresAt) - Date.parse(rec.approvedAt), APPROVAL_TTL_MS.default);
  assert.equal(rec.bounds.maxOutputTokens, 3072);
  assert.equal(rec.synthetic, true);
});

test('CLI: wrong, partial, empty or replayed confirmations record nothing; one attempt only', async () => {
  const c = cliWorld();
  for (const wrong of ['', 'yes', 'y', 'APPROVE', c.phrase.toLowerCase(), `${c.phrase} `.replace(/ $/, ' x'), `APPROVE other-run ${c.w.request.inputSha256.slice(0, 12)}`, `APPROVE run-1 ${'0'.repeat(12)}`]) {
    const t = terminal(['me', wrong]);
    assert.equal(await runApprovalCli(c.argv, c.deps(t.io)), 1, JSON.stringify(wrong));
    assert.equal(t.asked.length, 2, 'asked exactly once for the phrase');
    assert.equal(existsSync(path.join(c.w.approvalsDir, 'run-1.json')), false);
  }
  const ok = terminal(['me', c.phrase]);
  assert.equal(await runApprovalCli(c.argv, c.deps(ok.io)), 0);
  const before = readFileSync(path.join(c.w.approvalsDir, 'run-1.json'), 'utf8');
  const again = terminal(['me', c.phrase]);
  assert.equal(await runApprovalCli(c.argv, c.deps(again.io)), 3, 'a repeated confirmation for the same run id is refused');
  assert.equal(readFileSync(path.join(c.w.approvalsDir, 'run-1.json'), 'utf8'), before, 'the first record is untouched');
});

test('CLI: refuses without an approved decision, on a dirty tree, with a spent run, or with bad arguments', async () => {
  const none = cliWorld({ register: parseDecisionRegister(JSON.stringify({ schemaVersion: 1, decisions: [] })) });
  const t = terminal(['me', none.phrase]);
  assert.equal(await runApprovalCli(none.argv, none.deps(t.io)), 3);
  assert.match(t.lines.join('\n'), /LIVE_NOT_APPROVED/);
  assert.equal(t.asked.length, 0);
  assert.equal(existsSync(none.w.approvalsDir), false, 'a local record can never replace the repository decision');

  const zeroQuota = cliWorld({ liveQuota: 0 });
  const tq = terminal(['me', zeroQuota.phrase]);
  assert.equal(await runApprovalCli(zeroQuota.argv, zeroQuota.deps(tq.io)), 3, 'no approval can be created while the code quota is 0');
  assert.match(tq.lines.join('\n'), /QUOTA_ZERO/);
  assert.equal(existsSync(zeroQuota.w.approvalsDir), false);

  const unpinned = cliWorld();
  unpinned.w.injected.pin = parseActivationPin(JSON.stringify({ schemaVersion: 1, activation: null }));
  const tu = terminal(['me', unpinned.phrase]);
  assert.equal(await runApprovalCli(unpinned.argv, unpinned.deps(tu.io)), 3);
  assert.match(tu.lines.join('\n'), /ACTIVATION_NOT_PINNED/);

  const wrongRevision = cliWorld();
  wrongRevision.w.git.headDigest = 'f'.repeat(64);
  const tr = terminal(['me', wrongRevision.phrase]);
  assert.equal(await runApprovalCli(wrongRevision.argv, wrongRevision.deps(tr.io)), 3, 'a clean but unapproved revision is refused');
  assert.match(tr.lines.join('\n'), /REVISION_NOT_APPROVED/);
  assert.equal(tr.asked.length, 0);

  const dirty = cliWorld();
  dirty.w.git.clean = false;
  assert.equal(await runApprovalCli(dirty.argv, dirty.deps(terminal(['me', dirty.phrase]).io)), 3);

  const spent = cliWorld();
  await spent.w.store.claim({ providerId: 'meta', runId: 'run-1', quota: 1 });
  assert.equal(await runApprovalCli(spent.argv, spent.deps(terminal(['me', spent.phrase]).io)), 3);

  const bad = cliWorld();
  for (const argv of [[], ['--run-id', '../x', '--input-sha256', bad.w.request.inputSha256, '--input-chars', '10'], [...bad.argv, '--ttl-minutes', '16'], [...bad.argv, '--ttl-minutes', '0'], [...bad.argv, '--yes'], bad.argv.slice(0, 4), [...bad.argv.slice(0, 5), '12001'], ['--run-id', 'a', '--run-id', 'b']]) {
    assert.equal(await runApprovalCli(argv, bad.deps(terminal(['me', bad.phrase]).io)), 2, JSON.stringify(argv));
  }
  const noName = cliWorld();
  assert.equal(await runApprovalCli(noName.argv, noName.deps(terminal(['', noName.phrase]).io)), 3, 'an empty declared name is refused');
  assert.equal(existsSync(path.join(noName.w.approvalsDir, 'run-1.json')), false);
});

// ------------------------------------------------------------ the synthetic rehearsal

test('rehearsal: every scenario is zero-network, synthetic, never VERIFIED, and the production validator refuses', async () => {
  const scenarios = ['accepted', 'refusal', 'incomplete', 'missing-status', 'wrong-model', 'empty', 'malformed', 'forbidden', 'out-of-grammar', 'provider-error', 'duplicate-run'] as const;
  const expected: Record<string, string | null> = { accepted: 'PROPOSAL_ACCEPTED', refusal: 'PROPOSAL_FAILED', incomplete: 'PROPOSAL_FAILED', 'missing-status': 'PROPOSAL_FAILED', 'wrong-model': 'PROPOSAL_FAILED', empty: 'PROPOSAL_FAILED', malformed: 'PROPOSAL_REJECTED', forbidden: 'PROPOSAL_BLOCKED', 'out-of-grammar': 'PROPOSAL_REJECTED', 'provider-error': 'PROPOSAL_FAILED', 'duplicate-run': null };
  const tmpBefore = readdirSync(path.dirname(tempDir())).filter((n) => n.startsWith('pp-rehearsal-')).length;
  for (const scenario of scenarios) {
    const r = await runActivationRehearsal({ symptom, facts, scenario, checkProduction: true });
    assert.equal(r.ok, true, scenario);
    assert.equal(r.providerRequests, 0);
    assert.equal(r.verified, false);
    assert.equal(r.realAuthorization, 'NONE');
    assert.equal(r.label, 'SYNTHETIC REHEARSAL — NOT A GENUINE AUTHORIZATION');
    assert.equal(r.proposal?.status ?? null, expected[scenario], scenario);
    assert.equal(r.productionValidatorRefusal, 'LIVE_NOT_APPROVED');
    const text = JSON.stringify(r);
    assert.doesNotMatch(text, /(?<!NOT )VERIFIED/, 'no VERIFIED value exists in a rehearsal report');
    assert.doesNotMatch(text, /verifier\/x|mock transport failure|"text"/, 'no raw model text or error text');
  }
  const accepted = await runActivationRehearsal({ symptom, facts, checkProduction: true });
  assert.equal(accepted.proposal?.renderedCss, '.promo-overlay{pointer-events:none}\n');
  assert.equal(accepted.proposal?.label, 'UNTRUSTED PROPOSAL — NOT VERIFIED');
  assert.equal(JSON.stringify(await runActivationRehearsal({ symptom, facts })), JSON.stringify(await runActivationRehearsal({ symptom, facts })), 'deterministic');
  assert.equal(readdirSync(path.dirname(tempDir())).filter((n) => n.startsWith('pp-rehearsal-')).length, tmpBefore, 'the disposable directory is removed');
});

// ------------------------------------------------------------ MAJOR-1 / MAJOR-2: production boundary and the owner-pinned revision

const REAL_ROOT = path.resolve(import.meta.dirname, '../..');
const PIN_PATH = 'config/live-activation.json';
const OWNER_REF = 'owner-decision-ref (test fixture)';
const git = (root: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd: root, encoding: 'utf8' }).trim();
const commitAll = (root: string, msg: string) => {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', msg);
  return git(root, 'rev-parse', 'HEAD');
};
const approvedRegister = (extra: Record<string, unknown> = {}) => JSON.stringify({ schemaVersion: 1, decisions: [{ decisionId: DECISION_ID, status: 'APPROVED', provider: 'meta', model: META_PROPOSAL_MODEL, maxBillableAttempts: 1, maxInputChars: 12000, maxOutputTokens: 3072, approvedBy: 'Owner (test fixture)', approvedAt: '2026-10-30T00:00:00.000Z', reference: OWNER_REF, ...extra }] }, null, 2) + '\n';

/** A real throw-away Git repository laid out like this one: activation commit A, then a pin-only commit A'. TEST FIXTURE: nothing here is an owner decision. */
async function repoWorld(opts: { registerExtra?: Record<string, unknown>; pinExtra?: Record<string, unknown>; skipPin?: boolean } = {}) {
  const root = path.join(tempDir(), 'repo');
  mkdirSync(path.join(root, 'config'), { recursive: true });
  git(root, 'init', '-q');
  writeFileSync(path.join(root, '.gitignore'), '.proofpilot/\n');
  writeFileSync(path.join(root, 'config/live-authorization.json'), approvedRegister(opts.registerExtra));
  writeFileSync(path.join(root, PIN_PATH), JSON.stringify({ schemaVersion: 1, activation: null }) + '\n');
  writeFileSync(path.join(root, 'code.txt'), 'reviewed code\n');
  const A = commitAll(root, 'activation commit');
  const { createGitProbe } = await import('../../packages/inference/src/git-probe.ts');
  const digest = await createGitProbe(root).treeDigest(A, PIN_PATH);
  const writePin = (over: Record<string, unknown> = {}) => writeFileSync(path.join(root, PIN_PATH), JSON.stringify({ schemaVersion: 1, activation: { decisionId: DECISION_ID, decisionReference: OWNER_REF, activationCommit: A, activationDigest: digest, recordedBy: 'Owner (test fixture)', recordedAt: '2026-10-30T00:00:00.000Z', reference: 'pin-commit', ...opts.pinExtra, ...over } }, null, 2) + '\n');
  if (!opts.skipPin) writePin();
  const Aprime = opts.skipPin ? A : commitAll(root, 'pin-only commit');
  const request = buildProposalRequest({ symptom, facts });
  const attempt: AuthorizeRequest = { runId: 'run-1', request, provider: { id: 'meta', models: { visual: META_PROPOSAL_MODEL } }, maxOutputTokens: LIVE_LIMITS.maxOutputTokens, now: () => T0 };
  const ctx = (quota = 1) => createInstallContext(root, quota);
  const approveViaCli = async (runId = 'run-1', answers?: string[]) => {
    const t = terminal(answers ?? ['Owner', confirmationPhrase(runId, request.inputSha256)]);
    const code = await runApprovalCli(['--run-id', runId, '--input-sha256', request.inputSha256, '--input-chars', String(request.prompt.length)], { io: t.io, ctx: await ctx(), now: () => T0 });
    return { code, text: t.lines.join('\n') };
  };
  return { root, A, Aprime, digest, writePin, attempt, ctx, approveViaCli, request };
}

test('MAJOR-1: the production API takes no trust from its caller: fake roots, forged Git state, fake registers, synthetic approvals and quotas are ignored', async () => {
  const fake = await repoWorld();
  const { code } = await fake.approveViaCli(); // a perfectly valid approval inside a fake, fully approved repository
  assert.equal(code, 0);
  const forged = {
    runId: 'run-1', request: fake.request, provider: { id: 'meta' as const, models: { visual: META_PROPOSAL_MODEL } }, maxOutputTokens: LIVE_LIMITS.maxOutputTokens,
    repoRoot: fake.root, installRoot: fake.root, git: { head: async () => fake.Aprime, clean: async () => true, treeDigest: async () => fake.digest }, approvalsDir: path.join(fake.root, '.proofpilot/approvals'),
    reservationsRoot: path.join(fake.root, '.proofpilot/reservations'), register: parseDecisionRegister(approvedRegister()), pin: fake.digest, liveQuota: 1, quota: 1, allowSynthetic: true, synthetic: true, store: createReservationStore(path.join(fake.root, '.proofpilot/reservations')), now: () => T0,
  };
  const realApprovals = path.join(REAL_ROOT, '.proofpilot/approvals');
  const before = existsSync(realApprovals);
  assert.equal(await codeOf(authorizeProductionAttempt(forged)), 'LIVE_NOT_APPROVED');
  assert.equal(await codeOf(prepareProductionAttempt(forged)), 'LIVE_NOT_APPROVED');
  assert.equal(existsSync(path.join(fake.root, '.proofpilot/approvals/run-1.consumed')), false, 'the fake repository approval was not consumed');
  assert.equal(existsSync(path.join(fake.root, '.proofpilot/reservations')), false, 'nothing was reserved in the fake tree');
  assert.equal(existsSync(realApprovals), before, 'the real approvals directory was not touched');
  // malformed arguments also fail closed
  for (const bad of [undefined, null, {}, { runId: 'run-1' }]) {
    const c = await codeOf(authorizeProductionAttempt(bad as never));
    assert.ok(c !== 'NO_ERROR' && !c.startsWith('OTHER'), `malformed arguments fail closed with a typed error, got ${c}`);
  }
});

test('MAJOR-1: with a SIMULATED positive quota the real repository still authorizes nothing (empty register, no pinned revision)', async () => {
  const before = existsSync(path.join(REAL_ROOT, '.proofpilot/approvals'));
  const ctx = await createInstallContext(REAL_ROOT, 1);
  assert.equal(ctx.kind, 'production');
  const w = world();
  assert.equal(await codeOf(evaluateAuthorizationCore(ctx, w.input)), 'LIVE_NOT_APPROVED');
  assert.equal(await codeOf(prepareAttemptCore(ctx, w.input)), 'LIVE_NOT_APPROVED');
  assert.equal(existsSync(path.join(REAL_ROOT, '.proofpilot/approvals')), before);
  // even with the register approved, an empty pin stops it
  const approvedNoPin = await repoWorld({ skipPin: true });
  assert.equal(await codeOf(evaluateAuthorizationCore(await approvedNoPin.ctx(1), approvedNoPin.attempt)), 'ACTIVATION_NOT_PINNED');
  assert.equal(await codeOf(evaluateAuthorizationCore(await approvedNoPin.ctx(0), approvedNoPin.attempt)), 'QUOTA_ZERO');
  // the real files are empty today
  assert.deepEqual(JSON.parse(readFileSync(path.join(REAL_ROOT, 'config/live-authorization.json'), 'utf8')).decisions, []);
  assert.equal(JSON.parse(readFileSync(path.join(REAL_ROOT, PIN_PATH), 'utf8')).activation, null);
});

test('MAJOR-1: forged Git state and synthetic material only ever yield a synthetic authorization, never a production one', async () => {
  const w = world();
  await w.approve();
  const a = await w.evaluate();
  assert.equal(a.synthetic, true);
  // a production-kind context rejects synthetic decisions, pins and approvals even in a real repository
  const synthRepo = await repoWorld({ registerExtra: { synthetic: true } });
  assert.equal(await codeOf(evaluateAuthorizationCore(await synthRepo.ctx(), synthRepo.attempt)), 'SYNTHETIC_NOT_ALLOWED');
  const synthPin = await repoWorld({ pinExtra: { synthetic: true } });
  assert.equal(await codeOf(evaluateAuthorizationCore(await synthPin.ctx(), synthPin.attempt)), 'SYNTHETIC_NOT_ALLOWED');
  const r = await repoWorld();
  const t = terminal(['Owner', confirmationPhrase('run-1', r.request.inputSha256)]);
  const ctx = await r.ctx();
  assert.equal(await runApprovalCli(['--run-id', 'run-1', '--input-sha256', r.request.inputSha256, '--input-chars', String(r.request.prompt.length)], { io: t.io, ctx, now: () => T0 }), 0);
  const rec = await readApprovalRecord(path.join(r.root, '.proofpilot/approvals'), 'run-1');
  assert.equal(rec.synthetic, false);
  // a synthetic record dropped into a production tree is refused
  writeFileSync(path.join(r.root, '.proofpilot/approvals/run-1.json'), JSON.stringify(buildApprovalRecord({ runId: 'run-1', repoSha: r.Aprime, activation: { commit: r.A, digest: r.digest }, inputSha256: r.request.inputSha256, inputChars: r.request.prompt.length, register: ctx.register, declaredBy: 'x', now: T0, synthetic: true })), { mode: 0o600, flag: 'w' });
  assert.equal(await codeOf(evaluateAuthorizationCore(ctx, r.attempt)), 'SYNTHETIC_NOT_ALLOWED');
});

test('MAJOR-2: a valid owner-pinned revision works end to end with real Git; any other clean revision is rejected by the validator and the CLI', async () => {
  const r = await repoWorld();
  assert.equal((await r.approveViaCli()).code, 0);
  const ok = await evaluateAuthorizationCore(await r.ctx(), r.attempt);
  assert.equal(ok.repoSha, r.Aprime);
  assert.equal(ok.activationDigest, r.digest);
  assert.equal(ok.synthetic, false);
  const p = await prepareAttemptCore(await r.ctx(), r.attempt);
  assert.equal(p.claim.slot, 1);
  assert.equal(await codeOf(prepareAttemptCore(await r.ctx(), r.attempt)), 'APPROVAL_SPENT');

  // an unauthorized NEWER clean commit: same register, same pin, but not the revision the owner pinned
  const n = await repoWorld();
  assert.equal((await n.approveViaCli()).code, 0);
  writeFileSync(path.join(n.root, 'code.txt'), 'unreviewed change\n');
  const newer = commitAll(n.root, 'unreviewed newer commit');
  assert.notEqual(newer, n.Aprime);
  assert.equal(await codeOf(evaluateAuthorizationCore(await n.ctx(), n.attempt)), 'REVISION_NOT_APPROVED', 'clean, self-consistent, but not the pinned revision');
  const refused = await n.approveViaCli('run-2');
  assert.equal(refused.code, 3);
  assert.match(refused.text, /REVISION_NOT_APPROVED/);
  assert.equal(existsSync(path.join(n.root, '.proofpilot/approvals/run-2.json')), false);

  // a newer commit that only re-writes the pin file keeps the digest, so a NEW approval works, and the OLD one is for another HEAD
  const m = await repoWorld();
  assert.equal((await m.approveViaCli()).code, 0);
  m.writePin({ recordedBy: 'Owner (re-recorded)' });
  commitAll(m.root, 're-record the pin');
  assert.equal(await codeOf(evaluateAuthorizationCore(await m.ctx(), m.attempt)), 'REPO_MISMATCH', 'an approval is bound to the exact HEAD it was made at');
  assert.equal((await m.approveViaCli('run-2')).code, 0);

  // a changed decision reference (pin vs register) and a pin that does not match its commit
  const d = await repoWorld();
  d.writePin({ decisionReference: 'some other decision' });
  commitAll(d.root, 'pin names another decision');
  assert.equal(await codeOf(evaluateAuthorizationCore(await d.ctx(), d.attempt)), 'ACTIVATION_MISMATCH');
  assert.equal((await d.approveViaCli()).code, 3);
  const reg = await repoWorld();
  writeFileSync(path.join(reg.root, 'config/live-authorization.json'), approvedRegister({ reference: 'edited reference' }));
  commitAll(reg.root, 'edit the register after pinning');
  assert.ok(['ACTIVATION_MISMATCH', 'REVISION_NOT_APPROVED'].includes(await codeOf(evaluateAuthorizationCore(await reg.ctx(), reg.attempt))), 'editing the register invalidates the pin');
  const wrongDigest = await repoWorld();
  wrongDigest.writePin({ activationDigest: 'f'.repeat(64) });
  commitAll(wrongDigest.root, 'pin digest wrong');
  assert.equal(await codeOf(evaluateAuthorizationCore(await wrongDigest.ctx(), wrongDigest.attempt)), 'ACTIVATION_MISMATCH');
  const noCommit = await repoWorld();
  noCommit.writePin({ activationCommit: '0'.repeat(40) });
  commitAll(noCommit.root, 'pin commit does not exist');
  assert.equal(await codeOf(evaluateAuthorizationCore(await noCommit.ctx(), noCommit.attempt)), 'ACTIVATION_MISMATCH');

  // dirty trees: tracked edit and untracked file
  const dirty = await repoWorld();
  assert.equal((await dirty.approveViaCli()).code, 0);
  writeFileSync(path.join(dirty.root, 'stray.txt'), 'untracked\n');
  assert.equal(await codeOf(evaluateAuthorizationCore(await dirty.ctx(), dirty.attempt)), 'TREE_DIRTY');
  assert.equal((await dirty.approveViaCli('run-2')).code, 3);
});

test('MAJOR-2: an approval made for another activation revision is refused, and the digest covers everything except the pin file', async () => {
  const w = world();
  await w.approve({ activation: { commit: SHA, digest: 'd'.repeat(64) } });
  assert.equal(await codeOf(w.evaluate()), 'REVISION_NOT_APPROVED');
  const a = '100644 blob aaaa\tcode.txt\x00100644 blob bbbb\tconfig/live-activation.json\x00100644 blob cccc\tother.txt\x00';
  const reordered = '100644 blob cccc\tother.txt\x00100644 blob aaaa\tcode.txt\x00100644 blob zzzz\tconfig/live-activation.json\x00';
  assert.equal(activationDigestOf(a, PIN_PATH), activationDigestOf(reordered, PIN_PATH), 'order and the pin file do not matter');
  assert.notEqual(activationDigestOf(a, PIN_PATH), activationDigestOf(a.replace('aaaa', 'aaab'), PIN_PATH), 'any other file does');
  assert.notEqual(activationDigestOf(a, PIN_PATH), activationDigestOf(a.replace('code.txt', 'code2.txt'), PIN_PATH));
  const r = await repoWorld();
  const { createGitProbe } = await import('../../packages/inference/src/git-probe.ts');
  const probe = createGitProbe(r.root);
  assert.equal(await probe.treeDigest('HEAD', PIN_PATH), r.digest);
  assert.equal(await probe.treeDigest(r.A, PIN_PATH), r.digest, 'A and the pin-only commit A-prime share one activation digest');
  for (const bad of ['--help', 'HEAD~1', 'main', 'a'.repeat(39), '-p']) await assert.rejects(probe.treeDigest(bad, PIN_PATH), /revision must be/, bad);
  assert.deepEqual(parseActivationPin(JSON.stringify({ schemaVersion: 1, activation: null })).activation, null);
  for (const bad of ['{', JSON.stringify({ schemaVersion: 1 }), JSON.stringify({ schemaVersion: 1, activation: { decisionId: DECISION_ID } }), JSON.stringify({ schemaVersion: 1, activation: null, extra: 1 })]) assert.equal(await codeOf(Promise.resolve().then(() => parseActivationPin(bad))), 'PIN_INVALID');
});

// ------------------------------------------------------------ MINOR-3: ancestor directories

test('MINOR-3: an unsafe existing .proofpilot parent or repository directory is refused, never silently chmod-ed', async () => {
  const mk = () => {
    const root = path.join(tempDir(), 'repo');
    const parent = path.join(root, '.proofpilot');
    mkdirSync(parent, { recursive: true });
    return { root, parent, dir: path.join(parent, 'approvals') };
  };
  for (const mode of [0o777, 0o775, 0o757, 0o722]) {
    const t = mk();
    chmodSync(t.parent, mode);
    assert.equal(await codeOf(ensureApprovalsDir(t.dir)), 'APPROVAL_UNSAFE_FILE', `.proofpilot mode ${mode.toString(8)}`);
    assert.equal(statSync(t.parent).mode & 0o777, mode, 'the unsafe directory was not altered');
    assert.equal(existsSync(t.dir), false, 'no approvals directory was created inside an unsafe parent');
    const w = world();
    mkdirSync(path.join(w.dir, '.proofpilot'), { recursive: true });
    chmodSync(path.join(w.dir, '.proofpilot'), mode);
    assert.equal(await codeOf(w.approve()), 'APPROVAL_UNSAFE_FILE');
    assert.equal(await codeOf(readApprovalRecord(w.approvalsDir, 'run-1')), 'APPROVAL_UNSAFE_FILE');
    const cli = cliWorld();
    mkdirSync(path.join(cli.w.dir, '.proofpilot'), { recursive: true });
    chmodSync(path.join(cli.w.dir, '.proofpilot'), mode);
    const tt = terminal(['me', cli.phrase]);
    assert.equal(await runApprovalCli(cli.argv, cli.deps(tt.io)), 3);
    assert.equal(existsSync(path.join(cli.w.approvalsDir, 'run-1.json')), false);
  }
  // the repository directory above .proofpilot may not be group/other writable either
  for (const mode of [0o777, 0o775]) {
    const t = mk();
    chmodSync(t.root, mode);
    assert.equal(await codeOf(ensureApprovalsDir(t.dir)), 'APPROVAL_UNSAFE_FILE', `repo dir mode ${mode.toString(8)}`);
    chmodSync(t.root, 0o700);
  }
  // symlinked or non-directory parents
  const s = mk();
  const target = path.join(tempDir(), 'elsewhere');
  mkdirSync(target, { mode: 0o700 });
  (await import('node:fs')).rmdirSync(s.parent);
  symlinkSync(target, s.parent);
  assert.equal(await codeOf(ensureApprovalsDir(s.dir)), 'APPROVAL_UNSAFE_FILE');
  assert.deepEqual(readdirSync(target), []);
  const f = mk();
  (await import('node:fs')).rmdirSync(f.parent);
  writeFileSync(f.parent, 'not a directory');
  assert.equal(await codeOf(ensureApprovalsDir(f.dir)), 'APPROVAL_UNSAFE_FILE');
  // safe parents work: 0755 is accepted unchanged, 0700 too, and a missing parent is created 0700
  for (const mode of [0o755, 0o700]) {
    const t = mk();
    chmodSync(t.parent, mode);
    await ensureApprovalsDir(t.dir);
    assert.equal(statSync(t.parent).mode & 0o777, mode);
    assert.equal(statSync(t.dir).mode & 0o777, 0o700);
  }
  const fresh = path.join(tempDir(), 'new', '.proofpilot', 'approvals');
  await ensureApprovalsDir(fresh);
  assert.equal(statSync(path.dirname(fresh)).mode & 0o777, 0o700);
});
