#!/usr/bin/env python3
"""Validate and deterministically package a website knowledge-base candidate."""

from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path, PurePosixPath

FACT_HEADINGS = [
    "D01 企业基础",
    "D02 团队",
    "D03 产品服务",
    "D04 技术能力",
    "D05 客户案例",
    "D06 资质认证",
    "D07 财务融资",
    "D08 竞争信息",
    "D09 市场信息",
    "D10 品牌资产",
    "D11 渠道",
    "D12 公开意图",
    "D13 公共情报",
]
CUSTOMER_HEADINGS = [
    "企业与品牌",
    "团队与组织",
    "产品与服务",
    "技术与交付",
    "客户与行业",
    "服务与合作",
    "可信优势",
]
EVIDENCE_MARKER = re.compile(
    r"\[(?:来源|企业主张|权威来源|第三方来源)\]\(https?://[^)\s]+\)"
    r"|\[上传文件：[^\]]+\]|\[待核验\]"
)
LOGO_EXTENSIONS = {".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".webp"}
ZIP_DATE = (1980, 1, 1, 0, 0, 0)
MAX_TEXT_BYTES = 2 * 1024 * 1024
MAX_LOGO_BYTES = 8 * 1024 * 1024


class CandidateError(ValueError):
    pass


def sections(markdown: str) -> dict[str, str]:
    matches = list(re.finditer(r"^##\s+(.+?)\s*$", markdown, re.MULTILINE))
    output: dict[str, str] = {}
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(markdown)
        output[match.group(1).strip()] = markdown[match.end() : end].strip()
    return output


def validate_markdown(path: Path, expected: list[str]) -> bytes:
    if not path.is_file():
        raise CandidateError(f"missing required file: {path.name}")
    data = path.read_bytes()
    if not data or len(data) > MAX_TEXT_BYTES:
        raise CandidateError(f"{path.name} is empty or exceeds 2 MiB")
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as error:
        raise CandidateError(f"{path.name} must be UTF-8") from error
    parsed = sections(text)
    missing = [heading for heading in expected if heading not in parsed]
    if missing:
        raise CandidateError(f"{path.name} missing headings: {', '.join(missing)}")
    for heading in expected:
        body = parsed[heading]
        if not body:
            raise CandidateError(f"{path.name} has an empty section: {heading}")
        if not EVIDENCE_MARKER.search(body):
            raise CandidateError(
                f"{path.name} section lacks an evidence marker: {heading}"
            )
    return data


def safe_logo_path(value: str) -> str | None:
    normalized = str(PurePosixPath(value.replace("\\", "/")))
    if (
        normalized.startswith("/")
        or normalized.startswith("../")
        or "/../" in normalized
        or not normalized.startswith("assets/logo.")
        or Path(normalized).suffix.lower() not in LOGO_EXTENSIONS
    ):
        return None
    return normalized


def validate_run(path: Path, input_dir: Path) -> tuple[bytes | None, tuple[str, bytes] | None]:
    if not path.is_file():
        return None, None
    data = path.read_bytes()
    if not data or len(data) > MAX_TEXT_BYTES:
        raise CandidateError("02_run.json is empty or exceeds 2 MiB")
    try:
        value = json.loads(data)
    except json.JSONDecodeError as error:
        raise CandidateError(f"02_run.json is invalid JSON: {error}") from error
    if not isinstance(value, dict) or value.get("schemaVersion") != 1:
        raise CandidateError("02_run.json must be an object with schemaVersion 1")
    assets = value.get("assets", [])
    if not isinstance(assets, list) or len(assets) > 1:
        raise CandidateError("02_run.json assets must contain at most one logo")
    logo: tuple[str, bytes] | None = None
    if assets:
        asset = assets[0]
        if not isinstance(asset, dict) or asset.get("type") != "brand_identity":
            raise CandidateError("the optional asset must have type brand_identity")
        relative = safe_logo_path(str(asset.get("path", "")))
        if not relative:
            raise CandidateError("the optional asset path must be assets/logo.<image>")
        logo_path = input_dir.joinpath(*PurePosixPath(relative).parts)
        if not logo_path.is_file():
            raise CandidateError(f"logo metadata references a missing file: {relative}")
        logo_bytes = logo_path.read_bytes()
        if not logo_bytes or len(logo_bytes) > MAX_LOGO_BYTES:
            raise CandidateError("logo is empty or exceeds 8 MiB")
        logo = (relative, logo_bytes)
    canonical = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True)
    return f"{canonical}\n".encode(), logo


def write_entry(archive: zipfile.ZipFile, name: str, data: bytes) -> None:
    info = zipfile.ZipInfo(name, ZIP_DATE)
    info.create_system = 3
    info.external_attr = 0o100644 << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    archive.writestr(info, data)


def build(input_dir: Path, output: Path) -> None:
    facts = validate_markdown(input_dir / "00_brand_facts.md", FACT_HEADINGS)
    customer = validate_markdown(
        input_dir / "01_customer_draft.md", CUSTOMER_HEADINGS
    )
    run, logo = validate_run(input_dir / "02_run.json", input_dir)
    entries: list[tuple[str, bytes]] = [
        ("00_brand_facts.md", facts),
        ("01_customer_draft.md", customer),
    ]
    if run is not None:
        entries.append(("02_run.json", run))
    if logo is not None:
        entries.append(logo)
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, "w") as archive:
        for name, data in sorted(entries):
            write_entry(archive, name, data)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        build(args.input_dir.resolve(), args.output.resolve())
    except CandidateError as error:
        print(f"INVALID: {error}", file=sys.stderr)
        return 1
    print(f"VALID: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
