import { describe, expect, it } from "vitest";
import {
  findArchiveDescriptor,
  normalizeTask,
  parseQuestionSetFromTask,
} from "./output";
import { buildValidQuestionSet } from "./question-set.test-fixture";

function questionSet() {
  return buildValidQuestionSet();
}

describe("GEO task output normalization", () => {
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

  it("rejects structurally valid but generic product Q&A output", () => {
    const generic = questionSet();
    generic.questions[5] = {
      ...generic.questions[5],
      question: "企业如何系统搭建可被 AI 理解的知识库？",
    };

    expect(
      parseQuestionSetFromTask({
        output: [
          {
            role: "assistant",
            content: [{ text: JSON.stringify(generic) }],
          },
        ],
      }),
    ).toBeNull();
  });

  it("rejects generated questions containing a comma", () => {
    const indirect = questionSet();
    indirect.questions[0] = {
      ...indirect.questions[0],
      question: "Acme 的企业背景如何，团队是否可靠？",
    };

    expect(
      parseQuestionSetFromTask({
        output: [
          {
            role: "assistant",
            content: [{ text: JSON.stringify(indirect) }],
          },
        ],
      }),
    ).toBeNull();
  });

  it("requires all five explicit competitor-brand comparisons", () => {
    const genericComparisons = questionSet();
    for (const item of genericComparisons.questions.filter(
      (question) => question.category === "competitor_comparison",
    )) {
      delete item.competitorAnchor;
    }

    expect(
      parseQuestionSetFromTask({
        output: [
          {
            role: "assistant",
            content: [{ text: JSON.stringify(genericComparisons) }],
          },
        ],
      }),
    ).toBeNull();
  });

  it("requires the declared competitor brand in the visible question", () => {
    const missingAnchor = questionSet();
    const comparison = missingAnchor.questions.find(
      (question) => question.category === "competitor_comparison",
    );
    if (!comparison) throw new Error("missing comparison fixture");
    comparison.competitorAnchor = "未出现在题面中的品牌";

    expect(
      parseQuestionSetFromTask({
        output: [
          {
            role: "assistant",
            content: [{ text: JSON.stringify(missingAnchor) }],
          },
        ],
      }),
    ).toBeNull();
  });

  it("accepts a natural 有何不同 competitor question", () => {
    const naturalComparison = questionSet();
    const comparison = naturalComparison.questions.find(
      (question) => question.category === "competitor_comparison",
    );
    if (!comparison) throw new Error("missing comparison fixture");
    comparison.question = comparison.question.replace(
      "有什么区别",
      "有何不同",
    );

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

  it("requires a competitor brand in every comparison", () => {
    const missingCompetitor = questionSet();
    const comparison = missingCompetitor.questions.find(
      (question) => question.category === "competitor_comparison",
    );
    if (!comparison) throw new Error("missing comparison fixture");
    delete comparison.competitorAnchor;

    expect(
      parseQuestionSetFromTask({
        output: [
          {
            role: "assistant",
            content: [{ text: JSON.stringify(missingCompetitor) }],
          },
        ],
      }),
    ).toBeNull();
  });

  it("requires the current enterprise in every competitor comparison", () => {
    const missingEnterprise = questionSet();
    const comparison = missingEnterprise.questions.find(
      (question) => question.category === "competitor_comparison",
    );
    if (!comparison) throw new Error("missing comparison fixture");
    delete comparison.enterpriseAnchor;

    expect(
      parseQuestionSetFromTask({
        output: [
          {
            role: "assistant",
            content: [{ text: JSON.stringify(missingEnterprise) }],
          },
        ],
      }),
    ).toBeNull();
  });

  it("rejects the current enterprise as its own competitor", () => {
    const selfComparison = questionSet();
    const comparison = selfComparison.questions.find(
      (question) => question.category === "competitor_comparison",
    );
    if (!comparison) throw new Error("missing comparison fixture");
    comparison.competitorAnchor = comparison.enterpriseAnchor;

    expect(
      parseQuestionSetFromTask({
        output: [
          {
            role: "assistant",
            content: [{ text: JSON.stringify(selfComparison) }],
          },
        ],
      }),
    ).toBeNull();
  });

  it("does not count a generic alternative as a competitor brand", () => {
    const genericAnchor = questionSet();
    const comparison = genericAnchor.questions.find(
      (question) => question.category === "competitor_comparison",
    );
    if (!comparison) throw new Error("missing comparison fixture");
    comparison.question = comparison.question.replace("云杉科技", "同类平台");
    comparison.competitorAnchor = "同类平台";

    expect(
      parseQuestionSetFromTask({
        output: [
          {
            role: "assistant",
            content: [{ text: JSON.stringify(genericAnchor) }],
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
