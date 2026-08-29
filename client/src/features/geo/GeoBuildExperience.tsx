import {
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
  Database,
  ExternalLink,
  FileText,
  FolderKanban,
  Globe2,
  Handshake,
  Image as ImageIcon,
  MapPin,
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
import { createPortal } from "react-dom";
import { useLang } from "@/contexts/LanguageContext";
import { FRONTMIND_WECHAT_QR_PATH } from "@/lib/frontmind-contact";
import permissionVideoUrl from "@/assets/geo/industry-ranking-permission-demo-66s.mp4";
import permissionVideoPosterUrl from "@/assets/geo/industry-ranking-permission-demo-poster.jpg";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  authoritativeGeoCustomQuestionValidationTerminal,
  clearPendingGeoCustomQuestionValidation,
  createGeoCustomQuestion,
  createGeoProject,
  downloadGeoArchive,
  expiredGeoCustomQuestionValidation,
  getGeoProject,
  getGeoMonitoringRegions,
  GeoApiError,
  persistGeoCustomQuestionResultAndAcknowledge,
  readPendingGeoCustomQuestionValidation,
  retryableGeoCustomQuestionValidation,
  retryGeoCustomQuestionValidation,
  resumeGeoCustomQuestionValidation,
  startGeoCurrentAssessment,
  startGeoMonitoring,
  startGeoOptimizationForecast,
  retryIndustryRankingAssessment,
  startIndustryRankingOptimizationForecast,
  startGeoQuestionRecommendation,
  verifyGeoInvitation,
} from "./api";
import { normalizeBusinessOwnerName } from "@shared/business-owner-name";
import {
  createGeoDraftProject,
  isGeoDraftProject,
  type PendingGeoDraft,
} from "./draft";
import {
  GEO_STYLE_PREVIEW_ID,
  geoStylePreviewMode,
  isGeoStylePreviewEnabled,
  isGeoStylePreviewProject,
} from "./preview-mode";
import { loadGeoStylePreview } from "@/features/geo/preview-loader";
import { MonitoringMarkdown } from "./MonitoringMarkdown";
import {
  buildMonitoringInsights,
  type MonitoringInsightRow,
} from "./monitoring-insights";
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
import { commitRemoteProjectObservation as commitRemoteObservation } from "./remote-observation";
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
  type GeoMonitoringEdition,
  type GeoMonitoringRegion,
  type GeoPlatformId,
  type GeoProject,
  type GeoQuestion,
  type GeoStage,
  resolveGeoMonitoringEdition,
} from "./types";
import {
  type GeoWorkbenchGeometry,
  isGeoWorkbenchMoveKey,
  moveGeoWorkbenchGeometry,
} from "./workbench-geometry";
import { GeoAgentUserDashboard } from "./GeoAgentUserDashboard";
import { localizedUserFacingError } from "./error-localization";
import { KnowledgeCompletenessDialog } from "./KnowledgeCompletenessDialog";
import "./geo-build.css";

const MAX_FILE_COUNT = 10;
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const GEO_MONITORING_PLATFORM_SELECTION_MESSAGE =
  "请选择与当前监控版本匹配的平台。";
const LEGACY_RECOVERABLE_MONITORING_FAILURE =
  /英文监控问题正在准备|(?:邀请会话|网络来源)请求过于频繁|提交内容有误，请检查后重试|QUESTION_TRANSLATION_PENDING|(?:SESSION|IDENTITY)_RATE_LIMITED|AGENT_REQUEST_FAILED/i;

export function clearGeoStorageNoticeIfMatching(
  current: string,
  expected: string,
) {
  return current === expected ? "" : current;
}

export function isHistoricalRankingOnlyProject(project?: GeoProject) {
  if (!project || project.industryRankingMonitoring?.runId) return false;
  return (
    project.questions.find(
      (question) => question.id === project.selectedQuestionId,
    )?.category === "industry_ranking"
  );
}

const DOMESTIC_GEO_PLATFORM_IDS = GEO_PLATFORMS.filter(
  (platform) => platform.id !== "chatgpt",
).map((platform) => platform.id);

function monitoringEditionLabel(edition: GeoMonitoringEdition) {
  return edition === "overseas" ? "海外版" : "国内版";
}

function monitoringPlatformsForEdition(edition: GeoMonitoringEdition) {
  return GEO_PLATFORMS.filter((platform) =>
    edition === "overseas"
      ? platform.id === "chatgpt"
      : platform.id !== "chatgpt",
  );
}

function monitoringPlatformSelectionIsValid(
  edition: GeoMonitoringEdition,
  platformIds: GeoPlatformId[],
) {
  return edition === "overseas"
    ? platformIds.length === 1 && platformIds[0] === "chatgpt"
    : platformIds.length > 0 &&
        platformIds.every((platformId) =>
          DOMESTIC_GEO_PLATFORM_IDS.includes(platformId),
        );
}

function matchingMonitoringRecoveryClientRequestId(
  project: GeoProject,
  input: {
    questionId: string;
    industryRankingQuestionId?: string;
    monitoringEdition: GeoMonitoringEdition;
    platformIds: GeoPlatformId[];
    regionCode?: string;
    screenshotEnabled?: boolean;
  },
) {
  const recovery = project.monitoringRecovery as
    | (NonNullable<GeoProject["monitoringRecovery"]> & {
        industryRankingQuestionId?: string;
      })
    | undefined;
  if (
    !recovery ||
    recovery.schemaVersion !== 2 ||
    recovery.questionId !== input.questionId ||
    recovery.industryRankingQuestionId !== input.industryRankingQuestionId ||
    recovery.monitoringEdition !== input.monitoringEdition ||
    recovery.regionCode !== input.regionCode ||
    Boolean(recovery.screenshotEnabled) !== Boolean(input.screenshotEnabled) ||
    recovery.platformIds.length !== input.platformIds.length ||
    [...recovery.platformIds]
      .sort()
      .some(
        (platformId, index) =>
          platformId !== [...input.platformIds].sort()[index],
      )
  ) {
    return undefined;
  }
  return recovery.clientRequestId;
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
    title: "服务演示",
    subtitle: "查看工作台与服务范围",
  },
];

type DragOperation = {
  mode: "move" | "resize";
  startX: number;
  startY: number;
  geometry: GeoWorkbenchGeometry;
};

export async function startFreshKnowledgeBaseUpload(input: {
  project: GeoProject;
  removeProjectFromDevice: (project: GeoProject) => Promise<void>;
  openNewProjectBuilder: () => void;
}) {
  // Keep the failed remote record as diagnostic evidence while replacing only
  // this browser's local project coordinate.
  await input.removeProjectFromDevice(input.project);
  input.openNewProjectBuilder();
}

export function isGeoQuestionSelectionLocked(
  project: Pick<
    GeoProject,
    "id" | "preview" | "monitoring" | "industryRankingMonitoring"
  >,
) {
  return (
    !project.preview &&
    Boolean(
      project.monitoring?.runId || project.industryRankingMonitoring?.runId,
    )
  );
}

function canResumeIncompleteDualMonitoring(project: GeoProject) {
  if (!project.monitoringRecovery || !project.selectedIndustryRankingQuestionId)
    return false;
  const productStarted = Boolean(project.monitoring?.runId);
  const industryStarted = Boolean(project.industryRankingMonitoring?.runId);
  return (
    (productStarted || industryStarted) && (!productStarted || !industryStarted)
  );
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

function isExecutionEntryPending(entry: GeoExecutionLogEntry | undefined) {
  return Boolean(
    entry && ["queued", "running", "waiting", "unknown"].includes(entry.status),
  );
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

function projectDisplayTitle(project: GeoProject): string {
  return project.title;
}

function isCompleteAssessment(assessment: GeoProject["assessment"]): boolean {
  return Boolean(
    assessment?.status === "ready" &&
      assessment.quality?.completeness !== "partial" &&
      assessment.totalScore !== undefined &&
      assessment.dimensions.length === 5 &&
      assessment.dimensions.every(
        (dimension) =>
          dimension.score !== undefined && dimension.maxScore !== undefined,
      ),
  );
}

function isCompleteForecast(
  forecast: GeoProject["optimizationForecast"],
): boolean {
  return Boolean(
    forecast?.status === "ready" &&
      forecast.quality?.completeness !== "partial" &&
      forecast.currentScore !== undefined &&
      forecast.targetLow !== undefined &&
      forecast.targetHigh !== undefined,
  );
}

function canStartService(project: GeoProject): boolean {
  return Boolean(
    project.serviceActivation?.status === "active" ||
      (isCompleteAssessment(project.assessment) &&
        isCompleteForecast(project.optimizationForecast) &&
        project.serviceActivation),
  );
}

function canPreviewServiceWorkspace(project: GeoProject): boolean {
  return Boolean(
    isCompleteAssessment(project.assessment) &&
      (project.selectedQuestionId ||
        project.serviceActivation?.questionId ||
        project.questions.length > 0),
  );
}

function questionRecommendationStatus(
  project: GeoProject,
): NonNullable<GeoProject["questionRecommendation"]>["status"] {
  if (project.questionRecommendation)
    return project.questionRecommendation.status;
  const recommendedCount = project.questions.filter(
    (question) => !question.id.startsWith("custom-"),
  ).length;
  if (recommendedCount === 20) return "ready";
  if (project.status === "recommending") return "pending";
  if (project.status === "failed" && project.knowledgeBase) return "failed";
  return "not_started";
}

function canOpenStage(project: GeoProject, stage: GeoStage): boolean {
  if (stage === "enterprise_analysis") return true;
  if (stage === "question_recommendation")
    return (
      questionRecommendationStatus(project) !== "not_started" ||
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
      monitoringAssessmentCoverage(project.monitoring).assessmentEligible ||
      monitoringAssessmentCoverage(project.industryRankingMonitoring)
        .assessmentEligible ||
      Boolean(
        project.assessment && project.assessment.status !== "not_started",
      ) ||
      Boolean(
        project.industryRankingAssessment &&
          project.industryRankingAssessment.status !== "not_started",
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
    monitoringAssessmentCoverage(project.monitoring).assessmentEligible ||
    monitoringAssessmentCoverage(project.industryRankingMonitoring)
      .assessmentEligible ||
    (project.assessment && project.assessment.status !== "not_started") ||
    (project.industryRankingAssessment &&
      project.industryRankingAssessment.status !== "not_started")
  )
    return "current_assessment";
  if (project.monitoring?.runId || project.industryRankingMonitoring?.runId)
    return "monitoring";
  if (project.selectedQuestionId) return "monitoring";
  if (questionRecommendationStatus(project) !== "not_started")
    return "question_recommendation";
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
    return Boolean(
      project.selectedQuestionId &&
        (!project.questions.some(
          (question) => question.category === "industry_ranking",
        ) ||
          project.selectedIndustryRankingQuestionId),
    );
  if (stage === "monitoring") {
    if (!monitoringAssessmentCoverage(project.monitoring).assessmentEligible)
      return false;
    return project.selectedIndustryRankingQuestionId
      ? monitoringAssessmentCoverage(project.industryRankingMonitoring)
          .assessmentEligible
      : true;
  }
  if (stage === "current_assessment") {
    const productComplete =
      isCompleteAssessment(project.assessment) &&
      isCompleteForecast(project.optimizationForecast);
    if (!productComplete) return false;
    return project.selectedIndustryRankingQuestionId
      ? isCompleteAssessment(project.industryRankingAssessment) &&
          isCompleteForecast(project.industryRankingOptimizationForecast)
      : true;
  }
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
  const [businessOwnerName, setBusinessOwnerName] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [creating, setCreating] = useState(false);
  const [startingAnalysisId, setStartingAnalysisId] = useState<string>();
  const [startingQuestionProjectId, setStartingQuestionProjectId] =
    useState<string>();
  const [retryingAssessmentProjectId, setRetryingAssessmentProjectId] =
    useState<string>();
  const [
    retryingIndustryAssessmentProjectId,
    setRetryingIndustryAssessmentProjectId,
  ] = useState<string>();
  const [retryingForecastProjectIds, setRetryingForecastProjectIds] = useState<
    Record<string, boolean>
  >({});
  const [
    retryingIndustryForecastProjectIds,
    setRetryingIndustryForecastProjectIds,
  ] = useState<Record<string, boolean>>({});
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
  const [deleteMode, setDeleteMode] = useState<"standard" | "fresh_start">(
    "standard",
  );
  const [deleteAction, setDeleteAction] = useState<"local">();
  const [deleteError, setDeleteError] = useState("");
  const [pendingProductQuestion, setPendingProductQuestion] =
    useState<GeoQuestion>();
  const [pendingIndustryQuestion, setPendingIndustryQuestion] =
    useState<GeoQuestion>();
  const [questionConfirmOpen, setQuestionConfirmOpen] = useState(false);
  const [monitoringConfirmOpen, setMonitoringConfirmOpen] = useState(false);
  const [monitoringStarting, setMonitoringStarting] = useState(false);
  const [monitoringStartError, setMonitoringStartError] = useState("");
  const [monitoringClientRequestId, setMonitoringClientRequestId] =
    useState<string>();
  const [storageNotice, setStorageNotice] = useState("");
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
  const industryAssessmentStartInFlight = useRef(new Set<string>());
  const industryForecastStartInFlight = useRef(new Set<string>());
  const archivePersistenceCompleted = useRef(new Set<string>());
  const pendingDrafts = useRef(new Map<string, PendingGeoDraft>());
  const draftAnalysisControllers = useRef(new Map<string, AbortController>());
  const refreshInFlight = useRef(new Map<string, Promise<GeoProject>>());
  const autoRefreshNotice = useRef("");
  const deletedProjectIds = useRef(new Set<string>());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workbenchRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLButtonElement>(null);
  const focusBeforeWorkbench = useRef<HTMLElement | null>(null);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId),
    [activeProjectId, projects],
  );
  const activeQuestionSelectionLocked = activeProject
    ? isGeoQuestionSelectionLocked(activeProject)
    : false;

  useEffect(() => {
    const dualProject = activeProject as
      | (GeoProject & { selectedIndustryRankingQuestionId?: string })
      | undefined;
    setPendingProductQuestion(
      activeProject?.questions.find(
        (question) => question.id === activeProject.selectedQuestionId,
      ),
    );
    setPendingIndustryQuestion(
      activeProject?.questions.find(
        (question) =>
          question.id === dualProject?.selectedIndustryRankingQuestionId,
      ),
    );
    setQuestionConfirmOpen(false);
  }, [activeProject?.id]);

  useEffect(() => {
    if (!storageNotice) return;
    const notice = storageNotice;
    const timer = window.setTimeout(() => {
      setStorageNotice((current) =>
        clearGeoStorageNoticeIfMatching(current, notice),
      );
      if (autoRefreshNotice.current === notice) {
        autoRefreshNotice.current = "";
      }
    }, 60_000);
    return () => window.clearTimeout(timer);
  }, [storageNotice]);

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
      if (deletedProjectIds.current.has(project.id)) return;
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

  const commitRemoteProjectObservation = useCallback(
    (operationProject: GeoProject, updated: GeoProject) =>
      commitRemoteObservation({
        operationProject,
        updated,
        persistIfCurrent: saveGeoProjectObservationIfCurrent,
        commit: commitProject,
        onPersistenceFailure: () => {
          setStorageNotice(
            "当前浏览器无法持久保存最新项目状态；新任务已保留在本页面，请勿关闭或刷新，并尽快下载备份。",
          );
        },
      }),
    [commitProject],
  );

  const refreshProject = useCallback(
    (project: GeoProject) =>
      refreshGeoProjectOnce(project, {
        fetchProject: getGeoProject,
        inFlight: refreshInFlight.current,
        onStart: (projectId) =>
          setRefreshingProjectIds((current) => ({
            ...current,
            [projectId]: true,
          })),
        onSuccess: async (updated, refreshedAt) => {
          const committed = await commitRemoteProjectObservation(
            project,
            updated,
          );
          if (!committed) return;
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
    [commitRemoteProjectObservation],
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
      const committed = await commitRemoteProjectObservation(project, updated);
      if (!committed) {
        setStorageNotice(
          "项目已被删除或已由更新的操作推进，已忽略本次迟到的现状评估结果。",
        );
      }
    } catch (error) {
      setStorageNotice(`现状评估未能重新启动：${errorMessage(error)}`);
    } finally {
      assessmentStartInFlight.current.delete(projectId);
      setRetryingAssessmentProjectId((current) =>
        current === projectId ? undefined : current,
      );
    }
  }, [activeProject, commitRemoteProjectObservation]);

  const retryIndustryAssessment = useCallback(async () => {
    const project = activeProject;
    const historicalRankingOnly = isHistoricalRankingOnlyProject(project);
    const assessment = historicalRankingOnly
      ? project?.assessment
      : project?.industryRankingAssessment;
    if (
      !project ||
      isGeoStylePreviewProject(project) ||
      isGeoDraftProject(project) ||
      !project.remoteToken ||
      assessment?.status !== "failed" ||
      industryAssessmentStartInFlight.current.has(project.id)
    )
      return;

    industryAssessmentStartInFlight.current.add(project.id);
    setRetryingIndustryAssessmentProjectId(project.id);
    setStorageNotice("");
    try {
      const updated = await retryIndustryRankingAssessment(project);
      await commitRemoteProjectObservation(project, updated);
    } catch (error) {
      setStorageNotice(`行业排名现状评估未能重新启动：${errorMessage(error)}`);
    } finally {
      industryAssessmentStartInFlight.current.delete(project.id);
      setRetryingIndustryAssessmentProjectId((current) =>
        current === project.id ? undefined : current,
      );
    }
  }, [activeProject, commitRemoteProjectObservation]);

  const retryOptimizationForecast = useCallback(async () => {
    const project = activeProject;
    if (
      !project ||
      isGeoStylePreviewProject(project) ||
      isGeoDraftProject(project) ||
      !project.remoteToken ||
      !isCompleteAssessment(project.assessment) ||
      project.optimizationForecast?.status !== "failed" ||
      project.optimizationForecastRetryAvailable === false ||
      forecastStartInFlight.current.has(project.id)
    )
      return;

    const projectId = project.id;
    forecastStartInFlight.current.add(projectId);
    setRetryingForecastProjectIds((current) => ({
      ...current,
      [projectId]: true,
    }));
    setStorageNotice("");
    try {
      const updated = await startGeoOptimizationForecast(project);
      const committed = await commitRemoteProjectObservation(project, updated);
      if (!committed) {
        setStorageNotice(
          "项目已被删除或已由更新的操作推进，已忽略本次迟到的优化效果评估结果。",
        );
      }
    } catch (error) {
      setStorageNotice(`优化效果评估未能重新启动：${errorMessage(error)}`);
    } finally {
      forecastStartInFlight.current.delete(projectId);
      setRetryingForecastProjectIds((current) => ({
        ...current,
        [projectId]: false,
      }));
    }
  }, [activeProject, commitRemoteProjectObservation]);

  const retryIndustryOptimizationForecast = useCallback(async () => {
    const project = activeProject;
    const historicalRankingOnly = isHistoricalRankingOnlyProject(project);
    const assessment = historicalRankingOnly
      ? project?.assessment
      : project?.industryRankingAssessment;
    const forecast = historicalRankingOnly
      ? project?.optimizationForecast
      : project?.industryRankingOptimizationForecast;
    const retryAvailable = historicalRankingOnly
      ? project?.optimizationForecastRetryAvailable
      : project?.industryRankingOptimizationForecastRetryAvailable;
    if (
      !project ||
      isGeoStylePreviewProject(project) ||
      isGeoDraftProject(project) ||
      !project.remoteToken ||
      !isCompleteAssessment(assessment) ||
      forecast?.status !== "failed" ||
      retryAvailable === false ||
      industryForecastStartInFlight.current.has(project.id)
    )
      return;

    industryForecastStartInFlight.current.add(project.id);
    setRetryingIndustryForecastProjectIds((current) => ({
      ...current,
      [project.id]: true,
    }));
    setStorageNotice("");
    try {
      const updated = await startIndustryRankingOptimizationForecast(project);
      await commitRemoteProjectObservation(project, updated);
    } catch (error) {
      setStorageNotice(
        `行业排名优化效果评估未能重新启动：${errorMessage(error)}`,
      );
    } finally {
      industryForecastStartInFlight.current.delete(project.id);
      setRetryingIndustryForecastProjectIds((current) => ({
        ...current,
        [project.id]: false,
      }));
    }
  }, [activeProject, commitRemoteProjectObservation]);

  useEffect(() => {
    if (!import.meta.env.DEV || !stylePreviewEnabled) return;
    let cancelled = false;
    void loadGeoStylePreview()
      .then(({ createGeoStylePreviewProject }) => {
        if (cancelled) return;
        const previewMode = geoStylePreviewMode() ?? "assessment";
        const previewProject = createGeoStylePreviewProject(previewMode);
        setProjects([previewProject]);
        setActiveProjectId(GEO_STYLE_PREVIEW_ID);
        setActiveStage(
          previewMode === "assessment" ? "current_assessment" : "monitoring",
        );
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
    let failureNoticeShown = false;
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
        if (!cancelled) {
          failures = 0;
          failureNoticeShown = false;
          const priorAutoRefreshNotice = autoRefreshNotice.current;
          autoRefreshNotice.current = "";
          if (priorAutoRefreshNotice) {
            setStorageNotice((current) =>
              clearGeoStorageNoticeIfMatching(current, priorAutoRefreshNotice),
            );
          }
        }
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
            if (failures >= 2 && !failureNoticeShown) {
              const message = `项目状态暂时无法更新：${errorMessage(error)}（将自动重试）`;
              failureNoticeShown = true;
              autoRefreshNotice.current = message;
              setStorageNotice(message);
            }
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
    activeProject?.industryRankingMonitoring?.status,
    activeProject?.assessment?.status,
    activeProject?.industryRankingAssessment?.status,
    activeProject?.optimizationForecast?.status,
    activeProject?.industryRankingOptimizationForecast?.status,
    activeProject?.serviceActivation?.status,
    activeProject?.serviceActivation?.provisioningVersion,
    activeProject?.questions.length,
    Boolean(activeProject?.knowledgeBase),
    refreshProject,
  ]);

  useEffect(() => {
    if (isGeoStylePreviewProject(activeProject)) return;
    if (!activeProject?.monitoring?.runId) return;
    if (
      !monitoringAssessmentCoverage(activeProject.monitoring).assessmentEligible
    )
      return;
    if (
      activeProject.assessment &&
      activeProject.assessment.status !== "not_started"
    )
      return;
    if (assessmentStartInFlight.current.has(activeProject.id)) return;
    assessmentStartInFlight.current.add(activeProject.id);
    const operationProject = activeProject;
    void startGeoCurrentAssessment(operationProject)
      .then(async (updated) => {
        const committed = await commitRemoteProjectObservation(
          operationProject,
          updated,
        );
        if (!committed) {
          setStorageNotice(
            "项目已被删除或已由更新的操作推进，已忽略本次迟到的现状评估结果。",
          );
        }
      })
      .catch((error) => {
        setStorageNotice(
          `监控已完成，但现状评估尚未启动：${errorMessage(error)}`,
        );
      })
      .finally(() =>
        assessmentStartInFlight.current.delete(operationProject.id),
      );
  }, [activeProject, commitRemoteProjectObservation]);

  useEffect(() => {
    if (isGeoStylePreviewProject(activeProject)) return;
    if (!activeProject?.industryRankingMonitoring?.runId) return;
    if (
      !monitoringAssessmentCoverage(activeProject.industryRankingMonitoring)
        .assessmentEligible
    )
      return;
    if (
      activeProject.industryRankingAssessment &&
      activeProject.industryRankingAssessment.status !== "not_started"
    )
      return;
    if (industryAssessmentStartInFlight.current.has(activeProject.id)) return;
    industryAssessmentStartInFlight.current.add(activeProject.id);
    const operationProject = activeProject;
    void retryIndustryRankingAssessment(operationProject)
      .then(async (updated) => {
        await commitRemoteProjectObservation(operationProject, updated);
      })
      .catch((error) => {
        setStorageNotice(
          `行业排名监控已完成，但现状评估尚未启动：${errorMessage(error)}`,
        );
      })
      .finally(() =>
        industryAssessmentStartInFlight.current.delete(operationProject.id),
      );
  }, [activeProject, commitRemoteProjectObservation]);

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
    setBusinessOwnerName("");
    setInviteOpen(true);
  };

  const handleInviteSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inviteCode.trim()) {
      setInviteError("请输入邀请码。");
      return;
    }
    let normalizedBusinessOwnerName: string;
    try {
      normalizedBusinessOwnerName =
        normalizeBusinessOwnerName(businessOwnerName);
    } catch {
      setInviteError("请输入有效的商务负责人姓名（最多 40 个字符）。");
      return;
    }
    setCreating(true);
    setInviteError("");
    try {
      const inviteContext = await verifyGeoInvitation(
        inviteCode.trim(),
        normalizedBusinessOwnerName,
      );
      const project = createGeoDraftProject(draftInput, draftFiles);
      pendingDrafts.current.set(project.id, {
        input: draftInput.trim(),
        files: [...draftFiles],
        requestId: crypto.randomUUID(),
        inviteContextToken: inviteContext.inviteContextToken,
        businessOwnerName: inviteContext.businessOwnerName,
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
      setBusinessOwnerName("");
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
        inviteContextToken: draft.inviteContextToken,
        requestId: draft.requestId,
        uploadedFiles: draft.uploadedFiles,
        uploadReservations: draft.uploadReservations,
        signal: controller.signal,
        onUploadsReady: (uploadedFiles) => {
          draft.uploadedFiles = uploadedFiles;
        },
        onUploadReservationsReady: (uploadReservations) => {
          draft.uploadReservations = uploadReservations;
        },
        onUploadProgress: (progress) => {
          const currentFile = `${formatFileSize(progress.fileLoadedBytes)} / ${formatFileSize(progress.fileTotalBytes)}`;
          const wholeBatch = `${formatFileSize(progress.batchLoadedBytes)} / ${formatFileSize(progress.batchTotalBytes)}`;
          const currentStatus = (() => {
            switch (progress.phase) {
              case "reserving":
                return `正在为第 ${progress.fileIndex} / ${progress.fileCount} 份保留上传任务`;
              case "awaiting_dashboard":
                return `第 ${progress.fileIndex} / ${progress.fileCount} 份已发送，等待服务器确认`;
              case "reconciling":
                return `第 ${progress.fileIndex} / ${progress.fileCount} 份传输结果待确认，正在核对服务器回执`;
              case "retrying":
                return `第 ${progress.fileIndex} / ${progress.fileCount} 份连接中断，正在按原凭证重试`;
              case "confirmed":
                return `第 ${progress.fileIndex} / ${progress.fileCount} 份已确认`;
              case "uploading":
                return `正在上传第 ${progress.fileIndex} / ${progress.fileCount} 份：${currentFile}`;
            }
          })();
          setStorageNotice(
            `企业资料上传中：${currentStatus}，全部资料 ${wholeBatch}。`,
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
      setStorageNotice("资料已接收，正在创建企业分析。");
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
        const retainedFiles = draft.uploadedFiles?.length ?? 0;
        setStorageNotice(
          error instanceof GeoApiError &&
            error.code === "PROJECT_START_CONFIRMATION_UNKNOWN"
            ? errorMessage(error)
            : error instanceof GeoApiError &&
                (error.code?.startsWith("UPLOAD_") ||
                  error.code === "INVALID_UPLOAD_TICKET" ||
                  error.code === "INVALID_UPLOAD_CHECKPOINT")
              ? `企业资料尚未全部上传：${errorMessage(error)}${
                  error.code === "UPLOAD_RETRY_EXHAUSTED"
                    ? ` 前 ${retainedFiles} 份已保留，只重试当前文件。`
                    : ""
                }`
              : `企业分析尚未启动：${errorMessage(error)}`,
        );
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
    const recommendationStatus = questionRecommendationStatus(project);

    if (
      recommendationStatus === "ready" ||
      recommendationStatus === "pending" ||
      isGeoStylePreviewProject(project)
    ) {
      setActiveStage("question_recommendation");
      return;
    }
    if (!project.remoteToken) {
      setStorageNotice("当前项目尚未连接后台，暂不能生成 GEO 问题。");
      return;
    }
    if (recommendationStatus === "failed") {
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
      setStorageNotice("本次监控范围已经确认，不能再更换问题。");
      return;
    }
    if (
      !activeProject ||
      (!question.selectable && question.category !== "industry_ranking")
    )
      return;
    if (question.category === "industry_ranking") {
      setPendingIndustryQuestion(question);
    } else {
      setPendingProductQuestion(question);
    }
  };

  const createCustomQuestion = async (
    questionText: string,
    signal?: AbortSignal,
  ) => {
    if (!activeProject) throw new Error("当前项目不可用，请刷新后重试。");
    const operationProject = activeProject;
    if (activeQuestionSelectionLocked) {
      throw new Error("本次问题范围已经确认，不能再创建或更换问题。");
    }
    if (isGeoStylePreviewProject(activeProject)) {
      if (looksLikeIndustryRankingQuestion(questionText)) {
        throw new Error(
          "该问题属于行业排名或品牌推荐方向，请改用行业侧推荐问题。",
        );
      }
      const companyName =
        activeProject.knowledgeBase?.companyName || activeProject.title;
      if (!explicitlyReferencesProjectCompany(questionText, companyName)) {
        throw new Error(
          `该问题与「${companyName}」没有明确关系，请重新输入与当前企业相关的产品或舆情问题。`,
        );
      }
      const normalized = `${questionText.trim().replace(/[?？]+$/, "")}？`;
      const question: GeoQuestion = {
        id: `custom-preview-${Date.now()}`,
        category: "product_scenario",
        question: normalized,
        rationale: "您自定义的产品与舆情问题",
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
      { signal },
    );
    try {
      await persistGeoCustomQuestionResultAndAcknowledge(
        result,
        async (nextProject: GeoProject) => {
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
      async (nextProject: GeoProject) => {
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
        async (nextProject: GeoProject) => {
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
    if (!activeProject || !pendingProductQuestion || !pendingIndustryQuestion)
      return;
    if (activeQuestionSelectionLocked) {
      setQuestionConfirmOpen(false);
      setStorageNotice("本次监控范围已经确认，不能再更换问题。");
      return;
    }
    const question = activeProject.questions.find(
      (item) => item.id === pendingProductQuestion.id,
    );
    const industryQuestion = activeProject.questions.find(
      (item) => item.id === pendingIndustryQuestion.id,
    );
    if (
      !question ||
      !question.selectable ||
      question.category === "industry_ranking" ||
      !industryQuestion ||
      industryQuestion.category !== "industry_ranking"
    ) {
      setQuestionConfirmOpen(false);
      return;
    }
    const updated = {
      ...activeProject,
      selectedQuestionId: question.id,
      selectedIndustryRankingQuestionId: industryQuestion.id,
      selectedPlatformIds: [],
      stage: "monitoring" as const,
      updatedAt: new Date().toISOString(),
    };
    commitProject(updated);
    setQuestionConfirmOpen(false);
    setActiveStage("monitoring");
  };

  const togglePlatform = (platformId: GeoPlatformId) => {
    if (
      !activeProject ||
      activeProject.monitoring?.runId ||
      activeProject.industryRankingMonitoring?.runId
    )
      return;
    const monitoringEdition = resolveGeoMonitoringEdition(
      activeProject.monitoringEdition,
    );
    if (
      (monitoringEdition === "overseas" && platformId !== "chatgpt") ||
      (monitoringEdition === "domestic" && platformId === "chatgpt")
    ) {
      return;
    }
    const selected = activeProject.selectedPlatformIds.includes(platformId)
      ? activeProject.selectedPlatformIds.filter((id) => id !== platformId)
      : [...activeProject.selectedPlatformIds, platformId];
    commitProject({
      ...activeProject,
      selectedPlatformIds: selected,
      updatedAt: new Date().toISOString(),
    });
  };

  const changeMonitoringEdition = (edition: GeoMonitoringEdition) => {
    if (
      !activeProject ||
      activeProject.monitoring?.runId ||
      activeProject.industryRankingMonitoring?.runId ||
      resolveGeoMonitoringEdition(activeProject.monitoringEdition) === edition
    ) {
      return;
    }
    commitProject({
      ...activeProject,
      monitoringEdition: edition,
      monitoringRegion: undefined,
      selectedPlatformIds: edition === "overseas" ? ["chatgpt"] : [],
      updatedAt: new Date().toISOString(),
    });
  };

  const changeMonitoringRegion = (region?: GeoMonitoringRegion) => {
    if (
      !activeProject ||
      activeProject.monitoring?.runId ||
      activeProject.industryRankingMonitoring?.runId
    ) {
      return;
    }
    const edition = resolveGeoMonitoringEdition(
      activeProject.monitoringEdition,
    );
    if (region && region.edition !== edition) return;
    commitProject({
      ...activeProject,
      monitoringRegion: region,
      updatedAt: new Date().toISOString(),
    });
  };

  const toggleMonitoringScreenshot = (enabled: boolean) => {
    if (
      !activeProject ||
      activeProject.monitoring?.runId ||
      activeProject.industryRankingMonitoring?.runId
    ) {
      return;
    }
    commitProject({
      ...activeProject,
      monitoringScreenshotEnabled: enabled,
      updatedAt: new Date().toISOString(),
    });
  };

  const openMonitoringConfirmation = () => {
    if (!activeProject) return;
    const dualProject = activeProject as GeoProject & {
      selectedIndustryRankingQuestionId?: string;
    };
    const questionId = activeProject.selectedQuestionId;
    const platformIds = activeProject.selectedPlatformIds;
    const monitoringEdition = resolveGeoMonitoringEdition(
      activeProject.monitoringEdition,
    );
    if (
      (activeProject.monitoring?.runId ||
        activeProject.industryRankingMonitoring?.runId) &&
      !canResumeIncompleteDualMonitoring(activeProject)
    ) {
      setStorageNotice("本次监控范围已确认。");
      return;
    }
    if (isGeoStylePreviewProject(activeProject)) {
      setMonitoringStartError("");
      setMonitoringConfirmOpen(true);
      return;
    }
    if (
      !questionId ||
      !dualProject.selectedIndustryRankingQuestionId ||
      platformIds.length === 0
    ) {
      setStorageNotice("请先选择两类问题和至少一个需要监控的平台。");
      return;
    }
    if (!monitoringPlatformSelectionIsValid(monitoringEdition, platformIds)) {
      setStorageNotice(GEO_MONITORING_PLATFORM_SELECTION_MESSAGE);
      return;
    }
    setMonitoringStartError("");
    const recoveryClientRequestId = matchingMonitoringRecoveryClientRequestId(
      activeProject,
      {
        questionId,
        industryRankingQuestionId:
          dualProject.selectedIndustryRankingQuestionId,
        monitoringEdition,
        platformIds,
        regionCode: activeProject.monitoringRegion?.code,
        screenshotEnabled: activeProject.monitoringScreenshotEnabled,
      },
    );
    setMonitoringClientRequestId(
      (current) => current ?? recoveryClientRequestId ?? crypto.randomUUID(),
    );
    setMonitoringConfirmOpen(true);
  };

  const confirmMonitoringStart = async () => {
    const project = activeProject;
    if (!project || monitoringStarting) return;
    if (isGeoStylePreviewProject(project)) {
      setMonitoringConfirmOpen(false);
      setStorageNotice("当前为预览模式，不会创建真实监控任务。");
      return;
    }
    const questionId = project.selectedQuestionId;
    const industryRankingQuestionId = (
      project as GeoProject & { selectedIndustryRankingQuestionId?: string }
    ).selectedIndustryRankingQuestionId;
    const platformIds = project.selectedPlatformIds;
    const monitoringEdition = resolveGeoMonitoringEdition(
      project.monitoringEdition,
    );
    if (!questionId || !industryRankingQuestionId || platformIds.length === 0) {
      setMonitoringStartError("请先选择两类问题和至少一个监控平台。");
      return;
    }
    const clientRequestId =
      monitoringClientRequestId ??
      matchingMonitoringRecoveryClientRequestId(project, {
        questionId,
        industryRankingQuestionId,
        monitoringEdition,
        platformIds,
        regionCode: project.monitoringRegion?.code,
        screenshotEnabled: project.monitoringScreenshotEnabled,
      }) ??
      crypto.randomUUID();
    setMonitoringClientRequestId(clientRequestId);
    setMonitoringStarting(true);
    setMonitoringStartError("");
    try {
      const startRequest = {
        clientRequestId,
        questionId,
        industryRankingQuestionId,
        platformIds,
        monitoringEdition,
        ...(project.monitoringRegion
          ? { regionCode: project.monitoringRegion.code }
          : {}),
        ...(project.monitoringScreenshotEnabled
          ? { screenshotEnabled: true }
          : {}),
        onProcessing: (recoveringProject: GeoProject) => {
          // The 202 token contains the durable reservation. Persist every
          // rotation so a timeout, refresh, or server restart resumes the same
          // free scope without consuming a new create allowance.
          commitProject(recoveringProject);
        },
      } as Parameters<typeof startGeoMonitoring>[1] & {
        industryRankingQuestionId?: string;
      };
      const updated = await startGeoMonitoring(project, startRequest);
      commitProject(updated);
      setMonitoringConfirmOpen(false);
      setMonitoringClientRequestId(undefined);
      setActiveStage("monitoring");
      setStorageNotice("监控已开始，系统正在获取并留存平台回答。");
    } catch (error) {
      const message = errorMessage(error);
      setMonitoringStartError(message);
      setStorageNotice(message);
    } finally {
      setMonitoringStarting(false);
    }
  };

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

  const openDeleteDialog = (project: GeoProject) => {
    if (isGeoStylePreviewProject(project)) {
      setProjectMenuOpen(false);
      setStorageNotice(
        "本地样式预览项目无需删除；移除网址中的预览参数即可退出。",
      );
      return;
    }
    setDeleteMode("standard");
    setDeleteTarget(project);
    setDeleteError("");
  };

  const openFreshStartDialog = (project: GeoProject) => {
    setDeleteMode("fresh_start");
    setDeleteTarget(project);
    setDeleteError("");
  };

  const removeDraftFromMemory = (project: GeoProject) => {
    draftAnalysisControllers.current
      .get(project.id)
      ?.abort(new DOMException("草稿已从当前浏览器移除。", "AbortError"));
    draftAnalysisControllers.current.delete(project.id);
    pendingDrafts.current.delete(project.id);
    deletedProjectIds.current.add(project.id);
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
    setStorageNotice(
      "待启动草稿已移除；文件、上传进度和启动坐标已清除，下次将创建全新任务。",
    );
  };

  const removeProjectFromDevice = async (project: GeoProject) => {
    deletedProjectIds.current.add(project.id);
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
  };

  const confirmDeleteProject = async () => {
    const project = deleteTarget;
    if (!project || deleteAction) return;
    if (isGeoDraftProject(project)) {
      removeDraftFromMemory(project);
      return;
    }
    deletedProjectIds.current.add(project.id);
    assessmentStartInFlight.current.delete(project.id);
    forecastStartInFlight.current.delete(project.id);
    setRefreshingProjectIds((current) => ({
      ...current,
      [project.id]: false,
    }));
    setDeleteAction("local");
    setDeleteError("");
    setStorageNotice("");
    try {
      if (deleteMode === "fresh_start") {
        await startFreshKnowledgeBaseUpload({
          project,
          removeProjectFromDevice,
          openNewProjectBuilder: () => {
            setDraftInput("");
            setDraftFiles([]);
            openNewProjectBuilder();
          },
        });
        setStorageNotice(
          "本次失败项目已从当前浏览器移除；远端诊断记录已保留。请重新选择全部资料并创建全新任务。",
        );
      } else {
        await removeProjectFromDevice(project);
        setStorageNotice("项目已从当前浏览器移除；远端任务与记录已保留。");
      }
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
              企业知识基建目前采用邀请制，资料将在您点击“开始构建企业知识库”后上传。
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleInviteSubmit} className="geo-invite-form">
            <label htmlFor="geo-business-owner-name">商务负责人姓名</label>
            <input
              id="geo-business-owner-name"
              type="text"
              autoFocus
              autoComplete="name"
              value={businessOwnerName}
              disabled={creating}
              maxLength={80}
              onChange={(event) => {
                setBusinessOwnerName(event.target.value);
                setInviteError("");
              }}
              placeholder="请输入商务负责人姓名"
            />
            <label htmlFor="geo-invite-code">邀请码</label>
            <input
              id="geo-invite-code"
              type="password"
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

      <Dialog open={questionConfirmOpen} onOpenChange={setQuestionConfirmOpen}>
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
              确认两类 GEO 优化问题
            </DialogTitle>
            <DialogDescription className="geo-dialog-description">
              两个问题将使用相同的版本、地区、平台与截图设置分别采集，请确认选择无误。
            </DialogDescription>
          </DialogHeader>
          <div className="geo-question-confirm-stack">
            <div className="geo-question-confirm-card">
              <span>产品与舆情</span>
              <strong>“{pendingProductQuestion?.question}”</strong>
              <small>
                {
                  GEO_QUESTION_CATEGORIES.find(
                    (category) =>
                      category.id === pendingProductQuestion?.category,
                  )?.title
                }
              </small>
            </div>
            <div className="geo-question-confirm-card is-ranking">
              <span>行业排名与品牌优胜</span>
              <strong>“{pendingIndustryQuestion?.question}”</strong>
              <small>行业排名</small>
            </div>
          </div>
          <DialogFooter className="geo-dialog-actions">
            <button
              type="button"
              className="geo-secondary-button"
              onClick={() => setQuestionConfirmOpen(false)}
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

      <MonitoringConfirmDialog
        open={monitoringConfirmOpen}
        project={activeProject}
        starting={monitoringStarting}
        error={monitoringStartError}
        onOpenChange={setMonitoringConfirmOpen}
        onConfirm={confirmMonitoringStart}
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
                : deleteMode === "fresh_start"
                  ? "移除本次项目并重新上传？"
                  : "从当前浏览器移除项目？"}
            </DialogTitle>
            <DialogDescription className="geo-dialog-description">
              {deleteMode === "fresh_start" ? (
                <>
                  将仅从当前浏览器移除“{deleteTarget?.title}
                  ”及本地副本，不会调用远端删除接口。旧失败记录将保留用于诊断；确认后请重新选择全部资料，并创建全新项目和任务。
                </>
              ) : deleteTarget && isGeoDraftProject(deleteTarget) ? (
                <>
                  删除“{deleteTarget.title}
                  ”将取消当前页面请求，并清除文件、上传进度和启动坐标；不会查找、接管或重建响应未知的旧任务。之后需重新选择资料并发起全新任务。
                </>
              ) : (
                <>
                  仅从当前浏览器移除“{deleteTarget?.title}
                  ”和本地知识库
                  ZIP；不会停止或删除远端任务及其记录。本机移除后无法撤销。
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
              }}
              disabled={Boolean(deleteAction)}
            >
              取消
            </button>
            <button
              type="button"
              className="geo-danger-button"
              onClick={confirmDeleteProject}
              disabled={Boolean(deleteAction)}
            >
              {deleteAction === "local"
                ? "正在移除本机记录…"
                : deleteError
                  ? "重试移除本机记录"
                  : deleteTarget && isGeoDraftProject(deleteTarget)
                    ? "删除草稿"
                    : deleteMode === "fresh_start"
                      ? "移除并开始全新上传"
                      : "从本机移除"}
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
                    onFreshStart={() => openFreshStartDialog(activeProject)}
                    onStart={startDraftAnalysis}
                    starting={startingAnalysisId === activeProject.id}
                    hasUploadCheckpoint={Boolean(
                      pendingDrafts.current.get(activeProject.id)
                        ?.uploadReservations?.length ||
                        pendingDrafts.current.get(activeProject.id)
                          ?.uploadedFiles?.length,
                    )}
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
                    selectedProductQuestionId={pendingProductQuestion?.id}
                    selectedIndustryRankingQuestionId={
                      pendingIndustryQuestion?.id
                    }
                    onSelect={selectQuestion}
                    onCreateCustom={createCustomQuestion}
                    onResumeCustom={resumeCustomQuestion}
                    onRetryCustom={retryCustomQuestion}
                    onContinue={() => setQuestionConfirmOpen(true)}
                  />
                )}
                {activeStage === "monitoring" && (
                  <QuestionMonitoring
                    project={activeProject}
                    onChangeEdition={changeMonitoringEdition}
                    onChangeRegion={changeMonitoringRegion}
                    onToggleScreenshot={toggleMonitoringScreenshot}
                    onTogglePlatform={togglePlatform}
                    onBack={() => setActiveStage("question_recommendation")}
                    onStartMonitoring={openMonitoringConfirmation}
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
                    onRetryIndustryAssessment={retryIndustryAssessment}
                    retryingIndustryAssessment={
                      retryingIndustryAssessmentProjectId === activeProject.id
                    }
                    onRetryForecast={retryOptimizationForecast}
                    retryingForecast={Boolean(
                      retryingForecastProjectIds[activeProject.id],
                    )}
                    onRetryIndustryForecast={retryIndustryOptimizationForecast}
                    retryingIndustryForecast={Boolean(
                      retryingIndustryForecastProjectIds[activeProject.id],
                    )}
                    onStartService={() => {
                      setActiveStage("service_activation");
                    }}
                  />
                )}
                {activeStage === "service_activation" && (
                  <ServiceActivation
                    key={activeProject.id}
                    project={activeProject}
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
    (entry) =>
      entry.id === project.executionLog?.currentEntryId &&
      isExecutionEntryPending(entry),
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
          const subtitle = stage.subtitle;
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
                    ? "，问题范围已锁定，只读查看"
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

export function ExecutionLogDialog({
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
  const effectiveCurrentEntryId = log?.entries.find(
    (entry) =>
      entry.id === log.currentEntryId && isExecutionEntryPending(entry),
  )?.id;
  const [selectedEntryId, setSelectedEntryId] = useState<string>();
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    if (!open) return;
    const currentEntryId = effectiveCurrentEntryId || log?.entries.at(-1)?.id;
    setSelectedEntryId(currentEntryId);
    setClock(Date.now());
  }, [effectiveCurrentEntryId, log?.entries, open, project.id]);

  const selectedEntry =
    log?.entries.find((entry) => entry.id === selectedEntryId) ||
    log?.entries.find((entry) => entry.id === effectiveCurrentEntryId) ||
    log?.entries.at(-1);
  const shouldTick =
    open &&
    selectedEntry &&
    selectedEntry.id === effectiveCurrentEntryId &&
    isExecutionEntryPending(selectedEntry);

  useEffect(() => {
    if (!shouldTick) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [shouldTick]);

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
              查看当前环节的真实任务状态与执行计时。
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
            <p>启动企业分析后，这里会显示各环节状态与执行计时。</p>
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
                </button>
              ))}
            </aside>

            {selectedEntry && (
              <section className="geo-execution-detail">
                <header>
                  <div>
                    <span className="geo-execution-current-label">
                      {selectedEntry.id === effectiveCurrentEntryId
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

                <div
                  className="geo-execution-agent-runtime"
                  aria-label="FrontMind Agent 执行计时"
                >
                  <span className="geo-execution-agent-mark">
                    <Sparkles size={15} />
                  </span>
                  <div>
                    <strong>FrontMind Agent</strong>
                    <span>
                      <small>执行计时</small>
                      <b>
                        {["completed", "failed", "partial_review"].includes(
                          selectedEntry.status,
                        ) && !selectedEntry.completedAt
                          ? "--:--:--"
                          : formatExecutionElapsed(
                              selectedEntry.startedAt || project.createdAt,
                              selectedEntry.completedAt,
                              clock,
                            )}
                      </b>
                    </span>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function EnterpriseAnalysis({
  project,
  archivePersistenceVersion = 0,
  onDownload,
  onContact,
  onFreshStart,
  onStart,
  starting,
  hasUploadCheckpoint = false,
  onContinueToQuestions,
  startingQuestions = false,
}: {
  project: GeoProject;
  archivePersistenceVersion?: number;
  onDownload: () => void;
  onContact: () => void;
  onFreshStart?: () => void;
  onStart: () => void;
  starting: boolean;
  hasUploadCheckpoint?: boolean;
  onContinueToQuestions?: () => void;
  startingQuestions?: boolean;
}) {
  const [view, setView] = useState<KnowledgeView>("overview");
  const knowledgeBase = project.knowledgeBase;
  const [activeSectionId, setActiveSectionId] = useState<string>();
  const [completenessOpen, setCompletenessOpen] = useState(false);
  const knowledgeDocumentRef = useRef<HTMLElement>(null);
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
                  <span className="geo-spinner" />
                  {hasUploadCheckpoint ? " 正在继续上传" : " 正在开始构建"}
                </>
              ) : (
                <>
                  {hasUploadCheckpoint ? "继续上传" : "开始构建企业知识库"}{" "}
                  <ArrowRight size={17} />
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
    const freshUploadAllowed =
      project.knowledgeBaseSupportRequired === false &&
      !project.knowledgeBaseValidationCategory &&
      !finalizationFailed &&
      Boolean(onFreshStart);
    return (
      <div className="geo-failure-state" role="alert" aria-live="assertive">
        <span>
          <CircleAlert size={24} />
        </span>
        <h2>
          {finalizationFailed ? "知识库生成未能完成" : "企业知识库生成未能完成"}
        </h2>
        <p>{failureMessage}</p>
        {!freshUploadAllowed ? (
          <button
            type="button"
            className="geo-primary-button"
            onClick={onContact}
          >
            联系技术支持 <ArrowRight size={15} />
          </button>
        ) : (
          <button
            type="button"
            className="geo-primary-button"
            onClick={() => onFreshStart?.()}
          >
            移除本次项目并重新上传 <ArrowRight size={15} />
          </button>
        )}
      </div>
    );
  }

  if (!knowledgeBase)
    return <AnalysisProgress project={project} onContact={onContact} />;

  const sections = completeKnowledgeBaseSections(knowledgeBase.sections);
  const branchMetric = knowledgeBase.metrics.find(
    (metric) => metric.key === "branches",
  );
  const documentMetric = knowledgeBase.metrics.find(
    (metric) =>
      metric.key === "nodes" ||
      metric.key === "documents" ||
      metric.label === "知识文档",
  );
  const sourceMetric = knowledgeBase.metrics.find(
    (metric) => metric.key === "sources",
  );
  const completenessMetric = knowledgeBase.metrics.find(
    (metric) => metric.key === "completeness",
  );
  const leafDocumentCount = sections.reduce(
    (total, section) => total + (section.leaves?.length ?? 0),
    0,
  );
  const knowledgeDocumentCount =
    documentMetric?.value ??
    (leafDocumentCount > 0
      ? leafDocumentCount
      : knowledgeBase.sections.filter(
          (section) =>
            Boolean(section.markdown?.trim()) ||
            Boolean(section.leaves?.length),
        ).length);
  const branchCount = branchMetric?.value ?? sections.length;
  const sourceCount = sourceMetric?.value ?? knowledgeBase.sources.length;
  const completenessCounts = knowledgeBase.completeness?.counts;
  const sufficientlySourced = completenessCounts
    ? Math.min(
        completenessCounts.applicableLeaves,
        completenessCounts.verifiedFirstParty +
          completenessCounts.verifiedAuthoritative +
          completenessCounts.supportedThirdParty,
      )
    : undefined;
  const metrics = [
    {
      key: "branches",
      label: "知识分支",
      value: branchCount,
      detail: `自适应${branchCount}分支企业知识树`,
    },
    {
      key: "documents",
      label: "知识文档",
      value: knowledgeDocumentCount,
      detail: "ZIP 内结构化 Markdown",
    },
    {
      key: "sources",
      label: "证据来源",
      value: sourceCount,
      detail: "从来源索引与覆盖报告提取",
    },
    {
      key: "completeness",
      label: "证据完整度",
      value: knowledgeBase.completeness
        ? `${knowledgeBase.completeness.score}%`
        : (completenessMetric?.value ?? "—"),
      detail:
        sufficientlySourced !== undefined && completenessCounts
          ? `充分取证 ${sufficientlySourced} / ${completenessCounts.applicableLeaves}`
          : "等待结构化覆盖评估",
    },
  ];
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
  const recommendationStatus = questionRecommendationStatus(project);
  const questionGenerationInProgress =
    startingQuestions || recommendationStatus === "pending";

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
          {recommendationStatus === "pending" && (
            <div className="geo-kb-meta">
              <span className="is-live">
                <span className="geo-live-dot" /> 正在生成 GEO 问题
              </span>
            </div>
          )}
        </div>
        <div className="geo-kb-brand-card" aria-label="企业官方 Logo">
          {logoAsset && (logoAsset.previewUrl || logoAsset.url) ? (
            <KnowledgeAssetPreviewImage asset={logoAsset} />
          ) : (
            <span>暂无官方 Logo</span>
          )}
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
              recommendationStatus === "failed"
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

      {recommendationStatus === "failed" && (
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
                  onClick={() => {
                    setActiveSectionId(section.id);
                    requestAnimationFrame(() => {
                      if (knowledgeDocumentRef.current) {
                        knowledgeDocumentRef.current.scrollTop = 0;
                      }
                    });
                  }}
                >
                  <span className="geo-branch-index">
                    {String(index + 1).padStart(2, "0")}
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
            <article
              ref={knowledgeDocumentRef}
              className="geo-knowledge-document"
            >
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
          FrontMind 正在按业务分支进行资料采集，最长可能运行约 60 分钟；页面每
          30 秒同步一次同一任务，完成后将直接生成可核验知识库。
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
                任务最长可能运行约 60 分钟；页面会每 30
                秒同步同一任务，不会重复创建。
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
        刷新页面、关闭或最小化工作台都不会重复提交；任务会在后台继续，完成后项目与
        ZIP 会保存在本机浏览器。
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
  selectedProductQuestionId,
  selectedIndustryRankingQuestionId,
  onSelect,
  onCreateCustom,
  onResumeCustom,
  onRetryCustom,
  onContinue,
}: {
  project: GeoProject;
  selectionLocked: boolean;
  selectedProductQuestionId?: string;
  selectedIndustryRankingQuestionId?: string;
  onSelect: (question: GeoQuestion) => void;
  onCreateCustom?: (
    question: string,
    signal?: AbortSignal,
  ) => Promise<GeoQuestion>;
  onResumeCustom?: (signal?: AbortSignal) => Promise<GeoQuestion | undefined>;
  onRetryCustom?: (
    terminalError: unknown,
    signal?: AbortSignal,
  ) => Promise<GeoQuestion>;
  onContinue?: () => void;
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
  const [permissionVideoLoading, setPermissionVideoLoading] = useState(false);
  const [permissionVideoError, setPermissionVideoError] = useState("");
  const recommendationStatus = questionRecommendationStatus(project);
  const recommendedQuestions = project.questions.filter(
    (question) => !question.id.startsWith("custom-"),
  );
  const unclassifiedQuestions = recommendedQuestions.filter(
    (question) => question.classificationState === "unclassified",
  );
  const classifiedQuestions = recommendedQuestions.filter(
    (question) => question.classificationState !== "unclassified",
  );
  const countsValid = GEO_QUESTION_CATEGORIES.every(
    (category) =>
      classifiedQuestions.filter(
        (question) => question.category === category.id,
      ).length === 5,
  );
  const storedIndustryQuestionId = (
    project as GeoProject & { selectedIndustryRankingQuestionId?: string }
  ).selectedIndustryRankingQuestionId;
  const productQuestionId =
    selectedProductQuestionId ?? project.selectedQuestionId;
  const industryQuestionId =
    selectedIndustryRankingQuestionId ?? storedIndustryQuestionId;
  const readyToContinue = Boolean(productQuestionId && industryQuestionId);

  useEffect(() => {
    const pending = readPendingGeoCustomQuestionValidation(project.id);
    const controller = new AbortController();
    let cancelled = false;
    customAbortController.current?.abort();
    customAbortController.current = controller;
    const shouldProbe =
      recommendationStatus === "ready" && Boolean(onResumeCustom);
    customRequestInFlight.current = shouldProbe;
    setCustomQuestion(pending?.question ?? "");
    setCustomSubmitting(Boolean(pending) || shouldProbe);
    setCustomError("");
    setCustomRetryable(false);
    setCustomRetryTerminalError(undefined);
    setCustomRestartAfterExpiration(false);
    setValidatedCustomQuestion(undefined);
    setCustomStartedAt(pending || shouldProbe ? Date.now() : undefined);
    void (
      shouldProbe
        ? onResumeCustom!(controller.signal)
        : Promise.resolve(undefined)
    )
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
    // Recovery is keyed by the durable project id and starts only after the
    // authoritative recommendation set becomes ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, recommendationStatus]);

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

  const setVideoOpen = (open: boolean) => {
    setPermissionVideoOpen(open);
    setPermissionVideoLoading(open);
    setPermissionVideoError("");
  };

  const customQuestionCard = (
    <section className="geo-custom-question-card">
      <div className="geo-custom-question-copy">
        <span aria-hidden="true">
          <MessageSquareText size={20} />
        </span>
        <div>
          <small>产品侧自定义问题</small>
          <h3>已有明确的 GEO 优化问题？</h3>
          <p>
            输入一个与当前企业明确相关的产品、竞品或舆情问题；行业侧仍需从推荐列表中选择。
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
          if (!onCreateCustom) {
            setCustomError("当前环境暂不可验证自定义问题，请稍后重试。");
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
          const resumablePending = readPendingGeoCustomQuestionValidation(
            project.id,
          );
          const operation =
            retryTerminalError && onRetryCustom
              ? onRetryCustom(retryTerminalError, controller.signal)
              : resumablePending && onResumeCustom
                ? onResumeCustom(controller.signal).then((result) => {
                    if (!result) {
                      throw new Error("原问题验证已结束，请重新提交当前问题。");
                    }
                    return result;
                  })
                : onCreateCustom(question, controller.signal);
          void operation
            .then((validatedQuestion) => {
              if (
                controller.signal.aborted ||
                customAbortController.current !== controller
              )
                return;
              setValidatedCustomQuestion(validatedQuestion);
              setCustomQuestion(validatedQuestion.question);
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
                    (!authoritativeTerminal && pending?.question === question),
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
        <label htmlFor={`geo-custom-question-${project.id}`}>
          自定义产品侧优化问题
        </label>
        <div>
          <input
            id={`geo-custom-question-${project.id}`}
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
                <Check size={15} /> 设为产品侧问题
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
                <>请修改问题</>
              )
            ) : (
              <>
                验证问题 <ArrowRight size={15} />
              </>
            )}
          </button>
        </div>
        <small>
          问题需明确包含当前企业、品牌或具体产品/服务；行业排名、榜单、开放式品牌推荐及企业无关问题不会通过。
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
                ? "可使用新的请求重新提交同一问题。"
                : customRetryTerminalError
                  ? "可确认旧终态后，以新的请求重新发起一次验证。"
                  : "可恢复同一验证任务。"
              : null}
          </p>
        )}
      </form>
    </section>
  );

  const permissionCard = (
    <section className="geo-permission-card">
      <div className="geo-permission-heading">
        <span aria-hidden="true">
          <Globe2 size={18} />
        </span>
        <div>
          <h3>行业排名为什么需要全域营销协同</h3>
          <p>
            行业排名不是优化一句答案，而是建设长期一致、可核验的品牌信号系统。
          </p>
        </div>
        <button
          type="button"
          className="geo-permission-video-trigger"
          onClick={() => setVideoOpen(true)}
          aria-haspopup="dialog"
          aria-label="观看行业排名全域营销视频演示，时长 66 秒"
        >
          <Play size={15} fill="currentColor" aria-hidden="true" />
          观看视频演示
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
              建立小红书、微信视频号、抖音企业号与百度百科等公开内容阵地，让品牌主体、专业观点与行业内容相互印证。
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
                name="百度百科"
                logo="/geo-builder/channels/baidu-baike.svg"
                tone="is-blue"
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
              让商品与服务货架保持一致的产品参数、适用场景和服务入口，并让主流
              AI 平台读取到同一套事实。
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
              用 AI
              专用官网承载结构化事实，联动百科、公众号、知乎与权威媒体，沉淀可核验来源。
            </p>
            <div className="geo-permission-channels">
              <PermissionChannel
                name="AI 专用官网"
                logo="/geo-builder/channels/frontmind.svg"
                tone="is-purple"
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
    </section>
  );

  if (recommendationStatus === "pending") {
    return (
      <div className="geo-question-view" aria-live="polite">
        <header className="geo-question-header">
          <div>
            <span className="geo-kb-kicker">
              <LoaderCircle size={14} className="is-spinning" /> 问题推荐进行中
            </span>
            <h2 className="geo-stage-title">正在生成 GEO 问题</h2>
          </div>
        </header>
        <div
          className="geo-question-groups geo-question-pending-grid"
          role="status"
          aria-label="GEO 问题生成中"
        >
          {Array.from({ length: 2 }, (_, groupIndex) => (
            <section
              key={"question-pending-group-" + (groupIndex + 1)}
              className="geo-question-group"
              aria-hidden="true"
            >
              <div className="geo-question-list">
                {Array.from({ length: 5 }, (_, questionIndex) => (
                  <div
                    key={
                      "question-pending-" +
                      (groupIndex + 1) +
                      "-" +
                      (questionIndex + 1)
                    }
                    className="geo-question-skeleton"
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    );
  }

  if (recommendationStatus === "failed") {
    return (
      <div className="geo-question-view">
        <section className="geo-recommendation-error" role="alert">
          <span>
            <CircleAlert size={17} />
          </span>
          <div>
            <strong>问题推荐未能完成</strong>
            <p>
              {project.questionRecommendation?.failureKind === "result_invalid"
                ? "推荐结果未通过完整性校验，知识库仍已安全保留。"
                : "问题推荐服务未能返回可用结果，知识库仍已安全保留。"}
            </p>
          </div>
        </section>
      </div>
    );
  }

  if (recommendationStatus !== "ready") {
    return (
      <div className="geo-question-view">
        <EmptyKnowledgeState
          icon={<Sparkles size={22} />}
          title="尚未启动问题推荐"
          copy="请返回企业分析页，点击生成 GEO 问题。"
        />
      </div>
    );
  }

  const renderCategory = (
    categoryId: GeoQuestion["category"],
    order: number,
  ) => {
    const category = GEO_QUESTION_CATEGORIES.find(
      (candidate) => candidate.id === categoryId,
    );
    if (!category) return null;
    const questions = classifiedQuestions.filter(
      (question) => question.category === categoryId,
    );
    const CategoryIcon =
      categoryId === "reputation"
        ? Quote
        : categoryId === "product_scenario"
          ? Layers3
          : categoryId === "industry_ranking"
            ? BarChart3
            : Search;
    const isIndustry = categoryId === "industry_ranking";
    const selectedId = isIndustry ? industryQuestionId : productQuestionId;
    return (
      <section
        key={categoryId}
        className="geo-question-category"
        data-category={categoryId}
      >
        <header>
          <span className="geo-category-icon" aria-hidden="true">
            <CategoryIcon size={18} />
          </span>
          <div>
            <h3>{category.title}</h3>
            <p>{category.description}</p>
          </div>
          <div className="geo-question-category-meta">
            {isIndustry && <strong>从推荐问题中选择</strong>}
            <em>
              {String(order).padStart(2, "0")} · {questions.length} 题
            </em>
          </div>
        </header>
        <div className="geo-question-list">
          {questions.map((question, index) => {
            const selected = selectedId === question.id;
            const disabled =
              selectionLocked || (!isIndustry && !question.selectable);
            return (
              <button
                key={question.id}
                type="button"
                disabled={disabled}
                className={selected ? "selected" : ""}
                aria-pressed={selected}
                onClick={() => onSelect(question)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <span>
                  <strong>{question.question}</strong>
                  {question.rationale && <small>{question.rationale}</small>}
                </span>
                {selected ? <Check size={15} /> : <ArrowRight size={15} />}
              </button>
            );
          })}
          {questions.length === 0 && (
            <div className="geo-question-empty">本分类本次暂无可展示问题</div>
          )}
        </div>
      </section>
    );
  };

  return (
    <div className="geo-question-view">
      <header className="geo-question-header">
        <div>
          <span className="geo-kb-kicker">
            <Sparkles size={14} /> 基于企业知识库推荐
          </span>
          <h2 className="geo-stage-title">
            {selectionLocked ? "查看本次 GEO 优化问题" : "两类问题各选择一项"}
          </h2>
        </div>
        <p>
          {selectionLocked
            ? "监控范围已经确认，当前页面仅供查看，不能更换问题。"
            : "产品与舆情、行业排名与品牌优胜各选择一个问题，再统一设置采样范围。"}
        </p>
      </header>

      {selectionLocked && (
        <div className="geo-validation-notice" role="status">
          <LockKeyhole size={14} /> 本次问题范围已锁定，避免监控与评估结果错配。
        </div>
      )}
      {!countsValid && (
        <div className="geo-validation-notice" role="status">
          <CircleAlert size={14} />
          已优先展示本次生成的 {classifiedQuestions.length} 道已分类问题。
          {unclassifiedQuestions.length > 0
            ? " 另有 " +
              unclassifiedQuestions.length +
              " 道分类未确认的问题，本次不用于选择。"
            : ""}
        </div>
      )}

      <div className="geo-question-groups">
        <section className="geo-question-group is-product">
          <header className="geo-question-group-heading">
            <div>
              <span>01</span>
              <div>
                <h3>产品与舆情</h3>
                <p>从产品服务、品牌口碑或竞品对比中选择一个核心问题</p>
              </div>
            </div>
            <small>
              {productQuestionId ? "已选择 1 个问题" : "请选择 1 个问题"}
            </small>
          </header>
          <div className="geo-question-categories">
            {renderCategory("product_scenario", 1)}
            {renderCategory("reputation", 2)}
            {renderCategory("competitor_comparison", 3)}
          </div>
          {customQuestionCard}
        </section>

        <section className="geo-question-group is-ranking">
          <header className="geo-question-group-heading">
            <div>
              <span>02</span>
              <div>
                <h3>行业排名与品牌优胜</h3>
                <p>选择一个行业排名问题，建立品牌提及率与语义资产基线</p>
              </div>
            </div>
            <small>
              {industryQuestionId ? "已选择 1 个问题" : "请选择 1 个问题"}
            </small>
          </header>
          <div className="geo-question-categories is-ranking">
            {renderCategory("industry_ranking", 4)}
          </div>
          {permissionCard}
        </section>
      </div>

      <Dialog open={permissionVideoOpen} onOpenChange={setVideoOpen}>
        <DialogContent
          className="geo-permission-video-dialog"
          overlayClassName="geo-permission-video-overlay"
        >
          <DialogHeader className="geo-permission-video-dialog-header">
            <span className="geo-permission-video-kicker">
              <Play size={13} fill="currentColor" aria-hidden="true" />
              66 秒视频演示
            </span>
            <DialogTitle>行业排名为什么需要全域营销？</DialogTitle>
            <DialogDescription>
              从行业内容、商品与服务、自有阵地和权威信源三个层面，理解 AI
              推荐背后的品牌信号系统。
            </DialogDescription>
          </DialogHeader>
          <div className="geo-permission-video-frame">
            {permissionVideoOpen && (
              <video
                controls
                autoPlay
                playsInline
                preload="metadata"
                poster={permissionVideoPosterUrl}
                aria-label="行业排名为什么需要全域营销视频演示"
                onLoadStart={() => setPermissionVideoLoading(true)}
                onWaiting={() => setPermissionVideoLoading(true)}
                onCanPlay={() => setPermissionVideoLoading(false)}
                onPlaying={() => setPermissionVideoLoading(false)}
                onError={() => {
                  setPermissionVideoLoading(false);
                  setPermissionVideoError("视频暂时无法加载，请稍后重试。");
                }}
              >
                <source src={permissionVideoUrl} type="video/mp4" />
                当前浏览器暂不支持 HTML5 视频播放。
              </video>
            )}
            {permissionVideoLoading && !permissionVideoError && (
              <div className="geo-permission-video-status" role="status">
                <LoaderCircle size={24} className="is-spinning" />
                正在加载视频…
              </div>
            )}
            {permissionVideoError && (
              <div
                className="geo-permission-video-status is-error"
                role="alert"
              >
                <CircleAlert size={24} />
                {permissionVideoError}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <footer className="geo-question-selection-footer">
        <div>
          <strong>
            {readyToContinue ? "两类问题均已选择" : "还需完成两类问题选择"}
          </strong>
          <small>
            下一步将为两个问题统一选择监控版本、地区、平台和截图设置。
          </small>
        </div>
        <button
          type="button"
          className="geo-primary-button"
          disabled={selectionLocked || !readyToContinue}
          onClick={onContinue}
        >
          确认两个问题并继续 <ArrowRight size={16} />
        </button>
      </footer>
    </div>
  );
}

export function MonitoringConfirmDialog({
  open,
  project,
  starting,
  error,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  project?: GeoProject;
  starting: boolean;
  error: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const edition = resolveGeoMonitoringEdition(project?.monitoringEdition);
  const platformIds = project?.selectedPlatformIds ?? [];
  const questionId = project?.selectedQuestionId;
  const question = project?.questions.find((item) => item.id === questionId);
  const industryQuestionId = (
    project as
      | (GeoProject & { selectedIndustryRankingQuestionId?: string })
      | undefined
  )?.selectedIndustryRankingQuestionId;
  const industryQuestion = project?.questions.find(
    (item) => item.id === industryQuestionId,
  );
  const hasDualQuestionScope = Boolean(
    industryQuestion ||
      project?.questions.some((item) => item.category === "industry_ranking"),
  );
  const platformNames = platformIds
    .map((id) => GEO_PLATFORMS.find((platform) => platform.id === id)?.name)
    .filter(Boolean)
    .join("、");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !starting && onOpenChange(next)}
    >
      <DialogContent
        className="geo-dialog geo-monitor-confirm-dialog"
        overlayClassName="geo-dialog-overlay"
        showCloseButton={false}
      >
        <DialogHeader>
          <span className="geo-dialog-mark">
            <BarChart3 size={19} />
          </span>
          <DialogTitle className="geo-dialog-title">
            确认并获取监控答案
          </DialogTitle>
          <DialogDescription className="geo-dialog-description">
            {hasDualQuestionScope
              ? "确认两类问题、监控版本和平台范围后，即可分别获取并留存回答。"
              : "确认当前问题、监控版本和平台范围后，即可获取并留存本次回答。"}
          </DialogDescription>
        </DialogHeader>
        <section className="geo-monitor-confirm-summary">
          <div>
            <span>产品与舆情</span>
            <strong>{question?.question || "已选择的 GEO 优化问题"}</strong>
          </div>
          {hasDualQuestionScope && (
            <div>
              <span>行业排名与品牌优胜</span>
              <strong>
                {industryQuestion?.question || "已选择的行业排名问题"}
              </strong>
            </div>
          )}
          <dl>
            <div>
              <dt>监控版本</dt>
              <dd>{monitoringEditionLabel(edition)}</dd>
            </div>
            <div>
              <dt>已选平台</dt>
              <dd>{platformNames || `${platformIds.length} 个平台`}</dd>
            </div>
            <div>
              <dt>本品词</dt>
              <dd>
                {project?.knowledgeBase?.companyName ||
                  project?.title ||
                  "项目公司名"}
              </dd>
            </div>
            <div>
              <dt>监控地区</dt>
              <dd>{project?.monitoringRegion?.label || "默认随机地点"}</dd>
            </div>
            <div>
              <dt>页面截图</dt>
              <dd>{project?.monitoringScreenshotEnabled ? "开启" : "关闭"}</dd>
            </div>
            <div>
              <dt>预计回答</dt>
              <dd>
                {platformIds.length * 5 * (hasDualQuestionScope ? 2 : 1)} 次
              </dd>
            </div>
          </dl>
        </section>
        {error && (
          <p className="geo-dialog-error" role="alert">
            {error}
          </p>
        )}
        <DialogFooter className="geo-dialog-actions">
          <button
            type="button"
            className="geo-secondary-button"
            onClick={() => onOpenChange(false)}
            disabled={starting}
          >
            返回修改
          </button>
          <button
            type="button"
            className="geo-primary-button"
            onClick={onConfirm}
            disabled={starting || platformIds.length === 0}
          >
            {starting ? (
              <>
                <LoaderCircle className="is-spinning" size={16} />
                正在获取
              </>
            ) : (
              <>
                确认并获取监控答案 <ArrowRight size={16} />
              </>
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type QuestionMonitoringProps = {
  project: GeoProject;
  onChangeEdition: (edition: GeoMonitoringEdition) => void;
  onChangeRegion: (region?: GeoMonitoringRegion) => void;
  onToggleScreenshot: (enabled: boolean) => void;
  onTogglePlatform: (platformId: GeoPlatformId) => void;
  onBack: () => void;
  onStartMonitoring: () => void;
  onRefresh: () => Promise<void>;
  refreshing: boolean;
  lastRefreshedAt?: string;
  onContact: () => void;
};

function QuestionMonitoring({
  project,
  onChangeEdition,
  onChangeRegion = () => undefined,
  onToggleScreenshot = () => undefined,
  onTogglePlatform,
  onBack,
  onStartMonitoring,
  onRefresh,
  refreshing,
  lastRefreshedAt,
  onContact,
}: QuestionMonitoringProps) {
  const monitoringStarted = Boolean(
    project.monitoring?.runId || project.industryRankingMonitoring?.runId,
  );

  return (
    <div className="geo-monitor-stage">
      <MonitoringSetup
        project={project}
        onChangeEdition={onChangeEdition}
        onChangeRegion={onChangeRegion}
        onToggleScreenshot={onToggleScreenshot}
        onTogglePlatform={onTogglePlatform}
        onBack={onBack}
        onStartMonitoring={onStartMonitoring}
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

export function MonitoringSetup({
  project,
  onChangeEdition,
  onChangeRegion = () => undefined,
  onToggleScreenshot = () => undefined,
  onTogglePlatform,
  onBack,
  onStartMonitoring,
  locked,
}: {
  project: GeoProject;
  onChangeEdition: (edition: GeoMonitoringEdition) => void;
  onChangeRegion?: (region?: GeoMonitoringRegion) => void;
  onToggleScreenshot?: (enabled: boolean) => void;
  onTogglePlatform: (platformId: GeoPlatformId) => void;
  onBack: () => void;
  onStartMonitoring: () => void;
  locked: boolean;
}) {
  const monitoringEdition = resolveGeoMonitoringEdition(
    project.monitoringEdition,
  );
  const platforms = monitoringPlatformsForEdition(monitoringEdition);
  const selectedQuestion = project.questions.find(
    (question) => question.id === project.selectedQuestionId,
  );
  const selectedIndustryQuestion = project.questions.find(
    (question) =>
      question.id ===
      (project as GeoProject & { selectedIndustryRankingQuestionId?: string })
        .selectedIndustryRankingQuestionId,
  );
  const requiresIndustryQuestion = project.questions.some(
    (question) => question.category === "industry_ranking",
  );
  const questionCount = requiresIndustryQuestion ? 2 : 1;
  const lockedPlatformIds = project.monitoring?.platforms.length
    ? project.monitoring.platforms
    : project.industryRankingMonitoring?.platforms.length
      ? project.industryRankingMonitoring.platforms
      : undefined;
  const selectedPlatformIds =
    locked && lockedPlatformIds?.length
      ? lockedPlatformIds
      : project.selectedPlatformIds;
  const selectedCount = selectedPlatformIds.length;
  const answers = selectedCount * 5 * questionCount;
  const validSelection =
    monitoringPlatformSelectionIsValid(
      monitoringEdition,
      selectedPlatformIds,
    ) &&
    Boolean(selectedQuestion) &&
    (!requiresIndustryQuestion || Boolean(selectedIndustryQuestion));
  const resumeIncompleteMonitoring = canResumeIncompleteDualMonitoring(project);
  const [regions, setRegions] = useState<
    Array<{ code: string; label: string }>
  >([]);
  const [regionsLoading, setRegionsLoading] = useState(false);
  const [regionsError, setRegionsError] = useState("");
  const [regionReload, setRegionReload] = useState(0);
  const duplicateRegionLabels = useMemo(() => {
    const counts = new Map<string, number>();
    for (const region of regions) {
      counts.set(region.label, (counts.get(region.label) ?? 0) + 1);
    }
    return new Set(
      Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([label]) => label),
    );
  }, [regions]);

  useEffect(() => {
    let cancelled = false;
    if (locked) {
      setRegions(project.monitoringRegion ? [project.monitoringRegion] : []);
      setRegionsLoading(false);
      setRegionsError("");
      return;
    }
    setRegions([]);
    setRegionsError("");
    setRegionsLoading(true);
    if (isGeoStylePreviewProject(project)) {
      void loadGeoStylePreview()
        .then(({ geoStylePreviewRegions }) => {
          if (cancelled) return;
          setRegions(geoStylePreviewRegions(monitoringEdition).regions);
        })
        .catch(() => {
          if (cancelled) return;
          setRegionsError("预览地区列表加载失败；仍可使用默认随机地点。");
        })
        .finally(() => {
          if (!cancelled) setRegionsLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }
    void getGeoMonitoringRegions(project, monitoringEdition)
      .then((catalog) => {
        if (cancelled) return;
        setRegions(catalog.regions);
      })
      .catch(() => {
        if (cancelled) return;
        setRegions([]);
        setRegionsError("实时地区列表暂不可用；仍可使用默认随机地点。");
      })
      .finally(() => {
        if (!cancelled) setRegionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    locked,
    monitoringEdition,
    project.id,
    project.remoteToken,
    regionReload,
  ]);

  return (
    <div className="geo-monitor-view">
      <header className="geo-monitor-header">
        <div>
          <span className="geo-kb-kicker">
            <BarChart3 size={14} /> 问题现状监控
          </span>
          <h2 className="geo-stage-title">选择需要获取回答的平台</h2>
          <p>
            {requiresIndustryQuestion
              ? "两类问题各按每个平台 5 次采样，共享同一时间窗口与采样范围。"
              : "每个平台将独立获取 5 次回答，用于建立当前问题的可见度与内容基线。"}
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          disabled={locked}
          title={locked ? "本次监控范围已确认" : undefined}
        >
          {locked ? "范围已确认" : "更换问题"}
        </button>
      </header>

      <section className="geo-monitor-edition" aria-label="选择监控版本">
        <div>
          <strong>监控版本</strong>
          <small>可选择国内版或海外版进行监控及后续服务</small>
        </div>
        <div className="geo-monitor-edition-switch" role="group">
          {(["domestic", "overseas"] as const).map((edition) => (
            <button
              key={edition}
              type="button"
              className={monitoringEdition === edition ? "is-active" : ""}
              aria-pressed={monitoringEdition === edition}
              onClick={() => onChangeEdition(edition)}
              disabled={locked}
            >
              {monitoringEditionLabel(edition)}
            </button>
          ))}
        </div>
      </section>

      <section className="geo-monitor-sampling-settings" aria-label="采样设置">
        <div className="geo-monitor-setting-card">
          <span className="geo-monitor-setting-icon">
            <MapPin size={17} />
          </span>
          <div className="geo-monitor-setting-copy">
            <strong>
              {monitoringEdition === "overseas"
                ? "采集国家/地区"
                : "采集城市/地区"}
            </strong>
          </div>
          <Select
            value={project.monitoringRegion?.code ?? "__provider_default__"}
            onValueChange={(code) => {
              if (code === "__provider_default__") {
                onChangeRegion(undefined);
                return;
              }
              const region = regions.find(
                (candidate) => candidate.code === code,
              );
              if (!region) return;
              onChangeRegion({ edition: monitoringEdition, ...region });
            }}
            disabled={locked}
          >
            <SelectTrigger className="geo-monitor-region-trigger">
              <SelectValue
                placeholder={regionsLoading ? "正在加载地区…" : "选择监控地区"}
              />
            </SelectTrigger>
            <SelectContent className="geo-monitor-region-content" align="end">
              <SelectItem value="__provider_default__">
                默认随机地点（推荐）
              </SelectItem>
              {regions.map((region) => (
                <SelectItem key={region.code} value={region.code}>
                  {duplicateRegionLabels.has(region.label)
                    ? `${region.label}（${region.code}）`
                    : region.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {regionsLoading && (
            <small className="geo-monitor-region-status" role="status">
              正在加载实时地区列表…
            </small>
          )}
          {regionsError && (
            <div className="geo-monitor-region-error" role="status">
              <small>{regionsError}</small>
              <button
                type="button"
                onClick={() => setRegionReload((value) => value + 1)}
              >
                重新加载
              </button>
            </div>
          )}
        </div>

        <div className="geo-monitor-setting-card">
          <span className="geo-monitor-setting-icon">
            <ImageIcon size={17} />
          </span>
          <div className="geo-monitor-setting-copy">
            <strong>采集并展示原始页面截图</strong>
          </div>
          <Switch
            checked={project.monitoringScreenshotEnabled === true}
            onCheckedChange={onToggleScreenshot}
            disabled={locked}
            aria-label="采集并展示原始页面截图"
          />
        </div>
      </section>

      <section className="geo-selected-question" aria-label="当前优化问题">
        <span>当前优化问题</span>
        <div className="geo-selected-question-grid">
          <article>
            <small>产品与舆情</small>
            <p>
              {selectedQuestion?.question ||
                "请先返回问题推荐选择产品与舆情问题。"}
            </p>
            {selectedQuestion && (
              <em>
                {
                  GEO_QUESTION_CATEGORIES.find(
                    (category) => category.id === selectedQuestion.category,
                  )?.title
                }
              </em>
            )}
          </article>
          {requiresIndustryQuestion && (
            <article className="is-ranking">
              <small>行业排名与品牌优胜</small>
              <p>
                {selectedIndustryQuestion?.question ||
                  "请先返回问题推荐选择行业排名问题。"}
              </p>
              {selectedIndustryQuestion && <em>行业排名</em>}
            </article>
          )}
        </div>
      </section>

      <div
        className={`geo-platform-grid ${monitoringEdition === "overseas" ? "is-overseas" : ""}`}
      >
        {platforms.map((platform) => {
          const selected = selectedPlatformIds.includes(platform.id);
          return (
            <button
              key={platform.id}
              type="button"
              className={selected ? "selected" : ""}
              onClick={() => onTogglePlatform(platform.id)}
              aria-pressed={selected}
              disabled={locked}
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
              <span className="geo-platform-price">5 次回答</span>
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
            <small>
              {requiresIndustryQuestion
                ? "两类问题共享同一时间窗口与采样范围"
                : "同一问题、同一时间窗口、平台独立采样"}
            </small>
          </span>
        </div>
        <div>
          <Database size={16} />
          <span>
            <strong>原始回答留档</strong>
            <small>
              {locked
                ? "每次回答及采集时间均已留档"
                : "确认后将保留每次回答及采集时间"}
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

      <footer className="geo-monitor-start-bar">
        <div className="geo-monitor-start-summary">
          <span>
            已选 <strong>{selectedCount}</strong> 个平台
          </span>
          <span>
            预计获取 <strong>{answers}</strong> 次回答
          </span>
        </div>
        <div className="geo-monitor-start-scope">
          <span>本次监控</span>
          <small>
            {questionCount} 类问题 · {selectedCount} 个平台 · {answers} 次回答
          </small>
        </div>
        <button
          type="button"
          onClick={onStartMonitoring}
          disabled={
            selectedCount === 0 ||
            !validSelection ||
            (locked && !resumeIncompleteMonitoring)
          }
          title={
            locked && !resumeIncompleteMonitoring
              ? "监控已开始，本次监控范围不可修改"
              : resumeIncompleteMonitoring
                ? "继续恢复尚未启动的监控问题"
                : selectedCount === 0
                  ? "请先选择至少一个监控平台"
                  : "确认范围并获取监控答案"
          }
        >
          {resumeIncompleteMonitoring
            ? "继续启动剩余问题"
            : locked
              ? "监控已开始"
              : "获取监控答案"}
        </button>
      </footer>
    </div>
  );
}

type CurrentAssessmentProps = {
  project: GeoProject;
  onContact: () => void;
  onRetryAssessment?: () => void | Promise<void>;
  retryingAssessment?: boolean;
  onRetryIndustryAssessment?: () => void | Promise<void>;
  retryingIndustryAssessment?: boolean;
  onRetryForecast?: () => void | Promise<void>;
  retryingForecast?: boolean;
  onRetryIndustryForecast?: () => void | Promise<void>;
  retryingIndustryForecast?: boolean;
  onStartService?: () => void;
};

type MonitoringResultsProps = {
  project: GeoProject;
  onRefresh: () => Promise<void>;
  refreshing: boolean;
  lastRefreshedAt?: string;
  onContact: () => void;
};

type MonitoringPerspective = "product_opinion" | "industry_ranking";

type AssessmentSectionId = "current" | "semantic" | "knowledge" | "forecast";

type AssessmentSectionStatus = {
  label:
    | "已生成"
    | "生成中"
    | "采集中"
    | "待生成"
    | "等待现状评估通过"
    | "部分结果可用"
    | "需重新评估";
  tone: "ready" | "loading" | "pending" | "attention";
};

function monitoringAssessmentCoverage(monitoring?: GeoProject["monitoring"]) {
  const successfulByPlatform = new Map<GeoPlatformId, number>(
    (monitoring?.platforms || []).map((platform) => [platform, 0]),
  );
  for (const answer of monitoring?.answers || []) {
    if (
      answer.status !== "completed" ||
      !answer.answer.trim() ||
      answer.error
    ) {
      continue;
    }
    successfulByPlatform.set(
      answer.platformId,
      (successfulByPlatform.get(answer.platformId) || 0) + 1,
    );
  }
  const successfulResponses = Array.from(successfulByPlatform.values()).reduce(
    (total, count) => total + count,
    0,
  );
  const fullSample =
    monitoring?.status === "completed" &&
    successfulByPlatform.size > 0 &&
    Array.from(successfulByPlatform.values()).every((count) => count === 5);
  const terminalPartialEligible =
    monitoring?.status === "partial_review" &&
    monitoring.quality?.downstreamEligible === true &&
    successfulByPlatform.size > 0 &&
    Array.from(successfulByPlatform.values()).every((count) => count >= 3);
  return {
    successfulResponses,
    fullSample,
    terminalPartialEligible,
    assessmentEligible: fullSample || terminalPartialEligible,
  };
}

function monitoringRunStatusLabel(
  status?: NonNullable<GeoProject["monitoring"]>["status"],
) {
  if (status === "completed") return "采集完成";
  if (status === "partial_review") return "部分完成";
  if (status === "failed") return "采集失败";
  if (status === "submitted" || status === "capturing") return "采集中";
  return "等待采集";
}

function assessmentRunStatusLabel(
  status?: NonNullable<GeoProject["assessment"]>["status"],
) {
  if (status === "ready") return "评估已生成";
  if (status === "failed") return "评估失败";
  if (status === "queued" || status === "running") return "评估生成中";
  return "等待评估";
}

function assessmentSectionStatus(
  assessment?: GeoProject["assessment"],
): AssessmentSectionStatus {
  if (isCompleteAssessment(assessment)) {
    return { label: "已生成", tone: "ready" };
  }
  if (
    assessment?.status === "ready" &&
    assessment.quality?.completeness === "partial"
  ) {
    return { label: "部分结果可用", tone: "attention" };
  }
  if (assessment?.status === "failed" || assessment?.status === "ready") {
    return { label: "需重新评估", tone: "attention" };
  }
  if (assessment?.status === "queued" || assessment?.status === "running") {
    return { label: "生成中", tone: "loading" };
  }
  return { label: "待生成", tone: "pending" };
}

function forecastSectionStatus(
  forecast?: GeoProject["optimizationForecast"],
  assessment?: GeoProject["assessment"],
): AssessmentSectionStatus {
  if (isCompleteForecast(forecast)) {
    return { label: "已生成", tone: "ready" };
  }
  if (
    forecast?.status === "ready" &&
    forecast.quality?.completeness === "partial"
  ) {
    return { label: "部分结果可用", tone: "attention" };
  }
  if (forecast?.status === "failed" || forecast?.status === "ready") {
    return { label: "需重新评估", tone: "attention" };
  }
  if (forecast?.status === "queued" || forecast?.status === "running") {
    return { label: "生成中", tone: "loading" };
  }
  return isCompleteAssessment(assessment)
    ? { label: "待生成", tone: "pending" }
    : { label: "等待现状评估通过", tone: "pending" };
}

function industryCurrentSectionStatus(
  monitoring?: GeoProject["monitoring"],
): AssessmentSectionStatus {
  const completedAnswers =
    monitoring?.answers.filter(
      (answer) =>
        answer.status === "completed" &&
        answer.answer.trim().length > 0 &&
        !answer.error,
    ).length ?? 0;
  if (completedAnswers > 0) {
    return { label: "已生成", tone: "ready" };
  }
  if (
    monitoring?.status === "failed" ||
    monitoring?.status === "completed" ||
    monitoring?.status === "partial_review"
  ) {
    return { label: "需重新评估", tone: "attention" };
  }
  if (
    monitoring?.status === "submitted" ||
    monitoring?.status === "capturing"
  ) {
    return { label: "采集中", tone: "loading" };
  }
  return { label: "待生成", tone: "pending" };
}

type DualPerspectiveProject = GeoProject & {
  selectedIndustryRankingQuestionId?: string;
  industryRankingMonitoring?: GeoProject["monitoring"];
  industryRankingAssessment?: GeoProject["assessment"];
  industryRankingOptimizationForecast?: GeoProject["optimizationForecast"] & {
    brandMentionRateForecast?: {
      current: number;
      low: number;
      expected: number;
      high: number;
      observedAnswers: number;
    };
  };
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
  onRetryIndustryAssessment,
  retryingIndustryAssessment = false,
  onRetryForecast,
  retryingForecast = false,
  onRetryIndustryForecast,
  retryingIndustryForecast = false,
  onStartService,
}: CurrentAssessmentProps) {
  const productQuestion = project.questions.find(
    (question) => question.id === project.selectedQuestionId,
  );
  const industryQuestion = project.questions.find(
    (question) => question.id === project.selectedIndustryRankingQuestionId,
  );
  const historicalRankingOnly = isHistoricalRankingOnlyProject(project);
  const productPerspective = historicalRankingOnly
    ? undefined
    : {
        kind: "product_opinion" as const,
        question: productQuestion,
        monitoring: project.monitoring,
        assessment: project.assessment,
        forecast: project.optimizationForecast,
      };
  const industryPerspective =
    project.industryRankingMonitoring ||
    project.industryRankingAssessment ||
    historicalRankingOnly
      ? {
          kind: "industry_ranking" as const,
          question: historicalRankingOnly ? productQuestion : industryQuestion,
          monitoring:
            project.industryRankingMonitoring ??
            (historicalRankingOnly ? project.monitoring : undefined),
          assessment:
            project.industryRankingAssessment ??
            (historicalRankingOnly ? project.assessment : undefined),
          forecast:
            project.industryRankingOptimizationForecast ??
            (historicalRankingOnly ? project.optimizationForecast : undefined),
        }
      : undefined;
  const perspectives = [productPerspective, industryPerspective].filter(
    (
      perspective,
    ): perspective is NonNullable<
      typeof productPerspective | typeof industryPerspective
    > => Boolean(perspective),
  );
  const [activePerspective, setActivePerspective] =
    useState<MonitoringPerspective>(perspectives[0]?.kind ?? "product_opinion");
  const [activeSections, setActiveSections] = useState<
    Record<MonitoringPerspective, AssessmentSectionId>
  >({
    product_opinion: "semantic",
    industry_ranking: "current",
  });

  useEffect(() => {
    if (
      perspectives.length > 0 &&
      !perspectives.some((item) => item.kind === activePerspective)
    ) {
      setActivePerspective(perspectives[0].kind);
    }
  }, [activePerspective, perspectives.map((item) => item.kind).join("|")]);

  if (perspectives.length === 0) {
    return (
      <div className="geo-assessment-view">
        <div className="geo-assessment-empty">
          <LockKeyhole size={24} />
          <h2>现状评估尚未解锁</h2>
          <p>两个问题的平台回答开始返回后，将分别建立语义资产基线。</p>
        </div>
      </div>
    );
  }

  const perspective =
    perspectives.find((item) => item.kind === activePerspective) ??
    perspectives[0];
  const isIndustry = perspective.kind === "industry_ranking";
  const assessmentStarted = Boolean(
    perspective.assessment && perspective.assessment.status !== "not_started",
  );
  const assessmentReady = isCompleteAssessment(perspective.assessment);
  const assessmentPartial =
    perspective.assessment?.status === "ready" &&
    perspective.assessment.quality?.completeness === "partial";
  const assessmentFailed = perspective.assessment?.status === "failed";
  const perspectiveProject: GeoProject = {
    ...project,
    selectedQuestionId: perspective.question?.id,
    monitoring: perspective.monitoring,
    assessment: perspective.assessment,
    optimizationForecast: perspective.forecast,
    ...(isIndustry ? { serviceActivation: undefined } : {}),
  };
  const currentRetryingAssessment = isIndustry
    ? retryingIndustryAssessment
    : retryingAssessment;
  const currentRetryingForecast = isIndustry
    ? retryingIndustryForecast
    : retryingForecast;
  const currentRetryAssessment = isIndustry
    ? onRetryIndustryAssessment
    : onRetryAssessment;
  const currentRetryForecast = isIndustry
    ? onRetryIndustryForecast
    : onRetryForecast;
  const preview = isGeoStylePreviewProject(project);
  const currentAssessmentStatus = assessmentSectionStatus(
    perspective.assessment,
  );
  const currentForecastStatus = forecastSectionStatus(
    perspective.forecast,
    perspective.assessment,
  );
  const assessmentSections: Array<{
    id: AssessmentSectionId;
    order: string;
    title: string;
    description: string;
    status: AssessmentSectionStatus;
  }> = isIndustry
    ? [
        {
          id: "current",
          order: "01",
          title: "当前表现",
          description: "查看语义资产总分与品牌提及率。",
          status: industryCurrentSectionStatus(perspective.monitoring),
        },
        {
          id: "semantic",
          order: "02",
          title: "语义资产现状",
          description: "查看五维表现、平台差异与优先动作。",
          status: currentAssessmentStatus,
        },
        {
          id: "forecast",
          order: "03",
          title: "优化后评估",
          description: "查看语义资产与品牌提及率条件目标。",
          status: currentForecastStatus,
        },
      ]
    : [
        {
          id: "semantic",
          order: "01",
          title: "语义资产现状",
          description: "查看总分、五维表现与优先动作。",
          status: currentAssessmentStatus,
        },
        {
          id: "knowledge",
          order: "02",
          title: "舆情与知识库对照",
          description: "核验回答与企业知识事实的一致性。",
          status: currentAssessmentStatus,
        },
        {
          id: "forecast",
          order: "03",
          title: "优化后评估",
          description: "查看五维目标与四周执行路径。",
          status: currentForecastStatus,
        },
      ];
  const activeSection =
    assessmentSections.find(
      (section) => section.id === activeSections[perspective.kind],
    ) ?? assessmentSections[0];
  const perspectiveTabId = `geo-assessment-perspective-tab-${perspective.kind}`;
  const sectionPanelId = `geo-assessment-section-panel-${perspective.kind}`;

  return (
    <div className="geo-assessment-view">
      <header className="geo-assessment-header">
        <div>
          <span className="geo-kb-kicker">
            <BarChart3 size={14} /> 企业 GEO 现状评估
          </span>
          <h2 className="geo-stage-title">按两类问题查看语义资产表现</h2>
          <p>每个问题使用自己的监控回答、评估结果与一个月条件目标。</p>
        </div>
        <div className="geo-assessment-actions">
          <span
            className={
              "geo-assessment-state state-" +
              (currentRetryingAssessment
                ? "running"
                : (perspective.assessment?.status ?? "not_started"))
            }
          >
            <span />
            {assessmentReady
              ? "评估已生成"
              : assessmentPartial
                ? "评估内容部分可用"
                : currentRetryingAssessment
                  ? "正在重新评估"
                  : assessmentFailed
                    ? "评估需支持"
                    : perspective.assessment?.status === "queued" ||
                        perspective.assessment?.status === "running"
                      ? "正在生成评估"
                      : "评估待生成"}
          </span>
          {(assessmentFailed || assessmentPartial) &&
            !preview &&
            currentRetryAssessment && (
              <button
                type="button"
                className="geo-assessment-refresh is-retry"
                onClick={() => void currentRetryAssessment()}
                disabled={currentRetryingAssessment}
                aria-busy={currentRetryingAssessment}
              >
                <RotateCw
                  size={14}
                  className={
                    currentRetryingAssessment ? "is-spinning" : undefined
                  }
                />
                {currentRetryingAssessment ? "正在重新评估" : "重新评估"}
              </button>
            )}
          {(assessmentFailed || assessmentPartial) && !preview && (
            <button
              type="button"
              className="geo-assessment-refresh"
              onClick={onContact}
            >
              联系技术支持
            </button>
          )}
        </div>
      </header>

      <div
        className="geo-assessment-perspective-tabs"
        role="tablist"
        aria-label="现状评估问题视角"
      >
        {perspectives.map((item) => {
          const active = item.kind === perspective.kind;
          const completed =
            item.monitoring?.answers.filter(
              (answer) =>
                answer.status === "completed" &&
                answer.answer.trim().length > 0 &&
                !answer.error,
            ).length ?? 0;
          return (
            <button
              key={item.kind}
              id={`geo-assessment-perspective-tab-${item.kind}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="geo-assessment-perspective-panel"
              className={active ? "is-active" : ""}
              onClick={() => setActivePerspective(item.kind)}
            >
              <span>
                {item.kind === "product_opinion"
                  ? "产品与舆情"
                  : "行业排名与品牌优胜"}
              </span>
              <strong>{item.question?.question || "当前评估问题"}</strong>
              <small>
                <span>
                  {item.kind === "industry_ranking"
                    ? "根据企业实际情况定制"
                    : GEO_QUESTION_CATEGORIES.find(
                        (category) => category.id === item.question?.category,
                      )?.title || "产品与舆情"}
                  {" · "}
                  {monitoringRunStatusLabel(item.monitoring?.status)}
                  {" · "}
                  {assessmentRunStatusLabel(item.assessment?.status)}
                </span>
                <em>{completed} 条有效回答</em>
              </small>
            </button>
          );
        })}
      </div>

      <div
        id="geo-assessment-perspective-panel"
        className="geo-assessment-perspective-content"
        role="tabpanel"
        aria-labelledby={perspectiveTabId}
        aria-label={isIndustry ? "行业排名与品牌优胜评估" : "产品与舆情评估"}
      >
        <div
          className="geo-assessment-section-tabs"
          role="tablist"
          aria-label={`${isIndustry ? "行业排名与品牌优胜" : "产品与舆情"}评估内容`}
        >
          {assessmentSections.map((section) => {
            const active = section.id === activeSection.id;
            return (
              <button
                key={section.id}
                id={`geo-assessment-section-tab-${perspective.kind}-${section.id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={sectionPanelId}
                aria-label={`${section.title}，${section.description}${section.status.label}`}
                className={active ? "active" : ""}
                onClick={() =>
                  setActiveSections((current) => ({
                    ...current,
                    [perspective.kind]: section.id,
                  }))
                }
              >
                <span className="geo-assessment-section-tab-heading">
                  <em>{section.order}</em>
                  <strong>{section.title}</strong>
                </span>
                <small className="geo-assessment-section-tab-description">
                  {section.description}
                </small>
                <span
                  className={`geo-assessment-section-tab-status is-${section.status.tone}`}
                >
                  {section.status.label}
                </span>
              </button>
            );
          })}
        </div>

        <div
          id={sectionPanelId}
          className="geo-assessment-section-panel"
          role="tabpanel"
          aria-labelledby={`geo-assessment-section-tab-${perspective.kind}-${activeSection.id}`}
        >
          {perspective.monitoring?.status !== "completed" &&
          !assessmentStarted ? (
            <div className="geo-assessment-empty">
              <Clock3 size={24} />
              <h2>当前视角的评估正在准备</h2>
              <p>对应问题采集完成后，将在这里生成语义资产现状与优化目标。</p>
            </div>
          ) : activeSection.id === "current" && isIndustry ? (
            <IndustryCurrentPerformance
              monitoring={perspective.monitoring}
              assessment={perspective.assessment}
            />
          ) : activeSection.id === "semantic" ? (
            <section className="geo-assessment-perspective-section">
              <header>
                <span>{isIndustry ? "02" : "01"}</span>
                <div>
                  <h3>语义资产现状</h3>
                  <p>查看本问题的总分、五维表现、平台差异与优先动作。</p>
                </div>
              </header>
              <AssessmentOverview
                project={perspectiveProject}
                assessmentReady={assessmentReady}
                hideScoreHero={isIndustry}
              />
            </section>
          ) : activeSection.id === "knowledge" && !isIndustry ? (
            <section className="geo-assessment-perspective-section">
              <header>
                <span>02</span>
                <div>
                  <h3>舆情与知识库对照</h3>
                  <p>
                    以企业知识库事实核验产品与舆情回答，不混入行业排名样本。
                  </p>
                </div>
              </header>
              <KnowledgeComparison project={perspectiveProject} />
            </section>
          ) : activeSection.id === "forecast" ? (
            <>
              <section className="geo-assessment-perspective-section">
                <header>
                  <span>03</span>
                  <div>
                    <h3>优化后评估</h3>
                    <p>
                      {isIndustry
                        ? "同时查看语义资产目标和品牌提及率的一个月条件目标。"
                        : "查看语义资产分数、五维目标与四周执行路径。"}
                    </p>
                  </div>
                </header>
                <OptimizationForecastView
                  project={perspectiveProject}
                  onContact={onContact}
                  onRetryForecast={currentRetryForecast}
                  retryingForecast={currentRetryingForecast}
                />
                {isIndustry && (
                  <IndustryBrandMentionForecast
                    forecast={perspective.forecast}
                  />
                )}
              </section>

              {isIndustry ? (
                <section className="geo-industry-custom-service">
                  <div>
                    <span>行业排名与品牌优胜</span>
                    <h3>查看全域协同服务演示</h3>
                    <p>
                      了解目标行业、竞争格局和品牌资产如何形成专项执行路径。
                    </p>
                  </div>
                </section>
              ) : (
                assessmentReady &&
                isCompleteForecast(perspective.forecast) &&
                onStartService && (
                  <section className="geo-assessment-next-step">
                    <div>
                      <span>下一步 · 服务演示</span>
                      <p>
                        围绕产品与舆情问题查看内容建设、权威信源、平台监控与结果复测的演示路径。
                      </p>
                    </div>
                    <button
                      type="button"
                      className="geo-primary-button"
                      onClick={onStartService}
                    >
                      进入服务演示
                      <ArrowRight size={17} />
                    </button>
                  </section>
                )
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AssessmentRateRing({
  value,
  label,
  detail,
  tone = "#3d1560",
}: {
  value?: number;
  label: string;
  detail: string;
  tone?: string;
}) {
  const percentage =
    value === undefined
      ? undefined
      : Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <article
      className={`geo-assessment-rate-card ${
        percentage === undefined
          ? "is-empty"
          : percentage === 0
            ? "is-zero"
            : "has-value"
      }`}
    >
      <div
        className="geo-assessment-rate-ring"
        style={{
          background:
            percentage === undefined
              ? "#ebe6ed"
              : "conic-gradient(" +
                tone +
                " " +
                percentage * 3.6 +
                "deg, #e9e4ec 0deg)",
        }}
        aria-label={
          percentage === undefined
            ? label + "暂无数据"
            : label + percentage + "%"
        }
      >
        <span>
          <strong>{percentage === undefined ? "—" : percentage + "%"}</strong>
          <small>{label}</small>
        </span>
      </div>
      <p>{detail}</p>
    </article>
  );
}

function IndustryCurrentPerformance({
  monitoring,
  assessment,
}: {
  monitoring?: GeoProject["monitoring"];
  assessment?: GeoProject["assessment"];
}) {
  const insights = useMemo(
    () => buildMonitoringInsights(monitoring?.answers ?? []),
    [monitoring?.answers],
  );
  const score =
    assessment?.status === "ready" && assessment.totalScore !== undefined
      ? assessment.totalScore / 100
      : undefined;
  const mentionRate =
    insights.brand.mentionCoverage > 0
      ? insights.brand.mentionRate / 100
      : undefined;
  const platformRows = (monitoring?.platforms ?? []).map((platformId) => {
    const platformInsights = buildMonitoringInsights(
      monitoring?.answers.filter(
        (answer) => answer.platformId === platformId,
      ) ?? [],
    );
    return {
      platformId,
      rate:
        platformInsights.brand.mentionCoverage > 0
          ? platformInsights.brand.mentionRate
          : undefined,
      coverage: platformInsights.brand.mentionCoverage,
    };
  });

  return (
    <section className="geo-industry-current-performance">
      <header>
        <span>当前表现</span>
        <h3>语义资产与品牌提及率</h3>
        <p>品牌指标仅使用行业排名问题中真实返回相应字段的回答。</p>
      </header>
      <div className="geo-industry-current-rings">
        <AssessmentRateRing
          value={score}
          label="语义资产总分"
          detail={
            score === undefined
              ? "语义资产评估尚未返回完整总分"
              : "行业排名问题自己的五维语义资产评分"
          }
        />
        <AssessmentRateRing
          value={mentionRate}
          label="品牌提及率"
          tone="#9a7028"
          detail={
            mentionRate === undefined
              ? "暂无具有本品提及字段的有效回答"
              : insights.brand.mentionedCount +
                "/" +
                insights.brand.mentionCoverage +
                " 条回答提及本品"
          }
        />
      </div>
      {(insights.brand.mentionCoverage > 0 ||
        insights.brand.averagePosition !== undefined) && (
        <div className="geo-industry-brand-detail">
          <div>
            <small>平均提及位置</small>
            <strong>
              {insights.brand.averagePosition === undefined
                ? "暂无数据"
                : "第 " + insights.brand.averagePosition + " 个"}
            </strong>
          </div>
          <div>
            <small>最佳提及位置</small>
            <strong>
              {insights.brand.bestPosition === undefined
                ? "暂无数据"
                : "第 " + insights.brand.bestPosition + " 个"}
            </strong>
          </div>
          {platformRows.map((row) => {
            const platform = GEO_PLATFORMS.find(
              (item) => item.id === row.platformId,
            );
            return (
              <div key={row.platformId}>
                <small>{platform?.name ?? row.platformId}提及率</small>
                <strong>
                  {row.rate === undefined
                    ? "暂无数据"
                    : row.rate + "% · " + row.coverage + " 条"}
                </strong>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function IndustryBrandMentionForecast({
  forecast,
}: {
  forecast?: GeoProject["industryRankingOptimizationForecast"];
}) {
  const brandForecast = forecast?.brandMentionRateForecast;
  if (!brandForecast) return null;
  return (
    <section className="geo-industry-mention-forecast">
      <header>
        <span>品牌提及率条件目标</span>
        <h3>当前与一个月预期对比</h3>
      </header>
      <div className="geo-industry-current-rings">
        <AssessmentRateRing
          value={brandForecast.current}
          label="当前提及率"
          detail={"基于 " + brandForecast.observedAnswers + " 条有值回答"}
          tone="#77667d"
        />
        <AssessmentRateRing
          value={brandForecast.expected}
          label="预期提及率"
          detail={
            "条件目标区间 " +
            Math.round(brandForecast.low * 100) +
            "%–" +
            Math.round(brandForecast.high * 100) +
            "%"
          }
          tone="#9a7028"
        />
      </div>
      <p>
        这是一个月执行条件下的目标区间，不代表效果保证；需用相同问题、平台和每平台
        5 次回答进行复测。
      </p>
    </section>
  );
}

export function MonitoringResults({
  project,
  onRefresh,
  refreshing,
  lastRefreshedAt,
  onContact,
}: MonitoringResultsProps) {
  const dualProject = project as DualPerspectiveProject;
  const historicalRankingOnly = isHistoricalRankingOnlyProject(project);
  const productMonitoring = historicalRankingOnly
    ? undefined
    : project.monitoring;
  const industryMonitoring =
    dualProject.industryRankingMonitoring ??
    (historicalRankingOnly ? project.monitoring : undefined);
  const availablePerspectives = [
    productMonitoring?.runId ? "product_opinion" : undefined,
    industryMonitoring?.runId ? "industry_ranking" : undefined,
  ].filter((value): value is MonitoringPerspective => Boolean(value));
  const [activePerspective, setActivePerspective] =
    useState<MonitoringPerspective>(
      availablePerspectives[0] ?? "product_opinion",
    );

  useEffect(() => {
    if (
      availablePerspectives.length > 0 &&
      !availablePerspectives.includes(activePerspective)
    ) {
      setActivePerspective(availablePerspectives[0]);
    }
  }, [activePerspective, availablePerspectives.join("|")]);

  if (availablePerspectives.length === 0) return null;

  const perspectives = availablePerspectives.map((kind) => {
    const monitoring =
      kind === "industry_ranking" ? industryMonitoring! : productMonitoring!;
    const questionId =
      kind === "industry_ranking"
        ? historicalRankingOnly
          ? project.selectedQuestionId
          : dualProject.selectedIndustryRankingQuestionId
        : project.selectedQuestionId;
    const question = project.questions.find((item) => item.id === questionId);
    const finished =
      monitoringAssessmentCoverage(monitoring).successfulResponses;
    const expected = Math.max(
      monitoring.expectedRecords,
      (monitoring.platforms.length || project.selectedPlatformIds.length) * 5,
    );
    return { kind, monitoring, questionId, question, finished, expected };
  });
  const active =
    perspectives.find((item) => item.kind === activePerspective) ??
    perspectives[0];

  return (
    <div className="geo-monitor-perspectives">
      <div
        className="geo-monitor-perspective-tabs"
        role="tablist"
        aria-label="监控问题视角"
      >
        {perspectives.map((item) => (
          <button
            key={item.kind}
            type="button"
            role="tab"
            aria-selected={active.kind === item.kind}
            aria-controls={`geo-monitor-perspective-${item.kind}`}
            className={active.kind === item.kind ? "is-active" : ""}
            onClick={() => setActivePerspective(item.kind)}
          >
            <span>
              {item.kind === "product_opinion"
                ? "产品与舆情"
                : "行业排名与品牌优胜"}
            </span>
            <strong>{item.question?.question || "当前监控问题"}</strong>
            <small>
              <span>
                {item.kind === "industry_ranking"
                  ? "行业排名"
                  : GEO_QUESTION_CATEGORIES.find(
                      (category) => category.id === item.question?.category,
                    )?.title || "产品与舆情"}
                {" · "}
                {monitoringRunStatusLabel(item.monitoring.status)}
              </span>
              <em>
                {item.finished}/{item.expected} 条
              </em>
            </small>
          </button>
        ))}
      </div>
      <div
        id={`geo-monitor-perspective-${active.kind}`}
        role="tabpanel"
        aria-label={
          active.kind === "product_opinion"
            ? "产品与舆情监控答案"
            : "行业排名与品牌优胜监控答案"
        }
      >
        <MonitoringPerspectiveResults
          project={project}
          monitoring={active.monitoring}
          selectedQuestionId={active.questionId}
          perspective={active.kind}
          onRefresh={onRefresh}
          refreshing={refreshing}
          lastRefreshedAt={lastRefreshedAt}
          onContact={onContact}
        />
      </div>
    </div>
  );
}

function MonitoringPerspectiveResults({
  project,
  monitoring,
  selectedQuestionId,
  perspective,
  onRefresh,
  refreshing,
  lastRefreshedAt,
  onContact,
}: MonitoringResultsProps & {
  monitoring: NonNullable<GeoProject["monitoring"]>;
  selectedQuestionId?: string;
  perspective: MonitoringPerspective;
}) {
  const preview = isGeoStylePreviewProject(project);
  const selectedQuestion = project.questions.find(
    (question) => question.id === selectedQuestionId,
  );
  const platformIds =
    monitoring.platforms.length > 0
      ? monitoring.platforms
      : project.selectedPlatformIds;
  const expectedRecords = Math.max(
    monitoring.expectedRecords,
    platformIds.length * 5,
  );
  const monitoringCoverage = monitoringAssessmentCoverage(monitoring);
  const completedAnswerCount = monitoringCoverage.successfulResponses;
  const remainingAnswerCount = Math.max(
    0,
    expectedRecords - completedAnswerCount,
  );
  const progress =
    expectedRecords > 0
      ? Math.min(
          100,
          Math.round((completedAnswerCount / expectedRecords) * 100),
        )
      : 0;
  const answersAvailable = monitoring.answers.length > 0;
  const monitoringFailed = monitoring.status === "failed";
  const partialReview = monitoring.status === "partial_review";
  const partialAssessmentEligible =
    partialReview && monitoringCoverage.assessmentEligible;
  const monitoringCompleted = monitoring.status === "completed";
  const recoveringSamples =
    !monitoringCompleted &&
    !partialReview &&
    !monitoringFailed &&
    monitoring.failedRecords > 0;
  const autoRefreshActive = !preview && shouldAutoRefreshGeoProject(project);
  const autoRefreshDelay = geoAutoRefreshDelayLabel(project);
  const selectedQuestionCategory = selectedQuestion
    ? GEO_QUESTION_CATEGORIES.find(
        (category) => category.id === selectedQuestion.category,
      )?.title
    : undefined;
  const monitoringRegion = monitoring.region ?? project.monitoringRegion;
  const monitoringScreenshotEnabled =
    monitoring.screenshotEnabled ??
    project.monitoringScreenshotEnabled ??
    false;
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
                ? partialAssessmentEligible
                  ? "平台回答已按实际样本完成评估准备"
                  : "平台回答有效样本不足"
                : monitoringFailed
                  ? "平台回答采集异常"
                  : recoveringSamples
                    ? "平台回答正在自动补齐采样"
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
                  ? partialAssessmentEligible
                    ? "部分样本可评估"
                    : "有效样本不足"
                  : recoveringSamples
                    ? "自动补采中"
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
            ) : partialAssessmentEligible ? (
              "补采已结束，现状评估将基于实际样本生成"
            ) : partialReview ? (
              "补采已结束，当前有效样本不足"
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
          <div className="geo-monitor-query-scope">
            <span>
              <MapPin size={12} />
              {monitoringRegion?.label || "默认随机地点"}
            </span>
            <span>
              <ImageIcon size={12} />
              页面截图{monitoringScreenshotEnabled ? "已开启" : "未开启"}
            </span>
          </div>
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
              {completedAnswerCount} / {expectedRecords} 条有效回答
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
              : partialAssessmentEligible
                ? `补采结束 · 基于 ${completedAnswerCount}/${expectedRecords} 条实际样本继续评估`
                : "每次回答均按平台与采集轮次独立留档"}
          </span>
        </div>
      </section>

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
            <strong>
              {partialAssessmentEligible
                ? "补采结束，已基于实际样本继续评估"
                : "本次有效样本不足，无法生成可靠评估"}
            </strong>
            <p>
              {partialAssessmentEligible
                ? `本次共获得 ${completedAnswerCount}/${expectedRecords} 条有效回答，现状评估会保留实际样本覆盖度。`
                : `本次仅获得 ${completedAnswerCount}/${expectedRecords} 条有效回答；每个平台至少需要 3 条有效回答。`}
            </p>
            {!partialAssessmentEligible && (
              <button
                type="button"
                className="geo-secondary-button"
                onClick={onContact}
              >
                联系技术支持
              </button>
            )}
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
            {completedAnswerCount} 条有效回答
            {recoveringSamples
              ? ` · ${remainingAnswerCount} 条正在自动补齐`
              : monitoring.failedRecords > 0
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
          screenshotEnabled={monitoringScreenshotEnabled}
          perspective={perspective}
        />
      )}
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
  hideScoreHero = false,
}: {
  project: GeoProject;
  assessmentReady: boolean;
  hideScoreHero?: boolean;
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
  if (
    assessment?.status === "ready" &&
    assessment.quality?.completeness === "partial"
  ) {
    return (
      <div className="geo-assessment-overview">
        <section className="geo-assessment-alert warning" role="status">
          <CircleAlert size={17} />
          <div>
            <strong>已展示通过校验的评估内容</strong>
            <p>
              {assessment.executiveSummary ||
                assessment.summary ||
                "本次结果未通过完整评分校验，因此不计算总分、等级，也不会启动预测或解锁服务演示。"}
            </p>
          </div>
        </section>

        {assessment.dimensions.length > 0 && (
          <section className="geo-dimension-panel">
            <header>
              <h3>已验证的维度观察</h3>
              <small>聚合分值暂不可用</small>
            </header>
            <div className="geo-dimension-list">
              {assessment.dimensions.map((dimension, index) => (
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
                      <span>—</span>
                    </div>
                    <small>
                      {customerFacingText(
                        dimension.currentFinding || dimension.summary,
                        CUSTOMER_DIMENSION_COPY[dimension.id].finding,
                      )}
                    </small>
                    {dimension.nextAction && (
                      <p>
                        {customerFacingText(
                          dimension.nextAction,
                          CUSTOMER_DIMENSION_COPY[dimension.id].action,
                        )}
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <AssessmentSupportingResults assessment={assessment} />
        {(assessment.limitations?.length ?? 0) > 0 && (
          <aside className="geo-assessment-scope-note">
            {assessment.limitations!.join("；")}
          </aside>
        )}
      </div>
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
      {!hideScoreHero && (
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
      )}

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
  if (
    dimensions.length === 0 ||
    dimensions.some(
      (dimension) =>
        dimension.score === undefined || dimension.maxScore === undefined,
    )
  ) {
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
            Math.min(100, (dimension.score! / dimension.maxScore!) * 100),
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
                    {dimension.score!} / {dimension.maxScore!}
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

function formatAssessmentRate(value: number | null | undefined) {
  return value === undefined
    ? "—"
    : value === null
      ? "不适用"
      : `${Math.round(value * 1000) / 10}%`;
}

const INTERNAL_CUSTOMER_TERM_PATTERN =
  /\b(?:unavailable|unknown|question_baseline(?:_v2)?|citationList|referenceList|evidenceRefs|calculationBasis|measurementStatus|sourceCount|rationale|observed_outcome|direct_asset|not_applicable|schemaVersion|(?:raw-)?output-schema(?:\.json)?)\b|\b(?:[a-z][a-z0-9_-]*\/)?run[-_ ]?[0-9]+\b|来源线索|答案引用|检索参考/i;

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
  if (
    !normalized ||
    normalized.toLowerCase() === "schema" ||
    INTERNAL_CUSTOMER_TERM_PATTERN.test(normalized)
  ) {
    return fallback;
  }
  return normalized;
}

function optionalCustomerFacingText(value: string | undefined) {
  const normalized = value?.trim();
  return normalized &&
    normalized.toLowerCase() !== "schema" &&
    !INTERNAL_CUSTOMER_TERM_PATTERN.test(normalized)
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
              const legacySourceCounts = [
                sourceData.citationCount,
                sourceData.referenceCount,
              ].filter((count): count is number => count !== undefined);
              const sourceCount =
                sourceData.sourceCount ??
                (legacySourceCounts.length
                  ? Math.max(...legacySourceCounts)
                  : undefined);
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
                      <dt>事实准确率</dt>
                      <dd>{formatAssessmentRate(item.factAccuracy)}</dd>
                    </div>
                    <div>
                      <dt>主张命中率</dt>
                      <dd>{formatAssessmentRate(item.propositionHitRate)}</dd>
                    </div>
                    <div>
                      <dt>可追溯来源</dt>
                      <dd>{sourceCount ?? "—"}</dd>
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
  onRetryForecast,
  retryingForecast = false,
}: {
  project: GeoProject;
  onContact: () => void;
  onRetryForecast?: () => void | Promise<void>;
  retryingForecast?: boolean;
}) {
  const forecast = project.optimizationForecast;
  const horizonWeeks = forecast?.horizonWeeks ?? 4;
  const horizonLabel = horizonWeeks === 4 ? "一个月" : `${horizonWeeks} 周`;
  const forecastGenerating =
    forecast?.status === "queued" || forecast?.status === "running";
  const forecastNeedsRetry =
    forecast?.status === "failed" || forecast?.status === "ready";
  const assessmentComplete = isCompleteAssessment(project.assessment);

  if (
    forecast?.status === "ready" &&
    forecast.quality?.completeness === "partial"
  ) {
    return (
      <div className="geo-forecast-view">
        <section className="geo-assessment-alert warning" role="status">
          <CircleAlert size={17} />
          <div>
            <strong>已展示通过校验的优化路线内容</strong>
            <p>
              {forecast.executiveSummary ||
                forecast.summary ||
                "本次结果未通过完整预测校验，因此不展示整体目标区间，也不会解锁服务演示。"}
            </p>
          </div>
        </section>

        {forecast.dimensions.length > 0 && (
          <section className="geo-forecast-dimensions">
            <header>
              <div>
                <span>已验证的维度建议</span>
                <h3>目标分值暂不可用，先展示可执行方向</h3>
              </div>
            </header>
            <div className="geo-forecast-dimension-grid">
              {forecast.dimensions.map((dimension, index) => (
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
                          dimension.currentFinding || dimension.summary,
                          CUSTOMER_DIMENSION_COPY[dimension.id].finding,
                        )}
                      </small>
                    </div>
                  </div>
                  <p className="geo-forecast-next-action">
                    <Check size={13} />
                    <span>
                      {customerFacingText(
                        dimension.nextAction,
                        CUSTOMER_DIMENSION_COPY[dimension.id].action,
                      )}
                    </span>
                  </p>
                </article>
              ))}
            </div>
          </section>
        )}

        {forecast.roadmap.length > 0 && (
          <section className="geo-forecast-roadmap">
            <header>
              <span>已验证的分阶段路线</span>
              <h3>{horizonLabel}优化推进片段</h3>
            </header>
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
          </section>
        )}

        {(forecast.limitations?.length ?? 0) > 0 && (
          <aside className="geo-assessment-scope-note">
            {forecast.limitations!.join("；")}
          </aside>
        )}
      </div>
    );
  }

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
            {forecastGenerating
              ? "正在生成优化效果评估"
              : forecastNeedsRetry
                ? "优化后效果评估需重新评估"
                : assessmentComplete
                  ? "准备优化效果评估"
                  : "等待现状评估通过"}
          </strong>
          <p>
            {forecastGenerating
              ? "正在生成优化效果评估；完成后会自动显示，无需手动刷新。"
              : forecastNeedsRetry
                ? forecast?.error || "本次结果未通过完整性校验，可重新评估。"
                : assessmentComplete
                  ? "现状评估已通过，服务端会在状态同步时幂等启动优化效果评估。"
                  : "现状评估完整通过后，系统才会开始生成优化效果评估。"}
          </p>
          {forecast?.failureCode && (
            <small>支持码：{forecast.failureCode}</small>
          )}
          {forecastNeedsRetry && !isGeoStylePreviewProject(project) && (
            <div className="geo-forecast-pending-actions">
              {onRetryForecast &&
                project.optimizationForecastRetryAvailable !== false && (
                  <button
                    type="button"
                    className="geo-assessment-refresh is-retry"
                    onClick={() => void onRetryForecast()}
                    disabled={retryingForecast}
                    aria-busy={retryingForecast}
                  >
                    <RotateCw
                      size={14}
                      className={retryingForecast ? "is-spinning" : undefined}
                    />
                    {retryingForecast ? "正在重新评估" : "重新评估"}
                  </button>
                )}
              <button
                type="button"
                className="geo-assessment-refresh geo-evaluation-support"
                onClick={onContact}
              >
                联系技术支持
              </button>
            </div>
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

type ServiceActivationProps = {
  project: GeoProject;
  onBack: () => void;
};

export function ServiceActivation({ project, onBack }: ServiceActivationProps) {
  const [pathView, setPathView] = useState<"services" | "dashboard">(
    "dashboard",
  );
  const historicalActive = project.serviceActivation?.status === "active";
  const question =
    project.questions.find((item) => item.id === project.selectedQuestionId) ??
    project.questions.find((item) => item.category !== "industry_ranking");
  const categoryLabel =
    GEO_QUESTION_CATEGORIES.find((item) => item.id === question?.category)
      ?.title ?? "GEO 优化";

  if (!question) {
    return (
      <div className="geo-service-activation">
        <div className="geo-assessment-empty">
          <Sparkles size={24} />
          <h2>服务演示正在准备</h2>
          <p>选择产品侧问题后，即可查看服务工作台与执行范围演示。</p>
          <button type="button" onClick={onBack}>
            返回现状评估
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="geo-service-activation">
      <section className="geo-service-path is-demo">
        <div
          className="geo-service-path-tabs"
          role="tablist"
          aria-label="服务演示内容"
        >
          <button
            id="geo-service-demo-tab-dashboard"
            type="button"
            role="tab"
            aria-selected={pathView === "dashboard"}
            aria-controls="geo-service-demo-dashboard"
            tabIndex={pathView === "dashboard" ? 0 : -1}
            className={pathView === "dashboard" ? "is-active" : ""}
            onClick={() => setPathView("dashboard")}
          >
            <Users size={17} />
            <span>
              <strong>工作台演示</strong>
              <small>
                {historicalActive ? "查看历史只读数据" : "查看只读样例数据"}
              </small>
            </span>
          </button>
          <button
            id="geo-service-demo-tab-services"
            type="button"
            role="tab"
            aria-selected={pathView === "services"}
            aria-controls="geo-service-demo-map"
            tabIndex={pathView === "services" ? 0 : -1}
            className={pathView === "services" ? "is-active" : ""}
            onClick={() => setPathView("services")}
          >
            <Layers3 size={17} />
            <span>
              <strong>服务范围</strong>
              <small>查看执行与交付路径</small>
            </span>
          </button>
        </div>

        {pathView === "dashboard" ? (
          <div
            className="geo-agent-dashboard-frame is-standalone-sample"
            id="geo-service-demo-dashboard"
            role="tabpanel"
            aria-labelledby="geo-service-demo-tab-dashboard"
            tabIndex={0}
          >
            <GeoAgentUserDashboard
              project={project}
              question={question}
              categoryLabel={categoryLabel}
              active={historicalActive}
              sampleMode={historicalActive ? undefined : "luxury"}
            />
          </div>
        ) : (
          <div
            className="geo-service-map-scroll"
            id="geo-service-demo-map"
            role="tabpanel"
            aria-labelledby="geo-service-demo-tab-services"
            tabIndex={0}
          >
            <div
              className="geo-service-map"
              aria-label="FrontMind 服务范围演示路线图"
            >
              <aside className="geo-service-map-origin">
                <span aria-hidden="true">
                  <FolderKanban size={22} />
                </span>
                <small>演示起点</small>
                <strong>{categoryLabel}</strong>
                <p>围绕已选问题展示服务路径</p>
                <em>不触发真实交付</em>
              </aside>
              <span className="geo-service-map-entry" aria-hidden="true">
                <i />
                <ArrowRight size={15} />
              </span>
              {GEO_SERVICE_STAGES.map((stage, stageIndex) => (
                <div className="geo-service-stage-unit" key={stage.id}>
                  <article className={`geo-service-stage tone-${stage.tone}`}>
                    <header className="geo-service-stage-header">
                      <div>
                        <span>
                          {String(stageIndex + 1).padStart(2, "0")} /{" "}
                          {stage.line}
                        </span>
                        <small>
                          {stageIndex === 0 ? "演示起点" : "按需衔接"}
                        </small>
                      </div>
                      <h4>{stage.title}</h4>
                      <p>{stage.summary}</p>
                    </header>
                    <div className="geo-service-branches">
                      {stage.services.map((service) => {
                        const Icon = service.icon;
                        return (
                          <section
                            className="geo-service-branch"
                            key={service.id}
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
                              </div>
                              <p>{service.description}</p>
                              <ol>
                                {service.actions.map((action, actionIndex) => (
                                  <li key={action}>
                                    <span>{actionIndex + 1}</span>
                                    {action}
                                  </li>
                                ))}
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
                    <span className="geo-service-stage-gate" aria-hidden="true">
                      <small>阶段验收</small>
                      <ArrowRight size={15} />
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function MonitoringAnswerList({
  platformIds,
  answers,
  screenshotEnabled,
  perspective,
}: {
  platformIds: GeoPlatformId[];
  answers: GeoMonitoringAnswer[];
  screenshotEnabled: boolean;
  perspective: MonitoringPerspective;
}) {
  const [activeRuns, setActiveRuns] = useState<Record<string, number>>({});
  const [activePlatforms, setActivePlatforms] = useState<
    Partial<Record<MonitoringPerspective, GeoPlatformId>>
  >({});
  const activePlatformId = platformIds.includes(
    activePlatforms[perspective] as GeoPlatformId,
  )
    ? (activePlatforms[perspective] as GeoPlatformId)
    : platformIds[0];

  if (!activePlatformId) return null;

  return (
    <div className="geo-answer-platforms">
      {[activePlatformId].map((platformId) => {
        const platform = GEO_PLATFORMS.find((item) => item.id === platformId);
        const platformAnswers = answers
          .filter((answer) => answer.platformId === platformId)
          .sort((left, right) => left.runIndex - right.runIndex);
        const activeRunKey = `${perspective}:${platformId}`;
        const activeRun = activeRuns[activeRunKey] ?? 1;
        const activeAnswer = platformAnswers.find(
          (answer) => answer.runIndex === activeRun,
        );
        const platformName = platform?.name ?? platformId;
        return (
          <section key={platformId}>
            <header className="geo-answer-platform-header">
              <label className="geo-answer-platform-selector">
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
                    name={platformName}
                  />
                </span>
                <span className="geo-answer-platform-select-copy">
                  <small>回答平台</small>
                  <select
                    aria-label="选择回答平台"
                    value={activePlatformId}
                    onChange={(event) =>
                      setActivePlatforms((current) => ({
                        ...current,
                        [perspective]: event.target.value as GeoPlatformId,
                      }))
                    }
                  >
                    {platformIds.map((candidateId) => {
                      const candidate = GEO_PLATFORMS.find(
                        (item) => item.id === candidateId,
                      );
                      const candidateCompleted = answers.filter(
                        (answer) =>
                          answer.platformId === candidateId &&
                          answer.status === "completed" &&
                          answer.answer.trim().length > 0 &&
                          !answer.error,
                      ).length;
                      return (
                        <option key={candidateId} value={candidateId}>
                          {candidate?.name ?? candidateId} ·{" "}
                          {candidateCompleted}
                          /5 条有效回答
                        </option>
                      );
                    })}
                  </select>
                </span>
              </label>
              <div
                className="geo-answer-slot-switcher"
                aria-label={`${platformName}回答轮次`}
              >
                <button
                  type="button"
                  aria-label={`查看${platformName}上一次回答`}
                  disabled={activeRun === 1}
                  onClick={() =>
                    setActiveRuns((current) => ({
                      ...current,
                      [activeRunKey]: Math.max(1, activeRun - 1),
                    }))
                  }
                >
                  <ChevronLeft size={18} />
                </button>
                <strong aria-live="polite">第 {activeRun} / 5 次</strong>
                <button
                  type="button"
                  aria-label={`查看${platformName}下一次回答`}
                  disabled={activeRun === 5}
                  onClick={() =>
                    setActiveRuns((current) => ({
                      ...current,
                      [activeRunKey]: Math.min(5, activeRun + 1),
                    }))
                  }
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </header>
            {perspective === "industry_ranking" && (
              <RankingBrandPerformance answers={platformAnswers} />
            )}
            <div className="geo-answer-current" data-active-run={activeRun}>
              {activeAnswer?.status === "completed" && activeAnswer.answer ? (
                <>
                  <header className="geo-answer-round-meta">
                    <span className="state-completed">回答已采集</span>
                    <small>
                      {activeAnswer.citations.length} 条正文引用 ·{" "}
                      {activeAnswer.references.length ||
                        activeAnswer.sources.length}{" "}
                      条参考来源
                    </small>
                    {activeAnswer.capturedAt && (
                      <time dateTime={activeAnswer.capturedAt}>
                        {formatDate(activeAnswer.capturedAt)}
                      </time>
                    )}
                  </header>
                  <div className="geo-answer-detail-grid">
                    <div className="geo-answer-main-column">
                      <AnswerScreenshotEntry
                        answer={activeAnswer}
                        platformName={platformName}
                        screenshotEnabled={screenshotEnabled}
                      />
                      <MonitoringMarkdown
                        markdown={activeAnswer.answer}
                        citations={activeAnswer.citations}
                      />
                      <AnswerMedia media={activeAnswer.media} />
                    </div>
                    <ReferenceColumn answer={activeAnswer} />
                  </div>
                </>
              ) : (
                <div
                  className={`geo-answer-slot-state state-${activeAnswer?.status ?? "waiting"}`}
                  role={activeAnswer?.error ? "alert" : "status"}
                >
                  <CircleAlert size={19} />
                  <div>
                    <strong>
                      {activeAnswer?.status === "failed" ||
                      activeAnswer?.status === "error"
                        ? "本轮采样未完成"
                        : activeAnswer?.status === "stopped"
                          ? "本轮采样已停止"
                          : activeAnswer?.status === "processing"
                            ? "本轮回答正在采集"
                            : "本轮回答尚未返回"}
                    </strong>
                    <p>
                      {activeAnswer?.error ||
                        "可继续查看其他轮次；本槽位返回后会在此显示正文和来源。"}
                    </p>
                  </div>
                </div>
              )}
            </div>
            <PlatformInsights answers={platformAnswers} />
          </section>
        );
      })}
    </div>
  );
}

function RankingBrandPerformance({
  answers,
}: {
  answers: GeoMonitoringAnswer[];
}) {
  const insights = useMemo(() => buildMonitoringInsights(answers), [answers]);
  const brand = insights.brand;
  const mentionTone =
    brand.mentionCoverage === 0
      ? "is-empty"
      : brand.mentionRate === 0
        ? "is-zero"
        : "has-value";
  return (
    <section className="geo-ranking-brand-performance" aria-label="本品表现">
      <header>
        <div>
          <span>行业排名观察</span>
          <h4>本品表现</h4>
        </div>
        <small>每项指标使用自身有值回答作为分母</small>
      </header>
      <div className="geo-insight-brand-metrics">
        <span className={mentionTone}>
          <small>提及率</small>
          <strong>
            {brand.mentionCoverage > 0 ? `${brand.mentionRate}%` : "—"}
          </strong>
          <em>
            {brand.mentionCoverage > 0
              ? `${brand.mentionedCount}/${brand.mentionCoverage} 条回答`
              : "暂无数据"}
          </em>
        </span>
        <span
          className={
            brand.averagePosition === undefined ? "is-empty" : "has-value"
          }
        >
          <small>平均提及位置</small>
          <strong>
            {brand.averagePosition === undefined
              ? "—"
              : `第 ${brand.averagePosition} 个`}
          </strong>
          {brand.averagePosition === undefined && <em>暂无数据</em>}
        </span>
        <span
          className={
            brand.bestPosition === undefined ? "is-empty" : "has-value"
          }
        >
          <small>最佳提及位置</small>
          <strong>
            {brand.bestPosition === undefined
              ? "—"
              : `第 ${brand.bestPosition} 个`}
          </strong>
          {brand.bestPosition === undefined && <em>暂无数据</em>}
        </span>
      </div>
    </section>
  );
}

const SENTIMENT_LABELS = {
  positive: "正面",
  neutral: "中性",
  negative: "负面",
  unknown: "未知",
} as const;

const EVALUATION_LABELS = {
  positive: "正面词",
  neutral: "中性词",
  negative: "负面词",
} as const;

function AnswerScreenshotEntry({
  answer,
  platformName,
  screenshotEnabled,
}: {
  answer: GeoMonitoringAnswer;
  platformName: string;
  screenshotEnabled: boolean;
}) {
  const [screenshotOpen, setScreenshotOpen] = useState(false);
  const [screenshotFailed, setScreenshotFailed] = useState(false);
  const [screenshotZoom, setScreenshotZoom] = useState<"fit" | number>("fit");
  const [screenshotNaturalSize, setScreenshotNaturalSize] = useState<{
    width: number;
    height: number;
  }>();
  useEffect(() => {
    setScreenshotOpen(false);
    setScreenshotFailed(false);
    setScreenshotZoom("fit");
    setScreenshotNaturalSize(undefined);
  }, [answer.id]);
  if (!screenshotEnabled) return null;

  const screenshotReady =
    answer.screenshotAvailable === true && Boolean(answer.screenshotUrl);
  if (!screenshotReady) {
    return (
      <p className="geo-answer-screenshot-unavailable">
        本轮平台未返回可查看的页面截图。
      </p>
    );
  }

  return (
    <section className="geo-answer-screenshot-entry">
      <div>
        <strong>回答页面截图</strong>
        <small>截图仅在打开时加载，便于核对原始页面。</small>
      </div>
      <button type="button" onClick={() => setScreenshotOpen(true)}>
        <ImageIcon size={15} /> 查看页面截图
      </button>
      <Dialog
        open={screenshotOpen}
        onOpenChange={(open) => {
          setScreenshotOpen(open);
          setScreenshotFailed(false);
          if (!open) {
            setScreenshotZoom("fit");
            setScreenshotNaturalSize(undefined);
          }
        }}
      >
        <DialogContent
          className="geo-monitor-screenshot-dialog"
          overlayClassName="geo-monitor-screenshot-overlay"
        >
          <DialogHeader>
            <DialogTitle>
              {platformName} · 第 {answer.runIndex} 次回答页面截图
            </DialogTitle>
            <DialogDescription>
              用于核对采样当时的页面内容；截图可能因上游保留期限而失效。
            </DialogDescription>
          </DialogHeader>
          <div className="geo-monitor-screenshot-toolbar" role="toolbar">
            <button
              type="button"
              className={screenshotZoom === "fit" ? "is-active" : ""}
              onClick={() => setScreenshotZoom("fit")}
            >
              <Maximize2 size={14} /> 适应窗口
            </button>
            <button
              type="button"
              aria-label="缩小截图"
              disabled={screenshotZoom === 50}
              onClick={() =>
                setScreenshotZoom((current) =>
                  Math.max(50, (current === "fit" ? 100 : current) - 25),
                )
              }
            >
              <Minus size={14} />
            </button>
            <output aria-live="polite">
              {screenshotZoom === "fit" ? "适应" : `${screenshotZoom}%`}
            </output>
            <button
              type="button"
              aria-label="放大截图"
              disabled={screenshotZoom === 300}
              onClick={() =>
                setScreenshotZoom((current) =>
                  Math.min(300, (current === "fit" ? 75 : current) + 25),
                )
              }
            >
              <Plus size={14} />
            </button>
            <button type="button" onClick={() => setScreenshotZoom(100)}>
              100%
            </button>
            <a
              href={answer.screenshotUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              新窗口查看原图 <ExternalLink size={13} />
            </a>
          </div>
          {screenshotFailed ? (
            <div className="geo-monitor-screenshot-error" role="alert">
              <CircleAlert size={20} />
              <p>截图可能已失效，关闭后可重新尝试。</p>
            </div>
          ) : (
            <div
              className={`geo-monitor-screenshot-viewport ${
                screenshotZoom === "fit" ? "is-fit" : "is-zoomed"
              }`}
            >
              <img
                src={answer.screenshotUrl}
                alt={`${platformName}第 ${answer.runIndex} 次回答页面截图`}
                referrerPolicy="no-referrer"
                style={
                  screenshotZoom === "fit" || !screenshotNaturalSize
                    ? undefined
                    : {
                        width: `${Math.round(
                          screenshotNaturalSize.width * (screenshotZoom / 100),
                        )}px`,
                        height: "auto",
                      }
                }
                onLoad={(event) => {
                  const { naturalWidth, naturalHeight } = event.currentTarget;
                  if (naturalWidth > 0 && naturalHeight > 0) {
                    setScreenshotNaturalSize({
                      width: naturalWidth,
                      height: naturalHeight,
                    });
                  }
                }}
                onError={() => setScreenshotFailed(true)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ReferenceColumn({ answer }: { answer: GeoMonitoringAnswer }) {
  if (!answer.sourceBreakdownAvailable) {
    return (
      <aside className="geo-answer-reference-panel is-legacy">
        <AnswerSources answer={answer} />
      </aside>
    );
  }
  const citationUrls = new Set(
    answer.citations
      .map((source) => safePublicMarkdownUrl(source.url))
      .filter((url): url is string => Boolean(url)),
  );
  const citationIndexCounts = new Map<number, number>();
  const referenceIndexCounts = new Map<number, number>();
  for (const source of answer.citations) {
    if (source.index === undefined) continue;
    citationIndexCounts.set(
      source.index,
      (citationIndexCounts.get(source.index) ?? 0) + 1,
    );
  }
  for (const source of answer.references) {
    if (source.index === undefined) continue;
    referenceIndexCounts.set(
      source.index,
      (referenceIndexCounts.get(source.index) ?? 0) + 1,
    );
  }

  return (
    <aside className="geo-answer-reference-panel" aria-label="完整参考来源">
      <header>
        <div>
          <span>引用来源</span>
          <h4>完整参考来源</h4>
        </div>
        <strong>{answer.references.length} 条</strong>
      </header>
      {answer.references.length > 0 ? (
        <ol>
          {answer.references.map((source, index) => {
            const safeUrl = safePublicMarkdownUrl(source.url);
            const citedByUrl = Boolean(safeUrl && citationUrls.has(safeUrl));
            const citedByUniqueIndex =
              !safeUrl &&
              source.index !== undefined &&
              citationIndexCounts.get(source.index) === 1 &&
              referenceIndexCounts.get(source.index) === 1;
            const cited = citedByUrl || citedByUniqueIndex;
            return (
              <li
                key={`${source.index ?? "source"}-${source.url ?? source.title}-${index}`}
              >
                <div className="geo-answer-reference-index">
                  {source.index ?? index + 1}
                </div>
                <div>
                  <div className="geo-answer-reference-title">
                    {safeUrl ? (
                      <a
                        href={safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {source.title} <ExternalLink size={11} />
                      </a>
                    ) : (
                      <strong>{source.title}</strong>
                    )}
                    {cited && <span>正文引用</span>}
                  </div>
                  <small>
                    {[source.site || source.domain, source.publishTime]
                      .filter(Boolean)
                      .join(" · ") || "来源信息未注明"}
                  </small>
                  {source.summary && <p>{source.summary}</p>}
                  {safeUrl && <code>{new URL(safeUrl).hostname}</code>}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="geo-answer-reference-empty">
          平台返回了引用分层，但本轮参考来源为空。
        </p>
      )}
    </aside>
  );
}

function InsightRankList({
  rows,
  empty,
}: {
  rows: MonitoringInsightRow[];
  empty: string;
}) {
  if (rows.length === 0) return <p className="geo-insight-empty">{empty}</p>;
  const renderRows = (items: MonitoringInsightRow[], offset = 0) => (
    <ol start={offset + 1}>
      {items.map((row) => (
        <li key={row.key}>
          <span>{offset + items.indexOf(row) + 1}</span>
          <div>
            {row.url ? (
              <a href={row.url} target="_blank" rel="noopener noreferrer">
                {row.label}
              </a>
            ) : (
              <strong>{row.label}</strong>
            )}
            {row.channel && <small>{row.channel}</small>}
          </div>
          <b>{row.count} 次</b>
          <em>{row.percentage}%</em>
        </li>
      ))}
    </ol>
  );
  return (
    <>
      {renderRows(rows.slice(0, 5))}
      {rows.length > 5 && (
        <details className="geo-insight-more">
          <summary>查看其余 {rows.length - 5} 项</summary>
          {renderRows(rows.slice(5), 5)}
        </details>
      )}
    </>
  );
}

function PlatformInsights({ answers }: { answers: GeoMonitoringAnswer[] }) {
  const insights = useMemo(() => buildMonitoringInsights(answers), [answers]);
  const sentiment = insights.sentiment;
  const positiveEnd = sentiment.percentages.positive * 3.6;
  const neutralEnd = positiveEnd + sentiment.percentages.neutral * 3.6;
  const negativeEnd = neutralEnd + sentiment.percentages.negative * 3.6;
  const hasCitationInsights =
    insights.channels.length > 0 || insights.articles.length > 0;
  const hasEvaluationInsights = Object.values(insights.evaluations.groups).some(
    (rows) => rows.length > 0,
  );
  if (
    insights.completedCount === 0 ||
    (!hasCitationInsights && sentiment.coverage === 0 && !hasEvaluationInsights)
  ) {
    return null;
  }

  return (
    <section className="geo-platform-insights" aria-label="引用分析">
      <header>
        <div>
          <span>平台洞察</span>
          <h3>引用分析</h3>
        </div>
        <small>描述性统计 · {insights.completedCount}/5 条有效回答</small>
      </header>
      {hasCitationInsights && (
        <div className="geo-insight-citation-grid">
          {insights.channels.length > 0 && (
            <article className="geo-insight-card">
              <header>
                <h4>渠道引用</h4>
                <small>{insights.citationCoverage} 条回答有引用分层</small>
              </header>
              <InsightRankList rows={insights.channels} empty="暂无渠道引用" />
            </article>
          )}
          {insights.articles.length > 0 && (
            <article className="geo-insight-card">
              <header>
                <h4>内容引用</h4>
                <small>同一回答内按文章去重</small>
              </header>
              <InsightRankList rows={insights.articles} empty="暂无内容引用" />
            </article>
          )}
        </div>
      )}

      {(sentiment.coverage > 0 || hasEvaluationInsights) && (
        <div className="geo-insight-analysis-grid">
          {sentiment.coverage > 0 && (
            <article className="geo-insight-card geo-insight-sentiment">
              <header>
                <h4>情感倾向</h4>
                <small>覆盖 {sentiment.coverage} 条回答</small>
              </header>
              <div>
                <div
                  className="geo-insight-sentiment-ring"
                  style={{
                    background: `conic-gradient(#18a878 0 ${positiveEnd}deg, #91a1b7 ${positiveEnd}deg ${neutralEnd}deg, #f13f5b ${neutralEnd}deg ${negativeEnd}deg, #d8d2dc ${negativeEnd}deg 360deg)`,
                  }}
                  aria-label={`正面 ${sentiment.counts.positive} 次，中性 ${sentiment.counts.neutral} 次，负面 ${sentiment.counts.negative} 次，未知 ${sentiment.counts.unknown} 次`}
                >
                  <span>
                    <strong>{sentiment.coverage}</strong>
                    <small>总次数</small>
                  </span>
                </div>
                <ul>
                  {(
                    Object.keys(SENTIMENT_LABELS) as Array<
                      keyof typeof SENTIMENT_LABELS
                    >
                  ).map((key) => (
                    <li key={key} className={`nature-${key}`}>
                      <span />
                      <strong>{SENTIMENT_LABELS[key]}</strong>
                      <b>{sentiment.counts[key]} 次</b>
                      <em>{sentiment.percentages[key]}%</em>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          )}

          {hasEvaluationInsights && (
            <article className="geo-insight-card geo-insight-evaluations">
              <header>
                <h4>评价词</h4>
                <small>覆盖 {insights.evaluations.coverage} 条回答</small>
              </header>
              <div>
                {(
                  Object.keys(EVALUATION_LABELS) as Array<
                    keyof typeof EVALUATION_LABELS
                  >
                ).map((nature) => {
                  const rows = insights.evaluations.groups[nature];
                  if (rows.length === 0) return null;
                  return (
                    <section key={nature} className={`nature-${nature}`}>
                      <h5>{EVALUATION_LABELS[nature]}</h5>
                      {rows.slice(0, 5).map((row) => (
                        <article key={row.key}>
                          <div>
                            <strong>{row.label}</strong>
                            <span>{row.count} 次</span>
                          </div>
                          {row.context && <p>{row.context}</p>}
                        </article>
                      ))}
                      {rows.length > 5 && (
                        <details>
                          <summary>查看其余 {rows.length - 5} 个词</summary>
                          {rows.slice(5).map((row) => (
                            <article key={row.key}>
                              <div>
                                <strong>{row.label}</strong>
                                <span>{row.count} 次</span>
                              </div>
                              {row.context && <p>{row.context}</p>}
                            </article>
                          ))}
                        </details>
                      )}
                    </section>
                  );
                })}
              </div>
            </article>
          )}
        </div>
      )}
    </section>
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
                <a href={item.url} target="_blank" rel="noopener noreferrer">
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
                <a href={item.url} target="_blank" rel="noopener noreferrer">
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
                  rel="noopener noreferrer"
                  aria-label={`打开${title}`}
                >
                  <Link2 size={22} />
                </a>
              )}
              <div>
                <strong>{title}</strong>
                {item.source && <small>{item.source}</small>}
                <a href={item.url} target="_blank" rel="noopener noreferrer">
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
      <summary aria-label={`可追溯来源 ${sources.length} 条`}>
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
                {safePublicMarkdownUrl(source.url) ? (
                  <a
                    href={safePublicMarkdownUrl(source.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
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
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
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
                                rel="noopener noreferrer"
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
