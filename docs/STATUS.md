# Project Status

> Operational state only. Historical detail lives in reviewed PRs and handoffs.

## Project

- **Name:** ProofPilot AI — Meta Global AI Developer Hackathon (Push the Frontier)
- **Current phase:** PP-META-I1-C2B-R1 — completion-budget remediation after the first real Muse Spark video smoke
- **Status:** R1 implemented on a Draft PR branch; **awaiting independent exact-head audit.** No further live Meta request is authorized.
- **Primary branch:** protected `main` at `0b49d94914576d3c8c605d0a1f50d08d77c4bb8b` (C2B Workstream A squash merge; PR #3)
- **Working branch:** `phase/pp-meta-i1-c2b-r1`
- **Active task:** `tasks/PP-META-I1-C2B-R1.md`
- **Active handoff:** PP-META-I1-C2B-R1-A1
- **Authorization:** The single-use live smoke (owner comment 6444165827) is **spent**. **Not authorized:** any further Meta upload or inference, merge, deployment, product UI shell, Docker bypass, C3, or AI-generated patch execution.

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

## C2B results

### Workstream A — merged PR #3 (independent audit PASS)
Reference clip authenticity, zero-network dry run, exact-id model discovery (`muse-spark-1.3` AVAILABLE), fail-closed Responses lifecycle (`RESPONSE_NOT_COMPLETED` for any non-`completed` status, `error`, `incomplete_details`, or refusal), full usage capture, single-use procedure in `docs/LIVE-SMOKE.md`.

### Workstream B — first real smoke `c2b-live-smoke-001` (2026-10-27): T04 **PARTIAL**
- Real Meta transport accepted: one Files upload (`expires_after` 3600 s), one `muse-spark-1.3` Responses request (`input_file`, `text.format` json_schema, 1500 output tokens), one delete; no retry; clip SHA-256 `e9df68b14c48300818f9ec9407b884413037f29305f17a5da3cc4fac05eeafdf` (certified synthetic mobile recording).
- Outcome: provider `status=incomplete`, `incomplete_details.reason=max_output_tokens`. Usage 2773 input / 1500 output (1113 reasoning) / 4273 total; frames not reported; about 20.5 s total. Local result `ANALYSIS_FAILED` / `RESPONSE_NOT_COMPLETED`; partial text discarded; **no `Symptom` accepted**.
- Remote file reported deleted. Actual charge **unknown** (not visible; credit balance never verified).
- Evidence (local, gitignored, mode 0600): `.proofpilot/analysis/c2b-live-smoke-001/analysis.json`. Preserved unchanged. **The run id is spent and must never be reused.** Traffic, usage and cleanup are agent-reported; independent review had no access to the account or local file.
- Not yet verified: that a completed structured answer arrives in the documented shape and passes local validation.

### R1 remediation (this branch, zero-network)
- Native video Responses now sends `reasoning: {effort: 'low'}` (reasoning tokens count against `max_output_tokens`; `none` is rejected by Meta). Default video cap raised 1500 → 3072; the shared 4096 ceiling and the text path are unchanged; an out-of-range cap is refused before any upload.
- Local (mocked only): lint/typecheck clean; unit 115/115; security 27/27; integration 11/11; `f01:baseline` exit 0 certified; `test:e2e:f01` exit 1 (expected); 5/5 new-guard mutants killed. Hosted CI: see the Draft PR.
- Worst-case cost per call rises (cap doubled): about $0.02 by arithmetic at published rates, not a measured cost.

## Open gates

| Gate | Status |
|---|---|
| C2B Workstream A readiness and lifecycle guards | DONE, merged |
| T04 real Muse Spark video analysis | **PARTIAL** (see above); needs a new run id and fresh owner authorization |
| C2B-R1 request settings (low reasoning, 3072 cap) | Implemented; audit PENDING |
| Product five-screen design `design/screens/PP-PRODUCT-SCREEN-MAP.md` | PROPOSED; awaiting owner's higher-fidelity visual approval |
| Isolated Docker/ARM64 patch runner | NOT VERIFIED; no generated patch execution allowed |
| C3 patch proposal, C4 trusted candidate verification, evidence export, demo/submission | NOT STARTED |
| Baseten | NOT TESTED |

## Next action

GPT-6 exact-head audit of the R1 Draft PR. After merge, the owner decides whether to authorize a second live attempt (new run id, e.g. `c2b-live-smoke-002`, per `docs/LIVE-SMOKE.md`, with the higher worst-case cost acknowledged). Do not start C3.
