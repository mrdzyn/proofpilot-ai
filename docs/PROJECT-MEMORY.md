# Project Memory

## Purpose

This file preserves **durable project knowledge** across chats, archived threads, AI agents, and team handoffs.

It is primarily a continuity contract between the project owner and the project orchestrator.

It is **not**:
- a chat transcript;
- a changelog;
- a backlog;
- meeting notes;
- a duplicate of `docs/STATUS.md`;
- default startup context for every coding agent.

## Coding-agent policy

Coding agents should **not** read this file by default.

The normal startup order remains:

1. `AGENTS.md`
2. `docs/STATUS.md`
3. `config/project-profile.json`
4. task-specific design/docs
5. relevant code/tests

Agents may consult this file only when:
- explicitly directed by the project owner or orchestrator;
- durable historical rationale is genuinely needed for the task; or
- the assigned task specifically involves updating project memory.

## What belongs here

Record information that is likely to remain useful for months or across major phases:

### Locked product decisions
- Product identity, audience, platform scope, or behavior that has been deliberately settled.

### Architecture decisions and rationale
- Important architectural choices and the reasons behind them.
- Meaningful rejected alternatives when that context prevents future rework.

### Implementation and testing lessons
- Non-obvious lessons that future agents would otherwise rediscover.
- Important platform/toolchain limitations.

### Integration constraints
- Stable external API, store, infrastructure, protocol, or vendor constraints.

### Security and privacy boundaries
- Durable trust boundaries, data-handling rules, offline/online boundaries, authentication principles, or compliance constraints.

### Commercialization and launch decisions
- Stable licensing, pricing-model, distribution-channel, store, or launch decisions.

### Stable terminology
- Canonical names for products, modules, roles, flows, and domain concepts.

## What does not belong here

Do not add:
- every completed ticket;
- transient debugging notes;
- temporary blockers;
- daily progress;
- raw agent output;
- build logs;
- routine version bumps;
- duplicate architecture text already maintained elsewhere.

## Durable memory entries

### PM-001 — Real independent verification is the product invariant
**Decision:** ProofPilot may only report `VERIFIED` when a trusted, pre-registered oracle that the patcher cannot read or write first fails on the baseline for the intended behavioural reason and then passes on the approved candidate in a fresh runner, with required regressions and evidence integrity also passing. The verdict is decided by deterministic code, never by model narration.

**Rationale:** The hackathon entry's core claim is "Don't just fix the bug. Prove it's fixed." Letting a model or the patching agent self-certify would make that claim false.

### PM-002 — Meta Model API is primary; no silent model substitution
**Decision:** `muse-spark-1.3` (visual) and `muse-wonder-1.0` (code) on `https://api.meta.ai/v1` are the primary models. Baseten (`meta-models/muse-spark-open-1026`) is an optional secondary provider. A model is used only when the exact configured ID is available. Fallbacks must be explicit, declared, and tested.

**Rationale:** Hackathon rules require genuine use of Meta models, and judges must be able to trust the model IDs in evidence.


## Maintenance rule

When adding an entry:
- assign the next memory ID;
- describe the decision/lesson clearly;
- include rationale;
- avoid temporary implementation detail;
- update an existing entry rather than creating contradictory duplicates when a durable decision changes.
