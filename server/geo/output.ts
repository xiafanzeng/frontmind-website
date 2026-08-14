import { rankedKnowledgeArchiveDescriptors } from "./knowledge-base-artifact";
import {
  GeoQuestionSetSchema,
  isIndustryRankingQuestion,
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

  return {
    id: publicId,
    status,
    progress,
    title: undefined,
    output: [],
    error: task.error?.code,
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
    return {
      questionSet: enforceGeneratedQuestionSelectionSafety(parsed.data),
      issues: [],
    };
  }
  return {
    questionSet: null,
    issues: parsed.error.issues.map((issue) => {
      const path = issue.path.join(".");
      return `${path || "root"}: ${issue.message}`;
    }),
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
