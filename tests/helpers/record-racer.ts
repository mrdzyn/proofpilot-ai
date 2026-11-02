// Deterministic cross-process record racer (test helper, not product code).
//
// Each invocation performs exactly one scripted step against a spent-run
// record, then exits. The parent test orchestrates real OS processes and
// asserts outcomes that hold in every interleaving (mutual exclusion makes
// exactly one opener win; losers fail closed with LIVE_RECORD_LOCKED).
//
// Usage:
//   node record-racer.ts <recordPath> <resultPath> <mode> [runId] [approvalId]
//
// Modes:
//   hold-spend   open (bootstrap with approvalId when given) -> record one
//                spend for runId -> hold the lock -> verify still held ->
//                result `ok` -> release -> exit 0.
//                Any LiveSpendRecordError -> result `refused <code>` -> exit 2.
//   hold-open    open (bootstrap with approvalId when given) -> hold ->
//                result `ok` -> release -> exit 0. Same refusal protocol.
//   abandon      open (bootstrap with approvalId when given) -> exit(0)
//                immediately WITHOUT release, leaving a genuine stale lock.
//   Result lines are appended as `<mode> <pid> ok|<code>`.
import { appendFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  LiveSpendRecordError,
  openSpentRecord,
} from '../../packages/live-analysis/src/live-spent-record.ts';

const HOLD_MS = 2500;
const SHA = 'c'.repeat(64);

function usageError(): never {
  console.error('usage: record-racer.ts <recordPath> <resultPath> <mode> [runId] [approvalId]');
  process.exit(99);
}

function parseArgs(): {
  recordPath: string;
  resultPath: string;
  mode: string;
  runId: string;
  approvalId: string | undefined;
} {
  const recordPath = process.argv[2];
  const resultPath = process.argv[3];
  const mode = process.argv[4];
  if (typeof recordPath !== 'string' || typeof resultPath !== 'string' || typeof mode !== 'string') {
    usageError();
  }
  const runIdArg = process.argv[5];
  return {
    recordPath,
    resultPath,
    mode,
    runId: typeof runIdArg === 'string' ? runIdArg : `racer-${String(process.pid)}`,
    approvalId: process.argv[6],
  };
}

const { recordPath, resultPath, mode, runId, approvalId } = parseArgs();

function report(outcome: string): void {
  appendFileSync(resultPath, `${mode} ${String(process.pid)} ${outcome}\n`, { encoding: 'utf8' });
}

async function main(): Promise<void> {
  if (mode === 'abandon') {
    openSpentRecord(recordPath, approvalId === undefined ? {} : { bootstrapApprovalId: approvalId });
    process.exit(0);
  }
  if (mode !== 'hold-spend' && mode !== 'hold-open') {
    usageError();
  }
  try {
    const handle = openSpentRecord(recordPath, approvalId === undefined ? {} : { bootstrapApprovalId: approvalId });
    try {
      if (mode === 'hold-spend') {
        handle.record({ runId, sha256: SHA, kind: 'analyze', spentAt: Date.now() });
      }
      await sleep(HOLD_MS);
      report('ok');
    } finally {
      handle.release();
    }
  } catch (error) {
    if (error instanceof LiveSpendRecordError) {
      report(error.code);
      process.exit(2);
    }
    throw error;
  }
}

await main();
