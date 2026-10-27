# [TASK ID] — [TASK TITLE]

- **Status:** Draft / Ready / In Progress / Review / Done / Blocked
- **Owner/orchestrator:** [NAME]
- **Implementation agent:** [AGENT OR UNASSIGNED]
- **Target branch:** `main`
- **Working branch:** `[BRANCH]`

## Objective

[ONE CLEAR OUTCOME]

## Context

[WHY THIS TASK EXISTS AND ANY RELEVANT CURRENT STATE]

## Delivery mode / UI design gate

- **Material user-facing UI:** Yes / No
- **UI design gate:** Required / Approved / Not applicable
- **Requirements/product contract:** [PATH/LINK OR N/A]
- **Screen map / user flows:** [PATH/LINK OR N/A]
- **Screen designs / mockups:** [PATH/LINK OR N/A]
- **Human design approval:** [APPROVED BY/DATE OR PENDING/N/A]
- **UI shell scope:** [SCREENS/COMPONENTS/NAVIGATION/STATES; IDENTIFY FIXTURES/STUBS]
- **Wiring scope:** [BUSINESS LOGIC / STATE / DATA / API / AUTH / INTEGRATIONS OR N/A]
- **Test scope:** [UNIT / COMPONENT / BEHAVIOR / INTEGRATION / E2E / DEVICE OR N/A]

For material UI work, requirements → screen map/flows → screen designs → human design approval → UI shell must occur before substantial production wiring. For non-UI work, state `UI design gate: Not applicable`.

## Test objective / validation budget

- **Test objective:** [SPECIFIC BEHAVIOR OR RISK TO PROVE]
- **Minimum automated evidence:** [SMALLEST TARGETED CHECKS THAT CAN PROVE IT]
- **Manual QA:** [STEP(S) AFTER AUTOMATED OBJECTIVE IS MET, OR "Not applicable"]
- **Escalation triggers:** [CONDITIONS THAT REQUIRE BROADER REGRESSION]
- **Required CI / release gates:** [MANDATORY STATUS CHECKS / RELEASE VALIDATION]

Apply the stop/escalation policy in `docs/TESTING.md`.

## Allowed scope

Files/components that may be changed:
- `[PATH OR COMPONENT]`
- `[PATH OR COMPONENT]`

## Forbidden scope

Do not change:
- [AREA]
- [AREA]

## Acceptance criteria

- [ ] [OBSERVABLE OUTCOME]
- [ ] [OBSERVABLE OUTCOME]
- [ ] Existing supported behavior remains intact.
- [ ] For material UI work, approved designs and the implemented shell remain traceable to the requirements.
- [ ] For material UI work, production wiring is complete only after the approved shell is coherent.
- [ ] The stated test objective is demonstrated by the minimum necessary automated evidence.
- [ ] Applicable manual QA is complete.
- [ ] Required CI/release checks pass.

## Required validation

Targeted automated checks:
- `[COMMAND]`
- `[COMMAND]`

Record whether the objective was met and any escalation required by `docs/TESTING.md`.

Manual QA:
- [STEP]

Required CI / release validation:
- [CHECK / STATUS / GATE]

## Security / privacy considerations

[STATE IMPACT, OR "No material change expected."]

## Design / accessibility considerations

For material UI work, document:
- approved platform/design-system references;
- required loading/empty/error/offline/permission/disabled/destructive states;
- responsive/adaptive behavior;
- accessibility behavior;
- intentional deviations from approved screen designs or platform conventions.

[DETAILS, OR "Not applicable."]

## Third-party integration considerations

[SELECTED INTEGRATION, CREDENTIAL/WEBHOOK/ENTITLEMENT IMPACT, OR "None."]

## Release / store / deployment considerations

[STORE/DISTRIBUTION/ENVIRONMENT/ROLLBACK IMPACT, OR "None."]

## Capability profile changes

[CHANGES TO config/project-profile.json, OR "None."]

## Data / migration considerations

[STATE IMPACT, OR "None."]

## Documentation updates

Update as needed:
- [ ] `docs/STATUS.md`
- [ ] `docs/ARCHITECTURE.md`
- [ ] `docs/SECURITY.md`
- [ ] `docs/TESTING.md`
- [ ] `docs/RELEASE.md`
- [ ] `docs/REPOSITORY-SETUP.md` where enforcement changes
- [ ] design/accessibility docs where relevant
- [ ] store/integration guide where relevant
- [ ] `config/project-profile.json` where capability selection changes
- [ ] `docs/PROJECT-MEMORY.md` only if durable rationale/decision changed
- [ ] User/developer docs

## Deliverable

[EXPECTED PR / ARTIFACT / REPORT]

Default: open a pull request against `main`. Do not merge.

## Stop / escalation conditions

Stop and ask for direction if:
- implementation requires forbidden scope;
- requirements become materially ambiguous;
- a security/privacy boundary must be weakened;
- a destructive or irreversible migration is required;
- required credentials/infrastructure are unavailable;
- repository state contradicts task assumptions;
- material UI requirements are not design-ready or human design approval is still pending;
- production wiring would force an unapproved change to the screen/flow contract;
- a test failure suggests the change has a broader blast radius than the defined test objective;
- a high-risk boundary requires broader regression than the task currently specifies.

## Completion handoff

When responsibility passes to another agent, reviewer, tool, or conversation, follow `docs/HANDOFFS.md`: append one compact uniquely identified handoff and update `docs/STATUS.md` so `Active handoff` points to it.
