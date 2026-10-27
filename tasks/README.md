# Tasks

This directory contains bounded engineering task contracts when a persistent repository-backed task is useful.

## Why task files exist

A task file gives the project owner, orchestrator, implementation agent, reviewer, and future maintainers one shared definition of:
- objective;
- scope;
- exclusions;
- acceptance criteria;
- required validation;
- documentation impact;
- handoff expectations.

It prevents a chat prompt from becoming the only source of truth for important work.

## Naming

Recommended patterns:

```text
P0.1-foundation.md
P1.2-auth-flow.md
BUG-014-export-crash.md
SEC-005-token-rotation.md
```

Use project-specific naming if another scheme is already established.

## Master task history vs project tasks

The master template may contain bounded task files used to evolve the template itself. They are history for `mrdzyn/ai-native-project-template`, not work items for a generated project.

During greenfield initialization, remove inherited master task/history files under `tasks/` and keep:
- `tasks/README.md`;
- `tasks/TEMPLATE.md`;
- only task files created specifically for the new project.

Do this before creating the first project task so agents do not mistake template-development history for the product backlog or active phase.

## Lifecycle

1. Copy `tasks/TEMPLATE.md`.
2. Fill the task contract before implementation.
3. Link the task from the PR.
4. Update task status if needed during review.
5. Do not use this directory as a general backlog unless the project deliberately adopts that model.
6. Completed task files may remain for traceability or be archived according to project policy.

## Relationship to other docs

- `AGENTS.md`: how agents work.
- `docs/STATUS.md`: what is happening now.
- `docs/PROJECT-MEMORY.md`: durable rationale/decisions.
- `docs/ARCHITECTURE.md`: system design.
- `tasks/*.md`: bounded units of implementation work.
