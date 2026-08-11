import { describe, expect, it } from "vitest";
import type { KnowledgeBaseManifest } from "./archive";
import {
  parseCustomQuestionClassificationTaskOutput,
  resolveCustomQuestionClassificationTaskOutput,
  validateAcceptedCustomQuestionGrounding,
} from "./custom-question-classifier";
import { TRUSTED_TASK_JSON_MAX_TOTAL_BYTES } from "./trusted-task-json-output";

const manifest: KnowledgeBaseManifest = {
  companyName: "超前智能",
  summary: "超前智能提供企业大模型应用与知识库解决方案。",
  generatedAt: "2026-07-31T00:00:00.000Z",
  reportMarkdown: "",
  metrics: [],
  sections: [
    {
      id: "products-services",
      title: "产品与服务",
      markdown: "企业知识库产品支持检索、问答与持续维护。",
      evidenceCount: 1,
      status: "verified",
    },
  ],
  sources: [],
  assets: [],
  evidencePaths: [
    "01_company_overview/overview.md",
    "03_products/knowledge-base.md",
  ],
};

const v4Manifest: KnowledgeBaseManifest = {
  ...manifest,
  archiveContractVersion: 4,
  allPaths: [
    "00_package_manifest.json",
    "README.md",
    "01_company_overview/overview.md",
    "03_products/knowledge-base.md",
    "evidence/S001.md",
    "assets/logo.png",
  ],
  evidencePaths: ["evidence/S001.md"],
  documents: [
    {
      path: "README.md",
      kind: "readme",
      customerVisible: true,
    },
    {
      path: "01_company_overview/overview.md",
      kind: "overview",
      customerVisible: true,
    },
    {
      path: "03_products/knowledge-base.md",
      kind: "leaf",
      customerVisible: true,
    },
    {
      path: "evidence/S001.md",
      kind: "evidence",
      customerVisible: false,
    },
  ],
};

function assistantTask(value: unknown) {
  return {
    status: "completed",
    output: [
      {
        role: "assistant",
        content: [{ type: "output_text", text: JSON.stringify(value) }],
      },
    ],
  };
}

function assistantTextTask(text: string) {
  return {
    status: "completed",
    output: [
      {
        role: "assistant",
        content: [{ type: "output_text", text }],
      },
    ],
  };
}

describe("custom GEO question classifier contract", () => {
  it("parses one strict accepted classification", () => {
    const classification = parseCustomQuestionClassificationTaskOutput(
      assistantTask({
        decision: "accept",
        category: "product_scenario",
        enterpriseRelated: true,
        reasonCode: "accepted",
        reason: "问题明确询问超前智能的企业知识库产品能力。",
        enterpriseAnchor: "超前智能",
        offeringAnchor: "企业知识库",
        evidenceRefs: ["03_products/knowledge-base.md"],
      }),
    );

    expect(classification).toMatchObject({
      decision: "accept",
      category: "product_scenario",
      enterpriseRelated: true,
    });
  });

  it("rejects inconsistent or extended classifier JSON", () => {
    expect(
      parseCustomQuestionClassificationTaskOutput(
        assistantTask({
          decision: "reject",
          category: "unrelated",
          enterpriseRelated: true,
          reasonCode: "accepted",
          reason: "错误地把无关问题判断为企业相关。",
          enterpriseAnchor: null,
          offeringAnchor: null,
          evidenceRefs: [],
          debug: "must not pass",
        }),
      ),
    ).toBeNull();
  });

  it("repairs an otherwise strict rejection when a quoted name is not escaped", () => {
    const classification = parseCustomQuestionClassificationTaskOutput(
      assistantTextTask(
        `{"decision":"reject","category":"unrelated","enterpriseRelated":false,"reasonCode":"enterprise_unrelated","reason":"问题询问"FrontMind"是什么企业，该名称在硅基流动企业知识库中无任何记录，既非硅基流动的产品、服务、别名，也未与硅基流动存在任何可验证的关联路径，无法将其绑定至被评估企业。","enterpriseAnchor":null,"offeringAnchor":null,"evidenceRefs":[]}`,
      ),
    );

    expect(classification).toMatchObject({
      decision: "reject",
      category: "unrelated",
      enterpriseRelated: false,
      reasonCode: "enterprise_unrelated",
      enterpriseAnchor: null,
      offeringAnchor: null,
      evidenceRefs: [],
    });
  });

  it("does not invent a rejection from prose or an incomplete shape", () => {
    expect(
      parseCustomQuestionClassificationTaskOutput(
        assistantTextTask(
          "decision: reject\nreasonCode: enterprise_unrelated\n当前问题无法绑定至被评估企业。",
        ),
      ),
    ).toBeNull();
  });

  it("repairs a malformed accepted classification before strict validation", () => {
    const classification = parseCustomQuestionClassificationTaskOutput(
      assistantTextTask(
        `{"decision":"accept","category":"product_scenario","enterpriseRelated":true,"reasonCode":"accepted","reason":"问题询问"企业知识库"的具体能力。","enterpriseAnchor":"超前智能","offeringAnchor":"企业知识库","evidenceRefs":["03_products/knowledge-base.md"]}`,
      ),
    );

    expect(classification).toMatchObject({
      decision: "accept",
      category: "product_scenario",
      reason: '问题询问"企业知识库"的具体能力。',
      evidenceRefs: ["03_products/knowledge-base.md"],
    });
  });

  it.each([
    `{"decision":"accept","category":"reputation","enterpriseRelated":true,"reasonCode":"accepted","reason":"问题明确以"硅基流动"为主语，询问其可靠性/信誉，知识库中存在关于硅基流动多轮融资、安全认证、服务稳定性及客户规模的具体事实，可支撑对该企业信誉的判定。","enterpriseAnchor":"硅基流动","offeringAnchor":null,"evidenceRefs":["08_competitive_advantages/013-3d826344f0.md","01_company_overview/001-cba3ec0725.md","evidence/S001.md"]}`,
    `{"decision":"accept","category":"reputation","enterpriseRelated":true,"reasonCode":"accepted","reason":"问题明确以"硅基流动"为主语询问其可信度与可靠性，知识库中存在关于该企业安全认证、融资记录、服务稳定性及用户规模的具体证据，属于声誉类问题。","enterpriseAnchor":"硅基流动","offeringAnchor":null,"evidenceRefs":["08_competitive_advantages/013-3d826344f0.md","01_company_overview/001-cba3ec0725.md","evidence/S001.md"]}`,
  ])("repairs a retained SiliconFlow production accept fixture", (raw) => {
    expect(
      parseCustomQuestionClassificationTaskOutput(assistantTextTask(raw)),
    ).toMatchObject({
      decision: "accept",
      category: "reputation",
      enterpriseRelated: true,
      enterpriseAnchor: "硅基流动",
      evidenceRefs: [
        "08_competitive_advantages/013-3d826344f0.md",
        "01_company_overview/001-cba3ec0725.md",
        "evidence/S001.md",
      ],
    });
  });

  it("fails closed when multiple valid assistant results conflict", () => {
    const accepted = {
      decision: "accept",
      category: "reputation",
      enterpriseRelated: true,
      reasonCode: "accepted",
      reason: "问题明确询问超前智能的可信优势。",
      enterpriseAnchor: "超前智能",
      offeringAnchor: null,
      evidenceRefs: ["01_company_overview/overview.md"],
    };
    const task = {
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            { type: "output_text", text: JSON.stringify(accepted) },
            {
              type: "output_text",
              text: JSON.stringify({
                ...accepted,
                category: "product_scenario",
              }),
            },
          ],
        },
      ],
    };
    expect(parseCustomQuestionClassificationTaskOutput(task)).toBeNull();
  });

  it("treats different valid reasons as a security-field conflict", () => {
    const accepted = {
      decision: "accept",
      category: "reputation",
      enterpriseRelated: true,
      reasonCode: "accepted",
      reason: "第一份结果依据企业知识库判断可信。",
      enterpriseAnchor: "超前智能",
      offeringAnchor: null,
      evidenceRefs: ["01_company_overview/overview.md"],
    };
    expect(
      parseCustomQuestionClassificationTaskOutput({
        output: [
          {
            role: "assistant",
            content: [
              { type: "output_text", text: JSON.stringify(accepted) },
              {
                type: "output_text",
                text: JSON.stringify({
                  ...accepted,
                  reason: "第二份结果依据另一套理由判断可信。",
                }),
              },
            ],
          },
        ],
      }),
    ).toBeNull();
  });

  it("resolves one trusted classifier output_file", async () => {
    const accepted = {
      decision: "accept",
      category: "reputation",
      enterpriseRelated: true,
      reasonCode: "accepted",
      reason: "问题明确询问超前智能的可信优势。",
      enterpriseAnchor: "超前智能",
      offeringAnchor: null,
      evidenceRefs: ["01_company_overview/overview.md"],
    };
    await expect(
      resolveCustomQuestionClassificationTaskOutput(
        {
          async downloadFile() {
            return new Response(JSON.stringify(accepted));
          },
          async downloadTaskOutput() {
            throw new Error("URL fallback should not be used");
          },
        },
        {
          id: "classifier-file-task",
          output: [
            {
              type: "output_file",
              file_id: "classifier-result",
              filename: "classifier.json",
            },
          ],
        },
      ),
    ).resolves.toEqual(accepted);
  });

  it("fails closed when classifier inline and output_file channels conflict", async () => {
    const accepted = {
      decision: "accept",
      category: "reputation",
      enterpriseRelated: true,
      reasonCode: "accepted",
      reason: "问题明确询问超前智能的可信优势。",
      enterpriseAnchor: "超前智能",
      offeringAnchor: null,
      evidenceRefs: ["01_company_overview/overview.md"],
    };
    await expect(
      resolveCustomQuestionClassificationTaskOutput(
        {
          async downloadFile() {
            return new Response(
              JSON.stringify({
                ...accepted,
                reason: "文件通道给出了不同但结构有效的判断理由。",
              }),
            );
          },
          async downloadTaskOutput() {
            throw new Error("URL fallback should not be used");
          },
        },
        {
          id: "classifier-conflict-task",
          output: [
            { type: "output_text", text: JSON.stringify(accepted) },
            {
              type: "output_file",
              file_id: "classifier-result",
              filename: "classifier.json",
            },
          ],
        },
      ),
    ).resolves.toBeNull();
  });

  it("rejects a classifier output_file above the shared byte budget", async () => {
    await expect(
      resolveCustomQuestionClassificationTaskOutput(
        {
          async downloadFile() {
            return new Response("{}", {
              headers: {
                "content-length": String(
                  TRUSTED_TASK_JSON_MAX_TOTAL_BYTES + 1,
                ),
              },
            });
          },
          async downloadTaskOutput() {
            throw new Error("URL fallback should not be used");
          },
        },
        {
          output: [
            {
              type: "output_file",
              file_id: "oversized-classifier-result",
              filename: "classifier.json",
            },
          ],
        },
      ),
    ).resolves.toBeNull();
  });

  it("accepts an exact company anchor and a real ZIP evidence path", () => {
    const classification = parseCustomQuestionClassificationTaskOutput(
      assistantTask({
        decision: "accept",
        category: "reputation",
        enterpriseRelated: true,
        reasonCode: "accepted",
        reason: "问题明确询问超前智能的可信优势。",
        enterpriseAnchor: "超前智能",
        offeringAnchor: null,
        evidenceRefs: ["01_company_overview/overview.md"],
      }),
    );
    if (!classification || classification.decision !== "accept") {
      throw new Error("expected accepted fixture");
    }

    expect(
      validateAcceptedCustomQuestionGrounding(classification, {
        question: "超前智能有哪些值得重点了解的优势？",
        companyName: "超前智能",
        manifest,
      }),
    ).toEqual({ ok: true });
  });

  it.each([1, 2, 3] as const)(
    "preserves schema-v%s evidencePaths as the legacy complete ZIP inventory",
    (archiveContractVersion) => {
      const classification = parseCustomQuestionClassificationTaskOutput(
        assistantTask({
          decision: "accept",
          category: "reputation",
          enterpriseRelated: true,
          reasonCode: "accepted",
          reason: "问题明确询问超前智能，并引用旧包中的真实文件路径。",
          enterpriseAnchor: "超前智能",
          offeringAnchor: null,
          evidenceRefs: ["README.md"],
        }),
      );
      if (!classification || classification.decision !== "accept") {
        throw new Error("expected accepted fixture");
      }

      expect(
        validateAcceptedCustomQuestionGrounding(classification, {
          question: "超前智能有哪些优势？",
          companyName: "超前智能",
          manifest: {
            ...manifest,
            archiveContractVersion,
            evidencePaths: [...manifest.evidencePaths, "README.md"],
          },
        }),
      ).toEqual({ ok: true });
    },
  );

  it("rejects an internal schema-v4 document even when allPaths contains it", () => {
    const classification = parseCustomQuestionClassificationTaskOutput(
      assistantTask({
        decision: "accept",
        category: "reputation",
        enterpriseRelated: true,
        reasonCode: "accepted",
        reason: "问题明确询问超前智能，但引用的是普通说明文件。",
        enterpriseAnchor: "超前智能",
        offeringAnchor: null,
        evidenceRefs: ["README.md"],
      }),
    );
    if (!classification || classification.decision !== "accept") {
      throw new Error("expected accepted fixture");
    }

    expect(
      validateAcceptedCustomQuestionGrounding(classification, {
        question: "超前智能靠谱吗？",
        companyName: "超前智能",
        manifest: v4Manifest,
      }),
    ).toMatchObject({ ok: false, kind: "invalid_evidence" });
  });

  it("accepts registered schema-v4 customer leaf and evidence Markdown together", () => {
    const classification = parseCustomQuestionClassificationTaskOutput(
      assistantTask({
        decision: "accept",
        category: "product_scenario",
        enterpriseRelated: true,
        reasonCode: "accepted",
        reason: "问题明确询问超前智能的企业知识库产品能力。",
        enterpriseAnchor: "超前智能",
        offeringAnchor: "企业知识库",
        evidenceRefs: [
          "03_products/knowledge-base.md",
          "evidence/S001.md",
        ],
      }),
    );
    if (!classification || classification.decision !== "accept") {
      throw new Error("expected accepted fixture");
    }

    expect(
      validateAcceptedCustomQuestionGrounding(classification, {
        question: "超前智能的企业知识库有哪些能力？",
        companyName: "超前智能",
        manifest: v4Manifest,
      }),
    ).toEqual({ ok: true });
  });

  it.each(["assets/logo.png", "00_package_manifest.json"])(
    "rejects schema-v4 asset or internal evidence reference %s",
    (evidenceRef) => {
      const classification = parseCustomQuestionClassificationTaskOutput(
        assistantTask({
          decision: "accept",
          category: "reputation",
          enterpriseRelated: true,
          reasonCode: "accepted",
          reason: "问题明确询问超前智能的可信优势。",
          enterpriseAnchor: "超前智能",
          offeringAnchor: null,
          evidenceRefs: [evidenceRef],
        }),
      );
      if (!classification || classification.decision !== "accept") {
        throw new Error("expected accepted fixture");
      }
      expect(
        validateAcceptedCustomQuestionGrounding(classification, {
          question: "超前智能靠谱吗？",
          companyName: "超前智能",
          manifest: v4Manifest,
        }),
      ).toMatchObject({ ok: false, kind: "invalid_evidence" });
    },
  );

  it("fails closed for an unrelated question even if the model says accept", () => {
    const classification = parseCustomQuestionClassificationTaskOutput(
      assistantTask({
        decision: "accept",
        category: "product_scenario",
        enterpriseRelated: true,
        reasonCode: "accepted",
        reason: "错误地认为通用手机问题与企业有关。",
        enterpriseAnchor: null,
        offeringAnchor: null,
        evidenceRefs: ["03_products/knowledge-base.md"],
      }),
    );
    if (!classification || classification.decision !== "accept") {
      throw new Error("expected accepted fixture");
    }

    expect(
      validateAcceptedCustomQuestionGrounding(classification, {
        question: "苹果手机最近有什么新功能？",
        companyName: "超前智能",
        manifest,
      }),
    ).toMatchObject({ ok: false, kind: "missing_anchor" });
  });

  it("rejects evidence paths not present in the validated ZIP manifest", () => {
    const classification = parseCustomQuestionClassificationTaskOutput(
      assistantTask({
        decision: "accept",
        category: "reputation",
        enterpriseRelated: true,
        reasonCode: "accepted",
        reason: "问题明确询问超前智能的可信优势。",
        enterpriseAnchor: "超前智能",
        offeringAnchor: null,
        evidenceRefs: ["external/invented.md"],
      }),
    );
    if (!classification || classification.decision !== "accept") {
      throw new Error("expected accepted fixture");
    }

    expect(
      validateAcceptedCustomQuestionGrounding(classification, {
        question: "超前智能靠谱吗？",
        companyName: "超前智能",
        manifest,
      }),
    ).toMatchObject({ ok: false, kind: "invalid_evidence" });
  });
});
