// C3-B2B E1: data-only registration bridge for stored model proposals (Zone E).
//
// Zone P reads the artifact and re-derives the evidence; this module is the only way a
// stored model proposal enters Zone E, and it carries DATA ONLY: plain selector/property/value
// triples plus provenance labels (strings). It never imports inference or provenance code, never
// touches the network, providers, credentials, reservations or the filesystem, and never stages,
// runs or verifies anything (that is E2). It re-validates every triple with the trusted core
// grammar, requires the claimed CSS to equal the freshly host-rendered bytes, and registers the
// result BY IDENTITY in a module-private set, so a copy, clone or hand-built lookalike is not
// registered, whatever its fields say.
//
// Identity: the candidate id carries a provenance tag plus the source run id
// (`model-proposal:<runId>`, via candidateIdOf), so a proposal with CSS identical to the
// hand-authored PC-1 control gets a different id and can never satisfy, overwrite or merge
// into PC-1's row or evidence. The coordinator's hand-authored path is untouched:
// assertHandAuthoredControls still refuses everything not in the in-code trusted set, including
// objects produced here.
import { CssAdjustmentError, renderCssAdjustments, MAX_ADJUSTMENTS, type CssAdjustment } from './css-adjustments.ts';
import { candidateIdOf, type ModelProposalEntry } from './candidate-coordinator.ts';

export type ModelProposalErrorCode =
  | 'NOT_A_LIST'
  | 'EMPTY'
  | 'TOO_MANY'
  | 'TOO_MANY_ADJUSTMENTS'
  | 'NOT_PLAIN_OBJECT'
  | 'BAD_SHAPE'
  | 'BAD_TYPE'
  | 'UNKNOWN_SELECTOR'
  | 'PROPERTY_NOT_ALLOWED'
  | 'VALUE_NOT_ALLOWED'
  | 'DUPLICATE_PAIR'
  | 'RENDER_MISMATCH'
  | 'BAD_RUN_ID'
  | 'BAD_SHA'
  | 'BAD_APPROVED_SHA'
  | 'NOT_REGISTERED';

export class ModelProposalError extends Error {
  readonly code: ModelProposalErrorCode;
  constructor(code: ModelProposalErrorCode, detail: string) {
    super(`refused model-proposal registration: ${detail} (${code})`);
    this.name = 'ModelProposalError';
    this.code = code;
  }
}

/** Plain data from Zone P. Every field is untrusted until validated below. */
export type ModelProposalInput = {
  triples: unknown;
  renderedCss: unknown;
  runId: unknown;
  approvedSha: unknown;
  sourceSha: unknown;
  inputSha256: unknown;
  artifactSha256: unknown;
};

export type RegisteredModelProposal = {
  readonly kind: 'model-proposal';
  /** Operator-supplied run id of the stored artifact (provenance label, not evidence). */
  readonly runId: string;
  /** Verification revision this registration is bound to (the E1 caller supplies V explicitly). */
  readonly approvedSha: string;
  /** Claimed source revision of the original proposal (operator-reported, never verified here). */
  readonly sourceSha: string;
  /** Recomputed input hash, carried as data from Zone P (recomputed there, not here). */
  readonly inputSha256: string;
  /** Local artifact file hash, carried as data from Zone P. */
  readonly artifactSha256: string;
  readonly adjustments: readonly CssAdjustment[];
  /** Bytes freshly rendered by Zone E from the triples (never the claimed text). */
  readonly renderedCss: string;
  /** Provenance-tagged identity: never equal to a hand-authored candidate id. */
  readonly candidateId: string;
};

// The run-id grammar is restated here (same source: packages/intake/src/consent.ts) so Zone E
// keeps no intake edge; the bridge stays within the core grammar leaves plus node:crypto.
const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SHA40 = /^[0-9a-f]{40}$/;
const SHA64 = /^[0-9a-f]{64}$/;
const TRIPLE_KEYS = ['selector', 'property', 'value'] as const;

/** The provenance tag hashed into a model-proposal identity. `:` cannot appear in a run id. */
export function modelProposalTagOf(runId: string): string {
  return `model-proposal:${runId}`;
}

/** Provenance-tagged identity: the tag plus the source run id join the hashed input. Pure. */
export function modelProposalIdOf(approvedSha: string, runId: string, renderedCss: string): string {
  return candidateIdOf(approvedSha, renderedCss, modelProposalTagOf(runId));
}

function checkSha(value: unknown, bits: 40 | 64, field: string): string {
  const re = bits === 40 ? SHA40 : SHA64;
  if (typeof value !== 'string' || !re.test(value)) {
    throw new ModelProposalError('BAD_SHA', `${field} must be ${bits} lowercase hex characters`);
  }
  return value;
}

function toAdjustment(triple: unknown, index: number): CssAdjustment {
  if (typeof triple !== 'object' || triple === null) {
    throw new ModelProposalError('NOT_PLAIN_OBJECT', `adjustment ${index} is not an object`);
  }
  const proto = Object.getPrototypeOf(triple);
  if (proto !== Object.prototype && proto !== null) {
    throw new ModelProposalError('NOT_PLAIN_OBJECT', `adjustment ${index} is not plain data`);
  }
  const keys = Object.keys(triple);
  if (keys.length !== TRIPLE_KEYS.length || !TRIPLE_KEYS.every((k) => keys.includes(k))) {
    throw new ModelProposalError('BAD_SHAPE', `adjustment ${index} must hold exactly selector, property and value`);
  }
  const rec = triple as Record<string, unknown>;
  if (typeof rec.selector !== 'string' || typeof rec.property !== 'string' || typeof rec.value !== 'string') {
    throw new ModelProposalError('BAD_TYPE', `adjustment ${index} fields must be strings`);
  }
  return { selector: rec.selector, property: rec.property, value: rec.value };
}

/**
 * Validate plain Zone P data and register the proposal by identity. Throws ModelProposalError
 * (fail closed) on any refusal; returns a deeply frozen registered object on success. The only
 * CSS ever used downstream is the freshly rendered string, byte-compared against the claim.
 */
export function registerModelProposal(input: ModelProposalInput): RegisteredModelProposal {
  if (!input || typeof input !== 'object') throw new ModelProposalError('NOT_A_LIST', 'registration input must hold plain data');
  const { triples, renderedCss, runId, approvedSha, sourceSha, inputSha256, artifactSha256 } = input;
  if (!Array.isArray(triples)) throw new ModelProposalError('NOT_A_LIST', 'triples must be a list');
  if (triples.length === 0) throw new ModelProposalError('EMPTY', 'at least one adjustment is required');
  if (triples.length > MAX_ADJUSTMENTS) throw new ModelProposalError('TOO_MANY', `at most ${MAX_ADJUSTMENTS} adjustments`);
  const adjustments = triples.map((t, i) => toAdjustment(t, i));

  if (typeof runId !== 'string' || !RUN_ID.test(runId)) throw new ModelProposalError('BAD_RUN_ID', 'runId must match the run-id grammar');
  if (typeof approvedSha !== 'string' || !SHA40.test(approvedSha)) {
    throw new ModelProposalError('BAD_APPROVED_SHA', 'approvedSha must be 40 lowercase hex characters');
  }
  const source = checkSha(sourceSha, 40, 'sourceSha');
  const inputHash = checkSha(inputSha256, 64, 'inputSha256');
  const artifactHash = checkSha(artifactSha256, 64, 'artifactSha256');

  // Trusted revalidation: the closed core grammar decides, and the renderer output alphabet is
  // fixed host text regardless of the input. Grammar error codes pass through unchanged.
  let rendered: string;
  try {
    rendered = renderCssAdjustments(adjustments);
  } catch (e) {
    if (e instanceof CssAdjustmentError) {
      throw new ModelProposalError(e.code, `adjustments violate the closed grammar: ${e.message}`);
    }
    throw e;
  }
  if (typeof renderedCss !== 'string' || renderedCss !== rendered) {
    throw new ModelProposalError('RENDER_MISMATCH', 'claimed renderedCss differs from the freshly rendered bytes');
  }

  for (const a of adjustments) Object.freeze(a);
  const registered: RegisteredModelProposal = {
    kind: 'model-proposal',
    runId,
    approvedSha,
    sourceSha: source,
    inputSha256: inputHash,
    artifactSha256: artifactHash,
    adjustments: Object.freeze([...adjustments]),
    renderedCss: rendered,
    candidateId: modelProposalIdOf(approvedSha, runId, rendered),
  };
  Object.freeze(registered);
  REGISTERED.add(registered);
  return registered;
}

const REGISTERED = new WeakSet<object>();

/** The object must BE a registered proposal (identity, not field equality): copies are refused. */
export function assertRegisteredModelProposal(x: unknown): asserts x is RegisteredModelProposal {
  if (typeof x !== 'object' || x === null || !REGISTERED.has(x)) {
    throw new ModelProposalError('NOT_REGISTERED', 'not a registered model proposal (copies and lookalikes are refused)');
  }
}

/**
 * Build the canonical scoreboard row for a registered proposal. Requires identity (only genuinely
 * registered proposals become rows) and binds the row to the registration's verification revision.
 * The row claims no verdict: E1 registers, it never runs.
 */
export function modelProposalEntryOf(reg: unknown): ModelProposalEntry {
  assertRegisteredModelProposal(reg);
  return {
    id: `MODEL-${reg.runId}`,
    description: `Stored model proposal ${reg.runId}: ${reg.adjustments.length} adjustment(s), registered for isolated verification; never run, never verified`,
    provenance: 'model-proposal',
    candidateId: reg.candidateId,
    adjustments: reg.adjustments.map((a) => ({ ...a })),
    renderedCss: reg.renderedCss,
    runId: reg.runId,
    approvedSha: reg.approvedSha,
    sourceSha: reg.sourceSha,
    sourceProvenance: 'operator-reported',
    inputSha256: reg.inputSha256,
    artifactSha256: reg.artifactSha256,
    replays: [],
    note: 'E1 registration only: no replay has run and this row claims no verdict.',
  };
}

