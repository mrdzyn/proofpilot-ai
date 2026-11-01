/**
 * UI-C3-02-I2: pure request-boundary policy for a FUTURE loopback companion.
 * This file does not create a server, inspect secrets, or make network calls.
 * The future listener MUST bind only to 127.0.0.1 and pass the *raw*
 * method/path/headers, including a separately authenticated session result.
 */
export type LiveApiEndpoint =
  | '/api/health'
  | '/api/pair'
  | '/api/status'
  | '/api/events'
  | '/api/upload'
  | '/api/analyze'
  | '/api/propose'
  | '/api/cancel';

export type RequestMetadata = Readonly<{
  method: string;
  path: string;
  host: string | null | undefined;
  origin?: string | null;
  fetchSite?: string | null;
  contentType?: string | null;
  bodyBytes?: number;
}>;

export type RequestRefusal =
  | 'BAD_HOST'
  | 'INVALID_ROUTE'
  | 'BAD_ORIGIN'
  | 'BAD_FETCH_METADATA'
  | 'SESSION_REQUIRED'
  | 'BAD_CONTENT_TYPE'
  | 'BAD_BODY_SIZE';

export type RequestPolicyResult =
  | Readonly<{ ok: true; endpoint: LiveApiEndpoint; preSession: boolean }>
  | Readonly<{ ok: false; code: RequestRefusal }>;

const METHODS: Readonly<Record<LiveApiEndpoint, 'GET' | 'POST'>> = Object.freeze({
  '/api/health': 'GET',
  '/api/pair': 'POST',
  '/api/status': 'GET',
  '/api/events': 'GET',
  '/api/upload': 'POST',
  '/api/analyze': 'POST',
  '/api/propose': 'POST',
  // Added by the I2/I4 consolidation slice (mock run cancellation). Same
  // policy class as the other mutating POSTs: exact same-origin Origin,
  // validated session, JSON body cap. Existing I2 refusal tests unaffected.
  '/api/cancel': 'POST',
});

const MAX_UPLOAD_BYTES = 30_000_000;
const MAX_JSON_BYTES = 8_192;
const MAX_PAIR_BYTES = 1_024;

/**
 * Header-level gate: it does NOT authenticate the session token by itself.
 * The caller must verify the X-Live-Session header cryptographically using
 * local-session.ts and supply that independent result, not user-supplied JSON.
 *
 * No `Origin` is expected on some legitimate same-origin GETs; a valid
 * session and exact Host remain mandatory. Every POST requires an explicit,
 * exact same-origin Origin; /api/pair is the ONLY pre-session POST exception.
 */
export function checkCompanionRequest(
  request: RequestMetadata,
  port: number,
  sessionAuthenticated: boolean,
): RequestPolicyResult {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, code: 'BAD_HOST' };
  }
  const acceptedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!acceptedHosts.includes(request.host ?? '')) {
    return { ok: false, code: 'BAD_HOST' };
  }

  if (!Object.prototype.hasOwnProperty.call(METHODS, request.path)) {
    return { ok: false, code: 'INVALID_ROUTE' };
  }
  const endpoint = request.path as LiveApiEndpoint;
  if (request.method !== METHODS[endpoint]) {
    return { ok: false, code: 'INVALID_ROUTE' };
  }

  const bodyBytes = request.bodyBytes ?? 0;
  const limit = endpoint === '/api/upload' ? MAX_UPLOAD_BYTES : endpoint === '/api/pair' ? MAX_PAIR_BYTES : MAX_JSON_BYTES;
  if (!Number.isSafeInteger(bodyBytes) || bodyBytes < 0 || bodyBytes > limit || (request.method === 'GET' && bodyBytes !== 0)) {
    return { ok: false, code: 'BAD_BODY_SIZE' };
  }

  if (endpoint === '/api/health') {
    return { ok: true, endpoint, preSession: true };
  }

  const expectedOrigin = `http://${request.host}`;
  const hasOrigin = typeof request.origin === 'string' && request.origin.length > 0;
  if (request.method === 'POST') {
    if (!hasOrigin || request.origin !== expectedOrigin) {
      return { ok: false, code: 'BAD_ORIGIN' };
    }
  } else if (hasOrigin && request.origin !== expectedOrigin) {
    return { ok: false, code: 'BAD_ORIGIN' };
  }

  if (request.fetchSite !== undefined && request.fetchSite !== null && request.fetchSite !== 'same-origin') {
    return { ok: false, code: 'BAD_FETCH_METADATA' };
  }
  if (endpoint !== '/api/pair' && !sessionAuthenticated) {
    return { ok: false, code: 'SESSION_REQUIRED' };
  }

  if (request.method === 'POST') {
    const content = request.contentType?.toLowerCase().trim() ?? '';
    const valid = endpoint === '/api/upload'
      ? content === 'application/octet-stream'
      : content === 'application/json';
    if (!valid) return { ok: false, code: 'BAD_CONTENT_TYPE' };
  }

  return { ok: true, endpoint, preSession: endpoint === '/api/pair' };
}
