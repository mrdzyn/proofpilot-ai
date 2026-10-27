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
