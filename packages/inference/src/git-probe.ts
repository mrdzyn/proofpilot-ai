// Read-only repository facts for the live-approval validator: exact HEAD, a clean tree (untracked files count as dirty) and the
// activation tree digest. Kept separate so the proposal modules stay free of process spawning. Only live-gate-core derives a probe,
// from the install root; no production caller may supply one.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { GitProbe } from './live-approval.ts';

const run = promisify(execFile);

// git runs with an ALLOW-LISTED environment: no inherited credential (the provider key never reaches a child process) and no GIT_DIR,
// GIT_WORK_TREE, GIT_INDEX_FILE, GIT_CONFIG_* or similar variable that could point the probe at a different repository than `repoRoot`.
const GIT_ENV_ALLOW = ['PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TMPDIR', 'SYSTEMROOT'] as const;
function gitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' };
  for (const k of GIT_ENV_ALLOW) {
    const v = process.env[k];
    if (v !== undefined) env[k] = v;
  }
  return env;
}
const REV = /^(HEAD|[0-9a-f]{40})$/;
const MAX_PIN_CHAIN = 50;

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

/** The Git tree id of `fixtures/sample-store` at HEAD (the defect fixture the evidence must belong to). */
export async function readFixtureTree(repoRoot: string): Promise<string> {
  const { stdout } = await run('git', ['-C', repoRoot, 'rev-parse', 'HEAD:fixtures/sample-store'], { encoding: 'utf8', timeout: 15_000, env: gitEnv() });
  return stdout.trim();
}

export function createGitProbe(repoRoot: string): GitProbe {
  const git = async (args: string[]) => (await run('git', ['-C', repoRoot, ...args], { encoding: 'utf8', timeout: 15_000, maxBuffer: 16 << 20, env: gitEnv() })).stdout;
  return {
    async head() {
      return (await git(['rev-parse', 'HEAD'])).trim();
    },
    async clean() {
      return (await git(['status', '--porcelain', '--untracked-files=normal'])).trim().length === 0;
    },
    async pinOnlyDescent(activationCommit, pinPath) {
      if (!/^[0-9a-f]{40}$/.test(activationCommit)) throw new Error('activation commit must be a full commit id');
      try {
        await git(['merge-base', '--is-ancestor', activationCommit, 'HEAD']);
      } catch {
        return { ok: false, reason: 'the activation commit is not an ancestor of HEAD' };
      }
      const range = `${activationCommit}..HEAD`;
      if ((await git(['rev-list', '--merges', range])).trim()) return { ok: false, reason: 'a merge commit lies between the activation commit and HEAD' };
      const commits = (await git(['rev-list', '--reverse', range])).split('\n').filter(Boolean);
      if (commits.length === 0) return { ok: false, reason: 'HEAD is the activation commit itself; no pin commit follows it' };
      if (commits.length > MAX_PIN_CHAIN) return { ok: false, reason: `more than ${MAX_PIN_CHAIN} commits follow the activation commit` };
      for (const c of commits) {
        const files = (await git(['diff-tree', '-r', '-z', '--no-commit-id', '--name-only', c])).split('\0').filter(Boolean);
        if (files.length !== 1 || files[0] !== pinPath) return { ok: false, reason: `commit ${c.slice(0, 12)} does not change only ${pinPath}` };
      }
      return { ok: true };
    },
    async treeDigest(rev, excludePath) {
      if (!REV.test(rev)) throw new Error('revision must be HEAD or a full commit id');
      return activationDigestOf(await git(['ls-tree', '-r', '-z', '--full-tree', rev]), excludePath);
    },
  };
}
