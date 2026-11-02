/**
 * UI-C3-02-D9 (activation): pure, OFFLINE-ONLY Baseten configuration preflight.
 *
 * This module NEVER reads process.env, credentials, a file, or the network.
 * D9 model approval is recorded below as the exact direct-Baseten identifier
 * (owner decision 2026-11-02, PR #34 authorization; corroborated by the
 * official Baseten Model APIs documentation). The approval is a single
 * source literal compared by exact string equality only — never assigned
 * from configuration, never translated, never a fallback.
 */
export const BASETEN_APPROVED_BASE_URL = 'https://inference.baseten.co/v1' as const;
export const BASETEN_APPROVED_ENDPOINT = 'https://inference.baseten.co/v1/chat/completions' as const;
export const BASETEN_DOCUMENTED_DIRECT_MODEL = 'meta-models/muse-spark-open' as const;

/**
 * Owner-approved synthetic demonstration media for a positive live-analysis
 * budget: the certified F01 mobile recording SHA-256 (owner authorization
 * recorded on PR #34: one F01 analysis, zero proposals). The production
 * `--live` CLI requires byte-identical equality for any positive
 * live-analysis budget; omission, mismatch, and malformed pins refuse before
 * the companion starts. Compared by exact string equality only.
 */
export const APPROVED_F01_MEDIA_SHA256 = 'e9df68b14c48300818f9ec9407b884413037f29305f17a5da3cc4fac05eeafdf' as const;

/**
 * D9 live-model approval. APPROVED: exactly one direct-Baseten identifier
 * may pass the live gate — `meta-models/muse-spark-open`, byte-identical to
 * `BASETEN_DOCUMENTED_DIRECT_MODEL` (asserted in tests). Any other value —
 * aliases (`meta/muse-spark-open`), dated variants, empty, or non-strings —
 * refuses with MODEL_UNAVAILABLE_OR_UNAPPROVED. Compared by exact string
 * equality only: never assigned from configuration, never translated, never
 * a fallback. The null-approval path no longer exists: every live gate
 * compares against this literal, so removing it fails the build.
 */
export const D9_APPROVED_MODEL: string = 'meta-models/muse-spark-open';

export type LiveModelResult =
  | Readonly<{ ok: true; model: string }>
  | Readonly<{ ok: false; code: 'MODEL_UNAVAILABLE_OR_UNAPPROVED' }>;

export type ConfigRefusalCode = 'ENDPOINT_UNAPPROVED' | 'MODEL_UNAVAILABLE_OR_UNAPPROVED';

export type BaseUrlResult =
  | { readonly ok: true; readonly baseUrl: typeof BASETEN_APPROVED_BASE_URL; readonly endpoint: typeof BASETEN_APPROVED_ENDPOINT }
  | { readonly ok: false; readonly code: 'ENDPOINT_UNAPPROVED' };

export type LiveConfigurationResult =
  | { readonly ok: false; readonly code: ConfigRefusalCode; readonly blockedBy: 'URL_GATE' | 'D9' };

/** Rejects non-strings, URL confusion, ports, credentials, query, fragment, and unexpected paths. */
export function validateBasetenBaseUrl(value: unknown): BaseUrlResult {
  // Exact lexical prescreen rejects explicit :443, username, escaped hosts,
  // URL parser normalization surprises, extra slashes and whitespace.
  if (typeof value !== 'string' || !/^https:\/\/inference\.baseten\.co\/v1\/?$/.test(value)) {
    return { ok: false, code: 'ENDPOINT_UNAPPROVED' };
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, code: 'ENDPOINT_UNAPPROVED' };
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'inference.baseten.co' ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== '' ||
    (url.pathname !== '/v1' && url.pathname !== '/v1/')
  ) {
    return { ok: false, code: 'ENDPOINT_UNAPPROVED' };
  }
  // Construct from validated constants. Never concatenate raw config values.
  return { ok: true, baseUrl: BASETEN_APPROVED_BASE_URL, endpoint: BASETEN_APPROVED_ENDPOINT };
}

/**
 * Offline production boundary: evaluated WITHOUT credentials, this function
 * NEVER authorizes a live call — every input refuses, before and after D9.
 * Offline evaluation cannot see the owner-started key, so no offline answer
 * may imply live permission. No model alias, fallback, provider mapping,
 * environment override, or implicit approval is possible here.
 */
export function evaluateOfflineLiveConfiguration(input: Readonly<{ baseUrl: unknown; model: unknown }>): LiveConfigurationResult {
  const url = validateBasetenBaseUrl(input.baseUrl);
  if (!url.ok) {
    return { ok: false, code: 'ENDPOINT_UNAPPROVED', blockedBy: 'URL_GATE' };
  }
  // The model value is intentionally not echoed or treated as authority.
  void input.model;
  return { ok: false, code: 'MODEL_UNAVAILABLE_OR_UNAPPROVED', blockedBy: 'D9' };
}

/**
 * D9 live-model gate: the single authorization point for Baseten live
 * inference. Only the byte-identical D9-approved ID passes; aliases,
 * translations, fallbacks, empty, and non-strings refuse. Pure: no I/O,
 * no env, no network.
 */
export function validateLiveModel(value: unknown): LiveModelResult {
  if (typeof value !== 'string' || value.length === 0) {
    return { ok: false, code: 'MODEL_UNAVAILABLE_OR_UNAPPROVED' };
  }
  if (value !== D9_APPROVED_MODEL) {
    return { ok: false, code: 'MODEL_UNAVAILABLE_OR_UNAPPROVED' };
  }
  return { ok: true, model: value };
}
