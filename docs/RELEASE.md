# Release and Deployment

## Purpose

Make releases traceable, repeatable, reviewable, and recoverable.

## Release principles

- Human approval is the final production gate. Automation may prepare, stage, or execute an approved release workflow, but it must not remove the requirement for explicit human production-release approval.
- A release should be traceable to an exact source commit.
- Prefer promoting a known artifact through environments over rebuilding independently for production.
- Release automation should reduce manual error without hiding important decisions.
- Every material release should have a rollback or recovery strategy.

## Versioning

**Scheme:** [SemVer / CalVer / store build numbers / other]

Document:
- user-visible version;
- internal/build number;
- tag format;
- prerelease conventions.

## Repository enforcement

Repository-level branch/ruleset/status-check/environment configuration is defined in `docs/REPOSITORY-SETUP.md`. Do not assume policy text alone enforces merge or production gates.

## Environments

| Environment | Purpose | Deployment trigger | Approval |
|---|---|---|---|
| Local/Dev | Development | Manual/local | Developer/agent |
| CI | Validation | Push/PR | Automated |
| Staging/Test | Release candidate validation | Approved workflow | Project-defined |
| Production | User-facing release | Approved promotion | Human gate |

Adjust this table to match the product.

## PR CI vs release/deployment trust boundary

Ordinary pull-request validation and privileged release/deployment are different trust zones.

### Ordinary PR CI

PR validation may execute proposed code, including code from restricted or untrusted contributors. Therefore:

- default repository/token permission should remain read-only, normally `contents: read`;
- the common reusable validation workflow must not require production, deployment, signing, or store credentials;
- production/release secrets must not be passed through `secrets: inherit` merely because a reusable workflow supports secret inputs elsewhere;
- `id-token: write` is not part of ordinary PR validation;
- PR workflows must not deploy to production or perform irreversible release actions;
- fork/Dependabot-style restricted execution must be treated as a normal security boundary, not bypassed to make tests convenient.
- never use `pull_request_target` or a privileged `workflow_run` chained from PR validation to check out or execute untrusted PR code with secrets or a write-capable token.

Project-owned stack jobs may use explicitly scoped **non-production** credentials only when the test objective genuinely requires them and the project defines safe behavior when those credentials are unavailable in restricted PRs.

A push to `main` may validate or prepare a release candidate, but does **not** by itself authorize production deployment, publication, or release. Explicit human production-release approval remains mandatory.

### Privileged release/deployment

A release/deployment workflow or job path may request stronger privileges only when the release step actually requires them. It must preserve:

- explicit human production-release approval;
- exact source commit/candidate identity;
- release-only validation appropriate to the artifact/environment/store;
- narrowly scoped repository permissions;
- environment-scoped secrets where practical;
- rollback/recovery planning;
- post-release verification.

If GitHub OIDC is used, grant `id-token: write` only to the release/deployment job that exchanges identity for a short-lived external credential. Combine it with provider-side trust conditions and GitHub environment/repository protections where available. OIDC is a privileged trust capability; it is not a generic permission to add to shared PR workflows.

If long-lived secrets are unavoidable, scope them to the narrowest release environment/job possible and document ownership, rotation, recovery, and revocation. Do not move a production secret into repository-wide CI merely because a release command needs it.

### Reusable workflows and release privileges

The common reusable workflow is for universal validation, not deployment. Future release-specific reusable workflows, if any, must be separate from the common PR baseline and must not rely on the baseline caller to elevate permissions.

A caller controls the maximum `GITHUB_TOKEN` permissions available to a called reusable workflow; the called workflow must not assume it can elevate beyond the caller. Secrets must be explicitly supplied only to workflows that genuinely need them.

## Platform signing

For Android release artifacts, `release/android-signing.md` is the canonical cross-stack signing contract for Flutter, React Native, and native Android/Kotlin.

Android release policy:
- debug signing is development-only and must never sign a production artifact;
- release/upload private keys and passwords remain outside Git;
- signing secret/property names are standardized, but actual key material and password values are app-specific;
- CI must fail closed when release signing inputs are missing;
- final AAB/APK signatures must be verified before production submission;
- existing production signing identities must not be replaced merely to conform to template naming.

## Release candidate record

For each production candidate, be able to identify:

- source commit SHA;
- version/build number;
- dependency lock state;
- CI/check results;
- artifact/checksum where applicable;
- signing certificate/fingerprint where applicable (public metadata only; never private key material);
- target environment/store;
- deployment/release timestamp;
- approver;
- migration version;
- rollback/recovery path.

## Standard flow

```text
merge to main
    ↓
build candidate
    ↓
automated validation
    ↓
staging / store test track
    ↓
human release approval
    ↓
production promotion / submission
    ↓
smoke test
    ↓
observe
```

## Rollback / recovery

Document:
- last-known-good version;
- rollback command/process;
- migration rollback or forward-fix strategy;
- data restoration requirements;
- app-store rollback limitations if applicable.

## Release notes

Release notes should summarize:
- user-visible changes;
- security-relevant changes when appropriate;
- migrations or operational actions;
- known issues.

Do not use `docs/PROJECT-MEMORY.md` as the release changelog.

## Post-release

After release:
- verify critical journeys;
- monitor logs/crashes/errors;
- capture meaningful production feedback;
- create bounded follow-up tasks;
- update `docs/STATUS.md` when project state changes materially.
