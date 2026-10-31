# UI-C3-02 Live Muse Spark Analysis Mode — architecture & security proposal

> **STATUS: PROPOSAL ONLY — DESIGN/DOCS ONLY. NOT APPROVED. DO NOT IMPLEMENT.**
> No provider call, credential read, quota change, merge, or deployment is
> authorized by this document. Implementation requires a separate owner decision
> and a new bounded task contract. The required end state of this proposal is a
> reviewed Draft PR and STOP.
>
> **Provider selection (owner decision, Oct 31, 2026): Baseten is the selected
> provider for future UI-C3-02 live inference** — Baseten Model APIs, model
> `meta-models/muse-spark-open`, endpoint
> `https://inference.baseten.co/v1/chat/completions`. This approves revising the
> docs-only design only — not a live call, credential read, spend, merge, or
> deploy.

## 1. Objective

Give the hackathon demonstration a live, interactive AI moment without
weakening any boundary that the UI-C3-01A design (PR #26) and the UI-C3-01B
functional dashboard (PR #27) were audited against.

Required experience, in order:

1. The owner selects a local F01 MP4 through the browser file picker.
2. The owner explicitly clicks **Analyze with Muse Spark Open (Baseten)** (no
   automatic call).
3. The dashboard shows upload/analysis progress and the actual model response.
4. The dashboard displays model observations, model-stated uncertainty, token
   usage, and the provider run identity.
5. The owner may optionally request one constrained, untrusted fix proposal.
6. Trusted verification evidence stays in its own separate view at all times.
7. An unexecuted model proposal is **never** labelled VERIFIED.

New live runs use **Baseten-hosted Meta Muse Spark Open** and are recorded as
`provider: baseten`, `model: meta-models/muse-spark-open`. They are **not**
direct Meta Model API usage and are **not** identical to, or comparable with,
the historical Meta `muse-spark-1.3` runs: the historical LIVE-C3-01 attempt
(`c3-live-meta-001`, `provider: meta`, spent quota, `UNTRUSTED — NOT
VERIFIED`) keeps its own provenance, labels, and hard-disable, and every UI
surface names the provider and model of the run it shows.

Non-objectives: verifying or executing the stored proposal `c3-live-meta-001`
(stays hard-disabled), re-running LIVE-C3-01, any hosted backend, any change to
the verifier/oracle/grammar/patch policy.

## 2. Bounded contract

### 2.1 In scope (proposal only)

- This specification, UI change descriptions (§5), trust-boundary diagram (§4),
  owner decisions (§8), and testing plan (§9).
- A future implementation task contract derived from this document, only after
  owner approval of the proposal.

### 2.2 Forbidden scope (holds for the proposal and any implementation)

- No API credentials in React, in the bundle, in fixtures, or in screenshots.
  `BASETEN_API_KEY` lives exclusively in the owner-started companion's
  environment.
- No automatic calls, no retries, no fallback provider/model/endpoint, no
  batch loop: one explicit click → at most one provider request, then STOP.
- No public media URLs, no separate remote-upload/Files lifecycle: the video
  travels inline in the single authorized Chat Completions request (§3.3).
- Synthetic F01 recordings only for the first iteration (§7).
- The exhausted Meta LIVE-C3-01 quota stays spent; its hard-disable controls
  stay closed (§6).
- No model-generated code execution; no changes to the verifier, oracle,
  grammar, patch policy, coordinator, activation pin, or trust roots.
- No fabricated results: every live value is displayed with its run identity
  and provenance, or not displayed at all.
- No merge, publish, deployment, or submission on the agent's behalf.

### 2.3 Stop rule

If any boundary in §2.2 cannot be held by the proposed mechanism without an
exception, stop and return the decision to the owner: the mode ships with fewer
capabilities, never with a weakened boundary (same rule as the dashboard
security contract, PR #26).

## 3. Architecture

### 3.1 Components

- **Dashboard (React, existing UI-C3-01B shell).** Renders only. Holds no
  credential, no approval, no quota, no session secret in storage. Talks
  exclusively to the companion over loopback; every live value it shows is
  quoted text under an explicit `LIVE VIA BASETEN — UNVERIFIED MODEL OUTPUT`
  banner carrying the Baseten run identity.
- **Companion (new, owner-started localhost process, e.g.
  `node scripts/c3-live-analysis.ts`).** Serves the dashboard UI and the live
  API **same-origin** on `127.0.0.1:<port>` (no CORS at all, no wildcard
  anywhere). The only component that may hold `BASETEN_API_KEY`, and only via
  its invocation environment (inherited from the LIVE-C3-01B runner pattern:
  credential read by the production runner after read-only authorization, never
  by an agent, never printed, never persisted). Owns: loopback request
  authentication (§3.4), per-request authorization check, quota enforcement,
  input validation and file-hash binding, server-side request encoding, the
  single provider call, strict output validation, upload lifecycle and
  cleanup, and sanitized-evidence persistence.
- **Baseten Model APIs (`meta-models/muse-spark-open` only).** The only
  permitted non-loopback egress, fixed to
  `https://inference.baseten.co/v1/chat/completions`, bearer
  `BASETEN_API_KEY`, only from the companion, only inside an authorized
  request.
- **Evidence store (`.proofpilot/`, gitignored, mode `0600`).** Sanitized
  fields only (same allow-list discipline as the LIVE-C3-01 artifact: no raw
  provider text, no error text, no credential, no unknown keys), each live
  record carrying `provider: baseten` and the model id.

### 3.2 Request lifecycle (exactly one request per explicit authorization)

```text
owner picks MP4 in dashboard
  → dashboard computes local SHA-256 + metadata (existing UI-C3-01B logic)
  → owner clicks "Analyze with Muse Spark Open (Baseten)"
  → dashboard POSTs { fileSha256, fileBytes, durationS, dimensions } + session
    header to companion (same-origin; §3.4)
  → companion REFUSES unless a live single-use permit exists for exactly
    that hash (permit created only by the owner in the companion terminal,
    §6.2; the click alone authorizes nothing)
  → owner uploads the bytes (companion re-hashes; mismatch → refuse + delete)
  → companion builds ONE Chat Completions request with the video inline
    (server-side base64 data URL from the hash-verified bytes, §3.3)
  → strict validation (closed grammar for proposals; allow-listed fields
    for observations) → sanitized evidence persisted → staged bytes deleted
  → dashboard polls status and renders quoted output; permit spent
```

No permit → no upload, no call. Permit is single-use, hash-bound, and short-TTL.
Interruption at any point leaves no verdict: partial output is never rendered.

### 3.3 Baseten request shape (contract-pinned, mock-validated first)

Single `POST https://inference.baseten.co/v1/chat/completions`, bearer
`BASETEN_API_KEY`:

- `model: "meta-models/muse-spark-open"` (fixed; no caller override).
- One user message with two content parts: a text prompt (fixed analysis /
  proposal grammar preamble) and one typed video part —
  `{"type": "video_url", "video_url": {"url": "data:video/mp4;base64,..."}}` —
  constructed **server-side** by the companion from the hash-verified bytes.
  No public URL, no object storage, no Files API, no arbitrary outbound URL.
- Bounded size: synthetic MP4 ≤ 25 MB → ≈33 MB base64, inside Muse Spark
  Open's 100 MiB request-body cap (provider caps for this model: max 2 videos
  per request, 200 MB combined media, 300 s max duration, H.264 accepted;
  provider samples at most 96 frames per video and ignores the audio track —
  disclosed in the UI so the demo never implies full-video viewing).
- Capped generation (`max_tokens` fixed; proposed analysis ≤ 1,024, proposal
  ≤ 512 — fixed at authorization time).
- Strict response validation: HTTP 2xx with the Chat Completions shape,
  `model` echo check, allow-listed `usage` fields, non-empty text content;
  anything else → typed refusal, permit spent, nothing rendered. The exact part
  shape is pinned by mocked-transport contract tests first; if the live
  endpoint ever rejects the shape, the companion fails closed and returns the
  decision to the owner — shapes are never silently adapted.

Sources (verified Oct 31, 2026; re-verify at authorization time):
`https://www.baseten.co/library/muse-spark-open/` (model id, base URL,
`BASETEN_API_KEY`, video modality, listed rates),
`https://docs.baseten.co/inference/model-apis/vision` (video acceptance,
per-model limits, base64-in-body accounting).

### 3.4 Loopback authentication (localhost is transport, not identity)

- **Same-origin service.** The companion serves the dashboard document and the
  live API from one `127.0.0.1:<port>` origin. No `Access-Control-*` headers
  are ever emitted; cross-origin browser calls are impossible by construction,
  not by policy string.
- **Host/Origin verification.** Every API request must carry
  `Host: 127.0.0.1:<port>` (or `localhost:<port>`); anything else — including
  DNS-rebinding hostnames that resolve to 127.0.0.1 — is refused before any
  state is touched. When an `Origin` header is present it must exactly equal
  the companion origin; a `null` Origin (e.g. `file://` or sandboxed context)
  may load the historical zones but every live API call is refused.
- **Session authorization (not the provider key).** Mutating calls
  (`/api/upload`, `/api/analyze`, `/api/propose`) additionally require a
  per-process ephemeral session token in a custom header (`X-Live-Session`):
  issued only through the companion terminal pairing step, held in React
  memory only (never `localStorage`/disk), void on companion restart with all
  permits. Simple CSRF vectors (plain form POSTs, cross-origin `fetch`
  without the custom header) fail closed.
- **Endpoint restrictions.** Exact-path allowlist only:
  `/api/status` (GET, read-only), `/api/upload` (POST bytes),
  `/api/analyze` + `/api/propose` (POST, JSON, permit-bound),
  `/api/events` (GET status poll). No path parameters, no static-file
  traversal, no method beyond the one each path allows.
- **Resource limits.** Request body ≤ 30 MB; per-request idle 60 s and total
  10 min ceilings; one in-flight live request per companion; staged bytes
  capped at one file (a second upload replaces-and-deletes the first).
- **Adversarial acceptance** in §9 (L-CSRF, L-LIMIT): hostile cross-origin
  GET/POST, null Origin, rebinding Host, missing/stale session header,
  permit replay after restart, oversize bodies, and concurrent second
  requests are all refused with typed errors and zero provider egress.

### 3.5 What the companion reuses (no reinvention)

- Gate order and single-use approval/reservation mechanics from
  `tasks/PP-META-I2-C3-LIVE-01B.md` and `packages/inference/src/`
  (`authorizeProductionAttempt`, single-use approval consumption,
  `retries: 0`).
- TTY + typed-confirmation discipline from `scripts/c3-live-proposal.ts`
  (`SEND ONE META REQUEST <runId> <hash12>` pattern → new permits name the
  Baseten run id and file hash).
- Sanitized-artifact allow-list discipline from
  `docs/LIVE-C3-01-EXECUTION-REPORT.md` §4, extended with `provider: baseten`,
  model id, endpoint, and Baseten usage fields.
- Refusal-drill pattern from `docs/C3B2B-REAL-PROPOSAL-PROCEDURE.md` §3.3:
  the disabled build must fail closed with a named refusal and exit `2`.

## 4. Trust-boundary diagram

```text
┌─ Owner browser (React dashboard) ──────────────┐  UNTRUSTED RENDER
│ file picker · local SHA-256 · quoted text only  │  no secret, no approval,
│ LIVE VIA BASETEN banners · NO VERIFIED chip     │  no verdict authority;
│ historical zones keep Meta-1.3 labels          │  session token in memory
└───────────────┬────────────────────────────────┘  only, never stored
                │ SAME-ORIGIN loopback only (companion-served UI + API,
                │ Host/Origin-checked, X-Live-Session on POSTs)
┌───────────────▼────────────────────────────────┐  CREDENTIAL BOUNDARY
│ Companion 127.0.0.1:<port> (owner-started)      │
│  • session + single-use hash-bound permit check │
│  • quota (new Baseten LIVE record; Meta C3-01   │
│    stays spent; §6)                             │
│  • re-hash upload, server-side base64 encode,   │
│    ONE fixed-shape Baseten request, token caps  │
│  • strict validation, sanitized persistence,    │
│    staged-byte cleanup (always deleted)         │
└───┬───────────────────────────────┬────────────┘
    │ ONLY egress: POST             │ local evidence writes
    │ inference.baseten.co/v1/      │ (.proofpilot, 0600, allow-list,
    │ chat/completions, bearer      │ provider: baseten records)
    │ BASETEN_API_KEY (env only)    │
┌───▼────────────┐   ┌──────────────▼─────────────┐
│ Baseten Muse   │   │ Verifier / oracle / gates  │
│ Spark Open     │   │ UNCHANGED: no model exec,  │
│ (untrusted     │   │ no gate changes; Meta      │
│  output)       │   │ C3-01 stays hard-disabled  │
└────────────────┘   └────────────────────────────┘

Historical (provider: meta, muse-spark-1.3, spent) vs live (provider: baseten,
meta-models/muse-spark-open): separate views, separate records, never merged.
```

Crossing rules: `BASETEN_API_KEY` never crosses toward the browser (env-only,
never on the wire, never logged); nothing crosses from the model toward the
verifier; live and historical views never share a verdict chip or a run id.

## 5. UI changes (against the UI-C3-01B shell, PR #27)

New **Zone L · Live Analysis via Baseten (explicit opt-in)** placed after the
historical zones, visually separated (own section, own heading,
`LIVE VIA BASETEN — UNVERIFIED MODEL OUTPUT` banner on every live value,
naming model `meta-models/muse-spark-open` and the Baseten run id). Reuses
catalog components only: `EvidenceTable`/`Row` for observations/usage/run
identity, `LoadingState` for upload/analyzing progress, `ErrorState` for typed
refusals, chip banners extended with a live-run variant.

Required states (per `docs/DESIGN-SYSTEM.md` required-states list):

- idle (prerequisites listed: companion reachable? session paired? permit
  present? quota left?);
- ready-to-request (file validated, hash shown, permit confirmed);
- uploading (bytes + progress, cancellable; cancel deletes staged bytes);
- analyzing (no fake progress: indeterminate until Baseten responds);
- done-live (observations as quoted text, model-stated uncertainty verbatim,
  token usage as reported, Baseten run/request identity, timestamp, plus the
  standing disclosure that the provider samples ≤96 frames and ignores audio);
- proposal (optional second explicit click; constrained triple rendered as
  escaped read-only text; `UNTRUSTED PROPOSAL — NOT VERIFIED (BASETEN)`);
- refused (typed reason: no permit/session, hash mismatch, over-limit file,
  quota spent, companion unreachable, invalid Baseten response);
- quota-spent (terminal for the record; points at the owner decision for more).

Prohibited: any VERIFIED/trusted chip in Zone L; merging live rows into the
historical evidence tables; presenting Baseten-hosted Muse Spark Open as
direct Meta Model API usage or as identical to Muse Spark 1.3 responses;
pre-filling or implying approval; a generic primary button worded to suggest
verification, approval, or deployment.

Accessibility (per `docs/ACCESSIBILITY.md` web baseline, same bar as PR #27):
full keyboard path, visible focus, live-region announcements for
upload/analyzing/done/refused transitions, text verdicts, 200% zoom and
320 px width without page-level horizontal scroll, contrast in the shipped
light theme.

## 6. Authorization and spending

### 6.1 Quota preservation and the new Baseten record

LIVE-C3-01 (`c3-live-meta-001`, `provider: meta`) stays spent and
hard-disabled: no new approval may name it, the E1/E2 run functions keep
refusing it, and this proposal adds no path around those refusals. Any
Baseten call under UI-C3-02 requires a **new** LIVE record with its own
lifetime quota (proposed: 1 analysis + optionally 1 proposal request per
demo), created only by the owner decision in §8 (D1) plus the same
activation→pin→approval sequence that gated LIVE-C3-01. Quota accounting is
per record and per provider: Meta-spent and Baseten balances never mix.

### 6.2 Per-request authorization

Two independent owner acts per provider request, neither delegable:

1. In the companion terminal: create a single-use permit naming the exact
   file SHA-256 (typed confirmation of hash + byte size, mirroring the
   `SEND ONE META REQUEST` discipline, naming the Baseten run id).
2. In the dashboard: click the explicit Analyze/Propose button for that file
   (with a paired in-memory session).

The click without a permit is refused; a permit without a click does nothing;
a permit never survives its request (success, failure, timeout, and
interruption all spend it); restart voids sessions and permits.

### 6.3 Bounded spending

Fixed endpoint, fixed model `meta-models/muse-spark-open`,
companion-enforced caps (single video part, `max_tokens` fixed per request
type); no retry/fallback (a failed or unclear request ends the attempt — a
new request needs a new permit under the remaining quota). Cost assumptions:
Baseten's listed Model API rates for Muse Spark Open are $1.25 per 1M input
tokens and $4.25 per 1M output tokens (library page, re-verify at
authorization time); video input tokens scale with resolution and sampled
frames, so the per-run cost is estimated, not guaranteed. **Actual billing
stays UNVERIFIED** (token counts are not costs, as recorded for LIVE-C3-01);
which workspace credits are eligible is a pending owner decision (D1), and a
credit balance is never permission to spend.

## 7. Inputs: synthetic-first, strictly bounded

- First iteration: synthetic F01 recordings only (same fixture family as the
  certified set). Real-owner recordings need a separate privacy decision (D5).
- Hard limits (same as the audited shell, inside every provider cap): MP4
  (H.264) only, ≤ 25 MB (≈33 MB base64 < 100 MiB body cap), ≤ 30 s (provider
  max 300 s), real video dimensions, playable; over-limit or unplayable files
  are refused before any permit can name them.
- File-hash binding: the dashboard's local SHA-256, the permit, the uploaded
  bytes (re-hashed by the companion), the encoded request, and the persisted
  evidence must all name the same hash, or the run is refused and staged
  bytes are deleted.
- No caller-controlled provider, model, endpoint, limits, credential,
  repository root, or evidence directory.

## 8. Explicit owner decisions (each recorded before its implementation step)

- **D1 — New Baseten LIVE record + quota + credit eligibility.** Authorize a
  new lifetime quota (proposed: 1 analysis + 1 proposal) under a new run id;
  name which Baseten workspace credits are eligible. LIVE-C3-01 stays spent.
- **D2 — Spend acknowledgment.** Actual billing is unverified; per-run cost is
  estimated from listed rates and uncapped video-token scaling; no cap beyond
  the quota + token caps in §6.3.
- **D3 — Synthetic scope.** First iteration restricted to synthetic F01
  recordings; which fixture set.
- **D4 — Companion trust.** Owner starts the localhost companion, injects
  `BASETEN_API_KEY` into its environment only, performs the terminal pairing
  and per-request confirmations, and owns key rotation/revocation.
- **D5 — Upload privacy.** Owner MP4 bytes are transmitted to Baseten inside
  the authorized request (no separate remote file is created, so there is no
  remote file to delete; local staged bytes are always deleted). Provider-side
  retention is governed by Baseten policy — owner to confirm before any real
  recording is sent; synthetic-only until then.
- **D6 — Demo recording.** Consent to show the live run (including run id,
  usage, and any error) in the hackathon video.
- **D7 — Sequencing.** Proposal review → implementation task → implementation
  PR → independent audit → merge decision; activation/pin/approval per §6.1.

Recorded here: **Baseten is provider-selected for UI-C3-02 design.**
Still pending: execution, spend, credential access (D1, D2, D4), and all
merge/deploy decisions. Standing NOT-APPROVED (unchanged): executing,
staging, or verifying any model-generated CSS; changing verifier, oracle,
grammar, or gates; Modal; HOST-C3-01; merging or deploying.

## 9. Testing plan

Test objective (per `docs/TESTING.md`): **prove that no Baseten request,
spend, credential movement, or trusted verdict can occur without both owner
acts (§6.2), and that every rendered live value is quoted, run-identified,
and never VERIFIED.**

Targeted checks (smallest evidence first; owner-run live legs never in CI):

- **L-STAT-1 (static, CI):** React source contains no credential, endpoint,
  approval, quota, or session-secret string (extend the T-ABSENT-1 scanner to
  the new zone + companion-client module); companion contains no fallback
  provider/model/endpoint and emits no CORS headers.
- **L-AUTH-1 (unit, mocked transport):** click-equivalent without a
  session+permit is refused; permit for hash A with bytes of hash B is
  refused; used/expired permit is refused; second request on spent quota is
  refused with the spent terminal state.
- **L-ONE-1 (unit, mocked transport):** transport double counts provider calls
  across failure/timeout/interruption drills — exactly one per permit, zero
  without.
- **L-BIND-1 (integration):** tampered upload bytes (hash mismatch) refused
  and staged bytes deleted; oversize/over-duration/unplayable files refused
  before permit creation; base64 body over the cap refused before send.
- **L-SAN-1 (unit):** adversarial model text (markup, event handlers,
  `javascript:` URLs, style directives, prototype keys, oversized strings)
  renders as inert text; proposal triples outside the closed grammar rejected;
  non-conforming responses (wrong shape, model mismatch, missing usage)
  refused, never rendered.
- **L-SEP-1 (browser, fixtures):** live and historical views render separate
  provenance (`provider: baseten` vs `provider: meta` records never share a
  row or run id); no VERIFIED chip in Zone L under any fixture; forged
  `VERIFIED`/`certified` model text renders as quoted claims only; no UI text
  presents Muse Spark Open as Meta Model API usage.
- **L-NET-1 (browser, trap):** full walkthrough records zero non-loopback
  requests from the dashboard; the companion's only egress is the exact
  endpoint `https://inference.baseten.co/v1/chat/completions` inside an
  authorized request (proven by the companion request log, owner-run only).
- **L-CSRF-1 (adversarial, owner-run + review):** cross-origin POST/GET from a
  hostile page refused; null Origin refused for live APIs; rebinding Host
  refused; missing/stale `X-Live-Session` refused; permit replay after
  companion restart refused; second concurrent live request refused; oversize
  body refused — all with typed errors and zero provider egress.
- **L-LIMIT-1 (integration):** idle/total ceilings enforced; interruption
  spends the permit and renders nothing.
- **L-A11Y-1 (browser):** keyboard-only path through Zone L states; live-region
  announcements observed; 200% zoom + 320 px without horizontal scroll.
- **Contract validation (mocked fixtures, CI):** the `video_url` data-URL
  request shape, usage/error response shapes, and refusal mapping pinned
  against fixtures before any live acceptance.
- **Real-browser acceptance (owner-run, NOT CI):** genuine synthetic MP4
  selection, permitted analysis, actual Baseten response rendered with run
  id/usage; revocation drill (revoke permit mid-upload → refusal + cleanup).
- **Adversarial security tests (owner-run + review):** `BASETEN_API_KEY`
  discipline (env-only: no agent read, no print, no persistence, no wire);
  companion binds 127.0.0.1 only; raw provider text and video bytes/base64
  never persisted (evidence allow-list audit); provider-side retention
  confirmed per D5.

Stop rule: objective met → STOP expanding automated tests → manual QA →
PR + required CI → independent review (per `docs/TESTING.md`).

## 10. Consequences for existing gates

None. This proposal changes no code, no quota, no activation, no pin, no
oracle/verifier/grammar, no trust roots, no CI gates. PR #26 and PR #27 stay
unmerged and unmodified; the stored Meta proposal stays unread, unloaded,
unstaged, unexecuted. Any future implementation PR is stacked separately and
must pass the same independent audit bar before any merge decision.

## 11. Acceptance (of this proposal PR)

1. Bounded scope above is complete and self-consistent; every MUST in §1 has a
   mechanism in §3/§5 and a test in §9; every MUST-NOT in §2.2 has a control
   and a test. Historical Meta runs and new Baseten runs are distinguished in
   labels, records, diagram, costs, quotas, and decisions.
2. `pnpm lint` green; `git diff --check` clean.
3. Draft PR updated against `main`; required hosted CI green.
4. Independent re-audit, then STOP. No implementation, no live call.
