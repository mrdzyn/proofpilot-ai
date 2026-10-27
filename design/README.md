# Design Foundation

This directory contains the reusable design-system layer for projects created from or adopting the AI-Native Project Template.

## Structure

```text
design/
├── README.md
├── figma/
│   └── README.md
├── tokens/
│   └── design-tokens.json
├── components/
│   └── COMPONENT-CATALOG.md
├── resources/
│   └── DESIGN-RESOURCE-CATALOG.md
├── integrations/
│   ├── google-maps.md
│   └── google-workspace.md
└── platforms/
    ├── apple.md
    ├── android.md
    ├── web.md
    └── windows.md
```

## How to use this in a generated project

1. Write the applicable product/feature requirements and acceptance criteria in Markdown.
2. Identify target platforms in `docs/PRODUCT.md` and read the corresponding platform profile(s).
3. Use `design/resources/DESIGN-RESOURCE-CATALOG.md` to select authoritative/official resources and only the integration profiles relevant to the feature.
4. Replace starter token values with the product's semantic design tokens.
5. Define the screen inventory, navigation/user flows, reusable components, and required product states.
6. Create or link reviewable screen designs/mockups when material user-facing UI is in scope.
7. Define accessibility and responsive/adaptive expectations in `docs/ACCESSIBILITY.md` and the task/design artifact.
8. Obtain explicit human approval of the screen/design direction.
9. Implement the UI shell using tokens/components and synthetic fixtures/stubs where appropriate.
10. Review the shell before wiring production business logic, state, persistence, APIs, authentication/authorization, or integrations.
11. Wire the approved shell and add the executable tests defined by the task contract.
12. Validate the integrated experience on the applicable browser/device/platform matrix before PR/audit.

Do not skip directly from written requirements to a substantially wired UI implementation unless the project owner explicitly approves a justified exception.

For work with no material user-facing UI, record the UI design gate as not applicable instead of creating unnecessary screen artifacts.

## What belongs here

- cross-screen design tokens;
- reusable component expectations;
- platform-specific design conventions;
- design handoff conventions;
- links to official design-system resources;
- resource-authority classification;
- integration-specific design guidance that is loaded only when applicable.

## What does not belong here

- screenshots used only for one bug;
- temporary explorations;
- copied proprietary UI kits;
- large binary design files without a deliberate version-control strategy;
- product behavior that belongs in product/task documentation.

## Principle

**Standardize the system, not the brand.**

Projects should share a disciplined design process while remaining free to develop distinct visual identities.

For user-facing work, the reusable process is:

```text
Markdown requirements → screen designs → approved UI shell → wiring + tests → integrated validation → audit
```
