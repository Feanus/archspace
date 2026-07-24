#!/usr/bin/env python3
"""Offline verifier for the OLMo-3 standard baseline source record."""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path
from typing import Any

import yaml


SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
GIT_COMMIT_RE = re.compile(r"^(?:[0-9a-f]{40}|[0-9a-f]{64})$")
CONTENT_DIGEST_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
REQUIRED_FACTS = (
    "model_family",
    "model_scale",
    "official_repository",
    "immutable_revision",
    "config",
    "checkpoint",
    "license",
)


def load_record(path: Path) -> dict[str, Any]:
    value = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("source record must be a mapping")
    return value


def _nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _check_sha256(value: Any, field: str, errors: list[str]) -> None:
    if not isinstance(value, str) or not SHA256_RE.fullmatch(value):
        errors.append(f"{field} must be a lowercase 64-character SHA-256")


def validate_record(record: dict[str, Any], require_pinned: bool = False) -> list[str]:
    errors: list[str] = []
    if record.get("feature_id") != "feat-olmo3-standard":
        errors.append("feature_id must be feat-olmo3-standard")
    if record.get("status") not in {"unresolved", "pinned"}:
        errors.append("status must be unresolved or pinned")

    facts = record.get("facts")
    if not isinstance(facts, dict):
        return errors + ["facts must be a mapping"]
    for fact_name in REQUIRED_FACTS:
        if not isinstance(facts.get(fact_name), dict):
            errors.append(f"facts.{fact_name} must be a mapping")

    sources = record.get("authoritative_sources")
    if not isinstance(sources, list):
        errors.append("authoritative_sources must be a list")
        sources = []
    source_ids: set[str] = set()
    for index, source in enumerate(sources):
        prefix = f"authoritative_sources[{index}]"
        if not isinstance(source, dict):
            errors.append(f"{prefix} must be a mapping")
            continue
        source_id = source.get("id")
        if not _nonempty(source_id):
            errors.append(f"{prefix}.id is required")
        elif source_id in source_ids:
            errors.append(f"duplicate authoritative source id: {source_id}")
        else:
            source_ids.add(source_id)
        for field in ("uri", "source_type", "retrieved_at"):
            if not _nonempty(source.get(field)):
                errors.append(f"{prefix}.{field} is required")
        digest = source.get("sha256")
        immutable_uri = source.get("content_addressed") is True
        if not immutable_uri:
            _check_sha256(digest, f"{prefix}.sha256", errors)

    for fact_name in REQUIRED_FACTS:
        fact = facts.get(fact_name)
        if not isinstance(fact, dict):
            continue
        status = fact.get("status")
        if status not in {"unresolved", "project_declared", "pinned"}:
            errors.append(f"facts.{fact_name}.status is invalid")
        evidence = fact.get("evidence", [])
        if not isinstance(evidence, list):
            errors.append(f"facts.{fact_name}.evidence must be a list")
        elif status == "pinned":
            if not evidence:
                errors.append(f"facts.{fact_name}.evidence is required when pinned")
            for source_id in evidence:
                if source_id not in source_ids:
                    errors.append(
                        f"facts.{fact_name}.evidence references unknown source {source_id!r}"
                    )

    if require_pinned or record.get("status") == "pinned":
        if record.get("status") != "pinned":
            errors.append("top-level status is not pinned")
        if record.get("unresolved_fields"):
            errors.append("unresolved_fields must be empty before pinning")
        if not sources:
            errors.append("at least one authoritative source is required")
        for fact_name in REQUIRED_FACTS:
            fact = facts.get(fact_name, {})
            if fact.get("status") != "pinned":
                errors.append(f"facts.{fact_name} is not pinned")

        family = facts.get("model_family", {})
        if not _nonempty(family.get("value")):
            errors.append("facts.model_family.value is required")
        scale = facts.get("model_scale", {})
        if not _nonempty(scale.get("value")):
            errors.append("facts.model_scale.value is required")
        repository = facts.get("official_repository", {})
        repository_url = repository.get("url")
        if not _nonempty(repository_url) or not repository_url.startswith("https://"):
            errors.append("facts.official_repository.url must be an HTTPS URL")
        revision = facts.get("immutable_revision", {})
        revision_value = revision.get("value")
        if not _nonempty(revision_value):
            errors.append("facts.immutable_revision.value is required")
        revision_type = revision.get("revision_type")
        if revision_type not in {"git_commit", "content_digest"}:
            errors.append("immutable revision_type must be git_commit or content_digest")
        elif revision_type == "git_commit" and not GIT_COMMIT_RE.fullmatch(revision_value or ""):
            errors.append("git immutable revision must be a full 40- or 64-character commit id")
        elif revision_type == "content_digest" and not CONTENT_DIGEST_RE.fullmatch(revision_value or ""):
            errors.append("content immutable revision must be sha256:<64 lowercase hex>")
        for name in ("config", "checkpoint"):
            artifact = facts.get(name, {})
            if not _nonempty(artifact.get("uri")):
                errors.append(f"facts.{name}.uri is required")
            _check_sha256(artifact.get("sha256"), f"facts.{name}.sha256", errors)
        license_fact = facts.get("license", {})
        if not _nonempty(license_fact.get("identifier")):
            errors.append("facts.license.identifier is required")
        if not _nonempty(license_fact.get("uri")):
            errors.append("facts.license.uri is required")
        _check_sha256(license_fact.get("sha256"), "facts.license.sha256", errors)

    return errors


def verify_local_artifacts(record: dict[str, Any], base_dir: Path) -> list[str]:
    errors: list[str] = []
    candidates: list[tuple[str, dict[str, Any]]] = []
    for name in ("config", "checkpoint", "license"):
        fact = record.get("facts", {}).get(name)
        if isinstance(fact, dict):
            candidates.append((f"facts.{name}", fact))
    for index, source in enumerate(record.get("authoritative_sources", [])):
        if isinstance(source, dict):
            candidates.append((f"authoritative_sources[{index}]", source))

    for label, item in candidates:
        local_path = item.get("local_path")
        expected = item.get("sha256")
        if not local_path:
            continue
        path = (base_dir / local_path).resolve()
        if not path.is_file():
            errors.append(f"{label}.local_path does not exist: {local_path}")
            continue
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != expected:
            errors.append(f"{label}.local_path SHA-256 mismatch")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "record",
        nargs="?",
        type=Path,
        default=Path(__file__).with_name("olmo-3-standard.yaml"),
    )
    parser.add_argument("--require-pinned", action="store_true")
    parser.add_argument("--verify-local-artifacts", action="store_true")
    args = parser.parse_args(argv)

    try:
        record = load_record(args.record)
        errors = validate_record(record, require_pinned=args.require_pinned)
        if args.verify_local_artifacts:
            errors.extend(verify_local_artifacts(record, args.record.parent))
    except (OSError, ValueError, yaml.YAMLError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2

    if errors:
        for error in errors:
            print(f"FAIL: {error}", file=sys.stderr)
        return 1
    print(f"PASS: {args.record} is a valid {record['status']} source record")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
