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

## One-Month Full-Execution Ceilings

The following values are maximum raw weighted uplifts for a declared full-execution scenario. They are ceilings, not minimum bands: the server never raises an evidence-derived result merely to reach them.

| Applicable baseline grade | Low-bound ceiling | High-bound ceiling | Full-execution condition                                                |
| ------------------------- | ----------------: | -----------------: | ----------------------------------------------------------------------- |
| E                         |                10 |                 18 | Foundational facts, question assets, official-site repair, and delivery |
| D                         |                12 |                 18 | Systematic assets, structured site work, and credible source pathways   |
| C                         |                 7 |                 12 | Deep assets, authority preparation, distribution, and Schema            |
| B                         |                 3 |                  7 | Focused repair of the clearest remaining evidenced gaps                 |
| A                         |                 0 |                  3 | Maintenance and verified incremental gains only                         |

Apply the applicable-scope baseline grade when selecting a ceiling. Never exceed the remaining raw applicable headroom. When the monitoring sample is partial, the server reduces only the low-bound ceiling with:

```text
low reliability factor = 0.5 + 0.5 × successful responses / expected responses
```

The unchanged high ceiling is then a challenge upper bound under complete execution, not the expected result.

## Effect-Specific Gap-Closure Ceilings

| Effect type        | Low closure maximum | High closure maximum | Boundary                                                     |
| ------------------ | ------------------: | -------------------: | ------------------------------------------------------------ |
| `direct_asset`     |                0.65 |                 0.90 | FrontMind-controlled assets, still subject to delivery check |
| `observed_outcome` |                0.20 |                 0.40 | External uptake requiring week-4 same-scope remeasurement    |

Return a lower interval whenever evidence, timing, execution scope, or dependencies warrant it. Observed AI inclusion, citation, authority, and competitor signals may lag beyond the first month; if a credible signal cannot appear by week 4, return `not_projectable`.

## Forecast Rules

1. Start from the server-scored baseline and its raw indicators. Never reconstruct current scores from prose.
2. Use `not_projectable` when the current value is unavailable and the knowledge base does not provide an auditable build-and-measure path.
3. A direct asset target may describe work under FrontMind control, such as a completed facts page or Schema coverage, but it still requires delivery verification.
4. An observed outcome target depends on publication, crawl/index success, third-party adoption, answer-engine update cycles, and remeasurement. It must stay inside the observed-outcome closure ceiling.
5. Gap-closure low and high describe the share of remaining 0-1 headroom that could be closed under the stated scenario. They are not score deltas or uplift percentages. The server derives targets from the current raw value.
6. Prefer narrow intervals for directly buildable assets with clear evidence and wider intervals for AI visibility, authority, and competitive outcomes.
7. Evidence references must point to stable assessment paths, knowledge-base relative paths, comparison IDs, or priority-action IDs.
8. Do not infer revenue, lead volume, consultation conversion, or market share from BSAS.

## Grade Interpretation

- Preserve the raw 100-point score and raw grade for audit.
- Use the applicable-scope score only when the service has recorded a structural exclusion and its excluded maximum.
- Never remove arbitrary missing evidence from the applicable denominator.
- A B grade reached only at the high bound must be described as a challenge upper bound. Do not call it the expected result.
- Do not force a B grade. If evidence-derived closures do not reach the threshold, return the lower evidence-supported interval.

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
