import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import VisitorStats, { normalizeVisitorStats } from "@/components/VisitorStats";
import { LanguageProvider } from "@/contexts/LanguageContext";

describe("visitor statistics UI", () => {
  it("starts with an explicit loading state instead of fabricated totals", () => {
    const html = renderToStaticMarkup(
      <LanguageProvider>
        <VisitorStats />
      </LanguageProvider>,
    );

    expect(html).toContain("正在加载真实访问统计");
    expect(html).not.toContain("1,407");
    expect(html).not.toContain("53");
  });

  it("accepts an honest empty response", () => {
    expect(
      normalizeVisitorStats({
        totalReads: 0,
        countryCount: 0,
        pageviews: 0,
        countries: [],
        mode: "live",
        updatedAt: null,
      }),
    ).toEqual({
      totalReads: 0,
      countryCount: 0,
      pageviews: 0,
      countries: [],
      mode: "live",
      updatedAt: null,
    });
  });

  it("sorts valid regions and rejects inconsistent or unsafe payloads", () => {
    const valid = normalizeVisitorStats({
      totalReads: 5,
      countryCount: 2,
      countries: [
        {
          country: "United States",
          iso: "us",
          reads: 2,
          latitude: 39.8283,
          longitude: -98.5795,
        },
        {
          country: "Mainland China",
          iso: "cn",
          reads: 3,
          latitude: 35.8617,
          longitude: 104.1954,
        },
      ],
    });

    expect(valid?.countries.map((country) => country.iso)).toEqual([
      "cn",
      "us",
    ]);
    expect(
      normalizeVisitorStats({
        totalReads: 1_407,
        countryCount: 53,
        countries: [],
      }),
    ).toBeNull();
    expect(
      normalizeVisitorStats({
        totalReads: 1,
        countryCount: 1,
        countries: [
          {
            country: "Unsafe",
            iso: "us",
            reads: -1,
            latitude: 0,
            longitude: 0,
          },
        ],
      }),
    ).toBeNull();
  });

  it("accepts published region totals that include other without unknown", () => {
    const normalized = normalizeVisitorStats({
      totalReads: 8,
      countryCount: 2,
      countries: [
        {
          country: "Mainland China",
          iso: "cn",
          reads: 6,
          latitude: 35.8617,
          longitude: 104.1954,
        },
        {
          country: "Other locations",
          iso: "other",
          reads: 2,
          latitude: 0,
          longitude: 0,
        },
      ],
    });

    expect(normalized).toMatchObject({
      totalReads: 8,
      countryCount: 2,
    });
    expect(normalized?.countries.map((country) => country.iso)).toEqual([
      "cn",
      "other",
    ]);
  });
});
