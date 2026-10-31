# UI-C3-02 Live Muse Spark Analysis Mode — architecture & security proposal

> **STATUS: PROPOSAL ONLY — DESIGN/DOCS ONLY. NOT APPROVED. DO NOT IMPLEMENT.**
> No provider call, credential read, quota change, merge, or deployment is
> authorized by this document. Implementation requires a separate owner decision
> and a new bounded task contract. The required end state of this proposal is a
> reviewed Draft PR and STOP.

## 1. Objective

Give the hackathon demonstration a live, interactive Meta AI moment without
weakening any boundary that the UI-C3-01A design (PR #26) and the UI-C3-01B
functional dashboard (PR #27) were audited against.

Required experience, in order:

1. The owner selects a local F01 MP4 through the browser file picker.
2. The owner explicitly clicks **Analyze with Muse Spark 1.3** (no automatic call).
3. The dashboard shows upload/analysis progress and the actual model response.
4. The dashboard displays model observations, model-stated uncertainty, token
   usage, and the provider run identity.
5. The owner may optionally request one constrained, untrusted fix proposal.
6. Trusted verification evidence stays in its own separate view at all times.
7. An unexecuted model proposal is **never** labelled VERIFIED.

Non-objectives: verifying or executing the stored proposal `c3-live-meta-001`
(stays hard-disabled), re-running LIVE-C3-01, any hosted backend, any change to
the verifier/oracle/grammar/patch policy.

## 2. Bounded contract

### 2.1 In scope (proposal only)

- This specification, UI change descriptions (§5), trust-boundary diagram (§4),
  owner decisions (§8), and testing plan (§9).
- A future implementation task contract derived from this document, only after
  owner approval of the proposal.

### 2.2 Forbidden scope (holds for the proposal and any implementation)

- No API credentials in React, in the bundle, in fixtures, or in screenshots.
- No automatic calls, no retries, no fallback provider/model, no batch loop:
  one explicit click → at most one provider request, then STOP.
- Synthetic F01 recordings only for the first iteration (§7).
- The exhausted LIVE-C3-01 quota stays spent; its hard-disable controls stay
  closed (§6).
- No model-generated code execution; no changes to the verifier, oracle,
  grammar, patch policy, coordinator, activation pin, or trust roots.
- No fabricated results: every live value is displayed with its run identity
  and provenance, or not displayed at all.
- No merge, publish, deployment, or submission on the agent's behalf.

### 2.3 Stop rule

If any boundary in §2.2 cannot be held by the proposed mechanism without an
exception, stop and return the decision to the owner: the mode ships with fewer
capabilities, never with a weakened boundary (same rule as the dashboard
security contract, PR #26).

## 3. Architecture

### 3.1 Components

- **Dashboard (React, existing UI-C3-01B shell).** Renders only. Holds no
  credential, no approval, no quota. Talks exclusively to the companion over
  loopback; every live value it shows is quoted text under an explicit
  `LIVE — UNVERIFIED MODEL OUTPUT` banner with the provider run id.
- **Companion (new, owner-started localhost process, e.g.
  `node scripts/c3-live-analysis.ts`).** The only component that may hold the
  Meta credential, and only via its invocation environment (inherited from the
  LIVE-C3-01B runner pattern: credential read by the production runner after
  read-only authorization, never by an agent, never printed, never persisted).
  Owns: per-request authorization check, quota enforcement, input validation
  and file-hash binding, the single provider call, strict output validation,
  upload lifecycle and cleanup, and sanitized-evidence persistence.
- **Meta Model API (`muse-spark-1.3` only).** The only permitted non-loopback
  egress, and only from the companion, only inside an authorized request.
- **Evidence store (`.proofpilot/`, gitignored, mode `0600`).** Sanitized
  fields only (same allow-list discipline as the LIVE-C3-01 artifact: no raw
  provider text, no error text, no credential, no unknown keys).

### 3.2 Request lifecycle (exactly one request per explicit authorization)

```text
owner picks MP4 in dashboard
  → dashboard computes local SHA-256 + metadata (existing UI-C3-01B logic)
  → owner clicks "Analyze with Muse Spark 1.3"
  → dashboard POSTs { fileSha256, fileBytes, durationS, dimensions } to companion
  → companion REFUSES unless a live single-use permit exists for exactly
    that hash (permit created only by the owner in the companion terminal,
    §6.2; the click alone authorizes nothing)
  → owner uploads the bytes (companion re-hashes; mismatch → refuse + delete)
  → companion makes ONE provider request (fixed model, capped tokens)
  → strict validation (closed grammar for proposals; allow-listed fields
    for observations) → sanitized evidence persisted → staged bytes deleted
  → dashboard polls status and renders quoted output; permit spent
```

No permit → no upload, no call. Permit is single-use, hash-bound, and short-TTL.
Interruption at any point leaves no verdict: partial output is never rendered.

### 3.3 What the companion reuses (no reinvention)

- Gate order and single-use approval/reservation mechanics from
  `tasks/PP-META-I2-C3-LIVE-01B.md` and `packages/inference/src/`
  (`authorizeProductionAttempt`, single-use approval consumption,
  `retries: 0`).
- TTY + typed-confirmation discipline from `scripts/c3-live-proposal.ts`
  (`SEND ONE META REQUEST <runId> <hash12>` pattern).
- Sanitized-artifact allow-list discipline from
  `docs/LIVE-C3-01-EXECUTION-REPORT.md` §4.
- Refusal-drill pattern from `docs/C3B2B-REAL-PROPOSAL-PROCEDURE.md` §3.3:
  the disabled build must fail closed with a named refusal and exit `2`.

## 4. Trust-boundary diagram

```text
┌─ Owner browser (React dashboard) ──────────────┐  UNTRUSTED RENDER
│ file picker · local SHA-256 · quoted text only  │  no secret, no approval,
│ LIVE/UNVERIFIED banners · NO VERIFIED chip      │  no verdict authority
└───────────────┬────────────────────────────────┘
                │ loopback only (127.0.0.1), no credential on the wire
┌───────────────▼────────────────────────────────┐  CREDENTIAL BOUNDARY
│ Companion (owner-started localhost process)     │
│  • single-use hash-bound permit check           │
│  • quota (new LIVE record; C3-01 stays spent)   │
│  • re-hash upload, strict schema validation     │
│  • ONE provider call, fixed model + token caps  │
│  • sanitized persistence, staged-byte cleanup   │
└───┬───────────────────────────────┬────────────┘
    │ Meta Model API egress         │ local evidence writes
    │ (authorized request only)     │ (.proofpilot, 0600, allow-list)
┌───▼────────────┐   ┌──────────────▼─────────────┐
│ muse-spark-1.3 │   │ Verifier / oracle / grants │
│ (untrusted     │   │ UNCHANGED: no model exec,  │
│  output)       │   │ no gate changes            │
└────────────────┘   └────────────────────────────┘

Historical zones (F01 baseline, PC-1 VERIFIED, model-hypothesis record):
separate views, separate provenance, never merged with live output.
```

Crossing rules: nothing crosses the credential boundary toward the browser
(permits are created in the companion terminal, never in the UI); nothing
crosses from the model toward the verifier (no execution surface); live and
historical views never share a verdict chip.

## 5. UI changes (against the UI-C3-01B shell, PR #27)

New **Zone L · Live Analysis (explicit opt-in)** placed after the historical
zones, visually separated (own section, own heading, `LIVE — UNVERIFIED MODEL
OUTPUT` banner on every live value). Reuses catalog components only:
`EvidenceTable`/`Row` for observations/usage/run identity, `LoadingState`
for upload/analyzing progress, `ErrorState` for typed refusals,
`NeutralChip`/`UnverifiedImportChip`-style banners (extended with a live-run
variant carrying the provider run id).

Required states (per `docs/DESIGN-SYSTEM.md` required-states list):

- idle (prerequisites listed: companion reachable? permit present? quota left?);
- ready-to-request (file validated, hash shown, permit confirmed);
- uploading (bytes + progress, cancellable; cancel deletes staged bytes);
- analyzing (no fake progress: indeterminate until the provider responds);
- done-live (observations as quoted text, model-stated uncertainty verbatim,
  token usage, run id, timestamp);
- proposal (optional second explicit click; constrained triple rendered as
  escaped read-only text; `UNTRUSTED PROPOSAL — NOT VERIFIED`);
- refused (typed reason: no permit, hash mismatch, over-limit file,
  quota spent, companion unreachable, invalid response);
- quota-spent (terminal for the record; points at the owner decision for more).

Prohibited: any VERIFIED/trusted chip in Zone L; merging live rows into the
historical evidence tables; pre-filling or implying approval; a generic primary
button worded to suggest verification, approval, or deployment.

Accessibility (per `docs/ACCESSIBILITY.md` web baseline, same bar as PR #27):
full keyboard path, visible focus, live-region announcements for
upload/analyzing/done/refused transitions, text verdicts, 200% zoom and
320 px width without page-level horizontal scroll, contrast in the shipped
light theme.

## 6. Authorization and spending

### 6.1 Quota preservation

LIVE-C3-01 (`c3-live-meta-001`) stays spent and hard-disabled: no new approval
may name it, the E1/E2 run functions keep refusing it, and this proposal adds
no path around those refusals. Any live call under UI-C3-02 requires a **new**
LIVE record with its own lifetime quota (proposed: 1 analysis + optionally 1
proposal request per demo), created only by the owner decision in §8 (D1) plus
the same activation→pin→approval sequence that gated LIVE-C3-01.

### 6.2 Per-request authorization

Two independent owner acts per provider request, neither delegable:

1. In the companion terminal: create a single-use permit naming the exact
   file SHA-256 (typed confirmation of hash + byte size, mirroring the
   `SEND ONE META REQUEST` discipline).
2. In the dashboard: click the explicit Analyze/Propose button for that file.

The click without a permit is refused; a permit without a click does nothing;
a permit never survives its request (success, failure, timeout, and
interruption all spend it).

### 6.3 Bounded spending

Fixed model `muse-spark-1.3`; companion-enforced caps (`maxInputChars`,
`maxOutputTokens`, one request per permit); no retry/fallback (a failed or
unclear request ends the attempt — a new request needs a new permit under the
remaining quota); actual billing stays UNVERIFIED (token counts are not costs,
as recorded for LIVE-C3-01) and the owner acknowledges this in §8 (D2).

## 7. Inputs: synthetic-first, strictly bounded

- First iteration: synthetic F01 recordings only (same fixture family as the
  certified set). Real-owner recordings need a separate privacy decision (D5).
- Hard limits (same as the audited shell): MP4 only, ≤ 25 MB, ≤ 30 s, real
  video dimensions, playable; over-limit or unplayable files are refused before
  any permit can name them.
- File-hash binding: the dashboard's local SHA-256, the permit, the uploaded
  bytes (re-hashed by the companion), the provider request log, and the
  persisted evidence must all name the same hash, or the run is refused and
  staged bytes are deleted.
- No caller-controlled provider, model, limits, credential, repository root,
  or evidence directory (same constraint as `proposeCandidate`).

## 8. Explicit owner decisions (each recorded before its implementation step)

- **D1 — New LIVE record + quota.** Authorize a new lifetime quota (proposed:
  1 analysis + 1 proposal) under a new run id; LIVE-C3-01 stays spent.
- **D2 — Spend acknowledgment.** Actual billing is unverified; token counts are
  not costs; no cap beyond the quota + token caps in §6.3.
- **D3 — Synthetic scope.** First iteration restricted to synthetic F01
  recordings; which fixture set.
- **D4 — Companion trust.** Owner starts the localhost companion, injects the
  credential into its environment only, and owns the terminal confirmations.
- **D5 — Upload privacy.** Owner MP4 bytes leave the machine to Meta during an
  authorized request (and are then deleted locally per §3.2); real recordings
  additionally need this decision — synthetic-only until then.
- **D6 — Demo recording.** Consent to show the live run (including run id,
  usage, and any error) in the hackathon video.
- **D7 — Sequencing.** Proposal review → implementation task → implementation
  PR → independent audit → merge decision; activation/pin/approval per §6.1.

Standing NOT-APPROVED (unchanged): executing/staging/verifying any
model-generated CSS, changing verifier/oracle/grammar/gates, Baseten/Modal,
HOST-C3-01, merging or deploying.

## 9. Testing plan

Test objective (per `docs/TESTING.md`): **prove that no provider request,
spend, credential movement, or trusted verdict can occur without both owner
acts (§6.2), and that every rendered live value is quoted, run-identified, and
never VERIFIED.**

Targeted checks (smallest evidence first; owner-run live legs never in CI):

- **L-STAT-1 (static, CI):** React source contains no credential, endpoint,
  approval, or quota string (extend the T-ABSENT-1 scanner to the new zone +
  companion-client module); companion contains no fallback provider/model.
- **L-AUTH-1 (unit, mocked transport):** click-equivalent without a permit is
  refused; permit for hash A with bytes of hash B is refused; used/expired
  permit is refused; second request on spent quota is refused with the spent
  terminal state.
- **L-ONE-1 (unit, mocked transport):** transport double counts provider calls
  across failure/timeout/interruption drills — exactly one per permit, zero
  without.
- **L-BIND-1 (integration):** tampered upload bytes (hash mismatch) refused and
  staged bytes deleted; oversize/over-duration/unplayable files refused before
  permit creation.
- **L-SAN-1 (unit):** adversarial model text (markup, event handlers,
  `javascript:` URLs, style directives, prototype keys, oversized strings)
  renders as inert text; proposal triples outside the closed grammar rejected.
- **L-SEP-1 (browser, fixtures):** live and historical views render separate
  provenance; no VERIFIED chip in Zone L under any fixture; forged
  `VERIFIED`/`certified` model text renders as quoted claims only.
- **L-NET-1 (browser, trap):** full walkthrough records zero non-loopback
  requests from the dashboard; the only egress is companion→Meta inside an
  authorized request (proven by the companion request log, owner-run only).
- **L-A11Y-1 (browser):** keyboard-only path through Zone L states; live-region
  announcements observed; 200% zoom + 320 px without horizontal scroll.
- **Real-browser acceptance (owner-run, NOT CI):** genuine MP4 selection,
  permitted analysis, actual response rendered with run id/usage; revocation
  drill (revoke permit mid-upload → refusal + cleanup).
- **Adversarial security tests (owner-run + review):** credential-in-env
  discipline (no agent read, no print, no persistence); permit replay across
  restarts refused; companion binds 127.0.0.1 only (refuses non-loopback
  interfaces); raw provider text never persisted (evidence allow-list audit).

Stop rule: objective met → STOP expanding automated tests → manual QA →
PR + required CI → independent review (per `docs/TESTING.md`).

## 10. Consequences for existing gates

None. This proposal changes no code, no quota, no activation, no pin, no
oracle/verifier/grammar, no trust roots, no CI gates. PR #26 and PR #27 stay
unmerged and unmodified; the stored proposal stays unread, unloaded, unstaged,
unexecuted. Any future implementation PR is stacked separately and must pass
the same independent audit bar before any merge decision.

## 11. Acceptance (of this proposal PR)

1. Bounded scope above is complete and self-consistent; every MUST in §1 has a
   mechanism in §3/§5 and a test in §9; every MUST-NOT in §2.2 has a control
   and a test.
2. `pnpm lint` green; `git diff --check` clean.
3. Draft PR opened against `main`; required hosted CI green.
4. Independent review, then STOP. No implementation, no live call.
