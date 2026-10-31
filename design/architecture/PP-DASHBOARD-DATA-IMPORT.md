# PP-DASHBOARD — data provenance and evidence-import architecture (UI-C3-01A, Phase A)

## 1. Provenance classes (the only three the dashboard knows)

| Class | Meaning | Renders where | Can it render VERIFIED? |
|---|---|---|---|
| `historical-record` | Values transcribed from reviewed repo docs at design time | All zones, pre-populated | Only zone 4, PC-1 row (hand-authored) |
| `owner-imported` | Files the owner picks at demo time, passing the allowlist | Zones 1 (MP4) and 4 (JSON slot) | Only if the file itself carries a hand-authored `VERIFIED` row; the dashboard never upgrades a verdict |
| `model-originated` | Any string that came from Muse Spark | Zones 2–3 only, as quoted text | Never, by construction |

## 2. What the dashboard reads (and what it never touches)

Reads: (a) its own bundled historical copy (transcribed at design time, cited to
source docs); (b) owner-picked files via `<input type=file>` — video bytes for local
playback and metadata only; JSON evidence for rendering only.

Never reads: `.proofpilot/` hidden paths (no automatic access, no directory
scanning), credentials, approvals, reservations, raw provider responses, or the
stored model artifact. There is no file-path input: the browser picker returns a
`File` object, never a path, and the dashboard displays names/sizes/hashes, not paths.

## 3. Import allowlist (enforced before any render)

JSON import accepts only these shapes; anything else is refused with a typed error
naming the first violation. Parents unknown to the allowlist fail the whole file.

**Scoreboard import** (subset of the committed example shape):
- Top level: exactly `label`, `approvedSha`, `complete`, `modelOrProviderCalls`,
  `modalCalls`, `baseline`, `candidates`. Unknown top-level key → refuse.
- `label` must equal `HAND-AUTHORED CONTROLS ONLY — NO MODEL INPUT` (historical
  files) or a documented owner-run label; any other label renders as
  owner-imported, never as verified history.
- Each candidate: exactly `id`, `description`, `provenance`, `status`,
  `replaysPassed`, `replaysAttempted`. `provenance` must be one of
  `hand-authored-control`, `fault-injected-control`.
- `status` must be one of `VERIFIED`, `PATCH_FAILED`, `INCONCLUSIVE`,
  `NOT_REPRODUCED`, `ORACLE_PASS`. A `model-hypothesis` provenance, or any
  `VERIFIED` row whose provenance is not `hand-authored-control`, is refused — the
  dashboard cannot display a model VERIFIED row because the allowlist has no shape
  for one.
- All values size-bounded (file ≤ 256 KiB, strings ≤ 4 KiB, arrays ≤ 64 items,
  depth ≤ 4); duplicate JSON keys refused; non-UTF-8 refused.

**Baseline-summary import:** exactly `verdict`, `desktopRegression`, `certified`,
  `approvedSha`, `evidenceFiles[]` (names + sha256 only). `verdict` ∈
  {`REPRODUCED`, `NOT_REPRODUCED`}.

**MP4 import:** container MP4, video codec H.264, duration ≤ 30 s, size ≤ 25 MB,
  decodable first and last frames; SHA-256 computed locally for display. WebM,
  over-long, oversized, corrupt, or non-H.264 files are refused with the specific
  reason and recovery (mirrors the intake rules, reimplemented locally — the intake
  package is not bundled).

## 4. Untrusted-text rendering rules

- Every model-derived or file-derived string is inserted via text nodes
  (`textContent` or framework-escaped interpolation) — never `innerHTML`,
  never as an attribute, URL, class name, or style value.
- The documented CSS adjustment is rendered inside `<pre><code>` as text. It is
  never placed in a `<style>` element, a `style` attribute, or a preview document.
- Hashes, ids, and counts are displayed as truncated text with the full reviewed
  value available as adjacent text, never as links.

## 5. No-network invariant

The shell must make zero network requests: no fetch/XHR/WebSocket, no external
fonts, images, scripts, or stylesheets, no analytics, no update checks. The shell
phase adds a test asserting zero requests under a `fetch`/network trap during import,
render, and error paths. The mockup already holds this (single file, inline CSS,
zero scripts).
