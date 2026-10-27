# Product Definition

## Product identity

- **Product name:** ProofPilot AI
- **One-line description:** An AI visual QA agent that watches a UI defect, reproduces it in a sandbox, proposes a minimal fix, and independently proves whether the fix worked.
- **Primary owner:** Johnmikel Xavier Rosales (mrdzyn)
- **Current lifecycle stage:** Build (hackathon MVP; Oct 27 – Nov 4, 2026 ET)

## Problem

AI coding tools produce plausible fixes and often self-report that tests passed. That evidence usually comes from the same agent that wrote the patch. Developers still have to work out whether the reported failure was real and observable, whether the patch actually changed it, and whether anything else regressed.

## Target users

- **Primary:** solo web developers debugging an interaction or responsive-layout defect.
- **Secondary:** developers using coding assistants who want verification that runs outside the patch author's session.

## Value proposition

ProofPilot separates **patch generation** from **verification**. A pre-registered, hidden oracle must fail on the original code for the intended reason and pass on the approved candidate in a fresh runner. The verdict is computed by deterministic code, not by model narration, and every artifact is hashed.

## MVP scope (hard boundary)

Curated, synthetic fixture repositories only (F01 headline; F02 optional; F03 negative control). Video → Muse Spark analysis → Playwright reproduction → Muse Wonder patch proposal → explicit local approval → independent verifier → hashed evidence. Excluded: arbitrary repositories or URLs, auto-PR/merge, native apps, credentials/logins, multi-user cloud.

## Fixtures

- **F01 (implemented in C1):** at 390×844, a transparent overlay intercepts the **Add to cart** tap and the cart count stays `0`. At 1280×800 the button works.
- **F02 (optional):** subtotal does not update with quantity.
- **F03 (negative control):** an unreproducible clip must never reach `VERIFIED`.

## Verdict definition

`VERIFIED` requires all of the following: baseline trusted test fails for the intended reason; patch approved and confined to permitted files; candidate passes the oracle in a fresh environment; regressions pass; evidence complete with integrity verified; no security block. It means verified against the named fixture and tested conditions only.

## Success criteria (Nov 4)

At least one genuine, non-mocked F01 run (video → model → browser → approved patch → independent verifier); verifier replay 3/3; negative controls never `VERIFIED`; independent exact-head audit; three-minute demo showing only in-period work.
