import { test } from 'node:test';
import assert from 'node:assert/strict';
import { certifyRecording, type WorktreeState } from '../../packages/core/src/index.ts';

const clean: WorktreeState = { kind: 'clean' };
const dirty: WorktreeState = { kind: 'dirty', paths: ['fixtures/sample-store/src/styles.css'] };
const unknown: WorktreeState = { kind: 'unknown', reason: 'git unavailable' };
const ok = { allClipsAsExpected: true, failure: null };

test('certified only when clean before AND after, all clips as expected, no failure', () => {
  const c = certifyRecording({ before: clean, after: clean, ...ok });
  assert.equal(c.certifiedExactSha, true);
  assert.deepEqual(c.reasons, []);
});

test('a source change DURING recording (clean before, dirty after) is not certified', () => {
  const c = certifyRecording({ before: clean, after: dirty, ...ok });
  assert.equal(c.certifiedExactSha, false);
  assert.deepEqual(c.worktree, dirty);
  assert.match(c.reasons.join(), /dirty after recording/);
});

test('dirty before, unknown either side, a failure, or a wrong outcome all fail closed', () => {
  assert.equal(certifyRecording({ before: dirty, after: clean, ...ok }).certifiedExactSha, false);
  assert.equal(certifyRecording({ before: clean, after: unknown, ...ok }).certifiedExactSha, false);
  assert.equal(certifyRecording({ before: unknown, after: clean, ...ok }).certifiedExactSha, false);
  assert.equal(certifyRecording({ before: clean, after: clean, allClipsAsExpected: true, failure: 'boom' }).certifiedExactSha, false);
  assert.equal(certifyRecording({ before: clean, after: clean, allClipsAsExpected: false, failure: null }).certifiedExactSha, false);
});
