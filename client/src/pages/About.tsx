/* ============================================================
   About Page — Aligned with site-wide design system
   Uses: container, SectionLabel, bg-white/bg-[#FAFAFA] alternation,
   same typography and spacing as ProductIntro & Solutions.
   ============================================================ */
import { Link } from "@/components/SafeLink";
import { useReveal } from "@/hooks/useReveal";
import { usePageMeta } from "@/hooks/usePageMeta";
import SectionLabel from "@/components/SectionLabel";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useLang } from "@/contexts/LanguageContext";
import { ArrowRight, CheckCircle2 } from "lucide-react";

const HERO_IMG = "/about/cuhk-ai-lab-hero.webp";
const CTA_BG_IMG =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663567004319/FRgjGX8Da7KscfHcwTaFCq/cta-geometric-a34vAZt6eBGYhkxnp6tcD8.webp";
const LAB_URL = import.meta.env.VITE_FRONTMIND_LAB_URL || "/research";

type AboutProps = {
  includeChrome?: boolean;
};

export default function About({ includeChrome = true }: AboutProps) {
  const revealHero = useReveal();
  const revealBelief = useReveal();
  const revealOrigin = useReveal();
  const revealTeam = useReveal();
  const revealMethod = useReveal();
  const revealCta = useReveal();
  const { t, lang } = useLang();

  usePageMeta({
    title: t("关于 FrontMind", "About FrontMind"),
    description: t(
      "了解 FrontMind 的港中深科研背景、硕博 FDE 团队、企业 AI 化方法论与端到端部署能力。",
      "Learn about FrontMind's CUHK-Shenzhen research roots, graduate-level FDE team, enterprise AI methodology, and end-to-end deployment capability.",
    ),
    lang,
    schemaType: "AboutPage",
  });

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {includeChrome && <Navbar />}

      {/* ═══════════ HERO ═══════════ */}
      <section className="bg-white pt-24 pb-12 md:pt-32 md:pb-20 overflow-hidden">
        <div ref={revealHero.ref} className={`container reveal ${revealHero.isVisible ? "visible" : ""}`}>
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[0.78fr_1.22fr] xl:gap-10">
            <div>
              <SectionLabel text={t("关于我们", "About Us")} color="purple" />
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-[2.75rem] font-bold text-[#1A1A2E] leading-[1.2] mb-5" style={{ fontFamily: "'DM Serif Display', serif" }}>
                {t(
                  <>科研驱动的 GEO 企业服务</>,
                  <>Research-Driven GEO<br />Enterprise Services</>
                )}
              </h1>
              <p className="text-base md:text-lg text-[#4B5563] max-w-lg mb-7 leading-relaxed" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                {t(
                  <span>至2026年6月，FrontMind 超前智能是市场<span className="font-bold text-[#3D1560]">唯一</span>具有高校独立实验室与深层次科研能力的GEO正规军，以科研级严谨度帮助企业完成从战略认知、用例诊断到业务场景上线的全过程。</span>,
                  <span>As of June 2026, FrontMind is the <span className="font-bold text-[#3D1560]">only</span> GEO team with an independent university lab and deep research capabilities, helping enterprises complete the full journey from strategic cognition to business deployment with research-grade rigor.</span>
                )}
              </p>
              <div className="flex flex-wrap gap-4">
                <a
                  href={LAB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-[#3D1560] text-white text-sm font-semibold hover:bg-[#2D1050] transition-colors no-underline"
                  style={{ fontFamily: "'DM Sans', sans-serif" }}
                >
                  {t("进入实验室页面", "Visit Lab Page")}
                  <ArrowRight size={16} />
                </a>
              </div>
            </div>

            {/* Right: Hero Image */}
            <div className="relative hidden lg:block">
              <div className="relative ml-auto w-full max-w-[820px] border border-[#E5E7EB] bg-white">
                <div className="relative aspect-[16/9] overflow-hidden bg-white">
                  <img
                    src={HERO_IMG}
                    alt={t("GEO学术追踪", "GEO Academic Tracking")}
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
            </div>

            {/* Mobile: Hero Image */}
            <div className="lg:hidden mt-4 border border-[#E5E7EB] bg-white">
              <div className="relative aspect-[16/9] overflow-hidden">
                <img
                  src={HERO_IMG}
                  alt={t("GEO学术追踪", "GEO Academic Tracking")}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ BELIEF — What We Believe ═══════════ */}
      <section className="border-t border-b border-[#E5E7EB] bg-[#FAFBFF] py-10 md:py-14">
        <div className="container">
          <blockquote className="max-w-4xl mx-auto text-center">
            <p className="text-lg md:text-xl leading-relaxed text-[#374151] italic" style={{ fontFamily: "'DM Serif Display', serif" }}>
              &ldquo;{t(
                "企业员工个人会用 AI，不等于企业能提效。AI 化最大的障碍不是缺少工具，而是缺少从战略认知到系统部署的端到端落地能力。",
                "Individual employees using AI does not equal enterprise efficiency. The biggest barrier is not a lack of tools, but the absence of end-to-end deployment capability."
              )}&rdquo;
            </p>
          </blockquote>
        </div>
      </section>

      {/* ═══════════ ACADEMIC ORIGIN ═══════════ */}
      <section className="py-16 md:py-24">
        <div ref={revealOrigin.ref} className={`container reveal ${revealOrigin.isVisible ? "visible" : ""}`}>
          <div className="mb-12 max-w-3xl">
            <SectionLabel text={t("团队背景", "Team Background")} color="purple" />
            <h2 className="mb-4 text-3xl font-bold leading-tight text-[#1A1A2E] md:text-4xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
              {t("科研能力 × 产业经验 × 驻场落地", "Research Capability × Industry Experience × On-site Deployment")}
            </h2>
            <p className="text-base leading-relaxed text-[#4B5563]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              {t(
                "FrontMind 孵化于香港中文大学（深圳）数据科学学院AI智能决策实验室，汇聚来自香港中文大学（深圳）、加州理工、香港大学、清华大学、纽约大学、上海交通大学等顶尖高校的人才，并拥有亚马逊、谷歌、字节跳动等头部厂商的技术背景，依托港中深独角兽计划、深港创新创业孵化中心等创新生态成长。",
                "FrontMind grew out of the AI Intelligent Decision-Making Laboratory at CUHK-Shenzhen's School of Data Science, bringing together talent from CUHK-Shenzhen, Caltech, HKU, Tsinghua, NYU, SJTU and other top universities, with technical backgrounds from Amazon, Google, ByteDance and other leading tech companies, supported by the CUHK-Shenzhen Unicorn Program and Shenzhen-Hong Kong Innovation Incubator."
              )}
            </p>
          </div>

          {/* Cards grid layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                icon: "🏛️",
                title: t("孵化来源", "Incubation"),
                desc: t("香港中文大学（深圳）数据科学学院智能决策实验室", "CUHK-Shenzhen School of Data Science, Intelligent Decision-Making Lab"),
                tags: [t("GEO", "GEO"), t("可信 AI", "Trustworthy AI"), t("在线决策", "Online Decision"), t("强化学习", "Reinforcement Learning"), t("控制优化", "Control Optimization")],
              },
              {
                icon: "🎓",
                title: t("人才支撑", "Talent"),
                desc: t("QS 数据科学排名全球第一项目硕博团队，来自港中深、加州理工、香港大学、清华大学等", "QS World No.1 Data Science program graduate team from CUHK-Shenzhen, Caltech, HKU, Tsinghua, etc."),
                tags: [t("硕博 FDE 驻派", "Graduate FDE Embed"), t("技术 + 咨询 + 业务", "Tech + Consulting + Business")],
              },
              {
                icon: "🌐",
                title: t("创新生态", "Ecosystem"),
                desc: t("深港创新创业孵化中心 · 港中深独角兽计划 · 第十四届中国创新创业大赛获奖", "Shenzhen-Hong Kong Incubator · CUHK-Shenzhen Unicorn Program · 14th China Innovation Competition Award"),
                tags: [t("产学研结合", "Industry-Academia"), t("创业大赛获奖", "Competition Award")],
              },
              {
                icon: "🚀",
                title: t("部署模式", "Deployment Model"),
                desc: t("硕博 FDE 驻派企业，推动企业级 AI 工作流从诊断到上线的端到端落地", "Graduate FDEs embed on-site to drive end-to-end enterprise AI workflow deployment"),
                tags: [t("驻场共创", "On-site Co-creation"), t("持续迭代", "Continuous Iteration"), t("结果复盘", "Result Review")],
              },
            ].map((item) => (
              <article key={item.title} className="group relative p-8 bg-white border border-[#E5E7EB] hover:border-[#3D1560]/30 hover:shadow-lg transition-all duration-300">
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[#3D1560] to-[#3D1560]/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="text-3xl mb-4">{item.icon}</div>
                <h3 className="text-xl font-bold text-[#1A1A2E] mb-3" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed text-[#4B5563] mb-4" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {item.desc}
                </p>
                <div className="flex flex-wrap gap-2">
                  {item.tags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1.5 bg-[#F5F3F9] px-3 py-1.5 text-xs text-[#3D1560] font-medium rounded-sm">
                      <CheckCircle2 size={11} className="text-[#3D1560]" />
                      {tag}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>



      {/* ═══════════ METHOD TRUST ═══════════ */}
      <section className="bg-white py-16 md:py-24">
        <div ref={revealMethod.ref} className={`container reveal ${revealMethod.isVisible ? "visible" : ""}`}>
          <div className="mb-10 max-w-3xl">
            <SectionLabel text={t("方法体系", "Methodology")} color="purple" />
            <h2 className="mb-4 text-3xl font-bold leading-tight text-[#1A1A2E] md:text-4xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
              {t("科研驱动的方法体系", "A Research-Driven Methodology")}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-[#E5E7EB] overflow-hidden">
            {[
              {
                num: "01",
                title: t("研究来源", "Research Origin"),
                desc: t(
                  "从高校实验室到企业 AI 化系统。将自然语言处理、多智能体系统、模型偏好监测与企业级流程部署结合，形成面向 AI 原生时代的企业增长方法。",
                  "From research lab to enterprise AI systems. Combining NLP, multi-agent systems, model preference monitoring, and enterprise workflow deployment."
                ),
              },
              {
                num: "02",
                title: t("产业验证", "Market Validation"),
                desc: t(
                  "服务从认知到落地的完整链路。关注客户入口迁移、增长链路迁移和组织流程迁移，帮助企业形成 AI 化闭环。",
                  "Serving the full path from cognition to deployment. Focusing on three core migrations to close the enterprise AI loop."
                ),
              },
              {
                num: "03",
                title: t("科研严谨度", "Research Rigor"),
                desc: t(
                  "以科研严谨度确保交付质量，围绕科研级内容、精准信源、系统部署与结果复盘建立企业长期 AI 能力。",
                  "Ensuring delivery quality with research rigor, building long-term enterprise AI capability through research-grade content, precise sources, system deployment, and result review."
                ),
              },
            ].map((item) => (
              <article key={item.num} className="p-6 md:p-8 bg-white border-b md:border-b-0 md:border-r border-[#E5E7EB] last:border-r-0 last:border-b-0">
                <span className="text-2xl font-light text-[#3D1560]/30 block mb-3" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  {item.num}
                </span>
                <h3 className="text-lg font-bold text-[#1A1A2E] mb-3" style={{ fontFamily: "'DM Serif Display', serif" }}>
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed text-[#4B5563]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  {item.desc}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ CTA ═══════════ */}
      <section aria-label="Call to Action" className="relative overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${CTA_BG_IMG})` }}
        />
        <div className="absolute inset-0 bg-[#1A0A2E]/85" />
        <div
          ref={revealCta.ref}
          className={`container relative z-10 py-16 md:py-24 reveal ${revealCta.isVisible ? "visible" : ""}`}
        >
          <div className="max-w-2xl">
            <h2
              className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight mb-4"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              {t("共同构建企业 AI 原生能力", "Build Enterprise AI-Native Capability Together")}
            </h2>
            <p
              className="text-sm md:text-base text-white/60 mb-8 leading-relaxed"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              {t(
                "如果你正在思考企业如何从 AI 搜索、智能体增长走向真实流程部署，FrontMind 可以与你共同定义从认知到落地的路径。",
                "If you are considering how the enterprise can move from AI search and agentic growth to real workflow deployment, FrontMind can help define the path."
              )}
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-[#3D1560] text-sm font-bold hover:bg-[#F5F3F9] transition-colors no-underline"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                {t("联系我们", "Contact Us")} <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {includeChrome && <Footer />}
    </div>
  );
}
