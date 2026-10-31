// UI-C3-01B local-only Playwright QA: real browser over file:// (zero network).
// NOT part of CI: needs Chromium (`pnpm exec playwright install chromium`,
// or PLAYWRIGHT_BROWSERS_PATH when the default cache is unavailable), ffmpeg,
// and a dashboard build. Run with `pnpm dashboard:test:browser`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { createServer } from 'node:net';
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

function waitForHttpOk(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = (): void => {
      const req = get(url, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else if (Date.now() - start > timeoutMs) reject(new Error(`last status ${String(res.statusCode)}`));
        else setTimeout(attempt, 500);
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error(`never reachable: ${url}`));
        else setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

function stopServer(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => resolve();
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 10_000);
    child.once('close', () => {
      clearTimeout(timer);
      done();
    });
    child.kill('SIGTERM');
  });
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

// T-NET-1: full import walkthrough under a loopback-only trap, in Vite dev
// and in the built preview server. Loopback document/asset/HMR loads are the
// only permitted traffic; prohibited controls must be absent from the DOM.
// Ports are allocated free at runtime: fixed defaults may belong to unrelated
// processes on a shared machine and are never probed or disturbed.
test('T-NET: dev + built-app walkthrough is loopback-only', async () => {
  const devPort = await freePort();
  const previewPort = await freePort();
  for (const [name, args, origin] of [
    ['dev', ['--dir', 'dashboard', 'dev', '--port', String(devPort), '--strictPort'], `http://127.0.0.1:${String(devPort)}`],
    ['preview', ['--dir', 'dashboard', 'preview', '--port', String(previewPort), '--strictPort'], `http://127.0.0.1:${String(previewPort)}`],
  ] as const) {
    const child = spawn('pnpm', [...args], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.resume();
    child.stderr?.resume();
    try {
      await waitForHttpOk(`${origin}/`, 60_000);
      const page = await browser!.newPage({ viewport: { width: 1280, height: 800 } });
      const bad: string[] = [];
      page.on('request', (req) => {
        const u = req.url();
        if (!/^(http:\/\/(127\.0\.0\.1|localhost):|ws:\/\/(127\.0\.0\.1|localhost):|file:|blob:|data:|about:)/.test(u)) {
          bad.push(u);
        }
      });
      try {
        await page.goto(`${origin}/`, { waitUntil: 'load', timeout: 30_000 });
        await page.waitForSelector('main h1, main h2', { timeout: 30_000 });
        await page.locator('#evjson').setInputFiles(path.join(repoRoot, 'docs/examples/c3-b1-scoreboard.example.json'));
        await page.getByText('UNVERIFIED IMPORT', { exact: false }).first().waitFor({ timeout: 15_000 });
        const prohibited = await page
          .getByRole('button', { name: /run ai|verify|approve|deploy/i })
          .count();
        assert.equal(prohibited, 0, `${name}: no prohibited control in the DOM`);
        assert.deepEqual(bad, [], `${name}: zero non-loopback requests`);
      } finally {
        await page.close();
      }
    } finally {
      await stopServer(child);
    }
  }
});

before(async () => {
  dir = tempDir('pp-dashboard-qa-');
  mkdirSync(shotsDir, { recursive: true });
  execFileSync('pnpm', ['--dir', 'dashboard', 'build'], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 300_000,
  });
  // Synthetic H.264 test clips (NOT the F01 evidence).
  ff('-f', 'lavfi', '-i', 'testsrc=size=390x844:rate=15:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', f('clip.mp4'));
  ff('-f', 'lavfi', '-i', 'testsrc=size=640x480:rate=15:duration=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', f('clipB.mp4'));
  // Over-limit duration (35 s > 30 s cap), tiny frames so generation is fast.
  ff('-f', 'lavfi', '-i', 'testsrc=size=160x120:rate=5:duration=35', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', f('long.mp4'));
  writeFileSync(f('not-video.txt'), 'this is not a video');
  writeFileSync(f('malformed.json'), '{oops');
  // Malformed UTF-8 inside otherwise-valid JSON bytes.
  const goodBytes = Buffer.from(readFileSync(path.join(repoRoot, 'docs/examples/c3-b1-scoreboard.example.json')));
  goodBytes[120] = 0xff;
  goodBytes[121] = 0xfe;
  writeFileSync(f('badutf8.json'), goodBytes);
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

test('T-VIDEO-RACE: rapid A→B selection attributes the digest to B', async () => {
  const page = await newPage({ width: 1280, height: 800 });
  try {
    // Slow the FIRST digest call only: A's hash lands after B's, and the
    // generation guard must drop it instead of misattributing it to B.
    await page.addInitScript(() => {
      const sub = crypto.subtle as unknown as {
        digest: (...a: unknown[]) => Promise<ArrayBuffer>;
      };
      const orig = sub.digest.bind(sub);
      let calls = 0;
      sub.digest = async (...a: unknown[]): Promise<ArrayBuffer> => {
        calls += 1;
        if (calls === 1) await new Promise((r) => setTimeout(r, 1500));
        return orig(...a);
      };
    });
    await page.reload();
    await page.waitForSelector('main h1, main h2', { timeout: 30_000 });
    const shaA = createHash('sha256').update(readFileSync(f('clip.mp4'))).digest('hex');
    const shaB = createHash('sha256').update(readFileSync(f('clipB.mp4'))).digest('hex');
    assert.notEqual(shaA, shaB, 'distinct clips have distinct digests');
    await page.locator('#mp4').setInputFiles(f('clip.mp4'));
    await page.locator('#mp4').setInputFiles(f('clipB.mp4'));
    await page.getByText('Suitable for playback', { exact: false }).waitFor({ timeout: 30_000 });
    const body = await page.locator('main').innerText();
    assert.ok(body.includes('clipB.mp4'), 'newest selection shown');
    assert.ok(body.includes(shaB.slice(0, 16)), "B's digest shown");
    assert.ok(!body.includes(shaA.slice(0, 16)), "A's digest never attributed to B");
    assert.ok(!body.includes('computing'), 'no digest placeholder ever rendered');
    // Let A's delayed digest land; it must be dropped silently.
    await page.waitForTimeout(2500);
    const later = await page.locator('main').innerText();
    assert.ok(later.includes('clipB.mp4'), 'B still shown after stale A digest');
    assert.ok(later.includes(shaB.slice(0, 16)), "B's digest stable");
    assert.deepEqual(badUrls(page), []);
  } finally {
    await page.close();
  }
});

test('T-VIDEO-LONG: MP4 over 30 s refused with a typed duration error', async () => {
  const page = await newPage({ width: 1280, height: 800 });
  try {
    await page.locator('#mp4').setInputFiles(f('long.mp4'));
    await page
      .getByText('exceeds the 30 s playback limit', { exact: false })
      .waitFor({ timeout: 30_000 });
    const body = await page.locator('main').innerText();
    assert.ok(body.includes('Refused'), 'typed refusal shown');
    assert.ok(!body.includes('Suitable for playback'), 'overlong clip never suitable');
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

test('T-IMPORT-SEQUENCE: failed import preserves the last accepted view', async () => {
  const page = await newPage({ width: 1280, height: 800 });
  try {
    await page.locator('#evjson').setInputFiles(path.join(repoRoot, 'docs/examples/c3-b1-scoreboard.example.json'));
    await page.getByText('UNVERIFIED IMPORT', { exact: false }).first().waitFor({ timeout: 15_000 });
    const before = await page.locator('main').innerText();
    assert.ok(before.includes('REPRODUCED (file-reported)'), 'accepted view rendered');
    await page.locator('#evjson').setInputFiles(f('malformed.json'));
    await page.getByRole('alert').waitFor({ timeout: 15_000 });
    const after = await page.locator('main').innerText();
    assert.ok(after.includes('Refused'), 'typed refusal shown');
    assert.ok(after.includes('UNVERIFIED IMPORT'), 'prior accepted view preserved');
    assert.ok(after.includes('REPRODUCED (file-reported)'), 'prior file-reported rows intact');
    const importedTable = page.locator('table', { has: page.getByText('Owner-imported file') });
    assert.equal(await importedTable.getByText('✔').count(), 0, 'still no trusted chip');
    assert.deepEqual(badUrls(page), []);
  } finally {
    await page.close();
  }
});

test('T-IMPORT-UTF8: malformed file bytes refused, prior view preserved', async () => {
  const page = await newPage({ width: 1280, height: 800 });
  try {
    await page.locator('#evjson').setInputFiles(path.join(repoRoot, 'docs/examples/c3-b1-scoreboard.example.json'));
    await page.getByText('UNVERIFIED IMPORT', { exact: false }).first().waitFor({ timeout: 15_000 });
    await page.locator('#evjson').setInputFiles(f('badutf8.json'));
    await page
      .getByText('not valid UTF-8', { exact: false })
      .waitFor({ timeout: 15_000 });
    const after = await page.locator('main').innerText();
    assert.ok(after.includes('Refused'), 'typed refusal shown');
    assert.ok(after.includes('UNVERIFIED IMPORT'), 'prior accepted view preserved');
    assert.ok(after.includes('REPRODUCED (file-reported)'), 'prior file-reported rows intact');
    assert.deepEqual(badUrls(page), []);
  } finally {
    await page.close();
  }
});

test('T-XSS + T-CSS: injected markup/URLs/styles render as inert text', async () => {
  const page = await newPage({ width: 1280, height: 800 });
  try {
    // Single-file build: the app bundle itself is one inline script/style pair.
    // Injected content must add none.
    const scriptsBefore = await page.locator('script').count();
    const before = await page.locator('style').count();
    const evil = {
      schemaVersion: 1, label: `<script>alert(1)</script>${'x'.repeat(400)}`, complete: true,
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
    assert.equal(await page.locator('script').count(), scriptsBefore, 'no injected scripts');
    assert.equal(await page.locator('img').count(), 0, 'no injected images');
    assert.equal(await page.locator('style').count(), before, 'no injected styles');
    const text = await page.locator('main').innerText();
    assert.ok(text.includes('<script>alert(1)</script>'), 'markup shown literally');
    // Long-cell coverage: a 400-char unbroken imported string must wrap,
    // not force horizontal overflow, even at a narrow phone width.
    await page.setViewportSize({ width: 390, height: 844 });
    const narrow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    assert.ok(narrow, 'long imported cell wraps without page-level h-overflow');
    assert.deepEqual(badUrls(page), []);
  } finally {
    await page.close();
  }
});

test('T-A11Y + layout: keyboard path, zoom/narrow shots, no h-overflow', async () => {
  for (const [name, viewport] of [
    ['desktop', { width: 1280, height: 800 }],
    // 640 px CSS width exercises the same layout as 200% page zoom at 1280 px.
    ['zoom200', { width: 640, height: 800 }],
    ['mobile', { width: 390, height: 844 }],
    ['narrow320', { width: 320, height: 568 }],
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
