# PP-META-I2-C3-LIVE-01B-PREP — dormant production integration for the first Meta proposal

- **State:** Implemented on a Draft PR; independent exact-head review pending.
- **Base:** protected `main` at `939c2be4c3cd40301aa86618183312df7f645501` (C3-LIVE-01B0, PR #12).
- **Working branch:** `phase/pp-meta-i2-c3-live01b-prep`
- **Parent contracts:** `tasks/PP-META-I2-C3.md`, `tasks/PP-META-I2-C3-LIVE-01A.md`, `tasks/PP-META-I2-C3-LIVE-01B0.md`.
- **Implementation agent:** Claude Code; independent reviewer: GPT-6; owner: repository owner.

> **THIS IS NOT AUTHORIZATION FOR LIVE INFERENCE AND ACTIVATES NOTHING.** LIVE-C3-01, C3-LIVE-01B, C3-B2B, UI-C3-01 and HOST-C3-01 remain NOT APPROVED. Everything added here is dormant: unreachable from the public production entry point, with no CLI.

## Objective

Build and independently validate the production wiring a future approved attempt needs (the dormant `runProductionProposalAttempt`), so the later activation PR contains only the owner's decision, the quota change, the guarded entry point and the owner-run CLI.

## Delivery mode

UI design gate: Not applicable. Backend/tooling only.

## Allowed scope

`packages/inference/src/proposal-orchestrator.ts` (production runner beside the synthetic one, shared private tail), `meta-proposal-transport.ts` (new), two fixed-location helpers in `live-gate.ts`, tests, and the docs listed in the PR.

## Forbidden scope (unchanged)

Any Meta, Baseten or Modal request; reading a real credential; a genuine operator approval or owner decision; `APPROVED_LIVE_QUOTA` other than `{ meta: 0, baseten: 0 }`; any content in `config/live-authorization.json` or `config/live-activation.json`; changing `proposeCandidate()`; an executable live CLI; executing or staging model-derived CSS; changes to `verifier/`, `fixtures/`, `config/patch-policy.json`, the grammar, `candidate-stage.ts`, the coordinator, CI workflows; the report UI; deployment; merging.

## What exists after this task

`runProductionProposalAttempt({ runId, request })` in `proposal-orchestrator.ts`, in this fixed order:

1. Credential-free pre-flight: `readMetaProposalDescriptor()` (`loadProviderConfig('meta', env, { readApiKey: false })` never touches the key field), the consent shape the runner builds itself, the pinned model, input hash and bounds, the billable flag.
2. `authorizeProductionAttempt` (read-only). With today's empty register, empty pin and quota 0 the runner stops here with `LIVE_NOT_APPROVED`, before any credential is read or any provider is built.
3. `openMetaProposalCall()` reads the key and builds the provider (`maxRetries: 0`); it makes no request. A missing or malformed key fails here, **before** the approval is consumed, so nothing is spent.
4. `prepareProductionAttempt` (never `prepareAttemptCore`, never a synthetic context): consume the single-use approval, re-check, claim the reservation.
5. The shared, module-private tail (`finishAttempt`, also used by the synthetic runner): exactly one `structuredResponse` call, `processProposalResponse` (explicit completed status, exact model, strict V0–V7 parser, nested-metadata sanitizers), a sanitized `UNTRUSTED PROPOSAL — NOT VERIFIED` artifact under the fixed private `.proofpilot/evidence/`, best-effort settlement, STOP.

The runner accepts exactly two inputs (run id, bounded request). It has no parameter for a provider, transport, key, root, store, Git probe, clock, evidence directory or consent; everything else is derived by `live-gate.ts` (`productionEvidenceRoot`, `settleProductionAttempt`, the trust context) or fixed in `meta-proposal-transport.ts`. Nothing imports the runner; the package index does not export it; there is no script that calls it.

## Why the transport and runner are shaped this way

- **No dependency-injection backdoor.** The synthetic runner takes a synthetic context and a data-only scripted transport and refuses anything else; the production runner takes neither. The production path is tested by running the *unmodified* production code from a throwaway copy of `packages/` and `config/` in its own Git repository (`tests/security/live01b-prep-install-copy.test.ts`), whose register, pin and quota-of-1 exist only in that copy. The Meta endpoint there is a mock `fetch` in a child process.
- **One call site.** `meta-proposal-transport.ts` is the only production file that calls `provider.structuredResponse` (the 01B0 rule "no production file calls it" became "exactly one, this one"; `proposal-boundary.test.ts` pins the file name). Only the runner imports it.
- **Credential timing.** The key is read after read-only authorization and before consumption. If a key is missing the operator fixes it and re-runs with the same approval, nothing spent.

## Test-suite changes to existing tests (strengthened or retargeted, none weakened)

- `live01a-boundary`: the importers of `live-gate.ts` gain `proposal-orchestrator.ts`.
- `live01b0-boundary`: the exported-name list gains `runProductionProposalAttempt`/`ProductionProposalAttempt`; the title no longer says "no production runner exists".
- `proposal-boundary`: the single allowed `structuredResponse` call site is now named instead of "none".

## Failure and outcome coverage through the real production path

Success; HTTP 500, network error, timeout, incomplete, wrong model, malformed text, out-of-grammar/blocked CSS, unexpected nested usage metadata: each one request (retries configured to 2 are ignored), approval consumed and reservation `CLAIMED` at call time, no raw text or key stored, a second run refused `APPROVAL_SPENT`, a new run refused `QUOTA_EXHAUSTED`. Settlement failure (claim stays `CLAIMED`, spent); artifact write failure (adjustments dropped, still settled). Refusals with no request and nothing reserved: no approval, expired, other input, other repository revision, other activation revision, synthetic approval, synthetic register decision, dirty tree, a non-pin-only commit after the pin, missing key (approval left unspent), billable flag off, model override, quota 0. Caller-supplied roots, stores, quota, clock, provider, call and consent are ignored.

## Activation plan (documentation only; NOT applied; not pre-authorized)

Each step needs its own owner action and, where stated, its own review. This PR implements none of them.

1. The owner records LIVE-C3-01 with the exact approved values in `docs/LIVE-C3-01-DECISION-RECORD.md` (section 4) and, in the activation PR, as one entry in `config/live-authorization.json` (no `synthetic` field).
2. A separately reviewed activation PR: `APPROVED_LIVE_QUOTA` `{ meta: 0 }` → `{ meta: 1 }`; `proposeCandidate()` delegating only to `runProductionProposalAttempt` (every refusal test kept; "always disabled" becomes "disabled unless every gate passes"); the owner-operated single-call CLI `scripts/c3-live-proposal.ts` (TTY required, builds the request from a validated Symptom and the trusted F01 facts, one attempt, no loop, no retry, no model or limit flags, never prints the key); tests updated.
3. Independent GPT-6 exact-head audit of that PR.
4. Explicit owner-approved merge produces the activation commit **A**.
5. A separate reviewed pin-only commit **A'** records A and its digest (`node scripts/c3-activation-digest.ts <A>`) in `config/live-activation.json`.
6. The owner, on a clean checkout of A', runs the zero-network preflight and confirms the input hash.
7. The owner creates the interactive, single-use run approval (`scripts/c3-approve-live-run.ts`, 10 minutes).
8. The owner injects the Meta credential for that one invocation from the secure store; agents never read it.
9. One request. A timeout, network error or uncertain result permanently spends the attempt; nothing is retried regardless of outcome and no further call is implied.

## Acceptance

1. Orchestration, production-path, authorization and security suites pass; hosted CI passes.
2. Guard-removal testing on the production/synthetic isolation, the order of operations and the one-call boundary; every removed check is caught.
3. Zero provider requests, no credential read, quota 0, empty register and pin, `proposeCandidate()` disabled, F01 baseline and C3-B1 `VERIFIED` unchanged.
