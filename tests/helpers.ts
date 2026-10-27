import type { FetchLike } from '../packages/inference/src/index.ts';

export const SENTINEL_KEY = 'pp-test-sentinel-key-4f1d9a77c2';

export type RecordedCall = { url: string; init: RequestInit };

/** Mock fetch that replays queued responses (or throws queued errors) and records calls. */
export function mockFetch(queue: Array<Response | Error | (() => Promise<Response>)>) {
  const calls: RecordedCall[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (!next) throw new Error('mockFetch: no queued response');
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next() : next;
  };
  return { fetch, calls };
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

export const metaEnv = (extra: Record<string, string> = {}) => ({ MODEL_API_KEY: SENTINEL_KEY, ...extra });

// ---------- C2A video helpers ----------
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateVideoFile, type MediaDeps, type MediaProbe, type ValidatedVideo } from '../packages/intake/src/index.ts';
import { createProvider, loadProviderConfig, type InferenceProvider } from '../packages/inference/src/index.ts';

/** Minimal bytes with a real MP4 `ftyp` signature. Not decodable: tests that need decoding use ffmpeg. */
export function fakeMp4Bytes(totalBytes = 2_048, fill = 0x41): Buffer {
  const head = Buffer.concat([
    Buffer.from([0, 0, 0, 0x20]),
    Buffer.from('ftypisom', 'latin1'),
    Buffer.from([0, 0, 2, 0]),
    Buffer.from('isomiso2avc1mp41', 'latin1'),
  ]);
  return Buffer.concat([head, Buffer.alloc(Math.max(0, totalBytes - head.length), fill)]);
}

export const goodProbe = (over: Partial<MediaProbe> = {}): MediaProbe => ({
  formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
  formatDurationSec: 10,
  streams: [{ codecType: 'video', codecName: 'h264', durationSec: 10, width: 390, height: 844 }],
  ...over,
});

export const fakeDeps = (probe: MediaProbe = goodProbe(), decodeOk = true): MediaDeps => ({
  probe: async () => probe,
  decodeCheck: async () => ({ ok: decodeOk, detail: decodeOk ? '' : 'Invalid data found' }),
});

export function tempDir(prefix = 'pp-test-'): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Writes a fake MP4 and runs it through the real validator with injected probe results. */
export async function makeValidatedVideo(opts: { probe?: MediaProbe; name?: string; bytes?: Buffer } = {}): Promise<{ video: ValidatedVideo; dir: string; file: string; bytes: Buffer }> {
  const dir = tempDir();
  const file = path.join(dir, opts.name ?? 'clip.mp4');
  const bytes = opts.bytes ?? fakeMp4Bytes();
  writeFileSync(file, bytes);
  const video = await validateVideoFile(file, { deps: fakeDeps(opts.probe) });
  return { video, dir, file, bytes };
}

export const validSymptom = (over: Record<string, unknown> = {}) => ({
  summary: 'Tapping Add to cart does not change the cart counter.',
  expected: 'The cart count increases to 1 after tapping Add to cart.',
  actual: 'The cart count stays at 0 after the tap.',
  observations: [
    { timestampSec: 2.0, text: 'Product page with Add to cart button and cart count 0.', confidence: 'high' },
    { timestampSec: 4.5, text: 'A tap on Add to cart; the cart count remains 0.', confidence: 'medium' },
  ],
  reproductionSteps: [
    { action: 'open', target: 'product page at 390x844', approximateTimeSec: 0.5 },
    { action: 'tap', target: 'Add to cart button', approximateTimeSec: 4.5 },
  ],
  confidence: 'medium',
  uncertainties: ['Cannot tell from the video why the tap has no effect.'],
  unsupportedClaims: [],
  sufficientContext: true,
  ...over,
});

export const insufficientSymptom = () =>
  validSymptom({
    summary: 'A checkout-like page is shown but no clear failing interaction is visible.',
    expected: 'Unknown.',
    actual: 'No visible error or interaction outcome.',
    observations: [{ timestampSec: 1.0, text: 'A form is shown.', confidence: 'low' }],
    reproductionSteps: [],
    confidence: 'low',
    uncertainties: ['No interaction with a control is visible.', 'The expected outcome is not stated.'],
    sufficientContext: false,
  });

export const FILE_ID = 'file-842549258569145';

export const uploadOk = (headers: Record<string, string> = { 'x-request-id': 'req-up' }) =>
  json({ id: FILE_ID, object: 'file', bytes: 2048, created_at: 1714502400, filename: 'x.mp4', purpose: 'user_data', status: 'uploaded', expires_at: 1714506000 }, 200, headers);

export const responsesOk = (text: string, extra: Record<string, unknown> = {}) =>
  json(
    { id: 'resp_1', model: 'muse-spark-1.3', output: [{ type: 'message', content: [{ type: 'output_text', text }] }], usage: { input_tokens: 1200, output_tokens: 300 }, ...extra },
    200,
    { 'x-request-id': 'req-resp' },
  );

export const deleteOk = () => json({ id: FILE_ID, object: 'file', deleted: true });

export const liveEnv = (extra: Record<string, string> = {}) => ({
  MODEL_API_KEY: SENTINEL_KEY,
  PROOFPILOT_ALLOW_BILLABLE_CALLS: '1',
  PROOFPILOT_ALLOW_VIDEO_UPLOAD: '1',
  ...extra,
});

export function metaProvider(queue: Parameters<typeof mockFetch>[0], env: Record<string, string> = liveEnv()): { provider: InferenceProvider; calls: RecordedCall[] } {
  const m = mockFetch(queue);
  return { provider: createProvider(loadProviderConfig('meta', env), { fetch: m.fetch }), calls: m.calls };
}

/** Fake clock advancing 10 ms per reading. */
export const fakeClock = () => {
  let t = 0;
  return () => (t += 10);
};
