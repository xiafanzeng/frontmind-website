import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MonitoringMarkdown } from "./MonitoringMarkdown";

describe("MonitoringMarkdown", () => {
  it("renders answer structure instead of exposing Markdown syntax", () => {
    const html = renderToStaticMarkup(
      <MonitoringMarkdown
        markdown={`### 企业基本背景

- **主体关联**：匿名验收企业
- **企业规模**：中型科技企业

---

[查看来源](https://example.com/company)`}
      />,
    );

    expect(html).toContain("<h3>企业基本背景</h3>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<strong>主体关联</strong>");
    expect(html).toContain("<hr");
    expect(html).toContain('href="https://example.com/company"');
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain("###");
    expect(html).not.toContain("**");
  });

  it("drops raw HTML and unsafe link protocols", () => {
    const html = renderToStaticMarkup(
      <MonitoringMarkdown
        markdown={`[危险链接](javascript:alert(1))

<script>alert("unsafe")</script>`}
      />,
    );

    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("unsafe");
    expect(html).toContain("危险链接");
  });

  it.each([
    ["localhost", "http://localhost/admin"],
    ["single-label host", "https://metadata/latest"],
    ["IPv4 literal", "http://127.0.0.1/private"],
    ["numeric IPv4 literal", "http://2130706433/private"],
    ["IPv6 literal", "http://[::1]/private"],
    ["cloud metadata IP", "http://169.254.169.254/latest/meta-data"],
    ["reserved TLD", "https://metadata.google.internal/latest"],
    ["example TLD", "https://source.example/private"],
    ["credentials", "https://user:secret@public.example.com/private"],
  ])("blocks a %s URL from links and images", (_label, url) => {
    const html = renderToStaticMarkup(
      <MonitoringMarkdown
        markdown={`[不可信链接](${url})

![不可信图片](${url})`}
      />,
    );

    expect(html).not.toContain("href=");
    expect(html).not.toContain("<img");
    expect(html).toContain("不可信链接");
    expect(html).toContain("不可信图片");
    expect(html).toContain("图片地址已拦截");
  });

  it("keeps public links but turns public images into opt-in links", () => {
    const html = renderToStaticMarkup(
      <MonitoringMarkdown
        markdown={`[公开来源](https://www.frontmind.cn/research?q=geo)

![公开图表](https://cdn.frontmind.cn/research/chart.webp)`}
      />,
    );

    expect(html).toContain('href="https://www.frontmind.cn/research?q=geo"');
    expect(html).toContain(
      'href="https://cdn.frontmind.cn/research/chart.webp"',
    );
    expect(html).toContain("公开图表");
    expect(html).toContain("按需打开原图");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("<img");
  });

  it("shows a readable fallback for an empty response", () => {
    const html = renderToStaticMarkup(<MonitoringMarkdown markdown="   " />);

    expect(html).toContain("本轮没有返回可展示的文字。");
  });
});
