# One-Shot Research Strategy Reference

## Core Principle: Pre-fill Every Leaf Without Interaction

Every leaf follows: **Research → Pre-fill → Source → Verify → Classify → Continue**.

Never present a blank question and never present a confirmation question. Before writing a leaf, search uploads, all official-site crawl results and appropriate public sources, then create a sourced draft with relevant enterprise images. If evidence remains sparse, state the exact gap and mark the content `needs_verification`; do not wait for a user reply.

## Pre-fill Sources and Priority

| Priority | Source                         | Required method                                                                              | Extract                                                                                             |
| -------- | ------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1        | User uploads                   | Parse every PDF/PPT/Word/sheet/image; OCR when needed                                        | Direct facts, tables, specs, claims, original images                                                |
| 2        | Official company sites         | Exhaustive recursive crawl of all supplied domains                                           | Product/service pages, about/team/history, cases, support, contact, news, downloads, text and media |
| 3        | Official linked documents      | Download and parse catalogs, manuals, brochures and spec sheets                              | Detailed parameters, models, workflows, diagrams, product media                                     |
| 4        | Full-web authoritative sources | Multilingual query matrix and entity verification                                            | Registrations, certifications, patents, awards, exhibitions and credible coverage                   |
| 5        | Public ecosystem sources       | Search distributors, B2B catalogs, recruiting, social, public video/image and industry pages | Product aliases, market presence, applications, media and leads for verification                    |
| 6        | Industry and competitors       | Benchmark research                                                                           | Standard terminology, expected fields and comparison context                                        |
| 7        | AI synthesis                   | Only from sourced evidence above                                                             | Clearly labelled inferences and gap-filling suggestions                                             |

Official enterprise facts and images outrank third-party material. Never present a generic stock/reference image as an enterprise-owned asset.

## Exhaustive Official-Site Research

Before Phase 2 begins:

1. Normalize every supplied official URL and identify canonical domains and subdomains.
2. Fetch `robots.txt`, `sitemap.xml`, sitemap indexes and nested sitemaps.
3. Recursively traverse same-domain links to a fixpoint, including category pagination, product/service details, application/case pages, about/team/history, technology/R&D, quality/manufacturing, support/downloads, contact, news and useful language variants.
4. Render client-side pages when server HTML is incomplete. Expand visible tabs, accordions, galleries and pagination when they reveal source content.
5. Parse JSON-LD, metadata, headings, tables, lists, downloadable documents, image captions and alt text.
6. Discover images from `img`, `picture`, `source/srcset`, lazy-load attributes, CSS backgrounds, Open Graph metadata, product galleries and document-embedded media.
7. Preserve the highest-resolution first-party asset available. Deduplicate by content hash while retaining every source-page relationship.
8. Store for each asset: local path, source page, original URL, alt/caption, dimensions, MIME type, product/service association and verification status.
9. Produce a quantitative coverage report with explicit skipped/failed URLs. It must state page discovery/download/parse results, cleaned and deduplicated main-text characters/words, image discovery and actual download results, content-hash deduplication, downloaded bytes, image format/resolution distribution and document totals. A count of pages or image URLs alone is not acceptable. Mine every supplied official domain across its actual product/service lines, applications, cases, support/downloads, about pages and available galleries instead of summarizing only its homepage.

Do not scaffold the knowledge tree while large portions of an official site remain undiscovered or unparsed.

## Full-Web Enterprise Intelligence

After the official-site crawl and before Phase 2, perform a separate public-web discovery pass. This is mandatory even when the official website is comprehensive.

1. Build a query matrix from the legal/trading names, Chinese and English aliases, domains, brand names, product families, individual model numbers, leaders, certification identifiers, patent terms, applications and customer industries.
2. Run queries in Chinese, English and relevant target-market languages. Search both general results and source-specific combinations such as company + product model, company + exhibition, company + certification, company + patent, company + distributor and company + case study.
3. Cover authoritative corporate, patent and certification records; news and industry media; trade-show/exhibitor pages; distributor/dealer pages; B2B catalogs; recruiting pages; social profiles; and accessible public video/image sources.
4. Resolve similarly named companies by domain, address, contact details, logo, product portfolio and legal identity. Never merge evidence from an unresolved entity.
5. Deduplicate reposted or syndicated pages, preserve publication and capture dates, and record conflicts. Official company sources and authoritative registries outrank third-party claims.
6. Collect relevant text, documents and imagery. Put non-first-party media in `reference_assets/`, retain the source page and direct asset URL, and label ownership/licensing as `unknown`, `third_party`, `licensed` or `company_confirmed`.
7. Produce `00_web_intelligence_report.md` with all queries, languages, result domains, selected/rejected pages, extracted facts/assets, conflicts and unresolved coverage gaps.

For the current company, combine the full official product/application/support/media inventory with resolved external records and market evidence. A homepage summary or a few search snippets is not sufficient.

## True Node Inventory

Use the seven universal questions to verify coverage, but write the expanded leaves only into the eight canonical content directories defined by `output-format.md`. The capability question maps to technology, manufacturing, or both. These questions are not summary nodes or a competing filesystem layout. Product and customer-industry leaves grow dynamically. Typical totals are:

| Enterprise scope     | Expected leaf-node count |
| -------------------- | -----------------------: |
| Small, 1–3 products  |                    40–55 |
| Medium, 4–6 products |                    60–80 |
| Large, 7–10 products |                   85–115 |

Give each leaf a stable ID. Maintain totals for the six evidence statuses defined in `knowledge-tree.md`. Completion is `written leaves / total leaves` and may reach 100% only after every applicable leaf has content and every non-applicable leaf has a reason.

## Required Automatic Processing Format Per Leaf

Write each leaf as ordinary Markdown, never inside a fenced code block and never with box-drawing separators. In the template below, replace every brace-delimited token with content and evidence observed for the current company; never copy the placeholder wording or facts from another company.

### `{稳定叶节点 ID}` · `{当前叶节点标题}`

`{仅由当前运行中已解析来源支持的正文内容}`

**证据状态：** `{该叶节点实际 evidence status}`

**来源**

- `{当前正文中的事实或字段}`：`{精确文件名与页码，或精确来源 URL 与来源类型}`
- `{如有推断或对比}`：`{其输入证据及明确的推断/第三方标签}`

**已收集图片**

- `{当前图片用途}`：`{本次运行保存的实际相对路径与来源}`

After saving this leaf, continue directly to the next leaf without emitting a question.

## When Evidence Is Sparse

Only after uploads, official sites, official documents and public research all yield insufficient evidence, write the supported facts and explicit gaps:

### `{稀疏证据叶节点 ID}` · `{当前叶节点标题}`

`{仅写入本次运行中已经获得支持的事实，并逐项说明实际缺口}`

**证据状态：** `needs_verification`

- `{已有证据的字段}`：`{本次运行确认的内容与精确来源}`
- `{缺少充分证据的字段}`：待核验

Continue automatically. Never ask the user to design, confirm, correct, upload for, or skip the node.

## Automatic Response-Free Handling

- Sufficient first-party evidence → write and mark `verified_first_party`.
- Resolved authoritative external evidence → write and mark `verified_authoritative`.
- Resolved non-authoritative evidence → write with provenance and mark `supported_third_party`.
- Bounded synthesis → write only when useful, cite its inputs, and mark `inferred`.
- Insufficient or conflicting evidence → state only supported facts and gaps, then mark `needs_verification`.
- Genuine irrelevance → preserve the node and reason, then mark `not_applicable`.

The following are forbidden:

- Waiting for user confirmation, correction, skip/direct-prefill, structure approval, or delivery approval.
- Skipping a whole branch or collapsing real leaves into a summary.
- Adding “生成初版成果”, “是否立即生成”, A/B/C delivery choices, or equivalent stage-confirmation prompts.
- Proposing or producing an interactive research page, HTML site or webpage preview. This workflow produces Markdown/ZIP for a separate website application to render.

## Completion Display

After all leaves are processed, display one compact Markdown table with one row per actual top-level branch. Calculate every brace-delimited value from the current company's final inventory and packaged leaves; never copy a count from this reference or another company.

### 知识库构建完成度

| 状态                           | 分支           |                           已写入 / 总数 |                               待核验 |                           不适用 |
| ------------------------------ | -------------- | --------------------------------------: | -----------------------------------: | -------------------------------: |
| `{由该分支实际计数得出的状态}` | `{实际分支名}` | `{该分支已写入数} / {该分支叶节点总数}` | `{该分支 needs_verification 节点数}` | `{该分支 not_applicable 节点数}` |

**全部叶节点已处理：** `{已写入或说明不适用的叶节点数} / {最终叶节点总数}`  
**待核验：** `{needs_verification 节点总数}`　**不适用：** `{not_applicable 节点总数}`

Do not use ASCII trees, long separator glyphs, character progress bars, or fenced code blocks.

## Packaging Gate

Package automatically when written leaves plus reasoned `not_applicable` leaves equal total leaves. Produce the final Markdown/ZIP without asking an extra question. Include the official-site crawl coverage report, full-web intelligence report, first-party and third-party image asset inventories, and unresolved verification gaps.
