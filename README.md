# ProofPilot AI

> **Don't just fix the bug. Prove it's fixed.**

ProofPilot AI turns a short recording of a UI defect into an observed browser reproduction, a candidate patch, and an **independent** re-test against trusted acceptance checks that the patching agent can neither see nor change. A patch counts as a success only when a separate verifier has confirmed both the original failure and the corrected behaviour.

Built for the Meta Global AI Developer Hackathon (Push the Frontier). Runtime models: **Muse Spark 1.3** (visual analysis) and **Muse Wonder 1.0** (patch proposal) via the Meta Model API. Baseten-hosted **Muse Spark Open** is an optional secondary provider. See [HACKATHON_CONTRIBUTIONS.md](HACKATHON_CONTRIBUTIONS.md) for provenance.

## Current state (Day 1 / C1)

| Capability | State |
|---|---|
| F01 defective sample store + trusted oracle | Implemented. The mobile oracle fails as intended and the desktop control passes. |
| Deterministic baseline classifier + evidence hashing + observed metrics | Implemented |
| Meta adapter (typed, validated, bounded, redacted) | Implemented. Authenticated non-billable model discovery has been observed. **Real inference is NOT TESTED.** |
| Baseten provider configuration | Implemented. **NOT TESTED** (no key configured). |
| Video intake, Muse Spark analysis, Muse Wonder patching, candidate verifier, evidence export, product UI | Not started (C2+) |

Nothing in this repository is currently labelled `VERIFIED`; no code path in C1 can produce that status.

## Quick start

Requirements: Node.js ≥ 24, pnpm 12 (`corepack enable`), macOS/Linux.

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium

pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:security
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
packages/inference/     Meta / Baseten OpenAI-compatible provider adapter
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
