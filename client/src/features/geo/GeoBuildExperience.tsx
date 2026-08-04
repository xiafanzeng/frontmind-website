import {
  Archive,
  ArrowDownToLine,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  BookOpenText,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Cpu,
  CreditCard,
  Database,
  ExternalLink,
  FileText,
  FolderKanban,
  Globe2,
  Handshake,
  Image as ImageIcon,
  Layers3,
  Link2,
  ListTree,
  LoaderCircle,
  LockKeyhole,
  Maximize2,
  MessageSquareText,
  Minimize2,
  Minus,
  Paperclip,
  PackageOpen,
  Play,
  Plus,
  Quote,
  RadioTower,
  RotateCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  Users,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal, flushSync } from "react-dom";
import { useLang } from "@/contexts/LanguageContext";
import { FRONTMIND_WECHAT_QR_PATH } from "@/lib/frontmind-contact";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  authoritativeGeoCustomQuestionValidationTerminal,
  clearPendingGeoCustomQuestionValidation,
  createGeoServiceAccount,
  createGeoCustomQuestion,
  createGeoPaymentCheckout,
  createGeoProject,
  createGeoServicePaymentCheckout,
  deleteGeoProject as deleteRemoteGeoProject,
  downloadGeoArchive,
  expiredGeoCustomQuestionValidation,
  getGeoProject,
  getGeoPaymentStatus,
  getGeoServiceContractStatus,
  getGeoServicePaymentStatus,
  getGeoServiceProvisioningStatus,
  GeoApiError,
  persistGeoCustomQuestionResultAndAcknowledge,
  readPendingGeoCustomQuestionValidation,
  retryableGeoCustomQuestionValidation,
  retryGeoCustomQuestionValidation,
  resumeGeoCustomQuestionValidation,
  type GeoPaymentCheckout,
  type GeoPaymentMethod,
  type GeoServicePaymentCheckout,
  startGeoCurrentAssessment,
  startGeoMonitoring,
  startGeoOptimizationForecast,
  startGeoQuestionRecommendation,
  startGeoService,
  submitGeoServiceContractProfile,
  switchGeoPaymentCheckout,
  verifyGeoInvitation,
} from "./api";
import {
  createGeoDraftProject,
  isGeoDraftProject,
  type PendingGeoDraft,
} from "./draft";
import {
  GEO_STYLE_PREVIEW_ID,
  isGeoStylePreviewEnabled,
  isGeoStylePreviewProject,
} from "./preview-mode";
import { MonitoringMarkdown } from "./MonitoringMarkdown";
import { SafeMarkdown, safePublicMarkdownUrl } from "./SafeMarkdown";
import {
  canRunGeoAutoRefresh,
  geoAutoRefreshDelayLabel,
  geoAutoRefreshDelayMs,
  refreshGeoProjectOnce,
  shouldAutoRefreshGeoProject,
} from "./refresh";
import {
  canCommitGeoProjectObservation,
  getGeoArchive,
  listGeoProjects,
  removeGeoProject,
  requestPersistentGeoStorage,
  retryGeoArchivePersistence,
  saveGeoArchive,
  saveGeoProject,
  saveGeoProjectObservationIfCurrent,
} from "./storage";
import {
  geoLocalArchiveAssetRefreshKey,
  loadLocalGeoAssetBlobs,
} from "./local-archive-assets";
import {
  GEO_PLATFORMS,
  GEO_QUESTION_CATEGORIES,
  type GeoAnswerMedia,
  type GeoAssessmentDimension,
  type GeoAssessmentPlatformBreakdown,
  type GeoAssessmentResult,
  type GeoKnowledgeComparisonStatus,
  type GeoKnowledgeAsset,
  type GeoKnowledgeBase,
  type GeoKnowledgeSection,
  type GeoExecutionLogEntry,
  type GeoMonitoringAnswer,
  type GeoPlatformId,
  type GeoProject,
  type GeoQuestion,
  type GeoServiceCategory,
  type GeoServiceActivationStatus,
  type GeoServiceContractProfile,
  type GeoStage,
} from "./types";
import {
  type GeoWorkbenchGeometry,
  isGeoWorkbenchMoveKey,
  moveGeoWorkbenchGeometry,
} from "./workbench-geometry";
import { safePublicAppUrl } from "./safe-url";
import { GeoAgentUserDashboard } from "./GeoAgentUserDashboard";
import { localizedUserFacingError } from "./error-localization";
import { KnowledgeCompletenessDialog } from "./KnowledgeCompletenessDialog";
import {
  canRetryGeoServiceKnowledgeImport,
  geoServiceContractFlowIssue,
  GeoServiceOnboarding,
  type GeoServiceAccountCredentials,
} from "./GeoServiceOnboarding";
import "./geo-build.css";

const MAX_FILE_COUNT = 10;
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const GEO_PAYMENT_POLL_INTERVAL_MS = 5_000;
const GEO_PAYMENT_RECONCILIATION_POLL_INTERVAL_MS = 30_000;
const GEO_PAYMENT_AUTOMATIC_RECONCILIATION_MS = 30 * 60 * 1000;
const GEO_PENDING_PAYMENT_STORAGE_KEY = "frontmind.geo.pending-payment.v2";
const GEO_PAYMENT_RECONCILIATION_MESSAGE =
  "收银台展示时间已结束，正在核对最终支付结果；请勿重复支付或创建新订单。";

export function readGeoPurchaseIntentFromUrl(value: string) {
  const url = new URL(value);
  const hashQuery = url.hash.includes("?")
    ? new URLSearchParams(url.hash.slice(url.hash.indexOf("?") + 1))
    : new URLSearchParams();
  const token = (
    url.searchParams.get("purchaseIntent") ||
    url.searchParams.get("purchase_intent") ||
    hashQuery.get("purchaseIntent") ||
    hashQuery.get("purchase_intent") ||
    ""
  ).trim();
  return token.length >= 16 && token.length <= 4096 ? token : undefined;
}

export function clearGeoPurchaseIntentFromUrl(value: string) {
  const url = new URL(value);
  url.searchParams.delete("purchaseIntent");
  url.searchParams.delete("purchase_intent");
  const hash = url.hash.slice(1);
  const separator = hash.indexOf("?");
  if (separator >= 0) {
    const anchor = hash.slice(0, separator);
    const hashParams = new URLSearchParams(hash.slice(separator + 1));
    hashParams.delete("purchaseIntent");
    hashParams.delete("purchase_intent");
    const remaining = hashParams.toString();
    url.hash = `${anchor}${remaining ? `?${remaining}` : ""}`;
  }
  return url;
}

const STAGES: Array<{ id: GeoStage; title: string; subtitle: string }> = [
  { id: "enterprise_analysis", title: "企业分析", subtitle: "构建知识基建" },
  {
    id: "question_recommendation",
    title: "问题推荐",
    subtitle: "筛选优化问题",
  },
  { id: "monitoring", title: "问题监控", subtitle: "采集平台答案" },
  {
    id: "current_assessment",
    title: "现状评估",
    subtitle: "诊断现状与提升空间",
  },
  {
    id: "service_activation",
    title: "启动服务",
    subtitle: "开启一个月优化",
  },
];

type DragOperation = {
  mode: "move" | "resize";
  startX: number;
  startY: number;
  geometry: GeoWorkbenchGeometry;
};

type PendingGeoPayment =
  | {
      kind: "monitoring";
      projectId: string;
      projectToken?: string;
      questionId: string;
      platformIds: GeoPlatformId[];
      checkout: GeoPaymentCheckout;
      status:
        | "pending"
        | "paid"
        | "reconciliation_required"
        | "activation_support_required";
      statusMessage?: string;
      lastCheckedAt?: string;
    }
  | {
      kind: "service";
      projectId: string;
      projectToken?: string;
      questionId: string;
      category: GeoServiceCategory;
      checkout: GeoServicePaymentCheckout;
      status:
        | "pending"
        | "paid"
        | "reconciliation_required"
        | "activation_support_required";
      statusMessage?: string;
      lastCheckedAt?: string;
    };

type GeoPaymentPurpose = PendingGeoPayment["kind"];

export function isGeoProjectPaymentProtected(
  projectId: string,
  pendingPaymentProjectId?: string,
) {
  return Boolean(
    projectId &&
      pendingPaymentProjectId &&
      projectId === pendingPaymentProjectId,
  );
}

export function isGeoDeleteProtectionError(error: unknown) {
  return (
    error instanceof GeoApiError &&
    [
      "PROJECT_ORDER_DELETE_BLOCKED",
      "PROJECT_ORDER_REGISTRY_UNAVAILABLE",
    ].includes(error.code ?? "")
  );
}

export function geoPaymentRecoveryStatusForError(
  error: unknown,
  paymentConfirmed = false,
):
  | Extract<
      PendingGeoPayment["status"],
      "reconciliation_required" | "activation_support_required"
    >
  | undefined {
  if (!(error instanceof GeoApiError)) return undefined;
  const terminal =
    [400, 401, 402, 403, 409, 410].includes(error.status) ||
    error.code === "PAYMENT_QUERY_REJECTED";
  if (!terminal) return undefined;
  return paymentConfirmed
    ? "activation_support_required"
    : "reconciliation_required";
}

export function isGeoProjectFulfillmentProtected(
  project: Pick<GeoProject, "monitoring" | "serviceActivation">,
) {
  if (project.monitoring?.runId && project.monitoring.status !== "completed") {
    return true;
  }

  const service = project.serviceActivation;
  if (!service || service.status === "active") return false;
  const hasOrderOrFulfillment =
    Boolean(
      service.orderId ||
        service.paidAt ||
        service.manualOrderReference ||
        service.contractWorkflowReference ||
        service.provisioningReference,
    ) ||
    [
      "activation_pending",
      "account_setup_required",
      "provisioning",
      "failed",
    ].includes(service.status);
  return hasOrderOrFulfillment;
}

export function isGeoQuestionSelectionLocked(
  project: Pick<GeoProject, "id" | "preview" | "monitoring">,
  pendingPaymentProjectId?: string,
) {
  return (
    !project.preview &&
    (Boolean(project.monitoring?.runId) ||
      isGeoProjectPaymentProtected(project.id, pendingPaymentProjectId))
  );
}

function isGeoCheckoutExpired(
  checkout: Pick<GeoPaymentCheckout, "expiresAt">,
  nowMs = Date.now(),
) {
  const expiresAt = Date.parse(checkout.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= nowMs;
}

export function geoPaidStartNotice(
  project: GeoProject,
  purpose: GeoPaymentPurpose,
) {
  if (purpose === "service") {
    const activation = project.serviceActivation;
    if (!activation) {
      return "付款已确认，但后台未返回服务开通状态；请联系技术支持核对订单。";
    }
    if (activation.status === "account_setup_required") {
      return "付款已确认，请设置企业看板登录账号和密码。";
    }
    if (activation.status === "active") {
      return "付款已确认，服务已开通。";
    }
    if (
      activation.status === "activation_pending" ||
      activation.status === "provisioning"
    ) {
      return "付款已确认，服务正在开通；可在开通页查看最新状态。";
    }
    if (activation.status === "failed") {
      return canRetryGeoServiceKnowledgeImport(activation)
        ? "付款已确认，但知识库同步暂未完成；请在开通页重试同步。"
        : "付款已确认，但服务开通需要人工处理；请在开通页联系技术支持。";
    }
    return "付款已确认，但后台返回的服务开通状态需要核对；请联系技术支持。";
  }

  switch (project.monitoring?.status) {
    case "submitted":
    case "capturing":
      return "支付已确认，问题监控任务已启动。";
    case "completed":
      return "支付已确认，问题监控已完成，可查看真实采集结果。";
    case "partial_review":
      return "支付已确认，但监控采集不完整；请查看结果并联系技术支持。";
    case "failed":
      return "支付已确认，但监控任务未能完成；请联系技术支持。";
    default:
      return "支付已确认，但后台返回的监控状态需要核对；请联系技术支持。";
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function normalizeStoredPendingGeoPayment(
  value: unknown,
  nowMs = Date.now(),
): PendingGeoPayment | undefined {
  if (
    !isPlainObject(value) ||
    !["monitoring", "service"].includes(String(value.kind))
  ) {
    return undefined;
  }
  if (
    typeof value.projectId !== "string" ||
    !value.projectId.trim() ||
    typeof value.questionId !== "string" ||
    !value.questionId.trim() ||
    ![
      "pending",
      "paid",
      "reconciliation_required",
      "activation_support_required",
    ].includes(String(value.status)) ||
    !isPlainObject(value.checkout)
  ) {
    return undefined;
  }

  const checkout = value.checkout;
  const fields = checkout.fields;
  const expiresAt =
    typeof checkout.expiresAt === "string" ? checkout.expiresAt : "";
  const expiresAtMs = Date.parse(expiresAt);
  if (
    typeof checkout.authorization !== "string" ||
    !checkout.authorization.trim() ||
    typeof checkout.orderId !== "string" ||
    !checkout.orderId.trim() ||
    !Number.isInteger(checkout.amountFen) ||
    Number(checkout.amountFen) <= 0 ||
    !Number.isFinite(expiresAtMs) ||
    checkout.action !== "https://zpayz.cn/submit.php" ||
    checkout.method !== "POST" ||
    !isPlainObject(fields) ||
    !Object.values(fields).every((field) => typeof field === "string") ||
    fields.out_trade_no !== checkout.orderId ||
    !["alipay", "wxpay"].includes(String(fields.type))
  ) {
    return undefined;
  }

  const shared = {
    projectId: value.projectId,
    ...(typeof value.projectToken === "string" &&
    value.projectToken.trim().length >= 16 &&
    value.projectToken.trim().length <= 16_384
      ? { projectToken: value.projectToken.trim() }
      : {}),
    questionId: value.questionId,
    status: value.status as PendingGeoPayment["status"],
    ...(value.status === "pending" && expiresAtMs <= nowMs
      ? { statusMessage: GEO_PAYMENT_RECONCILIATION_MESSAGE }
      : typeof value.statusMessage === "string"
        ? { statusMessage: value.statusMessage.slice(0, 500) }
        : {}),
    ...(typeof value.lastCheckedAt === "string" &&
    Number.isFinite(Date.parse(value.lastCheckedAt))
      ? { lastCheckedAt: value.lastCheckedAt }
      : {}),
  };

  if (value.kind === "monitoring") {
    const platformIds = Array.isArray(value.platformIds)
      ? value.platformIds.filter(
          (platformId): platformId is GeoPlatformId =>
            typeof platformId === "string" &&
            [
              "doubao",
              "yuanbao",
              "deepseek",
              "baiduai",
              "qianwen",
              "kimi",
            ].includes(platformId),
        )
      : [];
    if (
      platformIds.length === 0 ||
      new Set(platformIds).size !== platformIds.length ||
      !Number.isInteger(checkout.unitPriceFen) ||
      Number(checkout.unitPriceFen) <= 0 ||
      checkout.answersPerPlatform !== 5
    ) {
      return undefined;
    }
    return {
      kind: "monitoring",
      ...shared,
      platformIds,
      checkout: {
        authorization: checkout.authorization,
        orderId: checkout.orderId,
        amountFen: Number(checkout.amountFen),
        unitPriceFen: Number(checkout.unitPriceFen),
        answersPerPlatform: 5,
        expiresAt,
        action: "https://zpayz.cn/submit.php",
        method: "POST",
        fields: fields as Record<string, string>,
      },
    };
  }

  const category = String(value.category);
  if (
    !["reputation", "product_scenario", "competitor_comparison"].includes(
      category,
    ) ||
    checkout.billingMonths !== 1
  ) {
    return undefined;
  }
  return {
    kind: "service",
    ...shared,
    category: category as GeoServiceCategory,
    checkout: {
      authorization: checkout.authorization,
      orderId: checkout.orderId,
      amountFen: Number(checkout.amountFen),
      category: category as GeoServiceCategory,
      billingMonths: 1,
      expiresAt,
      action: "https://zpayz.cn/submit.php",
      method: "POST",
      fields: fields as Record<string, string>,
    },
  };
}

function pendingPaymentRecoveryProject(
  pending?: PendingGeoPayment,
): GeoProject | undefined {
  if (!pending?.projectToken) return undefined;
  const now = new Date().toISOString();
  return {
    id: pending.projectId,
    remoteToken: pending.projectToken,
    title: "待恢复的支付订单项目",
    input: "",
    createdAt: now,
    updatedAt: pending.lastCheckedAt || now,
    stage: pending.kind === "service" ? "service_activation" : "monitoring",
    status: "ready",
    progress: 100,
    files: [],
    questions: [],
    selectedQuestionId: pending.questionId,
    selectedPlatformIds:
      pending.kind === "monitoring" ? pending.platformIds : [],
  };
}

function restorePendingGeoPayment(): PendingGeoPayment | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return normalizeStoredPendingGeoPayment(
      JSON.parse(
        window.localStorage.getItem(GEO_PENDING_PAYMENT_STORAGE_KEY) || "null",
      ),
    );
  } catch {
    return undefined;
  }
}

type KnowledgeView = "overview" | "sources";
const FIXED_KNOWLEDGE_SECTIONS = [
  ["company-identity", "企业与品牌"],
  ["team", "团队与组织"],
  ["products-services", "产品与服务"],
  ["core-capabilities", "技术与交付"],
  ["customers-industries", "客户与行业"],
  ["cooperation", "服务与合作"],
  ["why-frontmind", "可信优势"],
] as const;

export function completeKnowledgeBaseSections(
  sections: GeoKnowledgeSection[],
): GeoKnowledgeSection[] {
  const exactMatches = FIXED_KNOWLEDGE_SECTIONS.map(([id, title]) =>
    sections.find((section) => section.id === id || section.title === title),
  );
  return FIXED_KNOWLEDGE_SECTIONS.map(([id, title], index) => {
    const existing = exactMatches[index];
    const positional =
      sections[index] && !exactMatches.includes(sections[index])
        ? sections[index]
        : undefined;
    return (
      existing ??
      (positional
        ? { ...positional, id, title }
        : {
            id,
            title,
            summary: `${title}的公开资料仍在核验中。`,
            markdown: `公开资料暂未提供${title}的可核验信息。[待核验]`,
            status: "needs_verification" as const,
            evidenceCount: 0,
            assetIds: [],
            leaves: [],
          })
    );
  });
}

export function expandLegacyTruncatedOverview(
  markdown: string,
  sectionTitle: string,
  leaves: GeoKnowledgeSection["leaves"],
) {
  const leafTitles = Array.from(
    new Set(
      (leaves ?? [])
        .map((leaf) => leaf.title.trim())
        .filter((title) => title && title !== sectionTitle),
    ),
  ).slice(0, 3);
  if (!markdown || leafTitles.length === 0) return markdown;
  const completeNarrative = `${sectionTitle}分支涵盖${leafTitles.join("、")}，详细事实与来源已按条目分别整理。`;
  const legacyPrefix = `${sectionTitle}分支涵盖`;
  return markdown
    .split("\n")
    .map((line) => {
      const content = line.trim();
      if (!content.startsWith(legacyPrefix)) return line;
      const unpunctuated = content.replace(/[。！？.!?]+$/, "");
      return completeNarrative.startsWith(unpunctuated)
        ? completeNarrative
        : line;
    })
    .join("\n");
}

const KNOWLEDGE_BRANCH_ICONS = [
  Building2,
  Users,
  PackageOpen,
  Cpu,
  BriefcaseBusiness,
  BadgeCheck,
  Handshake,
] as const;

function getInitialGeometry(): GeoWorkbenchGeometry {
  if (typeof window === "undefined")
    return { x: 80, y: 48, width: 1120, height: 760 };
  const width = Math.min(1160, Math.max(780, window.innerWidth - 96));
  const height = Math.min(800, Math.max(620, window.innerHeight - 72));
  return {
    x: Math.max(24, Math.round((window.innerWidth - width) / 2)),
    y: Math.max(24, Math.round((window.innerHeight - height) / 2)),
    width,
    height,
  };
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(size > 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function formatDate(value?: string): string {
  if (!value) return "刚刚";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatExecutionElapsed(
  startedAt: string | undefined,
  completedAt: string | undefined,
  now: number,
): string {
  const started = startedAt ? new Date(startedAt).getTime() : Number.NaN;
  const ended = completedAt ? new Date(completedAt).getTime() : now;
  const stableStarted = Number.isFinite(started) ? started : now;
  const stableEnded = Number.isFinite(ended) ? ended : now;
  const elapsedSeconds = Math.max(
    0,
    Math.floor((stableEnded - stableStarted) / 1_000),
  );
  const hours = Math.floor(elapsedSeconds / 3_600);
  const minutes = Math.floor((elapsedSeconds % 3_600) / 60);
  const seconds = elapsedSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

function executionStatusLabel(status: GeoExecutionLogEntry["status"]) {
  if (status === "completed") return "已完成";
  if (status === "running") return "执行中";
  if (status === "waiting") return "等待结果";
  if (status === "partial_review") return "待确认";
  if (status === "failed") return "执行失败";
  return "排队中";
}

function executionEventActor(
  kind: GeoExecutionLogEntry["events"][number]["kind"],
) {
  if (
    kind === "model_output" ||
    kind === "result_summary" ||
    kind === "progress_summary" ||
    kind === "artifact"
  )
    return "FrontMind Agent";
  return "执行系统";
}

function orderedExecutionEvents(entry: GeoExecutionLogEntry) {
  return entry.events
    .map((event, index) => ({ event, index }))
    .sort((left, right) => {
      const leftTime = left.event.createdAt
        ? new Date(left.event.createdAt).getTime()
        : Number.NaN;
      const rightTime = right.event.createdAt
        ? new Date(right.event.createdAt).getTime()
        : Number.NaN;
      if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime))
        return left.index - right.index;
      return leftTime - rightTime || left.index - right.index;
    })
    .map(({ event }) => event);
}

function groupedExecutionEvents(entry: GeoExecutionLogEntry) {
  return orderedExecutionEvents(entry).reduce<
    Array<{
      id: string;
      actor: string;
      tone: "agent" | "system" | "error";
      events: GeoExecutionLogEntry["events"];
    }>
  >((groups, event) => {
    const actor = executionEventActor(event.kind);
    const tone =
      event.kind === "error"
        ? "error"
        : actor === "FrontMind Agent"
          ? "agent"
          : "system";
    const previous = groups.at(-1);
    if (previous && previous.actor === actor && previous.tone === tone) {
      previous.events.push(event);
      return groups;
    }
    groups.push({
      id: event.id,
      actor,
      tone,
      events: [event],
    });
    return groups;
  }, []);
}

function errorMessage(error: unknown): string {
  return localizedUserFacingError(error);
}

function looksLikeIndustryRankingQuestion(value: string) {
  return /(?:(?:行业|品类|领域|赛道).{0,10}(?:排名|排行|榜单|top\s*\d*|最好|最佳|第一|领先)|(?:哪家|哪个|哪些).{0,10}(?:最好|最佳|领先|值得推荐)|(?:推荐).{0,8}(?:品牌|公司|厂商|产品)|(?:品牌|公司|企业|平台|机构|服务商|供应商|厂商|工具|方案).{0,12}(?:推荐|排行|排名|有哪些|有哪(?:些|几)家|怎么选|如何选)|(?:有哪些|有哪(?:些|几)家).{0,12}(?:品牌|公司|企业|平台|机构|服务商|供应商|厂商|工具|方案))/i.test(
    value,
  );
}

function explicitlyReferencesProjectCompany(
  question: string,
  companyName: string,
) {
  const normalize = (value: string) =>
    value
      .normalize("NFKC")
      .toLocaleLowerCase("zh-CN")
      .replace(/[\s，。！？、；：“”‘’（）【】《》?.,!()[\]{}'"]/g, "");
  const normalizedCompanyName = normalize(companyName);
  return (
    normalizedCompanyName.length >= 2 &&
    normalize(question).includes(normalizedCompanyName)
  );
}

function preparePaymentWindow() {
  const target = `frontmind-zpay-${Date.now()}`;
  const popup = window.open(
    "",
    target,
    "popup=yes,width=520,height=760,resizable=yes,scrollbars=yes",
  );
  if (!popup) return undefined;
  try {
    popup.opener = null;
    popup.document.title = "FrontMind 安全支付";
    popup.document.body.style.cssText =
      "margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f3f8;color:#4a3d4f;font:15px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";
    popup.document.body.textContent = "正在打开安全收银台…";
  } catch {
    // The window can still be targeted by the signed payment form.
  }
  return { popup, target };
}

export function resolvePaymentCheckoutAction(
  checkout: GeoPaymentCheckout | GeoServicePaymentCheckout,
  location: Pick<Location, "hostname" | "origin"> = window.location,
) {
  const localAcceptanceHost = [
    "127.0.0.1",
    "localhost",
    "::1",
    "[::1]",
  ].includes(location.hostname);
  const localAcceptanceCheckout =
    localAcceptanceHost &&
    checkout.fields.pid === "frontmind-local-acceptance" &&
    checkout.fields.param === "frontmind-local-acceptance";
  return localAcceptanceCheckout
    ? `${location.origin}/__acceptance__/paid`
    : checkout.action;
}

function submitPaymentCheckout(
  checkout: GeoPaymentCheckout | GeoServicePaymentCheckout,
  target: string,
) {
  const form = document.createElement("form");
  form.method = checkout.method;
  form.action = resolvePaymentCheckoutAction(checkout);
  form.target = target;
  form.acceptCharset = "UTF-8";
  form.style.display = "none";
  for (const [name, value] of Object.entries(checkout.fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(form);
  form.submit();
  form.remove();
}

function projectDisplayTitle(project: GeoProject): string {
  return project.title;
}

function canStartService(project: GeoProject): boolean {
  return Boolean(
    project.serviceActivation?.status === "active" ||
      (project.assessment?.status === "ready" &&
        project.optimizationForecast?.status === "ready" &&
        project.serviceActivation),
  );
}

function canPreviewServiceWorkspace(project: GeoProject): boolean {
  return Boolean(
    project.assessment?.status === "ready" &&
      (project.selectedQuestionId ||
        project.serviceActivation?.questionId ||
        project.questions.length > 0),
  );
}

function canOpenStage(project: GeoProject, stage: GeoStage): boolean {
  if (stage === "enterprise_analysis") return true;
  if (stage === "question_recommendation")
    return (
      project.questions.length > 0 ||
      project.executionLog?.entries.some(
        (entry) => entry.stage === "question_recommendation",
      ) === true
    );
  if (stage === "monitoring")
    return (
      Boolean(project.selectedQuestionId) ||
      project.executionLog?.entries.some(
        (entry) => entry.stage === "monitoring",
      ) === true
    );
  if (stage === "current_assessment")
    return (
      project.monitoring?.status === "completed" ||
      Boolean(
        project.assessment && project.assessment.status !== "not_started",
      ) ||
      project.executionLog?.entries.some(
        (entry) => entry.stage === "current_assessment",
      ) === true
    );
  return canStartService(project) || canPreviewServiceWorkspace(project);
}

function projectDefaultStage(project: GeoProject): GeoStage {
  if (
    project.serviceActivation &&
    project.serviceActivation.status !== "not_started"
  )
    return "service_activation";
  if (
    project.monitoring?.status === "completed" ||
    (project.assessment && project.assessment.status !== "not_started")
  )
    return "current_assessment";
  if (project.monitoring?.runId) return "monitoring";
  if (project.selectedQuestionId) return "monitoring";
  if (project.questions.length > 0) return "question_recommendation";
  const executionStage = project.executionLog?.entries.find(
    (entry) => entry.id === project.executionLog?.currentEntryId,
  )?.stage;
  if (executionStage && executionStage !== "service_activation")
    return executionStage;
  return "enterprise_analysis";
}

function isStageComplete(project: GeoProject, stage: GeoStage): boolean {
  if (stage === "enterprise_analysis") return Boolean(project.knowledgeBase);
  if (stage === "question_recommendation")
    return Boolean(project.selectedQuestionId);
  if (stage === "monitoring") return project.monitoring?.status === "completed";
  if (stage === "current_assessment")
    return (
      project.assessment?.status === "ready" &&
      project.optimizationForecast?.status === "ready"
    );
  return project.serviceActivation?.status === "active";
}

function normalizeFiles(files: FileList | File[]): {
  files: File[];
  error?: string;
} {
  const incoming = Array.from(files);
  if (incoming.length > MAX_FILE_COUNT) {
    return {
      files: incoming.slice(0, MAX_FILE_COUNT),
      error: `单次最多上传 ${MAX_FILE_COUNT} 个文件。`,
    };
  }
  const oversized = incoming.find((file) => file.size > MAX_FILE_SIZE);
  if (oversized)
    return { files: [], error: `${oversized.name} 超过 50 MB，请压缩后重试。` };
  return { files: incoming };
}

function LightweightMarkdown({ markdown }: { markdown?: string }) {
  return (
    <SafeMarkdown
      markdown={markdown}
      className="geo-markdown"
      empty={
        <p className="geo-empty-copy">
          暂无可展示的正文内容，请下载完整知识库查看。
        </p>
      }
    />
  );
}

function StatusPill({ status }: { status?: GeoKnowledgeSection["status"] }) {
  const values = {
    verified: { label: "已核验", className: "verified" },
    inferred: { label: "合理推断", className: "inferred" },
    needs_verification: { label: "待核验", className: "pending" },
    not_applicable: { label: "不适用", className: "muted" },
  } as const;
  const value = status ? values[status] : values.needs_verification;
  return (
    <span className={`geo-status-pill ${value.className}`}>{value.label}</span>
  );
}

function PlatformLogo({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <span className="geo-platform-fallback" aria-hidden="true">
        {name.slice(0, 1)}
      </span>
    );
  return (
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className="geo-platform-logo"
    />
  );
}

function isPreviewableKnowledgeAsset(asset: GeoKnowledgeAsset) {
  const value = `${asset.type || ""} ${asset.previewUrl || asset.url || ""} ${asset.name}`;
  return /图片|图像|logo|视觉|image\/(?:avif|webp|png|jpe?g|gif)|\.(?:avif|webp|png|jpe?g|gif)(?:$|[?#\s])/i.test(
    value,
  );
}

function knowledgeAssetRoleRank(asset: GeoKnowledgeAsset) {
  return asset.displayRole === "hero"
    ? 0
    : asset.displayRole === "inline"
      ? 1
      : asset.displayRole === "badge"
        ? 2
        : 1;
}

function knowledgeAssetUsesContain(asset: GeoKnowledgeAsset) {
  return (
    asset.displayRole === "badge" ||
    [
      "brand_identity",
      "product_ui",
      "product_diagram",
      "certificate_badge",
      "document_figure",
    ].includes(asset.assetType || "") ||
    /logo|标识|证书|徽章|架构图|界面/i.test(`${asset.type || ""} ${asset.name}`)
  );
}

function useLocalKnowledgeAssetPreviewUrls(
  projectId: string,
  assets: GeoKnowledgeAsset[],
  archivePersistenceVersion = 0,
) {
  const [localUrls, setLocalUrls] = useState<Record<string, string>>({});
  const archiveAssetSignature = assets
    .filter((asset) => asset.archivePath)
    .map((asset) => `${asset.id}:${asset.archivePath}`)
    .join("|");
  const refreshKey = geoLocalArchiveAssetRefreshKey(
    projectId,
    assets,
    archivePersistenceVersion,
  );

  useEffect(() => {
    if (
      !archiveAssetSignature ||
      typeof window === "undefined" ||
      typeof URL.createObjectURL !== "function"
    ) {
      setLocalUrls({});
      return;
    }

    let cancelled = false;
    let timer: number | undefined;
    let releaseWait: (() => void) | undefined;
    const createdUrls: string[] = [];
    const candidates = assets.filter((asset) => asset.archivePath);
    setLocalUrls({});
    const wait = (delayMs: number) =>
      new Promise<void>((resolve) => {
        releaseWait = resolve;
        timer = window.setTimeout(() => {
          timer = undefined;
          releaseWait = undefined;
          resolve();
        }, delayMs);
      });

    void (async () => {
      for (const delayMs of [0, 2_000, 6_000]) {
        if (delayMs > 0) await wait(delayMs);
        if (cancelled) return;
        const blobs = await loadLocalGeoAssetBlobs(projectId, candidates).catch(
          () => new Map<string, Blob>(),
        );
        if (cancelled) return;
        if (blobs === undefined) continue;

        const nextUrls: Record<string, string> = {};
        blobs.forEach((blob, assetId) => {
          const url = URL.createObjectURL(blob);
          createdUrls.push(url);
          nextUrls[assetId] = url;
        });
        if (!cancelled) setLocalUrls(nextUrls);
        return;
      }
    })();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      releaseWait?.();
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [refreshKey]);

  return localUrls;
}

function KnowledgeAssetPreviewImage({ asset }: { asset: GeoKnowledgeAsset }) {
  const [failed, setFailed] = useState(false);
  const src = asset.previewUrl || asset.url;
  useEffect(() => setFailed(false), [src]);
  if (failed) {
    return (
      <span className="geo-section-media-fallback" aria-hidden="true">
        <ImageIcon size={28} />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={asset.alt || asset.caption || asset.name}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

function KnowledgeSectionVisual({
  section,
  sectionIndex,
  assets,
  assetIds,
  leafId,
}: {
  section: GeoKnowledgeSection;
  sectionIndex: number;
  assets: GeoKnowledgeAsset[];
  assetIds?: string[];
  leafId?: string;
}) {
  const Icon =
    KNOWLEDGE_BRANCH_ICONS[sectionIndex % KNOWLEDGE_BRANCH_ICONS.length] ??
    BookOpenText;
  const hasExplicitAssetSelection = assetIds !== undefined;
  const explicitlyRelated = new Set(assetIds ?? []);
  const directlyRelated = hasExplicitAssetSelection
    ? assets.filter((asset) => explicitlyRelated.has(asset.id))
    : assets.filter(
        (asset) =>
          asset.sectionId === section.id &&
          (!leafId || !asset.leafId || asset.leafId === leafId),
      );
  const unassigned =
    !hasExplicitAssetSelection && sectionIndex === 0 && !leafId
      ? assets.filter((asset) => !asset.sectionId)
      : [];
  const relatedAssets = [...directlyRelated, ...unassigned];
  const allVisualAssets = relatedAssets
    .filter(isPreviewableKnowledgeAsset)
    .filter((asset) => asset.previewUrl || asset.url)
    .sort(
      (left, right) =>
        knowledgeAssetRoleRank(left) - knowledgeAssetRoleRank(right),
    );
  const visualAssets = allVisualAssets
    .filter((asset) => asset.displayRole !== "badge")
    .slice(0, 3);
  const badgeAssets = allVisualAssets
    .filter((asset) => asset.displayRole === "badge")
    .slice(0, 6);
  const remainingCount = Math.max(
    0,
    allVisualAssets.length - visualAssets.length - badgeAssets.length,
  );

  return (
    <figure
      className={`geo-section-media tone-${(sectionIndex % 4) + 1} ${
        visualAssets.length > 1 ? "is-gallery" : ""
      }`}
    >
      <div className="geo-section-media-canvas">
        {visualAssets.length > 0 ? (
          visualAssets.map((asset, index) => (
            <div
              className={`geo-section-media-image ${
                knowledgeAssetUsesContain(asset) ? "is-contain" : ""
              }`}
              key={asset.id}
            >
              <KnowledgeAssetPreviewImage asset={asset} />
              {index === 0 && <span>{asset.type || "知识素材"}</span>}
            </div>
          ))
        ) : (
          <div className="geo-section-media-illustration" aria-hidden="true">
            <span>{String(sectionIndex + 1).padStart(2, "0")}</span>
            <Icon size={42} strokeWidth={1.35} />
            <i />
            <i />
            <i />
          </div>
        )}
      </div>
      {badgeAssets.length > 0 && (
        <div className="geo-section-media-badges" aria-label="品牌与资质标识">
          {badgeAssets.map((asset) => (
            <div className="geo-section-media-badge" key={asset.id}>
              <KnowledgeAssetPreviewImage asset={asset} />
            </div>
          ))}
        </div>
      )}
      <figcaption>
        <span>图文知识章节</span>
        <strong>{section.title}</strong>
        <small>
          {visualAssets[0]?.caption ||
            visualAssets[0]?.source ||
            "本章节未关联可预览素材"}
          {remainingCount > 0 ? ` · 另含 ${remainingCount} 份素材` : ""}
        </small>
      </figcaption>
    </figure>
  );
}

function KnowledgeBuildTree({
  knowledgeBase,
}: {
  knowledgeBase: GeoKnowledgeBase;
}) {
  const sections = completeKnowledgeBaseSections(knowledgeBase.sections);
  const archiveItems = [
    {
      number: "01",
      title: "知识树",
      detail: `当前知识库固定展示 ${sections.length} 个主题分支。`,
    },
    {
      number: "02",
      title: "内容叶子",
      detail: knowledgeBase.completeness
        ? `完整度清单记录 ${knowledgeBase.completeness.counts.totalLeaves} 个内容叶子。`
        : "当前 ZIP 未返回可展示的叶子计数。",
    },
    {
      number: "03",
      title: "来源索引",
      detail: `当前 ZIP 返回 ${knowledgeBase.sources.length} 个可展示来源 URL。`,
    },
    {
      number: "04",
      title: "素材索引",
      detail: `当前 ZIP 返回 ${knowledgeBase.assets.length} 个素材或文档条目。`,
    },
  ];
  return (
    <section className="geo-build-tree" aria-labelledby="geo-build-tree-title">
      <header>
        <div>
          <span>ARCHIVE TRACE</span>
          <h3 id="geo-build-tree-title">知识库归档清单</h3>
        </div>
        <small>
          <Check size={14} /> 数据来自已校验 ZIP
        </small>
      </header>
      <ol>
        {archiveItems.map((item, index) => (
          <li key={item.number}>
            <span className="geo-build-tree-node">
              <Check size={14} />
            </span>
            <div>
              <span>ITEM {item.number}</span>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
              {index === 0 && (
                <div className="geo-build-branches" aria-label="知识库主题分支">
                  {sections.map((section) => (
                    <span key={section.id}>
                      <Check size={11} /> {section.title}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      <footer>仅展示当前 ZIP 实际返回项目，不代表对全网信息的绝对覆盖。</footer>
    </section>
  );
}

function PermissionChannel({
  name,
  logo,
  tone,
}: {
  name: string;
  logo: string;
  tone: string;
}) {
  return (
    <span className={`geo-permission-channel ${tone}`}>
      <img src={logo} alt="" draggable={false} />
      {name}
    </span>
  );
}

export default function GeoBuildExperience() {
  const { lang } = useLang();
  if (lang !== "zh") return null;
  return (
    <GeoBuildExperienceZh
      key={
        import.meta.env.DEV && isGeoStylePreviewEnabled()
          ? "geo-development-preview-v1"
          : "live"
      }
    />
  );
}

function GeoBuildExperienceZh() {
  const stylePreviewEnabled = isGeoStylePreviewEnabled();
  const [draftInput, setDraftInput] = useState("");
  const [draftFiles, setDraftFiles] = useState<File[]>([]);
  const [draftError, setDraftError] = useState("");
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [creating, setCreating] = useState(false);
  const [startingAnalysisId, setStartingAnalysisId] = useState<string>();
  const [startingQuestionProjectId, setStartingQuestionProjectId] =
    useState<string>();
  const [retryingAssessmentProjectId, setRetryingAssessmentProjectId] =
    useState<string>();
  const [projects, setProjects] = useState<GeoProject[]>([]);
  const [projectsHydrated, setProjectsHydrated] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | undefined>();
  const [activeStage, setActiveStage] = useState<GeoStage>(
    "enterprise_analysis",
  );
  const [workbenchOpen, setWorkbenchOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [executionLogOpen, setExecutionLogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GeoProject>();
  const [deleteAction, setDeleteAction] = useState<"remote" | "local">();
  const [deleteError, setDeleteError] = useState("");
  const [deleteRemoteCompleted, setDeleteRemoteCompleted] = useState(false);
  const [deleteSafetyBlocked, setDeleteSafetyBlocked] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<GeoQuestion>();
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentPurpose, setPaymentPurpose] =
    useState<GeoPaymentPurpose>("monitoring");
  const [pendingPayment, setPendingPayment] = useState<
    PendingGeoPayment | undefined
  >(restorePendingGeoPayment);
  const [paymentCreating, setPaymentCreating] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [paymentCheckNonce, setPaymentCheckNonce] = useState(0);
  const [storageNotice, setStorageNotice] = useState("");
  const [purchaseIntent, setPurchaseIntent] = useState<string | undefined>(
    () => {
      if (typeof window === "undefined") return undefined;
      return readGeoPurchaseIntentFromUrl(window.location.href);
    },
  );
  const [lastRefreshedAtByProject, setLastRefreshedAtByProject] = useState<
    Record<string, string>
  >({});
  const [refreshingProjectIds, setRefreshingProjectIds] = useState<
    Record<string, boolean>
  >({});
  const [archivePersistenceVersionByProject, setArchivePersistenceVersion] =
    useState<Record<string, number>>({});
  const [geometry, setGeometry] =
    useState<GeoWorkbenchGeometry>(getInitialGeometry);
  const [compactViewport, setCompactViewport] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 840,
  );
  const dragOperation = useRef<DragOperation | undefined>(undefined);
  const questionStartInFlight = useRef(new Set<string>());
  const assessmentStartInFlight = useRef(new Set<string>());
  const forecastStartInFlight = useRef(new Set<string>());
  const paymentMonitorStartInFlight = useRef(new Set<string>());
  const archivePersistenceCompleted = useRef(new Set<string>());
  const pendingDrafts = useRef(new Map<string, PendingGeoDraft>());
  const draftAnalysisControllers = useRef(new Map<string, AbortController>());
  const refreshInFlight = useRef(new Map<string, Promise<GeoProject>>());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workbenchRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLButtonElement>(null);
  const focusBeforeWorkbench = useRef<HTMLElement | null>(null);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId),
    [activeProjectId, projects],
  );
  const activePendingPayment =
    pendingPayment?.projectId === activeProject?.id
      ? pendingPayment
      : undefined;
  const activeQuestionSelectionLocked = activeProject
    ? isGeoQuestionSelectionLocked(activeProject, pendingPayment?.projectId)
    : false;
  const paymentDialogProject = pendingPayment
    ? (projects.find((project) => project.id === pendingPayment.projectId) ??
      pendingPaymentRecoveryProject(pendingPayment))
    : activeProject;

  useEffect(() => {
    try {
      if (pendingPayment) {
        window.localStorage.setItem(
          GEO_PENDING_PAYMENT_STORAGE_KEY,
          JSON.stringify(pendingPayment),
        );
      } else {
        window.localStorage.removeItem(GEO_PENDING_PAYMENT_STORAGE_KEY);
      }
    } catch {
      // The server remains authoritative if browser storage is unavailable.
    }
  }, [pendingPayment]);

  useEffect(() => {
    if (!pendingPayment || pendingPayment.status !== "pending") return;
    const expiresAt = Date.parse(pendingPayment.checkout.expiresAt);
    const authorization = pendingPayment.checkout.authorization;
    const reconcileExpired = () => {
      setPendingPayment((current) =>
        current?.checkout.authorization === authorization &&
        current.status === "pending"
          ? {
              ...current,
              statusMessage: GEO_PAYMENT_RECONCILIATION_MESSAGE,
            }
          : current,
      );
      setPaymentError("");
      setStorageNotice(GEO_PAYMENT_RECONCILIATION_MESSAGE);
    };
    const remaining = expiresAt - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
      reconcileExpired();
      return;
    }
    const timer = window.setTimeout(
      reconcileExpired,
      Math.min(remaining + 250, 2_147_000_000),
    );
    return () => window.clearTimeout(timer);
  }, [
    pendingPayment?.checkout.authorization,
    pendingPayment?.checkout.expiresAt,
    pendingPayment?.status,
  ]);

  useEffect(() => {
    if (!projectsHydrated || !pendingPayment) return;
    if (projects.some((project) => project.id === pendingPayment.projectId))
      return;
    if (pendingPayment.projectToken) {
      setStorageNotice(
        "待支付订单的本机项目记录缺失；订单凭证已保留，系统会继续核对并在履约成功后恢复项目。",
      );
      return;
    }
    const message =
      "待支付订单的本机项目记录缺失，且旧版记录无法自动恢复项目；订单凭证已保留，请勿重复支付并联系技术支持核对。";
    setPendingPayment((current) =>
      current &&
      current.projectId === pendingPayment.projectId &&
      current.status !== "reconciliation_required" &&
      current.status !== "activation_support_required"
        ? {
            ...current,
            status: "reconciliation_required",
            statusMessage: message,
          }
        : current,
    );
    setPaymentDialogOpen(true);
    setPaymentError(message);
    setStorageNotice(message);
  }, [pendingPayment, projects, projectsHydrated]);

  useEffect(
    () => () => {
      draftAnalysisControllers.current.forEach((controller) =>
        controller.abort(),
      );
      draftAnalysisControllers.current.clear();
    },
    [],
  );

  const commitProject = useCallback(
    (
      project: GeoProject,
      options: {
        expectedRemoteToken?: string;
        skipPersistence?: boolean;
      } = {},
    ) => {
      setProjects((current) => {
        const existing = current.find((item) => item.id === project.id);
        if (
          options.expectedRemoteToken &&
          !canCommitGeoProjectObservation(
            existing,
            project,
            options.expectedRemoteToken,
          )
        ) {
          return current;
        }
        const exists = Boolean(existing);
        const next = exists
          ? current.map((item) => (item.id === project.id ? project : item))
          : [project, ...current];
        return next.sort((left, right) =>
          right.updatedAt.localeCompare(left.updatedAt),
        );
      });
      if (
        options.skipPersistence ||
        isGeoDraftProject(project) ||
        isGeoStylePreviewProject(project)
      )
        return;
      void saveGeoProject(project).catch(() =>
        setStorageNotice("当前浏览器无法持久保存项目，请及时下载知识库备份。"),
      );
    },
    [],
  );

  const refreshProject = useCallback(
    (project: GeoProject) =>
      refreshGeoProjectOnce(project, {
        fetchProject: (candidate) => {
          const activation = candidate.serviceActivation;
          const accountOpening = [
            "activation_pending",
            "provisioning",
          ].includes(activation?.status ?? "");
          if (activation?.provisioningVersion === 2 && accountOpening) {
            return getGeoServiceProvisioningStatus(candidate);
          }
          if (activation?.contractWorkflowReference && accountOpening) {
            return getGeoServiceContractStatus(candidate);
          }
          return getGeoProject(candidate);
        },
        inFlight: refreshInFlight.current,
        onStart: (projectId) =>
          setRefreshingProjectIds((current) => ({
            ...current,
            [projectId]: true,
          })),
        onSuccess: (updated, refreshedAt) => {
          commitProject(updated);
          setLastRefreshedAtByProject((current) => ({
            ...current,
            [updated.id]: refreshedAt,
          }));
        },
        onFinish: (projectId) =>
          setRefreshingProjectIds((current) => ({
            ...current,
            [projectId]: false,
          })),
      }),
    [commitProject],
  );

  const refreshActiveProject = useCallback(async () => {
    if (!activeProject || isGeoStylePreviewProject(activeProject)) return;
    if (isGeoDraftProject(activeProject) || !activeProject.remoteToken) {
      setStorageNotice("企业分析启动后，才能从后台刷新项目进度。");
      return;
    }

    setStorageNotice("");
    try {
      await refreshProject(activeProject);
    } catch (error) {
      if (error instanceof GeoApiError && error.status === 401) {
        setStorageNotice(
          "访问会话已过期。创建新项目时请重新输入邀请码；现有本地项目仍可查看。",
        );
      } else if (error instanceof GeoApiError && error.status === 404) {
        setStorageNotice("远端项目已不存在，本地记录与已归档 ZIP 仍会保留。");
      } else {
        setStorageNotice(`项目状态刷新失败：${errorMessage(error)}`);
      }
    }
  }, [activeProject, refreshProject]);

  const retryCurrentAssessment = useCallback(async () => {
    const project = activeProject;
    if (
      !project ||
      isGeoStylePreviewProject(project) ||
      isGeoDraftProject(project) ||
      !project.remoteToken ||
      project.assessment?.status !== "failed" ||
      assessmentStartInFlight.current.has(project.id)
    )
      return;

    const projectId = project.id;
    assessmentStartInFlight.current.add(projectId);
    setRetryingAssessmentProjectId(projectId);
    setStorageNotice("");
    try {
      const updated = await startGeoCurrentAssessment(project);
      commitProject(updated);
    } catch (error) {
      setStorageNotice(`现状评估未能重新启动：${errorMessage(error)}`);
    } finally {
      assessmentStartInFlight.current.delete(projectId);
      setRetryingAssessmentProjectId((current) =>
        current === projectId ? undefined : current,
      );
    }
  }, [activeProject, commitProject]);

  useEffect(() => {
    if (!import.meta.env.DEV || !stylePreviewEnabled) return;
    let cancelled = false;
    void import("./preview")
      .then(({ createGeoStylePreviewProject }) => {
        if (cancelled) return;
        const previewProject = createGeoStylePreviewProject();
        setProjects([previewProject]);
        setActiveProjectId(GEO_STYLE_PREVIEW_ID);
        setActiveStage("current_assessment");
        setWorkbenchOpen(true);
        setProjectsHydrated(true);
      })
      .catch(() => {
        if (cancelled) return;
        setProjectsHydrated(true);
        setStorageNotice("开发预览数据加载失败，请刷新页面重试。");
      });
    return () => {
      cancelled = true;
    };
  }, [stylePreviewEnabled]);

  useEffect(() => {
    if (stylePreviewEnabled) return;
    void requestPersistentGeoStorage();
    void listGeoProjects()
      .then((storedProjects) => {
        setProjects(storedProjects);
        if (storedProjects[0]) setActiveProjectId(storedProjects[0].id);
      })
      .catch(() => setStorageNotice("当前浏览器无法读取本地项目记录。"))
      .finally(() => setProjectsHydrated(true));
  }, [stylePreviewEnabled]);

  useEffect(() => {
    const handleResize = () => {
      const isCompact = window.innerWidth < 840;
      setCompactViewport(isCompact);
      if (!isCompact) {
        setGeometry((current) => ({
          width: Math.min(current.width, window.innerWidth - 32),
          height: Math.min(current.height, window.innerHeight - 32),
          x: Math.max(
            16,
            Math.min(
              current.x,
              window.innerWidth -
                Math.min(current.width, window.innerWidth - 32) -
                16,
            ),
          ),
          y: Math.max(16, Math.min(current.y, window.innerHeight - 80)),
        }));
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!workbenchOpen) {
      focusBeforeWorkbench.current?.focus?.();
      focusBeforeWorkbench.current = null;
      return;
    }
    if (!focusBeforeWorkbench.current) {
      focusBeforeWorkbench.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    }
    const frame = window.requestAnimationFrame(() => {
      if (minimized) dockRef.current?.focus();
      else workbenchRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeProjectId, minimized, workbenchOpen]);

  useEffect(() => {
    const shouldIsolateBackground =
      workbenchOpen &&
      Boolean(activeProject) &&
      !minimized &&
      (compactViewport || maximized);
    if (!shouldIsolateBackground) return;

    const appRoot = document.getElementById("root");
    if (!appRoot || appRoot.contains(workbenchRef.current)) return;

    const previousAriaHidden = appRoot.getAttribute("aria-hidden");
    const previousInert = appRoot.inert;
    const previousBodyOverflow = document.body.style.overflow;
    appRoot.inert = true;
    appRoot.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "hidden";

    return () => {
      appRoot.inert = previousInert;
      if (previousAriaHidden === null) {
        appRoot.removeAttribute("aria-hidden");
      } else {
        appRoot.setAttribute("aria-hidden", previousAriaHidden);
      }
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [activeProject, compactViewport, maximized, minimized, workbenchOpen]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const operation = dragOperation.current;
      if (!operation || compactViewport || maximized) return;
      const deltaX = event.clientX - operation.startX;
      const deltaY = event.clientY - operation.startY;
      if (operation.mode === "move") {
        setGeometry({
          ...operation.geometry,
          x: Math.max(
            8,
            Math.min(
              operation.geometry.x + deltaX,
              window.innerWidth - operation.geometry.width - 8,
            ),
          ),
          y: Math.max(
            8,
            Math.min(operation.geometry.y + deltaY, window.innerHeight - 72),
          ),
        });
      } else {
        setGeometry({
          ...operation.geometry,
          width: Math.max(
            720,
            Math.min(
              operation.geometry.width + deltaX,
              window.innerWidth - operation.geometry.x - 8,
            ),
          ),
          height: Math.max(
            560,
            Math.min(
              operation.geometry.height + deltaY,
              window.innerHeight - operation.geometry.y - 8,
            ),
          ),
        });
      }
    };
    const handlePointerUp = () => {
      dragOperation.current = undefined;
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [compactViewport, maximized]);

  useEffect(() => {
    if (!activeProject || !shouldAutoRefreshGeoProject(activeProject)) return;
    const project = activeProject;
    let cancelled = false;
    let polling = false;
    let failures = 0;
    let timer: number | undefined;

    const clearTimer = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
    };

    const schedule = () => {
      clearTimer();
      if (cancelled || !canRunGeoAutoRefresh(project, document.visibilityState))
        return;
      timer = window.setTimeout(refresh, geoAutoRefreshDelayMs(project));
    };

    const refresh = async () => {
      if (cancelled || polling) return;
      if (!canRunGeoAutoRefresh(project, document.visibilityState)) return;
      polling = true;
      try {
        await refreshProject(project);
        if (!cancelled) failures = 0;
      } catch (error) {
        if (!cancelled && error instanceof GeoApiError) {
          if (error.status === 401 || error.status === 404) {
            cancelled = true;
            setStorageNotice(
              error.status === 401
                ? "访问会话已过期。创建新项目时请重新输入邀请码；现有本地项目仍可查看。"
                : "远端项目已不存在，本地记录与已归档 ZIP 仍会保留。",
            );
          } else {
            failures += 1;
            if (failures >= 2)
              setStorageNotice(
                `项目状态暂时无法更新：${errorMessage(error)}（将自动重试）`,
              );
          }
        } else if (!cancelled) {
          failures += 1;
        }
      } finally {
        polling = false;
        schedule();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        clearTimer();
        return;
      }
      void refresh();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    schedule();
    return () => {
      cancelled = true;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    activeProject?.id,
    activeProject?.remoteToken,
    activeProject?.status,
    activeProject?.monitoring?.status,
    activeProject?.assessment?.status,
    activeProject?.optimizationForecast?.status,
    activeProject?.serviceActivation?.status,
    activeProject?.serviceActivation?.provisioningVersion,
    activeProject?.questions.length,
    Boolean(activeProject?.knowledgeBase),
    refreshProject,
  ]);

  useEffect(() => {
    if (isGeoStylePreviewProject(activeProject)) return;
    if (activeProject?.assessment?.status !== "ready") return;
    if (
      activeProject.optimizationForecast &&
      activeProject.optimizationForecast.status !== "not_started"
    )
      return;
    if (forecastStartInFlight.current.has(activeProject.id)) return;
    forecastStartInFlight.current.add(activeProject.id);
    void startGeoOptimizationForecast(activeProject)
      .then(commitProject)
      .catch((error) => {
        setStorageNotice(
          `现状评估已生成，优化效果评估将稍后继续：${errorMessage(error)}`,
        );
      })
      .finally(() => forecastStartInFlight.current.delete(activeProject.id));
  }, [activeProject, commitProject]);

  useEffect(() => {
    if (isGeoStylePreviewProject(activeProject)) return;
    if (!activeProject?.monitoring?.runId) return;
    if (activeProject.monitoring.status !== "completed") return;
    if (
      activeProject.assessment &&
      activeProject.assessment.status !== "not_started"
    )
      return;
    if (assessmentStartInFlight.current.has(activeProject.id)) return;
    assessmentStartInFlight.current.add(activeProject.id);
    void startGeoCurrentAssessment(activeProject)
      .then(commitProject)
      .catch((error) => {
        setStorageNotice(
          `监控已完成，但现状评估尚未启动：${errorMessage(error)}`,
        );
      })
      .finally(() => assessmentStartInFlight.current.delete(activeProject.id));
  }, [activeProject, commitProject]);

  useEffect(() => {
    if (isGeoStylePreviewProject(activeProject)) return;
    if (!activeProject?.knowledgeBase) return;
    if (archivePersistenceCompleted.current.has(activeProject.id)) return;

    const project = activeProject;
    const controller = new AbortController();
    void retryGeoArchivePersistence(
      async () => {
        const stored = await getGeoArchive(project.id);
        if (stored) return;
        const archive = await downloadGeoArchive(project, {
          signal: controller.signal,
        });
        await saveGeoArchive({
          projectId: project.id,
          ...archive,
          savedAt: new Date().toISOString(),
        });
      },
      { signal: controller.signal },
    )
      .then(() => {
        if (!controller.signal.aborted) {
          archivePersistenceCompleted.current.add(project.id);
          setArchivePersistenceVersion((current) => ({
            ...current,
            [project.id]: (current[project.id] || 0) + 1,
          }));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setStorageNotice(
            "知识库已生成，但自动保存 ZIP 多次重试仍未完成；仍可使用“下载知识库 ZIP”直接下载。",
          );
      });

    return () => controller.abort();
  }, [activeProject?.id, Boolean(activeProject?.knowledgeBase)]);

  const addFiles = (incoming: FileList | File[]) => {
    const { files, error } = normalizeFiles(incoming);
    if (error) {
      setDraftError(error);
      return;
    }
    setDraftError("");
    setDraftFiles((current) => {
      const bySignature = new Map(
        current.map((file) => [
          `${file.name}:${file.size}:${file.lastModified}`,
          file,
        ]),
      );
      files.forEach((file) =>
        bySignature.set(`${file.name}:${file.size}:${file.lastModified}`, file),
      );
      const combined = Array.from(bySignature.values());
      if (combined.length > MAX_FILE_COUNT) {
        setDraftError(`单次最多上传 ${MAX_FILE_COUNT} 个文件。`);
        return combined.slice(0, MAX_FILE_COUNT);
      }
      return combined;
    });
  };

  const requestBuild = () => {
    if (!draftInput.trim() && draftFiles.length === 0) {
      setDraftError("请输入企业名称、官网，或上传一份企业宣传资料。");
      return;
    }
    setDraftError("");
    setInviteError("");
    setInviteCode("");
    setInviteOpen(true);
  };

  const handleInviteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inviteCode.trim()) {
      setInviteError("请输入邀请码。");
      return;
    }
    setCreating(true);
    setInviteError("");
    try {
      await verifyGeoInvitation(inviteCode.trim());
      const project = createGeoDraftProject(draftInput, draftFiles);
      pendingDrafts.current.set(project.id, {
        input: draftInput.trim(),
        files: [...draftFiles],
        requestId: crypto.randomUUID(),
      });
      setProjects((current) => [
        project,
        ...current.filter((item) => item.id !== project.id),
      ]);
      setActiveProjectId(project.id);
      setActiveStage("enterprise_analysis");
      setDraftInput("");
      setDraftFiles([]);
      setInviteOpen(false);
      setInviteCode("");
      setWorkbenchOpen(true);
      setMinimized(false);
    } catch (error) {
      setInviteError(errorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const startDraftAnalysis = async () => {
    if (!activeProject || !isGeoDraftProject(activeProject)) return;
    const projectId = activeProject.id;
    if (draftAnalysisControllers.current.has(projectId)) return;
    const draft = pendingDrafts.current.get(projectId);
    if (!draft) {
      setStorageNotice(
        "当前草稿的原始文件已不在内存中，请返回首页重新输入并选择资料。",
      );
      return;
    }
    const controller = new AbortController();
    draftAnalysisControllers.current.set(projectId, controller);
    setStartingAnalysisId(projectId);
    setStorageNotice("");
    try {
      const project = await createGeoProject(draft.input, draft.files, {
        requestId: draft.requestId,
        uploadedFiles: draft.uploadedFiles,
        signal: controller.signal,
        onUploadsReady: (uploadedFiles) => {
          draft.uploadedFiles = uploadedFiles;
          setStorageNotice(
            `企业资料上传中：已完成 ${uploadedFiles.length} / ${draft.files.length} 份；如后续失败，重试会复用已上传文件。`,
          );
        },
      });
      if (controller.signal.aborted || !pendingDrafts.current.has(projectId)) {
        return;
      }
      const readyProject = project.id
        ? project
        : { ...project, id: crypto.randomUUID() };
      pendingDrafts.current.delete(projectId);
      setProjects((current) =>
        [readyProject, ...current.filter((item) => item.id !== projectId)].sort(
          (left, right) => right.updatedAt.localeCompare(left.updatedAt),
        ),
      );
      void saveGeoProject(readyProject).catch(() =>
        setStorageNotice("当前浏览器无法持久保存项目，请及时下载知识库备份。"),
      );
      setActiveProjectId(readyProject.id);
      setActiveStage("enterprise_analysis");
    } catch (error) {
      if (!controller.signal.aborted) {
        setStorageNotice(`企业分析尚未启动：${errorMessage(error)}`);
      }
    } finally {
      if (draftAnalysisControllers.current.get(projectId) === controller) {
        draftAnalysisControllers.current.delete(projectId);
      }
      setStartingAnalysisId((current) =>
        current === projectId ? undefined : current,
      );
    }
  };

  const openStoredProject = (project: GeoProject) => {
    setActiveProjectId(project.id);
    setActiveStage(projectDefaultStage(project));
    setWorkbenchOpen(true);
    setMinimized(false);
  };

  const openNewProjectBuilder = useCallback(() => {
    setProjectMenuOpen(false);
    setWorkbenchOpen(false);
    window.setTimeout(
      () =>
        document.querySelector("#geo-builder")?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        }),
      50,
    );
  }, []);

  const continueToGeoQuestions = async () => {
    const project = activeProject;
    if (!project?.knowledgeBase) return;

    if (
      project.questions.length > 0 ||
      project.status === "recommending" ||
      isGeoStylePreviewProject(project)
    ) {
      setActiveStage("question_recommendation");
      return;
    }
    if (!project.remoteToken) {
      setStorageNotice("当前项目尚未连接后台，暂不能生成 GEO 问题。");
      return;
    }
    if (project.status === "failed") {
      setStorageNotice(project.error || "问题推荐未能完成，请联系技术支持。");
      return;
    }
    if (questionStartInFlight.current.has(project.id)) return;

    const projectId = project.id;
    questionStartInFlight.current.add(projectId);
    setStartingQuestionProjectId(projectId);
    setStorageNotice("");
    try {
      const updated = await startGeoQuestionRecommendation(project);
      commitProject(updated);
      setActiveStage("question_recommendation");
    } catch (error) {
      setStorageNotice(`GEO 问题生成未能启动：${errorMessage(error)}`);
    } finally {
      questionStartInFlight.current.delete(projectId);
      setStartingQuestionProjectId((current) =>
        current === projectId ? undefined : current,
      );
    }
  };

  const selectQuestion = (question: GeoQuestion) => {
    if (activeQuestionSelectionLocked) {
      setStorageNotice(
        activeProject?.monitoring?.runId
          ? "本次监控范围已经确认，不能再更换问题。"
          : "当前问题已有待核对的支付订单，请先完成订单处理。",
      );
      return;
    }
    if (
      !activeProject ||
      !question.selectable ||
      question.category === "industry_ranking"
    )
      return;
    setPendingQuestion(question);
  };

  const createCustomQuestion = async (
    questionText: string,
    signal?: AbortSignal,
  ) => {
    if (!activeProject) throw new Error("当前项目不可用，请刷新后重试。");
    const operationProject = activeProject;
    if (activeQuestionSelectionLocked) {
      throw new Error(
        activeProject.monitoring?.runId
          ? "本次监控范围已经确认，不能再创建或更换问题。"
          : "当前问题已有待核对的支付订单，请先完成订单处理。",
      );
    }
    if (isGeoStylePreviewProject(activeProject)) {
      if (looksLikeIndustryRankingQuestion(questionText)) {
        throw new Error(
          "该问题属于行业排名或品牌推荐方向，请选择其他非行业排名类问题。",
        );
      }
      const companyName =
        activeProject.knowledgeBase?.companyName || activeProject.title;
      if (!explicitlyReferencesProjectCompany(questionText, companyName)) {
        throw new Error(
          `该问题与「${companyName}」没有明确关系，请重新输入与当前企业相关的非行业排名类问题。`,
        );
      }
      const normalized = `${questionText.trim().replace(/[?？]+$/, "")}？`;
      const question: GeoQuestion = {
        id: `custom-preview-${Date.now()}`,
        category: "product_scenario",
        question: normalized,
        rationale: "您自定义的 GEO 优化问题",
        evidenceRefs: [],
        selectable: true,
      };
      commitProject({
        ...activeProject,
        questions: [
          ...activeProject.questions.filter(
            (item) => !item.id.startsWith("custom-preview-"),
          ),
          question,
        ],
        updatedAt: new Date().toISOString(),
      });
      return question;
    }

    const result = await createGeoCustomQuestion(
      operationProject,
      questionText,
      {
        signal,
      },
    );
    try {
      await persistGeoCustomQuestionResultAndAcknowledge(
        result,
        async (nextProject) => {
          if (signal?.aborted) {
            throw (
              signal.reason ?? new DOMException("请求已取消。", "AbortError")
            );
          }
          const saved = await saveGeoProjectObservationIfCurrent(
            nextProject,
            operationProject.remoteToken,
          );
          if (!saved) {
            throw new Error(
              "项目已被删除或已由更新的操作推进，已忽略本次迟到结果。",
            );
          }
        },
        { signal },
      );
    } catch (error) {
      setStorageNotice(
        "问题已验证，但项目令牌尚未持久保存；系统会保留同一请求并在刷新后继续恢复。",
      );
      throw error;
    }
    commitProject(result.project, {
      expectedRemoteToken: operationProject.remoteToken,
      skipPersistence: true,
    });
    return result.question;
  };

  const resumeCustomQuestion = async (signal?: AbortSignal) => {
    if (
      !activeProject ||
      activeQuestionSelectionLocked ||
      isGeoStylePreviewProject(activeProject)
    )
      return undefined;
    const operationProject = activeProject;
    const result = await resumeGeoCustomQuestionValidation(operationProject, {
      signal,
    });
    if (!result) return undefined;
    await persistGeoCustomQuestionResultAndAcknowledge(
      result,
      async (nextProject) => {
        if (signal?.aborted) {
          throw signal.reason ?? new DOMException("请求已取消。", "AbortError");
        }
        const saved = await saveGeoProjectObservationIfCurrent(
          nextProject,
          operationProject.remoteToken,
        );
        if (!saved) {
          throw new Error(
            "项目已被删除或已由更新的操作推进，已忽略本次迟到结果。",
          );
        }
      },
      { signal },
    );
    commitProject(result.project, {
      expectedRemoteToken: operationProject.remoteToken,
      skipPersistence: true,
    });
    return result.question;
  };

  const retryCustomQuestion = async (
    terminalError: unknown,
    signal?: AbortSignal,
  ) => {
    if (!activeProject) throw new Error("当前项目不可用，请刷新后重试。");
    const operationProject = activeProject;
    const result = await retryGeoCustomQuestionValidation(
      operationProject,
      terminalError,
      { signal },
    );
    try {
      await persistGeoCustomQuestionResultAndAcknowledge(
        result,
        async (nextProject) => {
          if (signal?.aborted) {
            throw (
              signal.reason ?? new DOMException("请求已取消。", "AbortError")
            );
          }
          const saved = await saveGeoProjectObservationIfCurrent(
            nextProject,
            operationProject.remoteToken,
          );
          if (!saved) {
            throw new Error(
              "项目已被删除或已由更新的操作推进，已忽略本次迟到结果。",
            );
          }
        },
        { signal },
      );
    } catch (error) {
      setStorageNotice(
        "问题已验证，但项目令牌尚未持久保存；系统会保留同一请求并在刷新后继续恢复。",
      );
      throw error;
    }
    commitProject(result.project, {
      expectedRemoteToken: operationProject.remoteToken,
      skipPersistence: true,
    });
    return result.question;
  };

  const confirmQuestionSelection = () => {
    if (!activeProject || !pendingQuestion) return;
    if (activeQuestionSelectionLocked) {
      setPendingQuestion(undefined);
      setStorageNotice(
        activeProject.monitoring?.runId
          ? "本次监控范围已经确认，不能再更换问题。"
          : "当前问题已有待核对的支付订单，请先完成订单处理。",
      );
      return;
    }
    const question = activeProject.questions.find(
      (item) => item.id === pendingQuestion.id,
    );
    if (
      !question ||
      !question.selectable ||
      question.category === "industry_ranking"
    ) {
      setPendingQuestion(undefined);
      return;
    }
    const updated = {
      ...activeProject,
      selectedQuestionId: question.id,
      selectedPlatformIds: [],
      stage: "monitoring" as const,
      updatedAt: new Date().toISOString(),
    };
    commitProject(updated);
    setPendingQuestion(undefined);
    setActiveStage("monitoring");
  };

  const togglePlatform = (platformId: GeoPlatformId) => {
    if (
      !activeProject ||
      activePendingPayment ||
      activeProject.monitoring?.runId
    )
      return;
    const selected = activeProject.selectedPlatformIds.includes(platformId)
      ? activeProject.selectedPlatformIds.filter((id) => id !== platformId)
      : [...activeProject.selectedPlatformIds, platformId];
    commitProject({
      ...activeProject,
      selectedPlatformIds: selected,
      updatedAt: new Date().toISOString(),
    });
  };

  const openPaymentDialog = () => {
    if (!activeProject) return;
    if (activeProject.monitoring?.runId) {
      setStorageNotice("本次监控范围与付款已确认。");
      return;
    }
    setPaymentPurpose(pendingPayment?.kind ?? "monitoring");
    if (isGeoStylePreviewProject(activeProject)) {
      setPaymentError("");
      setPaymentDialogOpen(true);
      return;
    }
    if (
      !activeProject.selectedQuestionId ||
      activeProject.selectedPlatformIds.length === 0
    ) {
      setStorageNotice("请先选择至少一个需要监控的平台。");
      return;
    }
    if (pendingPayment && pendingPayment.projectId !== activeProject.id) {
      setStorageNotice("另一个项目仍有待确认的支付订单，请先完成该订单。");
      return;
    }
    setPaymentError("");
    setPaymentDialogOpen(true);
  };

  const openServicePaymentDialog = () => {
    if (!activeProject) return;
    if (
      activeProject.assessment?.status !== "ready" ||
      activeProject.optimizationForecast?.status !== "ready" ||
      !activeProject.serviceActivation
    ) {
      setStorageNotice("优化效果评估完成后，才能启动一个月服务。");
      return;
    }
    if (activeProject.serviceActivation.status !== "payment_required") {
      setActiveStage("service_activation");
      const contractFlowIssue = geoServiceContractFlowIssue(
        activeProject.serviceActivation,
      );
      if (contractFlowIssue === "paid_contract_mismatch") {
        setStorageNotice(
          "付款已记录，但合同确认状态需要人工核对；请在开通页联系支持。",
        );
      } else if (contractFlowIssue) {
        setStorageNotice(
          "本次签约申请当前不能继续提交合同码；请在开通页联系支持。",
        );
      } else if (activeProject.serviceActivation.status === "not_started") {
        setStorageNotice(
          "请先提交签约资料，联系管理员完成合同确认并获取合同码。",
        );
      } else if (
        activeProject.serviceActivation.status === "contract_preparing" ||
        activeProject.serviceActivation.status === "signature_required"
      ) {
        setStorageNotice(
          "请联系管理员完成合同确认，并输入管理员提供的合同码。",
        );
      } else if (
        activeProject.serviceActivation.status === "activation_pending"
      ) {
        setStorageNotice("账号已创建，系统正在接入已购问题与知识库。");
      } else if (
        activeProject.serviceActivation.status === "account_setup_required"
      ) {
        setStorageNotice("付款已确认，请先设置企业看板登录账号和密码。");
      }
      return;
    }
    if (pendingPayment && pendingPayment.projectId !== activeProject.id) {
      setStorageNotice("另一个项目仍有待确认的支付订单，请先完成该订单。");
      return;
    }
    setPaymentPurpose(pendingPayment?.kind ?? "service");
    setPaymentError("");
    setPaymentDialogOpen(true);
  };

  const submitServiceContractProfile = async (
    profile: GeoServiceContractProfile,
    contractCode: string,
  ): Promise<void> => {
    if (!activeProject) {
      throw new Error("当前项目不可用，请刷新后重试。");
    }
    if (isGeoStylePreviewProject(activeProject)) {
      throw new Error("当前为预览模式，不会提交真实签约资料。");
    }
    const updated = await submitGeoServiceContractProfile(
      activeProject,
      profile,
      contractCode,
    );
    commitProject(updated);
    setActiveStage("service_activation");
    setStorageNotice("合同已由管理员确认，可以进入付款。");
  };

  const checkServiceContractStatus = async (): Promise<string | void> => {
    if (!activeProject) {
      throw new Error("当前项目不可用，请刷新后重试。");
    }
    if (isGeoStylePreviewProject(activeProject)) {
      throw new Error("当前为预览模式，不会查询真实开通状态。");
    }
    const updated =
      activeProject.serviceActivation?.provisioningVersion === 2
        ? await getGeoServiceProvisioningStatus(activeProject)
        : await getGeoServiceContractStatus(activeProject);
    commitProject(updated);
    if (updated.serviceActivation?.status === "active") {
      return (
        updated.serviceActivation.accountSetupUrl ||
        updated.serviceActivation.workspaceUrl
      );
    }
  };

  const submitServiceAccount = async (
    credentials: GeoServiceAccountCredentials,
  ): Promise<void> => {
    if (!activeProject) {
      throw new Error("当前项目不可用，请刷新后重试。");
    }
    if (isGeoStylePreviewProject(activeProject)) {
      throw new Error("当前为预览模式，不会创建真实账号。");
    }
    if (
      activeProject.serviceActivation?.status !== "account_setup_required" ||
      activeProject.serviceActivation.accountMode === "bind_existing"
    ) {
      throw new Error("当前服务尚未进入账号设置阶段，请刷新状态后重试。");
    }
    const updated = await createGeoServiceAccount(activeProject, credentials);
    commitProject(updated);
    setActiveStage("service_activation");
    setStorageNotice("账号已创建，系统正在接入已购问题与知识库。");
  };

  const startPaymentCheckout = async (method: GeoPaymentMethod) => {
    if (activeProject && isGeoStylePreviewProject(activeProject)) {
      setPaymentError("本地样式预览不会创建付款订单。");
      return;
    }
    if (!activeProject || !activeProject.selectedQuestionId || pendingPayment)
      return;
    if (paymentPurpose === "monitoring" && activeProject.monitoring?.runId)
      return;

    const project = activeProject;
    const questionId = project.selectedQuestionId;
    if (!questionId) return;
    if (
      paymentPurpose === "monitoring" &&
      project.selectedPlatformIds.length === 0
    )
      return;
    const platformIds = [...project.selectedPlatformIds];
    const paymentWindow = preparePaymentWindow();
    setPaymentCreating(true);
    setPaymentError("");
    try {
      let checkout: GeoPaymentCheckout | GeoServicePaymentCheckout;
      if (paymentPurpose === "service") {
        const serviceCheckout = await createGeoServicePaymentCheckout(
          project,
          method,
        );
        checkout = serviceCheckout;
        setPendingPayment({
          kind: "service",
          projectId: project.id,
          projectToken: project.remoteToken,
          questionId,
          category: serviceCheckout.category,
          checkout: serviceCheckout,
          status: "pending",
          statusMessage: "请在新窗口完成支付",
        });
      } else {
        const monitoringCheckout = await createGeoPaymentCheckout(project, {
          questionId,
          platformIds,
          method,
        });
        checkout = monitoringCheckout;
        setPendingPayment({
          kind: "monitoring",
          projectId: project.id,
          projectToken: project.remoteToken,
          questionId,
          platformIds,
          checkout: monitoringCheckout,
          status: "pending",
          statusMessage: "请在新窗口完成支付",
        });
      }
      if (paymentWindow) {
        submitPaymentCheckout(checkout, paymentWindow.target);
      } else {
        setPaymentError(
          "浏览器阻止了收银台弹窗。订单已安全创建，请点击“重新打开收银台”。",
        );
      }
    } catch (error) {
      paymentWindow?.popup.close();
      setPaymentError(errorMessage(error));
    } finally {
      setPaymentCreating(false);
    }
  };

  const reopenPaymentCheckout = () => {
    if (!activePendingPayment) return;
    if (isGeoCheckoutExpired(activePendingPayment.checkout)) {
      setPaymentError(
        "收银台展示时间已结束，不能重新提交该订单；请核对最终支付结果。",
      );
      return;
    }
    setPaymentError("");
    const paymentWindow = preparePaymentWindow();
    if (!paymentWindow) {
      setPaymentError("浏览器仍在阻止收银台弹窗，请允许本站打开弹窗后重试。");
      return;
    }
    submitPaymentCheckout(activePendingPayment.checkout, paymentWindow.target);
  };

  const switchPaymentCheckout = async (method: GeoPaymentMethod) => {
    const payment = activePendingPayment;
    if (
      !activeProject ||
      !payment ||
      payment.kind !== "monitoring" ||
      payment.status !== "pending" ||
      paymentCreating
    ) {
      return;
    }
    if (isGeoCheckoutExpired(payment.checkout)) {
      setPaymentError("当前收银台已过期，请先核对最终支付结果。");
      return;
    }
    if (payment.checkout.fields.type === method) {
      reopenPaymentCheckout();
      return;
    }

    const project = activeProject;
    const authorization = payment.checkout.authorization;
    const paymentWindow = preparePaymentWindow();
    setPaymentCreating(true);
    setPaymentError("");
    try {
      const checkout = await switchGeoPaymentCheckout(project, {
        questionId: payment.questionId,
        platformIds: [...payment.platformIds],
        authorization,
        method,
      });
      let checkoutAccepted = false;
      flushSync(() => {
        setPendingPayment((current) => {
          if (
            current?.kind !== "monitoring" ||
            current.status !== "pending" ||
            current.checkout.authorization !== authorization
          ) {
            return current;
          }
          checkoutAccepted = true;
          return {
            ...current,
            checkout,
            statusMessage: `已切换为${method === "wxpay" ? "微信支付" : "支付宝"}，请在新窗口完成付款`,
          };
        });
      });
      if (!checkoutAccepted) {
        paymentWindow?.popup.close();
        setPaymentCheckNonce((value) => value + 1);
        return;
      }
      if (paymentWindow) {
        submitPaymentCheckout(checkout, paymentWindow.target);
      } else {
        setPaymentError(
          "支付方式已切换，但浏览器阻止了收银台弹窗。请点击“重新打开收银台”。",
        );
      }
    } catch (error) {
      paymentWindow?.popup.close();
      setPaymentError(errorMessage(error));
    } finally {
      setPaymentCreating(false);
    }
  };

  const recheckPaymentStatus = () => {
    setPendingPayment((current) => {
      if (
        current?.status !== "reconciliation_required" &&
        current?.status !== "activation_support_required"
      ) {
        return current;
      }
      return {
        ...current,
        status:
          current.status === "activation_support_required" ? "paid" : "pending",
        statusMessage:
          current.status === "activation_support_required"
            ? "付款已确认，正在重新尝试启动后续任务"
            : "正在重新核对支付平台的最终结果",
      };
    });
    setPaymentError("");
    setPaymentCheckNonce((value) => value + 1);
  };

  useEffect(() => {
    if (
      !projectsHydrated ||
      !pendingPayment ||
      pendingPayment.status === "reconciliation_required" ||
      pendingPayment.status === "activation_support_required"
    )
      return;
    const payment = pendingPayment;
    const project =
      projects.find((item) => item.id === payment.projectId) ??
      pendingPaymentRecoveryProject(payment);
    if (!project || isGeoStylePreviewProject(project)) return;

    let cancelled = false;
    let checking = false;
    let paymentConfirmed = payment.status === "paid";
    let timer: number | undefined;
    const schedule = (delay = GEO_PAYMENT_POLL_INTERVAL_MS) => {
      if (cancelled) return;
      timer = window.setTimeout(checkStatus, delay);
    };
    const checkStatus = async () => {
      if (cancelled || checking) return;
      checking = true;
      try {
        const status =
          payment.kind === "service"
            ? await getGeoServicePaymentStatus(
                project,
                payment.checkout.authorization,
              )
            : await getGeoPaymentStatus(project, {
                questionId: payment.questionId,
                platformIds: payment.platformIds,
                authorization: payment.checkout.authorization,
              });
        if (cancelled) return;
        if (
          status.orderId !== payment.checkout.orderId ||
          status.amountFen !== payment.checkout.amountFen
        ) {
          const mismatchMessage =
            "支付状态与原订单不一致，已停止自动处理；请联系技术支持并提供订单号。";
          setPendingPayment((current) =>
            current?.checkout.authorization === payment.checkout.authorization
              ? {
                  ...current,
                  status: "reconciliation_required",
                  statusMessage: mismatchMessage,
                  lastCheckedAt: new Date().toISOString(),
                }
              : current,
          );
          setPaymentError(mismatchMessage);
          setStorageNotice(mismatchMessage);
          return;
        }
        if (status.status === "review_required") {
          const reviewMessage =
            status.message ||
            "付款已安全入账，但超过自动履约窗口，需要人工核对；请勿重复支付。";
          paymentConfirmed = true;
          setPendingPayment((current) =>
            current?.checkout.authorization === payment.checkout.authorization
              ? {
                  ...current,
                  status: "activation_support_required",
                  statusMessage: reviewMessage,
                  lastCheckedAt: new Date().toISOString(),
                }
              : current,
          );
          setPaymentError(reviewMessage);
          setStorageNotice(reviewMessage);
          return;
        }
        if (status.status === "paid") paymentConfirmed = true;
        const pendingStatus = status.status === "paid" ? "paid" : "pending";
        setPendingPayment((current) =>
          current?.checkout.authorization === payment.checkout.authorization
            ? {
                ...current,
                status: pendingStatus,
                statusMessage:
                  status.status === "paid"
                    ? payment.kind === "service"
                      ? purchaseIntent
                        ? "付款已确认，正在绑定已有账号"
                        : "付款已确认，正在进入账号设置"
                      : "付款已确认，正在启动问题监控"
                    : status.message || "等待支付完成",
                lastCheckedAt: new Date().toISOString(),
              }
            : current,
        );
        setPaymentError("");
        if (status.status !== "paid") {
          const checkoutExpired = isGeoCheckoutExpired(payment.checkout);
          if (checkoutExpired) {
            const expiresAt = Date.parse(payment.checkout.expiresAt);
            if (
              Number.isFinite(expiresAt) &&
              Date.now() >= expiresAt + GEO_PAYMENT_AUTOMATIC_RECONCILIATION_MS
            ) {
              const reconciliationMessage =
                "自动核对窗口内未发现已完成付款。订单已保留，请联系技术支持人工核对；在确认前请勿重复支付。";
              setPendingPayment((current) =>
                current?.checkout.authorization ===
                payment.checkout.authorization
                  ? {
                      ...current,
                      status: "reconciliation_required",
                      statusMessage: reconciliationMessage,
                      lastCheckedAt: new Date().toISOString(),
                    }
                  : current,
              );
              setStorageNotice(reconciliationMessage);
              return;
            }
            setPendingPayment((current) =>
              current?.checkout.authorization === payment.checkout.authorization
                ? {
                    ...current,
                    statusMessage: GEO_PAYMENT_RECONCILIATION_MESSAGE,
                  }
                : current,
            );
          }
          schedule(
            checkoutExpired
              ? GEO_PAYMENT_RECONCILIATION_POLL_INTERVAL_MS
              : GEO_PAYMENT_POLL_INTERVAL_MS,
          );
          return;
        }

        const orderId = payment.checkout.orderId;
        if (paymentMonitorStartInFlight.current.has(orderId)) {
          schedule();
          return;
        }
        paymentMonitorStartInFlight.current.add(orderId);
        try {
          const updated =
            payment.kind === "service"
              ? await startGeoService(
                  project,
                  payment.checkout.authorization,
                  purchaseIntent,
                )
              : await startGeoMonitoring(project, {
                  questionId: payment.questionId,
                  platformIds: payment.platformIds,
                  paymentAuthorization: payment.checkout.authorization,
                });
          if (cancelled) return;
          commitProject(updated);
          setPendingPayment(undefined);
          setPaymentDialogOpen(false);
          if (payment.kind === "service") {
            setPurchaseIntent(undefined);
            const url = clearGeoPurchaseIntentFromUrl(window.location.href);
            window.history.replaceState(window.history.state, "", url);
            setActiveStage("service_activation");
            setStorageNotice(geoPaidStartNotice(updated, payment.kind));
          } else {
            setActiveStage("monitoring");
            setStorageNotice(geoPaidStartNotice(updated, payment.kind));
          }
        } catch (error) {
          if (!cancelled) {
            const terminalStart =
              error instanceof GeoApiError &&
              ([400, 401, 402, 403, 409, 410].includes(error.status) ||
                error.code === "PAYMENT_QUERY_REJECTED");
            const message = terminalStart
              ? `付款已确认，但${payment.kind === "service" ? "服务" : "监控任务"}未能自动启动：${errorMessage(error)}。请联系技术支持并提供订单号。`
              : `付款已确认，但${payment.kind === "service" ? "服务" : "监控任务"}暂未启动：${errorMessage(error)}（将自动重试）`;
            if (terminalStart) {
              setPendingPayment((current) =>
                current?.checkout.authorization ===
                payment.checkout.authorization
                  ? {
                      ...current,
                      status: "activation_support_required",
                      statusMessage: message,
                      lastCheckedAt: new Date().toISOString(),
                    }
                  : current,
              );
              setStorageNotice(message);
            }
            setPaymentError(message);
            if (!terminalStart) schedule();
          }
        } finally {
          paymentMonitorStartInFlight.current.delete(orderId);
        }
      } catch (error) {
        if (cancelled) return;
        const recoveryStatus = geoPaymentRecoveryStatusForError(
          error,
          paymentConfirmed,
        );
        const terminal = recoveryStatus !== undefined;
        if (
          error instanceof GeoApiError &&
          (error.status === 410 ||
            error.code === "PAYMENT_RECONCILIATION_EXPIRED")
        ) {
          const message = paymentConfirmed
            ? `付款已确认，但自动启动窗口已经结束：${errorMessage(error)}。请联系技术支持并提供订单号。`
            : errorMessage(error);
          setPendingPayment((current) =>
            current?.checkout.authorization === payment.checkout.authorization
              ? {
                  ...current,
                  status: paymentConfirmed
                    ? "activation_support_required"
                    : "reconciliation_required",
                  statusMessage: message,
                  lastCheckedAt: new Date().toISOString(),
                }
              : current,
          );
          setStorageNotice(message);
        } else if (recoveryStatus) {
          const message = paymentConfirmed
            ? `付款已确认，但后续处理需要人工支持：${errorMessage(error)}。请联系技术支持并提供订单号。`
            : `${errorMessage(error)}。订单已保留，请勿重复支付；您可以再次核对或联系技术支持。`;
          setPendingPayment((current) =>
            current?.checkout.authorization === payment.checkout.authorization
              ? {
                  ...current,
                  status: recoveryStatus,
                  statusMessage: message,
                  lastCheckedAt: new Date().toISOString(),
                }
              : current,
          );
          setStorageNotice(message);
        }
        setPaymentError(
          terminal
            ? errorMessage(error)
            : `支付状态暂时无法更新：${errorMessage(error)}（将自动重试）`,
        );
        if (!terminal) schedule();
      } finally {
        checking = false;
      }
    };

    schedule(1_200);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [
    pendingPayment?.checkout.authorization,
    paymentCheckNonce,
    projectsHydrated,
    projects.length,
    purchaseIntent,
  ]);

  const downloadArchive = async () => {
    if (!activeProject) return;
    if (isGeoStylePreviewProject(activeProject)) {
      setStorageNotice("当前为本地样式预览，不提供示例知识库下载。");
      return;
    }
    setStorageNotice("");
    try {
      const stored = await getGeoArchive(activeProject.id).catch(
        () => undefined,
      );
      const downloaded = stored
        ? undefined
        : await downloadGeoArchive(activeProject);
      const archive =
        stored ??
        ({
          projectId: activeProject.id,
          ...downloaded!,
          savedAt: new Date().toISOString(),
        } as const);
      if (!stored) {
        await saveGeoArchive(archive).catch(() =>
          setStorageNotice(
            "ZIP 已下载，但浏览器未能保存本地副本；请妥善保管本次下载文件。",
          ),
        );
      }
      const url = URL.createObjectURL(archive.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = archive.filename;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setStorageNotice(errorMessage(error));
    }
  };

  const blockUnsafeProjectDeletion = (project: GeoProject) => {
    const paymentProtected = isGeoProjectPaymentProtected(
      project.id,
      pendingPayment?.projectId,
    );
    const fulfillmentProtected = isGeoProjectFulfillmentProtected(project);
    if (paymentProtected || fulfillmentProtected) {
      setProjectMenuOpen(false);
      setDeleteTarget(undefined);
      if (paymentProtected) {
        setPaymentPurpose(pendingPayment?.kind ?? "monitoring");
        setPaymentDialogOpen(true);
        setStorageNotice(
          pendingPayment?.status === "paid" ||
            pendingPayment?.status === "activation_support_required"
            ? "该项目的付款已确认，后续任务仍在处理；为避免丢失履约记录，当前不能删除项目。"
            : "该项目仍有待支付或待核对订单；为避免付款后无法自动履约，当前不能删除项目。",
        );
      } else {
        setStorageNotice(
          project.serviceActivation &&
            project.serviceActivation.status !== "active"
            ? "该项目的已购服务尚未完成开通或仍需售后处理；为避免丢失履约记录，当前不能删除项目。"
            : "该项目的已付款监控尚未完整交付；为避免丢失采集与售后记录，当前不能删除项目。",
        );
      }
      return true;
    }
    if (
      isGeoDraftProject(project) &&
      draftAnalysisControllers.current.has(project.id)
    ) {
      setProjectMenuOpen(false);
      setDeleteTarget(undefined);
      setStorageNotice(
        "企业资料正在上传并创建远端项目，完成或失败前不能删除该草稿。",
      );
      return true;
    }
    return false;
  };

  const openDeleteDialog = (project: GeoProject) => {
    if (isGeoStylePreviewProject(project)) {
      setProjectMenuOpen(false);
      setStorageNotice(
        "本地样式预览项目无需删除；移除网址中的预览参数即可退出。",
      );
      return;
    }
    if (blockUnsafeProjectDeletion(project)) return;
    setDeleteTarget(project);
    setDeleteError("");
    setDeleteRemoteCompleted(false);
    setDeleteSafetyBlocked(false);
  };

  const removeDraftFromMemory = (project: GeoProject) => {
    if (blockUnsafeProjectDeletion(project)) return;
    pendingDrafts.current.delete(project.id);
    const remaining = projects.filter((item) => item.id !== project.id);
    setProjects(remaining);
    if (activeProjectId === project.id) {
      setActiveProjectId(remaining[0]?.id);
      if (remaining[0]) setActiveStage(projectDefaultStage(remaining[0]));
      else setWorkbenchOpen(false);
    }
    setProjectMenuOpen(false);
    setDeleteTarget(undefined);
    setDeleteError("");
    setDeleteRemoteCompleted(false);
    setDeleteSafetyBlocked(false);
    setStorageNotice("已删除当前页面内存中的待启动草稿；未调用远端删除接口。");
  };

  const removeProjectFromDevice = async (project: GeoProject) => {
    if (
      isGeoProjectPaymentProtected(project.id, pendingPayment?.projectId) ||
      isGeoProjectFulfillmentProtected(project)
    ) {
      throw new Error(
        "该项目仍有待处理支付订单或未完成履约，完成核对与交付前不能删除。",
      );
    }
    await removeGeoProject(project.id);
    clearPendingGeoCustomQuestionValidation(project.id);
    setProjects((current) => current.filter((item) => item.id !== project.id));
    if (activeProjectId === project.id) {
      const next = projects.find((item) => item.id !== project.id);
      setActiveProjectId(next?.id);
      if (next) setActiveStage(projectDefaultStage(next));
      else {
        setWorkbenchOpen(false);
      }
    }
    setProjectMenuOpen(false);
    setDeleteTarget(undefined);
    setDeleteError("");
    setDeleteRemoteCompleted(false);
    setDeleteSafetyBlocked(false);
  };

  const confirmDeleteProject = async () => {
    const project = deleteTarget;
    if (!project || deleteAction) return;
    if (blockUnsafeProjectDeletion(project)) return;
    if (isGeoDraftProject(project)) {
      removeDraftFromMemory(project);
      return;
    }
    if (deleteRemoteCompleted) {
      setDeleteAction("local");
      setDeleteError("");
      try {
        await removeProjectFromDevice(project);
        setStorageNotice("远端资源已清理，本机项目记录与本地 ZIP 也已删除。");
      } catch (error) {
        setDeleteError(`本机记录删除失败：${errorMessage(error)}`);
      } finally {
        setDeleteAction(undefined);
      }
      return;
    }

    setDeleteAction("remote");
    setDeleteError("");
    setDeleteSafetyBlocked(false);
    setStorageNotice("");
    try {
      await deleteRemoteGeoProject(project);
      setDeleteRemoteCompleted(true);
    } catch (error) {
      if (isGeoDeleteProtectionError(error)) {
        const message =
          error instanceof GeoApiError &&
          error.code === "PROJECT_ORDER_DELETE_BLOCKED"
            ? "该项目仍有未完成的支付核对或服务履约，当前不能删除。本机记录和 ZIP 已保留；请刷新订单状态、继续完成流程，或联系技术支持。"
            : "订单保护服务暂时无法核验项目是否可删除，系统已安全阻止删除。本机记录和 ZIP 已保留；请稍后刷新重试，切勿仅删除本机记录。";
        setDeleteSafetyBlocked(true);
        setDeleteError(message);
        setStorageNotice(message);
      } else {
        setDeleteError(
          `远端清理未完成：${errorMessage(error)}。本机记录和 ZIP 仍保留；您可以重试，或仅删除本机记录。`,
        );
      }
      setDeleteAction(undefined);
      return;
    }

    try {
      await removeProjectFromDevice(project);
      setStorageNotice("项目的远端资源、本机记录与本地 ZIP 均已删除。");
    } catch (error) {
      setDeleteError(
        `远端资源已清理，但本机记录删除失败：${errorMessage(error)}。请重试删除本机记录。`,
      );
    } finally {
      setDeleteAction(undefined);
    }
  };

  const deleteLocalProjectOnly = async () => {
    const project = deleteTarget;
    if (
      !project ||
      deleteAction ||
      deleteRemoteCompleted ||
      deleteSafetyBlocked
    )
      return;
    if (blockUnsafeProjectDeletion(project)) return;
    if (isGeoDraftProject(project)) {
      removeDraftFromMemory(project);
      return;
    }
    setDeleteAction("local");
    setDeleteError("");
    try {
      await removeProjectFromDevice(project);
      setStorageNotice(
        "已仅删除本机项目记录和本地 ZIP；远端资源未确认删除，可能仍然保留。",
      );
    } catch (error) {
      setDeleteError(`本机记录删除失败：${errorMessage(error)}`);
    } finally {
      setDeleteAction(undefined);
    }
  };

  const beginMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (
      compactViewport ||
      maximized ||
      (event.target as HTMLElement).closest("button, select, a, input")
    )
      return;
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragOperation.current = {
      mode: "move",
      startX: event.clientX,
      startY: event.clientY,
      geometry,
    };
  };

  const moveWithKeyboard = (event: ReactKeyboardEvent<HTMLElement>) => {
    const key = event.key;
    if (
      event.target !== event.currentTarget ||
      compactViewport ||
      maximized ||
      !isGeoWorkbenchMoveKey(key)
    )
      return;
    event.preventDefault();
    setGeometry((current) =>
      moveGeoWorkbenchGeometry(current, key, event.shiftKey, {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
  };

  const beginResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (compactViewport || maximized) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragOperation.current = {
      mode: "resize",
      startX: event.clientX,
      startY: event.clientY,
      geometry,
    };
  };

  const resizeWithKeyboard = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (compactViewport || maximized) return;
    const step = event.shiftKey ? 48 : 16;
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    setGeometry((current) => ({
      ...current,
      width:
        event.key === "ArrowLeft" || event.key === "ArrowRight"
          ? Math.max(
              720,
              Math.min(
                current.width + (event.key === "ArrowRight" ? step : -step),
                window.innerWidth - current.x - 8,
              ),
            )
          : current.width,
      height:
        event.key === "ArrowUp" || event.key === "ArrowDown"
          ? Math.max(
              560,
              Math.min(
                current.height + (event.key === "ArrowDown" ? step : -step),
                window.innerHeight - current.y - 8,
              ),
            )
          : current.height,
    }));
  };

  const handleWorkbenchKeyDown = (
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      setWorkbenchOpen(false);
      return;
    }
    if (
      event.key !== "Tab" ||
      (!compactViewport && !maximized) ||
      event.defaultPrevented
    )
      return;

    const workbench = workbenchRef.current;
    if (!workbench) return;
    const focusable = Array.from(
      workbench.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(
      (element) =>
        element.getAttribute("aria-hidden") !== "true" &&
        !element.closest('[aria-hidden="true"]'),
    );

    if (focusable.length === 0) {
      event.preventDefault();
      workbench.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement;
    if (
      activeElement === workbench ||
      (event.shiftKey && activeElement === first) ||
      (!event.shiftKey && activeElement === last)
    ) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  };

  const workbenchStyle = compactViewport
    ? undefined
    : maximized
      ? {
          left: 12,
          top: 12,
          width: "calc(100vw - 24px)",
          height: "calc(100vh - 24px)",
        }
      : {
          left: geometry.x,
          top: geometry.y,
          width: geometry.width,
          height: geometry.height,
        };

  return (
    <>
      <section
        id="geo-builder"
        className="geo-launcher-section"
        aria-labelledby="geo-builder-title"
      >
        <div className="container">
          <div className="geo-launcher-heading">
            <span className="geo-eyebrow">
              <Sparkles size={13} /> FRON­TMIND GEO LAB
            </span>
            <h2 id="geo-builder-title">
              与 FrontMind 一起，构建科研驱动的企业 GEO 基建
            </h2>
            <p>
              从企业事实到可监控问题，一次完成高覆盖知识采集与 GEO 机会识别。
            </p>
          </div>

          <div
            className={`geo-launcher ${isDraggingFile ? "is-dragging" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDraggingFile(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (
                !event.currentTarget.contains(
                  event.relatedTarget as Node | null,
                )
              )
                setIsDraggingFile(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setIsDraggingFile(false);
              addFiles(event.dataTransfer.files);
            }}
          >
            <button
              type="button"
              className="geo-attach-button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="上传企业宣传册或资料"
            >
              <Paperclip size={19} />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="sr-only"
              accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.png,.jpg,.jpeg,.webp,.zip"
              onChange={(event) => {
                if (event.target.files) addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <input
              value={draftInput}
              onChange={(event) => {
                setDraftInput(event.target.value);
                setDraftError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing)
                  requestBuild();
              }}
              className="geo-launcher-input"
              placeholder="输入您的企业名称/官网/宣传册"
              aria-label="企业名称、官网或宣传册说明"
            />
            <span className="geo-drop-hint">
              <UploadCloud size={15} /> 支持拖入文件
            </span>
            <button
              type="button"
              className="geo-primary-button"
              onClick={requestBuild}
            >
              开始构建 <ArrowRight size={17} />
            </button>
          </div>

          {(draftFiles.length > 0 || draftError) && (
            <div className="geo-launcher-meta" aria-live="polite">
              <div className="geo-file-list">
                {draftFiles.map((file, index) => (
                  <span
                    key={`${file.name}-${file.lastModified}`}
                    className="geo-file-chip"
                  >
                    <FileText size={13} />
                    <span>{file.name}</span>
                    <small>{formatFileSize(file.size)}</small>
                    <button
                      type="button"
                      onClick={() =>
                        setDraftFiles((current) =>
                          current.filter((_, itemIndex) => index !== itemIndex),
                        )
                      }
                      aria-label={`移除 ${file.name}`}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              {draftError && (
                <p className="geo-inline-error">
                  <CircleAlert size={14} /> {draftError}
                </p>
              )}
            </div>
          )}

          {projects.length > 0 && (
            <button
              type="button"
              className="geo-continue-button"
              onClick={() => openStoredProject(projects[0])}
            >
              <FolderKanban size={15} />
              继续项目：{projectDisplayTitle(projects[0])}
              {!isGeoStylePreviewProject(projects[0]) && (
                <span>{formatDate(projects[0].updatedAt)}</span>
              )}
            </button>
          )}
          {storageNotice && !workbenchOpen && (
            <div className="geo-launcher-notice" role="status">
              <CircleAlert size={15} />
              <span>{storageNotice}</span>
              <button
                type="button"
                onClick={() => setStorageNotice("")}
                aria-label="关闭提示"
              >
                <X size={13} />
              </button>
            </div>
          )}
        </div>
      </section>

      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => !creating && setInviteOpen(open)}
      >
        <DialogContent
          className="geo-dialog"
          overlayClassName="geo-dialog-overlay"
          showCloseButton={!creating}
        >
          <DialogHeader>
            <span className="geo-dialog-mark">
              <ShieldCheck size={19} />
            </span>
            <DialogTitle className="geo-dialog-title">请输入邀请码</DialogTitle>
            <DialogDescription className="geo-dialog-description">
              企业知识基建目前采用邀请制。验证通过后只会打开工作台，资料将在您点击“启动企业分析”后上传。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInviteSubmit} className="geo-invite-form">
            <label htmlFor="geo-invite-code">邀请码</label>
            <input
              id="geo-invite-code"
              type="password"
              autoFocus
              autoComplete="one-time-code"
              value={inviteCode}
              disabled={creating}
              onChange={(event) => {
                setInviteCode(event.target.value);
                setInviteError("");
              }}
              placeholder="请输入邀请码"
            />
            {inviteError && (
              <p className="geo-dialog-error" role="alert">
                <CircleAlert size={14} /> {inviteError}
              </p>
            )}
            <button
              type="submit"
              className="geo-primary-button geo-dialog-submit"
              disabled={creating}
            >
              {creating ? (
                <>
                  <span className="geo-spinner" /> 正在验证邀请码
                </>
              ) : (
                <>
                  验证并打开工作台 <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={contactOpen} onOpenChange={setContactOpen}>
        <DialogContent
          className="geo-dialog geo-contact-dialog"
          overlayClassName="geo-dialog-overlay"
        >
          <DialogHeader>
            <span className="geo-dialog-mark">
              <Sparkles size={19} />
            </span>
            <DialogTitle className="geo-dialog-title">
              联系技术人员对接
            </DialogTitle>
            <DialogDescription className="geo-dialog-description">
              扫描企业微信二维码，说明您的行业与目标关键词，我们将安排技术人员进行专项评估。
            </DialogDescription>
          </DialogHeader>
          <div className="geo-qr-frame">
            <img
              src={FRONTMIND_WECHAT_QR_PATH}
              alt="FrontMind 技术人员企业微信二维码"
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingQuestion)}
        onOpenChange={(open) => !open && setPendingQuestion(undefined)}
      >
        <DialogContent
          className="geo-dialog geo-question-confirm-dialog"
          overlayClassName="geo-dialog-overlay"
          showCloseButton={false}
        >
          <DialogHeader>
            <span className="geo-dialog-mark">
              <Check size={19} />
            </span>
            <DialogTitle className="geo-dialog-title">
              确认本次 GEO 优化问题
            </DialogTitle>
            <DialogDescription className="geo-dialog-description">
              后续平台监控与现状评估将围绕这一个问题展开，请确认选择无误。
            </DialogDescription>
          </DialogHeader>
          <div className="geo-question-confirm-card">
            <span>您选择的问题</span>
            <strong>“{pendingQuestion?.question}”</strong>
            <small>
              {
                GEO_QUESTION_CATEGORIES.find(
                  (category) => category.id === pendingQuestion?.category,
                )?.title
              }
            </small>
          </div>
          <DialogFooter className="geo-dialog-actions">
            <button
              type="button"
              className="geo-secondary-button"
              onClick={() => setPendingQuestion(undefined)}
            >
              返回修改
            </button>
            <button
              type="button"
              className="geo-primary-button"
              onClick={confirmQuestionSelection}
            >
              确认并继续 <ArrowRight size={16} />
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PaymentDialog
        open={paymentDialogOpen}
        project={paymentDialogProject}
        pending={pendingPayment}
        purpose={pendingPayment?.kind ?? paymentPurpose}
        creating={paymentCreating}
        error={paymentError}
        onOpenChange={setPaymentDialogOpen}
        onStart={startPaymentCheckout}
        onSwitch={switchPaymentCheckout}
        onReopen={reopenPaymentCheckout}
        onCheck={recheckPaymentStatus}
        onContact={() => {
          setPaymentDialogOpen(false);
          setContactOpen(true);
        }}
      />

      {activeProject && (
        <ExecutionLogDialog
          open={executionLogOpen}
          project={activeProject}
          refreshing={Boolean(refreshingProjectIds[activeProject.id])}
          onOpenChange={setExecutionLogOpen}
          onRefresh={refreshActiveProject}
        />
      )}

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deleteAction) {
            setDeleteTarget(undefined);
            setDeleteError("");
            setDeleteRemoteCompleted(false);
            setDeleteSafetyBlocked(false);
          }
        }}
      >
        <DialogContent
          className="geo-dialog"
          overlayClassName="geo-dialog-overlay"
          showCloseButton={false}
        >
          <DialogHeader>
            <span className="geo-dialog-mark danger">
              <Trash2 size={18} />
            </span>
            <DialogTitle className="geo-dialog-title">
              {deleteTarget && isGeoDraftProject(deleteTarget)
                ? "删除待启动草稿？"
                : deleteSafetyBlocked
                  ? "当前不能删除项目"
                  : deleteRemoteCompleted
                    ? "删除本机项目记录？"
                    : "删除项目记录？"}
            </DialogTitle>
            <DialogDescription className="geo-dialog-description">
              {deleteTarget && isGeoDraftProject(deleteTarget) ? (
                <>
                  “{deleteTarget.title}
                  ”只存在于当前页面内存，删除不会调用远端接口，也不会产生费用。
                </>
              ) : deleteRemoteCompleted ? (
                <>
                  “{deleteTarget?.title}
                  ”的远端资源已清理。现在将删除本机项目记录与本地知识库
                  ZIP，此操作无法撤销。
                </>
              ) : deleteSafetyBlocked ? (
                <>
                  订单与履约记录仍受保护。本机项目记录和知识库 ZIP
                  会继续保留，避免丢失付款恢复与售后入口。
                </>
              ) : (
                <>
                  将先清理“{deleteTarget?.title}
                  ”的远端任务和文件，再删除本机项目记录与本地知识库 ZIP。
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p className="geo-delete-error" role="alert">
              <CircleAlert size={15} />
              <span>{deleteError}</span>
            </p>
          )}
          <DialogFooter className="geo-dialog-actions">
            <button
              type="button"
              className="geo-secondary-button"
              onClick={() => {
                setDeleteTarget(undefined);
                setDeleteError("");
                setDeleteRemoteCompleted(false);
                setDeleteSafetyBlocked(false);
              }}
              disabled={Boolean(deleteAction)}
            >
              取消
            </button>
            {deleteError && !deleteRemoteCompleted && !deleteSafetyBlocked && (
              <button
                type="button"
                className="geo-local-delete-button"
                onClick={deleteLocalProjectOnly}
                disabled={Boolean(deleteAction)}
              >
                {deleteAction === "local"
                  ? "正在删除本机记录…"
                  : "仅删除本机记录"}
              </button>
            )}
            <button
              type="button"
              className="geo-danger-button"
              onClick={confirmDeleteProject}
              disabled={Boolean(deleteAction)}
            >
              {deleteAction === "remote"
                ? "正在清理远端…"
                : deleteAction === "local"
                  ? "正在删除本机记录…"
                  : deleteRemoteCompleted
                    ? "重试删除本机记录"
                    : deleteError
                      ? deleteSafetyBlocked
                        ? "刷新后重试核验"
                        : "重试删除项目"
                      : deleteTarget && isGeoDraftProject(deleteTarget)
                        ? "删除草稿"
                        : "删除项目"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {typeof document !== "undefined" &&
        workbenchOpen &&
        activeProject &&
        createPortal(
          minimized ? (
            <button
              ref={dockRef}
              type="button"
              className="geo-workbench-dock"
              onClick={() => setMinimized(false)}
            >
              <span
                className={`geo-dock-indicator status-${activeProject.status}`}
              />
              <span>
                <strong>{projectDisplayTitle(activeProject)}</strong>
                <small>
                  {activeProject.progressLabel || "FrontMind GEO 工作台"}
                </small>
              </span>
              <Maximize2 size={16} />
            </button>
          ) : (
            <div
              ref={workbenchRef}
              className={`geo-workbench ${maximized ? "is-maximized" : ""}`}
              style={workbenchStyle}
              role="dialog"
              aria-modal={compactViewport || maximized ? true : undefined}
              aria-labelledby="geo-workbench-dialog-title"
              tabIndex={-1}
              onKeyDown={handleWorkbenchKeyDown}
            >
              <header
                className="geo-workbench-titlebar"
                onPointerDown={beginMove}
                onKeyDown={moveWithKeyboard}
                tabIndex={compactViewport || maximized ? -1 : 0}
                role="group"
                aria-label="移动工作台窗口"
                aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Shift+ArrowLeft Shift+ArrowRight Shift+ArrowUp Shift+ArrowDown"
                aria-describedby={
                  compactViewport || maximized
                    ? undefined
                    : "geo-workbench-move-help"
                }
                title="方向键移动工作台；按住 Shift 可大步移动"
              >
                <span id="geo-workbench-move-help" className="sr-only">
                  聚焦标题栏后，使用方向键移动工作台；按住 Shift
                  配合方向键可大步移动。
                </span>
                <div className="geo-workbench-brand">
                  <img src="/brand/frontmind-logo.svg" alt="FrontMind" />
                  <span
                    id="geo-workbench-dialog-title"
                    className="geo-brand-product"
                  >
                    企业级 GEO 工作台
                  </span>
                </div>
                <div className="geo-project-switcher">
                  <button
                    type="button"
                    onClick={() => setProjectMenuOpen((open) => !open)}
                    aria-expanded={projectMenuOpen}
                  >
                    <FolderKanban size={15} />
                    <span>{projectDisplayTitle(activeProject)}</span>
                    <ChevronDown size={14} />
                  </button>
                  {projectMenuOpen && (
                    <div className="geo-project-menu">
                      <div className="geo-project-menu-heading">
                        <span>项目记录</span>
                        <small>内容本地缓存</small>
                      </div>
                      {projects.map((project) => (
                        <div
                          key={project.id}
                          className={`geo-project-row ${project.id === activeProject.id ? "active" : ""}`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              openStoredProject(project);
                              setProjectMenuOpen(false);
                            }}
                          >
                            <span
                              className={`geo-project-status status-${project.status}`}
                            />
                            <span>
                              <strong>{projectDisplayTitle(project)}</strong>
                              {!isGeoStylePreviewProject(project) && (
                                <small>{formatDate(project.updatedAt)}</small>
                              )}
                            </span>
                          </button>
                          <button
                            type="button"
                            className="geo-project-delete"
                            onClick={() => openDeleteDialog(project)}
                            aria-label={`删除 ${project.title}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="geo-new-project"
                        onClick={openNewProjectBuilder}
                      >
                        <Plus size={14} /> 新建企业项目
                      </button>
                    </div>
                  )}
                </div>
                <div className="geo-window-actions">
                  <button
                    type="button"
                    onClick={() => setMinimized(true)}
                    aria-label="最小化工作台"
                  >
                    <Minus size={16} />
                  </button>
                  {!compactViewport && (
                    <button
                      type="button"
                      onClick={() => setMaximized((value) => !value)}
                      aria-label={maximized ? "还原工作台" : "最大化工作台"}
                    >
                      {maximized ? (
                        <Minimize2 size={15} />
                      ) : (
                        <Maximize2 size={15} />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setWorkbenchOpen(false)}
                    aria-label="关闭工作台"
                  >
                    <X size={17} />
                  </button>
                </div>
              </header>

              <StageNavigation
                project={activeProject}
                activeStage={activeStage}
                questionSelectionLocked={activeQuestionSelectionLocked}
                onChange={setActiveStage}
                onOpenExecutionLog={() => setExecutionLogOpen(true)}
              />

              {storageNotice && (
                <div className="geo-workbench-notice" role="status">
                  <CircleAlert size={14} /> <span>{storageNotice}</span>
                  <button
                    type="button"
                    onClick={() => setStorageNotice("")}
                    aria-label="关闭提示"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}

              <main className="geo-workbench-content">
                {activeStage === "enterprise_analysis" && (
                  <EnterpriseAnalysis
                    project={activeProject}
                    archivePersistenceVersion={
                      archivePersistenceVersionByProject[activeProject.id] || 0
                    }
                    onDownload={downloadArchive}
                    onContact={() => setContactOpen(true)}
                    onStart={startDraftAnalysis}
                    starting={startingAnalysisId === activeProject.id}
                    onContinueToQuestions={continueToGeoQuestions}
                    startingQuestions={
                      startingQuestionProjectId === activeProject.id
                    }
                  />
                )}
                {activeStage === "question_recommendation" && (
                  <QuestionRecommendation
                    project={activeProject}
                    selectionLocked={activeQuestionSelectionLocked}
                    onSelect={selectQuestion}
                    onCreateCustom={createCustomQuestion}
                    onResumeCustom={resumeCustomQuestion}
                    onRetryCustom={retryCustomQuestion}
                    onContact={() => setContactOpen(true)}
                  />
                )}
                {activeStage === "monitoring" && (
                  <QuestionMonitoring
                    project={activeProject}
                    onTogglePlatform={togglePlatform}
                    onBack={() => setActiveStage("question_recommendation")}
                    onCheckout={openPaymentDialog}
                    paymentPending={Boolean(activePendingPayment)}
                    onRefresh={refreshActiveProject}
                    refreshing={Boolean(refreshingProjectIds[activeProject.id])}
                    lastRefreshedAt={lastRefreshedAtByProject[activeProject.id]}
                    onContact={() => setContactOpen(true)}
                  />
                )}
                {activeStage === "current_assessment" && (
                  <CurrentAssessment
                    project={activeProject}
                    onContact={() => setContactOpen(true)}
                    onRetryAssessment={retryCurrentAssessment}
                    retryingAssessment={
                      retryingAssessmentProjectId === activeProject.id
                    }
                    onStartService={() => {
                      setActiveStage("service_activation");
                    }}
                  />
                )}
                {activeStage === "service_activation" && (
                  <ServiceActivation
                    key={activeProject.id}
                    project={activeProject}
                    paymentPending={Boolean(activePendingPayment)}
                    onCheckout={openServicePaymentDialog}
                    onSubmitProfile={submitServiceContractProfile}
                    onCreateAccount={submitServiceAccount}
                    onCheckStatus={checkServiceContractStatus}
                    onBack={() => setActiveStage("current_assessment")}
                  />
                )}
              </main>
              {!compactViewport && !maximized && (
                <button
                  type="button"
                  className="geo-resize-handle"
                  onPointerDown={beginResize}
                  onKeyDown={resizeWithKeyboard}
                  aria-label="调整工作台大小"
                  title="拖动调整大小；键盘方向键可微调"
                />
              )}
            </div>
          ),
          document.body,
        )}
    </>
  );
}

export function StageNavigation({
  project,
  activeStage,
  questionSelectionLocked = false,
  onChange,
  onOpenExecutionLog,
}: {
  project: GeoProject;
  activeStage: GeoStage;
  questionSelectionLocked?: boolean;
  onChange: (stage: GeoStage) => void;
  onOpenExecutionLog: () => void;
}) {
  const currentEntry = project.executionLog?.entries.find(
    (entry) => entry.id === project.executionLog?.currentEntryId,
  );
  const activeStageIndex = Math.max(
    0,
    STAGES.findIndex((stage) => stage.id === activeStage),
  );
  const activeStageMeta = STAGES[activeStageIndex];

  return (
    <nav className="geo-stage-nav" aria-label="GEO 构建步骤">
      <button
        type="button"
        className="geo-execution-log-trigger"
        onClick={onOpenExecutionLog}
        aria-label="打开执行日志"
      >
        <span className="geo-execution-log-icon">
          <ListTree size={18} />
          {currentEntry &&
            (currentEntry.status === "running" ||
              currentEntry.status === "waiting") && (
              <span className="geo-execution-live-dot" />
            )}
        </span>
        <span>
          <strong>执行日志</strong>
        </span>
      </button>
      <div className="geo-mobile-stage-summary">
        <small>
          第 {activeStageIndex + 1} / {STAGES.length} 步
        </small>
        <strong>{activeStageMeta.title}</strong>
      </div>
      <div className="geo-stage-track">
        {STAGES.map((stage, index) => {
          const scopeLocked =
            stage.id === "question_recommendation" && questionSelectionLocked;
          const enabled = canOpenStage(project, stage.id);
          const complete = isStageComplete(project, stage.id);
          const sampleOnly =
            stage.id === "service_activation" &&
            enabled &&
            !canStartService(project);
          const subtitle = sampleOnly ? "预览企业服务工作台" : stage.subtitle;
          return (
            <div key={stage.id} className="geo-stage-item-wrap">
              <button
                type="button"
                className={`geo-stage-item ${activeStage === stage.id ? "active" : ""} ${complete ? "complete" : ""} ${scopeLocked ? "scope-locked" : ""}`}
                disabled={!enabled}
                onClick={() => onChange(stage.id)}
                aria-current={activeStage === stage.id ? "step" : undefined}
                aria-label={`步骤 ${index + 1}：${stage.title}，${subtitle}${
                  scopeLocked
                    ? "，订单范围已锁定，只读查看"
                    : enabled
                      ? ""
                      : "，尚未解锁"
                }`}
              >
                <span className="geo-stage-number">
                  {complete ? <Check size={14} /> : index + 1}
                </span>
                <span>
                  <strong>{stage.title}</strong>
                  <small>{subtitle}</small>
                </span>
                {!enabled && (
                  <LockKeyhole size={13} className="geo-stage-lock" />
                )}
              </button>
              {index < STAGES.length - 1 && (
                <span
                  className={`geo-stage-line ${complete ? "complete" : ""}`}
                />
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function ExecutionLogDialog({
  open,
  project,
  refreshing,
  onOpenChange,
  onRefresh,
}: {
  open: boolean;
  project: GeoProject;
  refreshing: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => void;
}) {
  const log = project.executionLog;
  const preview = isGeoStylePreviewProject(project);
  const [selectedEntryId, setSelectedEntryId] = useState<string>();
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    const currentEntryId =
      log?.currentEntryId ||
      [...(log?.entries || [])]
        .reverse()
        .find((entry) => entry.status !== "completed")?.id ||
      log?.entries.at(-1)?.id;
    setSelectedEntryId(currentEntryId);
    setClock(Date.now());
  }, [log?.currentEntryId, log?.entries, open, project.id]);

  const selectedEntry =
    log?.entries.find((entry) => entry.id === selectedEntryId) ||
    log?.entries.find((entry) => entry.id === log.currentEntryId) ||
    log?.entries.at(-1);
  const displayedEventGroups = selectedEntry
    ? groupedExecutionEvents(selectedEntry)
    : [];
  const shouldTick =
    open &&
    selectedEntry &&
    (selectedEntry.status === "running" ||
      selectedEntry.status === "waiting" ||
      selectedEntry.status === "queued");

  useEffect(() => {
    if (!shouldTick) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [shouldTick]);

  const progress =
    typeof selectedEntry?.progress === "number"
      ? Math.max(0, Math.min(100, selectedEntry.progress))
      : undefined;
  const showSelectedEntryProgress =
    shouldRenderExecutionProgress(selectedEntry);
  const canRefresh =
    Boolean(project.remoteToken) &&
    !isGeoDraftProject(project) &&
    !isGeoStylePreviewProject(project);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="geo-dialog geo-execution-dialog"
        overlayClassName="geo-dialog-overlay"
        showCloseButton={false}
      >
        <DialogHeader className="geo-execution-dialog-header">
          <span className="geo-dialog-mark">
            <ListTree size={19} />
          </span>
          <div>
            <DialogTitle className="geo-dialog-title">执行日志</DialogTitle>
            <DialogDescription className="geo-dialog-description">
              查看当前环节的真实任务状态、计时与可展示结果。
            </DialogDescription>
          </div>
          <div className="geo-execution-dialog-actions">
            <button
              type="button"
              className="geo-execution-refresh"
              onClick={onRefresh}
              disabled={!canRefresh || refreshing}
            >
              <RotateCw size={14} className={refreshing ? "is-spinning" : ""} />
              {refreshing ? "刷新中" : "刷新状态"}
            </button>
            <DialogClose asChild>
              <button
                type="button"
                className="geo-execution-close"
                aria-label="关闭执行日志"
              >
                <X size={18} />
              </button>
            </DialogClose>
          </div>
        </DialogHeader>

        {!log || log.entries.length === 0 ? (
          <div className="geo-execution-empty">
            <Clock3 size={24} />
            <strong>尚未创建执行任务</strong>
            <p>启动企业分析后，这里会同步显示各环节的实际进度。</p>
          </div>
        ) : (
          <div className="geo-execution-layout">
            <aside className="geo-execution-steps" aria-label="执行环节">
              {log.entries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`${selectedEntry?.id === entry.id ? "active" : ""} status-${entry.status}`}
                  onClick={() => setSelectedEntryId(entry.id)}
                >
                  <span className="geo-execution-step-dot" />
                  <span>
                    <strong>{entry.title}</strong>
                    <small>{executionStatusLabel(entry.status)}</small>
                  </span>
                  {shouldRenderExecutionProgress(entry) && (
                    <b>{Math.round(entry.progress!)}%</b>
                  )}
                </button>
              ))}
            </aside>

            {selectedEntry && (
              <section className="geo-execution-detail">
                <header>
                  <div>
                    <span className="geo-execution-current-label">
                      {selectedEntry.id === log.currentEntryId
                        ? "当前环节"
                        : "历史环节"}
                    </span>
                    <h3>{selectedEntry.title}</h3>
                  </div>
                  <span
                    className={`geo-execution-status status-${selectedEntry.status}`}
                  >
                    {executionStatusLabel(selectedEntry.status)}
                  </span>
                </header>

                <div className="geo-execution-metrics">
                  <div>
                    <Clock3 size={16} />
                    <span>
                      <small>执行计时</small>
                      <strong>
                        {formatExecutionElapsed(
                          selectedEntry.startedAt || project.createdAt,
                          selectedEntry.completedAt,
                          clock,
                        )}
                      </strong>
                    </span>
                  </div>
                  {selectedEntry.counters && (
                    <div>
                      <RadioTower size={16} />
                      <span>
                        <small>任务样本</small>
                        <strong>
                          {selectedEntry.counters.completed}/
                          {selectedEntry.counters.total}
                          {selectedEntry.counters.failed
                            ? ` · ${selectedEntry.counters.failed} 失败`
                            : ""}
                        </strong>
                      </span>
                    </div>
                  )}
                  {!preview && (
                    <div>
                      <RotateCw size={16} />
                      <span>
                        <small>最近同步</small>
                        <strong>
                          {selectedEntry.updatedAt
                            ? formatDate(selectedEntry.updatedAt)
                            : formatDate(log.fetchedAt)}
                        </strong>
                      </span>
                    </div>
                  )}
                </div>

                {showSelectedEntryProgress && progress !== undefined && (
                  <div
                    className="geo-execution-progress"
                    role="progressbar"
                    aria-label={`${selectedEntry.title}执行进度`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progress)}
                  >
                    <div>
                      <span>完成进度</span>
                      <strong>{Math.round(progress)}%</strong>
                    </div>
                    <span>
                      <i style={{ width: `${progress}%` }} />
                    </span>
                  </div>
                )}

                {!preview && selectedEntry.nextPollAt && (
                  <p className="geo-execution-next-poll">
                    <Clock3 size={14} />
                    下一次状态同步预计于 {formatDate(selectedEntry.nextPollAt)}
                  </p>
                )}

                <div className="geo-execution-output">
                  <div className="geo-execution-output-title">
                    <MessageSquareText size={16} />
                    <strong>工作记录</strong>
                  </div>
                  {displayedEventGroups.length > 0 ? (
                    <ol role="log" aria-live="polite">
                      {displayedEventGroups.map((group) => (
                        <li key={group.id} className={`speaker-${group.tone}`}>
                          <span className="geo-execution-speaker-mark">
                            {group.tone === "agent" ? (
                              <Sparkles size={14} />
                            ) : group.tone === "error" ? (
                              <CircleAlert size={14} />
                            ) : (
                              <ListTree size={14} />
                            )}
                          </span>
                          <div className="geo-execution-transcript-copy">
                            <div>
                              <strong>{group.actor}</strong>
                            </div>
                            <div className="geo-execution-message-stack">
                              {group.events.map((event) => (
                                <div
                                  className="geo-execution-message-row"
                                  key={event.id}
                                >
                                  <p>{event.message}</p>
                                  {!preview && event.createdAt && (
                                    <time dateTime={event.createdAt}>
                                      {formatDate(event.createdAt)}
                                    </time>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="geo-execution-no-output">
                      <LoaderCircle
                        size={18}
                        className={
                          selectedEntry.status === "running"
                            ? "is-spinning"
                            : undefined
                        }
                      />
                      <span>
                        {selectedEntry.status === "running" ||
                        selectedEntry.status === "waiting"
                          ? "任务正在执行，尚未返回可展示结果。"
                          : "该环节没有可展示的模型消息。"}
                      </span>
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function shouldRenderExecutionProgress(
  entry?: Pick<GeoExecutionLogEntry, "stage" | "progress">,
) {
  return (
    entry?.stage !== "enterprise_analysis" &&
    typeof entry?.progress === "number" &&
    Number.isFinite(entry.progress)
  );
}

export function EnterpriseAnalysis({
  project,
  archivePersistenceVersion = 0,
  onDownload,
  onContact,
  onStart,
  starting,
  onContinueToQuestions,
  startingQuestions = false,
}: {
  project: GeoProject;
  archivePersistenceVersion?: number;
  onDownload: () => void;
  onContact: () => void;
  onStart: () => void;
  starting: boolean;
  onContinueToQuestions?: () => void;
  startingQuestions?: boolean;
}) {
  const [view, setView] = useState<KnowledgeView>("overview");
  const knowledgeBase = project.knowledgeBase;
  const [activeSectionId, setActiveSectionId] = useState<string>();
  const [completenessOpen, setCompletenessOpen] = useState(false);
  const localAssetUrls = useLocalKnowledgeAssetPreviewUrls(
    project.id,
    knowledgeBase?.assets ?? [],
    archivePersistenceVersion,
  );
  const logoAsset = useMemo(() => {
    const assets = (knowledgeBase?.assets ?? []).map((asset) => ({
      ...asset,
      previewUrl: localAssetUrls[asset.id] || asset.previewUrl,
    }));
    return assets.find(
      (asset) =>
        asset.assetType === "brand_identity" ||
        /(?:^|[-_\s])(logo|标志|品牌)(?:[-_.\s]|$)/i.test(asset.name),
    );
  }, [knowledgeBase?.assets, localAssetUrls]);

  useEffect(() => {
    if (
      knowledgeBase?.sections[0] &&
      !knowledgeBase.sections.some((section) => section.id === activeSectionId)
    ) {
      setActiveSectionId(knowledgeBase.sections[0].id);
    }
  }, [activeSectionId, knowledgeBase?.sections]);

  if (isGeoDraftProject(project)) {
    return (
      <div className="geo-analysis-ready">
        <section className="geo-ready-hero">
          <figure className="geo-ready-visual" aria-hidden="true">
            <img src="/geo-builder/knowledge-foundation-launch.webp" alt="" />
          </figure>
          <div className="geo-ready-copy">
            <span className="geo-ready-eyebrow">企业 GEO 知识基建</span>
            <h2>
              让您的企业，成为
              <br />
              AI 可以准确理解的答案
            </h2>
            <p>
              FrontMind
              将以官网与企业资料为起点，梳理企业身份、产品能力、应用场景与权威证据，沉淀为一套可核验的企业知识库，作为后续
              GEO 问题优化与持续监控的统一事实基础。
            </p>
            <button
              type="button"
              className="geo-primary-button geo-ready-start"
              onClick={onStart}
              disabled={starting}
            >
              {starting ? (
                <>
                  <span className="geo-spinner" /> 正在开始构建
                </>
              ) : (
                <>
                  开始构建企业知识库 <ArrowRight size={17} />
                </>
              )}
            </button>
            <small className="geo-ready-followup">
              完成后可查看完整知识库，并进入优化问题推荐
            </small>
          </div>
        </section>
      </div>
    );
  }

  if (project.status === "failed" && !knowledgeBase) {
    const finalizationFailed =
      project.knowledgeBaseFinalization?.finalizationState ===
      "failed_internal";
    const failureMessage =
      project.error || "企业知识库生成结果未通过校验，请联系技术支持。";
    return (
      <div className="geo-failure-state" role="alert" aria-live="assertive">
        <span>
          <CircleAlert size={24} />
        </span>
        <h2>
          {finalizationFailed ? "知识库生成未能完成" : "企业知识库生成未能完成"}
        </h2>
        <p>{failureMessage}</p>
        <button
          type="button"
          className="geo-primary-button"
          onClick={onContact}
        >
          联系技术支持 <ArrowRight size={15} />
        </button>
      </div>
    );
  }

  if (!knowledgeBase)
    return <AnalysisProgress project={project} onContact={onContact} />;

  const fallbackMetrics = [
    {
      key: "branches",
      label: "知识分支",
      value: FIXED_KNOWLEDGE_SECTIONS.length,
      detail: "固定企业知识树",
    },
    {
      key: "sources",
      label: "证据来源",
      value: knowledgeBase.sources.length,
      detail: "由知识库来源索引返回",
    },
    {
      key: "files",
      label: "输入资料",
      value: project.files.length,
      detail: project.files.length > 0 ? "本次提交附件" : "本次未提交附件",
    },
  ];
  const metrics =
    knowledgeBase.metrics.length > 0
      ? knowledgeBase.metrics.filter(
          (metric) =>
            !["assets", "pages", "images"].includes(metric.key) &&
            !["企业素材", "发现页面", "下载图片"].includes(metric.label),
        )
      : fallbackMetrics;
  const sections = completeKnowledgeBaseSections(knowledgeBase.sections);
  const activeSection =
    sections.find((section) => section.id === activeSectionId) ??
    sections.find(
      (section) =>
        section.id === knowledgeBase.sections[0]?.id ||
        section.title === knowledgeBase.sections[0]?.title,
    ) ??
    sections[0];
  const activeLeaves = activeSection?.leaves ?? [];
  const hasQuestions = project.questions.length > 0;
  const questionGenerationInProgress =
    startingQuestions || project.status === "recommending";

  return (
    <div className="geo-analysis-shell">
      <section className="geo-kb-hero">
        <div>
          <span className="geo-kb-kicker">
            <ShieldCheck size={14} /> 知识库结构校验已通过
          </span>
          <h2 className="geo-stage-title">
            {knowledgeBase.companyName || project.title} 企业知识基建
          </h2>
          <p>
            {knowledgeBase.summary || "摘要暂不可用，请查看知识树与证据索引。"}
          </p>
          <div className="geo-kb-meta">
            <span>
              <Archive size={13} /> ZIP 可下载归档
            </span>
            {project.status === "recommending" && (
              <span className="is-live">
                <span className="geo-live-dot" /> 正在生成 GEO 问题
              </span>
            )}
          </div>
        </div>
        <div className="geo-kb-actions">
          <button
            type="button"
            className="geo-completeness-button"
            onClick={() => setCompletenessOpen(true)}
            aria-haspopup="dialog"
          >
            <BarChart3 size={16} /> 完整度评估
            {knowledgeBase.completeness
              ? ` ${knowledgeBase.completeness.score}%`
              : ""}
          </button>
          <button
            type="button"
            className="geo-download-button"
            onClick={onDownload}
          >
            <ArrowDownToLine size={16} /> 下载知识库 ZIP
          </button>
          <button
            type="button"
            className="geo-question-generate-button"
            onClick={onContinueToQuestions}
            disabled={
              !onContinueToQuestions ||
              questionGenerationInProgress ||
              (project.status === "failed" && !hasQuestions)
            }
          >
            {questionGenerationInProgress ? (
              <>
                <LoaderCircle size={16} className="is-spinning" /> 正在生成 GEO
                问题
              </>
            ) : hasQuestions ? (
              <>
                <Sparkles size={16} /> 查看 GEO 问题 <ArrowRight size={16} />
              </>
            ) : (
              <>
                <Sparkles size={16} /> 生成 GEO 问题 <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </section>
      <KnowledgeCompletenessDialog
        open={completenessOpen}
        onOpenChange={setCompletenessOpen}
        completeness={knowledgeBase.completeness}
        companyName={knowledgeBase.companyName || project.title}
      />

      {project.status === "failed" && project.questions.length === 0 && (
        <section className="geo-recommendation-error" role="alert">
          <span>
            <CircleAlert size={17} />
          </span>
          <div>
            <strong>问题推荐未能完成</strong>
            <p>
              {project.error ||
                "推荐结果未通过校验，知识库仍已安全保留，请联系技术支持。"}
            </p>
          </div>
          <button type="button" onClick={onContact}>
            联系技术支持 <ArrowRight size={14} />
          </button>
        </section>
      )}

      <div className="geo-kb-tabs" role="tablist" aria-label="知识库视图">
        {(
          [
            ["overview", "知识总览", BookOpenText],
            [
              "sources",
              `证据来源 ${knowledgeBase.sources.length || ""}`,
              ShieldCheck,
            ],
          ] as Array<[KnowledgeView, string, typeof BookOpenText]>
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            className={view === id ? "active" : ""}
            onClick={() => setView(id)}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {view === "overview" && (
        <div className="geo-kb-overview">
          <div className="geo-metric-grid">
            {metrics.map((metric) => (
              <article key={metric.key} className="geo-metric-card">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.detail || "数据由知识库清单返回"}</small>
              </article>
            ))}
          </div>
          <div className="geo-knowledge-browser">
            <aside aria-label="企业知识树">
              <div className="geo-browser-heading">
                <span>企业知识树</span>
                <small>{sections.length} 个主题分支</small>
              </div>
              {sections.map((section, index) => (
                <button
                  key={section.id}
                  type="button"
                  className={section.id === activeSection?.id ? "active" : ""}
                  onClick={() => setActiveSectionId(section.id)}
                >
                  <span
                    className={`geo-branch-index ${
                      index === 0 && logoAsset ? "has-logo" : ""
                    }`}
                  >
                    {index === 0 && logoAsset ? (
                      <KnowledgeAssetPreviewImage asset={logoAsset} />
                    ) : (
                      String(index + 1).padStart(2, "0")
                    )}
                  </span>
                  <span>
                    <strong>{section.title}</strong>
                    <small>
                      {section.evidenceCount
                        ? `${section.evidenceCount} 条证据`
                        : `${section.leaves?.length ?? 0} 个知识条目`}
                    </small>
                  </span>
                </button>
              ))}
            </aside>
            <article className="geo-knowledge-document">
              <header>
                <div>
                  <span>KNOWLEDGE BRANCH</span>
                  <h3>{activeSection?.title}</h3>
                </div>
              </header>
              <div className="geo-knowledge-copy geo-knowledge-copy-all">
                {activeLeaves.map((leaf, index) => (
                  <section className="geo-knowledge-leaf-section" key={leaf.id}>
                    <header>
                      <span>
                        {String(index + 1).padStart(2, "0")} /{" "}
                        {String(activeLeaves.length).padStart(2, "0")}
                      </span>
                      <h4>{leaf.title}</h4>
                    </header>
                    <LightweightMarkdown markdown={leaf.markdown} />
                  </section>
                ))}
                {activeLeaves.length === 0 && (
                  <EmptyKnowledgeState
                    icon={<BookOpenText size={22} />}
                    title="暂无知识条目"
                    copy="该分支当前没有可展示的事实条目。"
                  />
                )}
              </div>
            </article>
          </div>
        </div>
      )}

      {view === "sources" && (
        <div className="geo-source-view">
          <div className="geo-view-intro">
            <div>
              <span>证据索引</span>
            </div>
            <p>
              {knowledgeBase.sources.length > 0
                ? "以下条目由当前知识库来源索引返回"
                : "当前知识库未返回可展示的公开来源 URL"}
            </p>
          </div>
          {knowledgeBase.sources.length > 0 ? (
            <div className="geo-source-list">
              {knowledgeBase.sources.map((source, index) => (
                <article key={source.id}>
                  <span className="geo-source-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h4>{source.title}</h4>
                    <p>
                      {source.domain || source.type || "公开可核验来源"}
                      {source.capturedAt
                        ? ` · ${formatDate(source.capturedAt)}`
                        : ""}
                    </p>
                  </div>
                  {safePublicMarkdownUrl(source.url) && (
                    <a
                      href={safePublicMarkdownUrl(source.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`打开来源：${source.title}`}
                    >
                      <ExternalLink size={15} />
                    </a>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <EmptyKnowledgeState
              icon={<ShieldCheck size={22} />}
              title="暂无可展示的公开来源 URL"
              copy="请以 ZIP 内来源索引与报告正文的实际内容为准。"
            />
          )}
        </div>
      )}
    </div>
  );
}

function AnalysisProgress({
  project,
  onContact,
}: {
  project: GeoProject;
  onContact: () => void;
}) {
  const executionEntry = project.executionLog?.entries.find(
    (entry) => entry.id === "enterprise-analysis",
  );
  const visibleEvents =
    executionEntry?.events.filter((event) => event.kind === "status") ?? [];
  const activityRows = visibleEvents.length
    ? visibleEvents.slice(-6).map((event) => ({
        id: event.id,
        label: event.message,
        detail: `${event.kind === "progress_summary" ? "FrontMind Agent" : "执行系统"}${
          event.createdAt ? ` · ${formatDate(event.createdAt)}` : ""
        }`,
      }))
    : [
        {
          id: "waiting-for-execution-events",
          label: "企业分析任务已创建",
          detail: "等待后台返回可展示进度",
        },
      ];

  return (
    <div className="geo-progress-layout" role="status" aria-live="polite">
      <section className="geo-progress-visual" aria-hidden="true">
        <div className="geo-orbit orbit-one" />
        <div className="geo-orbit orbit-two" />
        <div className="geo-orbit-core">
          <Layers3 size={26} />
          <span>BASE</span>
        </div>
        <span className="geo-orbit-node node-one" />
        <span className="geo-orbit-node node-two" />
        <span className="geo-orbit-node node-three" />
      </section>
      <section className="geo-progress-copy">
        <span className="geo-kb-kicker">
          <span className="geo-live-dot" /> 企业分析进行中
        </span>
        <h2 className="geo-stage-title">
          正在建立 {project.title} 的企业知识基建
        </h2>
        <p>
          FrontMind
          正在按业务分支进行资料采集。此阶段无需逐项确认，完成后将直接生成可核验知识库。
        </p>
        <div className="geo-progress-meta">
          <span>{project.progressLabel || "正在调度企业信息采集任务"}</span>
        </div>
        {project.knowledgeBaseSupportRequired && (
          <div className="geo-status-sync-delay" role="status">
            <CircleAlert size={17} />
            <div>
              <strong>状态同步延迟</strong>
              <p>
                任务仍在后台执行并会继续每 30 秒同步；当前不会重复创建任务。
              </p>
              <button type="button" onClick={onContact}>
                联系技术支持
              </button>
            </div>
          </div>
        )}
      </section>
      {executionEntry?.crawlProgress && (
        <div className="geo-crawl-progress-summary" aria-live="polite">
          <strong>最新采集摘要</strong>
          <p>
            已访问 {executionEntry.crawlProgress.visitedLinks} 个链接，成功采集{" "}
            {executionEntry.crawlProgress.successfulPages} 个页面，提取{" "}
            {executionEntry.crawlProgress.textCharacters} 字文字，发现{" "}
            {executionEntry.crawlProgress.imagesDiscovered} 张图片并保存{" "}
            {executionEntry.crawlProgress.imagesDownloaded} 张，已解析{" "}
            {executionEntry.crawlProgress.documentsParsed} 份文档。
          </p>
          <small>
            最近更新 {formatDate(executionEntry.crawlProgress.reportedAt)}
          </small>
        </div>
      )}
      <div className="geo-milestone-list">
        {activityRows.map((activity, index) => {
          const complete = executionEntry?.status === "completed";
          const active =
            !complete &&
            index === activityRows.length - 1 &&
            executionEntry?.status !== "failed";
          return (
            <div
              key={activity.id}
              className={`${complete ? "complete" : ""} ${active ? "active" : ""}`}
            >
              <span>
                {complete ? (
                  <Check size={14} />
                ) : active ? (
                  <span className="geo-spinner" />
                ) : (
                  index + 1
                )}
              </span>
              <div>
                <strong>{activity.label}</strong>
                <small>{activity.detail}</small>
              </div>
            </div>
          );
        })}
      </div>
      <div className="geo-progress-footnote">
        <ShieldCheck size={14} />{" "}
        可关闭或最小化工作台，任务将在后台继续；完成后项目与 ZIP
        会保存在本机浏览器。
      </div>
    </div>
  );
}

function EmptyKnowledgeState({
  icon,
  title,
  copy,
}: {
  icon: ReactNode;
  title: string;
  copy: string;
}) {
  return (
    <div className="geo-empty-state">
      <span>{icon}</span>
      <strong>{title}</strong>
      <p>{copy}</p>
    </div>
  );
}

export function QuestionRecommendation({
  project,
  selectionLocked,
  onSelect,
  onCreateCustom,
  onResumeCustom,
  onRetryCustom,
  onContact,
}: {
  project: GeoProject;
  selectionLocked: boolean;
  onSelect: (question: GeoQuestion) => void;
  onCreateCustom: (
    question: string,
    signal?: AbortSignal,
  ) => Promise<GeoQuestion>;
  onResumeCustom?: (signal?: AbortSignal) => Promise<GeoQuestion | undefined>;
  onRetryCustom?: (
    terminalError: unknown,
    signal?: AbortSignal,
  ) => Promise<GeoQuestion>;
  onContact: () => void;
}) {
  const [customQuestion, setCustomQuestion] = useState("");
  const [customSubmitting, setCustomSubmitting] = useState(false);
  const [customError, setCustomError] = useState("");
  const [customRetryable, setCustomRetryable] = useState(false);
  const [customRetryTerminalError, setCustomRetryTerminalError] =
    useState<unknown>();
  const [customRestartAfterExpiration, setCustomRestartAfterExpiration] =
    useState(false);
  const [validatedCustomQuestion, setValidatedCustomQuestion] =
    useState<GeoQuestion>();
  const [customStartedAt, setCustomStartedAt] = useState<number>();
  const [customClock, setCustomClock] = useState(() => Date.now());
  const customRequestInFlight = useRef(false);
  const customAbortController = useRef<AbortController | undefined>(undefined);
  const [permissionVideoOpen, setPermissionVideoOpen] = useState(false);
  const recommendedQuestions = project.questions.filter(
    (question) => !question.id.startsWith("custom-"),
  );
  const countsValid = GEO_QUESTION_CATEGORIES.every(
    (category) =>
      recommendedQuestions.filter(
        (question) => question.category === category.id,
      ).length === 5,
  );

  useEffect(() => {
    const pending = readPendingGeoCustomQuestionValidation(project.id);
    const controller = new AbortController();
    let cancelled = false;
    customAbortController.current?.abort();
    customAbortController.current = controller;
    const shouldProbe = Boolean(onResumeCustom);
    customRequestInFlight.current = shouldProbe;
    setCustomQuestion(pending?.question ?? "");
    setCustomSubmitting(Boolean(pending) || shouldProbe);
    setCustomError("");
    setCustomRetryable(false);
    setCustomRetryTerminalError(undefined);
    setCustomRestartAfterExpiration(false);
    setValidatedCustomQuestion(undefined);
    setCustomStartedAt(pending || shouldProbe ? Date.now() : undefined);
    void (onResumeCustom?.(controller.signal) ?? Promise.resolve(undefined))
      .then((question) => {
        if (cancelled || !question) return;
        setCustomQuestion(question.question);
        setValidatedCustomQuestion(question);
        setCustomRetryable(false);
        setCustomRestartAfterExpiration(false);
      })
      .catch((error) => {
        if (cancelled) return;
        const expired = expiredGeoCustomQuestionValidation(error);
        setCustomError(
          expired
            ? "原问题验证已过期，本地请求锁定已解除。"
            : errorMessage(error),
        );
        const authoritativeTerminal =
          authoritativeGeoCustomQuestionValidationTerminal(error);
        const retryableTerminal = retryableGeoCustomQuestionValidation(error);
        setCustomRetryTerminalError(retryableTerminal ? error : undefined);
        setCustomRestartAfterExpiration(expired);
        setCustomRetryable(
          Boolean(
            expired ||
              retryableTerminal ||
              (!authoritativeTerminal &&
                readPendingGeoCustomQuestionValidation(project.id)),
          ),
        );
      })
      .finally(() => {
        if (cancelled) return;
        if (customAbortController.current === controller)
          customAbortController.current = undefined;
        customRequestInFlight.current = false;
        setCustomSubmitting(false);
        setCustomStartedAt(undefined);
      });
    return () => {
      cancelled = true;
      controller.abort();
      customAbortController.current?.abort();
      customAbortController.current = undefined;
      customRequestInFlight.current = false;
    };
    // Recovery is keyed by the durable project id. The callback intentionally
    // does not restart polling when parent state adopts a rotated token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  useEffect(() => {
    if (!customSubmitting || customStartedAt === undefined) return;
    setCustomClock(Date.now());
    const timer = window.setInterval(() => setCustomClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [customStartedAt, customSubmitting]);

  const customElapsed =
    customStartedAt === undefined
      ? "00:00:00"
      : formatExecutionElapsed(
          new Date(customStartedAt).toISOString(),
          undefined,
          customClock,
        );

  return (
    <div className="geo-question-view">
      <header className="geo-question-header">
        <div>
          <span className="geo-kb-kicker">
            <Sparkles size={14} /> 基于企业知识库推荐
          </span>
          <h2 className="geo-stage-title">
            {selectionLocked
              ? "查看本次 GEO 优化问题"
              : "选择一个 GEO 优化问题"}
          </h2>
        </div>
        <p>
          {selectionLocked ? (
            "监控或订单范围已经确认，当前页面仅供查看，不能更换问题。"
          ) : (
            <>
              请从 <strong>非行业排名类</strong> 问题中选择一项继续。
            </>
          )}
        </p>
      </header>
      {selectionLocked && (
        <div className="geo-validation-notice" role="status">
          <LockKeyhole size={14} />{" "}
          本次问题范围已锁定，避免支付、监控与评估结果错配。
        </div>
      )}
      {!countsValid && (
        <div className="geo-validation-notice" role="status">
          <CircleAlert size={14} />
          已优先展示本次生成的 {recommendedQuestions.length}{" "}
          道问题；题目数量或分类未达到 4 类 × 5
          题时仍会正常展示，符合条件的问题可继续选择。
        </div>
      )}

      <div className="geo-question-categories">
        {GEO_QUESTION_CATEGORIES.map((category, categoryIndex) => {
          const questions = recommendedQuestions.filter(
            (question) => question.category === category.id,
          );
          const locked = category.id === "industry_ranking";
          const CategoryIcon =
            category.id === "reputation"
              ? Quote
              : category.id === "product_scenario"
                ? Layers3
                : category.id === "industry_ranking"
                  ? BarChart3
                  : Search;
          return (
            <section
              key={category.id}
              className={`geo-question-category ${locked ? "locked" : ""}`}
              data-category={category.id}
            >
              <header>
                <span className="geo-category-icon" aria-hidden="true">
                  <CategoryIcon size={18} />
                </span>
                <div>
                  <h3>
                    {category.title}
                    {locked && <LockKeyhole size={14} />}
                  </h3>
                  <p>{category.description}</p>
                </div>
                <small>
                  {String(categoryIndex + 1).padStart(2, "0")} ·{" "}
                  {questions.length} 题
                </small>
              </header>
              <div className="geo-question-list">
                {questions.map((question, index) => {
                  const selected = project.selectedQuestionId === question.id;
                  return (
                    <button
                      key={question.id}
                      type="button"
                      disabled={
                        selectionLocked || locked || !question.selectable
                      }
                      className={selected ? "selected" : ""}
                      onClick={() => onSelect(question)}
                    >
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <span>
                        <strong>{question.question}</strong>
                        {question.rationale && (
                          <small>{question.rationale}</small>
                        )}
                      </span>
                      {locked ? (
                        <LockKeyhole size={14} />
                      ) : (
                        <ArrowRight size={15} />
                      )}
                    </button>
                  );
                })}
                {questions.length === 0 && (
                  <div className="geo-question-empty">
                    本分类本次暂无可展示问题
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <section className="geo-permission-card">
        <div className="geo-permission-heading">
          <span>
            <LockKeyhole size={18} />
          </span>
          <div>
            <h3>行业排名类问题需要全域营销权限</h3>
            <p>如果想在行业中实现品牌优胜，需具备以下全域营销权限，举例如：</p>
          </div>
          <button
            type="button"
            className="geo-permission-video-trigger"
            onClick={() => setPermissionVideoOpen(true)}
            aria-haspopup="dialog"
          >
            <Play size={15} fill="currentColor" aria-hidden="true" />
            观看视频解释
            <span>01:06</span>
          </button>
        </div>
        <ul>
          <li>
            <span className="geo-permission-number" aria-hidden="true">
              1
            </span>
            <div>
              <strong>行业内容矩阵</strong>
              <p>
                建立小红书、微信视频号、抖音企业号与抖音百科等官方阵地，让品牌主体、专业观点与行业内容在图文和视频中相互印证。
              </p>
              <div className="geo-permission-channels">
                <PermissionChannel
                  name="小红书"
                  logo="/geo-builder/channels/xiaohongshu.svg"
                  tone="is-red"
                />
                <PermissionChannel
                  name="视频号"
                  logo="/geo-builder/channels/wechat-channels.svg"
                  tone="is-green"
                />
                <PermissionChannel
                  name="抖音"
                  logo="/geo-builder/channels/douyin.svg"
                  tone="is-dark"
                />
                <PermissionChannel
                  name="抖音百科"
                  logo="/geo-builder/channels/douyin-baike.svg"
                  tone="is-cyan"
                />
              </div>
            </div>
          </li>
          <li>
            <span className="geo-permission-number" aria-hidden="true">
              2
            </span>
            <div>
              <strong>商品与服务矩阵</strong>
              <p>
                完成抖音、美团、淘宝等商品与服务货架上架，并让对应的豆包、元宝、千问读取到一致的产品参数、适用场景与购买入口。
              </p>
              <div
                className="geo-permission-platform-pairs"
                aria-label="商品与服务货架和 AI 平台的对应关系"
              >
                <div className="geo-permission-platform-pair">
                  <PermissionChannel
                    name="抖音"
                    logo="/geo-builder/channels/douyin.svg"
                    tone="is-dark"
                  />
                  <span aria-hidden="true">↔</span>
                  <PermissionChannel
                    name="豆包"
                    logo="/geo-builder/platforms/doubao.png"
                    tone="is-blue"
                  />
                </div>
                <div className="geo-permission-platform-pair">
                  <PermissionChannel
                    name="美团"
                    logo="/geo-builder/channels/meituan.svg"
                    tone="is-yellow"
                  />
                  <span aria-hidden="true">↔</span>
                  <PermissionChannel
                    name="元宝"
                    logo="/geo-builder/platforms/yuanbao.png"
                    tone="is-blue"
                  />
                </div>
                <div className="geo-permission-platform-pair">
                  <PermissionChannel
                    name="淘宝"
                    logo="/geo-builder/channels/taobao.svg"
                    tone="is-red"
                  />
                  <span aria-hidden="true">↔</span>
                  <PermissionChannel
                    name="千问"
                    logo="/geo-builder/platforms/qianwen.png"
                    tone="is-blue"
                  />
                </div>
              </div>
            </div>
          </li>
          <li>
            <span className="geo-permission-number" aria-hidden="true">
              3
            </span>
            <div>
              <strong>自有阵地与权威信源</strong>
              <p>
                建设 AI
                专用官网，联动百度百科、微信公众号、知乎问答等认证与运营接口，将企业资质、专家内容与权威报道沉淀为可核验信源。
              </p>
              <div className="geo-permission-channels">
                <PermissionChannel
                  name="AI 专用官网"
                  logo="/geo-builder/channels/frontmind.svg"
                  tone="is-purple"
                />
                <PermissionChannel
                  name="百度百科"
                  logo="/geo-builder/channels/baidu-baike.svg"
                  tone="is-blue"
                />
                <PermissionChannel
                  name="微信公众号"
                  logo="/geo-builder/channels/wechat.svg"
                  tone="is-green"
                />
                <PermissionChannel
                  name="知乎"
                  logo="/geo-builder/channels/zhihu.svg"
                  tone="is-blue"
                />
              </div>
              <div className="geo-authority-sources" aria-label="权威信源">
                <div className="geo-authority-sources-title">
                  <BadgeCheck size={14} aria-hidden="true" />
                  <span>权威信源</span>
                </div>
                <div className="geo-authority-source-channels">
                  <PermissionChannel
                    name="搜狐"
                    logo="/geo-builder/channels/sohu.png"
                    tone="is-red"
                  />
                  <PermissionChannel
                    name="新浪"
                    logo="/geo-builder/channels/sina.png"
                    tone="is-red"
                  />
                  <PermissionChannel
                    name="今日头条"
                    logo="/geo-builder/channels/toutiao.png"
                    tone="is-red"
                  />
                  <PermissionChannel
                    name="网易"
                    logo="/geo-builder/channels/netease.png"
                    tone="is-red"
                  />
                  <PermissionChannel
                    name="腾讯新闻"
                    logo="/geo-builder/channels/tencent-news.png"
                    tone="is-blue"
                  />
                </div>
              </div>
            </div>
          </li>
        </ul>
        <div className="geo-permission-footer">
          <p>
            FrontMind坚持以科研级态度保证顶级质量控制，行业词为品牌护航套餐，需联系技术人员对接评估。
          </p>
          <button type="button" onClick={onContact}>
            联系技术人员对接 <ArrowRight size={15} />
          </button>
        </div>
      </section>

      <Dialog open={permissionVideoOpen} onOpenChange={setPermissionVideoOpen}>
        <DialogContent
          className="geo-permission-video-dialog"
          overlayClassName="geo-permission-video-overlay"
        >
          <DialogHeader className="geo-permission-video-dialog-header">
            <span className="geo-permission-video-kicker">
              <Play size={13} fill="currentColor" aria-hidden="true" />
              66 秒视频解释
            </span>
            <DialogTitle>行业排名为什么需要全域营销权限？</DialogTitle>
            <DialogDescription>
              从行业内容、商品与服务、自有阵地和权威信源三个层面，理解 AI
              推荐背后的品牌信号系统。
            </DialogDescription>
          </DialogHeader>
          <div className="geo-permission-video-frame">
            <video
              controls
              autoPlay
              playsInline
              preload="metadata"
              poster="/videos/frontmind-industry-ranking-permission-explainer-poster.jpg?v=6"
            >
              <source
                src="/videos/frontmind-industry-ranking-permission-explainer-66s.mp4?v=6"
                type="video/mp4"
              />
              <track
                kind="captions"
                src="/videos/frontmind-industry-ranking-permission-explainer-zh-CN.vtt"
                srcLang="zh-CN"
                label="简体中文"
              />
              当前浏览器暂不支持 HTML5 视频播放。
            </video>
          </div>
        </DialogContent>
      </Dialog>

      <section className="geo-custom-question-card">
        <div className="geo-custom-question-copy">
          <span aria-hidden="true">
            <MessageSquareText size={20} />
          </span>
          <div>
            <small>自定义问题</small>
            <h3>已有明确的 GEO 优化问题？</h3>
            <p>
              输入一个与当前企业明确相关的
              <strong>非行业排名类</strong>问题，验证并分类后即可继续。
            </p>
          </div>
        </div>
        <form
          aria-busy={customSubmitting}
          onSubmit={(event) => {
            event.preventDefault();
            if (customRequestInFlight.current) return;
            if (selectionLocked) {
              setCustomError("本次问题范围已经锁定，不能再创建或更换问题。");
              return;
            }
            if (validatedCustomQuestion) {
              onSelect(validatedCustomQuestion);
              return;
            }
            const question = customQuestion.trim();
            if (question.length < 4) {
              setCustomError("请输入一个完整的问题。");
              return;
            }
            customRequestInFlight.current = true;
            const controller = new AbortController();
            customAbortController.current?.abort();
            customAbortController.current = controller;
            const startedAt = Date.now();
            setCustomSubmitting(true);
            setCustomStartedAt(startedAt);
            setCustomClock(startedAt);
            setCustomError("");
            setCustomRetryable(false);
            setCustomRestartAfterExpiration(false);
            const retryTerminalError = customRetryTerminalError;
            setCustomRetryTerminalError(undefined);
            const operation =
              retryTerminalError && onRetryCustom
                ? onRetryCustom(retryTerminalError, controller.signal)
                : onCreateCustom(question, controller.signal);
            void operation
              .then((validatedQuestion) => {
                if (
                  controller.signal.aborted ||
                  customAbortController.current !== controller
                )
                  return;
                setValidatedCustomQuestion(validatedQuestion);
                setCustomRetryable(false);
                setCustomRetryTerminalError(undefined);
              })
              .catch((error) => {
                if (
                  controller.signal.aborted ||
                  customAbortController.current !== controller
                )
                  return;
                const expired = expiredGeoCustomQuestionValidation(error);
                setCustomError(
                  expired
                    ? "原问题验证已过期，本地请求锁定已解除。"
                    : errorMessage(error),
                );
                const directTerminal =
                  retryableGeoCustomQuestionValidation(error);
                const authoritativeTerminal =
                  authoritativeGeoCustomQuestionValidationTerminal(error);
                const priorTerminal = retryTerminalError
                  ? retryableGeoCustomQuestionValidation(retryTerminalError)
                  : undefined;
                const pending = readPendingGeoCustomQuestionValidation(
                  project.id,
                );
                const retainedTerminalError = directTerminal
                  ? error
                  : priorTerminal &&
                      pending?.clientRequestId === priorTerminal.clientRequestId
                    ? retryTerminalError
                    : undefined;
                setCustomRetryTerminalError(retainedTerminalError);
                setCustomRestartAfterExpiration(expired);
                setCustomRetryable(
                  Boolean(
                    expired ||
                      retainedTerminalError ||
                      (!authoritativeTerminal &&
                        pending?.question === question),
                  ),
                );
              })
              .finally(() => {
                if (customAbortController.current !== controller) return;
                customAbortController.current = undefined;
                customRequestInFlight.current = false;
                setCustomSubmitting(false);
                setCustomStartedAt(undefined);
              });
          }}
        >
          <label htmlFor="geo-custom-question">自定义优化问题</label>
          <div>
            <input
              id="geo-custom-question"
              value={customQuestion}
              maxLength={120}
              disabled={selectionLocked || customSubmitting}
              onChange={(event) => {
                setCustomQuestion(event.target.value);
                setCustomError("");
                setCustomRetryable(false);
                setCustomRetryTerminalError(undefined);
                setCustomRestartAfterExpiration(false);
                setValidatedCustomQuestion(undefined);
              }}
              placeholder={`例如：${project.knowledgeBase?.companyName || project.title}有哪些值得重点了解的优势？`}
            />
            <button
              type="submit"
              className={validatedCustomQuestion ? "is-validated" : undefined}
              disabled={
                selectionLocked ||
                customSubmitting ||
                (Boolean(customError) && !customRetryable) ||
                customQuestion.trim().length < 4
              }
            >
              {customSubmitting ? (
                <>
                  <LoaderCircle size={15} className="is-spinning" />
                  {customElapsed} · 等待返回
                </>
              ) : validatedCustomQuestion ? (
                <>
                  <Check size={15} /> 验证通过，进入下一步
                  <ArrowRight size={15} />
                </>
              ) : customError ? (
                customRetryable ? (
                  <>
                    <RotateCw size={15} />{" "}
                    {customRestartAfterExpiration
                      ? "重新提交验证"
                      : customRetryTerminalError
                        ? "重新发起验证"
                        : "恢复同一验证"}
                  </>
                ) : (
                  <>
                    <LockKeyhole size={15} /> 请修改问题
                  </>
                )
              ) : (
                <>
                  验证并继续 <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>
          <small>
            问题需明确包含当前企业、品牌或知识库中的具体产品/服务；行业排名、榜单、开放式品牌推荐及企业无关问题不会通过。
          </small>
          {customSubmitting && (
            <p className="geo-custom-question-pending" role="status">
              <Clock3 size={14} />
              验证请求已锁定，上游返回前将持续等待并自动更新结果，请勿重复提交。
            </p>
          )}
          {customError && (
            <p className="geo-custom-question-error" role="alert">
              <CircleAlert size={14} /> {customError}{" "}
              {customRetryable
                ? customRestartAfterExpiration
                  ? "可点击上方按钮，使用新的请求重新提交同一问题。"
                  : customRetryTerminalError
                    ? "可点击上方按钮确认旧终态后，以新的请求重新发起一次验证。"
                    : "可点击上方按钮恢复同一验证任务。"
                : null}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}

function AlipayBrandMark() {
  return (
    <svg viewBox="0 0 16 16" role="img" aria-label="支付宝" focusable="false">
      <path d="M2.541 0H13.5a2.55 2.55 0 0 1 2.54 2.563v8.297c-.006 0-.531-.046-2.978-.813-.412-.14-.916-.327-1.479-.536q-.456-.17-.957-.353a13 13 0 0 0 1.325-3.373H8.822V4.649h3.831v-.634h-3.83V2.121H7.26c-.274 0-.274.273-.274.273v1.621H3.11v.634h3.875v1.136h-3.2v.634H9.99c-.227.789-.532 1.53-.894 2.202-2.013-.67-4.161-1.212-5.51-.878-.864.214-1.42.597-1.746.998-1.499 1.84-.424 4.633 2.741 4.633 1.872 0 3.675-1.053 5.072-2.787 2.08 1.008 6.37 2.738 6.387 2.745v.105A2.55 2.55 0 0 1 13.5 16H2.541A2.55 2.55 0 0 1 0 13.437V2.563A2.55 2.55 0 0 1 2.541 0" />
      <path d="M2.309 9.27c-1.22 1.073-.49 3.034 1.978 3.034 1.434 0 2.868-.925 3.994-2.406-1.602-.789-2.959-1.353-4.425-1.207-.397.04-1.14.217-1.547.58Z" />
    </svg>
  );
}

function WechatPayBrandMark() {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label="微信支付" focusable="false">
      <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z" />
    </svg>
  );
}

export function PaymentDialog({
  open,
  project,
  pending,
  purpose,
  creating,
  error,
  onOpenChange,
  onStart,
  onSwitch,
  onReopen,
  onCheck,
  onContact,
}: {
  open: boolean;
  project?: GeoProject;
  pending?: PendingGeoPayment;
  purpose: GeoPaymentPurpose;
  creating: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onStart: (method: GeoPaymentMethod) => void;
  onSwitch: (method: GeoPaymentMethod) => void;
  onReopen: () => void;
  onCheck: () => void;
  onContact: () => void;
}) {
  const serviceOrder = purpose === "service";
  const platformIds =
    pending?.kind === "monitoring"
      ? pending.platformIds
      : (project?.selectedPlatformIds ?? []);
  const questionId =
    pending?.questionId ?? project?.selectedQuestionId ?? undefined;
  const question = project?.questions.find((item) => item.id === questionId);
  const amountFen =
    pending?.checkout.amountFen ??
    (serviceOrder
      ? (project?.serviceActivation?.amountFen ?? 0)
      : platformIds.length * 200);
  const method = pending?.checkout.fields.type;
  const checkoutExpired = Boolean(
    pending && isGeoCheckoutExpired(pending.checkout),
  );
  const supportRequired =
    pending?.status === "reconciliation_required" ||
    pending?.status === "activation_support_required";
  const category =
    pending?.kind === "service"
      ? pending.category
      : project?.serviceActivation?.category;
  const categoryLabel =
    GEO_QUESTION_CATEGORIES.find((item) => item.id === category)?.title ??
    "GEO 优化";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="geo-dialog geo-payment-dialog"
        overlayClassName="geo-dialog-overlay"
        showCloseButton={false}
      >
        <DialogHeader>
          <span className="geo-dialog-mark">
            <CreditCard size={19} />
          </span>
          <DialogTitle className="geo-dialog-title">
            {pending
              ? supportRequired
                ? pending.status === "activation_support_required"
                  ? "付款后续处理需要支持"
                  : "支付结果需要人工核对"
                : checkoutExpired
                  ? "核对最终支付结果"
                  : "等待支付确认"
              : serviceOrder
                ? "确认一个月 GEO 优化服务"
                : "确认问题监控订单"}
          </DialogTitle>
          <DialogDescription className="geo-dialog-description">
            {serviceOrder
              ? "合同已在企业微信确认。请核对所选问题、服务周期与金额；付款到账后即可创建企业服务账号与看板。"
              : "确认监控范围与金额，付款完成后将自动开始获取平台回答。"}
          </DialogDescription>
        </DialogHeader>

        <section className="geo-payment-order-summary">
          <div>
            <span>{serviceOrder ? "本次优化问题" : "本次监控问题"}</span>
            <strong>{question?.question || "已选择的 GEO 优化问题"}</strong>
          </div>
          <dl>
            {serviceOrder ? (
              <>
                <div>
                  <dt>问题类型</dt>
                  <dd>{categoryLabel}</dd>
                </div>
                <div>
                  <dt>服务周期</dt>
                  <dd>1 个月</dd>
                </div>
              </>
            ) : (
              <>
                <div>
                  <dt>监控平台</dt>
                  <dd>{platformIds.length} 个</dd>
                </div>
                <div>
                  <dt>回答样本</dt>
                  <dd>{platformIds.length * 5} 次</dd>
                </div>
              </>
            )}
            <div>
              <dt>应付金额</dt>
              <dd>
                ¥
                {serviceOrder
                  ? (amountFen / 100).toLocaleString("zh-CN")
                  : (amountFen / 100).toFixed(2)}
              </dd>
            </div>
          </dl>
        </section>

        {!pending ? (
          <section className="geo-payment-methods" aria-label="选择支付方式">
            <p>选择支付方式，在新窗口完成付款。</p>
            <div>
              <button
                type="button"
                className="method-alipay"
                onClick={() => onStart("alipay")}
                disabled={creating}
              >
                <span aria-hidden="true">
                  <AlipayBrandMark />
                </span>
                <strong>支付宝支付</strong>
                <small>推荐使用支付宝完成付款</small>
              </button>
              <button
                type="button"
                className="method-wxpay"
                onClick={() => onStart("wxpay")}
                disabled={creating}
              >
                <span aria-hidden="true">
                  <WechatPayBrandMark />
                </span>
                <strong>微信支付</strong>
                <small>使用微信完成付款</small>
              </button>
            </div>
            {creating && (
              <span className="geo-payment-creating" role="status">
                <LoaderCircle size={15} /> 正在创建订单…
              </span>
            )}
          </section>
        ) : (
          <section
            className={"geo-payment-progress status-" + pending.status}
            aria-live="polite"
          >
            <span className="geo-payment-progress-icon">
              {pending.status === "paid" ? (
                <Check size={20} />
              ) : supportRequired ? (
                <CircleAlert size={20} />
              ) : (
                <LoaderCircle size={20} />
              )}
            </span>
            <div>
              <strong>
                {pending.status === "paid"
                  ? serviceOrder
                    ? "付款已确认，正在进入账号开通流程"
                    : "付款已确认，正在启动监控"
                  : pending.status === "activation_support_required"
                    ? "付款已确认，后续启动需要人工处理"
                    : pending.status === "reconciliation_required"
                      ? "支付结果需要人工核对"
                      : checkoutExpired
                        ? "收银台已关闭，正在核对最终结果"
                        : "收银台已打开，等待付款"}
              </strong>
              <p>{pending.statusMessage}</p>
              <small>
                订单号 {pending.checkout.orderId} ·{" "}
                {method === "wxpay" ? "微信支付" : "支付宝"}
                {pending.lastCheckedAt
                  ? " · 最近检查 " + formatDate(pending.lastCheckedAt)
                  : ""}
              </small>
            </div>
          </section>
        )}

        {pending && creating && (
          <span className="geo-payment-creating" role="status">
            <LoaderCircle size={15} /> 正在切换支付方式…
          </span>
        )}

        {error && (
          <p className="geo-payment-error" role="alert">
            <CircleAlert size={15} /> <span>{error}</span>
          </p>
        )}

        <DialogFooter className="geo-dialog-actions geo-payment-actions">
          <button
            type="button"
            className="geo-secondary-button"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            {pending ? "稍后查看" : "取消"}
          </button>
          {pending && pending.status === "pending" && (
            <>
              {pending.kind === "monitoring" && !checkoutExpired && (
                <button
                  type="button"
                  className="geo-secondary-button"
                  onClick={() =>
                    onSwitch(method === "wxpay" ? "alipay" : "wxpay")
                  }
                  disabled={creating}
                >
                  更换为{method === "wxpay" ? "支付宝" : "微信支付"}
                </button>
              )}
              {!checkoutExpired && (
                <button
                  type="button"
                  className="geo-secondary-button"
                  onClick={onReopen}
                  disabled={creating}
                >
                  重新打开收银台 <ExternalLink size={14} />
                </button>
              )}
              <button
                type="button"
                className="geo-primary-button"
                onClick={onCheck}
                disabled={creating}
              >
                {checkoutExpired ? "核对最终支付结果" : "我已完成支付"}{" "}
                <RotateCw size={14} />
              </button>
              {checkoutExpired && (
                <button
                  type="button"
                  className="geo-secondary-button"
                  onClick={onContact}
                >
                  联系技术支持 <MessageSquareText size={14} />
                </button>
              )}
            </>
          )}
          {supportRequired && (
            <>
              <button
                type="button"
                className="geo-secondary-button"
                onClick={onCheck}
              >
                再次核对 <RotateCw size={14} />
              </button>
              <button
                type="button"
                className="geo-primary-button"
                onClick={onContact}
              >
                联系技术支持 <MessageSquareText size={14} />
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type QuestionMonitoringProps = {
  project: GeoProject;
  onTogglePlatform: (platformId: GeoPlatformId) => void;
  onBack: () => void;
  onCheckout: () => void;
  paymentPending: boolean;
  onRefresh: () => Promise<void>;
  refreshing: boolean;
  lastRefreshedAt?: string;
  onContact: () => void;
};

function QuestionMonitoring({
  project,
  onTogglePlatform,
  onBack,
  onCheckout,
  paymentPending,
  onRefresh,
  refreshing,
  lastRefreshedAt,
  onContact,
}: QuestionMonitoringProps) {
  const monitoringStarted = Boolean(project.monitoring?.runId);

  return (
    <div className="geo-monitor-stage">
      <MonitoringSetup
        project={project}
        onTogglePlatform={onTogglePlatform}
        onBack={onBack}
        onCheckout={onCheckout}
        paymentPending={paymentPending}
        locked={monitoringStarted}
      />
      {monitoringStarted && (
        <MonitoringResults
          project={project}
          onRefresh={onRefresh}
          refreshing={refreshing}
          lastRefreshedAt={lastRefreshedAt}
          onContact={onContact}
        />
      )}
    </div>
  );
}

function MonitoringSetup({
  project,
  onTogglePlatform,
  onBack,
  onCheckout,
  paymentPending,
  locked,
}: {
  project: GeoProject;
  onTogglePlatform: (platformId: GeoPlatformId) => void;
  onBack: () => void;
  onCheckout: () => void;
  paymentPending: boolean;
  locked: boolean;
}) {
  const selectedQuestion = project.questions.find(
    (question) => question.id === project.selectedQuestionId,
  );
  const selectedPlatformIds =
    locked && project.monitoring?.platforms.length
      ? project.monitoring.platforms
      : project.selectedPlatformIds;
  const selectedCount = selectedPlatformIds.length;
  const answers = selectedCount * 5;
  const total = selectedCount * 2;

  return (
    <div className="geo-monitor-view">
      <header className="geo-monitor-header">
        <div>
          <span className="geo-kb-kicker">
            <BarChart3 size={14} /> 问题现状监控
          </span>
          <h2 className="geo-stage-title">选择需要获取回答的平台</h2>
          <p>
            每个平台将独立获取 5 次回答，用于建立当前问题的可见度与内容基线。
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          disabled={paymentPending || locked}
          title={locked ? "本次监控范围已确认" : undefined}
        >
          {locked ? "范围已确认" : "更换问题"}
        </button>
      </header>

      <section className="geo-selected-question">
        <span>当前优化问题</span>
        <p>
          {selectedQuestion?.question || "请先返回问题推荐选择一个优化问题。"}
        </p>
        {selectedQuestion && (
          <small>
            {
              GEO_QUESTION_CATEGORIES.find(
                (category) => category.id === selectedQuestion.category,
              )?.title
            }
          </small>
        )}
      </section>

      <div className="geo-platform-grid">
        {GEO_PLATFORMS.map((platform) => {
          const selected = selectedPlatformIds.includes(platform.id);
          return (
            <button
              key={platform.id}
              type="button"
              className={selected ? "selected" : ""}
              onClick={() => onTogglePlatform(platform.id)}
              aria-pressed={selected}
              disabled={paymentPending || locked}
            >
              <span
                className="geo-platform-icon"
                style={
                  { "--platform-accent": platform.accent } as CSSProperties
                }
              >
                <PlatformLogo src={platform.logo} name={platform.name} />
              </span>
              <span>
                <strong>{platform.name}</strong>
                <small>获取 5 次回答</small>
              </span>
              <span className="geo-platform-price">¥2</span>
              <span className="geo-platform-check">
                {selected && <Check size={13} />}
              </span>
            </button>
          );
        })}
      </div>

      <section className="geo-monitor-method">
        <div>
          <ShieldCheck size={16} />
          <span>
            <strong>统一采样标准</strong>
            <small>同一问题、同一时间窗口、平台独立采样</small>
          </span>
        </div>
        <div>
          <Database size={16} />
          <span>
            <strong>原始回答留档</strong>
            <small>
              {locked
                ? "每次回答及采集时间均已留档"
                : "支付后将保留每次回答及采集时间"}
            </small>
          </span>
        </div>
        <div>
          <BarChart3 size={16} />
          <span>
            <strong>建立现状基线</strong>
            <small>为后续 GEO 优化提供前后对照依据</small>
          </span>
        </div>
      </section>

      <footer className="geo-checkout-bar">
        <div className="geo-checkout-summary">
          <span>
            已选 <strong>{selectedCount}</strong> 个平台
          </span>
          <span>
            预计获取 <strong>{answers}</strong> 次回答
          </span>
        </div>
        <div className="geo-checkout-total">
          <span>本次监控费用</span>
          <strong>¥{total}</strong>
          <small>¥2 × {selectedCount} 个平台</small>
        </div>
        <button
          type="button"
          onClick={onCheckout}
          disabled={selectedCount === 0 || locked}
          title={
            locked
              ? "付款已确认，本次监控范围不可修改"
              : selectedCount === 0
                ? "请先选择至少一个监控平台"
                : paymentPending
                  ? "查看当前订单的支付进度"
                  : "确认订单并选择支付方式"
          }
        >
          {locked
            ? "已完成付款"
            : paymentPending
              ? "查看支付进度"
              : "确认并支付"}
        </button>
      </footer>
    </div>
  );
}

type AssessmentView = "knowledge" | "overview" | "forecast";

type CurrentAssessmentProps = {
  project: GeoProject;
  onContact: () => void;
  onRetryAssessment?: () => void | Promise<void>;
  retryingAssessment?: boolean;
  onStartService?: () => void;
};

type MonitoringResultsProps = {
  project: GeoProject;
  onRefresh: () => Promise<void>;
  refreshing: boolean;
  lastRefreshedAt?: string;
  onContact: () => void;
};

const COMPARISON_LABELS: Record<
  GeoKnowledgeComparisonStatus,
  { label: string; description: string }
> = {
  aligned: { label: "一致覆盖", description: "回答与知识库事实一致" },
  missing: { label: "回答缺失", description: "知识库事实未进入回答" },
  conflict: { label: "事实冲突", description: "回答与知识库存在矛盾" },
  opportunity: { label: "补强机会", description: "可进一步建立语义优势" },
};

export function CurrentAssessment({
  project,
  onContact,
  onRetryAssessment,
  retryingAssessment = false,
  onStartService,
}: CurrentAssessmentProps) {
  const [view, setView] = useState<AssessmentView>("overview");
  const monitoring = project.monitoring;
  const assessment = project.assessment;
  const forecast = project.optimizationForecast;
  const preview = isGeoStylePreviewProject(project);
  const assessmentStarted = Boolean(
    assessment && assessment.status !== "not_started",
  );

  if (monitoring?.status !== "completed" && !assessmentStarted) {
    return (
      <div className="geo-assessment-view">
        <div className="geo-assessment-empty">
          <LockKeyhole size={24} />
          <h2>现状评估尚未解锁</h2>
          <p>平台回答采集完成后，将在这里生成知识对照、现状基线与优化目标。</p>
        </div>
      </div>
    );
  }

  const assessmentReady = assessment?.status === "ready";
  const assessmentFailed = assessment?.status === "failed";

  return (
    <div className="geo-assessment-view">
      <header className="geo-assessment-header">
        <div>
          <span className="geo-kb-kicker">
            <BarChart3 size={14} /> 企业 GEO 现状评估
          </span>
          <h2 className="geo-stage-title">从知识事实，找到可提升的答案空间</h2>
          <p>识别当前表现，并给出未来一个月的提升建议与条件目标区间</p>
        </div>
        <div className="geo-assessment-actions">
          <span
            className={`geo-assessment-state state-${
              retryingAssessment ? "running" : (assessment?.status ?? "queued")
            }`}
          >
            <span />
            {assessmentReady
              ? "评估已生成"
              : retryingAssessment
                ? "正在重新评估"
                : assessmentFailed
                  ? "评估需支持"
                  : "正在生成评估"}
          </span>
          {assessmentFailed && !preview && (
            <>
              {onRetryAssessment && (
                <button
                  type="button"
                  className="geo-assessment-refresh is-retry"
                  onClick={() => void onRetryAssessment()}
                  disabled={retryingAssessment}
                  aria-busy={retryingAssessment}
                >
                  <RotateCw
                    size={14}
                    className={retryingAssessment ? "is-spinning" : undefined}
                  />
                  {retryingAssessment ? "正在重新评估" : "重新评估"}
                </button>
              )}
              <button
                type="button"
                className="geo-assessment-refresh is-retry"
                onClick={onContact}
              >
                联系技术支持
              </button>
            </>
          )}
        </div>
      </header>

      <div
        className="geo-assessment-tabs geo-assessment-section-tabs"
        role="tablist"
        aria-label="现状评估板块"
      >
        {(
          [
            ["knowledge", "知识库对照", Database],
            ["overview", "当前评估总览", BarChart3],
            ["forecast", "优化后效果评估", Sparkles],
          ] as Array<[AssessmentView, string, typeof BarChart3]>
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            className={view === id ? "active" : ""}
            onClick={() => setView(id)}
          >
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {view === "knowledge" ? (
        <KnowledgeComparison project={project} />
      ) : view === "overview" ? (
        <AssessmentOverview
          project={project}
          assessmentReady={assessmentReady}
        />
      ) : (
        <OptimizationForecastView project={project} onContact={onContact} />
      )}

      {assessmentReady &&
        forecast?.status === "ready" &&
        project.serviceActivation &&
        onStartService && (
          <section className="geo-assessment-next-step">
            <div>
              <span>下一步 · 启动服务</span>
              <p>
                围绕当前选定问题启动 GEO
                优化服务，开始内容建设、权威信源、平台监控与结果复测。
              </p>
            </div>
            <button
              type="button"
              className="geo-primary-button"
              onClick={onStartService}
            >
              {project.serviceActivation.status === "active"
                ? "查看已启动服务"
                : "进入下一步：启动服务"}
              <ArrowRight size={17} />
            </button>
          </section>
        )}
    </div>
  );
}

export function MonitoringResults({
  project,
  onRefresh,
  refreshing,
  lastRefreshedAt,
  onContact,
}: MonitoringResultsProps) {
  const monitoring = project.monitoring;
  if (!monitoring?.runId) return null;

  const preview = isGeoStylePreviewProject(project);
  const selectedQuestion = project.questions.find(
    (question) => question.id === project.selectedQuestionId,
  );
  const platformIds =
    monitoring.platforms.length > 0
      ? monitoring.platforms
      : project.selectedPlatformIds;
  const finishedRecords =
    monitoring.completedRecords + monitoring.failedRecords;
  const expectedRecords = Math.max(
    monitoring.expectedRecords,
    platformIds.length * 5,
  );
  const progress =
    expectedRecords > 0
      ? Math.min(100, Math.round((finishedRecords / expectedRecords) * 100))
      : 0;
  const answersAvailable = monitoring.answers.length > 0;
  const monitoringFailed = monitoring.status === "failed";
  const partialReview = monitoring.status === "partial_review";
  const monitoringCompleted = monitoring.status === "completed";
  const autoRefreshActive = !preview && shouldAutoRefreshGeoProject(project);
  const autoRefreshDelay = geoAutoRefreshDelayLabel(project);
  const selectedQuestionCategory = selectedQuestion
    ? GEO_QUESTION_CATEGORIES.find(
        (category) => category.id === selectedQuestion.category,
      )?.title
    : undefined;

  return (
    <div className="geo-monitor-view geo-monitor-results">
      <header className="geo-assessment-header">
        <div>
          <span className="geo-kb-kicker">
            <RadioTower size={14} /> 问题监控
          </span>
          <h2 className="geo-stage-title">
            {monitoringCompleted
              ? "平台回答采集完成"
              : partialReview
                ? "平台回答采集未完整结束"
                : monitoringFailed
                  ? "平台回答采集异常"
                  : "平台回答正在采集"}
          </h2>
          <p>
            平台采样结果按回答轮次独立归档，可逐条查看正文、相关媒体与来源信息。
          </p>
        </div>
        <div className="geo-assessment-actions">
          <span className={`geo-assessment-state state-${monitoring.status}`}>
            <span />
            {monitoringCompleted
              ? "采集完成"
              : monitoringFailed
                ? "采集异常"
                : partialReview
                  ? "部分结果已返回"
                  : "采集中"}
          </span>
          <button
            type="button"
            className="geo-assessment-refresh"
            onClick={() => void onRefresh()}
            disabled={preview || refreshing}
            title={preview ? "样式预览中不可刷新" : "获取最新采集状态"}
          >
            <RotateCw
              size={15}
              className={refreshing ? "is-spinning" : undefined}
            />
            {refreshing ? "正在刷新" : "刷新状态"}
          </button>
          <small className="geo-assessment-refreshed" aria-live="polite">
            {lastRefreshedAt ? (
              <>
                最后刷新{" "}
                <time dateTime={lastRefreshedAt}>
                  {formatDate(lastRefreshedAt)}
                </time>
                {autoRefreshActive
                  ? ` · 自动刷新已开启（预计 ${autoRefreshDelay}后）`
                  : ""}
              </>
            ) : autoRefreshActive ? (
              `预计 ${autoRefreshDelay}后自动刷新`
            ) : partialReview ? (
              "结果不完整，自动刷新与后续评估已停止"
            ) : monitoringFailed ? (
              "采集已停止，请根据错误信息处理"
            ) : (
              "采集状态将持续更新"
            )}
          </small>
        </div>
      </header>

      <section className="geo-monitor-query-card" aria-label="本次监控问题">
        <span className="geo-monitor-query-mark" aria-hidden="true">
          <MessageSquareText size={20} />
        </span>
        <div className="geo-monitor-query-copy">
          <span>本次监控问题</span>
          <h3>{selectedQuestion?.question || "请先选择一个 GEO 优化问题"}</h3>
          <p>
            {platformIds.length} 个平台分别获取 5 次回答，共 {expectedRecords}{" "}
            个采样槽位
          </p>
        </div>
        {selectedQuestionCategory && (
          <small className="geo-monitor-query-category">
            {selectedQuestionCategory}
          </small>
        )}
      </section>

      <section className="geo-capture-progress" aria-label="监控采集进度">
        <div className="geo-capture-progress-copy">
          <div>
            <span>回答采集进度</span>
            <strong>
              {finishedRecords} / {expectedRecords} 条已完成采集
            </strong>
          </div>
          <b>{progress}%</b>
        </div>
        <div className="geo-capture-track" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="geo-capture-meta">
          <span>{platformIds.length} 个平台 · 每平台 5 次</span>
          <span>
            {autoRefreshActive
              ? `下次刷新预计在 ${autoRefreshDelay}后 · 页面进入后台时暂停`
              : "每次回答均按平台与采集轮次独立留档"}
          </span>
        </div>
      </section>

      <PlatformRunMatrix
        platformIds={platformIds}
        answers={monitoring.answers}
      />

      {monitoringFailed && (
        <div className="geo-assessment-alert danger" role="alert">
          <CircleAlert size={17} />
          <div>
            <strong>本次监控未能完成</strong>
            <p>{monitoring.error || "暂未收到可用结果，请稍后刷新状态。"}</p>
            <button
              type="button"
              className="geo-secondary-button"
              onClick={onContact}
            >
              联系技术支持
            </button>
          </div>
        </div>
      )}

      {partialReview && (
        <div className="geo-assessment-alert warning" role="status">
          <CircleAlert size={17} />
          <div>
            <strong>本次采集结果不完整，已停止自动评估</strong>
            <p>
              已返回内容可以先行查阅；请刷新确认最终状态，仍缺少采样时请联系技术支持重新发起采集。
            </p>
            <button
              type="button"
              className="geo-secondary-button"
              onClick={onContact}
            >
              联系技术支持
            </button>
          </div>
        </div>
      )}

      {answersAvailable && (
        <section className="geo-monitor-answer-intro">
          <div>
            <span>平台回答</span>
            <h3>按平台与轮次查看采集结果</h3>
          </div>
          <small>
            {monitoring.completedRecords} 条有效回答
            {monitoring.failedRecords > 0
              ? ` · ${monitoring.failedRecords} 次未返回`
              : ""}
          </small>
        </section>
      )}

      {!answersAvailable && !monitoringFailed ? (
        <AssessmentWaitingState />
      ) : (
        <MonitoringAnswerList
          platformIds={platformIds}
          answers={monitoring.answers}
        />
      )}
    </div>
  );
}

function PlatformRunMatrix({
  platformIds,
  answers,
}: {
  platformIds: GeoPlatformId[];
  answers: GeoMonitoringAnswer[];
}) {
  return (
    <div className="geo-run-matrix" aria-label="各平台五次回答状态">
      {platformIds.map((platformId) => {
        const platform = GEO_PLATFORMS.find((item) => item.id === platformId);
        const platformAnswers = answers.filter(
          (answer) => answer.platformId === platformId,
        );
        const completed = platformAnswers.filter(
          (answer) => answer.status === "completed" && answer.answer,
        ).length;
        return (
          <article key={platformId}>
            <span
              className="geo-platform-icon"
              style={
                {
                  "--platform-accent": platform?.accent ?? "#3d1560",
                } as CSSProperties
              }
            >
              <PlatformLogo
                src={platform?.logo ?? ""}
                name={platform?.name ?? platformId}
              />
            </span>
            <div>
              <strong>{platform?.name ?? platformId}</strong>
              <small>{completed}/5 条有效回答</small>
            </div>
            <span className="geo-run-dots" aria-label={`${completed} 次已完成`}>
              {Array.from({ length: 5 }, (_, index) => {
                const answer = platformAnswers.find(
                  (item) => item.runIndex === index + 1,
                );
                const state = answer?.status ?? "waiting";
                return <i key={index} className={`state-${state}`} />;
              })}
            </span>
          </article>
        );
      })}
    </div>
  );
}

function AssessmentWaitingState() {
  return (
    <section className="geo-assessment-waiting">
      <div className="geo-assessment-rings" aria-hidden="true">
        <span>
          <RadioTower size={25} />
        </span>
        <i />
        <i />
      </div>
      <div>
        <span>回答采集中</span>
        <h3>首批平台回答即将返回</h3>
        <p>
          回答返回后，将按平台和轮次展示正文、媒体和检索参考来源。采集完成后即可进入现状评估。
        </p>
      </div>
    </section>
  );
}

export function AssessmentOverview({
  project,
  assessmentReady,
}: {
  project: GeoProject;
  assessmentReady: boolean;
}) {
  const assessment = project.assessment;
  if (project.assessmentUpdatingToVersion2) {
    return (
      <section className="geo-evaluation-pending" aria-live="polite">
        <span>
          <Database size={22} />
        </span>
        <div>
          <strong>评估结果正在按新版口径更新</strong>
          <p>完成后会自动显示新版五维评分和优化建议，无需手动刷新。</p>
        </div>
      </section>
    );
  }
  if (!assessmentReady || assessment?.totalScore === undefined) {
    return (
      <section className="geo-evaluation-pending">
        <span>
          <Database size={22} />
        </span>
        <div>
          <strong>
            {assessment?.status === "failed"
              ? "现状评估暂未生成"
              : "正在建立语义资产现状基线"}
          </strong>
          <p>
            {assessment?.error ||
              "真实监控答案已开始返回。完整样本就绪后，系统将使用企业知识库进行一致性、权威性与竞争表现评估。"}
          </p>
          {assessment?.failureCode && (
            <small>支持码：{assessment.failureCode}</small>
          )}
        </div>
      </section>
    );
  }

  const score = Math.round(assessment.totalScore * 10) / 10;
  const customerAssessment = assessment as GeoAssessmentResult & {
    executiveSummary?: string;
  };
  const assessmentSummary = customerFacingText(
    customerAssessment.executiveSummary,
    "当前回答已经形成基础品牌认知，但事实边界、可信来源和差异化表达仍需加强。下一步应先统一事实口径，再补齐能够被平台理解和引用的内容。",
  );
  return (
    <div className="geo-assessment-overview">
      <section className="geo-score-hero">
        <div
          className="geo-score-ring"
          style={{
            background: `conic-gradient(#3d1560 ${score * 3.6}deg, #e9e4ec 0deg)`,
          }}
          aria-label={`现状得分 ${score} 分`}
        >
          <span>
            <strong>{score}</strong>
            <small>/ 100</small>
          </span>
        </div>
        <div className="geo-score-copy">
          <span>本题回答表现</span>
          <h3>
            当前等级 <b>{assessment.grade || "—"}</b>
          </h3>
          <p>{assessmentSummary}</p>
          {!isGeoStylePreviewProject(project) && (
            <div>
              <span>
                生成时间 <strong>{formatDate(assessment.generatedAt)}</strong>
              </span>
            </div>
          )}
        </div>
      </section>

      <DimensionScores dimensions={assessment.dimensions} />
      <AssessmentSupportingResults assessment={assessment} />
    </div>
  );
}

function DimensionScores({
  dimensions,
}: {
  dimensions: GeoAssessmentDimension[];
}) {
  if (dimensions.length === 0) {
    return (
      <div className="geo-no-derived-data">
        评估结果正在校验，完成前暂不展示分值。
      </div>
    );
  }
  return (
    <section className="geo-dimension-panel">
      <header>
        <h3>五维语义资产现状</h3>
      </header>
      <div className="geo-dimension-list">
        {dimensions.map((dimension, index) => {
          const customerDimension = dimension as typeof dimension & {
            currentFinding?: string;
          };
          const ratio = Math.max(
            0,
            Math.min(100, (dimension.score / dimension.maxScore) * 100),
          );
          return (
            <article key={dimension.id}>
              <span className="geo-dimension-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <div className="geo-dimension-label">
                  <strong>
                    {customerFacingText(
                      dimension.label,
                      CUSTOMER_DIMENSION_LABELS[dimension.id],
                    )}
                  </strong>
                  <span>
                    {dimension.score} / {dimension.maxScore}
                  </span>
                </div>
                <div className="geo-dimension-track">
                  <span style={{ width: `${ratio}%` }} />
                </div>
                <small>
                  {customerFacingText(
                    customerDimension.currentFinding,
                    CUSTOMER_DIMENSION_COPY[dimension.id].finding,
                  )}
                </small>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function formatAssessmentRate(value: number | null) {
  return value === null ? "不适用" : `${Math.round(value * 1000) / 10}%`;
}

const ASSESSMENT_SENTIMENT_LABELS: Record<
  GeoAssessmentPlatformBreakdown["sentiment"],
  string
> = {
  positive: "正向",
  neutral: "中性",
  negative: "负向",
  mixed: "混合",
  unknown: "未判定",
};

const INTERNAL_CUSTOMER_TERM_PATTERN =
  /\b(?:unavailable|unknown|question_baseline(?:_v2)?|citationList|referenceList|evidenceRefs|calculationBasis|measurementStatus|sourceCount|rationale|observed_outcome|direct_asset|not_applicable|schema)\b|\b(?:[a-z][a-z0-9_-]*\/)?run[-_ ]?[0-9]+\b|来源线索|答案引用|检索参考/i;

const CUSTOMER_DIMENSION_COPY: Record<
  GeoAssessmentDimension["id"],
  { finding: string; action: string }
> = {
  semantic_visibility: {
    finding: "当前回答已经能够识别品牌及其核心业务，稳定覆盖仍有提升空间。",
    action: "围绕核心问题补齐清晰、可检索的品牌与业务说明。",
  },
  semantic_coherence: {
    finding: "核心事实基本一致，部分能力边界和条件仍需统一。",
    action: "建立统一事实口径，并同步到官网、问答和审核清单。",
  },
  semantic_richness: {
    finding: "回答已覆盖部分关键方面，但场景、风险和采购建议还不够完整。",
    action: "补齐场景问答、风险边界和采购核验内容。",
  },
  semantic_authority: {
    finding: "现有事实具备一定依据，重要主张仍需更多可追溯来源支持。",
    action: "为重要事实建立官方页面和独立、可核验的来源路径。",
  },
  competitive_advantage: {
    finding: "部分差异点已经进入回答，但表达还不够稳定和具体。",
    action: "集中说明已经证实的差异点，并写清适用范围。",
  },
};

const CUSTOMER_DIMENSION_LABELS: Record<GeoAssessmentDimension["id"], string> =
  {
    semantic_visibility: "语义可见度",
    semantic_coherence: "语义一致性",
    semantic_richness: "语义多样性与深度",
    semantic_authority: "语义权威性",
    competitive_advantage: "竞品占优度",
  };

function customerFacingText(value: string | undefined, fallback: string) {
  const normalized = value?.trim();
  if (!normalized || INTERNAL_CUSTOMER_TERM_PATTERN.test(normalized)) {
    return fallback;
  }
  return normalized;
}

function optionalCustomerFacingText(value: string | undefined) {
  const normalized = value?.trim();
  return normalized && !INTERNAL_CUSTOMER_TERM_PATTERN.test(normalized)
    ? normalized
    : undefined;
}

function customerFacingVerificationGate(value: string | undefined) {
  return customerFacingText(
    value,
    "本阶段交付物已经完成核验并可以追溯。",
  ).replace(/^(?:(?:阶段验证|验收标准)\s*[：:]\s*)+/, "");
}

function AssessmentSupportingResults({
  assessment,
}: {
  assessment: GeoAssessmentResult;
}) {
  const platformBreakdown = assessment.platformBreakdown ?? [];
  const priorityActions = assessment.priorityActions ?? [];

  return (
    <div className="geo-assessment-supporting-results">
      {platformBreakdown.length > 0 && (
        <section className="geo-assessment-detail-panel">
          <header>
            <div>
              <h3>平台评估拆分</h3>
            </div>
            <small>仅展示本题有效回答与可理解的业务指标</small>
          </header>
          <div className="geo-assessment-platform-grid">
            {platformBreakdown.map((item) => {
              const platform = GEO_PLATFORMS.find(
                (candidate) => candidate.id === item.platformId,
              );
              const sourceData = item as GeoAssessmentPlatformBreakdown & {
                sourceCount?: number;
                citationCount?: number;
                referenceCount?: number;
              };
              const sourceCount =
                sourceData.sourceCount ??
                Math.max(
                  sourceData.citationCount ?? 0,
                  sourceData.referenceCount ?? 0,
                );
              return (
                <article key={item.platformId}>
                  <div className="geo-assessment-platform-heading">
                    <PlatformLogo
                      src={platform?.logo ?? ""}
                      name={platform?.name ?? item.platformId}
                    />
                    <div>
                      <strong>{platform?.name ?? item.platformId}</strong>
                      <small>
                        有效回答 {item.successfulResponses} /{" "}
                        {item.responseCount}
                      </small>
                    </div>
                  </div>
                  <dl>
                    <div>
                      <dt>品牌提及率</dt>
                      <dd>{formatAssessmentRate(item.brandMentionRate)}</dd>
                    </div>
                    <div>
                      <dt>事实准确率</dt>
                      <dd>{formatAssessmentRate(item.factAccuracy)}</dd>
                    </div>
                    <div>
                      <dt>主张命中率</dt>
                      <dd>{formatAssessmentRate(item.propositionHitRate)}</dd>
                    </div>
                    <div>
                      <dt>平均排名</dt>
                      <dd>{item.averageRank ?? "不适用"}</dd>
                    </div>
                    <div>
                      <dt>可追溯来源</dt>
                      <dd>{sourceCount}</dd>
                    </div>
                    <div>
                      <dt>情绪判断</dt>
                      <dd>{ASSESSMENT_SENTIMENT_LABELS[item.sentiment]}</dd>
                    </div>
                  </dl>
                  {item.verdict && (
                    <p>
                      {customerFacingText(
                        item.verdict,
                        "当前平台已返回有效回答，具体结论以本题的五维评分和优先动作为准。",
                      )}
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      <div className="geo-assessment-detail-grid">
        {priorityActions.length > 0 && (
          <section className="geo-assessment-detail-panel">
            <header>
              <div>
                <h3>评估优先动作</h3>
              </div>
            </header>
            <ol className="geo-assessment-priority-list">
              {priorityActions.map((item) => {
                const dimensionLabel = assessment.dimensions.find(
                  (dimension) => dimension.id === item.dimension,
                )?.label;
                return (
                  <li key={`${item.priority}-${item.dimension}-${item.action}`}>
                    <span>{item.priority}</span>
                    <div>
                      <small>
                        {customerFacingText(
                          dimensionLabel,
                          CUSTOMER_DIMENSION_LABELS[item.dimension],
                        )}
                      </small>
                      <strong>
                        {customerFacingText(
                          item.action,
                          CUSTOMER_DIMENSION_COPY[item.dimension].action,
                        )}
                      </strong>
                      {optionalCustomerFacingText(item.expectedImpact) && (
                        <p>{optionalCustomerFacingText(item.expectedImpact)}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        <aside className="geo-assessment-scope-note">
          本结果反映当前问题在所选平台的回答表现，不代表全网自然排名。
        </aside>
      </div>
    </div>
  );
}

export function OptimizationForecastView({
  project,
  onContact,
}: {
  project: GeoProject;
  onContact: () => void;
}) {
  const forecast = project.optimizationForecast;
  const horizonWeeks = forecast?.horizonWeeks ?? 4;
  const horizonLabel = horizonWeeks === 4 ? "一个月" : `${horizonWeeks} 周`;

  if (
    forecast?.status !== "ready" ||
    forecast.currentScore === undefined ||
    forecast.targetLow === undefined ||
    forecast.targetHigh === undefined
  ) {
    return (
      <section className="geo-evaluation-pending geo-forecast-pending">
        <span>
          <Sparkles size={22} />
        </span>
        <div>
          <strong>
            {forecast?.status === "failed"
              ? "优化后效果评估暂未生成"
              : "正在生成优化效果评估"}
          </strong>
          <p>
            {forecast?.status === "failed"
              ? forecast.error ||
                "系统暂时无法生成结果，请联系技术支持协助处理。"
              : "正在生成优化效果评估，通常需要约 5 分钟；完成后会自动显示，无需手动刷新。"}
          </p>
          {forecast?.failureCode && (
            <small>支持码：{forecast.failureCode}</small>
          )}
          {forecast?.status === "failed" &&
            !isGeoStylePreviewProject(project) && (
              <button
                type="button"
                className="geo-assessment-refresh geo-evaluation-support"
                onClick={onContact}
              >
                联系技术支持
              </button>
            )}
        </div>
      </section>
    );
  }

  const formatForecastScore = (value: number) =>
    (Math.round(value * 10) / 10).toFixed(1);
  const currentScore = formatForecastScore(forecast.currentScore);
  const targetLow = formatForecastScore(forecast.targetLow);
  const targetHigh = formatForecastScore(forecast.targetHigh);
  const targetExpected =
    forecast.targetExpected === undefined
      ? undefined
      : formatForecastScore(forecast.targetExpected);
  const customerForecast = forecast as typeof forecast & {
    executiveSummary?: string;
    targetCondition?: string;
  };
  const executiveSummary = customerFacingText(
    customerForecast.executiveSummary,
    "当前回答已经形成基础品牌认知，但事实边界、可信来源和差异化表达仍需加强。本月优先统一事实口径、补齐关键问答并建设可追溯来源。内容发布后，将按相同问题和采样规则复测实际效果。",
  );
  const targetCondition = customerFacingText(
    customerForecast.targetCondition,
    `完成路线中的事实核验、内容发布与来源建设后，第 ${horizonWeeks} 周按相同问题、平台和采样规则复测。`,
  );

  return (
    <div className="geo-forecast-view">
      <section className="geo-forecast-hero">
        <div className="geo-forecast-hero-copy">
          <span className="geo-forecast-eyebrow">
            <Sparkles size={14} /> {horizonLabel}条件目标区间
          </span>
          <h3>把现状差距，转化为可执行的提升路径</h3>
          <p>{executiveSummary}</p>
        </div>

        <div
          className="geo-forecast-score-journey"
          aria-label="本题可测项表现与目标区间"
        >
          <div>
            <span>本题可测项表现</span>
            <strong>{currentScore}</strong>
            <small>/ 100</small>
          </div>
          <ArrowRight size={22} aria-hidden="true" />
          <div className="geo-forecast-target-score">
            <span>{horizonLabel}目标区间</span>
            <strong>
              {targetLow}
              <i>–</i>
              {targetHigh}
            </strong>
            {targetExpected && <small>预期 {targetExpected}</small>}
          </div>
        </div>

        <div className="geo-forecast-conditions">
          <ShieldCheck size={16} />
          <span>{targetCondition}</span>
        </div>
      </section>

      {forecast.dimensions.length > 0 && (
        <section className="geo-forecast-dimensions">
          <header>
            <div>
              <span>分维度提升空间</span>
              <h3>每项提升都对应明确动作</h3>
            </div>
          </header>
          <div className="geo-forecast-dimension-grid">
            {forecast.dimensions.map((dimension, index) => {
              const customerDimension = dimension as typeof dimension & {
                currentFinding?: string;
                nextAction?: string;
              };
              return (
                <article key={dimension.id}>
                  <div className="geo-forecast-dimension-heading">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>
                        {customerFacingText(
                          dimension.label,
                          CUSTOMER_DIMENSION_LABELS[dimension.id],
                        )}
                      </strong>
                      <small>
                        {customerFacingText(
                          customerDimension.currentFinding,
                          CUSTOMER_DIMENSION_COPY[dimension.id].finding,
                        )}
                      </small>
                    </div>
                  </div>
                  <div className="geo-forecast-dimension-values">
                    <span>
                      当前{" "}
                      <strong>
                        {formatForecastScore(dimension.currentScore)}
                      </strong>
                    </span>
                    <ArrowRight size={14} aria-hidden="true" />
                    <span>
                      目标{" "}
                      <strong>
                        {formatForecastScore(dimension.targetLow)}–
                        {formatForecastScore(dimension.targetHigh)}
                      </strong>
                      <small>
                        预期 {formatForecastScore(dimension.targetExpected)}
                      </small>
                    </span>
                  </div>
                  <p className="geo-forecast-next-action">
                    <Check size={13} />
                    <span>
                      {customerFacingText(
                        customerDimension.nextAction,
                        CUSTOMER_DIMENSION_COPY[dimension.id].action,
                      )}
                    </span>
                  </p>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <div className="geo-forecast-plan-grid">
        <section className="geo-forecast-roadmap">
          <header>
            <span>分阶段路线</span>
            <h3>{horizonLabel}优化推进节奏</h3>
          </header>
          {forecast.roadmap.length > 0 ? (
            <ol>
              {forecast.roadmap.map((item) => (
                <li key={`${item.phase}-${item.weeks}`}>
                  <span>{item.phase}</span>
                  <div>
                    <small>{item.weeks}</small>
                    <h4>
                      {customerFacingText(
                        item.title,
                        `第 ${item.phase} 周重点任务`,
                      )}
                    </h4>
                    <ul>
                      {item.actions.slice(0, 3).map((action) => (
                        <li key={action}>
                          {customerFacingText(
                            action,
                            "完成本阶段计划，并解决对应的事实与内容缺口。",
                          )}
                        </li>
                      ))}
                    </ul>
                    <p>
                      <ShieldCheck size={13} /> 验收标准：
                      {customerFacingVerificationGate(item.verificationGate)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="geo-forecast-empty-copy">
              分阶段路线将在优化目标确认后生成。
            </p>
          )}
          {forecast.assumptions.length > 0 && (
            <div className="geo-forecast-roadmap-assumptions">
              <strong>路线执行条件</strong>
              <p>
                完成事实核验、内容发布与来源建设后，第 {horizonWeeks}{" "}
                周按相同问题、平台和采样规则复测。
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

const GEO_SERVICE_STAGES = [
  {
    id: "mindpromise",
    line: "智诺",
    tone: "promise",
    title: "认知治理与证据建设",
    summary:
      "先建立可复现的品牌认知基线，再校准事实、证据与公开信息，形成可持续复测的优化闭环。",
    deliverables: [
      "多平台回答基线",
      "品牌语义与证据清单",
      "舆情风险台账",
      "本月复测报告",
    ],
    checkpoint:
      "问题口径、采样记录与优化项均可追溯；复测保持同平台、同次数与同判定规则。",
    services: [
      {
        id: "ai-brand",
        title: "AI 监控与品牌优化",
        description: "围绕目标问题建立跨平台、可复现的回答基线。",
        icon: RadioTower,
        actions: [
          "六个平台 × 5 轮同口径采样与原文留档",
          "识别主体事实、引用来源与竞品表达偏差",
          "按业务影响生成修正优先级与执行工单",
        ],
        output: "交付：平台回答基线、问题差距清单",
        logos: [
          ["/geo-builder/platforms/doubao.png", "豆包"],
          ["/geo-builder/platforms/yuanbao.png", "元宝"],
          ["/geo-builder/platforms/deepseek.ico", "DeepSeek"],
          ["/geo-builder/platforms/baiduai.svg", "百度 AI+"],
          ["/geo-builder/platforms/qianwen.png", "通义千问"],
          ["/geo-builder/platforms/kimi.ico", "Kimi"],
        ],
      },
      {
        id: "reputation-radar",
        title: "全网信息与舆情监控",
        description: "把公开声量、议题变化与潜在风险统一纳入监测。",
        icon: Globe2,
        actions: [
          "覆盖微博、抖音、公众号与重点媒体矩阵",
          "完成议题聚类、声量走势与风险等级判定",
          "重大舆情进入提醒、核验与处置建议流程",
        ],
        output: "交付：舆情看板、风险工单与周度简报",
        logos: [
          ["/geo-builder/channels/douyin.svg", "抖音"],
          ["/geo-builder/channels/wechat.svg", "微信公众号"],
          ["/geo-builder/channels/wechat-channels.svg", "微信视频号"],
        ],
      },
      {
        id: "semantic-publishing",
        title: "语义资产发布与复测",
        description: "将核验后的标准表达落到可抓取、可引用的公开载体。",
        icon: FileText,
        actions: [
          "整理标准问答、实体关系与证据引用清单",
          "规划官网、权威媒体与内容矩阵的发布落位",
          "按相同问题和采样次数复测并记录变化",
        ],
        output: "交付：发布清单、收录记录与优化复测报告",
        logos: [
          ["/geo-builder/channels/frontmind.svg", "AI 专用官网"],
          ["/geo-builder/channels/baidu-baike.svg", "百度百科"],
          ["/geo-builder/channels/zhihu.svg", "知乎"],
        ],
      },
    ],
  },
  {
    id: "mindreach",
    line: "智达",
    tone: "reach",
    title: "获客运营与转化闭环",
    summary:
      "把公开需求信号转化为可跟进线索，通过知识库回复、人工接管与持续运营连接真实业务结果。",
    deliverables: [
      "线索采集规则",
      "意向分层规范",
      "回复与接管 SOP",
      "周度漏斗看板",
    ],
    checkpoint:
      "抽样线索可回溯至原始来源；分层规则通过业务抽检，人工接管、超时与异常路径可用。",
    services: [
      {
        id: "public-leads",
        title: "公域线索采集",
        description: "从公开互动中识别需求信号并形成结构化线索池。",
        icon: Search,
        actions: [
          "配置目标平台、议题、人群与采集边界",
          "完成公开互动采集、去重、过滤和来源留痕",
          "按场景、需求与紧迫度进行意向分层",
        ],
        output: "交付：结构化线索池、意向标签与字段规范",
        logos: [
          ["/geo-builder/channels/xiaohongshu.svg", "小红书"],
          ["/geo-builder/channels/douyin.svg", "抖音"],
          ["/geo-builder/channels/wechat-channels.svg", "微信视频号"],
        ],
      },
      {
        id: "wechat-followup",
        title: "微信 AI 回复与跟进",
        description: "让知识库回复、人工跟进与线索状态在同一队列协同。",
        icon: MessageSquareText,
        actions: [
          "接入企业知识库并校准高频问题回复",
          "设置分配、提醒、跟进 SLA 与人工接管规则",
          "留存关键对话、意向变化与下一步动作",
        ],
        output: "交付：微信话术库、跟进队列与转人工规则",
        logos: [["/geo-builder/channels/wechat.svg", "微信"]],
      },
      {
        id: "managed-growth",
        title: "全域社媒代运营获客",
        description: "用持续内容运营承接品牌认知，并按结果复盘转化。",
        icon: Handshake,
        actions: [
          "完成选题、排期、制作与多平台分发",
          "联动投放数据、私域承接与销售协同",
          "按有效线索与成交结果复盘下一轮内容",
        ],
        output: "交付：运营排期、转化看板与月度增长复盘",
        logos: [
          ["/geo-builder/channels/xiaohongshu.svg", "小红书"],
          ["/geo-builder/channels/douyin.svg", "抖音"],
          ["/geo-builder/channels/wechat-channels.svg", "微信视频号"],
        ],
      },
    ],
  },
  {
    id: "mindnexus",
    line: "智汇",
    tone: "nexus",
    title: "业务嵌入与能力沉淀",
    summary:
      "由 FDE 进入业务现场，把已验证的方法连接到流程、数据与系统，并形成可运营、可回退的企业能力。",
    deliverables: [
      "流程与系统蓝图",
      "试点工作流",
      "接口与风险清单",
      "上线运维手册",
    ],
    checkpoint:
      "试点流程可端到端运行；关键操作具备权限与日志，异常能够人工接管并安全回退。",
    services: [
      {
        id: "fde-diagnosis",
        title: "FDE 入驻与现场诊断",
        description: "与关键岗位共同确定最值得先落地的业务试点。",
        icon: BriefcaseBusiness,
        actions: [
          "访谈关键角色并梳理现有业务流程",
          "盘点系统、数据、权限与合规边界",
          "按价值、风险与复杂度确定试点优先级",
        ],
        output: "交付：流程蓝图、系统盘点与试点范围",
        logos: [["/geo-builder/channels/frontmind.svg", "FrontMind FDE"]],
      },
      {
        id: "workflow-implementation",
        title: "AI 工作流开发与集成",
        description: "把试点场景连接到必要系统，并保留可控的人机协同。",
        icon: Cpu,
        actions: [
          "开发任务编排、知识调用与系统接口",
          "设置审批、人工复核、日志和异常回退",
          "完成测试环境联调与数据质量校验",
        ],
        output: "交付：试点工作流、接口清单与测试记录",
        logos: [["/geo-builder/channels/frontmind.svg", "FrontMind FDE"]],
      },
      {
        id: "handover",
        title: "上线验收与能力移交",
        description: "通过小范围运行验证价值，并把运营能力交给企业团队。",
        icon: BadgeCheck,
        actions: [
          "开展试运行、场景验收与关键指标复盘",
          "培训业务与技术人员并固化操作规范",
          "建立版本管理、监控指标与持续迭代机制",
        ],
        output: "交付：上线手册、培训材料与效益看板",
        logos: [["/geo-builder/channels/frontmind.svg", "FrontMind FDE"]],
      },
    ],
  },
] as const;

function safeServiceHandoffUrl(value?: string) {
  return safePublicAppUrl(value, {
    allowLocalDevelopment: import.meta.env.DEV,
  });
}

export function GeoWorkspaceHandoff({
  project,
  onRefresh,
}: {
  project: GeoProject;
  onRefresh?: () => Promise<string | void>;
}) {
  const activation = project.serviceActivation;
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const workspaceUrl = safeServiceHandoffUrl(activation?.workspaceUrl);
  const accountSetupUrl = safeServiceHandoffUrl(activation?.accountSetupUrl);
  const handoffUrl = workspaceUrl || accountSetupUrl;
  const handoffLabel = workspaceUrl ? "进入企业服务工作台" : "完成账号设置";

  const refreshHandoff = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshing(true);
    setRefreshError("");
    try {
      await onRefresh();
    } catch (error) {
      setRefreshError(errorMessage(error));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <section
      className="geo-workspace-handoff"
      aria-labelledby="geo-handoff-title"
    >
      <span className="geo-workspace-handoff-icon" aria-hidden="true">
        <Users size={25} />
      </span>
      <div className="geo-workspace-handoff-copy">
        <small>FRONTMIND AGENT</small>
        <h4 id="geo-handoff-title">
          {activation?.accountDisplayName ||
            project.knowledgeBase?.companyName ||
            project.title}
        </h4>
        {activation?.accountUsername && (
          <p>
            登录账号 <strong>{activation.accountUsername}</strong>
          </p>
        )}
        {handoffUrl ? (
          <>
            <p>
              {workspaceUrl
                ? "服务已开通。下方地址来自本次开通记录，将带您进入真实企业工作台。"
                : "服务已开通，但账号设置尚未完成。请使用本次开通记录中的专属地址继续。"}
            </p>
            <a
              className="geo-workspace-handoff-link"
              href={handoffUrl}
              target="_blank"
              rel="noreferrer"
            >
              {handoffLabel}
              <ExternalLink size={16} />
            </a>
          </>
        ) : (
          <div className="geo-workspace-handoff-missing" role="alert">
            <CircleAlert size={17} />
            <div>
              <strong>服务已开通，但后台尚未返回工作台地址</strong>
              <p>
                请重新获取开通信息；若仍未返回，请检查 Agent
                公网地址配置后联系技术支持。
              </p>
            </div>
          </div>
        )}
        {refreshError && (
          <p className="geo-workspace-handoff-error" role="alert">
            获取开通信息失败：{refreshError}
          </p>
        )}
        {!handoffUrl && onRefresh && (
          <button
            type="button"
            className="geo-assessment-refresh"
            onClick={() => void refreshHandoff()}
            disabled={refreshing}
          >
            <RotateCw
              size={15}
              className={refreshing ? "is-spinning" : undefined}
            />
            {refreshing ? "正在获取" : "重新获取开通信息"}
          </button>
        )}
      </div>
    </section>
  );
}

export function ServiceActivation({
  project,
  paymentPending,
  onCheckout,
  onSubmitProfile,
  onCreateAccount,
  onCheckStatus,
  onBack,
}: {
  project: GeoProject;
  paymentPending: boolean;
  onCheckout: () => void;
  onSubmitProfile: (
    profile: GeoServiceContractProfile,
    contractCode: string,
  ) => Promise<void>;
  onCreateAccount: (credentials: GeoServiceAccountCredentials) => Promise<void>;
  onCheckStatus: () => Promise<string | void>;
  onBack: () => void;
}) {
  const [pathView, setPathView] = useState<"services" | "dashboard">(
    "services",
  );
  const activation = project.serviceActivation;
  const question =
    project.questions.find(
      (item) =>
        item.id === (activation?.questionId ?? project.selectedQuestionId),
    ) ?? project.questions[0];
  const [previewServiceStatus, setPreviewServiceStatus] =
    useState<GeoServiceActivationStatus>(activation?.status ?? "not_started");
  useEffect(() => {
    setPreviewServiceStatus(activation?.status ?? "not_started");
  }, [activation?.status, project.id]);
  const serviceStatus = project.preview
    ? previewServiceStatus
    : activation?.status;
  const contractFlowIssue = geoServiceContractFlowIssue(
    activation && serviceStatus
      ? { ...activation, status: serviceStatus }
      : activation,
  );
  const active = serviceStatus === "active";
  const dashboardAvailable = true;
  const handlePathTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      return;
    }
    const availableViews: Array<"dashboard" | "services"> = dashboardAvailable
      ? ["dashboard", "services"]
      : ["services"];
    const currentView =
      pathView === "dashboard" && dashboardAvailable ? "dashboard" : "services";
    const currentIndex = availableViews.indexOf(currentView);
    const nextView =
      event.key === "Home"
        ? availableViews[0]
        : event.key === "End"
          ? availableViews.at(-1)!
          : availableViews[
              (currentIndex +
                (event.key === "ArrowRight" ? 1 : -1) +
                availableViews.length) %
                availableViews.length
            ];
    event.preventDefault();
    setPathView(nextView);
    requestAnimationFrame(() => {
      document.getElementById(`geo-service-tab-${nextView}`)?.focus();
    });
  };
  const onboardingStarted = Boolean(
    activation && serviceStatus !== "not_started",
  );
  const [showOnboarding, setShowOnboarding] = useState(onboardingStarted);
  useEffect(() => {
    if (onboardingStarted) setShowOnboarding(true);
  }, [onboardingStarted]);
  const category = activation?.category;
  const categoryLabel =
    GEO_QUESTION_CATEGORIES.find((item) => item.id === category)?.title ??
    "GEO 优化";
  const amountFen =
    activation?.amountFen ??
    (category === "product_scenario"
      ? 150_000
      : category === "reputation" || category === "competitor_comparison"
        ? 200_000
        : 0);
  const sampleOnly =
    !active &&
    !(
      project.assessment?.status === "ready" &&
      project.optimizationForecast?.status === "ready" &&
      activation &&
      question &&
      amountFen > 0
    );
  if (sampleOnly && question) {
    return (
      <div className="geo-service-activation">
        <header className="geo-service-header">
          <div>
            <span className="geo-kb-kicker">
              <Sparkles size={14} /> 企业服务工作台样例
            </span>
            <h2 className="geo-stage-title">先看豪华版服务如何持续推进</h2>
            <p>
              当前项目尚未进入正式服务开通条件；您可以先查看工作台结构与豪华版服务范围，预览不会触发签约、付款或真实交付。
            </p>
          </div>
          <button type="button" onClick={onBack}>
            返回现状评估
          </button>
        </header>

        <div className="geo-agent-dashboard-frame is-standalone-sample">
          <GeoAgentUserDashboard
            project={project}
            question={question}
            categoryLabel={categoryLabel}
            active={false}
            sampleMode="luxury"
          />
        </div>
      </div>
    );
  }

  if (!activation || !question || amountFen <= 0) {
    return (
      <div className="geo-service-activation">
        <div className="geo-assessment-empty">
          <LockKeyhole size={24} />
          <h2>服务方案正在准备</h2>
          <p>优化效果评估完成后，将按所选问题自动匹配服务类型与月度价格。</p>
          <button type="button" onClick={onBack}>
            返回现状评估
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="geo-service-activation">
      <header className="geo-service-header">
        <div>
          <span className="geo-kb-kicker">
            <Sparkles size={14} /> 启动服务
          </span>
          <h2 className="geo-stage-title">从一个 GEO 问题，连接持续增长路径</h2>
          <p>
            先完成一个月的专项优化与复测，再根据业务需要衔接线索、运营与企业深度
            AI 改造。
          </p>
        </div>
        <button type="button" onClick={onBack}>
          返回现状评估
        </button>
      </header>

      <section
        className={`geo-service-order ${active ? "is-active" : ""} ${onboardingStarted && !active ? "is-onboarding" : ""}`}
      >
        <div className="geo-service-order-question">
          <span>{categoryLabel} · 1 个问题 / 月</span>
          <h3>“{question.question}”</h3>
          <p>
            本月围绕该问题完成语义资产建设、权威信源布局、平台表现追踪与同口径复测。
          </p>
        </div>
        <div className="geo-service-price">
          <span>
            {active ? "本月服务" : activation.paidAt ? "已付金额" : "服务价格"}
          </span>
          <strong>
            <small>¥</small>
            {(amountFen / 100).toLocaleString("zh-CN")}
          </strong>
          <em>/ 问题 / 月</em>
        </div>
        <div className="geo-service-order-action">
          {active ? (
            <span className="geo-service-active-badge">
              <Check size={16} />
              已启动
              {activation.activatedAt && (
                <small>{formatDate(activation.activatedAt)}</small>
              )}
            </span>
          ) : onboardingStarted ? (
            <span className="geo-service-onboarding-badge">
              <ShieldCheck size={16} />
              {contractFlowIssue === "paid_contract_mismatch"
                ? "付款状态异常，需人工核对"
                : contractFlowIssue === "request_rejected"
                  ? "签约申请未通过，需联系支持"
                  : contractFlowIssue === "request_failed"
                    ? "签约状态异常，需联系支持"
                    : serviceStatus === "profile_required"
                      ? "待填写签约资料"
                      : serviceStatus === "contract_preparing"
                        ? "待联系管理员并输入合同码"
                        : serviceStatus === "signature_required"
                          ? "待联系管理员并输入合同码"
                          : serviceStatus === "payment_required"
                            ? "合同已确认，待付款"
                            : serviceStatus === "activation_pending"
                              ? "账号已创建，正在开通"
                              : serviceStatus === "account_setup_required"
                                ? activation.accountMode === "bind_existing"
                                  ? "已有账号已绑定，待开通"
                                  : "待设置登录账号"
                                : activation.status === "provisioning"
                                  ? "正在迁移知识库"
                                  : activation.status === "failed"
                                    ? canRetryGeoServiceKnowledgeImport(
                                        activation,
                                      )
                                      ? "开通未完成，可重试同步"
                                      : "开通未完成，需人工处理"
                                    : "开通流程待处理"}
              {activation.paidAt && <small>付款已确认</small>}
            </span>
          ) : (
            <button
              type="button"
              className="geo-primary-button"
              onClick={() => setShowOnboarding(true)}
            >
              填写签约资料
              <ArrowRight size={17} />
            </button>
          )}
        </div>
      </section>

      {(showOnboarding || onboardingStarted) && (
        <GeoServiceOnboarding
          activation={{
            ...activation,
            status: serviceStatus ?? activation.status,
          }}
          companyName={project.knowledgeBase?.companyName || project.title}
          categoryLabel={categoryLabel}
          question={question.question}
          isPreview={Boolean(project.preview)}
          onSubmitProfile={onSubmitProfile}
          onCheckout={onCheckout}
          onCreateAccount={onCreateAccount}
          onCheckStatus={onCheckStatus}
          onPreviewStatusChange={setPreviewServiceStatus}
        />
      )}

      <section className="geo-service-path">
        <header>
          <div>
            <span>FRONTMIND DELIVERY MAP</span>
            <h3>本月 GEO 专项与后续增长路径</h3>
          </div>
          <p>先解决一个具体问题，再按业务需要衔接线索运营与流程改造</p>
        </header>

        <div
          className="geo-service-path-tabs"
          role="tablist"
          aria-label="本月 GEO 专项与后续增长路径"
          onKeyDown={handlePathTabKeyDown}
        >
          <button
            id="geo-service-tab-dashboard"
            type="button"
            role="tab"
            aria-selected={dashboardAvailable && pathView === "dashboard"}
            aria-controls="geo-agent-user-dashboard"
            tabIndex={dashboardAvailable && pathView === "dashboard" ? 0 : -1}
            className={
              dashboardAvailable && pathView === "dashboard" ? "is-active" : ""
            }
            disabled={!dashboardAvailable}
            onClick={() => setPathView("dashboard")}
          >
            <Users size={17} />
            <span>
              <strong>企业服务工作台</strong>
              <small>
                {project.preview
                  ? "查看用户端内容骨架"
                  : active
                    ? "进入本次开通返回的真实工作台"
                    : "查看豪华版工作台样例"}
              </small>
            </span>
          </button>
          <button
            id="geo-service-tab-services"
            type="button"
            role="tab"
            aria-selected={pathView === "services"}
            aria-controls="geo-service-panorama"
            tabIndex={pathView === "services" ? 0 : -1}
            className={pathView === "services" ? "is-active" : ""}
            onClick={() => setPathView("services")}
          >
            <Layers3 size={17} />
            <span>
              <strong>FrontMind 服务全景</strong>
              <small>查看完整服务执行路线</small>
            </span>
          </button>
        </div>

        {pathView === "services" || !dashboardAvailable ? (
          <div
            className="geo-service-map-scroll"
            id="geo-service-panorama"
            role="tabpanel"
            aria-labelledby="geo-service-tab-services"
            aria-describedby="geo-service-panorama-scroll-hint"
            tabIndex={0}
          >
            <span id="geo-service-panorama-scroll-hint" className="sr-only">
              路线图可使用左右方向键横向滚动查看。
            </span>
            <div
              className="geo-service-map"
              aria-label="FrontMind 服务执行路线图"
            >
              <aside
                className={`geo-service-map-origin ${active ? "is-active" : ""}`}
              >
                <span aria-hidden="true">
                  <FolderKanban size={22} />
                </span>
                <small>服务起点</small>
                <strong>{categoryLabel}</strong>
                <p>围绕已选问题启动本月专项</p>
                <em>{active ? "服务已启动" : "确认后启动"}</em>
              </aside>

              <span className="geo-service-map-entry" aria-hidden="true">
                <i />
                <ArrowRight size={15} />
              </span>

              {GEO_SERVICE_STAGES.map((stage, stageIndex) => {
                const stageActive = active && stageIndex === 0;
                return (
                  <div className="geo-service-stage-unit" key={stage.id}>
                    <article
                      className={`geo-service-stage tone-${stage.tone} ${stageActive ? "is-current" : ""}`}
                      style={
                        {
                          "--service-stage-delay": `${stageIndex * 220 + 140}ms`,
                        } as CSSProperties
                      }
                    >
                      <header className="geo-service-stage-header">
                        <div>
                          <span>
                            {String(stageIndex + 1).padStart(2, "0")} /{" "}
                            {stage.line}
                          </span>
                          <small>
                            {stageActive
                              ? "本月执行"
                              : stageIndex === 0
                                ? "专项起点"
                                : "按需衔接"}
                          </small>
                        </div>
                        <h4>{stage.title}</h4>
                        <p>{stage.summary}</p>
                      </header>

                      <div className="geo-service-branches">
                        {stage.services.map((service, serviceIndex) => {
                          const Icon = service.icon;
                          return (
                            <section
                              className="geo-service-branch"
                              key={service.id}
                              style={
                                {
                                  "--service-node-delay": `${
                                    360 + (stageIndex * 3 + serviceIndex) * 90
                                  }ms`,
                                } as CSSProperties
                              }
                            >
                              <span
                                className="geo-service-branch-icon"
                                aria-hidden="true"
                              >
                                <Icon size={18} />
                              </span>
                              <div className="geo-service-branch-body">
                                <div className="geo-service-branch-heading">
                                  <h5>{service.title}</h5>
                                  <div
                                    className="geo-service-branch-logos"
                                    aria-label={`${service.title}相关平台`}
                                  >
                                    {service.logos.map(([src, name]) => (
                                      <span key={src} title={name}>
                                        <img src={src} alt={name} />
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <p>{service.description}</p>
                                <ol>
                                  {service.actions.map(
                                    (action, actionIndex) => (
                                      <li key={action}>
                                        <span>{actionIndex + 1}</span>
                                        {action}
                                      </li>
                                    ),
                                  )}
                                </ol>
                                <small>
                                  <PackageOpen size={12} />
                                  {service.output}
                                </small>
                              </div>
                            </section>
                          );
                        })}
                      </div>

                      <footer className="geo-service-stage-footer">
                        <div>
                          <span>阶段交付物</span>
                          <p>
                            {stage.deliverables.map((deliverable) => (
                              <small key={deliverable}>{deliverable}</small>
                            ))}
                          </p>
                        </div>
                        <div>
                          <ShieldCheck size={14} />
                          <p>
                            <span>验收标准</span>
                            {stage.checkpoint}
                          </p>
                        </div>
                      </footer>
                    </article>

                    {stageIndex < GEO_SERVICE_STAGES.length - 1 && (
                      <span
                        className="geo-service-stage-gate"
                        style={
                          {
                            "--service-gate-delay": `${stageIndex * 220 + 470}ms`,
                          } as CSSProperties
                        }
                        aria-hidden="true"
                      >
                        <small>阶段验收</small>
                        <ArrowRight size={15} />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div
            className="geo-agent-dashboard-frame"
            id="geo-agent-user-dashboard"
            role="tabpanel"
            aria-labelledby="geo-service-tab-dashboard"
            tabIndex={0}
          >
            {project.preview || !active ? (
              <GeoAgentUserDashboard
                project={project}
                question={question}
                categoryLabel={categoryLabel}
                active={active}
                sampleMode={!project.preview ? "luxury" : undefined}
              />
            ) : (
              <GeoWorkspaceHandoff
                project={project}
                onRefresh={onCheckStatus}
              />
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function MonitoringAnswerList({
  platformIds,
  answers,
}: {
  platformIds: GeoPlatformId[];
  answers: GeoMonitoringAnswer[];
}) {
  return (
    <div className="geo-answer-platforms">
      {platformIds.map((platformId) => {
        const platform = GEO_PLATFORMS.find((item) => item.id === platformId);
        const platformAnswers = answers
          .filter((answer) => answer.platformId === platformId)
          .sort((left, right) => left.runIndex - right.runIndex);
        return (
          <section key={platformId}>
            <header>
              <span
                className="geo-platform-icon"
                style={
                  {
                    "--platform-accent": platform?.accent ?? "#3d1560",
                  } as CSSProperties
                }
              >
                <PlatformLogo
                  src={platform?.logo ?? ""}
                  name={platform?.name ?? platformId}
                />
              </span>
              <div>
                <h3>{platform?.name ?? platformId}</h3>
                <p>{platformAnswers.length}/5 个采样槽位已返回</p>
              </div>
            </header>
            <div className="geo-answer-list">
              {platformAnswers.length > 0 ? (
                platformAnswers.map((answer) => (
                  <details key={answer.id} open={answer.runIndex === 1}>
                    <summary>
                      <span>第 {answer.runIndex} 次回答</span>
                      <strong>
                        {answer.status === "completed"
                          ? "回答已采集"
                          : answer.error || "本轮未完成"}
                      </strong>
                      <small>
                        可追溯来源 {answer.sources.length} 条 ·{" "}
                        {formatDate(answer.capturedAt)}
                      </small>
                    </summary>
                    <div className="geo-answer-body">
                      <MonitoringMarkdown
                        markdown={answer.answer || answer.error}
                      />
                      <AnswerMedia media={answer.media} />
                      <AnswerSources answer={answer} />
                    </div>
                  </details>
                ))
              ) : (
                <p className="geo-platform-answer-empty">
                  该平台尚未返回真实回答。
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

const MEDIA_TYPE_LABELS: Record<GeoAnswerMedia["type"], string> = {
  image: "图片",
  video: "视频",
  audio: "音频",
  link: "媒体链接",
};

function AnswerMedia({ media }: { media: GeoAnswerMedia[] }) {
  if (media.length === 0) return null;
  return (
    <section className="geo-answer-media" aria-label="回答相关媒体">
      <h4>
        <ImageIcon size={14} /> 回答相关媒体
      </h4>
      <div className="geo-answer-media-grid">
        {media.map((item, index) => {
          const title = item.title || MEDIA_TYPE_LABELS[item.type];
          return (
            <article
              key={`${item.type}-${item.url}-${index}`}
              className={`geo-answer-media-card type-${item.type}`}
            >
              {item.type === "image" ? (
                <a href={item.url} target="_blank" rel="noreferrer">
                  <img
                    src={item.thumbnailUrl || item.url}
                    alt={title}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                </a>
              ) : item.type === "video" ? (
                <video
                  controls
                  preload="metadata"
                  poster={item.thumbnailUrl}
                  src={item.url}
                >
                  您的浏览器暂不支持视频播放。
                </video>
              ) : item.type === "audio" ? (
                <audio controls preload="metadata" src={item.url}>
                  您的浏览器暂不支持音频播放。
                </audio>
              ) : item.thumbnailUrl ? (
                <a href={item.url} target="_blank" rel="noreferrer">
                  <img
                    src={item.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                </a>
              ) : (
                <a
                  className="geo-answer-media-link-mark"
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`打开${title}`}
                >
                  <Link2 size={22} />
                </a>
              )}
              <div>
                <strong>{title}</strong>
                {item.source && <small>{item.source}</small>}
                <a href={item.url} target="_blank" rel="noreferrer">
                  打开原始媒体 <ExternalLink size={12} />
                </a>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AnswerSources({ answer }: { answer: GeoMonitoringAnswer }) {
  return (
    <section className="geo-answer-evidence">
      <p>以下为本次回答关联的可追溯来源，供进一步核验。</p>
      <div className="geo-answer-sources">
        <SourceColumn sources={answer.sources} />
      </div>
    </section>
  );
}

function SourceColumn({
  sources,
}: {
  sources: GeoMonitoringAnswer["sources"];
}) {
  return (
    <details className="geo-answer-source-group">
      <summary>
        <span className="geo-answer-source-title">
          <Link2 size={13} /> 可追溯来源
        </span>
        <span className="geo-answer-source-count">{sources.length} 条</span>
        <ChevronDown
          className="geo-answer-source-chevron"
          size={14}
          aria-hidden="true"
        />
      </summary>
      <div className="geo-answer-source-content">
        {sources.length > 0 ? (
          <ul>
            {sources.map((source, index) => (
              <li key={`${source.title}-${index}`}>
                {source.url ? (
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.title} <ExternalLink size={11} />
                  </a>
                ) : (
                  <span>{source.title}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p>平台本轮未返回可追溯来源。</p>
        )}
      </div>
    </details>
  );
}

export function KnowledgeComparison({ project }: { project: GeoProject }) {
  const [statusFilter, setStatusFilter] = useState<
    GeoKnowledgeComparisonStatus | "all"
  >("all");
  const assessment = project.assessment;
  const comparisons = assessment?.comparisons ?? [];
  const knowledgeBase = project.knowledgeBase;
  const selectedQuestion = project.questions.find(
    (question) => question.id === project.selectedQuestionId,
  );
  const monitoringAnswers = project.monitoring?.answers ?? [];
  const platformIds = Array.from(
    new Set(comparisons.flatMap((comparison) => comparison.platforms)),
  );
  const completedAnswers = monitoringAnswers.filter(
    (answer) =>
      answer.status === "completed" && platformIds.includes(answer.platformId),
  );
  const gapCount = comparisons.filter(
    (comparison) => comparison.status !== "aligned",
  ).length;
  const visibleComparisons =
    statusFilter === "all"
      ? comparisons
      : comparisons.filter((comparison) => comparison.status === statusFilter);
  const platformStats = platformIds.map((platformId) => {
    const platform = GEO_PLATFORMS.find((item) => item.id === platformId);
    const answers = monitoringAnswers.filter(
      (answer) => answer.platformId === platformId,
    );
    return {
      platformId,
      platform,
      completed: answers.filter((answer) => answer.status === "completed")
        .length,
      failed: answers.filter((answer) =>
        ["failed", "stopped", "error"].includes(answer.status),
      ).length,
    };
  });

  if (assessment?.status !== "ready" || comparisons.length === 0) {
    return (
      <div className="geo-no-derived-data">
        <span>
          {assessment?.error ||
            "知识库对照尚未返回通过校验的结论；不会用示例内容填充。"}
        </span>
        {assessment?.failureCode && (
          <small>支持码：{assessment.failureCode}</small>
        )}
      </div>
    );
  }

  return (
    <div className="geo-knowledge-comparison">
      <section className="geo-comparison-intro">
        <div className="geo-comparison-intro-copy">
          <span>
            <ShieldCheck size={14} /> 对照方法
          </span>
          <h3>知识事实与平台回答逐项核验</h3>
          <p>
            以企业知识库为事实基准，对照本轮平台回答，识别已经形成的认知、尚未进入回答的事实与需要优先纠正的偏差。
          </p>
          <div className="geo-comparison-query">
            <span>本轮对照问题</span>
            <strong>
              {selectedQuestion?.question || "当前项目尚未返回选定问题"}
            </strong>
          </div>
          {knowledgeBase?.summary && (
            <div className="geo-comparison-baseline">
              <span>知识底座摘要</span>
              <p>{knowledgeBase.summary}</p>
              {knowledgeBase.metrics.length > 0 && (
                <div className="geo-comparison-kb-metrics">
                  {knowledgeBase.metrics.slice(0, 4).map((metric) => (
                    <span key={metric.key}>
                      <strong>{metric.value}</strong>
                      <small>{metric.label}</small>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="geo-comparison-metrics" aria-label="知识库对照范围">
          <article>
            <strong>{comparisons.length}</strong>
            <span>回答事实对照</span>
            <small>逐项形成结论</small>
          </article>
          <article>
            <strong>{gapCount}</strong>
            <span>待提升主题</span>
            <small>缺失、冲突与机会</small>
          </article>
          <article>
            <strong>{platformIds.length}</strong>
            <span>涉及平台</span>
            <small>定位差异来源</small>
          </article>
          <article>
            <strong>{completedAnswers.length}</strong>
            <span>有效回答样本</span>
            <small>用于本次对照</small>
          </article>
        </div>
      </section>

      <div className="geo-comparison-section-heading">
        <div>
          <span>回答事实对照 {comparisons.length} 项</span>
          <h3>从事实差距定位具体优化动作</h3>
        </div>
        <small>
          {statusFilter === "all"
            ? `当前展示全部 ${comparisons.length} 个主题`
            : `已筛选“${COMPARISON_LABELS[statusFilter].label}” · ${visibleComparisons.length} 个主题`}
        </small>
      </div>
      <div className="geo-comparison-summary">
        {(Object.keys(COMPARISON_LABELS) as GeoKnowledgeComparisonStatus[]).map(
          (status) => {
            const active = statusFilter === status;
            return (
              <button
                key={status}
                type="button"
                aria-pressed={active}
                className={`status-${status}${active ? " active" : ""}`}
                onClick={() =>
                  setStatusFilter((current) =>
                    current === status ? "all" : status,
                  )
                }
                title={
                  active
                    ? "再次点击恢复全部主题"
                    : `只查看${COMPARISON_LABELS[status].label}`
                }
              >
                <strong>
                  {comparisons.filter((item) => item.status === status).length}
                </strong>
                <span>{COMPARISON_LABELS[status].label}</span>
                <small>{COMPARISON_LABELS[status].description}</small>
              </button>
            );
          },
        )}
      </div>

      <section className="geo-comparison-list">
        {visibleComparisons.map((comparison, index) => (
          <article
            key={comparison.id}
            className={`status-${comparison.status}`}
          >
            <header className="geo-comparison-card-header">
              <div className="geo-comparison-card-title">
                <span className="geo-comparison-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <div className="geo-comparison-badges">
                    <span>{COMPARISON_LABELS[comparison.status].label}</span>
                    <small>
                      {comparison.recommendedAction
                        ? "已返回建议"
                        : "待返回建议"}
                    </small>
                  </div>
                  <h3>
                    {customerFacingText(
                      comparison.topic,
                      `事实对照项 ${index + 1}`,
                    )}
                  </h3>
                </div>
              </div>
              <div
                className="geo-comparison-platforms"
                aria-label={`${customerFacingText(
                  comparison.topic,
                  `事实对照项 ${index + 1}`,
                )}涉及平台`}
              >
                {comparison.platforms.map((platformId) => {
                  const platform = GEO_PLATFORMS.find(
                    (item) => item.id === platformId,
                  );
                  if (!platform) return null;
                  return (
                    <span
                      key={platformId}
                      style={
                        {
                          "--platform-accent": platform.accent,
                        } as CSSProperties
                      }
                    >
                      <PlatformLogo src={platform.logo} name={platform.name} />
                      {platform.name}
                    </span>
                  );
                })}
              </div>
            </header>

            <div className="geo-comparison-detail-grid">
              <section>
                <span>
                  <Database size={14} /> 企业知识库事实
                </span>
                <p>
                  {customerFacingText(
                    comparison.knowledgeBaseFact,
                    "未提供可核验事实",
                  )}
                </p>
              </section>
              <section>
                <span>
                  <MessageSquareText size={14} /> 平台回答发现
                </span>
                <p>
                  {customerFacingText(
                    comparison.answerFinding,
                    "未提供对照结论",
                  )}
                </p>
              </section>
              <section className="geo-comparison-action">
                <span>
                  <ArrowRight size={14} /> 建议处理动作
                </span>
                <p>
                  {customerFacingText(
                    comparison.recommendedAction,
                    "暂未提供建议处理动作",
                  )}
                </p>
              </section>
            </div>
          </article>
        ))}
      </section>

      <section className="geo-comparison-ledger">
        <header>
          <div>
            <span>核验底稿</span>
            <h3>本次对照使用的知识内容、来源与平台样本</h3>
          </div>
          <small>以下信息均来自当前项目，不使用补写数据</small>
        </header>
        <div className="geo-comparison-ledger-grid">
          <article>
            <div className="geo-comparison-ledger-title">
              <span>
                <FileText size={15} /> 知识主题
              </span>
              <strong>{knowledgeBase?.sections.length ?? 0} 项</strong>
            </div>
            {knowledgeBase?.sections.length ? (
              <>
                <ul>
                  {knowledgeBase.sections.slice(0, 5).map((section) => (
                    <li key={section.id}>
                      <div>
                        <strong>{section.title}</strong>
                        <small>
                          {section.summary || "已纳入知识库并参与本次对照"}
                        </small>
                        {section.evidenceCount ? (
                          <em>{section.evidenceCount} 条证据</em>
                        ) : null}
                      </div>
                      <StatusPill status={section.status} />
                    </li>
                  ))}
                </ul>
                {knowledgeBase.sections.length > 5 && (
                  <details className="geo-comparison-ledger-disclosure">
                    <summary>
                      <span className="when-closed">
                        展开其余 {knowledgeBase.sections.length - 5} 个知识主题
                      </span>
                      <span className="when-open">收起知识主题</span>
                      <ChevronDown size={14} aria-hidden="true" />
                    </summary>
                    <ul>
                      {knowledgeBase.sections.slice(5).map((section) => (
                        <li key={section.id}>
                          <div>
                            <strong>{section.title}</strong>
                            <small>
                              {section.summary || "已纳入知识库并参与本次对照"}
                            </small>
                            {section.evidenceCount ? (
                              <em>{section.evidenceCount} 条证据</em>
                            ) : null}
                          </div>
                          <StatusPill status={section.status} />
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            ) : (
              <p>当前项目未返回可展示的知识主题。</p>
            )}
          </article>

          <article>
            <div className="geo-comparison-ledger-title">
              <span>
                <Globe2 size={15} /> 可追溯来源
              </span>
              <strong>{knowledgeBase?.sources.length ?? 0} 项</strong>
            </div>
            {knowledgeBase?.sources.length ? (
              <>
                <ul>
                  {knowledgeBase.sources.slice(0, 5).map((source) => (
                    <li key={source.id}>
                      <div>
                        {source.url ? (
                          <a href={source.url} target="_blank" rel="noreferrer">
                            {source.title}
                            <ExternalLink size={11} />
                          </a>
                        ) : (
                          <strong>{source.title}</strong>
                        )}
                        <small>
                          {[
                            source.type,
                            source.domain,
                            source.capturedAt
                              ? `采集于 ${formatDate(source.capturedAt)}`
                              : undefined,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "知识库来源"}
                        </small>
                      </div>
                    </li>
                  ))}
                </ul>
                {knowledgeBase.sources.length > 5 && (
                  <details className="geo-comparison-ledger-disclosure">
                    <summary>
                      <span className="when-closed">
                        展开其余 {knowledgeBase.sources.length - 5} 个来源
                      </span>
                      <span className="when-open">收起可追溯来源</span>
                      <ChevronDown size={14} aria-hidden="true" />
                    </summary>
                    <ul>
                      {knowledgeBase.sources.slice(5).map((source) => (
                        <li key={source.id}>
                          <div>
                            {source.url ? (
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {source.title}
                                <ExternalLink size={11} />
                              </a>
                            ) : (
                              <strong>{source.title}</strong>
                            )}
                            <small>
                              {[
                                source.type,
                                source.domain,
                                source.capturedAt
                                  ? `采集于 ${formatDate(source.capturedAt)}`
                                  : undefined,
                              ]
                                .filter(Boolean)
                                .join(" · ") || "知识库来源"}
                            </small>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            ) : (
              <p>当前项目未返回可展示的来源入口。</p>
            )}
          </article>

          <article>
            <div className="geo-comparison-ledger-title">
              <span>
                <RadioTower size={15} /> 平台样本
              </span>
              <strong>{completedAnswers.length} 条</strong>
            </div>
            {platformStats.length ? (
              <ul className="geo-comparison-sample-list">
                {platformStats.map(
                  ({ platformId, platform, completed, failed }) => (
                    <li
                      key={platformId}
                      style={
                        {
                          "--platform-accent": platform?.accent ?? "#765482",
                        } as CSSProperties
                      }
                    >
                      {platform ? (
                        <PlatformLogo
                          src={platform.logo}
                          name={platform.name}
                        />
                      ) : (
                        <span className="geo-platform-fallback">
                          {platformId.slice(0, 1)}
                        </span>
                      )}
                      <div>
                        <strong>{platform?.name ?? platformId}</strong>
                        <small>
                          {completed} 条有效回答
                          {failed > 0 ? ` · ${failed} 条未完成` : ""}
                        </small>
                      </div>
                      <span>{completed}/5</span>
                    </li>
                  ),
                )}
              </ul>
            ) : (
              <p>当前对照结论未标记涉及平台。</p>
            )}
          </article>
        </div>
      </section>
    </div>
  );
}
