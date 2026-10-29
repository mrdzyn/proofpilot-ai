# LIVE-C3-01 decision record — PROPOSED, **NOT APPROVED**

> **Status: NOT APPROVED.** Nothing in this document authorizes a provider request, a spend, or the evaluation of a model-generated proposal. It is a draft for the owner to edit, accept or reject. Until the approval register below is filled in by the owner in a reviewable form **and** a separate reviewed commit changes the code, `APPROVED_LIVE_QUOTA` stays `{meta: 0, baseten: 0}` and `proposeCandidate()` stays hard-disabled. **A credit balance is not permission to spend.** A chat "yes" is not relied on (see `tasks/PP-META-I2-C3.md`, "What counts as approval").

## 1. Proposed scope (all values are proposals until the owner records them)

| Term | Proposed value | Notes |
|---|---|---|
| Provider | **Meta Model API only** (`https://api.meta.ai/v1`, host-allowlisted) | Muse Spark 1.3 is the primary hackathon model. Baseten needs its own record (see section 6). |
| Model | **`muse-spark-1.3`**, exact | No alias, prefix, suffix, contributor variant or fallback. The response `model` must equal it byte for byte. |
| Endpoint and mode | One `POST /v1/responses`, structured `text.format` json_schema, `reasoning.effort` low | Text only: no tools, no web, no files, no video re-upload. |
| Maximum number of billable attempts | **1** for the first run; any higher number needs a new record naming the exact number | The quota is a total across all runs, never per day or "as needed". Failed or uncertain attempts are spent. |
| Input bound | at most **12,000** characters (`PROPOSAL_LIMITS.maxInputChars`) | Built only by `buildProposalRequest` from a validated `Symptom` and trusted F01 observations. |
| Output bound | at most **3,072** output tokens including reasoning (`PROPOSAL_LIMITS.maxOutputTokens`) | A token cap is not a currency cap. |
| Per-run operator approval | **Required for every attempt**: a person approves this run id, provider, model and input SHA-256 in an audit record before the claim | Implemented in C3-LIVE-01A as mock-tested code only: a gitignored `.proofpilot/approvals/<runId>.json` written by an interactive TTY command (`scripts/c3-approve-live-run.ts`), recording a **self-declared** name, timestamp, run id, provider, model, input hash, repository SHA, bounds and a 10-minute expiry; single use. It is not authenticated identity and cannot replace the register below. `createProposalConsent` only has the shape of consent and proves nothing about a person. |
| Credential handling | The key comes from the owner's secure store (for example 1Password) injected into the process environment **for that one invocation**; it is never written to a file, a log, an artifact, chat or Git, and agents do not read it | Only a boolean presence check is allowed, and only when the owner authorizes it. |
| Unique reservation ids | One run id per attempt, validated by `isValidRunId`, claimed under the lock together with one quota slot **before** the call; never reused or recycled | Proposed naming: `c3-live-meta-001`. Orphan slots are reported, never recycled. |
| Retries and fallback | **No retries. No fallback model. No second attempt after a failure.** | `retries: 0` is hardcoded in the proposal path. |
| Response validation | Explicit `status: "completed"`, no error / incomplete_details / refusal, exact response model, non-empty output, then the strict parser V0 to V7 | Anything else is a failed attempt. |
| Evidence and usage | A gitignored `UNTRUSTED PROPOSAL — NOT VERIFIED` artifact with hashes, request id, sanitized usage and lifecycle; **no raw provider response is stored** | Actual cost is whatever the account reports; any figure in the repo is illustrative. |
| Evaluation of the proposal | **None automatic.** An accepted proposal is data. Running it through the staging runner and the three-replay verifier needs a separate, reviewable authorization (C3-B2B) and a reviewed change to the coordinator | Today the offline coordinator refuses every control that is not an in-code hand-authored control. |

## 2. Stop conditions (any one stops the activation; none is retried automatically)

1. The preflight (`scripts/c3-proposal-preflight.ts`) reports any technical blocker, or its input hash differs from the one the operator approved.
2. The operator approval for this run id is missing, mismatched or older than the agreed window.
3. The credential is absent, malformed, or would have to be read or printed by an agent.
4. The pinned model is not exactly `muse-spark-1.3`, the working tree is dirty, or the reviewed commit is not the approved head.
5. The reservation claim fails (spent run id, exhausted quota, lock unavailable).
6. The provider returns any non-completed lifecycle, an error, a refusal, a different model, an empty or invalid answer, or exceeds a bound.
7. A timeout or network error (an uncertain outcome: the attempt is spent; report it and stop).
8. Anything unexpected in the evidence (hash mismatch, artifact write failure).

After any stop the run id and slot stay spent and a **new** decision is needed for any further attempt.

## 3. Prerequisites before this record can even be considered ready

- [ ] C3-B2A merged after an independent exact-head audit PASS.
- [ ] `docs/META-ACTIVATION-CHECKLIST.md` completed, with the zero-network preflight output attached.
- [x] (C3-LIVE-01A, pending its audit) The per-run operator approval capture, fail-closed validator and `config/live-authorization.json` register exist as mock-tested code; the register is EMPTY.
- [ ] A reviewed code change (C3-LIVE-01B, see `tasks/PP-META-I2-C3-LIVE-01A.md`) that (a) is based on the approval capture, (b) enables the proposal entry point only behind that approval and the quota in this record, and (c) leaves model-derived proposals disconnected from execution. That change and the quota constant are a separate PR with its own audit.
- [ ] The owner records the approval below with exact values.

## 4. Approval register (owner-only; empty)

| Decision | Approved by / date / link | Exact values approved |
|---|---|---|
| LIVE-C3-01 (Meta, `muse-spark-1.3`) | _none recorded_ | _none_ |
| Per-run operator approval design (C3-LIVE-01A implementation) | _none recorded_ | _none_ |
| Evaluation of accepted proposals (C3-B2B) | _none recorded_ | _none_ |

## 5. What this record does not do

It does not enable live inference, raise any quota, approve spending, approve Modal or any hosted backend (HOST-C3-01), approve the report UI (UI-C3-01), or allow a model-generated proposal to be staged or run.

## 6. Baseten (optional comparison provider)

Baseten would need its own record after the owner-run discovery in `docs/BASETEN-COMPATIBILITY-PLAN.md` (stages B0 and B1) has been executed, and after the structured-output question there is settled. It is out of scope here and its quota is also frozen at 0.
