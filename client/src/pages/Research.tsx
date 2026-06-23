/* Style Note: Corporate Editorial Precision — research and community page should feel editorial, calm, and useful. */
import { useReveal } from "@/hooks/useReveal";
import { usePageMeta } from "@/hooks/usePageMeta";
import SectionLabel from "@/components/SectionLabel";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useLang } from "@/contexts/LanguageContext";
import { communityPathToFrontMind } from "@/data/geoCommunity/translations";
import { communityPostsCn, type CommunityPostCn } from "@/data/geoCommunity/communityPostsCn";
import {
  ArrowRight,
  Calendar,
} from "lucide-react";

type ResearchProps = {
  includeChrome?: boolean;
};

const RESEARCH_IMG =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663550747472/N9P7CTPQUeD653F54XuJ9x/frontmind-research-scene-BJfF7SxtJJoq4dTePQMK3h.webp";
const CTA_IMG =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663567004319/FRgjGX8Da7KscfHcwTaFCq/cta-geometric-a34vAZt6eBGYhkxnp6tcD8.webp";
const GEO_TRACKING_IMG = "/research/geo-academic-tracking-wide.webp";
const BLOG_IMAGE_BASE = "/geo-community-blogs-cn/images";
const BLOG_PAGE_SIZE = 8;

export default function Research({ includeChrome = true }: ResearchProps) {
  const revealHero = useReveal();
  const revealQuote = useReveal();
  const revealCommunity = useReveal();
  const revealCta = useReveal();
  const { t, lang } = useLang();
  const searchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const requestedBlogPage = clampBlogPage(Number(searchParams.get("page") || "1"));
  const totalBlogPages = Math.max(1, Math.ceil(communityPostsCn.length / BLOG_PAGE_SIZE));
  const blogPage = Math.min(requestedBlogPage, totalBlogPages);
  const blogStart = (blogPage - 1) * BLOG_PAGE_SIZE;
  const visiblePosts = communityPostsCn.slice(blogStart, blogStart + BLOG_PAGE_SIZE);

  usePageMeta({
    title: t("FrontMind 研究与社区", "FrontMind Research & Community"),
    description: t(
      "FrontMind 研究与社区汇集 GEO 研究进展、中文学习文章和 AI 搜索实践内容。",
      "FrontMind Research & Community brings together GEO research progress, localized learning articles, and AI search practice content.",
    ),
    lang,
    schemaType: "CollectionPage",
  });

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      {includeChrome && <Navbar />}

      {/* Hero Section - white background, left text + right 16:9 image */}
      <section className="relative overflow-hidden bg-white pt-28 pb-10 md:pt-36 md:pb-14">
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage:
              "linear-gradient(#3D1560 1px, transparent 1px), linear-gradient(90deg, #3D1560 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        <div
          ref={revealHero.ref}
          className={`container relative z-10 reveal ${revealHero.isVisible ? "visible" : ""}`}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
            {/* Left: Text content */}
            <div>
              <SectionLabel text={t("研究与洞察", "Research & Insights")} color="purple" />
              <h1
                className="mb-5 text-2xl sm:text-3xl md:text-4xl lg:text-[2.75rem] font-bold text-[#1A1A2E] leading-[1.2]"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                {t(
                  <>推进 AI 品牌优化<br />的科学研究</>,
                  <>Advancing the Science<br />of AI Brand Optimization</>,
                )}
              </h1>
              <p
                className="max-w-lg text-base md:text-lg text-[#4B5563] leading-relaxed"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                {t(
                  "探索我们关于生成式引擎优化、AI 搜索趋势和 AI 时代品牌管理的最新研究、行业报告和学习文章。",
                  "Explore our latest research, industry reports, and learning articles on generative engine optimization, AI search trends, and brand management in the AI era.",
                )}
              </p>
            </div>

            {/* Right: 16:9 image */}
            <div className="flex justify-center md:justify-end">
              <img
                src={GEO_TRACKING_IMG}
                alt={t("GEO学术追踪 - 微信公众号/知乎/小红书同名", "GEO Academic Tracking")}
                className="w-full rounded-xl shadow-lg"
                style={{ aspectRatio: "16/9", objectFit: "cover" }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Quote/Tagline transition block - matching MindPromise thesis style */}
      <section className="border-t border-b border-[#E5E7EB] bg-[#FAFBFF] py-10 md:py-14">
        <div
          ref={revealQuote.ref}
          className={`container reveal ${revealQuote.isVisible ? "visible" : ""}`}
        >
          <blockquote className="max-w-4xl mx-auto text-center">
            <p
              className="text-lg md:text-xl leading-relaxed text-[#374151] italic"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              {t(
                "\u201C科研能力决定 AI 语义资产的天花板。\u201D",
                "\u201CResearch capability defines the ceiling of AI semantic assets.\u201D",
              )}
            </p>
          </blockquote>
        </div>
      </section>

      {/* GEO Learning & Practice section */}
      <section id="geo-community" className="bg-white py-14 md:py-20">
        <div
          ref={revealCommunity.ref}
          className={`container reveal ${revealCommunity.isVisible ? "visible" : ""}`}
        >
          <div className="mb-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div className="max-w-3xl">
              <SectionLabel text={t("GEO 学习与实践", "GEO Learning & Practice")} color="purple" />
              <h2
                className="mb-4 text-3xl font-bold leading-tight text-[#1A1A2E] md:text-5xl"
                style={{ fontFamily: "'DM Serif Display', serif" }}
              >
                {t("GEO 学习与实践", "GEO Learning & Practice")}
              </h2>
              <p
                className="text-base leading-relaxed text-[#6B7280]"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                {t(
                  "涵盖生成式引擎优化、AI 搜索策略、LLM 评测与内容架构，建立对 AI 时代品牌增长的系统认知。",
                  "Covering generative engine optimization, AI search strategy, LLM evaluation, and content architecture to build systematic understanding of brand growth in the AI era.",
                )}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {visiblePosts.map((post) => (
              <ResearchPostCard key={post.slug} post={post} />
            ))}
          </div>

          <ResearchPagination page={blogPage} totalPages={totalBlogPages} />
        </div>
      </section>

      {/* ═══════════ CTA SECTION ═══════════ */}
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
          <div className="max-w-2xl">
            <h2
              className="text-3xl md:text-4xl lg:text-5xl font-bold text-white leading-tight mb-4"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              {t(
                "即刻构建企业的 AI 时代话语权",
                "Build your enterprise's voice in the AI era",
              )}
            </h2>
            <p
              className="text-sm md:text-base text-white/60 mb-8 leading-relaxed"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              {t(
                "从搜索排名，走向 AI 原生认知资产",
                "From search rankings to AI-native cognitive assets",
              )}
            </p>
            <div className="flex flex-wrap gap-4">
              <a
                href="/contact"
                className="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-[#3D1560] text-sm font-bold hover:bg-[#F5F3F9] transition-colors no-underline"
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                {t("联系我们", "Contact Us")}
                <ArrowRight size={16} />
              </a>
            </div>
          </div>
        </div>
      </section>

      {includeChrome && <Footer />}
    </div>
  );
}

function ResearchPagination({ page, totalPages }: { page: number; totalPages: number }) {
  if (totalPages <= 1) return null;
  const pageNumbers = condensedPageNumbers(page, totalPages);

  return (
    <nav className="mt-10 flex flex-wrap items-center justify-center gap-2" aria-label="研究与社区分页">
      {page > 1 && (
        <a href={researchPageHref(page - 1)} className="rounded-md border border-[#3D1560]/15 bg-white px-4 py-2 text-sm font-semibold text-[#3D1560] no-underline hover:bg-[#3D1560]/5">
          上一页
        </a>
      )}
      {pageNumbers.map((item, index) => (
        item === "ellipsis" ? (
          <span key={`ellipsis-${index}`} className="px-2 text-sm font-semibold text-[#9CA3AF]">...</span>
        ) : (
          <a
            key={item}
            href={researchPageHref(item)}
            className={`rounded-md border px-3.5 py-2 text-sm font-semibold no-underline ${
              item === page
                ? "border-[#3D1560] bg-[#3D1560] text-white"
                : "border-[#3D1560]/15 bg-white text-[#3D1560] hover:bg-[#3D1560]/5"
            }`}
          >
            {item}
          </a>
        )
      ))}
      {page < totalPages && (
        <a href={researchPageHref(page + 1)} className="rounded-md border border-[#3D1560]/15 bg-white px-4 py-2 text-sm font-semibold text-[#3D1560] no-underline hover:bg-[#3D1560]/5">
          下一页
        </a>
      )}
    </nav>
  );
}

function ResearchPostCard({ post }: { post: CommunityPostCn }) {
  return (
    <a href={communityPathToFrontMind(`/blogs/generative-engine-optimization/${post.slug}`)} className="fm-card group grid overflow-hidden no-underline md:grid-cols-[1.28fr_0.82fr]">
      <div className="flex min-h-[210px] items-center justify-center overflow-hidden bg-white p-3 md:min-h-[230px]">
        <img src={postImage(post)} alt="" className="h-auto max-h-[260px] w-full object-contain transition-transform duration-500 group-hover:scale-[1.015]" loading="lazy" />
      </div>
      <div className="flex flex-col p-5 md:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#3D1560]/7 px-3 py-1 text-xs font-bold text-[#3D1560]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
            {post.categoryCn}
          </span>
          {post.tagsCn.slice(0, 2).map((tag) => (
            <span key={tag} className="text-xs font-semibold text-[#9CA3AF]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              {tag}
            </span>
          ))}
        </div>
        <h3 className="mb-3 text-xl font-bold leading-tight text-[#1A1A2E] group-hover:text-[#3D1560]" style={{ fontFamily: "'DM Serif Display', serif" }}>
          {post.titleCn}
        </h3>
        <p className="line-clamp-3 text-sm leading-relaxed text-[#6B7280]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          {post.metaCn}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-4 pt-5 text-xs text-[#9CA3AF]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          <span className="inline-flex items-center gap-1"><Calendar size={12} /> {post.dateCn}</span>
        </div>
      </div>
    </a>
  );
}

function postImage(post: CommunityPostCn) {
  const file = post.imageCn.split("/").pop() || "";
  return `${BLOG_IMAGE_BASE}/${file}`;
}

function clampBlogPage(value: number) {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
}

function researchPageHref(page: number) {
  return page <= 1 ? "/research#geo-community" : `/research?page=${page}#geo-community`;
}

function condensedPageNumbers(page: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 9) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  if (page <= 4) [2, 3, 4, 5].forEach((item) => pages.add(item));
  if (page >= totalPages - 3) [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1].forEach((item) => pages.add(item));

  const sorted = Array.from(pages)
    .filter((item) => item >= 1 && item <= totalPages)
    .sort((a, b) => a - b);

  return sorted.flatMap((item, index) => {
    const previous = sorted[index - 1];
    if (index > 0 && previous !== undefined && item - previous > 1) {
      return ["ellipsis" as const, item];
    }
    return [item];
  });
}
