import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import sharp from "sharp";
import {
  parseKnowledgeBaseCandidate,
  KnowledgeBaseCandidateError,
} from "./knowledge-base-candidate";
import {
  KnowledgeBaseCompletenessInputSchema,
  WebsiteLeadPackageManifestV3InputSchema,
} from "./archive";
import {
  assessKnowledgeBaseCandidate,
  finalizeKnowledgeBaseCandidate,
  WEBSITE_KB_FINALIZER_VERSION,
} from "./knowledge-base-finalizer";

const execFileAsync = promisify(execFile);

const factHeadings = [
  ["D01 企业基础", "示例企业提供企业软件服务。[来源](https://example.com/about)"],
  ["D02 团队", "公开资料暂未提供完整团队名单。[待核验]"],
  ["D03 产品服务", "企业提供数据平台与 API 产品。[来源](https://example.com/products)"],
  ["D04 技术能力", "平台支持标准 API 接入。[来源](https://example.com/docs)"],
  ["D05 客户案例", "官网披露服务对象包括研发团队。[企业主张](https://example.com/cases)"],
  ["D06 资质认证", "公开资料暂未提供资质清单。[待核验]"],
  ["D07 财务融资", "公开资料暂未提供当前财务数据。[待核验]"],
  ["D08 竞争信息", "公开资料暂未提供可核验竞品比较。[待核验]"],
  ["D09 市场信息", "产品面向企业软件市场。[来源](https://example.com/industries)"],
  ["D10 品牌资产", "品牌使用“示例企业”名称。[来源](https://example.com/)"],
  ["D11 渠道", "开发者可以通过官方文档了解接入方式。[来源](https://example.com/docs)"],
  ["D12 公开意图", "官网公开合作联系入口。[来源](https://example.com/contact)"],
  ["D13 公共情报", "公开资料暂未提供额外权威信息。[待核验]"],
] as const;

const customerSections = [
  ["企业与品牌", "示例企业面向企业客户提供软件产品。[来源](https://example.com/about)"],
  ["团队与组织", "公开资料暂未提供完整团队名单。[待核验]"],
  ["产品与服务", "数据平台提供 API 接入能力。[来源](https://example.com/products)"],
  ["技术与交付", "官方文档介绍了标准 API 接入方式。[来源](https://example.com/docs)"],
  ["客户与行业", "官网称产品服务于研发团队。[企业主张](https://example.com/cases)"],
  ["服务与合作", "企业官网提供公开联系入口。[来源](https://example.com/contact)"],
  ["可信优势", "公开资料暂未提供可独立核验的竞品优势结论。[待核验]"],
] as const;

async function candidateZip(options?: {
  omitRun?: boolean;
  wrapper?: boolean;
  missingDimension?: boolean;
  malformedRun?: boolean;
  imageBytes?: Buffer;
  unsafeFile?: boolean;
}) {
  const zip = new JSZip();
  const prefix = options?.wrapper ? "example/" : "";
  zip.file(
    `${prefix}00_brand_facts.md`,
    factHeadings
      .filter(
        ([heading]) =>
          !options?.missingDimension || heading !== "D13 公共情报",
      )
      .map(([heading, content]) => `## ${heading}\n\n${content}`)
      .join("\n\n"),
  );
  zip.file(
    `${prefix}01_customer_draft.md`,
    customerSections
      .map(([heading, content]) => `## ${heading}\n\n${content}`)
      .join("\n\n"),
  );
  if (!options?.omitRun) {
    zip.file(
      `${prefix}02_run.json`,
      options?.malformedRun
        ? "{"
        : JSON.stringify({
            schemaVersion: 1,
            company: {
              name: "示例企业",
              officialWebsite: "https://example.com/",
              industryCluster: "C3",
            },
            sources: [
              {
                title: "示例企业官网",
                kind: "official_web",
                status: "read",
                url: "https://example.com/",
              },
            ],
            queries: ["示例企业"],
            assets: options?.imageBytes
              ? [
                  {
                    path: "assets/product.png",
                    type: "product_ui",
                    sourceKind: "official_web",
                    sourcePageUrl: "https://example.com/products",
                    sourceAssetUrl:
                      "https://example.com/assets/product.png",
                    caption: "示例企业产品界面",
                  },
                ]
              : [],
          }),
    );
  }
  if (options?.imageBytes) {
    zip.file(`${prefix}assets/product.png`, options.imageBytes);
  }
  if (options?.unsafeFile) {
    zip.file(`${prefix}run.sh`, "echo unsafe");
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

describe("website knowledge-base candidate v1", () => {
  it("parses required Markdown through a single wrapper and reconstructs sources", async () => {
    const parsed = await parseKnowledgeBaseCandidate(
      await candidateZip({ omitRun: true, wrapper: true }),
    );
    expect(parsed.factSections.size).toBe(13);
    expect(parsed.customerSections.size).toBe(7);
    expect(parsed.sources.length).toBeGreaterThanOrEqual(6);
    expect(parsed.run).toBeUndefined();
  });

  it("reports a precise missing dimension", async () => {
    await expect(
      parseKnowledgeBaseCandidate(
        await candidateZip({ missingDimension: true }),
      ),
    ).rejects.toMatchObject<Partial<KnowledgeBaseCandidateError>>({
      category: "content",
      message: expect.stringContaining("D13 公共情报"),
    });
  });

  it("ignores malformed optional run metadata when both Markdown files are valid", async () => {
    const parsed = await parseKnowledgeBaseCandidate(
      await candidateZip({ malformedRun: true }),
    );
    expect(parsed.run).toBeUndefined();
    expect(parsed.diagnostics).toContain(
      "02_run.json could not be parsed and was ignored",
    );
    expect(parsed.sources.length).toBeGreaterThan(0);
  });

  it("rejects scripts even when the required Markdown files are present", async () => {
    await expect(
      parseKnowledgeBaseCandidate(await candidateZip({ unsafeFile: true })),
    ).rejects.toMatchObject<Partial<KnowledgeBaseCandidateError>>({
      category: "unsafe",
      message: expect.stringContaining("unsupported file"),
    });
  });
});

describe("website knowledge-base finalizer", () => {
  it("keeps the eleven sanitized golden regression cases executable", async () => {
    const fixture = JSON.parse(
      await readFile(
        path.resolve(
          process.cwd(),
          "server/geo/contracts/website-kb-v2-golden.fixture.json",
        ),
        "utf8",
      ),
    ) as {
      schemaVersion: number;
      cases: Array<{
        id: string;
        kind: string;
        metrics?: {
          citedSourceCount: number;
          factCharacters: number;
          customerCharacters: number;
          coveredFactDimensions: number;
        };
        expectedTier?: string;
        invalidValue?: unknown;
        expectedPaths?: string[];
      }>;
    };
    expect(fixture.schemaVersion).toBe(1);
    expect(fixture.cases).toHaveLength(11);
    expect(new Set(fixture.cases.map((item) => item.id)).size).toBe(11);
    expect(JSON.stringify(fixture)).not.toContain("/Downloads/");

    const parsedCandidate = await parseKnowledgeBaseCandidate(
      await candidateZip(),
    );
    for (const golden of fixture.cases) {
      if (golden.kind === "candidate" && golden.metrics) {
        parsedCandidate.metrics = golden.metrics;
        expect(assessKnowledgeBaseCandidate(parsedCandidate).tier).toBe(
          golden.expectedTier,
        );
      }
      if (golden.kind === "invalid_completeness") {
        const parsed = KnowledgeBaseCompletenessInputSchema.safeParse(
          golden.invalidValue,
        );
        expect(parsed.success).toBe(false);
        if (!parsed.success) {
          expect(parsed.error.issues.map((issue) => issue.path.join("."))).toEqual(
            expect.arrayContaining(golden.expectedPaths),
          );
        }
      }
      if (golden.kind === "invalid_manifest") {
        const parsed = WebsiteLeadPackageManifestV3InputSchema.safeParse(
          golden.invalidValue,
        );
        expect(parsed.success).toBe(false);
        if (!parsed.success) {
          expect(parsed.error.issues.map((issue) => issue.path.join("."))).toEqual(
            expect.arrayContaining(golden.expectedPaths),
          );
        }
      }
    }
  });

  it("reports exact contract paths for the legacy completeness key drift", () => {
    const parsed = KnowledgeBaseCompletenessInputSchema.safeParse({
      statusCounts: {},
      gapStrings: [],
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("expected invalid completeness");
    expect(
      parsed.error.issues.map((issue) => issue.path.join(".")),
    ).toEqual(
      expect.arrayContaining([
        "counts",
        "acquisition",
        "gaps",
        "evaluatedAt",
      ]),
    );
  });

  it("classifies rich, medium, and sparse candidates without forcing sparse filler", async () => {
    const parsed = await parseKnowledgeBaseCandidate(await candidateZip());
    parsed.metrics = {
      citedSourceCount: 8,
      factCharacters: 5_500,
      customerCharacters: 9_500,
      coveredFactDimensions: 8,
    };
    expect(assessKnowledgeBaseCandidate(parsed)).toMatchObject({
      tier: "rich",
      target: "12000–18000",
      requiresSupplement: true,
      missingDimensions: expect.arrayContaining(["D02 团队"]),
      allowedSources: expect.arrayContaining(["https://example.com/"]),
    });

    parsed.metrics = {
      citedSourceCount: 4,
      factCharacters: 3_000,
      customerCharacters: 2_000,
      coveredFactDimensions: 5,
    };
    expect(assessKnowledgeBaseCandidate(parsed)).toMatchObject({
      tier: "medium",
      target: "6000–12000",
      requiresSupplement: true,
    });

    parsed.metrics = {
      citedSourceCount: 1,
      factCharacters: 600,
      customerCharacters: 250,
      coveredFactDimensions: 2,
    };
    expect(assessKnowledgeBaseCandidate(parsed)).toMatchObject({
      tier: "sparse",
      target: "按证据自适应",
      requiresSupplement: false,
    });
  });

  it("generates a validated deterministic schema-v3 archive without images", async () => {
    const parsed = await parseKnowledgeBaseCandidate(await candidateZip());
    const first = await finalizeKnowledgeBaseCandidate({
      candidate: parsed,
      companyName: "示例企业",
      evaluatedAt: "2026-07-30T01:00:00.000Z",
    });
    const second = await finalizeKnowledgeBaseCandidate({
      candidate: parsed,
      companyName: "示例企业",
      evaluatedAt: "2026-07-30T01:00:00.000Z",
    });

    expect(WEBSITE_KB_FINALIZER_VERSION).toBe(
      "website-kb-finalizer-v1",
    );
    expect(first.sha256).toBe(second.sha256);
    expect(first.packageManifestSha256).toBe(
      first.manifest.packageManifestSha256,
    );
    expect(first.manifest.archiveContractVersion).toBe(3);
    expect(first.metrics.leafCount).toBeGreaterThanOrEqual(8);
    expect(first.metrics.packagedImages).toBe(0);

    const zip = await JSZip.loadAsync(first.bytes);
    const completeness = JSON.parse(
      await zip.file("00_completeness.json")!.async("string"),
    );
    expect(Object.keys(completeness).sort()).toEqual([
      "acquisition",
      "counts",
      "evaluatedAt",
      "gaps",
    ]);
    const manifest = JSON.parse(
      await zip.file("00_package_manifest.json")!.async("string"),
    );
    expect(manifest).toMatchObject({
      schemaVersion: 3,
      profile: "website-lead-v1",
    });
    expect(manifest.branchEvidence).toHaveLength(7);
    const evidenceDocuments = manifest.documents.filter(
      (document: any) => document.kind === "evidence",
    );
    expect(evidenceDocuments.length).toBeGreaterThan(0);
    expect(
      evidenceDocuments.every((document: any) =>
        /^evidence\/S\d{3}\.md$/.test(document.path),
      ),
    ).toBe(true);
    const leaves = manifest.documents.filter(
      (document: any) => document.kind === "leaf",
    );
    expect(
      leaves.find((document: any) => document.branchId === "02_team"),
    ).toMatchObject({ evidenceStatus: "needs_verification" });
    expect(
      leaves.find(
        (document: any) => document.branchId === "05_manufacturing",
      ),
    ).toMatchObject({ evidenceStatus: "not_applicable" });
    expect(completeness.counts.inferred).toBe(0);
    expect(completeness.counts.totalLeaves).toBe(leaves.length);

    const temporaryDirectory = await mkdtemp(
      path.join(os.tmpdir(), "website-kb-finalizer-"),
    );
    try {
      const archivePath = path.join(temporaryDirectory, "knowledge-base.zip");
      await writeFile(archivePath, first.bytes);
      const validatorPath = path.resolve(
        process.cwd(),
        "server/skills/website-one-shot-kb-builder/scripts/validate_archive.py",
      );
      await expect(
        execFileAsync("python3", [validatorPath, archivePath]),
      ).resolves.toMatchObject({
        stdout: expect.stringContaining("VALID"),
      });
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("normalizes and packages a traceable first-party image", async () => {
    const pixels = Buffer.alloc(900 * 500 * 3);
    for (let index = 0; index < pixels.length; index += 1) {
      pixels[index] = (index * 31 + Math.floor(index / 97)) % 256;
    }
    const imageBytes = await sharp(pixels, {
      raw: { width: 900, height: 500, channels: 3 },
    })
      .png()
      .toBuffer();
    const parsed = await parseKnowledgeBaseCandidate(
      await candidateZip({ imageBytes }),
    );
    const finalized = await finalizeKnowledgeBaseCandidate({
      candidate: parsed,
      companyName: "示例企业",
      evaluatedAt: "2026-07-30T01:00:00.000Z",
    });
    expect(finalized.metrics.packagedImages).toBe(1);
    expect(finalized.manifest.assets).toHaveLength(1);
    expect(finalized.manifest.assets[0]).toMatchObject({
      sectionId: "products-services",
      sourcePageUrl: "https://example.com/products",
    });
    const zip = await JSZip.loadAsync(finalized.bytes);
    const manifest = JSON.parse(
      await zip.file("00_package_manifest.json")!.async("string"),
    );
    expect(manifest.assets[0]).toMatchObject({
      mimeType: "image/png",
      ownership: "first_party",
      assetType: "product_ui",
      displayRole: "inline",
    });
    expect(zip.file(manifest.assets[0].path)).not.toBeNull();
  });
});
