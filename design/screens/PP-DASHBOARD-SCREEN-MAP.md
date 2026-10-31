# PP-DASHBOARD — screen map and flows (UI-C3-01A, Phase A)

- **Status:** PROPOSED with `design/screens/PP-DASHBOARD-CONTRACT.md`. Approval PENDING.
- Single page, five zones, no routing. Entry: owner opens the local page. Exit: close
  the tab. All data arrives via explicit owner file picks or ships as reviewed history.

## 1. Zone inventory

| # | Zone | Purpose | Provenance treatment |
|---|---|---|---|
| 0 | Header | Identity: title, tagline, `main@b841740`, LOCAL ONLY marker | neutral |
| 1 | F01 Recording | Owner-selected MP4 playback + metadata/provenance | synthetic-fixture label |
| 2 | Muse Spark Analysis | Two historical analyses + later proposal pointer | ⚠ UNTRUSTED MODEL HYPOTHESIS |
| 3 | Proposed Correction | Documented CSS adjustment as read-only text | ⚠ UNTRUSTED — NOT VERIFIED |
| 4 | Independent Verification | Baseline + PC-1 + negatives; historical vs imported | trusted-evidence treatment |
| 5 | Evidence & Security | Commit, tests, counts, hashes, limitations, hard-disable | neutral + disclosure |

## 2. Flows

```text
open page → header + zones render in initial/historical state
owner picks MP4 (zone 1) → validate (MP4/H.264/duration/size) → metadata + player
owner picks JSON (zone 4 slot) → allowlist validation → rendered as imported evidence
                                          → refusal on unknown keys/values (typed error)
any validation failure → zone shows error state with reason + recovery, nothing claimed
```

There is no submit, upload, run, approve, or deploy transition anywhere. Importing a
file never changes a verdict: imported rows keep the verdict their file carries, and
model-originated files can never render `VERIFIED` (enforced by the import allowlist,
specified in `design/architecture/PP-DASHBOARD-DATA-IMPORT.md`).

## 3. Responsive behavior

| Width | Behavior |
|---|---|
| Narrow (≤ 640 px) | Single column; zone tables become definition rows; video full-width |
| Medium (641–1023 px) | Single column; metadata/analysis pairs side by side where they fit |
| Wide (≥ 1024 px) | Zones 1, 2, 4 use two columns; tables scroll inside their region only |

No page-level horizontal scroll at 320 CSS px; usable at 400% zoom.

## 4. Relation to other maps

- `PP-PRODUCT-SCREEN-MAP.md` (five-screen product UI): still PROPOSED and cut; the
  dashboard does not implement screens A–E and must not be mistaken for product approval.
- `PP-C3-REPORT-CONTRACT.md` (static report): retained with a revision header; the
  dashboard inherits its honesty rules but is the current demo direction.
