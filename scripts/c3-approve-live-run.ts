// C3-LIVE-01A: owner-operated, interactive approval of ONE future Meta proposal attempt. Needs a real terminal (stdin and stdout TTY),
// reads no environment variable and no credential, and derives every trusted input (register, owner-pinned activation revision, Git
// state, directories, quota) inside the production gate. It refuses today: no decision is approved, no revision is pinned and the
// code quota is 0, so this command cannot create a real approval in this milestone.
//
//   node scripts/c3-approve-live-run.ts --run-id <id> --input-sha256 <64 hex> --input-chars <n> [--ttl-minutes 1..15]
import { createInterface } from 'node:readline/promises';
import { runProductionApprovalCli } from '../packages/inference/src/index.ts';

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
const code = await runProductionApprovalCli(process.argv.slice(2), io);
(rl as ReturnType<typeof createInterface> | undefined)?.close();
process.exit(code);
