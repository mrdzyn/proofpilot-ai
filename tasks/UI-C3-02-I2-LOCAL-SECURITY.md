# UI-C3-02-I2 — Local Companion Security Logic, Offline-Only

> **Owner kickoff:** "start next" (October 31, 2026). This authorizes a bounded **offline, mock-only security implementation**, NOT permission to start a companion listener, read credentials, make model calls, spend credits, merge, or deploy.

## Base and dependencies

- Approved UI-C3-02 architecture: `docs/UI-C3-02-LIVE-ANALYSIS-MODE.md` from docs-only PR #28, merged as `main@2bbe696461a0c05ddc280e5ea7d38301157ed2fb`.
- **Stacked implementation:** This branch `feat/ui-c3-02-i2-local-security` starts from I1 Draft PR #29 exact HEAD `3593527b3629b9de8e49725000cd687430466c6c`. I1 had exact-head hosted green CI; **I1 independent audit/owner merge decision remain outstanding**. I2 must not merge before its base is independently approved and integrated.
- The UI dashboard branches #26/#27 are still unmerged; this slice does **not** add Zone L or modify that design.
- This is pure security-state logic. **UI design gate: N/A.**

## Test objective

Prove that local HTTP *request metadata*, terminal-pairing/session state, and **mock-only** permits are strictly validated offline; no source in this slice can cause a provider call or access `.env.local`.

## Allowed files

- `packages/live-analysis/src/request-guard.ts`: typed pure request routing/Host/Origin/fetch-metadata/content-type/body-size policy; no listener.
- `packages/live-analysis/src/local-session.ts`: memory-only terminal code, rate-limited pairing and short-lived cryptographic session token.
- `packages/live-analysis/src/mock-permits.ts`: mock-only terminal single-use hash/run/kind/byte-bound permits. **Not a production quota, approval or activation pin.**
- `tests/unit/live-analysis-security.test.ts`: L-CSRF-1 / L-PAIR-1 / L-LIMIT-1 / L-AUTH-1 / L-ONE-1 mocked refusal/acceptance drills.
- `tests/security/live-analysis-offline.test.ts`: negative static boundary against network/env/provider surfaces.
- This task, `docs/STATUS.md`, append-only `docs/HANDOFFS.md`.

## Required observable behavior

1. Exact route/method allowlist; strict Host `127.0.0.1:<port>` (optional `localhost:<port>`) and origin matching; no arbitrary DNS names, paths or query strings.
2. `GET /api/health`: no session, returns **no** run/permit/quota info in future. `POST /api/pair`: only pre-session POST, requires present exact Origin, JSON ≤1 KiB, one-time terminal code with 2-minute TTL, 5 failures/minute lockout. **No issued pairing code may be exposed via an HTTP GET route.**
3. State-bearing GETs (`/api/status`, `/api/events`): accept valid session, Host, no Origin on legitimate polling, and same-origin/absent fetch metadata; deny wrong/null Origin, cross-site metadata and invalid sessions.
4. Mutating POSTs (`/api/upload`, `/api/analyze`, `/api/propose`): present exact Origin, real verified session, appropriate content type and bounded body length. Future listener **MUST** derive sessionAuthenticated from locally validated `X-Live-Session`, never a caller-controlled body or header boolean.
5. Token 256-bit cryptographically random, held only in local companion memory as a digest; browser receives it only through a future securely implemented `POST /api/pair`. Sessions expire after 30 minutes idle or 4 hours absolute; restart/logout/revoke destroys them.
6. Mock permits are run-id, SHA-256, byte-count and action-bound, single-use, and consumed on failure/timeout/mismatch. These are **ephemeral mock records** with **no restart-durable spend controls**: a later approved implementation must integrate durable reservation, activation pin, operator approval and D9 before a live provider request.
7. The I1 `evaluateOfflineLiveConfiguration` remains **unconditionally refusing** every model while D9 is outstanding. Neither successful local session nor mock permit implies any billable authority.
8. New tests must never need actual credentials, network, player video, existing `.proofpilot/` artifacts, or untrusted model-generated CSS.

## Forbidden / deferred

- **No HTTP listener, cookie auth, network, real upload, Baseten transport/SDK, model listing, `process.env` read, credentials, actual spend, C3-LIVE quota/pin change, or verification.**
- No reuse of the spent Meta quota; no touching the stored proposal `c3-live-meta-001`.
- No changes to `verifier/`, `packages/core/`, patch policy, oracle, trust roots, or dashboard PRs #26/#27.
- No speculative `VERIFIED` labels on AI outputs, no merge/deploy/publish.
- No I3/I4 work in this PR; production HTTP request parsing, listener address binding, CSRF integration, upload cancellation/cleanup, durable spend and provider response parsing require new reviewed slices.

## Validation / stop

- Focus: `node --test tests/unit/live-analysis-security.test.ts tests/security/live-analysis-offline.test.ts tests/unit/live-analysis-config.test.ts`.
- `pnpm typecheck`, `pnpm lint`, `git diff --check`; Common and Stack GitHub CI at exact HEAD.
- Browser testing not applicable: no browser-facing app or listener modified.
- Independent audit must examine security assumptions, code, test quality and deliberate mock limitations. Fix findings on this Draft PR, **STOP** pending audit and separate owner merge approval; do not merge I1/I2 automatically.
