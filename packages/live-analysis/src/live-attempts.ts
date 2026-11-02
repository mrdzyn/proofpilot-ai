/**
 * UI-C3-02-BT-LIVE-01: live provider-attempt accounting, separate from the
 * mock success quota.
 *
 * Each owner approval authorizes exactly one provider attempt per action.
 * The authorization is consumed at the irreversible outbound-send boundary
 * (the transport's `onSend` hook, fired immediately before the single
 * POST) — not after successful response sanitization. There is deliberately
 * no refund API: a timeout, cancellation after send, HTTP error, malformed
 * response, model mismatch, or sanitizer refusal must never restore a
 * consumed attempt. Attempts refused before send (validation, pre-send
 * cancellation, D9 gate) never reach the hook and never spend.
 *
 * Pure module: no I/O, no clock, no secrets, no network.
 */
import type { MockPermitKind } from './mock-permits.ts';

/**
 * Exactly-once send-boundary spender for one run. The returned callback is
 * safe to invoke from a transport `onSend` hook: the first call consumes one
 * ledger attempt, later calls are no-ops. There is no restore path by
 * construction, so a duplicate hook invocation can never double-spend and no
 * failure path can resurrect the attempt.
 */
export function createLiveSendSpender(
  ledger: LiveAttemptLedger,
  kind: MockPermitKind,
): () => void {
  let spent = false;
  return () => {
    if (!spent) {
      spent = true;
      ledger.consume(kind);
    }
  };
}

export interface LiveAttemptLedger {
  /** Remaining authorized attempts for the action. Never negative. */
  left(kind: MockPermitKind): number;
  /**
   * Consume one attempt at the send boundary. Returns true when an attempt
   * was available (and exactly one is now spent), false when exhausted.
   * Consuming is final; failures after send never restore.
   */
  consume(kind: MockPermitKind): boolean;
}

function floorCount(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

export function createLiveAttemptLedger(input: {
  readonly analyses: unknown;
  readonly proposals: unknown;
}): LiveAttemptLedger {
  let analysesLeft = floorCount(input.analyses);
  let proposalsLeft = floorCount(input.proposals);
  return {
    left(kind: MockPermitKind): number {
      return kind === 'analyze' ? analysesLeft : proposalsLeft;
    },
    consume(kind: MockPermitKind): boolean {
      if (kind === 'analyze') {
        if (analysesLeft <= 0) return false;
        analysesLeft -= 1;
        return true;
      }
      if (proposalsLeft <= 0) return false;
      proposalsLeft -= 1;
      return true;
    },
  };
}
