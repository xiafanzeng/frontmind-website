import { describe, expect, it } from "vitest";

import {
  prepareKnowledgeSectionMarkdown,
  visibleKnowledgeSectionSummary,
} from "./knowledge-section-markdown";

describe("knowledge section markdown title preparation", () => {
  it("removes only the old generated H2 at the start of each archived part", () => {
    const markdown = [
      "## 企业与品牌",
      "",
      "# 企业与品牌",
      "",
      "---",
      "",
      "## 企业与品牌",
      "",
      "# 企业与品牌",
      "",
      "官网称，企业成立于 2023 年。",
      "",
      "## 发展历程",
      "",
      "后续不同标题与正文保持不变。",
    ].join("\n");
    const prepared = prepareKnowledgeSectionMarkdown(markdown, "企业与品牌", {
      archiveContractVersion: 1,
    });

    expect(prepared.rendersSectionTitle).toBe(true);
    expect(prepared.markdown).toBe(
      [
        "# 企业与品牌",
        "",
        "---",
        "",
        "# 企业与品牌",
        "",
        "官网称，企业成立于 2023 年。",
        "",
        "## 发展历程",
        "",
        "后续不同标题与正文保持不变。",
      ].join("\n"),
    );
    expect(prepared.markdown.match(/企业与品牌/g)).toHaveLength(2);
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

  it("recognizes the matching first visible title after leading HTML comments", () => {
    const markdown = [
      "<!-- FRONTMIND_FORMAL_CONTENT_START -->",
      "<!-- another leading",
      "comment -->",
      "",
      "# 企业与品牌",
      "",
      "正文。",
    ].join("\n");

    expect(
      prepareKnowledgeSectionMarkdown(markdown, "企业与品牌"),
    ).toEqual({ markdown, rendersSectionTitle: true });
  });

  it("stops at visible body text instead of borrowing a later matching heading", () => {
    const markdown = [
      "<!-- leading comment -->",
      "正文先出现。",
      "# 企业与品牌",
    ].join("\n");

    expect(
      prepareKnowledgeSectionMarkdown(markdown, "企业与品牌"),
    ).toEqual({ markdown, rendersSectionTitle: false });
  });

  it("does not delete non-H2 or non-leading repeated headings", () => {
    const markdown = [
      "## 企业与品牌",
      "# 企业与品牌",
      "第一部分正文。",
      "",
      "---",
      "",
      "### 企业与品牌",
      "## 企业与品牌",
      "第二部分正文。",
      "",
      "***",
      "",
      "## 发展历程",
      "### 发展历程",
      "第三部分正文。",
    ].join("\n");
    const prepared = prepareKnowledgeSectionMarkdown(markdown, "企业与品牌", {
      archiveContractVersion: 2,
    });

    expect(prepared.rendersSectionTitle).toBe(true);
    expect(prepared.markdown).toBe(
      [
        "# 企业与品牌",
        "第一部分正文。",
        "",
        "---",
        "",
        "### 企业与品牌",
        "## 企业与品牌",
        "第二部分正文。",
        "",
        "***",
        "",
        "### 发展历程",
        "第三部分正文。",
      ].join("\n"),
    );
    expect(prepared.markdown.match(/企业与品牌/g)).toHaveLength(3);
    expect(prepared.markdown.match(/发展历程/g)).toHaveLength(1);
  });

  it("preserves a generated-looking H2 when the following title differs", () => {
    const markdown = ["## 企业与品牌", "", "# 企业主体", "", "正文。"].join(
      "\n",
    );

    expect(prepareKnowledgeSectionMarkdown(markdown, "企业与品牌")).toEqual({
      markdown,
      rendersSectionTitle: true,
    });
  });

  it("preserves an authored H2/H1 pair when no legacy contract marker exists", () => {
    const markdown = "## 企业与品牌\n\n# 企业与品牌\n\n正文。";

    expect(
      prepareKnowledgeSectionMarkdown(markdown, "企业与品牌", {
        archiveContractVersion: 3,
      }),
    ).toEqual({ markdown, rendersSectionTitle: true });
    expect(prepareKnowledgeSectionMarkdown(markdown, "企业与品牌")).toEqual({
      markdown,
      rendersSectionTitle: true,
    });
  });

  it("uses an explicit titleInjected flag and lets false override a legacy version", () => {
    const markdown = "## 企业与品牌\n\n# 企业与品牌\n\n正文。";

    expect(
      prepareKnowledgeSectionMarkdown(markdown, "企业与品牌", {
        titleInjected: true,
      }).markdown,
    ).toBe("# 企业与品牌\n\n正文。");
    expect(
      prepareKnowledgeSectionMarkdown(markdown, "企业与品牌", {
        archiveContractVersion: 1,
        titleInjected: false,
      }).markdown,
    ).toBe(markdown);
  });

  it("does not mistake fenced or Setext markdown for archive separators", () => {
    const prepared = prepareKnowledgeSectionMarkdown(
      [
        "# 技术与交付",
        "正文中的代码示例：",
        "",
        "```md",
        "---",
        "# 代码里的标题",
        "```",
        "",
        "附录标题",
        "---",
        "附录正文。",
      ].join("\n"),
      "技术与交付",
    );

    expect(prepared.markdown).toContain("```md\n---\n# 代码里的标题\n```");
    expect(prepared.markdown).toContain("附录标题\n---\n附录正文。");
  });

  it("does not start legacy de-duplication after a fenced or Setext break", () => {
    const markdown = [
      "正文中的代码示例：",
      "",
      "```md",
      "---",
      "```",
      "",
      "附录标题",
      "---",
      "## 附录标题",
      "# 附录标题",
      "附录正文。",
    ].join("\n");

    const prepared = prepareKnowledgeSectionMarkdown(markdown, "技术与交付", {
      archiveContractVersion: 1,
    });
    expect(prepared.markdown).toBe(markdown);
    expect(prepared.markdown.match(/附录标题/g)).toHaveLength(3);
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

  it("treats the historical unavailable-summary marker as empty content", () => {
    expect(
      visibleKnowledgeSectionSummary(" 暂无可展示摘要。 "),
    ).toBeUndefined();
    expect(visibleKnowledgeSectionSummary("暂无可展示摘要")).toBeUndefined();
    expect(visibleKnowledgeSectionSummary("企业主体信息仍待补充。")).toBe(
      "企业主体信息仍待补充。",
    );
  });
});
