#!/usr/bin/env python3
"""Offline validation for the commit-pinned Concept OLMo work observation."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import yaml


FULL_COMMIT = re.compile(r"^[0-9a-f]{40}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
TOKEN = re.compile(r"(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]+|authorization\s*:|access[_-]?token)", re.I)
ABSOLUTE_INTERNAL = re.compile(r"/(?:mnt|home|root|workspace|nfs|gpfs)(?:/|\\b)")


def load_record(path: Path) -> dict[str, Any]:
    record = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(record, dict):
        raise ValueError("observation record must be a mapping")
    return record


def _full_commit(value: Any, field: str, errors: list[str]) -> None:
    if not isinstance(value, str) or not FULL_COMMIT.fullmatch(value):
        errors.append(f"{field} must be a full 40-character commit")


def _safe_https(url: Any, field: str, errors: list[str]) -> None:
    if not isinstance(url, str):
        errors.append(f"{field} must be an HTTPS URL")
        return
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname != "github.com":
        errors.append(f"{field} must use credential-free https://github.com")
    if parsed.username or parsed.password or parse_qs(parsed.query):
        errors.append(f"{field} must not contain credentials or query tokens")
    if TOKEN.search(url):
        errors.append(f"{field} contains a token-like value")


def validate_record(record: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    rendered = yaml.safe_dump(record, allow_unicode=True)
    if TOKEN.search(rendered):
        errors.append("record contains a token-like secret")
    if ABSOLUTE_INTERNAL.search(rendered):
        errors.append("record contains an absolute internal path")
    if record.get("status") != "pinned_observation":
        errors.append("status must be pinned_observation")
    retrieved_at = record.get("retrieved_at")
    if not isinstance(retrieved_at, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", retrieved_at):
        errors.append("retrieved_at must be an explicit UTC timestamp")

    repository = record.get("repository")
    if not isinstance(repository, dict):
        return errors + ["repository must be a mapping"]
    if repository.get("role") != "derived_private_work_repository":
        errors.append("repository.role must be derived_private_work_repository")
    if repository.get("official_olmo3_source") is not False:
        errors.append("work repository must not be marked as an official OLMo-3 source")
    if repository.get("root_provenance") is not False:
        errors.append("work repository must not be marked as root provenance")
    _safe_https(repository.get("url"), "repository.url", errors)

    observation = record.get("observation_range")
    if not isinstance(observation, dict):
        errors.append("observation_range must be a mapping")
    else:
        for field in ("initial_revision", "head_revision"):
            _full_commit(observation.get(field), f"observation_range.{field}", errors)
        for index, parent in enumerate(observation.get("head_parents", [])):
            _full_commit(parent, f"observation_range.head_parents[{index}]", errors)

    pull_request = record.get("pull_request", {})
    _safe_https(pull_request.get("url"), "pull_request.url", errors)
    for field in ("base_revision", "head_revision", "merge_revision"):
        _full_commit(pull_request.get(field), f"pull_request.{field}", errors)

    branch = record.get("branch_observation", {})
    for field in ("revision", "merge_base_revision"):
        _full_commit(branch.get(field), f"branch_observation.{field}", errors)
    if branch.get("disposition") != "unmerged_configuration_candidates":
        errors.append("olmo_1B_3B must remain explicitly unmerged configuration candidates")

    artifacts = record.get("artifacts")
    if not isinstance(artifacts, list) or not artifacts:
        return errors + ["artifacts must be a non-empty list"]
    ids: set[str] = set()
    for index, artifact in enumerate(artifacts):
        prefix = f"artifacts[{index}]"
        if not isinstance(artifact, dict):
            errors.append(f"{prefix} must be a mapping")
            continue
        artifact_id = artifact.get("id")
        if not isinstance(artifact_id, str) or not artifact_id:
            errors.append(f"{prefix}.id is required")
        elif artifact_id in ids:
            errors.append(f"duplicate artifact id: {artifact_id}")
        else:
            ids.add(artifact_id)
        revision = artifact.get("revision")
        _full_commit(revision, f"{prefix}.revision", errors)
        digest = artifact.get("sha256")
        if not isinstance(digest, str) or not SHA256.fullmatch(digest):
            errors.append(f"{prefix}.sha256 must be a lowercase SHA-256")
        locator = artifact.get("locator")
        _safe_https(locator, f"{prefix}.locator", errors)
        if isinstance(locator, str):
            if not isinstance(revision, str) or f"/blob/{revision}/" not in locator:
                errors.append(f"{prefix}.locator must be pinned to its full revision")
            if re.search(r"/blob/(?:main|master|[0-9a-f]{7,39})/", locator):
                errors.append(f"{prefix}.locator must not use a branch or short commit")
        path = artifact.get("path")
        if not isinstance(path, str) or path.startswith("/") or ".." in Path(path).parts:
            errors.append(f"{prefix}.path must be a safe repository-relative path")

    security = record.get("security", {})
    for field in ("credentials_embedded", "absolute_internal_paths_embedded", "clone_used"):
        if security.get(field) is not False:
            errors.append(f"security.{field} must be false")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "record",
        nargs="?",
        type=Path,
        default=Path(__file__).with_name("concept-olmo-observation.yaml"),
    )
    args = parser.parse_args(argv)
    try:
        errors = validate_record(load_record(args.record))
    except (OSError, ValueError, yaml.YAMLError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    if errors:
        for error in errors:
            print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(f"PASS: {args.record} is a valid commit-pinned work-repository observation")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
