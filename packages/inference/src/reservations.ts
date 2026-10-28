// C3-A billing controls: single-use run reservations and a per-provider aggregate quota.
//
// A claim is created under an exclusive lock, only after every pre-flight check has passed and
// strictly before any network call. A claimed run id and a claimed quota slot are NEVER released:
// timeouts, API errors, schema failures and crashes all leave them spent. The files live under
// .proofpilot/ (gitignored) so the accounting survives restarts.
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isValidRunId } from '../../intake/src/consent.ts';

/**
 * LIVE-C3-01 is NOT APPROVED: the effective quota for real network traffic is zero. This is a code
 * constant on purpose (not an environment variable) so no configuration can raise it. Raising it
 * requires an owner-recorded approval and a reviewed commit.
 */
export const APPROVED_LIVE_QUOTA: Readonly<Record<'meta' | 'baseten', number>> = Object.freeze({ meta: 0, baseten: 0 });

export type ReservationErrorCode = 'RUN_ID_INVALID' | 'RUN_ID_SPENT' | 'QUOTA_EXHAUSTED' | 'LOCK_UNAVAILABLE';

export class ReservationError extends Error {
  readonly code: ReservationErrorCode;
  constructor(code: ReservationErrorCode, message: string) {
    super(message);
    this.name = 'ReservationError';
    this.code = code;
  }
}

export type Claim = { providerId: string; runId: string; slot: number; runFile: string };

export type ReservationStore = {
  /** Claim a run id and one provider slot atomically. Throws ReservationError; a refused claim spends nothing. */
  claim(input: { providerId: string; runId: string; quota: number }): Promise<Claim>;
  /** Record a sanitized final status. Best effort: a failure here leaves the claim spent, never released. */
  settle(claim: Claim, info: { status: string; reason: string | null }): Promise<boolean>;
};

const PROVIDER = /^[a-z][a-z0-9-]{0,31}$/;
const LOCK_ATTEMPTS = 200;
const LOCK_WAIT_MS = 10;

export function createReservationStore(root: string): ReservationStore {
  return {
    async claim({ providerId, runId, quota }) {
      if (!isValidRunId(runId)) throw new ReservationError('RUN_ID_INVALID', 'run id is malformed');
      if (!PROVIDER.test(providerId)) throw new ReservationError('RUN_ID_INVALID', 'provider id is malformed');
      if (!Number.isInteger(quota) || quota < 0) throw new ReservationError('QUOTA_EXHAUSTED', 'quota must be a non-negative integer');
      if (quota === 0) throw new ReservationError('QUOTA_EXHAUSTED', `the ${providerId} live quota is 0`);

      const dir = path.join(root, providerId);
      await mkdir(path.join(dir, 'runs'), { recursive: true, mode: 0o700 });
      await mkdir(path.join(dir, 'slots'), { recursive: true, mode: 0o700 });

      // Short exclusive lock so "run id free" and "slot free" are decided together.
      const lock = path.join(dir, '.claim.lock');
      let held = false;
      for (let i = 0; i < LOCK_ATTEMPTS && !held; i++) {
        try {
          await (await open(lock, 'wx', 0o600)).close();
          held = true;
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
          await new Promise((r) => setTimeout(r, LOCK_WAIT_MS));
        }
      }
      if (!held) throw new ReservationError('LOCK_UNAVAILABLE', 'could not obtain the reservation lock (a crashed run may have left it); refusing');
      try {
        const runFile = path.join(dir, 'runs', `${runId}.json`);
        if (await readFile(runFile).then(() => true, () => false)) {
          throw new ReservationError('RUN_ID_SPENT', 'this run id has already been used');
        }
        let slot = 0;
        for (let n = 1; n <= quota && slot === 0; n++) {
          try {
            await (await open(path.join(dir, 'slots', `slot-${String(n).padStart(3, '0')}`), 'wx', 0o600)).close();
            slot = n;
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
          }
        }
        if (slot === 0) throw new ReservationError('QUOTA_EXHAUSTED', `all ${quota} ${providerId} slot(s) are spent`);
        await writeFile(runFile, JSON.stringify({ schemaVersion: 1, runId, providerId, slot, status: 'CLAIMED', claimedAt: new Date().toISOString() }) + '\n', { flag: 'wx', mode: 0o600 });
        return { providerId, runId, slot, runFile };
      } finally {
        await rm(lock, { force: true });
      }
    },

    async settle(claim, info) {
      try {
        const tmp = `${claim.runFile}.tmp`;
        await writeFile(tmp, JSON.stringify({ schemaVersion: 1, runId: claim.runId, providerId: claim.providerId, slot: claim.slot, status: info.status, reason: info.reason, settledAt: new Date().toISOString() }) + '\n', { mode: 0o600 });
        await rename(tmp, claim.runFile);
        return true;
      } catch {
        return false;
      }
    },
  };
}
