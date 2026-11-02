// UI-C3-02-BT-LIVE-01: offline Baseten transport contract. No network, no
// environment, no credentials: every call goes through an injected fetch
// double with a fake key. Pins the exact request shape, single-call/no-retry
// behavior, cancellation, deadline, typed refusals, and redaction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ANALYZE_MAX_TOKENS,
  PROPOSE_MAX_TOKENS,
  encodeVideoPart,
  maxTokensFor,
  type VideoPart,
} from '../../packages/live-analysis/src/baseten-request.ts';
import {
  BASETEN_APPROVED_ENDPOINT,
  BASETEN_DOCUMENTED_DIRECT_MODEL,
} from '../../packages/live-analysis/src/config.ts';
import {
  BasetenCancelled,
  BasetenTimeout,
  buildBasetenChatBody,
  createBasetenTransport,
  LIVE_ANALYZE_PROMPT,
  LIVE_PROPOSE_PROMPT,
  validateBasetenResponse,
  type BasetenTransport,
  type LiveFetch,
  type LiveFetchResponse,
} from '../../packages/live-analysis/src/baseten-transport.ts';
import {
  createLiveAttemptLedger,
  createLiveSendSpender,
  type LiveSendAuthorization,
} from '../../packages/live-analysis/src/live-attempts.ts';
import {
  LiveSpendRecordError,
  openSpentRecord,
} from '../../packages/live-analysis/src/live-spent-record.ts';

const RACER = path.resolve(import.meta.dirname, '../helpers/record-racer.ts');

const FAKE_KEY = 'NOT-A-REAL-KEY-0000';
const APPROVED = BASETEN_DOCUMENTED_DIRECT_MODEL;

const ftyp = (size: number): Uint8Array => {
  const buf = Buffer.alloc(size);
  buf.writeUInt32BE(24, 0);
  buf.write('ftypisom', 4, 'ascii');
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
};

function realPart(): VideoPart {
  const part = encodeVideoPart(ftyp(512));
  assert.equal(part.ok, true);
  return (part as { ok: true; part: VideoPart }).part;
}

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  redirect: string;
  signal: AbortSignal;
}

interface DoubleOptions {
  status?: number;
  jsonValue?: unknown;
  jsonThrows?: boolean;
  url?: string;
  hang?: boolean;
  throwNetwork?: boolean;
}

function makeDouble(options: DoubleOptions = {}): {
  fetchImpl: LiveFetch;
  calls: RecordedCall[];
  aborted: { value: boolean };
} {
  const calls: RecordedCall[] = [];
  const aborted = { value: false };
  const fetchImpl: LiveFetch = (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body, redirect: init.redirect, signal: init.signal });
    init.signal.addEventListener('abort', () => {
      aborted.value = true;
    });
    if (options.hang === true) {
      return new Promise<LiveFetchResponse>((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted by test double')));
      });
    }
    if (options.throwNetwork === true) {
      return Promise.reject(new Error('socket reset by test double'));
    }
    const response: LiveFetchResponse = {
      status: options.status ?? 200,
      url: options.url ?? BASETEN_APPROVED_ENDPOINT,
      json: () => {
        if (options.jsonThrows === true) return Promise.reject(new Error('not json'));
        return Promise.resolve(options.jsonValue);
      },
    };
    return Promise.resolve(response);
  };
  return { fetchImpl, calls, aborted };
}

function liveChoice(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    message: { content: 'visible tap, then cart count one' },
    finish_reason: 'stop',
    ...overrides,
  };
}

function liveBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    model: APPROVED,
    choices: [liveChoice()],
    usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 },
    ...overrides,
  };
}

function makeTransport(
  fetchImpl: LiveFetch,
  extra: { model?: unknown; apiKey?: unknown; timeoutMs?: number } = {},
): BasetenTransport {
  const created = createBasetenTransport({
    model: extra.model ?? APPROVED,
    apiKey: extra.apiKey ?? FAKE_KEY,
    fetchImpl,
    timeoutMs: extra.timeoutMs ?? 5000,
  });
  assert.equal(created.ok, true, JSON.stringify(created));
  return (created as { ok: true; transport: BasetenTransport }).transport;
}

const neverCancelled = (): boolean => false;

function trackedHooks(cancelled: () => boolean = neverCancelled): {
  hooks: { isCancelled: () => boolean; onSend: () => { ok: true } };
  sent: { count: number };
} {
  const sent = { count: 0 };
  return { hooks: { isCancelled: cancelled, onSend: () => { sent.count += 1; return { ok: true }; } }, sent };
}

test('L-BT-1: construction pins the exact documented model and refuses aliases', () => {
  const { fetchImpl } = makeDouble();
  for (const bad of [
    'meta/muse-spark-open',
    'meta-models/muse-spark-open-1026',
    'meta-models/other-model',
    // D9-I1 reconciled lookalikes (public-docs discrepancy): refused, never substituted.
    'meta/Muse-Spark-Open-816B-A42B',
    'meta-models/Muse-Spark-Open-816B-A42B',
    '',
    null,
    undefined,
    42,
  ]) {
    const out = createBasetenTransport({ model: bad, apiKey: FAKE_KEY, fetchImpl, timeoutMs: 1000 });
    assert.equal(out.ok, false, String(bad));
    assert.equal((out as { ok: false; code: string }).code, 'MODEL_UNAVAILABLE_OR_UNAPPROVED');
  }
  const noKey = createBasetenTransport({ model: APPROVED, apiKey: '', fetchImpl, timeoutMs: 1000 });
  assert.equal(noKey.ok, false);
  assert.equal((noKey as { ok: false; code: string }).code, 'NO_CREDENTIAL');
  const badTimeout = createBasetenTransport({ model: APPROVED, apiKey: FAKE_KEY, fetchImpl, timeoutMs: 0 });
  assert.equal(badTimeout.ok, false);
  assert.equal((badTimeout as { ok: false; code: string }).code, 'TRANSPORT_MISCONFIGURED');
});

test('L-BT-2: request body is exact — model, caps, one text part, one video part, no extras', () => {
  const part = realPart();
  for (const kind of ['analyze', 'propose'] as const) {
    const body = buildBasetenChatBody({ model: APPROVED, kind, videoPart: part });
    const raw = JSON.parse(JSON.stringify(body)) as Record<string, unknown>;
    assert.deepEqual(Object.keys(raw).sort(), ['max_tokens', 'messages', 'model']);
    assert.equal(raw['model'], APPROVED);
    assert.equal(raw['max_tokens'], kind === 'analyze' ? ANALYZE_MAX_TOKENS : PROPOSE_MAX_TOKENS);
    assert.equal(raw['max_tokens'], maxTokensFor(kind));
    const messages = raw['messages'] as Array<Record<string, unknown>>;
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.['role'], 'user');
    const content = messages[0]?.['content'] as Array<Record<string, unknown>>;
    assert.equal(content.length, 2);
    assert.equal(content[0]?.['type'], 'text');
    assert.equal(typeof content[0]?.['text'], 'string');
    assert.deepEqual(content[1], JSON.parse(JSON.stringify(part)));
    const flat = JSON.stringify(body);
    assert.ok(!flat.includes('response_format'), 'no response_format flag');
    assert.ok(!flat.includes('json_schema'), 'no json_schema flag');
    assert.ok(!flat.includes('"stream"'), 'no streaming flag');
    assert.ok(!flat.includes('"temperature"'), 'no temperature knob');
    assert.ok(!flat.includes('"n"'), 'no n knob');
  }
  assert.ok(LIVE_ANALYZE_PROMPT.length > 20 && LIVE_PROPOSE_PROMPT.length > 20, 'prompts are fixed text');
});

test('L-BT-3: success posts exactly one pinned request and normalizes the reply', async () => {
  const { fetchImpl, calls, aborted } = makeDouble({ jsonValue: liveBody() });
  const transport = makeTransport(fetchImpl);
  const part = realPart();
  const { hooks, sent } = trackedHooks();
  const reply = await transport.respond(
    { kind: 'analyze', runId: 'local-2026-01-01-001', sha256: 'a'.repeat(64), videoBytes: 512, videoPart: part },
    hooks,
  );
  assert.equal(sent.count, 1, 'send boundary observed exactly once');
  assert.equal(calls.length, 1, 'exactly one provider call');
  assert.equal(calls[0]?.url, BASETEN_APPROVED_ENDPOINT);
  assert.equal(calls[0]?.method, 'POST');
  assert.equal(calls[0]?.headers['Content-Type'], 'application/json');
  assert.equal(calls[0]?.headers['Authorization'], `Bearer ${FAKE_KEY}`);
  assert.equal(calls[0]?.redirect, 'error');
  const sentBody = JSON.parse(calls[0]?.body ?? '{}') as Record<string, unknown>;
  assert.equal(sentBody['model'], APPROVED);
  assert.ok(!(calls[0]?.body.includes(FAKE_KEY) ?? false), 'key never appears in the body');
  assert.equal(reply.ok, true);
  if (reply.ok) {
    assert.equal(reply.model, APPROVED);
    assert.equal(reply.text, 'visible tap, then cart count one');
    assert.deepEqual(reply.usage, { promptTokens: 120, completionTokens: 45, totalTokens: 165 });
    assert.equal(reply.finishReason, 'stop');
    assert.equal(typeof reply.latencyMs, 'number');
  }
  assert.equal(aborted.value, false, 'no abort on success');
});

test('L-BT-4: cancelled-before-send never touches the double', async () => {
  const { fetchImpl, calls } = makeDouble({ jsonValue: liveBody() });
  const transport = makeTransport(fetchImpl);
  const { hooks, sent } = trackedHooks(() => true);
  await assert.rejects(
    transport.respond(
      { kind: 'analyze', runId: 'r', sha256: 'a'.repeat(64), videoBytes: 512, videoPart: realPart() },
      hooks,
    ),
    (error: unknown) => error instanceof BasetenCancelled,
  );
  assert.equal(calls.length, 0, 'zero provider calls when already cancelled');
  assert.equal(sent.count, 0, 'no send-boundary spend before send');
});

test('L-BT-5: deadline aborts the socket and surfaces a typed timeout', async () => {
  const { fetchImpl, calls, aborted } = makeDouble({ hang: true });
  const transport = makeTransport(fetchImpl, { timeoutMs: 80 });
  const { hooks, sent } = trackedHooks();
  await assert.rejects(
    transport.respond(
      { kind: 'propose', runId: 'r', sha256: 'a'.repeat(64), videoBytes: 512, videoPart: realPart() },
      hooks,
    ),
    (error: unknown) => error instanceof BasetenTimeout,
  );
  assert.equal(calls.length, 1, 'exactly one attempt, no retry');
  assert.equal(aborted.value, true, 'socket aborted on deadline');
  assert.equal(sent.count, 1, 'timeout-after-send still consumed the send boundary');
});

test('L-BT-6: mid-flight cancel aborts and surfaces cancellation, not a refusal', async () => {
  const { fetchImpl, calls, aborted } = makeDouble({ hang: true });
  const transport = makeTransport(fetchImpl, { timeoutMs: 5000 });
  let cancelled = false;
  const { hooks, sent } = trackedHooks(() => cancelled);
  const pending = transport.respond(
    { kind: 'analyze', runId: 'r', sha256: 'a'.repeat(64), videoBytes: 512, videoPart: realPart() },
    hooks,
  );
  await new Promise((r) => setTimeout(r, 40));
  cancelled = true;
  await assert.rejects(pending, (error: unknown) => error instanceof BasetenCancelled);
  assert.equal(calls.length, 1, 'exactly one attempt, no retry');
  assert.equal(aborted.value, true, 'socket aborted on cancel');
  assert.equal(sent.count, 1, 'cancel-after-send still consumed the send boundary');
});

test('L-BT-7: HTTP errors, bad envelopes, and usage faults refuse with typed codes, one call each', async () => {
  const part = realPart();
  const cases: Array<{ name: string; options: Parameters<typeof makeDouble>[0]; code: string }> = [
    { name: 'http-500', options: { status: 500, jsonValue: liveBody() }, code: 'TRANSPORT_HTTP' },
    { name: 'http-429', options: { status: 429, jsonValue: liveBody() }, code: 'TRANSPORT_HTTP' },
    { name: 'not-json', options: { jsonThrows: true }, code: 'TRANSPORT_SHAPE' },
    { name: 'null-body', options: { jsonValue: null }, code: 'TRANSPORT_SHAPE' },
    { name: 'wrong-model', options: { jsonValue: liveBody({ model: 'meta-models/other' }) }, code: 'MODEL_MISMATCH' },
    { name: 'no-choices', options: { jsonValue: liveBody({ choices: [] }) }, code: 'TRANSPORT_SHAPE' },
    { name: 'empty-text', options: { jsonValue: liveBody({ choices: [liveChoice({ message: { content: '' } })] }) }, code: 'TRANSPORT_SHAPE' },
    { name: 'bad-usage', options: { jsonValue: liveBody({ usage: { prompt_tokens: -1, completion_tokens: 0, total_tokens: 0 } }) }, code: 'TRANSPORT_USAGE' },
    { name: 'no-finish', options: { jsonValue: liveBody({ choices: [liveChoice({ finish_reason: null })] }) }, code: 'TRANSPORT_SHAPE' },
    // MAJOR-1 finish-reason allowlist: only 'stop' completes; partial or
    // refused output must never become a successful reply.
    { name: 'truncated', options: { jsonValue: liveBody({ choices: [liveChoice({ content: 'partial', finish_reason: 'length' })] }) }, code: 'TRANSPORT_TRUNCATED' },
    { name: 'content-filter', options: { jsonValue: liveBody({ choices: [liveChoice({ content: 'partial fragment', finish_reason: 'content_filter' })] }) }, code: 'TRANSPORT_CONTENT_FILTERED' },
    { name: 'tool-calls', options: { jsonValue: liveBody({ choices: [liveChoice({ finish_reason: 'tool_calls' })] }) }, code: 'TRANSPORT_SHAPE' },
    { name: 'unknown-finish', options: { jsonValue: liveBody({ choices: [liveChoice({ finish_reason: 'eos' })] }) }, code: 'TRANSPORT_SHAPE' },
  ];
  for (const { name, options, code } of cases) {
    const { fetchImpl, calls } = makeDouble(options);
    const transport = makeTransport(fetchImpl);
    const { hooks, sent } = trackedHooks();
    const reply = await transport.respond(
      { kind: 'analyze', runId: 'r', sha256: 'a'.repeat(64), videoBytes: 512, videoPart: part },
      hooks,
    );
    assert.equal(reply.ok, false, name);
    if (!reply.ok) assert.equal(reply.code, code, `${name}: ${reply.detail}`);
    assert.equal(calls.length, 1, `${name}: exactly one attempt, no retry`);
    assert.equal(sent.count, 1, `${name}: failed reply still consumed the send boundary`);
  }
});

test('L-BT-7b: refused, filtered, and truncated envelopes never normalize to text', () => {
  const truncated = validateBasetenResponse(
    liveBody({ choices: [liveChoice({ content: 'partial output', finish_reason: 'length' })] }),
    APPROVED,
  );
  assert.equal(truncated.ok, false);
  if (!truncated.ok) assert.equal(truncated.code, 'TRANSPORT_TRUNCATED');

  const filtered = validateBasetenResponse(
    liveBody({ choices: [liveChoice({ content: 'partial fragment', finish_reason: 'content_filter' })] }),
    APPROVED,
  );
  assert.equal(filtered.ok, false);
  if (!filtered.ok) assert.equal(filtered.code, 'TRANSPORT_CONTENT_FILTERED');

  const unexpected = validateBasetenResponse(
    liveBody({ choices: [liveChoice({ finish_reason: 'tool_calls' })] }),
    APPROVED,
  );
  assert.equal(unexpected.ok, false);
  if (!unexpected.ok) assert.equal(unexpected.code, 'TRANSPORT_SHAPE');
});

test('L-BT-8: network failure refuses without leaking, and redaction holds everywhere', async () => {
  const { fetchImpl, calls } = makeDouble({ throwNetwork: true });
  const transport = makeTransport(fetchImpl);
  const part = realPart();
  const { hooks, sent } = trackedHooks();
  const reply = await transport.respond(
    { kind: 'propose', runId: 'r', sha256: 'a'.repeat(64), videoBytes: 512, videoPart: part },
    hooks,
  );
  assert.equal(sent.count, 1, 'network failure after send still consumed the send boundary');
  assert.equal(reply.ok, false);
  if (!reply.ok) {
    assert.equal(reply.code, 'TRANSPORT_NETWORK');
    assert.ok(!reply.detail.includes(FAKE_KEY), 'no key in refusal detail');
  }
  assert.equal(calls.length, 1);
  const sentBody = calls[0]?.body ?? '';
  assert.ok(!sentBody.includes(FAKE_KEY), 'key travels only in the Authorization header');
  assert.ok(!sentBody.includes('Bearer'), 'no auth scheme in the body');
  assert.ok(sentBody.includes('data:video/mp4;base64,'), 'video travels as inline data URL');
});

test('L-BT-9: response validator is strict about identity, shape, and usage', () => {
  assert.equal(validateBasetenResponse(liveBody(), APPROVED).ok, true);
  assert.equal(validateBasetenResponse(null, APPROVED).ok, false);
  assert.equal(validateBasetenResponse([], APPROVED).ok, false);
  assert.equal(validateBasetenResponse(liveBody({ model: 'meta/muse-spark-open' }), APPROVED).ok, false);
  const wrong = validateBasetenResponse(liveBody({ model: 'x' }), APPROVED);
  assert.equal(wrong.ok, false);
  if (!wrong.ok) assert.equal(wrong.code, 'MODEL_MISMATCH');
  const badUsage = validateBasetenResponse(liveBody({ usage: { prompt_tokens: 1.5, completion_tokens: 0, total_tokens: 1 } }), APPROVED);
  assert.equal(badUsage.ok, false);
  if (!badUsage.ok) assert.equal(badUsage.code, 'TRANSPORT_USAGE');
});

test('L-BT-10: exhausted authorization refuses before send with zero outbound calls', async () => {
  const { fetchImpl, calls } = makeDouble({ jsonValue: liveBody() });
  const transport = makeTransport(fetchImpl);
  const denied = { ok: false as const, code: 'LIVE_ATTEMPT_EXHAUSTED' as const };
  const reply = await transport.respond(
    { kind: 'analyze', runId: 'r', sha256: 'a'.repeat(64), videoBytes: 512, videoPart: realPart() },
    { isCancelled: neverCancelled, onSend: () => denied },
  );
  assert.equal(reply.ok, false, 'denied authorization never becomes a reply');
  if (!reply.ok) {
    assert.equal(reply.code, 'LIVE_ATTEMPT_EXHAUSTED');
    assert.ok(!reply.detail.includes(FAKE_KEY), 'no key material in the refusal detail');
    assert.ok(!reply.detail.includes('Bearer'), 'no auth scheme in the refusal detail');
  }
  assert.equal(calls.length, 0, 'zero outbound requests when authorization is denied');
});

test('L-BT-11: one authorization allows exactly one send across competing spenders', async () => {
  const { fetchImpl, calls } = makeDouble({ jsonValue: liveBody() });
  const transport = makeTransport(fetchImpl);
  const ledger = createLiveAttemptLedger({ analyses: 1, proposals: 0 });
  const first = createLiveSendSpender(ledger, 'analyze');
  const second = createLiveSendSpender(ledger, 'analyze');
  const attempt = (spend: () => LiveSendAuthorization): Promise<unknown> =>
    transport.respond(
      { kind: 'analyze', runId: 'r', sha256: 'a'.repeat(64), videoBytes: 512, videoPart: realPart() },
      { isCancelled: neverCancelled, onSend: spend },
    );
  const [a, b] = await Promise.all([attempt(first), attempt(second)]);
  const winners = [a, b].filter((r) => (r as { ok: boolean }).ok);
  const refused = [a, b].filter((r) => !(r as { ok: boolean }).ok);
  assert.equal(winners.length, 1, 'exactly one send authorized');
  assert.equal(refused.length, 1, 'exactly one sender refused');
  assert.equal((refused[0] as { code: string }).code, 'LIVE_ATTEMPT_EXHAUSTED');
  assert.equal(calls.length, 1, 'exactly one outbound POST');
  assert.equal(ledger.left('analyze'), 0, 'the single attempt is spent');
  // Repeating the winner's spender authorizes nothing further.
  const again = await attempt(first);
  assert.equal((again as { ok: boolean }).ok, false);
  assert.equal((again as { code: string }).code, 'LIVE_ATTEMPT_EXHAUSTED');
  assert.equal(calls.length, 1, 'no additional outbound POST');
  assert.equal(ledger.left('analyze'), 0, 'failed authorization consumes nothing');
});

test('L-BT-12: failure after an authorized send never restores the spent attempt', async () => {
  const { fetchImpl, calls } = makeDouble({ status: 500, jsonValue: liveBody() });
  const transport = makeTransport(fetchImpl);
  const ledger = createLiveAttemptLedger({ analyses: 1, proposals: 0 });
  const spend = createLiveSendSpender(ledger, 'analyze');
  const hooks = { isCancelled: neverCancelled, onSend: spend };
  const failed = await transport.respond(
    { kind: 'analyze', runId: 'r', sha256: 'a'.repeat(64), videoBytes: 512, videoPart: realPart() },
    hooks,
  );
  assert.equal((failed as { ok: boolean }).ok, false);
  assert.equal((failed as { code: string }).code, 'TRANSPORT_HTTP');
  assert.equal(calls.length, 1, 'the authorized send went out exactly once');
  assert.equal(ledger.left('analyze'), 0, 'the HTTP failure did not restore the attempt');
  const retry = await transport.respond(
    { kind: 'analyze', runId: 'r', sha256: 'a'.repeat(64), videoBytes: 512, videoPart: realPart() },
    hooks,
  );
  assert.equal((retry as { ok: boolean }).ok, false);
  assert.equal((retry as { code: string }).code, 'LIVE_ATTEMPT_EXHAUSTED');
  assert.equal(calls.length, 1, 'no retry outbound POST after exhaustion');
});

test('L-BT-13: one record-backed authorization permits at most one outbound POST', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pp-bt13-'));
  try {
    const { fetchImpl, calls } = makeDouble({ jsonValue: liveBody() });
    const transport = makeTransport(fetchImpl);
    const recordPath = path.join(dir, 'spent.jsonl');
    const ledger = createLiveAttemptLedger({ analyses: 1, proposals: 0 });
    const authorize = (runId: string) => (): void => {
      const handle = openSpentRecord(recordPath, { bootstrapApprovalId: 'd9i1-test-bootstrap-bt13' });
      try {
        handle.record({ runId, sha256: 'a'.repeat(64), kind: 'analyze', spentAt: 1 });
      } finally {
        handle.release();
      }
    };
    const attempt = (spend: () => LiveSendAuthorization): Promise<unknown> =>
      transport.respond(
        { kind: 'analyze', runId: 'r', sha256: 'a'.repeat(64), videoBytes: 512, videoPart: realPart() },
        { isCancelled: neverCancelled, onSend: spend },
      );
    const first = createLiveSendSpender(ledger, 'analyze', authorize('r-1'));
    const second = createLiveSendSpender(ledger, 'analyze', authorize('r-2'));
    const [a, b] = await Promise.all([attempt(first), attempt(second)]);
    assert.equal([a, b].filter((r) => (r as { ok: boolean }).ok).length, 1, 'exactly one send authorized');
    assert.equal(calls.length, 1, 'exactly one outbound POST across both competitors');
    const reopened = openSpentRecord(recordPath);
    assert.equal(reopened.countSpent('analyze'), 1, 'exactly one debit durably recorded');
    reopened.release();
    const stored = readFileSync(recordPath, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l !== '');
    assert.equal(stored.length, 2, 'genesis plus exactly one spend: approval identity intact');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// MAJOR-1 no-takeover egress proof: a stale lock left by a crashed companion
// refuses two independent authorized-send attempts with zero outbound POSTs;
// only the documented supervised recovery (dead holder verified, lock
// cleared by hand) lets the owner through — and then exactly one POST goes
// out across all instances.
test('L-BT-14: a stale lock authorizes zero fetches; supervised recovery permits exactly one', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pp-bt14-'));
  try {
    const { fetchImpl, calls } = makeDouble({ jsonValue: liveBody() });
    const transport = makeTransport(fetchImpl);
    const recordPath = path.join(dir, 'spent.jsonl');
    // Three ledger attempts: each stale-locked refusal still consumes its
    // in-memory attempt (MAJOR-3 rule — a throw after consume is never
    // restored), so recovery needs its own. The durable record is untouched
    // by refusals, which is what lets the owner resume.
    const ledger = createLiveAttemptLedger({ analyses: 3, proposals: 0 });
    const authorize = (runId: string) => (): void => {
      const handle = openSpentRecord(recordPath, { bootstrapApprovalId: 'd9i1-test-bootstrap-bt14' });
      try {
        handle.record({ runId, sha256: 'a'.repeat(64), kind: 'analyze', spentAt: 1 });
      } finally {
        handle.release();
      }
    };
    const attempt = (spend: () => LiveSendAuthorization): Promise<unknown> =>
      transport.respond(
        { kind: 'analyze', runId: 'r', sha256: 'a'.repeat(64), videoBytes: 512, videoPart: realPart() },
        { isCancelled: neverCancelled, onSend: spend },
      );
    const crashed = spawnSync(
      process.execPath,
      [RACER, recordPath, path.join(dir, 'out'), 'abandon', 'unused-run', 'd9i1-test-bootstrap-bt14'],
      { encoding: 'utf8' },
    );
    assert.equal(crashed.status, 0, `abandon child must exit cleanly: ${crashed.stderr}`);
    const lockPath = `${recordPath}.lock`;
    const first = createLiveSendSpender(ledger, 'analyze', authorize('r-1'));
    const second = createLiveSendSpender(ledger, 'analyze', authorize('r-2'));
    const locked = (error: unknown): boolean =>
      error instanceof LiveSpendRecordError && error.code === 'LIVE_RECORD_LOCKED';
    await assert.rejects(attempt(first), locked, 'first stale-locked attempt throws LOCKED');
    await assert.rejects(attempt(second), locked, 'second stale-locked attempt throws LOCKED');
    assert.equal(calls.length, 0, 'zero outbound POSTs while a stale lock is held');
    // Supervised recovery per runbook section 4c: the holder is dead, no
    // companion runs in this test, the lock is cleared by hand.
    const holder = JSON.parse(readFileSync(lockPath, 'utf8')) as { pid: number };
    assert.throws(
      () => process.kill(holder.pid, 0),
      (error: unknown) => (error as NodeJS.ErrnoException).code === 'ESRCH',
      'the holder is dead before the lock is touched',
    );
    unlinkSync(lockPath);
    const recovered = createLiveSendSpender(ledger, 'analyze', authorize('r-3'));
    const c = await attempt(recovered);
    assert.equal((c as { ok: boolean }).ok, true, 'the owner resumes after supervised recovery');
    assert.equal(calls.length, 1, 'exactly one outbound POST across all instances');
    const reopened = openSpentRecord(recordPath);
    assert.equal(reopened.countSpent('analyze'), 1, 'exactly one debit durably recorded');
    reopened.release();
    assert.equal(ledger.left('analyze'), 0, 'both refused attempts and the recovered send are spent');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
