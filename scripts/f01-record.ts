// Records GENUINE browser videos of the unmodified F01 fixture: a 390x844 mobile
// clip showing the failing Add-to-cart tap, and a 1280x800 desktop control clip.
// Not the trusted oracle: it records and measures, it does not certify a fix.
//
// Everything is written under the gitignored .proofpilot/recordings/<id>/.
// Exit 0: both clips behaved as the F01 defect predicts AND the evidence paths are
// committed. Exit 1: observed behaviour differed or a step failed (BLOCKED/failed).
// Exit 2: recorded fine but the worktree is dirty, so the clips are not exact-SHA evidence.
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { certifyRecording, F01_RECORDING_PATHS, readWorktreeState, scrubEnv } from '../packages/core/src/index.ts';
import { convertWebmToMp4, MediaError } from '../packages/intake/src/index.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');
const PORT = 4174; // distinct from the oracle's 4173 so the two can never be confused
const BASE = `http://127.0.0.1:${PORT}`;
const git = (...args: string[]) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim();
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

type Kind = 'mobile-defect' | 'desktop-control';
const CLIPS: Array<{ kind: Kind; viewport: { width: number; height: number }; taps: number }> = [
  { kind: 'mobile-defect', viewport: { width: 390, height: 844 }, taps: 2 },
  { kind: 'desktop-control', viewport: { width: 1280, height: 800 }, taps: 1 },
];

// Recorder-injected visual aid: Chromium videos do not draw a cursor, so show each
// press as a fading ring. pointer-events:none means it can never intercept the tap.
const TAP_INDICATOR = () => {
  document.addEventListener(
    'mousedown',
    (e) => {
      const ring = document.createElement('div');
      ring.setAttribute('data-recorder-tap-indicator', '');
      ring.style.cssText = `position:fixed;left:${e.clientX - 26}px;top:${e.clientY - 26}px;width:52px;height:52px;border-radius:50%;border:4px solid #ffd60a;background:rgba(255,214,10,.45);box-shadow:0 0 0 2px rgba(0,0,0,.55);pointer-events:none;z-index:2147483647;transition:opacity .9s ease-out,transform .9s ease-out;`;
      document.documentElement.appendChild(ring);
      requestAnimationFrame(() => {
        ring.style.opacity = '0';
        ring.style.transform = 'scale(1.6)';
      });
      setTimeout(() => ring.remove(), 1100);
    },
    true,
  );
};

async function startFixture(): Promise<{ stop: () => void }> {
  const child = spawn(process.execPath, ['fixtures/sample-store/server.mjs'], {
    cwd: repoRoot,
    env: { ...scrubEnv(process.env), FIXTURE_PORT: String(PORT) },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const deadline = Date.now() + 15_000;
  for (;;) {
    try {
      if ((await fetch(`${BASE}/product/demo`)).ok) break;
    } catch {
      /* not up yet */
    }
    if (child.exitCode !== null) throw new Error(`fixture server exited early (code ${child.exitCode}); is port ${PORT} in use?`);
    if (Date.now() > deadline) {
      child.kill();
      throw new Error('fixture server did not become ready in 15 s');
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return { stop: () => child.kill() };
}

const cartCount = (page: Page) => page.getByTestId('cart-count').textContent();

async function recordClip(clip: (typeof CLIPS)[number], outDir: string) {
  const rawDir = path.join(outDir, 'raw');
  await mkdir(rawDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, env: scrubEnv(process.env) as Record<string, string> });
  const context = await browser.newContext({
    viewport: clip.viewport,
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    recordVideo: { dir: rawDir, size: clip.viewport },
  });
  await context.addInitScript(TAP_INDICATOR);
  await context.tracing.start({ screenshots: true, snapshots: true });
  const page = await context.newPage();
  const browserVersion = browser.version();
  const taps: Array<{ x: number; y: number; hitTestTarget: string | null; cartCountAfter: string | null }> = [];
  let cartBefore: string | null = null;
  try {
    await page.goto(`${BASE}/product/demo`);
    await page.getByTestId('add-to-cart').waitFor({ state: 'visible' });
    cartBefore = await cartCount(page);
    await page.waitForTimeout(2500); // context: product page, cart shows 0
    await page.screenshot({ path: path.join(outDir, 'before-tap.png') });

    const box = (await page.getByTestId('add-to-cart').boundingBox())!;
    const x = Math.round(box.x + box.width / 2);
    const y = Math.round(box.y + box.height / 2);
    for (let i = 0; i < clip.taps; i++) {
      await page.mouse.move(x, y, { steps: 8 });
      await page.waitForTimeout(400);
      // Which element receives the pointer event at this point (same probe as the oracle).
      const hitTestTarget = await page.evaluate(([px, py]) => {
        const el = document.elementFromPoint(px, py);
        return el ? (el.closest('[data-testid]')?.getAttribute('data-testid') ?? el.tagName.toLowerCase()) : null;
      }, [x, y] as const);
      await page.mouse.click(x, y); // real coordinate click: no force, no synthetic dispatch
      await page.waitForTimeout(2200);
      taps.push({ x, y, hitTestTarget, cartCountAfter: await cartCount(page) });
    }
    await page.screenshot({ path: path.join(outDir, 'after-tap.png') });
  } finally {
    await context.tracing.stop({ path: path.join(outDir, 'trace.zip') });
    await context.close(); // finalises the WebM
    await browser.close();
  }

  const webms = (await readdir(rawDir)).filter((f) => f.endsWith('.webm'));
  if (webms.length !== 1) throw new Error(`expected exactly one recorded WebM, found ${webms.length}`);
  const webmPath = path.join(rawDir, webms[0]!);
  const webmBytes = await readFile(webmPath);
  const mp4Path = path.join(outDir, `f01-${clip.kind}.mp4`);
  const video = await convertWebmToMp4(webmPath, mp4Path, { allowedRoot: outDir });

  // Reference frames from the real MP4 (start, middle, end) for review.
  const frames: string[] = [];
  for (const [label, t] of [['start', 0.5], ['middle', video.durationSec / 2], ['end', Math.max(0, video.durationSec - 0.5)]] as const) {
    const file = path.join(outDir, `frame-${label}.png`);
    execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', '-ss', t.toFixed(2), '-i', mp4Path, '-frames:v', '1', file], { env: scrubEnv(process.env) });
    frames.push(path.basename(file));
  }

  const last = taps.at(-1)!;
  const expectedUnchanged = clip.kind === 'mobile-defect';
  const outcomeAsExpected = expectedUnchanged
    ? cartBefore === '0' && taps.every((t) => t.cartCountAfter === '0' && t.hitTestTarget !== 'add-to-cart')
    : cartBefore === '0' && last.cartCountAfter === '1' && last.hitTestTarget === 'add-to-cart';

  const artifacts: Array<{ relativePath: string; sha256: string; bytes: number }> = [];
  for (const e of await readdir(outDir, { withFileTypes: true, recursive: true })) {
    if (!e.isFile()) continue;
    const full = path.join(e.parentPath, e.name);
    const rel = path.relative(outDir, full);
    if (rel === 'recording.json') continue;
    const b = await readFile(full);
    artifacts.push({ relativePath: rel, sha256: sha256(b), bytes: b.length });
  }
  artifacts.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const meta = {
    schemaVersion: 1,
    kind: clip.kind,
    recordedAt: new Date().toISOString(),
    synthetic: true, // the owned sample-store fixture; no real customer or payment data
    viewport: clip.viewport,
    browser: { name: 'chromium', version: browserVersion, headless: true },
    playwright: JSON.parse(await readFile(path.join(repoRoot, 'node_modules/@playwright/test/package.json'), 'utf8')).version,
    environment: { os: `${os.type()} ${os.release()}`, arch: os.arch(), node: process.version },
    fixtureUrl: `${BASE}/product/demo (loopback, unmodified fixture)`,
    annotations: ['A yellow ring marks each pointer press (recorder-injected, pointer-events:none). It is not part of the application.'],
    interaction: { clicks: clip.taps, method: 'page.mouse.click at the button centre (real coordinate click)', cartCountBefore: cartBefore, taps },
    outcomeAsExpected,
    expectation: expectedUnchanged ? 'cart count stays 0 and the tap is received by a non-button element' : 'cart count becomes 1 and the click is received by the button',
    video: {
      path: path.relative(repoRoot, mp4Path),
      container: video.container,
      codec: video.videoCodec,
      width: video.width,
      height: video.height,
      durationSec: Number(video.durationSec.toFixed(3)),
      bytes: video.bytes,
      sha256: video.sha256,
      hasAudio: video.hasAudio,
    },
    rawWebm: { file: path.relative(outDir, webmPath), bytes: webmBytes.length, sha256: sha256(webmBytes) },
    frames,
    artifacts,
  };
  // recording.json is written by main() only after the post-recording worktree check, so the
  // persisted certification can never claim more than the whole run proved.
  return { ...meta, outDir };
}

// ---------------- main ----------------
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const recId = `f01-${stamp}-${randomBytes(3).toString('hex')}`;
const root = path.join(repoRoot, '.proofpilot/recordings', recId);
await mkdir(root, { recursive: true });

const gitHead = git('rev-parse', 'HEAD');
let fixtureTree: string | null = null;
try {
  fixtureTree = git('rev-parse', 'HEAD:fixtures/sample-store');
} catch {
  fixtureTree = null;
}
const before = readWorktreeState(repoRoot, F01_RECORDING_PATHS);

const fixture = await startFixture();
const results: Array<Awaited<ReturnType<typeof recordClip>>> = [];
let failure: string | null = null;
try {
  for (const clip of CLIPS) {
    results.push(await recordClip(clip, path.join(root, clip.kind)));
  }
} catch (e) {
  failure = e instanceof MediaError ? `${e.code}: ${e.message}` : String((e as Error).message ?? e);
} finally {
  fixture.stop();
}
const after = readWorktreeState(repoRoot, F01_RECORDING_PATHS);
const allOk = !failure && results.length === CLIPS.length && results.every((r) => r.outcomeAsExpected);
const cert = certifyRecording({ before, after, allClipsAsExpected: allOk, failure });
const worktree = cert.worktree;
// One attestation for the whole set, persisted into every clip's metadata.
for (const { outDir, ...meta } of results) {
  const persisted = {
    ...meta,
    source: { gitHead, fixtureTree, worktreeBefore: before, worktreeAfter: after, certifiedExactSha: cert.certifiedExactSha, reasons: cert.reasons },
  };
  await writeFile(path.join(outDir, 'recording.json'), JSON.stringify(persisted, null, 2) + '\n');
}

console.log('\n=== F01 recording ===');
console.log(`recording set: .proofpilot/recordings/${recId}`);
console.log(`git HEAD:      ${gitHead}${worktree.kind !== 'clean' ? ` (evidence paths ${worktree.kind.toUpperCase()}: NOT exact-SHA evidence)` : ''}`);
for (const r of results) {
  console.log(`\n[${r.kind}] ${r.viewport.width}x${r.viewport.height}  outcome as expected: ${r.outcomeAsExpected ? 'YES' : 'NO'}`);
  console.log(`  video:    ${r.video.path}`);
  console.log(`  sha256:   ${r.video.sha256}`);
  console.log(`  format:   ${r.video.container}/${r.video.codec} ${r.video.width}x${r.video.height}, ${r.video.durationSec} s, ${r.video.bytes} bytes, audio=${r.video.hasAudio}`);
  console.log(`  cart:     before=${r.interaction.cartCountBefore} after=${r.interaction.taps.map((t) => t.cartCountAfter).join(',')}  hit-test=${r.interaction.taps.map((t) => t.hitTestTarget).join(',')}`);
}
if (failure) console.log(`\nFAILED: ${failure}`);
console.log(`\ncertified exact-SHA: ${cert.certifiedExactSha ? 'YES' : 'NO'}`);
if (allOk && !cert.certifiedExactSha) {
  console.log('NOT CERTIFIED: clips were recorded, but uncommitted/unverifiable evidence paths mean HEAD does not identify the tested bytes.');
  for (const reason of cert.reasons) console.log(`  ${reason}`);
  if (worktree.kind === 'dirty') console.log(`  changed: ${worktree.paths.join(', ')}`);
}
process.exitCode = !allOk ? 1 : cert.certifiedExactSha ? 0 : 2;
