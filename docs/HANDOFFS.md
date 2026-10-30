# Repository Handoffs

## Purpose

`docs/HANDOFFS.md` is the canonical repository-backed handoff log for work that must continue across AI agents, tools, conversations, or human/agent boundaries.

A handoff records the **minimum operational state needed to continue correctly**. It prevents chat history, copied transcripts, or agent memory from becoming the only continuation mechanism.

This file is **not** part of routine full-file startup context. `docs/STATUS.md` identifies the active handoff ID; the next agent reads only that matching section.

## Relationship to other repository context

Each artifact has one job:

- `docs/STATUS.md` — what is true now; stores only the current **Active handoff** ID plus current phase/status.
- active task/phase specification — objective, scope, acceptance criteria, validation, and stop conditions.
- `docs/HANDOFFS.md` — concise continuation state passed between agents/conversations.
- `docs/PROJECT-MEMORY.md` — durable decisions and rationale; not routine startup context.
- code/tests/PR — authoritative implementation evidence.

Do not duplicate the task contract, STATUS, architecture, or durable decisions inside a handoff. Link to those sources and capture only what the next agent needs to resume.

## When a handoff is required

Create a handoff when responsibility for meaningful work passes to another agent, tool, conversation, or reviewer and continuation state would otherwise have to be reconstructed.

Typical cases:
- implementation is complete and an independent reviewer takes over;
- an agent reaches a bounded checkpoint and another agent continues implementation;
- work moves to a new conversation because context is getting large;
- a review/fix cycle changes the exact branch/head state that the next agent must use;
- work is blocked and another agent/person must resume from a known state.

Do **not** create a handoff after every trivial response or mechanical action. Prefer one handoff per meaningful transfer of responsibility.

## Startup rule

After reading `AGENTS.md`, `docs/STATUS.md`, `config/project-profile.json`, and the active task/phase specification:

1. Read the `Active handoff` value from `docs/STATUS.md`.
2. If it is `None`, continue without loading handoff history.
3. If it contains an ID, locate that exact `## Handoff: <ID>` section in this file.
4. Read only that section unless an older handoff is specifically required to resolve an ambiguity.
5. Verify its branch/PR/SHA against the repository before changing code. Repository state remains authoritative if the handoff is stale.

Never load the full handoff history merely because this file exists.

## Handoff IDs

IDs must be unique within the repository and stable after publication.

Recommended convention:

```text
<TASK-OR-PHASE-ID>-C<n>
```

Examples:
- `P7.0-C1`
- `MKT-MCP2-C1`
- `SEC-005-C2`

For specification-stage handoffs that are intentionally distinct from later implementation handoffs, the master template may use:

```text
<TASK-OR-PHASE-ID>-SPEC<n>
```

Example: `P8.0-SPEC1`.

Projects may use another concise convention when it is already established. Never reuse an ID for a different repository state.

## Required handoff content

Keep each handoff compact. Include only:

- **Task / phase** — active repository-backed specification.
- **From** — agent/role that produced the handoff.
- **To** — expected next role when known, otherwise `next agent`.
- **Branch** — branch the next agent should inspect.
- **Implementation head** — exact code/docs SHA the handoff describes.
- **PR** — PR number/link when one exists.
- **State** — ready for review / ready to continue / blocked / fixes required / other concise state.
- **Completed** — short summary of what changed.
- **Validation** — checks actually run and result; summarize rather than paste logs.
- **Continuation notes** — only constraints, findings, or decisions needed for the next step.
- **Next action** — one exact recommended action.

If a field is not applicable, write `N/A` rather than inventing content.

## Entry template

```markdown
## Handoff: [UNIQUE-ID]

- **Task / phase:** [PATH OR ID]
- **From:** [AGENT / ROLE]
- **To:** [NEXT AGENT / ROLE]
- **Branch:** `[BRANCH]`
- **Implementation head:** `[SHA]`
- **PR:** [# / LINK / N/A]
- **State:** [READY FOR REVIEW / READY TO CONTINUE / BLOCKED / FIXES REQUIRED]

### Completed
- [CONCISE OUTCOME]
- [CONCISE OUTCOME]

### Validation
- `[COMMAND OR CHECK]` — [PASS / FAIL / NOT RUN]
- Required CI: [STATE]

### Continuation notes
- [ONLY WHAT THE NEXT AGENT NEEDS]
- [RISK / FINDING / CONSTRAINT OR "None"]

### Next action
[ONE EXACT NEXT ACTION]
```

## Append and update rules

- Append a new handoff; do not rewrite an older handoff to represent a new repository state.
- Before appending, refresh the branch/PR and confirm the handoff is based on the current intended head.
- If another agent has already appended a newer handoff, reconcile before writing; never overwrite or silently supersede concurrent work.
- If an old handoff contains a factual error, append a correction in a new handoff or clearly mark the correction without changing the historical repository state it described.
- After appending a handoff, update `docs/STATUS.md` so `Active handoff` contains that ID.
- When no continuation handoff is active, set `Active handoff: None`.
- The handoff should reference the final implementation SHA **before the handoff-only documentation commit** when a separate handoff commit is used. The current branch head remains authoritative for subsequent work.

## Content boundaries

Do not put the following in handoffs:
- secrets, tokens, private keys, credentials, or signing material;
- sensitive production/customer data;
- large build/test logs;
- full diffs or copied source files;
- long chat transcripts;
- complete task specifications already stored elsewhere;
- durable architecture/product/security decisions that belong in their canonical docs or `docs/PROJECT-MEMORY.md`;
- speculative future backlog unrelated to the immediate continuation.

Link to the authoritative repository artifact instead.

## Greenfield initialization

Repositories created from the master template keep this policy and entry template but must remove the inherited master-template handoff block during bootstrap.

Remove the block delimited by `MASTER_TEMPLATE_HANDOFFS_START` / `MASTER_TEMPLATE_HANDOFFS_END`, keep the generic `HANDOFF_ENTRIES_START` / `HANDOFF_ENTRIES_END` markers, set `docs/STATUS.md` to `Active handoff: None`, then start the new project's handoff history only when its first meaningful transfer occurs. Until that bootstrap cleanup is complete, a generated child still in `repositoryMode: "template"` must ignore any inherited master active-handoff ID.

## Brownfield adoption

If an existing repository already has a handoff/continuation mechanism:
- reconcile it using the KEEP / MERGE / ADD / RETIRE process in `docs/REPOSITORY-SETUP.md`;
- choose one canonical mechanism;
- do not maintain two competing active handoff logs;
- if an approved equivalent path remains canonical, adapt Project Baseline deliberately rather than duplicating the same handoff state here solely to satisfy CI.

## Handoff entries

<!-- HANDOFF_ENTRIES_START -->
<!-- Append project handoff sections before HANDOFF_ENTRIES_END. -->
## Handoff: PP-META-I0-C1

- **Task / phase:** `tasks/PP-META-I0-C1.md`
- **From:** Implementation agent (Claude Code, Claude Opus 5.5)
- **To:** Independent audit agent (read-only), then project owner
- **Branch:** `phase/pp-meta-i0-c1` (local; not pushed)
- **Implementation head:** `f78dad56ce092c04d69f38ea02cdca54a1046089`
- **PR:** N/A (push/PR not authorized)
- **State:** READY FOR REVIEW

### Completed
- Greenfield init from template `1d94a35` (`2a80bd3`); F01 fixture, oracle, core, inference, tests, CI job (`72420c5`); frozen-lockfile fix (`26203c1`); independent trust-root test (`f78dad5`).
- Implementation start: 2026-10-27T05:10:12Z (inside the official window). Provenance is in `HACKATHON_CONTRIBUTIONS.md`.

### Validation (local, macOS arm64, Node v24.21.0, pnpm 12.6.0, Playwright 1.64.1, at `f78dad5`, clean tree)
- `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `python3 scripts/validate_project_profile.py --repository mrdzyn/proofpilot-ai`, `git diff --check`, tracked-env guard: PASS (exit 0)
- `pnpm test:unit`: PASS 27/27. `pnpm test:security`: PASS 12/12.
- `pnpm f01:baseline`: exit 0; run `f01-baseline-20261027T052814Z-907248`; mobile FAILED (cart-count expected "1", received "0"; tap at (195, 494) received by `promo-overlay`), desktop PASSED; verdict REPRODUCED, regression PASS; oracle exit 1; 19 artifacts SHA-256 hashed in `baseline-summary.json`. Observed: reproduction 2499 ms, oracle 3945 ms, total 3983 ms.
- `pnpm test:e2e:f01`: exit 1 (expected; raw oracle on the defective baseline).
- Mutation checks: overlay neutralized → oracle 2/2 pass, classifier NOT_REPRODUCED, exit 1. `verifier/` removed from trust roots → security test fails (killed after adding the independent trust-root test).
- Meta `GET /models` via adapter: PASS; exact IDs listed. No billable call made. Baseten: NOT TESTED. Docker smoke: BLOCKED. *(Correction, owner clarification 2026-10-27: reclassified as NOT VERIFIED — agent environment lacks Docker access; the absence was observed in the agent's environment, not confirmed on the host.)*
- Required CI: hosted Actions NOT RUN (branch not pushed). The above is local equivalent evidence only.

### Continuation notes
- Evidence lives under `.proofpilot/runs/` (gitignored). The auditor should regenerate it with `pnpm f01:baseline`, not trust the agent's copy.
- The blueprint `packages/meta` became `packages/inference` (shared OpenAI-compatible client); pnpm workspace dropped (see `26203c1`).
- Meta `/models` also lists `muse-spark-1.3-contributor` and older Spark versions. The adapter reports them as related and never substitutes.

### Next action
Auditor: in a clean clone at `f78dad5`, run the Validation commands, inspect `verifier/` vs `config/patch-policy.json`, the classifier abstention cases, adapter redaction/allowlist, and `HACKATHON_CONTRIBUTIONS.md` provenance; report PASS / FIX REQUIRED / PARTIAL.

## Handoff: PP-META-I0-C1-PUB1

- **Task / phase:** `tasks/PP-META-I0-C1.md`
- **From:** Implementation agent (Claude Code, Claude Opus 5.5)
- **To:** Independent audit agent (read-only), then project owner
- **Branch:** `phase/pp-meta-i0-c1` (public, sanitized root)
- **Implementation head:** `88243d110d09f0ff853896841fdf80fe4d5bfce4`
- **PR:** Draft PR to `main` (link in STATUS once created)
- **State:** READY FOR REVIEW

### Completed
- Republished C1 on a new sanitized Git root (owner-authorized). The original local SHAs in handoff `PP-META-I0-C1` are private evidence, not reachable here. Mapping: `HACKATHON_CONTRIBUTIONS.md`.
- Publication-only tree differences from original `be6c39f`: master-only CI governance notes removed from `docs/REPOSITORY-SETUP.md`; template phase label removed from `docs/RELEASE.md`; provenance and this handoff/STATUS. No code or test changes.

### Validation (at `88243d1`, macOS arm64, Node v24.21.0, pnpm 12.6.0, Playwright 1.64.1)
- frozen install, lint, typecheck, profile validator, `git diff --check`: PASS (exit 0). Unit 27/27, security 12/12.
- `pnpm f01:baseline`: exit 0; REPRODUCED (mobile cart-count "0" ≠ "1", tap received by `promo-overlay`), desktop PASS; run `f01-baseline-20261027T054701Z-c399a4`; observed reproduction 2636 ms, oracle 4354 ms, total 4398 ms.
- `pnpm test:e2e:f01`: exit 1 (expected on the defective baseline).
- Meta discovery PASS (recorded at original head; adapter unchanged); Meta inference NOT TESTED; Baseten NOT TESTED; container validation NOT VERIFIED (agent environment lacks Docker access).

### Continuation notes
- Evidence is gitignored; regenerate with `pnpm exec playwright install chromium && pnpm f01:baseline`.
- Audit the exact PR head; the final commit after `88243d1` is docs/provenance only.

### Next action
Auditor: clean clone of the Draft PR head; run the validation commands; review trust boundary, classifier abstentions, adapter safeguards, and provenance; report PASS / FIX REQUIRED / PARTIAL.

## Handoff: PP-META-I0-C1-R1

- **Task / phase:** `tasks/PP-META-I0-C1.md` (remediation of GPT-6 audit, PR #1 comment `6435519902`)
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 independent re-audit (read-only), then project owner
- **Branch:** `phase/pp-meta-i0-c1`
- **Implementation head:** `7828583872f2ea921ffe5a78e7e70e1ac17ef000` (the PR head is this plus a docs-only commit; audit the PR head)
- **PR:** #1 (Draft)
- **State:** READY FOR RE-AUDIT

### Completed
- **MINOR-1:** `packages/inference/src/client.ts` redacts the provider error body before truncating to 300 chars. New test places the cutoff at every position inside a non-pattern key and asserts no 4-char fragment leaks. It failed on the old code (leaked `Zq8v`) and passes now.
- **MINOR-2:** `pnpm f01:baseline` exits 0 only when REPRODUCED + desktop PASS + evidence paths (`fixtures/sample-store`, `verifier`, `packages/core`, `scripts/f01-baseline.ts`, untracked files included) are clean. Dirty or unverifiable → exit 2, artifacts and diagnostics kept, `certified: false` in `baseline-summary.json` and `metrics.json` (`source.certified`). Decision is the pure `certifyF01Baseline()` in `packages/core`. The worktree is checked before and after the oracle run.
- Added `pnpm test:integration` (not wired into CI): runs the real runner in a throwaway git copy. Clean → exit 0 certified; modified tracked fixture file → exit 2, still REPRODUCED/PASS, not certified; untracked file under `verifier/` → exit 2.
- Attribution: recorded per execution evidence in `HACKATHON_CONTRIBUTIONS.md` (C1 = Opus 5.5 as reported by that session; remediation = Sonnet 5.5). Earlier attribution was not rewritten.
- Unchanged: oracle spec and its deliberate mobile failure, `.github/workflows/*` (no diff vs `8826204`), allowlist, no-redirect, billable-off default, typed errors.

### Validation (local, macOS arm64, Node v24.21.0, pnpm 12.6.0, Playwright 1.64.1, at `7828583`, clean tree)
- frozen install, lint, typecheck, profile validator, `git diff --check`: exit 0. Unit 32/32, security 13/13, integration 3/3.
- `pnpm f01:baseline`: exit 0, REPRODUCED, desktop PASS, `certified exact-SHA: YES` (run `f01-baseline-20261027T065007Z-f0bb5b`).
- `pnpm test:e2e:f01`: exit 1 (expected; defective baseline).
- Mutation: dirty guard disabled → unit test and 2 integration tests fail; restored.
- In-session observation: running the new runner on the uncommitted remediation tree returned exit 2 (NOT CERTIFIED) with the three changed paths listed.
- Hosted CI: see PR checks for the pushed head. No live Meta/Baseten call made; no generated patch executed; container isolation still NOT VERIFIED.

### Continuation notes
- Follow-ups from the audit were deliberately not done (see STATUS § Audit follow-ups).
- `pnpm test:integration` needs Chromium and is intentionally outside the default CI steps to preserve CI semantics.

### Next action
GPT-6: re-audit the exact PR head; confirm MINOR-1 and MINOR-2 are closed; report PASS / FIX REQUIRED / PARTIAL.

## Handoff: PP-META-I1-C2A-C1

- **Task / phase:** `tasks/PP-META-I1-C2A.md`
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 independent audit (read-only), then project owner
- **Branch:** `phase/pp-meta-i1-c2a` (local commits only; **not pushed**, no PR)
- **Implementation head:** `444f7d9037ad2cf5d033a0c669f92846ee06b677` (starting point `7066ae47a9deff232589cb8720a04ac4b226d344`; audit the branch head, which adds only this docs commit)
- **PR:** N/A (owner authorization required to push or open a Draft PR)
- **State:** READY FOR REVIEW

### Completed
- **REAL VIDEO RECORDED** (local, gitignored, `.proofpilot/recordings/f01-20261027T075549Z-d6dcfd/`, certified exact-SHA at `e68cf31`; the later commit `444f7d9` changed no recording path):
  - mobile defect `mobile-defect/f01-mobile-defect.mp4`: MP4/H.264, 390×844, 10.04 s, 58,249 B, no audio, SHA-256 `6e45b6822b09ea65c3fef67e3bac0327bd664463e1fcde547ce128820fe45c4f`. Two real coordinate clicks on Add to cart, both received by `promo-overlay`, cart stays `0`.
  - desktop control `desktop-control/f01-desktop-control.mp4`: 1280×800, 7.32 s, 41,584 B, SHA-256 `8fa93fac4ac76d97bfcb7894efd899d290c6e4cc276a70652cf2e05f39e3d6cb`. One click received by `add-to-cart`, cart `1`.
  - Each set has `recording.json` (metadata and artifact hashes), `trace.zip`, `before/after-tap.png`, reference frames, and the raw WebM. SHA-256 was independently recomputed with `shasum`. Frames from the final clips were inspected visually. A yellow press ring is a recorder-injected aid and is disclosed in `recording.json`.
- **Intake** (`packages/intake`): signature/size/duration/codec/full-decode validation (a bare `ffprobe` accepts truncated MP4; decode stderr is what catches it), lexical-first path containment (no existence oracle), no-follow open, private 0700/0600 temp copy always removed, WebM→MP4 converter (exclusive output, deleted if it fails validation), re-verification of bytes before upload, consent bound to run + provider + SHA-256.
- **Symptom** (`packages/core/src/symptom.ts`): strict validator (unknown keys, types, size, control chars, timestamps within the clip, contradictory claims); `provenance:'model-hypothesis'` set by code; deterministic `assessSymptom`. No path to VERIFIED.
- **Meta contract, MOCK TESTED** (`packages/inference`): `POST /files` multipart (`purpose=user_data`, `expires_after[anchor|seconds]`, `file` last, video/mp4) → `POST /responses` (`input_file` by `file_id`, `text.format` json_schema strict) → local validation → `DELETE /files/{id}` in `finally`. Upload and generation are never retried. Needs `PROOFPILOT_ALLOW_BILLABLE_CALLS=1` **and** new `PROOFPILOT_ALLOW_VIDEO_UPLOAD=1`. File ids are validated before use in a path. Non-array/malformed Responses output now yields typed `INVALID_RESPONSE` (closes the earlier audit follow-up).
- **CLI:** `pnpm analyze:video` is a dry run by default (zero network calls); `--live` also needs `--consent-meta-video-analysis` and both opt-ins. Results carry `evidenceKind` live|mock.
- **Design (proposal only):** `design/screens/PP-PRODUCT-SCREEN-MAP.md`. No UI code.
- **Only C1 file touched:** `scripts/f01-baseline.ts` now uses the shared `readWorktreeState` (certification logic unchanged; C1 dirty-evidence integration tests pass). Also fixed `tests/integration/f01-dirty-evidence.test.ts` to copy the working tree (it copied only tracked files). `verifier/`, `fixtures/`, `config/`, `.github/` are unchanged.

### Validation (local, macOS arm64, Node v24.21.0, pnpm 12.6.0, Playwright 1.64.1 / Chromium 156, FFmpeg 9.0.1, at `444f7d9`, clean tree)
- frozen install, lint, typecheck, profile validator, `git diff --check`, tracked-env guard: exit 0
- `pnpm test:unit` 88/88; `pnpm test:security` 27/27; `pnpm test:integration` 9/9
- `pnpm f01:baseline`: exit 0, REPRODUCED, desktop PASS, certified exact-SHA (C1 regression). `pnpm test:e2e:f01`: exit 1 (expected).
- Mutation check: 17 guard removals (consent, byte re-verification, delete-in-finally, upload opt-in, no-retry, file-id checks ×2, hardened extraction, consent bindings ×2, decode check, size, duration, WebM signature, symptom timestamps/unknown keys/cross-field) were all caught.
- Acceptance map: T01 PASS (real MP4 + SHA; consent bound) · T02 PASS (unsupported/oversize/over-duration/corrupt/truncated/missing metadata rejected, zero provider calls) · T03 PASS (mock transport sees zero calls without consent) · T04 **NOT TESTED** · T05 PASS (mock) · T06 PASS (mock).
- Hosted CI: NOT RUN. The new unit and security suites need no ffmpeg and will run in the existing required `Stack validation`; the real-media and browser integration suite is local only.

### Continuation notes
- Real Meta behaviour is unverified. Assumed, not documented by Meta: the Responses `text.format` wrapper and the `output[].content[].output_text` response shape. H.264-only is a deliberate fail-safe.
- Audit hints: confirm no network path precedes consent/validation/opt-ins (`video-analysis.ts`, `client.ts`); confirm ffmpeg runs only on the private temp copy (`media.ts`); confirm `.proofpilot/` stays untracked.
- Not done on purpose: any live call or upload, UI shell, patch execution, C3, push.

### Next action
GPT-6: audit the branch head against the C2A contract, regenerate evidence with `pnpm record:f01` and the commands above (needs Chromium and ffmpeg), report PASS / FIX REQUIRED / PARTIAL. Owner: decide push/Draft PR, the screen-map direction, and whether to authorize one capped live smoke.

## Handoff: PP-META-I1-C2A-R1

- **Task / phase:** `tasks/PP-META-I1-C2A.md` (remediation of GPT-6 audit comment 6438633690 on PR #2)
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 independent re-audit (read-only), then project owner
- **Branch / PR:** `phase/pp-meta-i1-c2a`, Draft PR #2. Audited head `ff5157240c34caa95d8bb306c1898039479e6aae`; code fix `01da814da136f9ea982624414ec5baf9569f24eb` (audit the branch head, which adds only this docs commit)
- **State:** READY FOR RE-AUDIT

### Completed
- **MAJOR-1:** `packages/inference/src/analyze-command.ts` reserves the run directory atomically (non-recursive `mkdir`) before any provider call; transport is wrapped to count calls. Duplicates and simultaneous same-id launches (2 and 8 concurrent tested) make zero network calls and exactly one run proceeds. Unused reservations (pre-flight refusals) are released; a reservation that reached the network is kept even if an unexpected error follows. Other run ids are never blocked. `analysis.json` is still `wx` (never overwritten).
- **MINOR-2:** `certifyRecording` (`packages/core/src/worktree.ts`) decides certification once after recording; `scripts/f01-record.ts` writes `recording.json` only afterwards. Real-browser regression (`tests/integration/f01-record-certification.test.ts`) edits a fixture file mid-recording: exit 2, every clip `certifiedExactSha:false`, before=clean/after=dirty; control run is certified/exit 0.
- Trusted oracle and protected paths (`verifier/`, `fixtures/`, `config/`, `.github/`) unchanged. No live Meta call, upload or patch execution.

### Validation (local, at `01da814`)
lint/typecheck/`git diff --check` clean; unit 97/97; security 27/27; integration 11/11; `pnpm f01:baseline` exit 0 REPRODUCED certified; `pnpm test:e2e:f01` exit 1 (expected); new certified recording set (see STATUS). Mutations: no-reservation killed (5 tests), always-release killed (new test), certify-ignores-after killed (unit + integration), certify-ignores-failure killed.

### Continuation notes
- A crashed live run leaves its run directory, so the id is burned by design (fail-closed against double billing); use a new `--run-id`.
- Unchanged open items: real Meta model NOT TESTED (T04), `text.format`/response-shape assumptions, Docker NOT VERIFIED, screen map not approved, no C3.

### Next action
GPT-6: re-audit the exact head against both findings; then owner decisions as in STATUS.

## Handoff: PP-META-I1-C2B-A1

- **Task / phase:** `tasks/PP-META-I1-C2B.md`, Workstream A only
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 independent review, then project owner
- **Branch:** `phase/pp-meta-i1-c2b` from `85f7a498aa336e0082344c36cbebfacb8b880ebe`; local commits only, **not pushed**, no PR
- **Implementation commit:** `5c06615197f42a0af582f0b19cdfca480e236d44` (the branch head adds only this docs commit)
- **State:** READY FOR REVIEW

### Completed
- **C2B-01 authenticity:** `.proofpilot/recordings/f01-20261027T122211Z-df375a/mobile-defect/f01-mobile-defect.mp4` exists; `shasum -a 256` = `e9df68b14c48300818f9ec9407b884413037f29305f17a5da3cc4fac05eeafdf` (match); `recording.json`: `certifiedExactSha:true`, worktree clean before/after, source HEAD `01da814` (pre-squash, not relabelled), fixture tree `c76561ac` equals `main`'s, 390×844, synthetic, outcome as expected; real intake validation: MP4/H.264, 10.04 s, 57,596 bytes. Evidence not regenerated.
- **C2B-02 dry run:** `analyze-video --run-id c2b-dryrun-1` printed `NETWORK CALLS MADE: 0`, consent NOT GIVEN, opt-ins off; repeated with `globalThis.fetch` replaced by an exiting trap (no trigger). Planned payload: Files (`user_data`, 3600 s) → Responses (`muse-spark-1.3`, input_file + text.format) → DELETE.
- **Model discovery:** `GET /models` only (non-billable), key from the owner's private `.env.local`, never printed: `muse-spark-1.3` AVAILABLE by exact id (9 models listed; related ids not substituted); `muse-wonder-1.0` AVAILABLE. Baseten NOT TESTED.
- **C2B-03 lifecycle** (`client.ts`, `video-analysis.ts`): schema fetched from dev.meta.ai (`status` optional; `error`, `incomplete_details` objects or null; refusal content part). Fail closed: explicit status other than `completed`, unknown/non-string status, non-null error/incomplete_details, or refusal → `ANALYSIS_FAILED` `RESPONSE_NOT_COMPLETED` even with output text; text discarded; usage/request id/model still recorded; file still deleted; no retry. Absent/null status is accepted when nothing else is wrong. Only short machine codes from provider objects are surfaced (free text never). Usage now also records total/reasoning tokens and video frames. CLI prints lifecycle, ids and usage (no cost computed).
- **C2B-04 duplicate protection:** unchanged C2A reservation; regression suite passes.
- **Live-smoke gate:** `docs/LIVE-SMOKE.md` (checklist, exact command, post-run steps, API uncertainties). Request envelope asserted by test: one generation, 1500 output tokens, 3600 s expiry, no tools/web/search/previous_response_id/stream, DELETE last.
- Unchanged: `verifier/`, `fixtures/`, `config/`, `.github/`. No secrets or media in Git.

### Validation (local, macOS arm64, at `5c06615`)
lint/typecheck/`git diff --check` clean; unit 112/112; security 27/27; integration 11/11 (real ffmpeg and browser); `pnpm f01:baseline` exit 0 REPRODUCED certified; `pnpm test:e2e:f01` exit 1 (expected). Mutants killed 7/7 (ignore status, error, incomplete_details, refusal; accept unknown status; keep text when not completed; analyzer ignores lifecycle). Hosted CI: NOT RUN.

### Open items / uncertainties
- Real Meta behaviour still unverified (T04 NOT TESTED): `text.format` acceptance, whether an uploaded file is immediately usable (no polling implemented), output shape in practice, cost. No hard currency cap exists.
- Docker NOT VERIFIED; no patch execution; screen map not approved; no C3.

### Next action
GPT-6: review the exact head. Owner: authorize publication; separately decide on Workstream B using `docs/LIVE-SMOKE.md`.

## Handoff: PP-META-I1-C2B-R1-A1

- **Task / phase:** `tasks/PP-META-I1-C2B-R1.md`
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 independent audit, then project owner
- **Branch:** `phase/pp-meta-i1-c2b-r1` from `main` `0b49d94914576d3c8c605d0a1f50d08d77c4bb8b`; Draft PR (see PR). Audit the branch head.
- **State:** READY FOR REVIEW

### Completed
- First real smoke `c2b-live-smoke-001` recorded as **T04 PARTIAL** in STATUS and `docs/LIVE-SMOKE.md` (accepted transport; `incomplete` / `max_output_tokens`; 2773/1500/4273 tokens, 1113 reasoning; file reported deleted; cost unknown; no Symptom). Local evidence preserved unchanged. Request ids: upload `df486a8b-18e5-47cf-bc70-e028b238b5f8`, response `536fb081-2d11-4010-aa3a-fb510c3626bc` (agent-reported).
- `client.ts`: native video request adds `reasoning: {effort: 'low'}` (constant `VIDEO_REASONING_EFFORT`); the text path is untouched. `video-analysis.ts`: default cap 3072; cap validated in pre-flight so an invalid value can never be found after the upload.
- Tests: envelope asserts 3072 + low and no tools/web/stream/previous_response_id; text path has no `reasoning`; 4096/4097/0 cap boundaries (4097 and 0 refused with zero calls); still-incomplete at the larger cap fails with delete and no second generation; existing completed/failed/refusal/duplicate-run/default-deny suites pass.
- `docs/LIVE-SMOKE.md`: spent-id warning, proposed `c2b-live-smoke-002`, new settings, revised cost arithmetic, mandatory fresh owner authorization.
- Unchanged: `verifier/`, `fixtures/`, `config/`, `.github/`, consent, opt-ins, run-id reservation, retry policy, Symptom schema.

### Validation (local, mocked only, no network)
lint/typecheck/`git diff --check` clean; unit 115/115; security 27/27; integration 11/11; `pnpm f01:baseline` exit 0 REPRODUCED certified; `pnpm test:e2e:f01` exit 1 (expected). Mutants killed 5/5 (no reasoning, effort `none`, cap 1500, no cap pre-check, reasoning on the text path).

### Open items
- Whether low reasoning plus 3072 tokens yields a completed, schema-valid answer is unknown until a new, separately authorized live call.
- Docker NOT VERIFIED; no patch execution; screen map not approved; no C3.

### Next action
GPT-6: audit the exact head. Owner: after merge, decide on a second live attempt.

## Handoff: PP-META-I1-C2B-DOC-1

- **Task / phase:** C2B completion documentation (docs only; no task file, scope given by the owner request referencing PR #4 comment 6446824225)
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 independent review, then project owner
- **Branch:** `docs/pp-meta-i1-c2b-completion` from `main` `9103d00e1b82f260a41498e7c64201ccd398be15`; Draft PR (audit the branch head)
- **State:** READY FOR REVIEW

### Completed
- STATUS, HANDOFFS and `docs/LIVE-SMOKE.md` now record: C2B-R1 merged via PR #4 (audit PASS at `47926fb`); T04 **completed on the agent-reported** run `c2b-live-smoke-002` (provider `completed`, local `VIDEO_ANALYZED`, schema-valid `model-hypothesis` Symptom); the cart failure is consistent with F01 but does not establish the overlay as root cause; runs 001 and 002 are permanently spent; remote files reported deleted; actual charge unverified and every cost figure illustrative, not a cap; Docker/ARM64 isolation NOT VERIFIED so no generated patch may execute.
- LIVE-SMOKE "NOT AUTHORIZED" banner replaced by "no live run authorized, both runs spent"; the old command is labelled a historical template; the $0.02 "worst case" wording is removed.
- Gitignored live evidence untouched (run 001 `analysis.json` SHA-256 `51c26b9ddc255ab21b496c25751c904a8dac2f686789c7e2b498cca8c8e2f7f7` unchanged; run 002 file mode 0600). No code, test, `verifier/`, `fixtures/`, `config/` or `.github/` change. No Meta request made.

### Open items
- Run 002 traffic, usage, deletion and Symptom content are agent-reported, not independently confirmed; billing unverified.
- Docker NOT VERIFIED; no patch execution; screen map not approved; C3 not started.

### Next action
GPT-6: review the exact head. Owner: decide when to start C3 (proposal only).

## Handoff: PP-META-I2-C3-PIVOT-1

- **Task / phase:** PP-META-I2-C3, hackathon pivot contract (docs only)
- **From:** Owner-directed planning session (Claude, Sonnet 5.5)
- **To:** GPT-6 independent review, then the implementation agent
- **Branch:** `docs/pp-meta-i2-c3-pivot` (PR #6), based on `main` at `5658529`
- **State:** SUPERSEDED by PP-META-I2-C3-PIVOT-2. GPT-6 audited head `1e8a3b5` as FIX REQUIRED; the statements below about owner acceptance of the sandbox decision are withdrawn.

### Completed
- `tasks/PP-META-I2-C3.md` written: verified candidate scoreboard, work packages C3-A to C3-F with PHT dates, execution controls replacing Docker, verdict rules, acceptance criteria, stop conditions.
- `docs/STATUS.md` updated: phase, authorization, open gates, next action. Wonder, Docker and the five-screen UI are recorded as cut or unverified, not as done.
- No code, test, `verifier/`, `fixtures/`, `config/` or `.github/` change. No Meta request made.

### Open items
- Live-call cap (12 Spark + 4 Spark Open) is a proposal until the owner confirms.
- (Withdrawn) The sandbox decision was described as accepted by the owner in chat. It is NOT APPROVED; see PP-META-I2-C3-PIVOT-2.
- Muse Wonder's role is unconfirmed.

### Next action
GPT-6: review the contract and the sandbox decision. Owner: confirm the cap, ask about Wonder, authorize the start of C3-A.

## Handoff: PP-META-I2-C3-PIVOT-2

- **Task / phase:** PP-META-I2-C3, remediation of the PR #6 audit (docs only)
- **From:** implementation agent (Claude Code)
- **To:** GPT-6 re-audit of the new exact head, then the owner
- **Branch / PR:** `docs/pp-meta-i2-c3-pivot`, PR #6; base `main` at `5658529319032236fcddb472a617fbdc5cf9aadd`
- **State:** READY FOR RE-AUDIT. Verify the exact head SHA on the PR before reviewing.

### Completed
- `tasks/PP-META-I2-C3.md` revision 2: decision register (SEC-C3-01, LIVE-C3-01, UI-C3-01 all not approved), closed-grammar CSS adjustment boundary for F01, verifier facts (fixed root and port 4173) and a per-candidate staging mechanism with a zero-model spike, NC-4 rewritten to fail closed, separate DID-1 interception harness, fail-closed proposal adapter requirements, report design gate.
- `design/screens/PP-C3-REPORT-CONTRACT.md` added (approval pending).
- `docs/SECURITY.md`: stale "mocks only" text corrected, `generateText` gap recorded, proposed boundary added as NOT APPROVED. `docs/STATUS.md`, README, PRODUCT and ARCHITECTURE corrected for stale branch, merge and Muse Wonder statements. `docs/CHATGPT-PIVOT-PROMPT.md` removed.
- No code, test, `verifier/`, `fixtures/`, `config/` or `.github/` change. No Meta request, no billable call, no AI-generated patch executed.

### Open items
- Owner decisions: SEC-C3-01, LIVE-C3-01 (exact numbers), UI-C3-01.
- Candidate oracle runs are uninstrumented by design; the re-audit should confirm that closed-grammar rendering plus DID-1 is an acceptable substitute for runtime interception.
- The staging spike (dependency symlink resolution, trace-based nonce proof) is unproven until C3-B.

### Next action
GPT-6: re-audit the exact head. Owner: record decisions, merge if satisfied. Implementation agent: do not start C3 until the start gates in the task are met.

## Handoff: PP-META-I2-C3-PIVOT-3

- **Task / phase:** `tasks/PP-META-I2-C3.md` revision 3 (docs only; PR #6)
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 final exact-head review, then project owner
- **Branch:** `docs/pp-meta-i2-c3-pivot` (Draft/Open PR #6); previous reviewed head `aeb3821db4959f0212d440bd85863a2a3958201b`; audit the branch head
- **State:** READY FOR REVIEW

### Completed (remediation of re-audit 6460634258)
- **BLOCKER-1:** the raw-text brace/quote scanner is removed. New "Proposal validation pipeline": byte bound before parse; strict single-value JSON with duplicate-key detection; forbidden-content scan over decoded, NFKC-normalised keys and string values of the parsed tree; exact shape, 0 to 4 string-only items, closed selector/property/value grammar, duplicate-pair rejection; deterministic precedence (size and syntax first, then forbidden content, then grammar); `PATCH_REJECTED` vs `SECURITY_BLOCKED` defined; rendering only from host constants, plus exact staged-byte check. Vector table covers valid JSON (PV-1 to PV-4), malformed JSON, fenced/BOM JSON, braces/quotes as framing, extra `path`/`html` keys, `url(` in a field, escaped/fullwidth/comment-split variants, prototype keys, duplicate pairs and keys, five entries, wrong types, each with its exact status and a no-side-effects assertion. NC-2, NC-4, NC-1 and PC-1 now point to it.
- **README / ARCHITECTURE:** stale "real inference NOT TESTED / MOCK TESTED only" replaced by the C2B live results with attribution (agent-reported, two runs spent, charge unverified); ARCHITECTURE marks the original topology historical and lists what is built vs not built.
- **Symlink wording:** a symlink is stated not to enforce read-only; frozen install inside the stage preferred; the symlink option requires a before/after dependency manifest, a stage containment walk and a no-write check, and is detect-only. Staging proofs are labelled proposed, not demonstrated.
- Approval register unchanged: SEC-C3-01, LIVE-C3-01 and UI-C3-01 remain NOT APPROVED. No code, test, `verifier/`, `fixtures/`, `config/` or `.github/` change; no Meta call; no patch execution.

### Open items
- The pipeline and staging spike are specifications only; nothing is implemented or demonstrated. Docker/sandbox NOT VERIFIED. Owner decisions pending.

### Next action
GPT-6: final exact-head review. Owner: decide SEC-C3-01, LIVE-C3-01, UI-C3-01 and merge.

## Handoff: PP-META-I2-C3-0-A1

- **Task / phase:** `tasks/PP-META-I2-C3.md` (C3-0 zero-model staging spike only)
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 independent exact-head review, then project owner
- **Branch:** `phase/pp-meta-i2-c3-0-staging-spike` from `main` `c316df930501187543c1296cee41946162565278`; code head `e27c6a5a7947aebd5509692dba36830c641ceae4`; Draft PR (audit the branch head)
- **State:** READY FOR REVIEW

### Completed
- SEC-C3-01 approval recorded in the task register with the owner link (6460953906); LIVE-C3-01 and UI-C3-01 left unapproved.
- Audit follow-ups reconciled in the task file: V2 now strips Cf/default-ignorable/whitespace after a pre-strip control-character check (new vectors FC-3b, FC-3c); `pnpm-lock.yaml` (and any pnpm workspace metadata) is a trusted staged input; STATUS/handoff pointers refreshed (revision 4).
- Implemented the C3-0 spike: stage from `git archive <sha>` outside the repo (0700), blob-by-blob verification, contained dependency copy with before/after manifests, exclusive lock and fixed-port preflight, host-rendered CSS only, unmodified oracle run with a scrubbed env, trace-based nonce/response-hash proof, post-run integrity recheck, cleanup, hashed evidence.
- Result: NC-1 and NC-1b `PATCH_FAILED` with the baseline signature, PC-1 `ORACLE_PASS` (mobile and desktop), served CSS equals the staged candidate in every trace (independently re-checked), 0 model/provider calls, trusted sources unchanged.
- One existing-file change outside the new code: `package.json` `test:integration` now runs files serially (`--test-concurrency=1`) because integration files share port 4173; CI is unaffected (it does not run integration tests).

### Validation
See `docs/STATUS.md` (lint, typecheck, unit 141/141, security 27/27, integration 19/19, baseline regression, mutation checks). Hosted CI: see the Draft PR.

### Deviations and uncertainties for the reviewer
- Dependencies use a hash-checked contained copy, not an offline frozen install (impossible here: `ERR_PNPM_NO_OFFLINE_META`); documented in the task file as option (b). Detect-only.
- The Chromium cache was missing and was re-downloaded with the documented `playwright install chromium`; this is the only network access.
- Trace-based proof depends on the Playwright 1.64.1 trace layout.

### Not done on purpose
C3-A validator/adapter, scoreboard, report UI, any model or provider call, any model-generated candidate, merge, deploy.

### Next action
GPT-6 review; then owner decisions.

## Handoff: PP-META-I2-C3-0-R1

- **Task / phase:** `tasks/PP-META-I2-C3.md` (C3-0), remediation of GPT-6 audit 6461860392 on PR #7
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 independent exact-head re-audit, then project owner
- **Branch:** `phase/pp-meta-i2-c3-0-staging-spike` (Draft PR #7); audited head `9f1ec0d43d77b3c9e78f80cff69805bf5870e16f`; remediation code head `0d2a139a93c24741232649819ca70f81fbad012b`; audit the branch head
- **State:** READY FOR RE-AUDIT

### Completed
- **MAJOR-1:** pure `decideOutcome`: pass needs exit 0 plus both trusted tests passing with the expected observations; passing rows with a nonzero or missing exit are `INCONCLUSIVE` (`ORACLE_EXIT_ABNORMAL`); `PATCH_FAILED` only for exit 1 with settled rows. Unit table and integration tests (exit forced to 7 with passing rows, exit forced to 0 with failing rows, genuine NC-1 still `PATCH_FAILED`).
- **MAJOR-2:** `finalizeEvidence` / `verifyPersistedEvidence`: required artifacts (report, stdout, two traces, two observations) must exist and be hashed; atomic record write; read-back re-verification; any failure downgrades to `INCONCLUSIVE`/`EVIDENCE_INCOMPLETE` and removes a stale passing record. Deterministic fault-injection tests: missing artifact (each of the six, unit), incomplete required list, hashing failure, failed record write, hash change between passes, tampered/extra files, and real-run integration faults (write failure, hash failure, trace deleted for a pass and for a fail, stale record removed when the downgrade write also fails). The spike script now fails if evidence is incomplete for NC-1, NC-1b or PC-1.
- **docs/SECURITY.md:** SEC-C3-01 recorded as approved (bounded, hand-authored controls only until C3-A, tests and audit); broader executable model patches still require independently verified isolation; LIVE-C3-01 and UI-C3-01 remain not approved.
- Unchanged: `verifier/`, `fixtures/sample-store/`, `config/` (incl. patch policy), `.github/`. No model/provider call. No model-generated candidate.

### Validation
See `docs/STATUS.md` (spike run `c3-0-20261028T060805Z-b1794a`, unit 152/152, security 27/27, integration 25/25, baseline regression, mutation checks). Hosted CI: see PR #7.

### Open items / limits
- Dependency integrity is detect-only; browser binaries outside manifests; trace layout pinned to Playwright 1.64.1; the real-browser staging tests are local only.
- C3-A (validator pipeline V0 to V7 and provider adapter), LIVE-C3-01 and UI-C3-01 remain not started or not approved.

### Next action
GPT-6: re-audit the exact head. Owner: decisions after audit; no merge by the agent.

## Handoff: PP-META-I2-C3-A-A1

- **Task / phase:** `tasks/PP-META-I2-C3.md` (C3-A: strict proposal pipeline, mocks only)
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 independent exact-head review, then project owner
- **Branch:** `phase/pp-meta-i2-c3-a-proposal-pipeline` from `main` `142cd5b36aef4288c48a25caf401bd023e29b441`; code head `9f6b8930cfc2625fc307fac4022ab663f1bace2d`; Draft PR (audit the branch head)
- **State:** READY FOR REVIEW

### Completed
- Parser V0 to V7 (`packages/core/src/patch-proposal.ts`), adapter (`packages/inference/src/patch-proposal.ts`, `structuredResponse` in `client.ts`), reservations (`reservations.ts`), artifacts under gitignored `.proofpilot/proposals/`. Details and limits: `docs/STATUS.md` (C3-A result).
- Tests: `tests/unit/patch-proposal-parser.test.ts` (all contract vectors), `tests/unit/patch-proposal-adapter.test.ts` (lifecycle, model, no-retry, redaction, consent, bounds, quota, duplicate/concurrent/restart/burned reservations, Baseten mock), `tests/security/proposal-boundary.test.ts` (no execution path, no VERIFIED, no caller outside tests, live quota 0, real-transport refusal under a fetch trap).
- Contract fix: vector G-1 `.promo-overlay > *` is `SECURITY_BLOCKED` by precedence (table corrected, G-1b).
- Unchanged: `candidate-stage.ts`, `verifier/`, `fixtures/sample-store/`, `config/`, `.github/`. No Meta/Baseten call, no execution of any proposal, no C3-B.

### Validation
Unit 207/207, security 33/33, integration 25/25, F01 baseline certified, C3-0 spike NC-1/NC-1b `PATCH_FAILED` and PC-1 `ORACLE_PASS`, 14/14 mutants killed. Hosted CI: see the Draft PR.

### Open questions for the reviewer
- Whether the `provider.transport` flag is an acceptable guard against real network use (it cannot be forged by configuration, only by deliberately passing a real `fetch` to `createProvider`).
- The proposal structured-output schema and the Baseten chat-completions request/response shape are unverified against the real APIs.
- The reservation lock fails closed on a stale lock and needs a manual delete.

### Next action
GPT-6 review; owner decides merge. C3-B and any live use need a new handoff, LIVE-C3-01 and fresh authorization.

## Handoff: PP-META-I2-C3-A-R1

- **Task / phase:** `tasks/PP-META-I2-C3.md` (C3-A), remediation of GPT-6 audit 6463012075 on PR #8
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 independent exact-head re-audit, then project owner
- **Branch:** `phase/pp-meta-i2-c3-a-proposal-pipeline` (Draft PR #8); audited head `9cce80c4657dc7247d5276a7d069adff61dd7306`; remediation code head `6747b2949b95c0be60be91131c45adba5710a942`; audit the branch head
- **State:** READY FOR RE-AUDIT

### Completed
- **MAJOR-1:** explicit `status === "completed"` required for Meta proposals (provider layer and `processProposalResponse`); absent/null/empty/wrong-type/unrecognised statuses fail closed with one request, burned run id and slot, and settled reservation. C2B video behaviour unchanged (verified by tests and a mutant).
- **MAJOR-2:** `transport` label and `injectedTransportQuota` removed; `proposeCandidate` is hard-disabled and does nothing but throw `LIVE_NOT_APPROVED`; full flow moved to the mock-only `tests/support/proposal-harness.ts` over pure production pieces. Adversarial tests (Meta and Baseten; forwarding transport, Proxy-wrapped provider, forged provider object, positive quotas, consent, credentials, billable flags) assert zero callbacks, zero network access, zero reservations and zero files. Static tests assert nothing in `packages/` or `scripts/` calls `structuredResponse` or imports the harness.
- **Secondary:** orphan-slot behaviour documented, tested and reported by `listOrphanSlots` (never recycled); human-consent requirement for live operation stated explicitly (the mock tests do not demonstrate it).
- Unchanged: `candidate-stage.ts`, `verifier/`, `fixtures/sample-store/`, `config/`, `.github/`. No Meta/Baseten/Modal call. No model-generated candidate executed. No C3-B.

### Validation
Unit 211/211, security 36/36, integration 25/25, F01 baseline certified, C3-0 spike NC-1/NC-1b `PATCH_FAILED` and PC-1 `ORACLE_PASS`, 6/6 new mutants killed. Hosted CI: see PR #8.

### Open items
- Live proposals remain impossible by design; LIVE-C3-01 and UI-C3-01 are not approved. A future live commit must change the entry point, add real human consent capture and audit trail, and be reviewed separately.
- Unverified: proposal structured-output schema and the Baseten chat-completions shape against the real APIs; reservation lock crash-safety.

### Next action
GPT-6: re-audit the exact head. Owner: decisions after audit; no merge by the agent.

## Handoff: PP-META-I2-C3-B1-A1

- **Task / phase:** `tasks/PP-META-I2-C3.md` (C3-B1: offline candidate verification coordinator, hand-authored controls only)
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 independent exact-head review, then project owner
- **Branch:** `phase/pp-meta-i2-c3-b1-offline-verification` from `main` `65e2a1f5c4f7aaaa56da1abb86c22485b2610209`; code head `358c273d6cfcf06829b62c05810fe8f116e1086a`; Draft PR (audit the branch head)
- **State:** READY FOR REVIEW

### Completed
- Coordinator, `decideVerification`/`baselineGate`/`replayPassProblems`, atomic scoreboard, `verifyScoreboard`; controls NC-1, NC-1b, NC-3, NC-6, NC-7, PC-1 (3 replays) and derived NC-5; separate DID-1 demonstration; `scripts/c3-offline-verification.ts`. Example scoreboard: `docs/examples/c3-b1-scoreboard.example.json`.
- Result: PC-1 `VERIFIED` 3/3 (hand-authored, three fresh stages, distinct nonces, evidence re-checked independently); NC-1, NC-1b, NC-3 `PATCH_FAILED`; NC-6 `TAMPER` and NC-7 `PORT_BUSY` `INCONCLUSIVE`; NC-5 `NOT_REPRODUCED`; DID-1 passed as a separate demonstration.
- Docs only: `docs/BASETEN-COMPATIBILITY-PLAN.md` (pinned id `meta-models/muse-spark-open-1026` vs public docs naming "Muse Spark Open" without a slug, and the public statement that Muse Spark Open does not support structured outputs, which our Baseten request uses; staged B0 to B4 plan, nothing run) and `docs/MODAL-FEASIBILITY-PROPOSAL.md` (feasibility and scope-change proposal; the C3 contract prohibits hosted backends; egress controls not found in the guide page read; not a verified boundary; HOST-C3-01 not requested).
- Unchanged: `candidate-stage.ts`, proposal modules, `verifier/`, `fixtures/sample-store/`, `config/`, `.github/`. No Meta/Baseten/Modal call. No model-generated candidate. Production `proposeCandidate` still hard-disabled; live quota still 0.

### Validation
Unit 228/228, security 41/41, integration 28/28, F01 baseline certified, C3-0 spike unchanged, 14/14 mutants killed. Hosted CI: see the Draft PR.

### Open items and questions for the reviewer
- Whether `VERIFIED` for a hand-authored closed-grammar CSS control under local replays is worded narrowly enough (scope text in STATUS).
- The coordinator and oracle locks are not crash-safe (fail closed).
- Baseten: structured-output support and the served id are unresolved; Modal: egress control undocumented in the page read.
- Not done on purpose: report UI (UI-C3-01), model proposals through the coordinator (C3-B2), any provider or Modal call.

### Next action
GPT-6 review; owner decides merge and any of LIVE-C3-01, Baseten stages, HOST-C3-01, UI-C3-01.

## Handoff: PP-META-I2-C3-B1-R1

- **Task / phase:** `tasks/PP-META-I2-C3.md` (C3-B1), remediation of GPT-6 audit 6464103194 on PR #9
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 independent exact-head re-audit, then project owner
- **Branch:** `phase/pp-meta-i2-c3-b1-offline-verification` (Draft PR #9); audited head `02dfa8208a7f0179066f22858ffd5384a3c7af2e`; remediation code head `6002b6009dd952da019b64319ec2c4f15367d211`; audit the branch head
- **State:** READY FOR RE-AUDIT

### Completed
- **MAJOR-1:** `verifyScoreboard` enforces the exact trusted control inventory and recomputes counts, status, reason, expectation metadata and NC-5 from persisted evidence; truncated/padded replay lists, forged NC-5, fake counts and a false `complete` fail; truthful negative-case scoreboards still verify.
- **MAJOR-2:** baseline and every replay must name the approved SHA in record and manifest; replays must match the baseline's trusted manifest; exactly one `F01-MOBILE` and one `F01-DESKTOP` proof per run. `decideVerification` now takes `{approvedSha, baseline, replays}`. Three-replay VERIFIED rule and `candidate-stage.ts` unchanged.
- STATUS and SECURITY updated; example scoreboard regenerated from the new run.
- Unchanged: `verifier/`, `fixtures/sample-store/`, `config/`, `.github/`, proposal modules. No Meta/Baseten/Modal call. No model-generated candidate. No report UI.

### Validation
Unit 237/237, security 41/41, integration 28/28, F01 baseline certified, C3-0 spike unchanged, real C3-B1 run all expectations met and re-verified, 15/16 new mutants killed (1 equivalent). Hosted CI: see PR #9.

### Open items
- The coordinator and oracle locks are not crash-safe (fail closed). Baseten, Modal, LIVE-C3-01, UI-C3-01 remain unstarted/unapproved.

### Next action
GPT-6: re-audit the exact head. Owner: decisions after audit; no merge by the agent.

## Handoff: PP-META-I2-C3-B1-R2

- **Task / phase:** `tasks/PP-META-I2-C3.md` (C3-B1), remediation of GPT-6 re-audit 6464385552 (MAJOR-3) on PR #9
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 independent exact-head re-audit, then project owner
- **Branch:** `phase/pp-meta-i2-c3-b1-offline-verification` (Draft PR #9); audited head `43630004d605d1809dcfa6f34538a8ecb674241c`; remediation code head `bb64b736a57f83a90884f516f79ac5de3e283ef7`; audit the branch head
- **State:** READY FOR RE-AUDIT

### Completed
- MAJOR-3: shared `buildReplayEntry`; `verifyScoreboard` rebuilds and compares every ReplayEntry field (and rejects extra keys) for the baseline and every candidate replay; baseline pinned to `BASELINE/replay-1` with a `BASELINE`-labelled record; candidate records must carry their control ids. MAJOR-1 and MAJOR-2 fixes untouched. `decideVerification`, the oracle and C3-0 staging unchanged.
- Test race fixed (concurrent coordinators: either may win).
- Unchanged: `verifier/`, `fixtures/sample-store/`, `config/`, `.github/`, `candidate-stage.ts`, proposal modules. No Meta/Baseten/Modal call. No model-generated candidate. No report UI.

### Validation
Unit 242/242, security 41/41, integration 29/29, F01 baseline certified, C3-0 spike unchanged, real C3-B1 run all expectations met and re-verified, 8/8 new mutants killed. Hosted CI: see PR #9.

### Open items
- Locks are not crash-safe (fail closed). Baseten, Modal, LIVE-C3-01, HOST-C3-01, UI-C3-01 unstarted/unapproved.

### Next action
GPT-6: re-audit the exact head. Owner: decisions after audit; no merge by the agent.

## Handoff: PP-META-I2-C3-B2A-A1

- **Task / phase:** `tasks/PP-META-I2-C3-B2A.md` (pre-live readiness; preparation only)
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 independent exact-head review, then project owner
- **Branch:** `phase/pp-meta-i2-c3-b2a-prelive-readiness` from `main` `4d4a26b2c5969f0330f6e75411e58f037f2b08ed`; code head `f87fef33791fcad9b56e2049fe59a713a7cbde07`; Draft PR (audit the branch head)
- **State:** READY FOR REVIEW

### Completed
- STATUS corrected (PR #9 merged; `main` at `4d4a26b`).
- `proposal-readiness.ts` + `scripts/c3-proposal-preflight.ts` (zero-network, deterministic, cannot authorize); coordinator guard `assertHandAuthoredControls`; `baseten-discovery.ts` + `scripts/baseten-model-discovery.ts` (owner-run, prepared, only ever dry-run here); `docs/LIVE-C3-01-DECISION-RECORD.md` (NOT APPROVED); `docs/META-ACTIVATION-CHECKLIST.md`; Baseten findings and Modal documentation updated; planned proposal-to-verdict pathway documented in the task file with the C3-B2B gate.
- Evidence: preflight 28 checks per provider (24 PASS, 2 BLOCKED_BY_DESIGN, 1 INFO, 1 NOT_CHECKED), 0 provider requests; local gitignored reports under `.proofpilot/preflight/`.
- Unchanged: `APPROVED_LIVE_QUOTA` (0), `proposeCandidate()` (hard-disabled), `patch-proposal.ts`, `reservations.ts`, `candidate-stage.ts`, `verifier/`, `fixtures/`, `config/`, `.github/`. No Meta/Baseten/Modal call, no credential read, no model-generated candidate, no report UI.

### Validation
Unit 259/259, security 49/49, integration 29/29, F01 baseline certified, C3-0 spike and the real C3-B1 run unchanged (PC-1 VERIFIED 3/3 under hand-authored controls), guard mutants 20/22 killed (2 cosmetic no-ops). Hosted CI: see the Draft PR.

### Open questions for the reviewer
- Is the coordinator guard (byte-for-byte equality with the in-code inventory) the right boundary, and is the C3-B2B gate described precisely enough?
- Are the LIVE-C3-01 terms (one attempt, per-run operator approval, no automatic evaluation) a sound shape for the owner to approve or edit?
- Baseten: the structured-output conflict is unresolved offline; the plan keeps the mock path unchanged.

### Next action
GPT-6 review; owner decides merge and any of LIVE-C3-01, the Baseten discovery, per-run approval design, C3-B2B, HOST-C3-01, UI-C3-01.

## Handoff: PP-META-I2-C3-B2A-A2

- **Task / phase:** `tasks/PP-META-I2-C3-B2A.md` (remediation of audit 1 on Draft PR #10)
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 independent exact-head re-audit, then project owner
- **Branch:** `phase/pp-meta-i2-c3-b2a-prelive-readiness`; code head `69d1e94aaa0046b68bef54dd37212bf51af2cef8` (audit the branch head)
- **State:** READY FOR RE-AUDIT

### Completed
- MAJOR-1: identity-based provenance in `candidate-coordinator.ts` (frozen, registered controls; no production injection path); tests: PV-1-derived PC-1 clone, copied/deep-copied/prototype-derived PC-1, foreign `check` on PC-1 and NC-1, mutation attempts, no lock/stage/out dir created, runner never reached, legitimate controls still accepted.
- MINOR-2: `readApiKey:false` config mode; default preflight never touches key fields; authorized run reads only the selected provider key and reports presence.
- Unchanged: `VERIFIED` logic, `candidate-stage.ts`, verifier, fixtures, patch policy, quota (0), `proposeCandidate()` (disabled). No provider/Modal call, no model-generated candidate, no UI.

### Validation
Unit 262/262, security 50/50, integration 29/29, baseline certified, real C3-B1 run PC-1 VERIFIED 3/3. Hosted CI: see the Draft PR.

### Next action
GPT-6 re-audit; owner decides merge and later gates.

## Handoff: PP-META-I2-C3-LIVE-01A-A1

- **Task / phase:** `tasks/PP-META-I2-C3-LIVE-01A.md` (human approval and live-activation safety gate; implementation and mock tests only)
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 independent exact-head review, then project owner
- **Branch:** `phase/pp-meta-i2-c3-live01a-approval-gate` from `main` `e2e0216e922ef72b8310b3ec81e5afc4e6208fab`; code head `7079aadc3f98b323bc35338bf5a4b9313259df75` (audit the branch head)
- **State:** READY FOR REVIEW

### Completed
- STATUS corrected (PR #10 merged; `main` at `e2e0216`); task contract written.
- `live-approval.ts` (records, private file handling, decision register, fail-closed validator, `consumeApproval`, `prepareAttempt`, `listStrandedApprovals`), `approval-cli.ts` + `scripts/c3-approve-live-run.ts` (TTY-only, exact phrase, self-declared, refuses without an approved register decision), `git-probe.ts`, `live-rehearsal.ts` + `scripts/c3-live-rehearsal.ts` (zero-network, synthetic), `inspectReservation` (read-only), EMPTY `config/live-authorization.json`.
- Docs: STATUS, SECURITY, TESTING, decision record, activation checklist (incl. the C3-LIVE-01B checklist), this handoff. All approval registers stay unapproved.
- Unchanged: `APPROVED_LIVE_QUOTA` (0), `proposeCandidate()` (disabled), `verifier/`, fixtures, patch policy and grammar, `candidate-stage.ts`, the coordinator. No Meta/Baseten/Modal call, no credential read, no genuine approval (`.proofpilot/approvals` does not exist), no model-derived CSS executed, no UI.

### Validation (local, code head)
Lint and typecheck clean; unit 283/283; security 56/56; integration 29/29; `f01:baseline` exit 0 certified; `test:e2e:f01` exit 1 (expected); real C3-B1 run PC-1 `VERIFIED` 3/3 and scoreboard re-verified; rehearsal 11 scenarios, 0 provider requests, never `VERIFIED`, production validator `LIVE_NOT_APPROVED`; piped invocation of the approval CLI exits 2. Guard-removal: 37 mutants on the validator/CLI, 34 killed (2 after adding tests for exclusive consume and re-approval of a consumed run id); 3 survivors are redundant defence in depth (provider/model re-compare after the model is already pinned, `isSymbolicLink` next to `lstat`+`isDirectory`, synthetic-record check next to the decision check). Hosted CI: see the Draft PR.

### Open questions for the reviewer
- Is the self-declared record plus empty register the right trust split, and is the consume-then-reserve order with fail-closed recovery sound?
- Is the 01B diff and authorization sequence in the task file precise enough?

### Next action
GPT-6 review; owner decides merge and whether/how to record LIVE-C3-01 (then C3-LIVE-01B as a separate PR).

## Handoff: PP-META-I2-C3-LIVE-01A-A2

- **Task / phase:** `tasks/PP-META-I2-C3-LIVE-01A.md` (remediation of audit 1 on Draft PR #11)
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 independent exact-head re-audit, then project owner
- **Branch:** `phase/pp-meta-i2-c3-live01a-approval-gate`; code head: see the Draft PR (audit the branch head; `45fce66` plus the rehearsal-layout fix)
- **State:** READY FOR RE-AUDIT

### Completed
- MAJOR-1: `live-gate.ts` is the only production API (`authorizeProductionAttempt`, `prepareProductionAttempt`, `runProductionApprovalCli`); it derives install root, register, activation pin, real Git probe, directories and quota internally and forwards only four attempt facts (no caller clock/store/context). Logic moved to `live-gate-core.ts` behind a `TrustContext` (`createInstallContext` / `createSyntheticContext`); the core, the context-taking CLI logic and the record primitives are not exported from the index; static tests restrict importers. Old injectable `authorizeLiveAttempt` / `prepareAttempt` / `allowSynthetic` are gone. The CLI now also refuses while the code quota is 0.
- MAJOR-2: `config/live-activation.json` (EMPTY) pins an activation commit and a tree digest that excludes the pin file (non-circular; sequence in the task file and checklist C0, plus the read-only `scripts/c3-activation-digest.ts`). Production and the CLI reject any HEAD whose digest differs (`REVISION_NOT_APPROVED`), a missing pin (`ACTIVATION_NOT_PINNED`) and a pin that disagrees with its commit or the register reference (`ACTIVATION_MISMATCH`); approvals bind HEAD, activation commit and digest.
- MINOR-3: `ensureApprovalsDir` requires `.proofpilot` and the repository directory to be real, self-owned and not group/other-writable (refused, never chmod-ed); approvals dir stays 0700.
- Unchanged: quota 0, `proposeCandidate()` disabled, empty register, single-use approvals and reservations, 11-scenario zero-network rehearsal, F01 oracle, staging, `VERIFIED` semantics. No genuine approval (`.proofpilot/approvals` absent), no provider/Modal call, no credential read.

### Validation (local)
Lint and typecheck clean; unit 289/289 (a first hosted CI run at `f4227b1` failed because the rehearsal's temp layout put the approvals directory directly under the shared system temp dir, which the new ancestor check correctly refused; the rehearsal now uses a private `<tmp>/.proofpilot/...` layout and a regression test runs it under a world-writable sticky TMPDIR); security 58/58; integration 29/29; `f01:baseline` exit 0 certified; `test:e2e:f01` exit 1 (expected); real C3-B1 run PC-1 `VERIFIED` 3/3 and scoreboard re-verified; rehearsal 0 provider requests; piped approval CLI exit 2. New tests use real throw-away Git repositories for the valid-revision, unauthorized-newer-commit, pin-only re-record, changed-reference, wrong-digest, missing-commit and dirty-tree cases, a simulated positive quota against the real repository, and ancestor modes 0777/0775/0757/0722, symlinked and non-directory parents. Guard removal: 30 mutants on the new boundary, 28 killed (4 initial survivors: 2 killed after adding a static clock/argument-pick check and a production-CLI-vs-synthetic-decision test); 2 remain: the ancestor owner-uid check (needs a second OS user) and `isSymbolicLink` next to `lstat`+`isDirectory` (redundant). Hosted CI: see the Draft PR.

### Open questions for the reviewer
- Is a tree digest excluding the pin file, pinned in a separate pin-only commit, an acceptable non-circular owner binding?
- Is exporting only the production gate from the index and restricting core importers by static test enough isolation?

### Next action
GPT-6 re-audit; owner decides merge and whether to record LIVE-C3-01 (then C3-LIVE-01B as a separate PR).

## Handoff: PP-META-I2-C3-LIVE-01A-A3

- **Task / phase:** `tasks/PP-META-I2-C3-LIVE-01A.md` (final remediation: residual MAJOR-2 of audit 2 on Draft PR #11)
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 independent exact-head re-audit, then project owner
- **Branch:** `phase/pp-meta-i2-c3-live01a-approval-gate`; code head `fa3260a0001f641aaab2a9438efd81b4059d8ae6` (audit the branch head)
- **State:** READY FOR RE-AUDIT

### Completed
- `GitProbe.pinOnlyDescent` (real probe in `git-probe.ts`): the pinned activation commit must be an ancestor of HEAD and every commit in `A..HEAD` must be linear (no merge) and change only `config/live-activation.json` (1 to 50 commits). `checkActivation` (the single function used by both the CLI and the validator) enforces it after the existing digest checks, failing with `REVISION_NOT_APPROVED`. The A -> A' design is unchanged; MAJOR-1 and MINOR-3 fixes untouched.
- Re-pin procedure documented (task file, SECURITY, checklist C0): another reviewed pin-only commit, or a reviewed new activation commit A2 then a pin-only commit naming it; earlier approvals stop working. Honest boundary stated: structure is enforced, authorship of the pin edit is the owner's review of that commit; a tree digest never proves an exact SHA.
- Unchanged: quota 0, `proposeCandidate()` disabled, empty register and pin, expiry/consumption/concurrency/reservation gates, rehearsal, oracle, staging, `VERIFIED` semantics. No genuine approval, provider/Modal call or credential read.

### Validation (local)
Lint and typecheck clean; unit 294/294; security 58/58; integration 29/29; `f01:baseline` exit 0 certified; `test:e2e:f01` exit 1 (expected); real C3-B1 run PC-1 `VERIFIED` 3/3, scoreboard re-verified; rehearsal 0 provider requests. Real disposable Git repositories: A then pin-only A' accepted; A' then `--allow-empty` refused (digest identical, asserted); revert/recommit refused; empty commit before the pin refused; merge refused; same-tree sibling as pinned commit refused; code/config/pin-reference changes and pin+code bundles refused; both documented re-pin paths accepted; every refusal asserted at both the validator and the CLI; chain bound and bad input fail closed. Guard removal on the revision-identity boundary: 12 of 12 mutants killed. Hosted CI: see the Draft PR.

### Open questions for the reviewer
- Is structural enforcement (pin-only linear descent from the pinned commit) plus owner review of the pin commit an acceptable statement of the boundary, given git cannot authenticate the pin commit's SHA from inside its tree?

### Next action
GPT-6 re-audit; owner decides merge and whether to record LIVE-C3-01 (then C3-LIVE-01B as a separate PR).

## Handoff: PP-META-I2-C3-LIVE-01B0-A1

- **Task / phase:** `tasks/PP-META-I2-C3-LIVE-01B0.md` (Meta proposal integration, mock-only)
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 independent exact-head review, then project owner
- **Branch:** `phase/pp-meta-i2-c3-live01b0-proposal-integration` from `main` `5e9b73c0a412c9546bfd8026f63224af75f5afc3`; code head `e5963ce88dbd8d0dbffe4086ce69a916a6160a44` (audit the branch head)
- **State:** READY FOR REVIEW

### Completed
- STATUS corrected (PR #11 merged; `main` at `5e9b73c`); SECURITY no longer mentions the removed `authorizeLiveAttempt`.
- `proposal-orchestrator.ts`: `runSyntheticProposalAttempt` = preflight -> `prepareAttemptCore` on a synthetic context -> ONE scripted response (exact contract: `muse-spark-1.3`, 3072 tokens, strict schema, <= 12,000 chars) -> `processProposalResponse` -> sanitized private artifact (`UNTRUSTED PROPOSAL — NOT VERIFIED`, allow-listed fields only) -> best-effort settle -> STOP. It refuses production contexts and non-`scriptedTransport` transports; the post-claim tail is module-private; it is not exported from the index and is imported only by the rehearsal (now refactored to use it). No production runner exists; a static test fails if `prepareProductionAttempt` is combined with a model call.
- Exact later activation diff documented in the task file; NOT applied. No decision, pin, approval, quota change, provider/Modal call or credential read.
- Unchanged: `proposeCandidate()` (still rejects before reading its argument, now also tested under hostile environment flags), quota 0, empty register and pin, the 01A gates, oracle, staging, `VERIFIED` rules.

### Validation (local)
Lint and typecheck clean; unit 304/304; security 63/63; integration 29/29; `f01:baseline` exit 0 certified; `test:e2e:f01` exit 1 (expected); real C3-B1 run PC-1 `VERIFIED` 3/3, scoreboard re-verified; rehearsal 0 provider requests; piped approval CLI exit 2. Failure matrix with scripted outcomes (incomplete, refusal, missing status, wrong model, empty, malformed, forbidden, out-of-grammar, unknown key, timeout, transport error, unexpected exception, persistence failure, settlement failure false/thrown, duplicate run, expired/missing/mismatched/consumed approval, quota exhausted/zero, pre-flight refusals, production context, look-alike transports) plus crashes at six boundaries. Adapter contract checked against a mock `fetch` (strict json_schema, low reasoning, 3072, no tools, one call even with retries configured). Guard removal: 16 of 16 orchestration mutants killed (request, approval/reservation, persistence, settlement, crash, no-retry; two initial survivors killed after adding an allow-listed-fields assertion and an in-memory artifact assertion) and 3 of 3 static no-network mutants (`fetch`, `process.env`, `createProvider`). One planned mutant that embedded a real provider URL was blocked by the tool-permission classifier and was not run; the equivalent static guard was exercised with neutral identifiers. Hosted CI: see the Draft PR.

### Open questions for the reviewer
- Is a module-private tail plus a synthetic-only public runner the right isolation until the approved activation PR adds the production runner beside it?
- Does the proposed activation diff (items 1 to 9 in the task file) cover everything the approved C3-LIVE-01B must change?

### Next action
GPT-6 review; owner decides merge and whether to record LIVE-C3-01 (then C3-LIVE-01B as a separate PR).

## Handoff: PP-META-I2-C3-LIVE-01B0-A2

- **Task / phase:** `tasks/PP-META-I2-C3-LIVE-01B0.md` (remediation of audit MAJOR-1)
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 independent exact-head re-audit, then project owner
- **Branch:** `phase/pp-meta-i2-c3-live01b0-proposal-integration` (Draft PR #12); audit the branch head
- **State:** READY FOR RE-REVIEW

### Completed
- MAJOR-1: `processProposalResponse` now builds fresh `usage` and `lifecycle` objects through `sanitizeUsage`/`sanitizeLifecycle` (explicit allow-lists; counters = non-negative safe integers <= 1e9 else null; status in the documented set else null; error/incomplete codes = short non-secret machine codes else `INVALID_CODE`; refusal/completed literal booleans, anything else fails closed). `requestId` and `respondedModel` also reject secret-shaped values. The orchestrator's artifact and outcome use only these objects. Strict completed-only acceptance, model check and grammar are unchanged.
- Tests: marker/secret-bearing nested keys on completed and failed responses (persisted file and returned artifact), malformed numbers/codes/statuses, non-object metadata, valid values intact, one request, attempt spent; static no-passthrough test. Guard removal: 13/13 targeted mutants killed.
- Unchanged: quota 0, empty register and pin, `proposeCandidate()` disabled, no provider/Modal call, no credential read, no approval, no merge.

### Next action
GPT-6 re-audit; owner decides merge.

## Handoff: PP-META-I2-C3-LIVE-01B-PREP-A1

- **Task / phase:** `tasks/PP-META-I2-C3-LIVE-01B-PREP.md` (dormant production integration)
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 independent exact-head review, then project owner
- **Branch:** `phase/pp-meta-i2-c3-live01b-prep` from `main` `939c2be4c3cd40301aa86618183312df7f645501` (audit the branch head)
- **State:** READY FOR REVIEW

### Completed
- `runProductionProposalAttempt({ runId, request })` beside the synthetic runner, sharing the module-private tail: credential-free pre-flight, `authorizeProductionAttempt`, `openMetaProposalCall` (zero-argument, retries 0, pinned model; the sole `structuredResponse` call site), `prepareProductionAttempt`, one request, strict validation, sanitized artifact in the fixed private `.proofpilot/evidence/`, settle, stop. `live-gate.ts` gained two fixed-location helpers (`productionEvidenceRoot`, `settleProductionAttempt`); the package index exports neither.
- Dormant: no importer, no index export, no CLI; real-repository behaviour is a stop at authorization before any credential is read.
- Unchanged: quota `{meta:0,baseten:0}`, empty register and pin, `proposeCandidate()`, oracle, staging, coordinator, grammar. No credential read, no provider/Modal call, no approval, no merge.
- Three existing security tests were retargeted (not weakened): importer list of `live-gate.ts`, exported-name list of the orchestrator, and "no production `structuredResponse` call" became "exactly the transport".

### Validation
See the Draft PR. Production path exercised from a throwaway install copy (fixtures only in the copy). Guard removal: 15 of 15 mutants killed (one caller-controlled-evidence-root survivor was killed after adding a runtime test and a tighter static check).

### Open questions for the reviewer
- Is opening the provider (reading the key) after read-only authorization and before consumption the right place, given a missing key then spends nothing?
- Is the throwaway-install-copy harness an acceptable substitute for dependency injection in testing the production path?

### Next action
GPT-6 review; owner decides merge and whether to record LIVE-C3-01 (then the activation PR).

## Handoff: PP-META-I2-C3-LIVE-01B-A1

- **Task / phase:** `tasks/PP-META-I2-C3-LIVE-01B.md` (owner-approved activation implementation)
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 independent exact-head review, then project owner
- **Branch:** `phase/pp-meta-i2-c3-live01b-activation` from `main` `c7e18d318c29ed60014b1f48b6375c29a5640a69` (audit the branch head)
- **State:** READY FOR REVIEW. Not merged. No provider request made, no credential read, no operator approval, activation pin NOT RECORDED.

### Completed
- Owner decision (comment 6496850990) recorded in the decision record (verbatim) and as exactly one non-synthetic register entry; `tasks/PP-META-I2-C3.md` links it. `config/live-activation.json` untouched (`activation: null`).
- `APPROVED_LIVE_QUOTA` -> `{ meta: 1, baseten: 0 }` (lifetime total). `proposeCandidate({ runId, request })` delegates only to `runProductionProposalAttempt`.
- `live-input.ts` provenance gate; `live-proposal-cli.ts` + `scripts/c3-live-proposal.ts` owner command; `git-probe.ts` allow-listed environment (hardening); readiness preflight retargeted so it never invokes the production entry point with a well-formed request.
- Tests: install-copy end to end with the shipped constants (empty pin alone stops everything; CLI end to end), provenance gate, CLI logic, static boundary; ten existing suites retargeted with stronger claims.

### Validation
See the Draft PR for exact counts, hosted CI and guard-removal results. No real network request or credential access during validation.

### Open questions for the reviewer
- Is a file-based provenance gate (re-hash + verdict re-derivation + SHA binding to a certified recording) an acceptable meaning of "independently trusted, certified F01 baseline evidence", given local disk write access defeats any file-based provenance and the operator separately approves the exact input hash?
- The Git probe's environment is now allow-listed; is anything else in the production path inheriting the credential-bearing environment?
- Is the lazy `import()` in `proposeCandidate` acceptable to keep the import graph acyclic, given the static tests that pin its exact body?

### Next action
GPT-6 review; the owner separately decides merge, then the pin-only commit and the operator steps in the task file.

## Handoff: PP-META-I2-C3-LIVE-01B-A2

- **Task / phase:** `tasks/PP-META-I2-C3-LIVE-01B.md` (remediation of audit MINOR-1; documentation only)
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 independent exact-head re-audit, then project owner
- **Branch:** `phase/pp-meta-i2-c3-live01b-activation` (Draft PR #14); audit the branch head
- **State:** READY FOR RE-REVIEW

### Completed
- MINOR-1: stale LIVE-C3-01 statuses reconciled in `docs/STATUS.md` (Open gates rows, historical-records banner, next action), `tasks/PP-META-I2-C3.md` (implementation status, state, ordering note, bounded usage, aggregate counter, schedule) and the header of `docs/META-ACTIVATION-CHECKLIST.md`. One consistent statement everywhere: LIVE-C3-01 is APPROVED for activation preparation; the activation implementation is pending review; the activation revision pin is NOT RECORDED; the real provider invocation is NOT AUTHORIZED YET; C3-B2B, UI-C3-01, HOST-C3-01 NOT APPROVED.
- No implementation code, quota, provider configuration, authorization, approval handling or activation logic changed. `config/live-activation.json` is still `activation: null`. Historical task contracts (B2A, B0, PREP) and code comments keep their as-written wording by design.

### Next action
GPT-6 re-audit; the owner separately decides merge and the later operational steps.

## Handoff: PP-META-I2-C3-LIVE-01B-CI-A1

- **Task / phase:** `tasks/PP-META-I2-C3-LIVE-01B-CI.md` (CI execution context and activation-state-aware tests)
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 independent exact-head review, then project owner
- **Branch:** `phase/pp-meta-i2-c3-live01b-ci-compat` from `main` `f8f3e182212ec3f57b6502d98aacf8dee0e7df98` (audit the branch head)
- **State:** READY FOR REVIEW. Not merged. `config/live-activation.json` is `activation: null`. No operator approval, credential read or provider request.

### Completed
- Stack CI checks out the exact PR head SHA with full history, verifies it, and runs a read-only pin-lineage check that is strict when a change touches the pin.
- Real-checkout tests assert the exact code of the checkout's pin state; an isolated activation-state matrix (incl. a depth-1 clone and a synthetic merge commit) proves each refusal code with no credential read, consumption, reservation or request; docs made pin-state-neutral.
- No production authorization, activation-digest, provider, quota, reservation or approval code changed.

### Next action
GPT-6 audit; owner decides merge (squash commit = NEW activation commit A2). Then recompute A2's digest and prepare a new pin-only Draft PR A2'. PR #15 (pin for the old A) must stay unmerged and be retired.

## Handoff: PP-META-LIVE-C3-01-CLOSURE-A1

- **Task / phase:** LIVE-C3-01 closure, hackathon documentation and submission readiness (documentation only)
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 independent review, then project owner
- **Branch:** `docs/pp-meta-live-c3-01-closure-submission` from `main` `564c56f59afc8b637dd8814078a98370e5ba2d97`
- **State:** READY FOR REVIEW. Documentation only; no `config/`, `packages/`, `scripts/`, tests, workflows, fixtures, verifier or staging change; pin, quota and approvals untouched.

### Completed
- `docs/LIVE-C3-01-EXECUTION-REPORT.md` (facts labelled verified / recomputed / operator-reported; the stored artifact read read-only; input hash and size independently recomputed; stored adjustment re-validated), `docs/META-HACKATHON-SUBMISSION.md`, draft `tasks/PP-META-I2-C3-B2B.md` (NOT APPROVED), `docs/STATUS.md`, decision record, activation checklist and README corrected.
- Consequence recorded: merging this PR makes the repository a non-pin-only descendant of A2, so it is no longer eligible for any live attempt (intended; not repaired).

### Open items for the reviewer / owner
- Operator-reported facts (HEAD, reservation settled / exhausted, no retry) rest on the operator's word; the owner may attach the private terminal transcript out of band.
- Submission portal fields, video, final links: PENDING. C3-B2B: owner decision and independent security review.

### Next action
Review and owner merge decision; then the owner chooses between C3-B2B and submitting with the honest "proposal obtained, verification next" story.

## Handoff: PP-META-LIVE-C3-01-CLOSURE-A2

- **Task / phase:** remediation of the independent audit of Draft PR #18 (MAJOR-1 specification consistency, MINOR-2 stale current-state prose); documentation only
- **From:** Implementation agent (Claude Code, Claude Sonnet 5.5)
- **To:** GPT-6 independent exact-head re-audit, then project owner
- **State:** READY FOR RE-REVIEW. No runtime code, test, CI, configuration, pin, quota, approval, credential or private evidence touched.

### Completed
- `tasks/PP-META-I2-C3-B2B.md` (still DRAFT, NOT APPROVED): two zones with a data-only bridge (a read-only, zero-network provenance zone with a reviewed-extraction requirement and an allow-listed transitive import set, versus the staging/coordinator zone that imports no inference code); an exact allow-listed schema for the nested artifact structures; two distinct trust anchors (claimed source revision of the original proposal, recomputed with explicit parameters and labelled operator-reported where it is; and the future verification revision V, with oracle/fixture immutability checks between them), no invented binding.
- README intro, decision record (historical sections labelled, verbatim owner quote untouched) and activation checklist (historical banner, operator steps labelled operator-reported) reconciled with the executed state.

### Next action
Re-audit; owner merge decision; then C3-B2B approval decision and the submission tasks.

## Handoff: PP-META-I2-C3-B2B-P1-A1

- **Task / phase:** C3-B2B slice P1 — pure provenance extraction (specification section 3 prerequisite)
- **From:** Implementation agent (Muse Code)
- **To:** GPT-6 independent exact-head review, then project owner
- **Branch:** `phase/pp-meta-c3-b2b-p1-provenance-extraction` from `main` `4e74e32eefa937b31761fd08914aad6a2be5f759` (PR #18)
- **State:** READY FOR REVIEW. No activation, quota, authorization, credential, reservation, parser or production-runner change; the stored `c3-live-meta-001` artifact was not loaded or executed; no provider call; no deployment or merge. Owner authorization covers P1/P2/E1/E2 implementation and offline synthetic testing in Draft PRs; executing the real proposal is a separate, still-pending approval.

### Completed
- `packages/provenance/src/provenance-input.ts` (new neutral Zone P module): the certified-baseline / proposal-input loaders, `trustedFactsFromBaseline`, `buildProposalRequest` and their error/limit/type dependencies, moved unchanged; `live-input.ts` is a pure re-export shim and `patch-proposal.ts` re-exports the moved symbols (owner command wiring unchanged).
- `tests/security/provenance-boundary.test.ts`: exact transitive allow-list (static + dynamic imports), zero dynamic imports, read-only fs members, no network/credential/process/write capability, shim purity, Zone E separation, and a negative control proving the check rejects the inference pipeline.
- `tests/unit/provenance-input.test.ts` (behavior through the neutral module) and `tests/unit/provenance-equivalence.test.ts` (reference identity plus identical results/refusals across a mutation battery); synthetic evidence only.
- `tasks/PP-META-I2-C3-B2B.md` section 6 now references section 3.5 (was an obsolete 3.7); `docs/STATUS.md` reflects PR #18's merge and the P1 state.

### Validation
- `pnpm lint` clean; `pnpm typecheck` clean; `pnpm test:security` 123/123 PASS (includes the 5 new boundary tests).
- `pnpm test:unit`: all P1 suites pass; the only failures are the 16 pre-existing port-bind (`EPERM`) failures in the coordinator/stage suites, reproduced identically on the untouched base in a clean worktree (sandbox blocks loopback binds; unrelated to this change).
- Targeted P1 evidence: 9 new unit tests + 5 boundary tests green; equivalence battery (9 scenarios) byte-identical.

### Continuation notes
- The existing `live01b-activation-boundary` gate assertions were redirected to the neutral module with the no-capability net widened to both files (no assertion weakened; the shim gains a purity assertion).
- STOP after P1: P2 (artifact validator, source-provenance check, registration bridge) is not started.

### Next action
GPT-6 exact-head review; owner merge decision; separate owner decision on P2 and on executing the real proposal.

## Handoff: PP-META-I2-C3-B2B-P1-A2

- **Task / phase:** C3-B2B P1 MAJOR-1 remediation — fail-closed import scanner (GPT-6 audit of PR #19)
- **From:** Implementation agent (Muse Code)
- **To:** GPT-6 independent exact-head re-audit, then project owner
- **Branch:** `phase/pp-meta-c3-b2b-p1-provenance-extraction` (same Draft PR #19, new HEAD)
- **State:** READY FOR RE-REVIEW. Test-only change plus one strictly-needed production micro-change (see below). No activation, quota, authorization, credential, reservation, parser or runner change; the stored proposal was not loaded or executed; no provider call; no merge.

### Completed
- `tests/security/provenance-boundary.test.ts` rewritten around a complete fail-closed scanner (placeholder masking of comments/strings/templates with `${}` kept as code; every remaining `import`/`export`/`require` keyword consumed or recorded; missing targets and unterminated literals are violations). Policy: exact file allow-list (unchanged, never expanded), permitted builtins, read-only fs members, zero dynamic imports, zero unsupported forms, blanket default/namespace ban, `node:fs` ban. Nine mutation tests (double-quoted, side-effect, literal/computed/template dynamic, aliased write-capable fs, default/namespace, `require()`, import attributes, type-only positive, comment/string trap) plus the preserved pipeline negative control.
- `packages/provenance/src/provenance-input.ts`: the single default import (`node:path`) converted to named imports so the blanket ban holds; behavior re-verified (all provenance/equivalence suites green, golden hash unchanged). No other production file touched.
- `tests/unit/provenance-equivalence.test.ts`: pinned golden request hash for the deterministic builder.

### Validation
- `pnpm lint` clean; `pnpm typecheck` clean; `pnpm test:security` full suite PASS (14/14 boundary tests).
- `pnpm test:unit`: all P1 suites pass including the golden test; only the pre-existing sandbox port-bind (`EPERM`) coordinator/stage failures, already proven identical on the untouched base.
- Targeted evidence: 14 boundary + 10 unit tests green (9 pre-existing P1 unit + 1 golden).

### Continuation notes
- TypeScript 7 here is the native port with no compiler JS API, so the audit's preferred AST analysis was implemented as an equivalently complete fail-closed source parser (stated in the test header); every missed form from the audit is a mutation test.
- STOP after remediation: no P2/E1/E2, no real proposal execution.

### Next action
GPT-6 focused re-audit of the new HEAD; owner merge decision.

## Handoff: PP-META-I2-C3-B2B-P1-A3

- **Task / phase:** C3-B2B P1 MAJOR-1 residual remediation — builtin re-export gap (GPT-6 re-audit of PR #19)
- **From:** Implementation agent (Muse Code)
- **To:** GPT-6 independent exact-head re-audit, then project owner
- **Branch:** `phase/pp-meta-c3-b2b-p1-provenance-extraction` (same Draft PR #19, new HEAD)
- **State:** READY FOR RE-REVIEW. Test-only change; no production file touched. No activation, quota, authorization, credential, reservation, parser or runner change; the stored proposal was not loaded or executed; no provider call; no merge.

### Completed
- `tests/security/provenance-boundary.test.ts`: Zone P forbids every `export ... from "node:*"` re-export (wildcard, namespace and named) as an explicit violation. Two negative mutation tests prove `export * from "node:fs/promises"` and `export * as fs from "node:fs/promises"` fail (plus a named re-export case), and a positive control proves a named read-only `import` stays permitted. Allow-lists unchanged; all existing tests preserved.

### Validation
- Targeted boundary suite 16/16 PASS; full gates below before push.

### Next action
GPT-6 focused re-audit of the new HEAD; owner merge decision.

## Handoff: PP-META-I2-C3-B2B-P2-A1

- **Task / phase:** C3-B2B slice P2 — artifact validation + source provenance (specification sections 3.1–3.4)
- **From:** Implementation agent (Muse Code)
- **To:** GPT-6 independent exact-head review, then project owner
- **Branch:** `phase/pp-meta-c3-b2b-p2-validation` from `main` `31fd73141a8e0bbdf4cd61bf228308bd59855d67` (PR #19 squash merge)
- **State:** READY FOR REVIEW. No activation, quota, authorization, credential, reservation, parser, runner, registration, staging or browser change; the stored `c3-live-meta-001` artifact was not loaded or executed; no provider call; no merge. Owner authorization covers P2 implementation and offline synthetic testing only.

### Completed
- `packages/provenance/src/proposal-artifact.ts` (new): read-only loader (run-id grammar, fixed evidence path, symlink/regular/permission/ownership/size refusals) + fail-closed structural pre-scan (depth 3, duplicate and pollution keys) + exact 21-key schema validation with typed codes + canonical rebuild through the host grammar with byte-identical `renderedCss`; frozen output.
- `packages/provenance/src/source-provenance.ts` (new): explicit source-revision parameters, certified-evidence recomputation (conflated revisions refused), local commit/ancestry/tree-blob checks via an injected narrow `SourceGit` interface, per-field provenance classes.
- `tests/security/provenance-boundary.test.ts`: Zone P entries unioned (two new modules + the core parser leaf; `lstat` added to the read-only member list, reviewed); shim/negative-control/Zone E assertions preserved.
- `tests/unit/proposal-artifact.test.ts` (6), `tests/unit/source-provenance.test.ts` (5) and `tests/support/proposal-artifact-fixture.ts` (synthetic shape mirroring the real sanitized artifact); `docs/STATUS.md` updated.
- Prerequisite confirmed: PR #19 squash-merged, P2 branch starts clean at `31fd731`.

### Validation
- `pnpm lint` clean; `pnpm typecheck` clean; `pnpm test:security` 134/134 PASS (16/16 boundary).
- `pnpm test:unit` 336/352 PASS (11 new P2 tests); only the 16 pre-existing sandbox port-bind (`EPERM`) coordinator/stage failures, already proven identical on the untouched base.
- No E1/E2: no registration, staging, browser or scoreboard work; ownership refusal lacks a negative mutation (needs privileges).

### Next action
GPT-6 exact-head review; owner merge decision; E1/E2 stay unstarted.

## Handoff: PP-META-I2-C3-B2B-P2-A2

- **Task / phase:** C3-B2B P2 MAJOR-1/MAJOR-2 remediation (GPT-6 audit of PR #20)
- **From:** Implementation agent (Muse Code)
- **To:** GPT-6 independent exact-head re-audit, then project owner
- **Branch:** `phase/pp-meta-c3-b2b-p2-validation` (same Draft PR #20, new HEAD)
- **State:** READY FOR RE-REVIEW. No activation, quota, authorization, credential, reservation, parser, runner, registration, staging or browser change; the stored `c3-live-meta-001` artifact was not loaded or executed; no provider call; no merge.

### Completed
- MAJOR-1: `verifySourceProvenance` binds the actual Git fixture-tree ids at both revisions to the baseline claim (`SOURCE_FIXTURE_TREE`); verifier/policy stay equality anchors. Negatives cover agree-with-each-other-but-differ, one-side drift and unresolvable trees.
- MAJOR-2: ancestor-component symlink refusal plus an `O_RDONLY|O_NOFOLLOW|O_NONBLOCK` descriptor read with pre/post `fstat` identity binding (`ARTIFACT_UNSTABLE`). Flags come from a reviewed constants-only `node:fs` carve-out (no write capability; call-site asserted); `open` added to the read-only member list, reviewed. Strict `createdAt` UTC round-trip.
- Tests prove the three new guards fail on the pre-fix code (stash check); FIFO, oversize, tamper and timestamp batteries added. STATUS branch/authorization prose corrected (`main@31fd731`, P2 authorized).

### Validation
- Targeted suites green; full gates below before push.

### Next action
GPT-6 focused re-audit of the new HEAD; owner merge decision.

## Handoff: PP-META-I2-C3-B2B-P2-A3

- **Task / phase:** C3-B2B P2 MAJOR-2 residual remediation — ancestor-swap window + bounded reads (GPT-6 re-audit of PR #20)
- **From:** Implementation agent (Muse Code)
- **To:** GPT-6 independent exact-head re-audit, then project owner
- **Branch:** `phase/pp-meta-c3-b2b-p2-validation` (same Draft PR #20, new HEAD)
- **State:** READY FOR RE-REVIEW. No activation, quota, authorization, credential, reservation, parser, runner, registration, staging or browser change; the stored `c3-live-meta-001` artifact was not loaded or executed; no provider call; no merge.

### Completed
- Bounded descriptor reads (`readBoundedBytes`, 8193-byte cap; deterministic unit test), post-read ancestor revalidation and realpath binding; `realpath` added to the read-only member list with a call-site assertion.
- Alternate-tree persistent-symlink refusal test (auditor's repro as a static case); FIFO/size/timestamp suites preserved.
- New layers verified absent pre-fix (import/policy failures on stashed pre-fix code); persistent-symlink suite guards both pre-open and post-read layers.
- Precise residual documented: transient install-revert ancestor swaps are undetectable via portable Node APIs (no `openat`); owner risk decision requested before any execution work.

### Validation
- Targeted suites green; full gates below before push.

### Next action
GPT-6 focused re-audit of the new HEAD; owner risk decision on the residual; owner merge decision.

## Handoff: PP-META-I2-C3-B2B-E1-A1

- **Task / phase:** C3-B2B slice E1 — data-only registration bridge, trusted revalidation, identity isolation, scoreboard integration (spec section 4, Zone E items)
- **From:** Implementation agent (Muse Code)
- **To:** GPT-6 independent exact-head audit, then project owner
- **Branch:** `phase/pp-meta-c3-b2b-e1-registration` from `main` `2967158b4fc2622948cb4a62f8c5a9b276939d52` (PR #20 squash merge)
- **State:** READY FOR REVIEW. No activation, quota, authorization, credential, reservation, parser, runner, staging or browser change; the stored `c3-live-meta-001` artifact was not loaded or executed; no provider call; no merge. Owner authorization covers E1 implementation and offline synthetic testing only. Executing the proposal (E2) stays NOT APPROVED; the P2 transient ancestor-swap residual stays unaccepted and must not be read as accepted by any E1 merge.

### Completed
- `packages/core/src/model-proposal.ts` (new): data-only registration (`registerModelProposal`, `assertRegisteredModelProposal`, `modelProposalIdOf`, `modelProposalEntryOf`); exact plain-triple shape checks, core-grammar revalidation, byte-identical fresh-render requirement, typed fail-closed codes, frozen identity-keyed registry.
- `packages/core/src/candidate-coordinator.ts`: optional `provenanceTag` in `candidateIdOf` (two-arg ids unchanged); `ModelProposalEntry`, `MODEL_BOARD_LABEL`, `modelRowProblems`; `Scoreboard.modelProposals?`; `verifyScoreboard` verifies model rows separately (re-derived CSS/id/hashes, literal classes, zero replays) and keeps pre-E1 boards verifying exactly as before. `runOfflineVerification` / `assertHandAuthoredControls` untouched.
- `tests/unit/model-proposal-registration.test.ts` (7 tests, synthetic only); boundary tests extended (Zone E file list + bridge direct-edge minimality + closure free of inference/provenance).
- `docs/STATUS.md` updated (E1 phase/branch/task, P2 merged, residual explicitly unaccepted for execution).

### Validation
- Targeted suites green; full gates below before push.

### Next action
GPT-6 exact-head audit; owner merge decision; E2 stays unstarted.

## Handoff: PP-META-I2-C3-B2B-E1-A2

- **Task / phase:** C3-B2B E1 MAJOR-1 remediation (GPT-6 audit of PR #21: model-row additive verdict fields)
- **From:** Implementation agent (Muse Code)
- **To:** GPT-6 independent exact-head re-audit, then project owner
- **Branch:** `phase/pp-meta-c3-b2b-e1-registration` (same Draft PR #21, new HEAD)
- **State:** READY FOR RE-REVIEW. No activation, quota, authorization, credential, reservation, parser, runner, staging or browser change; the stored `c3-live-meta-001` artifact was not loaded or executed; no provider call; no merge. E2 and execution stay NOT APPROVED.

### Completed
- `modelRowProblems` enforces the exact E1 `ModelProposalEntry` key set (unknown keys refused, required keys required); description/note must be the canonical producer texts and carry no verdict language (`MODEL_ROW_NOTE` + `modelRowDescriptionOf` exported from the coordinator and consumed by `modelProposalEntryOf`: single source of truth, pinned by tests).
- `tests/unit/model-proposal-registration.test.ts`: auditor's exact repro, multi-key/innocuous-key injections, removed-key cases, free-text laundering cases, canonical-text pinning, integrated `verifyScoreboard` rejection of injected verdict fields; legacy boards unchanged.
- `docs/STATUS.md`: E1 authorization aligned (E1 implementation approved/on PR #21; E2 + execution NOT APPROVED); hash wording precise (shape-checked Zone P data until E2).

### Validation
- Targeted suites green; full gates below before push.

### Next action
GPT-6 focused re-audit of the new HEAD; owner merge decision; E2 stays unstarted.

## Handoff: PP-META-I2-C3-B2B-E2-A1

- **Task / phase:** C3-B2B slice E2 — offline model-proposal verification pipeline
- **From:** Implementation agent (Muse Code)
- **To:** GPT-6 independent exact-head audit, then project owner
- **Branch:** `phase/pp-meta-c3-b2b-e2-verification` from `main` `9499a42c97c4fa311e1001489b5bc0440a549d21` (PR #21 squash merge, audit PASS)
- **State:** READY FOR REVIEW. No activation, quota, authorization, credential, reservation, parser, oracle, patch-policy, pin or hand-authored-control change; the stored `c3-live-meta-001` artifact was not read, loaded, staged or executed; no provider call; no merge. Owner authorization covers E2 implementation, synthetic fixtures, offline tests and a Draft PR only. Real execution stays NOT APPROVED; the P2 transient ancestor-swap residual stays unaccepted.

### Completed
- `packages/core/src/model-verification.ts` (new, Zone E): `verifyRegisteredProposal` — identity-checked registration only; exact-V binding, commit/ancestry/conflation gates, fixture/verifier/policy anchor equality; baseline gate + up to three fresh stages via the existing runner; verdict solely from `decideVerification`; namespaced `MODEL-<runId>/` evidence; `verification.json` persisted.
- `packages/core/src/candidate-coordinator.ts`: `ModelVerificationEntry` (schemaVersion 2, kind-discriminated), `MODEL_VERIFICATION_LABEL`, `modelVerificationProblems` (identity/CSS/hashes/anchors recomputed, verdict recomputed from persisted bytes, zero replays never VERIFIED); `Scoreboard.modelVerifications?`; `verifyScoreboard` separates the sections (shared E1/E2 run id legitimate across sections, collisions with hand-authored rows refused); shared `loadReplayEvidence` hoist (hand-authored path behavior unchanged). E1 row validation untouched.
- `scripts/c3-b2b-verify-proposal.ts` (new): five explicit params, no env reads, no execution/provider/path options, real artifact hard-refused before any read (exit 2).
- `tests/unit/model-verification.test.ts` (8 tests, synthetic only); boundary tests extended (Zone E list, E2 direct edges, command narrowness/hard-disable).
- `docs/STATUS.md` updated (E2 phase/task/branch, E1 merged, authorization, three-claim separation).

### Validation
- Targeted suites green; full gates below before push.

### Next action
GPT-6 exact-head audit; owner merge decision. Real execution needs a separate owner approval + the P2 residual risk decision + a new security review.

<!-- HANDOFF_ENTRIES_END -->
