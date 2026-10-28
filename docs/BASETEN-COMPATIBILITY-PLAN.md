# Baseten compatibility plan (PLAN ONLY — nothing here is authorized or executed)

> Status: **NOT TESTED.** No Baseten request has ever been made by this project. `APPROVED_LIVE_QUOTA.baseten` is a frozen code constant of `0` (LIVE-C3-01 is not approved) and the production proposal entry point is hard-disabled. This document records an observed documentation discrepancy and a staged plan to resolve it later. The model id in the repository is **not** changed and no alias is used.

## The pinned id and what the public documentation shows

| Item | Repository | Public Baseten Model APIs documentation read on 2026-10-28 (no API call; page fetch only) |
|---|---|---|
| Model id | `meta-models/muse-spark-open-1026`, the hackathon-specific versioned id (`packages/inference/src/config.ts`, taken from the participant guide). The comment there warns against the unversioned `meta-models/muse-spark-open`. | The page names "Muse Spark Open" in feature notes but, in the content captured, **lists no slug**; neither `meta-models/muse-spark-open` nor `muse-spark-open-1026` appears. It says to obtain slugs from `baseten model-api list` or `GET https://inference.baseten.co/v1/models`. |
| Base URL, auth | `https://inference.baseten.co/v1`, `Authorization: Bearer` | Same base URL for OpenAI-SDK clients (Chat Completions and Responses); `Authorization: Bearer $BASETEN_API_KEY`. |
| Structured output | `structuredResponse` sends `response_format: {type: "json_schema", json_schema: {name, schema, strict: true}}` on `/chat/completions` | "All except Muse Spark Open support structured outputs." **If accurate, the request our Baseten path builds is unsupported for this model** (it may be rejected or silently ignored). |
| Other noted limits | none handled | `logprobs` accepted but ignored; `n` greater than 1 returns HTTP 400; audio input supported. |

**Discrepancies to resolve (none can be resolved without a provider request):**
1. Whether the hackathon-pinned versioned id is currently served, and under what exact string, versus the public documentation naming only "Muse Spark Open".
2. Whether the pinned model accepts `response_format: json_schema` at all.
3. Whether any other public id (for example an unversioned one) points at a different model. **It must not be substituted.** The repository rule stands: exact pinned id, no alias, no fallback.

## What changes in the repository now

Nothing functional. The model id, the zero quota and the disabled entry point are unchanged. The Baseten adapter path stays mock-tested only and is labelled unverified in `docs/STATUS.md` and `docs/SECURITY.md`.

## Staged compatibility plan (every stage needs a separate recorded owner authorization)

| Stage | Action | Provider request? | Pass criterion | Stop criterion |
|---|---|---|---|---|
| B0 | Owner re-reads the hackathon participant guide and the Baseten dashboard model list and records the exact served id | No | The recorded id equals `meta-models/muse-spark-open-1026` byte for byte | A different or missing id: stop; do not edit the config without a reviewed change |
| B1 | One non-billable `GET /v1/models` (existing `listModels`/`inference:status --discover`), key from the owner's environment, never printed | Yes (non-billable) | The exact id is listed; related ids are reported but never substituted | Id absent: stop and report |
| B2 | One minimal billable chat-completion text call with **no** `response_format` (a one-line prompt, tiny output cap, `n` unset) to confirm availability and response shape (`finish_reason`, `usage`, echoed `model`) | Yes (billable; quota slot burned, no retry) | `finish_reason: "stop"` and `model` equals the pinned id | Any error or mismatch: stop; no retry |
| B3 | Decide the structured-output strategy from B2 and the docs: either (a) keep `json_schema` only if the owner confirms the model supports it, or (b) add a reviewed Baseten-only **prompt-JSON mode** (no `response_format`) and rely on the existing strict local validator (`parseProposal`), which already treats every output as untrusted | No (code and review) | Independent exact-head audit of the adapter change; mocks cover the new request shape | Audit finds a gap |
| B4 | One billable proposal call under a new run id through the then-enabled entry point | Yes (billable) | Completed lifecycle, exact model, strict validation result recorded | Never before LIVE-C3-01 is approved and the entry point is separately enabled |

Rules for every stage: per-run human consent captured and audited (the in-repo consent record only has the shape of consent), `retries: 0`, a burned run id and quota slot per attempt, artifacts under gitignored `.proofpilot/`, sanitized reporting, and no inference result ever treated as a verdict. Costs and credits for Baseten were never verified; any figure is illustrative.

## Risks

- A silently ignored `json_schema` could yield free-form text; the strict parser would then reject it (`PATCH_REJECTED`/`MALFORMED_JSON`), which is the safe failure.
- The hackathon id may be time-limited or account-scoped; B1 is designed to find out before any billable call.
