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

## B. Owner actions and decisions still required (none done)

| # | Item | Owner | State |
|---|---|---|---|
| B1 | Independent exact-head audit PASS and merge of C3-B2A | owner | pending |
| B2 | Decide whether to approve LIVE-C3-01 and record exact values (section 4 of the decision record) | owner | NOT APPROVED |
| B3 | Provide the Meta key through the secure store for a single invocation; never to an agent, chat or file | owner | not done |
| B4 | Check the Meta account's credit balance and rates yourself; a balance is not permission | owner | not done |
| B5 | Approve the per-run operator approval design (who approves, where the audit record lives) | owner | not designed in code |
| B6 | Approve a reviewed code change that enables the entry point behind that approval and the approved quota | owner + independent audit | not written |
| B7 | Decide separately whether accepted proposals may be staged and verified (C3-B2B) | owner | NOT APPROVED |

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
