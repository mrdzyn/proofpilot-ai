# PP-META-I2-C3-B2B — verification of the accepted Muse Spark proposal (SPECIFICATION ONLY)

- **State:** **DRAFT SPECIFICATION. NOT APPROVED. NOT IMPLEMENTED.** Nothing in this file authorizes executing, staging or rendering a model-derived adjustment. C3-B2B stays gated in code (`assertHandAuthoredControls` refuses every control that is not one of the in-code hand-authored objects).
- **Base:** `main@564c56f59afc8b637dd8814078a98370e5ba2d97`.
- **Depends on:** the spent LIVE-C3-01 result (`docs/LIVE-C3-01-EXECUTION-REPORT.md`), C3-0 (staging runner), C3-B1 (coordinator, scoreboard, 3-replay `VERIFIED` rule), C3-B2A (control provenance by identity).
- **UI design gate:** Not applicable to this specification. UI-C3-01 (report UI) and HOST-C3-01 (Modal / hosted backend) are **NOT APPROVED** and out of scope.
- **Approval required before any implementation merges or any model-derived adjustment runs:** (1) a separate owner approval that names C3-B2B and these exact values, and (2) an independent security review of the change (checklist in section 9). Neither exists.

## 1. Objective

Answer one question honestly: **does the single accepted Muse Spark proposal (`c3-live-meta-001`: `.promo-overlay { pointer-events: none }`) fix F01 when judged by the unmodified trusted oracle?** Use only the stored artifact. **No new Meta call** is needed or allowed (the lifetime quota is spent; a second call needs a new owner decision).

## 2. The distinction that must survive every layer

| | Hand-authored control PC-1 | Muse Spark proposal `c3-live-meta-001` |
|---|---|---|
| Origin | written by a developer, in code, reviewed | produced by a model, stored as data |
| Provenance label | hand-authored control (identity-registered) | `UNTRUSTED PROPOSAL — NOT VERIFIED` until a trusted run says otherwise |
| Current status | **`VERIFIED`, 3/3 replays** (C3-B1) | **not verified, never run** |
| Adjustment values | `.promo-overlay` / `pointer-events` / `none` | **identical** |

Identical values are an observation, not evidence. PC-1's `VERIFIED` result is **never** copied, inherited, cached or implied for the proposal. The scoreboard must show two rows with separate provenance, ids and replay evidence; a viewer must be able to tell, without reading code, which row a human wrote and which a model produced. The model was given the closed grammar and the trusted facts, so equality with PC-1 may only mean that the grammar leaves few sensible options; the report must not claim the model "found" the fix independently.

**Identity requirement:** today `candidateIdOf(approvedSha, renderedCss)` derives the id from the CSS alone, so the proposal would receive the same candidate id as PC-1. The change must include provenance in the identity (e.g. a provenance tag plus the source run id in the hashed input) so the two never collide, are never de-duplicated into one row, and one cannot overwrite or satisfy the other's evidence.

## 3. Pipeline (each stage fails closed; nothing here may import the inference package)

1. **Load as untrusted data.** Read exactly `.proofpilot/evidence/proposals/<runId>/proposal.json` for an operator-supplied run id matching the run-id grammar; refuse symlinks and non-regular files, files not owned by the user or with group/other permissions, and anything larger than a small fixed bound. Parse JSON strictly. Never `eval`, never import it as code.
2. **Shape and label checks.** Exact allow-listed key set; `schemaVersion` 1; `label` exactly `UNTRUSTED PROPOSAL — NOT VERIFIED`; `provenance` exactly `model-hypothesis`; `status` exactly `PROPOSAL_ACCEPTED`; `providerId` `meta`; `requestedModel` and `respondedModel` exactly `muse-spark-1.3`; lifecycle `completed` with no error / incomplete / refusal; limits equal the approved bounds. Any unknown key, extra nesting or non-primitive value is a refusal, not a warning.
3. **Input binding.** Recompute the input with the certified-evidence loader (`live-input.ts`) for the approved HEAD and compare `inputSha256` byte for byte. A mismatch (different evidence, different revision) refuses.
4. **Strict revalidation.** Rebuild a canonical JSON from `adjustments` only, run it through the same closed-grammar parser (`parseProposal`, V0 to V7) and the patch policy, and require the host-rendered CSS to equal the stored `renderedCss` byte for byte. The stored `renderedCss` is never used as input to staging; only the freshly rendered string is.
5. **Trusted rendering only.** The staged CSS is produced exclusively by the existing host renderer from validated selector / property / value triples, appended with the nonce marker to the baseline `styles.css` of a disposable stage. No model text, no raw file content, no HTML, no JavaScript, no free-form patch ever reaches the stage.
6. **Isolated F01 staging.** One fresh disposable stage per replay via the existing C3-0 runner under the coordinator lock and oracle lock, with the trusted-file hash check and tamper detection unchanged, the network containment already demonstrated by DID-1, and no credential in the environment.
7. **Three fresh Playwright replays.** The unmodified oracle (`verifier/`) runs in three fresh stages with three distinct nonces. `decideVerification` is the only function that can return `VERIFIED`, and only after a certified baseline plus exactly three complete clean passes with finalized, hash-verified evidence (both viewports; the tap received by `add-to-cart`; cart count 1). Any other outcome is reported as it is (`PATCH_FAILED`, `INCONCLUSIVE`, `ORACLE_PASS` without 3 replays, ...). A failure is a legitimate, publishable result.
8. **Exact-SHA evidence.** The run is bound to a clean tree at an approved SHA (certified baseline for exactly that SHA and fixture tree). Evidence is gitignored locally; a sanitized example is the only committed form.
9. **Independent verification.** A separate script (not the coordinator) re-hashes every evidence file, re-derives every replay verdict, re-checks that the served `styles.css` equals baseline + nonce + the freshly rendered rules in every trace, and re-verifies the scoreboard. A scoreboard that does not verify is rejected.
10. **Honest scoreboard.** One row per candidate with provenance, status, replays passed and reasons, including the negative controls, PC-1 and the Muse Spark row. `modelOrProviderCalls` must be 0 for this stage (the stage makes none) and the row must cite the **original** live run (request id, tokens) as provenance data, not as a new call. Never `VERIFIED` without the evidence; never a combined "pass" across provenances.

## 4. Required code changes (to be reviewed, not made here)

- A new **control provenance kind** for stored model proposals, registered by identity per loaded-and-validated artifact object (a module-private registry like the hand-authored one), so a copy, a clone, or a hand-built object is refused. The existing hand-authored identity set and `assertHandAuthoredControls` stay as they are and keep refusing model-derived input on the existing path.
- Provenance in `candidateIdOf` and in the scoreboard schema (separate rows; verified by `verifyScoreboard`).
- A loader module that imports nothing from `packages/inference` network code and calls no provider (static test).
- A command with a fixed, narrow surface: one run id, one approved SHA, no flags selecting another artifact path, provider or model.

## 5. Tests (all offline, no provider)

Loader: every refusal in sections 3.1 to 3.4 (symlink, loose mode, oversize, unknown key, wrong label / provenance / model / status, lifecycle not completed, input-hash mismatch, tampered adjustments, tampered `renderedCss`, extra nested field). Rendering: out-of-grammar values refused even if hand-edited into the artifact. Identity: proposal and PC-1 with identical CSS get different ids and separate rows; evidence of one cannot satisfy the other. Negative controls: a proposal artifact built to be baseline-identical ends `PATCH_FAILED`; one that breaks the desktop control ends `PATCH_FAILED`; stage tamper and busy port stay `INCONCLUSIVE`. Isolation: no network, no credential, no import of inference code. Guard removal on each of the above. The existing C3-B1 results (PC-1 `VERIFIED` 3/3) stay unchanged.

## 6. Outputs

A sanitized scoreboard example for the proposal row and the controls, an execution report appendix (what happened, with the honest status whichever way it falls), and an update of the submission documents. No claim of "model-verified fix" is permitted unless section 3.7 returns `VERIFIED` for the Muse Spark row.

## 7. Explicitly out of scope

Any new Meta, Baseten or Modal request; a second proposal; UI-C3-01; HOST-C3-01; executing HTML, JavaScript or free-form patches; weakening the oracle or the grammar; changing the activation pin, quota or any authorization code.

## 8. Authorization sequence

1. Owner reviews this specification and decides whether to approve C3-B2B (recorded in a reviewable form naming the exact values: the artifact, the approved SHA, three replays, local only).
2. Implementation on a Draft PR with the tests above; hosted CI.
3. **Independent security review** (checklist below) and independent exact-head audit.
4. Owner's separate merge approval.
5. A separate owner-run local execution (the real-browser replays are local only), then independent verification of the saved evidence.

## 9. Independent security review checklist (must pass before any model-derived adjustment executes)

- The only data crossing from the artifact into staging is a validated selector / property / value triple rendered by trusted host constants.
- No path from the artifact to a shell, `eval`, `new Function`, a dynamic import, an HTML or JavaScript sink, or a file path.
- The registry makes a forged or copied candidate object unusable; the hand-authored registry is unchanged.
- The stage, oracle and network containment guarantees are the audited C3-0 / C3-B1 ones; no provider or credential is reachable from this command.
- Provenance is part of the candidate identity and the scoreboard; no cross-provenance reuse of evidence.
- Failure of any check yields a refusal with a typed code, never a partial run.
- The limits of the staging harness (a spike, not a sandbox; dependency integrity detect-only; nonce proof tied to the Playwright 1.64.1 trace format) are restated in the report. Executing anything beyond the closed-grammar CSS still needs the independently verified sandbox that does not exist today.
