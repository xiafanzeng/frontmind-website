import { useReveal } from "@/hooks/useReveal";
import { usePageMeta } from "@/hooks/usePageMeta";
import SectionLabel from "@/components/SectionLabel";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Link } from "@/components/SafeLink";
import { useLang } from "@/contexts/LanguageContext";
import {
  AnimatedTimeline,
  CountUpNumber,
  FlipCard,
  BeforeAfterSlider,
} from "@/components/AnimatedWidgets";
import {
  ArrowRight,
  CheckCircle2,
  Layers,
  Globe,
  Shield,
} from "lucide-react";
import MethodologyFlow from "@/components/MethodologyFlow";

export function SolutionsSections({ includeCta = true, embedded = false }: { includeCta?: boolean; embedded?: boolean }) {
  const reveal = useReveal();
  const { lang } = useLang();
  const t = (zh: string, en: string) => (lang === "en" ? en : zh);



  const deploySteps = [
    {
      number: "1",
      title: t("明确 AI 化优先场景", "Identify AI Priority Scenarios"),
      description: t("围绕企业目标、客户入口、增长痛点和流程阻塞进行诊断。", "Diagnose around business goals, customer entry points, and process bottlenecks."),
      details: [t("AI 战略诊断", "AI Strategy Diagnosis"), t("客户入口梳理", "Customer Entry Mapping"), t("数据条件评估", "Data Readiness Assessment")],
    },
    {
      number: "2",
      title: t("重构语义资产与智能体流程", "Reconstruct Semantic Assets & Agent Workflows"),
      description: t("将企业知识转化为 AI 可读取、可执行的资产。", "Turn enterprise knowledge into AI-readable assets."),
      details: [t("语料与信源重构", "Corpus reconstruction"), t("智能体流程配置", "Agent workflows"), t("系统接口对接", "System integration")],
    },
    {
      number: "3",
      title: t("FDE 入驻推动上线与复盘", "FDE Onboarding & Launch"),
      description: t("驻派硕博 FDE 与企业团队共同推进场景上线。", "Deploy PhD/Master FDEs to drive scenario launches."),
      details: [t("场景上线", "Scenario launch"), t("监测与复盘", "Monitoring & review"), t("AI 能力沉淀", "AI capability building")],
    },
    {
      number: "4",
      title: t("持续迭代与组织升级", "Continuous Iteration & Org Upgrade"),
      description: t("基于数据反馈优化流程，将 AI 能力沉淀为组织资产。", "Optimize based on data feedback, build AI into organizational assets."),
      details: [t("效果分析", "Impact analysis"), t("流程优化", "Process optimization"), t("组织升级", "Org upgrade")],
    },
  ];

  const industries = [
    { front: { icon: "💻", title: t("企业 SaaS", "Enterprise SaaS"), description: t("技术白皮书、解决方案文档、ROI 分析和竞争对比", "Technical white papers, solution docs, ROI analysis") }, back: { details: [t("AI 引用优化", "AI citation optimization"), t("竞品对比监测", "Competitor monitoring"), t("解决方案推荐位", "Solution recommendation")], cta: t("查看案例", "View case") } },
    { front: { icon: "🛒", title: t("电商与零售", "E-Commerce & Retail"), description: t("产品推荐、购买指南和场景化解决方案", "Product recommendations and buying guides") }, back: { details: [t("AI 购买决策优化", "AI purchase optimization"), t("场景化内容构建", "Scenario content"), t("转化率提升", "Conversion boost")], cta: t("查看案例", "View case") } },
    { front: { icon: "🛡️", title: t("监管行业", "Regulated Industries"), description: t("具有权威数据来源的合规内容和实时风控", "Compliance content with authoritative data sources") }, back: { details: [t("法律/医疗/金融合规", "Legal/Medical/Finance compliance"), t("实时风险监测", "Real-time risk monitoring"), t("权威信源植入", "Authoritative source placement")], cta: t("查看案例", "View case") } },
    { front: { icon: "✈️", title: t("旅游与酒店", "Travel & Hospitality"), description: t("目的地推荐、用户评价和预订集成", "Destination recommendations and booking integration") }, back: { details: [t("AI 搜索到转化", "AI search-to-conversion"), t("用户评价优化", "Review optimization"), t("预订链路整合", "Booking integration")], cta: t("查看案例", "View case") } },
    { front: { icon: "📍", title: t("本地服务", "Local Services"), description: t("基于位置的内容优化，结合评价和预订", "Location-based content optimization") }, back: { details: [t("本地化 AI 推荐", "Localized AI recommendations"), t("评价管理", "Review management"), t("预约转化优化", "Booking conversion")], cta: t("查看案例", "View case") } },
    { front: { icon: "⚡", title: t("内容与 IP", "Content & IP"), description: t("课程选择、活动推荐和 IP 内容优化", "Course selection, event recommendations, IP content") }, back: { details: [t("AI 推荐引擎优化", "AI recommendation optimization"), t("内容分发策略", "Content distribution"), t("IP 价值放大", "IP value amplification")], cta: t("查看案例", "View case") } },
  ];

  const beforeItems = [
    t("用户通过搜索、官网和朋友推荐了解企业", "Users discover brands through search, websites, and referrals"),
    t("企业被动获客，依赖广告投放与人工触达", "Passive acquisition relying on ads and manual outreach"),
    t("流程多为人工处理，数据割裂且难以协同", "Manual processes with siloed data"),
    t("品牌信息由企业自己控制和发布", "Brand messaging controlled by the company"),
  ];
  const afterItems = [
    t("AI 掌握企业解释权和筛选权", "AI controls brand interpretation and filtering"),
    t("智能体识别意向、触达客户、承接回复", "Agents identify intent, reach customers, handle replies"),
    t("企业需要端到端落地能力", "End-to-end deployment capability required"),
    t("品牌认知由 AI 模型重新定义和分发", "Brand perception redefined by AI models"),
  ];

  return (
    <>
      {!embedded && <Navbar />}
      <main className={embedded ? "" : "pt-20"}>
        {/* Migration Paths - 放在最前面 */}
        <section className="py-20 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-12" ref={reveal.ref}>
              <SectionLabel text={t("三大迁移路径", "Three Migration Paths")} />
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mt-4">
                {t("AI 正在同时迁移客户入口、增长链路与组织流程", "AI is Migrating Customer Entry, Growth, and Operations")}
              </h2>
              <p className="mt-4 text-base text-slate-600 max-w-2xl mx-auto">
                {t("企业面临的不是单一变化，而是三条路径的同步迁移。", "Enterprises face not a single change, but three simultaneous migrations.")}
              </p>
            </div>
            <div ref={reveal.ref}>
              <BeforeAfterSlider
                beforeTitle={t("过去", "Before")}
                afterTitle={t("现在", "Now")}
                beforeItems={beforeItems}
                afterItems={afterItems}
                beforeImage="/images/before-traditional.webp"
                afterImage="/images/after-ai-driven.webp"
              />
            </div>
          </div>
        </section>

        {/* Core Systems */}
        <section className="py-20 bg-slate-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-16" ref={reveal.ref}>
              <SectionLabel text={t("核心系统", "Core Systems")} />
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mt-4">
                {t("理解、增长、嵌入", "Understand, Grow, Embed")}
              </h2>
              <p className="mt-4 text-base text-slate-600 max-w-2xl mx-auto">
                {t("从外部认知重建到内部流程升级，FrontMind 为企业提供完整的 AI 原生转型路径。", "From external perception rebuilding to internal workflow upgrade, FrontMind provides a complete AI-native transformation path.")}
              </p>
            </div>

            {/* 核心方法论动效展示 */}
            <div className="mb-16">
              <MethodologyFlow lang={lang} />
            </div>

            {/* 核心产品卡片 */}
            <div ref={reveal.ref}>
              <div className="text-center mb-10">
                <SectionLabel text={t("核心产品", "Core Products")} />
              </div>
              <div className="grid md:grid-cols-3 gap-6">
                {[
                  {
                    num: "01",
                    phase: t("理解", "Understand"),
                    name: "MindPromise 智诺",
                    desc: t("让 AI 正确理解企业", "Let AI correctly understand your business"),
                    detail: t("解决品牌内容碎片化、AI 误读和语义不统一问题。通过 AI 感知审计、论文级内容制作和权威信源监测，让企业先被 AI 正确解释。", "Solve brand content fragmentation and AI misinterpretation through perception audits, academic content creation, and source monitoring."),
                    href: "/mindpromise",
                  },
                  {
                    num: "02",
                    phase: t("增长", "Grow"),
                    name: "MindReach 智达",
                    desc: t("让 AI 主动增长业务", "Let AI actively grow business"),
                    detail: t("覆盖获客、营销与客服智能体，识别意向客户、主动触达并沉淀可运营线索。", "Cover acquisition, marketing, and service agents to identify intent customers and capture actionable leads."),
                    href: "/mindreach",
                  },
                  {
                    num: "03",
                    phase: t("嵌入", "Embed"),
                    name: "MindNexus 智汇",
                    desc: t("企业级 AI 工作流部署与 FDE 入驻", "Enterprise AI workflow and FDE deployment"),
                    detail: t("面向企业级 AI 工作流部署、系统协同和 FDE 入驻，推动端到端场景上线。", "Enterprise-grade AI workflow deployment, system orchestration, and FDE onboarding."),
                    href: "/mindnexus",
                  },
                ].map((product) => (
                  <Link
                    key={product.num}
                    href={product.href}
                    className="group flex flex-col border border-slate-200 bg-white p-6 md:p-8 transition-all duration-300 hover:border-[#3D1560]/30 hover:shadow-lg no-underline h-full"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-sm font-bold text-[#3D1560]">{product.num} {product.phase}</span>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-[#3D1560] transition-colors">{product.name}</h3>
                    <p className="text-sm font-semibold text-slate-700 mb-3">{product.desc}</p>
                    <p className="text-sm text-slate-500 leading-relaxed mb-0">{product.detail}</p>
                    <div className="mt-auto pt-4">
                      <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#3D1560] group-hover:gap-2 transition-all">
                        {t("了解详情", "Learn More")} <ArrowRight size={14} />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>



        {/* Industry Applications */}
        <section className="py-20 bg-slate-50">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="text-center mb-12" ref={reveal.ref}>
              <SectionLabel text={t("行业应用", "Industry Applications")} />
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mt-4">
                {t("为每个行业量身定制", "Tailored for Every Industry")}
              </h2>

            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6" ref={reveal.ref}>
              {industries.map((ind, i) => (
                <FlipCard key={i} front={ind.front} back={ind.back} />
              ))}
            </div>
          </div>
        </section>
      </main>
      {!embedded && <Footer />}
    </>
  );
}

export default function Solutions() {
  const { t, lang } = useLang();

  usePageMeta({
    title: t("FrontMind 解决方案 - AI 原生企业增长路径", "FrontMind Solutions - AI-Native Enterprise Growth"),
    description: t(
      "理解、增长、嵌入三段 AI 化路径，覆盖 GEO 品牌认知、智能体增长、企业级 AI 工作流部署与 FDE 入驻。",
      "Understand, grow, and embed AI capabilities across GEO brand cognition, agentic growth, enterprise AI workflows, and FDE deployment.",
    ),
    lang,
    canonicalPath: "/solutions",
    image: "/images/after-ai-driven.webp",
    schemaType: "Service",
  });

  return <SolutionsSections includeCta={true} embedded={false} />;
}
