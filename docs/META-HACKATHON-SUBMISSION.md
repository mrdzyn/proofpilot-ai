# ProofPilot AI — Meta Global AI Developer Hackathon (Push the Frontier): submission pack

> **Status: DRAFT for owner review.** Everything below states only what the repository and its saved evidence support as of `main@b841740a95ebd39cabb47fa73ea1329803f79d88` (PR #24 squash merge, October 31, 2026). Items marked **PENDING** are not verified. Nothing here is a claim that a model-generated fix has been verified: the one real Muse Spark proposal is `UNTRUSTED PROPOSAL — NOT VERIFIED` (see `docs/LIVE-C3-01-EXECUTION-REPORT.md`). The `VERIFIED` label appears only for the hand-authored control PC-1, never for model-originated work.

## 1. Deadline and fields

- **Deadline (organizer-confirmed by the owner):** **November 4, 2026, 9:00 PM Eastern Time = November 5, 2026, 10:00 AM Philippine time.** Internal target: Nov 4 PHT.
- **Additional submission fields, file formats, video length / hosting rules, eligibility, judging criteria, licence or open-source requirements, team and disclosure fields:** **PENDING.** They must be verified in the signed-in event portal or the official rules before submission; this pack does not assume any of them. The demo length below (2 to 3 minutes) is a *proposal*, not a stated event requirement.

## 2. One-sentence pitch

**ProofPilot AI doesn't just ask an AI to fix a UI bug; it makes the fix prove itself, by re-testing every candidate in a fresh browser against acceptance checks the AI can neither see nor change.**

## 3. Problem, solution, why it matters

- **Problem.** AI coding agents routinely claim a bug is fixed. Reviewers have no cheap way to tell a real fix from a plausible edit, and the agent that wrote the patch often also wrote (or can see) the check that blesses it.
- **Proposed solution.** Turn a short screen recording of a UI defect into (1) an observed, reproducible browser failure, (2) a model-generated *hypothesis* of what is wrong and a *proposal* for a minimal change, and (3) an independent verdict from a trusted oracle that the proposing model cannot read or modify. Verdicts come only from deterministic code, never from model text.
- **Why it matters.** It separates "an AI said so" from "a trusted test observed it", with hashed evidence anyone can re-check, and it treats model output as untrusted data with explicit trust boundaries and spend limits.

## 4. Meta Muse Spark's actual role (what really ran)

| Use | Model | What happened | Evidence |
|---|---|---|---|
| **Video understanding** | `muse-spark-1.3` via the Meta Model API (Files + Responses with a native video input) | Two single-use live smokes (C2B). Run 001 ended PARTIAL (`ANALYSIS_FAILED`); run 002 returned a completed analysis of the 10.04 s mobile recording: a validated, *untrusted* `Symptom` hypothesis (tap on Add to cart does not change the cart count), usage 2,773 input / 1,129 output (665 reasoning) tokens | `.proofpilot/analysis/c2b-live-smoke-002/analysis.json` (local, gitignored); `docs/LIVE-SMOKE.md` |
| **Fix proposal** | `muse-spark-1.3` | One approved request (LIVE-C3-01): text-only, strict JSON schema, low reasoning, 3,072-token cap, no retry. Returned one adjustment, `.promo-overlay { pointer-events: none }`, accepted by the closed-grammar validator; 670 input / 630 output (601 reasoning) tokens; response id `7cb1e5e2-3d88-42ab-9652-fcab88b690d8` | sanitized artifact (local); `docs/LIVE-C3-01-EXECUTION-REPORT.md` |

Muse Spark proposes; it never judges. The proposal **has not been verified in a browser** and it is **identical in value to a hand-authored control (PC-1)** that was verified earlier; that identity is not evidence for the model. Actual billing: **unverified**.

## 5. Architecture and trust boundaries

```text
screen recording (synthetic F01 store)
  -> intake: container / size / duration / codec / decode validation, per-run consent
  -> Muse Spark video analysis  ---------------------------> Symptom   (UNTRUSTED hypothesis, strict local validation)
  -> certified F01 baseline (trusted oracle reproduces the failure at an exact, clean SHA)
  -> deterministic request builder (<= 12,000 chars; hash-bound)
  -> fail-closed authorization chain (owner decision register, pinned activation revision,
     single-use operator approval, credential, lifetime quota) -> ONE Meta request
  -> strict validation (explicit "completed", exact model, closed-grammar parser)
  -> sanitized artifact: UNTRUSTED PROPOSAL - NOT VERIFIED          [STOP: not staged, not executed]

separately, offline, no model:
  hand-authored candidates -> disposable stage -> unmodified oracle (verifier/) x 3 fresh replays
  -> deterministic verdict -> hashed evidence -> independent re-check -> scoreboard
```

Trust boundaries (each enforced in code and covered by tests):
- `verifier/` (the oracle) is a trust root the patching side cannot read or write; verdicts (`VERIFIED`, `PATCH_FAILED`, ...) come only from deterministic code.
- Model output is data: strict parsing, closed CSS grammar, host-rendered CSS only; nested provider metadata rebuilt from allow-lists; no raw provider text or credentials stored.
- Live inference is gated by independent layers: an owner decision register, a lifetime quota constant, an owner-pinned activation revision with pin-only ancestry, a single-use operator approval bound to the run, input hash and revision, a real-TTY owner command with typed confirmation, and a credential injected only for that invocation. Failed or uncertain attempts are spent, never retried.
- The staging harness is a spike, **not a sandbox**; the proposal path stops at the artifact.

## 6. What works today vs what is not done

| Works (evidence in repo / saved locally) | Not implemented, not verified, or not approved |
|---|---|
| F01 defective sample store + trusted oracle: the mobile oracle fails by interception, the desktop control passes; deterministic baseline classifier; exact-SHA certification | **Execution of the real Muse Spark proposal through the verifier: not approved** (procedure defined but DISABLED in `docs/C3B2B-REAL-PROPOSAL-PROCEDURE.md`; the operator command and the exported E2 verifier both hard-refuse `c3-live-meta-001` in code) |
| Genuine mobile/desktop recordings; media validation; per-run consent | Any model-verified fix claim. The existing `VERIFIED` row is the **hand-authored** PC-1 only — model-originated work is never labelled `VERIFIED` |
| Real Muse Spark video analysis (one completed run of two attempts) with strict local validation; one real, gated Meta proposal call, accepted as an untrusted artifact | Report UI (UI-C3-01), hosted/Modal sandbox (HOST-C3-01): **not approved**. Baseten: config only, **not tested, not approved** |
| Offline coordinator (merged PR #22): hand-authored controls NC-1, NC-1b, NC-3, NC-5, NC-6, NC-7 and PC-1 (`VERIFIED`, 3 of 3 fresh replays); independently re-checked scoreboard (sanitized example `docs/examples/c3-b1-scoreboard.example.json`); model-proposal registration/verification infrastructure (E1/E2) merged, synthetic-only, real artifact hard-refused | A second Meta call (lifetime quota spent; needs a new owner decision, activation and pin). Historical enrollment of the stored artifact (owner-operated prerequisites per `docs/SEC-P2-02-ISOLATED-VERIFICATION-RUNBOOK.md`): decision open |
| QA-01 operator QA (merged PR #23): runbook `docs/QA-01-RUNBOOK.md`; owner-run evidence PASS against `main@f305da3` (F01 REPRODUCED, PC-1 VERIFIED 3/3, DID-1 PASS, zero provider calls) | An independently verified OS/container sandbox (required before any HTML / JavaScript / free-form patch could ever run) |
| SEC-P2-01 read-boundary security (merged PR #23) and SEC-P2-02 artifact authenticity (merged PR #24): Ed25519 detached manifest authentication, isolated-verification runbook, adversarial synthetic tests with guard-removal proof | Same-UID writer residual and historical origin of the unsigned stored artifact: NOT accepted without the owner-operated prerequisites (owner decision open) |
| Hosted CI (lint, typecheck, unit, security, baseline) on every merged PR #19–#24; independent GPT-6 audits of each milestone | Real-browser staging tests in hosted CI (local only); a cost figure (actual billing unverified) |

## 7. Actual execution results and evidence

- **C3-B1 offline controls (agent-run, locally; run `c3-b1-20261028T080446Z-7091e5`, approved SHA `358c273`):** baseline gate REPRODUCED; NC-1, NC-1b, NC-3 `PATCH_FAILED`; NC-6 and NC-7 `INCONCLUSIVE` (faults injected); PC-1 **`VERIFIED` 3/3** (three fresh stages, three distinct nonces); NC-5 `NOT_REPRODUCED`; saved evidence independently re-checked by a separate script. Scope of that `VERIFIED`: *the hand-authored PC-1 passes the unmodified F01 oracle in 3 fresh staged replays under that SHA.*
- **C2B live video analysis:** run 002 completed (details in section 4).
- **LIVE-C3-01 (operator-run, October 29, 2026 17:03 UTC):** `PROPOSAL_ACCEPTED`, lifecycle `completed`, 1,300 tokens, one adjustment, `UNTRUSTED PROPOSAL — NOT VERIFIED`. Facts are labelled verified / recomputed / operator-reported in `docs/LIVE-C3-01-EXECUTION-REPORT.md`; the input hash and size were independently recomputed from the certified local evidence.
- **QA-01 (merged PR #23; owner-run evidence against `main@f305da3`):** F01 baseline REPRODUCED with exact-SHA certification, hand-authored PC-1 `VERIFIED` 3/3 with independent scoreboard re-verification OK, DID-1 PASS, zero provider calls, clean worktree. Procedure: `docs/QA-01-RUNBOOK.md`.
- **SEC-P2-01 (merged PR #23) + SEC-P2-02 (merged PR #24):** bounded P2 reader (ancestor pinning, descriptor↔path binding, `ARTIFACT_CHANGED` reload) and Ed25519 detached manifest authentication (`packages/provenance/src/artifact-auth.ts`, `scripts/c3-b2b-verify-authenticated.ts`) with adversarial synthetic tests and guard-removal proof; runbooks `docs/SEC-P2-01-FINDINGS.md` and `docs/SEC-P2-02-ISOLATED-VERIFICATION-RUNBOOK.md`. Synthetic fixtures and offline tests only; the stored proposal was never read, loaded, staged or executed; the same-UID residual and historical origin stay NOT accepted (owner decision open).
- **Engineering evidence:** hosted CI green on each merged milestone PR; independent exact-head GPT-6 audits; unit + security suites and guard-removal ("mutation") checks for each safety boundary (counts in the milestone sections of `docs/STATUS.md`).

## 8. Submission-ready descriptions

**Project title:** ProofPilot AI

**Tagline:** Don't just fix the bug. Prove it's fixed.

**Short (about 60 words):**
ProofPilot AI makes AI bug fixes prove themselves. From a screen recording of a UI defect it reproduces the failure in a real browser, uses Meta's Muse Spark to analyze the video and propose a minimal change, then treats that proposal as untrusted data. Verdicts come only from a trusted test oracle the model cannot see or edit, with hashed, re-checkable evidence and hard spend limits.

**Long:**
Every AI coding agent claims it fixed the bug. ProofPilot AI makes Meta's models prove it. The project starts from a short recording of a UI defect on a synthetic store (a promo overlay silently intercepts the mobile "Add to cart" tap). A trusted Playwright oracle reproduces the failure at an exact, clean commit and checks a desktop control. Muse Spark 1.3 (Meta Model API) watches the recording natively and returns a structured description of the symptom; ProofPilot validates it strictly and treats it as a hypothesis. A deterministic request is then sent, once, to Muse Spark for a minimal fix expressed in a closed CSS grammar; the answer is parsed by host code, rendered by trusted constants, and stored as an artifact labelled "UNTRUSTED PROPOSAL — NOT VERIFIED".

The core idea is the separation of roles. The model proposes; deterministic code decides. The oracle lives in a trust root the proposing side cannot read or change; candidates run in disposable stages; a candidate is `VERIFIED` only after a certified baseline and three fresh, hash-verified replays; and an honest scoreboard reports failures as plainly as successes. The live call itself passed through a fail-closed authorization chain (owner decision, pinned activation revision, single-use operator approval, lifetime quota of one attempt, secret injected only for that run) and the project documents exactly what has and has not been shown.

Today the offline verification pipeline is proven with hand-authored controls (including a hand-written correct fix verified three times), and the real Muse Spark proposal has been obtained and validated. Running that proposal through the same verifier is the next, separately approved step; until then the proposal is reported as unverified, even though its adjustment happens to equal the verified hand-authored control.

**Technical architecture summary (for the portal technical field):** a synthetic F01 store plus a trusted Playwright oracle (`verifier/`, a trust root the patching side cannot read or write); container/signature/codec/decode intake validation with per-run consent; Muse Spark native video analysis returning a strictly validated, untrusted `Symptom`; a certified exact-SHA baseline reproduced at the merge commit; a deterministic request builder (bounded input, hash-bound); a fail-closed authorization chain (owner decision register, pinned activation revision, single-use operator approval, real-TTY owner command, per-run credential injection, lifetime quota of one, retries hard-zero); strict response validation (explicit `completed`, exact model match, closed CSS grammar, host-rendered CSS only); a sanitized artifact labelled `UNTRUSTED PROPOSAL — NOT VERIFIED`; and, separately and offline, disposable-stage candidate verification (baseline gate, three fresh replays, `decideVerification`, hash-bound evidence, independently re-checked scoreboard) with Ed25519 detached manifest authentication readiness (SEC-P2-02) for the isolated-verification path.

**Meta usage explanation (for the portal Meta-tech field):** Meta's Model API is the only model provider exercised — three attempts ever, across two uses. (1) Native video understanding: two single-use runs over the 10.04 s mobile recording (run 001 ended `incomplete` at `max_output_tokens` and was discarded; run 002 `completed` and returned a schema-valid symptom hypothesis, 2,773 in / 1,129 out tokens). (2) One separately approved fix-proposal request under LIVE-C3-01 — text-only, strict `json_schema`, low reasoning, 3,072-token cap, zero retries — returning one closed-grammar CSS adjustment (670 in / 630 out tokens). Lifetime quota spent, actual billing unverified. Muse Spark proposes; it never judges — every verdict comes from deterministic host code. No other Meta model, endpoint or service is used; Baseten-hosted Muse Spark Open is config-only and untested.

**Judging-oriented highlights:**
- Separation of powers a judge can re-check: the model never touches the oracle, the evidence is hashed, and the scoreboard is re-verified from persisted bytes — trust is recomputable, not asserted.
- Honest negatives: wrong and empty patches are shown failing (`PATCH_FAILED`), fault-injected runs are shown inconclusive, and the model's own proposal is shown unverified — the system reports misses as plainly as hits.
- Fail-closed spending: one approved attempt, single-use approval, pinned activation, zero-retries, spent quota, and a repository that now refuses further live attempts by construction.
- Security depth without a sandbox claim: hand-authored-only execution, no model HTML/JS ever runs, read-boundary hardening plus manifest authentication, and every residual explicitly declared open instead of silently accepted.
- Hand-authored vs model-originated provenance is a first-class, code-enforced distinction (separate board sections and provenance labels for model-originated rows, identity-checked registration, hard refusal of the real artifact) — `VERIFIED` can never leak from a control to a proposal. No model row exists or is verified today: the real proposal lives only in the execution report as UNTRUSTED — NOT VERIFIED.

## 9. Demo-video storyboard (2 to 3 minutes; a proposal, not an event requirement)

> Canonical storyboard with exact timestamps, full narration, screen/terminal actions,
> captions, fallback clips and macOS recording instructions:
> `docs/META-DEMO-RECORDING.md`. The table below is the beat summary.

| Time | Beat | Show (all exists today) | Honesty note |
|---|---|---|---|
| 0:00 to 0:15 | Hook: "Every AI agent says it fixed the bug. Can it prove it?" | Title card + one-line pitch | none |
| 0:15 to 0:40 | The defect | The 10 s mobile recording: tap Add to cart, cart stays 0; the desktop control works | Synthetic fixture, said aloud |
| 0:40 to 1:05 | Muse Spark watches the video | Terminal/analysis summary of run 002: symptom text, token usage | It is a hypothesis; one completed run |
| 1:05 to 1:30 | Trusted reproduction | `pnpm f01:baseline`: oracle fails as intended, REPRODUCED, desktop PASS, certified exact SHA | Oracle is code the model cannot see |
| 1:30 to 1:55 | The proposal | The sanitized artifact: label `UNTRUSTED PROPOSAL — NOT VERIFIED`, one adjustment, 1,300 tokens | State plainly: not yet verified |
| 1:55 to 2:25 | How a fix earns trust | The existing scoreboard: negative controls fail as they should; the hand-authored PC-1 is `VERIFIED` 3/3 in fresh stages | Say "hand-authored", and that the model's identical value is *not* verified |
| 2:25 to 2:50 | Guardrails | The gate refusing (offline preflight + HARD-DISABLED refusal drill), single-use quota spent, no credential in artifacts | Do not run any live call on camera |
| 2:50 to 3:00 | Close | Repo link, "next: verify the model's proposal" | If C3-B2B is completed and audited before recording, replace beats 5 to 6 with the real result, whichever way it falls |

## 10. Demo recording checklist and fallback

> Executable checklists: preparation in `docs/META-DEMO-CHECKLIST.md`, claim-by-claim QA
> in `docs/META-DEMO-QA-CHECKLIST.md`. The summary below is retained for continuity.

- [ ] Work from a clean checkout of the submitted commit; `git status` clean.
- [ ] Record only local, offline actions. **No live provider call on camera** (the lifetime quota is spent and the activation is no longer eligible after this documentation merge).
- [ ] Pre-run and keep: `pnpm f01:baseline` output, the C3-B1 scoreboard (or the sanitized example), `node scripts/c3-live-proposal.ts --analysis c2b-live-smoke-002 --preflight` output if still meaningful (it will report a refused gate), the artifact view with sensitive paths hidden.
- [ ] Hide or redact: API keys, `.env.local`, approval and reservation files, absolute home paths, account identifiers.
- [ ] Say aloud: synthetic fixture; Muse Spark's proposal is unverified; PC-1 is hand-authored; actual cost unverified.
- [ ] Captions / on-screen labels for every status word used (`REPRODUCED`, `PATCH_FAILED`, `VERIFIED`, `UNTRUSTED PROPOSAL`).
- [ ] Check length, resolution, codec and hosting against the portal rules (**PENDING**).
- **Fallback plan:** if the live terminal run misbehaves, use pre-recorded clips of the same commands; if the browser cannot run, use the sanitized `docs/examples/c3-b1-scoreboard.example.json` and screenshots from the saved evidence; if the video cannot be uploaded, host it per the portal's accepted options (**PENDING**) and provide the repository README walkthrough as the text fallback.

## 11. Links and placeholders

| Item | Value |
|---|---|
| Repository | https://github.com/mrdzyn/proofpilot-ai (confirm public / access rules: **PENDING**) |
| Demonstration video | **PLACEHOLDER** — `<VIDEO_URL>` (record per `docs/META-DEMO-RECORDING.md`, QA per `docs/META-DEMO-QA-CHECKLIST.md`) |
| Project submission page | **PLACEHOLDER** — `<PORTAL_SUBMISSION_URL>` |
| Submitted commit | `b841740a95ebd39cabb47fa73ea1329803f79d88` (PR #24 squash merge; update if a later commit supersedes this pack) |
| Demo anchor | `docs/META-DEMO-RECORDING.md` + `docs/META-DEMO-CHECKLIST.md` + `docs/META-DEMO-QA-CHECKLIST.md`, all anchored to the submitted commit above |
| Team / contact / eligibility fields | **PENDING** |

## 12. Known risks and disclosure statements

- **Disclose:** the project is a hackathon prototype on a synthetic fixture; Muse Spark 1.3 was used for video analysis (C2B, two runs) and for exactly one fix proposal (LIVE-C3-01); the proposal is unverified; `VERIFIED` appears only for a hand-authored control; AI coding assistance (Claude Code) wrote much of the implementation and independent AI audits (GPT-6) reviewed it, under owner-controlled gates (describe per the event's AI-use rules: **PENDING**); no customer data; billing amount unverified.
- **Risk — judges may assume the Muse Spark fix is verified.** Mitigation: the label, the storyboard notes and section 6.
- **Risk — real-proposal verification not approved before the deadline.** Mitigation: ship the honest "proposal obtained, verification next" story (E1/E2 infrastructure merged synthetic-only in PR #22; authenticated-verification readiness merged in PR #24; real execution needs the separate execution approval, the residual/enrollment decisions and an independent security review). If approval lands, update this pack from the real result, whichever way it falls.
- **Risk — the staging harness is a spike, not a sandbox.** Disclosed; no model-authored HTML / JavaScript ever runs.
- **Risk — operator-reported items** in the execution report are not independently observable from the artifact.
- **Risk — live path ineligible after this documentation merge** (non-pin-only descendant of the pinned activation commit): intended and consistent with the spent quota; any further live attempt needs a new decision, activation and pin.
- **Risk — time.** About 4 days remain at the time of writing (October 31 PHT; deadline Nov 5, 10:00 AM PHT).

## 13. Final submission checklist

- [ ] Event portal rules read; required fields and formats listed (**PENDING**)
- [ ] Decide and record whether to approve real-proposal verification before the deadline (separate execution approval + residual/enrollment decisions + independent security review required)
- [ ] README "Current state" matches this pack (minimal corrections proposed in this slice)
- [ ] `docs/STATUS.md` matches reality; final commit SHA recorded (`b841740` unless superseded)
- [ ] Hosted CI green on the submitted commit and on this demo-pack Draft PR
- [ ] Demo video recorded per `docs/META-DEMO-RECORDING.md`, reviewed per `docs/META-DEMO-QA-CHECKLIST.md`, uploaded; URL recorded
- [ ] Repository access / licence per the rules (**PENDING**)
- [ ] Disclosures (AI use, synthetic data, unverified proposal, unverified cost, hand-authored vs model-originated provenance) included in the description
- [ ] Submission made before **Nov 5, 10:00 AM PHT** (Nov 4, 9:00 PM ET); confirmation saved
