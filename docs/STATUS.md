# Project Status

> Operational state only. Historical detail lives in reviewed PRs and handoffs.

## Project

- **Name:** ProofPilot AI — Meta Global AI Developer Hackathon (Push the Frontier)
- **Current phase:** PP-META-I1-C2A — genuine F01 video + video intake/consent + mocked Muse Spark video integration
- **Status:** Implemented locally; **awaiting independent exact-head audit.** Not pushed; no Draft PR (owner authorization required).
- **Primary branch:** `main` at C1 squash-merge `c55795eab20466d917847c964ace377b57d4edc6`
- **Working branch:** `phase/pp-meta-i1-c2a` (local commits ahead of `origin/phase/pp-meta-i1-c2a` at `7066ae4`)
- **Implementation head:** `444f7d9037ad2cf5d033a0c669f92846ee06b677` (docs/handoff commit follows; the branch head is authoritative)
- **Active task:** `tasks/PP-META-I1-C2A.md`
- **Active handoff:** PP-META-I1-C2A-C1
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

## Verification state (local, at `444f7d9`)

| Check | Result |
|---|---|
| Frozen install, lint, typecheck, profile validator, `git diff --check`, tracked-`.env` guard | PASS |
| Unit 88/88, security 27/27 | PASS |
| Integration 9/9 (real ffmpeg media + C1 dirty-evidence runner + Chromium) | PASS (local only; needs Chromium and ffmpeg; not in CI) |
| `pnpm f01:baseline` (C1 regression) | PASS: REPRODUCED, desktop PASS, certified exact-SHA |
| `pnpm test:e2e:f01` | exit 1 by design (the deliberate mobile failure) |
| Guard mutations | 17/17 killed |
| Hosted CI | NOT RUN (branch not pushed) |
| Independent audit | PENDING |
| Docker/ARM64 container isolation | NOT VERIFIED — agent environment lacks Docker access; blocks any AI-generated patch execution |
| Baseten | NOT TESTED |

## Unverified assumptions (must be confirmed by the first authorized live smoke)

- Responses `text.format` wrapper (`type/name/schema/strict`) and the response `output[].content[].output_text` shape are OpenAI-compatible assumptions; Meta's docs do not show them.
- Only H.264 MP4 is accepted (fail-safe). Whether Meta also accepts other codecs is unknown.
- Files API behaviour under real upload (latency, `expires_after` acceptance, delete semantics) is documented but unexercised.

## Next actions

1. GPT-6 independent exact-head audit using handoff `PP-META-I1-C2A-C1`.
2. Owner decisions: (a) authorize push + Draft PR for C2A; (b) approve, change or reject the product screen-map proposal; (c) separately authorize ONE capped live smoke (uploads the synthetic mobile clip to Meta, one `muse-spark-1.3` call, file deleted after) to settle T04 and the assumptions above; (d) confirm host Docker.
3. Do not start C3 (patch proposal) until the sandbox is independently verified.

## Known limitations

- ffmpeg/ffprobe must be on PATH for real media validation and recording (`TOOL_UNAVAILABLE` otherwise). CI does not run the real-media suite.
- The tap ring in the recording is a recorder-injected visual aid (documented in `recording.json`), not part of the application.
- No container sandbox yet. Real model/video behaviour is unverified.
