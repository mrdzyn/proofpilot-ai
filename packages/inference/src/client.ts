// OpenAI-compatible HTTP client shared by all providers. Uses the platform
// fetch (injectable for tests); no SDK dependency.
import type { ModelRole, ProviderConfig } from './config.ts';
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

export interface InferenceProvider {
  readonly id: string;
  readonly models: Partial<Record<ModelRole, string>>;
  listModels(): Promise<string[]>;
  checkModelAvailability(modelId: string): Promise<ModelAvailability>;
  generateText(req: TextRequest): Promise<TextResult>;
}

export const LIMITS = { maxPromptChars: 32_000, maxOutputTokens: 4_096, maxErrorDetailChars: 300 } as const;

type ClientDeps = { fetch?: FetchLike; sleep?: (ms: number) => Promise<void> };

export function createProvider(config: ProviderConfig, deps: ClientDeps = {}): InferenceProvider {
  const doFetch: FetchLike = deps.fetch ?? ((input, init) => fetch(input, init));
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const scrub = (text: string) => redact(text, [config.apiKey]);

  async function request(operation: string, method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ json: any; requestId: string | null }> {
    if (!config.apiKey) {
      throw new InferenceError('CONFIG', config.id, `${config.label}: API key is not configured`);
    }
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await doFetch(`${config.baseUrl}${path}`, {
          method,
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            accept: 'application/json',
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
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
      if (retryable && attempt < config.maxRetries) {
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
        const text =
          typeof json?.output_text === 'string'
            ? json.output_text
            : (json?.output ?? [])
                .flatMap((item: any) => item?.content ?? [])
                .filter((c: any) => c?.type === 'output_text' && typeof c.text === 'string')
                .map((c: any) => c.text)
                .join('');
        if (typeof text !== 'string' || text.length === 0) {
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
  };
}
