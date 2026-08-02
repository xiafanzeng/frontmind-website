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
  GeoMonitoringResult,
  GeoMonitoringStatus,
  GeoOptimizationForecastResult,
  GeoPlatformId,
  GeoProject,
  GeoProjectStatus,
  GeoQuestion,
  GeoQuestionCategory,
  GeoServiceActivation,
  GeoServiceCategory,
  GeoServiceContractProfile,
  GeoStage,
} from "./types";
import { localizedUserFacingError } from "./error-localization";

const GEO_API_ROOT = "/api/geo";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const UPLOAD_REQUEST_TIMEOUT_MS = 5 * 60_000;

type JsonRecord = Record<string, unknown>;
type TimedRequestInit = RequestInit & { timeoutMs?: number };
export type GeoUploadedFile = GeoFileReference & {
  uploadToken: string;
  sourceName: string;
  sourceLastModified: number;
};

export type GeoPaymentMethod = "alipay" | "wxpay";

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

const GEO_CUSTOM_QUESTION_PENDING_PREFIX =
  "frontmind-geo-custom-question-validation:";
const GEO_CUSTOM_QUESTION_CLIENT_REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[45][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isGeoCustomQuestionClientRequestId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    GEO_CUSTOM_QUESTION_CLIENT_REQUEST_ID_PATTERN.test(value)
  );
}

export type GeoPendingCustomQuestionValidation = {
  projectId: string;
  clientRequestId: string;
  question: string;
  updatedAt: string;
};

function pendingCustomQuestionStorageKey(projectId: string) {
  return `${GEO_CUSTOM_QUESTION_PENDING_PREFIX}${projectId}`;
}

export function readPendingGeoCustomQuestionValidation(
  projectId: string,
): GeoPendingCustomQuestionValidation | undefined {
  try {
    const raw = globalThis.localStorage?.getItem(
      pendingCustomQuestionStorageKey(projectId),
    );
    if (!raw) return undefined;
    const value = JSON.parse(
      raw,
    ) as Partial<GeoPendingCustomQuestionValidation>;
    if (
      value.projectId !== projectId ||
      !isGeoCustomQuestionClientRequestId(value.clientRequestId) ||
      typeof value.question !== "string" ||
      !value.question.trim()
    ) {
      return undefined;
    }
    return {
      projectId,
      clientRequestId: value.clientRequestId,
      question: value.question,
      updatedAt:
        typeof value.updatedAt === "string"
          ? value.updatedAt
          : new Date(0).toISOString(),
    };
  } catch {
    return undefined;
  }
}

function rememberPendingGeoCustomQuestionValidation(
  pending: GeoPendingCustomQuestionValidation,
) {
  try {
    globalThis.localStorage?.setItem(
      pendingCustomQuestionStorageKey(pending.projectId),
      JSON.stringify(pending),
    );
  } catch {
    // Server-side reservation remains authoritative when browser storage is unavailable.
  }
}

export function clearPendingGeoCustomQuestionValidation(
  projectId: string,
  clientRequestId?: string,
) {
  try {
    const existing = readPendingGeoCustomQuestionValidation(projectId);
    if (
      clientRequestId &&
      existing &&
      existing.clientRequestId !== clientRequestId
    ) {
      return;
    }
    globalThis.localStorage?.removeItem(
      pendingCustomQuestionStorageKey(projectId),
    );
  } catch {
    // Best effort only; the server still enforces idempotency.
  }
}

export function acknowledgeGeoCustomQuestionCommitted(
  projectId: string,
  clientRequestId: string,
) {
  clearPendingGeoCustomQuestionValidation(projectId, clientRequestId);
}

export function expiredGeoCustomQuestionValidation(error: unknown) {
  return (
    error instanceof GeoApiError &&
    error.status === 410 &&
    error.code === "CUSTOM_QUESTION_VALIDATION_EXPIRED"
  );
}

function releaseExpiredGeoCustomQuestionValidation(
  projectId: string,
  clientRequestId: string | undefined,
  error: unknown,
) {
  if (!clientRequestId || !expiredGeoCustomQuestionValidation(error)) {
    return false;
  }
  clearPendingGeoCustomQuestionValidation(projectId, clientRequestId);
  return true;
}

function releaseSupersededGeoCustomQuestionValidation(
  projectId: string,
  clientRequestId: string | undefined,
  error: unknown,
) {
  if (
    !clientRequestId ||
    !(error instanceof GeoApiError) ||
    error.status !== 409 ||
    error.code !== "CUSTOM_QUESTION_RESERVATION_SUPERSEDED"
  ) {
    return false;
  }
  const validation = asRecord(error.details?.validation);
  const authoritativeClientRequestId = textValue(validation.clientRequestId);
  if (
    authoritativeClientRequestId &&
    authoritativeClientRequestId !== clientRequestId
  ) {
    return false;
  }
  clearPendingGeoCustomQuestionValidation(projectId, clientRequestId);
  return true;
}

function releaseFinishedGeoCustomQuestionRecovery(
  projectId: string,
  clientRequestId: string | undefined,
  error: unknown,
) {
  return (
    releaseExpiredGeoCustomQuestionValidation(
      projectId,
      clientRequestId,
      error,
    ) ||
    releaseSupersededGeoCustomQuestionValidation(
      projectId,
      clientRequestId,
      error,
    )
  );
}

async function acknowledgeNonRetryableGeoCustomQuestionTerminal(
  project: Pick<GeoProject, "id" | "remoteToken">,
  error: unknown,
  options: { signal?: AbortSignal } = {},
) {
  const terminal = authoritativeGeoCustomQuestionValidationTerminal(error);
  if (
    !terminal ||
    terminal.retryable ||
    (error instanceof GeoApiError &&
      error.code === "CUSTOM_QUESTION_RESERVATION_SUPERSEDED")
  )
    return false;

  // A rejected/non-retryable decision has no project payload to persist. Once
  // that exact authoritative response reaches the browser, ACK it before
  // clearing the matching recovery UUID so it cannot block project deletion.
  // If the ACK response is lost, the UUID remains and exact GET recovery can
  // repeat the idempotent ACK. The compare-before-remove helper cannot clear a
  // newer operation written by another tab.
  await acknowledgeGeoCustomQuestionValidation(
    project,
    terminal.clientRequestId,
    options,
  );
  acknowledgeGeoCustomQuestionCommitted(project.id, terminal.clientRequestId);
  return true;
}

export async function acknowledgeGeoCustomQuestionValidation(
  project: Pick<GeoProject, "remoteToken">,
  clientRequestId: string,
  options: { signal?: AbortSignal } = {},
) {
  const payload = asRecord(
    await requestJson(
      `/projects/${encodeURIComponent(project.remoteToken)}/questions/custom/${encodeURIComponent(clientRequestId)}/ack`,
      { method: "POST", signal: options.signal },
    ),
  );
  const validation = asRecord(payload.validation);
  if (
    payload.ok !== true ||
    validation.acknowledged !== true ||
    textValue(validation.clientRequestId) !== clientRequestId
  ) {
    throw new GeoApiError(
      "问题验证确认响应无效，请刷新后重试。",
      502,
      "INVALID_CUSTOM_QUESTION_ACKNOWLEDGEMENT",
    );
  }
}

export type GeoCustomQuestionAcknowledgement = "required" | "not_required";

export async function persistGeoCustomQuestionResultAndAcknowledge(
  result: {
    project: GeoProject;
    clientRequestId: string;
    acknowledgement: GeoCustomQuestionAcknowledgement;
  },
  persist: (project: GeoProject) => Promise<unknown>,
  options: { signal?: AbortSignal } = {},
) {
  await persist(result.project);
  if (result.acknowledgement === "required") {
    await acknowledgeGeoCustomQuestionValidation(
      result.project,
      result.clientRequestId,
      options,
    );
  }
  acknowledgeGeoCustomQuestionCommitted(
    result.project.id,
    result.clientRequestId,
  );
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

function normalizeCategory(value: unknown): GeoQuestionCategory {
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
  return "competitor_comparison";
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
    const category = normalizeCategory(record.category ?? record.type);

    return [
      {
        id:
          textValue(record.id, record.questionId) ?? `${category}-${index + 1}`,
        category,
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
          category !== "industry_ranking" && record.selectable !== false,
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
    const overviewSummary = textValue(
      overviewRecord.summary,
      overviewRecord.description,
      record.summary,
      record.description,
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
          summary: textValue(leafRecord.summary, leafRecord.description),
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
  return title ? { title, url } : undefined;
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

  const legacyCitations = normalizeAnswerSources(
    record.citations ?? record.citationList ?? record.citation_list,
  );
  const legacyReferences = normalizeAnswerSources(
    record.references ?? record.referenceList ?? record.reference_list,
  );
  const sources = normalizeAnswerSources(
    record.sources ??
      record.sourceList ??
      record.source_list ?? [...legacyCitations, ...legacyReferences],
  );

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
  const answers = asArray(
    source.answers ?? source.records ?? asRecord(source.output).records,
  ).flatMap((answer, index) => {
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

  return {
    runId,
    status: normalizeMonitoringStatus(source.status ?? source.state),
    platforms,
    expectedRecords: Math.max(
      0,
      Math.round(
        numberValue(
          source.expectedRecords,
          source.expected_records,
          source.totalItems,
          source.total_items,
        ) ?? platforms.length * 5,
      ),
    ),
    completedRecords: Math.max(
      0,
      Math.round(
        numberValue(
          source.completedRecords,
          source.completed_records,
          source.completedItems,
          source.completed_items,
        ) ?? completedFromAnswers,
      ),
    ),
    failedRecords: Math.max(
      0,
      Math.round(
        numberValue(
          source.failedRecords,
          source.failed_records,
          source.failedItems,
          source.failed_items,
        ) ?? failedFromAnswers,
      ),
    ),
    nextPollAt: timestampValue(source.nextPollAt, source.next_poll_at),
    startedAt: timestampValue(
      source.startedAt,
      source.started_at,
      source.createdAt,
    ),
    completedAt: timestampValue(source.completedAt, source.completed_at),
    partialAccepted:
      source.partialAccepted === true || source.partial_accepted === true,
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

function normalizeAssessmentDimension(
  definition: (typeof ASSESSMENT_DIMENSIONS)[number],
  value: unknown,
): GeoAssessmentDimension | undefined {
  const record = asRecord(value);
  if (Object.keys(record).length === 0) return undefined;
  return {
    id: definition.id,
    label: textValue(record.label, record.name) ?? definition.label,
    score: Math.max(
      0,
      Math.min(
        definition.maxScore,
        numberValue(record.score, record.value) ?? 0,
      ),
    ),
    maxScore: Math.max(
      1,
      numberValue(record.maxScore, record.max_score) ?? definition.maxScore,
    ),
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
        brandMentionRate: nullableNumberValue(
          record.brandMentionRate ?? record.brand_mention_rate,
        ),
        averageRank: nullableNumberValue(
          record.averageRank ?? record.average_rank,
        ),
        factAccuracy: nullableNumberValue(
          record.factAccuracy ?? record.fact_accuracy,
        ),
        propositionHitRate: nullableNumberValue(
          record.propositionHitRate ?? record.proposition_hit_rate,
        ),
        sourceCount: Math.max(
          0,
          numberValue(
            record.sourceCount,
            record.source_count,
            (numberValue(record.citationCount, record.citation_count) || 0) +
              (numberValue(record.referenceCount, record.reference_count) || 0),
          ) ?? 0,
        ),
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
    const id = textValue(entry.id, entry.taskId, entry.task_id);
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
  const currentEntryId = entries.some(
    (entry) => entry.id === requestedCurrentEntryId,
  )
    ? requestedCurrentEntryId
    : entries.at(-1)?.id;

  return {
    currentEntryId,
    fetchedAt,
    updatedAt:
      textValue(source.updatedAt, source.updated_at, fetchedAt) ?? fetchedAt,
    entries,
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
): GeoProjectStatus {
  if (
    textValue(
      project.questionValidationError,
      project.question_validation_error,
    )
  )
    return "failed";
  const raw =
    textValue(
      project.status,
      questionTask.status,
      kbTask.status,
    )?.toLowerCase() ?? "queued";
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
    questions.length > 0 ||
    raw === "question_recommendation" ||
    raw === "questions"
  )
    return "question_recommendation";
  return "enterprise_analysis";
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
  const status = normalizeStatus(project, kbTask, questionTask, questions);
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
  const error = asRecord(project.error ?? taskForProgress.error);
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
      monitoring,
      assessment,
      optimizationForecast,
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
    knowledgeBaseSupportRequired: project.knowledgeBaseSupportRequired === true,
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
    assessmentUpdatingToVersion2:
      project.assessmentUpdatingToVersion2 === true ||
      project.assessment_updating_to_version_2 === true,
    optimizationForecastRetryAvailable:
      project.optimizationForecastRetryAvailable === true,
    files: hasOwnField(project, "attachments", "files")
      ? files
      : files.length > 0
        ? files
        : (fallback?.files ?? []),
    knowledgeBase,
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
    monitoring,
    assessment,
    optimizationForecast,
    serviceActivation,
    executionLog,
    error: localizedUserFacingError(
      textValue(
        validationError,
        error.message,
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

export async function verifyGeoInvitation(code: string): Promise<void> {
  const payload = asRecord(
    await requestJson("/invite/verify", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  );
  if (payload.ok !== true) {
    throw new GeoApiError(
      "邀请码验证响应无效，请稍后重试。",
      502,
      "INVALID_INVITE_RESPONSE",
    );
  }
}

export async function uploadGeoFile(
  file: File,
  options: { signal?: AbortSignal } = {},
): Promise<GeoUploadedFile> {
  const initPayload = asRecord(
    await requestJson("/uploads/init", {
      method: "POST",
      signal: options.signal,
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        sizeBytes: file.size,
      }),
    }),
  );
  const uploadToken = textValue(
    initPayload.uploadToken,
    initPayload.upload_token,
  );
  const directUploadUrl = textValue(
    initPayload.directUploadUrl,
    initPayload.direct_upload_url,
  );
  const fileId = textValue(initPayload.fileId, initPayload.file_id);
  if (!uploadToken || !fileId)
    throw new GeoApiError(
      "附件上传凭证无效，请重新选择文件。",
      502,
      "INVALID_UPLOAD_TICKET",
    );

  const uploadThroughWebsite = async () => {
    await requestJson("/uploads/proxy", {
      method: "PUT",
      body: file,
      credentials: "same-origin",
      signal: options.signal,
      timeoutMs: UPLOAD_REQUEST_TIMEOUT_MS,
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-geo-upload-token": uploadToken,
      },
    });
  };

  if (directUploadUrl) {
    try {
      await withRequestControl(
        {
          signal: options.signal,
          timeoutMs: UPLOAD_REQUEST_TIMEOUT_MS,
        },
        async (signal) => {
          const directResponse = await fetch(directUploadUrl, {
            method: "PUT",
            body: file,
            credentials: "omit",
            signal,
            headers: {
              "content-type": file.type || "application/octet-stream",
            },
          });
          if (!directResponse.ok) {
            await parseResponse(directResponse, {
              requireJsonOnSuccess: false,
            });
          }
        },
      );
    } catch (error) {
      if (
        options.signal?.aborted ||
        (error instanceof GeoApiError && error.code === "REQUEST_TIMEOUT")
      ) {
        throw options.signal?.aborted
          ? requestAbortReason(options.signal)
          : error;
      }
      // Presigned uploads can fail because of storage CORS or transient network errors.
      // Reusing the same ticket through our authenticated proxy is safe because PUT is idempotent.
      await uploadThroughWebsite();
    }
  } else {
    await uploadThroughWebsite();
  }

  return {
    id: fileId,
    name: textValue(initPayload.filename) ?? file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
    uploadToken,
    sourceName: file.name,
    sourceLastModified: file.lastModified,
  };
}

function validateUploadCheckpoint(
  files: File[],
  uploadedFiles: GeoUploadedFile[],
): void {
  if (uploadedFiles.length > files.length) {
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
}

export async function createGeoProject(
  input: string,
  files: File[],
  options: {
    requestId?: string;
    uploadedFiles?: GeoUploadedFile[];
    onUploadsReady?: (files: GeoUploadedFile[]) => void;
    signal?: AbortSignal;
  } = {},
): Promise<GeoProject> {
  const uploadedFiles: GeoUploadedFile[] = options.uploadedFiles
    ? [...options.uploadedFiles]
    : [];
  validateUploadCheckpoint(files, uploadedFiles);
  for (const file of files.slice(uploadedFiles.length)) {
    uploadedFiles.push(await uploadGeoFile(file, { signal: options.signal }));
    options.onUploadsReady?.([...uploadedFiles]);
  }

  const payload = await requestJson("/projects", {
    method: "POST",
    signal: options.signal,
    body: JSON.stringify({
      input: input.trim(),
      clientRequestId: options.requestId ?? crypto.randomUUID(),
      attachments: uploadedFiles.map((file) => ({
        fileId: file.id,
        filename: file.name,
        uploadToken: file.uploadToken,
      })),
    }),
  });

  return normalizeRequiredProjectResponse(payload, {
    input: input.trim(),
    title: input.trim() || files[0]?.name || "企业知识库",
    files: uploadedFiles.map(
      ({
        uploadToken: _uploadToken,
        sourceName: _sourceName,
        sourceLastModified: _sourceLastModified,
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

export async function createGeoCustomQuestion(
  project: GeoProject,
  questionText: string,
  options: {
    clientRequestId?: string;
    signal?: AbortSignal;
    pollIntervalMs?: number;
  } = {},
): Promise<{
  project: GeoProject;
  question: GeoQuestion;
  clientRequestId: string;
  acknowledgement: GeoCustomQuestionAcknowledgement;
}> {
  const question = questionText.trim();
  const remembered = readPendingGeoCustomQuestionValidation(project.id);
  const clientRequestId =
    options.clientRequestId ??
    (remembered?.question === question
      ? remembered.clientRequestId
      : crypto.randomUUID());
  rememberPendingGeoCustomQuestionValidation({
    projectId: project.id,
    clientRequestId,
    question,
    updatedAt: new Date().toISOString(),
  });

  const basePath = `/projects/${encodeURIComponent(project.remoteToken)}/questions/custom`;
  let payload: unknown;
  try {
    payload = await requestJson(basePath, {
      method: "POST",
      signal: options.signal,
      body: JSON.stringify({ question, clientRequestId }),
    });
    payload = await pollGeoCustomQuestionValidation(
      basePath,
      clientRequestId,
      payload,
      options,
    );
  } catch (error) {
    if (
      await acknowledgeNonRetryableGeoCustomQuestionTerminal(project, error, {
        signal: options.signal,
      })
    ) {
      throw error;
    }
    if (
      !releaseFinishedGeoCustomQuestionRecovery(
        project.id,
        clientRequestId,
        error,
      )
    ) {
      rememberAuthoritativeCustomQuestionConflict(project.id, error);
    }
    throw error;
  }
  return normalizeCompletedGeoCustomQuestion(
    project,
    question,
    clientRequestId,
    payload,
  );
}

export async function resumeGeoCustomQuestionValidation(
  project: GeoProject,
  options: {
    signal?: AbortSignal;
    pollIntervalMs?: number;
  } = {},
): Promise<
  | {
      project: GeoProject;
      question: GeoQuestion;
      clientRequestId: string;
      acknowledgement: GeoCustomQuestionAcknowledgement;
    }
  | undefined
> {
  const basePath = `/projects/${encodeURIComponent(project.remoteToken)}/questions/custom`;
  let pending = readPendingGeoCustomQuestionValidation(project.id);
  let payload: unknown;
  try {
    if (pending) {
      const pendingOperation = pending;
      try {
        payload = await requestJson(
          `${basePath}/${encodeURIComponent(pendingOperation.clientRequestId)}`,
          { signal: options.signal },
        );
      } catch (error) {
        if (
          !(error instanceof GeoApiError) ||
          error.code !== "CUSTOM_QUESTION_VALIDATION_NOT_FOUND" ||
          !project.questions.some(
            (candidate) =>
              candidate.selectable &&
              normalizeGeoQuestionIdentity(candidate.question) ===
                normalizeGeoQuestionIdentity(pendingOperation.question),
          )
        ) {
          throw error;
        }
        // A direct completion for an existing recommended question has no
        // reservation. If that response was lost, replay the exact operation
        // UUID and body instead of entering a GET/ACK 404 loop.
        payload = await requestJson(basePath, {
          method: "POST",
          signal: options.signal,
          body: JSON.stringify({
            question: pendingOperation.question,
            clientRequestId: pendingOperation.clientRequestId,
          }),
        });
      }
    } else {
      try {
        payload = await requestJson(`${basePath}/active`, {
          signal: options.signal,
        });
      } catch (error) {
        if (
          error instanceof GeoApiError &&
          error.code === "CUSTOM_QUESTION_VALIDATION_NOT_FOUND"
        ) {
          return undefined;
        }
        throw error;
      }
      const validation = asRecord(asRecord(payload).validation);
      const clientRequestId = textValue(validation.clientRequestId);
      const question = textValue(validation.question);
      if (!isGeoCustomQuestionClientRequestId(clientRequestId) || !question) {
        throw new GeoApiError(
          "待恢复的问题验证状态无效，请刷新后重试。",
          502,
          "INVALID_CUSTOM_QUESTION_RECOVERY",
        );
      }
      pending = {
        projectId: project.id,
        clientRequestId,
        question,
        updatedAt: new Date().toISOString(),
      };
      rememberPendingGeoCustomQuestionValidation(pending);
    }

    payload = await pollGeoCustomQuestionValidation(
      basePath,
      pending.clientRequestId,
      payload,
      options,
    );
    return normalizeCompletedGeoCustomQuestion(
      project,
      pending.question,
      pending.clientRequestId,
      payload,
    );
  } catch (error) {
    if (
      await acknowledgeNonRetryableGeoCustomQuestionTerminal(project, error, {
        signal: options.signal,
      })
    ) {
      throw error;
    }
    if (
      !releaseFinishedGeoCustomQuestionRecovery(
        project.id,
        pending?.clientRequestId,
        error,
      )
    ) {
      rememberAuthoritativeCustomQuestionConflict(project.id, error);
    }
    throw error;
  }
}

export type GeoRetryableCustomQuestionValidation = {
  clientRequestId: string;
  question: string;
};

export type GeoCustomQuestionValidationTerminal =
  GeoRetryableCustomQuestionValidation & { retryable: boolean };

export function authoritativeGeoCustomQuestionValidationTerminal(
  error: unknown,
): GeoCustomQuestionValidationTerminal | undefined {
  if (!(error instanceof GeoApiError)) return undefined;
  const validation = asRecord(error.details?.validation);
  const validationError = asRecord(validation.error);
  const state = textValue(validation.state);
  const clientRequestId = textValue(validation.clientRequestId);
  const question = textValue(validation.question);
  if (
    !["completed", "rejected", "failed"].includes(state || "") ||
    !isGeoCustomQuestionClientRequestId(clientRequestId) ||
    !question ||
    typeof validationError.retryable !== "boolean"
  ) {
    return undefined;
  }
  return {
    clientRequestId,
    question,
    retryable: validationError.retryable,
  };
}

export function retryableGeoCustomQuestionValidation(
  error: unknown,
): GeoRetryableCustomQuestionValidation | undefined {
  const terminal = authoritativeGeoCustomQuestionValidationTerminal(error);
  return terminal?.retryable
    ? {
        clientRequestId: terminal.clientRequestId,
        question: terminal.question,
      }
    : undefined;
}

export async function retryGeoCustomQuestionValidation(
  project: GeoProject,
  terminalError: unknown,
  options: { signal?: AbortSignal; pollIntervalMs?: number } = {},
) {
  const terminal = retryableGeoCustomQuestionValidation(terminalError);
  if (!terminal) {
    throw new GeoApiError(
      "只有已明确标记为可重试的终态验证才能重新发起。",
      409,
      "CUSTOM_QUESTION_VALIDATION_NOT_RETRYABLE",
    );
  }

  // ACK is deliberately completed before allocating a new operation UUID.
  // If the response is lost, the old UUID stays recoverable and no second
  // upstream task can be created accidentally.
  await acknowledgeGeoCustomQuestionValidation(
    project,
    terminal.clientRequestId,
    options,
  );
  clearPendingGeoCustomQuestionValidation(project.id, terminal.clientRequestId);
  return createGeoCustomQuestion(project, terminal.question, {
    ...options,
    clientRequestId: crypto.randomUUID(),
  });
}

async function pollGeoCustomQuestionValidation(
  basePath: string,
  clientRequestId: string,
  initialPayload: unknown,
  options: { signal?: AbortSignal; pollIntervalMs?: number },
) {
  let payload = initialPayload;
  while (isPendingCustomQuestionValidation(payload)) {
    const validation = asRecord(asRecord(payload).validation);
    const requestedDelay = numberValue(validation.nextPollMs);
    await waitForGeoCustomQuestionPoll(
      options.pollIntervalMs ??
        (requestedDelay && requestedDelay >= 200 && requestedDelay <= 10_000
          ? requestedDelay
          : 1_500),
      options.signal,
    );
    payload = await requestJson(
      `${basePath}/${encodeURIComponent(clientRequestId)}`,
      { signal: options.signal },
    );
  }
  return payload;
}

function normalizeCompletedGeoCustomQuestion(
  project: GeoProject,
  question: string,
  clientRequestId: string,
  payload: unknown,
): {
  project: GeoProject;
  question: GeoQuestion;
  clientRequestId: string;
  acknowledgement: GeoCustomQuestionAcknowledgement;
} {
  const root = asRecord(payload);
  const validation = asRecord(root.validation);
  const directQuestion = normalizeQuestions([root.question])[0];
  const updatedProject = normalizeRequiredProjectResponse(payload, project);
  const validatedQuestion =
    directQuestion ??
    updatedProject.questions.find(
      (candidate) =>
        normalizeGeoQuestionIdentity(candidate.question) ===
        normalizeGeoQuestionIdentity(question),
    );
  if (!validatedQuestion || !validatedQuestion.selectable) {
    throw new GeoApiError(
      "自定义问题未通过校验，请调整后重试。",
      502,
      "INVALID_CUSTOM_QUESTION",
    );
  }
  // Deliberately do not clear local recovery here. The caller must first
  // durably commit the project; only a reservation-backed result then needs
  // the server ACK before the matching local UUID may be removed.
  return {
    project: updatedProject,
    question: validatedQuestion,
    clientRequestId,
    acknowledgement:
      textValue(validation.state) === "completed" &&
      textValue(validation.clientRequestId) === clientRequestId &&
      textValue(validation.acknowledgement) === "not_required" &&
      textValue(validation.completionMode) === "existing_recommended_question"
        ? "not_required"
        : "required",
  };
}

function normalizeGeoQuestionIdentity(question: string) {
  return question
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "")
    .replace(/[\s?？]+/g, "");
}

function rememberAuthoritativeCustomQuestionConflict(
  projectId: string,
  error: unknown,
) {
  if (!(error instanceof GeoApiError)) return;
  const validation = asRecord(error.details?.validation);
  const terminalClientRequestId = textValue(validation.clientRequestId);
  const terminalQuestion = textValue(validation.question);
  if (
    ["completed", "rejected", "failed"].includes(
      textValue(validation.state) || "",
    ) &&
    isGeoCustomQuestionClientRequestId(terminalClientRequestId) &&
    terminalQuestion
  ) {
    rememberPendingGeoCustomQuestionValidation({
      projectId,
      clientRequestId: terminalClientRequestId,
      question: terminalQuestion,
      updatedAt: new Date().toISOString(),
    });
    return;
  }
  const active = asRecord(error.details?.activeOperation);
  const clientRequestId = textValue(active.clientRequestId);
  const question = textValue(active.question);
  if (
    error.code !== "CUSTOM_QUESTION_ACTIVE_RESERVATION_CONFLICT" ||
    !isGeoCustomQuestionClientRequestId(clientRequestId) ||
    !question
  ) {
    return;
  }
  rememberPendingGeoCustomQuestionValidation({
    projectId,
    clientRequestId,
    question,
    updatedAt: new Date().toISOString(),
  });
}

function isPendingCustomQuestionValidation(payload: unknown) {
  const state = textValue(asRecord(asRecord(payload).validation).state);
  return ["reserved", "prepared", "submitted"].includes(state || "");
}

function waitForGeoCustomQuestionPoll(delayMs: number, signal?: AbortSignal) {
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

export async function startGeoMonitoring(
  project: GeoProject,
  input: {
    questionId: string;
    platformIds: GeoPlatformId[];
    paymentAuthorization: string;
  },
): Promise<GeoProject> {
  const payload = await requestJson(
    `/projects/${encodeURIComponent(project.remoteToken)}/monitoring`,
    {
      method: "POST",
      body: JSON.stringify({
        questionId: input.questionId,
        platformIds: input.platformIds,
        paymentAuthorization: input.paymentAuthorization,
      }),
    },
  );
  return normalizeRequiredProjectResponse(payload, project);
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
  await requestJson(`/projects/${encodeURIComponent(project.remoteToken)}`, {
    method: "DELETE",
  });
}
