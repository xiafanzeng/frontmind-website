import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const contractPath = fileURLToPath(
  new URL(
    "../../../public/contracts/frontmind-geo-monthly-optimization-service-agreement.html",
    import.meta.url,
  ),
);
const contract = readFileSync(contractPath, "utf8");

describe("GEO service contract preview", () => {
  it("renders the complete read-only contract for the enterprise WeChat flow", () => {
    expect(contract).toContain("企业 GEO 单问题月度优化服务协议");
    expect(contract).toContain("GEO-BASIC-DOMESTIC-2026.08-V3");
    expect(contract).toContain("GEO-BASIC-OVERSEAS-2026.08-V3");
    expect(contract).toContain('params.get("edition")');
    expect(contract).toContain("国内版");
    expect(contract).toContain("海外版");
    expect(contract).toContain("第 5 页 / 共 5 页");
    expect(contract).toContain("企业微信确认及签字或盖章文件留存");
    expect(contract).toContain("深圳市超前无限科技有限公司");
    expect(contract).toContain("香港中文大学（深圳）深港创新创业孵化中心");
    expect(contract).toContain("中信银行深圳分行");
    expect(contract).toContain("8110301012600865338");
    expect(contract).not.toContain("网站不提供合同在线查看");
  });

  it("locks the one-off payment, invoice, and milestone settlement terms", () => {
    expect(contract).toContain("一次性付清（100%）");
    expect(contract).toContain("合同确认后 5 个工作日内在线支付或对公转账");
    expect(contract).toMatch(
      /管理员确认合同后 5 个工作日内一次性支付订单总价的\s*100%/,
    );
    expect(contract).toMatch(
      /按实际收款金额向甲方开具\s*1%\s*税率的增值税普通发票/,
    );
    expect(contract).toContain("<span>14</span>暂停、终止与退款结算");
    expect(contract).toContain("<td><strong>范围确认与基线</strong></td>");
    expect(contract).toContain("<td><strong>语义资产与实施清单</strong></td>");
    expect(contract).toContain("<td><strong>复测与结项</strong></td>");
    expect(contract.match(/<td>25%<\/td>/g)).toHaveLength(2);
    expect(contract.match(/<td>50%<\/td>/g)).toHaveLength(1);
    expect(contract).toContain("问题、事实边界、基线与排期进入工作台");
    expect(contract).toContain("分类专项资产、证据来源与实施清单完成交付");
    expect(contract).toContain("同口径复测、变化说明与结项建议完成交付");
    expect(contract).toContain("付款后乙方尚未启动定制工作");
    expect(contract).toContain("甲方书面授权的必要第三方成本结算");
    expect(contract).toContain("未履行部分原路退还");
    expect(contract).toContain("乙方可暂停相关工作并书面说明");
  });

  it("defines one source of truth for domestic and overseas prices", () => {
    expect(contract).toContain("basePrice: 1500");
    expect(contract.match(/basePrice: 2000/g)).toHaveLength(2);
    expect(contract).toContain("multiplier: 1");
    expect(contract).toContain("multiplier: 2");
    expect(contract).toContain('data-plan-price="product_scenario"');
    expect(contract).toContain('data-plan-price="reputation"');
    expect(contract).toContain('data-plan-price="competitor_comparison"');
    expect(contract).toContain("data-price-range");
  });

  it("does not ship crossed-out or underlined removal copy", () => {
    expect(contract).not.toMatch(/<(?:del|s|strike)\b/i);
    expect(contract).not.toContain("line-through");
    expect(contract).not.toContain("text-decoration:");
    expect(contract).not.toContain("legal-emphasis");
    expect(contract).not.toContain("但不承诺任何平台给出固定答案");
    expect(contract).not.toContain("乙方不承诺进入任何 AI");
  });

  it("fills order data from the query and private profile data from the URL fragment", () => {
    expect(contract).toContain("new URLSearchParams(window.location.search)");
    expect(contract).toContain(
      "new URLSearchParams(window.location.hash.slice(1))",
    );
    expect(contract).toContain("data-client-legal-name");
    expect(contract).toContain("data-order-question");
    expect(contract).toContain("window.print()");
    expect(contract).not.toContain("电子签平台");
    expect(contract).not.toContain("电子签名");
  });
});
