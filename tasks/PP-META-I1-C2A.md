# PP-META-I1-C2A — Day 2: real F01 video, bounded intake and Muse Spark video contract

- **Status:** IMPLEMENTED LOCALLY — awaiting independent audit; implementation authorized by owner on 2026-10-27; no merge/release authorized (see `docs/STATUS.md` and handoff `PP-META-I1-C2A-C1`)
- **Base:** `main` at `c55795eab20466d917847c964ace377b57d4edc6` (C1 squash-merge, independently audited)
- **Working branch:** `phase/pp-meta-i1-c2a`
- **Owner/orchestrator:** Project owner; implementation agent Claude Code; independent reviewer GPT-6
- **Source of truth:** ProofPilot AI Hackathon Blueprint v1.1 (product, D2 milestone, acceptance tests T01–T06, I1 implementation handoff); C1 source and repository policy
- **Product story:** independent AI quality assurance for solo founders/small businesses; avoid fictitious revenue/impact claims

## Objective

Produce a **genuine, playable F01 mobile-cart failure video**, a strict server-side video/consent and symptom contract, and a **mock-tested native Muse Spark 1.3 Files + Responses API integration** ready for a separately owner-authorized low-cost live smoke. C2A does not certify a fix or implement model-generated patching. Record only observable evidence.

## Verified provider guidance (checked 2026-10-27)

- Meta documentation: https://dev.meta.ai/docs/video-understanding ; https://dev.meta.ai/docs/file-handling ; https://dev.meta.ai/docs/structured-output
- Meta `muse-spark-1.3` accepts **native video** in the Responses API. Upload supported `video/mp4` via `POST https://api.meta.ai/v1/files`, multipart field `file` and `purpose=user_data`; reference the returned `file_id` using an `input_file` content block (or `input_video` with `file_id`) in `POST /responses` alongside `input_text`. Use Responses `text.format` for a supported JSON schema (not Chat Completions' `response_format`).
- The **product** caps media at 25 MB, 30 seconds (stricter than Meta's API limits); supported ingest types MP4/WebM if WebM is converted locally. Meta Files supports MP4; **do not upload raw WebM as if supported by Meta**.
- Uploaded Files API objects do **not expire by default**. Use supported `expires_after` (e.g. 3600 seconds) and attempt `DELETE /v1/files/{id}` in `finally`; document cleanup failures without exposing keys or video. Avoid public video URLs.
- Muse Spark 1.3 embedded audio understanding may be degraded. Our F01 clip must be visually self-contained with no reliance on speech.

## Bounded implementation scope

### A. Real F01 video recording
- Preserve the pre-registered C1 oracle and F01 defective behavior unchanged.
- Produce an **actual browser recording** at 390×844 showing at least a few seconds of context, genuine Add-to-Cart pointer interaction, and the still-zero cart counter. Playwright generally records WebM; use verified local FFmpeg to transcode to a playable MP4 if available, with no synthetic/AI-generated replacement imagery.
- Capture a separate optional desktop control clip at 1280×800; do not mix desktop success into the uploaded mobile failure recording unless explicitly annotated.
- Keep MP4/WebM, trace, screenshots, video hashes and recording metadata under gitignored `.proofpilot/`. Record SHA-256, source HEAD, fixture tree, viewport, browser build, actual duration and bytes. On a missing FFmpeg/codec or unsupported recording, report BLOCKED; never invent an artifact.

### B. Video intake and consent boundary (backend/library/CLI only)
- Validate **actual MIME/container signature**, MP4 codec and duration from a trusted probe, `<=25,000,000` bytes, `<=30` seconds. Reject missing/invalid video, unsupported types, oversized clips, over-duration, and ambiguous metadata with typed failures before any network/model call.
- Require explicit, per-run opt-in that video will be transmitted to Meta for AI analysis; without consent, no file upload or generation can run.
- Only user-owned/synthetic recordings; no real customer/payment data. Store local media behind gitignore and never print contents/credentials. Reject unsafe paths and traversal; do not accept arbitrary filesystem paths from unauthenticated requests.
- Define a schema-checked `Symptom` describing **observations**, expected/actual behavior, timestamped evidence, tentative reproduction instructions, uncertainty and any unsupported claims. The model's words are untrusted **hypotheses**, never oracle evidence or VERIFIED status.
- Prefer pure backend modules and a local CLI/harness in C2A. UI requires approved screen map/mockups first (design gate); produce a separate design brief only, no Next.js UI shell.

### C. Meta integration — mocked first
- Extend `packages/inference` using existing provider allowlist, no-redirect, timeout, typed errors, redaction, and **billable-off default**. Implement/contract-test multipart Files upload `user_data`, expiration, `/responses` native video `input_file` and response text, and best-effort file delete. Tests must assert no upload before consent or media validation.
- If implementing JSON-schema-constrained model response, use Responses `text.format` with Meta-supported schema and still validate returned data locally. Malformed/partial/non-array response payloads should map to typed `INVALID_RESPONSE` / `ANALYSIS_FAILED`, not crash or certify.
- No unmocked model generation or file-upload traffic in C2A: API billing and external media transmission need separate explicit owner approval. Only existing nonbillable discovery may be reused.
- No Baseten scope unless explicitly revisited.

## Objective-based acceptance / evidence

- **T01 / valid**: verified genuine MP4 (or WebM locally converted to MP4), 30 seconds or less, 25 MB or less; SHA-256 and source metadata recorded; consent bound to run; no raw clip committed.
- **T02 / invalid**: unsupported format, >25MB, >30sec, corrupt/truncated content, missing metadata rejected without provider calls.
- **T03 / consent**: no opt-in prevents file transmission and model invocation, independently tested with a mocked transport.
- **T04 / actual model use**: **NOT TESTED until owner approves**. Separately capture one *real*, non-mocked Muse Spark 1.3 F01 response with model ID/usage/latency and redacted request metadata after approval. Do not claim it now.
- **T05 / schema**: wrong shape/empty/partial model output produces `ANALYSIS_FAILED` or typed failure; no promotion of untrusted text to trusted test state.
- **T06 / uncertainty**: insufficient-context F03-like mock returns uncertain/insufficient observations; never fabricated proof of resolution.
- Preserve C1 regression: `pnpm f01:baseline` expected mobile failure, desktop PASS, exact-SHA certification when clean, plus unit/security/integration tests as applicable.
- Add only targeted tests and document executed evidence/exit codes, and hosted required `Project baseline / Common validation` and `Stack validation` if branch pushed for PR review. Add security-relevant tests into required CI when new runtime code touches credentials/media and feasible.
- Video upload lifecycle tests must validate expiration/deletion requests, API failures, and cleanup notes.

## Constraints and stop conditions

- Do not modify `verifier/` trusted oracle, intentionally defective `fixtures/sample-store/src/`, existing patch policy, or C1 security gates to make a demo pass.
- Do not execute AI-generated patches, access production resources, merge, deploy, publish demo videos or modify `main`.
- No real billable inference; no external transmission of a clip, even synthetic, without fresh owner authorization.
- No user-facing UI implementation without human approval of screen map/mockups; design docs may be drafted.
- Docker on host remains NOT VERIFIED; **no candidate patch execution until an isolated sandbox is independently proven**.
- Stop and report missing FFmpeg/Playwright browser, unclear Meta API payload support, missing keys, suspicious content, or policy conflicts. Do not fake outcomes.

## Handoff

Once C2A implementation/evidence and targeted tests are complete, commit to the working branch, update `docs/STATUS.md`, append one concise handoff to `docs/HANDOFFS.md`, and request a Draft PR and exact-head independent audit. No merge without owner approval. Clearly distinguish `REAL VIDEO RECORDED`, `META API MOCK TESTED`, and `REAL META MODEL NOT TESTED`.
