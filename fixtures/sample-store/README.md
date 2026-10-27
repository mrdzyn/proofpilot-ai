# sample-store (fixture F01)

Synthetic, **intentionally defective** demo store, built for ProofPilot AI during the hackathon. It contains no real products, customers, or credentials.

**Defect F01:** at a 390×844 mobile viewport, a transparent `promo-overlay` element covers the lower half of the screen and intercepts taps on **Add to cart**, so the cart count stays `0`. At 1280×800 the overlay is hidden and the button works.

- `src/` holds the only files a future patch agent may change (see `config/patch-policy.json`).
- `server.mjs` serves a fixed route map on `127.0.0.1:4173` and is not patchable.
- The trusted acceptance oracle lives in `verifier/` and is deliberately outside this directory.

Run it with `pnpm fixture:serve`, then open http://127.0.0.1:4173/product/demo.
