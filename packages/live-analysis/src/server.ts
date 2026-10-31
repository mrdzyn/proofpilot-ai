/**
 * UI-C3-02-I2/I4: offline localhost companion (mock transport only).
 *
 * Binds 127.0.0.1 only. Serves the dashboard document and the live API
 * same-origin. Every state-bearing endpoint requires Host validation plus a
 * locally validated session; mutating POSTs additionally require an exact
 * same-origin Origin. Pairing codes come only from the owner terminal
 * (`pair` command); permits come only from the owner terminal (`permit`
 * command). The model gate stays D9-blocked: analyze/propose run through the
 * MOCK transport and strict sanitizers, and no live request can be assembled
 * in this slice.
 *
 * No environment reads, no credentials, no network egress, no persistence of
 * raw video/base64/model text. Staged uploads are always deleted.
 */
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { validateBasetenBaseUrl } from './config.ts';
import { checkCompanionRequest, type LiveApiEndpoint } from './request-guard.ts';
import { LocalSessionManager } from './local-session.ts';
import { OfflineMockPermitLedger, type MockPermitKind } from './mock-permits.ts';
import { createMockTransport, MockCancelled, type MockTransport } from './mock-transport.ts';
import { encodeVideoPart } from './baseten-request.ts';
import { sanitizeAnalysisResponse, sanitizeProposalResponse } from './responses.ts';
import { StagedUploads } from './uploads.ts';
import type { ValidatedVideo } from '../../intake/src/media.ts';

export const COMPANION_VERSION = '0.1-i2i4-mock';
export const DEFAULT_PORT = 5188;

export type StartupRefusal = 'ENDPOINT_UNAPPROVED' | 'ADDRESS_IN_USE';

export interface CompanionOptions {
  /** Listener port. Ignored when `bind` is false (dispatch-only use). */
  port?: number;
  /** Bind 127.0.0.1. Set false for socket-free unit testing via `dispatch`. */
  bind?: boolean;
  /** Dashboard dist directory to serve same-origin; null = API only. */
  serveRoot?: string | null;
  baseUrl?: string;
  session?: LocalSessionManager;
  permits?: OfflineMockPermitLedger;
  uploads?: StagedUploads;
  transport?: MockTransport;
  analysesLeft?: number;
  proposalsLeft?: number;
  runTimeoutMs?: number;
  now?: () => number;
}

/** Socket-free request metadata for the dispatch seam (unit tests use this). */
export interface ApiMeta {
  readonly method: string;
  readonly path: string;
  readonly host?: string | null;
  readonly origin?: string | null;
  readonly fetchSite?: string | null;
  readonly contentType?: string | null;
  readonly sessionToken?: string | null;
}

export interface ApiResult {
  readonly status: number;
  readonly body: unknown;
}

export interface Companion {
  readonly port: number;
  readonly serveRoot: string | null;
  readonly sessions: LocalSessionManager;
  readonly permits: OfflineMockPermitLedger;
  readonly uploads: StagedUploads;
  /** Socket-free dispatch: same boundary as HTTP, without a listener. */
  dispatch(meta: ApiMeta, body: Uint8Array): Promise<ApiResult>;
  close(): Promise<void>;
  /** Terminal-only: register a single-use hash-bound mock permit. */
  terminalPermit(kind: MockPermitKind, sha256: string, bytes: number):
    | { ok: true; key: string }
    | { ok: false; code: string };
  /** Terminal-only: revoke sessions, permits, staged bytes; cancel in-flight runs. */
  terminalRevoke(): void;
}

type RunState = 'analyzing' | 'done' | 'refused' | 'cancelled';

interface RunRecord {
  runId: string;
  kind: MockPermitKind;
  sha256: string;
  state: RunState;
  createdAt: number;
  finishedAt: number | null;
  cancelled: boolean;
  result: unknown;
}

function jsonResponse(status: number, body: unknown): ApiResult {
  return { status, body };
}

function refusal(code: string, detail: string, status: number): ApiResult {
  return { status, body: { ok: false, code, detail } };
}

const STATIC_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/** Pure path resolution: null when the request escapes the served root. */
export function resolveStaticPath(serveRoot: string, target: string): string | null {
  const raw = target.split('?')[0] ?? '/';
  if (raw.includes('%') || raw.includes('\\')) return null;
  const rel = raw === '/' ? '/index.html' : raw;
  const resolved = path.normalize(path.join(serveRoot, rel));
  if (resolved !== serveRoot && !resolved.startsWith(`${serveRoot}${path.sep}`)) return null;
  return resolved;
}

export async function createCompanion(options: CompanionOptions = {}): Promise<Companion> {
  const port = options.port ?? DEFAULT_PORT;
  const baseCheck = validateBasetenBaseUrl(options.baseUrl ?? 'https://inference.baseten.co/v1');
  if (!baseCheck.ok) {
    throw Object.assign(new Error(`companion refuses to start: ${baseCheck.code}`), { code: 'ENDPOINT_UNAPPROVED' satisfies StartupRefusal });
  }
  const sessions = options.session ?? new LocalSessionManager();
  const permits = options.permits ?? new OfflineMockPermitLedger();
  const uploads = options.uploads ?? (await StagedUploads.create());
  const now = options.now ?? Date.now;
  const runs = new Map<string, RunRecord>();
  // The default transport aborts promptly when the in-flight run is cancelled;
  // a caller-supplied transport (tests) owns its own policy.
  const transport = options.transport ?? createMockTransport({
    shouldCancel: () => [...runs.values()].some((r) => r.state === 'analyzing' && r.cancelled),
  });
  let analysesLeft = options.analysesLeft ?? 3;
  let proposalsLeft = options.proposalsLeft ?? 1;
  const runTimeoutMs = options.runTimeoutMs ?? 120_000;
  const serveRoot = options.serveRoot ?? null;
  const pendingByKey = new Map<string, string>();
  let verified: ValidatedVideo | null = null;
  let permitCounter = 0;
  let runCounter = 0;
  let busy = false;

  const keyOf = (sha256: string, bytes: number, kind: MockPermitKind): string =>
    `${kind}:${sha256}:${bytes}`;

  function terminalPermit(kind: MockPermitKind, sha256: string, bytes: number):
    | { ok: true; key: string }
    | { ok: false; code: string } {
    if ((kind !== 'analyze' && kind !== 'propose') || !/^[0-9a-f]{64}$/.test(sha256) ||
      !Number.isSafeInteger(bytes) || bytes <= 0 || bytes > 30_000_000) {
      return { ok: false, code: 'INVALID_IDENTITY' };
    }
    permitCounter += 1;
    const ledgerId = `term-${permitCounter}`;
    const issued = permits.issueTerminalMockPermit({ runId: ledgerId, sha256, bytes, kind });
    if (!issued.ok) return { ok: false, code: issued.code };
    pendingByKey.set(keyOf(sha256, bytes, kind), ledgerId);
    return { ok: true, key: keyOf(sha256, bytes, kind) };
  }

  function terminalRevoke(): void {
    sessions.revokeAll();
    permits.revokePending();
    pendingByKey.clear();
    busy = false;
    verified = null;
    for (const run of runs.values()) {
      if (run.state === 'analyzing') {
        run.cancelled = true;
      }
    }
    void uploads.discard();
  }

  function publicStatus(authenticated: boolean): Record<string, unknown> {
    return {
      service: 'ui-c3-02-companion',
      version: COMPANION_VERSION,
      transport: 'mock-fixture (no live inference; D9 pending)',
      paired: authenticated,
      config: { urlOk: true, modelOk: false, d9: 'pending (blocks any live call)' },
      quota: { analysesLeft, proposalsLeft },
      busy,
    };
  }

  async function handleUpload(body: Uint8Array): Promise<ApiResult> {
    verified = null;
    const staged = await uploads.stage(body);
    if (!staged.ok) return refusal(staged.code, staged.detail, 422);
    const checked = await uploads.verify(staged.uploadId);
    if (!checked.ok) {
      return refusal(checked.code, checked.detail, 422);
    }
    verified = checked.video;
    return jsonResponse(200, {
      ok: true,
      uploadId: staged.uploadId,
      sha256: verified.sha256,
      bytes: verified.bytes,
      durationSec: verified.durationSec,
      width: verified.width,
      height: verified.height,
      codec: verified.videoCodec,
    });
  }

  function quotaFor(kind: MockPermitKind): number {
    return kind === 'analyze' ? analysesLeft : proposalsLeft;
  }

  function spendQuota(kind: MockPermitKind): void {
    if (kind === 'analyze') analysesLeft = Math.max(0, analysesLeft - 1);
    else proposalsLeft = Math.max(0, proposalsLeft - 1);
  }

  async function handleAnalyzePropose(kind: MockPermitKind, payload: unknown): Promise<ApiResult> {
    if (typeof payload !== 'object' || payload === null) {
      return refusal('BAD_PAYLOAD', 'request body must be a JSON object', 400);
    }
    const fields = payload as Record<string, unknown>;
    const { uploadId, sha256, bytes } = fields;
    if (typeof uploadId !== 'string' || typeof sha256 !== 'string' || !Number.isSafeInteger(bytes)) {
      return refusal('BAD_PAYLOAD', 'uploadId, sha256 and bytes are required', 400);
    }
    if (quotaFor(kind) <= 0) {
      return refusal('QUOTA_SPENT', 'demo quota exhausted; mock runs stop here', 429);
    }
    if (busy) {
      return refusal('RUN_BUSY', 'another live run is already in flight', 409);
    }
    const ledgerId = pendingByKey.get(keyOf(sha256, bytes as number, kind));
    if (ledgerId === undefined) {
      return refusal('NO_PERMIT', 'no terminal permit names this file and action', 403);
    }
    pendingByKey.delete(keyOf(sha256, bytes as number, kind));
    // Single-use semantics: the mock attempt is consumed even when the
    // staged bytes turn out to be wrong (mirrors the I2 ledger contract).
    const consumed = permits.consumeMockAttempt({ runId: ledgerId, sha256, bytes: bytes as number, kind });
    if (!consumed.ok) {
      await uploads.discard();
      verified = null;
      return refusal(consumed.code, 'stored mock permit could not be consumed', 403);
    }
    if (verified === null || verified.sha256 !== sha256 || verified.bytes !== bytes) {
      await uploads.discard();
      verified = null;
      return refusal('MEDIA_CHANGED', 'staged bytes differ from the validated upload', 422);
    }
    let bytesToEncode: Buffer;
    try {
      bytesToEncode = await uploads.readBytes(verified);
    } catch {
      await uploads.discard();
      verified = null;
      return refusal('MEDIA_CHANGED', 'staged bytes changed before encoding', 422);
    }
    const part = encodeVideoPart(new Uint8Array(bytesToEncode.buffer, bytesToEncode.byteOffset, bytesToEncode.byteLength));
    await uploads.discard();
    verified = null;
    if (!part.ok) {
      return refusal(part.code, 'verified bytes failed wire encoding', 422);
    }
    runCounter += 1;
    const runId = `local-${new Date(now()).toISOString().slice(0, 10)}-${String(runCounter).padStart(3, '0')}`;
    const run: RunRecord = {
      runId, kind, sha256, state: 'analyzing', createdAt: now(), finishedAt: null, cancelled: false, result: null,
    };
    runs.set(runId, run);
    if (runs.size > 20) {
      const oldest = [...runs.values()].filter((r) => r.state !== 'analyzing').sort((a, b) => (a.finishedAt ?? 0) - (b.finishedAt ?? 0))[0];
      if (oldest !== undefined) runs.delete(oldest.runId);
    }
    busy = true;
    const deadline = now() + runTimeoutMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('run exceeded its total time ceiling')), Math.max(0, deadline - now()));
    });
    try {
      const response = await Promise.race([
        transport.respond({ kind, runId, sha256, videoBytes: bytes as number }),
        timeout,
      ]);
      if (run.cancelled) {
        run.state = 'cancelled';
        run.finishedAt = now();
        run.result = { ok: false as const, code: 'CANCELLED', detail: 'run cancelled before the mock response landed' };
        return jsonResponse(200, { ok: true, runId, state: run.state });
      }
      spendQuota(kind);
      const sanitized = kind === 'analyze'
        ? sanitizeAnalysisResponse({ mockModel: response.mockModel, text: response.text, usage: response.usage })
        : sanitizeProposalResponse({ mockModel: response.mockModel, text: response.text, usage: response.usage });
      if (!sanitized.ok) {
        run.state = 'refused';
        run.finishedAt = now();
        run.result = {
          ok: false, code: sanitized.code, detail: sanitized.detail, transport: 'mock-fixture', liveInference: false,
        };
      } else {
        run.state = 'done';
        run.finishedAt = now();
        run.result = { ok: true, ...sanitized.value, runId, sha256, mockModel: response.mockModel };
      }
      return jsonResponse(200, { ok: true, runId, state: run.state });
    } catch (error) {
      run.state = 'cancelled';
      run.finishedAt = now();
      const message = error instanceof Error ? error.message : '';
      const timedOut = message.includes('ceiling');
      const cancelled = error instanceof MockCancelled || message.includes('cancelled');
      run.result = (cancelled || timedOut)
        ? { ok: false, code: timedOut ? 'TIMEOUT' : 'CANCELLED', detail: 'run cancelled or timed out; staged bytes already deleted' }
        : { ok: false, code: 'TRANSPORT_REFUSED', detail: 'mock transport refused the internal request' };
      if (run.result !== null && typeof run.result === 'object' && (run.result as { code: string }).code === 'TRANSPORT_REFUSED') {
        return refusal('TRANSPORT_REFUSED', 'mock transport refused the internal request', 500);
      }
      return jsonResponse(200, { ok: true, runId, state: run.state });
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      busy = false;
    }
  }

  function handleCancel(payload: unknown): ApiResult {
    if (typeof payload !== 'object' || payload === null) {
      return refusal('BAD_PAYLOAD', 'runId is required', 400);
    }
    const runId: unknown = (payload as Record<string, unknown>)['runId'];
    if (typeof runId !== 'string') {
      return refusal('BAD_PAYLOAD', 'runId is required', 400);
    }
    const run = runs.get(runId);
    if (run === undefined) return refusal('NO_SUCH_RUN', 'unknown run id', 404);
    if (run.state !== 'analyzing') return refusal('NOT_RUNNING', 'run is not in flight', 409);
    run.cancelled = true;
    return jsonResponse(200, { ok: true, runId, state: 'cancelled' as const });
  }

  function parseJson(bytes: Uint8Array): { ok: true; value: unknown } | { ok: false } {
    if (bytes.length === 0) return { ok: true, value: {} };
    try {
      return { ok: true, value: JSON.parse(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('utf8')) };
    } catch {
      return { ok: false };
    }
  }

  /**
   * The full loopback boundary as pure logic: Host/Origin/fetch-metadata
   * policy, session authentication, and endpoint handling. The HTTP layer
   * only streams bytes and serves static files around this function.
   */
  async function dispatch(meta: ApiMeta, body: Uint8Array): Promise<ApiResult> {
    const sessionAuthenticated = typeof meta.sessionToken === 'string' && sessions.authenticate(meta.sessionToken);
    const policy = checkCompanionRequest(
      {
        method: meta.method,
        path: meta.path,
        host: meta.host ?? undefined,
        origin: meta.origin ?? undefined,
        fetchSite: meta.fetchSite ?? undefined,
        contentType: meta.contentType ?? undefined,
        bodyBytes: body.length,
      },
      boundPort,
      sessionAuthenticated,
    );
    if (!policy.ok) {
      const status = policy.code === 'SESSION_REQUIRED' ? 401 : policy.code === 'INVALID_ROUTE' ? 404 : 403;
      return refusal(policy.code, 'request refused by the loopback boundary', status);
    }
    if (meta.method === 'GET') {
      if (policy.endpoint === '/api/health') {
        return jsonResponse(200, { ok: true, version: COMPANION_VERSION });
      }
      if (policy.endpoint === '/api/status') {
        return jsonResponse(200, { ok: true, ...publicStatus(sessionAuthenticated) });
      }
      if (policy.endpoint === '/api/events') {
        const runsOut = [...runs.values()].map((r) => ({
          runId: r.runId, kind: r.kind, state: r.state, createdAt: r.createdAt, finishedAt: r.finishedAt,
          result: r.state === 'analyzing' ? null : r.result,
        }));
        return jsonResponse(200, { ok: true, runs: runsOut });
      }
      return refusal('INVALID_ROUTE', 'no such endpoint', 404);
    }
    if (policy.endpoint === '/api/upload') {
      return handleUpload(body);
    }
    const parsed = parseJson(body);
    if (!parsed.ok) {
      return refusal('BAD_JSON', 'request body is not valid JSON', 400);
    }
    if (policy.endpoint === '/api/pair') {
      const value = (parsed.value as Record<string, unknown>)['code'];
      const paired = sessions.pair(value);
      if (!paired.ok) {
        const status = paired.code === 'PAIR_LOCKED' ? 429 : 403;
        return refusal(paired.code, 'pairing refused', status);
      }
      return jsonResponse(200, { ok: true, sessionToken: paired.sessionToken });
    }
    if (policy.endpoint === '/api/cancel') {
      return handleCancel(parsed.value);
    }
    if (policy.endpoint === '/api/analyze' || policy.endpoint === '/api/propose') {
      const kind: MockPermitKind = policy.endpoint === '/api/analyze' ? 'analyze' : 'propose';
      return handleAnalyzePropose(kind, parsed.value);
    }
    return refusal('INVALID_ROUTE', 'no such endpoint', 404);
  }

  function readHttpBody(req: IncomingMessage, limit: number): Promise<{ ok: true; bytes: Buffer } | { ok: false }> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let total = 0;
      let failed = false;
      req.on('data', (chunk: Buffer) => {
        if (failed) return;
        total += chunk.length;
        if (total > limit) {
          failed = true;
          req.destroy();
          resolve({ ok: false });
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (!failed) resolve({ ok: true, bytes: Buffer.concat(chunks) });
      });
      req.on('error', () => {
        if (!failed) {
          failed = true;
          resolve({ ok: false });
        }
      });
    });
  }

  function sendHttp(res: ServerResponse, result: ApiResult): void {
    const text = JSON.stringify(result.body);
    res.writeHead(result.status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(text) });
    res.end(text);
  }

  function sendHttpRefusal(res: ServerResponse, code: string, detail: string, status: number): void {
    sendHttp(res, { status, body: { ok: false, code, detail } });
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';
    const target = req.url ?? '/';

    if (!target.startsWith('/api/')) {
      if (serveRoot === null || (method !== 'GET' && method !== 'HEAD')) {
        sendHttpRefusal(res, 'NOT_FOUND', 'no such document', 404);
        return;
      }
      const resolved = resolveStaticPath(serveRoot, target);
      if (resolved === null) {
        sendHttpRefusal(res, 'NOT_FOUND', 'no such document', 404);
        return;
      }
      try {
        const info = await stat(resolved);
        if (!info.isFile()) {
          sendHttpRefusal(res, 'NOT_FOUND', 'no such document', 404);
          return;
        }
        const ext = path.extname(resolved).toLowerCase();
        const type = STATIC_TYPES[ext] ?? 'application/octet-stream';
        const data = method === 'HEAD' ? null : await readFile(resolved);
        res.writeHead(200, { 'content-type': type, 'content-length': info.size });
        res.end(data);
        return;
      } catch {
        sendHttpRefusal(res, 'NOT_FOUND', 'no such document', 404);
        return;
      }
    }

    const meta: ApiMeta = {
      method,
      path: target,
      host: req.headers.host ?? undefined,
      origin: req.headers.origin ?? undefined,
      fetchSite: (req.headers['sec-fetch-site'] as string | undefined) ?? undefined,
      contentType: req.headers['content-type'] ?? undefined,
      sessionToken: (req.headers['x-live-session'] as string | undefined) ?? undefined,
    };
    if (method === 'GET') {
      // GET bodies are never parsed; a GET that carries one is refused so the
      // request-guard's body-size policy holds end to end.
      if ((req.headers['content-length'] ?? '0') !== '0' || req.headers['transfer-encoding'] !== undefined) {
        sendHttpRefusal(res, 'BAD_BODY_SIZE', 'GET requests must not carry a body', 403);
        return;
      }
      sendHttp(res, await dispatch({ ...meta }, new Uint8Array(0)));
      return;
    }
    // Absolute anti-abuse cap; the guard re-checks the per-endpoint limit.
    const body = await readHttpBody(req, 30_000_000);
    if (!body.ok) {
      return;
    }
    sendHttp(res, await dispatch(meta, new Uint8Array(body.bytes.buffer, body.bytes.byteOffset, body.bytes.byteLength)));
  }

  const server: Server = createHttpServer((req, res) => {
    void route(req, res).catch(() => {
      try {
        sendHttpRefusal(res, 'INTERNAL', 'companion failed closed', 500);
      } catch {
        /* socket already gone */
      }
    });
  });

  let boundPort = port;
  if (options.bind !== false) {
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: NodeJS.ErrnoException): void => {
          if (error.code === 'EADDRINUSE' || error.code === 'EACCES' || error.code === 'EPERM') {
            reject(Object.assign(new Error(`companion cannot bind 127.0.0.1:${port} (${error.code})`), { code: 'ADDRESS_IN_USE' satisfies StartupRefusal }));
          } else {
            reject(error);
          }
        };
        server.once('error', onError);
        server.listen(port, '127.0.0.1', () => {
          server.off('error', onError);
          const address = server.address();
          if (typeof address === 'object' && address !== null) boundPort = address.port;
          resolve();
        });
      });
    } catch (error) {
      await uploads.destroy().catch(() => undefined);
      throw error;
    }
  }

  return {
    port: boundPort,
    serveRoot,
    sessions,
    permits,
    uploads,
    dispatch,
    async close(): Promise<void> {
      if (options.bind !== false) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      await uploads.destroy();
    },
    terminalPermit,
    terminalRevoke,
  };
}

export type CompanionHandle = Awaited<ReturnType<typeof createCompanion>>;
