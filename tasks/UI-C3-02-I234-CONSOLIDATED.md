# UI-C3-02-I234: consolidated offline companion + Zone L + mock adapter

Bounded implementation contract for the single consolidated I2/I3/I4
execution. Sources of truth: `docs/UI-C3-02-LIVE-ANALYSIS-MODE.md` (as merged
in PR #28), this file, and the integration PR notes. D1–D7 and D9 are pending;
D8 is design-only. No live inference path exists in this slice.

## Reuse with provenance (read-only; no branch is modified or merged)

- PR #26 design @ `1655bbb80b2a23d4aebfea871e89e8f63e7dfd4a` (OPEN, unmerged):
  referenced for tokens/components only; no files copied.
- PR #27 functional dashboard @ `231755f180c5559d3674731cee2ba5709d3674731cee2ba5709d3ff08c`
  (OPEN, unmerged): `dashboard/`, `packages/dashboard-import/`,
  `tests/unit/dashboard-*.test.ts`, `tests/integration/dashboard-browser.test.ts`
  copied verbatim into the integration branch.
- PR #29 I1 config: MERGED to `main` as `821171a`; the integration branch
  merged `origin/main` forward (no rebase/force) and the I1 files
  (`packages/live-analysis/src/config.ts`,
  `tasks/UI-C3-02-I1-OFFLINE-CONFIG.md`,
  `tests/unit/live-analysis-config.test.ts`) are byte-identical with the merge.
- PR #30 I2 security helpers @ `3a0e1a8aee8d315bc4709b38e436960464ed644b`
  (OPEN, unmerged): `local-session.ts`, `mock-permits.ts`, `request-guard.ts`
  (+ `'/api/cancel'` route, same policy class, documented below),
  `tasks/UI-C3-02-I2-LOCAL-SECURITY.md`, `tests/unit/live-analysis-security.test.ts`,
  `tests/security/live-analysis-offline.test.ts` copied verbatim.

## New implementation (this slice)

- `packages/live-analysis/src/{server,uploads,mock-transport,baseten-request,responses}.ts`
  + `scripts/c3-live-analysis.ts`: localhost companion, mock transport only.
- `dashboard/src/zones/LiveZone.tsx` wired into `App.tsx` (historical zones untouched).
- Tests: `live-analysis-{companion,adapter}.test.ts` (unit, socket-free),
  `live-companion-http.test.ts` + `live-zone-browser.test.ts` (integration/browser,
  loopback only); one reviewed extension of `tests/security/live01b-prep-boundary.test.ts`
  (script inventory) and of `tests/security/live-analysis-offline.test.ts` (new modules).

## Deliberate deviations from the approved architecture (narrowings, not weakenings)

1. The `'/api/cancel'` POST joins the request-guard endpoint allowlist under the
   same mutating-POST policy (exact Origin, session, JSON cap); existing I2 refusal
   coverage is unaffected and green. A special-case bypass was rejected.
2. Shipped Zone L names no provider: the title is "Live Analysis via the localhost
   companion". Nothing in this slice touches Baseten, so provider naming would add
   only audit surface; T-ABSENT-1 stays green exactly as audited. Provider naming
   arrives with the D9-authorized live path.
3. The CLI does not require a TTY for pairing/permit commands (tests and owners may
   pipe stdin); codes stay single-use, TTL-bound, rate-limited, and localhost-only.
4. The demo quota (`--analyses/--proposals`, in-memory, reset on restart) is a demo
   flow limiter, not durable spend control.

## Forbidden (unchanged)

No `.env.local` inspection, no API key read, no Baseten/Meta/OpenRouter request,
no authenticated model listing, no billable inference, no quota/activation-pin
changes, no historical real-proposal execution, no verifier/oracle/trust-root
changes, no retry/fallback, no raw video/base64/model-response persistence,
no merge or deployment.

## GPT-6 remediation of PR #31 (same branch, no history rewrite)

Independent audit verdict FIX REQUIRED (4 MAJOR + 2 MINOR). Remediation:

- MAJOR-1: `/api/analyze|propose` accept promptly with a `runId` (state
  `analyzing`) and settle in the background; the UI tracks the active runId
  and polls in flight, so Cancel reaches the in-flight run (proven by
  Chromium click-while-processing and HTTP cancel tests).
- MAJOR-2: one single-flight slot for upload/analyze/propose acquired
  synchronously before the first await; revoke bumps an epoch so a stale
  settling run can never release a newer run's slot; deterministic
  two-permit, upload-during-analyze, and revoke/re-pair race tests.
- MAJOR-3: approved permit-before-upload sequence restored — the browser
  hashes locally, the owner issues a hash/byte/action-bound permit, the
  companion peeks eligibility (new read-only `peekEligiblePermit`, no
  consumption) before staging or decoding anything; consumption stays at the
  analyze/propose attempt (single-use preserved). Unpermitted uploads get
  NO_PERMIT with zero staged bytes and zero trusted-boundary decode work.
- MAJOR-4: branch reconciled with `main@821171a` via a forward merge (no
  rebase, force-push, or changes to PRs #26/#27/#29/#30); STATUS/HANDOFFS
  conflicts resolved keeping both histories; I1 files kept as merged.
- MINOR-1: SIGINT/SIGTERM handlers + eager close, SIGKILL-crash stale sweep
  (`sweepStaleStagingDirs`, unit-tested; SIGTERM-with-staged-clip integration
  test), typed 413 BAD_BODY_SIZE on drained oversize bodies, JSON-null guard
  on `/api/pair`, `uploadId` bound to the staged upload.
- MINOR-2: misleading test names corrected; Zone L browser coverage adds
  Cancel click, 320px reflow, 200% text, keyboard-only pairing, and quota
  exhaustion; STATUS stale refs fixed (#29/#24 merged).

## Acceptance

Typecheck, lint, unit (except 16 pre-existing sandbox listen-ban failures also
failing on pristine `origin/main`), security 139/139, HTTP integration, Zone L
browser QA with screenshots, #27 browser regression, hosted CI green, ONE
independent GPT-6 audit, then STOP. No self-certification.
