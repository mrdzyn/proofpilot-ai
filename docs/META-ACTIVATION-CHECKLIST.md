# Meta Muse Spark activation readiness checklist (C3-B2A)

> Preparation only. Ticking boxes here does not approve anything. LIVE-C3-01 is **APPROVED for activation preparation** (owner, October 29, 2026; `docs/LIVE-C3-01-DECISION-RECORD.md`), but the **real provider invocation is NOT AUTHORIZED YET**: the activation implementation is pending independent review, the activation revision pin is **NOT RECORDED** (`config/live-activation.json` is `activation: null`, which alone refuses every request), and a real operator approval and credential do not exist. The Meta quota constant is `1` (lifetime total) and `proposeCandidate()` only delegates to the gated runner. Sections A to A22 below record what each earlier milestone verified at the time.

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
| A23 | The orchestrator synthetic runner refuses production contexts and non-scripted transports; `proposeCandidate()` stays disabled | `tests/security/live01b0-boundary.test.ts` |
| A25 | C3-LIVE-01B: the owner decision is recorded (one non-synthetic register entry), the Meta quota is 1 (lifetime), `proposeCandidate()` delegates only to the audited runner, and the EMPTY activation pin alone still prevents any request; the owner CLI builds its input only from re-verified certified evidence and makes at most one call | `tests/security/live01b-prep-install-copy.test.ts`, `tests/unit/live-input.test.ts`, `tests/unit/live-proposal-cli.test.ts`, `tests/security/live01b-activation-boundary.test.ts` |
| A24 | The dormant production proposal runner (pre-flight, read-only production authorization, provider/credential, consume + claim, one request, shared tail) works end to end from a throwaway install copy with a mock `fetch`; with the real repository it stops at authorization before any credential is read; no CLI, no importer | `tests/security/live01b-prep-install-copy.test.ts`, `tests/unit/proposal-production.test.ts`, `tests/security/live01b-prep-boundary.test.ts` (C3-LIVE-01B-PREP) |
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

## C0. C3-LIVE-01B precise checklist

State: LIVE-C3-01 **APPROVED for activation preparation** by the owner on October 29, 2026 (https://github.com/mrdzyn/proofpilot-ai/pull/6#issuecomment-6496850990). Activation implementation: pending independent review (Draft PR). Activation revision pin: **NOT RECORDED**. Real provider invocation: **NOT AUTHORIZED YET**. C3-B2B, UI-C3-01 and HOST-C3-01: NOT APPROVED.

- [x] C3-LIVE-01A, C3-LIVE-01B0 and C3-LIVE-01B-PREP merged after independent PASS (PRs #11, #12, #13).
- [x] Owner recorded the LIVE-C3-01 decision (Meta only, `api.meta.ai`, `muse-spark-1.3`, 1 attempt in total, input <= 12,000 characters, output <= 3,072 tokens including reasoning, text only, strict JSON, low reasoning, no retries, no fallback, uncertain results spend the attempt, mandatory single-use operator authorization).
- [ ] C3-LIVE-01B Draft PR: independent GPT-6 exact-head audit PASS.
- [ ] Owner separately approves the squash merge; the merge is the activation commit **A**.
- [ ] Owner runs `node scripts/c3-activation-digest.ts <A>` and records A and the digest in `config/live-activation.json` in a separate reviewed **pin-only** commit **A'** (production and the CLI accept only a HEAD whose digest, pin file excluded, equals the pinned one AND whose history from A is linear, pin-file-only commits).
- [ ] Independent verification of A'; fresh clean checkout of A'.
- [ ] On that checkout: `pnpm f01:baseline` (certified evidence for exactly this HEAD), then `node scripts/c3-live-proposal.ts --analysis <live C2B analysis id> --preflight` (zero network); confirm the displayed input SHA-256 and character count; keep the output.
- [ ] Owner runs `node scripts/c3-approve-live-run.ts --run-id c3-live-meta-001 --input-sha256 <hash> --input-chars <n>` in a real terminal and types the exact phrase (valid 10 minutes, single use).
- [ ] Owner injects the Meta key for that one invocation from the secure store; agents never read it.
- [ ] Owner separately authorizes execution of one request, then runs `node scripts/c3-live-proposal.ts --analysis <id>` and types the exact confirmation phrase.
- [ ] Record the sanitized outcome and stop. Any further attempt needs a new decision. A credit balance is not permission to spend.

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
