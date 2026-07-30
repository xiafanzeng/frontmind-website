#!/usr/bin/env python3
"""Validate and deterministically package a website knowledge-base candidate."""

from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
import zipfile
from pathlib import Path, PurePosixPath
from urllib.parse import urlparse

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
OUTPUT_FILENAME = "website-lead-candidate-v1.zip"
SOURCE_KINDS = {
    "official_web",
    "official_document",
    "user_upload",
    "authoritative",
    "reputable_media",
    "other",
}
SOURCE_STATUSES = {"read", "partial", "failed"}
INDUSTRY_CLUSTERS = {"C1", "C2", "C3", "C4", "C5", "C6"}


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


def public_http_url(value: object) -> bool:
    if not isinstance(value, str) or len(value) > 4000:
        return False
    try:
        parsed = urlparse(value)
    except ValueError:
        return False
    return (
        parsed.scheme in {"http", "https"}
        and bool(parsed.hostname)
        and parsed.username is None
        and parsed.password is None
    )


def require_text(value: object, label: str, maximum: int) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise CandidateError(f"{label} must be non-empty text up to {maximum} chars")
    return value.strip()


def validate_logo_bytes(relative: str, data: bytes) -> None:
    suffix = Path(relative).suffix.lower()
    valid = False
    if suffix == ".png":
        valid = data.startswith(b"\x89PNG\r\n\x1a\n")
    elif suffix == ".gif":
        valid = data.startswith((b"GIF87a", b"GIF89a"))
    elif suffix in {".jpg", ".jpeg"}:
        valid = data.startswith(b"\xff\xd8\xff") and data.endswith(b"\xff\xd9")
    elif suffix == ".webp":
        valid = len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    elif suffix == ".avif":
        valid = len(data) >= 12 and data[4:8] == b"ftyp" and b"avif" in data[8:32]
    elif suffix == ".svg":
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            text = ""
        valid = bool(re.search(r"<svg(?:\s|>)", text, re.IGNORECASE))
    if not valid:
        raise CandidateError(f"logo content does not match its extension: {relative}")


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
    company = value.get("company")
    if not isinstance(company, dict):
        raise CandidateError("02_run.json company must be an object")
    require_text(company.get("name"), "company.name", 200)
    official_website = company.get("officialWebsite")
    if official_website is not None and not public_http_url(official_website):
        raise CandidateError("company.officialWebsite must be a public HTTP(S) URL")
    industry_cluster = company.get("industryCluster")
    if industry_cluster is not None and industry_cluster not in INDUSTRY_CLUSTERS:
        raise CandidateError("company.industryCluster is invalid")
    sources = value.get("sources", [])
    if not isinstance(sources, list) or len(sources) > 500:
        raise CandidateError("02_run.json sources must be an array of at most 500")
    for index, source in enumerate(sources):
        if not isinstance(source, dict):
            raise CandidateError(f"sources[{index}] must be an object")
        require_text(source.get("title"), f"sources[{index}].title", 500)
        if source.get("kind") not in SOURCE_KINDS:
            raise CandidateError(f"sources[{index}].kind is invalid")
        if source.get("status") not in SOURCE_STATUSES:
            raise CandidateError(f"sources[{index}].status is invalid")
        source_url = source.get("url")
        if source_url is not None and not public_http_url(source_url):
            raise CandidateError(f"sources[{index}].url must be HTTP(S)")
        attachment_name = source.get("attachmentName")
        if attachment_name is not None:
            require_text(
                attachment_name,
                f"sources[{index}].attachmentName",
                512,
            )
    queries = value.get("queries", [])
    if (
        not isinstance(queries, list)
        or len(queries) > 100
        or any(not isinstance(item, str) or not item.strip() or len(item) > 500 for item in queries)
    ):
        raise CandidateError("02_run.json queries must contain at most 100 text items")
    assets = value.get("assets", [])
    if not isinstance(assets, list) or len(assets) > 1:
        raise CandidateError("02_run.json assets must contain at most one logo")
    logo: tuple[str, bytes] | None = None
    if assets:
        asset = assets[0]
        if not isinstance(asset, dict) or asset.get("type") != "brand_identity":
            raise CandidateError("the optional asset must have type brand_identity")
        if asset.get("sourceKind") not in {
            "official_web",
            "official_document",
            "user_upload",
        }:
            raise CandidateError("the optional asset sourceKind is invalid")
        require_text(asset.get("caption"), "assets[0].caption", 500)
        for url_field in ("sourcePageUrl", "sourceAssetUrl"):
            if asset.get(url_field) is not None and not public_http_url(asset[url_field]):
                raise CandidateError(f"assets[0].{url_field} must be HTTP(S)")
        if asset.get("sourceDocumentName") is not None:
            require_text(
                asset["sourceDocumentName"],
                "assets[0].sourceDocumentName",
                512,
            )
        relative = safe_logo_path(str(asset.get("path", "")))
        if not relative:
            raise CandidateError("the optional asset path must be assets/logo.<image>")
        logo_path = input_dir.joinpath(*PurePosixPath(relative).parts)
        if not logo_path.is_file():
            raise CandidateError(f"logo metadata references a missing file: {relative}")
        logo_bytes = logo_path.read_bytes()
        if not logo_bytes or len(logo_bytes) > MAX_LOGO_BYTES:
            raise CandidateError("logo is empty or exceeds 8 MiB")
        validate_logo_bytes(relative, logo_bytes)
        logo = (relative, logo_bytes)
    canonical = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True)
    return f"{canonical}\n".encode(), logo


def write_entry(archive: zipfile.ZipFile, name: str, data: bytes) -> None:
    info = zipfile.ZipInfo(name, ZIP_DATE)
    info.create_system = 3
    info.external_attr = 0o100644 << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    archive.writestr(info, data)


def validate_written_archive(path: Path, expected: list[tuple[str, bytes]]) -> None:
    with zipfile.ZipFile(path, "r") as archive:
        if archive.testzip() is not None:
            raise CandidateError("written ZIP failed CRC validation")
        expected_names = [name for name, _ in sorted(expected)]
        actual_names = archive.namelist()
        if actual_names != expected_names:
            raise CandidateError("written ZIP entries do not match the candidate contract")
        for name, data in sorted(expected):
            info = archive.getinfo(name)
            if info.date_time != ZIP_DATE or info.external_attr != 0o100644 << 16:
                raise CandidateError(f"written ZIP metadata is not deterministic: {name}")
            if archive.read(name) != data:
                raise CandidateError(f"written ZIP content mismatch: {name}")


def build(input_dir: Path, output: Path) -> None:
    if output.name != OUTPUT_FILENAME:
        raise CandidateError(f"output filename must be exactly {OUTPUT_FILENAME}")
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
    with tempfile.NamedTemporaryFile(
        prefix=f".{OUTPUT_FILENAME}.",
        suffix=".tmp",
        dir=output.parent,
        delete=False,
    ) as temporary:
        temporary_path = Path(temporary.name)
    try:
        with zipfile.ZipFile(temporary_path, "w") as archive:
            for name, data in sorted(entries):
                write_entry(archive, name, data)
        validate_written_archive(temporary_path, entries)
        temporary_path.replace(output)
    finally:
        temporary_path.unlink(missing_ok=True)


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
