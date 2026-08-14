import { describe, expect, it } from "vitest";

import {
  GEO_CRAWL_PROGRESS_MARKER,
  geoCrawlProgressSummary,
  parseTrustedGeoCrawlProgress,
} from "./crawl-progress";

function marker(overrides: Record<string, unknown> = {}) {
  return `${GEO_CRAWL_PROGRESS_MARKER} ${JSON.stringify({
    schemaVersion: 1,
    reportedAt: "2026-07-28T08:05:00.000Z",
    phase: "crawling",
    visitedLinks: 12,
    successfulPages: 10,
    failedPages: 2,
    textCharacters: 24_680,
    imagesDiscovered: 18,
    imagesDownloaded: 11,
    documentsParsed: 3,
    webQueriesExecuted: 2,
    ...overrides,
  })}`;
}

describe("trusted GEO crawl progress", () => {
  it("accepts a cumulative checkpoint only from safe events", () => {
    const progress = parseTrustedGeoCrawlProgress({
      safeEvents: [
        { id: "event-1", type: "progress", message: marker() },
      ],
      metadata: { progress: marker({ visitedLinks: 999 }) },
    });

    expect(progress).toMatchObject({
      visitedLinks: 12,
      successfulPages: 10,
      imagesDownloaded: 11,
    });
    expect(geoCrawlProgressSummary(progress!)).toBe(
      "已访问 12 个链接，成功采集 10 个页面，提取 24680 字文字，发现 18 张图片并保存 11 张，已解析 3 份文档。",
    );
  });

  it("rejects metadata, malformed, negative, oversized and inconsistent data", () => {
    const invalid = [
      marker({ visitedLinks: -1 }),
      marker({ textCharacters: 1_000_000_001 }),
      marker({ visitedLinks: 2, successfulPages: 3 }),
      marker({ imagesDiscovered: 1, imagesDownloaded: 2 }),
      `${GEO_CRAWL_PROGRESS_MARKER} {not-json}`,
    ];
    expect(
      parseTrustedGeoCrawlProgress({
        safeEvents: invalid.map((message, index) => ({
          id: `event-${index}`,
          type: "progress",
          message,
        })),
        metadata: { crawlProgress: marker() },
      }),
    ).toBeUndefined();
  });

  it("keeps the latest monotonic checkpoint and ignores regressing counters", () => {
    const progress = parseTrustedGeoCrawlProgress({
      safeEvents: [
        { id: "event-1", type: "progress", message: marker() },
        {
          id: "event-2",
          type: "progress",
          message: marker({
                reportedAt: "2026-07-28T08:10:00.000Z",
                visitedLinks: 20,
                successfulPages: 17,
                failedPages: 3,
                textCharacters: 42_000,
                imagesDiscovered: 24,
                imagesDownloaded: 16,
                documentsParsed: 4,
                webQueriesExecuted: 3,
              }),
        },
        {
          id: "event-3",
          type: "progress",
          message: marker({
                reportedAt: "2026-07-28T08:15:00.000Z",
                visitedLinks: 19,
              }),
        },
      ],
    });

    expect(progress).toMatchObject({
      reportedAt: "2026-07-28T08:10:00.000Z",
      visitedLinks: 20,
      textCharacters: 42_000,
    });
  });
});
