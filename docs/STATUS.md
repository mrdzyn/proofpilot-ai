# Project Status

> Operational state only. Historical detail lives in reviewed PRs and handoffs.

## Project

- **Name:** ProofPilot AI — Meta Global AI Developer Hackathon (Push the Frontier)
- **Current phase:** PP-META-I2-C3-LIVE-01A — human approval and live-activation safety gate (implementation and mock tests only; awaiting independent exact-head review)
- **Status:** C3-B2A (PR #10) is **merged** after an independent PASS; protected `main` is `e2e0216e922ef72b8310b3ec81e5afc4e6208fab`. C3-LIVE-01A adds a TTY-only operator-approval CLI, private single-use approval records, a fail-closed authorization validator, an atomic approval-then-reservation order with documented crash recovery, an EMPTY decision register (`config/live-authorization.json`) and a zero-network SYNTHETIC rehearsal. **No genuine approval exists:** LIVE-C3-01 is **NOT APPROVED**, the live quota is a frozen code constant of 0, the production proposal entry point is hard-disabled, and no provider, Modal or model call was made.
- **Primary branch:** protected `main` at `e2e0216e922ef72b8310b3ec81e5afc4e6208fab` (PR #10 squash merge)
- **Working branch:** `phase/pp-meta-i2-c3-live01a-approval-gate` (Draft PR; the branch head is authoritative)
- **Active task:** `tasks/PP-META-I2-C3-LIVE-01A.md`
- **Active handoff:** PP-META-I2-C3-LIVE-01A-A2
- **Authorization:** Both single-use live smokes are **spent**. **APPROVED:** SEC-C3-01 (F01-only closed-grammar CSS, hand-authored controls only). **NOT APPROVED:** LIVE-C3-01 (`docs/LIVE-C3-01-DECISION-RECORD.md` is a proposal; quota 0), C3-B2B (evaluating model proposals), UI-C3-01 (report UI), HOST-C3-01 (Modal or any hosted backend). A credit balance is not permission to spend. No Meta/Baseten/Modal call, no execution of model-generated code, no deployment or merge by the agent.

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
| C3-A proposal validator + adapter + reservations | **MERGED** (PR #8, independent audit PASS); production entry point hard-disabled |
| C3-B1 offline coordinator, 3-replay VERIFIED logic, scoreboard, DID-1 (hand-authored controls) | **MERGED** (PR #9, independent PASS) |
| C3-B2A pre-live readiness (preflight, coordinator guard, Baseten discovery procedure, LIVE-C3-01 record, Meta checklist, Modal update) | **MERGED** (PR #10, independent PASS after remediation of MAJOR-1 control provenance and MINOR-2 key-field read) |
| C3-LIVE-01A human approval and live-activation safety gate (operator approval CLI, private single-use records, fail-closed validator, empty register, synthetic rehearsal) | **IMPLEMENTED** (mock/synthetic only); independent review PENDING; no genuine approval exists |
| C3-LIVE-01B real activation of one Meta proposal attempt | NOT STARTED; **NOT APPROVED** |
| LIVE-C3-01 first bounded Muse Spark proposal | **NOT APPROVED** (`docs/LIVE-C3-01-DECISION-RECORD.md`); needs owner approval, per-run operator approval, and a separately reviewed code change |
| C3-B2B model proposals through staging and the coordinator | NOT STARTED and **gated in code** (`assertHandAuthoredControls`); needs its own owner authorization, a reviewed change and a new provenance label |
| C3-C scoreboard report UI, C3-D report + replay + audit, C3-E demo, C3-F submission | NOT STARTED (UI-C3-01 not approved) |
| Baseten compatibility (`docs/BASETEN-COMPATIBILITY-PLAN.md`) | PLAN ONLY; pinned id vs public docs discrepancy and a structured-output doubt recorded; NOT TESTED |
| Modal sandbox (`docs/MODAL-FEASIBILITY-PROPOSAL.md`) | PROPOSAL ONLY; the C3 contract forbids hosted backends; HOST-C3-01 not requested; not a verified boundary |
| Muse Wonder as patcher | UNVERIFIED and not a dependency |
| Baseten | NOT TESTED |

## C3-LIVE-01A result (local; branch `phase/pp-meta-i2-c3-live01a-approval-gate`)
- Approval architecture and limits: `tasks/PP-META-I2-C3-LIVE-01A.md`. The local operator record is **self-declared and not authenticated identity**; the repository register (empty) is the only place a live decision can exist.
- Synthetic rehearsal (`node scripts/c3-live-rehearsal.ts`): 11 scenarios, 0 provider requests, never `VERIFIED`, production validator refuses with `LIVE_NOT_APPROVED`. A rehearsal result is **not** an authorization.
- Audit 1 (FIX REQUIRED: MAJOR-1 production boundary, MAJOR-2 owner-pinned revision, MINOR-3 ancestor permissions) remediated in handoff `PP-META-I2-C3-LIVE-01A-A2`: one production gate (`live-gate.ts`) derives root/register/pin/Git/dirs/quota internally; injectable core not exported; `config/live-activation.json` (EMPTY) pins a tree digest excluding itself; `.proofpilot` ancestors checked.
- Test and CI evidence: see the Draft PR and the handoff.
- C3-LIVE-01B (real activation) is **not started and not approved**.

## C3-B2A remediation (audit 1: MAJOR-1, MINOR-2)
- MAJOR-1: controls are deep-frozen and trusted by identity (module-private WeakSet); clones, model-derived PC-1 equivalents, foreign `check` callbacks and mutation attempts are refused before any lock/stage/runner/browser. `VERIFIED` rule, runner and oracle unchanged.
- MINOR-2: `loadProviderConfig(..., {readApiKey:false})`; default preflight performs zero access to provider key fields (proxy-instrumented tests); `--check-credentials` reads only the selected provider's key and reports presence.
- Local at code head `69d1e94`: lint/typecheck clean; unit 262/262; security 50/50; integration 29/29; `f01:baseline` exit 0 certified; `test:e2e:f01` exit 1 (expected); real C3-B1 run: PC-1 VERIFIED 3/3, scoreboard re-verified; both fixes fail their tests when reverted. Quota 0, `proposeCandidate()` disabled, no provider/Modal call.

## C3-B2A result (local; code head `f87fef3`, clean tree, macOS arm64, Node 24.21.0)

- **Zero-network preflight (`scripts/c3-proposal-preflight.ts`, `runProposalPreflight`):** deterministic (identical inputs give a byte-identical report), mock literals only, no provider construction, no fetch, no secret read. For both providers it reported 28 checks: 24 PASS, 1 NOT_CHECKED (credential presence, not authorized), 1 INFO (billable flag), 2 BLOCKED_BY_DESIGN (live quota frozen at 0; model proposals not executable); verdict `NOT_AUTHORIZED_TECHNICALLY_READY`, `providerRequests: 0`, live quota 0. Local evidence (gitignored): `.proofpilot/preflight/proposal-preflight-{meta,baseten}-*.json`. It exercises and confirms the refusal of: missing consent, foreign consent, model mismatch, billable gate off, tampered request, absent/failed/incomplete status, refusal, wrong response model, empty output, malformed JSON, forbidden content, unknown key, out-of-grammar answer, zero quota, duplicate run id, exhausted quota, and the disabled entry point. A valid mock answer is only an `UNTRUSTED PROPOSAL — NOT VERIFIED` and is never handed to execution. `--check-credentials` reports a boolean only and fails the preflight if no key is present (run here without a key: NOT SET).
- **Model-derived proposals cannot reach execution:** `runOfflineVerification` now calls `assertHandAuthoredControls` first and refuses (before any lock, stage, browser or runner call) every control that is not byte-for-byte one of `HAND_AUTHORED_CONTROLS`. `acceptedAdjustments` is used nowhere in production; static tests show the stage runner, coordinator and scripts import no proposal, preflight, reservation or discovery code. C3-B1 `VERIFIED` semantics are unchanged (still one producer, exactly three fresh replays, exact inventory).
- **Baseten (documentation re-read 2026-10-29; no request):** the Model APIs overview says all models except Muse Spark Open support structured outputs, its models table showed no slug, and it notes that `/v1/models` can differ from enforced limits; the Chat Completions reference supports `json_schema` generally and does not mention Muse Spark Open; the public alias reported by the owner is `meta-models/muse-spark-open` while the repository pins `meta-models/muse-spark-open-1026` (not substituted). Conclusion: our `json_schema` request for this model is unverified and probably unsupported. The mock Baseten path is unchanged. A prepared owner-run, single-request discovery (`scripts/baseten-model-discovery.ts`: dry run by default; `--execute` needs `PROOFPILOT_ALLOW_PROVIDER_DISCOVERY=1`; retries forced to 0; one non-billable GET; no secret printed; alias never substituted) is documented in `docs/BASETEN-COMPATIBILITY-PLAN.md` and was only ever run as a dry run. No Baseten key was requested, read or printed.
- **Modal (`docs/MODAL-FEASIBILITY-PROPOSAL.md`):** corrected from the official Sandbox networking page: outbound network can be fully blocked (`block_network=True` / `blockNetwork: true`) or restricted with CIDR or domain allowlists, with Modal's own caveats (DNS unrestricted unless fully blocked, ECH unsupported, domain fronting); CPU, memory and timeout parameters are documented. Vendor documentation only; not tested; HOST-C3-01 not approved; no Modal resource, token, deployment or billing.
- **LIVE-C3-01 (`docs/LIVE-C3-01-DECISION-RECORD.md`) and `docs/META-ACTIVATION-CHECKLIST.md`:** a proposed, explicitly NOT APPROVED record (exact provider and model, a maximum of one billable attempt for a first run, bounds, per-run operator approval, credential handling, unique reservation ids, no retries or fallback, response validation, evidence, stop conditions, no automatic evaluation) with an empty owner approval register.
- **Tests:** lint/typecheck clean; unit 259/259; security 49/49; integration 29/29 (real browser, local); `pnpm f01:baseline` exit 0 REPRODUCED/certified; `pnpm test:e2e:f01` exit 1 (expected); real `scripts/c3-offline-verification.ts` run (`c3-b1-20261029T023912Z-195658`, approved SHA = code head): baseline REPRODUCED, PC-1 `VERIFIED` 3/3, negatives as before, scoreboard re-verified; C3-0 spike unchanged. 22 guard mutants: 20 killed, 2 cosmetic no-ops (my mutation text did not change behavior); the preflight's own entry-point and quota checks gained injectable regression seams so a regressed repository is demonstrably reported.
- **Zero provider/Modal calls:** the preflight and discovery tests run under a global `fetch` trap (0 calls); the discovery tests use an injected mock transport; the real discovery script was run only without `--execute` (dry run, `REQUESTS MADE: 0`) and with `--execute` but no opt-in (refused, `REQUESTS MADE: 0`). A secret scan of tracked files (key-shaped tokens, private keys, assigned provider keys, bearer tokens) is part of the security suite.
- **Unchanged:** `verifier/`, `fixtures/sample-store/`, `config/` (patch policy), `.github/`, `candidate-stage.ts`, `patch-proposal.ts`, `reservations.ts`, `APPROVED_LIVE_QUOTA` (still `{meta: 0, baseten: 0}`), `proposeCandidate()` (still throws `LIVE_NOT_APPROVED` first).
- **Limits:** the preflight proves the repository's offline logic, not Meta's behavior; Meta's acceptance of the proposal request shape, real answer quality and cost are unknown until a separately authorized live call; the per-run operator approval capture does not exist in code yet; locks are not crash-safe (fail closed).

## C3-B1 audit remediation 2 (GPT-6 comment 6464385552; MAJOR-3; MAJOR-1 and MAJOR-2 re-audited RESOLVED, code head `bb64b73`)

- **MAJOR-3 (replay display metadata and baseline provenance):** every published `ReplayEntry` field now comes from one pure builder, `buildReplayEntry`, which the coordinator publishes with and `verifyScoreboard` calls again on the persisted record, its file bytes and the independently recomputed evidence check. The verifier compares the whole entry field by field (`n`, `outcome`, `failureCode`, `failureMessage`, `oracleExitCode`, `evidenceDir`, `recordSha256`, `candidateCssSha256`, `nonce`, `mobile`, `desktop`, `servedCssSha256`, `evidenceFinalized`, `evidenceProblems`) and rejects any extra key, for the baseline and every candidate replay. The baseline must be exactly `BASELINE/replay-1` with a record labelled `BASELINE`; every candidate replay record must carry its own control id as its label. A real evidence problem that the published entry omits is reported. Truthful failed and inconclusive scoreboards (including real failure messages) still verify. `decideVerification`, the oracle and `candidate-stage.ts` are unchanged.
- **Tests:** 14 single-field forgeries across 7 kinds of replay (failed, inconclusive, passing, the baseline) without touching the authentic evidence; evidence tampered after the scoreboard was written; baseline redirected to NC-1 (authentic, hash-matching, fields copied) fails on path and label; baseline and candidate record-label forgeries with matching hashes; truthful negative scoreboards; real-browser checks on the real evidence. Also fixed a flaky concurrency test (either coordinator may win the lock; the old test assumed one). Lint/typecheck clean; unit 242/242; security 41/41; integration 29/29 (real browser, local); `pnpm f01:baseline` exit 0 certified; `pnpm test:e2e:f01` exit 1 (expected); C3-0 spike unchanged. 8 of 8 new-guard mutants killed.
- **Real run `c3-b1-20261028T084508Z-e27b62` (approved SHA = code head, clean tree):** baseline REPRODUCED; NC-1, NC-1b, NC-3 `PATCH_FAILED`; NC-6 and NC-7 `INCONCLUSIVE`; PC-1 `VERIFIED` 3/3; NC-5 `NOT_REPRODUCED`; the stricter verifier accepted it; DID-1 passed (separate). Example scoreboard regenerated.
- No provider, Modal or model call; `proposeCandidate` still hard-disabled; live quota 0; no report UI.

## C3-B1 audit remediation (GPT-6 comment 6464103194; remediation code head `6002b60`)

- **MAJOR-1 (scoreboard completeness, NC-5):** `verifyScoreboard` no longer trusts the scoreboard's own list. It checks the exact inventory from trusted code (`HAND_AUTHORED_CONTROLS`: NC-1, NC-1b, NC-3, NC-6, NC-7, PC-1 in order, no missing, extra, duplicated, renamed or reordered control), each control's description, adjustments, rendered CSS, candidate id, fault kind, replays required and expected status, sequential replay numbering and paths, and recomputes `replaysAttempted`, `replaysPassed`, `status`, `reason`, `expectationMet` and `expectationProblems` from the persisted records. A replay list that is truncated or padded relative to the evidence is rejected (a truthful run stops at the first replay that is not a clean pass, or attempts none without a reproduced baseline). NC-5 is recomputed from the persisted PC-1 evidence (baseline gate then decision) and a missing, altered or VERIFIED-claiming NC-5 fails. Top-level fields, `complete`, the label, zero provider/Modal calls and an `approvedSha` shape check are enforced; a `did1` field fails. A truthful scoreboard of a run whose expectations were not met (for example a failing third PC-1 replay, or a baseline that did not reproduce) still verifies.
- **MAJOR-2 (SHA, manifest and viewport proof binding):** `baselineGate(e, approvedSha)` and `replayPassProblems(e, approvedSha)` require the record and its manifest to name the approved SHA, so a certified baseline from another SHA cannot certify a candidate. `decideVerification` now takes the approved SHA and the baseline evidence itself (not a boolean): every replay must also carry the baseline's trusted-file manifest. `sourceProof` must contain exactly one `F01-MOBILE` and exactly one `F01-DESKTOP` entry, each valid, for the baseline and for every qualifying replay; duplicates, missing and mislabeled proofs never promote. The three-replay `VERIFIED` rule and the C3-0 staging runner (`candidate-stage.ts`) are unchanged.
- **Tests:** lint/typecheck clean; unit 237/237; security 41/41; integration 28/28 (real browser, local); `pnpm f01:baseline` exit 0 REPRODUCED/certified; `pnpm test:e2e:f01` exit 1 (expected); C3-0 spike unchanged. Regression tests cover `candidates=[]`, omitted PC-1, duplicated/extra/renamed/reordered controls, fake counts, truncated replay lists, altered metadata, false `complete`, forged NC-5 (VERIFIED, `neverVerified` false, removed, altered), cross-SHA baseline, mismatched record/manifest SHAs, drifted trusted manifests, and duplicate/missing/mislabeled viewport proofs. 16 new-guard mutants: 15 killed, 1 equivalent (the proof-label check is implied by the exactly-one-each rule).
- **Real run `c3-b1-20261028T082601Z-589dba` (approved SHA = code head, clean tree):** baseline REPRODUCED; NC-1, NC-1b, NC-3 `PATCH_FAILED`; NC-6 `INCONCLUSIVE` (TAMPER); NC-7 `INCONCLUSIVE` (PORT_BUSY); PC-1 `VERIFIED` 3/3; NC-5 `NOT_REPRODUCED`; scoreboard re-verified OK by the stricter verifier; DID-1 passed (separate). Example: `docs/examples/c3-b1-scoreboard.example.json`.
- No provider, Modal or model call; `proposeCandidate` still hard-disabled; live quota still 0; `verifier/`, `fixtures/`, `config/`, `.github/` and `candidate-stage.ts` unchanged.

## C3-B1 result (local; code head `358c273`, clean tree, macOS arm64, Node 24.21.0)

- **Mechanism:** `packages/core/src/candidate-coordinator.ts` drives the unchanged C3-0 runner serially, one fresh disposable stage per replay, under a coordinator lock plus the existing oracle lock and port preflight. A baseline gate (`baselineGate`) must certify F01 REPRODUCED in a fresh stage first. `decideVerification` is the only place `VERIFIED` is returned: it needs a reproduced baseline, exactly three replays, each a complete clean pass (oracle exit 0, evidence finalized and hash-verified, integrity intact, stage removed, both viewports passed with the tap received by `add-to-cart` and cart 1, trace proof that the staged CSS was served for both viewports), identical approved SHA, rendered CSS, adjustments and trusted-file manifest, and a fresh nonce per replay. One pass is `ORACLE_PASS`. `verifyScoreboard` recomputes every status from the persisted evidence, so a forged, truncated or tampered scoreboard fails closed. The scoreboard is written atomically only when the run completes.
- **Controls (all hand-authored literals; none read from a file, environment or model):** NC-1, NC-1b, NC-3, NC-6 (stage tamper), NC-7 (busy port), PC-1 (3 replays), and NC-5 derived by applying the baseline gate to the real PC-1 stage (a tree where the oracle passes). DID-1 is a separate demonstration (`containment-demo.ts`, not exported from the package index, not in the scoreboard, result type `isCandidateVerdict: false`).
- **Run `c3-b1-20261028T080446Z-7091e5` (approved SHA `358c273`; evidence `.proofpilot/c3-b1/…`, gitignored; real, sanitized example in `docs/examples/c3-b1-scoreboard.example.json`):**

| Control | Status | Replays passed | Detail |
|---|---|---|---|
| BASELINE gate | REPRODUCED (certified) | n/a | mobile fails by interception, desktop passes, exit 1 |
| NC-1 | `PATCH_FAILED` | 0/1 | baseline-identical |
| NC-1b | `PATCH_FAILED` | 0/1 | baseline-identical |
| NC-3 | `PATCH_FAILED` | 0/1 | mobile and desktop both failed |
| NC-6 | `INCONCLUSIVE` | 0/1 | `TAMPER`, oracle never ran |
| NC-7 | `INCONCLUSIVE` | 0/1 | `PORT_BUSY`, oracle never ran |
| PC-1 | **`VERIFIED`** | 3/3 | three fresh stages, three distinct nonces, exit 0 each |
| NC-5 | `NOT_REPRODUCED` | n/a | never VERIFIED |
| DID-1 | passed (separate) | n/a | 2 URLs aborted, canary 0 connections routed, control canary 1 |

- **Independent re-check of the saved evidence (separate script):** every replay record hash matches, every evidence hash matches, and in every trace of every stage that ran the browser, the served `/styles.css` equals baseline + nonce + rendered rules.
- **VERIFIED scope:** "the hand-authored PC-1 candidate passes the unmodified F01 oracle in 3 fresh staged replays under the approved SHA". It says nothing about a model, about other fixtures, or about sandboxing.
- **Tests:** lint/typecheck clean; unit 228/228; security 41/41; integration 28/28 (real browser, local only); `pnpm f01:baseline` exit 0 REPRODUCED/certified; `pnpm test:e2e:f01` exit 1 (expected); C3-0 spike unchanged (NC-1 and NC-1b `PATCH_FAILED`, PC-1 `ORACLE_PASS`). 14 of 14 guard mutants killed (fewer than 3 replays, baseline bypass, desktop requirement, freshness, identical CSS and adjustments, trusted hashes, evidence problems, exit code, scoreboard recompute, record hash, continue-after-failure, coordinator lock, baseline desktop check, DID-1 in scoreboard); two initial survivors were fixed with sharper tests.
- **Zero provider/Modal calls:** the coordinator, the script and DID-1 import no inference, intake or proposal code and name no provider endpoint (security test); `modelOrProviderCalls` and `modalCalls` are 0 in the scoreboard and a scoreboard claiming otherwise fails verification; `proposeCandidate` still throws `LIVE_NOT_APPROVED`; the live quota constant is still `{meta: 0, baseten: 0}`.
- **Unchanged:** `verifier/`, `fixtures/sample-store/`, `config/` (patch policy), `.github/`, `candidate-stage.ts`, the proposal modules and the C2B spent run records.
- **Limits:** a spike-grade harness, not a sandbox; dependency integrity is detect-only; the nonce proof depends on the Playwright 1.64.1 trace layout; VERIFIED here means the closed-grammar CSS control passed three local runs; the coordinator lock and the oracle lock are not crash-safe (a stale lock fails closed and needs manual removal); the real-browser tests and the script are local only (hosted CI runs lint, typecheck, unit, security and the baseline).

## C3-A result (local; remediation code head `6747b29`, clean tree, macOS arm64, Node 24.21.0)

- **Audit remediation (GPT-6 comment 6463012075):**
  - **MAJOR-1 (explicit completed):** the Meta structured proposal path now requires `status === "completed"` exactly (plus no error, incomplete_details or refusal). An absent, null, empty, wrong-type, cased, padded or unrecognised status yields `PROPOSAL_FAILED / RESPONSE_NOT_COMPLETED`, with exactly one request (also with `PROOFPILOT_INFERENCE_MAX_RETRIES=2`), a run id and slot burned, and the reservation settled as failed. Enforced in both `structuredResponse` and the pure `processProposalResponse` (defence in depth). The shared `lifecycleOf` and the C2B video path are unchanged (tests confirm).
  - **MAJOR-2 (no injected-transport bypass):** the public `transport` label and `injectedTransportQuota` are removed as an authorization input. The production entry point `proposeCandidate` is hard-disabled: it throws `LIVE_NOT_APPROVED` before reading its argument, calling any provider method, or touching reservations or files, whatever it is given (injected or forged provider, positive quota, credentials, billable flags, consent). The full flow (pre-flight, reservation, one structured call, processing, artifact, settlement) now lives only in the mock-only harness `tests/support/proposal-harness.ts`, built on the pure production pieces `preflightProposal`, `processProposalResponse`, `persistProposalArtifact`. Nothing in `packages/` or `scripts/` calls `provider.structuredResponse` or imports the harness (tested). Enabling live proposals requires a separately approved commit that changes the entry point.
  - **Orphan slots (secondary):** a slot is created first and the run record second, so a crash between them leaves a spent slot with no run record. This only loses capacity, never allows an extra call. Uncertain slots are never recycled; `listOrphanSlots()` reports them read-only for operator reconciliation (tested).
  - **Consent (secondary):** `createProposalConsent` only builds a consent-shaped record. The mock-only tests do not demonstrate human consent. Any eventual live operation needs a real human approval captured and audited separately, in addition to LIVE-C3-01.
- **Parser (`packages/core/src/patch-proposal.ts`):** pipeline V0 to V7 as before (2,048-byte bound, strict JSON with duplicate-key detection, forbidden-content scan of decoded keys and strings with NFKC and default-ignorable stripping after a pre-strip control-character check, exact shape, closed grammar through `renderCssAdjustments`), with the exact `PATCH_REJECTED` / `SECURITY_BLOCKED` precedence of the contract.
- **Adapter pieces (`packages/inference/src/patch-proposal.ts`, `client.ts`):** `structuredResponse` (retries always 0, exact model, `reasoning.effort=low`, 3,072 output tokens, 12,000 input characters, strict json_schema derived from the renderer tables), deterministic bounded request builder (trusted oracle facts and the untrusted symptom hypothesis separately labelled), per-run consent record bound to run, provider and prompt hash.
- **Billing (`reservations.ts`):** run id and quota slot claimed together under a lock, never released; `APPROVED_LIVE_QUOTA = {meta: 0, baseten: 0}` is a frozen code constant. Artifacts: gitignored `.proofpilot/proposals/<runId>/proposal.json`, `UNTRUSTED PROPOSAL — NOT VERIFIED`, hashes only.
- **Tests:** lint/typecheck clean; unit 211/211; security 36/36; integration 25/25 (real browser, local); `pnpm f01:baseline` exit 0 REPRODUCED/desktop PASS/certified; `pnpm test:e2e:f01` exit 1 (expected); the C3-0 spike still gives NC-1 `PATCH_FAILED`, NC-1b `PATCH_FAILED`, PC-1 `ORACLE_PASS`. Remediation mutants 6 of 6 killed (entry point no longer throws, provider layer accepts absent status, processing accepts absent status, processing ignores refusal, slot content not recorded, C2B video path made strict) on top of the earlier 14.
- **Zero real provider calls:** adversarial tests for both Meta and Baseten pass a purported injected transport that would forward to the real `fetch`, a Proxy-wrapped provider and a hand-forged provider object, with consent, credentials, billable flags and positive quotas: the entry point rejects, the forwarding transport and every provider method are invoked 0 times, global `fetch` is invoked 0 times, and no reservation or proposal file is created. All harness tests use an injected mock transport under a global `fetch` trap.
- **Unchanged:** `verifier/`, `fixtures/sample-store/`, `config/`, `.github/`, `candidate-stage.ts`, C2B spent run records.
- **Limits:** the pieces have never spoken to Meta or Baseten; the proposal schema and the Baseten chat-completions shape are unverified; the reservation lock is not crash-safe (a stale lock fails closed and needs manual removal); the harness is test code and its safety rests on tests supplying mock transports (nothing in production imports it); hosted CI does not run the real-browser tests.

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

1. Independent exact-head review of the C3-LIVE-01A Draft PR (hosted CI plus the evidence above).
2. Owner decisions, none started: merge; whether to approve the per-run operator-approval design; whether and with what exact values to record LIVE-C3-01 (then C3-LIVE-01B as a separate PR and audit); run the Baseten discovery yourself; decide separately on C3-B2B, HOST-C3-01 (Modal) and UI-C3-01 (report).

Submission deadline: Nov 4, 9:00 PM EST = **Nov 5, 10:00 AM PHT**; internal target is Nov 4 PHT.
