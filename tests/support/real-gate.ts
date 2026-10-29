// Test-only oracle for what the PRODUCTION gate must say about THIS checkout when nothing but an operator approval is missing.
// The repository's activation pin is state: `activation: null` before the separate pin-only commit, a LIVE-C3-01 record after it. Tests
// that observe the real checkout therefore assert an exact, deterministic code per state instead of a hard-coded "unpinned" code:
//   unpinned                                        -> ACTIVATION_NOT_PINNED
//   pinned, valid pin-only lineage, no approval     -> APPROVAL_MISSING
//   pinned, pinned commit unreachable / wrong digest / other decision (e.g. a shallow or synthetic-merge checkout) -> ACTIVATION_MISMATCH
//   pinned, HEAD is not the pinned tree or not a pin-only descendant -> REVISION_NOT_APPROVED
// It is built only from read-only Git primitives and the same parsers, and it is itself checked against the real gate on isolated
// fixtures (tests/security/live01b-prep-install-copy.test.ts), so it cannot drift silently. It never relaxes a check: any other code fails.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ACTIVATION_PIN_PATH, createGitProbe } from '../../packages/inference/src/index.ts';
import { findApprovedDecision, parseActivationPin, parseDecisionRegister } from '../../packages/inference/src/live-approval.ts';

export type RealGateCode = 'ACTIVATION_NOT_PINNED' | 'ACTIVATION_MISMATCH' | 'REVISION_NOT_APPROVED' | 'APPROVAL_MISSING';

export async function expectedGateCode(root: string): Promise<RealGateCode> {
  const pin = parseActivationPin(readFileSync(path.join(root, ACTIVATION_PIN_PATH), 'utf8'));
  const act = pin.activation;
  if (!act) return 'ACTIVATION_NOT_PINNED';
  const decision = findApprovedDecision(parseDecisionRegister(readFileSync(path.join(root, 'config/live-authorization.json'), 'utf8')), false);
  if (act.decisionReference !== decision.reference) return 'ACTIVATION_MISMATCH';
  const git = createGitProbe(root);
  let pinned: string;
  try {
    pinned = await git.treeDigest(act.activationCommit, ACTIVATION_PIN_PATH);
  } catch {
    return 'ACTIVATION_MISMATCH';
  }
  if (pinned !== act.activationDigest) return 'ACTIVATION_MISMATCH';
  if ((await git.treeDigest('HEAD', ACTIVATION_PIN_PATH)) !== act.activationDigest) return 'REVISION_NOT_APPROVED';
  if (!(await git.pinOnlyDescent(act.activationCommit, ACTIVATION_PIN_PATH)).ok) return 'REVISION_NOT_APPROVED';
  return 'APPROVAL_MISSING';
}

/** The pin file is either empty or a schema-valid, non-synthetic LIVE-C3-01 record naming the registered decision; anything else is a defect. */
export function readPinState(root: string): { pinned: boolean; activationCommit: string | null } {
  const act = parseActivationPin(readFileSync(path.join(root, ACTIVATION_PIN_PATH), 'utf8')).activation;
  if (!act) return { pinned: false, activationCommit: null };
  if (act.synthetic !== undefined || act.decisionId !== 'LIVE-C3-01') throw new Error('the repository pin is synthetic or names another decision');
  return { pinned: true, activationCommit: act.activationCommit };
}
