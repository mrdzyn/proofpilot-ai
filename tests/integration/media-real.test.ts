// Real ffmpeg/ffprobe: proves the validator against genuine media (including
// corrupt/truncated files that a bare probe accepts). Needs ffmpeg on PATH.
// Not part of the default CI test steps; run with `pnpm test:integration`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { convertWebmToMp4, MediaError, validateVideoFile } from '../../packages/intake/src/index.ts';
import { tempDir } from '../helpers.ts';

let dir: string;
const f = (name: string) => path.join(dir, name);
const ff = (...args: string[]) => execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    assert.ok(e instanceof MediaError, `expected MediaError, got ${e}`);
    return e.code;
  }
  return 'NO_ERROR';
};
const lavfi = (size: string, secs: number, rate = 15) => ['-f', 'lavfi', '-i', `testsrc=size=${size}:rate=${rate}:duration=${secs}`];

before(() => {
  dir = tempDir('pp-real-media-');
  ff(...lavfi('390x844', 3), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', f('good.mp4'));
  ff(...lavfi('390x844', 3), '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', f('with-audio.mp4'));
  ff(...lavfi('64x64', 31, 1), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', f('long.mp4'));
  ff(...lavfi('320x240', 2), '-c:v', 'mpeg4', f('mpeg4.mp4'));
  ff('-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', '-c:a', 'aac', f('audio-only.mp4'));
  ff(...lavfi('390x844', 2), '-c:v', 'libvpx', f('rec.webm'));
  // Truncated (a bare ffprobe still accepts this one) and bit-flipped copies.
  const good = readFileSync(f('good.mp4'));
  writeFileSync(f('truncated.mp4'), good.subarray(0, 6000));
  const flipped = Buffer.from(good);
  for (let i = 3000; i < 3400; i++) flipped.writeUInt8(flipped.readUInt8(i) ^ 0xff, i);
  writeFileSync(f('flipped.mp4'), flipped);
  writeFileSync(f('garbage.mp4'), Buffer.concat([good.subarray(0, 32), Buffer.alloc(4000, 0x37)]));
});
after(() => rmSync(dir, { recursive: true, force: true }));

test('T01: a genuine H.264 MP4 validates with an independent SHA-256 and true metadata', async () => {
  const v = await validateVideoFile(f('good.mp4'), { allowedRoot: dir });
  assert.equal(v.sha256, createHash('sha256').update(readFileSync(f('good.mp4'))).digest('hex'));
  assert.deepEqual([v.container, v.videoCodec, v.width, v.height, v.hasAudio], ['mp4', 'h264', 390, 844, false]);
  assert.ok(Math.abs(v.durationSec - 3) < 0.2, `duration ${v.durationSec}`);
});

test('audio presence is reported but not required', async () => {
  assert.equal((await validateVideoFile(f('with-audio.mp4'))).hasAudio, true);
});

test('T02: truncated, bit-flipped and garbage files are CORRUPT_MEDIA', async () => {
  assert.equal(await code(validateVideoFile(f('truncated.mp4'))), 'CORRUPT_MEDIA');
  assert.equal(await code(validateVideoFile(f('flipped.mp4'))), 'CORRUPT_MEDIA');
  assert.equal(await code(validateVideoFile(f('garbage.mp4'))), 'CORRUPT_MEDIA');
});

test('T02: over-duration, wrong codec, and audio-only files are rejected by real probing', async () => {
  assert.equal(await code(validateVideoFile(f('long.mp4'))), 'TOO_LONG');
  assert.equal(await code(validateVideoFile(f('mpeg4.mp4'))), 'UNSUPPORTED_CODEC');
  assert.equal(await code(validateVideoFile(f('audio-only.mp4'))), 'NO_VIDEO_STREAM');
});

test('a real WebM is refused for upload, then converts locally to a valid H.264 MP4', async () => {
  assert.equal(await code(validateVideoFile(f('rec.webm'))), 'WEBM_REQUIRES_CONVERSION');
  const v = await convertWebmToMp4(f('rec.webm'), f('rec.mp4'), { allowedRoot: dir });
  assert.deepEqual([v.container, v.videoCodec, v.width, v.height, v.hasAudio], ['mp4', 'h264', 390, 844, false]);
  assert.ok(Math.abs(v.durationSec - 2) < 0.3, `duration ${v.durationSec}`);
  assert.equal(v.sha256, createHash('sha256').update(readFileSync(f('rec.mp4'))).digest('hex'));
});

test('converting a non-WebM, or a corrupt WebM, fails cleanly and leaves no output', async () => {
  assert.equal(await code(convertWebmToMp4(f('good.mp4'), f('x1.mp4'), { allowedRoot: dir })), 'UNSUPPORTED_TYPE');
  writeFileSync(f('bad.webm'), Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(2000, 0x55)]));
  assert.equal(await code(convertWebmToMp4(f('bad.webm'), f('x2.mp4'), { allowedRoot: dir })), 'CONVERSION_FAILED');
  for (const name of ['x1.mp4', 'x2.mp4']) assert.throws(() => readFileSync(f(name)), /ENOENT/);
});
