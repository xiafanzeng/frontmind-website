import { describe, expect, it } from "vitest";

import {
  findArchiveDescriptor,
  GEO_KNOWLEDGE_BASE_SUPPORT_DELAY_MS,
  knowledgeBaseTaskFailurePresentation,
  normalizeTask,
  normalizeTaskStatus,
  parseQuestionSetFromTask,
  questionSetQualityFromTask,
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
  it("delays running knowledge-base support guidance until 65 minutes", () => {
    expect(GEO_KNOWLEDGE_BASE_SUPPORT_DELAY_MS).toBe(65 * 60 * 1_000);
  });

  it.each([
    [
      "FILE_UPLOAD_CONFIRMATION_UNKNOWN",
      undefined,
      false,
      "向分析服务提交资料未完成",
    ],
    [
      "FILE_UPLOAD_OUTCOME_UNKNOWN",
      undefined,
      false,
      "向分析服务提交资料未完成",
    ],
    ["FILE_LEASE_PERSIST_FAILED", undefined, false, "向分析服务提交资料未完成"],
    ["CREATE_OUTCOME_UNKNOWN", undefined, false, "任务创建结果暂时无法确认"],
    [
      "PROVIDER_RUNTIME_FAILED",
      "2026-08-17T00:00:00.000Z",
      true,
      "请联系技术支持",
    ],
  ] as const)(
    "maps %s to a safe public knowledge-base failure",
    (code, providerStartedAt, supportRequired, message) => {
      expect(
        knowledgeBaseTaskFailurePresentation({
          localTaskId: "private-task",
          operationId: "private-operation",
          status: "failed",
          safeEvents: [],
          error: { code, retryable: false },
          ...(providerStartedAt ? { providerStartedAt } : {}),
        }),
      ).toMatchObject({
        supportRequired,
        message: expect.stringContaining(message),
      });
    },
  );

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
        .every((question) => question.selectable === true),
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

  it("displays safe partial and extended typed results but rejects zero content", () => {
    const partial = buildValidQuestionSet();
    partial.questions.pop();
    expect(
      parseQuestionSetFromTask(typedTask(partial))?.questions,
    ).toHaveLength(19);
    expect(questionSetQualityFromTask(typedTask(partial))).toMatchObject({
      completeness: "partial",
      stats: { acceptedCount: 19, expectedCount: 20 },
    });

    const extended = {
      ...buildValidQuestionSet(),
      debug: "must not cross the typed boundary",
    };
    expect(
      parseQuestionSetFromTask(typedTask(extended))?.questions,
    ).toHaveLength(20);
    expect(questionSetQualityFromTask(typedTask(extended))).toMatchObject({
      completeness: "partial",
      stats: { acceptedCount: 20 },
    });
    expect(questionSetValidationSummaryFromTask(typedTask(extended))).toContain(
      "Unrecognized key",
    );

    expect(parseQuestionSetFromTask(typedTask("```json\n{}\n```"))).toBeNull();
  });

  it("reclassifies ranking intent and locks it in a partial portfolio", () => {
    const set = buildValidQuestionSet();
    set.questions[0] = {
      ...set.questions[0],
      category: "reputation",
      selectable: true,
      question: "企业 GEO 服务商有哪些推荐？",
    };
    const parsed = parseQuestionSetFromTask(typedTask(set));
    expect(parsed?.questions).toHaveLength(20);
    expect(parsed?.questions[0]).toMatchObject({
      category: "industry_ranking",
      selectable: false,
    });
    expect(questionSetQualityFromTask(typedTask(set))?.completeness).toBe(
      "partial",
    );
  });

  it("caps a partial recommendation at 20 displayable questions and counts every overflow item as dropped", () => {
    const set = buildValidQuestionSet();
    const overflow = set.questions.slice(0, 5).map((question, index) => ({
      ...question,
      id: `overflow-${index + 1}`,
      question: question.question.replace(/？$/, `补充${index + 1}？`),
    }));
    const task = typedTask({ questions: [...set.questions, ...overflow] });

    expect(parseQuestionSetFromTask(task)?.questions).toHaveLength(20);
    expect(questionSetQualityFromTask(task)).toMatchObject({
      completeness: "partial",
      stats: {
        acceptedCount: 20,
        expectedCount: 20,
        droppedCount: 5,
      },
      warnings: [{ code: "RESULT_INCOMPLETE" }, { code: "ITEM_DROPPED" }],
    });
  });

  it("keeps a semantic category conflict visible but marks it unclassified and locked", () => {
    const parsed = parseQuestionSetFromTask(
      typedTask({
        questions: [
          {
            id: "reputation-01",
            category: "reputation",
            question: "Acme 与云杉科技相比有什么区别？",
            rationale: "保留这道问题供用户查看但不能直接进入付费监控。",
            enterpriseAnchor: "Acme",
            competitorAnchor: "云杉科技",
            evidenceRefs: ["08_competitive_advantages/acme-vs-yunshan.md"],
            selectable: true,
          },
        ],
      }),
    );

    expect(parsed?.questions).toEqual([
      expect.objectContaining({
        category: "reputation",
        classificationState: "unclassified",
        selectable: false,
      }),
    ]);
  });

  it.each([
    {
      name: "product category carrying reputation intent",
      item: {
        id: "product-scenario-01",
        category: "product_scenario",
        question: "Acme 靠谱吗？",
        rationale: "该问句实际表达企业口碑判断而不是产品能力问答。",
        enterpriseAnchor: "Acme",
        offeringAnchor: "Acme 服务",
        qaIntent: "offering_definition",
        evidenceRefs: ["03_products/acme-service.md"],
        selectable: true,
      },
    },
    {
      name: "reputation category carrying product intent",
      item: {
        id: "reputation-01",
        category: "reputation",
        question: "Acme 服务主要解决哪些业务问题？",
        rationale: "该问句实际表达产品定义而不是企业口碑判断。",
        enterpriseAnchor: "Acme",
        offeringAnchor: "Acme 服务",
        qaIntent: "offering_definition",
        evidenceRefs: ["03_products/acme-service.md"],
        selectable: true,
      },
    },
  ])("locks $name in the pending-classification bucket", ({ item }) => {
    const parsed = parseQuestionSetFromTask(typedTask({ questions: [item] }));

    expect(parsed?.questions).toEqual([
      expect.objectContaining({
        classificationState: "unclassified",
        selectable: false,
      }),
    ]);
  });

  it("computes complete-result selectableCount after deterministic ranking classification", () => {
    const set = buildValidQuestionSet();
    set.questions[0] = {
      ...set.questions[0],
      question: "Acme 在 GEO 服务商中的口碑排名好吗？",
    };

    const parsed = parseQuestionSetFromTask(typedTask(set));
    expect(parsed?.questions[0]).toMatchObject({
      category: "industry_ranking",
      selectable: true,
    });
    expect(questionSetQualityFromTask(typedTask(set))).toMatchObject({
      completeness: "complete",
      stats: { selectableCount: 20 },
    });
  });
});
