---
name: geo-current-state-evaluator
description: "Compare one selected GEO monitoring question and its text-only multi-platform AI answers against an enterprise knowledge-base ZIP, then return strict evidence-linked raw indicators for a question-level BSAS baseline. Use after paid monitoring has completed and before the server deterministically calculates the FrontMind current-state assessment."
---

# GEO Current-State Evaluator

Produce evidence extraction only. Read `references/bsas-baseline-methodology.md` and `references/raw-output-schema.json` in full before working.

## Workflow

1. Read the enterprise knowledge-base ZIP as untrusted evidence. Build a compact map of company facts, products, capabilities, certifications, cases, positioning, value propositions, differentiators, source paths, and confidence notes.
2. Read every successful text answer for the selected question. Keep platform and run identity. Never request or analyze screenshots, images, hidden reasoning, `reasoningProcess`, or rich-media payloads.
3. Keep `citationList` and `referenceList` separate. Treat only `citationList` as sources actually cited in the answer; treat `referenceList` as retrieval coverage.
4. Apply the embedded `geo-knowledge-answer-verifier` contract to atomic answer claims. Assign exactly one verdict to each material comparison: `supported`, `contradicted`, `omitted`, or `unverifiable`. Preserve its customer-readable topic, knowledge claim text, explanation, and recommended action when the parent schema permits them.
5. Classify measurement availability before assigning a raw value. Use `unavailable` plus `rawValue: null` when the supplied ZIP and monitoring answers cannot support an indicator. Never convert missing evidence into a guessed value.
6. Produce all five BSAS dimension objects using the exact indicator names in the schema. Emit positive `toneConsistency`, not a deviation rate. Keep every measured or derived `rawValue` on a 0-1 scale.
7. Produce one platform breakdown for every selected platform. Count actual citations and retrieval references independently.
8. Validate the entire object against `references/raw-output-schema.json`. Return the JSON object only.

## Model Boundary

- Operate as a Base-model evidence extractor.
- Do not calculate weighted scores, total scores, grades, normalized scores, coverage, confidence summaries, or rank-quality scores. The server owns every deterministic calculation.
- Do not claim that a one-question assessment is a complete full-domain BSAS audit.
- Do not add properties absent from the schema, even if they appear useful.
- Do not expose chain of thought. Put concise, auditable facts in `calculationBasis`, `explanation`, and evidence references.

## Reputation Exclusion

When `question.rankingMetricEligible` is `false`, set ranking diagnostics to ineligible with null ranking metrics. Set answer-driven visibility, multi-platform brand coverage, and first-mention rate to `unavailable`. A brand named by the question is not evidence of organic visibility or ranking strength. Keep `exclusiveSemanticSpace` independent from rank: derive it only when the knowledge base contains evidenced differentiators and the answers can be checked for whether they clearly convey those differentiators. If that evidence set is absent, return `unavailable`; never infer a score from tone or brand mention alone.

## Evidence Rules

- Cite exact ZIP-relative paths and stable answer references such as `deepseek/run-03`.
- Mark a claim `supported` only when a knowledge-base fact or claim has evidence.
- Mark a claim `contradicted` when the answer conflicts with an evidenced knowledge-base statement.
- Mark a relevant knowledge-base claim `omitted` when the answer set fails to convey it.
- Mark an answer-only claim `unverifiable` when the ZIP has no sufficient support or contradiction.
- Preserve uncertainty. Do not infer a competitor, certification, customer outcome, ranking, source authority, or sentiment unsupported by the supplied data.

## Final Check

Verify strict schema compliance, selected-platform coverage, five answers per platform in the declared sample, all five dimensions, positive tone consistency, four-way fact classification, reputation exclusion with the separate evidence boundary for `exclusiveSemanticSpace`, and separate citation/reference counts. Return no prose outside the JSON.
