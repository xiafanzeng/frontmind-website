type LocalContentMeta = {
  path?: string;
  kind?: string;
  title?: string;
  source_title?: string;
  source_url?: string;
  author?: string;
  date?: string;
  status?: string;
};

export type GeoLocalContent = LocalContentMeta & {
  file: string;
  body: string;
  ready: boolean;
};

type ContentLoader = () => Promise<string>;

const CONTENT_ROOT = "../../content/geo-community/pages";
const contentFiles = import.meta.glob(
  [
    "../../content/geo-community/pages/**/*.md",
    "!../../content/geo-community/pages/blogs/**/*.md",
  ],
  {
    import: "default",
    query: "?raw",
  },
) as Record<string, ContentLoader>;

const contentLoadersByPath = Object.fromEntries(
  Object.entries(contentFiles).map(([file, load]) => [
    routePathForFile(file),
    { file, load },
  ]),
) as Record<string, { file: string; load: ContentLoader } | undefined>;

export const geoLocalContentPaths = Object.keys(contentLoadersByPath);

function parseFrontmatter(raw: string): {
  meta: LocalContentMeta;
  body: string;
} {
  if (!raw.startsWith("---")) return { meta: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { meta: {}, body: raw };

  const frontmatter = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).trim();
  const meta: LocalContentMeta = {};

  for (const line of frontmatter.split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim() as keyof LocalContentMeta;
    const rawValue = line.slice(separator + 1).trim();
    try {
      meta[key] = JSON.parse(rawValue);
    } catch {
      meta[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  }

  return { meta, body };
}

function bodyCharacters(body: string) {
  return body.replace(/^#+\s.+$/gm, "").replace(/\s+/g, "").length;
}

export async function loadGeoLocalContent(
  routePath: string,
): Promise<GeoLocalContent | undefined> {
  const entry = contentLoadersByPath[routePath];
  if (!entry) return undefined;

  const parsed = parseFrontmatter(await entry.load());
  if (!parsed.meta.path) return undefined;

  return {
    file: entry.file,
    ...parsed.meta,
    body: parsed.body,
    ready: parsed.meta.status === "ready" && bodyCharacters(parsed.body) > 300,
  };
}

function routePathForFile(file: string) {
  const relativePath = file
    .slice(CONTENT_ROOT.length)
    .replace(/\.md$/, "")
    .replace(/\/index$/, "");
  return relativePath || "/";
}
