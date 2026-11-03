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
| 13 | **An accepted AI correction staged through the above** | MISSING | Correction axis: `c3-live-meta-001` never executed; no model-proposal scoreboard row exists. (Analysis axis is separate: QA-01 Attempt 2 is an owner-reported accepted *observation*, §0 — not a correction.) |
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

**Two separate authorities (never conflated).** The SEC-P2-02 manifest has
exactly eight fields (`authVersion`, `keyId`, `runId`, `artifactSha256`,
`inputSha256`, `sourceSha`, `sourceFixtureTree`, `sourceAnalysisId` —
`packages/provenance/src/artifact-auth.ts` `MANIFEST_KEYS`). It binds
artifact content and source labels; it carries **no `verificationSha` and no
execution approval**, and `verifyArtifactAuthentication` never decides
permission to execute. Owner execution authorization (D-R1/D-R5) is a
different authority and is enforced as a **runtime-checked, exact-run
authorization record**, not inferred from the signature and not from
caller-controlled CLI values alone.

**Exact allowed files (enabling change; separate reviewed implementation PR only):**
- `config/c3-real-run-authorization.json` (new, reviewed, narrow): the single
  runtime-checked authorization record. Exact fields: `runId`
  (`c3-live-meta-001`), `artifactSha256`, `verificationSha` (exact V),
  `sourceSha`, `sourceFixtureTree`, `sourceAnalysisId`, `keyId`,
  `approvalId` (names the out-of-band D-R1 record). Parent-binding (no
  self-reference): a committed record cannot contain the SHA of the commit
  holding it — Git's commit SHA depends on its own tree, so
  `verificationSha == HEAD-containing-the-record` is an infeasible
  fixed-point and is **not** specified. Instead `V` is the reviewed, frozen
  enabling-implementation HEAD (**code only**, no authorization values; the
  real id still refuses at `V`), `D-R1` is recorded out of band **after**
  `V` exists and names exact `V`, and `W` is a direct child authorization
  commit of `V` — created owner-operated under the §2 single-writer window —
  containing **only** the authorization record (plus the §7 enrollment
  update; see the allow-list). The record names
  `verificationParentSha = V` (its parent, known before `W` exists), never
  its own SHA. The runtime checkout is `W` (code byte-identical to `V`
  except the allow-listed files), but the **verification revision is `V`**
  (`verificationSha := V = HEAD~1`) for every downstream gate (E2 revision
  checks, anchors, attestation, scoreboard binding). The CLI verifies
  read-only: the tree is clean, `HEAD~1` equals the record's
  `verificationParentSha`, `git diff --name-only V..HEAD` is exactly the
  allow-list (no code difference), run id matches, and the five CLI values
  equal the record's fields. Any absence, mismatch, dirty tree, non-parent
  `V`, or out-of-allow-list diff refuses **before the real artifact is
  accessed** (proven by asserting the P2 loader is never invoked: no read of
  the real artifact path). The record authorizes exactly one revision (`V`):
  it is inert on any other checkout. Single-run enforcement is by the locked
  supervised owner procedure (the D-R5 go-order names the same `V`, `W` and
  artifact hash); the record itself is never re-issued, edited, or reused
  for another run. A heavier detached owner-signature receipt was considered
  and **deferred**: it adds a key ceremony without changing the guarantees
  once parent-binding, the diff allowlist and the §2 window hold.
- `scripts/c3-b2b-verify-authenticated.ts`: replace the unconditional real-id
  refusal with the ordered gate below. No new flags, no approval-path flags,
  no mode switch, no alternate artifact path — the five existing CLI values
  are cross-checked against the enrolled signed manifest **and** the
  authorization record. Anything unrelated refuses with a typed code.
- `packages/core/src/model-real-authorization.ts` (new, narrow, Zone E — the
  **only** minter and the answer to "one more file is required"): holds the
  module-private single-use `AUTHORIZED` set and exports exactly two
  functions, `mintSingleUseRealAuthorization` and `isRealRunAuthorized`.
  Imports are `node:crypto`, the core grammar/renderer and
  `model-proposal.ts` identity only — no filesystem, no provenance, no
  inference, no network, no environment. No other production file may import
  it except the predicate import in `model-verification.ts` and the mint
  call in the authenticated CLI (enforced by a boundary test). Why a new
  file: the current `registerModelProposal()`
  (`packages/core/src/model-proposal.ts:127-173`) is deliberately public
  and data-only — anyone with valid closed-grammar triples mints a
  registration without Ed25519 verification — and the authenticated loader
  (`packages/provenance/src/artifact-auth.ts:506-530`) returns an
  `AuthenticatedArtifact` plain-data binding, never a capability. Neither
  can bridge to execution authority without becoming forgeable, so the
  bridge is a separate module whose mint function **re-verifies from trusted
  primitives instead of trusting caller assertion**: it parses and validates
  the raw manifest bytes (exact eight `MANIFEST_KEYS`, same strict parser),
  verifies the Ed25519 signature itself with `node:crypto` against the
  pinned `TrustRoots` bytes, requires the E1-registered proposal **object
  identity** (`assertRegisteredModelProposal` — copies refused), and checks
  equality across all four bindings: proposal, manifest, authorization
  record and CLI-observed `V` must agree on
  (`runId = c3-live-meta-001`, `artifactSha256`, `approvedSha = V =
  record.verificationParentSha`). An exported helper trusting a caller
  boolean, an `AuthenticatedArtifact` object, or a publicly registered
  proposal is forbidden — only bytes that verify under the pinned key mint.
  The git-parent observation (`HEAD~1`, diff allowlist) is performed by the
  CLI under the §2 window and passed as observed strings; mint binds them by
  equality to the crypto-bound `V` rather than re-observing git from Zone E.
- `packages/core/src/model-verification.ts`: narrowly extend the exported
  `verifyRegisteredProposal` hard-disable
  (`model-verification.ts:192-204`) so the real id is admitted **only**
  for a proposal object for which `isRealRunAuthorized` holds. Membership
  lives solely in the new module's private set, scoped to the exact
  (`runId`, `artifactSha256`, `approvedSha=V`) triple. Consumption: the
  first verification call deletes the membership (one-shot; re-entry
  requires the full gate again). Unreachability: the set is module-private,
  never exported, never serialized; synthetic fixtures live in a disjoint
  run-id namespace and can never mint the real id (mint hard-requires the
  real run id **and** a signature verifying under the pinned roots).
  Default-deny is thus preserved at this boundary independently of the CLI:
  a direct programmatic call with the real id and no minted membership still
  throws `REAL_ARTIFACT_DISABLED`. No environment flag, no credential, no
  generic bypass, no unguarded removal of the core gate.
- `config/artifact-trust-roots.json`: enrollment of the historical key
  **only** via the isolated-verification runbook §7 procedure (re-derived
  source evidence + explicit owner authorization naming key id and artifact
  hash), landing in `W` (not `V`) so code review stays decoupled from the
  offline enrollment outcome. If the source cannot be re-established, no
  enrollment happens and the run is cancelled — never enroll on suspicion.
- Precisely scoped tests (exact files, same implementation PR):
  - `tests/unit/c3-real-authorization.test.ts` — absent/malformed
    authorization record, record/CLI mismatch, dirty tree, non-parent `V`,
    out-of-allow-list `W` diff, and a record naming its own HEAD instead of
    its parent all refuse **before the real artifact is accessed** (proven
    by asserting the P2 loader is never invoked: no read of the real
    artifact path); parent-binding (`verificationParentSha == HEAD~1`) is
    asserted, not assumed. Includes the synthetic commit/V dry-run: build
    disposable repos with synthetic `V`/`W` pairs and prove the gate passes
    only for a clean single-record child of the named parent.
  - `tests/unit/c3-real-authentication.test.ts` — tampered/replayed
    manifest, unknown key id, substituted trust roots, and altered bound
    fields refuse at the auth gate with named codes (extends the existing
    SEC-P2-02 battery to the real-id path without touching synthetic
    suites). Asserts the manifest's eight fields carry no V and no approval.
  - `tests/unit/c3-real-mint.test.ts` (new bridge battery) — the mint
    function refuses: caller-asserted booleans / `AuthenticatedArtifact`
    lookalikes bypassing crypto, forged or replayed signatures, unknown key
    ids, manifest/record/CLI `V` disagreement, synthetic run ids, second use
    of a consumed membership, and replay of a handle across a different `V`.
    Positive case only with test-key bytes that actually verify plus exactly
    matching bindings; asserts the public `registerModelProposal` path alone
    never creates AUTHORIZED membership.
  - `tests/security/c3-real-bypass.test.ts` — a direct call to exported
    `verifyRegisteredProposal` with the real id and no minted membership
    throws `REAL_ARTIFACT_DISABLED`; membership cannot be forged, replayed
    across V, or reached from a synthetic path; the new module's importer
    set is exactly the allow-list (predicate import in
    `model-verification.ts`, mint call in the authenticated CLI, tests);
    guard-removal mutants (delete the CLI parent/diff check; delete the
    mint's signature re-verification; delete the core membership check;
    delete single-use consumption) are caught.
  - `tests/integration/c3-real-refusal.test.ts` — end-to-end refusal drill
    on the exact-command surface: real id without complete
    authorization+authentication+enrollment exits 2 with zero evidence and
    zero stage; each missing stage input is shown to block its own stage
    (no authorization → no artifact access; no authentication → no
    registration; no registration → no staging).
- Nothing else: no oracle, grammar, coordinator, scoreboard, activation,
  quota, credential or network change; existing synthetic suites stay intact
  and green. Any diff outside the files above fails review. Production diff
  summary: 3 modified files (`scripts/c3-b2b-verify-authenticated.ts`,
  `packages/core/src/model-verification.ts`,
  `config/artifact-trust-roots.json` enrollment in `W` only) + 1 new module
  (`packages/core/src/model-real-authorization.ts`) + 1 new record in `W`
  (`config/c3-real-run-authorization.json`) + 5 exact test files.

**Exact stage sequence (the loader reads before it verifies — stated plainly).**
`loadAndAuthenticateProposalArtifact` begins with the P2 strict read, then
reads the sidecars and verifies (`artifact-auth.ts`). Signature bytes cannot
be verified without reading them, so "verify before any artifact read" is
**not** the boundary. The enforced order is:
0. Owner authorization (external, D-R1/D-R5): the exact-run decision is
   recorded out of band **after `V` exists**, naming `V`, `W`, the artifact
   hash and approval id; the operator invokes the command at checkout `W`.
   Software checks the committed parent-binding record — it never treats
   the external decision, the signature, or the CLI tuple as
   self-authorizing.
1. Controlled access: the authorization record is verified read-only
   (clean tree, `HEAD~1 == verificationParentSha = V`, `V..HEAD` diff is
   exactly the allow-list, run id and five CLI values match). Only then may
   the real artifact path be touched — a read-only P2 strict load (bytes
   must be read to be hashed; the read itself grants nothing).
2. Artifact authentication: manifest + signature verify against pinned roots
   and the eight bound fields, **before registration, staging, or browser
   execution**. A signed manifest is never a substitute for D-R1/D-R5.
3. Provenance validation: source re-derivation and Zone P checks.
4. Registration: provenance-tagged identity (public E1 bridge) plus
   single-use AUTHORIZED minting through
   `packages/core/src/model-real-authorization.ts` (crypto re-verified,
   real id only) — direct programmatic calls without this step still throw
   `REAL_ARTIFACT_DISABLED` at the E2 boundary.
5. Isolated verification: disposable staging, three replays, oracle — and
   only then a verdict. The verification revision everywhere is `V`
   (`HEAD~1`), never `W`.

**Acceptance tests (all offline except the single owner-run real replay):**
- Refusal drill still passes on the unmodified build (HARD-DISABLED, exit 2,
  no evidence) — proves the gate is reached, not bypassed.
- New gate tests above green on the code HEAD `V` and re-green on the final
  HEAD `W`, including the direct-call bypass negative, the mint-forgery
  battery, the parent-binding dry-run, and all guard-removal mutants.
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
Locks: stale-lock protocol only. Rollback = revert the enabling diff and
delete `W` (the record and enrollment go with it); the disable is restored
by deletion, and the refusal drill re-passes. The record is never re-issued
for another revision: a new `V` needs a new D-R1 and a new `W`.

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

1. Separate implementation PR: enabling code diff per the §3 allow-list
   (CLI gate, E2 predicate wiring, the one new mint module, 5 exact test
   files) on the authenticated command path only — **no authorization
   values**; `V` = the reviewed, frozen code HEAD, still refusing the real
   id; hosted CI green.
2. Owner records D-R1 (execution approval naming exact `V` and the
   S/tree/analysis/key/artifact-hash values — only possible now that `V`
   exists) and D-R2 (residual-risk acceptance) out of band; D-R3 enrollment
   values established per runbook §7 (or recorded cancel, which ends
   Option A here).
3. Owner creates authorization child `W` (direct child of `V`: the record +
   trust-roots enrollment only) under the §2 window on the same PR branch;
   hosted CI re-runs at `W`.
4. Independent security review of the exact final HEAD (`W`: code from `V`
   plus the trivial allow-listed child diff) against the
   `tasks/PP-META-I2-C3-B2B.md` §9 checklist; owner merge approval (D-R4
   scope: merge of `W`).
5. Owner performs runbook §3 prerequisites, records them, and runs the single
   supervised real execution at checkout `W` (D-R5 go-order names `V`, `W`
   and the artifact hash); evidence re-verified independently from persisted
   bytes.
6. Publish the outcome whichever way it falls (VERIFIED or a legitimate negative); no re-chase.

No step rebuilds the oracle, staging, coordinator, grammar, scoreboard, registration, or authentication infrastructure — all reused as audited.

## 6. GO / NO-GO assessment and exact remaining owner decisions

- **CONDITIONAL GO (offline demonstration now):** the full verifier pipeline to VERIFIED on hand-authored PC-1 (3/3 replays), the synthetic model-proposal path through the authenticated command, the auth-gate/boundary/adversarial suites, the refusal drill, and DID-1 containment are all demonstrable today with zero approvals and zero provider contact.
- **NO-GO (real stored proposal):** `c3-live-meta-001` stays HARD-DISABLED at both the CLI and the exported E2 boundary until every decision below is recorded **and** the enabling implementation is reviewed, tested, and merged. No partial credit: a green synthetic demo never authorizes the real run, and no verdict transfers to or from PC-1.
- **NO-GO (new inference):** no Baseten send, retry, or enrollment-on-suspicion; the remaining allowance stays on hold; Attempt 2 analysis text is demo material only, never a correction.

Exact remaining owner decisions (all out of band, all required before any real run):

| ID | Decision | Recorded form |
|---|---|---|
| D-R1 | Execution approval naming exact V (recorded only after V is frozen), S, fixture tree, analysis id, key id, artifact hash | Written approval referencing this spec §3 |
| D-R2 | P2 ancestor-swap residual acceptance (separate-UID/snapshot, or documented single-writer trust) | Written risk acceptance per `docs/SEC-P2-01-FINDINGS.md` §6 |
| D-R3 | Historical-artifact enrollment per runbook §7, or recorded cancel (which ends Option A) | Enrollment record or cancel notice |
| D-R4 | Merge approval for the enabling implementation PR after independent review | Review sign-off on the exact final HEAD (`W`, including the parent-binding record and enrollment) |
| D-R5 | Authorization of exactly one supervised owner-run execution at checkout `W` | Written go-order for the single run (names `V`, `W`, artifact hash) |

Until D-R1…D-R5 are all recorded, the answer to "can an actual AI-generated correction be evaluated" remains: **the machine is ready; the authorization is not.**