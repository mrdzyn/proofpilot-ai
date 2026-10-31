# PP-DASHBOARD — proposed component structure and stack decision (UI-C3-01A, Phase A)

## 1. Proposed structure (stack-agnostic; maps 1:1 to `design/components/PP-DASHBOARD-COMPONENTS.md`)

```text
dashboard/
  src/
    App                      page shell, landmarks, skip link, live regions
    Header                   title, tagline, commit identity, LOCAL ONLY marker
    zones/
      RecordingZone          VideoPlayer + LocalFileField + metadata EvidenceTable
      AnalysisZone           two historical attempt cards (static content)
      CorrectionZone         CodeBlock (read-only) + proposal record table
      VerificationZone       baseline card + PC-1 card + negatives table + import slot
      EvidenceZone           identity table + limitations/refusals table
    components/
      ZoneSection  VerdictChip  EvidenceTable  CodeBlock
      LocalFileField  VideoPlayer  DisclosureNote
      EmptyState  ErrorState  LoadingState
    lib/
      importAllowlist        JSON shape validation (exact-key, bounded, refused-typed)
      provenance             class tags: historical-record / owner-imported / model-originated
      renderText             the single text-node insertion path (no innerHTML anywhere)
  index.html                 entry, inline CSP meta (no network), theme, reduced-motion
```

State lives in the page only (selected files, validation outcomes); nothing persists
beyond the tab, and nothing leaves the machine. Rendering rule: data flows
file → allowlist → provenance tag → text nodes. There is no other path to the DOM.

## 2. Stack options — owner decision required at the design gate (not pre-decided)

**Option A — React + TypeScript + Vite + Tailwind (owner-preferred default).**
Fits the requested direction; component model matches §1; Tailwind used strictly as
a utility layer bound to `design/tokens/pp-dashboard.json` (no palette values in
markup, no community theme). Costs: three new dependency families plus a build step;
supply-chain and lockfile review required; the no-network invariant must cover the
dev server and the build output (audited in T-NET-1).

**Option B — Framework-free JavaScript with JSDoc, hand-rolled CSS from tokens
(simpler, accurately specified).** Zero new dependencies and no build step: plain
browser-supported JavaScript (typed with JSDoc, not TypeScript — TypeScript requires
transpilation) renders the page exactly as the mockup proves. A TypeScript variant
would compile with the repository's existing `tsc`, which is a build step and loses
the no-build property. Costs: manual component discipline without framework
guardrails; diverges from the owner's stack preference.

**Owner recommendations recorded (design input, not implementation approval):**
preferred stack is Option A (React + TypeScript + Vite + Tailwind); light theme only
for the hackathon MVP (confirmed — dark deferred, not assumed); no persisted run
history (confirmed — state lives in the tab only, matching §1); portal fields remain
PENDING. The owner still confirms the stack at the design gate; the shell phase
implements only the chosen option. Choosing A additionally requires owner acceptance
of the new dependencies and the build toolchain.

## 3. Non-decisions (fixed regardless of stack)

Single light theme only; no router; no state library; no test framework beyond the
repo's node runner for the acceptance tests; no UI kit or component library (the
inventory above is the system — a kit must not override it).
