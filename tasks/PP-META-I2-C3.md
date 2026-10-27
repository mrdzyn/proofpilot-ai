# PP-META-I2-C3 — Verified best-of-N patch scoreboard (hackathon pivot)

- **State:** Ready, not started — written 2026-10-28 (Asia/Manila). **Reconstruction note:** an earlier draft of this file (referenced by `docs/STATUS.md` and handoff PP-META-I2-C3-PIVOT-1) was overwritten by mistake in the same session; this version was rewritten to match those references (work packages C3-A to C3-F, cap 12 + 4, execution controls, go/no-go Oct 31 PHT). Reviewer should treat it as a new draft and diff it against `docs/STATUS.md`, the handoff and `docs/CHATGPT-PIVOT-PROMPT.md`. **No live Meta request is authorized until the cap in "Authorization" is confirmed by the owner.**
- **Parent:** C2B closed (docs closure PR pending exact-head review); protected `main` at `9103d00e1b82f260a41498e7c64201ccd398be15` plus that docs PR.
- **Working branch:** `phase/pp-meta-i2-c3`
- **Implementation agent:** Claude Code; independent reviewer GPT-6
- **User-facing UI:** a single static HTML report only. The five-screen product UI is **cut** for the hackathon (see "Scope cuts").
- **Supersedes:** the C3 (patch proposal) and C4 (candidate verification) rows in the earlier plan. They are merged here and reduced.

## Objective

Show, with real Meta model calls and the existing trusted oracle, that ProofPilot can take the genuine F01 recording and its validated `Symptom`, ask `muse-spark-1.3` for several candidate patches, run each one against the trusted oracle, and publish an honest scoreboard of which candidates actually fix the bug, with hashed evidence.

Pitch line: *Every AI coding agent claims it fixed the bug. ProofPilot makes Meta's models prove it.*

## Why this scope

Submission is due **Nov 4, 9:00 PM EST = Nov 5, 10:00 AM PHT**. Internal target is a final build and uploaded demo on **Nov 4 PHT**. The reused core (F01 fixture, trusted oracle, baseline classifier, evidence hashing, Meta adapter with live Spark video analysis, Baseten config, intake, `Symptom`) is already built. This task adds only the patch-proposal and candidate-verification loop, plus a report. It removes everything that needs new infrastructure.

## Authorization (owner statement recorded from chat, 2026-10-28 ~02:08 PHT)

The owner answered "Yes" to two proposals. Their effect is recorded here, with the limits that still need an owner decision.

1. **Sandbox gate relaxed for the hackathon (accepted).** The earlier rule "no AI-generated patch may execute until a Docker/ARM64 runner is verified" is replaced by the lighter controls in "Execution boundary". This is a recorded deviation and must be written into `docs/SECURITY.md`. It is **not** equivalent to container isolation, and the demo and README must say so.
2. **Capped live Meta spend (accepted in principle; number NOT yet confirmed).** Proposed cap for this task, **owner to confirm or change before any live call**:
   - at most **12** billable `muse-spark-1.3` patch-proposal requests in total;
   - at most **4** Baseten `muse-spark-open-1026` requests, only under the P1 gate below;
   - a fresh run ID and per-run consent for every call;
   - no video re-upload: the existing analysis result for the certified F01 clip is reused;
   - the single-use run-ID and no-auto-retry protections from C2B apply to every live call;
   - a provider notification or a request count is **not** a currency cap, and the repository must keep saying so.
   Until the owner records the final numbers in this file, every live path stays disabled by default (`PROOFPILOT_ALLOW_BILLABLE_CALLS` unset).

Still **not authorized:** merge or deploy by an agent, push without explicit owner authorization, any use of Muse Wonder, and any claim of a model, open-weight stack or feature that was not actually run.

## Allowed scope

- `packages/inference/src/patch-proposal.ts` (new): Responses text path, structured output, validation. Existing client/config files may be extended minimally.
- `packages/core/src/candidate.ts`, `packages/core/src/scoreboard.ts` (new): candidate model, diff parsing, verdict mapping, scoreboard and evidence bundle. `status.ts`, `patch-policy.ts`, `env.ts` may only be *used*; changing them needs an owner note in this file.
- `scripts/c3-propose.ts`, `scripts/c3-verify.ts`, `scripts/c3-report.ts` (new).
- `reports/` template (new): static HTML report generator output goes to gitignored `.proofpilot/`.
- `tests/unit`, `tests/security`, `tests/integration` for the new code.
- `docs/STATUS.md`, `docs/SECURITY.md`, `docs/TESTING.md`, `docs/ARCHITECTURE.md`, `HACKATHON_CONTRIBUTIONS.md`, one handoff in `docs/HANDOFFS.md`.

## Forbidden scope

- `verifier/`, `fixtures/sample-store/` (baseline stays immutable), `config/patch-policy.json` trust roots, `.github/`, `package.json` dependencies (no new runtime dependencies without a recorded reason).
- Any change that lets a model see, edit or reason from verifier or test files.
- Docker, a hosted backend, a database, accounts, the five-screen UI, voice, SAM, Muse Wonder, Muse Code.
- Weakening a test, the oracle or policy to make a candidate pass.

## Execution boundary (replaces the Docker gate)

1. **Model never edits the repo.** It returns a structured proposal; local code validates and applies it.
2. **Path policy:** only files under `fixtures/sample-store/src/` with extensions `.html`, `.css`, `.js`; checked with the existing `checkPatchPath`. Deny trust roots, dotfiles, symlinks, path traversal, binary content. Size caps per file and per patch. **Static deny-list:** reject candidates containing network or dynamic-code primitives (for example `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `eval`, `new Function`, `import()`, external URLs); this is a coarse filter, not a proof of safety.
3. **Disposable copy:** each candidate runs in a fresh copy of the fixture at the baseline SHA **outside the repository**, never in the baseline tree.
4. **Model code runs only in headless Chromium.** The fixture server (`server.mjs`) is a trust root with a fixed route map serving static `src/` files; model-written HTML/CSS/JS is never executed by Node. Verify this claim in step 0 and record the result.
5. **Network off for the page:** Playwright routing aborts every non-`127.0.0.1` request during candidate runs. Environment passed through `scrubEnv`. Per-run timeout (default 60 s) and unique port.
6. **Per-run owner approval:** a candidate diff is applied only after an explicit `--approve <run-id>` for that run after the diff has been shown. No implicit approval, no persistence of approval.
7. **Honest limits:** state in the README and the video that this is process-level containment plus a browser sandbox, not a container.

## Work plan (PHT dates; the Nov 4 9 PM EST deadline is Nov 5, 10 AM PHT)

Work packages map to the steps below: **C3-A** = steps 0–1 (proposal), **C3-B** = step 2 (candidate runner and sandbox text in `docs/SECURITY.md`), **C3-C** = steps 3–5 (live round, scoreboard, evidence), **C3-D** = step 7 (report, replay, audit), **C3-E** = step 8 (demo), **C3-F** = step 9 (submission). Step 4 is the **go/no-go on Oct 31 PHT**; if no candidate flips red to green on the real oracle, fall back to demoing real reproduction plus live Spark analysis and honestly show the failing candidates.

| Step | Target | Work | Gate |
|---|---|---|---|
| 0 | Oct 28 | Re-check Meta docs for text/structured output and the exact `muse-spark-1.3` ID; verify the `server.mjs` claim above; owner asks #office-hours whether Muse Wonder can write code (informational only, plan does not depend on it) | Findings recorded here |
| 1 | Oct 28–29 | Patch-proposal module: prompt from validated `Symptom` plus allowed `src/` files only; structured output; fail-closed lifecycle (reuse C2B rules); N independent requests; mocked tests; dry-run CLI with zero network | Mock tests pass; dry run makes 0 calls |
| 2 | Oct 29–30 | Candidate runner: temp copy, policy check, owner approval, Playwright oracle run, desktop control, timeout, verdict per candidate; hand-authored negative controls (see below) | Negative controls behave as specified with **zero model calls** |
| 3 | Oct 30 | First live proposal round (within the confirmed cap), then verify | Real request IDs, model, usage recorded |
| 4 | Oct 31 | Hard go/no-go: at least one candidate VERIFIED on the unchanged oracle, or document an honest negative result and fall back to the report-of-failures story | Owner decision |
| 5 | Nov 1 | Scoreboard, evidence bundle with SHA-256, static HTML report | Hashes re-verify |
| 6 | Nov 1–2 | **P1 only if step 4 passed:** same proposal path on Baseten `muse-spark-open-1026` as a second scoreboard row | Real key present; separate owner approval |
| 7 | Nov 2 | Fresh replay of the winning candidate 3/3; independent exact-head audit; remediate | Audit result recorded |
| 8 | Nov 3 | Freeze features; provenance and rights audit; signed-out repo check; record the 3-minute demo | Demo ≤ 3:00 |
| 9 | Nov 4 PHT | Final re-audit for the final SHA; submit early; save the receipt | Submission confirmed |

## Hand-authored negative controls (no model calls)

These prove the verifier fails closed before any live spend:

- **NC-1 no-op patch:** change nothing relevant → baseline failure persists → `PATCH_FAILED`.
- **NC-2 verifier tamper:** diff touches `verifier/` or `tests/` → rejected before execution → `SECURITY_BLOCKED`.
- **NC-3 desktop regression:** hides or breaks Add to cart everywhere → mobile may pass, desktop control fails → `PATCH_FAILED`.
- **NC-4 external request:** candidate JS fetches a non-local URL → request aborted and logged → not `VERIFIED` unless the oracle still passes and the abort is reported in the evidence.
- **NC-5 baseline not reproduced:** run the verdict engine against a tree where the baseline does not fail → `NOT_REPRODUCED`, never `VERIFIED`.
- **Positive control PC-1:** a hand-written correct fix → `VERIFIED` for F01 tested conditions only. This proves the pipeline can pass at all, and is labeled as hand-written, never as model output.

## Verdict rule

`VERIFIED` only if: the baseline failure was observed on the original SHA; the diff passed policy and was owner-approved; the candidate passes the trusted mobile oracle and the desktop control in a fresh copy; evidence is complete and its hashes verify; and the run-level verdict additionally needs **3/3 fresh replays**. It means *verified against fixture F01 and the tested conditions*, not universal correctness. The model never assigns a verdict.

## Test objective / validation budget

- **Test objective:** prove the candidate loop cannot produce `VERIFIED` without observed baseline failure, a policy-clean owner-approved diff, and an independent oracle pass; and prove at least one real model candidate is judged by it.
- **Minimum automated evidence:** `pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:security`; new tests for policy rejection, lifecycle failure, duplicate run IDs, NC-1..NC-5 and PC-1; `pnpm f01:baseline` regression on a clean tree.
- **Manual QA:** owner reviews the diffs and the report before the demo.
- **Escalation:** any change to `status.ts`, `patch-policy.ts` or `env.ts`; any failed security test; any oracle flakiness.
- **Required CI:** Common validation and Stack validation on a Draft PR.

## Acceptance criteria

- [ ] Dry run of proposal and candidate loop makes zero network calls.
- [ ] NC-1..NC-5 and PC-1 behave as specified without any model call.
- [ ] Live proposals use `muse-spark-1.3` exactly; model ID, request IDs, usage and latency are recorded; no silent fallback.
- [ ] At least one real model candidate is judged by the unchanged oracle, and the scoreboard reports every candidate honestly, including failures.
- [ ] The winning candidate passes a fresh 3/3 replay, or the report states plainly that none did.
- [ ] Evidence bundle hashes re-verify; no secret, media or raw response text is in Git.
- [ ] README, SECURITY and the demo state the relaxed sandbox honestly.
- [ ] Demo shows only features built in the official window and stays within 3:00.

## Security / privacy

Deviation from the Docker gate is recorded above. No key is ever printed or committed. Only synthetic fixture content and the existing certified synthetic recording-derived `Symptom` are sent to Meta. File contents sent are limited to the patchable `src/` files.

## Scope cuts (explicit)

Five-screen UI, Docker/ARM64 runner, fixtures F02 and F03, full state-machine UI, Muse Wonder, voice, SAM, Muse Code, retries beyond the cap, multi-fixture support.

## Documentation updates

- [x] `docs/STATUS.md` (pivot recorded by the earlier session)
- [ ] `docs/SECURITY.md` (sandbox deviation)
- [ ] `docs/TESTING.md`, `docs/ARCHITECTURE.md`
- [ ] `HACKATHON_CONTRIBUTIONS.md` (new paths, model usage as actually run)
- [ ] `docs/HANDOFFS.md` (one compact handoff)

## Deliverable

A Draft pull request against `main`. Do not merge. Do not push without explicit owner authorization.

## Stop / escalation conditions

Stop and ask if: the Meta text or structured-output contract differs from assumptions; the `server.mjs` claim is false; any step would need a change in forbidden scope; a live call would exceed the confirmed cap; the oracle shows flakiness; a security boundary would be weakened beyond what is recorded here.

## Completion handoff

Follow `docs/HANDOFFS.md`: one compact handoff and update `docs/STATUS.md` so `Active handoff` points to it.
