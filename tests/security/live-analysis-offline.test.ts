// UI-C3-02-I2: static, synthetic-only negative boundary for draft companion
// helpers. Future real transport must be a separate reviewed implementation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const names = ['config.ts', 'request-guard.ts', 'local-session.ts', 'mock-permits.ts', 'live-spent-record.ts'];
const root = path.resolve(import.meta.dirname, '../../packages/live-analysis/src');

test('I2 helpers cannot read environment, start a listener, or contact providers', () => {
  for (const filename of names) {
    const body = readFileSync(path.join(root, filename), 'utf8');
    // Inspect code portions without comments to avoid false positives from
    // documented forbidden strings. This is an additional narrow safety net,
    // not a replacement for behavioral tests or independent review.
    const source = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const re of [
      /process\.env\b/,
      /\bfetch\s*\(/,
      /\bcreateServer\s*\(/,
      /\bhttps?\.request\s*\(/,
      /\bnet\.connect\s*\(/,
      /\bspawn\s*\(/,
      /\bexecFile\s*\(/,
      /\bBASETEN_API_KEY\b/,
      /\bBASETEN_API_BASE_URL\b/,
      /\bBASETEN_MODEL\b/,
      /\bPROOFPILOT_ALLOW_BILLABLE_CALLS\b/,
    ]) assert.doesNotMatch(source, re, `${filename}: prohibited live surface ${re}`);
  }
});

// UI-C3-02-I2/I4: the same prohibition class for the companion server,
// upload store, request encoder, sanitizer, and mock transport. The server
// is the one reviewed exception that may listen — bound to 127.0.0.1 only —
// and it must never imply a live model (no response_format/JSON-mode flag).
// UI-C3-02-BT-LIVE-01: `baseten-transport.ts` joins this list. It is the one
// reviewed exception that may name an INJECTED fetch implementation — and it
// still calls no ambient `fetch(`, reads no env/secret, names no endpoint
// string, and describes no response format. Dedicated assertions below.
const serverSide = ['server.ts', 'uploads.ts', 'baseten-request.ts', 'responses.ts', 'mock-transport.ts', 'baseten-transport.ts', 'live-spent-record.ts', 'live-attempts.ts'];

test('I2/I4 server modules stay offline, loopback-only, and D9-blocked', () => {
  for (const filename of serverSide) {
    const body = readFileSync(path.join(root, filename), 'utf8');
    const source = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const re of [
      /process\.env\b/,
      /\bfetch\s*\(/,
      /\bhttps?\.request\s*\(/,
      /\bnet\.connect\s*\(/,
      /\bspawn\s*\(/,
      /\bexecFile\s*\(/,
      /\bchild_process\b/,
      /\bworker_threads\b/,
      /\bBASETEN_API_KEY\b/,
      /\bBASETEN_API_BASE_URL\b/,
      /\bBASETEN_MODEL\b/,
      /\bPROOFPILOT_ALLOW_BILLABLE_CALLS\b/,
      /\b0\.0\.0\.0\b/,
      /\bresponse_format\b/,
      /\bjson_schema\b/,
    ]) assert.doesNotMatch(source, re, `${filename}: prohibited live surface ${re}`);
    if (filename === 'server.ts') {
      assert.match(source, /127\.0\.0\.1/, 'server.ts binds loopback only');
    } else {
      assert.doesNotMatch(source, /\.listen\s*\(/, `${filename}: only server.ts may listen`);
    }
  }
});

// UI-C3-02-D9-I1: owner credential names live only in the owner-started CLI.
// The runtime, dashboard, and every other script must not name them; only
// scripts/c3-live-analysis.ts reads exactly BASETEN_API_KEY,
// BASETEN_API_BASE_URL, and BASETEN_MODEL from its own environment, and only
// after --live passes the D9 gate. (scripts/lint.mjs names BASETEN_API_KEY
// inside its own secret-detection pattern, which is the policy scanner
// itself — not credential use.)
test('D9-I1 owner credential names live only in the owner-started CLI', () => {
  const repoRoot = path.resolve(import.meta.dirname, '../..');
  const cli = readFileSync(path.join(repoRoot, 'scripts/c3-live-analysis.ts'), 'utf8');
  for (const name of ['BASETEN_API_KEY', 'BASETEN_API_BASE_URL']) {
    assert.match(cli, new RegExp(`\\b${name}\\b`), `CLI names ${name}`);
  }
  assert.match(cli, /\bBASETEN_MODEL\b/, 'CLI names BASETEN_MODEL');
  const strip = (body: string): string =>
    body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') out.push(...walk(full));
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        out.push(full);
      }
    }
    return out;
  };
  const codeRoots = [
    path.join(repoRoot, 'packages/live-analysis/src'),
    path.join(repoRoot, 'dashboard/src'),
  ];
  for (const file of codeRoots.flatMap(walk)) {
    const source = strip(readFileSync(file, 'utf8'));
    for (const re of [/\bBASETEN_API_KEY\b/, /\bBASETEN_API_BASE_URL\b/, /\bBASETEN_MODEL\b/, /process\.env\b/]) {
      assert.doesNotMatch(source, re, `${path.relative(repoRoot, file)}: credential name or env read outside the CLI (${re})`);
    }
  }
});

// UI-C3-02-BT-LIVE-01: the live transport's pinned destination, explicit
// injection, and redirect refusal. Destination and model come only from
// reviewed constants; the network arrives only as the injected `fetchImpl`
// (required, no default); redirects refuse instead of following.
test('BT-LIVE-01 live transport is pinned, injected, and redirect-refusing', () => {
  const body = readFileSync(path.join(root, 'baseten-transport.ts'), 'utf8');
  const source = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(source, /BASETEN_APPROVED_ENDPOINT/, 'destination is the pinned constant');
  assert.match(source, /D9_APPROVED_MODEL/, 'model identity is the hackathon-approved D9 pin, never the public listing');
  assert.match(source, /readonly fetchImpl: LiveFetch/, 'fetch implementation is required and explicit');
  assert.match(source, /redirect: 'error'/, 'redirects refuse instead of following');
  assert.doesNotMatch(source, /['"]https?:\/\//, 'no endpoint string literals in the transport');
});
