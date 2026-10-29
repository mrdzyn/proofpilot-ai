// Test-only builder for the persisted evidence the owner CLI re-verifies (certified F01 baseline run, certified recording, live C2B
// analysis). Everything is synthetic bytes in a temp directory; nothing here is real evidence and nothing here talks to a provider.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { validSymptom } from '../helpers.ts';

export const MOBILE_OBS = { viewport: { width: 390, height: 844 }, tapPoint: { x: 195, y: 494 }, hitTestTarget: 'promo-overlay', cartCountBefore: '0', cartCountAfter: '0' };
export const DESKTOP_OBS = { viewport: { width: 1280, height: 800 }, tapPoint: { x: 722, y: 178 }, hitTestTarget: 'add-to-cart', cartCountBefore: '0', cartCountAfter: '1' };
const MISMATCH = 'Error: cart-count\n\nexpect(locator).toHaveText(expected) failed\n\nExpected: "1"\nReceived: "0"\nTimeout:  2000ms';
export const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

export type Evidence = {
  head: string; fixtureTree: string; analysisId: string;
  baselineName: string; baselineDir: string; recordingSet: string; recordingDir: string; analysisFile: string; mp4: string; mp4Bytes: Buffer; videoSha: string;
};

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true }).filter((e) => e.isFile()).map((e) => path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join('/'));
}

/** (Re)write baseline-summary.json so its artifact list matches the files currently in the run directory (a "consistent" tamper). */
export function rehashBaseline(e: Evidence, over: Record<string, unknown> = {}): void {
  const file = path.join(e.baselineDir, 'baseline-summary.json');
  const base = JSON.parse(readFileSync(file, 'utf8'));
  const artifacts = listFiles(e.baselineDir).filter((f) => f !== 'baseline-summary.json' && f !== 'metrics.json').sort().map((rel) => {
    const bytes = readFileSync(path.join(e.baselineDir, rel));
    return { relativePath: rel, sha256: sha(bytes), bytes: bytes.length };
  });
  writeFileSync(file, JSON.stringify({ ...base, artifacts, ...over }, null, 2) + '\n');
}

export function writeEvidence(root: string, o: { head: string; fixtureTree: string; analysisId?: string; symptom?: Record<string, unknown>; durationSec?: number }): Evidence {
  const analysisId = o.analysisId ?? 'c2b-live-smoke-002';
  const baselineName = 'f01-baseline-20261029T130000Z-abc123';
  const baselineDir = path.join(root, '.proofpilot/runs', baselineName);
  const obsDir = path.join(baselineDir, 'test-results/attachments');
  mkdirSync(obsDir, { recursive: true });
  const mobileObs = path.join(obsDir, 'f01-observation-mobile.json');
  const desktopObs = path.join(obsDir, 'f01-observation-desktop.json');
  writeFileSync(mobileObs, JSON.stringify(MOBILE_OBS));
  writeFileSync(desktopObs, JSON.stringify(DESKTOP_OBS));
  const att = (p: string) => [{ name: 'f01-observation', path: p, contentType: 'application/json' }];
  const report = {
    suites: [{ title: 'f01.oracle.spec.ts', specs: [
      { title: 'F01-MOBILE: real pointer tap adds product to cart', tests: [{ results: [{ status: 'failed', duration: 2800, errors: [{ message: MISMATCH }], attachments: att(mobileObs) }] }] },
      { title: 'F01-DESKTOP: real pointer click adds product to cart (regression control)', tests: [{ results: [{ status: 'passed', duration: 500, errors: [], attachments: att(desktopObs) }] }] },
    ] }],
  };
  writeFileSync(path.join(baselineDir, 'oracle-report.json'), JSON.stringify(report));
  const e: Evidence = {
    head: o.head, fixtureTree: o.fixtureTree, analysisId, baselineName, baselineDir, recordingSet: 'f01-20261027T122211Z-df375a', recordingDir: '', analysisFile: '', mp4: '', mp4Bytes: Buffer.alloc(0), videoSha: '',
  };
  writeFileSync(path.join(baselineDir, 'baseline-summary.json'), '{}');
  rehashBaseline(e, {
    runId: baselineName, oracleExitCode: 1, gitHead: o.head, fixtureTree: o.fixtureTree, worktreeDirty: false, worktree: { kind: 'clean' }, certified: true, certificationReasons: [],
    classification: { verdict: 'REPRODUCED', regression: 'PASS', interceptedBy: 'promo-overlay', reasons: ['fixture'] },
  });

  e.recordingDir = path.join(root, '.proofpilot/recordings', e.recordingSet, 'mobile-defect');
  mkdirSync(e.recordingDir, { recursive: true });
  e.mp4 = path.join(e.recordingDir, 'f01-mobile-defect.mp4');
  e.mp4Bytes = Buffer.from('synthetic mp4 bytes for a test; not a real video');
  writeFileSync(e.mp4, e.mp4Bytes);
  e.videoSha = sha(e.mp4Bytes);
  writeFileSync(path.join(e.recordingDir, 'recording.json'), JSON.stringify({
    schemaVersion: 1, kind: 'mobile-defect', synthetic: true, outcomeAsExpected: true,
    video: { path: `.proofpilot/recordings/${e.recordingSet}/mobile-defect/f01-mobile-defect.mp4`, bytes: e.mp4Bytes.length, sha256: e.videoSha },
    source: { gitHead: 'a'.repeat(40), fixtureTree: o.fixtureTree, certifiedExactSha: true, reasons: [] },
  }));

  const dir = path.join(root, '.proofpilot/analysis', analysisId);
  mkdirSync(dir, { recursive: true });
  e.analysisFile = path.join(dir, 'analysis.json');
  writeFileSync(e.analysisFile, JSON.stringify({
    schemaVersion: 1, evidenceKind: 'live', createdAt: '2026-10-27T15:43:43.406Z',
    result: {
      status: 'VIDEO_ANALYZED',
      symptom: { schemaVersion: 1, provenance: 'model-hypothesis', ...validSymptom(o.symptom ?? {}) },
      assessment: { trust: 'hypothesis', canAttemptReproduction: true, reasons: [] },
      provenance: {
        runId: analysisId, providerId: 'meta', requestedModel: 'muse-spark-1.3', respondedModel: 'muse-spark-1.3', video: { sha256: e.videoSha, bytes: e.mp4Bytes.length, durationSec: o.durationSec ?? 10.04 },
        responseLifecycle: { status: 'completed', errorCode: null, incompleteReason: null, refusal: false, completed: true },
      },
    },
  }, null, 2));
  return e;
}

export const edit = (file: string, fn: (doc: any) => void): void => {
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  fn(doc);
  writeFileSync(file, JSON.stringify(doc, null, 2));
};
