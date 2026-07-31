# Conditional GEO Outcome Forecast Methodology

This method preserves FrontMind Report Workflow S5.5 scoring and S9 action planning while adding the missing forecasting controls. The source workflow stores 12-week targets but does not derive or validate them, so this skill converts the planning window into a bounded first-month full-execution range, emits headroom-closure intervals only, and leaves target values and all weighted scoring to the server.

## Scope

The forecast belongs to one selected question and its selected monitoring platforms. It is not a complete brand, market, or industry forecast. A target becomes an observed result only after the same question, platform set, and five repeats per platform are monitored again.

## Preserved BSAS Indicators

| Dimension             | Indicator                    | Weight | Typical action IDs     | Effect boundary                        |
| --------------------- | ---------------------------- | -----: | ---------------------- | -------------------------------------- |
| Semantic visibility   | AI search visibility         |     15 | GEO_A2, GEO_A3, GEO_A6 | observed outcome                       |
| Semantic visibility   | Web search share of voice    |     10 | GEO_A2, GEO_A3, GEO_A6 | observed outcome                       |
| Semantic visibility   | Multi-platform coverage      |      5 | GEO_A3, GEO_A6         | observed outcome                       |
| Semantic coherence    | Core proposition hit rate    |     12 | GEO_A1, GEO_A3, GEO_A4 | observed outcome                       |
| Semantic coherence    | Tone consistency             |      8 | GEO_A4                 | direct asset, then observed validation |
| Semantic richness     | Question-stage coverage      |     10 | GEO_A3, GEO_A5         | direct asset                           |
| Semantic richness     | Semantic-entity richness     |      6 | GEO_A1, GEO_A3         | direct asset                           |
| Semantic richness     | Content-format diversity     |      4 | GEO_A3, GEO_A6         | direct asset                           |
| Semantic authority    | Authoritative-source ratio   |      8 | GEO_A6                 | observed outcome                       |
| Semantic authority    | Structured-data completeness |      4 | GEO_A5                 | direct asset                           |
| Semantic authority    | Third-party endorsement      |      3 | GEO_A6                 | observed outcome                       |
| Competitive advantage | First-mention rate           |      8 | GEO_A2, GEO_A6         | observed outcome                       |
| Competitive advantage | Exclusive semantic space     |      7 | GEO_A3, GEO_A4, GEO_A6 | observed outcome                       |

The server calculates `target raw = baseline raw + (1 - baseline raw) × gap closure`, then calculates `indicator score = clamp(target raw, 0, 1) × weight`, sums indicators into dimension scores of 30/20/20/15/15, and sums dimensions to 100. The model must not perform or return this calculation.

The server retains two score ledgers:

- **Raw weighted score:** always keeps the original 100-point BSAS weights. This is the audit ledger.
- **Applicable-scope score:** normalizes the raw weighted score over the maximum still applicable to the selected question. Only service-enforced structural exclusions may reduce this denominator. An ordinary `unavailable` indicator remains zero and must not reduce the denominator.

Grades shown for a question-level conditional target may use the applicable-scope score, while the raw score remains attached for audit. This does not turn the result into a full-domain BSAS audit.

## Allowed Action IDs

- `GEO_A1_entity_facts`: repair enterprise entity, product, qualification, case, and proof assets.
- `GEO_A2_ai_visibility`: repair question-level mention, recommendation, and competitive visibility gaps.
- `GEO_A3_qa_assets`: build question, scenario, comparison, FAQ, and answer-ready content assets.
- `GEO_A4_positioning_language`: align positioning, reasons-to-believe, terminology, and reusable answer language.
- `GEO_A5_site_schema`: improve official pages, entity pages, internal links, and Organization/Product/Service/FAQPage structured data.
- `GEO_A6_distribution_citations`: establish publication, independent authority, directory, media, case, and citation paths.

## One-Month Full-Execution Qualified Target

The standard scenario represents completion of all six FrontMind action groups, not passive waiting for organic change. The server therefore enforces an applicable-scope target low bound of at least 60/100 whenever the current applicable score is below 60. The high bound is at least 66/100 and remains conditional on delivery and week-4 verification. When the current score is already 60 or higher, the server applies the grade-based incremental band without lowering the current score.

This is a planning target, not a claim that an external platform has already adopted the work. Direct assets are checked through delivery evidence; observed outcomes remain subject to publication, crawl/index success, independent uptake, and same-scope remeasurement.

## Effect-Specific Full-Execution Bands

| Effect type        | Low closure target | High closure target | Boundary                                                     |
| ------------------ | -----------------: | ------------------: | ------------------------------------------------------------ |
| `direct_asset`     |               0.75 |                0.95 | FrontMind-controlled assets, subject to delivery check       |
| `observed_outcome` |               0.55 |                0.75 | External uptake requiring week-4 same-scope remeasurement    |

Use these bands for the declared full-execution scenario. Do not return null or zero-to-zero ranges. If a current raw value is unavailable, keep the current value unknown, use the action-backed target band, lower confidence, and name the delivery or observation gate.

## Forecast Rules

1. Start from the server-scored baseline and its raw indicators. Never reconstruct current scores from prose.
2. Map every indicator to an auditable build-and-measure path under `full_execution`. An unavailable current value remains unknown but still receives an action-backed target and verification gate.
3. A direct asset target may describe work under FrontMind control, such as a completed facts page or Schema coverage, but it still requires delivery verification.
4. An observed outcome target depends on publication, crawl/index success, third-party adoption, answer-engine update cycles, and remeasurement. It must stay inside the observed-outcome closure ceiling.
5. Gap-closure low and high describe the share of remaining 0-1 headroom that could be closed under the stated scenario. They are not score deltas or uplift percentages. The server derives targets from the current raw value.
6. Use the fixed full-execution bands. Express uncertainty through confidence, dependencies, and verification metrics rather than suppressing a dimension.
7. Evidence references must point to stable assessment paths, knowledge-base relative paths, comparison IDs, or priority-action IDs.
8. Do not infer revenue, lead volume, consultation conversion, or market share from BSAS.

## Grade Interpretation

- Preserve the raw 100-point score and raw grade for audit.
- Use the applicable-scope score only when the service has recorded a structural exclusion and its excluded maximum.
- Never remove arbitrary missing evidence from the applicable denominator.
- A B grade reached only at the high bound must be described as a challenge upper bound. Do not call it the expected result.
- When the current applicable score is below 60, the completed full-execution plan must target at least 60/100. The server enforces this qualified planning floor; the model must provide all thirteen action mappings needed to support it.

## Reputation Exclusion

For brand-named reputation, complaint, defect, risk, or reliability questions, the prompt itself forces a brand mention. Do not forecast visibility, multi-platform brand coverage, first-mention, rank, Top3, or Top5 improvement from such samples. `exclusiveSemanticSpace` remains distinct from ranking and may receive a bounded observed-outcome range only when the baseline measured or derived verified differentiator clarity, the knowledge base supplies the evidence set, and the execution scenario contains mapped positioning, Q&A, or distribution actions. Coherence, factual accuracy, answer completeness, authority, and knowledge gaps may still be assessed where evidence supports them.

## Partial Samples

A partial monitoring set is eligible only when the current assessment explicitly states that the user accepted it. Preserve successful and failed counts in limitations, reduce confidence, and never imply that missing platforms behaved like successful ones.

## Four-Phase Roadmap

1. Week 1: verify and repair entity facts, positioning, terminology, proof, and compliance boundaries.
2. Week 2: build question-led content, evidence pages, official-site structure, and Schema.
3. Week 3: publish and distribute through suitable owned and independent authority paths; start crawl and index checks.
4. Week 4: verify delivery and early external signals, repeat monitoring with the identical question/platform/repeat scope, and revise the next-month plan.

## Claim Language

Use: “一个月条件目标区间”, “在以下执行前提成立时”, “结果以同口径复测数据为准”, and “预估”.

Avoid: “保证提升”, “优化后一定达到”, “必然被推荐”, “全行业第一”, “确定带来营收”, or any fixed achieved-score phrasing before remeasurement.
