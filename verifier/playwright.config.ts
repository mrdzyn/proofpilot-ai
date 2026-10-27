// Trusted verifier configuration. This directory is a trust root: it is denied
// to the patch agent by config/patch-policy.json and must never be mounted into
// a candidate patch workspace.
import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = path.resolve(
  process.env.PROOFPILOT_EVIDENCE_DIR ?? path.join(repoRoot, '.proofpilot/runs/adhoc'),
);
const port = 4173;

export default defineConfig({
  testDir: './f01',
  outputDir: path.join(evidenceDir, 'test-results'),
  timeout: 30_000,
  expect: { timeout: 2_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(evidenceDir, 'oracle-report.json') }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: 'chromium',
    headless: true,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    deviceScaleFactor: 1,
    trace: 'on',
    screenshot: 'on',
  },
  webServer: {
    command: 'node fixtures/sample-store/server.mjs',
    cwd: repoRoot,
    url: `http://127.0.0.1:${port}/product/demo`,
    env: { FIXTURE_PORT: String(port) },
    // A fresh fixture process per run; an already-bound port fails the run
    // instead of silently testing an unknown server.
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
