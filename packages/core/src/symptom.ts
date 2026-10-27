// The model's reading of a recording. It is an untrusted HYPOTHESIS: it is
// validated locally, labelled as such, and can never become trusted oracle
// evidence or a VERIFIED verdict.
export type Confidence = 'low' | 'medium' | 'high';
export const CONFIDENCE_LEVELS: readonly Confidence[] = ['low', 'medium', 'high'];

export type SymptomObservation = { timestampSec: number; text: string; confidence: Confidence };
export type ReproductionStep = { action: string; target: string; approximateTimeSec: number };

export type Symptom = {
  schemaVersion: 1;
  /** Always a hypothesis; set by the validator, never by the model. */
  provenance: 'model-hypothesis';
  summary: string;
  expected: string;
  actual: string;
  /** Things the model says it saw, with video timestamps. */
  observations: SymptomObservation[];
  /** Tentative, to be confirmed by a real Playwright reproduction. */
  reproductionSteps: ReproductionStep[];
  confidence: Confidence;
  uncertainties: string[];
  /** Claims the model says it cannot support from the video alone. */
  unsupportedClaims: string[];
  /** The model's own judgement that the clip shows enough to attempt a reproduction. */
  sufficientContext: boolean;
};

export const SYMPTOM_LIMITS = {
  maxStringChars: 800,
  maxItems: 20,
  /** Allowed overshoot of a timestamp past the clip duration. */
  timestampToleranceSec: 0.5,
} as const;

const confidenceSchema = { type: 'string', enum: [...CONFIDENCE_LEVELS] };

/**
 * JSON Schema sent to Meta via Responses `text.format`. Kept inside the strict-mode
 * subset (`additionalProperties:false`, every key required, no recursion, no
 * oneOf/allOf). Constraints beyond that are enforced locally by {@link parseSymptom}.
 */
export const SYMPTOM_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'expected', 'actual', 'observations', 'reproductionSteps', 'confidence', 'uncertainties', 'unsupportedClaims', 'sufficientContext'],
  properties: {
    summary: { type: 'string', description: 'One or two sentences describing the visible problem.' },
    expected: { type: 'string', description: 'What the user would expect to happen, as far as the video shows.' },
    actual: { type: 'string', description: 'What is actually seen to happen.' },
    observations: {
      type: 'array',
      description: 'Things visible in the video, each with a timestamp in seconds.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['timestampSec', 'text', 'confidence'],
        properties: { timestampSec: { type: 'number' }, text: { type: 'string' }, confidence: confidenceSchema },
      },
    },
    reproductionSteps: {
      type: 'array',
      description: 'Tentative steps to reproduce in a browser. Leave empty if the video does not show enough.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['action', 'target', 'approximateTimeSec'],
        properties: { action: { type: 'string' }, target: { type: 'string' }, approximateTimeSec: { type: 'number' } },
      },
    },
    confidence: confidenceSchema,
    uncertainties: { type: 'array', items: { type: 'string' }, description: 'What could not be determined from the video.' },
    unsupportedClaims: { type: 'array', items: { type: 'string' }, description: 'Claims that the video does not support.' },
    sufficientContext: { type: 'boolean', description: 'True only if the video shows enough to attempt a reproduction.' },
  },
} as const;

export type SymptomIssue = { path: string; message: string };

export class SymptomValidationError extends Error {
  readonly issues: SymptomIssue[];
  constructor(issues: SymptomIssue[]) {
    super(`symptom failed validation: ${issues.slice(0, 5).map((i) => `${i.path}: ${i.message}`).join('; ')}`);
    this.name = 'SymptomValidationError';
    this.issues = issues.slice(0, 20);
  }
}

// Reject NUL and C0 control characters except tab and newline.
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Strictly validate untrusted model output. Unknown keys, wrong types, oversize
 * values, timestamps outside the clip, and contradictory claims are all rejected.
 */
export function parseSymptom(raw: unknown, ctx: { videoDurationSec: number }): Symptom {
  const issues: SymptomIssue[] = [];
  const bad = (path: string, message: string) => issues.push({ path, message });
  if (!isRecord(raw)) throw new SymptomValidationError([{ path: '$', message: 'expected an object' }]);

  const allowed = new Set(SYMPTOM_JSON_SCHEMA.required as readonly string[]);
  for (const key of Object.keys(raw)) if (!allowed.has(key)) bad(key, 'unknown property');

  const str = (v: unknown, path: string): string => {
    if (typeof v !== 'string') {
      bad(path, 'expected a string');
      return '';
    }
    const t = v.trim();
    if (t.length === 0) bad(path, 'must not be empty');
    if (t.length > SYMPTOM_LIMITS.maxStringChars) bad(path, `exceeds ${SYMPTOM_LIMITS.maxStringChars} characters`);
    if (CONTROL_CHARS.test(t)) bad(path, 'contains control characters');
    return t;
  };
  const conf = (v: unknown, path: string): Confidence => {
    if (typeof v === 'string' && (CONFIDENCE_LEVELS as readonly string[]).includes(v)) return v as Confidence;
    bad(path, `expected one of ${CONFIDENCE_LEVELS.join(', ')}`);
    return 'low';
  };
  const time = (v: unknown, path: string): number => {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      bad(path, 'expected a finite number');
      return 0;
    }
    if (v < 0 || v > ctx.videoDurationSec + SYMPTOM_LIMITS.timestampToleranceSec) {
      bad(path, `timestamp ${v} is outside the ${ctx.videoDurationSec.toFixed(1)} s clip`);
    }
    return v;
  };
  const list = <T>(v: unknown, path: string, item: (x: unknown, p: string) => T): T[] => {
    if (!Array.isArray(v)) {
      bad(path, 'expected an array');
      return [];
    }
    if (v.length > SYMPTOM_LIMITS.maxItems) bad(path, `more than ${SYMPTOM_LIMITS.maxItems} items`);
    return v.slice(0, SYMPTOM_LIMITS.maxItems).map((x, i) => item(x, `${path}[${i}]`));
  };
  const obj = (x: unknown, path: string, keys: string[]): Record<string, unknown> => {
    if (!isRecord(x)) {
      bad(path, 'expected an object');
      return {};
    }
    for (const k of Object.keys(x)) if (!keys.includes(k)) bad(`${path}.${k}`, 'unknown property');
    return x;
  };

  const observations = list(raw.observations, 'observations', (x, p) => {
    const o = obj(x, p, ['timestampSec', 'text', 'confidence']);
    return { timestampSec: time(o.timestampSec, `${p}.timestampSec`), text: str(o.text, `${p}.text`), confidence: conf(o.confidence, `${p}.confidence`) };
  });
  const reproductionSteps = list(raw.reproductionSteps, 'reproductionSteps', (x, p) => {
    const o = obj(x, p, ['action', 'target', 'approximateTimeSec']);
    return { action: str(o.action, `${p}.action`), target: str(o.target, `${p}.target`), approximateTimeSec: time(o.approximateTimeSec, `${p}.approximateTimeSec`) };
  });
  const uncertainties = list(raw.uncertainties, 'uncertainties', str);
  const unsupportedClaims = list(raw.unsupportedClaims, 'unsupportedClaims', str);
  const summary = str(raw.summary, 'summary');
  const expected = str(raw.expected, 'expected');
  const actual = str(raw.actual, 'actual');
  const confidence = conf(raw.confidence, 'confidence');
  if (typeof raw.sufficientContext !== 'boolean') bad('sufficientContext', 'expected a boolean');
  const sufficientContext = raw.sufficientContext === true;

  // Cross-field consistency: no claimed certainty without grounds.
  if (sufficientContext && observations.length === 0) bad('sufficientContext', 'claims sufficient context but reports no observations');
  if (sufficientContext && reproductionSteps.length === 0) bad('sufficientContext', 'claims sufficient context but gives no reproduction steps');
  if (!sufficientContext && uncertainties.length === 0) bad('uncertainties', 'insufficient context must say what is uncertain');

  if (issues.length > 0) throw new SymptomValidationError(issues);
  return {
    schemaVersion: 1,
    provenance: 'model-hypothesis',
    summary,
    expected,
    actual,
    observations,
    reproductionSteps,
    confidence,
    uncertainties,
    unsupportedClaims,
    sufficientContext,
  };
}

export type SymptomAssessment = {
  /** Always 'hypothesis': a symptom is never trusted evidence. */
  trust: 'hypothesis';
  /** Whether a real browser reproduction attempt is worth starting. Not a verdict. */
  canAttemptReproduction: boolean;
  reasons: string[];
};

/** Deterministic, model-independent decision about what to do next with a symptom. */
export function assessSymptom(symptom: Symptom): SymptomAssessment {
  const reasons: string[] = [];
  if (!symptom.sufficientContext) reasons.push('the model reports the video lacks enough context');
  if (symptom.confidence === 'low') reasons.push('overall confidence is low');
  if (symptom.reproductionSteps.length === 0) reasons.push('no reproduction steps were proposed');
  if (symptom.observations.length === 0) reasons.push('no timestamped observations were reported');
  const canAttemptReproduction = reasons.length === 0;
  if (canAttemptReproduction) reasons.push('hypothesis only: must be confirmed by a real browser reproduction and the trusted oracle');
  return { trust: 'hypothesis', canAttemptReproduction, reasons };
}
