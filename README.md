# ProofPilot AI

> **Don't just fix the bug. Prove it's fixed.**

ProofPilot AI turns a short recording of a UI defect into an observed browser reproduction, a candidate patch, and an **independent** re-test against trusted acceptance checks that the patching agent can neither see nor change. A patch counts as a success only when a separate verifier has confirmed both the original failure and the corrected behaviour.

Built for the Meta Global AI Developer Hackathon (Push the Frontier). Runtime model: **Muse Spark 1.3** via the Meta Model API (video analysis, and one gated fix-proposal call). The C3 plan is largely implemented (candidate staging, an offline scoreboard over hand-authored controls, model-proposal registration/verification infrastructure, QA-01 operator QA, read-boundary security and artifact-authentication readiness, plus one executed Muse Spark proposal call whose result is accepted but **unverified**); remaining drafts pending owner approval are the real-proposal execution (with historical enrollment), the report UI (UI-C3-01) and a hosted sandbox (HOST-C3-01). Muse Wonder is not a planned dependency. Baseten-hosted **Muse Spark Open** is config-only and untested. See [HACKATHON_CONTRIBUTIONS.md](HACKATHON_CONTRIBUTIONS.md) for provenance.

## Current state (through PR #24; details in [docs/STATUS.md](docs/STATUS.md))

| Capability | State |
|---|---|
| F01 defective sample store + trusted oracle | Implemented. The mobile oracle fails as intended and the desktop control passes. |
| Deterministic baseline classifier + evidence hashing + observed metrics | Implemented |
| Meta adapter (typed, validated, bounded, redacted) | Implemented. Authenticated non-billable model discovery has been observed. Real Muse Spark video inference ran twice in C2B (below); **one gated patch-proposal call was made and accepted as an unverified proposal** (LIVE-C3-01; [report](docs/LIVE-C3-01-EXECUTION-REPORT.md)). |
| Baseten provider configuration | Implemented. **NOT TESTED** (no key configured). |
| Genuine F01 mobile-defect recording (MP4) + desktop control | Implemented (`pnpm record:f01`); files stay local and gitignored |
| Video intake: real container/size/duration/codec/decode validation, WebM→MP4, per-run consent | Implemented |
| Muse Spark native-video integration (Files + Responses), local `Symptom` validation, cleanup | Implemented and mock tested. **Exercised live twice in C2B (agent-reported, not independently confirmed against the Meta account):** `c2b-live-smoke-001` ended `incomplete` at `max_output_tokens`; after the low-reasoning/3072-token fix, `c2b-live-smoke-002` completed (`VIDEO_ANALYZED`, schema-valid `Symptom`, model hypothesis only). Both run IDs are spent; remote files reported deleted; actual charge unverified. |
| Product UI | Screen-map proposal only (`design/screens/`); **not approved, not built** |
| Candidate verification | Offline coordinator, staged oracle replays, 3-replay `VERIFIED` rule and an independently re-checked scoreboard are implemented for **hand-authored** controls (PC-1 verified 3/3); model-proposal registration/verification infrastructure (C3-B2B E1/E2) and Ed25519 manifest-authentication readiness (SEC-P2-02) are merged, synthetic-only. The one Muse Spark proposal (`.promo-overlay { pointer-events: none }`, `UNTRUSTED PROPOSAL — NOT VERIFIED`) has **not** been verified; executing it through the verifier ([procedure](docs/C3B2B-REAL-PROPOSAL-PROCEDURE.md), currently DISABLED) is not approved. Static report UI and hosted sandbox: not approved |
| Live proposal call | LIVE-C3-01 (one Meta attempt) was executed and its lifetime quota is **spent**; no further provider call is authorized |

`VERIFIED` appears only for the **hand-authored** control PC-1 (C3-B1). No model-generated proposal is labelled `VERIFIED`. Hackathon submission pack: [docs/META-HACKATHON-SUBMISSION.md](docs/META-HACKATHON-SUBMISSION.md).

## Quick start

Requirements: Node.js ≥ 24, pnpm 12 (`corepack enable`), macOS/Linux.

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium

pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:security
pnpm record:f01          # genuine mobile + desktop recordings (needs Chromium and ffmpeg)
pnpm test:integration    # real-media + dirty-evidence tests (needs Chromium and ffmpeg)
pnpm analyze:video -- --video .proofpilot/recordings/<set>/mobile-defect/f01-mobile-defect.mp4 --run-id demo-1   # DRY RUN: no network
pnpm f01:baseline        # runs the trusted oracle; exits 0 only if the expected baseline failure is observed
pnpm test:e2e:f01        # raw oracle; exits NON-ZERO on the baseline by design
pnpm fixture:serve       # browse http://127.0.0.1:4173/product/demo
```

Model configuration: copy `.env.example` to `.env.local` and set `MODEL_API_KEY`. Then:

```bash
pnpm inference:status                # config only, no network
pnpm inference:status -- --discover  # non-billable GET /models; reports exact-ID availability only
```

Billable inference stays disabled unless `PROOFPILOT_ALLOW_BILLABLE_CALLS=1` is set with owner authorization.

## Layout

```text
fixtures/sample-store/  intentionally defective synthetic store (F01); only src/ is patchable
verifier/               trusted oracle (trust root; denied to the patcher)
packages/core/          statuses, F01 baseline classifier, patch policy, env scrubbing, metrics
packages/inference/     Meta / Baseten provider adapter, Muse Spark video analysis, analyze CLI
packages/intake/        recording validation, WebM→MP4, per-run consent
design/screens/         product screen-map proposal (not approved)
scripts/                baseline runner, inference status, policy lint, profile validator
tests/unit, tests/security
config/                 project profile, patch policy
docs/                   STATUS, ARCHITECTURE, PRODUCT, TESTING, SECURITY, HANDOFFS
tasks/                  bounded task contracts
```

## Working agreement

Agents follow [AGENTS.md](AGENTS.md). Current state lives in [docs/STATUS.md](docs/STATUS.md). No agent may push, merge, deploy or submit without explicit owner authorization.

## License

MIT. See [LICENSE](LICENSE).
