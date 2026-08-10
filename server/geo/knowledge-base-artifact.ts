import { createHash } from "node:crypto";

const MAX_ARCHIVE_CANDIDATES = 32;
const MAX_FILE_ID_LENGTH = 255;
const MAX_OUTPUT_ITEM_ID_LENGTH = 255;
const MAX_FILENAME_LENGTH = 512;
const MAX_URL_LENGTH = 8_192;
export const MAX_KNOWLEDGE_ARCHIVE_CANDIDATES_TO_INSPECT = 3;
export const MAX_KNOWLEDGE_ARCHIVE_CANDIDATE_BYTES = 100 * 1024 * 1024;
export const MAX_KNOWLEDGE_ARCHIVE_TOTAL_BYTES = 150 * 1024 * 1024;
export const WEBSITE_KNOWLEDGE_CANDIDATE_FILENAME =
  "website-lead-candidate-v1.zip";

export interface KnowledgeArchiveDescriptor {
  outputItemId: string;
  fileId?: string;
  url?: string;
  filename: string;
  mimeType: string;
}

type ParsedUrlFileId =
  | { kind: "absent" }
  | { kind: "invalid" }
  | { kind: "value"; value: string };

function isExactIdentity(value: string, maxLength: number) {
  return (
    value.length > 0 &&
    value.length <= maxLength &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function parsedKnowledgeArchiveFileIdFromUrl(value: string): ParsedUrlFileId {
  const match = value.match(/\/v1\/files\/([^/?#]+)(?:\/content)?(?:[?#]|$)/i);
  if (!match?.[1]) return { kind: "absent" };
  try {
    const decoded = decodeURIComponent(match[1]);
    return isExactIdentity(decoded, MAX_FILE_ID_LENGTH)
      ? { kind: "value", value: decoded }
      : { kind: "invalid" };
  } catch {
    return { kind: "invalid" };
  }
}

export function knowledgeArchiveFileIdFromUrl(value: string) {
  const parsed = parsedKnowledgeArchiveFileIdFromUrl(value);
  return parsed.kind === "value" ? parsed.value : undefined;
}

function exactAliasedString(
  item: Record<string, unknown>,
  aliases: readonly string[],
  maxLength: number,
) {
  let selected: string | undefined;
  for (const alias of aliases) {
    if (!(alias in item) || item[alias] === null || item[alias] === undefined) {
      continue;
    }
    const candidate = item[alias];
    if (candidate === "") continue;
    if (
      typeof candidate !== "string" ||
      !isExactIdentity(candidate, maxLength)
    ) {
      return { ok: false as const };
    }
    if (selected !== undefined && selected !== candidate) {
      return { ok: false as const };
    }
    selected = candidate;
  }
  return { ok: true as const, value: selected };
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nestedOutputItemId(parentId: string, contentIndex: number) {
  const legacyId = `${parentId}:content:${contentIndex}`;
  if (legacyId.length <= MAX_OUTPUT_ITEM_ID_LENGTH) return legacyId;
  return `content:${createHash("sha256")
    .update(`${parentId}\u0000${contentIndex}`, "utf8")
    .digest("hex")}`;
}

function descriptorFromTypedFile(
  value: unknown,
  outputItemId: string,
): KnowledgeArchiveDescriptor | null {
  const item = asObject(value);
  if (!item) return null;
  const type = String(item.type ?? "").toLowerCase();
  if (type !== "output_file" && type !== "file") return null;

  const filename = String(
    item.fileName ?? item.file_name ?? item.filename ?? item.name ?? "",
  )
    .trim()
    .slice(0, MAX_FILENAME_LENGTH);
  const mimeType = String(
    item.mimeType ?? item.mime_type ?? item.content_type ?? "",
  )
    .trim()
    .toLowerCase()
    .slice(0, 255);
  if (!isExactIdentity(outputItemId, MAX_OUTPUT_ITEM_ID_LENGTH)) return null;
  const explicitFileId = exactAliasedString(
    item,
    ["file_id", "fileId"],
    MAX_FILE_ID_LENGTH,
  );
  const explicitUrl = exactAliasedString(
    item,
    ["file_url", "fileUrl", "url"],
    MAX_URL_LENGTH,
  );
  if (!explicitFileId.ok || !explicitUrl.ok) return null;
  const urlFileId = explicitUrl.value
    ? parsedKnowledgeArchiveFileIdFromUrl(explicitUrl.value)
    : ({ kind: "absent" } as const);
  if (urlFileId.kind === "invalid") return null;
  if (
    explicitFileId.value &&
    urlFileId.kind === "value" &&
    explicitFileId.value !== urlFileId.value
  ) {
    return null;
  }
  const fileId =
    explicitFileId.value ||
    (urlFileId.kind === "value" ? urlFileId.value : undefined);
  const url = explicitUrl.value;
  const isZip =
    filename.toLowerCase().endsWith(".zip") ||
    mimeType.includes("application/zip") ||
    mimeType.includes("application/x-zip");
  if (!isZip || (!fileId && !url)) return null;

  return {
    outputItemId,
    fileId: fileId || undefined,
    url: url || undefined,
    filename: filename || "knowledge-base.zip",
    mimeType: mimeType || "application/zip",
  };
}

/**
 * This mirrors Agent's trust boundary exactly: only typed files directly in
 * task output or assistant message content can be handed off.
 */
export function collectKnowledgeArchiveDescriptors(
  output: unknown,
): KnowledgeArchiveDescriptor[] {
  if (!Array.isArray(output)) return [];
  const descriptors: KnowledgeArchiveDescriptor[] = [];

  for (let outputIndex = 0; outputIndex < output.length; outputIndex += 1) {
    if (descriptors.length >= MAX_ARCHIVE_CANDIDATES) break;
    const item = asObject(output[outputIndex]);
    if (!item) continue;
    const role = String(item.role ?? "")
      .trim()
      .toLowerCase();
    const type = String(item.type ?? "message")
      .trim()
      .toLowerCase();
    if (
      role === "user" ||
      role === "tool" ||
      role === "system" ||
      role === "developer"
    ) {
      continue;
    }
    const explicitParentId = exactAliasedString(
      item,
      ["id"],
      MAX_OUTPUT_ITEM_ID_LENGTH,
    );
    if (!explicitParentId.ok) continue;
    const parentId = explicitParentId.value || `output:${outputIndex}`;

    const topLevel =
      !role || role === "assistant"
        ? descriptorFromTypedFile(item, parentId)
        : null;
    if (topLevel) descriptors.push(topLevel);
    if (descriptors.length >= MAX_ARCHIVE_CANDIDATES) break;

    if (
      role !== "assistant" ||
      (type !== "message" && type !== "output_message") ||
      !Array.isArray(item.content)
    ) {
      continue;
    }
    for (
      let contentIndex = 0;
      contentIndex < item.content.length;
      contentIndex += 1
    ) {
      if (descriptors.length >= MAX_ARCHIVE_CANDIDATES) break;
      const contentOutputItemId = nestedOutputItemId(parentId, contentIndex);
      const descriptor = descriptorFromTypedFile(
        item.content[contentIndex],
        contentOutputItemId,
      );
      if (descriptor) descriptors.push(descriptor);
    }
  }

  return descriptors;
}

function descriptorRank(descriptor: KnowledgeArchiveDescriptor) {
  const filename = descriptor.filename.trim().toLowerCase();
  if (filename === WEBSITE_KNOWLEDGE_CANDIDATE_FILENAME) return 0;
  if (
    filename.includes("website-lead-candidate") ||
    filename.includes("knowledge-base-candidate")
  ) {
    return 1;
  }
  return 2;
}

/**
 * Prefer the fixed candidate contract name while preserving Agent output
 * order inside each rank. The router applies the download-count and byte
 * budgets because only it has access to response sizes.
 */
export function rankedKnowledgeArchiveDescriptors(
  output: unknown,
): KnowledgeArchiveDescriptor[] {
  return collectKnowledgeArchiveDescriptors(output)
    .map((descriptor, index) => ({ descriptor, index }))
    .sort(
      (left, right) =>
        descriptorRank(left.descriptor) - descriptorRank(right.descriptor) ||
        left.index - right.index,
    )
    .slice(0, MAX_KNOWLEDGE_ARCHIVE_CANDIDATES_TO_INSPECT)
    .map(({ descriptor }) => descriptor);
}

export function isExplicitKnowledgeCandidateDescriptor(
  descriptor: KnowledgeArchiveDescriptor,
) {
  return descriptorRank(descriptor) < 2;
}

export function knowledgeArchiveDescriptorHash(
  descriptor: KnowledgeArchiveDescriptor,
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        outputItemId: descriptor.outputItemId,
        fileId: descriptor.fileId || null,
        urlHash: descriptor.fileId
          ? null
          : createHash("sha256")
              .update(descriptor.url || "")
              .digest("hex"),
        filename: descriptor.filename,
        mimeType: descriptor.mimeType,
      }),
    )
    .digest("hex");
}
