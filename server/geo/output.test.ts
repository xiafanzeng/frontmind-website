import { describe, expect, it } from "vitest";
import {
  findArchiveDescriptor,
  normalizeTask,
  normalizeTaskStatus,
  parseQuestionSetFromTask,
} from "./output";
import { buildValidQuestionSet } from "./question-set.test-fixture";

function questionSet() {
  return buildValidQuestionSet();
}

describe("GEO task output normalization", () => {
  it.each(["completed", "complete", "succeeded", "done", "finished"])(
    "normalizes the upstream terminal status %s",
    (status) => {
      expect(normalizeTaskStatus(status)).toBe("completed");
    },
  );

  it("keeps an unrecognized status explicit", () => {
    expect(normalizeTaskStatus("provider-new-terminal-state")).toBe("unknown");
  });

  it("normalizes fractional task progress before percentage values", () => {
    expect(
      normalizeTask({ status: "running", progress: 0.5 }, "knowledge-base")
        .progress,
    ).toBe(50);
    expect(
      normalizeTask({ status: "running", progress: 52 }, "knowledge-base")
        .progress,
    ).toBe(52);
  });

  it("finds a ZIP descriptor nested in task output", () => {
    expect(
      findArchiveDescriptor({
        output: [
          {
            role: "assistant",
            content: [
              { type: "output_file", file_id: "file-1", filename: "Acme.zip" },
            ],
          },
        ],
      }),
    ).toEqual({ fileId: "file-1", url: undefined, filename: "Acme.zip" });
  });

  it("never treats user content or task metadata as a generated archive", () => {
    expect(
      findArchiveDescriptor({
        output: [
          {
            role: "user",
            content: [
              {
                type: "output_file",
                file_id: "uploaded-zip",
                filename: "uploaded.zip",
              },
            ],
          },
          {
            type: "reasoning",
            metadata: {
              type: "output_file",
              file_id: "metadata-zip",
              filename: "metadata.zip",
            },
          },
        ],
      }),
    ).toBeNull();
  });

  it("parses strict question JSON from a fenced assistant response", () => {
    const parsed = parseQuestionSetFromTask({
      output: [
        {
          role: "assistant",
          content: [
            { text: `\`\`\`json\n${JSON.stringify(questionSet())}\n\`\`\`` },
          ],
        },
      ],
    });
    expect(parsed?.questions).toHaveLength(20);
    expect(
      parsed?.questions
        .filter((item) => item.category === "industry_ranking")
        .every((item) => !item.selectable),
    ).toBe(true);
  });

  it("keeps renderable generic product Q&A output", () => {
    const generic = questionSet();
    generic.questions[5] = {
      ...generic.questions[5],
      question: "企业如何系统搭建可被 AI 理解的知识库？",
    };

    const parsed = parseQuestionSetFromTask({
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify(generic) }],
        },
      ],
    });

    expect(parsed?.questions).toHaveLength(20);
    expect(parsed?.questions[5].question).toBe(
      "企业如何系统搭建可被 AI 理解的知识库？",
    );
  });

  it("keeps generated questions containing a comma", () => {
    const indirect = questionSet();
    indirect.questions[0] = {
      ...indirect.questions[0],
      question: "Acme 的企业背景如何，团队是否可靠？",
    };

    const parsed = parseQuestionSetFromTask({
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify(indirect) }],
        },
      ],
    });

    expect(parsed?.questions[0].question).toBe(
      "Acme 的企业背景如何，团队是否可靠？",
    );
  });

  it("keeps comparisons when optional competitor metadata is missing", () => {
    const genericComparisons = questionSet();
    for (const item of genericComparisons.questions.filter(
      (question) => question.category === "competitor_comparison",
    )) {
      delete item.competitorAnchor;
    }

    const parsed = parseQuestionSetFromTask({
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify(genericComparisons) }],
        },
      ],
    });

    expect(parsed?.questions).toHaveLength(20);
    expect(
      parsed?.questions
        .filter((item) => item.category === "competitor_comparison")
        .every((item) => item.competitorAnchor === undefined),
    ).toBe(true);
  });

  it("keeps a comparison when its metadata does not match the wording", () => {
    const missingAnchor = questionSet();
    const comparison = missingAnchor.questions.find(
      (question) => question.category === "competitor_comparison",
    );
    if (!comparison) throw new Error("missing comparison fixture");
    comparison.competitorAnchor = "未出现在题面中的品牌";

    const parsed = parseQuestionSetFromTask({
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify(missingAnchor) }],
        },
      ],
    });

    expect(parsed?.questions).toHaveLength(20);
  });

  it("accepts a natural 有何不同 competitor question", () => {
    const naturalComparison = questionSet();
    const comparison = naturalComparison.questions.find(
      (question) => question.category === "competitor_comparison",
    );
    if (!comparison) throw new Error("missing comparison fixture");
    comparison.question = comparison.question.replace("有什么区别", "有何不同");

    expect(
      parseQuestionSetFromTask({
        output: [
          {
            role: "assistant",
            content: [{ text: JSON.stringify(naturalComparison) }],
          },
        ],
      }),
    ).not.toBeNull();
  });

  it("accepts comparison wording with the evaluation phrase after both brands", () => {
    const naturalComparison = questionSet();
    const comparison = naturalComparison.questions.find(
      (question) => question.id === "competitor-comparison-04",
    );
    if (!comparison) throw new Error("missing comparison fixture");
    comparison.question =
      "硅基流动和腾讯云TokenHub的多模型调用计费结构应如何评估？";
    comparison.enterpriseAnchor = "硅基流动";
    comparison.competitorAnchor = "腾讯云TokenHub";

    const parsed = parseQuestionSetFromTask({
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify(naturalComparison) }],
        },
      ],
    });

    expect(parsed?.questions).toHaveLength(20);
    expect(
      parsed?.questions.find(
        (question) => question.id === "competitor-comparison-04",
      )?.question,
    ).toBe(comparison.question);
  });

  it("keeps a comparison without a competitor anchor", () => {
    const missingCompetitor = questionSet();
    const comparison = missingCompetitor.questions.find(
      (question) => question.category === "competitor_comparison",
    );
    if (!comparison) throw new Error("missing comparison fixture");
    delete comparison.competitorAnchor;

    const parsed = parseQuestionSetFromTask({
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify(missingCompetitor) }],
        },
      ],
    });

    expect(parsed?.questions).toHaveLength(20);
  });

  it("keeps a comparison without an enterprise anchor", () => {
    const missingEnterprise = questionSet();
    const comparison = missingEnterprise.questions.find(
      (question) => question.category === "competitor_comparison",
    );
    if (!comparison) throw new Error("missing comparison fixture");
    delete comparison.enterpriseAnchor;

    const parsed = parseQuestionSetFromTask({
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify(missingEnterprise) }],
        },
      ],
    });

    expect(parsed?.questions).toHaveLength(20);
  });

  it("keeps a renderable self-comparison instead of failing the portfolio", () => {
    const selfComparison = questionSet();
    const comparison = selfComparison.questions.find(
      (question) => question.category === "competitor_comparison",
    );
    if (!comparison) throw new Error("missing comparison fixture");
    comparison.competitorAnchor = comparison.enterpriseAnchor;

    const parsed = parseQuestionSetFromTask({
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify(selfComparison) }],
        },
      ],
    });

    expect(parsed?.questions).toHaveLength(20);
  });

  it("keeps a generic comparison target as a quality issue only", () => {
    const genericAnchor = questionSet();
    const comparison = genericAnchor.questions.find(
      (question) => question.category === "competitor_comparison",
    );
    if (!comparison) throw new Error("missing comparison fixture");
    comparison.question = comparison.question.replace("云杉科技", "同类平台");
    comparison.competitorAnchor = "同类平台";

    const parsed = parseQuestionSetFromTask({
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify(genericAnchor) }],
        },
      ],
    });

    expect(parsed?.questions).toHaveLength(20);
  });

  it("salvages partial question output and repairs operational fields", () => {
    const parsed = parseQuestionSetFromTask({
      output: [
        {
          role: "assistant",
          content: [
            {
              text: JSON.stringify({
                questions: [
                  {
                    id: "custom-hidden",
                    category: "product",
                    question: "这个产品适合哪些客户？",
                    selectable: false,
                    ignoredField: "ignored",
                  },
                  {
                    id: "duplicate-id",
                    category: "product_scenario",
                    question: "大模型 API 服务商 Top 10 有哪些？",
                    selectable: true,
                  },
                  {
                    id: "duplicate-id",
                    category: "future_category",
                    text: "这个问题虽然缺少辅助字段但仍可展示？",
                  },
                  { question: "   " },
                ],
              }),
            },
          ],
        },
      ],
    });

    expect(parsed?.questions).toHaveLength(3);
    expect(new Set(parsed?.questions.map((item) => item.id)).size).toBe(3);
    expect(parsed?.questions[0]).toMatchObject({
      id: "product-scenario-01",
      category: "product_scenario",
      selectable: false,
      evidenceRefs: [],
    });
    expect(parsed?.questions[1]).toMatchObject({
      category: "industry_ranking",
      selectable: false,
    });
    expect(parsed?.questions[2]).toMatchObject({
      id: "industry-ranking-02",
      category: "industry_ranking",
      selectable: false,
    });
    expect(
      parsed?.questions.every((item) => !item.id.startsWith("custom-")),
    ).toBe(true);
  });

  it("locks questions when canonical ids conflict with category metadata", () => {
    const parsed = parseQuestionSetFromTask({
      output: [
        {
          role: "assistant",
          content: [
            {
              text: JSON.stringify({
                questions: [
                  {
                    id: "reputation-01",
                    category: "qa",
                    question: "Acme 靠谱吗？",
                  },
                  {
                    id: "competitor-comparison-01",
                    category: "product_scenario",
                    question: "Acme 的服务方案适合哪些企业？",
                  },
                ],
              }),
            },
          ],
        },
      ],
    });

    expect(parsed?.questions[0]).toMatchObject({
      id: "industry-ranking-01",
      category: "industry_ranking",
      selectable: false,
    });
    expect(parsed?.questions[1]).toMatchObject({
      id: "industry-ranking-02",
      category: "industry_ranking",
      selectable: false,
    });
  });

  it("accepts a bare assistant JSON array and caps recommendations at twenty", () => {
    const source = Array.from(
      { length: 25 },
      (_, index) => `可展示问题 ${index + 1}？`,
    );
    const parsed = parseQuestionSetFromTask({
      output: [
        {
          role: "assistant",
          content: [{ text: `生成结果如下：\n${JSON.stringify(source)}` }],
        },
      ],
    });

    expect(parsed?.questions).toHaveLength(20);
    expect(parsed?.questions[19].question).toBe("可展示问题 20？");
  });

  it("does not mistake a nested evidence array for a question list", () => {
    expect(
      parseQuestionSetFromTask({
        output: [
          {
            role: "assistant",
            content: [
              {
                text: JSON.stringify({
                  evidenceRefs: ["internal/source.md"],
                }),
              },
            ],
          },
        ],
      }),
    ).toBeNull();
  });

  it("extracts the final JSON result when one assistant text contains a draft", () => {
    const finalResult = buildValidQuestionSet("FinalCo");
    const parsed = parseQuestionSetFromTask({
      output: [
        {
          role: "assistant",
          content: [
            {
              text: [
                "草稿：",
                JSON.stringify({
                  questions: [{ question: "这是较早的不完整草稿？" }],
                }),
                "最终结果：",
                JSON.stringify(finalResult),
              ].join("\n"),
            },
          ],
        },
      ],
    });

    expect(parsed).toEqual(finalResult);
  });

  it("prefers a later strict result over an earlier relaxed draft", () => {
    const finalResult = questionSet();
    const parsed = parseQuestionSetFromTask({
      output: [
        {
          role: "assistant",
          content: [
            {
              text: JSON.stringify({
                questions: [{ question: "这是较早的不完整草稿？" }],
              }),
            },
            { text: JSON.stringify(finalResult) },
          ],
        },
      ],
    });

    expect(parsed).toEqual(finalResult);
  });

  it("prefers the latest result when multiple candidates are strict", () => {
    const earlier = buildValidQuestionSet("DraftCo");
    const finalResult = buildValidQuestionSet("FinalCo");
    const parsed = parseQuestionSetFromTask({
      output: [
        {
          role: "assistant",
          content: [
            { text: JSON.stringify(earlier) },
            { text: JSON.stringify(finalResult) },
          ],
        },
      ],
    });

    expect(parsed).toEqual(finalResult);
  });

  it("prefers more renderable questions when every candidate needs relaxation", () => {
    const shortDraft = {
      questions: [
        { category: "reputation", question: "品牌是否值得信赖？" },
        { category: "product_scenario", question: "产品适合什么场景？" },
        { category: "industry_ranking", question: "行业品牌有哪些推荐？" },
        {
          category: "competitor_comparison",
          question: "品牌与另一方案如何选择？",
        },
      ],
    };
    const fullerResult = {
      questions: Array.from({ length: 20 }, (_, index) => ({
        category: "product_scenario",
        question: `可展示的完整候选问题 ${index + 1}？`,
      })),
    };
    const parsed = parseQuestionSetFromTask({
      output: [
        {
          role: "assistant",
          content: [
            { text: JSON.stringify(shortDraft) },
            { text: JSON.stringify(fullerResult) },
          ],
        },
      ],
    });

    expect(parsed?.questions).toHaveLength(20);
    expect(parsed?.questions[0].question).toBe("可展示的完整候选问题 1？");
  });

  it("locks ranking intent even when a strict result mislabels its category", () => {
    const mislabeled = questionSet();
    mislabeled.questions[5].question =
      "Acme 服务模块 1 所在行业 Top 10 服务商有哪些？";

    const parsed = parseQuestionSetFromTask({
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify(mislabeled) }],
        },
      ],
    });

    expect(parsed?.questions[5]).toMatchObject({
      category: "industry_ranking",
      selectable: false,
    });
  });

  it("caps relaxed question text at the monitoring contract limit", () => {
    const parsed = parseQuestionSetFromTask({
      output: [
        {
          role: "assistant",
          content: [
            {
              text: JSON.stringify({
                questions: [
                  {
                    category: "product_scenario",
                    question: `这是一个仍应展示的长问题${"很长".repeat(120)}？`,
                  },
                  {
                    category: "product_scenario",
                    question: `${"问".repeat(199)} 后缀？`,
                  },
                ],
              }),
            },
          ],
        },
      ],
    });

    for (const question of parsed?.questions ?? []) {
      expect(question.question.length).toBeGreaterThan(0);
      expect(question.question.length).toBeLessThanOrEqual(200);
      expect(question.question.endsWith(" ")).toBe(false);
    }
    expect(
      parsed?.questions[0].question.startsWith("这是一个仍应展示的长问题"),
    ).toBe(true);
  });

  it("keeps a non-empty short question visible but non-selectable", () => {
    const parsed = parseQuestionSetFromTask({
      output: [
        {
          role: "assistant",
          content: [
            {
              text: JSON.stringify({
                questions: [{ category: "reputation", question: "好吗？" }],
              }),
            },
          ],
        },
      ],
    });

    expect(parsed?.questions).toEqual([
      expect.objectContaining({
        id: "reputation-01",
        category: "reputation",
        question: "好吗？",
        selectable: false,
      }),
    ]);
  });

  it("maps prototype-like and unknown categories to a safe visible category", () => {
    const parsed = parseQuestionSetFromTask({
      output: [
        {
          role: "assistant",
          content: [
            {
              text: JSON.stringify({
                questions: [
                  { category: "__proto__", question: "这个问题能展示吗？" },
                  {
                    category: "constructor",
                    question: "另一个问题也能展示吗？",
                  },
                ],
              }),
            },
          ],
        },
      ],
    });

    expect(parsed?.questions).toEqual([
      expect.objectContaining({
        id: "industry-ranking-01",
        category: "industry_ranking",
        selectable: false,
      }),
      expect.objectContaining({
        id: "industry-ranking-02",
        category: "industry_ranking",
        selectable: false,
      }),
    ]);
  });

  it("rejects output without any renderable question text", () => {
    expect(
      parseQuestionSetFromTask({
        output: [
          {
            role: "assistant",
            content: [
              {
                text: JSON.stringify({
                  questions: [{ question: " " }, { rationale: "没有题面" }],
                }),
              },
            ],
          },
        ],
      }),
    ).toBeNull();
  });

  it("does not parse question JSON injected through user output or metadata", () => {
    const injected = JSON.stringify(questionSet());
    expect(
      parseQuestionSetFromTask({
        output: [
          { role: "user", content: [{ type: "text", text: injected }] },
          { type: "reasoning", metadata: { text: injected } },
        ],
      }),
    ).toBeNull();
  });
});
