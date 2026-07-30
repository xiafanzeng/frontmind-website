import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { deflateSync } from "node:zlib";
import JSZip from "jszip";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  customerFacingNarrativeViolation,
  extractKnowledgeBaseAssetPreviews,
  parseKnowledgeBaseArchive,
} from "./archive";

const execFileAsync = promisify(execFile);

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function buildTestPng(seed = 0, width = 1, height = 1) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc((width * 3 + 1) * height);
  for (let row = 0; row < height; row += 1) {
    const offset = row * (width * 3 + 1);
    pixels[offset] = 0;
    for (let column = 0; column < width; column += 1) {
      const pixel = offset + 1 + column * 3;
      pixels[pixel] = seed % 256;
      pixels[pixel + 1] = (seed * 41) % 256;
      pixels[pixel + 2] = (seed * 97) % 256;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function manifestEvidenceCharacterCount(markdown: string) {
  return Array.from(
    markdown
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

const validCompletenessInput = {
  counts: {
    totalLeaves: 46,
    verifiedFirstParty: 24,
    verifiedAuthoritative: 5,
    supportedThirdParty: 3,
    inferred: 4,
    needsVerification: 8,
    notApplicable: 2,
  },
  acquisition: {
    officialPages: { completed: 124, total: 128 },
    images: { completed: 46, total: 52 },
    documents: { completed: 8, total: 10 },
    webQueries: { completed: 39, total: 42 },
  },
  gaps: ["售后响应时效仍缺少企业正式说明"],
  evaluatedAt: "2026-07-26T10:00:00.000Z",
};

const fixtureLeafStatuses = [
  "verified_first_party",
  "needs_verification",
  "verified_first_party",
  "verified_authoritative",
  "supported_third_party",
  "inferred",
  "not_applicable",
  ...Array(22).fill("verified_first_party"),
  ...Array(4).fill("verified_authoritative"),
  ...Array(2).fill("supported_third_party"),
  ...Array(3).fill("inferred"),
  ...Array(7).fill("needs_verification"),
  "not_applicable",
] as const;
const fixtureBranchPaths = [
  "01_company_overview",
  "02_team",
  "03_products/product-a",
  "04_technology",
  "05_manufacturing",
  "06_industries/research",
  "07_service",
  "08_competitive_advantages",
] as const;
type FixturePackageBranchId =
  | "01_company_overview"
  | "02_team"
  | "03_products"
  | "04_technology"
  | "05_manufacturing"
  | "06_industries"
  | "07_service"
  | "08_competitive_advantages";

async function buildFixtureZip(
  completenessInput: unknown = validCompletenessInput,
) {
  const zip = new JSZip();
  const root = zip.folder("Acme_knowledge_base")!;
  root.file(
    "README.md",
    "# Acme 企业知识库\n\nAcme 提供面向科研团队的精密设备与全周期技术支持。",
  );
  root.file("00_knowledge_tree.md", "# 知识树\n\n七个分支均已写入。");
  if (completenessInput !== null) {
    root.file("00_completeness.json", JSON.stringify(completenessInput));
  }
  root.file(
    "00_crawl_coverage_report.md",
    "# 官网抓取覆盖报告\n\n发现页面：128\n\n成功下载图片：46\n\n- 官网：https://example.com/acme/about",
  );
  root.file(
    "00_web_intelligence_report.md",
    "# 全网情报\n\n- 权威认证：https://example.org/registry/acme",
  );
  root.file(
    "00_source_index.md",
    "# 来源索引\n\n- Acme 官网：https://example.com/acme/products",
  );
  fixtureLeafStatuses.forEach((status, index) => {
    const branch = fixtureBranchPaths[index % fixtureBranchPaths.length];
    const filename =
      index === 0
        ? "profile.md"
        : `leaf-${String(index + 1).padStart(2, "0")}.md`;
    root.file(
      `${branch}/${filename}`,
      `# 知识叶节点 ${index + 1}\n\n> 最后更新: 2026-07-26 | 状态: ${status} | 来源: 企业官网\n\nAcme 当前叶节点包含可审计的企业知识内容。`,
    );
  });
  root.file("09_media_assets/product_images/product-a.png", buildTestPng());
  return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
}

async function buildWebsiteLeadBudgetFixture(options?: {
  schemaVersion?: 1 | 2;
  leafCount?: number;
  imageCount?: number;
  documentCount?: number;
  extraFileCount?: number;
  narrativeCharactersPerLeaf?: number;
  officialPagesCompleted?: number;
  webQueriesCompleted?: number;
  sourceCharactersPerLeaf?: number;
  imageCompletedOverride?: number;
  imageTotalOverride?: number;
  eligibleFirstPartyImages?: number;
  omitImageShortfallReason?: boolean;
  invalidImageIndex?: number;
  malformedRaster?: "jpeg" | "webp" | "avif";
  rasterOverride?: {
    bytes: Buffer;
    extension: "avif" | "gif" | "jpg" | "webp";
    mimeType: "image/avif" | "image/gif" | "image/jpeg" | "image/webp";
    width: number;
    height: number;
  };
  imageHashOverride?: string;
  duplicateImageBytes?: boolean;
  rawSnapshotLeafIndex?: number;
  customerLeakageLeafIndex?: number;
  crawlReportImageClaim?: number;
  omitImageDimensions?: boolean;
  omitImageSourcePage?: boolean;
  repeatedTemplateParagraph?: boolean;
  omitLeafSourceIds?: boolean;
  v2EvidenceCharactersPerBranch?: number;
  v2OverviewNarrativeCharacters?: number;
  v2ContentStatus?: "complete" | "limited_evidence" | "needs_verification";
}) {
  const schemaVersion = options?.schemaVersion ?? 1;
  const leafCount = options?.leafCount ?? 40;
  const imageCount = options?.imageCount ?? 1;
  const documentCount = options?.documentCount ?? 0;
  const zip = new JSZip();
  const root = zip.folder("Bounded_knowledge_base")!;
  const packageDocuments: Array<{
    id: string;
    path: string;
    kind: "overview" | "leaf" | "evidence" | "report" | "index";
    title: string;
    branchId?: FixturePackageBranchId;
    order?: number;
    evidenceStatus?:
      | "verified_first_party"
      | "verified_authoritative"
      | "supported_third_party"
      | "inferred"
      | "needs_verification"
      | "not_applicable";
    sourceIds?: string[];
    assetIds?: string[];
    evidenceCharacters?: number;
    dynamicMinimumCharacters?: number;
    evidenceDocumentIds?: string[];
    productFamilyIds?: string[];
    customerVisible: boolean;
  }> = [];
  const evidenceMarkdown: string[] = [];
  const headerOnlyRaster = (kind: "jpeg" | "webp" | "avif") => {
    if (kind === "jpeg") return Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const bytes = Buffer.alloc(16);
    if (kind === "webp") {
      bytes.write("RIFF", 0, "ascii");
      bytes.writeUInt32LE(8, 4);
      bytes.write("WEBP", 8, "ascii");
    } else {
      bytes.writeUInt32BE(16, 0);
      bytes.write("ftyp", 4, "ascii");
      bytes.write("avif", 8, "ascii");
    }
    return bytes;
  };
  const addManifestMarkdown = (
    entryPath: string,
    content: string,
    metadata: Omit<(typeof packageDocuments)[number], "path">,
  ) => {
    root.file(entryPath, content);
    packageDocuments.push({ path: entryPath, ...metadata });
    if (!metadata.customerVisible) evidenceMarkdown.push(content);
  };
  addManifestMarkdown(
    "README.md",
    "# Bounded 企业知识库\n\n广度优先的企业事实底稿。",
    {
      id: "doc-readme",
      kind: "report",
      title: "知识库说明",
      customerVisible: false,
    },
  );
  addManifestMarkdown(
    "00_knowledge_tree.md",
    "# 知识树\n\n八个目录均已写入。",
    {
      id: "doc-tree",
      kind: "index",
      title: "知识树",
      customerVisible: false,
    },
  );
  root.file(
    "00_completeness.json",
    JSON.stringify({
      counts: {
        totalLeaves: leafCount,
        verifiedFirstParty: leafCount,
        verifiedAuthoritative: 0,
        supportedThirdParty: 0,
        inferred: 0,
        needsVerification: 0,
        notApplicable: 0,
      },
      acquisition: {
        officialPages: {
          completed: options?.officialPagesCompleted ?? 100,
          total: Math.max(options?.officialPagesCompleted ?? 100, 100),
        },
        images: {
          completed: options?.imageCompletedOverride ?? imageCount,
          total: options?.imageTotalOverride ?? imageCount,
        },
        documents: {
          completed: documentCount,
          total: documentCount,
        },
        webQueries: {
          completed: options?.webQueriesCompleted ?? 12,
          total: options?.webQueriesCompleted ?? 12,
        },
      },
      gaps: [],
      evaluatedAt: "2026-07-29T01:00:00.000Z",
    }),
  );
  addManifestMarkdown(
    "00_crawl_coverage_report.md",
    `# 官网抓取覆盖报告\n\n已按预算完成广度优先采集。\n\n发现图片：${
      options?.imageTotalOverride ?? imageCount
    }\n\n成功下载图片：${options?.crawlReportImageClaim ?? imageCount}`,
    {
      id: "doc-crawl",
      kind: "report",
      title: "官网抓取覆盖报告",
      customerVisible: false,
    },
  );
  addManifestMarkdown(
    "00_web_intelligence_report.md",
    "# 全网企业情报报告\n\n公开查询未超过预算。",
    {
      id: "doc-web",
      kind: "report",
      title: "全网企业情报报告",
      customerVisible: false,
    },
  );
  addManifestMarkdown(
    "00_source_index.md",
    "# 来源索引\n\n- 企业官网：https://example.com/",
    {
      id: "doc-sources",
      kind: "index",
      title: "来源索引",
      customerVisible: false,
    },
  );
  const overviewPublicBranches = new Set<string>();
  const v2DisplayBranches = [
    ["company-identity", "01_company_overview"],
    ["team", "02_team"],
    ["products-services", "03_products"],
    ["core-capabilities", "04_technology"],
    ["customers-industries", "06_industries"],
    ["cooperation", "07_service"],
    ["why-frontmind", "08_competitive_advantages"],
  ] as const;
  const v2EvidenceByPublicBranch = new Map<
    string,
    { id: string; characters: number }
  >();
  const v2EvidenceByCanonicalBranch = new Map<
    string,
    { id: string; characters: number }
  >();
  if (schemaVersion === 2) {
    for (const [publicBranch, branchId] of v2DisplayBranches) {
      const id = `doc-evidence-${publicBranch}`;
      const content = [
        `# ${publicBranch} 去重证据`,
        "",
        String.fromCodePoint(0x5200 + v2EvidenceByPublicBranch.size).repeat(
          options?.v2EvidenceCharactersPerBranch ?? 400,
        ),
      ].join("\n");
      addManifestMarkdown(
        `10_reference_assets/evidence/${publicBranch}.md`,
        content,
        {
          id,
          kind: "evidence",
          title: `${publicBranch} 去重证据`,
          branchId,
          sourceIds: ["source-official"],
          customerVisible: false,
        },
      );
      v2EvidenceByPublicBranch.set(publicBranch, {
        id,
        characters: manifestEvidenceCharacterCount(content),
      });
      v2EvidenceByCanonicalBranch.set(
        branchId,
        v2EvidenceByPublicBranch.get(publicBranch)!,
      );
    }
    const manufacturingContent = [
      "# manufacturing 去重证据",
      "",
      String.fromCodePoint(0x5300).repeat(
        options?.v2EvidenceCharactersPerBranch ?? 400,
      ),
    ].join("\n");
    addManifestMarkdown(
      "10_reference_assets/evidence/manufacturing.md",
      manufacturingContent,
      {
        id: "doc-evidence-manufacturing",
        kind: "evidence",
        title: "manufacturing 去重证据",
        branchId: "05_manufacturing",
        sourceIds: ["source-official"],
        customerVisible: false,
      },
    );
    v2EvidenceByCanonicalBranch.set("05_manufacturing", {
      id: "doc-evidence-manufacturing",
      characters: manifestEvidenceCharacterCount(manufacturingContent),
    });
  }
  const productDocumentId = "doc-leaf-003";
  const productAssetIds = Array.from(
    { length: imageCount },
    (_, index) => `asset-${String(index + 1).padStart(3, "0")}`,
  );
  for (let index = 0; index < leafCount; index += 1) {
    const branch = fixtureBranchPaths[index % fixtureBranchPaths.length]!;
    const branchId = branch.split("/")[0] as FixturePackageBranchId;
    const publicBranch =
      v2DisplayBranches.find(([, candidate]) => candidate === branchId)?.[0] ??
      (branchId === "05_manufacturing"
        ? "core-capabilities"
        : "company-identity");
    const kind =
      schemaVersion === 2
        ? "leaf"
        : overviewPublicBranches.has(publicBranch)
          ? "leaf"
          : "overview";
    overviewPublicBranches.add(publicBranch);
    const documentId = `doc-leaf-${String(index + 1).padStart(3, "0")}`;
    const narrative =
      options?.rawSnapshotLeafIndex === index
        ? `第一方页面摘录${String.fromCodePoint(0x4e00 + index).repeat(
            Math.max(0, (options?.narrativeCharactersPerLeaf ?? 200) - 7),
          )}`
        : options?.customerLeakageLeafIndex === index
          ? "其余荣誉图片因本轮没有形成可逐项核验的证书名称与有效期不在正文中扩写采购或合规审查仍应向企业索取证书编号不能仅凭网页图标替代正式查验".padEnd(
              options?.narrativeCharactersPerLeaf ?? 200,
              "甲",
            )
          : [
              options?.repeatedTemplateParagraph
                ? "这是在多个叶子中重复出现并试图充当正式知识正文的固定模板段落。".repeat(
                    5,
                  )
                : "",
              String.fromCodePoint(0x4e00 + index).repeat(
                options?.narrativeCharactersPerLeaf ?? 200,
              ),
            ]
              .filter(Boolean)
              .join("\n\n");
    addManifestMarkdown(
      `${branch}/leaf-${String(index + 1).padStart(2, "0")}.md`,
      [
        `# 叶子 ${index + 1}`,
        "",
        "> 最后更新: 2026-07-29 | 状态: verified_first_party | 来源: 企业官网",
        "",
        "## 核心内容",
        "",
        narrative,
        "",
        "## 原始来源",
        "",
        `源`.repeat(options?.sourceCharactersPerLeaf ?? 0),
        "- https://example.com/",
      ].join("\n"),
      {
        id: documentId,
        kind,
        title: `叶子 ${index + 1}`,
        branchId,
        order: index,
        evidenceStatus: "verified_first_party",
        ...(options?.omitLeafSourceIds
          ? {}
          : { sourceIds: ["source-official"] }),
        assetIds: documentId === productDocumentId ? productAssetIds : [],
        ...(schemaVersion === 2
          ? {
              evidenceCharacters:
                v2EvidenceByCanonicalBranch.get(branchId)!.characters,
              dynamicMinimumCharacters: Math.min(
                200,
                Math.max(
                  60,
                  Math.ceil(
                    v2EvidenceByCanonicalBranch.get(branchId)!.characters * 0.2,
                  ),
                ),
              ),
              evidenceDocumentIds: [
                v2EvidenceByCanonicalBranch.get(branchId)!.id,
              ],
              ...(branchId === "03_products"
                ? { productFamilyIds: ["family-primary"] }
                : {}),
            }
          : {}),
        customerVisible: true,
      },
    );
  }
  if (schemaVersion === 2) {
    for (const [
      index,
      [publicBranch, branchId],
    ] of v2DisplayBranches.entries()) {
      const evidence = v2EvidenceByPublicBranch.get(publicBranch)!;
      const narrativeCharacters = options?.v2OverviewNarrativeCharacters ?? 200;
      const documentId = `doc-overview-${publicBranch}`;
      const narrative = String.fromCodePoint(0x5600 + index).repeat(
        narrativeCharacters,
      );
      addManifestMarkdown(
        `${branchId}/overview.md`,
        [
          `# ${publicBranch} 综述`,
          "",
          "> 最后更新: 2026-07-29 | 状态: verified_first_party | 来源: 企业官网",
          "",
          "## 正式综述",
          "",
          narrative,
          "",
          "## 原始来源",
          "",
          "- https://example.com/",
        ].join("\n"),
        {
          id: documentId,
          kind: "overview",
          title: `${publicBranch} 综述`,
          branchId,
          order: 0,
          evidenceStatus: "verified_first_party",
          sourceIds: ["source-official"],
          assetIds: branchId === "03_products" ? productAssetIds : [],
          evidenceCharacters: evidence.characters,
          dynamicMinimumCharacters: Math.min(
            publicBranch === "products-services" ? 3_000 : 1_500,
            Math.max(120, Math.ceil(evidence.characters * 0.25)),
          ),
          evidenceDocumentIds: [evidence.id],
          customerVisible: true,
        },
      );
    }
  }
  const packageAssets = [];
  for (let index = 0; index < imageCount; index += 1) {
    const assetId = productAssetIds[index]!;
    const malformedKind = index === 0 ? options?.malformedRaster : undefined;
    const rasterOverride = index === 0 ? options?.rasterOverride : undefined;
    const extension =
      rasterOverride?.extension ||
      (malformedKind === "jpeg" ? "jpg" : malformedKind || "png");
    const mimeType =
      rasterOverride?.mimeType ||
      (malformedKind === "jpeg"
        ? "image/jpeg"
        : malformedKind === "webp"
          ? "image/webp"
          : malformedKind === "avif"
            ? "image/avif"
            : "image/png");
    const assetPath = `09_media_assets/product_images/image-${index + 1}.${extension}`;
    const imageBytes =
      rasterOverride?.bytes ||
      (malformedKind
        ? headerOnlyRaster(malformedKind)
        : options?.invalidImageIndex === index
          ? Buffer.from("not an image")
          : buildTestPng(
              options?.duplicateImageBytes ? 1 : index + 1,
              schemaVersion === 2 ? 800 : 1,
              schemaVersion === 2 ? 450 : 1,
            ));
    root.file(assetPath, imageBytes);
    packageAssets.push({
      id: assetId,
      path: assetPath,
      sha256:
        options?.imageHashOverride ??
        createHash("sha256").update(imageBytes).digest("hex"),
      mimeType,
      bytes: imageBytes.byteLength,
      ...(options?.omitImageDimensions
        ? {}
        : {
            width: rasterOverride?.width ?? (schemaVersion === 2 ? 800 : 1),
            height: rasterOverride?.height ?? (schemaVersion === 2 ? 450 : 1),
          }),
      caption: `产品图片 ${index + 1}`,
      alt: `产品图片 ${index + 1}`,
      branchId: "03_products",
      documentIds:
        schemaVersion === 2
          ? [productDocumentId, "doc-overview-products-services"]
          : [productDocumentId],
      ...(options?.omitImageSourcePage
        ? {}
        : { sourcePageUrl: "https://example.com/products" }),
      sourceAssetUrl: `https://example.com/assets/image-${index + 1}.${extension}`,
      ownership: "first_party",
      ...(schemaVersion === 2
        ? {
            assetType: index === 0 ? "brand_identity" : "product_ui",
            displayRole: "inline",
          }
        : {}),
    });
  }
  for (let index = 0; index < documentCount; index += 1) {
    root.file(
      `10_reference_assets/documents/document-${index + 1}.pdf`,
      Buffer.from("%PDF-1.4\n"),
    );
  }
  for (let index = 0; index < (options?.extraFileCount ?? 0); index += 1) {
    root.file(
      `10_reference_assets/ledger-${index + 1}.csv`,
      "source_id,url\nsource-official,https://example.com/",
    );
  }
  const customerVisibleCharacters =
    leafCount * (options?.narrativeCharactersPerLeaf ?? 200) +
    (schemaVersion === 2
      ? 7 * (options?.v2OverviewNarrativeCharacters ?? 200)
      : 0);
  const eligibleFirstPartyImages =
    options?.eligibleFirstPartyImages ?? imageCount;
  const totalFiles =
    packageDocuments.length +
    1 +
    1 +
    imageCount +
    documentCount +
    (options?.extraFileCount ?? 0);
  root.file(
    "00_package_manifest.json",
    JSON.stringify({
      schemaVersion,
      profile: "website-lead-v1",
      documents: packageDocuments,
      assets: packageAssets,
      counts: {
        totalFiles,
        customerVisibleCharacters,
        evidenceCharacters: evidenceMarkdown.reduce(
          (total, markdown) => total + manifestEvidenceCharacterCount(markdown),
          0,
        ),
        packagedImages: imageCount,
      },
      ...(schemaVersion === 2
        ? {
            branchEvidence: v2DisplayBranches.map(([publicBranch], index) => {
              const evidence = v2EvidenceByPublicBranch.get(publicBranch)!;
              const branchEvidenceCharacters =
                evidence.characters +
                (publicBranch === "core-capabilities"
                  ? v2EvidenceByCanonicalBranch.get("05_manufacturing")!
                      .characters
                  : 0);
              return {
                branchId: publicBranch,
                overviewDocumentId: `doc-overview-${publicBranch}`,
                contentStatus: options?.v2ContentStatus ?? "limited_evidence",
                deduplicatedEvidenceCharacters: branchEvidenceCharacters,
                dynamicOverviewMinimum: Math.min(
                  publicBranch === "products-services" ? 3_000 : 1_500,
                  Math.max(120, Math.ceil(branchEvidenceCharacters * 0.25)),
                ),
                checkedSourceCount: index + 1,
              };
            }),
            imageSelection: {
              status: imageCount > 1 ? "target_met" : "source_limited",
              discoveredCandidateImages: imageCount,
              inspectedCandidateImages: imageCount,
              eligibleFirstPartyImages,
              rejectedCandidateImages: 0,
              scannedSourcePages: options?.officialPagesCompleted ?? 100,
              discoveryMethods: [
                "img",
                "srcset_or_lazy",
                "picture",
                "css_background",
                "open_graph",
                "gallery",
                "official_document",
              ],
              candidates: packageAssets.map((asset) => ({
                url: asset.sourceAssetUrl,
                sourcePageUrl: asset.sourcePageUrl,
                method: "img",
                status: "eligible",
                assetId: asset.id,
              })),
              productFamilies: [
                {
                  id: "family-primary",
                  name: "核心产品族",
                  officialVisualFound: imageCount > 1,
                  checkedSources: 3,
                  assetIds: packageAssets.slice(1).map((asset) => asset.id),
                  ...(imageCount > 1
                    ? {}
                    : {
                        gapReason:
                          "已检查官网产品页、页面元数据和资料附件，未发现可交付的官方视觉素材。",
                      }),
                },
              ],
              ...(imageCount <= 1 && !options?.omitImageShortfallReason
                ? {
                    shortfallReason:
                      "官网已检查的第一方来源未提供可满足核心产品族覆盖的合格产品视觉。",
                  }
                : {}),
            },
          }
        : {
            imageSelection: {
              eligibleFirstPartyImages,
              ...(eligibleFirstPartyImages < 36 &&
              !options?.omitImageShortfallReason
                ? {
                    shortfallReason:
                      "官网本次仅发现这些经过验证且适合客户展示的第一方图片。",
                  }
                : {}),
            },
          }),
    }),
  );
  return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
}

async function buildLegacyBaseFixtureZip(options?: {
  missingSource?: boolean;
  mismatchedLeafSourceIds?: boolean;
  mismatchedLeafPath?: boolean;
  sixBranches?: boolean;
  omitRequiredReport?: boolean;
  privateFirstPartyLocator?: boolean;
}) {
  const zip = new JSZip();
  const root = zip.folder("legacy_company_knowledge_base")!;
  const payloads = new Map<string, Buffer>();
  const addPayload = (entryPath: string, content: string | Buffer) => {
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
    root.file(entryPath, bytes);
    payloads.set(entryPath, bytes);
  };
  const branchTitles = [
    "企业概况",
    "市场定位与行业背景",
    "产品与服务",
    "方法论与技术能力",
    "交付协作与合作入口",
    "内容资产与公开研究",
    "治理、合规与待核验",
  ];
  const leaves: Array<{
    node_id: string;
    title: string;
    path: string;
    evidence_status:
      | "first_party_claim"
      | "verified"
      | "needs_verification"
      | "not_applicable";
    source_ids: string[];
    has_markdown_content: true;
    not_applicable_reasoned: boolean;
  }> = [];
  const evidenceStatusCounts = {
    first_party_claim: 0,
    verified: 0,
    needs_verification: 0,
    not_applicable: 0,
  };
  branchTitles.forEach((branchTitle, branchIndex) => {
    for (let leafIndex = 0; leafIndex < 6; leafIndex += 1) {
      const status =
        leafIndex < 2
          ? "first_party_claim"
          : leafIndex < 4
            ? "verified"
            : leafIndex === 4
              ? "needs_verification"
              : "not_applicable";
      const renderedBranchIndex =
        options?.sixBranches && branchIndex === 6 ? 6 : branchIndex + 1;
      const directory = `${String(renderedBranchIndex).padStart(2, "0")}_${
        branchTitles[renderedBranchIndex - 1]
      }`;
      const nodeId = `${String(branchIndex + 1).padStart(2, "0")}.${String(
        leafIndex + 1,
      ).padStart(2, "0")}`;
      const entryPath = `knowledge/${directory}/${String(
        branchIndex + 1,
      ).padStart(2, "0")}_${String(leafIndex + 1).padStart(2, "0")}_节点.md`;
      const sourceIds =
        status === "verified"
          ? leafIndex === 2
            ? branchIndex === 1
              ? ["I02"]
              : ["I01"]
            : branchIndex === 0
              ? ["A01"]
              : ["F01"]
          : ["F01"];
      const declaredPath =
        options?.mismatchedLeafPath && branchIndex === 0 && leafIndex === 0
          ? entryPath.replace("节点.md", "不存在.md")
          : entryPath;
      const leaf = {
        node_id: nodeId,
        title: `${branchTitle}节点 ${leafIndex + 1}`,
        path: declaredPath,
        evidence_status: status,
        source_ids:
          options?.missingSource && branchIndex === 0 && leafIndex === 0
            ? ["X99"]
            : options?.mismatchedLeafSourceIds &&
                branchIndex === 0 &&
                leafIndex === 2
              ? ["F01"]
              : sourceIds,
        has_markdown_content: true as const,
        not_applicable_reasoned: status === "not_applicable",
      };
      leaves.push(leaf);
      evidenceStatusCounts[status] += 1;
      addPayload(
        entryPath,
        [
          "---",
          `node_id: "${nodeId}"`,
          `path: "${entryPath}"`,
          `title: "${leaf.title}"`,
          `evidence_status: "${status}"`,
          `source_ids: ${JSON.stringify(sourceIds)}`,
          'last_verified: "2026-07-27"',
          "---",
          "",
          `# ${leaf.title}`,
          "",
          "该节点内容来自包内列明来源，并明确保留证据边界。",
          "",
          `来源：https://example.com/legacyco/${branchIndex + 1}/${leafIndex + 1}`,
        ].join("\n"),
      );
    }
  });
  const requiredReports = [
    "reports/01_full_web_intelligence_report.md",
    "reports/02_official_site_crawl_coverage.md",
    "reports/03_first_party_image_inventory.md",
    "reports/04_third_party_reference_asset_inventory.md",
    "reports/05_unresolved_verification_gaps.md",
    "references/source_index.md",
  ];
  addPayload(
    "00_completeness.json",
    JSON.stringify({
      companyName: "LegacyCo 有限公司",
      officialWebsite: "https://example.com/legacyco/",
      buildDate: "2026-07-27",
      total_leaf_nodes: leaves.length,
      completed_leaf_nodes: leaves.length,
      needs_verification_nodes: evidenceStatusCounts.needs_verification,
      not_applicable_nodes: evidenceStatusCounts.not_applicable,
      evidence_status_counts: evidenceStatusCounts,
      completion_gate_passed: true,
      leaves,
      required_reports: requiredReports,
      validation_note: "所有叶子、报告、来源与原始证据均已打包。",
      package_constraints: {
        no_html_deliverable: true,
        no_interactive_research_webpage: true,
        raw_evidence_scope: "仅包含可审计文本、元数据与第一方素材。",
      },
    }),
  );
  addPayload("README.md", "# LegacyCo 企业知识库\n\n严格证据知识库。");
  addPayload(
    "00_knowledge_tree.md",
    `# 知识树\n\n${branchTitles.map((title) => `- ${title}`).join("\n")}`,
  );
  addPayload(
    "reports/01_full_web_intelligence_report.md",
    "# 全网情报报告\n\n来源：https://example.org/independent/report",
  );
  addPayload(
    "reports/02_official_site_crawl_coverage.md",
    "# 官网抓取覆盖报告\n\n| 静态发现并解析的官网 URL | 42 |\n| 第一方图片资源 | 1 |\n\nhttps://example.com/legacyco/",
  );
  addPayload(
    "reports/03_first_party_image_inventory.md",
    "# 第一方图片库存\n\n共归档 1 张第一方图片。",
  );
  addPayload(
    "reports/04_third_party_reference_asset_inventory.md",
    "# 第三方参考素材库存\n\n本次没有交付第三方二进制素材。",
  );
  if (!options?.omitRequiredReport) {
    addPayload(
      "reports/05_unresolved_verification_gaps.md",
      "# 待核验缺口\n\n未核验节点均已逐项列明。",
    );
  }
  addPayload(
    "references/source_index.md",
    [
      "# 来源索引",
      "",
      "| ID | 来源类型 | 标题 | URL / 包内归档 | 主要用途 |",
      "|---|---|---|---|---|",
      `| <a id="f01"></a>F01 | 第一方官网 | LegacyCo 官网 | ${
        options?.privateFirstPartyLocator
          ? "http://127.0.0.1/admin"
          : "https://example.com/legacyco/"
      } | 企业公开信息 |`,
      '| <a id="i01"></a>I01 | 独立官方机构 | 独立记录 | https://example.org/independent/record | 权威核验 |',
      '| <a id="i02"></a>I02 | 学术预印本 | 原始研究 | https://arxiv.org/abs/1234.5678 | 研究定义 |',
      '| <a id="a01"></a>A01 | 关联实验室公开网站 | 关联资料 | https://example.net/related/ | 第三方支持 |',
      '| <a id="c01"></a>C01 | 本次采集元数据 | 抓取元数据 | [../raw/metadata/crawl.json](../raw/metadata/crawl.json) | 覆盖证明 |',
    ].join("\n"),
  );
  addPayload("raw/metadata/crawl.json", '{"pages":42}');
  addPayload(
    "raw/official_images/logo.png",
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  root.file("VALIDATION.md", "# 验证结果\n\n逐叶与逐文件校验通过。");
  root.file(
    "MANIFEST.sha256",
    Array.from(payloads.entries())
      .map(
        ([entryPath, bytes]) =>
          `${createHash("sha256").update(bytes).digest("hex")}  ${entryPath}`,
      )
      .join("\n"),
  );
  return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
}

describe("knowledge-base ZIP manifest", () => {
  it("rejects a structurally complete canonical archive with no evidence-backed leaf", async () => {
    const archive = await buildFixtureZip({
      ...validCompletenessInput,
      counts: {
        totalLeaves: 46,
        verifiedFirstParty: 0,
        verifiedAuthoritative: 0,
        supportedThirdParty: 0,
        inferred: 0,
        needsVerification: 46,
        notApplicable: 0,
      },
      acquisition: {},
    });

    await expect(
      parseKnowledgeBaseArchive(archive, { companyName: "Acme" }),
    ).rejects.toThrow(/at least one leaf must have evidence-backed/);
  });

  it("builds a rich seven-branch manifest without changing the archive", async () => {
    const archive = await buildFixtureZip();
    const manifest = await parseKnowledgeBaseArchive(archive, {
      companyName: "acme.example",
    });
    expect(manifest.companyName).toBe("Acme");
    expect(manifest.sections).toHaveLength(7);
    expect(manifest.sections.find((item) => item.id === "team")?.status).toBe(
      "needs_verification",
    );
    expect(
      manifest.sections.find((item) => item.id === "company-identity")?.summary,
    ).toContain("Acme 当前叶节点包含可审计的企业知识内容");
    expect(
      manifest.sections.find((item) => item.id === "company-identity")?.summary,
    ).not.toContain("最后更新");
    expect(manifest.sources.map((item) => item.url)).toContain(
      "https://example.com/acme/products",
    );
    expect(manifest.assets[0]).toMatchObject({
      name: "product-a.png",
      sectionId: "products-services",
      type: "图片",
    });
    expect(manifest.metrics.find((item) => item.key === "pages")?.value).toBe(
      128,
    );
    expect(manifest.completeness).toEqual({
      score: 73,
      label: "当前知识库证据完整度",
      basis:
        "已取得一方、权威或可溯源第三方证据的适用叶子节点数 ÷ 适用叶子节点总数",
      counts: {
        ...validCompletenessInput.counts,
        applicableLeaves: 44,
      },
      acquisition: validCompletenessInput.acquisition,
      gaps: validCompletenessInput.gaps,
      evaluatedAt: validCompletenessInput.evaluatedAt,
      caveat:
        "该比例仅反映本次一次性抓取后知识库叶子的证据覆盖，不代表整个互联网的信息已被穷尽，也不表示持续迭代进度。",
    });
    expect(
      manifest.metrics.find((item) => item.key === "completeness"),
    ).toMatchObject({
      label: "知识库完整度",
      value: "73%",
    });
    expect(manifest.reportMarkdown).toContain("官网抓取覆盖报告");

    const previews = await extractKnowledgeBaseAssetPreviews(archive, manifest);
    expect(previews.get(manifest.assets[0].id)).toMatchObject({
      contentType: "image/png",
      filename: "product-a.png",
    });
  });

  it("accepts a legacy YYYY-MM-DD completeness date and normalizes it", async () => {
    const archive = await buildFixtureZip({
      ...validCompletenessInput,
      evaluatedAt: "2026-07-29",
    });

    await expect(
      parseKnowledgeBaseArchive(archive, { companyName: "DateCompatibleCo" }),
    ).resolves.toMatchObject({
      completeness: {
        evaluatedAt: "2026-07-29T00:00:00.000Z",
      },
    });
  });

  it("applies current website budgets only when the new-build profile is explicit", async () => {
    const archive = await buildWebsiteLeadBudgetFixture({
      leafCount: 57,
      imageCount: 49,
      extraFileCount: 39,
      narrativeCharactersPerLeaf: 320,
      officialPagesCompleted: 121,
      webQueriesCompleted: 13,
    });

    await expect(
      parseKnowledgeBaseArchive(archive, { companyName: "HistoricalCo" }),
    ).resolves.toMatchObject({
      completeness: {
        counts: { totalLeaves: 57 },
      },
    });
    await expect(
      parseKnowledgeBaseArchive(archive, {
        companyName: "NewCo",
        validationProfile: "website-lead-v1",
      }),
    ).rejects.toThrow(/150 files/);
  });

  it("accepts a bounded new package and excludes source/status material from the narrative budget", async () => {
    const archive = await buildWebsiteLeadBudgetFixture({
      sourceCharactersPerLeaf: 1_000,
    });

    await expect(
      parseKnowledgeBaseArchive(archive, {
        companyName: "BoundedCo",
        validationProfile: "website-lead-v1",
      }),
    ).resolves.toMatchObject({
      completeness: {
        counts: { totalLeaves: 40 },
      },
    });
  });

  it.each([36, 48])(
    "accepts a package containing %s real, deduplicated first-party images",
    async (imageCount) => {
      const archive = await buildWebsiteLeadBudgetFixture({ imageCount });
      const manifest = await parseKnowledgeBaseArchive(archive, {
        companyName: "ImageCo",
        validationProfile: "website-lead-v1",
      });

      expect(manifest.assets).toHaveLength(imageCount);
      expect(manifest.assets[0]).toMatchObject({
        sectionId: "products-services",
        mimeType: "image/png",
        ownership: "first_party",
      });
      expect(
        manifest.sections.find((section) => section.id === "products-services"),
      ).toMatchObject({
        overviewDocumentId: "doc-leaf-003",
        overviewAssetIds: expect.arrayContaining(["asset-001"]),
        assetIds: expect.arrayContaining(["asset-001"]),
      });
    },
  );

  it.each([
    ["jpeg", "jpg", "image/jpeg"],
    ["webp", "webp", "image/webp"],
    ["avif", "avif", "image/avif"],
    ["gif", "gif", "image/gif"],
  ] as const)(
    "accepts a fully decodable %s asset and verifies its real dimensions",
    async (format, extension, mimeType) => {
      const pipeline = sharp({
        create: {
          width: 2,
          height: 3,
          channels: 3,
          background: "#7148b5",
        },
      });
      const bytes =
        format === "jpeg"
          ? await pipeline.jpeg().toBuffer()
          : format === "webp"
            ? await pipeline.webp().toBuffer()
            : format === "avif"
              ? await pipeline.avif().toBuffer()
              : await pipeline.gif().toBuffer();
      const archive = await buildWebsiteLeadBudgetFixture({
        rasterOverride: {
          bytes,
          extension,
          mimeType,
          width: 2,
          height: 3,
        },
      });

      const manifest = await parseKnowledgeBaseArchive(archive, {
        companyName: "RasterFormatCo",
        validationProfile: "website-lead-v1",
      });

      expect(manifest.assets[0]).toMatchObject({
        mimeType,
        width: 2,
        height: 3,
      });
    },
  );

  it("returns a formal overview plus switchable leaves for every display branch", async () => {
    const archive = await buildWebsiteLeadBudgetFixture();
    const manifest = await parseKnowledgeBaseArchive(archive, {
      companyName: "StructuredCo",
      validationProfile: "website-lead-v1",
    });

    expect(manifest.sections).toHaveLength(7);
    expect(
      manifest.sections.every(
        (section) =>
          Boolean(section.overviewMarkdown) &&
          Boolean(section.overviewDocumentId) &&
          Array.isArray(section.overviewAssetIds) &&
          Array.isArray(section.leaves) &&
          Array.isArray(section.assetIds),
      ),
    ).toBe(true);
    expect(manifest.sections[0].overviewMarkdown).not.toContain("页面摘录");
    expect(manifest.sections[0].overviewMarkdown).not.toContain("最后更新");
    expect(manifest.sections[0].overviewMarkdown).not.toContain("原始来源");
    expect(manifest.sections[0].leaves?.[0]?.markdown).not.toContain(
      "https://example.com/",
    );
    expect(manifest.packageManifestSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("accepts a sparse v2 company as limited_evidence when linked evidence and the image ledger are honest", async () => {
    const archive = await buildWebsiteLeadBudgetFixture({
      schemaVersion: 2,
      imageCount: 1,
      narrativeCharactersPerLeaf: 80,
      v2EvidenceCharactersPerBranch: 120,
      v2OverviewNarrativeCharacters: 140,
      v2ContentStatus: "limited_evidence",
    });

    const manifest = await parseKnowledgeBaseArchive(archive, {
      companyName: "WhiteLabelCo",
      validationProfile: "website-lead-v1",
    });

    expect(manifest.sections).toHaveLength(7);
    expect(
      manifest.sections.every(
        (section) => section.contentAvailability === "limited_evidence",
      ),
    ).toBe(true);
    expect(manifest.assets).toHaveLength(1);
    expect(manifest.completeness?.counts.totalLeaves).toBe(40);
  });

  it("enforces v2 source-page scan coverage and role-specific image quality", async () => {
    const fixture = () =>
      buildWebsiteLeadBudgetFixture({
        schemaVersion: 2,
        imageCount: 2,
        v2EvidenceCharactersPerBranch: 120,
        v2OverviewNarrativeCharacters: 140,
      });
    const root = "Bounded_knowledge_base";
    const manifestPath = `${root}/00_package_manifest.json`;

    const scanZip = await JSZip.loadAsync(await fixture());
    const scanManifest = JSON.parse(
      await scanZip.file(manifestPath)!.async("string"),
    );
    scanManifest.imageSelection.scannedSourcePages -= 1;
    scanZip.file(manifestPath, JSON.stringify(scanManifest));
    await expect(
      parseKnowledgeBaseArchive(
        Buffer.from(await scanZip.generateAsync({ type: "uint8array" })),
        {
          companyName: "ScanCoverageCo",
          validationProfile: "website-lead-v1",
        },
      ),
    ).rejects.toThrow(
      /scan must cover every successfully parsed official page/i,
    );

    const heroZip = await JSZip.loadAsync(await fixture());
    const heroManifest = JSON.parse(
      await heroZip.file(manifestPath)!.async("string"),
    );
    heroManifest.assets[0].displayRole = "hero";
    heroZip.file(manifestPath, JSON.stringify(heroManifest));
    await expect(
      parseKnowledgeBaseArchive(
        Buffer.from(await heroZip.generateAsync({ type: "uint8array" })),
        {
          companyName: "SmallHeroCo",
          validationProfile: "website-lead-v1",
        },
      ),
    ).rejects.toThrow(/hero image quality minimum/i);
  });

  it("does not count a brand badge as core product-family visual coverage", async () => {
    const zip = await JSZip.loadAsync(
      await buildWebsiteLeadBudgetFixture({
        schemaVersion: 2,
        imageCount: 2,
        v2EvidenceCharactersPerBranch: 120,
        v2OverviewNarrativeCharacters: 140,
      }),
    );
    const manifestPath = "Bounded_knowledge_base/00_package_manifest.json";
    const manifest = JSON.parse(await zip.file(manifestPath)!.async("string"));
    manifest.assets[0].displayRole = "badge";
    manifest.imageSelection.productFamilies[0].assetIds = ["asset-001"];
    zip.file(manifestPath, JSON.stringify(manifest));

    await expect(
      parseKnowledgeBaseArchive(
        Buffer.from(await zip.generateAsync({ type: "uint8array" })),
        {
          companyName: "BadgeOnlyProductCo",
          validationProfile: "website-lead-v1",
        },
      ),
    ).rejects.toThrow(/official visual but no valid packaged product asset/i);
  });

  it("rejects thin v2 overviews when the linked evidence documents are rich", async () => {
    const archive = await buildWebsiteLeadBudgetFixture({
      schemaVersion: 2,
      imageCount: 1,
      narrativeCharactersPerLeaf: 200,
      v2EvidenceCharactersPerBranch: 10_000,
      v2OverviewNarrativeCharacters: 200,
      v2ContentStatus: "complete",
    });

    await expect(
      parseKnowledgeBaseArchive(archive, {
        companyName: "RichEvidenceCo",
        validationProfile: "website-lead-v1",
      }),
    ).rejects.toThrow(
      /overview is thinner than its evidence-adaptive minimum/i,
    );
  });

  it("rejects duplicate normalized evidence content in both validators", async () => {
    const zip = await JSZip.loadAsync(
      await buildWebsiteLeadBudgetFixture({ schemaVersion: 2, imageCount: 1 }),
    );
    const companyEvidence = await zip
      .file(
        "Bounded_knowledge_base/10_reference_assets/evidence/company-identity.md",
      )!
      .async("string");
    zip.file(
      "Bounded_knowledge_base/10_reference_assets/evidence/team.md",
      companyEvidence,
    );
    const archive = Buffer.from(
      await zip.generateAsync({ type: "uint8array" }),
    );

    await expect(
      parseKnowledgeBaseArchive(archive, {
        companyName: "DuplicateEvidenceCo",
        validationProfile: "website-lead-v1",
      }),
    ).rejects.toThrow(/duplicate the same normalized content/i);

    const temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), "website-kb-duplicate-evidence-"),
    );
    const archivePath = path.join(temporaryDirectory, "knowledge-base.zip");
    try {
      await writeFile(archivePath, archive);
      const validatorPath = path.resolve(
        process.cwd(),
        "server/skills/website-one-shot-kb-builder/scripts/validate_archive.py",
      );
      await expect(
        execFileAsync("python3", [validatorPath, archivePath]),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining("duplicate normalized content"),
      });
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("rejects cross-branch evidence links in both validators", async () => {
    const zip = await JSZip.loadAsync(
      await buildWebsiteLeadBudgetFixture({ schemaVersion: 2, imageCount: 1 }),
    );
    const manifestEntry = zip.file(
      "Bounded_knowledge_base/00_package_manifest.json",
    )!;
    const packageManifest = JSON.parse(await manifestEntry.async("string")) as {
      documents: Array<{ id: string; branchId?: string }>;
    };
    packageManifest.documents.find(
      (document) => document.id === "doc-evidence-team",
    )!.branchId = "01_company_overview";
    zip.file(
      "Bounded_knowledge_base/00_package_manifest.json",
      JSON.stringify(packageManifest),
    );
    const archive = Buffer.from(
      await zip.generateAsync({ type: "uint8array" }),
    );

    await expect(
      parseKnowledgeBaseArchive(archive, {
        companyName: "CrossBranchEvidenceCo",
        validationProfile: "website-lead-v1",
      }),
    ).rejects.toThrow(/references an invalid evidence document/i);

    const temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), "website-kb-cross-branch-evidence-"),
    );
    const archivePath = path.join(temporaryDirectory, "knowledge-base.zip");
    try {
      await writeFile(archivePath, archive);
      const validatorPath = path.resolve(
        process.cwd(),
        "server/skills/website-one-shot-kb-builder/scripts/validate_archive.py",
      );
      await expect(
        execFileAsync("python3", [validatorPath, archivePath]),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining("invalid evidenceDocumentIds"),
      });
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("rejects evidence links that do not share a source ID in both validators", async () => {
    const zip = await JSZip.loadAsync(
      await buildWebsiteLeadBudgetFixture({ schemaVersion: 2, imageCount: 1 }),
    );
    const manifestPath = "Bounded_knowledge_base/00_package_manifest.json";
    const packageManifest = JSON.parse(
      await zip.file(manifestPath)!.async("string"),
    ) as {
      documents: Array<{ id: string; sourceIds?: string[] }>;
    };
    packageManifest.documents.find(
      (document) => document.id === "doc-evidence-team",
    )!.sourceIds = ["source-unrelated"];
    zip.file(manifestPath, JSON.stringify(packageManifest));
    const archive = Buffer.from(
      await zip.generateAsync({ type: "uint8array" }),
    );

    await expect(
      parseKnowledgeBaseArchive(archive, {
        companyName: "SourceMismatchCo",
        validationProfile: "website-lead-v1",
      }),
    ).rejects.toThrow(/invalid evidence document/i);

    const temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), "website-kb-source-mismatch-"),
    );
    const archivePath = path.join(temporaryDirectory, "knowledge-base.zip");
    try {
      await writeFile(archivePath, archive);
      const validatorPath = path.resolve(
        process.cwd(),
        "server/skills/website-one-shot-kb-builder/scripts/validate_archive.py",
      );
      await expect(
        execFileAsync("python3", [validatorPath, archivePath]),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining("invalid evidenceDocumentIds"),
      });
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("rejects an overview document whose dynamic minimum disagrees with branchEvidence", async () => {
    const zip = await JSZip.loadAsync(
      await buildWebsiteLeadBudgetFixture({ schemaVersion: 2, imageCount: 1 }),
    );
    const manifestPath = "Bounded_knowledge_base/00_package_manifest.json";
    const packageManifest = JSON.parse(
      await zip.file(manifestPath)!.async("string"),
    ) as {
      documents: Array<{
        id: string;
        dynamicMinimumCharacters?: number;
      }>;
    };
    packageManifest.documents.find(
      (document) => document.id === "doc-overview-team",
    )!.dynamicMinimumCharacters = 1;
    zip.file(manifestPath, JSON.stringify(packageManifest));
    const archive = Buffer.from(
      await zip.generateAsync({ type: "uint8array" }),
    );

    await expect(
      parseKnowledgeBaseArchive(archive, {
        companyName: "OverviewMinimumMismatchCo",
        validationProfile: "website-lead-v1",
      }),
    ).rejects.toThrow(/evidence-adaptive overview minimum/i);

    const temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), "website-kb-overview-minimum-"),
    );
    const archivePath = path.join(temporaryDirectory, "knowledge-base.zip");
    try {
      await writeFile(archivePath, archive);
      const validatorPath = path.resolve(
        process.cwd(),
        "server/skills/website-one-shot-kb-builder/scripts/validate_archive.py",
      );
      await expect(
        execFileAsync("python3", [validatorPath, archivePath]),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining(
          "overview document dynamic minimum does not match branch evidence",
        ),
      });
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("makes the deterministic validator accept an honest sparse v2 package", async () => {
    const temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), "website-kb-validator-v2-"),
    );
    const archivePath = path.join(temporaryDirectory, "knowledge-base.zip");
    try {
      await writeFile(
        archivePath,
        await buildWebsiteLeadBudgetFixture({
          schemaVersion: 2,
          imageCount: 1,
          narrativeCharactersPerLeaf: 80,
          v2EvidenceCharactersPerBranch: 120,
          v2OverviewNarrativeCharacters: 140,
        }),
      );
      const validatorPath = path.resolve(
        process.cwd(),
        "server/skills/website-one-shot-kb-builder/scripts/validate_archive.py",
      );
      const { stdout } = await execFileAsync("python3", [
        validatorPath,
        archivePath,
      ]);
      expect(stdout).toContain("VALID");
      expect(stdout).toContain('"images": 1');
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("passes the deterministic validator bundled with the website KB skill", async () => {
    const temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), "website-kb-validator-"),
    );
    const archivePath = path.join(temporaryDirectory, "knowledge-base.zip");
    try {
      await writeFile(archivePath, await buildWebsiteLeadBudgetFixture());
      const validatorPath = path.resolve(
        process.cwd(),
        "server/skills/website-one-shot-kb-builder/scripts/validate_archive.py",
      );
      const { stdout } = await execFileAsync("python3", [
        validatorPath,
        archivePath,
      ]);
      expect(stdout).toContain("VALID");
      expect(stdout).toContain('"customerVisibleCharacters": 8000');
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("makes the deterministic validator reject a prose image claim that the ZIP does not contain", async () => {
    const temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), "website-kb-validator-"),
    );
    const archivePath = path.join(temporaryDirectory, "knowledge-base.zip");
    try {
      await writeFile(
        archivePath,
        await buildWebsiteLeadBudgetFixture({
          imageCount: 0,
          imageTotalOverride: 1,
          crawlReportImageClaim: 1,
        }),
      );
      const validatorPath = path.resolve(
        process.cwd(),
        "server/skills/website-one-shot-kb-builder/scripts/validate_archive.py",
      );
      await expect(
        execFileAsync("python3", [validatorPath, archivePath]),
      ).rejects.toMatchObject({
        stderr: expect.stringMatching(
          /crawl report saved-image count does not match packaged images/i,
        ),
      });
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it.each(["jpeg", "webp", "avif"] as const)(
    "makes the deterministic validator reject a header-only %s asset",
    async (malformedRaster) => {
      const temporaryDirectory = await mkdtemp(
        path.join(os.tmpdir(), "website-kb-validator-"),
      );
      const archivePath = path.join(temporaryDirectory, "knowledge-base.zip");
      try {
        await writeFile(
          archivePath,
          await buildWebsiteLeadBudgetFixture({ malformedRaster }),
        );
        const validatorPath = path.resolve(
          process.cwd(),
          "server/skills/website-one-shot-kb-builder/scripts/validate_archive.py",
        );
        await expect(
          execFileAsync("python3", [validatorPath, archivePath]),
        ).rejects.toMatchObject({
          stderr: expect.stringMatching(/invalid or undecodable image/i),
        });
      } finally {
        await rm(temporaryDirectory, { recursive: true, force: true });
      }
    },
  );

  it.each([
    [
      "a report that claims an image but packages none",
      {
        imageCount: 0,
        imageCompletedOverride: 1,
        imageTotalOverride: 1,
      },
      /images\.completed.*actual packaged image count/i,
    ],
    [
      "crawl-report prose that claims a saved image but packages none",
      {
        imageCount: 0,
        imageTotalOverride: 1,
        crawlReportImageClaim: 1,
      },
      /crawl report saved-image count.*actual packaged image files/i,
    ],
    [
      "a file with an image extension but invalid bytes",
      { invalidImageIndex: 0 },
      /does not contain a valid image\/png image/i,
    ],
    [
      "an incorrect asset hash",
      { imageHashOverride: "0".repeat(64) },
      /SHA-256 does not match/i,
    ],
    [
      "an image without declared pixel dimensions",
      { omitImageDimensions: true },
      /package manifest is invalid.*width/i,
    ],
    [
      "an image without a declared first-party source page",
      { omitImageSourcePage: true },
      /no traceable source page or uploaded document/i,
    ],
    [
      "duplicate image bodies",
      { imageCount: 2, duplicateImageBytes: true },
      /deduplicated by SHA-256/i,
    ],
  ] as const)("rejects %s", async (_label, options, expectedError) => {
    const archive = await buildWebsiteLeadBudgetFixture(options);
    await expect(
      parseKnowledgeBaseArchive(archive, {
        companyName: "InvalidMediaCo",
        validationProfile: "website-lead-v1",
      }),
    ).rejects.toThrow(expectedError);
  });

  it("accepts a source-limited image set without inventing a quota shortfall", async () => {
    const result = await parseKnowledgeBaseArchive(
      await buildWebsiteLeadBudgetFixture({
        omitImageShortfallReason: true,
      }),
      {
        companyName: "SparseMediaCo",
        validationProfile: "website-lead-v1",
      },
    );
    expect(result.assets).toHaveLength(1);
  });

  it.each(["jpeg", "webp", "avif"] as const)(
    "rejects a header-only %s asset that cannot be decoded",
    async (malformedRaster) => {
      const archive = await buildWebsiteLeadBudgetFixture({
        malformedRaster,
      });
      await expect(
        parseKnowledgeBaseArchive(archive, {
          companyName: "UndecodableMediaCo",
          validationProfile: "website-lead-v1",
        }),
      ).rejects.toThrow(/does not contain a valid image/i);
    },
  );

  it("exposes stable validation categories for safe public error handling", async () => {
    const mediaError = await parseKnowledgeBaseArchive(
      await buildWebsiteLeadBudgetFixture({ invalidImageIndex: 0 }),
      {
        companyName: "CategoryCo",
        validationProfile: "website-lead-v1",
      },
    ).catch((error: unknown) => error);
    const contentError = await parseKnowledgeBaseArchive(
      await buildWebsiteLeadBudgetFixture({
        narrativeCharactersPerLeaf: 119,
      }),
      {
        companyName: "CategoryCo",
        validationProfile: "website-lead-v1",
      },
    ).catch((error: unknown) => error);
    const missingManifestZip = await JSZip.loadAsync(
      await buildWebsiteLeadBudgetFixture(),
    );
    missingManifestZip.remove(
      "Bounded_knowledge_base/00_package_manifest.json",
    );
    const structureError = await parseKnowledgeBaseArchive(
      Buffer.from(
        await missingManifestZip.generateAsync({ type: "uint8array" }),
      ),
      {
        companyName: "CategoryCo",
        validationProfile: "website-lead-v1",
      },
    ).catch((error: unknown) => error);
    const unsafeZip = new JSZip();
    unsafeZip.file("../escape.md", "unsafe");
    const unsafeError = await parseKnowledgeBaseArchive(
      Buffer.from(await unsafeZip.generateAsync({ type: "uint8array" })),
      { companyName: "CategoryCo" },
    ).catch((error: unknown) => error);

    expect(mediaError).toMatchObject({ category: "media" });
    expect(contentError).toMatchObject({ category: "content" });
    expect(structureError).toMatchObject({ category: "structure" });
    expect(unsafeError).toMatchObject({ category: "unsafe" });
  });

  it.each([
    [
      "an evidence-bearing leaf without a source binding",
      { omitLeafSourceIds: true },
      /evidence-bearing document.*has no source IDs/i,
    ],
    [
      "a raw page-excerpt statement used as formal copy",
      { rawSnapshotLeafIndex: 0 },
      /raw snapshot or page excerpt/i,
    ],
    [
      "a repeated template paragraph used across formal leaves",
      { repeatedTemplateParagraph: true },
      /formal template paragraph/i,
    ],
  ] as const)("rejects %s", async (_label, options, expectedError) => {
    const archive = await buildWebsiteLeadBudgetFixture(options);
    await expect(
      parseKnowledgeBaseArchive(archive, {
        companyName: "ThinContentCo",
        validationProfile: "website-lead-v1",
      }),
    ).rejects.toThrow(expectedError);
  });

  it.each([
    [
      "其余荣誉图片因本轮没有形成可逐项核验的证书名称与有效期，不在正文中扩写。采购或合规审查仍应向企业索取证书编号，不能仅凭网页图标替代正式查验。",
      "任务或采集过程",
    ],
    [
      "这些内容属于企业自我定义，适合说明组织意图与品牌取向，不宜直接转换为已经量化达成的社会影响。对客户而言，可将其落实为开放模型生态。",
      "客户或采购建议",
    ],
    ["补充说明：这是第 3 个内容节点的本轮整理结果。", "过程性或批量填充表达"],
  ] as const)("detects customer-facing semantic leakage", (text, label) => {
    expect(customerFacingNarrativeViolation(text)).toBe(label);
  });

  it("accepts an honest sparse company with eight leaves and no useful images", async () => {
    const archive = await buildWebsiteLeadBudgetFixture({
      schemaVersion: 2,
      leafCount: 8,
      imageCount: 0,
      eligibleFirstPartyImages: 0,
      narrativeCharactersPerLeaf: 80,
      v2EvidenceCharactersPerBranch: 120,
      v2OverviewNarrativeCharacters: 140,
      officialPagesCompleted: 0,
    });

    await expect(
      parseKnowledgeBaseArchive(archive, {
        companyName: "BrochureOnlyCo",
        validationProfile: "website-lead-v1",
      }),
    ).resolves.toMatchObject({
      completeness: { counts: { totalLeaves: 8 } },
      assets: [],
    });
  });

  it("allows neutral negative facts and internal verification gaps", async () => {
    expect(
      customerFacingNarrativeViolation(
        "2025 年毛利率为 -24.0%，公司当期仍处于亏损状态。",
      ),
    ).toBeUndefined();

    const zip = await JSZip.loadAsync(await buildWebsiteLeadBudgetFixture());
    const completenessPath = "Bounded_knowledge_base/00_completeness.json";
    const completeness = JSON.parse(
      await zip.file(completenessPath)!.async("string"),
    ) as { gaps: string[] };
    completeness.gaps = [
      "本轮没有形成可逐项核验的证书名称与有效期，待企业补充。",
    ];
    zip.file(completenessPath, JSON.stringify(completeness));

    await expect(
      parseKnowledgeBaseArchive(
        Buffer.from(await zip.generateAsync({ type: "uint8array" })),
        {
          companyName: "InternalGapCo",
          validationProfile: "website-lead-v1",
        },
      ),
    ).resolves.toMatchObject({
      completeness: {
        gaps: expect.arrayContaining([
          "本轮没有形成可逐项核验的证书名称与有效期，待企业补充。",
        ]),
      },
    });
  });

  it("rejects customer-facing audit language in both website validators", async () => {
    const archive = await buildWebsiteLeadBudgetFixture({
      schemaVersion: 2,
      imageCount: 1,
      customerLeakageLeafIndex: 0,
      v2EvidenceCharactersPerBranch: 120,
      v2OverviewNarrativeCharacters: 140,
    });
    await expect(
      parseKnowledgeBaseArchive(archive, {
        companyName: "LeakyContentCo",
        validationProfile: "website-lead-v1",
      }),
    ).rejects.toThrow(/customer-facing audit language or internal reasoning/i);

    const temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), "website-kb-customer-leakage-"),
    );
    const archivePath = path.join(temporaryDirectory, "knowledge-base.zip");
    try {
      await writeFile(archivePath, archive);
      const validatorPath = path.resolve(
        process.cwd(),
        "server/skills/website-one-shot-kb-builder/scripts/validate_archive.py",
      );
      await expect(
        execFileAsync("python3", [validatorPath, archivePath]),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining(
          "customer-facing audit language or internal reasoning",
        ),
      });
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it.each([
    ["content leaves", { leafCount: 57 }, /56 content leaves/],
    ["files", { extraFileCount: 104 }, /150 files/],
    ["images", { imageCount: 49 }, /48 downloaded images/],
    ["documents", { documentCount: 23 }, /22 packaged documents/],
    ["narrative", { narrativeCharactersPerLeaf: 451 }, /18000 characters/],
    [
      "official pages",
      { officialPagesCompleted: 121 },
      /120 successfully parsed official pages/,
    ],
    ["public queries", { webQueriesCompleted: 13 }, /12 public-web queries/],
  ] as const)(
    "rejects a new website package that exceeds the %s budget",
    async (_name, options, expectedError) => {
      const archive = await buildWebsiteLeadBudgetFixture(options);

      await expect(
        parseKnowledgeBaseArchive(archive, {
          companyName: "OverBudgetCo",
          validationProfile: "website-lead-v1",
        }),
      ).rejects.toThrow(expectedError);
    },
  );

  it("never exposes local, private, credentialed, or non-public source URLs to the client", async () => {
    const zip = await JSZip.loadAsync(await buildFixtureZip());
    zip.file(
      "Acme_knowledge_base/00_source_index.md",
      [
        "# 来源索引",
        "",
        "- 公开来源：https://example.com/acme/products",
        "- IPv4：http://127.0.0.1/admin",
        "- IPv6：https://[::1]/admin",
        "- 本地主机：https://localhost/admin",
        "- 内部域：https://metadata.google.internal/",
        "- mDNS：https://printer.local/",
        "- 保留后缀：https://service.example/private",
        "- 凭据：https://user:password@public.example.com/private",
      ].join("\n"),
    );
    const archive = Buffer.from(
      await zip.generateAsync({ type: "uint8array" }),
    );
    const manifest = await parseKnowledgeBaseArchive(archive, {
      companyName: "Acme",
    });

    expect(manifest.sources.map((source) => source.url)).toContain(
      "https://example.com/acme/products",
    );
    expect(
      manifest.sources.some((source) =>
        /127\.0\.0\.1|\[::1\]|localhost|\.internal|\.local|service\.example|@/.test(
          source.url,
        ),
      ),
    ).toBe(false);
  });

  it("uses neutral unavailable summaries instead of claiming work is complete", async () => {
    const zip = await JSZip.loadAsync(await buildFixtureZip());
    zip.file("Acme_knowledge_base/README.md", "# Acme 企业知识库");
    const companyLeaves = Object.keys(zip.files).filter(
      (filename) =>
        filename.includes("/01_company_overview/") && filename.endsWith(".md"),
    );
    for (const filename of companyLeaves) {
      const content = await zip.file(filename)!.async("text");
      const status = content.match(
        /\b(verified_first_party|verified_authoritative|supported_third_party|inferred|needs_verification|not_applicable)\b/,
      )?.[1];
      zip.file(filename, `# 仅标题节点\n\n> 状态: ${status} | 来源: 企业官网`);
    }
    const archive = Buffer.from(
      await zip.generateAsync({ type: "uint8array" }),
    );
    const manifest = await parseKnowledgeBaseArchive(archive, {
      companyName: "Acme",
    });

    expect(manifest.summary).toBe("摘要暂不可用，请查看知识树与来源索引。");
    expect(
      manifest.sections.find((section) => section.id === "company-identity")
        ?.summary,
    ).toBe("暂无可展示摘要。");
    expect(`${manifest.summary} ${manifest.sections[0].summary}`).not.toMatch(
      /已完成|已按/,
    );
  });

  it("accepts the integrity-bound legacy Base contract without relabeling its branch semantics", async () => {
    const archive = await buildLegacyBaseFixtureZip();
    const manifest = await parseKnowledgeBaseArchive(archive, {
      companyName: "request fallback",
    });

    expect(manifest.companyName).toBe("LegacyCo 有限公司");
    expect(manifest.sections.map((section) => section.id)).toEqual([
      "knowledge-branch-01",
      "knowledge-branch-02",
      "knowledge-branch-03",
      "knowledge-branch-04",
      "knowledge-branch-05",
      "knowledge-branch-06",
      "knowledge-branch-07",
    ]);
    expect(manifest.sections.map((section) => section.title)).toEqual([
      "企业概况",
      "市场定位与行业背景",
      "产品与服务",
      "方法论与技术能力",
      "交付协作与合作入口",
      "内容资产与公开研究",
      "治理、合规与待核验",
    ]);
    for (const section of manifest.sections) {
      expect(section.summary).toContain("该节点内容来自包内列明来源");
      expect(section.summary).not.toMatch(
        /node_id|^path:|evidence_status|source_ids/i,
      );
      expect(section.markdown).not.toMatch(
        /^node_id:|^path:|^evidence_status:|^source_ids:/im,
      );
    }
    expect(manifest.completeness).toMatchObject({
      score: 80,
      counts: {
        totalLeaves: 42,
        applicableLeaves: 35,
        verifiedFirstParty: 20,
        verifiedAuthoritative: 6,
        supportedThirdParty: 2,
        inferred: 0,
        needsVerification: 7,
        notApplicable: 7,
      },
      acquisition: {},
    });
    expect(manifest.sources).toHaveLength(4);
    expect(
      manifest.sources.map(({ title, type }) => ({ title, type })),
    ).toEqual([
      { title: "LegacyCo 官网", type: "第一方官网" },
      { title: "独立记录", type: "独立官方机构" },
      { title: "原始研究", type: "学术预印本" },
      { title: "关联资料", type: "关联实验室公开网站" },
    ]);
    expect(manifest.evidencePaths).toContain("raw/metadata/crawl.json");
    expect(
      manifest.metrics.find((metric) => metric.key === "nodes")?.value,
    ).toBe(42);
    expect(
      manifest.metrics.find((metric) => metric.key === "pages")?.value,
    ).toBe(42);
    expect(
      manifest.metrics.find((metric) => metric.key === "images")?.value,
    ).toBe(1);
  });

  it.each([
    ["an unknown source ID", { missingSource: true }, /unknown source ID/i],
    [
      "a completeness path not present in the package",
      { mismatchedLeafPath: true },
      /declared leaf paths/i,
    ],
    [
      "leaf source IDs detached from its Markdown frontmatter",
      { mismatchedLeafSourceIds: true },
      /source IDs do not match/i,
    ],
    [
      "only six user-view branches",
      { sixBranches: true },
      /exactly seven user-view branches/i,
    ],
    [
      "a missing required evidence report",
      { omitRequiredReport: true },
      /missing required document/i,
    ],
    [
      "a private-network source locator",
      { privateFirstPartyLocator: true },
      /no auditable locator/i,
    ],
  ])(
    "rejects a legacy Base archive with %s",
    async (_label, options, expectedError) => {
      const archive = await buildLegacyBaseFixtureZip(options);
      await expect(
        parseKnowledgeBaseArchive(archive, { companyName: "LegacyCo" }),
      ).rejects.toThrow(expectedError);
    },
  );

  it("rejects a legacy Base archive whose payload no longer matches its SHA-256 manifest", async () => {
    const zip = await JSZip.loadAsync(await buildLegacyBaseFixtureZip());
    zip.file(
      "legacy_company_knowledge_base/README.md",
      "# Tampered\n\n该内容未同步更新校验清单。",
    );
    const archive = Buffer.from(
      await zip.generateAsync({ type: "uint8array" }),
    );

    await expect(
      parseKnowledgeBaseArchive(archive, { companyName: "LegacyCo" }),
    ).rejects.toThrow(/checksum mismatch/i);
  });

  it.each([
    ["one checksum stream", 128],
    ["the accumulated checksum streams", 8_000],
  ])(
    "stops legacy decompression when actual bytes exceed the tightened limit across %s",
    async (_label, maxActualUncompressedBytes) => {
      const archive = await buildLegacyBaseFixtureZip();
      await expect(
        parseKnowledgeBaseArchive(archive, {
          companyName: "LegacyCo",
          maxActualUncompressedBytes,
        }),
      ).rejects.toThrow(/actual uncompressed bytes exceed/i);
    },
  );

  it.each([
    ["missing", null],
    [
      "containing a model-generated score",
      { ...validCompletenessInput, score: 99 },
    ],
    [
      "with inconsistent evidence counts",
      {
        ...validCompletenessInput,
        counts: {
          ...validCompletenessInput.counts,
          needsVerification: 1,
        },
      },
    ],
    [
      "with an acquisition count above its total",
      {
        ...validCompletenessInput,
        acquisition: {
          ...validCompletenessInput.acquisition,
          webQueries: { completed: 43, total: 42 },
        },
      },
    ],
  ])(
    "rejects the archive when the raw completeness manifest is %s",
    async (_label, completenessInput) => {
      const archive = await buildFixtureZip(completenessInput);
      await expect(
        parseKnowledgeBaseArchive(archive, {
          companyName: "Acme",
        }),
      ).rejects.toThrow(/completeness/i);
    },
  );

  it("rejects a ZIP that contains no knowledge-base contract files", async () => {
    const zip = new JSZip();
    zip.file("junk.txt", "not a knowledge base");
    const archive = Buffer.from(
      await zip.generateAsync({ type: "uint8array" }),
    );

    await expect(
      parseKnowledgeBaseArchive(archive, { companyName: "Junk" }),
    ).rejects.toThrow(/00_completeness/i);
  });

  it("rejects fabricated completeness counts without the packaged leaf files", async () => {
    const zip = await JSZip.loadAsync(await buildFixtureZip());
    const leafPaths = Object.keys(zip.files).filter(
      (filename) =>
        /\/(?:01_company_overview|02_team|03_products|04_technology|06_industries|07_service|08_competitive_advantages)\//.test(
          filename,
        ) && filename.endsWith(".md"),
    );
    leafPaths.slice(7).forEach((filename) => zip.remove(filename));
    const archive = Buffer.from(
      await zip.generateAsync({ type: "uint8array" }),
    );

    await expect(
      parseKnowledgeBaseArchive(archive, { companyName: "Acme" }),
    ).rejects.toThrow(/packaged leaf count/i);
  });

  it("does not mark a whole branch not applicable when only one leaf is", async () => {
    const archive = await buildFixtureZip();
    const zip = await JSZip.loadAsync(archive);
    zip.file(
      "Acme_knowledge_base/01_company_overview/not-applicable.md",
      "# 非适用字段\n\n> 状态: not_applicable | 来源: 企业官网\n\n该字段不适用于当前企业。",
    );
    zip.file(
      "Acme_knowledge_base/00_completeness.json",
      JSON.stringify({
        ...validCompletenessInput,
        counts: {
          ...validCompletenessInput.counts,
          totalLeaves: 47,
          notApplicable: 3,
        },
      }),
    );
    const mixedArchive = Buffer.from(
      await zip.generateAsync({ type: "uint8array" }),
    );
    const manifest = await parseKnowledgeBaseArchive(mixedArchive, {
      companyName: "Acme",
    });

    expect(
      manifest.sections.find((section) => section.id === "company-identity")
        ?.status,
    ).not.toBe("not_applicable");
  });

  it("accepts the evidence-status heading documented by the KB skill", async () => {
    const zip = await JSZip.loadAsync(await buildFixtureZip());
    zip.file(
      "Acme_knowledge_base/01_company_overview/profile.md",
      "# 企业概况\n\n**证据状态：** `verified_first_party`\n\nAcme 企业信息来自官网。",
    );
    const archive = Buffer.from(
      await zip.generateAsync({ type: "uint8array" }),
    );

    await expect(
      parseKnowledgeBaseArchive(archive, { companyName: "Acme" }),
    ).resolves.toMatchObject({ companyName: "Acme" });
  });

  it("derives branch status from the declared header, not body keywords", async () => {
    const zip = await JSZip.loadAsync(await buildFixtureZip());
    zip.file(
      "Acme_knowledge_base/01_company_overview/profile.md",
      "# 企业概况\n\n> 状态: verified_first_party | 来源: 企业官网\n\n本文解释为何另一个字段可能使用 not_applicable，但本叶节点已有一方证据。",
    );
    const archive = Buffer.from(
      await zip.generateAsync({ type: "uint8array" }),
    );
    const manifest = await parseKnowledgeBaseArchive(archive, {
      companyName: "Acme",
    });

    expect(
      manifest.sections.find((section) => section.id === "company-identity")
        ?.status,
    ).not.toBe("not_applicable");
  });

  it("rejects path traversal entries using JSZip unsafeOriginalName", async () => {
    const zip = new JSZip();
    zip.file("../escape.md", "unsafe");
    const buffer = Buffer.from(await zip.generateAsync({ type: "uint8array" }));
    await expect(
      parseKnowledgeBaseArchive(buffer, { companyName: "Unsafe" }),
    ).rejects.toThrow(/traversal|Unsafe path/i);
  });

  it("keeps the compression-ratio safety gate for legacy-compatible archives", async () => {
    const zip = new JSZip();
    zip.file("unsafe_knowledge_base/high-ratio.txt", "A".repeat(1_100_000));
    const buffer = Buffer.from(
      await zip.generateAsync({
        type: "uint8array",
        compression: "DEFLATE",
        compressionOptions: { level: 9 },
      }),
    );

    await expect(
      parseKnowledgeBaseArchive(buffer, { companyName: "Unsafe" }),
    ).rejects.toThrow(/unsafe compression ratio/i);
  });
});
