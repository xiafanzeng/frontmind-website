import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const templatePath = fileURLToPath(
  new URL(
    "../../../public/contracts/frontmind-geo-monthly-optimization-service-agreement.html",
    import.meta.url,
  ),
);
const template = readFileSync(templatePath, "utf8");

describe("GEO monthly basic contract template", () => {
  it("keeps the monthly basic product scope separate from annual plans", () => {
    expect(template).toContain("GEO-BASIC-2026.07-V2");
    expect(template).toContain("1 个问题 / 连续 30 日");
    expect(template).toContain("¥1,500 / 问题 / 30 日");
    expect(template).toContain("¥2,000 / 问题 / 30 日");
    expect(template).not.toContain("豪华版");
    expect(template).not.toContain("进阶版");
    expect(template).not.toContain("年度服务");
  });

  it("has five fixed A4 pages and a dedicated signature page", () => {
    expect(template.match(/<section class="page /g)).toHaveLength(5);
    expect(template).toContain("第 5 页 / 共 5 页");
    expect(template).toContain("合同签署页");
    expect(template).toContain("本页与前四页共同组成完整合同");
  });

  it("maps every submitted party field and exposes a deterministic PDF readiness marker", () => {
    for (const field of [
      "data-client-legal-name",
      "data-client-credit-code",
      "data-client-address",
      "data-client-signatory-name",
      "data-client-signatory-title",
      "data-client-mobile",
      "data-client-email",
    ]) {
      expect(template).toContain(field);
    }
    expect(template).toContain(
      "new URLSearchParams(window.location.hash.slice(1))",
    );
    expect(template).toContain(
      'document.documentElement.dataset.pdfReady = "true"',
    );
    expect(template).toContain("document.fonts?.ready");
    expect(template).toContain("Promise.all");
  });
});
