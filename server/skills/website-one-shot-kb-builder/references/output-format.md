# Output Format Reference

## Final ZIP Structure

The final deliverable preserves the original structured ZIP hierarchy exactly:

```
{company_name}_knowledge_base/
├── README.md
├── 00_knowledge_tree.md
├── 00_completeness.json
├── 00_crawl_coverage_report.md
├── 00_web_intelligence_report.md
├── 00_source_index.md
├── 01_company_overview/
│   ├── profile.md
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
│   ├── product_line_overview.md
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

The package must contain Markdown, the raw `00_completeness.json` manifest and source assets only. Do not create an interactive research page, HTML website, webpage preview or other web deliverable.

## Required Crawl Coverage Metrics

`00_crawl_coverage_report.md` must contain a readable Markdown table with at least these metrics:

| Dimension                | Required metrics                                                                                           |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Pages                    | discovered, successfully downloaded, parsed, skipped, failed                                               |
| Text                     | cleaned main-text characters and words; deduplicated content-block characters and words                    |
| First-party images       | discovered URLs, successful downloads, failed downloads, unique content hashes, duplicates                 |
| Image volume and quality | total downloaded bytes, format distribution, dimension coverage, count above a useful resolution threshold |
| Documents                | discovered, downloaded, parsed and failed files by type                                                    |

Show counts and units directly. Do not replace them with qualitative statements such as “大量文字与图片”, and do not treat an image URL as a successful download until the response body has been fetched and validated as image content.

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
    "images": { "completed": VALIDATED_IMAGES_DOWNLOADED, "total": IMAGES_DISCOVERED },
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
- The website counts the actual Markdown files under `01_company_overview/`, `02_team/`, `03_products/`, `04_technology/` or `05_manufacturing/`, `06_industries/`, `07_service/`, and `08_competitive_advantages/`. That packaged-file count must equal `totalLeaves`.
- Every counted leaf file must use the Markdown header template below and declare exactly one of the six evidence statuses. The server independently recounts those headers and rejects any mismatch with the six status totals.
- `notApplicable` remains part of `totalLeaves`; the server derives the applicable-leaf denominator.
- `officialPages.completed` means pages successfully parsed, `images.completed` means image bodies successfully downloaded and validated, `documents.completed` means documents successfully parsed, and `webQueries.completed` means planned public-web queries actually executed.
- Every acquisition `completed` value must be no greater than its `total`. Omit an acquisition dimension when no honest denominator is available; never invent a denominator.
- `gaps` contains concise unresolved evidence or collection gaps from this run. Do not turn it into a prioritized roadmap.
- `evaluatedAt` is an ISO 8601 timestamp for the completed one-shot evaluation.

## Markdown File Template

Each content Markdown file follows this structure:

```markdown
# [Topic Title]

> 最后更新: [date] | 状态: [verified_first_party/verified_authoritative/supported_third_party/inferred/needs_verification/not_applicable] | 来源: [用户资料/企业官网/权威记录/第三方资料/行业调研]

## 核心内容

[Sourced content]

## 关键数据

| 指标 | 数值 | 备注 |
| ---- | ---- | ---- |
| ...  | ...  | ...  |

## 素材清单

- [ ] 仍需企业授权或核验的图片/视频
- [x] 已获取并记录来源的素材

## 原始来源

- 来自上传文档: [filename and page]
- 来自企业官网: [exact URL]
- 来自全网资料: [exact URL and source type]
```

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
- Do not ask “是否生成初版成果” or offer A/B/C generation choices.
- Include `00_completeness.json`, the official-site crawl coverage report, full-web intelligence report, source index, first-party image inventory, third-party reference-asset inventory and unresolved verification gaps.
- Retain evidence status for every leaf in `00_knowledge_tree.md`.
- Never include an interactive research webpage or HTML deliverable.
