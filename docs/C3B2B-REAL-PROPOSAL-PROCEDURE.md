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
- Evidence: `.proofpilot/c3-b2b/MODEL-c3-live-meta-001-<stamp>/` — everything the run
  persists sits one level down under `MODEL-c3-live-meta-001/`:
  `MODEL-c3-live-meta-001/verification.json`, `MODEL-c3-live-meta-001/source-provenance.json`,
  `MODEL-c3-live-meta-001/baseline/replay-1/candidate-record.json` and
  `MODEL-c3-live-meta-001/replay-1/` … `replay-3/`, each with `candidate-record.json` plus
  the six required evidence files. Re-verify independently from these bytes; never from
  terminal output alone.

## 6. Stop / rollback procedure

- **Stop:** prefer a clean exit over signals — let the command finish the current replay if at
  all possible. If it must be stopped, `Ctrl-C` or `kill <pid>` requests termination, but an
  abrupt SIGINT/SIGTERM/SIGKILL is **not guaranteed to run the JavaScript `finally` cleanup**:
  locks may be left behind and the detached oracle process group (`node` + Playwright +
  fixture server) may survive the parent. A pathname check alone is never sufficient.
- **Interrupted evidence is invalid:** any run that did not exit by itself is inconclusive,
  whatever its partial output says. No verdict — VERIFIED or otherwise — may be read from an
  interrupted run. Keep the evidence directory untouched (it is the audit trail); never delete
  evidence to "clean up".
- **Stale lock:** a killed run may leave `.proofpilot/locks/c3-b1-coordinator.lock` (and/or the
  oracle lock) behind, and the next run will refuse with a busy error. The coordinator lock is
  an exclusive-create *file*, not a held file descriptor — `lsof <lockfile>` showing nothing
  does **not** mean no run is active, because the lock file sits on disk with no open
  descriptor for most of the run. Delete a stale lock **only after positively establishing
  that no related operation remains active**, all of these:
  1. No verifier entry point or child process tree is alive. Check **every** local entry point
     that can hold a lock or a stage — `f01-baseline.ts`, `c3-offline-verification.ts`,
     `c3-stage-spike.ts`, `c3-b2b-verify-proposal.ts`, and the real-Chromium integration path
     (`node --test tests/integration/c3-b1-coordinator.test.ts`) — plus their children
     (Playwright/Chromium, the fixture server). A `ps`/`grep` sweep is triage only, never
     proof on its own: enumerate each exact command line, verify PIDs individually, and do
     not match blindly on `node`. If any candidate process cannot be positively excluded,
     preserve the lock and require manual review.
  2. No live stage work exists. Stages are created as `proofpilot-stage-*` directories in the
     staging root — the default system temporary directory (`os.tmpdir()`, i.e. `$TMPDIR` on
     macOS/Linux) unless a caller supplies another `stageRoot` — and an active run maintains
     one for the bulk of its runtime. List the staging root (and any operator-supplied
     `stageRoot`) for `proofpilot-stage-*` entries and check for new entries or changing
     mtimes across two observations a minute apart. Evidence-directory timestamps may be an
     additional signal but are **not a substitute**: stage work happens outside the evidence
     tree. If any stage directory appears, changes, or cannot be accounted for, preserve the
     lock and require manual review.
  3. The oracle port is quiet: nothing listens on `4173` **and** no Playwright/Chromium
     processes remain from step 1. Port checks are supplemental — between stages the port can
     be quiet while the coordinator is still active — never sufficient alone.
  If any check is inconclusive, stop and require manual operator review — do not remove the
  lock. When all three positively pass, remove only the specific stale lock file, then re-run
  from scratch (a new timestamped directory is created automatically). Never delete a lock
  during ongoing or uncertain work.
- **Rollback:** there is nothing to roll back in the repository — verification writes only
  gitignored evidence. To void a run, keep the evidence directory and record the void reason
  next to it. Filenames never collide across runs. Locks are never auto-cleaned by any
  command; every stale lock requires the positive-confirmation protocol above.
- **Failure behavior:** any refusal or non-VERIFIED verdict ends the procedure. Do not re-run
  with altered parameters to chase VERIFIED; file the outcome (section 8 of the QA runbook)
  and return to the owner for a new decision.

## 7. What this procedure must never become

- No provider calls, no credential reads, no reservation or quota changes.
- No HTML/JavaScript/free-form CSS execution beyond the closed grammar triples; no shell
  execution of model-supplied content.
- No weakening of the oracle, patch policy, activation pin, quotas or hand-authored controls.
- No new dependencies without independent review.
- No representation that a `VERIFIED` row for the model proposal inherits, equals or affects
  the PC-1 hand-authored verdict. Separate identities, separate evidence, separate rows.
