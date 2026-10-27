// Run lifecycle statuses (blueprint 01 § State machine). Only the deterministic
// verdict engine may assign VERIFIED; C1 implements no path that does.
export type RunStatus =
  | 'CREATED'
  | 'VIDEO_ANALYZED'
  | 'REPRO_RUNNING'
  | 'REPRODUCED'
  | 'PATCH_PROPOSED'
  | 'AWAITING_PATCH_APPROVAL'
  | 'PATCH_APPLIED'
  | 'VERIFY_RUNNING'
  | 'VERIFIED'
  | 'NOT_REPRODUCED'
  | 'ANALYSIS_FAILED'
  | 'PATCH_REJECTED'
  | 'PATCH_FAILED'
  | 'INCONCLUSIVE'
  | 'SECURITY_BLOCKED'
  | 'CANCELLED';

export type BaselineVerdict = Extract<RunStatus, 'REPRODUCED' | 'NOT_REPRODUCED' | 'INCONCLUSIVE'>;
export type RegressionResult = 'PASS' | 'FAIL' | 'NOT_RUN';
