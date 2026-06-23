/* Style Note: Community content should read inside FrontMind as an editorial knowledge base, not as a foreign embedded site. */
import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Calendar } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SectionLabel from "@/components/SectionLabel";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useLang } from "@/contexts/LanguageContext";
import {
  pageCatalogByPath,
  pagePaths,
  type GeoCommunityPage,
} from "@/data/geoCommunity/pageCatalog";
import { geoLocalContentByPath } from "@/data/geoCommunity/localContent";
import {
  communityPathToFrontMind,
  frontMindPathToCommunity,
  zhExcerptFor,
  zhTitleFor,
} from "@/data/geoCommunity/translations";
import { communityPostsCn, type CommunityPostCn } from "@/data/geoCommunity/communityPostsCn";

const BLOG_IMAGE_BASE = "/geo-community-blogs-cn/images";
const BLOG_PAGE_SIZE = 8;

const newPostPaths = new Set(communityPostsCn.map((post) => postPath(post.slug)));
const contentPaths = new Set([
  "/",
  "/blogs",
  ...Array.from(newPostPaths),
  ...pagePaths,
  ...Object.keys(geoLocalContentByPath),
]);

export default function GeoCommunityPage() {
  const [rawLocation] = useLocation();
  const { lang, t } = useLang();
  const [locationPath, locationSearch = ""] = rawLocation.split("?");
  const communityPath = frontMindPathToCommunity(locationPath);
  const canonicalPath = canonicalCommunityPath(communityPath);
  const query = locationSearch
    ? `?${locationSearch.split("#")[0]}`
    : typeof window !== "undefined"
      ? window.location.search
      : "";
  const page = pageCatalogByPath[canonicalPath] as GeoCommunityPage | undefined;
  const localContent = geoLocalContentByPath[canonicalPath];
  const post = postForPath(canonicalPath);
  const isBlogIndex = canonicalPath === "/blogs";

  const title = isBlogIndex
    ? t("GEO 研究与学习社区文章库", "GEO Research and Learning Library")
    : post?.titleCn || zhTitleFor(canonicalPath, page?.sourceTitle || page?.h1 || t("GEO 社区内容", "GEO Community Content"));
  const metaTitle = post ? `${post.titleCn} - FrontMind GEO 社区` : `FrontMind - ${title}`;

  usePageMeta({
    title: metaTitle,
    description: post?.metaCn || zhExcerptFor(communityPath, page?.description || t("GEO 社区内容已整合到 FrontMind 阅读场景。", "GEO community content is integrated into the FrontMind reading experience.")),
    lang,
    canonicalPath: communityPathToFrontMind(canonicalPath),
    image: post ? postImage(post) : "/research/geo-academic-tracking-wide.webp",
    type: post ? "article" : "website",
    schemaType: post ? "WebPage" : "CollectionPage",
    structuredData: post
      ? {
          "@type": "BlogPosting",
          headline: post.titleCn,
          description: post.metaCn,
          datePublished: post.dateCn,
          image: postImage(post),
          author: {
            "@type": "Organization",
            name: "FrontMind",
          },
          publisher: {
            "@type": "Organization",
            name: "FrontMind",
          },
        }
      : null,
  });

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <Navbar />
      {isBlogIndex ? (
        <CommunityBlogIndex query={query} />
      ) : post ? (
        <CommunityPostArticle post={post} />
      ) : (
        <CommunityLegacyArticle page={page} communityPath={canonicalPath} localBody={localContent?.body} />
      )}
      <Footer />
    </div>
  );
}

function CommunityBlogIndex({ query }: { query: string }) {
  const { t } = useLang();
  const params = new URLSearchParams(query);
  const category = normalizeCategory(params.get("category") || "all");
  const currentPage = clampPage(Number(params.get("page") || "1"));
  const filteredPosts = communityPostsCn.filter((post) => category === "all" || post.categoryCn === category);
  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / BLOG_PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const start = (page - 1) * BLOG_PAGE_SIZE;
  const visiblePosts = filteredPosts.slice(start, start + BLOG_PAGE_SIZE);
  const categories = blogCategories();

  return (
    <main className="pt-28 md:pt-36">
      <section className="bg-white pb-14">
        <div className="container">
          <SectionLabel text={t("GEO 研究与学习社区", "GEO Research and Learning Community")} color="purple" />
          <div className="max-w-3xl">
            <h1 className="mb-5 text-4xl font-bold leading-tight text-[#1A1A2E] md:text-6xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
              {t("GEO 研究与学习社区文章库", "GEO Research and Learning Library")}
            </h1>
            <p className="text-base leading-relaxed text-[#6B7280] md:text-lg" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              {t(
                "这里汇集 119 篇中文整理后的 GEO、AI 搜索、LLM 评测、技术 SEO 与内容策略文章。文章按分页展示，方便逐步阅读和检索。",
                "This library brings together 119 localized articles on GEO, AI search, LLM evaluation, technical SEO, and content strategy with paginated browsing.",
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="container">
          <div className="mb-8 flex flex-wrap gap-2">
            {categories.map((item) => (
              <a
                key={item.key}
                href={blogIndexHref(item.key, 1)}
                className={`rounded-md border px-4 py-2 text-sm font-semibold no-underline transition-colors ${
                  category === item.key
                    ? "border-[#3D1560] bg-[#3D1560] text-white"
                    : "border-[#3D1560]/15 bg-white text-[#3D1560] hover:bg-[#3D1560]/5"
                }`}
                style={{ fontFamily: "'DM Sans', sans-serif" }}
              >
                {item.label}
                <span className="ml-2 text-xs opacity-70">{item.count}</span>
              </a>
            ))}
          </div>

          <div className="mb-7 flex flex-col justify-between gap-3 border-b border-[#e5e7eb] pb-5 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#C5A24D]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                {t("全部文章", "All Articles")}
              </p>
              <h2 className="mt-2 text-2xl font-bold text-[#1A1A2E] md:text-3xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
                {t(`第 ${page} 页`, `Page ${page}`)}
              </h2>
            </div>
            <p className="text-sm text-[#6B7280]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              {t(`共 ${filteredPosts.length} 篇，每页 ${BLOG_PAGE_SIZE} 篇`, `${filteredPosts.length} posts, ${BLOG_PAGE_SIZE} per page`)}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {visiblePosts.map((post) => (
              <CommunityPostCard key={post.slug} post={post} />
            ))}
          </div>

          <Pagination category={category} page={page} totalPages={totalPages} />
        </div>
      </section>
    </main>
  );
}

function CommunityPostCard({ post }: { post: CommunityPostCn }) {
  return (
    <Link href={communityPathToFrontMind(postPath(post.slug))} className="fm-card group grid overflow-hidden no-underline md:grid-cols-[1.28fr_0.82fr]">
      <div className="flex min-h-[210px] items-center justify-center overflow-hidden bg-white p-3 md:min-h-[230px]">
        <img
          src={postImage(post)}
          alt=""
          className="h-auto max-h-[260px] w-full object-contain transition-transform duration-500 group-hover:scale-[1.015]"
          loading="lazy"
        />
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
        <h2 className="mb-3 text-xl font-bold leading-tight text-[#1A1A2E] group-hover:text-[#3D1560]" style={{ fontFamily: "'DM Serif Display', serif" }}>
          {post.titleCn}
        </h2>
        <p className="line-clamp-3 text-sm leading-relaxed text-[#6B7280]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          {post.metaCn}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-4 pt-5 text-xs text-[#9CA3AF]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          <span className="inline-flex items-center gap-1"><Calendar size={12} /> {post.dateCn}</span>
        </div>
      </div>
    </Link>
  );
}

function Pagination({ category, page, totalPages }: { category: string; page: number; totalPages: number }) {
  if (totalPages <= 1) return null;
  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1);

  return (
    <nav className="mt-10 flex flex-wrap items-center justify-center gap-2" aria-label="分页">
      {page > 1 && (
        <a href={blogIndexHref(category, page - 1)} className="rounded-md border border-[#3D1560]/15 bg-white px-4 py-2 text-sm font-semibold text-[#3D1560] no-underline hover:bg-[#3D1560]/5">
          上一页
        </a>
      )}
      {pageNumbers.map((item) => (
        <a
          key={item}
          href={blogIndexHref(category, item)}
          className={`rounded-md border px-3.5 py-2 text-sm font-semibold no-underline ${
            item === page
              ? "border-[#3D1560] bg-[#3D1560] text-white"
              : "border-[#3D1560]/15 bg-white text-[#3D1560] hover:bg-[#3D1560]/5"
          }`}
        >
          {item}
        </a>
      ))}
      {page < totalPages && (
        <a href={blogIndexHref(category, page + 1)} className="rounded-md border border-[#3D1560]/15 bg-white px-4 py-2 text-sm font-semibold text-[#3D1560] no-underline hover:bg-[#3D1560]/5">
          下一页
        </a>
      )}
    </nav>
  );
}

function CommunityPostArticle({ post }: { post: CommunityPostCn }) {
  const { t } = useLang();
  const articleHtml = useMemo(() => articleHtmlFor(post), [post]);
  const backHref = researchPageHrefForPost(post);

  return (
    <main className="pt-28 md:pt-36">
      <section className="bg-white pb-12">
        <div className="container">
          <a href={backHref} className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-[#3D1560] no-underline">
            <ArrowLeft size={14} /> {t("返回全部文章", "Back to All Articles")}
          </a>
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-7">
              <SectionLabel text={t("GEO 研究与学习社区", "GEO Research and Learning Community")} color="purple" />
              <h1 className="mb-5 text-4xl font-bold leading-tight text-[#1A1A2E] md:text-6xl" style={{ fontFamily: "'DM Serif Display', serif" }}>
                {post.titleCn}
              </h1>
              <p className="mb-6 text-base leading-relaxed text-[#6B7280] md:text-lg" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                {post.metaCn}
              </p>
              <div className="flex flex-wrap items-center gap-4 text-sm text-[#9CA3AF]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                <span>{post.categoryCn}</span>
                <span className="inline-flex items-center gap-1"><Calendar size={14} /> {post.dateCn}</span>
              </div>
            </div>
            <figure className="fm-card overflow-hidden lg:col-span-5">
              <img src={postImage(post)} alt="" className="h-full w-full object-cover" loading="eager" />
            </figure>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="container">
          <div className="w-full">
            <article className="fm-card p-6 md:p-10">
              {post.tldrCn.length > 0 && (
                <div className="mb-10 rounded-lg border border-[#3D1560]/10 bg-[#FBFAFC] p-5">
                  <h2 className="mb-4 text-xl font-bold text-[#1A1A2E]" style={{ fontFamily: "'DM Serif Display', serif" }}>
                    {t("本文要点", "Key Takeaways")}
                  </h2>
                  <ul className="space-y-3">
                    {post.tldrCn.map((item) => (
                      <li key={item} className="flex gap-3 text-sm leading-relaxed text-[#4B5563]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#C5A24D]" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div
                className="community-post-prose space-y-6 text-[#374151] [&_a]:font-semibold [&_a]:text-[#3D1560] [&_a]:underline [&_a]:decoration-[#C5A24D]/50 [&_a]:underline-offset-4 [&_blockquote]:border-l-4 [&_blockquote]:border-[#C5A24D] [&_blockquote]:bg-[#FBFAFC] [&_blockquote]:px-5 [&_blockquote]:py-4 [&_code]:bg-[#f5f5f7] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[#3D1560] [&_h2]:pt-4 [&_h2]:text-2xl md:[&_h2]:text-3xl [&_h2]:font-bold [&_h2]:leading-tight [&_h2]:text-[#1A1A2E] [&_h3]:pt-2 [&_h3]:text-xl md:[&_h3]:text-2xl [&_h3]:font-bold [&_h3]:leading-tight [&_h3]:text-[#1A1A2E] [&_img]:w-full [&_img]:rounded-lg [&_li]:leading-8 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:text-base [&_p]:leading-8 [&_p]:text-[#4B5563] [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[#e5e7eb] [&_td]:px-4 [&_td]:py-3 [&_th]:border [&_th]:border-[#e5e7eb] [&_th]:bg-[#FBFAFC] [&_th]:px-4 [&_th]:py-3 [&_ul]:list-disc [&_ul]:pl-6"
                dangerouslySetInnerHTML={{ __html: articleHtml }}
              />
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}

function CommunityLegacyArticle({
  page,
  communityPath,
  localBody,
}: {
  page?: GeoCommunityPage;
  communityPath: string;
  localBody?: string;
}) {
  const { t } = useLang();

  if (!page && !localBody) {
    return (
      <main className="pt-28 md:pt-36">
        <section className="container py-16">
          <div className="fm-card p-8 md:p-10">
            <SectionLabel text={t("未收录路径", "Missing Path")} color="gold" />
            <h1 className="mb-4 text-4xl font-bold text-[#1A1A2E]" style={{ fontFamily: "'DM Serif Display', serif" }}>{t("这个社区内容尚未接入", "This community page is not yet connected")}</h1>
            <Link href="/research" className="inline-flex items-center gap-2 text-sm font-semibold text-[#3D1560] no-underline">
              <ArrowLeft size={14} /> {t("返回研究与社区", "Back to Research & Community")}
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const title = zhTitleFor(communityPath, page?.sourceTitle || page?.h1 || t("GEO 社区内容", "GEO Community Content"));
  const excerpt = zhExcerptFor(communityPath, page?.description || t("这篇内容来自 GEO 研究与学习社区，现已整合到 FrontMind 阅读场景中。", "This content is now integrated into FrontMind."));

  return (
    <main className="pt-28 md:pt-36">
      <section className="bg-white pb-12">
        <div className="container">
          <Link href="/research" className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-[#3D1560] no-underline">
            <ArrowLeft size={14} /> {t("返回研究与社区", "Back to Research & Community")}
          </Link>
          <div className="max-w-3xl">
            <SectionLabel text={t("GEO 研究与学习社区", "GEO Research and Learning Community")} color="purple" />
            <h1 className="mb-5 text-4xl font-bold leading-tight text-[#1A1A2E] md:text-6xl" style={{ fontFamily: "'DM Serif Display', serif" }}>{title}</h1>
            <p className="text-base leading-relaxed text-[#6B7280] md:text-lg" style={{ fontFamily: "'DM Sans', sans-serif" }}>{excerpt}</p>
          </div>
        </div>
      </section>
      <section className="py-12 md:py-16">
        <div className="container">
          <article className="fm-card p-6 md:p-10">
            <div className="space-y-6 text-base leading-8 text-[#4B5563]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
              {(localBody || page?.description || "").split(/\n{2,}/).slice(0, 16).map((paragraph) => (
                <p key={paragraph}>{paragraph.replace(/^#+\s*/, "")}</p>
              ))}
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}

function postPath(slug: string) {
  return `/blogs/generative-engine-optimization/${slug}`;
}

function postForPath(path: string) {
  const slug = path.match(/^\/blogs\/generative-engine-optimization\/([^/]+)\/?$/)?.[1];
  if (!slug) return undefined;
  return communityPostsCn.find((post) => post.slug === slug);
}

function postImage(post: CommunityPostCn) {
  const file = (post.imageCn.split("/").pop() || "").replace(/\.(png|jpe?g)$/i, ".webp");
  return `${BLOG_IMAGE_BASE}/${file}`;
}

function researchPageHrefForPost(post: CommunityPostCn) {
  const index = communityPostsCn.findIndex((item) => item.slug === post.slug);
  const page = index >= 0 ? Math.floor(index / BLOG_PAGE_SIZE) + 1 : 1;
  return page <= 1 ? "/research#geo-community" : `/research?page=${page}#geo-community`;
}

function normalizeCategory(category: string) {
  const map: Record<string, string> = {
    all: "all",
    research: "研究",
    guides: "指南",
    technical: "技术",
    insights: "洞察",
    ideas: "新观点",
  };
  return map[category] || category;
}

function blogCategories() {
  const counts = communityPostsCn.reduce<Record<string, number>>((acc, post) => {
    acc[post.categoryCn] = (acc[post.categoryCn] || 0) + 1;
    return acc;
  }, {});
  return [
    { key: "all", label: "全部", count: communityPostsCn.length },
    ...["研究", "指南", "技术", "洞察", "新观点"].filter((key) => counts[key]).map((key) => ({
      key,
      label: key,
      count: counts[key],
    })),
  ];
}

function blogIndexHref(category: string, page: number) {
  const params = new URLSearchParams();
  if (category !== "all") params.set("category", category);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `${communityPathToFrontMind("/blogs")}${query ? `?${query}` : ""}`;
}

function clampPage(value: number) {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
}

function articleHtmlFor(post: CommunityPostCn) {
  return post.htmlCn
    .replace(/^<h2>[\s\S]*?<\/h2>\s*/, "")
    .replace(/src="\/images\//g, `src="${BLOG_IMAGE_BASE}/`)
    .replace(/href="\/blogs\/generative-engine-optimization\/([^"/]+)\/?"/g, (_match, slug) => `href="${communityPathToFrontMind(postPath(slug))}"`)
    .replace(/href="\/blogs\/?"/g, `href="${communityPathToFrontMind("/blogs")}"`);
}

function canonicalCommunityPath(path: string) {
  const clean = (path.startsWith("/") ? path : `/${path}`).replace(/\/$/, "") || "/";
  if (contentPaths.has(clean)) return clean;
  const pagePath = clean.match(/^\/blogs\/page\/(\d+)$/);
  if (pagePath) return "/blogs";
  if (clean.startsWith("/blogs/") && !clean.startsWith("/blogs/generative-engine-optimization/")) {
    const slug = clean.slice("/blogs/".length);
    const geoBlogPath = postPath(slug);
    if (contentPaths.has(geoBlogPath)) return geoBlogPath;
  }
  if (clean.startsWith("/blogs/generative-engine-optimization/")) {
    const slug = clean.slice("/blogs/generative-engine-optimization/".length);
    const topLevelPath = `/${slug}`;
    if (contentPaths.has(topLevelPath)) return topLevelPath;
  }
  return clean;
}
