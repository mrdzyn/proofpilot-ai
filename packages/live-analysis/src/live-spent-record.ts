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
 * Fail-closed protocol (two phases, no read-before-lock authorization):
 * - Only absolute paths are accepted (approved-location rule).
 * - Phase 1 ensures the file exists (created empty only with an approval)
 *   and is a safe regular file. Phase 2 reads a preliminary snapshot for
 *   validity only — never authority.
 * - Phase 3 acquires exclusive ownership via atomic hard link. Every link
 *   success is verified by re-reading the lock, so concurrent takeovers
 *   resolve to exactly one owner; stale locks are taken over only when
 *   their tip is in the chain (or the chain is empty with a fresh approval).
 * - Phase 4 re-reads the chain under the lock; the authoritative snapshot
 *   must match the preliminary one (rollback membership included), else the
 *   lock is released and open fails closed.
 * - Phase 5 writes the genesis under the lock for still-empty chains and
 *   fsyncs: the first authorized send always follows a durable genesis.
 * - A missing or empty record initializes ONLY with an explicit owner
 *   bootstrap approval id (fresh attestation). Without it, startup refuses
 *   — deletion, truncation, or replacement can never silently re-arm the
 *   budget. Corrupt, unsafe, or rolled-back state always refuses, with or
 *   without an id; the first entry must be exactly one approval genesis.
 * - Every send re-verifies lock ownership immediately before the append;
 *   a missing or foreign lock denies the send and poisons the live path.
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
export interface ChainSnapshot {
  readonly tip: string;
  readonly analyses: number;
  readonly proposals: number;
}

export type SnapshotContinuity =
  | { readonly ok: true }
  | { readonly ok: false; code: 'LIVE_SPEND_RECORD_FAILED' | 'LIVE_SPEND_RECORD_ROLLBACK' };

/**
 * Post-acquisition continuity table (unit-tested): the authoritative snapshot
 * re-read under exclusive ownership must match the preliminary snapshot, and
 * a stale-takeover tip must additionally still be in the chain. Any drift
 * fails closed — authorization never starts from a moving snapshot.
 */
export function checkSnapshotContinuity(
  preliminary: ChainSnapshot,
  authoritative: ChainSnapshot,
  stolenTip: string | null,
  authoritativeDigests: ReadonlySet<string>,
): SnapshotContinuity {
  if (stolenTip !== null && !authoritativeDigests.has(stolenTip)) {
    return { ok: false, code: 'LIVE_SPEND_RECORD_ROLLBACK' };
  }
  if (preliminary.tip !== authoritative.tip ||
    preliminary.analyses !== authoritative.analyses ||
    preliminary.proposals !== authoritative.proposals) {
    return { ok: false, code: 'LIVE_SPEND_RECORD_FAILED' };
  }
  return { ok: true };
}

interface RecordSnapshot extends ChainSnapshot {
  readonly digests: Set<string>;
  readonly empty: boolean;
}

function readSnapshot(recordPath: string): RecordSnapshot {
  const lines = readChain(recordPath);
  let analyses = 0;
  let proposals = 0;
  for (const line of lines) {
    if (line.entry === 'spend') {
      if (line.kind === 'analyze') analyses += 1;
      else proposals += 1;
    }
  }
  return {
    tip: lines.length > 0 && lines[lines.length - 1] !== undefined
      ? (lines[lines.length - 1] as StoredLine).digest
      : GENESIS_PREV,
    analyses,
    proposals,
    digests: new Set(lines.map((line) => line.digest)),
    empty: lines.length === 0,
  };
}

function releaseOwnedLock(lockPath: string, nonce: string): void {
  try {
    const raw = readFileSync(lockPath, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (isLockContent(parsed) && parsed.nonce === nonce && parsed.pid === process.pid) {
      unlinkSync(lockPath);
    }
  } catch {
    // Best-effort: a stale lock is taken over (or refused) on next open.
  }
}

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

  // Phase 1 — the file must exist (created empty only with an approval), and
  // be a safe regular file. Existence alone authorizes nothing.
  let existed: boolean;
  try {
    const st = lstatSync(recordPath);
    if (st.isSymbolicLink() || !st.isFile()) {
      throw new LiveSpendRecordError('LIVE_RECORD_UNSAFE', 'record path must be a regular file, not a symlink or special file');
    }
    existed = true;
  } catch (error) {
    if (error instanceof LiveSpendRecordError) throw error;
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new LiveSpendRecordError('LIVE_SPEND_RECORD_FAILED', 'record path is not accessible');
    }
    existed = false;
  }
  if (!existed) {
    if (bootstrapId === undefined) {
      throw new LiveSpendRecordError(
        'LIVE_SPEND_RECORD_MISSING',
        'record is missing and no bootstrap approval was supplied; refusing to auto-create (rollback-safe: supply a fresh owner approval id to initialize)',
      );
    }
    try {
      const fd = openSync(recordPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
      closeSync(fd);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw new LiveSpendRecordError('LIVE_SPEND_RECORD_FAILED', 'bootstrap record file cannot be created');
      }
      // A concurrent initializer created it; continue through the shared path.
    }
  }

  // Phase 2 — preliminary snapshot: validity only, never authority. Counts
  // and tip established here are re-verified under the lock in phase 4.
  const preliminary = readSnapshot(recordPath);

  // Phase 3 — exclusive ownership BEFORE any authoritative state is fixed.
  const nonce = randomBytes(16).toString('hex');
  const me = { pid: process.pid, nonce, createdAt: Date.now(), tip: preliminary.tip };
  const stolenTip = acquireLock(lockPath, me, preliminary.digests, preliminary.empty, bootstrapId !== undefined);

  // Phase 4 — authoritative snapshot under exclusive ownership. Any drift
  // since the preliminary read (a lockless writer, a lost race) fails closed
  // instead of authorizing from a moving snapshot.
  let tip: string;
  let analyses: number;
  let proposals: number;
  try {
    const authoritative = readSnapshot(recordPath);
    const continuity = checkSnapshotContinuity(
      { tip: preliminary.tip, analyses: preliminary.analyses, proposals: preliminary.proposals },
      { tip: authoritative.tip, analyses: authoritative.analyses, proposals: authoritative.proposals },
      stolenTip,
      authoritative.digests,
    );
    if (!continuity.ok) {
      if (continuity.code === 'LIVE_SPEND_RECORD_ROLLBACK') {
        throw new LiveSpendRecordError(
          'LIVE_SPEND_RECORD_ROLLBACK',
          'stale lock tip is absent from the re-read chain: the record was replaced or rolled back; refusing to re-arm (reconcile manually and bootstrap a fresh approval)',
        );
      }
      throw new LiveSpendRecordError(
        'LIVE_SPEND_RECORD_FAILED',
        'record changed during acquisition; refusing to authorize from a moving snapshot (retry the open)',
      );
    }
    tip = authoritative.tip;
    analyses = authoritative.analyses;
    proposals = authoritative.proposals;

    // Phase 5 — genesis for still-empty chains, written under the lock and
    // fsync'd: the first authorized send always follows a durable genesis.
    if (authoritative.empty) {
      if (bootstrapId === undefined) {
        throw new LiveSpendRecordError(
          'LIVE_SPEND_RECORD_MISSING',
          'record is empty and no bootstrap approval was supplied; refusing to auto-initialize (empty is ambiguous with truncation)',
        );
      }
      tip = writeGenesis(recordPath, bootstrapId);
    }
  } catch (error) {
    releaseOwnedLock(lockPath, nonce);
    throw error;
  }
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
  // Exactly one approval genesis, and it must come first: spend-only chains
  // and duplicate genesis lines can never authorize.
  if (lines.length > 0 && lines[0]?.entry !== 'genesis') {
    throw new LiveSpendRecordError('LIVE_SPEND_RECORD_CORRUPT', 'record must begin with exactly one approval genesis');
  }
  for (const line of lines.slice(1)) {
    if (line.entry === 'genesis') {
      throw new LiveSpendRecordError('LIVE_SPEND_RECORD_CORRUPT', 'record must contain exactly one approval genesis');
    }
  }
  return lines;
}

/**
 * First-run bootstrap, called only while holding the exclusive lock on a
 * verified-empty record: append the genesis line binding the owner approval
 * id and fsync before returning. The first authorized send always follows a
 * durable genesis.
 */
function writeGenesis(recordPath: string, approvalId: string): string {
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
    appendFileSync(recordPath, `${JSON.stringify(genesis)}\n`, { encoding: 'utf8', mode: 0o600 });
    const fd = openSync(recordPath, 'r');
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch {
    throw new LiveSpendRecordError('LIVE_SPEND_RECORD_FAILED', 'bootstrap genesis cannot be durably written');
  }
  return genesis.digest;
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
 * Read the lock and confirm it names exactly this holder. Called immediately
 * after a link success: if a concurrent takeover unlinked and replaced our
 * just-acquired lock, we detect the loss here and fail closed instead of
 * proceeding as a phantom second owner.
 */
function verifyLockIdentity(lockPath: string, pid: number, nonce: string): boolean {
  let raw: string;
  try {
    raw = readFileSync(lockPath, 'utf8');
  } catch {
    return false;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return false;
  }
  return isLockContent(parsed) && parsed.pid === pid && parsed.nonce === nonce;
}

/**
 * Atomic lock acquisition via hard link (appears with complete content or
 * not at all — never torn). Returns the stolen tip when a stale takeover
 * occurred, else null. On contention with a live holder: refuse. On a stale
 * lock: take over only when its tip is still in the record chain
 * (rollback-safe); otherwise refuse. Every link success is verified by
 * re-reading the lock, so concurrent takeovers resolve to exactly one owner.
 * Bounded retries, then refuse.
 */
function acquireLock(
  lockPath: string,
  me: { pid: number; nonce: string; createdAt: number; tip: string },
  chainDigests: ReadonlySet<string>,
  chainEmpty: boolean,
  bootstrapSupplied: boolean,
): string | null {
  const tmp = `${lockPath}.tmp.${String(me.pid)}.${me.nonce}`;
  writeFileSync(
    tmp,
    JSON.stringify({ pid: me.pid, nonce: me.nonce, createdAt: me.createdAt, tip: me.tip }),
    { encoding: 'utf8', mode: 0o600 },
  );
  let stolenTip: string | null = null;
  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let linked = false;
      try {
        linkSync(tmp, lockPath);
        linked = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw new LiveSpendRecordError('LIVE_SPEND_RECORD_FAILED', 'lock acquisition failed');
        }
      }
      if (linked) {
        // Prove the link is still ours: a concurrent takeover may have
        // unlinked and replaced it in between. Losing here fails closed.
        if (verifyLockIdentity(lockPath, me.pid, me.nonce)) {
          return stolenTip;
        }
        continue;
      }
      const action = inspectLockForTakeover(lockPath, chainDigests, chainEmpty, bootstrapSupplied);
      if (action.kind === 'locked') {
        throw new LiveSpendRecordError(
          'LIVE_RECORD_LOCKED',
          'record is owned by another live companion process; refusing to share authorization (stop the other process or wait for its release)',
        );
      }
      stolenTip = action.tip;
    }
    throw new LiveSpendRecordError('LIVE_SPEND_RECORD_FAILED', 'record lock acquisition did not settle');
  } finally {
    try {
      unlinkSync(tmp);
    } catch {
      // ignore cleanup failure
    }
  }
}

/**
 * Inspect a contended lock. Returns 'locked' for a live holder, or clears a
 * stale lock and returns 'stolen' so the caller retries acquisition.
 * Stale-takeover rules: a tip absent from a non-empty chain proves rollback
 * (refuse); an empty chain is ambiguous with truncation, so takeover requires
 * the fresh owner bootstrap approval. Unlinking is conditional on the lock
 * still naming the inspected content — post-acquisition verification makes
 * any residual unlink race fail closed.
 */
type LockInspection =
  | { readonly kind: 'locked' }
  | { readonly kind: 'stolen'; readonly tip: string | null };

function inspectLockForTakeover(
  lockPath: string,
  chainDigests: ReadonlySet<string>,
  chainEmpty: boolean,
  bootstrapSupplied: boolean,
): LockInspection {
  let raw: string;
  try {
    checkFileSafety(lockPath, 'lock');
    raw = readFileSync(lockPath, 'utf8');
  } catch (error) {
    if (error instanceof LiveSpendRecordError) throw error;
    return { kind: 'stolen', tip: null };
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
    return { kind: 'locked' };
  }
  if (chainEmpty) {
    if (!bootstrapSupplied) {
      throw new LiveSpendRecordError(
        'LIVE_SPEND_RECORD_MISSING',
        'stale lock on an empty record without a bootstrap approval; refusing to re-arm (supply a fresh owner approval id to initialize)',
      );
    }
    // Owner attests the ambiguous empty state; take over below.
  } else if (!chainDigests.has(parsed.tip)) {
    throw new LiveSpendRecordError(
      'LIVE_SPEND_RECORD_ROLLBACK',
      'stale lock tip is absent from the record chain: the record was replaced or rolled back; refusing to re-arm (reconcile manually and bootstrap a fresh approval)',
    );
  }
  let current: string;
  try {
    current = readFileSync(lockPath, 'utf8');
  } catch {
    return { kind: 'stolen', tip: parsed.tip };
  }
  if (current !== raw) {
    return { kind: 'stolen', tip: parsed.tip };
  }
  try {
    unlinkSync(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new LiveSpendRecordError('LIVE_RECORD_LOCKED', 'stale lock could not be cleared');
    }
  }
  return { kind: 'stolen', tip: parsed.tip };
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
