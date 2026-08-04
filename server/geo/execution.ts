import type { BrokerMonitorRun, BrokerTask } from "./broker";
import {
  GEO_CRAWL_PROGRESS_MARKER,
  geoCrawlProgressSummary,
  parseTrustedGeoCrawlProgress,
  type GeoCrawlProgress,
} from "./crawl-progress";
import { normalizeTask, type NormalizedTaskStatus } from "./output";

export type GeoExecutionStatus =
  | "queued"
  | "running"
  | "waiting"
  | "partial_review"
  | "completed"
  | "failed"
  | "unknown";

export type GeoExecutionEventKind =
  | "status"
  | "model_output"
  | "result_summary"
  | "progress_summary"
  | "artifact"
  | "poll"
  | "error";

export type GeoExecutionEvent = {
  id: string;
  kind: GeoExecutionEventKind;
  message: string;
  createdAt?: string;
};

export type GeoExecutionCounters = {
  completed: number;
  failed: number;
  total: number;
};

export type GeoExecutionLogEntry = {
  id: string;
  stage:
    | "enterprise_analysis"
    | "question_recommendation"
    | "monitoring"
    | "current_assessment"
    | "service_activation";
  title: string;
  status: GeoExecutionStatus;
  progress?: number;
  startedAt?: string;
  updatedAt?: string;
  completedAt?: string;
  nextPollAt?: string;
  counters?: GeoExecutionCounters;
  crawlProgress?: GeoCrawlProgress;
  events: GeoExecutionEvent[];
};

export type GeoExecutionLog = {
  currentEntryId?: string;
  fetchedAt: string;
  updatedAt: string;
  entries: GeoExecutionLogEntry[];
};

type ValidatedExecutionResults = {
  knowledgeBaseSummary?: string;
  knowledgeBaseArchiveName?: string;
  questionCount?: number;
  assessmentSummary?: string;
  assessmentReady?: boolean;
  assessmentFailureCode?: string;
  comparisonCount?: number;
  forecastSummary?: string;
  forecastReady?: boolean;
  serviceActivatedAt?: string;
};

type BuildGeoExecutionLogInput = {
  knowledgeBaseTask: BrokerTask;
  questionTask?: BrokerTask;
  monitorRun?: BrokerMonitorRun;
  assessmentTask?: BrokerTask;
  optimizationForecastTask?: BrokerTask;
  validated?: ValidatedExecutionResults;
  submittedAt?: {
    knowledgeBase?: string;
    question?: string;
    assessment?: string;
    optimizationForecast?: string;
  };
  now?: Date;
};

const MAX_MODEL_EVENTS = 5;
const MAX_EVENT_LENGTH = 2_000;

export function buildGeoExecutionLog(
  input: BuildGeoExecutionLogInput,
): GeoExecutionLog {
  const entries: GeoExecutionLogEntry[] = [
    taskEntry({
      id: "enterprise-analysis",
      stage: "enterprise_analysis",
      title: "企业分析",
      task: input.knowledgeBaseTask,
      publicTaskId: "knowledge-base",
      resultSummary: input.validated?.knowledgeBaseSummary,
      artifactName: input.validated?.knowledgeBaseArchiveName,
      fallbackStartedAt: input.submittedAt?.knowledgeBase,
      includeCrawlProgress: true,
    }),
  ];

  if (input.questionTask) {
    entries.push(
      taskEntry({
        id: "question-recommendation",
        stage: "question_recommendation",
        title: "问题推荐",
        task: input.questionTask,
        publicTaskId: "questions",
        resultSummary:
          Number.isSafeInteger(input.validated?.questionCount) &&
          Number(input.validated?.questionCount) > 0
            ? `已完成 ${input.validated?.questionCount} 道 GEO 优化问题的生成与结构校验。`
            : undefined,
        fallbackStartedAt: input.submittedAt?.question,
      }),
    );
  }

  if (input.monitorRun) entries.push(monitorEntry(input.monitorRun));

  if (input.assessmentTask) {
    entries.push(
      taskEntry({
        id: "current-assessment",
        stage: "current_assessment",
        title: "现状评估与知识核查",
        task: input.assessmentTask,
        publicTaskId: "assessment",
        resultSummary: input.validated?.assessmentReady
          ? assessmentResultSummary(
              input.validated.assessmentSummary,
              input.validated.comparisonCount,
            )
          : undefined,
        validationFailureCode: input.validated?.assessmentFailureCode,
        fallbackStartedAt: input.submittedAt?.assessment,
      }),
    );
  }

  if (input.optimizationForecastTask) {
    entries.push(
      taskEntry({
        id: "optimization-forecast",
        stage: "current_assessment",
        title: "优化效果评估",
        task: input.optimizationForecastTask,
        publicTaskId: "optimization-forecast",
        resultSummary: input.validated?.forecastReady
          ? input.validated.forecastSummary
          : undefined,
        fallbackStartedAt: input.submittedAt?.optimizationForecast,
      }),
    );
  }

  if (input.validated?.serviceActivatedAt) {
    const activatedAt = timestampValue(input.validated.serviceActivatedAt);
    entries.push({
      id: "service-activation",
      stage: "service_activation",
      title: "服务订单确认",
      status: "completed",
      progress: 100,
      ...(activatedAt
        ? {
            startedAt: activatedAt,
            updatedAt: activatedAt,
            completedAt: activatedAt,
          }
        : {}),
      events: [
        {
          id: "service-activation-status",
          kind: "status",
          message: "月度 GEO 优化服务订单已确认。",
          ...(activatedAt ? { createdAt: activatedAt } : {}),
        },
      ],
    });
  }

  // The router creates these units strictly in pipeline order, so the last
  // created unit is authoritative even if an older snapshot is ambiguous.
  const currentEntry = entries.at(-1);

  const fetchedAt = (input.now ?? new Date()).toISOString();
  return {
    ...(currentEntry ? { currentEntryId: currentEntry.id } : {}),
    fetchedAt,
    updatedAt: fetchedAt,
    entries,
  };
}

type TaskEntryInput = {
  id: string;
  stage: GeoExecutionLogEntry["stage"];
  title: string;
  task: BrokerTask;
  publicTaskId:
    | "knowledge-base"
    | "questions"
    | "assessment"
    | "optimization-forecast";
  resultSummary?: string;
  validationFailureCode?: string;
  artifactName?: string;
  fallbackStartedAt?: string;
  includeCrawlProgress?: boolean;
};

function taskEntry(input: TaskEntryInput): GeoExecutionLogEntry {
  const taskView = normalizeTask(input.task, input.publicTaskId);
  const upstreamStatus = publicTaskStatus(taskView.status);
  const validationFailureCode =
    upstreamStatus === "completed"
      ? safeValidationFailureCode(input.validationFailureCode)
      : undefined;
  const status = validationFailureCode ? "failed" : upstreamStatus;
  const startedAt = timestampValue(
    input.task.started_at,
    input.task.startedAt,
    input.task.created_at,
    input.task.createdAt,
    asRecord(input.task.metadata).started_at,
    asRecord(input.task.metadata).created_at,
    input.fallbackStartedAt,
  );
  const crawlProgress = input.includeCrawlProgress
    ? parseTrustedGeoCrawlProgress(input.task)
    : undefined;
  const updatedAt = latestTimestamp([
    timestampValue(
      input.task.updated_at,
      input.task.updatedAt,
      asRecord(input.task.metadata).updated_at,
      asRecord(input.task.metadata).updatedAt,
    ),
    crawlProgress?.reportedAt,
  ]);
  const completedAt = timestampValue(
    input.task.completed_at,
    input.task.completedAt,
    input.task.finished_at,
    input.task.finishedAt,
    asRecord(input.task.metadata).completed_at,
    asRecord(input.task.metadata).completedAt,
  );
  const terminalAt =
    status === "completed" || status === "failed"
      ? (completedAt ?? updatedAt)
      : completedAt;
  const eventTime =
    upstreamStatus === "completed"
      ? terminalAt
      : upstreamStatus === "queued"
        ? startedAt
        : (updatedAt ?? startedAt);
  const events: GeoExecutionEvent[] = [
    {
      id: `${input.id}-status-${upstreamStatus}`,
      kind: upstreamStatus === "failed" ? "error" : "status",
      message:
        upstreamStatus === "failed" && taskView.error
          ? limitText(taskView.error)
          : validationFailureCode
            ? `${input.title}上游任务已完成。`
            : taskStatusMessage(input.title, upstreamStatus),
      ...(eventTime ? { createdAt: eventTime } : {}),
    },
  ];

  safeAssistantOutputTexts(input.task).forEach((modelOutput, index) => {
    events.push({
      id: `${input.id}-model-${index + 1}`,
      kind: "model_output",
      message: modelOutput.text,
      ...(modelOutput.createdAt ? { createdAt: modelOutput.createdAt } : {}),
    });
  });
  if (validationFailureCode) {
    events.push({
      id: `${input.id}-validation-failed`,
      kind: "error",
      message: `服务端结果校验未通过（支持码：${validationFailureCode}）。`,
      ...(terminalAt ? { createdAt: terminalAt } : {}),
    });
  }
  if (crawlProgress) {
    events.push({
      id: `${input.id}-crawl-progress-${crawlProgress.reportedAt}`,
      kind: "progress_summary",
      message: geoCrawlProgressSummary(crawlProgress),
      createdAt: crawlProgress.reportedAt,
    });
  }

  const resultSummary = safeSummary(input.resultSummary);
  if (status === "completed" && resultSummary) {
    events.push({
      id: `${input.id}-result`,
      kind: "result_summary",
      message: resultSummary,
      ...((completedAt ?? updatedAt) ? { createdAt: terminalAt } : {}),
    });
  }

  const artifactName = safeArtifactName(input.artifactName);
  if (status === "completed" && artifactName) {
    events.push({
      id: `${input.id}-artifact`,
      kind: "artifact",
      message: `已生成知识库归档：${artifactName}`,
      ...((completedAt ?? updatedAt) ? { createdAt: terminalAt } : {}),
    });
  }

  return {
    id: input.id,
    stage: input.stage,
    title: input.title,
    status,
    ...(typeof taskView.progress === "number"
      ? { progress: clampPercent(taskView.progress) }
      : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    ...(terminalAt ? { completedAt: terminalAt } : {}),
    ...(crawlProgress ? { crawlProgress } : {}),
    events: deduplicateEvents(events),
  };
}

function safeValidationFailureCode(value: unknown): string | undefined {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return [
    "OUTPUT_FILE_UNAVAILABLE",
    "INVALID_JSON",
    "SCHEMA_MISMATCH",
    "SCOPE_MISMATCH",
  ].includes(code)
    ? code
    : undefined;
}

function monitorEntry(run: BrokerMonitorRun): GeoExecutionLogEntry {
  const status = monitorStatus(run.status);
  const startedAt = timestampValue(run.submittedAt);
  const nextPollAt = timestampValue(run.nextPollAt);
  const completedAt = latestTimestamp(
    run.records?.map((record) => record.completedAt) ?? [],
  );
  const total = Math.max(0, run.expectedItems);
  const completed = Math.max(0, Math.min(total, run.completedItems));
  const failed = Math.max(
    0,
    Math.min(Math.max(0, total - completed), run.failedItems),
  );
  const finished = Math.min(total, completed + failed);
  const progress =
    total > 0
      ? clampPercent((finished / total) * 100)
      : status === "completed"
        ? 100
        : 0;
  const eventTime =
    status === "completed" ? (completedAt ?? startedAt) : startedAt;
  const events: GeoExecutionEvent[] = [
    {
      id: `monitoring-status-${status}`,
      kind: status === "failed" ? "error" : "status",
      message:
        status === "failed" && run.error
          ? limitText(run.error)
          : monitorStatusMessage(status),
      ...(eventTime ? { createdAt: eventTime } : {}),
    },
    {
      id: "monitoring-counts",
      kind: "result_summary",
      message: `已完成 ${completed}/${total} 次平台回答采集${failed > 0 ? `，${failed} 次未成功` : ""}。`,
      ...(completedAt ? { createdAt: completedAt } : {}),
    },
  ];
  if (nextPollAt && ["running", "waiting"].includes(status)) {
    events.push({
      id: `monitoring-poll-${nextPollAt}`,
      kind: "poll",
      message: "监控服务已安排下一次远端状态核查。",
    });
  }

  return {
    id: "monitoring",
    stage: "monitoring",
    title: "问题监控",
    status,
    progress,
    ...(startedAt ? { startedAt } : {}),
    ...(completedAt ? { updatedAt: completedAt, completedAt } : {}),
    ...(nextPollAt ? { nextPollAt } : {}),
    counters: { completed, failed, total },
    events,
  };
}

function safeAssistantOutputTexts(task: BrokerTask): Array<{
  text: string;
  createdAt?: string;
}> {
  const results: Array<{ text: string; createdAt?: string }> = [];
  const seen = new Set<string>();

  const addOutputText = (value: unknown, inheritedAt?: string) => {
    const record = asRecord(value);
    if (stringValue(record.type)?.toLowerCase() !== "output_text") return;
    const text = safeModelText(record.text);
    if (!text || seen.has(text)) return;
    const createdAt =
      timestampValue(record.created_at, record.createdAt, record.timestamp) ??
      inheritedAt;
    seen.add(text);
    results.push({ text, ...(createdAt ? { createdAt } : {}) });
  };

  const visit = (value: unknown, depth: number) => {
    if (depth > 12 || results.length >= MAX_MODEL_EVENTS) return;
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item, depth + 1);
        if (results.length >= MAX_MODEL_EVENTS) break;
      }
      return;
    }
    const record = asRecord(value);
    if (Object.keys(record).length === 0) return;

    const role = stringValue(record.role)?.toLowerCase();
    const createdAt = timestampValue(
      record.created_at,
      record.createdAt,
      record.timestamp,
    );
    const type = stringValue(record.type)?.toLowerCase();
    if (role === "assistant") {
      if (type === "output_text") addOutputText(record, createdAt);
      const content = record.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          addOutputText(item, createdAt);
          if (results.length >= MAX_MODEL_EVENTS) break;
        }
      }
      return;
    }

    // Only these vendor envelope keys may contain assistant messages. Do not
    // recursively inspect metadata, prompts, tool payloads, or reasoning.
    for (const key of ["output", "messages", "items", "data", "result"]) {
      visit(record[key], depth + 1);
      if (results.length >= MAX_MODEL_EVENTS) break;
    }
  };

  visit(task.output, 0);
  return results;
}

function safeModelText(value: unknown): string | undefined {
  const text = stringValue(value);
  if (
    !text ||
    text.includes(GEO_CRAWL_PROGRESS_MARKER) ||
    looksLikeStructuredPayload(text)
  )
    return undefined;
  return limitText(text);
}

function safeSummary(value: unknown): string | undefined {
  const text = stringValue(value);
  if (!text || looksLikeStructuredPayload(text)) return undefined;
  return limitText(text);
}

function safeArtifactName(value: unknown): string | undefined {
  const text = stringValue(value);
  if (!text) return undefined;
  return text.replace(/[\\/\0\r\n]/g, "_").slice(0, 300);
}

function looksLikeStructuredPayload(value: string) {
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) return false;
  try {
    JSON.parse(cleaned);
    return true;
  } catch {
    return cleaned.length > 500;
  }
}

function taskStatusMessage(title: string, status: GeoExecutionStatus) {
  if (status === "queued") return `${title}任务已创建，正在等待执行。`;
  if (status === "running") return `${title}正在执行。`;
  if (status === "completed") return `${title}已完成。`;
  if (status === "failed") return `${title}执行未成功。`;
  return `${title}任务已提交，正在同步执行状态。`;
}

function monitorStatusMessage(status: GeoExecutionStatus) {
  if (status === "running") return "平台回答采集正在进行。";
  if (status === "waiting") return "监控任务正在等待下一次核查或人工确认。";
  if (status === "partial_review")
    return "平台回答已返回部分结果，正在等待确认。";
  if (status === "completed") return "平台回答采集已完成。";
  if (status === "failed") return "平台回答采集未成功。";
  return "监控任务状态暂时无法识别。";
}

function publicTaskStatus(status: NormalizedTaskStatus): GeoExecutionStatus {
  if (status === "queued") return "queued";
  if (status === "running") return "running";
  if (status === "completed") return "completed";
  if (status === "failed" || status === "cancelled") return "failed";
  return "waiting";
}

function monitorStatus(status: BrokerMonitorRun["status"]): GeoExecutionStatus {
  if (["submission_in_progress", "submitted", "polling"].includes(status))
    return "running";
  if (status === "submission_unknown") return "waiting";
  if (status === "partial_review_required") return "partial_review";
  if (status === "completed") return "completed";
  if (["remote_failed", "shape_mismatch"].includes(status)) return "failed";
  return "unknown";
}

function assessmentResultSummary(
  summary: string | undefined,
  comparisonCount: number | undefined,
) {
  const safe = safeSummary(summary);
  if (!safe) return undefined;
  if (!Number.isSafeInteger(comparisonCount) || Number(comparisonCount) < 0)
    return safe;
  return `${safe}\n已完成 ${comparisonCount} 项知识事实与平台回答核查。`;
}

function deduplicateEvents(events: GeoExecutionEvent[]) {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${event.kind}:${event.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function latestTimestamp(values: unknown[]) {
  return values
    .flatMap((value) => {
      const timestamp = timestampValue(value);
      return timestamp ? [timestamp] : [];
    })
    .sort()
    .at(-1);
}

function timestampValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    const normalized =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim()
          ? /^\d{10,13}$/.test(value.trim())
            ? Number(value.trim())
            : value.trim()
          : undefined;
    if (normalized === undefined) continue;
    const timestamp =
      typeof normalized === "number"
        ? normalized < 100_000_000_000
          ? normalized * 1000
          : normalized
        : Date.parse(normalized);
    if (!Number.isFinite(timestamp)) continue;
    return new Date(timestamp).toISOString();
  }
  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function limitText(value: string) {
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  return normalized.length <= MAX_EVENT_LENGTH
    ? normalized
    : `${normalized.slice(0, MAX_EVENT_LENGTH - 1)}…`;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
