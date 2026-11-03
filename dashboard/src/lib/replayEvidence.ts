// UI-C3-L-DEMO-01: sanitized Evidence Replay manifest (data only: no DOM, no
// network, no repository imports). Every value traces to its cited source:
//   E-REP  offline C3 run c3-b1-20261103T115426Z-b46ad0 (scoreboard
//          re-verified OK, 0 model/provider calls)
//   E-BASE certified recording set f01-20261027T122211Z-df375a (STATUS-pinned hashes)
//   E-EXEC docs/LIVE-C3-01-EXECUTION-REPORT.md (reviewed, merged)
//   E-D9   docs/UI-C3-02-D9-RUNBOOK.md §§7–9 + docs/STATUS.md (reviewed, merged)
// PNG stills below are copied files under dashboard/src/assets/replay/,
// verified SHA-256-identical to their sources before bundling. The F01 defect
// MP4 is NEVER committed (repo boundary test forbids tracked .mp4/.webm,
// like the gitignored run-evidence root): when present at
// dashboard/public/replay/ (local
// export only, hash-checked against defectVideo.sha256 before copying), Vite
// serves it at <base>/replay/f01-mobile-defect.mp4 and the stage-1 player
// uses it; on checkouts without that untracked file the player renders the
// documented unavailable state instead of substituting footage. No secrets,
// no absolute paths, no raw artifacts, no signing keys anywhere in this
// module.
import baselineCart0 from '../assets/replay/baseline-mobile-cart0.png';
import fixedMobileCart1 from '../assets/replay/pc1-mobile-cart1.png';
import fixedDesktopCart1 from '../assets/replay/pc1-desktop-cart1.png';

export const REPLAY_RUN_ID = 'c3-b1-20261103T115426Z-b46ad0';
export const REPLAY_EVIDENCE_RUN = 'offline C3 run c3-b1-20261103T115426Z-b46ad0';

interface ReplayMedium {
  src: string;
  sha256: string;
  label: string;
}

export const REPLAY_MEDIA: Record<
  'defectVideo' | 'baselineCart0' | 'fixedMobileCart1' | 'fixedDesktopCart1',
  ReplayMedium
> = {
  defectVideo: {
    // Served from dashboard/public/replay/ when exported locally; absent on
    // clean checkouts (player shows the unavailable state, never a substitute).
    src: `${import.meta.env.BASE_URL}replay/f01-mobile-defect.mp4`,
    sha256:
      'e9df68b14c48300818f9ec9407b884413037f29305f17a5da3cc4fac05eeafdf',
    label: 'F01 mobile defect clip (390×844, ~10 s, certified recording)',
  },
  baselineCart0: {
    src: baselineCart0,
    sha256:
      'f806e08b4feedfb785633d0c76907768f3ca2b8edf219d9ae3b41f3bd1b191f9',
    label: 'Baseline mobile after-tap (Cart 0; byte-identical before/after)',
  },
  fixedMobileCart1: {
    src: fixedMobileCart1,
    sha256:
      'c9be912723222a57443333b0f7e049f4f5013cb40bb2831724342fd1a8c176ae',
    label: 'PC-1 replay mobile after-tap (Cart 1; identical all 3 replays)',
  },
  fixedDesktopCart1: {
    src: fixedDesktopCart1,
    sha256:
      '0e5c955572c90e0f2942fe28432bdfb762d4d95c10f65f43d7fdd2ac8769e576',
    label: 'PC-1 replay desktop after-tap (Cart 1, control passes)',
  },
};

export const REPLAY_VERDICTS = {
  baseline: {
    outcome: 'PATCH_FAILED',
    oracleExit: 1,
    css: '(no adjustments — unmodified fixture)',
    mobile: 'failed · hit-test promo-overlay · Cart 0',
    desktop: 'passed · hit-test add-to-cart · Cart 1',
    oracleReportSha256:
      '54b1c35e6cb6198dd968e7f3fb7816c22a8f18ceaa2f45854b095b04d6e4fb7b',
  },
  pc1: {
    outcome: 'VERIFIED 3/3',
    css: '.promo-overlay{pointer-events:none}',
    replays: 'ORACLE_PASS ×3 (oracle exit 0, evidence finalized)',
    mobile: 'passed · hit-test add-to-cart · Cart 1',
    desktop: 'passed · Cart 1 (regression control)',
    scoreboardSha256:
      'ee67b6f6e670aeb6468d0954ca154e6eaa6936b4195ef14c7712b22e7addc056',
    pc1Replay1OracleSha256:
      'e3324958264cf4b74f519a7b9c2d58da280997eb9d6a52238c1a4ac2b3bee22c',
    scoreboardReverified: 'OK (re-derived from persisted evidence)',
    providerCalls: 0,
  },
} as const;

export const REPLAY_PROPOSAL = {
  runId: 'c3-live-meta-001',
  requestedModel: 'muse-spark-1.3',
  requestedAt: '2026-10-29T17:03:11Z',
  responseId: '7cb1e5e2-3d88-42ab-9652-fcab88b690d8',
  inputChars: '2,756',
  inputSha256:
    '4e1466e8adf1ee58b6c050e70f9720da43ddb254b255d4f754f8696a857af558',
  adjustment: '.promo-overlay / pointer-events / none',
  renderedCss: '.promo-overlay{pointer-events:none}',
  status: 'PROPOSAL_ACCEPTED — lifecycle completed — UNTRUSTED, NOT VERIFIED',
  note: 'Third and final Meta attempt (Oct 29, 2026). Never staged, never executed, never verified. Equal in value to hand-authored PC-1 — that equality transfers no verification.',
} as const;

export const REPLAY_BASETEN = {
  model: 'meta-models/muse-spark-open-1026',
  attempts: [
    {
      id: 'D9-LIVE-01',
      result: 'REFUSED (TRANSPORT_HTTP 403)',
      detail: 'Account rejected the request; no model output produced.',
    },
    {
      id: 'D9-LIVE-02',
      result: 'REFUSED (TRANSPORT_SHAPE)',
      detail: 'HTTP 2xx JSON failed strict validation; no output accepted.',
    },
    {
      id: 'D9-LIVE-V2-QA-01',
      result: 'REFUSED (TRANSPORT_TRUNCATED)',
      detail: 'Generation hit a length limit under the 1024 analyze cap.',
    },
  ],
  accepted: '0 accepted model analyses. Billing unverified.',
  note: 'Owner-supervised attempts, durably recorded SPENT. No retry authorized. No accepted output exists, so nothing here is quoted from a provider.',
} as const;
