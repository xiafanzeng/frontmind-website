import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  buildGeoCustomQuestionClassifierTaskInput,
  buildGeoCustomQuestionClassifierPrompt,
  buildGeoQuestionPrompt,
  buildGeoQuestionTaskInput,
  buildWebsiteKnowledgeBasePrompt,
  buildWebsiteKnowledgeBaseTaskInput,
  CUSTOM_QUESTION_TASK_INPUT_FILENAME,
  QUESTION_TASK_INPUT_FILENAME,
  WEBSITE_KB_TASK_INPUT_FILENAME,
} from "./prompts";
import { GEO_UPSTREAM_PROMPT_MAX_CODE_POINTS } from "./prompt-delivery";
import {
  buildGeoCustomQuestionClassifierSkillArchive,
  buildGeoQuestionRecommenderSkillArchive,
  buildWebsiteKnowledgeBaseSkillArchive,
  loadGeoCustomQuestionClassifierSkill,
  loadGeoQuestionRecommenderSkill,
  loadWebsiteKnowledgeBaseSkill,
  resolveWebsiteKnowledgeBaseWriterVersion,
  CUSTOM_QUESTION_CLASSIFIER_SKILL_ARCHIVE_FILENAME,
  QUESTION_SKILL_ARCHIVE_FILENAME,
  WEBSITE_KB_LEGACY_SKILL_VERSION,
  WEBSITE_KB_SKILL_ARCHIVE_FILENAME,
  WEBSITE_KB_SKILL_VERSION,
} from "./skills";
import { loadGeoCurrentStateEvaluatorSkill } from "./assessment";
import { parseKnowledgeBaseCandidate } from "./knowledge-base-candidate";

const execFileAsync = promisify(execFile);

const websiteKnowledgeBaseReferenceRoot = path.resolve(
  process.cwd(),
  "server",
  "skills",
  "website-one-shot-kb-builder",
  "references",
);

const websiteV2FixtureFactHeadings = [
  "D01 企业基础",
  "D02 团队",
  "D03 产品服务",
  "D04 技术能力",
  "D05 客户案例",
  "D06 资质认证",
  "D07 财务融资",
  "D08 竞争信息",
  "D09 市场信息",
  "D10 品牌资产",
  "D11 渠道",
  "D12 公开意图",
  "D13 公共情报",
] as const;

const websiteV2FixtureSections = [
  ["企业与品牌", 500, 1],
  ["团队与组织", 500, 1],
  ["产品与服务", 2_500, 2],
  ["技术与交付", 1_000, 2],
  ["客户与行业", 600, 1],
  ["服务与合作", 600, 1],
  ["可信优势", 600, 1],
] as const;

function writeWebsiteV2PythonBudgetFixture(root: string) {
  const urls = websiteV2FixtureSections.map(
    (_, index) => `https://example.com/budget-${index + 1}`,
  );
  fs.writeFileSync(
    path.join(root, "00_brand_facts.md"),
    websiteV2FixtureFactHeadings
      .map(
        (heading, index) =>
          `## ${heading}\n\n${String.fromCodePoint(0x5000 + index).repeat(
            40,
          )}[来源](${urls[index % urls.length]})`,
      )
      .join("\n\n"),
  );
  fs.writeFileSync(
    path.join(root, "01_customer_draft.md"),
    websiteV2FixtureSections
      .map(([heading, floor, topicCount], sectionIndex) => {
        const perTopic = Math.ceil(floor / topicCount) + 8;
        return `## ${heading}\n\n${Array.from(
          { length: topicCount },
          (_, topicIndex) =>
            `### ${heading}主题${topicIndex + 1}\n\n${String.fromCodePoint(
              0x5400 + sectionIndex * 4 + topicIndex,
            ).repeat(perTopic)}[来源](${urls[sectionIndex]})`,
        ).join("\n\n")}`;
      })
      .join("\n\n"),
  );
  fs.writeFileSync(
    path.join(root, "02_run.json"),
    JSON.stringify({
      schemaVersion: 2,
      company: {
        name: "预算门禁示例企业",
        officialWebsite: "https://example.com",
        industryCluster: "C3",
      },
      sources: urls.map((url, index) => ({
        title: `预算来源 ${index + 1}`,
        kind: "official_web",
        status: "read",
        url,
      })),
      queries: ["预算门禁示例企业 产品"],
      stopReason: "coverage_complete",
      contentFloorExceptions: [],
      logoAcquisition: {
        status: "unavailable",
        attemptedPageUrls: urls.slice(0, 2),
        reason: "已检查两个官网页面，均未发现可解码的官方 Logo 原图。",
      },
      assets: [],
    }),
  );
}

describe("website one-shot knowledge-base skill", () => {
  it("defaults to v7 and only rolls the writer back when the gate is explicitly disabled", () => {
    expect(resolveWebsiteKnowledgeBaseWriterVersion({})).toBe(
      WEBSITE_KB_SKILL_VERSION,
    );
    expect(
      resolveWebsiteKnowledgeBaseWriterVersion({ NODE_ENV: "production" }),
    ).toBe(WEBSITE_KB_SKILL_VERSION);
    for (const enabled of ["1", "true", "on", " TRUE "]) {
      expect(
        resolveWebsiteKnowledgeBaseWriterVersion({
          FRONTMIND_WEBSITE_KB_V4_WRITER_ENABLED: enabled,
        }),
      ).toBe(WEBSITE_KB_SKILL_VERSION);
    }
    for (const disabled of ["0", "false", "off", " OFF "]) {
      expect(
        resolveWebsiteKnowledgeBaseWriterVersion({
          FRONTMIND_WEBSITE_KB_V4_WRITER_ENABLED: disabled,
        }),
      ).toBe(WEBSITE_KB_LEGACY_SKILL_VERSION);
    }
    expect(() =>
      resolveWebsiteKnowledgeBaseWriterVersion({
        FRONTMIND_WEBSITE_KB_V4_WRITER_ENABLED: "maybe",
      }),
    ).toThrow("FRONTMIND_WEBSITE_KB_V4_WRITER_ENABLED is invalid");
  });

  it("keeps the origin/main v6 source snapshot immutable and packages it under the public Skill name", async () => {
    const expectedHashes = new Map([
      [
        "SKILL.md",
        "de9450fb5a0a4bd04deb8595eabc539995eff1fdbc32db12aba2d8aa61a8368c",
      ],
      [
        "agents/openai.yaml",
        "7a2006846a731bcb08a9f521bd14db2aa5eb3017c8e7fb985a349a75e59c49d9",
      ],
      [
        "references/dimensions.md",
        "0605dcc0eaa12acb099f2c5ff24ee01ab0dd679adf0b63232bc56e652c51f1ad",
      ],
      [
        "references/candidate-format.md",
        "3c80241f9975738a7d479a20ce0710779dc1489d98eb81628443056fd859c978",
      ],
      [
        "scripts/build_candidate.py",
        "733f40d1fbf098f90a201fc56538940d8953f1df44b51925d10536de715d77ae",
      ],
    ]);
    const sourceRoot = path.resolve(
      process.cwd(),
      "server/skills/website-one-shot-kb-builder/legacy-v6",
    );
    for (const [relativePath, expectedHash] of expectedHashes) {
      expect(
        crypto
          .createHash("sha256")
          .update(fs.readFileSync(path.join(sourceRoot, relativePath)))
          .digest("hex"),
      ).toBe(expectedHash);
    }

    const archive = await buildWebsiteKnowledgeBaseSkillArchive(
      WEBSITE_KB_LEGACY_SKILL_VERSION,
    );
    const zip = await (await import("jszip")).default.loadAsync(archive);
    const manifest = JSON.parse(
      (await zip.file("MANIFEST.json")?.async("string")) || "{}",
    ) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      name: "website-one-shot-kb-builder",
      entrypoint: "SKILL.md",
    });
    expect(await zip.file("SKILL.md")?.async("string")).toContain(
      "website-lead-candidate-v1.zip",
    );
  });

  it("hashes the exact source and packaged skill contents reported by healthz", async () => {
    const relativeFiles = [
      "SKILL.md",
      "agents/openai.yaml",
      "references/dimensions.md",
      "references/candidate-format.md",
      "scripts/build_candidate.py",
    ];
    const sourceRoot = path.resolve(
      process.cwd(),
      "server/skills/website-one-shot-kb-builder",
    );
    const bundle = (root: string) =>
      relativeFiles
        .map(
          (relativePath) =>
            `# FILE: ${relativePath}\n\n${fs
              .readFileSync(path.join(root, relativePath), "utf8")
              .trim()}`,
        )
        .join("\n\n---\n\n");
    const loaded = await loadWebsiteKnowledgeBaseSkill();
    expect(loaded).toBe(bundle(sourceRoot));
    expect(crypto.createHash("sha256").update(loaded).digest("hex")).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });

  it("keeps the Base skill focused on research and candidate output", async () => {
    const skill = await loadWebsiteKnowledgeBaseSkill();
    expect(Buffer.byteLength(skill, "utf8")).toBeGreaterThanOrEqual(9_000);
    expect(Buffer.byteLength(skill, "utf8")).toBeLessThanOrEqual(50_000);
    for (const invariant of [
      "ordinary Agent browsing",
      "D01–D13",
      "00_brand_facts.md",
      "01_customer_draft.md",
      "references/dimensions.md",
      "references/candidate-format.md",
      "assets/logo.<extension>",
      "Do not collect or package favicons",
      "logoAcquisition.status",
      "6300 visible characters",
      "9–19 third-level topics",
      "16 distinct public webpage URLs",
      "contentFloorExceptions",
      "cross-file evidence-reference subset",
      "scripts/build_candidate.py",
      "`website.knowledge-base-candidate` contract",
      "exactly one enterprise knowledge-base generation task",
      "automatic recovery, regeneration, or a second attempt",
    ]) {
      expect(skill).toContain(invariant);
    }
    for (const serviceResponsibility of ["12,000–18,000", "8–56"]) {
      expect(skill).not.toContain(serviceResponsibility);
    }
  });

  it("packages the Website knowledge-base Skill as a deterministic ZIP attachment", async () => {
    const first = await buildWebsiteKnowledgeBaseSkillArchive();
    const second = await buildWebsiteKnowledgeBaseSkillArchive();
    expect(first.equals(second)).toBe(true);
    expect(first.subarray(0, 4).toString("hex")).toBe("504b0304");

    const zip = await (await import("jszip")).default.loadAsync(first);
    const skill = await zip.file("SKILL.md")?.async("string");
    const manifest = JSON.parse(
      (await zip.file("MANIFEST.json")?.async("string")) || "{}",
    ) as Record<string, unknown>;
    expect(skill).toContain("website-one-shot-kb-builder");
    expect(Object.keys(zip.files).sort()).toEqual([
      "MANIFEST.json",
      "SKILL.md",
      "agents/openai.yaml",
      "references/candidate-format.md",
      "references/dimensions.md",
      "scripts/build_candidate.py",
    ]);
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      name: "website-one-shot-kb-builder",
      entrypoint: "SKILL.md",
    });
    expect((manifest.files as unknown[]).length).toBe(5);
    expect(WEBSITE_KB_SKILL_ARCHIVE_FILENAME).toBe(
      "website-one-shot-kb-builder.skill.zip",
    );
  });

  it("builds a one-shot prompt that treats user input as data", async () => {
    const prompt = await buildWebsiteKnowledgeBasePrompt({
      input: "https://acme.example",
      attachments: [
        {
          fileId: "file-1",
          filename: "catalog.pdf",
          uploadToken: "a".repeat(20),
        },
      ],
    });
    const taskInput = JSON.parse(
      buildWebsiteKnowledgeBaseTaskInput({
        input: "https://acme.example",
        attachments: [{ filename: "catalog.pdf" }],
      }).body.toString("utf8"),
    );
    expect(prompt).toContain("不存在后续用户对话");
    expect(prompt).toContain("不要询问、等待确认");
    expect(prompt).toContain(WEBSITE_KB_TASK_INPUT_FILENAME);
    expect(prompt).not.toContain("https://acme.example");
    expect(taskInput.data).toMatchObject({
      rawInput: "https://acme.example",
      uploadedFiles: ["catalog.pdf"],
    });
    expect(prompt).toContain(WEBSITE_KB_SKILL_ARCHIVE_FILENAME);
    expect(prompt).toContain("先解压 ZIP 并完整读取根目录 SKILL.md");
    expect(prompt).toContain("website-lead-candidate-v1");
    expect(prompt).toContain("已完成，候选 ZIP 已附上。");
    expect(prompt).toContain("不得输出 Provider 文件 ID");
    expect(prompt).toContain(
      "不得开启、调用、切换或推荐 Wide Research / Deep Research",
    );
    expect(Array.from(prompt).length).toBeLessThanOrEqual(
      GEO_UPSTREAM_PROMPT_MAX_CODE_POINTS,
    );
    for (const removedFinalContract of [
      "8–56",
      "schemaVersion=3",
      "00_completeness.json",
      "canonical 01–08",
    ]) {
      expect(prompt).not.toContain(removedFinalContract);
    }
    expect(prompt).not.toContain("# FILE: SKILL.md");
    expect(prompt).not.toContain("## website-one-shot-kb-builder");
    expect(prompt).not.toContain("# FILE: references/");
    expect(prompt).not.toContain("def validate_archive");
  });

  it("validates and packages the fixed candidate with the bundled deterministic script", async () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "website-kb-skill-"),
    );
    try {
      const facts = Array.from({ length: 13 }, (_, index) => {
        const evidence =
          index < 7
            ? `可核验事实说明。[来源](${
                index === 0
                  ? "https://example.com:443/section-1#facts"
                  : `https://example.com/section-${index + 1}`
              })`
            : "公开资料暂未提供可核验信息。[待核验]";
        return `## D${String(index + 1).padStart(2, "0")} ${
          [
            "企业基础",
            "团队",
            "产品服务",
            "技术能力",
            "客户案例",
            "资质认证",
            "财务融资",
            "竞争信息",
            "市场信息",
            "品牌资产",
            "渠道",
            "公开意图",
            "公共情报",
          ][index]
        }\n\n${evidence}`;
      }).join("\n\n");
      const contentFloors = new Map([
        ["企业与品牌", 500],
        ["团队与组织", 500],
        ["产品与服务", 2500],
        ["技术与交付", 1000],
        ["客户与行业", 600],
        ["服务与合作", 600],
        ["可信优势", 600],
      ]);
      const topicCounts = [1, 1, 2, 2, 1, 1, 1];
      const customer = Array.from(contentFloors)
        .map(
          ([title, floor], index) =>
            `## ${title}\n\n${Array.from(
              { length: topicCounts[index]! },
              (_, topicIndex) =>
                `### ${title}主题${topicIndex + 1}\n\n${`可核验的企业业务产品技术客户服务事实说明${index + 1}`.repeat(
                  Math.ceil(floor / 20 / topicCounts[index]!) + 1,
                )}。[来源](https://example.com/section-${index + 1})`,
            ).join("\n\n")}`,
        )
        .join("\n\n");
      fs.writeFileSync(path.join(temporaryRoot, "00_brand_facts.md"), facts);
      fs.writeFileSync(
        path.join(temporaryRoot, "01_customer_draft.md"),
        customer,
      );
      const assetsRoot = path.join(temporaryRoot, "assets");
      fs.mkdirSync(assetsRoot);
      fs.writeFileSync(
        path.join(assetsRoot, "logo.svg"),
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/></svg>',
      );
      fs.writeFileSync(
        path.join(temporaryRoot, "02_run.json"),
        JSON.stringify({
          schemaVersion: 2,
          company: {
            name: "示例企业",
            officialWebsite: "https://example.com",
            industryCluster: "C3",
          },
          sources: [
            ...Array.from(contentFloors).map((_, index) => ({
              title: `版块来源 ${index + 1}`,
              kind: "official_web",
              status: "read",
              url: `https://example.com/section-${index + 1}`,
            })),
            {
              title: "企业官网",
              kind: "official_web",
              status: "read",
              url: "https://example.com",
            },
          ],
          queries: ["示例企业 产品"],
          stopReason: "coverage_complete",
          contentFloorExceptions: [],
          logoAcquisition: {
            status: "retained",
            attemptedPageUrls: ["https://example.com"],
          },
          assets: [
            {
              path: "assets/logo.svg",
              type: "brand_identity",
              sourceKind: "official_web",
              sourcePageUrl: "https://example.com",
              sourceAssetUrl: "https://example.com/logo.svg",
              caption: "示例企业 Logo",
            },
          ],
        }),
      );
      const firstRoot = path.join(temporaryRoot, "first");
      const secondRoot = path.join(temporaryRoot, "second");
      fs.mkdirSync(firstRoot);
      fs.mkdirSync(secondRoot);
      const first = path.join(firstRoot, "website-lead-candidate-v1.zip");
      const second = path.join(secondRoot, "website-lead-candidate-v1.zip");
      const script = path.resolve(
        process.cwd(),
        "server/skills/website-one-shot-kb-builder/scripts/build_candidate.py",
      );
      await execFileAsync("python3", [
        script,
        "--input-dir",
        temporaryRoot,
        "--output",
        first,
      ]);
      await execFileAsync("python3", [
        script,
        "--input-dir",
        temporaryRoot,
        "--output",
        second,
      ]);
      expect(fs.readFileSync(first).equals(fs.readFileSync(second))).toBe(true);
      const zip = await (
        await import("jszip")
      ).default.loadAsync(fs.readFileSync(first));
      expect(Object.keys(zip.files).sort()).toEqual([
        "00_brand_facts.md",
        "01_customer_draft.md",
        "02_run.json",
        "assets/logo.svg",
      ]);
      const parsed = await parseKnowledgeBaseCandidate(fs.readFileSync(first));
      expect(parsed.factSections.size).toBe(13);
      expect(parsed.customerSections.size).toBe(7);
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it.each([
    [
      "an out-of-range H3 allocation",
      (root: string) => {
        const customerPath = path.join(root, "01_customer_draft.md");
        fs.writeFileSync(
          customerPath,
          fs
            .readFileSync(customerPath, "utf8")
            .replace("### 产品与服务主题2", "#### 产品与服务主题2"),
        );
      },
      "must contain 2–5 H3 topics",
    ],
    [
      "seventeen public-page attempts",
      (root: string) => {
        const runPath = path.join(root, "02_run.json");
        const run = JSON.parse(fs.readFileSync(runPath, "utf8"));
        run.sources = Array.from({ length: 17 }, (_, index) => ({
          title: `公开页 ${index + 1}`,
          kind: "official_web",
          status: "read",
          url: `https://example.com/budget-${index + 1}`,
        }));
        fs.writeFileSync(runPath, JSON.stringify(run));
      },
      "exceeds 16 distinct public-page attempts",
    ],
    [
      "five public queries",
      (root: string) => {
        const runPath = path.join(root, "02_run.json");
        const run = JSON.parse(fs.readFileSync(runPath, "utf8"));
        run.queries = Array.from(
          { length: 5 },
          (_, index) => `公开查询 ${index + 1}`,
        );
        fs.writeFileSync(runPath, JSON.stringify(run));
      },
      "queries must contain at most 4 text items",
    ],
    [
      "thirty-one source records",
      (root: string) => {
        const runPath = path.join(root, "02_run.json");
        const run = JSON.parse(fs.readFileSync(runPath, "utf8"));
        run.sources = Array.from({ length: 31 }, (_, index) => ({
          title: `来源 ${index + 1}`,
          kind: "official_web",
          status: "read",
          url: `https://example.com/source-${index + 1}`,
        }));
        fs.writeFileSync(runPath, JSON.stringify(run));
      },
      "sources must be an array of at most 30",
    ],
    [
      "more than 40,000 visible customer characters",
      (root: string) => {
        const customerPath = path.join(root, "01_customer_draft.md");
        fs.appendFileSync(customerPath, `\n\n${"超".repeat(40_001)}`);
      },
      "exceeds 40000 visible characters",
    ],
    [
      "an accepted upload recorded as failed",
      (root: string) => {
        const runPath = path.join(root, "02_run.json");
        const run = JSON.parse(fs.readFileSync(runPath, "utf8"));
        run.sources.push({
          title: "用户上传资料",
          kind: "user_upload",
          status: "failed",
          attachmentName: "catalog.pdf",
        });
        fs.writeFileSync(runPath, JSON.stringify(run));
      },
      "user_upload must have status read",
    ],
    [
      "a floor exception with a short reason",
      (root: string) => {
        const customerPath = path.join(root, "01_customer_draft.md");
        fs.writeFileSync(
          customerPath,
          fs
            .readFileSync(customerPath, "utf8")
            .replace(
              /^## 企业与品牌[\s\S]*?(?=^## 团队与组织)/m,
              "## 企业与品牌\n\n### 企业与品牌主题1\n\n资料暂缺。[待核验]\n\n",
            ),
        );
        const runPath = path.join(root, "02_run.json");
        const run = JSON.parse(fs.readFileSync(runPath, "utf8"));
        run.contentFloorExceptions = [
          {
            section: "企业与品牌",
            reason: "😀".repeat(12),
            attemptedSourceUrls: run.sources
              .slice(0, 3)
              .map((source: { url: string }) => source.url),
          },
        ];
        fs.writeFileSync(runPath, JSON.stringify(run));
      },
      "reason must be concrete",
    ],
    [
      "user-upload URLs used as floor-exception attempts",
      (root: string) => {
        const customerPath = path.join(root, "01_customer_draft.md");
        fs.writeFileSync(
          customerPath,
          fs
            .readFileSync(customerPath, "utf8")
            .replace(
              /^## 企业与品牌[\s\S]*?(?=^## 团队与组织)/m,
              "## 企业与品牌\n\n### 企业与品牌主题1\n\n资料暂缺。[待核验]\n\n",
            ),
        );
        const runPath = path.join(root, "02_run.json");
        const run = JSON.parse(fs.readFileSync(runPath, "utf8"));
        const attemptedSourceUrls = [
          "https://uploads.example.test/one",
          "https://uploads.example.test/two",
          "https://uploads.example.test/three",
        ];
        run.sources.push(
          ...attemptedSourceUrls.map((url: string, index: number) => ({
            title: `上传材料 ${index + 1}`,
            kind: "user_upload",
            status: "read",
            url,
            attachmentName: `upload-${index + 1}.pdf`,
          })),
        );
        run.contentFloorExceptions = [
          {
            section: "企业与品牌",
            reason: "官网和公开权威页面均未披露更多可验证的企业事实。",
            attemptedSourceUrls,
          },
        ];
        fs.writeFileSync(runPath, JSON.stringify(run));
      },
      "references URLs absent from sources",
    ],
  ] as const)(
    "rejects schema-v2 %s in the bundled Python packager",
    async (_label, mutate, expectedError) => {
      const temporaryRoot = fs.mkdtempSync(
        path.join(os.tmpdir(), "website-kb-skill-budget-"),
      );
      try {
        writeWebsiteV2PythonBudgetFixture(temporaryRoot);
        mutate(temporaryRoot);
        await expect(
          execFileAsync("python3", [
            path.resolve(
              process.cwd(),
              "server/skills/website-one-shot-kb-builder/scripts/build_candidate.py",
            ),
            "--input-dir",
            temporaryRoot,
            "--output",
            path.join(temporaryRoot, "website-lead-candidate-v1.zip"),
          ]),
        ).rejects.toMatchObject({
          stderr: expect.stringContaining(expectedError),
        });
      } finally {
        fs.rmSync(temporaryRoot, { recursive: true, force: true });
      }
    },
  );

  it("rejects customer evidence references absent from the brand facts", async () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "website-kb-skill-evidence-closure-"),
    );
    try {
      const facts = Array.from(
        { length: 13 },
        (_, index) =>
          `## D${String(index + 1).padStart(2, "0")} ${
            [
              "企业基础",
              "团队",
              "产品服务",
              "技术能力",
              "客户案例",
              "资质认证",
              "财务融资",
              "竞争信息",
              "市场信息",
              "品牌资产",
              "渠道",
              "公开意图",
              "公共情报",
            ][index]
          }\n\n公开资料暂未提供可核验信息。[待核验]`,
      ).join("\n\n");
      const customer = [
        "企业与品牌",
        "团队与组织",
        "产品与服务",
        "技术与交付",
        "客户与行业",
        "服务与合作",
        "可信优势",
      ]
        .map((title, index) =>
          index === 2
            ? `## ${title}\n\n模型与价格事实。[来源](https://example.com/pricing)`
            : `## ${title}\n\n公开资料暂未提供可核验信息。[待核验]`,
        )
        .join("\n\n");
      fs.writeFileSync(path.join(temporaryRoot, "00_brand_facts.md"), facts);
      fs.writeFileSync(
        path.join(temporaryRoot, "01_customer_draft.md"),
        customer,
      );
      const script = path.resolve(
        process.cwd(),
        "server/skills/website-one-shot-kb-builder/scripts/build_candidate.py",
      );
      await expect(
        execFileAsync("python3", [
          script,
          "--input-dir",
          temporaryRoot,
          "--output",
          path.join(temporaryRoot, "website-lead-candidate-v1.zip"),
        ]),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining(
          "01_customer_draft.md evidence references are absent from 00_brand_facts.md: https://example.com/pricing",
        ),
      });
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("rejects thin content and a quietly omitted logo", async () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "website-kb-skill-invalid-"),
    );
    try {
      const facts = Array.from(
        { length: 13 },
        (_, index) =>
          `## D${String(index + 1).padStart(2, "0")} ${
            [
              "企业基础",
              "团队",
              "产品服务",
              "技术能力",
              "客户案例",
              "资质认证",
              "财务融资",
              "竞争信息",
              "市场信息",
              "品牌资产",
              "渠道",
              "公开意图",
              "公共情报",
            ][index]
          }\n\n公开资料暂未提供可核验信息。[待核验]`,
      ).join("\n\n");
      const customer = [
        "企业与品牌",
        "团队与组织",
        "产品与服务",
        "技术与交付",
        "客户与行业",
        "服务与合作",
        "可信优势",
      ]
        .map((title, index) => {
          const topicCount = [1, 1, 2, 2, 1, 1, 1][index]!;
          return `## ${title}\n\n${Array.from(
            { length: topicCount },
            (_, topicIndex) =>
              `### ${title}主题${topicIndex + 1}\n\n内容很少。[待核验]`,
          ).join("\n\n")}`;
        })
        .join("\n\n");
      fs.writeFileSync(path.join(temporaryRoot, "00_brand_facts.md"), facts);
      fs.writeFileSync(
        path.join(temporaryRoot, "01_customer_draft.md"),
        customer,
      );
      fs.writeFileSync(
        path.join(temporaryRoot, "02_run.json"),
        JSON.stringify({
          schemaVersion: 2,
          company: {
            name: "示例企业",
            officialWebsite: "https://example.com",
          },
          sources: [],
          queries: [],
          stopReason: "source_exhausted",
          contentFloorExceptions: [],
          logoAcquisition: { status: "retained", attemptedPageUrls: [] },
          assets: [],
        }),
      );
      const script = path.resolve(
        process.cwd(),
        "server/skills/website-one-shot-kb-builder/scripts/build_candidate.py",
      );
      const output = path.join(temporaryRoot, "website-lead-candidate-v1.zip");
      await expect(
        execFileAsync("python3", [
          script,
          "--input-dir",
          temporaryRoot,
          "--output",
          output,
        ]),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining(
          "logoAcquisition.status must be unavailable",
        ),
      });

      fs.writeFileSync(
        path.join(temporaryRoot, "02_run.json"),
        JSON.stringify({
          schemaVersion: 2,
          company: {
            name: "示例企业",
            officialWebsite: "https://example.com",
          },
          sources: [
            {
              title: "企业官网",
              kind: "official_web",
              status: "read",
              url: "https://example.com",
            },
            {
              title: "企业关于页",
              kind: "official_web",
              status: "read",
              url: "https://example.com/about",
            },
          ],
          queries: [],
          stopReason: "source_exhausted",
          contentFloorExceptions: [],
          logoAcquisition: {
            status: "unavailable",
            attemptedPageUrls: [
              "https://example.com",
              "https://example.com/about",
            ],
            reason: "两个第一方页面均未提供可解码的官方 Logo 原始资源。",
          },
          assets: [],
        }),
      );
      await expect(
        execFileAsync("python3", [
          script,
          "--input-dir",
          temporaryRoot,
          "--output",
          output,
        ]),
      ).rejects.toMatchObject({
        stderr: expect.stringContaining("below its visible-content floor"),
      });
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it("keeps all fixed dimensions and the simple candidate contract in references", () => {
    const dimensions = fs.readFileSync(
      path.join(websiteKnowledgeBaseReferenceRoot, "dimensions.md"),
      "utf8",
    );
    const candidateFormat = fs.readFileSync(
      path.join(websiteKnowledgeBaseReferenceRoot, "candidate-format.md"),
      "utf8",
    );
    for (let index = 1; index <= 13; index += 1) {
      expect(dimensions).toContain(`D${String(index).padStart(2, "0")}`);
    }
    for (const cluster of ["C1", "C2", "C3", "C4", "C5", "C6"]) {
      expect(dimensions).toContain(cluster);
    }
    expect(candidateFormat).toContain('"schemaVersion": 2');
    expect(candidateFormat).toMatch(/\| 企业与品牌\s+\|\s+210 \|\s+500 \|/);
    expect(candidateFormat).toMatch(/\| 合计\s+\|\s+2954 \|\s+6300 \|/);
    expect(candidateFormat).toContain("logoAcquisition");
    expect(candidateFormat).toContain(
      "evidence_refs(01_customer_draft.md) ⊆ evidence_refs(00_brand_facts.md)",
    );
    expect(candidateFormat).toContain("00_brand_facts.md");
    expect(candidateFormat).toContain("01_customer_draft.md");
    expect(candidateFormat).not.toContain("00_package_manifest.json");
  });
});

describe("GEO question-recommender skill", () => {
  it("embeds the verified 5+5+40 source logic and strict four-by-five contract", async () => {
    const skill = await loadGeoQuestionRecommenderSkill();
    expect(skill).toContain("有效题目共 50 道");
    expect(skill).toContain(
      "行业排名/产品推荐 5 道、竞品对比 5 道、产品优势/美誉度/Q&A 40 道",
    );
    expect(skill).toContain(
      "exactly twenty Chinese GEO optimization questions",
    );
    expect(skill).toContain('"minItems": 20');
    expect(skill).toContain('"industry_ranking"');
    expect(skill).toContain("enterpriseAnchor");
    expect(skill).toContain(
      "Every item must be phrased as a real reputation judgment",
    );
    expect(skill).toContain("这些题不属于美誉与舆情");
    expect(skill).toContain("Never use the Chinese comma `，`");
    expect(skill).toContain("`website.question-recommendation` contract");
    expect(skill).toContain(
      "Every item must also declare a different `competitorAnchor`",
    );
    expect(skill).toContain(
      "Never stop, return a `blocked`/`status`/error object",
    );
    expect(skill).toContain(
      "Missing D08 evidence is not a permitted reason to omit the twenty questions",
    );
    expect(skill).toContain('"minContains": 5');
    expect(skill).toContain("competitorAnchor");
    expect(skill).toContain(
      "All five questions must explicitly name the current enterprise",
    );
    expect(skill).toContain(
      '"required": ["enterpriseAnchor", "competitorAnchor"]',
    );
    expect(skill).toContain("offeringAnchor");
    expect(skill).toContain("offering_definition");
    expect(skill).toContain("support_boundary");
    expect(skill).toContain("不是企业产品与服务 Q&A");
    expect(skill).toContain("Five-question intent matrices");
    expect(skill).toContain("Never write placeholder structures");
    expect(skill).toContain("all twenty rationales are specific");
    expect(skill).toContain("questionEnglish: null");
  });

  it("builds a JSON-only grounded recommendation prompt", async () => {
    const prompt = await buildGeoQuestionPrompt({
      companyName: "Acme",
      archiveFilename: "Acme.zip",
    });
    const taskInput = JSON.parse(
      buildGeoQuestionTaskInput({
        companyName: "Acme",
        archiveFilename: "Acme.zip",
      }).body.toString("utf8"),
    );
    expect(prompt).toContain("最终响应只能是符合 schema 的 JSON 对象");
    expect(prompt).toContain(QUESTION_TASK_INPUT_FILENAME);
    expect(prompt).not.toContain("Acme.zip");
    expect(taskInput.data).toEqual({
      companyName: "Acme",
      knowledgeBaseArchive: "Acme.zip",
    });
    expect(prompt).toContain(QUESTION_SKILL_ARCHIVE_FILENAME);
    expect(prompt).not.toContain("# FILE:");
    expect(Buffer.byteLength(prompt, "utf8")).toBeLessThan(4 * 1024);
    expect(prompt).toContain(
      "product_scenario 的五道题必须是该企业具体产品、服务、模块或功能的 Q&A",
    );
    expect(prompt).toContain("禁止无企业和产品主语的行业教育问句");
    expect(prompt).toContain("四类各 5 题必须分别覆盖 5 个不同客户决策意图");
    expect(prompt).toContain("禁止内部英文枚举、序号占位");
    expect(prompt).toContain("知识库 D08 或其他文件没有竞品名称时");
    expect(prompt).toContain("不得返回 blocked/status/error 对象");
  });

  it("packages the complete question recommender as a deterministic Skill ZIP", async () => {
    const [first, second] = await Promise.all([
      buildGeoQuestionRecommenderSkillArchive(),
      buildGeoQuestionRecommenderSkillArchive(),
    ]);
    expect(first.equals(second)).toBe(true);
    const zip = await (await import("jszip")).default.loadAsync(first);
    expect(Object.keys(zip.files).sort()).toEqual([
      "MANIFEST.json",
      "SKILL.md",
      "references/demark-question-logic.md",
      "references/output-schema.json",
    ]);
    const manifest = JSON.parse(
      await zip.file("MANIFEST.json")!.async("string"),
    );
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      name: "geo-question-recommender",
      entrypoint: "SKILL.md",
    });
    expect(manifest.files).toHaveLength(3);
    expect(
      await zip.file("references/output-schema.json")!.async("string"),
    ).toContain('"questionEnglish": { "type": "null" }');
  });
});

describe("GEO custom-question classifier skill", () => {
  it("requires enterprise relevance, hard ranking rejection, strict JSON, and ZIP evidence paths", async () => {
    const skill = await loadGeoCustomQuestionClassifierSkill();
    for (const invariant of [
      "geo-custom-question-classifier",
      "enterprise_unrelated",
      "industry_ranking",
      "competitor_comparison",
      "evidenceRefs",
      "exact file paths",
      "never guess",
    ]) {
      expect(skill.toLowerCase()).toContain(invariant.toLowerCase());
    }
    expect(skill).toContain("questionEnglish: null");
  });

  it("builds a one-question, JSON-only, knowledge-grounded classifier prompt", async () => {
    const prompt = await buildGeoCustomQuestionClassifierPrompt({
      companyName: "超前智能",
      question: "超前智能有哪些值得重点了解的优势？",
      archiveFilename: "超前智能_website_lead_knowledge_base.zip",
    });
    const taskInput = JSON.parse(
      buildGeoCustomQuestionClassifierTaskInput({
        companyName: "超前智能",
        question: "超前智能有哪些值得重点了解的优势？",
        archiveFilename: "超前智能_website_lead_knowledge_base.zip",
      }).body.toString("utf8"),
    );
    expect(prompt).toContain(CUSTOM_QUESTION_CLASSIFIER_SKILL_ARCHIVE_FILENAME);
    expect(prompt).toContain(CUSTOM_QUESTION_TASK_INPUT_FILENAME);
    expect(prompt).not.toContain("超前智能有哪些值得重点了解的优势？");
    expect(taskInput.data.question).toBe("超前智能有哪些值得重点了解的优势？");
    expect(prompt).toContain("企业相关性");
    expect(prompt).toContain("行业排名");
    expect(prompt).toContain("单个 JSON 对象");
    expect(prompt.split("\n").at(-1)).toBe(
      "生成后必须自行 serialize 并重新 parse，按 strict schema 核验全部字段、证据路径与企业锚点；只输出一次单个有效 JSON 对象，服务端仍会执行最终权威校验。",
    );
    expect(prompt).not.toContain("# FILE:");
    expect(Buffer.byteLength(prompt, "utf8")).toBeLessThan(4 * 1024);
  });

  it("packages the complete classifier as a deterministic Skill ZIP", async () => {
    const [first, second] = await Promise.all([
      buildGeoCustomQuestionClassifierSkillArchive(),
      buildGeoCustomQuestionClassifierSkillArchive(),
    ]);
    expect(first.equals(second)).toBe(true);
    const zip = await (await import("jszip")).default.loadAsync(first);
    expect(Object.keys(zip.files).sort()).toEqual([
      "MANIFEST.json",
      "SKILL.md",
      "agents/openai.yaml",
      "references/output-schema.json",
    ]);
    expect(
      JSON.parse(await zip.file("MANIFEST.json")!.async("string")),
    ).toMatchObject({
      schemaVersion: 1,
      name: "geo-custom-question-classifier",
      entrypoint: "SKILL.md",
    });
    expect(CUSTOM_QUESTION_CLASSIFIER_SKILL_ARCHIVE_FILENAME).toBe(
      "geo-custom-question-classifier.skill.zip",
    );
    expect(
      await zip.file("references/output-schema.json")!.async("string"),
    ).toContain('"questionEnglish": { "type": "null" }');
  });
});

describe("GEO production runtime Skill release gates", () => {
  it("loads, copies, audits, and verifies the exact four-Skill runtime set", () => {
    const serverEntry = fs.readFileSync(
      path.resolve(process.cwd(), "server/index.ts"),
      "utf8",
    );
    const bundleAudit = fs.readFileSync(
      path.resolve(process.cwd(), "scripts/audit-production-bundle.mjs"),
      "utf8",
    );
    const productionVerifier = fs.readFileSync(
      path.resolve(process.cwd(), "scripts/verify-production-release.mjs"),
      "utf8",
    );
    const skillCopier = fs.readFileSync(
      path.resolve(process.cwd(), "scripts/copy-server-skills.mjs"),
      "utf8",
    );
    const requiredSkills = [
      "website-one-shot-kb-builder",
      "geo-question-recommender",
      "geo-current-state-evaluator",
      "geo-optimization-outcome-forecaster",
    ];
    expect(serverEntry).not.toContain("loadGeoCustomQuestionClassifierSkill");
    for (const skillName of requiredSkills) {
      expect(serverEntry).toContain(skillName);
      expect(skillCopier).toContain(skillName);
      expect(bundleAudit).toContain(skillName);
      expect(productionVerifier).toContain(skillName);
    }
    expect(productionVerifier).toContain(
      "Production must expose the exact four runtime Skills",
    );
    for (const runtimeSource of [
      serverEntry,
      skillCopier,
      bundleAudit,
      productionVerifier,
    ]) {
      expect(runtimeSource).not.toContain("geo-knowledge-answer-verifier");
      expect(runtimeSource).not.toContain("geo-custom-question-classifier");
    }
    expect(bundleAudit).not.toContain("must contain exactly 21 files");
    expect(bundleAudit).not.toContain("legacy visitor-stat baseline");
  });

  it("builds payment verification for the production-only dependency set", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"),
    );
    const serverBuild = fs.readFileSync(
      path.resolve(process.cwd(), "scripts/build-server.mjs"),
      "utf8",
    );
    expect(packageJson.scripts["verify:payment"]).toBe(
      "node dist/verify-live-payment.js",
    );
    expect(serverBuild).toContain('"verify-live-payment"');
    expect(serverBuild).toContain('"verify-live-payment.ts"');
  });
});

describe("GEO current-state evaluator skill", () => {
  it("performs the lightweight comparison and assessment in one pass", async () => {
    const skill = await loadGeoCurrentStateEvaluatorSkill();
    for (const invariant of [
      "no more than 25 topic labels",
      "exactly the top 10 unique topics",
      "Do not analyze the discarded candidate topics",
      "Never output all 25 candidate topics",
      "supported",
      "contradicted",
      "omitted",
      "unverifiable",
      "optional",
      "single task run",
      "Do not create a second verifier pass",
    ]) {
      expect(skill).toContain(invariant);
    }
    expect(skill).not.toContain("geo-knowledge-answer-verifier");
  });
});
