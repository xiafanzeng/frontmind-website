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
  it("accepts a cumulative checkpoint only from assistant output", () => {
    const progress = parseTrustedGeoCrawlProgress({
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: marker() }],
        },
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

  it("rejects user messages, metadata, malformed, negative, oversized and inconsistent data", () => {
    const invalid = [
      marker({ visitedLinks: -1 }),
      marker({ textCharacters: 1_000_000_001 }),
      marker({ visitedLinks: 2, successfulPages: 3 }),
      marker({ imagesDiscovered: 1, imagesDownloaded: 2 }),
      `${GEO_CRAWL_PROGRESS_MARKER} {not-json}`,
    ];
    expect(
      parseTrustedGeoCrawlProgress({
        output: [
          {
            type: "message",
            role: "user",
            content: [{ type: "output_text", text: marker() }],
          },
          ...invalid.map((text) => ({
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text }],
          })),
        ],
        metadata: { crawlProgress: marker() },
      }),
    ).toBeUndefined();
  });

  it("keeps the latest monotonic checkpoint and ignores regressing counters", () => {
    const progress = parseTrustedGeoCrawlProgress({
      output: [
        {
          type: "message",
          role: "assistant",
          content: [
            { type: "output_text", text: marker() },
            {
              type: "output_text",
              text: marker({
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
              type: "output_text",
              text: marker({
                reportedAt: "2026-07-28T08:15:00.000Z",
                visitedLinks: 19,
              }),
            },
          ],
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
