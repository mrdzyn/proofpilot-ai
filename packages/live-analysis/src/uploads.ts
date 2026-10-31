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
  | 'UPLOAD_NOT_FOUND';

export type StageResult =
  | Readonly<{ ok: true; uploadId: string; bytes: number }>
  | Readonly<{ ok: false; code: UploadRefusal; detail: string }>;

export type VerifyResult =
  | Readonly<{ ok: true; video: ValidatedVideo }>
  | Readonly<{ ok: false; code: UploadRefusal; detail: string }>;

export interface UploadStoreDeps {
  mediaDeps?: MediaDeps;
  now?: () => Date;
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

  private constructor(stagingRoot: string, deps: UploadStoreDeps) {
    this.stagingRoot = stagingRoot;
    this.#deps = deps;
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

  /** Stage raw request bytes. Replaces (and deletes) any previous staging. */
  async stage(bytes: Uint8Array): Promise<StageResult> {
    await this.discard();
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
      return refusal('UPLOAD_EMPTY', 'upload body is empty');
    }
    if (bytes.length > MAX_STAGED_BYTES) {
      return refusal('UPLOAD_TOO_LARGE', `upload is ${bytes.length} bytes; the limit is ${MAX_STAGED_BYTES} bytes`);
    }
    if (detectContainer(bytes.subarray(0, 64)).kind !== 'mp4') {
      return refusal('NOT_MP4', 'upload bytes are not a supported MP4 (container signature check failed)');
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
    this.#staged = { uploadId, dir };
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
    try {
      const video = await validateVideoFile(path.join(this.#staged.dir, 'upload.mp4'), {
        allowedRoot: this.stagingRoot,
        deps: this.#deps.mediaDeps,
        now: this.#deps.now,
      });
      return { ok: true, video };
    } catch (error) {
      await this.discard();
      return refusal(mediaRefusal(error), 'staged upload failed trusted-boundary validation');
    }
  }

  /** Re-read the exact validated bytes for encoding. */
  async readBytes(video: ValidatedVideo): Promise<Buffer> {
    return readVerifiedVideoBytes(video);
  }

  /** Delete staged bytes. Safe to call when nothing is staged. */
  async discard(): Promise<void> {
    if (this.#staged !== null) {
      await rm(this.#staged.dir, { recursive: true, force: true });
      this.#staged = null;
    }
  }

  /** Delete the whole staging tree (shutdown/revoke path). */
  async destroy(): Promise<void> {
    await this.discard();
    await rm(this.stagingRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}
