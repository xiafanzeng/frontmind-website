import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  buildGeoQuestionPrompt,
  buildWebsiteKnowledgeBasePrompt,
} from "./prompts";
import {
  buildGeoQuestionRecommenderSkillArchive,
  buildWebsiteKnowledgeBaseSkillArchive,
  loadGeoQuestionRecommenderSkill,
  loadWebsiteKnowledgeBaseSkill,
  QUESTION_SKILL_ARCHIVE_FILENAME,
  WEBSITE_KB_SKILL_ARCHIVE_FILENAME,
} from "./skills";
import { loadGeoKnowledgeAnswerVerifierSkill } from "./assessment";

const execFileAsync = promisify(execFile);

const websiteKnowledgeBaseReferenceRoot = path.resolve(
  process.cwd(),
  "server",
  "skills",
  "website-one-shot-kb-builder",
  "references",
);

describe("website one-shot knowledge-base skill", () => {
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
    expect(Buffer.byteLength(skill, "utf8")).toBeLessThanOrEqual(20_000);
    for (const invariant of [
      "ordinary Agent browsing",
      "D01–D13",
      "00_brand_facts.md",
      "01_customer_draft.md",
      "references/dimensions.md",
      "references/candidate-format.md",
      "assets/logo.<extension>",
      "Do not collect or package favicons",
      "scripts/build_candidate.py",
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
    expect(prompt).toContain("不存在后续用户对话");
    expect(prompt).toContain("不要询问、等待确认");
    expect(prompt).toContain('"rawInput": "https://acme.example"');
    expect(prompt).toContain(WEBSITE_KB_SKILL_ARCHIVE_FILENAME);
    expect(prompt).toContain("先解压 ZIP 并完整读取根目录 SKILL.md");
    expect(prompt).toContain("website-lead-candidate-v1");
    expect(prompt).toContain(
      "不得开启、调用、切换或推荐 Wide Research / Deep Research",
    );
    expect(Buffer.byteLength(prompt, "utf8")).toBeLessThanOrEqual(4_000);
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
        .map(
          (title) =>
            `## ${title}\n\n公开资料暂未提供可核验信息。[待核验]`,
        )
        .join("\n\n");
      fs.writeFileSync(path.join(temporaryRoot, "00_brand_facts.md"), facts);
      fs.writeFileSync(
        path.join(temporaryRoot, "01_customer_draft.md"),
        customer,
      );
      const first = path.join(temporaryRoot, "candidate-1.zip");
      const second = path.join(temporaryRoot, "candidate-2.zip");
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
      const zip = await (await import("jszip")).default.loadAsync(
        fs.readFileSync(first),
      );
      expect(Object.keys(zip.files).sort()).toEqual([
        "00_brand_facts.md",
        "01_customer_draft.md",
      ]);
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
    expect(candidateFormat).toContain('"schemaVersion": 1');
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
    expect(skill).toContain("offeringAnchor");
    expect(skill).toContain("offering_definition");
    expect(skill).toContain("support_boundary");
    expect(skill).toContain("不是企业产品与服务 Q&A");
  });

  it("builds a JSON-only grounded recommendation prompt", async () => {
    const prompt = await buildGeoQuestionPrompt({
      companyName: "Acme",
      archiveFilename: "Acme.zip",
    });
    expect(prompt).toContain("最终响应只能是符合 schema 的 JSON 对象");
    expect(prompt).toContain("Acme.zip");
    expect(prompt).toContain(QUESTION_SKILL_ARCHIVE_FILENAME);
    expect(prompt).not.toContain("# FILE:");
    expect(Buffer.byteLength(prompt, "utf8")).toBeLessThan(4 * 1024);
    expect(prompt).toContain(
      "product_scenario 的五道题必须是该企业具体产品、服务、模块或功能的 Q&A",
    );
    expect(prompt).toContain("禁止无企业和产品主语的行业教育问句");
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
  });
});

describe("GEO knowledge-answer verifier skill", () => {
  it("requires evidence-linked, customer-readable comparison output", async () => {
    const skill = await loadGeoKnowledgeAnswerVerifierSkill();
    for (const invariant of [
      "geo-knowledge-answer-verifier",
      "supported",
      "contradicted",
      "omitted",
      "unverifiable",
      '"topic"',
      '"kbClaimText"',
      '"recommendedAction"',
      "Never invent a source, platform, run, claim, or quotation",
    ]) {
      expect(skill).toContain(invariant);
    }
  });
});
