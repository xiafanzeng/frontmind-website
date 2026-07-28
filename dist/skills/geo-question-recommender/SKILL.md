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
4. Generate exactly five questions for each category: `reputation`, `product_scenario`, `industry_ranking`, and `competitor_comparison`.
5. Generate the five `product_scenario` items as enterprise product-and-service Q&A, using each `qaIntent` exactly once: `offering_definition`, `feature_mechanism`, `scenario_fit`, `delivery_usage`, and `support_boundary`.
6. Ground every question in one or more knowledge-base paths. Do not invent a competitor, certification, price, performance claim, ranking, product, function, scenario, or customer outcome.
7. Validate the complete JSON object against `references/output-schema.json`. Return JSON only, with no code fence, commentary, Markdown, or trailing text.

## Portfolio Rules

- Write natural Simplified Chinese in the way a real buyer would ask an AI assistant.
- Make every question specific to facts discovered in the ZIP.
- For every `product_scenario` item, include both the exact `enterpriseAnchor` and the exact `offeringAnchor` in the visible question. The offering anchor must identify a sourced product, service, module, solution, or named function—not only a generic industry term.
- Treat `product_scenario` as the enterprise's product-and-service FAQ, not as general industry education. Reject subjectless prompts such as “企业如何……”“品牌资料分散时如何……”“如何监控品牌……”“企业官网怎样……” or “如何用知识库……”.
- If the ZIP has only one offering, ask five distinct, evidence-supported Q&A intents about that offering. Never remove the enterprise or offering anchor merely to reach five items.
- Keep questions mutually distinct in both wording and search intent. Rephrasing the same question does not create a new item.
- Prefer decision-stage, reputation-check, scenario-fit, comparison, and recommendation intents over generic company-description prompts.
- Use `rationale` to state the optimization value, not to answer the question.
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

Before returning, count exactly twenty unique items and exactly five per category; verify category enums, ID prefixes, non-empty rationales and references, Chinese questions ending in `？`, and the required selectability rule. Verify that all five `product_scenario` questions contain their declared enterprise and offering anchors, use all five distinct `qaIntent` values exactly once, and cite at least one product, capability, scenario, or service evidence path.
