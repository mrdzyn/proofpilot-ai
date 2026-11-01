// UI-C3-02-I4: offline adapter/sanitizer/mock-transport battery. No network,
// environment, filesystem, or clock access; synthetic bytes only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANALYZE_MAX_TOKENS,
  PROPOSE_MAX_TOKENS,
  encodeVideoPart,
  liveEndpoint,
  maxTokensFor,
} from '../../packages/live-analysis/src/baseten-request.ts';
import {
  createMockTransport,
  MOCK_MODEL_LABEL,
  MOCK_TRANSPORT_LABEL,
  MockCancelled,
} from '../../packages/live-analysis/src/mock-transport.ts';
import {
  sanitizeAnalysisResponse,
  sanitizeProposalResponse,
} from '../../packages/live-analysis/src/responses.ts';

const ftyp = (size: number): Uint8Array => {
  const buf = Buffer.alloc(size);
  buf.writeUInt32BE(24, 0);
  buf.write('ftypisom', 4, 'ascii');
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
};

test('L-ENC-1: valid MP4 encodes to a typed video_url data part', () => {
  const out = encodeVideoPart(ftyp(2048));
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.part.type, 'video_url');
  assert.ok(out.part.video_url.url.startsWith('data:video/mp4;base64,'));
  assert.ok(out.base64Chars > 0);
});

test('L-ENC-1: non-MP4, empty, and oversize bytes refused without encoding', () => {
  assert.deepEqual(encodeVideoPart(new Uint8Array(0)), {
    ok: false, code: 'NOT_MP4_BYTES',
  });
  assert.deepEqual(encodeVideoPart(Buffer.from('not a video file, just text........')) , {
    ok: false, code: 'NOT_MP4_BYTES',
  });
  const big = ftyp(25_000_001);
  big[4] = 0x66;
  assert.deepEqual(encodeVideoPart(big), { ok: false, code: 'VIDEO_TOO_LARGE' });
});

test('L-ENC-1: fixed destination and token caps', () => {
  assert.equal(liveEndpoint(), 'https://inference.baseten.co/v1/chat/completions');
  assert.equal(maxTokensFor('analyze'), ANALYZE_MAX_TOKENS);
  assert.equal(maxTokensFor('propose'), PROPOSE_MAX_TOKENS);
  assert.ok(ANALYZE_MAX_TOKENS > 0 && PROPOSE_MAX_TOKENS > 0);
});

test('L-ONE-1: mock transport labels every response and counts exactly one call per request', async () => {
  const transport = createMockTransport({ latencyMs: 0 });
  const req = { kind: 'analyze' as const, runId: 'local-1', sha256: 'a'.repeat(64), videoBytes: 2048 };
  const first = await transport.respond(req);
  const proposed = await transport.respond({ ...req, kind: 'propose' as const, runId: 'local-2' });
  assert.equal(transport.label, MOCK_TRANSPORT_LABEL);
  assert.equal(first.mockModel, MOCK_MODEL_LABEL);
  assert.ok(first.text.length > 0);
  assert.deepEqual(first.usage, { promptTokens: 410, completionTokens: 96, totalTokens: 506 });
  assert.equal(transport.calls.length, 2);
  assert.ok(!('url' in first) && !('endpoint' in first), 'no destination leaves the mock');
  assert.notEqual(first.text, proposed.text, 'analyze and propose fixtures differ');
});

test('L-ONE-1: malformed internal requests throw instead of rendering', async () => {
  const transport = createMockTransport({ latencyMs: 0 });
  await assert.rejects(
    transport.respond({ kind: 'analyze', runId: '', sha256: 'zz', videoBytes: -1 }),
    /refused a malformed internal request/,
  );
  assert.equal(transport.calls.length, 0);
});

test('L-ONE-1: cancellation aborts the mock latency promptly', async () => {
  let cancel = false;
  const transport = createMockTransport({ latencyMs: 5000, shouldCancel: () => cancel });
  const pending = transport.respond({ kind: 'analyze', runId: 'r', sha256: 'b'.repeat(64), videoBytes: 10 });
  cancel = true;
  await assert.rejects(pending, (e: unknown) => e instanceof MockCancelled);
});

test('L-SAN-1: analysis fixture sanitizes to quoted text with pinned usage', () => {
  const out = sanitizeAnalysisResponse({
    mockModel: MOCK_MODEL_LABEL,
    text: 'plain observation text',
    usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
  });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.value.kind, 'analysis');
  assert.equal(out.value.transport, 'mock-fixture');
  assert.equal(out.value.liveInference, false);
});

test('L-SAN-1: analysis envelope violations refused with typed codes', () => {
  for (const [raw, code] of [
    [null, 'BAD_SHAPE'],
    [{ mockModel: 'wrong-model', text: 'x', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }, 'WRONG_MODEL'],
    [{ mockModel: MOCK_MODEL_LABEL, text: 42, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } }, 'BAD_SHAPE'],
    [{ mockModel: MOCK_MODEL_LABEL, text: 'x', usage: { promptTokens: -1, completionTokens: 0, totalTokens: 0 } }, 'BAD_USAGE'],
    [{ mockModel: MOCK_MODEL_LABEL, text: 'x'.repeat(9000), usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } }, 'TEXT_TOO_LONG'],
  ] as const) {
    const out = sanitizeAnalysisResponse(raw);
    assert.equal(out.ok, false);
    if (!out.ok) assert.equal(out.code, code);
  }
});

test('L-SAN-1: valid closed-grammar proposal accepted, hostile text refused without retry', () => {
  const good = sanitizeProposalResponse({
    mockModel: MOCK_MODEL_LABEL,
    text: JSON.stringify({ adjustments: [{ selector: '.promo-overlay', property: 'pointer-events', value: 'none' }] }),
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
  });
  assert.equal(good.ok, true);
  if (!good.ok) return;
  assert.equal(good.value.kind, 'proposal');
  if (good.value.kind !== 'proposal') return;
  assert.deepEqual(good.value.adjustments, [{ selector: '.promo-overlay', property: 'pointer-events', value: 'none' }]);
  assert.ok(good.value.renderedCss.includes('.promo-overlay'));

  const hostile = [
    '<script>alert(1)</script>',
    'not json at all {{{',
    JSON.stringify({ adjustments: [{ selector: 'body', property: 'color', value: 'red' }] }),
    JSON.stringify({ nope: [] }),
    'x'.repeat(9000),
  ];
  for (const text of hostile) {
    const out = sanitizeProposalResponse({
      mockModel: MOCK_MODEL_LABEL,
      text,
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    });
    assert.equal(out.ok, false, text.slice(0, 40));
    if (!out.ok) assert.ok(['BAD_SHAPE', 'TEXT_TOO_LONG', 'PROPOSAL_REJECTED'].includes(out.code));
  }
});
