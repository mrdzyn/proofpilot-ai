# Repository Setup and Enforcement

## Purpose

Repository files express the engineering policy, but GitHub administrative settings enforce important parts of it.

Creating a repository from a template does **not** by itself guarantee that branch rules, required status checks, deployment environments, secrets, or production approvals are configured correctly. Complete this setup during greenfield initialization and assess it during brownfield adoption.

Official GitHub references:
- Rulesets: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets
- Rules available in rulesets: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets
- Deployment environments: https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment
- Encrypted secrets: https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions

GitHub plan/repository type can affect which controls are available. If a control is unavailable, document the compensating human/process control rather than pretending enforcement exists.

## Project adoption hygiene

The template should leave each project with **one canonical source per operating concern** and only the guidance that project actually needs.

### Brownfield reconciliation

Do not copy template files into a mature repository before mapping what already exists.

Create a reconciliation matrix in the adoption task/PR:

| Concern | Existing authoritative source | Template source | Decision | Canonical after adoption |
|---|---|---|---|---|
| Agent instructions | [PATH] | `AGENTS.md` | KEEP / MERGE / ADD / RETIRE | [PATH] |
| Current status | [PATH] | `docs/STATUS.md` | KEEP / MERGE / ADD / RETIRE | [PATH] |
| Handoffs / continuation | [PATH] | `docs/HANDOFFS.md` | KEEP / MERGE / ADD / RETIRE | [PATH] |
| Architecture | [PATH] | `docs/ARCHITECTURE.md` | KEEP / MERGE / ADD / RETIRE | [PATH] |
| Testing | [PATH] | `docs/TESTING.md` | KEEP / MERGE / ADD / RETIRE | [PATH] |
| Security/privacy | [PATH] | `docs/SECURITY.md` | KEEP / MERGE / ADD / RETIRE | [PATH] |
| Release | [PATH] | `docs/RELEASE.md` | KEEP / MERGE / ADD / RETIRE | [PATH] |
| Durable memory | [PATH] | `docs/PROJECT-MEMORY.md` | KEEP / MERGE / ADD / RETIRE | [PATH] |
| PR CI / required checks | [existing workflows and contexts] | `ci.yml` + `common-validation.yml` | KEEP / MERGE / ADD / RETIRE | [canonical CI + stack jobs] |
| Post-merge/release CI | [push-main consumers and release jobs] | `docs/RELEASE.md` | KEEP / MERGE / ADD / RETIRE | [canonical release pipeline] |

Decision meanings:
- **KEEP** — the existing project source already satisfies the concern and remains canonical.
- **MERGE** — add only missing template controls into the existing canonical source; do not create a second policy.
- **ADD** — no authoritative equivalent exists, so add the needed project artifact.
- **RETIRE** — remove an obsolete/duplicate source, or reduce it to a short pointer to the canonical source when a compatibility path must remain. Before retiring a source, confirm that any unique content it contains has been merged into the canonical source or is deliberately no longer needed; never retire a source merely because its filename overlaps with the template.

Rules:
- for CI, reconcile **all** required contexts, PR versus `push: main`/manual triggers, privileged release jobs, permissions and unique tests before changing any pipeline;
- **KEEP** stronger existing CI; **MERGE** only missing checks without losing unique coverage; **ADD** the paired reusable workflow and caller only when needed; **RETIRE** duplicate jobs only after preserving unique behavior and safely migrating required statuses;
- in brownfield repositories, an equivalent project-owned CI system may remain canonical; do not force the template filenames or remove `push: main` when release/artifact/coverage consumers still depend on it;
- never copy or require the master-only `Template integrity` job in a child repository;
- one concern should end with one authoritative source;
- project-specific guidance outranks generic template guidance unless it conflicts with the human-gated safety model;
- do not duplicate policy merely to match template filenames;
- if Project Baseline expects a path that the mature repository intentionally replaces, adapt the baseline mapping/validator deliberately rather than maintaining two competing documents;
- update `AGENTS.md`, task templates, and other pointers so agents load only the canonical source;
- if two existing sources conflict materially and authority is unclear, stop for owner resolution before editing either one.

### Greenfield pruning

A repository created with **Use this template** initially contains the complete master-template inventory. After `config/project-profile.json` is changed to `repositoryMode: "project"`, prune inherited material that is not part of the new project.

Always:
- replace master `README.md`, product/architecture/status content, and placeholders with project-specific content;
- remove the master-only block from `docs/PROJECT-MEMORY.md`;
- remove the inherited master-template handoff block from `docs/HANDOFFS.md` while retaining its policy/template and generic entry markers, then reset `docs/STATUS.md` to `Active handoff: None`;
- **keep** `.github/workflows/ci.yml` **and** `.github/workflows/common-validation.yml` together: the former calls the latter via `uses: ./.github/workflows/common-validation.yml`; removing the callee breaks the child PR workflow;
- **keep** `scripts/validate_project_profile.py` (used by the shared baseline);
- **remove** `.github/workflows/template-integrity.yml`, `scripts/validate_master_template.py` and `scripts/test_validate_project_profile.py` (all master-only);
- remove inherited master task/history files under `tasks/` while keeping `tasks/README.md` and `tasks/TEMPLATE.md`, then create only project-specific task files;
- verify the shared baseline's master-only inventory and self-test steps retain the `github.repository == 'mrdzyn/ai-native-project-template'` guard and skip in the child;
- verify on a real child PR that `Project baseline / Common validation` emits and passes. Add and require real project stack lint/test/build/security checks separately; GitHub ruleset settings do **not** copy from the master repository.

Then prune optional packs according to the project profile:
- if `capabilities.design=false`, remove `docs/DESIGN-SYSTEM.md`, `docs/ACCESSIBILITY.md`, and `design/`;
- if design is enabled, keep the design core but remove unselected platform files and unselected design-integration guides;
- if `capabilities.storeRelease=false`, remove `store/`;
- if store release is enabled, keep the shared distribution core and selected storefront profiles; remove unselected storefronts and app-store overlays that do not apply;
- keep `store/china-mainland-games.md` only when mainland-China game distribution is actually in scope;
- remove unselected third-party integration guides under `integrations/`; the directory README may be removed when no integration guidance remains;
- keep `release/android-signing.md` only when Android, Google Play, or Huawei AppGallery is in scope.

Core operating-model files required by Project Baseline should remain unless an approved brownfield mapping intentionally replaces them. An optional file may be retained despite not being selected only when the project documents a concrete reason; it must not become default agent context merely because it is present.

Pruning is a **greenfield bootstrap step**, not a recurring cleanup job. Do it before normal feature work so future agents do not spend context on inherited template material.

## Main branch baseline

Configure `main` with a branch protection rule or ruleset appropriate to the repository.

Recommended baseline:
- require changes through a pull request;
- require the project CI status checks before merge;
- block force pushes to protected release branches;
- block branch deletion where appropriate;
- require conversation resolution where the team workflow supports it;
- prevent bypass except for explicitly governed break-glass administration;
- keep the repository's default branch set to `main`.

For generated/adopted projects, the minimum universal CI gate is the status check emitted by the project baseline caller/reusable-workflow pair — currently **`Project baseline / Common validation`** — plus the project's real stack-specific validation jobs. Confirm the exact emitted check name in GitHub before making it required; reusable-workflow composition can affect the final check context.

For the canonical master template repository, require **only** `Project baseline / Common validation`. The standalone `Template integrity` workflow is **manual-only** and must **not** be configured as a required PR status check. Restore that requirement only after first restoring its `pull_request` trigger via a reviewed PR, then verifying on a **subsequent real PR** that the check is emitted and passes, and finally obtaining separate owner approval to re-require it (rollback order below).

## Review and human approval

The operating model requires:

```text
implementation → CI → independent review → human approval → merge
```

Where GitHub supports the desired reviewer model, configure required PR approvals and stale-review handling.

For a solo-owner repository where a GitHub approval rule would make normal work impossible, do not fabricate an approval. Keep required CI, independent audit evidence in the PR, explicit owner approval before merge, and protected direct-push behavior where available.

## Direct pushes and force pushes

Routine feature work should not bypass PR review by pushing directly to `main`.

Recommended:
- disallow force pushes to `main`;
- disallow deletion of protected release branches;
- limit bypass permissions;
- when an owner/admin CI-availability exception is required, prefer a ruleset bypass configured as **For pull requests only** so the actor must still use a pull request and does not gain routine direct-push authority;
- document any emergency/break-glass path and require follow-up review.

## Required status checks

Do not rely only on the generic template check.

Require the stable emitted contexts for checks that protect merge safety, as defined by the gate classes in `docs/TESTING.md`:

- `Project baseline / Common validation` (confirm this actual emitted check name for the child repository);
- stack-specific lint/static analysis where required;
- typecheck/compile where applicable;
- risk-required tests;
- build/package validation when needed for merge safety;
- security/dependency checks appropriate to the product;
- artifact validation only when needed to establish **PR merge safety**. Verification of the exact signed/published release candidate belongs to the **release-only** gate in `docs/TESTING.md` and `docs/RELEASE.md`.

A check should only be marked required after its name and behavior are stable enough not to deadlock merges.

### Project-owned stack extension contract

The reusable common-validation workflow is deliberately stack-neutral. Child projects extend CI by adding **explicit sibling jobs** in their own `.github/workflows/ci.yml`; do not add arbitrary command inputs to `.github/workflows/common-validation.yml` merely to centralize stack behavior.

Recommended shape:

```yaml
jobs:
  project-baseline:
    name: Project baseline
    permissions:
      contents: read
    uses: ./.github/workflows/common-validation.yml

  stack-validation:
    name: Stack validation
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@<PINNED_COMMIT>
        with:
          persist-credentials: false
      - name: Set up toolchain
        run: <PROJECT-OWNED SETUP>
      - name: Validate
        run: <PROJECT-OWNED COMMAND>
```

Replace the placeholder stack job with the project's real native commands and split it into stable jobs when separate status checks are useful. Examples include lint/static analysis, typecheck/analyze, unit or targeted integration tests, build/package, and security/dependency checks.

Rules:

- keep stack commands in the project's native package/build system or small project-owned scripts when that improves local/CI parity;
- keep stack jobs visible in the project repository rather than hiding them behind a universal command-runner configuration;
- do not create empty/fake jobs for ecosystems the project does not use;
- choose stable job names before making their emitted status checks required;
- use the narrowest practical `permissions`; ordinary PR validation should normally remain `contents: read`;
- follow the canonical PR vs release/deployment trust boundary in `docs/RELEASE.md` for production secrets, restricted-fork credentials, `pull_request_target`, privileged `workflow_run`, OIDC, and release/signing/store/deployment separation.

The four gate classes — required PR, optional informational, release-only, and manual/human — are defined in `docs/TESTING.md`. Do not make every CI job required merely because it exists.

### CI availability / hosted-runner quota exception

Required CI is the normal merge gate. A project should also define what happens when the required GitHub-hosted checks **cannot execute at all** for reasons outside the proposed change, such as:

- the repository owner's included GitHub Actions quota is exhausted and additional hosted-runner use is blocked;
- GitHub Actions or the required hosted runner is experiencing a service outage;
- an account/repository runner-availability condition prevents the required job from starting.

This exception is **not** valid when the workflow ran and found a real failure. A failing test, build, security check, signing check, migration check, or policy validation must be fixed or explicitly handled through the normal risk-acceptance process; do not relabel it as "CI unavailable."

Recommended break-glass process:

1. Keep the change in a pull request. Do not switch to a direct push to the protected branch.
2. Record the CI-unavailable reason in the PR, with enough evidence to distinguish external runner/quota unavailability from a real code/check failure.
3. Run the equivalent required validation locally or on another approved trusted execution path and record the commands/results actually obtained. If equivalent required validation cannot be executed, the CI-unavailable bypass must not be used.
4. Record the exact PR head SHA covered by the equivalent validation, then complete the repository's required independent review/audit against that same head. If the PR head changes afterward, repeat the equivalent validation and independent review for the new head before using the bypass.
5. Require an explicit project-owner or authorized repository-admin decision to use the exception.
6. Use a **pull-request-only** ruleset bypass where GitHub supports it. Do not grant a blanket always-bypass role merely to solve temporary CI unavailability.
7. Keep the normal required-check configuration in place for future PRs. Do not globally remove the checks or disable the ruleset as the routine workaround.
8. After hosted CI becomes available again, resume the normal required-CI path.

Suggested PR record:

```text
CI availability exception:
GitHub-hosted Actions could not execute because [quota/service/runner availability reason].
Validated PR head SHA: [exact SHA].
Equivalent required checks run outside hosted CI: [commands/results].
Independent exact-head review: [completed/reference].
Owner/admin PR-only bypass approved by: [name/role].
No genuine failing executable check is being overridden.
If the PR head changes, this evidence and review must be repeated for the new head before bypass.
```

Where supported, configure the branch ruleset bypass list with only the smallest appropriate owner/admin actor or role and set its bypass mode to **For pull requests only**. This preserves a PR/audit trail while preventing the exception from becoming direct-push permission.

### Master-template-only CI notes

The originating template repository keeps its own master-only CI governance (Template Integrity inventory and self-tests). Those notes are not applicable to ProofPilot AI and were removed from this copy for publication. In a generated project, the baseline's master-only steps are guarded by `github.repository` and skip.

### CI trigger economy

For a repository with enforced required PR checks, the **default** universal validation trigger is one PR run, not a duplicate run after every merge. The master template and newly generated projects use:

```yaml
on:
  pull_request:
  workflow_dispatch:
```

This means:
- ordinary changes are validated on PRs; protected `main` requires the emitted validation status before merge;
- no redundant universal-validation runner jobs start automatically just because the reviewed PR is merged;
- a human can dispatch the workflow on `main` when an exact post-merge validation run is needed, without granting PR jobs production credentials.

**Trade-off:** PR validation is not proof that an exact post-merge commit or production artifact has been verified. A project requiring that guarantee must explicitly retain appropriate `push` validation or add an independent release-candidate validation gate (per `docs/RELEASE.md`). PR-only checks are **not** production-release authorization.

For an existing/brownfield repository, inspect consumers of `push: main` (release preparation, branch coverage, external automation, badge/monitoring status, environment readiness, etc.) before removing it. Preserve a required post-merge trigger if it protects a real invariant; do not blindly apply the default to projects with different CI/release needs.

If a project adds explicit stack-specific jobs, place their required PR checks in the project workflow without also running the same expensive matrix on feature-branch pushes. Use normal PR concurrency cancellation where appropriate; cancellation cannot substitute for required validation.

Do not make a required workflow depend on `paths:`, `paths-ignore:`, or other filters that can skip its required context and leave a PR blocked. Keep required check names stable, and coordinate any rule change independently of trigger optimization.

### Optional self-hosted runner fallback

Self-hosted runners may be used as an optional fallback when hosted-runner quota or availability is the constraint. They are not a default dependency of this template.

If used:
- treat the runner machine as security-sensitive infrastructure;
- keep it patched and access-controlled;
- avoid exposing long-lived production credentials to general CI jobs;
- self-hosted runners are especially risky on public repositories, where external contributors can open pull requests that may execute workflow code; avoid them for public repos unless the project has a deliberate, reviewed containment model such as ephemeral/isolated runners plus explicit approval for workflows from forks;
- isolate or avoid untrusted fork/PR code on persistent privileged runners unless the project has a deliberate containment model;
- keep runner labels/repository access scoped as narrowly as practical;
- document who operates the runner and how it is recovered or disabled.

The project may choose the simpler documented PR-only bypass + equivalent local validation process instead of operating self-hosted infrastructure.

## Repository secrets and variables

Use GitHub Actions secrets/variables or an approved external secret manager.

Rules:
- never commit secrets to source;
- separate development/staging/production credentials;
- scope credentials with least privilege;
- use environment-scoped secrets for production where appropriate;
- prefer short-lived/federated cloud credentials when supported;
- document required secret/variable names without recording values;
- rotate credentials when exposure is suspected.

Maintain a project-specific setup table, for example:

| Name | Type | Environment | Purpose | Owner |
|---|---|---|---|---|
| `DEPLOY_TOKEN` | secret | staging | deployment | TBD |

For Android release projects, `release/android-signing.md` defines the canonical signing names:

| Name | Type | Typical scope | Purpose |
|---|---|---|---|
| `ANDROID_UPLOAD_KEYSTORE_BASE64` | secret | release/production | CI transport of app-specific upload keystore |
| `ANDROID_UPLOAD_STORE_PASSWORD` | secret | release/production | keystore password |
| `ANDROID_UPLOAD_KEY_ALIAS` | variable/config | release/production | upload/release key alias (greenfield default: `upload`) |
| `ANDROID_UPLOAD_KEY_PASSWORD` | secret | release/production | upload private-key password |
| `ANDROID_UPLOAD_STORE_FILE` | runtime variable | build job | temporary/local keystore path |

Record names only, never values. Base64 keystore content is still critical secret material.

## Environments

For projects with deployment automation, use explicit environments such as:

```text
development → staging/test → production
```

Production should remain human-gated.

Where supported, configure:
- required reviewers/protection rules;
- environment-scoped secrets;
- deployment branch/tag restrictions;
- clear environment naming;
- audit-friendly release records.

If GitHub environment reviewers are unavailable, retain the explicit human approval gate in the release process and document the compensating control.

## Store releases

App-store submission is a production release.

For app-store projects:
- use the applicable `store/` profiles;
- for Android, also follow `release/android-signing.md`;
- protect signing keys/certificates;
- separate sandbox/test from production commerce credentials;
- record the exact source SHA/build submitted;
- require human release approval before submission.

## Greenfield checklist

- [ ] `config/project-profile.json` changed from `template` to `project`.
- [ ] Relevant capability packs selected.
- [ ] Master-only memory and Template Integrity workflow removed.
- [ ] Inherited master handoff block removed; HANDOFFS policy/template and generic entry markers retained; `Active handoff` reset to `None`.
- [ ] Inherited master task/history files removed; only task scaffolding and project tasks remain.
- [ ] Unselected optional design/store/platform/integration/release guidance pruned or explicitly justified.
- [ ] Master-only capability self-test script removed unless intentionally maintained by the child project.
- [ ] Canonical core operating-model files contain project-specific rather than master-template status/history.
- [ ] Default branch confirmed.
- [ ] PR/ruleset or branch-protection configuration reviewed.
- [ ] Required CI checks selected.
- [ ] CI trigger model avoids duplicate feature-branch push + pull-request validation unless explicitly justified.
- [ ] CI-unavailable/quota break-glass process documented; if bypass is configured, it is pull-request-only and limited to the smallest appropriate owner/admin actor or role.
- [ ] Direct/force-push policy configured.
- [ ] Review/conversation rules configured where practical.
- [ ] Repository/environment secrets and variables identified.
- [ ] Production environment/protection configured where applicable.
- [ ] Human merge and production gates confirmed.

## Brownfield checklist

Before changing settings:
- [ ] build the KEEP / MERGE / ADD / RETIRE reconciliation matrix;
- [ ] identify one canonical source for each operating concern;
- [ ] identify duplicate/conflicting instructions and resolve authority before editing;
- [ ] reconcile any existing handoff/continuation mechanism so only one remains canonical;
- [ ] update agent/task pointers so retired sources are not loaded;
- [ ] inspect existing branch protections/rulesets;
- [ ] inspect current required status checks, integration identities and any potential rename-induced merge deadlock;
- [ ] if using the inherited baseline caller, retain its same-repository `.github/workflows/common-validation.yml` dependency;
- [ ] inspect whether branch-push and pull-request workflows duplicate validation/cost; check post-merge/release consumers before removing `push: main`;
- [ ] preserve stronger existing stack-specific and privileged release controls; exclude the master-only Template Integrity workflow;
- [ ] inspect existing ruleset bypass actors/modes and preserve or tighten any CI-unavailable break-glass path;
- [ ] inspect deployment environments;
- [ ] identify existing secrets/variables without exposing values;
- [ ] preserve stronger existing controls;
- [ ] identify conflicts before replacing policy;
- [ ] document any control the template cannot enforce automatically.

Do not weaken a mature repository's protections merely to make it resemble the template.
