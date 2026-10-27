# Architecture

> The system as built, plus the planned topology. Durable rationale lives in `docs/PROJECT-MEMORY.md`.

## Architecture goals

- Patch generation and verification are separate trust domains.
- Verdicts are computed by deterministic code from trusted oracle results; model text is never evidence.
- Credentials stay in the trusted host process; the browser runner and fixture never receive them.
- Every claimed result is traceable to a Git SHA, an exact command, and hashed artifacts.

## System context

A developer supplies a short recording of a UI defect in one of the curated synthetic fixtures. ProofPilot asks Muse Spark to describe the symptom, reproduces it with Playwright, asks Muse Wonder for a scoped patch, applies it only after explicit local approval, and re-runs the hidden oracle in a fresh runner.

```mermaid
flowchart TD
  U[Recording + description] --> UI[Next.js UI/API — planned]
  UI --> W[Trusted orchestrator — planned]
  W --> M1[Meta API muse-spark-1.3 — adapter built]
  W --> BR[Playwright reproducer — F01 oracle built]
  W --> M2[Meta API muse-wonder-1.0 — adapter built]
  M2 --> P[Candidate diff + approval — planned; patch policy built]
  P --> V[Independent verifier, fresh runner — planned]
  V --> R[Deterministic verdict + hash manifest — baseline classifier built]
```

## Technology stack

| Layer | Technology | Notes |
|---|---|---|
| Language/runtime | TypeScript on Node.js 24 (native type stripping) | No build step; `tsc --noEmit` for typecheck |
| Package manager | pnpm 12 (single package) | `packages/*` are source modules imported by relative path, not separately published workspace packages |
| Browser automation | `@playwright/test` 1.64.1, Chromium headless | Pinned viewports 390×844 and 1280×800, locale en-US, TZ UTC |
| Model providers | Meta Model API (primary), Baseten (secondary) | OpenAI-compatible REST over native `fetch` |
| Media tooling | FFmpeg / ffprobe on PATH (local) | Required by `packages/intake` for probing, decode checks and WebM→MP4; `TOOL_UNAVAILABLE` if missing |
| UI/API | Next.js (planned, C2+) | Requires the design-first gate |
| Storage | Local `.proofpilot/runs/<runId>/` (gitignored) | SQLite job store planned |
| Sandbox | Docker linux/arm64 (planned) | **NOT VERIFIED — agent environment lacks Docker access** (owner reports Docker Desktop installed on the host; not independently confirmed). Mandatory gate before executing AI-generated code or candidate patches. |
| CI/CD | GitHub Actions: Project baseline + Stack validation | |

## Component boundaries (C1 + C2A)

### `fixtures/sample-store/` — defective fixture
Static HTML/CSS/JS served by `server.mjs` from a fixed route map on `127.0.0.1:4173`. Only `src/` is patchable.

### `verifier/` — trusted oracle (trust root)
Playwright config and `f01/f01.oracle.spec.ts`. Performs a real coordinate tap, records the hit-test target and cart counts as an observation attachment, and asserts `cart-count == "1"`. Starts a fresh fixture server per run (`reuseExistingServer: false`).

### `packages/core/` — deterministic logic
- `status.ts`: run status lexicon.
- `f01-baseline.ts`: classifies a Playwright JSON report as `REPRODUCED` / `NOT_REPRODUCED` / `INCONCLUSIVE`. `REPRODUCED` requires a `failed` mobile result with the exact `toHaveText` "1"/"0" mismatch, an observation showing the tap intercepted at 390×844, and a passing desktop control. Timeouts, selector or startup failures, or a broken desktop all abstain.
- `patch-policy.ts` + `config/patch-policy.json`: deny-by-default write policy for the patch agent (trust roots, traversal, secret names, extension allowlist).
- `env.ts`: `scrubEnv` strips credential-like variables before spawning the oracle.
- `metrics.ts`: impact-metrics schema with `provenance: "observed"` only.

### `packages/inference/` — provider adapter
- `config.ts`: provider contract (`meta`, `baseten`), env-based config, model-ID and base-URL validation (HTTPS + per-provider host allowlist), bounded timeout (1–120 s) and retries (0–2), and the billable-call opt-in.
- `client.ts`: `listModels`, `checkModelAvailability` (exact match; related IDs reported, never substituted), `generateText` (Meta `/responses`, Baseten `/chat/completions`). Uses `redirect: "error"`, `AbortSignal.timeout`, typed `InferenceError`, and redacted, truncated error detail.

### `packages/intake/` — recording intake and consent (C2A)
No network. `validateVideoFile` verifies, in order: path safety (no `..`/NUL/symlinks, optional allowed root checked lexically *before* touching the filesystem) → size ≤ 25,000,000 bytes (before reading) → real container signature (MP4 brands; WebM is refused and must be converted locally; extension must agree) → streaming copy+SHA-256 into a private temp dir (0700/0600, always removed) → `ffprobe` metadata (H.264, one video stream, dimensions, duration ≤ 30 s, container/stream durations must agree) → full `ffmpeg` decode pass (any decoder output is corruption: `ffprobe` alone accepts truncated MP4). Failures are typed `MediaError`s. `readVerifiedVideoBytes` re-checks size, signature and SHA-256 immediately before upload. `convertWebmToMp4` transcodes a local Playwright WebM exclusively (no overwrite) and deletes the output if it fails validation. `VideoConsent` is bound to run ID, provider and the video's SHA-256.

### `packages/core/src/symptom.ts` — model output as hypothesis (C2A)
`Symptom` (observations with timestamps, tentative reproduction steps, expected/actual, confidence, uncertainties, unsupported claims, `sufficientContext`). `parseSymptom` is a strict local validator: unknown keys, wrong types, oversize or control-character strings, timestamps outside the clip, and contradictory claims are rejected; `provenance: 'model-hypothesis'` is set by code, never by the model. `assessSymptom` decides, without any model, whether a real reproduction attempt is worthwhile. Nothing here can yield `VERIFIED`.

### Muse Spark video analysis (C2A, `packages/inference`)
`analyzeRecording`: consent → byte re-verification → `POST /files` (multipart, `purpose=user_data`, `expires_after`, file last) → `POST /responses` (`input_file` by file id, `text.format` json_schema strict) → local `Symptom` validation → `DELETE /files/{id}` in `finally`. Pre-flight problems (consent, validation, opt-ins, config) throw typed errors before any network call. Post-upload provider/schema failures return `ANALYSIS_FAILED` with provenance. Upload and generation are never retried (duplicate remote copy / double billing). Two opt-ins are required in addition to consent: `PROOFPILOT_ALLOW_BILLABLE_CALLS=1` and `PROOFPILOT_ALLOW_VIDEO_UPLOAD=1`. `pnpm analyze:video` defaults to a dry run that makes no network call.

**Verified vs. assumed.** Verified against Meta's docs on 2026-10-27: the Files API request and response (`file`, `purpose`, `expires_after[anchor|seconds]`, `file-…` ids, `DELETE /v1/files/{id}`), MP4-only video, and `input_file` referencing in Responses. **Assumed (OpenAI-compatible, not shown in the docs): the exact Responses `text.format` wrapper (`type/name/schema/strict`) and the response `output[].content[].output_text` shape.** These are covered by mocks only; the first live smoke must confirm them. Real inference is NOT TESTED.

### `scripts/`
- `f01-record.ts`: records genuine Chromium videos of the unmodified fixture (390×844 mobile defect clip with two taps; 1280×800 desktop control), converts to MP4 through the intake code, extracts reference frames, and writes `recording.json` with SHA-256s. Same exact-SHA rule as the baseline runner (exit 2 if evidence paths are dirty).
- `analyze-video.ts`: thin wrapper over `packages/inference/src/analyze-command.ts`.
- `f01-baseline.ts`: runs the oracle with a scrubbed env into a fresh run directory, classifies it, hashes every artifact, and writes `baseline-summary.json`, `metrics.json`, and `.proofpilot/metrics.jsonl`.
- `inference-status.ts`: config status, plus `--discover` (non-billable `GET /models`).
- `lint.mjs`: policy lint. `validate_project_profile.py`: template baseline validator.

## Impact instrumentation

Recorded per baseline run, observed values only (`packages/core/src/metrics.ts`):

| Metric | Definition |
|---|---|
| `bugReproductionMs` | Playwright duration of the mobile oracle test (navigate → tap → failing assertion) |
| `verificationExecutionMs` | Wall clock of the oracle process (fixture start, both tests, teardown) |
| `results.baselineFailure` | Classifier verdict |
| `results.regression` | Desktop control PASS/FAIL/NOT_RUN |
| `totalWorkflowMs` | Wall clock of the whole workflow named by `workflowScope`. In C1 this is `baseline-reproduction-only`, because there is no patch/verify stage yet. |

There are no fields for estimated or comparative savings. Any future comparison must come from separately measured runs.

## External integrations

| Integration | Purpose | Authentication | Failure behavior |
|---|---|---|---|
| Meta Model API `https://api.meta.ai/v1` | `muse-spark-1.3` visual analysis, `muse-wonder-1.0` patch proposal | `MODEL_API_KEY` (server-side env) | Typed error → run becomes `ANALYSIS_FAILED`/`INCONCLUSIVE`; no silent fallback |
| Baseten `https://inference.baseten.co/v1` | Optional `meta-models/muse-spark-open-1026` | `BASETEN_API_KEY` | Same; used only when explicitly selected |

## Trust boundaries

- Patch agent ↔ verifier: the patch agent may write only `fixtures/<id>/src/**` (`config/patch-policy.json`). `verifier/`, `packages/`, `tests/`, `scripts/`, `config/`, CI and lockfiles are trust roots.
- Host ↔ browser runner: the runner gets a credential-scrubbed environment and loopback-only fixture URLs.
- Host ↔ model provider: the key goes only to the allowlisted HTTPS host, with redirects refused. Model output is untrusted data.
- Planned: container isolation (no network, non-root, resource caps). Not yet implemented; container validation NOT VERIFIED — agent environment lacks Docker access.

See `docs/SECURITY.md`.

## Architectural change policy

A material architecture change should include updated documentation, risk-appropriate tests, migration/rollback considerations, and a `docs/PROJECT-MEMORY.md` entry when future agents need the rationale.

Deviation from the blueprint layout: provider adapters live in `packages/inference/` (Meta + Baseten) rather than `packages/meta/`, because both providers share one OpenAI-compatible client.
