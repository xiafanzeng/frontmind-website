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

const contentFiles = import.meta.glob("../../content/geo-community/pages/**/*.md", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

function parseFrontmatter(raw: string): { meta: LocalContentMeta; body: string } {
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

export const geoLocalContent = Object.entries(contentFiles)
  .map(([file, raw]) => {
    const parsed = parseFrontmatter(raw);
    return {
      file,
      ...parsed.meta,
      body: parsed.body,
      ready: parsed.meta.status === "ready" && bodyCharacters(parsed.body) > 300,
    };
  })
  .filter((content): content is GeoLocalContent & { path: string } => Boolean(content.path));

export const geoLocalContentByPath = Object.fromEntries(
  geoLocalContent.map((content) => [content.path, content]),
) as Record<string, GeoLocalContent | undefined>;
