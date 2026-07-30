import { isIP } from "node:net";
import path from "node:path";
import JSZip from "jszip";
import { z } from "zod";

const MAX_CANDIDATE_BYTES = 100 * 1024 * 1024;
const MAX_ENTRY_COUNT = 500;
const MAX_DECLARED_UNCOMPRESSED_BYTES = 220 * 1024 * 1024;
const MAX_TEXT_BYTES = 12 * 1024 * 1024;
const MAX_SINGLE_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_SINGLE_ASSET_BYTES = 8 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 200;
const ALLOWED_EXTENSIONS = new Set([
  ".md",
  ".json",
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
]);
const IMAGE_EXTENSIONS = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
]);

export const WEBSITE_KB_CANDIDATE_PROFILE = "website-lead-candidate-v1";

export const FACT_DIMENSIONS = [
  ["D01", "企业基础"],
  ["D02", "团队"],
  ["D03", "产品服务"],
  ["D04", "技术能力"],
  ["D05", "客户案例"],
  ["D06", "资质认证"],
  ["D07", "财务融资"],
  ["D08", "竞争信息"],
  ["D09", "市场信息"],
  ["D10", "品牌资产"],
  ["D11", "渠道"],
  ["D12", "公开意图"],
  ["D13", "公共情报"],
] as const;

export const CUSTOMER_SECTIONS = [
  "企业与品牌",
  "团队与组织",
  "产品与服务",
  "技术与交付",
  "客户与行业",
  "服务与合作",
  "可信优势",
] as const;

const CandidateSourceSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    kind: z.enum([
      "official_web",
      "official_document",
      "user_upload",
      "authoritative",
      "reputable_media",
      "other",
    ]),
    status: z.enum(["read", "partial", "failed"]),
    url: z.string().trim().max(4_000).optional(),
    attachmentName: z.string().trim().min(1).max(512).optional(),
  })
  .passthrough();

const CandidateAssetSchema = z
  .object({
    path: z.string().trim().min(1).max(600),
    type: z.literal("brand_identity"),
    sourceKind: z
      .enum(["official_web", "official_document", "user_upload"])
      .catch("official_web"),
    sourcePageUrl: z.string().trim().max(4_000).optional(),
    sourceAssetUrl: z.string().trim().max(4_000).optional(),
    sourceDocumentName: z.string().trim().min(1).max(512).optional(),
    caption: z.string().trim().min(1).max(500),
  })
  .passthrough();

const CandidateRunSchema = z
  .object({
    schemaVersion: z.literal(1),
    company: z
      .object({
        name: z.string().trim().min(1).max(200),
        officialWebsite: z.string().trim().max(4_000).optional().nullable(),
        industryCluster: z
          .enum(["C1", "C2", "C3", "C4", "C5", "C6"])
          .optional(),
      })
      .passthrough(),
    sources: z.array(CandidateSourceSchema).max(500).optional().default([]),
    queries: z
      .array(z.string().trim().min(1).max(500))
      .max(100)
      .optional()
      .default([]),
    assets: z.array(CandidateAssetSchema).max(1).optional().default([]),
  })
  .passthrough();

export type CandidateSource = z.infer<typeof CandidateSourceSchema> & {
  normalizedUrl?: string;
};
export type CandidateAsset = z.infer<typeof CandidateAssetSchema>;
export type CandidateRun = z.infer<typeof CandidateRunSchema>;

export type ParsedCandidate = {
  profile: typeof WEBSITE_KB_CANDIDATE_PROFILE;
  factsMarkdown: string;
  customerMarkdown: string;
  factSections: Map<string, string>;
  customerSections: Map<string, string>;
  run?: CandidateRun;
  sources: CandidateSource[];
  assets: Array<CandidateAsset & { bytes: Buffer; archivePath: string }>;
  diagnostics: string[];
  metrics: {
    citedSourceCount: number;
    factCharacters: number;
    customerCharacters: number;
    coveredFactDimensions: number;
  };
};

export class KnowledgeBaseCandidateError extends Error {
  constructor(
    message: string,
    public readonly category: "unsafe" | "structure" | "content",
  ) {
    super(message);
    this.name = "KnowledgeBaseCandidateError";
  }
}

function declaredEntrySize(entry: JSZip.JSZipObject) {
  const data = (
    entry as JSZip.JSZipObject & {
      _data?: { uncompressedSize?: number };
    }
  )._data;
  return Number(data?.uncompressedSize || 0);
}

function declaredCompressedEntrySize(entry: JSZip.JSZipObject) {
  const data = (
    entry as JSZip.JSZipObject & {
      _data?: { compressedSize?: number };
    }
  )._data;
  return Number(data?.compressedSize || 0);
}

function normalizeEntryPath(value: string) {
  const raw = value.replace(/\\/g, "/").normalize("NFKC");
  if (
    !raw ||
    raw.includes("\0") ||
    raw.startsWith("/") ||
    /^[A-Za-z]:\//.test(raw)
  ) {
    throw new KnowledgeBaseCandidateError(
      `Candidate archive contains an unsafe path: ${value}`,
      "unsafe",
    );
  }
  const normalized = path.posix.normalize(raw).replace(/^\.\/+/, "");
  if (
    !normalized ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.split("/").includes("..")
  ) {
    throw new KnowledgeBaseCandidateError(
      `Candidate archive contains path traversal: ${value}`,
      "unsafe",
    );
  }
  return normalized.replace(/\/+$/, "");
}

function commonWrapper(paths: string[]) {
  if (!paths.length) return "";
  const firstSegments = new Set(paths.map((value) => value.split("/")[0]));
  if (firstSegments.size !== 1) return "";
  const first = paths[0]!.split("/")[0]!;
  return paths.every((value) => value.includes("/")) ? `${first}/` : "";
}

function readLimited(
  entry: JSZip.JSZipObject,
  maxBytes: number,
): Promise<Buffer> {
  if (declaredEntrySize(entry) > maxBytes) {
    throw new KnowledgeBaseCandidateError(
      `Candidate entry is too large: ${entry.name}`,
      "unsafe",
    );
  }
  return entry.async("nodebuffer").then((bytes) => {
    if (bytes.byteLength > maxBytes) {
      throw new KnowledgeBaseCandidateError(
        `Candidate entry exceeds its byte limit: ${entry.name}`,
        "unsafe",
      );
    }
    return bytes;
  });
}

function sectionMap(markdown: string) {
  const sections = new Map<string, string>();
  const matches = Array.from(markdown.matchAll(/^##\s+(.+?)\s*$/gm));
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]!;
    const title = match[1]!.normalize("NFKC").trim();
    const start = (match.index || 0) + match[0].length;
    const end = matches[index + 1]?.index ?? markdown.length;
    sections.set(title, markdown.slice(start, end).trim());
  }
  return sections;
}

function effectiveCharacters(value: string) {
  return Array.from(
    value
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/!\[[^\]]*]\([^)]*\)/g, "")
      .replace(/\[(?:来源|企业主张|权威来源|第三方来源)]\([^)]*\)/g, "")
      .replace(/https?:\/\/[^\s)>\]]+/gi, "")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^\s*\|?[\s:|-]+\|?\s*$/gm, "")
      .replace(/\[(?:待核验|上传文件：[^\]]+)]/g, "")
      .replace(/\s/g, "")
      .replace(
        /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~，。！？；：“”‘’（）【】《》…—·]/g,
        "",
      ),
  ).length;
}

function publicHttpUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
      return undefined;
    const hostname = url.hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, "")
      .replace(/\.$/, "");
    if (
      !hostname ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname === "metadata.google.internal"
    ) {
      return undefined;
    }
    const family = isIP(hostname);
    if (family === 4) {
      const octets = hostname.split(".").map(Number);
      if (
        octets[0] === 10 ||
        octets[0] === 127 ||
        octets[0] === 0 ||
        (octets[0] === 169 && octets[1] === 254) ||
        (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31) ||
        (octets[0] === 192 && octets[1] === 168) ||
        (octets[0] === 100 && octets[1]! >= 64 && octets[1]! <= 127)
      ) {
        return undefined;
      }
    }
    if (
      family === 6 &&
      (hostname === "::1" ||
        hostname === "::" ||
        /^f[cd]/i.test(hostname) ||
        /^fe[89ab]/i.test(hostname))
    ) {
      return undefined;
    }
    url.hash = "";
    if (
      (url.protocol === "http:" && url.port === "80") ||
      (url.protocol === "https:" && url.port === "443")
    ) {
      url.port = "";
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function sourceKindForMarker(marker: string): CandidateSource["kind"] {
  if (marker === "权威来源") return "authoritative";
  if (marker === "第三方来源") return "reputable_media";
  return "official_web";
}

function sourcesFromMarkdown(markdown: string) {
  const sources: CandidateSource[] = [];
  for (const match of Array.from(
    markdown.matchAll(
      /\[(来源|企业主张|权威来源|第三方来源)]\((https?:\/\/[^)\s]+)\)/g,
    ),
  )) {
    const normalizedUrl = publicHttpUrl(match[2]);
    if (!normalizedUrl) continue;
    sources.push({
      title: new URL(normalizedUrl).hostname,
      kind: sourceKindForMarker(match[1]!),
      status: "read",
      url: normalizedUrl,
      normalizedUrl,
    });
  }
  for (const match of Array.from(
    markdown.matchAll(/\[上传文件：([^\]]+)]/g),
  )) {
    sources.push({
      title: match[1]!.trim(),
      kind: "user_upload",
      status: "read",
      attachmentName: match[1]!.trim(),
    });
  }
  return sources;
}

function deduplicateSources(sources: CandidateSource[]) {
  const unique = new Map<string, CandidateSource>();
  for (const source of sources) {
    const normalizedUrl = publicHttpUrl(source.url);
    const key = normalizedUrl
      ? `url:${normalizedUrl}`
      : source.attachmentName
        ? `upload:${source.attachmentName.normalize("NFKC").toLowerCase()}`
        : "";
    if (!key) continue;
    const existing = unique.get(key);
    const candidate = {
      ...source,
      ...(normalizedUrl ? { url: normalizedUrl, normalizedUrl } : {}),
    };
    if (!existing || existing.status === "failed") unique.set(key, candidate);
  }
  return Array.from(unique.values()).sort((left, right) => {
    const leftKey = left.normalizedUrl || left.attachmentName || left.title;
    const rightKey = right.normalizedUrl || right.attachmentName || right.title;
    return leftKey.localeCompare(rightKey, "zh-CN");
  });
}

function requiredHeading(
  sections: Map<string, string>,
  expected: string,
  aliases: string[] = [],
) {
  if (sections.has(expected)) return expected;
  const normalizeHeading = (value: string) =>
    value
      .normalize("NFKC")
      .replace(/[\s:：\-–—_]+/g, "")
      .replace(/[。；;]+$/g, "")
      .toLowerCase();
  const normalizedExpected = normalizeHeading(expected);
  return Array.from(sections.keys()).find((title) => {
    const normalized = normalizeHeading(title);
    return (
      normalized === normalizedExpected ||
      aliases.some((alias) => normalized === normalizeHeading(alias))
    );
  });
}

function sectionValue(
  sections: Map<string, string>,
  expected: string,
  aliases: string[] = [],
) {
  const key = requiredHeading(sections, expected, aliases);
  return key ? sections.get(key)?.trim() || "" : "";
}

const CUSTOMER_FACT_DIMENSIONS: Record<
  (typeof CUSTOMER_SECTIONS)[number],
  string[]
> = {
  企业与品牌: ["D01", "D10"],
  团队与组织: ["D02"],
  产品与服务: ["D03"],
  技术与交付: ["D04", "D06"],
  客户与行业: ["D05", "D09", "D13"],
  服务与合作: ["D11", "D12"],
  可信优势: ["D04", "D06", "D07", "D08"],
};

const FACT_CUSTOMER_SECTION = new Map(
  Object.entries(CUSTOMER_FACT_DIMENSIONS).flatMap(([section, dimensions]) =>
    dimensions.map((dimension) => [dimension, section]),
  ),
);

function gapFor(title: string) {
  return `公开资料暂未提供${title}的可核验信息。[待核验]`;
}

function canonicalMarkdown(
  headings: readonly (readonly [string, string] | string)[],
  sections: Map<string, string>,
) {
  return headings
    .map((heading) => {
      const key = typeof heading === "string" ? heading : heading[0];
      const title =
        typeof heading === "string"
          ? heading
          : `${heading[0]} ${heading[1]}`;
      return `## ${title}\n\n${sections.get(key) || gapFor(title)}`;
    })
    .join("\n\n");
}

export async function parseKnowledgeBaseCandidate(
  input: Buffer,
): Promise<ParsedCandidate> {
  if (!input.length || input.byteLength > MAX_CANDIDATE_BYTES) {
    throw new KnowledgeBaseCandidateError(
      "Candidate archive is empty or exceeds 100 MB",
      "unsafe",
    );
  }
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(input, {
      checkCRC32: false,
      createFolders: false,
    });
  } catch (error) {
    throw new KnowledgeBaseCandidateError(
      `Candidate archive cannot be opened: ${
        error instanceof Error ? error.message : String(error)
      }`,
      "structure",
    );
  }
  const entries = Object.values(zip.files);
  if (entries.length > MAX_ENTRY_COUNT) {
    throw new KnowledgeBaseCandidateError(
      "Candidate archive contains too many entries",
      "unsafe",
    );
  }
  const declaredBytes = entries.reduce(
    (total, entry) => total + declaredEntrySize(entry),
    0,
  );
  if (declaredBytes > MAX_DECLARED_UNCOMPRESSED_BYTES) {
    throw new KnowledgeBaseCandidateError(
      "Candidate archive exceeds 220 MB uncompressed",
      "unsafe",
    );
  }
  const files = entries
    .filter((entry) => !entry.dir)
    .map((entry) => {
      const originalName = (
        entry as JSZip.JSZipObject & { unsafeOriginalName?: string }
      ).unsafeOriginalName;
      const normalizedPath = normalizeEntryPath(originalName || entry.name);
      const permissions =
        typeof entry.unixPermissions === "number"
          ? entry.unixPermissions
          : Number.parseInt(String(entry.unixPermissions || ""), 8);
      if (
        Number.isFinite(permissions) &&
        (permissions & 0o170000) === 0o120000
      ) {
        throw new KnowledgeBaseCandidateError(
          `Candidate archive contains a symbolic link: ${normalizedPath}`,
          "unsafe",
        );
      }
      const uncompressed = declaredEntrySize(entry);
      const compressed = declaredCompressedEntrySize(entry);
      if (
        uncompressed > 1024 * 1024 &&
        compressed > 0 &&
        uncompressed / compressed > MAX_COMPRESSION_RATIO
      ) {
        throw new KnowledgeBaseCandidateError(
          `Candidate entry has an unsafe compression ratio: ${normalizedPath}`,
          "unsafe",
        );
      }
      return { entry, path: normalizedPath };
    })
    .filter(
      (file) =>
        !file.path.startsWith("__MACOSX/") &&
        path.posix.basename(file.path) !== ".DS_Store",
    );
  const wrapper = commonWrapper(files.map((file) => file.path));
  const normalizedFiles = files.map((file) => ({
    ...file,
    path: wrapper ? file.path.slice(wrapper.length) : file.path,
  }));
  const pathKeys = normalizedFiles.map((file) =>
    file.path.normalize("NFKC").toLowerCase(),
  );
  if (new Set(pathKeys).size !== pathKeys.length) {
    throw new KnowledgeBaseCandidateError(
      "Candidate archive contains duplicate normalized paths",
      "unsafe",
    );
  }
  for (const file of normalizedFiles) {
    const extension = path.posix.extname(file.path).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      throw new KnowledgeBaseCandidateError(
        `Candidate archive contains an unsupported file: ${file.path}`,
        "unsafe",
      );
    }
    if (
      [".md", ".json"].includes(extension) &&
      ![
        "00_brand_facts.md",
        "01_customer_draft.md",
        "02_run.json",
      ].includes(file.path)
    ) {
      throw new KnowledgeBaseCandidateError(
        `Candidate archive contains an unexpected text file: ${file.path}`,
        "structure",
      );
    }
  }
  const declaredTextBytes = normalizedFiles
    .filter((file) =>
      [".md", ".json"].includes(
        path.posix.extname(file.path).toLowerCase(),
      ),
    )
    .reduce((total, file) => total + declaredEntrySize(file.entry), 0);
  if (declaredTextBytes > MAX_TEXT_BYTES) {
    throw new KnowledgeBaseCandidateError(
      "Candidate archive exceeds the 12 MB text budget",
      "unsafe",
    );
  }
  const byPath = new Map(normalizedFiles.map((file) => [file.path, file.entry]));
  const factsEntry = byPath.get("00_brand_facts.md");
  const customerEntry = byPath.get("01_customer_draft.md");
  if (!factsEntry && !customerEntry) {
    throw new KnowledgeBaseCandidateError(
      "Candidate archive must contain 00_brand_facts.md or 01_customer_draft.md",
      "structure",
    );
  }
  const [factsBytes, customerBytes] = await Promise.all([
    factsEntry
      ? readLimited(factsEntry, MAX_SINGLE_TEXT_BYTES)
      : Promise.resolve(Buffer.alloc(0)),
    customerEntry
      ? readLimited(customerEntry, MAX_SINGLE_TEXT_BYTES)
      : Promise.resolve(Buffer.alloc(0)),
  ]);
  if (factsBytes.byteLength + customerBytes.byteLength > MAX_TEXT_BYTES) {
    throw new KnowledgeBaseCandidateError(
      "Candidate Markdown exceeds the text budget",
      "unsafe",
    );
  }
  const rawFactsMarkdown = factsBytes.toString("utf8");
  const rawCustomerMarkdown = customerBytes.toString("utf8");
  const rawFactSections = sectionMap(rawFactsMarkdown);
  const rawCustomerSections = sectionMap(rawCustomerMarkdown);
  const factSections = new Map<string, string>();
  const customerSections = new Map<string, string>();
  const diagnostics: string[] = [];
  if (!factsEntry) diagnostics.push("Recovered missing 00_brand_facts.md");
  if (!customerEntry) diagnostics.push("Recovered missing 01_customer_draft.md");
  for (const [id, title] of FACT_DIMENSIONS) {
    const key = requiredHeading(rawFactSections, `${id} ${title}`, [
      `${id}-${title}`,
      `${id}：${title}`,
    ]);
    const direct = key ? rawFactSections.get(key)?.trim() : "";
    if (direct) {
      factSections.set(id, direct);
      continue;
    }
    const customerTitle = FACT_CUSTOMER_SECTION.get(id);
    const fallback = customerTitle
      ? sectionValue(rawCustomerSections, customerTitle)
      : "";
    factSections.set(id, fallback || gapFor(title));
    diagnostics.push(`Recovered fact heading ${id} ${title}`);
  }
  for (const title of CUSTOMER_SECTIONS) {
    const key = requiredHeading(rawCustomerSections, title);
    const direct = key ? rawCustomerSections.get(key)?.trim() : "";
    if (direct) {
      customerSections.set(title, direct);
      continue;
    }
    const fallback = CUSTOMER_FACT_DIMENSIONS[title]
      .map((dimension) => factSections.get(dimension) || "")
      .filter(Boolean)
      .join("\n\n");
    customerSections.set(title, fallback || gapFor(title));
    diagnostics.push(`Recovered customer heading ${title}`);
  }

  const factsMarkdown = canonicalMarkdown(FACT_DIMENSIONS, factSections);
  const customerMarkdown = canonicalMarkdown(CUSTOMER_SECTIONS, customerSections);
  let run: CandidateRun | undefined;
  const runEntry = byPath.get("02_run.json");
  if (runEntry) {
    try {
      const runBytes = await readLimited(runEntry, MAX_SINGLE_TEXT_BYTES);
      const parsed = CandidateRunSchema.safeParse(
        JSON.parse(runBytes.toString("utf8")),
      );
      if (parsed.success) run = parsed.data;
      else diagnostics.push("02_run.json did not match candidate schema");
    } catch {
      diagnostics.push("02_run.json could not be parsed and was ignored");
    }
  }
  const runSources = (run?.sources || []).map((source) => ({
    ...source,
    ...(source.url ? { normalizedUrl: publicHttpUrl(source.url) } : {}),
  }));
  const sources = deduplicateSources([
    ...runSources,
    ...sourcesFromMarkdown(factsMarkdown),
    ...sourcesFromMarkdown(customerMarkdown),
  ]);
  const assetMetadata = new Map(
    (run?.assets || []).map((asset) => [
      normalizeEntryPath(asset.path).toLowerCase(),
      asset,
    ]),
  );
  const assets: ParsedCandidate["assets"] = [];
  for (const file of normalizedFiles) {
    const extension = path.posix.extname(file.path).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) continue;
    if (!/^assets\/logo\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(file.path)) {
      diagnostics.push(`Ignored non-logo image: ${file.path}`);
      continue;
    }
    const metadata = assetMetadata.get(file.path.toLowerCase());
    if (!metadata) {
      diagnostics.push(`Ignored image without 02_run.json metadata: ${file.path}`);
      continue;
    }
    if (metadata.type !== "brand_identity") {
      diagnostics.push(`Ignored non-logo asset metadata: ${file.path}`);
      continue;
    }
    if (assets.length >= 1) {
      diagnostics.push(`Ignored image beyond one-logo limit: ${file.path}`);
      continue;
    }
    const bytes = await readLimited(file.entry, MAX_SINGLE_ASSET_BYTES);
    assets.push({ ...metadata, bytes, archivePath: file.path });
  }

  const citedSourceCount = new Set(
    [
      ...sourcesFromMarkdown(factsMarkdown),
      ...sourcesFromMarkdown(customerMarkdown),
    ].map(
      (source) =>
        source.normalizedUrl ||
        source.attachmentName?.normalize("NFKC").toLowerCase(),
    ),
  ).size;
  const coveredFactDimensions = Array.from(factSections.values()).filter(
    (value) =>
      effectiveCharacters(value) > 0 &&
      !(
        /\[待核验]/.test(value) &&
        !/\[(?:来源|企业主张|权威来源|第三方来源)]\(/.test(value) &&
        !/\[上传文件：/.test(value)
      ),
  ).length;

  return {
    profile: WEBSITE_KB_CANDIDATE_PROFILE,
    factsMarkdown,
    customerMarkdown,
    factSections,
    customerSections,
    run,
    sources,
    assets,
    diagnostics,
    metrics: {
      citedSourceCount,
      factCharacters: effectiveCharacters(factsMarkdown),
      customerCharacters: effectiveCharacters(customerMarkdown),
      coveredFactDimensions,
    },
  };
}
