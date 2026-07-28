import { z } from "zod";
import {
  GEO_MONITOR_PLATFORM_IDS,
  type BrokerMonitorMedia,
  type BrokerMonitorRecord,
  type BrokerMonitorRun,
  type GeoMonitorPlatformId,
} from "./broker";

const PlatformSchema = z.enum(GEO_MONITOR_PLATFORM_IDS);
const StatusSchema = z.enum([
  "submission_in_progress",
  "submission_unknown",
  "submitted",
  "polling",
  "completed",
  "partial_review_required",
  "remote_failed",
  "shape_mismatch",
]);
const RecordStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "stopped",
  "error",
]);
const SourceSchema = z.union([
  z.string().trim().min(1).max(4096),
  z
    .object({
      title: z.string().trim().max(1000).optional(),
      name: z.string().trim().max(1000).optional(),
      source: z.string().trim().max(1000).optional(),
      url: z.string().trim().max(4096).optional(),
      domain: z.string().trim().max(255).optional(),
    })
    .passthrough(),
]);
const MediaSchema = z
  .object({
    type: z.enum(["image", "video", "audio", "link"]),
    url: z.string().trim().min(1).max(4096),
    title: z.string().trim().max(500).optional(),
    thumbnailUrl: z.string().trim().max(4096).optional(),
  })
  .passthrough();
const RecordSchema = z
  .object({
    recordId: z.string().trim().min(1).max(255),
    platform: PlatformSchema,
    runIndex: z.number().int().min(1).max(5),
    status: RecordStatusSchema,
    answerText: z.string().max(200_000).optional(),
    media: z.array(MediaSchema).max(24).default([]),
    citations: z.array(SourceSchema).max(100).default([]),
    references: z.array(SourceSchema).max(200).default([]),
    error: z.string().max(2000).optional(),
    completedAt: z.string().max(80).optional(),
  })
  .passthrough();
const RunSchema = z
  .object({
    runId: z.string().trim().min(8).max(255),
    status: StatusSchema,
    question: z.string().trim().min(4).max(200),
    platforms: z.array(PlatformSchema).min(1).max(6),
    repeatPerPlatform: z.literal(5),
    expectedItems: z.number().int().positive().max(30),
    completedItems: z.number().int().nonnegative().max(30),
    failedItems: z.number().int().nonnegative().max(30),
    submittedAt: z.string().max(80).optional(),
    nextPollAt: z.string().max(80).optional(),
    records: z.array(RecordSchema).max(30).optional(),
    error: z.string().max(2000).optional(),
  })
  .passthrough();

export class GeoMonitorContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeoMonitorContractError";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Treat the Agent response as untrusted. Only customer-safe final text,
 * allowlisted media links and the two distinct source collections survive this
 * adapter; page screenshots and model reasoning remain impossible to return.
 */
export function normalizeMonitorRun(
  payload: unknown,
  expected?: {
    question?: string;
    platforms?: GeoMonitorPlatformId[];
    runId?: string;
  },
): BrokerMonitorRun {
  const root = asRecord(payload);
  const candidate = root.run ?? root.data ?? payload;
  const parsed = RunSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new GeoMonitorContractError(
      `监控服务返回结构无效：${parsed.error.issues[0]?.message || "unknown"}`,
    );
  }
  const run = parsed.data;
  const uniquePlatforms = Array.from(new Set(run.platforms));
  const expectedCount = uniquePlatforms.length * 5;
  if (
    uniquePlatforms.length !== run.platforms.length ||
    run.expectedItems !== expectedCount ||
    run.completedItems + run.failedItems > run.expectedItems
  ) {
    throw new GeoMonitorContractError("监控任务数量或平台范围校验失败");
  }
  if (expected?.runId && run.runId !== expected.runId)
    throw new GeoMonitorContractError("监控任务身份不匹配");
  if (expected?.question && run.question !== expected.question)
    throw new GeoMonitorContractError("监控问题快照不匹配");
  if (expected?.platforms) {
    const actual = Array.from(uniquePlatforms).sort().join(",");
    const wanted = Array.from(new Set(expected.platforms)).sort().join(",");
    if (actual !== wanted)
      throw new GeoMonitorContractError("监控平台范围不匹配");
  }

  const slots = new Set<string>();
  const recordIds = new Set<string>();
  const records: BrokerMonitorRecord[] | undefined = run.records?.map(
    (record) => {
      if (!uniquePlatforms.includes(record.platform))
        throw new GeoMonitorContractError("监控结果包含范围外平台");
      const slot = `${record.platform}:${record.runIndex}`;
      if (slots.has(slot))
        throw new GeoMonitorContractError("监控结果包含重复的平台轮次");
      slots.add(slot);
      if (recordIds.has(record.recordId))
        throw new GeoMonitorContractError("监控结果包含重复的记录 ID");
      recordIds.add(record.recordId);
      if (
        record.status === "completed" &&
        (!record.answerText?.trim() || record.error)
      ) {
        throw new GeoMonitorContractError("完成记录缺少最终文字或同时包含错误");
      }
      return {
        recordId: record.recordId,
        platform: record.platform,
        runIndex: record.runIndex,
        status: record.status,
        answerText: record.answerText,
        media: record.media.flatMap((item) => {
          const normalized = normalizePublicMedia(item);
          return normalized ? [normalized] : [];
        }),
        citations: record.citations.map(normalizeSource),
        references: record.references.map(normalizeSource),
        error: record.error,
        completedAt: record.completedAt,
      };
    },
  );
  if (records) {
    const observedCompleted = records.filter(
      (record) => record.status === "completed",
    ).length;
    const observedFailed = records.filter((record) =>
      ["failed", "stopped", "error"].includes(record.status),
    ).length;
    if (
      observedCompleted !== run.completedItems ||
      observedFailed !== run.failedItems
    ) {
      throw new GeoMonitorContractError("监控记录状态与汇总数量不一致");
    }
  }
  if (
    ["completed", "partial_review_required"].includes(run.status) &&
    (records?.length !== run.expectedItems ||
      records.some(
        (record) =>
          !["completed", "failed", "stopped", "error"].includes(record.status),
      ))
  ) {
    throw new GeoMonitorContractError("监控完成快照不完整");
  }
  const publicStatus =
    run.status === "completed" &&
    (run.failedItems > 0 || run.completedItems !== run.expectedItems)
      ? "partial_review_required"
      : run.status;

  return {
    runId: run.runId,
    status: publicStatus,
    question: run.question,
    platforms: uniquePlatforms,
    repeatPerPlatform: 5,
    expectedItems: run.expectedItems,
    completedItems: run.completedItems,
    failedItems: run.failedItems,
    submittedAt: run.submittedAt,
    nextPollAt: run.nextPollAt,
    records,
    error: run.error,
  };
}

function normalizePublicMedia(
  media: z.infer<typeof MediaSchema>,
): BrokerMonitorMedia | undefined {
  const url = safePublicMediaUrl(media.url);
  if (!url) return undefined;
  const thumbnailUrl = safePublicMediaUrl(media.thumbnailUrl);
  return {
    type: media.type,
    url,
    ...(media.title ? { title: media.title } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
  };
}

function safePublicMediaUrl(value?: string) {
  const normalized = safeHttpUrl(value);
  if (!normalized) return undefined;
  const url = new URL(normalized);
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    url.protocol !== "https:" ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    /^[0-9.]+$/.test(hostname) ||
    hostname.includes(":")
  ) {
    return undefined;
  }
  return normalized;
}

function normalizeSource(source: z.infer<typeof SourceSchema>): {
  title?: string;
  url?: string;
  domain?: string;
} {
  if (typeof source === "string") {
    const url = safeHttpUrl(source);
    if (url) return { title: source, url };
    return { title: source };
  }
  return {
    title: source.title || source.name || source.source,
    url: safeHttpUrl(source.url),
    domain: source.domain,
  };
}

function safeHttpUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function toPublicMonitorView(run: BrokerMonitorRun) {
  return {
    runId: run.runId,
    status: run.status,
    question: run.question,
    platforms: run.platforms,
    repeatPerPlatform: run.repeatPerPlatform,
    expectedRecords: run.expectedItems,
    completedRecords: run.completedItems,
    failedRecords: run.failedItems,
    startedAt: run.submittedAt,
    nextPollAt: run.nextPollAt,
    records: run.records,
    error: run.error,
  };
}
