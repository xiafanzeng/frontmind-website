import { Link } from "@/components/SafeLink";
import { useEffect, useState } from "react";
import { useReveal } from "@/hooks/useReveal";
import { usePageMeta } from "@/hooks/usePageMeta";
import SectionLabel from "@/components/SectionLabel";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import VisitorStats from "@/components/VisitorStats";
import { useLang } from "@/contexts/LanguageContext";
import { SolutionsSections } from "./Solutions";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const HERO_METHOD_WIDE_IMG = "/home/agent-methodology-wide.webp";
const HERO_CUHK_QS_WIDE_IMG = "/home/cuhk-qs-business-analytics-wide.webp";
const HERO_CUHK_VISIT_IMG = "/home/chaozhou-entrepreneurs-cuhk-visit.webp";
const HERO_CUHK_ANNIVERSARY_IMG = "/home/cuhk-innovation-10th-anniversary.webp";
const HERO_COMPETITION_IMG = "/home/china-innovation-competition-qianhai.webp";
const CUHK_SHENZHEN_LOGO_IMG = "/home/cuhk-shenzhen-logo.webp";
const INCUBATOR_LOGO_IMG = "/home/shenzhen-hongkong-incubator-logo.webp";
const CTA_IMG =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663567004319/FRgjGX8Da7KscfHcwTaFCq/cta-geometric-a34vAZt6eBGYhkxnp6tcD8.webp";

// ─── Institutional Logos Bar ───
function StatsBar() {
  const partners = [
    {
      image: CUHK_SHENZHEN_LOGO_IMG,
      alt: "香港中文大学（深圳） The Chinese University of Hong Kong, Shenzhen",
      maxWidth: "max-w-[460px]",
      imageClassName: "scale-x-[1.04]",
      width: 1956,
      height: 378,
    },
    {
      image: INCUBATOR_LOGO_IMG,
      alt: "深港创新创业孵化中心 Shenzhen-Hong Kong Innovation & Entrepreneurship Incubator",
      maxWidth: "max-w-[400px]",
      imageClassName: "",
      width: 2168,
      height: 290,
    },
  ];

  return (
    <div className="border-t border-b border-[#E5E7EB] bg-white">
      <div className="container py-5 md:py-6">
        <div className="grid grid-cols-1 divide-y divide-[#E5E7EB] md:grid-cols-2 md:divide-x md:divide-y-0">
          {partners.map((partner) => (
            <div key={partner.image} className="flex min-h-[80px] items-center justify-center px-4 py-3 md:min-h-[90px] md:px-8">
              <img
                src={partner.image}
                alt={partner.alt}
                width={partner.width}
                height={partner.height}
                className={`block h-auto w-full origin-center ${partner.maxWidth} ${partner.imageClassName} object-contain`}
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Hero Image Carousel ───
function HeroNewsWall() {
  const { t } = useLang();
  const [activeSlide, setActiveSlide] = useState(0);
  const slides = [
    { image: HERO_CUHK_QS_WIDE_IMG, alt: t("香港中文大学深圳 QS 排名海报", "CUHK-Shenzhen QS ranking poster"), fit: "cover" },
    { image: HERO_CUHK_VISIT_IMG, alt: t("潮汕青年企业家到访港中深", "Chaozhou entrepreneurs visiting CUHK-Shenzhen"), fit: "contain" },
    { image: HERO_CUHK_ANNIVERSARY_IMG, alt: t("创新中心十周年庆典", "Innovation center 10th anniversary"), fit: "contain" },
    { image: HERO_COMPETITION_IMG, alt: t("创新创业大赛获奖", "Innovation competition award"), fit: "contain" },
  ];
  const slideCount = slides.length;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((c) => (c + 1) % slideCount);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [slideCount]);

  return (
    <div className="relative hidden lg:block">
      <div className="relative ml-auto w-full max-w-[820px] border border-[#E5E7EB] bg-white">
        <div className="relative aspect-[16/9] overflow-hidden border-b border-[#E5E7EB] bg-white">
          {slides.map((slide, index) => (
            <div
              key={slide.image}
              className={`absolute inset-0 transition-opacity duration-700 ease-out ${activeSlide === index ? "opacity-100" : "opacity-0"}`}
              aria-hidden={activeSlide !== index}
            >
              <img
                src={slide.image}
                alt={slide.alt}
                className={`h-full w-full ${slide.fit === "contain" ? "object-contain" : "object-cover"}`}
                loading={index === 0 ? "eager" : "lazy"}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          aria-label={t("上一张", "Previous")}
          onClick={() => setActiveSlide((c) => (c + slideCount - 1) % slideCount)}
          className="absolute -left-10 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center border border-[#E5E7EB] bg-white text-[#3D1560] transition hover:border-[#3D1560]"
        >
          <ChevronLeft size={20} />
        </button>
        <button
          type="button"
          aria-label={t("下一张", "Next")}
          onClick={() => setActiveSlide((c) => (c + 1) % slideCount)}
          className="absolute -right-10 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center border border-[#E5E7EB] bg-white text-[#3D1560] transition hover:border-[#3D1560]"
        >
          <ChevronRight size={20} />
        </button>
        <div className="absolute right-4 top-4 z-30 flex gap-2">
          {slides.map((slide, index) => (
            <button
              key={slide.image}
              type="button"
              aria-label={t(`切换到第 ${index + 1} 张`, `Slide ${index + 1}`)}
              onClick={() => setActiveSlide(index)}
              className={`h-2 transition-all ${activeSlide === index ? "w-6 bg-[#3D1560]" : "w-2 bg-[#D1D5DB] hover:bg-[#9CA3AF]"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Mobile Hero Carousel ───
function MobileHeroCarousel() {
  const { t } = useLang();
  const [activeSlide, setActiveSlide] = useState(0);
  const slides = [
    { image: HERO_CUHK_QS_WIDE_IMG, fit: "cover" },
    { image: HERO_CUHK_VISIT_IMG, fit: "contain" },
    { image: HERO_CUHK_ANNIVERSARY_IMG, fit: "contain" },
    { image: HERO_COMPETITION_IMG, fit: "contain" },
  ];
  const slideCount = slides.length;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((c) => (c + 1) % slideCount);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [slideCount]);

  return (
    <div className="lg:hidden mt-8 border border-[#E5E7EB] bg-white">
      <div className="relative aspect-[16/9] overflow-hidden">
        {slides.map((slide, index) => (
          <div
            key={slide.image}
            className={`absolute inset-0 transition-opacity duration-500 ${activeSlide === index ? "opacity-100" : "opacity-0"}`}
          >
            <img
              src={slide.image}
              alt=""
              className={`h-full w-full ${slide.fit === "contain" ? "object-contain" : "object-cover"}`}
              loading="lazy"
            />
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-1.5 py-3">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActiveSlide(i)}
            className={`h-1.5 transition-all ${activeSlide === i ? "w-5 bg-[#3D1560]" : "w-1.5 bg-[#D1D5DB]"}`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ───
type HomeProps = {
  includeChrome?: boolean;
  includeHero?: boolean;
  includeStats?: boolean;
  includeCoreSolutions?: boolean;
  includeWhyGeo?: boolean;
  includeHowItWorks?: boolean;
  includeIndustries?: boolean;
  includeGeoVsSeo?: boolean;
  includeAwards?: boolean;
  includeCta?: boolean;
};

export default function Home({ includeChrome = true, includeHero = true, includeStats = true, includeAwards = true, includeCta = true }: HomeProps) {
  const revealCta = useReveal();
  const { t, lang } = useLang();

  usePageMeta({
    title: t("FrontMind 超前智能 - 定义 AI 原生时代的企业增长", "FrontMind - Define Enterprise Growth for the AI-Native Era"),
    description: t(
      "FrontMind 提供从外部理解到内部重构的完整 AI 化路径，帮助企业完成 AI 时代的客户入口、增长链路与组织流程迁移。",
      "FrontMind provides an end-to-end AI transformation path from external understanding to internal reconstruction.",
    ),
    lang,
    canonicalPath: "/",
    image: HERO_METHOD_WIDE_IMG,
  });

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {includeChrome && <Navbar />}

      {/* ═══════════ HERO ═══════════ */}
      {includeHero && (
        <section aria-label="Hero" className="relative pt-24 pb-12 md:pt-32 md:pb-20 overflow-hidden bg-white">
          <div className="container relative z-10">
            <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[0.78fr_1.22fr] xl:gap-10">
              <div>
                <SectionLabel text={t("企业 AI 化增长伙伴", "Enterprise AI Growth Partner")} color="purple" />
                <h1
                  className="text-2xl sm:text-3xl md:text-4xl lg:text-[2.75rem] font-bold text-[#1A1A2E] leading-[1.2] mb-5"
                  style={{ fontFamily: "'DM Serif Display', serif" }}
                >
                  {t(
                    <>重新定义品牌<br />在 AI 时代的制胜之道</>,
                    <>Redefining Brands<br />for the Age of AI</>
                  )}
                </h1>
                <p
                  className="text-base md:text-lg text-[#4B5563] max-w-lg mb-7 leading-relaxed"
                  style={{ fontFamily: "'DM Sans', sans-serif" }}
                >
                  {t(
                    "AI 正在同时迁移客户入口、增长链路和组织流程。FrontMind 以「理解、增长、嵌入」为核心路径，帮助企业重构 AI 时代的核心竞争力。",
                    "AI is migrating customer entry points, growth loops, and organizational workflows at the same time. FrontMind follows an understand-grow-embed path to help enterprises rebuild their core competitiveness for the AI era.",
                  )}
                </p>
                <div className="flex flex-wrap gap-4">
                  <Link
                    href="/contact"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-[#3D1560] text-white text-sm font-semibold hover:bg-[#2D1050] transition-colors no-underline"
                    style={{ fontFamily: "'DM Sans', sans-serif" }}
                  >
                    {t("联系我们", "Contact Us")}
                    <ArrowRight size={16} />
                  </Link>

                </div>

                {/* Mobile carousel */}
                <MobileHeroCarousel />
              </div>

              {/* Desktop: News/Image Wall */}
              <HeroNewsWall />
            </div>
          </div>
        </section>
      )}

      {/* ═══════════ STATS BAR ═══════════ */}
      {includeStats && <StatsBar />}

      {/* ═══════════ SOLUTIONS SYSTEM ═══════════ */}
      <SolutionsSections includeCta={false} embedded />

      {/* ═══════════ RECENT NEWS ═══════════ */}
      <RecentNews />

      {/* ═══════════ AWARDS & RECOGNITION ═══════════ */}
      {includeAwards && (
        <section aria-label="Awards" className="py-14 bg-white border-t border-b border-[#E5E7EB]">
          <div className="container">
            <div className="text-center mb-8">
              <span className="text-sm font-bold tracking-wider text-[#3D1560] uppercase" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                {t("荣誉与认可", "Awards & Recognition")}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 border border-[#E5E7EB] overflow-hidden">
              {[
                { year: "2024", award: t("“未来中国香港”创科大赛冠军", "‘Future Hong Kong, China’ InnoTech Grand Champion") },
                { year: "2024", award: t("第十四届中国创新创业大赛大奖", "14th China Innovation & Entrepreneurship Award") },
                { year: "2025", award: t("上海“海聚英才”全球创新创业大奖", "Shanghai ‘Haiju Yingcai’ Global Innovation Award") },
                { year: "2025", award: t("深圳招商局海外 C-Star 计划", "Shenzhen CMG Overseas C-Star Program") },
              ].map((item, i) => (
                <div key={i} className={`text-center p-5 md:p-6 ${i < 3 ? "border-b sm:border-b-0 sm:border-r border-[#E5E7EB]" : ""} hover:bg-[#FAFBFF] transition-colors`}>
                  <div className="text-2xl font-bold text-[#3D1560] mb-2" style={{ fontFamily: "'DM Serif Display', serif" }}>{item.year}</div>
                  <div className="text-sm text-[#4B5563] leading-snug" style={{ fontFamily: "'DM Sans', sans-serif" }}>{item.award}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════ VISITOR STATS ═══════════ */}
      {includeCta && <VisitorStats />}

      {/* ═══════════ CTA SECTION ═══════════ */}
      {includeCta && (
        <section aria-label="Call to Action" className="relative overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${CTA_IMG})` }}
          />
          <div className="absolute inset-0 bg-[#1A0A2E]/85" />
          <div
            ref={revealCta.ref}
            className={`container relative z-10 py-16 md:py-24 reveal ${revealCta.isVisible ? "visible" : ""}`}
          >
            <div className="max-w-3xl">
              <h2
                className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight mb-4"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                {t(
                  "以学术角度支撑行业标准",
                  "Setting industry standards through academic rigor",
                )}
              </h2>
              <h3
                className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight mb-4"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                {t(
                  <>以专业服务回应 AI 时代<span className="whitespace-nowrap">公共需求</span></>,
                  <>Responding to public needs of the AI era with professional services</>,
                )}
              </h3>
              <p
                className="text-sm md:text-base text-white/60 mb-8 leading-relaxed"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                {t(
                  "AI 时代的信息秩序，需要真正懂模型底层、懂质量控制、懂专业评测的学术标准共建者",
                  "The information order of the AI era needs academic standard co-builders who truly understand model fundamentals, quality control, and professional evaluation.",
                )}
              </p>
              <div className="flex flex-wrap gap-4">
                <Link
                  href="/contact"
                  className="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-[#3D1560] text-sm font-bold hover:bg-[#F5F3F9] transition-colors no-underline"
                  style={{ fontFamily: "'DM Sans', sans-serif" }}
                >
                  {t("联系我们", "Contact Us")}
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {includeChrome && <Footer />}
    </div>
  );
}

// ─── Recent Industry News ───
function RecentNews() {
  const { t } = useLang();
  const news = [
    {
      type: t("行业趋势", "Industry Trends"),
      date: "2026.06.17",
      title: t("GEO 正式取代传统 SEO 成为品牌可见度核心策略", "GEO Officially Replaces Traditional SEO as Core Brand Visibility Strategy"),
      desc: t(
        "研究显示 AI 搜索覆盖 15-30% 查询量，被 AI 引用的品牌点击率比未引用品牌高出 35%，企业正加速布局生成式引擎优化。",
        "Research shows AI search covers 15-30% of queries, and brands cited in AI get 35% more clicks than uncited ones. Enterprises are accelerating GEO adoption.",
      ),
      slug: "geo-replaces-seo-brand-visibility",
      img: "/news/geo-marketing-ai.webp",
    },
    {
      type: t("行业新闻", "Industry News"),
      date: "2026.06.10",
      title: t("Google 发布官方 AI 搜索优化指南", "Google Releases Official AI Search Optimization Guide"),
      desc: t(
        "Google 首次发布面向开发者的生成式 AI 功能优化指南，明确结构化数据、实体清晰度和权威信源对 AI Overviews 引用的关键作用。",
        "Google releases its first developer guide for generative AI optimization, emphasizing structured data, entity clarity, and authoritative sources for AI Overviews.",
      ),
      slug: "google-ai-search-optimization-guide",
      img: "/news/ai-brand-visibility.webp",
    },
    {
      type: t("市场洞察", "Market Insights"),
      date: "2026.06.04",
      title: t("ChatGPT 周活跃用户突破 8 亿，品牌引用竞争白热化", "ChatGPT Surpasses 800M Weekly Users, Brand Citation Competition Intensifies"),
      desc: t(
        "89% 的 ChatGPT 引用来自 Google 排名 21 位之后的页面，传统排名不再决定 AI 引用，语义资产与分布式品牌提及成为关键。",
        "89% of ChatGPT citations come from pages ranked 21+ on Google. Traditional rankings no longer determine AI citations; semantic assets and distributed mentions are key.",
      ),
      slug: "chatgpt-800m-users-brand-citation",
      img: "/news/ai-search-optimization.webp",
    },
  ];

  return (
    <section style={{ backgroundColor: "#f5f5f7", paddingBlock: "clamp(2.5rem, 4vw, 3.5rem)" }}>
      <div className="container">
        <div className="grid lg:grid-cols-[1fr_3fr] gap-10 lg:gap-16">
          <div>
            <SectionLabel text={t("近期新闻", "Recent News")} color="purple" />
            <h2
              className="text-3xl md:text-4xl font-bold text-[#1A1A2E] leading-tight mb-4"
              style={{ fontFamily: "'DM Serif Display', serif", whiteSpace: "pre-line" }}
            >
              {t("追踪最新\n市场动向", "Track the Latest\nMarket Trends")}
            </h2>
            <Link
              href="/news"
              className="hidden md:inline-flex items-center gap-1 text-sm font-semibold text-[#3D1560] no-underline hover:underline"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              {t("查看全部新闻", "View All News")} <ArrowRight size={14} />
            </Link>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {news.map((item) => (
              <Link
                key={item.title}
                href={`/news/${item.slug}/`}
                className="overflow-hidden group transition-all duration-300 no-underline flex flex-col"
                style={{
                  backgroundColor: "#fff",
                  borderRadius: "12px",
                  border: "1px solid #E5E7EB",
                }}
              >
                <div className="aspect-[16/8] overflow-hidden">
                  <img
                    src={item.img}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                </div>

                <div className="p-5 flex flex-col flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span
                      className="text-xs font-bold tracking-wider text-[#3D1560] uppercase"
                      style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.7rem" }}
                    >
                      {item.type}
                    </span>
                    <span aria-hidden="true" className="text-[#9CA3AF]">/</span>
                    <span
                      className="text-xs text-[#9CA3AF]"
                      style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.75rem" }}
                    >
                      {item.date}
                    </span>
                  </div>

                  <h3
                    className="mb-2 leading-snug text-[#1A1A2E] group-hover:text-[#3D1560] transition-colors"
                    style={{
                      fontFamily: "'DM Serif Display', serif",
                      fontWeight: 600,
                      fontSize: "1.0625rem",
                    }}
                  >
                    {item.title}
                  </h3>

                  <p
                    className="text-sm text-[#6B7280] mb-4 leading-relaxed flex-1"
                    style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "0.875rem" }}
                  >
                    {item.desc}
                  </p>

                  <span
                    className="inline-flex items-center gap-1 text-sm font-semibold text-[#3D1560] mt-auto"
                    style={{ fontFamily: "'DM Sans', sans-serif" }}
                  >
                    {t("阅读全文", "Read More")} <ArrowRight size={14} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="md:hidden mt-8 text-center">
          <Link
            href="/news"
            className="inline-flex items-center gap-1 text-sm font-semibold text-[#3D1560] no-underline"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            {t("查看全部新闻", "View All News")} <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}
