// UI-C3-01B T-TRUTH: every hardcoded dashboard historical value matches its
// reviewed source byte-for-byte. No provider, no browser, no stored artifact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { HISTORICAL } from '../../dashboard/src/lib/historical.ts';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const read = (p: string): string => readFileSync(path.join(repoRoot, p), 'utf8');

const status = read('docs/STATUS.md');
const smoke = read('docs/LIVE-SMOKE.md');
const report = read('docs/LIVE-C3-01-EXECUTION-REPORT.md');

test('F01 clip SHAs and dimensions match the certified record', () => {
  assert.equal(
    HISTORICAL.mobileClip.sha256,
    'e9df68b14c48300818f9ec9407b884413037f29305f17a5da3cc4fac05eeafdf',
  );
  assert.equal(
    HISTORICAL.desktopClip.sha256,
    'e565e8bfe922dd5eb44def64c5f076ab963d9e9156f619196e4f3cce8b71976d',
  );
  assert.ok(status.includes(HISTORICAL.mobileClip.sha256));
  assert.ok(status.includes(HISTORICAL.desktopClip.sha256));
  assert.ok(status.includes('390×844'));
  assert.ok(status.includes('1280×800'));
  assert.ok(status.includes(HISTORICAL.fixtureSet));
});

test('C2B run values match the reviewed smoke record', () => {
  assert.equal(HISTORICAL.run001.uploadId, 'df486a8b-18e5-47cf-bc70-e028b238b5f8');
  assert.equal(HISTORICAL.run001.responseId, '536fb081-2d11-4010-aa3a-fb510c3626bc');
  assert.equal(HISTORICAL.run002.uploadId, '44a30289-e276-4645-9ba2-01402b5f4241');
  assert.equal(HISTORICAL.run002.responseId, '585e7494-7cdd-44a1-b6ed-44f48a03bb44');
  for (const v of [
    HISTORICAL.run001.uploadId,
    HISTORICAL.run001.responseId,
    HISTORICAL.run002.uploadId,
    HISTORICAL.run002.responseId,
  ]) {
    assert.ok(status.includes(v), `STATUS.md must contain ${v}`);
  }
  assert.ok(status.includes('2773 / 1500 / 1113 / 4273'));
  assert.ok(status.includes('2773 / 1129 / 665 / 3902'));
  for (const n of ['2773', '1500', '1113', '4273']) {
    assert.ok(HISTORICAL.run001.usage.includes(n));
  }
  for (const n of ['2773', '1129', '665', '3902']) {
    assert.ok(HISTORICAL.run002.usage.includes(n));
  }
  assert.ok(smoke.includes('two taps'));
  assert.ok(status.includes('3.3 s') && status.includes('6.4 s'));
  assert.ok(report.includes('7cb1e5e2-3d88-42ab-9652-fcab88b690d8'));
  assert.ok(report.includes('4e1466e8adf1ee58b6c050e70f9720da43ddb254b255d4f754f8696a857af558'));
});

test('proposal values match the reviewed execution report', () => {
  assert.ok(report.includes('total 1,300'));
  assert.ok(report.includes('input 670, output 630 (of which reasoning 601)'));
  for (const n of ['1,300', '670', '630', '601']) {
    assert.ok(HISTORICAL.proposal.tokens.includes(n));
  }
  assert.ok(report.includes('.promo-overlay') && report.includes('pointer-events') && report.includes('none'));
  assert.ok(report.includes('completed') && report.includes('PROPOSAL_ACCEPTED'));
});
