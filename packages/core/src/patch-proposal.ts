// C3-A strict validation of a model-proposed F01 CSS adjustment (pipeline V0 to V7 of
// tasks/PP-META-I2-C3.md). A proposal is untrusted DATA. This module never executes it, never
// touches the filesystem and never imports the staging runner: it only turns raw model text into
// either validated typed adjustments (rendered by renderCssAdjustments, the single source of the
// grammar) or a classified rejection that carries no raw model text.
import { createHash } from 'node:crypto';
import { CssAdjustmentError, MAX_ADJUSTMENTS, renderCssAdjustments, describeGrammar, type CssAdjustment } from './css-adjustments.ts';

export const MAX_PROPOSAL_BYTES = 2_048;
export const MAX_JSON_DEPTH = 6;

export type RejectionReason =
  | 'PROPOSAL_TOO_LARGE'
  | 'MALFORMED_JSON'
  | 'DUPLICATE_KEY'
  | 'UNKNOWN_KEY'
  | 'BAD_SHAPE'
  | 'BAD_TYPE'
  | 'TOO_MANY_ADJUSTMENTS'
  | 'UNKNOWN_SELECTOR'
  | 'PROPERTY_NOT_ALLOWED'
  | 'VALUE_NOT_ALLOWED'
  | 'DUPLICATE_PAIR'
  | 'FORBIDDEN_CONTENT';

export type ForbiddenClass =
  | 'control-character'
  | 'url-function'
  | 'import'
  | 'expression'
  | 'javascript-scheme'
  | 'data-scheme'
  | 'network-scheme'
  | 'comment-or-protocol-slashes'
  | 'markup'
  | 'css-punctuation'
  | 'quote-or-backslash'
  | 'path-reference'
  | 'trust-root-name';

export type ProposalAccepted = {
  ok: true;
  provenance: 'model-hypothesis';
  /** Host-validated values: every string is proven to equal an allowlist entry or a strict integer/length token. */
  adjustments: CssAdjustment[];
  renderedCss: string;
  rawSha256: string;
  rawBytes: number;
};

export type ProposalRejected = {
  ok: false;
  provenance: 'model-hypothesis';
  status: 'PATCH_REJECTED' | 'SECURITY_BLOCKED';
  reason: RejectionReason;
  forbiddenClass: ForbiddenClass | null;
  rawSha256: string;
  rawBytes: number;
};

export type ProposalResult = ProposalAccepted | ProposalRejected;

// ---------------------------------------------------------------- V1 strict JSON (RFC 8259)

type Json = null | boolean | number | string | Json[] | Map<string, Json>;
class JsonFail extends Error {
  readonly reason: 'MALFORMED_JSON' | 'DUPLICATE_KEY';
  constructor(reason: 'MALFORMED_JSON' | 'DUPLICATE_KEY') {
    super(reason);
    this.reason = reason;
  }
}

const WS = new Set([0x20, 0x09, 0x0a, 0x0d]);

/**
 * Exactly one JSON value, nothing else. Objects are Maps, so `__proto__` is just a key and cannot
 * pollute anything. Duplicate keys at any depth are an error (JSON.parse would keep the last one).
 */
function parseStrictJson(text: string): Json {
  let i = 0;
  const fail = (): never => {
    throw new JsonFail('MALFORMED_JSON');
  };
  const ws = () => {
    while (i < text.length && WS.has(text.charCodeAt(i))) i++;
  };
  const lit = (word: string, value: Json): Json => {
    if (text.startsWith(word, i)) {
      i += word.length;
      return value;
    }
    return fail();
  };
  const str = (): string => {
    i++; // opening quote
    let out = '';
    for (;;) {
      if (i >= text.length) return fail();
      const c = text.charCodeAt(i);
      if (c === 0x22) {
        i++;
        return out;
      }
      if (c < 0x20) return fail(); // raw control characters are not valid JSON
      if (c === 0x5c) {
        const e = text[i + 1];
        i += 2;
        if (e === '"' || e === '\\' || e === '/') out += e;
        else if (e === 'b') out += '\b';
        else if (e === 'f') out += '\f';
        else if (e === 'n') out += '\n';
        else if (e === 'r') out += '\r';
        else if (e === 't') out += '\t';
        else if (e === 'u') {
          const hex = text.slice(i, i + 4);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) return fail();
          out += String.fromCharCode(parseInt(hex, 16));
          i += 4;
        } else return fail();
      } else {
        out += text[i];
        i++;
      }
    }
  };
  const num = (): number => {
    const m = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(i));
    if (!m) return fail();
    i += m[0].length;
    return Number(m[0]);
  };
  const value = (depth: number): Json => {
    if (depth > MAX_JSON_DEPTH) return fail();
    ws();
    const c = text[i];
    if (c === '{') {
      i++;
      const obj = new Map<string, Json>();
      ws();
      if (text[i] === '}') {
        i++;
        return obj;
      }
      for (;;) {
        ws();
        if (text[i] !== '"') return fail();
        const key = str();
        if (obj.has(key)) throw new JsonFail('DUPLICATE_KEY');
        ws();
        if (text[i] !== ':') return fail();
        i++;
        obj.set(key, value(depth + 1));
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === '}') {
          i++;
          return obj;
        }
        return fail();
      }
    }
    if (c === '[') {
      i++;
      const arr: Json[] = [];
      ws();
      if (text[i] === ']') {
        i++;
        return arr;
      }
      for (;;) {
        arr.push(value(depth + 1));
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === ']') {
          i++;
          return arr;
        }
        return fail();
      }
    }
    if (c === '"') return str();
    if (c === 't') return lit('true', true);
    if (c === 'f') return lit('false', false);
    if (c === 'n') return lit('null', null);
    if (c === '-' || (c !== undefined && c >= '0' && c <= '9')) return num();
    return fail();
  };
  if (text.charCodeAt(0) === 0xfeff) return fail(); // BOM
  const v = value(0);
  ws();
  if (i !== text.length) return fail(); // trailing content, a second value, or a closing fence
  return v;
}

// ---------------------------------------------------------------- V2 forbidden content

// Removed before matching so invisible characters cannot split a forbidden token (U+200B, U+00AD, U+FEFF ...).
const INVISIBLE = /[\p{White_Space}\p{Cf}\p{Default_Ignorable_Code_Point}\p{Variation_Selector}\u{E0000}-\u{E007F}]/gu;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const FORBIDDEN: Array<[ForbiddenClass, string[]]> = [
  ['url-function', ['url(']],
  ['import', ['@import']],
  ['expression', ['expression(']],
  ['javascript-scheme', ['javascript:']],
  ['data-scheme', ['data:']],
  ['network-scheme', ['http']],
  ['comment-or-protocol-slashes', ['//', '/*', '*/']],
  ['markup', ['<', '>']],
  ['css-punctuation', ['{', '}', ';']],
  ['quote-or-backslash', ['\\', '"', "'", '`']],
  ['path-reference', ['..', '/']],
  ['trust-root-name', ['verifier', 'fixtures', 'tests', 'node_modules', '.proofpilot', '.git', '.env']],
];

/** Which forbidden class (if any) a decoded string belongs to. Control characters are checked BEFORE stripping. */
export function forbiddenClassOf(decoded: string): ForbiddenClass | null {
  if (CONTROL.test(decoded)) return 'control-character';
  const norm = decoded.normalize('NFKC').replace(INVISIBLE, '').toLowerCase();
  // Stripping can expose a control character that NFKC mapped from a compatibility form.
  if (CONTROL.test(norm)) return 'control-character';
  for (const [cls, tokens] of FORBIDDEN) if (tokens.some((t) => norm.includes(t))) return cls;
  return null;
}

function scanTree(v: Json): ForbiddenClass | null {
  if (typeof v === 'string') return forbiddenClassOf(v);
  if (Array.isArray(v)) {
    for (const x of v) {
      const c = scanTree(x);
      if (c) return c;
    }
  } else if (v instanceof Map) {
    for (const [k, x] of v) {
      const c = forbiddenClassOf(k) ?? scanTree(x);
      if (c) return c;
    }
  }
  return null;
}

// ---------------------------------------------------------------- pipeline

const ITEM_KEYS = ['selector', 'property', 'value'];

function reject(status: ProposalRejected['status'], reason: RejectionReason, base: { rawSha256: string; rawBytes: number }, forbiddenClass: ForbiddenClass | null = null): ProposalRejected {
  return { ok: false, provenance: 'model-hypothesis', status, reason, forbiddenClass, ...base };
}

/** Validate raw model text. Pure and synchronous; no side effects of any kind. */
export function parseProposal(raw: unknown): ProposalResult {
  if (typeof raw !== 'string') return reject('PATCH_REJECTED', 'BAD_TYPE', { rawSha256: createHash('sha256').update('').digest('hex'), rawBytes: 0 });
  const bytes = Buffer.byteLength(raw, 'utf8');
  const base = { rawSha256: createHash('sha256').update(raw, 'utf8').digest('hex'), rawBytes: bytes };

  // V0: bound the size before any parsing.
  if (bytes > MAX_PROPOSAL_BYTES) return reject('PATCH_REJECTED', 'PROPOSAL_TOO_LARGE', base);

  // V1: exactly one strict JSON value, duplicate keys rejected.
  let tree: Json;
  try {
    tree = parseStrictJson(raw);
  } catch (e) {
    if (e instanceof JsonFail) return reject('PATCH_REJECTED', e.reason, base);
    throw e;
  }

  // V2: forbidden content in any decoded key or string, wins over structural errors.
  const cls = scanTree(tree);
  if (cls) return reject('SECURITY_BLOCKED', 'FORBIDDEN_CONTENT', base, cls);

  // V3: exact shape, no unknown keys at any depth (including prototype-dangerous names).
  if (!(tree instanceof Map)) return reject('PATCH_REJECTED', 'BAD_SHAPE', base);
  for (const k of tree.keys()) if (k !== 'adjustments') return reject('PATCH_REJECTED', 'UNKNOWN_KEY', base);
  const list = tree.get('adjustments');
  if (!Array.isArray(list)) return reject('PATCH_REJECTED', 'BAD_SHAPE', base);
  for (const item of list) {
    if (!(item instanceof Map)) return reject('PATCH_REJECTED', 'BAD_SHAPE', base);
    for (const k of item.keys()) if (!ITEM_KEYS.includes(k)) return reject('PATCH_REJECTED', 'UNKNOWN_KEY', base);
    if (item.size !== ITEM_KEYS.length) return reject('PATCH_REJECTED', 'BAD_SHAPE', base);
  }

  // V4: 0 to 4 items, all three fields JSON strings.
  if (list.length > MAX_ADJUSTMENTS) return reject('PATCH_REJECTED', 'TOO_MANY_ADJUSTMENTS', base);
  const adjustments: CssAdjustment[] = [];
  for (const item of list as Map<string, Json>[]) {
    const selector = item.get('selector');
    const property = item.get('property');
    const value = item.get('value');
    if (typeof selector !== 'string' || typeof property !== 'string' || typeof value !== 'string') return reject('PATCH_REJECTED', 'BAD_TYPE', base);
    adjustments.push({ selector, property, value });
  }

  // V5 to V7: closed grammar, duplicate pairs and rendering all come from the one renderer.
  try {
    const renderedCss = renderCssAdjustments(adjustments);
    return { ok: true, provenance: 'model-hypothesis', adjustments, renderedCss, ...base };
  } catch (e) {
    if (e instanceof CssAdjustmentError) {
      const map: Record<CssAdjustmentError['code'], RejectionReason> = {
        TOO_MANY_ADJUSTMENTS: 'TOO_MANY_ADJUSTMENTS',
        BAD_TYPE: 'BAD_TYPE',
        UNKNOWN_SELECTOR: 'UNKNOWN_SELECTOR',
        PROPERTY_NOT_ALLOWED: 'PROPERTY_NOT_ALLOWED',
        VALUE_NOT_ALLOWED: 'VALUE_NOT_ALLOWED',
        DUPLICATE_PAIR: 'DUPLICATE_PAIR',
      };
      return reject('PATCH_REJECTED', map[e.code], base);
    }
    throw e;
  }
}

/**
 * The only way to obtain adjustments for the staging runner: throws unless the proposal was accepted.
 * C3-A never calls the staging runner; this exists so a failed proposal cannot be handed on by accident.
 */
export function acceptedAdjustments(result: ProposalResult): CssAdjustment[] {
  if (!result.ok) throw new Error(`proposal was not accepted (${result.status}/${result.reason})`);
  return result.adjustments.map((a) => ({ ...a }));
}

/** Strict JSON schema sent as the structured-output contract. Local validation stays authoritative. */
export function proposalJsonSchema(): object {
  const g = describeGrammar();
  return {
    type: 'object',
    additionalProperties: false,
    required: ['adjustments'],
    properties: {
      adjustments: {
        type: 'array',
        maxItems: MAX_ADJUSTMENTS,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['selector', 'property', 'value'],
          properties: {
            selector: { type: 'string', enum: g.selectors.map((s) => s.selector) },
            property: { type: 'string', enum: [...new Set(g.selectors.flatMap((s) => s.properties))] },
            value: { type: 'string', maxLength: 8 },
          },
        },
      },
    },
  };
}
