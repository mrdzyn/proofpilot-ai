# Project Status

> Operational state only. Historical detail lives in reviewed PRs and handoffs.

## Project

- **Name:** ProofPilot AI — Meta Global AI Developer Hackathon (Push the Frontier)
- **Current phase:** PP-META-I1-C2A — genuine F01 video + video intake/consent + mocked Muse Spark video integration
- **Status:** ACTIVE — C2A task contract created; implementation/evidence NOT YET DONE
- **Primary branch:** `main`, C1 squash-merge `c55795eab20466d917847c964ace377b57d4edc6` (PR #1 merged)
- **Working branch:** `phase/pp-meta-i1-c2a` (based directly on merged C1)
- **Active task:** `tasks/PP-META-I1-C2A.md`
- **Active handoff:** None — implementation assignment active; append a new handoff only at completion/review
- **Owner authority:** C2 start authorized 2026-10-27. **No authorization for billable inference, external video transmission, merge, deploy or AI-generated patch execution.**

## C1 — complete

- F01 synthetic broken sample store; 390×844 genuine coordinate click lands on `promo-overlay`, cart-count remains 0; desktop 1280×800 PASS.
- Trusted Playwright oracle, expected-failure baseline classifier, exact-SHA fail-closed evidence certification, fixture patch-scope deny policy, credential-scrubbing, observed-only metrics.
- Meta/Baseten typed provider adapters, model listing; actual model inference not yet tested.
- Independent GPT-6 re-audit: **PASS** at PR #1 head `5bd12de1d2240a958bfd85538003d77e8b1c6be5`.
- GitHub CI run `40463546814`: Project baseline and Stack validation PASS (unit 32/32, security 13/13, F01 reproduced). Local integration 3/3 reported by implementation agent; not separately run in CI.
- `main` has active Protect Main ruleset with both required checks; PR #1 owner-authorized and squash-merged.

## C2A — active contract, not yet implemented

Source: `tasks/PP-META-I1-C2A.md`.

1. Record a **real playable F01 mobile defect video** at 390×844, optionally desktop control, keep evidence/hashes gitignored.
2. Product intake validates true media format, at most **25 MB / 30 seconds**, requires explicit per-run consent to Meta processing; reject before any network call if invalid.
3. Meta Muse Spark 1.3 **native video**: supported path is Files API (`purpose=user_data`, MP4 upload, expiring file), then Responses API (`input_file.file_id`), local schema-validated `Symptom`, best-effort file deletion. **Mock tests only in C2A.**
4. Prepare design-first screen-flow/mockup proposal; **no product UI shell before owner visual approval**.
5. Preserve all C1 oracle, security, CI and evidence boundaries. Record truthful progress and independent review at the next C2A Draft PR.

## External capability facts

- Official Meta docs (verified 2026-10-27): https://dev.meta.ai/docs/video-understanding ; https://dev.meta.ai/docs/file-handling ; https://dev.meta.ai/docs/structured-output
- Meta supports MP4 video via `POST /v1/files` → `POST /v1/responses`. Playwright WebM requires verified conversion to MP4 before Meta upload.
- Meta uploaded files **do not expire automatically**; prefer explicit `expires_after` and deletion after analysis.
- Muse Spark 1.3's audio understanding can be degraded; F01 demo is visually interpretable, with no voice requirement.
- Meta model discovery (authenticated `GET /models`): prior PASS for `muse-spark-1.3`, `muse-wonder-1.0`. Genuine generation NOT TESTED.
- Baseten key not configured and no inference tested.

## Gates / blockers

| Gate | State |
|---|---|
| C1 exact-head audit | PASS |
| C1 required CI, ruleset, merge | PASS |
| C2A real recording | NOT RUN |
| C2A intake/media/consent and mocks | NOT IMPLEMENTED |
| C2A product UI design | NOT APPROVED; design brief pending |
| Real Muse Spark inference/video transmission | NOT AUTHORIZED; separate owner approval required |
| Docker/ARM64 isolation | NOT VERIFIED on host; blocks all AI-generated patch execution |
| Main branch changes / release | Not authorized |

## Next action

Implementation agent: read `AGENTS.md`, this STATUS, project profile, `tasks/PP-META-I1-C2A.md`, then only relevant C1 code/tests; work on this branch, produce real evidence plus mocked C2A contract tests; stop for independent audit, do not claim actual Meta model use.
