import type {
  GeoAnswerMedia,
  GeoAnswerSource,
  GeoAssessmentDimension,
  GeoAssessmentDimensionId,
  GeoAssessmentPlatformBreakdown,
  GeoAssessmentPriorityAction,
  GeoAssessmentResult,
  GeoAssessmentStatus,
  GeoExecutionLog,
  GeoCrawlProgress,
  GeoFileReference,
  GeoKnowledgeComparison,
  GeoKnowledgeComparisonStatus,
  GeoKnowledgeAsset,
  GeoKnowledgeBase,
  GeoKnowledgeCompleteness,
  GeoKnowledgeAcquisitionCount,
  GeoKnowledgeMetric,
  GeoKnowledgeSection,
  GeoKnowledgeSource,
  GeoMonitoringAnswer,
  GeoMonitoringEdition,
  GeoMonitoringRegion,
  GeoMonitoringRegionCatalog,
  GeoMonitoringResult,
  GeoMonitoringStatus,
  GeoOptimizationForecastResult,
  GeoPlatformId,
  GeoProject,
  GeoProjectStatus,
  GeoQuestion,
  GeoQuestionCategory,
  GeoQuestionRecommendation,
  GeoResultQuality,
  GeoServiceActivation,
  GeoServiceCategory,
  GeoServiceContractProfile,
  GeoStage,
} from "./types";
import { normalizeBusinessOwnerName } from "@shared/business-owner-name";
import { resolveGeoMonitoringEdition } from "./types";
import { localizedUserFacingError } from "./error-localization";
import { visibleKnowledgeSectionSummary } from "./knowledge-section-markdown";

const GEO_API_ROOT = "/api/geo";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const GEO_PROJECT_CREATE_TIMEOUT_MS = 75_000;
const GEO_MONITOR_START_TIMEOUT_MS = 75_000;
const UPLOAD_REQUEST_TIMEOUT_MS = 5 * 60_000;
const UPLOAD_BROWSER_STALL_TIMEOUT_MS = 2 * 60_000;
const UPLOAD_SERVER_RESPONSE_TIMEOUT_MS = 6 * 60_000;
const UPLOAD_INIT_RETRY_DELAY_MS = 1_000;
const UPLOAD_TRANSFER_RETRY_DELAYS_MS = [1_000, 3_000] as const;
const UPLOAD_STATUS_POLL_INTERVAL_MS = 1_000;
const UPLOAD_STATUS_RETRY_DELAYS_MS = [1_000, 3_000, 5_000] as const;

type JsonRecord = Record<string, unknown>;
type TimedRequestInit = RequestInit & { timeoutMs?: number };
export type GeoUploadReservation = GeoFileReference & {
  uploadToken: string;
  sourceName: string;
  sourceLastModified: number;
  traceId?: string;
  requiresStatusOnly?: boolean;
};

export type GeoUploadedFile = GeoUploadReservation;

export type GeoUploadProgress = {
  phase:
    | "reserving"
    | "uploading"
    | "awaiting_dashboard"
    | "reconciling"
    | "retrying"
    | "confirmed";
  /** One-based index of the file currently being transferred. */
  fileIndex: number;
  fileCount: number;
  filename: string;
  fileLoadedBytes: number;
  fileTotalBytes: number;
  batchLoadedBytes: number;
  batchTotalBytes: number;
  confirmedFiles: number;
};

export type GeoPaymentMethod = "alipay" | "wxpay";

export type GeoServicePaymentMethod = GeoPaymentMethod | "bank_transfer";

export type GeoPaymentCheckout = {
  authorization: string;
  orderId: string;
  amountFen: number;
  unitPriceFen: number;
  answersPerPlatform: number;
  expiresAt: string;
  action: "https://zpayz.cn/submit.php";
  method: "POST";
  fields: Record<string, string>;
};

export type GeoServicePaymentCheckout = {
  authorization: string;
  orderId: string;
  amountFen: number;
  category: GeoServiceCategory;
  billingMonths: 1;
  expiresAt: string;
  action: "https://zpayz.cn/submit.php";
  method: "POST";
  fields: Record<string, string>;
};

export type GeoPaymentStatus = {
  status: "pending" | "paid" | "review_required";
  orderId: string;
  amountFen: number;
  tradeNo?: string;
  paidAt?: string;
  message?: string;
};

const GEO_PLATFORM_IDS: GeoPlatformId[] = [
  "doubao",
  "yuanbao",
  "deepseek",
  "baiduai",
  "qianwen",
  "kimi",
  "chatgpt",
];

const ASSESSMENT_DIMENSIONS: Array<{
  id: GeoAssessmentDimensionId;
  label: string;
  maxScore: number;
}> = [
  { id: "semantic_visibility", label: "语义可见度", maxScore: 30 },
  { id: "semantic_coherence", label: "语义一致性", maxScore: 20 },
  { id: "semantic_richness", label: "语义多样性", maxScore: 20 },
  { id: "semantic_authority", label: "语义权威性", maxScore: 15 },
  { id: "competitive_advantage", label: "竞品占优度", maxScore: 15 },
];

export class GeoApiError extends Error {
  readonly code?: string;
  readonly status: number;
  readonly details?: JsonRecord;

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: JsonRecord,
  ) {
    super(message);
    this.name = "GeoApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function hasOwnField(record: JsonRecord, ...keys: string[]) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(record, key));
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseStructuredOutput(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  for (const item of value) {
    const record = asRecord(item);
    const candidate =
      record.json ??
      record.data ??
      record.result ??
      record.content ??
      record.text ??
      item;
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate))
      return candidate;
    if (typeof candidate === "string") {
      const cleaned = candidate
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");
      try {
        const parsed = JSON.parse(cleaned);
        if (parsed && typeof parsed === "object") return parsed;
      } catch {
        // Other output blocks may contain narrative text before the final JSON block.
      }
    }
  }
  return value;
}

function textValue(...values: unknown[]): string | undefined {
  return values
    .find(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    )
    ?.trim();
}

function timestampValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const numeric =
      typeof value === "number"
        ? value
        : typeof value === "string" && /^\d{10,13}$/.test(value.trim())
          ? Number(value.trim())
          : undefined;
    const timestamp =
      numeric !== undefined && Number.isFinite(numeric)
        ? numeric < 100_000_000_000
          ? numeric * 1_000
          : numeric
        : typeof value === "string"
          ? Date.parse(value.trim())
          : Number.NaN;
    if (!Number.isFinite(timestamp)) continue;
    const date = new Date(timestamp);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return undefined;
}

function numberValue(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (
      typeof value === "string" &&
      value.trim() &&
      Number.isFinite(Number(value))
    )
      return Number(value);
  }
  return undefined;
}

function normalizePaymentCheckout(payload: unknown): GeoPaymentCheckout {
  const root = asRecord(payload);
  const payment = asRecord(root.payment ?? root.data ?? payload);
  const fields = Object.fromEntries(
    Object.entries(asRecord(payment.fields)).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  const authorization = textValue(payment.authorization);
  const orderId = textValue(payment.orderId, payment.out_trade_no);
  const amountFen = numberValue(payment.amountFen);
  const unitPriceFen = numberValue(payment.unitPriceFen);
  const answersPerPlatform = numberValue(payment.answersPerPlatform);
  const expiresAt = textValue(payment.expiresAt);
  const action = textValue(payment.action);
  const method = textValue(payment.method)?.toUpperCase();
  const requiredFields = [
    "pid",
    "type",
    "out_trade_no",
    "notify_url",
    "return_url",
    "name",
    "money",
    "param",
    "sign",
    "sign_type",
  ];
  if (
    !authorization ||
    !orderId ||
    !/^\d{1,32}$/.test(orderId) ||
    !Number.isSafeInteger(amountFen) ||
    amountFen! <= 0 ||
    !Number.isSafeInteger(unitPriceFen) ||
    unitPriceFen! <= 0 ||
    !Number.isSafeInteger(answersPerPlatform) ||
    answersPerPlatform! <= 0 ||
    !expiresAt ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    action !== "https://zpayz.cn/submit.php" ||
    method !== "POST" ||
    requiredFields.some((key) => !fields[key])
  ) {
    throw new GeoApiError(
      "支付订单响应无效，请勿继续付款。",
      502,
      "INVALID_PAYMENT_CHECKOUT",
    );
  }
  return {
    authorization,
    orderId,
    amountFen: amountFen!,
    unitPriceFen: unitPriceFen!,
    answersPerPlatform: answersPerPlatform!,
    expiresAt,
    action,
    method,
    fields,
  };
}

function normalizeServicePaymentCheckout(
  payload: unknown,
): GeoServicePaymentCheckout {
  const root = asRecord(payload);
  const payment = asRecord(root.payment ?? root.data ?? payload);
  const fields = Object.fromEntries(
    Object.entries(asRecord(payment.fields)).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  const authorization = textValue(payment.authorization);
  const orderId = textValue(payment.orderId, payment.out_trade_no);
  const amountFen = numberValue(payment.amountFen);
  const category = textValue(payment.category);
  const billingMonths = numberValue(payment.billingMonths);
  const expiresAt = textValue(payment.expiresAt);
  const action = textValue(payment.action);
  const method = textValue(payment.method)?.toUpperCase();
  const requiredFields = [
    "pid",
    "type",
    "out_trade_no",
    "notify_url",
    "return_url",
    "name",
    "money",
    "param",
    "sign",
    "sign_type",
  ];
  if (
    !authorization ||
    !orderId ||
    !/^\d{1,32}$/.test(orderId) ||
    !Number.isSafeInteger(amountFen) ||
    amountFen! <= 0 ||
    !["reputation", "product_scenario", "competitor_comparison"].includes(
      category ?? "",
    ) ||
    billingMonths !== 1 ||
    !expiresAt ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    action !== "https://zpayz.cn/submit.php" ||
    method !== "POST" ||
    requiredFields.some((key) => !fields[key])
  ) {
    throw new GeoApiError(
      "服务订单响应无效，请勿继续付款。",
      502,
      "INVALID_SERVICE_PAYMENT_CHECKOUT",
    );
  }
  return {
    authorization,
    orderId,
    amountFen: amountFen!,
    category: category as GeoServiceCategory,
    billingMonths: 1,
    expiresAt,
    action,
    method,
    fields,
  };
}

function normalizePaymentStatus(payload: unknown): GeoPaymentStatus {
  const root = asRecord(payload);
  const payment = asRecord(root.payment ?? root.data ?? payload);
  const statusValue = textValue(payment.status);
  const orderId = textValue(payment.orderId, payment.out_trade_no);
  const amountFen = numberValue(payment.amountFen);
  const tradeNo = textValue(payment.tradeNo);
  const paidAt = textValue(payment.paidAt);
  const settled = statusValue === "paid" || statusValue === "review_required";
  if (
    !["pending", "paid", "review_required"].includes(statusValue ?? "") ||
    !orderId ||
    !/^\d{1,32}$/.test(orderId) ||
    !Number.isSafeInteger(amountFen) ||
    amountFen! <= 0 ||
    (settled &&
      (!tradeNo ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(tradeNo) ||
        !paidAt ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(paidAt) ||
        !Number.isFinite(Date.parse(paidAt)) ||
        new Date(Date.parse(paidAt)).toISOString() !== paidAt))
  ) {
    throw new GeoApiError(
      "支付状态响应无效，请稍后重试。",
      502,
      "INVALID_PAYMENT_STATUS",
    );
  }
  return {
    status: statusValue as GeoPaymentStatus["status"],
    orderId,
    amountFen: amountFen!,
    tradeNo,
    paidAt,
    message: textValue(payment.message),
  };
}

function clampProgress(value: unknown): number {
  const progress = numberValue(value) ?? 0;
  return Math.max(
    0,
    Math.min(
      100,
      progress <= 1 ? Math.round(progress * 100) : Math.round(progress),
    ),
  );
}

function isJsonContentType(value: string | null): boolean {
  const mediaType = String(value ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  return mediaType === "application/json" || mediaType.endsWith("+json");
}

function boundedApiMessage(...values: unknown[]): string | undefined {
  const value = textValue(...values);
  if (!value) return undefined;
  const message = value.replace(/\s+/g, " ").trim();
  return message.length <= 240 ? message : `${message.slice(0, 239)}…`;
}

async function parseResponse(
  response: Response,
  options: { requireJsonOnSuccess?: boolean } = {},
): Promise<unknown> {
  const requireJsonOnSuccess = options.requireJsonOnSuccess ?? true;
  if (!isJsonContentType(response.headers.get("content-type"))) {
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) {
      throw new GeoApiError(
        "请求未完成，请稍后重试。",
        response.status,
        "INVALID_ERROR_RESPONSE",
      );
    }
    if (requireJsonOnSuccess) {
      throw new GeoApiError(
        "服务返回格式无效，请稍后重试。",
        502,
        "INVALID_RESPONSE_CONTENT_TYPE",
      );
    }
    return undefined;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new GeoApiError(
      response.ok
        ? "服务返回内容无效，请稍后重试。"
        : "请求未完成，请稍后重试。",
      response.ok ? 502 : response.status,
      response.ok ? "INVALID_JSON_RESPONSE" : "INVALID_ERROR_RESPONSE",
    );
  }

  if (!response.ok) {
    const record = asRecord(body);
    const error = asRecord(record.error);
    throw new GeoApiError(
      localizedUserFacingError(
        boundedApiMessage(error.message, record.message),
        response.status,
        "请求未完成，请稍后重试。",
      ),
      response.status,
      textValue(error.code, record.code),
      record,
    );
  }

  return body;
}

function requestAbortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("请求已取消。", "AbortError");
}

async function withRequestControl<T>(
  input: {
    signal?: AbortSignal | null;
    timeoutMs: number;
  },
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const callerSignal = input.signal;
  if (callerSignal?.aborted) throw requestAbortReason(callerSignal);

  const controller = new AbortController();
  let timedOut = false;
  const timeoutMs =
    Number.isFinite(input.timeoutMs) && input.timeoutMs > 0
      ? Math.floor(input.timeoutMs)
      : DEFAULT_REQUEST_TIMEOUT_MS;
  const forwardAbort = () =>
    controller.abort(requestAbortReason(callerSignal!));
  callerSignal?.addEventListener("abort", forwardAbort, { once: true });
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("请求超时。", "TimeoutError"));
  }, timeoutMs);

  try {
    return await operation(controller.signal);
  } catch (error) {
    if (callerSignal?.aborted) throw requestAbortReason(callerSignal);
    if (timedOut) {
      throw new GeoApiError(
        "请求超时，请检查网络后重试。",
        408,
        "REQUEST_TIMEOUT",
      );
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", forwardAbort);
  }
}

async function requestJson(
  path: string,
  init: TimedRequestInit = {},
): Promise<unknown> {
  const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);
  if (
    requestInit.body &&
    typeof requestInit.body === "string" &&
    !headers.has("content-type")
  ) {
    headers.set("content-type", "application/json");
  }

  return withRequestControl(
    { signal: requestInit.signal, timeoutMs },
    async (signal) => {
      const response = await fetch(`${GEO_API_ROOT}${path}`, {
        credentials: "same-origin",
        cache: "no-store",
        ...requestInit,
        headers,
        signal,
      });
      return parseResponse(response);
    },
  );
}

function retryableProjectStartConfirmation(error: unknown): boolean {
  if (error instanceof GeoApiError) {
    return (
      error.status === 408 ||
      error.status === 429 ||
      (error.status >= 500 && error.status <= 599)
    );
  }
  // Browser fetch reports a connection-level failure (including status 0)
  // as a TypeError. Replaying the stable project request is safe because the
  // upload tokens and clientRequestId are unchanged.
  return error instanceof TypeError;
}

function projectStartConfirmationUnknown(error: unknown): GeoApiError {
  const status = error instanceof GeoApiError ? error.status : 502;
  return new GeoApiError(
    "启动确认暂未返回，重试将复用本次上传，不会重复上传文件。",
    status,
    "PROJECT_START_CONFIRMATION_UNKNOWN",
  );
}

function normalizeCategory(value: unknown): GeoQuestionCategory | undefined {
  const category = String(value ?? "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (
    [
      "reputation",
      "reputation_public_opinion",
      "public_opinion",
      "美誉舆情",
      "美誉度",
    ].includes(category)
  ) {
    return "reputation";
  }
  if (
    [
      "product_scenario",
      "product",
      "scenario",
      "qa",
      "产品场景",
      "产品优势",
    ].includes(category)
  ) {
    return "product_scenario";
  }
  if (
    ["industry_ranking", "ranking", "rank", "行业排名", "排名类"].includes(
      category,
    )
  ) {
    return "industry_ranking";
  }
  if (
    [
      "competitor_comparison",
      "competitor",
      "comparison",
      "竞品对比",
      "竞品比较",
    ].includes(category)
  ) {
    return "competitor_comparison";
  }
  return undefined;
}

function normalizeQuestions(value: unknown): GeoQuestion[] {
  const container = asRecord(value);
  const source = Array.isArray(value)
    ? value
    : asArray(
        container.questions ?? container.items ?? container.recommendations,
      );

  return source.flatMap((item, index) => {
    const record = asRecord(item);
    const question = textValue(record.question, record.text, record.title);
    if (!question) return [];
    const normalizedCategory = normalizeCategory(
      record.category ?? record.type,
    );
    const category = normalizedCategory ?? "reputation";
    const classificationState =
      textValue(record.classificationState, record.classification_state) ===
        "unclassified" || !normalizedCategory
        ? "unclassified"
        : "classified";

    return [
      {
        id:
          textValue(record.id, record.questionId) ?? `${category}-${index + 1}`,
        category,
        classificationState,
        question,
        rationale: textValue(
          record.rationale,
          record.reason,
          record.description,
        ),
        evidenceRefs: asArray(
          record.evidenceRefs ?? record.evidence_refs ?? record.sources,
        )
          .map((source) =>
            typeof source === "string"
              ? source
              : textValue(asRecord(source).id, asRecord(source).title),
          )
          .filter((source): source is string => Boolean(source)),
        selectable:
          classificationState === "classified" && record.selectable !== false,
      },
    ];
  });
}

function normalizeMetrics(value: unknown): GeoKnowledgeMetric[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => {
      const record = asRecord(item);
      const label = textValue(record.label, record.name, record.title);
      const metricValue = record.value ?? record.count;
      if (
        !label ||
        (typeof metricValue !== "number" && typeof metricValue !== "string")
      )
        return [];
      return [
        {
          key: textValue(record.key, record.id) ?? `metric-${index + 1}`,
          label,
          value: metricValue,
          detail: textValue(record.detail, record.description),
        },
      ];
    });
  }

  const record = asRecord(value);
  const labels: Record<string, string> = {
    pages: "官网页面",
    pageCount: "官网页面",
    sources: "证据来源",
    sourceCount: "证据来源",
    assets: "企业素材",
    assetCount: "企业素材",
    documents: "官方文件",
    documentCount: "官方文件",
    branches: "知识分支",
    nodes: "知识节点",
  };
  return Object.entries(record).flatMap(([key, metricValue]) => {
    if (
      (typeof metricValue !== "number" && typeof metricValue !== "string") ||
      !labels[key]
    )
      return [];
    return [{ key, label: labels[key], value: metricValue }];
  });
}

const MAX_KNOWLEDGE_COUNT = 1_000_000;

function normalizeKnowledgeCount(value: unknown): number {
  const parsed = numberValue(value);
  if (parsed === undefined) return 0;
  return Math.min(MAX_KNOWLEDGE_COUNT, Math.max(0, Math.floor(parsed)));
}

function normalizeAcquisitionCount(
  value: unknown,
): GeoKnowledgeAcquisitionCount | undefined {
  const record = asRecord(value);
  if (Object.keys(record).length === 0) return undefined;
  const total = normalizeKnowledgeCount(record.total);
  if (total <= 0) return undefined;
  return {
    completed: Math.min(total, normalizeKnowledgeCount(record.completed)),
    total,
  };
}

function normalizeKnowledgeCompleteness(
  value: unknown,
): GeoKnowledgeCompleteness | undefined {
  const record = asRecord(value);
  const rawCounts = asRecord(record.counts);
  if (Object.keys(rawCounts).length === 0) return undefined;

  const verifiedFirstParty = normalizeKnowledgeCount(
    rawCounts.verifiedFirstParty,
  );
  const verifiedAuthoritative = normalizeKnowledgeCount(
    rawCounts.verifiedAuthoritative,
  );
  const supportedThirdParty = normalizeKnowledgeCount(
    rawCounts.supportedThirdParty,
  );
  const inferred = normalizeKnowledgeCount(rawCounts.inferred);
  const needsVerification = normalizeKnowledgeCount(
    rawCounts.needsVerification,
  );
  const declaredNotApplicable = normalizeKnowledgeCount(
    rawCounts.notApplicable,
  );
  const statusTotal =
    verifiedFirstParty +
    verifiedAuthoritative +
    supportedThirdParty +
    inferred +
    needsVerification +
    declaredNotApplicable;
  const totalLeaves = normalizeKnowledgeCount(rawCounts.totalLeaves);
  if (
    totalLeaves <= 0 ||
    statusTotal !== totalLeaves ||
    declaredNotApplicable >= totalLeaves
  ) {
    return undefined;
  }

  const notApplicable = declaredNotApplicable;
  const applicableLeaves = totalLeaves - notApplicable;
  const sufficientlySourcedLeaves = Math.min(
    applicableLeaves,
    verifiedFirstParty + verifiedAuthoritative + supportedThirdParty,
  );
  const score =
    applicableLeaves > 0
      ? Math.round((sufficientlySourcedLeaves / applicableLeaves) * 100)
      : 0;
  const acquisition = asRecord(record.acquisition);

  return {
    score,
    label: textValue(record.label)?.slice(0, 80) || "知识库完整度",
    basis:
      textValue(record.basis)?.slice(0, 500) ||
      "证据完整度 = 已获充分来源支持的适用叶节点 ÷ 全部适用叶节点。",
    counts: {
      totalLeaves,
      applicableLeaves,
      verifiedFirstParty,
      verifiedAuthoritative,
      supportedThirdParty,
      inferred,
      needsVerification,
      notApplicable,
    },
    acquisition: {
      officialPages: normalizeAcquisitionCount(acquisition.officialPages),
      images: normalizeAcquisitionCount(acquisition.images),
      documents: normalizeAcquisitionCount(acquisition.documents),
      webQueries: normalizeAcquisitionCount(acquisition.webQueries),
    },
    gaps: asArray(record.gaps)
      .flatMap((item) =>
        typeof item === "string" && item.trim()
          ? [item.trim().slice(0, 300)]
          : [],
      )
      .slice(0, 20),
    evaluatedAt: timestampValue(record.evaluatedAt),
    caveat:
      textValue(record.caveat)?.slice(0, 500) ||
      "该比例仅衡量本次已定义采集范围与知识节点，不代表对整个互联网的绝对覆盖率。",
  };
}

function normalizeSections(value: unknown): GeoKnowledgeSection[] {
  const normalizeStatus = (
    value: unknown,
  ): GeoKnowledgeSection["status"] | undefined => {
    const rawStatus = textValue(value)?.toLowerCase();
    return rawStatus === "verified" ||
      rawStatus === "inferred" ||
      rawStatus === "needs_verification" ||
      rawStatus === "not_applicable"
      ? rawStatus
      : undefined;
  };
  const normalizeAssetIds = (...values: unknown[]) =>
    Array.from(
      new Set(
        values.flatMap((candidate) =>
          asArray(candidate).flatMap((item) => {
            const id =
              typeof item === "string"
                ? item.trim()
                : textValue(asRecord(item).id, asRecord(item).assetId);
            return id ? [id] : [];
          }),
        ),
      ),
    ).slice(0, 100);

  return asArray(value).flatMap((item, index) => {
    const record = asRecord(item);
    const title = textValue(record.title, record.name, record.label);
    if (!title) return [];
    const overviewRecord = asRecord(record.overview);
    const overviewMarkdown = textValue(
      record.overviewMarkdown,
      record.overview_markdown,
      overviewRecord.markdown,
      overviewRecord.content,
      overviewRecord.body,
      typeof record.overview === "string" ? record.overview : undefined,
      record.markdown,
      record.content,
      record.body,
    );
    const overviewSummary = visibleKnowledgeSectionSummary(
      textValue(
        overviewRecord.summary,
        overviewRecord.description,
        record.summary,
        record.description,
      ),
    );
    const sectionAssetIds = normalizeAssetIds(
      record.assetIds,
      record.asset_ids,
    );
    const hasExplicitOverviewAssetIds =
      record.overviewAssetIds !== undefined ||
      record.overview_asset_ids !== undefined ||
      overviewRecord.assetIds !== undefined ||
      overviewRecord.asset_ids !== undefined;
    const overviewAssetIds = normalizeAssetIds(
      record.overviewAssetIds,
      record.overview_asset_ids,
      overviewRecord.assetIds,
      overviewRecord.asset_ids,
    );
    const leaves = asArray(
      record.leaves ?? record.contentLeaves ?? record.content_leaves,
    ).flatMap((leaf, leafIndex) => {
      const leafRecord = asRecord(leaf);
      const id =
        textValue(
          leafRecord.id,
          leafRecord.key,
          leafRecord.nodeId,
          leafRecord.node_id,
        ) ?? `section-${index + 1}-leaf-${leafIndex + 1}`;
      const leafTitle =
        textValue(leafRecord.title, leafRecord.name, leafRecord.label) ??
        `知识叶子 ${leafIndex + 1}`;
      return [
        {
          id,
          title: leafTitle,
          summary: visibleKnowledgeSectionSummary(
            textValue(leafRecord.summary, leafRecord.description),
          ),
          markdown: textValue(
            leafRecord.markdown,
            leafRecord.content,
            leafRecord.body,
          ),
          evidenceCount: numberValue(
            leafRecord.evidenceCount,
            leafRecord.sourceCount,
          ),
          status: normalizeStatus(
            leafRecord.status ?? leafRecord.evidenceStatus,
          ),
          assetIds: normalizeAssetIds(
            leafRecord.assetIds,
            leafRecord.asset_ids,
          ),
        },
      ];
    });
    const status = normalizeStatus(record.status ?? record.evidenceStatus);
    const rawContentAvailability = textValue(
      record.contentAvailability,
      record.content_availability,
    );
    const contentAvailability =
      rawContentAvailability === "complete" ||
      rawContentAvailability === "limited_evidence" ||
      rawContentAvailability === "needs_verification"
        ? rawContentAvailability
        : undefined;
    return [
      {
        id: textValue(record.id, record.key) ?? `section-${index + 1}`,
        title,
        summary: overviewSummary,
        markdown: textValue(record.markdown, record.content, record.body),
        evidenceCount: numberValue(record.evidenceCount, record.sourceCount),
        status,
        contentAvailability,
        titleInjected:
          typeof record.titleInjected === "boolean"
            ? record.titleInjected
            : typeof record.title_injected === "boolean"
              ? record.title_injected
              : undefined,
        overview: {
          summary: overviewSummary,
          markdown: overviewMarkdown,
          assetIds: hasExplicitOverviewAssetIds
            ? overviewAssetIds
            : sectionAssetIds,
        },
        leaves,
        assetIds: sectionAssetIds,
      },
    ];
  });
}

function normalizeSources(value: unknown): GeoKnowledgeSource[] {
  return asArray(value).flatMap((item, index) => {
    const record = asRecord(item);
    const title = textValue(record.title, record.name, record.url);
    if (!title) return [];
    return [
      {
        id: textValue(record.id, record.key) ?? `source-${index + 1}`,
        title,
        url: textValue(record.url, record.href),
        domain: textValue(record.domain, record.host),
        type: textValue(record.type, record.sourceType),
        capturedAt: timestampValue(record.capturedAt, record.date),
      },
    ];
  });
}

function normalizeKnowledgeAssetType(
  value: unknown,
): GeoKnowledgeAsset["assetType"] {
  const candidate = textValue(value);
  return candidate &&
    [
      "brand_identity",
      "product_ui",
      "product_diagram",
      "case_photo",
      "team_photo",
      "environment_photo",
      "certificate_badge",
      "document_figure",
      "other",
    ].includes(candidate)
    ? (candidate as GeoKnowledgeAsset["assetType"])
    : undefined;
}

function normalizeKnowledgeAssetDisplayRole(
  value: unknown,
): GeoKnowledgeAsset["displayRole"] {
  const candidate = textValue(value);
  return candidate && ["hero", "inline", "badge"].includes(candidate)
    ? (candidate as GeoKnowledgeAsset["displayRole"])
    : undefined;
}

function normalizeAssets(value: unknown): GeoKnowledgeAsset[] {
  return asArray(value).flatMap((item, index) => {
    const record = asRecord(item);
    const name = textValue(record.name, record.title, record.filename);
    if (!name) return [];
    const url = safeKnowledgeAssetUrl(record.url ?? record.downloadUrl);
    const previewUrl = safeKnowledgeAssetUrl(
      record.previewUrl ?? record.thumbnail ?? record.url,
    );
    return [
      {
        id: textValue(record.id, record.key) ?? `asset-${index + 1}`,
        name,
        sectionId: textValue(
          record.sectionId,
          record.section_id,
          record.branchId,
          record.branch_id,
        ),
        leafId: textValue(
          record.leafId,
          record.leaf_id,
          record.documentId,
          record.document_id,
        ),
        url,
        previewUrl,
        type: textValue(
          record.type,
          record.mimeType,
          record.mime_type,
          record.contentType,
        ),
        source: textValue(
          record.source,
          record.sourcePageUrl,
          record.source_page_url,
          record.sourceUrl,
        ),
        caption: textValue(record.caption, record.description),
        alt: textValue(record.alt, record.altText, record.alt_text),
        archivePath: textValue(
          record.archivePath,
          record.archive_path,
          record.zipPath,
          record.zip_path,
          record.entryPath,
          record.entry_path,
        ),
        width: numberValue(record.width),
        height: numberValue(record.height),
        assetType: normalizeKnowledgeAssetType(
          record.assetType ?? record.asset_type,
        ),
        displayRole: normalizeKnowledgeAssetDisplayRole(
          record.displayRole ?? record.display_role,
        ),
      },
    ];
  });
}

function safeKnowledgeAssetUrl(value: unknown): string | undefined {
  const candidate = textValue(value);
  if (!candidate) return undefined;
  if (/^\/(?!\/)/.test(candidate)) return candidate;
  return safeHttpUrl(candidate);
}

function normalizeKnowledgeBase(
  project: JsonRecord,
): GeoKnowledgeBase | undefined {
  const archive = asRecord(project.archive);
  const manifest = asRecord(
    project.knowledgeBase ?? project.knowledge_base ?? archive.manifest,
  );
  const markdown = textValue(manifest.reportMarkdown, manifest.markdown);
  const archiveUrl = textValue(
    archive.downloadUrl,
    archive.download_url,
    archive.url,
  );

  if (!markdown && !archiveUrl && Object.keys(manifest).length === 0)
    return undefined;

  const reports = asRecord(manifest.reports);
  const packageManifest = asRecord(
    manifest.packageManifest ?? manifest.package_manifest,
  );
  const completeness = normalizeKnowledgeCompleteness(manifest.completeness);
  const normalizedMetrics = normalizeMetrics(
    manifest.metrics ?? manifest.stats ?? reports.stats,
  );
  const hasCompletenessPayload =
    Object.keys(asRecord(manifest.completeness)).length > 0;
  const metricsWithoutUntrustedCompleteness = hasCompletenessPayload
    ? normalizedMetrics.filter(
        (metric) =>
          metric.key !== "completeness" &&
          metric.key !== "coverage" &&
          !metric.label.includes("完整度"),
      )
    : normalizedMetrics;
  const metrics = completeness
    ? [
        ...metricsWithoutUntrustedCompleteness,
        {
          key: "completeness",
          label: completeness.label,
          value: `${completeness.score}%`,
          detail: `充分取证 ${Math.min(
            completeness.counts.applicableLeaves,
            completeness.counts.verifiedFirstParty +
              completeness.counts.verifiedAuthoritative +
              completeness.counts.supportedThirdParty,
          )} / ${completeness.counts.applicableLeaves}`,
        },
      ]
    : metricsWithoutUntrustedCompleteness;
  const rawArchiveContractVersion = numberValue(
    manifest.archiveContractVersion,
    manifest.archive_contract_version,
  );
  const archiveContractVersion = [1, 2, 3, 4].includes(
    rawArchiveContractVersion ?? 0,
  )
    ? (rawArchiveContractVersion as 1 | 2 | 3 | 4)
    : undefined;
  return {
    companyName: textValue(
      manifest.companyName,
      manifest.company_name,
      project.companyName,
      project.title,
    ),
    summary: textValue(
      manifest.summary,
      manifest.companySummary,
      manifest.description,
    ),
    generatedAt: timestampValue(
      manifest.generatedAt,
      manifest.generated_at,
      archive.createdAt,
    ),
    packageManifestSha256: textValue(
      manifest.packageManifestSha256,
      manifest.package_manifest_sha256,
    ),
    archiveContractVersion,
    archiveName:
      textValue(archive.filename, archive.name, manifest.archiveName) ??
      "企业知识库.zip",
    archiveUrl,
    reportMarkdown: markdown ?? textValue(reports.full, reports.summary),
    metrics,
    sections: normalizeSections(
      manifest.sections ??
        packageManifest.sections ??
        manifest.branches ??
        manifest.knowledgeTree,
    ),
    sources: normalizeSources(manifest.sources ?? manifest.sourceIndex),
    assets: normalizeAssets(
      manifest.assets ??
        packageManifest.assets ??
        manifest.media ??
        manifest.images,
    ),
    completeness,
  };
}

function safeHttpUrl(value: unknown): string | undefined {
  const candidate = textValue(value);
  if (!candidate) return undefined;
  try {
    const parsed = new URL(candidate);
    return (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      !parsed.username &&
      !parsed.password
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizePlatformId(value: unknown): GeoPlatformId | undefined {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
  const aliases: Record<string, GeoPlatformId> = {
    doubao: "doubao",
    豆包: "doubao",
    yuanbao: "yuanbao",
    腾讯元宝: "yuanbao",
    元宝: "yuanbao",
    deepseek: "deepseek",
    baiduai: "baiduai",
    "百度ai+": "baiduai",
    百度ai: "baiduai",
    qianwen: "qianwen",
    tongyiqianwen: "qianwen",
    通义千问: "qianwen",
    kimi: "kimi",
    chatgpt: "chatgpt",
  };
  return aliases[normalized];
}

function normalizePlatformIds(value: unknown): GeoPlatformId[] {
  const seen = new Set<GeoPlatformId>();
  for (const item of asArray(value)) {
    const id = normalizePlatformId(
      typeof item === "string"
        ? item
        : (asRecord(item).platformId ??
            asRecord(item).platform_id ??
            asRecord(item).platform ??
            asRecord(item).id),
    );
    if (id) seen.add(id);
  }
  return GEO_PLATFORM_IDS.filter((id) => seen.has(id));
}

function normalizeAnswerSource(value: unknown): GeoAnswerSource | undefined {
  if (typeof value === "string") {
    const title = value.trim();
    if (!title) return undefined;
    return { title, url: safeHttpUrl(title) };
  }
  const record = asRecord(value);
  const url = safeHttpUrl(record.url ?? record.href ?? record.link);
  const title = textValue(
    record.title,
    record.name,
    record.label,
    record.domain,
    url,
  );
  if (!title) return undefined;
  const rawIndex = numberValue(record.index);
  const index =
    rawIndex !== undefined &&
    Number.isSafeInteger(rawIndex) &&
    rawIndex >= 0 &&
    rawIndex <= 1_000_000_000
      ? rawIndex
      : undefined;
  const publishTime = textValue(
    record.publishTime,
    record.publish_time,
    record.publishedAt,
    record.published_at,
  );
  return {
    title,
    ...(url ? { url } : {}),
    ...(index !== undefined ? { index } : {}),
    ...(textValue(record.site, record.source)
      ? { site: textValue(record.site, record.source) }
      : {}),
    ...(textValue(record.domain) ? { domain: textValue(record.domain) } : {}),
    ...(textValue(record.summary)
      ? { summary: textValue(record.summary) }
      : {}),
    ...(publishTime ? { publishTime } : {}),
  };
}

function normalizeAnswerSources(value: unknown): GeoAnswerSource[] {
  const result = asArray(value).flatMap((item) => {
    const source = normalizeAnswerSource(item);
    return source ? [source] : [];
  });
  const byIdentity = new Map<string, GeoAnswerSource>();
  for (const source of result) {
    const identity = source.url
      ? `url:${source.url}`
      : `title:${source.title.trim().toLocaleLowerCase("en-US")}`;
    if (!byIdentity.has(identity)) byIdentity.set(identity, source);
  }
  return Array.from(byIdentity.values()).slice(0, 200);
}

function normalizeSplitAnswerSources(value: unknown, limit: number) {
  const seen = new Set<string>();
  const sources: GeoAnswerSource[] = [];
  for (const item of asArray(value)) {
    const source = normalizeAnswerSource(item);
    if (!source) continue;
    const identity = JSON.stringify([
      source.index ?? null,
      source.title,
      source.url ?? null,
      source.site ?? null,
      source.domain ?? null,
      source.summary ?? null,
      source.publishTime ?? null,
    ]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    sources.push(source);
    if (sources.length >= limit) break;
  }
  return sources;
}

function normalizeMonitorTextList(value: unknown, limit: number) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of asArray(value)) {
    const text = typeof item === "string" ? item.trim() : "";
    if (!text || text.length > 500 || seen.has(text)) continue;
    seen.add(text);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function normalizeKeywordEvaluations(value: unknown) {
  const result: NonNullable<GeoMonitoringAnswer["keywordEvaluations"]> = [];
  for (const item of asArray(value).slice(0, 100)) {
    const record = asRecord(item);
    const keyword = textValue(record.keyword)?.slice(0, 200);
    const nature = textValue(record.nature)?.toLowerCase();
    if (
      !keyword ||
      !nature ||
      !["positive", "neutral", "negative"].includes(nature)
    ) {
      continue;
    }
    const context = textValue(record.context)?.slice(0, 2_000);
    result.push({
      keyword,
      nature: nature as "positive" | "neutral" | "negative",
      ...(context ? { context } : {}),
    });
  }
  return result;
}

function normalizeMonitoringRegion(
  value: unknown,
): GeoMonitoringRegion | undefined {
  const record = asRecord(value);
  const edition = textValue(record.edition, record.scope);
  const code = textValue(record.code, record.regionCode, record.region_code);
  const label = textValue(record.label, record.name, record.province);
  if (
    !code ||
    !label ||
    code.length > 64 ||
    label.length > 100 ||
    !["domestic", "overseas"].includes(edition || "")
  ) {
    return undefined;
  }
  return { edition: edition as GeoMonitoringEdition, code, label };
}

function normalizeMonitoringStatus(value: unknown): GeoMonitoringStatus {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (["payment_pending", "awaiting_payment"].includes(raw))
    return "payment_pending";
  if (
    [
      "submission_in_progress",
      "submission_unknown",
      "submitted",
      "resuming",
      "queued",
      "created",
    ].includes(raw)
  )
    return "submitted";
  if (
    [
      "capturing",
      "running",
      "processing",
      "polling",
      "in_progress",
      "status_poll_in_flight",
      "polling_until_finished",
      "polling_recoverable_error",
      "result_checkpoint_saved",
      "waiting_for_result_retry",
    ].includes(raw)
  )
    return "capturing";
  if (["partial", "partial_completed", "partial_review_required"].includes(raw))
    return "partial_review";
  if (
    [
      "completed",
      "complete",
      "success",
      "succeeded",
      "remote_final_result_saved",
      "awaiting_user_confirmation",
      "completed_confirmed",
    ].includes(raw)
  )
    return "completed";
  if (
    [
      "failed",
      "error",
      "stopped",
      "cancelled",
      "canceled",
      "remote_failed",
      "remote_terminal_failed",
      "remote_query_fatal_error",
      "remote_result_fatal_error",
      "artifact_validation_failed",
      "shape_mismatch",
    ].includes(raw)
  )
    return "failed";
  return "not_started";
}

function normalizeMonitoringAnswer(
  value: unknown,
  index: number,
): GeoMonitoringAnswer | undefined {
  const record = asRecord(value);
  const platformId = normalizePlatformId(
    record.platformId ?? record.platform_id ?? record.platform,
  );
  if (!platformId) return undefined;
  const rawStatus = String(record.status ?? "")
    .trim()
    .toLowerCase();
  const answer =
    textValue(
      record.answer,
      record.answerText,
      record.answer_text,
      record.answerContent,
      record.answer_content,
      record.content,
      record.text,
    ) ?? "";
  const status: GeoMonitoringAnswer["status"] = [
    "completed",
    "failed",
    "stopped",
    "error",
    "processing",
  ].includes(rawStatus)
    ? (rawStatus as GeoMonitoringAnswer["status"])
    : answer
      ? "completed"
      : "processing";
  if (status === "completed" && !answer.trim()) return undefined;
  const runIndex = Math.max(
    1,
    Math.min(
      5,
      Math.round(
        numberValue(record.runIndex, record.run_index, record.round) ??
          (index % 5) + 1,
      ),
    ),
  );

  const legacyCitations = normalizeSplitAnswerSources(
    record.citations ?? record.citationList ?? record.citation_list,
    100,
  );
  const legacyReferences = normalizeSplitAnswerSources(
    record.references ?? record.referenceList ?? record.reference_list,
    200,
  );
  const sources = normalizeAnswerSources(
    record.sources ??
      record.sourceList ??
      record.source_list ?? [...legacyCitations, ...legacyReferences],
  );
  const sourceBreakdownAvailable =
    hasOwnField(
      record,
      "citationList",
      "citation_list",
      "referenceList",
      "reference_list",
    ) ||
    ((record.sourceBreakdownAvailable === true ||
      record.source_breakdown_available === true) &&
      hasOwnField(record, "citations", "references"));
  const hasMentionPosition = hasOwnField(
    record,
    "mentionPosition",
    "mention_position",
  );
  const rawMentionPosition = Object.prototype.hasOwnProperty.call(
    record,
    "mentionPosition",
  )
    ? record.mentionPosition
    : record.mention_position;
  const mentionPositionValue = numberValue(rawMentionPosition);
  const mentionPosition =
    rawMentionPosition === null
      ? null
      : mentionPositionValue !== undefined &&
          Number.isSafeInteger(mentionPositionValue) &&
          mentionPositionValue > 0
        ? mentionPositionValue
        : undefined;
  const hasSentiment = hasOwnField(record, "sentiment");
  const rawSentiment = record.sentiment;
  const sentimentValue = textValue(rawSentiment)?.toLowerCase();
  const sentiment =
    rawSentiment === null
      ? null
      : ["positive", "neutral", "negative"].includes(sentimentValue || "")
        ? (sentimentValue as "positive" | "neutral" | "negative")
        : undefined;
  const hasCategoryRanking = hasOwnField(
    record,
    "categoryRanking",
    "category_ranking",
  );
  const rawCategoryValue = Object.prototype.hasOwnProperty.call(
    record,
    "categoryRanking",
  )
    ? record.categoryRanking
    : record.category_ranking;
  const rawCategoryRanking = asRecord(rawCategoryValue);
  const categoryName = textValue(
    rawCategoryRanking.categoryName,
    rawCategoryRanking.category_name,
  );
  const categoryRankValue = numberValue(rawCategoryRanking.rank);
  const categoryRanking =
    rawCategoryValue === null
      ? null
      : categoryName &&
          categoryRankValue !== undefined &&
          Number.isSafeInteger(categoryRankValue) &&
          categoryRankValue > 0
        ? { categoryName, rank: categoryRankValue }
        : undefined;
  const screenshotCandidate = textValue(
    record.screenshotUrl,
    record.screenshot_url,
  );
  const screenshotUrl =
    screenshotCandidate?.startsWith("/api/geo/") === true
      ? screenshotCandidate
      : undefined;

  return {
    id:
      textValue(record.id, record.recordId, record.record_id) ??
      `${platformId}-${runIndex}-${index + 1}`,
    platformId,
    runIndex,
    status,
    answer,
    media: normalizeAnswerMedia(
      record.media ??
        record.mediaItems ??
        record.media_items ??
        record.mediaContent ??
        record.media_content,
    ),
    sources,
    citations: legacyCitations,
    references: legacyReferences,
    sourceBreakdownAvailable,
    ...(hasOwnField(record, "searchKeywords", "search_keywords")
      ? {
          searchKeywords: normalizeMonitorTextList(
            record.searchKeywords ?? record.search_keywords,
            50,
          ),
        }
      : {}),
    ...(hasOwnField(record, "recommendedQuestions", "recommended_questions")
      ? {
          recommendedQuestions: normalizeMonitorTextList(
            record.recommendedQuestions ?? record.recommended_questions,
            20,
          ),
        }
      : {}),
    ...(hasMentionPosition && mentionPosition !== undefined
      ? { mentionPosition }
      : {}),
    ...(hasOwnField(record, "mentionContext", "mention_context")
      ? {
          mentionContext:
            (Object.prototype.hasOwnProperty.call(record, "mentionContext")
              ? record.mentionContext
              : record.mention_context) === null
              ? null
              : textValue(record.mentionContext, record.mention_context)?.slice(
                  0,
                  2_000,
                ),
        }
      : {}),
    ...(hasSentiment && sentiment !== undefined ? { sentiment } : {}),
    ...(hasCategoryRanking && categoryRanking !== undefined
      ? { categoryRanking }
      : {}),
    ...(hasOwnField(record, "keywordEvaluations", "keyword_evaluations")
      ? {
          keywordEvaluations: normalizeKeywordEvaluations(
            record.keywordEvaluations ?? record.keyword_evaluations,
          ),
        }
      : {}),
    ...(record.screenshotAvailable === true ||
    record.screenshot_available === true ||
    Boolean(screenshotUrl)
      ? { screenshotAvailable: true }
      : {}),
    ...(screenshotUrl ? { screenshotUrl } : {}),
    capturedAt: timestampValue(
      record.capturedAt,
      record.captured_at,
      record.time,
      record.createdAt,
      record.completedAt,
      record.completed_at,
    ),
    error: localizedUserFacingError(
      textValue(record.error, record.errorMessage, record.error_message),
      undefined,
      "",
    ),
  };
}

function normalizeAnswerMedia(value: unknown): GeoAnswerMedia[] {
  const media: GeoAnswerMedia[] = [];
  const seen = new Set<string>();
  for (const entry of asArray(value).slice(0, 24)) {
    const item = asRecord(entry);
    const url = safeHttpUrl(item.url ?? item.href ?? item.src);
    if (!url) continue;
    const rawType = String(item.type ?? "")
      .trim()
      .toLowerCase();
    const pathname = (() => {
      try {
        return new URL(url).pathname.toLowerCase();
      } catch {
        return "";
      }
    })();
    const type: GeoAnswerMedia["type"] = [
      "image",
      "video",
      "audio",
      "link",
    ].includes(rawType)
      ? (rawType as GeoAnswerMedia["type"])
      : /\.(?:avif|gif|jpe?g|png|svg|webp)$/.test(pathname)
        ? "image"
        : /\.(?:m3u8|mov|mp4|m4v|webm)$/.test(pathname)
          ? "video"
          : /\.(?:aac|m4a|mp3|ogg|wav)$/.test(pathname)
            ? "audio"
            : "link";
    const key = `${type}:${url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const title = textValue(item.title, item.name, item.alt);
    const thumbnailUrl = safeHttpUrl(
      item.thumbnailUrl ??
        item.thumbnail_url ??
        item.posterUrl ??
        item.poster_url ??
        item.poster ??
        item.coverUrl ??
        item.cover_url,
    );
    media.push({
      type,
      url,
      ...(title ? { title } : {}),
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
    });
  }
  return media;
}

function normalizeMonitoring(value: unknown): GeoMonitoringResult | undefined {
  const root = asRecord(value);
  if (Object.keys(root).length === 0) return undefined;
  const result = asRecord(root.result ?? root.data);
  const source = Object.keys(result).length > 0 ? { ...root, ...result } : root;
  const runId = textValue(
    source.runId,
    source.run_id,
    source.monitorRunId,
    source.monitor_run_id,
    source.id,
  );
  if (!runId) return undefined;
  const answerCandidates = asArray(
    source.answers ?? source.records ?? asRecord(source.output).records,
  );
  const answers = answerCandidates.flatMap((answer, index) => {
    const normalized = normalizeMonitoringAnswer(answer, index);
    return normalized ? [normalized] : [];
  });
  const platforms = normalizePlatformIds(
    source.platforms ??
      source.platformIds ??
      source.platform_ids ??
      answers.map((answer) => answer.platformId),
  );
  const completedFromAnswers = answers.filter(
    (answer) => answer.status === "completed" && Boolean(answer.answer),
  ).length;
  const failedFromAnswers = answers.filter((answer) =>
    ["failed", "stopped", "error"].includes(answer.status),
  ).length;
  const expectedRecords = Math.max(
    0,
    Math.round(
      numberValue(
        source.expectedRecords,
        source.expected_records,
        source.totalItems,
        source.total_items,
      ) ?? platforms.length * 5,
    ),
  );
  const completedRecords = Math.max(
    0,
    Math.round(
      numberValue(
        source.completedRecords,
        source.completed_records,
        source.completedItems,
        source.completed_items,
      ) ?? completedFromAnswers,
    ),
  );
  const failedRecords = Math.max(
    0,
    Math.round(
      numberValue(
        source.failedRecords,
        source.failed_records,
        source.failedItems,
        source.failed_items,
      ) ?? failedFromAnswers,
    ),
  );
  let status = normalizeMonitoringStatus(source.status ?? source.state);
  const clientDroppedCount = Math.max(
    answerCandidates.length - answers.length,
    expectedRecords - answers.length,
    0,
  );
  const terminal = status === "completed" || status === "partial_review";
  const adapterPartial =
    status === "partial_review" ||
    (status === "completed" && (clientDroppedCount > 0 || failedRecords > 0));
  const providedQuality = normalizeResultQuality(source.quality);
  const qualityPartial =
    adapterPartial || providedQuality?.completeness === "partial";
  if (status === "completed" && adapterPartial) status = "partial_review";
  const effectiveDroppedCount = Math.max(
    clientDroppedCount,
    providedQuality?.stats?.droppedCount ?? 0,
  );
  const quality: GeoResultQuality | undefined = terminal
    ? {
        completeness: qualityPartial ? "partial" : "complete",
        stats: {
          acceptedCount: answers.length,
          expectedCount: expectedRecords,
          droppedCount: effectiveDroppedCount,
        },
        ...(providedQuality?.warnings?.length
          ? { warnings: providedQuality.warnings }
          : qualityPartial
            ? {
                warnings: [
                  { code: "RESULT_INCOMPLETE" as const, area: "monitoring" },
                  ...(effectiveDroppedCount > 0
                    ? [
                        {
                          code: "ITEM_DROPPED" as const,
                          area: "monitoring",
                        },
                      ]
                    : []),
                ],
              }
            : {}),
        downstreamEligible:
          providedQuality?.downstreamEligible ?? !qualityPartial,
      }
    : undefined;

  return {
    runId,
    status,
    platforms,
    expectedRecords,
    completedRecords,
    failedRecords,
    nextPollAt: timestampValue(source.nextPollAt, source.next_poll_at),
    startedAt: timestampValue(
      source.startedAt,
      source.started_at,
      source.createdAt,
    ),
    completedAt: timestampValue(source.completedAt, source.completed_at),
    partialAccepted:
      source.partialAccepted === true || source.partial_accepted === true,
    region: normalizeMonitoringRegion(source.region),
    screenshotEnabled:
      source.screenshotEnabled === true || source.screenshot_enabled === true,
    ...(quality ? { quality } : {}),
    answers,
    error: localizedUserFacingError(
      textValue(source.error, source.errorMessage, source.error_message),
      undefined,
      "",
    ),
  };
}

function normalizeAssessmentStatus(value: unknown): GeoAssessmentStatus {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!raw) return "not_started";
  if (["queued", "submitted", "created"].includes(raw)) return "queued";
  if (["running", "processing", "in_progress", "evaluating"].includes(raw))
    return "running";
  if (["paused", "waiting", "upstream_unknown", "unknown"].includes(raw))
    return "running";
  if (["ready", "completed", "complete", "success", "succeeded"].includes(raw))
    return "ready";
  if (["failed", "error", "cancelled", "canceled"].includes(raw))
    return "failed";
  return "running";
}

function normalizeAssessmentFailureCode(
  ...values: unknown[]
): GeoAssessmentResult["failureCode"] {
  const normalized = textValue(...values)?.toUpperCase();
  return [
    "OUTPUT_FILE_UNAVAILABLE",
    "INVALID_JSON",
    "SCHEMA_MISMATCH",
    "SCOPE_MISMATCH",
  ].includes(normalized ?? "")
    ? (normalized as NonNullable<GeoAssessmentResult["failureCode"]>)
    : undefined;
}

function normalizeAssessmentDimension(
  definition: (typeof ASSESSMENT_DIMENSIONS)[number],
  value: unknown,
): GeoAssessmentDimension | undefined {
  const record = asRecord(value);
  if (Object.keys(record).length === 0) return undefined;
  const score = numberValue(record.score, record.value);
  const maxScore = numberValue(record.maxScore, record.max_score);
  return {
    id: definition.id,
    label: textValue(record.label, record.name) ?? definition.label,
    ...(score !== undefined
      ? {
          score: Math.max(0, Math.min(maxScore ?? definition.maxScore, score)),
        }
      : {}),
    ...(maxScore !== undefined ? { maxScore: Math.max(1, maxScore) } : {}),
    summary: textValue(
      record.summary,
      record.diagnosis,
      record.calculationBasis,
      record.calculation_basis,
    ),
    currentFinding: textValue(
      record.currentFinding,
      record.current_finding,
      record.summary,
    ),
    nextAction: textValue(record.nextAction, record.next_action),
  };
}

function normalizeComparisonStatus(
  value: unknown,
): GeoKnowledgeComparisonStatus {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (["aligned", "consistent", "match", "一致", "一致覆盖"].includes(raw))
    return "aligned";
  if (["missing", "absent", "缺失", "未覆盖"].includes(raw)) return "missing";
  if (["conflict", "contradiction", "冲突", "矛盾"].includes(raw))
    return "conflict";
  return "opportunity";
}

function normalizeKnowledgeComparisons(
  value: unknown,
): GeoKnowledgeComparison[] {
  return asArray(value).flatMap((item, index) => {
    const record = asRecord(item);
    const topic = textValue(record.topic, record.title, record.label);
    if (!topic) return [];
    return [
      {
        id: textValue(record.id, record.key) ?? `comparison-${index + 1}`,
        topic,
        status: normalizeComparisonStatus(
          record.status ?? record.classification ?? record.type,
        ),
        knowledgeBaseFact: textValue(
          record.knowledgeBaseFact,
          record.knowledge_base_fact,
          record.knowledgeFact,
          record.knowledge,
        ),
        answerFinding: textValue(
          record.answerFinding,
          record.answer_finding,
          record.finding,
          record.answer,
        ),
        knowledgeClaimId: textValue(
          record.knowledgeClaimId,
          record.knowledge_claim_id,
          record.kbClaimId,
          record.kb_claim_id,
        ),
        answerExcerpt: textValue(record.answerExcerpt, record.answer_excerpt),
        explanation: textValue(record.explanation),
        recommendedAction: textValue(
          record.recommendedAction,
          record.recommended_action,
        ),
        runIndex: numberValue(record.runIndex, record.run_index),
        confidence: numberValue(record.confidence),
        platforms: normalizePlatformIds(
          record.platforms ?? record.platformIds ?? record.platform_ids,
        ),
        evidenceRefs: asArray(
          record.evidenceRefs ?? record.evidence_refs ?? record.evidence,
        )
          .map((entry) =>
            typeof entry === "string"
              ? entry.trim()
              : textValue(asRecord(entry).title, asRecord(entry).id),
          )
          .filter((entry): entry is string => Boolean(entry)),
      },
    ];
  });
}

function nullableNumberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  return numberValue(value) ?? null;
}

function optionalNullableNumberValue(
  value: unknown,
): number | null | undefined {
  if (value === undefined || value === "") return undefined;
  if (value === null) return null;
  return numberValue(value);
}

function normalizeAssessmentDimensionId(
  value: unknown,
): GeoAssessmentDimensionId | undefined {
  const normalized = String(value ?? "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
  return ASSESSMENT_DIMENSIONS.some((dimension) => dimension.id === normalized)
    ? (normalized as GeoAssessmentDimensionId)
    : undefined;
}

function normalizeAssessmentPlatformBreakdown(
  value: unknown,
): GeoAssessmentPlatformBreakdown[] {
  return asArray(value).flatMap((item) => {
    const record = asRecord(item);
    const platformId = normalizePlatformId(
      record.platformId ?? record.platform_id ?? record.platform,
    );
    if (!platformId) return [];
    const sentimentValue = textValue(record.sentiment)?.toLowerCase();
    const sentiment = [
      "positive",
      "neutral",
      "negative",
      "mixed",
      "unknown",
    ].includes(sentimentValue ?? "")
      ? (sentimentValue as GeoAssessmentPlatformBreakdown["sentiment"])
      : "unknown";
    return [
      {
        platformId,
        responseCount: Math.max(
          0,
          numberValue(record.responseCount, record.response_count) ?? 0,
        ),
        successfulResponses: Math.max(
          0,
          numberValue(
            record.successfulResponses,
            record.successful_responses,
          ) ?? 0,
        ),
        brandMentionRate: optionalNullableNumberValue(
          record.brandMentionRate ?? record.brand_mention_rate,
        ),
        averageRank: optionalNullableNumberValue(
          record.averageRank ?? record.average_rank,
        ),
        factAccuracy: optionalNullableNumberValue(
          record.factAccuracy ?? record.fact_accuracy,
        ),
        propositionHitRate: optionalNullableNumberValue(
          record.propositionHitRate ?? record.proposition_hit_rate,
        ),
        sourceCount: (() => {
          const count = numberValue(record.sourceCount, record.source_count);
          return count === undefined ? undefined : Math.max(0, count);
        })(),
        sentiment,
        verdict: textValue(record.verdict) ?? "",
        evidenceRefs: asArray(record.evidenceRefs ?? record.evidence_refs)
          .map((entry) => textValue(entry))
          .filter((entry): entry is string => Boolean(entry)),
      },
    ];
  });
}

function normalizeAssessmentPriorityActions(
  value: unknown,
): GeoAssessmentPriorityAction[] {
  return asArray(value)
    .flatMap((item) => {
      const record = asRecord(item);
      const dimension = normalizeAssessmentDimensionId(record.dimension);
      const action = textValue(record.action);
      if (!dimension || !action) return [];
      return [
        {
          priority: Math.max(1, Math.round(numberValue(record.priority) ?? 1)),
          dimension,
          action,
          expectedImpact: textValue(
            record.expectedImpact,
            record.expected_impact,
          ),
          evidenceRefs: asArray(record.evidenceRefs ?? record.evidence_refs)
            .map((entry) => textValue(entry))
            .filter((entry): entry is string => Boolean(entry)),
        },
      ];
    })
    .sort((left, right) => left.priority - right.priority);
}

function normalizeAssessment(value: unknown): GeoAssessmentResult | undefined {
  const root = asRecord(value);
  if (Object.keys(root).length === 0) return undefined;
  const parsedOutput = asRecord(
    parseStructuredOutput(root.output ?? root.result ?? root.data),
  );
  const scorecard = asRecord(
    parsedOutput.scorecard ??
      parsedOutput.assessment ??
      root.scorecard ??
      root.assessment ??
      parsedOutput,
  );
  const rawDimensions = scorecard.dimensions ?? root.dimensions;
  const dimensionRecord = asRecord(rawDimensions);
  const dimensionArray = asArray(rawDimensions);
  const dimensions = ASSESSMENT_DIMENSIONS.flatMap((definition) => {
    const candidate =
      dimensionRecord[definition.id] ??
      dimensionArray.find(
        (item) =>
          textValue(asRecord(item).id, asRecord(item).key) === definition.id,
      );
    const normalized = normalizeAssessmentDimension(definition, candidate);
    return normalized ? [normalized] : [];
  });
  const displayGrade = textValue(scorecard.grade, root.grade)?.toUpperCase();
  const totalScore = numberValue(
    scorecard.totalScore,
    scorecard.total_score,
    scorecard.bsasTotal,
    scorecard.bsas_total,
    root.totalScore,
  );
  const rawTotalScore = numberValue(
    scorecard.rawTotalScore,
    scorecard.raw_total_score,
    root.rawTotalScore,
    root.raw_total_score,
  );
  const rawGrade = textValue(
    scorecard.rawGrade,
    scorecard.raw_grade,
    root.rawGrade,
    root.raw_grade,
  )?.toUpperCase();
  const structuralExcludedMaxScore = numberValue(
    scorecard.structuralExcludedMaxScore,
    scorecard.structural_excluded_max_score,
    root.structuralExcludedMaxScore,
    root.structural_excluded_max_score,
  );
  const applicableMaxScore = numberValue(
    scorecard.applicableMaxScore,
    scorecard.applicable_max_score,
    root.applicableMaxScore,
    root.applicable_max_score,
  );
  const coverageRaw = numberValue(
    scorecard.coverage,
    scorecard.coverageRate,
    scorecard.coverage_rate,
    root.coverage,
  );
  const confidenceRaw = textValue(
    scorecard.confidence,
    root.confidence,
  )?.toLowerCase();
  const confidence = ["high", "medium", "low"].includes(confidenceRaw ?? "")
    ? (confidenceRaw as GeoAssessmentResult["confidence"])
    : undefined;
  const failureCode = normalizeAssessmentFailureCode(
    root.failureCode,
    root.failure_code,
  );
  const status = normalizeAssessmentStatus(root.status ?? scorecard.status);
  const rankingSource = asRecord(
    scorecard.rankingDiagnostics ??
      scorecard.ranking_diagnostics ??
      root.rankingDiagnostics ??
      root.ranking_diagnostics,
  );
  const rankingDiagnostics =
    typeof rankingSource.eligible === "boolean"
      ? {
          eligible: rankingSource.eligible,
          totalObservations: Math.max(
            0,
            numberValue(
              rankingSource.totalObservations,
              rankingSource.total_observations,
            ) ?? 0,
          ),
          rankedObservations: Math.max(
            0,
            numberValue(
              rankingSource.rankedObservations,
              rankingSource.ranked_observations,
            ) ?? 0,
          ),
          unmentionedObservations: Math.max(
            0,
            numberValue(
              rankingSource.unmentionedObservations,
              rankingSource.unmentioned_observations,
            ) ?? 0,
          ),
          averageRank: nullableNumberValue(
            rankingSource.averageRank ?? rankingSource.average_rank,
          ),
          firstPlaceRate: nullableNumberValue(
            rankingSource.firstPlaceRate ?? rankingSource.first_place_rate,
          ),
          top3Rate: nullableNumberValue(
            rankingSource.top3Rate ?? rankingSource.top_3_rate,
          ),
          top5Rate: nullableNumberValue(
            rankingSource.top5Rate ?? rankingSource.top_5_rate,
          ),
          competitorRankGap: nullableNumberValue(
            rankingSource.competitorRankGap ??
              rankingSource.competitor_rank_gap,
          ),
          calculationBasis: textValue(
            rankingSource.calculationBasis,
            rankingSource.calculation_basis,
          ),
        }
      : undefined;
  const methodologySource = asRecord(scorecard.methodology ?? root.methodology);
  const methodology =
    Object.keys(methodologySource).length > 0
      ? {
          assessmentType: textValue(
            methodologySource.assessmentType,
            methodologySource.assessment_type,
          ),
          isFullBsasAudit:
            typeof methodologySource.isFullBsasAudit === "boolean"
              ? methodologySource.isFullBsasAudit
              : typeof methodologySource.is_full_bsas_audit === "boolean"
                ? methodologySource.is_full_bsas_audit
                : undefined,
          normalizedMeasuredScore: numberValue(
            methodologySource.normalizedMeasuredScore,
            methodologySource.normalized_measured_score,
          ),
          applicableScore: numberValue(
            methodologySource.applicableScore,
            methodologySource.applicable_score,
          ),
          applicableMaxScore: numberValue(
            methodologySource.applicableMaxScore,
            methodologySource.applicable_max_score,
          ),
          structuralExcludedMaxScore: numberValue(
            methodologySource.structuralExcludedMaxScore,
            methodologySource.structural_excluded_max_score,
          ),
          confidenceScore: numberValue(
            methodologySource.confidenceScore,
            methodologySource.confidence_score,
          ),
        }
      : undefined;

  return {
    schemaVersion:
      numberValue(scorecard.schemaVersion, root.schemaVersion) === 2
        ? 2
        : undefined,
    status,
    totalScore:
      totalScore === undefined
        ? undefined
        : Math.max(0, Math.min(100, totalScore)),
    rawTotalScore:
      rawTotalScore === undefined
        ? undefined
        : Math.max(0, Math.min(100, rawTotalScore)),
    grade: ["A", "B", "C", "D", "E"].includes(displayGrade ?? "")
      ? (displayGrade as GeoAssessmentResult["grade"])
      : undefined,
    rawGrade: ["A", "B", "C", "D", "E"].includes(rawGrade ?? "")
      ? (rawGrade as GeoAssessmentResult["rawGrade"])
      : undefined,
    structuralExcludedMaxScore:
      structuralExcludedMaxScore === undefined
        ? undefined
        : Math.max(0, Math.min(100, structuralExcludedMaxScore)),
    applicableMaxScore:
      applicableMaxScore === undefined
        ? undefined
        : Math.max(0, Math.min(100, applicableMaxScore)),
    coverage:
      coverageRaw === undefined
        ? undefined
        : Math.max(
            0,
            Math.min(100, coverageRaw <= 1 ? coverageRaw * 100 : coverageRaw),
          ),
    confidence,
    scopeLabel:
      textValue(
        scorecard.scopeLabel,
        scorecard.scope_label,
        root.scopeLabel,
        root.scope_label,
      ) ?? "本问题现状综合评分",
    summary: textValue(
      scorecard.executiveSummary,
      scorecard.executive_summary,
      scorecard.summary,
      scorecard.diagnosis,
      root.summary,
    ),
    executiveSummary: textValue(
      scorecard.executiveSummary,
      scorecard.executive_summary,
      root.executiveSummary,
      root.executive_summary,
    ),
    dimensions,
    comparisons: normalizeKnowledgeComparisons(
      scorecard.comparisons ??
        scorecard.knowledgeComparisons ??
        scorecard.knowledge_comparisons ??
        root.comparisons ??
        root.knowledgeComparisons ??
        root.knowledge_comparisons,
    ),
    platformBreakdown: normalizeAssessmentPlatformBreakdown(
      scorecard.platformBreakdown ??
        scorecard.platform_breakdown ??
        root.platformBreakdown ??
        root.platform_breakdown,
    ),
    priorityActions: normalizeAssessmentPriorityActions(
      scorecard.priorityActions ??
        scorecard.priority_actions ??
        root.priorityActions ??
        root.priority_actions,
    ),
    limitations: asArray(scorecard.limitations ?? root.limitations)
      .map((item) => textValue(item))
      .filter((item): item is string => Boolean(item)),
    rankingDiagnostics,
    methodology,
    generatedAt: timestampValue(
      scorecard.generatedAt,
      scorecard.generated_at,
      root.completedAt,
      root.completed_at,
    ),
    error: localizedUserFacingError(
      textValue(root.error, root.errorMessage, root.error_message),
      undefined,
      "",
    ),
    failureCode,
    quality: normalizeResultQuality(root.quality ?? scorecard.quality),
  };
}

function normalizeOptimizationForecast(
  value: unknown,
): GeoOptimizationForecastResult | undefined {
  const root = asRecord(value);
  if (Object.keys(root).length === 0) return undefined;
  const parsedOutput = asRecord(
    parseStructuredOutput(root.output ?? root.result ?? root.data),
  );
  const forecast = asRecord(
    parsedOutput.forecast ??
      parsedOutput.optimizationForecast ??
      parsedOutput.optimization_forecast ??
      root.forecast ??
      root.optimizationForecast ??
      root.optimization_forecast ??
      (Object.keys(parsedOutput).length > 0 ? parsedOutput : root),
  );
  const status = normalizeAssessmentStatus(root.status ?? forecast.status);
  const rawDimensions = forecast.dimensions;
  const dimensionRecord = asRecord(rawDimensions);
  const dimensionArray = asArray(rawDimensions);
  const dimensions = ASSESSMENT_DIMENSIONS.flatMap((definition) => {
    const candidate = asRecord(
      dimensionRecord[definition.id] ??
        dimensionRecord[
          definition.id.replace(/_([a-z])/g, (_match, letter: string) =>
            letter.toUpperCase(),
          )
        ] ??
        dimensionArray.find(
          (item) =>
            textValue(asRecord(item).id, asRecord(item).key) === definition.id,
        ),
    );
    if (Object.keys(candidate).length === 0) return [];
    const maxScore = Math.max(
      1,
      numberValue(candidate.maxScore, candidate.max_score) ??
        definition.maxScore,
    );
    const currentScore = Math.max(
      0,
      Math.min(
        maxScore,
        numberValue(candidate.currentScore, candidate.current_score) ?? 0,
      ),
    );
    const targetLow = Math.max(
      currentScore,
      Math.min(
        maxScore,
        numberValue(candidate.targetLow, candidate.target_low) ?? currentScore,
      ),
    );
    const targetHigh = Math.max(
      targetLow,
      Math.min(
        maxScore,
        numberValue(candidate.targetHigh, candidate.target_high) ?? targetLow,
      ),
    );
    const targetExpected = Math.max(
      targetLow,
      Math.min(
        targetHigh,
        numberValue(candidate.targetExpected, candidate.target_expected) ??
          (targetLow + targetHigh) / 2,
      ),
    );
    return [
      {
        id: definition.id,
        label: textValue(candidate.label, candidate.name) ?? definition.label,
        currentScore,
        targetLow,
        targetExpected,
        targetHigh,
        maxScore,
        summary: textValue(
          candidate.summary,
          candidate.rationale,
          candidate.mechanism,
        ),
        currentFinding: textValue(
          candidate.currentFinding,
          candidate.current_finding,
          candidate.summary,
        ),
        nextAction: textValue(candidate.nextAction, candidate.next_action),
        actions: asArray(
          candidate.actions ?? candidate.actionIds ?? candidate.action_ids,
        )
          .map((item) =>
            typeof item === "string"
              ? item.trim()
              : textValue(asRecord(item).title, asRecord(item).action),
          )
          .filter((item): item is string => Boolean(item)),
      },
    ];
  });
  const grade = (candidate: unknown) => {
    const normalized = textValue(candidate)?.toUpperCase();
    return ["A", "B", "C", "D", "E"].includes(normalized ?? "")
      ? (normalized as GeoOptimizationForecastResult["gradeLow"])
      : undefined;
  };
  const roadmap = asArray(forecast.roadmap).flatMap((item, index) => {
    const phase = asRecord(item);
    const title = textValue(phase.title);
    const weeks = textValue(phase.weeks);
    const actions = asArray(phase.actions)
      .map((action) => textValue(action))
      .filter((action): action is string => Boolean(action));
    const verificationGate = textValue(
      phase.verificationGate,
      phase.verification_gate,
    );
    if (!title || !weeks || actions.length === 0 || !verificationGate)
      return [];
    return [
      {
        phase: numberValue(phase.phase) ?? index + 1,
        weeks,
        title,
        actions,
        verificationGate,
      },
    ];
  });
  const clampTotal = (value: unknown) => {
    const number = numberValue(value);
    return number === undefined
      ? undefined
      : Math.max(0, Math.min(100, number));
  };
  const currentScore = clampTotal(
    forecast.currentScore ?? forecast.current_score,
  );
  const targetLowRaw = clampTotal(forecast.targetLow ?? forecast.target_low);
  const targetLow =
    targetLowRaw === undefined
      ? undefined
      : Math.max(currentScore ?? 0, targetLowRaw);
  const targetHighRaw = clampTotal(forecast.targetHigh ?? forecast.target_high);
  const targetHigh =
    targetHighRaw === undefined
      ? undefined
      : Math.max(targetLow ?? currentScore ?? 0, targetHighRaw);
  const targetExpectedRaw = clampTotal(
    forecast.targetExpected ?? forecast.target_expected,
  );
  const targetExpected =
    targetExpectedRaw === undefined
      ? targetLow !== undefined && targetHigh !== undefined
        ? (targetLow + targetHigh) / 2
        : undefined
      : Math.max(
          targetLow ?? currentScore ?? 0,
          Math.min(targetHigh ?? 100, targetExpectedRaw),
        );
  const rawCurrentScore = clampTotal(
    forecast.rawCurrentScore ?? forecast.raw_current_score,
  );
  const rawTargetLow = clampTotal(
    forecast.rawTargetLow ?? forecast.raw_target_low,
  );
  const rawTargetExpected = clampTotal(
    forecast.rawTargetExpected ?? forecast.raw_target_expected,
  );
  const rawTargetHigh = clampTotal(
    forecast.rawTargetHigh ?? forecast.raw_target_high,
  );
  const scoreBasisSource = asRecord(
    forecast.scoreBasis ?? forecast.score_basis,
  );
  const applicableMaxScore = numberValue(
    scoreBasisSource.applicableMaxScore,
    scoreBasisSource.applicable_max_score,
  );
  const structuralExcludedMaxScore = numberValue(
    scoreBasisSource.structuralExcludedMaxScore,
    scoreBasisSource.structural_excluded_max_score,
  );
  const scoreBasis =
    textValue(scoreBasisSource.type) === "applicable_scope" &&
    applicableMaxScore !== undefined &&
    structuralExcludedMaxScore !== undefined
      ? {
          type: "applicable_scope" as const,
          applicableMaxScore: Math.max(0, Math.min(100, applicableMaxScore)),
          structuralExcludedMaxScore: Math.max(
            0,
            Math.min(100, structuralExcludedMaxScore),
          ),
        }
      : undefined;
  const brandMentionRateSource = asRecord(
    forecast.brandMentionRateForecast ??
      forecast.brand_mention_rate_forecast ??
      root.brandMentionRateForecast ??
      root.brand_mention_rate_forecast,
  );
  const brandMentionCurrent = numberValue(brandMentionRateSource.current);
  const brandMentionLow = numberValue(brandMentionRateSource.low);
  const brandMentionExpected = numberValue(brandMentionRateSource.expected);
  const brandMentionHigh = numberValue(brandMentionRateSource.high);
  const brandMentionObservedAnswers = numberValue(
    brandMentionRateSource.observedAnswers,
    brandMentionRateSource.observed_answers,
  );
  const brandMentionRateForecast =
    brandMentionCurrent !== undefined &&
    brandMentionLow !== undefined &&
    brandMentionExpected !== undefined &&
    brandMentionHigh !== undefined &&
    Number.isSafeInteger(brandMentionObservedAnswers) &&
    brandMentionObservedAnswers! > 0 &&
    brandMentionCurrent >= 0 &&
    brandMentionCurrent <= brandMentionLow &&
    brandMentionLow <= brandMentionExpected &&
    brandMentionExpected <= brandMentionHigh &&
    brandMentionHigh <= 1
      ? {
          current: brandMentionCurrent,
          low: brandMentionLow,
          expected: brandMentionExpected,
          high: brandMentionHigh,
          observedAnswers: brandMentionObservedAnswers!,
        }
      : undefined;

  return {
    schemaVersion:
      numberValue(forecast.schemaVersion, root.schemaVersion) === 2
        ? 2
        : undefined,
    status,
    horizonWeeks: numberValue(forecast.horizonWeeks, forecast.horizon_weeks),
    currentScore,
    targetLow,
    targetExpected,
    targetHigh,
    gradeLow: grade(forecast.gradeLow ?? forecast.grade_low),
    gradeHigh: grade(forecast.gradeHigh ?? forecast.grade_high),
    challengeUpperOnly: grade(
      forecast.challengeUpperOnly ?? forecast.challenge_upper_only,
    ),
    rawCurrentScore,
    rawTargetLow,
    rawTargetExpected,
    rawTargetHigh,
    scoreBasis,
    summary: textValue(
      forecast.executiveSummary,
      forecast.executive_summary,
      forecast.summary,
    ),
    executiveSummary: textValue(
      forecast.executiveSummary,
      forecast.executive_summary,
    ),
    targetCondition: textValue(
      forecast.targetCondition,
      forecast.target_condition,
    ),
    dimensions,
    assumptions: asArray(forecast.assumptions)
      .map((item) => textValue(item))
      .filter((item): item is string => Boolean(item)),
    roadmap,
    limitations: asArray(forecast.limitations ?? root.limitations)
      .map((item) => textValue(item))
      .filter((item): item is string => Boolean(item)),
    generatedAt: timestampValue(
      forecast.generatedAt,
      forecast.generated_at,
      root.completedAt,
      root.completed_at,
    ),
    error: localizedUserFacingError(
      textValue(root.error, root.errorMessage, root.error_message),
      undefined,
      "",
    ),
    failureCode: normalizeAssessmentFailureCode(
      root.failureCode,
      root.failure_code,
      forecast.failureCode,
      forecast.failure_code,
    ),
    quality: normalizeResultQuality(root.quality ?? forecast.quality),
    brandMentionRateForecast,
  };
}

function normalizeExecutionLog(value: unknown): GeoExecutionLog | undefined {
  const source = asRecord(value);
  const rawEntries = asArray(source.entries ?? source.stages);
  if (rawEntries.length === 0) return undefined;
  const validStatuses = new Set([
    "queued",
    "running",
    "waiting",
    "partial_review",
    "completed",
    "failed",
    "unknown",
  ]);
  const validKinds = new Set([
    "status",
    "model_output",
    "result_summary",
    "progress_summary",
    "artifact",
    "poll",
    "error",
  ]);
  const validStages = new Set<GeoStage>([
    "enterprise_analysis",
    "question_recommendation",
    "monitoring",
    "current_assessment",
    "service_activation",
  ]);

  const entries = rawEntries.flatMap((item, entryIndex) => {
    const entry = asRecord(item);
    const id = textValue(entry.id);
    const title = textValue(entry.title, entry.label);
    const rawStage = textValue(entry.stage);
    if (!id || !title || !rawStage || !validStages.has(rawStage as GeoStage)) {
      return [];
    }
    const rawStatus = textValue(entry.status)?.toLowerCase() ?? "unknown";
    const status = validStatuses.has(rawStatus) ? rawStatus : "unknown";
    const counterSource = asRecord(entry.counters);
    const total = numberValue(counterSource.total);
    const completed = numberValue(counterSource.completed);
    const failed = numberValue(counterSource.failed);
    const counters =
      total !== undefined && completed !== undefined && failed !== undefined
        ? {
            total: Math.max(0, Math.round(total)),
            completed: Math.max(0, Math.round(completed)),
            failed: Math.max(0, Math.round(failed)),
          }
        : undefined;
    const events = asArray(entry.events).flatMap((item, eventIndex) => {
      const event = asRecord(item);
      const message = textValue(event.message, event.text);
      if (!message) return [];
      const rawKind = textValue(event.kind)?.toLowerCase() ?? "status";
      if (!validKinds.has(rawKind)) return [];
      return [
        {
          id:
            textValue(event.id) ??
            `${id}-event-${entryIndex + 1}-${eventIndex + 1}`,
          kind: rawKind as GeoExecutionLog["entries"][number]["events"][number]["kind"],
          message:
            rawKind === "error" ? localizedUserFacingError(message) : message,
          createdAt: timestampValue(
            event.createdAt,
            event.created_at,
            event.at,
          ),
        },
      ];
    });
    const progress = numberValue(entry.progress);
    const crawlProgress = normalizeCrawlProgress(
      entry.crawlProgress ?? entry.crawl_progress,
    );

    return [
      {
        id,
        stage: rawStage as GeoStage,
        title,
        status: status as GeoExecutionLog["entries"][number]["status"],
        progress: progress === undefined ? undefined : clampProgress(progress),
        startedAt: timestampValue(entry.startedAt, entry.started_at),
        updatedAt: timestampValue(entry.updatedAt, entry.updated_at),
        completedAt: timestampValue(entry.completedAt, entry.completed_at),
        nextPollAt: timestampValue(entry.nextPollAt, entry.next_poll_at),
        counters,
        ...(crawlProgress ? { crawlProgress } : {}),
        events,
      },
    ];
  });
  if (entries.length === 0) return undefined;

  const fetchedAt =
    textValue(
      source.fetchedAt,
      source.fetched_at,
      source.updatedAt,
      source.updated_at,
    ) ?? new Date().toISOString();
  const requestedCurrentEntryId = textValue(
    source.currentEntryId,
    source.current_entry_id,
  );
  const activeStatuses = new Set(["queued", "running", "waiting", "unknown"]);
  const requestedCurrentEntry = entries.find(
    (entry) => entry.id === requestedCurrentEntryId,
  );
  const currentEntryId = activeStatuses.has(requestedCurrentEntry?.status || "")
    ? requestedCurrentEntry?.id
    : [...entries].reverse().find((entry) => activeStatuses.has(entry.status))
        ?.id;

  return {
    currentEntryId,
    fetchedAt,
    updatedAt:
      textValue(source.updatedAt, source.updated_at, fetchedAt) ?? fetchedAt,
    entries,
  };
}

function normalizeQuestionRecommendation(
  project: JsonRecord,
  questionTask: JsonRecord,
  questions: GeoQuestion[],
  executionLog: GeoExecutionLog | undefined,
  fallback?: GeoQuestionRecommendation,
): GeoQuestionRecommendation {
  const recommendation = asRecord(
    project.questionRecommendation ?? project.question_recommendation,
  );
  const status = textValue(recommendation.status)?.toLowerCase();
  const startedAt = timestampValue(
    recommendation.startedAt,
    recommendation.started_at,
  );
  const terminalAt = timestampValue(
    recommendation.terminalAt,
    recommendation.terminal_at,
  );
  const rawFailureKind = textValue(
    recommendation.failureKind,
    recommendation.failure_kind,
  );
  const failureKind = ["provider_unavailable", "result_invalid"].includes(
    rawFailureKind || "",
  )
    ? (rawFailureKind as GeoQuestionRecommendation["failureKind"])
    : undefined;
  const quality = normalizeResultQuality(
    recommendation.quality,
    fallback?.quality,
  );
  const recommendedQuestionCount = questions.filter(
    (question) => !question.id.startsWith("custom-"),
  ).length;
  const legacyQuestionEntry = executionLog?.entries.find(
    (entry) => entry.id === "question-recommendation",
  );

  // Any server-projected question is safe to display. Completeness remains
  // explicit and selection is still controlled per item by `selectable`.
  if (recommendedQuestionCount > 0) {
    return {
      status: "ready",
      startedAt: startedAt ?? legacyQuestionEntry?.startedAt,
      terminalAt: terminalAt ?? legacyQuestionEntry?.completedAt,
      quality: quality ?? {
        completeness: recommendedQuestionCount === 20 ? "complete" : "partial",
        stats: {
          acceptedCount: recommendedQuestionCount,
          expectedCount: 20,
          droppedCount: Math.max(0, 20 - recommendedQuestionCount),
          selectableCount: questions.filter(
            (question) =>
              !question.id.startsWith("custom-") && question.selectable,
          ).length,
        },
        downstreamEligible: questions.some(
          (question) =>
            !question.id.startsWith("custom-") && question.selectable,
        ),
      },
    };
  }
  if (["not_started", "pending", "ready", "failed"].includes(status || "")) {
    if (status === "ready") {
      return {
        status: "failed",
        startedAt: startedAt ?? legacyQuestionEntry?.startedAt,
        terminalAt: terminalAt ?? legacyQuestionEntry?.completedAt,
        failureKind: "result_invalid",
      };
    }
    return {
      status: status as GeoQuestionRecommendation["status"],
      startedAt,
      ...(["ready", "failed"].includes(status || "") ? { terminalAt } : {}),
      ...(status === "failed"
        ? { failureKind: failureKind ?? "provider_unavailable" }
        : {}),
    };
  }

  const hasQuestionTask = Object.keys(questionTask).length > 0;
  if (hasQuestionTask) {
    const taskStatus = textValue(questionTask.status)?.toLowerCase() ?? "";
    if (["failed", "error", "cancelled", "canceled"].includes(taskStatus)) {
      return {
        status: "failed",
        startedAt: legacyQuestionEntry?.startedAt,
        terminalAt: legacyQuestionEntry?.completedAt,
        failureKind: "provider_unavailable",
      };
    }
    if (
      ["ready", "completed", "complete", "succeeded", "success"].includes(
        taskStatus,
      )
    ) {
      return {
        status: "failed",
        startedAt: legacyQuestionEntry?.startedAt,
        terminalAt: legacyQuestionEntry?.completedAt,
        failureKind: "result_invalid",
      };
    }
    return {
      status: "pending",
      startedAt: legacyQuestionEntry?.startedAt,
    };
  }

  if (
    !hasOwnField(
      project,
      "questionRecommendation",
      "question_recommendation",
      "questionTask",
      "question_task",
      "questions",
    ) &&
    fallback
  ) {
    return fallback;
  }
  return { status: "not_started" };
}

function normalizeResultQuality(
  value: unknown,
  fallback?: GeoResultQuality,
): GeoResultQuality | undefined {
  const source = asRecord(value);
  const completeness = textValue(source.completeness);
  if (completeness !== "complete" && completeness !== "partial") {
    return fallback;
  }
  const statsSource = asRecord(source.stats);
  const acceptedCount = numberValue(statsSource.acceptedCount);
  const droppedCount = numberValue(statsSource.droppedCount);
  const expectedCount = numberValue(statsSource.expectedCount);
  const selectableCount = numberValue(statsSource.selectableCount);
  const warnings = asArray(source.warnings).flatMap((item) => {
    const warning = asRecord(item);
    const code = textValue(warning.code);
    if (
      !code ||
      ![
        "RESULT_INCOMPLETE",
        "ITEM_DROPPED",
        "EVIDENCE_INCOMPLETE",
        "AGGREGATE_UNAVAILABLE",
        "OPTIONAL_ASSET_SKIPPED",
        "COVERAGE_INCOMPLETE",
      ].includes(code)
    ) {
      return [];
    }
    return [
      {
        code: code as NonNullable<GeoResultQuality["warnings"]>[number]["code"],
        area: textValue(warning.area),
      },
    ];
  });
  return {
    completeness,
    ...(acceptedCount !== undefined && droppedCount !== undefined
      ? {
          stats: {
            acceptedCount: Math.max(0, Math.floor(acceptedCount)),
            droppedCount: Math.max(0, Math.floor(droppedCount)),
            ...(expectedCount !== undefined
              ? { expectedCount: Math.max(0, Math.floor(expectedCount)) }
              : {}),
            ...(selectableCount !== undefined
              ? { selectableCount: Math.max(0, Math.floor(selectableCount)) }
              : {}),
          },
        }
      : {}),
    ...(warnings.length ? { warnings } : {}),
    ...(typeof source.downstreamEligible === "boolean"
      ? { downstreamEligible: source.downstreamEligible }
      : {}),
    ...(typeof source.publishable === "boolean"
      ? { publishable: source.publishable }
      : {}),
  };
}

function normalizeCrawlProgress(value: unknown): GeoCrawlProgress | undefined {
  const source = asRecord(value);
  const phases = new Set<GeoCrawlProgress["phase"]>([
    "planning",
    "crawling",
    "extracting",
    "assets",
    "documents",
    "finalizing",
    "completed",
  ]);
  const phase = textValue(source.phase) as
    | GeoCrawlProgress["phase"]
    | undefined;
  const reportedAt = textValue(source.reportedAt, source.reported_at);
  const values = {
    visitedLinks: numberValue(source.visitedLinks, source.visited_links),
    successfulPages: numberValue(
      source.successfulPages,
      source.successful_pages,
    ),
    failedPages: numberValue(source.failedPages, source.failed_pages),
    textCharacters: numberValue(source.textCharacters, source.text_characters),
    imagesDiscovered: numberValue(
      source.imagesDiscovered,
      source.images_discovered,
    ),
    imagesDownloaded: numberValue(
      source.imagesDownloaded,
      source.images_downloaded,
    ),
    documentsParsed: numberValue(
      source.documentsParsed,
      source.documents_parsed,
    ),
    webQueriesExecuted: numberValue(
      source.webQueriesExecuted,
      source.web_queries_executed,
    ),
  };
  if (
    source.schemaVersion !== 1 ||
    !phase ||
    !phases.has(phase) ||
    !reportedAt ||
    !Number.isFinite(Date.parse(reportedAt)) ||
    Object.values(values).some(
      (count) =>
        !Number.isSafeInteger(count) ||
        Number(count) < 0 ||
        Number(count) > 1_000_000_000,
    ) ||
    Number(values.successfulPages) + Number(values.failedPages) >
      Number(values.visitedLinks) ||
    Number(values.imagesDownloaded) > Number(values.imagesDiscovered)
  ) {
    return undefined;
  }
  return {
    schemaVersion: 1,
    reportedAt: new Date(reportedAt).toISOString(),
    phase,
    visitedLinks: values.visitedLinks!,
    successfulPages: values.successfulPages!,
    failedPages: values.failedPages!,
    textCharacters: values.textCharacters!,
    imagesDiscovered: values.imagesDiscovered!,
    imagesDownloaded: values.imagesDownloaded!,
    documentsParsed: values.documentsParsed!,
    webQueriesExecuted: values.webQueriesExecuted!,
  };
}

function normalizeStatus(
  project: JsonRecord,
  kbTask: JsonRecord,
  questionTask: JsonRecord,
  questions: GeoQuestion[],
  questionRecommendation: GeoQuestionRecommendation,
): GeoProjectStatus {
  if (
    textValue(
      project.questionValidationError,
      project.question_validation_error,
    )
  )
    return "failed";
  const projectStatus = textValue(project.status)?.toLowerCase();
  if (projectStatus) {
    if (projectStatus === "draft") return "draft";
    if (["failed", "error", "cancelled", "canceled"].includes(projectStatus))
      return "failed";
    if (["uploading"].includes(projectStatus)) return "uploading";
    if (["recommending", "question_recommendation"].includes(projectStatus))
      return "recommending";
    if (
      [
        "running",
        "processing",
        "analyzing",
        "in_progress",
        "knowledge_base",
      ].includes(projectStatus)
    )
      return "analyzing";
    if (
      [
        "ready",
        "ready_for_questions",
        "completed",
        "complete",
        "succeeded",
        "success",
      ].includes(projectStatus)
    )
      return "ready";
    if (["queued", "pending", "created"].includes(projectStatus))
      return "queued";
  }

  // Compatibility for older partial responses that did not carry the
  // authoritative project status. The independent recommendation lifecycle
  // may fill that gap, but never overrides a later project stage above.
  if (questionRecommendation.status === "failed") return "failed";
  if (questionRecommendation.status === "ready") return "ready";
  if (questionRecommendation.status === "pending") return "recommending";
  const raw =
    textValue(questionTask.status, kbTask.status)?.toLowerCase() ?? "queued";
  if (raw === "draft") return "draft";
  if (["failed", "error", "cancelled", "canceled"].includes(raw))
    return "failed";
  if (
    questions.length === 20 ||
    (["ready", "completed", "complete", "succeeded", "success"].includes(raw) &&
      questions.length > 0)
  )
    return "ready";
  if (
    Object.keys(questionTask).length > 0 ||
    ["recommending", "question_recommendation"].includes(raw)
  )
    return "recommending";
  if (["uploading"].includes(raw)) return "uploading";
  if (
    [
      "running",
      "processing",
      "analyzing",
      "in_progress",
      "knowledge_base",
    ].includes(raw)
  )
    return "analyzing";
  return "queued";
}

function normalizeServiceActivation(
  value: unknown,
): GeoServiceActivation | undefined {
  const source = asRecord(value);
  if (Object.keys(source).length === 0) return undefined;
  const status = textValue(source.status)?.toLowerCase();
  const category = textValue(source.category);
  const amountFen = numberValue(source.amountFen, source.amount_fen);
  const billingMonths = numberValue(
    source.billingMonths,
    source.billing_months,
  );
  const questionId = textValue(source.questionId, source.question_id);
  if (
    ![
      "not_started",
      "profile_required",
      "contract_preparing",
      "signature_required",
      "payment_required",
      "activation_pending",
      "account_setup_required",
      "provisioning",
      "active",
      "failed",
    ].includes(status ?? "") ||
    !["reputation", "product_scenario", "competitor_comparison"].includes(
      category ?? "",
    ) ||
    !questionId ||
    !Number.isSafeInteger(amountFen) ||
    amountFen! <= 0 ||
    billingMonths !== 1
  ) {
    return undefined;
  }
  return {
    status: status as GeoServiceActivation["status"],
    questionId,
    category: category as GeoServiceCategory,
    amountFen: amountFen!,
    billingMonths: 1,
    orderId: textValue(source.orderId, source.order_id),
    paidAt: timestampValue(source.paidAt, source.paid_at),
    profileSubmittedAt: timestampValue(
      source.profileSubmittedAt,
      source.profile_submitted_at,
    ),
    contractId: textValue(source.contractId, source.contract_id),
    contractPreviewUrl: textValue(
      source.contractPreviewUrl,
      source.contract_preview_url,
    ),
    signingUrl: textValue(source.signingUrl, source.signing_url),
    signedAt: timestampValue(source.signedAt, source.signed_at),
    contractAuthorizationMode:
      textValue(
        source.contractAuthorizationMode,
        source.contract_authorization_mode,
      ) === "external_wechat"
        ? "external_wechat"
        : undefined,
    contractAuthorizedAt: timestampValue(
      source.contractAuthorizedAt,
      source.contract_authorized_at,
    ),
    contractWorkflowReference: textValue(
      source.contractWorkflowReference,
      source.contract_workflow_reference,
      source.manualOrderReference,
      source.manual_order_reference,
    ),
    manualOrderReference: textValue(
      source.manualOrderReference,
      source.manual_order_reference,
      source.contractWorkflowReference,
      source.contract_workflow_reference,
    ),
    manualOrderStatus: [
      "pending_admin",
      "signature_required",
      "payment_required",
      "account_setup_required",
      "activation_required",
      "active",
      "rejected",
      "failed",
    ].includes(
      textValue(source.manualOrderStatus, source.manual_order_status) ?? "",
    )
      ? (textValue(
          source.manualOrderStatus,
          source.manual_order_status,
        ) as GeoServiceActivation["manualOrderStatus"])
      : undefined,
    planCode:
      textValue(source.planCode, source.plan_code) === "basic"
        ? "basic"
        : undefined,
    serviceDays:
      numberValue(source.serviceDays, source.service_days) === 30
        ? 30
        : undefined,
    provisioningVersion:
      numberValue(source.provisioningVersion, source.provisioning_version) === 2
        ? 2
        : undefined,
    provisioningReference: textValue(
      source.provisioningReference,
      source.provisioning_reference,
    ),
    provisioningStatus: [
      "pending_confirmation",
      "provisioned",
      "failed",
    ].includes(
      textValue(source.provisioningStatus, source.provisioning_status) ?? "",
    )
      ? (textValue(
          source.provisioningStatus,
          source.provisioning_status,
        ) as GeoServiceActivation["provisioningStatus"])
      : undefined,
    provisioningMessage: textValue(
      source.provisioningMessage,
      source.provisioning_message,
    ),
    provisioningRetryable:
      typeof (source.provisioningRetryable ?? source.provisioning_retryable) ===
      "boolean"
        ? Boolean(source.provisioningRetryable ?? source.provisioning_retryable)
        : undefined,
    accountMode: ["create", "bind_existing"].includes(
      textValue(source.accountMode, source.account_mode) ?? "",
    )
      ? (textValue(
          source.accountMode,
          source.account_mode,
        ) as GeoServiceActivation["accountMode"])
      : undefined,
    accountUsername: textValue(source.accountUsername, source.account_username),
    accountDisplayName: textValue(
      source.accountDisplayName,
      source.account_display_name,
    ),
    accountSetupUrl: textValue(
      source.accountSetupUrl,
      source.account_setup_url,
    ),
    workspaceUrl: textValue(source.workspaceUrl, source.workspace_url),
    provisionedAt: timestampValue(source.provisionedAt, source.provisioned_at),
    activatedAt: timestampValue(source.activatedAt, source.activated_at),
    knowledgeImport: (() => {
      const knowledge = asRecord(
        source.knowledgeImport ?? source.knowledge_import,
      );
      const importStatus = textValue(knowledge.status);
      if (
        !["pending", "importing", "ready", "failed"].includes(
          importStatus ?? "",
        )
      )
        return undefined;
      return {
        status: importStatus as NonNullable<
          GeoServiceActivation["knowledgeImport"]
        >["status"],
        retryable:
          typeof knowledge.retryable === "boolean"
            ? knowledge.retryable
            : undefined,
        message: localizedUserFacingError(
          textValue(knowledge.message),
          undefined,
          "",
        ),
        updatedAt: timestampValue(knowledge.updatedAt, knowledge.updated_at),
      };
    })(),
    error: localizedUserFacingError(textValue(source.error), undefined, ""),
  };
}

function normalizeStage(
  project: JsonRecord,
  questions: GeoQuestion[],
  questionRecommendation: GeoQuestionRecommendation,
  monitoring?: GeoMonitoringResult,
  assessment?: GeoAssessmentResult,
  optimizationForecast?: GeoOptimizationForecastResult,
  serviceActivation?: GeoServiceActivation,
): GeoStage {
  const raw = textValue(project.stage)?.toLowerCase();
  if (
    serviceActivation?.status === "active" ||
    raw === "service_activation" ||
    raw === "service"
  )
    return "service_activation";
  if (
    Boolean(assessment && assessment.status !== "not_started") ||
    Boolean(
      optimizationForecast && optimizationForecast.status !== "not_started",
    )
  )
    return "current_assessment";
  if (
    raw === "monitoring" ||
    raw === "question_monitoring" ||
    Boolean(monitoring?.runId)
  )
    return "monitoring";
  if (
    raw === "current_assessment" ||
    raw === "assessment" ||
    raw === "current_state_assessment"
  )
    return "current_assessment";
  if (
    questionRecommendation.status !== "not_started" ||
    questions.length > 0 ||
    raw === "question_recommendation" ||
    raw === "questions"
  )
    return "question_recommendation";
  return "enterprise_analysis";
}

const KNOWLEDGE_BASE_FRESH_UPLOAD_MESSAGE =
  "资料已接收，但向分析服务提交资料未完成。请移除本次项目后重新上传，并创建全新任务。";
const KNOWLEDGE_BASE_CREATE_UNKNOWN_MESSAGE =
  "任务创建结果暂时无法确认。请移除本次项目后重新上传，并创建全新任务。";
const KNOWLEDGE_BASE_FRESH_UPLOAD_CODES = new Set([
  "TASK_PREPARATION_FAILED",
  "FILE_UPLOAD_CONFIRMATION_UNKNOWN",
  "FILE_UPLOAD_OUTCOME_UNKNOWN",
  "FILE_LEASE_PERSIST_FAILED",
  "FILE_UPLOAD_REJECTED",
]);
const KNOWLEDGE_BASE_CREATE_UNKNOWN_CODES = new Set([
  "CREATE_OUTCOME_UNKNOWN",
  "CREATE_RECONCILE_CONFLICT",
  "TASK_PROVIDER_BIND_OUTCOME_UNKNOWN",
]);

function extractPublicProjectError(value: unknown) {
  const record = asRecord(value);
  const rawCode =
    typeof value === "string"
      ? value
      : textValue(record.code, record.errorCode, record.error_code);
  const code = String(rawCode || "")
    .trim()
    .toUpperCase();
  if (KNOWLEDGE_BASE_CREATE_UNKNOWN_CODES.has(code)) {
    return KNOWLEDGE_BASE_CREATE_UNKNOWN_MESSAGE;
  }
  if (KNOWLEDGE_BASE_FRESH_UPLOAD_CODES.has(code)) {
    return KNOWLEDGE_BASE_FRESH_UPLOAD_MESSAGE;
  }
  const message =
    typeof value === "string"
      ? value
      : textValue(record.message, record.error, record.detail);
  return localizedUserFacingError(message, undefined, "");
}

export function normalizeGeoProject(
  payload: unknown,
  fallback?: Partial<GeoProject>,
): GeoProject {
  const root = asRecord(payload);
  const project = asRecord(root.project ?? root.data ?? payload);
  const kbTask = asRecord(project.kbTask ?? project.kb_task ?? project.task);
  const questionTask = asRecord(project.questionTask ?? project.question_task);
  const questions = normalizeQuestions(project.questions);
  const normalizedKnowledgeBase = normalizeKnowledgeBase(project);
  const knowledgeBase = hasOwnField(
    project,
    "knowledgeBase",
    "knowledge_base",
    "archive",
  )
    ? normalizedKnowledgeBase
    : (normalizedKnowledgeBase ?? fallback?.knowledgeBase);
  const normalizedMonitoring = normalizeMonitoring(
    project.monitoring ?? project.monitorRun ?? project.monitor_run,
  );
  const monitoring = hasOwnField(
    project,
    "monitoring",
    "monitorRun",
    "monitor_run",
  )
    ? normalizedMonitoring
    : (normalizedMonitoring ?? fallback?.monitoring);
  const normalizedIndustryRankingMonitoring = normalizeMonitoring(
    project.industryRankingMonitoring ??
      project.industry_ranking_monitoring ??
      project.industryRankingMonitorRun ??
      project.industry_ranking_monitor_run,
  );
  const industryRankingMonitoring = hasOwnField(
    project,
    "industryRankingMonitoring",
    "industry_ranking_monitoring",
    "industryRankingMonitorRun",
    "industry_ranking_monitor_run",
  )
    ? normalizedIndustryRankingMonitoring
    : (normalizedIndustryRankingMonitoring ??
      fallback?.industryRankingMonitoring);
  const normalizedAssessment = normalizeAssessment(
    project.assessment ??
      project.currentAssessment ??
      project.current_assessment,
  );
  const assessment = hasOwnField(
    project,
    "assessment",
    "currentAssessment",
    "current_assessment",
  )
    ? normalizedAssessment
    : (normalizedAssessment ?? fallback?.assessment);
  const normalizedIndustryRankingAssessment = normalizeAssessment(
    project.industryRankingAssessment ?? project.industry_ranking_assessment,
  );
  const industryRankingAssessment = hasOwnField(
    project,
    "industryRankingAssessment",
    "industry_ranking_assessment",
  )
    ? normalizedIndustryRankingAssessment
    : (normalizedIndustryRankingAssessment ??
      fallback?.industryRankingAssessment);
  const normalizedOptimizationForecast = normalizeOptimizationForecast(
    project.optimizationForecast ?? project.optimization_forecast,
  );
  const optimizationForecast = hasOwnField(
    project,
    "optimizationForecast",
    "optimization_forecast",
  )
    ? normalizedOptimizationForecast
    : (normalizedOptimizationForecast ?? fallback?.optimizationForecast);
  const normalizedIndustryRankingOptimizationForecast =
    normalizeOptimizationForecast(
      project.industryRankingOptimizationForecast ??
        project.industry_ranking_optimization_forecast,
    );
  const industryRankingOptimizationForecast = hasOwnField(
    project,
    "industryRankingOptimizationForecast",
    "industry_ranking_optimization_forecast",
  )
    ? normalizedIndustryRankingOptimizationForecast
    : (normalizedIndustryRankingOptimizationForecast ??
      fallback?.industryRankingOptimizationForecast);
  const normalizedServiceActivation = normalizeServiceActivation(
    project.serviceActivation ?? project.service_activation,
  );
  const serviceActivation = hasOwnField(
    project,
    "serviceActivation",
    "service_activation",
  )
    ? normalizedServiceActivation
    : (normalizedServiceActivation ?? fallback?.serviceActivation);
  const normalizedExecutionLog = normalizeExecutionLog(
    project.executionLog ?? project.execution,
  );
  const executionLog = hasOwnField(project, "executionLog", "execution")
    ? normalizedExecutionLog
    : (normalizedExecutionLog ?? fallback?.executionLog);
  const questionRecommendation = normalizeQuestionRecommendation(
    project,
    questionTask,
    questions,
    executionLog,
    fallback?.questionRecommendation,
  );
  const now = new Date().toISOString();
  const remoteToken =
    textValue(
      root.projectToken,
      root.project_token,
      project.projectToken,
      fallback?.remoteToken,
    ) ?? "";
  const remoteId = textValue(project.id, project.projectId, fallback?.remoteId);
  const id = fallback?.id ?? remoteId ?? remoteToken;
  const files = asArray(project.attachments ?? project.files).flatMap(
    (file, index): GeoFileReference[] => {
      const record = asRecord(file);
      const name = textValue(record.filename, record.name);
      if (!name) return [];
      return [
        {
          id: textValue(record.fileId, record.id) ?? `file-${index + 1}`,
          name,
          size: numberValue(record.sizeBytes, record.size) ?? 0,
          type:
            textValue(record.contentType, record.type) ??
            "application/octet-stream",
        },
      ];
    },
  );
  const status = normalizeStatus(
    project,
    kbTask,
    questionTask,
    questions,
    questionRecommendation,
  );
  const currentExecutionEntry = executionLog?.entries.find(
    (entry) => entry.id === executionLog.currentEntryId,
  );
  const taskForProgress =
    Object.keys(questionTask).length > 0 ? questionTask : kbTask;
  const currentExecutionMessage = currentExecutionEntry
    ? [...currentExecutionEntry.events]
        .reverse()
        .find((event) => event.kind === "status")?.message
    : undefined;
  const publicError =
    extractPublicProjectError(project.error) ||
    extractPublicProjectError(taskForProgress.error);
  const validationError = textValue(
    project.questionValidationError,
    project.question_validation_error,
  );

  return {
    id,
    remoteToken,
    remoteId,
    title:
      textValue(
        project.companyName,
        project.title,
        fallback?.title,
        project.input,
      ) ?? "未命名企业",
    input:
      textValue(project.input, project.companyWebsite, fallback?.input) ?? "",
    createdAt:
      timestampValue(
        project.createdAt,
        project.created_at,
        fallback?.createdAt,
      ) ?? now,
    updatedAt: timestampValue(project.updatedAt, project.updated_at) ?? now,
    stage: normalizeStage(
      project,
      questions,
      questionRecommendation,
      monitoring ?? industryRankingMonitoring,
      assessment ?? industryRankingAssessment,
      optimizationForecast ?? industryRankingOptimizationForecast,
      serviceActivation,
    ),
    status,
    progress: currentExecutionEntry
      ? clampProgress(currentExecutionEntry.progress ?? project.progress)
      : status === "ready"
        ? 100
        : clampProgress(taskForProgress.progress ?? project.progress),
    progressLabel: currentExecutionMessage,
    knowledgeBaseValidationCategory: (() => {
      const category = textValue(
        project.knowledgeBaseValidationCategory,
        project.knowledge_base_validation_category,
      );
      return ["structure", "media", "content", "unsafe"].includes(
        category || "",
      )
        ? (category as GeoProject["knowledgeBaseValidationCategory"])
        : undefined;
    })(),
    knowledgeBaseSupportRequired:
      typeof project.knowledgeBaseSupportRequired === "boolean"
        ? project.knowledgeBaseSupportRequired
        : undefined,
    knowledgeBaseFinalization: (() => {
      const finalization = asRecord(
        project.knowledgeBaseFinalization ??
          project.knowledge_base_finalization,
      );
      const finalizationState = textValue(
        finalization.finalizationState,
        finalization.finalization_state,
      );
      const finalizerVersion = textValue(
        finalization.finalizerVersion,
        finalization.finalizer_version,
      );
      if (
        !["pending", "failed_internal", "completed"].includes(
          finalizationState || "",
        ) ||
        !finalizerVersion
      ) {
        return undefined;
      }
      const errorCode = textValue(
        finalization.errorCode,
        finalization.error_code,
      );
      return {
        finalizationState: finalizationState as NonNullable<
          GeoProject["knowledgeBaseFinalization"]
        >["finalizationState"],
        finalizerVersion,
        candidateSha256: textValue(
          finalization.candidateSha256,
          finalization.candidate_sha256,
        ),
        errorCode:
          errorCode === "KB_FINALIZER_CONTRACT_VIOLATION"
            ? errorCode
            : undefined,
      };
    })(),
    questionRetryAvailable: project.questionRetryAvailable === true,
    assessmentRetryAvailable: project.assessmentRetryAvailable === true,
    industryRankingAssessmentRetryAvailable:
      project.industryRankingAssessmentRetryAvailable === true ||
      project.industry_ranking_assessment_retry_available === true,
    assessmentUpdatingToVersion2:
      project.assessmentUpdatingToVersion2 === true ||
      project.assessment_updating_to_version_2 === true,
    optimizationForecastRetryAvailable:
      typeof project.optimizationForecastRetryAvailable === "boolean"
        ? project.optimizationForecastRetryAvailable
        : undefined,
    industryRankingOptimizationForecastRetryAvailable:
      typeof project.industryRankingOptimizationForecastRetryAvailable ===
      "boolean"
        ? project.industryRankingOptimizationForecastRetryAvailable
        : typeof project.industry_ranking_optimization_forecast_retry_available ===
            "boolean"
          ? project.industry_ranking_optimization_forecast_retry_available
          : undefined,
    files: hasOwnField(project, "attachments", "files")
      ? files
      : files.length > 0
        ? files
        : (fallback?.files ?? []),
    knowledgeBase,
    questionRecommendation,
    questions: hasOwnField(project, "questions")
      ? questions
      : questions.length > 0
        ? questions
        : (fallback?.questions ?? []),
    selectedQuestionId: hasOwnField(
      project,
      "selectedQuestionId",
      "selected_question_id",
    )
      ? textValue(project.selectedQuestionId, project.selected_question_id)
      : textValue(fallback?.selectedQuestionId),
    selectedIndustryRankingQuestionId: hasOwnField(
      project,
      "selectedIndustryRankingQuestionId",
      "selected_industry_ranking_question_id",
    )
      ? textValue(
          project.selectedIndustryRankingQuestionId,
          project.selected_industry_ranking_question_id,
        )
      : textValue(fallback?.selectedIndustryRankingQuestionId),
    monitoringEdition: hasOwnField(
      project,
      "monitoringEdition",
      "monitoring_edition",
    )
      ? resolveGeoMonitoringEdition(
          project.monitoringEdition ?? project.monitoring_edition,
        )
      : resolveGeoMonitoringEdition(fallback?.monitoringEdition),
    monitoringRegion: hasOwnField(
      project,
      "monitoringRegion",
      "monitoring_region",
    )
      ? normalizeMonitoringRegion(
          project.monitoringRegion ?? project.monitoring_region,
        )
      : (monitoring?.region ?? fallback?.monitoringRegion),
    monitoringScreenshotEnabled: hasOwnField(
      project,
      "monitoringScreenshotEnabled",
      "monitoring_screenshot_enabled",
    )
      ? project.monitoringScreenshotEnabled === true ||
        project.monitoring_screenshot_enabled === true
      : (monitoring?.screenshotEnabled ??
        fallback?.monitoringScreenshotEnabled ??
        false),
    selectedPlatformIds: (() => {
      const normalized = normalizePlatformIds(
        project.selectedPlatformIds ?? project.selected_platform_ids,
      );
      return hasOwnField(
        project,
        "selectedPlatformIds",
        "selected_platform_ids",
      )
        ? normalized
        : normalized.length > 0
          ? normalized
          : monitoring?.platforms.length
            ? monitoring.platforms
            : (fallback?.selectedPlatformIds ?? []);
    })(),
    monitoringRecovery:
      monitoring?.runId &&
      (!fallback?.monitoringRecovery?.industryRankingQuestionId ||
        industryRankingMonitoring?.runId)
        ? undefined
        : fallback?.monitoringRecovery,
    monitoring,
    industryRankingMonitoring,
    assessment,
    industryRankingAssessment,
    optimizationForecast,
    industryRankingOptimizationForecast,
    serviceActivation,
    executionLog,
    error: localizedUserFacingError(
      textValue(
        validationError,
        publicError,
        project.errorMessage,
        typeof project.error === "string" ? project.error : undefined,
      ),
      undefined,
      "",
    ),
  };
}

function normalizeRequiredProjectResponse(
  payload: unknown,
  fallback?: Partial<GeoProject>,
): GeoProject {
  const root = asRecord(payload);
  const project = asRecord(root.project ?? root.data ?? payload);
  const responseToken = textValue(
    root.projectToken,
    root.project_token,
    project.projectToken,
    project.project_token,
  );
  const responseProjectId = textValue(project.id, project.projectId);
  if (!responseToken || !responseProjectId) {
    throw new GeoApiError(
      "项目接口返回内容无效，请刷新后重试。",
      502,
      "INVALID_PROJECT_RESPONSE",
    );
  }
  return normalizeGeoProject(payload, fallback);
}

export type GeoInviteContext = {
  inviteContextToken: string;
  businessOwnerName: string;
};

export async function verifyGeoInvitation(
  code: string,
  businessOwnerName: string,
): Promise<GeoInviteContext> {
  let normalizedBusinessOwnerName: string;
  try {
    normalizedBusinessOwnerName = normalizeBusinessOwnerName(businessOwnerName);
  } catch {
    throw new GeoApiError(
      "请输入有效的商务负责人姓名。",
      400,
      "INVALID_BUSINESS_OWNER_NAME",
    );
  }
  const payload = asRecord(
    await requestJson("/invite/verify", {
      method: "POST",
      body: JSON.stringify({
        code,
        businessOwnerName: normalizedBusinessOwnerName,
      }),
    }),
  );
  const inviteContextToken = textValue(payload.inviteContextToken);
  const responseBusinessOwnerName = textValue(payload.businessOwnerName);
  if (
    payload.ok !== true ||
    !inviteContextToken ||
    responseBusinessOwnerName !== normalizedBusinessOwnerName
  ) {
    throw new GeoApiError(
      "邀请码验证响应无效，请稍后重试。",
      502,
      "INVALID_INVITE_RESPONSE",
    );
  }
  return {
    inviteContextToken,
    businessOwnerName: normalizedBusinessOwnerName,
  };
}

export async function uploadGeoFile(
  file: File,
  options: {
    inviteContextToken: string;
    clientRequestId: string;
    attachmentIndex: number;
    reservation?: GeoUploadReservation;
    onReserved?: (reservation: GeoUploadReservation) => void;
    signal?: AbortSignal;
    onProgress?: (
      progress: Pick<
        GeoUploadProgress,
        "phase" | "fileLoadedBytes" | "fileTotalBytes"
      >,
    ) => void;
  },
): Promise<GeoUploadedFile> {
  let reservation = options.reservation;
  let shouldReconcileBeforeTransfer = Boolean(reservation);
  if (reservation) {
    validateUploadReservation(file, reservation);
    emitGeoUploadTelemetry("reservation_resumed", {
      attachmentIndex: options.attachmentIndex,
      declaredBytes: file.size,
      phase: "reserving",
      loadedBytes: 0,
      totalBytes: file.size,
      durationMs: 0,
      traceId: reservation.traceId,
    });
  } else {
    const reserved = await reserveGeoUpload(file, options);
    reservation = reserved.reservation;
    shouldReconcileBeforeTransfer =
      reserved.replayed || reserved.status === "uploaded";
    // This callback deliberately runs before a single file byte is sent. The
    // caller can therefore retain the stable token if transfer or response
    // confirmation is interrupted.
    options.onReserved?.(reservation);
  }

  if (shouldReconcileBeforeTransfer) {
    const state = await reconcileGeoUpload(reservation, file, options, {
      statusOnly: reservation.requiresStatusOnly === true,
    });
    if (state === "uploaded") {
      reportGeoUploadConfirmed(file, reservation, options);
      return reservation;
    }
  }

  let lastTransferError: unknown;
  for (
    let attempt = 0;
    attempt <= UPLOAD_TRANSFER_RETRY_DELAYS_MS.length;
    attempt += 1
  ) {
    let lastAttemptLoadedBytes = 0;
    const attemptStartedAt = Date.now();
    emitGeoUploadTelemetry("transfer_started", {
      attachmentIndex: options.attachmentIndex,
      declaredBytes: file.size,
      transferAttempt: attempt + 1,
      phase: "uploading",
      loadedBytes: 0,
      totalBytes: file.size,
      durationMs: 0,
      traceId: reservation.traceId,
    });
    try {
      await transferGeoUploadOnce(file, reservation.uploadToken, attempt + 1, {
        attachmentIndex: options.attachmentIndex,
        signal: options.signal,
        onProgress: (progress) => {
          lastAttemptLoadedBytes = progress.fileLoadedBytes;
          options.onProgress?.(progress);
        },
      });
      reportGeoUploadConfirmed(file, reservation, options);
      return reservation;
    } catch (error) {
      if (options.signal?.aborted) throw requestAbortReason(options.signal);
      if (!retryableUploadTransportError(error)) throw error;
      lastTransferError = error;
      const statusOnly =
        error instanceof GeoApiError &&
        error.code === "UPLOAD_ALREADY_COMMITTED";
      if (statusOnly && !reservation.requiresStatusOnly) {
        reservation = { ...reservation, requiresStatusOnly: true };
        options.onReserved?.(reservation);
      }
      emitGeoUploadTelemetry("transfer_outcome_unknown", {
        attachmentIndex: options.attachmentIndex,
        declaredBytes: file.size,
        transferAttempt: attempt + 1,
        phase: "reconciling",
        loadedBytes: lastAttemptLoadedBytes,
        totalBytes: file.size,
        durationMs: Date.now() - attemptStartedAt,
        status: error instanceof GeoApiError ? error.status : undefined,
        code: error instanceof GeoApiError ? error.code : "NETWORK_ERROR",
        traceId: reservation.traceId,
      });
      options.onProgress?.({
        phase: "reconciling",
        fileLoadedBytes: lastAttemptLoadedBytes,
        fileTotalBytes: file.size,
      });
      const state = await reconcileGeoUpload(reservation, file, options, {
        statusOnly,
        transferAttempt: attempt + 1,
      });
      if (state === "uploaded") {
        reportGeoUploadConfirmed(file, reservation, options);
        return reservation;
      }
      if (attempt >= UPLOAD_TRANSFER_RETRY_DELAYS_MS.length) break;
      const retryDelayMs = UPLOAD_TRANSFER_RETRY_DELAYS_MS[attempt]!;
      options.onProgress?.({
        phase: "retrying",
        fileLoadedBytes: 0,
        fileTotalBytes: file.size,
      });
      emitGeoUploadTelemetry("transfer_retry_scheduled", {
        attachmentIndex: options.attachmentIndex,
        declaredBytes: file.size,
        transferAttempt: attempt + 2,
        retryDelayMs,
        phase: "retrying",
        loadedBytes: 0,
        totalBytes: file.size,
        durationMs: Date.now() - attemptStartedAt,
        traceId: reservation.traceId,
      });
      await waitForGeoUploadDelay(retryDelayMs, options.signal);
    }
  }

  throw new GeoApiError(
    "当前文件自动重试 3 次仍未上传完成；文件和上传凭证已保留，请直接继续上传。",
    lastTransferError instanceof GeoApiError ? lastTransferError.status : 503,
    "UPLOAD_RETRY_EXHAUSTED",
    {
      attempts: UPLOAD_TRANSFER_RETRY_DELAYS_MS.length + 1,
      causeCode:
        lastTransferError instanceof GeoApiError
          ? lastTransferError.code
          : "NETWORK_ERROR",
    },
  );
}

type GeoUploadReservationResponse = {
  reservation: GeoUploadReservation;
  replayed: boolean;
  status?: string;
};

type GeoUploadReconcileState = "pending" | "uploaded";

type GeoUploadStatusResponse = {
  assetStatus: "pending" | "uploaded";
  transferState: "idle" | "uploading";
  declaredBytes: number;
  receivedBytes: number;
  traceId?: string;
};

type GeoUploadTelemetryDetail = {
  attachmentIndex: number;
  declaredBytes: number;
  transferAttempt?: number;
  retryDelayMs?: number;
  transferState?: string;
  receivedBytes?: number;
  phase?: GeoUploadProgress["phase"];
  loadedBytes?: number;
  totalBytes?: number;
  durationMs?: number;
  milestone?: 25 | 50 | 75 | 100;
  abortSource?:
    | "caller_abort"
    | "stall_watchdog"
    | "response_watchdog"
    | "xhr_error"
    | "xhr_abort"
    | "xhr_send_error"
    | "fetch_error"
    | "http_response";
  status?: number;
  code?: string;
  traceId?: string;
};

function emitGeoUploadTelemetry(
  event: string,
  detail: GeoUploadTelemetryDetail,
): void {
  if (
    typeof window === "undefined" ||
    typeof window.dispatchEvent !== "function" ||
    typeof CustomEvent !== "function"
  ) {
    return;
  }
  // Intentionally excludes filename, fileId, upload token, request id and
  // customer input. Consumers receive only bounded transfer diagnostics.
  window.dispatchEvent(
    new CustomEvent("frontmind:geo-upload-telemetry", {
      detail: {
        event,
        ...detail,
        navigatorOnline:
          typeof navigator === "undefined" ? undefined : navigator.onLine,
        visibilityState:
          typeof document === "undefined"
            ? undefined
            : document.visibilityState,
      },
    }),
  );
}

function validateUploadReservation(
  file: File,
  reservation: GeoUploadReservation,
): void {
  const expectedType = file.type || "application/octet-stream";
  if (
    !reservation.id ||
    !reservation.uploadToken ||
    reservation.sourceName !== file.name ||
    reservation.sourceLastModified !== file.lastModified ||
    reservation.size !== file.size ||
    reservation.type !== expectedType
  ) {
    throw new GeoApiError(
      "附件上传凭证与当前文件不一致，请重新选择文件。",
      409,
      "UPLOAD_RESERVATION_CONFLICT",
    );
  }
}

function retryableUploadTransportError(error: unknown): boolean {
  if (!(error instanceof GeoApiError)) return error instanceof TypeError;
  if (
    error.code === "UPLOAD_IN_PROGRESS" ||
    error.code === "UPLOAD_ALREADY_COMMITTED"
  ) {
    return true;
  }
  if (
    error.code === "UPLOAD_CANCELLED" ||
    error.status === 401 ||
    error.status === 403 ||
    error.status === 409 ||
    error.status === 413
  ) {
    return false;
  }
  return (
    error.code === "UPLOAD_NETWORK_ERROR" ||
    error.code === "UPLOAD_BROWSER_STALLED" ||
    error.code === "UPLOAD_SERVER_RESPONSE_TIMEOUT" ||
    error.code === "UPLOAD_EMPTY_PROXY_RESPONSE" ||
    error.status === 408 ||
    error.status === 429 ||
    (error.status >= 500 && error.status <= 599)
  );
}

function uploadReservationFailure(error: unknown): GeoApiError {
  return new GeoApiError(
    "上传任务暂时无法保留；文件尚未发送，请直接重试。",
    error instanceof GeoApiError ? error.status : 503,
    "UPLOAD_RESERVATION_FAILED",
    {
      causeCode: error instanceof GeoApiError ? error.code : "NETWORK_ERROR",
    },
  );
}

function freshUploadResetRequired(error?: GeoApiError): GeoApiError {
  return new GeoApiError(
    "旧上传任务已失效或文件回执不一致；请删除当前草稿后重新选择全部资料，发起全新上传。",
    409,
    "UPLOAD_FRESH_RESET_REQUIRED",
    error?.code ? { causeCode: error.code } : undefined,
  );
}

function waitForGeoUploadDelay(
  delayMs: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return Promise.reject(requestAbortReason(signal));
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = globalThis.setTimeout(finish, delayMs);
    const abort = () => {
      globalThis.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(requestAbortReason(signal!));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function reserveGeoUpload(
  file: File,
  options: {
    inviteContextToken: string;
    clientRequestId: string;
    attachmentIndex: number;
    signal?: AbortSignal;
    onProgress?: (
      progress: Pick<
        GeoUploadProgress,
        "phase" | "fileLoadedBytes" | "fileTotalBytes"
      >,
    ) => void;
  },
): Promise<GeoUploadReservationResponse> {
  options.onProgress?.({
    phase: "reserving",
    fileLoadedBytes: 0,
    fileTotalBytes: file.size,
  });
  let initPayload: JsonRecord | undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      initPayload = asRecord(
        await requestJson("/uploads/init", {
          method: "POST",
          signal: options.signal,
          body: JSON.stringify({
            inviteContextToken: options.inviteContextToken,
            filename: file.name,
            contentType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            clientRequestId: options.clientRequestId,
            attachmentIndex: options.attachmentIndex,
          }),
        }),
      );
      break;
    } catch (error) {
      if (options.signal?.aborted) throw requestAbortReason(options.signal);
      if (!retryableUploadTransportError(error)) throw error;
      if (attempt > 0) throw uploadReservationFailure(error);
      emitGeoUploadTelemetry("reservation_retry_scheduled", {
        attachmentIndex: options.attachmentIndex,
        declaredBytes: file.size,
        retryDelayMs: UPLOAD_INIT_RETRY_DELAY_MS,
        phase: "reserving",
        loadedBytes: 0,
        totalBytes: file.size,
        durationMs: 0,
        status: error instanceof GeoApiError ? error.status : undefined,
        code: error instanceof GeoApiError ? error.code : "NETWORK_ERROR",
      });
      await waitForGeoUploadDelay(UPLOAD_INIT_RETRY_DELAY_MS, options.signal);
    }
  }

  const uploadToken = textValue(initPayload?.uploadToken);
  const fileId = textValue(initPayload?.fileId);
  if (!uploadToken || !fileId) {
    throw new GeoApiError(
      "附件上传凭证无效，请重新选择文件。",
      502,
      "INVALID_UPLOAD_TICKET",
    );
  }
  const reservation: GeoUploadReservation = {
    id: fileId,
    name: textValue(initPayload?.filename) ?? file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
    uploadToken,
    sourceName: file.name,
    sourceLastModified: file.lastModified,
    traceId: textValue(initPayload?.traceId),
  };
  emitGeoUploadTelemetry("reservation_acquired", {
    attachmentIndex: options.attachmentIndex,
    declaredBytes: file.size,
    phase: "reserving",
    loadedBytes: 0,
    totalBytes: file.size,
    durationMs: 0,
    traceId: reservation.traceId,
  });
  return {
    reservation,
    replayed: initPayload?.replayed === true,
    status: textValue(initPayload?.status)?.toLowerCase(),
  };
}

async function readGeoUploadStatus(
  reservation: GeoUploadReservation,
  file: File,
  signal?: AbortSignal,
): Promise<GeoUploadStatusResponse> {
  const payload = asRecord(
    await requestJson("/uploads/status", {
      method: "GET",
      signal,
      headers: { "x-geo-upload-token": reservation.uploadToken },
    }),
  );
  const fileId = textValue(payload.fileId);
  const assetStatus = textValue(payload.assetStatus)?.toLowerCase();
  const transferState = textValue(payload.transferState)?.toLowerCase();
  const declaredBytes = numberValue(payload.declaredBytes);
  const receivedBytes = numberValue(payload.receivedBytes);
  if (
    fileId !== reservation.id ||
    !["pending", "uploaded"].includes(assetStatus ?? "") ||
    !["idle", "uploading"].includes(transferState ?? "") ||
    declaredBytes === undefined ||
    !Number.isInteger(declaredBytes) ||
    declaredBytes !== file.size ||
    receivedBytes === undefined ||
    !Number.isInteger(receivedBytes) ||
    receivedBytes < 0 ||
    receivedBytes > file.size
  ) {
    throw freshUploadResetRequired();
  }
  if (assetStatus === "uploaded" && receivedBytes !== file.size) {
    throw freshUploadResetRequired();
  }
  return {
    assetStatus: assetStatus as GeoUploadStatusResponse["assetStatus"],
    transferState: transferState as GeoUploadStatusResponse["transferState"],
    declaredBytes,
    receivedBytes,
    traceId: textValue(payload.traceId),
  };
}

async function reconcileGeoUpload(
  reservation: GeoUploadReservation,
  file: File,
  options: {
    attachmentIndex: number;
    signal?: AbortSignal;
    onProgress?: (
      progress: Pick<
        GeoUploadProgress,
        "phase" | "fileLoadedBytes" | "fileTotalBytes"
      >,
    ) => void;
  },
  settings: {
    statusOnly?: boolean;
    transferAttempt?: number;
  } = {},
): Promise<GeoUploadReconcileState> {
  const reconcileStartedAt = Date.now();
  const deadline = Date.now() + UPLOAD_SERVER_RESPONSE_TIMEOUT_MS;
  let statusErrorCount = 0;
  while (true) {
    let status: GeoUploadStatusResponse;
    try {
      status = await readGeoUploadStatus(reservation, file, options.signal);
    } catch (error) {
      if (options.signal?.aborted) throw requestAbortReason(options.signal);
      if (
        error instanceof GeoApiError &&
        (error.status === 404 ||
          error.status === 410 ||
          /(?:NOT_FOUND|DELETED|EXPIRED)/.test(error.code ?? ""))
      ) {
        throw freshUploadResetRequired(error);
      }
      if (retryableUploadTransportError(error) && Date.now() < deadline) {
        const retryDelayMs =
          UPLOAD_STATUS_RETRY_DELAYS_MS[
            Math.min(statusErrorCount, UPLOAD_STATUS_RETRY_DELAYS_MS.length - 1)
          ]!;
        statusErrorCount += 1;
        await waitForGeoUploadDelay(
          Math.min(retryDelayMs, deadline - Date.now()),
          options.signal,
        );
        continue;
      }
      if (!retryableUploadTransportError(error)) throw error;
      throw new GeoApiError(
        "上传结果暂时无法核对；文件和上传凭证已保留，请直接继续上传。",
        error instanceof GeoApiError ? error.status : 503,
        "UPLOAD_STATUS_UNKNOWN",
        {
          causeCode:
            error instanceof GeoApiError ? error.code : "NETWORK_ERROR",
        },
      );
    }
    statusErrorCount = 0;
    emitGeoUploadTelemetry("status_observed", {
      attachmentIndex: options.attachmentIndex,
      declaredBytes: file.size,
      transferState: status.transferState,
      receivedBytes: status.receivedBytes,
      transferAttempt: settings.transferAttempt,
      phase: "reconciling",
      loadedBytes: status.receivedBytes,
      totalBytes: file.size,
      durationMs: Date.now() - reconcileStartedAt,
      traceId: status.traceId ?? reservation.traceId,
    });
    if (status.assetStatus === "uploaded") return "uploaded";
    if (status.transferState === "idle" && !settings.statusOnly) {
      return "pending";
    }

    options.onProgress?.({
      phase: "reconciling",
      fileLoadedBytes: status.receivedBytes,
      fileTotalBytes: file.size,
    });
    if (Date.now() >= deadline) {
      throw new GeoApiError(
        settings.statusOnly
          ? "服务器已报告文件提交，但完整回执仍未可核验；文件和凭证已保留，请稍后继续核对。"
          : "服务器仍在接收当前文件；文件和上传凭证已保留，请稍后直接继续核对。",
        504,
        settings.statusOnly
          ? "UPLOAD_COMMITTED_STATUS_PENDING"
          : "UPLOAD_RECONCILE_TIMEOUT",
      );
    }
    await waitForGeoUploadDelay(
      Math.min(UPLOAD_STATUS_POLL_INTERVAL_MS, deadline - Date.now()),
      options.signal,
    );
  }
}

function reportGeoUploadConfirmed(
  file: File,
  reservation: GeoUploadReservation,
  options: {
    attachmentIndex: number;
    onProgress?: (
      progress: Pick<
        GeoUploadProgress,
        "phase" | "fileLoadedBytes" | "fileTotalBytes"
      >,
    ) => void;
  },
): void {
  options.onProgress?.({
    phase: "confirmed",
    fileLoadedBytes: file.size,
    fileTotalBytes: file.size,
  });
  emitGeoUploadTelemetry("transfer_confirmed", {
    attachmentIndex: options.attachmentIndex,
    declaredBytes: file.size,
    receivedBytes: file.size,
    phase: "confirmed",
    loadedBytes: file.size,
    totalBytes: file.size,
    durationMs: 0,
    traceId: reservation.traceId,
  });
}

async function transferGeoUploadOnce(
  file: File,
  uploadToken: string,
  transferAttempt: number,
  options: {
    attachmentIndex: number;
    signal?: AbortSignal;
    onProgress?: (
      progress: Pick<
        GeoUploadProgress,
        "phase" | "fileLoadedBytes" | "fileTotalBytes"
      >,
    ) => void;
  },
): Promise<void> {
  if (typeof XMLHttpRequest === "function") {
    return transferGeoUploadWithXhr(
      file,
      uploadToken,
      transferAttempt,
      options,
    );
  }
  // Node-side contract tests and non-browser renderers have no XHR. The
  // interactive Website always takes the XHR branch so byte progress and the
  // two idle watchdogs are active for customers.
  options.onProgress?.({
    phase: "uploading",
    fileLoadedBytes: 0,
    fileTotalBytes: file.size,
  });
  const startedAt = Date.now();
  try {
    await requestJson("/uploads/proxy", {
      method: "PUT",
      body: file,
      credentials: "same-origin",
      signal: options.signal,
      timeoutMs: UPLOAD_REQUEST_TIMEOUT_MS,
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-geo-upload-token": uploadToken,
        "x-geo-upload-attempt": String(transferAttempt),
      },
    });
    emitGeoUploadTelemetry("transfer_response_received", {
      attachmentIndex: options.attachmentIndex,
      declaredBytes: file.size,
      transferAttempt,
      phase: "confirmed",
      loadedBytes: file.size,
      totalBytes: file.size,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    emitGeoUploadTelemetry("transfer_failed", {
      attachmentIndex: options.attachmentIndex,
      declaredBytes: file.size,
      transferAttempt,
      phase: "uploading",
      loadedBytes: 0,
      totalBytes: file.size,
      durationMs: Date.now() - startedAt,
      abortSource: "fetch_error",
      status: error instanceof GeoApiError ? error.status : undefined,
      code: error instanceof GeoApiError ? error.code : "NETWORK_ERROR",
    });
    throw error;
  }
}

function transferGeoUploadWithXhr(
  file: File,
  uploadToken: string,
  transferAttempt: number,
  options: {
    attachmentIndex: number;
    signal?: AbortSignal;
    onProgress?: (
      progress: Pick<
        GeoUploadProgress,
        "phase" | "fileLoadedBytes" | "fileTotalBytes"
      >,
    ) => void;
  },
): Promise<void> {
  if (options.signal?.aborted) {
    return Promise.reject(requestAbortReason(options.signal));
  }

  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const startedAt = Date.now();
    const milestones = [25, 50, 75, 100] as const;
    let settled = false;
    let lastLoaded = 0;
    let reportedMilestones = 0;
    let watchdogError: GeoApiError | undefined;
    let stallTimer: ReturnType<typeof globalThis.setTimeout> | undefined;
    let responseTimer: ReturnType<typeof globalThis.setTimeout> | undefined;

    const clearTimers = () => {
      if (stallTimer !== undefined) globalThis.clearTimeout(stallTimer);
      if (responseTimer !== undefined) globalThis.clearTimeout(responseTimer);
      stallTimer = undefined;
      responseTimer = undefined;
    };
    const cleanup = () => {
      clearTimers();
      options.signal?.removeEventListener("abort", abortFromCaller);
    };
    const finish = (operation: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      operation();
    };
    const failWith = (error: unknown) => finish(() => reject(error));
    const emitTransferTelemetry = (
      event: string,
      detail: Omit<
        GeoUploadTelemetryDetail,
        "attachmentIndex" | "declaredBytes" | "transferAttempt" | "durationMs"
      >,
    ) => {
      emitGeoUploadTelemetry(event, {
        attachmentIndex: options.attachmentIndex,
        declaredBytes: file.size,
        transferAttempt,
        durationMs: Date.now() - startedAt,
        ...detail,
      });
    };
    const reportTransferMilestones = (loaded: number) => {
      const percentage =
        file.size === 0 ? 100 : Math.floor((loaded / file.size) * 100);
      while (
        reportedMilestones < milestones.length &&
        percentage >= milestones[reportedMilestones]!
      ) {
        const milestone = milestones[reportedMilestones]!;
        reportedMilestones += 1;
        emitTransferTelemetry("transfer_progress", {
          phase: "uploading",
          loadedBytes: loaded,
          totalBytes: file.size,
          milestone,
        });
      }
    };
    const armStallWatchdog = () => {
      if (stallTimer !== undefined) globalThis.clearTimeout(stallTimer);
      stallTimer = globalThis.setTimeout(() => {
        watchdogError = new GeoApiError(
          "文件上传超过 2 分钟没有字节增长，请检查网络后重试。",
          408,
          "UPLOAD_BROWSER_STALLED",
        );
        xhr.abort();
      }, UPLOAD_BROWSER_STALL_TIMEOUT_MS);
    };
    const beginAwaitingDashboard = () => {
      if (stallTimer !== undefined) globalThis.clearTimeout(stallTimer);
      stallTimer = undefined;
      options.onProgress?.({
        phase: "awaiting_dashboard",
        fileLoadedBytes: file.size,
        fileTotalBytes: file.size,
      });
      lastLoaded = file.size;
      reportTransferMilestones(file.size);
      emitTransferTelemetry("transfer_body_sent", {
        phase: "awaiting_dashboard",
        loadedBytes: file.size,
        totalBytes: file.size,
      });
      if (responseTimer !== undefined) globalThis.clearTimeout(responseTimer);
      responseTimer = globalThis.setTimeout(() => {
        watchdogError = new GeoApiError(
          "文件已传完，但 Dashboard 超过 6 分钟未确认，请稍后重试。",
          504,
          "UPLOAD_SERVER_RESPONSE_TIMEOUT",
        );
        xhr.abort();
      }, UPLOAD_SERVER_RESPONSE_TIMEOUT_MS);
    };
    const abortFromCaller = () => xhr.abort();

    xhr.open("PUT", `${GEO_API_ROOT}/uploads/proxy`, true);
    xhr.withCredentials = true;
    xhr.setRequestHeader(
      "content-type",
      file.type || "application/octet-stream",
    );
    xhr.setRequestHeader("x-geo-upload-token", uploadToken);
    xhr.setRequestHeader("x-geo-upload-attempt", String(transferAttempt));
    xhr.upload.addEventListener("progress", (event) => {
      const loaded = Math.max(
        lastLoaded,
        Math.min(file.size, Number.isFinite(event.loaded) ? event.loaded : 0),
      );
      if (loaded > lastLoaded) {
        lastLoaded = loaded;
        armStallWatchdog();
      }
      reportTransferMilestones(loaded);
      options.onProgress?.({
        phase: "uploading",
        fileLoadedBytes: loaded,
        fileTotalBytes: file.size,
      });
    });
    xhr.upload.addEventListener("load", beginAwaitingDashboard, {
      once: true,
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        emitTransferTelemetry("transfer_response_received", {
          phase: "confirmed",
          loadedBytes: file.size,
          totalBytes: file.size,
          status: xhr.status,
        });
        finish(resolve);
        return;
      }
      let body: JsonRecord = {};
      try {
        body = asRecord(JSON.parse(xhr.responseText));
      } catch {
        // Non-JSON proxy errors are intentionally collapsed below.
      }
      const error = asRecord(body.error);
      const uploadError = new GeoApiError(
        localizedUserFacingError(
          boundedApiMessage(error.message, body.message),
          xhr.status,
          "文件上传未完成，请稍后重试。",
        ),
        xhr.status || 502,
        xhr.status === 400 && xhr.responseText.trim() === ""
          ? "UPLOAD_EMPTY_PROXY_RESPONSE"
          : textValue(error.code, body.code) || "UPLOAD_PROXY_ERROR",
        body,
      );
      emitTransferTelemetry("transfer_failed", {
        phase: "awaiting_dashboard",
        loadedBytes: lastLoaded,
        totalBytes: file.size,
        abortSource: "http_response",
        status: uploadError.status,
        code: uploadError.code,
      });
      failWith(uploadError);
    });
    xhr.addEventListener("error", () => {
      emitTransferTelemetry("transfer_failed", {
        phase: "uploading",
        loadedBytes: lastLoaded,
        totalBytes: file.size,
        abortSource: "xhr_error",
        code: "UPLOAD_NETWORK_ERROR",
      });
      failWith(
        new GeoApiError(
          "文件上传连接中断，请检查网络后重试。",
          503,
          "UPLOAD_NETWORK_ERROR",
        ),
      );
    });
    xhr.addEventListener("abort", () => {
      if (options.signal?.aborted) {
        emitTransferTelemetry("transfer_aborted", {
          phase: "uploading",
          loadedBytes: lastLoaded,
          totalBytes: file.size,
          abortSource: "caller_abort",
        });
        failWith(requestAbortReason(options.signal));
        return;
      }
      const abortSource =
        watchdogError?.code === "UPLOAD_BROWSER_STALLED"
          ? "stall_watchdog"
          : watchdogError?.code === "UPLOAD_SERVER_RESPONSE_TIMEOUT"
            ? "response_watchdog"
            : "xhr_abort";
      emitTransferTelemetry("transfer_aborted", {
        phase:
          watchdogError?.code === "UPLOAD_SERVER_RESPONSE_TIMEOUT"
            ? "awaiting_dashboard"
            : "uploading",
        loadedBytes: lastLoaded,
        totalBytes: file.size,
        abortSource,
        status: watchdogError?.status,
        code: watchdogError?.code ?? "UPLOAD_CANCELLED",
      });
      failWith(
        watchdogError ??
          new GeoApiError("文件上传已取消。", 499, "UPLOAD_CANCELLED"),
      );
    });
    options.signal?.addEventListener("abort", abortFromCaller, { once: true });
    options.onProgress?.({
      phase: "uploading",
      fileLoadedBytes: 0,
      fileTotalBytes: file.size,
    });
    armStallWatchdog();
    try {
      xhr.send(file);
    } catch (error) {
      emitTransferTelemetry("transfer_failed", {
        phase: "uploading",
        loadedBytes: lastLoaded,
        totalBytes: file.size,
        abortSource: "xhr_send_error",
        code: "XHR_SEND_ERROR",
      });
      failWith(error);
    }
  });
}

function validateUploadCheckpoint(
  files: File[],
  uploadedFiles: GeoUploadedFile[],
  uploadReservations: GeoUploadReservation[],
): void {
  if (
    uploadedFiles.length > files.length ||
    uploadReservations.length > files.length
  ) {
    throw new GeoApiError(
      "附件上传进度与当前文件不一致，请重新选择文件。",
      400,
      "INVALID_UPLOAD_CHECKPOINT",
    );
  }
  uploadedFiles.forEach((uploaded, index) => {
    const file = files[index];
    const expectedType = file?.type || "application/octet-stream";
    if (
      !file ||
      !uploaded.id ||
      !uploaded.uploadToken ||
      uploaded.sourceName !== file.name ||
      uploaded.sourceLastModified !== file.lastModified ||
      uploaded.size !== file.size ||
      uploaded.type !== expectedType
    ) {
      throw new GeoApiError(
        "附件上传进度与当前文件不一致，请重新选择文件。",
        400,
        "INVALID_UPLOAD_CHECKPOINT",
      );
    }
  });
  uploadReservations.forEach((reservation, index) => {
    const file = files[index];
    if (!file) {
      throw new GeoApiError(
        "附件上传凭证与当前文件不一致，请重新选择文件。",
        400,
        "INVALID_UPLOAD_CHECKPOINT",
      );
    }
    validateUploadReservation(file, reservation);
    const uploaded = uploadedFiles[index];
    if (
      uploaded &&
      (uploaded.id !== reservation.id ||
        uploaded.uploadToken !== reservation.uploadToken)
    ) {
      throw new GeoApiError(
        "附件上传进度与当前文件不一致，请重新选择文件。",
        400,
        "INVALID_UPLOAD_CHECKPOINT",
      );
    }
  });
}

export async function createGeoProject(
  input: string,
  files: File[],
  options: {
    inviteContextToken: string;
    requestId?: string;
    uploadedFiles?: GeoUploadedFile[];
    uploadReservations?: GeoUploadReservation[];
    onUploadsReady?: (files: GeoUploadedFile[]) => void;
    onUploadReservationsReady?: (reservations: GeoUploadReservation[]) => void;
    onUploadProgress?: (progress: GeoUploadProgress) => void;
    signal?: AbortSignal;
  },
): Promise<GeoProject> {
  const clientRequestId = options.requestId ?? crypto.randomUUID();
  const uploadedFiles: GeoUploadedFile[] = options.uploadedFiles
    ? [...options.uploadedFiles]
    : [];
  const uploadReservations: GeoUploadReservation[] = options.uploadReservations
    ? [...options.uploadReservations]
    : [];
  uploadedFiles.forEach((uploaded, index) => {
    uploadReservations[index] ??= uploaded;
  });
  validateUploadCheckpoint(files, uploadedFiles, uploadReservations);
  const batchTotalBytes = files.reduce((total, file) => total + file.size, 0);
  let confirmedBytes = uploadedFiles.reduce(
    (total, file) => total + file.size,
    0,
  );
  for (
    let attachmentIndex = uploadedFiles.length;
    attachmentIndex < files.length;
    attachmentIndex += 1
  ) {
    const file = files[attachmentIndex]!;
    uploadedFiles.push(
      await uploadGeoFile(file, {
        inviteContextToken: options.inviteContextToken,
        clientRequestId,
        attachmentIndex,
        reservation: uploadReservations[attachmentIndex],
        signal: options.signal,
        onReserved: (reservation) => {
          uploadReservations[attachmentIndex] = reservation;
          options.onUploadReservationsReady?.([...uploadReservations]);
        },
        onProgress: (progress) => {
          const boundedLoaded = Math.max(
            0,
            Math.min(file.size, progress.fileLoadedBytes),
          );
          options.onUploadProgress?.({
            ...progress,
            fileIndex: attachmentIndex + 1,
            fileCount: files.length,
            filename: file.name,
            fileLoadedBytes: boundedLoaded,
            fileTotalBytes: file.size,
            batchLoadedBytes: Math.min(
              batchTotalBytes,
              confirmedBytes + boundedLoaded,
            ),
            batchTotalBytes,
            confirmedFiles:
              progress.phase === "confirmed"
                ? attachmentIndex + 1
                : uploadedFiles.length,
          });
        },
      }),
    );
    confirmedBytes += file.size;
    options.onUploadsReady?.([...uploadedFiles]);
  }

  const projectRequestBody = JSON.stringify({
    inviteContextToken: options.inviteContextToken,
    input: input.trim(),
    clientRequestId,
    attachments: uploadedFiles.map((file) => ({
      fileId: file.id,
      filename: file.name,
      uploadToken: file.uploadToken,
    })),
  });
  let payload: unknown;
  try {
    payload = await withRequestControl(
      {
        signal: options.signal,
        timeoutMs: GEO_PROJECT_CREATE_TIMEOUT_MS,
      },
      async (sharedSignal) => {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            return await requestJson("/projects", {
              method: "POST",
              signal: sharedSignal,
              timeoutMs: GEO_PROJECT_CREATE_TIMEOUT_MS,
              body: projectRequestBody,
            });
          } catch (error) {
            if (
              attempt === 0 &&
              !sharedSignal.aborted &&
              retryableProjectStartConfirmation(error)
            ) {
              continue;
            }
            throw error;
          }
        }
        throw new Error("unreachable project creation retry state");
      },
    );
  } catch (error) {
    if (!options.signal?.aborted && retryableProjectStartConfirmation(error)) {
      throw projectStartConfirmationUnknown(error);
    }
    throw error;
  }

  return normalizeRequiredProjectResponse(payload, {
    input: input.trim(),
    title: input.trim() || files[0]?.name || "企业知识库",
    files: uploadedFiles.map(
      ({
        uploadToken: _uploadToken,
        sourceName: _sourceName,
        sourceLastModified: _sourceLastModified,
        traceId: _traceId,
        requiresStatusOnly: _requiresStatusOnly,
        ...file
      }) => file,
    ),
  });
}

export async function getGeoProject(
  project: Pick<GeoProject, "id" | "remoteToken"> & Partial<GeoProject>,
): Promise<GeoProject> {
  const payload = await requestJson(
    `/projects/${encodeURIComponent(project.remoteToken)}`,
  );
  return normalizeRequiredProjectResponse(payload, project);
}

export async function startGeoQuestionRecommendation(
  project: GeoProject,
): Promise<GeoProject> {
  const payload = await requestJson(
    `/projects/${encodeURIComponent(project.remoteToken)}/questions`,
    { method: "POST" },
  );
  return normalizeRequiredProjectResponse(payload, project);
}

function waitForGeoPollingDelay(delayMs: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException("请求已取消。", "AbortError"));
      return;
    }
    const handleAbort = () => {
      globalThis.clearTimeout(timer);
      reject(signal?.reason ?? new DOMException("请求已取消。", "AbortError"));
    };
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

export async function createGeoPaymentCheckout(
  project: GeoProject,
  input: {
    questionId: string;
    platformIds: GeoPlatformId[];
    monitoringEdition: GeoMonitoringEdition;
    method: GeoPaymentMethod;
  },
): Promise<GeoPaymentCheckout> {
  const payload = await requestJson(
    `/projects/${encodeURIComponent(project.remoteToken)}/payments`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return normalizePaymentCheckout(payload);
}

export async function getGeoPaymentStatus(
  project: GeoProject,
  input: {
    questionId: string;
    platformIds: GeoPlatformId[];
    monitoringEdition: GeoMonitoringEdition;
    authorization: string;
  },
): Promise<GeoPaymentStatus> {
  const payload = await requestJson(
    `/projects/${encodeURIComponent(project.remoteToken)}/payments/status`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return normalizePaymentStatus(payload);
}

export async function switchGeoPaymentCheckout(
  project: GeoProject,
  input: {
    questionId: string;
    platformIds: GeoPlatformId[];
    monitoringEdition: GeoMonitoringEdition;
    authorization: string;
    method: GeoPaymentMethod;
  },
): Promise<GeoPaymentCheckout> {
  const payload = await requestJson(
    `/projects/${encodeURIComponent(project.remoteToken)}/payments/switch`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return normalizePaymentCheckout(payload);
}

export async function createGeoServicePaymentCheckout(
  project: GeoProject,
  method: GeoPaymentMethod,
): Promise<GeoServicePaymentCheckout> {
  const payload = await requestJson(
    `/projects/${encodeURIComponent(project.remoteToken)}/services/payments`,
    {
      method: "POST",
      body: JSON.stringify({ method }),
    },
  );
  return normalizeServicePaymentCheckout(payload);
}

export async function switchGeoServicePaymentCheckout(
  project: GeoProject,
  input: {
    authorization: string;
    method: GeoPaymentMethod;
  },
): Promise<GeoServicePaymentCheckout> {
  const payload = await requestJson(
    `/projects/${encodeURIComponent(project.remoteToken)}/services/payments/switch`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return normalizeServicePaymentCheckout(payload);
}

export async function confirmGeoServiceBankTransfer(
  project: GeoProject,
  input: {
    confirmationCode: string;
    authorization?: string;
    purchaseIntent?: string;
  },
): Promise<GeoProject> {
  const payload = await requestJson(
    `/projects/${encodeURIComponent(project.remoteToken)}/services/payments/bank-transfer/confirm`,
    {
      method: "POST",
      body: JSON.stringify({
        confirmationCode: input.confirmationCode,
        ...(input.authorization ? { authorization: input.authorization } : {}),
        ...(input.purchaseIntent
          ? { purchaseIntent: input.purchaseIntent }
          : {}),
      }),
    },
  );
  return normalizeRequiredProjectResponse(payload, project);
}

export async function submitGeoServiceContractProfile(
  project: GeoProject,
  profile: GeoServiceContractProfile,
  contractCode: string,
): Promise<GeoProject> {
  const payload = await requestJson(
    `/projects/${encodeURIComponent(project.remoteToken)}/services/contracts`,
    {
      method: "POST",
      body: JSON.stringify({ profile, contractCode }),
    },
  );
  return normalizeRequiredProjectResponse(payload, project);
}

export async function getGeoServiceContractStatus(
  project: GeoProject,
): Promise<GeoProject> {
  const payload = await requestJson(
    `/projects/${encodeURIComponent(project.remoteToken)}/services/contracts/status`,
    { method: "POST", body: JSON.stringify({}) },
  );
  return normalizeRequiredProjectResponse(payload, project);
}

export async function getGeoServicePaymentStatus(
  project: GeoProject,
  authorization: string,
): Promise<GeoPaymentStatus> {
  const payload = await requestJson(
    `/projects/${encodeURIComponent(project.remoteToken)}/services/payments/status`,
    {
      method: "POST",
      body: JSON.stringify({ authorization }),
    },
  );
  return normalizePaymentStatus(payload);
}

export async function startGeoService(
  project: GeoProject,
  authorization: string,
  purchaseIntent?: string,
): Promise<GeoProject> {
  const payload = await requestJson(
    `/projects/${encodeURIComponent(project.remoteToken)}/services/start`,
    {
      method: "POST",
      body: JSON.stringify({
        authorization,
        schemaVersion: 2,
        ...(purchaseIntent ? { purchaseIntent } : {}),
      }),
    },
  );
  return normalizeRequiredProjectResponse(payload, project);
}

export async function createGeoServiceAccount(
  project: GeoProject,
  input:
    | {
        displayName: string;
        username: string;
        password: string;
      }
    | {
        schemaVersion: 2;
        account:
          | {
              mode: "create";
              displayName: string;
              username: string;
            }
          | {
              mode: "bind_existing";
              purchaseIntent: string;
            };
      },
): Promise<GeoProject> {
  const payload = await requestJson(
    `/projects/${encodeURIComponent(project.remoteToken)}/services/account`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
  return normalizeRequiredProjectResponse(payload, project);
}

export async function getGeoServiceProvisioningStatus(
  project: GeoProject,
): Promise<GeoProject> {
  const payload = await requestJson(
    `/projects/${encodeURIComponent(project.remoteToken)}/services/account/status`,
    { method: "POST", body: JSON.stringify({}) },
  );
  return normalizeRequiredProjectResponse(payload, project);
}

export async function getGeoMonitoringRegions(
  project: GeoProject,
  edition: GeoMonitoringEdition,
): Promise<GeoMonitoringRegionCatalog> {
  const payload = await requestJson(
    `/projects/${encodeURIComponent(project.remoteToken)}/monitoring/regions?edition=${encodeURIComponent(edition)}`,
    { method: "GET", timeoutMs: 15_000 },
  );
  const root = asRecord(payload);
  const catalog = asRecord(root.catalog ?? root.data ?? payload);
  const returnedEdition = textValue(catalog.edition, catalog.scope);
  if (returnedEdition !== edition) {
    throw new GeoApiError(
      "监控地区列表与当前版本不匹配。",
      502,
      "REGION_SCOPE_MISMATCH",
    );
  }
  const seen = new Set<string>();
  const regions = asArray(catalog.regions ?? catalog.items).flatMap((item) => {
    const record = asRecord(item);
    const code = textValue(record.code, record.regionCode, record.region_code);
    const label = textValue(record.label, record.name, record.province);
    if (
      !code ||
      !label ||
      code.length > 64 ||
      label.length > 100 ||
      seen.has(code)
    ) {
      return [];
    }
    seen.add(code);
    return [{ code, label }];
  });
  return { edition, regions: regions.slice(0, 100) };
}

export async function startGeoMonitoring(
  project: GeoProject,
  input: {
    clientRequestId: string;
    questionId: string;
    industryRankingQuestionId?: string;
    platformIds: GeoPlatformId[];
    monitoringEdition: GeoMonitoringEdition;
    regionCode?: string;
    screenshotEnabled?: boolean;
    legacyPaymentAuthorization?: string;
    onProcessing?: (project: GeoProject) => void;
  },
): Promise<GeoProject> {
  let projectToken = project.remoteToken;
  let recoveryProject = project;
  const body = JSON.stringify({
    schemaVersion: 2,
    clientRequestId: input.clientRequestId,
    questionId: input.questionId,
    ...(input.industryRankingQuestionId
      ? { industryRankingQuestionId: input.industryRankingQuestionId }
      : {}),
    platformIds: input.platformIds,
    monitoringEdition: input.monitoringEdition,
    ...(input.regionCode ? { regionCode: input.regionCode } : {}),
    ...(input.screenshotEnabled ? { screenshotEnabled: true } : {}),
    ...(input.legacyPaymentAuthorization
      ? { legacyPaymentAuthorization: input.legacyPaymentAuthorization }
      : {}),
  });
  const deadline = Date.now() + 5 * 60_000;
  while (true) {
    const payload = await requestJson(
      `/projects/${encodeURIComponent(projectToken)}/monitoring`,
      {
        method: "POST",
        timeoutMs: GEO_MONITOR_START_TIMEOUT_MS,
        body,
      },
    );
    const record = asRecord(payload);
    if (textValue(record.state) !== "processing") {
      return normalizeRequiredProjectResponse(payload, recoveryProject);
    }
    const recoveryProjectToken = textValue(record.projectToken);
    if (recoveryProjectToken && recoveryProjectToken !== projectToken) {
      projectToken = recoveryProjectToken;
      recoveryProject = {
        ...recoveryProject,
        remoteToken: projectToken,
        monitoringRecovery: {
          schemaVersion: 2,
          clientRequestId: input.clientRequestId,
          questionId: input.questionId,
          ...(input.industryRankingQuestionId
            ? { industryRankingQuestionId: input.industryRankingQuestionId }
            : {}),
          monitoringEdition: input.monitoringEdition,
          ...(input.regionCode ? { regionCode: input.regionCode } : {}),
          ...(input.screenshotEnabled ? { screenshotEnabled: true } : {}),
          platformIds: [...input.platformIds],
        },
      };
      input.onProcessing?.(recoveryProject);
    }
    const retryAfterMs = Math.min(
      10_000,
      Math.max(500, numberValue(record.retryAfterMs) ?? 3_000),
    );
    if (Date.now() + retryAfterMs > deadline) {
      throw new GeoApiError(
        "海外问题仍在准备中，请稍后使用同一范围重试。",
        202,
        "QUESTION_TRANSLATION_PENDING",
      );
    }
    await waitForGeoPollingDelay(retryAfterMs);
  }
}

export async function startGeoCurrentAssessment(
  project: GeoProject,
): Promise<GeoProject> {
  const payload = await requestJson(
    `/projects/${encodeURIComponent(project.remoteToken)}/assessment`,
    { method: "POST" },
  );
  return normalizeRequiredProjectResponse(payload, project);
}

export async function startGeoOptimizationForecast(
  project: GeoProject,
): Promise<GeoProject> {
  const payload = await requestJson(
    `/projects/${encodeURIComponent(project.remoteToken)}/optimization-forecast`,
    { method: "POST" },
  );
  return normalizeRequiredProjectResponse(payload, project);
}

function usesHistoricalPrimaryIndustryRankingChain(project: GeoProject) {
  if (
    project.selectedIndustryRankingQuestionId ||
    project.industryRankingMonitoring?.runId
  ) {
    return false;
  }
  return project.questions.some(
    (question) =>
      question.id === project.selectedQuestionId &&
      question.category === "industry_ranking",
  );
}

export async function retryIndustryRankingAssessment(
  project: GeoProject,
): Promise<GeoProject> {
  const path = usesHistoricalPrimaryIndustryRankingChain(project)
    ? "assessment"
    : "industry-ranking/assessment";
  const payload = await requestJson(
    `/projects/${encodeURIComponent(project.remoteToken)}/${path}`,
    { method: "POST" },
  );
  return normalizeRequiredProjectResponse(payload, project);
}

export async function startIndustryRankingOptimizationForecast(
  project: GeoProject,
): Promise<GeoProject> {
  const path = usesHistoricalPrimaryIndustryRankingChain(project)
    ? "optimization-forecast"
    : "industry-ranking/optimization-forecast";
  const payload = await requestJson(
    `/projects/${encodeURIComponent(project.remoteToken)}/${path}`,
    { method: "POST" },
  );
  return normalizeRequiredProjectResponse(payload, project);
}

export async function downloadGeoArchive(
  project: GeoProject,
  options: { signal?: AbortSignal } = {},
): Promise<{ blob: Blob; filename: string }> {
  return withRequestControl(
    {
      signal: options.signal,
      timeoutMs: UPLOAD_REQUEST_TIMEOUT_MS,
    },
    async (signal) => {
      const response = await fetch(
        `${GEO_API_ROOT}/projects/${encodeURIComponent(project.remoteToken)}/archive`,
        {
          credentials: "same-origin",
          cache: "no-store",
          signal,
        },
      );
      if (!response.ok) await parseResponse(response);
      const declaredLength = Number(
        response.headers.get("content-length") || 0,
      );
      if (
        declaredLength &&
        (!Number.isSafeInteger(declaredLength) ||
          declaredLength > 100 * 1024 * 1024)
      ) {
        await response.body?.cancel().catch(() => undefined);
        throw new GeoApiError(
          "知识库 ZIP 超过 100 MB 安全上限。",
          413,
          "ARCHIVE_TOO_LARGE",
        );
      }
      const disposition = response.headers.get("content-disposition") ?? "";
      const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const plainName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
      const blob = await response.blob();
      if (blob.size > 100 * 1024 * 1024) {
        throw new GeoApiError(
          "知识库 ZIP 超过 100 MB 安全上限。",
          413,
          "ARCHIVE_TOO_LARGE",
        );
      }
      return {
        blob,
        filename: encodedName
          ? decodeURIComponent(encodedName)
          : (plainName ??
            project.knowledgeBase?.archiveName ??
            `${project.title}-知识库.zip`),
      };
    },
  );
}

export async function deleteGeoProject(project: GeoProject): Promise<void> {
  const payload = asRecord(
    await requestJson(`/projects/${encodeURIComponent(project.remoteToken)}`, {
      method: "DELETE",
    }),
  );
  if (
    payload.ok !== true ||
    payload.retention !== "provider_records_retained"
  ) {
    throw new GeoApiError(
      "项目本地移除确认响应无效，请稍后重试。",
      502,
      "PROJECT_DELETE_INVALID_RESPONSE",
    );
  }
}
