# PP-META-I1-C2B — Authorized-live-smoke readiness for Muse Spark video analysis

- **State:** ACTIVE — owner authorized phase start on 2026-10-27; **real Meta upload/generation NOT YET AUTHORIZED**
- **Parent:** C2A merged to protected `main` at `8551b0c03600d7be888a3b349b7da963eab97b3a` (PR #2, exact-head independent audit PASS)
- **Working branch:** `phase/pp-meta-i1-c2b`
- **Implementation agent:** Claude Code; independent reviewer GPT-6
- **User-facing UI:** none in this increment. Design gate remains pending; no unapproved application shell.
- **Goal:** make C2A's mock-tested Meta video path safe to exercise once with a genuine, certified synthetic F01 recording, then preserve actual, sanitized vendor-result evidence.

## Official current Meta contract (rechecked 2026-10-27)

- Native Muse Spark video: https://dev.meta.ai/docs/video-understanding — `POST /v1/files` with `purpose=user_data`, then `POST /v1/responses` with `input_file.file_id`.
- Uploaded file expiration: https://dev.meta.ai/docs/file-handling — `expires_after[anchor]=created_at`, `expires_after[seconds]=3600`; default is **no expiration**; delete via `DELETE /v1/files/{file_id}`.
- Structured Responses: https://dev.meta.ai/docs/structured-output — use `text.format`, not Chat Completions `response_format`.
- Response lifecycle: https://dev.meta.ai/docs/api-reference/responses/schemas — `status` can be `completed`, `failed`, `in_progress`, `cancelled`, `queued`, or `incomplete`. Incomplete/failed/nonterminal outcomes MUST NOT be reported as successful `VIDEO_ANALYZED` even if an `output_text` string exists. Handle schema-optional/null lifecycle fields consistently with documented responses, fail closed for explicit non-completed status, and preserve an honest diagnostic.
- Use `muse-spark-1.3` (standard model) exactly, unless a new owner-approved model change is recorded. No substitution or silent fallback.
- Prices/credits are account-dependent; current published token rates should be checked at execution time (https://dev.meta.ai/docs/pricing-rate-limits). A "single request" or token limit is **not** a guaranteed currency hard cap.

## Workstream A — zero-network readiness (AUTHORIZED NOW)

1. Start on this branch from the verified C2A merge. Read `AGENTS.md`, `docs/STATUS.md`, `config/project-profile.json`, this task and the active handoff. Read only relevant inference/intake/core code and tests.
2. Verify local owned reference recording at `.proofpilot/recordings/f01-20261027T122211Z-df375a/mobile-defect/f01-mobile-defect.mp4` *exists* and matches SHA-256 `e9df68b14c48300818f9ec9407b884413037f29305f17a5da3cc4fac05eeafdf`. Confirm `recording.json` source `certifiedExactSha:true`, 390×844, no customer data, 10.04s, and validate with the real media intake/ffprobe/full decode. If unavailable/mismatched, STOP; do not recreate facts. Source recording was certified at `01da814da136f9ea982624414ec5baf9569f24eb` prior to C2A squash merge; use original fixture tree identity, do not falsely relabel source HEAD as new `main`.
3. Verify owner account credentials and model discovery safely: **do not read/print/export the secret**. A safe local report may show only key PRESENT/ABSENT and model available yes/no. Nonbillable GET /models only if already authorized by repo/owner and known to be nonbillable.
4. Run existing `pnpm analyze:video` DRY RUN against that specific clip (unique run ID; no `--live`, no per-run consent flag required for dry-run). Confirm zero network calls and exact SHA, duration, codec, and intended Meta payload.
5. Review and fix only genuine readiness defects: explicit Responses lifecycle failure when `status` indicates non-completion even with content; no accidental double-billing on retries or duplicate IDs; valid file-id/error handling and remote deletion; sanitized result model/request IDs/usage and cost data. Add targeted mocked negative tests and document limitations; do not change the trusted oracle, source fixture, or already-approved C2A design boundaries.
6. Define an auditable single-use live gate (separate explicit owner approval required): one synthetic owned MP4; one Files upload; one `muse-spark-1.3` Responses generation attempt; one DELETE; `expires_after` 3600 seconds; no automatic retries; max 1500 output tokens; no web/search/tools; never send a secret in a model prompt or exported evidence. Protect against a second launch of an already-spent run ID. If a test call fails, do not automatically retry—report and request new approval.
7. Store evidence only under gitignored `.proofpilot/`; preserve SHA-256 and original certified source provenance, request IDs, provider's reported model/usage, latency, final `VIDEO_ANALYZED` or `ANALYSIS_FAILED`, redacted errors, remote deletion outcome. **Never** falsely label mocked/simulated evidence as live; if no live call occurred, T04 remains NOT TESTED. Account/credit spend should be recorded from authoritative usage; do not invent costs.
8. Resolve any mismatch of the Meta API contract in mock tests before proposing live execution. No real POST/DELETE in Workstream A.

## Workstream B — first genuine provider test (NOT AUTHORIZED YET)

Only after the owner explicitly authorizes **both** external transmission of the owned synthetic mobile recording and a possible billable Muse Spark request:
- Verify credit availability/limits where possible and communicate lack of a guaranteed monetary hard cap if no enforceable spend limit exists.
- The owner executes the one unique-ID CLI request in their trusted local environment with opt-ins only for that invocation (not committed or left persistently enabled). Do not print env/key or use a local tool unable to access the real fixture.
- Capture the actual response and provider lifecycle status; parse locally and label `model-hypothesis` not a trusted fix or verified result.
- Attempt deletion in `finally`, and report honest status including file ID where a manual cleanup is required.
- Stop after that one call (successful OR failed); do not start new generation, patch execution, C3 or deployment.
- Require separate exact-head code review for any fix discovered during this test.

## Required acceptance

| Gate | Evidence |
|---|---|
| C2B-01 source authenticity | SHA-256 and `recording.json` verify existing certified recording, or BLOCKED |
| C2B-02 safety | dry run 0 calls; consent & opt-ins default deny |
| C2B-03 lifecycle | completed response can validate; explicit incomplete/failed status always `ANALYSIS_FAILED` + DELETE; mocked tests |
| C2B-04 duplicate protection | same run ID/collision and concurrency never issue second upload/generation |
| C2B-05 data privacy | no media, `.env`, provider key or raw responses in Git; redacted evidence and expiry/delete outcome |
| T04 non-mocked live | **NOT TESTED pending owner authorization**; when run, include real provider request ID, model, usage, and clip provenance |
| C1 regression | `pnpm f01:baseline` mobile reproduced, desktop PASS and certified evidence on clean tree |
| CI | required `Project baseline / Common validation` and `Stack validation` on a pushed Draft PR; integration/media tests local, honestly labeled |

## Forbidden

- No unapproved live upload/generation, no billable call, no publish/deploy/merge, no AI-generated patch execution, no expansion into C3, no changes to `verifier/`, `fixtures/sample-store/` or security rules to make tests pass.
- Do not invent a successful provider response. Explicit approval of C2B work is **not** consent to transmit video, enable billable flags, or spend credits.
- Docker/ARM64 candidate execution remains NOT VERIFIED. No model-written patch may run until independently verified.

## Delivery and stop

After Workstream A, run targeted tests and C1 regression; commit bounded changes locally to `phase/pp-meta-i1-c2b`, append a handoff and update STATUS. Stop before push/PR unless the owner explicitly authorizes publication. Report complete runnable local command and ready/not-ready gates, but leave actual `--live` execution disabled. Request owner approval separately for Workstream B.
