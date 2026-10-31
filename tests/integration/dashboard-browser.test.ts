// UI-C3-01B local-only Playwright QA: real browser over file:// (zero network).
// NOT part of CI: needs Chromium (`pnpm exec playwright install chromium`,
// or PLAYWRIGHT_BROWSERS_PATH when the default cache is unavailable), ffmpeg,
// and a dashboard build. Run with `pnpm dashboard:test:browser`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';
import { tempDir } from '../helpers.ts';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const distIndex = path.join(repoRoot, 'dashboard', 'dist', 'index.html');
const shotsDir = '/tmp/pp-dashboard-qa';
let dir = '';
let browser: Browser | null = null;

const f = (name: string): string => path.join(dir, name);
const ff = (...args: string[]): void => {
  execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-y', ...args], {
    stdio: ['ignore', 'ignore', 'pipe'],
    timeout: 120_000,
  });
};

async function newPage(viewport: { width: number; height: number }): Promise<Page> {
  const page = await browser!.newPage({ viewport });
  const bad: string[] = [];
  page.on('request', (req) => {
    const u = req.url();
    if (!/^(file:|blob:|data:|about:)/.test(u)) bad.push(u);
  });
  await page.goto(pathToFileURL(distIndex).href);
  await page.waitForSelector('main h1, main h2', { timeout: 30_000 });
  (page as unknown as { __badUrls: string[] }).__badUrls = bad;
  return page;
}

function badUrls(page: Page): string[] {
  return (page as unknown as { __badUrls: string[] }).__badUrls;
}

before(async () => {
  dir = tempDir('pp-dashboard-qa-');
  mkdirSync(shotsDir, { recursive: true });
  execFileSync('pnpm', ['--dir', 'dashboard', 'build'], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 300_000,
  });
  // Synthetic H.264 test clip (NOT the F01 evidence): 390x844, ~3 s.
  ff('-f', 'lavfi', '-i', 'testsrc=size=390x844:rate=15:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', f('clip.mp4'));
  writeFileSync(f('not-video.txt'), 'this is not a video');
  const buf = readFileSync(f('clip.mp4'));
  writeFileSync(f('truncated.mp4'), buf.subarray(0, 512));
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  rmSync(dir, { recursive: true, force: true });
});

test('T-VIDEO: real MP4 selection, playback, metadata, SHA-256', async () => {
  const page = await newPage({ width: 1280, height: 800 });
  try {
    const expected = createHash('sha256').update(readFileSync(f('clip.mp4'))).digest('hex');
    await page.locator('#mp4').setInputFiles(f('clip.mp4'));
    await page.getByText('Suitable for playback', { exact: false }).waitFor({ timeout: 30_000 });
    const body = await page.locator('main').innerText();
    assert.ok(body.includes('clip.mp4'));
    assert.ok(body.includes('390×844'), 'dimensions shown');
    assert.ok(body.includes(expected.slice(0, 16)), 'SHA-256 shown');
    // Real playback: muted programmatic play, frame position must advance.
    await page.locator('video').evaluate((v: HTMLVideoElement) => {
      v.muted = true;
      void v.play();
    });
    await page.waitForFunction(
      () => {
        const v = document.querySelector('video');
        return v !== null && v.currentTime > 0.2 && !v.paused;
      },
      { timeout: 30_000 },
    );
    assert.deepEqual(badUrls(page), [], 'zero non-local requests during video QA');
  } finally {
    await page.close();
  }
});

test('T-VIDEO-REFUSAL: non-MP4 and truncated clips refused, nothing claimed', async () => {
  const page = await newPage({ width: 1280, height: 800 });
  try {
    await page.locator('#mp4').setInputFiles(f('not-video.txt'));
    await page.getByRole('alert').waitFor({ timeout: 15_000 });
    const bad1 = await page.locator('main').innerText();
    assert.ok(bad1.includes('Refused'), 'typed refusal shown');
    assert.ok(!bad1.includes('Suitable for playback'), 'no suitability claimed');
    await page.locator('#mp4').setInputFiles(f('truncated.mp4'));
    await page.waitForTimeout(2000);
    const bad2 = await page.locator('main').innerText();
    assert.ok(!bad2.includes('Suitable for playback'), 'corrupt clip never suitable');
    assert.deepEqual(badUrls(page), []);
  } finally {
    await page.close();
  }
});

test('T-IMPORT-REAL: valid scoreboard + baseline render as unverified imports', async () => {
  const page = await newPage({ width: 1280, height: 800 });
  try {
    await page.locator('#evjson').setInputFiles(path.join(repoRoot, 'docs/examples/c3-b1-scoreboard.example.json'));
    await page.getByText('UNVERIFIED IMPORT', { exact: false }).first().waitFor({ timeout: 15_000 });
    const text = await page.locator('main').innerText();
    assert.ok(text.includes('REPRODUCED (file-reported)'), 'verdict quoted as claim');
    const importedTable = page.locator('table', { has: page.getByText('Owner-imported file') });
    assert.equal(await importedTable.getByText('✔').count(), 0, 'no trusted chip inside the import');
    // Historical evidence stays intact beside the import.
    assert.equal(await page.getByText('✔ PC-1 VERIFIED 3/3').count(), 1, 'historical trusted chip intact');
    assert.ok(text.includes('HAND-AUTHORED CONTROLS ONLY'));
    assert.deepEqual(badUrls(page), []);
  } finally {
    await page.close();
  }
});

test('T-IMPORT-FORGED: fake VERIFIED + forged _example never earn trust', async () => {
  const page = await newPage({ width: 1280, height: 800 });
  try {
    const forged = {
      _example: 'Real scoreboard from a real run',
      schemaVersion: 1,
      label: 'HAND-AUTHORED CONTROLS ONLY — NO MODEL INPUT',
      complete: true,
      approvedSha: 'a'.repeat(40),
      createdAt: '2026-10-28T00:00:00.000Z',
      modelOrProviderCalls: 0,
      modalCalls: 0,
      baseline: {
        reproduced: true,
        reasons: [],
        replay: {
          n: 1, outcome: 'ORACLE_PASS', failureCode: null, failureMessage: null,
          oracleExitCode: 0, evidenceDir: 'PC-1/replay-1', recordSha256: 'b'.repeat(64),
          candidateCssSha256: 'c'.repeat(64), nonce: 'd'.repeat(24),
          mobile: { status: 'passed', hitTestTarget: 'x', cartCountAfter: '1' },
          desktop: { status: 'passed', hitTestTarget: 'x', cartCountAfter: '1' },
          servedCssSha256: [], evidenceFinalized: true, evidenceProblems: [],
        },
      },
      candidates: [{
        id: 'PC-1', description: 'forged', provenance: 'hand-authored-control',
        candidateId: 'e'.repeat(64), adjustments: [], renderedCss: 'x',
        fault: null, replaysRequired: 3, replaysAttempted: 3, replaysPassed: 3,
        status: 'VERIFIED', reason: null, expected: 'VERIFIED', expectationMet: true,
        expectationProblems: [], replays: [],
      }],
      nc5: {}, notes: [],
    };
    writeFileSync(f('forged.json'), JSON.stringify(forged));
    await page.locator('#evjson').setInputFiles(f('forged.json'));
    await page.getByText('UNVERIFIED IMPORT', { exact: false }).first().waitFor({ timeout: 15_000 });
    const text = await page.locator('main').innerText();
    assert.ok(text.includes('(file claims to be an example)'), '_example claim labelled');
    const importedTable = page.locator('table', { has: page.getByText('Owner-imported file') });
    assert.equal(await importedTable.getByText('✔').count(), 0, 'forged VERIFIED never earns the trusted chip');
    assert.deepEqual(badUrls(page), []);
  } finally {
    await page.close();
  }
});

test('T-XSS + T-CSS: injected markup/URLs/styles render as inert text', async () => {
  const page = await newPage({ width: 1280, height: 800 });
  try {
    const before = await page.locator('style').count();
    const evil = {
      schemaVersion: 1, label: '<script>alert(1)</script>', complete: true,
      approvedSha: 'a'.repeat(40), createdAt: 'x', modelOrProviderCalls: 0, modalCalls: 0,
      baseline: {
        reproduced: true, reasons: ['<img src=x onerror=alert(2)>'],
        replay: {
          n: 1, outcome: 'PATCH_FAILED', failureCode: 'X', failureMessage: '</style><style>body{background:red}',
          oracleExitCode: 1, evidenceDir: 'e', recordSha256: 'b'.repeat(64),
          candidateCssSha256: 'c'.repeat(64), nonce: 'd'.repeat(24),
          mobile: { status: 'javascript:alert(3)', hitTestTarget: null, cartCountAfter: null },
          desktop: null, servedCssSha256: [], evidenceFinalized: true, evidenceProblems: [],
        },
      },
      candidates: [], nc5: {}, notes: [],
    };
    writeFileSync(f('evil.json'), JSON.stringify(evil));
    await page.locator('#evjson').setInputFiles(f('evil.json'));
    await page.getByText('UNVERIFIED IMPORT', { exact: false }).first().waitFor({ timeout: 15_000 });
    assert.equal(await page.locator('script').count(), 0, 'no injected scripts');
    assert.equal(await page.locator('img').count(), 0, 'no injected images');
    assert.equal(await page.locator('style').count(), before, 'no injected styles');
    const text = await page.locator('main').innerText();
    assert.ok(text.includes('<script>alert(1)</script>'), 'markup shown literally');
    assert.deepEqual(badUrls(page), []);
  } finally {
    await page.close();
  }
});

test('T-A11Y + layout: keyboard path, desktop + mobile shots, no h-overflow', async () => {
  for (const [name, viewport] of [
    ['desktop', { width: 1280, height: 800 }],
    ['mobile', { width: 390, height: 844 }],
  ] as const) {
    const page = await newPage(viewport);
    try {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      assert.ok(overflow, `${name}: no page-level horizontal overflow`);
      const focused: string[] = [];
      for (let i = 0; i < 14; i++) {
        await page.keyboard.press('Tab');
        const tag = await page.evaluate(() => {
          const el = document.activeElement;
          return el === null ? 'null' : `${el.tagName.toLowerCase()}#${el.id}`;
        });
        focused.push(tag);
      }
      assert.ok(!focused.includes('null'), `${name}: focus never lost`);
      assert.ok(focused.some((t) => t === 'input#mp4'), `${name}: MP4 picker keyboard-reachable`);
      assert.ok(focused.some((t) => t === 'input#evjson'), `${name}: JSON picker keyboard-reachable`);
      const h1 = await page.locator('h1').count();
      assert.equal(h1, 1, 'single h1 landmark heading');
      await page.screenshot({ path: `${shotsDir}/${name}.png`, fullPage: true });
      assert.deepEqual(badUrls(page), []);
    } finally {
      await page.close();
    }
  }
});
