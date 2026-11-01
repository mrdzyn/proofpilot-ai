/**
 * UI-C3-02-I1: pure, OFFLINE-ONLY Baseten configuration preflight.
 *
 * This module NEVER reads process.env, credentials, a file, or the network.
 * D9 model approval is deliberately absent: no model can pass the production
 * live gate until a separately authorized, independently reviewed change
 * records the exact direct-Baseten model identifier.
 */
export const BASETEN_APPROVED_BASE_URL = 'https://inference.baseten.co/v1' as const;
export const BASETEN_APPROVED_ENDPOINT = 'https://inference.baseten.co/v1/chat/completions' as const;
export const BASETEN_DOCUMENTED_DIRECT_MODEL = 'meta-models/muse-spark-open' as const;

/**
 * D9 live-model approval. PENDING (`null`): no model ID is approved, so no
 * live request can be authorized. A separately authorized, independently
 * reviewed D9 decision records the exact direct-Baseten identifier here;
 * until then every live path refuses with MODEL_UNAVAILABLE_OR_UNAPPROVED.
 * This constant is compared by exact string equality only — never assigned
 * from configuration, never translated, never a fallback.
 */
export const D9_APPROVED_MODEL: string | null = null;

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
 * Pre-D9 production boundary: all model IDs are refused, INCLUDING the
 * documented direct-Baseten ID. No model alias, fallback, provider mapping,
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
 * inference. While `D9_APPROVED_MODEL` is `null` (pending) every value —
 * including the documented direct-Baseten ID — refuses. After a D9 decision
 * records the exact ID, only that byte-identical value passes; aliases,
 * translations, and fallbacks never do. Pure: no I/O, no env, no network.
 */
export function validateLiveModel(value: unknown): LiveModelResult {
  if (typeof value !== 'string' || value.length === 0) {
    return { ok: false, code: 'MODEL_UNAVAILABLE_OR_UNAPPROVED' };
  }
  if (D9_APPROVED_MODEL === null) {
    return { ok: false, code: 'MODEL_UNAVAILABLE_OR_UNAPPROVED' };
  }
  if (value !== D9_APPROVED_MODEL) {
    return { ok: false, code: 'MODEL_UNAVAILABLE_OR_UNAPPROVED' };
  }
  return { ok: true, model: value };
}
