// Bundled historical record, transcribed at design time from reviewed sources.
// Every value traces byte-for-byte to its cited source (see T-TRUTH). This module
// is data only: no DOM, no network, no repository imports.

export const HISTORICAL = {
  commit: 'main@b841740',
  commitShort: 'b841740',
  fixtureSet: 'f01-20261027T122211Z-df375a',
  mobileClip: {
    file: 'f01-mobile-defect.mp4',
    dimensions: '390×844',
    duration: '10.04 s',
    sha256:
      'e9df68b14c48300818f9ec9407b884413037f29305f17a5da3cc4fac05eeafdf',
    observed: 'tap received by promo-overlay, cart stays 0',
  },
  desktopClip: {
    file: 'f01-desktop-control.mp4',
    dimensions: '1280×800',
    duration: '7.32 s',
    sha256:
      'e565e8bfe922dd5eb44def64c5f076ab963d9e9156f619196e4f3cce8b71976d',
    observed: 'tap received by add-to-cart, cart becomes 1',
  },
  run001: {
    id: 'c2b-live-smoke-001',
    providerStatus: 'incomplete (max_output_tokens)',
    localResult: 'ANALYSIS_FAILED / RESPONSE_NOT_COMPLETED',
    usage: '2773 in / 1500 out (1113 reasoning) / 4273 total',
    uploadId: 'df486a8b-18e5-47cf-bc70-e028b238b5f8',
    responseId: '536fb081-2d11-4010-aa3a-fb510c3626bc',
  },
  run002: {
    id: 'c2b-live-smoke-002',
    providerStatus: 'completed',
    localResult: 'VIDEO_ANALYZED',
    symptom:
      'Two Add-to-cart taps (~3.3 s, ~6.4 s); cart count unchanged; no feedback. Page URL not visible; tap registration uncertain — the model lists its own uncertainties.',
    usage: '2773 in / 1129 out (665 reasoning) / 3902 total',
    uploadId: '44a30289-e276-4645-9ba2-01402b5f4241',
    responseId: '585e7494-7cdd-44a1-b6ed-44f48a03bb44',
    remoteFile: 'reported deleted (file-2512150135928415)',
  },
  proposal: {
    runId: 'c3-live-meta-001',
    status: 'PROPOSAL_ACCEPTED',
    lifecycle: 'completed',
    tokens: '1,300 total (670 in / 630 out, 601 reasoning)',
    adjustment: {
      selector: '.promo-overlay',
      property: 'pointer-events',
      value: 'none',
    },
    renderedCss: '.promo-overlay{pointer-events:none}',
    responseId: '7cb1e5e2-3d88-42ab-9652-fcab88b690d8',
    inputChars: '2,756',
    inputSha256:
      '4e1466e8adf1ee58b6c050e70f9720da43ddb254b255d4f754f8696a857af558',
    outputBytes: '90',
    outputSha256:
      '78eebdfb94df58fd5e95a9151325b210780bd77391d399fda15932737f9cc2',
    reservationSlot: '1',
  },
  scoreboardExample: {
    run: 'c3-b1-20261028T084508Z-e27b62',
    approvedSha: 'bb64b73',
    baseline: 'REPRODUCED',
    negatives: 'NC-1, NC-1b, NC-3 PATCH_FAILED; NC-6, NC-7 INCONCLUSIVE; NC-5 NOT_REPRODUCED',
    pc1: 'VERIFIED 3/3',
    modelOrProviderCalls: 0,
  },
  ownerQa: {
    base: 'main@f305da3',
    result: 'F01 REPRODUCED, PC-1 VERIFIED 3/3, DID-1 PASS, zero provider calls',
  },
  guardrails: {
    refusal:
      'refused: c3-live-meta-001 is the real stored model proposal and its execution path is HARD-DISABLED (no owner execution approval, no security review of a real run). This command verifies synthetic fixtures only.',
    exitCode: '2',
    quota: 'spent; repository refuses further live attempts (REVISION_NOT_APPROVED)',
  },
} as const;
