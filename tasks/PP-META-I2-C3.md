# PP-META-I2-C3 — Verified candidate scoreboard for F01 (hackathon pivot)

- **State:** DRAFT, revision 2. **Not started. Not approved.** Remediates GPT-6 audit [issuecomment-6450106731](https://github.com/mrdzyn/proofpilot-ai/pull/6#issuecomment-6450106731) and Codex inline findings 4392457764 (design gate) and 4392457775 (NC-4) on PR #6.
- **Base:** protected `main` at `5658529319032236fcddb472a617fbdc5cf9aadd` (C2B docs closure, PR #5, merged). This contract is reviewed in PR #6 (branch `docs/pp-meta-i2-c3-pivot`).
- **Implementation branch (future):** `phase/pp-meta-i2-c3`, cut from `main` only after the start gates below are met.
- **Implementation agent:** Claude Code; **independent reviewer:** GPT-6; **owner:** repository owner.
- **Supersedes:** the Muse Wonder patcher, Docker-isolated verifier and five-screen UI of the v1.1 plan.

## Decision register (nothing below is in force until approved)

| ID | Decision | Status | Who must act |
|---|---|---|---|
| SEC-C3-01 | Execute model *proposals* only as trusted-host-rendered, closed-grammar CSS adjustments for F01 ("Execution boundary" below) | **NOT APPROVED** | Owner records approval; GPT-6 accepts the exact head |
| LIVE-C3-01 | Live-call quantities: at most 12 `muse-spark-1.3` proposal calls, at most 4 Baseten `muse-spark-open-1026` calls | **NOT APPROVED** (proposed maximums, not targets) | Owner records exact numbers |
| UI-C3-01 | One-page static report layout (`design/screens/PP-C3-REPORT-CONTRACT.md`) | **PENDING owner design approval** | Owner |
| MODEL-C3-01 | Muse Spark patches; Muse Wonder is not a dependency | Proposed; Wonder's role UNVERIFIED | Owner may ask in `#office-hours` |

**What counts as approval.** An earlier chat "yes" is not a reviewable authorization and is not relied on. Approval of SEC-C3-01, LIVE-C3-01 or UI-C3-01 is valid only when the owner records it in a reviewable form (a dated block committed to this file, or a PR #6 comment that is quoted verbatim and linked from this file) and names the exact decision ID and values. An approval never covers a different value than the one it names, and merging this document approves nothing.

### Owner approval record

| Decision | Approved by / date / link | Exact values approved |
|---|---|---|
| SEC-C3-01 | _none recorded_ | _none_ |
| LIVE-C3-01 | _none recorded_ | _none_ |
| UI-C3-01 | _none recorded_ | _none_ |

## Objective

Show, with real Meta model calls and the existing trusted oracle, that ProofPilot can take the genuine F01 recording and its validated `Symptom`, ask `muse-spark-1.3` for several candidate fixes, run each valid candidate against the trusted oracle, and publish an honest scoreboard of which candidates fix the bug, with hashed evidence and a static report.

Pitch: *Every AI coding agent claims it fixed the bug. ProofPilot makes Meta's models prove it.*

## Start gates for C3 implementation

C3-A may start only when all of these hold: (1) GPT-6 re-audit of this contract is PASS at the exact head; (2) the owner has merged this PR (an agent never merges); (3) SEC-C3-01 is approved and recorded (otherwise no candidate executes and only the zero-network parts may proceed); (4) the implementation branch is cut from the merged `main`. LIVE-C3-01 must be approved before any billable call. UI-C3-01 must be approved before any report UI is built.

## Existing verifier facts the design must respect (read from `main`)

- `verifier/playwright.config.ts` computes `repoRoot` as the parent of its own directory. Evidence goes to `PROOFPILOT_EVIDENCE_DIR` (default `<repoRoot>/.proofpilot/runs/adhoc`).
- The port is fixed: `port = 4173`, `baseURL = http://127.0.0.1:4173`. `webServer` runs `node fixtures/sample-store/server.mjs` with `cwd = repoRoot` and `FIXTURE_PORT=4173`. `reuseExistingServer: false`, so an occupied port fails the run. `workers: 1`, `retries: 0`, `forbidOnly: true`.
- `fixtures/sample-store/server.mjs` binds `127.0.0.1` and serves a fixed route map (`/product/demo`, `/styles.css`, `/app.js`) read from `./src/` next to the server file.
- The oracle `verifier/f01/f01.oracle.spec.ts` has two tests: `F01-MOBILE` (390×844, must add one item with a real mouse click) and `F01-DESKTOP` (1280×800, regression control). Today the mobile test fails and the desktop test passes.
- `scripts/f01-baseline.ts` runs `node_modules/@playwright/test/cli.js test -c verifier/playwright.config.ts` with `cwd = repoRoot` and a `scrubEnv` environment.
- The oracle has **no** option for an external root or another port. This contract does not claim otherwise and does not change `verifier/`.

## Execution boundary (PROPOSED: SEC-C3-01, NOT APPROVED)

Scope: fixture F01 only. A model proposal is **data**, not code. Trusted host code renders it into CSS.

1. **Output contract.** The model returns one JSON object: `{"adjustments":[{"selector":"…","property":"…","value":"…"}]}`, 0 to 4 items, no other keys at any level, no duplicate (selector, property) pair. The model supplies no HTML, no JavaScript, no free CSS text, no file path and no filename.
2. **Closed grammar.** Selector, property and value must each match this allowlist exactly (case-sensitive, no whitespace variants):

   | Selector | Properties allowed |
   |---|---|
   | `.promo-overlay` | `pointer-events`, `display`, `visibility`, `z-index`, `position`, `height` |
   | `.promo` | `pointer-events`, `display`, `visibility`, `z-index` |
   | `.add-to-cart` | `pointer-events`, `visibility`, `z-index`, `position` |

   | Property | Allowed values |
   |---|---|
   | `pointer-events` | `none`, `auto` |
   | `display` | `none`, `block` |
   | `visibility` | `visible`, `hidden` |
   | `position` | `static`, `relative`, `fixed`, `absolute`, `sticky` |
   | `z-index` | integer from -1 to 100 |
   | `height` | `0`, or an integer 1 to 100 followed by `vh`, or an integer 1 to 600 followed by `px` |

   The allowlist is deliberately permissive enough for wrong answers (for example `.promo` changes, or `.add-to-cart { pointer-events: none }`), because the scoreboard must show failures honestly.
3. **Trusted rendering.** Code does not paste model strings into CSS. It looks up each value from constant tables, formats integers itself, sorts adjustments canonically, and emits `selector{property:value}` rules (no `!important`). The block is appended after the baseline `styles.css` bytes, so same-specificity appended rules win over baseline rules, including the baseline `@media (min-width: 768px)` rule for `.promo-overlay`.
4. **Double validation.** (a) Before parsing, scan the raw proposal text for forbidden classes: `url(`, `@import`, `expression(`, `javascript:`, `<`, `>`, `{`, `}`, `;`, backslash, `/*`, quotes, `//`, `http`, `data:`. A hit is `SECURITY_BLOCKED`. (b) Parse against the grammar. A miss is `PATCH_REJECTED`. (c) After rendering, re-read the staged `styles.css` and require it to equal baseline bytes plus the canonical rendering exactly. A mismatch is `INCONCLUSIVE`.
5. **Unchanged app code.** `product.html` and `app.js` are always the approved-SHA bytes, hash-checked. No Node process executes anything derived from a proposal. The only model-influenced bytes are CSS rules built from constants and served by the trusted fixture server to headless Chromium.
6. **Broader patches stay gated.** HTML, JavaScript, arbitrary CSS or multi-file patches are neither requested from the model nor executed in this task. Any such capability requires a separate task, an independently verified OS/container sandbox, and its own approval. The requirement in `docs/SECURITY.md` is unchanged for that case.
7. **Honest limits.** This is not a sandbox. It removes model-authored executable content instead of containing it. The demo and README must say so.

## Candidate staging mechanism (feasible and testable; the spike below must confirm it)

The oracle is not redirected. Each candidate gets a complete staging workspace in which the unmodified trusted verifier runs at its normal fixed root and port.

1. **Preconditions.** Run from a clean tree whose `HEAD` is the recorded approved SHA (reuse the `readWorktreeState` check on `verifier/` and `fixtures/`). Port 4173 must be free (bind test) and no other oracle run may be active (exclusive-create lock file). Otherwise the candidate is `INCONCLUSIVE` and nothing is tested against an unknown server. Runs are strictly serial.
2. **Create the stage.** A new 0700 directory outside the repository, populated by `git archive <approvedSha> -- verifier fixtures/sample-store package.json tsconfig.json`.
3. **Verify trusted bytes.** Every staged file other than `fixtures/sample-store/src/styles.css` must match the approved-SHA blob (SHA-256 compared). Record the manifest.
4. **Write the candidate.** Trusted code writes `styles.css` as the baseline bytes plus a marker comment containing a per-candidate nonce plus the canonical rules. Record its SHA-256.
5. **Dependencies.** Provide `node_modules` by a read-only symlink to the trusted install, so the staged `verifier/playwright.config.ts` resolves `@playwright/test` from the stage. If the spike shows Playwright does not resolve one instance, fall back to a frozen-lockfile install inside the stage. The model never writes anywhere near `node_modules`.
6. **Run.** Spawn the staged `node_modules/@playwright/test/cli.js test -c verifier/playwright.config.ts` with `cwd` = the stage, a `scrubEnv` environment, and `PROOFPILOT_EVIDENCE_DIR` set to a per-candidate run directory. Because the config derives `repoRoot` from its own location, the oracle now serves the stage's `fixtures/sample-store/src/` on 4173.
7. **Prove it read the candidate tree.** Primary proof: the traced response body for `GET /styles.css` (Playwright trace, pinned version 1.64.1) contains the nonce marker and hashes to the staged file. Required behavioural proof: PC-1 flips the observed hit-test target from `promo-overlay` to `add-to-cart` and NC-1 stays identical to baseline. If trace parsing proves infeasible in the spike, the behavioural pair is the proof and the limitation is stated in the report.
8. **Recheck and clean.** After the run, re-hash the manifest and `styles.css`; any difference is `INCONCLUSIVE`. Copy evidence, hash it, remove the stage.
9. **Spike (first C3-B task, zero model calls).** Demonstrate steps 1 to 8 with a hand-written adjustment, including symlinked dependency resolution and trace-based nonce proof. If the spike fails, stop and report; do not change the oracle to make it pass.

## Candidate and run statuses

| Situation | Status |
|---|---|
| Raw proposal contains a forbidden class (step 4a) | `SECURITY_BLOCKED`, before any stage or browser exists |
| Valid JSON but outside the grammar | `PATCH_REJECTED`, nothing executed |
| Baseline not reproduced on the approved SHA | `NOT_REPRODUCED` (run level; no candidate may be verified) |
| Oracle ran, mobile or desktop test failed | `PATCH_FAILED` |
| Port busy, lock held, tamper/hash mismatch, timeout, missing or malformed evidence | `INCONCLUSIVE` |
| Oracle ran, mobile and desktop both passed | shown as `oracle PASS 1/3`; status stays `VERIFY_RUNNING` |
| The same candidate passes 3/3 fresh staged replays with intact evidence | `VERIFIED` for F01 and the tested conditions only |

The model never assigns a status. Untrusted model proposals and trusted verification evidence are stored and displayed separately.

## Proposal adapter (new, fail-closed; BLOCKER 4)

`packages/inference/src/patch-proposal.ts` is a new adapter. It does **not** call `generateText`: today `generateText` uses the configured retry count (`PROOFPILOT_INFERENCE_MAX_RETRIES` can exceed 0) and does not inspect Responses `status`, `error`, `incomplete_details` or refusal items before extracting text. That gap is recorded in `docs/SECURITY.md`; C3 must not rely on it. Requirements:

1. **Completed lifecycle only.** Accept only `status === "completed"` with no `error`, no `incomplete_details`, no refusal item, and non-empty output. Anything else fails with the C2B rule (`RESPONSE_NOT_COMPLETED` or equivalent) and still burns the reservation.
2. **No automatic retries, ever.** Every request in the adapter passes `{ retries: 0 }` regardless of provider configuration or environment. A test sets `PROOFPILOT_INFERENCE_MAX_RETRIES` above 0 and returns 429, 500 and a timeout, and asserts exactly one fetch each time.
3. **Exact-model validation.** The request model must equal the exact constant `muse-spark-1.3` (Baseten: the exact approved id) and the response `model` field must equal it byte for byte; aliases, prefixes and preview suffixes fail. No fallback to another model.
4. **Bounded usage.** Per-call bounds are fixed constants checked before reserving: maximum input characters and `max_output_tokens`, with `reasoning.effort` low. Proposed values (NOT APPROVED, owner may change): 12,000 input characters, 3,072 output tokens. The adapter records provider-reported usage; usage above the bound is recorded and flagged. A cost figure is never presented as a cap or a billed amount.
5. **One-time reservations.** Before any network call, the adapter creates a reservation file with exclusive create (`wx`) under `.proofpilot/reservations/<provider>/`, named by run ID. An existing file refuses the call. A reservation is never deleted or reused, and it is burned on every outcome including timeouts, network errors, parse failures and uncertain outcomes.
6. **Pre-authorized aggregate counter.** The number of numbered slot files `<provider>-<NN>` (each claimed by exclusive create) can never exceed the approved quantity for that provider. The configured quantity defaults to 0, so every live path is disabled until LIVE-C3-01 is recorded and the constant is set to exactly the approved number.
7. **Ordering.** Check the billable flag and per-run consent, then validate bounds, then claim the slot and run reservation, then call. A refused call that never reserved does not burn a slot.
8. **Structured output only.** Use `text.format` with a strict JSON schema; parse locally with unknown keys rejected; `provenance` is set by code; the result is an untrusted hypothesis. No tools, no web, no video re-upload (the existing validated `Symptom` is reused).
9. **Tests (mock only, in C3-A):** lifecycle table (failed, incomplete, in_progress, queued, cancelled, error set, incomplete_details, refusal, empty output), model mismatch table, retry test above, concurrent same-run-ID race (exactly one winner), slot exhaustion at the configured number (including 0), reservation burned after thrown network error and after schema failure, bound violations refused before reservation.

## Network-containment test (separate, defense in depth; BLOCKER 3)

- **NC-4 (fail closed).** A table of hand-authored proposals containing network or dynamic-code content (`url(http://…)`, `@import`, `expression(`, `javascript:`, markup, escaped and mixed-case variants, comment-split tokens, an extra `html`, `js` or `path` field). Each must be `SECURITY_BLOCKED` when it contains a forbidden class and `PATCH_REJECTED` when it only fails the grammar, with the exact expected status listed per vector. Every vector must additionally assert that no staging directory was created, no browser was launched (spy), and `VERIFIED` is unreachable.
- **DID-1 (separate harness).** A hand-authored script plus security test, never fed by a model proposal and never producing a candidate verdict. It serves a hand-written page from a throwaway local server on an ephemeral port (not 4173), opens a fresh Playwright context whose interception allows **only** that exact origin and aborts every other URL, including other loopback ports. The page attempts a fetch to an RFC 2606 `.invalid` host and to a second loopback port where the test runs a canary listener. Pass requires: those requests are aborted and observed, and the canary receives 0 connections. Its result type is separate from run statuses; a test asserts no code path maps it to `VERIFIED`. It is excluded from the scoreboard.
- **Honest limit.** The candidate oracle runs unmodified and uninstrumented, because adding interception would mean changing trust-root verifier files. Network safety of candidates therefore rests on the closed grammar and the unchanged HTML/JS, not on interception. DID-1 shows what Playwright interception does and does not catch; it does not claim candidate runs are intercepted. Playwright routing is not process or OS isolation.

## Hand-authored controls (no model calls; all must pass before any live spend)

- **NC-1 no-op:** empty `adjustments`, or only an irrelevant allowed rule (for example `.promo` `z-index: 5`). Expect the mobile oracle to fail with the baseline hit-test target, status `PATCH_FAILED`. Proves the run reads the staged tree and is not trivially green.
- **NC-2 path/tamper attempt:** a proposal naming `verifier/…`, `tests/…` or any `path`/`file` key. Expect `SECURITY_BLOCKED` with no stage created.
- **NC-3 regression:** `.add-to-cart` `pointer-events: none`. Expect both oracle tests to fail, `PATCH_FAILED`. Note: a mobile-pass, desktop-fail candidate is not constructible with unscoped edits, so the desktop control is a regression guard shown by PC-1 passing and NC-3 failing, not by a split result.
- **NC-4:** as above.
- **NC-5 baseline not reproduced:** run the verdict logic against a tree where the baseline passes. Expect `NOT_REPRODUCED`, never `VERIFIED`.
- **NC-6 stage tamper:** change a staged verifier file after the manifest and before the run (test hook). Expect `INCONCLUSIVE`.
- **NC-7 busy port:** hold 4173. Expect `INCONCLUSIVE` and no oracle run against the unknown server.
- **PC-1 positive control:** hand-written `.promo-overlay` `pointer-events: none`. Expect single-run pass, then 3/3 replays, then `VERIFIED` for F01. Labeled hand-written, never counted as model output.

## Report design gate (UI-C3-01; BLOCKER 5)

- **Material user-facing UI:** Yes (one static HTML report). **UI design gate: Required.**
- **Requirements/product contract and layout:** `design/screens/PP-C3-REPORT-CONTRACT.md` (proposed, in this PR).
- **Human design approval:** PENDING (see the approval record). No report generator may be built or wired until the owner approves the layout, or approves a revised one.
- **Test scope for the report:** unit tests on escaping and states, an accessibility check against `docs/ACCESSIBILITY.md` criteria, a render at 390×844 and 1280×800.

## Scope

Allowed (after the start gates): `packages/inference/src/patch-proposal.ts`; `packages/core/src/candidate.ts`, `scoreboard.ts`, `css-adjustments.ts`; `scripts/c3-*.ts`; `reports/` templates; tests under `tests/`; and the docs listed below. `status.ts`, `patch-policy.ts` and `env.ts` may only be used. `client.ts` may gain one minimal method that the new adapter wraps; `generateText` is not changed.

Forbidden: `verifier/`, `fixtures/sample-store/`, `config/patch-policy.json`, `.github/`, new runtime dependencies, Docker, any hosted backend, the five-screen UI, F02/F03, voice, SAM, Muse Wonder, Muse Code, execution of any model-authored HTML, JavaScript or free-form CSS, and any change that lets a model see verifier or test files.

## Work plan (PHT; the official deadline Nov 4 9:00 PM EST is Nov 5 10:00 AM PHT; internal target Nov 4 PHT)

| Step | Target | Work | Gate |
|---|---|---|---|
| G | by Oct 29 | GPT-6 re-audit PASS; owner records SEC-C3-01; owner merges this PR | Start gates |
| 0 | Oct 29 | Zero-model spike: staging mechanism (above) with a hand-written adjustment; confirm Meta structured-output contract against current docs | Spike passes or STOP |
| 1 | Oct 29–30 | Grammar/renderer, proposal adapter, mock tests, NC-1..NC-7, PC-1, DID-1, dry-run CLI (0 network) | All controls pass with 0 model calls |
| 2 | Oct 30 | Owner records LIVE-C3-01 numbers; first live round inside the approved quantity; verify candidates | Real request IDs, model, usage recorded |
| 3 | Oct 31 | **Go/no-go:** at least one candidate passes the unchanged oracle (single run), else document the honest negative result and demo reproduction, live analysis and failing candidates | Owner decision |
| 4 | Oct 31 | Owner approves UI-C3-01 | Design gate |
| 5 | Nov 1 | Scoreboard, hashed evidence bundle, static report | Hashes re-verify |
| 6 | Nov 1–2 | Optional Baseten row, only if step 3 passed, a separate approval exists and a real key is present | Separate approval |
| 7 | Nov 2 | 3/3 fresh replays of the winner; independent exact-head audit; remediate | Audit recorded |
| 8 | Nov 3 | Freeze; provenance and rights audit; signed-out repo check; record the demo (internal target 3:00, Participant Guide §7 says three minutes; re-verify on the event page) | Demo ready |
| 9 | Nov 4 | Final re-audit of the final SHA; submit early; save the receipt | Submission confirmed |

## Test objective / validation

- **Objective:** prove no candidate can be `VERIFIED` without an observed baseline failure, a grammar-clean proposal, an intact staged tree, and the unchanged oracle passing in three fresh runs; and prove at least one real model proposal was judged by it.
- **Automated minimum:** `pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:security`, plus the controls above and `pnpm f01:baseline` on a clean tree. Escalate on any change to `status.ts`, `patch-policy.ts` or `env.ts`, any failed security test, or any oracle flake.
- **Manual QA:** owner reviews the scoreboard and report before the demo. **CI:** Project baseline / Common validation and Stack validation on the PR.

## Acceptance criteria

- [ ] Start gates met and approvals recorded before the matching work begins.
- [ ] Dry run of proposal and candidate loop makes 0 network calls; NC-1..NC-7, PC-1 and DID-1 pass with 0 model calls.
- [ ] Live proposals use the exact approved model id; id, request IDs, usage and latency recorded; no retry, no fallback, reservations and slot counts match the approved quantity.
- [ ] The scoreboard lists every candidate including failures, with untrusted proposals and trusted evidence kept separate.
- [ ] The winner has 3/3 fresh replays, or the report says plainly that none did.
- [ ] Evidence hashes re-verify; no secret, media or raw response text is in Git.
- [ ] README, SECURITY and demo state that this is not a sandbox and that broader patches are not executed.
- [ ] Demo shows only features built in the official window.

## Documentation updates (with the matching implementation)

`docs/SECURITY.md` (promote the boundary only after SEC-C3-01 approval), `docs/ARCHITECTURE.md`, `docs/TESTING.md`, `docs/STATUS.md`, `HACKATHON_CONTRIBUTIONS.md`, one handoff in `docs/HANDOFFS.md`.

## Stop / escalation

Stop and ask if: the spike fails; the Meta structured-output contract differs from assumptions; any step needs forbidden scope or an oracle change; a call would exceed the approved quantity; the oracle shows flakiness; a security boundary would be weakened beyond what is recorded and approved here.

## Deliverable and handoff

A pull request against `main`. Agents do not merge, deploy, push to `main`, or submit. Follow `docs/HANDOFFS.md` for the completion handoff.
