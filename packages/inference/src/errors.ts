export type InferenceErrorCode =
  | 'CONFIG'
  | 'INVALID_INPUT'
  | 'BILLABLE_NOT_AUTHORIZED'
  | 'AUTH'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR'
  | 'HTTP'
  | 'TIMEOUT'
  | 'NETWORK'
  | 'INVALID_RESPONSE';

export class InferenceError extends Error {
  readonly code: InferenceErrorCode;
  readonly providerId: string;
  readonly status: number | null;
  readonly requestId: string | null;
  readonly retryable: boolean;

  constructor(
    code: InferenceErrorCode,
    providerId: string,
    message: string,
    opts: { status?: number | null; requestId?: string | null; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = 'InferenceError';
    this.code = code;
    this.providerId = providerId;
    this.status = opts.status ?? null;
    this.requestId = opts.requestId ?? null;
    this.retryable = opts.retryable ?? false;
  }
}

const BEARER = /Bearer\s+[^\s"',;]+/gi;
const KEY_LIKE = /\b(sk|pk|rk|key|tok)[-_][A-Za-z0-9_-]{8,}\b/g;

/** Remove credential material from text that may reach logs or evidence. */
export function redact(text: string, secrets: Array<string | undefined>): string {
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 4) out = out.split(secret).join('[REDACTED]');
  }
  return out.replace(BEARER, 'Bearer [REDACTED]').replace(KEY_LIKE, '[REDACTED]');
}
