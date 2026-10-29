# PP-META-I2-C3 — Verified candidate scoreboard for F01 (hackathon pivot)

- **Implementation status:** C3-0 merged (PR #7). C3-A merged (PR #8; production proposal entry point hard-disabled). C3-B1 merged (PR #9; offline coordinator, scoreboard, 3-replay VERIFIED logic over hand-authored controls). **C3-B2A (pre-live readiness; `tasks/PP-META-I2-C3-B2A.md`) implemented on a Draft PR; independent review pending.** C3-B2A, C3-LIVE-01A, C3-LIVE-01B0 and C3-LIVE-01B-PREP have since merged (PRs #10 to #13). **LIVE-C3-01 is APPROVED for activation preparation (owner, October 29, 2026; one Meta attempt in total; record below); the C3-LIVE-01 activation implementation is a Draft PR (#14) pending independent review; the activation revision pin is recorded only in `config/live-activation.json` by a separate pin-only commit (that file is authoritative); the real provider invocation is NOT AUTHORIZED YET.** C3-B2B (evaluating model proposals) to C3-F not started and NOT APPROVED.
- **State:** Revision 4. Contract merged (PR #6, independent audit PASS at `6afb386`). **SEC-C3-01 APPROVED (bounded). LIVE-C3-01 APPROVED for activation preparation on 2026-10-29 (one Meta attempt; the real invocation is NOT AUTHORIZED YET). UI-C3-01 is NOT approved.** Revision 4 records the approval, the C3-0 result and the audit's three minor follow-ups (Unicode handling in V2, frozen-install inputs, stale pointers). Remediates GPT-6 audit [issuecomment-6450106731](https://github.com/mrdzyn/proofpilot-ai/pull/6#issuecomment-6450106731), Codex inline findings 4392457764 (design gate) and 4392457775 (NC-4), and GPT-6 re-audit [issuecomment-6460634258](https://github.com/mrdzyn/proofpilot-ai/pull/6#issuecomment-6460634258) BLOCKER-1 (raw-text scanner rejected every valid JSON proposal; replaced by the parse-then-scan pipeline below).
- **Base:** protected `main` at `5658529319032236fcddb472a617fbdc5cf9aadd` (C2B docs closure, PR #5, merged). This contract is reviewed in PR #6 (branch `docs/pp-meta-i2-c3-pivot`).
- **Implementation branch (future):** `phase/pp-meta-i2-c3`, cut from `main` only after the start gates below are met.
- **Implementation agent:** Claude Code; **independent reviewer:** GPT-6; **owner:** repository owner.
- **Supersedes:** the Muse Wonder patcher, Docker-isolated verifier and five-screen UI of the v1.1 plan.

## Decision register (nothing below is in force until approved)

| ID | Decision | Status | Who must act |
|---|---|---|---|
| SEC-C3-01 | Execute model *proposals* only as trusted-host-rendered, closed-grammar CSS adjustments for F01 ("Execution boundary" below) | **APPROVED, strictly bounded** (record below); approves the design, not any unimplemented validator, and no model-generated candidate may execute until C3-A tests, this spike's audit and any further required approval | Done 2026-10-28 |
| LIVE-C3-01 | Live-call quantities: the owner **narrowed** the proposal to **one** Meta `muse-spark-1.3` attempt in total and no Baseten call (original proposal: at most 12 / 4) | **APPROVED for activation preparation, 2026-10-29** (record below; the real invocation is NOT AUTHORIZED YET: it needs the independently audited and merged C3-LIVE-01B implementation, the pinned activation revision and the per-run operator confirmation) | Owner (done); operator gates remain |
| UI-C3-01 | One-page static report layout (`design/screens/PP-C3-REPORT-CONTRACT.md`) | **PENDING owner design approval** | Owner |
| MODEL-C3-01 | Muse Spark patches; Muse Wonder is not a dependency | Proposed; Wonder's role UNVERIFIED | Owner may ask in `#office-hours` |

**What counts as approval.** An earlier chat "yes" is not a reviewable authorization and is not relied on. Approval of SEC-C3-01, LIVE-C3-01 or UI-C3-01 is valid only when the owner records it in a reviewable form (a dated block committed to this file, or a PR #6 comment that is quoted verbatim and linked from this file) and names the exact decision ID and values. An approval never covers a different value than the one it names, and merging this document approves nothing.

### Owner approval record

| Decision | Approved by / date / link | Exact values approved |
|---|---|---|
| SEC-C3-01 | `mrdzyn`, 2026-10-28, https://github.com/mrdzyn/proofpilot-ai/pull/6#issuecomment-6460953906 (owner answered "yes" to approving SEC-C3-01 for F01-only closed-grammar CSS adjustments and authorizing the zero-model staging spike) | F01 only; candidate data as validated JSON selector/property/value, rendered exclusively by trusted host constants into `styles.css` of a disposable hash-verified stage; no model-authored HTML/JS, free CSS, file paths or trust-root changes; **only hand-authored control inputs (PV-1/PC-1, PV-2/NC-1) may execute until implementation tests, the staging proof and an independent exact-head audit pass**; no OS/container sandbox verified, broader executable patches stay prohibited; no Meta or Baseten call, no credentials or media transmitted |
| LIVE-C3-01 | `mrdzyn`, 2026-10-29, https://github.com/mrdzyn/proofpilot-ai/pull/6#issuecomment-6496850990 ("Owner Decision — LIVE-C3-01 … Decision: APPROVED"; quoted verbatim in `docs/LIVE-C3-01-DECISION-RECORD.md`) | Meta Model API only (`api.meta.ai`); exact model `muse-spark-1.3`; maximum billable attempts **1 total**; input <= 12,000 characters; output <= 3,072 tokens including reasoning; text-only, strict JSON schema, low reasoning effort; no retries and no fallback; timeout, failure or uncertain completion permanently consumes the attempt; mandatory single-use operator authorization bound to run ID, request hash and approved repository revision; credential securely injected for the single owner-operated invocation. NOT approved: Baseten or Modal calls, additional attempts, automated retries, staging or execution of model-generated CSS, C3-B2B verification, report UI, hosting or deployment. |
| UI-C3-01 | _none recorded_ | _none_ |

## Objective

Show, with real Meta model calls and the existing trusted oracle, that ProofPilot can take the genuine F01 recording and its validated `Symptom`, ask `muse-spark-1.3` for several candidate fixes, run each valid candidate against the trusted oracle, and publish an honest scoreboard of which candidates fix the bug, with hashed evidence and a static report.

Pitch: *Every AI coding agent claims it fixed the bug. ProofPilot makes Meta's models prove it.*

## Start gates for C3 implementation

C3-A may start only when all of these hold: (1) GPT-6 re-audit of this contract is PASS at the exact head; (2) the owner has merged this PR (an agent never merges); (3) SEC-C3-01 is approved and recorded (otherwise no candidate executes and only the zero-network parts may proceed); (4) the implementation branch is cut from the merged `main`. LIVE-C3-01 had to be approved before any billable call: it is now approved for activation preparation only, and the real invocation additionally needs the audited and merged activation implementation, the pinned activation revision, a real per-run operator approval and the owner's separate go-ahead. UI-C3-01 must be approved before any report UI is built.

## Existing verifier facts the design must respect (read from `main`)

- `verifier/playwright.config.ts` computes `repoRoot` as the parent of its own directory. Evidence goes to `PROOFPILOT_EVIDENCE_DIR` (default `<repoRoot>/.proofpilot/runs/adhoc`).
- The port is fixed: `port = 4173`, `baseURL = http://127.0.0.1:4173`. `webServer` runs `node fixtures/sample-store/server.mjs` with `cwd = repoRoot` and `FIXTURE_PORT=4173`. `reuseExistingServer: false`, so an occupied port fails the run. `workers: 1`, `retries: 0`, `forbidOnly: true`.
- `fixtures/sample-store/server.mjs` binds `127.0.0.1` and serves a fixed route map (`/product/demo`, `/styles.css`, `/app.js`) read from `./src/` next to the server file.
- The oracle `verifier/f01/f01.oracle.spec.ts` has two tests: `F01-MOBILE` (390×844, must add one item with a real mouse click) and `F01-DESKTOP` (1280×800, regression control). Today the mobile test fails and the desktop test passes.
- `scripts/f01-baseline.ts` runs `node_modules/@playwright/test/cli.js test -c verifier/playwright.config.ts` with `cwd = repoRoot` and a `scrubEnv` environment.
- The oracle has **no** option for an external root or another port. This contract does not claim otherwise and does not change `verifier/`.

## Execution boundary (PROPOSED: SEC-C3-01, NOT APPROVED)

Scope: fixture F01 only. A model proposal is **data**, not code. Trusted host code renders it into CSS.

1. **Output contract.** The model returns exactly one JSON object of the form `{"adjustments":[{"selector":"…","property":"…","value":"…"}]}`: one key, `adjustments`, an array of 0 to 4 items, each item with exactly the three string keys `selector`, `property`, `value`, no other keys at any level, no duplicate (selector, property) pair. JSON syntax (braces, brackets, quotes, colons, commas) is only framing; it is never editable CSS. The model supplies no HTML, no JavaScript, no free CSS text, no file path and no filename. Validation is defined by the "Proposal validation pipeline" section below.
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
3. **Trusted rendering (host-owned constants only).** No model string is ever concatenated, interpolated or escaped into CSS. The renderer receives only validated, host-typed tuples and emits each rule from constant templates: selectors and enumerated values are looked up in constant tables (the model string selects a table entry; the entry's constant text is emitted); `z-index` and numeric `height` values are parsed by the host from a strict grammar and re-formatted by the host from the parsed number. Adjustments are sorted canonically and emitted as `selector{property:value}` (no `!important`). The block is appended after the baseline `styles.css` bytes, so same-specificity appended rules win, including over the baseline `@media (min-width: 768px)` rule for `.promo-overlay`.
4. **Validation order and exact staged bytes.** Raw proposal text is validated by the pipeline below (size, strict JSON, forbidden content in parsed strings, exact shape and grammar). After rendering, the staged `styles.css` is re-read and must equal baseline bytes plus the marker plus the canonical rendering exactly; a mismatch is `INCONCLUSIVE`.
5. **Unchanged app code.** `product.html` and `app.js` are always the approved-SHA bytes, hash-checked. No Node process executes anything derived from a proposal. The only model-influenced bytes are CSS rules built from constants and served by the trusted fixture server to headless Chromium.
6. **Broader patches stay gated.** HTML, JavaScript, arbitrary CSS or multi-file patches are neither requested from the model nor executed in this task. Any such capability requires a separate task, an independently verified OS/container sandbox, and its own approval. The requirement in `docs/SECURITY.md` is unchanged for that case.
7. **Honest limits.** This is not a sandbox. It removes model-authored executable content instead of containing it. The demo and README must say so.

## Proposal validation pipeline (SEC-C3-01, PROPOSED; replaces the raw-text token scan)

Raw model text is **not** scanned for JSON syntax characters: a valid proposal must contain braces and quotes. Forbidden content is detected in **parsed string values and keys**, after JSON decoding. The pipeline is deterministic and ordered; the first failing step decides the classification. Nothing is rendered, staged or run unless every step passes.

| Step | Check | On failure |
|---|---|---|
| V0 | Raw response is at most `MAX_PROPOSAL_BYTES` UTF-8 bytes (proposed 2,048; owner may change) | `PATCH_REJECTED` `PROPOSAL_TOO_LARGE`; checked **before** parsing (test spies that the parser is not called) |
| V1 | Exactly one strict JSON value, nothing before or after except JSON whitespace; no Markdown fence; no BOM; **no duplicate object keys at any level** (a plain `JSON.parse` keeps the last duplicate silently, so the parser must detect them) | `PATCH_REJECTED` `MALFORMED_JSON` or `DUPLICATE_KEY` |
| V2 | Forbidden-content scan over **every object key and every string value in the whole parsed tree**, including unknown fields. Each decoded string (JSON escapes resolved, so `\u0075rl(` is `url(`) is processed in this order: (a) **control-character check on the decoded string before any stripping**: any C0 or C1 control character (including NUL, tab, newline) is `SECURITY_BLOCKED`; (b) Unicode NFKC normalisation; (c) removal of every code point that is White_Space, in general category Cf (format, for example U+200B to U+200F, U+2060 to U+2064, U+00AD, U+FEFF), Default_Ignorable_Code_Point, a variation selector, or a tag character; (d) lower-casing; (e) matching against the forbidden classes. Forbidden classes: `url(`, `@import`, `expression(`, `javascript:`, `data:`, `http`, `//`, `/*`, `*/`, `<`, `>`, `{`, `}`, `;`, `\`, `"`, `'`, `` ` ``, `..`, `/`, and the path words `verifier`, `fixtures`, `tests`, `node_modules`, `.proofpilot`, `.git`, `.env`. Because step (c) removes invisible and ignorable characters, `u\u200brl(` is classified `SECURITY_BLOCKED` (never merely `PATCH_REJECTED`). | `SECURITY_BLOCKED` with the class name (never the raw text) |
| V3 | Root is a plain object with exactly one key, `adjustments`, an array. No other key at any depth (this rejects `path`, `file`, `html`, `js`, `note`). Prototype-dangerous keys (`__proto__`, `constructor`, `prototype`) are rejected as unknown keys; objects are read only by fixed key names from null-prototype copies, and a test asserts `Object.prototype` is unpolluted afterwards | `PATCH_REJECTED` `UNKNOWN_KEY` / `BAD_SHAPE` |
| V4 | `adjustments.length` is 0 to 4; every item is an object with exactly `selector`, `property`, `value`, all JSON **strings** (numbers, booleans, null, arrays and objects in these positions are rejected) | `PATCH_REJECTED` `TOO_MANY_ADJUSTMENTS` / `BAD_TYPE` |
| V5 | `selector` is exactly one of the three table selectors; `property` is allowed for that selector; `value` is allowed for that property under the strict grammar (case-sensitive, no surrounding whitespace, no `!important`, integers `-?[1-9][0-9]*|0` in range with no leading zeros, plus sign, decimal point or exponent; `height` per the table) | `PATCH_REJECTED` `UNKNOWN_SELECTOR` / `PROPERTY_NOT_ALLOWED` / `VALUE_NOT_ALLOWED` |
| V6 | No two items share the same (selector, property), even with identical values | `PATCH_REJECTED` `DUPLICATE_PAIR` |
| V7 | Render from host constants (execution boundary step 3) | n/a |

**Deterministic classification and precedence.** (1) Size, then (2) JSON syntax and duplicate keys decide `PATCH_REJECTED` first: text that is not a single valid JSON value is never parsed into strings, so nothing is rendered or run and no content class applies. (3) For any successfully parsed value, a forbidden content class anywhere (V2) wins over every structural error and yields `SECURITY_BLOCKED`, so an extra `path` key whose value names `verifier/…`, or an extra `html` key holding markup, is `SECURITY_BLOCKED` and not merely "unknown key". (4) Otherwise structural and grammar errors (V3 to V6) yield `PATCH_REJECTED`. (5) Both statuses stop before any stage, browser, oracle process or renderer exists, and neither can ever lead to `VERIFIED`. The reason code is stored; raw rejected text is stored only as a SHA-256 and a length, and any display of it in the report is escaped and truncated.

**Positive and negative test vectors (mock/unit, zero network, in C3-A; "no side effects" means: no stage directory created, no browser launched, no oracle spawned, renderer not called, spy-verified).**

| ID | Input (abridged) | Expected |
|---|---|---|
| PV-1 | `{"adjustments":[{"selector":".promo-overlay","property":"pointer-events","value":"none"}]}` | **Accepted**; renders exactly `.promo-overlay{pointer-events:none}`; reaches staging (this is the PC-1 content) |
| PV-2 | `{"adjustments":[]}` | Accepted; renders nothing (NC-1) |
| PV-3 | four distinct valid pairs, incl. `z-index` `"100"`, `"-1"`, `"0"` and `height` `"100vh"` | Accepted; canonical order and exact bytes asserted |
| PV-4 | valid JSON with leading/trailing JSON whitespace and newlines | Accepted |
| MJ-1 | truncated: `{"adjustments":[` | `PATCH_REJECTED` `MALFORMED_JSON`, no side effects |
| MJ-2 | two JSON values, or valid JSON followed by text | `PATCH_REJECTED` |
| MJ-3 | valid JSON inside a Markdown code fence, or with a BOM | `PATCH_REJECTED` |
| MJ-4 | raw non-JSON text such as `url(http://x.invalid/a)` | `PATCH_REJECTED` `MALFORMED_JSON` (nothing parsed) |
| SZ-1 | valid-shaped JSON larger than `MAX_PROPOSAL_BYTES` | `PATCH_REJECTED` `PROPOSAL_TOO_LARGE`; parser spy shows it was never called |
| ROOT-1 | root is an array, string, number, boolean or `null` | `PATCH_REJECTED` `BAD_SHAPE` |
| EK-1 | extra top-level key: `{"adjustments":[],"note":"hi"}` | `PATCH_REJECTED` `UNKNOWN_KEY` |
| EK-2 | extra key inside an item: `…,"comment":"x"` | `PATCH_REJECTED` `UNKNOWN_KEY` |
| EK-3 (NC-2) | extra key `path` with value `verifier/f01/f01.oracle.spec.ts` (also `file`, `tests/…`, `../x`) | `SECURITY_BLOCKED` (path class) |
| EK-4 | extra key `html` with value `<script>…</script>` | `SECURITY_BLOCKED` (markup class) |
| PD-1 | keys `__proto__`, `constructor`, `prototype` at root and in an item | `PATCH_REJECTED` `UNKNOWN_KEY`; `Object.prototype` unpolluted |
| FC-1 (NC-4) | `value` = `url(http://x.invalid/a)` | `SECURITY_BLOCKED` |
| FC-2 (NC-4) | `value` = `@import`, `expression(`, `javascript:`, `data:`, `URL(`, `UrL(` | `SECURITY_BLOCKED` each |
| FC-3 (NC-4) | escaped Unicode: `"\u0075rl(http://x)"`, fullwidth `ｕｒｌ(`, whitespace-split `u r l(` | `SECURITY_BLOCKED` each |
| FC-3b (NC-4) | default-ignorable and format characters inside a forbidden token: `u\u200brl(`, `u\u00adrl(`, `u\ufeffrl(`, `u\u2060rl(`, `u\u200drl(`, variation-selector and tag-character splits | `SECURITY_BLOCKED` each |
| FC-3c | decoded control characters: a value containing `\u0000`, `\n` or `\t` | `SECURITY_BLOCKED` (control-character check runs before stripping) |
| FC-4 (NC-4) | comment-split `u/**/rl(` | `SECURITY_BLOCKED` (`/*`) |
| FC-5 (NC-4) | `value` = `none; background:url(x)` or `none}` or `none"` | `SECURITY_BLOCKED` |
| FC-6 | forbidden class in a **selector** or **property** string, or in an array element of an unknown field | `SECURITY_BLOCKED` |
| G-1 | unknown selector (`body`, `.promo-overlay .child`, `#x`, `.Promo-Overlay`) | `PATCH_REJECTED` `UNKNOWN_SELECTOR` |
| G-1b | a selector with a combinator character: `.promo-overlay > *` | `SECURITY_BLOCKED` (`>` is in the markup class; precedence rule 3). Corrected in C3-A: the earlier table listed this as `PATCH_REJECTED`, contradicting V2 |
| G-2 | disallowed pair (`.add-to-cart` with `display`; `.promo` with `height`) | `PATCH_REJECTED` `PROPERTY_NOT_ALLOWED` |
| G-3 | `z-index` `"101"`, `"-2"`, `"01"`, `"+5"`, `"1e1"`, `"5.0"`, `""`; `height` `"0px "`, `"101vh"`, `"601px"` | `PATCH_REJECTED` `VALUE_NOT_ALLOWED` |
| G-4 | `"none !important"`, `" none"`, `"None"`, `"NONE"` | `PATCH_REJECTED` `VALUE_NOT_ALLOWED` |
| T-1 | non-string fields: numeric `value` `5`, `true`, `null`, array, object; `selector` as number | `PATCH_REJECTED` `BAD_TYPE` |
| T-2 | `adjustments` is an object, string or `null` | `PATCH_REJECTED` `BAD_SHAPE` |
| D-1 | same (selector, property) twice, with identical or different values | `PATCH_REJECTED` `DUPLICATE_PAIR` |
| D-2 | duplicate JSON key: `{"adjustments":[],"adjustments":[]}` | `PATCH_REJECTED` `DUPLICATE_KEY` |
| N-1 | five valid-looking entries | `PATCH_REJECTED` `TOO_MANY_ADJUSTMENTS` |
| R-1 | renderer unit test: output depends only on constant tables and host-formatted integers; a property-based test shows no accepted input can make output contain a character outside `[a-z0-9.\-{}:\n]` (rules are newline-separated) | pass |

Every `PATCH_REJECTED` and `SECURITY_BLOCKED` vector asserts "no side effects" and that `VERIFIED` is unreachable. The only accepted vectors (PV-1 to PV-4) proceed to staging in the hand-controls below.

## Candidate staging mechanism (feasible and testable; the spike below must confirm it)

The oracle is not redirected. Each candidate gets a complete staging workspace in which the unmodified trusted verifier runs at its normal fixed root and port.

1. **Preconditions.** Run from a clean tree whose `HEAD` is the recorded approved SHA (reuse the `readWorktreeState` check on `verifier/` and `fixtures/`). Port 4173 must be free (bind test) and no other oracle run may be active (exclusive-create lock file). Otherwise the candidate is `INCONCLUSIVE` and nothing is tested against an unknown server. Runs are strictly serial.
2. **Create the stage.** A new 0700 directory outside the repository, populated by `git archive <approvedSha> -- verifier fixtures/sample-store package.json pnpm-lock.yaml tsconfig.json`. The approved SHA has no `pnpm-workspace.yaml` or `.npmrc`; if a later SHA adds pnpm workspace metadata it is a trusted, hash-checked staging input too.
3. **Verify trusted bytes.** Every staged file other than `fixtures/sample-store/src/styles.css` (including `package.json`, `pnpm-lock.yaml` and `tsconfig.json`) must match the approved-SHA blob, with no extra and no missing file (git blob id compared, SHA-256 recorded). Record the manifest.
4. **Write the candidate.** Trusted code writes `styles.css` as the baseline bytes plus a marker comment containing a per-candidate nonce plus the canonical rules. Record its SHA-256.
5. **Dependencies (a symlink is not read-only).** A symlink to the trusted `node_modules` does **not** make that directory read-only: the link target stays writable by any process running as the same user. Options, in order of preference: (a) offline frozen-lockfile install inside the stage; (b) a **contained copy** of the trusted install inside the stage (new inodes, relative links kept, hash-compared with its source, every link must resolve inside the stage, no hard-linked file, installed `@playwright/test` version must equal the approved pin), checked before and after the run; (c) the detect-only symlink with a before/after manifest. **C3-0 result:** (a) is not possible in the owner's environment: `pnpm install --frozen-lockfile --offline` fails with `ERR_PNPM_NO_OFFLINE_META` (pnpm 12 offline mode needs registry metadata that is not cached, even with `--no-optional`), and no registry fallback is used. C3-0 therefore uses (b). The copy is integrity-checked, not enforced: a tamper is detected and the candidate is `INCONCLUSIVE`; the report must say the dependency tree is detect-only. The model never writes anywhere near `node_modules`, and the only model-influenced bytes are the host-rendered CSS rules. Browser binaries live outside the stage in the Playwright cache and are not covered by these manifests.
6. **Run.** Spawn the staged `node_modules/@playwright/test/cli.js test -c verifier/playwright.config.ts` with `cwd` = the stage, a `scrubEnv` environment, and `PROOFPILOT_EVIDENCE_DIR` set to a per-candidate run directory. Because the config derives `repoRoot` from its own location, the oracle now serves the stage's `fixtures/sample-store/src/` on 4173.
7. **Prove it read the candidate tree.** Primary proof: the traced response body for `GET /styles.css` (Playwright trace, pinned version 1.64.1) contains the nonce marker and hashes to the staged file. Required behavioural proof: PC-1 flips the observed hit-test target from `promo-overlay` to `add-to-cart` and NC-1 stays identical to baseline. If trace parsing proves infeasible in the spike, the behavioural pair is the proof and the limitation is stated in the report.
8. **Recheck and clean.** After the run, re-hash the manifest and `styles.css`; any difference is `INCONCLUSIVE`. Copy evidence, hash it, remove the stage.
9. **Spike (C3-0, zero model calls): IMPLEMENTED AND PASSED LOCALLY, awaiting independent review.** `node scripts/c3-stage-spike.ts` runs steps 1 to 8 for NC-1 (empty), NC-1b (`.promo` z-index 5) and PC-1 (`.promo-overlay` pointer-events none), each in its own stage, serially, with the trace-based nonce proof. Result and evidence are in `docs/STATUS.md` and handoff `PP-META-I2-C3-0-A1`. Passing the spike does **not** make a model-generated candidate executable: that still needs the C3-A validator and tests, audit, and the other gates. If the spike ever fails, stop and report; do not change the oracle to make it pass.

## Candidate and run statuses

| Situation | Status |
|---|---|
| A forbidden content class appears in any key or string of a successfully parsed proposal (pipeline V2) | `SECURITY_BLOCKED`, before any stage or browser exists |
| Too large, not a single valid JSON value, duplicate key, unknown key, bad type or shape, or outside the grammar (pipeline V0, V1, V3 to V6) | `PATCH_REJECTED`, nothing rendered or executed |
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
4. **Bounded usage.** Per-call bounds are fixed constants checked before reserving: maximum input characters and `max_output_tokens`, with `reasoning.effort` low. Values approved for LIVE-C3-01 by the owner on 2026-10-29: 12,000 input characters, 3,072 output tokens including reasoning. The adapter records provider-reported usage; usage above the bound is recorded and flagged. A cost figure is never presented as a cap or a billed amount.
5. **One-time reservations.** Before any network call, the adapter creates a reservation file with exclusive create (`wx`) under `.proofpilot/reservations/<provider>/`, named by run ID. An existing file refuses the call. A reservation is never deleted or reused, and it is burned on every outcome including timeouts, network errors, parse failures and uncertain outcomes.
6. **Pre-authorized aggregate counter.** The number of numbered slot files `<provider>-<NN>` (each claimed by exclusive create) can never exceed the approved quantity for that provider. The approved quantity is now recorded (LIVE-C3-01, 2026-10-29: Meta 1, Baseten 0) and the constant is set to exactly that number; a live path additionally stays refused until the owner-pinned activation revision exists (currently NOT RECORDED), a per-run operator approval is made and a credential is injected.
7. **Ordering.** Check the billable flag and per-run consent, then validate bounds, then claim the slot and run reservation, then call. A refused call that never reserved does not burn a slot.
8. **Structured output only.** Use `text.format` with a strict JSON schema; parse locally with unknown keys rejected; `provenance` is set by code; the result is an untrusted hypothesis. No tools, no web, no video re-upload (the existing validated `Symptom` is reused).
9. **Tests (mock only, in C3-A):** lifecycle table (failed, incomplete, in_progress, queued, cancelled, error set, incomplete_details, refusal, empty output), model mismatch table, retry test above, concurrent same-run-ID race (exactly one winner), slot exhaustion at the configured number (including 0), reservation burned after thrown network error and after schema failure, bound violations refused before reservation.

## Network-containment test (separate, defense in depth; BLOCKER 3)

- **NC-4 (fail closed).** Defined by the content-class vectors FC-1 to FC-6 and EK-4 in the "Proposal validation pipeline" table, each with its exact expected status (`SECURITY_BLOCKED` when a forbidden class is present in a parsed key or string; `PATCH_REJECTED` when the proposal only fails syntax or grammar). Every vector asserts no staging directory, no browser launch (spy), no oracle process, renderer not called, and `VERIFIED` unreachable.
- **DID-1 (separate harness).** A hand-authored script plus security test, never fed by a model proposal and never producing a candidate verdict. It serves a hand-written page from a throwaway local server on an ephemeral port (not 4173), opens a fresh Playwright context whose interception allows **only** that exact origin and aborts every other URL, including other loopback ports. The page attempts a fetch to an RFC 2606 `.invalid` host and to a second loopback port where the test runs a canary listener. Pass requires: those requests are aborted and observed, and the canary receives 0 connections. Its result type is separate from run statuses; a test asserts no code path maps it to `VERIFIED`. It is excluded from the scoreboard.
- **Honest limit.** The candidate oracle runs unmodified and uninstrumented, because adding interception would mean changing trust-root verifier files. Network safety of candidates therefore rests on the closed grammar and the unchanged HTML/JS, not on interception. DID-1 shows what Playwright interception does and does not catch; it does not claim candidate runs are intercepted. Playwright routing is not process or OS isolation.

## Hand-authored controls (no model calls; all must pass before any live spend)

- **NC-1 no-op:** PV-2 (empty `adjustments`), or only an irrelevant allowed rule (for example `.promo` `z-index: 5`). Expect the mobile oracle to fail with the baseline hit-test target, status `PATCH_FAILED`. Proves the run reads the staged tree and is not trivially green.
- **NC-2 path/tamper attempt:** vector EK-3: a proposal with a `path` or `file` key, or any string naming `verifier/…`, `tests/…` or `../`. Expect `SECURITY_BLOCKED` (path class, by precedence rule 3) with no stage created; the same keys with harmless values are `PATCH_REJECTED` `UNKNOWN_KEY` (EK-1).
- **NC-3 regression:** `.add-to-cart` `pointer-events: none`. Expect both oracle tests to fail, `PATCH_FAILED`. Note: a mobile-pass, desktop-fail candidate is not constructible with unscoped edits, so the desktop control is a regression guard shown by PC-1 passing and NC-3 failing, not by a split result.
- **NC-4:** as above.
- **NC-5 baseline not reproduced:** run the verdict logic against a tree where the baseline passes. Expect `NOT_REPRODUCED`, never `VERIFIED`.
- **NC-6 stage tamper:** change a staged verifier file after the manifest and before the run (test hook). Expect `INCONCLUSIVE`.
- **NC-7 busy port:** hold 4173. Expect `INCONCLUSIVE` and no oracle run against the unknown server.
- **PC-1 positive control:** hand-written proposal PV-1 (a valid JSON object that must pass the whole pipeline and render `.promo-overlay{pointer-events:none}`). Expect single-run pass, then 3/3 replays, then `VERIFIED` for F01. Labeled hand-written, never counted as model output.

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
| 2 | Oct 30 | LIVE-C3-01 numbers recorded by the owner (Oct 29: one Meta attempt); first live round inside the approved quantity once the operator gates pass; verification of any proposal needs separate C3-B2B approval (NOT APPROVED) | Real request IDs, model, usage recorded |
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
