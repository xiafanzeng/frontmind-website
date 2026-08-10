import { readFileSync } from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

const contractHtml = readFileSync(
  path.resolve(
    process.cwd(),
    "client/public/contracts/frontmind-geo-monthly-optimization-service-agreement.html",
  ),
  "utf8",
);

type Edition = "domestic" | "overseas";
type Category = "product_scenario" | "reputation" | "competitor_comparison";

const priceMatrix: Record<Edition, Record<Category, string>> = {
  domestic: {
    product_scenario: "¥1,500",
    reputation: "¥2,000",
    competitor_comparison: "¥2,000",
  },
  overseas: {
    product_scenario: "¥3,000",
    reputation: "¥4,000",
    competitor_comparison: "¥4,000",
  },
};

const editionMetadata: Record<
  Edition,
  { label: string; version: string; priceRange: string }
> = {
  domestic: {
    label: "国内版",
    version: "GEO-BASIC-DOMESTIC-2026.08-V3",
    priceRange: "¥1,500/¥2,000",
  },
  overseas: {
    label: "海外版",
    version: "GEO-BASIC-OVERSEAS-2026.08-V3",
    priceRange: "¥3,000/¥4,000",
  },
};

function renderContract(query: string) {
  return new JSDOM(contractHtml, {
    url: `https://www.frontmind.net/contracts/agreement.html?${query}`,
    runScripts: "dangerously",
    pretendToBeVisual: true,
  });
}

function textContents(document: Document, selector: string) {
  return Array.from(document.querySelectorAll(selector), (node) =>
    node.textContent?.trim(),
  );
}

describe("GEO monthly contract editions", () => {
  for (const edition of ["domestic", "overseas"] as const) {
    for (const category of [
      "product_scenario",
      "reputation",
      "competitor_comparison",
    ] as const) {
      it(`renders ${edition} ${category} with the matching price`, () => {
        const dom = renderContract(
          `edition=${edition}&category=${category}&order=${edition}-${category}`,
        );
        const document = dom.window.document;

        expect(textContents(document, "[data-order-price]")).not.toHaveLength(
          0,
        );
        expect(
          textContents(document, "[data-order-price]").every(
            (price) => price === priceMatrix[edition][category],
          ),
        ).toBe(true);

        for (const [planCategory, expectedPrice] of Object.entries(
          priceMatrix[edition],
        )) {
          const prices = textContents(
            document,
            `[data-plan-price="${planCategory}"]`,
          );
          expect(prices).not.toHaveLength(0);
          expect(prices.every((price) => price === expectedPrice)).toBe(true);
        }

        const metadata = editionMetadata[edition];
        const editionLabels = textContents(
          document,
          "[data-market-edition]:not(html)",
        );
        expect(editionLabels).not.toHaveLength(0);
        expect(editionLabels.every((label) => label === metadata.label)).toBe(
          true,
        );
        expect(
          textContents(document, "[data-contract-version]").every(
            (version) => version === metadata.version,
          ),
        ).toBe(true);
        expect(textContents(document, "[data-price-range]")).toEqual([
          metadata.priceRange,
        ]);
        expect(document.documentElement.dataset.marketEdition).toBe(edition);
        expect(document.title).toContain(metadata.label);
        dom.window.close();
      });
    }
  }

  it("defaults links without an edition to the domestic contract", () => {
    const dom = renderContract("category=reputation");
    const document = dom.window.document;

    expect(document.documentElement.dataset.marketEdition).toBe("domestic");
    expect(document.querySelector("[data-order-price]")?.textContent).toBe(
      "¥2,000",
    );
    expect(document.querySelector("[data-contract-version]")?.textContent).toBe(
      "GEO-BASIC-DOMESTIC-2026.08-V3",
    );
    dom.window.close();
  });

  it("keeps the latest payment, invoice, settlement, and clean-copy terms", () => {
    expect(contractHtml).toContain("一次性付清（100%）");
    expect(contractHtml).toContain("合同确认后 5 个工作日内在线支付或对公转账");
    expect(contractHtml).toMatch(
      /管理员确认合同后 5 个工作日内一次性支付订单总价的\s*100%/,
    );
    expect(contractHtml).toMatch(
      /按实际收款金额向甲方开具\s*1%\s*税率的增值税普通发票/,
    );
    expect(contractHtml.match(/<td>25%<\/td>/g)).toHaveLength(2);
    expect(contractHtml.match(/<td>50%<\/td>/g)).toHaveLength(1);
    expect(contractHtml).toContain("问题、事实边界、基线与排期进入工作台");
    expect(contractHtml).toContain("分类专项资产、证据来源与实施清单完成交付");
    expect(contractHtml).toContain("同口径复测、变化说明与结项建议完成交付");
    expect(contractHtml).toContain("付款后乙方尚未启动定制工作");
    expect(contractHtml).toContain("甲方书面授权的必要第三方成本结算");
    expect(contractHtml).toContain("未履行部分原路退还");
    expect(contractHtml).toContain("乙方可暂停相关工作并书面说明");
    expect(contractHtml).not.toMatch(/<(?:del|s|strike)\b/i);
    expect(contractHtml).not.toContain("line-through");
    expect(contractHtml).not.toContain("text-decoration:");
    expect(contractHtml).not.toContain("legal-emphasis");
  });
});
