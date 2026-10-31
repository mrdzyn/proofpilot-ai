# PP-DASHBOARD — Local Demo Dashboard design contract (UI-C3-01A, Phase A)

- **Status:** PROPOSED. **Human visual approval: PENDING** (task
  `tasks/UI-C3-01A-LOCAL-DEMO-DASHBOARD.md`). Nothing here authorizes shell
  implementation, dependencies, wiring, merge or deployment.
- **Follows:** `AGENTS.md` design-first sequence, `docs/DESIGN-SYSTEM.md`,
  `docs/ACCESSIBILITY.md` (WCAG 2.2 AA), `design/platforms/web.md`.

## 0. Design-direction revision (explicit, not silent)

The UI-C3-01 contract previously specified a static, script-free HTML report
(`design/screens/PP-C3-REPORT-CONTRACT.md`, approval PENDING, never built). The owner
has revised the direction: a richer, local-first, single-page React demonstration
dashboard for the hackathon demo. This contract supersedes the static-report direction
**for the demo dashboard only**:

- The static-report contract is retained unchanged apart from a revision header; its
  honesty rules (escaped model text, zone separation, `VERIFIED`-only-on-3/3) are
  inherited verbatim by §§3–5 below.
- The five-screen product UI (`design/screens/PP-PRODUCT-SCREEN-MAP.md`) stays
  PROPOSED and cut for the hackathon; this dashboard is a demo surface, not the
  product UI.
- The dashboard adds owner-driven local file import (MP4 + sanitized JSON via the
  browser file picker) and five experience zones. It adds no provider calls, no
  backend, no verdict authority, and none of the four unauthorized controls
  (Run AI, Verify Model Proposal, Approve Patch, Deploy).

## 1. Purpose and user

One local page the owner opens in a browser during (or before) the hackathon demo.
The reader is a judge or reviewer who needs, in under three minutes, to see the F01
defect, what Muse Spark said about it, what the model proposed, and what the trusted
oracle actually observed — with every claim labelled by provenance. No navigation
beyond in-page zones, no forms that transmit anything, no network access at all.

## 2. Design language

Restrained executive style, McKinsey/Apple-inspired: black `#111111`, white `#FFFFFF`,
cyan accent `#22C6F0` used sparingly for provenance markers and key figures (never as
the sole carrier of meaning). Strong typographic hierarchy (system stack, semibold
section titles, tabular numerals for hashes/counts), generous whitespace, hairline
borders, flat surfaces (no glow, no glass, no gradients). Verdict chips pair a text
glyph with a text label: `✔ VERIFIED`, `✖ PATCH_FAILED`, `⚠ UNTRUSTED`, `■ INCONCLUSIVE`.

## 3. Layout (single scrolling page; two columns at ≥ 1024 px inside zones)

```text
┌────────────────────────────────────────────────────────────────┐
│ ProofPilot AI — Local Demo Dashboard        [LOCAL ONLY · v0]  │
│ Don't just fix the bug. Prove it's fixed.                      │
│ main@b841740 · F01 synthetic fixture · historical record       │
├────────────────────────────────────────────────────────────────┤
│ 1. F01 RECORDING                          [SYNTHETIC FIXTURE]  │
│    [video player: owner-selected MP4]  metadata table          │
│    mobile 390×844 defect · desktop 1280×800 control           │
├────────────────────────────────────────────────────────────────┤
│ 2. MUSE SPARK ANALYSIS — ⚠ UNTRUSTED MODEL HYPOTHESIS           │
│    attempt 1 of 2: INCOMPLETE (discarded)                      │
│    attempt 2 of 2: VIDEO_ANALYZED · symptom text · 2773/1129   │
│    ── later, separately approved: one fix-proposal request ──  │
├────────────────────────────────────────────────────────────────┤
│ 3. PROPOSED CORRECTION — ⚠ UNTRUSTED — NOT VERIFIED            │
│    .promo-overlay { pointer-events: none; }  (read-only text)  │
│    1,300 tokens · response 7cb1e5e2… · input SHA 4e1466e8…     │
├────────────────────────────────────────────────────────────────┤
│ 4. INDEPENDENT VERIFICATION — trusted oracle evidence          │
│    baseline REPRODUCED (certified exact-SHA)                    │
│    PC-1 ✔ VERIFIED 3/3 (HAND-AUTHORED) · negatives table      │
│    [historical example | owner-imported evidence slot]          │
├────────────────────────────────────────────────────────────────┤
│ 5. EVIDENCE & SECURITY                                         │
│    commit · test status · replay counts · hashes · limitations │
│    real proposal HARD-DISABLED — explanation + refusal quote   │
├────────────────────────────────────────────────────────────────┤
│ Limitations footer: synthetic fixture; hypothesis ≠ verdict;   │
│ identical values prove nothing; billing unverified             │
└────────────────────────────────────────────────────────────────┘
```

Zones 2–3 (model-originated) and zone 4 (trusted evidence) never share a container,
chip style, or heading color treatment: model zones use the warning treatment, the
evidence zone uses the success/neutral treatment.

## 4. Content rules (inherited + dashboard-specific)

- Every historical value shown is a reviewed value: clip SHAs, run-002 usage
  (2773/1129/665/3902), proposal values (1 adjustment, 1,300 tokens, response id
  `7cb1e5e2-3d88-42ab-9652-fcab88b690d8`, input SHA
  `4e1466e8adf1ee58b6c050e70f9720da43ddb254b255d4f754f8696a857af558`), scoreboard
  rows from `docs/examples/c3-b1-scoreboard.example.json`.
- The dashboard never claims a model scoreboard row exists: zone 4 shows the
  HAND-AUTHORED example; an owner-imported slot is labelled "imported evidence —
  provenance checked against the allowlist", never a verdict upgrade.
- The CSS adjustment is text, never a stylesheet: no `<style>` injection, no
  `style=` application, no preview that executes it.
- "Two analyses, one later proposal": zones 2 and 3 carry attempt counters
  ("analysis 1 of 2", "analysis 2 of 2", "proposal: the third and final attempt").
- No Run AI, Verify Model Proposal, Approve Patch, or Deploy control exists anywhere,
  including the empty states.

## 5. Required states

Per-zone matrix in `design/screens/PP-DASHBOARD-STATE-MATRIX.md`. Minimum: each zone
defines initial (nothing imported), loading (validating import), empty, validation
error (typed reason + recovery), system error, and disabled. Zone 4 additionally
defines historical-example vs owner-imported rendering.

## 6. Accessibility and responsiveness (WCAG 2.2 AA)

Landmarks (`header`, `main`, `section` with headings, `footer`); real `<table>`s with
`<th scope>` and `<caption>`; native `<input type=file>`, `<button>`, `<video controls>`;
skip link; visible focus on all controls; verdicts as text + glyph; polite live regions
for import progress, assertive alert once on refusal/error; `prefers-reduced-motion`
disables transitions; 200% zoom and 320 px width without page-level horizontal scroll;
contrast ≥ 4.5:1 text / 3:1 non-text in the single supported light theme (dark theme
deferred to a later decision, not assumed).

## 7. Tokens

`design/tokens/pp-dashboard.json` (semantic roles + the cyan brand accent). No
hard-coded visual constants in the mockup or future shell; no community kit overrides
the project system.

## 8. Approval gate

The owner approves this contract + screen map + mockup (or requests changes) in a
reviewable record. Until then no `dashboard/` workspace, dependency, shell, wiring,
merge or deployment is authorized.
