# One-Shot Research Strategy Reference

## Core Principle: Pre-fill Every Leaf Without Interaction

Every leaf follows: **Research → Pre-fill → Source → Verify → Classify → Continue**.

Never present a blank question and never present a confirmation question. Before the 42-minute discovery cutoff, select evidence breadth-first under the fixed budgets. After the cutoff, write only from retained uploads, excerpts, source records and selected assets. If evidence remains sparse, state the exact gap and mark the content `needs_verification`; do not wait for a user reply or reopen broad research.

## Pre-fill Sources and Priority

| Priority | Source                       | Required method                                                                         | Extract                                                                                          |
| -------- | ---------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 1        | User uploads                 | Parse up to the existing ten-file limit first; OCR only when needed for a priority leaf | Direct facts, tables, specs, claims, original images                                             |
| 2        | Official company sites       | Breadth-first selection within 120 HTML attempts                                        | Product families, identity, capabilities, industries, cooperation, contact and selected evidence |
| 3        | Official linked documents    | Parse at most 12 selected catalogs, manuals, brochures or spec sheets                   | Priority parameters, workflows, diagrams and product media                                       |
| 4        | Public authoritative sources | Use the 12-query budget for entity verification and high-impact gaps                    | Registrations, certifications, patents, awards and credible coverage                             |
| 5        | Public ecosystem sources     | Use only when a priority gap remains after first-party research                         | Product aliases, market presence, applications and leads for verification                        |
| 6        | Industry and competitors     | Use only as clearly labelled comparison context                                         | Standard terminology and bounded benchmark context                                               |
| 7        | AI synthesis                 | Only from sourced evidence above                                                        | Clearly labelled inferences and gap-filling suggestions                                          |

Official enterprise facts and images outrank third-party material. Never present a generic stock/reference image as an enterprise-owned asset.

## Bounded Official-Site Research

Use a single breadth-first queue and stop the activity at its time or link budget:

1. Normalize every supplied official URL and identify canonical domains and subdomains.
2. Fetch `robots.txt`, `sitemap.xml`, sitemap indexes and nested sitemaps.
3. Prioritize one or more representative pages for identity, every product/service family, capabilities, industries/cases, cooperation/support, contact, team and certifications.
4. Render client-side pages only when a priority page lacks server-rendered evidence. Expand tabs, accordions or galleries only when they fill a matrix gap.
5. Parse JSON-LD, metadata, headings, tables, lists, downloadable documents, image captions and alt text.
6. Discover images from `img`, `picture`, `source/srcset`, lazy-load attributes, CSS backgrounds, Open Graph metadata, product galleries and document-embedded media.
7. Rank candidates before downloading. Preserve useful first-party assets, deduplicate by SHA-256, and retain source-page relationships. Package every eligible asset up to the 48-image safety ceiling; prioritize brand and core product-family coverage, and never pad the package with repeated badges or decorative images.
8. Store for each packaged asset: stable ID, local path, SHA-256, actual bytes, source page, original URL, alt/caption, dimensions, MIME type, product/service association, linked document IDs and first-party ownership. SVG must be rasterized to PNG/WebP before display packaging.
9. Keep a single URL/status ledger, deduplicated evidence excerpts and source index. Do not retain per-page HTML plus a duplicate cleaned-text file; exclude raw HTML from the final ZIP by default.
10. Produce a quantitative coverage report with explicit selected, skipped and failed URLs. State page retrieval/parse results, cleaned and retained text, image discovery and actual downloads, content hashes and document totals.

Do not follow category pagination, long-tail SKUs, repeated news or language variants to a fixpoint. Discovering another URL does not authorize exceeding 120 HTML attempts, 180 total attempted links, 300,000 retained evidence characters or the 42-minute discovery cutoff.

## Limited Public-Web Intelligence

After first-party collection, use no more than 12 public-web queries to resolve identity and close high-impact evidence gaps.

1. Build a ranked query list from legal/trading names, aliases, domains, core product families, leaders, certification identifiers and the most important unresolved Q&A topics.
2. Use relevant languages only when they materially improve entity resolution or verification.
3. Prefer authoritative corporate, patent and certification records, then credible news or industry sources.
4. Resolve similarly named companies by domain, address, contact details, logo, product portfolio and legal identity. Never merge evidence from an unresolved entity.
5. Deduplicate reposted or syndicated pages, preserve publication and capture dates, and record conflicts. Official company sources and authoritative registries outrank third-party claims.
6. Record non-first-party media by source page, direct asset URL and ownership/licensing status. Do not download third-party image files by default.
7. Produce `00_web_intelligence_report.md` with actual queries, result domains, selected/rejected pages, extracted facts/assets, conflicts and unresolved coverage gaps.

When all 12 queries are used or 42 minutes is reached, record remaining gaps and stop. Public research must not continue merely to make the knowledge base appear complete.

## True Node Inventory

Use the seven universal questions to verify coverage, but write the expanded leaves only into the eight canonical content directories defined by `output-format.md`. The capability question maps to technology, manufacturing, or both. These questions are not summary nodes or a competing filesystem layout.

Create the 40-leaf base allocation from `knowledge-tree.md`, then add at most 16 leaves for priority product families, important industry scenarios and customer-answer evidence. Every real product family appears in the overview even when long-tail SKUs are consolidated. The final count is **40–56** for every enterprise size.

Give each leaf a stable ID. Maintain totals for the six evidence statuses defined in `knowledge-tree.md`. Completion is `written leaves / total leaves` and may reach 100% only after every applicable leaf has content and every non-applicable leaf has a reason.

## Required Automatic Processing Format Per Leaf

Write each leaf as finished customer-facing enterprise knowledge in ordinary Markdown, never inside a fenced code block and never with box-drawing separators. In the template below, replace every brace-delimited token with content and evidence observed for the current company; never copy the placeholder wording or facts from another company. Do not call the formal content a first-party snapshot, page excerpt, crawl result or source summary.

### `{稳定叶节点 ID}` · `{当前叶节点标题}`

`{仅由当前运行中已解析来源支持、经过整理并可直接面向客户展示的正式正文内容}`

**证据状态：** `{该叶节点实际 evidence status}`

**来源**

- `{当前正文中的事实或字段}`：`{精确文件名与页码，或精确来源 URL 与来源类型}`
- `{如有推断或对比}`：`{其输入证据及明确的推断/第三方标签}`

**展示图片**

- `{当前图片用途}`：`{稳定 asset ID、本次运行保存的实际相对路径、准确图注与第一方来源}`

After saving this leaf, continue directly to the next leaf without emitting a question.

## When Evidence Is Sparse

Only after uploads, official sites, official documents and public research all yield insufficient evidence, write the supported facts and explicit gaps:

### `{稀疏证据叶节点 ID}` · `{当前叶节点标题}`

`{仅写入本次运行中已经获得支持的事实，并逐项说明实际缺口}`

**证据状态：** `needs_verification`

- `{已有证据的字段}`：`{本次运行确认的内容与精确来源}`
- `{缺少充分证据的字段}`：待核验

Continue automatically. Never ask the user to design, confirm, correct, upload for, or skip the node.

At branch level, use `limited_evidence` when some actual linked evidence supports a concise customer-ready narrative but not the normal article target. Use `needs_verification` only when the linked evidence union is empty. These are successful evidence states, not packaging failures. Never reduce an evidence character declaration to make a thin draft pass: link every retained evidence document and let both validators recalculate the requirement.

## Automatic Response-Free Handling

- Sufficient first-party evidence → write and mark `verified_first_party`.
- Resolved authoritative external evidence → write and mark `verified_authoritative`.
- Resolved non-authoritative evidence → write with provenance and mark `supported_third_party`.
- Bounded synthesis → write only when useful, cite its inputs, and mark `inferred`.
- Insufficient or conflicting evidence → state only supported facts and gaps, then mark `needs_verification`.
- Genuine irrelevance → preserve the node and reason, then mark `not_applicable`.

The following are forbidden:

- Waiting for user confirmation, correction, skip/direct-prefill, structure approval, or delivery approval.
- Skipping a whole branch or omitting a real product family from the overview.
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

Package automatically when written leaves plus reasoned `not_applicable` leaves equal total leaves. Produce the final Markdown/ZIP without asking an extra question. Keep 40–56 true leaves plus seven additional overviews, target 18,000–28,000 evidence-supported customer-visible characters without imposing a total minimum, never exceed 40,000 characters, save at most 48 images and keep at most 150 ZIP files. Include the schema-v2 `00_package_manifest.json`, linked evidence documents, both acquisition reports, the complete image-candidate ledger, product-family visual coverage, first-party image inventory, URL-only third-party reference inventory and unresolved verification gaps. Run the injected deterministic validator unchanged and deliver only after it prints `VALID`.
