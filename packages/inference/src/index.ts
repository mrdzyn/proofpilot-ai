export * from './errors.ts';
export * from './config.ts';
export * from './client.ts';
export * from './video-analysis.ts';
export * from './analyze-command.ts';
export * from './reservations.ts';
export * from './patch-proposal.ts';
export * from './proposal-readiness.ts';
export * from './baseten-discovery.ts';
// Live-approval surface: ONLY the production gate, errors/limits and read-only helpers. The injectable core (live-gate-core.ts),
// the CLI logic with injected context (approval-cli.ts) and the record primitives (live-approval.ts internals) are deliberately NOT
// re-exported, so future code cannot reach a test-only authorization path through the package index.
export { authorizeProductionAttempt, prepareProductionAttempt, runProductionApprovalCli, type ProductionAttempt } from './live-gate.ts';
export { AuthorizationError, ACTIVATION_PIN_PATH, APPROVAL_LABEL, APPROVAL_TTL_MS, DECISION_ID, LIVE_LIMITS, type AuthorizationErrorCode, type AuthorizedAttempt } from './live-approval.ts';
export { createGitProbe } from './git-probe.ts';
export * from './live-rehearsal.ts';
export type { ApprovalIo } from './approval-cli.ts';
