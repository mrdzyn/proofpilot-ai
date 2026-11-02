# C3 Final Readiness Sprint — Specification and Findings (SPECIFICATION ONLY)

- **State:** SPECIFICATION AND READINESS FINDINGS. NOT APPROVED. NOT IMPLEMENTED.
  Nothing here authorizes executing, staging, loading or rendering any
  model-derived adjustment, spending Baseten allowance, or touching the stored
  real proposal. All execution gates stay closed.
- **Base:** `origin/main@b1bb51f` (PR #41 merged).
- **UI design gate:** Not applicable (no user-facing UI change).

## 0. Owner-reported Attempt 2, reconciled with PR #42 (evidence-backed)

The sprint brief states "Real Baseten F01 video analysis: ACCEPTED, but
observations UNVERIFIED." The pinned `main` runbook (§9) records only the
first QA-01 attempt (`TRANSPORT_TRUNCATED`, 1 spend, **2 remaining, 0
accepted**) — that is the **pre-Attempt-2 repository snapshot**, retained as
such, not the current blanket status. The owner has since reported a second,
successful attempt, recorded in **open, unmerged, unaudited Draft PR #42**
(runbook §10 there): Attempt 2 at the 2048 cap returned an **accepted** F01
analysis (run local-2026-11-02-001, `LIVE VIA BASETEN — UNVERIFIED`),
provider-claimed usage 1631 / 1309 / 2940. Three boundaries are preserved:

- **Owner-reported, not ledger-confirmed.** The post-success second spend
  has not been independently read back from the owner's ledger (PR #42 §10
  states this openly). UI testimony of "2 sends / 1 attempt left" is
  owner-reported until the §5 reconciliation is performed. This spec cites PR
  #42 as the testimony source and duplicates none of its record; if PR #42
  merges first, a follow-up reconciles the snapshot language here.
- **Accepted observation, not an AI-generated correction.** Attempt 2
  produced untrusted visual analysis text (two taps seen, cart 0) — PR #42
  itself states it is "not a fix." A *correction* for C3 purposes means an
  executable adjustment artifact (selector/property/value triples under the
  closed grammar). No Baseten-produced correction exists anywhere to verify.
- **Consequence:** the only actual AI-generated correction available for
  end-to-end verification today remains the stored Meta proposal
  `c3-live-meta-001` (PROPOSAL_ACCEPTED, never executed) — Option A below.
  Attempt 2 strengthens the demo story (the model reads F01 usefully) but
  does not supply a verifiable correction and authorizes no further send.

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
`.promo-overlay { pointer-events: none }`) through the existing **authenticated**
E2 pipeline after preconditions 14–18 (§1) are met. Zero provider calls, zero
spend, zero new artifacts to validate (Meta-shaped schema already implemented
and tested). The legacy unauthenticated command
`scripts/c3-b2b-verify-proposal.ts` is **not** the enabling vehicle: it never
consults the trust roots, so admitting the real id there would bypass the
detached-signature binding even with an enrolled key. Option A uses
`scripts/c3-b2b-verify-authenticated.ts`, which verifies the Ed25519 manifest
against the pinned `config/artifact-trust-roots.json` **before** source
registration or staging.

**Exact allowed files (enabling change; separate reviewed implementation PR only):**
- `scripts/c3-b2b-verify-authenticated.ts`: replace the unconditional real-id
  refusal with an authorization-bound gate — the real id proceeds **only**
  when (a) the detached manifest verifies against the pinned trust roots,
  (b) the five existing CLI values (run id, source SHA, fixture tree,
  analysis id, verification SHA) exactly match the manifest's bound fields
  and the recorded owner approval, and (c) the checks complete before any
  artifact read. No new flags, no approval-path flags, no mode switch, no
  alternate artifact path: the five existing values, cross-checked against
  the enrolled signed binding, **are** the authorization. Anything unrelated
  refuses with a typed code before any read.
- `packages/core/src/model-verification.ts`: narrowly extend the exported
  `verifyRegisteredProposal` hard-disable so the real id is admitted **only**
  for proposals registered through the authenticated registration path
  (module-private authorized set populated solely by the manifest-verified
  flow). Default-deny is preserved at this boundary independently of the CLI:
  a direct programmatic call with the real id and no authenticated
  registration still throws `REAL_ARTIFACT_DISABLED`. No environment flag,
  no credential, no generic bypass, no unguarded removal of the core gate.
- `config/artifact-trust-roots.json`: enrollment of the historical key
  **only** via the isolated-verification runbook §7 procedure (re-derived
  source evidence + explicit owner authorization naming key id and artifact
  hash). If the source cannot be re-established, no enrollment happens and
  the run is cancelled — never enroll on suspicion.
- Precisely scoped tests (exact files, same implementation PR):
  - `tests/unit/c3-real-authorization.test.ts` — absent/malformed approval
    values, manifest/approval mismatch, and approval absent entirely all
    refuse before any artifact read; no-read-before-auth proven by asserting
    no evidence directory and no stage is created.
  - `tests/unit/c3-real-authentication.test.ts` — tampered/replayed
    manifest, unknown key id, substituted trust roots, and altered bound
    fields refuse at the auth gate with named codes (extends the existing
    SEC-P2-02 battery to the real-id path without touching synthetic suites).
  - `tests/security/c3-real-bypass.test.ts` — a direct call to exported
    `verifyRegisteredProposal` with the real id and no authenticated
    registration throws `REAL_ARTIFACT_DISABLED`; guard-removal mutants
    (delete the CLI auth check; delete the core authorized-set check) are
    caught; default-deny callers and no-bypass internal routes verified.
  - `tests/integration/c3-real-refusal.test.ts` — end-to-end refusal drill
    on the exact-command surface: real id without complete
    auth+approval+enrollment exits 2 with zero evidence and zero stage.
- Nothing else: no oracle, grammar, coordinator, scoreboard, activation,
  quota, credential or network change; existing synthetic suites stay intact
  and green. Any diff outside the files above fails review.

**Acceptance tests (all offline except the single owner-run real replay):**
- Refusal drill still passes on the unmodified build (HARD-DISABLED, exit 2,
  no evidence) — proves the gate is reached, not bypassed.
- New gate tests above green on the enabling HEAD, including the direct-call
  bypass negative and both guard-removal mutants.
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
enabling HEAD per the C3-B2B checklist
(`tasks/PP-META-I2-C3-B2B.md` §9) passes first; the five
preconditions (§1 rows 14–18) are recorded out of band with exact values.

**STOP / rollback:** any refusal or non-VERIFIED verdict ends the procedure —
file the outcome, return to the owner, no parameter alteration, no re-chase.
Interrupted runs are inconclusive by definition; keep evidence untouched.
Locks: stale-lock protocol only. Rollback = revert the enabling files; the
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
| Full pipeline to refusal/VERIFIED on synthetic model-proposal fixtures | Any provider inference or retry (remaining allowance on hold; owner-reported 1 left post-Attempt-2, ledger confirmation pending) |
| Auth-gate, boundary, adversarial suites (unit + security + CI) | Historical-artifact enrollment (or recorded cancel) |
| DID-1 containment demo; scoreboard re-verification | P2 ancestor-swap risk acceptance (options: separate-UID/snapshot, or single-writer trust) |
| Refusal drill proving the hard disable is load-bearing | Merge of the enabling change; the verification run itself |

## 5. Fastest implementation sequence (reuse, no rebuild)

1. Owner records decisions D-R1 (execution approval naming V/S/tree/analysis/key-hash) and D-R2 (residual-risk acceptance) out of band.
2. Separate implementation PR: enabling diff (three files + four exact test files per the §3 allow-list) on the authenticated command path only; hosted CI green.
3. Independent security review of the enabling HEAD against the `tasks/PP-META-I2-C3-B2B.md` §9 checklist; owner merge approval (D-R4 scope: merge).
4. Owner performs runbook §3 prerequisites, records them, and runs the single supervised real execution (D-R5); evidence re-verified independently from persisted bytes.
5. Publish the outcome whichever way it falls (VERIFIED or a legitimate negative); no re-chase.

No step rebuilds the oracle, staging, coordinator, grammar, scoreboard, registration, or authentication infrastructure — all reused as audited.

## 6. GO / NO-GO assessment and exact remaining owner decisions

- **CONDITIONAL GO (offline demonstration now):** the full verifier pipeline to VERIFIED on hand-authored PC-1 (3/3 replays), the synthetic model-proposal path through the authenticated command, the auth-gate/boundary/adversarial suites, the refusal drill, and DID-1 containment are all demonstrable today with zero approvals and zero provider contact.
- **NO-GO (real stored proposal):** `c3-live-meta-001` stays HARD-DISABLED at both the CLI and the exported E2 boundary until every decision below is recorded **and** the enabling implementation is reviewed, tested, and merged. No partial credit: a green synthetic demo never authorizes the real run, and no verdict transfers to or from PC-1.
- **NO-GO (new inference):** no Baseten send, retry, or enrollment-on-suspicion; the remaining allowance stays on hold; Attempt 2 analysis text is demo material only, never a correction.

Exact remaining owner decisions (all out of band, all required before any real run):

| ID | Decision | Recorded form |
|---|---|---|
| D-R1 | Execution approval naming exact V, S, fixture tree, analysis id, key id, artifact hash | Written approval referencing this spec §3 |
| D-R2 | P2 ancestor-swap residual acceptance (separate-UID/snapshot, or documented single-writer trust) | Written risk acceptance per `docs/SEC-P2-01-FINDINGS.md` §6 |
| D-R3 | Historical-artifact enrollment per runbook §7, or recorded cancel (which ends Option A) | Enrollment record or cancel notice |
| D-R4 | Merge approval for the enabling implementation PR after independent review | Review sign-off on the exact enabling HEAD |
| D-R5 | Authorization of exactly one supervised owner-run execution | Written go-order for the single run |

Until D-R1…D-R5 are all recorded, the answer to "can an actual AI-generated correction be evaluated" remains: **the machine is ready; the authorization is not.**