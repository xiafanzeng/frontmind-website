import { describe, expect, it } from "vitest";

import {
  findArchiveDescriptor,
  normalizeTask,
  normalizeTaskStatus,
  parseQuestionSetFromTask,
  questionSetValidationSummaryFromTask,
} from "./output";
import { buildValidQuestionSet } from "./question-set.test-fixture";

function typedTask(structuredResult: unknown) {
  return {
    localTaskId: "task-private",
    operationId: "operation-private",
    status: "succeeded" as const,
    safeEvents: [],
    result: { structuredResult, artifacts: [] },
  };
}

describe("Website v2 task output normalization", () => {
  it.each([
    ["queued", "queued"],
    ["running", "running"],
    ["result_pending", "waiting"],
    ["succeeded", "completed"],
    ["failed", "failed"],
    ["cancelled", "cancelled"],
    ["provider-new-state", "unknown"],
  ])("maps %s to %s without guessing Provider state", (input, expected) => {
    expect(normalizeTaskStatus(input)).toBe(expected);
  });

  it("exposes only the public task projection", () => {
    const normalized = normalizeTask(
      {
        localTaskId: "secret-task-id",
        operationId: "secret-operation-id",
        status: "running",
        safeEvents: [],
      },
      "knowledge-base",
    );
    expect(normalized).toEqual({
      id: "knowledge-base",
      status: "running",
      progress: null,
      title: undefined,
      output: [],
      error: undefined,
    });
    expect(JSON.stringify(normalized)).not.toContain("secret-");
  });

  it("selects a complete localized ZIP artifact", () => {
    expect(
      findArchiveDescriptor({
        result: {
          artifacts: [
            {
              artifactId: "artifact-kb",
              filename: "website-lead-candidate-v1.zip",
              mimeType: "application/zip",
              bytes: 2048,
              sha256: "a".repeat(64),
            },
          ],
        },
      }),
    ).toEqual({
      artifactId: "artifact-kb",
      filename: "website-lead-candidate-v1.zip",
    });
  });

  it("never reads Provider output, file IDs, URLs, user content, or metadata", () => {
    expect(
      findArchiveDescriptor({
        output: [{ file_id: "provider-file", url: "https://signed.example" }],
      }),
    ).toBeNull();
    expect(
      parseQuestionSetFromTask({
        output: [
          { role: "assistant", text: JSON.stringify(buildValidQuestionSet()) },
        ],
        metadata: { structuredResult: buildValidQuestionSet() },
      }),
    ).toBeNull();
  });

  it("accepts the exact typed recommendation portfolio", () => {
    const parsed = parseQuestionSetFromTask(typedTask(buildValidQuestionSet()));
    expect(parsed?.questions).toHaveLength(20);
    expect(
      parsed?.questions
        .filter((question) => question.category === "industry_ranking")
        .every((question) => question.selectable === false),
    ).toBe(true);
  });

  it("accepts Provider-required nulls only for Website-optional question fields", () => {
    const set = buildValidQuestionSet();
    const transportResult = {
      questions: set.questions.map((question) => ({
        ...question,
        questionEnglish: question.questionEnglish ?? null,
        enterpriseAnchor: question.enterpriseAnchor ?? null,
        offeringAnchor: question.offeringAnchor ?? null,
        competitorAnchor: question.competitorAnchor ?? null,
        qaIntent: question.qaIntent ?? null,
      })),
    };
    expect(
      parseQuestionSetFromTask(typedTask(transportResult))?.questions,
    ).toHaveLength(20);
  });

  it("fails closed on partial, extended, or malformed typed results", () => {
    const partial = buildValidQuestionSet();
    partial.questions.pop();
    expect(parseQuestionSetFromTask(typedTask(partial))).toBeNull();

    const extended = {
      ...buildValidQuestionSet(),
      debug: "must not cross the typed boundary",
    };
    expect(parseQuestionSetFromTask(typedTask(extended))).toBeNull();
    expect(questionSetValidationSummaryFromTask(typedTask(extended))).toContain(
      "Unrecognized key",
    );

    expect(parseQuestionSetFromTask(typedTask("```json\n{}\n```"))).toBeNull();
  });

  it("rejects a typed portfolio whose category totals are mislabeled", () => {
    const set = buildValidQuestionSet();
    set.questions[0] = {
      ...set.questions[0],
      category: "reputation",
      selectable: true,
      question: "企业 GEO 服务商有哪些推荐？",
    };
    expect(parseQuestionSetFromTask(typedTask(set))).toBeNull();
  });
});
