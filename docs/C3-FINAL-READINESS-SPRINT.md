# C3 Final Readiness Sprint — Specification and Findings (SPECIFICATION ONLY)

- **State:** SPECIFICATION AND READINESS FINDINGS. NOT APPROVED. NOT IMPLEMENTED.
  Nothing here authorizes executing, staging, loading or rendering any
  model-derived adjustment, spending Baseten allowance, or touching the stored
  real proposal. All execution gates stay closed.
- **Base:** `origin/main@b1bb51f` (PR #41 merged).
- **UI design gate:** Not applicable (no user-facing UI change).

## 0. Premise correction (evidence-backed)

The sprint brief states "Real Baseten F01 video analysis: ACCEPTED, but
observations UNVERIFIED." **No such record exists in this repository.**
`docs/UI-C3-02-D9-RUNBOOK.md` §9 records D9-LIVE-V2-QA-01 as
`TRANSPORT_TRUNCATED`, ledger 1 genesis + 1 spend, **2 remaining, 0 accepted
model analyses**; the ledger was not modified by the investigation. No
Baseten-produced correction exists anywhere in-repo to verify. Two
consequences follow: (a) the only actual AI-generated correction available
for end-to-end verification today is the stored Meta proposal
`c3-live-meta-001` (PROPOSAL_ACCEPTED, never executed); (b) if the owner ran
an ACCEPTED Baseten attempt out of band, it must be recorded in the runbook
with ledger evidence before any verification plan may cite it — this
specification does not assume it.

## 1. Capability audit: exists versus missing

| # | Capability | State | Evidence |
|---|---|---|---|
| 1 | F01 certified baseline, reproducible | EXISTS (merged) | `scripts/f01-baseline.ts`; QA-01 runbook; `LIVE-C3-01-EXECUTION-REPORT.md` |
| 2 | Unmodified trusted oracle (both viewports) | EXISTS | C3-B1; PC-1 VERIFIED 3/3 (QA-01 runbook) |
| 3 | Disposable per-replay staging (C3-0) + coordinator locks | EXISTS | `scripts/c3-stage-spike.ts`, `packages/core/src/candidate-coordinator.ts` |
| 4 | 3-replay VERIFIED rule + scoreboard + re-verifier | EXISTS | `scripts/c3-offline-verification.ts`; `verifyScoreboard` |
| 5 | Network containment demonstration (DID-1) | EXISTS (demo only, not a verdict) | `runDid1` in `packages/core/src/containment-demo.ts` |
| 6 | Closed-grammar CSS patch policy | EXISTS | `packages/core` `parseProposal` / `css-adjustments` |
| 7 | Zone P neutral provenance module + import allow-list | EXISTS (P1, merged #19) | `packages/provenance/src/provenance-input.ts`; `tests/security/provenance-boundary.test.ts` |
| 8 | Artifact reader hardening (symlink/ownership/size/instability/binding/rebind) | EXISTS (P2 + SEC-P2-01, merged #20/#23) | `packages/provenance/src/proposal-artifact.ts`; `docs/SEC-P2-01-FINDINGS.md` |
| 9 | Model-proposal registration by provenance-tagged identity | EXISTS (E1, merged #21) | `packages/core/src/model-proposal.ts`; `candidateIdOf(.., 'model-proposal:<runId>')` — identical CSS never collides with PC-1 |
| 10 | Full E2 verify pipeline for synthetic run ids | EXISTS (E2, merged #22, audited) | `scripts/c3-b2b-verify-proposal.ts` refuses only `c3-live-meta-001` before any read |
| 11 | Detached Ed25519 artifact authentication (synthetic) | EXISTS (SEC-P2-02, merged #24) | `packages/provenance/src/artifact-auth.ts`; runbook `docs/SEC-P2-02-ISOLATED-VERIFICATION-RUNBOOK.md` |
| 12 | Hard-disable of the real artifact at CLI + exported verifier | EXISTS, load-bearing | `REAL_ARTIFACT_RUN_ID` refusal precedes every read in both verify commands |
| 13 | **An accepted AI correction staged through the above** | MISSING | QA-01: 0 accepted; `c3-live-meta-001` never run |
| 14 | **Owner execution approval for the real run** | MISSING | Real-proposal procedure §1, precondition 1 |
| 15 | **P2 ancestor-swap risk decision** | MISSING (open) | `docs/SEC-P2-01-FINDINGS.md` §6 |
| 16 | **Historical-artifact enrollment (or recorded cancel)** | MISSING | Isolated-verification runbook §7/§10 |
| 17 | **Independent security review of the enabling HEAD** | MISSING | Precondition 4 |
| 18 | **Reviewed enabling code change (only lifting mechanism)** | MISSING by design | No flag/env/key lifts the disable |
| 19 | Baseten-shaped artifact validation (if a future Baseten correction is used) | MISSING | Current validator is Meta-shaped (`providerId: meta`, `muse-spark-1.3`); Baseten output needs its own reviewed schema + tests |
| 20 | Independently verified Docker/ARM64 or OS sandbox | MISSING (NOT VERIFIED) | Open gate; nothing in-repo claims otherwise |

Net: the **entire verification machine is built and audited**; what is missing
is almost entirely **decisions and one narrow enabling change**, not new
infrastructure. Do not rebuild components.

## 2. Same-UID writer residual: reassessment and minimum boundary

`docs/SEC-P2-01-FINDINGS.md` §3 remains accurate and is not softened here:
statistical checks authenticate path resolution, never content, against a
same-UID writer; the four NOT-detected rows (pre-installed swap, same-path
replacement, size/mtime-restored rewrite, perfectly timed identity-restoring
swap) are one fact. SEC-P2-02 signatures close content substitution **forward
from enrollment only** and explicitly do not cover verifier/trust-root
integrity or pre-enrollment swaps (runbook §§7–8).

**Minimum effective isolation boundary for the real run** (all required,
owner-operated, none in-repo):
1. Protected checkout: verify the exact authorized HEAD from a separate
   trusted machine or signed archive; `git status` clean; `rev-parse HEAD = V`.
2. Single-writer window: no other same-UID process writes under the repo or
   evidence dir during the run (stale-lock/stage-root protocol, two
   observations a minute apart; any doubt → stop).
3. Evidence hygiene: evidence tree not world-writable; output only under
   namespaced `MODEL-<runId>-<stamp>/`.

**Recommended (not minimum):** run verification as a separate standard user
owning the evidence tree with the checkout read-only to it, or verify from a
read-only snapshot (runbook §3.4). Any claim stronger than the above —
"hardened reader stops a same-UID writer", "staging is a sandbox" — is
rejected in advance and must fail review.

## 3. Bounded C3 completion specification (Option A: stored proposal, zero new inference)

**Path:** verify the already-stored `c3-live-meta-001` (`PROPOSAL_ACCEPTED`,
`.promo-overlay { pointer-events: none }`) through the existing E2 pipeline
after preconditions 14–18 (§1) are met. Zero provider calls, zero spend, zero
new artifacts to validate (Meta-shaped schema already implemented and tested).

**Exact allowed files (enabling change; reviewed PR only):**
- `scripts/c3-b2b-verify-proposal.ts`: replace the unconditional real-id
  refusal with a gate that requires the five exact parameters of the
  real-proposal procedure §2 **plus** paths to the recorded owner approval
  and enrollment record, verified read-only before any artifact read.
  No other flag, no mode switch, no alternate artifact path.
- `config/artifact-trust-roots.json`: enrollment of the historical key
  **only** via the runbook §7 procedure (re-derived source evidence +
  explicit owner authorization naming key id and artifact hash). If the
  source cannot be re-established, no enrollment happens and the run is
  cancelled — never enroll on suspicion.
- Nothing else: no oracle, grammar, coordinator, scoreboard, activation,
  quota, credential or network change. Any diff outside these two files
  fails review.

**Acceptance tests (all offline except the single owner-run real replay):**
- Refusal drill still passes on the unmodified build (HARD-DISABLED, exit 2,
  no evidence) — proves the gate is reached, not bypassed.
- Enabling gate tests: wrong/missing approval or enrollment record refuses
  before any artifact read; guard-removal (delete the approval check) is
  caught by test.
- Full pipeline on synthetic fixtures stays green (existing E2 suites).
- The one owner-run real execution: exit 0 with `VERIFIED` **only** on
  certified baseline + exactly three fresh disposable-stage replays, distinct
  nonces, both viewports, finalized hash-verified evidence, automatic
  persisted-bundle revalidation clean. Any other outcome (including
  `ORACLE_PASS` without 3 replays) is reported as-is; a failure is a
  legitimate publishable result, never re-run with altered parameters.
- Independent re-verification from the persisted bytes only, never terminal
  output. Scoreboard shows the model row with `model-proposal:c3-live-meta-001`
  identity, separate from PC-1; no transferred verdict language anywhere.

**Security requirements:** §2 boundary (prerequisites 1–3 minimum, 4
recommended) performed and recorded; independent security review of the exact
enabling HEAD per the C3-B2B checklist (spec §9) passes first; the five
preconditions (§1 rows 14–18) are recorded out of band with exact values.

**STOP / rollback:** any refusal or non-VERIFIED verdict ends the procedure —
file the outcome, return to the owner, no parameter alteration, no re-chase.
Interrupted runs are inconclusive by definition; keep evidence untouched.
Locks: stale-lock protocol only. Rollback = revert the two files; the
disable is restored by deletion, and the refusal drill re-passes.

**Option B (rejected for this window):** spend a remaining Baseten attempt
for a fresh F01 correction, then verify it. Requires owner spend
authorization **plus** new Baseten-artifact validation code and tests (§1
row 19) **plus** the same five preconditions adapted — strictly more code,
more review, and consumes irreplaceable allowance. Defer unless Option A
returns a publishable negative (proposal does not fix F01) and the owner
explicitly prefers a second model opinion over the recorded finding.

## 4. What is demonstrable offline versus what needs human authorization

| Demonstrable offline today (no approval) | Needs explicit human authorization |
|---|---|
| Full verifier pipeline to VERIFIED on hand-authored PC-1 (3/3 replays) | Executing/staging/loading `c3-live-meta-001` in any form |
| Full pipeline to refusal/VERIFIED on synthetic model-proposal fixtures | Any provider inference or retry (Baseten allowance: 2 left, on hold) |
| Auth-gate, boundary, adversarial suites (unit + security + CI) | Historical-artifact enrollment (or recorded cancel) |
| DID-1 containment demo; scoreboard re-verification | P2 ancestor-swap risk acceptance (options: separate-UID/snapshot, or single-writer trust) |
| Refusal drill proving the hard disable is load-bearing | Merge of the enabling change; the verification run itself |

## 5. Fastest implementation sequence (reuse, no rebuild)

1. Owner records decisions D-R1 (execution approval naming V/S/tree/analysis/key-h
...[truncated 1587 chars]