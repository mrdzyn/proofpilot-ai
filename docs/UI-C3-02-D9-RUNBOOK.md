# UI-C3-02-D9 Runbook — Owner-Only One-Shot Live Demonstration

> **Status: PROCEDURE ONLY. No live call is authorized by this document.**
> Every live step below requires the pending owner decisions D1–D7 and D9,
> a green independent audit of the activation PR, and an explicit one-shot
> owner approval immediately before the request. D9 is `null` until then.

## 0. Prerequisites (owner decisions, all pending)

- D1: workspace + single-use allowance — proposed **one analysis, zero
  proposals**, no re-arm on restart.
- D2: spend risk accepted (reference only: ~$1.25/M input, $4.25/M output
  per Baseten's Nov 2026 listing; video-token cost unknowable in advance).
- D3: exact F01 media identified (proposed: certified mobile clip, SHA-256
  `e9df68b14c48300818f9ec9407b884413037f29305f17a5da3cc4fac05eeafdf`).
- D4: key ownership/revocation understood; key stays in the owner shell.
- D5: synthetic-video transfer + provider retention accepted.
- D6: permission to record/display provider, run identity, usage.
- D7: sequencing (separate review → activation audit → merge → one-shot).
- D9: exact direct-Baseten model ID recorded and account-proven. Proposed:
  `meta-models/muse-spark-open`. Never an alias.

## 1. Preflight (owner Mac, no credentials needed)

1. `git status` clean; checkout the audited activation HEAD (posted in the
   Draft PR report).
2. `pnpm lint`, both `tsc --noEmit` configs, `pnpm test:unit`,
   `pnpm test:security` — all green (CI must also be green on the exact HEAD).
3. Confirm `D9_APPROVED_MODEL` is the exact approved ID (one const in
   `packages/live-analysis/src/config.ts`); anything else refuses.
4. Confirm the spent-record path (durable, outside the repo, mode 0600) is
   empty or holds only already-spent entries you accept.
5. `node scripts/c3-live-analysis.ts --live --port 0` with NO key set must
   exit 2 naming the first failing gate. Then export the three variables in
   your shell (values never pasted anywhere else):
   `BASETEN_API_KEY`, `BASETEN_API_BASE_URL`, `BASETEN_MODEL`.

## 2. Approval capture

Record, outside the repo: date/time, exact model ID, media SHA-256, budget
(1 analysis / 0 proposals), record path, and the explicit one-shot go-ahead.
One approval authorizes exactly one provider attempt.

## 3. One-shot execution (owner terminal only)

```sh
node scripts/c3-live-analysis.ts --port 5188 --serve none \
  --live --live-analyses 1 --live-proposals 0 \
  --live-spent-record "$HOME/.proofpilot/live-spent.jsonl" \
  --live-media-sha256 e9df68b14c48300818f9ec9407b884413037f29305f17a5da3cc4fac05eeafdf
```

Then, in the companion terminal: `pair`, `permit analyze <sha256> <bytes>`
for the pinned clip, upload + analyze via Zone L, observe the single result,
`quit`. Expected: exactly one POST; run shows `baseten-live` provenance,
`UNVERIFIED` status, reported usage. Any refusal (`MODEL_UNAVAILABLE…`,
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

## 5. Post-run reconciliation

1. `cat` the spent-record file: exactly one new chained entry
   (`runId`, media SHA-256, `analyze`).
2. Zone L result: provider `baseten`, exact model echo, run ID, quoted
   observations, reported prompt/completion/total tokens (reported, never
   billing), `LIVE VIA BASETEN — UNVERIFIED` chip.
3. Re-running any live request with the same record path refuses
   `QUOTA_SPENT` with zero provider calls (non-rearmable proof).
4. Record the outcome (success/refusal code, usage) next to the §2 approval.

## 6. Disable / re-lock (mandatory after the one-shot)

1. Unset the three variables in the owner shell; rotate the key if it was
   ever displayed, logged, or pasted outside the owner terminal.
2. Restart the companion WITHOUT `--live` (mock fallback) and confirm the
   mock banner and mock quota in `/api/status`.
3. Open a separately reviewed disable/re-lock change; do not leave live mode
   enabled for routine use. No automatic closure: the one-shot demo does not
   authorize any further attempt.
