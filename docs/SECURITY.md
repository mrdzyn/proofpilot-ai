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

## Proposed C3 boundary (NOT APPROVED, not in force)

`tasks/PP-META-I2-C3.md` proposes a narrower exception for fixture F01 only (decision SEC-C3-01, **NOT APPROVED**). It becomes part of this policy only after the owner records approval in a reviewable form and the independent reviewer accepts the exact head. As proposed:

- The model returns structured selector/property/value adjustments, never markup, scripts, CSS text or file paths. Trusted code validates them against a closed allowlist (forbidden-token scan first, then grammar), renders CSS from constants and applies it to `styles.css` in a disposable per-candidate staging workspace. `product.html`, `app.js`, the server and the whole trusted verifier are the approved-SHA bytes, hash-checked before and after the run.
- The unmodified oracle runs in that staging workspace at its fixed root and fixed port 4173, strictly serial. Nothing derived from a proposal is executed by Node.
- This removes model-authored executable content instead of containing it. It is not a sandbox and must not be described as one.
- Playwright request interception is defense in depth only, tested in a separate harness that cannot award a verdict. It is not process or OS isolation, and candidate oracle runs are not instrumented because that would require changing trust-root verifier files.
- Live proposal calls require a separate fail-closed adapter: completed lifecycle only, `retries: 0` regardless of configuration, exact model id match on request and response, bounded input and output, one-time exclusive reservations that are burned on every outcome, and a pre-authorized per-provider slot count that defaults to 0. No quantity is approved (decision LIVE-C3-01, **NOT APPROVED**).

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
