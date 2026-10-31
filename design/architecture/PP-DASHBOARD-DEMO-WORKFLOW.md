# PP-DASHBOARD — local startup and demonstration workflow (UI-C3-01B, implemented)

> Stack decided per owner preference: React + TypeScript + Vite + Tailwind
> (light theme only, no routing, no database, no persisted history, no external
> services). Commands below are exact; run from the repository root.

## 1. Startup (owner's machine, loopback only)

1. Clean checkout of the approved dashboard commit; `git status` clean.
2. `pnpm install --frozen-lockfile` (root) and `pnpm --dir dashboard install`
   (dashboard dependencies; committed `dashboard/pnpm-lock.yaml`).
3. `pnpm dashboard:dev`, then open http://127.0.0.1:5173 in a desktop and a
   mobile-width browser window. `pnpm dashboard:build` + `pnpm dashboard:preview`
   serves the production build at http://127.0.0.1:4174; `dashboard/dist/` also
   opens over `file://` (literally zero requests). No LAN exposure, no tunnel,
   no hosted URL.
4. First run needs Chromium for the optional local browser QA only:
   `pnpm exec playwright install chromium` (the dashboard itself needs no browser
   tooling to serve).

## 2. Demonstration walkthrough (mirrors `docs/META-DEMO-RECORDING.md`, live page)

1. Header: read the LOCAL ONLY marker and commit identity aloud.
2. Zone 1: pick the local mobile MP4 via the file picker; show metadata; state that
   the file never leaves the machine. (Fallback: pre-recorded clip.)
3. Zone 2: read the two historical analyses and the later-proposal pointer; say
   "untrusted hypothesis" aloud.
4. Zone 3: show the read-only CSS text; say "UNTRUSTED — NOT VERIFIED" aloud.
5. Zone 4: show baseline + PC-1 + negatives; optionally import a sanitized JSON file
   to demonstrate the allowlist (valid file renders tagged "imported evidence"; an
   invalid file is refused with the typed error on camera).
6. Zone 5: read the hard-disable row and limitations aloud; close with the
   "proposal obtained, verification next" line.

## 3. Pre-demo checks

- Page loaded with devtools network panel recording: zero requests to non-loopback
  origins during the full walkthrough (T-NET-1 invariant demonstrated); only
  loopback document/asset loads (and dev HMR) appear.
- No secrets, paths, or private directories visible; history values match the cited
  sources byte for byte (`tests/unit/dashboard-truth.test.ts`, T-TRUTH).
- Keyboard-only dry run completed; focus visible throughout; live regions announce.

## 4. Out of scope for the demo

Recording over the network, sharing the page URL beyond loopback, importing
anything from `.proofpilot/`, or executing any verification run from the dashboard.
