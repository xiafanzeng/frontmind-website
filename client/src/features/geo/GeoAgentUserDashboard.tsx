import {
  Activity,
  ArrowRight,
  Bot,
  CalendarDays,
  Check,
  ChevronRight,
  Database,
  ExternalLink,
  Eye,
  FileText,
  House,
  Menu,
  PackageCheck,
  RadioTower,
  Search,
  Shield,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  GEO_PLATFORMS,
  GEO_QUESTION_CATEGORIES,
  type GeoProject,
  type GeoQuestion,
  type GeoQuestionCategory,
} from "./types";
import { KnowledgeCompletenessDialog } from "./KnowledgeCompletenessDialog";
import { MonitoringMarkdown } from "./MonitoringMarkdown";

type DashboardSection = "service" | "brand" | "intent" | "progress" | "assets";

type DashboardSubpage =
  | "service-overview"
  | "knowledge-build"
  | "knowledge-display"
  | "brand-keywords"
  | "intent-questions"
  | "intent-logic"
  | "progress-distribution"
  | "progress-report"
  | "assets-library";

const DASHBOARD_SECTIONS = [
  {
    id: "service",
    label: "服务概览",
    icon: House,
    pages: [{ id: "service-overview", label: "服务首页" }],
  },
  {
    id: "brand",
    label: "品牌建设",
    icon: Shield,
    pages: [
      { id: "knowledge-build", label: "知识库智能体" },
      { id: "knowledge-display", label: "知识库展示" },
      { id: "brand-keywords", label: "品牌全域词库" },
    ],
  },
  {
    id: "intent",
    label: "意图优化",
    icon: Target,
    pages: [
      { id: "intent-questions", label: "问题优化" },
      { id: "intent-logic", label: "应答逻辑智能体" },
    ],
  },
  {
    id: "progress",
    label: "进度监控",
    icon: Activity,
    pages: [
      { id: "progress-distribution", label: "问题监控" },
      { id: "progress-report", label: "进度报告" },
    ],
  },
  {
    id: "assets",
    label: "AI 友好内容资产",
    icon: Database,
    pages: [{ id: "assets-library", label: "内容资产运营" }],
  },
] as const;

const DEFAULT_SUBPAGE: Record<DashboardSection, DashboardSubpage> = {
  service: "service-overview",
  brand: "knowledge-build",
  intent: "intent-questions",
  progress: "progress-distribution",
  assets: "assets-library",
};

const SUBPAGE_COPY: Record<
  DashboardSubpage,
  { eyebrow: string; title: string; description: string }
> = {
  "service-overview": {
    eyebrow: "MindPromise 智诺 / 服务概览",
    title: "服务首页",
    description: "查看当前服务版本、知识库状态与智能交付路径。",
  },
  "knowledge-build": {
    eyebrow: "MindPromise 智诺 / 品牌建设",
    title: "知识库智能体",
    description:
      "查看资料接入、全域采集、事实校准与版本发布的完整进度、阶段产出和质量控制。",
  },
  "knowledge-display": {
    eyebrow: "MindPromise 智诺 / 品牌建设",
    title: "知识库展示",
    description:
      "按主题查看企业事实、图文素材、证据数量、核验状态与可追溯来源。",
  },
  "brand-keywords": {
    eyebrow: "MindPromise 智诺 / 品牌建设",
    title: "品牌全域词库",
    description: "集中管理四类 GEO 问题、核心意图、优化状态和知识库证据映射。",
  },
  "intent-questions": {
    eyebrow: "MindPromise 智诺 / 意图优化",
    title: "问题优化",
    description:
      "按美誉舆情、产品与服务 Q&A、行业排名和竞品对比查看全部问题与本月执行项。",
  },
  "intent-logic": {
    eyebrow: "MindPromise 智诺 / 意图优化",
    title: "应答逻辑智能体",
    description:
      "围绕所选问题组织知识调用、证据锚点、目标回答结构和平台回答复测。",
  },
  "progress-distribution": {
    eyebrow: "MindPromise 智诺 / 进度监控",
    title: "问题监控",
    description: "逐平台查看回答采样、检索来源、答案引用和跨平台信源覆盖。",
  },
  "progress-report": {
    eyebrow: "MindPromise 智诺 / 进度监控",
    title: "服务前评估与预测",
    description:
      "这里展示官网阶段返回的现状评估与条件预测；服务周期进度报告以 Agent 工作台数据为准。",
  },
  "assets-library": {
    eyebrow: "MindPromise 智诺 / AI 友好内容资产",
    title: "内容资产运营",
    description: "统一查看知识库图文、官网问答、品牌深度内容与权威信源任务。",
  },
};

function getKnowledgeCoverage(project: GeoProject): string {
  if (project.knowledgeBase?.completeness) {
    return `${project.knowledgeBase.completeness.score}%`;
  }
  return "—";
}

function getProjectInitial(title: string): string {
  const normalized = title.trim();
  return normalized ? normalized.slice(0, 1).toUpperCase() : "F";
}

function DashboardMetric({
  label,
  value,
  detail,
  tone,
  onClick,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone: "purple" | "gold" | "blue" | "green";
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <button
        type="button"
        className={`geo-agent-metric geo-agent-metric-button tone-${tone}`}
        onClick={onClick}
        aria-haspopup="dialog"
      >
        <span>{label}</span>
        <strong>{value}</strong>
        <p>{detail}</p>
        <small>
          查看评估明细 <ArrowRight size={12} />
        </small>
      </button>
    );
  }
  return (
    <article className={`geo-agent-metric tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function formatDashboardDate(value?: string): string {
  if (!value) return "待更新";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "待更新";
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

type ServiceJourneyState =
  | "complete"
  | "current"
  | "pending"
  | "syncing"
  | "attention";

const WEBSITE_SERVICE_PLAN = {
  code: "basic",
  label: "基础版",
  serviceDays: 30,
} as const;

const SERVICE_STATUS_LABELS: Record<
  NonNullable<GeoProject["serviceActivation"]>["status"],
  string
> = {
  not_started: "尚未开通",
  profile_required: "待完善签约信息",
  contract_preparing: "合同准备中",
  signature_required: "待签署合同",
  payment_required: "待完成付款",
  activation_pending: "等待开通",
  account_setup_required: "待设置账号",
  provisioning: "服务配置中",
  active: "已生效",
  failed: "开通需处理",
};

const SERVICE_JOURNEY_STATUS: Record<ServiceJourneyState, string> = {
  complete: "已完成",
  current: "可进行",
  pending: "待前置",
  syncing: "待同步",
  attention: "需处理",
};

function getServiceValidity(project: GeoProject): string {
  const activation = project.serviceActivation;
  if (!activation?.activatedAt) return "开通后由 Agent 同步";
  return `${formatDashboardDate(activation.activatedAt)} 起 · ${
    activation.serviceDays ?? WEBSITE_SERVICE_PLAN.serviceDays
  } 天`;
}

function getMonitoringJourneyState(project: GeoProject): ServiceJourneyState {
  const status = project.monitoring?.status;
  if (status === "completed") return "complete";
  if (status === "failed" || status === "partial_review") return "attention";
  if (status === "submitted" || status === "capturing") return "current";
  return "pending";
}

function getKnowledgeJourneyState(project: GeoProject): ServiceJourneyState {
  const importStatus = project.serviceActivation?.knowledgeImport?.status;
  if (importStatus === "ready") return "complete";
  if (importStatus === "failed") return "attention";
  if (importStatus === "pending" || importStatus === "importing") {
    return "current";
  }
  return project.knowledgeBase ? "syncing" : "pending";
}

function ServiceOverviewPanel({
  project,
  question,
  active,
  sampleMode,
  onNavigate,
}: {
  project: GeoProject;
  question: GeoQuestion;
  active: boolean;
  sampleMode?: "luxury";
  onNavigate: (section: DashboardSection, subpage: DashboardSubpage) => void;
}) {
  const activation = project.serviceActivation;
  const companyName = project.knowledgeBase?.companyName || project.title;
  const isLuxurySample = sampleMode === "luxury";
  const hasSelectedQuestion = Boolean(
    activation?.questionId || project.selectedQuestionId,
  );
  const hasPurchasedQuestion = Boolean(
    hasSelectedQuestion &&
      (active ||
        activation?.paidAt ||
        activation?.status === "activation_pending" ||
        activation?.status === "account_setup_required" ||
        activation?.status === "provisioning" ||
        activation?.status === "active"),
  );
  const planName = isLuxurySample
    ? "豪华版"
    : activation?.planCode === WEBSITE_SERVICE_PLAN.code || project.preview
      ? WEBSITE_SERVICE_PLAN.label
      : "待同步";
  const serviceStatus = isLuxurySample
    ? "工作台界面样例"
    : active
      ? "已生效"
      : activation
        ? SERVICE_STATUS_LABELS[activation.status]
        : "待同步";
  const knowledgeImport = activation?.knowledgeImport;
  const knowledgeState = isLuxurySample
    ? "complete"
    : getKnowledgeJourneyState(project);
  const questionState: ServiceJourneyState = hasSelectedQuestion
    ? isLuxurySample || hasPurchasedQuestion
      ? "complete"
      : "current"
    : project.questions.length > 0
      ? "current"
      : "pending";
  const responseLogicState: ServiceJourneyState = isLuxurySample
    ? "current"
    : hasSelectedQuestion
      ? "current"
      : "pending";
  const monitoringState = isLuxurySample
    ? "syncing"
    : getMonitoringJourneyState(project);
  const reportState: ServiceJourneyState = isLuxurySample
    ? "pending"
    : active
      ? "syncing"
      : "pending";
  const serviceDays = isLuxurySample
    ? null
    : (activation?.serviceDays ??
      (project.preview ? WEBSITE_SERVICE_PLAN.serviceDays : null));
  const journeyItems: Array<{
    id: string;
    title: string;
    description: string;
    state: ServiceJourneyState;
    section: DashboardSection;
    subpage: DashboardSubpage;
    actionLabel?: string;
  }> = [
    {
      id: "knowledge",
      title: "知识库展示",
      description: isLuxurySample
        ? `${companyName} 的企业事实、产品服务、案例与可信信源统一进入知识底座。`
        : knowledgeImport?.status === "ready"
          ? `${companyName} 的企业知识库已同步到服务工作台。`
          : knowledgeImport?.status === "failed"
            ? knowledgeImport.message || "知识库导入未完成，请检查开通状态。"
            : knowledgeImport
              ? `${companyName} 的知识库正在同步到服务工作台。`
              : project.knowledgeBase
                ? `${companyName} 的项目知识底稿已就绪，等待 Agent 导入状态同步。`
                : "等待企业资料完成接入与事实校准。",
      state: knowledgeState,
      section: "brand",
      subpage: "knowledge-display",
    },
    {
      id: "question",
      title: hasPurchasedQuestion ? "已购服务问题" : "当前服务问题",
      description: isLuxurySample
        ? `32 个品牌问题池按行业、竞品、美誉与产品场景管理；当前示例：${question.question}`
        : hasSelectedQuestion
          ? question.question
          : "从已返回的问题中确定本次服务问题。",
      state: questionState,
      section: "intent",
      subpage: "intent-questions",
    },
    {
      id: "response-logic",
      title: "应答逻辑智能体",
      description: isLuxurySample
        ? "为重点问题编排标准回答、事实证据、引用锚点与内容任务。"
        : hasSelectedQuestion
          ? "围绕当前问题组织知识调用、证据锚点与目标回答结构。"
          : "选定服务问题后生成可核验的应答逻辑。",
      state: responseLogicState,
      section: "intent",
      subpage: "intent-logic",
    },
    {
      id: "monitoring",
      title: "问题监控",
      description: isLuxurySample
        ? "按固定问题在 6 个主流 AI 平台持续采集，统一查看提及、引用与答案变化。"
        : project.monitoring
          ? `${project.monitoring.completedRecords} / ${project.monitoring.expectedRecords} 条回答已完成采集。`
          : "选定问题与平台后开始真实回答采集。",
      state: monitoringState,
      section: "progress",
      subpage: "progress-distribution",
    },
    {
      id: "report",
      title: "进度报告",
      description: isLuxurySample
        ? "汇总本月任务、内容交付、平台表现与下一阶段优化重点。"
        : project.assessment || project.optimizationForecast
          ? "服务前评估已就绪；服务周期复测与进度报告由 Agent 工作台同步。"
          : "服务开启后由 Agent 同步周期复测、发现与下一步。",
      state: reportState,
      section: "progress",
      subpage: "progress-report",
      actionLabel: "查看服务前评估",
    },
  ];

  return (
    <section className="geo-agent-service-home" aria-label="服务首页">
      {isLuxurySample && (
        <div className="geo-agent-sample-notice" role="note">
          <span>
            <Sparkles size={16} />
            豪华版工作台样例
          </span>
          <p>
            用于预览完整服务开通后的工作方式；下列进度与数量为界面演示，不代表当前项目已开通或已经交付。
          </p>
          <strong>演示数据</strong>
        </div>
      )}

      <header className="geo-agent-service-heading">
        <span>MindPromise 智诺 · 服务首页</span>
      </header>

      <div className="geo-agent-service-overview-grid">
        <article
          className="geo-agent-plan-card"
          aria-label={`当前服务版本：${planName}`}
        >
          <span className="geo-agent-plan-badge">
            <PackageCheck size={15} />
            当前服务版本
          </span>
          <div className="geo-agent-plan-title">
            <h2>{planName}</h2>
            <p>
              {serviceStatus}
              {isLuxurySample
                ? " · 持续品牌智能优化"
                : serviceDays
                  ? ` · ${serviceDays} 天单题服务`
                  : ""}
            </p>
          </div>
          <div className="geo-agent-plan-meta">
            <div>
              <span>
                <CalendarDays size={15} />
                服务有效期
              </span>
              <strong>
                {isLuxurySample
                  ? "持续服务 · 按月推进 · 分阶段验收"
                  : getServiceValidity(project)}
              </strong>
            </div>
            <div>
              <span>
                <Sparkles size={15} />
                套餐范围
              </span>
              <strong>
                {isLuxurySample
                  ? "32 个品牌问题 · 6 个主流 AI 平台"
                  : activation
                    ? `${activation.billingMonths} 个月 · ${
                        hasSelectedQuestion ? "1 个服务问题" : "问题待选择"
                      }`
                    : "开通后由 Agent 同步"}
              </strong>
            </div>
          </div>
        </article>

        <div className="geo-agent-service-summary">
          <article className="geo-agent-service-summary-card">
            <header>
              <div>
                <span>当前知识库</span>
                <h3>
                  {knowledgeImport?.status === "ready"
                    ? "企业知识库"
                    : knowledgeImport?.status === "failed"
                      ? "知识库同步需处理"
                      : knowledgeImport
                        ? "知识库同步中"
                        : project.knowledgeBase
                          ? "项目知识底稿"
                          : "知识库待接入"}
                </h3>
              </div>
              <i>
                <Database size={20} />
              </i>
            </header>
            <p>
              {knowledgeImport?.status === "ready"
                ? `${companyName} 的品牌事实与素材已同步到服务工作台。`
                : knowledgeImport?.status === "failed"
                  ? knowledgeImport.message ||
                    "知识库同步未完成，请按开通流程处理后再查看。"
                  : knowledgeImport
                    ? "项目知识底稿正在导入，完成后会同步企业事实、信源与素材状态。"
                    : project.knowledgeBase
                      ? project.knowledgeBase.completeness
                        ? `${companyName} 的项目知识底稿完整度为 ${getKnowledgeCoverage(
                            project,
                          )}，Agent 导入状态待同步。`
                        : `${companyName} 的项目知识底稿已就绪，Agent 导入状态待同步。`
                      : "知识库返回后，将在这里同步企业事实、信源与素材状态。"}
            </p>
            <small>
              {knowledgeImport?.updatedAt
                ? `最近更新：${formatDashboardDate(knowledgeImport.updatedAt)}`
                : project.knowledgeBase?.generatedAt
                  ? `最近更新：${formatDashboardDate(
                      project.knowledgeBase.generatedAt,
                    )}`
                  : "最近更新：待同步"}
            </small>
            <button
              type="button"
              onClick={() => onNavigate("brand", "knowledge-display")}
            >
              {knowledgeImport?.status === "ready"
                ? "查看知识库"
                : project.knowledgeBase
                  ? "查看项目知识底稿"
                  : "查看接入状态"}
              <ChevronRight size={15} />
            </button>
          </article>

          <article className="geo-agent-service-summary-card geo-agent-quota-card">
            <header>
              <div>
                <span>套餐配额</span>
                <h3>{isLuxurySample ? "品牌问题矩阵" : "本次服务配置"}</h3>
              </div>
            </header>
            <div>
              {isLuxurySample ? (
                <>
                  <span>
                    <small>行业排名</small>
                    <strong>4 个问题</strong>
                  </span>
                  <span>
                    <small>竞品对比</small>
                    <strong>4 个问题</strong>
                  </span>
                  <span>
                    <small>美誉舆情</small>
                    <strong>4 个问题</strong>
                  </span>
                  <span>
                    <small>产品场景</small>
                    <strong>20 个问题</strong>
                  </span>
                </>
              ) : (
                <>
                  <span>
                    <small>当前服务问题</small>
                    <strong>
                      {hasSelectedQuestion ? "1 个已选问题" : "待选择"}
                    </strong>
                  </span>
                  <span>
                    <small>监控平台</small>
                    <strong>
                      {project.selectedPlatformIds.length > 0
                        ? `${project.selectedPlatformIds.length} 个平台`
                        : "待选择"}
                    </strong>
                  </span>
                </>
              )}
            </div>
          </article>
        </div>
      </div>

      {isLuxurySample && (
        <div
          className="geo-agent-sample-metrics"
          aria-label="豪华版服务能力概览"
        >
          <article>
            <small>品牌知识底座</small>
            <strong>持续更新</strong>
            <span>企业事实与可信信源统一管理</span>
          </article>
          <article>
            <small>AI 平台监测</small>
            <strong>6 个平台</strong>
            <span>同问题、多轮次、同口径复测</span>
          </article>
          <article>
            <small>权威内容运营</small>
            <strong>按月交付</strong>
            <span>内容、信源与官网任务协同推进</span>
          </article>
          <article>
            <small>服务复盘</small>
            <strong>月度报告</strong>
            <span>任务进度、平台变化与下一步</span>
          </article>
        </div>
      )}

      <section className="geo-agent-journey-panel" aria-label="智能交付">
        <header>
          <span>智能交付</span>
          <h3>智能服务路径</h3>
        </header>
        <div className="geo-agent-journey-divider">
          <span>GEO 服务交付</span>
          <i />
        </div>
        <div className="geo-agent-journey-list">
          {journeyItems.map((item, index) => (
            <article key={item.id}>
              <span className="geo-agent-journey-index">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <header>
                  <h4>{item.title}</h4>
                  <span
                    className={`geo-agent-journey-status state-${item.state}`}
                  >
                    {SERVICE_JOURNEY_STATUS[item.state]}
                  </span>
                </header>
                <p>{item.description}</p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate(item.section, item.subpage)}
              >
                {item.actionLabel || "查看"}
                <ChevronRight size={15} />
              </button>
            </article>
          ))}
        </div>

        <div className="geo-agent-journey-divider is-continuous">
          <span>持续内容运营</span>
          <i />
        </div>
        <article className="geo-agent-continuous-card">
          <span>
            <Sparkles size={17} />
          </span>
          <div>
            <header>
              <h4>
                {isLuxurySample ? "权威内容与 AI 友好官网" : "AI 友好内容资产"}
              </h4>
              <small>{isLuxurySample ? "持续运营" : "预览入口"}</small>
            </header>
            <p>
              {isLuxurySample
                ? "将知识、应答逻辑与监测发现转化为可发布、可追踪的品牌内容任务。"
                : "查看当前项目已返回的图文素材与内容资产状态。"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("assets", "assets-library")}
          >
            查看
            <ChevronRight size={15} />
          </button>
        </article>
      </section>
    </section>
  );
}

function GeoAgentTable({
  headers,
  rows,
  emptyText = "当前暂无数据。",
}: {
  headers: string[];
  rows: Array<Array<ReactNode>>;
  emptyText?: string;
}) {
  return (
    <div className="geo-agent-table-frame">
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={headers.length}>{emptyText}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function KnowledgePanel({
  project,
  view,
}: {
  project: GeoProject;
  view: "knowledge-build" | "knowledge-display";
}) {
  const knowledgeBase = project.knowledgeBase;
  const sections = knowledgeBase?.sections ?? [];
  const sources = knowledgeBase?.sources ?? [];
  const assets = knowledgeBase?.assets ?? [];
  const [knowledgeSearch, setKnowledgeSearch] = useState("");
  const [completenessOpen, setCompletenessOpen] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState(
    sections[0]?.id || "",
  );
  const filteredSections = sections.filter((section) =>
    `${section.title}${section.summary || ""}${section.markdown || ""}`
      .toLowerCase()
      .includes(knowledgeSearch.toLowerCase()),
  );
  const selectedSection =
    sections.find((section) => section.id === selectedSectionId) ||
    filteredSections[0] ||
    sections[0];
  const buildSteps = [
    {
      title: "资料接入与范围确认",
      detail: "接入企业官网、宣传册与补充资料，建立抓取边界和任务清单。",
      status: project.files.length > 0 || project.input ? "已完成" : "待处理",
      output: `${project.files.length} 份企业资料`,
    },
    {
      title: "官网与公开信源采集",
      detail: "覆盖官网页面、权威数据库与可核验公开资料，保留来源信息。",
      status: sources.length > 0 ? "已完成" : "待处理",
      output: `${sources.length} 个来源`,
    },
    {
      title: "事实拆解与证据校准",
      detail: "将主体、产品、能力、场景与证据拆分成可调用的知识模块。",
      status: sections.length > 0 ? "已完成" : "待处理",
      output: `${sections.length} 个知识模块`,
    },
    {
      title: "图文归档与版本发布",
      detail: "把图文素材挂接到对应知识主题，并发布本次采集快照。",
      status: knowledgeBase?.generatedAt ? "已完成" : "待处理",
      output: knowledgeBase?.archiveName || `${assets.length} 项图文素材`,
    },
  ];

  return (
    <>
      <div className="geo-agent-metric-grid">
        <DashboardMetric
          label="知识模块"
          value={knowledgeBase?.sections.length ?? 0}
          detail="企业事实按主题结构化归档"
          tone="purple"
        />
        <DashboardMetric
          label="可核验来源"
          value={knowledgeBase?.sources.length ?? 0}
          detail="官网与公开资料保留来源"
          tone="gold"
        />
        <DashboardMetric
          label="图文素材"
          value={knowledgeBase?.assets.length ?? 0}
          detail="与知识主题关联管理"
          tone="blue"
        />
        <DashboardMetric
          label="知识库完整度"
          value={getKnowledgeCoverage(project)}
          detail="按本次适用知识节点计算"
          tone="green"
          onClick={() => setCompletenessOpen(true)}
        />
      </div>

      {view === "knowledge-build" ? (
        <>
          <section className="geo-agent-panel geo-agent-build-tree-panel">
            <header>
              <div>
                <span>KNOWLEDGE BUILD PIPELINE</span>
                <h4>知识库构建进度树</h4>
              </div>
              <Bot size={20} />
            </header>
            <ol className="geo-agent-build-tree">
              {buildSteps.map((step, index) => (
                <li key={step.title}>
                  <span className="geo-agent-build-index">
                    <Check size={14} />
                  </span>
                  <div className="geo-agent-build-node">
                    <header>
                      <div>
                        <small>阶段 {String(index + 1).padStart(2, "0")}</small>
                        <strong>{step.title}</strong>
                      </div>
                      <em>{step.status}</em>
                    </header>
                    <p>{step.detail}</p>
                    <footer>
                      <span>阶段产出</span>
                      <strong>{step.output}</strong>
                    </footer>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <div className="geo-agent-panel-grid">
            <section className="geo-agent-panel">
              <header>
                <div>
                  <span>SOURCE REGISTER</span>
                  <h4>已纳入的来源</h4>
                </div>
                <RadioTower size={20} />
              </header>
              <GeoAgentTable
                headers={["来源", "类型", "域名", "采集时间"]}
                rows={sources.map((source) => [
                  source.url ? (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      key={source.id}
                    >
                      {source.title}
                      <ExternalLink size={11} />
                    </a>
                  ) : (
                    source.title
                  ),
                  source.type || "公开资料",
                  source.domain || "—",
                  formatDashboardDate(source.capturedAt),
                ])}
              />
            </section>

            <section className="geo-agent-panel">
              <header>
                <div>
                  <span>QUALITY CONTROL</span>
                  <h4>采集质量控制规则</h4>
                </div>
                <Shield size={20} />
              </header>
              <div className="geo-agent-control-list">
                {[
                  ["完整性", "按主体、产品、能力、场景与证据分别建立模块"],
                  ["可追溯", "为事实记录来源域名、采集时间与证据数量"],
                  ["一致性", "对重复页面去重，并把冲突口径送入核验清单"],
                  ["可复用", "关联知识、图文与问题意图，供对应板块调用"],
                ].map(([title, detail]) => (
                  <article key={title}>
                    <Shield size={15} />
                    <div>
                      <strong>{title}</strong>
                      <p>{detail}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </>
      ) : (
        <>
          <div className="geo-agent-toolbar">
            <label className="geo-agent-search">
              <Search size={15} />
              <input
                value={knowledgeSearch}
                onChange={(event) => setKnowledgeSearch(event.target.value)}
                placeholder="搜索知识主题、事实或正文"
              />
              {knowledgeSearch && (
                <button
                  type="button"
                  aria-label="清空搜索"
                  onClick={() => setKnowledgeSearch("")}
                >
                  <X size={13} />
                </button>
              )}
            </label>
            <span className="geo-agent-result-count">
              {filteredSections.length} 个知识模块
            </span>
          </div>

          <section className="geo-agent-knowledge-explorer">
            <aside aria-label="知识库目录">
              <header>
                <span>知识库目录</span>
                <small>{sections.length} 个模块</small>
              </header>
              <nav>
                {filteredSections.map((section, index) => (
                  <button
                    type="button"
                    className={
                      selectedSection?.id === section.id ? "is-active" : ""
                    }
                    onClick={() => setSelectedSectionId(section.id)}
                    key={section.id}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{section.title}</strong>
                      <small>{section.evidenceCount ?? 0} 项证据</small>
                    </div>
                    <ChevronRight size={14} />
                  </button>
                ))}
              </nav>
            </aside>
            <article>
              {selectedSection ? (
                <>
                  <header>
                    <div>
                      <span>知识主题</span>
                      <h4>{selectedSection.title}</h4>
                      <p>{selectedSection.summary}</p>
                    </div>
                    <small
                      className={`status-${selectedSection.status || "unknown"}`}
                    >
                      {selectedSection.status === "needs_verification"
                        ? "待补充核验"
                        : selectedSection.status === "inferred"
                          ? "推断信息"
                          : selectedSection.status === "verified"
                            ? "已核验"
                            : selectedSection.status === "not_applicable"
                              ? "不适用"
                              : "状态未返回"}
                    </small>
                  </header>
                  <div className="geo-agent-knowledge-markdown">
                    <MonitoringMarkdown
                      markdown={
                        selectedSection.markdown ||
                        selectedSection.summary ||
                        "该知识主题正在整理。"
                      }
                    />
                  </div>
                  <div className="geo-agent-related-assets">
                    <header>
                      <strong>关联图文</strong>
                      <span>
                        {
                          assets.filter(
                            (asset) => asset.sectionId === selectedSection.id,
                          ).length
                        }{" "}
                        项
                      </span>
                    </header>
                    <div>
                      {assets
                        .filter(
                          (asset) =>
                            asset.sectionId === selectedSection.id ||
                            !asset.sectionId,
                        )
                        .slice(0, 6)
                        .map((asset) => (
                          <article key={asset.id}>
                            {asset.previewUrl ? (
                              <img src={asset.previewUrl} alt={asset.name} />
                            ) : (
                              <span>
                                <FileText size={18} />
                              </span>
                            )}
                            <div>
                              <strong>{asset.name}</strong>
                              <small>
                                {asset.type || asset.source || "知识库素材"}
                              </small>
                            </div>
                          </article>
                        ))}
                    </div>
                  </div>
                </>
              ) : (
                <p className="geo-agent-empty-copy">
                  没有找到符合条件的知识模块。
                </p>
              )}
            </article>
          </section>

          <div className="geo-agent-panel-grid">
            <section className="geo-agent-panel">
              <header>
                <div>
                  <span>KNOWLEDGE METRICS</span>
                  <h4>知识库指标</h4>
                </div>
                <Database size={20} />
              </header>
              <div className="geo-agent-kb-metrics-list">
                {(knowledgeBase?.metrics ?? []).map((metric) => (
                  <article key={metric.key}>
                    <div>
                      <strong>{metric.label}</strong>
                      <p>{metric.detail || "本次知识库快照统计"}</p>
                    </div>
                    <span>{metric.value}</span>
                  </article>
                ))}
              </div>
            </section>
            <section className="geo-agent-panel">
              <header>
                <div>
                  <span>MEDIA ASSETS</span>
                  <h4>关联图文素材</h4>
                </div>
                <FileText size={20} />
              </header>
              <div className="geo-agent-asset-mini-list">
                {assets.map((asset) => (
                  <article key={asset.id}>
                    <span>
                      <FileText size={14} />
                    </span>
                    <div>
                      <strong>{asset.name}</strong>
                      <p>{asset.type || asset.source || "知识库素材"}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
      <KnowledgeCompletenessDialog
        open={completenessOpen}
        onOpenChange={setCompletenessOpen}
        completeness={knowledgeBase?.completeness}
        companyName={knowledgeBase?.companyName || project.title}
      />
    </>
  );
}

function BrandPanel({
  project,
  question,
}: {
  project: GeoProject;
  question: GeoQuestion;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [questionCategory, setQuestionCategory] = useState<
    GeoQuestionCategory | "all"
  >("all");
  const filteredQuestions = project.questions.filter((item) => {
    const categoryMatch =
      questionCategory === "all" || item.category === questionCategory;
    const searchMatch =
      !searchTerm ||
      item.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.rationale?.toLowerCase().includes(searchTerm.toLowerCase());
    return categoryMatch && searchMatch;
  });

  return (
    <>
      <div className="geo-agent-toolbar">
        <label className="geo-agent-search">
          <Search size={15} />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="搜索问题、核心词或优化依据"
          />
          {searchTerm && (
            <button
              type="button"
              aria-label="清空搜索"
              onClick={() => setSearchTerm("")}
            >
              <X size={13} />
            </button>
          )}
        </label>
        <div className="geo-agent-filter-chips" aria-label="问题分类">
          <button
            type="button"
            className={questionCategory === "all" ? "is-active" : ""}
            onClick={() => setQuestionCategory("all")}
          >
            全部
          </button>
          {GEO_QUESTION_CATEGORIES.map((category) => (
            <button
              type="button"
              className={questionCategory === category.id ? "is-active" : ""}
              onClick={() => setQuestionCategory(category.id)}
              key={category.id}
            >
              {category.title}
            </button>
          ))}
        </div>
      </div>

      <div className="geo-agent-metric-grid">
        <DashboardMetric
          label="全域问题"
          value={project.questions.length}
          detail="按四类 GEO 意图统一管理"
          tone="purple"
        />
        <DashboardMetric
          label="本月主问题"
          value={project.selectedQuestionId ? 1 : 0}
          detail={question.question}
          tone="gold"
        />
        <DashboardMetric
          label="可直接优化"
          value={project.questions.filter((item) => item.selectable).length}
          detail="非行业排名类问题"
          tone="green"
        />
        <DashboardMetric
          label="证据关联"
          value={
            project.questions.filter(
              (item) => (item.evidenceRefs?.length ?? 0) > 0,
            ).length
          }
          detail="已有知识库证据映射"
          tone="blue"
        />
      </div>

      <section className="geo-agent-panel">
        <header>
          <div>
            <span>BRAND QUERY BANK</span>
            <h4>品牌全域词库</h4>
          </div>
          <small>{filteredQuestions.length} 个问题</small>
        </header>
        <GeoAgentTable
          headers={["问题", "核心分类", "GEO 场景", "优化状态", "证据"]}
          rows={filteredQuestions.map((item) => {
            const category = GEO_QUESTION_CATEGORIES.find(
              (candidate) => candidate.id === item.category,
            );
            const selected = item.id === project.selectedQuestionId;
            return [
              <div className="geo-agent-question-cell" key={item.id}>
                {selected && <span>本月</span>}
                <strong>{item.question}</strong>
                <small>{item.rationale || category?.description}</small>
              </div>,
              <span
                className={`geo-agent-category-pill category-${item.category}`}
                key={item.category}
              >
                {category?.title || item.category}
              </span>,
              category?.description || "品牌认知优化",
              item.selectable ? "可直接优化" : "全域营销服务",
              `${item.evidenceRefs?.length ?? 0} 项`,
            ];
          })}
        />
      </section>
    </>
  );
}

export function IntentPanel({
  project,
  question,
  categoryLabel,
  view,
}: {
  project: GeoProject;
  question: GeoQuestion;
  categoryLabel: string;
  view: "intent-questions" | "intent-logic";
}) {
  const groupedQuestions = GEO_QUESTION_CATEGORIES.map((category) => ({
    ...category,
    questions: project.questions.filter(
      (item) => item.category === category.id,
    ),
  }));
  const completedAnswers =
    project.monitoring?.answers.filter(
      (answer) => answer.status === "completed",
    ) ?? [];
  const [selectedAnswerId, setSelectedAnswerId] = useState(
    completedAnswers[0]?.id || "",
  );
  const selectedAnswer =
    completedAnswers.find((answer) => answer.id === selectedAnswerId) ||
    completedAnswers[0];
  const knowledgeSections = project.knowledgeBase?.sections.slice(0, 4) ?? [];
  const sourceCount = project.knowledgeBase?.sources.length ?? 0;
  const evidenceCount = question.evidenceRefs?.length ?? 0;

  if (view === "intent-questions") {
    return (
      <>
        <section className="geo-agent-selected-question">
          <div>
            <span>当前待优化问题 · {categoryLabel}</span>
            <h4>{question.question}</h4>
            <p>
              {question.rationale ||
                "结合企业知识库、平台回答和引用来源逐项确认应答口径。"}
            </p>
          </div>
          <small>{question.evidenceRefs?.length ?? 0} 项证据已关联</small>
        </section>

        <div className="geo-agent-question-category-grid">
          {groupedQuestions.map((group, groupIndex) => (
            <section className={`category-${group.id}`} key={group.id}>
              <header>
                <span>{String(groupIndex + 1).padStart(2, "0")}</span>
                <div>
                  <h4>{group.title}</h4>
                  <p>{group.description}</p>
                </div>
                <small>{group.questions.length} 题</small>
              </header>
              <div>
                {group.questions.map((item, index) => {
                  const selected = item.id === question.id;
                  return (
                    <article
                      className={selected ? "is-selected" : ""}
                      key={item.id}
                    >
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <strong>{item.question}</strong>
                        <p>
                          {item.rationale ||
                            "结合企业知识库中的事实与证据覆盖优化应答。"}
                        </p>
                      </div>
                      <small>
                        {selected
                          ? "本月执行"
                          : item.selectable
                            ? "待规划"
                            : "全域服务"}
                      </small>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <section className="geo-agent-intent-hero">
        <div className="geo-agent-intent-label">
          <Target size={18} />
          <span>{categoryLabel}</span>
        </div>
        <div>
          <span>本月优化问题</span>
          <h4>{question.question}</h4>
          <p>
            以知识库事实为基础，建立稳定的回答结构、证据引用与平台复测口径。
          </p>
        </div>
      </section>

      <section
        className="geo-agent-response-preview"
        aria-label="应答逻辑简略工作台"
      >
        <aside
          className="geo-agent-response-question-nav"
          aria-label="应答逻辑问题目录"
        >
          <header>
            <div>
              <span>QUESTION CATALOG</span>
              <h4>问题目录</h4>
            </div>
            <small>{project.questions.length} 题</small>
          </header>
          <div className="geo-agent-response-question-groups">
            {groupedQuestions.map((group, index) => {
              const activeQuestion =
                group.questions.find((item) => item.id === question.id) ||
                group.questions[0];
              const selected = group.id === question.category;
              return (
                <article
                  className={selected ? "is-selected" : ""}
                  aria-current={selected ? "true" : undefined}
                  key={group.id}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{group.title}</strong>
                    <p>{activeQuestion?.question || "等待问题推荐 API 返回"}</p>
                  </div>
                  <small>{group.questions.length} 题</small>
                </article>
              );
            })}
          </div>
        </aside>

        <section
          className="geo-agent-response-dialogue"
          aria-label="企业交流与资料补充"
        >
          <header>
            <div>
              <span>ENTERPRISE CONTEXT</span>
              <h4>企业交流与资料补充</h4>
            </div>
            <Bot size={19} />
          </header>
          <div className="geo-agent-response-dialogue-body">
            <article>
              <span>
                <Bot size={14} />
              </span>
              <div>
                <strong>当前问题上下文已载入</strong>
                <p>
                  {question.rationale ||
                    "等待问题推荐 API 返回用户意图与推荐依据。"}
                </p>
              </div>
            </article>
            <article>
              <span>
                <Database size={14} />
              </span>
              <div>
                <strong>企业知识与来源状态</strong>
                <p>
                  {knowledgeSections.length > 0
                    ? `已关联 ${knowledgeSections.length} 个知识主题、${sourceCount} 个来源与 ${evidenceCount} 项问题证据。`
                    : "等待知识库 API 返回可调用的企业事实与来源。"}
                </p>
              </div>
            </article>
          </div>
          <p className="geo-agent-response-readonly-note">
            官网基础版展示已同步的流程骨架；正式交流、资料上传与口径确认在 Agent
            工作台完成。
          </p>
        </section>

        <section
          className="geo-agent-response-prefill"
          aria-label="应答逻辑预填"
        >
          <header>
            <div>
              <span>RESPONSE LOGIC</span>
              <h4>应答逻辑预填</h4>
            </div>
            <Target size={19} />
          </header>
          <dl>
            <div>
              <dt>用户真实关心</dt>
              <dd>
                {question.rationale ||
                  "等待问题推荐 API 返回用户意图与推荐依据。"}
              </dd>
            </div>
            <div>
              <dt>核心回答任务</dt>
              <dd>{question.question}</dd>
            </div>
            <div>
              <dt>企业材料调用</dt>
              <dd>
                {knowledgeSections.length > 0
                  ? knowledgeSections.map((section) => section.title).join("、")
                  : "等待知识库 API 返回企业材料"}
              </dd>
            </div>
            <div>
              <dt>官方依据</dt>
              <dd>
                {sourceCount > 0
                  ? `${sourceCount} 个知识库来源已关联`
                  : "暂无已同步来源"}
              </dd>
            </div>
            <div>
              <dt>回答边界</dt>
              <dd>仅使用已核验事实；缺失或冲突内容保留待确认状态。</dd>
            </div>
            <div>
              <dt>引用与核验</dt>
              <dd>
                {evidenceCount > 0
                  ? `${evidenceCount} 项问题证据待 Agent 复核后发布`
                  : "等待 Agent API 返回证据关联结果"}
              </dd>
            </div>
          </dl>
        </section>
      </section>

      <div className="geo-agent-response-source-strip">
        <Database size={16} />
        <div>
          <strong>当前知识调用</strong>
          <p>
            {knowledgeSections.length > 0
              ? knowledgeSections.map((section) => section.title).join(" · ")
              : "等待知识库 API 返回"}
          </p>
        </div>
      </div>

      <section className="geo-agent-panel">
        <header>
          <div>
            <span>ANSWER BLUEPRINT</span>
            <h4>目标应答结构</h4>
          </div>
          <Target size={20} />
        </header>
        <ol className="geo-agent-answer-blueprint geo-agent-answer-blueprint-compact">
          {[
            ["01", "直接结论", "先回答当前问题，不绕开用户的核心判断"],
            ["02", "企业事实", "调用知识库中已核验的主体与方案信息"],
            ["03", "证据锚点", "附上可追溯来源并标记待核验内容"],
            ["04", "适用边界", "说明适用条件、限制与下一步核验方式"],
          ].map(([code, title, detail]) => (
            <li key={code}>
              <span>{code}</span>
              <div>
                <strong>{title}</strong>
                <p>{detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="geo-agent-panel">
        <header>
          <div>
            <span>PLATFORM ANSWERS</span>
            <h4>本轮平台回答工作台</h4>
          </div>
          <small>{completedAnswers.length} 条有效回答</small>
        </header>
        <GeoAgentTable
          headers={["平台", "轮次", "答案摘要", "引用", "采集时间", "操作"]}
          rows={completedAnswers.slice(0, 12).map((answer) => {
            const platform = GEO_PLATFORMS.find(
              (item) => item.id === answer.platformId,
            );
            return [
              <span className="geo-agent-platform-cell" key={answer.id}>
                {platform && <img src={platform.logo} alt="" />}
                {platform?.name || answer.platformId}
              </span>,
              `第 ${answer.runIndex} 次`,
              <span className="geo-agent-answer-excerpt" key="excerpt">
                {answer.answer.replace(/[#*_`>-]/g, "").slice(0, 115)}
                {answer.answer.length > 115 ? "…" : ""}
              </span>,
              `${answer.citations.length + answer.references.length} 条`,
              formatDashboardDate(answer.capturedAt),
              <button
                type="button"
                className="geo-agent-table-action"
                onClick={() => setSelectedAnswerId(answer.id)}
                key="action"
              >
                <Eye size={13} />
                查看
              </button>,
            ];
          })}
        />
      </section>

      {selectedAnswer && (
        <section className="geo-agent-answer-detail">
          <header>
            <div>
              <span>ANSWER DETAIL</span>
              <h4>
                {GEO_PLATFORMS.find(
                  (item) => item.id === selectedAnswer.platformId,
                )?.name || selectedAnswer.platformId}
                · 第 {selectedAnswer.runIndex} 次回答
              </h4>
            </div>
            <small>{formatDashboardDate(selectedAnswer.capturedAt)}</small>
          </header>
          <div className="geo-agent-answer-detail-body">
            <MonitoringMarkdown markdown={selectedAnswer.answer} />
          </div>
          <div className="geo-agent-answer-evidence">
            <details>
              <summary>
                答案实际引用
                <span>{selectedAnswer.citations.length} 条</span>
              </summary>
              <div>
                {selectedAnswer.citations.map((source, index) =>
                  source.url ? (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      key={`${source.title}-${index}`}
                    >
                      {source.title}
                      <ExternalLink size={11} />
                    </a>
                  ) : (
                    <span key={`${source.title}-${index}`}>{source.title}</span>
                  ),
                )}
              </div>
            </details>
            <details>
              <summary>
                检索参考来源
                <span>{selectedAnswer.references.length} 条</span>
              </summary>
              <div>
                {selectedAnswer.references.map((source, index) =>
                  source.url ? (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      key={`${source.title}-${index}`}
                    >
                      {source.title}
                      <ExternalLink size={11} />
                    </a>
                  ) : (
                    <span key={`${source.title}-${index}`}>{source.title}</span>
                  ),
                )}
              </div>
            </details>
          </div>
        </section>
      )}
    </>
  );
}

export function ProgressPanel({
  project,
  active,
  view,
}: {
  project: GeoProject;
  active: boolean;
  view: "progress-distribution" | "progress-report";
}) {
  const monitoring = project.monitoring;
  const platformIds =
    monitoring?.platforms.length && monitoring.platforms.length > 0
      ? monitoring.platforms
      : project.selectedPlatformIds;
  const completion =
    monitoring && monitoring.expectedRecords > 0
      ? Math.round(
          (monitoring.completedRecords / monitoring.expectedRecords) * 100,
        )
      : 0;
  const roadmap = project.optimizationForecast?.roadmap ?? [];
  const roadmapAssumptions = project.optimizationForecast?.assumptions ?? [];
  const sourceRows = useMemo(() => {
    const sources = new Map<
      string,
      {
        title: string;
        url?: string;
        platforms: Set<string>;
        citations: number;
        references: number;
      }
    >();
    monitoring?.answers.forEach((answer) => {
      const platform =
        GEO_PLATFORMS.find((item) => item.id === answer.platformId)?.name ||
        answer.platformId;
      answer.citations.forEach((source) => {
        const key = source.url || source.title;
        const current = sources.get(key) || {
          title: source.title,
          url: source.url,
          platforms: new Set<string>(),
          citations: 0,
          references: 0,
        };
        current.platforms.add(platform);
        current.citations += 1;
        sources.set(key, current);
      });
      answer.references.forEach((source) => {
        const key = source.url || source.title;
        const current = sources.get(key) || {
          title: source.title,
          url: source.url,
          platforms: new Set<string>(),
          citations: 0,
          references: 0,
        };
        current.platforms.add(platform);
        current.references += 1;
        sources.set(key, current);
      });
    });
    return Array.from(sources.values()).sort(
      (left, right) =>
        right.citations + right.references - (left.citations + left.references),
    );
  }, [monitoring?.answers]);

  return (
    <>
      <div className="geo-agent-metric-grid">
        <DashboardMetric
          label="监控平台"
          value={platformIds.length}
          detail="统一问题与采样口径"
          tone="purple"
        />
        <DashboardMetric
          label="有效回答"
          value={monitoring?.completedRecords ?? 0}
          detail={`计划 ${monitoring?.expectedRecords ?? 0} 条`}
          tone="blue"
        />
        <DashboardMetric
          label="采样完成度"
          value={`${completion}%`}
          detail="正文、媒体与来源同步归档"
          tone="green"
        />
        <DashboardMetric
          label="本月服务"
          value={active ? "执行中" : "待启动"}
          detail="完成签约、付款与管理员确认后开通"
          tone="gold"
        />
      </div>

      {view === "progress-distribution" ? (
        <>
          <div className="geo-agent-panel-grid">
            <section className="geo-agent-panel">
              <header>
                <div>
                  <span>PLATFORM COVERAGE</span>
                  <h4>同口径监控平台</h4>
                </div>
                <RadioTower size={20} />
              </header>
              <div className="geo-agent-platform-list geo-agent-platform-list-detailed">
                {platformIds.map((platformId) => {
                  const platform = GEO_PLATFORMS.find(
                    (item) => item.id === platformId,
                  );
                  if (!platform) return null;
                  const answers =
                    monitoring?.answers.filter(
                      (answer) => answer.platformId === platformId,
                    ) ?? [];
                  const records = answers.filter(
                    (answer) => answer.status === "completed",
                  ).length;
                  const sourceCount = answers.reduce(
                    (sum, answer) =>
                      sum + answer.citations.length + answer.references.length,
                    0,
                  );
                  return (
                    <article key={platformId}>
                      <img src={platform.logo} alt="" />
                      <div>
                        <strong>{platform.name}</strong>
                        <p>
                          {records}/5 次回答 · {sourceCount} 条来源
                        </p>
                      </div>
                      <span
                        style={
                          {
                            "--geo-agent-platform-progress": `${Math.min(
                              100,
                              records * 20,
                            )}%`,
                          } as CSSProperties
                        }
                      />
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="geo-agent-panel">
              <header>
                <div>
                  <span>DISTRIBUTION SIGNALS</span>
                  <h4>渠道信号概览</h4>
                </div>
                <Activity size={20} />
              </header>
              <div className="geo-agent-distribution-stats">
                <article>
                  <span>引用来源</span>
                  <strong>
                    {sourceRows.filter((source) => source.citations > 0).length}
                  </strong>
                  <p>直接进入答案引用链</p>
                </article>
                <article>
                  <span>检索来源</span>
                  <strong>
                    {
                      sourceRows.filter((source) => source.references > 0)
                        .length
                    }
                  </strong>
                  <p>平台检索时参考</p>
                </article>
                <article>
                  <span>跨平台来源</span>
                  <strong>
                    {
                      sourceRows.filter((source) => source.platforms.size > 1)
                        .length
                    }
                  </strong>
                  <p>被两个以上平台使用</p>
                </article>
              </div>
            </section>
          </div>

          <section className="geo-agent-panel">
            <header>
              <div>
                <span>CITATION DISTRIBUTION</span>
                <h4>检索与引用信源明细</h4>
              </div>
              <small>{sourceRows.length} 个独立来源</small>
            </header>
            <GeoAgentTable
              headers={["信源", "覆盖平台", "答案引用", "检索参考", "核验"]}
              rows={sourceRows.map((source) => [
                source.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    key={source.url}
                  >
                    {source.title}
                    <ExternalLink size={11} />
                  </a>
                ) : (
                  source.title
                ),
                Array.from(source.platforms).join("、"),
                `${source.citations} 次`,
                `${source.references} 次`,
                source.url ? "链接已返回" : "未返回链接",
              ])}
            />
          </section>
        </>
      ) : (
        <>
          <section className="geo-agent-report-hero">
            <div>
              <span>本题可测项表现</span>
              <strong>
                {project.assessment?.totalScore?.toFixed(1) || "—"}
              </strong>
              <p>
                当前等级 {project.assessment?.grade || "—"} ·{" "}
                {project.assessment?.summary || "等待现状评估完成"}
              </p>
            </div>
            <div>
              <span>一个月条件目标区间</span>
              <strong>
                {project.optimizationForecast?.targetLow?.toFixed(1) || "—"}–
                {project.optimizationForecast?.targetHigh?.toFixed(1) || "—"}
              </strong>
              <p>
                目标等级 {project.optimizationForecast?.gradeLow || "—"}–
                {project.optimizationForecast?.gradeHigh || "—"}
              </p>
            </div>
          </section>

          <section className="geo-agent-panel">
            <header>
              <div>
                <span>SEMANTIC DIMENSIONS</span>
                <h4>分维度表现与一个月目标</h4>
              </div>
              <Target size={20} />
            </header>
            <div className="geo-agent-dimension-grid">
              {(project.optimizationForecast?.dimensions ?? []).map(
                (dimension, index) => (
                  <article key={dimension.id}>
                    <header>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{dimension.label}</strong>
                    </header>
                    <div>
                      <span>
                        当前{" "}
                        <strong>{dimension.currentScore.toFixed(1)}</strong>
                      </span>
                      <ArrowRight size={14} />
                      <span>
                        目标{" "}
                        <strong>
                          {dimension.targetLow.toFixed(1)}–
                          {dimension.targetHigh.toFixed(1)}
                        </strong>
                      </span>
                    </div>
                    <p>{dimension.summary}</p>
                    <ul>
                      {dimension.actions.slice(0, 2).map((action) => (
                        <li key={action}>{action}</li>
                      ))}
                    </ul>
                  </article>
                ),
              )}
            </div>
          </section>

          <section className="geo-agent-panel">
            <header>
              <div>
                <span>PHASED ROADMAP</span>
                <h4>分阶段执行路线</h4>
              </div>
              <CalendarDays size={20} />
            </header>
            {roadmapAssumptions.length > 0 && (
              <div className="geo-agent-roadmap-assumptions">
                <strong>路线执行条件</strong>
                <ul>
                  {roadmapAssumptions.map((assumption) => (
                    <li key={assumption}>{assumption}</li>
                  ))}
                </ul>
              </div>
            )}
            {roadmap.length > 0 ? (
              <ol className="geo-agent-timeline">
                {roadmap.map((phase, index) => (
                  <li key={`${phase.phase}-${phase.weeks}-${phase.title}`}>
                    <span>{index + 1}</span>
                    <div>
                      <small>{phase.weeks}</small>
                      <strong>{phase.title}</strong>
                      {phase.actions.length > 0 && (
                        <ul className="geo-agent-roadmap-actions">
                          {phase.actions.map((action) => (
                            <li key={action}>{action}</li>
                          ))}
                        </ul>
                      )}
                      <p className="geo-agent-roadmap-gate">
                        <span>阶段验收</span>
                        {phase.verificationGate}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="geo-agent-empty-copy">
                等待优化评估 API 返回分阶段路线。
              </p>
            )}
          </section>
        </>
      )}
    </>
  );
}

export function AssetsPanel({ project }: { project: GeoProject }) {
  const sourceCount = project.knowledgeBase?.sources.length ?? 0;
  const assetCount = project.knowledgeBase?.assets.length ?? 0;
  const sectionCount = project.knowledgeBase?.sections.length ?? 0;
  const completedAnswerCount =
    project.monitoring?.answers.filter(
      (answer) => answer.status === "completed",
    ).length ?? 0;
  const [searchTerm, setSearchTerm] = useState("");
  const contentAssets = [
    {
      code: "A",
      title: "企业事实模块",
      detail: "由知识库 API 返回的结构化企业事实",
      delivered: sectionCount,
      tone: "purple",
    },
    {
      code: "B",
      title: "可核验来源",
      detail: "由知识库 API 返回的官网与公开信源",
      delivered: sourceCount,
      tone: "green",
    },
    {
      code: "C",
      title: "图文素材",
      detail: "由知识库 API 返回并关联到主题的素材",
      delivered: assetCount,
      tone: "blue",
    },
    {
      code: "D",
      title: "平台回答记录",
      detail: "由监控 API 返回并已完成的回答记录",
      delivered: completedAnswerCount,
      tone: "gold",
    },
  ];
  const assetRows = (
    project.knowledgeBase?.assets.map((asset, index) => ({
      id: asset.id,
      code: `KB-${String(index + 1).padStart(2, "0")}`,
      name: asset.name,
      type: asset.type || "知识库图文",
      channel: asset.source || "企业知识库",
      status: "已归档",
      updatedAt: project.knowledgeBase?.generatedAt,
    })) ?? []
  ).filter(
    (asset) =>
      !searchTerm ||
      `${asset.name}${asset.type}${asset.channel}`
        .toLowerCase()
        .includes(searchTerm.toLowerCase()),
  );

  return (
    <>
      <section className="geo-agent-assets-summary">
        <div>
          <span>语义资产库</span>
          <strong>
            {contentAssets.reduce((sum, item) => sum + item.delivered, 0)}
          </strong>
          <p>项由知识库、问题监控等 API 返回的结构化内容记录</p>
        </div>
        <FileText size={52} />
      </section>

      <div className="geo-agent-assets-grid">
        {contentAssets.map((item) => (
          <article className={`tone-${item.tone}`} key={item.code}>
            <span>{item.code}</span>
            <small>{item.delivered} 项已返回</small>
            <h4>{item.title}</h4>
            <p>{item.detail}</p>
            <em>
              {item.delivered > 0 ? "已同步到对应板块" : "等待 API 返回"}{" "}
              <ArrowRight size={13} />
            </em>
          </article>
        ))}
      </div>

      <section className="geo-agent-panel geo-agent-assets-table-panel">
        <header>
          <div>
            <span>CONTENT ASSET LIBRARY</span>
            <h4>内容资产数据</h4>
          </div>
          <label className="geo-agent-search">
            <Search size={15} />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="搜索资产名称、类型或渠道"
            />
            {searchTerm && (
              <button
                type="button"
                aria-label="清空搜索"
                onClick={() => setSearchTerm("")}
              >
                <X size={13} />
              </button>
            )}
          </label>
        </header>
        <GeoAgentTable
          headers={["编号", "内容资产", "资产类型", "发布渠道", "状态", "更新"]}
          rows={assetRows.map((asset) => [
            asset.code,
            <strong key={asset.id}>{asset.name}</strong>,
            asset.type,
            asset.channel,
            <span
              className={`geo-agent-asset-status status-${asset.status}`}
              key={asset.status}
            >
              {asset.status}
            </span>,
            formatDashboardDate(asset.updatedAt),
          ])}
          emptyText="当前知识库 API 未返回可展示的图文素材。"
        />
      </section>
    </>
  );
}

export function GeoAgentUserDashboard({
  project,
  question,
  categoryLabel,
  active,
  sampleMode,
}: {
  project: GeoProject;
  question: GeoQuestion;
  categoryLabel: string;
  active: boolean;
  sampleMode?: "luxury";
}) {
  const [section, setSection] = useState<DashboardSection>("service");
  const [subpage, setSubpage] = useState<DashboardSubpage>("service-overview");
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuCloseRef = useRef<HTMLButtonElement>(null);
  const pageCopy = SUBPAGE_COPY[subpage];
  const companyName = project.knowledgeBase?.companyName || project.title;
  useLayoutEffect(() => {
    if (mobileNavigationOpen) {
      menuCloseRef.current?.focus({ preventScroll: true });
    }
  }, [mobileNavigationOpen]);
  useEffect(() => {
    if (!mobileNavigationOpen) return;
    const handleMenuKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileNavigationOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const sidebar = menuCloseRef.current?.closest("aside");
      if (!sidebar) return;
      const focusable = Array.from(
        sidebar.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleMenuKeyDown);
    return () => {
      window.removeEventListener("keydown", handleMenuKeyDown);
      menuTriggerRef.current?.focus({ preventScroll: true });
    };
  }, [mobileNavigationOpen]);
  const handleNavigate = (
    nextSection: DashboardSection,
    nextSubpage: DashboardSubpage,
  ) => {
    setSection(nextSection);
    setSubpage(nextSubpage);
    setMobileNavigationOpen(false);
  };
  const updatedLabel = useMemo(() => {
    if (sampleMode === "luxury") return "演示数据 · 不代表实际交付";
    if (project.preview) return "项目数据已同步";
    const source =
      project.optimizationForecast?.generatedAt ||
      project.assessment?.generatedAt ||
      project.updatedAt;
    const value = new Date(source);
    if (Number.isNaN(value.getTime())) return "项目数据已同步";
    return `更新于 ${value.toLocaleDateString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
    })}`;
  }, [
    project.assessment?.generatedAt,
    project.optimizationForecast?.generatedAt,
    project.preview,
    project.updatedAt,
    sampleMode,
  ]);

  return (
    <div
      className="geo-agent-dashboard"
      aria-label={
        sampleMode === "luxury"
          ? "豪华版企业服务工作台样例"
          : "FrontMind Agent 用户角色看板"
      }
    >
      {mobileNavigationOpen && (
        <button
          type="button"
          className="geo-agent-sidebar-backdrop"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setMobileNavigationOpen(false)}
        />
      )}
      <aside
        className={`geo-agent-sidebar ${
          mobileNavigationOpen ? "is-mobile-open" : ""
        }`}
        id="geo-agent-dashboard-navigation"
        role={mobileNavigationOpen ? "dialog" : undefined}
        aria-label={mobileNavigationOpen ? "功能菜单" : undefined}
        aria-modal={mobileNavigationOpen || undefined}
      >
        <header>
          <div>
            <img src="/brand/frontmind-logo.svg" alt="FrontMind" />
            <p>智能品牌优化看板</p>
          </div>
          {mobileNavigationOpen && (
            <button
              type="button"
              className="geo-agent-sidebar-close"
              aria-label="关闭功能菜单"
              onClick={() => setMobileNavigationOpen(false)}
              ref={menuCloseRef}
              autoFocus
            >
              <X size={18} />
            </button>
          )}
        </header>

        <div className="geo-agent-nav-card">
          <span>
            MindPromise 智诺
            {sampleMode === "luxury" ? " · 豪华版样例" : ""}
          </span>
          <nav aria-label="用户看板功能">
            {DASHBOARD_SECTIONS.map((item) => {
              const Icon = item.icon;
              const selected = section === item.id;
              return (
                <div className="geo-agent-nav-group" key={item.id}>
                  <button
                    type="button"
                    className={`geo-agent-nav-section ${
                      selected ? "is-active" : ""
                    }`}
                    onClick={() =>
                      handleNavigate(item.id, DEFAULT_SUBPAGE[item.id])
                    }
                  >
                    <Icon size={17} />
                    <strong>{item.label}</strong>
                  </button>
                  <div className="geo-agent-subnav">
                    {item.pages.map((page) => (
                      <button
                        type="button"
                        className={subpage === page.id ? "is-active" : ""}
                        aria-current={subpage === page.id ? "page" : undefined}
                        onClick={() =>
                          handleNavigate(item.id, page.id as DashboardSubpage)
                        }
                        key={page.id}
                      >
                        {page.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>
        </div>

        <footer>
          <span>{getProjectInitial(companyName)}</span>
          <div>
            <small>{sampleMode === "luxury" ? "样例企业" : "当前企业"}</small>
            <strong>{companyName}</strong>
          </div>
        </footer>
      </aside>

      <main
        className="geo-agent-main"
        inert={mobileNavigationOpen ? true : undefined}
      >
        <header className="geo-agent-ribbon">
          <button
            type="button"
            className="geo-agent-menu-trigger"
            aria-label="打开功能菜单"
            aria-controls="geo-agent-dashboard-navigation"
            aria-expanded={mobileNavigationOpen}
            onClick={() => setMobileNavigationOpen(true)}
            ref={menuTriggerRef}
          >
            <Menu size={19} />
          </button>
          <div>
            <span>
              {sampleMode === "luxury"
                ? "FrontMind 豪华版企业服务工作台 · 样例"
                : "FrontMind 智能品牌优化看板"}
            </span>
            <h3>{companyName}</h3>
          </div>
          <small>{updatedLabel}</small>
        </header>

        <div className="geo-agent-page">
          {section !== "service" && (
            <header className="geo-agent-page-header">
              <div>
                <span>{pageCopy.eyebrow}</span>
                <h2>{pageCopy.title}</h2>
                <p>{pageCopy.description}</p>
              </div>
            </header>
          )}

          {section === "service" && (
            <ServiceOverviewPanel
              project={project}
              question={question}
              active={active}
              sampleMode={sampleMode}
              onNavigate={handleNavigate}
            />
          )}
          {section === "brand" &&
            (subpage === "knowledge-build" ||
              subpage === "knowledge-display") && (
              <KnowledgePanel
                project={project}
                view={
                  subpage === "knowledge-display"
                    ? "knowledge-display"
                    : "knowledge-build"
                }
              />
            )}
          {section === "brand" && subpage === "brand-keywords" && (
            <BrandPanel project={project} question={question} />
          )}
          {section === "intent" && (
            <IntentPanel
              project={project}
              question={question}
              categoryLabel={categoryLabel}
              view={
                subpage === "intent-logic" ? "intent-logic" : "intent-questions"
              }
            />
          )}
          {section === "progress" && (
            <ProgressPanel
              project={project}
              active={active}
              view={
                subpage === "progress-report"
                  ? "progress-report"
                  : "progress-distribution"
              }
            />
          )}
          {section === "assets" && <AssetsPanel project={project} />}
        </div>
      </main>
    </div>
  );
}
