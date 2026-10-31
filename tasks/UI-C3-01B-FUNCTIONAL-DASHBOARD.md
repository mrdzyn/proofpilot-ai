# UI-C3-01B — Functional Local Dashboard (implementation; local viewer scope only)

- **Status:** APPROVED for implementation (owner: visual approval of UI-C3-01A +
  explicit request for a FUNCTIONAL dashboard, not a static shell; stack React +
  TypeScript + Vite + Tailwind; light-only; no routing/DB/history/external services).
- **Base:** `1655bbb80b2a23d4aebfea871e89e8f63e7dfd4a` (approved UI-C3-01A design HEAD,
  PR #26 unmerged). Stacked Draft PR targets the design branch
  `design/ui-c3-01a-dashboard`. PR #26 is not merged or modified by this slice.
- **Follows:** `tasks/UI-C3-01A-LOCAL-DEMO-DASHBOARD.md` (scope split),
  `design/screens/PP-DASHBOARD-*.md`, `design/architecture/PP-DASHBOARD-*.md`,
  `design/components/PP-DASHBOARD-COMPONENTS.md`, `design/tokens/pp-dashboard.json`,
  `docs/TESTING.md`, `docs/SECURITY.md`.

## 1. Objective

Deliver a working local-only dashboard that plays an owner-picked MP4, renders
reviewed historical Muse Spark evidence, imports real `scoreboard.json` /
`baseline-summary.json` through the exact-key bounded validator into the safe
view-model, and presents verification evidence with correct provenance — with the
specified acceptance tests executed and real-browser QA performed.

## 2. Scope

In scope:
- `packages/dashboard-import/src/` (pure validator + view-model; no DOM, no
  network, no repo production imports) + `tests/unit/dashboard-import.test.ts`
  (T-IMPORT-REAL/FAKE/FORGED-EXAMPLE, bounds/refusal batteries) +
  `tests/unit/dashboard-truth.test.ts` (T-TRUTH byte-for-byte cross-check).
- `dashboard/` Vite+React+TS+Tailwind app (five zones, file pickers, `<video>`,
  WebCrypto SHA-256, playback-suitability checks, text-only rendering, CSP,
  loopback-only serving, light theme, responsive, keyboard support).
- `tests/integration/dashboard-browser.test.ts` (local-only Playwright QA: real
  MP4 playback, valid/invalid/malicious/forged imports, provenance separation,
  no trusted upgrade, zero non-loopback requests, desktop+mobile screenshots,
  no page-level horizontal overflow, keyboard path).
- Root `package.json` scripts (`dashboard:dev/build/preview/typecheck/test:browser`);
  demo-workflow doc with exact commands; STATUS + handoff; stacked Draft PR.

Out of scope (explicitly NOT authorized):
- Any provider/Modal/Baseten call; any `.proofpilot` or stored-artifact access;
  any Run AI / Verify / Approve / Deploy control or workflow.
- Any change to quota, activation, oracle, verifier, trust roots, security gates.
- Merging either PR, publishing, deployment, residual-risk acceptance.
- Modifying PR #26 design files except where the implementation proves the design
  wrong (then surface, do not silently override).

## 3. Acceptance criteria

- All five experience zones work against the approved contracts; every specified
  test (T-IMPORT-*, T-XSS, T-CSS, T-NET, T-TRUTH, T-A11Y, T-ABSENT) is implemented
  and passes; Playwright QA passes locally with screenshots saved (gitignored).
- `pnpm lint`, root `pnpm typecheck`, `pnpm test:unit`, `pnpm test:security` pass;
  dashboard builds with zero warnings treated as errors; required CI green.
- Historical values match sources byte for byte; no fabricated results; no
  simulated successful processing anywhere.

## 4. Stop conditions

STOP after the stacked Draft PR is green and reported. Do not merge either PR.
Stop and ask if a boundary cannot hold, if the stack choice proves unworkable, or
if any step would touch credentials/quotas/gates/artifact paths.
