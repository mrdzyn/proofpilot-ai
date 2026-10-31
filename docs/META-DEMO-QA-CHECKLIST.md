# META-DEMO-01 — demo QA checklist (every video claim against evidence)

> Review the finished video end to end with this checklist before upload. Each row names
> the claim as spoken or captioned, the only acceptable evidence, and the failure mode.
> A single unchecked row blocks upload. Portal video duration/file requirements remain
> **PENDING** until verified in the signed-in event portal.

## 1. Claim-to-evidence mapping

| # | Video claim | Acceptable evidence (exact path / value) | Fail if |
|---|---|---|---|
| 1 | Mobile defect: tap intercepted, cart stays 0 | `.proofpilot/recordings/f01-20261027T122211Z-df375a/` mobile clip, SHA-256 `e9df68b1…eafdf` (`docs/STATUS.md` §C1) | Clip shown without `SYNTHETIC FIXTURE` caption |
| 2 | Desktop control passes | Same set, desktop clip, SHA-256 `e565e8bf…1976d` | Implied to be a real shopper or real store |
| 3 | Muse Spark's second analysis run returned a symptom hypothesis (attempt 2 of 3 total) | Run 002 summary: `VIDEO_ANALYZED`, `model-hypothesis` Symptom, usage 2773/1129/665/3902 (`docs/STATUS.md` §C2B) | Called a verdict, a diagnosis of root cause, or proof of a fix; presented as the only Meta attempt |
| 4 | One earlier analysis run failed | Run 001 `PARTIAL` (`ANALYSIS_FAILED` / `RESPONSE_NOT_COMPLETED`) | Omitted (survivorship bias) |
| 5 | Baseline REPRODUCED, exact-SHA certified | `pnpm f01:baseline` exit `0` with the four runbook key lines (`docs/QA-01-RUNBOOK.md` §2) | `test:e2e:f01` nonzero exit shown as a failure, or wrapper/oracle exits confused |
| 6 | The oracle is independent of the model | `verifier/` trust root; model-output-never-judges boundary (`docs/SECURITY.md`, STATUS gates) | Any suggestion the model checked its own work |
| 7 | The third Meta attempt — one fix-proposal request — returned a host-validated but unverified proposal | Report §2 values: 1 adjustment, 1,300 tokens, response id `7cb1e5e2…`, input SHA `4e1466e8…f558` (`docs/LIVE-C3-01-EXECUTION-REPORT.md`) | Values read from the artifact dir instead of the report; presented as one of the two video analyses |
| 8 | Proposal is NOT verified and has no scoreboard row | Caption `UNTRUSTED PROPOSAL — NOT VERIFIED` on every mention; model value documented only in the execution report | Any `VERIFIED`-adjacent wording near the model proposal, or any implied model scoreboard row |
| 9 | PC-1 VERIFIED 3/3 | `docs/examples/c3-b1-scoreboard.example.json` or fresh `c3-offline-verification` run ending `ALL EXPECTATIONS MET` | Example presented as a fresh run, or replays not all clean passes |
| 10 | PC-1 is hand-authored, distinct from the model value | `provenance: hand-authored-control` vs `provenance: model-hypothesis` | Identity of values presented as evidence for the model |
| 11 | Negatives fail as they should | NC-1/NC-1b/NC-3 `PATCH_FAILED`, NC-6/NC-7 `INCONCLUSIVE`, NC-5 `NOT_REPRODUCED` | Only the passing row shown |
| 12 | Real-artifact execution refused in code | `HARD-DISABLED` refusal, exit `2`, no evidence dir (`docs/QA-01-RUNBOOK.md` §6) | Drill described as a configuration choice rather than a hard gate |
| 13 | No live call on camera; quota spent | `docs/STATUS.md` authorization block; `REVISION_NOT_APPROVED` after PR #18 | Any provider traffic, credential entry, or approval command visible |

## 2. Negative checks (must all hold)

- [ ] No secrets on screen or in audio at any timestamp: API keys, `.env.local`,
  approval/reservation records, account or request identifiers beyond the two
  published response/upload IDs, private `$HOME` paths.
- [ ] No private filesystem paths: temp staging roots, user directory names, machine
  hostnames are redacted or out of frame.
- [ ] No simulated result represented as an actual result: fallback clips, the committed
  example scoreboard and quoted runbook lines are labelled as such when shown.
- [ ] No cost figure stated or implied: token counts are shown as counts only; actual
  billing is unverified (`docs/LIVE-C3-01-EXECUTION-REPORT.md` §2).
- [ ] No accidental provider call: the recording environment performed zero provider
  requests (preflight-style `fetch` trap clean by construction — nothing on camera
  contacts a provider); no real-artifact execution (the refusal drill creates nothing).
- [ ] No generated screenshot, test output, model-provenance claim or submission-rule
  claim is fabricated: every number above matches the cited committed source byte for
  byte; portal rules stay marked PENDING.

## 3. Caption audit (pause on each caption)

- [ ] `REPRODUCED` appears only with the F01 baseline oracle result.
- [ ] `VERIFIED` appears only with the hand-authored PC-1 control.
- [ ] `UNTRUSTED PROPOSAL — NOT VERIFIED` (or `UNTRUSTED HYPOTHESIS`) appears with every
  Muse Spark output mention.
- [ ] `SYNTHETIC FIXTURE` appears with every store, clip or scoreboard shot.
- [ ] No caption contradicts the narration; fallback substitutions are spoken aloud.

## 4. Sign-off

- [ ] Reviewer name and date recorded: ____________________
- [ ] Video file hash recorded (SHA-256): ____________________
- [ ] Upload URL recorded: ____________________ (`PLACEHOLDER` until uploaded)
- [ ] This checklist and the prep checklist (`docs/META-DEMO-CHECKLIST.md`) both fully
  checked before the portal submission step in `docs/META-HACKATHON-SUBMISSION.md` §13.
