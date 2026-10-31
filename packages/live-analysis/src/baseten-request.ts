/**
 * UI-C3-02-I4: pure Baseten request-part encoding for the offline companion.
 *
 * What this module does: encode hash-verified MP4 bytes as the typed
 * `video_url` data-URL part, enforce size/token caps, and expose the fixed
 * destination constants from the I1 allowlist. What it deliberately does NOT
 * do: assemble a live request (no model field, no API key, no transport).
 * The full live body — endpoint + approved model + credentials — can only be
 * assembled by a future D9-authorized change; until then D9 stays pending and
 * the only consumer of these parts is the mock transport path.
 */
import { BASETEN_APPROVED_ENDPOINT } from './config.ts';

/** Matches the intake product cap so staged uploads always fit the wire cap. */
export const MAX_VIDEO_BYTES = 25_000_000;
/** Provider inline/base64 request-body cap for Muse Spark Open (100 MiB). */
export const MAX_INLINE_BODY_BYTES = 100 * 1024 * 1024;
/** Fixed generation caps from the approved architecture. */
export const ANALYZE_MAX_TOKENS = 1024;
export const PROPOSE_MAX_TOKENS = 512;

export type VideoPartRefusal = 'NOT_MP4_BYTES' | 'VIDEO_TOO_LARGE' | 'BODY_TOO_LARGE';

export type VideoPartResult =
  | Readonly<{
    ok: true;
    part: Readonly<{ type: 'video_url'; video_url: Readonly<{ url: string }> }>;
    base64Chars: number;
  }>
  | Readonly<{ ok: false; code: VideoPartRefusal }>;

const MP4_FTYP = [0x66, 0x74, 0x79, 0x70]; // 'ftyp' at offset 4

function looksLikeMp4(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    MP4_FTYP.every((b, i) => bytes[4 + i] === b)
  );
}

/**
 * Encode verified MP4 bytes as an inline `video_url` data-URL part.
 * Refuses non-MP4 bytes and anything that would exceed the provider's
 * inline body cap. Pure: no I/O, no clock, no secrets.
 */
export function encodeVideoPart(videoBytes: Uint8Array): VideoPartResult {
  if (!(videoBytes instanceof Uint8Array) || videoBytes.length === 0) {
    return { ok: false, code: 'NOT_MP4_BYTES' };
  }
  if (videoBytes.length > MAX_VIDEO_BYTES) return { ok: false, code: 'VIDEO_TOO_LARGE' };
  if (!looksLikeMp4(videoBytes)) return { ok: false, code: 'NOT_MP4_BYTES' };
  const base64 = Buffer.from(videoBytes.buffer, videoBytes.byteOffset, videoBytes.byteLength).toString('base64');
  const url = `data:video/mp4;base64,${base64}`;
  if (url.length > MAX_INLINE_BODY_BYTES) return { ok: false, code: 'BODY_TOO_LARGE' };
  return {
    ok: true,
    part: { type: 'video_url', video_url: { url } },
    base64Chars: base64.length,
  };
}

/** The single permitted destination, re-exported from the I1 allowlist. No other endpoint exists. */
export function liveEndpoint(): typeof BASETEN_APPROVED_ENDPOINT {
  return BASETEN_APPROVED_ENDPOINT;
}

/** Generation caps are fixed; callers cannot raise them. */
export function maxTokensFor(kind: 'analyze' | 'propose'): number {
  return kind === 'analyze' ? ANALYZE_MAX_TOKENS : PROPOSE_MAX_TOKENS;
}
