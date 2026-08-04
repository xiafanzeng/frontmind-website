import { describe, expect, it } from "vitest";
import type { KnowledgeBaseManifest } from "./archive";
import {
  parseCustomQuestionClassificationTaskOutput,
  validateAcceptedCustomQuestionGrounding,
} from "./custom-question-classifier";

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

  it("infers an enterprise rejection when explanatory prose breaks JSON quoting", () => {
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

  it("uses a clear rejection meaning without requiring the full JSON shape", () => {
    const classification = parseCustomQuestionClassificationTaskOutput(
      assistantTextTask(
        "decision: reject\nreasonCode: enterprise_unrelated\n当前问题无法绑定至被评估企业。",
      ),
    );

    expect(classification).toMatchObject({
      decision: "reject",
      category: "unrelated",
      reasonCode: "enterprise_unrelated",
    });
  });

  it("does not infer a malformed accepted classification", () => {
    const classification = parseCustomQuestionClassificationTaskOutput(
      assistantTextTask(
        `{"decision":"accept","category":"product_scenario","enterpriseRelated":true,"reasonCode":"accepted","reason":"问题询问"企业知识库"的具体能力。","enterpriseAnchor":"超前智能","offeringAnchor":"企业知识库","evidenceRefs":["03_products/knowledge-base.md"]}`,
      ),
    );

    expect(classification).toBeNull();
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
