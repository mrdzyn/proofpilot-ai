// UI-C3-02-I2: static, synthetic-only negative boundary for draft companion
// helpers. Future real transport must be a separate reviewed implementation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const names = ['config.ts', 'request-guard.ts', 'local-session.ts', 'mock-permits.ts'];
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
      /\bPROOFPILOT_ALLOW_BILLABLE_CALLS\b/,
    ]) assert.doesNotMatch(source, re, `${filename}: prohibited live surface ${re}`);
  }
});

// UI-C3-02-I2/I4: the same prohibition class for the companion server,
// upload store, request encoder, sanitizer, and mock transport. The server
// is the one reviewed exception that may listen — bound to 127.0.0.1 only —
// and it must never imply a live model (no response_format/JSON-mode flag).
const serverSide = ['server.ts', 'uploads.ts', 'baseten-request.ts', 'responses.ts', 'mock-transport.ts'];

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
