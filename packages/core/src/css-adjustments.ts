// Trusted rendering of F01 candidate CSS adjustments (C3-0 scope).
//
// A candidate is DATA: a short list of (selector, property, value) strings. This module
// validates each tuple against closed tables and renders CSS exclusively from host-owned
// constants and host-formatted integers. No input string is ever concatenated into the
// output, so the output alphabet is fixed regardless of the input.
//
// Scope: the closed grammar of tasks/PP-META-I2-C3.md (pipeline steps V5 to V7). Parsing
// raw model JSON (V0 to V4) is C3-A and is deliberately not implemented here.

export type CssAdjustment = { selector: string; property: string; value: string };

export type CssAdjustmentErrorCode =
  | 'TOO_MANY_ADJUSTMENTS'
  | 'BAD_TYPE'
  | 'UNKNOWN_SELECTOR'
  | 'PROPERTY_NOT_ALLOWED'
  | 'VALUE_NOT_ALLOWED'
  | 'DUPLICATE_PAIR';

export class CssAdjustmentError extends Error {
  readonly code: CssAdjustmentErrorCode;
  constructor(code: CssAdjustmentErrorCode, message: string) {
    super(message);
    this.name = 'CssAdjustmentError';
    this.code = code;
  }
}

export const MAX_ADJUSTMENTS = 4;

/** Selector -> properties it may set. Insertion order is the canonical sort order. */
const SELECTORS: ReadonlyMap<string, readonly string[]> = new Map([
  ['.promo-overlay', ['pointer-events', 'display', 'visibility', 'z-index', 'position', 'height']],
  ['.promo', ['pointer-events', 'display', 'visibility', 'z-index']],
  ['.add-to-cart', ['pointer-events', 'visibility', 'z-index', 'position']],
]);

/** Properties with an enumerated value set (the emitted text is the host constant). */
const ENUM_VALUES: ReadonlyMap<string, readonly string[]> = new Map([
  ['pointer-events', ['none', 'auto']],
  ['display', ['none', 'block']],
  ['visibility', ['visible', 'hidden']],
  ['position', ['static', 'relative', 'fixed', 'absolute', 'sticky']],
]);

const Z_INDEX = /^(?:-1|0|[1-9][0-9]?|100)$/;
const HEIGHT_VH = /^([1-9][0-9]?|100)vh$/;
const HEIGHT_PX = /^([1-9][0-9]{0,2})px$/;

/** Host-formatted value text for a (property, value) pair, or null when not allowed. */
function renderValue(property: string, value: string): string | null {
  const enumerated = ENUM_VALUES.get(property);
  if (enumerated) return enumerated.find((v) => v === value) ?? null; // emit the host constant, not the input
  if (property === 'z-index') return Z_INDEX.test(value) ? String(Number(value)) : null;
  if (property === 'height') {
    if (value === '0') return '0';
    const vh = HEIGHT_VH.exec(value);
    if (vh) return `${Number(vh[1])}vh`;
    const px = HEIGHT_PX.exec(value);
    if (px && Number(px[1]) <= 600) return `${Number(px[1])}px`;
    return null;
  }
  return null;
}

/** Read-only description of the closed grammar, derived from the same tables the renderer enforces. */
export function describeGrammar(): { selectors: Array<{ selector: string; properties: string[] }>; values: Array<{ property: string; allowed: string }> } {
  const props = new Set<string>();
  const selectors = [...SELECTORS].map(([selector, properties]) => {
    properties.forEach((p) => props.add(p));
    return { selector, properties: [...properties] };
  });
  const values = [...props].map((property) => ({
    property,
    allowed:
      ENUM_VALUES.get(property)?.join(' | ') ??
      (property === 'z-index'
        ? 'an integer from -1 to 100 as a string, no plus sign and no leading zeros'
        : '"0", or 1 to 100 followed by "vh", or 1 to 600 followed by "px"'),
  }));
  return { selectors, values };
}

/**
 * Validate and render. Throws CssAdjustmentError on the first violation; returns the
 * canonical rule block (rules sorted by selector then property table order, newline
 * separated, trailing newline when non-empty; empty string for no adjustments).
 */
export function renderCssAdjustments(adjustments: readonly CssAdjustment[]): string {
  if (!Array.isArray(adjustments)) throw new CssAdjustmentError('BAD_TYPE', 'adjustments must be an array');
  if (adjustments.length > MAX_ADJUSTMENTS) {
    throw new CssAdjustmentError('TOO_MANY_ADJUSTMENTS', `at most ${MAX_ADJUSTMENTS} adjustments`);
  }
  const selectorOrder = [...SELECTORS.keys()];
  const seen = new Set<string>();
  const rules: Array<{ s: number; p: number; text: string }> = [];
  for (const item of adjustments) {
    if (
      item === null ||
      typeof item !== 'object' ||
      typeof item.selector !== 'string' ||
      typeof item.property !== 'string' ||
      typeof item.value !== 'string'
    ) {
      throw new CssAdjustmentError('BAD_TYPE', 'each adjustment needs string selector, property and value');
    }
    const allowed = SELECTORS.get(item.selector);
    if (!allowed) throw new CssAdjustmentError('UNKNOWN_SELECTOR', 'selector is not in the closed table');
    const p = allowed.indexOf(item.property);
    if (p < 0) throw new CssAdjustmentError('PROPERTY_NOT_ALLOWED', 'property is not allowed for this selector');
    const value = renderValue(allowed[p]!, item.value);
    if (value === null) throw new CssAdjustmentError('VALUE_NOT_ALLOWED', 'value is outside the closed grammar');
    const pair = `${item.selector}\u0000${item.property}`;
    if (seen.has(pair)) throw new CssAdjustmentError('DUPLICATE_PAIR', 'duplicate (selector, property) pair');
    seen.add(pair);
    // Selector and property text come from the host tables (the validated input only chose the entry).
    const selectorText = selectorOrder[selectorOrder.indexOf(item.selector)]!;
    rules.push({ s: selectorOrder.indexOf(item.selector), p, text: `${selectorText}{${allowed[p]!}:${value}}` });
  }
  rules.sort((a, b) => a.s - b.s || a.p - b.p);
  return rules.map((r) => `${r.text}\n`).join('');
}
