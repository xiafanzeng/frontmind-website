import { rankedKnowledgeArchiveDescriptors } from "./knowledge-base-artifact";
import { GeoQuestionSetSchema, type GeoQuestionSet } from "./schemas";
import {
  trustedAssistantOutputItems,
  trustedAssistantOutputTexts,
} from "./trusted-task-output";

export type NormalizedTaskStatus =
  | "queued"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled"
  | "unknown";

export type ArchiveDescriptor = {
  fileId?: string;
  url?: string;
  filename: string;
};

export function normalizeTaskStatus(value: unknown): NormalizedTaskStatus {
  const status = String(value || "").toLowerCase();
  if (["pending", "queued", "created"].includes(status)) return "queued";
  if (["running", "in_progress", "processing"].includes(status))
    return "running";
  if (["paused", "waiting", "pending_sync"].includes(status)) return "waiting";
  if (
    ["completed", "complete", "succeeded", "success", "done"].includes(status)
  )
    return "completed";
  if (["failed", "error", "errored"].includes(status)) return "failed";
  if (["cancelled", "canceled"].includes(status)) return "cancelled";
  return "unknown";
}

export function normalizeTask(
  task: Record<string, unknown>,
  publicId:
    | "knowledge-base"
    | "questions"
    | "assessment"
    | "optimization-forecast",
) {
  const status = normalizeTaskStatus(task.status);
  const metadata = asRecord(task.metadata);
  const progress = findProgress(task);
  const output = Array.isArray(task.output)
    ? task.output
    : task.output === undefined
      ? []
      : [task.output];
  const errorObject = asRecord(task.error);
  const error =
    stringValue(errorObject?.message) ||
    stringValue(task.error_message) ||
    stringValue(task.message) ||
    undefined;

  return {
    id: publicId,
    status,
    progress:
      progress ??
      (status === "completed"
        ? 100
        : status === "queued" || status === "waiting"
          ? 0
          : null),
    title:
      stringValue(task.task_title) ||
      stringValue(metadata?.task_title) ||
      stringValue(task.title) ||
      undefined,
    output,
    error,
  };
}

export function findArchiveDescriptor(
  value: unknown,
): ArchiveDescriptor | null {
  const task = asRecord(value);
  const descriptor = rankedKnowledgeArchiveDescriptors(task?.output)[0];
  return descriptor
    ? {
        fileId: descriptor.fileId,
        url: descriptor.url,
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
  let bestIssues: string[] = [];
  const inspectCandidate = (candidate: unknown) => {
    const parsed = GeoQuestionSetSchema.safeParse(candidate);
    if (parsed.success) return parsed.data;
    const record = asRecord(candidate);
    if (!Array.isArray(record?.questions)) return null;
    const issues = Array.from(
      new Set(
        parsed.error.issues.map((issue) => {
          const path = issue.path.reduce<string>((result, part) => {
            if (typeof part === "number") return `${result}[${part}]`;
            const key = String(part);
            return result ? `${result}.${key}` : key;
          }, "");
          return `${path || "root"}: ${issue.message}`;
        }),
      ),
    );
    if (!bestIssues.length || issues.length < bestIssues.length) {
      bestIssues = issues;
    }
    return null;
  };

  for (const item of trustedAssistantOutputItems(value)) {
    const parsed = inspectCandidate(item);
    if (parsed) return { questionSet: parsed, issues: [] };
  }
  for (const candidate of trustedAssistantOutputTexts(value)) {
    for (const jsonText of possibleJsonObjects(candidate)) {
      try {
        const parsed = inspectCandidate(JSON.parse(jsonText));
        if (parsed) return { questionSet: parsed, issues: [] };
      } catch {
        // Try the next text candidate.
      }
    }
  }
  return { questionSet: null, issues: bestIssues };
}

function possibleJsonObjects(value: string) {
  const trimmed = value.trim();
  const results = new Set<string>();
  if (trimmed)
    results.add(
      trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
    );
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace)
    results.add(trimmed.slice(firstBrace, lastBrace + 1));
  return Array.from(results);
}

function findProgress(value: unknown) {
  const record = asRecord(value);
  const metadata = asRecord(record?.metadata);
  for (const candidate of [
    record?.progress,
    record?.progress_percent,
    metadata?.progress,
  ]) {
    const number =
      typeof candidate === "number" ? candidate : Number(candidate);
    if (Number.isFinite(number) && number > 0 && number <= 1)
      return Math.round(number * 100);
    if (Number.isFinite(number) && number >= 0 && number <= 100) return number;
  }
  return null;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}
