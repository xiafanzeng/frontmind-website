---
name: website-one-shot-kb-builder
description: Build a comprehensive enterprise knowledge base through AI-driven pre-filling in one uninterrupted run. Adapts to ANY industry (manufacturing, SaaS, services, e-commerce, etc.). The AI researches and pre-fills every node with text and images, evidence-classifies every claim, and packages the final Markdown/ZIP without asking the user to confirm or correct. Use for the FrontMind website GEO enterprise-analysis workflow.
---

# Website One-Shot Enterprise Knowledge Base Builder

Build the same structured, industry-adaptive enterprise knowledge base as `socratic-kb-builder` through AI-driven research and pre-filling, but remove its user-confirmation loop and complete the entire build in one task.

## Core Principle

> **Pre-fill Every Node, Then Package Once.** Every node is populated by AI from uploaded materials + web research. Never ask a question, request confirmation or correction, present a skip choice, or wait for user input.

## Workflow

```
Phase 1: Intake & Exhaustive Research → Phase 2: Scaffold Adaptive Tree → Phase 3: Pre-fill & Verify Every Leaf Node → Phase 4: Package ZIP at 100%
```

## Phase 1: Intake & Deep Research

1. Consume the company name, website URL, and any supplied materials (brochures, catalogs, PPTs, images). If an intake field is missing, record the gap and continue with available evidence instead of asking the user.
2. **Crawl every company website exhaustively** — accept one or multiple official domains. Discover `robots.txt`, sitemap indexes and nested sitemaps; recursively traverse same-domain navigation, category pagination, product/service detail pages, about/team/history, cases/applications, news, support, downloads, contact pages and language variants. Render client-side content where necessary.
3. **Analyze uploads** — extract text, specs, images, claims from all files.
4. **Detect enterprise type** — manufacturing / SaaS / services / e-commerce / education / other.
5. **Research the enterprise across the public web** — do not stop at the official sites. Build multilingual query sets from the company name, aliases, domains, product families/models, leaders, certifications, patents, applications, customers and target markets. Search authoritative registries, patent/certification databases, news and industry media, exhibitions, distributors, B2B catalogs, recruiting pages, social accounts and accessible public video/image sources.
6. **Resolve and verify web intelligence** — disambiguate entities, deduplicate syndicated content, retain publication/capture dates, compare conflicting claims and rank first-party or authoritative records above third-party pages. Every third-party fact must retain its exact source URL and source type.
7. **Collect images comprehensively** — inspect `img`, `picture`, `srcset`, lazy-load attributes, CSS backgrounds, product galleries, Open Graph images and downloadable media on both official and relevant public pages. Preserve originals where available; deduplicate by content hash; record source page URL, direct asset URL, alt/caption, dimensions, file type, company/product association and usage notes. Keep third-party images in a separate reference collection with ownership/licensing status; never present them as company-owned assets.
8. **Extract linked documents** — download and parse official PDF catalogs, manuals, brochures, specification sheets and other first-party files; associate extracted text and images with their source pages. Index useful third-party documents separately with provenance and authority level.
9. **Create two quantitative coverage reports** — the official-site crawl report must show discovered/successful/failed page counts; cleaned main-text characters and words; deduplicated content-block characters and words; discovered/successfully downloaded/failed image counts; unique image content hashes; duplicate count; downloaded image bytes; format and resolution distributions; and document counts. Reporting only page totals or image URLs is insufficient. The public-web intelligence report lists queries, languages, result domains, pages, downloaded assets, conflicts and unresolved gaps. Do not enter Phase 2 until official sites have been traversed to exhaustion and the full-web query matrix has been completed or every remaining failure is documented.
10. **Maintain raw completeness inputs** — count final leaf nodes by the six evidence statuses, record acquisition completed/total pairs for official pages, validated images, parsed documents and executed public-web queries, retain concise unresolved gaps, and record the evaluation time. These are observations from this one uninterrupted collection run, not an iteration backlog.
11. Save all raw text, files, images, metadata and both coverage reports to `/home/ubuntu/kb_build/{company_name}/raw/`.

## Phase 2: Scaffold Adaptive Tree

Read `references/knowledge-tree.md` for the seven-question coverage model, its canonical eight-directory mapping, and industry variants.

Use seven universal business questions as the coverage model, then package every leaf under the canonical `01_company_overview/` through `08_competitive_advantages/` content directories defined by `references/output-format.md`. The fourth question, “你怎么做到的？”, maps to `04_technology/`, `05_manufacturing/`, or both according to the enterprise type. The questions are not summary nodes and must not be emitted as a competing directory structure. Expand them into a complete leaf-node manifest based on the actual products, services, capabilities and customer industries. A typical build contains about **40-115 leaf nodes**.

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

Pre-fill all leaf nodes from Phase 1 data. Give every leaf a stable node ID and evidence status. Mark: `verified_first_party`, `verified_authoritative`, `supported_third_party`, `inferred`, `needs_verification`, or `not_applicable`.

Create the adaptive tree and true leaf-node count, then immediately process every leaf in the order below without presenting the scaffold for approval.

## Phase 3: Pre-fill & Verify Every Leaf

Read `references/questioning-strategy.md` for the original research workflow and its response-free one-shot processing rules.

### For EVERY node:

1. **Research & Draft** — Compile from uploads + exhaustive official-site crawl + full-web enterprise intelligence. Include sourced images.
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
- **No bulk summarization.** Never skip a whole branch, collapse several real leaves into one node or infer facts merely to reach final packaging.
- **Source attribution** on every fact (宣传册/官网/行业调研).
- **Images alongside text** whenever relevant.
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

## Phase 4: Package & Deliver — Only at 100%

Read `references/output-format.md` for ZIP structure and markdown templates.

Enter this phase automatically only after the true leaf-node traversal reaches 100%. Generate ZIP with hierarchical folders, Markdown files per node, first-party images in `images/` subdirectories, separately labelled third-party reference assets, README, final knowledge-tree status, official-site crawl coverage report, full-web intelligence report, machine-readable raw `00_completeness.json`, image asset inventory and unresolved verification gaps. `00_completeness.json` must contain only status counts, acquisition completed/total pairs, gap strings and `evaluatedAt`; it must not contain a score, percentage, label, basis, caveat or derived applicable-leaf count. Deliver Markdown/ZIP immediately; never ask whether to generate, and never generate an interactive webpage or HTML research experience.

## Reference Files

- **`references/knowledge-tree.md`** — Original universal tree structure and industry variants, with only interaction statuses replaced by evidence/completion statuses. Read at Phase 2.
- **`references/questioning-strategy.md`** — Original pre-fill research workflow, with only confirmation/skip/reply behavior replaced by automatic evidence processing. Read at Phase 3.
- **`references/output-format.md`** — Original ZIP directory structure and Markdown templates, with only interactive progress text replaced by a final completion report. Read at Phase 4.
- **`references/source-manifest.json`** — SHA-256 provenance for the exact `socratic-kb-builder.skill` source archive.
