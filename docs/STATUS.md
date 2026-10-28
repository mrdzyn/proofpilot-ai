# Project Status

> Operational state only. Historical detail lives in reviewed PRs and handoffs.

## Project

- **Name:** ProofPilot AI — Meta Global AI Developer Hackathon (Push the Frontier)
- **Current phase:** PP-META-I2-C3-A — strict Muse Spark proposal pipeline (implemented with mocks only; awaiting independent exact-head review)
- **Status:** C3-0 (PR #7, staging spike) is merged; independent audit 6462249567. C3-A is implemented on a Draft PR: strict proposal validation, a fail-closed proposal adapter, single-use billing reservations. **No live provider call is possible** and no model-generated candidate executes.
- **Primary branch:** protected `main` at `142cd5b36aef4288c48a25caf401bd023e29b441` (PR #7 squash merge)
- **Working branch:** `phase/pp-meta-i2-c3-a-proposal-pipeline` (Draft PR; code head `9f6b8930cfc2625fc307fac4022ab663f1bace2d`, then a docs commit; the branch head is authoritative)
- **Active task:** `tasks/PP-META-I2-C3.md` (C3-A only)
- **Active handoff:** PP-META-I2-C3-A-A1
- **Authorization:** Both single-use live smokes are **spent**. **APPROVED:** SEC-C3-01 (F01-only closed-grammar CSS, hand-authored controls only until further gates). **NOT APPROVED:** LIVE-C3-01 (the effective live quota is a code constant of 0) and UI-C3-01. No Meta/Baseten call, no execution of model-generated code, no deployment or merge by the agent.

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
| C3-0 staging spike (unmodified oracle run in a per-candidate stage) | **MERGED** (PR #7, independent audit PASS) |
| C3-A proposal validator + adapter + reservations | **IMPLEMENTED, mock-tested only**; independent review PENDING |
| C3-B candidate runner for model proposals, C3-C scoreboard/evidence, C3-D report + replay + audit, C3-E demo, C3-F submission | NOT STARTED (C3-B needs a new handoff and authorization) |
| Muse Wonder as patcher | UNVERIFIED and not a dependency |
| Baseten | NOT TESTED |

## C3-A result (local, code head `9f6b893`, clean tree, macOS arm64, Node 24.21.0)

- **Parser (`packages/core/src/patch-proposal.ts`):** pipeline V0 to V7. 2,048-byte bound before parsing; one strict JSON value with duplicate-key detection at every depth (own parser, objects as Maps so `__proto__` is just a key); BOM, fences, trailing content and depth over 6 rejected; forbidden-content scan of every decoded key and string (control-character check before stripping, then NFKC, then removal of White_Space/Cf/Default_Ignorable/variation selectors/tags, then lower-cased token match, so U+200B cannot hide `url(`); exact shape with unknown and prototype-dangerous keys rejected; 0 to 4 string-only items; grammar, duplicate pairs and rendering by the existing `renderCssAdjustments` (no second allowlist). Precedence is exactly the contract: size and syntax (`PATCH_REJECTED`), then forbidden content (`SECURITY_BLOCKED`), then shape and grammar (`PATCH_REJECTED`). Results carry reason codes and hashes, never raw model text, and `provenance: model-hypothesis`.
- **Adapter (`packages/inference/src/patch-proposal.ts`, `client.ts`):** new `structuredResponse` (never `generateText`): exact model (`muse-spark-1.3`; Baseten the pinned versioned id), `reasoning.effort=low`, 3,072 output tokens, 12,000 input characters, strict `text.format` json_schema derived from the renderer tables, retries always 0, completed lifecycle only (status, error, incomplete_details, refusal), response model must equal the request byte for byte. Per-run consent bound to run, provider and prompt hash. Bounded deterministic request builder: trusted oracle facts and the untrusted symptom hypothesis are separately labelled; hostile symptom text cannot forge fences or headers; no media, paths or credentials.
- **Billing (`reservations.ts`):** claim of a unique run id and a provider quota slot under an exclusive lock, only after pre-flight passes and before any call; never released (timeouts, errors, schema failures, crashes and restarts all leave it spent); settle is best effort. `APPROVED_LIVE_QUOTA` is a frozen code constant `{meta: 0, baseten: 0}`: a provider using the real network can never claim, whatever the environment, flags or consent. Tests use an injected mock transport with `injectedTransportQuota`, which is ignored for the real transport. There is no CLI, script or runner path to the adapter.
- **Artifacts:** `.proofpilot/proposals/<runId>/proposal.json` (gitignored, 0600, written exclusively): label `UNTRUSTED PROPOSAL — NOT VERIFIED`, hashes of input and output, exact requested and responded model, sanitized usage and lifecycle, validation outcome; the raw model text is not stored. If the artifact cannot be written the attempt is `PROPOSAL_FAILED` (and spent).
- **Tests:** lint/typecheck clean; unit 207/207; security 33/33; integration 25/25 (real browser, local); `pnpm f01:baseline` exit 0 REPRODUCED/desktop PASS/certified; `pnpm test:e2e:f01` exit 1 (expected); the C3-0 spike still gives NC-1 `PATCH_FAILED`, NC-1b `PATCH_FAILED`, PC-1 `ORACLE_PASS` (exit 0; not `VERIFIED`). 14 of 14 guard mutants killed (quota override for live transport, invisible-character stripping, duplicate-key check, run-id check, retries, lifecycle gate, model check, slot accounting, consent, pre-strip control check, key scan, size bound, billable gate, raw-text storage). Zero real provider calls: every test provider has an injected transport, a global `fetch` trap fails the run if the real network is touched, and a test with credentials, consent and every flag shows a real-transport provider is refused before any reservation.
- **Contract correction:** vector G-1 listed `.promo-overlay > *` as `PATCH_REJECTED`, contradicting V2 (`>` is in the markup class); it is `SECURITY_BLOCKED` by precedence rule 3. The task table is corrected (G-1b).
- **Unchanged:** `verifier/`, `fixtures/sample-store/`, `config/` (patch policy), `.github/`, `candidate-stage.ts`, C2B spent run records.
- **Limits:** the adapter has never spoken to Meta or Baseten; the structured-output schema for proposals and the Baseten chat-completions shape are unverified assumptions (OpenAI-compatible); the reservation lock is not crash-safe (a stale lock fails closed and needs manual removal); the real-network refusal relies on `provider.transport` being set by `createProvider`, so code that deliberately injects a real `fetch` could bypass it, which is a code-review matter and not an accidental path.

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

1. Independent exact-head review of the C3-A Draft PR (hosted CI plus the evidence above).
2. Owner decides merge. C3-B (running accepted model proposals through the staging runner) needs a new handoff and authorization; LIVE-C3-01 must be approved before any billable call; UI-C3-01 before any report UI.

Submission deadline: Nov 4, 9:00 PM EST = **Nov 5, 10:00 AM PHT**; internal target is Nov 4 PHT.
