// UI-C3-02-I2/I4 + D9-I1: owner-started localhost companion (mock by
// default; Baseten live path only with explicit `--live`).
//
//   node scripts/c3-live-analysis.ts [--port 5188] [--serve <distDir>|none]
//       [--base-url https://inference.baseten.co/v1]
//       [--mock-latency-ms 1200] [--analyses 3] [--proposals 1]
//       [--live [--live-analyses 1|unlimited] [--live-proposals 0]
//        [--live-spent-record <path>] [--live-media-sha256 <hex>]
//        [--live-approval-id <id>]]
//
// Owner standing policy (issue #39: repeatable manually initiated analyses,
// zero proposals): `--live` refuses before companion startup unless
// `--live-proposals` is 0. `--live-analyses` is 0 (zero-budget diagnostic),
// a finite non-negative integer, or `unlimited` (explicit opt-in; the ledger
// still spends exactly once per send and every spend is durably recorded).
// A positive live-analysis budget additionally requires `--live-media-sha256`
// to equal the approved F01 SHA-256 exactly, a spent-record path, and — for
// `unlimited` — the versioned standing approval identity (`d9live-v2-…`).
// Every provider attempt additionally needs a fresh single-use terminal
// permit plus an explicit dashboard click: the budget never sends on its own,
// never retries, and never runs in parallel. Numeric live-budget flags must
// be canonical non-negative integers (no junk suffixes, no negatives).
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
// dashboard, browser, tests, CI, or persisted artifacts. Without `--live`
// (or `--preflight`), the environment is never read and live inference is
// impossible, even when the variables are set.
//
// `--preflight` (owner-run only): after the same gates, performs exactly one
// non-billable GET to the `/v1/models` catalog, prints a key-free summary,
// and exits — no companion, no listener, no record, no inference, no retry.
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import {
  createCompanion,
  DEFAULT_PORT,
} from '../packages/live-analysis/src/server.ts';
import {
  APPROVED_F01_MEDIA_SHA256,
  BASETEN_APPROVED_BASE_URL,
  D9_APPROVED_MODEL,
  validateBasetenBaseUrl,
  validateLiveModel,
} from '../packages/live-analysis/src/config.ts';
import {
  createBasetenTransport,
  type BasetenTransport,
  type LiveFetch,
} from '../packages/live-analysis/src/baseten-transport.ts';
import {
  checkAccountAvailability,
  type PreflightFetch,
} from '../packages/live-analysis/src/preflight.ts';
import { STANDING_APPROVAL_ID_RE } from '../packages/live-analysis/src/live-spent-record.ts';

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

/**
 * Strict canonical parsing for the live-analyses budget flag. Accepts
 * all-digit non-negative integers or the literal `unlimited` (explicit
 * standing-policy opt-in, Infinity). `parseInt` truncation ("1junk" -> 1)
 * must never widen an authorization bound, so anything else refuses before
 * the companion starts, with zero listener and zero network.
 */
function flagLiveBudget(argv: string[], name: string, fallback: number): number {
  const raw = flagValue(argv, name);
  if (raw === null) return fallback;
  if (name === '--live-analyses' && raw === 'unlimited') return Number.POSITIVE_INFINITY;
  if (!/^[0-9]+$/.test(raw)) {
    console.error(`refused: ${name} must be a canonical non-negative integer${name === '--live-analyses' ? " or 'unlimited'" : ''} (got ${JSON.stringify(raw)})`);
    process.exit(2);
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(n)) {
    console.error(`refused: ${name} must be a canonical non-negative integer (got ${JSON.stringify(raw)})`);
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
// `--live` is passed, and only the three documented variables below. The D9
// model approval is pinned in config.ts; live startup still refuses here on
// any missing key, unapproved URL, or model mismatch — never a silent start.
const liveRequested = argv.includes('--live');
const preflightRequested = argv.includes('--preflight');
if (liveRequested && preflightRequested) {
  console.error('refused: --preflight cannot be combined with --live (preflight never starts a companion)');
  process.exit(2);
}
let liveTransport: BasetenTransport | null = null;
let liveModel: string | undefined;
let liveAnalysesLeft = 0;
let liveProposalsLeft = 0;
let liveUnlimited = false;
let liveSpentRecordPath: string | undefined;
let liveMediaSha256: string | undefined;
let liveBootstrapApprovalId: string | undefined;
if (liveRequested || preflightRequested) {
  // Defensive re-check of the D9 pin itself: if the approval ever goes
  // missing, live startup refuses before touching credentials or network.
  if (!validateLiveModel(D9_APPROVED_MODEL).ok) {
    console.error('refused: live mode unavailable (no D9-approved model; no live request was made)');
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
  // No public-listing fallback: when the owner leaves BASETEN_MODEL unset the
  // CLI defaults to the hackathon-approved D9 pin itself, and any other
  // configured value still refuses by exact equality below.
  const configuredModel = process.env['BASETEN_MODEL'] ?? D9_APPROVED_MODEL;
  const modelCheck = validateLiveModel(configuredModel);
  if (!modelCheck.ok) {
    // The configured value is validated separately and never translated:
    // anything but the byte-identical D9-approved ID refuses (aliases,
    // dated variants, and empty values included).
    console.error(`refused: live model is not approved (${modelCheck.code})`);
    process.exit(2);
  }
  liveModel = modelCheck.model;
  if (preflightRequested) {
    // Owner-supervised account check only: one non-billable catalog GET, no
    // companion, no listener, no record, no inference, no retries. The key
    // travels only in this request's Authorization header and is never
    // printed; the summary below is key-free by construction.
    const fetchImpl: PreflightFetch = (url, init) => fetch(url, {
      method: init.method,
      headers: init.headers,
      signal: init.signal,
      redirect: init.redirect,
    });
    const result = await checkAccountAvailability(
      fetchImpl,
      { baseUrl: liveBaseUrl, model: configuredModel, apiKey },
    );
    if (!result.ok) {
      console.error(`refused: preflight failed (${result.code}: ${result.detail})`);
      process.exit(2);
    }
    if (!result.modelListed) {
      console.error(`refused: preflight connected but the D9-approved model is not listed for this account (catalog=${result.catalogCount}); do not proceed with --live`);
      process.exit(2);
    }
    console.log(`preflight: ok account-reachable model-listed catalog=${result.catalogCount} endpoint=${result.endpoint}`);
    process.exit(0);
  }
  liveAnalysesLeft = flagLiveBudget(argv, '--live-analyses', 0);
  liveProposalsLeft = flagLiveBudget(argv, '--live-proposals', 0);
  liveSpentRecordPath = flagValue(argv, '--live-spent-record') ?? undefined;
  liveMediaSha256 = flagValue(argv, '--live-media-sha256') ?? undefined;
  liveBootstrapApprovalId = flagValue(argv, '--live-approval-id') ?? undefined;
  // Owner standing policy (issue #39: repeatable manually initiated
  // analyses, zero proposals). Enforced here in the production CLI — before
  // the companion starts and before any transport exists. `--live-analyses`
  // is 0 (diagnostic), a finite count, or `unlimited`; `--live-proposals`
  // is always 0. The budget alone authorizes nothing: every provider attempt
  // additionally needs a fresh single-use terminal permit plus an explicit
  // dashboard click (no auto-send, no retry, no parallel sends). The shared
  // ledger stays general for test doubles; this gate is the production
  // policy.
  if (liveProposalsLeft !== 0) {
    console.error('refused: --live-proposals must be 0 (no proposal request is approved)');
    process.exit(2);
  }
  liveUnlimited = liveAnalysesLeft === Number.POSITIVE_INFINITY;
  // The approved analyses are bound to the certified F01 clip. A positive
  // live-analysis budget without the exact owner-approved media pin refuses
  // here — omission, mismatch, and malformed pins alike — so a different
  // synthetic or private video can never be armed by accident.
  if (liveAnalysesLeft > 0 && liveMediaSha256 !== APPROVED_F01_MEDIA_SHA256) {
    console.error('refused: a positive live-analysis budget requires --live-media-sha256 to be exactly the approved F01 SHA-256');
    process.exit(2);
  }
  // Repeatable sessions run only under the versioned standing approval
  // identity: the bootstrap id must carry the `d9live-v2-` namespace, so a
  // legacy or historical approval string can never open an unlimited ledger.
  // (The server re-checks the record genesis itself at startup, so pointing
  // an unlimited run at a historical record refuses there too.)
  if (liveUnlimited && liveBootstrapApprovalId !== undefined &&
    !STANDING_APPROVAL_ID_RE.test(liveBootstrapApprovalId)) {
    console.error('refused: --live-analyses unlimited requires a versioned standing approval id (--live-approval-id d9live-v2-…)');
    process.exit(2);
  }
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
  liveBootstrapApprovalId,
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
  // ARMED banner: it never prints credential values, only presence.
  console.log(`ui-c3-02 companion (LIVE Baseten path ARMED) on http://127.0.0.1:${String(companion.port)}`);
  console.log(`live: model=${liveModel ?? 'none'} endpoint=${BASETEN_APPROVED_BASE_URL} budget=analyses:${liveUnlimited ? 'unlimited' : liveAnalysesLeft} proposals:${liveProposalsLeft} record=${liveSpentRecordPath ?? 'none'} pin=${liveMediaSha256 === undefined ? 'none' : 'set'} credential=BASETEN_API_KEY present`);
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
      // Terminal status reports the actual mode: mock-only by default, the
      // armed live path only after --live passes every gate.
      console.log(JSON.stringify({ ok: true, service: 'ui-c3-02-companion', version: 'mock', port, mode: liveTransport !== null ? 'live-armed' : 'mock-only' }));
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
