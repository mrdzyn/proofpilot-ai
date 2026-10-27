# Capability Packs

## Purpose

The master template contains more guidance than every project needs. Generated and brownfield projects declare only the capabilities they actually adopt in `config/project-profile.json`.

This prevents baseline CI from forcing unrelated design, store, or vendor-integration documents into projects where they do not apply.

## Profile

```json
{
  "schemaVersion": 1,
  "repositoryMode": "project",
  "capabilities": {
    "design": true,
    "storeRelease": true
  },
  "platforms": ["web"],
  "storefronts": ["google-play"],
  "integrations": ["revenuecat"]
}
```

The master repository itself keeps `repositoryMode: "template"`. New/adopted repositories must change it to `project`.

## Selectors

### capabilities

- `design` — design-system, accessibility, tokens, component catalog, Figma handoff.
- `storeRelease` — shared distribution metadata/privacy controls plus only the selected storefront-specific release overlays.

### platforms

Valid values: `apple`, `android`, `web`, `windows`.

A platform requires `capabilities.design=true`.

Selecting `android` also activates the cross-stack Android release-signing contract at `release/android-signing.md`. This applies regardless of whether the implementation stack is Flutter, React Native, or native Android/Kotlin.

### storefronts

Valid values: `apple`, `google-play`, `microsoft-store`, `huawei-appgallery`, `wordpress-org`.

A storefront requires `capabilities.storeRelease=true`.

Store-release validation is layered:
- shared distribution core: `store/README.md`, submission metadata, and data/privacy declaration;
- app-store compliance overlay: age/content ratings and jurisdiction matrix, activated for Apple, Google Play, Microsoft Store, or Huawei AppGallery;
- WordPress.org: its own Plugin Directory profile and the shared distribution core, without app-store-only IARC/jurisdiction files solely because WordPress.org is selected.
- Google Play and Huawei AppGallery: additionally require `release/android-signing.md` so Android release-signing requirements remain active even if the project profile is store-focused.

### integrations

Valid values: `google-maps`, `google-workspace`, `revenuecat`, `freemius`, `paddle`.

Google Maps and Google Workspace also require `capabilities.design=true` because their template guidance is design/integration-specific.

`paddle` is a future/reference pack until the project explicitly selects Paddle.

## CI model

**One automatic PR baseline** uses `.github/workflows/ci.yml` (caller) and `.github/workflows/common-validation.yml` (the same-repository reusable callee). Greenfield projects must retain **both** files and `scripts/validate_project_profile.py`. Master inventory/self-test steps in the shared baseline are guarded to run only on `mrdzyn/ai-native-project-template` and skip elsewhere.

The separate `.github/workflows/template-integrity.yml` is **manual-only, master-only**, not a required child check. Generated projects remove it, `scripts/validate_master_template.py` and `scripts/test_validate_project_profile.py`, set `repositoryMode: "project"`, and verify a real PR emits and passes `Project baseline / Common validation`. Mature projects may retain stronger existing CI and need not adopt template filenames; stack-specific build/tests remain project-owned.

The executable policy is `scripts/validate_project_profile.py`; representative valid and invalid combinations are tested by `scripts/test_validate_project_profile.py`. Android signing is conditionally required when `platforms` contains `android` or when `storefronts` contains `google-play` or `huawei-appgallery`.

Do not copy unrelated capability selectors into a project just to satisfy CI. Select capabilities because the product actually needs them.

Greenfield repositories created from the master template initially contain the complete capability inventory. After the project profile is selected, unselected optional packs should normally be **physically pruned**, not merely ignored. Presence alone never makes a pack active, and Project Baseline intentionally does not fail merely because an unselected optional pack remains.

The exact greenfield pruning procedure is canonical in `docs/REPOSITORY-SETUP.md`. Selected capability files remain mandatory even when all unselected packs are physically absent.

## Brownfield rule

For an existing repository, use the KEEP / MERGE / ADD / RETIRE reconciliation process defined in `docs/REPOSITORY-SETUP.md`. Set the profile to the capabilities actually adopted, preserve one canonical source per concern, and document the reconciliation mapping in the adoption PR/task.
