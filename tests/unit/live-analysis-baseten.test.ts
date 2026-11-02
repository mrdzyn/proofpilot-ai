// UI-C3-02-BT-LIVE-01: offline Baseten transport contract. No network, no
// environment, no credentials: every call goes through an injected fetch
// double with a fake key. Pins the exact request shape, single-call/no-retry
// behavior, cancellation, deadline, typed refusals, and redaction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
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
  hooks: { isCancelled: () => boolean; onSend: () => void };
  sent: { count: number };
} {
  const sent = { count: 0 };
  return { hooks: { isCancelled: cancelled, onSend: () => { sent.count += 1; } }, sent };
}

test('L-BT-1: construction pins the exact documented model and refuses aliases', () => {
  const { fetchImpl } = makeDouble();
  for (const bad of [
    'meta/muse-spark-open',
    'meta-models/muse-spark-open-1026',
    'meta-models/other-model',
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
