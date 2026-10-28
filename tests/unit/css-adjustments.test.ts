import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CssAdjustmentError, MAX_ADJUSTMENTS, renderCssAdjustments, type CssAdjustment } from '../../packages/core/src/index.ts';

const adj = (selector: string, property: string, value: string): CssAdjustment => ({ selector, property, value });
const code = (input: unknown) => {
  try {
    renderCssAdjustments(input as CssAdjustment[]);
  } catch (e) {
    return e instanceof CssAdjustmentError ? e.code : `OTHER:${(e as Error).message}`;
  }
  return 'ACCEPTED';
};

test('PC-1 content renders exactly the host rule', () => {
  assert.equal(renderCssAdjustments([adj('.promo-overlay', 'pointer-events', 'none')]), '.promo-overlay{pointer-events:none}\n');
});

test('no-op (empty) renders nothing; an irrelevant allowed rule renders canonically', () => {
  assert.equal(renderCssAdjustments([]), '');
  assert.equal(renderCssAdjustments([adj('.promo', 'z-index', '5')]), '.promo{z-index:5}\n');
});

test('rules are sorted canonically by selector then property table order, regardless of input order', () => {
  const a = renderCssAdjustments([adj('.add-to-cart', 'z-index', '3'), adj('.promo-overlay', 'z-index', '2'), adj('.promo-overlay', 'pointer-events', 'none')]);
  const b = renderCssAdjustments([adj('.promo-overlay', 'pointer-events', 'none'), adj('.promo-overlay', 'z-index', '2'), adj('.add-to-cart', 'z-index', '3')]);
  assert.equal(a, b);
  assert.equal(a, '.promo-overlay{pointer-events:none}\n.promo-overlay{z-index:2}\n.add-to-cart{z-index:3}\n');
});

test('z-index and height use a strict grammar (host re-formats the number)', () => {
  for (const v of ['-1', '0', '1', '99', '100']) assert.equal(code([adj('.promo-overlay', 'z-index', v)]), 'ACCEPTED', v);
  for (const v of ['101', '-2', '01', '+5', '1e1', '5.0', '', ' 5', '5 ', '0x5', '-0', '٣']) assert.equal(code([adj('.promo-overlay', 'z-index', v)]), 'VALUE_NOT_ALLOWED', JSON.stringify(v));
  for (const v of ['0', '1vh', '50vh', '100vh', '1px', '600px']) assert.equal(code([adj('.promo-overlay', 'height', v)]), 'ACCEPTED', v);
  for (const v of ['0px', '101vh', '601px', '00', '50 vh', '50VH', '1.5vh', 'auto', '0vh']) assert.equal(code([adj('.promo-overlay', 'height', v)]), 'VALUE_NOT_ALLOWED', v);
  assert.equal(renderCssAdjustments([adj('.promo-overlay', 'height', '50vh')]), '.promo-overlay{height:50vh}\n');
});

test('selectors, properties and values are closed and case-sensitive', () => {
  assert.equal(code([adj('body', 'display', 'none')]), 'UNKNOWN_SELECTOR');
  assert.equal(code([adj('.promo-overlay > *', 'display', 'none')]), 'UNKNOWN_SELECTOR');
  assert.equal(code([adj('.Promo-Overlay', 'display', 'none')]), 'UNKNOWN_SELECTOR');
  assert.equal(code([adj('.add-to-cart', 'display', 'none')]), 'PROPERTY_NOT_ALLOWED');
  assert.equal(code([adj('.promo', 'height', '0')]), 'PROPERTY_NOT_ALLOWED');
  assert.equal(code([adj('.promo', 'color', 'red')]), 'PROPERTY_NOT_ALLOWED');
  for (const v of ['None', 'NONE', ' none', 'none ', 'none !important', 'url(x)', 'none;', '']) assert.equal(code([adj('.promo-overlay', 'pointer-events', v)]), 'VALUE_NOT_ALLOWED', JSON.stringify(v));
});

test('duplicate pairs and more than four adjustments are refused', () => {
  assert.equal(code([adj('.promo', 'z-index', '1'), adj('.promo', 'z-index', '1')]), 'DUPLICATE_PAIR');
  assert.equal(code([adj('.promo', 'z-index', '1'), adj('.promo', 'z-index', '2')]), 'DUPLICATE_PAIR');
  const five = ['display', 'visibility', 'z-index', 'pointer-events', 'position'].map((p, i) => adj('.promo-overlay', p, ['none', 'hidden', '1', 'none', 'static'][i]!));
  assert.equal(MAX_ADJUSTMENTS, 4);
  assert.equal(code(five), 'TOO_MANY_ADJUSTMENTS');
});

test('wrong types and prototype-shaped inputs never reach the renderer', () => {
  assert.equal(code('x'), 'BAD_TYPE');
  assert.equal(code([null]), 'BAD_TYPE');
  assert.equal(code([{ selector: '.promo', property: 'z-index', value: 5 }]), 'BAD_TYPE');
  assert.equal(code([{ selector: '.promo', property: 'z-index' }]), 'BAD_TYPE');
  assert.equal(code([adj('__proto__', 'z-index', '1')]), 'UNKNOWN_SELECTOR');
  assert.equal(code([adj('constructor', 'z-index', '1')]), 'UNKNOWN_SELECTOR');
  assert.equal(code([adj('.promo', 'constructor', '1')]), 'PROPERTY_NOT_ALLOWED');
  assert.equal(code([adj('.promo', 'z-index', 'constructor')]), 'VALUE_NOT_ALLOWED');
});

test('output alphabet is fixed: any accepted input renders only [a-z0-9.{}:\\n-] and never echoes input text', () => {
  const selectors = ['.promo-overlay', '.promo', '.add-to-cart'];
  const props = ['pointer-events', 'display', 'visibility', 'z-index', 'position', 'height'];
  const values = ['none', 'auto', 'block', 'visible', 'hidden', 'fixed', 'sticky', '-1', '0', '100', '0', '7vh', '600px'];
  let accepted = 0;
  for (const s of selectors) for (const p of props) for (const v of values) {
    try {
      const out = renderCssAdjustments([adj(s, p, v)]);
      accepted++;
      assert.match(out, /^[a-z0-9.{}:\n-]*$/);
    } catch (e) {
      assert.ok(e instanceof CssAdjustmentError);
    }
  }
  assert.ok(accepted > 20);
});
