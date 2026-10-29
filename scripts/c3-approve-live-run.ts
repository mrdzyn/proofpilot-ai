// C3-LIVE-01A: owner-operated, interactive approval of ONE future Meta proposal attempt. Needs a real terminal (stdin and stdout TTY),
// reads no environment variable and no credential, and refuses unless LIVE-C3-01 is APPROVED in config/live-authorization.json
// (it is NOT in this milestone, so this command cannot create a real approval today).
//
//   node scripts/c3-approve-live-run.ts --run-id <id> --input-sha256 <64 hex> --input-chars <n> [--ttl-minutes 1..15]
import { createInterface } from 'node:readline/promises';
import path from 'node:path';
import { createGitProbe, DEFAULT_APPROVALS_DIR, DEFAULT_RESERVATIONS_ROOT, loadDecisionRegister, runApprovalCli, AuthorizationError } from '../packages/inference/src/index.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');
let rl: ReturnType<typeof createInterface> | undefined;
const io = {
  stdinIsTTY: process.stdin.isTTY === true,
  stdoutIsTTY: process.stdout.isTTY === true,
  ask: async (q: string) => {
    rl ??= createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    return rl.question(q);
  },
  print: (l: string) => console.log(l),
};
let code: number;
try {
  const register = await loadDecisionRegister(repoRoot);
  code = await runApprovalCli(process.argv.slice(2), {
    io, git: createGitProbe(repoRoot), register, approvalsDir: path.join(repoRoot, DEFAULT_APPROVALS_DIR), reservationsRoot: path.join(repoRoot, DEFAULT_RESERVATIONS_ROOT),
  });
} catch (e) {
  console.log(`refused${e instanceof AuthorizationError ? ` (${e.code})` : ''}: nothing was recorded`);
  code = 3;
}
(rl as ReturnType<typeof createInterface> | undefined)?.close();
process.exit(code);
