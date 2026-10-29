// C3-LIVE-01A: operator approval records, the fail-closed authorization validator, single-use consumption, the interactive
// CLI logic and the synthetic rehearsal. Everything is mock/synthetic: no provider, no network, no real authorization.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, linkSync, mkdirSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseSymptom } from '../../packages/core/src/index.ts';
import {
  APPROVAL_TTL_MS, AuthorizationError, authorizeLiveAttempt, buildApprovalRecord, buildProposalRequest, confirmationPhrase, consumeApproval, createReservationStore, DECISION_ID, digestOf,
  evaluateAuthorization, listStrandedApprovals, LIVE_LIMITS, parseDecisionRegister, prepareAttempt, readApprovalRecord, ReservationError, runActivationRehearsal, runApprovalCli,
  trustedFactsFromBaseline, writeApprovalRecord, META_PROPOSAL_MODEL,
  type ApprovalCliDeps, type ApprovalIo, type AuthorizeInjected, type AuthorizeInput, type GitProbe, type ReservationStore,
} from '../../packages/inference/src/index.ts';
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

function world(over: { runId?: string; ttlMs?: number; clock?: { t: Date } } = {}) {
  const dir = tempDir();
  const clock = over.clock ?? { t: T0 };
  const runId = over.runId ?? 'run-1';
  const request = buildProposalRequest({ symptom, facts });
  const register = parseDecisionRegister(SYNTH_REGISTER_TEXT);
  const git = { head: SHA, clean: true, fail: false };
  const probe: GitProbe = { head: async () => (git.fail ? Promise.reject(new Error('no git')) : git.head), clean: async () => git.clean };
  const approvalsDir = path.join(dir, '.proofpilot', 'approvals');
  const reservationsRoot = path.join(dir, '.proofpilot', 'reservations');
  const input: AuthorizeInput = { approvalsDir, reservationsRoot, runId, request, provider: { id: 'meta', models: { visual: META_PROPOSAL_MODEL } }, maxOutputTokens: LIVE_LIMITS.maxOutputTokens, git: probe, now: () => clock.t };
  const injected: AuthorizeInjected = { register, liveQuota: 1, allowSynthetic: true };
  const store = createReservationStore(reservationsRoot);
  const record = (o: Partial<Parameters<typeof buildApprovalRecord>[0]> = {}) =>
    buildApprovalRecord({ runId, repoSha: SHA, inputSha256: request.inputSha256, inputChars: request.prompt.length, register, declaredBy: 'tester', now: T0, ttlMs: over.ttlMs, synthetic: true, ...o });
  const approve = (o: Partial<Parameters<typeof buildApprovalRecord>[0]> = {}) => writeApprovalRecord(approvalsDir, record(o));
  return { dir, clock, runId, request, register, git, input, injected, store, approvalsDir, reservationsRoot, record, approve };
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
  const p = await prepareAttempt(w.input, w.injected, w.store);
  assert.equal(p.authorized.runId, 'run-1');
  assert.equal(p.claim.slot, 1);
  assert.equal(Object.isFrozen(p.authorized), true);
  assert.ok(existsSync(path.join(w.approvalsDir, 'run-1.consumed')));
  assert.equal(await codeOf(prepareAttempt(w.input, w.injected, w.store)), 'APPROVAL_SPENT', 'replaying the same approval');
  assert.equal(await codeOf(evaluateAuthorization(w.input, w.injected)), 'APPROVAL_SPENT');
});

test('the production validator refuses everything today: the repository register holds no approved decision', async () => {
  const w = world();
  await w.approve();
  assert.equal(await codeOf(authorizeLiveAttempt({ ...w.input, repoRoot })), 'LIVE_NOT_APPROVED');
  const reg = JSON.parse(readFileSync(path.join(repoRoot, 'config/live-authorization.json'), 'utf8'));
  assert.deepEqual(reg.decisions, []);
  // even a (synthetic) approved register in another root cannot be used by the production wrapper
  const fake = path.join(w.dir, 'repo');
  mkdirSync(path.join(fake, 'config'), { recursive: true });
  writeFileSync(path.join(fake, 'config/live-authorization.json'), SYNTH_REGISTER_TEXT);
  assert.equal(await codeOf(authorizeLiveAttempt({ ...w.input, repoRoot: fake })), 'SYNTHETIC_NOT_ALLOWED');
  const real = JSON.parse(SYNTH_REGISTER_TEXT);
  delete real.decisions[0].synthetic;
  writeFileSync(path.join(fake, 'config/live-authorization.json'), JSON.stringify(real));
  assert.equal(await codeOf(authorizeLiveAttempt({ ...w.input, repoRoot: fake })), 'QUOTA_ZERO', 'a decision alone cannot raise the frozen code quota of 0');
});

test('createProposalConsent-style consent is not an approval: with no operator record nothing is authorized', async () => {
  const w = world();
  assert.equal(await codeOf(evaluateAuthorization(w.input, w.injected)), 'APPROVAL_MISSING');
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
    ['register changed', 'APPROVAL_MISMATCH', (w) => { w.injected.register = parseDecisionRegister(SYNTH_REGISTER_TEXT.replace('synthetic test decision', 'edited')); }],
    ['spent run id', 'RESERVATION_SPENT', async (w) => { await w.store.claim({ providerId: 'meta', runId: w.runId, quota: 1 }); }],
    ['other run took the slot', 'QUOTA_EXHAUSTED', async (w) => { await w.store.claim({ providerId: 'meta', runId: 'someone-else', quota: 1 }); }],
    ['stale claim lock', 'LOCK_STALE', (w) => { mkdirSync(path.join(w.reservationsRoot, 'meta'), { recursive: true }); writeFileSync(path.join(w.reservationsRoot, 'meta', '.claim.lock'), ''); }],
  ];
  for (const [name, expected, mutate] of cases) {
    const w = world();
    await w.approve();
    await mutate(w);
    assert.equal(await codeOf(evaluateAuthorization(w.input, w.injected)), expected, name);
    assert.equal(existsSync(path.join(w.approvalsDir, 'run-1.consumed')), false, `${name}: a refused authorization must not consume the approval`);
  }
});

test('oversized input is refused; an undecided or non-approved register is LIVE_NOT_APPROVED', async () => {
  const w = world();
  const big = 'x'.repeat(12_001);
  const { createHash } = await import('node:crypto');
  w.input.request = { fixtureId: 'F01', prompt: big, inputSha256: createHash('sha256').update(big).digest('hex'), chars: big.length };
  await w.approve({ inputSha256: w.input.request.inputSha256, inputChars: 12_000 });
  assert.equal(await codeOf(evaluateAuthorization(w.input, w.injected)), 'BOUNDS');
  const w2 = world();
  await w2.approve();
  for (const text of [JSON.stringify({ schemaVersion: 1, decisions: [] }), SYNTH_REGISTER_TEXT.replace('"APPROVED"', '"PROPOSED"')]) {
    assert.equal(await codeOf(evaluateAuthorization(w2.input, { ...w2.injected, register: parseDecisionRegister(text) })), 'LIVE_NOT_APPROVED');
  }
  for (const [needle, value] of [['"provider":"meta"', '"provider":"baseten"'], ['"muse-spark-1.3"', '"muse-spark-1.2"'], ['"maxBillableAttempts":1', '"maxBillableAttempts":2'], ['"maxOutputTokens":3072', '"maxOutputTokens":9999'], ['"maxInputChars":12000', '"maxInputChars":99999']] as const) {
    assert.equal(await codeOf(evaluateAuthorization(w2.input, { ...w2.injected, register: parseDecisionRegister(SYNTH_REGISTER_TEXT.replace(needle, value)) })), 'LIVE_NOT_APPROVED', value);
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
    assert.equal(await codeOf(evaluateAuthorization(w.input, w.injected)), expected, name);
  }
  const w = world();
  await w.approve();
  writeFileSync(path.join(w.approvalsDir, 'run-1.json'), '{broken', { mode: 0o600 });
  assert.equal(await codeOf(evaluateAuthorization(w.input, w.injected)), 'APPROVAL_MALFORMED');
});

test('a synthetic approval never authorizes under non-synthetic rules, and the reverse', async () => {
  const w = world();
  await w.approve();
  assert.equal(await codeOf(evaluateAuthorization(w.input, { ...w.injected, allowSynthetic: false })), 'SYNTHETIC_NOT_ALLOWED');
  const w2 = world();
  await w2.approve({ synthetic: false });
  assert.equal(await codeOf(evaluateAuthorization(w2.input, w2.injected)), 'APPROVAL_MISMATCH', 'a non-synthetic record cannot ride on a synthetic decision');
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
  await consumeApproval(w.approvalsDir, await evaluateAuthorization(w.input, w.injected), () => T0);
  const text = readFileSync(file, 'utf8') + readFileSync(path.join(w.approvalsDir, 'run-1.consumed'), 'utf8');
  assert.doesNotMatch(text, /api[_-]?key|bearer|secret|password|PRIVATE KEY|MODEL_API_KEY|BASETEN/i);
  assert.doesNotMatch(text, /adjustments|pointer-events|prompt/);
});

// ------------------------------------------------------------ concurrency, crashes, TOCTOU

test('concurrent use of one approval: exactly one caller proceeds', async () => {
  const w = world();
  await w.approve();
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => prepareAttempt(w.input, w.injected, w.store)));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  for (const r of results) if (r.status === 'rejected') assert.ok(r.reason instanceof AuthorizationError, String(r.reason));
  assert.equal(readdirSync(path.join(w.reservationsRoot, 'meta', 'slots')).length, 1, 'exactly one slot was spent');
});

test('a crash between approval validation and quota reservation spends the approval and nothing else', async () => {
  const w = world();
  await w.approve();
  const authorized = await evaluateAuthorization(w.input, w.injected);
  await consumeApproval(w.approvalsDir, authorized, () => T0); // ...process dies here
  assert.equal(await codeOf(prepareAttempt(w.input, w.injected, w.store)), 'APPROVAL_SPENT');
  assert.deepEqual(await listStrandedApprovals(w.approvalsDir, w.reservationsRoot), ['run-1']);
  assert.equal(existsSync(path.join(w.reservationsRoot, 'meta', 'slots')), false, 'no slot was spent by the crash');
  assert.equal(await codeOf(w.approve()), 'APPROVAL_DUPLICATE', 'the run id cannot be re-approved');
  // a fresh run id needs a fresh approval and can still use the unspent slot
  const w2 = { ...w, runId: 'run-2', input: { ...w.input, runId: 'run-2' } };
  await writeApprovalRecord(w.approvalsDir, w.record({ runId: 'run-2' }));
  assert.equal((await prepareAttempt(w2.input, w.injected, w.store)).claim.slot, 1);
});

test('consumption is itself exclusive, and a consumed run id can never be re-approved even if its record is gone', async () => {
  const w = world();
  await w.approve();
  const a = await evaluateAuthorization(w.input, w.injected);
  const results = await Promise.allSettled([consumeApproval(w.approvalsDir, a, () => T0), consumeApproval(w.approvalsDir, a, () => T0), consumeApproval(w.approvalsDir, a, () => T0)]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1, 'exactly one consume wins');
  for (const r of results) if (r.status === 'rejected') assert.equal((r.reason as AuthorizationError).code, 'APPROVAL_SPENT');
  (await import('node:fs')).unlinkSync(path.join(w.approvalsDir, 'run-1.json'));
  assert.equal(await codeOf(w.approve()), 'APPROVAL_DUPLICATE');
});

test('a crash after the claim leaves a spent slot and a CLAIMED run; nothing can be replayed or recycled', async () => {
  const w = world();
  await w.approve();
  await prepareAttempt(w.input, w.injected, w.store); // ...process dies before the call/settlement
  assert.equal(await codeOf(prepareAttempt(w.input, w.injected, w.store)), 'APPROVAL_SPENT');
  const run = JSON.parse(readFileSync(path.join(w.reservationsRoot, 'meta', 'runs', 'run-1.json'), 'utf8'));
  assert.equal(run.status, 'CLAIMED');
  assert.deepEqual(await listStrandedApprovals(w.approvalsDir, w.reservationsRoot), []);
  await writeApprovalRecord(w.approvalsDir, w.record({ runId: 'run-9' }));
  assert.equal(await codeOf(prepareAttempt({ ...w.input, runId: 'run-9' }, w.injected, w.store)), 'QUOTA_EXHAUSTED', 'the only slot stays spent');
});

test('a failure after consumption (lock taken between check and claim) fails closed and leaves the approval spent', async () => {
  const w = world();
  await w.approve();
  const racing: ReservationStore = { claim: async () => { throw new ReservationError('LOCK_UNAVAILABLE', 'held'); }, settle: async () => true };
  assert.equal(await codeOf(prepareAttempt(w.input, w.injected, racing)), 'LOCK_STALE');
  assert.equal(await codeOf(prepareAttempt(w.input, w.injected, w.store)), 'APPROVAL_SPENT');
  const w2 = world();
  await w2.approve();
  const broken: ReservationStore = { claim: async () => { throw new Error('disk'); }, settle: async () => true };
  assert.equal(await codeOf(prepareAttempt(w2.input, w2.injected, broken)), 'INTERNAL');
});

test('time-of-check/time-of-use: HEAD or expiry that changes after the first check is caught before any claim', async () => {
  const w = world();
  await w.approve();
  let calls = 0;
  w.input.git = { head: async () => (++calls > 1 ? 'c'.repeat(40) : SHA), clean: async () => true };
  assert.equal(await codeOf(prepareAttempt(w.input, w.injected, w.store)), 'REPO_MISMATCH');
  assert.equal(existsSync(path.join(w.reservationsRoot, 'meta', 'runs')), false, 'nothing was claimed');

  const w2 = world();
  await w2.approve();
  let n = 0;
  w2.input.now = () => new Date(n++ < 2 ? T0.getTime() : T0.getTime() + APPROVAL_TTL_MS.default + 5);
  assert.equal(await codeOf(prepareAttempt(w2.input, w2.injected, w2.store)), 'APPROVAL_EXPIRED');
  assert.equal(existsSync(path.join(w2.reservationsRoot, 'meta', 'runs')), false);

  // the consumption marker must be this approval's
  const w3 = world();
  await w3.approve();
  const a = await evaluateAuthorization(w3.input, w3.injected);
  writeFileSync(path.join(w3.approvalsDir, 'run-1.consumed'), JSON.stringify({ approvalId: 'f'.repeat(32), recordSha256: a.recordSha256 }), { mode: 0o600 });
  assert.equal(await codeOf(evaluateAuthorization(w3.input, w3.injected, { afterConsume: true })), 'APPROVAL_MISMATCH');
});

test('no automatic retry and no recycling: a failed attempt keeps its slot, so another run needs the quota raised again', async () => {
  const w = world();
  await w.approve();
  const p = await prepareAttempt(w.input, w.injected, w.store);
  await w.store.settle(p.claim, { status: 'PROPOSAL_FAILED', reason: 'PROVIDER_TIMEOUT' });
  await writeApprovalRecord(w.approvalsDir, w.record({ runId: 'run-2' }));
  assert.equal(await codeOf(prepareAttempt({ ...w.input, runId: 'run-2' }, w.injected, w.store)), 'QUOTA_EXHAUSTED');
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
function cliWorld(over: Partial<ApprovalCliDeps> = {}) {
  const w = world();
  const git: GitProbe = { head: async () => w.git.head, clean: async () => w.git.clean };
  const deps = (io: ApprovalIo): ApprovalCliDeps => ({ io, git, register: w.register, approvalsDir: w.approvalsDir, reservationsRoot: w.reservationsRoot, now: () => T0, synthetic: true, ...over });
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

  const nonSynth = cliWorld({ synthetic: false });
  assert.equal(await runApprovalCli(nonSynth.argv, nonSynth.deps(terminal(['me', nonSynth.phrase]).io)), 3, 'a synthetic decision never works in production mode');

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
    const r = await runActivationRehearsal({ symptom, facts, scenario, repoRoot });
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
  const accepted = await runActivationRehearsal({ symptom, facts, repoRoot });
  assert.equal(accepted.proposal?.renderedCss, '.promo-overlay{pointer-events:none}\n');
  assert.equal(accepted.proposal?.label, 'UNTRUSTED PROPOSAL — NOT VERIFIED');
  assert.equal(JSON.stringify(await runActivationRehearsal({ symptom, facts })), JSON.stringify(await runActivationRehearsal({ symptom, facts })), 'deterministic');
  assert.equal(readdirSync(path.dirname(tempDir())).filter((n) => n.startsWith('pp-rehearsal-')).length, tmpBefore, 'the disposable directory is removed');
});
