import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, chmodSync, mkdirSync, readdirSync, rmSync, statSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  convertWebmToMp4,
  detectContainer,
  evaluateProbe,
  MEDIA_LIMITS,
  MediaError,
  readVerifiedVideoBytes,
  validateVideoFile,
  type MediaDeps,
} from '../../packages/intake/src/index.ts';
import { fakeDeps, fakeMp4Bytes, goodProbe, makeValidatedVideo, tempDir } from '../helpers.ts';

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof MediaError, `expected MediaError, got ${e}`);
    return e.code;
  }
  return 'NO_ERROR';
};
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

test('detectContainer recognises MP4 brands, WebM, and rejects everything else', () => {
  assert.deepEqual(detectContainer(fakeMp4Bytes()), { kind: 'mp4', brand: 'isom' });
  assert.equal(detectContainer(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3])).kind, 'webm');
  const qt = fakeMp4Bytes();
  qt.write('qt  ', 8, 'latin1');
  assert.deepEqual(detectContainer(qt), { kind: 'iso-other', brand: 'qt  ' });
  for (const junk of [Buffer.from('%PDF-1.7 ...........'), Buffer.from('\x89PNG\r\n\x1a\n........'), Buffer.alloc(3), Buffer.alloc(0)]) {
    assert.equal(detectContainer(junk).kind, 'unknown');
  }
});

test('evaluateProbe accepts a good H.264 MP4 and reports audio presence', () => {
  assert.deepEqual(evaluateProbe(goodProbe()), { width: 390, height: 844, durationSec: 10, hasAudio: false });
  const withAudio = goodProbe({ streams: [...goodProbe().streams, { codecType: 'audio', codecName: 'aac', durationSec: 10, width: null, height: null }] });
  assert.equal(evaluateProbe(withAudio).hasAudio, true);
  assert.equal(evaluateProbe(goodProbe({ formatDurationSec: 30, streams: [{ ...goodProbe().streams[0]!, durationSec: 30 }] })).durationSec, 30);
});

test('evaluateProbe rejects every ambiguous or unsupported metadata shape', () => {
  const v = goodProbe().streams[0]!;
  const cases: Array<[string, Parameters<typeof evaluateProbe>[0], string]> = [
    ['not an mp4 container', goodProbe({ formatName: 'matroska,webm' }), 'UNSUPPORTED_TYPE'],
    ['null container', goodProbe({ formatName: null }), 'UNSUPPORTED_TYPE'],
    ['no video stream', goodProbe({ streams: [] }), 'NO_VIDEO_STREAM'],
    ['audio only', goodProbe({ streams: [{ codecType: 'audio', codecName: 'aac', durationSec: 5, width: null, height: null }] }), 'NO_VIDEO_STREAM'],
    ['two video streams', goodProbe({ streams: [v, v] }), 'AMBIGUOUS_METADATA'],
    ['hevc', goodProbe({ streams: [{ ...v, codecName: 'hevc' }] }), 'UNSUPPORTED_CODEC'],
    ['null codec', goodProbe({ streams: [{ ...v, codecName: null }] }), 'UNSUPPORTED_CODEC'],
    ['missing width', goodProbe({ streams: [{ ...v, width: null }] }), 'METADATA_MISSING'],
    ['zero height', goodProbe({ streams: [{ ...v, height: 0 }] }), 'METADATA_MISSING'],
    ['absurd width', goodProbe({ streams: [{ ...v, width: 100_000 }] }), 'METADATA_MISSING'],
    ['no duration anywhere', goodProbe({ formatDurationSec: null, streams: [{ ...v, durationSec: null }] }), 'METADATA_MISSING'],
    ['zero duration', goodProbe({ formatDurationSec: 0, streams: [{ ...v, durationSec: 0 }] }), 'METADATA_MISSING'],
    ['negative duration', goodProbe({ formatDurationSec: -1, streams: [{ ...v, durationSec: null }] }), 'METADATA_MISSING'],
    ['container vs stream disagree', goodProbe({ formatDurationSec: 10, streams: [{ ...v, durationSec: 12.5 }] }), 'AMBIGUOUS_METADATA'],
    ['over 30 s', goodProbe({ formatDurationSec: 30.5, streams: [{ ...v, durationSec: 30.5 }] }), 'TOO_LONG'],
    ['long only per stream', goodProbe({ formatDurationSec: 29.9, streams: [{ ...v, durationSec: 30.6 }] }), 'TOO_LONG'],
  ];
  for (const [name, probe, expected] of cases) {
    assert.throws(() => evaluateProbe(probe), (e: MediaError) => e instanceof MediaError && e.code === expected, name);
  }
});

test('valid clip → ValidatedVideo with independent SHA-256, size, and no raw-path leak in errors', async () => {
  const { video, bytes } = await makeValidatedVideo();
  assert.equal(video.sha256, sha(bytes));
  assert.equal(video.bytes, bytes.length);
  assert.deepEqual([video.container, video.brand, video.videoCodec, video.width, video.height, video.durationSec], ['mp4', 'isom', 'h264', 390, 844, 10]);
  assert.ok(!Number.isNaN(Date.parse(video.validatedAt)));
});

test('size limit is enforced before any read, and limits can only be tightened', async () => {
  const dir = tempDir();
  const big = path.join(dir, 'big.mp4');
  writeFileSync(big, fakeMp4Bytes());
  truncateSync(big, MEDIA_LIMITS.maxBytes + 1); // sparse
  assert.equal(await code(validateVideoFile(big, { deps: fakeDeps() })), 'TOO_LARGE');
  const exact = path.join(dir, 'exact.mp4');
  writeFileSync(exact, fakeMp4Bytes());
  truncateSync(exact, MEDIA_LIMITS.maxBytes);
  assert.equal((await validateVideoFile(exact, { deps: fakeDeps() })).bytes, MEDIA_LIMITS.maxBytes);
  const small = path.join(dir, 'small.mp4');
  writeFileSync(small, fakeMp4Bytes(5_000));
  assert.equal(await code(validateVideoFile(small, { deps: fakeDeps(), limits: { maxBytes: 4_000 } })), 'TOO_LARGE');
  // Raising a limit above the product cap is ignored.
  assert.equal(await code(validateVideoFile(big, { deps: fakeDeps(), limits: { maxBytes: 999_999_999 } })), 'TOO_LARGE');
  assert.equal(await code(validateVideoFile(small, { deps: fakeDeps(), limits: { maxDurationSec: 5 } })), 'TOO_LONG');
});

test('unsupported or mislabelled content is rejected by signature, not by name', async () => {
  const dir = tempDir();
  const put = (name: string, data: Buffer) => {
    const f = path.join(dir, name);
    writeFileSync(f, data);
    return f;
  };
  assert.equal(await code(validateVideoFile(put('a.mp4', Buffer.from('not a video at all, just text')), { deps: fakeDeps() })), 'UNSUPPORTED_TYPE');
  assert.equal(await code(validateVideoFile(put('b.mp4', Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81])), { deps: fakeDeps() })), 'WEBM_REQUIRES_CONVERSION');
  assert.equal(await code(validateVideoFile(put('c.webm', Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81])), { deps: fakeDeps() })), 'WEBM_REQUIRES_CONVERSION');
  assert.equal(await code(validateVideoFile(put('d.mp4', Buffer.from('\x89PNG\r\n\x1a\n' + 'x'.repeat(100), 'latin1')), { deps: fakeDeps() })), 'UNSUPPORTED_TYPE');
  const qt = fakeMp4Bytes();
  qt.write('qt  ', 8, 'latin1');
  assert.equal(await code(validateVideoFile(put('e.mp4', qt), { deps: fakeDeps() })), 'UNSUPPORTED_TYPE');
  // MP4 bytes under a non-MP4 name: ambiguous, rejected.
  assert.equal(await code(validateVideoFile(put('f.txt', fakeMp4Bytes()), { deps: fakeDeps() })), 'TYPE_MISMATCH');
  assert.equal(await code(validateVideoFile(put('g', fakeMp4Bytes()), { deps: fakeDeps() })), 'TYPE_MISMATCH');
  assert.equal(await code(validateVideoFile(put('h.mp4', Buffer.alloc(0)), { deps: fakeDeps() })), 'EMPTY_FILE');
});

test('probe and decode failures map to typed errors; tool absence is reported, not hidden', async () => {
  const dir = tempDir();
  const f = path.join(dir, 'x.mp4');
  writeFileSync(f, fakeMp4Bytes());
  assert.equal(await code(validateVideoFile(f, { deps: fakeDeps(goodProbe(), false) })), 'CORRUPT_MEDIA');
  const throwing = (c: ConstructorParameters<typeof MediaError>[0]): MediaDeps => ({
    probe: async () => {
      throw new MediaError(c, 'x');
    },
    decodeCheck: async () => ({ ok: true, detail: '' }),
  });
  assert.equal(await code(validateVideoFile(f, { deps: throwing('CORRUPT_MEDIA') })), 'CORRUPT_MEDIA');
  assert.equal(await code(validateVideoFile(f, { deps: throwing('TOOL_UNAVAILABLE') })), 'TOOL_UNAVAILABLE');
  const long = goodProbe({ formatDurationSec: 31, streams: [{ ...goodProbe().streams[0]!, durationSec: 31 }] });
  assert.equal(await code(validateVideoFile(f, { deps: fakeDeps(long) })), 'TOO_LONG');
});

test('unsafe paths are rejected: traversal, NUL, symlinks, escape from the allowed root, wrong kinds', async () => {
  const root = tempDir();
  const outside = tempDir();
  mkdirSync(path.join(root, 'sub'));
  const inside = path.join(root, 'sub', 'ok.mp4');
  const out = path.join(outside, 'out.mp4');
  writeFileSync(inside, fakeMp4Bytes());
  writeFileSync(out, fakeMp4Bytes());
  const opts = { deps: fakeDeps(), allowedRoot: root };

  assert.equal((await validateVideoFile(inside, opts)).basename, 'ok.mp4');
  assert.equal(await code(validateVideoFile(out, opts)), 'UNSAFE_PATH');
  assert.equal(await code(validateVideoFile(`${root}/sub/../sub/ok.mp4`, opts)), 'INVALID_PATH');
  assert.equal(await code(validateVideoFile(`${inside}\0.png`, opts)), 'INVALID_PATH');
  assert.equal(await code(validateVideoFile('', opts)), 'INVALID_PATH');
  assert.equal(await code(validateVideoFile(undefined as unknown as string, opts)), 'INVALID_PATH');
  assert.equal(await code(validateVideoFile('x'.repeat(5000), opts)), 'INVALID_PATH');
  assert.equal(await code(validateVideoFile(path.join(root, 'sub', 'missing.mp4'), opts)), 'FILE_NOT_FOUND');
  // A symlink inside the root pointing outside it.
  const link = path.join(root, 'sub', 'link.mp4');
  symlinkSync(out, link);
  assert.equal(await code(validateVideoFile(link, opts)), 'UNSAFE_PATH');
  assert.equal(await code(validateVideoFile(link, { deps: fakeDeps() })), 'UNSAFE_PATH'); // even without a root
});

test('a directory is not a file', async () => {
  const dir = tempDir();
  const sub = path.join(dir, 'dir.mp4');
  mkdirSync(sub);
  assert.equal(await code(validateVideoFile(sub, { deps: fakeDeps() })), 'NOT_A_FILE');
});

test('temp-file lifecycle: probed copy is private (0700 dir, 0600 file) and always removed', async () => {
  const tmpRoot = tempDir('pp-tmproot-');
  const f = path.join(tempDir(), 'x.mp4'); // created before TMPDIR is redirected
  writeFileSync(f, fakeMp4Bytes());
  const prev = process.env.TMPDIR;
  process.env.TMPDIR = tmpRoot;
  try {
    let seen: { dirMode: number; fileMode: number; sameAsOriginal: boolean } | undefined;
    const spying: MediaDeps = {
      probe: async (copy) => {
        seen = {
          dirMode: statSync(path.dirname(copy)).mode & 0o777,
          fileMode: statSync(copy).mode & 0o777,
          sameAsOriginal: copy === f,
        };
        return goodProbe();
      },
      decodeCheck: async () => ({ ok: true, detail: '' }),
    };
    await validateVideoFile(f, { deps: spying });
    assert.deepEqual(seen, { dirMode: 0o700, fileMode: 0o600, sameAsOriginal: false });
    assert.deepEqual(readdirSync(tmpRoot), [], 'temp dir removed after success');

    await code(validateVideoFile(f, { deps: fakeDeps(goodProbe(), false) }));
    assert.deepEqual(readdirSync(tmpRoot), [], 'temp dir removed after a validation failure');
    const exploding: MediaDeps = { probe: async () => { throw new Error('boom'); }, decodeCheck: async () => ({ ok: true, detail: '' }) };
    await assert.rejects(validateVideoFile(f, { deps: exploding }), /boom/);
    assert.deepEqual(readdirSync(tmpRoot), [], 'temp dir removed after an unexpected error');
  } finally {
    if (prev === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = prev;
  }
});

test('readVerifiedVideoBytes returns the validated bytes and detects any later change', async () => {
  const { video, file, bytes } = await makeValidatedVideo();
  assert.deepEqual(await readVerifiedVideoBytes(video), bytes);

  const flipped = Buffer.from(bytes);
  flipped.writeUInt8(flipped.readUInt8(flipped.length - 1) ^ 0xff, flipped.length - 1); // same size, different content
  writeFileSync(file, flipped);
  assert.equal(await code(readVerifiedVideoBytes(video)), 'MEDIA_CHANGED');

  writeFileSync(file, bytes);
  appendFileSync(file, 'x');
  assert.equal(await code(readVerifiedVideoBytes(video)), 'MEDIA_CHANGED');

  writeFileSync(file, bytes);
  rmSync(file);
  assert.equal(await code(readVerifiedVideoBytes(video)), 'FILE_NOT_FOUND');

  const target = path.join(tempDir(), 'other.mp4');
  writeFileSync(target, bytes);
  symlinkSync(target, file);
  assert.equal(await code(readVerifiedVideoBytes(video)), 'UNSAFE_PATH');
});

test('a forged ValidatedVideo cannot smuggle different bytes past re-verification', async () => {
  const { video, file } = await makeValidatedVideo();
  writeFileSync(file, fakeMp4Bytes(2_048, 0x42)); // same size, different payload
  const forged = { ...video, sha256: 'f'.repeat(64) } as typeof video;
  assert.equal(await code(readVerifiedVideoBytes(forged)), 'MEDIA_CHANGED');
});

// ---------- WebM → MP4 conversion (transcoder injected; real ffmpeg is exercised in test:integration) ----------

const webmBytes = () => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]), Buffer.alloc(500, 7)]);
const okTranscode = (bytes = fakeMp4Bytes()) => async (_in: string, out: string) => {
  writeFileSync(out, bytes);
  return { ok: true, detail: '' };
};

test('convertWebmToMp4: converts a WebM, creates the output exclusively (0600), and validates it', async () => {
  const root = tempDir();
  const input = path.join(root, 'rec.webm');
  writeFileSync(input, webmBytes());
  const output = path.join(root, 'rec.mp4');
  const v = await convertWebmToMp4(input, output, { allowedRoot: root, deps: fakeDeps(), transcode: okTranscode() });
  assert.equal(v.basename, 'rec.mp4');
  assert.equal(statSync(output).mode & 0o777, 0o600);
  assert.equal(await code(convertWebmToMp4(input, output, { allowedRoot: root, deps: fakeDeps(), transcode: okTranscode() })), 'OUTPUT_EXISTS');
});

test('convertWebmToMp4 rejects bad inputs/outputs and leaves nothing behind', async () => {
  const root = tempDir();
  const outside = tempDir();
  const input = path.join(root, 'rec.webm');
  writeFileSync(input, webmBytes());
  const mp4In = path.join(root, 'not-webm.webm');
  writeFileSync(mp4In, fakeMp4Bytes());
  const base = { allowedRoot: root, deps: fakeDeps(), transcode: okTranscode() };

  assert.equal(await code(convertWebmToMp4(mp4In, path.join(root, 'a.mp4'), base)), 'UNSUPPORTED_TYPE');
  assert.equal(await code(convertWebmToMp4(input, path.join(root, 'a.txt'), base)), 'INVALID_PATH');
  assert.equal(await code(convertWebmToMp4(input, path.join(outside, 'a.mp4'), base)), 'UNSAFE_PATH');
  assert.equal(await code(convertWebmToMp4(input, `${root}/../a.mp4`, base)), 'INVALID_PATH');
  assert.equal(await code(convertWebmToMp4(input, path.join(root, 'nodir', 'a.mp4'), base)), 'FILE_NOT_FOUND');
  assert.equal(await code(convertWebmToMp4(path.join(outside, 'x.webm'), path.join(root, 'a.mp4'), base)), 'UNSAFE_PATH');

  const failing = { ...base, transcode: async () => ({ ok: false, detail: 'codec error' }) };
  assert.equal(await code(convertWebmToMp4(input, path.join(root, 'b.mp4'), failing)), 'CONVERSION_FAILED');
  assert.ok(!readdirSync(root).includes('b.mp4'));

  // Output that fails validation (too long) is deleted again.
  const long = goodProbe({ formatDurationSec: 40, streams: [{ ...goodProbe().streams[0]!, durationSec: 40 }] });
  assert.equal(await code(convertWebmToMp4(input, path.join(root, 'c.mp4'), { ...base, deps: fakeDeps(long) })), 'TOO_LONG');
  assert.ok(!readdirSync(root).includes('c.mp4'));
});

test('convertWebmToMp4 cleans its temp dir on success and failure', async () => {
  const tmpRoot = tempDir('pp-tmproot-');
  const root = tempDir(); // created before TMPDIR is redirected
  const input = path.join(root, 'rec.webm');
  writeFileSync(input, webmBytes());
  const prev = process.env.TMPDIR;
  process.env.TMPDIR = tmpRoot;
  try {
    await convertWebmToMp4(input, path.join(root, 'ok.mp4'), { allowedRoot: root, deps: fakeDeps(), transcode: okTranscode() });
    assert.deepEqual(readdirSync(tmpRoot), []);
    await code(convertWebmToMp4(input, path.join(root, 'bad.mp4'), { allowedRoot: root, deps: fakeDeps(), transcode: async () => ({ ok: false, detail: '' }) }));
    assert.deepEqual(readdirSync(tmpRoot), []);
  } finally {
    if (prev === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = prev;
  }
});

test('a path outside the allowed root is UNSAFE_PATH whether or not it exists (no existence oracle)', async () => {
  const root = tempDir();
  const outside = tempDir();
  writeFileSync(path.join(outside, 'real.mp4'), fakeMp4Bytes());
  const opts = { deps: fakeDeps(), allowedRoot: root };
  assert.equal(await code(validateVideoFile(path.join(outside, 'real.mp4'), opts)), 'UNSAFE_PATH');
  assert.equal(await code(validateVideoFile(path.join(outside, 'missing.mp4'), opts)), 'UNSAFE_PATH');
  assert.equal(await code(validateVideoFile(path.join(root, 'missing.mp4'), opts)), 'FILE_NOT_FOUND');
});
