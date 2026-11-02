/**
 * UI-C3-02-D9-I1 (I15 hardening): durable, tamper-evident live-attempt
 * spent-run record with exclusive cross-process ownership.
 *
 * The in-memory live ledger resets on restart, so a restart must never
 * recreate spent authorization — and two companion processes must never
 * share and independently spend the same authorization. Every authorized
 * provider send is appended here at the send boundary, fsync'd before
 * egress; the effective live budget is always `max(0, configured - recorded)`.
 *
 * Fail-closed rules:
 * - Only absolute paths are accepted (approved-location rule).
 * - A missing or empty record initializes ONLY with an explicit,
 *   owner-supplied bootstrap approval id (fresh attestation). Without it,
 *   startup refuses — deletion, truncation, or replacement can never
 *   silently re-arm the budget.
 * - A corrupt chain, a chain that no longer contains the lock tip
 *   (rollback), or an unsafe file (symlink, non-regular, wrong owner,
 *   group/other-accessible) always refuses, with or without an id.
 * - Exactly one live owner holds the record: acquisition is an atomic
 *   hard-link creation; contention, a live foreign holder, or an unreadable
 *   lock refuses. A stale lock (dead holder PID) is taken over only when its
 *   tip is still in the record chain; otherwise rollback is assumed.
 * - Every send re-verifies lock ownership immediately before the append; a
 *   missing or foreign lock denies the send and poisons the live path.
 * - Entries never name credentials, request bodies, or provider text — run
 *   id, media SHA-256, kind, and timestamp only (plus the approval id that
 *   anchored the record).
 *
 * Pure except for the record and lock files: no env, no secrets, no network.
 */
import {
  appendFileSync,
  closeSync,
  constants,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import path from 'node:path';
import type { MockPermitKind } from './mock-permits.ts';

export type LiveSpendRecordCode =
  | 'LIVE_SPEND_RECORD_FAILED'
  | 'LIVE_SPEND_RECORD_MISSING'
  | 'LIVE_RECORD_LOCKED'
  | 'LIVE_SPEND_RECORD_CORRUPT'
  | 'LIVE_RECORD_UNSAFE'
  | 'LIVE_SPEND_RECORD_ROLLBACK';

/** Thrown when the record cannot be used. The caller must fail closed. */
export class LiveSpendRecordError extends Error {
  readonly code: LiveSpendRecordCode;
  constructor(code: LiveSpendRecordCode, detail: string) {
    super(`live spent-run record unavailable (${code}): ${detail}`);
    this.name = 'LiveSpendRecordError';
    this.code = code;
  }
}

export interface SpentAttemptEntry {
  readonly runId: string;
  readonly sha256: string;
  readonly kind: MockPermitKind;
  /** Milliseconds since epoch, from the companion clock. */
  readonly spentAt: number;
}

interface GenesisLine {
  readonly v: 1;
  readonly entry: 'genesis';
  readonly approvalId: string;
  readonly createdAt: number;
  readonly prev: string;
  readonly digest: string;
}

interface SpendLine extends SpentAttemptEntry {
  readonly v: 1;
  readonly entry: 'spend';
  readonly prev: string;
  readonly digest: string;
}

type StoredLine = GenesisLine | SpendLine;

const GENESIS_PREV = 'GENESIS-LIVE-SPEND-RECORD-v1';
const APPROVAL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9-]{2,79}$/;

function digestOf(prev: string, body: string): string {
  return createHash('sha256').update(`${prev}\n${body}`, 'utf8').digest('hex');
}

function genesisDigest(approvalId: string, createdAt: number): string {
  return digestOf(GENESIS_PREV, `genesis\n${approvalId}\n${createdAt}`);
}

function spendDigest(prev: string, entry: SpentAttemptEntry): string {
  return digestOf(prev, `spend\n${entry.runId}\n${entry.sha256}\n${entry.kind}\n${entry.spentAt}`);
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function checkShape(value: unknown): value is StoredLine {
  if (!isRecordObject(value) || value['v'] !== 1) return false;
  if (typeof value['prev'] !== 'string' || typeof value['digest'] !== 'string') return false;
  if (value['entry'] === 'genesis') {
    return typeof value['approvalId'] === 'string' &&
      APPROVAL_ID_RE.test(value['approvalId'] as string) &&
      Number.isSafeInteger(value['createdAt']) && (value['createdAt'] as number) >= 0;
  }
  if (value['entry'] === 'spend') {
    return typeof value['runId'] === 'string' && (value['runId'] as string).length > 0 &&
      typeof value['sha256'] === 'string' && /^[0-9a-f]{64}$/.test(value['sha256'] as string) &&
      (value['kind'] === 'analyze' || value['kind'] === 'propose') &&
      Number.isSafeInteger(value['spentAt']) && (value['spentAt'] as number) >= 0;
  }
  return false;
}

function checkEntryShape(entry: SpentAttemptEntry): void {
  if (typeof entry.runId !== 'string' || entry.runId.length === 0 ||
    typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256) ||
    (entry.kind !== 'analyze' && entry.kind !== 'propose') ||
    !Number.isSafeInteger(entry.spentAt) || entry.spentAt < 0) {
    throw new LiveSpendRecordError('LIVE_SPEND_RECORD_FAILED', 'refused to record a malformed entry');
  }
}

/** Hardening: regular file, no symlinks, owner-only access, owned by us. */
function checkFileSafety(p: string, role: string): void {
  if (typeof p !== 'string' || p.length === 0 || !path.isAbsolute(p) || path.resolve(p) !== p) {
    throw new LiveSpendRecordError('LIVE_RECORD_UNSAFE', `${role} path must be absolute and canonical`);
  }
  let st: ReturnType<typeof lstatSync>;
  try {
    st = lstatSync(p);
  } catch {
    throw new LiveSpendRecordError('LIVE_RECORD_UNSAFE', `${role} file is not accessible`);
  }
  if (st.isSymbolicLink()) {
    throw new LiveSpendRecordError('LIVE_RECORD_UNSAFE', `${role} file must not be a symlink`);
  }
  if (!st.isFile()) {
    throw new LiveSpendRecordError('LIVE_RECORD_UNSAFE', `${role} path must be a regular file`);
  }
  if ((st.mode & 0o777) & 0o077) {
    throw new LiveSpendRecordError('LIVE_RECORD_UNSAFE', `${role} file must not be group/other-accessible`);
  }
  if (typeof process.getuid === 'function' && st.uid !== process.getuid()) {
    throw new LiveSpendRecordError('LIVE_RECORD_UNSAFE', `${role} file must be owned by the companion user`);
  }
}

interface LockContent {
  readonly pid: number;
  readonly nonce: string;
  readonly createdAt: number;
  readonly tip: string;
}

function isLockContent(value: unknown): value is LockContent {
  return isRecordObject(value) &&
    Number.isSafeInteger(value['pid']) && (value['pid'] as number) > 0 &&
    typeof value['nonce'] === 'string' && (value['nonce'] as string).length >= 16 &&
    Number.isSafeInteger(value['createdAt']) &&
    typeof value['tip'] === 'string' && (value['tip'] as string).length > 0;
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: a process exists but belongs to another user — treat as alive
    // (fail closed). ESRCH: no such process.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Append-only spent-run record handle with exclusive ownership. */
export interface LiveSpentRecord {
  /** Number of recorded spent attempts for the action. */
  countSpent(kind: MockPermitKind): number;
  /**
   * Record one authorized send: verify lock ownership, append, fsync, and
   * advance the lock tip. Throws LiveSpendRecordError on any failure; the
   * caller must treat the send as failed and poison the live path.
   */
  record(entry: SpentAttemptEntry): void;
  /**
   * Release ownership (best-effort, never throws): remove the lock only when
   * it still names this holder.
   */
  release(): void;
}

/**
 * Open (or bootstrap) and exclusively own the spent-run record at `path`.
 *
 * - Missing or empty record: initializes ONLY with `opts.bootstrapApprovalId`
 *   (a fresh owner attestation, format-checked). Without it, throws
 *   LIVE_SPEND_RECORD_MISSING — never auto-creates.
 * - Existing record: full chain verification; any break throws
 *   LIVE_SPEND_RECORD_CORRUPT. Unsafe files throw LIVE_RECORD_UNSAFE.
 * - Ownership: atomic hard-link acquisition; a live foreign holder throws
 *   LIVE_RECORD_LOCKED. A stale lock is taken over only when its tip is
 *   still in the chain; otherwise LIVE_SPEND_RECORD_ROLLBACK.
 */
export function openSpentRecord(
  recordPath: string,
  opts: { readonly bootstrapApprovalId?: string } = {},
): LiveSpentRecord {
  if (typeof recordPath !== 'string' || recordPath.length === 0 ||
    !path.isAbsolute(recordPath) || path.resolve(recordPath) !== recordPath) {
    throw new LiveSpendRecordError('LIVE_RECORD_UNSAFE', 'record path must be absolute and canonical');
  }
  const lockPath = `${recordPath}.lock`;
  const bootstrapId = opts.bootstrapApprovalId;
  if (bootstrapId !== undefined && !APPROVAL_ID_RE.test(bootstrapId)) {
    throw new LiveSpendRecordError('LIVE_SPEND_RECORD_MISSING', 'bootstrap approval id is malformed');
  }

  // Load + verify, or bootstrap a fresh chain with the owner approval.
  let lines: StoredLine[];
  try {
    const st = lstatSync(recordPath);
    if (st.isSymbolicLink() || !st.isFile()) {
      throw new LiveSpendRecordError('LIVE_RECORD_UNSAFE', 'record path must be a regular file, not a symlink or special file');
    }
    lines = readChain(recordPath);
  } catch (error) {
    if (error instanceof LiveSpendRecordError) throw error;
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || bootstrapId === undefined) {
      throw new LiveSpendRecordError(
        'LIVE_SPEND_RECORD_MISSING',
        'record is missing and no bootstrap approval was supplied; refusing to auto-create (rollback-safe: supply a fresh owner approval id to initialize)',
      );
    }
    lines = initializeRecord(recordPath, bootstrapId);
  }
  if (lines.length === 0) {
    if (bootstrapId === undefined) {
      throw new LiveSpendRecordError(
        'LIVE_SPEND_RECORD_MISSING',
        'record is empty and no bootstrap approval was supplied; refusing to auto-initialize (empty is ambiguous with truncation)',
      );
    }
    lines = initializeRecord(recordPath, bootstrapId);
  }

  const digests = new Set(lines.map((line) => line.digest));
  let analyses = 0;
  let proposals = 0;
  for (const line of lines) {
    if (line.entry === 'spend') {
      if (line.kind === 'analyze') analyses += 1;
      else proposals += 1;
    }
  }

  // Exclusive ownership: atomic hard-link acquisition of the lock.
  const nonce = randomBytes(16).toString('hex');
  const me = { pid: process.pid, nonce, createdAt: Date.now(), tip: lines[lines.length - 1]?.digest ?? GENESIS_PREV };
  acquireLock(lockPath, me, digests);

  let tip = me.tip;
  const verifyLock = (): void => {
    let raw: string;
    try {
      checkFileSafety(lockPath, 'lock');
      raw = readFileSync(lockPath, 'utf8');
    } catch (error) {
      if (error instanceof LiveSpendRecordError) throw error;
      throw new LiveSpendRecordError('LIVE_SPEND_RECORD_FAILED', 'lock file unreadable at the send boundary');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new LiveSpendRecordError('LIVE_SPEND_RECORD_FAILED', 'lock file unreadable at the send boundary');
    }
    if (!isLockContent(parsed) || parsed.nonce !== nonce || parsed.pid !== process.pid) {
      throw new LiveSpendRecordError('LIVE_SPEND_RECORD_FAILED', 'record ownership lost before the send');
    }
  };

  return {
    countSpent(kind: MockPermitKind): number {
      return kind === 'analyze' ? analyses : proposals;
    },
    record(entry: SpentAttemptEntry): void {
      checkEntryShape(entry);
      verifyLock();
      const chained: SpendLine = {
        v: 1,
        entry: 'spend',
        runId: entry.runId,
        sha256: entry.sha256,
        kind: entry.kind,
        spentAt: entry.spentAt,
        prev: tip,
        digest: spendDigest(tip, entry),
      };
      try {
        appendFileSync(recordPath, `${JSON.stringify(chained)}\n`, { encoding: 'utf8', mode: 0o600 });
        const fd = openSync(recordPath, 'r');
        try {
          fsyncSync(fd);
        } finally {
          closeSync(fd);
        }
      } catch {
        throw new LiveSpendRecordError('LIVE_SPEND_RECORD_FAILED', 'record append or durable flush failed');
      }
      tip = chained.digest;
      if (entry.kind === 'analyze') analyses += 1;
      else proposals += 1;
      updateLockTip(lockPath, nonce, tip);
    },
    release(): void {
      try {
        const raw = readFileSync(lockPath, 'utf8');
        const parsed: unknown = JSON.parse(raw);
        if (isLockContent(parsed) && parsed.nonce === nonce && parsed.pid === process.pid) {
          unlinkSync(lockPath);
        }
      } catch {
        // Best-effort: a stale lock is taken over (or refused) on next open.
      }
    },
  };
}

/** Read every line, verify shape + hash chain. Throws CORRUPT on any break. */
function readChain(recordPath: string): StoredLine[] {
  checkFileSafety(recordPath, 'record');
  let raw: string;
  try {
    raw = readFileSync(recordPath, 'utf8');
  } catch {
    throw new LiveSpendRecordError('LIVE_SPEND_RECORD_CORRUPT', 'record file is not readable');
  }
  const lines: StoredLine[] = [];
  let prev = GENESIS_PREV;
  for (const rawLine of raw.split('\n')) {
    const trimmed = rawLine.trim();
    if (trimmed === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new LiveSpendRecordError('LIVE_SPEND_RECORD_CORRUPT', 'record contains a malformed line');
    }
    if (!checkShape(parsed)) {
      throw new LiveSpendRecordError('LIVE_SPEND_RECORD_CORRUPT', 'record contains a malformed entry');
    }
    const expected = parsed.entry === 'genesis'
      ? genesisDigest(parsed.approvalId, parsed.createdAt)
      : spendDigest(parsed.prev, {
        runId: parsed.runId,
        sha256: parsed.sha256,
        kind: parsed.kind,
        spentAt: parsed.spentAt,
      });
    if (parsed.prev !== prev || parsed.digest !== expected) {
      throw new LiveSpendRecordError('LIVE_SPEND_RECORD_CORRUPT', 'record chain is broken');
    }
    prev = parsed.digest;
    lines.push(parsed);
  }
  return lines;
}

/**
 * First-run bootstrap: the owner attests a fresh approval id for this path.
 * Writes the genesis line binding that id. Never overwrites an existing file
 * (exclusive create — a racer wins, the loser retries through open).
 */
function initializeRecord(recordPath: string, approvalId: string): StoredLine[] {
  const createdAt = Date.now();
  const genesis: GenesisLine = {
    v: 1,
    entry: 'genesis',
    approvalId,
    createdAt,
    prev: GENESIS_PREV,
    digest: genesisDigest(approvalId, createdAt),
  };
  try {
    const fd = openSync(recordPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    try {
      writeFileSync(fd, `${JSON.stringify(genesis)}\n`, { encoding: 'utf8' });
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      // A concurrent initializer won: fall back to loading their chain.
      return readChain(recordPath);
    }
    throw new LiveSpendRecordError('LIVE_SPEND_RECORD_FAILED', 'bootstrap record cannot be created');
  }
  return [genesis];
}

/** Rewrite the lock tip atomically after each recorded spend. */
function updateLockTip(lockPath: string, nonce: string, tip: string): void {
  const tmp = `${lockPath}.tmp.${String(process.pid)}.${nonce}`;
  try {
    writeFileSync(
      tmp,
      JSON.stringify({ pid: process.pid, nonce, createdAt: Date.now(), tip }),
      { encoding: 'utf8', mode: 0o600 },
    );
    renameSync(tmp, lockPath);
  } catch {
    try {
      unlinkSync(tmp);
    } catch {
      // ignore cleanup failure
    }
    throw new LiveSpendRecordError('LIVE_SPEND_RECORD_FAILED', 'lock tip update failed');
  }
}

/**
 * Atomic lock acquisition via hard link (appears with complete content or
 * not at all — never torn). On contention with a live holder: refuse. On a
 * stale lock: take over only when its tip is still in the record chain
 * (rollback-safe); otherwise refuse. Bounded retries, then refuse.
 */
function acquireLock(
  lockPath: string,
  me: { pid: number; nonce: string; createdAt: number; tip: string },
  chainDigests: Set<string>,
): void {
  const tmp = `${lockPath}.tmp.${String(me.pid)}.${me.nonce}`;
  writeFileSync(
    tmp,
    JSON.stringify({ pid: me.pid, nonce: me.nonce, createdAt: me.createdAt, tip: me.tip }),
    { encoding: 'utf8', mode: 0o600 },
  );
  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        linkSync(tmp, lockPath);
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw new LiveSpendRecordError('LIVE_SPEND_RECORD_FAILED', 'lock acquisition failed');
        }
      }
      if (tryStealStaleLock(lockPath, chainDigests)) {
        continue;
      }
      throw new LiveSpendRecordError(
        'LIVE_RECORD_LOCKED',
        'record is owned by another live companion process; refusing to share authorization (stop the other process or wait for its release)',
      );
    }
    throw new LiveSpendRecordError('LIVE_RECORD_LOCKED', 'record lock contention did not settle');
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      // ignore cleanup failure
    }
  }
}

/**
 * Attempt stale-lock takeover. Returns true when the caller should retry
 * acquisition, and throws when the state proves rollback or tampering.
 */
function tryStealStaleLock(lockPath: string, chainDigests: Set<string>): boolean {
  let raw: string;
  try {
    checkFileSafety(lockPath, 'lock');
    raw = readFileSync(lockPath, 'utf8');
  } catch (error) {
    if (error instanceof LiveSpendRecordError) throw error;
    return true;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // A complete lock file appears atomically, so persistent garbage is
    // tampering, not a torn write.
    throw new LiveSpendRecordError('LIVE_RECORD_UNSAFE', 'lock file is not well-formed');
  }
  if (!isLockContent(parsed)) {
    throw new LiveSpendRecordError('LIVE_RECORD_UNSAFE', 'lock file is not well-formed');
  }
  if (pidAlive(parsed.pid)) {
    return false;
  }
  if (!chainDigests.has(parsed.tip)) {
    throw new LiveSpendRecordError(
      'LIVE_SPEND_RECORD_ROLLBACK',
      'stale lock tip is absent from the record chain: the record was replaced or rolled back; refusing to re-arm (reconcile manually and bootstrap a fresh approval)',
    );
  }
  try {
    unlinkSync(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new LiveSpendRecordError('LIVE_RECORD_LOCKED', 'stale lock could not be cleared');
    }
  }
  return true;
}

/**
 * Effective live budget: configured allocation minus durable recorded spend,
 * floored at zero. Hostile configured values floor to zero, never to credit.
 */
export function remainingLiveBudget(configured: unknown, recordedSpent: number): number {
  const base = typeof configured === 'number' && Number.isSafeInteger(configured) && configured > 0
    ? configured
    : 0;
  const spent = Number.isSafeInteger(recordedSpent) && recordedSpent > 0 ? recordedSpent : 0;
  return Math.max(0, base - spent);
}
