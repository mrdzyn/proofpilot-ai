/**
 * UI-C3-02-D9 (activation): owner-supervised, NON-INFERENCE account-availability
 * preflight.
 *
 * Exactly one GET to the non-billable `/v1/models` catalog endpoint through
 * an injected fetch — no request body, no inference, no retries, no other
 * network. The caller (owner-operated CLI only) supplies the key; this module
 * never reads process.env, never prints or returns the key, and every
 * failure detail is key-free by construction (codes, counts, and the public
 * endpoint/model strings only).
 *
 * Success does NOT authorize inference: it reports that the account answers
 * and whether the D9-approved exact model is listed for this key. A listed
 * model still requires the reviewed activation path, a fresh approval, and
 * the explicit one-shot owner command before any send.
 */
import {
  BASETEN_APPROVED_BASE_URL,
  validateBasetenBaseUrl,
  validateLiveModel,
} from './config.ts';

/** Minimal structural GET surface: fully injectable, no ambient network. */
export interface PreflightFetch {
  (url: string, init: {
    readonly method: 'GET';
    readonly headers: Record<string, string>;
    readonly signal: AbortSignal;
    readonly redirect: 'error';
  }): Promise<{ readonly status: number; readonly url: string; json(): Promise<unknown> }>;
}

export interface PreflightInput {
  readonly baseUrl: unknown;
  readonly model: unknown;
  readonly apiKey: unknown;
}

export type PreflightResult =
  | Readonly<{ ok: true; modelListed: boolean; catalogCount: number; endpoint: string }>
  | Readonly<{ ok: false; code: PreflightRefusalCode; detail: string }>;

export type PreflightRefusalCode =
  | 'PREFLIGHT_MISCONFIGURED'
  | 'PREFLIGHT_UNAUTHORIZED'
  | 'PREFLIGHT_HTTP'
  | 'PREFLIGHT_SHAPE';

/**
 * Check account availability without inference. Returns key-free results:
 * the approved model id and public endpoint strings are safe to print; the
 * key must never appear in any result, log, or error derived from this
 * function.
 */
export async function checkAccountAvailability(
  fetchImpl: PreflightFetch,
  input: PreflightInput,
): Promise<PreflightResult> {
  const url = validateBasetenBaseUrl(input.baseUrl);
  if (!url.ok) {
    return { ok: false, code: 'PREFLIGHT_MISCONFIGURED', detail: 'live base URL is not approved' };
  }
  const model = validateLiveModel(input.model);
  if (!model.ok) {
    return { ok: false, code: 'PREFLIGHT_MISCONFIGURED', detail: 'model is not the D9-approved exact ID' };
  }
  if (typeof input.apiKey !== 'string' || input.apiKey.length === 0) {
    return { ok: false, code: 'PREFLIGHT_MISCONFIGURED', detail: 'API key is missing' };
  }
  const approved = model.model;
  const endpoint = `${url.baseUrl}/models`;
  let status: number;
  let payload: unknown;
  try {
    const response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: { Authorization: `Bearer ${input.apiKey}` },
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    });
    status = response.status;
    // Credential rejection is classified before touching the body: an
    // unauthorized response with a non-JSON body is still UNAUTHORIZED, not
    // a shape fault. Either way the preflight fails closed with zero
    // inference and a key-free detail.
    if (status === 401 || status === 403) {
      return { ok: false, code: 'PREFLIGHT_UNAUTHORIZED', detail: 'the account rejected the key; no inference attempted' };
    }
    try {
      payload = await response.json();
    } catch {
      return { ok: false, code: 'PREFLIGHT_SHAPE', detail: 'catalog response was not a model list' };
    }
  } catch {
    return { ok: false, code: 'PREFLIGHT_HTTP', detail: 'catalog request failed before a response' };
  }
  if (status < 200 || status > 299) {
    return { ok: false, code: 'PREFLIGHT_HTTP', detail: `catalog endpoint refused with HTTP ${String(status)}` };
  }
  if (!isModelCatalog(payload)) {
    return { ok: false, code: 'PREFLIGHT_SHAPE', detail: 'catalog response was not a model list' };
  }
  const listed = payload.data.some((entry) => entry.id === approved);
  return { ok: true, modelListed: listed, catalogCount: payload.data.length, endpoint: BASETEN_APPROVED_BASE_URL };
}

function isModelCatalog(payload: unknown): payload is { data: Array<{ id: string }> } {
  if (typeof payload !== 'object' || payload === null) return false;
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return false;
  return data.every((entry) =>
    typeof entry === 'object' && entry !== null &&
    typeof (entry as { id?: unknown }).id === 'string');
}
