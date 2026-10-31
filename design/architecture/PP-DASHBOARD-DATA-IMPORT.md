# PP-DASHBOARD — data provenance and evidence-import architecture (UI-C3-01A, Phase A)

## 1. Provenance classes (the only three the dashboard knows)

| Class | Meaning | Renders where | May it render the trusted VERIFIED chip? |
|---|---|---|---|
| `historical-record` | Values transcribed from reviewed repo docs at design time | All zones, pre-populated | Only the hand-authored PC-1 row, citing its source run |
| `owner-imported` | Owner-picked files passing the allowlist (§§3–4) | Zones 1 (MP4) and 4 (JSON slot) | **Never.** An imported verdict renders as quoted claim text under an `UNVERIFIED IMPORT — FILE-REPORTED VERDICT` banner, with the trusted chip withheld even when the file asserts hand-authored provenance |
| `model-originated` | Any string that came from Muse Spark | Zones 2–3, as quoted text | Never, by construction |

Rationale: syntactic validation and string allowlists do not authenticate evidence
and cannot prove three clean oracle replays. A user-crafted JSON file can assert any
provenance or status string, so the dashboard treats every imported verdict as an
unverified claim. Only a separately designed genuine verification path
(hash/provenance/certified-replay verification against the evidence store — future
work, not this dashboard) may upgrade an imported result. The historical
source-anchored PC-1 row stays visually distinct from every import.

## 2. What the dashboard reads (and what it never touches)

Reads: (a) its bundled historical copy (transcribed at design time, cited to source
docs); (b) owner-picked files via `<input type=file>` — video bytes for local
playback and metadata only; JSON evidence for validation-then-view-model rendering.

Never reads: `.proofpilot/` hidden paths (no automatic access, no directory
scanning), credentials, approvals, reservations, raw provider responses, or the
stored model artifact. There is no file-path input: the browser picker returns a
`File` object, never a path, and the dashboard displays names/sizes/hashes, not paths.

## 3. Import allowlist — actual emitted schemas (not simplified shapes)

Validated against the real producer formats: `docs/examples/c3-b1-scoreboard.example.json`
(committed example) and `scripts/f01-baseline.ts` (`baseline-summary.json` emit).
Unknown keys, wrong types, oversize/deep/duplicate-key/non-UTF-8 input, and unsafe
text are refused before any render. Rendering reads only the projected view-model
(§4), never the raw file.

**Scoreboard import** (live run files and the committed example share this shape;
the example additionally carries `_example`, an inert documentation string):
- Top level: `schemaVersion` (number, must be `1`), `label` (string),
  `complete` (boolean), `approvedSha` (40-hex string), `createdAt` (string),
  `modelOrProviderCalls` (number), `modalCalls` (number), `baseline` (object),
  `candidates` (array), `nc5` (object), `notes` (array of strings).
  Optional: `_example` (string, accepted and ignored). Its presence on a picked
  file never confers "committed example" status: only the dashboard's bundled
  historical copy — a known source transcribed at design time, never a picked
  file — renders with the "committed example" tag. Every picked file projects
  `sourceTag: "owner-imported evidence"`; when `_example` is present the UI may
  append "(file claims to be an example)".
  Any other top-level key refuses the file.
- `baseline`: exactly `reproduced` (boolean), `reasons` (array of strings),
  `replay` (object). `replay`: exactly `n`, `outcome`, `failureCode`
  (string|null), `failureMessage` (string|null), `oracleExitCode` (number|null),
  `evidenceDir`, `recordSha256`, `candidateCssSha256` (string|null — null when
  staging never completed, e.g. NC-7 busy-port), `nonce` (string|null, same rule),
  `mobile`, `desktop`, `servedCssSha256` (array of strings), `evidenceFinalized`,
  `evidenceProblems` (array). `mobile`/`desktop`
  are exactly `{status, hitTestTarget, cartCountAfter}` or `null` (fault-injected
  replays never ran the browser; the reduced replay shape written by
  `candidate-stage.ts`, not the full oracle observation).
- `candidates[]`: exactly `id`, `description`, `provenance`, `candidateId`,
  `adjustments`, `renderedCss`, `fault`, `replaysRequired`, `replaysAttempted`,
  `replaysPassed`, `status`, `reason`, `expected`, `expectationMet`,
  `expectationProblems`, `replays` (array of replay objects shaped as above).
  `status` must be one of `VERIFIED`, `PATCH_FAILED`, `INCONCLUSIVE`,
  `NOT_REPRODUCED`, `ORACLE_PASS`.
- `nc5`: object (opaque to the dashboard; shown only as "present" in counts).
- A row whose `status` is `VERIFIED` is importable as data but renders per §1:
  quoted claim text under the unverified-import banner, never the trusted chip —
  regardless of the provenance string the file asserts.

**Baseline-summary import** (as emitted by `scripts/f01-baseline.ts`, lines 79–90
emit `artifacts[]`, lines 119–131 emit the summary):
- Top level: exactly `runId`, `oracleExitCode` (number), `classification` (object),
  `gitHead`, `fixtureTree`, `worktreeDirty` (boolean), `worktree` (object),
  `certified` (boolean), `certificationReasons` (array of strings),
  `artifacts` (array of exactly `{relativePath, sha256, bytes}`-shaped objects).
- `classification`: exactly `verdict` ∈ {`REPRODUCED`, `NOT_REPRODUCED`,
  `INCONCLUSIVE`}, `regression` ∈ {`PASS`, `FAIL`, `NOT_RUN`}, `interceptedBy`
  (string|null), `reasons` (array of strings).
- `worktree`: the discriminated `WorktreeState` union — exactly one of
  `{kind: 'clean'}`, `{kind: 'dirty', paths}`, `{kind: 'unknown', reason}`.

**Bounds** (both files): file ≤ 256 KiB, strings ≤ 4 KiB, arrays ≤ 64 items
(`replays` ≤ 8). Container depth uses one explicit convention — root object counts
as depth 1, each nested array/object adds 1. The committed example reaches depth 6
(scoreboard → `candidates` → candidate → `replays` → replay → `mobile` → scalar);
refuse depth > 8. No duplicate JSON keys, UTF-8 only.

**MP4 import** (playback suitability only — not certified intake, see §5):
file.type/extension MP4, size ≤ 25 MiB, container duration ≤ 30 s once metadata
loads, `videoWidth`/`videoHeight` readable, `canPlayType('video/mp4;
codecs="avc1.42E01E"')` consulted as a hint only (empty string ≠ refusal),
seek-to-end fires `seeked` as best-effort last-frame-decodable evidence. Anything
else — over-long, oversized, corrupt, undecodable, unsupported — is refused with
the specific reason and recovery. A passing file earns the label "suitable for
playback" and nothing stronger.

## 4. Display view-model (projected after validation)

The shell copies only these fields into the render model; every other accepted
field is dropped at the boundary:

```text
ScoreboardView  = { label, approvedSha, createdAt, baselineReproduced,
                    certifiedBaseline: n/a (scoreboards carry no certificate;
                    certification is shown only from a baseline-summary import),
                    rows: [{ id, description, status, replaysPassed,
                             replaysAttempted }] }
BaselineView    = { runId, verdict, regression, interceptedBy, certified,
                    certificationReasons, artifactCount }
```

An imported `VERIFIED` row projects to `{ status: "VERIFIED (file-reported,
unverified import)", trustedChip: false }` — the chip flag is not representable
as true for any import. Every picked file projects `sourceTag:
"owner-imported evidence"`, whether or not it carries `_example`; a present
`_example` appends the note "(file claims to be an example)". The
`sourceTag: "committed example"` value is reserved for the dashboard's bundled
historical copy — a known build-time source, never a picked file — so no picked
file can impersonate it.

## 5. Playback suitability is not certified intake

The dashboard deliberately does not bundle the intake package, call ffprobe, or
use a backend. Browser metadata plus a successful seek proves the file plays
locally; it does not prove container/codec/decode conformance, exact-SHA
certification, consent binding, or fixture identity. No `VALIDATED`,
`CERTIFIED`, or provenance label is ever inferred from playback. Full intake
remains the repository pipeline's job (`packages/intake/`, offline, owner-run).

## 6. Untrusted-text rendering rules

- Every model-derived or file-derived string is inserted via text nodes
  (`textContent` or framework-escaped interpolation) — never `innerHTML`, never
  as an attribute, URL, class name, or style value.
- The documented CSS adjustment is rendered inside `<pre><code>` as text. It is
  never placed in a `<style>` element, a `style` attribute, or a preview document.
  Ordinary author styling of the dashboard itself is unaffected by this rule.
- Hashes, ids, and counts are displayed as truncated text with the full reviewed
  value available as adjacent text, never as links.

## 7. Network policy (loopback-only local origin, zero external traffic)

The dashboard makes **zero requests to non-loopback origins**: no provider,
backend, hosted deployment, auth service, analytics, external font/image/script,
or CDN traffic — in dev, in the built artifact, and during import/validation.
Local-origin loads required to serve the page itself (`http://127.0.0.1:<port>`
or `http://localhost:<port>` document and asset loads, Vite HMR websocket in dev)
are permitted and must stay within loopback. Distribution may additionally ship a
self-contained single-file build openable over `file://` (literally zero
requests). The shell phase tests the built artifact as well as dev: any request
to a non-loopback host fails the suite.
