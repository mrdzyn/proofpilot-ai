<!-- ProofPilot AI | Evidence-first UI defect verification. -->

<h1 align="center">PROOFPILOT AI</h1>

<p align="center"><strong>Don't just fix the bug. Prove it's fixed.</strong></p>

<p align="center">Reproduce a UI defect. Treat AI output as a hypothesis. Verify changes with a separate, trusted browser oracle.</p>

<p align="center">
  <a href="#the-workflow">See the workflow</a> ·
  <a href="#architecture--trust-boundaries">Explore the architecture</a> ·
  <a href="#evidence-and-current-gates">Inspect the evidence</a> ·
  <a href="#run-the-synthetic-baseline">Run it locally</a>
</p>

<p align="center">
  <a href="https://github.com/mrdzyn/proofpilot-ai/actions/workflows/ci.yml"><img alt="Project Baseline CI" src="https://github.com/mrdzyn/proofpilot-ai/actions/workflows/ci.yml/badge.svg" /></a>
  <img alt="Node.js 24 or later" src="https://img.shields.io/badge/runtime-Node.js_24%2B-111827?style=flat-square" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-22C6F0?style=flat-square" />
  <img alt="Baseten owner-only live path; default off" src="https://img.shields.io/badge/Baseten_live-default--off-FF4757?style=flat-square" />
  <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1F2937?style=flat-square" />
</p>

<p align="center">
  <img src="docs/assets/readme/proofpilot-workflow-loop.gif" width="960" alt="Animated illustration of two separate ProofPilot evidence lanes: an unverified Muse proposal is kept apart from a hand-authored PC-1 control that passes three trusted browser replays. This is an illustration, not a live product recording." />
</p>

<p align="center"><sub>Illustrated workflow, not a product recording or live inference result. <a href="docs/assets/readme/proofpilot-workflow-poster.png">View the static poster</a> · <a href="docs/README-VISUAL-ASSETS.md">Read the visual asset plan</a></sub></p>

---

## The workflow

**AI output can be plausible without being correct. ProofPilot keeps model claims separate from browser evidence.**

### 01 · Observe

Reproduce a synthetic UI defect in Chromium at a known viewport and source revision.

### 02 · Propose

Analyze validated media and parse any proposed CSS through a closed grammar. Treat model output as untrusted data.

### 03 · Verify independently

Run eligible, hand-authored controls through the protected Playwright oracle and inspect attributable evidence.

**F01:** the mobile Add-to-cart tap is intercepted; the desktop control passes. **The historical Muse Spark proposal is accepted but unverified and has never been run through the verifier.** **PC-1:** a separate, hand-authored control passed three trusted replays. Those results are not interchangeable.

> `PROPOSAL_ACCEPTED` is not `VERIFIED`. Only the independent verifier can establish a candidate result.

## Why this is an engineering system

- **The verifier is separate.** Candidate code cannot rewrite the trusted oracle or decide its own result.
- **The failure is reproducible.** The synthetic F01 fixture demonstrates the mobile interception at 390 × 844 while the 1280 × 800 desktop check passes.
- **Evidence is attributable.** Run identities, source revisions, browser observations and SHA-256 hashes support later inspection.
- **Model output is constrained.** Recording validation, typed response checks and a closed CSS grammar limit what enters the proposal artifact.
- **The operator retains control.** Provider calls, video uploads and candidate execution are separate gated actions. Model text is never a trusted verdict.
- **Refusals stay visible.** Incomplete responses, mismatched models, invalid output, exhausted attempts and corrupted records fail closed.

## Product walkthrough

The repository contains a local dashboard and localhost companion. **Mock mode is the default** and needs no provider credentials. A separately gated **owner-started Baseten live mode** exists but is not enabled during ordinary use. Two separately authorized Baseten attempts have been refused (first HTTP 403, second response-shape validation), and both are permanently spent; **there is no successful Baseten analysis result to present yet**.

- **Synthetic defect:** F01 reproduces; the mobile cart stays at 0.
- **Local mock flow:** Zone L can demonstrate upload, analysis and provenance with fixture output; no provider inference occurs in mock mode.
- **Independent control:** hand-authored PC-1 is `VERIFIED` 3/3; the Muse Spark proposal remains `UNTRUSTED PROPOSAL — NOT VERIFIED`.

The hero above is an animated architectural illustration. It is not a browser capture, provider transcript, or demo recording. See the [visual asset plan](docs/README-VISUAL-ASSETS.md) for capture guidance.

## Architecture & trust boundaries

```mermaid
flowchart TB
    F["Synthetic F01 sample store"]
    O["Trusted Playwright baseline"]
    V["Validated local recording"]
    S["Muse Spark 1.3 video-analysis target"]
    H["Untrusted observation or historical proposal"]
    W["Muse Wonder code-role default (unused; not a dependency)"]
    C["Hand-authored PC-1 control"]
    R["Protected browser verifier"]
    E["Deterministic verdict + hashed evidence"]
    L["Local companion · mock by default"]
    B["Baseten live · owner-only / default off"]

    F --> O --> E
    V --> S --> H
    C --> R --> E
    L -->|"mock only"| V
    L -. "fresh authorization required" .-> B

    classDef trusted fill:#10283a,color:#e8f7ff,stroke:#22c6f0,stroke-width:2px
    classDef untrusted fill:#311821,color:#ffe8e8,stroke:#ff4757,stroke-width:2px
    classDef gated fill:#1b2230,color:#e5e7eb,stroke:#94a3b8,stroke-dasharray:5 4
    class O,R,E trusted
    class S,H untrusted
    class B gated
```

**Solid paths** show implemented local behavior or recorded evidence. **Dashed paths** show model targets or gated behavior; they do not imply an active provider request or a verified model fix.

### Trust boundary at a glance

- **Fixture → browser:** the trusted Playwright oracle observes the tap and cart state at fixed viewports.
- **Recording → model:** media is validated before use; video content and model observations remain untrusted.
- **Model → proposal:** structured output is validated and restricted to a closed CSS grammar. The historical Muse Spark proposal remains unverified.
- **Candidate → verdict:** a separate verifier derives results from browser evidence; the hand-authored PC-1 identity is kept separate.
- **Local companion → provider:** mock mode is always the default. The current (pre-issue-#39) CLI is one-shot: owner-started `--live`, a private key, the exact hackathon model and certified F01 pin, with an approved attempt recorded before egress in a durable spend ledger. Both historical attempts are exhausted; there are no automatic retries. [Issue #39](https://github.com/mrdzyn/proofpilot-ai/issues/39) proposes owner-supervised **repeatable** manual analysis under a new standing-session authorization and append-only multi-attempt ledger; **that policy is not implemented or active yet**.

## Evidence and current gates

The state below reflects repository evidence and the current project status. It is not a blanket claim that every feature is production-ready.

- **F01 mobile baseline — `REPRODUCED`:** the expected mobile failure is observed; desktop control passes.
- **Hand-authored PC-1 — `VERIFIED` 3/3:** three clean trusted replays for the hand-authored control only.
- **Historical Muse Spark proposal — `PROPOSAL_ACCEPTED`:** one proposal artifact exists; it is untrusted, unexecuted and not verified.
- **Historical Muse Spark 1.3 video smoke — COMPLETED ONCE (operator-reported):** the second of two authorized Meta video-analysis attempts returned a schema-valid, untrusted symptom. This is neither a model-verified fix nor a current-access guarantee. **Muse Wonder smoke — NOT TESTED.** See [live smoke evidence](docs/LIVE-SMOKE.md).
- **Baseten D9-LIVE-01 — `REFUSED / SPENT` (owner-reported, November 2, 2026):** one authorized analysis POST against the **incorrect unsuffixed public model** returned `TRANSPORT_HTTP` HTTP 403. The hash-chained ledger records one permanently spent send-boundary attempt; no model observations or token usage were returned, and billing is unverified. No retry occurred. See [D9 runbook §7](docs/UI-C3-02-D9-RUNBOOK.md#7-d9-live-01-outcome-owner-reported-recorded-agent-did-not-run-it).
- **Baseten hackathon model correction — MERGED (PR #37):** the organizer-issued key requires exactly `meta-models/muse-spark-open-1026`, not the public `meta-models/muse-spark-open`. The corrected pin, refusal gates and fake-provider tests are merged.
- **Baseten D9-LIVE-02 — `REFUSED / TRANSPORT_SHAPE / SPENT` (owner-reported, November 2, 2026):** the separately owner-armed demo used the correctly pinned hackathon model and certified F01 video, but Zone L reported `Refused (TRANSPORT_SHAPE): live response envelope malformed`. Based on the merged transport implementation, this code means a 2xx HTTP response was received and JSON parsing completed, but strict validation refused the response envelope. The exact structural mismatch and any model-generated content are **unknown**; no accepted Baseten analysis result is available. The second one-shot send-boundary authorization is consumed and **must not be retried or rearmed**. Billing and token usage are unverified. A 1,024-token output cap plus empty-content-before-finish-reason validation is an investigation hypothesis, not a confirmed cause. Preserve both owner-held spent ledgers.
- **Corrected Baseten catalog preflight — PASS (owner-reported, November 2, 2026):** authenticated, non-inference `GET /v1/models` listed the approved `-1026` ID (21 models in catalog). This establishes catalog reachability, **not** successful inference, billing, or video compatibility on the hackathon deployment. A new live request is **not** authorized by this README.
- **Public hosted sandbox / arbitrary-site auto-fix — unavailable:** outside the implemented local synthetic workflow.

`VERIFIED` applies only to the **hand-authored PC-1 control**. Its CSS happens to match the historical Muse Spark proposal; that equality does not transfer evidence or provenance to the proposal.

### Model roles

The checked-in defaults in [`.env.example`](.env.example) name these Meta model IDs:

- **Visual / multimodal:** `muse-spark-1.3`
- **Code-role configuration default (unused; not a runtime dependency):** `muse-wonder-1.0`

Contributor variants are not configured as defaults. Candidate proposals currently use Muse Spark. Muse Wonder is an unused configuration default, not an implemented dependency or patcher. Its smoke test remains untested.

The **separate Baseten live-analysis transport** uses the hackathon-only `meta-models/muse-spark-open-1026` model pin (PR #37); it is **not** the Meta visual `muse-spark-1.3` variable in `.env.example`, nor the generic public Baseten model slug. Credential values stay in the owner's untracked environment.

See [project status](docs/STATUS.md), the [historical Meta execution report](docs/LIVE-C3-01-EXECUTION-REPORT.md), and [hackathon contribution provenance](HACKATHON_CONTRIBUTIONS.md) for the detailed record.

## Demonstrate the local app safely

**Default mock demonstration (no provider call, no key required):**

```bash
pnpm --dir dashboard build
node scripts/c3-live-analysis.ts --port 5188 --serve "$PWD/dashboard/dist"
```

Open `http://127.0.0.1:5188`, type `pair` in the companion Terminal to obtain a single-use pairing code, and use Zone L with a synthetic F01 recording. The selected file must be explicitly permitted in the Terminal before local upload; then run the mock fixture analysis. Zone L contains static **MOCK** copy and an **Analyze with mock fixture** button even in owner-started live mode; **neither label proves provider provenance**. Check the companion banner and completed result's `baseten-live` provenance when presenting any real inference.

**Real Baseten demonstration — pending [Issue #39](https://github.com/mrdzyn/proofpilot-ai/issues/39):** the owner has chosen repeatable, **manually initiated** analyses instead of a permanent one-request application limit. The reviewed implementation must still be merged and a new standing-session authorization recorded before the owner starts this mode; the **existing CLI continues to enforce the old 0/1 analysis cap**. Under the proposed policy, one approved session can hold multiple independently permitted, explicitly clicked attempts in its own append-only ledger; it does **not** require a new approval or new file for every click. Both historical D9-LIVE-01 and D9-LIVE-02 ledgers remain spent and immutable and cannot be reused or reset to rearm. Provider quotas and charges apply (the hackathon offer includes $100 credits, not unlimited free usage). The corrected `-1026` model passed catalog preflight, but the exact inline `video_url` MP4 format remains unconfirmed. Consult the [owner D9 runbook](docs/UI-C3-02-D9-RUNBOOK.md). This README grants **no new provider-call authorization**.

## Run the synthetic baseline

**Requirements:** Node.js 24+, pnpm 12, and Chromium via Playwright. These steps use the local synthetic fixture and do not call an AI provider or require `.env.local`.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium

pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:security

# The expected mobile failure is reported as a successful baseline reproduction.
pnpm f01:baseline

# Optional: serve the synthetic product fixture locally.
pnpm fixture:serve
```

Open `http://127.0.0.1:4173/product/demo` after starting the fixture server. The raw `pnpm test:e2e:f01` command is expected to exit non-zero on the intentionally defective mobile fixture; use `pnpm f01:baseline` for the green reproduction assertion.

## Repository map

```text
fixtures/sample-store/       Synthetic F01 store; only the intended source is patchable
verifier/                    Protected Playwright oracle
packages/core/               Deterministic classification, policy and evidence logic
packages/inference/          Meta and Baseten adapters; video and proposal paths
packages/intake/             Recording validation, conversion and consent
packages/live-analysis/      Local companion, default-off Baseten transport and mock adapter
dashboard/                   Local React dashboard, including Zone L
packages/provenance/         Proposal artifact and source provenance checks
scripts/                     Baseline, recording and operator commands
tests/                       Unit, security, HTTP and browser integration coverage
docs/                        Architecture, status, security and evidence
```

## Built for the hackathon

ProofPilot AI was built for the **Meta Global AI Developer Hackathon — Push the Frontier (2026)**. The repository distinguishes pre-existing delivery scaffolding from hackathon work in [Hackathon Contributions & Provenance](HACKATHON_CONTRIBUTIONS.md).

**Stack:** TypeScript · Node.js · React + Vite · Playwright / Chromium · FFmpeg · GitHub Actions · Meta Model API · Baseten owner-only transport (default off).

## Contributing and provenance

Contributors follow the repository's [operating model](AGENTS.md). See the [testing policy](docs/TESTING.md), [security baseline](docs/SECURITY.md), and [hackathon contribution provenance](HACKATHON_CONTRIBUTIONS.md). No agent may push, merge, deploy, or submit without explicit owner authorization.

MIT licensed — see [LICENSE](LICENSE).
