import fs from "node:fs";
import path from "node:path";
import Ajv2020, { type AnySchema } from "ajv/dist/2020.js";
import { beforeAll, describe, expect, it } from "vitest";
import { buildValidQuestionSet } from "../../geo/question-set.test-fixture";

const schemaPath = path.resolve(
  process.cwd(),
  "server/skills/geo-question-recommender/references/output-schema.json",
);

function transportQuestionSet() {
  return {
    questions: buildValidQuestionSet().questions.map((question) => ({
      id: question.id,
      category: question.category,
      question: question.question,
      questionEnglish: null,
      rationale: question.rationale,
      enterpriseAnchor: question.enterpriseAnchor ?? null,
      offeringAnchor: question.offeringAnchor ?? null,
      competitorAnchor: question.competitorAnchor ?? null,
      qaIntent: question.qaIntent ?? null,
      evidenceRefs: question.evidenceRefs,
      selectable: question.selectable,
    })),
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("geo-question-recommender transport output schema", () => {
  let validate: ReturnType<Ajv2020["compile"]>;

  beforeAll(() => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8")) as AnySchema;
    validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  });

  it("accepts the canonical 20-question result with exactly 11 keys per item", () => {
    const output = transportQuestionSet();

    expect(validate(output), validate.errors).toBe(true);
    expect(Object.keys(output.questions[0]!)).toEqual([
      "id",
      "category",
      "question",
      "questionEnglish",
      "rationale",
      "enterpriseAnchor",
      "offeringAnchor",
      "competitorAnchor",
      "qaIntent",
      "evidenceRefs",
      "selectable",
    ]);
  });

  it("requires every transport key, including explicit questionEnglish null", () => {
    const output = transportQuestionSet();
    delete (output.questions[0] as Partial<(typeof output.questions)[number]>)
      .questionEnglish;

    expect(validate(output)).toBe(false);
  });

  it("requires applicable anchors and keeps inapplicable fields null", () => {
    const missingReputationAnchor = transportQuestionSet();
    missingReputationAnchor.questions[0]!.enterpriseAnchor = null;
    expect(validate(missingReputationAnchor)).toBe(false);

    const nullableProductIntent = transportQuestionSet();
    nullableProductIntent.questions[5]!.qaIntent = null;
    expect(validate(nullableProductIntent)).toBe(false);

    const industryWithEnterpriseAnchor = transportQuestionSet();
    industryWithEnterpriseAnchor.questions[10]!.enterpriseAnchor = "Acme";
    expect(validate(industryWithEnterpriseAnchor)).toBe(false);

    const competitorWithoutAnchor = transportQuestionSet();
    competitorWithoutAnchor.questions[15]!.competitorAnchor = null;
    expect(validate(competitorWithoutAnchor)).toBe(false);

    const competitorWithGenericAnchor = clone(transportQuestionSet());
    competitorWithGenericAnchor.questions[15]!.competitorAnchor = "竞品";
    expect(validate(competitorWithGenericAnchor)).toBe(false);
  });
});
