import { isIP } from "node:net";
import { z } from "zod";
import {
  GEO_MONITOR_PLATFORM_IDS,
  type BrokerMonitorMedia,
  type BrokerMonitorRecord,
  type BrokerMonitorRun,
  type GeoMonitorPlatformId,
} from "./broker";
import type { ResultQuality } from "./output";

type NormalizedMonitorRun = BrokerMonitorRun & {
  quality?: ResultQuality;
};

export const MIN_MONITOR_ASSESSMENT_RESPONSES_PER_PLATFORM = 3;

export function monitorAssessmentEligibility(monitorRun: BrokerMonitorRun) {
  const successfulByPlatform = new Map<GeoMonitorPlatformId, number>(
    monitorRun.platforms.map((platform) => [platform, 0]),
  );
  for (const record of monitorRun.records || []) {
    if (
      record.status !== "completed" ||
      !record.answerText?.trim() ||
      record.error
    ) {
      continue;
    }
    successfulByPlatform.set(
      record.platform,
      (successfulByPlatform.get(record.platform) || 0) + 1,
    );
  }
  const successfulResponses = Array.from(successfulByPlatform.values()).reduce(
    (total, count) => total + count,
    0,
  );
  const failedResponses = Math.max(
    0,
    monitorRun.expectedItems - successfulResponses,
  );
  const recordsAvailable = Array.isArray(monitorRun.records);
  const fullSample =
    recordsAvailable &&
    monitorRun.status === "completed" &&
    monitorRun.platforms.every(
      (platform) =>
        successfulByPlatform.get(platform) === monitorRun.repeatPerPlatform,
    );
  const terminalPartialEligible =
    recordsAvailable &&
    monitorRun.status === "partial_review_required" &&
    monitorRun.platforms.every(
      (platform) =>
        (successfulByPlatform.get(platform) || 0) >=
        MIN_MONITOR_ASSESSMENT_RESPONSES_PER_PLATFORM,
    );
  return {
    successfulByPlatform,
    successfulResponses,
    failedResponses,
    fullSample,
    terminalPartialEligible,
    assessmentEligible: fullSample || terminalPartialEligible,
  };
}

export function monitorBrandMentionRate(monitorRun: BrokerMonitorRun) {
  const observed = (monitorRun.records || []).filter(
    (record) =>
      record.status === "completed" &&
      Boolean(record.answerText?.trim()) &&
      !record.error &&
      Object.prototype.hasOwnProperty.call(record, "mentionPosition"),
  );
  if (observed.length === 0) return undefined;
  return {
    current:
      observed.filter((record) => record.mentionPosition !== null).length /
      observed.length,
    observedAnswers: observed.length,
  };
}

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
      site: z.string().trim().max(1000).optional(),
      url: z.string().trim().max(4096).optional(),
      domain: z.string().trim().max(255).optional(),
      summary: z.string().trim().max(2000).optional(),
      publishTime: z.string().trim().max(80).optional(),
      index: z.number().int().min(0).max(1_000_000_000).optional(),
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
    media: z.array(z.unknown()).max(24).default([]),
    // Optional on purpose: an explicitly supplied empty canonical collection
    // must not fall back to stale legacy citation/reference fields.
    sources: z.array(z.unknown()).max(200).optional(),
    citations: z.array(z.unknown()).max(100).optional(),
    references: z.array(z.unknown()).max(200).optional(),
    citationList: z.array(z.unknown()).max(100).optional(),
    referenceList: z.array(z.unknown()).max(200).optional(),
    searchKeywords: z
      .array(z.string().trim().min(1).max(500))
      .max(50)
      .optional(),
    recommendedQuestions: z
      .array(z.string().trim().min(1).max(500))
      .max(20)
      .optional(),
    mentionPosition: z.number().int().positive().nullable().optional(),
    mentionContext: z.string().trim().max(2000).nullable().optional(),
    sentiment: z
      .enum(["positive", "neutral", "negative"])
      .nullable()
      .optional(),
    categoryRanking: z
      .object({
        categoryName: z.string().trim().min(1).max(500),
        rank: z.number().int().positive().max(1_000_000),
      })
      .nullable()
      .optional(),
    keywordEvaluations: z
      .array(
        z.object({
          keyword: z.string().trim().min(1).max(200),
          nature: z.enum(["positive", "neutral", "negative"]),
          context: z.string().trim().max(2000).optional(),
        }),
      )
      .max(100)
      .optional(),
    screenshot: z
      .object({
        available: z.boolean(),
        // Dashboard may expose its own guarded URL. Website deliberately
        // ignores it and builds a project-scoped same-origin URL instead.
        url: z.string().trim().max(4096).optional(),
      })
      .optional(),
    error: z.string().max(2000).optional(),
    completedAt: z.string().max(80).optional(),
  })
  .passthrough();
const RunSchema = z
  .object({
    runId: z.string().trim().min(8).max(255),
    status: StatusSchema,
    question: z.string().trim().min(4).max(2000),
    platforms: z.array(PlatformSchema).min(1).max(6),
    repeatPerPlatform: z.literal(5),
    expectedItems: z.number().int().positive().max(30),
    completedItems: z.number().int().nonnegative().max(30),
    failedItems: z.number().int().nonnegative().max(30),
    submittedAt: z.string().max(80).optional(),
    nextPollAt: z.string().max(80).optional(),
    monitorKeyword: z.string().trim().min(1).max(2000).optional(),
    screenshot: z.union([z.literal(0), z.literal(1)]).optional(),
    region: z
      .object({
        scope: z.enum(["domestic", "overseas"]),
        code: z.string().trim().min(1).max(64),
        label: z.string().trim().min(1).max(100),
      })
      .optional(),
    screenshotEnabled: z.boolean().optional(),
    records: z.array(z.unknown()).max(30).optional(),
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
 * allowlisted media links and public monitoring fields survive this adapter;
 * raw screenshot URLs and model reasoning remain impossible to return.
 */
export function normalizeMonitorRun(
  payload: unknown,
  expected?: {
    question?: string;
    platforms?: GeoMonitorPlatformId[];
    runId?: string;
  },
  options: {
    allowTerminalSummaryWithoutRecords?: boolean;
  } = {},
): NormalizedMonitorRun {
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
  let droppedRecords = 0;
  let droppedOptionalItems = 0;
  const records: BrokerMonitorRecord[] | undefined = run.records
    ? run.records.flatMap((candidate) => {
        const parsedRecord = RecordSchema.safeParse(candidate);
        if (!parsedRecord.success) {
          droppedRecords += 1;
          return [];
        }
        const record = parsedRecord.data;
        const slot = `${record.platform}:${record.runIndex}`;
        if (
          !uniquePlatforms.includes(record.platform) ||
          slots.has(slot) ||
          recordIds.has(record.recordId) ||
          (record.status === "completed" &&
            (!record.answerText?.trim() || record.error))
        ) {
          droppedRecords += 1;
          return [];
        }
        slots.add(slot);
        recordIds.add(record.recordId);

        const media = record.media.flatMap((item) => {
          const parsed = MediaSchema.safeParse(item);
          if (!parsed.success) {
            droppedOptionalItems += 1;
            return [];
          }
          const normalized = normalizePublicMedia(parsed.data);
          if (!normalized) droppedOptionalItems += 1;
          return normalized ? [normalized] : [];
        });
        const normalizeSourceCollection = (
          values: unknown[],
          mode: "canonical" | "preserve",
        ) => {
          const valid = values.flatMap((item) => {
            const parsed = SourceSchema.safeParse(item);
            if (!parsed.success) {
              droppedOptionalItems += 1;
              return [];
            }
            const normalized = normalizeSource(parsed.data);
            if (!normalized.title && !normalized.url && !normalized.domain) {
              droppedOptionalItems += 1;
              return [];
            }
            return [normalized];
          });
          if (mode === "canonical") return normalizeMonitorSources(valid);
          const seen = new Set<string>();
          return valid.filter((source) => {
            const identity = JSON.stringify([
              source.index,
              source.title,
              source.url,
              source.site,
              source.domain,
              source.summary,
              source.publishTime,
            ]);
            if (seen.has(identity)) return false;
            seen.add(identity);
            return true;
          });
        };
        const rawCitations = record.citationList ?? record.citations ?? [];
        const rawReferences = record.referenceList ?? record.references ?? [];
        const rawSources =
          record.sources !== undefined
            ? record.sources
            : [...rawCitations, ...rawReferences];
        const citationList = normalizeSourceCollection(
          rawCitations,
          "preserve",
        );
        const referenceList = normalizeSourceCollection(
          rawReferences,
          "preserve",
        );
        const sourceBreakdownAvailable =
          Object.prototype.hasOwnProperty.call(record, "citationList") ||
          Object.prototype.hasOwnProperty.call(record, "referenceList");
        return [
          {
            recordId: record.recordId,
            platform: record.platform,
            runIndex: record.runIndex,
            status: record.status,
            answerText: record.answerText,
            media,
            sources: normalizeSourceCollection(rawSources, "canonical"),
            ...(sourceBreakdownAvailable
              ? {
                  citations: citationList,
                  references: referenceList,
                  sourceBreakdownAvailable: true,
                }
              : {}),
            ...(record.searchKeywords
              ? { searchKeywords: Array.from(new Set(record.searchKeywords)) }
              : {}),
            ...(record.recommendedQuestions
              ? {
                  recommendedQuestions: Array.from(
                    new Set(record.recommendedQuestions),
                  ),
                }
              : {}),
            ...(Object.prototype.hasOwnProperty.call(record, "mentionPosition")
              ? { mentionPosition: record.mentionPosition }
              : {}),
            ...(Object.prototype.hasOwnProperty.call(record, "mentionContext")
              ? { mentionContext: record.mentionContext }
              : {}),
            ...(Object.prototype.hasOwnProperty.call(record, "sentiment")
              ? { sentiment: record.sentiment }
              : {}),
            ...(Object.prototype.hasOwnProperty.call(record, "categoryRanking")
              ? { categoryRanking: record.categoryRanking }
              : {}),
            ...(record.keywordEvaluations
              ? { keywordEvaluations: record.keywordEvaluations }
              : {}),
            ...(record.screenshot?.available === true
              ? { screenshotAvailable: true }
              : {}),
            error: record.error,
            completedAt: record.completedAt,
          },
        ];
      })
    : undefined;
  const observedCompleted = records
    ? records.filter((record) => record.status === "completed").length
    : run.completedItems;
  const observedFailed = records
    ? records.filter((record) =>
        ["failed", "stopped", "error"].includes(record.status),
      ).length
    : run.failedItems;
  const terminal = ["completed", "partial_review_required"].includes(
    run.status,
  );
  const summaryOnlyAccepted =
    options.allowTerminalSummaryWithoutRecords === true &&
    records === undefined;
  const incompleteTerminalRecords =
    terminal &&
    !summaryOnlyAccepted &&
    (records === undefined ||
      records.length !== run.expectedItems ||
      records.some(
        (record) =>
          !["completed", "failed", "stopped", "error"].includes(record.status),
      ));
  const summaryMismatch =
    records !== undefined &&
    (observedCompleted !== run.completedItems ||
      observedFailed !== run.failedItems);
  const samplePartial =
    run.status === "partial_review_required" ||
    (terminal &&
      (incompleteTerminalRecords ||
        summaryMismatch ||
        droppedRecords > 0 ||
        observedFailed > 0 ||
        observedCompleted !== run.expectedItems));
  const evidencePartial = terminal && droppedOptionalItems > 0;
  const qualityPartial = samplePartial || evidencePartial;
  const publicStatus = samplePartial ? "partial_review_required" : run.status;
  const retainedRecordCount =
    records?.length ??
    (summaryOnlyAccepted ? observedCompleted + observedFailed : 0);
  const droppedCount = Math.max(
    droppedRecords,
    run.expectedItems - retainedRecordCount,
    0,
  );
  const normalizedRun: BrokerMonitorRun = {
    runId: run.runId,
    status: publicStatus,
    question: run.question,
    platforms: uniquePlatforms,
    repeatPerPlatform: 5,
    expectedItems: run.expectedItems,
    completedItems: observedCompleted,
    failedItems: terminal
      ? Math.max(0, run.expectedItems - observedCompleted)
      : observedFailed,
    submittedAt: run.submittedAt,
    nextPollAt: run.nextPollAt,
    ...(run.region
      ? {
          region: {
            edition: run.region.scope,
            code: run.region.code,
            label: run.region.label,
          },
        }
      : {}),
    screenshotEnabled: run.screenshot === 1,
    records,
    error: run.error,
  };
  const assessmentEligibility = monitorAssessmentEligibility(normalizedRun);
  const quality: ResultQuality | undefined = terminal
    ? {
        completeness: qualityPartial ? "partial" : "complete",
        stats: {
          acceptedCount: retainedRecordCount,
          expectedCount: run.expectedItems,
          droppedCount,
        },
        ...(qualityPartial
          ? {
              warnings: [
                ...(samplePartial
                  ? [
                      {
                        code: "RESULT_INCOMPLETE" as const,
                        area: "monitoring",
                      },
                    ]
                  : []),
                ...(droppedCount > 0
                  ? [
                      {
                        code: "ITEM_DROPPED" as const,
                        area: "monitoring",
                      },
                    ]
                  : []),
                ...(droppedOptionalItems > 0
                  ? [
                      {
                        code: "EVIDENCE_INCOMPLETE" as const,
                        area: "monitoring.sources_media",
                      },
                    ]
                  : []),
              ],
            }
          : {}),
        downstreamEligible: assessmentEligibility.assessmentEligible,
      }
    : undefined;

  return {
    ...normalizedRun,
    ...(quality ? { quality } : {}),
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
  index?: number;
  title?: string;
  url?: string;
  site?: string;
  domain?: string;
  summary?: string;
  publishTime?: string;
} {
  if (typeof source === "string") {
    const url = safeHttpUrl(source);
    if (url) return { title: source, url };
    if (/^[a-z][a-z0-9+.-]*:/i.test(source)) return {};
    return { title: source };
  }
  const normalizedUrl = safeHttpUrl(source.url);
  if (source.url && !normalizedUrl) return {};
  return {
    index: source.index,
    title: source.title || source.name,
    url: normalizedUrl,
    site: source.site || source.source,
    domain: source.domain,
    summary: source.summary,
    publishTime: source.publishTime,
  };
}

const TRACKING_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "dclid",
  "msclkid",
  "mc_cid",
  "mc_eid",
  "igshid",
  "ref_src",
]);

function privateHostname(value: string) {
  const hostname = value
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return true;
  }
  if (isIP(hostname) === 4) {
    const octets = hostname.split(".").map(Number);
    return (
      octets[0] === 0 ||
      octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      octets[0] >= 224
    );
  }
  if (isIP(hostname) === 6) {
    if (hostname.startsWith("::ffff:")) {
      const mappedTail = hostname.slice("::ffff:".length);
      if (isIP(mappedTail) === 4) return privateHostname(mappedTail);
      const mappedHex = /^(?:0:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(
        mappedTail,
      );
      if (mappedHex) {
        const high = Number.parseInt(mappedHex[1], 16);
        const low = Number.parseInt(mappedHex[2], 16);
        return privateHostname(
          [high >> 8, high & 0xff, low >> 8, low & 0xff].join("."),
        );
      }
      return true;
    }
    return (
      hostname === "::" ||
      hostname === "::1" ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd") ||
      /^fe[89ab]/.test(hostname)
    );
  }
  return false;
}

function sourceIdentity(source: ReturnType<typeof normalizeSource>) {
  if (source.url) return `url:${source.url}`;
  const title = (source.title || "").trim().toLocaleLowerCase("en-US");
  const domain = (source.domain || "").trim().toLocaleLowerCase("en-US");
  return `label:${title}\u0000${domain}`;
}

export function normalizeMonitorSources(
  values: Array<z.infer<typeof SourceSchema>>,
) {
  const byIdentity = new Map<
    string,
    {
      index?: number;
      title?: string;
      url?: string;
      site?: string;
      domain?: string;
      summary?: string;
      publishTime?: string;
    }
  >();
  for (const value of values) {
    const source = normalizeSource(value);
    if (!source.title && !source.url && !source.domain) continue;
    const identity = sourceIdentity(source);
    const existing = byIdentity.get(identity);
    if (!existing) {
      byIdentity.set(identity, source);
    } else {
      const populatedFields = (item: typeof source) =>
        Object.values(item).filter(
          (value) => typeof value === "string" && value.trim().length > 0,
        ).length;
      const informationLength = (item: typeof source) =>
        Object.values(item).reduce<number>(
          (total, value) =>
            total + (typeof value === "string" ? value.trim().length : 0),
          0,
        );
      const sourceScore =
        populatedFields(source) * 10_000 + informationLength(source);
      const existingScore =
        populatedFields(existing) * 10_000 + informationLength(existing);
      const preferred = sourceScore > existingScore ? source : existing;
      const secondary = preferred === source ? existing : source;
      byIdentity.set(identity, {
        index: preferred.index ?? secondary.index,
        title: preferred.title || secondary.title,
        url: preferred.url || secondary.url,
        site: preferred.site || secondary.site,
        domain: preferred.domain || secondary.domain,
        summary: preferred.summary || secondary.summary,
        publishTime: preferred.publishTime || secondary.publishTime,
      });
    }
    if (byIdentity.size >= 200) break;
  }
  return Array.from(byIdentity.values());
}

function safeHttpUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      privateHostname(url.hostname)
    ) {
      return undefined;
    }
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (
        key.toLowerCase().startsWith("utm_") ||
        TRACKING_PARAMETERS.has(key.toLowerCase())
      ) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return undefined;
  }
}

export function toPublicMonitorView(run: BrokerMonitorRun) {
  const quality = (run as NormalizedMonitorRun).quality;
  return {
    runId: run.runId,
    status: run.status,
    platforms: run.platforms,
    repeatPerPlatform: run.repeatPerPlatform,
    expectedRecords: run.expectedItems,
    completedRecords: run.completedItems,
    failedRecords: run.failedItems,
    startedAt: run.submittedAt,
    nextPollAt: run.nextPollAt,
    ...(run.region ? { region: run.region } : {}),
    ...(run.screenshotEnabled ? { screenshotEnabled: true } : {}),
    records: run.records,
    error: run.error,
    ...(quality ? { quality } : {}),
  };
}
