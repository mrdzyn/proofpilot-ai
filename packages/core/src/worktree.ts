// Shared by every runner that produces "exact-SHA" evidence: report whether the
// evidence-relevant paths are committed, so a HEAD can honestly identify the tested bytes.
import { execFileSync } from 'node:child_process';
import { parsePorcelainPaths, type WorktreeState } from './f01-baseline.ts';

/** Paths whose uncommitted state means a recording cannot be tied to a Git SHA. */
export const F01_RECORDING_PATHS = ['fixtures/sample-store', 'packages/intake', 'packages/core/src/worktree.ts', 'scripts/f01-record.ts'] as const;

/** `git status` for `paths`; anything unreadable is 'unknown' (not certifiable). */
export function readWorktreeState(repoRoot: string, paths: readonly string[]): WorktreeState {
  try {
    // Untrimmed on purpose: the first porcelain line starts with a significant status column.
    const porcelain = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', ...paths], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    const changed = parsePorcelainPaths(porcelain);
    return changed.length === 0 ? { kind: 'clean' } : { kind: 'dirty', paths: changed };
  } catch (err) {
    return { kind: 'unknown', reason: String((err as Error).message).split('\n')[0]! };
  }
}

export type RecordingCertification = {
  /** True only when the evidence paths were verified clean BEFORE and AFTER recording. */
  certifiedExactSha: boolean;
  /** The first non-clean state if there is one, else clean; what the report should show. */
  worktree: WorktreeState;
  reasons: string[];
};

/**
 * Whether a recording set may be called exact-SHA evidence. Decided once, after the
 * recording finished, so persisted metadata cannot claim more than the run proved.
 * An unreadable or changed state on either side, a failed step, or a clip that did not
 * behave as the defect predicts all fail closed.
 */
export function certifyRecording(input: { before: WorktreeState; after: WorktreeState; allClipsAsExpected: boolean; failure: string | null }): RecordingCertification {
  const { before, after } = input;
  const worktree = before.kind !== 'clean' ? before : after;
  const reasons: string[] = [];
  if (input.failure) reasons.push(`recording failed: ${input.failure}`);
  if (!input.allClipsAsExpected) reasons.push('a clip did not behave as the F01 defect predicts');
  if (before.kind !== 'clean') reasons.push(`evidence paths were ${before.kind} before recording`);
  if (after.kind !== 'clean') reasons.push(`evidence paths were ${after.kind} after recording`);
  return { certifiedExactSha: reasons.length === 0, worktree, reasons };
}
