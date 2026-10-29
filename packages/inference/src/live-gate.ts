// C3-LIVE-01A: THE production authorization and preparation API for a future Meta proposal attempt. Disabled in effect today:
// the register and the activation pin are empty and APPROVED_LIVE_QUOTA.meta is 0.
//
// Trust is derived here, never received: the install root is the location of this checkout (this file's own position), the register
// and the owner-pinned activation revision are read from that root, Git state comes from the real `git` run in that root, the
// approvals and reservation directories are fixed beneath it, the quota is the code constant, and synthetic decisions are
// impossible. The functions below accept ONLY the facts about the attempt itself (run id, request, provider to be called, output
// bound); any other property on the argument is ignored. Do not add parameters for roots, probes, registers, directories, quotas or
// stores. Future C3-LIVE-01B code must call these functions, not live-gate-core.ts (a static test restricts its importers).
import path from 'node:path';
import { AuthorizationError, type AuthorizedAttempt } from './live-approval.ts';
import { runApprovalCli, type ApprovalIo } from './approval-cli.ts';
import { createInstallContext, evaluateAuthorizationCore, prepareAttemptCore, type PreparedAttempt } from './live-gate-core.ts';
import type { InferenceProvider } from './client.ts';
import type { BuiltProposalRequest } from './patch-proposal.ts';
import { APPROVED_LIVE_QUOTA } from './reservations.ts';

/** This checkout (packages/inference/src -> repository root). Fixed by where the code lives, not by any argument. */
const INSTALL_ROOT = path.resolve(import.meta.dirname, '../../..');

export type ProductionAttempt = { runId: string; request: BuiltProposalRequest; provider: Pick<InferenceProvider, 'id' | 'models'>; maxOutputTokens: number };
const attemptOf = (a: ProductionAttempt): ProductionAttempt => ({ runId: a?.runId, request: a?.request, provider: a?.provider, maxOutputTokens: a?.maxOutputTokens });

const productionContext = () => createInstallContext(INSTALL_ROOT, APPROVED_LIVE_QUOTA.meta);

/** Read-only. Resolves only if every gate passes against the real repository; rejects with AuthorizationError otherwise. */
export async function authorizeProductionAttempt(attempt: ProductionAttempt): Promise<AuthorizedAttempt> {
  try {
    const a = await evaluateAuthorizationCore(await productionContext(), attemptOf(attempt));
    if (a.synthetic) throw new AuthorizationError('SYNTHETIC_NOT_ALLOWED', 'a synthetic authorization cannot be used in production');
    return a;
  } catch (e) {
    throw e instanceof AuthorizationError ? e : new AuthorizationError('INTERNAL', 'authorization failed closed');
  }
}

/** Authorize, consume the approval, re-check, claim the reservation. After it resolves, and only then, one provider call may follow. */
export async function prepareProductionAttempt(attempt: ProductionAttempt): Promise<PreparedAttempt> {
  try {
    const p = await prepareAttemptCore(await productionContext(), attemptOf(attempt));
    if (p.authorized.synthetic) throw new AuthorizationError('SYNTHETIC_NOT_ALLOWED', 'a synthetic authorization cannot be used in production');
    return p;
  } catch (e) {
    throw e instanceof AuthorizationError ? e : new AuthorizationError('INTERNAL', 'authorization failed closed');
  }
}

/** The owner-operated approval command against this checkout. Terminal I/O is the only input; everything else is derived. */
export async function runProductionApprovalCli(argv: string[], io: ApprovalIo): Promise<number> {
  try {
    return await runApprovalCli(argv, { io, ctx: await productionContext() });
  } catch (e) {
    io.print(`refused${e instanceof AuthorizationError ? ` (${e.code})` : ''}: nothing was recorded`);
    return 3;
  }
}
