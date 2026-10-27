# Agent Task Contract Standard

## Purpose

A task contract is the boundary between project/orchestration decisions and implementation work. It should let any capable coding agent understand exactly what it is being asked to change, what it must not change, and how completion will be judged.

Task contracts should be concise enough to read before coding and specific enough to prevent accidental scope expansion.

## Required fields

Every non-trivial task should define:

1. **Task ID and title**
2. **Objective**
3. **Context**
4. **Delivery mode / UI design gate**
5. **Allowed scope**
6. **Forbidden scope**
7. **Acceptance criteria**
8. **Required validation** — test objective, minimum automated evidence, manual QA, and required CI/release gates
9. **Documentation updates**
10. **Deliverable**
11. **Stop / escalation conditions**
12. **Completion handoff** — when responsibility transfers, follow `docs/HANDOFFS.md`

For material user-facing UI, the delivery-mode section must also identify:
- requirements/product-contract artifact;
- screen map and user-flow artifact;
- approved screen design/mockup reference;
- required states and accessibility/responsive considerations;
- human design-approval status;
- UI shell scope and what remains stubbed/fixture-backed;
- wiring scope for business logic, state, persistence, APIs, authentication/authorization, and integrations;
- executable test scope and integrated validation.

For tasks with no material UI impact, state `UI design gate: Not applicable` and continue through the normal non-UI lifecycle.

For testing, fill the required fields above and apply the canonical policy in `docs/TESTING.md`; do not restate that policy inside each task.

## Contract rules

- The task contract outranks convenience.
- If implementation requires forbidden scope, stop and escalate.
- If acceptance criteria conflict with repository architecture or security rules, stop and escalate.
- Do not silently reinterpret product requirements.
- Do not merge or deploy unless explicitly authorized.
- Report unrun checks honestly.
- Keep unrelated cleanup out of the task unless separately approved.
- Prefer an explicit follow-up task over scope creep.
- For material UI work, do not jump directly from Markdown requirements into a substantially wired implementation. Complete the design gate and shell stage first unless the owner explicitly approves a justified exception.
- Screen/mockup approval is not merge approval and does not authorize security, architecture, data-handling, or deployment changes.
- Mockups, fixtures, screenshots, and shell previews must not contain real secrets or sensitive production/customer data.
- Follow `docs/TESTING.md` for objective-based validation, escalation, manual QA, CI/release gates, and concise evidence reporting.
- Follow `docs/HANDOFFS.md` when responsibility transfers; do not duplicate the full handoff policy inside task contracts.

## Recommended task lifecycle

### User-facing UI

```text
requirements in Markdown
  ↓
screen map + user flows
  ↓
screen designs / required states
  ↓
human design approval
  ↓
UI shell implementation
  ↓
business/data/API/integration wiring
  ↓
objective-based targeted automated validation
  ↓
manual QA / integrated validation
  ↓
pull request + required CI
  ↓
independent review/audit
  ↓
human merge approval
  ↓
merge
```

### Non-UI

```text
draft task
  ↓
orchestrator review
  ↓
implementation
  ↓
objective-based targeted validation
  ↓
manual QA where applicable
  ↓
pull request + required CI
  ↓
independent review/audit
  ↓
human merge approval
  ↓
merge
```

## Example

```markdown
# P1.3 — Add Offline Export

## Objective
Allow users to export application data as JSON without requiring network access.

## Context
Export is required for user-controlled backup and migration.

## Delivery Mode / UI Design Gate
UI design gate: Not applicable. This task adds a non-UI export capability and does not introduce or materially change a user-facing screen.

## Allowed Scope
- lib/export/
- lib/services/export_service.*
- tests/export/

## Forbidden Scope
- authentication
- billing
- database schema
- deployment configuration

## Acceptance Criteria
- export succeeds fully offline;
- exported JSON contains all supported records;
- invalid states return a clear failure;
- regression tests cover successful and failed export;
- existing tests remain green.

## Required Validation
- Test objective: prove offline export completeness and clear invalid-state failure.
- Targeted evidence: export-service tests, invalid-state regression, changed-module static analysis.
- Manual QA: run one offline export and inspect the JSON.
- Required CI: await all repository-required PR checks.
- Escalation: follow `docs/TESTING.md`.

## Documentation Updates
- docs/STATUS.md
- user-facing export documentation if behavior changes

## Deliverable
Open a PR against main. Do not merge.

## Stop Conditions
Stop if the implementation requires a database schema change or broader access to sensitive data.
```

Use `tasks/TEMPLATE.md` to create concrete task files.
