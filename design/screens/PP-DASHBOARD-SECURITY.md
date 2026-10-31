# PP-DASHBOARD — security boundaries and acceptance tests (UI-C3-01A, Phase A)

## 1. Boundaries (hold in the shell exactly as specified; verified by the tests in §3)

1. **No network.** Zero requests of any kind. No backend, hosted deployment, auth
   service, analytics, external CDN font/image/script, or provider integration.
2. **No hidden-path access.** The shell never enumerates, opens, or derives paths
   under `.proofpilot/`, credentials, approvals, or reservations. Owner files arrive
   only through the browser file picker.
3. **No artifact access.** The stored model proposal (`c3-live-meta-001`) is not
   readable, loadable, or renderable from the dashboard; zone 3 shows only the
   documented values transcribed from `docs/LIVE-C3-01-EXECUTION-REPORT.md`.
4. **No verdict authority.** The dashboard renders verdicts it is given; it computes
   none, upgrades none, and cannot display a model `VERIFIED` row (no such shape
   exists in the import allowlist).
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

- **T-IMPORT-1..N:** each allowlisted shape accepted; each refusal battery case
  (unknown key, duplicate key, oversize, bad provenance, model VERIFIED row,
  non-UTF-8, wrong MP4/codec/duration/size) refused with the exact typed error and
  the zone's prior content unchanged.
- **T-XSS-1:** injection battery (markup, event handlers, `javascript:` URLs, style
  directives, prototype keys) in every imported string renders as inert text; DOM
  contains no injected elements/attributes afterward.
- **T-CSS-1:** the documented adjustment appears only as text nodes; no `<style>`
  element or `style` attribute exists in the document after render.
- **T-NET-1:** full import/render/error walkthrough under a network trap records
  zero requests.
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
