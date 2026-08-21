import { describe, expect, it } from "vitest";

import { buildMonitoringInsights } from "./monitoring-insights";
import type { GeoMonitoringAnswer } from "./types";

function answer(
  runIndex: number,
  patch: Partial<GeoMonitoringAnswer> = {},
): GeoMonitoringAnswer {
  return {
    id: `answer-${runIndex}`,
    platformId: "deepseek",
    runIndex,
    status: "completed",
    answer: `第 ${runIndex} 次回答`,
    media: [],
    sources: [],
    citations: [],
    references: [],
    ...patch,
  };
}

describe("monitoring insights", () => {
  it("deduplicates an article and channel within one answer but counts recurrence", () => {
    const source = {
      index: 0,
      title: "行业报告",
      url: "https://REPORTS.frontmind.cn/article/1/#part",
      site: "行业媒体",
    };
    const insights = buildMonitoringInsights([
      answer(1, {
        sourceBreakdownAvailable: true,
        citations: [
          source,
          {
            ...source,
            title: "同址重复",
            url: "https://reports.frontmind.cn/article/1",
          },
        ],
      }),
      answer(2, {
        sourceBreakdownAvailable: true,
        citations: [source],
      }),
    ]);

    expect(insights.citationCoverage).toBe(2);
    expect(insights.channels).toEqual([
      expect.objectContaining({ label: "行业媒体", count: 2, percentage: 100 }),
    ]);
    expect(insights.articles).toEqual([
      expect.objectContaining({ label: "行业报告", count: 2, percentage: 100 }),
    ]);
  });

  it("uses channel fallbacks and keeps stable ordering for tied rows", () => {
    const insights = buildMonitoringInsights([
      answer(1, {
        sourceBreakdownAvailable: true,
        citations: [
          {
            title: "域名来源",
            domain: "domain.example.cn",
            url: "https://domain.example.cn/a",
          },
          { title: "主机来源", url: "https://host.example.cn/b" },
          { title: "未知来源" },
        ],
      }),
    ]);

    expect(insights.channels.map((row) => row.label)).toEqual([
      "domain.example.cn",
      "host.example.cn",
      "未知渠道",
    ]);
    expect(insights.channels.every((row) => row.count === 1)).toBe(true);
  });

  it("separates unknown sentiment from neutral and excludes missing fields", () => {
    const insights = buildMonitoringInsights([
      answer(1, { sentiment: "positive" }),
      answer(2, { sentiment: "neutral" }),
      answer(3, { sentiment: null }),
      answer(4),
      answer(5, { status: "failed", answer: "", sentiment: "negative" }),
    ]);

    expect(insights.completedCount).toBe(4);
    expect(insights.sentiment.coverage).toBe(3);
    expect(insights.sentiment.counts).toEqual({
      positive: 1,
      neutral: 1,
      negative: 0,
      unknown: 1,
    });
  });

  it("groups evaluation words by nature and counts each answer once", () => {
    const insights = buildMonitoringInsights([
      answer(1, {
        keywordEvaluations: [
          {
            keyword: " 供应链稳定 ",
            nature: "positive",
            context: "正面上下文",
          },
          { keyword: "供应链稳定", nature: "positive" },
        ],
      }),
      answer(2, {
        keywordEvaluations: [
          { keyword: "供应链稳定", nature: "negative", context: "负面上下文" },
        ],
      }),
    ]);

    expect(insights.evaluations.coverage).toBe(2);
    expect(insights.evaluations.groups.positive).toEqual([
      expect.objectContaining({ label: "供应链稳定", count: 1 }),
    ]);
    expect(insights.evaluations.groups.negative).toEqual([
      expect.objectContaining({ label: "供应链稳定", count: 1 }),
    ]);
  });

  it("uses only observed brand fields for mention and category metrics", () => {
    const insights = buildMonitoringInsights([
      answer(1, {
        mentionPosition: 3,
        categoryRanking: { categoryName: "综合医药流通企业", rank: 3 },
      }),
      answer(2, {
        mentionPosition: 1,
        categoryRanking: { categoryName: "综合医药流通企业", rank: 1 },
      }),
      answer(3, { mentionPosition: null, categoryRanking: null }),
      answer(4),
    ]);

    expect(insights.brand).toMatchObject({
      mentionCoverage: 3,
      mentionedCount: 2,
      mentionRate: 66.7,
      averagePosition: 2,
      bestPosition: 1,
      categoryCoverage: 3,
      categories: [
        {
          categoryName: "综合医药流通企业",
          bestRank: 1,
          count: 2,
        },
      ],
    });
  });
});
