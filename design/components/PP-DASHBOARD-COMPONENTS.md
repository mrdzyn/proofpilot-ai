# PP-DASHBOARD — component inventory (UI-C3-01A, Phase A)

Reusable vocabulary for the dashboard shell, mapped to `design/components/COMPONENT-CATALOG.md`.
New components are dashboard-scoped; shared foundations (tokens, focus treatment,
breakpoints) are reused, not forked. Each entry states purpose, states, content and
accessibility rules per the catalog's component contract.

## 1. ZoneSection

- **Purpose:** one of the five experience zones (Recording, Analysis, Correction,
  Verification, Evidence & Security). Renders the zone head (number, title, provenance
  line) and a responsive body grid.
- **Variants:** `neutral` (zones 0/1/5), `model` (zones 2/3, warning wash), `evidence`
  (zone 4, success wash). Variants differ only in head treatment, never in layout.
- **States:** default; historical-populated; owner-imported (zone 4 slot only).
- **Content rules:** the head always states provenance in words, not color alone.
- **Accessibility:** `<section>` with `aria-labelledby`; heading level 2; reading order
  follows visual order.

## 2. VerdictChip

- **Purpose:** the single allowed status display. Text label plus text glyph, never
  color alone, in restrained monochrome (black text, gray border; red reserved for
  errors): `✔ VERIFIED` · `✖ PATCH_FAILED` · `■ INCONCLUSIVE` · `⛔ HARD-DISABLED` ·
  neutral informational chips.
- **When not to use:** never for model content without the UNTRUSTED qualifier; never
  a bare color dot; never for owner-imported verdicts (use UnverifiedImportChip).
- **States:** default; high-contrast (forced-colors: border + text, no wash reliance).
- **Accessibility:** plain text; no ARIA needed; contrast ≥ 4.5:1 (label) / 3:1 (border).

## 2b. UnverifiedImportChip

- **Purpose:** the only rendering allowed for verdict strings inside owner-imported
  files: `◇ UNVERIFIED IMPORT — FILE-REPORTED VERDICT` in dark cyan (`#0B6E87`),
  followed by the file's verdict quoted as claim text. The trusted VerdictChip never
  appears beside an imported verdict, even when the file asserts hand-authored
  provenance and `VERIFIED`.
- **States:** default only; always paired with the "quoted as a claim, not
  independently re-checked" sentence.
- **Accessibility:** same text-contrast rules as VerdictChip; the banner is a real
  heading-adjacent paragraph, announced with the row.

## 2c. UntrustedMarker

- **Purpose:** the marker for model-origin content: `⚠ UNTRUSTED` (+ qualifier,
  e.g. `MODEL HYPOTHESIS`, `NOT VERIFIED`) in dark cyan (`#0B6E87`). Used in model
  zone heads and beside every model-derived value. Never used for trusted evidence;
  never combined with the trusted chip on the same row.

## 3. EvidenceTable

- **Purpose:** metadata, run records, hashes, limitations. Real `<table>` with
  `<caption>` and `<th scope="row|col">`.
- **States:** populated; empty ("No rows — nothing imported yet"); error (refused
  import named above the table, table unchanged).
- **Responsive:** scrolls inside its own region at narrow widths; the page never
  scrolls horizontally.
- **Content rules:** hashes truncated with full value in `<title>`/adjacent copy only
  from reviewed sources; model strings rendered as text nodes only.

## 4. CodeBlock (read-only)

- **Purpose:** the documented CSS adjustment (zone 3) and quoted refusal text.
- **When not to use:** never for executable code; the dashboard executes nothing.
- **States:** default; horizontal scroll within the block when needed.
- **Accessibility:** `<pre><code>` with an `aria-label` naming the content ("documented
  CSS adjustment, read-only text"); keyboard-scrollable.

## 5. LocalFileField

- **Purpose:** MP4 picker (zone 1) and JSON evidence picker (zone 4). Native
  `<input type="file">` with `accept` hints; validation happens locally before display.
- **States:** initial; validating (polite live region); valid (metadata shown);
  validation error (typed reason + recovery, associated to the field); disabled.
- **Content rules:** shows file name, size, SHA-256 (computed locally), and — for
  uploads that never happen — the sentence "this file never leaves your machine".
- **Accessibility:** real label; error text linked via `aria-describedby`; minimum
  24×24 px target (44×44 on touch layouts).

## 6. VideoPlayer (native)

- **Purpose:** plays the owner-selected MP4. The native `<video controls>` element;
  no custom player chrome in Phase A.
- **States:** empty (placeholder frame + text alternative describing the expected
  content); loaded; unsupported-format error.
- **Accessibility:** `controls` always; text alternative for the clip's expected
  content; captions track supported if the owner file provides one.

## 7. DisclosureNote

- **Purpose:** honesty callouts (limitations footer, per-zone notes, imported-vs-
  historical distinction). Left-accent rule plus text — accent never the only signal
  (the word "Note"/"Limitation" is always present).
- **States:** default only; never dismissible for limitations.

## 8. EmptyState / ErrorState / LoadingState (patterns)

- Reused across zones per `design/screens/PP-DASHBOARD-STATE-MATRIX.md`. Each names
  what happened, what it means for the demo, and the single recovery action (pick a
  different file, keep the historical example, or stop). No dead-end screens.

## Explicitly absent (by design, not omission)

Run AI, Verify Model Proposal, Approve Patch, Deploy — and any generic "primary CTA"
that could be mistaken for them. Empty states offer no action that spends quota,
touches the artifact store, or changes a verdict.
