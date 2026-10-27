# Figma Setup and Handoff

## Purpose

Use Figma as a visual design and prototyping workspace where it adds value, while keeping product behavior, engineering constraints, and durable decisions represented in the repository.

## Recommended file structure

A product Figma file should normally include pages such as:

```text
00 — Cover / Links
01 — Foundations
02 — Components
03 — Patterns
10 — User Flows
20 — Screens
30 — Prototypes
90 — Archive / Explorations
```

Adapt the structure to product complexity.

## Libraries and UI kits

Prefer official platform libraries:

- **Apple:** current official Apple UI kits and Apple design resources.
- **Android:** current Material Design / Material 3 resources.
- **Windows:** current Microsoft Windows design resources and UI kits.
- **Web:** project design system and accessible web component patterns.

Use `design/resources/DESIGN-RESOURCE-CATALOG.md` to distinguish authoritative platform guidance, official design resources, integration-specific guidance, community references, and project-specific design files. Do not treat every Figma Community resource as normative.

Official resources should be enabled through Figma or the vendor's official distribution channel. Do not commit copied vendor-owned UI-kit source files into this repository by default.

## Apple Figma setup

For Apple-targeted products:

1. Open the product Figma file.
2. Open **Assets / Libraries / UI Kits** in Figma.
3. Enable the current official Apple UI kit appropriate to the target platform.
4. Use Apple's current Human Interface Guidelines and Design Resources as reference.
5. Use SF Symbols where appropriate rather than redrawing platform icons.
6. Create product-specific components only when platform components or shared product components do not meet the requirement.

Official references:
- Apple Human Interface Guidelines: https://developer.apple.com/design/human-interface-guidelines/
- Apple Design Resources: https://developer.apple.com/design/resources/

## Design variables / tokens

Map Figma variables/styles to repository semantic tokens where practical.

Example:

```text
Figma variable                 Repository token
------------------------------------------------------------
Color / Background / Default → color.background
Color / Surface / Default    → color.surface
Color / Text / Primary       → color.text.primary
Color / Action / Primary     → color.action.primary
Space / 4                    → spacing.4
Radius / Medium              → radius.md
```

Exact naming may vary by project, but the mapping should remain understandable.

## Component naming

Recommended hierarchy:

```text
Foundation/
Component/Button/
Component/TextField/
Component/Card/
Pattern/EmptyState/
Pattern/ErrorState/
Pattern/Paywall/
```

Use variants/properties for states rather than creating unrelated duplicate components.

## Handoff requirements

A design handoff should identify:

- Figma file/link and frame(s);
- target platform(s);
- feature/task ID;
- component dependencies;
- interaction behavior;
- required states;
- responsive/adaptive rules;
- accessibility behavior;
- assets/icons;
- unresolved decisions.

## Design-to-code rule

An AI coding agent should not infer important product behavior solely from pixels.

When a design introduces behavior not documented in the task/product specification, the agent should surface the ambiguity before implementing it.


## Integration-specific design context

Only load integration references when the feature actually uses that integration.

- Google Maps / Places UI Kit: `design/integrations/google-maps.md`
- Google Workspace Add-ons: `design/integrations/google-workspace.md`

This keeps agent context focused and prevents unrelated vendor design patterns from leaking into product UI.
