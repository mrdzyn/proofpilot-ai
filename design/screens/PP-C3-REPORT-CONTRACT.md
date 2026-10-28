# PP-C3 Static Report — design contract

- **Status:** PROPOSED. **Human design approval: PENDING** (see `tasks/PP-META-I2-C3.md`, decision UI-C3-01). Nothing here authorizes implementation.
- **Replaces:** the five-screen product UI for the hackathon (`design/screens/PP-PRODUCT-SCREEN-MAP.md` stays proposed and unbuilt).
- **Follows:** `AGENTS.md` design-first sequence, `docs/DESIGN-SYSTEM.md`, `docs/ACCESSIBILITY.md`.

## Purpose and user

One self-contained, read-only HTML page produced after a verification run. The reader is the owner, a judge or a reviewer who needs to see, in under a minute, what the model proposed and what the trusted oracle actually observed. It is not an application: no navigation, no forms, no scripts, no network access.

## Requirements

1. Shows the run identity: run ID, approved Git SHA, fixture (F01), date, and the model ID actually used.
2. Shows the baseline: the trusted oracle's failing result on the original SHA, with the before/after tap screenshots and the observed hit-test target.
3. Shows every candidate as one row: id, source (`model` or `hand-written control`), the adjustments, the status, and the evidence.
4. Keeps two zones visually and semantically separate: **Model proposals (untrusted)** and **Trusted verification evidence**. A proposal never appears inside the evidence zone.
5. Shows the evidence hash list (artifact, SHA-256) and the limitations footer.
6. Never states `VERIFIED` unless the run-level rule in the task contract is met (3/3 fresh replays). A single-run pass is labeled `oracle PASS 1/3`.

## Layout (single column; two columns only at ≥ 1024 px for the table and screenshots)

```text
┌──────────────────────────────────────────────────────────┐
│ ProofPilot AI — verification report                      │
│ Run <id> · SHA <12 hex> · F01 · model <exact id> · date  │
│ RUN STATUS: <text label>   (what it means, one sentence) │
├──────────────────────────────────────────────────────────┤
│ 1. Baseline (trusted oracle, original SHA)               │
│    mobile 390×844: FAIL  · desktop 1280×800: PASS        │
│    [before-tap image] [after-tap image]  hit-test: <t>   │
├──────────────────────────────────────────────────────────┤
│ 2. Model proposals (UNTRUSTED data, shown as text)       │
│    table: id · source · adjustments (selector/prop/val)  │
├──────────────────────────────────────────────────────────┤
│ 3. Trusted verification evidence                         │
│    table: id · status · mobile · desktop · replays · note│
│    expandable-free: all detail visible, no hidden panels │
├──────────────────────────────────────────────────────────┤
│ 4. Evidence hashes   artifact · SHA-256 · bytes          │
├──────────────────────────────────────────────────────────┤
│ Limitations: not a sandbox; F01 and tested conditions    │
│ only; model output is a hypothesis; costs are unverified │
└──────────────────────────────────────────────────────────┘
```

## Required states

| State | Behavior |
|---|---|
| Empty (no candidates) | Section 2 and 3 show one sentence: "No candidate was produced." Run status shown. |
| All candidates failed | Rows listed with `PATCH_FAILED` / `PATCH_REJECTED` / `SECURITY_BLOCKED`; no success styling anywhere. |
| One candidate passed once | Shown as `oracle PASS 1/3`; run status is not `VERIFIED`. |
| Verified | `VERIFIED` only for the 3/3 candidate, with the sentence "verified for fixture F01 under the tested conditions only". |
| Baseline not reproduced | Run status `NOT_REPRODUCED`; section 3 states no candidate can be verified. |
| Inconclusive / error | Status `INCONCLUSIVE` with the reason code; no partial pass shown as success. |
| Loading | Not applicable (static file). |
| Missing screenshot | Visible text "screenshot unavailable" with the expected artifact name. |

## Data and security rules

- All model-derived text is HTML-escaped and rendered as text in `<code>` elements; no model string is ever used as markup, attribute, URL or CSS.
- The page is generated from validated JSON by a template; no inline event handlers and no scripts.
- Images are embedded as `data:` URIs of evidence screenshots already hashed in the bundle. No external fonts, images, scripts or links that load on open.
- A `<meta http-equiv="Content-Security-Policy">` of `default-src 'none'; img-src data:; style-src 'unsafe-inline'` is included.
- No secret, raw provider response, video or file path outside the evidence bundle is shown.

## Accessibility and responsiveness

- Semantic landmarks (`header`, `main`, `section` with headings), real `<table>` elements with `<th scope>`, and a descriptive `<caption>` for each table.
- Status is conveyed by text label plus a symbol, never by color alone; contrast meets WCAG AA for text and non-text indicators.
- Keyboard: no interactive controls are required; links (if any) are visible and focusable.
- Works with browser text zoom to 200% and with `prefers-color-scheme` light and dark; renders without horizontal scrolling at 390 px wide; tables scroll inside their container only if needed.
- Images have meaningful `alt` text describing the tap point and result.

## Tokens

Reuse the semantic tokens in `docs/DESIGN-SYSTEM.md`; do not introduce one-off colors. Any deviation must be recorded here before approval.

## Approval gate

The owner approves this layout (or requests a revised or higher-fidelity mockup) in a reviewable record per the task contract. Until then the report generator is not built, wired or demonstrated.
