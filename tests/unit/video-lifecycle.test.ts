// C2B: Responses lifecycle handling (documented `status`: completed | failed | in_progress |
// cancelled | queued | incomplete; `error` and `incomplete_details` are objects or null).
// Mocked transport only; nothing here touches the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVideoConsent } from '../../packages/intake/src/index.ts';
import { analyzeRecording } from '../../packages/inference/src/index.ts';
import { deleteOk, fakeClock, json, makeValidatedVideo, metaProvider, responsesOk, SENTINEL_KEY, uploadOk, validSymptom } from '../helpers.ts';

const goodText = () => JSON.stringify(validSymptom());

async function run(queue: Parameters<typeof metaProvider>[0]) {
  const { video } = await makeValidatedVideo();
  const { provider, calls } = metaProvider(queue);
  const result = await analyzeRecording({ provider, video, consent: createVideoConsent({ runId: 'run-1', videoSha256: video.sha256 }), runId: 'run-1', clock: fakeClock() });
  return { result, calls };
}
const withStatus = (extra: Record<string, unknown>) => responsesOk(goodText(), extra);

function assertFailedButCleaned(r: Awaited<ReturnType<typeof run>>, providerErrorCode?: string | null) {
  assert.equal(r.result.status, 'ANALYSIS_FAILED');
  if (r.result.status !== 'ANALYSIS_FAILED') return;
  assert.equal(r.result.failure.code, 'RESPONSE_NOT_COMPLETED');
  if (providerErrorCode !== undefined) assert.equal(r.result.failure.providerErrorCode, providerErrorCode);
  assert.equal(r.calls.length, 3, 'upload, one generation, one delete: no retry');
  assert.equal(r.calls[2]!.init.method, 'DELETE');
  assert.equal(r.result.provenance.cleanup.deleted, true);
  assert.equal(r.result.provenance.rawResponse, null, 'text of a non-completed response is discarded');
  assert.equal(r.result.provenance.responseLifecycle?.completed, false);
}

for (const status of ['failed', 'in_progress', 'cancelled', 'queued', 'incomplete']) {
  test(`status=${status} with a perfectly valid-looking output is ANALYSIS_FAILED, never VIDEO_ANALYZED`, async () => {
    const r = await run([uploadOk(), withStatus({ status }), deleteOk()]);
    assertFailedButCleaned(r, status);
    if (r.result.status === 'ANALYSIS_FAILED') {
      assert.match(r.result.failure.message, new RegExp(`status=${status}`));
      assert.deepEqual(r.result.provenance.usage?.inputTokens, 1200, 'billed usage is still recorded');
      assert.equal(r.result.provenance.requestIds.response, 'req-resp');
    }
  });
}

test('unknown, non-string and odd status values fail closed', async () => {
  for (const status of ['done', 'COMPLETED', 'completed ', 123, true, {}, ['completed'], 'x'.repeat(200)]) {
    const r = await run([uploadOk(), withStatus({ status }), deleteOk()]);
    assertFailedButCleaned(r, 'unrecognized');
  }
});

test('an absent or null status is accepted (the schema makes it optional) when nothing else is wrong', async () => {
  for (const extra of [{}, { status: null }, { status: 'completed' }, { status: 'completed', error: null, incomplete_details: null }]) {
    const r = await run([uploadOk(), withStatus(extra), deleteOk()]);
    assert.equal(r.result.status, 'VIDEO_ANALYZED', JSON.stringify(extra));
  }
});

test('an error object fails the analysis even when status says completed', async () => {
  const r = await run([uploadOk(), withStatus({ status: 'completed', error: { code: 'server_error', message: 'boom' } }), deleteOk()]);
  assertFailedButCleaned(r, 'server_error');
});

test('incomplete_details fails the analysis (e.g. output cut off by max_output_tokens)', async () => {
  const r = await run([uploadOk(), withStatus({ status: 'completed', incomplete_details: { reason: 'max_output_tokens' } }), deleteOk()]);
  assertFailedButCleaned(r, 'max_output_tokens');
  const r2 = await run([uploadOk(), withStatus({ incomplete_details: {} }), deleteOk()]);
  assertFailedButCleaned(r2, 'unspecified');
});

test('a refusal content part fails the analysis', async () => {
  const body = json({ id: 'resp_r', model: 'muse-spark-1.3', status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'I cannot help with that.' }] }] }, 200, { 'x-request-id': 'req-r' });
  const r = await run([uploadOk(), body, deleteOk()]);
  assertFailedButCleaned(r);
  if (r.result.status === 'ANALYSIS_FAILED') assert.match(r.result.failure.message, /refusal/);
});

test('provider free text in error/incomplete objects never reaches the result; only short codes do', async () => {
  const leak = `see ${SENTINEL_KEY} and https://evil.example/x`;
  const r = await run([uploadOk(), withStatus({ status: 'failed', error: { code: leak, message: leak } }), deleteOk()]);
  assertFailedButCleaned(r, 'unspecified');
  assert.ok(!JSON.stringify(r.result).includes(SENTINEL_KEY));
  assert.ok(!JSON.stringify(r.result).includes('evil.example'));
});

test('failed status with no output at all is still RESPONSE_NOT_COMPLETED (not an empty-response error), file deleted', async () => {
  const r = await run([uploadOk(), json({ id: 'resp_f', model: 'muse-spark-1.3', status: 'failed', error: { code: 'server_error' }, output: [], usage: { input_tokens: 5, output_tokens: 0 } }, 200, { 'x-request-id': 'req-f' }), deleteOk()]);
  assertFailedButCleaned(r, 'server_error');
});

test('a completed response with no text is still an invalid response', async () => {
  const r = await run([uploadOk(), json({ id: 'resp_e', model: 'muse-spark-1.3', status: 'completed', output: [] }), deleteOk()]);
  assert.equal(r.result.status, 'ANALYSIS_FAILED');
  if (r.result.status === 'ANALYSIS_FAILED') assert.equal(r.result.failure.code, 'EMPTY_OR_INVALID_RESPONSE');
  assert.equal(r.calls.length, 3);
});

test('usage is captured in full when the provider reports it', async () => {
  const r = await run([
    uploadOk(),
    withStatus({ status: 'completed', usage: { input_tokens: 9000, output_tokens: 400, total_tokens: 9400, output_tokens_details: { reasoning_tokens: 120 }, video_frames_processed: 30 } }),
    deleteOk(),
  ]);
  assert.equal(r.result.status, 'VIDEO_ANALYZED');
  assert.deepEqual(r.result.provenance.usage, { inputTokens: 9000, outputTokens: 400, totalTokens: 9400, reasoningTokens: 120, videoFramesProcessed: 30 });
  assert.equal(r.result.provenance.respondedModel, 'muse-spark-1.3');
});

test('live-smoke request envelope: one generation, 3072 output tokens, low reasoning, 3600 s expiry, no tools/search, no retry', async () => {
  const r = await run([uploadOk(), responsesOk(goodText()), deleteOk()]);
  const [up, gen, del] = r.calls;
  assert.deepEqual(r.calls.map((c) => `${c.init.method} ${new URL(c.url).pathname}`), ['POST /v1/files', 'POST /v1/responses', 'DELETE /v1/files/file-842549258569145']);
  const form = up!.init.body as FormData;
  assert.equal(form.get('expires_after[seconds]'), '3600');
  assert.equal(form.get('expires_after[anchor]'), 'created_at');
  const body = JSON.parse(String(gen!.init.body));
  assert.equal(body.max_output_tokens, 3072);
  assert.deepEqual(body.reasoning, { effort: 'low' });
  assert.ok(body.max_output_tokens <= 4096, 'stays within the shared validation ceiling');
  assert.equal(body.model, 'muse-spark-1.3');
  for (const k of ['tools', 'tool_choice', 'web_search', 'previous_response_id', 'background', 'stream', 'store']) assert.ok(!(k in body), `request must not set ${k}`);
  assert.ok(del);
});

test('R1: the reasoning setting is sent only on native video Responses, never on the text path', async () => {
  const { provider, calls } = metaProvider([json({ id: 'r', model: 'muse-wonder-1.0', output: [{ type: 'message', content: [{ type: 'output_text', text: 'hi' }] }] })]);
  await provider.generateText({ model: 'muse-wonder-1.0', prompt: 'hello', maxOutputTokens: 16 });
  const body = JSON.parse(String(calls[0]!.init.body));
  assert.ok(!('reasoning' in body), 'text generation is unchanged');
  assert.equal(body.max_output_tokens, 16);
});

test('R1: the shared 4096-token ceiling is unchanged and applies to video requests', async () => {
  const { video } = await makeValidatedVideo();
  for (const [tokens, ok] of [[4096, true], [4097, false], [0, false]] as const) {
    const { provider, calls } = metaProvider([uploadOk(), responsesOk(goodText()), deleteOk()]);
    const p = analyzeRecording({ provider, video, consent: createVideoConsent({ runId: 'run-1', videoSha256: video.sha256 }), runId: 'run-1', maxOutputTokens: tokens, clock: fakeClock() });
    if (ok) {
      assert.equal((await p).status, 'VIDEO_ANALYZED');
    } else {
      await assert.rejects(p, (e: any) => e.code === 'INVALID_INPUT');
      assert.equal(calls.length, 0, 'an invalid cap is refused before any upload');
    }
  }
});

test('R1: still incomplete at the larger cap is a failure, with the file deleted and no second generation', async () => {
  const r = await run([uploadOk(), withStatus({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, usage: { input_tokens: 2773, output_tokens: 3072, total_tokens: 5845, output_tokens_details: { reasoning_tokens: 900 } } }), deleteOk()]);
  assertFailedButCleaned(r, 'max_output_tokens');
});
