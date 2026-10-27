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

<!-- HANDOFF_ENTRIES_END -->
