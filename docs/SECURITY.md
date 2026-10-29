# Security and Privacy Baseline

## Purpose

Minimum security and privacy expectations for ProofPilot AI, plus its product-specific trust boundaries.

## Core rules

- Never commit secrets, credentials, tokens, private keys, production datasets, or sensitive local configuration.
- Use least privilege for users, services, agents, CI jobs, and deployment credentials.
- Treat all external input as untrusted.
- Preserve authorization checks at every trust boundary.
- Prefer secure defaults and explicit failure over silent fallback that weakens protection.
- Log security-relevant events without leaking secrets or unnecessary personal data.
- Do not disable security controls merely to unblock development.

## Data classification

Document the categories the product handles:

| Data type | Collected? | Sensitivity | Storage | Retention |
|---|---:|---|---|---|
| Anonymous telemetry | TBD | Low/Medium | TBD | TBD |
| Account identifiers | TBD | Medium | TBD | TBD |
| Personal data | TBD | High | TBD | TBD |
| Payment data | TBD | High | TBD | TBD |
| Secrets/credentials | TBD | Critical | Never in source | Minimal |

## Secrets management

- Local secrets belong in ignored environment/config files.
- CI/CD secrets belong in approved secret stores.
- Production secrets must not be copied into documentation, tickets, prompts, or logs.
- Provide sanitized `.env.example` or equivalent when configuration guidance is needed.
- Rotate exposed credentials immediately and treat repository history as compromised if a secret was committed.
- ProofPilot provider keys (`MODEL_API_KEY`, `BASETEN_API_KEY`) are read only from the server-side environment (`.env.local`, gitignored). They are never logged, printed, written to evidence, or passed to the browser/oracle process (`scrubEnv`).

## Authentication and authorization

Document:
- identity provider or authentication mechanism;
- session/token model;
- authorization roles/permissions;
- tenant isolation rules;
- privileged/admin operations;
- recovery flows.

Security-sensitive authorization must be enforced server-side or at the authoritative trust boundary, not only in the UI.

## Dependency and supply-chain security

- Pin/lock dependencies using the stack's normal mechanism.
- Review new dependencies for necessity and maintenance risk.
- Run dependency/security scanning appropriate to the stack.
- Do not accept generated packages, binaries, or build artifacts from unknown sources without verification.

## ProofPilot-specific boundaries

| Asset | Trust | Control |
|---|---|---|
| Provider API keys | Secret | Env only; sent only to the allowlisted HTTPS host; `redirect: "error"`; errors redacted and truncated; scrubbed from child processes |
| Trusted oracle (`verifier/`), verdict logic (`packages/core/`), patch policy | Trust root | Denied by `config/patch-policy.json`; enforced in `tests/security/trust-root.test.ts` |
| Fixture code, page text, recordings, model output | Untrusted data | Never executed as instructions; verdicts come only from Playwright results via deterministic code |
| Run evidence (`.proofpilot/`) | Local, gitignored | SHA-256 hashed per run; contains no credentials |
| Billable inference | Owner-gated | Off unless `PROOFPILOT_ALLOW_BILLABLE_CALLS=1` |
| User recording (C2A) | Untrusted input; leaves the machine only with consent | Validated locally first (real signature, size, duration, codec, full decode); consent bound to run + provider + SHA-256; bytes re-verified before upload; second opt-in `PROOFPILOT_ALLOW_VIDEO_UPLOAD=1`; expiring remote file deleted in `finally`; no retry of upload; local copy under gitignored `.proofpilot/` |
| Media tools (`ffprobe`/`ffmpeg`) | Run on untrusted bytes | Only on a private 0700 temp copy of the validated bytes; `-protocol_whitelist file`; credential-scrubbed env; timeouts; no shell; temp dir always removed |
| Model output (Symptom) | Untrusted hypothesis | Strict local schema; unknown keys rejected; `provenance` set by code; can never become a verdict or oracle evidence; text rendered as data |
| Provider-returned file ids | Untrusted | Must match `^file-[A-Za-z0-9_-]{1,64}$` before any request path is built |

Data classification: the MVP handles only synthetic fixtures and owner-made recordings. Model inputs are sent to Meta (or Baseten if selected); this is not an offline-privacy product.

Known gaps:

- **Live Meta behaviour.** Two single-use live video-analysis smokes ran in C2B; run 002 completed (agent-reported, not independently replayed or provider-confirmed; see `docs/STATUS.md`). The text/patch-proposal path has **never** been run live.
- **`generateText` is not safe for proposals.** It uses the configured retry count (`PROOFPILOT_INFERENCE_MAX_RETRIES` may exceed 0) and does not check Responses `status`, `error`, `incomplete_details` or refusal items before extracting text. The video path is stricter. C3 must use a separate fail-closed adapter (`tasks/PP-META-I2-C3.md`); `generateText` must not be used for patch proposals.
- The `text.format` and response shapes are OpenAI-compatible assumptions. H.264-only acceptance is a deliberate fail-safe pending live confirmation of other codecs.
- **No verified sandbox.** Container validation is NOT VERIFIED (the agent environment lacks Docker access). **In force today:** no AI-generated code or candidate patch executes until an independently verified OS/container sandbox exists. This remains the rule for HTML, JavaScript, free-form CSS and multi-file patches.
- The policy lint is a pattern check, not a full secret scanner.

## C3 boundary (SEC-C3-01 APPROVED, strictly bounded; LIVE-C3-01 and UI-C3-01 NOT approved)

The owner approved decision **SEC-C3-01** on 2026-10-28 (record: `tasks/PP-META-I2-C3.md` approval register, PR #6 comment 6460953906). The approval covers only the narrow design below for fixture F01. It does **not** certify that the unimplemented parts work, and it does **not** widen the "no AI-generated code executes" rule above for anything else:

- **In force today:** only hand-authored control inputs (PV-1/PC-1 and PV-2/NC-1) may be rendered and run, through the C3-0 staging harness (`scripts/c3-stage-spike.ts`). No model-generated candidate may execute until the C3-A validator and its tests exist, the staging proof has passed independent exact-head audit, and any further required approval is recorded.
- **Still prohibited, pending independently verified OS/container isolation and a separate owner decision:** model-authored HTML, JavaScript, free-form CSS, file paths, multi-file patches and any change to trust roots. Docker/sandbox remains NOT VERIFIED.
- **Not approved:** LIVE-C3-01 (12 Meta + 4 Baseten calls are proposed maximums only; the effective billable quota is 0, and any live inference needs separate explicit owner authorization) and UI-C3-01 (report layout).

The approved design:

- The model returns structured selector/property/value adjustments, never markup, scripts, CSS text or file paths. Trusted code parses strictly, scans the **parsed** keys and strings for forbidden content, validates against a closed grammar, renders CSS from host constants and applies it to `styles.css` in a disposable per-candidate staging workspace (pipeline: `tasks/PP-META-I2-C3.md`). `product.html`, `app.js`, the server and the whole trusted verifier are the approved-SHA bytes, hash-checked before and after the run.
- The unmodified oracle runs in that staging workspace at its fixed root and fixed port 4173, strictly serial, under an exclusive lock. Nothing derived from a proposal is executed by Node.
- A candidate is reported as passing only if the oracle process exits 0, both trusted tests pass with the expected observations, the Playwright trace shows the staged candidate was served, integrity checks pass after the run, and the hashed evidence record was persisted and read back. Any abnormal exit or incomplete evidence is `INCONCLUSIVE`. `ORACLE_PASS` is a single run and is not `VERIFIED`.
- This removes model-authored executable content instead of containing it. It is not a sandbox and must not be described as one. Dependency integrity in the stage is detected, not enforced; browser binaries are outside the manifests.
- Playwright request interception is defense in depth only, tested in a separate harness that cannot award a verdict. It is not process or OS isolation, and candidate oracle runs are not instrumented because that would require changing trust-root verifier files.
- **C3-A implementation (mock-tested; no live call exists):** `packages/core/src/patch-proposal.ts` (pipeline V0 to V7), `packages/inference/src/patch-proposal.ts` (pure pre-flight, response processing and artifact pieces) and `reservations.ts` (single-use run ids and quota slots). The production entry point `proposeCandidate` is **hard-disabled**: it rejects before reading its argument or touching any provider, reservation or file, whatever transport, credentials, consent or quota the caller supplies (a caller-asserted transport label is not a security boundary and was removed). `APPROVED_LIVE_QUOTA = {meta: 0, baseten: 0}` is a frozen code constant. The full flow runs only in the test-only harness `tests/support/proposal-harness.ts`, which production code never imports. Proposals require an explicit `status: "completed"`. Orphan quota slots are never recycled and are listed read-only for operator reconciliation. `createProposalConsent` only builds a record; real human approval for live use must be captured and audited separately. Proposal artifacts are labelled `UNTRUSTED PROPOSAL — NOT VERIFIED`. Nothing in C3-A executes a proposal.
- **C3-B1 (offline, hand-authored controls only):** the coordinator (`candidate-coordinator.ts`) imports no provider or proposal code; `VERIFIED` is returned in exactly one pure function and is recomputed from persisted evidence by `verifyScoreboard`, which also requires the exact control inventory, recomputes NC-5, replay counts and metadata, binds the baseline and every replay (record and manifest) to the approved SHA and the baseline's trusted-file manifest, requires exactly one `F01-MOBILE` and one `F01-DESKTOP` source proof per run, and rebuilds every published replay field (including mobile, desktop, failure message and evidence problems) from the persisted record and evidence, pinning the baseline to `BASELINE/replay-1` and each record to its control label; DID-1 (`containment-demo.ts`) is a separate Playwright-routing demonstration that is not a candidate verdict and not proof of candidate sandboxing. `docs/BASETEN-COMPATIBILITY-PLAN.md` and `docs/MODAL-FEASIBILITY-PROPOSAL.md` are plans only: no Baseten or Modal request exists, a hosted backend is prohibited by the C3 contract (HOST-C3-01 not requested), and Modal is not a verified boundary.
- **C3-LIVE-01B0 (proposal orchestration; mock-only, enables nothing):** `runSyntheticProposalAttempt` (`proposal-orchestrator.ts`) runs preflight, authorize/consume/claim on a SYNTHETIC context, one scripted response, strict lifecycle/model/grammar validation, a sanitized `UNTRUSTED PROPOSAL — NOT VERIFIED` artifact, and settlement, then stops. It refuses production contexts and any transport that is not a data-only `scriptedTransport` (no fetch, env or credential), its post-claim tail is module-private, it is imported only by the synthetic rehearsal and not exported from the index, and a static test fails if any module combines `prepareProductionAttempt` with a model call (there is no production runner until a separately approved C3-LIVE-01B). Raw provider text and exception messages are never persisted; a persistence failure drops the adjustments; a settlement failure leaves the claim spent; no outcome retries or releases anything. `proposeCandidate()` still rejects before reading its argument whatever the environment or arguments say. The exact later activation diff is in `tasks/PP-META-I2-C3-LIVE-01B0.md` and is NOT applied.
- **C3-LIVE-01A remediation (audit 2, revision identity):** the owner pin authenticates the revision RELATIONSHIP, not only tree contents: besides the pin-excluded tree digest, `checkActivation` (shared by the CLI and the validator) requires the pinned activation commit to be an ancestor of HEAD with every commit in `A..HEAD` linear and changing only `config/live-activation.json` (1 to 50 commits). An unauthorized clean same-tree descendant (`--allow-empty`, revert/recommit, empty commit before the pin, merge, same-tree sibling) is refused with `REVISION_NOT_APPROVED`. Re-pinning is a reviewed pin-only commit (or a reviewed new activation commit, then a pin-only commit). Boundary: git cannot prove a commit's SHA from its tree and the repository cannot authenticate commit authors; structure is enforced and the pin edit's authenticity is the owner's review of that commit.
- **C3-LIVE-01A remediation (audit 1):** the only production authorization API is `authorizeProductionAttempt` / `prepareProductionAttempt` (`live-gate.ts`); it derives the install root, register, owner-pinned activation revision (`config/live-activation.json`, a tree digest excluding the pin file), real Git state, directories and quota internally and ignores every other argument property, so a fake repository root, forged Git probe, synthetic approval or simulated quota cannot authorize a production attempt. The injectable core and CLI-with-context are not exported from the package index; a static test limits importers. HEAD must equal the owner-pinned activation revision (else `REVISION_NOT_APPROVED`) for both the CLI and the validator; approvals are bound to the pinned digest. Existing `.proofpilot` and its parent must be real, self-owned, non-group/other-writable directories (refused, never chmod-ed). Limits: a same-user attacker with full write access can still forge local files; ownership checks for another user are not testable here.
- **C3-LIVE-01A (approval gate; enables nothing):** `config/live-authorization.json` is the only place a live decision can exist and it is EMPTY, so `authorizeProductionAttempt` (the only production authorization API) fails with `LIVE_NOT_APPROVED`. Operator approvals (`.proofpilot/approvals/<runId>.json`, gitignored, directory 0700, files 0600) are created only by an interactive TTY command (`scripts/c3-approve-live-run.ts`) that reads no environment variable, requires the exact phrase `APPROVE <runId> <input-hash-prefix>`, and is itself refused unless the repository register holds an approved decision. A record is **self-declared and NOT authenticated identity**; its digest detects accidents and edits, not an attacker who can write the operator's files, so authority comes from the register, the code quota and the audit trail. Records are published with temp file + `link()` (exclusive, atomic), read with `O_NOFOLLOW` and verified on the opened file (regular, one link, 0600, own uid), bound to run id, provider `meta`, model `muse-spark-1.3`, input hash, repository SHA and register digest, expire in 10 minutes (max 15), and are spent by exclusive creation of `<runId>.consumed` before the reservation is claimed, with expiry/HEAD/tree/lock re-checked in between; nothing is ever released. The synthetic rehearsal is zero-network, uses a disposable directory and a synthetic decision that the production wrapper rejects, and never produces `VERIFIED`. Model-derived adjustments remain disconnected from the staging runner and coordinator (static import checks).
- **C3-B2A (readiness only):** `runProposalPreflight` (`scripts/c3-proposal-preflight.ts`) is a deterministic offline check over mock literals: it has no provider construction, no fetch, no environment or file read of secrets (instrumented-environment tests prove zero access to `MODEL_API_KEY`/`BASETEN_API_KEY` by default); credential presence is a boolean and only on request; it reports `NOT_AUTHORIZED_TECHNICALLY_READY` or `TECHNICAL_BLOCKERS` and can never authorize. `runOfflineVerification` refuses any control that is not one of the in-code hand-authored control OBJECTS (`assertHandAuthoredControls`): provenance is object identity (deep-frozen definitions registered in a module-private set), not field equality, so a model-derived clone with identical CSS and metadata, or a control carrying a foreign `check` callback, is refused before any lock, stage, runner or browser; there is no production injection path. The default preflight never reads a provider API-key field (`loadProviderConfig(..., {readApiKey:false})`); only `--check-credentials` reads the selected provider's key, to report presence. The Baseten discovery tool (`scripts/baseten-model-discovery.ts`) is owner-run only: dry run by default, `--execute` plus `PROOFPILOT_ALLOW_PROVIDER_DISCOVERY=1` for exactly one non-billable `GET /models` with retries forced to 0, no secret printed, public alias never substituted; nothing else imports it. `docs/LIVE-C3-01-DECISION-RECORD.md` is a proposal and is **NOT APPROVED**; a credit balance is not permission to spend. Modal documentation lists vendor-documented egress controls but Modal is not a verified boundary and HOST-C3-01 is not approved.
- Live proposal calls require a separate fail-closed adapter: completed lifecycle only, `retries: 0` regardless of configuration, exact model id match on request and response, bounded input and output, one-time exclusive reservations that are burned on every outcome, and a pre-authorized per-provider slot count that defaults to 0.

## AI-agent boundaries

AI agents may:
- edit code and docs inside assigned scope;
- run approved tests and analysis;
- prepare pull requests.

### Absolute prohibitions

AI agents must never:
- reveal, print, exfiltrate, or intentionally expose secrets or credentials;
- falsify validation results or claim an unrun check passed;
- bypass, disable, or conceal a required review/security/quality gate;
- silently weaken authentication, authorization, tenant isolation, encryption, or other security boundaries.

### Privileged actions requiring explicit human authorization

AI agents may perform the following only when the current task includes explicit human authorization and an approved mechanism:
- rotate or change production credentials without exposing their values;
- alter production data;
- execute a production deployment or release;
- merge a reviewed change after the human approval gate has been satisfied.

Authorization for a privileged action does not authorize bypassing required validation, review, auditability, or security controls.

## Logging and observability

Logs should:
- support debugging and security investigation;
- avoid secrets;
- minimize personal/sensitive content;
- include correlation or request identifiers where useful;
- have documented retention for production systems.

## Vulnerability handling

For a suspected vulnerability:
1. avoid public disclosure until impact is understood;
2. preserve evidence and relevant logs;
3. identify affected versions/environments;
4. contain exposure;
5. fix through reviewed changes;
6. rotate compromised credentials where applicable;
7. document durable lessons in project memory when useful.

## Release security gate

Before production release, confirm:
- required security tests/checks passed;
- no unresolved critical/high-severity issue blocks the release;
- configuration and secrets are supplied through approved mechanisms;
- migration and rollback implications are understood;
- security/privacy-impacting changes received human review.
