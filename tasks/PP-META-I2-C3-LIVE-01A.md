# PP-META-I2-C3-LIVE-01A — Human approval and live-activation safety gate (implementation and mock tests only)

- **State:** Implemented on a Draft PR; independent exact-head review pending.
- **Base:** protected `main` at `e2e0216e922ef72b8310b3ec81e5afc4e6208fab` (C3-B2A, PR #10, squash-merged after an independent PASS).
- **Working branch:** `phase/pp-meta-i2-c3-live01a-approval-gate`
- **Parent contract:** `tasks/PP-META-I2-C3.md`; follows `tasks/PP-META-I2-C3-B2A.md`.
- **Implementation agent:** Claude Code; independent reviewer: GPT-6; owner: repository owner.

## Objective

Build, and test with mocks only, a secure, auditable, single-use operator-approval workflow and a fail-closed authorization validator for a **future** single Meta Muse Spark 1.3 proposal attempt. Nothing in this task enables a real provider call, raises a quota, captures a genuine authorization, or executes a model-generated candidate.

## Delivery mode

UI design gate: Not applicable (no user-facing UI). Backend/tooling/documentation only.

## Allowed scope

`packages/inference/src/{live-approval,live-gate-core,live-gate,approval-cli,git-probe,live-rehearsal}.ts`, a read-only `inspectReservation` in `reservations.ts`, a one-line helper in `patch-proposal.ts` (`buildProposalRequestHashOk`), `config/live-authorization.json` and `config/live-activation.json` (both EMPTY), `scripts/c3-activation-digest.ts` (read-only helper), `scripts/c3-approve-live-run.ts`, `scripts/c3-live-rehearsal.ts`, the inference index export, tests, and the docs listed in the PR.

## Forbidden scope

Any Meta, Baseten or Modal request; reading a real credential; creating a genuine operator approval; raising `APPROVED_LIVE_QUOTA` above 0; enabling `proposeCandidate()`; recording LIVE-C3-01 as APPROVED; executing or staging model-derived CSS; changes to `verifier/`, `fixtures/`, `config/patch-policy.json`, the patch grammar, `candidate-stage.ts`, the coordinator, CI workflows; the report UI; deployment; merging.

## Approval architecture and trust boundaries

| Layer | What it is | What it can and cannot do |
|---|---|---|
| **Decision register** `config/live-authorization.json` | Reviewed, owner-committed list of APPROVED decisions. **Empty today.** | The only place a live decision can exist. A local file can never substitute for it. Adding an entry enables nothing by itself: the code quota (`APPROVED_LIVE_QUOTA`) and the proposal entry point are separate, reviewed changes. |
| **Operator approval record** `.proofpilot/approvals/<runId>.json` | A **self-declared**, per-run record written by the interactive CLI: who typed a name, when, and exactly what: provider `meta`, model `muse-spark-1.3`, run id, input SHA-256 and length, approved repository SHA, decision id + register digest, bounds, expiry (default 10 min, max 15). Labelled `NOT AUTHENTICATED IDENTITY`. | Evidence of a deliberate terminal action, not identity. Its SHA-256 digest detects accidental or casual edits and mismatched fields; it does **not** stop someone who can write the operator's files and recomputes it. That is why the register, the code quota and the audit trail (not this file) carry the authority. |
| **Consumption marker** `<runId>.consumed` | Created with exclusive `wx`; holds approval id + record digest. | The single atomic spend. Concurrent callers: exactly one wins. Never removed. |
| **Reservation** (C3-A, unchanged) | Run id + one quota slot, claimed under a lock, never released. | Spent from the claim onward whatever happens. |
| **Authorization validator** `authorizeProductionAttempt` / `prepareProductionAttempt` (live-gate.ts) | Fail-closed, throws a typed `AuthorizationError` on the first failed condition, wraps unknown errors as `INTERNAL`. | The ONLY production API. It takes just the attempt's own facts (run id, request, provider to be called, output bound) and derives everything else internally: the install root is this checkout's own location, the register and activation pin are read from it, Git state comes from the real `git` run there, directories are fixed beneath it, the quota is `APPROVED_LIVE_QUOTA.meta`, synthetic decisions are impossible, and extra properties on the argument (roots, probes, registers, stores, quotas, clocks) are ignored. |

Checks, in order: provider is `meta`; model is exactly `muse-spark-1.3`; an APPROVED, non-synthetic LIVE-C3-01 decision for that provider/model within the code limits; live quota ≥ 1; **HEAD is the owner-pinned activation revision** (below); request hash recomputed and ≤ 12,000 characters; requested output ≤ 3,072 tokens; approval file opened without following symlinks and verified (regular file, single link, mode 0600, own uid, ≤ 8 KiB); strict schema and integrity digest; bound run id, provider, model, input hash and length, register digest, bounds; lifetime ≤ 15 min, not future-dated, not expired; not consumed; the approval's own HEAD equals the current HEAD, the approval names the pinned activation digest, and the tree is clean (untracked files count); run id unspent, no claim lock present, quota slot available.

`createProposalConsent()` is only a consent-shaped record; it is never read by this workflow and proves nothing about a person.

## Production gate versus injectable core (MAJOR-1 remediation)

- `live-gate.ts` is the single production entry point; `live-gate-core.ts` holds the logic and takes a `TrustContext`. A context is created either by `createInstallContext(installRoot, liveQuota)` (production kind: derives register, pin, real Git probe and directories from one root) or by `createSyntheticContext(parts)` (synthetic kind: used only by the rehearsal and tests). Anything authorized through a synthetic context is flagged `synthetic` and the production API refuses to return it.
- The package index exports only the production API, errors, limits and read-only helpers. The core, the CLI logic that accepts a context, and the record primitives are not exported; a static test limits who may import them. A simulated positive quota is tested with `createInstallContext(realRoot, 1)`: the real empty register and unpinned revision still authorize nothing.
- Future C3-LIVE-01B code must call `authorizeProductionAttempt` / `prepareProductionAttempt` (and the unchanged single provider call) and may not import the core.

## Owner-pinned activation revision (MAJOR-2 remediation)

A self-declared current `HEAD` is not proof that the owner approved running live inference at that revision, and a register inside a commit cannot name its own commit. `config/live-activation.json` (EMPTY today: `activation: null`) therefore pins a **tree digest that excludes the pin file itself**: SHA-256 over the sorted `mode blobSha path` lines of every tracked file in the revision except `config/live-activation.json`. The pin also carries the activation commit A, the decision id and decision reference (must equal the register's), and who recorded it.

Safe, non-circular sequence (owner): (1) the reviewed C3-LIVE-01B PR (register entry + code) is audited and merged, giving commit A; (2) the owner runs `node scripts/c3-activation-digest.ts <A>` (read-only) and records A and the digest in the pin file in a **separate, reviewed, pin-only commit A'**; (3) production and the CLI (one shared `checkActivation`) accept HEAD only if **(a)** its digest, pin file excluded, equals the pinned digest and A still hashes to it, **and (b) the revision relationship holds:** A is an ancestor of HEAD and every commit in `A..HEAD` is linear (no merge) and changes **only** `config/live-activation.json` (at least one, at most 50 commits). A' passes. A tree digest alone cannot tell commits apart, so (b) is what rejects a clean same-tree descendant: an unauthorized `git commit --allow-empty`, a revert/recommit, an empty commit between A and A', a merge, or a same-tree sibling named as the pinned commit all fail with `REVISION_NOT_APPROVED`; any code or config change fails (a) and (b).

**Re-pin procedure (reviewed and explicit).** (i) *Correcting pin metadata for the same activation commit:* another reviewed commit that changes only the pin file, on top of the chain (still a pin-only descent from A). (ii) *Authorizing new code:* merge a reviewed activation commit A2 (it is refused until pinned), then a reviewed pin-only commit naming A2 and its digest. Either way the HEAD changes, and the approval record binds the HEAD, activation commit and digest, so every earlier approval stops working and the operator approves a new run id.

**Honest boundary.** Git cannot prove a commit's own SHA from inside its tree, and this repository cannot authenticate who authored a commit. What the code enforces is structure: after the activation commit only the pin file may change, and the pin file is the owner's re-pin action. That the pin-file edit was the owner's is the review of that commit (protected `main` and owner review); a tree digest is never claimed to prove an exact SHA. The approval record binds the HEAD it was made at, the activation commit and the digest, so a re-pin invalidates old approvals. This is a readiness gate; nothing is pinned or approved in this milestone.

## TOCTOU and crash design for the future activation

Order (implemented as `prepareAttemptCore` behind `prepareProductionAttempt`; today only the synthetic rehearsal runs it, on a synthetic context): **authorize (read-only) → consume the approval (exclusive create) → re-check expiry, HEAD, tree and reservation state → claim the reservation (run id + slot) → only then one provider call.**

- Two processes validating the same approval both pass step 1; only one creates the marker; the loser gets `APPROVAL_SPENT` before touching the quota.
- State that can change between check and use (HEAD, tree, clock, claim lock) is re-checked after consumption and before the claim; a change fails closed with the approval already spent.
- Crash after consume, before claim: the approval is spent, no slot, no run record. `listStrandedApprovals` lists it read-only. The operator approves a **new** run id; nothing is recycled.
- Crash after claim: a `CLAIMED` run record and a spent slot remain; replay is impossible (marker + run id + slot). A stale claim lock makes every later authorization fail with `LOCK_STALE` until a human inspects it.
- Neither approvals, markers, run ids nor slots are ever released automatically. Any timeout, network failure or uncertain result permanently spends the attempt.

## Mock-only rehearsal

`node scripts/c3-live-rehearsal.ts` runs, in a disposable temp directory with a scripted terminal and a synthetic decision: Symptom + trusted facts → bounded request → simulated approval → authorization → synthetic claim → injected mock response → lifecycle/model checks → strict validation → sanitized `UNTRUSTED PROPOSAL — NOT VERIFIED` artifact. Eleven scenarios (accepted, refusal, incomplete, missing status, wrong model, empty, malformed, forbidden, out of grammar, provider error, duplicate run). It builds no provider, calls no `fetch`, reads no environment variable, imports neither the staging runner nor the coordinator, and no `VERIFIED` value exists in it. Its report states `SYNTHETIC … NOT A GENUINE AUTHORIZATION` and that the production validator refuses (`LIVE_NOT_APPROVED`).

## C3-LIVE-01B activation contract (NOT implemented; proposed starting limits for owner review)

| Term | Proposed value |
|---|---|
| Provider / model | Meta Model API / `muse-spark-1.3`, exact |
| Billable attempts | maximum **1** |
| Input | at most 12,000 characters (`buildProposalRequest` only) |
| Output | at most 3,072 tokens including reasoning |
| Retries / fallback | **0** / none |
| Modality | text only, no video re-upload |
| Per-run human approval | mandatory (this task's CLI), valid ≤ 10 minutes, single use |
| Uncertain outcome | any timeout, network failure or unclear result permanently spends the attempt |

**Exact activation diff (a separate PR with its own independent audit):**
1. `config/live-authorization.json`: one LIVE-C3-01 entry with the exact approver, date and reference to the owner's recorded decision, and the limits above (`synthetic` absent). After that PR is merged, a separate pin-only commit fills `config/live-activation.json` (see the sequence above).
2. `packages/inference/src/reservations.ts`: `APPROVED_LIVE_QUOTA.meta` 0 → 1 (Baseten stays 0).
3. `packages/inference/src/patch-proposal.ts`: replace the hard-disabled `proposeCandidate` with the sequence `prepareProductionAttempt` (authorize → consume → re-check → claim) → exactly one `structuredResponse` (`retries: 0`) → `processProposalResponse` → `persistProposalArtifact` → `settle`, settling on every path; a new `scripts/c3-live-proposal.ts` runner; test updates replacing "always disabled" with "disabled unless every gate passes", keeping all refusal tests.
4. No change to the staging runner, the coordinator, the oracle or the patch grammar; proposals stay disconnected from execution (C3-B2B is a separate authorization).

**Authorization steps (owner, in order):** record the LIVE-C3-01 decision with exact values → independent audit and merge of the 01B PR (commit A) → compute the digest of A and commit the pin-only change (A') after review → fresh checkout at A', clean tree → run the zero-network preflight and keep its JSON → run `scripts/c3-approve-live-run.ts` in a real terminal for the run id and input hash, within 10 minutes → inject the Meta key for that one invocation only (never to an agent, file or chat) → run once → stop; any further attempt needs a new decision. A credit balance is not permission to spend.

## Acceptance

1. Approval/validator/CLI/rehearsal unit tests and the B2A/B1 suites pass; hosted CI passes.
2. Guard-removal testing on the new boundary: every removed check is caught, except redundant defence-in-depth checks reported individually.
3. Zero provider requests; no credential read; quota 0; entry point disabled; register empty; PC-1 three-replay regression and F01 baseline unchanged.
