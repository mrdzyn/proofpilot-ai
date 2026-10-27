# verifier/ — trusted acceptance oracle (trust root)

This directory holds the pre-registered, independent acceptance checks. **It is a trust root.**

- The future patch agent must never read, write, or mount anything in this directory. `config/patch-policy.json` denies it, and `tests/security/trust-root.test.ts` enforces that.
- Verdicts come from the Playwright exit status and structured results, interpreted by deterministic code (`packages/core/src/f01-baseline.ts`). They never come from model text, DOM text, or screenshots.
- `f01/f01.oracle.spec.ts` is **expected to fail** on the F01 baseline: the mobile test fails on a `cart-count` mismatch and the desktop control passes. It is not marked `test.fail()`, because the failure is the evidence.

Run the raw oracle with `pnpm test:e2e:f01`, which exits non-zero on the baseline. Run the classified baseline reproduction with `pnpm f01:baseline`.
