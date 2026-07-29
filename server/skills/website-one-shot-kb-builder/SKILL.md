---
name: website-one-shot-kb-builder
description: Build a breadth-first, budget-bounded enterprise knowledge base in one uninterrupted website run. Cover every business branch and real product family while limiting crawl depth, retained text, images, documents, public queries, leaf count, and ZIP size. Emit trustworthy cumulative crawl checkpoints, evidence-classify every claim, record honest verification gaps, and package the final Markdown/ZIP without asking the user to confirm or correct. Use for the FrontMind website GEO enterprise-analysis lead-generation workflow.
---

# Website One-Shot Enterprise Knowledge Base Builder

Build a useful, industry-adaptive enterprise knowledge base through AI-driven research and pre-filling, without a user-confirmation loop. This website version is a bounded lead-generation experience: preserve breadth across business questions and product families, but stop deep collection when its time or resource budget is reached.

## Core Principle

> **Cover Every Branch, Bound the Depth, Then Package Once.** Populate a stable 40–56-leaf tree from uploads and selected evidence. Never ask a question, request confirmation or correction, present a skip choice, or wait for user input. A truthful `needs_verification` gap is preferable to another crawl round or an invented fact.

## Workflow

```
Phase 1: Plan Coverage & Bounded Research → Phase 2: Finalize Adaptive Tree → Phase 3: Write & Verify Every Leaf → Phase 4: Validate & Package
```

## Time and Resource Budget

Target completion in **45–55 minutes** and finish within **60 minutes** without introducing a server-side hard kill. Do not wait to consume the time budget.

| Elapsed time     | Required work                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 0–5 minutes      | Detect enterprise type and product families; establish the seven-question/eight-directory coverage matrix and source priorities. |
| 5–25 minutes     | Collect selected high-value official pages breadth-first.                                                                        |
| 25–35 minutes    | Process user uploads first, then selected images and official linked documents.                                                  |
| 35–42 minutes    | Run limited public queries only to verify identity or fill high-impact answer gaps.                                              |
| At 42 minutes    | Stop all new discovery and switch to leaf writing with the evidence already collected.                                           |
| After 50 minutes | Only validate, repair references, package and deliver. Do not start new collection or expand the tree.                           |

The first budget reached—time or resource—ends that collection activity:

| Resource                                            |                                                   Hard budget |
| --------------------------------------------------- | ------------------------------------------------------------: |
| Official HTML page retrieval attempts               |                                                           120 |
| All attempted links, including images and documents |                                  about 180; do not exceed 180 |
| Validated images saved and packaged                 |                                                            48 |
| Official linked documents parsed                    |                                                            12 |
| User uploads                                        | the existing maximum of 10; process before external documents |
| Public-web queries executed                         |                                                            12 |
| Deduplicated raw evidence text retained             |                                            300,000 characters |
| Customer-visible knowledge narrative                |         target 12,000 Chinese characters; hard maximum 18,000 |
| Content leaves under `01`–`08`                      |                                                         40–56 |
| Total files in the final ZIP                        |                                                           150 |

Budgets constrain acquisition and packaging, not truthfulness. When a budget is exhausted, record the unresolved topic as a concise gap and continue writing. Never use budget consumption, crawl counters, or elapsed time to invent a knowledge-base completeness percentage.

## Phase 1: Plan Coverage & Bounded Research

1. Consume the company name, website URL, and any supplied materials (brochures, catalogs, PPTs, images). If an intake field is missing, record the gap and continue with available evidence instead of asking the user.
2. Detect enterprise type—manufacturing, SaaS, services, e-commerce, education, or other—and identify every real product/service family before deepening any one branch.
3. Create a breadth-first URL queue from navigation, `robots.txt`, sitemap indexes and nested sitemaps. Prioritize homepage, about, product-family/service overviews, core product details, technology/manufacturing, industries/cases, cooperation/support, contact, team and certifications. Sample news, pagination, language variants and long-tail SKU pages only when they fill a missing business branch or high-impact answer.
4. Process up to 10 user uploads before linked documents. Extract only evidence needed by the coverage matrix and deduplicate retained text blocks.
5. Expand large SKU catalogs into a sourced product-family inventory. Every real product family must appear in the knowledge base, but only core families receive separate parameters, scenarios, cases and FAQ leaves.
6. Save first-party images in this order: Logo/brand identity, core products or services, application scenarios, technology or manufacturing capability, certifications, then team. Deduplicate by content hash. Save no more than three preview images per content branch and about 21 preview images across the page; use remaining package capacity only for high-value first-party assets. For third-party images, record the page URL, direct asset URL, source and ownership status by default—do not download the file.
7. Parse selected official catalogs, manuals, brochures or specification sheets only when they support a priority leaf. Uploaded files take precedence within the combined document-processing window.
8. Use public queries only for entity resolution, authoritative verification, and unanswered facts that materially affect customer Q&A. Every retained third-party fact must keep its exact source URL, source type, capture/publication date and conflict notes.
9. Maintain one URL/status ledger, deduplicated evidence excerpts and one source index. Do not save both raw HTML and cleaned text for every page. Raw HTML is temporary working material and must not enter the final ZIP by default.
10. Create quantitative official-site and public-web reports from the actual run. Report attempted/successful/failed pages, extracted/deduplicated text, discovered/downloaded/failed images, parsed documents, query results and unresolved gaps without claiming exhaustion.
11. Maintain the unchanged raw completeness inputs: final leaf counts by the six evidence statuses, acquisition completed/total pairs, concise unresolved gaps and evaluation time.

### Crawl Progress Checkpoints

Maintain these cumulative counters from the task start:

- `visitedLinks`: unique links whose retrieval was attempted.
- `successfulPages`: visited pages successfully fetched and parsed.
- `failedPages`: visited pages that failed retrieval or parsing.
- `textCharacters`: cleaned text characters actually extracted.
- `imagesDiscovered`: distinct image asset URLs discovered.
- `imagesDownloaded`: image bodies successfully downloaded and validated.
- `documentsParsed`: linked or uploaded documents successfully parsed.
- `webQueriesExecuted`: public-web queries actually executed.

Emit a one-line assistant output checkpoint whenever elapsed task time crosses each 5-minute boundary. Also emit one at every phase transition and at final completion. Continue useful work between checkpoints: never sleep, pause, poll without work, or delay completion merely to reach a time boundary. If the run finishes before five minutes, emit the final checkpoint without waiting.

Use exactly this marker followed by one compact JSON object on the same line:

```text
FRONTMIND_GEO_CRAWL_PROGRESS_V1 {"schemaVersion":1,"reportedAt":"CURRENT_ISO_8601_TIME","phase":"crawling","visitedLinks":ACTUAL_INTEGER,"successfulPages":ACTUAL_INTEGER,"failedPages":ACTUAL_INTEGER,"textCharacters":ACTUAL_INTEGER,"imagesDiscovered":ACTUAL_INTEGER,"imagesDownloaded":ACTUAL_INTEGER,"documentsParsed":ACTUAL_INTEGER,"webQueriesExecuted":ACTUAL_INTEGER}
```

Set `phase` to exactly one of `planning`, `crawling`, `extracting`, `assets`, `documents`, `finalizing`, or `completed`. Derive every count from the current run's actual logs. Counts must be non-negative integers and must never decrease between checkpoints; `successfulPages + failedPages` must not exceed `visitedLinks`, and `imagesDownloaded` must not exceed `imagesDiscovered`. Never copy example values, estimate unobserved work, report discovered assets as downloaded, or use these counters to invent a knowledge-base completeness percentage.

## Phase 2: Scaffold Adaptive Tree

Read `references/knowledge-tree.md` for the seven-question coverage model, its canonical eight-directory mapping, and industry variants.

Use seven universal business questions as the coverage model, then package every leaf under the canonical `01_company_overview/` through `08_competitive_advantages/` content directories defined by `references/output-format.md`. The fourth question, “你怎么做到的？”, maps to `04_technology/`, `05_manufacturing/`, or both according to the enterprise type. The questions are not summary nodes and must not be emitted as a competing directory structure.

Start with exactly 40 leaves allocated as follows: enterprise identity 5, team 3, products/services 12, core capabilities 8 across `04` and `05`, industries/customers 4, cooperation/service 4, and competitive advantages 4. Add no more than 16 leaves, only for priority product families, industry scenarios or evidence needed for customer Q&A. The final tree must contain **40–56 leaves**. Every `01`–`08` directory must contain a supported leaf or one truthful `needs_verification` gap leaf.

| #   | Branch       | Core Question                |
| --- | ------------ | ---------------------------- |
| 1   | 企业身份     | 你是谁？                     |
| 2   | 团队         | 你的团队？                   |
| 3   | 产品/服务    | 你卖什么？（动态扩展）       |
| 4   | 核心能力     | 你怎么做到的？（行业自适应） |
| 5   | 客户与行业   | 卖给谁？（动态扩展）         |
| 6   | 为什么选我们 | 凭什么选你？                 |
| 7   | 合作方式     | 怎么合作？                   |

**Branch 4 adapts by industry type:**

- Manufacturing → 生产能力、质量控制、供应链、定制化
- SaaS/Tech → 技术架构、数据安全、部署方式、集成API
- Services → 方法论、交付流程、团队资质、知识产权
- E-commerce → 供应商体系、物流、库存、品控

Pre-fill all leaf nodes from Phase 1 data. Give every leaf a stable node ID and evidence status. Mark: `verified_first_party`, `verified_authoritative`, `supported_third_party`, `inferred`, `needs_verification`, or `not_applicable`. Product-family consolidation is allowed and required for large catalogs; deleting a real product family from the overview is not.

Create the adaptive tree and true leaf-node count, then immediately process every leaf in the order below without presenting the scaffold for approval.

## Phase 3: Pre-fill & Verify Every Leaf

Read `references/questioning-strategy.md` for the original research workflow and its response-free one-shot processing rules.

### For Every Node

1. **Draft from retained evidence** — Compile from uploads, selected official pages/documents and limited public intelligence. After the discovery cutoff, do not reopen research.
2. **Record with sources** — Write the draft and mark where each fact came from.
3. **Classify evidence** — Apply the evidence status that matches the strongest support; never turn a benchmark or inference into an enterprise fact.
4. **Handle gaps without interaction:**
   - Sufficient evidence → Write the supported content, then advance.
   - Conflicting evidence → Record the conflict, source authority and unresolved gap, then advance.
   - Sparse evidence → Keep only supported facts, mark missing fields `needs_verification`, then advance.
   - Genuine non-applicability → Record the reason as `not_applicable`, then advance.
5. **Track completion** — Use normal Markdown headings, tables, lists and separate paragraphs. Never use ASCII trees, box-drawing separators, character progress bars or fenced-code UI simulations.

### Rules

- **NEVER leave applicable nodes blank.** Always write supported content first and label evidence gaps explicitly.
- **One complete Markdown file per leaf.**
- **Bounded consolidation.** Never skip a whole branch. Consolidate long-tail SKUs, repeated news, pagination and language variants into sourced family or topic leaves; do not infer facts merely to reach final packaging.
- **Source attribution** on every fact (宣传册/官网/行业调研).
- **Images alongside text** only when they add customer-visible value and remain within the image budget.
- **Narrative size.** Default each business branch to about 900–1,800 Chinese characters; the products branch may reach 3,000. Source tables, status headers and machine manifests do not count toward the visible narrative budget.
- **Industry benchmarks** for sparse nodes must remain clearly labelled as benchmark context or `inferred`, never as confirmed enterprise facts.
- **100% traversal gate.** Completion is `written or reasoned-not-applicable leaf nodes / total leaf nodes`; ZIP generation is forbidden before every leaf is handled.
- **Server-verifiable inventory gate.** The number of Markdown leaf files packaged under the eight canonical content directories must equal `counts.totalLeaves`, every canonical content directory must contain at least one non-empty leaf, and every leaf file must declare exactly one evidence status in its header using the output template. When evidence for a canonical directory is absent, write one truthful `needs_verification` gap leaf instead of leaving it empty or inventing a fact. The website rejects a ZIP when the packaged files or their status totals disagree with `00_completeness.json`.
- **No model-generated completeness score.** Never calculate or write a knowledge-base completeness percentage, score, label, formula, grade, priority, or `P0/P1/P2` classification. Record only the raw counts and gaps required by `00_completeness.json`; the website server owns the deterministic customer-facing percentage.
- **No early-generation stage.** Never output or ask about “生成初版成果”, “是否立即生成”, “先生成一版”, A/B/C generation options or any equivalent early-delivery checkpoint.
- **No interactive webpage.** Never propose or create an interactive research page, HTML site, website preview or web deliverable. This skill only delivers Markdown/ZIP for the website application to render separately.
- **No user interaction.** Never ask for confirmation, corrections, uploads, skip/direct-prefill choices, structure approval or packaging approval, and never wait for a reply.

### Traversal Priority

1. Products/Services (per item: overview → specs → differentiators → cases → FAQ)
2. Why Choose Us (advantages, competitor comparison)
3. How to Work With Us (process, pricing, support)
4. Company Identity
5. Core Capabilities (industry-adaptive)
6. Customers & Industries
7. Team

### State Management

Save progress to `/home/ubuntu/kb_build/{company_name}/progress.json` after every leaf.

## Phase 4: Validate, Package & Deliver

Read `references/output-format.md` for ZIP structure and markdown templates.

Enter this phase automatically after every stable leaf is written or reasoned `not_applicable`. Generate the bounded ZIP with hierarchical folders, Markdown files per node, selected first-party images, URL-only third-party references, README, final knowledge-tree status, both acquisition reports, the machine-readable raw `00_completeness.json`, image inventory and unresolved verification gaps. The final ZIP must contain at most 150 files, at most 48 saved images, 40–56 content leaves and at most 18,000 Chinese characters of customer-visible knowledge narrative. Do not include per-page raw HTML or duplicate cleaned-page files.

`00_completeness.json` must keep its existing exact field shape and contain only status counts, acquisition completed/total pairs, gap strings and `evaluatedAt`; it must not contain a score, percentage, label, basis, caveat or derived applicable-leaf count. Budget exhaustion may create a recorded gap but must never change an evidence status or manufacture completeness. Deliver Markdown/ZIP immediately; never ask whether to generate, and never generate an interactive webpage or HTML research experience.

## Reference Files

- **`references/knowledge-tree.md`** — Universal coverage structure, bounded leaf allocation and industry variants. Read at Phase 2.
- **`references/questioning-strategy.md`** — Breadth-first source selection and response-free leaf processing. Read at Phase 3.
- **`references/output-format.md`** — Bounded ZIP structure, budgets and unchanged completeness manifest. Read at Phase 4.
- **`references/source-manifest.json`** — SHA-256 provenance for the exact `socratic-kb-builder.skill` source archive.
