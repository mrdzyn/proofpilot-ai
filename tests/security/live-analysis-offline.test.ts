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
