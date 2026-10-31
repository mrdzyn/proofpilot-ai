# PP-DASHBOARD — UI state matrix (UI-C3-01A, Phase A)

Every zone implements every row that applies to it. The happy path alone is not a
complete design; empty/error/disabled states are first-class and shown in the shell
review before any wiring.

| State | Zone 1 Recording | Zone 2 Analysis | Zone 3 Correction | Zone 4 Verification | Zone 5 Evidence |
|---|---|---|---|---|---|
| Initial | Placeholder frame + "select the local MP4" | Historical attempts shown | Historical proposal shown | Historical example shown; import slot empty | Identity + limitations shown |
| Loading | Validating clip (probe + decode), polite live region | n/a (static history) | n/a (static history) | Validating JSON, polite live region | n/a |
| Empty | No file chosen; limits listed; nothing claimed | n/a | n/a | Import slot: "no file imported — historical example above" | n/a |
| Validation error | Typed reason + recovery (too large/long, not MP4, corrupt, wrong codec, unsafe) | n/a | n/a | Typed refusal: unknown key, bad provenance, model VERIFIED row, oversize; file verdict unchanged, table unchanged | n/a |
| System error | Decode/playback failure named; metadata retained | n/a | n/a | Parse failure named; historical example retained | n/a |
| Disabled | Picker disabled while zone 1 validation runs | n/a (no controls) | n/a (no controls) | Import disabled while validation runs | n/a |
| Imported vs historical | n/a | n/a | n/a | Imported rows keep their file verdict text under an `UNVERIFIED IMPORT — FILE-REPORTED VERDICT` banner and carry an "imported evidence" tag; the trusted chip is withheld even for file-asserted `VERIFIED` rows (see T-IMPORT-FAKE). Historical rows carry the example run id and the trusted chip only where the source record earned it | n/a |

Cross-zone rules:
- No zone offers Run AI, Verify Model Proposal, Approve Patch, or Deploy in any
  state, including empty states.
- A refusal in one zone never blanks another zone's historical content.
- Status changes announce via a polite live region; refusals and errors use one
  assertive alert; motion honors `prefers-reduced-motion`.
- Offline is the only mode: there is no online/offline switch, banner, or retry
  control, because the dashboard never uses the network.
