/* Legacy community pages intentionally live in their own async boundary so
 * their large catalog is not downloaded by the blog index or blog articles. */
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SectionLabel from "@/components/SectionLabel";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useLang } from "@/contexts/LanguageContext";
import {
  pageCatalogSummary,
  type GeoCommunityPageSummary,
} from "@/data/geoCommunity/pageCatalogSummary";
import {
  geoLocalContentPaths,
  loadGeoLocalContent,
  type GeoLocalContent,
} from "@/data/geoCommunity/localContent";
import {
  communityPathToFrontMind,
  frontMindPathToCommunity,
  zhExcerptFor,
  zhTitleFor,
} from "@/data/geoCommunity/translations";

const pagePaths = pageCatalogSummary.map((page) => page.path);
const pageCatalogByPath = Object.fromEntries(
  pageCatalogSummary.map((page) => [page.path, page]),
);
const legacyContentPaths = new Set([
  "/",
  ...pagePaths,
  ...geoLocalContentPaths,
]);

export default function GeoCommunityPage() {
  const [rawLocation] = useLocation();
  const { lang, t } = useLang();
  const [locationPath] = rawLocation.split("?");
  const communityPath = frontMindPathToCommunity(locationPath);
  const canonicalPath = canonicalLegacyCommunityPath(communityPath);
  const page = pageCatalogByPath[canonicalPath] as
    | GeoCommunityPageSummary
    | undefined;
  const [loadedContent, setLoadedContent] = useState<{
    path: string;
    content?: GeoLocalContent;
  }>();
  const localContent =
    loadedContent?.path === canonicalPath ? loadedContent.content : undefined;

  useEffect(() => {
    let isCurrent = true;
    void loadGeoLocalContent(canonicalPath)
      .then((content) => {
        if (isCurrent) setLoadedContent({ path: canonicalPath, content });
      })
      .catch(() => {
        if (isCurrent) {
          setLoadedContent({ path: canonicalPath, content: undefined });
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [canonicalPath]);
  const title = zhTitleFor(
    canonicalPath,
    page?.sourceTitle || page?.h1 || t("GEO 社区内容", "GEO Community Content"),
  );
  const description = zhExcerptFor(
    communityPath,
    page?.description ||
      t(
        "GEO 社区内容已整合到 FrontMind 阅读场景。",
        "GEO community content is integrated into the FrontMind reading experience.",
      ),
  );

  usePageMeta({
    title: `FrontMind - ${title}`,
    description,
    lang,
    canonicalPath: communityPathToFrontMind(canonicalPath),
    image: "/research/geo-academic-tracking-wide.webp",
    type: "website",
    schemaType: "CollectionPage",
    structuredData: null,
  });

  return (
    <div className="min-h-screen bg-[#f5f5f7]">
      <Navbar />
      <CommunityLegacyArticle
        page={page}
        communityPath={canonicalPath}
        localBody={localContent?.body}
      />
      <Footer />
    </div>
  );
}

function CommunityLegacyArticle({
  page,
  communityPath,
  localBody,
}: {
  page?: GeoCommunityPageSummary;
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
            <h1
              className="mb-4 text-4xl font-bold text-[#1A1A2E]"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              {t(
                "这个社区内容尚未接入",
                "This community page is not yet connected",
              )}
            </h1>
            <Link
              href="/research"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#3D1560] no-underline"
            >
              <ArrowLeft size={14} />{" "}
              {t("返回研究与社区", "Back to Research & Community")}
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const title = zhTitleFor(
    communityPath,
    page?.sourceTitle || page?.h1 || t("GEO 社区内容", "GEO Community Content"),
  );
  const excerpt = zhExcerptFor(
    communityPath,
    page?.description ||
      t(
        "这篇内容来自 GEO 研究与学习社区，现已整合到 FrontMind 阅读场景中。",
        "This content is now integrated into FrontMind.",
      ),
  );

  return (
    <main className="pt-28 md:pt-36">
      <section className="bg-white pb-12">
        <div className="container">
          <Link
            href="/research"
            className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-[#3D1560] no-underline"
          >
            <ArrowLeft size={14} />{" "}
            {t("返回研究与社区", "Back to Research & Community")}
          </Link>
          <div className="max-w-3xl">
            <SectionLabel
              text={t(
                "GEO 研究与学习社区",
                "GEO Research and Learning Community",
              )}
              color="purple"
            />
            <h1
              className="mb-5 text-4xl font-bold leading-tight text-[#1A1A2E] md:text-6xl"
              style={{ fontFamily: "'DM Serif Display', serif" }}
            >
              {title}
            </h1>
            <p
              className="text-base leading-relaxed text-[#6B7280] md:text-lg"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              {excerpt}
            </p>
          </div>
        </div>
      </section>
      <section className="py-12 md:py-16">
        <div className="container">
          <article className="fm-card p-6 md:p-10">
            <div
              className="space-y-6 text-base leading-8 text-[#4B5563]"
              style={{ fontFamily: "'DM Sans', sans-serif" }}
            >
              {(localBody || page?.description || "")
                .split(/\n{2,}/)
                .slice(0, 16)
                .map((paragraph) => (
                  <p key={paragraph}>{paragraph.replace(/^#+\s*/, "")}</p>
                ))}
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}

function canonicalLegacyCommunityPath(path: string) {
  const clean =
    (path.startsWith("/") ? path : `/${path}`).replace(/\/$/, "") || "/";
  if (legacyContentPaths.has(clean)) return clean;

  if (clean.startsWith("/blogs/generative-engine-optimization/")) {
    const slug = clean.slice("/blogs/generative-engine-optimization/".length);
    const topLevelPath = `/${slug}`;
    if (legacyContentPaths.has(topLevelPath)) return topLevelPath;
  }

  return clean;
}
