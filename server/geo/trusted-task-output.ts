function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

const MAX_TRUSTED_OUTPUT_FILE_ID_LENGTH = 255;
const MAX_TRUSTED_OUTPUT_FILENAME_LENGTH = 512;
// Keep this aligned with the Dashboard's task-bound artifact grant and proxy.
const MAX_TRUSTED_OUTPUT_URL_LENGTH = 4_096;

export type TrustedAssistantOutputFile = Readonly<{
  fileId?: string;
  url?: string;
  filename: string;
  mimeType: string;
}>;

function boundedString(value: unknown, maximum: number) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length <= maximum ? normalized : "";
}

function trustedJsonOutputFile(
  value: unknown,
): TrustedAssistantOutputFile | undefined {
  const record = asRecord(value);
  if (!record || String(record.type ?? "").toLowerCase() !== "output_file") {
    return undefined;
  }

  const fileId = boundedString(
    record.file_id ?? record.fileId,
    MAX_TRUSTED_OUTPUT_FILE_ID_LENGTH,
  );
  const url = boundedString(
    record.file_url ??
      record.fileUrl ??
      record.download_url ??
      record.downloadUrl ??
      record.url,
    MAX_TRUSTED_OUTPUT_URL_LENGTH,
  );
  const filename = boundedString(
    record.filename ?? record.file_name ?? record.fileName ?? record.name,
    MAX_TRUSTED_OUTPUT_FILENAME_LENGTH,
  );
  const mimeType = boundedString(
    record.mime_type ?? record.mimeType ?? record.content_type,
    255,
  ).toLowerCase();
  const isJson =
    filename.toLowerCase().endsWith(".json") || mimeType.includes("json");
  if (!isJson || (!fileId && !url)) return undefined;

  return {
    fileId: fileId || undefined,
    url: url || undefined,
    filename: filename || "output.json",
    mimeType: mimeType || "application/json",
  };
}

/**
 * Collects JSON files only from the same trusted provider boundary as text:
 * typed task.output files, or typed files directly inside assistant messages.
 * It intentionally never recurses into user, reasoning, metadata, or arbitrary
 * file-shaped values.
 */
export function trustedAssistantOutputFiles(
  task: unknown,
): TrustedAssistantOutputFile[] {
  const record = asRecord(task);
  if (!record || !Array.isArray(record.output)) return [];
  const files: TrustedAssistantOutputFile[] = [];
  const fileIndexes = new Map<string, number>();
  const urlIndexes = new Map<string, number>();

  const append = (value: unknown) => {
    const file = trustedJsonOutputFile(value);
    if (!file) return;
    const existingIndex =
      (file.fileId ? fileIndexes.get(file.fileId) : undefined) ??
      (file.url ? urlIndexes.get(file.url) : undefined);
    if (existingIndex !== undefined) {
      const existing = files[existingIndex];
      const merged = {
        fileId: existing.fileId ?? file.fileId,
        url: existing.url ?? file.url,
        filename:
          existing.filename === "output.json"
            ? file.filename
            : existing.filename,
        mimeType:
          existing.mimeType === "application/json"
            ? file.mimeType
            : existing.mimeType,
      };
      files[existingIndex] = merged;
      if (merged.fileId) fileIndexes.set(merged.fileId, existingIndex);
      if (merged.url) urlIndexes.set(merged.url, existingIndex);
      return;
    }
    const index = files.push(file) - 1;
    if (file.fileId) fileIndexes.set(file.fileId, index);
    if (file.url) urlIndexes.set(file.url, index);
  };

  for (const value of record.output) {
    const item = asRecord(value);
    if (!item || (item.role !== undefined && item.role !== "assistant")) {
      continue;
    }
    append(item);

    const type = String(item.type ?? "").toLowerCase();
    if (
      item.role !== "assistant" ||
      (type && type !== "message" && type !== "output_message") ||
      !Array.isArray(item.content)
    ) {
      continue;
    }
    for (const content of item.content) append(content);
  }

  return files;
}

/**
 * Returns only provider output items that can represent assistant-authored
 * structured/text output. User messages, reasoning metadata, task metadata and
 * attachments are never traversed.
 */
export function trustedAssistantOutputItems(task: unknown): unknown[] {
  const record = asRecord(task);
  if (!record || !Array.isArray(record.output)) return [];
  const trusted: unknown[] = [];

  for (const value of record.output) {
    if (typeof value === "string") {
      trusted.push(value);
      continue;
    }
    const item = asRecord(value);
    if (!item || item.role === "user") continue;
    const type = String(item.type ?? "").toLowerCase();
    if (
      item.role === "assistant" &&
      (!type || type === "message" || type === "output_message") &&
      Array.isArray(item.content)
    ) {
      for (const content of item.content) {
        const contentRecord = asRecord(content);
        const contentType = String(contentRecord?.type ?? "").toLowerCase();
        if (
          typeof content === "string" ||
          ["text", "output_text"].includes(contentType) ||
          (!contentType &&
            (typeof contentRecord?.text === "string" ||
              typeof contentRecord?.output_text === "string"))
        ) {
          trusted.push(content);
        }
      }
      continue;
    }
    if (["text", "output_text"].includes(type)) trusted.push(item);
  }

  return trusted;
}

export function trustedAssistantOutputTexts(task: unknown): string[] {
  return trustedAssistantOutputItems(task).flatMap((value) => {
    if (typeof value === "string") return value.trim() ? [value] : [];
    const record = asRecord(value);
    if (!record) return [];
    for (const key of ["text", "output_text", "content"]) {
      const text = record[key];
      if (typeof text === "string" && text.trim()) return [text];
    }
    return [];
  });
}
