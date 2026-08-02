# Question-Level BSAS Baseline Methodology

This reference preserves the scoring rules needed from FrontMind Report Workflow S5/S5.5 while narrowing the scope to one selected question and its monitoring answers. It excludes full-report orchestration, PDF production, downstream content planning, and unrelated research stages.

## Scope Boundary

The result is a `question_baseline_v2`, not a complete BSAS audit. A full audit additionally requires broad web search, social and vertical-platform scanning, all five question stages, content-format analysis, industry normalization, and at least three competitors. Every v2 indicator below is measurable from the current question, five answer slots, packaged knowledge evidence, and canonical sources. If those inputs are incomplete, fail validation instead of emitting a publishable score.

The Base model emits raw evidence only. Server code clamps each numeric raw value to 0-1 and preserves the Report Workflow rule `raw evidence ratio × fixed weight`. To publish a conservative single-question lower bound, seven knowledge-dependent indicators are capped by the knowledge-comparison net support rate: `max(0, (supported - contradicted) / all comparisons)`. Omitted and unverifiable items stay in the denominator. Missing evidence is a validation failure, not a synthetic zero.

## Preserved Five-Dimension Weights

| Dimension             | Indicator                        | Weight |
| --------------------- | -------------------------------- | -----: |
| Semantic visibility   | Accurate recognition coverage    |     15 |
| Semantic visibility   | Brand-evidence coverage          |     10 |
| Semantic visibility   | Valid-sample coverage            |      5 |
| Semantic coherence    | Core proposition hit rate        |     12 |
| Semantic coherence    | Tone consistency                 |      8 |
| Semantic richness     | Key-aspect coverage              |     10 |
| Semantic richness     | Supported-entity coverage        |      6 |
| Semantic richness     | Answer-layer completeness        |      4 |
| Semantic authority    | Authoritative-source ratio       |      8 |
| Semantic authority    | Material-claim traceability      |      4 |
| Semantic authority    | Independent-evidence coverage    |      3 |
| Competitive advantage | Verified-differentiator coverage |      8 |
| Competitive advantage | Differentiation accuracy         |      7 |

Dimension maxima are 30, 20, 20, 15, and 15. Total maximum is 100. Server-side grade thresholds are A ≥ 80, B ≥ 60, C ≥ 40, D ≥ 20, and E below 20.

## Raw Indicator Contract

- `measured`: directly countable from supplied records or knowledge-base artifacts.
- `derived`: requires semantic comparison while retaining evidence references and a concise calculation basis.
- `confidence` measures how strongly the supplied answers, knowledge comparisons, canonical sources, and denominator support that exact raw ratio. It is not writing confidence. Every publishable v2 indicator requires positive confidence; use lower confidence when the evidence base is narrow, contains unverifiable claims, or depends on semantic judgment.
- Use an evidence-backed value in the inclusive 0-1 range for every metric. A genuine measured zero remains zero; never add a minimum score or floor. Values outside 0-1 are invalid model behavior but remain safely clamped by the server.
- `toneConsistency` means `1 - deviationRate`. A 0.8 raw value earns 80% of its eight-point weight; never invert it a second time.

## Single-Question Derivation Guidance

- Accurate recognition coverage: successful answers that correctly identify the company, category and question-relevant capability divided by successful answers.
- Brand-evidence coverage: supported question-relevant brand claims conveyed in answers divided by the supported claims evaluated.
- Valid-sample coverage: successful run slots divided by expected run slots. The server recomputes this ratio.
- Core proposition hit rate: relevant evidenced positioning/value/differentiator claims accurately conveyed in answers divided by relevant evaluated claims.
- Key-aspect coverage uses six fixed aspects: subject identity, capabilities/models, delivery/deployment, qualification/compliance boundaries, operating/use risks, and procurement checks.
- Answer-layer completeness uses five fixed layers: conclusion, advantages, applicable scenarios, risk boundaries, and verification advice.
- Authoritative-source ratio uses the canonical `sources` collection. Material-claim traceability and independent-evidence coverage use both canonical sources and packaged knowledge evidence.
- Verified-differentiator coverage and differentiation accuracy measure only knowledge-base-evidenced differentiators; they are not ranking metrics.
- Apply the server evidence gate to brand-evidence coverage, core-proposition hit rate, key-aspect coverage, supported-entity coverage, material-claim traceability, verified-differentiator coverage, and differentiation accuracy. Recognition, sample completion, tone, answer layers, source authority, and independent-evidence indicators retain their directly measured ratios.
- Derive confidence conservatively from the same evidence ledger. In particular, contradicted or unverifiable comparisons, missing answer sources, narrow platform coverage, and small denominators must reduce the affected indicator confidence rather than being hidden in prose limitations.

## Reputation and Ranking Exclusion

Questions about a named brand's defects, complaints, risks, reputation, reliability, or negative issues are not ranking-eligible. The named brand's appearance is caused by the prompt and must not enter average rank, Top3/Top5, first-mention, organic share, or competitor-rank calculations. The v2 visibility dimension remains scoreable because it measures accurate recognition, evidence coverage, and valid sample coverage—not natural ranking. Keep the answers for sentiment, severity, factual accuracy, source quality, knowledge-gap analysis, and evidenced differentiator clarity. Competitive-advantage indicators remain scoreable only when they measure verified differentiators and expression accuracy; they must not be presented as ranking or organic competitive share.

For eligible questions, ranking quality is a non-additive diagnostic only:

```text
rankQuality = 0.40×Top3Rate + 0.30×Top5Rate
            + 0.20×averageRankQuality + 0.10×competitorGapQuality
```

It never changes the 100-point BSAS total.

## Canonical Source Boundary

- `sources` is the single normalized and deduplicated source collection supplied by the monitoring adapter.
- Count a normalized URL once. When URL is absent, deduplicate by title plus domain.
- Do not reconstruct or sum legacy upstream arrays.

## Knowledge-Answer Comparison

Use the knowledge base's facts, claims, and evidence as the comparison anchor:

- `supported`: answer claim matches an evidenced knowledge-base fact or claim.
- `contradicted`: answer claim conflicts with an evidenced knowledge-base fact or claim.
- `omitted`: a question-relevant evidenced knowledge-base claim is absent from the answer set.
- `unverifiable`: answer introduces a material claim that the knowledge base can neither support nor contradict.

Retain the answer excerpt, knowledge claim identifier when applicable, knowledge evidence paths, platform/run reference, explanation, and confidence. Do not treat a missing knowledge-base fact as proof that the answer is false.
