# Output Format Reference

## Final ZIP Structure

The final deliverable uses this canonical hierarchy. Example filenames illustrate placement, not a requirement to create every listed file:

```
{company_name}_knowledge_base/
├── README.md
├── 00_knowledge_tree.md
├── 00_completeness.json
├── 00_package_manifest.json
├── 00_crawl_coverage_report.md
├── 00_web_intelligence_report.md
├── 00_source_index.md
├── 01_company_overview/
│   ├── profile.md                 # kind=overview for 企业身份
│   ├── history.md
│   ├── mission_vision.md
│   ├── certifications.md
│   └── images/
│       ├── logo.png
│       └── certification_*.jpg
├── 02_team/
│   ├── leadership.md
│   ├── technical_team.md
│   └── images/
│       └── team_*.jpg
├── 03_products/
│   ├── product_line_overview.md   # kind=overview for 产品/服务
│   └── {product_name}/
│       ├── overview.md
│       ├── specifications.md
│       ├── differentiators.md
│       ├── applications.md
│       ├── case_studies.md
│       ├── faq.md
│       └── images/
│           ├── product_main.jpg
│           └── application_*.jpg
├── 04_technology/
│   ├── core_technology.md
│   ├── rd_capabilities.md
│   └── patents.md
├── 05_manufacturing/
│   ├── production.md
│   ├── quality_control.md
│   ├── supply_chain.md
│   └── images/
│       └── factory_*.jpg
├── 06_industries/
│   └── {industry_name}/
│       ├── pain_points.md
│       ├── solutions.md
│       └── success_stories.md
├── 07_service/
│   ├── pre_sales.md
│   ├── training.md
│   ├── after_sales.md
│   └── logistics.md
├── 08_competitive_advantages/
│   ├── overview.md
│   └── competitor_comparison.md
├── 09_media_assets/
│   ├── asset_inventory.md
│   ├── product_images/
│   ├── application_photos/
│   ├── factory_photos/
│   └── videos/
│       └── video_links.md
└── 10_reference_assets/
    ├── reference_asset_inventory.md
    ├── images/
    └── documents/
```

The package must contain Markdown, the raw `00_completeness.json` manifest and selected source assets only. Do not create an interactive research page, HTML website, webpage preview or other web deliverable. Do not include per-page raw HTML or a second cleaned-text file for every URL.

Every Markdown file must appear exactly once in `00_package_manifest.json.documents`. Files under `01`–`08` are customer-visible formal documents and use kind `overview` or `leaf`; reports, indexes and evidence files are not customer-visible. Each of the seven display branches has exactly one `overview`; `04_technology` and `05_manufacturing` share the single “核心能力” display branch, so only one of those two directories declares its selected overview.

## Final Package Budgets

- 40–56 counted `kind: leaf` Markdown files across `01`–`08`, plus exactly seven `kind: overview` documents that are not counted as leaves.
- No more than 150 files in the entire ZIP, including root reports and assets.
- Keep the final ZIP at or below 220 MB uncompressed, every non-image document at or below 8 MB, and every entry's compression ratio at or below 200:1. Do not include symbolic links.
- Use only Markdown, JSON, CSV, SHA-256 manifests, AVIF/WebP/PNG/JPEG/GIF images, and selected PDF/DOC/DOCX/XLS/XLSX/PPT/PPTX source documents. Convert text evidence to Markdown; for any unsupported external file, retain only its public URL and source record.
- Treat paths as Unicode NFKC and case-insensitive when checking uniqueness; two paths that differ only by case or Unicode normalization are duplicates.
- Treat 36–48 validated first-party images as a target. Package every eligible asset up to 48; a smaller honest `source_limited` or `budget_limited` delivery is valid.
- Target 18,000–28,000 customer-visible formal characters, impose no total minimum, and never exceed 40,000.
- Derive every overview and leaf minimum from actual linked `kind: evidence` documents; do not trust model-reported evidence counts.
- Target about 1,500–2,500 characters for ordinary branch overviews and 3,000–4,000 for `03_products/` when evidence supports that depth.
- Status headers, source tables, acquisition reports, source indexes and machine manifests are excluded from the customer-visible narrative count.
- Third-party images are URL/source/ownership records by default and do not require downloaded files.

If any package budget would be exceeded, consolidate long-tail SKU/topic leaves, remove low-value duplicate assets, and retain a truthful source or gap record. Do not delete a real product family from the overview, leave a canonical directory empty, downgrade evidence, pad an image target, or invent completeness.

## Required Crawl Coverage Metrics

`00_crawl_coverage_report.md` must contain a readable Markdown table with at least these metrics:

| Dimension                | Required metrics                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Pages                    | discovered, successfully downloaded, parsed, skipped, failed                                               |
| Text                     | cleaned main-text characters and words; deduplicated content-block characters and words                    |
| First-party images       | discovered URLs, successful downloads, failed downloads, unique content hashes, duplicates                 |
| Image volume and quality | total downloaded bytes, format distribution, dimension coverage, count above a useful resolution threshold |
| Documents                | discovered, downloaded, parsed and failed files by type                                                    |

Also state the applicable collection budgets and whether each stopped because the need was satisfied, the resource budget was reached or the time cutoff occurred. Show counts and units directly. Do not replace them with qualitative statements such as “大量文字与图片”, and do not treat an image URL as a successful download until the response body has been fetched and validated as image content.

## Required Machine-Readable Completeness Input

Write `00_completeness.json` at the ZIP root. It records raw observations from this one collection run so the website server can calculate the customer-facing evidence-completeness percentage deterministically. The model must never calculate or include a score, percentage, grade, label, basis, caveat, applicable-leaf count, remediation priority, `P0/P1/P2` classification or iteration status.

Build every value below from the current run. The uppercase tokens are instructions, not literal output values: replace every token with the observed integer, JSON string or JSON string list before writing the file. The final `00_completeness.json` must be valid JSON, must contain no template token, and must never reuse a number, gap or timestamp from a prior company or example.

Use exactly this object shape and no extra properties:

```text
{
  "counts": {
    "totalLeaves": TOTAL_LEAVES,
    "verifiedFirstParty": VERIFIED_FIRST_PARTY_LEAVES,
    "verifiedAuthoritative": VERIFIED_AUTHORITATIVE_LEAVES,
    "supportedThirdParty": SUPPORTED_THIRD_PARTY_LEAVES,
    "inferred": INFERRED_LEAVES,
    "needsVerification": NEEDS_VERIFICATION_LEAVES,
    "notApplicable": NOT_APPLICABLE_LEAVES
  },
  "acquisition": {
    "officialPages": { "completed": OFFICIAL_PAGES_COMPLETED, "total": OFFICIAL_PAGES_DISCOVERED },
    "images": { "completed": VALIDATED_IMAGES_PACKAGED, "total": IMAGES_DISCOVERED },
    "documents": { "completed": DOCUMENTS_PARSED, "total": DOCUMENTS_DISCOVERED },
    "webQueries": { "completed": WEB_QUERIES_EXECUTED, "total": WEB_QUERIES_PLANNED }
  },
  "gaps": [UNRESOLVED_GAP_STRINGS],
  "evaluatedAt": EVALUATED_AT_ISO_8601
}
```

Rules:

- Derive `TOTAL_LEAVES` from the final stable inventory created for this company. Derive each evidence-status token by counting leaves carrying that exact status in the packaged tree; do not estimate or copy a sample count.
- Derive every acquisition token from the current run's crawl, download, parse and query logs. Do not infer a successful count from discovered URLs.
- Replace `UNRESOLVED_GAP_STRINGS` with zero or more JSON strings describing only gaps observed in this run.
- Replace `EVALUATED_AT_ISO_8601` with a quoted ISO 8601 timestamp captured when this run finishes; do not use a documentation, build or prior-run date.
- `totalLeaves` is the final stable leaf inventory. The six evidence-status counts must be non-negative integers and sum exactly to `totalLeaves`.
- The website counts only manifest documents with `kind: leaf` under the canonical content directories. Seven `kind: overview` documents are additional and must not be included in `totalLeaves`.
- Every counted leaf file must use the Markdown header template below and declare exactly one of the six evidence statuses. The server independently recounts those headers and rejects any mismatch with the six status totals.
- `notApplicable` remains part of `totalLeaves`; the server derives the applicable-leaf denominator.
- `officialPages.completed` means pages successfully parsed, `images.completed` means deduplicated image bodies successfully downloaded, validated, selected and actually packaged in the final ZIP, `documents.completed` means documents successfully parsed, and `webQueries.completed` means planned public-web queries actually executed. The crawl progress counter may report more downloaded candidates than this final packaged count; never copy it without reconciling the final ZIP.
- Every acquisition `completed` value must be no greater than its `total`. Omit an acquisition dimension when no honest denominator is available; never invent a denominator.
- `gaps` contains concise unresolved evidence or collection gaps from this run. Do not turn it into a prioritized roadmap.
- `evaluatedAt` is an ISO 8601 timestamp for the completed one-shot evaluation.

## Required Package Manifest

Write `00_package_manifest.json` at the ZIP root without changing `00_completeness.json`. This second manifest proves that the customer-visible documents and real image files in the final ZIP agree with their machine metadata.

Use exactly these top-level fields:

```text
{
  "schemaVersion": 2,
  "profile": "website-lead-v1",
  "documents": [DOCUMENT_RECORDS],
  "assets": [ASSET_RECORDS],
  "counts": {
    "totalFiles": ACTUAL_ZIP_FILE_COUNT,
    "customerVisibleCharacters": ACTUAL_FORMAL_NARRATIVE_CHARACTERS,
    "evidenceCharacters": ACTUAL_PACKAGED_EVIDENCE_CHARACTERS,
    "packagedImages": ACTUAL_VALID_IMAGE_FILES
  },
  "branchEvidence": [BRANCH_EVIDENCE_RECORDS],
  "imageSelection": {
    "status": "target_met|source_limited|budget_limited",
    "discoveredCandidateImages": ACTUAL_DISCOVERED_CANDIDATES,
    "inspectedCandidateImages": ACTUAL_INSPECTED_CANDIDATES,
    "eligibleFirstPartyImages": ACTUAL_QUALIFIED_FIRST_PARTY_IMAGES,
    "rejectedCandidateImages": ACTUAL_REJECTED_CANDIDATES,
    "scannedSourcePages": ACTUAL_SOURCE_PAGES_SCANNED_FOR_IMAGES,
    "discoveryMethods": ["ACTUAL_METHODS_CHECKED"],
    "candidates": [CANDIDATE_RECORDS],
    "productFamilies": [PRODUCT_FAMILY_VISUAL_COVERAGE],
    "shortfallReason": "REQUIRED_FOR_SOURCE_LIMITED_OR_BUDGET_LIMITED"
  }
}
```

`discoveryMethods` must contain all seven mechanisms checked—`img`, `srcset_or_lazy`, `picture`, `css_background`, `open_graph`, `gallery`, and `official_document`—even when a mechanism yields no candidate. `scannedSourcePages` and every `checkedSourceCount` must be at least 1 so that a sparse result cannot claim `limited_evidence` without actually checking sources.

Every public source, candidate, and asset URL stored in the package manifest must be a credential-free HTTP(S) URL no longer than 4,000 characters.

Each `branchEvidence` record uses exactly:

```text
{
  "branchId": "company-identity|team|products-services|core-capabilities|customers-industries|cooperation|why-frontmind",
  "overviewDocumentId": "THE_BRANCH_OVERVIEW_DOCUMENT_ID",
  "contentStatus": "complete|limited_evidence|needs_verification",
  "deduplicatedEvidenceCharacters": ACTUAL_UNION_OF_LINKED_EVIDENCE_DOCUMENT_CHARACTERS,
  "dynamicOverviewMinimum": RECOMPUTED_MINIMUM,
  "checkedSourceCount": ACTUAL_CHECKED_SOURCE_COUNT
}
```

Each image candidate uses `url`, `sourcePageUrl`, one actual discovery `method`, and `status: eligible|rejected|uninspected`. An eligible candidate also has `assetId`; a rejected candidate instead has `rejectionReason`; an uninspected candidate has neither. Each product-family record uses `id`, `name`, `checkedSources`, `officialVisualFound`, `assetIds`, and `gapReason` only when no official visual was found.

Every `documents` record uses only these fields:

```text
{
  "id": "STABLE_DOCUMENT_ID",
  "path": "EXACT_RELATIVE_MARKDOWN_PATH",
  "kind": "overview|leaf|evidence|report|index",
  "title": "DISPLAY_TITLE",
  "branchId": "OPTIONAL_CANONICAL_01_TO_08_DIRECTORY_NAME",
  "order": OPTIONAL_NON_NEGATIVE_INTEGER,
  "evidenceStatus": "OPTIONAL_EXACT_LEAF_STATUS",
  "sourceIds": ["OPTIONAL_STABLE_SOURCE_IDS"],
  "assetIds": ["OPTIONAL_LINKED_ASSET_IDS"],
  "evidenceDocumentIds": ["LINKED_KIND_EVIDENCE_DOCUMENT_IDS"],
  "evidenceCharacters": ACTUAL_LINKED_EVIDENCE_CHARACTERS,
  "dynamicMinimumCharacters": RECOMPUTED_DYNAMIC_MINIMUM,
  "productFamilyIds": ["REQUIRED_ON_03_PRODUCTS_LEAVES"],
  "customerVisible": true
}
```

Rules for documents:

- Inventory every Markdown file in the ZIP exactly once; IDs and paths are unique.
- Every Markdown document under `01`–`08` is `customerVisible: true`, has kind `overview` or `leaf`, declares the canonical directory as `branchId`, and repeats the exact status from its Markdown status header as `evidenceStatus`. Every formal document lists unique `evidenceDocumentIds`; each target must be a non-customer-visible `kind: evidence` record with the same canonical `branchId`, and the formal/evidence records must share at least one `sourceId`. The validators reopen those evidence files, recalculate `evidenceCharacters`, hash normalized evidence content and reject duplicate hidden evidence documents. Reuse one evidence ID across related documents in the same branch instead of copying an excerpt to inflate evidence counts.
- Root reports, source indexes, acquisition reports and evidence excerpts are `customerVisible: false` with kind `evidence`, `report` or `index`.
- Declare exactly one overview for each display branch. `04_technology` and `05_manufacturing` combine into the single core-capabilities display branch and therefore share one overview.
- For an overview, both its document record's `dynamicMinimumCharacters` and the matching branch record's `dynamicOverviewMinimum` equal `min(1500, max(120, ceil(actual branch evidence × 25%)))`, using 3,000 instead of 1,500 for products/services. For a leaf use `min(200, max(60, ceil(actual linked evidence × 20%)))`. With no evidence, require a truthful gap narrative of at least 40 effective characters.
- Every `03_products` leaf lists one or more stable `productFamilyIds`; no other branch may declare that field. Their union must equal `imageSelection.productFamilies`; each family records at least one checked source and either linked first-party assets or a concrete gap.
- `assetIds` lists only images that genuinely illustrate that document. Mirror every relationship in the asset record's `documentIds`.

Every `assets` record uses only these fields:

```text
{
  "id": "STABLE_ASSET_ID",
  "path": "EXACT_RELATIVE_IMAGE_PATH",
  "sha256": "LOWERCASE_64_HEX_SHA256_OF_ACTUAL_FILE",
  "mimeType": "image/avif|image/webp|image/png|image/jpeg|image/gif",
  "bytes": ACTUAL_FILE_BYTES,
  "width": ACTUAL_PIXEL_WIDTH,
  "height": ACTUAL_PIXEL_HEIGHT,
  "caption": "CUSTOMER_VISIBLE_CAPTION",
  "alt": "OPTIONAL_ACCESSIBLE_ALT_TEXT",
  "branchId": "CANONICAL_01_TO_08_DIRECTORY_NAME",
  "documentIds": ["ONE_OR_MORE_LINKED_CUSTOMER_DOCUMENT_IDS"],
  "sourcePageUrl": "PUBLIC_FIRST_PARTY_SOURCE_PAGE_URL",
  "sourceAssetUrl": "OPTIONAL_PUBLIC_DIRECT_ASSET_URL",
  "ownership": "first_party"
}
```

Rules for assets and counts:

- Inventory every packaged raster image exactly once; IDs, paths and SHA-256 hashes are unique.
- Read each final file body again to calculate `bytes`, `sha256`, `width` and `height`. Its suffix, declared MIME and magic bytes must agree. SVG is not a packaged display image: rasterize an authorized SVG to PNG/WebP or keep only its URL record.
- Package only first-party images. Third-party and unknown-ownership media remain URL/source/ownership notes in the reference inventory and never fill the target.
- Every image declares its canonical `branchId` and exact public first-party `sourcePageUrl`. `documentIds` must reference customer-visible documents in that branch, and every linked document must contain the same asset ID in `assetIds`.
- Set `counts.totalFiles` to all non-directory ZIP entries, including both JSON manifests. Recount it after final compression layout is fixed.
- Set `counts.packagedImages` and `00_completeness.json.acquisition.images.completed` to the exact number of valid, deduplicated raster files in the final ZIP.
- Record every discovered image candidate with direct URL, source page, method and status. `inspected = eligible + rejected` and `inspected <= discovered`. `target_met` requires at least 36 packaged eligible images, no uninspected candidate, and no `shortfallReason`; `source_limited` requires fewer than 36 eligible images and every candidate inspected; `budget_limited` requires at least one real uninspected candidate and may already contain 36 or more eligible images. Every eligible candidate maps to a packaged asset, and every packaged asset maps back to one eligible candidate.
- `customerVisibleCharacters` counts only formal narrative from customer-visible overview/leaf documents. Exclude headings, frontmatter, status headers, source/reference sections, source tables, material/machine inventories, URLs and Markdown markup. Ignore whitespace and punctuation.
- `evidenceCharacters` applies the same whitespace/punctuation/URL/markup exclusions to all non-customer-visible Markdown documents.

## Markdown File Template

Each content Markdown file follows this structure:

```markdown
# [Topic Title]

> 最后更新: [date] | 状态: [verified_first_party/verified_authoritative/supported_third_party/inferred/needs_verification/not_applicable] | 来源: [用户资料/企业官网/权威记录/第三方资料/行业调研]

## 正式综述 / 核心内容

[Finished customer-facing enterprise knowledge written from sourced facts. Do not describe it as a raw snapshot, page excerpt, crawl note or source summary.]

## 关键数据

| 指标 | 数值 | 备注 |
| ---- | ---- | ---- |
| ...  | ...  | ...  |

## 展示素材

- [已验证图片的稳定 asset ID、准确相对路径和图注；没有图片时如实省略本节]

## 原始来源

- 来自上传文档: [filename and page]
- 来自企业官网: [exact URL]
- 来自全网资料: [exact URL and source type]
```

The server excludes `原始来源`, source/reference sections, status headers and asset inventories from the formal narrative count. Keep these audit details concise. Never use them to make a thin document appear to satisfy its evidence-adaptive minimum.

## Required Final Completion Report

Render ordinary Markdown with blank lines around every table and list. Never wrap progress in a code fence, ASCII tree, box-drawing separator or character progress bar.

### 知识库构建完成度

Replace every brace-delimited token below with counts calculated from the packaged tree. Repeat the data row once for each actual top-level branch; do not copy a count from this reference.

| 状态                           | 分支           |                           已写入 / 总数 |                               待核验 |                           不适用 |
| ------------------------------ | -------------- | --------------------------------------: | -----------------------------------: | -------------------------------: |
| `{由该分支实际计数得出的状态}` | `{实际分支名}` | `{该分支已写入数} / {该分支叶节点总数}` | `{该分支 needs_verification 节点数}` | `{该分支 not_applicable 节点数}` |

**全部叶节点已处理：** `{已写入或说明不适用的叶节点数} / {最终叶节点总数}`  
**待核验：** `{needs_verification 节点总数}`　**不适用：** `{not_applicable 节点总数}`

## Final Packaging Gate

- Package automatically only when every true leaf node contains Markdown content or a reasoned `not_applicable` record.
- Count 40–56 content leaves and no more than 150 total ZIP files.
- Include the exact `00_package_manifest.json`, one overview per display branch, and bidirectional document/image links.
- Treat 36–48 validated first-party images as a target; allow a smaller source-limited delivery only when the candidate ledger proves the shortfall. Package no SVG, third-party image file, duplicate hash or per-page raw HTML archive.
- Target 18,000–28,000 effective narrative characters, enforce the evidence-adaptive per-document minimums, and never exceed 40,000.
- Reject repeated template prose and any formal copy framed as a raw snapshot or page excerpt.
- Do not ask “是否生成初版成果” or offer A/B/C generation choices.
- Include `00_completeness.json`, the official-site crawl coverage report, full-web intelligence report, source index, first-party image inventory, third-party reference-asset inventory and unresolved verification gaps.
- Retain evidence status for every leaf in `00_knowledge_tree.md`.
- Never include an interactive research webpage or HTML deliverable.
- Run the injected `scripts/validate_archive.py` unchanged against the final ZIP. It must reopen and decode every raster, compare the decoded dimensions, and reject header-only or corrupt payloads even when their suffix and magic prefix match. Deliver only after it exits zero and prints `VALID`.
