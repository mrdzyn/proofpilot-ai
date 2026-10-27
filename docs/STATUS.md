# Project Status

> Operational state only. Historical detail lives in reviewed PRs and handoffs.

## Project

- **Name:** ProofPilot AI — Meta Global AI Developer Hackathon (Push the Frontier)
- **Current phase:** PP-META-I1-C2A — genuine F01 video + video intake/consent + mocked Muse Spark video integration
- **Status:** Draft PR #2 open. First audit (GPT-6, comment 6438633690) returned FIX REQUIRED (MAJOR-1, MINOR-2); remediated at `01da814`; **awaiting independent exact-head re-audit.**
- **Primary branch:** `main` at C1 squash-merge `c55795eab20466d917847c964ace377b57d4edc6`
- **Working branch:** `phase/pp-meta-i1-c2a` (Draft PR #2)
- **Code head:** `01da814da136f9ea982624414ec5baf9569f24eb` (a docs/handoff commit follows; the branch head is authoritative). Audited head was `ff51572`.
- **Active task:** `tasks/PP-META-I1-C2A.md`
- **Active handoff:** PP-META-I1-C2A-R1
- **Owner authority:** C2A implementation authorized 2026-10-27. **No authorization for billable inference, real video upload to Meta, merge, deploy, publishing video assets, C3, or AI-generated patch execution.**

## Evidence labels (kept distinct on purpose)

| Label | State |
|---|---|
| **REAL VIDEO RECORDED** | YES — genuine Chromium recordings of the unmodified F01 fixture, certified exact-SHA at `e68cf31`; local and gitignored |
| **META API MOCK TESTED** | YES — Files upload / Responses native-video / delete contract verified against mocks only |
| **REAL META MODEL NOT TESTED** | Correct. No real generation, no real upload, no billable call was made |

## C2A deliverable state

| Item | State |
|---|---|
| A. Real F01 recording: mobile defect clip + desktop control, MP4, SHA-256, metadata, trace, frames | DONE (`pnpm record:f01`) |
| B. Intake: real signature/size/duration/codec/decode validation, WebM→MP4, safe paths, temp lifecycle | DONE |
| B. Per-run consent bound to run + provider + video SHA-256 | DONE |
| B. Strict `Symptom` schema + uncertainty handling (hypothesis only) | DONE |
| C. Meta Files + Responses (`input_file`, `text.format`) + delete, mock-tested; separate video-upload opt-in | DONE (mock only) |
| Product UI screen-map and mockup proposal | DONE as a proposal (`design/screens/PP-PRODUCT-SCREEN-MAP.md`); **NOT APPROVED; no UI built** |
| T04 real model use | **NOT TESTED** (needs owner authorization) |

## Remediation of audit comment 6438633690

- **MAJOR-1 (duplicate run id reached the billable path): fixed.** `analyze-command` reserves `<outRoot>/<runId>` with an atomic non-recursive `mkdir` before any upload or model call. Existing, crashed or concurrent same-id launches are refused with zero network calls. An unused reservation is released; one that may have reached the network is kept (the id cannot be spent twice). A crashed run leaves its id burned: choose a new `--run-id`.
- **MINOR-2 (recorder could persist `certifiedExactSha: true` for dirty evidence): fixed.** `recording.json` is written only after the post-recording check; `certifiedExactSha` requires clean before AND after, all clips as expected and no failure, and agrees with the exit status. Persisted `source` now has `worktreeBefore`/`worktreeAfter`/`reasons`. Recordings made before this fix carry the old `source.worktree` shape; the new set below replaces them as the reference evidence.
- New recording set (local, gitignored) `.proofpilot/recordings/f01-20261027T122211Z-df375a`, certified exact-SHA at `01da814`: mobile `e9df68b14c48300818f9ec9407b884413037f29305f17a5da3cc4fac05eeafdf` (10.04 s), desktop `e565e8bfe922dd5eb44def64c5f076ab963d9e9156f619196e4f3cce8b71976d` (7.32 s).

## Verification state (local, at `01da814`; earlier figures were at `444f7d9`)

| Check | Result |
|---|---|
| Frozen install, lint, typecheck, profile validator, `git diff --check`, tracked-`.env` guard | PASS |
| Unit 97/97, security 27/27 | PASS |
| Integration 11/11 (real ffmpeg media + C1 dirty-evidence runner + recorder mid-run-change regression + Chromium) | PASS (local only; needs Chromium and ffmpeg; not in CI) |
| `pnpm f01:baseline` (C1 regression) | PASS: REPRODUCED, desktop PASS, certified exact-SHA |
| `pnpm test:e2e:f01` | exit 1 by design (the deliberate mobile failure) |
| Guard mutations | 17/17 original killed; remediation: 5 more killed (no reservation, always-release, certify ignoring `after`, certify ignoring failure; the always-release mutant initially survived and prompted a new test) |
| Hosted CI | `ff51572`: PASS (run 40481552821). Remediation head: see PR #2 |
| Independent audit | Round 1: FIX REQUIRED (remediated). Re-audit PENDING |
| Docker/ARM64 container isolation | NOT VERIFIED — agent environment lacks Docker access; blocks any AI-generated patch execution |
| Baseten | NOT TESTED |

## Unverified assumptions (must be confirmed by the first authorized live smoke)

- Responses `text.format` wrapper (`type/name/schema/strict`) and the response `output[].content[].output_text` shape are OpenAI-compatible assumptions; Meta's docs do not show them.
- Only H.264 MP4 is accepted (fail-safe). Whether Meta also accepts other codecs is unknown.
- Files API behaviour under real upload (latency, `expires_after` acceptance, delete semantics) is documented but unexercised.

## Next actions

1. GPT-6 independent exact-head re-audit using handoff `PP-META-I1-C2A-R1`.
2. Owner decisions: (a) [done: Draft PR #2]; (b) approve, change or reject the product screen-map proposal; (c) separately authorize ONE capped live smoke (uploads the synthetic mobile clip to Meta, one `muse-spark-1.3` call, file deleted after) to settle T04 and the assumptions above; (d) confirm host Docker.
3. Do not start C3 (patch proposal) until the sandbox is independently verified.

## Known limitations

- ffmpeg/ffprobe must be on PATH for real media validation and recording (`TOOL_UNAVAILABLE` otherwise). CI does not run the real-media suite.
- The tap ring in the recording is a recorder-injected visual aid (documented in `recording.json`), not part of the application.
- No container sandbox yet. Real model/video behaviour is unverified.
