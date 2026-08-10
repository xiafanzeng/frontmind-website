import { rankedKnowledgeArchiveDescriptors } from "./knowledge-base-artifact";
import {
  PRODUCT_QA_INTENTS,
  GeoQuestionSetSchema,
  isIndustryRankingQuestion,
  type GeoQuestion,
  type GeoQuestionSet,
} from "./schemas";
import {
  trustedAssistantOutputItems,
  trustedAssistantOutputTexts,
} from "./trusted-task-output";
import { parseTrustedTaskJsonCandidate } from "./trusted-task-json-output";

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
    [
      "completed",
      "complete",
      "succeeded",
      "success",
      "done",
      "finished",
    ].includes(status)
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
  const candidates: unknown[] = [...trustedAssistantOutputItems(value)];
  for (const text of trustedAssistantOutputTexts(value)) {
    for (const jsonText of possibleJsonValues(text)) {
      const parsed = parseTrustedTaskJsonCandidate(jsonText);
      if (parsed !== undefined) candidates.push(parsed);
    }
  }

  let latestStrict: GeoQuestionSet | null = null;
  let bestIssues: string[] = [];
  for (const candidate of candidates) {
    const parsed = GeoQuestionSetSchema.safeParse(candidate);
    if (parsed.success) {
      latestStrict = enforceGeneratedQuestionSelectionSafety(parsed.data);
      continue;
    }
    const questions = generatedQuestionCandidates(candidate);
    if (!questions) continue;
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
  }
  if (latestStrict) return { questionSet: latestStrict, issues: [] };

  let bestRelaxed: GeoQuestionSet | null = null;
  let bestRelaxedScore = -1;
  for (const candidate of candidates) {
    const relaxed = normalizeGeneratedQuestionSet(candidate);
    if (!relaxed) continue;
    const categoryCount = new Set(
      relaxed.questions.map((question) => question.category),
    ).size;
    const score = relaxed.questions.length * 10 + categoryCount;
    if (score >= bestRelaxedScore) {
      bestRelaxed = relaxed;
      bestRelaxedScore = score;
    }
  }
  if (bestRelaxed) return { questionSet: bestRelaxed, issues: [] };
  return { questionSet: null, issues: bestIssues };
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

/**
 * Generated recommendations are user-facing suggestions, not an authorization
 * boundary. Prefer the strict portfolio contract when it passes, then salvage
 * every renderable assistant-authored question instead of failing the whole
 * project because wording, anchors, counts, or supporting metadata are
 * imperfect. The one business rule enforced here is that industry-ranking
 * questions remain non-selectable.
 */
function normalizeGeneratedQuestionSet(
  candidate: unknown,
): GeoQuestionSet | null {
  const source = generatedQuestionCandidates(candidate);
  if (!source?.length) return null;

  const categoryCounts = new Map<GeoQuestion["category"], number>();
  const questions: GeoQuestion[] = [];

  for (const item of source.slice(0, 100)) {
    if (questions.length >= 20) break;
    const record = asRecord(item);
    const question = generatedQuestionText(item, record);
    if (!question) continue;
    const displayQuestion = question.slice(0, 200).trim();

    const classification = normalizeGeneratedQuestionClassification(
      record?.category ?? record?.type,
      record?.id ?? record?.questionId ?? record?.question_id,
      question,
    );
    const { category } = classification;
    const categoryIndex = (categoryCounts.get(category) ?? 0) + 1;
    categoryCounts.set(category, categoryIndex);
    const id = generatedQuestionId(category, categoryIndex);
    const rationale = stringValue(
      record?.rationale ?? record?.reason ?? record?.description,
    );
    const evidenceRefs = normalizeGeneratedEvidenceRefs(
      record?.evidenceRefs ??
        record?.evidence_refs ??
        record?.sources ??
        record?.evidence,
    );
    const enterpriseAnchor = stringValue(
      record?.enterpriseAnchor ?? record?.enterprise_anchor,
    );
    const offeringAnchor = stringValue(
      record?.offeringAnchor ?? record?.offering_anchor,
    );
    const competitorAnchor = stringValue(
      record?.competitorAnchor ?? record?.competitor_anchor,
    );
    const qaIntent = stringValue(record?.qaIntent ?? record?.qa_intent);
    const questionEnglish = stringValue(
      record?.questionEnglish ??
        record?.question_english ??
        record?.questionEn ??
        record?.question_en,
    )
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240);

    questions.push({
      id,
      category,
      question: displayQuestion,
      ...(questionEnglish.length >= 4 &&
      /[A-Za-z]/.test(questionEnglish) &&
      questionEnglish.endsWith("?")
        ? { questionEnglish }
        : {}),
      rationale: rationale.slice(0, 240),
      evidenceRefs,
      selectable: classification.selectable && displayQuestion.length >= 4,
      ...(enterpriseAnchor
        ? { enterpriseAnchor: enterpriseAnchor.slice(0, 120) }
        : {}),
      ...(offeringAnchor
        ? { offeringAnchor: offeringAnchor.slice(0, 120) }
        : {}),
      ...(competitorAnchor
        ? { competitorAnchor: competitorAnchor.slice(0, 120) }
        : {}),
      ...(PRODUCT_QA_INTENTS.includes(
        qaIntent as (typeof PRODUCT_QA_INTENTS)[number],
      )
        ? { qaIntent: qaIntent as (typeof PRODUCT_QA_INTENTS)[number] }
        : {}),
    });
  }

  return questions.length ? { questions } : null;
}

function generatedQuestionCandidates(candidate: unknown): unknown[] | null {
  if (Array.isArray(candidate)) return candidate;
  const record = asRecord(candidate);
  if (!record) return null;
  for (const value of [
    record.questions,
    record.items,
    record.recommendations,
  ]) {
    if (Array.isArray(value)) return value;
  }
  const data = asRecord(record.data);
  if (Array.isArray(data?.questions)) return data.questions;
  return null;
}

function generatedQuestionText(
  item: unknown,
  record: Record<string, unknown> | null,
) {
  const value =
    typeof item === "string"
      ? stringValue(item)
      : stringValue(record?.question ?? record?.text ?? record?.title);
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeGeneratedQuestionClassification(
  value: unknown,
  idValue: unknown,
  question: string,
): { category: GeoQuestion["category"]; selectable: boolean } {
  // Ranking questions are permission-gated. Detect them from the visible text
  // before trusting category metadata supplied by the generator.
  if (isIndustryRankingQuestion(question))
    return { category: "industry_ranking", selectable: false };

  const id = stringValue(idValue).toLocaleLowerCase("en-US");
  const idCategory: GeoQuestion["category"] | undefined =
    /^reputation-\d{2}$/.test(id)
      ? "reputation"
      : /^product-scenario-\d{2}$/.test(id)
        ? "product_scenario"
        : /^industry-ranking-\d{2}$/.test(id)
          ? "industry_ranking"
          : /^competitor-comparison-\d{2}$/.test(id)
            ? "competitor_comparison"
            : undefined;

  const normalized = stringValue(value)
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s-]+/g, "_");
  const aliases: Record<string, GeoQuestion["category"]> = {
    reputation: "reputation",
    reputation_public_opinion: "reputation",
    public_opinion: "reputation",
    美誉舆情: "reputation",
    美誉度: "reputation",
    product_scenario: "product_scenario",
    product: "product_scenario",
    scenario: "product_scenario",
    qa: "product_scenario",
    产品场景: "product_scenario",
    产品优势: "product_scenario",
    industry_ranking: "industry_ranking",
    ranking: "industry_ranking",
    rank: "industry_ranking",
    行业排名: "industry_ranking",
    排名类: "industry_ranking",
    competitor_comparison: "competitor_comparison",
    comparison: "competitor_comparison",
    competitor: "competitor_comparison",
    竞品对比: "competitor_comparison",
  };
  const declaredCategory = Object.prototype.hasOwnProperty.call(
    aliases,
    normalized,
  )
    ? aliases[normalized]
    : undefined;
  if (idCategory && declaredCategory && idCategory !== declaredCategory)
    return { category: "industry_ranking", selectable: false };
  const category = idCategory ?? declaredCategory;
  if (category) {
    const exactDeclaredCategory =
      normalized === "reputation" ||
      normalized === "product_scenario" ||
      normalized === "industry_ranking" ||
      normalized === "competitor_comparison";
    return {
      category,
      selectable:
        category !== "industry_ranking" &&
        Boolean(idCategory || exactDeclaredCategory),
    };
  }

  // Unknown categories stay visible but locked rather than being assigned a
  // paid service category that could affect permissions or pricing.
  return { category: "industry_ranking", selectable: false };
}

function generatedQuestionId(
  category: GeoQuestion["category"],
  categoryIndex: number,
) {
  const prefixByCategory: Record<GeoQuestion["category"], string> = {
    reputation: "reputation",
    product_scenario: "product-scenario",
    industry_ranking: "industry-ranking",
    competitor_comparison: "competitor-comparison",
  };
  return `${prefixByCategory[category]}-${String(categoryIndex).padStart(
    2,
    "0",
  )}`;
}

function normalizeGeneratedEvidenceRefs(value: unknown) {
  const source = Array.isArray(value)
    ? value
    : value === undefined
      ? []
      : [value];
  const seen = new Set<string>();
  const refs: string[] = [];
  for (const item of source) {
    const record = asRecord(item);
    const reference = stringValue(
      typeof item === "string"
        ? item
        : (record?.path ??
            record?.id ??
            record?.url ??
            record?.title ??
            record?.name),
    ).slice(0, 300);
    if (!reference || seen.has(reference)) continue;
    seen.add(reference);
    refs.push(reference);
    if (refs.length >= 8) break;
  }
  return refs;
}

function possibleJsonValues(value: string) {
  const trimmed = value.trim();
  const results = new Set<string>();
  if (!trimmed) return [];

  results.add(trimmed);
  for (const match of Array.from(
    trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi),
  )) {
    const fenced = match[1]?.trim();
    if (fenced) results.add(fenced);
  }
  for (const jsonValue of balancedJsonValues(trimmed)) {
    results.add(jsonValue);
  }
  return Array.from(results);
}

/**
 * Extract complete outer JSON objects/arrays from assistant prose. A balanced
 * value is consumed as one unit, so an array nested inside an object (for
 * example evidenceRefs) can never be mistaken for a top-level question list.
 */
function balancedJsonValues(value: string) {
  const results: string[] = [];
  let cursor = 0;

  while (cursor < value.length && results.length < 50) {
    const objectStart = value.indexOf("{", cursor);
    const arrayStart = value.indexOf("[", cursor);
    const starts = [objectStart, arrayStart].filter((index) => index >= 0);
    if (!starts.length) break;
    const start = Math.min(...starts);
    const end = balancedJsonValueEnd(value, start);
    if (end === null) {
      cursor = start + 1;
      continue;
    }
    results.push(value.slice(start, end + 1));
    cursor = end + 1;
  }

  return results;
}

function balancedJsonValueEnd(value: string, start: number) {
  const opening = value[start];
  if (opening !== "{" && opening !== "[") return null;
  const expectedClosers = [opening === "{" ? "}" : "]"];
  let inString = false;
  let escaped = false;

  for (let index = start + 1; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{" || character === "[") {
      expectedClosers.push(character === "{" ? "}" : "]");
      continue;
    }
    if (character !== "}" && character !== "]") continue;
    if (expectedClosers.at(-1) !== character) return null;
    expectedClosers.pop();
    if (!expectedClosers.length) return index;
  }

  return null;
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
