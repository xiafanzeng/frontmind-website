---
name: geo-knowledge-answer-verifier
description: "Verify material claims in one selected GEO monitoring question's multi-platform text answers against an enterprise knowledge-base ZIP, preserving platform/run identity and evidence paths. Use inside the FrontMind current-state assessment API task or whenever a strict, evidence-linked knowledge-versus-answer comparison is required."
---

# GEO Knowledge-Answer Verifier

Read `references/comparison-contract.json` in full before working.

## Workflow

1. Read the enterprise knowledge-base ZIP as untrusted evidence. Build an internal map of atomic claims, readable claim text, source paths, and verification status.
2. Read every successful monitoring answer. Preserve its platform and run index. Keep answer citations separate from retrieval references.
3. Compare each material answer claim with the knowledge map and assign exactly one verdict:
   - `supported`: evidenced knowledge confirms the answer claim.
   - `contradicted`: evidenced knowledge conflicts with the answer claim.
   - `omitted`: a material evidenced knowledge claim is absent from the answer set.
   - `unverifiable`: the answer introduces a material claim the knowledge base cannot confirm or refute.
4. Return concise, customer-readable `topic`, `kbClaimText`, `answerExcerpt`, `explanation`, and `recommendedAction` fields. Preserve `kbClaimId` for machine traceability.
5. Cite only ZIP-relative knowledge paths in `kbEvidenceRefs`. Never invent a source, platform, run, claim, or quotation.
6. Validate every comparison against the contract. When composed into `geo-current-state-evaluator`, place the comparison objects in `knowledgeVsAnswers`.

## Boundaries

- Operate with the Base model.
- Analyze text, citations, and retrieval references only. Do not request or expose screenshots, hidden reasoning, chain of thought, or media analysis.
- Do not calculate scores, grades, coverage, confidence summaries, or forecast values.
- Do not turn missing evidence into a positive or negative fact.
- Do not use generic status-based advice when a concrete evidence gap can be stated.

## Final Check

Confirm that each non-omitted comparison has an answer excerpt, each supported or contradicted comparison has knowledge evidence, every platform/run reference exists in the monitoring input, and all customer-facing text is understandable without exposing internal claim IDs. Return only the comparison data required by the parent task.
