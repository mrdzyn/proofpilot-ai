// Impact instrumentation. Records observed durations and results only: there
// are deliberately no fields for estimated savings or comparative claims.
import type { BaselineVerdict, RegressionResult } from './status.ts';

export type WorkflowScope = 'baseline-reproduction-only' | 'full-verification';

export type ImpactMetrics = {
  schemaVersion: 1;
  provenance: 'observed';
  runId: string;
  fixtureId: string;
  recordedAt: string;
  workflowScope: WorkflowScope;
  source: { gitHead: string; fixtureTree: string | null; worktreeDirty: boolean };
  environment: { os: string; arch: string; node: string; playwright: string };
  measurements: {
    /** Mobile oracle test duration: navigation → tap → failing assertion observed. */
    bugReproductionMs: number | null;
    /** Wall clock of the trusted oracle process (server start, both tests, teardown). */
    verificationExecutionMs: number | null;
    /** Wall clock of the whole workflow in `workflowScope`. */
    totalWorkflowMs: number | null;
  };
  results: { baselineFailure: BaselineVerdict; regression: RegressionResult };
  notes: string[];
};

export class MetricsValidationError extends Error {}

function checkDuration(name: string, value: number | null): void {
  if (value === null) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new MetricsValidationError(`${name} must be a finite non-negative number or null`);
  }
}

export function validateImpactMetrics(m: ImpactMetrics): ImpactMetrics {
  if (m.schemaVersion !== 1 || m.provenance !== 'observed') {
    throw new MetricsValidationError('metrics must be schemaVersion 1 with provenance "observed"');
  }
  for (const [name, value] of Object.entries(m.measurements)) checkDuration(name, value);
  const { bugReproductionMs: repro, verificationExecutionMs: verify, totalWorkflowMs: total } = m.measurements;
  if (total !== null && ((verify !== null && verify > total) || (repro !== null && repro > total))) {
    throw new MetricsValidationError('component durations cannot exceed totalWorkflowMs');
  }
  return m;
}

/** Monotonic stopwatch; `now` is injectable for tests. */
export function startClock(now: () => number = () => performance.now()) {
  const t0 = now();
  return { elapsedMs: () => Math.round(now() - t0) };
}
