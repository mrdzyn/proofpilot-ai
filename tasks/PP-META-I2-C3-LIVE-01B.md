# PP-META-I2-C3-LIVE-01B — owner-approved activation implementation (one Meta proposal attempt)

- **State:** Implemented on a Draft PR; independent exact-head review pending. **Not merged. No provider request has been made.**
- **Base:** protected `main` at `c7e18d318c29ed60014b1f48b6375c29a5640a69` (C3-LIVE-01B-PREP, PR #13, squash-merged after an independent GPT-6 PASS).
- **Working branch:** `phase/pp-meta-i2-c3-live01b-activation`
- **Owner decision:** LIVE-C3-01 **APPROVED for activation preparation**, October 29, 2026 — https://github.com/mrdzyn/proofpilot-ai/pull/6#issuecomment-6496850990 (quoted verbatim in `docs/LIVE-C3-01-DECISION-RECORD.md`).
- **Parent contracts:** `tasks/PP-META-I2-C3.md`, `tasks/PP-META-I2-C3-LIVE-01A.md`, `tasks/PP-META-I2-C3-LIVE-01B0.md`, `tasks/PP-META-I2-C3-LIVE-01B-PREP.md`.
- **Implementation agent:** Claude Code; independent reviewer: GPT-6; owner: repository owner.

> **THIS AUTHORIZES IMPLEMENTATION AND INDEPENDENT REVIEW ONLY.** It does not authorize a provider request, a merge, a deployment, the activation revision pin, an operator approval, or reading a credential. The activation revision pin is **NOT RECORDED** (`config/live-activation.json` stays `activation: null`); the real provider invocation is **NOT AUTHORIZED YET**. C3-B2B, UI-C3-01 and HOST-C3-01 remain **NOT APPROVED**. Baseten and Modal remain unauthorized.

## Objective

Make the first Meta Muse Spark 1.3 proposal attempt *possible but gated*: record the owner's decision, set the lifetime Meta quota to 1, route the production entry point exclusively through the audited runner, and provide the single owner-operated command, so that the only things left between this code and a request are the operational gates below. The empty activation pin independently prevents any request until the owner pins the reviewed activation revision in a separate commit.

## Delivery mode

UI design gate: Not applicable. Backend/tooling only.

## What changed

1. **Decision record.** `docs/LIVE-C3-01-DECISION-RECORD.md` records the owner comment (link, date, verbatim text, exact values); `tasks/PP-META-I2-C3.md` links it. `config/live-authorization.json` holds **exactly one non-synthetic** LIVE-C3-01 decision with the approved values and the comment URL as its reference. No operator approval is recorded. `config/live-activation.json` is unchanged (`activation: null`).
2. **Quota.** `APPROVED_LIVE_QUOTA` is `{ meta: 1, baseten: 0 }`: a **lifetime** total of one attempted Meta call, not per run. Failed, timed-out, interrupted and uncertain attempts stay permanently spent (claims are never released). A positive quota authorizes nothing by itself.
3. **Guarded entry point.** `proposeCandidate({ runId, request })` delegates only to `runProductionProposalAttempt` (one lazy import, two fields read). Sequence preserved: credential-free pre-flight → read-only production authorization → Meta credential validation / provider construction → fresh authorization and single-use approval consumption → reservation claim → one provider request → strict response validation → sanitized artifact → best-effort settlement → STOP. No alternative production path; the synthetic runner stays isolated; no caller-controlled root, provider, transport, Git probe, store, credential, quota, clock or evidence directory.
4. **Provenance gate** (`live-input.ts`, read-only, offline). The real input is derived from persisted evidence and re-verified: trusted F01 facts from a **certified** baseline run for exactly the current HEAD and fixture tree (every artifact re-hashed, the artifact set must equal the recorded set, the verdict is **re-derived** from the oracle report and its observation attachments); the validated Symptom from a **live** C2B analysis whose video is bound by SHA-256 (and re-hashed on disk) to a certified exact-SHA mobile-defect recording of the current fixture, re-validated with `parseSymptom` and `assessSymptom`. Synthetic preflight literals and caller-supplied "trusted facts" are not accepted anywhere in the live path. If the evidence cannot be validated the command refuses (nothing is sent). Residual limit: local disk write access defeats any file-based provenance; this layer detects corruption, staleness and mix-ups and binds the evidence to the revision, and the operator still approves the exact input hash.
5. **Owner CLI** `scripts/c3-live-proposal.ts` (logic in `live-proposal-cli.ts`): real TTY required; `--analysis <live C2B analysis run id>` (required), `--run-id` (default `c3-live-meta-001`), `--preflight` (verify, show the exact input SHA-256 and size and the exact `c3-approve-live-run.ts` command, evaluate the gate read-only, send nothing), `--show-prompt`. No loop, batch, retry, fallback, provider, model, limit, credential or root option; arguments are strict. It rebuilds the request with `buildProposalRequest`, displays the hash and size, requires a **clean tree**, evaluates the production gate read-only (the independent operator approval for this exact run and hash is mandatory; the CLI's own typed confirmation is additional, never a substitute), then asks for the exact phrase `SEND ONE META REQUEST <runId> <hash12>`, makes **one** call to `proposeCandidate`, prints only sanitized status, response id, usage, lifecycle and the artifact location, and exits. It never reads or prints a credential, raw provider text or exception text.
6. **Hardening found while testing.** `git-probe.ts` ran `git` with the full inherited environment, which put the provider key into the child process environment and let `GIT_DIR`/`GIT_WORK_TREE` redirect the probe. It now uses an allow-listed environment. (A caller still cannot supply a probe; this removes an environment-based influence and a credential exposure.)
7. **Retargeted tests** (strengthened, none weakened; each states what replaced the old claim): "quota zero" and "always disabled" assertions became "positive quota, registered decision and enabled wiring are powerless without every authorization", proven in a disposable install copy with the **shipped** quota constant and the **shipped** decision (only the activation pin and approvals are fixtures). The readiness preflight no longer asserts "frozen at zero"; it asserts the approved constant (Meta 1, Baseten 0), that a malformed call is rejected before the gate, and it never invokes the production entry point with a well-formed request.

## Gates that remain (all operational; none performed here)

After this Draft PR passes the independent GPT-6 exact-head audit:

1. The owner separately approves the squash merge.
2. The merge produces the reviewed activation commit **A**.
3. The owner computes A's digest with `node scripts/c3-activation-digest.ts <A>`.
4. A separate reviewed **pin-only** commit **A′** records A and its digest in `config/live-activation.json`.
5. Independent verification of A′ and a clean checkout of A′.
6. On the clean A′ checkout the owner runs `pnpm f01:baseline` (certified evidence for exactly this HEAD) and `node scripts/c3-live-proposal.ts --analysis <id> --preflight` (zero network) and confirms the displayed input hash.
7. The owner creates the real single-use operator approval with `node scripts/c3-approve-live-run.ts --run-id <id> --input-sha256 <hash> --input-chars <n>` in a real terminal.
8. The owner injects the Meta credential securely into the environment of that one invocation.
9. The owner separately authorizes execution of one request.
10. The sanitized outcome is recorded and everything stops. No second attempt exists without a new owner decision.

## Forbidden scope (unchanged and observed)

Any Meta, Baseten or Modal request; reading a real credential; a genuine operator approval; recording the activation pin; executing, staging or verifying model-generated CSS; changes to `verifier/`, `fixtures/`, `config/patch-policy.json`, the grammar, `candidate-stage.ts`, the coordinator, CI workflows; the report UI; deployment; merging.

## Acceptance

1. Targeted unit, security and install-copy suites pass with mocked transport only; hosted CI passes.
2. Guard-removal tests on the empty-pin lock, the provenance gate, the one-call boundary, the confirmation and the sanitization.
3. Zero provider requests and no credential read during validation; certified F01 baseline and C3-B1 `VERIFIED` unchanged.
