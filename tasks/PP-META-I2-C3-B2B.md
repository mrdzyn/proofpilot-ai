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

## 3. Architecture: two zones with a data-only bridge

The pipeline has two zones that must not be confused. The earlier draft forbade importing the inference package everywhere while also requiring its provenance loader; that was inconsistent and is replaced by the following.

- **Zone P: provenance validation (read-only, zero-network).** Everything that reads the stored artifact and re-derives the source evidence. It may read local files and run read-only Git queries. It may not import or reach anything that can use a network, a provider or a credential, may not read environment variables, may not spawn processes other than the existing read-only Git probe, and may not write anywhere except its own sanitized report. The audited logic it needs already exists as `loadCertifiedBaselineFacts` / `loadCertifiedProposalInput` in `packages/inference/src/live-input.ts`, but that file cannot simply be imported into this path **as it stands**: its transitive import closure includes `patch-proposal.ts` (which contains `persistProposalArtifact`, i.e. file writes, imports `config.ts` and `reservations.ts` with its file-mutating store, and holds the lazy `import()` of the production runner behind `proposeCandidate`). A "no network capability" claim cannot be made over that closure. **The specification therefore requires a reviewed extraction** (a separate, audited, behaviour-preserving change made before any of this runs): the pure, read-only provenance functions (the certified-baseline and certified-input loaders, `trustedFactsFromBaseline`, `buildProposalRequest`, and the new artifact validator) move into a neutral read-only module whose complete transitive import set is an explicit allow-list: `node:fs/promises` read functions, `node:path`, `node:crypto`, the `packages/core` parsers and the intake run-id check, and nothing else. A static test asserts that allow-list over the transitive closure (including dynamic `import()` calls), and equivalence tests prove the existing live path (`live-input.ts`, the owner command) is unchanged. Until that extraction is reviewed and merged, no part of this pipeline may run.
- **Zone E: execution (staging and coordinator).** `candidate-stage.ts`, `candidate-coordinator.ts` and the oracle. This zone imports nothing from `packages/inference` (today's static tests already assert it) and gains no provider, credential or network capability.
- **The bridge is data only.** Zone P produces a frozen plain object: the validated selector / property / value triples plus provenance labels (strings and numbers). Zone E accepts it only through a narrow registration function that **re-validates the triples with the grammar that already lives in `packages/core`** (`parseProposal`, `css-adjustments`, the patch policy) and registers the resulting control by identity. Zone E therefore never has to trust Zone P's judgement, and Zone P never gains execution power.

### 3.1 Load the artifact as untrusted data (Zone P)
Read exactly `.proofpilot/evidence/proposals/<runId>/proposal.json` for an operator-supplied run id matching the run-id grammar. Refuse symlinks and non-regular files, a file not owned by the current user or readable by group/other, and a file larger than a small fixed bound (8 KiB). Parse strictly as JSON; never `eval` or import it; reject duplicate keys and `__proto__` / `constructor` / `prototype` keys.

### 3.2 Exact allow-listed validation (nested structures are legitimate; unexpected ones are not)
The artifact legitimately contains nested objects and an array. Validation is a closed schema, mirroring the actual `ProposalArtifact`; anything outside it is refused with a typed code:

| Field | Required shape |
|---|---|
| top level | exactly these keys, no others: `schemaVersion`, `label`, `provenance`, `runId`, `providerId`, `requestedModel`, `respondedModel`, `inputSha256`, `outputSha256`, `outputBytes`, `status`, `reason`, `forbiddenClass`, `adjustments`, `renderedCss`, `requestId`, `usage`, `lifecycle`, `limits`, `slot`, `createdAt` |
| `schemaVersion` | the integer 1 |
| `label` | exactly `UNTRUSTED PROPOSAL — NOT VERIFIED` |
| `provenance` | exactly `model-hypothesis` |
| `runId` | run-id grammar; equals the requested run id |
| `providerId`, `requestedModel`, `respondedModel` | exactly `meta`, `muse-spark-1.3`, `muse-spark-1.3` |
| `inputSha256`, `outputSha256` | 64 lowercase hex (`outputSha256` may be null) |
| `outputBytes` | integer 0 to 2,048, or null |
| `status`, `reason`, `forbiddenClass` | `status` exactly `PROPOSAL_ACCEPTED`; `reason` null; `forbiddenClass` null |
| `adjustments` | an array of 1 to the patch-policy maximum entries; **each entry an object with exactly `selector`, `property`, `value`**, each a bounded string that is valid under the closed grammar; no other keys, no nesting inside entries |
| `renderedCss` | a bounded string equal byte for byte to what the host renderer produces from `adjustments` (checked in 3.4) |
| `requestId` | string matching the request-id grammar (at most 100 characters), or null |
| `usage` | an object with exactly `inputTokens`, `outputTokens`, `totalTokens`, `reasoningTokens`, `videoFramesProcessed`, each a non-negative safe integer at most 1,000,000,000 or null |
| `lifecycle` | an object with exactly `status`, `errorCode`, `incompleteReason`, `refusal`, `completed`; `status` exactly `completed`; `errorCode` and `incompleteReason` null; `refusal` false; `completed` true |
| `limits` | an object with exactly `maxInputChars` = 12000 and `maxOutputTokens` = 3072 |
| `slot` | an integer at least 1 |
| `createdAt` | an ISO-8601 UTC timestamp |

Maximum nesting depth is 3. Any unknown key at any level, any wrong type, an array where an object is required (or the reverse), a non-finite number, or a string over its bound is a refusal, **not** a warning. The tests (section 5) must use the real sanitized artifact shape, not an invented one.

### 3.3 Trust anchors: two different revisions, never conflated
The artifact does **not** record the repository revision it was produced at, and the stored file is not cryptographically bound to the run. This specification therefore does not invent such a binding.

**Anchor 1 (source revision of the original LIVE-C3-01 proposal).**
- *Claimed source:* approved HEAD `564c56f59afc8b637dd8814078a98370e5ba2d97` (the pin-only commit A2′), certified baseline `f01-baseline-20261029T163937Z-402d11`, source analysis `c2b-live-smoke-002`, recording set `f01-20261027T122211Z-df375a`, fixture tree `c76561ac3343cd69a8fc765963c2b79d1d361fc6`, input SHA-256 `4e1466e8adf1ee58b6c050e70f9720da43ddb254b255d4f754f8696a857af558` (2,756 characters). The approved HEAD is **operator-reported** (corroborated, not proven, by the GitHub merge commit and time, and by the recomputation below). The owner's private approval record (which binds the HEAD) may be attached out of band; this specification does not read it.
- *What can be checked:* with **explicit parameters** (`head` = the claimed source SHA, `fixtureTree` = the tree recorded by that baseline), Zone P recomputes the original input from the archived certified evidence and requires it to equal the artifact's `inputSha256`. It must **not** use the verification checkout's HEAD as the source revision. It also checks that the source commit exists locally and is an ancestor of the verification revision, that the baseline summary names that commit and tree, and that every baseline artifact hash still matches. A match proves that the *input the artifact answers* is the one this evidence produces; it does not prove which machine or revision ran the request.

**Anchor 2 (verification revision of C3-B2B).**
- The future implementation HEAD **V**: a clean checkout, a fresh certified F01 baseline for exactly V, and the three fresh replays staged from V. The verdict is bound to V.
- **Oracle and fixture immutability between the two anchors:** the fixture tree (`fixtures/sample-store`), the trusted `verifier/` files and the patch policy at V must equal those at the source SHA (compared by Git tree / blob ids and by the staged trusted-file manifest). If they differ, the run refuses; a changed oracle is a different experiment and needs its own approval.
- **What a `VERIFIED` result then means:** "the host-rendered CSS of the stored proposal passes the unmodified F01 oracle in three fresh replays at revision V, for a fixture and oracle identical to those the proposal was generated against". It does not mean "verified at A2′", and it says nothing about the model.

The scoreboard row records both anchors and their provenance class: *source revision* (operator-reported, corroborated by recomputation), *input hash* (recomputed), *artifact* (hash of the file, local), *baseline and replays* (new evidence at V). Nothing in a row may be presented as stronger than its class.

### 3.4 Strict revalidation and trusted rendering (Zone P to Zone E)
Rebuild a canonical JSON from `adjustments` only and run it through `parseProposal` (V0 to V7) and the patch policy; require the freshly host-rendered CSS to equal the stored `renderedCss` byte for byte. Only the freshly rendered string is ever used downstream: appended with the nonce marker to the baseline `styles.css` of a disposable stage. No model text, no raw file content, no HTML, no JavaScript and no free-form patch reaches the stage.

### 3.5 Isolated staging and three fresh replays (Zone E)
One fresh disposable stage per replay via the existing C3-0 runner under the coordinator and oracle locks, with the trusted-file hash check, tamper detection and the network containment demonstrated by DID-1, and no credential in the environment. The unmodified oracle runs in three fresh stages with three distinct nonces; `decideVerification` is the only function that can return `VERIFIED`, and only after a certified baseline plus exactly three complete clean passes with finalized, hash-verified evidence (both viewports; the tap received by `add-to-cart`; cart count 1). Any other outcome is reported as it is (`PATCH_FAILED`, `INCONCLUSIVE`, `ORACLE_PASS` without 3 replays, ...). A failure is a legitimate, publishable result.

### 3.6 Exact-SHA evidence, independent verification, honest scoreboard
- Evidence is bound to the clean verification revision V; it is gitignored locally and only a sanitized example may be committed.
- A separate script (not the coordinator) re-hashes every evidence file, re-derives every replay verdict, re-checks that the served `styles.css` equals baseline + nonce + the freshly rendered rules in every trace, and re-verifies the scoreboard. A scoreboard that does not verify is rejected.
- One row per candidate with provenance, status, replays passed and reasons, including the negative controls, PC-1 and the Muse Spark row. `modelOrProviderCalls` is 0 for this stage; the Muse Spark row cites the **original** live run (request id, tokens) as provenance data, never as a new call. Never `VERIFIED` without the evidence; never a combined "pass" across provenances.

## 4. Required code changes (to be reviewed, not made here)

- **Zone P:** the reviewed, behaviour-preserving extraction of the pure provenance functions into a neutral read-only module with an allow-listed transitive import set (section 3), then the artifact validator (section 3.2) and the source-provenance check (section 3.3) in that module. The existing `live-input.ts` and owner command keep working unchanged on top of it (equivalence tests).
- **Zone E:** a narrow registration function in `packages/core` that accepts plain triples plus labels, re-validates them with the core grammar, and registers a new **control provenance kind** for stored model proposals by identity (a module-private registry like the hand-authored one), so a copy, a clone or a hand-built object is refused. The existing hand-authored identity set and `assertHandAuthoredControls` stay as they are and keep refusing model-derived input on the existing path.
- Provenance in `candidateIdOf` and in the scoreboard schema (separate rows; verified by `verifyScoreboard`).
- A command with a fixed, narrow surface: one run id, the claimed source SHA and the verification SHA as explicit, displayed parameters, no flags selecting another artifact path, provider or model.

## 5. Tests (all offline, no provider)

- **Artifact schema (Zone P):** a positive fixture with the **real sanitized artifact shape** (the same keys, nested `adjustments` array, `usage`, `lifecycle` and `limits` objects; the real file stays local, so the fixture is regenerated from the same shape), and negative cases: every refusal in section 3.2 (unknown key at top level and in each nested object, missing key, wrong type, array vs object swap, extra field inside an `adjustments` entry, an out-of-grammar value, oversize file, symlink, loose mode, duplicate key, `__proto__`, wrong label / provenance / model / status, lifecycle not completed, `limits` not equal to the approved bounds, tampered `renderedCss`).
- **Anchors:** the input recomputed with explicit source parameters equals `inputSha256`; a mismatching artifact refuses; using the verification checkout's HEAD as the source is a test failure; a changed fixture tree, verifier file or patch policy between anchors refuses; the scoreboard row labels the provenance classes and never calls operator-reported data "verified".
- **Boundary:** a static test over the complete transitive import set of Zone P, including dynamic `import()` (exactly the allow-list of section 3: no network, provider, credential, environment or process capability, no file writes) and of Zone E (no inference import); equivalence tests for the extraction; the registration function refuses forged and copied controls.
- **Identity:** the proposal and PC-1 with identical CSS get different ids and separate rows; the evidence of one cannot satisfy the other.
- **Controls:** a proposal artifact built to be baseline-identical ends `PATCH_FAILED`; one that breaks the desktop control ends `PATCH_FAILED`; stage tamper and busy port stay `INCONCLUSIVE`. The existing C3-B1 results (PC-1 `VERIFIED` 3/3) stay unchanged.
- Guard removal on each of the above.

## 6. Outputs

A sanitized scoreboard example for the proposal row and the controls, an execution report appendix (what happened, with the honest status whichever way it falls), and an update of the submission documents. No claim of "model-verified fix" is permitted unless section 3.5 returns `VERIFIED` for the Muse Spark row.

## 7. Explicitly out of scope

Any new Meta, Baseten or Modal request; a second proposal; UI-C3-01; HOST-C3-01; executing HTML, JavaScript or free-form patches; weakening the oracle or the grammar; changing the activation pin, quota or any authorization code.

## 8. Authorization sequence

1. Owner reviews this specification and decides whether to approve C3-B2B (recorded in a reviewable form naming the exact values: the artifact, the claimed source SHA, the verification SHA, three replays, local only).
2. Implementation on a Draft PR with the tests above; hosted CI.
3. **Independent security review** (checklist below) and independent exact-head audit.
4. Owner's separate merge approval.
5. A separate owner-run local execution (the real-browser replays are local only), then independent verification of the saved evidence.

## 9. Independent security review checklist (must pass before any model-derived adjustment executes)

- The only data crossing from the artifact into staging is a validated selector / property / value triple, re-validated by the core grammar and rendered by trusted host constants; Zone P (read-only, zero-network, import-allow-listed) and Zone E (no inference import) stay separate.
- The source revision is never taken from the verification checkout; operator-reported metadata is labelled as such; oracle and fixture immutability between the anchors is checked.
- No path from the artifact to a shell, `eval`, `new Function`, a dynamic import, an HTML or JavaScript sink, or a file path.
- The registry makes a forged or copied candidate object unusable; the hand-authored registry is unchanged.
- The stage, oracle and network containment guarantees are the audited C3-0 / C3-B1 ones; no provider or credential is reachable from this command.
- Provenance is part of the candidate identity and the scoreboard; no cross-provenance reuse of evidence.
- Failure of any check yields a refusal with a typed code, never a partial run.
- The limits of the staging harness (a spike, not a sandbox; dependency integrity detect-only; nonce proof tied to the Playwright 1.64.1 trace format) are restated in the report. Executing anything beyond the closed-grammar CSS still needs the independently verified sandbox that does not exist today.
