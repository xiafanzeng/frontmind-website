import { z } from "zod";

import { trustedAssistantOutputTexts } from "./trusted-task-output";

export const GEO_CRAWL_PROGRESS_MARKER = "FRONTMIND_GEO_CRAWL_PROGRESS_V1";

const count = (maximum: number) => z.number().int().nonnegative().max(maximum);

const GeoCrawlProgressSchema = z
  .object({
    schemaVersion: z.literal(1),
    reportedAt: z
      .string()
      .datetime({ offset: true })
      .transform((value) => new Date(value).toISOString()),
    phase: z.enum([
      "planning",
      "crawling",
      "extracting",
      "assets",
      "documents",
      "finalizing",
      "completed",
    ]),
    visitedLinks: count(1_000_000),
    successfulPages: count(1_000_000),
    failedPages: count(1_000_000),
    textCharacters: count(1_000_000_000),
    imagesDiscovered: count(1_000_000),
    imagesDownloaded: count(1_000_000),
    documentsParsed: count(1_000_000),
    webQueriesExecuted: count(1_000_000),
  })
  .strict()
  .refine(
    (value) =>
      value.successfulPages + value.failedPages <= value.visitedLinks &&
      value.imagesDownloaded <= value.imagesDiscovered,
    { message: "crawl progress counts are inconsistent" },
  );

export type GeoCrawlProgress = z.infer<typeof GeoCrawlProgressSchema>;

const COUNTER_KEYS = [
  "visitedLinks",
  "successfulPages",
  "failedPages",
  "textCharacters",
  "imagesDiscovered",
  "imagesDownloaded",
  "documentsParsed",
  "webQueriesExecuted",
] as const satisfies ReadonlyArray<keyof GeoCrawlProgress>;

export function parseTrustedGeoCrawlProgress(
  task: unknown,
): GeoCrawlProgress | undefined {
  let latest: GeoCrawlProgress | undefined;
  for (const text of trustedAssistantOutputTexts(task)) {
    for (const candidate of markerPayloads(text)) {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(candidate);
      } catch {
        continue;
      }
      const parsed = GeoCrawlProgressSchema.safeParse(parsedJson);
      if (!parsed.success) continue;
      if (
        latest &&
        (Date.parse(parsed.data.reportedAt) < Date.parse(latest.reportedAt) ||
          COUNTER_KEYS.some((key) => parsed.data[key] < latest![key]))
      ) {
        continue;
      }
      latest = parsed.data;
    }
  }
  return latest;
}

export function geoCrawlProgressSummary(progress: GeoCrawlProgress) {
  return `已访问 ${progress.visitedLinks} 个链接，成功采集 ${progress.successfulPages} 个页面，提取 ${progress.textCharacters} 字文字，发现 ${progress.imagesDiscovered} 张图片并保存 ${progress.imagesDownloaded} 张，已解析 ${progress.documentsParsed} 份文档。`;
}

function markerPayloads(text: string) {
  const results: string[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  for (const line of lines) {
    const markerIndex = line.indexOf(GEO_CRAWL_PROGRESS_MARKER);
    if (markerIndex < 0) continue;
    const payload = line
      .slice(markerIndex + GEO_CRAWL_PROGRESS_MARKER.length)
      .trim()
      .replace(/^[:\s-]+/, "")
      .replace(/\s*-->\s*$/, "")
      .trim();
    if (payload.startsWith("{") && payload.endsWith("}")) {
      results.push(payload);
    }
  }
  return results;
}
