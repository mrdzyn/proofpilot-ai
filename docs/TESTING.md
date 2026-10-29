# Testing and Quality Gates

## Purpose

Define how changes are proven safe enough to merge and release. Generated projects should replace the placeholders with stack-specific commands.

## Testing principles

- Test behavior, not only implementation details.
- Add regression coverage for fixed defects when practical.
- Keep tests deterministic and repeatable.
- Do not delete or weaken valid tests merely to make a change pass.
- Match validation depth to risk.
- For user-facing work, derive the test plan from the written requirements and approved screen/flow contract before production wiring begins.
- Add executable tests alongside business/data/API/integration wiring rather than deferring them until after the UI appears complete.
- Record checks actually run; never claim unexecuted validation.
- Prefer the smallest set of checks that can prove the task's stated objective.
- Do not spend agent time or context proving unrelated behavior merely because more tests exist.
- Required CI and release gates remain mandatory even when the agent's own local/interactive test scope is intentionally narrow.

## Test objective and stop rule

Every non-trivial task should define a **test objective** before execution.

A good test objective answers:

> What specific behavior or risk must be proven before this task can move to manual QA?

Examples:
- "Prove that this component renders the new empty-state copy and preserves the existing action."
- "Prove that this parser rejects malformed input without changing valid-input behavior."
- "Prove that tenant B's record can never be returned through tenant A's repository path."
- "Prove that the release artifact is signed by the expected Android upload certificate."

The agent should then choose the **smallest automated evidence** that can prove that objective.

Default sequence:

```text
acceptance criteria
    ↓
define test objective
    ↓
targeted automated check(s)
    ↓
objective met?
  ├─ no → fix / targeted retest
  └─ yes → STOP expanding automated tests
             ↓
          manual QA
             ↓
       PR / required CI
```

Once the objective is met, do not broaden the agent-run test loop unless at least one of these applies:
- the change has a broad/shared blast radius;
- a failure suggests adjacent behavior may be affected;
- the task touches a high-risk boundary;
- a repository-required CI/release gate requires broader coverage;
- the owner/orchestrator explicitly requests broader regression.

If a passing test suite has not changed and subsequent edits cannot affect it, do not rerun it reflexively.

## Agent testing vs required CI

These are separate layers:

- **Agent/local validation:** objective-based, targeted, and risk-proportionate. Optimize for the evidence needed to prove the task.
- **Required CI:** repository policy. Every protected/required status check still runs on the PR when configured, regardless of how narrow the agent's local test scope was.
- **Release validation:** may be broader than both local testing and ordinary PR checks because it proves a release candidate, not just a code change.
- **Manual QA:** follows successful targeted automated validation when human/device/browser/platform inspection adds confidence.

Never weaken, disable, or skip required CI merely to reduce AI token use.

## CI gate classes

Every project should classify CI/release evidence into exactly the gate type it actually represents. A job being automated does **not** automatically make it a required PR gate.

| Gate class | Purpose | Typical examples | Merge/release behavior |
|---|---|---|---|
| **Required PR gate** | Prove the proposed change is safe enough to merge | common baseline, stable lint/static analysis, typecheck/compile, risk-required tests, build/package, applicable security checks | Must satisfy repository merge policy; use only stable, deterministic check names/behavior |
| **Optional informational** | Add useful but non-blocking signal | extended compatibility matrices, expensive advisory analysis, experimental toolchains | May fail without blocking merge unless explicitly promoted to required policy; results must never masquerade as evidence that required validation passed |
| **Release-only** | Prove an exact release candidate and privileged release conditions | signing, provenance/checksum, exact artifact verification, store/package validation, migration/recovery readiness | Runs in a release trust zone; not a substitute for PR validation and should not expose release credentials to ordinary PRs |
| **Manual / human gate** | Capture judgment or environment/device/store approval that automation cannot truthfully represent | device/browser QA, accessibility inspection, store review, production approval | Recorded as human/process evidence; do not manufacture a fake passing CI check merely for dashboard completeness |

### Choosing required PR gates

Make a check required only when all of the following are true:

- it protects merge safety for this repository rather than merely providing extra signal;
- its check name and behavior are stable enough for ruleset enforcement;
- it is deterministic enough that routine merge flow will not be dominated by avoidable flakes;
- it can run safely in the PR trust context without production/release credentials;
- the repository has a clear owner for failures and for coordinated required-check renames.

A project may promote an informational check to required when experience shows that its signal is necessary for merge safety. That is a repository-policy change: document it and coordinate the ruleset/status-check configuration.

Demoting or retiring a required check is also a repository-policy change. Document why it no longer protects a meaningful risk, obtain explicit project-owner approval, and coordinate the ruleset/status-check change. Never demote or retire a required check to bypass a genuine failure on the PR under review.

### Relationship to local agent validation

These gate classes do not expand the agent's local test budget. The agent still runs the smallest targeted evidence that proves the task objective. Required PR gates, release-only validation, and human approval remain separate policy layers and run when their stage is reached.

## CI availability exception

Required CI remains the normal merge gate. When GitHub-hosted CI cannot execute for an external quota/service/runner-availability reason, the repository may use the documented CI-unavailable exception; that exception must never be used to excuse a genuine failing test, build, security, signing, migration, or policy check.

`docs/REPOSITORY-SETUP.md` is the canonical source for eligibility, evidence, equivalent validation, independent review, owner/admin approval, PR-only bypass, trigger-economy, and optional self-hosted-runner guidance.

## Risk-proportionate testing ladder

Use this as a default, then adapt to the actual project:

| Change type | Default automated evidence | Next gate |
|---|---|---|
| Docs/copy/non-executable metadata | syntax/link/schema check if relevant; otherwise none | human review / manual QA |
| Localized visual/UI change | targeted component/widget/render test if useful | manual visual/device QA |
| Localized business logic | targeted unit/behavior test | manual functional QA where applicable |
| API/integration adapter change | targeted unit + boundary/integration test | manual integration QA |
| Shared/core library or cross-cutting state | targeted tests + affected regression subset | manual QA + required CI |
| Auth/authz, tenant isolation, credentials, cryptography, payments, migrations, security/privacy controls, production infrastructure | targeted security/behavior tests + broader affected regression | manual QA + required CI/security gates |
| Release candidate / store submission | required CI + release regression/artifact validation | release QA / human approval |

This is not a rigid checklist. The test objective and blast radius determine the actual evidence.

## Test layers

### Static validation

**Project commands:**  
`pnpm lint` (project policy lint), `pnpm typecheck` (`tsc --noEmit`), `python3 scripts/validate_project_profile.py --repository mrdzyn/proofpilot-ai`, `git diff --check`

### Unit tests
Validate isolated business logic and edge cases. Model providers are always mocked here; unit results are never presented as AI-integration coverage.

**Project commands:**  
`pnpm test:unit`

### Integration tests
Validate boundaries such as database, filesystem, network API, authentication, or platform adapters.

**Project commands:**  
`pnpm test:integration` (needs Chromium **and** ffmpeg; not part of the default CI steps) runs: the real baseline runner in a throwaway copy to prove dirty evidence fails closed, and real-media tests (genuine MP4 accepted; truncated, bit-flipped, garbage, over-long, wrong-codec and audio-only files rejected; WebM refused then converted). The C2A unit and security suites (media logic with injected probe, consent, `Symptom`, mocked Meta Files + Responses contract, CLI) need no ffmpeg and run in CI under `test:unit` / `test:security`. `pnpm inference:status -- --discover` (non-billable provider discovery; requires a configured key; manual only). Real billable inference tests require separate owner authorization.

### End-to-end / acceptance tests
Validate critical user journeys or release flows.

**Project commands:**  
`pnpm record:f01`: records the real mobile-defect and desktop-control clips (needs Chromium and ffmpeg; exit 0 / 1 / 2 as for the baseline). `pnpm analyze:video -- --video <file> --run-id <id>`: dry run by default, no network. `pnpm f01:baseline`: runs the trusted F01 oracle. Exit 0 only when the expected baseline failure is REPRODUCED, the desktop control passes, **and** the evidence-relevant paths (fixture, verifier, classifier, runner) are committed/clean. Exit 2 means reproduced but not certifiable as exact-SHA evidence (dirty or unverifiable worktree; diagnostic artifacts are kept). Exit 1 means not reproduced/inconclusive.

`pnpm test:e2e:f01`: the raw oracle. On the unpatched baseline it **exits non-zero by design** (1 failed, 1 passed). Never mark the mobile oracle `test.fail()` or otherwise disguise that failure.

### Security / dependency checks

**Project commands:**  
`pnpm test:security` (trust-root write policy, credential redaction, host allowlist, env scrubbing, no tracked `.env`). pnpm's install-time supply-chain policy check runs on `pnpm install`.

## Design-first UI validation

For material user-facing UI, validation occurs in layers:

1. **Design validation:** confirm the screen map, user flows, required states, accessibility expectations, and responsive/adaptive behavior are coherent before shell implementation.
2. **Shell validation:** review navigation, layout, reusable components, themes, semantics, and fixture/stub-driven states before production wiring.
3. **Wiring tests:** as business logic, state, persistence, APIs, authentication/authorization, and integrations are connected, add the targeted tests required by the task's test objective.
4. **Objective stop:** once the defined automated evidence proves the acceptance criteria, stop expanding the agent-run suite unless risk/blast radius requires more.
5. **Manual QA:** inspect the real integrated experience on the relevant browser/device/platform path.
6. **Integrated validation:** confirm the finished flow matches both the written product contract and approved screen/design references.

A visually approved shell does not prove runtime correctness. A passing targeted test does not prove the implemented experience matches the approved design. Automated evidence and manual QA validate different parts of the contract.

Use synthetic or sanitized fixtures for screen/shell testing. Do not place real production secrets or sensitive customer data into fixtures, screenshots, golden files, previews, or test recordings.

## Pull-request quality gate

A PR should not be considered ready for human approval until:
- for material UI work, the approved design/shell and integrated implementation are traceable to the same requirements;
- the task's stated test objective is demonstrated;
- applicable manual QA is completed or explicitly marked pending with reason;
- required CI/status checks pass, or the repository's documented CI-unavailable exception is satisfied for checks that genuinely could not execute;
- task acceptance criteria are demonstrated;
- new/changed behavior has appropriate tests;
- known failures are documented and explicitly accepted;
- security/privacy impact is reviewed;
- relevant docs are updated.

## Risk-based escalation

Broaden beyond the smallest targeted test set when changes involve:
- authentication/authorization;
- payments/billing;
- encryption/cryptography;
- migrations or destructive data changes;
- multi-tenant isolation;
- credentials/secrets;
- shared/core libraries with wide call sites;
- public API/contracts consumed by multiple clients;
- offline sync/persistence;
- app-store signing/release;
- production infrastructure;
- security/privacy controls.

Broader coverage should still have a reason. "Run everything" is not a substitute for identifying the risk being tested.

## Manual QA

Manual QA is the normal next gate after the task's automated test objective has been met, when the change has user-visible or environment-dependent behavior.

Manual QA should focus on what automation does not prove efficiently:
- visual correctness and interaction feel;
- browser/device/platform behavior;
- realistic navigation/workflow;
- accessibility behavior that needs human/device confirmation;
- integration behavior in the intended environment;
- regression symptoms around the changed path.

Do not use manual QA as an excuse to omit a cheap, deterministic regression test for logic that can be automated reliably.

If manual QA finds a defect:
1. reproduce it;
2. add the smallest meaningful automated regression test when practical;
3. fix the defect;
4. rerun the targeted automated evidence;
5. repeat the relevant manual QA path.

Document the matrix only when it adds value:

| Area | Required manual QA | Owner/result |
|---|---|---|
| TBD | | |

## Android signing validation

Not applicable to ProofPilot (web only). If Android is ever added, re-add the Android signing pack. For reference, the template baseline required:
- release CI must fail if required signing inputs are missing;
- production release builds must not fall back to debug signing;
- verify AAB signatures with `jarsigner`;
- verify APK signatures with `apksigner`;
- compare the public signing/upload certificate fingerprint with the expected release identity where practical;
- validate the exact release artifact, not only Gradle configuration.

## Release validation

Before release:
- validate the exact candidate artifact when possible;
- record version/build and source commit;
- run the required release smoke/regression checks even when the final code delta was small;
- confirm migration/rollback readiness;
- complete platform/store-specific checks;
- complete the applicable release QA/manual validation gate.

## C3-LIVE-01B0 proposal-orchestration checks (zero network, synthetic)

- `tests/unit/proposal-orchestrator.test.ts`: happy path and exact request contract; the full response/failure matrix (incomplete, refusal, missing status, wrong model, empty, malformed, forbidden, out-of-grammar, timeout, transport error, unexpected exception) with no raw text or exception text stored and exactly one request; the Meta adapter contract against a mock `fetch` (strict json_schema, low reasoning, 3072 tokens, no tools, one call even with retries configured); persistence and settlement failures; crashes at every boundary; authorization-order and pre-flight-first refusals; production contexts and look-alike transports refused.
- `tests/security/live01b0-boundary.test.ts`: kill switch intact (quota 0, empty register and pin, `proposeCandidate` rejects before touching a trap argument under hostile environment flags); the orchestrator has no network/env/credential/spawn/retry capability and exactly one transport call site; it is isolated (synthetic-only, private tail, exact export list, no production runner anywhere, single importer); the documentation no longer refers to the removed injectable authorization entry point.
- Guard removal around the request, approval, reservation, persistence and no-network boundaries: see the PR.

- **Nested metadata sanitization (audit MAJOR-1):** `tests/unit/proposal-orchestrator.test.ts` injects marker- and secret-bearing unknown keys and malformed values under `usage`/`lifecycle` for completed and failed responses and asserts neither the persisted JSON nor the returned artifact contains them, valid values are intact, bad codes/statuses fail closed, and the attempt stays one request and spent. A static test forbids passing `res.usage`/`res.lifecycle` through. 13 targeted guard-removal mutants are all killed.

## C3-LIVE-01B activation checks (zero network, no credential, no operator approval)

- `tests/security/live01b-prep-install-copy.test.ts` (extended): the unmodified production code with the **shipped** quota (Meta 1) and the **shipped** owner decision, run from a disposable install copy (only the activation pin, the approvals and a mock Meta endpoint are fixtures). New: the EMPTY pin alone stops everything (no credential read, consumption, reservation, artifact or request) even with an approval present; hostile `GIT_DIR`/`GIT_WORK_TREE` cannot redirect the probe and the key never reaches the git child; the owner CLI end to end (verified evidence, hash shown, read-only gate, typed confirmation, then consume -> claim -> ONE request -> sanitized report -> stop; a second run is `APPROVAL_SPENT`, a new run `QUOTA_EXHAUSTED`; provider outcomes print sanitized fields only; missing/expired/synthetic/other-input/other-revision approvals and an empty pin stop it before the prompt; tampered, uncertified, mismatched or mock-sourced evidence is refused before the gate is consulted; a wrong phrase, extra options or a missing credential send and consume nothing).
- `tests/unit/live-input.test.ts`: the provenance gate (certified baseline for exactly HEAD and fixture tree, hash and artifact-set integrity, path escapes, verdict re-derivation against consistently re-hashed forgeries, live-only analysis, SHA-256 binding to a certified recording, symptom revalidation and sufficiency, fence forgery).
- `tests/unit/live-proposal-cli.test.ts`: CLI logic with scripted terminal I/O and mock functions (TTY, strict arguments with no loop/batch/retry/fallback/provider/model/limit/credential/root option, dirty tree, preflight shows the exact hash and the approval command, closed gates stop before the prompt, exact confirmation phrase, exactly one call with exactly `{runId, request}`, sanitized output only, typed codes only for errors, never a second call).
- `tests/security/live01b-activation-boundary.test.ts` (static): thin owner script, straight-line CLI, offline read-only provenance gate, single production path and sole `structuredResponse` call site, Baseten/Modal unauthorized, model output unreachable from staging/coordinator/verifier.
- Retargeted: `b2a-boundary`, `proposal-boundary`, `offline-verification-boundary`, `live01a-boundary`, `live01b0-boundary`, `live01b-prep-boundary`, `live-approval`, `proposal-readiness` (see the task file for each; the old "quota 0 / always disabled" claims became stronger "powerless without every authorization" claims).
- Guard removal around the empty-pin lock, the provenance gate, the confirmation, the one-call boundary and sanitization: see the PR.

## C3-LIVE-01B-PREP production-path checks (zero network)

- `tests/security/live01b-prep-install-copy.test.ts`: the unmodified production runner executed from a throwaway copy of `packages/` and `config/` in its own Git repository (register decision, pin and quota 1 exist only in the copy; mock `fetch` in a child process; made-up key). Proves consume, then claim, then exactly one request; the request contract; every outcome (HTTP 500, network, timeout, incomplete, wrong model, malformed, blocked, nested metadata) is one request, spent, no raw text or key stored; settlement and artifact failures; 12 refusal cases with nothing consumed or reserved; caller-supplied roots, quota, clock, provider and call ignored; the real repository untouched.
- `tests/unit/proposal-production.test.ts`: against the real repository the runner stops at authorization (no key read via an instrumented env, no network, no directories created); pre-flight refusals; forged arguments; the zero-argument transport (one strict, low-reasoning, 3072-token request to `api.meta.ai`; no retry even with retries configured; missing/malformed key, model override, billable off, foreign base URL fail before any request).
- `tests/security/live01b-prep-boundary.test.ts`: activation locks unchanged, no live CLI, the runner is dormant and unreachable, fixed order (pre-flight, read-only authorization, provider, consume/claim, shared tail), only the production gate and the transport, one provider invocation in the module, one transport importer, no exception text stored.
- Guard removal: 15 mutants (skip or reorder authorization, skip pre-flight, open the provider after consumption, second call, stored exception text, no settlement, caller-controlled evidence root, key read by the descriptor, retries, dropped model pin, dropped billable check, forced billable flag, wrong settlement store, moved evidence root) are all caught; the evidence-root mutant first survived and was killed by a runtime test and a tighter static check.

## C3-LIVE-01A approval-gate checks (zero network, synthetic)

- `tests/unit/live-approval.test.ts`: single use, every mismatch/expiry/replay/forgery refusal, file attacks (symlink, hard link, traversal, loose modes), concurrent use, crash points, TOCTOU re-checks, the interactive CLI (non-TTY, wrong/replayed confirmation, dirty tree, no approved decision) and the 11-scenario rehearsal under a global `fetch` trap.
- `tests/security/live01a-boundary.test.ts`: empty register, quota 0, entry point disabled, no provider/env/credential/execution code in the approval modules, staging runner and coordinator never import them, test-only injection is unreachable from production, records gitignored and untracked, fixed fail-closed order.
- `node scripts/c3-live-rehearsal.ts` is the zero-network rehearsal (synthetic; not an authorization). `scripts/c3-approve-live-run.ts` needs a real terminal and refuses today because no decision is approved; do not run it to create a real record in this milestone.
- Remediation tests (MAJOR-1/2, MINOR-3): production API ignores forged roots, probes, registers, quotas and clocks; a simulated positive quota against the real repository still authorizes nothing; real throw-away Git repositories prove a valid owner-pinned revision, an unauthorized newer clean commit, a pin-only re-record, a changed decision reference, a wrong digest/missing commit and dirty trees; ancestor-directory modes 0777/0775/0757/0722, symlinked and non-directory parents; static tests restrict importers of the injectable core.
- Revision-identity tests (residual MAJOR-2): real disposable Git repositories show A then pin-only A' accepted, A' then `--allow-empty` refused, revert/recommit refused, an empty commit before the pin refused, a merge refused, a same-tree sibling as the pinned commit refused, code/config/pin-reference changes refused, a pin+code bundle refused, and the documented re-pin procedures accepted; every refusal is asserted at both the validator and the CLI.
- Guard-removal testing: each check on the authorization boundary was removed one at a time and the two test files re-run; see the PR for the result.

## C3-B2A readiness checks (zero network)

- `node scripts/c3-proposal-preflight.ts [--provider meta|baseten] [--write]` runs the deterministic offline preflight (mock literals only; `--check-credentials` reports a boolean and only when authorized). Exit 0 means the technical checks passed and says nothing about authorization.
- `node scripts/baseten-model-discovery.ts` is a dry run; a real request is owner-run only (`--execute` with `PROOFPILOT_ALLOW_PROVIDER_DISCOVERY=1`) and is never part of validation.
- Unit tests: `tests/unit/proposal-readiness.test.ts`, `tests/unit/baseten-discovery.test.ts`. Security: `tests/security/b2a-boundary.test.ts` (hard-disabled entry point, hand-authored-only coordinator, no secrets committed, decision record NOT APPROVED).
