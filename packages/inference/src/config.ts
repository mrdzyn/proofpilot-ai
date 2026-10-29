// Provider configuration contract. Secrets come from the environment only and
// are sent only to an allowlisted HTTPS host for that provider.
import { InferenceError } from './errors.ts';

export type ProviderId = 'meta' | 'baseten';
export type ModelRole = 'visual' | 'code';
export type TextApi = 'responses' | 'chat.completions';

type ProviderDefinition = {
  label: string;
  defaultBaseUrl: string;
  allowedHosts: readonly string[];
  apiKeyEnv: string;
  baseUrlEnv: string;
  textApi: TextApi;
  /** Accepts a Files-API video reference in Responses (Meta Muse Spark). */
  nativeVideo: boolean;
  models: Partial<Record<ModelRole, { env: string; default: string }>>;
};

export const PROVIDERS: Record<ProviderId, ProviderDefinition> = {
  meta: {
    label: 'Meta Model API',
    defaultBaseUrl: 'https://api.meta.ai/v1',
    allowedHosts: ['api.meta.ai'],
    apiKeyEnv: 'MODEL_API_KEY',
    baseUrlEnv: 'META_API_BASE_URL',
    textApi: 'responses',
    nativeVideo: true,
    models: {
      visual: { env: 'META_MODEL_VISUAL', default: 'muse-spark-1.3' },
      code: { env: 'META_MODEL_CODE', default: 'muse-wonder-1.0' },
    },
  },
  baseten: {
    label: 'Baseten Model APIs',
    defaultBaseUrl: 'https://inference.baseten.co/v1',
    allowedHosts: ['inference.baseten.co'],
    apiKeyEnv: 'BASETEN_API_KEY',
    baseUrlEnv: 'BASETEN_API_BASE_URL',
    textApi: 'chat.completions',
    nativeVideo: false,
    // Hackathon-specific versioned ID (participant guide p.7); do not replace
    // with the unversioned public `meta-models/muse-spark-open`.
    models: {
      visual: { env: 'BASETEN_MODEL_VISUAL', default: 'meta-models/muse-spark-open-1026' },
    },
  },
};

export const TIMEOUT_BOUNDS_MS = { min: 1_000, max: 120_000, default: 60_000 } as const;
export const MAX_RETRIES_BOUND = 2;
const MODEL_ID = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)?$/i;

export type ProviderConfig = {
  id: ProviderId;
  label: string;
  baseUrl: string;
  apiKey: string | undefined;
  textApi: TextApi;
  models: Partial<Record<ModelRole, string>>;
  timeoutMs: number;
  maxRetries: number;
  billableCallsAllowed: boolean;
  nativeVideo: boolean;
  /** Separate opt-in: a recording may be transmitted to the provider. Off by default. */
  videoUploadAllowed: boolean;
};

type Env = Record<string, string | undefined>;

function configError(id: string, message: string): InferenceError {
  return new InferenceError('CONFIG', id, message);
}

export function validateModelId(id: string, modelId: string): string {
  if (modelId.length === 0 || modelId.length > 128 || !MODEL_ID.test(modelId)) {
    throw configError(id, `invalid model ID format: ${JSON.stringify(modelId.slice(0, 64))}`);
  }
  return modelId;
}

export function validateBaseUrl(id: ProviderId, raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw configError(id, 'base URL is not a valid URL');
  }
  if (url.protocol !== 'https:') throw configError(id, 'base URL must use https');
  if (url.username || url.password) throw configError(id, 'base URL must not embed credentials');
  if (url.search || url.hash) throw configError(id, 'base URL must not include a query or fragment');
  if (!PROVIDERS[id].allowedHosts.includes(url.hostname)) {
    throw configError(id, `base URL host ${url.hostname} is not allowlisted for ${id}`);
  }
  return url.toString().replace(/\/+$/, '');
}

function intInRange(id: string, name: string, raw: string | undefined, min: number, max: number, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) throw configError(id, `${name} must be an integer`);
  const value = Number(raw);
  if (value < min || value > max) throw configError(id, `${name} must be between ${min} and ${max}`);
  return value;
}

/**
 * `readApiKey: false` never touches the provider's key field (used by the zero-credential preflight); `apiKey` is then undefined.
 */
export function loadProviderConfig(id: ProviderId, env: Env, opts: { readApiKey?: boolean } = {}): ProviderConfig {
  const def = PROVIDERS[id];
  if (!def) throw configError(String(id), 'unknown provider');

  const apiKeyRaw = opts.readApiKey === false ? undefined : env[def.apiKeyEnv];
  const apiKey = apiKeyRaw === undefined || apiKeyRaw === '' ? undefined : apiKeyRaw;
  if (apiKey !== undefined && (/\s/.test(apiKey) || apiKey.length < 8 || apiKey.length > 1024)) {
    // Never echo the value.
    throw configError(id, `${def.apiKeyEnv} is set but malformed`);
  }

  const models: Partial<Record<ModelRole, string>> = {};
  for (const [role, spec] of Object.entries(def.models) as Array<[ModelRole, { env: string; default: string }]>) {
    models[role] = validateModelId(id, env[spec.env] || spec.default);
  }

  return {
    id,
    label: def.label,
    baseUrl: validateBaseUrl(id, env[def.baseUrlEnv] || def.defaultBaseUrl),
    apiKey,
    textApi: def.textApi,
    models,
    timeoutMs: intInRange(
      id,
      'PROOFPILOT_INFERENCE_TIMEOUT_MS',
      env.PROOFPILOT_INFERENCE_TIMEOUT_MS,
      TIMEOUT_BOUNDS_MS.min,
      TIMEOUT_BOUNDS_MS.max,
      TIMEOUT_BOUNDS_MS.default,
    ),
    maxRetries: intInRange(id, 'PROOFPILOT_INFERENCE_MAX_RETRIES', env.PROOFPILOT_INFERENCE_MAX_RETRIES, 0, MAX_RETRIES_BOUND, 0),
    billableCallsAllowed: env.PROOFPILOT_ALLOW_BILLABLE_CALLS === '1',
    nativeVideo: def.nativeVideo,
    videoUploadAllowed: env.PROOFPILOT_ALLOW_VIDEO_UPLOAD === '1',
  };
}
