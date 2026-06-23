/* ============================================================
   Style Reminder — Platform Page
   Philosophy: Corporate Trust Editorial
   Keep: structured enterprise diagrams, paper-light surfaces, deep plum and
   muted gold accents, editorial typography, and precise analytical spacing.
   ============================================================ */
import { Link } from "@/components/SafeLink";
import { useReveal } from "@/hooks/useReveal";
import { usePageMeta } from "@/hooks/usePageMeta";
import SectionLabel from "@/components/SectionLabel";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useLang } from "@/contexts/LanguageContext";
import {
  ArrowRight,
  CheckCircle2,
  BarChart3,
  Eye,
  FileSearch,
  Gauge,
  LineChart,
  Monitor,
  Radar,
  Shield,
  Sparkles,
  Zap,
} from "lucide-react";

/* ============================================================
   Platform Page — Academic Consulting Style
   ============================================================ */

const DASHBOARD_IMG =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663550747472/N9P7CTPQUeD653F54XuJ9x/frontmind-platform-scene-L3SYjW437t6Bx2nGygqZCp.webp";
const CTA_IMG =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663550747472/N9P7CTPQUeD653F54XuJ9x/frontmind-cta-scene-gDxNyDFFp4eygiFDZnhDYq.webp";

type PlatformProps = {
  includeChrome?: boolean;
};

export default function Platform({ includeChrome = true }: PlatformProps) {
  const revealHero = useReveal();
  const revealFeatures = useReveal();
  const revealDashboard = useReveal();
  const revealModules = useReveal();
  const revealTech = useReveal();
  const { t, lang } = useLang();

  usePageMeta({
    title: t("FrontMind AI 化路径", "FrontMind AI Transformation Path"),
    description: t(
      "了解 FrontMind 如何从外部理解、前台增长到内部重构，帮助企业建立 AI 原生时代的系统化能力。",
      "Explore how FrontMind helps enterprises build AI-native capabilities from external understanding and front-office growth to internal reconstruction.",
    ),
    lang,
    schemaType: "Service",
  });

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {includeChrome && <Navbar />}

      {/* ═══════════ HERO ═══════════ */}
      <section aria-label="Page Section" className="relative pt-28 pb-16 md:pt-36 md:pb-20 bg-white overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: 'linear-gradient(#3D1560 1px, transparent 1px), linear-gradient(90deg, #3D1560 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
        <div
          ref={revealHero.ref}
          className={`container relative z-10 reveal ${revealHero.isVisible ? "visible" : ""}`}
        >
          <div className="max-w-3xl">
            <SectionLabel text={t("AI 化路径", "AI Transformation Path")} color="purple" />
            <h1
              className="text-4xl md:text-5xl font-bold text-[#1A1A2E] leading-tight mb-6"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              {t(
                <>从外部理解<br />到内部重构</>,
                <>From External Understanding<br />to Internal Reconstruction</>
              )}
            </h1>
            <p className="text-lg text-[#6B7280] leading-relaxed max-w-2xl" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              {t(
                "FrontMind 将 AI 感知审计、语义资产重构、智能体增长、企业级工作流部署和 FDE 入驻整合为一套端到端路径，帮助企业从“会用 AI 工具”走向“具备 AI 原生业务系统”。",
                "FrontMind combines AI perception audits, semantic asset reconstruction, agentic growth, enterprise workflow deployment, and FDE embedding into an end-to-end path from AI tool usage to AI-native business systems.",
              )}
            </p>
          </div>
        </div>
      </section>

      {/* ═══════════ DASHBOARD PREVIEW ═══════════ */}
      <section aria-label="Page Section" className="py-20 md:py-28">
        <div
          ref={revealDashboard.ref}
          className={`container reveal ${revealDashboard.isVisible ? "visible" : ""}`}
        >
          <div className="fm-card overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-[#e5e7eb]">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-yellow-400" />
              <div className="w-3 h-3 rounded-full bg-green-400" />
              <span className="text-xs text-[#9CA3AF] ml-3" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                FrontMind AI Dashboard
              </span>
            </div>
            <img src={DASHBOARD_IMG} alt="FrontMind Platform Dashboard" className="w-full h-auto" />
          </div>
        </div>
      </section>

      {/* ═══════════ KEY FEATURES — Editorial list style ═══════════ */}
      <section aria-label="Page Section" className="py-20 md:py-28 bg-white">
        <div
          ref={revealFeatures.ref}
          className={`container reveal ${revealFeatures.isVisible ? "visible" : ""}`}
        >
          <div className="mb-14">
            <SectionLabel text={t("核心能力", "Core Capabilities")} color="gold" />
            <h2 className="text-3xl md:text-4xl font-bold text-[#1A1A2E] leading-tight" style={{ fontFamily: "'DM Serif Display', serif" }}>
              {t("从认知资产到业务系统", "From Cognitive Assets to Business Systems")}
            </h2>
          </div>

          {/* Two-column editorial feature list instead of uniform cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-16 gap-y-10">
            {[
              {
                icon: <Eye size={20} />,
                title: t("AI 感知审计", "AI Perception Audit"),
                desc: t("识别企业在主流 AI 回答中的出现方式、误读位置、可见度和竞品比较结果。", "Identify how the enterprise appears in major AI answers, including misreading, visibility, and competitor comparison."),
              },
              {
                icon: <Radar size={20} />,
                title: t("客户入口判断", "Customer Entry Intelligence"),
                desc: t("判断用户如何把第一轮筛选交给 AI，并找到企业必须占据的关键问答场景。", "Understand how users hand first-round filtering to AI and identify the key answer scenarios the enterprise must occupy."),
              },
              {
                icon: <FileSearch size={20} />,
                title: t("语义资产重构", "Semantic Asset Reconstruction"),
                desc: t("将官网、案例、研究、知识库和专家观点组织成 AI 可理解、可引用、可持续治理的资产。", "Organize websites, cases, research, knowledge bases, and expert views into AI-readable and governable assets."),
              },
              {
                icon: <Shield size={20} />,
                title: t("模型漂移治理", "Model Drift Governance"),
                desc: t("持续监测模型升级后的答案概率、引用频率和语义漂移，避免策略随版本变化归零。", "Monitor answer probability, citation frequency, and semantic drift after model updates so strategy does not reset with each version."),
              },
              {
                icon: <LineChart size={20} />,
                title: t("增长智能体编排", "Growth Agent Orchestration"),
                desc: t("让获客、营销和客服智能体沿着同一套企业理解识别意图、触达客户并沉淀线索。", "Orchestrate acquisition, marketing, and service agents from the same enterprise understanding to detect intent and retain leads."),
              },
              {
                icon: <Sparkles size={20} />,
                title: t("FDE 部署复盘", "FDE Deployment Review"),
                desc: t("由 FDE 与企业团队共同推进场景上线、监测效率质量并形成下一轮流程优化。", "FDEs and enterprise teams launch scenarios, monitor efficiency and quality, and shape the next workflow iteration."),
              },
            ].map((feature, i) => (
              <div key={i} className="flex gap-5 group">
                <div className="shrink-0 mt-1">
                  <div className="fm-icon-panel w-10 h-10 flex items-center justify-center text-[#3D1560]">
                    {feature.icon}
                  </div>
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#1A1A2E] mb-1" style={{ fontFamily: "'DM Serif Display', serif" }}>{feature.title}</h3>
                  <p className="text-sm text-[#6B7280] leading-relaxed" style={{ fontFamily: "'DM Sans', sans-serif" }}>{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ PLATFORM MODULES — Horizontal editorial ═══════════ */}
      <section aria-label="Page Section" className="py-20 md:py-28">
        <div
          ref={revealModules.ref}
          className={`container reveal ${revealModules.isVisible ? "visible" : ""}`}
        >
          <div className="mb-14">
            <SectionLabel text={t("系统架构", "System Architecture")} color="purple" />
            <h2 className="text-3xl md:text-4xl font-bold text-[#1A1A2E] leading-tight" style={{ fontFamily: "'DM Serif Display', serif" }}>
              {t("为企业 AI 原生能力而设计", "Designed for Enterprise AI-Native Capability")}
            </h2>
          </div>

          <div className="space-y-5">
            {[
              {
                icon: <Monitor size={22} />,
                num: "01",
                title: t("外部理解层", "External understanding layer"),
                desc: t("追踪企业在 AI 搜索、智能问答、行业推荐和竞品比较中的呈现方式，形成认知基线。", "Track how the enterprise appears across AI search, Q&A, industry recommendation, and competitor comparison to form a cognition baseline."),
                metrics: [t("AI 感知审计", "AI perception audit"), t("GEO 语义资产", "GEO semantic assets"), t("答案概率监测", "Answer probability")],
              },
              {
                icon: <Gauge size={22} />,
                num: "02",
                title: t("前台增长层", "Front-office growth layer"),
                desc: t("让智能体基于企业语义资产识别需求信号、触达客户、承接回复并沉淀增长知识。", "Let agents use semantic assets to identify demand signals, engage customers, route replies, and retain growth memory."),
                metrics: [t("获客智能体", "Acquisition agents"), t("营销触达", "Marketing engagement"), t("客服承接", "Service routing")],
              },
              {
                icon: <BarChart3 size={22} />,
                num: "03",
                title: t("内部重构层", "Internal reconstruction layer"),
                desc: t("通过企业级工作流部署和 FDE 入驻，把 AI 能力接入知识库、系统接口和真实业务流程。", "Use enterprise workflow deployment and FDE embedding to connect AI capability with knowledge bases, system interfaces, and real operations."),
                metrics: [t("工作流部署", "Workflow deployment"), t("系统协同", "System coordination"), t("FDE 入驻", "FDE embedding")],
              },
            ].map((module) => (
              <div key={module.num} className="fm-card p-8 flex flex-col md:flex-row gap-8 items-start">
                <div className="flex items-center gap-4 md:w-48 shrink-0">
                  <span className="text-[#C5A24D] text-xs font-bold tracking-[0.2em]" style={{ fontFamily: "'DM Sans', sans-serif" }}>{module.num}</span>
                  <div className="w-5 h-px bg-[#C5A24D]/50" />
                  <div className="text-[#3D1560]">{module.icon}</div>
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-[#1A1A2E] mb-2" style={{ fontFamily: "'DM Serif Display', serif" }}>{module.title}</h3>
                  <p className="text-sm text-[#6B7280] leading-relaxed mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>{module.desc}</p>
                  <div className="flex flex-wrap gap-3">
                    {module.metrics.map((m, j) => (
                      <span key={j} className="fm-chip-muted gap-1.5 px-3 py-1.5 text-xs" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                        <CheckCircle2 size={11} className="text-[#C5A24D]" />
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ TECHNOLOGY ═══════════ */}
      <section aria-label="Page Section" className="py-20 md:py-28 bg-white">
        <div
          ref={revealTech.ref}
          className={`container reveal ${revealTech.isVisible ? "visible" : ""}`}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <SectionLabel text={t("技术", "Technology")} color="gold" />
              <h2 className="text-3xl md:text-4xl font-bold text-[#1A1A2E] leading-tight mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>
              {t("由科研团队与 FDE 部署共同驱动", "Powered by Research and FDE Deployment")}
              </h2>
              <p className="text-sm text-[#6B7280] leading-relaxed mb-8" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                {t(
                  "依托香港中文大学（深圳）数据科学学院智能决策实验室的科研能力，FrontMind 将多智能体、模型偏好监测、业务流程部署和 FDE 入驻结合起来，减少业务与技术之间的落地鸿沟。",
                  "Backed by the Intelligent Decision-Making Laboratory at CUHK-Shenzhen's School of Data Science, FrontMind combines multi-agent systems, model preference monitoring, workflow deployment, and FDE embedding.",
                )}
              </p>
              <div className="space-y-4">
                {[
                  t("企业级 AI 咨询与模型偏好监测", "Enterprise AI consulting and model preference monitoring"),
                  t("多智能体获客、营销与客服协同", "Multi-agent acquisition, marketing, and service coordination"),
                  t("企业知识库、数据与流程接入", "Enterprise knowledge, data, and workflow integration"),
                  t("硕博 FDE 驻场部署与复盘", "Graduate-level FDE deployment and review"),
                ].map((tech, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Zap size={16} className="text-[#C5A24D]" />
                    <span className="text-sm font-medium text-[#1A1A2E]" style={{ fontFamily: "'DM Sans', sans-serif" }}>{tech}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Tech Visual — Asymmetric stat blocks */}
            <div className="relative">
              <div className="bg-[#f5f5f7] p-10">
                <div className="grid grid-cols-2 gap-px bg-[#e5e7eb]">
                  {[
                    { label: t("监测 AI 模型", "AI Models Monitored"), value: "10+" },
                    { label: t("每日数据点", "Data Points / Day"), value: "1M+" },
                    { label: t("语义响应", "Semantic Response"), value: "<5s" },
                    { label: t("准确率", "Accuracy Rate"), value: "97%" },
                  ].map((stat, i) => (
                    <div key={i} className="bg-white p-6 text-center">
                      <div className="text-2xl font-bold text-[#3D1560] mb-1" style={{ fontFamily: "'DM Serif Display', serif" }}>{stat.value}</div>
                      <div className="text-xs text-[#6B7280]" style={{ fontFamily: "'DM Sans', sans-serif" }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ CTA ═══════════ */}
      <section aria-label="Page Section" className="relative overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${CTA_IMG})` }} />
        <div className="absolute inset-0 bg-[#1A0A2E]/80" />
        <div className="absolute top-10 right-10 w-64 h-64 rounded-full border border-white/5 animate-float" />
        <div className="absolute bottom-10 right-40 w-40 h-40 rounded-full border border-[#C5A24D]/10 animate-float" style={{ animationDelay: '2s' }} />
        <div className="container relative z-10 py-20 md:py-28">
          <div className="max-w-2xl">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight mb-4" style={{ fontFamily: "'DM Serif Display', serif" }}>
            {t("建立企业 AI 原生业务系统", "Build an AI-Native Business System")}
            </h2>
            <p className="text-lg text-white/70 mb-8" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              {t("与 FrontMind 讨论如何让 AI 理解企业、增长业务，并嵌入组织流程。", "Speak with FrontMind about helping AI understand the enterprise, grow the business, and embed into workflows.")}
            </p>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-[#C5A24D] text-[#1A1A2E] text-sm font-bold rounded-md hover:bg-[#D4B76A] transition-colors no-underline"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              {t("联系顾问团队", "Contact the Advisory Team")} <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {includeChrome && <Footer />}
    </div>
  );
}
