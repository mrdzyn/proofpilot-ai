# UI-C3-02-D9 Runbook — Historical One-Shot Evidence and Proposed Repeatable Mode

> **Status: HISTORICAL PROCEDURE, NOT A CURRENT LIVE AUTHORIZATION.**
> **D9-LIVE-01 and D9-LIVE-02 are both SPENT (§7 and §9). Never reset or reuse their ledgers.**
> Sections 0–7 document the **original, completed one-shot policy** and must not
> be followed to start a new live companion. On November 2, 2026 the owner adopted
> a new *product direction*: repeatable, manually triggered Baseten analyses
> under a future standing-session authorization ([Issue #39](https://github.com/mrdzyn/proofpilot-ai/issues/39)).
> That mode is **not implemented**: the existing CLI still enforces 0 or 1
> live analysis and zero live proposals. No new provider call is authorized
> by this runbook, policy decision, or PR. See §10 for the pending design.
> The hackathon key requires exactly `meta-models/muse-spark-open-1026`.
> The generic unsuffixed public model was approved in error in PR #36 and
> must remain refused.

## 0. Original D9-LIVE-01 prerequisites — historical only

- D1: workspace + single-use allowance — authorized **one analysis, zero
  proposals**, no re-arm on restart (owner authorization 2026-11-02).
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

## 1. Original preflight procedure — historical reference only

1. `git status` clean; checkout the audited activation HEAD (posted in the
   Draft PR report).
2. `pnpm lint`, both `tsc --noEmit` configs, `pnpm test:unit`,
   `pnpm test:security` — all green (CI must also be green on the exact HEAD).
3. Confirm `D9_APPROVED_MODEL` is exactly `meta-models/muse-spark-open-1026`
   (one const in `packages/live-analysis/src/config.ts`); anything else —
   including the unsuffixed public `meta-models/muse-spark-open` — refuses.
4. Confirm the spent-record path (durable, outside the repo, mode 0600) is
   empty or holds only already-spent entries you accept.
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

## 2. Historical one-shot approval capture

Record, outside the repo: date/time, exact model ID, media SHA-256, budget
(1 analysis / 0 proposals), record path, and the explicit one-shot go-ahead.
One approval authorizes exactly one provider attempt.

## 3. Historical one-shot execution recipe — NOT re-authorized

```sh
pnpm --dir dashboard build
node scripts/c3-live-analysis.ts --port 5188 --serve "$PWD/dashboard/dist" \
  --live --live-analyses 1 --live-proposals 0 \
  --live-spent-record "$HOME/.proofpilot/live-spent.jsonl" \
  --live-approval-id "<fresh-approval-id-from-§2>" \
  --live-media-sha256 e9df68b14c48300818f9ec9407b884413037f29305f17a5da3cc4fac05eeafdf
```

The approval id must be fresh for a first-time path (it anchors the record
genesis); on restart against the initialized record it is not needed. Never
reuse an approval id across paths to "restore" a deleted record — that is a
new attestation, and §4b applies.

Then, in the companion terminal: `pair`, `permit analyze <sha256> <bytes>`
for the pinned clip, upload + analyze via Zone L, observe the single result,
`quit`. Expected: exactly one POST; run shows `baseten-live` provenance,
`UNVERIFIED` status, reported usage. Any refusal (`MODEL_UNAVAILABLE…`,
`MEDIA_NOT_PINNED`, `QUOTA_SPENT`, `LIVE_SPEND_RECORD_FAILED`,
`LIVE_ATTEMPT_EXHAUSTED`) ends the attempt — **do not retry**; a failed
authorization never restores, and a sent attempt is permanently spent.

## 4. Historical cancellation / revoke / shutdown

- Zone L Cancel or terminal `revoke` cancels the in-flight run; staged bytes
  are deleted; the spent authorization is NOT restored (by design).
- `quit`, SIGINT, or SIGTERM cancels in-flight runs, then deletes staging.
- `kill -9` / power loss can strand staging roots; they are swept on next
  startup (`sweepStaleStagingDirs`) — the spent record is unaffected (append
  happens before the send, never after).

## 4b. Historical rollback / lock policy

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

## 4c. Historical supervised crash recovery

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

## 5. Historical post-run reconciliation

1. `cat` the spent-record file: exactly one new chained entry
   (`runId`, media SHA-256, `analyze`).
2. Zone L result: provider `baseten`, exact model echo, run ID, quoted
   observations, reported prompt/completion/total tokens (reported, never
   billing), `LIVE VIA BASETEN — UNVERIFIED` chip.
3. Re-running any live request with the same record path refuses
   `QUOTA_SPENT` with zero provider calls (non-rearmable proof).
4. Record the outcome (success/refusal code, usage) next to the §2 approval.

## 6. Historical disable / re-lock

1. Unset the three variables in the owner shell; rotate the key if it was
   ever displayed, logged, or pasted outside the owner terminal.
2. Restart the companion WITHOUT `--live` (mock fallback) and confirm the
   mock banner and mock quota in `/api/status`.
3. Open a separately reviewed disable/re-lock change; do not leave live mode
   enabled for routine use. No automatic closure: the one-shot demo does not
   authorize any further attempt.

## 7. D9-LIVE-01 outcome (owner-reported, recorded; agent did not run it)

- **Verdict: REFUSED.** The owner-operated one-shot POST against the
  hackathon-issued key returned `TRANSPORT_HTTP` **HTTP 403** — the account
  rejected the request. No model output was produced; nothing was rendered
  from a provider.
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

## 8. Post-PR #37 status — historical second-attempt planning

- **Correct model:** PR #37 is merged as `main@84b03a46ca4141b42f7e733e87c0acbd31af8501`; the hackathon-issued model is exactly `meta-models/muse-spark-open-1026`, and the unsuffixed public model refuses.
- **Owner-reported catalog preflight:** on November 2, 2026, one authenticated, non-inference `GET /v1/models` returned `preflight: ok account-reachable model-listed catalog=21 endpoint=https://inference.baseten.co/v1`. A catalog listing is not proof of a successful inference POST, video acceptance or billing outcome.
- **Video compatibility risk:** Meta/Baseten general Muse Spark Open documentation describes the typed `video_url` part and video support; it does **not establish** that the account-scoped `-1026` hackathon deployment accepts the exact inline MP4 data URL currently encoded here. A new attempt could refuse after its own send-boundary spend.
- **Historical D9-LIVE-02 authorization:** the second attempt was separately approved as a one-shot (one analysis, zero proposals, no retries) and consumed. This describes **past execution**, not the new policy. Both D9-LIVE-01 and D9-LIVE-02 ledgers are spent and immutable. A future standing-session authorization and *new* separate multi-attempt ledger may be created only once the proposed Issue #39 implementation has passed independent audit and its merge and live activation are explicitly approved; no new file is required for every manual click within that authorized session.
- **Mock-label caveat:** Zone L contains static `MOCK` copy and an action button labeled `Analyze with mock fixture` even while `--live` is armed. A click in armed live mode **may send a billable POST**. Confirm the Terminal LIVE banner before clicking and rely on final `baseten-live` result provenance, not UI copy. Perform rehearsal in default mock mode.
- **Stop after any outcome:** do not retry after HTTP refusals, network failures or timeouts; preserve both old and any newly approved spend records, shut down the companion with `quit`, and report observations as unverified rather than as a proven fix.

## 9. D9-LIVE-02 outcome — owner-reported demo, second distinct one-shot

- **Verdict: REFUSED — `TRANSPORT_SHAPE`.** On 2026-11-02 the owner armed a new, separately recorded one-analysis/zero-proposal companion against `meta-models/muse-spark-open-1026` with the certified F01 media hash, then locally staged F01 and clicked Analyze once. Zone L reported `Refused (TRANSPORT_SHAPE): live response envelope malformed`.
- **Transport inference from code (not a raw-provider transcript):** `TRANSPORT_SHAPE` with this exact detail is emitted after an HTTP 2xx response and successful JSON parsing, when the strict envelope validator rejects the returned structure. The validator checks model echo, `choices[0].message.content`, usage fields and finish reason; `TRANSPORT_SHAPE` is not field-specific. No response body is retained in the normal path, so the actual mismatch, generated content, token usage and billing cannot be inferred. No successful or verified model observations were produced.
- **Spend:** the send-boundary allowance for D9-LIVE-02 is **SPENT**, including on a shape refusal. The owner-side new ledger path is `~/.proofpilot/d9-live-02-spent.jsonl` (owner-supplied ledger independently reconciled: exactly one genesis and one `analyze` spend, SHA-256 digest chain recomputed and matched both stored digests; `runId=local-2026-11-02-001`, certified F01 SHA-256, spent at 2026-11-02T10:23:18.356Z). This verifies the supplied ledger's internal consistency, not provider billing. Preserve this and the original `~/.proofpilot/live-spent.jsonl` unchanged; do not overwrite, delete, recreate, or bootstrap a third path without a separately reviewed and explicitly authorized decision. No retry is authorized.
- **Possible diagnostic weakness (NOT a confirmed root cause):** the current validator requires non-empty text before inspecting `finish_reason`. Muse Spark Open reasoning can exhaust output budget before final content; this request caps `max_tokens` at 1,024. A response with empty content and `finish_reason: "length"` would be labeled `TRANSPORT_SHAPE` instead of `TRANSPORT_TRUNCATED`. Other malformed response shapes remain possible. Resolve with offline, synthetic contract tests and official provider evidence; do not collect/raw-log secrets or model reasoning, and do not issue real-provider requests as part of diagnosis.
- **Demo status:** no accepted live Baseten analysis output. The safe public demonstration remains the default mock workflow plus real Playwright baseline/oracle evidence, labeled honestly. The second attempt is not a verified fix or successful inference result.

## 10. Issue #39 — pending repeatable, manually initiated Baseten analysis policy

- **Decision vs implementation:** On 2026-11-02 the owner chose to remove ProofPilot's *application-level* one-analysis limit. [Issue #39](https://github.com/mrdzyn/proofpilot-ai/issues/39) is the implementation contract; it is open and **not yet implemented, merged, or activated**. The present `scripts/c3-live-analysis.ts` rejects `--live-analyses` values above 1. Do **not** use a new record path, altered budget, script patch, or ad hoc restart to circumvent the current gate. The `--live-analyses unlimited` option is **proposed syntax, not a working command**.
- **Standing-session scope (future, if independently reviewed and owner-activated):** explicit owner-started opt-in; model pinned exactly to `meta-models/muse-spark-open-1026`, certified F01 media only, zero proposals, no auto-retries, no unattended requests. Each live inference requires a **fresh terminal-issued, file/hash/action-bound permit**, local upload and deliberate user click. One owner-approved session may include multiple distinct manually initiated analyses; it does **not** require separate high-level approval or a new ledger for each click. Preserve exclusive-lock and append-only fsync-before-POST spending per attempt, with unique run identities.
- **Ledger continuity:** the original `~/.proofpilot/live-spent.jsonl` (D9-LIVE-01) and `~/.proofpilot/d9-live-02-spent.jsonl` (D9-LIVE-02) remain **SPENT, immutable historical evidence**. Any newly reviewed repeatable mode needs its **own explicit standing-session approval and distinct audit ledger**; do not reset, delete, migrate or reuse the old approval genesis or spent history to rearm. A network failure, shape refusal or token-limit response still counts as a spent attempt.
- **Financial and technical bounds:** the organizer offered **$100 in credits** and **up to 2 million tokens/minute**; that is not unlimited free inference. Actual billing, rate limits and a user-visible per-request cost boundary remain provider-dependent. Before live activation, resolve the open `TRANSPORT_SHAPE` classification with *offline fake-response fixtures* and truthful live/mock UI labels. No secret access, real-model test POST, automatic retry, or code execution is authorized by this documentation change.
- **Current operator action:** use the **default mock-only demonstration**. Await the reviewed Issue #39 implementation and a separate owner approval to activate a new standing live session; do not follow the retired §3 command to launch another one-shot.
