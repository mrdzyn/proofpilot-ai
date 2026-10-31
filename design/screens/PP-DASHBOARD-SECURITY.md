# PP-DASHBOARD — security boundaries and acceptance tests (UI-C3-01A, Phase A)

## 1. Boundaries (hold in the shell exactly as specified; verified by the tests in §3)

1. **Loopback-only origin; zero external traffic.** No request to any non-loopback
   origin — no provider, backend, hosted deployment, auth service, analytics,
   external font/image/script, or CDN — in dev, in the built artifact, and during
   import/validation. Document and asset loads from `http://127.0.0.1:<port>` or
   `http://localhost:<port>` (plus the dev HMR socket) are the only permitted
   traffic; a self-contained `file://` build is the literally-zero-request
   distribution option.
2. **No hidden-path access.** The shell never enumerates, opens, or derives paths
   under `.proofpilot/`, credentials, approvals, or reservations. Owner files arrive
   only through the browser file picker.
3. **No artifact access.** The stored model proposal (`c3-live-meta-001`) is not
   readable, loadable, or renderable from the dashboard; zone 3 shows only the
   documented values transcribed from `docs/LIVE-C3-01-EXECUTION-REPORT.md`.
4. **No verdict authority.** The dashboard renders verdicts it is given; it computes
   none and upgrades none. Imported `VERIFIED` strings render only as quoted claims
   under the `UNVERIFIED IMPORT — FILE-REPORTED VERDICT` banner with the trusted
   chip withheld — syntactic validity never authenticates evidence.
5. **No execution surface.** Model-derived CSS is text only; no HTML injection, no
   dynamic CSS, no command execution, no arbitrary file paths in the DOM.
6. **No forbidden controls.** Run AI, Verify Model Proposal, Approve Patch, and
   Deploy do not exist in any state. No generic primary button may be styled or
   worded in a way that implies them.
7. **No gate changes.** Quota, activation, oracle, verifier, trust roots, and
   security gates are untouched: the shell imports no repository production module
   that can spend, approve, stage, or execute.

## 2. Threats explicitly out of the dashboard's protection (disclosed, not solved)

Same-UID local writer residual and unsigned-artifact historical origin (owner
decisions open per `docs/STATUS.md`); OS/container sandboxing (not verified);
supply-chain of the chosen frontend stack (reviewed at the stack decision).

## 3. Acceptance tests (specified here, implemented in the shell phase)

- **T-IMPORT-1..N:** each allowlisted shape accepted against the real schemas
  (§3 of the import architecture: full scoreboard and baseline-summary key sets);
  each refusal battery case (unknown key, duplicate key, oversize, over-depth,
  non-UTF-8, wrong-typed value, bad MP4/duration/size/decodability) refused with
  the exact typed error and the zone's prior content unchanged.
- **T-IMPORT-REAL:** the actual committed scoreboard
  (`docs/examples/c3-b1-scoreboard.example.json`) and a producer-shaped baseline
  fixture (same top-level keys, `{relativePath, sha256, bytes}` artifacts, and
  `WorktreeState` union as emitted by `scripts/f01-baseline.ts`) both pass
  validation. Picked via the file picker, both render as `owner-imported
  evidence` with the UNVERIFIED IMPORT banner — picking the committed example's
  bytes does not reproduce the bundled "committed example" rendering.
- **T-IMPORT-FAKE:** adversarial fake-but-schema-valid imports — a crafted
  `hand-authored-control` + `VERIFIED` row, a forged `certified: true` baseline,
  a duplicate of the historical PC-1 row under a different run id — each renders
  as quoted claim text under the `UNVERIFIED IMPORT — FILE-REPORTED VERDICT`
  banner; the trusted chip never appears and no provenance is upgraded.
- **T-IMPORT-FORGED-EXAMPLE:** a picked JSON carrying `_example` (with and without
  a fake `VERIFIED` row) still projects `sourceTag: "owner-imported evidence"`,
  shows "(file claims to be an example)", and never receives the bundled
  "committed example" rendering or the trusted chip.
- **T-XSS-1:** injection battery (markup, event handlers, `javascript:` URLs, style
  directives, prototype keys) in every imported string renders as inert text; DOM
  contains no injected elements/attributes afterward.
- **T-CSS-1:** no model-derived or file-derived string ever reaches a `<style>`
  element, a `style` attribute, or a preview document; the documented adjustment
  renders only as text nodes. Ordinary author styling of the dashboard itself is
  unaffected by this test.
- **T-NET-1:** full import/render/error walkthrough under a network trap records
  zero requests to non-loopback origins, in dev and in the built artifact; loopback
  document/asset/HMR loads are the only permitted traffic.
- **T-ABSENT-1:** static scan of the shell source finds no Run/Verify/Approve/Deploy
  control, no provider endpoint string, no `.proofpilot` path literal, no credential
  or approval identifier.
- **T-A11Y-1..N:** keyboard-only path through all zones and pickers; visible focus
  everywhere; verdicts announced as text; 200% zoom and 320 px width without
  page-level horizontal scroll; contrast measured in the shipped theme.
- **T-TRUTH-1:** every hardcoded historical value in the shell matches the cited
  source doc byte for byte (automated cross-check at build time).

## 4. Stop rule

If any boundary cannot be held by the chosen stack without an exception, stop and
return the decision to the owner: the dashboard ships with fewer features, never
with a weakened boundary.
