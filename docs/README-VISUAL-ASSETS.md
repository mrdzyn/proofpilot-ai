# ProofPilot AI — README motion assets & capture checklist

> **Status:** Production plan. The included animated `proofpilot-workflow-loop.gif` is an **illustrative workflow** built for the README, **not** footage of an actual product run. Do not present an illustrative frame as proof of live Baseten inference, a verified AI-generated fix, or an audited provider response.

## Creative direction

- **Mood:** premium engineering, evidence-first, measured movement, dark background, white type, electric cyan highlights, restrained red for failure / refusal. No gold or yellow.
- **Narrative:** *Observe a defect → analyze as a hypothesis → verify independently*. Keep the **actual Meta model proposal** separate from the **hand-authored PC-1 VERIFIED** control.
- **Readability:** the opening frame must explain the product even if animation is disabled. Prefer 8–12 fps and a 5–12 s loop, with readable 16–24 px text in the final 960–1200 px render.
- **Accessibility:** meaningful alt text; respect reduced-motion settings; give static captions and a static poster fallback. No high-frequency flashing.
- **Truthfulness:** show genuine local screen recordings for the product micro-loops. Don't synthesize a fake Baseten result or edit a CI screenshot to imply a passing audit.

## Included now

| File | Role | State |
| :--- | :--- | :--- |
| `docs/assets/readme/proofpilot-workflow-loop.gif` | Large hero: two animated evidence lanes showing an **unverified** AI proposal and a **separately verified hand-authored control** | **Included, illustrative** |
| `docs/assets/readme/proofpilot-workflow-poster.png` | Readable static first-frame fallback for decks, social, and low-motion presentations | **Included, illustrative** |

## Next: capture the actual product

| Priority | File | Suggested length | Capture plan | Must not imply |
| :--- | :--- | :--- | :--- | :--- |
| P0 | `docs/assets/readme/f01-mobile-reproduction.gif` | 5–7 s | Show 390×844 mobile fixture, tap **Add to cart**, overlay intercept, cart stays `0` and expected `REPRODUCED` baseline | A user successfully checked out or that the model repaired anything |
| P0 | `docs/assets/readme/zone-l-mock-analysis.gif` | 8–12 s | Show the real local dashboard: pair locally, stage synthetic MP4, grant Terminal permit, run **mock** analysis, show model/status provenance and result | A real Baseten call occurred; mark **MOCK** plainly |
| P1 | `docs/assets/readme/trusted-pc1-verification.gif` | 6–8 s | Show an **independently checked hand-authored PC-1** result: 3/3 trusted replays and hashed evidence/summary | That the historical Muse proposal itself passed verification |
| P1 | `docs/assets/readme/cancel-revoke.gif` | 5–7 s | Real Zone L Cancel / Terminal revoke / session expiry and cleanup, with no secrets or pairing codes visible | That a spent provider call has been refunded |
| P2 | `docs/assets/readme/live-baseten-analysis.gif` | 6–10 s | **Only after** a separately authorized, actual live Baseten call: show provider/model/run ID, reported token usage, **UNVERIFIED** status | Actual cost guarantee or a verified patch |
| P0 | `docs/assets/readme/demo-thumbnail.png` | Static | Build from an actual approved recording still with headline and clear mock/live label | An unrecorded demo or unavailable URL |

### Recommended cut for the main README

For an immediately strong README, retain the included hero loop and place no more than **three** genuine micro-loops in the walkthrough once captured. Too many simultaneous GIFs make the page slow and distract from the evidence.

Recommended progression: **F01 defect → Zone L mock analysis → hand-authored PC-1 verification**. Keep a brief clarification immediately below the media: **"The historical model proposal is not independently verified."**

## Recording recipe

1. Pin the exact commit and source state of the demo. If the companion is still D9-gated, **use only mock mode**. No inference or secret access is authorized by recording work.
2. Set browser viewport, zoom and window position before recording. Remove real names, keys, terminal pairing tokens, private filesystem paths, and stray notifications.
3. Record the actions from the actual local UI (QuickTime/OBS/screen recorder); keep raw MP4 outside Git or in a separately approved media location. Ensure any F01 recording is synthetic.
4. Trim pauses, crop the action, use natural easing and a seamless start/end. Retain visible provenance chips (`MOCK`, `UNVERIFIED`, hand-authored `PC-1`), not fabricated animations over the model output.
5. Export the GIF and inspect on GitHub at narrow and wide widths. Capture the first frame as a static poster for reduced-motion fallback.
6. Check hashes, file sizes, spelling, captions, mobile layout and accurate claim language. Then ship the README asset refresh as a **separate docs-only PR**; don't modify the live activation branch.

## Optimized GIF export (FFmpeg)

Use a two-pass palette pipeline for each real screen recording. The input below is your **locally recorded** video.

```bash
# Preview and crop the action first; example preserves aspect ratio at up to 960 px.
ffmpeg -i source.mp4 -vf 'fps=10,scale=min(960\,iw):-2:flags=lanczos,palettegen=max_colors=128' -y palette.png
ffmpeg -i source.mp4 -i palette.png -filter_complex \
  '[0:v]fps=10,scale=min(960\,iw):-2:flags=lanczos[v];[v][1:v]paletteuse=dither=bayer:bayer_scale=3' \
  -loop 0 -y final.gif
```

Use `ffprobe` to check dimensions/frames and `du -h final.gif` for size. Aim for **< 5 MB per hero** and **< 2 MB per micro-loop**, while keeping labels legible. GIF has no audio; a full narrated MP4 can be linked from a still image after the recording is published. GitHub currently supports GIF rendering in README files, but animated SVG is not dependable; keep actual motion in GIFs.

## Proposed optional screenshots / thumbnail layout

- **Thumbnail size:** 1280×720 (16:9). Dark background, two-panel composition: F01 mobile fail on left; trusted verdict panel on right; cyan progress connector. Include a small text label `SYNTHETIC F01 · LOCAL DEMO`.
- **Thumbnail headline:** `AI proposed it. Did it actually work?`
- **Subhead:** `Reproducible defects · gated AI · independent proof`
- **Callout:** `Model output ≠ verification`
- **Do not overlay:** fake CI numbers, unrun Baseten outputs or a `VERIFIED` tag on a model-proposed change.

## Acceptance gates for README PR

- [ ] All referenced images exist with exact case-sensitive paths and render on GitHub at a fresh commit.
- [ ] Product footage is actual browser/terminal capture; illustration is labelled as such.
- [ ] All media is synthetic, has no secrets or session tokens, and has meaningful alt text.
- [ ] Current status explicitly states D9 pending until owner authorization and validated live evidence changes that.
- [ ] Claimed test counts cite an exact CI run and are scoped to the correct branch/HEAD.
- [ ] Motion works without a sound track; first frame conveys the message when autoplay is off.
- [ ] README links, code commands, GitHub Mermaid diagram and responsive images display correctly.
- [ ] The README change is isolated from PR #34 and does not merge or activate provider code.
