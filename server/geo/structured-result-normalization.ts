import type { PresalesContractName } from "./broker";

const RECOMMENDATION_OPTIONAL_FIELDS = [
  "questionEnglish",
  "enterpriseAnchor",
  "offeringAnchor",
  "competitorAnchor",
  "qaIntent",
] as const;

const CLASSIFIER_OPTIONAL_FIELDS = ["questionEnglish"] as const;

const ASSESSMENT_PLATFORM_OPTIONAL_FIELDS = [
  "sourceCount",
  "citationCount",
  "referenceCount",
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function omitWhitelistedNulls(
  value: unknown,
  fields: readonly string[],
): unknown {
  const record = asRecord(value);
  if (!record || !fields.some((field) => record[field] === null)) return value;
  const normalized = { ...record };
  for (const field of fields) {
    if (normalized[field] === null) delete normalized[field];
  }
  return normalized;
}

function normalizeRecommendation(value: unknown): unknown {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.questions)) return value;
  const sourceQuestions = record.questions;
  const questions = sourceQuestions.map((question) =>
    omitWhitelistedNulls(question, RECOMMENDATION_OPTIONAL_FIELDS),
  );
  return questions.some(
    (question, index) => question !== sourceQuestions[index],
  )
    ? { ...record, questions }
    : value;
}

function normalizeAssessment(value: unknown): unknown {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.platformBreakdown)) return value;
  const sourcePlatforms = record.platformBreakdown;
  const platformBreakdown = sourcePlatforms.map((platform) =>
    omitWhitelistedNulls(platform, ASSESSMENT_PLATFORM_OPTIONAL_FIELDS),
  );
  return platformBreakdown.some(
    (platform, index) => platform !== sourcePlatforms[index],
  )
    ? { ...record, platformBreakdown }
    : value;
}

/**
 * Manus requires every Structured Output object property to be required, so
 * transport-only optional values arrive as explicit null. Convert only the
 * fields that the corresponding Website Zod contract marks optional. Business
 * nulls (scores, ranks, evidence coordinates, and v2-required narratives) are
 * deliberately preserved for the strict domain validators.
 */
export function normalizePresalesStructuredResult(
  contractName: Exclude<
    PresalesContractName,
    "website.knowledge-base-candidate"
  >,
  value: unknown,
): unknown {
  switch (contractName) {
    case "website.question-recommendation":
      return normalizeRecommendation(value);
    case "website.custom-question-classifier":
      return omitWhitelistedNulls(value, CLASSIFIER_OPTIONAL_FIELDS);
    case "website.current-state-assessment":
      return normalizeAssessment(value);
    case "website.optimization-forecast":
    case "website.monitor-question-translation":
      return value;
  }
}
