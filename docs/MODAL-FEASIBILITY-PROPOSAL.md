# Modal sandbox feasibility proposal (DOCS ONLY — not authorized, not implemented, not a security claim)

> **Updated in C3-B2A (2026-10-29)** from Modal's current official Sandbox networking and Sandbox guide pages (page fetches only). The earlier statement that egress controls were undocumented is **corrected below**. Nothing here has been independently tested; no Modal resource, token, deployment, sandbox or billing activity exists, and HOST-C3-01 remains unapproved.

> **No Modal API call, deployment, Sandbox creation or spend has been made or is authorized.** The current C3 contract (`tasks/PP-META-I2-C3.md`, forbidden scope) **prohibits any hosted backend**. Using Modal would be a scope change needing its own reviewed contract revision and an explicit owner approval (proposed decision id `HOST-C3-01`, currently non-existent). **Modal must not be described as a verified secure execution boundary until a dedicated independent test passes.** What follows is a proposal to evaluate, based on Modal's public Sandbox guide read on 2026-10-28 (page fetch only).

## Why consider it

Today candidates are host-rendered CSS from a closed grammar run through the unmodified oracle on the owner's machine (C3-0/C3-B1). That removes model-authored executable content instead of containing it. The v1.1 plan wanted real isolation (Docker/ARM64) for any broader patch, and that is still **NOT VERIFIED**. A disposable hosted sandbox could, in principle, provide a stronger boundary for a later task that wants to run less constrained candidates. It is not needed for the closed-grammar CSS scope and must not be used to widen that scope on its own.

## What the public guide documents (to be re-verified before relying on any item)

| Need | Documented capability (Sandbox guide) | Gap or question |
|---|---|---|
| Create and run | `modal.Sandbox.create(...)` with `app=`; `sb.exec(...)` | Account, App and billing setup required |
| Image | `modal.Image.debian_slim().pip_install(...)`, `.apt_install(...)`, `Image.from_registry`; named images via `from_name`, published in a deploy/CI step so Sandbox launch never builds; external tags treated as immutable once pulled | A Node + Chromium (Playwright) image needs apt packages and a browser download **at image build time**, which needs network; pin by digest and keep build separate from execution |
| Resources and time | `cpu=`, `memory=` (MiB; sandboxes can burst above their requests), `timeout=` (default 5 min, maximum 24 h), `idle_timeout`. JavaScript SDK parameter names for these were not on the networking page and must be confirmed in the JS SDK reference | Burst means requests are not hard caps; need explicit teardown on a short timeout |
| Isolation runtime | `runtime="gvisor"` or `"vm"` | Strength of each is Modal's claim, not ours; needs an independent test |
| **Outbound network** | **Documented in the Sandbox networking guide.** By default sandboxes allow outbound connections to any public IP. Controls: full block (`block_network=True` in Python, `blockNetwork: true` in the JavaScript SDK) drops all outbound traffic; `outbound_cidr_allowlist` / `outboundCidrAllowlist` permits only listed CIDR ranges on any protocol; `outbound_domain_allowlist` / `outboundDomainAllowlist` (Beta) permits only TLS (port 443) to listed domains by SNI. The allowlists combine additively; `block_network` cannot be combined with the allowlists; runtime policy updates are experimental | **Documented, not tested.** Caveats stated by Modal: DNS is unrestricted unless all outbound traffic is blocked; ECH is unsupported; domain fronting can bypass the domain allowlist. For our use (the oracle needs only loopback inside the sandbox) the full block is the relevant control; it must still be proven by a dedicated test (DNS, TCP, UDP, IPv6, link-local metadata, other-sandbox reach) |
| Secrets | `secrets=[...]` become environment variables | We would pass **none**: no provider key may enter a candidate sandbox |
| Output and evidence | Read `p.stdout`; `poll()`/`returncode`; Volumes via `volumes={...}`; Filesystem Snapshots | No dedicated file-download API on the page; evidence would travel via bounded stdout (base64/tar) or a Volume, then be re-hashed on the owner's machine |
| Teardown | `sb.terminate()`; ends on entrypoint exit, timeout or OOM | Verify nothing persists (Volumes, snapshots, named sandboxes) |
| Billing | Billed at max(requested, actual) resources | Price and balance unknown here; no spend cap is guaranteed |

## Proposed bounded evaluation (only after HOST-C3-01 is approved)

1. **Scope:** one disposable sandbox per replay running only the already-trusted F01 stage tree (approved-SHA blobs plus host-rendered CSS) and the unmodified oracle. No model text, no provider call, no credentials, no repository secrets.
2. **Image:** immutable (digest-pinned) Node 24 + Playwright 1.64.1 + Chromium built once in a separate step; dependency tree hashed and compared with the owner's trusted manifest.
3. **Egress:** create the sandbox with the documented full block (`blockNetwork: true` in the JavaScript SDK) and prove it with a dedicated test using a hand-authored page that attempts `.invalid` DNS, public IP, loopback of other sandboxes and cloud metadata addresses; the DID-1 canary idea extended to OS level. Image build and dependency download happen in a separate step before execution, because a blocked sandbox cannot download anything. If the block does not hold in the test, stop.
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

## C3-B2A status summary

- Corrected: Modal documents outbound blocking (`blockNetwork: true` in the JavaScript SDK, `block_network=True` in Python) and CIDR/domain allowlists, plus CPU/memory/timeout parameters. These are vendor documentation, **not** independently tested features of our configuration.
- Unchanged: the C3 contract forbids hosted backends; HOST-C3-01 and SPEND-MODAL-01 are not requested or defined; Modal is **not** a verified execution boundary; no Modal call or resource exists; model-generated proposals are not evaluated anywhere in C3-B2A.
