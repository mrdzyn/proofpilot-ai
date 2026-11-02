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
 * Send-boundary authorization result. The transport must check it
 * synchronously before the single POST and refuse without sending when
 * authorization is denied.
 */
export type LiveSendAuthorization =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; code: 'LIVE_ATTEMPT_EXHAUSTED' }>;

/**
 * Exactly-once send-boundary spender for one run. The returned callback is
 * invoked from the transport `onSend` hook: the first call atomically
 * consumes one ledger attempt and authorizes the send; every later call —
 * and any call against an exhausted ledger — is denied and consumes
 * nothing, so a duplicate hook invocation or a second run sharing the
 * spender can never authorize another send. There is no restore path by
 * construction, so no failure path can resurrect the attempt.
 */
export function createLiveSendSpender(
  ledger: LiveAttemptLedger,
  kind: MockPermitKind,
  /**
   * Invoked synchronously exactly once, immediately after the first
   * successful consume and before the authorization is returned. The server
   * uses it to append the durable spent-run record. When it throws, the
   * authorization is denied (the ledger stays consumed — never restored) and
   * the error propagates so the send never happens.
   */
  onAuthorize?: () => void,
): () => LiveSendAuthorization {
  let spent = false;
  return () => {
    if (spent) {
      return { ok: false, code: 'LIVE_ATTEMPT_EXHAUSTED' };
    }
    spent = true;
    if (!ledger.consume(kind)) {
      return { ok: false, code: 'LIVE_ATTEMPT_EXHAUSTED' };
    }
    if (onAuthorize !== undefined) {
      onAuthorize();
    }
    return { ok: true };
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
