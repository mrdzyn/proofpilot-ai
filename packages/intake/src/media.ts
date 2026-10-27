// Video intake: trust nothing about a recording until its real container, codec,
// size and duration are verified locally. Nothing here touches the network.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as fsc } from 'node:fs';
import { chmod, copyFile, lstat, mkdtemp, open, realpath, rm } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scrubEnv } from '../../core/src/env.ts';
import { MediaError } from './errors.ts';

/** Product limits (stricter than Meta's API limits). */
export const MEDIA_LIMITS = { maxBytes: 25_000_000, maxDurationSec: 30 } as const;
/** Cap for a raw Playwright WebM before local conversion. */
export const WEBM_MAX_INPUT_BYTES = 100_000_000;
const MAX_DIMENSION = 8192;
const HEADER_BYTES = 64;
const DURATION_SPREAD_TOLERANCE_SEC = 1;

const MP4_BRANDS = new Set(['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ']);
const MP4_EXTENSIONS = new Set(['.mp4', '.m4v']);
const WEBM_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];

declare const validatedBrand: unique symbol;

/** Only produced by {@link validateVideoFile}; the analysis step re-verifies its bytes anyway. */
export type ValidatedVideo = {
  readonly [validatedBrand]: true;
  /** Real (symlink-free) absolute path at validation time. */
  readonly path: string;
  readonly basename: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly container: 'mp4';
  readonly brand: string;
  readonly videoCodec: 'h264';
  readonly durationSec: number;
  readonly width: number;
  readonly height: number;
  readonly hasAudio: boolean;
  readonly validatedAt: string;
};

export type ProbedStream = {
  codecType: string | null;
  codecName: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
};
export type MediaProbe = {
  formatName: string | null;
  formatDurationSec: number | null;
  streams: ProbedStream[];
};
export type MediaDeps = {
  probe(file: string): Promise<MediaProbe>;
  /** `ok` only if a full decode pass produced no errors. */
  decodeCheck(file: string): Promise<{ ok: boolean; detail: string }>;
};
export type MediaLimits = { maxBytes: number; maxDurationSec: number };
type ValidateOptions = {
  /** Reject any file whose real path is not inside this directory. */
  allowedRoot?: string;
  deps?: MediaDeps;
  /** Limits can only be tightened, never raised above {@link MEDIA_LIMITS}. */
  limits?: Partial<MediaLimits>;
  now?: () => Date;
};

// ---------- container signature ----------

export type Container =
  | { kind: 'mp4'; brand: string }
  | { kind: 'webm' }
  | { kind: 'iso-other'; brand: string }
  | { kind: 'unknown' };

export function detectContainer(header: Uint8Array): Container {
  if (header.length >= 12 && String.fromCharCode(...header.subarray(4, 8)) === 'ftyp') {
    const brand = String.fromCharCode(...header.subarray(8, 12));
    return MP4_BRANDS.has(brand) ? { kind: 'mp4', brand } : { kind: 'iso-other', brand };
  }
  if (header.length >= 4 && WEBM_MAGIC.every((b, i) => header[i] === b)) return { kind: 'webm' };
  return { kind: 'unknown' };
}

// ---------- pure probe evaluation (no ffmpeg needed to test) ----------

export function evaluateProbe(
  probe: MediaProbe,
  limits: MediaLimits = MEDIA_LIMITS,
): { width: number; height: number; durationSec: number; hasAudio: boolean } {
  const formats = (probe.formatName ?? '').split(',');
  if (!formats.includes('mp4')) {
    throw new MediaError('UNSUPPORTED_TYPE', `probe reports container "${probe.formatName ?? 'unknown'}", not MP4`);
  }
  const videos = probe.streams.filter((s) => s.codecType === 'video');
  if (videos.length === 0) throw new MediaError('NO_VIDEO_STREAM', 'file has no video stream');
  if (videos.length > 1) throw new MediaError('AMBIGUOUS_METADATA', 'file has multiple video streams');
  const video = videos[0]!;
  if (video.codecName !== 'h264') {
    throw new MediaError('UNSUPPORTED_CODEC', `video codec "${video.codecName ?? 'unknown'}" is not supported; H.264 is required`);
  }
  const { width, height } = video;
  const dimOk = (n: number | null): n is number => n !== null && Number.isInteger(n) && n > 0 && n <= MAX_DIMENSION;
  if (!dimOk(width) || !dimOk(height)) {
    throw new MediaError('METADATA_MISSING', 'video dimensions are missing or out of range');
  }
  const durations = [probe.formatDurationSec, video.durationSec].filter((d): d is number => d !== null);
  if (durations.length === 0 || durations.some((d) => d <= 0)) {
    throw new MediaError('METADATA_MISSING', 'video duration is missing or not positive');
  }
  if (Math.max(...durations) - Math.min(...durations) > DURATION_SPREAD_TOLERANCE_SEC) {
    throw new MediaError('AMBIGUOUS_METADATA', 'container and stream durations disagree');
  }
  const durationSec = Math.max(...durations);
  if (durationSec > limits.maxDurationSec) {
    throw new MediaError('TOO_LONG', `video is ${durationSec.toFixed(1)} s; the limit is ${limits.maxDurationSec} s`);
  }
  return { width, height, durationSec, hasAudio: probe.streams.some((s) => s.codecType === 'audio') };
}

// ---------- tool execution ----------

type RunResult = { code: number; stdout: string; stderr: string };

function run(cmd: string, args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8', env: scrubEnv(process.env) },
      (err, stdout, stderr) => {
        if (!err) return resolve({ code: 0, stdout, stderr });
        const e = err as NodeJS.ErrnoException & { killed?: boolean };
        if (e.code === 'ENOENT') {
          return reject(new MediaError('TOOL_UNAVAILABLE', `${cmd} is not installed or not on PATH`));
        }
        if (e.killed) return reject(new MediaError('CORRUPT_MEDIA', `${cmd} did not finish within ${timeoutMs} ms`));
        resolve({ code: typeof e.code === 'number' ? e.code : 1, stdout: stdout ?? '', stderr: stderr ?? '' });
      },
    );
  });
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : null;
};

export const defaultMediaDeps: MediaDeps = {
  async probe(file) {
    const r = await run(
      'ffprobe',
      ['-v', 'error', '-protocol_whitelist', 'file', '-print_format', 'json', '-show_format', '-show_streams', file],
      20_000,
    );
    if (r.code !== 0) throw new MediaError('CORRUPT_MEDIA', 'ffprobe could not read the file');
    let json: any;
    try {
      json = JSON.parse(r.stdout);
    } catch {
      throw new MediaError('CORRUPT_MEDIA', 'ffprobe returned unreadable metadata');
    }
    return {
      formatName: typeof json?.format?.format_name === 'string' ? json.format.format_name : null,
      formatDurationSec: num(json?.format?.duration),
      streams: (Array.isArray(json?.streams) ? json.streams : []).map((s: any) => ({
        codecType: typeof s?.codec_type === 'string' ? s.codec_type : null,
        codecName: typeof s?.codec_name === 'string' ? s.codec_name : null,
        durationSec: num(s?.duration),
        width: num(s?.width),
        height: num(s?.height),
      })),
    };
  },
  async decodeCheck(file) {
    const r = await run(
      'ffmpeg',
      ['-nostdin', '-v', 'error', '-protocol_whitelist', 'file', '-i', file, '-map', '0:v:0', '-f', 'null', '-'],
      60_000,
    );
    // ffmpeg exits 0 on many truncated/corrupt files; any decoder complaint on stderr counts.
    const detail = r.stderr.trim().slice(0, 200);
    return { ok: r.code === 0 && detail === '', detail };
  },
};

// ---------- safe file access ----------

async function withPrivateTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'proofpilot-media-')); // created 0700
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function assertRawPath(raw: unknown): asserts raw is string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 4096 || raw.includes('\0')) {
    throw new MediaError('INVALID_PATH', 'path must be a non-empty string without NUL bytes');
  }
  if (raw.split(/[\\/]/).includes('..')) throw new MediaError('INVALID_PATH', 'path traversal ("..") is not allowed');
}

const within = (child: string, root: string) => child === root || child.startsWith(root + path.sep);

/** Resolve to a real path; refuse a symlink target and anything outside `allowedRoot`. */
async function resolveSafeFile(raw: unknown, allowedRoot?: string): Promise<string> {
  assertRawPath(raw);
  const abs = path.resolve(raw);
  // Containment is decided lexically first, before any filesystem access, so a path outside
  // the permitted directory cannot be used to probe whether files exist there.
  let rootReal: string | undefined;
  if (allowedRoot !== undefined) {
    const rootLexical = path.resolve(allowedRoot);
    rootReal = await realpath(rootLexical).catch(() => {
      throw new MediaError('UNSAFE_PATH', 'allowed root does not exist');
    });
    if (!within(abs, rootLexical) && !within(abs, rootReal)) {
      throw new MediaError('UNSAFE_PATH', 'file is outside the permitted media directory');
    }
  }
  let info;
  try {
    info = await lstat(abs);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new MediaError('FILE_NOT_FOUND', `file not found: ${path.basename(abs)}`);
    }
    throw new MediaError('FILE_UNREADABLE', `cannot read ${path.basename(abs)}`);
  }
  if (info.isSymbolicLink()) throw new MediaError('UNSAFE_PATH', 'symbolic links are not accepted');
  const real = await realpath(abs);
  // Re-check on the resolved path: an intermediate symlink must not lead out of the root.
  if (rootReal !== undefined && !within(real, rootReal)) {
    throw new MediaError('UNSAFE_PATH', 'file is outside the permitted media directory');
  }
  return real;
}

async function openNoFollow(real: string): Promise<FileHandle> {
  try {
    return await open(real, fsc.O_RDONLY | fsc.O_NOFOLLOW);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ELOOP') throw new MediaError('UNSAFE_PATH', 'symbolic links are not accepted');
    throw new MediaError('FILE_UNREADABLE', `cannot open ${path.basename(real)}`);
  }
}

async function readHeader(handle: FileHandle, size: number): Promise<Buffer> {
  const buf = Buffer.alloc(Math.min(HEADER_BYTES, size));
  await handle.read(buf, 0, buf.length, 0);
  return buf;
}

/** Copy the open file into `dest` while hashing, so what is probed is exactly what was hashed. */
async function copyAndHash(handle: FileHandle, size: number, maxBytes: number, dest: string): Promise<string> {
  const out = await open(dest, 'wx', 0o600);
  const hash = createHash('sha256');
  const buf = Buffer.allocUnsafe(1 << 20);
  let total = 0;
  try {
    for (;;) {
      const { bytesRead } = await handle.read(buf, 0, buf.length, total);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > maxBytes) throw new MediaError('TOO_LARGE', 'file grew beyond the size limit while being read');
      hash.update(buf.subarray(0, bytesRead));
      await out.write(buf, 0, bytesRead);
    }
  } finally {
    await out.close();
  }
  if (total !== size) throw new MediaError('MEDIA_CHANGED', 'file changed while it was being read');
  return hash.digest('hex');
}

// ---------- public API ----------

/**
 * Verify that `filePath` is a real, supported, in-limit MP4 recording.
 * Fails closed with a typed {@link MediaError}; never makes a network call.
 */
export async function validateVideoFile(filePath: string, options: ValidateOptions = {}): Promise<ValidatedVideo> {
  const limits: MediaLimits = {
    maxBytes: Math.min(options.limits?.maxBytes ?? MEDIA_LIMITS.maxBytes, MEDIA_LIMITS.maxBytes),
    maxDurationSec: Math.min(options.limits?.maxDurationSec ?? MEDIA_LIMITS.maxDurationSec, MEDIA_LIMITS.maxDurationSec),
  };
  const deps = options.deps ?? defaultMediaDeps;
  const real = await resolveSafeFile(filePath, options.allowedRoot);
  const handle = await openNoFollow(real);
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new MediaError('NOT_A_FILE', 'path is not a regular file');
    if (info.size === 0) throw new MediaError('EMPTY_FILE', 'file is empty');
    if (info.size > limits.maxBytes) {
      throw new MediaError('TOO_LARGE', `file is ${info.size} bytes; the limit is ${limits.maxBytes} bytes`);
    }

    const container = detectContainer(await readHeader(handle, info.size));
    if (container.kind === 'webm') {
      throw new MediaError('WEBM_REQUIRES_CONVERSION', 'WebM is not accepted by Meta; convert to MP4 locally first');
    }
    if (container.kind !== 'mp4') {
      throw new MediaError('UNSUPPORTED_TYPE', 'file is not a supported MP4 (container signature check failed)');
    }
    if (!MP4_EXTENSIONS.has(path.extname(real).toLowerCase())) {
      throw new MediaError('TYPE_MISMATCH', `file content is MP4 but the extension is "${path.extname(real) || '(none)'}"`);
    }

    return await withPrivateTempDir(async (dir) => {
      const copy = path.join(dir, 'input.mp4');
      const sha256 = await copyAndHash(handle, info.size, limits.maxBytes, copy);
      const decoded = evaluateProbe(await deps.probe(copy), limits);
      const decode = await deps.decodeCheck(copy);
      if (!decode.ok) {
        throw new MediaError('CORRUPT_MEDIA', `decode check failed${decode.detail ? `: ${decode.detail}` : ''}`);
      }
      return {
        path: real,
        basename: path.basename(real),
        bytes: info.size,
        sha256,
        container: 'mp4',
        brand: container.brand,
        videoCodec: 'h264',
        durationSec: decoded.durationSec,
        width: decoded.width,
        height: decoded.height,
        hasAudio: decoded.hasAudio,
        validatedAt: (options.now?.() ?? new Date()).toISOString(),
      } as ValidatedVideo;
    });
  } finally {
    await handle.close();
  }
}

/**
 * Re-read a validated video and confirm the bytes are still exactly what was
 * validated (size, signature, SHA-256). Returns the bytes to upload, so the
 * transmitted content is the verified content.
 */
export async function readVerifiedVideoBytes(video: ValidatedVideo): Promise<Buffer> {
  const real = await resolveSafeFile(video.path);
  const handle = await openNoFollow(real);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size !== video.bytes || info.size > MEDIA_LIMITS.maxBytes) {
      throw new MediaError('MEDIA_CHANGED', 'video size differs from the validated size');
    }
    const bytes = Buffer.alloc(info.size);
    let off = 0;
    while (off < bytes.length) {
      const { bytesRead } = await handle.read(bytes, off, bytes.length - off, off);
      if (bytesRead === 0) break;
      off += bytesRead;
    }
    if (off !== bytes.length) throw new MediaError('MEDIA_CHANGED', 'video changed while being read');
    if (detectContainer(bytes.subarray(0, HEADER_BYTES)).kind !== 'mp4') {
      throw new MediaError('MEDIA_CHANGED', 'video is no longer a supported MP4');
    }
    if (createHash('sha256').update(bytes).digest('hex') !== video.sha256) {
      throw new MediaError('MEDIA_CHANGED', 'video bytes differ from the validated SHA-256');
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

type ConvertOptions = ValidateOptions & {
  /** Transcoder; injectable for tests. Defaults to local ffmpeg. */
  transcode?: (input: string, output: string) => Promise<{ ok: boolean; detail: string }>;
};

const defaultTranscode: NonNullable<ConvertOptions['transcode']> = async (input, output) => {
  const r = await run(
    'ffmpeg',
    [
      '-nostdin', '-v', 'error', '-n', '-protocol_whitelist', 'file', '-i', input,
      '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '23',
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-fps_mode', 'cfr', '-r', '25',
      '-movflags', '+faststart', output,
    ],
    120_000,
  );
  return { ok: r.code === 0, detail: r.stderr.trim().slice(0, 200) };
};

/**
 * Convert a locally recorded WebM (e.g. from Playwright) into an MP4 that
 * passes {@link validateVideoFile}. The destination is created exclusively
 * (no overwrite) and removed again if the result fails validation. All
 * intermediate files live in a private temp dir that is always deleted.
 */
export async function convertWebmToMp4(inputPath: string, outputPath: string, options: ConvertOptions = {}): Promise<ValidatedVideo> {
  const realIn = await resolveSafeFile(inputPath, options.allowedRoot);
  assertRawPath(outputPath);
  const dest = path.resolve(outputPath);
  if (path.extname(dest).toLowerCase() !== '.mp4') throw new MediaError('INVALID_PATH', 'output must end in .mp4');
  const destDir = await realpath(path.dirname(dest)).catch(() => {
    throw new MediaError('FILE_NOT_FOUND', 'output directory does not exist');
  });
  if (options.allowedRoot !== undefined) {
    const rootReal = await realpath(path.resolve(options.allowedRoot));
    if (!within(destDir, rootReal)) throw new MediaError('UNSAFE_PATH', 'output is outside the permitted media directory');
  }
  const finalDest = path.join(destDir, path.basename(dest));
  if (await lstat(finalDest).then(() => true, () => false)) {
    throw new MediaError('OUTPUT_EXISTS', `refusing to overwrite ${path.basename(finalDest)}`);
  }

  const handle = await openNoFollow(realIn);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size === 0) throw new MediaError('NOT_A_FILE', 'input is not a non-empty regular file');
    if (info.size > WEBM_MAX_INPUT_BYTES) throw new MediaError('TOO_LARGE', `input exceeds ${WEBM_MAX_INPUT_BYTES} bytes`);
    if (detectContainer(await readHeader(handle, info.size)).kind !== 'webm') {
      throw new MediaError('UNSUPPORTED_TYPE', 'input is not a WebM file (container signature check failed)');
    }
    await withPrivateTempDir(async (dir) => {
      const src = path.join(dir, 'input.webm');
      await copyAndHash(handle, info.size, WEBM_MAX_INPUT_BYTES, src);
      const out = path.join(dir, 'output.mp4');
      const result = await (options.transcode ?? defaultTranscode)(src, out);
      if (!result.ok) throw new MediaError('CONVERSION_FAILED', `ffmpeg conversion failed${result.detail ? `: ${result.detail}` : ''}`);
      try {
        await copyFile(out, finalDest, fsc.COPYFILE_EXCL);
      } catch {
        throw new MediaError('OUTPUT_EXISTS', `could not create ${path.basename(finalDest)} exclusively`);
      }
      await chmod(finalDest, 0o600);
    });
  } finally {
    await handle.close();
  }
  try {
    return await validateVideoFile(finalDest, options);
  } catch (e) {
    await rm(finalDest, { force: true });
    throw e;
  }
}
