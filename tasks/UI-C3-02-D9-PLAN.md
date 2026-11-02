# UI-C3-02-D9-PLAN — Bounded Baseten activation preparation

> **STATUS: DOCS-ONLY DRAFT FOR OWNER DECISIONS AND INDEPENDENT REVIEW.**
> This task prepares the next implementation contract. It does **not** approve D9, enable a model, authorize credential access, create spend authorization, or call a provider.
> Starting point: `main@cb484711d7a4e70fd63b5300d2dde276baed8ff3` (owner-approved PR #32 squash merge). D9 remains `null`; the companion CLI is mock-only.

## 1. Objective and acceptance boundary

Prepare one **separate, bounded** activation change for Zone L to support an eventual **single owner-authorized** Baseten-hosted Muse Spark Open *synthetic F01 video analysis*. The first real attempt must never require executing generated CSS, touching historical Meta proposal evidence, or weakening the independent verifier.

Success **for this docs-only draft** is a reviewable gate sequence and a proposed implementation task. Success **for the later activation implementation PR** requires independently verified no-egress unit/integration tests with fake credentials, a fully wired but default-disabled provider path, exact-source model provenance, and an explicit owner approval. Only a still-later, one-shot owner-run operation may contact Baseten.

UI design gate: Not applicable (this is a bounded activation/security plan; existing Zone L UI is already designed).

## 2. Fixed architecture and provenance

- **Provider**: Baseten Model APIs only (D8 design selection recorded). No direct Meta API or OpenRouter fallback. Historical `muse-spark-1.3` results remain immutable, spent and separately labelled.
- **Base URL / endpoint**: `https://inference.baseten.co/v1` and a single `POST /chat/completions`, constructed from the approved constant. TLS only; `redirect: 'error'`.
- **Proposed D9 model identifier**: `meta-models/muse-spark-open` (Baseten's Oct 15, 2026 changelog and a library example). **NOT owner-approved**. Another current Baseten library example displays `meta/Muse-Spark-Open-816B-A42B`; the public examples conflict. Reconcile exact identity with official documentation and, preferably, a separately owner-authorized **non-spending** authenticated model-availability check. Never translate or substitute an identifier. If the exact account model is not proven, STOP without activation.
- **Proposed input**: one locally validated, SHA-256-bound synthetic F01 H.264 MP4, at most 25 MB, transmitted as one `video_url` `data:video/mp4;base64,` part alongside a fixed text prompt. Baseten's accepted exact video part contract **has not been proven by live traffic**; a failed request is a consumed attempt, with no request-shape retry.
- **Output**: untrusted text only, exact model echo and `finish_reason: stop`; parsed/sanitized with strict length/usage constraints; any proposal is `UNTRUSTED PROPOSAL — NOT VERIFIED`. Existing trusted verification evidence is distinct.
- **Pricing reference (not a spend cap)**: official Baseten pricing page on 2026-11-02 lists approximately **$1.25 input / $0.15 cache input / $4.25 output per 1M tokens**. Video-token cost and actual billing cannot be guaranteed from video byte size. Recheck before approving spend; a single request limits attempts, not dollars.
- **Retention**: synthetic F01 video only. Baseten privacy/retention terms to be confirmed under D5 before a real request. No raw media, base64, provider text, or secrets in Git/CI logs.

## 3. Decisions: all explicitly recorded by the owner

| Decision | Current status | Required before any provider call |
|---|---|---|
| D1 Baseten workspace / single-use lifetime allowance | PENDING | Name workspace and exact maximum: proposed **one analysis, zero proposals** for first live proof; no rearming on restart |
| D2 billing/spend risk | PENDING | Owner acknowledges token-price uncertainty and any available credit; no guaranteed currency cap |
| D3 synthetic media | PENDING | Identify exact F01 MP4 SHA-256, size, duration, and consent scope |
| D4 credential + companion trust | PENDING | Owner-only key injection, key ownership/revocation and localhost workflow; no key value shared with coding agents |
| D5 media privacy/retention | PENDING | Confirm synthetic video transfer and provider retention policy |
| D6 demo disclosure | PENDING | Explicit permission to record/display provider, run identity and usage |
| D7 sequencing | PENDING | Separate review, activation-branch audit, merge and one-shot live-call approval |
| D8 provider selection | DESIGN-ONLY RECORDED | Baseten chosen; this is **not** execution approval |
| D9 exact direct model identity | PROPOSED ONLY | Record an exact, account-proven Baseten model ID; aliases refused |

This PR requests **none** of those approvals implicitly.

## 4. Bounded *next* activation implementation PR — NOT included here

Implement only after the decisions above are addressed as appropriate for each step; an approval to *prepare code* is not approval to *perform inference*. Scope for a new, separate Draft PR (starting from whatever `main` is then):

1. **Runtime gating**: Keep `D9_APPROVED_MODEL = null` in the default and production-safe runtime until an independently reviewed D9 decision. Any model-approval change must have its own exact-head diff and tests. Preserve an explicit, default-OFF live runtime switch with no auto-enable via env aliases, argument fallthrough, or UI state. Do not equate a checked-in model ID with permission to spend.
2. **Owner-started CLI wiring**: Introduce only the documented `BASETEN_API_KEY`, `BASETEN_API_BASE_URL`, `BASETEN_MODEL` variables into the privileged *owner-started* process after preflight. Zero provider credentials in React, tests, docs, browser state, child-process environment or persisted artifacts. No automatic model discovery, no key printing, and no provider requests during startup.
3. **Authorization**: Maintain terminal-only pairing and hash+byte+action-bound single-use permits, expiry and revocation, exact Origin/Host/session checks, single-flight and epoch isolation. **Separate** mock success quota from live provider-attempt budget. Correct the dormant `server.ts` `quotaFor(kind)` coupling: live requests must be governed by live-attempt budget, not mock quota. Review any public `/api/status` quota fields for correct provenance.
4. **Immutable attempt gate**: Require a fresh, exact owner-approved run ID, SHA-256, kind and budget with fail-closed default zero. Consume the live authorization synchronously *before* the only `fetchImpl` call. No refund after send, including 429/500, timeout, cancellation, bad model echo, malformed response or sanitizer failure. No retries/fallback, no background resend, no second call.
5. **Transport and response**: Use existing pinned Baseten transport and fixed caps (analysis max 1024 output tokens, proposal max 512 only if separately approved). Strict 2xx, exact model echo, `finish_reason: stop`, safe-integer usage, and quoted untrusted response. Fail closed on unsupported `video_url` part; do **not** silently adapt to another request shape.
6. **Safe dry-run evidence**: Use injected fetch doubles and synthetic media to prove every gate, from same-origin HTTP through final send authorization and settlement. Ensure cancellation/revoke/shutdown/failed-authorization clean timers, staging and slots. Verify attempt spent after every post-send failure and unchanged after pre-send refusal. No non-loopback network in CI.
7. **Operator runbook**: Separate preflight, owner approval capture, explicit one-shot command, actual request identity/usage reconciliation, safety shutdown, secret rotation and immediate rollback to mock-only. Provide short, redacted demo steps. Explicitly distinguish verified browser evidence from unverified model output.

### Required negative / acceptance checks

- **D9 fail-closed** without decision and after key/config mismatch (zero outbound calls).
- **Availability conflict**: documented slug vs alternate library slug vs account listing; no fallback, wrong model is refused.
- **No permit / wrong hash / expired code / revoked token / wrong Host or Origin**: no staged bytes, no provider call.
- **Budget 0**: no calls; **budget 1 with concurrent contenders**: exactly one call; no extra call after restart or HTTP failure (the current in-memory ledger resets on restart, so the activation design must use a durable, tamper-evident spent-run record or an equally strong non-rearmable one-shot approval).
- **Exhaustion between pre-check and send**: final `onSend` denial, no call, no leaked timer; prove exact settled state.
- **Request timeout/cancel/revoke**: one request at most, spent authorization not refunded, staged media deleted, new epoch unaffected.
- **Malformed/partial/wrong-model output**: no `VERIFIED` status; raw response and secret never saved.
- **Browser/CI**: mock flow unchanged, UI reflects provider+model+run ID+usage without claiming actual billing; no non-loopback browser requests.
- **Manual on owner Mac**: HTTP, Zone L Chromium, shutdown and dashboard tests on exact implementation HEAD; test harness teardown anomalies recorded, not hidden.
- **Required CI + independent security audit** on the exact activation HEAD before any owner merge decision.

## 5. Strict separation and stop rules

- **This PR:** docs-only prep. Allowed: this task file, `docs/STATUS.md` operational pointer, and append-only `docs/HANDOFFS.md`. Forbidden: editing `config.ts`, `server.ts`, `baseten-transport.ts`, CLI, UI, secrets, CI rules, trusted oracle, stored Meta proposal, test expectations, pricing configuration, quotas or activation pins.
- **Activation implementation:** separate task/branch/PR; default OFF; no live egress during CI; separate exact-head independent review and explicit merge authority.
- **First live attempt:** separate, *explicit* owner decision after account availability/privacy/spend acceptance and verified activation. One synthetic F01 analysis request only. Stop on any refusal, wrong model, contract mismatch, or lost response. Do not retry.
- **No automatic closure**: after the one-shot demonstration, require evidence reconciliation and a separately reviewed disable/re-lock change. Do not leave live mode enabled for routine use.

## 6. Acceptance for this documents-only draft

1. Both PR #32 merge SHA and active D9 pending state are recorded accurately.
2. Vendor documentation conflicts are flagged; the model ID is proposed, not silently approved.
3. No runtime code, security gates, external calls, or billable settings change.
4. A reviewer can derive the bounded activation implementation and one-shot runbook without inventing missing owner decisions.
5. Open one Draft PR, request independent review, and STOP. Do not merge or activate.
