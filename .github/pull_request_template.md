## Summary

What changed, and why?

## Task / phase

- Task contract: [link/path]
- Phase/milestone: [ID or name]

## Scope

### Changed
- 

### Intentionally not changed
- 

## Validation

### Test objective

[WHAT SPECIFIC BEHAVIOR OR RISK NEEDED TO BE PROVEN?]

### Targeted automated evidence

List only the checks actually needed/run for the task objective:

- [ ] Static analysis / lint / typecheck where relevant
- [ ] Targeted unit/component/behavior tests
- [ ] Targeted integration/boundary tests where relevant
- [ ] Security/migration/release checks where risk requires them

Commands/results:

```text
[PASTE CONCISE RESULTS — SUMMARIZE PASSING OUTPUT; INCLUDE DETAIL FOR FAILURES]
```

- [ ] Test objective is demonstrated.
- [ ] Applicable manual QA is complete or explicitly pending.
- [ ] Repository-required CI/status checks are green or still pending.

Manual QA:

[STEPS / RESULT / "Not applicable"]

Escalation / broader validation:

[ONLY IF REQUIRED BY docs/TESTING.md; OTHERWISE "None"]

Required CI / release gates:

[STATUS / PENDING]

## Acceptance criteria

- [ ] Task acceptance criteria are satisfied.
- [ ] Existing supported behavior is preserved unless explicitly changed.
- [ ] No unrelated scope was added.
- [ ] For material UI work, requirements → approved design → shell → wiring → objective-based tests → manual QA remain traceable.

## Security / privacy

- [ ] No secrets or sensitive data were committed.
- [ ] Authentication/authorization impact reviewed.
- [ ] Data-handling/privacy impact reviewed.
- [ ] Security-sensitive changes are called out below.

Notes:

[DETAILS OR "No material security/privacy change."]

## Design / UX / accessibility

For material user-facing changes:

- [ ] UI design gate is required and satisfied, or the task explains why it is not applicable.
- [ ] Written requirements/product contract are linked.
- [ ] Screen map/user flows and required states were defined before implementation.
- [ ] Human-approved screen designs/mockups are linked or otherwise identified.
- [ ] UI shell was reviewed before substantial production business/data/API/integration wiring.
- [ ] Relevant platform design profile was followed.
- [ ] Existing semantic tokens/components were reused or intentionally extended.
- [ ] Loading/empty/error/offline/permission/disabled/destructive states were considered where relevant.
- [ ] Accessibility and responsive/adaptive behavior were validated.
- [ ] Fixtures/stubs/screenshots contain no real secrets or sensitive production/customer data.
- [ ] External design resources follow the authority levels in the design resource catalog.
- [ ] Integration-specific design guidance was applied only when relevant to the feature.
- [ ] Any deliberate deviation from the approved design or platform convention is documented.

For non-UI changes, state `UI design gate: Not applicable`.

Notes:

[LINKS / APPROVAL / DEVIATIONS / "Not applicable."]

## Documentation

- [ ] `docs/STATUS.md` updated if current state changed.
- [ ] Architecture/security/testing/release/design/accessibility docs updated where relevant.
- [ ] `docs/PROJECT-MEMORY.md` updated only if durable rationale/decisions changed.

## Capability / integration impact

- [ ] `config/project-profile.json` remains accurate.
- [ ] Selected third-party integration guidance was followed where applicable.
- [ ] No unrelated capability pack was activated merely to satisfy CI.

Notes:

[DETAILS OR "No capability/integration change."]

## Release / store / deployment impact

- [ ] Applicable store/directory profile was reviewed.
- [ ] Repository/environment enforcement impact was considered.
- [ ] Current external platform requirements were re-verified where they can change over time.

[DESCRIBE MIGRATIONS, CONFIG, STORE, INFRASTRUCTURE, ROLLBACK, OR "None."]

## Known limitations / follow-up

- 

## Human gate

- [ ] This PR is ready for independent review/audit.
- [ ] I have **not** merged or deployed this change unless explicitly authorized.
