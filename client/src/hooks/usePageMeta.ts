/* Style Note: This hook adds non-visual metadata only and must never change the rendered FrontMind interface. */
import { useEffect } from "react";

type JsonLd = Record<string, unknown>;

type MetaInput = {
  title: string;
  description: string;
  lang: "zh" | "en";
  canonicalPath?: string;
  image?: string;
  type?: "website" | "article";
  schemaType?: "WebPage" | "AboutPage" | "ContactPage" | "CollectionPage" | "Service";
  structuredData?: JsonLd | JsonLd[] | null;
};

const SITE_NAME = "FrontMind";
const DEFAULT_SITE_URL = "https://www.frontmind.net";
const DEFAULT_IMAGE = "/home/agent-methodology-wide.webp";
const LOGO_IMAGE = "/brand/frontmind-logo.svg";
const AUTHOR = "FrontMind 超前智能";
const KEYWORDS =
  "FrontMind, 超前智能, GEO, Generative Engine Optimization, AI 搜索优化, AI 品牌可见度, 企业 AI 化, 智能体增长, FDE";

function siteUrl() {
  const fromEnv = import.meta.env.VITE_SITE_URL || DEFAULT_SITE_URL;
  return String(fromEnv).replace(/\/+$/, "");
}

function absoluteUrl(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const normalizedPath = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${siteUrl()}${normalizedPath}`;
}

function upsertMeta(name: string, content: string, attribute: "name" | "property" = "name") {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${name}"]`);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, name);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

function upsertLink(rel: string, href: string, extra: Record<string, string> = {}) {
  const selector = Object.entries(extra).reduce(
    (value, [key, entry]) => `${value}[${key}="${entry}"]`,
    `link[rel="${rel}"]`,
  );
  let element = document.head.querySelector<HTMLLinkElement>(selector);
  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", rel);
    Object.entries(extra).forEach(([key, value]) => element?.setAttribute(key, value));
    document.head.appendChild(element);
  }
  element.setAttribute("href", href);
}

function buildStructuredData({
  title,
  description,
  canonicalUrl,
  imageUrl,
  lang,
  schemaType,
  structuredData,
}: {
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string;
  lang: "zh" | "en";
  schemaType?: "WebPage" | "AboutPage" | "ContactPage" | "CollectionPage" | "Service";
  structuredData?: JsonLd | JsonLd[] | null;
}) {
  const graph: JsonLd[] = [
    {
      "@type": "Organization",
      "@id": `${siteUrl()}/#organization`,
      name: "FrontMind 超前智能",
      alternateName: ["FrontMind", "FrontMind AI"],
      url: siteUrl(),
      logo: absoluteUrl(LOGO_IMAGE),
      description:
        lang === "zh"
          ? "FrontMind 超前智能为企业提供 GEO、AI 品牌可见度、智能体增长与企业级 AI 工作流部署服务。"
          : "FrontMind provides GEO, AI brand visibility, agentic growth, and enterprise AI workflow deployment services.",
      sameAs: [],
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl()}/#website`,
      url: siteUrl(),
      name: SITE_NAME,
      publisher: { "@id": `${siteUrl()}/#organization` },
      inLanguage: lang === "zh" ? "zh-CN" : "en",
    },
    {
      "@type": schemaType || "WebPage",
      "@id": `${canonicalUrl}#webpage`,
      url: canonicalUrl,
      name: title,
      description,
      image: imageUrl,
      isPartOf: { "@id": `${siteUrl()}/#website` },
      about: { "@id": `${siteUrl()}/#organization` },
      inLanguage: lang === "zh" ? "zh-CN" : "en",
    },
  ];

  if (structuredData) {
    graph.push(...(Array.isArray(structuredData) ? structuredData : [structuredData]));
  }

  return {
    "@context": "https://schema.org",
    "@graph": graph,
  };
}

export function usePageMeta({
  title,
  description,
  lang,
  canonicalPath,
  image = DEFAULT_IMAGE,
  type = "website",
  schemaType = "WebPage",
  structuredData,
}: MetaInput) {
  useEffect(() => {
    const fallbackPath =
      typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : "/";
    const canonicalUrl = absoluteUrl(canonicalPath || fallbackPath.split("?")[0] || "/");
    const imageUrl = absoluteUrl(image);

    document.title = title;
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";

    upsertLink("canonical", canonicalUrl);
    upsertLink("alternate", canonicalUrl, { hreflang: "zh-CN" });
    upsertLink("alternate", canonicalUrl, { hreflang: "x-default" });

    upsertMeta("title", title);
    upsertMeta("description", description);
    upsertMeta("keywords", KEYWORDS);
    upsertMeta("author", AUTHOR);
    upsertMeta("robots", "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1");
    upsertMeta("theme-color", "#3D1560");
    upsertMeta("og:type", type, "property");
    upsertMeta("og:title", title, "property");
    upsertMeta("og:description", description, "property");
    upsertMeta("og:url", canonicalUrl, "property");
    upsertMeta("og:image", imageUrl, "property");
    upsertMeta("og:site_name", SITE_NAME, "property");
    upsertMeta("og:locale", lang === "zh" ? "zh_CN" : "en_US", "property");
    upsertMeta("twitter:card", "summary_large_image", "name");
    upsertMeta("twitter:title", title, "name");
    upsertMeta("twitter:description", description, "name");
    upsertMeta("twitter:url", canonicalUrl, "name");
    upsertMeta("twitter:image", imageUrl, "name");

    const scriptId = "frontmind-structured-data";
    const existing = document.getElementById(scriptId);
    if (existing) existing.remove();

    const script = document.createElement("script");
    script.id = scriptId;
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(
      buildStructuredData({ title, description, canonicalUrl, imageUrl, lang, schemaType, structuredData }),
    );
    document.head.appendChild(script);

    return () => {
      const current = document.getElementById(scriptId);
      if (current) current.remove();
    };
  }, [title, description, lang, canonicalPath, image, type, schemaType, structuredData]);
}
