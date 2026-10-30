# SEC-P2-01 — Filesystem Read-Boundary Findings (P2 artifact reader)

Scope: `packages/provenance/src/proposal-artifact.ts` (`readArtifactBytes` and its checks).
Question: can the unresolved transient same-UID ancestor-swap risk be eliminated by a narrow,
testable filesystem hardening change, or does it require stronger process/OS isolation?
Method: read the loader path end to end, enumerated every check against a same-UID adversary
with filesystem write access, and implemented every closure that is both narrow and
deterministically testable. No live artifact, no provider, no credentials involved.

## 1. What the reader already defeated (with test evidence)

Checked in `tests/unit/proposal-artifact.test.ts` unless noted:

- Persistent symlinks at the final component and at any intermediate directory, including an
  alternate tree serving schema-valid bytes (`ARTIFACT_SYMLINK`; the P2 auditor's repro).
- Non-regular files (directories, FIFOs — the FIFO case refuses without blocking on open).
- Wrong ownership / group-other visibility (`ARTIFACT_OWNERSHIP`, `ARTIFACT_PERMISSIONS`).
- Oversize files, including growth-during-read bounded at 8193 bytes (`readBoundedBytes`).
- In-place modification during the read (size or mtime change on the open descriptor →
  `ARTIFACT_UNSTABLE`).
- Post-read symlink swaps and path escapes (`realpath` binding to the expected file).

## 2. What this slice adds (narrow, testable)

- **Ancestor identity pinning** (`verifyReadBinding`, pre/post `(dev, ino)` per component):
  a directory renamed or replaced mid-read is refused even when no symlink is involved.
- **Descriptor-to-path binding** (open handle identity vs `stat(resolvedFile)` after the
  post-read checks): a swap installed after the pre-open checks and reverted before the
  post-read checks is refused. This is the exact transient case the P2 residual named, now
  detected instead of documented.
- **Cross-phase byte binding** (`reloadAndBindArtifact`, wired into
  `scripts/c3-b2b-verify-proposal.ts` immediately before the run): a substitution between
  validation and use is refused with `ARTIFACT_CHANGED`, however valid the replacement looks.
- The binding decision is a pure function of identity snapshots, so adversarial orderings
  (ancestor replacement, reverted swap, descriptor change, unresolvable path) are unit-tested
  deterministically with synthetic identities — no timing involved. The cross-phase refusal is
  an integration test with two real reads and a real substitution between them.

New tests: `verifyReadBinding pins ancestors, descriptor and resolved path without any
timing`, `reloadAndBindArtifact refuses a same-UID substitution between validation and use`.
Existing P2 tests all still pass unchanged (the happy path binds cleanly).

## 3. Residual taxonomy (same-UID writer) — explicit, not accepted

| Adversary action | Reader result | Why |
|---|---|---|
| Mid-read ancestor rename/replace (persistent or reverted) | **Refused** (`ARTIFACT_UNSTABLE`) | Pre/post identity pinning + descriptor↔path binding |
| Mid-read symlink swap (persistent or reverted) | **Refused** (`ARTIFACT_SYMLINK` / `ARTIFACT_UNSTABLE`) | `lstat` loop + `O_NOFOLLOW` + binding |
| In-place rewrite changing size/mtime | **Refused** (`ARTIFACT_UNSTABLE`) | Descriptor stat comparison |
| Substitution between pipeline phases | **Refused** (`ARTIFACT_CHANGED`) | Hash rebind before use |
| Pre-installed swap (in place before the first check) | **NOT detected** | Statistically identical to legitimate state; no reader check can distinguish |
| Same-path file replacement, fully in place at open and at post-check | **NOT detected** | Handle, path and stats are self-consistent by construction |
| In-place rewrite with restored size/mtime | **NOT detected** | Stats identical; content differs |
| Perfectly timed install-serve-revert that also restores pinned identities | **NOT detected** | Post-hoc identity comparison cannot see the past (requires `openat`-style pinning) |

The last four rows are one fact: **statistical checks authenticate path resolution, never
content, against a writer with the same UID.** A same-UID writer can always rewrite the file
directly, which is strictly easier than any swap. Repeated path checks, ordinary directory
permissions and ownership checks must not be represented as protection against such an
adversary — they are not, and this document does not claim they are.

## 4. Determination: what would actually close the residual

Narrow reader hardening is necessary but not sufficient. Full closure needs one of:

1. **Content authentication (signatures).** The live run signs `artifactHash` with an
   offline-held key; the loader verifies the detached signature before schema validation.
   Closes every content-substitution row including direct rewrite. Cost: key management and
   a new cryptographic review — explicitly out of scope for this slice.
2. **OS isolation.** Verify from a read-only bind-mount/snapshot of the evidence tree, or run
   the evidence store under a separate UID with the verifier unable to write it. Closes the
   same-UID rows by removing the adversary's write access. Cost: platform-specific setup on
   the owner machine; nothing in the repository changes.
3. **Operational single-writer trust.** Owner-run local QA on a personal machine with no
   other same-UID writers during the verification window. This is the actual deployment
   context of the QA runbook, and it reduces the residual to machine compromise — outside
   any reader's remit.

## 5. Bounded mitigation proposal

- Adopt the implemented hardening (this slice): it converts every *detectable* interference
  into a refusal with a named code, deterministically tested.
- For any real execution of `c3-live-meta-001`: require option 2 or 3 above plus the
  per-run evidence revalidation the E2 pipeline already performs, recorded as explicit owner
  decisions before the run. Option 1 remains the recommended durable fix for any future
  unattended or multi-writer verification.
- Do not weaken, skip or work around the reader gates to make a run succeed; do not treat a
  passed local run as proof against a same-UID writer.

## 6. Owner decision requested (open)

- [ ] Accept options 2/3 for a future real run, or direct option 1 (signed artifacts) first.
- [ ] Confirm that no real execution happens until the decision above plus the separate
      execution approval and security review are all recorded.
