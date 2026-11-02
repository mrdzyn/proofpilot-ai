/**
 * UI-C3-02-I4: strict validation and sanitization of (mock) model responses.
 *
 * The model offers no structured output or JSON mode, so every response is
 * treated as untrusted free-form text: observations pass through as quoted
 * text only, and proposals pass only through the audited closed-grammar
 * parser `parseProposal`. Rejections carry typed codes, never raw text.
 * Pure module: no I/O, no clock, no secrets, no retry, no persistence.
 */
import { parseProposal, type ProposalResult } from '../../core/src/patch-proposal.ts';
import { MOCK_MODEL_LABEL } from './mock-transport.ts';

export const MAX_OBSERVATION_CHARS = 8_192;

export type ResponseRefusal =
  | 'BAD_SHAPE'
  | 'WRONG_MODEL'
  | 'BAD_USAGE'
  | 'TEXT_TOO_LONG'
  | 'PROPOSAL_REJECTED';

export type SanitizedUsage = Readonly<{
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}>;

export type SanitizedAnalysis = Readonly<{
  kind: 'analysis';
  observations: string;
  usage: SanitizedUsage;
  transport: 'mock-fixture';
  liveInference: false;
}>;

export type SanitizedProposal = Readonly<{
  kind: 'proposal';
  adjustments: ReadonlyArray<Readonly<{ selector: string; property: string; value: string }>>;
  renderedCss: string;
  usage: SanitizedUsage;
  transport: 'mock-fixture';
  liveInference: false;
}>;

export type SanitizeResult =
  | Readonly<{ ok: true; value: SanitizedAnalysis | SanitizedProposal }>
  | Readonly<{ ok: false; code: ResponseRefusal; detail: string }>;

function checkEnvelope(raw: unknown, expectedModel: string):
  | { ok: true; text: string; usage: SanitizedUsage }
  | { ok: false; code: ResponseRefusal; detail: string } {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, code: 'BAD_SHAPE', detail: 'response is not an object' };
  }
  const record = raw as Record<string, unknown>;
  if (record['mockModel'] !== expectedModel) {
    return { ok: false, code: 'WRONG_MODEL', detail: 'model identifier mismatch' };
  }
  if (typeof record['text'] !== 'string') {
    return { ok: false, code: 'BAD_SHAPE', detail: 'response text is not a string' };
  }
  if (record['text'].length > MAX_OBSERVATION_CHARS) {
    return { ok: false, code: 'TEXT_TOO_LONG', detail: `text exceeds ${MAX_OBSERVATION_CHARS} characters` };
  }
  const usage = record['usage'];
  if (typeof usage !== 'object' || usage === null) {
    return { ok: false, code: 'BAD_USAGE', detail: 'usage is not an object' };
  }
  const numbers = usage as Record<string, unknown>;
  for (const key of ['promptTokens', 'completionTokens', 'totalTokens'] as const) {
    const value = numbers[key];
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
      return { ok: false, code: 'BAD_USAGE', detail: `usage.${key} is not a safe non-negative integer` };
    }
  }
  return {
    ok: true,
    text: record['text'] as string,
    usage: {
      promptTokens: numbers['promptTokens'] as number,
      completionTokens: numbers['completionTokens'] as number,
      totalTokens: numbers['totalTokens'] as number,
    },
  };
}

/** Observations are quoted text only — never structured, never a verdict. */
export function sanitizeAnalysisResponse(raw: unknown): SanitizeResult {
  const envelope = checkEnvelope(raw, MOCK_MODEL_LABEL);
  if (!envelope.ok) return envelope;
  return {
    ok: true,
    value: {
      kind: 'analysis',
      observations: envelope.text,
      usage: envelope.usage,
      transport: 'mock-fixture',
      liveInference: false,
    },
  };
}

/**
 * Proposals pass only through the closed grammar. Anything the parser
 * rejects (malformed, partial, wrong-schema, hostile) becomes a typed
 * refusal with zero additional requests — never a retry or reformat.
 */
export function sanitizeProposalResponse(raw: unknown): SanitizeResult {
  const envelope = checkEnvelope(raw, MOCK_MODEL_LABEL);
  if (!envelope.ok) return envelope;
  let parsed: ProposalResult;
  try {
    parsed = parseProposal(envelope.text);
  } catch {
    return { ok: false, code: 'PROPOSAL_REJECTED', detail: 'proposal parser threw on hostile input' };
  }
  if (!parsed.ok) {
    return {
      ok: false,
      code: 'PROPOSAL_REJECTED',
      detail: `closed grammar refused the proposal (${parsed.status}/${parsed.reason})`,
    };
  }
  return {
    ok: true,
    value: {
      kind: 'proposal',
      adjustments: parsed.adjustments.map((a) => ({ ...a })),
      renderedCss: parsed.renderedCss,
      usage: envelope.usage,
      transport: 'mock-fixture',
      liveInference: false,
    },
  };
}

/**
 * UI-C3-02-BT-LIVE-01: live result sanitizers. Dormant in this slice: the
 * only caller is the D9-gated live settle branch, unreachable while D9 is
 * pending. Rules mirror the mock path exactly (quoted observations, closed
 * grammar, safe-int usage, length caps), except the envelope carries the
 * provider `model` echo instead of `mockModel`, and success values carry
 * live provenance (`provider: 'baseten'`, exact model, `transport:
 * 'baseten-live'`, `liveInference: true`). `UNVERIFIED` is a status for
 * callers to render, never a verdict.
 */
export type LiveSanitizedAnalysis = Readonly<{
  kind: 'analysis';
  observations: string;
  usage: SanitizedUsage;
  provider: 'baseten';
  model: string;
  transport: 'baseten-live';
  liveInference: true;
}>;

export type LiveSanitizedProposal = Readonly<{
  kind: 'proposal';
  adjustments: ReadonlyArray<Readonly<{ selector: string; property: string; value: string }>>;
  renderedCss: string;
  usage: SanitizedUsage;
  provider: 'baseten';
  model: string;
  transport: 'baseten-live';
  liveInference: true;
}>;

export type LiveSanitizeResult =
  | Readonly<{ ok: true; value: LiveSanitizedAnalysis | LiveSanitizedProposal }>
  | Readonly<{ ok: false; code: ResponseRefusal; detail: string }>;

/**
 * Shared envelope check for normalized live replies (`{model, text,
 * usage}`): exact model echo, non-empty string text within the observation
 * cap, safe-int usage. Anything else refuses.
 */
function checkLiveEnvelope(
  raw: unknown,
  approvedModel: string,
): { ok: true; value: { text: string; usage: SanitizedUsage } } | { ok: false; code: ResponseRefusal; detail: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, code: 'BAD_SHAPE', detail: 'live reply is not an object' };
  }
  const record = raw as Record<string, unknown>;
  if (typeof record['model'] !== 'string' || record['model'] !== approvedModel) {
    return { ok: false, code: 'WRONG_MODEL', detail: 'live model echo mismatch' };
  }
  if (typeof record['text'] !== 'string' || record['text'].length === 0) {
    return { ok: false, code: 'BAD_SHAPE', detail: 'live reply text is not a non-empty string' };
  }
  if (record['text'].length > MAX_OBSERVATION_CHARS) {
    return { ok: false, code: 'TEXT_TOO_LONG', detail: `live text exceeds ${MAX_OBSERVATION_CHARS} characters` };
  }
  const usage = record['usage'];
  if (typeof usage !== 'object' || usage === null) {
    return { ok: false, code: 'BAD_USAGE', detail: 'live reply usage is not an object' };
  }
  const numbers = usage as Record<string, unknown>;
  for (const key of ['promptTokens', 'completionTokens', 'totalTokens'] as const) {
    const value = numbers[key];
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
      return { ok: false, code: 'BAD_USAGE', detail: `live usage.${key} is not a safe non-negative integer` };
    }
  }
  // Defense in depth with the transport's finish-reason allow-list: the
  // normalized envelope must name an explicit successful completion. Anything
  // else — truncated, refused, malformed, or unknown — refuses here too, so a
  // partial output can never become a sanitized result by any path.
  if (record['finishReason'] !== 'stop') {
    return { ok: false, code: 'BAD_SHAPE', detail: 'live reply did not complete with a stop finish reason' };
  }
  return {
    ok: true,
    value: {
      text: record['text'] as string,
      usage: {
        promptTokens: numbers['promptTokens'] as number,
        completionTokens: numbers['completionTokens'] as number,
        totalTokens: numbers['totalTokens'] as number,
      },
    },
  };
}

/** Live analysis: quoted observations only, same length rules as mock. */
export function sanitizeLiveAnalysisResponse(raw: unknown, approvedModel: string): LiveSanitizeResult {
  const envelope = checkLiveEnvelope(raw, approvedModel);
  if (!envelope.ok) return envelope;
  return {
    ok: true,
    value: {
      kind: 'analysis',
      observations: envelope.value.text,
      usage: envelope.value.usage,
      provider: 'baseten',
      model: approvedModel,
      transport: 'baseten-live',
      liveInference: true,
    },
  };
}

/**
 * Live proposals pass only through the audited closed-grammar host parser,
 * exactly like mock proposals. Triumph-by-construction is impossible.
 */
export function sanitizeLiveProposalResponse(raw: unknown, approvedModel: string): LiveSanitizeResult {
  const envelope = checkLiveEnvelope(raw, approvedModel);
  if (!envelope.ok) return envelope;
  let parsed: ProposalResult;
  try {
    parsed = parseProposal(envelope.value.text);
  } catch {
    return { ok: false, code: 'PROPOSAL_REJECTED', detail: 'live proposal parser threw on hostile input' };
  }
  if (!parsed.ok) {
    return {
      ok: false,
      code: 'PROPOSAL_REJECTED',
      detail: `live closed grammar refused the proposal (${parsed.status}/${parsed.reason})`,
    };
  }
  return {
    ok: true,
    value: {
      kind: 'proposal',
      adjustments: parsed.adjustments.map((a) => ({ ...a })),
      renderedCss: parsed.renderedCss,
      usage: envelope.value.usage,
      provider: 'baseten',
      model: approvedModel,
      transport: 'baseten-live',
      liveInference: true,
    },
  };
}
