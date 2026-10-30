# C3-B2B Real-Proposal Verification Procedure — DISABLED

> **STATUS: DISABLED. DO NOT RUN.** This procedure is a plan for a separately authorized future.
> Every execution gate below stays closed: the E2 run function refuses unattested runs, the
> operator command refuses `c3-live-meta-001` before any file read (`REAL_ARTIFACT_DISABLED`),
> and the exported E2 verifier refuses the reserved run id at its own boundary. Enabling a real
> run requires (a) an explicit owner execution approval naming the exact revisions below,
> (b) the P2 ancestor-swap owner risk decision, (c) a new independent security review, and
> (d) a reviewed code change — there is no flag, environment variable or credential that lifts
> the disable. No step of this procedure has been executed.

## 1. Authorization prerequisites (all required, in order)

1. **Owner execution approval**, recorded out of band, naming:
   - the verification revision `V` (a specific `main` HEAD; must be a descendant of the
     pinned activation commit per the LIVE-C3-01 record),
   - the claimed source revision `S` and its fixture tree + analysis id from the certified
     baseline evidence,
   - acceptance of the SEC-P2-01 residual risk (same-UID writer) or the isolation in place.
2. **P2 ancestor-swap risk decision** (see `docs/SEC-P2-01-FINDINGS.md`): either a read-only
   snapshot / separate-UID run, or documented single-writer owner-machine operation.
3. **Independent security review** of the exact HEAD to be run, after the enabling code change.

## 2. Exact parameters (fixed at authorization time, not before)

| Parameter | CLI flag | Source (at authorization) |
|---|---|---|
| Run id | `--run-id` | `c3-live-meta-001` (reserved; the hard-disable is lifted only by the reviewed change) |
| Source revision | `--source-sha` | Claimed source SHA from the certified baseline evidence |
| Source fixture tree | `--source-fixture-tree` | Tree recorded by that baseline |
| Source analysis id | `--source-analysis-id` | Analysis id from the certified baseline evidence |
| Verification revision | `--verification-sha` | The authorized `main` HEAD (`git rev-parse HEAD` must equal it) |

No other flags exist. In particular there is no execution-mode flag: invoking the command IS
the verification request, and the five values above are displayed back before and after the run.

## 3. Pre-run checks (owner, terminal)

1. `git status` clean; `git log --oneline -1` equals the authorized `V`.
2. `pnpm lint && pnpm typecheck && pnpm test:security` green at `V`.
3. Confirm the refusal drill still fails closed (proves the gate was reached, not bypassed):
   the disabled build must refuse `c3-live-meta-001` with `HARD-DISABLED`, exit `2`, and no
   evidence directory. After the enabling change, this drill is replaced by the review.
4. Confirm no other verifier run holds `.proofpilot/locks/c3-b1-coordinator.lock`.

## 4. The verification run

```sh
node scripts/c3-b2b-verify-proposal.ts \
  --run-id c3-live-meta-001 \
  --source-sha <S> \
  --source-fixture-tree <tree> \
  --source-analysis-id <analysis-id> \
  --verification-sha <V>
```

What happens, in order: read-only P2 artifact load and schema validation; Zone P
source-provenance check with the explicit parameters above; E1 identity-checked registration;
byte rebind of the artifact immediately before the run; a certified baseline plus up to three
fresh disposable-stage replays through the existing runner and oracle; verdict solely from
`decideVerification` over persisted evidence; an automatic revalidation of the persisted
bundle before anything is reported.

## 5. Reading the result

- Exit `0` means `VERIFIED`: baseline REPRODUCED at exactly `V`, three fresh replays, distinct
  nonces, both mobile and desktop checks, intact manifests, finalized evidence, served CSS
  verified, attested provenance. Anything else is not verification.
- Exit `1` means the pipeline completed with a non-VERIFIED verdict
  (`NOT_REPRODUCED`, `ORACLE_PASS`, `PATCH_FAILED`, `INCONCLUSIVE`) with the reason printed.
- Exit `2` means refused before completing (bad arguments, failed provenance/registration gate,
  busy lock, evidence that failed independent revalidation). Exit 2 never claims a verdict.
- Evidence: `.proofpilot/c3-b2b/MODEL-c3-live-meta-001-<stamp>/` — `verification.json`,
  `source-provenance.json`, `baseline/replay-1/`, `replay-1/` … `replay-3/`, each with
  `record.json` and the six required evidence files. Re-verify independently from these bytes;
  never from terminal output alone.

## 6. Stop / rollback procedure

- **Stop:** `Ctrl-C` or `kill <pid>`. The coordinator lock is released by the run function's
  cleanup; per-replay stage locks are released by the stage runner.
- **Stale lock:** if a killed run leaves `.proofpilot/locks/c3-b1-coordinator.lock` behind, the
  next run refuses with a busy error. Confirm no verifier process is alive
  (`lsof .proofpilot/locks/c3-b1-coordinator.lock`, empty output), then remove only that lock
  file. Never remove evidence directories to "clean up".
- **Rollback:** there is nothing to roll back in the repository — verification writes only
  gitignored evidence. To void a run, keep the evidence directory (it is the audit trail) and
  record the void reason next to it; start a new run (a new timestamped directory is created
  automatically). Filenames never collide across runs.
- **Failure behavior:** any refusal or non-VERIFIED verdict ends the procedure. Do not re-run
  with altered parameters to chase VERIFIED; file the outcome (section 7 of the QA runbook)
  and return to the owner for a new decision.

## 7. What this procedure must never become

- No provider calls, no credential reads, no reservation or quota changes.
- No HTML/JavaScript/free-form CSS execution beyond the closed grammar triples; no shell
  execution of model-supplied content.
- No weakening of the oracle, patch policy, activation pin, quotas or hand-authored controls.
- No new dependencies without independent review.
- No representation that a `VERIFIED` row for the model proposal inherits, equals or affects
  the PC-1 hand-authored verdict. Separate identities, separate evidence, separate rows.
