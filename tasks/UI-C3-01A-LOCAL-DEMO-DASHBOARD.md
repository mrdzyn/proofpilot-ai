# UI-C3-01A — Local Demo Dashboard (design phase; shell NOT authorized)

- **Status:** DESIGN (Phase A). Human visual approval: PENDING. No shell, wiring, or
  dependency installation is authorized by this contract.
- **Design-direction revision:** the previous UI-C3-01 contract specified a static HTML
  report (`design/screens/PP-C3-REPORT-CONTRACT.md`). The owner has revised the direction
  to a richer, local-first, single-page React demonstration dashboard. That revision is
  recorded explicitly in `design/screens/PP-DASHBOARD-CONTRACT.md` §0 and as a header
  note in the old report contract — the old contract is retained, not silently replaced.
- **Follows:** `AGENTS.md` design-first sequence, `docs/DESIGN-SYSTEM.md`,
  `docs/ACCESSIBILITY.md` (WCAG 2.2 AA), `design/platforms/web.md`.
- **Base:** `main@b841740a95ebd39cabb47fa73ea1329803f79d88`.

## 1. Objective

Produce a reviewable, high-fidelity design for a premium executive-style local dashboard
that presents already-verified ProofPilot history for the hackathon demonstration:
the F01 defect recording, the sanitized Muse Spark analysis, the documented CSS proposal
(labelled UNTRUSTED — NOT VERIFIED), the trusted verification evidence (hand-authored
PC-1 VERIFIED 3/3 plus negatives), and evidence/security disclosures. Restrained
McKinsey/Apple-inspired language: black, white, cyan `#22C6F0`, strong typography,
generous whitespace, clear evidence hierarchy, responsive layouts.

## 2. Scope (Phase A — design only)

In scope:
- This task contract; `design/screens/PP-DASHBOARD-CONTRACT.md` (revision record +
  full contract); `design/screens/PP-DASHBOARD-SCREEN-MAP.md`; high-fidelity static
  mockup `design/mockups/ui-c3-01a-dashboard.html`; tokens
  `design/tokens/pp-dashboard.json`; component inventory
  `design/components/PP-DASHBOARD-COMPONENTS.md`; import/provenance architecture
  `design/architecture/PP-DASHBOARD-DATA-IMPORT.md`; state matrix
  `design/screens/PP-DASHBOARD-STATE-MATRIX.md`; security boundaries + acceptance tests
  `design/screens/PP-DASHBOARD-SECURITY.md`; proposed React structure
  `design/architecture/PP-DASHBOARD-COMPONENT-STRUCTURE.md`; demo workflow
  `design/architecture/PP-DASHBOARD-DEMO-WORKFLOW.md`.
- Revision header in `design/screens/PP-C3-REPORT-CONTRACT.md` (history preserved).
- `docs/STATUS.md` + `docs/HANDOFFS.md` updates; a NEW Draft PR (not PR #25).

Out of scope (explicitly NOT authorized):
- Any shell/component implementation, `dashboard/` workspace, or dependency
  installation (React, Vite, Tailwind or alternatives).
- Any provider, network, backend, hosted deployment, auth, analytics or CDN work.
- Any access to `.proofpilot/` hidden paths, the stored model artifact, enrollment,
  signing, staging or execution.
- Any Run AI / Verify Model Proposal / Approve Patch / Deploy control or workflow.
- Any change to quota, activation, oracle, verifier, trust roots or security gates.
- Merging, publishing, deployment, or residual-risk acceptance.

## 3. Product requirements (dashboard)

1. F01 Recording zone: plays an owner-selected local MP4; shows container/duration/
   dimensions/codec metadata and provenance; never uploads; labels synthetic fixture
   and historical record.
2. Muse Spark Analysis zone: previously reviewed sanitized history only; header
   UNTRUSTED MODEL HYPOTHESIS; distinguishes two video-analysis attempts from the
   later single proposal request.
3. Proposed Correction zone: documented CSS adjustment as escaped read-only text;
   UNTRUSTED — NOT VERIFIED label; no artifact access.
4. Independent Verification zone: certified F01 baseline; hand-authored PC-1
   VERIFIED 3/3; failed/inconclusive negatives; historical examples visually
   distinguished from newly imported real evidence; PC-1's result never transferred.
5. Evidence and Security zone: commit identity, test status, replay counts, available
   hashes, limitations; hard-disabled real proposal explained; read-only inspection
   states labelled.
6. Accessibility: WCAG 2.2 AA, keyboard support, responsive desktop/mobile, visible
   focus, text-based verdicts (never color-only), complete empty/loading/error states.

## 4. Acceptance criteria (design review)

- Every requirement in §3 is visible in the mockup or explicitly deferred with reason.
- All five experience zones keep model-originated content visually and semantically
  separated from trusted evidence; no `VERIFIED` appears near model content.
- The import architecture names the exact allowlisted schemas and refusal behavior.
- The state matrix covers initial/loading/empty/validation-error/system-error/
  disabled for each zone; no happy-path-only design.
- Security doc forbids the four unauthorized controls by name and lists executable
  acceptance tests for the shell phase.
- Stack decision (React+Vite+Tailwind vs simpler alternative) is presented as an
  owner decision with trade-offs, not pre-decided.
- Owner gives explicit visual approval in a reviewable record before any shell work.

## 5. Validation (Phase A)

- `git diff --check`; `pnpm lint` (0 problems); JSON files parse; internal links
  resolve; mockup is self-contained (no external URLs, fonts, or scripts).
- New/edited docs contain no secret-shaped material and no fabricated values: every
  historical value traces to `docs/STATUS.md`, `docs/LIVE-SMOKE.md`,
  `docs/LIVE-C3-01-EXECUTION-REPORT.md`, or `docs/examples/c3-b1-scoreboard.example.json`.
- Required CI green on the Draft PR. No unit/integration tests are added in Phase A
  (executable acceptance tests are specified in `design/screens/PP-DASHBOARD-SECURITY.md`
  for the shell phase, per the design-first sequence).

## 6. Stop conditions

STOP after presenting the design for explicit human visual approval. Do not build the
React shell until the design gate is satisfied. Stop and ask if requirements are
ambiguous, if any step would touch credentials/quotas/gates, or if the mockup cannot
be kept fully local and self-contained.
