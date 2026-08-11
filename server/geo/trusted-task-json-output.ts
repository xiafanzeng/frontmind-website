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
export const TRUSTED_TASK_JSON_MAX_QUOTE_REPAIRS = 128;
export const TRUSTED_TASK_JSON_MAX_NESTING_DEPTH = 128;
export const TRUSTED_TASK_JSON_PARSER_VERSION = 2 as const;

export type TrustedTaskJsonRepairKind =
  | "strict"
  | "bom_or_wrapper"
  | "trailing_comma"
  | "string_syntax"
  | "double_encoded";

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
  canonicalize?: (value: T) => string;
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

/**
 * Returns bounded object candidates from one trusted assistant text item.
 * Callers remain responsible for enforcing the assistant-output trust boundary
 * and validating the parsed value against their complete schema and scope.
 */
export function trustedTaskJsonObjectCandidates(value: string) {
  if (Buffer.byteLength(value, "utf8") > TRUSTED_TASK_JSON_MAX_TOTAL_BYTES) {
    return [];
  }
  const stripped = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  if (!stripped) return [];

  const balancedCandidates: string[] = [];
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  const outerCandidate =
    firstBrace >= 0 && lastBrace > firstBrace
      ? stripped.slice(firstBrace, lastBrace + 1)
      : undefined;

  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (
    let index = 0;
    index < stripped.length && balancedCandidates.length < 8;
    index += 1
  ) {
    const character = stripped[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (character !== "}" || depth === 0) continue;
    depth -= 1;
    if (depth === 0 && start >= 0) {
      balancedCandidates.push(stripped.slice(start, index + 1));
      start = -1;
    }
  }

  const results = new Set<string>([stripped]);
  for (const candidate of balancedCandidates) {
    if (parseTrustedTaskJsonCandidate(candidate) !== undefined) {
      results.add(candidate);
    }
  }
  if (outerCandidate) results.add(outerCandidate);
  for (const candidate of balancedCandidates) results.add(candidate);
  return Array.from(results).slice(0, TRUSTED_TASK_JSON_MAX_CANDIDATES);
}

/**
 * Parses one already-bounded trusted JSON candidate. Strict JSON is always
 * preferred. Recovery is limited to unescaped ASCII quotes inside strings;
 * no keys, values, delimiters, or missing content are invented.
 */
export function parseTrustedTaskJsonCandidate(
  value: string,
): unknown | undefined {
  return inspectTrustedTaskJsonCandidate(value)?.value;
}

/**
 * Normalizes syntax only. It never supplies a field, delimiter, enum, boolean,
 * evidence path, or other business value. Callers must still run their strict
 * schema and scope/grounding checks after this function returns.
 */
export function inspectTrustedTaskJsonCandidate(
  value: string,
): ParsedTrustedTaskJsonCandidate | undefined {
  if (Buffer.byteLength(value, "utf8") > TRUSTED_TASK_JSON_MAX_TOTAL_BYTES) {
    return undefined;
  }

  const parse = (
    candidate: string,
    repairKind: TrustedTaskJsonRepairKind,
  ): ParsedTrustedTaskJsonCandidate | undefined => {
    try {
      const parsed = parseJsonWithoutDuplicateKeys(candidate);
      if (parsed === undefined) return undefined;
      if (typeof parsed === "string") {
        const decoded = parseOneDoubleEncodedJson(parsed);
        if (decoded === undefined) return undefined;
        return {
          value: decoded,
          canonicalJson: canonicalJson(decoded),
          repairKind: "double_encoded",
        };
      }
      return {
        value: parsed,
        canonicalJson: canonicalJson(parsed),
        repairKind,
      };
    } catch {
      return undefined;
    }
  };

  const strict = parse(value, "strict");
  if (strict) return strict;

  const stripped = stripTrustedJsonTransportWrapper(value);
  if (stripped !== value) {
    const wrapped = parse(stripped, "bom_or_wrapper");
    if (wrapped) return wrapped;
  }

  for (const candidate of Array.from(new Set([value, stripped]))) {
    const withoutTrailingCommas = removeJsonTrailingCommas(candidate);
    if (withoutTrailingCommas !== candidate) {
      const parsed = parse(withoutTrailingCommas, "trailing_comma");
      if (parsed) return parsed;
    }
    const repairedStrings = repairJsonStringSyntax(withoutTrailingCommas);
    if (!repairedStrings) continue;
    const parsed = parse(repairedStrings, "string_syntax");
    if (parsed) return parsed;
  }

  return undefined;
}

function stripTrustedJsonTransportWrapper(value: string) {
  const withoutBom = value.replace(/^\ufeff/, "").trim();
  const fenced = withoutBom.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? withoutBom).trim();
}

function parseOneDoubleEncodedJson(value: string) {
  if (Buffer.byteLength(value, "utf8") > TRUSTED_TASK_JSON_MAX_TOTAL_BYTES) {
    return undefined;
  }
  const candidate = stripTrustedJsonTransportWrapper(value);
  const strict = parseJsonWithoutDuplicateKeys(candidate);
  if (strict !== undefined) {
    return typeof strict === "string" ? undefined : strict;
  }
  const withoutTrailingCommas = removeJsonTrailingCommas(candidate);
  const trailingCommaNormalized = parseJsonWithoutDuplicateKeys(
    withoutTrailingCommas,
  );
  if (trailingCommaNormalized !== undefined) {
    return typeof trailingCommaNormalized === "string"
      ? undefined
      : trailingCommaNormalized;
  }
  const repaired = repairJsonStringSyntax(withoutTrailingCommas);
  if (!repaired) return undefined;
  try {
    const parsed = parseJsonWithoutDuplicateKeys(repaired);
    if (parsed === undefined) return undefined;
    return typeof parsed === "string" ? undefined : parsed;
  } catch {
    return undefined;
  }
}

/**
 * JSON.parse silently keeps the last value for duplicate object keys. Model
 * output must never get that ambiguity: a repeated decision, evidence list,
 * request digest, or nested field is rejected before object construction.
 * This scanner validates the complete JSON grammar with bounded nesting and
 * decodes object keys so escaped aliases such as `a` and `\u0061` collide.
 */
function parseJsonWithoutDuplicateKeys(value: string): unknown | undefined {
  let index = 0;
  let duplicateKey = false;

  const skipWhitespace = () => {
    while (
      index < value.length &&
      /[\u0009\u000a\u000d\u0020]/.test(value[index]!)
    ) {
      index += 1;
    }
  };

  const parseString = () => {
    if (value[index] !== '"') throw new SyntaxError("Expected JSON string");
    const start = index;
    index += 1;
    while (index < value.length) {
      const character = value[index]!;
      if (character === '"') {
        index += 1;
        const parsed = JSON.parse(value.slice(start, index)) as unknown;
        if (typeof parsed !== "string") throw new SyntaxError("Invalid string");
        return parsed;
      }
      if (character.charCodeAt(0) < 0x20) {
        throw new SyntaxError("Unescaped JSON control character");
      }
      if (character !== "\\") {
        index += 1;
        continue;
      }
      index += 1;
      const escaped = value[index];
      if (
        !escaped ||
        !['"', "\\", "/", "b", "f", "n", "r", "t", "u"].includes(escaped)
      ) {
        throw new SyntaxError("Invalid JSON escape");
      }
      index += 1;
      if (escaped === "u") {
        const hex = value.slice(index, index + 4);
        if (!/^[a-fA-F0-9]{4}$/.test(hex)) {
          throw new SyntaxError("Invalid JSON unicode escape");
        }
        index += 4;
      }
    }
    throw new SyntaxError("Unterminated JSON string");
  };

  const parseValue = (depth: number): void => {
    if (depth > TRUSTED_TASK_JSON_MAX_NESTING_DEPTH) {
      throw new SyntaxError("JSON nesting limit exceeded");
    }
    skipWhitespace();
    const character = value[index];
    if (character === '"') {
      parseString();
      return;
    }
    if (character === "{") {
      index += 1;
      skipWhitespace();
      const keys = new Set<string>();
      if (value[index] === "}") {
        index += 1;
        return;
      }
      while (index < value.length) {
        skipWhitespace();
        const key = parseString();
        if (keys.has(key)) duplicateKey = true;
        keys.add(key);
        skipWhitespace();
        if (value[index] !== ":") throw new SyntaxError("Expected colon");
        index += 1;
        parseValue(depth + 1);
        skipWhitespace();
        if (value[index] === "}") {
          index += 1;
          return;
        }
        if (value[index] !== ",") throw new SyntaxError("Expected comma");
        index += 1;
      }
      throw new SyntaxError("Unterminated JSON object");
    }
    if (character === "[") {
      index += 1;
      skipWhitespace();
      if (value[index] === "]") {
        index += 1;
        return;
      }
      while (index < value.length) {
        parseValue(depth + 1);
        skipWhitespace();
        if (value[index] === "]") {
          index += 1;
          return;
        }
        if (value[index] !== ",") throw new SyntaxError("Expected comma");
        index += 1;
      }
      throw new SyntaxError("Unterminated JSON array");
    }
    for (const literal of ["true", "false", "null"]) {
      if (value.startsWith(literal, index)) {
        index += literal.length;
        return;
      }
    }
    const number = value
      .slice(index)
      .match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)?.[0];
    if (!number) throw new SyntaxError("Invalid JSON value");
    index += number.length;
  };

  try {
    skipWhitespace();
    parseValue(0);
    skipWhitespace();
    if (index !== value.length || duplicateKey) return undefined;
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function canonicalJson(value: unknown) {
  return JSON.stringify(sortJsonValue(value));
}

export function canonicalTrustedTaskJson(value: unknown) {
  return canonicalJson(value);
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortJsonValue(child)]),
  );
}

function removeJsonTrailingCommas(value: string) {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (inString) {
      result += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      result += character;
      continue;
    }
    if (character === ",") {
      let next = index + 1;
      while (next < value.length && /\s/.test(value[next]!)) next += 1;
      if (["}", "]"].includes(value[next] || "")) continue;
    }
    result += character;
  }
  return result;
}

function repairJsonStringSyntax(value: string) {
  let result = "";
  let inString = false;
  let escaped = false;
  let repairCount = 0;
  let stringIsObjectKey = false;
  let stringContainerType: "object" | "array" | undefined;
  const containers: Array<{
    type: "object" | "array";
    expectsKey: boolean;
  }> = [];

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (!inString) {
      result += character;
      const container = containers.at(-1);
      if (character === '"') {
        inString = true;
        stringIsObjectKey =
          container?.type === "object" && container.expectsKey;
        stringContainerType = container?.type;
      } else if (character === "{") {
        containers.push({ type: "object", expectsKey: true });
      } else if (character === "[") {
        containers.push({ type: "array", expectsKey: false });
      } else if (character === ":" && container?.type === "object") {
        container.expectsKey = false;
      } else if (character === "," && container?.type === "object") {
        container.expectsKey = true;
      } else if (
        (character === "}" && container?.type === "object") ||
        (character === "]" && container?.type === "array")
      ) {
        containers.pop();
      }
      continue;
    }
    if (escaped) {
      result += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      result += character;
      escaped = true;
      continue;
    }
    if (character !== '"') {
      if (character.charCodeAt(0) < 0x20) {
        repairCount += 1;
        if (repairCount > TRUSTED_TASK_JSON_MAX_QUOTE_REPAIRS) return undefined;
        result +=
          character === "\n"
            ? "\\n"
            : character === "\r"
              ? "\\r"
              : character === "\t"
                ? "\\t"
                : `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`;
        continue;
      }
      result += character;
      continue;
    }

    let nextIndex = index + 1;
    while (
      nextIndex < value.length &&
      [" ", "\t", "\n", "\r"].includes(value[nextIndex])
    ) {
      nextIndex += 1;
    }
    const nextCharacter = value[nextIndex];
    let characterAfterComma = "";
    if (nextCharacter === ",") {
      let afterCommaIndex = nextIndex + 1;
      while (
        afterCommaIndex < value.length &&
        [" ", "\t", "\n", "\r"].includes(value[afterCommaIndex])
      ) {
        afterCommaIndex += 1;
      }
      characterAfterComma = value[afterCommaIndex] || "";
    }
    const commaCanFollowValue =
      nextCharacter === "," &&
      (stringContainerType === "object"
        ? characterAfterComma === '"'
        : stringContainerType === "array"
          ? ['"', "{", "[", "-"].includes(characterAfterComma) ||
            /^\d$/.test(characterAfterComma) ||
            ["t", "f", "n"].includes(characterAfterComma)
          : false);
    const isStructuralQuote = stringIsObjectKey
      ? nextCharacter === ":"
      : nextIndex === value.length ||
        commaCanFollowValue ||
        (nextCharacter === "}" && stringContainerType === "object") ||
        (nextCharacter === "]" && stringContainerType === "array");
    if (isStructuralQuote) {
      result += character;
      inString = false;
      continue;
    }

    repairCount += 1;
    if (repairCount > TRUSTED_TASK_JSON_MAX_QUOTE_REPAIRS) return undefined;
    result += '\\"';
  }

  return repairCount > 0 && !inString ? result : undefined;
}

function parseUtf8TrustedJson(bytes: Buffer) {
  const withoutBom =
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
      ? bytes.subarray(3)
      : bytes;
  const text = new TextDecoder("utf-8", { fatal: true }).decode(withoutBom);
  const parsed = parseTrustedTaskJsonCandidate(text);
  if (parsed === undefined) throw new SyntaxError("Invalid JSON output file");
  return parsed;
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
 * three-candidate, four-MiB budget. Files must be complete UTF-8 JSON; the
 * same bounded in-string quote recovery is available to both transport paths.
 * Equivalent valid candidates may repeat across channels. Distinct valid
 * candidates, or a passing candidate accompanied by a scope-conflicting one,
 * fail closed instead of selecting whichever provider envelope appeared first.
 */
export async function resolveTrustedTaskJsonOutput<T>(
  downloader: TrustedTaskOutputDownloader,
  task: unknown,
  options: ResolveTrustedTaskJsonOutputOptions<T>,
): Promise<T> {
  const failures: CandidateFailure[] = [];
  const validCandidates = new Map<string, T>();
  const canonicalize =
    options.canonicalize ?? ((value: T) => canonicalTrustedTaskJson(value));
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
    if (inline?.success) {
      validCandidates.set(canonicalize(inline.data), inline.data);
    }
    if (inline && !inline.success) {
      failures.push({
        code: inline.code,
        validation: inline.validation,
        channel: "inline",
      });
    }
    return;
  };
  if (!preferOutputFile) {
    resolveInline();
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
      parsed = parseUtf8TrustedJson(bytes);
    } catch {
      failures.push({ code: "INVALID_JSON", channel: "output_file" });
      continue;
    }

    const inspection = options.inspectParsed(parsed);
    if (inspection.success) {
      validCandidates.set(canonicalize(inspection.data), inspection.data);
      continue;
    }
    failures.push({
      code: inspection.code,
      validation: inspection.validation,
      channel: "output_file",
    });
  }

  if (preferOutputFile) {
    resolveInline();
  }

  const hasScopeConflict = failures.some(
    (failure) => failure.code === "SCOPE_MISMATCH",
  );
  if (validCandidates.size === 1 && !hasScopeConflict) {
    return validCandidates.values().next().value!;
  }
  if (validCandidates.size > 1) {
    throw new TrustedTaskJsonOutputError(
      "SCHEMA_MISMATCH",
      [{ path: ["root"], message: "Conflicting valid JSON candidates" }],
      {
        channel: preferOutputFile ? "output_file" : "inline",
        byteCount: TRUSTED_TASK_JSON_MAX_TOTAL_BYTES - budget.remaining,
        fileCandidateCount: descriptors.length,
      },
    );
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
