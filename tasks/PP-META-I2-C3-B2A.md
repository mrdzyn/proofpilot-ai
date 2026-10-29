# PP-META-I2-C3-B2A — Pre-live readiness for the first bounded Muse Spark CSS proposal

- **State:** Implemented on a Draft PR; independent exact-head review pending.
- **Base:** protected `main` at `4d4a26b2c5969f0330f6e75411e58f037f2b08ed` (C3-B1, PR #9 squash-merged after an independent PASS).
- **Working branch:** `phase/pp-meta-i2-c3-b2a-prelive-readiness`
- **Parent contract:** `tasks/PP-META-I2-C3.md` (SEC-C3-01 approved and bounded; LIVE-C3-01, UI-C3-01 and HOST-C3-01 NOT approved).
- **Implementation agent:** Claude Code; independent reviewer: GPT-6; owner: repository owner.

## Objective

Prepare, test and document everything needed to run the first bounded, real Muse Spark 1.3 CSS proposal **after explicit owner approval**, without making any provider request, raising any quota, enabling the production proposal entry point, or running any model-generated candidate.

## Delivery mode

UI design gate: Not applicable (no user-facing UI). Backend/tooling/documentation only.

## Allowed scope

`packages/inference/src/proposal-readiness.ts`, `packages/inference/src/baseten-discovery.ts` (prepared, owner-run), `packages/core/src/candidate-coordinator.ts` (one guard only), `scripts/c3-proposal-preflight.ts`, `scripts/baseten-model-discovery.ts`, tests, and the docs listed below.

## Forbidden scope

Any Meta, Baseten or Modal request; any Modal resource, token or billing activity; raising `APPROVED_LIVE_QUOTA`; enabling `proposeCandidate()`; connecting model-derived adjustments to staging or the coordinator; changes to `verifier/`, `fixtures/`, `config/patch-policy.json`, CI workflows or the C3-0 runner; the report UI; deployment.

## Deliverables and acceptance

| # | Deliverable | Evidence |
|---|---|---|
| 1 | Deterministic zero-network preflight (`scripts/c3-proposal-preflight.ts`, `runProposalPreflight`) using only mock literals; reports `NOT_AUTHORIZED_TECHNICALLY_READY` or `TECHNICAL_BLOCKERS`, never an authorization | unit tests: determinism, zero requests under a fetch trap, every unsafe path refused, credential presence boolean only when asked |
| 2 | Guard: the offline coordinator refuses any control that is not an in-code hand-authored control, before any lock, stage or browser | security test with a model-derived control through `parseProposal` |
| 3 | Documented future pathway (below) | this file |
| 4 | Baseten: single-request owner-run discovery procedure (dry run by default, `--execute` needs `PROOFPILOT_ALLOW_PROVIDER_DISCOVERY=1`, retries forced to 0, prints no secret, never substitutes the public alias) and updated findings | `docs/BASETEN-COMPATIBILITY-PLAN.md`; unit tests with a mock fetch; the real script is only ever run as a dry run here |
| 5 | `docs/LIVE-C3-01-DECISION-RECORD.md`, explicitly NOT APPROVED, and `docs/META-ACTIVATION-CHECKLIST.md` | security test asserts the NOT APPROVED wording and required terms |
| 6 | Modal feasibility updated from current official documentation (not independently tested) | `docs/MODAL-FEASIBILITY-PROPOSAL.md` |
| 7 | STATUS, SECURITY, TESTING and the handoff `PP-META-I2-C3-B2A-A1` updated; stale pointers (PR #9 merged, `main` at `4d4a26b`) corrected | diff |

## Planned pathway from a proposal to a verdict (not connected in C3-B2A)

```text
validated Symptom + trusted F01 observations      (C2B Symptom parser; C1/C3-0 oracle observations)
  -> bounded request (buildProposalRequest)        (C3-A; deterministic, <= 12,000 chars)
  -> ONE structured call, no retries               (C3-A adapter pieces; entry point DISABLED until LIVE-C3-01)
  -> strict parser V0..V7                           (C3-A; PATCH_REJECTED / SECURITY_BLOCKED / accepted)
  -> accepted or rejected UNTRUSTED PROPOSAL artifact (hashes only; no raw provider text)
  -> [GATE C3-B2B: separate owner authorization + reviewed code change]  <- NOT in this milestone
  -> candidate staging of the host-rendered CSS     (C3-0 runner, unchanged)
  -> trusted oracle, fresh stage per replay         (C3-0 / C3-B1)
  -> three fresh replays                            (C3-B1 decideVerification: the only source of VERIFIED)
  -> evidence-backed verdict + verifyScoreboard     (C3-B1)
```

The gate marked C3-B2B is enforced in code today: `runOfflineVerification` calls `assertHandAuthoredControls` first and refuses any control that is not byte-for-byte one of `HAND_AUTHORED_CONTROLS`. Moving a model proposal across that line needs (1) an owner-recorded authorization naming the exact scope, (2) a reviewed change to this guard and the control inventory, (3) a new provenance label so a model-derived candidate can never be recorded as `hand-authored-control`, and (4) an independent audit. `VERIFIED` semantics (reproduced baseline, exactly three fresh consistent replays) do not change.

## Validation

Targeted unit and security tests; `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:security`; the existing real-browser regressions (`pnpm test:integration`, `node scripts/c3-offline-verification.ts`, `pnpm f01:baseline`, `pnpm test:e2e:f01` exit 1 by design); hosted CI.

## Stop conditions

Stop and report if any step would need a provider, Modal or credential access; if a quota constant would have to change; or if the coordinator guard cannot be added without altering `VERIFIED` semantics.

## Completion handoff

`docs/HANDOFFS.md` entry `PP-META-I2-C3-B2A-A1`; `docs/STATUS.md` `Active handoff` points to it.
