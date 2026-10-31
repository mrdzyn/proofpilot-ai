// UI-C3-02-I2/I4: owner-started localhost companion (MOCK transport only).
//
//   node scripts/c3-live-analysis.ts [--port 5188] [--serve <distDir>|none]
//       [--base-url https://inference.baseten.co/v1]
//       [--mock-latency-ms 1200] [--analyses 3] [--proposals 1]
//
// Terminal commands (stdin): pair | permit <analyze|propose> <sha256> <bytes>
// | revoke | status | quit. Pairing codes and permits are created ONLY here,
// never over HTTP. No environment reads, no credentials, no provider calls.
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { createCompanion, DEFAULT_PORT } from '../packages/live-analysis/src/server.ts';

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

const companion = await createCompanion({
  port,
  serveRoot: serveRoot ?? defaultDist,
  baseUrl,
  analysesLeft: flagInt(argv, '--analyses', 3),
  proposalsLeft: flagInt(argv, '--proposals', 1),
  // Built-in mock transport aborts promptly on cancel (shouldCancel over the
  // run records); --mock-latency-ms only stretches the cancellable window.
  transportLatencyMs: flagInt(argv, '--mock-latency-ms', 1200),
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
console.log(`ui-c3-02 companion (mock transport, no live inference) on http://127.0.0.1:${String(companion.port)}`);
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
