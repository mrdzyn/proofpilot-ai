/**
 * UI-C3-02-I2 offline MOCK permit ledger.
 *
 * An ephemeral permit here is NOT a production approval or spending right.
 * No provider transport, production quota, activation pin or persistence exists.
 * D9 is still hard-disabled by config.ts. A later independently reviewed
 * production gate must use durable owner approval and reservation semantics.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

const PERMIT_TTL_MS = 2 * 60_000;
const MAX_VIDEO_BYTES = 25_000_000;
export type MockPermitKind = 'analyze' | 'propose';
export type MockPermitIdentity = Readonly<{
  runId: string;
  sha256: string;
  bytes: number;
  kind: MockPermitKind;
}>;
export type MockPermitRefusal = 'INVALID_IDENTITY' | 'PERMIT_PENDING' | 'RUN_SPENT' | 'NO_PERMIT' | 'PERMIT_EXPIRED' | 'PERMIT_MISMATCH';

type Permit = MockPermitIdentity & { issuedAt: number };
type Result = Readonly<{ ok: true }> | Readonly<{ ok: false; code: MockPermitRefusal }>;

function validIdentity(x: MockPermitIdentity): boolean {
  return /^([a-z0-9][a-z0-9-]{2,79})$/.test(x.runId) &&
    /^[0-9a-f]{64}$/.test(x.sha256) &&
    Number.isSafeInteger(x.bytes) && x.bytes > 0 && x.bytes <= MAX_VIDEO_BYTES &&
    (x.kind === 'analyze' || x.kind === 'propose');
}
function hashesMatch(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();
  return timingSafeEqual(left, right);
}

export class OfflineMockPermitLedger {
  #pending: Permit | null = null;
  #spent = new Set<string>();
  #lastNow = Number.NEGATIVE_INFINITY;
  #now(): number {
    const sample = this.clock();
    if (!Number.isSafeInteger(sample) || sample < 0) throw new RangeError('invalid clock');
    this.#lastNow = Math.max(this.#lastNow, sample);
    return this.#lastNow;
  }
  constructor(private readonly clock: () => number = Date.now) {}

  /** Simulates a terminal-issued single-use permit, NEVER a live authorization. */
  issueTerminalMockPermit(input: MockPermitIdentity): Result {
    const now = this.#now();
    if (!validIdentity(input)) return { ok: false, code: 'INVALID_IDENTITY' };
    if (this.#spent.has(input.runId)) return { ok: false, code: 'RUN_SPENT' };
    if (this.#pending) return { ok: false, code: 'PERMIT_PENDING' };
    this.#pending = { ...input, issuedAt: now };
    return { ok: true };
  }

  /** One mock attempt consumes the permit even for a mismatch or failure. */
  consumeMockAttempt(input: MockPermitIdentity): Result {
    const now = this.#now();
    const pending = this.#pending;
    if (!pending) return { ok: false, code: 'NO_PERMIT' };
    this.#pending = null; // consume before validating untrusted request fields.
    this.#spent.add(pending.runId);
    if (now - pending.issuedAt >= PERMIT_TTL_MS) return { ok: false, code: 'PERMIT_EXPIRED' };
    if (!validIdentity(input)) return { ok: false, code: 'INVALID_IDENTITY' };
    if (pending.runId !== input.runId || pending.kind !== input.kind || pending.bytes !== input.bytes ||
      !hashesMatch(pending.sha256, input.sha256)) return { ok: false, code: 'PERMIT_MISMATCH' };
    return { ok: true };
  }

  /** I2 is memory-only. Restart revokes permits but DOES NOT model durable quota. */
  revokePending(): void {
    if (this.#pending) this.#spent.add(this.#pending.runId);
    this.#pending = null;
  }
}
