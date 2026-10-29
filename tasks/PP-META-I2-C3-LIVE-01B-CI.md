# PP-META-I2-C3-LIVE-01B-CI — CI execution context and activation-state-aware tests

- **State:** Implemented on a Draft PR; independent exact-head review pending. **Not merged.**
- **Base:** protected `main` at `f8f3e182212ec3f57b6502d98aacf8dee0e7df98` (activation commit A, PR #14).
- **Working branch:** `phase/pp-meta-i2-c3-live01b-ci-compat`
- **Why:** the independent audit of the pin-only Draft PR #15 ([comment](https://github.com/mrdzyn/proofpilot-ai/pull/15#issuecomment-6499228370)) found that hosted Stack validation (1) checked out GitHub's synthetic PR merge commit with a depth-1 fetch, where the production gate correctly refuses with `ACTIVATION_MISMATCH` (the pinned commit is not even present, and a merge commit is not a linear pin-only descendant), and (2) still contained real-repository tests that hard-code "the pin is empty".

> **THIS DOES NOT AUTHORIZE LIVE INFERENCE, A PIN, AN OPERATOR APPROVAL OR A MERGE.** `config/live-activation.json` stays `activation: null` here. The real provider invocation remains NOT AUTHORIZED. C3-B2B, UI-C3-01 and HOST-C3-01 remain NOT APPROVED. PR #15 (pin for A) stays Draft and unmerged and is superseded by the sequence below.

## Required order (any commit after a pin that is not pin-only invalidates that pin)

1. Audit and (owner-approved) squash-merge THIS PR: the merge commit is the NEW activation commit **A2**. The old commit A and its digest must not be reused.
2. Recompute the activation digest of A2; prepare a new pin-only Draft PR **A2′** based directly on A2; audit it; owner-approved squash merge.
3. Only then the operator preflight, the real single-use operator approval, credential injection and the owner's separate go-ahead for one request.

## What changed (no production authorization, activation-digest, provider, quota, reservation or approval code)

1. **`.github/workflows/ci.yml` (Stack validation).** Checks out `github.event.pull_request.head.sha || github.sha` with `fetch-depth: 0` and `persist-credentials: false`; a new step proves `HEAD` equals the expected SHA, the clone is not shallow, the base commit is available, and the tree is clean (before anything runs); a read-only step runs `scripts/c3-pin-check.ts`, which is informational for ordinary changes and **strict (`--require-valid`) when the change touches `config/live-activation.json`**, i.e. a pin change must leave a pinned tree and a linear pin-file-only descent from the pinned commit, exactly what the production gate demands. `workflow_dispatch` keeps working (falls back to `github.sha`); the required gates, their order and the SHA-pinned actions are unchanged (asserted by a test). The reusable Common validation workflow is untouched (it runs no Git-lineage logic).
2. **`scripts/c3-pin-check.ts`** (new, read-only, offline, no environment or credential access).
3. **State-aware tests** (`tests/support/real-gate.ts`, a test-only oracle built from read-only Git primitives): tests that observe the REAL checkout assert the exact code of its pin state: unpinned → `ACTIVATION_NOT_PINNED`; validly pinned, no operator approval → `APPROVAL_MISSING`; pinned commit unreachable / wrong digest / other decision → `ACTIVATION_MISMATCH`; not the pinned tree / not a pin-only descendant → `REVISION_NOT_APPROVED`. No assertion was loosened to "any refusal". Retargeted: `live-approval` (3), `proposal-production` (2), `proposal-boundary` (MAJOR-2 meta/baseten), `live01b0-boundary`, `live01a-boundary` (2), `live01b-prep-boundary`, `b2a-boundary`, `live01b-prep-install-copy` (the copy's pin now starts empty regardless of the real file).
4. **Deterministic isolated fixtures** (`live01b-prep-install-copy.test.ts`): an activation-state matrix built from scratch and run through the real gate of a disposable copy: unpinned; validly pinned; wrong digest; nonexistent pinned commit; other decision reference; synthetic marker; a non-pin-only commit after the pin; a synthetic merge commit; a depth-1 clone that lacks the pinned commit (the hosted-CI failure) versus a full clone (valid). Each asserts the exact code, that the test oracle agrees, and that no credential was read, no approval consumed, no reservation or artifact made and no request sent. Plus the pin-check script's behaviour in each state.
5. **Documentation made pin-state-neutral.** Because the pin-only commit may not touch docs, the documents no longer claim the pin is "NOT RECORDED"; they point to `config/live-activation.json` as the authority (`null` = not recorded).

## Verified in both states

The suites pass with `activation: null` (this PR) and in a simulated pinned state (this branch's tree committed as a stand-in activation commit, then a pin-only commit written on top in a throwaway directory): see the PR description for the counts.

## Forbidden scope (observed)

Merging; an actual operator approval; reading a credential; any Meta/Baseten/Modal request; deployment; executing model-generated proposals; changes to production authorization, activation-digest algorithms, provider integration, quota, reservation behaviour or approval logic; a pin in this PR.
