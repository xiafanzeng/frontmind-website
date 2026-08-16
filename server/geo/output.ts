import { rankedKnowledgeArchiveDescriptors } from "./knowledge-base-artifact";
import {
  GeoQuestionSetSchema,
  isIndustryRankingQuestion,
  PRODUCT_QA_INTENTS,
  type GeoQuestion,
  type GeoQuestionSet,
} from "./schemas";
import type { BrokerTask } from "./broker";
import { normalizePresalesStructuredResult } from "./structured-result-normalization";

export type NormalizedTaskStatus =
  | "queued"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled"
  | "unknown";

export type ArchiveDescriptor = {
  artifactId: string;
  filename: string;
};

export type ResultQuality = {
  completeness: "complete" | "partial";
  stats?: {
    acceptedCount: number;
    expectedCount?: number;
    droppedCount: number;
    selectableCount?: number;
  };
  warnings?: Array<{
    code:
      | "RESULT_INCOMPLETE"
      | "ITEM_DROPPED"
      | "EVIDENCE_INCOMPLETE"
      | "AGGREGATE_UNAVAILABLE"
      | "OPTIONAL_ASSET_SKIPPED"
      | "COVERAGE_INCOMPLETE";
    area?: string;
  }>;
  downstreamEligible?: boolean;
  publishable?: boolean;
};

type GeoQuestionCategory = GeoQuestion["category"];

export function normalizeTaskStatus(value: unknown): NormalizedTaskStatus {
  const status = String(value || "").toLowerCase();
  if (["pending", "queued", "created"].includes(status)) return "queued";
  if (["running", "in_progress", "processing"].includes(status))
    return "running";
  if (["paused", "waiting", "pending_sync", "result_pending"].includes(status))
    return "waiting";
  if (
    [
      "completed",
      "complete",
      "succeeded",
      "success",
      "done",
      "finished",
      "succeeded",
    ].includes(status)
  )
    return "completed";
  if (["failed", "error", "errored", "attention_required"].includes(status))
    return "failed";
  if (["cancelled", "canceled"].includes(status)) return "cancelled";
  return "unknown";
}

export function normalizeTask(
  task: BrokerTask,
  publicId:
    | "knowledge-base"
    | "questions"
    | "assessment"
    | "optimization-forecast",
) {
  const status = normalizeTaskStatus(task.status);
  const progress =
    status === "completed"
      ? 100
      : status === "queued" || status === "waiting"
        ? 0
        : null;

  const normalized = {
    id: publicId,
    status,
    progress,
    title: undefined,
    output: [],
    error: undefined,
  };
  return Object.defineProperty(normalized, "failure", {
    value: task.error
      ? { code: task.error.code, retryable: task.error.retryable }
      : undefined,
    enumerable: false,
    configurable: false,
    writable: false,
  }) as typeof normalized & {
    failure?: { code: string; retryable: boolean };
  };
}

export type KnowledgeBaseTaskFailurePresentation = {
  message: string;
  supportRequired: boolean;
  kind: "fresh_upload" | "create_unknown" | "provider_failure";
};

const FRESH_UPLOAD_TASK_ERROR_CODES = new Set([
  "TASK_PREPARATION_FAILED",
  "FILE_UPLOAD_CONFIRMATION_UNKNOWN",
  // Read-only compatibility for the pre-v5 Dashboard terminal.
  "FILE_UPLOAD_OUTCOME_UNKNOWN",
  "FILE_LEASE_PERSIST_FAILED",
  "FILE_UPLOAD_REJECTED",
]);

const CREATE_UNKNOWN_TASK_ERROR_CODES = new Set([
  "CREATE_OUTCOME_UNKNOWN",
  "CREATE_RECONCILE_CONFLICT",
  "TASK_PROVIDER_BIND_OUTCOME_UNKNOWN",
]);

/** Maps only safe task coordinates into public copy. Raw upstream codes are
 * deliberately not returned; the caller may keep them server-side for logs. */
export function knowledgeBaseTaskFailurePresentation(
  task: BrokerTask,
): KnowledgeBaseTaskFailurePresentation {
  const code = String(task.error?.code || "")
    .trim()
    .toUpperCase();
  if (CREATE_UNKNOWN_TASK_ERROR_CODES.has(code)) {
    return {
      kind: "create_unknown",
      supportRequired: false,
      message:
        "任务创建结果暂时无法确认。请移除本次项目后重新上传，并创建全新任务。",
    };
  }
  if (!task.providerStartedAt || FRESH_UPLOAD_TASK_ERROR_CODES.has(code)) {
    return {
      kind: "fresh_upload",
      supportRequired: false,
      message:
        "资料已接收，但向分析服务提交资料未完成。请移除本次项目后重新上传，并创建全新任务。",
    };
  }
  return {
    kind: "provider_failure",
    supportRequired: true,
    message: "企业知识库生成未能完成，请联系技术支持。",
  };
}

export function findArchiveDescriptor(
  value: unknown,
): ArchiveDescriptor | null {
  const task = asRecord(value);
  const result = asRecord(task?.result);
  const descriptor = rankedKnowledgeArchiveDescriptors(result?.artifacts)[0];
  return descriptor
    ? {
        artifactId: descriptor.artifactId,
        filename: descriptor.filename,
      }
    : null;
}

export function parseQuestionSetFromTask(
  value: unknown,
): GeoQuestionSet | null {
  return inspectQuestionSetFromTask(value).questionSet;
}

export function questionSetQualityFromTask(
  value: unknown,
): ResultQuality | null {
  return inspectQuestionSetFromTask(value).quality;
}

export function questionSetValidationSummaryFromTask(
  value: unknown,
): string | null {
  const issues = inspectQuestionSetFromTask(value).issues;
  if (!issues.length) return null;
  return `上一次返回已解析为 JSON，但未通过以下字段校验：${issues
    .slice(0, 8)
    .join("；")}`;
}

function inspectQuestionSetFromTask(value: unknown): {
  questionSet: GeoQuestionSet | null;
  issues: string[];
  quality: ResultQuality | null;
} {
  const task = asRecord(value);
  const result = asRecord(task?.result);
  const parsed = GeoQuestionSetSchema.safeParse(
    normalizePresalesStructuredResult(
      "website.question-recommendation",
      result?.structuredResult,
    ),
  );
  if (parsed.success) {
    const safeQuestionSet = enforceGeneratedQuestionSelectionSafety(
      parsed.data,
    );
    return {
      questionSet: safeQuestionSet,
      issues: [],
      quality: {
        completeness: "complete",
        stats: {
          acceptedCount: 20,
          expectedCount: 20,
          droppedCount: 0,
          selectableCount: safeQuestionSet.questions.filter(
            (question) => question.selectable,
          ).length,
        },
        downstreamEligible: true,
      },
    };
  }
  const partial = salvageDisplayableQuestions(result?.structuredResult);
  if (partial.questions.length > 0) {
    const selectableCount = partial.questions.filter(
      (question) => question.selectable,
    ).length;
    return {
      questionSet: { questions: partial.questions } as GeoQuestionSet,
      issues: parsed.error.issues.map((issue) => {
        const path = issue.path.join(".");
        return `${path || "root"}: ${issue.message}`;
      }),
      quality: {
        completeness: "partial",
        stats: {
          acceptedCount: partial.questions.length,
          expectedCount: 20,
          droppedCount: partial.droppedCount,
          selectableCount,
        },
        warnings: [
          { code: "RESULT_INCOMPLETE", area: "questions" },
          ...(partial.droppedCount > 0
            ? ([{ code: "ITEM_DROPPED", area: "questions" }] as const)
            : []),
        ],
        downstreamEligible: selectableCount > 0,
      },
    };
  }
  return {
    questionSet: null,
    quality: null,
    issues: parsed.error.issues.map((issue) => {
      const path = issue.path.join(".");
      return `${path || "root"}: ${issue.message}`;
    }),
  };
}

const QUESTION_CATEGORY_ALIASES = new Map<string, GeoQuestionCategory>([
  ["reputation", "reputation"],
  ["public_opinion", "reputation"],
  ["reputation_public_opinion", "reputation"],
  ["美誉舆情", "reputation"],
  ["口碑舆情", "reputation"],
  ["product_scenario", "product_scenario"],
  ["product", "product_scenario"],
  ["product_qa", "product_scenario"],
  ["产品场景", "product_scenario"],
  ["产品与服务q&a", "product_scenario"],
  ["industry_ranking", "industry_ranking"],
  ["ranking", "industry_ranking"],
  ["行业排名", "industry_ranking"],
  ["competitor_comparison", "competitor_comparison"],
  ["competitor", "competitor_comparison"],
  ["comparison", "competitor_comparison"],
  ["竞品对比", "competitor_comparison"],
]);

const QUESTION_ID_PREFIX: Record<GeoQuestionCategory, string> = {
  reputation: "reputation",
  product_scenario: "product-scenario",
  industry_ranking: "industry-ranking",
  competitor_comparison: "competitor-comparison",
};

const GENERIC_COMPETITOR_ANCHOR =
  /^(?:竞品|对手|友商|同类(?:产品|平台|方案|服务)?|其他(?:产品|平台|方案|服务)?|传统方案|自建方案)$/i;
const PRODUCT_EVIDENCE_PATH =
  /(?:^|\/)(?:03_products|04_technology|05_manufacturing|06_industries|07_service)\//i;
const COMPETITOR_COMPARISON_INTENT =
  /(?:对比|相比|比较|区别|差异|不同|相较|取舍|还是|与.+哪个|和.+哪个|跟.+哪个|\bvs\.?\b)/i;
const REPUTATION_JUDGMENT_INTENT =
  /(?:怎么样|好不好|好吗|靠谱吗|靠不靠谱|可靠吗|稳不稳定|稳定吗|安全吗|正规吗|可信吗|值得信赖吗|口碑(?:如何|怎么样|好吗)|评价(?:如何|怎么样)|如何评价|售后(?:服务)?(?:如何|怎么样|好吗)|投诉(?:多吗|严重吗)|风险(?:高吗|大吗)|满意(?:吗|度如何))/;
const PRODUCT_QA_SEMANTIC_INTENT =
  /(?:是什么|主要解决|有哪些(?:关键)?功能|功能如何工作|如何工作|适合哪些|适用(?:于|场景)|如何部署|如何交付|怎么使用|如何使用|支持边界|服务边界)/;

function normalizedPartialQuestionText(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "")
    .replace(/[,，]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[?？]+$/, "")
    .trim();
  const normalized = text ? `${text}？` : "";
  return normalized.length >= 4 && normalized.length <= 120 ? normalized : null;
}

function normalizedOptionalText(
  value: unknown,
  minimum: number,
  maximum: number,
) {
  if (typeof value !== "string") return undefined;
  const normalized = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length >= minimum && normalized.length <= maximum
    ? normalized
    : undefined;
}

function normalizedQuestionIdentity(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s?？]+/g, "");
}

function questionContainsAnchor(question: string, anchor: string | undefined) {
  if (!anchor) return false;
  return normalizedQuestionIdentity(question).includes(
    normalizedQuestionIdentity(anchor),
  );
}

function partialQuestionCanBeSelected(question: GeoQuestion) {
  if (
    question.classificationState === "unclassified" ||
    question.category === "industry_ranking" ||
    isIndustryRankingQuestion(question.question) ||
    question.rationale.length < 8 ||
    question.evidenceRefs.length === 0
  ) {
    return false;
  }
  if (question.category === "reputation") {
    return questionContainsAnchor(question.question, question.enterpriseAnchor);
  }
  if (question.category === "product_scenario") {
    return (
      questionContainsAnchor(question.question, question.enterpriseAnchor) &&
      questionContainsAnchor(question.question, question.offeringAnchor) &&
      Boolean(question.qaIntent) &&
      question.evidenceRefs.some((reference) =>
        PRODUCT_EVIDENCE_PATH.test(reference),
      )
    );
  }
  return (
    questionContainsAnchor(question.question, question.enterpriseAnchor) &&
    questionContainsAnchor(question.question, question.competitorAnchor) &&
    question.enterpriseAnchor !== question.competitorAnchor &&
    !GENERIC_COMPETITOR_ANCHOR.test(question.competitorAnchor || "")
  );
}

function questionArrayFromStructuredResult(value: unknown): unknown[] | null {
  const record = asRecord(value);
  if (!record) return null;
  const direct = [
    record.questions,
    record.items,
    record.recommendations,
  ].filter(Array.isArray) as unknown[][];
  const dataQuestions = asRecord(record.data)?.questions;
  if (Array.isArray(dataQuestions)) direct.push(dataQuestions);
  if (direct.length === 0) return null;
  const serialized = new Set(
    direct.map((candidate) => JSON.stringify(candidate)),
  );
  return serialized.size === 1 ? direct[0] : null;
}

function salvageDisplayableQuestions(value: unknown) {
  const source = questionArrayFromStructuredResult(value);
  if (!source) return { questions: [] as GeoQuestion[], droppedCount: 0 };
  const seenQuestions = new Set<string>();
  const counts = new Map<GeoQuestionCategory, number>();
  const questions: GeoQuestion[] = [];
  let droppedCount = 0;
  for (const item of source.slice(0, 100)) {
    if (questions.length >= 20) {
      droppedCount += 1;
      continue;
    }
    const record = asRecord(item);
    const rawCategory =
      typeof record?.category === "string"
        ? record.category.normalize("NFKC").trim().toLocaleLowerCase("zh-CN")
        : "";
    let category = QUESTION_CATEGORY_ALIASES.get(rawCategory);
    const questionText = normalizedPartialQuestionText(record?.question);
    if (!record || !questionText) {
      droppedCount += 1;
      continue;
    }
    const rankingIntent = isIndustryRankingQuestion(questionText);
    const offeringAnchor = normalizedOptionalText(
      record.offeringAnchor,
      2,
      120,
    );
    const rawQaIntent = normalizedOptionalText(record.qaIntent, 2, 120);
    const classificationConflict =
      !category ||
      (!rankingIntent &&
        ((category !== "competitor_comparison" &&
          (normalizedOptionalText(record.competitorAnchor, 2, 120) !==
            undefined ||
            COMPETITOR_COMPARISON_INTENT.test(questionText))) ||
          (category === "reputation" &&
            (offeringAnchor !== undefined ||
              rawQaIntent !== undefined ||
              PRODUCT_QA_SEMANTIC_INTENT.test(questionText))) ||
          (category === "product_scenario" &&
            REPUTATION_JUDGMENT_INTENT.test(questionText))));
    if (rankingIntent) category = "industry_ranking";
    // A category is still required by the public DTO. Unknown/conflicting
    // questions are placed in the UI's separate "待分类" bucket and are never
    // selectable, so this fallback cannot silently drive paid scope.
    category ??= "reputation";
    const identity = normalizedQuestionIdentity(questionText);
    if (seenQuestions.has(identity)) {
      droppedCount += 1;
      continue;
    }
    seenQuestions.add(identity);
    const categoryIndex = (counts.get(category) || 0) + 1;
    counts.set(category, categoryIndex);
    const evidenceRefs = Array.isArray(record.evidenceRefs)
      ? Array.from(
          new Set(
            record.evidenceRefs.flatMap((reference) => {
              const normalized = normalizedOptionalText(reference, 3, 300);
              return normalized ? [normalized] : [];
            }),
          ),
        ).slice(0, 8)
      : [];
    const qaIntent =
      typeof record.qaIntent === "string" &&
      PRODUCT_QA_INTENTS.includes(
        record.qaIntent as (typeof PRODUCT_QA_INTENTS)[number],
      )
        ? (record.qaIntent as (typeof PRODUCT_QA_INTENTS)[number])
        : undefined;
    const question: GeoQuestion = {
      id: `${QUESTION_ID_PREFIX[category]}-${String(categoryIndex).padStart(2, "0")}`,
      category,
      question: questionText,
      rationale: normalizedOptionalText(record.rationale, 8, 240) || "",
      enterpriseAnchor: normalizedOptionalText(record.enterpriseAnchor, 2, 120),
      offeringAnchor,
      competitorAnchor: normalizedOptionalText(record.competitorAnchor, 2, 120),
      qaIntent,
      evidenceRefs,
      classificationState: classificationConflict
        ? "unclassified"
        : "classified",
      selectable: false,
    };
    question.selectable =
      record.selectable === true && partialQuestionCanBeSelected(question);
    questions.push(question);
  }
  return {
    questions,
    droppedCount: droppedCount + Math.max(0, source.length - 100),
  };
}

function enforceGeneratedQuestionSelectionSafety(
  questionSet: GeoQuestionSet,
): GeoQuestionSet {
  let changed = false;
  const questions = questionSet.questions.map((question) => {
    if (!isIndustryRankingQuestion(question.question)) return question;
    if (
      question.category === "industry_ranking" &&
      question.selectable === false
    )
      return question;
    changed = true;
    return {
      ...question,
      category: "industry_ranking" as const,
      selectable: false,
    };
  });
  return changed ? { questions } : questionSet;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
