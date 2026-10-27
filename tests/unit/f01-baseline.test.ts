import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyF01Baseline,
  extractOracleResults,
  F01_DESKTOP_TEST,
  F01_MOBILE_TEST,
  type OracleTestResult,
} from '../../packages/core/src/index.ts';

const MISMATCH = 'Error: cart-count ...\n\nexpect(locator).toHaveText(expected) failed\n\nExpected: "1"\nReceived: "0"\nTimeout:  2000ms';

const mobile = (over: Partial<OracleTestResult> = {}): OracleTestResult => ({
  title: F01_MOBILE_TEST,
  status: 'failed',
  durationMs: 2800,
  errorMessage: MISMATCH,
  attachments: [],
  observation: { viewport: { width: 390, height: 844 }, tapPoint: { x: 195, y: 494 }, hitTestTarget: 'promo-overlay', cartCountBefore: '0', cartCountAfter: '0' },
  ...over,
});
const desktop = (over: Partial<OracleTestResult> = {}): OracleTestResult => ({
  title: F01_DESKTOP_TEST,
  status: 'passed',
  durationMs: 500,
  errorMessage: null,
  attachments: [],
  observation: { viewport: { width: 1280, height: 800 }, tapPoint: { x: 722, y: 178 }, hitTestTarget: 'add-to-cart', cartCountBefore: '0', cartCountAfter: '1' },
  ...over,
});

test('intended baseline signature → REPRODUCED with desktop PASS', () => {
  const c = classifyF01Baseline([mobile(), desktop()]);
  assert.equal(c.verdict, 'REPRODUCED');
  assert.equal(c.regression, 'PASS');
  assert.equal(c.interceptedBy, 'promo-overlay');
});

test('mobile passing → NOT_REPRODUCED', () => {
  assert.equal(classifyF01Baseline([mobile({ status: 'passed', errorMessage: null }), desktop()]).verdict, 'NOT_REPRODUCED');
});

test('non-signature failures abstain as INCONCLUSIVE', () => {
  const cases: Array<[string, OracleTestResult[]]> = [
    ['test timeout', [mobile({ status: 'timedOut' }), desktop()]],
    ['interrupted', [mobile({ status: 'interrupted' }), desktop()]],
    ['startup/selector failure (no observation)', [mobile({ observation: null, errorMessage: 'locator not found' }), desktop()]],
    ['different assertion', [mobile({ errorMessage: 'expect(locator).toBeVisible() failed' }), desktop()]],
    ['tap not intercepted', [mobile({ observation: { ...mobile().observation!, hitTestTarget: 'add-to-cart' } }), desktop()]],
    ['wrong viewport', [mobile({ observation: { ...mobile().observation!, viewport: { width: 1280, height: 800 } } }), desktop()]],
    ['desktop also broken', [mobile(), desktop({ status: 'failed' })]],
    ['missing mobile', [desktop()]],
    ['duplicate mobile', [mobile(), mobile(), desktop()]],
    ['empty report', []],
  ];
  for (const [name, results] of cases) {
    assert.equal(classifyF01Baseline(results).verdict, 'INCONCLUSIVE', name);
  }
});

test('missing desktop result never yields REPRODUCED', () => {
  const c = classifyF01Baseline([mobile()]);
  assert.equal(c.regression, 'NOT_RUN');
  assert.notEqual(c.verdict, 'REPRODUCED');
});

test('extractOracleResults flattens nested Playwright JSON and strips ANSI', () => {
  const report = {
    suites: [{ suites: [{ specs: [{ title: F01_MOBILE_TEST, tests: [{ results: [{ status: 'failed', duration: 12, errors: [{ message: '\x1b[31mExpected\x1b[39m' }], attachments: [{ name: 'trace', path: '/x/trace.zip', contentType: 'application/zip' }] }] }] }] }] }],
  };
  const [r] = extractOracleResults(report);
  assert.equal(r!.title, F01_MOBILE_TEST);
  assert.equal(r!.errorMessage, 'Expected');
  assert.deepEqual(r!.attachments, [{ name: 'trace', path: '/x/trace.zip', contentType: 'application/zip' }]);
});
