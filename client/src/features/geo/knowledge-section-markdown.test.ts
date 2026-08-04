import { describe, expect, it } from "vitest";

import { prepareKnowledgeSectionMarkdown } from "./knowledge-section-markdown";

describe("knowledge section markdown title preparation", () => {
  it("keeps only the last repeated leading title closest to the body", () => {
    const prepared = prepareKnowledgeSectionMarkdown(
      [
        "# 团队与组织",
        "",
        "## 团队与组织",
        "",
        "### 团队与组织",
        "",
        "#### 团队与组织",
        "官网称，团队由多学科成员组成。",
      ].join("\n"),
      "团队与组织",
    );

    expect(prepared.rendersSectionTitle).toBe(true);
    expect(prepared.markdown.match(/团队与组织/g)).toHaveLength(1);
    expect(prepared.markdown).toBe(
      "#### 团队与组织\n官网称，团队由多学科成员组成。",
    );
  });

  it("uses a single leading markdown title without adding a second detail title", () => {
    expect(
      prepareKnowledgeSectionMarkdown(
        "## 产品与服务 ##\n产品覆盖两个解决方案。",
        "产品与服务",
      ),
    ).toEqual({
      markdown: "## 产品与服务 ##\n产品覆盖两个解决方案。",
      rendersSectionTitle: true,
    });
  });

  it("preserves the detail title when markdown starts with body text or another heading", () => {
    expect(
      prepareKnowledgeSectionMarkdown(
        "正文直接开始，没有内嵌标题。",
        "团队与组织",
      ).rendersSectionTitle,
    ).toBe(false);
    expect(
      prepareKnowledgeSectionMarkdown("## 创始团队\n团队信息。", "团队与组织"),
    ).toEqual({
      markdown: "## 创始团队\n团队信息。",
      rendersSectionTitle: false,
    });
  });
});
