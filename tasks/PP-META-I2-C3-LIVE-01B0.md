# PP-META-I2-C3-LIVE-01B0 — Meta proposal integration, mock-only

- **State:** Implemented on a Draft PR; independent exact-head review pending.
- **Base:** protected `main` at `5e9b73c0a412c9546bfd8026f63224af75f5afc3` (C3-LIVE-01A, PR #11, squash-merged after an independent PASS).
- **Working branch:** `phase/pp-meta-i2-c3-live01b0-proposal-integration`
- **Parent contracts:** `tasks/PP-META-I2-C3.md`, `tasks/PP-META-I2-C3-LIVE-01A.md`.
- **Implementation agent:** Claude Code; independent reviewer: GPT-6; owner: repository owner.

> **THIS IS NOT AUTHORIZATION FOR LIVE INFERENCE.** LIVE-C3-01, C3-LIVE-01B, C3-B2B, UI-C3-01 and HOST-C3-01 remain NOT APPROVED.

## Objective

Complete and test, with synthetic responses only, the orchestration of one future Meta Muse Spark 1.3 proposal attempt, preserving every production authorization gate, so a later separately approved C3-LIVE-01B change only has to wire the production gate to the owner-run single call.

## Delivery mode

UI design gate: Not applicable. Backend/tooling only.

## Allowed scope

`packages/inference/src/proposal-orchestrator.ts` (new), the rehearsal refactored to use it (`live-rehearsal.ts`), tests, and the docs listed in the PR.

## Forbidden scope

Any Meta, Baseten or Modal request; reading a real credential; a genuine operator approval; a positive `APPROVED_LIVE_QUOTA`; a LIVE-C3-01 decision or activation pin; enabling `proposeCandidate()`; any production runner that combines `prepareProductionAttempt` with a model call; executing or staging model-derived CSS; changes to `verifier/`, `fixtures/`, `config/patch-policy.json`, the patch grammar, `candidate-stage.ts`, the coordinator, CI workflows; the report UI; deployment; merging.

## What exists after this task

`runSyntheticProposalAttempt` (proposal-orchestrator.ts), in this fixed order:

1. `preflightProposal` (pure): consent shape, pinned model, billable gate, request hash and bounds. A refusal here consumes and reserves nothing.
2. `prepareAttemptCore` on a **synthetic** `TrustContext`: authorize, consume the approval (exclusive create), re-check, claim run id + quota slot.
3. **One** request through a **scripted transport** with the exact contract: model `muse-spark-1.3`, `maxOutputTokens` 3072, strict JSON schema from `proposalJsonSchema()`, input at most 12,000 characters. No retry, no fallback, no second outcome is ever consumed.
4. `processProposalResponse`: explicit `status: "completed"`, no error/incomplete/refusal, exact response model, non-empty output, then the closed-grammar parser (V0 to V7).
5. `persistProposalArtifact`: a private (0700/0600) `UNTRUSTED PROPOSAL — NOT VERIFIED` artifact with only sanitized fields (run id, provider/model, input and output hashes, sanitized request id, usage, lifecycle, status and reason as typed codes, host-validated adjustments only when accepted). Raw provider text and exception messages are never stored. A write failure becomes `ARTIFACT_WRITE_FAILED` and drops the adjustments.
6. `store.settle` (best effort). A failed settlement leaves the claim `CLAIMED` and spent, never released.
7. STOP. Nothing stages, runs or verifies the proposal; no `VERIFIED` value exists in the module.

Isolation: the runner throws before doing anything unless the context is synthetic and the transport is a `scriptedTransport` (a closure over canned data: a response, an error to throw, or a simulated crash; no fetch, no environment, no credential). The shared tail `finishAttempt` is module-private so it cannot be driven with an arbitrary function and an unchecked reservation. The module is not exported from the package index and is imported only by the synthetic rehearsal. `proposeCandidate()` is unchanged and still rejects before reading its argument. There is no production runner in this task, and a security test fails if any module combines `prepareProductionAttempt` with a model call.

## Failure matrix (all tested with scripted outcomes)

Incomplete, refusal, missing lifecycle status, provider error status, wrong response model, empty output, malformed JSON, forbidden content, out-of-grammar CSS, unknown key, provider timeout, transport error, unexpected exception (with secret-looking text), artifact persistence failure, settlement failure (false and thrown), duplicate run id, expired approval, missing approval, approval for another input, consumed approval, quota exhausted, zero quota, pre-flight refusals (missing/foreign consent, wrong model, billable off, tampered request, malformed run id), production context, look-alike transports, and crashes at: before consumption (nothing spent, safe to re-run), after the claim and before the call, during the call (uncertain completion), after the response before recording, after recording before settlement, and after consuming the approval but before the claim (stranded, listed read-only). Once a claim exists the attempt is spent in every case.

## Exact C3-LIVE-01B activation diff (PROPOSED; NOT APPLIED; not pre-authorized)

A later, separately owner-approved PR with its own independent exact-head audit would do exactly the following and nothing else. **Do not apply any of this in the present task.**

1. `config/live-authorization.json`: add one LIVE-C3-01 decision (approver, date, reference to the owner's recorded decision; Meta, `muse-spark-1.3`, 1 attempt, 12,000 characters, 3,072 tokens; no `synthetic` field).
2. `packages/inference/src/reservations.ts`: `APPROVED_LIVE_QUOTA` `{ meta: 0, baseten: 0 }` → `{ meta: 1, baseten: 0 }`.
3. `packages/inference/src/proposal-orchestrator.ts`: add `runProductionProposalAttempt({ runId, request, consent, provider, evidenceRoot })` that (a) calls `preflightProposal`, (b) calls `prepareProductionAttempt` from `live-gate.ts` (**never** `prepareAttemptCore` or a synthetic context), (c) refuses unless `prepared.authorized.synthetic === false`, (d) makes the single call with `provider.structuredResponse` (the existing Meta adapter, `retries: 0`) and (e) runs the unchanged private `finishAttempt` tail. No transport, store, root, clock or probe parameters.
4. `packages/inference/src/patch-proposal.ts`: `proposeCandidate` stops being unconditionally disabled and delegates only to `runProductionProposalAttempt`; every refusal test is kept and "always disabled" becomes "disabled unless every gate passes".
5. A new owner-operated runner `scripts/c3-live-proposal.ts`: builds the request from a validated Symptom and the trusted F01 facts, requires a TTY, reads the Meta key only from the environment of that one invocation (never from a file; never printed), makes one attempt and exits. No loop, no retry, no flag that selects another model or raises a limit.
6. Tests: the existing refusal suites stay; add production-gate wiring tests with mocks only.
7. Merge of that reviewed activation commit **A**; then, after the owner computes `node scripts/c3-activation-digest.ts <A>`, a separate reviewed **pin-only commit A'** records A and the digest in `config/live-activation.json`.
8. Owner-side, in this order, on a clean checkout of A': the zero-network preflight; `scripts/c3-approve-live-run.ts` in a real terminal with the exact confirmation phrase (10-minute, single-use, self-declared approval); the key injected for that single invocation; run once.
9. One Meta request is permitted. A timeout, network failure or uncertain result permanently spends the attempt; nothing is retried and no further call is implied. A new attempt needs a new owner decision, a new run id and a new approval.

## Acceptance

1. Orchestration, authorization and security suites pass with mocks only; hosted CI passes.
2. Guard-removal testing around the request, approval, reservation, persistence and no-network boundaries; every removed check is caught, except redundant defence in depth listed individually.
3. Zero provider requests; no credential read; quota 0; `proposeCandidate()` disabled; register and pin empty; PC-1 three-replay and F01 baseline unchanged.
