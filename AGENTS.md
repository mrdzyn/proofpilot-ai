# AGENTS.md

## Purpose

This file defines the default operating rules for AI coding agents working in this repository. Project-specific instructions may extend these rules, but should not silently weaken safety, review, testing, or human-approval requirements.

## Default startup read order

Before making changes, read:

1. `AGENTS.md`
2. `docs/STATUS.md`
3. `config/project-profile.json`
4. the active task/phase specification
5. if `docs/STATUS.md` names an `Active handoff`, read only that matching section in `docs/HANDOFFS.md`
6. relevant code and tests

Use `config/project-profile.json` to determine which optional capability packs are active. Do not load unselected store/design/integration packs into routine task context. Do not load the full handoff history during routine startup; `docs/HANDOFFS.md` is the canonical handoff policy. In a newly generated child repository that is still in `repositoryMode: "template"`, ignore any inherited master `Active handoff` until greenfield initialization clears it.

For UI/UX implementation tasks, also read the relevant design context after the project profile:
- `docs/DESIGN-SYSTEM.md`;
- `docs/ACCESSIBILITY.md`;
- the applicable file under `design/platforms/`;
- `design/components/COMPONENT-CATALOG.md`;
- `design/resources/DESIGN-RESOURCE-CATALOG.md` when external kits/resources are relevant;
- only the applicable file(s) under `design/integrations/` when the task uses that integration;
- task-linked Figma/design references when provided.

Do **not** read `docs/PROJECT-MEMORY.md` by default. Consult it only when:
- the project owner or orchestrator explicitly directs you to;
- durable historical rationale is genuinely required for the assigned task; or
- the task specifically involves updating project memory.

## Roles and authority

### Product owner / human authority
Owns product direction, risk acceptance, security/privacy decisions, final merge approval, and production release authority.

### Orchestrator
Defines architecture, phases, bounded tasks, acceptance criteria, review requirements, and handoffs between agents.

### Design / UX agent
For user-facing work, translates approved requirements into screen maps, user flows, screen designs/mockups, required states, and implementation-ready design references. Design work must not silently redefine approved product behavior, security/privacy boundaries, or architecture.

### Implementation agent
Implements only the assigned task, validates the work, updates required operational docs, and opens or prepares a pull request.

### Review / audit agent
Reviews the implementation independently against the task contract, architecture, tests, security boundaries, and diff.

An implementation agent must not approve its own work as the final independent review.

## Work boundaries

Every non-trivial change should have a bounded task contract.

Before editing:
- confirm the objective;
- identify allowed files/components;
- identify forbidden scope;
- identify acceptance criteria;
- identify required validation;
- identify whether schema, API, security, billing, deployment, or user-data behavior may change.

If the requested work conflicts with the task contract, stop and report the conflict rather than expanding scope silently.

## Design-first delivery for user-facing UI

When a project, phase, feature, or task includes material user-facing UI, the default delivery sequence is:

```text
requirements / product contract in Markdown
    ↓
screen map + user flows
    ↓
screen designs / mockups + required states
    ↓
human design approval
    ↓
UI shell implementation
    ↓
wire business logic / state / data / APIs / integrations
    ↓
objective-based targeted automated validation
    ↓
manual QA / device / platform validation
    ↓
pull request + required CI
    ↓
independent review / audit
    ↓
human merge approval
    ↓
release
```

Rules:
- Requirements and observable acceptance criteria come first. Do not use a mockup to invent material product behavior that the requirements have not approved.
- Define the screen map, navigation/user flows, and relevant loading, empty, error, offline, permission, disabled, destructive, responsive/adaptive, and accessibility states before approving the design direction.
- Obtain explicit human approval of the screen/design direction before substantial UI shell implementation. A low-risk refinement to an already-approved component may document why a separate visual-approval round is unnecessary.
- Build the UI shell against approved design references using reusable tokens/components. Fixtures, stubs, and synthetic/sample data are preferred where they let the shell be reviewed without prematurely coupling it to production services.
- Do not put real secrets, sensitive production data, or customer datasets into mockups, fixtures, previews, or screenshots.
- After the shell is coherent, wire real business logic, state management, persistence, APIs, authentication/authorization, integrations, and error behavior.
- Define the test objective from the requirements/design contract and follow the objective-based testing policy in `docs/TESTING.md`.
- After the targeted automated objective is met, proceed to the defined manual QA/device/platform validation, then required PR/CI and review gates.
- Backend-only, API-only, infrastructure-only, migration-only, security-only, or documentation-only tasks with no material user-facing UI impact may bypass the screen-design/shell gate. Record `UI design gate: Not applicable` in the task contract rather than manufacturing unnecessary design work.

The design approval gate is separate from final merge/release approval. Approving a screen does not authorize unsafe data handling, architecture changes, deployment, or production release.

## Branching and commits

- Work from the latest approved base branch.
- Use a feature/phase branch for non-trivial changes.
- Keep commits focused and understandable.
- Do not rewrite shared history unless explicitly authorized.
- Do not commit secrets, credentials, tokens, production data, or local environment files.

Suggested branch patterns:
- `phase-N/short-name`
- `feat/short-name`
- `fix/short-name`
- `docs/short-name`
- `chore/short-name`

## Implementation rules

- Prefer the smallest change that fully satisfies the task.
- Preserve existing behavior unless the task explicitly changes it.
- Do not introduce new dependencies without a clear reason.
- Do not bypass tests, type checks, linters, security controls, or review gates to make CI green.
- Do not weaken validation or error handling merely to satisfy a test.
- Follow existing architecture and conventions unless the task explicitly calls for a change.
- Document meaningful architectural or integration changes.
- For user-facing UI, reuse semantic tokens and shared components rather than hard-coding one-off visual values.
- Do not infer material product behavior solely from screenshots, Figma pixels, or generated mockups; surface ambiguity before implementing it.
- Respect platform conventions and accessibility requirements unless an approved product decision explicitly overrides a convention.

## Design and accessibility validation

For UI/UX changes:
- validate relevant loading, empty, error, offline, permission, disabled, and destructive states;
- validate the supported appearance/theme modes;
- validate text scaling, focus/assistive semantics, and keyboard/navigation behavior appropriate to the platform;
- compare against approved Figma/design references when supplied;
- document deliberate deviations from native/platform conventions.

Using an official UI kit or component library does not by itself prove accessibility or product correctness. Community design resources are never authoritative merely because they are linked by the template. **Never allow a community Figma/Framer/UI kit to override an approved project-specific design system, product behavior, brand, accessibility requirement, or security/privacy boundary.** Follow the authority/applicability rules in `design/resources/DESIGN-RESOURCE-CATALOG.md`.

For repository initialization/adoption, also read `docs/CAPABILITY-PACKS.md` and `docs/REPOSITORY-SETUP.md`. **`docs/REPOSITORY-SETUP.md` is the canonical detailed policy for brownfield reconciliation and greenfield pruning.**

For **brownfield adoption**, follow its KEEP / MERGE / ADD / RETIRE reconciliation process and end with one canonical source per operating concern.

For a **generated greenfield repository**, set `repositoryMode: "project"` and follow its greenfield-pruning procedure before normal feature work. Project Baseline still requires the core operating model and all selected capability guidance; unselected optional packs may be physically absent.

For distribution work, read `store/README.md`, the applicable storefront profile, `store/SUBMISSION-METADATA.md`, and `store/DATA-PRIVACY-DECLARATION.md`. For Apple, Google Play, Microsoft Store, or Huawei AppGallery releases, also read `store/AGE-CONTENT-RATINGS.md` and `store/JURISDICTION-MATRIX.md`; WordPress.org does not require those app-store overlays solely because it is selected. For Android production/release work—including Flutter, React Native, and native Android/Kotlin—also read `release/android-signing.md`. For a game targeting mainland China, `store/china-mainland-games.md` is mandatory context. Verify current official store and jurisdiction rules before submission; do not assume the repository checklist is more current than the authoritative source.

For selected third-party commerce/licensing integrations, read the matching file under `integrations/`. Do not load or implement unselected integration packs.

## Validation

`docs/TESTING.md` is the canonical testing policy.

For every non-trivial task:
- state the test objective;
- run the minimum targeted automated evidence defined by the task;
- stop the agent-run test loop when that objective is met unless `docs/TESTING.md` requires escalation;
- complete manual QA where applicable;
- await all required CI/release gates;
- report only checks actually run and summarize passing evidence concisely.

Never weaken required CI, security, or release validation to save time or tokens.

## Security and privacy

Follow `docs/SECURITY.md`.

Stop and escalate before proceeding when a task would:
- expose or persist secrets;
- weaken authentication or authorization;
- broaden access to user/customer data;
- remove auditability;
- introduce unreviewed cryptography;
- alter production data handling materially;
- disable security checks;
- create an irreversible migration without an approved recovery path.

## Documentation responsibilities

Update `docs/STATUS.md` when the task materially changes current implementation state, milestone progress, known blockers, or next steps.

Update `docs/PROJECT-MEMORY.md` only for durable knowledge such as:
- locked product decisions;
- architecture decisions and rationale;
- important implementation/testing lessons;
- integration constraints;
- security/privacy boundaries;
- commercialization/launch decisions;
- stable terminology.

Do not turn project memory into a transcript, changelog, backlog, or duplicate of STATUS.

## Pull requests

A pull request should explain:
- what changed;
- why;
- task/phase reference;
- for material UI work, the requirements/design/shell references and human design-approval state;
- validation performed;
- security/privacy impact;
- documentation changes;
- release/deployment impact;
- known limitations.

Keep PR scope aligned with the assigned task.

## Merge and release gate

Coding agents must **not** merge their own pull requests or deploy to production unless the project owner explicitly authorizes that action.

The normal non-UI flow is:

```text
task → implementation → objective-based targeted validation → manual QA where applicable
→ PR + required CI → independent review → human approval → merge → release
```

For material user-facing UI, use the design-first sequence defined above.

## Stop conditions

Stop and ask for direction if:
- requirements are materially ambiguous;
- required credentials or infrastructure access are missing;
- the task requires destructive or irreversible action not explicitly approved;
- tests reveal a pre-existing blocker that invalidates the task assumptions;
- implementation would require expanding into forbidden scope;
- a security/privacy boundary would be weakened;
- the repository state conflicts with `docs/STATUS.md` in a way that affects correctness.

## Completion handoff

When responsibility passes to another agent, tool, conversation, or reviewer, follow `docs/HANDOFFS.md`: append one compact uniquely identified handoff section and update `docs/STATUS.md` so `Active handoff` points to it.

Do not duplicate the full task contract, logs, or durable project decisions in the handoff. If no meaningful transfer of responsibility occurs, a normal concise completion summary is sufficient.
