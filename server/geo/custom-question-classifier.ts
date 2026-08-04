import { z } from "zod";
import type { KnowledgeBaseManifest } from "./archive";
import {
  trustedAssistantOutputItems,
  trustedAssistantOutputTexts,
} from "./trusted-task-output";

const AcceptedCustomQuestionClassificationSchema = z
  .object({
    decision: z.literal("accept"),
    category: z.enum([
      "reputation",
      "product_scenario",
      "competitor_comparison",
    ]),
    enterpriseRelated: z.literal(true),
    reasonCode: z.literal("accepted"),
    reason: z.string().trim().min(8).max(240),
    enterpriseAnchor: z.string().trim().min(2).max(120).nullable(),
    offeringAnchor: z.string().trim().min(2).max(120).nullable(),
    evidenceRefs: z
      .array(z.string().trim().min(3).max(600))
      .min(1)
      .max(8)
      .refine((values) => new Set(values).size === values.length, {
        message: "evidenceRefs must be unique",
      }),
  })
  .strict();

const RejectedCustomQuestionClassificationSchema = z
  .object({
    decision: z.literal("reject"),
    category: z.enum(["industry_ranking", "unrelated", "ambiguous"]),
    enterpriseRelated: z.boolean(),
    reasonCode: z.enum([
      "industry_ranking",
      "enterprise_unrelated",
      "ambiguous",
    ]),
    reason: z.string().trim().min(8).max(240),
    enterpriseAnchor: z.string().trim().min(2).max(120).nullable(),
    offeringAnchor: z.string().trim().min(2).max(120).nullable(),
    evidenceRefs: z
      .array(z.string().trim().min(3).max(600))
      .max(8)
      .refine((values) => new Set(values).size === values.length, {
        message: "evidenceRefs must be unique",
      }),
  })
  .strict()
  .superRefine((value, context) => {
    const expected = {
      industry_ranking: "industry_ranking",
      unrelated: "enterprise_unrelated",
      ambiguous: "ambiguous",
    } as const;
    if (value.reasonCode !== expected[value.category]) {
      context.addIssue({
        code: "custom",
        message: "rejected category and reasonCode are inconsistent",
        path: ["reasonCode"],
      });
    }
    if (
      ["unrelated", "ambiguous"].includes(value.category) &&
      value.enterpriseRelated
    ) {
      context.addIssue({
        code: "custom",
        message: "unrelated or ambiguous results cannot be enterprise related",
        path: ["enterpriseRelated"],
      });
    }
  });

export const CustomQuestionClassificationSchema = z.discriminatedUnion(
  "decision",
  [
    AcceptedCustomQuestionClassificationSchema,
    RejectedCustomQuestionClassificationSchema,
  ],
);

export type CustomQuestionClassification = z.infer<
  typeof CustomQuestionClassificationSchema
>;

const GENERIC_ANCHORS = new Set(
  [
    "ai",
    "人工智能",
    "企业",
    "公司",
    "品牌",
    "产品",
    "服务",
    "平台",
    "系统",
    "工具",
    "方案",
    "技术",
    "能力",
    "行业",
    "智能",
    "大模型",
    "模型",
    "软件",
    "应用",
  ].map(normalizeAnchorText),
);

export function parseCustomQuestionClassificationTaskOutput(
  task: unknown,
): CustomQuestionClassification | null {
  for (const item of trustedAssistantOutputItems(task)) {
    const parsed = CustomQuestionClassificationSchema.safeParse(item);
    if (parsed.success) return parsed.data;
  }
  for (const text of trustedAssistantOutputTexts(task)) {
    for (const candidate of possibleJsonObjects(text)) {
      const parsed = parseClassificationJsonCandidate(candidate);
      if (parsed) return parsed;
    }
  }
  return null;
}

function parseClassificationJsonCandidate(
  candidate: string,
): CustomQuestionClassification | undefined {
  try {
    const parsed = CustomQuestionClassificationSchema.safeParse(
      JSON.parse(candidate),
    );
    if (parsed.success) return parsed.data;
  } catch {
    // A clearly rejected result can still be useful when prose or optional
    // fields do not form the full JSON contract. The semantic fallback below
    // never accepts a question or grants access to payment/monitoring.
  }
  return inferRejectedClassification(candidate);
}

function inferRejectedClassification(
  candidate: string,
): CustomQuestionClassification | undefined {
  if (candidate.length > 32 * 1024) return undefined;
  if (!/\breject\b/i.test(candidate)) return undefined;

  const category = /enterprise[_-]?unrelated/i.test(candidate)
    ? "unrelated"
    : /industry[_-]?ranking/i.test(candidate)
      ? "industry_ranking"
      : /\bambiguous\b/i.test(candidate)
        ? "ambiguous"
        : undefined;
  if (!category) return undefined;

  const reasonCode =
    category === "unrelated"
      ? "enterprise_unrelated"
      : category === "industry_ranking"
        ? "industry_ranking"
        : "ambiguous";
  const reason =
    category === "unrelated"
      ? "模型判定该问题无法绑定至当前企业知识库。"
      : category === "industry_ranking"
        ? "模型判定该问题属于行业排名或开放推荐方向。"
        : "模型无法确认该问题与当前企业知识库的明确关系。";

  return CustomQuestionClassificationSchema.parse({
    decision: "reject",
    category,
    enterpriseRelated:
      category === "industry_ranking" &&
      /enterpriseRelated\s*["']?\s*:\s*true/i.test(candidate),
    reasonCode,
    reason,
    enterpriseAnchor: null,
    offeringAnchor: null,
    evidenceRefs: [],
  });
}

export function validateAcceptedCustomQuestionGrounding(
  classification: Extract<CustomQuestionClassification, { decision: "accept" }>,
  input: {
    question: string;
    companyName: string;
    manifest: KnowledgeBaseManifest;
  },
):
  | { ok: true }
  | {
      ok: false;
      kind: "invalid_evidence" | "missing_anchor";
      reason: string;
    } {
  const evidencePaths = new Set(input.manifest.evidencePaths);
  if (
    classification.evidenceRefs.some(
      (evidenceRef) => !evidencePaths.has(evidenceRef),
    )
  ) {
    return {
      ok: false,
      kind: "invalid_evidence",
      reason: "classification evidence path is absent from the knowledge base",
    };
  }

  const normalizedQuestion = normalizeAnchorText(input.question);
  const normalizedCompanyName = normalizeAnchorText(input.companyName);
  if (
    normalizedCompanyName.length >= 2 &&
    normalizedQuestion.includes(normalizedCompanyName)
  ) {
    return { ok: true };
  }

  const knowledgeText = normalizeAnchorText(
    [
      input.manifest.companyName,
      input.manifest.summary,
      ...input.manifest.sections.flatMap((section) => [
        section.title,
        section.summary || "",
        section.markdown,
        section.overviewMarkdown || "",
      ]),
    ].join("\n"),
  );
  const verifiedAnchor = [
    classification.enterpriseAnchor,
    classification.offeringAnchor,
  ].find((anchor) => {
    if (!anchor) return false;
    const normalizedAnchor = normalizeAnchorText(anchor);
    return (
      isSpecificAnchor(normalizedAnchor) &&
      normalizedQuestion.includes(normalizedAnchor) &&
      knowledgeText.includes(normalizedAnchor)
    );
  });

  if (!verifiedAnchor) {
    return {
      ok: false,
      kind: "missing_anchor",
      reason:
        "question has no explicit company name or knowledge-base-verified offering anchor",
    };
  }
  return { ok: true };
}

function normalizeAnchorText(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(
      /[\s!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~，。！？、；：“”‘’（）【】《》·…—～￥]+/g,
      "",
    );
}

function isSpecificAnchor(value: string) {
  if (!value || GENERIC_ANCHORS.has(value)) return false;
  if (/^[a-z\d]+$/i.test(value)) return value.length >= 3;
  return Array.from(value).length >= 2;
}

function possibleJsonObjects(value: string) {
  const trimmed = value.trim();
  const results = new Set<string>();
  if (trimmed) {
    results.add(
      trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
    );
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    results.add(trimmed.slice(firstBrace, lastBrace + 1));
  }
  return Array.from(results);
}
