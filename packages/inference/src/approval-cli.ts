// C3-LIVE-01A: the interactive, owner-operated approval command (logic only; scripts/c3-approve-live-run.ts wires the real terminal).
// It records ONE self-declared approval for exactly one future Meta proposal attempt. It never reads the environment, never builds an
// approval from a flag, never calls a provider, and refuses unless LIVE-C3-01 is APPROVED in config/live-authorization.json (which it is
// not in this milestone, so no real approval can be created). Exit codes: 0 recorded, 1 declined/aborted, 2 usage or non-interactive, 3 refused by policy.
import { isValidRunId } from '../../intake/src/consent.ts';
import { META_PROPOSAL_MODEL } from './patch-proposal.ts';
import { inspectReservation } from './reservations.ts';
import {
  APPROVAL_LABEL, APPROVAL_TTL_MS, AuthorizationError, buildApprovalRecord, ensureApprovalsDir, findApprovedDecision, LIVE_LIMITS, writeApprovalRecord,
  type GitProbe, type LoadedRegister,
} from './live-approval.ts';

export type ApprovalIo = {
  stdinIsTTY: boolean;
  stdoutIsTTY: boolean;
  /** One line typed by the person. Must come from the terminal. */
  ask(question: string): Promise<string>;
  print(line: string): void;
};
export type ApprovalCliDeps = {
  io: ApprovalIo;
  git: GitProbe;
  register: LoadedRegister;
  approvalsDir: string;
  reservationsRoot: string;
  now?: () => Date;
  /** TEST-ONLY: accept a synthetic register entry and mark the record synthetic. Production script never sets it. */
  synthetic?: boolean;
};

export const confirmationPhrase = (runId: string, inputSha256: string) => `APPROVE ${runId} ${inputSha256.slice(0, 12)}`;

function parse(argv: string[]): { runId: string; inputSha256: string; inputChars: number; ttlMs: number } | string {
  const opts = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i]!;
    const v = argv[i + 1];
    if (!['--run-id', '--input-sha256', '--input-chars', '--ttl-minutes'].includes(k) || v === undefined || opts.has(k)) return `unexpected or repeated argument ${JSON.stringify(k)}`;
    opts.set(k, v);
  }
  const runId = opts.get('--run-id');
  const sha = opts.get('--input-sha256');
  const chars = Number(opts.get('--input-chars'));
  const ttlMin = opts.has('--ttl-minutes') ? Number(opts.get('--ttl-minutes')) : APPROVAL_TTL_MS.default / 60_000;
  if (!isValidRunId(runId)) return '--run-id is missing or malformed';
  if (!sha || !/^[0-9a-f]{64}$/.test(sha)) return '--input-sha256 must be 64 lowercase hex characters';
  if (!Number.isInteger(chars) || chars < 1 || chars > LIVE_LIMITS.maxInputChars) return `--input-chars must be 1..${LIVE_LIMITS.maxInputChars}`;
  if (!Number.isFinite(ttlMin) || ttlMin * 60_000 < 60_000 || ttlMin * 60_000 > APPROVAL_TTL_MS.max) return `--ttl-minutes must be 1..${APPROVAL_TTL_MS.max / 60_000}`;
  return { runId, inputSha256: sha, inputChars: chars, ttlMs: ttlMin * 60_000 };
}

export async function runApprovalCli(argv: string[], deps: ApprovalCliDeps): Promise<number> {
  const { io } = deps;
  const now = deps.now ?? (() => new Date());
  // 1. a human at a terminal: both ends must be a TTY. Piped, redirected or scripted input is refused outright.
  if (!io.stdinIsTTY || !io.stdoutIsTTY) {
    io.print('refused: this command needs an interactive terminal (stdin and stdout must be a TTY). No approval was created.');
    return 2;
  }
  const args = parse(argv);
  if (typeof args === 'string') {
    io.print(`usage error: ${args}`);
    return 2;
  }
  try {
    // 2. the repository must already contain an owner-approved decision; a local approval can never substitute for it.
    const decision = findApprovedDecision(deps.register, deps.synthetic === true);
    const head = await deps.git.head();
    if (!(await deps.git.clean())) throw new AuthorizationError('TREE_DIRTY', 'the working tree is not clean');
    const res = await inspectReservation(deps.reservationsRoot, 'meta', args.runId);
    if (res.runSpent) throw new AuthorizationError('RESERVATION_SPENT', 'this run id already has a reservation');
    await ensureApprovalsDir(deps.approvalsDir);

    // 3. show exactly what is being approved
    io.print('');
    io.print('=== ProofPilot operator approval — ONE Meta proposal attempt ===');
    if (deps.synthetic) io.print('*** SYNTHETIC (test) — not a real authorization ***');
    io.print('This records a SELF-DECLARED approval. It does not authenticate who you are.');
    io.print(`decision:            ${decision.decisionId} (${decision.reference})`);
    io.print(`provider / model:    Meta Model API / ${META_PROPOSAL_MODEL} (exact; no fallback)`);
    io.print(`run ID:              ${args.runId}`);
    io.print(`input SHA-256:       ${args.inputSha256} (${args.inputChars} characters; max ${LIVE_LIMITS.maxInputChars})`);
    io.print(`repository SHA:      ${head} (clean tree)`);
    io.print(`bounds:              ${LIVE_LIMITS.maxBillableAttempts} billable attempt, 0 retries, no fallback, output <= ${LIVE_LIMITS.maxOutputTokens} tokens including reasoning, text only`);
    io.print(`scope:               one UNTRUSTED proposal; it is not run, staged or verified by this approval`);
    io.print(`valid for:           ${args.ttlMs / 60_000} minutes, single use`);
    io.print('A timeout, network failure or uncertain result permanently spends the attempt.');

    // 4. self-declared name, then the exact confirmation phrase (one attempt; any other answer aborts)
    const declaredBy = (await io.ask('Your name or handle (self-declared): ')).trim();
    const phrase = confirmationPhrase(args.runId, args.inputSha256);
    const typed = (await io.ask(`To approve exactly this operation type: ${phrase}\n> `)).trim();
    if (typed !== phrase) {
      io.print('not confirmed; nothing was recorded.');
      return 1;
    }
    const record = buildApprovalRecord({ runId: args.runId, repoSha: head, inputSha256: args.inputSha256, inputChars: args.inputChars, register: deps.register, declaredBy, now: now(), ttlMs: args.ttlMs, synthetic: deps.synthetic === true });
    const file = await writeApprovalRecord(deps.approvalsDir, record);
    io.print(`recorded ${record.label === APPROVAL_LABEL ? 'self-declared approval' : 'approval'} ${record.approvalId} for ${record.runId}; expires ${record.expiresAt}`);
    io.print(`file: ${file}`);
    return 0;
  } catch (e) {
    io.print(`refused${e instanceof AuthorizationError ? ` (${e.code})` : ''}: ${e instanceof AuthorizationError ? e.message : 'unexpected error; nothing was recorded'}`);
    return 3;
  }
}
