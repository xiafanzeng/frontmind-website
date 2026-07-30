import { createHash } from "node:crypto";

const MAX_ARCHIVE_CANDIDATES = 32;
const MAX_FILE_ID_LENGTH = 255;
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

export function knowledgeArchiveFileIdFromUrl(value: string) {
  const match = value.match(/\/v1\/files\/([^/?#]+)(?:\/content)?(?:[?#]|$)/i);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]).slice(0, MAX_FILE_ID_LENGTH);
  } catch {
    return match[1].slice(0, MAX_FILE_ID_LENGTH);
  }
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
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
  const rawFileId = String(item.file_id ?? item.fileId ?? "").trim();
  const rawUrl = String(item.file_url ?? item.fileUrl ?? item.url ?? "").trim();
  const fileId = (
    rawFileId ||
    knowledgeArchiveFileIdFromUrl(rawUrl) ||
    ""
  ).slice(0, MAX_FILE_ID_LENGTH);
  const url = rawUrl.slice(0, MAX_URL_LENGTH);
  const isZip =
    filename.toLowerCase().endsWith(".zip") ||
    mimeType.includes("application/zip") ||
    mimeType.includes("application/x-zip");
  if (!isZip || (!fileId && !url)) return null;

  return {
    outputItemId: outputItemId.slice(0, 255),
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
    if (!item || item.role === "user") continue;
    const parentId = String(item.id || `output:${outputIndex}`).slice(0, 191);

    const topLevel = descriptorFromTypedFile(item, parentId);
    if (topLevel) descriptors.push(topLevel);
    if (descriptors.length >= MAX_ARCHIVE_CANDIDATES) break;

    const type = String(item.type || "message").toLowerCase();
    if (
      item.role !== "assistant" ||
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
      const descriptor = descriptorFromTypedFile(
        item.content[contentIndex],
        `${parentId}:content:${contentIndex}`,
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
