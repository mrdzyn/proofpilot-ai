# UI-C3-02-BT-LIVE-01: Baseten live-inference readiness (dormant, unaudited)

Bounded implementation contract for a separately auditable Baseten-hosted
Muse Spark Open live-inference implementation for Zone L. Sources of truth:
`docs/UI-C3-02-LIVE-ANALYSIS-MODE.md` (merged PR #28), this file, and the
merged offline companion at `main@c2bff7d` (PR #31). **D1–D7 and D9 are
pending; D8 is design-only. No live inference path is enabled in this slice:
the transport is constructed only in tests, the D9 gate refuses everything,
and the mock path is the only runnable path.**

## D9 proposal (PROPOSED for owner approval — NOT approved, NOT activated)

Recorded from public vendor documentation re-read on 2026-11-02 (page
fetches only; no key, no account, no request; re-verify at authorization):

| Item | Proposed value | Public source (2026-11-02) |
|---|---|---|
| Direct Baseten model ID | `meta-models/muse-spark-open` | Library example; vision + audio model tables; overview |
| Rejected aliases | `meta/muse-spark-open` (OpenRouter), `meta-models/muse-spark-open-1026` (superseded) | Spec §8 D9; never substituted |
| Endpoint | `POST https://inference.baseten.co/v1/chat/completions`, base `https://inference.baseten.co/v1`, `Authorization: Bearer $BASETEN_API_KEY` | Chat Completions reference cURL + SDK examples |
| Request part | `{type:"video_url", video_url:{url:"data:video/mp4;base64,..."}}` after one `{type:"text"}` preamble; NO `response_format`/JSON mode (unsupported for this model); `n` unset (must be 1); `max_tokens` fixed (analysis ≤1024, proposal ≤512) | `*_url` part family + base64-in-body accounting (vision/audio docs); exact live acceptance of the `video_url` shape is proven only at authorization time — fail closed, never silently adapt |
| Provider caps (design bounds) | ≤1 video part, ≤25 MB staged (≈33 MB base64 < 100 MiB body); provider allows ≤2 videos, ≤300 s, H.264 et al, ≤96 frames, audio ignored, 200 MB combined media | Vision doc limits table + per-model notes |
| Rates (illustrative) | $1.25/1M input, $4.25/1M output, $0.15/1M cache input; video tokens scale with resolution×frames | Library pricing (re-verify at authorization) |
| Availability | Regions/capacity can change; account-specific availability via a separately authorized non-spending `GET /v1/models` (NOT done here) | Overview regions note |

Actual billing stays UNVERIFIED. A credit balance is not permission to spend.

## Reuse (read-only; merged code is not re-architected)

- Single-flight slot, epoch/revoke isolation, ticketed staging,
  identity-guarded cleanup, per-run cancellation (`server.ts`, `uploads.ts`).
- Permit ledger (`mock-permits.ts`), request guard, session manager.
- `encodeVideoPart` (typed `video_url` data-URL part + caps), `maxTokensFor`.
- Pure sanitizer envelope discipline (`responses.ts`); closed-grammar parser.
- Zone L shell, tokens, components, states (approved §5).

## New implementation (this slice only)

1. `packages/live-analysis/src/baseten-transport.ts` (new, pure except the
   injected fetch): exact-shape Chat Completions body builder
   (`buildBasetenChatBody`), `createBasetenTransport({model, apiKey,
   fetchImpl, timeoutMs})` refusing unless the model exactly equals the
   D9-approved ID (D9 pending ⇒ refuses everything), single POST, no retries,
   `redirect: 'error'`, AbortController timeout + `isCancelled` abort,
   strict response validation (2xx, JSON, `model` echo, non-empty text,
   safe-int usage, `finish_reason` recorded), typed refusals, exact result
   key allow-list (no raw text beyond sanitized observations, no body dumps,
   no key). No `process.env`, no key literal, no `response_format`.
2. `config.ts`: `D9_APPROVED_MODEL: string | null = null` (pending) +
   `validateLiveModel` (exact match only, `MODEL_UNAVAILABLE_OR_UNAPPROVED`
   otherwise). No other config change.
3. `responses.ts`: `sanitizeLiveAnalysisResponse` /
   `sanitizeLiveProposalResponse` (model echo = approved ID,
   `provider:'baseten'`, `transport:'baseten-live'`, `liveInference:true`,
   UNVERIFIED labeling carried by callers). Mock sanitizers byte-identical.
4. `server.ts` (minimal seam): accept optional `liveTransport` (test-only;
   the CLI passes nothing); when present but D9 refuses, fail closed with
   `MODEL_UNAVAILABLE_OR_UNAPPROVED` before permit consumption; the live
   branch otherwise reuses permit/quota/flight/epoch/cancel/settle with the
   live sanitizer and `{provider, model}` identity. Unreachable while D9 is
   pending — proven by zero-fetch-call tests.
5. Zone L: explicit mock-vs-live result branch (`transport` discriminator):
   live rows show provider, exact model id, run id, reported usage (not
   billing), quoted observations/uncertainty, `LIVE VIA BASETEN — UNVERIFIED
   MODEL OUTPUT`; no VERIFIED chip; T-ABSENT-1 narrowed from the bare
   `baseten` word to endpoint/credential strings (documented, reviewed).
6. Tests (offline only; no listener, no browser egress beyond loopback):
   transport contract (exact URL/headers/shape, no `response_format`,
   single-call invariant, timeout, cancel-abort, HTTP/shape/model/usage
   refusals, construction pinning, no-retry), D9/config matrix, live
   dormant-server tests (zero fetch calls, refusal codes, boundaries
   preserved), live sanitizer batteries, spend-boundary (quota spent only on
   sanitized success), concurrency/cancellation (existing suites untouched),
   Zone L provenance helper unit tests + existing browser mock assertions.

## Forbidden (unchanged + extended)

No API key reads, no `.env.local` inspection, no `process.env` in
`packages/live-analysis/src`, no authenticated calls, no billable inference,
no retries/fallback, no raw persistence, no verifier/oracle/grammar changes,
no historical-proposal access, no D9 self-approval/activation, no merge,
no deploy. New modules use the injected-fetch pattern only (never a direct
`fetch(`), so the static boundary scanner stays green.

## Acceptance

Lint + typecheck clean; full unit + security green (minus pre-existing
sandbox-only failures, proven identical on base); HTTP + Zone L browser +
shutdown + dashboard regression observed locally where the sandbox allows;
hosted CI green on the exact PR head; Draft PR + verification report; STOP
for independent GPT-6 audit and explicit owner authorization before any
live request.
