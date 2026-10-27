# Project Status

> Operational state only. Historical detail lives in reviewed PRs and handoffs.

## Project

- **Name:** ProofPilot AI — Meta Global AI Developer Hackathon (Push the Frontier)
- **Current phase:** PP-META-I1-C2B — real Muse Spark video-analysis readiness
- **Status:** ACTIVE — zero-network C2B task prepared; implementation not started yet; genuine provider test requires separate explicit owner authorization
- **Primary branch:** protected `main` at `8551b0c03600d7be888a3b349b7da963eab97b3a` (C2A squash merge; PR #2)
- **Working branch:** `phase/pp-meta-i1-c2b` (created from that merged `main`)
- **Active task:** `tasks/PP-META-I1-C2B.md`
- **Active handoff:** None for C2B yet; previous completed C2A handoff `PP-META-I1-C2A-R1`
- **Authorization:** Owner approved start of C2B preparation 2026-10-27. **Not authorized:** real Meta video upload, billable inference, merge, deployment, product UI shell, or AI-generated patch execution.

## Completed milestones

### C1 — merged PR #1

- F01 synthetic defect reproducibly fails real mobile Add-to-cart at 390×844 (promo overlay intercepts; cart remains 0), desktop control passes.
- Trusted Playwright baseline oracle, exact-SHA fail-closed certification, provider configuration with key-scrubbing, and deterministic verdict classification.
- Exact-head independent audit PASS; both required GitHub CI checks PASS; `main` protected.

### C2A — merged PR #2

- **Independent GPT-6 re-audit PASS** at `9eaf1ee11a4db6ddd62f024d32b6302b2879de73`; earlier MAJOR-1 (duplicate run ID could bill twice) and MINOR-2 (premature recording certification) remediated and reviewed.
- Required CI run `40503306350`: Common validation PASS; Stack validation PASS (97/97 unit, 27/27 security, baseline `REPRODUCED`, desktop PASS, exact-SHA certification YES).
- Genuine Chromium mobile/desktop MP4 recording and declared SHA-256s, media validator (signature/codec/duration/full decode), WebM conversion, run+video-hash-bound consent, strict untrusted `Symptom` parser, mock-tested Meta Files upload → Responses `input_file` → DELETE flow, dry-run CLI.
- Real-media/browser integration 11/11 PASS was reported by local implementation agent, **not independently rerun** by GPT-6; local MP4 evidence is gitignored and not accessible to GitHub audit.
- Certified replacement recordings in local `.proofpilot/recordings/f01-20261027T122211Z-df375a/`, source before the squash merge `01da814da136f9ea982624414ec5baf9569f24eb`:
  - Mobile `mobile-defect/f01-mobile-defect.mp4`: SHA-256 `e9df68b14c48300818f9ec9407b884413037f29305f17a5da3cc4fac05eeafdf` (390×844, approx 10.04s).
  - Desktop `desktop-control/f01-desktop-control.mp4`: SHA-256 `e565e8bfe922dd5eb44def64c5f076ab963d9e9156f619196e4f3cce8b71976d` (1280×800, approx 7.32s).
- Model responses are always labeled hypothesis; never a trusted browser verdict. Tap indicator injected by recorder is disclosed; raw recordings are not committed.

## C2B — active next task

**Contract:** `tasks/PP-META-I1-C2B.md`. Two distinct workstreams:

1. **Workstream A (authorized):** local clip authenticity/ffmpeg/ffprobe and dry-run checks; validate account availability without exposing key; harden Responses explicit non-completed statuses; mock negative tests; define one-call approval gate; local proof only.
2. **Workstream B (NOT authorized):** one genuine external upload of the certified synthetic mobile MP4 to Meta, one `muse-spark-1.3` Responses request, delete the uploaded file, record real model/usage/request ID/latency and local `Symptom` validation. Requires **fresh owner consent to transmission and possible model charges**. Must not silently proceed from phase-start approval.

Official Meta documentation verified 2026-10-27:
- https://dev.meta.ai/docs/video-understanding
- https://dev.meta.ai/docs/file-handling
- https://dev.meta.ai/docs/structured-output
- https://dev.meta.ai/docs/api-reference/responses/schemas
- https://dev.meta.ai/docs/pricing-rate-limits

## Open gates

| Gate | Status |
|---|---|
| C2B zero-network preflight and extra status guards | NOT STARTED |
| C2B real live model test (T04) | NOT AUTHORIZED / NOT TESTED |
| Product five-screen design `design/screens/PP-PRODUCT-SCREEN-MAP.md` | PROPOSED; awaiting owner's higher-fidelity visual approval |
| Isolated Docker/ARM64 patch runner | NOT VERIFIED; no generated patch execution allowed |
| C3 patch proposal, C4 trusted candidate verification, evidence export, demo/submission | NOT STARTED |
| Baseten | NOT TESTED |

## Next action

Implementation agent: read repository operating instructions and `tasks/PP-META-I1-C2B.md`; execute only Workstream A in the trusted local checkout, preserving exact evidence provenance and zero real upload/model calls. Commit locally, deliver readiness/test report and request independent audit. Obtain separate owner authorization before Workstream B, PR publication, merge, or release.
