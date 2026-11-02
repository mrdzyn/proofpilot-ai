# UI-C3-02-I39 — Repeatable owner-supervised Baseten inference

Tracking issue: #39 (repeatable manually initiated inference). Base:
protected `main` incorporating merged PR #37. Prior activation contract:
`tasks/UI-C3-02-D9-I1.md` (§D9 hackathon-model correction); runbook:
`docs/UI-C3-02-D9-RUNBOOK.md`.

## Objective

Repeatable, manually initiated Baseten inference with durable
multi-attempt accounting, offline response-contract diagnostics, and
accurate live/mock UI labels — preserving the exact hackathon model, the
F01 media pin, the zero-proposal policy, single-flight requests, no
automatic retries, and both historical spent records.

## Scope

Allowed: `packages/live-analysis/src/` (ledger, attempts, record,
transport validation order, server status/binding/run-id), `scripts/`
owner CLI policy, `dashboard/src/zones/LiveZone.tsx` labels/counters,
`tests/` focused suites, `docs/` + `tasks/` records for this slice.

Forbidden: model/cap changes (1024/512 token caps stay; no new probes),
dashboard cosmetics beyond the live/mock labels, Zone L behavior beyond
labeling, any provider call, any credential read, any spend-record reset.

## Standing policy (issue #39; owner-approved by merging this slice)

- Default OFF, budgets zero. Opt-in per session: finite
  `--live-analyses N` or `unlimited` (explicit; never a 1-call policy cap).
- Every provider attempt needs a fresh single-use terminal permit plus an
  explicit Zone L click; never auto-run, auto-retry, or parallel/batch.
- Zero proposals: `--live-proposals` refuses any nonzero value everywhere.
- Exact hackathon model `meta-models/muse-spark-open-1026` (D9 pin), exact
  F01 media SHA-256 pin, same allowlists, single flight, no retries.
- Each send appends exactly one durable spend + fsync before the POST; no
  erase/refund on errors; no raw responses, secrets, or PII in the ledger.
- Repeatable sessions run only under the versioned `d9live-v2-` approval
  identity on a NEW ledger; historical D9-LIVE-01/D9-LIVE-02 records and
  geneses are frozen and can never authorize a new session.
- Unique durable run IDs within the ledger (`<local-run-id>#spend-<n>`,
  ledger sequence suffix — stable across restarts).
- Response validation decides by finish reason before content (`length` →
  `TRANSPORT_TRUNCATED`, never a misleading SHAPE); fail-closed, no leak of
  reasoning content or raw provider bodies.
- Zone L labels the armed path before action (LIVE vs MOCK), marks real
  inference as live/potentially billable, exposes attempts-left/spent
  counters, and requires a fresh permit + upload + click after every
  settle; mock strings are unchanged.

## Acceptance

- Focused suites: multi-attempt session (3+ manual sends, unique durable
  ids), error-then-next (no retry, spend kept), restart retention (unique
  ids across the counter reset), concurrency/duplicate-callback refusal,
  wrong-F01/model refusal with zero egress, default mock-only, arbitrary
  proposals refused; CLI unlimited opt-in + v2-identity gating; server
  genesis binding + namespace refusal; record identity/binding; TRUNCATED
  vs SHAPE battery incl. no-leak; status spent/unlimited fields.
- Full gates green: `pnpm lint`, root + dashboard `tsc --noEmit`,
  `pnpm test:unit`, `pnpm test:security`, `pnpm f01:baseline` (certified),
  plus required hosted CI on the exact PR head.
- Docs: README standing policy + honest cost, STATUS phase/gates,
  runbook repeatable session + D9-LIVE-01/02 outcomes, this task file,
  handoff section.
- Draft PR opened with CI evidence; STOP for independent exact-HEAD audit.
  No merge, deploy, preflight, credential read, live inference, test POST,
  or spend-record change.
