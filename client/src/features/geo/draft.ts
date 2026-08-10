import type { GeoFileReference, GeoProject } from "./types";
import type { GeoUploadedFile } from "./api";

export type PendingGeoDraft = {
  input: string;
  files: File[];
  requestId: string;
  uploadedFiles?: GeoUploadedFile[];
};

function draftFileReference(file: File, index: number): GeoFileReference {
  return {
    id: `draft-file-${index + 1}`,
    name: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
  };
}

export function createGeoDraftProject(
  input: string,
  files: File[],
  options: { id?: string; now?: string } = {},
): GeoProject {
  const normalizedInput = input.trim();
  const now = options.now ?? new Date().toISOString();

  return {
    id: options.id ?? `draft-${crypto.randomUUID()}`,
    remoteToken: "",
    title: normalizedInput || files[0]?.name || "企业知识基建",
    input: normalizedInput,
    createdAt: now,
    updatedAt: now,
    stage: "enterprise_analysis",
    status: "draft",
    progress: 0,
    progressLabel: "资料已就绪，等待启动企业分析",
    files: files.map(draftFileReference),
    questions: [],
    monitoringEdition: "domestic",
    selectedPlatformIds: [],
  };
}

export function isGeoDraftProject(project: GeoProject): boolean {
  return project.status === "draft" || !project.remoteToken;
}
