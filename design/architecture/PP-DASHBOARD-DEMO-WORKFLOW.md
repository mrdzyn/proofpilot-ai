# PP-DASHBOARD — local startup and demonstration workflow (UI-C3-01A, Phase A)

> Proposed workflow for the shell phase. Exact commands depend on the stack decision
> (`design/architecture/PP-DASHBOARD-COMPONENT-STRUCTURE.md` §2); the invariants below
> hold for either option.

## 1. Startup (owner's machine, loopback only)

1. Clean checkout of the approved dashboard commit; `git status` clean.
2. Install with the frozen lockfile (Option A) or no install (Option B).
3. Serve on loopback only (Vite dev with `--host 127.0.0.1`, or any static server
   bound to loopback). No LAN exposure, no tunnel, no hosted URL.
4. Open `http://127.0.0.1:<port>` in a desktop and a mobile-width browser window.

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

- Page loaded with devtools network panel recording: zero requests during the full
  walkthrough (T-NET-1 invariant demonstrated).
- No secrets, paths, or private directories visible; history values match the cited
  sources byte for byte (T-TRUTH-1).
- Keyboard-only dry run completed; focus visible throughout; live regions announce.

## 4. Out of scope for the demo

Recording over the network, sharing the page URL beyond loopback, importing
anything from `.proofpilot/`, or executing any verification run from the dashboard.
