---
name: geo-question-recommender
description: "Analyze a completed enterprise knowledge-base ZIP and generate exactly twenty Chinese GEO optimization questions as strict JSON: five reputation/public-opinion questions, five enterprise-anchored product-and-service Q&A questions, five disabled industry-ranking questions, and five competitor-comparison questions. Use after the FrontMind website one-shot knowledge-base build when grounded, non-duplicative, evidence-linked question recommendations are required."
---

# GEO Question Recommender

Generate a constrained question portfolio from the supplied enterprise knowledge-base ZIP. Read `references/demark-question-logic.md` and `references/output-schema.json` in full before generating.

## Workflow

1. Extract and read the knowledge tree, company overview, product/service pages, capabilities, industries, competitive advantages, service information, source index, and unresolved verification gaps.
2. Build a fact map containing company/brand names, product and service names, buyer groups, application scenarios, differentiators, certifications, quality evidence, pricing/contact paths, support policies, competitors, and industry/category terms.
3. Build an offering registry for product Q&A. For each sourced offering, record an exact enterprise/brand anchor, an exact product/service/module/function anchor, buyer or scenario facts, supported delivery or usage facts, and its ZIP-relative evidence path.
4. Build at least eight candidate intents for each category before selecting the final five. A candidate is a tuple of `subject anchor + decision intent + evidence fact + natural question`. Never create a numbered template and substitute only the number, category enum, product name, or competitor name.
5. Select exactly five questions for each category: `reputation`, `product_scenario`, `industry_ranking`, and `competitor_comparison`. The five selected items in one category must cover five different decision intents from the category matrix below.
6. Generate the five `product_scenario` items as enterprise product-and-service Q&A, using each `qaIntent` exactly once: `offering_definition`, `feature_mechanism`, `scenario_fit`, `delivery_usage`, and `support_boundary`.
7. Ground every question in one or more knowledge-base paths. Do not invent a competitor, certification, price, performance claim, ranking, product, function, scenario, or customer outcome.
8. Validate the complete JSON object against `references/output-schema.json`, then run the anti-placeholder and diversity checks below. Return JSON only, with no code fence, commentary, Markdown, or trailing text.

## Five-question intent matrices

Use each row exactly once for the matching category. If one row lacks evidence, use another evidence-supported intent from the same category, but the replacement must remain different in both wording and customer decision.

### `reputation`

1. Enterprise or brand background: origin, team, history, official identity, or research/production foundation.
2. Credibility evidence: qualification, certification, patent, award, public recognition, customer proof, or documented case.
3. Product or delivery reliability: quality, stability, implementation capability, fulfillment, or verifiable performance boundary.
4. Safety and risk: data security, compliance, privacy, authenticity, complaint, uncertainty, or purchase risk.
5. Service reputation: support, warranty, maintenance, response, long-term service, or public evaluation.

### `industry_ranking`

1. Category shortlist: which brands, companies, products, platforms, or service providers are worth considering.
2. Scenario recommendation: which providers or solutions suit a sourced buyer, industry, task, or deployment environment.
3. Selection comparison set: which representative alternatives should enter a buyer's evaluation list.
4. Ranking or leading-player discovery: a natural ranking, Top-N, leading-provider, or mainstream-solution question.
5. Segment discovery: a sourced region, technology route, service model, or subcategory recommendation question.

Every item in this category must genuinely be an open ranking, shortlist, or recommendation question. Do not put ordinary category education, definitions, trends, or product FAQs here merely to fill five slots.

### `competitor_comparison`

1. Core capability, function, specification, or technical-route comparison.
2. Buyer, industry, task, or scenario-fit comparison.
3. Deployment, integration, operation, implementation, or delivery comparison.
4. Cost structure, efficiency, commercial model, or resource trade-off, only when the evidence permits asking about it.
5. Service boundary, support, risk, ecosystem, localization, or long-term-operation comparison.

When the ZIP contains only one named competitor or one sourced alternative type, the five questions may compare the same pair only if they use five genuinely different dimensions.

## Portfolio Rules

- Write natural Simplified Chinese in the way a real buyer would ask an AI assistant.
- Make every question specific to facts discovered in the ZIP.
- For every `product_scenario` item, include both the exact `enterpriseAnchor` and the exact `offeringAnchor` in the visible question. The offering anchor must identify a sourced product, service, module, solution, or named function—not only a generic industry term.
- Treat `product_scenario` as the enterprise's product-and-service FAQ, not as general industry education. Reject subjectless prompts such as “企业如何……”“品牌资料分散时如何……”“如何监控品牌……”“企业官网怎样……” or “如何用知识库……”.
- If the ZIP has only one offering, ask five distinct, evidence-supported Q&A intents about that offering. Never remove the enterprise or offering anchor merely to reach five items.
- Keep questions mutually distinct in both wording and search intent. Rephrasing the same question does not create a new item.
- Never expose internal enum names such as `reputation`, `product_scenario`, `industry_ranking`, or `competitor_comparison` in customer-visible questions or rationales.
- Never write placeholder structures such as “第 1 个问题”“第 N 个问题”“某方面的问题”“测试问题” or “值得优化吗”.
- Do not use one sentence frame five times with only an offering, competitor, category, adjective, or sequence number changed.
- Prefer decision-stage, reputation-check, scenario-fit, comparison, and recommendation intents over generic company-description prompts.
- Use `rationale` to state the question-specific optimization value, not to answer the question. Every rationale must identify the distinct customer decision and evidence opportunity of that item; do not reuse one generic rationale across multiple items.
- Use `evidenceRefs` as exact ZIP-relative Markdown paths, optionally suffixed with a heading. Each item needs at least one reference.
- For every `product_scenario` item, include at least one evidence path under `03_products/`, `04_technology/`, `05_manufacturing/`, `06_industries/`, or `07_service/`. A source-index-only reference is not sufficient.
- Set `selectable` to `false` for every `industry_ranking` item and `true` for every other item.
- Use stable IDs `reputation-01` through `reputation-05`, `product-scenario-01` through `product-scenario-05`, `industry-ranking-01` through `industry-ranking-05`, and `competitor-comparison-01` through `competitor-comparison-05`.

## Evidence Limits

- If the ZIP lacks a named competitor, create comparison questions around a sourced alternative type or buying trade-off; never fabricate a brand name.
- If a detail is marked `needs_verification`, the question may ask about that uncertainty but `rationale` must not assert it as fact.
- Do not use third-party imagery or unsupported marketing language as factual grounding.
- Do not include operational instructions, answers, scoring, prices for GEO services, platform choices, payment text, or contact calls to action.

## Final Check

Before returning:

1. Count exactly twenty items and exactly five per category.
2. Verify category enums, ID prefixes, non-empty rationales and references, Chinese questions ending in `？`, and the required selectability rule.
3. Verify that all five `product_scenario` questions contain their declared enterprise and offering anchors, use all five distinct `qaIntent` values exactly once, and cite at least one product, capability, scenario, or service evidence path.
4. Remove enterprise names, offering names, competitor names, category names, adjectives, and numbers from each question temporarily. If two remaining sentence skeletons are the same, rewrite one from a different customer intent.
5. Confirm that no question or rationale contains an internal category enum, a sequence-number placeholder, “测试问题”, or “值得优化吗”.
6. Confirm that all twenty rationales are specific rather than repeated boilerplate.
7. Read the final twenty questions aloud as customer-visible Chinese. Reject any item that sounds like a schema field, test fixture, unfinished template, or translated internal label.
