#!/usr/bin/env python3
"""Validate and deterministically package a website knowledge-base candidate."""

from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
import unicodedata
import zipfile
from pathlib import Path, PurePosixPath
from urllib.parse import urlparse, urlsplit, urlunsplit

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
CUSTOMER_CONTENT_FLOORS = {
    "企业与品牌": 500,
    "团队与组织": 500,
    "产品与服务": 2500,
    "技术与交付": 1000,
    "客户与行业": 600,
    "服务与合作": 600,
    "可信优势": 600,
}
EVIDENCE_MARKER = re.compile(
    r"\[(?:来源|企业主张|权威来源|第三方来源)\]\(https?://[^)\s]+\)"
    r"|\[上传文件：[^\]]+\]|\[待核验\]"
)
SOURCE_URL_MARKER = re.compile(
    r"\[(?:来源|企业主张|权威来源|第三方来源)\]\((https?://[^)\s]+)\)"
)
UPLOAD_MARKER = re.compile(r"\[上传文件：([^\]]+)\]")
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


def meaningful_character_count(markdown: str) -> int:
    visible = EVIDENCE_MARKER.sub("", markdown)
    visible = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", visible)
    visible = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", visible)
    visible = re.sub(r"https?://\S+", "", visible)
    visible = re.sub(r"^#{1,6}\s*", "", visible, flags=re.MULTILINE)
    return len(re.sub(r"[^\w\u4e00-\u9fff]", "", visible, flags=re.UNICODE))


def normalized_url(value: str) -> str:
    return value.strip().rstrip("/")


def normalized_evidence_url(value: str) -> str:
    if not public_http_url(value):
        raise CandidateError(f"evidence marker URL must be public HTTP(S): {value}")
    parsed = urlsplit(value.strip())
    scheme = parsed.scheme.lower()
    hostname = (parsed.hostname or "").lower()
    host = f"[{hostname}]" if ":" in hostname else hostname
    try:
        port = parsed.port
    except ValueError as error:
        raise CandidateError(f"evidence URL has an invalid port: {value}") from error
    if port is not None and not (
        (scheme == "http" and port == 80) or (scheme == "https" and port == 443)
    ):
        host = f"{host}:{port}"
    return urlunsplit((scheme, host, parsed.path or "/", parsed.query, ""))


def evidence_references(markdown: str) -> dict[str, str]:
    references: dict[str, str] = {}
    for match in SOURCE_URL_MARKER.finditer(markdown):
        normalized = normalized_evidence_url(match.group(1))
        references[f"url:{normalized}"] = normalized
    for match in UPLOAD_MARKER.finditer(markdown):
        filename = unicodedata.normalize("NFKC", match.group(1).strip())
        references[f"upload:{filename.casefold()}"] = f"[上传文件：{filename}]"
    return references


def validate_evidence_closure(facts: bytes, customer: bytes) -> None:
    fact_references = evidence_references(facts.decode("utf-8"))
    customer_references = evidence_references(customer.decode("utf-8"))
    missing = sorted(set(customer_references) - set(fact_references))
    if missing:
        labels = ", ".join(customer_references[key] for key in missing)
        raise CandidateError(
            "01_customer_draft.md evidence references are absent from "
            f"00_brand_facts.md: {labels}"
        )


def validate_content_floors(customer: bytes, run_value: dict[str, object]) -> None:
    parsed = sections(customer.decode("utf-8"))
    raw_exceptions = run_value.get("contentFloorExceptions", [])
    if not isinstance(raw_exceptions, list) or len(raw_exceptions) > len(
        CUSTOMER_HEADINGS
    ):
        raise CandidateError(
            "02_run.json contentFloorExceptions must contain at most seven items"
        )

    source_urls = {
        normalized_url(source["url"])
        for source in run_value.get("sources", [])
        if isinstance(source, dict) and isinstance(source.get("url"), str)
    }
    exceptions: dict[str, dict[str, object]] = {}
    for index, exception in enumerate(raw_exceptions):
        if not isinstance(exception, dict):
            raise CandidateError(f"contentFloorExceptions[{index}] must be an object")
        section = exception.get("section")
        if section not in CUSTOMER_CONTENT_FLOORS:
            raise CandidateError(f"contentFloorExceptions[{index}].section is invalid")
        if section in exceptions:
            raise CandidateError(f"duplicate content-floor exception: {section}")
        reason = require_text(
            exception.get("reason"),
            f"contentFloorExceptions[{index}].reason",
            1000,
        )
        if meaningful_character_count(reason) < 12:
            raise CandidateError(
                f"contentFloorExceptions[{index}].reason must be concrete"
            )
        attempted = exception.get("attemptedSourceUrls")
        if not isinstance(attempted, list):
            raise CandidateError(
                f"contentFloorExceptions[{index}].attemptedSourceUrls must be an array"
            )
        attempted_urls = []
        for attempted_index, url in enumerate(attempted):
            if not public_http_url(url):
                raise CandidateError(
                    f"contentFloorExceptions[{index}].attemptedSourceUrls[{attempted_index}] must be HTTP(S)"
                )
            attempted_urls.append(normalized_url(url))
        if len(set(attempted_urls)) < 3:
            raise CandidateError(
                f"contentFloorExceptions[{index}] must record at least three distinct source attempts"
            )
        missing_sources = sorted(set(attempted_urls) - source_urls)
        if missing_sources:
            raise CandidateError(
                f"contentFloorExceptions[{index}] references URLs absent from sources"
            )
        exceptions[section] = exception

    for heading, minimum in CUSTOMER_CONTENT_FLOORS.items():
        body = parsed[heading]
        actual = meaningful_character_count(body)
        exception = exceptions.get(heading)
        if actual >= minimum:
            if exception is not None:
                raise CandidateError(
                    f"content-floor exception is unnecessary for {heading}: {actual} >= {minimum}"
                )
            continue
        if exception is None:
            raise CandidateError(
                f"01_customer_draft.md section is below its visible-content floor: {heading} {actual}/{minimum}"
            )
        if "[待核验]" not in body:
            raise CandidateError(
                f"below-floor exception section must include [待核验]: {heading}"
            )


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


def validate_run(
    path: Path, input_dir: Path
) -> tuple[bytes, tuple[str, bytes] | None, dict[str, object]]:
    if not path.is_file():
        raise CandidateError("missing required file: 02_run.json")
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
    logo_acquisition = value.get("logoAcquisition")
    if not isinstance(logo_acquisition, dict):
        raise CandidateError("02_run.json logoAcquisition must be an object")
    logo_status = logo_acquisition.get("status")
    if logo_status not in {"retained", "unavailable"}:
        raise CandidateError(
            "logoAcquisition.status must be retained or unavailable"
        )
    attempted_page_urls = logo_acquisition.get("attemptedPageUrls", [])
    if not isinstance(attempted_page_urls, list):
        raise CandidateError("logoAcquisition.attemptedPageUrls must be an array")
    normalized_attempted_pages: list[str] = []
    for index, attempted_page_url in enumerate(attempted_page_urls):
        if not public_http_url(attempted_page_url):
            raise CandidateError(
                f"logoAcquisition.attemptedPageUrls[{index}] must be HTTP(S)"
            )
        normalized_attempted_pages.append(normalized_url(attempted_page_url))
    if assets:
        if logo_status != "retained":
            raise CandidateError(
                "logoAcquisition.status must be retained when a logo is packaged"
            )
        asset = assets[0]
        if not isinstance(asset, dict) or asset.get("type") != "brand_identity":
            raise CandidateError("the optional asset must have type brand_identity")
        source_kind = asset.get("sourceKind")
        if source_kind not in {
            "official_web",
            "official_document",
            "user_upload",
        }:
            raise CandidateError("the optional asset sourceKind is invalid")
        require_text(asset.get("caption"), "assets[0].caption", 500)
        for url_field in ("sourcePageUrl", "sourceAssetUrl"):
            if asset.get(url_field) is not None and not public_http_url(asset[url_field]):
                raise CandidateError(f"assets[0].{url_field} must be HTTP(S)")
        if source_kind == "official_web":
            for url_field in ("sourcePageUrl", "sourceAssetUrl"):
                if not public_http_url(asset.get(url_field)):
                    raise CandidateError(
                        f"official-web logo requires assets[0].{url_field}"
                    )
        if source_kind in {"official_document", "user_upload"}:
            require_text(
                asset.get("sourceDocumentName"),
                "assets[0].sourceDocumentName",
                512,
            )
        elif asset.get("sourceDocumentName") is not None:
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
    else:
        if logo_status != "unavailable":
            raise CandidateError(
                "logoAcquisition.status must be unavailable when no logo is packaged"
            )
        reason = require_text(
            logo_acquisition.get("reason"), "logoAcquisition.reason", 1000
        )
        if meaningful_character_count(reason) < 12:
            raise CandidateError("logoAcquisition.reason must be concrete")
        if len(set(normalized_attempted_pages)) < 2:
            raise CandidateError(
                "unavailable logo must record at least two distinct first-party page attempts"
            )
        source_urls = {
            normalized_url(source["url"])
            for source in sources
            if isinstance(source, dict) and isinstance(source.get("url"), str)
        }
        if not set(normalized_attempted_pages).issubset(source_urls):
            raise CandidateError(
                "logoAcquisition attempted pages must also appear in sources"
            )
        if isinstance(official_website, str):
            official_host = urlparse(official_website).hostname or ""
            attempted_hosts = [
                urlparse(page).hostname or "" for page in normalized_attempted_pages
            ]
            if any(
                host != official_host and not host.endswith(f".{official_host}")
                for host in attempted_hosts
            ):
                raise CandidateError(
                    "unavailable logo attempts must use first-party pages from the official website"
                )
    canonical = json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True)
    return f"{canonical}\n".encode(), logo, value


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
    validate_evidence_closure(facts, customer)
    run, logo, run_value = validate_run(input_dir / "02_run.json", input_dir)
    validate_content_floors(customer, run_value)
    entries: list[tuple[str, bytes]] = [
        ("00_brand_facts.md", facts),
        ("01_customer_draft.md", customer),
    ]
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
