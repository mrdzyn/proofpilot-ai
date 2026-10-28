# Project Status

> Operational state only. Historical detail lives in reviewed PRs and handoffs.

## Project

- **Name:** ProofPilot AI — Meta Global AI Developer Hackathon (Push the Frontier)
- **Current phase:** PP-META-I2-C3-0 — zero-model candidate-staging spike (implemented; awaiting independent exact-head review)
- **Status:** C3 contract (`tasks/PP-META-I2-C3.md`, revision 4) is merged (PR #6, audit PASS at `6afb386`). Owner approved **SEC-C3-01** (bounded) and authorized only the C3-0 spike on 2026-10-28 (comment 6460953906). The spike passed locally; no model-generated candidate exists or may execute.
- **Primary branch:** protected `main` at `c316df930501187543c1296cee41946162565278` (PR #6 squash merge)
- **Working branch:** `phase/pp-meta-i2-c3-0-staging-spike` (Draft PR; audited head `9f1ec0d` was FIX REQUIRED (MAJOR-1, MAJOR-2); remediation code head `0d2a139a93c24741232649819ca70f81fbad012b`, then a docs commit; the branch head is authoritative)
- **Active task:** `tasks/PP-META-I2-C3.md` (C3-0 only)
- **Active handoff:** PP-META-I2-C3-0-R1
- **Authorization:** Both single-use live smokes are **spent**. **APPROVED:** SEC-C3-01 (F01-only closed-grammar CSS, hand-authored controls only until further gates). **NOT APPROVED:** LIVE-C3-01 (12 Meta + 4 Baseten are proposed maximums; effective billable quota is 0) and UI-C3-01 (report layout). No Meta/Baseten request, no execution of model-generated code, no deployment or merge by the agent.

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

### Merged work
- **Workstream A — PR #3 (independent audit PASS):** reference clip authenticity, zero-network dry run, exact-id model discovery, fail-closed Responses lifecycle (`RESPONSE_NOT_COMPLETED` for any non-`completed` status, `error`, `incomplete_details` or refusal), full usage capture, single-use procedure.
- **C2B-R1 — PR #4 (exact-head audit PASS at `47926fb8f9540978361d1837de3ea44d4945c2d9`, squash-merged as `9103d00`):** native video Responses send `reasoning: {effort: 'low'}`; default video cap 1500 → 3072 (shared 4096 ceiling and text path unchanged; invalid cap refused before any upload).

### Live smokes (clip SHA-256 `e9df68b14c48300818f9ec9407b884413037f29305f17a5da3cc4fac05eeafdf`, certified synthetic mobile recording; both run ids are **permanently spent**)

| | `c2b-live-smoke-001` | `c2b-live-smoke-002` |
|---|---|---|
| Settings | 1500 tokens, default reasoning | `reasoning: low`, 3072 tokens |
| Provider status | `incomplete` (`max_output_tokens`) | `completed` |
| Local result | `ANALYSIS_FAILED` / `RESPONSE_NOT_COMPLETED` | `VIDEO_ANALYZED` |
| Usage (in / out / reasoning / total) | 2773 / 1500 / 1113 / 4273 | 2773 / 1129 / 665 / 3902 |
| Latency (total) | about 20.5 s | about 19.7 s (upload 3.0, generation 11.0) |
| Request ids (upload / response) | `df486a8b-18e5-47cf-bc70-e028b238b5f8` / `536fb081-2d11-4010-aa3a-fb510c3626bc` | `44a30289-e276-4645-9ba2-01402b5f4241` / `585e7494-7cdd-44a1-b6ed-44f48a03bb44` |
| Remote file | reported deleted | reported deleted (`file-2512150135928415`) |
| Symptom | none accepted | schema-valid, `provenance: model-hypothesis` |

- **T04: completed**, based on the **agent-reported** run 002. GPT-6's post-execution review (PR #4 comment 6446824225) accepted it as met on that basis but could not access the gitignored artifacts or the Meta account, so provider-side traffic, deletion and validated content were **not independently replayed or provider-confirmed**.
- **Diagnosis (hypothesis only):** the model reported two Add-to-cart taps (about 3.3 s and 6.4 s) with the cart count staying 0 and no feedback, and listed its own uncertainties (page URL not visible; cannot tell from visuals whether taps registered). This is **consistent with F01** but **does not establish the promo overlay as the root cause** and proves no fix. The trusted Playwright baseline, not the model, establishes overlay interception. One successful completion does not show overall reliability, nor whether reduced reasoning, the larger budget, or both made the difference.
- **Cost:** actual account charge is **unverified** and the credit balance was never verified (owner accepted the risk for each run). Any figure in this repository (for example roughly $0.008 for run 002 from published rates) is an **illustrative calculation, not a billed amount and not a guaranteed maximum or cap**. There is no enforceable currency limit.
- **Evidence:** `.proofpilot/analysis/c2b-live-smoke-001/analysis.json` and `.../c2b-live-smoke-002/analysis.json` (gitignored, mode 0600). Both preserved unchanged. No media, secrets or raw response text are in Git.

## Open gates

| Gate | Status |
|---|---|
| C2B (Workstream A, R1, live smokes) | DONE and merged (PR #5) |
| T04 real Muse Spark video analysis | **COMPLETED (agent-reported)** |
| PR #6 contract | MERGED (audit PASS at `6afb386`) |
| SEC-C3-01 execution boundary (closed-grammar CSS adjustments, F01 only) | **APPROVED, bounded** (owner record in the task file). Does not certify the unimplemented C3-A validator; model candidates still blocked |
| LIVE-C3-01 live-call quantities | **NOT APPROVED**; every live path stays disabled |
| UI-C3-01 one-page static report (`design/screens/PP-C3-REPORT-CONTRACT.md`) | PENDING owner design approval |
| Five-screen product UI (`design/screens/PP-PRODUCT-SCREEN-MAP.md`) | CUT for the hackathon; stays PROPOSED and unbuilt |
| Independently verified Docker/ARM64 or OS sandbox | **NOT VERIFIED**. Still required before any model-authored HTML, JavaScript or free-form patch executes |
| C3-0 staging spike (unmodified oracle run in a per-candidate stage) | **IMPLEMENTED; local proof PASSED** (NC-1, NC-1b, PC-1 as expected); first audit FIX REQUIRED (exit code, mandatory evidence), remediated; re-audit PENDING |
| C3-A proposal validator + adapter, C3-B candidate runner, C3-C scoreboard/evidence, C3-D report + replay + audit, C3-E demo, C3-F submission | NOT STARTED |
| Muse Wonder as patcher | UNVERIFIED and not a dependency |
| Baseten | NOT TESTED |

## C3-0 staging spike result (local; remediation code head `0d2a139`, clean tree, macOS arm64, Node 24.21.0)

- **Mechanism:** `scripts/c3-stage-spike.ts` → `packages/core/src/candidate-stage.ts` (stage, lock, port preflight, verification, oracle run, trace proof, evidence gate), `css-adjustments.ts` (trusted rendering), `zip-read.ts` (trace reader). The oracle, `verifier/`, `fixtures/sample-store/`, `config/` and CI are unchanged.
- **Audit remediation (GPT-6 comment 6461860392):**
  - **MAJOR-1:** `ORACLE_PASS` now requires the oracle process to exit 0 and both trusted tests to pass with the expected tap target and cart count. Passing rows with any nonzero or missing exit are `INCONCLUSIVE` (`ORACLE_EXIT_ABNORMAL`). `PATCH_FAILED` requires Playwright's ordinary tests-failed exit 1; failing rows with another exit abstain.
  - **MAJOR-2:** evidence finalization is a mandatory gate (`finalizeEvidence`): all required artifacts (report, stdout, and per viewport the observation and trace) must exist and be hashed, the record is written atomically, then read back and every hash re-verified. Any failure downgrades a pass or fail to `INCONCLUSIVE`/`EVIDENCE_INCOMPLETE` and removes any stale passing record. The spike script now asserts evidence completeness (persisted record, finalized, required artifacts, matching hashes), the expected oracle exit per control (NC: 1, PC: 0), stage removal and post-run integrity.
- **Run `c3-0-20261028T060805Z-b1794a` (approved SHA = `0d2a139`; evidence `.proofpilot/c3-spike/…`, gitignored):**

| Control | Rendered CSS | Mobile | Desktop | Outcome | Oracle exit | Evidence |
|---|---|---|---|---|---|---|
| NC-1 no-op | none | failed, tap received by `promo-overlay`, cart 0 | passed, cart 1 | `PATCH_FAILED` | 1 | complete (20 files, 6 required) |
| NC-1b irrelevant | `.promo{z-index:5}` | failed, same signature | passed | `PATCH_FAILED` | 1 | complete (20 files) |
| PC-1 correct | `.promo-overlay{pointer-events:none}` | passed, tap received by `add-to-cart`, cart 1 | passed, cart 1 | `ORACLE_PASS` (1 of 3; not `VERIFIED`) | 0 | complete (19 files) |

- **Independent re-check of the saved evidence (outside the harness):** in every trace the recorded `GET /styles.css` body equals baseline + nonce marker + rendered rules; all evidence hashes match; no required artifact missing.
- **Integrity:** 11 trusted files match the approved blobs; hashes re-verified before and after each run; stages removed; lock released; no stray processes or stage directories; 0 model/provider calls.
- **Dependencies:** offline frozen install is impossible here (`ERR_PNPM_NO_OFFLINE_META`); a contained, hash-compared copy of the trusted install is used (detect-only, see the task file).
- **Tests:** lint/typecheck clean; unit 152/152; security 27/27; integration 25/25 (real browser, local only, run serially because files share port 4173); `pnpm f01:baseline` exit 0 REPRODUCED, desktop PASS, certified; `pnpm test:e2e:f01` exit 1 (expected). Mutation checks for the remediation: 6 of 6 killed (pass without exit 0, patch-failed on any exit, no downgrade on evidence failure, skipped missing-evidence check, skipped read-back verification, stale record not removed) plus the earlier 8 of 8 staging guards.
- **Limits:** a spike, not a sandbox. Dependency integrity is detected, not enforced; browser binaries are outside the manifests; nonce proof relies on the pinned Playwright trace format (1.64.1); only hand-written inputs ran; hosted CI does not run the real-browser staging tests.

## Next action

1. Independent exact-head re-audit of the C3-0 Draft PR (hosted CI plus the evidence above).
2. After merge (owner), C3-A: proposal validator (pipeline V0 to V7) and fail-closed provider adapter, mocks only. LIVE-C3-01 must be approved before any billable call; UI-C3-01 before any report UI. Model-generated candidates stay blocked until C3-A tests, audit and the remaining gates.

Submission deadline: Nov 4, 9:00 PM EST = **Nov 5, 10:00 AM PHT**; internal target is Nov 4 PHT.
