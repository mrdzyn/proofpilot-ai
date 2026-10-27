# Design Resource Catalog

## Purpose

This catalog helps product teams and AI coding/design agents choose the **right design source for the task** without treating every linked resource as equally authoritative.

The master template references external design resources instead of copying vendor-owned UI kits or community files into the repository.

## Resource authority and applicability

Do **not** treat all resources as one linear hierarchy. Evaluate two things separately:

### Authority

1. **MANDATORY / AUTHORITATIVE** — applicable law, store policy, security/privacy requirements, accessibility requirements, and current official platform/vendor documentation.
2. **OFFICIAL DESIGN RESOURCE** — vendor-published UI kits, design libraries, asset guidance, and downloadable resources.
3. **COMMUNITY REFERENCE** — useful Figma/community resources that may accelerate work but are not normative.

### Applicability

- **PROJECT-SPECIFIC** — approved product behavior, brand, semantic tokens, Figma files, and documented product decisions.
- **PLATFORM-SPECIFIC** — guidance that applies to the target operating system/platform.
- **INTEGRATION-SPECIFIC** — guidance that applies only when the named API, host, or service is actually used.

### Conflict rule

When sources conflict:

1. mandatory legal/security/privacy/accessibility/store requirements cannot be weakened;
2. approved product behavior and project-specific design remain authoritative for the product;
3. current platform/integration guidance governs applicable platform behavior unless an approved deviation is documented;
4. official design kits are implementation/reference aids;
5. community resources are inspiration/convenience only and **never override an approved project design system**.

A CueNexa, DiaKeep, or other approved project design system therefore outranks a Framer/Figma community kit for that product. Community material must not silently redefine product behavior, brand, accessibility, or platform contracts.

## Selection rule

For a UI task, use only the resources that match the product and feature:

```text
Product requirements
    ↓
Applicable platform profile
    ↓
Authoritative platform guidance
    ↓
Applicable official design resources
    ↓
Integration-specific guidance, if the feature uses it
    ↓
Project design system / Figma
    ↓
Implementation + validation
```

Do not load unrelated design kits merely because they are present in this catalog.

## Windows

### AUTHORITATIVE

- Windows design overview:
  https://learn.microsoft.com/en-us/windows/apps/design/
- Windows design resources/downloads:
  https://learn.microsoft.com/en-us/windows/apps/design/downloads/

### DESIGN RESOURCES

The Microsoft downloads page is the preferred discovery point for current Windows design kits and asset guidance.

Owner-supplied Figma references:

- Microsoft Store Asset Guidance:
  https://www.figma.com/design/0AFpAFi6Kk1QfqccdKKxh5/Microsoft-Store-Asset-Guidance--Community-?node-id=1-5&t=PhhH8kdOflAUvnvR-1
- Windows UI kit:
  https://www.figma.com/design/P97PJm1e1kF25j18oRQPyE/Windows-UI-kit--Community-?node-id=2434-129659&t=QGGyms1W74pbFgj4-1

Because these URLs are Figma Community resources, validate their publisher/current status against Microsoft's official Windows design resources page before treating them as authoritative.

## Apple

### AUTHORITATIVE

- Apple Human Interface Guidelines:
  https://developer.apple.com/design/human-interface-guidelines/
- Apple Design Resources:
  https://developer.apple.com/design/resources/

### COMMUNITY / CONVENIENCE REFERENCE

- iOS and iPadOS 27 Figma reference supplied by the project owner:
  https://www.figma.com/design/qJPYTfp23vwgel0TOt7pfB/iOS-and-iPadOS-27--Community-?node-id=221-56229&t=PsolzLDOkOTNK013-1

Use current Apple Design Resources as the authority. A Community Figma file must not override current Apple guidance or product requirements.

## Android / Material

### AUTHORITATIVE

- Material Design:
  https://m3.material.io/
- Android design guidance:
  https://developer.android.com/design

### COMMUNITY / CONVENIENCE REFERENCE

- Material Design UI Kit supplied by the project owner:
  https://www.figma.com/design/SXmYqMxHv36eSjnDNHWatA/Material-Design-UI-Kit?node-id=0-1&t=02llKDGlyHSBDdcH-1

Use current Material/Android documentation as the authority and validate the Figma kit's freshness before implementation.

## Web / SaaS

### AUTHORITATIVE BASELINE

- WCAG 2.2:
  https://www.w3.org/TR/WCAG22/
- WAI-ARIA Authoring Practices:
  https://www.w3.org/WAI/ARIA/apg/

### COMMUNITY INSPIRATION

- SaaS Website UI Kit — Framer Website Kit:
  https://www.figma.com/design/znYxsWUVeMf8f0NA0UAYrM/SaaS-Website-UI-Kit-%E2%80%94-Framer-Website-Kit--Community-?node-id=2012-608&t=Ak6ychY28CyIyvmu-1

This is inspiration only. It must not override the product's brand, component system, accessibility baseline, information architecture, or approved Figma designs.

## Google integration-specific resources

Use these only when the feature actually integrates with the named Google platform.

### Google Maps / Places UI Kit

- Integration profile: `design/integrations/google-maps.md`
- Owner-supplied reference:
  https://developers.google.com/maps/documentation/javascript/places-ui-kit/overview.md.txt
- Canonical documentation:
  https://developers.google.com/maps/documentation/javascript/places-ui-kit/overview

### Google Workspace Add-ons

- Integration profile: `design/integrations/google-workspace.md`
- Owner-supplied reference:
  https://developers.google.com/workspace/add-ons/guides/workspace-style.md.txt
- Canonical documentation:
  https://developers.google.com/workspace/add-ons/guides/workspace-style

## Agent rule

AI agents must not infer that a resource is mandatory merely because it is listed here.

Before using a design resource, confirm:

- target platform;
- feature/integration scope;
- source authority level;
- current version/freshness where relevant;
- compatibility with the project's established design system;
- accessibility implications;
- licensing/distribution constraints.

When sources conflict, surface the conflict rather than silently choosing the visually most convenient source.
