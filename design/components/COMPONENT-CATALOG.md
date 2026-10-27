# Component Catalog

## Purpose

This catalog defines the minimum reusable UI vocabulary expected across product projects. It is a checklist and governance tool, not a requirement to build every component immediately.

## Foundations

- Color roles
- Typography
- Spacing
- Radius
- Elevation / surfaces
- Iconography
- Motion
- Breakpoints / adaptive layout
- Focus treatment

## Inputs and actions

- Button
- Icon button
- Link
- Text field
- Text area
- Search
- Checkbox
- Radio
- Switch
- Select / picker
- Slider
- Date/time input
- File/media picker where applicable

## Navigation

- Top/app bar
- Back navigation
- Tab bar / tabs
- Sidebar
- Navigation rail
- Breadcrumbs
- Pagination where applicable
- Search/navigation result patterns

## Content

- Card
- List item
- Avatar
- Badge
- Chip/tag
- Divider
- Section header
- Metadata row
- Table/data grid where applicable
- Image/media container

## Feedback and overlays

- Inline validation
- Alert/banner
- Toast/snackbar
- Dialog
- Sheet/drawer
- Progress indicator
- Skeleton
- Tooltip
- Popover/menu

## Product states

Reusable patterns should exist for relevant:

- Loading
- Empty
- Error
- Offline
- Success
- Permission denied
- Disabled/unavailable
- First-run/onboarding
- Upgrade/paywall
- Destructive confirmation
- Maintenance/degraded service

## Component state checklist

For each interactive component define relevant:

- default;
- hover;
- focus;
- pressed/active;
- selected;
- disabled;
- loading;
- validation/error;
- read-only;
- high-contrast/accessible treatment where applicable.

Not every platform exposes every state.

## Component contract

A reusable component should document:

- purpose;
- when to use;
- when not to use;
- variants;
- states;
- content rules;
- accessibility semantics;
- responsive/adaptive behavior;
- platform-specific differences;
- implementation owner/source.

## Design-to-code mapping

When practical, keep a traceable relationship between:

```text
Figma component
    ↕
semantic design tokens
    ↕
code component
    ↕
tests / stories / previews
```

The exact tooling can vary by stack.

## Anti-patterns

Avoid:
- one-off copies of existing components;
- hard-coded colors/spacing inside feature screens;
- state variants implemented as unrelated components;
- custom platform controls without a user/product reason;
- visual-only components with no accessibility contract.
