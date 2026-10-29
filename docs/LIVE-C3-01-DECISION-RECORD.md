# LIVE-C3-01 decision record — **APPROVED by the repository owner for activation preparation (October 29, 2026)**

> **Owner decision (authoritative):** https://github.com/mrdzyn/proofpilot-ai/pull/6#issuecomment-6496850990 — posted by the repository owner (`mrdzyn`) on October 29, 2026, 12:36:38 UTC. The values in section 1 are the approved values; nothing is added to them.
>
> **What this approval is NOT:** it is not authorization to make a provider request now. The activation implementation is pending independent review; the activation revision pin is NOT RECORDED; the real provider invocation is NOT AUTHORIZED YET. A real attempt may occur only after the activation implementation passes an independent exact-head audit, receives a separate merge approval, is merged and revision-pinned in a separate reviewed pin-only commit, and the owner completes the operator preflight and the per-run confirmation. **A credit balance is not permission to spend.** The token and attempt limits do not guarantee a monetary cost ceiling (acknowledged by the owner).
>
> **Not approved (unchanged):** Baseten or Modal calls, additional attempts, automated retries, staging or execution of model-generated CSS, C3-B2B verification, the report UI (UI-C3-01), hosting or deployment (HOST-C3-01).

## Status summary

| Item | State |
|---|---|
| LIVE-C3-01 owner decision | **APPROVED** for activation preparation (see the linked comment) |
| Activation implementation (C3-LIVE-01B) | pending independent review |
| Activation revision pin (`config/live-activation.json`) | **NOT RECORDED** (`activation: null`) |
| Real provider invocation | **NOT AUTHORIZED YET** |
| C3-B2B, UI-C3-01, HOST-C3-01 | NOT APPROVED |

## Owner comment, quoted verbatim

> ## Owner Decision — LIVE-C3-01
>
> **Decision: APPROVED**
> **Date:** October 29, 2026
> **Scope:** ProofPilot AI — First Meta Muse Spark CSS Proposal
>
> I approve LIVE-C3-01 under these exact conditions:
>
> - **Provider:** Meta Model API only (`api.meta.ai`).
> - **Model:** `muse-spark-1.3`, exact identifier.
> - **Maximum billable attempts:** 1 total.
> - **Maximum input:** 12,000 characters.
> - **Maximum output:** 3,072 tokens, including reasoning.
> - **Request:** Text-only, strict JSON schema, low reasoning effort.
> - **Retries and fallback:** None.
> - **Timeout, failure or uncertain completion:** Permanently consumes the attempt.
> - **Operator authorization:** Mandatory, single-use, bound to the exact run ID, request hash and approved repository revision.
> - **Credential:** Securely injected for the single owner-operated invocation; never exposed to AI agents or committed to Git.
>
> I acknowledge that the token and attempt limits do not guarantee a monetary cost ceiling.
>
> This approval authorizes preparation and independent review of the C3-LIVE-01B activation implementation. The actual billable attempt may occur only after the activation implementation passes independent audit, receives separate merge approval, is merged and revision-pinned, and I complete the required operator preflight and per-run confirmation.
>
> **Not approved:** Baseten or Modal calls, additional attempts, automated retries, staging or execution of model-generated CSS, C3-B2B verification, report UI, hosting or deployment.
>
> No provider call is authorized during implementation, testing or CI.

## 1. Approved scope (the owner approved these values on October 29, 2026; the notes are implementation facts)

| Term | Approved value | Notes |
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

- [x] C3-B2A merged after an independent exact-head audit PASS (PR #10).
- [ ] `docs/META-ACTIVATION-CHECKLIST.md` completed, with the zero-network preflight output attached.
- [x] (C3-LIVE-01A, pending its audit) The per-run operator approval capture, fail-closed validator and `config/live-authorization.json` register exist as mock-tested code; the register is EMPTY.
- [ ] A reviewed code change (C3-LIVE-01B, see `tasks/PP-META-I2-C3-LIVE-01B.md`; pending independent review) that (a) is based on the approval capture, (b) enables the proposal entry point only behind that approval and the quota in this record, and (c) leaves model-derived proposals disconnected from execution. That change and the quota constant are a separate PR with its own audit.
- [x] The owner recorded the approval below with exact values (October 29, 2026).

## 4. Approval register (owner-only)

Two machine-read owner files exist. `config/live-authorization.json` (the decision) holds exactly one non-synthetic LIVE-C3-01 entry recorded from the owner comment below. `config/live-activation.json` (the pinned activation revision, a tree digest excluding itself; sequence in `tasks/PP-META-I2-C3-LIVE-01A.md`) is **EMPTY (`activation: null`)** and stays empty until a separate reviewed pin-only commit after the activation PR is merged. A live attempt needs both, plus a per-run operator approval made at the pinned revision, a clean tree and a credential. No operator approval has been recorded.

| Decision | Approved by / date / link | Exact values approved |
|---|---|---|
| LIVE-C3-01 (Meta, `muse-spark-1.3`) | APPROVED by the repository owner, October 29, 2026 — https://github.com/mrdzyn/proofpilot-ai/pull/6#issuecomment-6496850990 | Meta Model API only (`api.meta.ai`); exact model `muse-spark-1.3`; **1** billable attempt in total; input <= 12,000 characters; output <= 3,072 tokens including reasoning; text only, strict JSON schema, low reasoning effort; no retries, no fallback; timeout, failure or uncertain completion permanently consumes the attempt; mandatory single-use operator authorization bound to the exact run ID, request hash and approved repository revision; credential injected securely for the single owner-operated invocation, never exposed to AI agents or committed |
| Per-run operator approval design (C3-LIVE-01A implementation) | _none recorded_ (the design is implemented as code and covered by the decision above only as a requirement) | _none_ |
| Evaluation of accepted proposals (C3-B2B) | _none recorded_ — NOT APPROVED | _none_ |
| Activation revision pin | NOT RECORDED | `activation: null` |

## 5. What this record does not do

It does not by itself enable live inference (the activation implementation, the revision pin, the operator approval and the credential are separate gates), approve spending beyond one attempt, approve Modal or any hosted backend (HOST-C3-01), approve the report UI (UI-C3-01), or allow a model-generated proposal to be staged or run.

## 6. Baseten (optional comparison provider)

Baseten would need its own record (its quota is 0) after the owner-run discovery in `docs/BASETEN-COMPATIBILITY-PLAN.md` (stages B0 and B1) has been executed, and after the structured-output question there is settled. It is out of scope here and its quota is also frozen at 0.
