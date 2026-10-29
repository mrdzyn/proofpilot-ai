// Read-only repository facts for the live-approval validator: exact HEAD and a clean tree (untracked files count as dirty).
// Kept separate so the proposal modules stay free of process spawning.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GitProbe } from './live-approval.ts';

const run = promisify(execFile);

export function createGitProbe(repoRoot: string): GitProbe {
  const git = async (args: string[]) => (await run('git', ['-C', repoRoot, ...args], { encoding: 'utf8', timeout: 15_000, maxBuffer: 1 << 20 })).stdout;
  return {
    async head() {
      return (await git(['rev-parse', 'HEAD'])).trim();
    },
    async clean() {
      return (await git(['status', '--porcelain', '--untracked-files=normal'])).trim().length === 0;
    },
  };
}
