# Meta Muse Spark activation readiness checklist (C3-B2A)

> Preparation only. Ticking boxes here does not approve anything: LIVE-C3-01 is **NOT APPROVED** (`docs/LIVE-C3-01-DECISION-RECORD.md`), the live quota is a frozen code constant of `0`, and `proposeCandidate()` is hard-disabled.

## A. Verified in C3-B2A by zero-network tests (mocks only)

| # | Requirement | Evidence |
|---|---|---|
| A1 | Exact model `muse-spark-1.3`; any other id refused (including `-contributor`, `-preview`, `1.2`) | `expectedProposalModel`, preflight `model-pinned` and `model-mismatch-refused`; unit tests |
| A2 | Strict JSON proposal schema derived from the renderer tables; closed CSS grammar; V0 to V7 parser | C3-A parser tests (all contract vectors) |
| A3 | Explicit `status: "completed"` required; error, incomplete_details, refusal and any other status refused | Provider layer and `processProposalResponse`; preflight `response-*-cannot-advance` |
| A4 | Response model must equal the request byte for byte | `MODEL_MISMATCH` path; preflight |
| A5 | No automatic retries (`retries: 0` hardcoded, configured retries ignored) | Adapter tests with `MAX_RETRIES=2` |
| A6 | Per-run consent bound to run, provider and input hash; missing or foreign consent refused | `preflightProposal`; preflight `missing-consent-refused`, `foreign-consent-refused` |
| A7 | Billable gate required at run time | preflight `billable-gate-refused` |
| A8 | Input and output bounds; tampered or oversize requests refused | preflight `request-bounded`, `tampered-request-refused` |
| A9 | Single-use run ids and quota slots; spent slots never recycled; orphan slots listed read-only | reservation tests; preflight `duplicate-run-refused`, `exhausted-quota-refused`, `quota-zero-refused` |
| A10 | Sanitized artifact, no raw provider response, label `UNTRUSTED PROPOSAL — NOT VERIFIED` | adapter tests; preflight report holds no model text |
| A11 | Production entry point rejects before reading its argument; live quota frozen at 0 | security tests; preflight `entry-point-hard-disabled`, `live-quota-frozen-at-zero` |
| A12 | Model-derived proposals cannot enter the C3-B1 execution path | `assertHandAuthoredControls` identity guard (frozen, registered controls only); static import checks |
| A13 | Zero provider requests from the preflight, whatever the environment | global fetch trap; no fetch or provider code in the module |

Run it yourself (no network, no secrets read): `node scripts/c3-proposal-preflight.ts --provider meta`. Add `--check-credentials` only when you authorize a presence check (prints present or NOT SET, never the value).

## A2. Added in C3-LIVE-01A (synthetic/mock tests only; none of this is an authorization)

| # | Requirement | Evidence |
|---|---|---|
| A14 | Per-run operator approval is interactive-only, exact-phrase, self-declared, expiring (10 min), single use | `tests/unit/live-approval.test.ts` (CLI tests) |
| A15 | Private records: gitignored, 0700/0600, exclusive atomic creation, symlink/hard-link/traversal/permission refusals | same file, file-attack test |
| A16 | Fail-closed validator binds provider, model, input hash, repository SHA, clean tree, expiry, spent state and reservation | same file, refusal table; guard-removal run |
| A17 | Approval is consumed before the reservation is claimed, state re-checked in between, crashes never release anything | same file, concurrency/crash/TOCTOU tests |
| A18 | Repository register and activation pin are EMPTY; production validator returns `LIVE_NOT_APPROVED` | `tests/security/live01a-boundary.test.ts`; `node scripts/c3-live-rehearsal.ts` |
| A22 | The proposal orchestration (preflight, authorize/consume/claim, ONE scripted response, strict validation, sanitized artifact, settle, STOP) works end to end with synthetic trust and scripted responses only; every failure outcome is spent, never retried, stores no raw text | `tests/unit/proposal-orchestrator.test.ts` (C3-LIVE-01B0) |
| A23 | The orchestrator refuses production contexts and non-scripted transports; there is no production runner; `proposeCandidate()` stays disabled | `tests/security/live01b0-boundary.test.ts` |
| A19 | Production API derives root, register, pin, Git state, directories and quota internally; fake roots, forged probes, synthetic approvals and simulated quotas cannot authorize | `tests/unit/live-approval.test.ts` (MAJOR-1), `tests/security/live01a-boundary.test.ts` |
| A20 | HEAD must be the owner-pinned activation revision AND a pin-only linear descendant of the activation commit; unauthorized newer clean commits, including same-tree empty/revert-recommit commits, are rejected identically by the CLI and validator | same, real-Git tests (MAJOR-2, incl. residual) |
| A21 | `.proofpilot` parent and repo directory must be self-owned, non-group/other-writable real directories | same (MINOR-3) |

## B. Owner actions and decisions still required (none done)

| # | Item | Owner | State |
|---|---|---|---|
| B1 | Independent exact-head audit PASS and merge of C3-B2A | owner | pending |
| B2 | Decide whether to approve LIVE-C3-01 and record exact values (section 4 of the decision record) | owner | NOT APPROVED |
| B3 | Provide the Meta key through the secure store for a single invocation; never to an agent, chat or file | owner | not done |
| B4 | Check the Meta account's credit balance and rates yourself; a balance is not permission | owner | not done |
| B5 | Approve the per-run operator approval design (who approves, where the audit record lives) | owner | implemented as mock-tested code in C3-LIVE-01A; NOT approved |
| B6 | Approve a reviewed code change that enables the entry point behind that approval and the approved quota | owner + independent audit | not written |
| B7 | Decide separately whether accepted proposals may be staged and verified (C3-B2B) | owner | NOT APPROVED |

## C0. C3-LIVE-01B precise checklist (all unchecked; none started)

The orchestration it needs is built and mock-tested in C3-LIVE-01B0; the exact activation diff (register entry, quota 0 → 1, `runProductionProposalAttempt` through `prepareProductionAttempt`, `proposeCandidate` delegating behind the gate, an owner-run single-call runner) is in `tasks/PP-META-I2-C3-LIVE-01B0.md` and is NOT applied.

- [ ] C3-LIVE-01A merged after an independent PASS.
- [ ] Owner records the LIVE-C3-01 decision (provider Meta, model `muse-spark-1.3`, max 1 billable attempt, input ≤ 12,000 characters, output ≤ 3,072 tokens including reasoning, 0 retries, no fallback, text only, per-run approval mandatory, uncertain results spend the attempt).
- [ ] 01B PR: register entry (commit A after merge); `APPROVED_LIVE_QUOTA.meta` 0 → 1; `proposeCandidate` wired as authorize → prepareAttempt → one call → process → persist → settle; tests updated; no change to staging, coordinator, oracle or grammar. Independent exact-head audit PASS and merge.
- [ ] Owner runs `node scripts/c3-activation-digest.ts <A>` and records A and the digest in `config/live-activation.json` in a separate reviewed pin-only commit A' (production and the CLI accept only a HEAD whose digest, pin file excluded, equals the pinned one AND whose history from A is linear, pin-file-only commits; any other commit, including an empty or revert/recommit descendant, is rejected; to re-pin, add another reviewed pin-only commit, or merge a reviewed new activation commit A2 and then a pin-only commit naming it).
- [ ] Fresh checkout at A', clean tree; zero-network preflight JSON kept.
- [ ] Owner runs `node scripts/c3-approve-live-run.ts` in a real terminal for the run id and input hash and types the exact phrase (valid 10 minutes).
- [ ] Owner injects the Meta key for that one invocation from the secure store; agents never read it.
- [ ] Run once; stop. Any further attempt needs a new decision. A credit balance is not permission to spend.

## C. Activation sequence (for the future, each step gated)

1. Clean tree at the approved head; run the preflight again and keep its JSON.
2. Operator approval captured for run id, provider, model and input hash.
3. Key injected for this one invocation; nothing printed.
4. One reservation claim, one request, no retries, one artifact.
5. Stop. Report status, lifecycle, request id, sanitized usage and the validation outcome.
6. No evaluation of the proposal without its own authorization.

## D. Known unknowns (not testable without a live call)

- Whether Meta accepts `text.format` json_schema together with `reasoning.effort: low` on a text-only request exactly as the mocks assume (it did for the C2B video call, which had an `input_file`).
- Whether the model's real answer fits the 2,048-byte parser limit and the closed grammar often enough to be useful.
- Actual cost and rate limits.
