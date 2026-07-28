import { createHash } from "node:crypto";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  extractKnowledgeBaseAssetPreviews,
  parseKnowledgeBaseArchive,
} from "./archive";

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
  "06_industries/research",
  "07_service",
  "08_competitive_advantages",
] as const;

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
  root.file(
    "09_media_assets/product_images/product-a.png",
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
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
