# Modal sandbox feasibility proposal (DOCS ONLY — not authorized, not implemented, not a security claim)

> **No Modal API call, deployment, Sandbox creation or spend has been made or is authorized.** The current C3 contract (`tasks/PP-META-I2-C3.md`, forbidden scope) **prohibits any hosted backend**. Using Modal would be a scope change needing its own reviewed contract revision and an explicit owner approval (proposed decision id `HOST-C3-01`, currently non-existent). **Modal must not be described as a verified secure execution boundary until a dedicated independent test passes.** What follows is a proposal to evaluate, based on Modal's public Sandbox guide read on 2026-10-28 (page fetch only).

## Why consider it

Today candidates are host-rendered CSS from a closed grammar run through the unmodified oracle on the owner's machine (C3-0/C3-B1). That removes model-authored executable content instead of containing it. The v1.1 plan wanted real isolation (Docker/ARM64) for any broader patch, and that is still **NOT VERIFIED**. A disposable hosted sandbox could, in principle, provide a stronger boundary for a later task that wants to run less constrained candidates. It is not needed for the closed-grammar CSS scope and must not be used to widen that scope on its own.

## What the public guide documents (to be re-verified before relying on any item)

| Need | Documented capability (Sandbox guide) | Gap or question |
|---|---|---|
| Create and run | `modal.Sandbox.create(...)` with `app=`; `sb.exec(...)` | Account, App and billing setup required |
| Image | `modal.Image.debian_slim().pip_install(...)`, `.apt_install(...)`, `Image.from_registry`; named images via `from_name`, published in a deploy/CI step so Sandbox launch never builds; external tags treated as immutable once pulled | A Node + Chromium (Playwright) image needs apt packages and a browser download **at image build time**, which needs network; pin by digest and keep build separate from execution |
| Resources and time | `cpu=`, `memory=` (MiB; may burst), `timeout=` (default 5 min, max 24 h), `idle_timeout` | Burst means requests are not hard caps; need explicit teardown on a short timeout |
| Isolation runtime | `runtime="gvisor"` or `"vm"` | Strength of each is Modal's claim, not ours; needs an independent test |
| **Outbound network** | The page read **does not document** `block_network`, `cidr_allowlist` or any egress restriction | **Unresolved and decisive.** Must be confirmed in current docs and then tested (DNS, TCP, link-local metadata, IPv6, other-sandbox reach) |
| Secrets | `secrets=[...]` become environment variables | We would pass **none**: no provider key may enter a candidate sandbox |
| Output and evidence | Read `p.stdout`; `poll()`/`returncode`; Volumes via `volumes={...}`; Filesystem Snapshots | No dedicated file-download API on the page; evidence would travel via bounded stdout (base64/tar) or a Volume, then be re-hashed on the owner's machine |
| Teardown | `sb.terminate()`; ends on entrypoint exit, timeout or OOM | Verify nothing persists (Volumes, snapshots, named sandboxes) |
| Billing | Billed at max(requested, actual) resources | Price and balance unknown here; no spend cap is guaranteed |

## Proposed bounded evaluation (only after HOST-C3-01 is approved)

1. **Scope:** one disposable sandbox per replay running only the already-trusted F01 stage tree (approved-SHA blobs plus host-rendered CSS) and the unmodified oracle. No model text, no provider call, no credentials, no repository secrets.
2. **Image:** immutable (digest-pinned) Node 24 + Playwright 1.64.1 + Chromium built once in a separate step; dependency tree hashed and compared with the owner's trusted manifest.
3. **Egress:** default-deny outbound network at execution time, proven by a dedicated test with a hand-authored page that attempts `.invalid` DNS, public IP, loopback of other sandboxes and cloud metadata addresses; the DID-1 canary idea extended to OS level. If Modal cannot enforce default-deny, stop.
4. **Limits:** explicit cpu, memory and a short `timeout`; test that a runaway process and a fork bomb terminate and that billing stops at teardown.
5. **Credentials isolation:** no Secret attached; a test that the environment contains nothing sensitive.
6. **Evidence:** extraction through a bounded channel; every artifact re-hashed locally; the scoreboard is still recomputed on the owner's machine by `verifyScoreboard` and a sandbox report alone can never award `VERIFIED`.
7. **Teardown:** terminate on completion and on failure; a post-run listing must show no remaining sandbox, Volume or snapshot.
8. **Independent test:** an independent reviewer runs the egress, escape-attempt and resource-exhaustion tests. Only a pass allows the words "verified boundary", and then only for the tested configuration.

## Decision record (to be written by the owner, not by an agent)

| ID | Question | Status |
|---|---|---|
| HOST-C3-01 | Revise the C3 contract to allow a hosted Modal sandbox for oracle replays, with the limits above | **NOT APPROVED / NOT REQUESTED** |
| SPEND-MODAL-01 | Account, credit cap and who may create resources | **NOT DEFINED** |

Until both exist: no Modal calls, no deployment, no spending, no change to the closed-grammar CSS scope.
