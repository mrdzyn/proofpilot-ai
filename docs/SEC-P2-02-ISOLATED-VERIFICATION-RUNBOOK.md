# SEC-P2-02 — Isolated Verification Runbook (authenticated synthetic path)

> Synthetic fixtures and offline checks only. The real stored proposal `c3-live-meta-001`
> stays HARD-DISABLED at the CLI and the exported E2 verifier. No step here enrolls, signs,
> loads, stages or executes it. No provider calls, no credentials.

## 1. Threat model and trust assumptions

- **Adversary:** any same-UID writer that can rewrite or replace proposal files,
  directories and metadata at any time, including between validation and use.
- **Guarantee:** a schema-valid substituted artifact never inherits trust from a
  previously validated one. Every substitution the authentication binding covers refuses
  with a named code (list in section 5).
- **Assumed, not proven here:** the integrity of the local checkout (the verifier code),
  the pinned trust roots (`config/artifact-trust-roots.json`) and the offline private key.
  An attacker who can modify those is inside the precondition failure this runbook states
  openly in section 8. The staging harness is not an OS sandbox; Playwright interception
  is not a sandbox; repeated path checks are not content authentication.
- **Distinguished always:** independently authenticated facts (a signature that verifies
  against a pinned key; recomputed hashes; Git-observed anchors) versus operator-reported
  history (run ids, source claims, evidence labels).

## 2. Key management and trust anchors

- Algorithm: Ed25519 via Node.js native `node:crypto`. No new dependencies.
- The private signing key **never** enters the repository, configuration files,
  environment fixtures, logs or verification evidence — not even encrypted, not even
  temporarily. Test keys exist only in memory inside `tests/unit/artifact-auth.test.ts`.
- Trust roots live in exactly one file, `config/artifact-trust-roots.json`
  (`{version: 1, keys: [{keyId, algorithm: 'ed25519', publicKeySpkiBase64, status}]}`),
  committed and reviewed. The production command loads **only** this file; there is no
  key flag, no trust-root flag, no bypass flag and no environment input. An empty key
  list trusts nothing (proven by test: a correctly signed manifest still refuses with
  `AUTH_UNKNOWN_KEY`).
- Rotation/revocation: a new reviewed PR edits the trust-roots file (`status` stays
  `'active'`; anything else refuses). Old manifests do not verify against new keys by
  accident: verification always names the manifest's `keyId` against the pinned list.
- A signature manufactured after the fact proves integrity **from enrollment forward**.
  It can never retroactively prove that Meta produced those bytes.

## 3. macOS setup prerequisites (owner-operated, NOT executed by this task)

No repository change can create an OS boundary, so the following stay explicit
owner-operated prerequisites for any future real run. None has been performed here.

1. **Protected checkout:** verify the working tree of the exact authorized HEAD from a
   separate trusted machine or a signed archive before running; `git status` clean and
   `git rev-parse HEAD` equal to the authorized verification SHA `V`.
2. **Single-writer window:** no other same-UID process may write under the repository or
   the evidence directory during the run. Confirm with the stale-lock protocol
   (stage-root check, all five verifier entry points, two observations a minute apart);
   on any doubt, stop.
3. **Evidence hygiene:** the evidence tree must not be world-writable; writable output
   stays under the namespaced `MODEL-<runId>-<stamp>/` directory, never beside trusted
   inputs.
4. **Optional stronger boundary (recommended, not required for synthetic runs):** run
   verification as a separate standard user that owns the evidence tree while the
   verifier checkout is read-only to it, or verify from a read-only snapshot of the
   evidence. Record which option was taken before any real run.
5. **No isolation claim without the above:** the repository does not label the staging
   harness, file permissions or path re-checks an OS sandbox, and no script here probes
   the machine to declare it isolated — such a self-check would be theater against the
   modeled adversary.

## 4. Synthetic verification commands

Prerequisites: clean tree on this branch, `pnpm lint && pnpm typecheck` green.

```sh
# Targeted proof of the authentication gate (synthetic keys in memory, real temp dirs):
node --test tests/unit/artifact-auth.test.ts

# Composition plus exact-command wiring (MINOR-4; harness restores trust roots byte-for-byte):
node --test tests/unit/artifact-auth-pipeline.test.ts

# Zone P boundary proof (the new module adds no builtin, member or Zone E edge):
node --test tests/security/provenance-boundary.test.ts

# Refusal drill for the real id on the authenticated path (exit 2, HARD-DISABLED, no evidence):
node scripts/c3-b2b-verify-authenticated.ts \
  --run-id c3-live-meta-001 \
  --source-sha aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  --source-fixture-tree bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
  --source-analysis-id synthetic-drill \
  --verification-sha cccccccccccccccccccccccccccccccccccccccc
```

Integration evidence (`tests/unit/artifact-auth-pipeline.test.ts`): a composition test
runs load → signature verification → E1 registration → cross-phase rebind to success on
one synthetic flow. The exact-command tests run copies of the real reviewed program
files (`packages/`, `package.json`, `scripts/c3-b2b-verify-authenticated.ts`) from a
disposable synthetic checkout outside the working repository, with the exact five-flag
contract, no key/path/mode flags and no environment input: a separate test trust-root
file at the checkout's normal relative path holds a fresh synthetic key, and unique
per-test run ids mean no fixed shared evidence directory. A valid binding advances
past authentication into a provenance refusal (exit 2, non-AUTH), while tampered
bytes refuse at the auth gate (manifest-binding text, no provenance stage reached).
Sequential, concurrent and SIGKILL-interrupted runs are covered, and production
`config/artifact-trust-roots.json` plus prior production evidence are snapshotted
read-only and asserted unchanged: the harness never writes to or deletes from the
real repository. The committed roots stay empty until a reviewed enrollment.

These tests establish command-to-provenance integration only. A full authenticated
synthetic end-to-end with a VERIFIED verdict is **not** runnable by design and is
**not** claimed: provenance requires certified baseline evidence no synthetic fixture
carries, and the three replays require the browser stage. The per-phase composition
is the same pipeline the existing E2 tests exercise with hand-authored controls
(green in hosted CI).

## 5. Expected refusal codes and exit statuses

| Situation | Code / exit |
|---|---|
| Missing, symlinked, non-regular or oversize manifest/signature sidecar | `AUTH_UNSIGNED`, exit 2 |
| Manifest not JSON / wrong shape / duplicate key / proto key / unknown field / missing field / bad type or value | `AUTH_MANIFEST_*`, exit 2 |
| Manifest valid but bound to different bytes, run id, input hash or source identity | `AUTH_MANIFEST_MISMATCH`, exit 2 |
| Signature not 88-char base64 or wrong length | `AUTH_SIGNATURE_MALFORMED`, exit 2 |
| Signature fails against the pinned key (tamper, replay, substituted key) | `AUTH_SIGNATURE_INVALID`, exit 2 |
| Manifest `keyId` not pinned | `AUTH_UNKNOWN_KEY`, exit 2 |
| Trust-roots file malformed / bad shape | `AUTH_TRUST_ROOT_*`, exit 2 |
| Pinned key unusable | `AUTH_KEY_MISMATCH`, exit 2 |
| Real reserved run id on either command | `REAL_ARTIFACT_DISABLED` / HARD-DISABLED, exit 2, no evidence |
| Substitution between authentication and staging | `ARTIFACT_CHANGED` on rebind, exit 2 |
| Pipeline completes, verdict not VERIFIED | exit 1 (never a refusal) |
| Baseline REPRODUCED + 3/3 replays + persisted revalidation clean | exit 0, `VERIFIED` |

## 6. Adversarial-test evidence

`tests/unit/artifact-auth.test.ts` (29 tests, all passing) covers, each fail-closed:

1. valid authenticated synthetic artifact passes; 2. modified bytes; 3. same-size in-place
   rewrite; 4. schema-valid substitution; 5. ancestor-directory replacement; 6. manifest
   symlink + artifact symlink; 7. missing / malformed / short / flipped / replayed
   signatures; 8. unknown key id + substituted public key; 9. altered run id, input hash,
   source revision, fixture tree or analysis id (each re-signed, each `MISMATCH`);
   10. malformed manifest shapes (8 exact codes); 11. strict trust-root shapes;
   12. substitution between authentication and staging (`ARTIFACT_CHANGED` + re-auth
   `MISMATCH`); 13. unauthenticated legacy artifact; 14. E1 still refuses tampered CSS
   (`RENDER_MISMATCH`: auth never blesses semantics); 15. concurrency + environment
   pollution irrelevance; 16. loader demands explicit roots (no default); 17. guard-removal
   (substitution validates bare, refuses authenticated); 18. command surface (no env, no
   key/bypass flags, hard disable precedes reads) + live spawn refusal of the real id;
   19. MAJOR-1 descriptor reads: FIFO / directory / oversize sidecars refuse, post-open
   path swaps cannot divert the read (proven by descriptor), growth and content rewrites
   after open refuse via the hook seam while a path swap of a valid binding stays valid;
   20. MAJOR-2 RSA/EC/Ed448 keys refuse at parse and at verification (`AUTH_KEY_MISMATCH`);
   21. MINOR-3 Unicode-escaped duplicates and escaped proto keys refuse with decoded
   names; quote-colon string values are not keys; nested keys are refused as shape.

`tests/unit/artifact-auth-pipeline.test.ts` (5 tests): authenticated composition to
E1 registration and rebind; exact-command positive (past auth into provenance) and
substitution (auth-gate refusal) wiring from isolated disposable checkouts; sequential /
concurrent / SIGKILL-interrupted isolation proof (production trust roots and prior
evidence asserted unchanged).

`tests/security/provenance-boundary.test.ts` proves the new module adds no builtin, no
filesystem member and no Zone E edge. Full `pnpm test:unit` + `pnpm test:security` +
hosted CI are the remaining gates (evidence posted on the PR).

## 7. Source authenticity versus content integrity

- Content integrity (this slice): the signature proves the bytes verified are exactly
  the bytes enrolled, bound to the claimed run id, input hash and source identifiers.
- Source authenticity (NOT established): nothing here proves Meta produced the enrolled
  bytes, nor that the claimed source revision is where they came from. Enrollment of the
  historical `c3-live-meta-001` artifact additionally requires re-deriving the source
  evidence (claimed source SHA, fixture tree, analysis id, input hash) from the certified
  baseline, plus an explicit owner authorization naming the key id and artifact hash. If
  that source cannot be independently re-established, the runbook reports the limitation
  instead of manufacturing provenance — no enrollment happens on suspicion.
- PC-1's `VERIFIED` status is never transferred to any model proposal, authenticated or not.

## 8. Residual risk (explicit, NOT accepted)

1. **Verifier/key integrity vs same-UID:** a same-UID attacker who rewrites the verifier
   code or the trust-roots file defeats every check in this repository. No in-repo test
   can bootstrap trust against that adversary; closure needs the section 3 owner-operated
   prerequisites (protected checkout and single-writer window at minimum).
2. **Pre-installed swap:** a substitution fully in place before the first read is
   statistically identical to legitimate state; signatures close it only from enrollment
   forward, never retroactively.
3. **Historical origin:** the existing Muse Spark artifact was not signed when created;
   signing it now cannot prove Meta produced it (section 7).
4. **No sandbox claim:** nothing here is an OS sandbox, and nothing here detects one.

## 9. Process cleanup and rollback

- Verification writes only under `.proofpilot/c3-b2b/MODEL-<runId>-<stamp>/` and the two
  coordinator locks; a refused run leaves no verdict behind. Remove a stale lock only via
  the stage-root protocol (never on a bare `lsof` reading), and treat interrupted
  evidence as inconclusive, never as verified.
- Rollback of this slice: delete the authenticated command, the auth module and its
  tests, and revert the one-line boundary allow-list update; the legacy synthetic
  command and all P1/P2/E1/E2 behavior are untouched.

## 10. Preconditions for any real run (all required, none met here)

1. Owner execution approval naming exact `V`, `S`, fixture tree, analysis id, key id and
   artifact hash (out of band).
2. Reviewed enrollment of the historical artifact per section 7, or a recorded decision
   that its source cannot be established (which cancels the run).
3. Section 3 prerequisites 1–3 performed and recorded (plus 4 optionally).
4. Independent security review of the exact HEAD that lifts the hard disable.
5. A reviewed code change as the only lifting mechanism (no flag, variable or key entry
   lifts it).
