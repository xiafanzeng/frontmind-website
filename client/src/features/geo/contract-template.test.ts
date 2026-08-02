import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const noticePath = fileURLToPath(
  new URL(
    "../../../public/contracts/frontmind-geo-monthly-optimization-service-agreement.html",
    import.meta.url,
  ),
);
const notice = readFileSync(noticePath, "utf8");

describe("legacy GEO contract URL", () => {
  it("explains that contract confirmation has moved to enterprise WeChat", () => {
    expect(notice).toContain("合同在企业微信完成确认");
    expect(notice).toContain("网站不提供合同在线查看、下载或签署");
    expect(notice).toContain("不能作为合同文件、签署页面或付款凭证");
    expect(notice).toContain('href="/#geo-builder"');
  });

  it("does not retain an interactive contract, PDF, or signing surface", () => {
    expect(notice).not.toContain("screen-toolbar");
    expect(notice).not.toContain("print-contract");
    expect(notice).not.toContain("window.print");
    expect(notice).not.toContain("pdfReady");
    expect(notice).not.toContain("data-client-");
    expect(notice).not.toContain("合同签署页");
    expect(notice).not.toContain("电子签名 / 盖章区域");
    expect(notice).not.toContain("<script");
  });
});
