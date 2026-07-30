import { createHash } from "node:crypto";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import {
  customerFacingNarrativeViolation,
  KnowledgeBaseCompletenessInputSchema,
  parseKnowledgeBaseArchive,
  WebsiteLeadPackageManifestV3InputSchema,
  type KnowledgeBaseManifest,
} from "./archive";
import {
  CUSTOMER_SECTIONS,
  FACT_DIMENSIONS,
  type CandidateAsset,
  type CandidateSource,
  type ParsedCandidate,
} from "./knowledge-base-candidate";

export const WEBSITE_KB_FINALIZER_VERSION = "website-kb-finalizer-v1";
const ZIP_DATE = new Date("1980-01-01T00:00:00.000Z");

type EvidenceStatus =
  | "verified_first_party"
  | "verified_authoritative"
  | "supported_third_party"
  | "needs_verification"
  | "not_applicable";

type CanonicalBranchId =
  | "01_company_overview"
  | "02_team"
  | "03_products"
  | "04_technology"
  | "05_manufacturing"
  | "06_industries"
  | "07_service"
  | "08_competitive_advantages";

type DisplayBranchId =
  | "company-identity"
  | "team"
  | "products-services"
  | "core-capabilities"
  | "customers-industries"
  | "cooperation"
  | "why-frontmind";

type PackageDocument = {
  id: string;
  path: string;
  kind:
    | "overview"
    | "leaf"
    | "evidence"
    | "report"
    | "index"
    | "tree"
    | "source_index"
    | "readme";
  title: string;
  branchId?: CanonicalBranchId;
  order?: number;
  evidenceStatus?: EvidenceStatus;
  sourceIds?: string[];
  assetIds?: string[];
  evidenceCharacters?: number;
  dynamicMinimumCharacters?: number;
  evidenceDocumentIds?: string[];
  productFamilyIds?: string[];
  customerVisible: boolean;
};

type PackageAsset = {
  id: string;
  path: string;
  sha256: string;
  mimeType:
    | "image/avif"
    | "image/webp"
    | "image/png"
    | "image/jpeg"
    | "image/gif";
  bytes: number;
  width: number;
  height: number;
  caption: string;
  alt?: string;
  branchId: CanonicalBranchId;
  documentIds: string[];
  sourcePageUrl?: string;
  sourceAssetUrl?: string;
  sourceDocumentPath?: string;
  sourceKind?: "official_web" | "official_document" | "user_upload";
  ownership: "first_party";
  assetType:
    | "brand_identity"
    | "product_ui"
    | "product_diagram"
    | "case_photo"
    | "team_photo"
    | "environment_photo"
    | "certificate_badge"
    | "document_figure"
    | "other";
  displayRole: "inline" | "badge";
};

type LeafDraft = {
  id: string;
  title: string;
  branchId: CanonicalBranchId;
  displayBranchId: DisplayBranchId;
  narrative: string;
  rawMarkdown: string;
  status: EvidenceStatus;
  sourceIds: string[];
  evidenceDocumentIds: string[];
  evidenceCharacters: number;
  order: number;
  productFamilyIds?: string[];
  assetIds: string[];
};

type SourceRecord = {
  id: string;
  source: CandidateSource;
  key: string;
};

type FinalizedAsset = {
  asset: PackageAsset;
  bytes: Buffer;
  candidate: {
    url?: string;
    sourcePageUrl?: string;
    sourceDocumentPath?: string;
    sourceKind?: "official_web" | "official_document" | "user_upload";
    method:
      | "img"
      | "srcset_or_lazy"
      | "picture"
      | "css_background"
      | "open_graph"
      | "gallery"
      | "official_document";
    status: "eligible";
    assetId: string;
  };
};

type RejectedAsset = {
  url?: string;
  sourcePageUrl?: string;
  sourceDocumentPath?: string;
  sourceKind?: "official_web" | "official_document" | "user_upload";
  method:
    | "img"
    | "srcset_or_lazy"
    | "picture"
    | "css_background"
    | "open_graph"
    | "gallery"
    | "official_document";
  status: "rejected";
  rejectionReason: string;
};

const DISPLAY_BRANCHES: Array<{
  id: DisplayBranchId;
  title: string;
  customerTitle: (typeof CUSTOMER_SECTIONS)[number];
  overviewBranch: CanonicalBranchId;
  canonicalBranches: CanonicalBranchId[];
}> = [
  {
    id: "company-identity",
    title: "企业与品牌",
    customerTitle: "企业与品牌",
    overviewBranch: "01_company_overview",
    canonicalBranches: ["01_company_overview"],
  },
  {
    id: "team",
    title: "团队与组织",
    customerTitle: "团队与组织",
    overviewBranch: "02_team",
    canonicalBranches: ["02_team"],
  },
  {
    id: "products-services",
    title: "产品与服务",
    customerTitle: "产品与服务",
    overviewBranch: "03_products",
    canonicalBranches: ["03_products"],
  },
  {
    id: "core-capabilities",
    title: "技术与交付",
    customerTitle: "技术与交付",
    overviewBranch: "04_technology",
    canonicalBranches: ["04_technology", "05_manufacturing"],
  },
  {
    id: "customers-industries",
    title: "客户与行业",
    customerTitle: "客户与行业",
    overviewBranch: "06_industries",
    canonicalBranches: ["06_industries"],
  },
  {
    id: "cooperation",
    title: "服务与合作",
    customerTitle: "服务与合作",
    overviewBranch: "07_service",
    canonicalBranches: ["07_service"],
  },
  {
    id: "why-frontmind",
    title: "可信优势",
    customerTitle: "可信优势",
    overviewBranch: "08_competitive_advantages",
    canonicalBranches: ["08_competitive_advantages"],
  },
];

const FACTS_BY_BRANCH: Record<CanonicalBranchId, string[]> = {
  "01_company_overview": ["D01", "D10"],
  "02_team": ["D02"],
  "03_products": ["D03"],
  "04_technology": ["D04", "D06"],
  "05_manufacturing": ["D03", "D04", "D06"],
  "06_industries": ["D05", "D09", "D13"],
  "07_service": ["D11", "D12"],
  "08_competitive_advantages": ["D04", "D06", "D07", "D08"],
};

const SECTION_BRANCH = new Map(
  DISPLAY_BRANCHES.map((branch) => [
    branch.customerTitle,
    branch.overviewBranch,
  ]),
);
const SECTION_DISPLAY = new Map(
  DISPLAY_BRANCHES.map((branch) => [branch.customerTitle, branch.id]),
);

function meaningfulCharacters(value: string) {
  return Array.from(
    value
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/!\[[^\]]*]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
      .replace(/https?:\/\/[^\s)>\]]+/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\s/g, "")
      .replace(
        /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~，。！？；：“”‘’（）【】《》…—·]/g,
        "",
      ),
  ).length;
}

function evidenceCharacters(value: string) {
  return meaningfulCharacters(
    value
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/^#{1,6}\s+/gm, ""),
  );
}

function narrativeTextForDocument(markdown: string) {
  const retainedLines: string[] = [];
  const lines = markdown.split(/\r?\n/);
  let excludedSectionDepth: number | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || "";
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (heading) {
      const depth = heading[1]!.length;
      if (excludedSectionDepth !== undefined && depth <= excludedSectionDepth) {
        excludedSectionDepth = undefined;
      }
      if (
        /(?:原始|证据|引用|参考)?来源|素材清单|展示素材|机器清单|证据状态|状态头|sources?|references?|asset inventory/i.test(
          heading[2] || "",
        )
      ) {
        excludedSectionDepth = depth;
      }
      continue;
    }
    if (excludedSectionDepth !== undefined) continue;
    if (
      /^\s*>\s*.*(?:状态|status)\s*[:：].*(?:来源|source)\s*[:：]/i.test(line)
    ) {
      continue;
    }
    if (line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      let tableIndex = index;
      while (
        tableIndex < lines.length &&
        (lines[tableIndex] || "").trim().startsWith("|")
      ) {
        tableLines.push(lines[tableIndex] || "");
        tableIndex += 1;
      }
      index = tableIndex - 1;
      const tableText = tableLines.join("\n");
      if (!/(?:来源|出处|证据链接|source|url)/i.test(tableText)) {
        retainedLines.push(tableText);
      }
      continue;
    }
    retainedLines.push(line);
  }
  return retainedLines
    .join("\n")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/[^\s)>\]]+/gi, "")
    .replace(/<[^>]+>/g, "");
}

function normalizeSourceUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    if (
      (url.protocol === "http:" && url.port === "80") ||
      (url.protocol === "https:" && url.port === "443")
    ) {
      url.port = "";
    }
    return url.toString();
  } catch {
    return value;
  }
}

function sourceKey(source: CandidateSource) {
  if (source.normalizedUrl || source.url) {
    return `url:${normalizeSourceUrl(source.normalizedUrl || source.url!)}`;
  }
  return `upload:${(source.attachmentName || source.title)
    .normalize("NFKC")
    .toLowerCase()}`;
}

function buildSources(candidate: ParsedCandidate) {
  return candidate.sources.map((source, index) => ({
    id: `S${String(index + 1).padStart(3, "0")}`,
    source,
    key: sourceKey(source),
  }));
}

function sourceIdsForMarkdown(
  markdown: string,
  sourceRecords: SourceRecord[],
) {
  const keys = new Set<string>();
  for (const match of Array.from(
    markdown.matchAll(
      /\[(?:来源|企业主张|权威来源|第三方来源)]\((https?:\/\/[^)\s]+)\)/g,
    ),
  )) {
    keys.add(`url:${normalizeSourceUrl(match[1]!)}`);
  }
  for (const match of Array.from(
    markdown.matchAll(/\[上传文件：([^\]]+)]/g),
  )) {
    keys.add(`upload:${match[1]!.trim().normalize("NFKC").toLowerCase()}`);
  }
  return sourceRecords
    .filter((record) => keys.has(record.key))
    .map((record) => record.id);
}

function sourceStatus(
  sourceIds: string[],
  sourceRecords: SourceRecord[],
): EvidenceStatus {
  const kinds = new Set(
    sourceRecords
      .filter((record) => sourceIds.includes(record.id))
      .map((record) => record.source.kind),
  );
  if (
    kinds.has("official_web") ||
    kinds.has("official_document") ||
    kinds.has("user_upload")
  ) {
    return "verified_first_party";
  }
  if (kinds.has("authoritative")) return "verified_authoritative";
  if (kinds.has("reputable_media") || kinds.has("other")) {
    return "supported_third_party";
  }
  return "needs_verification";
}

function evidenceLabel(status: EvidenceStatus) {
  if (status === "verified_first_party") return "企业官网或第一方资料";
  if (status === "verified_authoritative") return "权威公开来源";
  if (status === "supported_third_party") return "可靠第三方来源";
  if (status === "not_applicable") return "业务类型不适用";
  return "公开资料待核验";
}

function removeEvidenceMarkers(value: string) {
  return value
    .replace(
      /\[(?:来源|企业主张|权威来源|第三方来源)]\((?:https?:\/\/[^)\s]+)\)/g,
      "",
    )
    .replace(/\[上传文件：[^\]]+]/g, "")
    .replace(/\[待核验]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeSupportedNarrative(value: string) {
  const hasClaim = /\[企业主张]\(/.test(value);
  const retained = value
    .split(/\n\s*\n/)
    .filter((paragraph) => !customerFacingNarrativeViolation(paragraph))
    .join("\n\n");
  let narrative = removeEvidenceMarkers(retained);
  if (
    hasClaim &&
    narrative &&
    !/(?:官网称|企业称|企业表示|企业披露|官方称)/.test(narrative)
  ) {
    narrative = `官网称，${narrative}`;
  }
  return narrative;
}

function gapNarrative(value: string, title: string) {
  const retained = removeEvidenceMarkers(value)
    .split(/\n\s*\n/)
    .filter(
      (paragraph) =>
        paragraph &&
        !customerFacingNarrativeViolation(paragraph) &&
        !/\[(?:来源|企业主张|权威来源|第三方来源)]\(/.test(paragraph),
    )
    .join("\n\n")
    .trim();
  if (
    retained &&
    /(?:暂无|尚未|未发现|未提供|待核验|不适用)/.test(retained)
  ) {
    return retained;
  }
  return `公开资料暂未提供${title}的可核验信息。`;
}

function splitByHeading(sectionTitle: string, markdown: string) {
  const headings = Array.from(markdown.matchAll(/^###\s+(.+?)\s*$/gm));
  if (!headings.length) {
    return [
      {
        title: sectionTitle,
        markdown: markdown.trim(),
        intro: markdown.trim(),
      },
    ];
  }
  const intro = markdown.slice(0, headings[0]!.index).trim();
  return headings.map((heading, index) => {
    const start = (heading.index || 0) + heading[0].length;
    const end = headings[index + 1]?.index ?? markdown.length;
    return {
      title: heading[1]!.trim(),
      markdown: markdown.slice(start, end).trim(),
      intro: index === 0 ? intro : "",
    };
  });
}

function splitLargeChunk(title: string, markdown: string) {
  if (meaningfulCharacters(markdown) <= 1_800) {
    return [{ title, markdown }];
  }
  const paragraphs = markdown.split(/\n\s*\n/).filter(Boolean);
  const groups: string[][] = [];
  let current: string[] = [];
  let currentCharacters = 0;
  for (const paragraph of paragraphs) {
    const paragraphCharacters = meaningfulCharacters(paragraph);
    if (
      current.length &&
      currentCharacters + paragraphCharacters > 1_400
    ) {
      groups.push(current);
      current = [];
      currentCharacters = 0;
    }
    current.push(paragraph);
    currentCharacters += paragraphCharacters;
  }
  if (current.length) groups.push(current);
  return groups.map((group, index) => ({
    title:
      groups.length === 1 ? title : `${title}（${String(index + 1)}）`,
    markdown: group.join("\n\n"),
  }));
}

function splitSupportedAndGaps(title: string, markdown: string) {
  const paragraphs = markdown.split(/\n\s*\n/).filter(Boolean);
  const supported = paragraphs.filter(
    (paragraph) =>
      /\[(?:来源|企业主张|权威来源|第三方来源)]\(/.test(paragraph) ||
      /\[上传文件：/.test(paragraph),
  );
  const gaps = paragraphs.filter(
    (paragraph) =>
      !supported.includes(paragraph) &&
      (/\[待核验]/.test(paragraph) ||
        meaningfulCharacters(paragraph) > 0),
  );
  const values: Array<{ title: string; markdown: string; gap: boolean }> = [];
  if (supported.length) {
    values.push({ title, markdown: supported.join("\n\n"), gap: false });
  }
  if (gaps.length) {
    values.push({
      title: supported.length ? `${title}（资料缺口）` : title,
      markdown: gaps.join("\n\n"),
      gap: true,
    });
  }
  if (!values.length) values.push({ title, markdown: "", gap: true });
  return values;
}

function mergeSmallChunks(
  values: Array<{ title: string; markdown: string; gap: boolean }>,
) {
  const output: typeof values = [];
  for (const value of values) {
    const previous = output[output.length - 1];
    if (
      previous &&
      previous.gap === value.gap &&
      meaningfulCharacters(previous.markdown) < 180 &&
      meaningfulCharacters(value.markdown) < 180
    ) {
      previous.title = `${previous.title}与${value.title}`;
      previous.markdown = `${previous.markdown}\n\n${value.markdown}`.trim();
    } else {
      output.push({ ...value });
    }
  }
  return output;
}

function titleSlug(value: string) {
  const ascii = value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return (
    ascii ||
    createHash("sha256").update(value).digest("hex").slice(0, 10)
  );
}

function factParagraphsForSource(
  candidate: ParsedCandidate,
  sourceRecords: SourceRecord[],
  sourceId: string,
) {
  return Array.from(candidate.factSections.entries()).flatMap(
    ([dimension, markdown]) =>
      markdown
        .split(/\n\s*\n/)
        .filter((paragraph) =>
          sourceIdsForMarkdown(paragraph, sourceRecords).includes(sourceId),
        )
        .map((paragraph) => ({ dimension, paragraph })),
  );
}

function isoDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return new Date(0).toISOString();
  return date.toISOString();
}

function candidateCluster(candidate: ParsedCandidate) {
  return candidate.run?.company.industryCluster || "C3";
}

export type CandidateContentAssessment = {
  tier: "rich" | "medium" | "sparse";
  target: string;
  requiresSupplement: boolean;
  reasons: string[];
  missingDimensions: string[];
  unwrittenFactTopics: string[];
  allowedSources: string[];
};

export function assessKnowledgeBaseCandidate(
  candidate: ParsedCandidate,
): CandidateContentAssessment {
  const { citedSourceCount, factCharacters, customerCharacters } =
    candidate.metrics;
  const covered = candidate.metrics.coveredFactDimensions;
  const tier =
    citedSourceCount >= 8 && factCharacters >= 5_000 && covered >= 6
      ? "rich"
      : citedSourceCount >= 3 || factCharacters >= 2_000
        ? "medium"
        : "sparse";
  const reasons: string[] = [];
  const sourceRecords = buildSources(candidate);
  const publishable = (id: string) =>
    sourceIdsForMarkdown(
      candidate.factSections.get(id) || "",
      sourceRecords,
    ).length > 0;
  if (tier === "rich" && customerCharacters < 10_000) {
    reasons.push(
      `资料丰富但客户正文仅 ${customerCharacters} 个有效字符，低于 10000`,
    );
  }
  if (tier === "rich" && !publishable("D01")) {
    reasons.push("D01 企业基础缺少可发布证据");
  }
  if (tier === "rich" && !publishable("D03")) {
    reasons.push("D03 产品服务缺少可发布证据");
  }
  const clusterCore: Record<string, string[]> = {
    C1: ["D05", "D09", "D11", "D13"],
    C2: ["D03", "D05", "D09", "D10", "D11"],
    C3: ["D03", "D04", "D05", "D06", "D11"],
    C4: ["D03", "D04", "D05", "D06"],
    C5: ["D03", "D05", "D10", "D11", "D13"],
    C6: ["D03", "D04", "D06", "D13"],
  };
  const customerSectionForDimension: Record<string, string> = {
    D01: "企业与品牌",
    D02: "团队与组织",
    D03: "产品与服务",
    D04: "技术与交付",
    D05: "客户与行业",
    D06: "技术与交付",
    D07: "可信优势",
    D08: "可信优势",
    D09: "客户与行业",
    D10: "企业与品牌",
    D11: "服务与合作",
    D12: "服务与合作",
    D13: "客户与行业",
  };
  const missingCore =
    tier === "rich"
      ? (clusterCore[candidateCluster(candidate)] || []).filter((id) => {
          const customerSection =
            candidate.customerSections.get(
              customerSectionForDimension[id] || "",
            ) || "";
          return (
            publishable(id) &&
            sourceIdsForMarkdown(customerSection, sourceRecords)
              .length === 0
          );
        })
      : [];
  if (tier === "rich" && missingCore.length) {
    reasons.push(`行业核心事实未进入客户稿：${missingCore.join("、")}`);
  }
  if (
    tier === "medium" &&
    customerCharacters < 5_000 &&
    factCharacters > customerCharacters * 1.25
  ) {
    reasons.push("中等资料量的客户稿明显薄于事实层");
  }
  const dimensionTitles = new Map(FACT_DIMENSIONS);
  const missingDimensions = FACT_DIMENSIONS.filter(
    ([id]) => !publishable(id),
  ).map(([id, title]) => `${id} ${title}`);
  const unwrittenFactTopics = FACT_DIMENSIONS.filter(([id]) => {
    const factSourceIds = sourceIdsForMarkdown(
      candidate.factSections.get(id) || "",
      sourceRecords,
    );
    if (!factSourceIds.length) return false;
    const customerSourceIds = new Set(
      sourceIdsForMarkdown(
        candidate.customerSections.get(
          customerSectionForDimension[id] || "",
        ) || "",
        sourceRecords,
      ),
    );
    return factSourceIds.some((sourceId) => !customerSourceIds.has(sourceId));
  }).map(([id]) => `${id} ${dimensionTitles.get(id) || id}`);
  const allowedSources = Array.from(
    new Set(
      [
        candidate.run?.company.officialWebsite || "",
        ...candidate.sources
          .filter(
            (source) =>
              source.status !== "failed" &&
              ["official_web", "official_document", "authoritative"].includes(
                source.kind,
              ),
          )
          .map((source) => source.normalizedUrl || source.url || ""),
      ].filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
  return {
    tier,
    target:
      tier === "rich"
        ? "12000–18000"
        : tier === "medium"
          ? "6000–12000"
          : "按证据自适应",
    requiresSupplement: tier !== "sparse" && reasons.length > 0,
    reasons,
    missingDimensions,
    unwrittenFactTopics,
    allowedSources,
  };
}

function branchForAsset(type: CandidateAsset["type"]): CanonicalBranchId {
  if (type === "team_photo") return "02_team";
  if (
    type === "product_ui" ||
    type === "product_diagram" ||
    type === "case_photo"
  ) {
    return "03_products";
  }
  if (type === "certificate_badge" || type === "document_figure") {
    return "04_technology";
  }
  if (type === "environment_photo") return "06_industries";
  return "01_company_overview";
}

function traceableAssetCandidate(asset: CandidateAsset) {
  if (
    asset.sourceKind === "official_web" &&
    asset.sourcePageUrl &&
    /^https?:\/\//i.test(asset.sourcePageUrl)
  ) {
    return {
      url: asset.sourceAssetUrl || asset.sourcePageUrl,
      sourcePageUrl: asset.sourcePageUrl,
      sourceKind: "official_web" as const,
      method: "img" as const,
    };
  }
  if (
    (asset.sourceKind === "official_document" ||
      asset.sourceKind === "user_upload") &&
    asset.sourceDocumentName
  ) {
    return {
      sourceKind: asset.sourceKind,
      sourceDocumentName: asset.sourceDocumentName,
      method: "official_document" as const,
    };
  }
  return undefined;
}

async function normalizeImage(
  candidateAsset: ParsedCandidate["assets"][number],
) {
  const isSvg = candidateAsset.archivePath.toLowerCase().endsWith(".svg");
  if (isSvg) {
    const svg = candidateAsset.bytes.toString("utf8");
    if (
      /<script|<!DOCTYPE|<!ENTITY|<foreignObject|(?:href|src)\s*=\s*["'](?:https?:|\/\/)|url\(\s*["']?(?:https?:|\/\/)/i.test(
        svg,
      )
    ) {
      throw new Error("SVG 包含脚本、外部实体或外部资源引用");
    }
  }
  const pipeline = sharp(candidateAsset.bytes, {
    animated: false,
    limitInputPixels: 40_000_000,
  }).rotate();
  const metadata = await pipeline.metadata();
  if (!metadata.width || !metadata.height) throw new Error("图片没有有效尺寸");
  const badge = ["brand_identity", "certificate_badge"].includes(
    candidateAsset.type,
  );
  if (
    (badge && (metadata.width < 256 || metadata.height < 256)) ||
    (!badge && (metadata.width < 800 || metadata.height < 450))
  ) {
    throw new Error(
      badge ? "徽标图片低于 256×256" : "展示图片低于 800×450",
    );
  }
  let output = await pipeline.png().toBuffer({ resolveWithObject: true });
  let extension = "png";
  let mimeType: PackageAsset["mimeType"] = "image/png";
  if (output.data.byteLength > 4 * 1024 * 1024) {
    output = await sharp(candidateAsset.bytes, {
      animated: false,
      limitInputPixels: 40_000_000,
    })
      .rotate()
      .webp({ quality: 88 })
      .toBuffer({ resolveWithObject: true });
    extension = "webp";
    mimeType = "image/webp";
  }
  if (output.data.byteLength > 4 * 1024 * 1024) {
    throw new Error("规范化图片超过 4 MB");
  }
  return {
    bytes: output.data,
    width: output.info.width,
    height: output.info.height,
    extension,
    mimeType,
    displayRole: (badge ? "badge" : "inline") as "badge" | "inline",
  };
}

async function finalizeAssets(
  candidate: ParsedCandidate,
  documents: PackageDocument[],
  markdownByPath: Map<string, string>,
  sourceRecords: SourceRecord[],
  evidenceBySourceId: Map<
    string,
    { document: PackageDocument; characters: number }
  >,
) {
  const finalized: FinalizedAsset[] = [];
  const rejected: RejectedAsset[] = [];
  const usedCandidateKeys = new Set<string>();
  for (const candidateAsset of candidate.assets) {
    const trace = traceableAssetCandidate(candidateAsset);
    if (!trace) continue;
    const sourceDocumentRecord =
      trace.method === "official_document"
        ? sourceRecords.find((record) => {
            const sourceName =
              record.source.attachmentName || record.source.title;
            return (
              record.source.kind === candidateAsset.sourceKind &&
              sourceName.normalize("NFKC").toLowerCase() ===
                trace.sourceDocumentName
                  .normalize("NFKC")
                  .toLowerCase()
            );
          })
        : undefined;
    const sourceDocumentPath = sourceDocumentRecord
      ? evidenceBySourceId.get(sourceDocumentRecord.id)?.document.path
      : undefined;
    const key =
      trace.url ||
      `${candidateAsset.sourceKind}:${candidateAsset.archivePath}`;
    if (usedCandidateKeys.has(key)) continue;
    usedCandidateKeys.add(key);
    try {
      if (
        trace.method === "official_document" &&
        !sourceDocumentPath
      ) {
        throw new Error("候选素材缺少可关联的上传或官方文档来源记录");
      }
      const normalized = await normalizeImage(candidateAsset);
      const branchId = branchForAsset(candidateAsset.type);
      const linkedDocuments = documents.filter(
        (document) =>
          document.customerVisible &&
          document.branchId === branchId &&
          (document.kind === "overview" || document.kind === "leaf"),
      );
      if (!linkedDocuments.length) throw new Error("没有可关联的客户文档");
      const assetId = `asset-${String(finalized.length + 1).padStart(3, "0")}`;
      const assetPath = `09_media_assets/${candidateAsset.type}/${assetId}.${normalized.extension}`;
      const documentIds = linkedDocuments
        .slice(0, 2)
        .map((document) => document.id);
      const asset: PackageAsset = {
        id: assetId,
        path: assetPath,
        sha256: createHash("sha256").update(normalized.bytes).digest("hex"),
        mimeType: normalized.mimeType,
        bytes: normalized.bytes.byteLength,
        width: normalized.width,
        height: normalized.height,
        caption: candidateAsset.caption,
        alt: candidateAsset.caption,
        branchId,
        documentIds,
        ...(trace.sourcePageUrl
          ? { sourcePageUrl: trace.sourcePageUrl }
          : {}),
        ...(trace.url ? { sourceAssetUrl: trace.url } : {}),
        ...(sourceDocumentPath ? { sourceDocumentPath } : {}),
        sourceKind: candidateAsset.sourceKind,
        ownership: "first_party",
        assetType: candidateAsset.type,
        displayRole: normalized.displayRole,
      };
      for (const document of linkedDocuments.slice(0, 2)) {
        document.assetIds = Array.from(
          new Set([...(document.assetIds || []), assetId]),
        );
        const relativePath = path.posix.relative(
          path.posix.dirname(document.path),
          assetPath,
        );
        markdownByPath.set(
          document.path,
          `${markdownByPath.get(document.path) || ""}\n\n## 展示素材\n\n![${candidateAsset.caption}](${relativePath})\n`,
        );
      }
      finalized.push({
        asset,
        bytes: normalized.bytes,
        candidate: {
          ...(trace.url ? { url: trace.url } : {}),
          ...(trace.sourcePageUrl
            ? { sourcePageUrl: trace.sourcePageUrl }
            : {}),
          ...(sourceDocumentPath ? { sourceDocumentPath } : {}),
          sourceKind: candidateAsset.sourceKind,
          method: trace.method,
          status: "eligible",
          assetId,
        },
      });
    } catch (error) {
      rejected.push({
        ...(trace.url ? { url: trace.url } : {}),
        ...(trace.sourcePageUrl
          ? { sourcePageUrl: trace.sourcePageUrl }
          : {}),
        ...(sourceDocumentPath ? { sourceDocumentPath } : {}),
        sourceKind: candidateAsset.sourceKind,
        method: trace.method,
        status: "rejected",
        rejectionReason: `素材未进入客户包：${
          error instanceof Error ? error.message : String(error)
        }`.slice(0, 500),
      });
    }
  }
  return { finalized, rejected };
}

function buildLeafMarkdown(
  title: string,
  date: string,
  status: EvidenceStatus,
  narrative: string,
  sources: SourceRecord[],
  sourceIds: string[],
) {
  const sourceLines = sources
    .filter((source) => sourceIds.includes(source.id))
    .map((source) => {
      if (source.source.normalizedUrl || source.source.url) {
        return `- [${source.id}] ${source.source.title}：${
          source.source.normalizedUrl || source.source.url
        }`;
      }
      return `- [${source.id}] 上传文件：${
        source.source.attachmentName || source.source.title
      }`;
    });
  return [
    `# ${title}`,
    "",
    `> 最后更新: ${date} | 状态: ${status} | 来源: ${evidenceLabel(status)}`,
    "",
    narrative,
    ...(sourceLines.length ? ["", "## 原始来源", "", ...sourceLines] : []),
  ].join("\n");
}

function sourceIndexMarkdown(companyName: string, sources: SourceRecord[]) {
  const lines = sources.map((source) => {
    const location =
      source.source.normalizedUrl ||
      source.source.url ||
      `上传文件：${source.source.attachmentName || source.source.title}`;
    return `- [${source.id}] ${source.source.title}｜${source.source.kind}｜${source.source.status}｜${location}`;
  });
  return [
    `# ${companyName} 来源索引`,
    "",
    ...(lines.length ? lines : ["- 暂无可登记来源。"]),
  ].join("\n");
}

function checkedSourceCountForDisplay(
  display: (typeof DISPLAY_BRANCHES)[number],
  documents: PackageDocument[],
) {
  return new Set(
    documents
      .filter(
        (document) =>
          document.customerVisible &&
          document.branchId &&
          display.canonicalBranches.includes(document.branchId),
      )
      .flatMap((document) => document.sourceIds || []),
  ).size;
}

export type FinalizedKnowledgeBase = {
  bytes: Buffer;
  sha256: string;
  packageManifestSha256: string;
  manifest: KnowledgeBaseManifest;
  assessment: CandidateContentAssessment;
  metrics: {
    leafCount: number;
    customerCharacters: number;
    evidenceCharacters: number;
    packagedImages: number;
  };
};

export async function finalizeKnowledgeBaseCandidate(input: {
  candidate: ParsedCandidate;
  companyName: string;
  evaluatedAt: string;
}): Promise<FinalizedKnowledgeBase> {
  const evaluatedAt = isoDate(input.evaluatedAt);
  const date = evaluatedAt.slice(0, 10);
  const sourceRecords = buildSources(input.candidate);
  const assessment = assessKnowledgeBaseCandidate(input.candidate);
  const markdownByPath = new Map<string, string>();
  const documents: PackageDocument[] = [];
  const evidenceById = new Map<
    string,
    { document: PackageDocument; characters: number }
  >();
  const evidenceBySourceId = new Map<
    string,
    { document: PackageDocument; characters: number }
  >();

  for (const record of sourceRecords) {
    const facts = factParagraphsForSource(
      input.candidate,
      sourceRecords,
      record.id,
    );
    if (!facts.length || record.source.status === "failed") continue;
    const sourceLabel =
      record.source.normalizedUrl ||
      record.source.url ||
      record.source.attachmentName ||
      record.source.title;
    const evidenceMarkdown = [
      `# ${input.companyName} 来源证据 ${record.id}`,
      "",
      `来源标题：${record.source.title}`,
      "",
      `来源：${sourceLabel}`,
      "",
      `来源类型：${record.source.kind}`,
      "",
      `读取状态：${record.source.status}`,
      "",
      "## 支持的事实条目",
      "",
      ...facts.map(
        ({ dimension, paragraph }) => `### ${dimension}\n\n${paragraph}`,
      ),
    ].join("\n");
    const document: PackageDocument = {
      id: `doc-evidence-${record.id}`,
      path: `evidence/${record.id}.md`,
      kind: "evidence",
      title: `${record.source.title}证据`,
      sourceIds: [record.id],
      customerVisible: false,
    };
    documents.push(document);
    markdownByPath.set(document.path, evidenceMarkdown);
    const evidenceEntry = {
      document,
      characters: evidenceCharacters(evidenceMarkdown),
    };
    evidenceById.set(document.id, evidenceEntry);
    evidenceBySourceId.set(record.id, evidenceEntry);
  }

  const leafDrafts: LeafDraft[] = [];
  const introByDisplay = new Map<DisplayBranchId, string>();
  let leafSequence = 0;
  for (const section of CUSTOMER_SECTIONS) {
    const branchId = SECTION_BRANCH.get(section)!;
    const displayBranchId = SECTION_DISPLAY.get(section)!;
    const rawSection = input.candidate.customerSections.get(section) || "";
    const initialChunks = splitByHeading(section, rawSection);
    if (initialChunks[0]?.intro) {
      introByDisplay.set(displayBranchId, initialChunks[0].intro);
    }
    const expanded = initialChunks.flatMap((chunk) =>
      splitLargeChunk(chunk.title, chunk.markdown),
    );
    const split = mergeSmallChunks(
      expanded.flatMap((chunk) =>
        splitSupportedAndGaps(chunk.title, chunk.markdown),
      ),
    );
    for (const chunk of split) {
      leafSequence += 1;
      const sourceIds = chunk.gap
        ? []
        : sourceIdsForMarkdown(chunk.markdown, sourceRecords);
      const status = chunk.gap
        ? "needs_verification"
        : sourceStatus(sourceIds, sourceRecords);
      const supported =
        status !== "needs_verification" && status !== "not_applicable";
      const evidenceEntries = sourceIds
        .map((sourceId) => evidenceBySourceId.get(sourceId))
        .filter(
          (
            entry,
          ): entry is { document: PackageDocument; characters: number } =>
            Boolean(entry),
        );
      const narrative = supported
        ? sanitizeSupportedNarrative(chunk.markdown)
        : gapNarrative(chunk.markdown, chunk.title);
      leafDrafts.push({
        id: `doc-leaf-${String(leafSequence).padStart(3, "0")}`,
        title: chunk.title,
        branchId,
        displayBranchId,
        narrative:
          narrative || `公开资料暂未提供${chunk.title}的可核验信息。`,
        rawMarkdown: chunk.markdown,
        status: supported ? status : "needs_verification",
        sourceIds: supported ? sourceIds : [],
        evidenceDocumentIds:
          supported
            ? evidenceEntries.map((entry) => entry.document.id)
            : [],
        evidenceCharacters: supported
          ? evidenceEntries.reduce(
              (total, entry) => total + entry.characters,
              0,
            )
          : 0,
        order: leafSequence,
        ...(branchId === "03_products"
          ? { productFamilyIds: ["family-primary"] }
          : {}),
        assetIds: [],
      });
    }
  }

  const manufacturingFacts = FACTS_BY_BRANCH["05_manufacturing"]
    .map((dimension) => input.candidate.factSections.get(dimension) || "")
    .join("\n\n");
  const manufacturingSourceIds = sourceIdsForMarkdown(
    manufacturingFacts,
    sourceRecords,
  );
  const manufacturingEvidence = manufacturingSourceIds
    .map((sourceId) => evidenceBySourceId.get(sourceId))
    .filter(
      (
        entry,
      ): entry is { document: PackageDocument; characters: number } =>
        Boolean(entry),
    );
  const hasManufacturingEvidence = manufacturingEvidence.length > 0;
  leafSequence += 1;
  leafDrafts.push({
    id: `doc-leaf-${String(leafSequence).padStart(3, "0")}`,
    title:
      candidateCluster(input.candidate) === "C4"
        ? "制造与生产能力"
        : "制造能力适用性",
    branchId: "05_manufacturing",
    displayBranchId: "core-capabilities",
    narrative:
      candidateCluster(input.candidate) === "C4" && hasManufacturingEvidence
        ? sanitizeSupportedNarrative(
            FACTS_BY_BRANCH["05_manufacturing"]
              .map(
                (dimension) =>
                  input.candidate.factSections.get(dimension) || "",
              )
              .join("\n\n"),
          ) || "企业公开资料披露了与制造和生产相关的能力。"
        : "该企业的公开主营业务不以制造或生产为核心交付形态。",
    rawMarkdown: "",
    status:
      candidateCluster(input.candidate) === "C4" && hasManufacturingEvidence
        ? sourceStatus(manufacturingSourceIds, sourceRecords)
        : "not_applicable",
    sourceIds:
      candidateCluster(input.candidate) === "C4" && hasManufacturingEvidence
        ? manufacturingSourceIds
        : [],
    evidenceDocumentIds:
      candidateCluster(input.candidate) === "C4" && hasManufacturingEvidence
        ? manufacturingEvidence.map((entry) => entry.document.id)
        : [],
    evidenceCharacters:
      candidateCluster(input.candidate) === "C4" && hasManufacturingEvidence
        ? manufacturingEvidence.reduce(
            (total, entry) => total + entry.characters,
            0,
          )
        : 0,
    order: leafSequence,
    assetIds: [],
  });

  while (leafDrafts.length > 56) {
    let mergeIndex = leafDrafts.length - 2;
    while (
      mergeIndex > 0 &&
      leafDrafts[mergeIndex]!.branchId !==
        leafDrafts[mergeIndex + 1]!.branchId
    ) {
      mergeIndex -= 1;
    }
    const left = leafDrafts[mergeIndex]!;
    const right = leafDrafts[mergeIndex + 1]!;
    left.title = `${left.title}与${right.title}`;
    left.narrative = `${left.narrative}\n\n${right.narrative}`;
    left.sourceIds = Array.from(
      new Set([...left.sourceIds, ...right.sourceIds]),
    );
    left.evidenceDocumentIds = Array.from(
      new Set([
        ...left.evidenceDocumentIds,
        ...right.evidenceDocumentIds,
      ]),
    );
    left.evidenceCharacters = left.evidenceDocumentIds.reduce(
      (total, id) =>
        total + (evidenceById.get(id)?.characters || 0),
      0,
    );
    leafDrafts.splice(mergeIndex + 1, 1);
  }

  for (const entry of Array.from(evidenceById.values())) {
    const linkedLeafIds = leafDrafts
      .filter((leaf) =>
        leaf.evidenceDocumentIds.includes(entry.document.id),
      )
      .map((leaf) => leaf.id);
    const current = markdownByPath.get(entry.document.path) || "";
    const withLinks = [
      current,
      "",
      "## 关联叶子 ID",
      "",
      ...(linkedLeafIds.length
        ? linkedLeafIds.map((id) => `- ${id}`)
        : ["- 无"]),
    ].join("\n");
    markdownByPath.set(entry.document.path, withLinks);
    entry.characters = evidenceCharacters(withLinks);
  }
  for (const leaf of leafDrafts) {
    leaf.evidenceCharacters = leaf.evidenceDocumentIds.reduce(
      (total, id) => total + (evidenceById.get(id)?.characters || 0),
      0,
    );
  }

  for (const leaf of leafDrafts) {
    const filename = `${String(leaf.order).padStart(3, "0")}-${titleSlug(
      leaf.title,
    )}.md`;
    const documentPath = `${leaf.branchId}/${filename}`;
    const document: PackageDocument = {
      id: leaf.id,
      path: documentPath,
      kind: "leaf",
      title: leaf.title,
      branchId: leaf.branchId,
      order: leaf.order,
      evidenceStatus: leaf.status,
      ...(leaf.sourceIds.length ? { sourceIds: leaf.sourceIds } : {}),
      assetIds: leaf.assetIds,
      evidenceCharacters: leaf.evidenceCharacters,
      dynamicMinimumCharacters: 8,
      evidenceDocumentIds: leaf.evidenceDocumentIds,
      ...(leaf.productFamilyIds
        ? { productFamilyIds: leaf.productFamilyIds }
        : {}),
      customerVisible: true,
    };
    documents.push(document);
    markdownByPath.set(
      documentPath,
      buildLeafMarkdown(
        leaf.title,
        date,
        leaf.status,
        leaf.narrative,
        sourceRecords,
        leaf.sourceIds,
      ),
    );
  }

  const overviewIds = new Map<DisplayBranchId, string>();
  for (const display of DISPLAY_BRANCHES) {
    const branchLeaves = leafDrafts.filter((leaf) =>
      display.canonicalBranches.includes(leaf.branchId),
    );
    const evidenceIds = Array.from(
      new Set(branchLeaves.flatMap((leaf) => leaf.evidenceDocumentIds)),
    );
    const evidenceForOverview = evidenceIds
      .map((id) => evidenceById.get(id))
      .filter(
        (
          entry,
        ): entry is { document: PackageDocument; characters: number } =>
          Boolean(entry),
      );
    const sourceIds = Array.from(
      new Set(
        branchLeaves
          .filter((leaf) => leaf.branchId === display.overviewBranch)
          .flatMap((leaf) => leaf.sourceIds),
      ),
    );
    const status = evidenceForOverview.length
      ? sourceStatus(sourceIds, sourceRecords)
      : "needs_verification";
    const intro = introByDisplay.get(display.id) || "";
    const introSourceIds = sourceIdsForMarkdown(intro, sourceRecords);
    let narrative =
      evidenceForOverview.length && introSourceIds.length
        ? sanitizeSupportedNarrative(intro)
        : "";
    if (!narrative && evidenceForOverview.length) {
      const first = branchLeaves.find(
        (leaf) =>
          leaf.branchId === display.overviewBranch &&
          leaf.status !== "needs_verification" &&
          leaf.status !== "not_applicable",
      );
      narrative = first?.narrative.split(/[。！？]\s*/)[0]?.slice(0, 90) || "";
      if (narrative && !/[。！？]$/.test(narrative)) narrative += "。";
    }
    if (!narrative) {
      narrative = `公开资料暂未提供${display.title}的充分可核验信息。`;
    }
    const documentId = `doc-overview-${display.id}`;
    const documentPath = `${display.overviewBranch}/overview.md`;
    overviewIds.set(display.id, documentId);
    const document: PackageDocument = {
      id: documentId,
      path: documentPath,
      kind: "overview",
      title: `${display.title}综述`,
      branchId: display.overviewBranch,
      order: 0,
      evidenceStatus: status,
      ...(status !== "needs_verification" && sourceIds.length
        ? { sourceIds }
        : {}),
      assetIds: [],
      evidenceCharacters: evidenceForOverview.reduce(
        (total, entry) => total + entry.characters,
        0,
      ),
      dynamicMinimumCharacters: 8,
      evidenceDocumentIds: evidenceForOverview.map(
        (entry) => entry.document.id,
      ),
      customerVisible: true,
    };
    documents.push(document);
    markdownByPath.set(
      documentPath,
      buildLeafMarkdown(
        document.title,
        date,
        status,
        narrative,
        sourceRecords,
        status === "needs_verification" ? [] : sourceIds,
      ),
    );
  }

  const referencedEvidenceIds = new Set(
    documents
      .filter((document) => document.customerVisible)
      .flatMap((document) => document.evidenceDocumentIds || []),
  );
  for (let index = documents.length - 1; index >= 0; index -= 1) {
    const document = documents[index]!;
    if (
      document.kind === "evidence" &&
      !referencedEvidenceIds.has(document.id)
    ) {
      documents.splice(index, 1);
      markdownByPath.delete(document.path);
      evidenceById.delete(document.id);
      for (const [sourceId, entry] of Array.from(
        evidenceBySourceId.entries(),
      )) {
        if (entry.document.id === document.id) {
          evidenceBySourceId.delete(sourceId);
        }
      }
    }
  }

  const rootDocuments: Array<{
    id: string;
    path: string;
    kind: PackageDocument["kind"];
    title: string;
    markdown: string;
  }> = [
    {
      id: "doc-readme",
      path: "README.md",
      kind: "readme",
      title: "知识库说明",
      markdown: `# ${input.companyName} 企业知识库\n\n本归档汇总企业公开事实、产品服务、技术能力与合作信息。`,
    },
    {
      id: "doc-tree",
      path: "00_knowledge_tree.md",
      kind: "tree",
      title: "知识树",
      markdown: [
        `# ${input.companyName} 知识树`,
        "",
        ...DISPLAY_BRANCHES.map(
          (branch) =>
            `- ${branch.title}：${leafDrafts
              .filter((leaf) =>
                branch.canonicalBranches.includes(leaf.branchId),
              )
              .map((leaf) => leaf.title)
              .join("、")}`,
        ),
      ].join("\n"),
    },
    {
      id: "doc-crawl",
      path: "00_crawl_coverage_report.md",
      kind: "report",
      title: "官网抓取覆盖报告",
      markdown: "",
    },
    {
      id: "doc-web",
      path: "00_web_intelligence_report.md",
      kind: "report",
      title: "公开信息报告",
      markdown: [
        `# ${input.companyName} 公开信息报告`,
        "",
        `主行业聚类：${candidateCluster(input.candidate)}`,
        "",
        `已登记来源：${sourceRecords.length}`,
        "",
        `事实维度覆盖：${input.candidate.metrics.coveredFactDimensions}/13`,
      ].join("\n"),
    },
    {
      id: "doc-sources",
      path: "00_source_index.md",
      kind: "source_index",
      title: "来源索引",
      markdown: sourceIndexMarkdown(input.companyName, sourceRecords),
    },
  ];
  for (const root of rootDocuments) {
    documents.push({
      id: root.id,
      path: root.path,
      kind: root.kind,
      title: root.title,
      customerVisible: false,
    });
    if (root.markdown) markdownByPath.set(root.path, root.markdown);
  }

  const assetResult = await finalizeAssets(
    input.candidate,
    documents,
    markdownByPath,
    sourceRecords,
    evidenceBySourceId,
  );
  const traceableRunAssets = (input.candidate.run?.assets || []).filter(
    (asset) => traceableAssetCandidate(asset),
  );
  const candidateLedger = [
    ...assetResult.finalized.map((entry) => entry.candidate),
    ...assetResult.rejected.filter(
      (entry) =>
        Boolean(entry.url || entry.sourceDocumentPath) &&
        Boolean(entry.sourcePageUrl || entry.sourceDocumentPath),
    ),
  ];
  const officialPages = sourceRecords.filter(
    (record) =>
      ["official_web", "official_document"].includes(record.source.kind) &&
      Boolean(record.source.normalizedUrl || record.source.url),
  );
  const officialPagesCompleted = Math.min(
    120,
    officialPages.filter((record) => record.source.status !== "failed").length,
  );
  markdownByPath.set(
    "00_crawl_coverage_report.md",
    [
      `# ${input.companyName} 官网抓取覆盖报告`,
      "",
      `成功读取官网页面：${officialPagesCompleted}`,
      "",
      `发现图片：${candidateLedger.length}`,
      "",
      `成功下载图片：${assetResult.finalized.length}`,
      "",
      `公开搜索词：${Math.min(12, input.candidate.run?.queries.length || 0)}`,
    ].join("\n"),
  );

  const evidenceIdsByDisplay = new Map<DisplayBranchId, Set<string>>();
  for (const display of DISPLAY_BRANCHES) {
    evidenceIdsByDisplay.set(
      display.id,
      new Set(
        documents
          .filter(
            (document) =>
              document.customerVisible &&
              document.branchId &&
              display.canonicalBranches.includes(document.branchId),
          )
          .flatMap((document) => document.evidenceDocumentIds || []),
      ),
    );
  }
  const evidenceCharactersById = new Map(
    Array.from(evidenceById.values()).map((entry) => [
      entry.document.id,
      entry.characters,
    ]),
  );
  const branchEvidence = DISPLAY_BRANCHES.map((display) => {
    const deduplicatedEvidenceCharacters = Array.from(
      evidenceIdsByDisplay.get(display.id) || [],
    ).reduce(
      (total, id) => total + (evidenceCharactersById.get(id) || 0),
      0,
    );
    return {
      branchId: display.id,
      overviewDocumentId: overviewIds.get(display.id)!,
      contentStatus:
        deduplicatedEvidenceCharacters > 0
          ? ("limited_evidence" as const)
          : ("needs_verification" as const),
      deduplicatedEvidenceCharacters,
      dynamicOverviewMinimum: 8,
      checkedSourceCount: checkedSourceCountForDisplay(display, documents),
    };
  });

  const leafDocuments = documents.filter(
    (document) => document.customerVisible && document.kind === "leaf",
  );
  const statusCounts = {
    verifiedFirstParty: 0,
    verifiedAuthoritative: 0,
    supportedThirdParty: 0,
    inferred: 0,
    needsVerification: 0,
    notApplicable: 0,
  };
  const statusKey: Record<EvidenceStatus, keyof typeof statusCounts> = {
    verified_first_party: "verifiedFirstParty",
    verified_authoritative: "verifiedAuthoritative",
    supported_third_party: "supportedThirdParty",
    needs_verification: "needsVerification",
    not_applicable: "notApplicable",
  };
  for (const document of leafDocuments) {
    statusCounts[statusKey[document.evidenceStatus!]] += 1;
  }
  const customerCharacters = documents
    .filter((document) => document.customerVisible)
    .reduce(
      (total, document) =>
        total +
        meaningfulCharacters(
          narrativeTextForDocument(markdownByPath.get(document.path) || ""),
        ),
      0,
    );
  const packagedEvidenceCharacters = documents
    .filter((document) => !document.customerVisible)
    .reduce(
      (total, document) =>
        total + evidenceCharacters(markdownByPath.get(document.path) || ""),
      0,
    );
  const uploadedSources = sourceRecords.filter(
    (record) => record.source.kind === "user_upload",
  );
  const queries = Math.min(12, input.candidate.run?.queries.length || 0);
  const completeness = KnowledgeBaseCompletenessInputSchema.parse({
    counts: {
      totalLeaves: leafDocuments.length,
      ...statusCounts,
    },
    acquisition: {
      officialPages: {
        completed: officialPagesCompleted,
        total: Math.min(120, officialPages.length),
      },
      images: {
        completed: assetResult.finalized.length,
        total: candidateLedger.length,
      },
      documents: {
        completed: uploadedSources.filter(
          (record) => record.source.status !== "failed",
        ).length,
        total: uploadedSources.length,
      },
      webQueries: { completed: queries, total: queries },
    },
    gaps: Array.from(
      new Set(
        leafDrafts
          .filter(
            (leaf) =>
              leaf.status === "needs_verification" ||
              leaf.status === "not_applicable",
          )
          .map((leaf) => `${leaf.title}：${leaf.narrative}`),
      ),
    ).slice(0, 200),
    evaluatedAt,
  });

  const productAssetIds = assetResult.finalized
    .filter((entry) =>
      ["product_ui", "product_diagram", "case_photo"].includes(
        entry.asset.assetType,
      ),
    )
    .map((entry) => entry.asset.id);
  const imageSelection = {
    status:
      assetResult.finalized.length > 0 &&
      assetResult.rejected.length === 0 &&
      assetResult.finalized.some(
        (entry) => entry.asset.assetType === "brand_identity",
      )
        ? ("target_met" as const)
        : ("source_limited" as const),
    discoveredCandidateImages: candidateLedger.length,
    inspectedCandidateImages: candidateLedger.length,
    eligibleFirstPartyImages: assetResult.finalized.length,
    rejectedCandidateImages: candidateLedger.filter(
      (entry) => entry.status === "rejected",
    ).length,
    scannedSourcePages: officialPagesCompleted,
    discoveryMethods: Array.from(
      new Set(candidateLedger.map((entry) => entry.method)),
    ),
    candidates: candidateLedger,
    productFamilies: [
      {
        id: "family-primary",
        name: "核心产品与服务",
        officialVisualFound: productAssetIds.length > 0,
        checkedSources: sourceRecords.filter((record) =>
          ["official_web", "official_document", "user_upload"].includes(
            record.source.kind,
          ),
        ).length,
        assetIds: productAssetIds,
        ...(productAssetIds.length
          ? {}
          : {
              gapReason:
                "已检查候选包登记的第一方页面与附件，未发现可交付的核心产品视觉。",
            }),
      },
    ],
    ...(!(
      assetResult.finalized.length > 0 &&
      assetResult.rejected.length === 0 &&
      assetResult.finalized.some(
        (entry) => entry.asset.assetType === "brand_identity",
      )
    )
      ? {
          shortfallReason:
            traceableRunAssets.length > 0
              ? "候选素材未全部满足来源、解码、尺寸或客户展示质量要求。"
              : "候选包未提供可追溯且可用于客户展示的第一方图片。",
        }
      : {}),
  };

  const packageManifest = WebsiteLeadPackageManifestV3InputSchema.parse({
    schemaVersion: 3 as const,
    profile: "website-lead-v1" as const,
    documents,
    assets: assetResult.finalized.map((entry) => entry.asset),
    counts: {
      totalFiles:
        documents.length + 2 + assetResult.finalized.length,
      customerVisibleCharacters: customerCharacters,
      evidenceCharacters: packagedEvidenceCharacters,
      packagedImages: assetResult.finalized.length,
    },
    branchEvidence,
    imageSelection,
  });
  const packageManifestText = `${JSON.stringify(packageManifest, null, 2)}\n`;
  const packageManifestSha256 = createHash("sha256")
    .update(packageManifestText)
    .digest("hex");

  const zip = new JSZip();
  const sortedMarkdown = Array.from(markdownByPath.entries()).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  for (const [entryPath, markdown] of sortedMarkdown) {
    zip.file(entryPath, markdown.endsWith("\n") ? markdown : `${markdown}\n`, {
      date: ZIP_DATE,
      unixPermissions: 0o100644,
      createFolders: false,
    });
  }
  zip.file(
    "00_completeness.json",
    `${JSON.stringify(completeness, null, 2)}\n`,
    {
      date: ZIP_DATE,
      unixPermissions: 0o100644,
      createFolders: false,
    },
  );
  zip.file("00_package_manifest.json", packageManifestText, {
    date: ZIP_DATE,
    unixPermissions: 0o100644,
    createFolders: false,
  });
  for (const finalized of assetResult.finalized.sort((left, right) =>
    left.asset.path.localeCompare(right.asset.path),
  )) {
    zip.file(finalized.asset.path, finalized.bytes, {
      date: ZIP_DATE,
      unixPermissions: 0o100644,
      createFolders: false,
    });
  }
  const bytes = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "UNIX",
  });
  let manifest: KnowledgeBaseManifest;
  try {
    manifest = await parseKnowledgeBaseArchive(bytes, {
      companyName: input.companyName,
      generatedAt: evaluatedAt,
      validationProfile: "website-lead-v1",
    });
  } catch (error) {
    throw new Error(
      `KB_FINALIZER_CONTRACT_VIOLATION: ${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
  return {
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    packageManifestSha256,
    manifest,
    assessment,
    metrics: {
      leafCount: leafDocuments.length,
      customerCharacters,
      evidenceCharacters: packagedEvidenceCharacters,
      packagedImages: assetResult.finalized.length,
    },
  };
}
