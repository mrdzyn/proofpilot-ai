// UI-C3-02-I2/I4 + D9-I1: owner-started localhost companion (mock by
// default; Baseten live path only with explicit `--live`).
//
//   node scripts/c3-live-analysis.ts [--port 5188] [--serve <distDir>|none]
//       [--base-url https://inference.baseten.co/v1]
//       [--mock-latency-ms 1200] [--analyses 3] [--proposals 1]
//       [--live [--live-analyses 1] [--live-proposals 0]
//        [--live-spent-record <path>] [--live-media-sha256 <hex>]]
//
// Terminal commands (stdin): pair | permit <analyze|propose> <sha256> <bytes>
// | revoke | status | quit. Pairing codes and permits are created ONLY here,
// never over HTTP.
//
// Live mode (D9-I1, default OFF): `--live` arms the dormant Baseten
// transport. The owner-started process then reads exactly three variables
// from its own environment — BASETEN_API_KEY, BASETEN_API_BASE_URL,
// BASETEN_MODEL — after the configuration and activation gates below. The
// key is never printed, never leaves this process, and never reaches the
// dashboard, browser, tests, CI, or persisted artifacts. Without `--live`,
// the environment is never read and live inference is impossible, even when
// the variables are set. D9 stays null in this slice, so `--live` startup
// always refuses until a separately reviewed D9 decision lands.
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import {
  createCompanion,
  DEFAULT_PORT,
} from '../packages/live-analysis/src/server.ts';
import {
  BASETEN_APPROVED_BASE_URL,
  BASETEN_DOCUMENTED_DIRECT_MODEL,
  D9_APPROVED_MODEL,
  validateBasetenBaseUrl,
  validateLiveModel,
} from '../packages/live-analysis/src/config.ts';
import {
  createBasetenTransport,
  type BasetenTransport,
  type LiveFetch,
} from '../packages/live-analysis/src/baseten-transport.ts';

function flagValue(argv: string[], name: string): string | null {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? (argv[i + 1] as string) : null;
}

function flagInt(argv: string[], name: string, fallback: number): number {
  const raw = flagValue(argv, name);
  if (raw === null) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(n) || n < 0) {
    console.error(`refused: ${name} must be a non-negative integer`);
    process.exit(2);
  }
  return n;
}

const argv = process.argv.slice(2);
const port = flagInt(argv, '--port', DEFAULT_PORT);
// Port 0 selects an ephemeral loopback port (used by automated tests); the
// actual bound port is printed on startup and is the only one that listens.
if (port < 0 || port > 65535) {
  console.error('refused: --port must be 0-65535 (0 = ephemeral loopback)');
  process.exit(2);
}
const serveOpt = flagValue(argv, '--serve');
const repoRoot = path.resolve(import.meta.dirname, '..');
const defaultDist = path.join(repoRoot, 'dashboard', 'dist');
const serveRoot = serveOpt === null || serveOpt === undefined || serveOpt === '' || serveOpt === 'none' ? null : serveOpt;
const baseUrl = flagValue(argv, '--base-url') ?? 'https://inference.baseten.co/v1';

// Live mode is explicit-opt-in only. The environment is read if and only if
// `--live` is passed, and only the three documented variables below. D9 stays
// null in this slice, so live startup always refuses here until a separately
// reviewed D9 decision records the exact approved model.
const liveRequested = argv.includes('--live');
let liveTransport: BasetenTransport | null = null;
let liveModel: string | undefined;
let liveAnalysesLeft = 0;
let liveProposalsLeft = 0;
let liveSpentRecordPath: string | undefined;
let liveMediaSha256: string | undefined;
if (liveRequested) {
  if (D9_APPROVED_MODEL === null) {
    console.error('refused: live mode unavailable (D9 pending: no model is approved; no live request was made)');
    process.exit(2);
  }
  const apiKey = process.env['BASETEN_API_KEY'];
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    console.error('refused: live mode requires BASETEN_API_KEY in the owner-started process environment');
    process.exit(2);
  }
  const liveBaseUrl = process.env['BASETEN_API_BASE_URL'] ?? BASETEN_APPROVED_BASE_URL;
  const baseCheck = validateBasetenBaseUrl(liveBaseUrl);
  if (!baseCheck.ok) {
    console.error(`refused: live base URL is not approved (${baseCheck.code})`);
    process.exit(2);
  }
  const configuredModel = process.env['BASETEN_MODEL'] ?? BASETEN_DOCUMENTED_DIRECT_MODEL;
  const modelCheck = validateLiveModel(configuredModel);
  if (!modelCheck.ok) {
    // The configured value is validated separately and never translated:
    // anything but the D9-approved exact ID refuses, including the proposed
    // direct-Baseten ID while D9 is pending.
    console.error(`refused: live model is not approved (${modelCheck.code})`);
    process.exit(2);
  }
  liveModel = modelCheck.model;
  liveAnalysesLeft = flagInt(argv, '--live-analyses', 0);
  liveProposalsLeft = flagInt(argv, '--live-proposals', 0);
  liveSpentRecordPath = flagValue(argv, '--live-spent-record') ?? undefined;
  liveMediaSha256 = flagValue(argv, '--live-media-sha256') ?? undefined;
  if (liveAnalysesLeft + liveProposalsLeft > 0 && (liveSpentRecordPath === undefined || liveSpentRecordPath === '')) {
    console.error('refused: a nonzero live budget requires --live-spent-record');
    process.exit(2);
  }
  // Injected fetch over the owner process global: the single POST per
  // approval, built by the pinned transport. No discovery, no preflight
  // request, no background traffic — construction performs zero I/O.
  const fetchImpl: LiveFetch = (url, init) => fetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    signal: init.signal,
    redirect: init.redirect,
  });
  const created = createBasetenTransport({ model: liveModel, apiKey, fetchImpl, timeoutMs: 120_000 });
  if (!created.ok) {
    console.error(`refused: live transport rejected (${created.code})`);
    process.exit(2);
  }
  liveTransport = created.transport;
}

const companion = await createCompanion({
  port,
  serveRoot: serveRoot ?? defaultDist,
  baseUrl,
  analysesLeft: flagInt(argv, '--analyses', 3),
  proposalsLeft: flagInt(argv, '--proposals', 1),
  // Built-in mock transport aborts promptly on cancel (shouldCancel over the
  // run records); --mock-latency-ms only stretches the cancellable window.
  transportLatencyMs: flagInt(argv, '--mock-latency-ms', 1200),
  liveTransport,
  liveModel,
  liveAnalysesLeft,
  liveProposalsLeft,
  liveSpentRecordPath,
  liveMediaSha256,
}).catch((error: unknown) => {
  console.error(`refused: cannot start companion (${error instanceof Error ? error.message : 'unknown'})`);
  process.exit(2);
});

// Abnormal-shutdown cleanup: SIGINT/SIGTERM/quit/revoke paths delete staged
// bytes eagerly via companion.close(). Only SIGKILL-class deaths (kill -9,
// power loss) can leave staging roots behind; those are swept on the next
// startup by sweepStaleStagingDirs (see uploads.ts).
let closing = false;
async function shutdown(signal: string): Promise<void> {
  if (closing) return;
  closing = true;
  console.log(`closing on ${signal}: cancelling in-flight runs, deleting staged bytes`);
  try {
    await companion.close();
  } catch {
    /* best effort */
  }
  try {
    rl.close();
  } catch {
    /* best effort */
  }
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
if (liveRequested) {
  // D9 is null in this slice, so this line is unreachable until a reviewed
  // D9 decision lands; it never prints credential values, only presence.
  console.log(`ui-c3-02 companion (LIVE Baseten path ARMED) on http://127.0.0.1:${String(companion.port)}`);
  console.log(`live: model=${liveModel ?? 'none'} endpoint=${BASETEN_APPROVED_BASE_URL} budget=analyses:${liveAnalysesLeft} proposals:${liveProposalsLeft} record=${liveSpentRecordPath ?? 'none'} pin=${liveMediaSha256 === undefined ? 'none' : 'set'} credential=BASETEN_API_KEY present`);
} else {
  console.log(`ui-c3-02 companion (mock transport, no live inference) on http://127.0.0.1:${String(companion.port)}`);
}
console.log(`serving: ${serveRoot ?? defaultDist} (API-only if missing)`);
console.log(`staging: ${companion.uploads.stagingRoot} (deleted on quit/SIGINT/SIGTERM/revoke)`);
console.log('commands: pair | permit <analyze|propose> <sha256> <bytes> | revoke | status | quit');

const SHA_RE = /^[0-9a-f]{64}$/;
for await (const line of rl) {
  const [command, ...rest] = line.trim().split(/\s+/);
  try {
    if (command === 'quit' || command === 'exit') break;
    else if (command === 'pair') {
      const code = companion.sessions.issueTerminalCode();
      console.log(`pairing code (single-use, 2-minute TTL): ${code}`);
    } else if (command === 'permit') {
      const [kind, sha256, bytesRaw] = rest;
      const bytes = Number.parseInt(bytesRaw ?? '', 10);
      if ((kind !== 'analyze' && kind !== 'propose') || typeof sha256 !== 'string' || !SHA_RE.test(sha256) || !Number.isSafeInteger(bytes) || bytes <= 0) {
        console.log('refused: usage: permit <analyze|propose> <64-hex-sha256> <bytes>');
        continue;
      }
      const out = companion.terminalPermit(kind, sha256, bytes);
      console.log(out.ok ? `permit registered for ${kind} ${sha256.slice(0, 12)}… (${bytes} bytes)` : `refused: ${out.code}`);
    } else if (command === 'revoke') {
      companion.terminalRevoke();
      console.log('revoked: sessions, permits, staged bytes; in-flight runs cancelled');
    } else if (command === 'status') {
      console.log(JSON.stringify({ ok: true, service: 'ui-c3-02-companion', version: 'mock', port }));
    } else if (command === 'help' || command === '') {
      console.log('commands: pair | permit <analyze|propose> <sha256> <bytes> | revoke | status | quit');
    } else if (command !== undefined) {
      console.log(`refused: unknown command ${JSON.stringify(command)}`);
    }
  } catch (error) {
    console.log(`refused: terminal command failed (${error instanceof Error ? error.message : 'unknown'})`);
  }
}

await companion.close();
rl.close();
process.exit(0);
