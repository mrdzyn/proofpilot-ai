# Hackathon Contributions and Provenance

ProofPilot AI is an entry for the **Meta Global AI Developer Hackathon** (theme: Push the Frontier). This file separates what existed before the official building period from what was built during it.

## Official building period

- **Window:** Oct 27 – Nov 4, 2026 (US Eastern). The earliest conservative start is 2026-10-27 00:00 EDT, which is 2026-10-27T04:00:00Z or 12:00 PHT.
- **Actual implementation start:** **2026-10-27T05:10:12Z** (2026-10-27 13:10 PHT, 01:10 EDT). This is the time of the first in-period repository action: checkout verification and the start of greenfield initialization on branch `phase/pp-meta-i0-c1`.
- **First in-period implementation commit:** original local commit `2a80bd38ab1cb5983ce85269a9a45f344e52422d` (2026-10-27T13:26:10+08:00). See *Publication and sanitized Git root* below for how the original local history maps to this public repository.

## Pre-existing material (NOT claimed as hackathon work)

| Item | Origin | Notes |
|---|---|---|
| Repository process template | **Private** repository `mrdzyn/ai-native-project-template` at `1d94a356b71da5eb345f4f4a29ff3f99f36c10c5` (commit dated 2026-10-17, by the same owner). Its history is **not** published here. | Engineering-process scaffolding only: `AGENTS.md`, generic docs (`docs/TESTING.md`, `docs/SECURITY.md`, `docs/HANDOFFS.md` policy, `docs/REPOSITORY-SETUP.md`, `docs/CAPABILITY-PACKS.md`, `docs/RELEASE.md`, design-system/accessibility guidance under `design/`), the baseline CI workflow pair (`.github/workflows/ci.yml` baseline job, `common-validation.yml`), and `scripts/validate_project_profile.py`. It contains no ProofPilot product code. |
| ProofPilot AI Hackathon Blueprint v1.1 | Owner's pre-event planning package, dated 2026-10-26 | Specification, architecture, test plan and schedule. **Planning only.** It is not committed here, and no code from it is claimed as implementation. Illustrative snippets in it were re-implemented, not copied, where used. |

## Built during the hackathon

| Area | Paths |
|---|---|
| Greenfield conversion to the ProofPilot child project (pruning, project profile, ProofPilot-specific docs) | `config/project-profile.json`, `README.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/STATUS.md`, project sections of `docs/SECURITY.md` and `docs/TESTING.md`, `tasks/PP-META-I0-C1.md` |
| F01 synthetic sample store (intentionally defective fixture) | `fixtures/sample-store/` |
| Trusted Playwright acceptance oracle | `verifier/` |
| Deterministic baseline classifier, run statuses, patch-scope policy, env scrubbing, impact metrics | `packages/core/`, `config/patch-policy.json` |
| Meta Model API adapter and Baseten provider configuration | `packages/inference/` |
| Baseline runner, inference status/discovery CLI, policy lint | `scripts/f01-baseline.ts`, `scripts/inference-status.ts`, `scripts/lint.mjs` |
| Unit and security tests | `tests/` |
| CI stack-validation job | `.github/workflows/ci.yml` (`stack-validation` job) |
| C2A: recording intake, consent, WebM→MP4 conversion | `packages/intake/` |
| C2A: `Symptom` schema and validator | `packages/core/src/symptom.ts`, `packages/core/src/worktree.ts` |
| C2A: Meta Files + Responses video integration, analyze CLI | `packages/inference/src/client.ts` (extended), `video-analysis.ts`, `analyze-command.ts`, `scripts/analyze-video.ts` |
| C2A: genuine F01 browser recording tool | `scripts/f01-record.ts` |
| C2A: product screen-map proposal (design only) | `design/screens/PP-PRODUCT-SCREEN-MAP.md` |
| C2A: tests | `tests/unit/`, `tests/security/`, `tests/integration/` |

## Third-party dependencies (development only)

| Package | Version | License |
|---|---|---|
| `@playwright/test` (and Chromium headless shell it downloads) | 1.64.1 | Apache-2.0 |
| `typescript` | 7.0.2 | Apache-2.0 |
| `@types/node` | 26.6.5 | MIT |

No runtime dependencies. The model provider HTTP calls use the Node.js built-in `fetch`.

## Assets and data

All fixture content (product name, copy, colours, the CSS gradient "image") is synthetic and authored for this project. No third-party media, customer data, or private repositories are included.

## AI assistance

Implementation was performed by AI coding agents (Claude Code) under the owner's direction and task contracts. Independent review is performed by a separate agent/session.

| Work | Model recorded | Basis |
|---|---|---|
| C1 implementation and publication (original local commits and public commits `1e3f590`, `88243d1`, `8826204`) | Claude Opus 5.5 | The Claude Code session reported `claude-opus-5-5` as its model and supplied the `Co-Authored-By: Claude Opus 5.5` trailer carried by those commits. |
| Audit remediation of PR #1 (MINOR-1/MINOR-2) | Claude Sonnet 5.5 | The remediation session reported `claude-sonnet-5-5`; its commits carry the `Claude Sonnet 5.5` trailer. |
| C2A implementation (branch `phase/pp-meta-i1-c2a`) | Claude Sonnet 5.5 | The C2A session reported `claude-sonnet-5-5`; its commits carry the `Claude Sonnet 5.5` trailer. |
| Pivot contract `tasks/PP-META-I2-C3.md` and its PR #6 audit remediation (docs only, branch `docs/pp-meta-i2-c3-pivot`) | Claude Sonnet 5.5 (configured) | The sessions were configured for `claude-sonnet-5-5`; the serving model was not independently confirmed. The commits carry the `Claude Sonnet 5.5` trailer. |

The owner indicated Claude Sonnet was intended for this project. No execution evidence supports Sonnet for the earlier C1 commits, so their attribution was not changed. If the owner has evidence that those sessions used a different model, the owner should say so and this table will be corrected in a new commit; history is not rewritten. Meta models (Muse Spark / Muse Wonder) are the product's runtime models, not development tools.

## Publication and sanitized Git root

The C1 work was developed in a local clone whose history descends from the private template. Pushing that history would have made the private template's full history and its original snapshot public. Publication therefore used a **new Git root in a fresh object database**: the public `main` is a minimal ProofPilot baseline, and `phase/pp-meta-i0-c1` carries the reviewed C1 tree. No template commits, trees, or pruned template files are reachable from the public branches.

Original local commits (private development evidence, retained by the owner):

| Original SHA | Author timestamp | Content |
|---|---|---|
| `2a80bd38ab1cb5983ce85269a9a45f344e52422d` | 2026-10-27T13:26:10+08:00 | Greenfield initialization |
| `72420c57a072758affe836399544bbcea1a97f7b` | 2026-10-27T13:26:10+08:00 | F01 fixture, oracle, core, inference, tests, CI |
| `26203c12f76eb2fbeaa714d35d27bb7cfc7b91b6` | 2026-10-27T13:27:24+08:00 | Frozen-lockfile fix |
| `f78dad56ce092c04d69f38ea02cdca54a1046089` | 2026-10-27T13:28:12+08:00 | Independent trust-root test (**original implementation head**) |
| `5b6a0066f09305788ed057b0d6b9b6f428f590f5` | 2026-10-27T13:28:49+08:00 | Status + C1 handoff |
| `be6c39f9b50bc20313f2029ebc8b6a554842f7fc` | 2026-10-27T13:38:33+08:00 | Container validation reclassified (docs) |

Publication-only differences from original tree `be6c39f`: master-only CI governance notes removed from `docs/REPOSITORY-SETUP.md`; a template phase label removed from `docs/RELEASE.md`; this provenance section; and the publication STATUS/handoff update. Application, fixture, verifier and test code are byte-identical. The public commit identifiers are recorded in the next section, added by the commit that follows this one, because a commit cannot contain its own SHA.

### Public commit identifiers

| Public SHA | Commit timestamp | Branch | Content |
|---|---|---|---|
| `1e3f59037a86a76301fd805ba6a7e62a8c927882` | 2026-10-27T13:46:22+08:00 | `main` (public root) | Sanitized public baseline: README, LICENSE, .gitignore |
| `88243d110d09f0ff853896841fdf80fe4d5bfce4` | 2026-10-27T13:46:48+08:00 | `phase/pp-meta-i0-c1` | C1 project tree (public implementation head; equivalent to original `f78dad5` / `be6c39f` code) |
| *(the commit adding this table)* | see `git log` | `phase/pp-meta-i0-c1` | Public SHA mapping, STATUS, publication handoff |

## Contributors

- Johnmikel Xavier Rosales (owner)
