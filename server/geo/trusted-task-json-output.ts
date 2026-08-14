import type { GeoPresalesBroker } from "./broker";

export const TRUSTED_TASK_JSON_MAX_CANDIDATES = 1;
export const TRUSTED_TASK_JSON_MAX_FILE_CANDIDATES = 0;
export const TRUSTED_TASK_JSON_MAX_TOTAL_BYTES = 4 * 1024 * 1024;
export const TRUSTED_TASK_JSON_MAX_QUOTE_REPAIRS = 0;
export const TRUSTED_TASK_JSON_MAX_NESTING_DEPTH = 128;
export const TRUSTED_TASK_JSON_PARSER_VERSION = 3 as const;

export type TrustedTaskJsonRepairKind = "strict";

export type ParsedTrustedTaskJsonCandidate = Readonly<{
  value: unknown;
  canonicalJson: string;
  repairKind: TrustedTaskJsonRepairKind;
}>;

export type TrustedTaskJsonOutputValidationCode =
  | "OUTPUT_FILE_UNAVAILABLE"
  | "INVALID_JSON"
  | "SCHEMA_MISMATCH"
  | "SCOPE_MISMATCH";

export type TrustedTaskJsonOutputDiagnostics = Readonly<{
  channel: "structured_result";
  byteCount: number;
  fileCandidateCount: 0;
}>;

const SAFE_ERROR_MESSAGES: Record<TrustedTaskJsonOutputValidationCode, string> =
  {
    OUTPUT_FILE_UNAVAILABLE: "Typed task result is unavailable",
    INVALID_JSON: "Typed task result is unavailable",
    SCHEMA_MISMATCH: "Typed task result did not match the schema",
    SCOPE_MISMATCH: "Typed task result did not match the request scope",
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

export type TrustedTaskJsonInlineInspectionContext = Readonly<{
  canInspectText: (value: string) => boolean;
  takeCandidate: (value: unknown) => boolean;
}>;

export type ResolveTrustedTaskJsonOutputOptions<T> = Readonly<{
  taskId?: string;
  canonicalize?: (value: T) => string;
  inspectParsed: (value: unknown) => TrustedTaskJsonCandidateInspection<T>;
}>;

/**
 * Strict parser retained only for local, already-bounded deterministic data
 * such as crawl-progress markers. Provider business results never use it.
 */
export function parseTrustedTaskJsonCandidate(value: string): unknown {
  if (
    typeof value !== "string" ||
    Buffer.byteLength(value, "utf8") > TRUSTED_TASK_JSON_MAX_TOTAL_BYTES
  ) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    return nestingDepth(parsed) <= TRUSTED_TASK_JSON_MAX_NESTING_DEPTH
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

export function inspectTrustedTaskJsonCandidate(
  value: string,
): ParsedTrustedTaskJsonCandidate | undefined {
  const parsed = parseTrustedTaskJsonCandidate(value);
  if (parsed === undefined) return undefined;
  return {
    value: parsed,
    canonicalJson: canonicalTrustedTaskJson(parsed),
    repairKind: "strict",
  };
}

export function trustedTaskJsonObjectCandidates(value: string) {
  return parseTrustedTaskJsonCandidate(value) === undefined
    ? []
    : [value.trim()];
}

export function canonicalTrustedTaskJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

/** Resolves only Dashboard's authenticated v2 typed business result. */
export async function resolveTrustedTaskJsonOutput<T>(
  _broker: Pick<GeoPresalesBroker, "downloadArtifact">,
  task: unknown,
  options: ResolveTrustedTaskJsonOutputOptions<T>,
): Promise<T> {
  const record = asRecord(task);
  const result = asRecord(record?.result);
  if (!result || !("structuredResult" in result)) {
    throw new TrustedTaskJsonOutputError("INVALID_JSON", undefined, {
      channel: "structured_result",
      byteCount: 0,
      fileCandidateCount: 0,
    });
  }
  const byteCount = serializedByteLength(result.structuredResult);
  if (byteCount === undefined || byteCount > TRUSTED_TASK_JSON_MAX_TOTAL_BYTES) {
    throw new TrustedTaskJsonOutputError("INVALID_JSON", undefined, {
      channel: "structured_result",
      byteCount: Math.min(byteCount ?? 0, TRUSTED_TASK_JSON_MAX_TOTAL_BYTES),
      fileCandidateCount: 0,
    });
  }
  const inspection = options.inspectParsed(result.structuredResult);
  if (inspection.success) return inspection.data;
  throw new TrustedTaskJsonOutputError(inspection.code, inspection.validation, {
    channel: "structured_result",
    byteCount,
    fileCandidateCount: 0,
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function serializedByteLength(value: unknown): number | undefined {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string"
      ? Buffer.byteLength(serialized, "utf8")
      : undefined;
  } catch {
    return undefined;
  }
}

function nestingDepth(value: unknown, depth = 0): number {
  if (!value || typeof value !== "object") return depth;
  if (depth > TRUSTED_TASK_JSON_MAX_NESTING_DEPTH) return depth;
  const children = Array.isArray(value)
    ? value
    : Object.values(value as Record<string, unknown>);
  return children.reduce(
    (maximum, child) => Math.max(maximum, nestingDepth(child, depth + 1)),
    depth,
  );
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortJson(child)]),
  );
}
