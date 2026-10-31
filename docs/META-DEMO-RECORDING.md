# ProofPilot AI — META-DEMO-01 demo recording script (2–3 minutes)

> **Status: DRAFT for owner review.** Anchored to `main@b841740a95ebd39cabb47fa73ea1329803f79d88`
> (PR #24 squash merge). Every claim below traces to reviewed repository evidence; the
> per-claim source is listed in `docs/META-DEMO-QA-CHECKLIST.md`. Nothing here runs a live
> provider call, opens the stored model artifact (`.proofpilot/evidence/proposals/c3-live-meta-001/`),
> or executes model-generated code. Portal video duration/file rules are **PENDING** — this
> 2–3 minute shape is a proposal, not a stated event requirement.

## Recording setup (macOS, do once before Scene 1)

1. Work from a clean checkout of the submitted commit:
   `git checkout b841740a95ebd39cabb47fa73ea1329803f79d88 && git status` must be clean.
2. Turn on Do Not Disturb / Focus; quit or mute chat, mail and notification-heavy apps.
3. Use a fresh Terminal profile: font size 18 pt or larger, window sized to the recording
   region, prompt kept short. Never type or display secrets: no `MODEL_API_KEY`, no
   `.env.local` contents, no approval/reservation files, no account identifiers, no `$HOME`
   private paths (use a generic prompt or redact them in post).
4. Start recording with **Command + Shift + 5** (Screenshot app): select "Record Selected
   Portion", set Options → Microphone to your mic, enable "Show Mouse Clicks". Alternative:
   QuickTime Player → File → New Screen Recording. Export 1080p H.264.
5. Speak every honesty note marked **SAY ALOUD**; keep every on-screen caption in
   `Fixed width` lower thirds exactly as scripted (see caption rules in section 8).

## Storyboard

### Scene 1 — Hook (0:00–0:15)

- **Screen:** title card: "ProofPilot AI — Don't just fix the bug. Prove it's fixed."
- **Narration:** "Every AI coding agent says it fixed the bug. ProofPilot AI makes the fix
  prove itself — by re-testing every candidate in a fresh browser against checks the AI
  can neither see nor change."
- **Action:** none (static card, 5 s) → cut to the fixture store in a browser.
- **Expected result:** viewer understands the claim in one sentence.
- **Fallback:** the same card held 5 s longer; no live action needed.

### Scene 2 — The defect (0:15–0:40)

- **Screen:** play the certified mobile recording
  (`f01-mobile-defect.mp4`, 390×844, 10.04 s): two taps land on Add to cart, the cart
  count stays `0`. Then the desktop control (`f01-desktop-control.mp4`, 1280×800, 7.32 s):
  one click, cart becomes `1`.
- **Narration:** "This is our synthetic test store. On mobile, a promo overlay silently
  intercepts the Add to cart tap, so the cart stays empty. On desktop the same tap works.
  **SAY ALOUD:** this store and these clips are synthetic fixtures built for the demo —
  no customer data, no real shop."
- **Caption:** `SYNTHETIC FIXTURE — F01 MOBILE DEFECT (REPRODUCED)`.
- **Evidence paths:** local-only `.proofpilot/recordings/f01-20261027T122211Z-df375a/`
  (gitignored); SHA-256 mobile `e9df68b14c48300818f9ec9407b884413037f29305f17a5da3cc4fac05eeafdf`,
  desktop `e565e8bfe922dd5eb44def64c5f076ab963d9e9156f619196e4f3cce8b71976d`
  (values from `docs/STATUS.md` §C1; recompute with `shasum -a 256` if challenged).
- **Fallback:** if the browser cannot run, show the two SHA-256 lines plus still frames
  described in `recording.json`; narrate the same words.

### Scene 3 — Muse Spark watches the video (0:40–1:05)

- **Screen:** terminal showing a **previously recorded** summary of run `c2b-live-smoke-002`
  (pre-typed text file, NOT a live call): `VIDEO_ANALYZED`, schema-valid `Symptom`
  hypothesis — two Add-to-cart taps (about 3.3 s and 6.4 s), cart count unchanged, no
  feedback — plus the run's own listed uncertainties; usage 2,773 in / 1,129 out
  (665 reasoning) / 3,902 total tokens.
- **Narration:** "We sent that mobile clip to Meta's Muse Spark 1.3 once. It came back
  with a structured description of the symptom — treated strictly as an untrusted
  hypothesis, never as a verdict. One earlier attempt ran out of output tokens and was
  discarded; both run IDs are spent."
- **Caption:** `MODEL HYPOTHESIS — UNTRUSTED, NOT A VERDICT (1 OF 2 RUNS COMPLETED)`.
- **Evidence paths:** local-only `.proofpilot/analysis/c2b-live-smoke-002/analysis.json`
  (gitignored, mode 0600); summarized in `docs/STATUS.md` §C2B.
- **Forbidden on camera:** any `analyze-video --live` invocation, any key, any Files/Responses
  traffic. The quota is spent and the repository is no longer eligible for live attempts.
- **Fallback:** the same pre-typed summary as a static card; the numbers are identical.

### Scene 4 — Trusted reproduction (1:05–1:30)

- **Screen:** terminal, run the offline oracle (no provider, no model):
  `pnpm f01:baseline` (equivalently `node scripts/f01-baseline.ts`).
- **Expected output (key lines, quoted from `docs/QA-01-RUNBOOK.md` §2):**
  `oracle exit code:    1 (non-zero expected: the mobile oracle fails on baseline)`,
  `baseline verdict:    REPRODUCED`, `desktop regression:  PASS`,
  `certified exact-SHA: YES`, exit code `0`. Point at `cartCountAfter 0` with
  `hitTestTarget: promo-overlay` (mobile) and cart `1` (desktop) in the evidence dir.
- **Narration:** "Separately, our trusted test oracle — code the proposing model can
  neither read nor change — reproduces the failure at this exact commit and certifies it.
  The model never judges; deterministic code does."
- **Caption:** `REPRODUCED — TRUSTED ORACLE, EXACT-SHA CERTIFIED`.
- **Evidence paths:** `.proofpilot/runs/f01-baseline-*/baseline-summary.json` (gitignored,
  local); procedure in `docs/QA-01-RUNBOOK.md` §2.
- **Fallback:** if the browser cannot run, show the runbook's quoted key lines and the
  committed procedure; say aloud that the terminal output shown is quoted from the
  runbook, not a fresh run.

### Scene 5 — The model proposal, honestly labelled (1:30–1:55)

- **Screen:** `docs/LIVE-C3-01-EXECUTION-REPORT.md` §2 (the reviewed report — **never**
  the gitignored artifact directory). Highlight: exactly one adjustment,
  `.promo-overlay` / `pointer-events` / `none`; 1,300 tokens total (670 in / 630 out,
  601 reasoning); response id `7cb1e5e2-3d88-42ab-9652-fcab88b690d8`; input 2,756
  characters, SHA-256 `4e1466e8adf1ee58b6c050e70f9720da43ddb254b255d4f754f8696a857af558`.
- **Narration:** "Under a fail-closed, single-use approval chain, Muse Spark returned one
  minimal proposal in our closed grammar. It passed host-side validation — and it stops
  there. **SAY ALOUD:** this proposal is labelled UNTRUSTED, NOT VERIFIED. It has never
  run in a browser, and its value happening to equal our hand-written fix proves nothing
  about the model."
- **Caption:** `UNTRUSTED PROPOSAL — NOT VERIFIED (ONE APPROVED ATTEMPT, QUOTA SPENT)`.
- **Evidence paths:** `docs/LIVE-C3-01-EXECUTION-REPORT.md` (committed); input hash and
  size independently recomputed from certified evidence (§1–§2 of that report).
- **Forbidden on camera:** opening `.proofpilot/evidence/proposals/c3-live-meta-001/`
  (stored-proposal access is NOT APPROVED), any approval/credential/operator command.
- **Fallback:** a static card quoting the four values above with the report path shown.

### Scene 6 — How a fix earns trust (1:55–2:25)

- **Screen:** `docs/examples/c3-b1-scoreboard.example.json` (committed, sanitized):
  baseline `REPRODUCED`; NC-1, NC-1b, NC-3 `PATCH_FAILED`; NC-6, NC-7 `INCONCLUSIVE`
  (injected faults); **PC-1 `VERIFIED` 3/3** (three fresh stages, three distinct nonces,
  oracle exit 0 each); NC-5 `NOT_REPRODUCED`; `modelOrProviderCalls: 0`. Optionally, a
  fresh local run: `node scripts/c3-offline-verification.ts --approved-sha $(git rev-parse HEAD)`
  ending in `scoreboard re-verified from persisted evidence: OK` and
  `result:             ALL EXPECTATIONS MET` (offline; safe to run on camera).
- **Narration:** "This is what trust looks like here. Negative controls fail exactly as
  they should, and a hand-written correct fix passes the unmodified oracle three times
  in three fresh disposable stages. **SAY ALOUD:** that VERIFIED row is our own
  hand-authored control — the model's identical-looking value has its own separate row,
  and it is not verified."
- **Caption:** `VERIFIED 3/3 — HAND-AUTHORED CONTROL PC-1 ONLY`.
- **Evidence paths:** `docs/examples/c3-b1-scoreboard.example.json` (example from local
  run `c3-b1-20261028T084508Z-e27b62` at `bb64b73`); procedure in `docs/QA-01-RUNBOOK.md`
  §§3–5; owner-run QA evidence in `docs/STATUS.md` (F01 REPRODUCED, PC-1 VERIFIED 3/3,
  DID-1 PASS, zero provider calls, against `main@f305da3`).
- **Fallback:** the committed example JSON only, with the PC-1 block highlighted;
  narrate the same words. Never present the example as a fresh run.

### Scene 7 — Guardrails (2:25–2:50)

- **Screen:** terminal, the real-artifact refusal drill (offline, safe — it refuses before
  any file read, creates no evidence, exit `2`):
  `node scripts/c3-b2b-verify-proposal.ts --run-id c3-live-meta-001 --source-sha <40-hex> --source-fixture-tree <40-hex> --source-analysis-id x --verification-sha <40-hex>`
  → `HARD-DISABLED` refusal. Then, optionally, the zero-network preflight:
  `node scripts/c3-proposal-preflight.ts` (deterministic, `providerRequests: 0`).
- **Narration:** "And the guardrails hold in code, not just on paper: asking the verifier
  to touch the stored model proposal is refused before any file is even read, and the
  preflight makes zero provider requests. No live call happens on camera — the lifetime
  quota is spent."
- **Caption:** `REFUSED IN CODE — REAL-ARTIFACT EXECUTION HARD-DISABLED`.
- **Evidence paths:** `docs/QA-01-RUNBOOK.md` §6 (refusal drill); `docs/STATUS.md` open
  gates (quota spent, `REVISION_NOT_APPROVED` after the closure merge).
- **Fallback:** pre-recorded terminal capture of the same refusal; the exit code `2`
  must be visible.

### Scene 8 — Close (2:50–3:00)

- **Screen:** closing card: repository link `https://github.com/mrdzyn/proofpilot-ai`,
  commit `b841740`, and the line "Next: verify the model's proposal — a separately
  approved step."
- **Narration:** "ProofPilot AI: the model proposes, deterministic code decides. Links
  and evidence paths are in the description. Thank you."
- **Caption:** `PROPOSAL OBTAINED — VERIFICATION NEXT (SEPARATELY APPROVED STEP)`.
- **Fallback:** none needed (static card).

## Safe fallback clips (record these first, keep each under 30 s)

1. `fallback-baseline.txt`: full `pnpm f01:baseline` output from a clean checkout.
2. `fallback-scoreboard.txt`: the PC-1 `VERIFIED 3/3` block of
   `docs/examples/c3-b1-scoreboard.example.json` (labelled as the committed example).
3. `fallback-refusal.txt`: the `HARD-DISABLED` refusal with visible exit code `2`.
4. `fallback-cards.png`: the four honesty captions as title cards.
5. If any live terminal misbehaves, cut to the matching fallback and say aloud which
   substitution was made. Never splice a fallback in silently as if it were live.

## Caption and honesty rules (binding on the edit)

- `REPRODUCED` only for the F01 baseline via the trusted oracle at an exact clean SHA.
- `VERIFIED` only for the hand-authored PC-1 control (3/3 fresh replays).
- `UNTRUSTED PROPOSAL — NOT VERIFIED` on every mention of the Muse Spark proposal
  (`c3-live-meta-001`) and on every mention of the video-analysis `Symptom`
  (`UNTRUSTED HYPOTHESIS`).
- `SYNTHETIC FIXTURE` on every shot of the store, the clips, or the scoreboard.
- Never represent a fallback clip, the committed example scoreboard, or quoted runbook
  output as a fresh live run. Never state or imply a cost figure: actual billing is
  unverified. Never claim the identical PC-1/proposal values transfer verification.
