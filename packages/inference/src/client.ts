// OpenAI-compatible HTTP client shared by all providers. Uses the platform
// fetch (injectable for tests); no SDK dependency.
import type { ModelRole, ProviderConfig } from './config.ts';
import { detectContainer, MEDIA_LIMITS } from '../../intake/src/media.ts';
import { InferenceError, redact } from './errors.ts';

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export type TextRequest = { model: string; prompt: string; maxOutputTokens: number };
export type TextResult = {
  providerId: string;
  model: string;
  text: string;
  requestId: string | null;
  usage: { inputTokens: number | null; outputTokens: number | null } | null;
};
export type ModelAvailability = {
  providerId: string;
  modelId: string;
  available: boolean;
  /** Listed IDs sharing the model family prefix. Informational only: never substituted. */
  relatedIds: string[];
};

export type UploadVideoRequest = {
  bytes: Uint8Array;
  /** Sent as the multipart filename; must be a plain `*.mp4` name. */
  filename: string;
  /** `expires_after.seconds` (Meta range 3600..2592000). Defaults to 1 hour. */
  expiresAfterSeconds?: number;
};
export type UploadedFile = { fileId: string; bytes: number | null; expiresAt: number | null; requestId: string | null };
export type VideoResponseRequest = {
  model: string;
  prompt: string;
  fileId: string;
  /** Sent as Responses `text.format` (json_schema, strict). Still validate the output locally. */
  schemaName: string;
  schema: object;
  maxOutputTokens: number;
};
export type VideoUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  reasoningTokens: number | null;
  videoFramesProcessed: number | null;
};
/** Provider-reported lifecycle of a Responses object (docs: status completed|failed|in_progress|cancelled|queued|incomplete). */
export type ResponseLifecycle = {
  /** `status` as reported; null when the (schema-optional) field is absent or null. */
  status: string | null;
  /** Only a short machine code from `error.code` / `incomplete_details.reason`; never provider free text. */
  errorCode: string | null;
  incompleteReason: string | null;
  refusal: boolean;
  /** True only for a completed response with no error, no incomplete_details and no refusal. */
  completed: boolean;
};
export type VideoResponse = {
  providerId: string;
  model: string;
  /** Empty when the response did not complete; callers must check `lifecycle.completed` first. */
  text: string;
  requestId: string | null;
  usage: VideoUsage | null;
  lifecycle: ResponseLifecycle;
};

export const FILE_EXPIRY_SECONDS = { min: 3_600, max: 2_592_000, default: 3_600 } as const;
const FILE_ID = /^file-[A-Za-z0-9_-]{1,64}$/;
const UPLOAD_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}\.mp4$/;
const SCHEMA_NAME = /^[A-Za-z0-9_-]{1,64}$/;

export interface InferenceProvider {
  readonly id: string;
  readonly models: Partial<Record<ModelRole, string>>;
  listModels(): Promise<string[]>;
  checkModelAvailability(modelId: string): Promise<ModelAvailability>;
  generateText(req: TextRequest): Promise<TextResult>;
  /** Files API upload of a validated MP4 (`purpose=user_data`, expiring). Billable/external: double opt-in. */
  uploadVideoFile(req: UploadVideoRequest): Promise<UploadedFile>;
  /** Responses call referencing an uploaded video via `input_file`. */
  respondWithVideo(req: VideoResponseRequest): Promise<VideoResponse>;
  /** Best-effort cleanup of an uploaded file. */
  deleteFile(fileId: string): Promise<void>;
}

export const LIMITS = { maxPromptChars: 32_000, maxOutputTokens: 4_096, maxErrorDetailChars: 300 } as const;

type ClientDeps = { fetch?: FetchLike; sleep?: (ms: number) => Promise<void> };

export function createProvider(config: ProviderConfig, deps: ClientDeps = {}): InferenceProvider {
  const doFetch: FetchLike = deps.fetch ?? ((input, init) => fetch(input, init));
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const scrub = (text: string) => redact(text, [config.apiKey]);

  async function request(
    operation: string,
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
    opts: { retries?: number } = {},
  ): Promise<{ json: any; requestId: string | null }> {
    if (!config.apiKey) {
      throw new InferenceError('CONFIG', config.id, `${config.label}: API key is not configured`);
    }
    const maxRetries = opts.retries ?? config.maxRetries;
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await doFetch(`${config.baseUrl}${path}`, {
          method,
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            accept: 'application/json',
            // FormData: fetch sets the multipart boundary itself.
            ...(body === undefined || isForm ? {} : { 'content-type': 'application/json' }),
          },
          body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
          // Never follow redirects: that could forward the bearer token elsewhere.
          redirect: 'error',
          signal: AbortSignal.timeout(config.timeoutMs),
        });
      } catch (err) {
        const name = (err as Error)?.name;
        if (name === 'TimeoutError' || name === 'AbortError') {
          throw new InferenceError('TIMEOUT', config.id, `${config.label} ${operation} timed out after ${config.timeoutMs} ms`, { retryable: true });
        }
        throw new InferenceError('NETWORK', config.id, `${config.label} ${operation} network failure: ${scrub(String((err as Error)?.message ?? err)).slice(0, LIMITS.maxErrorDetailChars)}`, { retryable: true });
      }

      const requestId = res.headers.get('x-request-id') ?? res.headers.get('request-id');
      if (res.ok) {
        const text = await res.text();
        if (text.length === 0) return { json: null, requestId };
        try {
          return { json: JSON.parse(text), requestId };
        } catch {
          throw new InferenceError('INVALID_RESPONSE', config.id, `${config.label} ${operation} returned non-JSON body`, { status: res.status, requestId });
        }
      }

      // Redact the whole body before truncating: slicing first could cut an echoed key
      // in half and leave a fragment that no longer matches the exact secret.
      const detail = scrub(await res.text().catch(() => '')).slice(0, LIMITS.maxErrorDetailChars);
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < maxRetries) {
        await sleep(Math.min(250 * 2 ** attempt, 2_000));
        continue;
      }
      const code =
        res.status === 401 || res.status === 403 ? 'AUTH'
        : res.status === 404 ? 'NOT_FOUND'
        : res.status === 429 ? 'RATE_LIMITED'
        : res.status >= 500 ? 'PROVIDER_ERROR'
        : 'HTTP';
      throw new InferenceError(code, config.id, `${config.label} ${operation} failed: HTTP ${res.status}${detail ? ` — ${detail}` : ''}`, { status: res.status, requestId, retryable });
    }
  }

  /** Text from a Responses payload; tolerant of malformed shapes (never throws). */
  function extractResponsesText(json: any): string {
    if (typeof json?.output_text === 'string' && json.output_text.length > 0) return json.output_text;
    const parts: string[] = [];
    for (const item of Array.isArray(json?.output) ? json.output : []) {
      for (const c of Array.isArray(item?.content) ? item.content : []) {
        if (c?.type === 'output_text' && typeof c.text === 'string') parts.push(c.text);
      }
    }
    return parts.join('');
  }
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const videoUsageOf = (u: any): VideoUsage | null =>
    u && typeof u === 'object'
      ? {
          inputTokens: num(u.input_tokens),
          outputTokens: num(u.output_tokens),
          totalTokens: num(u.total_tokens),
          reasoningTokens: num(u.output_tokens_details?.reasoning_tokens),
          videoFramesProcessed: num(u.video_frames_processed),
        }
      : null;
  const KNOWN_STATUSES = new Set(['completed', 'failed', 'in_progress', 'cancelled', 'queued', 'incomplete']);
  const CODE = /^[a-z][a-z0-9_]{0,39}$/;
  const codeOf = (v: unknown, key: string): string | null =>
    v == null ? null : typeof v === 'object' && typeof (v as any)[key] === 'string' && CODE.test((v as any)[key]) ? (v as any)[key] : 'unspecified';
  /**
   * Fail closed: only an explicit `completed` (or an absent/null status, which the schema allows) with
   * no error, no incomplete_details and no refusal counts as complete. Anything else, including an
   * unknown or non-string status, is not.
   */
  function lifecycleOf(json: any): ResponseLifecycle {
    const raw = json?.status;
    const status = raw == null ? null : typeof raw === 'string' && KNOWN_STATUSES.has(raw) ? raw : 'unrecognized';
    const errorCode = codeOf(json?.error, 'code');
    const incompleteReason = codeOf(json?.incomplete_details, 'reason');
    const refusal = (Array.isArray(json?.output) ? json.output : []).some(
      (item: any) => Array.isArray(item?.content) && item.content.some((c: any) => c?.type === 'refusal'),
    );
    const completed = (status === null || status === 'completed') && errorCode === null && incompleteReason === null && !refusal;
    return { status, errorCode, incompleteReason, refusal, completed };
  }
  const usageOf = (u: any) => (u && typeof u === 'object' ? { inputTokens: num(u.input_tokens), outputTokens: num(u.output_tokens) } : null);

  function requireNativeVideo(): void {
    if (!config.nativeVideo) {
      throw new InferenceError('INVALID_INPUT', config.id, `${config.label} does not support native video analysis`);
    }
  }

  function validateTextRequest(req: TextRequest): void {
    const configured = Object.values(config.models);
    if (!configured.includes(req.model)) {
      throw new InferenceError('INVALID_INPUT', config.id, `model ${JSON.stringify(req.model)} is not a configured ${config.id} model`);
    }
    if (typeof req.prompt !== 'string' || req.prompt.trim().length === 0) {
      throw new InferenceError('INVALID_INPUT', config.id, 'prompt must be a non-empty string');
    }
    if (req.prompt.length > LIMITS.maxPromptChars) {
      throw new InferenceError('INVALID_INPUT', config.id, `prompt exceeds ${LIMITS.maxPromptChars} characters`);
    }
    if (!Number.isInteger(req.maxOutputTokens) || req.maxOutputTokens < 1 || req.maxOutputTokens > LIMITS.maxOutputTokens) {
      throw new InferenceError('INVALID_INPUT', config.id, `maxOutputTokens must be an integer in 1..${LIMITS.maxOutputTokens}`);
    }
  }

  return {
    id: config.id,
    models: config.models,

    async listModels() {
      const { json } = await request('model discovery', 'GET', '/models');
      if (!Array.isArray(json?.data) || json.data.some((m: any) => typeof m?.id !== 'string')) {
        throw new InferenceError('INVALID_RESPONSE', config.id, `${config.label} model list has unexpected shape`);
      }
      return json.data.map((m: { id: string }) => m.id);
    },

    async checkModelAvailability(modelId) {
      const ids = await this.listModels();
      const family = modelId.split(/[-.]\d/)[0]!.toLowerCase();
      return {
        providerId: config.id,
        modelId,
        available: ids.includes(modelId),
        relatedIds: ids.filter((id) => id !== modelId && id.toLowerCase().startsWith(family)).slice(0, 10),
      };
    },

    async generateText(req) {
      validateTextRequest(req);
      if (!config.billableCallsAllowed) {
        throw new InferenceError('BILLABLE_NOT_AUTHORIZED', config.id, 'billable inference is disabled; set PROOFPILOT_ALLOW_BILLABLE_CALLS=1 only with owner authorization');
      }
      if (config.textApi === 'responses') {
        const { json, requestId } = await request('text response', 'POST', '/responses', {
          model: req.model,
          input: req.prompt,
          max_output_tokens: req.maxOutputTokens,
        });
        const text = extractResponsesText(json);
        if (text.length === 0) {
          throw new InferenceError('INVALID_RESPONSE', config.id, 'response contained no output text', { requestId });
        }
        return {
          providerId: config.id,
          model: String(json.model ?? req.model),
          text,
          requestId: requestId ?? (typeof json.id === 'string' ? json.id : null),
          usage: json.usage ? { inputTokens: json.usage.input_tokens ?? null, outputTokens: json.usage.output_tokens ?? null } : null,
        };
      }
      const { json, requestId } = await request('chat completion', 'POST', '/chat/completions', {
        model: req.model,
        messages: [{ role: 'user', content: req.prompt }],
        max_tokens: req.maxOutputTokens,
      });
      const text = json?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || text.length === 0) {
        throw new InferenceError('INVALID_RESPONSE', config.id, 'chat completion contained no message content', { requestId });
      }
      return {
        providerId: config.id,
        model: String(json.model ?? req.model),
        text,
        requestId: requestId ?? (typeof json.id === 'string' ? json.id : null),
        usage: json.usage ? { inputTokens: json.usage.prompt_tokens ?? null, outputTokens: json.usage.completion_tokens ?? null } : null,
      };
    },

    async uploadVideoFile(req) {
      requireNativeVideo();
      if (!(req.bytes instanceof Uint8Array) || req.bytes.length === 0 || req.bytes.length > MEDIA_LIMITS.maxBytes) {
        throw new InferenceError('INVALID_INPUT', config.id, `video must be 1..${MEDIA_LIMITS.maxBytes} bytes`);
      }
      if (detectContainer(req.bytes.subarray(0, 64)).kind !== 'mp4') {
        throw new InferenceError('INVALID_INPUT', config.id, 'only MP4 video can be uploaded');
      }
      if (typeof req.filename !== 'string' || !UPLOAD_FILENAME.test(req.filename)) {
        throw new InferenceError('INVALID_INPUT', config.id, 'filename must be a plain *.mp4 name');
      }
      const seconds = req.expiresAfterSeconds ?? FILE_EXPIRY_SECONDS.default;
      if (!Number.isInteger(seconds) || seconds < FILE_EXPIRY_SECONDS.min || seconds > FILE_EXPIRY_SECONDS.max) {
        throw new InferenceError('INVALID_INPUT', config.id, `expiresAfterSeconds must be an integer in ${FILE_EXPIRY_SECONDS.min}..${FILE_EXPIRY_SECONDS.max}`);
      }
      if (!config.billableCallsAllowed || !config.videoUploadAllowed) {
        throw new InferenceError('BILLABLE_NOT_AUTHORIZED', config.id, 'video upload is disabled; it needs PROOFPILOT_ALLOW_BILLABLE_CALLS=1 and PROOFPILOT_ALLOW_VIDEO_UPLOAD=1, set only with owner authorization');
      }
      const form = new FormData();
      form.append('purpose', 'user_data');
      form.append('expires_after[anchor]', 'created_at');
      form.append('expires_after[seconds]', String(seconds));
      form.append('file', new Blob([req.bytes as BlobPart], { type: 'video/mp4' }), req.filename); // file last: lower upload latency
      // No retry: a replayed upload could leave an orphaned remote copy of the video.
      const { json, requestId } = await request('file upload', 'POST', '/files', form, { retries: 0 });
      if (typeof json?.id !== 'string' || !FILE_ID.test(json.id)) {
        throw new InferenceError('INVALID_RESPONSE', config.id, `${config.label} file upload returned no valid file id`, { requestId });
      }
      return { fileId: json.id, bytes: num(json.bytes), expiresAt: num(json.expires_at), requestId };
    },

    async respondWithVideo(req) {
      requireNativeVideo();
      if (!Object.values(config.models).includes(req.model)) {
        throw new InferenceError('INVALID_INPUT', config.id, `model ${JSON.stringify(req.model)} is not a configured ${config.id} model`);
      }
      if (typeof req.fileId !== 'string' || !FILE_ID.test(req.fileId)) {
        throw new InferenceError('INVALID_INPUT', config.id, 'fileId is not a valid Files API id');
      }
      if (typeof req.schemaName !== 'string' || !SCHEMA_NAME.test(req.schemaName)) {
        throw new InferenceError('INVALID_INPUT', config.id, 'schemaName is invalid');
      }
      validateTextRequest({ model: req.model, prompt: req.prompt, maxOutputTokens: req.maxOutputTokens });
      if (!config.billableCallsAllowed) {
        throw new InferenceError('BILLABLE_NOT_AUTHORIZED', config.id, 'billable inference is disabled; set PROOFPILOT_ALLOW_BILLABLE_CALLS=1 only with owner authorization');
      }
      // No retry: a replayed generation would be billed twice.
      const { json, requestId } = await request(
        'video response',
        'POST',
        '/responses',
        {
          model: req.model,
          input: [
            {
              type: 'message',
              role: 'user',
              content: [
                { type: 'input_text', text: req.prompt },
                { type: 'input_file', file_id: req.fileId },
              ],
            },
          ],
          // Responses structured output is `text.format` (not Chat Completions' `response_format`).
          text: { format: { type: 'json_schema', name: req.schemaName, schema: req.schema, strict: true } },
          max_output_tokens: req.maxOutputTokens,
        },
        { retries: 0 },
      );
      const lifecycle = lifecycleOf(json);
      // Text from a non-completed response is never handed on, even if some exists.
      const text = lifecycle.completed ? extractResponsesText(json) : '';
      if (lifecycle.completed && text.length === 0) {
        throw new InferenceError('INVALID_RESPONSE', config.id, 'video response contained no output text', { requestId });
      }
      return {
        providerId: config.id,
        model: typeof json?.model === 'string' ? json.model : req.model,
        text,
        requestId: requestId ?? (typeof json?.id === 'string' ? json.id : null),
        usage: videoUsageOf(json?.usage),
        lifecycle,
      };
    },

    async deleteFile(fileId) {
      if (typeof fileId !== 'string' || !FILE_ID.test(fileId)) {
        throw new InferenceError('INVALID_INPUT', config.id, 'fileId is not a valid Files API id');
      }
      await request('file delete', 'DELETE', `/files/${fileId}`, undefined, { retries: 0 });
    },
  };
}
