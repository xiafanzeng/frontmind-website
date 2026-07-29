#!/usr/bin/env python3
"""Deterministically validate website-lead knowledge-base ZIP contracts."""

from __future__ import annotations

import argparse
import hashlib
import io
import ipaddress
import json
import re
import string
import sys
import unicodedata
import zipfile
from collections import Counter, defaultdict
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit

try:
    from PIL import Image, UnidentifiedImageError
except ImportError:  # The server still performs an independent native decode.
    Image = None
    UnidentifiedImageError = OSError

CONTENT_PREFIXES = (
    "01_company_overview/",
    "02_team/",
    "03_products/",
    "04_technology/",
    "05_manufacturing/",
    "06_industries/",
    "07_service/",
    "08_competitive_advantages/",
)
DISPLAY_BRANCH = {
    "01_company_overview": "company-identity",
    "02_team": "team",
    "03_products": "products-services",
    "04_technology": "core-capabilities",
    "05_manufacturing": "core-capabilities",
    "06_industries": "customers-industries",
    "07_service": "cooperation",
    "08_competitive_advantages": "why-frontmind",
}
STATUSES = (
    "verified_first_party",
    "verified_authoritative",
    "supported_third_party",
    "inferred",
    "needs_verification",
    "not_applicable",
)
STATUS_KEYS = {
    "verified_first_party": "verifiedFirstParty",
    "verified_authoritative": "verifiedAuthoritative",
    "supported_third_party": "supportedThirdParty",
    "inferred": "inferred",
    "needs_verification": "needsVerification",
    "not_applicable": "notApplicable",
}
MIME_BY_SUFFIX = {
    ".avif": "image/avif",
    ".webp": "image/webp",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
}
ROOT_MARKDOWN = {
    "README.md",
    "00_knowledge_tree.md",
    "00_crawl_coverage_report.md",
    "00_web_intelligence_report.md",
    "00_source_index.md",
}
PUNCTUATION = string.punctuation + "，。！？；：“”‘’（）【】《》…—·"
ID_PATTERN = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{0,79}$")
DISPLAY_BRANCH_IDS = set(DISPLAY_BRANCH.values())
CONTENT_AVAILABILITY = {"complete", "limited_evidence", "needs_verification"}
ASSET_TYPES = {
    "brand_identity",
    "product_ui",
    "product_diagram",
    "case_photo",
    "team_photo",
    "environment_photo",
    "certificate_badge",
    "document_figure",
    "other",
}
DISPLAY_ROLES = {"hero", "inline", "badge"}
CUSTOMER_NARRATIVE_LEAKAGE = (
    (
        "task or collection process",
        re.compile(
            r"本轮|本次(?:采集|任务|构建|处理|检索|核验)|本包|本知识库|"
            r"抽取失败|采集失败|已核验|证据不足|未形成.{0,16}核验",
            re.I,
        ),
    ),
    (
        "customer or procurement advice",
        re.compile(
            r"(?:客户|采购方|读者|使用方|合作方).{0,12}(?:应|需|建议|可将)|"
            r"仍应|采购(?:或|与)?合规审查|合规审查|正式尽调|不能仅凭|"
            r"不宜(?:直接)?(?:转换|认定|视为)?|不能外推",
            re.I,
        ),
    ),
    (
        "company-claim interpretation or model reasoning",
        re.compile(
            r"这些内容属于企业自我定义|企业自我定义|对客户而言|"
            r"可将其落实为|说明组织意图与品牌取向",
            re.I,
        ),
    ),
)
MAX_PUBLIC_SOURCE_URL_CHARACTERS = 4000
MAX_UNCOMPRESSED_BYTES = 220 * 1024 * 1024
MAX_DOCUMENT_BYTES = 8 * 1024 * 1024
MAX_COMPRESSION_RATIO = 200
ALLOWED_EXTENSIONS = {
    ".avif",
    ".csv",
    ".doc",
    ".docx",
    ".gif",
    ".jpeg",
    ".jpg",
    ".json",
    ".md",
    ".pdf",
    ".png",
    ".ppt",
    ".pptx",
    ".sha256",
    ".webp",
    ".xls",
    ".xlsx",
}


def fail(message: str) -> None:
    raise ValueError(message)


def normalized_path(raw: str) -> str:
    if "\x00" in raw or "\\" in raw or raw.startswith("/") or re.match(r"^[A-Za-z]:", raw):
        fail(f"unsafe ZIP path: {raw!r}")
    path = PurePosixPath(raw)
    if ".." in path.parts:
        fail(f"path traversal in ZIP entry: {raw!r}")
    return str(path)


def public_http_url(raw: object) -> bool:
    if (
        not isinstance(raw, str)
        or len(raw) > MAX_PUBLIC_SOURCE_URL_CHARACTERS
    ):
        return False
    try:
        parsed = urlsplit(raw)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            return False
        if parsed.username or parsed.password:
            return False
        hostname = parsed.hostname.lower().rstrip(".")
        if hostname == "localhost" or hostname.endswith(".localhost"):
            return False
        try:
            address = ipaddress.ip_address(hostname)
        except ValueError:
            return True
        return not (
            address.is_private
            or address.is_loopback
            or address.is_link_local
            or address.is_multicast
            or address.is_reserved
            or address.is_unspecified
        )
    except (TypeError, ValueError):
        return False


def strip_wrapper(paths: list[str]) -> tuple[str, list[str]]:
    roots = {path.split("/", 1)[0] for path in paths if path}
    wrapper = next(iter(roots)) if len(roots) == 1 and any("/" in path for path in paths) else ""
    return wrapper, [
        path[len(wrapper) + 1 :] if wrapper and path.startswith(wrapper + "/") else path
        for path in paths
    ]


def meaningful_count(text: str) -> int:
    return len("".join(ch for ch in text if not ch.isspace() and ch not in PUNCTUATION))


def strip_frontmatter(markdown: str) -> str:
    return re.sub(r"^\ufeff?---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)", "", markdown, count=1)


def narrative_text(markdown: str) -> str:
    lines = strip_frontmatter(markdown).splitlines()
    retained: list[str] = []
    excluded_depth: int | None = None
    index = 0
    excluded_heading = re.compile(
        r"(?:原始|证据|引用|参考)?来源|素材清单|展示素材|机器清单|证据状态|状态头|sources?|references?|asset inventory",
        re.I,
    )
    while index < len(lines):
        line = lines[index]
        heading = re.match(r"^(#{1,6})\s+(.+?)\s*$", line)
        if heading:
            depth = len(heading.group(1))
            if excluded_depth is not None and depth <= excluded_depth:
                excluded_depth = None
            if excluded_heading.search(heading.group(2)):
                excluded_depth = depth
            index += 1
            continue
        if excluded_depth is not None:
            index += 1
            continue
        if re.match(r"^\s*>\s*.*(?:状态|status)\s*[:：].*(?:来源|source)\s*[:：]", line, re.I):
            index += 1
            continue
        if re.match(r"^\s*[-*]\s+(?:node_id|path|evidence_status|source_ids|status)\s*[:：]", line, re.I):
            index += 1
            continue
        if line.strip().startswith("|"):
            table: list[str] = []
            while index < len(lines) and lines[index].strip().startswith("|"):
                table.append(lines[index])
                index += 1
            table_text = "\n".join(table)
            if not re.search(r"来源|出处|证据链接|source|url", table_text, re.I):
                retained.append(table_text)
            continue
        retained.append(line)
        index += 1
    text = "\n".join(retained)
    text = re.sub(r"<!--[\s\S]*?-->", "", text)
    text = re.sub(r"!\[[^\]]*]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]+)]\([^)]*\)", r"\1", text)
    text = re.sub(r"https?://[^\s)>\]]+", "", text, flags=re.I)
    return re.sub(r"<[^>]+>", "", text)


def evidence_count(markdown: str) -> int:
    text = strip_frontmatter(markdown)
    text = re.sub(r"<!--[\s\S]*?-->", "", text)
    text = re.sub(r"!\[[^\]]*]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]+)]\([^)]*\)", r"\1", text)
    text = re.sub(r"https?://[^\s)>\]]+", "", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"^#{1,6}\s+", "", text, flags=re.M)
    return meaningful_count(text)


def normalized_evidence_hash(markdown: str) -> str:
    text = strip_frontmatter(markdown)
    text = re.sub(r"<!--[\s\S]*?-->", "", text)
    text = re.sub(r"!\[[^\]]*]\([^)]*\)", "", text)
    text = re.sub(r"\[([^\]]+)]\([^)]*\)", r"\1", text)
    text = re.sub(r"https?://[^\s)>\]]+", "", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = unicodedata.normalize("NFKC", text).lower()
    text = "".join(
        ch for ch in text if not ch.isspace() and ch not in PUNCTUATION
    )
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def reported_saved_image_count(markdown: str) -> int | None:
    patterns = (
        r"(?:成功下载|已下载|已保存|保存并打包|downloaded|packaged|saved)[^\n|]{0,30}(?:图片|图像|images?|assets?)[^\d]{0,12}([\d,]+)",
        r"(?:图片|图像|images?|assets?)[^\n|]{0,30}(?:成功下载|已下载|已保存|保存并打包|downloaded|packaged|saved)[^\d]{0,12}([\d,]+)",
        r"第一方图片资源[^\d\n|]{0,20}([\d,]+)",
    )
    for pattern in patterns:
        match = re.search(pattern, markdown, re.I)
        if match:
            return int(match.group(1).replace(",", ""))
    return None


def image_is_valid(data: bytes, mime: str) -> bool:
    if mime == "image/png":
        return (
            len(data) >= 24
            and data[:8] == b"\x89PNG\r\n\x1a\n"
            and data[12:16] == b"IHDR"
            and int.from_bytes(data[16:20], "big") > 0
            and int.from_bytes(data[20:24], "big") > 0
        )
    if mime == "image/jpeg":
        return len(data) >= 4 and data[:2] == b"\xff\xd8" and data[2] == 0xFF and data[-2:] == b"\xff\xd9"
    if mime == "image/gif":
        return len(data) >= 10 and data[:6] in (b"GIF87a", b"GIF89a") and data[6:8] != b"\0\0" and data[8:10] != b"\0\0"
    if mime == "image/webp":
        return len(data) >= 16 and data[:4] == b"RIFF" and data[8:12] == b"WEBP" and int.from_bytes(data[4:8], "little") + 8 <= len(data)
    if mime == "image/avif":
        return len(data) >= 16 and data[4:8] == b"ftyp" and data[8:12] in (b"avif", b"avis")
    return False


def structural_image_dimensions(data: bytes, mime: str) -> tuple[int, int] | None:
    if mime == "image/png" and len(data) >= 24:
        return (
            int.from_bytes(data[16:20], "big"),
            int.from_bytes(data[20:24], "big"),
        )
    if mime == "image/gif" and len(data) >= 10:
        return (
            int.from_bytes(data[6:8], "little"),
            int.from_bytes(data[8:10], "little"),
        )
    if mime == "image/jpeg" and len(data) >= 4:
        offset = 2
        while offset + 9 < len(data):
            if data[offset] != 0xFF:
                offset += 1
                continue
            marker = data[offset + 1]
            if marker in {0xD8, 0xD9}:
                offset += 2
                continue
            segment_length = int.from_bytes(data[offset + 2 : offset + 4], "big")
            if segment_length < 2 or offset + 2 + segment_length > len(data):
                break
            if marker in {
                0xC0,
                0xC1,
                0xC2,
                0xC3,
                0xC5,
                0xC6,
                0xC7,
                0xC9,
                0xCA,
                0xCB,
                0xCD,
                0xCE,
                0xCF,
            }:
                return (
                    int.from_bytes(data[offset + 7 : offset + 9], "big"),
                    int.from_bytes(data[offset + 5 : offset + 7], "big"),
                )
            offset += 2 + segment_length
        return None
    if mime == "image/webp" and len(data) >= 30:
        chunk = data[12:16]
        if chunk == b"VP8X":
            return (
                int.from_bytes(data[24:27], "little") + 1,
                int.from_bytes(data[27:30], "little") + 1,
            )
        if chunk == b"VP8L" and data[20] == 0x2F and len(data) >= 25:
            packed = int.from_bytes(data[21:25], "little")
            return ((packed & 0x3FFF) + 1, ((packed >> 14) & 0x3FFF) + 1)
        if chunk == b"VP8 " and data[23:26] == b"\x9d\x01\x2a":
            return (
                int.from_bytes(data[26:28], "little") & 0x3FFF,
                int.from_bytes(data[28:30], "little") & 0x3FFF,
            )
        return None
    if mime == "image/avif":
        offset = data.find(b"ispe")
        if offset >= 4 and offset + 16 <= len(data):
            box_size = int.from_bytes(data[offset - 4 : offset], "big")
            if box_size >= 20 and offset - 4 + box_size <= len(data):
                return (
                    int.from_bytes(data[offset + 8 : offset + 12], "big"),
                    int.from_bytes(data[offset + 12 : offset + 16], "big"),
                )
    return None


def decoded_image_dimensions(data: bytes, mime: str) -> tuple[int, int] | None:
    dimensions = structural_image_dimensions(data, mime)
    if not image_is_valid(data, mime) or not dimensions or 0 in dimensions:
        return None
    if dimensions[0] * dimensions[1] > 40_000_000:
        return None
    if Image is None:
        return dimensions
    expected_format = {
        "image/png": "PNG",
        "image/jpeg": "JPEG",
        "image/gif": "GIF",
        "image/webp": "WEBP",
        "image/avif": "AVIF",
    }[mime]
    try:
        with Image.open(io.BytesIO(data)) as image:
            if image.format != expected_format or image.size != dimensions:
                return None
            image.verify()
        with Image.open(io.BytesIO(data)) as image:
            image.load()
    except (OSError, SyntaxError, ValueError, UnidentifiedImageError):
        # Pillow builds without an AVIF plugin cannot decode a valid AVIF.
        # The service performs a mandatory native libvips decode afterwards.
        return dimensions if mime == "image/avif" else None
    return dimensions


def require_exact_keys(value: object, required: set[str], optional: set[str] = set()) -> None:
    if not isinstance(value, dict):
        fail("expected a JSON object")
    keys = set(value)
    if not required <= keys or keys - required - optional:
        fail(f"invalid object keys: required={sorted(required)}, actual={sorted(keys)}")


def v2_overview_minimum(evidence_characters: int, branch_id: str) -> int:
    if evidence_characters == 0:
        return 40
    target_floor = 3000 if branch_id == "products-services" else 1500
    return min(target_floor, max(120, (evidence_characters + 3) // 4))


def v2_leaf_minimum(evidence_characters: int) -> int:
    if evidence_characters == 0:
        return 40
    return min(200, max(60, (evidence_characters + 4) // 5))


def validate(zip_path: str) -> dict[str, int]:
    if Path(zip_path).stat().st_size > 100 * 1024 * 1024:
        fail("ZIP exceeds the compressed size limit")
    with zipfile.ZipFile(zip_path) as archive:
        infos = [info for info in archive.infolist() if not info.is_dir()]
        if len(infos) > 150:
            fail("ZIP contains more than 150 files")
        if sum(info.file_size for info in infos) > MAX_UNCOMPRESSED_BYTES:
            fail("ZIP exceeds the uncompressed safety limit")
        if any(info.flag_bits & 0x1 for info in infos):
            fail("encrypted ZIP entries are not allowed")
        if any(
            info.file_size > 1024 * 1024
            and info.compress_size > 0
            and info.file_size / info.compress_size > MAX_COMPRESSION_RATIO
            for info in infos
        ):
            fail("ZIP entry exceeds the compression-ratio safety limit")
        if any(
            ((info.external_attr >> 16) & 0o170000) == 0o120000
            for info in infos
        ):
            fail("symbolic links are not allowed")
        raw_paths = [normalized_path(info.filename) for info in infos]
        wrapper, paths = strip_wrapper(raw_paths)
        canonical_paths = [
            unicodedata.normalize("NFKC", path).casefold() for path in paths
        ]
        if len(canonical_paths) != len(set(canonical_paths)):
            fail("duplicate ZIP paths")
        info_by_path = dict(zip(paths, infos))
        for entry_path, info in info_by_path.items():
            suffix = PurePosixPath(entry_path).suffix.lower()
            if suffix not in ALLOWED_EXTENSIONS:
                fail(f"unsupported file type: {entry_path}")
            if suffix not in MIME_BY_SUFFIX and info.file_size > MAX_DOCUMENT_BYTES:
                fail(f"oversized document: {entry_path}")

        def read(entry_path: str, limit: int) -> bytes:
            info = info_by_path.get(entry_path)
            if info is None:
                fail(f"missing file: {entry_path}")
            if info.file_size > limit:
                fail(f"oversized file: {entry_path}")
            data = archive.read(info)
            if len(data) != info.file_size:
                fail(f"truncated file: {entry_path}")
            return data

        required = ROOT_MARKDOWN | {"00_completeness.json", "00_package_manifest.json"}
        missing = required - set(paths)
        if missing:
            fail(f"missing required root files: {sorted(missing)}")
        if any(path.lower().endswith((".html", ".htm")) for path in paths):
            fail("per-page HTML is forbidden")

        markdown = {
            path: read(path, 2 * 1024 * 1024).decode("utf-8")
            for path in paths
            if path.lower().endswith(".md")
        }
        completeness = json.loads(read("00_completeness.json", 64 * 1024))
        require_exact_keys(completeness, {"counts", "acquisition", "gaps", "evaluatedAt"})
        require_exact_keys(
            completeness["counts"],
            {
                "totalLeaves",
                "verifiedFirstParty",
                "verifiedAuthoritative",
                "supportedThirdParty",
                "inferred",
                "needsVerification",
                "notApplicable",
            },
        )
        if not all(
            type(completeness["counts"][key]) is int
            and completeness["counts"][key] >= 0
            for key in completeness["counts"]
        ):
            fail("completeness counts must be non-negative integers")
        require_exact_keys(completeness["acquisition"], set(), {"officialPages", "images", "documents", "webQueries"})
        for value in completeness["acquisition"].values():
            require_exact_keys(value, {"completed", "total"})
            if not all(isinstance(value[key], int) and value[key] >= 0 for key in ("completed", "total")) or value["completed"] > value["total"]:
                fail("invalid acquisition count")

        package_bytes = read("00_package_manifest.json", 512 * 1024)
        package = json.loads(package_bytes)
        schema_version = package.get("schemaVersion")
        required_package_keys = {"schemaVersion", "profile", "documents", "assets", "counts", "imageSelection"}
        if schema_version == 2:
            required_package_keys.add("branchEvidence")
        require_exact_keys(package, required_package_keys)
        if schema_version not in (1, 2) or package["profile"] != "website-lead-v1":
            fail("invalid package manifest version/profile")
        require_exact_keys(package["counts"], {"totalFiles", "customerVisibleCharacters", "evidenceCharacters", "packagedImages"})
        if schema_version == 1:
            require_exact_keys(package["imageSelection"], {"eligibleFirstPartyImages"}, {"shortfallReason"})
        else:
            require_exact_keys(
                package["imageSelection"],
                {
                    "status",
                    "discoveredCandidateImages",
                    "inspectedCandidateImages",
                    "eligibleFirstPartyImages",
                    "rejectedCandidateImages",
                    "scannedSourcePages",
                    "discoveryMethods",
                    "candidates",
                    "productFamilies",
                },
                {"shortfallReason"},
            )
        if not all(
            type(package["counts"][key]) is int and package["counts"][key] >= 0
            for key in package["counts"]
        ) or type(package["imageSelection"]["eligibleFirstPartyImages"]) is not int:
            fail("package counts must be non-negative integers")
        if package["counts"]["totalFiles"] != len(paths):
            fail("manifest totalFiles does not match ZIP")

        documents = package["documents"]
        assets = package["assets"]
        if not isinstance(documents, list) or not isinstance(assets, list):
            fail("documents/assets must be arrays")
        for doc in documents:
            if not isinstance(doc, dict):
                fail("document record must be an object")
            require_exact_keys(
                doc,
                {"id", "path", "kind", "title", "customerVisible"},
                {
                    "branchId",
                    "order",
                    "evidenceStatus",
                    "sourceIds",
                    "assetIds",
                    *(
                        {"evidenceCharacters", "dynamicMinimumCharacters"}
                        if schema_version == 2
                        else set()
                    ),
                    *(
                        {"evidenceDocumentIds", "productFamilyIds"}
                        if schema_version == 2
                        else set()
                    ),
                },
            )
            if (
                not all(
                    isinstance(doc[key], str) and doc[key]
                    for key in ("id", "path", "kind", "title")
                )
                or not ID_PATTERN.fullmatch(doc["id"])
                or not isinstance(doc["customerVisible"], bool)
            ):
                fail("invalid document field type")
            if "order" in doc and (
                type(doc["order"]) is not int or doc["order"] < 0
            ):
                fail("invalid document order")
            if "sourceIds" in doc and (
                not isinstance(doc["sourceIds"], list)
                or not doc["sourceIds"]
                or not all(
                    isinstance(value, str) and ID_PATTERN.fullmatch(value)
                    for value in doc["sourceIds"]
                )
            ):
                fail("invalid document sourceIds")
            if "assetIds" in doc and (
                not isinstance(doc["assetIds"], list)
                or not all(
                    isinstance(value, str) and ID_PATTERN.fullmatch(value)
                    for value in doc["assetIds"]
                )
            ):
                fail("invalid document assetIds")
        for asset in assets:
            if not isinstance(asset, dict):
                fail("asset record must be an object")
            asset_required_keys = {
                "id", "path", "sha256", "mimeType", "bytes", "width", "height",
                "caption", "branchId", "documentIds", "sourcePageUrl", "ownership",
            }
            if schema_version == 2:
                asset_required_keys |= {"assetType", "displayRole"}
            require_exact_keys(
                asset,
                asset_required_keys,
                {"alt", "sourceAssetUrl"},
            )
            if (
                not all(
                    isinstance(asset[key], str) and asset[key]
                    for key in (
                        "id",
                        "path",
                        "sha256",
                        "mimeType",
                        "caption",
                        "ownership",
                    )
                )
                or not ID_PATTERN.fullmatch(asset["id"])
                or not re.fullmatch(r"[a-f0-9]{64}", asset["sha256"])
                or type(asset["bytes"]) is not int
                or asset["bytes"] <= 0
            ):
                fail("invalid asset field type")
            if not all(
                type(asset[key]) is int and asset[key] > 0
                for key in ("width", "height")
            ):
                fail("asset width and height must be positive integers")
            if schema_version == 2 and (
                asset.get("assetType") not in ASSET_TYPES
                or asset.get("displayRole") not in DISPLAY_ROLES
            ):
                fail("assetType or displayRole is invalid")
            if (
                asset["branchId"] not in DISPLAY_BRANCH
                or not public_http_url(asset["sourcePageUrl"])
                or (
                    "sourceAssetUrl" in asset
                    and not public_http_url(asset["sourceAssetUrl"])
                )
                or not isinstance(asset["documentIds"], list)
                or not asset["documentIds"]
                or not all(
                    isinstance(value, str) and ID_PATTERN.fullmatch(value)
                    for value in asset["documentIds"]
                )
            ):
                fail("asset branch/source-page metadata is invalid")
        document_ids = [doc.get("id") for doc in documents]
        document_paths = [normalized_path(doc.get("path", "")) for doc in documents]
        canonical_document_paths = [
            unicodedata.normalize("NFKC", path).casefold()
            for path in document_paths
        ]
        if len(document_ids) != len(set(document_ids)) or len(
            canonical_document_paths
        ) != len(set(canonical_document_paths)):
            fail("duplicate document IDs or paths")
        if set(document_paths) != set(markdown):
            fail("manifest must inventory every Markdown document")
        docs_by_id = dict(zip(document_ids, documents))
        evidence_docs_by_id = {
            doc["id"]: doc
            for doc in documents
            if doc.get("kind") == "evidence" and doc.get("customerVisible") is False
        }
        evidence_characters_by_id = {
            doc_id: evidence_count(markdown[doc["path"]])
            for doc_id, doc in evidence_docs_by_id.items()
        }
        evidence_hashes = [
            normalized_evidence_hash(markdown[doc["path"]])
            for doc in evidence_docs_by_id.values()
        ]
        if len(evidence_hashes) != len(set(evidence_hashes)):
            fail("evidence documents contain duplicate normalized content")

        content_paths = {
            path for path in markdown if any(path.startswith(prefix) for prefix in CONTENT_PREFIXES)
        }
        visible_docs = [doc for doc in documents if doc.get("customerVisible") is True]
        if {doc["path"] for doc in visible_docs} != content_paths:
            fail("customer-visible documents must exactly match 01–08 leaves")
        leaf_docs = [doc for doc in visible_docs if doc.get("kind") == "leaf"]
        overview_docs = [doc for doc in visible_docs if doc.get("kind") == "overview"]
        counted_leaf_paths = (
            {doc["path"] for doc in leaf_docs}
            if schema_version == 2
            else content_paths
        )
        if not 40 <= len(counted_leaf_paths) <= 56:
            fail("content leaf count must be 40–56")
        for prefix in CONTENT_PREFIXES:
            if not any(path.startswith(prefix) for path in counted_leaf_paths):
                fail(f"missing content leaf under {prefix}")
        if schema_version == 2:
            referenced_evidence_ids: set[str] = set()
            for doc in visible_docs:
                evidence_document_ids = doc.get("evidenceDocumentIds")
                if (
                    not isinstance(evidence_document_ids, list)
                    or len(evidence_document_ids) != len(set(evidence_document_ids))
                    or any(
                        evidence_document_id not in evidence_docs_by_id
                        or evidence_docs_by_id[evidence_document_id].get("branchId")
                        != doc.get("branchId")
                        or not set(doc.get("sourceIds", [])).intersection(
                            evidence_docs_by_id[evidence_document_id].get(
                                "sourceIds", []
                            )
                        )
                        for evidence_document_id in evidence_document_ids
                    )
                ):
                    fail(f"invalid evidenceDocumentIds: {doc['path']}")
                actual_evidence_characters = sum(
                    evidence_characters_by_id[evidence_document_id]
                    for evidence_document_id in evidence_document_ids
                )
                if doc.get("evidenceCharacters") != actual_evidence_characters:
                    fail(
                        f"evidenceCharacters does not match linked evidence documents: {doc['path']}"
                    )
                referenced_evidence_ids.update(evidence_document_ids)
            if set(evidence_docs_by_id) != referenced_evidence_ids:
                fail("evidence documents must all be linked to customer-visible documents")

        status_counts: Counter[str] = Counter()
        overview_counts: Counter[str] = Counter()
        narrative_total = 0
        fingerprints: defaultdict[str, list[str]] = defaultdict(list)
        template_fingerprints: defaultdict[str, list[str]] = defaultdict(list)
        status_re = re.compile(r"(?:证据\s*)?(?:状态|status)\s*[:：]\s*(?:\*\*|__)?\s*`?\s*(" + "|".join(STATUSES) + r")\b", re.I)
        for doc in visible_docs:
            branch = doc.get("branchId")
            if branch not in DISPLAY_BRANCH or doc["path"].split("/", 1)[0] != branch:
                fail(f"invalid branch metadata: {doc['path']}")
            if doc.get("kind") not in ("overview", "leaf"):
                fail(f"invalid visible document kind: {doc['path']}")
            status = doc.get("evidenceStatus")
            match = status_re.search(markdown[doc["path"]][:1600])
            if status not in STATUSES or not match or match.group(1).lower() != status:
                fail(f"status mismatch: {doc['path']}")
            if schema_version == 1 or doc["kind"] == "leaf":
                status_counts[status] += 1
            if doc["kind"] == "overview":
                overview_counts[DISPLAY_BRANCH[branch]] += 1
            if status not in ("needs_verification", "not_applicable") and not doc.get("sourceIds"):
                fail(f"evidence-bearing document has no source IDs: {doc['path']}")
            text = narrative_text(markdown[doc["path"]])
            count = meaningful_count(text)
            narrative_total += count
            if schema_version == 1:
                if status not in ("needs_verification", "not_applicable") and count < 120:
                    fail(f"evidence-bearing document has fewer than 120 characters: {doc['path']}")
            elif doc["kind"] == "leaf":
                evidence_characters = doc.get("evidenceCharacters")
                declared_minimum = doc.get("dynamicMinimumCharacters")
                if (
                    type(evidence_characters) is not int
                    or evidence_characters < 0
                    or type(declared_minimum) is not int
                    or declared_minimum != v2_leaf_minimum(evidence_characters)
                ):
                    fail(f"invalid evidence-adaptive leaf minimum: {doc['path']}")
                if status not in ("needs_verification", "not_applicable") and evidence_characters == 0:
                    fail(f"evidence-bearing leaf declares no supporting evidence: {doc['path']}")
                if count < declared_minimum:
                    fail(f"leaf is thinner than its evidence-adaptive minimum: {doc['path']}")
            if re.search(r"第一方(?:原始)?快照|第一方页面摘录|原始快照|页面摘录", text, re.I):
                fail(f"raw snapshot/page excerpt used as formal copy: {doc['path']}")
            normalized_text = unicodedata.normalize("NFKC", text)
            for label, pattern in CUSTOMER_NARRATIVE_LEAKAGE:
                if pattern.search(normalized_text):
                    fail(
                        f"customer-facing audit language or internal reasoning "
                        f"({label}): {doc['path']}"
                    )
            if count >= 120:
                fingerprints[re.sub(r"\d+", "#", re.sub(r"\s+", "", text))].append(doc["path"])
            for paragraph in re.split(r"\n\s*\n", text):
                fingerprint = re.sub(r"\d+", "#", re.sub(r"\s+", "", paragraph)).strip()
                if meaningful_count(fingerprint) >= 120:
                    template_fingerprints[fingerprint].append(doc["path"])
        if set(overview_counts) != set(DISPLAY_BRANCH.values()) or any(value != 1 for value in overview_counts.values()):
            fail("each display branch must have exactly one overview")
        if schema_version == 2:
            if len(overview_docs) != 7:
                fail("schema v2 requires seven overviews in addition to true leaves")
            branch_evidence = package.get("branchEvidence")
            if not isinstance(branch_evidence, list) or len(branch_evidence) != 7:
                fail("branchEvidence must contain seven records")
            evidence_by_branch: dict[str, dict] = {}
            overview_by_id = {doc["id"]: doc for doc in overview_docs}
            for entry in branch_evidence:
                require_exact_keys(
                    entry,
                    {
                        "branchId",
                        "overviewDocumentId",
                        "contentStatus",
                        "deduplicatedEvidenceCharacters",
                        "dynamicOverviewMinimum",
                        "checkedSourceCount",
                    },
                )
                branch_id = entry.get("branchId")
                evidence_characters = entry.get("deduplicatedEvidenceCharacters")
                declared_minimum = entry.get("dynamicOverviewMinimum")
                overview = overview_by_id.get(entry.get("overviewDocumentId"))
                if (
                    branch_id not in DISPLAY_BRANCH_IDS
                    or branch_id in evidence_by_branch
                    or entry.get("contentStatus") not in CONTENT_AVAILABILITY
                    or type(evidence_characters) is not int
                    or evidence_characters < 0
                    or type(entry.get("checkedSourceCount")) is not int
                    or entry["checkedSourceCount"] < 1
                    or not overview
                    or DISPLAY_BRANCH.get(overview.get("branchId")) != branch_id
                ):
                    fail("invalid branchEvidence record")
                branch_evidence_ids = {
                    evidence_document_id
                    for doc in visible_docs
                    if DISPLAY_BRANCH.get(doc.get("branchId")) == branch_id
                    for evidence_document_id in doc.get("evidenceDocumentIds", [])
                }
                actual_branch_evidence_characters = sum(
                    evidence_characters_by_id[evidence_document_id]
                    for evidence_document_id in branch_evidence_ids
                )
                if evidence_characters != actual_branch_evidence_characters:
                    fail(f"branch evidence count does not match linked evidence: {branch_id}")
                expected_minimum = v2_overview_minimum(
                    actual_branch_evidence_characters, branch_id
                )
                if declared_minimum != expected_minimum:
                    fail(f"invalid evidence-adaptive overview minimum: {branch_id}")
                if overview.get("dynamicMinimumCharacters") != expected_minimum:
                    fail(
                        f"overview document dynamic minimum does not match branch evidence: {branch_id}"
                    )
                if entry["contentStatus"] == "needs_verification" and evidence_characters != 0:
                    fail(f"available evidence discarded as needs_verification: {branch_id}")
                if entry["contentStatus"] != "needs_verification" and evidence_characters == 0:
                    fail(f"supported branch declares no evidence: {branch_id}")
                overview_count = meaningful_count(narrative_text(markdown[overview["path"]]))
                if overview_count < expected_minimum:
                    fail(f"overview is thinner than its evidence-adaptive minimum: {branch_id}")
                evidence_by_branch[branch_id] = entry
            if set(evidence_by_branch) != DISPLAY_BRANCH_IDS:
                fail("branchEvidence does not cover every display branch")
        if any(len(group) >= 3 for group in fingerprints.values()):
            fail("same formal narrative repeated across at least three documents")
        if any(len(group) >= 3 for group in template_fingerprints.values()):
            fail("same formal template paragraph repeated across at least three documents")
        if schema_version == 1 and not 8000 <= narrative_total <= 18000:
            fail("customer-visible narrative must contain 8,000–18,000 characters")
        if schema_version == 2 and narrative_total > 40000:
            fail("customer-visible narrative exceeds 40,000 characters")
        if package["counts"]["customerVisibleCharacters"] != narrative_total:
            fail("customerVisibleCharacters mismatch")
        if completeness["counts"]["totalLeaves"] != len(counted_leaf_paths):
            fail("00_completeness totalLeaves mismatch")
        if sum(completeness["counts"][key] for key in STATUS_KEYS.values()) != len(counted_leaf_paths):
            fail("00_completeness status total mismatch")
        for status, key in STATUS_KEYS.items():
            if completeness["counts"][key] != status_counts[status]:
                fail(f"00_completeness {key} mismatch")

        evidence_total = sum(
            evidence_count(markdown[doc["path"]])
            for doc in documents
            if doc.get("customerVisible") is False
        )
        if evidence_total > 300_000:
            fail("packaged evidence exceeds 300,000 characters")
        if package["counts"]["evidenceCharacters"] != evidence_total:
            fail("evidenceCharacters mismatch")

        image_paths = {path for path in paths if PurePosixPath(path).suffix.lower() in set(MIME_BY_SUFFIX) | {".svg"}}
        if any(PurePosixPath(path).suffix.lower() == ".svg" for path in image_paths):
            fail("SVG must be rasterized before packaging")
        if len(image_paths) > 48:
            fail("more than 48 packaged images")
        reported_images = reported_saved_image_count(markdown["00_crawl_coverage_report.md"])
        if reported_images is not None and reported_images != len(image_paths):
            fail("crawl report saved-image count does not match packaged images")
        if schema_version == 2:
            discovered_match = re.search(
                r"(?:发现|discovered)[^\n|]{0,30}(?:图片|图像|images?|assets?)[^\d]{0,12}([\d,]+)",
                markdown["00_crawl_coverage_report.md"],
                re.I,
            )
            if (
                not discovered_match
                or int(discovered_match.group(1).replace(",", ""))
                != package["imageSelection"]["discoveredCandidateImages"]
            ):
                fail("crawl report discovered-image count does not match candidate ledger")
        asset_ids = [asset.get("id") for asset in assets]
        asset_paths = [normalized_path(asset.get("path", "")) for asset in assets]
        canonical_asset_paths = [
            unicodedata.normalize("NFKC", path).casefold()
            for path in asset_paths
        ]
        if len(asset_ids) != len(set(asset_ids)) or len(
            canonical_asset_paths
        ) != len(set(canonical_asset_paths)):
            fail("duplicate asset IDs or paths")
        if set(asset_paths) != image_paths:
            fail("manifest must inventory every packaged image")
        assets_by_id = dict(zip(asset_ids, assets))
        hashes: set[str] = set()
        for asset in assets:
            suffix = PurePosixPath(asset["path"]).suffix.lower()
            mime = MIME_BY_SUFFIX.get(suffix)
            data = read(asset["path"], 4 * 1024 * 1024)
            digest = hashlib.sha256(data).hexdigest()
            dimensions = decoded_image_dimensions(data, mime or "")
            if mime != asset.get("mimeType") or not dimensions:
                fail(f"invalid or undecodable image: {asset['path']}")
            if (
                asset.get("width") != dimensions[0]
                or asset.get("height") != dimensions[1]
            ):
                fail(f"image dimensions mismatch: {asset['path']}")
            if schema_version == 2:
                asset_type = asset.get("assetType")
                display_role = asset.get("displayRole")
                badge_type = asset_type in {"brand_identity", "certificate_badge"}
                if (
                    (display_role == "badge" and not badge_type)
                    or (
                        asset_type == "certificate_badge"
                        and display_role != "badge"
                    )
                ):
                    fail(
                        f"invalid assetType/displayRole combination: {asset['path']}"
                    )
                if display_role == "hero":
                    minimum_met = dimensions[0] >= 1200 and dimensions[1] >= 600
                elif display_role == "badge":
                    minimum_met = dimensions[0] >= 256 and dimensions[1] >= 256
                else:
                    minimum_met = dimensions[0] >= 800 and dimensions[1] >= 450
                if not minimum_met:
                    fail(
                        f"{display_role} image quality minimum not met: "
                        f"{asset['path']}"
                    )
            if asset.get("bytes") != len(data) or asset.get("sha256") != digest:
                fail(f"image bytes/SHA-256 mismatch: {asset['path']}")
            if digest in hashes:
                fail("packaged images are not deduplicated")
            hashes.add(digest)
            if asset.get("ownership") != "first_party":
                fail("packaged image is not first-party")
            if not asset.get("documentIds"):
                fail("asset has no linked customer document")
            for document_id in asset["documentIds"]:
                doc = docs_by_id.get(document_id)
                if not doc or not doc.get("customerVisible") or asset["id"] not in doc.get("assetIds", []):
                    fail(f"asset/document link mismatch: {asset['id']}")
        for doc in documents:
            for asset_id in doc.get("assetIds", []):
                if asset_id not in assets_by_id or doc["id"] not in assets_by_id[asset_id].get("documentIds", []):
                    fail(f"document/asset link mismatch: {doc['id']}")

        image_count = len(image_paths)
        if package["counts"]["packagedImages"] != image_count:
            fail("packagedImages mismatch")
        image_acquisition = completeness["acquisition"].get("images")
        if not image_acquisition or image_acquisition["completed"] != image_count:
            fail("acquisition.images.completed mismatch")
        eligible = package["imageSelection"]["eligibleFirstPartyImages"]
        if schema_version == 1:
            if eligible > image_acquisition["total"]:
                fail("eligible first-party image count exceeds discovered total")
            if eligible >= 36 and not 36 <= image_count <= min(48, eligible):
                fail("36–48 images required when enough eligible first-party images exist")
            if eligible < 36 and (image_count != eligible or not package["imageSelection"].get("shortfallReason")):
                fail("all eligible images and a shortfall reason are required below 36")
        else:
            selection = package["imageSelection"]
            discovered = selection.get("discoveredCandidateImages")
            inspected = selection.get("inspectedCandidateImages")
            rejected = selection.get("rejectedCandidateImages")
            scanned_source_pages = selection.get("scannedSourcePages")
            methods = selection.get("discoveryMethods")
            candidates = selection.get("candidates")
            families = selection.get("productFamilies")
            if not isinstance(candidates, list):
                fail("image candidates must be an array")
            candidate_urls = [candidate.get("url") for candidate in candidates if isinstance(candidate, dict)]
            eligible_candidates = [
                candidate
                for candidate in candidates
                if isinstance(candidate, dict) and candidate.get("status") == "eligible"
            ]
            rejected_candidates = [
                candidate
                for candidate in candidates
                if isinstance(candidate, dict) and candidate.get("status") == "rejected"
            ]
            uninspected_candidates = [
                candidate
                for candidate in candidates
                if isinstance(candidate, dict) and candidate.get("status") == "uninspected"
            ]
            if (
                type(discovered) is not int
                or type(inspected) is not int
                or type(rejected) is not int
                or type(scanned_source_pages) is not int
                or scanned_source_pages < 1
                or discovered != len(candidates)
                or len(candidate_urls) != len(set(candidate_urls))
                or inspected != len(eligible_candidates) + len(rejected_candidates)
                or eligible != len(eligible_candidates)
                or rejected != len(rejected_candidates)
                or discovered != inspected + len(uninspected_candidates)
                or image_acquisition["total"] != discovered
            ):
                fail("image discovery funnel does not match acquisition totals")
            official_pages = completeness["acquisition"].get("officialPages")
            if (
                not isinstance(official_pages, dict)
                or scanned_source_pages != official_pages.get("completed")
            ):
                fail(
                    "image scan must cover every successfully parsed official page"
                )
            allowed_methods = {
                "img",
                "srcset_or_lazy",
                "picture",
                "css_background",
                "open_graph",
                "gallery",
                "official_document",
            }
            for candidate in candidates:
                require_exact_keys(
                    candidate,
                    {"url", "sourcePageUrl", "method", "status"},
                    {"assetId", "rejectionReason"},
                )
                if (
                    not public_http_url(candidate["url"])
                    or not public_http_url(candidate["sourcePageUrl"])
                    or candidate["method"] not in allowed_methods
                ):
                    fail("invalid image candidate URL or method")
                if candidate["status"] == "eligible":
                    asset = assets_by_id.get(candidate.get("assetId"))
                    if (
                        not asset
                        or asset.get("sourceAssetUrl") != candidate["url"]
                        or asset.get("sourcePageUrl") != candidate["sourcePageUrl"]
                    ):
                        fail("eligible image candidate does not match a packaged asset")
                elif candidate["status"] == "rejected":
                    if candidate.get("assetId") or not candidate.get("rejectionReason"):
                        fail("rejected image candidate is missing its rejection reason")
                elif candidate["status"] == "uninspected":
                    if candidate.get("assetId") or candidate.get("rejectionReason"):
                        fail("uninspected image candidate has an invalid resolution")
                else:
                    fail("invalid image candidate status")
            if any(
                not any(candidate.get("assetId") == asset_id for candidate in eligible_candidates)
                for asset_id in assets_by_id
            ):
                fail("packaged image is missing from the candidate ledger")
            if (
                not isinstance(methods, list)
                or set(methods) != allowed_methods
                or len(methods) != len(set(methods))
            ):
                fail("invalid image discovery methods")
            if image_count != min(48, eligible):
                fail("eligible first-party images were omitted from the package")
            status = selection.get("status")
            if status == "target_met":
                if (
                    uninspected_candidates
                    or selection.get("shortfallReason")
                    or not any(
                        asset.get("assetType") == "brand_identity"
                        for asset in assets
                    )
                ):
                    fail(
                        "complete image coverage requires inspected candidates, "
                        "brand imagery, and zero shortfall"
                    )
            elif status in {"source_limited", "budget_limited"}:
                if not selection.get("shortfallReason"):
                    fail("image shortfall must record a concrete reason")
                if status == "source_limited" and (
                    inspected != discovered
                ):
                    fail("source_limited requires every candidate to be inspected")
                if status == "budget_limited" and inspected >= discovered:
                    fail("budget_limited claimed without uninspected discovered candidates")
            else:
                fail("invalid image selection status")
            if not isinstance(families, list):
                fail("productFamilies must be an array")
            product_leaf_family_ids: set[str] = set()
            for doc in leaf_docs:
                if doc.get("branchId") != "03_products":
                    if "productFamilyIds" in doc:
                        fail(
                            "productFamilyIds are allowed only on 03_products leaves"
                        )
                    continue
                family_ids = doc.get("productFamilyIds")
                if (
                    not isinstance(family_ids, list)
                    or not family_ids
                    or len(family_ids) != len(set(family_ids))
                ):
                    fail("product leaves must declare unique productFamilyIds")
                product_leaf_family_ids.update(family_ids)
            family_ids = [family.get("id") for family in families if isinstance(family, dict)]
            if (
                not families
                or len(family_ids) != len(set(family_ids))
                or set(family_ids) != product_leaf_family_ids
            ):
                fail("product-family visual coverage does not match product leaf inventory")
            for family in families:
                require_exact_keys(
                    family,
                    {
                        "id",
                        "name",
                        "officialVisualFound",
                        "checkedSources",
                        "assetIds",
                    },
                    {"gapReason"},
                )
                family_asset_ids = family.get("assetIds")
                if (
                    not isinstance(family_asset_ids, list)
                    or type(family.get("checkedSources")) is not int
                    or family["checkedSources"] < 1
                ):
                    fail("product family assetIds must be an array")
                if family.get("officialVisualFound"):
                    if not family_asset_ids or any(
                        asset_id not in assets_by_id
                        or assets_by_id[asset_id].get("branchId") != "03_products"
                        or assets_by_id[asset_id].get("assetType")
                        not in {"product_ui", "product_diagram", "case_photo"}
                        for asset_id in family_asset_ids
                    ):
                        fail("product family official visual is not packaged")
                elif family_asset_ids or not family.get("gapReason"):
                    fail("product family without an official visual must record its gap")
        official_pages = completeness["acquisition"].get("officialPages")
        if official_pages and official_pages["completed"] > 120:
            fail("more than 120 successfully parsed official pages")
        documents_acquisition = completeness["acquisition"].get("documents")
        if documents_acquisition and documents_acquisition["completed"] > 22:
            fail("more than 22 parsed documents")
        web_queries = completeness["acquisition"].get("webQueries")
        if web_queries and (
            web_queries["completed"] > 12 or web_queries["total"] > 12
        ):
            fail("more than 12 public-web queries")
        packaged_documents = sum(
            PurePosixPath(path).suffix.lower()
            in {".pdf", ".ppt", ".pptx", ".doc", ".docx", ".xls", ".xlsx"}
            for path in paths
        )
        if packaged_documents > 22:
            fail("more than 22 packaged documents")

        return {
            "files": len(paths),
            "leaves": len(counted_leaf_paths),
            "customerVisibleCharacters": narrative_total,
            "evidenceCharacters": evidence_total,
            "images": image_count,
            "packageManifestSha256": hashlib.sha256(package_bytes).hexdigest(),
        }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("archive", help="final knowledge-base ZIP")
    args = parser.parse_args()
    try:
        result = validate(args.archive)
    except (OSError, ValueError, zipfile.BadZipFile, UnicodeDecodeError, json.JSONDecodeError) as error:
        print(f"INVALID: {error}", file=sys.stderr)
        return 1
    print("VALID " + json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
