// Read-only repository facts for the live-approval validator: exact HEAD, a clean tree (untracked files count as dirty) and the
// activation tree digest. Kept separate so the proposal modules stay free of process spawning. Only live-gate-core derives a probe,
// from the install root; no production caller may supply one.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { GitProbe } from './live-approval.ts';

const run = promisify(execFile);
const REV = /^(HEAD|[0-9a-f]{40})$/;

/**
 * Activation digest of a revision: SHA-256 over the sorted "mode blobSha path" lines of every tracked file in the revision's tree
 * except `excludePath` (the owner's pin file, which cannot contain its own commit). It covers all code, config and docs.
 */
export function activationDigestOf(lsTreeOutput: string, excludePath: string): string {
  const lines = lsTreeOutput.split('\0').filter(Boolean).map((entry) => {
    const tab = entry.indexOf('\t');
    const [mode, , sha] = entry.slice(0, tab).split(' ');
    return { path: entry.slice(tab + 1), line: `${mode} ${sha} ${entry.slice(tab + 1)}` };
  }).filter((e) => e.path !== excludePath).map((e) => e.line).sort();
  return createHash('sha256').update(lines.join('\n') + '\n', 'utf8').digest('hex');
}

export function createGitProbe(repoRoot: string): GitProbe {
  const git = async (args: string[]) => (await run('git', ['-C', repoRoot, ...args], { encoding: 'utf8', timeout: 15_000, maxBuffer: 16 << 20 })).stdout;
  return {
    async head() {
      return (await git(['rev-parse', 'HEAD'])).trim();
    },
    async clean() {
      return (await git(['status', '--porcelain', '--untracked-files=normal'])).trim().length === 0;
    },
    async treeDigest(rev, excludePath) {
      if (!REV.test(rev)) throw new Error('revision must be HEAD or a full commit id');
      return activationDigestOf(await git(['ls-tree', '-r', '-z', '--full-tree', rev]), excludePath);
    },
  };
}
