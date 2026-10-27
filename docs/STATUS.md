# Project Status

> Operational state only. Historical detail lives in reviewed PRs and handoffs.

## Project

- **Name:** ProofPilot AI — Meta Global AI Developer Hackathon (Push the Frontier)
- **Current phase:** PP-META-I1-C2B complete (docs closure); C3 not started
- **Status:** C2B closed as **T04 completed (agent-reported live result)**. This docs-only branch awaits independent exact-head review. No Meta request of any kind is currently authorized.
- **Primary branch:** protected `main` at `9103d00e1b82f260a41498e7c64201ccd398be15` (C2B-R1 squash merge; PR #4)
- **Working branch:** `docs/pp-meta-i1-c2b-completion` (docs only)
- **Active task:** None (C3 requires a new task contract and owner start)
- **Active handoff:** PP-META-I1-C2B-DOC-1
- **Authorization:** Both single-use live smokes are **spent**. **Not authorized:** any further Meta upload or inference, merge by the agent, deployment, product UI shell, Docker bypass, C3, or AI-generated patch execution.

## Completed milestones

### C1 — merged PR #1

- F01 synthetic defect reproducibly fails real mobile Add-to-cart at 390×844 (promo overlay intercepts; cart remains 0), desktop control passes.
- Trusted Playwright baseline oracle, exact-SHA fail-closed certification, provider configuration with key-scrubbing, and deterministic verdict classification.
- Exact-head independent audit PASS; both required GitHub CI checks PASS; `main` protected.

### C2A — merged PR #2

- **Independent GPT-6 re-audit PASS** at `9eaf1ee11a4db6ddd62f024d32b6302b2879de73`; earlier MAJOR-1 (duplicate run ID could bill twice) and MINOR-2 (premature recording certification) remediated and reviewed.
- Required CI run `40503306350`: Common validation PASS; Stack validation PASS (97/97 unit, 27/27 security, baseline `REPRODUCED`, desktop PASS, exact-SHA certification YES).
- Genuine Chromium mobile/desktop MP4 recording and declared SHA-256s, media validator (signature/codec/duration/full decode), WebM conversion, run+video-hash-bound consent, strict untrusted `Symptom` parser, mock-tested Meta Files upload → Responses `input_file` → DELETE flow, dry-run CLI.
- Real-media/browser integration 11/11 PASS was reported by local implementation agent, **not independently rerun** by GPT-6; local MP4 evidence is gitignored and not accessible to GitHub audit.
- Certified replacement recordings in local `.proofpilot/recordings/f01-20261027T122211Z-df375a/`, source before the squash merge `01da814da136f9ea982624414ec5baf9569f24eb`:
  - Mobile `mobile-defect/f01-mobile-defect.mp4`: SHA-256 `e9df68b14c48300818f9ec9407b884413037f29305f17a5da3cc4fac05eeafdf` (390×844, approx 10.04s).
  - Desktop `desktop-control/f01-desktop-control.mp4`: SHA-256 `e565e8bfe922dd5eb44def64c5f076ab963d9e9156f619196e4f3cce8b71976d` (1280×800, approx 7.32s).
- Model responses are always labeled hypothesis; never a trusted browser verdict. Tap indicator injected by recorder is disclosed; raw recordings are not committed.

## C2B results

### Merged work
- **Workstream A — PR #3 (independent audit PASS):** reference clip authenticity, zero-network dry run, exact-id model discovery, fail-closed Responses lifecycle (`RESPONSE_NOT_COMPLETED` for any non-`completed` status, `error`, `incomplete_details` or refusal), full usage capture, single-use procedure.
- **C2B-R1 — PR #4 (exact-head audit PASS at `47926fb8f9540978361d1837de3ea44d4945c2d9`, squash-merged as `9103d00`):** native video Responses send `reasoning: {effort: 'low'}`; default video cap 1500 → 3072 (shared 4096 ceiling and text path unchanged; invalid cap refused before any upload).

### Live smokes (clip SHA-256 `e9df68b14c48300818f9ec9407b884413037f29305f17a5da3cc4fac05eeafdf`, certified synthetic mobile recording; both run ids are **permanently spent**)

| | `c2b-live-smoke-001` | `c2b-live-smoke-002` |
|---|---|---|
| Settings | 1500 tokens, default reasoning | `reasoning: low`, 3072 tokens |
| Provider status | `incomplete` (`max_output_tokens`) | `completed` |
| Local result | `ANALYSIS_FAILED` / `RESPONSE_NOT_COMPLETED` | `VIDEO_ANALYZED` |
| Usage (in / out / reasoning / total) | 2773 / 1500 / 1113 / 4273 | 2773 / 1129 / 665 / 3902 |
| Latency (total) | about 20.5 s | about 19.7 s (upload 3.0, generation 11.0) |
| Request ids (upload / response) | `df486a8b-18e5-47cf-bc70-e028b238b5f8` / `536fb081-2d11-4010-aa3a-fb510c3626bc` | `44a30289-e276-4645-9ba2-01402b5f4241` / `585e7494-7cdd-44a1-b6ed-44f48a03bb44` |
| Remote file | reported deleted | reported deleted (`file-2512150135928415`) |
| Symptom | none accepted | schema-valid, `provenance: model-hypothesis` |

- **T04: completed**, based on the **agent-reported** run 002. GPT-6's post-execution review (PR #4 comment 6446824225) accepted it as met on that basis but could not access the gitignored artifacts or the Meta account, so provider-side traffic, deletion and validated content were **not independently replayed or provider-confirmed**.
- **Diagnosis (hypothesis only):** the model reported two Add-to-cart taps (about 3.3 s and 6.4 s) with the cart count staying 0 and no feedback, and listed its own uncertainties (page URL not visible; cannot tell from visuals whether taps registered). This is **consistent with F01** but **does not establish the promo overlay as the root cause** and proves no fix. The trusted Playwright baseline, not the model, establishes overlay interception. One successful completion does not show overall reliability, nor whether reduced reasoning, the larger budget, or both made the difference.
- **Cost:** actual account charge is **unverified** and the credit balance was never verified (owner accepted the risk for each run). Any figure in this repository (for example roughly $0.008 for run 002 from published rates) is an **illustrative calculation, not a billed amount and not a guaranteed maximum or cap**. There is no enforceable currency limit.
- **Evidence:** `.proofpilot/analysis/c2b-live-smoke-001/analysis.json` and `.../c2b-live-smoke-002/analysis.json` (gitignored, mode 0600). Both preserved unchanged. No media, secrets or raw response text are in Git.

## Open gates

| Gate | Status |
|---|---|
| C2B (Workstream A, R1, live smokes) | DONE; this docs closure pending review |
| T04 real Muse Spark video analysis | **COMPLETED (agent-reported)** |
| Product five-screen design `design/screens/PP-PRODUCT-SCREEN-MAP.md` | PROPOSED; awaiting owner's higher-fidelity visual approval |
| Isolated Docker/ARM64 patch runner | **NOT VERIFIED; no AI-generated patch may execute** |
| C3 patch proposal (Muse Wonder, proposal only), C4 trusted candidate verification, evidence export, demo/submission | NOT STARTED |
| Baseten | NOT TESTED |

## Next action

Independent exact-head review of this docs-only Draft PR. Then the owner decides when to start C3 (proposal only: no generated patch executes until the sandbox is independently verified). No further live Meta request without a new task and fresh owner authorization.
