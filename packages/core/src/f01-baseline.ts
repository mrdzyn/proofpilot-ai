// Deterministic classifier for the F01 baseline oracle run. Input is the
// Playwright JSON report plus the oracle's own observation attachments; model
// text, DOM text and screenshots are never inputs.
import type { BaselineVerdict, RegressionResult } from './status.ts';

export const F01_MOBILE_TEST = 'F01-MOBILE: real pointer tap adds product to cart';
export const F01_DESKTOP_TEST =
  'F01-DESKTOP: real pointer click adds product to cart (regression control)';
export const F01_OBSERVATION_ATTACHMENT = 'f01-observation';
export const F01_TARGET_TESTID = 'add-to-cart';

export type F01Observation = {
  viewport: { width: number; height: number };
  tapPoint: { x: number; y: number };
  hitTestTarget: string | null;
  cartCountBefore: string | null;
  cartCountAfter: string | null;
};

export type OracleTestResult = {
  title: string;
  status: string;
  durationMs: number;
  errorMessage: string | null;
  attachments: Array<{ name: string; path: string | null; contentType: string }>;
  observation?: F01Observation | null;
};

export type F01BaselineClassification = {
  verdict: BaselineVerdict;
  regression: RegressionResult;
  interceptedBy: string | null;
  reasons: string[];
};

const ANSI = /\x1b\[[0-9;]*m/g;

/** Flatten a Playwright JSON report into one entry per test result. */
export function extractOracleResults(report: unknown): OracleTestResult[] {
  const out: OracleTestResult[] = [];
  const visit = (suite: any): void => {
    for (const child of suite?.suites ?? []) visit(child);
    for (const spec of suite?.specs ?? []) {
      for (const t of spec.tests ?? []) {
        for (const r of t.results ?? []) {
          const message = r.errors?.[0]?.message ?? r.error?.message ?? null;
          out.push({
            title: String(spec.title),
            status: String(r.status),
            durationMs: Number(r.duration),
            errorMessage: typeof message === 'string' ? message.replace(ANSI, '') : null,
            attachments: (r.attachments ?? []).map((a: any) => ({
              name: String(a.name),
              path: typeof a.path === 'string' ? a.path : null,
              contentType: String(a.contentType),
            })),
          });
        }
      }
    }
  };
  for (const suite of (report as any)?.suites ?? []) visit(suite);
  return out;
}

function isCartCountMismatch(message: string | null): boolean {
  if (!message) return false;
  return (
    message.includes('toHaveText') &&
    message.includes('Expected: "1"') &&
    message.includes('Received: "0"')
  );
}

/**
 * REPRODUCED only when the mobile oracle failed on the intended cart-count
 * mismatch with the tap intercepted by another element, and the desktop
 * control passed. Any other shape abstains.
 */
export function classifyF01Baseline(results: OracleTestResult[]): F01BaselineClassification {
  const reasons: string[] = [];
  const mobile = results.filter((r) => r.title === F01_MOBILE_TEST);
  const desktop = results.filter((r) => r.title === F01_DESKTOP_TEST);

  let regression: RegressionResult = 'NOT_RUN';
  if (desktop.length === 1) {
    const d = desktop[0]!;
    const ok =
      d.status === 'passed' &&
      d.observation?.cartCountAfter === '1' &&
      d.observation?.hitTestTarget === F01_TARGET_TESTID;
    regression = ok ? 'PASS' : 'FAIL';
    if (!ok) reasons.push(`desktop control did not pass cleanly (status=${d.status})`);
  } else {
    reasons.push(`expected exactly one desktop control result, found ${desktop.length}`);
  }

  if (mobile.length !== 1) {
    reasons.push(`expected exactly one mobile oracle result, found ${mobile.length}`);
    return { verdict: 'INCONCLUSIVE', regression, interceptedBy: null, reasons };
  }
  const m = mobile[0]!;
  const obs = m.observation ?? null;

  if (m.status === 'passed') {
    reasons.push('mobile oracle passed: defect not observed on baseline');
    return { verdict: 'NOT_REPRODUCED', regression, interceptedBy: null, reasons };
  }
  if (m.status !== 'failed') {
    reasons.push(`mobile oracle ended with status=${m.status}, not an assertion failure`);
    return { verdict: 'INCONCLUSIVE', regression, interceptedBy: null, reasons };
  }
  if (!obs) {
    reasons.push('mobile oracle failed before recording its observation (startup/selector failure)');
    return { verdict: 'INCONCLUSIVE', regression, interceptedBy: null, reasons };
  }
  if (!isCartCountMismatch(m.errorMessage)) {
    reasons.push('mobile failure is not the pre-registered cart-count mismatch (expected "1", received "0")');
    return { verdict: 'INCONCLUSIVE', regression, interceptedBy: null, reasons };
  }
  if (obs.cartCountBefore !== '0' || obs.cartCountAfter !== '0') {
    reasons.push('observation does not show cart-count unchanged at 0');
    return { verdict: 'INCONCLUSIVE', regression, interceptedBy: null, reasons };
  }
  if (obs.viewport.width !== 390 || obs.viewport.height !== 844) {
    reasons.push(`mobile oracle ran at ${obs.viewport.width}x${obs.viewport.height}, not 390x844`);
    return { verdict: 'INCONCLUSIVE', regression, interceptedBy: null, reasons };
  }
  if (!obs.hitTestTarget || obs.hitTestTarget === F01_TARGET_TESTID) {
    reasons.push('tap point was not intercepted; failure cause differs from F01');
    return { verdict: 'INCONCLUSIVE', regression, interceptedBy: null, reasons };
  }
  if (regression !== 'PASS') {
    reasons.push('mobile signature matched but desktop control failed; defect is not viewport-specific');
    return { verdict: 'INCONCLUSIVE', regression, interceptedBy: obs.hitTestTarget, reasons };
  }

  reasons.push(
    `mobile tap intercepted by [data-testid=${obs.hitTestTarget}]; cart-count stayed 0 (expected 1); desktop control passed`,
  );
  return { verdict: 'REPRODUCED', regression, interceptedBy: obs.hitTestTarget, reasons };
}

/** Paths whose uncommitted state means a result cannot be tied to a Git SHA. */
export const F01_EVIDENCE_PATHS = [
  'fixtures/sample-store',
  'verifier',
  'packages/core',
  'scripts/f01-baseline.ts',
] as const;

export type WorktreeState =
  | { kind: 'clean' }
  | { kind: 'dirty'; paths: string[] }
  /** git status could not be evaluated; treated as not certifiable. */
  | { kind: 'unknown'; reason: string };

export type BaselineCertification = {
  /** True only for a reproduced baseline whose tested bytes are exactly the committed HEAD. */
  certified: boolean;
  /** 0 certified success; 1 baseline not reproduced/inconclusive; 2 reproduced but not certifiable. */
  exitCode: 0 | 1 | 2;
  reasons: string[];
};

/** Parse `git status --porcelain` output into the changed paths. */
export function parsePorcelainPaths(porcelain: string): string[] {
  return porcelain
    .split('\n')
    .filter((line) => line.length > 3)
    .map((line) => line.slice(3).replace(/^.* -> /, ''));
}

/**
 * Deterministic exit/certification decision for a baseline run. A successful
 * classification is only certified exact-SHA evidence when the oracle failed as
 * expected AND the evidence-relevant worktree is verifiably clean.
 */
export function certifyF01Baseline(input: {
  classification: F01BaselineClassification;
  oracleExitCode: number;
  worktree: WorktreeState;
}): BaselineCertification {
  const { classification, oracleExitCode, worktree } = input;
  const reproduced =
    classification.verdict === 'REPRODUCED' && classification.regression === 'PASS' && oracleExitCode !== 0;
  if (!reproduced) {
    return { certified: false, exitCode: 1, reasons: ['baseline was not reproduced as expected'] };
  }
  if (worktree.kind === 'dirty') {
    return {
      certified: false,
      exitCode: 2,
      reasons: [
        `reproduced, but uncommitted changes in evidence-relevant paths mean HEAD does not identify the tested bytes: ${worktree.paths.join(', ')}`,
      ],
    };
  }
  if (worktree.kind === 'unknown') {
    return {
      certified: false,
      exitCode: 2,
      reasons: [`reproduced, but worktree state could not be verified: ${worktree.reason}`],
    };
  }
  return { certified: true, exitCode: 0, reasons: [] };
}
