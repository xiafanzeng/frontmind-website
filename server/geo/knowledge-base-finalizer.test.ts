import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import sharp from "sharp";
import {
  inspectAcceptedUploadCoverage,
  parseKnowledgeBaseCandidate,
  KnowledgeBaseCandidateError,
} from "./knowledge-base-candidate";
import {
  KnowledgeBaseCompletenessInputSchema,
  parseKnowledgeBaseArchive,
  WebsiteLeadPackageManifestV3InputSchema,
} from "./archive";
import {
  assessKnowledgeBaseCandidate,
  finalizeKnowledgeBaseCandidate,
  WEBSITE_KB_ARCHIVE_ROOT,
  WEBSITE_KB_FINALIZER_VERSION,
} from "./knowledge-base-finalizer";
import { finalizeKnowledgeBaseCandidate as finalizeKnowledgeBaseCandidateV3 } from "./knowledge-base-finalizer-v3";

const finalArchivePath = (entryPath: string) =>
  `${WEBSITE_KB_ARCHIVE_ROOT}/${entryPath}`;

const factHeadings = [
  [
    "D01 企业基础",
    "示例企业提供企业软件服务。[来源](https://example.com/about)",
  ],
  ["D02 团队", "公开资料暂未提供完整团队名单。[待核验]"],
  [
    "D03 产品服务",
    "企业提供数据平台与 API 产品。[来源](https://example.com/products)",
  ],
  ["D04 技术能力", "平台支持标准 API 接入。[来源](https://example.com/docs)"],
  [
    "D05 客户案例",
    "官网披露服务对象包括研发团队。[企业主张](https://example.com/cases)",
  ],
  ["D06 资质认证", "公开资料暂未提供资质清单。[待核验]"],
  ["D07 财务融资", "公开资料暂未提供当前财务数据。[待核验]"],
  ["D08 竞争信息", "公开资料暂未提供可核验竞品比较。[待核验]"],
  [
    "D09 市场信息",
    "产品面向企业软件市场。[来源](https://example.com/industries)",
  ],
  ["D10 品牌资产", "品牌使用“示例企业”名称。[来源](https://example.com/)"],
  [
    "D11 渠道",
    "开发者可以通过官方文档了解接入方式。[来源](https://example.com/docs)",
  ],
  ["D12 公开意图", "官网公开合作联系入口。[来源](https://example.com/contact)"],
  ["D13 公共情报", "公开资料暂未提供额外权威信息。[待核验]"],
] as const;

const customerSections = [
  [
    "企业与品牌",
    "示例企业面向企业客户提供软件产品。[来源](https://example.com/about)",
  ],
  ["团队与组织", "公开资料暂未提供完整团队名单。[待核验]"],
  [
    "产品与服务",
    [
      "### 平台产品 MindPromise 智诺：构建 AI 可理解的企业语义资产",
      "",
      "数据平台提供 API 接入能力。[来源](https://example.com/products)",
      "",
      "### MindReach 智达：连接获客、营销与客服智能体",
      "",
      "MindReach 提供面向业务场景的智能体能力。[来源](https://example.com/products)",
      "",
      "### MindNexus 智汇：把企业级 AI 工作流接入现有系统",
      "",
      "MindNexus 支持企业工作流与系统集成。[来源](https://example.com/products)",
    ].join("\n"),
  ],
  [
    "技术与交付",
    "官方文档介绍了标准 API 接入方式。[来源](https://example.com/docs)",
  ],
  [
    "客户与行业",
    "官网称产品服务于研发团队。[企业主张](https://example.com/cases)",
  ],
  [
    "服务与合作",
    "企业官网提供公开联系入口。[来源](https://example.com/contact)",
  ],
  ["可信优势", "公开资料暂未提供可独立核验的竞品优势结论。[待核验]"],
] as const;

async function candidateZip(options?: {
  omitRun?: boolean;
  wrapper?: boolean;
  missingDimension?: boolean;
  malformedRun?: boolean;
  invalidRunUtf8?: boolean;
  omitFacts?: boolean;
  omitCustomer?: boolean;
  headingAliases?: boolean;
  imageBytes?: Buffer;
  nonLogoImage?: boolean;
  unsafeFile?: boolean;
  outsideReadme?: boolean;
  multipleRoots?: boolean;
  invalidFactsUtf8?: boolean;
  invalidCustomerUtf8?: boolean;
  duplicateNormalizedPaths?: boolean;
  symbolicLink?: boolean;
  runOverride?: unknown;
}) {
  const zip = new JSZip();
  const prefix = options?.wrapper ? "example/" : "";
  if (!options?.omitFacts) {
    zip.file(
      `${prefix}00_brand_facts.md`,
      options?.invalidFactsUtf8
        ? Buffer.from([0xff, 0xfe, 0xfd])
        : factHeadings
            .filter(
              ([heading]) =>
                !options?.missingDimension || heading !== "D13 公共情报",
            )
            .map(([heading, content], index) => {
              const title =
                options?.headingAliases && index % 2 === 0
                  ? heading.replace(" ", "：")
                  : heading;
              return `## ${title}\n\n${content}`;
            })
            .join("\n\n"),
    );
  }
  if (!options?.omitCustomer) {
    zip.file(
      `${prefix}01_customer_draft.md`,
      options?.invalidCustomerUtf8
        ? Buffer.from([0xff, 0xfe, 0xfd])
        : customerSections
            .map(([heading, content], index) => {
              const title =
                options?.headingAliases && index % 2 === 0
                  ? `${heading}：`
                  : heading;
              return `## ${title}\n\n${content}`;
            })
            .join("\n\n"),
    );
  }
  if (!options?.omitRun) {
    const run =
      options?.runOverride ??
      ({
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
                path: "assets/logo.png",
                type: "brand_identity",
                sourceKind: "official_web",
                sourcePageUrl: "https://example.com/",
                sourceAssetUrl: "https://example.com/assets/logo.png",
                caption: "示例企业 Logo",
              },
            ]
          : [],
      } as const);
    zip.file(
      `${prefix}02_run.json`,
      options?.invalidRunUtf8
        ? Buffer.from([0xff, 0xfe, 0xfd])
        : options?.malformedRun
          ? "{"
          : JSON.stringify(run),
    );
  }
  if (options?.imageBytes) {
    zip.file(`${prefix}assets/logo.png`, options.imageBytes);
  }
  if (options?.nonLogoImage) {
    zip.file(`${prefix}assets/product.png`, Buffer.from("not-an-image"));
  }
  if (options?.unsafeFile) {
    zip.file(`${prefix}run.sh`, "echo unsafe");
  }
  if (options?.duplicateNormalizedPaths) {
    zip.file(`${prefix}notes/A.txt`, "first");
    zip.file(`${prefix}notes/Ａ.txt`, "second");
  }
  if (options?.symbolicLink) {
    zip.file(`${prefix}assets/logo-link.png`, "assets/logo.png", {
      unixPermissions: 0o120777,
    });
  }
  if (options?.outsideReadme) {
    zip.file("README.md", "harmless packaging note");
    zip.file("__MACOSX/._candidate", "metadata");
  }
  if (options?.multipleRoots) {
    zip.file(
      "other/00_brand_facts.md",
      factHeadings
        .map(([heading, content]) => `## ${heading}\n\n${content}`)
        .join("\n\n"),
    );
    zip.file(
      "other/01_customer_draft.md",
      customerSections
        .map(([heading, content]) => `## ${heading}\n\n${content}`)
        .join("\n\n"),
    );
  }
  return zip.generateAsync({ type: "nodebuffer", platform: "UNIX" });
}

async function v2CandidateZip(topicProfile: "minimum" | "maximum") {
  const zip = new JSZip();
  const sectionTitles = customerSections.map(([title]) => title);
  const topicCounts =
    topicProfile === "minimum" ? [1, 1, 2, 2, 1, 1, 1] : [2, 2, 5, 3, 3, 2, 2];
  const floors = [500, 500, 2_500, 1_000, 600, 600, 600];
  const urls = sectionTitles.map(
    (_, index) => `https://example.com/light-section-${index + 1}`,
  );
  zip.file(
    "00_brand_facts.md",
    factHeadings
      .map(
        ([heading], index) =>
          `## ${heading}\n\n${"可核验企业事实".repeat(8)}。[来源](${urls[index % urls.length]})`,
      )
      .join("\n\n"),
  );
  zip.file(
    "01_customer_draft.md",
    sectionTitles
      .map((title, sectionIndex) => {
        const count = topicCounts[sectionIndex]!;
        const perTopic = Math.ceil(floors[sectionIndex]! / count) + 12;
        return [
          `## ${title}`,
          "",
          ...Array.from({ length: count }, (_, topicIndex) => {
            const characters =
              sectionIndex === 2 && topicIndex === 0 ? 1_900 : perTopic;
            return [
              `### ${title}主题${topicIndex + 1}`,
              "",
              `${String.fromCodePoint(
                0x4e00 + sectionIndex * 8 + topicIndex,
              ).repeat(characters)}[来源](${urls[sectionIndex]})`,
            ].join("\n");
          }),
        ].join("\n");
      })
      .join("\n\n"),
  );
  zip.file(
    "02_run.json",
    JSON.stringify({
      schemaVersion: 2,
      company: {
        name: "轻量示例企业",
        officialWebsite: "https://example.com/",
        industryCluster: "C3",
      },
      sources: urls.map((url, index) => ({
        title: `轻量来源 ${index + 1}`,
        kind: "official_web",
        status: "read",
        url,
      })),
      queries: ["轻量示例企业 产品"],
      stopReason: "coverage_complete",
      contentFloorExceptions: [],
      logoAcquisition: {
        status: "unavailable",
        attemptedPageUrls: urls.slice(0, 2),
        reason: "两个第一方页面均未提供可解码的官方 Logo 原始资源。",
      },
      assets: [],
    }),
  );
  return zip.generateAsync({ type: "nodebuffer", platform: "UNIX" });
}

async function mutateV2CandidateZip(
  mutate: (fixture: {
    run: Record<string, any>;
    customerMarkdown: string;
  }) => void,
) {
  const zip = await JSZip.loadAsync(await v2CandidateZip("minimum"));
  const fixture = {
    run: JSON.parse(await zip.file("02_run.json")!.async("string")) as Record<
      string,
      any
    >,
    customerMarkdown: await zip.file("01_customer_draft.md")!.async("string"),
  };
  mutate(fixture);
  zip.file("02_run.json", JSON.stringify(fixture.run));
  zip.file("01_customer_draft.md", fixture.customerMarkdown);
  return zip.generateAsync({ type: "nodebuffer", platform: "UNIX" });
}

async function v2CandidateZipWithImage(imageBytes: Buffer) {
  const zip = await JSZip.loadAsync(await v2CandidateZip("minimum"));
  const run = JSON.parse(
    await zip.file("02_run.json")!.async("string"),
  ) as Record<string, any>;
  run.assets = [
    {
      path: "assets/logo.png",
      type: "brand_identity",
      sourceKind: "official_web",
      sourcePageUrl: "https://example.com/light-section-1",
      sourceAssetUrl: "https://example.com/assets/logo.png",
      caption: "轻量示例企业 Logo",
    },
  ];
  run.logoAcquisition = {
    status: "retained",
    attemptedPageUrls: [
      "https://example.com/light-section-1",
      "https://example.com/light-section-2",
    ],
  };
  zip.file("02_run.json", JSON.stringify(run));
  zip.file("assets/logo.png", imageBytes);
  return zip.generateAsync({ type: "nodebuffer", platform: "UNIX" });
}

const websitePresentationFloorCases = [
  ["企业与品牌", 500, 1],
  ["团队与组织", 500, 1],
  ["产品与服务", 2_500, 2],
  ["技术与交付", 1_000, 2],
  ["客户与行业", 600, 1],
  ["服务与合作", 600, 1],
  ["可信优势", 600, 1],
] as const;

function replaceV2SectionAtVisibleCount(
  markdown: string,
  section: string,
  targetCharacters: number,
  topicCount: number,
  sourceUrl: string,
  includeGap = false,
) {
  const titles = Array.from(
    { length: topicCount },
    (_, index) => `${section}主题${index + 1}`,
  );
  const titleCharacters = titles.reduce(
    (total, title) => total + Array.from(title).length,
    0,
  );
  const narrativeCharacters = targetCharacters - titleCharacters;
  if (narrativeCharacters < 0) throw new Error("invalid test floor");
  const perTopic = Math.floor(narrativeCharacters / topicCount);
  const remainder = narrativeCharacters % topicCount;
  const replacement = `## ${section}\n\n${titles
    .map(
      (title, index) =>
        `### ${title}\n\n${"实".repeat(
          perTopic + (index < remainder ? 1 : 0),
        )}${includeGap && index === 0 ? "[待核验]" : ""}[来源](${sourceUrl})`,
    )
    .join("\n\n")}`;
  return markdown.replace(
    new RegExp(`## ${section}\\n[\\s\\S]*?(?=\\n\\n## |$)`),
    replacement,
  );
}

describe("website knowledge-base candidate v1", () => {
  it.each(
    websitePresentationFloorCases.flatMap(([section, floor, topicCount]) => [
      [section, floor, topicCount, -1, false],
      [section, floor, topicCount, 0, true],
      [section, floor, topicCount, 1, true],
    ]) as Array<[string, number, number, number, boolean]>,
  )(
    "reports the restored %s presentation floor at offset %i without rejecting readable Markdown",
    async (section, floor, topicCount, offset, _accepted) => {
      const bytes = await mutateV2CandidateZip((fixture) => {
        const sectionIndex = websitePresentationFloorCases.findIndex(
          ([title]) => title === section,
        );
        fixture.customerMarkdown = replaceV2SectionAtVisibleCount(
          fixture.customerMarkdown,
          section,
          floor + offset,
          topicCount,
          `https://example.com/light-section-${sectionIndex + 1}`,
        );
      });
      const parsed = await parseKnowledgeBaseCandidate(bytes);
      expect(parsed.run).toMatchObject({ schemaVersion: 2 });
      if (offset < 0) {
        expect(parsed.qualityWarnings).toContain("CONTENT_COVERAGE_INCOMPLETE");
      }
    },
  );

  it("accepts a below-floor exception only with a concrete gap and three registered sources", async () => {
    const bytes = await mutateV2CandidateZip((fixture) => {
      fixture.customerMarkdown = replaceV2SectionAtVisibleCount(
        fixture.customerMarkdown,
        "企业与品牌",
        499,
        1,
        "https://example.com/light-section-1",
        true,
      );
      fixture.run.contentFloorExceptions = [
        {
          section: "企业与品牌",
          reason: "官网、产品页和公开说明均未披露更多可核验的企业沿革事实。",
          attemptedSourceUrls: [
            "https://example.com/light-section-1",
            "https://example.com/light-section-2",
            "https://example.com/light-section-3",
          ],
        },
      ];
    });
    await expect(parseKnowledgeBaseCandidate(bytes)).resolves.toMatchObject({
      run: { schemaVersion: 2 },
    });
  });

  it.each(["😀".repeat(12), "[来源](https://example.com/reason-only)"])(
    "keeps readable prose and reports an incomplete below-floor exception: %s",
    async (reason) => {
      const bytes = await mutateV2CandidateZip((fixture) => {
        fixture.customerMarkdown = replaceV2SectionAtVisibleCount(
          fixture.customerMarkdown,
          "企业与品牌",
          499,
          1,
          "https://example.com/light-section-1",
          true,
        );
        fixture.run.contentFloorExceptions = [
          {
            section: "企业与品牌",
            reason,
            attemptedSourceUrls: [
              "https://example.com/light-section-1",
              "https://example.com/light-section-2",
              "https://example.com/light-section-3",
            ],
          },
        ];
      });
      const parsed = await parseKnowledgeBaseCandidate(bytes);
      expect(parsed.qualityWarnings).toContain("CONTENT_COVERAGE_INCOMPLETE");
    },
  );

  it("does not treat user-upload URLs as sufficient public-source coverage", async () => {
    const attemptedSourceUrls = [
      "https://uploads.example.test/one",
      "https://uploads.example.test/two",
      "https://uploads.example.test/three",
    ];
    const bytes = await mutateV2CandidateZip((fixture) => {
      fixture.customerMarkdown = replaceV2SectionAtVisibleCount(
        fixture.customerMarkdown,
        "企业与品牌",
        499,
        1,
        "https://example.com/light-section-1",
        true,
      );
      fixture.run.sources.push(
        ...attemptedSourceUrls.map((url, index) => ({
          title: `上传材料 ${index + 1}`,
          kind: "user_upload",
          status: "read",
          url,
          attachmentName: `upload-${index + 1}.pdf`,
        })),
      );
      fixture.run.contentFloorExceptions = [
        {
          section: "企业与品牌",
          reason: "官网和公开权威页面均未披露更多可验证的企业事实。",
          attemptedSourceUrls,
        },
      ];
    });
    const parsed = await parseKnowledgeBaseCandidate(bytes);
    expect(parsed.qualityWarnings).toContain("CONTENT_COVERAGE_INCOMPLETE");
  });

  it("keeps a mutated quality-only floor exception partial in the finalizer", async () => {
    const bytes = await mutateV2CandidateZip((fixture) => {
      fixture.customerMarkdown = replaceV2SectionAtVisibleCount(
        fixture.customerMarkdown,
        "企业与品牌",
        499,
        1,
        "https://example.com/light-section-1",
        true,
      );
      fixture.run.contentFloorExceptions = [
        {
          section: "企业与品牌",
          reason: "官网、产品页和公开说明均未披露更多可核验的企业沿革事实。",
          attemptedSourceUrls: [
            "https://example.com/light-section-1",
            "https://example.com/light-section-2",
            "https://example.com/light-section-3",
          ],
        },
      ];
    });
    const parsed = await parseKnowledgeBaseCandidate(bytes);
    if (parsed.run?.schemaVersion !== 2) throw new Error("expected v2 run");
    parsed.run.contentFloorExceptions[0]!.reason = "资料不足";
    const finalized = await finalizeKnowledgeBaseCandidate({
      candidate: parsed,
      companyName: "轻量示例企业",
      evaluatedAt: "2026-08-10T00:00:00.000Z",
    });
    expect(finalized.assessment.state).toBe("partial");
    expect(finalized.assessment.warningCodes).toContain(
      "CONTENT_COVERAGE_INCOMPLETE",
    );
  });

  it("parses required Markdown through a single wrapper and reconstructs sources", async () => {
    const parsed = await parseKnowledgeBaseCandidate(
      await candidateZip({ omitRun: true, wrapper: true }),
    );
    expect(parsed.factSections.size).toBe(13);
    expect(parsed.customerSections.size).toBe(7);
    expect(parsed.sources.length).toBeGreaterThanOrEqual(6);
    expect(parsed.run).toBeUndefined();
    expect(parsed.qualityWarnings).toContain("RUN_METADATA_INCOMPLETE");
  });

  it("recovers a missing fact dimension without rejecting the candidate", async () => {
    const parsed = await parseKnowledgeBaseCandidate(
      await candidateZip({ missingDimension: true }),
    );
    expect(parsed.factSections.get("D13")).toContain(
      "官网称产品服务于研发团队",
    );
    expect(parsed.diagnostics).toContain("Recovered fact heading D13 公共情报");
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
    expect(parsed.qualityWarnings).toContain("RUN_METADATA_INCOMPLETE");
  });

  it("ignores non-UTF-8 optional run metadata when core Markdown is readable", async () => {
    const parsed = await parseKnowledgeBaseCandidate(
      await candidateZip({ invalidRunUtf8: true }),
    );
    expect(parsed.run).toBeUndefined();
    expect(parsed.diagnostics).toContain(
      "02_run.json could not be parsed and was ignored",
    );
    expect(parsed.qualityWarnings).toContain("RUN_METADATA_INCOMPLETE");
    expect(parsed.customerMarkdown).toContain("产品与服务");
  });

  it("keeps valid upload evidence when company metadata is invalid", async () => {
    const parsed = await parseKnowledgeBaseCandidate(
      await candidateZip({
        runOverride: {
          schemaVersion: 1,
          company: { name: "", officialWebsite: "http://127.0.0.1/private" },
          sources: [
            {
              title: "已读取上传资料",
              kind: "user_upload",
              status: "read",
              attachmentName: "catalog.pdf",
            },
          ],
          queries: [],
          assets: [],
        },
      }),
    );

    expect(parsed.run).toMatchObject({
      company: { name: "待核验企业", officialWebsite: null },
      sources: [
        {
          kind: "user_upload",
          status: "read",
          attachmentName: "catalog.pdf",
        },
      ],
    });
    expect(parsed.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "user_upload",
          status: "read",
          attachmentName: "catalog.pdf",
        }),
      ]),
    );
    expect(parsed.qualityWarnings).toEqual(
      expect.arrayContaining([
        "RUN_METADATA_INCOMPLETE",
        "SOURCE_METADATA_DROPPED",
      ]),
    );
    inspectAcceptedUploadCoverage(parsed, ["catalog.pdf"]);
    expect(parsed.qualityWarnings).not.toContain("UPLOAD_COVERAGE_INCOMPLETE");
  });

  it("marks missing accepted-upload coverage partial without fabricating read evidence", async () => {
    const parsed = await parseKnowledgeBaseCandidate(
      await candidateZip({ omitRun: true }),
    );
    inspectAcceptedUploadCoverage(parsed, ["catalog.pdf"]);

    expect(parsed.qualityWarnings).toContain("UPLOAD_COVERAGE_INCOMPLETE");
    expect(parsed.sources).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "user_upload" }),
      ]),
    );
    expect(assessKnowledgeBaseCandidate(parsed)).toMatchObject({
      state: "partial",
      requiresSupplement: true,
      warningCodes: expect.arrayContaining(["UPLOAD_COVERAGE_INCOMPLETE"]),
    });
  });

  it("drops private candidate asset source URLs without dropping the optional asset", async () => {
    const parsed = await parseKnowledgeBaseCandidate(
      await candidateZip({
        imageBytes: Buffer.from("synthetic-logo"),
        runOverride: {
          schemaVersion: 1,
          company: { name: "示例企业" },
          sources: [],
          queries: [],
          assets: [
            {
              path: "assets/logo.png",
              type: "brand_identity",
              sourceKind: "official_web",
              sourcePageUrl: "http://127.0.0.1/private",
              sourceAssetUrl: "http://169.254.169.254/logo.png",
              caption: "示例企业 Logo",
            },
          ],
        },
      }),
    );

    expect(parsed.assets).toHaveLength(1);
    expect(parsed.assets[0]).not.toHaveProperty("sourcePageUrl");
    expect(parsed.assets[0]).not.toHaveProperty("sourceAssetUrl");
    expect(parsed.qualityWarnings).toEqual(
      expect.arrayContaining([
        "SOURCE_METADATA_DROPPED",
        "OPTIONAL_ASSET_SKIPPED",
      ]),
    );
    const finalized = await finalizeKnowledgeBaseCandidate({
      candidate: parsed,
      companyName: "示例企业",
      evaluatedAt: "2026-08-10T00:00:00.000Z",
    });
    const finalizedZip = await JSZip.loadAsync(finalized.bytes);
    const completeness = JSON.parse(
      await finalizedZip
        .file(finalArchivePath("00_completeness.json"))!
        .async("string"),
    ) as { gaps: string[] };
    expect(completeness.gaps).toContain("候选质量提示：OPTIONAL_ASSET_SKIPPED");
  });

  it("recovers the fixed 7 sections when only the fact draft exists", async () => {
    const parsed = await parseKnowledgeBaseCandidate(
      await candidateZip({ omitCustomer: true }),
    );
    expect(parsed.factSections.size).toBe(13);
    expect(parsed.customerSections.size).toBe(7);
    expect(parsed.customerSections.get("产品与服务")).toContain(
      "数据平台与 API 产品",
    );
    expect(parsed.diagnostics).toContain(
      "Recovered missing 01_customer_draft.md",
    );
  });

  it("recovers all fact dimensions when only the customer draft exists", async () => {
    const parsed = await parseKnowledgeBaseCandidate(
      await candidateZip({ omitFacts: true }),
    );
    expect(parsed.factSections.size).toBe(13);
    expect(parsed.customerSections.size).toBe(7);
    expect(parsed.factSections.get("D03")).toContain("数据平台提供 API");
    expect(parsed.diagnostics).toContain("Recovered missing 00_brand_facts.md");
  });

  it("normalizes heading punctuation and ignores non-logo images", async () => {
    const parsed = await parseKnowledgeBaseCandidate(
      await candidateZip({ headingAliases: true, nonLogoImage: true }),
    );
    expect(parsed.factSections.size).toBe(13);
    expect(parsed.customerSections.size).toBe(7);
    expect(parsed.assets).toHaveLength(0);
    expect(parsed.diagnostics).toContain(
      "Ignored non-logo image: assets/product.png",
    );
  });

  it("finds the candidate root even when harmless wrapper files are present", async () => {
    const parsed = await parseKnowledgeBaseCandidate(
      await candidateZip({ wrapper: true, outsideReadme: true }),
    );
    expect(parsed.factSections.size).toBe(13);
    expect(parsed.diagnostics).toContain("Selected candidate root: example");
    expect(parsed.diagnostics).toContain(
      "Ignored 1 file(s) outside candidate root",
    );
  });

  it("rejects two complete candidate roots as ambiguous", async () => {
    await expect(
      parseKnowledgeBaseCandidate(
        await candidateZip({ wrapper: true, multipleRoots: true }),
      ),
    ).rejects.toMatchObject<Partial<KnowledgeBaseCandidateError>>({
      category: "structure",
      message: expect.stringContaining("multiple complete candidate roots"),
    });
  });

  it("recovers one unreadable Markdown document from the other draft", async () => {
    const parsed = await parseKnowledgeBaseCandidate(
      await candidateZip({ invalidFactsUtf8: true }),
    );
    expect(parsed.factSections.get("D03")).toContain("数据平台提供 API");
    expect(parsed.diagnostics).toContain(
      "Recovered unreadable 00_brand_facts.md",
    );
  });

  it("rejects the candidate when both Markdown documents are unreadable", async () => {
    await expect(
      parseKnowledgeBaseCandidate(
        await candidateZip({
          invalidFactsUtf8: true,
          invalidCustomerUtf8: true,
        }),
      ),
    ).rejects.toMatchObject<Partial<KnowledgeBaseCandidateError>>({
      category: "content",
      message: expect.stringContaining("readable Markdown"),
    });
  });

  it("rejects scripts even when the required Markdown files are present", async () => {
    await expect(
      parseKnowledgeBaseCandidate(await candidateZip({ unsafeFile: true })),
    ).rejects.toMatchObject<Partial<KnowledgeBaseCandidateError>>({
      category: "unsafe",
      message: expect.stringContaining("unsafe executable file"),
    });
  });

  it("rejects paths that collide after NFKC and case normalization", async () => {
    await expect(
      parseKnowledgeBaseCandidate(
        await candidateZip({ duplicateNormalizedPaths: true }),
      ),
    ).rejects.toMatchObject<Partial<KnowledgeBaseCandidateError>>({
      category: "unsafe",
      message: expect.stringContaining("duplicate normalized paths"),
    });
  });

  it("rejects symbolic links during the full archive scan", async () => {
    await expect(
      parseKnowledgeBaseCandidate(await candidateZip({ symbolicLink: true })),
    ).rejects.toMatchObject<Partial<KnowledgeBaseCandidateError>>({
      category: "unsafe",
      message: expect.stringContaining("symbolic link"),
    });
  });

  it.each([
    [
      "an out-of-range H3 allocation",
      (fixture: { run: Record<string, any>; customerMarkdown: string }) => {
        fixture.customerMarkdown = fixture.customerMarkdown.replace(
          "### 产品与服务主题2",
          "#### 产品与服务主题2",
        );
      },
      /must contain 2–5 unique H3 topics/i,
    ],
    [
      "seventeen distinct public-page attempts",
      (fixture: { run: Record<string, any> }) => {
        fixture.run.sources = Array.from({ length: 17 }, (_, index) => ({
          title: `公开页 ${index + 1}`,
          kind: "official_web",
          status: "read",
          url: `https://example.com/light-section-${index + 1}`,
        }));
      },
      /exceeds 16 distinct public-page attempts/i,
    ],
    [
      "five public queries",
      (fixture: { run: Record<string, any> }) => {
        fixture.run.queries = Array.from(
          { length: 5 },
          (_, index) => `公开查询 ${index + 1}`,
        );
      },
      /candidate contract: queries/i,
    ],
    [
      "thirty-one source records",
      (fixture: { run: Record<string, any> }) => {
        fixture.run.sources = Array.from({ length: 31 }, (_, index) => ({
          title: `来源 ${index + 1}`,
          kind: "official_web",
          status: "read",
          url: `https://example.com/source-${index + 1}`,
        }));
      },
      /candidate contract: sources/i,
    ],
    [
      "more than 40,000 visible customer characters",
      (fixture: { customerMarkdown: string }) => {
        fixture.customerMarkdown += `\n\n${"超".repeat(40_001)}`;
      },
      /exceeds 40000 visible characters/i,
    ],
    [
      "an accepted upload recorded as failed",
      (fixture: { run: Record<string, any> }) => {
        fixture.run.sources.push({
          title: "用户上传资料",
          kind: "user_upload",
          status: "failed",
          attachmentName: "catalog.pdf",
        });
      },
      /must mark every user upload as read/i,
    ],
  ] as const)("reports schema-v2 %s as partial", async (label, mutate) => {
    const parsed = await parseKnowledgeBaseCandidate(
      await mutateV2CandidateZip(mutate),
    );
    expect(parsed.qualityWarnings).toContain(
      label.includes("H3")
        ? "H3_COVERAGE_INCOMPLETE"
        : label.includes("upload")
          ? "UPLOAD_COVERAGE_INCOMPLETE"
          : label.includes("characters")
            ? "CONTENT_COVERAGE_INCOMPLETE"
            : "RESEARCH_BUDGET_DRIFT",
    );
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
          expect(
            parsed.error.issues.map((issue) => issue.path.join(".")),
          ).toEqual(expect.arrayContaining(golden.expectedPaths));
        }
      }
      if (golden.kind === "invalid_manifest") {
        const parsed = WebsiteLeadPackageManifestV3InputSchema.safeParse(
          golden.invalidValue,
        );
        expect(parsed.success).toBe(false);
        if (!parsed.success) {
          expect(
            parsed.error.issues.map((issue) => issue.path.join(".")),
          ).toEqual(expect.arrayContaining(golden.expectedPaths));
        }
      }
    }
  });

  it("reports exact contract paths for the legacy completeness key drift", () => {
    const parsed = KnowledgeBaseCompletenessInputSchema.safeParse({
      documentStatusCounts: {},
      documentTypeCounts: {},
      mediaStatusCounts: {},
      verification_gaps: [],
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("expected invalid completeness");
    expect(parsed.error.issues.map((issue) => issue.path.join("."))).toEqual(
      expect.arrayContaining(["counts", "acquisition", "gaps", "evaluatedAt"]),
    );
  });

  it("classifies rich, medium, and sparse candidates while retaining partial metadata warnings", async () => {
    const parsed = await parseKnowledgeBaseCandidate(await candidateZip());
    parsed.metrics = {
      citedSourceCount: 8,
      factCharacters: 5_500,
      customerCharacters: 9_500,
      coveredFactDimensions: 8,
    };
    expect(assessKnowledgeBaseCandidate(parsed)).toMatchObject({
      tier: "rich",
      target: "按证据自适应",
      state: "partial",
      requiresSupplement: true,
      warningCodes: expect.arrayContaining(["RUN_METADATA_INCOMPLETE"]),
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
      target: "按证据自适应",
      state: "partial",
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
      state: "partial",
      requiresSupplement: true,
    });
  });

  it("generates a validated deterministic schema-v4 archive without images", async () => {
    const parsed = await parseKnowledgeBaseCandidate(
      await v2CandidateZip("minimum"),
    );
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

    expect(WEBSITE_KB_FINALIZER_VERSION).toBe("website-kb-finalizer-v5");
    expect(first.sha256).toBe(second.sha256);
    expect(first.packageManifestSha256).toBe(
      first.manifest.packageManifestSha256,
    );
    expect(first.manifest.archiveContractVersion).toBe(4);
    expect(first.metrics.leafCount).toBeGreaterThanOrEqual(10);
    expect(first.metrics.leafCount).toBeLessThanOrEqual(20);
    expect(first.metrics.packagedImages).toBe(0);

    const zip = await JSZip.loadAsync(first.bytes);
    const physicalFiles = Object.values(zip.files).filter(
      (entry) => !entry.dir,
    );
    expect(
      Array.from(
        new Set(physicalFiles.map((entry) => entry.name.split("/")[0])),
      ),
    ).toEqual([WEBSITE_KB_ARCHIVE_ROOT]);
    expect(
      physicalFiles.every((entry) =>
        entry.name.startsWith(`${WEBSITE_KB_ARCHIVE_ROOT}/`),
      ),
    ).toBe(true);
    expect(zip.file("00_package_manifest.json")).toBeNull();
    const completeness = JSON.parse(
      await zip.file(finalArchivePath("00_completeness.json"))!.async("string"),
    );
    expect(Object.keys(completeness).sort()).toEqual([
      "acquisition",
      "counts",
      "evaluatedAt",
      "gaps",
    ]);
    const manifest = JSON.parse(
      await zip
        .file(finalArchivePath("00_package_manifest.json"))!
        .async("string"),
    );
    expect(manifest).toMatchObject({
      schemaVersion: 4,
      candidateContractVersion: 2,
      profile: "website-lead-v1",
    });
    expect(
      manifest.documents.every(
        (document: { path: string }) =>
          !document.path.startsWith(`${WEBSITE_KB_ARCHIVE_ROOT}/`),
      ),
    ).toBe(true);
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
    const companyOverview = await zip
      .file(finalArchivePath("01_company_overview/overview.md"))!
      .async("string");
    const overviewDocuments = manifest.documents.filter(
      (document: any) => document.kind === "overview",
    );
    expect(
      overviewDocuments.every(
        (document: any) =>
          !document.title.includes("综述") &&
          document.dynamicMinimumCharacters === 0,
      ),
    ).toBe(true);
    expect(manifest.branchEvidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dynamicOverviewMinimum: 0 }),
      ]),
    );
    const companyLeaf = await zip
      .file(
        finalArchivePath(
          leaves.find(
            (document: any) => document.branchId === "01_company_overview",
          ).path,
        ),
      )!
      .async("string");
    expect(companyOverview).not.toContain("示例企业面向企业客户提供软件产品");
    expect(companyOverview).not.toContain("企业与品牌综述");
    expect(companyOverview).not.toContain(
      "企业与品牌分支的事实、来源与待核验边界已按条目分别整理。",
    );
    expect(companyOverview).not.toContain("详细事实与来源已按条目分别整理");
    const teamOverview = await zip
      .file(finalArchivePath("02_team/overview.md"))!
      .async("string");
    expect(teamOverview).not.toContain("团队与组织综述");
    expect(teamOverview).not.toContain(
      "团队与组织分支的事实、来源与待核验边界已按条目分别整理。",
    );
    expect(companyOverview).not.toBe(companyLeaf);
    expect(
      leaves.find((document: any) => document.branchId === "02_team"),
    ).toMatchObject({ evidenceStatus: "verified_first_party" });
    expect(
      leaves.find((document: any) => document.branchId === "05_manufacturing"),
    ).toMatchObject({ evidenceStatus: "not_applicable" });
    expect(completeness.counts.inferred).toBe(0);
    expect(completeness.counts.totalLeaves).toBe(leaves.length);
    const roundTrip = await parseKnowledgeBaseArchive(first.bytes, {
      companyName: "示例企业",
      validationProfile: "website-lead-v1",
      generatedAt: "2026-07-30T01:00:00.000Z",
    });
    expect(roundTrip.sections.map((section) => section.title)).toEqual([
      "企业与品牌",
      "团队与组织",
      "产品与服务",
      "技术与交付",
      "客户与行业",
      "服务与合作",
      "可信优势",
    ]);
    expect(
      roundTrip.sections.every((section) => section.leaves.length > 0),
    ).toBe(true);
    expect(
      roundTrip.sections
        .find((section) => section.title === "产品与服务")
        ?.leaves.some((leaf) => leaf.title.includes("产品与服务主题")),
    ).toBe(true);
    const productOverview = await zip
      .file(finalArchivePath("03_products/overview.md"))!
      .async("string");
    const productLeafDocument = leaves.find(
      (document: any) =>
        document.branchId === "03_products" &&
        document.title.includes("产品与服务主题1"),
    );
    expect(productLeafDocument).toBeTruthy();
    if (!productLeafDocument) {
      throw new Error("Expected a platform product leaf document");
    }
    const productLeaf = await zip
      .file(finalArchivePath(productLeafDocument.path))!
      .async("string");
    expect(productLeaf).toContain("产品与服务主题1");
    expect(productOverview).not.toContain("产品与服务主题1");
  });

  it("publishes readable schema-v1 Markdown as a v5 partial without rewriting an old artifact", async () => {
    const legacyCandidate = await parseKnowledgeBaseCandidate(
      await candidateZip(),
    );

    const finalized = await finalizeKnowledgeBaseCandidate({
      candidate: legacyCandidate,
      companyName: "历史企业",
      evaluatedAt: "2026-08-10T01:00:00.000Z",
    });
    expect(finalized.assessment).toMatchObject({
      state: "partial",
      requiresSupplement: true,
      warningCodes: expect.arrayContaining(["RUN_METADATA_INCOMPLETE"]),
    });
  });

  it("publishes readable source-free prose as needs-verification leaves without evidence claims", async () => {
    const parsed = await parseKnowledgeBaseCandidate(
      await candidateZip({ omitRun: true }),
    );
    parsed.sources = [];
    for (const [key, value] of parsed.factSections) {
      parsed.factSections.set(
        key,
        value.replace(/\[(?:来源|企业主张|权威来源|第三方来源)]\([^)]*\)/g, ""),
      );
    }
    for (const [key, value] of parsed.customerSections) {
      parsed.customerSections.set(
        key,
        value.replace(/\[(?:来源|企业主张|权威来源|第三方来源)]\([^)]*\)/g, ""),
      );
    }
    const finalized = await finalizeKnowledgeBaseCandidate({
      candidate: parsed,
      companyName: "待核验企业",
      evaluatedAt: "2026-08-10T01:00:00.000Z",
    });
    const zip = await JSZip.loadAsync(finalized.bytes);
    const manifest = JSON.parse(
      await zip
        .file(finalArchivePath("00_package_manifest.json"))!
        .async("string"),
    ) as { documents: Array<Record<string, any>> };
    const leaves = manifest.documents.filter(
      (document) => document.kind === "leaf",
    );
    expect(leaves.length).toBeGreaterThan(0);
    expect(
      leaves.every(
        (leaf) =>
          ["needs_verification", "not_applicable"].includes(
            leaf.evidenceStatus,
          ) &&
          !leaf.sourceIds?.length &&
          !leaf.evidenceDocumentIds?.length,
      ),
    ).toBe(true);
    await expect(
      parseKnowledgeBaseArchive(finalized.bytes, {
        companyName: "待核验企业",
        validationProfile: "website-lead-v1",
      }),
    ).resolves.toBeTruthy();
    await expect(
      parseKnowledgeBaseArchive(finalized.bytes, {
        companyName: "待核验企业",
      }),
    ).rejects.toThrow(/evidence-backed/);
  });

  it.each([
    ["minimum", 9, 10],
    ["maximum", 19, 20],
  ] as const)(
    "turns each schema-v2 H3 into one leaf and adds only the manufacturing leaf for the %s profile",
    async (profile, authoredTopics, expectedLeaves) => {
      const parsed = await parseKnowledgeBaseCandidate(
        await v2CandidateZip(profile),
      );
      expect(parsed.run?.schemaVersion).toBe(2);
      const finalized = await finalizeKnowledgeBaseCandidate({
        candidate: parsed,
        companyName: "轻量示例企业",
        evaluatedAt: "2026-08-10T01:00:00.000Z",
      });
      expect(finalized.metrics.leafCount).toBe(expectedLeaves);
      const zip = await JSZip.loadAsync(finalized.bytes);
      const packageManifest = JSON.parse(
        await zip
          .file(finalArchivePath("00_package_manifest.json"))!
          .async("string"),
      ) as {
        schemaVersion: number;
        candidateContractVersion: number;
        allPaths: string[];
        evidencePaths: string[];
        documents: Array<{
          kind: string;
          title: string;
          path: string;
          branchId?: string;
          sourceIds?: string[];
          evidenceDocumentIds?: string[];
        }>;
      };
      const leaves = packageManifest.documents.filter(
        (document) => document.kind === "leaf",
      );
      expect(packageManifest).toMatchObject({
        schemaVersion: 4,
        candidateContractVersion: 2,
      });
      expect(leaves).toHaveLength(expectedLeaves);
      expect(
        leaves.filter((leaf) => leaf.branchId === "05_manufacturing"),
      ).toHaveLength(1);
      expect(leaves.length - 1).toBe(authoredTopics);
      expect(
        packageManifest.documents.filter(
          (document) => document.kind === "overview",
        ),
      ).toHaveLength(7);
      expect(packageManifest.allPaths).toContain("00_package_manifest.json");
      expect(
        packageManifest.evidencePaths.every((entryPath) =>
          packageManifest.documents.some(
            (document) =>
              document.kind === "evidence" && document.path === entryPath,
          ),
        ),
      ).toBe(true);

      const longProductLeaf = leaves.find(
        (leaf) =>
          leaf.branchId === "03_products" && leaf.title === "产品与服务主题1",
      );
      expect(longProductLeaf).toBeTruthy();
      const longMarkdown = await zip
        .file(finalArchivePath(longProductLeaf!.path))!
        .async("string");
      expect(longMarkdown.length).toBeGreaterThan(1_800);
      expect(longProductLeaf!.sourceIds).toHaveLength(1);
      expect(longProductLeaf!.evidenceDocumentIds).toHaveLength(1);
    },
  );

  it("keeps an oversized legacy schema-v1 candidate on the frozen v3 finalizer with every product evidence binding", async () => {
    const parsed = await parseKnowledgeBaseCandidate(await candidateZip());
    const productUrls = Array.from(
      { length: 25 },
      (_, index) => `https://example.com/legacy-product-${index + 1}`,
    );
    parsed.customerSections.set(
      "产品与服务",
      productUrls
        .map(
          (url, index) =>
            `### 历史产品${String(index + 1).padStart(2, "0")}\n\n产品事实${index + 1}。${String.fromCodePoint(
              0x6000 + index,
            ).repeat(40)}[来源](${url})`,
        )
        .join("\n\n"),
    );
    parsed.factSections.set(
      "D03",
      productUrls
        .map((url, index) => `历史产品事实${index + 1}。[来源](${url})`)
        .join("\n\n"),
    );
    // Reparse so source records include every newly authored URL.
    const expandedZip = new JSZip();
    expandedZip.file(
      "00_brand_facts.md",
      [
        ...factHeadings
          .filter(([heading]) => !heading.startsWith("D03 "))
          .map(([heading, content]) => `## ${heading}\n\n${content}`),
        `## D03 产品服务\n\n${parsed.factSections.get("D03")}`,
      ].join("\n\n"),
    );
    expandedZip.file(
      "01_customer_draft.md",
      customerSections
        .map(
          ([heading, content]) =>
            `## ${heading}\n\n${
              heading === "产品与服务"
                ? parsed.customerSections.get(heading)
                : content
            }`,
        )
        .join("\n\n"),
    );
    expandedZip.file(
      "02_run.json",
      JSON.stringify({
        schemaVersion: 1,
        company: { name: "历史企业", industryCluster: "C3" },
        sources: productUrls.map((url, index) => ({
          title: `历史产品来源${index + 1}`,
          kind: "official_web",
          status: "read",
          url,
        })),
        queries: [],
        assets: [],
      }),
    );
    const expanded = await parseKnowledgeBaseCandidate(
      await expandedZip.generateAsync({ type: "nodebuffer" }),
    );
    const finalized = await finalizeKnowledgeBaseCandidateV3({
      candidate: expanded,
      companyName: "历史企业",
      evaluatedAt: "2026-08-10T01:00:00.000Z",
    });
    expect(finalized.metrics.leafCount).toBeLessThanOrEqual(56);
    const zip = await JSZip.loadAsync(finalized.bytes);
    const packageManifest = JSON.parse(
      await zip.file("00_package_manifest.json")!.async("string"),
    ) as {
      documents: Array<{
        kind: string;
        title: string;
        branchId?: string;
        sourceIds?: string[];
        evidenceDocumentIds?: string[];
      }>;
    };
    const productLeaves = packageManifest.documents.filter(
      (document) =>
        document.kind === "leaf" && document.branchId === "03_products",
    );
    expect(productLeaves).toHaveLength(7);
    expect(
      new Set(productLeaves.flatMap((leaf) => leaf.sourceIds || [])).size,
    ).toBeGreaterThanOrEqual(25);
    expect(
      new Set(productLeaves.flatMap((leaf) => leaf.evidenceDocumentIds || []))
        .size,
    ).toBeGreaterThanOrEqual(25);
    expect(
      packageManifest.documents
        .filter((document) => document.kind === "leaf")
        .some(
          (leaf) =>
            leaf.branchId !== "03_products" && leaf.title.includes("历史产品"),
        ),
    ).toBe(false);
  });

  it("preserves supported customer prose without a semantic style filter", async () => {
    const parsed = await parseKnowledgeBaseCandidate(
      await v2CandidateZip("minimum"),
    );
    const semanticProse =
      "第一方页面摘录显示该服务可用，采购方应先核验供应商资质。";
    parsed.customerSections.set(
      "企业与品牌",
      `${parsed.customerSections.get("企业与品牌")}\n\n${semanticProse}[来源](https://example.com/light-section-1)`,
    );

    const finalized = await finalizeKnowledgeBaseCandidate({
      candidate: parsed,
      companyName: "示例企业",
      evaluatedAt: "2026-07-30T01:00:00.000Z",
    });
    const zip = await JSZip.loadAsync(finalized.bytes);
    const packageManifest = JSON.parse(
      await zip
        .file(finalArchivePath("00_package_manifest.json"))!
        .async("string"),
    ) as { documents: Array<{ path: string; customerVisible: boolean }> };
    const customerText = (
      await Promise.all(
        packageManifest.documents
          .filter((document) => document.customerVisible)
          .map((document) =>
            zip.file(finalArchivePath(document.path))!.async("string"),
          ),
      )
    ).join("\n");

    expect(customerText).toContain(semanticProse);
  });

  it("uses the shared formal count for business source headings and tables", async () => {
    const parsed = await parseKnowledgeBaseCandidate(
      await v2CandidateZip("minimum"),
    );
    const businessCopy = [
      "### 收入来源",
      "",
      "| 类型 | 平台价值 |",
      "| --- | --- |",
      `| 收入来源 | ${"乙".repeat(593)} |`,
      "| 社区活力来源 | 不同来源模型 [来源](https://example.com/light-section-1) |",
    ].join("\n");
    parsed.customerSections.set("企业与品牌", businessCopy);

    const finalized = await finalizeKnowledgeBaseCandidate({
      candidate: parsed,
      companyName: "示例企业",
      evaluatedAt: "2026-07-30T01:00:00.000Z",
    });
    const zip = await JSZip.loadAsync(finalized.bytes);
    const packageManifest = JSON.parse(
      await zip
        .file(finalArchivePath("00_package_manifest.json"))!
        .async("string"),
    ) as {
      counts: { customerVisibleCharacters: number };
      documents: Array<{ path: string; customerVisible: boolean }>;
    };
    const customerMarkdown = (
      await Promise.all(
        packageManifest.documents
          .filter((document) => document.customerVisible)
          .map((document) =>
            zip.file(finalArchivePath(document.path))!.async("string"),
          ),
      )
    ).join("\n");

    expect(customerMarkdown).toContain("社区活力来源");
    expect(packageManifest.counts.customerVisibleCharacters).toBe(
      finalized.metrics.customerCharacters,
    );
  });

  it("normalizes and packages one traceable first-party logo", async () => {
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
      await v2CandidateZipWithImage(imageBytes),
    );
    const finalized = await finalizeKnowledgeBaseCandidate({
      candidate: parsed,
      companyName: "示例企业",
      evaluatedAt: "2026-07-30T01:00:00.000Z",
    });
    expect(finalized.metrics.packagedImages).toBe(1);
    expect(finalized.manifest.assets).toHaveLength(1);
    expect(finalized.manifest.assets[0]).toMatchObject({
      sectionId: "company-identity",
      sourcePageUrl: "https://example.com/light-section-1",
    });
    const zip = await JSZip.loadAsync(finalized.bytes);
    const manifest = JSON.parse(
      await zip
        .file(finalArchivePath("00_package_manifest.json"))!
        .async("string"),
    );
    expect(manifest.assets[0]).toMatchObject({
      mimeType: "image/png",
      ownership: "first_party",
      assetType: "brand_identity",
      displayRole: "badge",
    });
    expect(zip.file(finalArchivePath(manifest.assets[0].path))).not.toBeNull();
  });
});
