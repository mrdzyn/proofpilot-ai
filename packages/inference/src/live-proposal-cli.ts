// C3-LIVE-01B: the owner-operated, single-call command (logic only; scripts/c3-live-proposal.ts wires the real terminal and the real
// production functions). It makes AT MOST ONE attempt per invocation, never loops, retries or falls back, and has no flag that selects
// a provider, a model, a limit or a credential. Order:
//   1. a real terminal (stdin and stdout TTY)                      -> else refuse
//   2. strict arguments: --analysis <id> [--run-id <id>] [--preflight] [--show-prompt]
//   3. a clean tree at HEAD; certified evidence re-verified (live-input.ts): trusted F01 facts from the certified baseline run for THIS
//      HEAD and fixture, and the validated Symptom from a live analysis of the certified recording
//   4. the request is rebuilt with buildProposalRequest and its exact SHA-256 and size are shown
//   5. READ-ONLY production authorization (the empty activation pin, the operator approval for this run id and this input hash, ...)
//   6. --preflight stops here (exit 0). Otherwise the operator must type the exact confirmation phrase
//   7. ONE call to the gated entry point; only sanitized fields are printed. No credential, raw provider text or exception text is shown.
// Exit codes: 0 accepted proposal; 1 declined, or an attempt was made and the proposal was not accepted; 2 usage / not interactive /
// input provenance refused; 3 refused by the production gate or the entry point (nothing was sent unless stated).
import path from 'node:path';
import { isValidRunId } from '../../intake/src/consent.ts';
import { InferenceError } from './errors.ts';
import { createGitProbe, readFixtureTree } from './git-probe.ts';
import { AuthorizationError } from './live-approval.ts';
import { LiveInputError, loadCertifiedProposalInput } from './live-input.ts';
import { buildProposalRequest, META_PROPOSAL_MODEL, type BuiltProposalRequest, PROPOSAL_LABEL, PROPOSAL_LIMITS, ProposalError, type ProposeCandidateInput } from './patch-proposal.ts';

export const DEFAULT_LIVE_RUN_ID = 'c3-live-meta-001';
export const liveConfirmationPhrase = (runId: string, inputSha256: string) => `SEND ONE META REQUEST ${runId} ${inputSha256.slice(0, 12)}`;

export type LiveCliIo = { stdinIsTTY: boolean; stdoutIsTTY: boolean; ask(question: string): Promise<string>; print(line: string): void };
export type LiveCliDeps = {
  io: LiveCliIo;
  repoRoot: string;
  /** The real gated entry point. The CLI calls it at most once. */
  propose: (input: ProposeCandidateInput) => Promise<{ status: string; reason: string | null; artifactPath: string | null; settled: boolean; artifact: { requestId: string | null; usage: unknown; lifecycle: unknown; respondedModel: string | null; slot: number } }>;
  /** The real read-only production authorization. */
  authorize: (attempt: { runId: string; request: BuiltProposalRequest; provider: { id: 'meta'; models: { visual: string } }; maxOutputTokens: number }) => Promise<unknown>;
};

function parse(argv: string[]): { runId: string; analysisId: string; preflight: boolean; showPrompt: boolean } | string {
  let runId = DEFAULT_LIVE_RUN_ID;
  let analysisId: string | undefined;
  let preflight = false;
  let showPrompt = false;
  const seen = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]!;
    if (seen.has(k)) return `repeated argument ${JSON.stringify(k)}`;
    seen.add(k);
    if (k === '--preflight') preflight = true;
    else if (k === '--show-prompt') showPrompt = true;
    else if (k === '--run-id' || k === '--analysis') {
      const v = argv[++i];
      if (v === undefined) return `${k} needs a value`;
      if (k === '--run-id') runId = v;
      else analysisId = v;
    } else return `unexpected argument ${JSON.stringify(k)} (there is no loop, batch, retry, fallback, provider or model option)`;
  }
  if (!isValidRunId(runId)) return '--run-id is malformed';
  if (analysisId === undefined || !isValidRunId(analysisId)) return '--analysis <live C2B analysis run id> is required and must be well formed';
  return { runId, analysisId, preflight, showPrompt };
}

const codeOf = (e: unknown): string => (e instanceof AuthorizationError || e instanceof ProposalError || e instanceof InferenceError || e instanceof LiveInputError ? e.code : 'UNEXPECTED_ERROR');

export async function runLiveProposalCli(argv: string[], deps: LiveCliDeps): Promise<number> {
  const { io } = deps;
  if (!io.stdinIsTTY || !io.stdoutIsTTY) {
    io.print('refused: this command needs an interactive terminal (stdin and stdout must be a TTY). Nothing was sent.');
    return 2;
  }
  const args = parse(argv);
  if (typeof args === 'string') {
    io.print(`usage error: ${args}`);
    return 2;
  }

  // 3. the repository state and the certified evidence
  let request;
  let sources;
  try {
    const git = createGitProbe(deps.repoRoot);
    const head = await git.head();
    if (!(await git.clean())) {
      io.print('refused (TREE_DIRTY): the working tree is not clean. Nothing was sent.');
      return 2;
    }
    const input = await loadCertifiedProposalInput({ repoRoot: deps.repoRoot, head, fixtureTree: await readFixtureTree(deps.repoRoot), analysisId: args.analysisId });
    request = buildProposalRequest({ symptom: input.symptom, facts: input.facts });
    sources = input.sources;
  } catch (e) {
    io.print(`refused (${codeOf(e)}): ${e instanceof LiveInputError ? e.message : 'the repository state or the evidence could not be validated'}. Nothing was sent.`);
    return 2;
  }

  // 4. show exactly what would be sent
  io.print('');
  io.print('=== ProofPilot — ONE Meta proposal attempt (owner-operated) ===');
  io.print(`run ID:              ${args.runId}`);
  io.print(`provider / model:    Meta Model API (api.meta.ai) / ${META_PROPOSAL_MODEL} (exact; no fallback)`);
  io.print(`input SHA-256:       ${request.inputSha256}`);
  io.print(`input size:          ${request.chars} characters (max ${PROPOSAL_LIMITS.maxInputChars})`);
  io.print(`output bound:        ${PROPOSAL_LIMITS.maxOutputTokens} tokens including reasoning; text only; strict JSON; low reasoning; 0 retries`);
  io.print(`repository HEAD:     ${sources.gitHead} (clean)`);
  io.print(`certified baseline:  ${sources.baselineRunId} (re-verified: artifact hashes, verdict re-derived, exact HEAD and fixture tree ${sources.fixtureTree.slice(0, 12)})`);
  io.print(`symptom source:      live analysis ${sources.analysisId}, video ${sources.videoSha256.slice(0, 12)}… bound to certified recording ${sources.recordingSet}`);
  io.print(`approve with:        node scripts/c3-approve-live-run.ts --run-id ${args.runId} --input-sha256 ${request.inputSha256} --input-chars ${request.chars}`);
  if (args.showPrompt) {
    io.print('--- prompt (untrusted symptom text is fenced and sanitized) ---');
    for (const line of request.prompt.split('\n')) io.print(line);
    io.print('--- end of prompt ---');
  }

  // 5. read-only production authorization: nothing is consumed, reserved or sent
  const facts = { runId: args.runId, request, provider: { id: 'meta' as const, models: { visual: META_PROPOSAL_MODEL } }, maxOutputTokens: PROPOSAL_LIMITS.maxOutputTokens };
  try {
    await deps.authorize(facts);
    io.print('production authorization (read-only): every gate passes for this run and input.');
  } catch (e) {
    io.print(`production authorization (read-only): REFUSED (${codeOf(e)})${e instanceof AuthorizationError ? `: ${e.message}` : ''}`);
    io.print(args.preflight ? 'preflight complete: inputs verified; the gate is not open. Nothing was sent.' : 'refused: nothing was sent, consumed or reserved.');
    return args.preflight ? 0 : 3;
  }
  if (args.preflight) {
    io.print('preflight complete: inputs verified and the gate is open for this run. Nothing was sent.');
    return 0;
  }

  // 6. the operator's last chance: exactly one attempt, permanently spent whatever happens
  io.print('');
  io.print('This sends ONE request to Meta. A timeout, network error or uncertain result permanently spends the attempt; there is no retry and no second attempt.');
  const phrase = liveConfirmationPhrase(args.runId, request.inputSha256);
  const typed = (await io.ask(`To send exactly this request type: ${phrase}\n> `)).trim();
  if (typed !== phrase) {
    io.print('not confirmed; nothing was sent.');
    return 1;
  }

  // 7. ONE call. Whatever it returns, the command prints sanitized fields and stops.
  let out;
  try {
    out = await deps.propose({ runId: args.runId, request });
  } catch (e) {
    io.print(`refused or failed before a result was recorded (${codeOf(e)}). If a reservation was claimed the attempt is spent; check .proofpilot/reservations. No retry was made.`);
    return 3;
  }
  const a = out.artifact;
  io.print('');
  io.print(`${PROPOSAL_LABEL}`);
  io.print(`status:              ${out.status}${out.reason ? ` (${out.reason})` : ''}`);
  io.print(`response id:         ${a.requestId ?? 'n/a'}`);
  io.print(`responded model:     ${a.respondedModel ?? 'n/a'}`);
  io.print(`lifecycle:           ${JSON.stringify(a.lifecycle)}`);
  io.print(`usage:               ${JSON.stringify(a.usage)} (provider-reported; no cost is computed)`);
  io.print(`artifact:            ${out.artifactPath ? path.relative(deps.repoRoot, out.artifactPath) : 'NOT WRITTEN'}`);
  io.print(`reservation:         slot ${a.slot} ${out.settled ? 'settled' : 'NOT settled (still spent)'}`);
  io.print('The attempt is spent. The proposal is untrusted data: it is not staged, executed or verified. No further call will be made.');
  return out.status === 'PROPOSAL_ACCEPTED' ? 0 : 1;
}
