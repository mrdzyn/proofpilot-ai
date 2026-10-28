// DID-1: a SEPARATE demonstration of what Playwright request routing does and does not catch.
//
// It serves a hand-written page from a throwaway loopback server on an ephemeral port, opens a fresh
// Chromium context whose routing allows only that exact origin and aborts everything else, and has the
// page try to reach an RFC 2606 `.invalid` host and a canary listener on a second loopback port.
// It is NOT a candidate verdict (the result type has no status a candidate could share), it is not
// part of any scoreboard verdict, and it says nothing about candidate runs: the candidate oracle runs
// unmodified and uninstrumented, and Playwright routing is not process or OS isolation.
//
// Deliberately not exported from index.ts: it pulls in Playwright and must be imported by path.
import { createServer as createHttp } from 'node:http';
import { createServer as createTcp } from 'node:net';
import type { AddressInfo } from 'node:net';
import { chromium } from '@playwright/test';
import { scrubEnv } from './env.ts';

export type Did1Result = {
  kind: 'DID-1';
  /** Always false: this is a demonstration, never a candidate verdict. */
  isCandidateVerdict: false;
  claim: string;
  passed: boolean;
  allowedPageLoaded: boolean;
  blockedUrls: string[];
  pageFetchOutcomes: { invalidHost: string; canary: string };
  canaryConnections: number;
  /** Sensitivity control: the same canary fetch WITHOUT routing must reach the canary, or the detector proves nothing. */
  controlCanaryConnectionsWithoutRouting: number;
  limits: string[];
};

const PAGE = `<!doctype html><meta charset="utf-8"><title>did-1</title><script>
const q = new URLSearchParams(location.search);
const out = { invalidHost: 'skipped', canary: 'pending' };
const canary = q.get('canary');
const tries = [];
if (q.get('control') !== '1') tries.push(fetch('http://did1-blocked.invalid/x', { mode: 'no-cors' }).then(() => { out.invalidHost = 'resolved'; }, () => { out.invalidHost = 'rejected'; }));
tries.push(fetch(canary, { mode: 'no-cors' }).then(() => { out.canary = 'resolved'; }, () => { out.canary = 'rejected'; }));
Promise.all(tries).then(() => { window.__did1 = out; });
</script>`;

function listen<T extends { listen: (...a: never[]) => unknown }>(s: T, ...args: unknown[]): Promise<void> {
  return new Promise((resolve) => (s.listen as unknown as (...a: unknown[]) => void)(...args, resolve));
}

export async function runDid1(): Promise<Did1Result> {
  let canaryConnections = 0;
  const sockets = new Set<import('node:net').Socket>();
  const canary = createTcp((sock) => {
    canaryConnections++;
    sockets.add(sock);
    sock.on('error', () => undefined);
    sock.end('HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
  });
  await listen(canary, 0, '127.0.0.1');
  const canaryPort = (canary.address() as AddressInfo).port;
  const page = createHttp((_req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE));
  await listen(page, 0, '127.0.0.1');
  const pagePort = (page.address() as AddressInfo).port;
  const origin = `http://127.0.0.1:${pagePort}`;
  const canaryUrl = `http://127.0.0.1:${canaryPort}/canary`;

  const browser = await chromium.launch({ headless: true, env: scrubEnv(process.env) as Record<string, string> });
  try {
    // ---- routed context: only the page origin may be reached ----
    const blockedUrls: string[] = [];
    const ctx = await browser.newContext();
    await ctx.route('**/*', async (route) => {
      const url = route.request().url();
      if (new URL(url).origin === origin) await route.continue();
      else {
        blockedUrls.push(url);
        await route.abort('blockedbyclient');
      }
    });
    const p = await ctx.newPage();
    await p.goto(`${origin}/?canary=${encodeURIComponent(canaryUrl)}`);
    await p.waitForFunction(() => (window as unknown as { __did1?: unknown }).__did1 !== undefined, undefined, { timeout: 10_000 });
    const outcomes = await p.evaluate(() => (window as unknown as { __did1: { invalidHost: string; canary: string } }).__did1);
    const connectionsWhileRouted = canaryConnections;
    await ctx.close();

    // ---- sensitivity control: no routing, canary only (loopback; the `.invalid` host is not attempted) ----
    const open = await browser.newContext();
    const p2 = await open.newPage();
    await p2.goto(`${origin}/?control=1&canary=${encodeURIComponent(canaryUrl)}`);
    await p2.waitForFunction(() => (window as unknown as { __did1?: unknown }).__did1 !== undefined, undefined, { timeout: 10_000 });
    await open.close();
    const controlConnections = canaryConnections - connectionsWhileRouted;

    const blockedInvalid = blockedUrls.some((u) => u.includes('did1-blocked.invalid'));
    const blockedCanary = blockedUrls.includes(canaryUrl);
    const passed = outcomes.invalidHost === 'rejected' && outcomes.canary === 'rejected' && blockedInvalid && blockedCanary && connectionsWhileRouted === 0 && controlConnections >= 1;
    return {
      kind: 'DID-1',
      isCandidateVerdict: false,
      claim: 'Playwright request routing aborted every URL outside the one allowed origin for this hand-authored page.',
      passed,
      allowedPageLoaded: true,
      blockedUrls: blockedUrls.map((u) => u.replace(/:\d+/, ':<port>')),
      pageFetchOutcomes: outcomes,
      canaryConnections: connectionsWhileRouted,
      controlCanaryConnectionsWithoutRouting: controlConnections,
      limits: [
        'This is NOT proof that candidate runs are sandboxed: the candidate oracle runs unmodified and uninstrumented.',
        'Playwright routing is not process or OS isolation and does not stop code outside the browser.',
        'The routed page was hand-written; no candidate, proposal or model output was loaded.',
      ],
    };
  } finally {
    await browser.close();
    for (const sock of sockets) sock.destroy(); // a half-closed socket would keep close() waiting forever
    page.closeAllConnections();
    await new Promise<void>((r) => canary.close(() => r()));
    await new Promise<void>((r) => page.close(() => r()));
  }
}
