import { createHash } from "node:crypto";
import type { BrokerArtifact } from "./broker";

export const MAX_KNOWLEDGE_ARCHIVE_CANDIDATES_TO_INSPECT = 3;
export const MAX_KNOWLEDGE_ARCHIVE_CANDIDATE_BYTES = 100 * 1024 * 1024;
export const MAX_KNOWLEDGE_ARCHIVE_TOTAL_BYTES = 150 * 1024 * 1024;
export const WEBSITE_KNOWLEDGE_CANDIDATE_FILENAME =
  "website-lead-candidate-v1.zip";

export interface KnowledgeArchiveDescriptor {
  outputItemId: string;
  artifactId: string;
  filename: string;
  mimeType: string;
  bytes: number;
  sha256: string;
}

export class KnowledgeArchiveSelectionError extends Error {
  readonly category = "structure" as const;

  constructor(message: string) {
    super(message);
    this.name = "KnowledgeArchiveSelectionError";
  }
}

function isExactString(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function descriptorFromArtifact(
  value: unknown,
  index: number,
): KnowledgeArchiveDescriptor | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const artifact = value as Partial<BrokerArtifact>;
  if (
    !isExactString(artifact.artifactId, 255) ||
    !isExactString(artifact.filename, 512) ||
    !isExactString(artifact.mimeType, 255) ||
    !Number.isSafeInteger(artifact.bytes) ||
    Number(artifact.bytes) <= 0 ||
    !isExactString(artifact.sha256, 64) ||
    !/^[a-f0-9]{64}$/i.test(artifact.sha256)
  ) {
    return;
  }
  const isZip =
    artifact.filename.toLowerCase().endsWith(".zip") ||
    artifact.mimeType.toLowerCase().includes("zip");
  if (!isZip) return;
  return {
    outputItemId: `artifact:${index}:${artifact.artifactId}`,
    artifactId: artifact.artifactId,
    filename: artifact.filename,
    mimeType: artifact.mimeType,
    bytes: Number(artifact.bytes),
    sha256: artifact.sha256.toLowerCase(),
  };
}

export function collectKnowledgeArchiveDescriptors(
  artifacts: unknown,
): KnowledgeArchiveDescriptor[] {
  if (!Array.isArray(artifacts)) return [];
  return artifacts.flatMap((artifact, index) => {
    const descriptor = descriptorFromArtifact(artifact, index);
    return descriptor ? [descriptor] : [];
  });
}

function descriptorRank(descriptor: KnowledgeArchiveDescriptor) {
  const filename = descriptor.filename.toLowerCase();
  if (filename === WEBSITE_KNOWLEDGE_CANDIDATE_FILENAME) return 0;
  if (
    filename.includes("website-lead-candidate") ||
    filename.includes("knowledge-base-candidate")
  ) {
    return 1;
  }
  return 2;
}

export function rankedKnowledgeArchiveDescriptors(
  artifacts: unknown,
): KnowledgeArchiveDescriptor[] {
  return collectKnowledgeArchiveDescriptors(artifacts)
    .map((descriptor, index) => ({ descriptor, index }))
    .sort(
      (left, right) =>
        descriptorRank(left.descriptor) - descriptorRank(right.descriptor) ||
        left.index - right.index,
    )
    .slice(0, MAX_KNOWLEDGE_ARCHIVE_CANDIDATES_TO_INSPECT)
    .map(({ descriptor }) => descriptor);
}

/**
 * Selects one provider result without guessing. An exact, contract-named
 * artifact always wins, but it must itself be unique. We only fall back when
 * the stronger class is absent, and never use a generic ZIP to rescue an
 * invalid explicit candidate later in the pipeline.
 */
export function selectUniqueKnowledgeArchiveDescriptor(
  artifacts: unknown,
): KnowledgeArchiveDescriptor | undefined {
  const descriptors = collectKnowledgeArchiveDescriptors(artifacts);
  const exact = descriptors.filter(
    (descriptor) =>
      descriptor.filename.toLowerCase() ===
      WEBSITE_KNOWLEDGE_CANDIDATE_FILENAME,
  );
  if (exact.length > 1) {
    throw new KnowledgeArchiveSelectionError(
      "上游任务返回了多个同名候选 ZIP，无法唯一确认正式候选文件",
    );
  }
  if (exact.length === 1) return exact[0];

  const candidateLike = descriptors.filter(
    (descriptor) => descriptorRank(descriptor) === 1,
  );
  if (candidateLike.length > 1) {
    throw new KnowledgeArchiveSelectionError(
      "上游任务返回了多个候选型 ZIP，无法唯一确认正式候选文件",
    );
  }
  if (candidateLike.length === 1) return candidateLike[0];

  if (descriptors.length > 1) {
    throw new KnowledgeArchiveSelectionError(
      "上游任务返回了多个普通 ZIP，无法安全猜测正式候选文件",
    );
  }
  return descriptors[0];
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
        artifactId: descriptor.artifactId,
        filename: descriptor.filename,
        mimeType: descriptor.mimeType,
        bytes: descriptor.bytes,
        sha256: descriptor.sha256,
      }),
    )
    .digest("hex");
}
