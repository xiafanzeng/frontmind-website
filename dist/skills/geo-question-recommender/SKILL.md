---
name: geo-question-recommender
description: "Analyze a completed enterprise knowledge-base ZIP and generate exactly twenty Chinese GEO optimization questions as strict JSON: five reputation/public-opinion questions, five enterprise-anchored product-and-service Q&A questions, five disabled industry-ranking questions, and five competitor-comparison questions. Use after the FrontMind website one-shot knowledge-base build when grounded, non-duplicative, evidence-linked question recommendations are required."
---

# GEO Question Recommender

Generate a constrained question portfolio from the supplied enterprise knowledge-base ZIP. Read `references/demark-question-logic.md` and `references/output-schema.json` in full before generating.

Run this Skill only with the `frontmind-pro` model profile. Do not downgrade question generation to `frontmind-base`.

## Workflow

1. Extract and read the knowledge tree, company overview, product/service pages, capabilities, industries, competitive advantages, service information, source index, and unresolved verification gaps.
2. Build a fact map containing company/brand names, product and service names, buyer groups, application scenarios, differentiators, certifications, quality evidence, pricing/contact paths, support policies, competitors, and industry/category terms. If the ZIP has no named competitor, use the sourced industry/category and offering facts to identify real competitor brands from trustworthy public knowledge or public-web research during this same task.
3. Build an offering registry for product Q&A. For each sourced offering, record an exact enterprise/brand anchor, an exact product/service/module/function anchor, buyer or scenario facts, supported delivery or usage facts, and its ZIP-relative evidence path.
4. Build at least eight candidate intents for each category before selecting the final five. A candidate is a tuple of `subject anchor + decision intent + evidence fact + natural question`. Never create a numbered template and substitute only the number, category enum, product name, or competitor name.
5. Select exactly five questions for each category: `reputation`, `product_scenario`, `industry_ranking`, and `competitor_comparison`. The five selected items in one category must cover five different decision intents from the category matrix below.
6. Generate the five `reputation` items as direct customer judgments. Every item must declare `enterpriseAnchor`, reproduce it exactly in the visible question, and naturally ask whether the brand is reliable, stable, safe, well supported, or well regarded.
7. Generate the five `product_scenario` items as enterprise product-and-service Q&A, using each `qaIntent` exactly once: `offering_definition`, `feature_mechanism`, `scenario_fit`, `delivery_usage`, and `support_boundary`.
8. Ground current-enterprise facts, offerings, scenarios, and reputation intents in the knowledge-base paths. Do not invent a certification, price, performance claim, ranking, product, function, scenario, customer outcome, or comparison result. A neutral comparison question may use a real competitor brand established by trustworthy public knowledge or public-web research even when that brand is absent from the ZIP.
9. Include the current company or brand in all five `competitor_comparison` questions through `enterpriseAnchor`. Every item must also declare a different `competitorAnchor` containing an explicit real competitor company or brand. Prefer ZIP evidence; otherwise use trustworthy public knowledge or research without stopping the task. Reproduce both declared anchors exactly in every visible question. Do not use a generic product or solution comparison in this category.
10. Validate the complete JSON object against `references/output-schema.json`, then run the anti-placeholder and diversity checks below. Return JSON only, with no code fence, commentary, Markdown, or trailing text.

## Five-question intent matrices

Use each row exactly once for the matching category. If one row lacks evidence, use another evidence-supported intent from the same category, but the replacement must remain different in both wording and customer decision.

### `reputation`

1. Overall trust: whether the enterprise or brand is reliable, trustworthy, legitimate, or worth choosing.
2. Product or delivery reliability: whether its product, platform, quality, stability, implementation, or fulfillment is dependable.
3. Safety and risk: whether its data protection, privacy, compliance, authenticity, or purchase risk is acceptable.
4. Service reputation: whether its support, warranty, maintenance, response, or after-sales service is good.
5. Customer or public reputation: what customers think of it, whether complaints are common, or how its market reputation is perceived.

Every item must be phrased as a real reputation judgment such as “靠谱吗？” “稳定吗？” “安全吗？” “售后服务好吗？” or “口碑怎么样？”. Background, history, team, certifications, patents, awards, customer cases, and official channels may support an answer but must not become fact-retrieval questions such as “背景是什么？” “获得了哪些认证？” “如何验证？” or “提供哪些渠道？”.

### `industry_ranking`

1. Category shortlist: which brands, companies, products, platforms, or service providers are worth considering.
2. Scenario recommendation: which providers or solutions suit a sourced buyer, industry, task, or deployment environment.
3. Selection comparison set: which representative alternatives should enter a buyer's evaluation list.
4. Ranking or leading-player discovery: a natural ranking, Top-N, leading-provider, or mainstream-solution question.
5. Segment discovery: a sourced region, technology route, service model, or subcategory recommendation question.

Every item in this category must genuinely be an open ranking, shortlist, or recommendation question. Do not put ordinary category education, definitions, trends, or product FAQs here merely to fill five slots.
Natural shortlist wording such as “哪些服务商更适合？” “应把哪些厂商纳入选型名单？” or “应优先考察哪些厂商？” is valid open recommendation intent.

### `competitor_comparison`

1. Core capability, function, specification, or technical-route comparison.
2. Buyer, industry, task, or scenario-fit comparison.
3. Deployment, integration, operation, implementation, or delivery comparison.
4. Cost structure, efficiency, commercial model, or resource trade-off, only when the evidence permits asking about it.
5. Service boundary, support, risk, ecosystem, localization, or long-term-operation comparison.

All five questions must explicitly name the current enterprise or brand through `enterpriseAnchor` and a different real competitor company or brand through `competitorAnchor`. Prefer five different competitor brands when the ZIP or trustworthy public knowledge supports them. If only one competitor can be identified with high confidence, five questions may compare the same pair only when they use five genuinely different customer decisions. Generic labels such as “同类平台”“传统方案”“原生接口” or “自建集群” are not allowed as comparison targets.
Natural comparison wording such as “应如何评估 A 与 B 的服务覆盖？” is valid when both anchors are explicit and the question asks for a shared decision dimension without asserting a winner.

## Portfolio Rules

- Write natural Simplified Chinese in the way a real buyer would ask an AI assistant.
- Write each question as one short and direct sentence with one core intent. Never use the Chinese comma `，` or ASCII comma `,` in a customer-visible question.
- Make every question specific to facts discovered in the ZIP, except that a competitor identity may be supplemented from trustworthy public knowledge or research as described above.
- For every `reputation` item, include the exact `enterpriseAnchor` in the visible question and ask for a direct trust, reliability, safety, service-quality, or reputation judgment. Reject company-profile and evidence-list prompts even when their answers could support reputation.
- For every `product_scenario` item, include both the exact `enterpriseAnchor` and the exact `offeringAnchor` in the visible question. The offering anchor must identify a sourced product, service, module, solution, or named function—not only a generic industry term.
- Treat `product_scenario` as the enterprise's product-and-service FAQ, not as general industry education. Reject subjectless prompts such as “企业如何……”“品牌资料分散时如何……”“如何监控品牌……”“企业官网怎样……” or “如何用知识库……”.
- If the ZIP has only one offering, ask five distinct, evidence-supported Q&A intents about that offering. Never remove the enterprise or offering anchor merely to reach five items.
- Keep questions mutually distinct in both wording and search intent. Rephrasing the same question does not create a new item.
- Never expose internal enum names such as `reputation`, `product_scenario`, `industry_ranking`, or `competitor_comparison` in customer-visible questions or rationales.
- Never write placeholder structures such as “第 1 个问题”“第 N 个问题”“某方面的问题”“测试问题” or “值得优化吗”.
- Do not use one sentence frame five times with only an offering, competitor, category, adjective, or sequence number changed.
- Prefer decision-stage, reputation-check, scenario-fit, comparison, and recommendation intents over generic company-description prompts.
- Use `rationale` to state the question-specific optimization value, not to answer the question. Every rationale must identify the distinct customer decision and evidence opportunity of that item; do not reuse one generic rationale across multiple items.
- Use `evidenceRefs` as exact ZIP-relative Markdown paths, optionally suffixed with a heading. A competitor-comparison item may additionally include an absolute HTTPS public source used to establish competitor identity. Each item needs at least one ZIP-relative reference for the current enterprise, category, offering, or scenario.
- For every `product_scenario` item, include at least one evidence path under `03_products/`, `04_technology/`, `05_manufacturing/`, `06_industries/`, or `07_service/`. A source-index-only reference is not sufficient.
- For all five `competitor_comparison` items, include `enterpriseAnchor` with the current sourced enterprise or brand name and a different `competitorAnchor` with a real competitor company or brand name supported by the ZIP, trustworthy public knowledge, or public-web research. Reproduce both anchors exactly in the visible question. Never use the current enterprise, a product type, or a generic alternative as `competitorAnchor`.
- Set `selectable` to `false` for every `industry_ranking` item and `true` for every other item.
- Use stable IDs `reputation-01` through `reputation-05`, `product-scenario-01` through `product-scenario-05`, `industry-ranking-01` through `industry-ranking-05`, and `competitor-comparison-01` through `competitor-comparison-05`.

## Evidence Limits

- Never stop, return a `blocked`/`status`/error object, ask for more input, or request knowledge-base regeneration merely because D08 or the ZIP contains no named competitor.
- When the ZIP contains no named competitor, identify explicit real competitor brands from the sourced category using trustworthy public-web research in this same task. If public-web research is unavailable, use only broadly known competitor relationships held with high confidence. A neutral question asks what the differences are; it must not imply an unsupported winner, defect, price, performance level, or comparison result.
- Prefer five different competitor brands when confidence permits. If only one real competitor is sufficiently certain, reuse that brand across five genuinely different decision intents rather than inventing brands or returning fewer than twenty questions.
- If a detail is marked `needs_verification`, the question may ask about that uncertainty but `rationale` must not assert it as fact.
- Do not use third-party imagery or unsupported marketing language as factual grounding.
- Do not include operational instructions, answers, scoring, prices for GEO services, platform choices, payment text, or contact calls to action.

## Final Check

Before returning:

1. Count exactly twenty items and exactly five per category.
2. Verify category enums, ID prefixes, non-empty rationales and references, Chinese questions ending in `？`, and the required selectability rule.
3. Verify that all five `reputation` questions contain their exact declared `enterpriseAnchor` and sound like direct judgments about reliability, stability, safety, service quality, or reputation. Reject fact-retrieval questions about background, certifications, verification methods, or official channels.
4. Verify that all five `product_scenario` questions contain their declared enterprise and offering anchors, use all five distinct `qaIntent` values exactly once, and cite at least one product, capability, scenario, or service evidence path.
5. Remove enterprise names, offering names, competitor names, category names, adjectives, and numbers from each question temporarily. If two remaining sentence skeletons are the same, rewrite one from a different customer intent.
6. Confirm that no question or rationale contains an internal category enum, a sequence-number placeholder, “测试问题”, or “值得优化吗”.
7. Confirm that all twenty rationales are specific rather than repeated boilerplate.
8. Read the final twenty questions aloud as customer-visible Chinese. Reject any item that sounds like a schema field, test fixture, unfinished template, or translated internal label.
9. Confirm that no question contains `，` or `,` and that every question expresses only one core intent in a direct sentence.
10. Confirm that all five competitor-comparison questions contain their exact declared `enterpriseAnchor` and an exact `competitorAnchor` identifying a different brand. Reject every generic product or solution comparison.
11. Confirm that the final object contains `questions` and never contains a top-level `status`, `code`, `reason`, or evidence-audit-only response. Missing D08 evidence is not a permitted reason to omit the twenty questions.
