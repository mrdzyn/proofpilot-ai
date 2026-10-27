# Design System

## Purpose

This document defines the cross-project product-design baseline for repositories created from or adopting this template.

The goal is **not** to force every product to look the same. The goal is to make UI/UX work systematic, platform-aware, accessible, and implementation-ready before feature coding expands.

## Design operating model

For material user-facing UI, design is a delivery gate rather than a late implementation aid.

```text
Requirements / product contract in Markdown
    ↓
Screen map + user flows
    ↓
Platform profile + design tokens + component inventory
    ↓
Screen designs / mockups + required states
    ↓
Human design approval
    ↓
UI shell implementation
    ↓
Business logic / state / data / API / integration wiring
    ↓
Automated + behavioral tests
    ↓
Integration / device / accessibility / visual validation
```

The goal is to make the product visible and reviewable before application logic, persistence, APIs, and integrations become tightly coupled to the interface.

## Source-of-truth boundaries

- **Product behavior:** `docs/PRODUCT.md` and task-specific product/design docs.
- **System architecture:** `docs/ARCHITECTURE.md`.
- **Design foundations and behavior:** this document plus `design/`.
- **Visual composition:** approved Figma/design files where used.
- **Accessibility requirements:** `docs/ACCESSIBILITY.md`.
- **Current delivery state:** `docs/STATUS.md`.

A Figma file must not silently redefine product behavior. If design and product requirements conflict, resolve the conflict explicitly.

## Design-first delivery gate

For each material UI milestone or feature:

1. **Requirements first.** Product behavior, user goals, acceptance criteria, security/privacy constraints, and relevant data/API assumptions are written down before screen design.
2. **Map the experience.** Define the screen inventory, navigation, user flows, entry/exit points, and the required non-happy-path states.
3. **Design the screens.** Produce reviewable screen designs/mockups using the approved brand, platform profile, tokens, components, and accessibility constraints.
4. **Human visual approval.** The project owner approves the screen/design direction before substantial shell implementation. Approval of visuals does not override product, security, privacy, architecture, or release rules.
5. **Build the shell.** Implement screens, navigation, layout, components, theming, accessibility semantics, and states. Use synthetic fixtures/stubs/sample data where that keeps the shell reviewable without premature production coupling.
6. **Wire the product.** Connect the approved shell to business logic, state management, persistence, APIs, authentication/authorization, integrations, and production-grade error handling.
7. **Test the integrated behavior.** Add the executable tests identified by the task contract and validate the finished behavior on the applicable browser/device/platform matrix.

A shell is intentionally **not** a fake finished product. It is a reviewable implementation of the approved experience before real runtime wiring is complete.

Do not put real credentials, production secrets, or sensitive customer data into mockups, fixtures, screenshots, or shell previews.

Backend-only, API-only, infrastructure-only, migration-only, or documentation-only work with no material user-facing UI impact may bypass this design gate.

## Platform-first, brand-aware

Use the target platform's native design language as the starting point, then apply the product's brand deliberately.

Platform references:
- Apple: `design/platforms/apple.md`
- Android: `design/platforms/android.md`
- Web: `design/platforms/web.md`
- Windows: `design/platforms/windows.md`

Avoid rebuilding standard platform behavior simply to make a product look unique.

## Design resource authority

Use `design/resources/DESIGN-RESOURCE-CATALOG.md` to evaluate **authority** and **applicability** separately.

Mandatory legal/security/privacy/accessibility/store requirements remain non-negotiable. Approved project behavior and the project's design system are authoritative for the product. Current platform/integration guidance applies where relevant, while official UI kits are implementation aids and community kits are optional inspiration only.

A community kit must never override an approved project-specific design system. Integration-specific guidance under `design/integrations/` should be read only when the task actually uses that integration.

## Foundations

Every product should define or intentionally inherit:

- semantic color roles;
- typography scale;
- spacing scale;
- radius;
- elevation/surface hierarchy;
- iconography;
- motion;
- responsive breakpoints where relevant;
- interaction states;
- accessibility behavior.

The starter token file is `design/tokens/design-tokens.json`. Replace template values with project-specific values rather than hard-coding visual constants throughout the codebase.

## Semantic tokens

Prefer semantic names such as:

```text
color.background
color.surface
color.text.primary
color.text.secondary
color.border
color.action.primary
color.action.danger
color.feedback.success
color.feedback.warning
color.feedback.error
```

Avoid using names such as `blue500` or `gray100` directly in product components unless they are palette primitives beneath semantic aliases.

## Component baseline

See `design/components/COMPONENT-CATALOG.md`.

A product does not need every component on day one, but new UI should reuse an existing component or explicitly add a new one to the system.

## Required product states

Critical screens and flows should account for relevant states before implementation:

- initial / default;
- loading;
- empty;
- success;
- validation error;
- system error;
- offline / degraded connectivity;
- permission denied / unavailable capability;
- disabled;
- destructive confirmation;
- upgrade/paywall if applicable;
- first-run/onboarding if applicable.

The happy path alone is not a complete design.

## Design definition of ready for UI shell

A UI task is normally ready for **shell implementation** when:

- user goal, requirements, and observable acceptance criteria are documented;
- screen map and user flows are coherent;
- target platform profile is selected;
- relevant components are identified;
- required screen states are defined;
- accessibility behavior is understood;
- responsive/adaptive behavior is defined where relevant;
- unknown product decisions are surfaced rather than invented;
- screen designs/mockups are linked or otherwise reviewable;
- the project owner has approved the design direction.

## UI shell definition of ready for wiring

A UI shell is ready for production wiring when:

- approved screens/navigation are implemented coherently;
- shared tokens/components are used where appropriate;
- required visual and interaction states can be demonstrated with fixtures/stubs;
- accessibility structure and platform navigation behavior are present;
- obvious layout/responsive issues are resolved;
- the remaining data/API/auth/integration seams are explicit;
- no production secrets or sensitive customer data are embedded in fixtures or previews;
- any deliberate deviation from the approved design is documented and approved.

At this point, implementation may connect real business logic, state, persistence, APIs, authentication/authorization, and integrations.

## Design definition of done

A UI change is normally done only after shell approval, production wiring, and integrated validation.

A UI change is normally done when:

- implementation matches approved product behavior;
- design tokens/components are reused where appropriate;
- all required states are implemented;
- accessibility requirements are validated;
- platform conventions are respected or deviations are documented;
- supported themes/appearance modes are validated;
- screenshots or visual evidence are captured when required;
- current status/docs are updated where material.

## Figma

Use `design/figma/README.md` for the recommended file structure and handoff pattern.

Official third-party UI kits should be enabled or referenced through their official distribution mechanism. Do not copy or redistribute vendor-owned design kits into this repository unless their license explicitly permits it.

## Governance

Material changes to the design language should be treated like architecture changes:

1. state the problem;
2. define the proposed system change;
3. identify affected components/screens;
4. review accessibility/platform impact;
5. update tokens/components/docs;
6. record durable rationale in `docs/PROJECT-MEMORY.md` when future teams/agents need it.
