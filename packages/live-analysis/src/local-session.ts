/**
 * UI-C3-02-I2: in-memory companion pairing/session logic.
 * No HTTP server, environment access, persisted secrets, or provider calls.
 * issueTerminalCode() MUST remain terminal-only when a reviewed server exists;
 * it must NEVER be exposed as a browser API route.
 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const PAIRING_TTL_MS = 2 * 60_000;
const ATTEMPT_WINDOW_MS = 60_000;
const MAX_FAILURES_PER_WINDOW = 5;
const LOCKOUT_MS = 60_000;
const SESSION_IDLE_MS = 30 * 60_000;
const SESSION_ABSOLUTE_MS = 4 * 60 * 60_000;

export type PairingRefusal = 'PAIR_NOT_ISSUED' | 'PAIR_EXPIRED' | 'PAIR_LOCKED' | 'PAIR_INVALID';
export type PairingResult =
  | Readonly<{ ok: true; sessionToken: string }>
  | Readonly<{ ok: false; code: PairingRefusal }>;

type PairCode = { hash: Buffer; expiresAt: number };
type LocalSession = { tokenHash: Buffer; issuedAt: number; lastUsedAt: number };

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}
function equalsDigest(left: Buffer, right: Buffer): boolean {
  return timingSafeEqual(left, right);
}

/**
 * Constructed by a future owner-started companion, not by an untrusted request.
 * Using only monotonic internal time prevents wall-clock rollback from extending
 * pairing or session lifetimes. Tests can supply a synthetic clock.
 */
export class LocalSessionManager {
  #lastNow = Number.NEGATIVE_INFINITY;
  #code: PairCode | null = null;
  #session: LocalSession | null = null;
  #failedAt: number[] = [];
  #lockedUntil = Number.NEGATIVE_INFINITY;

  private readonly clock: () => number;
  constructor(clock: () => number = Date.now) { this.clock = clock; }

  #now(): number {
    const sampled = this.clock();
    if (!Number.isSafeInteger(sampled) || sampled < 0) {
      throw new RangeError('clock must yield a non-negative safe integer');
    }
    this.#lastNow = Math.max(sampled, this.#lastNow);
    return this.#lastNow;
  }

  /** Explicit TERMINAL-ONLY act; returns the secret code once to its caller. */
  issueTerminalCode(): string {
    const now = this.#now();
    const code = String(randomInt(0, 100_000_000)).padStart(8, '0');
    this.#code = { hash: digest(code), expiresAt: now + PAIRING_TTL_MS };
    // Fresh pairing invalidates the previous UI session; no ambient access.
    this.#session = null;
    return code;
  }

  /** Called only AFTER the independent Host/Origin/JSON/size request guard. */
  pair(value: unknown): PairingResult {
    const now = this.#now();
    if (now < this.#lockedUntil) return { ok: false, code: 'PAIR_LOCKED' };
    if (!this.#code) return { ok: false, code: 'PAIR_NOT_ISSUED' };
    if (now >= this.#code.expiresAt) {
      this.#code = null;
      return { ok: false, code: 'PAIR_EXPIRED' };
    }
    this.#failedAt = this.#failedAt.filter(t => now - t < ATTEMPT_WINDOW_MS);
    const valid = typeof value === 'string' && /^\d{8}$/.test(value) && equalsDigest(digest(value), this.#code.hash);
    if (!valid) {
      this.#failedAt.push(now);
      if (this.#failedAt.length >= MAX_FAILURES_PER_WINDOW) {
        this.#lockedUntil = now + LOCKOUT_MS;
        this.#code = null;
        return { ok: false, code: 'PAIR_LOCKED' };
      }
      return { ok: false, code: 'PAIR_INVALID' };
    }
    this.#code = null; // Consumed even if the caller later loses its response.
    this.#failedAt = [];
    const sessionToken = randomBytes(32).toString('base64url'); // 256 bits.
    this.#session = { tokenHash: digest(sessionToken), issuedAt: now, lastUsedAt: now };
    return { ok: true, sessionToken };
  }

  /** Call for each authenticated endpoint; invalid tokens never refresh TTL. */
  authenticate(value: unknown): boolean {
    const now = this.#now();
    if (!this.#session) return false;
    if (now - this.#session.issuedAt >= SESSION_ABSOLUTE_MS || now - this.#session.lastUsedAt >= SESSION_IDLE_MS) {
      this.#session = null;
      return false;
    }
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
    if (!equalsDigest(digest(value), this.#session.tokenHash)) return false;
    this.#session.lastUsedAt = now;
    return true;
  }

  /** Terminal restart, logout, or owner cancellation, no token written to disk. */
  revokeAll(): void {
    this.#code = null;
    this.#session = null;
    this.#failedAt = [];
    this.#lockedUntil = Number.NEGATIVE_INFINITY;
  }
}
