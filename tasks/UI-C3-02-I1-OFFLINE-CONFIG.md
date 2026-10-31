# UI-C3-02-I1 — Offline Baseten Configuration Contract

> **IMPLEMENTATION SLICE: OFFLINE ONLY.** Owner requested "start UI-C3-02 Implementation" on 2026-10-31. This permits **this bounded code-and-mock-test slice**, not live inference, a credential read, an approval, a quota change, a merge, or deployment.

## Source of truth and branch

- Approved docs-only architecture: `docs/UI-C3-02-LIVE-ANALYSIS-MODE.md` (PR #28 squash-merged into `main@2bbe696461a0c05ddc280e5ea7d38301157ed2fb`).
- Branch: `feat/ui-c3-02-i1-offline-config`, from that main SHA.
- Existing UI-C3-01A PR #26 and UI-C3-01B PR #27 remain **Draft and unmerged**. The browser Zone L must not be built against `main` pretending the dashboard is merged. Stage later UI changes on an explicitly reviewed stack of the dashboard work and retarget/rebase only after owner-controlled merge decisions.
- Approved design direction for Zone L is described in the architecture specification. This I1 is backend-free pure logic, so UI design gate: **Not applicable**.

## Objective

Prove, without any environment access or provider contact, that the future companion cannot mistake a wrong Baseten API base URL for the approved endpoint, and that **no model is authorized before D9**.

### Allowed

- `packages/live-analysis/src/config.ts`: pure functions and typed refusal results, no I/O.
- `tests/unit/live-analysis-config.test.ts`: L-CFG-1 success matrix for URL resolution and refusal matrix for model approval.
- This task contract and the minimal STATUS + append-only handoff bookkeeping.
- Synthetic strings only; no real secret, key, approval, recording, or stored proposal.

### Forbidden

- Reading `.env.local`, `process.env`, any API key or approval record.
- Network requests, Baseten/Meta/OpenRouter access, spending, remote model listing, retries, or fallback.
- Companion HTTP server, pairing, upload, video encoding, quota activation, browser Zone L or provider transport.
- Accessing the historical stored real-model proposal `c3-live-meta-001`.
- Changing verifier/oracle/patch policy/trust roots; touching the spent Meta quota.
- Merging PRs #26, #27, or this task PR; deploying or publishing.
- Representing mocked code as a live working AI integration.

## Behavior

1. Accept exactly `https://inference.baseten.co/v1` or the form with one terminal slash; after component checks return only `https://inference.baseten.co/v1/chat/completions`.
2. Refuse all malformed, wrong-scheme, wrong-host, explicit-port, userinfo, query, fragment, doubled-path, or non-string inputs with `ENDPOINT_UNAPPROVED`.
3. Configured `BASETEN_MODEL=meta/muse-spark-open` is not assumed equal to public direct-Baseten `meta-models/muse-spark-open`. Until owner D9, refuse **every** model value — even the documented direct ID — with `MODEL_UNAVAILABLE_OR_UNAPPROVED`, without a success/approval escape hatch.
4. No actual provider call and no positive authorization path, including in the test harness.
5. Future implementation must make a separate reviewed change to the D9 approval gate; this I1 does not approve any model or change `APPROVED_LIVE_QUOTA`.

## Test objective, evidence and stop rule

- Run `node --test tests/unit/live-analysis-config.test.ts`, `pnpm typecheck`, `pnpm lint`, `git diff --check` where a suitable checkout is available.
- Required GitHub CI Common and Stack checks must pass at the exact candidate SHA before independent review; report which commands were **actually** executed.
- L-CFG-1: legitimate URL pair, invalid URL matrix, URL rejection ordering, D9 model refusal for owner/OpenRouter, superseded `-1026`, empty, and documented direct model. Any `ok: true` live configuration before D9 is a fail.
- No browser QA needed for I1 because no UI is touched.
- After the objective is met, **STOP**, open/retain Draft PR, request independent GPT-6 audit. No merges or inference.

## Later slices (NOT covered by I1)

- I2: owner-reviewed, zero-network pairing/session/permit/CSRF companion with mock transport only; exact permission gates per architecture.
- I3: Zone L fixture-only shell stacked on the unmerged UI-C3-01B branch, owner visual acceptance, 320px/200% zoom and keyboard tests.
- I4: provider adapter and actual Baseten request **only** after separately recorded D1–D7 and D9, owner per-run approval, security audit, and independent review. No implicit authorization from GitHub PR/CI.
