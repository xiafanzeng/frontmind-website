import { isIP } from "node:net";
import { createHash } from "node:crypto";
import path from "node:path";
import JSZip from "jszip";
import { z } from "zod";

const MAX_CANDIDATE_BYTES = 100 * 1024 * 1024;
const MAX_ENTRY_COUNT = 500;
const MAX_DECLARED_UNCOMPRESSED_BYTES = 220 * 1024 * 1024;
const MAX_TEXT_BYTES = 12 * 1024 * 1024;
const MAX_SINGLE_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_SINGLE_ASSET_BYTES = 8 * 1024 * 1024;
const MAX_SINGLE_ENTRY_BYTES = 100 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 200;
const WEBSITE_V2_MAX_SOURCE_RECORDS = 30;
const WEBSITE_V2_MAX_PUBLIC_PAGE_ATTEMPTS = 16;
const WEBSITE_V2_MAX_WEB_QUERIES = 4;
const WEBSITE_V2_MAX_OFFICIAL_DOCUMENTS = 4;
const WEBSITE_V2_MAX_CUSTOMER_CHARACTERS = 40_000;
const UNSAFE_EXTRA_EXTENSIONS = new Set([
  ".app",
  ".bat",
  ".bin",
  ".cmd",
  ".com",
  ".dll",
  ".dylib",
  ".exe",
  ".jar",
  ".msi",
  ".ps1",
  ".scr",
  ".sh",
  ".so",
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

export const WEBSITE_V2_SECTION_CONTENT_FLOORS: Record<
  (typeof CUSTOMER_SECTIONS)[number],
  number
> = {
  企业与品牌: 500,
  团队与组织: 500,
  产品与服务: 2_500,
  技术与交付: 1_000,
  客户与行业: 600,
  服务与合作: 600,
  可信优势: 600,
};

export const WEBSITE_V2_SECTION_H3_RANGES: Record<
  (typeof CUSTOMER_SECTIONS)[number],
  readonly [minimum: number, maximum: number]
> = {
  企业与品牌: [1, 2],
  团队与组织: [1, 2],
  产品与服务: [2, 5],
  技术与交付: [2, 3],
  客户与行业: [1, 3],
  服务与合作: [1, 2],
  可信优势: [1, 2],
};

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
    bytes: z.number().int().positive().max(MAX_SINGLE_ASSET_BYTES).optional(),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/i)
      .optional(),
    mimeType: z
      .enum([
        "image/avif",
        "image/gif",
        "image/jpeg",
        "image/png",
        "image/svg+xml",
        "image/webp",
      ])
      .optional(),
  })
  .passthrough();

const CandidateCompanySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    officialWebsite: z.string().trim().max(4_000).optional().nullable(),
    industryCluster: z.enum(["C1", "C2", "C3", "C4", "C5", "C6"]).optional(),
  })
  .passthrough();

const CandidateRunBaseSchema = z
  .object({
    company: CandidateCompanySchema,
    assets: z.array(CandidateAssetSchema).max(1).optional().default([]),
  })
  .passthrough();

const ContentFloorExceptionSchema = z
  .object({
    section: z.enum(CUSTOMER_SECTIONS),
    reason: z.string().trim().min(1).max(1_000),
    attemptedSourceUrls: z
      .array(z.string().trim().min(1).max(4_000))
      .min(3)
      .max(16),
  })
  .passthrough();

const CandidateRunV1Schema = CandidateRunBaseSchema.extend({
  schemaVersion: z.literal(1),
  sources: z.array(CandidateSourceSchema).max(500).optional().default([]),
  queries: z
    .array(z.string().trim().min(1).max(500))
    .max(100)
    .optional()
    .default([]),
}).passthrough();

const CandidateRunV2Schema = CandidateRunBaseSchema.extend({
  schemaVersion: z.literal(2),
  sources: z
    .array(CandidateSourceSchema)
    .max(WEBSITE_V2_MAX_SOURCE_RECORDS)
    .optional()
    .default([]),
  queries: z
    .array(z.string().trim().min(1).max(500))
    .max(WEBSITE_V2_MAX_WEB_QUERIES)
    .optional()
    .default([]),
  contentFloorExceptions: z
    .array(ContentFloorExceptionSchema)
    .max(CUSTOMER_SECTIONS.length)
    .optional()
    .default([]),
  stopReason: z.enum([
    "coverage_complete",
    "source_exhausted",
    "budget_reached",
  ]),
}).passthrough();

const CandidateRunSchema = z.discriminatedUnion("schemaVersion", [
  CandidateRunV1Schema,
  CandidateRunV2Schema,
]);

export type CandidateSource = z.infer<typeof CandidateSourceSchema> & {
  normalizedUrl?: string;
};
export type CandidateAsset = z.infer<typeof CandidateAssetSchema>;
export type CandidateRun = z.infer<typeof CandidateRunSchema>;

export type ParsedCandidateAsset = {
  path: string;
  type: "brand_identity";
  sourceKind: "official_web" | "official_document" | "user_upload";
  sourcePageUrl?: string;
  sourceAssetUrl?: string;
  sourceDocumentName?: string;
  caption: string;
  sha256?: string;
  mimeType?:
    | "image/avif"
    | "image/gif"
    | "image/jpeg"
    | "image/png"
    | "image/svg+xml"
    | "image/webp";
  bytes: Buffer;
  archivePath: string;
};

export const CANDIDATE_QUALITY_WARNING_CODES = [
  "UPLOAD_COVERAGE_INCOMPLETE",
  "RUN_METADATA_INCOMPLETE",
  "SOURCE_METADATA_DROPPED",
  "H3_COVERAGE_INCOMPLETE",
  "CONTENT_COVERAGE_INCOMPLETE",
  "RESEARCH_BUDGET_DRIFT",
  "OPTIONAL_ASSET_SKIPPED",
] as const;

export type CandidateQualityWarningCode =
  (typeof CANDIDATE_QUALITY_WARNING_CODES)[number];

export type ParsedCandidate = {
  profile: typeof WEBSITE_KB_CANDIDATE_PROFILE;
  factsMarkdown: string;
  customerMarkdown: string;
  factSections: Map<string, string>;
  customerSections: Map<string, string>;
  run?: CandidateRun;
  sources: CandidateSource[];
  assets: ParsedCandidateAsset[];
  diagnostics: string[];
  qualityWarnings: CandidateQualityWarningCode[];
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

function addQualityWarning(
  warnings: CandidateQualityWarningCode[],
  code: CandidateQualityWarningCode,
) {
  if (!warnings.includes(code)) warnings.push(code);
}

function asCandidateRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizedCandidateRun(
  rawRun: unknown,
  diagnostics: string[],
  qualityWarnings: CandidateQualityWarningCode[],
): CandidateRun | undefined {
  const record = asCandidateRecord(rawRun);
  const schemaVersion = record?.schemaVersion;
  if (!record || (schemaVersion !== 1 && schemaVersion !== 2)) {
    addQualityWarning(qualityWarnings, "RUN_METADATA_INCOMPLETE");
    diagnostics.push("02_run.json did not match a supported schema marker");
    return undefined;
  }

  const rawCompany = asCandidateRecord(record.company);
  const companyName = z
    .string()
    .trim()
    .min(1)
    .max(200)
    .safeParse(rawCompany?.name);
  const normalizedCompany: CandidateRun["company"] = {
    name: companyName.success ? companyName.data : "待核验企业",
    officialWebsite: null,
  };
  if (!rawCompany || !companyName.success) {
    addQualityWarning(qualityWarnings, "RUN_METADATA_INCOMPLETE");
    diagnostics.push("02_run.json company metadata was unusable");
  }
  if (rawCompany?.officialWebsite != null) {
    const officialWebsite =
      typeof rawCompany.officialWebsite === "string"
        ? publicHttpUrl(rawCompany.officialWebsite)
        : undefined;
    if (officialWebsite) {
      normalizedCompany.officialWebsite = officialWebsite;
    } else {
      addQualityWarning(qualityWarnings, "SOURCE_METADATA_DROPPED");
    }
  }
  const industryCluster = z
    .enum(["C1", "C2", "C3", "C4", "C5", "C6"])
    .safeParse(rawCompany?.industryCluster);
  if (industryCluster.success) {
    normalizedCompany.industryCluster = industryCluster.data;
  } else if (rawCompany?.industryCluster !== undefined) {
    addQualityWarning(qualityWarnings, "RUN_METADATA_INCOMPLETE");
  }

  const rawSources = Array.isArray(record.sources) ? record.sources : [];
  if (!Array.isArray(record.sources) && record.sources !== undefined) {
    addQualityWarning(qualityWarnings, "RUN_METADATA_INCOMPLETE");
  }
  const sourceLimit = schemaVersion === 2 ? WEBSITE_V2_MAX_SOURCE_RECORDS : 500;
  if (rawSources.length > sourceLimit) {
    addQualityWarning(qualityWarnings, "RESEARCH_BUDGET_DRIFT");
  }
  const sources: CandidateSource[] = [];
  for (const rawSource of rawSources.slice(0, sourceLimit)) {
    const parsed = CandidateSourceSchema.safeParse(rawSource);
    if (!parsed.success) {
      addQualityWarning(qualityWarnings, "SOURCE_METADATA_DROPPED");
      continue;
    }
    const source = { ...parsed.data } as CandidateSource;
    if (source.kind === "user_upload" && !source.attachmentName) {
      addQualityWarning(qualityWarnings, "SOURCE_METADATA_DROPPED");
      continue;
    }
    if (source.kind !== "user_upload" && !source.url) {
      addQualityWarning(qualityWarnings, "SOURCE_METADATA_DROPPED");
      continue;
    }
    if (source.url) {
      const normalizedUrl = publicHttpUrl(source.url);
      if (!normalizedUrl) {
        addQualityWarning(qualityWarnings, "SOURCE_METADATA_DROPPED");
        continue;
      }
      source.url = normalizedUrl;
      source.normalizedUrl = normalizedUrl;
    }
    sources.push(source);
  }

  const rawQueries = Array.isArray(record.queries) ? record.queries : [];
  const queryLimit = schemaVersion === 2 ? WEBSITE_V2_MAX_WEB_QUERIES : 100;
  if (rawQueries.length > queryLimit) {
    addQualityWarning(qualityWarnings, "RESEARCH_BUDGET_DRIFT");
  }
  const queries = rawQueries.slice(0, queryLimit).flatMap((query) => {
    const parsed = z.string().trim().min(1).max(500).safeParse(query);
    if (!parsed.success) {
      addQualityWarning(qualityWarnings, "RUN_METADATA_INCOMPLETE");
      return [];
    }
    return [parsed.data];
  });

  const rawAssets = Array.isArray(record.assets) ? record.assets : [];
  if (rawAssets.length > 1) {
    addQualityWarning(qualityWarnings, "OPTIONAL_ASSET_SKIPPED");
  }
  const assets: CandidateAsset[] = [];
  for (const rawAsset of rawAssets.slice(0, 16)) {
    const parsed = CandidateAssetSchema.safeParse(rawAsset);
    if (!parsed.success) {
      addQualityWarning(qualityWarnings, "OPTIONAL_ASSET_SKIPPED");
      continue;
    }
    const asset = { ...parsed.data };
    for (const property of ["sourcePageUrl", "sourceAssetUrl"] as const) {
      const value = asset[property];
      if (!value) continue;
      const normalizedUrl = publicHttpUrl(value);
      if (normalizedUrl) {
        asset[property] = normalizedUrl;
      } else {
        delete asset[property];
        addQualityWarning(qualityWarnings, "SOURCE_METADATA_DROPPED");
        addQualityWarning(qualityWarnings, "OPTIONAL_ASSET_SKIPPED");
      }
    }
    assets.push(asset);
    break;
  }

  if (schemaVersion === 1) {
    return {
      schemaVersion,
      company: normalizedCompany,
      sources,
      queries,
      assets,
    };
  }

  const rawExceptions = Array.isArray(record.contentFloorExceptions)
    ? record.contentFloorExceptions
    : [];
  const contentFloorExceptions = rawExceptions
    .slice(0, CUSTOMER_SECTIONS.length)
    .flatMap((exception) => {
      const parsed = ContentFloorExceptionSchema.safeParse(exception);
      if (!parsed.success) {
        addQualityWarning(qualityWarnings, "CONTENT_COVERAGE_INCOMPLETE");
        return [];
      }
      return [parsed.data];
    });
  const stopReason = [
    "coverage_complete",
    "source_exhausted",
    "budget_reached",
  ].includes(String(record.stopReason || ""))
    ? (record.stopReason as
        | "coverage_complete"
        | "source_exhausted"
        | "budget_reached")
    : "source_exhausted";
  if (stopReason !== record.stopReason) {
    addQualityWarning(qualityWarnings, "RUN_METADATA_INCOMPLETE");
  }
  return {
    schemaVersion,
    company: normalizedCompany,
    sources,
    queries,
    assets,
    contentFloorExceptions,
    stopReason,
  };
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

function decodeUtf8(bytes: Buffer, filename: string) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new KnowledgeBaseCandidateError(
      `Candidate text file is not valid UTF-8: ${filename}`,
      "content",
    );
  }
}

const CORE_CANDIDATE_FILENAMES = new Set([
  "00_brand_facts.md",
  "01_customer_draft.md",
  "02_run.json",
]);

function candidateRootFor(filePath: string) {
  const basename = path.posix.basename(filePath).toLowerCase();
  if (!CORE_CANDIDATE_FILENAMES.has(basename)) return undefined;
  const dirname = path.posix.dirname(filePath);
  return dirname === "." ? "" : dirname;
}

function selectCandidateRoot(files: Array<{ path: string }>) {
  const roots = new Map<
    string,
    { facts: boolean; customer: boolean; run: boolean }
  >();
  for (const file of files) {
    const root = candidateRootFor(file.path);
    if (root === undefined) continue;
    const basename = path.posix.basename(file.path).toLowerCase();
    const current = roots.get(root) || {
      facts: false,
      customer: false,
      run: false,
    };
    if (basename === "00_brand_facts.md") current.facts = true;
    if (basename === "01_customer_draft.md") current.customer = true;
    if (basename === "02_run.json") current.run = true;
    roots.set(root, current);
  }
  const complete = Array.from(roots.entries()).filter(
    ([, value]) => value.facts && value.customer,
  );
  if (complete.length === 1) return complete[0]![0];
  if (complete.length > 1) {
    throw new KnowledgeBaseCandidateError(
      "Candidate archive contains multiple complete candidate roots",
      "structure",
    );
  }
  const recoverable = Array.from(roots.entries()).filter(
    ([, value]) => value.facts || value.customer,
  );
  if (recoverable.length === 1) return recoverable[0]![0];
  if (recoverable.length > 1) {
    throw new KnowledgeBaseCandidateError(
      "Candidate archive contains multiple ambiguous candidate roots",
      "structure",
    );
  }
  throw new KnowledgeBaseCandidateError(
    "Candidate archive must contain 00_brand_facts.md or 01_customer_draft.md",
    "structure",
  );
}

function relativeCandidatePath(filePath: string, root: string) {
  return root ? filePath.slice(root.length + 1) : filePath;
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

function effectiveCharacterText(value: string) {
  return value
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
    );
}

function effectiveCharacters(value: string) {
  return Array.from(effectiveCharacterText(value)).length;
}

function publicHttpUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
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
  // Upload evidence is accepted only from a successfully parsed 02_run.json
  // user_upload/read record. A Markdown marker is presentation text, not a
  // trustworthy statement that the provider actually read the attachment.
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
        typeof heading === "string" ? heading : `${heading[0]} ${heading[1]}`;
      return `## ${title}\n\n${sections.get(key) || gapFor(title)}`;
    })
    .join("\n\n");
}

function thirdLevelHeadings(markdown: string) {
  return Array.from(markdown.matchAll(/^###\s+(.+?)\s*$/gm)).map((match) =>
    match[1]!.normalize("NFKC").trim(),
  );
}

function normalizedRunUrl(value: string | undefined) {
  return publicHttpUrl(value)?.replace(/\/$/, "");
}

/** Inspects bounded quality signals without turning presentation/coverage
 * drift into an archive-level failure. ZIP and identity safety is enforced by
 * the parser before this inspector runs. */
export function validateWebsiteV2Candidate(candidate: ParsedCandidate) {
  const warn = (code: CandidateQualityWarningCode) =>
    addQualityWarning(candidate.qualityWarnings, code);
  if (candidate.run?.schemaVersion !== 2) {
    warn("RUN_METADATA_INCOMPLETE");
  }
  const run = candidate.run;
  const sources = candidate.sources;
  if (
    sources.some(
      (source) => source.kind === "user_upload" && source.status !== "read",
    )
  ) {
    warn("UPLOAD_COVERAGE_INCOMPLETE");
  }
  if (
    sources.length > WEBSITE_V2_MAX_SOURCE_RECORDS ||
    (run?.queries.length || 0) > WEBSITE_V2_MAX_WEB_QUERIES ||
    new Set(
      sources
        .filter(
          (source) =>
            source.kind !== "official_document" &&
            source.kind !== "user_upload",
        )
        .map((source) => normalizedRunUrl(source.url))
        .filter(Boolean),
    ).size > WEBSITE_V2_MAX_PUBLIC_PAGE_ATTEMPTS ||
    sources.filter((source) => source.kind === "official_document").length >
      WEBSITE_V2_MAX_OFFICIAL_DOCUMENTS
  ) {
    warn("RESEARCH_BUDGET_DRIFT");
  }
  let totalHeadingsForInspection = 0;
  let totalCharactersForInspection = 0;
  for (const section of CUSTOMER_SECTIONS) {
    const markdown = candidate.customerSections.get(section) || "";
    const headings = thirdLevelHeadings(markdown);
    const [minimumHeadings, maximumHeadings] =
      WEBSITE_V2_SECTION_H3_RANGES[section];
    if (
      headings.length < minimumHeadings ||
      headings.length > maximumHeadings ||
      new Set(headings.map((title) => title.toLowerCase())).size !==
        headings.length
    ) {
      warn("H3_COVERAGE_INCOMPLETE");
    }
    totalHeadingsForInspection += headings.length;
    const characters = effectiveCharacters(markdown);
    totalCharactersForInspection += characters;
    if (characters < WEBSITE_V2_SECTION_CONTENT_FLOORS[section]) {
      warn("CONTENT_COVERAGE_INCOMPLETE");
    }
  }
  if (totalHeadingsForInspection < 9 || totalHeadingsForInspection > 19) {
    warn("H3_COVERAGE_INCOMPLETE");
  }
  if (totalCharactersForInspection > WEBSITE_V2_MAX_CUSTOMER_CHARACTERS) {
    warn("CONTENT_COVERAGE_INCOMPLETE");
  }
  if (
    candidate.diagnostics.some((diagnostic) =>
      /Ignored (?:image|logo|non-logo)/.test(diagnostic),
    )
  ) {
    warn("OPTIONAL_ASSET_SKIPPED");
  }
  return candidate.qualityWarnings;
}

export function inspectAcceptedUploadCoverage(
  candidate: ParsedCandidate,
  acceptedUploadFilenames: readonly string[],
  acceptedUploadCount = acceptedUploadFilenames.length,
) {
  const expected = new Set(
    acceptedUploadFilenames.map((filename) =>
      filename.normalize("NFKC").trim().toLowerCase(),
    ),
  );
  const recorded = new Set(
    (candidate.run?.sources || [])
      .filter(
        (source) => source.kind === "user_upload" && source.status === "read",
      )
      .map((source) =>
        source.attachmentName?.normalize("NFKC").trim().toLowerCase(),
      )
      .filter((filename): filename is string => Boolean(filename)),
  );
  if (
    expected.size !== acceptedUploadCount ||
    recorded.size !== expected.size ||
    Array.from(expected).some((filename) => !recorded.has(filename))
  ) {
    addQualityWarning(candidate.qualityWarnings, "UPLOAD_COVERAGE_INCOMPLETE");
  }
  return candidate;
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
      checkCRC32: true,
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
  const scannedEntries = entries.map((entry) => {
    const originalName = (
      entry as JSZip.JSZipObject & { unsafeOriginalName?: string }
    ).unsafeOriginalName;
    const normalizedPath = normalizeEntryPath(originalName || entry.name);
    const permissions =
      typeof entry.unixPermissions === "number"
        ? entry.unixPermissions
        : Number.parseInt(String(entry.unixPermissions || ""), 8);
    if (Number.isFinite(permissions) && (permissions & 0o170000) === 0o120000) {
      throw new KnowledgeBaseCandidateError(
        `Candidate archive contains a symbolic link: ${normalizedPath}`,
        "unsafe",
      );
    }
    const uncompressed = declaredEntrySize(entry);
    const compressed = declaredCompressedEntrySize(entry);
    if (uncompressed > MAX_SINGLE_ENTRY_BYTES) {
      throw new KnowledgeBaseCandidateError(
        `Candidate entry is too large: ${normalizedPath}`,
        "unsafe",
      );
    }
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
  });
  const pathKeys = scannedEntries.map((file) =>
    file.path.normalize("NFKC").toLowerCase(),
  );
  if (new Set(pathKeys).size !== pathKeys.length) {
    throw new KnowledgeBaseCandidateError(
      "Candidate archive contains duplicate normalized paths",
      "unsafe",
    );
  }
  for (const file of scannedEntries) {
    if (file.entry.dir) continue;
    const extension = path.posix.extname(file.path).toLowerCase();
    if (UNSAFE_EXTRA_EXTENSIONS.has(extension)) {
      throw new KnowledgeBaseCandidateError(
        `Candidate archive contains an unsafe executable file: ${file.path}`,
        "unsafe",
      );
    }
  }
  const files = scannedEntries
    .filter((file) => !file.entry.dir)
    .filter(
      (file) =>
        !file.path.startsWith("__MACOSX/") &&
        path.posix.basename(file.path) !== ".DS_Store",
    );
  const declaredTextBytes = files
    .filter((file) =>
      [".md", ".json"].includes(path.posix.extname(file.path).toLowerCase()),
    )
    .reduce((total, file) => total + declaredEntrySize(file.entry), 0);
  if (declaredTextBytes > MAX_TEXT_BYTES) {
    throw new KnowledgeBaseCandidateError(
      "Candidate archive exceeds the 12 MB text budget",
      "unsafe",
    );
  }
  const candidateRoot = selectCandidateRoot(files);
  const candidateFiles = files
    .filter((file) =>
      candidateRoot ? file.path.startsWith(`${candidateRoot}/`) : true,
    )
    .map((file) => ({
      ...file,
      path: relativeCandidatePath(file.path, candidateRoot),
    }));
  const byPath = new Map(
    candidateFiles.map((file) => [file.path.toLowerCase(), file.entry]),
  );
  const factsEntry = byPath.get("00_brand_facts.md");
  const customerEntry = byPath.get("01_customer_draft.md");
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
  const diagnostics: string[] = [];
  const qualityWarnings: CandidateQualityWarningCode[] = [];
  let rawFactsMarkdown = "";
  let rawCustomerMarkdown = "";
  if (factsEntry) {
    try {
      rawFactsMarkdown = decodeUtf8(factsBytes, "00_brand_facts.md");
    } catch {
      diagnostics.push("Recovered unreadable 00_brand_facts.md");
    }
  }
  if (customerEntry) {
    try {
      rawCustomerMarkdown = decodeUtf8(customerBytes, "01_customer_draft.md");
    } catch {
      diagnostics.push("Recovered unreadable 01_customer_draft.md");
    }
  }
  if (!rawFactsMarkdown.trim() && !rawCustomerMarkdown.trim()) {
    throw new KnowledgeBaseCandidateError(
      "Candidate archive does not contain readable Markdown content",
      "content",
    );
  }
  const rawFactSections = sectionMap(rawFactsMarkdown);
  const rawCustomerSections = sectionMap(rawCustomerMarkdown);
  const factSections = new Map<string, string>();
  const customerSections = new Map<string, string>();
  diagnostics.push(
    candidateRoot
      ? `Selected candidate root: ${candidateRoot}`
      : "Selected candidate root: /",
  );
  const ignoredFileCount = files.length - candidateFiles.length;
  if (ignoredFileCount > 0) {
    diagnostics.push(
      `Ignored ${ignoredFileCount} file(s) outside candidate root`,
    );
  }
  if (!factsEntry) diagnostics.push("Recovered missing 00_brand_facts.md");
  if (!customerEntry)
    diagnostics.push("Recovered missing 01_customer_draft.md");
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
  const customerMarkdown = canonicalMarkdown(
    CUSTOMER_SECTIONS,
    customerSections,
  );
  let run: CandidateRun | undefined;
  const runEntry = byPath.get("02_run.json");
  if (runEntry) {
    try {
      const runBytes = await readLimited(runEntry, MAX_SINGLE_TEXT_BYTES);
      const rawRun = JSON.parse(decodeUtf8(runBytes, "02_run.json"));
      run = normalizedCandidateRun(rawRun, diagnostics, qualityWarnings);
    } catch (error) {
      // The run ledger is bounded metadata, not core customer content. Keep
      // byte-budget and ZIP safety failures hard, but treat an unreadable or
      // malformed ledger exactly like a missing one.
      if (
        error instanceof KnowledgeBaseCandidateError &&
        error.category === "unsafe"
      ) {
        throw error;
      }
      diagnostics.push("02_run.json could not be parsed and was ignored");
      addQualityWarning(qualityWarnings, "RUN_METADATA_INCOMPLETE");
    }
  } else {
    diagnostics.push("02_run.json was not present");
    addQualityWarning(qualityWarnings, "RUN_METADATA_INCOMPLETE");
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
  const assetMetadata = new Map<string, CandidateAsset>();
  for (const asset of run?.assets || []) {
    try {
      assetMetadata.set(normalizeEntryPath(asset.path).toLowerCase(), asset);
    } catch {
      diagnostics.push("Ignored invalid logo path in 02_run.json");
    }
  }
  const assets: ParsedCandidate["assets"] = [];
  for (const file of candidateFiles) {
    const extension = path.posix.extname(file.path).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) continue;
    if (!/^assets\/logo\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(file.path)) {
      diagnostics.push(`Ignored non-logo image: ${file.path}`);
      continue;
    }
    const metadata = assetMetadata.get(file.path.toLowerCase());
    if (!metadata) {
      diagnostics.push(
        `Ignored image without 02_run.json metadata: ${file.path}`,
      );
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
    if (metadata.bytes !== undefined && metadata.bytes !== bytes.byteLength) {
      throw new KnowledgeBaseCandidateError(
        `Candidate asset byte declaration does not match: ${file.path}`,
        "unsafe",
      );
    }
    if (
      metadata.sha256 &&
      metadata.sha256.toLowerCase() !==
        createHash("sha256").update(bytes).digest("hex")
    ) {
      throw new KnowledgeBaseCandidateError(
        `Candidate asset digest declaration does not match: ${file.path}`,
        "unsafe",
      );
    }
    assets.push({
      path: metadata.path,
      type: metadata.type,
      sourceKind: metadata.sourceKind,
      ...(metadata.sourcePageUrl
        ? { sourcePageUrl: metadata.sourcePageUrl }
        : {}),
      ...(metadata.sourceAssetUrl
        ? { sourceAssetUrl: metadata.sourceAssetUrl }
        : {}),
      ...(metadata.sourceDocumentName
        ? { sourceDocumentName: metadata.sourceDocumentName }
        : {}),
      caption: metadata.caption,
      ...(metadata.sha256 ? { sha256: metadata.sha256 } : {}),
      ...(metadata.mimeType ? { mimeType: metadata.mimeType } : {}),
      bytes,
      archivePath: file.path,
    });
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

  const candidate: ParsedCandidate = {
    profile: WEBSITE_KB_CANDIDATE_PROFILE,
    factsMarkdown,
    customerMarkdown,
    factSections,
    customerSections,
    run,
    sources,
    assets,
    diagnostics,
    qualityWarnings,
    metrics: {
      citedSourceCount,
      factCharacters: effectiveCharacters(factsMarkdown),
      customerCharacters: effectiveCharacters(customerMarkdown),
      coveredFactDimensions,
    },
  };
  validateWebsiteV2Candidate(candidate);
  return candidate;
}
