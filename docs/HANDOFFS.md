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

<!-- HANDOFF_ENTRIES_END -->
