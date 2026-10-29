// C3-LIVE-01B: the owner-operated, single-call command for the first Meta Muse Spark proposal (LIVE-C3-01). It needs a real terminal,
// makes at most ONE attempt per invocation, and cannot be pointed at another provider, model, limit, credential or repository root.
// The Meta credential is read only by the production runner, after read-only authorization, from the invocation environment.
//
//   node scripts/c3-live-proposal.ts --analysis <live C2B analysis run id> [--run-id c3-live-meta-001] [--preflight] [--show-prompt]
//
// --preflight verifies the evidence, shows the exact input hash and evaluates the gate read-only; it never sends anything.
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { authorizeProductionAttempt, proposeCandidate } from '../packages/inference/src/index.ts';
import { runLiveProposalCli } from '../packages/inference/src/live-proposal-cli.ts';

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
const code = await runLiveProposalCli(process.argv.slice(2), { io, repoRoot: path.resolve(import.meta.dirname, '..'), propose: proposeCandidate, authorize: authorizeProductionAttempt });
(rl as ReturnType<typeof createInterface> | undefined)?.close();
process.exit(code);
