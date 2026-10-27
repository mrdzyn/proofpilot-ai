# Accessibility Baseline

## Purpose

Accessibility is part of the product definition and quality gate, not a final visual-polish step.

Projects created from this template should adapt this baseline to their platforms, regulatory obligations, and user population.

## Cross-platform baseline

Design and implementation should support:

- clear semantic structure;
- keyboard or non-pointer navigation where the platform supports it;
- visible focus indication;
- sufficient text and non-text contrast;
- scalable text;
- meaningful labels for controls and images;
- logical reading/focus order;
- alternatives to color-only meaning;
- touch/click targets sized appropriately for the platform;
- error messages that identify the problem and recovery path;
- motion that respects reduced-motion preferences where applicable;
- content that remains usable under zoom, large text, and layout adaptation.

## Apple

For iOS, iPadOS, macOS, watchOS, or visionOS as applicable:

- support Dynamic Type or platform-equivalent text scaling;
- use semantic accessibility labels/hints/traits;
- respect VoiceOver navigation;
- use platform-standard control behavior where possible;
- respect Reduce Motion, Increase Contrast, and appearance settings where applicable;
- preserve safe areas and input/keyboard accessibility;
- validate with accessibility inspection and at least one real assistive-technology pass for critical journeys.

Reference the current Apple Human Interface Guidelines and accessibility documentation.

## Android

- expose meaningful semantics for TalkBack;
- support system font scaling;
- preserve logical focus order;
- use accessible touch targets;
- respect system contrast, motion, and theme settings where applicable;
- validate critical journeys with TalkBack or equivalent tooling.

## Web

Target the current applicable WCAG level selected by the project. Unless the project defines otherwise, use **WCAG 2.2 AA** as the default web baseline.

Include:
- semantic HTML first;
- keyboard operability;
- accessible names;
- focus management;
- form labels/errors;
- reduced-motion handling;
- responsive reflow;
- appropriate ARIA only where native semantics are insufficient.

## Accessibility acceptance criteria

UI tasks should include concrete accessibility criteria where relevant, for example:

- screen is navigable by keyboard/assistive technology;
- all interactive elements have accessible names;
- text remains usable at large system text sizes;
- focus is moved correctly when a modal opens/closes;
- errors are announced and are not color-only;
- motion can be reduced;
- contrast meets the selected platform/web target.

## Validation record

Document:
- tooling used;
- devices/browsers tested;
- assistive technology tested;
- known limitations;
- approved exceptions.

Do not claim accessibility compliance solely because a component library or UI kit was used.


## Store accessibility declarations

When an app store provides accessibility metadata or labels, declarations must reflect validated behavior in the shipped build rather than design intent alone.

For Apple products, use the current App Store Connect Accessibility Nutrition Label guidance referenced in `store/apple.md`. The template treats the declaration as a release-readiness field and requires re-verification of whether it is voluntary or mandatory at submission time.
