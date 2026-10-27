import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MetricsValidationError, startClock, validateImpactMetrics, type ImpactMetrics } from '../../packages/core/src/index.ts';

const base = (): ImpactMetrics => ({
  schemaVersion: 1,
  provenance: 'observed',
  runId: 'r',
  fixtureId: 'F01',
  recordedAt: '2026-10-27T00:00:00.000Z',
  workflowScope: 'baseline-reproduction-only',
  source: { gitHead: 'abc', fixtureTree: 'def', worktreeDirty: false, certified: true },
  environment: { os: 'Darwin', arch: 'arm64', node: 'v24', playwright: '1.64.1' },
  measurements: { bugReproductionMs: 100, verificationExecutionMs: 200, totalWorkflowMs: 300 },
  results: { baselineFailure: 'REPRODUCED', regression: 'PASS' },
  notes: [],
});

test('valid observed metrics pass; null means not measured', () => {
  validateImpactMetrics(base());
  validateImpactMetrics({ ...base(), measurements: { bugReproductionMs: null, verificationExecutionMs: null, totalWorkflowMs: null } });
});

test('rejects negative, NaN, infinite or inconsistent durations', () => {
  for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => validateImpactMetrics({ ...base(), measurements: { ...base().measurements, bugReproductionMs: bad } }), MetricsValidationError);
  }
  assert.throws(() => validateImpactMetrics({ ...base(), measurements: { bugReproductionMs: 10, verificationExecutionMs: 400, totalWorkflowMs: 300 } }), MetricsValidationError);
});

test('rejects non-observed provenance', () => {
  assert.throws(() => validateImpactMetrics({ ...base(), provenance: 'estimated' as 'observed' }), MetricsValidationError);
});

test('startClock measures with an injected monotonic source', () => {
  let t = 1000;
  const clock = startClock(() => t);
  t = 1250.4;
  assert.equal(clock.elapsedMs(), 250);
});
