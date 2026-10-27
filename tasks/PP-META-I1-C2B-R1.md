# PP-META-I1-C2B-R1 — Completion-budget remediation for Muse Spark video analysis

- **Status:** Review — implementation complete; awaiting independent audit
- **Owner/orchestrator:** Project owner (mrdzyn)
- **Implementation agent:** Claude Code (Claude Sonnet 5.5)
- **Target branch:** `main` (at `0b49d94914576d3c8c605d0a1f50d08d77c4bb8b`)
- **Working branch:** `phase/pp-meta-i1-c2b-r1`
- **Source:** independent review https://github.com/mrdzyn/proofpilot-ai/pull/3#issuecomment-6445492270

## Objective

Raise the likelihood that one Muse Spark 1.3 video analysis completes with a schema-valid answer, with zero network use in this task and every existing security, billing and evidence boundary unchanged.

## Context

`c2b-live-smoke-001` (authorized single use) was accepted by Meta but returned `status=incomplete`, `incomplete_details.reason=max_output_tokens`: 1500 output tokens, 1113 of them reasoning. Reasoning tokens count against `max_output_tokens` (https://dev.meta.ai/docs/reasoning, verified 2026-10-27). Muse Spark 1.3 accepts `reasoning.effort` of `minimal|low|medium|high|xhigh|max`; `none` is rejected with HTTP 400.

## Delivery mode / UI design gate

UI design gate: Not applicable (inference adapter and docs only). No product UI.

## Allowed scope

`packages/inference/src/client.ts` (native video request only), `packages/inference/src/video-analysis.ts`, their tests, `docs/STATUS.md`, `docs/HANDOFFS.md`, `docs/LIVE-SMOKE.md`, this task file.

## Forbidden scope

Any network request. Reusing or modifying `c2b-live-smoke-001` or its local evidence. Changing the text-generation path, the shared 4096 ceiling, the Symptom schema, consent, opt-ins, run-id reservation, retries, `verifier/`, `fixtures/`, `config/`, `.github/`. Patch execution, Docker bypass, C3, merge, deploy.

## Acceptance criteria

- [x] Native video Responses requests carry `reasoning: { effort: 'low' }`; the text path does not.
- [x] Default video `max_output_tokens` is 3072; the 4096 ceiling is unchanged and an out-of-range cap is refused before any upload.
- [x] Envelope tests: one upload, one generation, one delete, no tools/web/stream/previous_response_id, no retries.
- [x] Completed, incomplete (also at the larger cap), failed, refusal, cleanup, duplicate-run and default-deny tests pass.
- [x] Unit, security, integration, C1 baseline pass locally; hosted CI on the Draft PR.
- [x] STATUS and handoff correct; T04 recorded PARTIAL.
- [ ] Independent exact-head audit (pending).

## Test objective / validation

Mocked transport only. `pnpm lint && pnpm typecheck`, `pnpm test:unit`, `pnpm test:security`, `pnpm test:integration`, `pnpm f01:baseline`, `pnpm test:e2e:f01` (exit 1 by design), mutation checks on the new guards.

## Security / privacy

No credentials, media or raw responses in Git. A larger cap raises the worst-case cost per call (see `docs/LIVE-SMOKE.md`); any new live call needs fresh owner authorization.
