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
