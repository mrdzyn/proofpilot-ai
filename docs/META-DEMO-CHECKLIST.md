# META-DEMO-01 — offline, provider-free, real-artifact-read-free demo preparation checklist

> Anchored to `main@b841740a95ebd39cabb47fa73ea1329803f79d88` (PR #24 squash merge).
> Every step below is offline: no provider call, no credential read, no read of the
> stored model artifact, no execution of model-generated code. It is not literally
> read-only — setup and evidence-recording steps write local synthetic material only
> (installed dependencies, gitignored run/evidence directories), never the model
> artifact, credentials, approvals or reservations. Check each box only with the exact
> evidence named; do not substitute memory or prior runs.

## 1. Clean checkout at the exact main SHA

- [ ] `git checkout b841740a95ebd39cabb47fa73ea1329803f79d88`
- [ ] `git rev-parse HEAD` prints `b841740a95ebd39cabb47fa73ea1329803f79d88`
- [ ] `git status` is clean (no modified, staged or untracked evidence-relevant paths)
- [ ] `pnpm install --frozen-lockfile` completes (writes local dependencies only;
  Playwright Chromium installed for any browser step:
  `pnpm exec playwright install chromium`)

## 2. F01 baseline reproduction (offline, trusted oracle only; writes gitignored local evidence)

- [ ] `pnpm f01:baseline` exits `0` with all four key lines
  (`docs/QA-01-RUNBOOK.md` §2): `oracle exit code: 1`,
  `baseline verdict: REPRODUCED`, `desktop regression: PASS`,
  `certified exact-SHA: YES`
- [ ] Evidence dir `.proofpilot/runs/f01-baseline-*/baseline-summary.json` exists
  (gitignored, local); mobile `cartCountAfter` is `0` with `hitTestTarget:
  promo-overlay`, desktop cart is `1`
- [ ] Record the run directory name and the four lines verbatim for the QA checklist

## 3. Recorded Muse Spark video-analysis result (historical record only)

- [ ] No new analysis is run: both C2B run IDs are spent and a further provider call is
  NOT AUTHORIZED (`docs/STATUS.md` authorization block)
- [ ] Recorded values transcribed from `docs/STATUS.md` §C2B (agent-reported run 002):
  provider status `completed`, local `VIDEO_ANALYZED`, schema-valid `Symptom`
  (`provenance: model-hypothesis`), usage 2773 / 1129 (665 reasoning) / 3902,
  request ids `44a30289-e276-4645-9ba2-01402b5f4241` (upload) /
  `585e7494-7cdd-44a1-b6ed-44f48a03bb44` (response), remote file reported deleted
- [ ] Run 001 recorded as `PARTIAL` (`ANALYSIS_FAILED` / `RESPONSE_NOT_COMPLETED`) —
  the video must mention the discarded run

## 4. Recorded Meta proposal summary (reviewed documentation only)

- [ ] Values taken **only** from `docs/LIVE-C3-01-EXECUTION-REPORT.md` §2 — never by
  opening `.proofpilot/evidence/proposals/c3-live-meta-001/` (access NOT APPROVED)
- [ ] Recorded (the third Meta attempt overall; the first two were the C2B video
  analyses in §3 above): `PROPOSAL_ACCEPTED`, lifecycle `completed`, 1,300 tokens
  (670 in / 630 out, 601 reasoning), one adjustment
  (`.promo-overlay` / `pointer-events` / `none`), response id
  `7cb1e5e2-3d88-42ab-9652-fcab88b690d8`, input 2,756 chars / SHA-256 `4e1466e8…f558`
- [ ] Label recorded verbatim: **`UNTRUSTED PROPOSAL — NOT VERIFIED`**

## 5. Hand-authored PC-1 scoreboard, VERIFIED 3/3 (the optional fresh run writes gitignored local evidence)

- [ ] Committed example on screen: `docs/examples/c3-b1-scoreboard.example.json`
  (from local run `c3-b1-20261028T084508Z-e27b62` at `bb64b73`) — PC-1 `VERIFIED`,
  `replaysPassed: 3`, `modelOrProviderCalls: 0`
- [ ] Optional fresh local confirmation (offline, safe on camera):
  `node scripts/c3-offline-verification.ts --approved-sha $(git rev-parse HEAD)`
  ends with `scoreboard re-verified from persisted evidence: OK` and
  `result: ALL EXPECTATIONS MET` (`docs/QA-01-RUNBOOK.md` §3)
- [ ] Explicitly recorded: PC-1 is **hand-authored** (`provenance: hand-authored-control`).
  The model's identical proposed adjustment is documented only in
  `docs/LIVE-C3-01-EXECUTION-REPORT.md` as UNTRUSTED — NOT VERIFIED: it has no
  scoreboard row and inherits no verdict from PC-1

## 6. Negative-control and security-gate evidence

- [ ] Scoreboard negatives visible: NC-1, NC-1b, NC-3 `PATCH_FAILED`; NC-6, NC-7
  `INCONCLUSIVE`; NC-5 `NOT_REPRODUCED`
- [ ] Refusal drill rehearsed (offline, exit `2`, no evidence created).
  Copy/paste exactly — synthetic format-valid SHAs so the real-id gate is reached
  (angle brackets would be read as shell redirection and never reach the gate):

  ```sh
  node scripts/c3-b2b-verify-proposal.ts --run-id c3-live-meta-001 \
    --source-sha aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
    --source-fixture-tree bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
    --source-analysis-id demo-source \
    --verification-sha cccccccccccccccccccccccccccccccccccccccc
  ```

  Expected (stderr): `refused: c3-live-meta-001 is the real stored model proposal and
  its execution path is HARD-DISABLED (no owner execution approval, no security review
  of a real run). This command verifies synthetic fixtures only.`
  (`docs/QA-01-RUNBOOK.md` §6)
- [ ] Optional: `node scripts/c3-proposal-preflight.ts` reports zero provider requests
- [ ] Quota/gate state confirmed from `docs/STATUS.md`: lifetime quota spent, repository
  ineligible for live attempts (`REVISION_NOT_APPROVED` after PR #18)

## 7. Redaction and secret-exposure checks (before recording and before upload)

- [ ] `pnpm lint` reports `0 problems` (includes the credential-assignment rule over
  tracked `.ts/.mjs/.js/.json/.md/.yml` files)
- [ ] No secret-shaped content in anything shown on screen: search the visible files for
  key-shaped tokens, private keys, assigned provider keys and `Bearer` material;
  `.env.local`, approval records, reservation files and `.proofpilot/` stay off camera
- [ ] No private filesystem paths on screen: generic prompt, `$HOME` redacted, no
  account identifiers, no machine-specific temp dirs quoted without redaction
- [ ] Final video re-watched end to end against `docs/META-DEMO-QA-CHECKLIST.md` before
  upload; portal duration/file/hosting rules verified (**PENDING** at time of writing)
