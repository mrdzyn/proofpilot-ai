#!/usr/bin/env python3
"""Validate the project capability profile used by Project Baseline CI."""

from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path
from typing import Iterable

MASTER_REPOSITORY = "mrdzyn/ai-native-project-template"
MASTER_MEMORY_ARTIFACTS = (
    "<!-- MASTER_TEMPLATE_MEMORY_START -->",
    "<!-- MASTER_TEMPLATE_MEMORY_END -->",
    "Master-template bootstrap note",
    "### M-005 — Technology-agnostic master template",
    "### M-010 — Windows is a first-class platform profile",
    "### M-011 — Store submission is a reusable release discipline",
    "### M-014 — Capability packs are explicit and CI is split",
    "### M-020 — Generated projects remove master-only bootstrap state",
    "### M-021 — Android signing standardizes the contract, not key material",
    "### M-022 — User-facing delivery is design-first",
    "### M-023 — Agent testing is objective-based and risk-proportionate",
    "### M-024 — Adoption ends with one canonical source and pruned optional guidance",
    "### M-025 — Cross-agent continuation is repository-backed",
)
MASTER_TEMPLATE_WORKFLOW = ".github/workflows/template-integrity.yml"
CI_CALLER_WORKFLOW = ".github/workflows/ci.yml"
COMMON_VALIDATION_WORKFLOW = ".github/workflows/common-validation.yml"
# Value of a job-level `uses:` key that invokes the template's reusable
# baseline: optionally single/double quoted, with an optional trailing comment.
COMMON_VALIDATION_USES_VALUE = re.compile(
    r"""^(["']?)\./\.github/workflows/common-validation\.yml\1[ \t]*(?:#.*)?$"""
)
_YAML_KEY_LINE = re.compile(r"^([ ]*)([A-Za-z0-9_.-]+|\"[^\"]*\"|'[^']*')[ \t]*:(?:[ \t]+(.*))?$")
_BLOCK_SCALAR_VALUE = re.compile(r"^[|>][0-9+-]*[ \t]*(?:#.*)?$")


def calls_common_validation(caller_text: str) -> bool:
    """Return True only for a real `jobs.<job_id>.uses:` reusable-workflow call.

    Line-aware, stdlib-only scan of block-style YAML: comment lines and the
    contents of block scalars (`run: |`, `>-`, ...) are skipped, step-level
    `- uses:` entries are ignored, and only a `uses:` key at the job-key level
    directly under top-level `jobs:` counts.
    """

    in_jobs = False
    job_indent = None
    key_indent = None
    scalar_indent = None  # indent of the key that opened a block scalar
    for raw in caller_text.splitlines():
        line = raw.rstrip()
        stripped = line.lstrip(" ")
        indent = len(line) - len(stripped)
        if scalar_indent is not None:
            if not stripped or indent > scalar_indent:
                continue
            scalar_indent = None
        if not stripped or stripped.startswith("#"):
            continue
        match = _YAML_KEY_LINE.match(line)
        value = (match.group(3) or "").strip() if match else ""
        if match and _BLOCK_SCALAR_VALUE.match(value):
            scalar_indent = indent
        if indent == 0:
            in_jobs = bool(match) and match.group(2).strip("\"'") == "jobs"
            job_indent = key_indent = None
            continue
        if not in_jobs:
            continue
        if job_indent is None:
            job_indent = indent
        if indent <= job_indent:
            job_indent, key_indent = indent, None
            continue
        if key_indent is None:
            key_indent = indent
        if (
            indent == key_indent
            and match
            and match.group(2).strip("\"'") == "uses"
            and COMMON_VALIDATION_USES_VALUE.match(value)
        ):
            return True
    return False


MASTER_TEMPLATE_HANDOFF_MARKERS = (
    "<!-- MASTER_TEMPLATE_HANDOFFS_START -->",
    "<!-- MASTER_TEMPLATE_HANDOFFS_END -->",
)

CORE_FILES = (
    "README.md",
    "AGENTS.md",
    "docs/PRODUCT.md",
    "docs/ARCHITECTURE.md",
    "docs/STATUS.md",
    "docs/HANDOFFS.md",
    "docs/PROJECT-MEMORY.md",
    "docs/SECURITY.md",
    "docs/TESTING.md",
    "docs/RELEASE.md",
    "docs/REPOSITORY-SETUP.md",
    "docs/CAPABILITY-PACKS.md",
    ".agent/TASK-CONTRACT.md",
    "tasks/TEMPLATE.md",
    ".github/pull_request_template.md",
    "config/project-profile.json",
)

DESIGN_CORE_FILES = (
    "docs/DESIGN-SYSTEM.md",
    "docs/ACCESSIBILITY.md",
    "design/README.md",
    "design/figma/README.md",
    "design/tokens/design-tokens.json",
    "design/components/COMPONENT-CATALOG.md",
    "design/resources/DESIGN-RESOURCE-CATALOG.md",
)

# Shared by store/directory release workflows.
DISTRIBUTION_CORE_FILES = (
    "store/README.md",
    "store/SUBMISSION-METADATA.md",
    "store/DATA-PRIVACY-DECLARATION.md",
)

# App-store-specific compliance overlays. WordPress.org does not require these
# solely because it is selected as a distribution directory.
APP_STORE_COMPLIANCE_FILES = (
    "store/AGE-CONTENT-RATINGS.md",
    "store/JURISDICTION-MATRIX.md",
)

ANDROID_RELEASE_FILES = (
    "release/android-signing.md",
)

PLATFORM_FILES = {
    "apple": "design/platforms/apple.md",
    "android": "design/platforms/android.md",
    "web": "design/platforms/web.md",
    "windows": "design/platforms/windows.md",
}

STOREFRONT_FILES = {
    "apple": "store/apple.md",
    "google-play": "store/google-play.md",
    "microsoft-store": "store/microsoft-store.md",
    "huawei-appgallery": "store/huawei-appgallery.md",
    "wordpress-org": "store/wordpress-org.md",
}

APP_STOREFRONTS = {
    "apple",
    "google-play",
    "microsoft-store",
    "huawei-appgallery",
}

INTEGRATION_FILES = {
    "google-maps": "design/integrations/google-maps.md",
    "google-workspace": "design/integrations/google-workspace.md",
    "revenuecat": "integrations/revenuecat.md",
    "freemius": "integrations/freemius.md",
    "paddle": "integrations/paddle.md",
}


class ProfileValidationError(ValueError):
    """Raised when a project capability profile is invalid."""


def _unique_list(profile: dict, key: str, allowed: Iterable[str]) -> list[str]:
    values = profile.get(key) or []
    if not isinstance(values, list):
        raise ProfileValidationError(f"{key} must be a list")
    if any(not isinstance(value, str) for value in values):
        raise ProfileValidationError(f"{key} values must be strings")
    if len(values) != len(set(values)):
        raise ProfileValidationError(f"{key} must not contain duplicates")

    unknown = set(values) - set(allowed)
    if unknown:
        raise ProfileValidationError(f"Unknown {key}: {sorted(unknown)}")
    return values


def required_files_for_profile(profile: dict, repository: str) -> tuple[str, ...]:
    """Validate semantic profile rules and return the required repository files."""

    if profile.get("schemaVersion") != 1:
        raise ProfileValidationError("schemaVersion must be 1")

    mode = profile.get("repositoryMode")
    if mode not in {"template", "project"}:
        raise ProfileValidationError("repositoryMode must be 'template' or 'project'")
    if repository != MASTER_REPOSITORY and mode != "project":
        raise ProfileValidationError(
            "Generated/adopted repositories must set repositoryMode to 'project'"
        )

    capabilities = profile.get("capabilities")
    if not isinstance(capabilities, dict):
        raise ProfileValidationError("capabilities must be an object")

    design = capabilities.get("design", False)
    store_release = capabilities.get("storeRelease", False)
    if not isinstance(design, bool) or not isinstance(store_release, bool):
        raise ProfileValidationError("Capability flags must be boolean")

    unknown_capabilities = set(capabilities) - {"design", "storeRelease"}
    if unknown_capabilities:
        raise ProfileValidationError(
            f"Unknown capabilities: {sorted(unknown_capabilities)}"
        )

    platforms = _unique_list(profile, "platforms", PLATFORM_FILES)
    storefronts = _unique_list(profile, "storefronts", STOREFRONT_FILES)
    integrations = _unique_list(profile, "integrations", INTEGRATION_FILES)

    if platforms and not design:
        raise ProfileValidationError(
            "Selecting platforms requires capabilities.design=true"
        )
    if storefronts and not store_release:
        raise ProfileValidationError(
            "Selecting storefronts requires capabilities.storeRelease=true"
        )
    if {"google-maps", "google-workspace"} & set(integrations) and not design:
        raise ProfileValidationError(
            "Google design integrations require capabilities.design=true"
        )

    required: list[str] = list(CORE_FILES)

    if design:
        required.extend(DESIGN_CORE_FILES)
        required.extend(PLATFORM_FILES[name] for name in platforms)

    if store_release:
        required.extend(DISTRIBUTION_CORE_FILES)
        if APP_STOREFRONTS & set(storefronts):
            required.extend(APP_STORE_COMPLIANCE_FILES)
        required.extend(STOREFRONT_FILES[name] for name in storefronts)

    if "android" in platforms or {"google-play", "huawei-appgallery"} & set(storefronts):
        required.extend(ANDROID_RELEASE_FILES)

    required.extend(INTEGRATION_FILES[name] for name in integrations)

    # Preserve order while removing duplicates.
    return tuple(dict.fromkeys(required))


def validate_generated_project_cleanup(
    root: Path, profile: dict, repository: str
) -> None:
    """Reject master-only bootstrap artifacts after a child becomes a project."""

    if repository == MASTER_REPOSITORY or profile.get("repositoryMode") != "project":
        return

    memory_file = root / "docs/PROJECT-MEMORY.md"
    if memory_file.is_file():
        memory_content = memory_file.read_text(encoding="utf-8")
        if any(artifact in memory_content for artifact in MASTER_MEMORY_ARTIFACTS):
            raise ProfileValidationError(
                "Generated/adopted projects must remove inherited master-template "
                "PROJECT-MEMORY entries before Project Baseline can pass"
            )

    workflow_file = root / MASTER_TEMPLATE_WORKFLOW
    if workflow_file.exists():
        raise ProfileValidationError(
            "Generated/adopted projects must remove the inherited master-only "
            "Template Integrity workflow"
        )

    handoff_file = root / "docs/HANDOFFS.md"
    if handoff_file.is_file():
        handoff_content = handoff_file.read_text(encoding="utf-8")
        if any(marker in handoff_content for marker in MASTER_TEMPLATE_HANDOFF_MARKERS):
            raise ProfileValidationError(
                "Generated/adopted projects must remove the inherited master-template "
                "HANDOFFS block before Project Baseline can pass"
            )


def validate_ci_caller_wiring(root: Path) -> None:
    """Require the reusable workflow when the template CI caller is retained.

    Conditional by design: a brownfield repository with its own canonical CI (no
    ci.yml, or a ci.yml that does not call the template's common validation) is
    never required to carry the template's workflow filenames.
    """

    caller = root / CI_CALLER_WORKFLOW
    if not caller.is_file():
        return
    try:
        caller_text = caller.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise ProfileValidationError(
            f"{CI_CALLER_WORKFLOW} is not valid UTF-8: {exc}"
        ) from exc

    if calls_common_validation(caller_text) and not (
        root / COMMON_VALIDATION_WORKFLOW
    ).is_file():
        raise ProfileValidationError(
            f"{CI_CALLER_WORKFLOW} calls ./{COMMON_VALIDATION_WORKFLOW} but that "
            "reusable workflow is missing; restore it or retarget/remove the caller"
        )


def validate_repository(root: Path, profile: dict, repository: str) -> tuple[str, ...]:
    """Validate profile semantics and the files required by the selected packs."""

    required = required_files_for_profile(profile, repository)
    missing = [path for path in required if not (root / path).is_file()]
    if missing:
        raise ProfileValidationError(
            "Missing files for the core operating model or selected capability packs:\n"
            + "\n".join(missing)
        )

    validate_generated_project_cleanup(root, profile, repository)
    validate_ci_caller_wiring(root)

    if profile.get("capabilities", {}).get("design", False):
        token_file = root / "design/tokens/design-tokens.json"
        try:
            with token_file.open(encoding="utf-8") as handle:
                json.load(handle)
        except json.JSONDecodeError as exc:
            raise ProfileValidationError(
                f"Invalid design token JSON: {exc}"
            ) from exc

    return required


def load_profile(path: Path) -> dict:
    try:
        with path.open(encoding="utf-8") as handle:
            profile = json.load(handle)
    except FileNotFoundError as exc:
        raise ProfileValidationError(f"Profile not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ProfileValidationError(f"Invalid profile JSON: {exc}") from exc

    if not isinstance(profile, dict):
        raise ProfileValidationError("Project profile root must be a JSON object")
    return profile


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".", help="Repository root")
    parser.add_argument(
        "--profile",
        default="config/project-profile.json",
        help="Profile path relative to repository root",
    )
    parser.add_argument(
        "--repository",
        default=os.environ.get("GITHUB_REPOSITORY", ""),
        help="owner/repository name; defaults to GITHUB_REPOSITORY",
    )
    args = parser.parse_args()

    root = Path(args.root).resolve()
    profile_path = root / args.profile

    try:
        profile = load_profile(profile_path)
        required = validate_repository(root, profile, args.repository)
    except ProfileValidationError as exc:
        print(f"::error::{exc}")
        return 1

    print(
        f"Project profile is valid; {len(required)} core/selected capability files verified."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
