# Web Design Profile

## Scope

Use this profile for browser-based products, SaaS applications, portals, and public websites.

## Default approach

Prefer semantic, accessible, responsive web patterns over visual imitation of mobile or desktop native UI.

For resource selection, use `design/resources/DESIGN-RESOURCE-CATALOG.md`. Community website kits may be used for inspiration but are not normative. The owner-supplied SaaS/Framer community reference is cataloged there and must not override the product brand, accessibility baseline, component system, or approved Figma designs.

## Required design considerations

### Responsive behavior
Define relevant breakpoints based on content/product needs rather than device-brand names alone.

For each key layout specify:
- narrow behavior;
- medium behavior;
- wide behavior;
- navigation transformation;
- table/data-density behavior;
- modal/drawer behavior.

### Interaction
Support:
- pointer;
- keyboard;
- touch where relevant;
- visible focus;
- hover only as enhancement, never the only disclosure mechanism.

### Accessibility
Unless the project defines a different target, use WCAG 2.2 AA as the baseline.

Prefer native HTML semantics. Use ARIA only where native semantics do not express the interaction.

### Components
Define consistent:
- buttons/links;
- inputs/forms;
- navigation;
- tables/data display;
- dialogs/drawers;
- alerts/toasts;
- loading/empty/error states.

### Theme
Use semantic tokens for light/dark or brand themes. Validate contrast in every supported theme.

## Implementation handoff

State:
- supported browsers;
- responsive behavior;
- keyboard behavior;
- focus management;
- semantic/ARIA requirements;
- theme support;
- performance-sensitive UI behavior;
- Figma/design references.
