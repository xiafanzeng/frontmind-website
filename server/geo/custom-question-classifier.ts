import { z } from "zod";
import type { KnowledgeBaseManifest } from "./archive";
import type { GeoPresalesBroker } from "./broker";
import {
  resolveTrustedTaskJsonOutput,
  TrustedTaskJsonOutputError,
  type TrustedTaskJsonCandidateInspection,
} from "./trusted-task-json-output";
import { normalizePresalesStructuredResult } from "./structured-result-normalization";

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
    questionEnglish: z
      .string()
      .trim()
      .min(4)
      .max(240)
      .refine((value) => /[A-Za-z]/.test(value) && value.endsWith("?"))
      .optional(),
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
  const result =
    task && typeof task === "object" && !Array.isArray(task)
      ? (task as { result?: { structuredResult?: unknown } }).result
      : undefined;
  if (!result || !("structuredResult" in result)) return null;
  const inspection = inspectParsedCustomQuestionClassification(
    result.structuredResult,
  );
  return inspection.success ? inspection.data : null;
}

function inspectParsedCustomQuestionClassification(
  candidate: unknown,
): TrustedTaskJsonCandidateInspection<CustomQuestionClassification> {
  const parsed = CustomQuestionClassificationSchema.safeParse(
    normalizePresalesStructuredResult(
      "website.custom-question-classifier",
      candidate,
    ),
  );
  return parsed.success
    ? { success: true, data: parsed.data }
    : {
        success: false,
        code: "SCHEMA_MISMATCH",
        validation: parsed.error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      };
}

export async function resolveCustomQuestionClassificationTaskOutput(
  broker: Pick<GeoPresalesBroker, "downloadArtifact">,
  task: unknown,
  options: Readonly<{ taskId?: string }> = {},
): Promise<CustomQuestionClassification | null> {
  try {
    return await resolveTrustedTaskJsonOutput(broker, task, {
      taskId: options.taskId,
      inspectParsed: inspectParsedCustomQuestionClassification,
      canonicalize: classificationSecurityKey,
    });
  } catch (error) {
    if (error instanceof TrustedTaskJsonOutputError) return null;
    throw error;
  }
}

function classificationSecurityKey(value: CustomQuestionClassification) {
  return JSON.stringify({
    decision: value.decision,
    category: value.category,
    enterpriseRelated: value.enterpriseRelated,
    reasonCode: value.reasonCode,
    reason: value.reason,
    enterpriseAnchor: value.enterpriseAnchor,
    offeringAnchor: value.offeringAnchor,
    evidenceRefs: [...value.evidenceRefs].sort(),
    ...(value.decision === "accept" && value.questionEnglish
      ? { questionEnglish: value.questionEnglish }
      : {}),
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
  const evidencePaths = new Set(
    customQuestionEvidenceAllowlist(input.manifest),
  );
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

function customQuestionEvidenceAllowlist(manifest: KnowledgeBaseManifest) {
  if (manifest.archiveContractVersion !== 4) {
    // v1-v3 historically expose the complete ZIP inventory through this
    // field. Preserve that behavior until their producers and tasks retire.
    return manifest.evidencePaths;
  }
  if (!manifest.allPaths || !manifest.documents) return [];
  const allPaths = new Set(manifest.allPaths);
  const registeredEvidencePaths = new Set(
    manifest.documents
      .filter(
        (document) =>
          document.kind === "evidence" &&
          !document.customerVisible &&
          /\.md$/i.test(document.path) &&
          allPaths.has(document.path),
      )
      .map((document) => document.path),
  );
  const allowlist = new Set(
    manifest.documents
      .filter(
        (document) =>
          document.customerVisible &&
          ["leaf", "overview"].includes(document.kind) &&
          /^(?:0[1-8])_[^/]+\/.+\.md$/i.test(document.path) &&
          allPaths.has(document.path),
      )
      .map((document) => document.path),
  );
  for (const entryPath of manifest.evidencePaths) {
    if (allPaths.has(entryPath) && registeredEvidencePaths.has(entryPath)) {
      allowlist.add(entryPath);
    }
  }
  return Array.from(allowlist);
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
