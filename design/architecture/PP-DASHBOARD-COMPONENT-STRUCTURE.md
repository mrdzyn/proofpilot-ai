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

**Option B — Framework-free TypeScript, hand-rolled CSS from tokens (simpler).**
Zero new runtime dependencies and no build step (the mockup already proves the page
is expressible this way); smallest supply-chain surface; the mockup converts almost
directly. Costs: manual component discipline without framework guardrails; diverges
from the owner's stated stack preference.

**Recommendation requested, not made:** the analysis establishes Option B as the
simpler, more maintainable alternative for a single static page, while Option A
matches the owner's preference and scales better if the dashboard grows. The owner
chooses at the design gate; the shell phase implements only the chosen option.
Choosing A additionally requires owner acceptance of the new dependencies and the
build toolchain.

## 3. Non-decisions (fixed regardless of stack)

Single light theme only; no router; no state library; no test framework beyond the
repo's node runner for the acceptance tests; no UI kit or component library (the
inventory above is the system — a kit must not override it).
