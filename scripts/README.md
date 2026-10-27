# Scripts

Put repeatable project automation here.

Good candidates include:
- local validation wrappers;
- deterministic build helpers;
- release-preparation checks;
- schema validation;
- code generation;
- artifact checksums;
- environment sanity checks.

## Script rules

Scripts should:
- be safe to rerun where practical;
- fail clearly on error;
- avoid embedding secrets;
- document prerequisites;
- avoid destructive production actions by default;
- support CI use where useful.

Prefer a single documented validation entry point such as `scripts/validate` once a project's stack is known.


## Project scripts

- `validate_project_profile.py`: inherited Project Baseline validator for `config/project-profile.json` (kept unmodified; used by `common-validation.yml`).
- `f01-baseline.ts`: F01 baseline reproduction runner (`pnpm f01:baseline`).
- `inference-status.ts`: provider config status and non-billable discovery (`pnpm inference:status [-- --discover]`).
- `lint.mjs`: project policy lint (`pnpm lint`).
