# LIVE-C3-01 execution report — the one approved Meta proposal attempt

> **Status: COMPLETED and SPENT.** One real Meta `muse-spark-1.3` request was made under LIVE-C3-01 (owner decision, October 29, 2026: https://github.com/mrdzyn/proofpilot-ai/pull/6#issuecomment-6496850990). The lifetime quota of one attempt is **exhausted**. The result is an **`UNTRUSTED PROPOSAL — NOT VERIFIED`**: it has **not** been run through the browser, the staging runner, the coordinator or the oracle, and nothing in this report says it fixes the defect. No further provider call is authorized.

## 1. Sources and how each fact was established

| Label | Meaning |
|---|---|
| **Verified (artifact)** | read directly from the sanitized local artifact `.proofpilot/evidence/proposals/c3-live-meta-001/proposal.json` (mode `0600`, 1,184 bytes, file SHA-256 `f930eb5c5bd321da42125c0e4713c6e1e9b9b1993d3af3a156de000036985df4`), read-only |
| **Verified (recomputed)** | recomputed read-only from persisted local evidence with the repository's own code; no network, no credential |
| **Verified (GitHub)** | read from GitHub |
| **Operator-reported** | stated by the operator who ran the command; **not** independently observable from the artifact |

The artifact itself is **not committed** (`.proofpilot/` is gitignored); neither are approval records, reservations or any raw provider response. The raw provider text was never stored.

## 2. What happened

| Fact | Value | Basis |
|---|---|---|
| Run ID | `c3-live-meta-001` | Verified (artifact) |
| Provider / requested model | Meta Model API / `muse-spark-1.3` | Verified (artifact: `providerId`, `requestedModel`) |
| Responded model | `muse-spark-1.3` (exact match) | Verified (artifact) |
| Executed at (UTC) | `2026-10-29T17:03:11.420Z` (artifact `createdAt`) | Verified (artifact) |
| Approved repository HEAD | `564c56f59afc8b637dd8814078a98370e5ba2d97` (merge of PR #17, the pin-only commit A2′; PR #17 merged 2026-10-29T16:35:32Z) | Operator-reported; merge commit and time Verified (GitHub). The artifact does not record HEAD |
| Certified F01 baseline | `f01-baseline-20261029T163937Z-402d11`: `gitHead` = `564c56f…`, fixture tree `c76561ac3343cd69a8fc765963c2b79d1d361fc6`, REPRODUCED, desktop control PASS, `certified: true`, clean tree, oracle exit 1 | Verified (recomputed: summary read read-only) |
| Source analysis | `c2b-live-smoke-002` (live C2B analysis; its video `e9df68b1…eafdf` is bound to the certified recording set `f01-20261027T122211Z-df375a`) | Verified (recomputed); passed to the command by the operator |
| Input | 2,756 characters, SHA-256 `4e1466e8adf1ee58b6c050e70f9720da43ddb254b255d4f754f8696a857af558` | Hash Verified (artifact `inputSha256`); **hash and size independently Verified (recomputed)**: `loadCertifiedProposalInput` + `buildProposalRequest` over the persisted evidence at HEAD `564c56f…` yield exactly 2,756 characters and exactly this hash |
| Status | `PROPOSAL_ACCEPTED` (`reason: null`, `forbiddenClass: null`) | Verified (artifact) |
| Provider lifecycle | `status: completed`, `errorCode: null`, `incompleteReason: null`, `refusal: false`, `completed: true` | Verified (artifact) |
| Response ID | `7cb1e5e2-3d88-42ab-9652-fcab88b690d8` | Verified (artifact `requestId`) |
| Usage | input 670, output 630 (of which reasoning 601), total 1,300; `videoFramesProcessed: null` | Verified (artifact); matches the operator-reported figures |
| Limits recorded | `maxInputChars` 12,000, `maxOutputTokens` 3,072 | Verified (artifact) |
| Output size / hash | 90 bytes, SHA-256 `78eebdfb94df58fd5e95a915132d95e210780bd77391d399fda15932737f9cc2` of the raw text (the raw text itself is not stored) | Verified (artifact) |
| Accepted adjustment | exactly one: selector `.promo-overlay`, property `pointer-events`, value `none`; rendered `.promo-overlay{pointer-events:none}` | Verified (artifact) |
| Re-validation | the stored adjustments, re-submitted to the strict closed-grammar parser `parseProposal` today, are accepted and render byte-identical CSS to the stored `renderedCss` | Verified (recomputed). This re-checks the stored fields, not the original raw text (not stored) |
| Reservation | slot 1; settled; lifetime quota exhausted | `slot: 1` Verified (artifact); "settled" and "exhausted" Operator-reported. The reservation and approval records were deliberately **not** opened for this report |
| Retries | none | Operator-reported; consistent with the architecture (retries 0, one call per attempt) |
| Actual billing amount | **UNVERIFIED** | No figure is claimed. Token counts are not a cost; the owner acknowledged that the controls do not cap spend |

## 3. Execution boundaries that held

- **One attempt, no retry, no fallback.** `retries: 0` is hardcoded in the proposal path; the owner command makes at most one call; the lifetime quota was 1 and is spent.
- **Gate order.** The command rebuilt the request from certified evidence (certified baseline for exactly the approved HEAD and fixture tree; a live analysis bound by SHA-256 to a certified recording), required a real TTY, showed the input hash, evaluated the production gate read-only, required the operator approval for the exact run and hash, then the typed confirmation; the runner then validated the credential, consumed the single-use approval and claimed the reservation before the single request. These are the documented gates (`tasks/PP-META-I2-C3-LIVE-01B.md`); the execution itself is operator-run and operator-reported.
- **Credentials.** No AI agent read the credential or the approval records; this report did not open them.
- **Model output stayed data.** It was parsed by the strict parser (V0 to V7), the nested provider metadata were rebuilt from explicit allow-lists, and only the sanitized artifact fields were persisted. The proposal was not staged, rendered into a page, executed or verified.

## 4. Sanitizer and validator outcome

- **Lifecycle and model checks:** passed (explicit `completed`, no error / incomplete / refusal, response model equal to the requested model, non-empty output).
- **Closed-grammar parser:** accepted one adjustment from the allowed selector / property / value set; `forbiddenClass` null.
- **Artifact allow-list:** the saved artifact contains only the allow-listed fields (no raw provider text, no error text, no credential, no unknown nested keys), is labelled `UNTRUSTED PROPOSAL — NOT VERIFIED` with provenance `model-hypothesis`, and has file mode `0600`.

## 5. What this does and does not show

**Shows:** Muse Spark 1.3, through the real Meta Model API and under a fail-closed, single-use authorization chain, returned a schema-valid structured proposal that passed the trusted host-side validator, using 1,300 tokens in total.

**Does not show:**
- that the proposal fixes the defect (it has not run in a browser, in staging, or against the oracle);
- that the model "understood" the defect better than the closed grammar's few options allow. The accepted adjustment is **identical in value to the existing hand-authored control PC-1**, which was verified in C3-B1. Identity of values is an observation, not evidence: PC-1's `VERIFIED` result belongs to the hand-authored control; it is **not** transferred to this proposal, and the two must be reported as separate rows with separate provenance;
- anything about other fixtures, other models or other runs (one run, one fixture);
- the actual cost.

## 6. Limitations

- Single run, single fixture (the synthetic F01 store), closed-grammar CSS only.
- The artifact omits HEAD, baseline run and analysis ids; those come from the operator (HEAD, run ids) or were recomputed from local evidence (hash, size, baseline, sources). Local disk write access defeats any file-based provenance; the independent recomputation lowers but does not remove that risk.
- Hosted CI cannot run the live path or the real-browser staging tests; the live path was exercised only by the owner on one machine.
- The operator-reported items in section 2 should be treated as such until the owner attaches the terminal transcript (not committed, because it is private) or another reviewer re-inspects the local artifacts.

## 7. Consequence for the repository's live eligibility

This documentation PR is a **non-pin-only descendant** of the pinned activation commit A2 (`e6d1f5f03879164f67353e5c4f98da5ce5cccc1a`). By design, the production gate requires HEAD to be the pinned tree and a linear pin-file-only descendant of A2, so once this change is merged the repository is **no longer eligible for any live attempt** (the gate refuses with `REVISION_NOT_APPROVED`). That is consistent with the spent quota and is intentionally **not** repaired here: the pin is not modified, no approval is created, and no bypass is introduced. Any future live attempt needs a new owner decision (a new LIVE-C3 record with a new quota), a new reviewed activation commit and a new pin-only commit.

## 8. Next authorization gates (none is granted by this report)

1. **C3-B2B (verification of the stored proposal):** separate owner approval and an independent security review before any model-derived adjustment is staged or executed; specification: `tasks/PP-META-I2-C3-B2B.md` (draft, NOT APPROVED).
2. **A second Meta call:** needs a new owner decision and quota (the current one is spent).
3. **UI-C3-01 (report UI)** and **HOST-C3-01 (Modal / hosted backend):** NOT APPROVED.
4. **Baseten:** NOT APPROVED; quota 0.
