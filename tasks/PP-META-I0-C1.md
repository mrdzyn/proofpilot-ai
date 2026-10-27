# PP-META-I0-C1 — Day 1 foundation: greenfield init, F01 fixture, trusted oracle, inference adapters

- **Status:** Review — implementation complete; awaiting independent audit
- **Owner/orchestrator:** Project owner (mrdzyn)
- **Implementation agent:** Claude Code. C1 implementation: Claude Opus 5.5; audit remediation (PR #1): Claude Sonnet 5.5 (see `HACKATHON_CONTRIBUTIONS.md` § AI assistance)
- **Target branch:** `main`
- **Working branch:** `phase/pp-meta-i0-c1`
- **Source of truth:** ProofPilot AI Hackathon Blueprint v1.1 (pre-event planning package, held locally by the owner; not committed). Relevant sections: `01_PRODUCT_SPEC` (F01), `02_ARCHITECTURE` (trust model), `03_IMPLEMENTATION_MILESTONES` (D1), `04_ACCEPTANCE_AND_INDEPENDENT_AUDIT` (T07, T08, T25, T26), `06_AGENT_IMPLEMENTATION_HANDOFF` (I0).

## Objective

Turn the inherited template into the ProofPilot AI child project and deliver the Day 1 (Oct 27 ET) foundation: a deliberately broken F01 sample store, a trusted Playwright oracle that observably fails on mobile and passes on desktop, a typed Meta Model API adapter, a minimal Baseten provider configuration contract, and impact-metric instrumentation that records only observed values.

## Context

- The repository was created from `mrdzyn/ai-native-project-template` at `1d94a356b71da5eb345f4f4a29ff3f99f36c10c5`. The inherited P8.0 tasks and template status are not ProofPilot work.
- Official building period starts 2026-10-27 00:00 EDT (12:00 PHT). Implementation started at 2026-10-27T05:10:12Z (13:10 PHT), inside the window.
- The owner has reported that authenticated Meta model discovery works. Billable inference is **not authorized** in C1.
- Baseten credits are reported as approved; no `BASETEN_API_KEY` is configured on this machine.

## Delivery mode / UI design gate

- **Material user-facing UI:** No. The only UI in C1 is the synthetic, intentionally defective `sample-store` **test fixture**, which exists to be broken. It is not ProofPilot product UI.
- **UI design gate:** Not applicable for C1. ProofPilot product screens A–E (Create Run, Investigation, Patch Review, Verification, Evidence) require the design-first gate in a later increment.
- **Wiring scope:** inference adapter (no billable calls), patch-scope policy, metrics recorder.
- **Test scope:** unit (mocked HTTP), security (trust-root, redaction, host allowlist), browser oracle (Playwright).

## Test objective / validation budget

- **Test objective:** Prove that (1) at 390×844 a real pointer tap on Add to Cart is intercepted by the overlay and the trusted oracle fails on a `cart-count` mismatch ("0" vs "1"), not a timeout or missing selector; (2) at 1280×800 the same interaction succeeds; (3) the inference adapter validates input, bounds timeouts, refuses unauthorized billable calls and never leaks the API key; (4) the verifier oracle cannot be written under the patcher policy.
- **Minimum automated evidence:** `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `pnpm test:security`, `pnpm f01:baseline` (runs the oracle and classifies the baseline signature), `python3 scripts/validate_project_profile.py --repository mrdzyn/proofpilot-ai`, `git diff --check`.
- **Manual QA:** open the F01 screenshots and trace from the evidence directory; confirm the mobile overlay covers the button and the desktop add succeeds.
- **Escalation triggers:** an oracle failure for any reason other than the cart-count mismatch; any key material in output; adapter test failure.
- **Required CI:** `Project baseline / Common validation` and `Stack validation`. Hosted GitHub Actions has not been run for this branch, because nothing is pushed in C1. Equivalent local evidence is recorded in the C1 handoff.

## Allowed scope

- Greenfield pruning and project-specific rewrite of inherited docs (per `docs/REPOSITORY-SETUP.md` § Greenfield pruning).
- `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.json`, `.env.example`, `.gitignore`, `LICENSE`, `HACKATHON_CONTRIBUTIONS.md`.
- `fixtures/sample-store/**`, `verifier/**`, `packages/core/**`, `packages/inference/**`, `tests/**`, `scripts/**`, `config/**`.
- `.github/workflows/ci.yml` (add the stack-validation sibling job).

## Forbidden scope

- C2+ work: video intake, consent flow, SQLite jobs, Muse Spark video analysis, Muse Wonder patching, candidate/verifier containers, evidence ZIP export, product UI screens.
- Billable inference calls of any kind.
- Push, PR creation, merge, deploy, publish, or any external write.
- Printing, logging, or committing credentials; committing `.env*` files other than `.env.example`.
- Rewriting `.github/workflows/common-validation.yml` semantics or weakening the baseline validator.

## Acceptance criteria

- [x] `config/project-profile.json` is `repositoryMode=project`, `design=true`, `platforms=["web"]`, `storeRelease=false`, `integrations=[]`. The baseline validator passes for `mrdzyn/proofpilot-ai`.
- [x] Master-only workflow/scripts, master memory/handoff blocks, inherited tasks and unselected packs are removed. README, PRODUCT, ARCHITECTURE and STATUS are ProofPilot-specific.
- [x] `HACKATHON_CONTRIBUTIONS.md` records the actual start timestamp, template provenance, and the pre-existing vs. hackathon-built distinction. An OSI license is present.
- [x] F01 mobile: the hit-test at the tap point resolves to `promo-overlay`. The oracle fails with `cart-count` expected "1", received "0".
- [x] F01 desktop: the oracle passes with `cart-count` "1".
- [x] Screenshots and traces come from actual runs. The baseline classifier rejects timeout/selector/startup failures as non-reproductions.
- [x] Oracle lives in `verifier/`. `config/patch-policy.json` denies it, and a security test proves this.
- [x] Meta adapter: typed config, validated model IDs/base URL, host allowlist, bounded timeouts/retries, a billable-call guard, redacted errors, and mock-based tests.
- [x] Baseten: config contract with the exact hackathon model ID and an exact-match availability check (no substitution). Marked NOT TESTED without a key.
- [x] Impact metrics recorded from actual timings only, with no comparative claims.
- [ ] Independent audit (separate agent): pending.
- [ ] Hosted CI: not run (branch not pushed).

## Security / privacy considerations

API keys are read server-side from the environment only. Requests are sent only to allowlisted HTTPS hosts. Errors redact key material and truncate provider bodies. Billable calls require an explicit `PROOFPILOT_ALLOW_BILLABLE_CALLS=1` opt-in. The fixture is synthetic, with no real data. Evidence artifacts are gitignored and contain no credentials.

## Third-party integration considerations

Meta Model API (primary, OpenAI-compatible) and Baseten (secondary, OpenAI-compatible). These are model providers, not template integration packs, so `integrations` stays empty.

## Documentation updates

README, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/STATUS.md`, `docs/TESTING.md` (project commands), `docs/SECURITY.md` (project boundaries), `docs/HANDOFFS.md` (C1 handoff), `HACKATHON_CONTRIBUTIONS.md`.

## Stop / escalation conditions

Stop if the origin is the master template, if the oracle cannot fail for the intended reason, if a credential would be exposed, or if billable inference would be required.

## Completion handoff

Append `PP-META-I0-C1` to `docs/HANDOFFS.md`, set it as `Active handoff`, and stop for independent audit.
