/**
 * UI-C3-02-D9-I1: durable, tamper-evident live-attempt spent-run record.
 *
 * The in-memory live ledger (`live-attempts.ts`) resets on restart, so a
 * restart must never recreate spent authorization. Every authorized provider
 * send is appended here — hash-chained JSONL, one line per spent attempt —
 * at the send boundary, before the single POST. The effective live budget is
 * always `max(0, configured - recorded)`.
 *
 * Fail-closed rules:
 * - a missing file is created empty (mode 0600) at open;
 * - a corrupt file (bad JSON, bad shape, broken chain) refuses to open, so
 *   the companion cannot start live-armed on tampered state;
 * - entries never name credentials, request bodies, or provider text — run
 *   id, media SHA-256, action kind, and timestamp only.
 *
 * Pure except for the named record file: no env, no secrets, no network.
 */
import { appendFileSync, openSync, closeSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import type { MockPermitKind } from './mock-permits.ts';

/** Thrown when the record cannot be opened, verified, or appended. Fail closed. */
export class LiveSpendRecordError extends Error {
  readonly code = 'LIVE_SPEND_RECORD_FAILED' as const;
  constructor(detail: string) {
    super(`live spent-run record unavailable: ${detail}`);
    this.name = 'LiveSpendRecordError';
  }
}

export interface SpentAttemptEntry {
  readonly runId: string;
  readonly sha256: string;
  readonly kind: MockPermitKind;
  /** Milliseconds since epoch, from the companion clock. */
  readonly spentAt: number;
}

interface ChainedEntry extends SpentAttemptEntry {
  readonly v: 1;
  readonly prev: string;
  readonly digest: string;
}

const GENESIS = 'GENESIS-LIVE-SPEND-RECORD-v1';

function digestOf(prev: string, entry: SpentAttemptEntry): string {
  return createHash('sha256')
    .update(`${prev}\n${entry.runId}\n${entry.sha256}\n${entry.kind}\n${entry.spentAt}`, 'utf8')
    .digest('hex');
}

function checkShape(value: unknown): value is ChainedEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return v['v'] === 1 &&
    typeof v['runId'] === 'string' && (v['runId'] as string).length > 0 &&
    typeof v['sha256'] === 'string' && /^[0-9a-f]{64}$/.test(v['sha256'] as string) &&
    (v['kind'] === 'analyze' || v['kind'] === 'propose') &&
    Number.isSafeInteger(v['spentAt']) && (v['spentAt'] as number) >= 0 &&
    typeof v['prev'] === 'string' &&
    typeof v['digest'] === 'string';
}

/** Append-only spent-run record handle. Counts are fixed at open. */
export interface LiveSpentRecord {
  /** Number of recorded spent attempts for the action. */
  countSpent(kind: MockPermitKind): number;
  /**
   * Record one authorized send. Throws LiveSpendRecordError when the append
   * fails; the caller must treat the send as failed and poison the live path.
   */
  record(entry: SpentAttemptEntry): void;
}

/**
 * Open (creating when missing) and verify the spent-run record at `path`.
 * Throws LiveSpendRecordError on corrupt state — the caller must refuse to
 * start live-armed.
 */
export function openSpentRecord(path: string): LiveSpentRecord {
  if (typeof path !== 'string' || path.length === 0) {
    throw new LiveSpendRecordError('record path is empty');
  }
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new LiveSpendRecordError('record file is not readable');
    }
    try {
      const fd = openSync(path, 'wx', 0o600);
      closeSync(fd);
    } catch {
      throw new LiveSpendRecordError('record file cannot be created');
    }
    raw = '';
  }
  let analyses = 0;
  let proposals = 0;
  let prev = GENESIS;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new LiveSpendRecordError('record contains a malformed line');
    }
    if (!checkShape(parsed)) {
      throw new LiveSpendRecordError('record contains a malformed entry');
    }
    const expected = digestOf(parsed.prev, {
      runId: parsed.runId,
      sha256: parsed.sha256,
      kind: parsed.kind,
      spentAt: parsed.spentAt,
    });
    if (parsed.prev !== prev || parsed.digest !== expected) {
      throw new LiveSpendRecordError('record chain is broken');
    }
    prev = parsed.digest;
    if (parsed.kind === 'analyze') analyses += 1;
    else proposals += 1;
  }
  let tip = prev;
  return {
    countSpent(kind: MockPermitKind): number {
      return kind === 'analyze' ? analyses : proposals;
    },
    record(entry: SpentAttemptEntry): void {
      if (typeof entry.runId !== 'string' || entry.runId.length === 0 ||
        typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256) ||
        (entry.kind !== 'analyze' && entry.kind !== 'propose') ||
        !Number.isSafeInteger(entry.spentAt) || entry.spentAt < 0) {
        throw new LiveSpendRecordError('refused to record a malformed entry');
      }
      const chained: ChainedEntry = {
        v: 1,
        runId: entry.runId,
        sha256: entry.sha256,
        kind: entry.kind,
        spentAt: entry.spentAt,
        prev: tip,
        digest: digestOf(tip, entry),
      };
      try {
        appendFileSync(path, `${JSON.stringify(chained)}\n`, { encoding: 'utf8', mode: 0o600 });
      } catch {
        throw new LiveSpendRecordError('record append failed');
      }
      tip = chained.digest;
      if (entry.kind === 'analyze') analyses += 1;
      else proposals += 1;
    },
  };
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
