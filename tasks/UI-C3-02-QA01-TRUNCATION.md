# UI-C3-02-QA01 — Truncation remediation (offline implementation)

Owner QA: D9-LIVE-V2-QA-01 — preflight PASS (21 models), model
`meta-models/muse-spark-open-1026`, certified F01 MP4, allocation 3
analyses / 0 proposals. First permit expired pre-send (no spend). First
completed attempt: `TRANSPORT_TRUNCATED` (`live response envelope
malformed`), spend recorded, 2 remaining, 0 accepted model analyses.
Owner has paused further attempts.

## Root cause (offline diagnosis, `TRANSPORT_TRUNCATED` = `finish_reason: length`)

The provider stopped generation at a length limit under the fixed
`max_tokens: 1024` analyze cap — consistent with a reasoning model
exhausting the output budget before producing completion text (C2B Meta
evidence: 601–1113 reasoning tokens for comparable F01 tasks). The
request was well-formed (200, model echo matched, choices present);
refusal was fail-closed at two layers with nothing accepted or rendered.
Unknown: exact token split (refusals previously surfaced no usage),
whether the cap or a deployment-side limit bound, and whether the video
was processed. D9-LIVE-02's SHAPE may share this cause (old validator
reported length+empty as SHAPE).

## Scope (this slice only — offline, no provider contact)

1. `ANALYZE_MAX_TOKENS`: 1024 → 2048. Proposals stay 512. No other
   request field changes; no reasoning knob (no `-1026` deployment
   evidence — documented below as conditional only).
2. TRUNCATED refusals carry validated numeric-only `usage`
   (prompt/completion/total as safe non-negative integers; absent or
   malformed counts are dropped, code stays TRUNCATED). Details stay
   generic; no content, reasoning, or raw-body leakage at any layer
   (validator → transport → run record → Zone L).
3. Server plumbs the diagnostic into refused live run records; Zone L
   renders it only for TRUNCATED with complete numeric usage, labeled
   provider-claimed / diagnostic-only / not billing.
4. Runbook/STATUS/task/handoff record the QA state (1 spend, 2
   remaining, 0 accepted) and the deferred `reasoning_effort: "low"`
   optimization (separately approved, needs exact `-1026` evidence).

## Forbidden

Provider calls, preflight, credential access, live inference, retries,
ledger modification/reset/reopen, model/F01/authorization/ledger changes,
silent cap changes elsewhere, merging, deployment, activation.

## Acceptance

- Request-shape test pins 2048/512 with no new fields and no reasoning knob.
- Diagnostics tests: valid usage surfaces numeric-only; missing/malformed
  usage omitted with code unchanged; reasoning/raw markers never surface.
- Server test: truncated attempt → refused record with usage, exactly one
  spend, no retry, status counters 1 spent / 2 remaining.
- Full gates green: lint, root + dashboard `tsc`, unit, security,
  `f01:baseline`, required hosted CI on the exact head.
- Draft PR opened; STOP for independent exact-HEAD audit. No live send authorized.
