/**
 * UI-C3-02-D9 (activation): fail-closed Baseten live transport.
 *
 * Status: D9 approved, but this module still never performs a live call on
 * its own: the server gate (`validateLiveModel`) is the sole authorization
 * point, only the owner-started `--live` CLI supplies a key and a live
 * transport, and construction is exercised in tests with an injected fetch
 * double and a fake key.
 *
 * Rules enforced here (behavioral + contract tests pin every one):
 * - exact provider/endpoint/model matching: the destination is always the
 *   pinned `BASETEN_APPROVED_ENDPOINT` constant; the model must be the exact
 *   documented direct-Baseten ID (aliases, OpenRouter slugs, and superseded
 *   version pins refuse); the response `model` echo must match byte for
 *   byte or the reply is refused;
 * - one request per approval: exactly one injected POST per `respond`
 *   call, no retries, no fallback, no redirect following (`redirect:
 *   'error'`);
 * - bounded usage: `max_tokens` is fixed per action (`maxTokensFor`); the
 *   body shape is exact (no `response_format`, no extras);
 * - completion validation: only the documented successful completion
 *   (`'stop'`) may become a result; truncated, refused, or unexpected finish
 *   reasons never turn partial output into a success;
 * - send-boundary accounting: the caller's `onSend` hook fires exactly once
 *   immediately before the single POST and its authorization is enforced in
 *   the same synchronous block (denial refuses `LIVE_ATTEMPT_EXHAUSTED`
 *   with zero outbound requests); an authorized attempt is spent there and
 *   never restored by timeout, cancel-after-send, HTTP error, malformed
 *   reply, or model mismatch;
 * - cancellation and deadline: `isCancelled` aborts mid-flight; the
 *   request deadline aborts the socket; a cancelled-before-send never
 *   touches the double;
 * - redacted evidence: refusal details carry codes and the HTTP status
 *   only — never body text, never the key, never the shape of secrets.
 *
 * The module never reads `process.env`, files, credentials, or the network
 * itself: network access arrives only as the injected `fetchImpl`.
 */
import { BASETEN_APPROVED_ENDPOINT, BASETEN_DOCUMENTED_DIRECT_MODEL } from './config.ts';
import { maxTokensFor } from './baseten-request.ts';
import type { VideoPart } from './baseten-request.ts';
import type { MockPermitKind } from './mock-permits.ts';
import type { LiveSendAuthorization } from './live-attempts.ts';
import type { SanitizedUsage } from './responses.ts';

/** Fixed analysis preamble: free-form observations + stated uncertainty. */
export const LIVE_ANALYZE_PROMPT =
  'Describe only what is visibly happening in this mobile-app screen recording ' +
  '(taps, navigation, visible state such as the cart count). Then state your ' +
  'uncertainties about anything not visible. Plain text only. Do not claim verification.';

/** Fixed proposal preamble: closed-grammar triple, strict JSON text, nothing else. */
export const LIVE_PROPOSE_PROMPT =
  'Reply with a single plain-text JSON object and nothing else, using only this shape: ' +
  '{"adjustments": [{"selector": "<css-selector>", "property": "<css-property>", "value": "<css-value>"}]}. ' +
  'Propose at most one minimal adjustment for a defect visible in the recording; ' +
  'otherwise reply {"adjustments": []}. No prose, no code fences.';

/** Exact direct-Baseten model slug shape (`meta-models/<name>`). */
const DIRECT_MODEL_SHAPE = /^meta-models\/[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Known-bad identifiers that must never be translated or accepted. */
const REJECTED_MODEL_ALIASES: ReadonlyArray<string> = [
  'meta/muse-spark-open', // OpenRouter alias: different provider path, never substitute.
  'meta-models/muse-spark-open-1026', // Superseded version pin.
  // D9-I1 discrepancy record (Nov 2026, public docs only): another Baseten
  // library example shows 'meta/Muse-Spark-Open-816B-A42B' (OpenRouter-style
  // namespace, not a Model API ID), and Meta's deployment guide names the
  // HuggingFace checkpoint 'meta-models/Muse-Spark-Open-816B-A42B'. Only the
  // Baseten changelog example 'meta-models/muse-spark-open' is proposed for
  // D9; the lookalikes refuse here and can never be substituted.
  'meta/Muse-Spark-Open-816B-A42B',
  'meta-models/Muse-Spark-Open-816B-A42B',
];

export type BasetenTransportRefusal =
  | 'MODEL_UNAVAILABLE_OR_UNAPPROVED'
  | 'LIVE_ATTEMPT_EXHAUSTED'
  // Server-side spend-record failure mapped through the live settle channel:
  // the send never happened, and the run settles refused with baseten
  // provenance (never restored, live path poisoned for the process).
  | 'LIVE_SPEND_RECORD_FAILED'
  | 'NO_CREDENTIAL'
  | 'TRANSPORT_MISCONFIGURED'
  | 'TRANSPORT_HTTP'
  | 'TRANSPORT_SHAPE'
  | 'TRANSPORT_TRUNCATED'
  | 'TRANSPORT_CONTENT_FILTERED'
  | 'MODEL_MISMATCH'
  | 'TRANSPORT_USAGE'
  | 'TRANSPORT_NETWORK';

export interface BasetenTransportRequest {
  readonly kind: MockPermitKind;
  readonly runId: string;
  readonly sha256: string;
  readonly videoBytes: number;
  readonly videoPart: VideoPart;
}

export interface BasetenTransportReply {
  readonly ok: true;
  readonly model: string;
  readonly text: string;
  readonly usage: SanitizedUsage;
  readonly finishReason: string;
  readonly latencyMs: number;
}

export type BasetenTransportResult =
  | BasetenTransportReply
  | Readonly<{ ok: false; code: BasetenTransportRefusal; detail: string }>;

export interface BasetenTransportHooks {
  readonly isCancelled: () => boolean;
  /**
   * Fired exactly once, synchronously immediately before the single POST is
   * sent. The caller spends the live attempt authorization here — at the
   * irreversible outbound-send boundary — and never restores it, whatever
   * the outcome. The transport checks the returned authorization
   * synchronously and refuses with `LIVE_ATTEMPT_EXHAUSTED`, without
   * sending, when it is denied. Not fired when validation or pre-send
   * cancellation refuses.
   */
  readonly onSend: () => LiveSendAuthorization;
}

export interface BasetenTransport {
  readonly label: 'baseten-live';
  respond(
    request: BasetenTransportRequest,
    hooks: BasetenTransportHooks,
  ): Promise<BasetenTransportResult>;
}

/** Minimal structural fetch surface: fully injectable, no ambient network. */
export interface LiveFetchInit {
  readonly method: 'POST';
  readonly headers: Record<string, string>;
  readonly body: string;
  readonly signal: AbortSignal;
  readonly redirect: 'error';
}

export interface LiveFetchResponse {
  readonly status: number;
  readonly url: string;
  json(): Promise<unknown>;
}

export interface LiveFetch {
  (url: string, init: LiveFetchInit): Promise<LiveFetchResponse>;
}

/** User/revoke cancellation: aborts the settle race like `MockCancelled`. */
export class BasetenCancelled extends Error {
  constructor() {
    super('baseten live request cancelled before completion');
    this.name = 'BasetenCancelled';
  }
}

/** Request deadline: aborts the socket; the server maps it to TIMEOUT. */
export class BasetenTimeout extends Error {
  constructor() {
    super('baseten live request exceeded its deadline');
    this.name = 'BasetenTimeout';
  }
}

/** Typed transport refusal: the server settles the run `refused` with the code. */
export class LiveTransportRefused extends Error {
  readonly code: BasetenTransportRefusal;
  constructor(code: BasetenTransportRefusal, detail: string) {
    super(detail);
    this.name = 'LiveTransportRefused';
    this.code = code;
  }
}

export interface BasetenChatBody {
  readonly model: string;
  readonly max_tokens: number;
  readonly messages: ReadonlyArray<{
    readonly role: 'user';
    readonly content: ReadonlyArray<
      | Readonly<{ type: 'text'; text: string }>
      | VideoPart
    >;
  }>;
}

/** Exact Chat Completions shape: model, fixed cap, one user turn, no extras. */
export function buildBasetenChatBody(input: {
  readonly model: string;
  readonly kind: MockPermitKind;
  readonly videoPart: VideoPart;
}): BasetenChatBody {
  return {
    model: input.model,
    max_tokens: maxTokensFor(input.kind),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: input.kind === 'analyze' ? LIVE_ANALYZE_PROMPT : LIVE_PROPOSE_PROMPT },
          input.videoPart,
        ],
      },
    ],
  };
}

export interface ValidatedBasetenResponse {
  readonly model: string;
  readonly text: string;
  readonly usage: SanitizedUsage;
  readonly finishReason: string;
}

/**
 * Strict response validation: exact model echo, non-empty text, safe-int
 * usage, string finish reason. Details never quote the payload.
 */
export function validateBasetenResponse(
  payload: unknown,
  approvedModel: string,
): { ok: true; value: ValidatedBasetenResponse } | { ok: false; code: 'TRANSPORT_SHAPE' | 'TRANSPORT_TRUNCATED' | 'TRANSPORT_CONTENT_FILTERED' | 'MODEL_MISMATCH' | 'TRANSPORT_USAGE' } {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return { ok: false, code: 'TRANSPORT_SHAPE' };
  }
  const record = payload as Record<string, unknown>;
  if (typeof record['model'] !== 'string' || (record['model'] as string) !== approvedModel) {
    return { ok: false, code: 'MODEL_MISMATCH' };
  }
  const choices = record['choices'];
  if (!Array.isArray(choices) || choices.length === 0) {
    return { ok: false, code: 'TRANSPORT_SHAPE' };
  }
  const first = choices[0] as Record<string, unknown> | null;
  if (typeof first !== 'object' || first === null) {
    return { ok: false, code: 'TRANSPORT_SHAPE' };
  }
  const message = first['message'] as Record<string, unknown> | null | undefined;
  const text = (typeof message === 'object' && message !== null ? message['content'] : undefined) as unknown;
  if (typeof text !== 'string' || text.length === 0) {
    return { ok: false, code: 'TRANSPORT_SHAPE' };
  }
  const finishReason = first['finish_reason'];
  const usage = record['usage'] as Record<string, unknown> | null | undefined;
  const prompt = typeof usage === 'object' && usage !== null ? usage['prompt_tokens'] : undefined;
  const completion = typeof usage === 'object' && usage !== null ? usage['completion_tokens'] : undefined;
  const total = typeof usage === 'object' && usage !== null ? usage['total_tokens'] : undefined;
  const isUsageInt = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  if (!isUsageInt(prompt) || !isUsageInt(completion) || !isUsageInt(total)) {
    return { ok: false, code: 'TRANSPORT_USAGE' };
  }
  // Completion validation: only an explicitly documented successful
  // completion ('stop') may become a result. Truncated, refused, or
  // unexpected finish reasons never turn partial output into a success.
  if (finishReason === 'length') {
    return { ok: false, code: 'TRANSPORT_TRUNCATED' };
  }
  if (finishReason === 'content_filter') {
    return { ok: false, code: 'TRANSPORT_CONTENT_FILTERED' };
  }
  if (finishReason !== 'stop') {
    return { ok: false, code: 'TRANSPORT_SHAPE' };
  }
  return {
    ok: true,
    value: {
      model: approvedModel,
      text,
      usage: { promptTokens: prompt, completionTokens: completion, totalTokens: total },
      finishReason,
    },
  };
}

function refusal<const C extends BasetenTransportRefusal>(
  code: C,
  detail: string,
): { ok: false; code: C; detail: string } {
  return { ok: false, code, detail };
}

export interface BasetenTransportOptions {
  /** Exact direct-Baseten model ID. Must equal the documented ID; the D9 gate owns approval. */
  readonly model: unknown;
  /** Bearer key passed explicitly by the authorized runtime. Never read here. */
  readonly apiKey: unknown;
  /** Injected fetch implementation. No default: every call site names its transport. */
  readonly fetchImpl: LiveFetch;
  /** Socket deadline in ms. Required and bounded; no silent default. */
  readonly timeoutMs: number;
}

/**
 * Construct the live transport. Refuses unless the model is byte-equal
 * to the documented direct-Baseten ID (aliases and superseded pins never
 * translate), the key is present, and the deadline is sane. D9 approval is
 * enforced separately at the server gate (`validateLiveModel`).
 */
export function createBasetenTransport(
  options: BasetenTransportOptions,
): { ok: true; transport: BasetenTransport } | { ok: false; code: 'MODEL_UNAVAILABLE_OR_UNAPPROVED' | 'NO_CREDENTIAL' | 'TRANSPORT_MISCONFIGURED' } {
  if (typeof options.model !== 'string' || !DIRECT_MODEL_SHAPE.test(options.model)) {
    return refusal('MODEL_UNAVAILABLE_OR_UNAPPROVED', 'live model is not the documented direct-Baseten identifier');
  }
  if (REJECTED_MODEL_ALIASES.includes(options.model) || options.model !== BASETEN_DOCUMENTED_DIRECT_MODEL) {
    return refusal('MODEL_UNAVAILABLE_OR_UNAPPROVED', 'live model aliases and superseded pins are never accepted');
  }
  if (typeof options.apiKey !== 'string' || options.apiKey.length === 0) {
    return refusal('NO_CREDENTIAL', 'live transport requires an explicitly passed key');
  }
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0 || options.timeoutMs > 600_000) {
    return refusal('TRANSPORT_MISCONFIGURED', 'live request deadline out of range');
  }
  const model = options.model;
  const apiKey = options.apiKey;
  const fetchImpl = options.fetchImpl;
  const timeoutMs = options.timeoutMs;
  return {
    ok: true,
    transport: {
      label: 'baseten-live',
      async respond(request: BasetenTransportRequest, hooks: BasetenTransportHooks): Promise<BasetenTransportResult> {
        if (typeof request.runId !== 'string' || request.runId.length === 0) {
          return refusal('TRANSPORT_MISCONFIGURED', 'live request needs a run id');
        }
        if (hooks.isCancelled()) {
          throw new BasetenCancelled();
        }
        const body: BasetenChatBody = buildBasetenChatBody({ model, kind: request.kind, videoPart: request.videoPart });
        // Irreversible outbound-send boundary: the spend hook fires exactly
        // once, synchronously, and its authorization is checked in the same
        // synchronous block — no await sits between check and send, so no
        // check-then-send race is possible. A denial refuses without any
        // outbound request and without arming any timer. Everything after an
        // authorized send — timeout, cancel, HTTP error, malformed reply,
        // mismatch — keeps the spent attempt.
        const authorization = hooks.onSend();
        if (!authorization.ok) {
          return refusal('LIVE_ATTEMPT_EXHAUSTED', 'live attempt authorization exhausted; no provider request was sent');
        }
        const ctrl = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          ctrl.abort();
        }, timeoutMs);
        const poll = setInterval(() => {
          if (hooks.isCancelled()) {
            ctrl.abort();
          }
        }, 25);
        const started = Date.now();
        try {
          const response = await fetchImpl(BASETEN_APPROVED_ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
            signal: ctrl.signal,
            redirect: 'error',
          });
          if (response.status < 200 || response.status > 299) {
            return refusal('TRANSPORT_HTTP', `live endpoint refused with HTTP ${response.status}`);
          }
          let payload: unknown;
          try {
            payload = await response.json();
          } catch {
            return refusal('TRANSPORT_SHAPE', 'live response was not valid JSON');
          }
          const checked = validateBasetenResponse(payload, model);
          if (!checked.ok) {
            const detail =
              checked.code === 'MODEL_MISMATCH'
                ? 'live response model echo mismatch'
                : checked.code === 'TRANSPORT_USAGE'
                  ? 'live response usage block malformed'
                  : 'live response envelope malformed';
            return refusal(checked.code, detail);
          }
          if (hooks.isCancelled()) {
            throw new BasetenCancelled();
          }
          return {
            ok: true,
            model: checked.value.model,
            text: checked.value.text,
            usage: checked.value.usage,
            finishReason: checked.value.finishReason,
            latencyMs: Date.now() - started,
          };
        } catch (error) {
          if (error instanceof BasetenCancelled) {
            throw error;
          }
          if (error instanceof BasetenTimeout) {
            throw error;
          }
          if (hooks.isCancelled()) {
            throw new BasetenCancelled();
          }
          if (timedOut) {
            throw new BasetenTimeout();
          }
          return refusal('TRANSPORT_NETWORK', 'live request failed before a response arrived');
        } finally {
          clearTimeout(timer);
          clearInterval(poll);
        }
      },
    },
  };
}
