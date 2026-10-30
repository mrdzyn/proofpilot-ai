# QA-01 — Operator QA Runbook (local human QA, owner-run)

Run everything below on the owner's own machine, from a clean checkout of the merged `main`.
No step contacts a provider, spends quota, reads credentials, or executes the stored model
proposal. The `c3-live-meta-001` execution path stays hard-disabled throughout (`REAL_ARTIFACT_DISABLED`).

## 0. Preconditions

- `git status` is clean; `git log --oneline -1` matches the expected merged HEAD.
- `pnpm install` completed (Playwright browsers installed for the browser steps).
- No other verifier run is in progress (each command refuses when its lock is held).

## 1. Gates (no browser)

| Command | Expected |
|---|---|
| `pnpm lint` | `policy lint: N files checked, 0 problems` |
| `pnpm typecheck` | clean, no output beyond the `tsc` line |
| `pnpm test:unit` | all pass (on a normal machine; the sandbox-only EPERM port failures do not occur here) |
| `pnpm test:security` | all pass |

Record the four results verbatim (pass counts) in the QA report.

## 2. F01 baseline (browser, trusted oracle only)

Command:

```sh
node scripts/f01-baseline.ts
```

What it does: stages the unmodified fixture app, runs the Playwright oracle (mobile 390×844,
desktop 1280×800), classifies the outcome deterministically, hashes the evidence and certifies
the baseline only when the tree is clean.

Expected output (key lines):

- `oracle exit code:    1 (non-zero expected: the mobile oracle fails on baseline)`
- `baseline verdict:    REPRODUCED`, `desktop regression:  PASS`
- `certified exact-SHA: YES` with no `NOT CERTIFIED` line
- `evidence dir:        .proofpilot/runs/f01-baseline-<stamp>-<rand> (<N> files hashed in baseline-summary.json)`

Exit codes: `0` certified (defect reproduced, desktop control passes, clean tree);
`1` not reproduced; `2` reproduced but the worktree is dirty or unknown (commit or revert the
listed paths and re-run — evidence is not bound to HEAD).

Evidence to inspect: `.proofpilot/runs/f01-baseline-*/` — `baseline-summary.json` (hashes),
oracle stdout, `a/obs-m.json` + `a/trace-m.zip` (mobile defect: promo overlay intercepts,
cart stays 0), `b/obs-d.json` + `b/trace-d.zip` (desktop control). Confirm the mobile
`cartCountAfter` is `0` with `hitTestTarget: promo-overlay` and the desktop cart is `1`.

## 3. Hand-authored PC-1 verification (browser, three fresh replays)

Command (from the repository root; `--approved-sha` defaults to the checked-out HEAD and must
equal it):

```sh
node scripts/c3-offline-verification.ts --approved-sha $(git rev-parse HEAD)
```

Expected output (key lines):

- `baseline gate:       REPRODUCED (certified in a fresh stage)`
- `[PC-1] ...` followed by `status:            VERIFIED  (replays passed 3/3, attempted 3)` and three `replay N: ORACLE_PASS ...` lines
- `scoreboard re-verified from persisted evidence: OK`
- `result:             ALL EXPECTATIONS MET`
- `evidence:           .proofpilot/c3-b1/<runId>/scoreboard.json`

Exit codes: `0` all expectations met on a clean tree; `1` any expectation failed, any replay
inconclusive, the scoreboard failed re-verification, or the DID-1 demonstration did not pass;
`2` expectations met but the harness worktree is dirty (evidence not bound to HEAD).

Evidence to inspect: `.proofpilot/c3-b1/<runId>/scoreboard.json` — `baseline.reproduced: true`,
`candidates` contains all six hand-authored controls with `provenance: hand-authored-control`,
PC-1 has `status: VERIFIED`, `replaysPassed: 3`, three `replay-N` entries each with
`evidenceDir: PC-1/replay-N`. Per replay, open `PC-1/replay-N/record.json`:
`outcome: ORACLE_PASS`, `label: PC-1`, `approvedSha` equals the run SHA, `manifest.approvedSha`
equals the run SHA, `mobile`/`desktop` both `passed` with `cartCountAfter: 1`, exactly one
`nonce` distinct across the three replays, `integrityAfterRun: intact`, `stageRemoved: true`,
`evidenceFinalized: true`.

## 4. Negative controls (no browser; refusal boundaries)

Run each file directly; all tests must pass:

```sh
node --test tests/unit/candidate-coordinator.test.ts
node --test tests/integration/c3-b1-coordinator.test.ts
node --test tests/security/provenance-boundary.test.ts
node --test tests/security/live01b-prep-boundary.test.ts
node --test tests/unit/model-proposal-registration.test.ts
node --test tests/unit/model-verification.test.ts
node --test tests/unit/proposal-artifact.test.ts
node --test tests/unit/source-provenance.test.ts
```

What they prove (spot-check at least one per family in the report):

- **NC-1..NC-7** (`candidate-coordinator.test.ts`, `c3-b1-coordinator.test.ts`): wrong desktop binary,
  inconclusive replay, interrupted run, concurrent coordinators, forged NC-5, missing/dropped
  evidence, DID-1 verdicts — all refused or reported truthfully.
- **MAJOR-1/3** (same files): forged counts, truncated replay lists, altered metadata, forged
  statuses, missing evidence — verification fails closed.
- **Zone P boundary** (`provenance-boundary.test.ts`): the provenance modules import no network,
  credential, process or write capability; the scanner catches double-quoted, side-effect,
  computed-dynamic and write-capable imports (mutation tests).
- **E1/E2 refusal batteries** (`model-proposal-registration.test.ts`, `model-verification.test.ts`):
  copies refused, forged registrations refused without running, tampered bytes/nonces/verdicts
  refused, real-artifact CLI invocation refused with exit 2 and no evidence created.
- **Artifact loader** (`proposal-artifact.test.ts`): symlinks (including intermediate dirs),
  FIFOs, loose modes, oversized files, swapped ancestor trees, duplicate/prototype-pollution keys
  all refused; bounded reads verified.

## 5. Playwright results primer

A passing replay record (`record.json`) always shows:

- `outcome: ORACLE_PASS`, `oracleRan: true`, `oracleExitCode: 0`
- `mobile.status` / `desktop.status`: `passed`; `hitTestTarget: add-to-cart`; `cartCountAfter: 1`
- `baselineIdentical: false` for control replays (the fix changes rendering), `true` only for the
  unmodified baseline replay
- `sourceProof`: two entries, both `served: true`, `hasNonce: true`, `bytesEqualStaged: true`
- `evidence`: the six required files, each present under the replay evidence dir

Any `PATCH_FAILED` names the failing replay (`reason: replay N ...`); any `INCONCLUSIVE` names
the cause (interrupted run, missing evidence, duplicate nonce). A `VERIFIED` status with
anything other than 3/3 clean passes is a defect — report it, do not explain it away.

## 6. E2 operator command (synthetic fixtures only)

```sh
node scripts/c3-b2b-verify-proposal.ts --run-id <synthetic-id> --source-sha <sha> --source-fixture-tree <tree> --source-analysis-id <id> --verification-sha <sha>
```

Exit codes: `0` VERIFIED; `1` the pipeline completed with a non-VERIFIED verdict;
`2` refused before completing (bad arguments, the real artifact, a missing artifact, a failed
provenance gate, a refused replay path, a busy lock).

Refusal drill (part of QA, no browser involved):

```sh
node scripts/c3-b2b-verify-proposal.ts --run-id c3-live-meta-001 --source-sha <40-hex> --source-fixture-tree <40-hex> --source-analysis-id x --verification-sha <40-hex>
```

Must print the `HARD-DISABLED` refusal and exit `2`, creating no evidence directory.
(The E2 Draft PR merged with this drill as an automated test.)

## 7. Failure reporting template

For any deviation, record and attach:

1. Exact command line and working directory (`pwd`, `git log --oneline -1`, `git status -sb`).
2. Exit code and the full terminal output (or the last 60 lines plus the first 20).
3. The evidence directory (`outDir` printed by the command) — `scoreboard.json` /
   `verification.json` plus the failing replay's `record.json`.
4. Which expectation from sections 2–6 was violated, quoted verbatim.
5. Whether the failure reproduces on a second run with a fresh output directory
   (do not delete the first run's evidence).

Do not edit source, tests or evidence to make QA pass. A red QA step is a finding, not a
task to fix inline: file it against the responsible slice and stop the run.
