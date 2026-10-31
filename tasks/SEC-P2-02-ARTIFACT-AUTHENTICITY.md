# SEC-P2-02 — Artifact Authenticity and Isolated Verification Readiness (TASK CONTRACT)

- **Base:** `main@07ae865a8195ef608b01a146cc25d17fe13164f8` (PR #23 squash merge).
- **Branch:** `phase/pp-secp202-authenticity`. New Draft PR. No merge, no deploy.
- **Scope:** security implementation with synthetic artifacts and offline automated tests only.
- **Hard prohibitions:** no access, loading, staging, execution, inspection, modification,
  enrollment or signing of the real stored proposal `c3-live-meta-001`; no Meta, Baseten or
  Modal calls; no API credential reads; no activation, quota or live-config changes; no oracle,
  CSS-grammar, patch-policy or hand-authored-control changes; no new dependencies
  (Node.js native Ed25519 only); `REAL_ARTIFACT_DISABLED` stays intact at the CLI and the
  exported E2 verifier; PC-1's `VERIFIED` is never transferred to any model proposal.

## 1. Threat model (binding)

- A same-UID attacker may rewrite or replace proposal files, directories and metadata at any
  time, including between validation and use.
- A schema-valid substituted artifact must never inherit trust from a previously validated one.
- The local verification checkout, the public verification key, trust anchors and the
  executable verifier are not assumed secure merely because they share the owner's UID: an
  attacker who can modify the verifier or its trust configuration is inside the modeled
  guarantee's precondition failure, and that limitation is stated openly, not excluded
  silently.
- Network routing and Playwright interception are not an OS sandbox. The existing staging
  harness is not an OS sandbox.
- Provenance attestation distinguishes independently authenticated facts (signature over a
  pinned key; recomputed hashes; Git-observed anchors) from operator-reported history.

## 2. Solution (smallest trust boundary, not another heuristic)

- **Content authentication:** detached Ed25519 signatures over a domain-separated canonical
  manifest that binds the exact artifact SHA-256, run ID, input hash and required
  source-provenance identifiers. Verification is fail-closed against a pinned trust root
  (`config/artifact-trust-roots.json`, committed, reviewed) that is independent of
  attacker-writable artifact directories. No caller-supplied key, no unsigned fallback, no
  environment override, no unreviewed trust-root substitution.
- **Key rule:** the private signing key is never stored in the repository, configuration
  files, environment fixtures, logs or verification evidence. Test keys exist only in
  memory inside tests. Owner enrollment happens offline (runbook), and any historical
  enrollment additionally requires trustworthy source evidence plus explicit authorization;
  a signature manufactured after the fact proves integrity from enrollment forward, never
  origin by Meta.
- **Isolation (bounded, nonprivileged):** content authentication plus pinned trust roots,
  evidence/output separation (existing namespaced `MODEL-*` layout), stage cleanup and
  lock discipline (existing protocol), and exact-SHA plus dependency checks. Whatever
  genuinely needs an OS boundary (separate UID, read-only snapshot, protected checkout) is
  documented as an explicit owner-operated prerequisite in the runbook. No script claims to
  detect a same-UID adversary against itself; such a check would be theater.

## 3. Deliverables

1. `packages/provenance/src/artifact-auth.ts` (Zone P: pure verification, `node:crypto`
   only) with strict manifest/trust-root schemas and typed refusal codes.
2. `config/artifact-trust-roots.json` (initially no keys: everything untrusted until a
   reviewed enrollment).
3. `scripts/c3-b2b-verify-authenticated.ts`: authenticated operator path mirroring the
   existing command's pipeline; same 5 flags, no path/key/mode flags, no `process.env`;
   hard-refuses `c3-live-meta-001` first.
4. `tests/unit/artifact-auth.test.ts` + `tests/support/artifact-auth-fixture.ts`
   (test-only signing): all 16 adversarial classes plus guard-removal tests, synthetic
   fixtures and real temp-dir filesystem tests only.
5. Boundary-test update: `artifact-auth.ts` joins the Zone P allow-list with justification;
   no new builtins, no new filesystem members, Zone E untouched.
6. `docs/SEC-P2-02-ISOLATED-VERIFICATION-RUNBOOK.md` (threat model, key management, macOS
   prerequisites, synthetic commands, refusal codes, adversarial evidence, source-vs-content
   limits, cleanup, preconditions for a real run).
7. `docs/SEC-P2-01-FINDINGS.md` addendum + disabled-procedure pointer update (procedure
   stays DISABLED).
8. STATUS + HANDOFFS updates.

## 4. Acceptance

- Authentication enforced on the new path (missing/invalid auth refuses; never advisory).
- Synthetic authenticated artifacts pass; every tamper/bypass class fails closed.
- Trusted code, key identity and artifact-protection assumptions independently testable.
- No real proposal path enabled; F01/PC-1 behavior preserved.
- `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:security` green; hosted CI
  green at the exact HEAD.
- Residual risk stated without silent acceptance; independent GPT-6 exact-head review
  requested; STOP.
