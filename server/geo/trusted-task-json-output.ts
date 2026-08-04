import { TextDecoder } from "node:util";
import type { GeoPresalesBroker } from "./broker";
import { assertResponseLengthWithinLimit, GeoByteLimitError } from "./streams";
import {
  trustedAssistantOutputFiles,
  type TrustedAssistantOutputFile,
} from "./trusted-task-output";

export const TRUSTED_TASK_JSON_MAX_CANDIDATES = 3;
export const TRUSTED_TASK_JSON_MAX_FILE_CANDIDATES =
  TRUSTED_TASK_JSON_MAX_CANDIDATES;
export const TRUSTED_TASK_JSON_MAX_TOTAL_BYTES = 4 * 1024 * 1024;

export type TrustedTaskJsonOutputValidationCode =
  | "OUTPUT_FILE_UNAVAILABLE"
  | "INVALID_JSON"
  | "SCHEMA_MISMATCH"
  | "SCOPE_MISMATCH";

export type TrustedTaskJsonOutputDiagnostics = Readonly<{
  channel: "inline" | "output_file";
  byteCount: number;
  fileCandidateCount: number;
}>;

const SAFE_ERROR_MESSAGES: Record<TrustedTaskJsonOutputValidationCode, string> =
  {
    OUTPUT_FILE_UNAVAILABLE: "Trusted task output file is unavailable",
    INVALID_JSON: "Trusted task output did not contain valid JSON",
    SCHEMA_MISMATCH: "Trusted task output JSON did not match the schema",
    SCOPE_MISMATCH: "Trusted task output JSON did not match the request scope",
  };

export class TrustedTaskJsonOutputError extends Error {
  readonly name = "TrustedTaskJsonOutputError";
  readonly validation?: unknown;
  readonly diagnostics?: TrustedTaskJsonOutputDiagnostics;

  constructor(
    readonly code: TrustedTaskJsonOutputValidationCode,
    validation?: unknown,
    diagnostics?: TrustedTaskJsonOutputDiagnostics,
  ) {
    super(SAFE_ERROR_MESSAGES[code]);
    Object.defineProperty(this, "validation", {
      configurable: false,
      enumerable: false,
      value: validation,
      writable: false,
    });
    Object.defineProperty(this, "diagnostics", {
      configurable: false,
      enumerable: false,
      value: diagnostics,
      writable: false,
    });
  }
}

export type TrustedTaskJsonCandidateInspection<T> =
  | Readonly<{ success: true; data: T }>
  | Readonly<{
      success: false;
      code: TrustedTaskJsonOutputValidationCode;
      validation?: unknown;
    }>;

type TrustedTaskOutputDownloader = Pick<
  GeoPresalesBroker,
  "downloadFile" | "downloadTaskOutput"
>;

export type TrustedTaskJsonInlineInspectionContext = Readonly<{
  canInspectText: (value: string) => boolean;
  takeCandidate: (value: unknown) => boolean;
}>;

export type ResolveTrustedTaskJsonOutputOptions<T> = Readonly<{
  taskId?: string;
  preferredChannel?: "inline" | "output_file";
  inspectInline: (
    task: unknown,
    context: TrustedTaskJsonInlineInspectionContext,
  ) => TrustedTaskJsonCandidateInspection<T> | undefined;
  inspectParsed: (value: unknown) => TrustedTaskJsonCandidateInspection<T>;
}>;

type CandidateFailure = Readonly<{
  code: TrustedTaskJsonOutputValidationCode;
  validation?: unknown;
  channel: "inline" | "output_file";
}>;

const FAILURE_PRIORITY: Record<TrustedTaskJsonOutputValidationCode, number> = {
  OUTPUT_FILE_UNAVAILABLE: 1,
  INVALID_JSON: 2,
  SCHEMA_MISMATCH: 3,
  SCOPE_MISMATCH: 4,
};

function bestFailure(failures: readonly CandidateFailure[]) {
  return failures.reduce<CandidateFailure | undefined>((best, failure) => {
    if (!best || FAILURE_PRIORITY[failure.code] > FAILURE_PRIORITY[best.code]) {
      return failure;
    }
    return best;
  }, undefined);
}

function taskIdFrom(task: unknown, explicitTaskId?: string) {
  if (explicitTaskId?.trim()) return explicitTaskId.trim();
  if (!task || typeof task !== "object" || Array.isArray(task)) return "";
  const record = task as Record<string, unknown>;
  for (const value of [record.id, record.task_id]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

async function unavailableResponse(response: Response) {
  if (response.ok) return false;
  await response.body?.cancel().catch(() => undefined);
  return true;
}

function trustedOutputFileDownloaders(
  downloader: TrustedTaskOutputDownloader,
  descriptor: TrustedAssistantOutputFile,
  taskId: string,
) {
  const sources: Array<() => Promise<Response | undefined>> = [];
  if (descriptor.fileId) {
    sources.push(async () => {
      try {
        const response = await downloader.downloadFile(descriptor.fileId!);
        return (await unavailableResponse(response)) ? undefined : response;
      } catch {
        return undefined;
      }
    });
  }
  if (descriptor.url && taskId) {
    sources.push(async () => {
      try {
        const response = await downloader.downloadTaskOutput(
          taskId,
          descriptor.url!,
          descriptor.filename,
        );
        return (await unavailableResponse(response)) ? undefined : response;
      } catch {
        return undefined;
      }
    });
  }
  return sources;
}

function parseStrictUtf8Json(bytes: Buffer) {
  const withoutBom =
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
      ? bytes.subarray(3)
      : bytes;
  const text = new TextDecoder("utf-8", { fatal: true }).decode(withoutBom);
  return JSON.parse(text) as unknown;
}

async function readResponseWithinSharedBudget(
  response: Response,
  budget: { remaining: number },
) {
  assertResponseLengthWithinLimit(response, budget.remaining);
  if (!response.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      if (value.byteLength > budget.remaining) {
        budget.remaining = 0;
        await reader.cancel().catch(() => undefined);
        throw new GeoByteLimitError(TRUSTED_TASK_JSON_MAX_TOTAL_BYTES);
      }
      budget.remaining -= value.byteLength;
      received += value.byteLength;
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, received);
}

function candidateByteLength(value: unknown) {
  if (typeof value === "string") return Buffer.byteLength(value, "utf8");
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string"
      ? Buffer.byteLength(serialized, "utf8")
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolves a task's preferred channel first, with a safe fallback to the
 * other channel. Inline JSON and trusted output_file candidates share a
 * three-candidate, four-MiB budget. Files must be complete strict UTF-8 JSON.
 * The first candidate in channel order passing schema and scope wins.
 */
export async function resolveTrustedTaskJsonOutput<T>(
  downloader: TrustedTaskOutputDownloader,
  task: unknown,
  options: ResolveTrustedTaskJsonOutputOptions<T>,
): Promise<T> {
  const failures: CandidateFailure[] = [];
  const preferOutputFile = options.preferredChannel === "output_file";
  const budget = {
    remaining: TRUSTED_TASK_JSON_MAX_TOTAL_BYTES,
    remainingCandidates: TRUSTED_TASK_JSON_MAX_CANDIDATES,
  };
  const inlineContext: TrustedTaskJsonInlineInspectionContext = {
    canInspectText(value) {
      if (budget.remainingCandidates <= 0) return false;
      if (Buffer.byteLength(value, "utf8") <= budget.remaining) return true;
      budget.remainingCandidates -= 1;
      budget.remaining = 0;
      return false;
    },
    takeCandidate(value) {
      if (budget.remainingCandidates <= 0) return false;
      budget.remainingCandidates -= 1;
      const byteLength = candidateByteLength(value);
      if (byteLength === undefined || byteLength > budget.remaining) {
        budget.remaining = 0;
        return false;
      }
      budget.remaining -= byteLength;
      return true;
    },
  };
  let inlineInspected = false;
  let inline: TrustedTaskJsonCandidateInspection<T> | undefined;
  const resolveInline = () => {
    if (!inlineInspected) {
      inlineInspected = true;
      inline = options.inspectInline(task, inlineContext);
    }
    if (inline?.success) return inline.data;
    if (inline && !inline.success) {
      failures.push({
        code: inline.code,
        validation: inline.validation,
        channel: "inline",
      });
    }
    return undefined;
  };
  if (!preferOutputFile) {
    const resolvedInline = resolveInline();
    if (resolvedInline !== undefined) return resolvedInline;
  }

  const descriptors = trustedAssistantOutputFiles(task).slice(
    0,
    TRUSTED_TASK_JSON_MAX_FILE_CANDIDATES,
  );
  const resolvedTaskId = taskIdFrom(task, options.taskId);
  let readableFileCandidates = 0;
  let attemptedFileCandidates = 0;

  for (const descriptor of descriptors) {
    if (budget.remainingCandidates <= 0) break;
    budget.remainingCandidates -= 1;
    attemptedFileCandidates += 1;
    const downloaders = trustedOutputFileDownloaders(
      downloader,
      descriptor,
      resolvedTaskId,
    );
    let bytes: Buffer | undefined;
    let byteLimitReached = false;
    for (const download of downloaders) {
      if (budget.remaining <= 0) {
        byteLimitReached = true;
        break;
      }
      const response = await download();
      if (!response) continue;
      try {
        bytes = await readResponseWithinSharedBudget(response, budget);
        break;
      } catch (error) {
        await response.body?.cancel().catch(() => undefined);
        if (error instanceof GeoByteLimitError) {
          budget.remaining = 0;
          byteLimitReached = true;
          break;
        }
        // The task-bound provider URL may recover a truncated file_id body.
      }
    }
    if (!bytes) {
      failures.push({
        code: "OUTPUT_FILE_UNAVAILABLE",
        channel: "output_file",
      });
      if (byteLimitReached) break;
      continue;
    }
    readableFileCandidates += 1;

    let parsed: unknown;
    try {
      parsed = parseStrictUtf8Json(bytes);
    } catch {
      failures.push({ code: "INVALID_JSON", channel: "output_file" });
      continue;
    }

    const inspection = options.inspectParsed(parsed);
    if (inspection.success) return inspection.data;
    failures.push({
      code: inspection.code,
      validation: inspection.validation,
      channel: "output_file",
    });
  }

  if (preferOutputFile) {
    const resolvedInline = resolveInline();
    if (resolvedInline !== undefined) return resolvedInline;
  }

  const semanticFailure = bestFailure(
    failures.filter(
      (failure) =>
        failure.code === "SCOPE_MISMATCH" || failure.code === "SCHEMA_MISMATCH",
    ),
  );
  const failure = (attemptedFileCandidates > 0 && readableFileCandidates === 0
    ? (bestFailure(
        failures.filter(
          (candidate) =>
            candidate.channel === "output_file" &&
            candidate.code === "OUTPUT_FILE_UNAVAILABLE",
        ),
      ) ?? {
        code: "OUTPUT_FILE_UNAVAILABLE" as const,
        channel: "output_file" as const,
      })
    : (semanticFailure ?? bestFailure(failures))) ?? {
    code: "INVALID_JSON" as const,
    channel: "inline" as const,
  };
  throw new TrustedTaskJsonOutputError(failure.code, failure.validation, {
    channel: failure.channel,
    byteCount: TRUSTED_TASK_JSON_MAX_TOTAL_BYTES - budget.remaining,
    fileCandidateCount: descriptors.length,
  });
}
