// C3-A: every vector of the proposal validation pipeline (tasks/PP-META-I2-C3.md, V0 to V7) with its
// exact status. Pure functions only: no network, no filesystem, no staging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptedAdjustments, MAX_PROPOSAL_BYTES, parseProposal, proposalJsonSchema, renderCssAdjustments, type ProposalResult } from '../../packages/core/src/index.ts';

const adj = (selector: string, property: string, value: string) => ({ selector, property, value });
const wrap = (...items: unknown[]) => JSON.stringify({ adjustments: items });
const PV1 = wrap(adj('.promo-overlay', 'pointer-events', 'none'));

function expectRejected(raw: unknown, status: 'PATCH_REJECTED' | 'SECURITY_BLOCKED', reason: string, label = String(raw).slice(0, 50)): void {
  const r = parseProposal(raw);
  assert.equal(r.ok, false, `${label}: expected a rejection`);
  if (r.ok) return;
  assert.deepEqual([r.status, r.reason], [status, reason], label);
  assert.equal(r.provenance, 'model-hypothesis');
  assert.throws(() => acceptedAdjustments(r), /not accepted/, `${label}: a rejected proposal cannot be handed to the runner`);
  assert.ok(!JSON.stringify(r).includes('verifier'), `${label}: no raw model text in the result`);
}
const rej = (raw: unknown, reason: string) => expectRejected(raw, 'PATCH_REJECTED', reason);
const blocked = (raw: unknown, label?: string) => expectRejected(raw, 'SECURITY_BLOCKED', 'FORBIDDEN_CONTENT', label);

// ------------------------------------------------------------ positives

test('PV-1: the valid JSON (braces and quotes are framing) is accepted and renders exactly the host CSS', () => {
  const r = parseProposal(PV1);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.renderedCss, '.promo-overlay{pointer-events:none}\n');
  assert.equal(r.provenance, 'model-hypothesis');
  assert.deepEqual(acceptedAdjustments(r), [adj('.promo-overlay', 'pointer-events', 'none')]);
  assert.match(r.rawSha256, /^[0-9a-f]{64}$/);
});

test('PV-2: empty adjustments are accepted and render nothing (NC-1)', () => {
  const r = parseProposal('{"adjustments":[]}');
  assert.equal(r.ok && r.renderedCss, '');
});

test('PV-3: four distinct valid pairs, boundary integers, canonical host ordering', () => {
  const r = parseProposal(wrap(adj('.add-to-cart', 'z-index', '100'), adj('.promo-overlay', 'height', '100vh'), adj('.promo-overlay', 'z-index', '-1'), adj('.promo', 'z-index', '0')));
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.renderedCss, '.promo-overlay{z-index:-1}\n.promo-overlay{height:100vh}\n.promo{z-index:0}\n.add-to-cart{z-index:100}\n');
});

test('PV-4: JSON whitespace and newlines around and inside are accepted', () => {
  assert.equal(parseProposal(`\n  \t{ "adjustments" :\n [ { "selector" : ".promo" , "property":"z-index","value":"5" } ] }\r\n`).ok, true);
});

test('accepted output is identical for reordered keys inside an item', () => {
  const a = parseProposal('{"adjustments":[{"selector":".promo","property":"z-index","value":"5"}]}');
  const b = parseProposal('{"adjustments":[{"value":"5","property":"z-index","selector":".promo"}]}');
  assert.equal(a.ok && b.ok && a.renderedCss === b.renderedCss, true);
});

// ------------------------------------------------------------ V0, V1

test('SZ-1: oversize is rejected before parsing (a huge invalid body is not even tokenised)', () => {
  rej('x'.repeat(MAX_PROPOSAL_BYTES + 1), 'PROPOSAL_TOO_LARGE');
  const padded = `{"adjustments":[]${' '.repeat(MAX_PROPOSAL_BYTES)}}`;
  rej(padded, 'PROPOSAL_TOO_LARGE');
  assert.equal(parseProposal(`{"adjustments":[]${' '.repeat(MAX_PROPOSAL_BYTES - 18)}}`).ok, true, 'exactly the limit is allowed');
  // bytes, not characters
  rej(`{"adjustments":[],"k":"${'é'.repeat(MAX_PROPOSAL_BYTES / 2)}"}`, 'PROPOSAL_TOO_LARGE');
});

test('MJ-1..MJ-4 malformed JSON: truncated, two values, trailing text, fences, BOM, raw text', () => {
  for (const raw of ['{"adjustments":[', '{"adjustments":[]', '{"adjustments":[]}}', '{"adjustments":[]}{"adjustments":[]}', '{"adjustments":[]} trailing', '```json\n{"adjustments":[]}\n```', '\ufeff{"adjustments":[]}', 'url(http://x.invalid/a)', '', '   ', "{'adjustments':[]}", '{"adjustments":[],}', '{"adjustments":[1,]}', '{adjustments:[]}', '{"adjustments":[]}\u0000', 'undefined', 'NaN', '{"a":01}', '{"a":"\\x"}', '{"a":"\u0001"}', '{"a":"\\ud800"}x']) {
    rej(raw, 'MALFORMED_JSON');
  }
});

test('nesting deeper than the bound is malformed', () => {
  rej('{"adjustments":[' + '['.repeat(10) + ']'.repeat(10) + ']}', 'MALFORMED_JSON');
});

test('non-string input is rejected as BAD_TYPE', () => {
  for (const raw of [undefined, null, 5, {}, [], Buffer.from('{}')]) rej(raw, 'BAD_TYPE');
});

test('D-2: duplicate JSON keys at every depth are rejected (JSON.parse would keep the last)', () => {
  rej('{"adjustments":[],"adjustments":[]}', 'DUPLICATE_KEY');
  rej('{"adjustments":[{"selector":".promo","selector":".promo","property":"z-index","value":"1"}]}', 'DUPLICATE_KEY');
  rej('{"adjustments":[{"selector":".promo","property":"z-index","value":"1","value":"2"}]}', 'DUPLICATE_KEY');
  rej('{"a":{"b":1,"b":2},"adjustments":[]}', 'DUPLICATE_KEY');
  rej('{"adjustments":[],"adj\\u0075stments":[]}', 'DUPLICATE_KEY'); // same key after decoding
});

// ------------------------------------------------------------ V2 forbidden content

test('FC-1/FC-2 (NC-4): forbidden functions, schemes and at-rules in a value are SECURITY_BLOCKED', () => {
  for (const v of ['url(http://x.invalid/a)', 'URL(x)', 'UrL(x)', '@import', '@IMPORT', 'expression(1)', 'EXPRESSION(1)', 'javascript:alert(1)', 'JavaScript:x', 'data:text/html,x', 'http', 'https://x', 'none<script>', 'none>', 'none{', 'none}', 'none;', 'none/*x*/', 'a//b', 'x*/', "none'", 'none"', 'none`', 'none\\', '..', 'a/b', 'verifier', 'Fixtures', 'tests', 'node_modules', '.proofpilot', '.git', '.env']) {
    blocked(wrap(adj('.promo-overlay', 'pointer-events', v)), v);
  }
});

test('FC-3: escaped, fullwidth and whitespace-split tokens are SECURITY_BLOCKED', () => {
  blocked('{"adjustments":[{"selector":".promo","property":"z-index","value":"\\u0075rl(http://x)"}]}', 'escaped u');
  blocked(wrap(adj('.promo', 'z-index', 'ｕｒｌ(x)')), 'fullwidth');
  blocked(wrap(adj('.promo', 'z-index', 'u r l(x)')), 'space split');
  blocked(wrap(adj('.promo', 'z-index', 'ur\u00a0l(x)')), 'nbsp split');
  blocked(wrap(adj('.promo', 'z-index', 'ｊａｖａｓｃｒｉｐｔ:1')), 'fullwidth scheme');
});

test('FC-3b: default-ignorable and format characters inside a token are SECURITY_BLOCKED (U+200B and friends)', () => {
  for (const cp of ['\u200b', '\u200c', '\u200d', '\u2060', '\u00ad', '\ufeff', '\u180e', '\ufe0f', '\u{e0020}', '\u2062', '\u034f', '\u115f']) {
    blocked(wrap(adj('.promo', 'z-index', `u${cp}rl(x)`)), `U+${cp.codePointAt(0)!.toString(16)}`);
  }
  blocked('{"adjustments":[{"selector":".promo","property":"z-index","value":"u\\u200brl("}]}', 'escaped U+200B');
});

test('FC-3c: decoded control characters are SECURITY_BLOCKED before any stripping', () => {
  for (const c of ['\\u0000', '\\n', '\\t', '\\r', '\\u001f', '\\u007f', '\\u0085', '\\u009f']) {
    blocked(`{"adjustments":[{"selector":".promo","property":"z-index","value":"5${c}"}]}`, c);
  }
});

test('FC-4/FC-5: comment-split and punctuation payloads are SECURITY_BLOCKED', () => {
  blocked(wrap(adj('.promo', 'z-index', 'u/**/rl(x)')));
  blocked(wrap(adj('.promo-overlay', 'pointer-events', 'none; background:url(x)')));
  blocked(wrap(adj('.promo-overlay', 'pointer-events', 'none}')));
  blocked(wrap(adj('.promo-overlay', 'pointer-events', 'none"')));
});

test('FC-6: forbidden content in a selector, a property, an unknown key, a key name or an array element', () => {
  blocked(wrap(adj('.promo url(x)', 'z-index', '1')));
  blocked(wrap(adj('.promo', 'z-index;', '1')));
  blocked('{"adjustments":[],"x":["url(a)"]}');
  blocked('{"adjustments":[],"url(a)":1}');
  blocked('{"adjustments":[],"x":{"y":{"z":"<b>"}}}');
});

test('EK-3 (NC-2) and EK-4: path or markup content in extra keys is SECURITY_BLOCKED, not merely an unknown key', () => {
  blocked('{"adjustments":[],"path":"verifier/f01/f01.oracle.spec.ts"}');
  blocked('{"adjustments":[],"file":"tests/x.ts"}');
  blocked('{"adjustments":[],"path":"../x"}');
  blocked('{"adjustments":[],"html":"<script>alert(1)</script>"}');
  blocked('{"adjustments":[{"selector":".promo","property":"z-index","value":"1","path":"verifier/x"}]}');
});

// ------------------------------------------------------------ V3, V4

test('EK-1/EK-2: harmless unknown keys at any level are PATCH_REJECTED UNKNOWN_KEY', () => {
  rej('{"adjustments":[],"note":"hi"}', 'UNKNOWN_KEY');
  rej('{"note":"hi","adjustments":[]}', 'UNKNOWN_KEY');
  rej('{"adjustments":[{"selector":".promo","property":"z-index","value":"1","comment":"x"}]}', 'UNKNOWN_KEY');
  rej('{"adjustments":[],"confidence":"high"}', 'UNKNOWN_KEY');
  rej('{"adjustments":[],"verdict":"VERIFIED"}', 'UNKNOWN_KEY');
});

test('PD-1: prototype-dangerous keys are rejected and nothing is polluted', () => {
  for (const k of ['__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty']) {
    rej(`{"adjustments":[],"${k}":{"polluted":true}}`, 'UNKNOWN_KEY');
    rej(`{"adjustments":[{"selector":".promo","property":"z-index","value":"1","${k}":"x"}]}`, 'UNKNOWN_KEY');
    rej(`{"${k}":1}`, 'UNKNOWN_KEY');
  }
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted'), false);
});

test('ROOT-1/T-2: wrong root and wrong adjustments container', () => {
  for (const raw of ['[]', '[{"selector":".promo","property":"z-index","value":"1"}]', '"x"', '5', 'true', 'null', '{}']) rej(raw, 'BAD_SHAPE');
  for (const a of ['{}', '"x"', 'null', '5', 'true', '{"selector":".promo"}']) rej(`{"adjustments":${a}}`, 'BAD_SHAPE');
});

test('items must be objects with exactly selector, property and value', () => {
  for (const item of ['"x"', '5', 'null', '[]', '[1,2,3]']) rej(`{"adjustments":[${item}]}`, 'BAD_SHAPE');
  rej('{"adjustments":[{"selector":".promo","property":"z-index"}]}', 'BAD_SHAPE');
  rej('{"adjustments":[{}]}', 'BAD_SHAPE');
});

test('T-1: non-string fields are BAD_TYPE', () => {
  for (const v of ['5', 'true', 'null', '[]', '{}', '["5"]']) rej(`{"adjustments":[{"selector":".promo","property":"z-index","value":${v}}]}`, 'BAD_TYPE');
  for (const v of ['5', 'null', '[]']) rej(`{"adjustments":[{"selector":${v},"property":"z-index","value":"1"}]}`, 'BAD_TYPE');
  rej('{"adjustments":[{"selector":".promo","property":5,"value":"1"}]}', 'BAD_TYPE');
});

test('N-1: more than four adjustments', () => {
  const five = ['display', 'visibility', 'z-index', 'pointer-events', 'position'].map((p, i) => adj('.promo-overlay', p, ['none', 'hidden', '1', 'none', 'static'][i]!));
  rej(wrap(...five), 'TOO_MANY_ADJUSTMENTS');
  rej(wrap(...Array.from({ length: 5 }, () => adj('.promo', 'z-index', '1'))), 'TOO_MANY_ADJUSTMENTS');
});

// ------------------------------------------------------------ V5, V6

test('G-1/G-2: unknown selectors and disallowed pairs', () => {
  for (const s of ['body', '.promo-overlay .child', '#x', '.Promo-Overlay', '.promo-overlay ', '', '*', 'html', '.promo,.add-to-cart']) rej(wrap(adj(s, 'z-index', '1')), 'UNKNOWN_SELECTOR');
  // a child combinator contains '>' (markup class), so by precedence it is SECURITY_BLOCKED, not merely an unknown selector
  blocked(wrap(adj('.promo-overlay > *', 'z-index', '1')));
  rej(wrap(adj('.add-to-cart', 'display', 'none')), 'PROPERTY_NOT_ALLOWED');
  rej(wrap(adj('.promo', 'height', '0')), 'PROPERTY_NOT_ALLOWED');
  rej(wrap(adj('.promo', 'color', 'red')), 'PROPERTY_NOT_ALLOWED');
  rej(wrap(adj('.promo', 'POINTER-EVENTS', 'none')), 'PROPERTY_NOT_ALLOWED');
});

test('G-3/G-4: numeric and enumerated value grammar', () => {
  for (const v of ['101', '-2', '01', '+5', '1e1', '5.0', '', ' 5', '5 ', '0x5', '-0', '٣', '1_0']) rej(wrap(adj('.promo', 'z-index', v)), 'VALUE_NOT_ALLOWED');
  for (const v of ['0px', '101vh', '601px', '00', '50 vh', '50VH', '1.5vh', 'auto', '0vh', '-1px']) rej(wrap(adj('.promo-overlay', 'height', v)), 'VALUE_NOT_ALLOWED');
  for (const v of ['None', 'NONE', ' none', 'none ', 'none !important', '!important', 'inherit', 'initial', 'unset', 'revert', 'var(--x)', 'calc(1)']) rej(wrap(adj('.promo-overlay', 'pointer-events', v)), 'VALUE_NOT_ALLOWED');
});

test('D-1: duplicate (selector, property) pairs, with identical or different values', () => {
  rej(wrap(adj('.promo', 'z-index', '1'), adj('.promo', 'z-index', '1')), 'DUPLICATE_PAIR');
  rej(wrap(adj('.promo', 'z-index', '1'), adj('.promo', 'z-index', '2')), 'DUPLICATE_PAIR');
  assert.equal(parseProposal(wrap(adj('.promo', 'z-index', '1'), adj('.promo-overlay', 'z-index', '1'))).ok, true, 'same property on another selector is fine');
});

// ------------------------------------------------------------ precedence and R-1

test('precedence: size and syntax first, then forbidden content, then grammar', () => {
  rej('url(x', 'MALFORMED_JSON'); // not JSON: nothing parsed, so no content class applies
  rej('{"adjustments":[],"adjustments":[],"p":"url(x)"}', 'DUPLICATE_KEY'); // syntax-level error beats content
  blocked('{"adjustments":[],"note":"url(x)"}'); // content beats unknown key
  blocked(wrap(adj('body', 'z-index', 'url(x)'))); // content beats unknown selector
  rej(wrap(adj('body', 'z-index', '1'), adj('.promo', 'z-index', '1'), adj('.promo', 'z-index', '2'), adj('.promo-overlay', 'z-index', '1'), adj('.promo-overlay', 'display', 'none')), 'TOO_MANY_ADJUSTMENTS');
});

test('R-1: accepted proposals only ever render characters from the fixed alphabet', () => {
  const selectors = ['.promo-overlay', '.promo', '.add-to-cart'];
  const props = ['pointer-events', 'display', 'visibility', 'z-index', 'position', 'height'];
  const values = ['none', 'auto', 'block', 'visible', 'hidden', 'fixed', 'sticky', '-1', '0', '100', '7vh', '600px', 'bad', '101', '07'];
  let accepted = 0;
  for (const s of selectors) for (const p of props) for (const v of values) {
    const r = parseProposal(wrap(adj(s, p, v)));
    if (r.ok) {
      accepted++;
      assert.match(r.renderedCss, /^[a-z0-9.{}:\n-]*$/);
      assert.equal(r.renderedCss, renderCssAdjustments(r.adjustments));
    }
  }
  assert.ok(accepted > 20);
});

test('the structured-output schema is derived from the renderer tables (no second allowlist)', () => {
  const schema = proposalJsonSchema() as any;
  assert.deepEqual(schema.properties.adjustments.items.properties.selector.enum, ['.promo-overlay', '.promo', '.add-to-cart']);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.adjustments.maxItems, 4);
  assert.ok(schema.properties.adjustments.items.properties.property.enum.includes('pointer-events'));
});

test('parseProposal is pure: repeated calls return equal results and never mutate shared state', () => {
  const a = parseProposal(PV1);
  const b = parseProposal(PV1);
  assert.deepEqual(a, b);
  const cloneSource = acceptedAdjustments(a);
  cloneSource[0]!.value = 'auto';
  assert.equal(acceptedAdjustments(a)[0]!.value, 'none');
});
