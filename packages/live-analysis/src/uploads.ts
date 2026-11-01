/**
 * UI-C3-02-I2: bounded staged-upload store for the offline companion.
 *
 * Bytes land in a private 0700 staging directory (one file at a time; a new
 * upload replaces and deletes the previous one), are validated with the
 * audited intake gate (`validateVideoFile`, H.264 MP4, ≤25 MB, ≤30 s), and
 * are re-read with `readVerifiedVideoBytes` so the encoded content is the
 * verified content. Every exit — success, refusal, cancel, timeout — deletes
 * staged bytes. No network, no credentials, no persistence beyond staging.
 */
import { createHash, randomBytes } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  detectContainer,
  readVerifiedVideoBytes,
  validateVideoFile,
  type MediaDeps,
  type ValidatedVideo,
} from '../../intake/src/media.ts';
import { MediaError } from '../../intake/src/errors.ts';

/** Request-body ceiling from the approved architecture (upload path). */
export const MAX_STAGED_BYTES = 30_000_000;

export type UploadRefusal =
  | 'UPLOAD_TOO_LARGE'
  | 'UPLOAD_EMPTY'
  | 'NOT_MP4'
  | 'MEDIA_INVALID'
  | 'UPLOAD_NOT_FOUND'
  | 'STALE_OWNER';

export type StageResult =
  | Readonly<{ ok: true; uploadId: string; bytes: number }>
  | Readonly<{ ok: false; code: UploadRefusal; detail: string }>;

/**
 * Ownership ticket for one staging operation. Captured synchronously before
 * the first await; a revoked-then-superseded operation resumes with a stale
 * ticket and must not mutate the store.
 */
export interface StageTicket {
  readonly generation: number;
  readonly priorUploadId: string | null;
}

export type VerifyResult =
  | Readonly<{ ok: true; video: ValidatedVideo }>
  | Readonly<{ ok: false; code: UploadRefusal; detail: string }>;

export interface UploadStoreDeps {
  mediaDeps?: MediaDeps;
  now?: () => Date;
  /**
   * Staged-bytes removal. Defaults to recursive force `rm`; tests inject a
   * deferred gate here to hold a real deletion pending across revocation
   * and republication. Own-droppings and whole-tree destroy keep direct
   * `rm` — only tracked-staging deletions go through this seam.
   */
  removeTree?: (dir: string) => Promise<void>;
}

function refusal(code: UploadRefusal, detail: string): StageResult & VerifyResult {
  return { ok: false, code, detail };
}

/** Map intake diagnostics to stable public codes without leaking tool stderr. */
function mediaRefusal(error: unknown): UploadRefusal {
  if (error instanceof MediaError) {
    switch (error.code) {
      case 'TOO_LARGE': return 'UPLOAD_TOO_LARGE';
      case 'EMPTY_FILE': return 'UPLOAD_EMPTY';
      case 'WEBM_REQUIRES_CONVERSION':
      case 'UNSUPPORTED_TYPE':
      case 'TYPE_MISMATCH': return 'NOT_MP4';
      default: return 'MEDIA_INVALID';
    }
  }
  return 'MEDIA_INVALID';
}

/** Prefix for companion staging roots; SIGKILL/abnormal exits cannot clean up. */
export const STAGING_PREFIX = 'pp-live-upload-';
/** Staging roots older than this at startup are treated as crash leftovers. */
export const STALE_STAGING_MS = 24 * 60 * 60_000;

/**
 * Best-effort recovery for abnormal shutdowns (SIGKILL, power loss): remove
 * staging roots older than `maxAgeMs` under `baseDir`. Bounded (prefix match,
 * mtime gate, removal cap); never throws. Documented: only SIGKILL-class
 * deaths can leave these; SIGINT/SIGTERM/quit/revoke paths delete eagerly.
 */
export async function sweepStaleStagingDirs(
  baseDir: string = os.tmpdir(),
  maxAgeMs: number = STALE_STAGING_MS,
  now: number = Date.now(),
  cap = 100,
): Promise<number> {
  let removed = 0;
  let entries: string[];
  try {
    entries = await readdir(baseDir);
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (removed >= cap) break;
    if (!entry.startsWith(STAGING_PREFIX)) continue;
    const full = path.join(baseDir, entry);
    try {
      const info = await stat(full);
      if (!info.isDirectory() || now - info.mtimeMs < maxAgeMs) continue;
      await rm(full, { recursive: true, force: true });
      removed += 1;
    } catch {
      /* best effort only */
    }
  }
  return removed;
}

export class StagedUploads {
  readonly stagingRoot: string;
  readonly #deps: UploadStoreDeps;
  #staged: { uploadId: string; dir: string } | null = null;
  /**
   * Ownership generation. Bumped only by stage() publishing new bytes and
   * by invalidateStaged(); a ticketed operation re-validates after each
   * await, so a revoked operation resuming late can never delete, replace,
   * or publish over newer staging. Plain deletes never bump: revocation
   * retires tickets synchronously first, and an async delete must not stale
   * a newer ticket cut after that retirement.
   */
  #generation = 0;

  readonly #removeTree: (dir: string) => Promise<void>;

  private constructor(stagingRoot: string, deps: UploadStoreDeps) {
    this.stagingRoot = stagingRoot;
    this.#deps = deps;
    this.#removeTree = deps.removeTree ?? ((dir: string) => rm(dir, { recursive: true, force: true }));
  }

  static async create(deps?: UploadStoreDeps): Promise<StagedUploads> {
    const root = await mkdtemp(path.join(os.tmpdir(), STAGING_PREFIX));
    await chmod(root, 0o700);
    await sweepStaleStagingDirs(os.tmpdir()).catch(() => undefined);
    return new StagedUploads(root, deps ?? {});
  }

  /** For tests: an already-existing empty directory (never a user path). */
  static openDir(stagingRoot: string, deps?: UploadStoreDeps): StagedUploads {
    return new StagedUploads(stagingRoot, deps ?? {});
  }

  /**
   * Capture a staging ownership ticket synchronously. The caller must do this
   * in the same synchronous critical section where it acquires the
   * single-flight slot, before the first await.
   */
  createStageTicket(): StageTicket {
    return { generation: this.#generation, priorUploadId: this.#staged?.uploadId ?? null };
  }

  /**
   * Synchronously retire all outstanding tickets without touching bytes.
   * Revocation calls this first so a suspended staging operation resumes
   * stale even when the async delete has not run yet; the next epoch's
   * staging then proceeds on a newer generation.
   */
  invalidateStaged(): void {
    this.#generation += 1;
  }

  /**
   * Stage raw request bytes. Replaces (and deletes) the exact prior staging
   * named by the ticket; any generation or identity drift before or during
   * the mutation refuses with STALE_OWNER and touches nothing, cleaning up
   * only the operation's own droppings. Unticketed callers keep the legacy
   * replace semantics (no concurrent owner can exist for them).
   */
  async stage(bytes: Uint8Array, ticket?: StageTicket): Promise<StageResult> {
    let expected: string | null | undefined = ticket?.priorUploadId;
    const owned = (): boolean =>
      expected === undefined ||
      (ticket !== undefined &&
        ticket.generation === this.#generation &&
        (this.#staged?.uploadId ?? null) === expected);
    if (!owned()) {
      return refusal('STALE_OWNER', 'staging ownership changed (revoked); refusing to mutate');
    }
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
      return refusal('UPLOAD_EMPTY', 'upload body is empty');
    }
    if (bytes.length > MAX_STAGED_BYTES) {
      return refusal('UPLOAD_TOO_LARGE', `upload is ${bytes.length} bytes; the limit is ${MAX_STAGED_BYTES} bytes`);
    }
    if (detectContainer(bytes.subarray(0, 64)).kind !== 'mp4') {
      return refusal('NOT_MP4', 'upload bytes are not a supported MP4 (container signature check failed)');
    }
    await this.#removeStagedUnchecked();
    expected = null;
    if (!owned()) {
      return refusal('STALE_OWNER', 'staging ownership changed (revoked); refusing to mutate');
    }
    const uploadId = `up-${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}-${randomBytes(4).toString('hex')}`;
    const dir = path.join(this.stagingRoot, uploadId);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    try {
      await writeFile(path.join(dir, 'upload.mp4'), bytes, { mode: 0o600 });
    } catch {
      await rm(dir, { recursive: true, force: true });
      return refusal('MEDIA_INVALID', 'staged bytes could not be written');
    }
    if (!owned()) {
      await rm(dir, { recursive: true, force: true });
      return refusal('STALE_OWNER', 'staging ownership changed (revoked); refusing to publish');
    }
    this.#staged = { uploadId, dir };
    this.#generation += 1;
    return { ok: true, uploadId, bytes: bytes.length };
  }

  /**
   * Run the trusted-boundary validation (format, dimensions, duration, size,
   * decodability) and SHA-256 recomputation over the staged file.
   */
  async verify(uploadId: string): Promise<VerifyResult> {
    if (this.#staged === null || this.#staged.uploadId !== uploadId) {
      return refusal('UPLOAD_NOT_FOUND', 'no such staged upload');
    }
    const stagedId = this.#staged.uploadId;
    try {
      const video = await validateVideoFile(path.join(this.#staged.dir, 'upload.mp4'), {
        allowedRoot: this.stagingRoot,
        deps: this.#deps.mediaDeps,
        now: this.#deps.now,
      });
      return { ok: true, video };
    } catch (error) {
      await this.discardIfStaged(stagedId);
      return refusal(mediaRefusal(error), 'staged upload failed trusted-boundary validation');
    }
  }

  /** Re-read the exact validated bytes for encoding. */
  async readBytes(video: ValidatedVideo): Promise<Buffer> {
    return readVerifiedVideoBytes(video);
  }

  /** Currently staged upload id, or null when nothing is staged. */
  currentUploadId(): string | null {
    return this.#staged?.uploadId ?? null;
  }

  /**
   * Unchecked removal: deletes the staged dir without retiring tickets.
   * Captures the exact record first and clears the field after the await
   * only when it still names that record — a newer publication that landed
   * while the deletion was pending is never erased.
   */
  async #removeStagedUnchecked(): Promise<void> {
    const doomed = this.#staged;
    if (doomed === null) return;
    await this.#removeTree(doomed.dir);
    if (this.#staged === doomed) this.#staged = null;
  }

  /**
   * Delete staged bytes. Safe to call when nothing is staged. Never bumps
   * the generation: revocation retires tickets synchronously via
   * invalidateStaged(), so an async delete must not stale a newer ticket
   * cut after that invalidation (it would refuse a live new-epoch upload).
   */
  async discard(): Promise<void> {
    if (this.#staged !== null) {
      await this.#removeStagedUnchecked();
    }
  }

  /**
   * Delete staged bytes only when they are still the expected staging
   * identity. A newer staging (different uploadId) is left untouched, so a
   * stale run or revoke can never delete a newer epoch's bytes. A null
   * expectation only succeeds when nothing is staged.
   */
  async discardIfStaged(expectedUploadId: string | null): Promise<boolean> {
    const doomed = this.#staged;
    if (doomed === null) return expectedUploadId === null;
    if (expectedUploadId === null || doomed.uploadId !== expectedUploadId) return false;
    await this.#removeTree(doomed.dir);
    if (this.#staged === doomed) this.#staged = null;
    return true;
  }

  /** Delete the whole staging tree (shutdown/revoke path). */
  async destroy(): Promise<void> {
    await this.discard();
    await rm(this.stagingRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}
