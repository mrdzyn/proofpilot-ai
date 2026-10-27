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

import { certifyF01Baseline, parsePorcelainPaths, type WorktreeState } from '../../packages/core/src/index.ts';

const reproduced = () => classifyF01Baseline([mobile(), desktop()]);

test('clean worktree + reproduced baseline is certified, exit 0', () => {
  const c = certifyF01Baseline({ classification: reproduced(), oracleExitCode: 1, worktree: { kind: 'clean' } });
  assert.deepEqual(c, { certified: true, exitCode: 0, reasons: [] });
});

test('dirty yet otherwise reproducing fixture is NOT certified and exits non-zero', () => {
  const classification = reproduced();
  assert.equal(classification.verdict, 'REPRODUCED'); // otherwise-successful run
  const c = certifyF01Baseline({
    classification,
    oracleExitCode: 1,
    worktree: { kind: 'dirty', paths: ['fixtures/sample-store/src/styles.css'] },
  });
  assert.equal(c.certified, false);
  assert.equal(c.exitCode, 2);
  assert.match(c.reasons.join(' '), /styles\.css/);
});

test('unverifiable worktree state fails closed', () => {
  const c = certifyF01Baseline({ classification: reproduced(), oracleExitCode: 1, worktree: { kind: 'unknown', reason: 'git missing' } });
  assert.equal(c.certified, false);
  assert.equal(c.exitCode, 2);
});

test('non-reproduced baselines exit 1 regardless of worktree state', () => {
  const notReproduced = classifyF01Baseline([mobile({ status: 'passed', errorMessage: null }), desktop()]);
  const worktrees: WorktreeState[] = [{ kind: 'clean' }, { kind: 'dirty', paths: ['x'] }];
  for (const worktree of worktrees) {
    const c = certifyF01Baseline({ classification: notReproduced, oracleExitCode: 0, worktree });
    assert.deepEqual([c.certified, c.exitCode], [false, 1]);
  }
  // A reproduced classification still requires the oracle to have actually exited non-zero.
  assert.equal(certifyF01Baseline({ classification: reproduced(), oracleExitCode: 0, worktree: { kind: 'clean' } }).exitCode, 1);
});

test('parsePorcelainPaths keeps the first line intact and handles untracked and renamed paths', () => {
  const porcelain = ' M fixtures/sample-store/src/styles.css\n?? verifier/extra.ts\nR  old.ts -> packages/core/src/new.ts\n';
  assert.deepEqual(parsePorcelainPaths(porcelain), [
    'fixtures/sample-store/src/styles.css',
    'verifier/extra.ts',
    'packages/core/src/new.ts',
  ]);
  assert.deepEqual(parsePorcelainPaths(''), []);
});
