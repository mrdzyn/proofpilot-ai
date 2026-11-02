# UI-C3-02-D9 Runbook — Owner-Only Repeatable Live Analysis

> **Status: PROCEDURE ONLY. No live call is authorized by this document.**
> D9 approves the hackathon-issued `meta-models/muse-spark-open-1026`
> (organizer's Baseten email: the hackathon-issued key works ONLY with this
> ID). The unsuffixed public ID `meta-models/muse-spark-open` was approved
> in error (PR #36) and is refused everywhere. Repeatable owner-supervised
> analysis runs under the standing policy in this runbook (issue #39): the
> budget alone never sends — every provider attempt additionally needs a
> fresh single-use terminal permit plus an explicit owner click in Zone L,
> and every send is durably recorded (never refunded, never retried, never
> parallel). The two historical one-shot ledgers (D9-LIVE-01, D9-LIVE-02)
> are frozen and can never authorize a new session (§7).

## 0. Prerequisites (owner decisions; D9 approved, execution gated)

- D1: workspace + repeatable standing allowance — analyses run only with
  **explicit per-attempt opt-in** (`--live-analyses N` or `unlimited`), zero
  proposals always, no auto-send, no retry, no parallel sends. Recorded
  spends persist across restarts: restarting the same ledger with the same N
  never restores budget (no re-arm on restart). Raising N on an existing
  ledger is a new explicit owner allocation — it increases remaining
  capacity (`remaining = N − recordedSpent`) and must be recorded next to the
  §2 approval like any other authorization; never raise N silently or to
  bypass a spent budget (owner standing policy 2026-11-02, issue #39;
  supersedes the single one-shot allowance of PR #34).
- D2: spend risk accepted (reference only: ~$1.25/M input, $4.25/M output
  per Baseten's Nov 2026 listing; video-token cost unknowable in advance).
- D3: exact F01 media identified (certified mobile clip, SHA-256
  `e9df68b14c48300818f9ec9407b884413037f29305f17a5da3cc4fac05eeafdf`).
- D4: key ownership/revocation understood; key stays in the owner shell.
- D5: synthetic-video transfer + provider retention accepted.
- D6: permission to record/display provider, run identity, usage.
- D7: sequencing (separate review → activation audit → merge → one-shot).
- D9: APPROVED — exact hackathon-issued model ID
  `meta-models/muse-spark-open-1026` pinned in `packages/live-analysis/src/config.ts`.
  Never an alias, never the unsuffixed public listing. Account-specific
  authorization (organizer email) is distinct from generic public
  documentation; a public listing never implies key access. Account
  availability is proven only by the owner-run §1 preflight, never by an
  agent.
- D10: standing approval identity — repeatable sessions bootstrap (and
  re-open) only under a versioned `d9live-v2-<owner-suffix>` identity on a
  NEW ledger file (durable, outside the repo, mode 0600). Historical
  geneses carry no such prefix, so historical ledgers can never authorize
  a repeatable session; pointing one at them refuses instead of repurposing
  them. One approval identity anchors exactly one ledger genesis.

## 1. Preflight (owner Mac; steps 1–4 need no credentials)

1. `git status` clean; checkout the audited activation HEAD (posted in the
   Draft PR report).
2. `pnpm lint`, both `tsc --noEmit` configs, `pnpm test:unit`,
   `pnpm test:security` — all green (CI must also be green on the exact HEAD).
3. Confirm `D9_APPROVED_MODEL` is exactly `meta-models/muse-spark-open-1026`
   (one const in `packages/live-analysis/src/config.ts`); anything else —
   including the unsuffixed public `meta-models/muse-spark-open` — refuses.
4. Confirm the spent-record path (durable, outside the repo, mode 0600).
   For a repeatable session this MUST be a new path you have never used
   before — never a D9-LIVE-01/D9-LIVE-02 file (those ledgers are frozen;
   startup refuses them for new sessions). An existing standing ledger
   re-opens only with its own genesis approval id; a foreign id refuses.
5. `node scripts/c3-live-analysis.ts --live --port 0` with NO key set must
   exit 2 naming the missing-key gate. Then export the three variables in
   your shell (values never pasted anywhere else):
   `BASETEN_API_KEY`, `BASETEN_API_BASE_URL`, and
   `BASETEN_MODEL=meta-models/muse-spark-open-1026` (exactly; the CLI also
   defaults to the D9 pin when unset, and any other value refuses).
6. Owner-run account preflight (never run by an agent; the only
   authenticated check in this runbook):
   `node scripts/c3-live-analysis.ts --preflight`
   must print `preflight: ok account-reachable model-listed catalog=<n>`
   and exit 0, with the listed ID exactly `meta-models/muse-spark-open-1026`.
   It performs exactly one non-billable `GET /v1/models` and prints no key
   material. A catalog that lists only the unsuffixed public ID does NOT
   count as listed — access is never inferred from the general model. Any
   refusal (`MISCONFIGURED`, `UNAUTHORIZED`, `HTTP`, `SHAPE`, or
   model-not-listed) is a STOP event: do not proceed to §3 — reconcile the
   account/key/model first.

## 2. Approval capture

Record, outside the repo: date/time, exact model ID, media SHA-256, budget
(exact `N` analyses or `unlimited` / 0 proposals), the NEW record path, and
the versioned standing approval identity `d9live-v2-<owner-suffix>` with its
session scope. A later increase of N on the same ledger is a new allocation:
record the new N and its authorization alongside the original approval. Each provider attempt additionally needs its own fresh
terminal permit plus an explicit owner click — the budget pre-authorizes
nothing by itself.

## 3. Repeatable execution (owner terminal only)

```sh
pnpm --dir dashboard build
node scripts/c3-live-analysis.ts \
  --port 5188 \
  --serve "$PWD/dashboard/dist" \
  --live --live-analyses unlimited --live-proposals 0 \
  --live-spent-record "$HOME/.proofpilot/live-standing-v2.jsonl" \
  --live-approval-id "d9live-v2-<owner-suffix>" \
  --live-media-sha256 e9df68b14c48300818f9ec9407b884413037f29305f17a5da3cc4fac05eeafdf
```

(Build the dashboard first so the same companion serves Zone L alongside
the API; `--serve none` runs API-only and cannot demonstrate the Zone L
click flow. Open `http://127.0.0.1:5188` in the owner browser.)

(Use a finite `--live-analyses N` for a bounded session; the rules below
are identical.) The approval id anchors the record genesis: EVERY positive
budget — finite or `unlimited` — requires an explicit `d9live-v2-` id, and
reopening the same ledger without it, or with a different id, refuses
(`LIVE_APPROVAL_MISMATCH`) instead of adopting or spending under a foreign
genesis. Never reuse an approval id across paths to
"restore" a deleted record — that is a new attestation, and §4b applies.

Then, per attempt, in the companion terminal and Zone L: `pair` (once per
companion), then `permit analyze <sha256> <bytes>` for the pinned clip,
upload + click Analyze, observe the result, and repeat for the next attempt
with a FRESH permit, FRESH upload, and FRESH click — never auto-run.
Expected per attempt: exactly one POST; run shows `baseten-live`
provenance, `UNVERIFIED` status, reported usage; the durable ledger gains
exactly one chained spend with a unique run id. Any refusal (`MODEL_UNAVAILABLE…`,
`MEDIA_NOT_PINNED`, `QUOTA_SPENT`, `LIVE_SPEND_RECORD_FAILED`,
`LIVE_ATTEMPT_EXHAUSTED`) ends the attempt — **do not retry**; a failed
authorization never restores, and a sent attempt is permanently spent.

## 4. Cancellation / revoke / shutdown

- Zone L Cancel or terminal `revoke` cancels the in-flight run; staged bytes
  are deleted; the spent authorization is NOT restored (by design).
- `quit`, SIGINT, or SIGTERM cancels in-flight runs, then deletes staging.
- `kill -9` / power loss can strand staging roots; they are swept on next
  startup (`sweepStaleStagingDirs`) — the spent record is unaffected (append
  happens before the send, never after).

## 4b. Rollback / lock policy (read before any restart after trouble)

- The spent-run record is exclusively owned while the companion runs (a
  `<record>.lock` sibling). A second companion on the same record path
  refuses `LIVE_RECORD_LOCKED` — never run two live companions on one path.
- If the record is deleted, truncated, or replaced, the companion refuses to
  start (`LIVE_SPEND_RECORD_MISSING` / `CORRUPT` / `ROLLBACK`). Do NOT
  recreate or "fix" the file by hand to proceed: reconcile first (compare the
  record against §5 evidence), then either restore the authoritative file or
  bootstrap a fresh path with a NEW `--live-approval-id`.
- There is NO automatic stale-lock takeover. Any existing lock — live or
  stale — makes a new companion refuse `LIVE_RECORD_LOCKED` and exit. The
  runtime never clears or replaces another process's lock. After a crash,
  follow the supervised recovery workflow in §4c; never delete the lock
  while a companion may be running.
- Residual risk (documented, accepted): a rollback that also removes the lock
  is locally indistinguishable from an earlier legitimate state. Any
  unexpected budget restoration (status shows attempts you did not expect)
  is a STOP event: do not send, reconcile under §5, re-approve explicitly.

## 4c. Supervised crash recovery (owner only, after any crash/kill -9/power loss)

Perform these steps in the owner terminal. Do NOT script them into an
automatic startup path.

1. Confirm NO companion is running on the record path (`ps` for the
   companion; one terminal only). Never clear a lock while a companion may
   be running — that is the double-spend you are preventing.
2. Read the lock file (`cat <record>.lock`): note the holder pid, nonce,
   tip, and creation time.
3. Confirm the holder is dead: `kill -0 <pid>` must report no such process.
   If the pid is alive, stop that process first and do NOT proceed.
4. Read the spent-record file (`cat <record>`): confirm the entries chain
   from the approved genesis (§5) and the spends match what you expect.
   If the record is corrupt, missing, or shows a spend you did not
   authorize: STOP, reconcile under §4b/§5, and bootstrap a fresh path with
   a NEW `--live-approval-id` if a fresh approval is needed.
5. Only now, remove the lock file by hand (`rm <record>.lock`). Never
   hand-edit the record file to re-arm it.
6. Restart the companion. If startup still refuses (`LOCKED`/`CORRUPT`/
   `MISSING`), STOP and reconcile — do not retry with force.
7. Record the recovery (holder pid, what the record showed) next to the §2
   approval.

## 5. Post-run reconciliation (per attempt)

1. `cat` the spent-record file: exactly one new chained entry per send
   (unique `runId` with the ledger sequence suffix, media SHA-256,
   `analyze`); `/api/status` shows the matching spent count.
2. Zone L result: provider `baseten`, exact model echo, run ID, quoted
   observations, reported prompt/completion/total tokens (reported, never
   billing), `LIVE VIA BASETEN — UNVERIFIED` chip; the mode banner reads
   LIVE with attempts-left/spent counters.
3. The next attempt needs a fresh permit, fresh upload, and fresh click —
   a settled run's staging and permit never carry over. On a finite ledger,
   spending the last budget refuses further sends `QUOTA_SPENT` with zero
   provider calls (restarting with the same N does not restore it); on
   `unlimited`, sends continue only through the same manual cycle.
   N is the owner-chosen configured budget, not a genesis-bound lifetime
   cap: raising N on the same ledger adds capacity and requires its own
   explicit owner allocation recorded next to the §2 approval.
4. Record the outcome (success/refusal code, usage) next to the §2 approval.

## 6. Disable / re-lock (mandatory when the session ends)

1. Unset the three variables in the owner shell; rotate the key if it was
   ever displayed, logged, or pasted outside the owner terminal.
2. Restart the companion WITHOUT `--live` (mock fallback) and confirm the
   mock banner in `/api/status`.
3. Open a separately reviewed disable/re-lock change; do not leave live mode
   enabled for routine use. No automatic closure: ending one repeatable
   session does not authorize spends on any other record path.

## 7. D9-LIVE-01 outcome (owner-reported, recorded; agent did not run it)

- **Verdict: REFUSED.** The owner-operated one-shot POST against the
  hackathon-issued key returned `TRANSPORT_HTTP` **HTTP 403** — the account
  rejected the request. No model output was produced; nothing was rendered
  from a provider. Owner-reported via PR #38: this attempt ran against the
  incorrect unsuffixed public model (corrected by PR #37 afterward).
- **Spend accounting:** exactly one send-boundary attempt was authorized and
  is durably recorded as **SPENT** in the owner-held spent-run record (the
  spend hook fires before the POST and is never restored, including on HTTP
  refusal). The budget is exhausted: any further live request with the same
  record path refuses `QUOTA_SPENT` with zero provider calls. Do NOT reset,
  delete, recreate, or otherwise change the historical record to re-arm it.
- **Billing:** unverified. Token counts were never reported (no 2xx usage
  block exists); no figure here is a billed amount or a cap.
- **Unresolved operational gates (block any further attempt):**
  1. HTTP 403 cause — whether the hackathon-issued key/model pairing,
     account scoping, or another account-side condition rejected the call —
     is unknown. A retry is NOT authorized; diagnosis is an owner decision
     with the organizer/account evidence, not a code change.
  2. Hackathon-specific video compatibility — no authoritative documentation
     in evidence establishes that the `meta-models/muse-spark-open-1026`
     deployment accepts the inline `video_url` data-URL part this companion
     sends. Until such documentation (or a separately authorized probe, which
     is NOT approved here) exists, video acceptance for the hackathon ID is
     an unresolved gate, independent of the 403.
- No code, test, record, or configuration change in this slice re-arms,
  retries, or reinterprets the spent attempt.

## 8. D9-LIVE-02 outcome (owner-reported via issue #39, recorded; agent did not run it)

- **Verdict: REFUSED.** The second owner-operated one-shot POST returned
  HTTP 2xx JSON that failed strict response validation as
  `TRANSPORT_SHAPE` — no model output was accepted, nothing was rendered
  from a provider. Zone L reported `Refused (TRANSPORT_SHAPE): live response
  envelope malformed` after the single Analyze click (owner-reported via
  PR #38). (The validator has since been corrected so a `length`
  finish reports `TRANSPORT_TRUNCATED` instead of the misleading SHAPE;
  either way the run refused and nothing normalized into a result.)
- **Spend accounting:** the send-boundary attempt was authorized and is
  durably recorded as **SPENT** in the owner-held record
  (`~/.proofpilot/d9-live-02-spent.jsonl`; D9-LIVE-01 used
  `~/.proofpilot/live-spent.jsonl`). Per the owner-supplied ledger check
  reported via PR #38, the D9-LIVE-02 file holds exactly one genesis and one
  `analyze` spend (`runId=local-2026-11-02-001`, certified F01 SHA-256,
  spent at 2026-11-02T10:23:18.356Z) with both SHA-256 digests recomputed and
  matching — internal ledger consistency only, not provider billing. Any
  further live request with the same record path refuses `QUOTA_SPENT`
  with zero provider calls. Do NOT reset, delete, recreate, or otherwise
  change the historical record to re-arm it.
- **Prior catalog check (owner-reported via PR #38, not an inference):**
  after PR #37, an authenticated non-inference `GET /v1/models` returned
  `preflight: ok account-reachable model-listed catalog=21`, listing the
  `-1026` ID. Catalog reachability proves neither inference success, video
  compatibility, nor billing. The organizer offer cited $100 in credits (up
  to ~2M tokens/minute); that bounds nothing about actual charges.
- **Billing:** unverified. No figure here is a billed amount or a cap;
  token figures in §5 reconciliation are reported usage only.
- The exact provider payload is unknown (owner-reported outcome only);
  `TRANSPORT_SHAPE` details never quote raw provider bodies, and refusal
  records contain no response text, credentials, or PII.
- Both one-shot ledgers (D9-LIVE-01, D9-LIVE-02) are frozen: no repeatable
  session may point at them (startup refuses), and their geneses carry no
  standing `d9live-v2-` identity.
