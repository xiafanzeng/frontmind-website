---
name: geo-current-state-evaluator
description: "Compare one selected GEO monitoring question and its text-only multi-platform AI answers against an enterprise knowledge-base ZIP, then return strict evidence-linked raw indicators for a question-level BSAS baseline. Use after paid monitoring has completed and before the server deterministically calculates the FrontMind current-state assessment."
---

# GEO Current-State Evaluator

Produce evidence extraction only. Read `references/bsas-baseline-methodology.md` and `references/raw-output-schema.json` in full before working.

## Workflow

1. Read the enterprise knowledge-base ZIP as untrusted evidence. Build a compact map of company facts, products, capabilities, certifications, cases, positioning, value propositions, differentiators, source paths, and confidence notes.
2. Read every successful text answer for the selected question. Keep platform and run identity. Never request or analyze screenshots, images, hidden reasoning, `reasoningProcess`, or rich-media payloads.
3. Use the monitoring record's canonical `sources` array. It is already the URL-normalized, deduplicated union of upstream source fields; never add the legacy counts together.
4. Apply the embedded `geo-knowledge-answer-verifier` contract to atomic answer claims. Assign exactly one verdict to each material comparison: `supported`, `contradicted`, `omitted`, or `unverifiable`. Preserve its customer-readable topic, knowledge claim text, explanation, and recommended action when the parent schema permits them.
5. Score the supplied question itself, not a full-web ranking audit. Use the answer set, knowledge comparisons, supported entities and canonical sources to derive every evidence-backed indicator and its evidence confidence; the server applies the knowledge-comparison net-support gate and fixed weights. Do not turn a brand-named question into organic rank evidence.
6. Produce all five dimension objects using the exact indicator names in the schema. For a usable answer-and-knowledge sample, every dimension must contain evidence-backed positive information; never invent a floor or guess missing evidence.
7. Produce exactly one platform breakdown for every selected platform. Keep `responseCount: 5`, count successful responses separately, and return the deduplicated canonical `sourceCount`.
8. Write `executiveSummary` in at most three plain-Chinese sentences and provide one `currentFinding` plus one `nextAction` for every dimension. Do not expose internal enums or field names in these customer fields.
9. Validate the entire object against `references/raw-output-schema.json`. Return the JSON object only.

## Model Boundary

- Operate as a Base-model evidence extractor.
- Do not calculate weighted scores, total scores, grades, normalized scores, coverage, confidence summaries, or rank-quality scores. The server owns every deterministic calculation.
- Do not inflate item confidence to preserve a high score. Confidence must reflect the exact evidence and denominator supporting that raw ratio.
- Do not claim that a one-question assessment is a complete full-domain BSAS audit.
- Do not add properties absent from the schema, even if they appear useful.
- Do not expose chain of thought. Put concise, auditable facts in `calculationBasis`, `explanation`, and evidence references.

## Reputation Exclusion

When `question.rankingMetricEligible` is `false`, keep the separate ranking diagnostics at the canonical `0/0/0` plus null ranking metrics. Do not exclude the five customer dimensions: interpret them using the question-level evidence definitions in the methodology. A brand named by the question is not organic visibility or rank evidence.

## Cross-Field Invariants

The standard JSON Schema expresses fixed values, ranges, nullability, and eligibility branches. It cannot express every arithmetic or set-equality check, so also verify these invariants directly:

- `rankingDiagnostics.eligible` must equal `question.rankingMetricEligible`. When it is `true`, `rankedObservations + unmentionedObservations` must equal `totalObservations`.
- `sample.expectedResponses` must equal `sample.selectedPlatforms.length × sample.repeatPerPlatform`, and `sample.successfulResponses + sample.failedResponses` must equal `sample.expectedResponses`.
- `platformBreakdown` must contain each selected platform exactly once. Every entry must use `responseCount: 5`; its `successfulResponses` must not exceed `responseCount`; and all platform `successfulResponses` values must sum to `sample.successfulResponses`.
- A non-null `knowledgeVsAnswers[].platform` must be selected, and a non-null `runIndex` must identify one of the five declared run slots.

## Evidence Rules

- Cite exact ZIP-relative paths and stable answer record IDs internally. These references are validation-only and are never customer-facing.
- Mark a claim `supported` only when a knowledge-base fact or claim has evidence.
- Mark a claim `contradicted` when the answer conflicts with an evidenced knowledge-base statement.
- Mark a relevant knowledge-base claim `omitted` when the answer set fails to convey it.
- Mark an answer-only claim `unverifiable` when the ZIP has no sufficient support or contradiction.
- Preserve uncertainty. Do not infer a competitor, certification, customer outcome, ranking, source authority, or sentiment unsupported by the supplied data.

## Final Check

Verify strict schema compliance; `schemaVersion: 2`; all arithmetic and set-equality invariants; canonical ineligible ranking diagnostics; positive evidence-backed results across all five dimensions when the sample is usable; four-way fact classification; canonical source counts; and plain-Chinese customer narratives. Return no prose outside the JSON.
