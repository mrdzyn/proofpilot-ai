// UI-C3-02-I3: Zone L browser QA against the real companion (mock transport).
// Full loopback demo: terminal pairing, synthetic MP4 upload, terminal
// permits, mock analyze/propose, typed refusals. No provider, no secrets.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { createServer } from 'node:net';
import path from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const tmp = path.join('/tmp', 'pp-live-zone-qa');
const shot = (name: string): string => path.join(tmp, name);
const f = (name: string): string => path.join(tmp, name);
// Striped-down use of the shared example only to prove the zones coexist;
// Zone L assertions use the synthetic clip below.
const dist = path.join(repoRoot, 'dashboard', 'dist');

function ff(...args: string[]): void {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
}

let browser: Browser | null = null;
let child: ChildProcess | null = null;
let childOut = '';
let origin = '';
let clipSha = '';
let clipBytes = 0;

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

function waitForOutput(re: RegExp, timeoutMs: number, from = 0): Promise<string> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      const m = childOut.slice(from).match(re);
      if (m?.[1] !== undefined) {
        clearInterval(timer);
        resolve(m[1]);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`never saw ${String(re)} in companion output`));
      }
    }, 100);
  });
}

async function terminalPairCode(): Promise<string> {
  const mark = childOut.length;
  await terminal('pair');
  return waitForOutput(/pairing code.*?: (\d{8})/, 15_000, mark);
}

function stopServer(c: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      c.kill('SIGKILL');
      resolve();
    }, 10_000);
    c.once('close', () => {
      clearTimeout(timer);
      resolve();
    });
    c.kill('SIGTERM');
  });
}

before(async () => {
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  execFileSync('pnpm', ['--dir', path.join(repoRoot, 'dashboard'), 'build'], { cwd: repoRoot, stdio: 'inherit' });
  ff('-f', 'lavfi', '-i', 'testsrc=size=640x480:rate=15:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', f('clip.mp4'));
  const bytes = readFileSync(f('clip.mp4'));
  clipSha = createHash('sha256').update(bytes).digest('hex');
  clipBytes = bytes.length;
  const port = await freePort();
  origin = `http://127.0.0.1:${String(port)}`;
  child = spawn(
    'node',
    ['scripts/c3-live-analysis.ts', '--port', String(port), '--serve', dist, '--mock-latency-ms', '300'],
    { cwd: repoRoot, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  child.stdout?.on('data', (d: Buffer) => {
    childOut += d.toString();
  });
  child.stderr?.on('data', (d: Buffer) => {
    childOut += d.toString();
  });
  await waitForHttpOk(`${origin}/`, 60_000);
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  if (child !== null) await stopServer(child);
});

async function newPage(viewport: { width: number; height: number }): Promise<Page> {
  const page = await browser!.newPage({ viewport });
  const bad: string[] = [];
  page.on('request', (req) => {
    const u = req.url();
    if (!u.startsWith(origin) && !/^(file:|blob:|data:|about:)/.test(u)) bad.push(u);
  });
  (page as unknown as { __badUrls: string[] }).__badUrls = bad;
  await page.goto(`${origin}/`, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForSelector('main h1, main h2', { timeout: 30_000 });
  return page;
}

function badUrls(page: Page): string[] {
  return (page as unknown as { __badUrls: string[] }).__badUrls;
}

async function terminal(command: string): Promise<void> {
  child!.stdin!.write(`${command}\n`);
  await new Promise((r) => setTimeout(r, 300));
}

test('L-ZONE-1: Zone L renders unpaired with terminal-pairing affordance; shell intact', async () => {
  const page = await newPage({ width: 1280, height: 800 });
  try {
    const body = await page.locator('main').innerText();
    assert.ok(body.includes('L · Live Analysis'), 'Zone L present');
    assert.ok(body.includes('Terminal pairing code'), 'pairing form shown while unpaired');
    assert.ok(body.includes('MOCK FIXTURE'), 'mock banner present before pairing');
    const h1 = await page.locator('h1').count();
    assert.equal(h1, 1, 'single top-level heading preserved');
    assert.deepEqual(badUrls(page), []);
  } finally {
    await page.close();
  }
});

test('L-ZONE-1: pair, upload synthetic MP4, permit, mock analyze with run identity', async () => {
  const page = await newPage({ width: 1280, height: 800 });
  try {
    const code = await terminalPairCode();
    await page.locator('#live-pair-code').fill(code);
    await page.getByRole('button', { name: 'Pair', exact: true }).click();
    await page.locator('#live-mp4').waitFor({ timeout: 15_000 });
    await page.locator('#live-mp4').setInputFiles(f('clip.mp4'));
    await page.getByText(clipSha.slice(0, 16), { exact: false }).waitFor({ timeout: 30_000 });
    // Analyze without a permit must refuse with a typed error.
    await page.getByRole('button', { name: 'Analyze with mock fixture', exact: true }).click();
    await page.getByText('NO_PERMIT', { exact: false }).waitFor({ timeout: 15_000 });
    // Terminal permit, then analyze: mock-labelled done state.
    await terminal(`permit analyze ${clipSha} ${String(clipBytes)}`);
    await page.getByRole('button', { name: 'Analyze with mock fixture', exact: true }).click();
    await page.getByText('live inference: no', { exact: false }).waitFor({ timeout: 30_000 });
    const body = await page.locator('main').innerText();
    assert.ok(body.includes('mock-fixture-model (D9 pending: not a live model)'), 'mock model identity shown');
    assert.ok(body.includes('prompt 410'), 'fixture usage shown');
    assert.ok(body.includes('live inference: no'), 'no live inference stated');
    const zoneL = await page.locator('section[aria-labelledby="zL"]').innerText();
    assert.ok(!zoneL.includes('VERIFIED'), 'no trusted chip inside Zone L output');
    assert.deepEqual(badUrls(page), []);
    await page.screenshot({ path: shot('desktop.png') });
  } finally {
    await page.close();
  }
});

test('L-ZONE-1: mock propose renders an untrusted, escaped correction triple', async () => {
  const page = await newPage({ width: 390, height: 844 });
  try {
    const code = await terminalPairCode();
    await page.locator('#live-pair-code').fill(code);
    await page.getByRole('button', { name: 'Pair', exact: true }).click();
    await page.locator('#live-mp4').waitFor({ timeout: 15_000 });
    await page.locator('#live-mp4').setInputFiles(f('clip.mp4'));
    await page.getByText(clipSha.slice(0, 16), { exact: false }).waitFor({ timeout: 30_000 });
    await terminal(`permit propose ${clipSha} ${String(clipBytes)}`);
    await page.getByRole('button', { name: 'Propose correction (mock)', exact: true }).click();
    await page.getByText('Rendered CSS', { exact: false }).waitFor({ timeout: 30_000 });
    const body = await page.locator('main').innerText();
    assert.ok(body.includes('.promo-overlay'), 'closed-grammar triple rendered as text');
    assert.ok(body.includes('never executed'), 'no-execution disclosure present');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    assert.ok(overflow, 'no page-level horizontal overflow at 390px');
    assert.deepEqual(badUrls(page), []);
    await page.screenshot({ path: shot('mobile.png') });
  } finally {
    await page.close();
  }
});
