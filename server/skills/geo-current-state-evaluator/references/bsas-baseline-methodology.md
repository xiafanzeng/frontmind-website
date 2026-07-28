# Question-Level BSAS Baseline Methodology

This reference preserves the scoring rules needed from FrontMind Report Workflow S5/S5.5 while narrowing the scope to one selected question and its monitoring answers. It excludes full-report orchestration, PDF production, downstream content planning, and unrelated research stages.

## Scope Boundary

The result is a `question_baseline`, not a complete BSAS audit. A full audit additionally requires broad web search, social and vertical-platform scanning, all five question stages, content-format analysis, industry normalization, and at least three competitors. Mark unsupported indicators unavailable instead of inventing those inputs.

The Base model emits raw evidence only. Server code clamps each numeric raw value to 0-1, multiplies it by the preserved weight, assigns missing indicators zero points, and separately discloses measurement coverage.

## Preserved Five-Dimension Weights

| Dimension             | Indicator                    | Weight |
| --------------------- | ---------------------------- | -----: |
| Semantic visibility   | AI search visibility         |     15 |
| Semantic visibility   | Web search share of voice    |     10 |
| Semantic visibility   | Multi-platform coverage      |      5 |
| Semantic coherence    | Core proposition hit rate    |     12 |
| Semantic coherence    | Tone consistency             |      8 |
| Semantic richness     | Question-stage coverage      |     10 |
| Semantic richness     | Semantic-entity richness     |      6 |
| Semantic richness     | Content-format diversity     |      4 |
| Semantic authority    | Authoritative-source ratio   |      8 |
| Semantic authority    | Structured-data completeness |      4 |
| Semantic authority    | Third-party endorsement      |      3 |
| Competitive advantage | First-mention rate           |      8 |
| Competitive advantage | Exclusive semantic space     |      7 |

Dimension maxima are 30, 20, 20, 15, and 15. Total maximum is 100. Server-side grade thresholds are A ≥ 80, B ≥ 60, C ≥ 40, D ≥ 20, and E below 20.

## Raw Indicator Contract

- `measured`: directly countable from supplied records or knowledge-base artifacts.
- `derived`: requires semantic comparison while retaining evidence references and a concise calculation basis.
- `unavailable`: evidence is insufficient; use `rawValue: null`, confidence 0, and explain the limitation.
- Use a positive 0-1 value for every available metric. Values outside 0-1 are invalid model behavior but remain safely clamped by the server.
- `toneConsistency` means `1 - deviationRate`. A 0.8 raw value earns 80% of its eight-point weight; never invert it a second time.

## Single-Question Derivation Guidance

- AI search visibility: organic brand mentions divided by successful, ranking-eligible answers.
- Multi-platform coverage: platforms with an organic brand mention divided by successfully observed selected platforms. State this selected-platform denominator.
- Core proposition hit rate: relevant evidenced positioning/value/differentiator claims accurately conveyed in answers divided by relevant evaluated claims.
- Semantic-entity richness: unique answer entities supported by relevant knowledge-base entities divided by the stated knowledge-base baseline. Do not call it an industry benchmark.
- Authoritative-source ratio: authoritative entries in `citationList` divided by all usable `citationList` entries.
- First-mention rate: ranking-eligible answers in which the brand appears first divided by eligible answers.
- Exclusive semantic space: question-relevant, knowledge-base-evidenced differentiators clearly and accurately conveyed in the answers divided by the relevant evidenced differentiators evaluated. This is a differentiator-clarity measure, not a rank measure, and may be derived for a brand-named question when the evidence set is auditable.
- Web SOV, structured data, content formats, and third-party endorsement may be measured only when the ZIP includes direct auditable evidence.

## Reputation and Ranking Exclusion

Questions about a named brand's defects, complaints, risks, reputation, reliability, or negative issues are not ranking-eligible. The named brand's appearance is caused by the prompt and must not enter visibility, average rank, Top3/Top5, first-mention, platform brand coverage, or competitor-rank calculations. Keep the answers for sentiment, severity, factual accuracy, citation, knowledge-gap analysis, and evidenced differentiator clarity. `exclusiveSemanticSpace` may therefore remain scoreable when it measures whether answers convey verified distinctive advantages; it must not be presented as ranking or organic competitive share.

For eligible questions, ranking quality is a non-additive diagnostic only:

```text
rankQuality = 0.40×Top3Rate + 0.30×Top5Rate
            + 0.20×averageRankQuality + 0.10×competitorGapQuality
```

It never changes the 100-point BSAS total.

## Citation Boundary

- `citationList`: sources actually cited by an answer; use for citation and authority metrics.
- `referenceList`: pages returned or inspected during retrieval; use only for retrieval coverage.
- Never merge the two arrays, use one as fallback for the other, or describe every retrieval reference as an actual citation.

## Knowledge-Answer Comparison

Use the knowledge base's facts, claims, and evidence as the comparison anchor:

- `supported`: answer claim matches an evidenced knowledge-base fact or claim.
- `contradicted`: answer claim conflicts with an evidenced knowledge-base fact or claim.
- `omitted`: a question-relevant evidenced knowledge-base claim is absent from the answer set.
- `unverifiable`: answer introduces a material claim that the knowledge base can neither support nor contradict.

Retain the answer excerpt, knowledge claim identifier when applicable, knowledge evidence paths, platform/run reference, explanation, and confidence. Do not treat a missing knowledge-base fact as proof that the answer is false.
