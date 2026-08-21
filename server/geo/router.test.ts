import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import type { AddressInfo } from "node:net";
import { request as httpRequest, type Server } from "node:http";
import { Readable } from "node:stream";
import os from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";
import express from "express";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GeoBrokerError,
  PRESALES_CAPABILITIES,
  PRESALES_CONTRACTS,
  PRESALES_CONTRACT_VERSION,
  expectedContractHashes,
  type BrokerArtifact,
  type BrokerLocalAsset,
  type BrokerMonitorRawRun,
  type BrokerMonitorRun,
  type BrokerTask,
  type BrokerUploadOptions,
  type GeoMonitoringEdition,
  type GeoMonitorPlatformId,
  type GeoPresalesBroker,
  type PresalesContract,
} from "./broker";
import {
  GeoAdminNotificationConfigurationError,
  type GeoAdminNotification,
} from "./admin-notifications";
import {
  createGeoCustomQuestionRecoveryWorker,
  createGeoRouter,
  GEO_LEGACY_CUSTOM_QUESTION_COMPATIBILITY_WAIT_MS,
  KnowledgeBaseArchiveValidationError,
} from "./router";

import {
  geoCustomQuestionHash,
  geoCustomQuestionRequestHash,
  MemoryGeoCustomQuestionValidationStore,
} from "./custom-question-validation-store";
import {
  FileGeoMonitorFreeReservationStore,
  MemoryGeoMonitorFreeReservationStore,
  type GeoMonitorFreeReservationStore,
} from "./monitor-free-reservation-store";
import { parseKnowledgeBaseArchive } from "./archive";
import {
  finalizeKnowledgeBaseCandidate,
  WEBSITE_KB_ARCHIVE_ROOT,
} from "./knowledge-base-finalizer";
import { buildValidQuestionSet } from "./question-set.test-fixture";
import type { GeoQuestion } from "./schemas";
import { GeoTokenCodec, parseCookies } from "./tokens";
import { GeoAccountProvisioningError } from "./provisioning";
import {
  type GeoPaymentCheckout,
  type GeoPaymentCheckoutInput,
  type GeoPaymentCheckoutSwitchInput,
  GeoPaymentVerificationError,
  type GeoPaymentVerificationInput,
  type GeoPaymentGateway,
  type GeoServiceBankTransferInput,
  type GeoServicePaymentCheckoutInput,
  type GeoServicePaymentCheckoutSwitchInput,
  type GeoServicePaymentVerificationInput,
} from "./payment";
import type {
  GeoAccountProvisionRequest,
  GeoKnowledgeImportRequest,
  GeoManualServiceOrderAccountRequest,
  GeoManualServiceOrderCreateRequest,
  GeoManualServiceOrderExternalAuthorizationRequest,
  GeoManualServiceOrderPaymentRequest,
  GeoManualServiceOrderResponse,
  GeoProjectOrder,
  GeoProjectOrderRegistry,
  GeoPurchaseProvisionRequestV2,
  GeoPurchaseProvisionResponseV2,
} from "./provisioning";

describe("knowledge-base archive validation error arguments", () => {
  it.each(["structure", "media", "content", "unsafe"] as const)(
    "keeps category/message order for %s",
    (category) => {
      const error = new KnowledgeBaseArchiveValidationError(
        category,
        `private ${category} reason`,
      );
      expect(error.category).toBe(category);
      expect(error.validationReason).toBe(`private ${category} reason`);
      expect(error.message).not.toContain("private");
    },
  );
});

function monitorTranslationTaskOutput(
  sourceQuestion: string,
  questionEnglish: string,
) {
  return [
    {
      type: "output_message",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: {
            value: JSON.stringify({
              schemaVersion: 1,
              sourceQuestionSha256: createHash("sha256")
                .update(sourceQuestion, "utf8")
                .digest("hex"),
              questionEnglish,
            }),
          },
        },
      ],
    },
  ];
}

function fixtureCrc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function fixturePngChunk(type: string, data: Buffer) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(fixtureCrc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function fixturePng(seed = 1) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    fixturePngChunk("IHDR", header),
    fixturePngChunk("IDAT", deflateSync(Buffer.from([0, seed % 256, 31, 97]))),
    fixturePngChunk("IEND", Buffer.alloc(0)),
  ]);
}

async function finalizeKnowledgeBaseCandidateAsV4(
  input: Parameters<typeof finalizeKnowledgeBaseCandidate>[0],
) {
  const finalized = await finalizeKnowledgeBaseCandidate(input);
  const zip = await JSZip.loadAsync(finalized.bytes);
  const packageManifestPath = `${WEBSITE_KB_ARCHIVE_ROOT}/00_package_manifest.json`;
  const packageManifest = JSON.parse(
    await zip.file(packageManifestPath)!.async("string"),
  ) as {
    schemaVersion: number;
    documents: Array<{
      kind: string;
      path: string;
      customerVisible: boolean;
    }>;
    allPaths?: string[];
    evidencePaths?: string[];
  };
  const allPaths = Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => entry.name.slice(WEBSITE_KB_ARCHIVE_ROOT.length + 1))
    .sort();
  const evidencePaths = packageManifest.documents
    .filter(
      (document) => document.kind === "evidence" && !document.customerVisible,
    )
    .map((document) => document.path)
    .sort();
  const packageManifestText = `${JSON.stringify(
    {
      ...packageManifest,
      schemaVersion: 4,
      allPaths,
      evidencePaths,
    },
    null,
    2,
  )}\n`;
  zip.file(packageManifestPath, packageManifestText);
  const bytes = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "UNIX",
  });

  return {
    ...finalized,
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    packageManifestSha256: createHash("sha256")
      .update(packageManifestText)
      .digest("hex"),
    manifest: await parseKnowledgeBaseArchive(bytes, {
      companyName: input.companyName,
      generatedAt: input.evaluatedAt,
      validationProfile: "website-lead-v1",
    }),
  };
}

function fixtureEvidenceCharacterCount(markdown: string) {
  return Array.from(
    markdown
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/!\[[^\]]*]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
      .replace(/https?:\/\/[^\s)>\]]+/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\s/g, "")
      .replace(
        /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~，。！？；：“”‘’（）【】《》…—·]/g,
        "",
      ),
  ).length;
}

class MockBroker implements GeoPresalesBroker {
  tasks = new Map<string, any>();
  prompts: string[] = [];
  taskContracts: PresalesContract[] = [];
  taskBusinessOwnerNames: Array<string | undefined> = [];
  uploads = new Map<string, Buffer>();
  skillUploads = new Map<string, Buffer>();
  taskInputUploads = new Map<string, Buffer>();
  archive = Buffer.alloc(0);
  nextTask = 1;
  nextSkillFile = 1;
  nextTaskInputFile = 1;
  nextRegularFile = 1;
  questionTaskCount = 0;
  customQuestionClassifierTaskCount = 0;
  monitorQuestionTranslationTaskCount = 0;
  customQuestionClassifierPendingPolls = 0;
  customQuestionClassifierPolls = 0;
  assessmentTaskCount = 0;
  forecastTaskCount = 0;
  completeAssessmentImmediately = false;
  completeForecastImmediately = false;
  invalidFirstQuestionTask = false;
  questionTaskOutput?: unknown;
  idempotentTasks = new Map<string, BrokerTask>();
  idempotentFiles = new Map<string, BrokerLocalAsset>();
  fileCredentialVersions = new Map<string, number>();
  fileProjectIds = new Map<string, string>();
  fileCreateOperationKeys: string[] = [];
  loseNextIdempotentFileCreateResponse = false;
  rotateCredentialWhenFileResponseIsLost = false;
  enforceCurrentCredentialAttachments = false;
  currentCredentialVersion = 1;
  deletedFiles: string[] = [];
  failDeleteFile = false;
  createdFileIds: string[] = [];
  createdFileMimeTypes = new Map<string, string | undefined>();
  uploadAttempts: string[] = [];
  skillUploadError?: Error;
  regularUploadError?: Error;
  taskAttachments: Array<Array<{ file_id: string; filename: string }>> = [];
  monitorRuns = new Map<string, BrokerMonitorRawRun>();
  monitorResults = new Map<string, BrokerMonitorRawRun>();
  monitorCreates = 0;
  monitorCreateStatus: BrokerMonitorRawRun["status"] = "submitted";
  monitorCreateError?: Error;
  monitorCreateInputs: Array<
    Parameters<GeoPresalesBroker["createMonitorRun"]>[0]
  > = [];
  monitorRegionReads: GeoMonitoringEdition[] = [];
  monitorRegions: Record<
    GeoMonitoringEdition,
    Array<{ code: string; label: string }>
  > = {
    domestic: [
      { code: "110000", label: "北京市" },
      { code: "opaque:cn-east", label: "华东节点" },
    ],
    overseas: [
      { code: "US", label: "美国" },
      { code: "JP", label: "日本" },
    ],
  };
  monitorScreenshotDownloads: Array<{ runId: string; recordId: string }> = [];
  monitorScreenshotBytes = fixturePng(19);
  monitorScreenshotContentType = "image/png";
  monitorScreenshotError?: Error;
  monitorResultReads = 0;
  monitorResultError?: Error;
  taskResultErrors = new Map<string, Error>();
  taskErrors = new Map<string, Error>();
  createTaskErrors: Error[] = [];
  taskResults = new Map<string, BrokerTask>();
  repairCalls: Array<{ taskId: string; idempotencyKey: string }> = [];
  repairResults = new Map<string, BrokerTask[]>();
  repairResultFactory?: (
    taskId: string,
    idempotencyKey: string,
  ) => BrokerTask | undefined;
  deletedTasks: string[] = [];
  taskProjectIds = new Map<string, string>();
  monitorCredentialConfigured = true;
  monitorCredentialAuthenticated = true;
  freshMonitorCredentialChecks: boolean[] = [];
  publicUrlConfigured = true;
  omitNextKnowledgeTaskStatus = false;
  downloadErrors = new Map<string, Error>();
  downloadOverrides = new Map<string, Buffer>();
  artifactSources = new Map<string, string>();
  downloadedFileIds: string[] = [];
  customQuestionClassifierOutput: Record<string, unknown> = {
    decision: "accept",
    category: "product_scenario",
    enterpriseRelated: true,
    reasonCode: "accepted",
    reason: "问题明确指向 Acme 及其科研场景服务能力。",
    enterpriseAnchor: "Acme",
    offeringAnchor: null,
    evidenceRefs: ["evidence/S001.md"],
  };
  customQuestionClassifierRawText?: string;
  customQuestionClassifierRawTexts: string[] = [];
  customQuestionClassifierUseOutputFile = false;
  monitorQuestionTranslationQuestionEnglish =
    "Which business problems does Acme Service Module 1 primarily solve?";
  monitorQuestionTranslationRawOutput?: unknown;
  monitorQuestionTranslationUseOutputFile = false;
  monitorQuestionTranslationStatus: "completed" | "running" | "failed" =
    "completed";

  private customQuestionClassifierText() {
    return (
      this.customQuestionClassifierRawTexts.shift() ??
      this.customQuestionClassifierRawText ??
      JSON.stringify(this.customQuestionClassifierOutput)
    );
  }

  private monitorQuestionTranslationText(prompt: string) {
    const sourceQuestionSha256 = prompt.match(
      /"sourceQuestionSha256":"([a-f0-9]{64})"/,
    )?.[1];
    return JSON.stringify(
      this.monitorQuestionTranslationRawOutput ?? {
        schemaVersion: 1,
        sourceQuestionSha256,
        questionEnglish: this.monitorQuestionTranslationQuestionEnglish,
      },
    );
  }

  private customQuestionClassifierTaskOutput(taskId: string) {
    const text = this.customQuestionClassifierText();
    if (!this.customQuestionClassifierUseOutputFile) {
      return [
        {
          role: "assistant",
          content: [{ text }],
        },
      ];
    }
    const fileId = `${taskId}-result-json`;
    this.downloadOverrides.set(fileId, Buffer.from(text, "utf8"));
    return [
      {
        type: "output_file",
        file_id: fileId,
        filename: "custom-question-classification.json",
      },
    ];
  }

  private monitorQuestionTranslationTaskOutput(taskId: string, prompt: string) {
    const text = this.monitorQuestionTranslationText(prompt);
    if (!this.monitorQuestionTranslationUseOutputFile) {
      return [
        {
          role: "assistant",
          content: [{ text }],
        },
      ];
    }
    const fileId = `${taskId}-result-json`;
    this.downloadOverrides.set(fileId, Buffer.from(text, "utf8"));
    return [
      {
        type: "output_file",
        file_id: fileId,
        filename: "monitor-question-translation.json",
      },
    ];
  }

  async getStatus(options: { freshMonitorCredential?: boolean } = {}) {
    this.freshMonitorCredentialChecks.push(
      options.freshMonitorCredential === true,
    );
    return {
      ok: true,
      credentialConfigured: true,
      monitorCredentialConfigured: this.monitorCredentialConfigured,
      monitorCredentialAuthenticated: this.monitorCredentialAuthenticated,
      publicUrlConfigured: this.publicUrlConfigured,
      presalesContractVersion: PRESALES_CONTRACT_VERSION,
      capabilities: PRESALES_CAPABILITIES,
      contractHashes: expectedContractHashes(),
    };
  }

  async createAsset(input: {
    projectId?: string;
    filename: string;
    mimeType?: string;
    sizeBytes: number;
    idempotencyKey: string;
  }): Promise<BrokerLocalAsset> {
    if (input.idempotencyKey) {
      this.fileCreateOperationKeys.push(input.idempotencyKey);
      const replay = this.idempotentFiles.get(input.idempotencyKey);
      if (replay) {
        return {
          ...(await this.getAsset(replay.localAssetId)),
          replayed: true,
        };
      }
    }
    let file: BrokerLocalAsset;
    if (input.filename.endsWith(".skill.zip")) {
      file = {
        localAssetId: `skill-file-${this.nextSkillFile++}`,
        filename: input.filename,
        status: "pending",
      };
    } else if (input.filename.endsWith("-task-input.json")) {
      file = {
        localAssetId: `task-input-file-${this.nextTaskInputFile++}`,
        filename: input.filename,
        status: "pending",
      };
    } else {
      file = {
        localAssetId: `file-${this.nextRegularFile++}`,
        filename: input.filename,
        status: "pending",
      };
    }
    this.createdFileIds.push(file.localAssetId);
    if (input.projectId)
      this.fileProjectIds.set(file.localAssetId, input.projectId);
    this.createdFileMimeTypes.set(file.localAssetId, input.mimeType);
    this.fileCredentialVersions.set(
      file.localAssetId,
      this.currentCredentialVersion,
    );
    if (input.idempotencyKey) {
      this.idempotentFiles.set(input.idempotencyKey, file);
      if (this.loseNextIdempotentFileCreateResponse) {
        this.loseNextIdempotentFileCreateResponse = false;
        if (this.rotateCredentialWhenFileResponseIsLost) {
          this.currentCredentialVersion += 1;
        }
        throw new GeoBrokerError(
          "Dashboard committed the file but the response was lost",
          502,
          "AGENT_UNAVAILABLE",
        );
      }
    }
    return { ...file, replayed: false };
  }

  async getAsset(
    fileId: string,
    _options: { signal?: AbortSignal } = {},
  ): Promise<BrokerLocalAsset> {
    const asset = Array.from(this.idempotentFiles.values()).find(
      (candidate) => candidate.localAssetId === fileId,
    );
    if (!asset) {
      throw new GeoBrokerError("missing asset", 404, "LOCAL_ASSET_NOT_FOUND");
    }
    const uploaded =
      this.uploads.get(fileId) ??
      this.skillUploads.get(fileId) ??
      this.taskInputUploads.get(fileId);
    return {
      ...asset,
      status: uploaded ? "uploaded" : "pending",
      ...(uploaded
        ? {
            bytes: uploaded.byteLength,
            sha256: createHash("sha256").update(uploaded).digest("hex"),
          }
        : {}),
    };
  }

  async uploadAsset(
    fileId: string,
    body: Buffer | Readable,
    _contentType = "application/octet-stream",
    _uploadTicket?: string,
    _options: BrokerUploadOptions = {},
  ) {
    this.uploadAttempts.push(fileId);
    if (fileId.startsWith("skill-file-") && this.skillUploadError) {
      throw this.skillUploadError;
    }
    if (!fileId.startsWith("skill-file-") && this.regularUploadError) {
      throw this.regularUploadError;
    }
    const bytes = Buffer.isBuffer(body)
      ? body
      : Buffer.concat(
          await Array.fromAsync(body, (chunk) =>
            Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
          ),
        );
    if (fileId.startsWith("skill-file-")) {
      this.skillUploads.set(fileId, bytes);
    } else if (fileId.startsWith("task-input-file-")) {
      this.taskInputUploads.set(fileId, bytes);
    } else {
      this.uploads.set(fileId, bytes);
    }
    return { status: "uploaded" };
  }

  private asV2Task(value: unknown, fallbackId?: string): BrokerTask {
    const record =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, any>)
        : {};
    if (
      typeof record.localTaskId === "string" &&
      typeof record.operationId === "string" &&
      Array.isArray(record.safeEvents)
    ) {
      return record as BrokerTask;
    }
    const id = String(record.id || record.task_id || fallbackId || "task");
    const rawStatus = String(record.status || "running").toLowerCase();
    const status: BrokerTask["status"] =
      rawStatus === "completed" || rawStatus === "succeeded"
        ? "succeeded"
        : rawStatus === "failed"
          ? "failed"
          : rawStatus === "cancelled" || rawStatus === "canceled"
            ? "cancelled"
            : rawStatus === "pending" || rawStatus === "queued"
              ? "queued"
              : rawStatus === "result_pending"
                ? "result_pending"
                : "running";
    const structuredResult = this.legacyStructuredResult(record.output);
    const artifacts = this.legacyArtifacts(record.output);
    return {
      localTaskId: id,
      operationId: `operation:${id}`,
      status,
      safeEvents: [],
      ...(status === "succeeded" ||
      structuredResult !== undefined ||
      artifacts.length
        ? {
            result: {
              ...(structuredResult !== undefined ? { structuredResult } : {}),
              artifacts,
            },
          }
        : {}),
      ...(record.error
        ? { error: { code: "TASK_FAILED", retryable: false } }
        : {}),
    };
  }

  private legacyStructuredResult(value: unknown): unknown {
    const seen = new Set<unknown>();
    const visit = (candidate: unknown, depth: number): unknown => {
      if (depth > 10 || candidate === null || candidate === undefined) return;
      if (typeof candidate === "string") {
        const trimmed = candidate
          .trim()
          .replace(/^```(?:json)?\s*/i, "")
          .replace(/\s*```$/, "");
        try {
          return visit(JSON.parse(trimmed), depth + 1);
        } catch {
          return undefined;
        }
      }
      if (typeof candidate !== "object" || seen.has(candidate)) return;
      seen.add(candidate);
      if (Array.isArray(candidate)) {
        for (const entry of candidate) {
          const result = visit(entry, depth + 1);
          if (result !== undefined) return result;
        }
        return;
      }
      const item = candidate as Record<string, unknown>;
      if (
        [
          "questions",
          "decision",
          "assessmentType",
          "scenario",
          "sourceQuestionSha256",
        ].some((key) => key in item)
      ) {
        return item;
      }
      const fileId =
        typeof item.file_id === "string"
          ? item.file_id
          : typeof item.fileId === "string"
            ? item.fileId
            : undefined;
      if (fileId) {
        const bytes = this.downloadOverrides.get(fileId);
        if (bytes) {
          const result = visit(bytes.toString("utf8"), depth + 1);
          if (result !== undefined) return result;
        }
      }
      for (const child of Object.values(item)) {
        const result = visit(child, depth + 1);
        if (result !== undefined) return result;
      }
      return;
    };
    return visit(value, 0);
  }

  private legacyArtifacts(value: unknown): BrokerArtifact[] {
    const artifacts: BrokerArtifact[] = [];
    const seenObjects = new Set<unknown>();
    const seenIds = new Set<string>();
    const visit = (candidate: unknown, depth: number) => {
      if (depth > 10 || !candidate || typeof candidate !== "object") return;
      if (seenObjects.has(candidate)) return;
      seenObjects.add(candidate);
      if (Array.isArray(candidate)) {
        candidate.forEach((entry) => visit(entry, depth + 1));
        return;
      }
      const item = candidate as Record<string, unknown>;
      const artifactId =
        typeof item.artifactId === "string"
          ? item.artifactId
          : typeof item.file_id === "string"
            ? item.file_id
            : typeof item.fileId === "string"
              ? item.fileId
              : undefined;
      const filename =
        typeof item.filename === "string" ? item.filename : undefined;
      if (
        artifactId &&
        filename &&
        filename.toLowerCase().endsWith(".zip") &&
        !seenIds.has(artifactId)
      ) {
        const bytes =
          this.downloadOverrides.get(artifactId) ||
          this.uploads.get(artifactId) ||
          this.archive;
        seenIds.add(artifactId);
        artifacts.push({
          artifactId,
          filename,
          mimeType: "application/zip",
          bytes: Math.max(1, bytes.length),
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
      }
      Object.values(item).forEach((child) => visit(child, depth + 1));
    };
    visit(value, 0);
    return artifacts;
  }

  async createTask(input: {
    projectId: string;
    prompt: string;
    localAssets: Array<{ localAssetId: string; filename: string }>;
    idempotencyKey: string;
    contract: PresalesContract;
    businessOwnerName?: string;
  }) {
    const attachments = input.localAssets.map((asset) => ({
      file_id: asset.localAssetId,
      filename: asset.filename,
    }));
    const configuredError = this.createTaskErrors.shift();
    if (configuredError) throw configuredError;
    if (
      this.enforceCurrentCredentialAttachments &&
      attachments.some(
        (attachment) =>
          this.fileCredentialVersions.get(attachment.file_id) !==
          this.currentCredentialVersion,
      )
    ) {
      throw new GeoBrokerError(
        "attachments belong to a retired credential generation",
        409,
        "AGENT_REQUEST_FAILED",
      );
    }
    const existing = this.idempotentTasks.get(input.idempotencyKey);
    if (existing) return existing;
    this.prompts.push(input.prompt);
    this.taskContracts.push(input.contract);
    this.taskBusinessOwnerNames.push(input.businessOwnerName);
    this.taskAttachments.push(attachments);
    const isQuestionTask = input.prompt.includes(
      "geo-question-recommender.skill.zip",
    );
    const isCustomQuestionClassifierTask = input.prompt.includes(
      "geo-custom-question-classifier.skill.zip",
    );
    const isMonitorQuestionTranslationTask = input.prompt.includes(
      "frontmind.geo.monitor-question-translation.v1",
    );
    const isAssessmentTask = input.prompt.includes(
      "geo-current-state-evaluator.skill.zip",
    );
    const isForecastTask = input.prompt.includes(
      "geo-optimization-outcome-forecaster.skill.zip",
    );
    const id = isMonitorQuestionTranslationTask
      ? `monitor-question-translation-${++this.monitorQuestionTranslationTaskCount}`
      : isCustomQuestionClassifierTask
        ? `custom-question-classifier-${++this.customQuestionClassifierTaskCount}`
        : isQuestionTask
          ? `question-${++this.questionTaskCount}`
          : isAssessmentTask
            ? `assessment-${++this.assessmentTaskCount}`
            : isForecastTask
              ? `forecast-${++this.forecastTaskCount}`
              : `kb-${this.nextTask++}`;
    const legacyTask: any = isMonitorQuestionTranslationTask
      ? {
          id,
          status: this.monitorQuestionTranslationStatus,
          output:
            this.monitorQuestionTranslationStatus === "completed"
              ? this.monitorQuestionTranslationTaskOutput(id, input.prompt)
              : [],
        }
      : isCustomQuestionClassifierTask
        ? this.customQuestionClassifierPendingPolls > 0
          ? {
              id,
              status: "running",
              progress: 0.25,
              output: [],
            }
          : {
              id,
              status: "completed",
              output: this.customQuestionClassifierTaskOutput(id),
            }
        : isQuestionTask
          ? {
              id,
              status: "completed",
              output: [
                {
                  role: "assistant",
                  content: [
                    {
                      text:
                        this.questionTaskOutput !== undefined
                          ? (JSON.stringify(this.questionTaskOutput) ?? "")
                          : this.invalidFirstQuestionTask &&
                              this.questionTaskCount === 1
                            ? JSON.stringify({ questions: [] })
                            : JSON.stringify(validQuestionSet()),
                    },
                  ],
                },
              ],
            }
          : isAssessmentTask && this.completeAssessmentImmediately
            ? {
                id,
                status: "completed",
                output: [
                  {
                    role: "assistant",
                    content: [
                      { text: JSON.stringify(validAssessmentOutput()) },
                    ],
                  },
                ],
              }
            : isForecastTask && this.completeForecastImmediately
              ? {
                  id,
                  status: "completed",
                  output: [
                    {
                      role: "assistant",
                      content: [
                        { text: JSON.stringify(validForecastOutput()) },
                      ],
                    },
                  ],
                }
              : !isQuestionTask &&
                  !isAssessmentTask &&
                  !isForecastTask &&
                  this.omitNextKnowledgeTaskStatus
                ? { id, progress: 0.25, output: [] }
                : { id, status: "running", progress: 0.25, output: [] };
    const task = this.asV2Task(legacyTask, id);
    this.tasks.set(id, task);
    this.taskProjectIds.set(id, input.projectId);
    for (const attachment of attachments) {
      this.fileProjectIds.set(attachment.file_id, input.projectId);
    }
    this.idempotentTasks.set(input.idempotencyKey, task);
    return task;
  }

  async getTask(taskId: string) {
    const configuredError = this.taskErrors.get(taskId);
    if (configuredError) throw configuredError;
    let task = this.tasks.get(taskId);
    if (!task) throw new Error("missing task");
    if (
      taskId.startsWith("custom-question-classifier-") &&
      this.asV2Task(task, taskId).status === "running"
    ) {
      this.customQuestionClassifierPolls += 1;
      this.customQuestionClassifierPendingPolls -= 1;
      if (this.customQuestionClassifierPendingPolls <= 0) {
        task = this.asV2Task({
          id: taskId,
          status: "completed",
          output: this.customQuestionClassifierTaskOutput(taskId),
        });
        this.tasks.set(taskId, task);
      }
    }
    return this.asV2Task(task, taskId);
  }

  async getTaskResult(taskId: string) {
    const error = this.taskResultErrors.get(taskId);
    if (error) throw error;
    const result = this.taskResults.get(taskId);
    return result ? this.asV2Task(result, taskId) : this.getTask(taskId);
  }

  async repairTask(taskId: string, input: { idempotencyKey: string }) {
    this.repairCalls.push({ taskId, idempotencyKey: input.idempotencyKey });
    const queue = this.repairResults.get(taskId);
    const repaired =
      queue?.shift() ??
      this.repairResultFactory?.(taskId, input.idempotencyKey);
    if (repaired) {
      this.tasks.set(taskId, repaired);
      this.taskResults.set(taskId, repaired);
      return repaired;
    }
    throw new GeoBrokerError(
      "No configured repair result",
      409,
      "TASK_REPAIR_EXHAUSTED",
    );
  }

  async deleteTask(taskId: string) {
    this.deletedTasks.push(taskId);
    this.tasks.delete(taskId);
    this.taskResults.delete(taskId);
    this.taskProjectIds.delete(taskId);
    for (const [key, task] of Array.from(this.idempotentTasks.entries())) {
      if (task.localTaskId === taskId) this.idempotentTasks.delete(key);
    }
  }

  async deleteProjectTasks(projectId: string) {
    const taskIds = Array.from(this.taskProjectIds.entries())
      .filter(([, candidateProjectId]) => candidateProjectId === projectId)
      .map(([taskId]) => taskId);
    for (const taskId of taskIds) await this.deleteTask(taskId);
    const fileIds = Array.from(this.fileProjectIds.entries())
      .filter(([, candidateProjectId]) => candidateProjectId === projectId)
      .map(([fileId]) => fileId);
    for (const fileId of fileIds) {
      try {
        await this.deleteAsset(fileId);
      } catch (error) {
        if (!(error instanceof GeoBrokerError) || error.status !== 404) {
          throw error;
        }
      }
    }
    return {
      schemaVersion: 1 as const,
      projectId,
      status: "deleted" as const,
      deletedTasks: taskIds.length,
      deletedFiles: fileIds.length,
      pendingReservations: 0 as const,
    };
  }

  async deleteAsset(fileId: string) {
    if (this.failDeleteFile) throw new Error("delete failed");
    this.deletedFiles.push(fileId);
    this.uploads.delete(fileId);
    this.skillUploads.delete(fileId);
    this.taskInputUploads.delete(fileId);
    this.fileProjectIds.delete(fileId);
  }

  async downloadAsset(fileId?: string) {
    if (fileId) {
      this.downloadedFileIds.push(fileId);
      const error = this.downloadErrors.get(fileId);
      if (error) throw error;
    }
    const bytes =
      (fileId && this.downloadOverrides.get(fileId)) ||
      (fileId && this.uploads.get(fileId)) ||
      this.archive;
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-length": String(bytes.length),
      },
    });
  }

  async promoteArtifact(input: {
    projectId: string;
    idempotencyKey: string;
    sourceLocalAssetId: string;
    filename: string;
    mimeType: "application/zip";
    bytes: number;
    sha256: string;
    kind: "website-final-knowledge-base";
  }) {
    const artifactId = `artifact-${input.sha256}`;
    this.artifactSources.set(artifactId, input.sourceLocalAssetId);
    return {
      artifactId,
      filename: input.filename,
      mimeType: input.mimeType,
      bytes: input.bytes,
      sha256: input.sha256,
    };
  }

  async downloadArtifact(artifactId: string) {
    this.downloadedFileIds.push(artifactId);
    const sourceLocalAssetId = this.artifactSources.get(artifactId);
    const error =
      this.downloadErrors.get(artifactId) ||
      (sourceLocalAssetId
        ? this.downloadErrors.get(sourceLocalAssetId)
        : undefined);
    if (error) throw error;
    const bytes =
      (sourceLocalAssetId
        ? this.downloadOverrides.get(sourceLocalAssetId)
        : undefined) ||
      this.downloadOverrides.get(artifactId) ||
      (sourceLocalAssetId ? this.uploads.get(sourceLocalAssetId) : undefined) ||
      this.uploads.get(artifactId) ||
      this.archive;
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-length": String(bytes.length),
      },
    });
  }

  async createMonitorRun(input: {
    projectId: string;
    question: string;
    platforms: GeoMonitorPlatformId[];
    idempotencyKey: string;
    monitorKeyword?: string;
    screenshot?: 0 | 1;
    region?: { scope: GeoMonitoringEdition; code: string };
  }) {
    if (this.monitorCreateError) throw this.monitorCreateError;
    const existing = this.monitorRuns.get(input.idempotencyKey);
    if (existing) return existing;
    this.monitorCreateInputs.push(input);
    const selectedRegion = input.region
      ? this.monitorRegions[input.region.scope].find(
          (region) => region.code === input.region?.code,
        )
      : undefined;
    if (input.region && !selectedRegion) {
      throw new GeoBrokerError(
        "region is no longer available",
        422,
        "REGION_UNAVAILABLE",
      );
    }
    this.monitorCreates += 1;
    const run: BrokerMonitorRawRun = {
      runId: `monitor-${this.monitorCreates}`,
      status: this.monitorCreateStatus,
      question: input.question,
      platforms: input.platforms,
      repeatPerPlatform: 5,
      expectedItems: input.platforms.length * 5,
      completedItems: 0,
      failedItems: 0,
      nextPollAt: new Date(Date.now() + 300_000).toISOString(),
      ...(input.monitorKeyword ? { monitorKeyword: input.monitorKeyword } : {}),
      screenshot: input.screenshot ?? 0,
      ...(input.region && selectedRegion
        ? {
            region: {
              scope: input.region.scope,
              code: selectedRegion.code,
              label: selectedRegion.label,
            },
          }
        : {}),
    };
    this.monitorRuns.set(input.idempotencyKey, run);
    this.monitorRuns.set(run.runId, run);
    return run;
  }

  async getMonitorRegions(edition: GeoMonitoringEdition) {
    this.monitorRegionReads.push(edition);
    return { edition, regions: this.monitorRegions[edition] };
  }

  async getMonitorRun(runId: string) {
    const run = this.monitorRuns.get(runId);
    if (!run) throw new Error("missing monitor run");
    return run;
  }

  async getMonitorResult(runId: string) {
    this.monitorResultReads += 1;
    if (this.monitorResultError) throw this.monitorResultError;
    return this.monitorResults.get(runId) ?? this.getMonitorRun(runId);
  }

  async downloadMonitorScreenshot(runId: string, recordId: string) {
    this.monitorScreenshotDownloads.push({ runId, recordId });
    if (this.monitorScreenshotError) throw this.monitorScreenshotError;
    return new Response(this.monitorScreenshotBytes, {
      status: 200,
      headers: {
        "content-type": this.monitorScreenshotContentType,
        "content-length": String(this.monitorScreenshotBytes.length),
      },
    });
  }

  async deleteMonitorRun(_projectId: string, runId: string) {
    this.monitorRuns.delete(runId);
    return "deleted" as const;
  }
}

let server: Server;
let baseUrl: string;
const inviteContextByCookie = new Map<string, string>();
let broker: MockBroker;
let paymentCalls: GeoPaymentVerificationInput[];
let paymentCheckoutCalls: GeoPaymentCheckoutInput[];
let paymentSwitchCalls: GeoPaymentCheckoutSwitchInput[];
let paymentStatusCalls: GeoPaymentVerificationInput[];
let paymentCallbackCalls: number;
let servicePaymentCalls: GeoServicePaymentVerificationInput[];
let servicePaymentCheckoutCalls: GeoServicePaymentCheckoutInput[];
let servicePaymentSwitchCalls: GeoServicePaymentCheckoutSwitchInput[];
let serviceBankTransferCalls: GeoServiceBankTransferInput[];
let servicePaymentStatusCalls: GeoServicePaymentVerificationInput[];
let accountProvisionCalls: GeoAccountProvisionRequest[];
let purchaseProvisionCalls: GeoPurchaseProvisionRequestV2[];
let purchaseStatusReads: string[];
let knowledgeImportCalls: Array<{
  projectId: string;
  request: GeoKnowledgeImportRequest;
}>;
let purchaseProvisionResponse: GeoPurchaseProvisionResponseV2;
let manualOrderCreateCalls: GeoManualServiceOrderCreateRequest[];
let manualOrderExternalAuthorizationCalls: Array<{
  reference: string;
  request: GeoManualServiceOrderExternalAuthorizationRequest;
}>;
let manualOrderExternalAuthorizationOverride:
  | Partial<GeoManualServiceOrderResponse["order"]>
  | undefined;
let manualOrderStatusReads: string[];
let manualOrderPaymentCalls: Array<{
  reference: string;
  request: GeoManualServiceOrderPaymentRequest;
}>;
let manualOrderAccountCalls: Array<{
  reference: string;
  request: GeoManualServiceOrderAccountRequest;
}>;
let adminNotificationCalls: GeoAdminNotification[];
let manualOrderResponse: GeoManualServiceOrderResponse;
let knowledgeImportShouldFail: boolean;
let adminNotificationShouldFail: boolean;
let manualOrderAccountShouldRemainPending: boolean;
let paymentAccepted: boolean;
let servicePaymentPaidAt: string;
let projectOrders: Map<string, GeoProjectOrder>;
let projectOrderRegistry: GeoProjectOrderRegistry;
let paymentGateway: GeoPaymentGateway;
let customQuestionValidationStore: MemoryGeoCustomQuestionValidationStore;
let monitorFreeReservationStore: GeoMonitorFreeReservationStore;
const temporaryMonitorStoreDirectories: string[] = [];
let customQuestionValidationNowMs: number;
let knowledgeBaseFinalizerOverride:
  | typeof finalizeKnowledgeBaseCandidate
  | undefined;

const CUSTOM_QUESTION_CLIENT_REQUEST_ID =
  "11111111-1111-4111-8111-111111111111";
const CONTRACT_AUTH_CODE = "frontmind666";
const BANK_TRANSFER_CONFIRMATION_CODE = "frontmind888";

beforeEach(async () => {
  inviteContextByCookie.clear();
  broker = new MockBroker();
  knowledgeBaseFinalizerOverride = undefined;
  customQuestionValidationNowMs = Date.parse("2026-08-01T00:00:00.000Z");
  customQuestionValidationStore = new MemoryGeoCustomQuestionValidationStore();
  monitorFreeReservationStore = new MemoryGeoMonitorFreeReservationStore();
  broker.archive = await fixtureCandidateArchive();
  paymentCalls = [];
  paymentCheckoutCalls = [];
  paymentSwitchCalls = [];
  paymentStatusCalls = [];
  paymentCallbackCalls = 0;
  servicePaymentCalls = [];
  servicePaymentCheckoutCalls = [];
  servicePaymentSwitchCalls = [];
  serviceBankTransferCalls = [];
  servicePaymentStatusCalls = [];
  accountProvisionCalls = [];
  purchaseProvisionCalls = [];
  purchaseStatusReads = [];
  manualOrderCreateCalls = [];
  manualOrderExternalAuthorizationCalls = [];
  manualOrderExternalAuthorizationOverride = undefined;
  manualOrderStatusReads = [];
  manualOrderPaymentCalls = [];
  manualOrderAccountCalls = [];
  adminNotificationCalls = [];
  knowledgeImportCalls = [];
  knowledgeImportShouldFail = false;
  adminNotificationShouldFail = false;
  manualOrderAccountShouldRemainPending = false;
  purchaseProvisionResponse = {
    schemaVersion: 2,
    purchase: {
      reference: "purchase-reference-001",
      projectId: "placeholder-project",
      orderId: "zpay-service-order-001",
      status: "pending_confirmation",
      updatedAt: "2026-07-22T10:12:00.000Z",
      retryable: false,
    },
  };
  manualOrderResponse = {
    schemaVersion: 1,
    order: {
      reference: "manual-order-reference-001",
      projectId: "placeholder-project",
      status: "pending_admin",
      amountFen: 150_000,
      updatedAt: "2026-07-22T10:12:00.000Z",
      retryable: false,
    },
  };
  paymentAccepted = true;
  servicePaymentPaidAt = new Date(Date.now() + 60_000).toISOString();
  projectOrders = new Map();
  projectOrderRegistry = {
    async assertReady() {},
    async upsert(order) {
      projectOrders.set(order.orderId, order);
      return order;
    },
    async commitIntent(intentOrderId, order) {
      const intent = projectOrders.get(intentOrderId);
      if (!intent) throw new Error("missing checkout intent");
      projectOrders.set(intentOrderId, {
        ...intent,
        state: "closed",
        eventAt: order.eventAt,
      });
      projectOrders.set(order.orderId, order);
      return order;
    },
    async findByProject(projectId) {
      const orders = Array.from(projectOrders.values()).filter(
        (order) => order.projectId === projectId,
      );
      return {
        schemaVersion: 1,
        projectId,
        blockDeletion: orders.some(
          (order) =>
            order.state !== "fulfilled" &&
            order.state !== "terminal_failed" &&
            order.state !== "closed",
        ),
        orders,
      };
    },
    async deleteProject(projectId) {
      let deletedOrders = 0;
      for (const [orderId, order] of Array.from(projectOrders.entries())) {
        if (order.projectId !== projectId) continue;
        projectOrders.delete(orderId);
        deletedOrders += 1;
      }
      return { schemaVersion: 1, projectId, deletedOrders };
    },
  };
  paymentGateway = {
    async createCheckout(input) {
      paymentCheckoutCalls.push(input);
      return {
        authorization: "zpay-signed-authorization-placeholder",
        orderId: "zpay-order-001",
        amountFen: input.expectedAmountFen,
        expiresAt: "2027-07-23T10:00:00.000Z",
        action: "https://zpayz.cn/submit.php",
        method: "POST",
        fields: {
          pid: "merchant-test",
          type: input.method,
          money: (input.expectedAmountFen / 100).toFixed(2),
          sign: "test-signature",
          sign_type: "MD5",
        },
      };
    },
    async switchCheckoutMethod(input) {
      paymentSwitchCalls.push(input);
      if (paymentAccepted) {
        throw new GeoPaymentVerificationError(
          "付款已确认，不能再更换支付方式",
          "PAYMENT_ALREADY_CONFIRMED",
          409,
        );
      }
      return {
        authorization: input.authorization,
        orderId: "zpay-order-001",
        amountFen: input.expectedAmountFen,
        expiresAt: input.checkoutExpiresAt,
        action: "https://zpayz.cn/submit.php",
        method: "POST",
        fields: {
          pid: "merchant-test",
          type: input.method,
          out_trade_no: "zpay-order-001",
          money: (input.expectedAmountFen / 100).toFixed(2),
          param: input.authorization,
          sign: "test-switch-signature",
          sign_type: "MD5",
        },
      };
    },
    async getStatus(input) {
      paymentStatusCalls.push(input);
      return {
        status: paymentAccepted ? "paid" : "pending",
        orderId: "zpay-order-001",
        amountFen: input.expectedAmountFen,
        paidAt: paymentAccepted ? "2026-07-22T10:05:00.000Z" : undefined,
      };
    },
    async createServiceCheckout(input) {
      servicePaymentCheckoutCalls.push(input);
      return {
        authorization: "zpay-service-authorization-placeholder",
        orderId: "zpay-service-order-001",
        amountFen: input.expectedAmountFen,
        expiresAt: "2027-07-23T10:00:00.000Z",
        action: "https://zpayz.cn/submit.php",
        method: "POST",
        fields: {
          pid: "merchant-test",
          type: input.method,
          money: (input.expectedAmountFen / 100).toFixed(2),
          sign: "test-service-signature",
          sign_type: "MD5",
        },
      };
    },
    async switchServiceCheckoutMethod(input) {
      servicePaymentSwitchCalls.push(input);
      if (paymentAccepted) {
        throw new GeoPaymentVerificationError(
          "付款已确认，不能再更换支付方式",
          "PAYMENT_ALREADY_CONFIRMED",
          409,
        );
      }
      return {
        authorization: input.authorization,
        orderId: "zpay-service-order-001",
        amountFen: input.expectedAmountFen,
        expiresAt: input.checkoutExpiresAt,
        action: "https://zpayz.cn/submit.php",
        method: "POST",
        fields: {
          pid: "merchant-test",
          type: input.method,
          out_trade_no: "zpay-service-order-001",
          money: (input.expectedAmountFen / 100).toFixed(2),
          param: input.authorization,
          sign: "test-service-switch-signature",
          sign_type: "MD5",
        },
      };
    },
    async confirmServiceBankTransfer(input) {
      serviceBankTransferCalls.push(input);
      if (input.authorization && paymentAccepted) {
        throw new GeoPaymentVerificationError(
          "在线付款已经确认，不能改为对公付款",
          "PAYMENT_ALREADY_CONFIRMED",
          409,
        );
      }
      return {
        orderId: input.orderId,
        tradeNo: `bank:${createHash("sha256")
          .update(input.orderId)
          .digest("hex")
          .slice(0, 48)}`,
        amountFen: input.expectedAmountFen,
        paidAt: servicePaymentPaidAt,
      };
    },
    async getServiceStatus(input) {
      servicePaymentStatusCalls.push(input);
      return {
        status: paymentAccepted ? "paid" : "pending",
        orderId: "zpay-service-order-001",
        amountFen: input.expectedAmountFen,
        paidAt: paymentAccepted ? servicePaymentPaidAt : undefined,
      };
    },
    async verifyCallback(params) {
      paymentCallbackCalls += 1;
      if (params.sign === "ledger-down") {
        throw new GeoPaymentVerificationError(
          "付款已确认，但支付回执暂未安全保存",
          "PAYMENT_LEDGER_UNAVAILABLE",
          503,
        );
      }
      return {
        status:
          params.sign === "review"
            ? ("review_required" as const)
            : ("paid" as const),
        orderId: "zpay-order-001",
        amountFen: 400,
        tradeNo: "zpay-trade-router-test",
        paidAt: "2026-07-22T10:05:00.000Z",
      };
    },
    async verify(input) {
      paymentCalls.push(input);
      if (!paymentAccepted) {
        throw new GeoPaymentVerificationError("payment denied");
      }
      return {
        orderId: "zpay-order-001",
        amountFen: input.expectedAmountFen,
        paidAt: new Date().toISOString(),
      };
    },
    async verifyService(input) {
      servicePaymentCalls.push(input);
      if (!paymentAccepted) {
        throw new GeoPaymentVerificationError("service payment denied");
      }
      return {
        orderId: "zpay-service-order-001",
        amountFen: input.expectedAmountFen,
        paidAt: servicePaymentPaidAt,
      };
    },
  };
  const app = express();
  app.use(
    "/api/geo",
    createGeoRouter({
      broker,
      customQuestionValidationStore,
      monitorFreeReservationStore,
      customQuestionValidationNow: () => customQuestionValidationNowMs,
      knowledgeBaseFinalizer: (input) =>
        knowledgeBaseFinalizerOverride
          ? knowledgeBaseFinalizerOverride(input)
          : finalizeKnowledgeBaseCandidate(input),
      paymentGateway,
      monitorQuestionTranslationWaitMs: 100,
      monitorQuestionTranslationPollMs: 2,
      accountProvisioner: async (request) => {
        accountProvisionCalls.push(request);
        return {
          provision: {
            id: "provision-001",
            projectId: request.project.id,
            orderId: request.order.id,
            contractId: request.contract.id,
            status: "completed",
            completedAt: "2026-07-22T10:20:00.000Z",
          },
          user: {
            id: 42,
            username: request.account.username,
            displayName: request.account.displayName,
            role: "user",
            isActive: true,
          },
        };
      },
      purchaseProvisioner: async (request) => {
        purchaseProvisionCalls.push(request);
        return {
          ...purchaseProvisionResponse,
          purchase: {
            ...purchaseProvisionResponse.purchase,
            projectId: request.project.id,
            orderId: request.order.id,
            marketEdition: request.marketEdition,
          },
        };
      },
      purchaseStatusReader: async (reference) => {
        purchaseStatusReads.push(reference);
        return purchaseProvisionResponse;
      },
      manualOrderCreator: async (request) => {
        manualOrderCreateCalls.push(request);
        const marketEdition = request.marketEdition ?? "domestic";
        const domesticAmountFen =
          request.service.purchasedQuestion.category === "product_scenario"
            ? 150_000
            : 200_000;
        const response: GeoManualServiceOrderResponse = {
          ...manualOrderResponse,
          order: {
            ...manualOrderResponse.order,
            projectId: request.project.id,
            marketEdition,
            amountFen:
              domesticAmountFen * (marketEdition === "overseas" ? 2 : 1),
          },
        };
        manualOrderResponse = response;
        return response;
      },
      manualOrderExternalAuthorizer: async (reference, request) => {
        manualOrderExternalAuthorizationCalls.push({ reference, request });
        const {
          contractId: _contractId,
          signingUrl: _signingUrl,
          signedAt: _signedAt,
          ...orderWithoutElectronicContract
        } = manualOrderResponse.order;
        manualOrderResponse = {
          ...manualOrderResponse,
          order: {
            ...orderWithoutElectronicContract,
            status: "payment_required",
            contractAuthorizationMode: "external_wechat",
            contractAuthorizedAt: request.authorization.authorizedAt,
            updatedAt: request.authorization.authorizedAt,
            ...manualOrderExternalAuthorizationOverride,
          },
        };
        return manualOrderResponse;
      },
      manualOrderStatusReader: async (reference) => {
        manualOrderStatusReads.push(reference);
        return manualOrderResponse;
      },
      manualOrderPaymentConfirmer: async (reference, request) => {
        manualOrderPaymentCalls.push({ reference, request });
        manualOrderResponse = {
          ...manualOrderResponse,
          order: {
            ...manualOrderResponse.order,
            status: "account_setup_required",
            updatedAt: "2026-07-22T10:18:00.000Z",
          },
        };
        return manualOrderResponse;
      },
      manualOrderAccountSubmitter: async (reference, request) => {
        const existing = manualOrderAccountCalls.find(
          (call) => call.reference === reference,
        );
        if (
          existing &&
          JSON.stringify(existing.request) !== JSON.stringify(request)
        ) {
          throw new GeoAccountProvisioningError(
            "账号资料与首次提交不一致",
            409,
            "IDEMPOTENCY_CONFLICT",
          );
        }
        manualOrderAccountCalls.push({ reference, request });
        manualOrderResponse = {
          ...manualOrderResponse,
          order: {
            ...manualOrderResponse.order,
            status: manualOrderAccountShouldRemainPending
              ? "activation_required"
              : "active",
            provisioningReference: "purchase-reference-001",
            updatedAt: "2026-07-22T10:19:00.000Z",
          },
          account:
            request.account.mode === "create"
              ? {
                  username: request.account.username,
                  displayName: request.account.displayName,
                  workspaceUrl: "https://dashboard.frontmind.net/",
                }
              : {
                  username: "existing.user",
                  displayName: "Existing User",
                  workspaceUrl: "https://dashboard.frontmind.net/",
                },
        };
        return manualOrderResponse;
      },
      adminNotifier: {
        async notify(notification) {
          adminNotificationCalls.push(notification);
          if (adminNotificationShouldFail) {
            throw new Error("notification unavailable");
          }
          return { delivery: "delivered" };
        },
      },
      knowledgeImporter: async (projectId, request) => {
        knowledgeImportCalls.push({ projectId, request });
        if (knowledgeImportShouldFail) {
          return {
            schemaVersion: 2,
            knowledgeImport: {
              id: "knowledge-import-001",
              projectId,
              status: "failed",
              updatedAt: "2026-07-22T10:14:00.000Z",
              retryable: true,
              message: "知识库 ZIP 必须只包含一个企业知识库根目录",
            },
          };
        }
        return {
          schemaVersion: 2,
          knowledgeImport: {
            id: "knowledge-import-001",
            projectId,
            status: "ready",
            updatedAt: "2026-07-22T10:14:00.000Z",
            retryable: false,
            workspaceUrl: "https://dashboard.frontmind.net/",
          },
        };
      },
      projectOrderRegistry,
      env: {
        NODE_ENV: "test",
        FRONTMIND_WEBSITE_KB_V4_WRITER_ENABLED: "true",
        FRONTMIND_GEO_INVITE_CODE: "frontmind666",
        FRONTMIND_GEO_SESSION_SECRET:
          "test-session-secret-at-least-16-characters",
        FRONTMIND_GEO_CONTRACT_AUTH_CODE: CONTRACT_AUTH_CODE,
      },
    }),
  );
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/geo`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await Promise.all(
    temporaryMonitorStoreDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe("GEO API", () => {
  it("fails GEO router initialization when the admin webhook is only partially configured", () => {
    expect(() =>
      createGeoRouter({
        broker,
        customQuestionValidationStore:
          new MemoryGeoCustomQuestionValidationStore(),
        env: {
          NODE_ENV: "test",
          FRONTMIND_GEO_INVITE_CODE: "frontmind666",
          FRONTMIND_GEO_SESSION_SECRET:
            "test-session-secret-at-least-16-characters",
          FRONTMIND_GEO_ADMIN_WEBHOOK_URL:
            "https://notifications.example.com/frontmind/geo",
        },
      }),
    ).toThrow(GeoAdminNotificationConfigurationError);
  });

  it("validates invitations with an HttpOnly session cookie", async () => {
    const denied = await fetch(`${baseUrl}/invite/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: "wrong",
        businessOwnerName: "测试商务负责人",
      }),
    });
    expect(denied.status).toBe(401);
    expect(await denied.json()).toMatchObject({
      ok: false,
      error: { code: "INVALID_INVITE_CODE" },
    });

    const allowed = await verifyInvite();
    expect(allowed.response.status).toBe(200);
    expect(allowed.response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(allowed.response.headers.get("set-cookie")).toContain(
      "Max-Age=31536000",
    );
  });

  it("seals the normalized business owner into a 24-hour session-bound invite context", async () => {
    const invited = await verifyInvite("", "  Ａｌｉｃｅ　张三  ");
    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    const context = codec.open<{
      schemaVersion: number;
      sessionNonce: string;
      businessOwnerName: string;
      contextId: string;
    }>(invited.inviteContextToken, "invite-context");
    const sessionToken = parseCookies(invited.cookie).get(
      "frontmind_geo_session",
    );
    expect(sessionToken).toBeTruthy();
    const session = codec.open<{ scope: string; nonce: string }>(
      sessionToken!,
      "session",
    );

    expect(invited.businessOwnerName).toBe("Alice 张三");
    expect(context.expiresAt - context.issuedAt).toBe(24 * 60 * 60 * 1000);
    expect(context.value).toMatchObject({
      schemaVersion: 1,
      sessionNonce: session.value.nonce,
      businessOwnerName: "Alice 张三",
    });
    expect(context.value.contextId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it.each(["Alice\n张三", "Alice‮张三", "Alice(张三)", "Alice/张三"])(
    "rejects unsafe business-owner text before issuing an invite context: %s",
    async (businessOwnerName) => {
      const response = await fetch(`${baseUrl}/invite/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "frontmind666", businessOwnerName }),
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: "INVALID_REQUEST" },
      });
      expect(response.headers.get("set-cookie")).toBeNull();
    },
  );

  it("requires an intact invite context from the same browser session", async () => {
    const owner = await verifyInvite();
    const otherBrowser = await verifyInvite();
    const requestUpload = (cookie: string, inviteContextToken?: string) =>
      fetch(`${baseUrl}/uploads/init`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          ...(inviteContextToken ? { inviteContextToken } : {}),
          filename: "blocked.pdf",
          contentType: "application/pdf",
          sizeBytes: 3,
        }),
      });
    const requestProject = (cookie: string, inviteContextToken?: string) =>
      fetch(`${baseUrl}/projects`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          ...(inviteContextToken ? { inviteContextToken } : {}),
          input: "Acme",
          attachments: [],
        }),
      });

    const missingUpload = await requestUpload(owner.cookie);
    expect(missingUpload.status).toBe(400);
    await expect(missingUpload.json()).resolves.toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });

    const tamperedUpload = await requestUpload(
      owner.cookie,
      `${owner.inviteContextToken}x`,
    );
    expect(tamperedUpload.status).toBe(401);
    await expect(tamperedUpload.json()).resolves.toMatchObject({
      error: { code: "INVITE_CONTEXT_INVALID" },
    });

    const crossSessionUpload = await requestUpload(
      otherBrowser.cookie,
      owner.inviteContextToken,
    );
    expect(crossSessionUpload.status).toBe(403);
    await expect(crossSessionUpload.json()).resolves.toMatchObject({
      error: { code: "INVITE_CONTEXT_SESSION_MISMATCH" },
    });

    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    const sessionToken = parseCookies(owner.cookie).get(
      "frontmind_geo_session",
    )!;
    const session = codec.open<{ scope: string; nonce: string }>(
      sessionToken,
      "session",
    ).value;
    const expiredContext = codec.seal(
      "invite-context",
      {
        schemaVersion: 1,
        sessionNonce: session.nonce,
        businessOwnerName: owner.businessOwnerName,
        contextId: "11111111-1111-4111-8111-111111111111",
      },
      -1,
    );
    const expiredUpload = await requestUpload(owner.cookie, expiredContext);
    expect(expiredUpload.status).toBe(401);
    await expect(expiredUpload.json()).resolves.toMatchObject({
      error: { code: "INVITE_CONTEXT_INVALID" },
    });

    expect(broker.createdFileIds).toEqual([]);
    expect(broker.uploadAttempts).toEqual([]);
    expect(broker.taskBusinessOwnerNames).toEqual([]);

    const missing = await requestProject(owner.cookie);
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toMatchObject({
      error: { code: "INVALID_REQUEST" },
    });

    const tampered = await requestProject(
      owner.cookie,
      `${owner.inviteContextToken}x`,
    );
    expect(tampered.status).toBe(401);
    await expect(tampered.json()).resolves.toMatchObject({
      error: { code: "INVITE_CONTEXT_INVALID" },
    });

    const crossSession = await requestProject(
      otherBrowser.cookie,
      owner.inviteContextToken,
    );
    expect(crossSession.status).toBe(403);
    await expect(crossSession.json()).resolves.toMatchObject({
      error: { code: "INVITE_CONTEXT_SESSION_MISMATCH" },
    });
    const expiredProject = await requestProject(owner.cookie, expiredContext);
    expect(expiredProject.status).toBe(401);
    await expect(expiredProject.json()).resolves.toMatchObject({
      error: { code: "INVITE_CONTEXT_INVALID" },
    });
    expect(broker.createdFileIds).toEqual([]);
    expect(broker.uploadAttempts).toEqual([]);
    expect(broker.taskBusinessOwnerNames).toEqual([]);
  });

  it("sends the business owner only as initial task metadata and never in model inputs", async () => {
    const invited = await verifyInvite("", "  Ａｌｉｃｅ　张三  ");
    const created = await jsonRequest("/projects", invited.cookie, {
      method: "POST",
      body: {
        inviteContextToken: invited.inviteContextToken,
        input: "Acme",
        attachments: [],
      },
    });
    expect(created.response.status).toBe(201);
    expect(broker.taskBusinessOwnerNames).toEqual(["Alice 张三"]);
    const privateValues = ["Alice 张三", invited.inviteContextToken];
    const modelInputs = [
      ...broker.prompts,
      ...Array.from(broker.taskInputUploads.values(), (value) =>
        value.toString("utf8"),
      ),
    ].join("\n");
    for (const privateValue of privateValues) {
      expect(modelInputs).not.toContain(privateValue);
    }

    const initial = created.body as Record<string, string>;
    const initialProject = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ knowledgeBaseTaskId: string }>(
      initial.projectToken,
      "project",
    ).value;
    broker.tasks.set(initialProject.knowledgeBaseTaskId, {
      id: initialProject.knowledgeBaseTaskId,
      status: "completed",
      output: [
        {
          id: "message-kb-owner",
          type: "message",
          role: "assistant",
          content: [
            {
              type: "output_file",
              file_id: "archive-1",
              filename: "Acme.zip",
            },
          ],
        },
      ],
    });
    const recommended = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}/questions`,
      invited.cookie,
      { method: "POST", body: {} },
    );
    expect(recommended.response.status).toBe(201);
    expect(broker.taskBusinessOwnerNames).toEqual(["Alice 张三", undefined]);
  });

  it("keeps the invite context out of the deterministic project identity", async () => {
    const first = await verifyInvite();
    const refreshed = await verifyInvite(first.cookie);
    expect(refreshed.inviteContextToken).not.toBe(first.inviteContextToken);
    const clientRequestId = "22222222-2222-4222-8222-222222222222";
    const create = (cookie: string, inviteContextToken: string) =>
      jsonRequest("/projects", cookie, {
        method: "POST",
        body: {
          inviteContextToken,
          clientRequestId,
          input: "Acme",
          attachments: [],
        },
      });

    const firstCreate = await create(first.cookie, first.inviteContextToken);
    const replay = await create(refreshed.cookie, refreshed.inviteContextToken);
    expect(firstCreate.response.status).toBe(201);
    expect(replay.response.status).toBe(201);
    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    const firstValue = codec.open<{ projectId: string }>(
      (firstCreate.body as Record<string, string>).projectToken,
      "project",
    ).value;
    const replayValue = codec.open<{ projectId: string }>(
      (replay.body as Record<string, string>).projectToken,
      "project",
    ).value;
    expect(replayValue.projectId).toBe(firstValue.projectId);
  });

  it("keeps pre-owner project capabilities readable", async () => {
    const invited = await verifyInvite();
    const created = await jsonRequest("/projects", invited.cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    expect(created.response.status).toBe(201);
    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    const value = codec.open<Record<string, unknown>>(
      (created.body as Record<string, string>).projectToken,
      "project",
    ).value;
    expect(value.businessOwnerName).toBe("测试商务负责人");
    const { businessOwnerName: _businessOwnerName, ...legacyValue } = value;
    const legacyToken = codec.seal(
      "project",
      legacyValue,
      365 * 24 * 60 * 60 * 1000,
    );

    const restored = await jsonRequest(
      `/projects/${encodeURIComponent(legacyToken)}`,
      invited.cookie,
    );
    expect(restored.response.status).toBe(200);
    expect(restored.body).toMatchObject({
      project: { id: value.projectId },
    });
  });

  it("refreshes an existing browser session without changing project ownership", async () => {
    const first = await verifyInvite();
    const created = await jsonRequest("/projects", first.cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const projectToken = (created.body as Record<string, string>).projectToken;

    const refreshed = await verifyInvite(first.cookie);
    expect(refreshed.response.status).toBe(200);
    expect(refreshed.cookie).not.toBe(first.cookie);

    const restored = await jsonRequest(
      `/projects/${encodeURIComponent(projectToken)}`,
      refreshed.cookie,
    );
    expect(restored.response.status).toBe(200);
  });

  it("never writes an unknown error payload, question, or credential to logs", async () => {
    const privateMarkers = [
      "PRIVATE_QUESTION_MARKER",
      "PRIVATE_TASK_OUTPUT_MARKER",
      "PRIVATE_CREDENTIAL_MARKER",
    ];
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    broker.createTaskErrors.push(new Error(privateMarkers.join(" ")));

    try {
      const { cookie } = await verifyInvite();
      const response = await jsonRequest("/projects", cookie, {
        method: "POST",
        body: { input: "Acme", attachments: [] },
      });
      expect(response.response.status).toBe(500);
      expect(response.body).toMatchObject({
        error: { code: "INTERNAL_ERROR" },
      });
      const serializedLogs = JSON.stringify(log.mock.calls);
      for (const marker of privateMarkers) {
        expect(serializedLogs).not.toContain(marker);
      }
      expect(log).toHaveBeenCalledWith("[GEO API]", {
        event: "unhandled_error",
        diagnosticCode: "INTERNAL_ERROR",
      });
    } finally {
      log.mockRestore();
    }
  });

  it("rejects every project-token operation from another browser session", async () => {
    const owner = await verifyInvite();
    const otherBrowser = await verifyInvite();
    const created = await jsonRequest("/projects", owner.cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const projectToken = (created.body as Record<string, string>).projectToken;
    const encoded = encodeURIComponent(projectToken);

    for (const [pathname, method, body] of [
      [`/projects/${encoded}`, "GET", undefined],
      [`/projects/${encoded}/questions`, "POST", {}],
      [
        `/projects/${encoded}/questions/custom`,
        "POST",
        {
          question: "Acme 好不好？",
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        },
      ],
      [`/projects/${encoded}/payments`, "POST", {}],
      [`/projects/${encoded}/payments/status`, "POST", {}],
      [`/projects/${encoded}/services/contracts`, "POST", {}],
      [`/projects/${encoded}/services/contracts/status`, "POST", {}],
      [`/projects/${encoded}/services/payments`, "POST", {}],
      [`/projects/${encoded}/services/payments/switch`, "POST", {}],
      [`/projects/${encoded}/services/payments/status`, "POST", {}],
      [
        `/projects/${encoded}/services/payments/bank-transfer/confirm`,
        "POST",
        {},
      ],
      [`/projects/${encoded}/services/start`, "POST", {}],
      [`/projects/${encoded}/services/account`, "POST", {}],
      [`/projects/${encoded}/services/account/status`, "POST", {}],
      [`/projects/${encoded}/monitoring`, "POST", {}],
      [`/projects/${encoded}/assessment`, "POST", {}],
      [`/projects/${encoded}/optimization-forecast`, "POST", {}],
      [`/projects/${encoded}/archive`, "GET", undefined],
      [`/projects/${encoded}`, "DELETE", undefined],
    ] as const) {
      const response = await jsonRequest(pathname, otherBrowser.cookie, {
        method,
        body,
      });
      expect(response.response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: { code: "PROJECT_SESSION_MISMATCH" },
      });
    }
  });

  it("fails closed when production uses a public placeholder session secret", async () => {
    const app = express();
    app.use(
      "/api/geo",
      createGeoRouter({
        broker,
        customQuestionValidationStore:
          new MemoryGeoCustomQuestionValidationStore(),
        env: {
          NODE_ENV: "production",
          FRONTMIND_GEO_INVITE_CODE: "frontmind666",
          FRONTMIND_GEO_SESSION_SECRET:
            "replace-with-at-least-32-random-characters",
        },
      }),
    );
    const placeholderServer = app.listen(0);
    await new Promise<void>((resolve) =>
      placeholderServer.once("listening", resolve),
    );
    try {
      const port = (placeholderServer.address() as AddressInfo).port;
      const response = await fetch(
        `http://127.0.0.1:${port}/api/geo/invite/verify`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            code: "frontmind666",
            businessOwnerName: "测试商务负责人",
          }),
        },
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        error: { code: "GEO_NOT_CONFIGURED" },
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        placeholderServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it.each(["frontmind666", "short-code", "replace-with-invite-code"])(
    "fails closed when production uses an unsafe invite code: %s",
    async (unsafeInviteCode) => {
      const app = express();
      app.use(
        "/api/geo",
        createGeoRouter({
          broker,
          projectOrderRegistry,
          customQuestionValidationStore:
            new MemoryGeoCustomQuestionValidationStore(),
          env: {
            NODE_ENV: "production",
            FRONTMIND_GEO_INVITE_CODE: unsafeInviteCode,
            FRONTMIND_GEO_SESSION_SECRET:
              "production-session-secret-with-enough-entropy-20260728",
          },
        }),
      );
      const unsafeInviteServer = app.listen(0);
      await new Promise<void>((resolve) =>
        unsafeInviteServer.once("listening", resolve),
      );
      try {
        const port = (unsafeInviteServer.address() as AddressInfo).port;
        const response = await fetch(
          `http://127.0.0.1:${port}/api/geo/invite/verify`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              code: unsafeInviteCode,
              businessOwnerName: "测试商务负责人",
            }),
          },
        );
        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({
          error: { code: "GEO_NOT_CONFIGURED" },
        });
      } finally {
        await new Promise<void>((resolve, reject) =>
          unsafeInviteServer.close((error) =>
            error ? reject(error) : resolve(),
          ),
        );
      }
    },
  );

  it.each(["", "previous-production-contract-code"])(
    "keeps the fixed contract code when production has a legacy override: %s",
    async (legacyContractCode) => {
      const app = express();
      app.use(
        "/api/geo",
        createGeoRouter({
          broker,
          projectOrderRegistry,
          customQuestionValidationStore:
            new MemoryGeoCustomQuestionValidationStore(),
          env: {
            NODE_ENV: "production",
            FRONTMIND_GEO_INVITE_CODE: "secure-production-invite-20260802",
            FRONTMIND_GEO_SESSION_SECRET:
              "production-session-secret-with-enough-entropy-20260802",
            FRONTMIND_GEO_CONTRACT_AUTH_CODE: legacyContractCode,
          },
        }),
      );
      const contractServer = app.listen(0);
      await new Promise<void>((resolve) =>
        contractServer.once("listening", resolve),
      );
      try {
        const port = (contractServer.address() as AddressInfo).port;
        const response = await fetch(
          `http://127.0.0.1:${port}/api/geo/invite/verify`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              code: "secure-production-invite-20260802",
              businessOwnerName: "测试商务负责人",
            }),
          },
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
          ok: true,
        });
      } finally {
        await new Promise<void>((resolve, reject) =>
          contractServer.close((error) => (error ? reject(error) : resolve())),
        );
      }
    },
  );

  it("fails closed when a production session secret has fewer than 32 characters", async () => {
    const app = express();
    app.use(
      "/api/geo",
      createGeoRouter({
        broker,
        projectOrderRegistry,
        customQuestionValidationStore:
          new MemoryGeoCustomQuestionValidationStore(),
        env: {
          NODE_ENV: "production",
          FRONTMIND_GEO_INVITE_CODE: "secure-production-invite-20260728",
          FRONTMIND_GEO_SESSION_SECRET: "only-24-characters-long",
        },
      }),
    );
    const shortSecretServer = app.listen(0);
    await new Promise<void>((resolve) =>
      shortSecretServer.once("listening", resolve),
    );
    try {
      const port = (shortSecretServer.address() as AddressInfo).port;
      const response = await fetch(
        `http://127.0.0.1:${port}/api/geo/invite/verify`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            code: "secure-production-invite-20260728",
            businessOwnerName: "测试商务负责人",
          }),
        },
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        error: { code: "GEO_NOT_CONFIGURED" },
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        shortSecretServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("derives stable opaque upload keys from the session, request id, and attachment index", async () => {
    const { cookie } = await verifyInvite();
    const request = {
      method: "POST" as const,
      body: {
        filename: "catalog.pdf",
        contentType: "application/pdf",
        sizeBytes: 3,
        clientRequestId: "11111111-1111-4111-8111-111111111111",
        attachmentIndex: 0,
      },
    };
    const createdBefore = broker.createdFileIds.length;
    const keysBefore = broker.fileCreateOperationKeys.length;

    const first = await jsonRequest("/uploads/init", cookie, request);
    const replay = await jsonRequest("/uploads/init", cookie, request);
    const next = await jsonRequest("/uploads/init", cookie, {
      ...request,
      body: { ...request.body, attachmentIndex: 1 },
    });

    expect(first.response.status).toBe(201);
    expect(replay.response.status).toBe(200);
    expect(next.response.status).toBe(201);
    expect((first.body as any).fileId).toBe((replay.body as any).fileId);
    expect((next.body as any).fileId).not.toBe((first.body as any).fileId);
    expect(first.body).toMatchObject({
      status: "pending",
      replayed: false,
    });
    expect(replay.body).toMatchObject({
      status: "pending",
      replayed: true,
      traceId: (first.body as any).traceId,
    });
    expect(
      new GeoTokenCodec("test-session-secret-at-least-16-characters").open<
        Record<string, unknown>
      >((first.body as any).uploadToken, "upload").value,
    ).toMatchObject({ attachmentIndex: 0 });
    expect(broker.createdFileIds).toHaveLength(createdBefore + 2);
    const keys = broker.fileCreateOperationKeys.slice(keysBefore);
    expect(keys).toHaveLength(3);
    expect(keys[0]).toMatch(/^geo-upload-init:v1:[a-f0-9]{64}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("charges one stable upload operation only once against the byte quota", async () => {
    const { cookie } = await verifyInvite();
    const clientRequestId = "11111111-1111-4111-8111-111111111111";
    const initialize = (attachmentIndex: number, sizeBytes: number) =>
      jsonRequest("/uploads/init", cookie, {
        method: "POST",
        body: {
          filename: `catalog-${attachmentIndex}.pdf`,
          contentType: "application/pdf",
          sizeBytes,
          clientRequestId,
          attachmentIndex,
        },
      });
    const fiftyMiB = 50 * 1024 * 1024;

    const first = await initialize(0, fiftyMiB);
    const replay = await initialize(0, fiftyMiB);
    const second = await initialize(1, fiftyMiB);
    const third = await initialize(2, fiftyMiB);
    const fourth = await initialize(3, fiftyMiB);
    const overQuota = await initialize(4, 1);

    expect(first.response.status).toBe(201);
    expect(replay.response.status).toBe(200);
    expect(replay.body).toMatchObject({ replayed: true });
    expect(
      [second, third, fourth].map(({ response }) => response.status),
    ).toEqual([201, 201, 201]);
    expect(overQuota.response.status).toBe(429);
    expect(overQuota.body).toMatchObject({
      error: { code: "SESSION_RATE_LIMITED" },
    });
  });

  it("charges every upload init request count while charging stable bytes once", async () => {
    const { cookie } = await verifyInvite();
    const request = {
      method: "POST" as const,
      body: {
        filename: "stable.pdf",
        contentType: "application/pdf",
        sizeBytes: 3,
        clientRequestId: "11111111-1111-4111-8111-111111111111",
        attachmentIndex: 0,
      },
    };
    const operationKeysBefore = broker.fileCreateOperationKeys.length;

    for (let invocation = 0; invocation < 20; invocation += 1) {
      const response = await jsonRequest("/uploads/init", cookie, request);
      expect(response.response.status).toBe(invocation === 0 ? 201 : 200);
      expect(response.body).toMatchObject({
        status: "pending",
        replayed: invocation > 0,
      });
    }
    const rateLimited = await jsonRequest("/uploads/init", cookie, request);

    expect(rateLimited.response.status).toBe(429);
    expect(rateLimited.body).toMatchObject({
      error: { code: "SESSION_RATE_LIMITED" },
    });
    expect(broker.fileCreateOperationKeys.length - operationKeysBefore).toBe(
      20,
    );
    expect(
      new Set(broker.fileCreateOperationKeys.slice(operationKeysBefore)).size,
    ).toBe(1);
  });

  it("keeps legacy upload init compatible and requires new identity fields as a pair", async () => {
    const { cookie } = await verifyInvite();
    const legacy = await jsonRequest("/uploads/init", cookie, {
      method: "POST",
      body: {
        filename: "legacy.pdf",
        contentType: "application/pdf",
        sizeBytes: 3,
      },
    });
    expect(legacy.response.status).toBe(201);

    for (const identity of [
      { clientRequestId: "11111111-1111-4111-8111-111111111111" },
      { attachmentIndex: 0 },
    ]) {
      const invalid = await jsonRequest("/uploads/init", cookie, {
        method: "POST",
        body: {
          filename: "invalid.pdf",
          contentType: "application/pdf",
          sizeBytes: 3,
          ...identity,
        },
      });
      expect(invalid.response.status).toBe(400);
      expect(invalid.body).toMatchObject({
        error: { code: "INVALID_REQUEST" },
      });
    }
  });

  it("maps Dashboard upload contract rejection to a Website 502", async () => {
    const { cookie } = await verifyInvite();
    const createAsset = broker.createAsset.bind(broker);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    broker.createAsset = async () => {
      throw new GeoBrokerError(
        "Dashboard rejected the internal contract",
        400,
        "AGENT_REQUEST_FAILED",
      );
    };
    try {
      const response = await jsonRequest("/uploads/init", cookie, {
        method: "POST",
        body: {
          filename: "catalog.pdf",
          contentType: "application/pdf",
          sizeBytes: 3,
          clientRequestId: "11111111-1111-4111-8111-111111111111",
          attachmentIndex: 0,
        },
      });
      expect(response.response.status).toBe(502);
      expect(response.body).toMatchObject({
        error: { code: "GEO_UPLOAD_BROKER_CONTRACT_ERROR" },
      });
    } finally {
      broker.createAsset = createAsset;
      consoleError.mockRestore();
    }
  });

  it("accepts upload capabilities only in the private header", async () => {
    const { cookie } = await verifyInvite();
    const initialized = await jsonRequest("/uploads/init", cookie, {
      method: "POST",
      body: {
        filename: "catalog.pdf",
        contentType: "application/pdf",
        sizeBytes: 3,
        clientRequestId: "12121212-1212-4121-8121-121212121212",
        attachmentIndex: 0,
      },
    });
    const ticket = initialized.body as Record<string, string>;

    const queryOnly = await fetch(
      `${baseUrl}/uploads/status?token=${encodeURIComponent(ticket.uploadToken)}`,
      { headers: { cookie } },
    );
    expect(queryOnly.status).toBe(400);
    await expect(queryOnly.json()).resolves.toMatchObject({
      error: { code: "UPLOAD_TOKEN_REQUIRED" },
    });

    const headerOnly = await fetch(`${baseUrl}/uploads/status`, {
      headers: { cookie, "x-geo-upload-token": ticket.uploadToken },
    });
    expect(headerOnly.status).toBe(200);
  });

  it("supports proxy upload and attachment-only project creation with opaque task ids", async () => {
    const { cookie } = await verifyInvite();
    const initialized = await jsonRequest("/uploads/init", cookie, {
      method: "POST",
      body: {
        filename: "catalog.pdf",
        contentType: "application/pdf",
        sizeBytes: 3,
      },
    });
    expect(initialized.response.status).toBe(201);
    const ticket = initialized.body as Record<string, string>;

    const uploaded = await fetch(`${baseUrl}/uploads/proxy`, {
      method: "PUT",
      headers: {
        cookie,
        "content-type": "application/pdf",
        "x-geo-upload-token": ticket.uploadToken,
      },
      body: Buffer.from("pdf"),
    });
    expect(uploaded.status).toBe(200);

    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: {
        input: "",
        attachments: [
          {
            fileId: ticket.fileId,
            filename: ticket.filename,
            uploadToken: ticket.uploadToken,
          },
        ],
      },
    });
    expect(created.response.status).toBe(201);
    const payload = created.body as Record<string, any>;
    const createdProjectJson = JSON.stringify(payload.project);
    expect(createdProjectJson).not.toContain("knowledgeBaseSkillVersion");
    expect(createdProjectJson).not.toContain("knowledgeBaseSkillSha256");
    const sealedValue = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<any>(payload.projectToken, "project").value;
    expect(sealedValue.knowledgeBaseSkillVersion).toBe(7);
    expect(sealedValue.knowledgeBaseSkillSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.projectToken).not.toContain("kb-1");
    expect(payload.project.kbTask.id).toBe("knowledge-base");
    expect(payload.project.kbTask.progress).toBeNull();
    expect(payload.project.kbTask.output).toEqual([]);
    expect(payload.project.executionLog).toMatchObject({
      currentEntryId: "enterprise-analysis",
      entries: [
        {
          id: "enterprise-analysis",
          stage: "enterprise_analysis",
          status: "running",
        },
      ],
    });
    expect(broker.prompts[0]).toContain("不要询问、等待确认");
    expect(broker.prompts[0]).not.toContain("catalog.pdf");
    expect(
      JSON.parse(
        broker.taskInputUploads.get("task-input-file-1")!.toString("utf8"),
      ).data.uploadedFiles,
    ).toEqual(["catalog.pdf"]);
    expect(broker.prompts[0]).not.toContain("# FILE: SKILL.md");
    expect(broker.taskContracts).toEqual([
      PRESALES_CONTRACTS.knowledgeBaseCandidate,
    ]);
    expect(broker.taskAttachments[0]).toEqual([
      {
        file_id: "skill-file-1",
        filename: "website-one-shot-kb-builder.skill.zip",
      },
      {
        file_id: "task-input-file-1",
        filename: "frontmind-website-kb-task-input.json",
      },
      { file_id: ticket.fileId, filename: "catalog.pdf" },
    ]);
    expect(
      broker.skillUploads.get("skill-file-1")?.subarray(0, 4).toString("hex"),
    ).toBe("504b0304");
    expect(broker.prompts[0]).toContain(
      createHash("sha256")
        .update(broker.skillUploads.get("skill-file-1")!)
        .digest("hex"),
    );
    expect(broker.prompts[0]).toContain(
      createHash("sha256")
        .update(broker.taskInputUploads.get("task-input-file-1")!)
        .digest("hex"),
    );
  });

  it("streams the first browser chunk before EOF and exposes active then uploaded status", async () => {
    const { cookie } = await verifyInvite();
    const initialized = await jsonRequest("/uploads/init", cookie, {
      method: "POST",
      body: {
        filename: "streamed.pdf",
        contentType: "application/pdf",
        sizeBytes: 3,
        clientRequestId: "11111111-1111-4111-8111-111111111111",
        attachmentIndex: 0,
      },
    });
    const ticket = initialized.body as Record<string, string>;
    const originalUploadAsset = broker.uploadAsset.bind(broker);
    const firstChunkSeen = Promise.withResolvers<void>();
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    broker.uploadAsset = async (
      fileId,
      body,
      contentType,
      uploadTicket,
      options,
    ) => {
      expect(Buffer.isBuffer(body)).toBe(false);
      const chunks: Buffer[] = [];
      for await (const chunk of body as Readable) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        if (chunks.length === 1) firstChunkSeen.resolve();
      }
      return originalUploadAsset(
        fileId,
        Buffer.concat(chunks),
        contentType,
        uploadTicket,
        options,
      );
    };

    try {
      const responseDone = Promise.withResolvers<{
        status: number;
        body: Record<string, unknown>;
      }>();
      const request = httpRequest(
        `${baseUrl}/uploads/proxy`,
        {
          method: "PUT",
          headers: {
            cookie,
            "content-type": "application/pdf",
            "content-length": "3",
            "x-geo-upload-attempt": "2",
            "x-geo-upload-token": ticket.uploadToken,
          },
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          response.on("end", () =>
            responseDone.resolve({
              status: response.statusCode || 0,
              body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
            }),
          );
        },
      );
      request.on("error", responseDone.reject);
      request.write("p");

      await firstChunkSeen.promise;
      const active = await fetch(`${baseUrl}/uploads/status`, {
        headers: { cookie, "x-geo-upload-token": ticket.uploadToken },
      });
      expect(active.status).toBe(200);
      await expect(active.json()).resolves.toMatchObject({
        fileId: ticket.fileId,
        assetStatus: "pending",
        transferState: "uploading",
        declaredBytes: 3,
        receivedBytes: 1,
        traceId: ticket.traceId,
      });

      request.end("df");
      await expect(responseDone.promise).resolves.toMatchObject({
        status: 200,
        body: { status: "uploaded", traceId: ticket.traceId },
      });
      const completed = await fetch(`${baseUrl}/uploads/status`, {
        headers: { cookie, "x-geo-upload-token": ticket.uploadToken },
      });
      await expect(completed.json()).resolves.toMatchObject({
        assetStatus: "uploaded",
        transferState: "idle",
        declaredBytes: 3,
        receivedBytes: 3,
      });
      const replayed = await jsonRequest("/uploads/init", cookie, {
        method: "POST",
        body: {
          filename: "streamed.pdf",
          contentType: "application/pdf",
          sizeBytes: 3,
          clientRequestId: "11111111-1111-4111-8111-111111111111",
          attachmentIndex: 0,
        },
      });
      expect(replayed.response.status).toBe(200);
      expect(replayed.body).toMatchObject({
        fileId: ticket.fileId,
        status: "uploaded",
        replayed: true,
        traceId: ticket.traceId,
      });
      const uploadAttemptsBeforeReplay = broker.uploadAttempts.length;
      const replayUpload = await fetch(`${baseUrl}/uploads/proxy`, {
        method: "PUT",
        headers: {
          cookie,
          "content-type": "application/pdf",
          "x-geo-upload-attempt": "3",
          "x-geo-upload-token": ticket.uploadToken,
        },
        body: Buffer.from("pdf"),
      });
      expect(replayUpload.status).toBe(409);
      await expect(replayUpload.json()).resolves.toMatchObject({
        error: { code: "UPLOAD_ALREADY_COMMITTED" },
      });
      expect(broker.uploadAttempts).toHaveLength(uploadAttemptsBeforeReplay);

      const uploadLogs = consoleInfo.mock.calls
        .filter(([label]) => label === "[GEO upload]")
        .map(([, detail]) => detail as Record<string, unknown>);
      expect(
        uploadLogs.find(
          (detail) =>
            detail.event === "downstream_started" && detail.attempt === 2,
        ),
      ).toMatchObject({
        attachmentIndex: 0,
        declaredBytes: 3,
      });
      expect(
        uploadLogs
          .filter(
            (detail) =>
              detail.event === "proxy_progress" && detail.attempt === 2,
          )
          .map((detail) => detail.milestone),
      ).toEqual([25, 50, 75, 100]);
      expect(JSON.stringify(uploadLogs)).not.toContain("streamed.pdf");
      expect(JSON.stringify(uploadLogs)).not.toContain(ticket.uploadToken);
    } finally {
      broker.uploadAsset = originalUploadAsset;
      consoleInfo.mockRestore();
    }
  });

  it("does not treat normal request close after EOF as a caller abort while Dashboard confirms", async () => {
    const { cookie } = await verifyInvite();
    const initialized = await jsonRequest("/uploads/init", cookie, {
      method: "POST",
      body: {
        filename: "delayed-confirmation.pdf",
        contentType: "application/pdf",
        sizeBytes: 3,
      },
    });
    const ticket = initialized.body as Record<string, string>;
    const originalUploadAsset = broker.uploadAsset.bind(broker);
    const bodyReceived = Promise.withResolvers<Buffer>();
    const confirm = Promise.withResolvers<void>();
    broker.uploadAsset = async (fileId, body) => {
      const chunks: Buffer[] = [];
      for await (const chunk of body as Readable) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const bytes = Buffer.concat(chunks);
      bodyReceived.resolve(bytes);
      await confirm.promise;
      broker.uploads.set(fileId, bytes);
      return { status: "uploaded" };
    };

    try {
      const uploaded = fetch(`${baseUrl}/uploads/proxy`, {
        method: "PUT",
        headers: {
          cookie,
          "content-type": "application/pdf",
          "x-geo-upload-token": ticket.uploadToken,
        },
        body: Buffer.from("pdf"),
      });
      await expect(bodyReceived.promise).resolves.toEqual(Buffer.from("pdf"));
      await new Promise<void>((resolve) => setImmediate(resolve));
      const waiting = await fetch(`${baseUrl}/uploads/status`, {
        headers: { cookie, "x-geo-upload-token": ticket.uploadToken },
      });
      await expect(waiting.json()).resolves.toMatchObject({
        assetStatus: "pending",
        transferState: "uploading",
        receivedBytes: 3,
      });
      const duplicate = await fetch(`${baseUrl}/uploads/proxy`, {
        method: "PUT",
        headers: {
          cookie,
          "content-type": "application/pdf",
          "x-geo-upload-token": ticket.uploadToken,
        },
        body: Buffer.from("pdf"),
      });
      expect(duplicate.status).toBe(429);
      await expect(duplicate.json()).resolves.toMatchObject({
        error: { code: "UPLOAD_IN_PROGRESS" },
      });

      confirm.resolve();
      expect((await uploaded).status).toBe(200);
    } finally {
      confirm.resolve();
      broker.uploadAsset = originalUploadAsset;
    }
  });

  it("keeps the completed upload flight alive when the browser drops only the response", async () => {
    const { cookie } = await verifyInvite();
    const initialized = await jsonRequest("/uploads/init", cookie, {
      method: "POST",
      body: {
        filename: "lost-response.pdf",
        contentType: "application/pdf",
        sizeBytes: 3,
      },
    });
    const ticket = initialized.body as Record<string, string>;
    const originalUploadAsset = broker.uploadAsset.bind(broker);
    const bodyCompleted = Promise.withResolvers<Buffer>();
    const confirm = Promise.withResolvers<void>();
    let downstreamSignal: AbortSignal | undefined;
    broker.uploadAsset = async (fileId, body, _type, _ticket, options) => {
      downstreamSignal = options?.signal;
      const chunks: Buffer[] = [];
      for await (const chunk of body as Readable) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const bytes = Buffer.concat(chunks);
      bodyCompleted.resolve(bytes);
      await confirm.promise;
      broker.uploads.set(fileId, bytes);
      return { status: "uploaded" };
    };

    const browserController = new AbortController();
    const browserRequest = fetch(`${baseUrl}/uploads/proxy`, {
      method: "PUT",
      headers: {
        cookie,
        "content-type": "application/pdf",
        "x-geo-upload-token": ticket.uploadToken,
      },
      body: Buffer.from("pdf"),
      signal: browserController.signal,
    });

    try {
      await expect(bodyCompleted.promise).resolves.toEqual(Buffer.from("pdf"));
      browserController.abort();
      await expect(browserRequest).rejects.toMatchObject({
        name: "AbortError",
      });
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(downstreamSignal?.aborted).toBe(false);

      const waiting = await fetch(`${baseUrl}/uploads/status`, {
        headers: { cookie, "x-geo-upload-token": ticket.uploadToken },
      });
      await expect(waiting.json()).resolves.toMatchObject({
        assetStatus: "pending",
        transferState: "uploading",
        receivedBytes: 3,
      });

      confirm.resolve();
      let completed: Record<string, unknown> | undefined;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const response = await fetch(`${baseUrl}/uploads/status`, {
          headers: { cookie, "x-geo-upload-token": ticket.uploadToken },
        });
        completed = (await response.json()) as Record<string, unknown>;
        if (
          completed.assetStatus === "uploaded" &&
          completed.transferState === "idle"
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(completed).toMatchObject({
        assetStatus: "uploaded",
        transferState: "idle",
        receivedBytes: 3,
      });
      expect(downstreamSignal?.aborted).toBe(false);
    } finally {
      confirm.resolve();
      broker.uploadAsset = originalUploadAsset;
    }
  });

  it("requires status reconciliation when Dashboard reports uploaded before browser EOF", async () => {
    const { cookie } = await verifyInvite();
    const initialized = await jsonRequest("/uploads/init", cookie, {
      method: "POST",
      body: {
        filename: "early-dashboard-response.pdf",
        contentType: "application/pdf",
        sizeBytes: 3,
      },
    });
    const ticket = initialized.body as Record<string, string>;
    const originalUploadAsset = broker.uploadAsset.bind(broker);
    const downstreamReturned = Promise.withResolvers<void>();
    broker.uploadAsset = async (fileId) => {
      broker.uploads.set(fileId, Buffer.from("pdf"));
      downstreamReturned.resolve();
      return { status: "uploaded" };
    };

    const responseDone = Promise.withResolvers<{
      status: number;
      body: Record<string, any>;
    }>();
    const request = httpRequest(
      `${baseUrl}/uploads/proxy`,
      {
        method: "PUT",
        headers: {
          cookie,
          "content-type": "application/pdf",
          "content-length": "3",
          "x-geo-upload-token": ticket.uploadToken,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () =>
          responseDone.resolve({
            status: response.statusCode || 0,
            body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
          }),
        );
      },
    );
    request.on("error", responseDone.reject);

    try {
      request.write("p");
      await downstreamReturned.promise;
      await expect(responseDone.promise).resolves.toMatchObject({
        status: 409,
        body: { error: { code: "UPLOAD_ALREADY_COMMITTED" } },
      });
      const status = await fetch(`${baseUrl}/uploads/status`, {
        headers: { cookie, "x-geo-upload-token": ticket.uploadToken },
      });
      await expect(status.json()).resolves.toMatchObject({
        assetStatus: "uploaded",
        transferState: "idle",
        receivedBytes: 3,
      });
    } finally {
      request.destroy();
      broker.uploadAsset = originalUploadAsset;
    }
  });

  it("rejects a mismatched upload MIME type before starting Dashboard transfer", async () => {
    const { cookie } = await verifyInvite();
    const initialized = await jsonRequest("/uploads/init", cookie, {
      method: "POST",
      body: {
        filename: "mime.pdf",
        contentType: "application/pdf",
        sizeBytes: 3,
      },
    });
    const ticket = initialized.body as Record<string, string>;
    const attemptsBefore = broker.uploadAttempts.length;

    const response = await fetch(`${baseUrl}/uploads/proxy`, {
      method: "PUT",
      headers: {
        cookie,
        "content-type": "text/plain",
        "x-geo-upload-token": ticket.uploadToken,
      },
      body: Buffer.from("pdf"),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UPLOAD_TYPE_MISMATCH" },
    });
    expect(broker.uploadAttempts).toHaveLength(attemptsBefore);
  });

  it("rejects short and long chunked bodies and records only a safe stream error code", async () => {
    const { cookie } = await verifyInvite();
    const consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      for (const [attachmentIndex, bytes] of [
        [0, Buffer.from("pd")],
        [1, Buffer.from("long")],
      ] as const) {
        const initialized = await jsonRequest("/uploads/init", cookie, {
          method: "POST",
          body: {
            filename: `size-${attachmentIndex}.pdf`,
            contentType: "application/pdf",
            sizeBytes: 3,
            clientRequestId: "11111111-1111-4111-8111-111111111111",
            attachmentIndex,
          },
        });
        const ticket = initialized.body as Record<string, string>;
        const response = await fetch(`${baseUrl}/uploads/proxy`, {
          method: "PUT",
          headers: {
            cookie,
            "content-type": "application/pdf",
            "x-geo-upload-token": ticket.uploadToken,
          },
          body: Readable.from([bytes]),
          duplex: "half",
        } as RequestInit & { duplex: "half" });

        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
          error: { code: "UPLOAD_SIZE_MISMATCH" },
        });
      }

      const safeWarnings = consoleWarn.mock.calls
        .filter(([label]) => label === "[GEO upload]")
        .map(([, detail]) => detail as Record<string, unknown>);
      expect(safeWarnings).toContainEqual(
        expect.objectContaining({
          event: "transport_error",
          source: "stream",
          code: "UPLOAD_SIZE_MISMATCH",
        }),
      );
      const finishLogs = consoleInfo.mock.calls
        .filter(([label]) => label === "[GEO upload]")
        .map(([, detail]) => detail as Record<string, unknown>)
        .filter((detail) => detail.event === "proxy_finished");
      expect(finishLogs).toContainEqual(
        expect.objectContaining({
          transportErrorSource: "stream",
          transportErrorCode: "UPLOAD_SIZE_MISMATCH",
        }),
      );
      const serializedLogs = JSON.stringify([...safeWarnings, ...finishLogs]);
      expect(serializedLogs).not.toContain("size-0.pdf");
      expect(serializedLogs).not.toContain("size-1.pdf");
    } finally {
      consoleInfo.mockRestore();
      consoleWarn.mockRestore();
    }
  });

  it("allows upload status GET with an explicit zero Content-Length", async () => {
    const { cookie } = await verifyInvite();
    const initialized = await jsonRequest("/uploads/init", cookie, {
      method: "POST",
      body: {
        filename: "status.pdf",
        contentType: "application/pdf",
        sizeBytes: 3,
      },
    });
    const ticket = initialized.body as Record<string, string>;

    const response = await fetch(`${baseUrl}/uploads/status`, {
      headers: {
        cookie,
        "content-length": "0",
        "x-geo-upload-token": ticket.uploadToken,
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      assetStatus: "pending",
      transferState: "idle",
      declaredBytes: 3,
      receivedBytes: 0,
    });
  });

  it("aborts the downstream stream and releases the asset flight when the browser disconnects", async () => {
    const { cookie } = await verifyInvite();
    const initialized = await jsonRequest("/uploads/init", cookie, {
      method: "POST",
      body: {
        filename: "aborted.pdf",
        contentType: "application/pdf",
        sizeBytes: 3,
      },
    });
    const ticket = initialized.body as Record<string, string>;
    const originalUploadAsset = broker.uploadAsset.bind(broker);
    const downstreamStarted = Promise.withResolvers<void>();
    const downstreamAborted = Promise.withResolvers<void>();
    broker.uploadAsset = async (_fileId, _body, _type, _ticket, options) => {
      downstreamStarted.resolve();
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener(
          "abort",
          () => {
            downstreamAborted.resolve();
            reject(
              new GeoBrokerError("caller aborted", 502, "AGENT_UNAVAILABLE"),
            );
          },
          { once: true },
        );
      });
    };

    const request = httpRequest(`${baseUrl}/uploads/proxy`, {
      method: "PUT",
      headers: {
        cookie,
        "content-type": "application/pdf",
        "content-length": "3",
        "x-geo-upload-token": ticket.uploadToken,
      },
    });
    const requestClosed = new Promise<void>((resolve) => {
      request.once("error", () => resolve());
      request.once("close", () => resolve());
    });
    request.write("p");
    await downstreamStarted.promise;
    request.destroy();
    await downstreamAborted.promise;
    await requestClosed;

    try {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const status = await fetch(`${baseUrl}/uploads/status`, {
          headers: { cookie, "x-geo-upload-token": ticket.uploadToken },
        });
        const payload = (await status.json()) as Record<string, unknown>;
        if (payload.transferState === "idle") break;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    } finally {
      broker.uploadAsset = originalUploadAsset;
    }

    const retried = await fetch(`${baseUrl}/uploads/proxy`, {
      method: "PUT",
      headers: {
        cookie,
        "content-type": "application/pdf",
        "x-geo-upload-token": ticket.uploadToken,
      },
      body: Buffer.from("pdf"),
    });
    expect(retried.status).toBe(200);
  });

  it("returns a retryable error after the streamed request has no byte growth", async () => {
    await restartWithUploadTimeouts({
      uploadDataIdleMs: 20,
      uploadConfirmationMs: 1_000,
    });
    const { cookie } = await verifyInvite();
    const initialized = await jsonRequest("/uploads/init", cookie, {
      method: "POST",
      body: {
        filename: "idle.pdf",
        contentType: "application/pdf",
        sizeBytes: 3,
      },
    });
    const ticket = initialized.body as Record<string, string>;
    const chunkSeen = Promise.withResolvers<void>();
    broker.uploadAsset = async (_fileId, body, _type, _ticket, options) => {
      (body as Readable).once("data", () => chunkSeen.resolve());
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener(
          "abort",
          () =>
            reject(
              new GeoBrokerError("idle timeout", 502, "AGENT_UNAVAILABLE"),
            ),
          { once: true },
        );
      });
    };

    const responseDone = Promise.withResolvers<{
      status: number;
      body: Record<string, any>;
    }>();
    const request = httpRequest(
      `${baseUrl}/uploads/proxy`,
      {
        method: "PUT",
        headers: {
          cookie,
          "content-type": "application/pdf",
          "content-length": "3",
          "x-geo-upload-token": ticket.uploadToken,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () =>
          responseDone.resolve({
            status: response.statusCode || 0,
            body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
          }),
        );
      },
    );
    request.on("error", responseDone.reject);
    request.write("p");
    await chunkSeen.promise;

    await expect(responseDone.promise).resolves.toMatchObject({
      status: 408,
      body: { error: { code: "UPLOAD_DATA_IDLE_TIMEOUT" } },
    });
    request.destroy();
  });

  it("bounds only the post-body Dashboard confirmation wait", async () => {
    await restartWithUploadTimeouts({
      uploadDataIdleMs: 1_000,
      uploadConfirmationMs: 20,
    });
    const { cookie } = await verifyInvite();
    const initialized = await jsonRequest("/uploads/init", cookie, {
      method: "POST",
      body: {
        filename: "confirmation.pdf",
        contentType: "application/pdf",
        sizeBytes: 3,
      },
    });
    const ticket = initialized.body as Record<string, string>;
    const bodyCompleted = Promise.withResolvers<void>();
    broker.uploadAsset = async (_fileId, body, _type, _ticket, options) => {
      for await (const _chunk of body as Readable) {
        // Drain the complete request before waiting on Dashboard confirmation.
      }
      bodyCompleted.resolve();
      return new Promise((_resolve, reject) => {
        options?.signal?.addEventListener(
          "abort",
          () =>
            reject(
              new GeoBrokerError(
                "confirmation timeout",
                502,
                "AGENT_UNAVAILABLE",
              ),
            ),
          { once: true },
        );
      });
    };

    const responsePromise = fetch(`${baseUrl}/uploads/proxy`, {
      method: "PUT",
      headers: {
        cookie,
        "content-type": "application/pdf",
        "x-geo-upload-token": ticket.uploadToken,
      },
      body: Buffer.from("pdf"),
    });
    await bodyCompleted.promise;
    const response = await responsePromise;
    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UPLOAD_CONFIRMATION_TIMEOUT" },
    });
  });

  it("uses the immutable v6 writer and v3 finalizer only when the rollout gate is explicitly disabled", async () => {
    const legacyBroker = new MockBroker();
    legacyBroker.archive = await fixtureLegacyCandidateArchive();
    const secret = "legacy-writer-test-session-secret-at-least-32-characters";
    const app = express();
    app.use(
      "/api/geo",
      createGeoRouter({
        broker: legacyBroker,
        projectOrderRegistry,
        customQuestionValidationStore:
          new MemoryGeoCustomQuestionValidationStore(),
        env: {
          NODE_ENV: "test",
          FRONTMIND_WEBSITE_KB_V4_WRITER_ENABLED: "false",
          FRONTMIND_GEO_INVITE_CODE: "frontmind666",
          FRONTMIND_GEO_SESSION_SECRET: secret,
        },
      }),
    );
    const legacyServer = app.listen(0);
    await new Promise<void>((resolve) =>
      legacyServer.once("listening", resolve),
    );
    try {
      const origin = `http://127.0.0.1:${(legacyServer.address() as AddressInfo).port}`;
      const invited = await fetch(`${origin}/api/geo/invite/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: "frontmind666",
          businessOwnerName: "测试商务负责人",
        }),
      });
      const inviteContext = (await invited.json()) as Record<string, string>;
      const cookie = invited.headers.get("set-cookie")!.split(";")[0]!;
      const created = await fetch(`${origin}/api/geo/projects`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          inviteContextToken: inviteContext.inviteContextToken,
          input: "Acme",
          attachments: [],
        }),
      });
      expect(created.status).toBe(201);
      const initial = (await created.json()) as Record<string, any>;
      const codec = new GeoTokenCodec(secret);
      expect(
        codec.open<any>(initial.projectToken, "project").value,
      ).toMatchObject({ knowledgeBaseSkillVersion: 6 });

      const skillArchive = legacyBroker.skillUploads.get("skill-file-1")!;
      const skillZip = await JSZip.loadAsync(skillArchive);
      expect(await skillZip.file("SKILL.md")!.async("string")).toContain(
        "website-lead-candidate-v1.zip",
      );
      expect(
        JSON.parse(await skillZip.file("MANIFEST.json")!.async("string")),
      ).toMatchObject({ name: "website-one-shot-kb-builder" });

      legacyBroker.tasks.set("kb-1", {
        id: "kb-1",
        status: "completed",
        completed_at: "2026-08-10T00:00:00.000Z",
        output: [
          {
            role: "assistant",
            content: [
              {
                type: "output_file",
                file_id: "legacy-candidate",
                filename: "Acme_candidate.zip",
              },
            ],
          },
        ],
      });
      const polled = await fetch(
        `${origin}/api/geo/projects/${encodeURIComponent(initial.projectToken)}`,
        { headers: { cookie } },
      );
      expect(polled.status).toBe(200);
      const completed = (await polled.json()) as Record<string, any>;
      const completedValue = codec.open<any>(
        completed.projectToken,
        "project",
      ).value;
      expect(completedValue.knowledgeBaseArtifact).toMatchObject({
        finalizerVersion: "website-kb-finalizer-v3",
        final: { archiveContractVersion: 3 },
      });
      expect(JSON.stringify(completed.project)).not.toContain(
        "knowledgeBaseSkillVersion",
      );
      expect(JSON.stringify(completed.project)).not.toContain(
        "knowledgeBaseSkillSha256",
      );

      const finalizedUploadCount = legacyBroker.uploads.size;
      const finalizedPromptCount = legacyBroker.prompts.length;
      const switchedApp = express();
      switchedApp.use(
        "/api/geo",
        createGeoRouter({
          broker: legacyBroker,
          projectOrderRegistry,
          customQuestionValidationStore:
            new MemoryGeoCustomQuestionValidationStore(),
          env: {
            NODE_ENV: "test",
            FRONTMIND_WEBSITE_KB_V4_WRITER_ENABLED: "true",
            FRONTMIND_GEO_INVITE_CODE: "frontmind666",
            FRONTMIND_GEO_SESSION_SECRET: secret,
          },
        }),
      );
      const switchedServer = switchedApp.listen(0);
      await new Promise<void>((resolve) =>
        switchedServer.once("listening", resolve),
      );
      try {
        const switchedOrigin = `http://127.0.0.1:${
          (switchedServer.address() as AddressInfo).port
        }`;
        const replayed = await fetch(
          `${switchedOrigin}/api/geo/projects/${encodeURIComponent(
            completed.projectToken,
          )}`,
          { headers: { cookie } },
        );
        expect(replayed.status).toBe(200);
        const replayedPayload = (await replayed.json()) as Record<string, any>;
        expect(
          codec.open<any>(replayedPayload.projectToken, "project").value
            .knowledgeBaseArtifact,
        ).toMatchObject({
          finalizerVersion: "website-kb-finalizer-v3",
          final: { archiveContractVersion: 3 },
        });
        expect(legacyBroker.uploads.size).toBe(finalizedUploadCount);
        expect(legacyBroker.prompts).toHaveLength(finalizedPromptCount);
      } finally {
        await new Promise<void>((resolve, reject) =>
          switchedServer.close((error) => (error ? reject(error) : resolve())),
        );
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        legacyServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("publishes readable schema-v1 content as a v5 partial for a writer-v7 project", async () => {
    broker.archive = await fixtureLegacyCandidateArchive();
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    expect(
      codec.open<any>(initial.projectToken, "project").value,
    ).toMatchObject({ knowledgeBaseSkillVersion: 7 });
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "completed",
      completed_at: "2026-08-10T00:00:00.000Z",
      output: [
        {
          role: "assistant",
          content: [
            {
              type: "output_file",
              file_id: "legacy-candidate-for-v7",
              filename: "website-lead-candidate-v1.zip",
            },
          ],
        },
      ],
    });

    const polled = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}`,
      cookie,
    );
    expect(polled.response.status).toBe(200);
    expect(polled.body).toMatchObject({
      project: {
        status: "ready_for_questions",
        knowledgeBase: { sections: expect.any(Array) },
      },
    });
    const completedValue = codec.open<any>(
      (polled.body as Record<string, any>).projectToken,
      "project",
    ).value;
    expect(completedValue).toMatchObject({
      knowledgeBaseSkillVersion: 7,
      knowledgeBaseArtifact: {
        finalizerVersion: "website-kb-finalizer-v6",
        candidate: {
          quality: {
            state: "partial",
            requiresSupplement: true,
            warningCodes: expect.arrayContaining(["RUN_METADATA_INCOMPLETE"]),
          },
        },
      },
    });
    expect(completedValue.knowledgeBaseCandidateFailure).toBeUndefined();
  });

  it("renames customer uploads that collide with server-owned Skill or task-input files", async () => {
    const { cookie } = await verifyInvite();
    const initialized = await jsonRequest("/uploads/init", cookie, {
      method: "POST",
      body: {
        filename: "website-one-shot-kb-builder.skill.zip",
        contentType: "application/zip",
        sizeBytes: 3,
      },
    });
    expect(initialized.response.status).toBe(201);
    const ticket = initialized.body as Record<string, string>;
    expect(ticket.filename).toMatch(
      /^customer-upload-[a-f0-9]{12}-website-one-shot-kb-builder\.skill\.zip$/,
    );

    const uploaded = await fetch(`${baseUrl}/uploads/proxy`, {
      method: "PUT",
      headers: {
        cookie,
        "content-type": "application/zip",
        "x-geo-upload-token": ticket.uploadToken,
      },
      body: Buffer.from("zip"),
    });
    expect(uploaded.status).toBe(200);

    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: {
        input: "",
        attachments: [
          {
            fileId: ticket.fileId,
            // A stale or hostile client may replay the original reserved name;
            // the sealed upload token remains authoritative.
            filename: "website-one-shot-kb-builder.skill.zip",
            uploadToken: ticket.uploadToken,
          },
        ],
      },
    });
    expect(created.response.status).toBe(201);
    const submittedNames = broker.taskAttachments[0]!.map(
      (attachment) => attachment.filename,
    );
    expect(
      submittedNames.filter(
        (filename) => filename === "website-one-shot-kb-builder.skill.zip",
      ),
    ).toHaveLength(1);
    expect(submittedNames).toContain(ticket.filename);
    expect(
      JSON.parse(
        broker.taskInputUploads.get("task-input-file-1")!.toString("utf8"),
      ).data.uploadedFiles,
    ).toEqual([ticket.filename]);
  });

  it("reuses generated file ids after an ambiguous task-create response", async () => {
    const { cookie } = await verifyInvite();
    const createTask = broker.createTask.bind(broker);
    const submittedAttachments: Array<
      Array<{ file_id: string; filename: string }>
    > = [];
    let loseFirstResponse = true;
    broker.createTask = async (input) => {
      submittedAttachments.push(
        input.localAssets.map(({ localAssetId, filename }) => ({
          file_id: localAssetId,
          filename,
        })),
      );
      const task = await createTask(input);
      if (loseFirstResponse) {
        loseFirstResponse = false;
        throw new GeoBrokerError(
          "task committed before the response was lost",
          502,
          "AGENT_UNAVAILABLE",
        );
      }
      return task;
    };
    const request = {
      method: "POST" as const,
      body: {
        clientRequestId: "11111111-1111-4111-8111-111111111111",
        input: "https://acme.example",
        attachments: [],
      },
    };

    const ambiguous = await jsonRequest("/projects", cookie, request);
    expect(ambiguous.response.status).toBe(502);
    const replayed = await jsonRequest("/projects", cookie, request);
    expect(replayed.response.status).toBe(201);

    expect(submittedAttachments).toHaveLength(2);
    expect(submittedAttachments[1]).toEqual(submittedAttachments[0]);
    expect(new Set(broker.fileCreateOperationKeys).size).toBe(2);
    expect(broker.createdFileIds).toHaveLength(2);
    expect(broker.deletedFiles).not.toContain(
      submittedAttachments[0]![0]!.file_id,
    );
    expect(broker.deletedFiles).not.toContain(
      submittedAttachments[0]![1]!.file_id,
    );
  });

  it("binds upload tickets to the invitation session and declared size", async () => {
    const first = await verifyInvite();
    const second = await verifyInvite();
    const initialized = await jsonRequest("/uploads/init", first.cookie, {
      method: "POST",
      body: {
        filename: "catalog.pdf",
        contentType: "application/pdf",
        sizeBytes: 3,
      },
    });
    const ticket = initialized.body as Record<string, string>;

    const wrongSession = await fetch(`${baseUrl}/uploads/proxy`, {
      method: "PUT",
      headers: {
        cookie: second.cookie,
        "content-type": "application/pdf",
        "x-geo-upload-token": ticket.uploadToken,
      },
      body: Buffer.from("pdf"),
    });
    expect(wrongSession.status).toBe(403);

    const invalidAttempt = await fetch(`${baseUrl}/uploads/proxy`, {
      method: "PUT",
      headers: {
        cookie: first.cookie,
        "content-type": "application/pdf",
        "x-geo-upload-attempt": "4",
        "x-geo-upload-token": ticket.uploadToken,
      },
      body: Buffer.from("pdf"),
    });
    expect(invalidAttempt.status).toBe(400);
    await expect(invalidAttempt.json()).resolves.toMatchObject({
      error: { code: "UPLOAD_ATTEMPT_INVALID" },
    });

    const wrongSize = await fetch(`${baseUrl}/uploads/proxy`, {
      method: "PUT",
      headers: {
        cookie: first.cookie,
        "content-type": "application/pdf",
        "x-geo-upload-token": ticket.uploadToken,
      },
      body: Buffer.from("four"),
    });
    expect(wrongSize.status).toBe(400);
  });

  it("finalizes a candidate, returns fixed knowledge sections and strict questions, then retains both tasks on local delete", async () => {
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "https://acme.example", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            { type: "output_file", file_id: "archive-1", filename: "Acme.zip" },
          ],
        },
      ],
    });

    const completed = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}`,
      cookie,
    );
    const completedPayload = completed.body as Record<string, any>;
    expect(completedPayload.project.companyName).toBe("Acme");
    expect(completedPayload.project.knowledgeBase.companyName).toBe("Acme");
    expect(
      completedPayload.project.knowledgeBase.evidencePaths,
    ).toBeUndefined();
    expect(completedPayload.project.knowledgeBase.sections).toHaveLength(7);
    expect(
      completedPayload.project.knowledgeBase.sections.map(
        (section: { title: string }) => section.title,
      ),
    ).toEqual([
      "企业与品牌",
      "团队与组织",
      "产品与服务",
      "技术与交付",
      "客户与行业",
      "服务与合作",
      "可信优势",
    ]);
    expect(completedPayload.project.knowledgeBase.sources).toEqual([]);
    expect(completedPayload.project.knowledgeBase.assets).toEqual([]);
    expect(completedPayload.project.kbTask.output).toEqual([]);
    expect(
      completedPayload.project.knowledgeBase.packageManifestSha256,
    ).toMatch(/^[a-f0-9]{64}$/);
    expect(completedPayload.project.archive.downloadUrl).toContain(
      "/api/geo/projects/",
    );

    const recommended = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}/questions`,
      cookie,
      { method: "POST", body: {} },
    );
    expect(recommended.response.status).toBe(201);
    const recommendedPayload = recommended.body as Record<string, any>;
    expect(recommendedPayload.project.questions).toHaveLength(20);
    expect(recommendedPayload.project.questionRecommendation).toMatchObject({
      status: "ready",
    });
    expect(
      recommendedPayload.project.executionLog.currentEntryId,
    ).toBeUndefined();
    expect(recommendedPayload.project.stage).toBe("question_recommendation");
    expect(recommendedPayload.projectToken).not.toBe(initial.projectToken);
    expect(broker.prompts[1]).toContain(
      "最终响应只能是符合 schema 的 JSON 对象",
    );
    expect(broker.prompts[1]).not.toContain('"companyName": "Acme"');
    const questionTaskInputAttachment = broker.taskAttachments[1]!.find(
      (attachment) => attachment.filename.endsWith("-task-input.json"),
    )!;
    expect(
      JSON.parse(
        broker.taskInputUploads
          .get(questionTaskInputAttachment.file_id)!
          .toString("utf8"),
      ).data.companyName,
    ).toBe("Acme");

    const replayedOldToken = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}/questions`,
      cookie,
      { method: "POST", body: {} },
    );
    expect(replayedOldToken.response.status).toBe(201);
    expect(broker.questionTaskCount).toBe(1);

    broker.tasks.set("question-1", {
      ...broker.tasks.get("question-1"),
      providerStartedAt: "2026-08-15T13:00:00.000Z",
      terminalAt: "2026-08-15T13:12:00.000Z",
    });
    const timestamped = await jsonRequest(
      `/projects/${encodeURIComponent(recommendedPayload.projectToken)}`,
      cookie,
    );
    expect(timestamped.body).toMatchObject({
      project: {
        questionRecommendation: {
          status: "ready",
          startedAt: "2026-08-15T13:00:00.000Z",
          terminalAt: "2026-08-15T13:12:00.000Z",
        },
      },
    });

    const archiveResponse = await fetch(
      `${baseUrl}/projects/${encodeURIComponent(recommendedPayload.projectToken)}/archive`,
      { headers: { cookie } },
    );
    expect(archiveResponse.status).toBe(200);
    const finalBytes = Buffer.from(await archiveResponse.arrayBuffer());
    expect(finalBytes).not.toEqual(broker.archive);
    await expect(
      parseKnowledgeBaseArchive(finalBytes, {
        companyName: "Acme",
        validationProfile: "website-lead-v1",
      }),
    ).resolves.toMatchObject({ archiveContractVersion: 4 });

    const removed = await jsonRequest(
      `/projects/${encodeURIComponent(recommendedPayload.projectToken)}`,
      cookie,
      { method: "DELETE" },
    );
    expect(removed.body).toMatchObject({
      ok: true,
      retention: "provider_records_retained",
    });
    expect(broker.tasks.has("kb-1")).toBe(true);
    expect(broker.tasks.has("question-1")).toBe(true);
  });

  it("keeps both v4 archive path inventories out of the public project payload", async () => {
    knowledgeBaseFinalizerOverride = finalizeKnowledgeBaseCandidateAsV4;
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "https://acme.example", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            {
              type: "output_file",
              file_id: "archive-v4",
              filename: "Acme-v4.zip",
            },
          ],
        },
      ],
    });

    const completed = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}`,
      cookie,
    );
    const knowledgeBase = (completed.body as Record<string, any>).project
      .knowledgeBase;

    expect(completed.response.status).toBe(200);
    expect(knowledgeBase.archiveContractVersion).toBe(4);
    expect(knowledgeBase.allPaths).toBeUndefined();
    expect(knowledgeBase.evidencePaths).toBeUndefined();
    expect(knowledgeBase.documents).toBeUndefined();
  });

  it("finalizes the single candidate pipeline once and serves the same final ZIP everywhere", async () => {
    const v2Broker = new MockBroker();
    v2Broker.archive = await fixtureCandidateArchive();
    const secret = "v2-test-session-secret-at-least-32-characters";
    const app = express();
    app.use(
      "/api/geo",
      createGeoRouter({
        broker: v2Broker,
        projectOrderRegistry,
        env: {
          NODE_ENV: "test",
          FRONTMIND_GEO_INVITE_CODE: "frontmind666",
          FRONTMIND_GEO_SESSION_SECRET: secret,
        },
      }),
    );
    const v2Server = app.listen(0);
    await new Promise<void>((resolve) => v2Server.once("listening", resolve));
    try {
      const origin = `http://127.0.0.1:${(v2Server.address() as AddressInfo).port}`;
      const invited = await fetch(`${origin}/api/geo/invite/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: "frontmind666",
          businessOwnerName: "测试商务负责人",
        }),
      });
      const inviteContext = (await invited.json()) as Record<string, string>;
      const cookie = invited.headers.get("set-cookie")!.split(";")[0]!;
      const created = await fetch(`${origin}/api/geo/projects`, {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          inviteContextToken: inviteContext.inviteContextToken,
          input: "Acme",
          attachments: [],
        }),
      });
      const initial = (await created.json()) as Record<string, any>;
      v2Broker.tasks.set("kb-1", {
        id: "kb-1",
        status: "completed",
        completed_at: "2026-07-30T04:00:00.000Z",
        output: [
          {
            role: "assistant",
            content: [
              {
                type: "output_file",
                file_id: "candidate-v2",
                filename: "Acme_candidate.zip",
              },
            ],
          },
        ],
      });

      const polled = await fetch(
        `${origin}/api/geo/projects/${encodeURIComponent(initial.projectToken)}`,
        { headers: { cookie } },
      );
      expect(polled.status).toBe(200);
      const completed = (await polled.json()) as Record<string, any>;
      expect(completed).toMatchObject({
        project: {
          archive: { downloadUrl: expect.stringContaining("/archive") },
        },
      });
      expect(completed.project.knowledgeBase.sections).toHaveLength(7);
      expect(completed.projectToken).not.toBe(initial.projectToken);
      expect(v2Broker.uploads.size).toBe(1);
      expect(v2Broker.nextRegularFile).toBe(2);

      const codec = new GeoTokenCodec(secret);
      const value = codec.open<any>(completed.projectToken, "project").value;
      expect(value).toMatchObject({
        knowledgeBaseArtifact: {
          finalizerVersion: "website-kb-finalizer-v6",
          candidate: {
            taskId: "kb-1",
            artifactId: "candidate-v2",
            sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
            quality: {
              state: "complete",
              requiresSupplement: false,
              warningCodes: [],
            },
          },
          final: {
            archiveContractVersion: 4,
            validationProfile: "website-lead-v1",
            sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
            packageManifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          },
        },
      });
      const finalBytes = Buffer.from(
        await (
          await v2Broker.downloadArtifact(
            value.knowledgeBaseArtifact.final.artifactId,
          )
        ).arrayBuffer(),
      );
      expect(finalBytes).toBeDefined();
      await expect(
        parseKnowledgeBaseArchive(finalBytes, {
          companyName: "Acme",
          validationProfile: "website-lead-v1",
          generatedAt: "2026-07-30T04:00:00.000Z",
        }),
      ).resolves.toMatchObject({
        archiveContractVersion: 4,
        packageManifestSha256:
          value.knowledgeBaseArtifact.final.packageManifestSha256,
      });

      const downloaded = await fetch(
        `${origin}${completed.project.archive.downloadUrl}`,
        { headers: { cookie } },
      );
      expect(downloaded.status).toBe(200);
      expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(finalBytes);
      expect(finalBytes).not.toEqual(v2Broker.archive);

      const uploadCount = v2Broker.uploads.size;
      const uploadAttemptCount = v2Broker.uploadAttempts.length;
      for (const legacyFinalizerVersion of [
        "website-kb-finalizer-v2",
        "website-kb-finalizer-v3",
        "website-kb-finalizer-v4",
        "website-kb-finalizer-v5",
      ] as const) {
        const legacyToken = codec.seal(
          "project",
          {
            ...value,
            knowledgeBaseFinalization: undefined,
            knowledgeBaseArtifact: {
              ...value.knowledgeBaseArtifact,
              finalizerVersion: legacyFinalizerVersion,
            },
          },
          60_000,
        );
        const legacyResponse = await fetch(
          `${origin}/api/geo/projects/${encodeURIComponent(legacyToken)}`,
          { headers: { cookie } },
        );
        expect(legacyResponse.status).toBe(200);
        const legacyPayload = (await legacyResponse.json()) as Record<
          string,
          any
        >;
        expect(legacyPayload.project.knowledgeBaseFinalization).toMatchObject({
          finalizationState: "completed",
          finalizerVersion: legacyFinalizerVersion,
        });
        expect(v2Broker.uploads.size).toBe(uploadCount);
        expect(v2Broker.uploadAttempts).toHaveLength(uploadAttemptCount);
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        v2Server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("does not issue a completed project token when uploaded final ZIP readback fails", async () => {
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            {
              type: "output_file",
              file_id: "candidate-readback-failure",
              filename: "website-lead-candidate-v1.zip",
            },
          ],
        },
      ],
    });
    broker.downloadErrors.set(
      "file-1",
      new GeoBrokerError(
        "canonical file content unavailable",
        502,
        "AGENT_REQUEST_FAILED",
      ),
    );

    const failed = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}`,
      cookie,
    );
    expect(failed.response.status).toBe(503);
    expect(failed.body).toMatchObject({
      error: { code: "FINAL_ARCHIVE_READBACK_FAILED" },
    });
    expect((failed.body as any).projectToken).toBeUndefined();
    expect(broker.deletedFiles).toContain("file-1");
    expect(broker.uploads.has("file-1")).toBe(false);

    const backedOff = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}`,
      cookie,
    );
    expect(backedOff.response.status).toBe(503);
    expect(backedOff.body).toMatchObject({
      error: { code: "KB_FINALIZATION_TRANSIENT_BACKOFF" },
    });
    expect(broker.nextRegularFile).toBe(2);
  });

  it("does not issue a completed project token when uploaded final ZIP changes bytes", async () => {
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            {
              type: "output_file",
              file_id: "candidate-readback",
              filename: "website-lead-candidate-v1.zip",
            },
          ],
        },
      ],
    });
    broker.downloadOverrides.set("file-1", Buffer.from("changed-after-upload"));

    const failed = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}`,
      cookie,
    );
    expect(failed.response.status).toBe(503);
    expect(failed.body).toMatchObject({
      error: { code: "FINAL_ARCHIVE_HASH_MISMATCH" },
    });
    expect((failed.body as any).projectToken).toBeUndefined();
    expect(broker.deletedFiles).toContain("file-1");
    expect(broker.uploads.has("file-1")).toBe(false);
  });

  it("does not run a candidate rebuild when a previously recorded final ZIP cannot be read", async () => {
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "completed",
      completed_at: "2026-07-30T04:00:00.000Z",
      output: [
        {
          role: "assistant",
          content: [
            {
              type: "output_file",
              file_id: "candidate-no-rebuild",
              filename: "website-lead-candidate-v1.zip",
            },
          ],
        },
      ],
    });

    const completed = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}`,
      cookie,
    );
    expect(completed.response.status).toBe(200);
    const completedPayload = completed.body as Record<string, any>;
    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    const completedValue = codec.open<any>(
      completedPayload.projectToken,
      "project",
    ).value;
    const finalFileId = completedValue.knowledgeBaseArtifact.final.artifactId;

    const noRebuildBroker = new MockBroker();
    noRebuildBroker.archive = broker.archive;
    noRebuildBroker.tasks = new Map(broker.tasks);
    noRebuildBroker.uploads = new Map(broker.uploads);
    noRebuildBroker.nextRegularFile = broker.nextRegularFile;
    noRebuildBroker.downloadErrors.set(
      finalFileId,
      new GeoBrokerError(
        "stored file unavailable",
        502,
        "AGENT_REQUEST_FAILED",
      ),
    );
    const noRebuildApp = express();
    noRebuildApp.use(
      "/api/geo",
      createGeoRouter({
        broker: noRebuildBroker,
        projectOrderRegistry,
        env: {
          NODE_ENV: "test",
          FRONTMIND_GEO_INVITE_CODE: "frontmind666",
          FRONTMIND_GEO_SESSION_SECRET:
            "test-session-secret-at-least-16-characters",
        },
      }),
    );
    const noRebuildServer = noRebuildApp.listen(0);
    await new Promise<void>((resolve) =>
      noRebuildServer.once("listening", resolve),
    );
    try {
      const origin = `http://127.0.0.1:${
        (noRebuildServer.address() as AddressInfo).port
      }`;
      const response = await fetch(
        `${origin}/api/geo/projects/${encodeURIComponent(
          completedPayload.projectToken,
        )}`,
        { headers: { cookie } },
      );
      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "ARCHIVE_READ_FAILED" },
      });
      expect(noRebuildBroker.uploads.size).toBe(1);
      expect(noRebuildBroker.nextRegularFile).toBe(2);
      expect(noRebuildBroker.prompts).toHaveLength(0);
    } finally {
      await new Promise<void>((resolve, reject) =>
        noRebuildServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("rejects a read-back ZIP when its package manifest hash disagrees with the finalizer result", async () => {
    const mismatchBroker = new MockBroker();
    mismatchBroker.archive = await fixtureCandidateArchive();
    const secret = "manifest-mismatch-secret-at-least-32-characters";
    const app = express();
    app.use(
      "/api/geo",
      createGeoRouter({
        broker: mismatchBroker,
        knowledgeBaseFinalizer: async (input) => {
          const finalized = await finalizeKnowledgeBaseCandidate(input);
          return {
            ...finalized,
            packageManifestSha256: "0".repeat(64),
          };
        },
        projectOrderRegistry,
        env: {
          NODE_ENV: "test",
          FRONTMIND_GEO_INVITE_CODE: "frontmind666",
          FRONTMIND_GEO_SESSION_SECRET: secret,
        },
      }),
    );
    const mismatchServer = app.listen(0);
    await new Promise<void>((resolve) =>
      mismatchServer.once("listening", resolve),
    );
    try {
      const origin = `http://127.0.0.1:${
        (mismatchServer.address() as AddressInfo).port
      }`;
      const invited = await fetch(`${origin}/api/geo/invite/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: "frontmind666",
          businessOwnerName: "测试商务负责人",
        }),
      });
      const inviteContext = (await invited.json()) as Record<string, string>;
      const cookie = invited.headers.get("set-cookie")!.split(";")[0]!;
      const created = await fetch(`${origin}/api/geo/projects`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          inviteContextToken: inviteContext.inviteContextToken,
          input: "Acme",
          attachments: [],
        }),
      });
      const initial = (await created.json()) as Record<string, any>;
      mismatchBroker.tasks.set("kb-1", {
        id: "kb-1",
        status: "completed",
        completed_at: "2026-07-30T04:00:00.000Z",
        output: [
          {
            role: "assistant",
            content: [
              {
                type: "output_file",
                file_id: "candidate-manifest-mismatch",
                filename: "website-lead-candidate-v1.zip",
              },
            ],
          },
        ],
      });

      const failed = await fetch(
        `${origin}/api/geo/projects/${encodeURIComponent(
          initial.projectToken,
        )}`,
        { headers: { cookie } },
      );
      expect(failed.status).toBe(503);
      await expect(failed.json()).resolves.toMatchObject({
        error: { code: "FINAL_ARCHIVE_MANIFEST_MISMATCH" },
      });
      expect(mismatchBroker.deletedFiles).toContain("file-1");
      expect(mismatchBroker.uploads.has("file-1")).toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) =>
        mismatchServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("keeps deterministic finalizer failures stable without exposing a retry", async () => {
    const failureBroker = new MockBroker();
    failureBroker.archive = await fixtureCandidateArchive();
    const finalizer = vi.fn(async () => {
      throw new Error("deterministic contract failure");
    });
    const secret = "finalizer-failure-secret-at-least-32-characters";
    const app = express();
    app.use(
      "/api/geo",
      createGeoRouter({
        broker: failureBroker,
        knowledgeBaseFinalizer: finalizer,
        projectOrderRegistry,
        env: {
          NODE_ENV: "test",
          FRONTMIND_GEO_INVITE_CODE: "frontmind666",
          FRONTMIND_GEO_SESSION_SECRET: secret,
        },
      }),
    );
    const failureServer = app.listen(0);
    await new Promise<void>((resolve) =>
      failureServer.once("listening", resolve),
    );
    try {
      const origin = `http://127.0.0.1:${
        (failureServer.address() as AddressInfo).port
      }`;
      const invited = await fetch(`${origin}/api/geo/invite/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: "frontmind666",
          businessOwnerName: "测试商务负责人",
        }),
      });
      const inviteContext = (await invited.json()) as Record<string, string>;
      const cookie = invited.headers.get("set-cookie")!.split(";")[0]!;
      const created = await fetch(`${origin}/api/geo/projects`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          inviteContextToken: inviteContext.inviteContextToken,
          input: "Acme",
          attachments: [],
        }),
      });
      const initial = (await created.json()) as Record<string, any>;
      failureBroker.tasks.set("kb-1", {
        id: "kb-1",
        status: "completed",
        completed_at: "2026-07-30T04:00:00.000Z",
        output: [
          {
            role: "assistant",
            content: [
              {
                type: "output_file",
                file_id: "candidate-finalization-failure",
                filename: "website-lead-candidate-v1.zip",
              },
            ],
          },
        ],
      });

      const firstPoll = await fetch(
        `${origin}/api/geo/projects/${encodeURIComponent(
          initial.projectToken,
        )}`,
        { headers: { cookie } },
      );
      expect(firstPoll.status).toBe(200);
      const first = (await firstPoll.json()) as Record<string, any>;
      expect(first.project).toMatchObject({
        status: "failed",
        error: "企业知识库最终整理未通过校验，请联系技术支持。",
        knowledgeBaseFinalization: {
          finalizationState: "failed_internal",
          finalizerVersion: "website-kb-finalizer-v6",
          candidateSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          errorCode: "KB_FINALIZER_CONTRACT_VIOLATION",
        },
      });
      expect(finalizer).toHaveBeenCalledTimes(1);
      const promptCount = failureBroker.prompts.length;

      const stablePoll = await fetch(
        `${origin}/api/geo/projects/${encodeURIComponent(first.projectToken)}`,
        { headers: { cookie } },
      );
      expect(stablePoll.status).toBe(200);
      const stable = (await stablePoll.json()) as Record<string, any>;
      expect(finalizer).toHaveBeenCalledTimes(1);
      expect(stable.project.knowledgeBaseFinalization.candidateSha256).toBe(
        first.project.knowledgeBaseFinalization.candidateSha256,
      );

      const retryUrl = `${origin}/api/geo/projects/${encodeURIComponent(
        stable.projectToken,
      )}/knowledge-base/finalization/retry`;
      const retries = await Promise.all([
        fetch(retryUrl, { method: "POST", headers: { cookie } }),
        fetch(retryUrl, { method: "POST", headers: { cookie } }),
      ]);
      expect(retries.map((response) => response.status)).toEqual([404, 404]);
      expect(finalizer).toHaveBeenCalledTimes(1);
      expect(failureBroker.prompts).toHaveLength(promptCount);
    } finally {
      await new Promise<void>((resolve, reject) =>
        failureServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("selects the fixed candidate ZIP when the assistant returns multiple archives", async () => {
    const wrong = new JSZip();
    wrong.file("notes.md", "not a candidate");
    broker.uploads.set(
      "generic-archive",
      await wrong.generateAsync({ type: "nodebuffer" }),
    );
    broker.uploads.set("fixed-candidate", broker.archive);
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            {
              type: "output_file",
              file_id: "generic-archive",
              filename: "research-workspace.zip",
            },
            {
              type: "output_file",
              file_id: "fixed-candidate",
              filename: "website-lead-candidate-v1.zip",
            },
          ],
        },
      ],
    });

    const completed = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}`,
      cookie,
    );
    expect(completed.response.status).toBe(200);
    expect((completed.body as any).project.knowledgeBase.sections).toHaveLength(
      7,
    );
    const tokenValue = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<any>((completed.body as any).projectToken, "project").value;
    expect(tokenValue.knowledgeBaseArtifact.candidate.artifactId).toBe(
      "fixed-candidate",
    );
  });

  it("fails closed when the explicitly named candidate ZIP is unsafe", async () => {
    const unsafe = new JSZip();
    unsafe.file("../outside.md", "unsafe");
    broker.uploads.set(
      "unsafe-candidate",
      await unsafe.generateAsync({ type: "nodebuffer" }),
    );
    broker.uploads.set("generic-valid", broker.archive);
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            {
              type: "output_file",
              file_id: "generic-valid",
              filename: "fallback.zip",
            },
            {
              type: "output_file",
              file_id: "unsafe-candidate",
              filename: "website-lead-candidate-v1.zip",
            },
          ],
        },
      ],
    });

    const rejected = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}`,
      cookie,
    );
    expect(rejected.response.status).toBe(200);
    expect(rejected.body).toMatchObject({
      project: {
        status: "failed",
        knowledgeBaseValidationCategory: "unsafe",
        knowledgeBaseSupportRequired: true,
      },
    });
    expect((rejected.body as any).project.knowledgeBase).toBeUndefined();
  });

  it("does not fall back to a generic ZIP after the unique candidate-like ZIP is structurally invalid", async () => {
    const structurallyInvalid = new JSZip();
    structurallyInvalid.file("02_run.json", '{"schemaVersion":1}');
    broker.uploads.set(
      "named-invalid",
      await structurallyInvalid.generateAsync({ type: "nodebuffer" }),
    );
    broker.uploads.set("generic-valid", broker.archive);
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            {
              type: "output_file",
              file_id: "named-invalid",
              filename: "knowledge-base-candidate-draft.zip",
            },
            {
              type: "output_file",
              file_id: "generic-valid",
              filename: "final-output.zip",
            },
          ],
        },
      ],
    });

    const rejected = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}`,
      cookie,
    );
    expect(rejected.response.status).toBe(200);
    expect(rejected.body).toMatchObject({
      project: {
        status: "failed",
        knowledgeBaseValidationCategory: "structure",
        knowledgeBaseSupportRequired: true,
      },
    });
    expect((rejected.body as any).project.knowledgeBase).toBeUndefined();
    const tokenValue = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<any>((rejected.body as any).projectToken, "project").value;
    expect(tokenValue.knowledgeBaseArtifact).toBeUndefined();
  });

  it("uses ZIP validation as a gate for preview, recommendation, and download", async () => {
    const unsafeArchive = new JSZip();
    unsafeArchive.file("../outside.md", "# unsafe");
    broker.archive = await unsafeArchive.generateAsync({ type: "nodebuffer" });
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            { type: "output_file", file_id: "archive-1", filename: "Acme.zip" },
          ],
        },
      ],
    });

    const projectResponse = await fetch(
      `${baseUrl}/projects/${encodeURIComponent(initial.projectToken)}`,
      { headers: { cookie } },
    );
    expect(projectResponse.status).toBe(200);
    const failedProject = (await projectResponse.json()) as Record<string, any>;
    expect(failedProject.project).toMatchObject({
      status: "failed",
      stage: "enterprise_analysis",
      kbTask: {
        status: "failed",
        error:
          "知识库文件存在安全风险，已阻止下载及后续分析。请勿继续处理该文件，并联系技术支持。",
      },
      error:
        "知识库文件存在安全风险，已阻止下载及后续分析。请勿继续处理该文件，并联系技术支持。",
      knowledgeBaseValidationCategory: "unsafe",
      knowledgeBaseSupportRequired: true,
    });
    expect(failedProject.project.archive).toBeUndefined();
    expect(JSON.stringify(failedProject)).not.toContain("../outside");

    for (const [pathname, method] of [
      [
        `/projects/${encodeURIComponent(initial.projectToken)}/questions`,
        "POST",
      ],
      [`/projects/${encodeURIComponent(initial.projectToken)}/archive`, "GET"],
    ] as const) {
      const response = await fetch(`${baseUrl}${pathname}`, {
        method,
        headers: {
          cookie,
          ...(method === "POST" ? { "content-type": "application/json" } : {}),
        },
        body: method === "POST" ? "{}" : undefined,
      });
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        error: { code: "ARCHIVE_UNSAFE_VALIDATION_FAILED" },
      });
    }
    expect(broker.questionTaskCount).toBe(0);
  });

  it("maps a Dashboard question-contract 400, retains generated assets, and retries one task", async () => {
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            {
              type: "output_file",
              file_id: "archive-1",
              filename: "Acme.zip",
            },
          ],
        },
      ],
    });
    const filesBefore = new Set(broker.createdFileIds);
    broker.createTaskErrors.push(
      new GeoBrokerError(
        "strict task schema rejected an internal attachment field",
        400,
        "INVALID_REQUEST",
      ),
    );

    const failed = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}/questions`,
      cookie,
      { method: "POST", body: {} },
    );
    expect(failed.response.status).toBe(502);
    expect(failed.body).toMatchObject({
      error: {
        code: "GEO_QUESTION_BROKER_CONTRACT_ERROR",
        message: "问题生成服务合同异常，知识库已保留，请重试或重置项目",
      },
    });
    const retainedGeneratedFiles = broker.createdFileIds.filter(
      (fileId) => !filesBefore.has(fileId),
    );
    expect(retainedGeneratedFiles.length).toBeGreaterThanOrEqual(2);
    expect(retainedGeneratedFiles).toSatisfy((fileIds) =>
      fileIds.every((fileId) => !broker.deletedFiles.includes(fileId)),
    );
    expect(broker.questionTaskCount).toBe(0);

    const retried = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}/questions`,
      cookie,
      { method: "POST", body: {} },
    );
    expect(retried.response.status).toBe(201);
    expect(broker.questionTaskCount).toBe(1);
    expect(
      broker.createdFileIds.filter((fileId) =>
        retainedGeneratedFiles.includes(fileId),
      ),
    ).toEqual(retainedGeneratedFiles);
  });

  it("creates exactly one Base knowledge-base task and never regenerates it", async () => {
    const invalidArchive = new JSZip();
    invalidArchive.file(
      "02_run.json",
      JSON.stringify({ schemaVersion: 1, company: { name: "Acme" } }),
    );
    broker.archive = await invalidArchive.generateAsync({ type: "nodebuffer" });
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            {
              type: "output_file",
              file_id: "archive-1",
              filename: "Acme.zip",
            },
          ],
        },
      ],
    });

    const first = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}`,
      cookie,
    );
    expect(first.response.status).toBe(200);
    expect(first.body).toMatchObject({
      project: {
        status: "failed",
        knowledgeBaseValidationCategory: "structure",
        knowledgeBaseSupportRequired: true,
        kbTask: {
          status: "failed",
          error: "企业知识库生成结果未通过结构校验，请联系技术支持。",
        },
      },
    });
    expect((first.body as any).project).not.toHaveProperty(
      "knowledgeBaseRetryAvailable",
    );
    expect(broker.prompts).toHaveLength(1);
    expect(broker.taskContracts).toEqual([
      PRESALES_CONTRACTS.knowledgeBaseCandidate,
    ]);

    const stable = await jsonRequest(
      `/projects/${encodeURIComponent((first.body as any).projectToken)}`,
      cookie,
    );
    expect(stable.response.status).toBe(200);
    expect((stable.body as any).project.kbTask.id).toBe(
      (first.body as any).project.kbTask.id,
    );

    for (const suffix of ["retry", "knowledge-base/finalization/retry"]) {
      const removedRoute = await fetch(
        `${baseUrl}/projects/${encodeURIComponent(
          (stable.body as any).projectToken,
        )}/${suffix}`,
        { method: "POST", headers: { cookie } },
      );
      expect(removedRoute.status).toBe(404);
    }
    expect(broker.prompts).toHaveLength(1);
    expect(broker.tasks.has("kb-2")).toBe(false);
  });

  it("rejects tampered project and upload tokens", async () => {
    const { cookie } = await verifyInvite();
    const response = await fetch(
      `${baseUrl}/projects/v1.invalid.invalid.invalid`,
      { headers: { cookie } },
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_TOKEN" },
    });
  });

  it("acknowledges local removal without consulting remote cleanup", async () => {
    const { cookie } = await verifyInvite();
    const initialized = await jsonRequest("/uploads/init", cookie, {
      method: "POST",
      body: {
        filename: "catalog.pdf",
        contentType: "application/pdf",
        sizeBytes: 3,
      },
    });
    const ticket = initialized.body as Record<string, string>;
    await fetch(`${baseUrl}/uploads/proxy`, {
      method: "PUT",
      headers: {
        cookie,
        "content-type": "application/pdf",
        "x-geo-upload-token": ticket.uploadToken,
      },
      body: Buffer.from("pdf"),
    });
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: {
        input: "",
        attachments: [
          {
            fileId: ticket.fileId,
            filename: ticket.filename,
            uploadToken: ticket.uploadToken,
          },
        ],
      },
    });
    const payload = created.body as Record<string, any>;
    const retainedTaskIds = [...broker.tasks.keys()];
    broker.failDeleteFile = true;
    const failed = await jsonRequest(
      `/projects/${encodeURIComponent(payload.projectToken)}`,
      cookie,
      { method: "DELETE" },
    );
    expect(failed.response.status).toBe(200);
    expect(failed.body).toMatchObject({
      ok: true,
      retention: "provider_records_retained",
    });

    broker.failDeleteFile = false;
    const retried = await jsonRequest(
      `/projects/${encodeURIComponent(payload.projectToken)}`,
      cookie,
      { method: "DELETE" },
    );
    expect(retried.response.status).toBe(200);
    expect(retried.body).toMatchObject({
      ok: true,
      retention: "provider_records_retained",
    });
    expect(retainedTaskIds.every((taskId) => broker.tasks.has(taskId))).toBe(
      true,
    );
  });

  it("does not consult project-task deletion while acknowledging local removal", async () => {
    const ready = await createReadyProject();
    const deleteProjectTasks = broker.deleteProjectTasks.bind(broker);
    let attempts = 0;
    broker.deleteProjectTasks = async (projectId) => {
      attempts += 1;
      if (attempts <= 25) {
        return {
          schemaVersion: 1 as const,
          projectId,
          status: "deleting" as const,
          deletedTasks: 1,
          deletedFiles: 0,
          pendingReservations: 1,
          remainingTasks: 1,
          retryAfterMs: 1_000,
        };
      }
      return deleteProjectTasks(projectId);
    };

    for (let index = 0; index < 25; index += 1) {
      const pending = await jsonRequest(
        `/projects/${encodeURIComponent(ready.projectToken)}`,
        ready.cookie,
        { method: "DELETE" },
      );
      expect(pending.response.status).toBe(200);
      expect(pending.body).toMatchObject({
        ok: true,
        retention: "provider_records_retained",
      });
    }

    const completed = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );
    expect(completed.response.status).toBe(200);
    expect(completed.body).toMatchObject({
      ok: true,
      retention: "provider_records_retained",
    });
    expect(attempts).toBe(0);
  });

  it("does not stop an in-flight monitor when removing the browser project", async () => {
    const ready = await createReadyProject();
    const monitored = await startOnePlatformMonitor(ready);
    const deleteMonitorRun = broker.deleteMonitorRun.bind(broker);
    let attempts = 0;
    broker.deleteMonitorRun = async (projectId, runId) => {
      attempts += 1;
      if (attempts === 1) return "deleting" as const;
      return deleteMonitorRun(projectId, runId);
    };

    const pending = await jsonRequest(
      `/projects/${encodeURIComponent(monitored.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );
    expect(pending.response.status).toBe(200);
    expect(pending.body).toMatchObject({
      ok: true,
      retention: "provider_records_retained",
    });

    const completed = await jsonRequest(
      `/projects/${encodeURIComponent(monitored.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );
    expect(completed.response.status).toBe(200);
    expect(completed.body).toMatchObject({ ok: true });
    expect(attempts).toBe(0);
  });

  it("does not stop an in-flight task when removing the browser project", async () => {
    const ready = await createReadyProject();
    const deleteTask = broker.deleteTask.bind(broker);
    let taskDeletionPending = true;
    broker.deleteTask = async (taskId) => {
      if (taskDeletionPending) {
        throw new GeoBrokerError(
          "task completion is still settling",
          425,
          "TASK_DELETION_PENDING",
        );
      }
      return deleteTask(taskId);
    };

    const pending = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );
    expect(pending.response.status).toBe(200);
    expect(pending.body).toMatchObject({
      ok: true,
      retention: "provider_records_retained",
    });
    expect(taskDeletionPending).toBe(true);

    taskDeletionPending = false;
    const completed = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );
    expect(completed.response.status).toBe(200);
    expect(completed.body).toMatchObject({ ok: true });
  });

  it("treats resources hidden by a rotated API Key as already deleted", async () => {
    const ready = await createReadyProject();
    broker.deleteAsset = async () => {
      throw new GeoBrokerError(
        "resource is not visible to the current credential",
        404,
        "FILE_NOT_FOUND",
      );
    };

    const deleted = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );

    expect(deleted.response.status).toBe(200);
    expect(deleted.body).toMatchObject({ ok: true });
  });

  it("retains a legacy pending monitoring order and keeps the remote token readable", async () => {
    const ready = await createReadyProject();
    const projectId = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ projectId: string }>(ready.projectToken, "project").value
      .projectId;
    projectOrders.set("legacy-pending-monitor-order", {
      orderId: "legacy-pending-monitor-order",
      projectId,
      purchaseType: "monitoring",
      amountFen: 200,
      authorizationDigest: createHash("sha256")
        .update("legacy-pending-authorization")
        .digest("hex"),
      state: "pending",
      checkoutExpiresAt: "2027-07-23T10:00:00.000Z",
      eventAt: "2026-08-01T00:00:00.000Z",
    });

    const pendingDelete = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );
    expect(pendingDelete.response.status).toBe(200);
    expect(pendingDelete.body).toMatchObject({
      ok: true,
      retention: "provider_records_retained",
    });
    expect(projectOrders.size).toBe(1);

    const fencedRead = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
    );
    expect(fencedRead.response.status).toBe(200);
    expect(fencedRead.body).toMatchObject({
      project: { id: expect.any(String) },
    });

    const repeatedDelete = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );
    expect(repeatedDelete.response.status).toBe(200);
    expect(repeatedDelete.body).toMatchObject({
      ok: true,
      retention: "provider_records_retained",
    });

    const restartedApp = express();
    restartedApp.use(
      "/api/geo",
      createGeoRouter({
        broker,
        paymentGateway,
        projectOrderRegistry,
        customQuestionValidationStore,
        env: {
          NODE_ENV: "test",
          FRONTMIND_GEO_INVITE_CODE: "frontmind666",
          FRONTMIND_GEO_SESSION_SECRET:
            "test-session-secret-at-least-16-characters",
        },
      }),
    );
    const restartedServer = restartedApp.listen(0);
    await new Promise<void>((resolve) =>
      restartedServer.once("listening", resolve),
    );
    try {
      const restartedPort = (restartedServer.address() as AddressInfo).port;
      const restartedRead = await fetch(
        `http://127.0.0.1:${restartedPort}/api/geo/projects/${encodeURIComponent(ready.projectToken)}`,
        { headers: { cookie: ready.cookie } },
      );
      expect(restartedRead.status).toBe(200);
      expect(await restartedRead.json()).toMatchObject({
        project: { id: expect.any(String) },
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        restartedServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("retains an explicitly terminated paid monitoring run", async () => {
    const ready = await createReadyProject();
    await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/payments`,
      ready.cookie,
      {
        method: "POST",
        body: {
          questionId: "product-scenario-01",
          platformIds: ["doubao"],
          method: "alipay",
        },
      },
    );
    const monitored = await startOnePlatformMonitor(ready);
    const run = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...run,
      status: "remote_failed",
      failedItems: 5,
      error: "上游已明确终止任务",
    });

    const removed = await jsonRequest(
      `/projects/${encodeURIComponent(monitored.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );
    expect(removed.response.status).toBe(200);
    expect(removed.body).toMatchObject({
      ok: true,
      retention: "provider_records_retained",
    });
    expect(broker.monitorRuns.has("monitor-1")).toBe(true);
  });

  it("retains a completed order when old monitor history is no longer visible", async () => {
    const ready = await createReadyProject();
    const monitored = await startOnePlatformMonitor(ready);
    const projectId = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ projectId: string }>(monitored.projectToken, "project").value
      .projectId;
    const fulfilledAt = new Date().toISOString();
    for (const [orderId, order] of Array.from(projectOrders.entries())) {
      if (
        order.projectId === projectId &&
        order.purchaseType === "monitoring"
      ) {
        projectOrders.set(orderId, {
          ...order,
          state: "fulfilled",
          fulfilledAt,
          eventAt: fulfilledAt,
        });
      }
    }
    broker.getMonitorRun = async () => {
      throw new GeoBrokerError(
        "run belongs to a retired credential",
        404,
        "MONITOR_RUN_NOT_FOUND",
      );
    };
    broker.deleteMonitorRun = async () => {
      throw new GeoBrokerError(
        "run belongs to a retired credential",
        404,
        "MONITOR_RUN_NOT_FOUND",
      );
    };

    const deleted = await jsonRequest(
      `/projects/${encodeURIComponent(monitored.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );
    expect(deleted.response.status).toBe(200);
    expect(deleted.body).toMatchObject({
      ok: true,
      retention: "provider_records_retained",
    });
  });

  it("does not consult deletion eligibility or delete tasks for local removal", async () => {
    const ready = await createReadyProject();
    projectOrderRegistry.findByProject = async () => {
      throw new Error("database unavailable");
    };

    const removed = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );
    expect(removed.response.status).toBe(200);
    expect(removed.body).toMatchObject({ ok: true });
    expect(broker.tasks.has("kb-1")).toBe(true);
    expect(broker.tasks.has("question-1")).toBe(true);
  });

  it("deduplicates a replayed initial project request within the same session", async () => {
    const { cookie } = await verifyInvite();
    const body = {
      input: "https://acme.example",
      clientRequestId: "1f3f39ef-46ea-4ea6-a7d8-68f9ea9e60a8",
      attachments: [],
    };

    const first = await jsonRequest("/projects", cookie, {
      method: "POST",
      body,
    });
    const replay = await jsonRequest("/projects", cookie, {
      method: "POST",
      body,
    });

    expect(first.response.status).toBe(201);
    expect(replay.response.status).toBe(201);
    expect((replay.body as any).project.id).toBe(
      (first.body as any).project.id,
    );
    expect(broker.prompts).toHaveLength(1);
  });

  it("uses a trusted completed knowledge-base snapshot when the result endpoint is temporarily unavailable", async () => {
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            {
              type: "output_file",
              file_id: "archive-1",
              filename: "Acme.zip",
            },
          ],
        },
      ],
    });
    broker.taskResultErrors.set(
      "kb-1",
      new GeoBrokerError(
        "result service unavailable",
        503,
        "AGENT_UNAVAILABLE",
      ),
    );

    const restored = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}`,
      cookie,
    );

    expect(restored.response.status).toBe(200);
    expect(restored.body).toMatchObject({
      project: {
        kbTask: { status: "completed" },
        knowledgeBase: { companyName: "Acme" },
      },
    });
    expect(broker.prompts).toHaveLength(1);
  });

  it("keeps long source input out of the opaque project token", async () => {
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: `Acme ${"research ".repeat(300)}`, attachments: [] },
    });
    const payload = created.body as Record<string, any>;

    expect(created.response.status).toBe(201);
    expect(payload.projectToken.length).toBeLessThan(1200);
  });

  it("limits task creation for a shared invitation session", async () => {
    const { cookie } = await verifyInvite();
    for (let index = 0; index < 5; index += 1) {
      const created = await jsonRequest("/projects", cookie, {
        method: "POST",
        body: { input: `Acme ${index}`, attachments: [] },
      });
      expect(created.response.status).toBe(201);
    }
    const limited = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme overflow", attachments: [] },
    });
    expect(limited.response.status).toBe(429);
    expect(limited.body).toMatchObject({
      error: { code: "SESSION_RATE_LIMITED" },
    });
  });

  it("shares project creation quota across new sessions from the same IP", async () => {
    const first = await verifyInvite();
    for (let index = 0; index < 5; index += 1) {
      const created = await jsonRequest("/projects", first.cookie, {
        method: "POST",
        body: { input: `Acme ${index}`, attachments: [] },
      });
      expect(created.response.status).toBe(201);
    }

    const freshSession = await verifyInvite();
    const limited = await jsonRequest("/projects", freshSession.cookie, {
      method: "POST",
      body: { input: "Acme from a fresh session", attachments: [] },
    });
    expect(limited.response.status).toBe(429);
    expect(limited.body).toMatchObject({
      error: { code: "IDENTITY_RATE_LIMITED" },
    });
  });

  it("never submits monitoring before a verified, scope-matched payment", async () => {
    const ready = await createReadyProject();
    paymentAccepted = false;

    const denied = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      {
        method: "POST",
        body: {
          questionId: "product-scenario-01",
          platformIds: ["doubao", "deepseek"],
          paymentAuthorization: "zpay-signed-authorization-placeholder",
        },
      },
    );
    expect(denied.response.status).toBe(402);
    expect(broker.monitorCreates).toBe(0);
    expect(paymentCalls[0]).toMatchObject({
      questionId: "product-scenario-01",
      expectedAmountFen: 400,
      platformIds: ["doubao", "deepseek"],
    });

    const malformed = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      {
        method: "POST",
        body: {
          questionId: "product-scenario-01",
          platformIds: ["doubao", "doubao"],
          paymentAuthorization: "zpay-signed-authorization-placeholder",
        },
      },
    );
    expect(malformed.response.status).toBe(400);
    expect(broker.monitorCreates).toBe(0);
  });

  it("keeps authenticated status recovery for a historical monitoring order", async () => {
    const ready = await createReadyProject();
    const projectId = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ projectId: string }>(ready.projectToken, "project").value
      .projectId;
    const authorization = "historical-monitoring-authorization";
    projectOrders.set("historical-monitoring-order", {
      orderId: "historical-monitoring-order",
      projectId,
      purchaseType: "monitoring",
      amountFen: 400,
      authorizationDigest: createHash("sha256")
        .update(authorization)
        .digest("hex"),
      state: "pending",
      checkoutExpiresAt: "2027-07-23T10:00:00.000Z",
      eventAt: "2026-08-01T00:00:00.000Z",
    });
    paymentAccepted = false;

    const status = await jsonRequest(
      "/projects/" +
        encodeURIComponent(ready.projectToken) +
        "/payments/status",
      ready.cookie,
      {
        method: "POST",
        body: {
          questionId: "product-scenario-01",
          platformIds: ["doubao", "deepseek"],
          authorization,
        },
      },
    );

    expect(status.response.status).toBe(200);
    expect(status.body).toMatchObject({
      payment: { status: "pending", amountFen: 400 },
    });
    expect(paymentStatusCalls).toHaveLength(1);
    expect(paymentStatusCalls[0]).toMatchObject({
      projectId,
      questionId: "product-scenario-01",
      platformIds: ["doubao", "deepseek"],
      expectedAmountFen: 400,
    });
    expect(paymentCheckoutCalls).toHaveLength(0);
    expect(paymentSwitchCalls).toHaveLength(0);
    expect(broker.monitorCreates).toBe(0);
  });

  it("binds free overseas monitoring to ChatGPT and the translated English prompt", async () => {
    broker.monitorQuestionTranslationQuestionEnglish =
      "Which business problems does Acme 服务模块 1 primarily solve?";
    const ready = await createReadyProject();
    const sourceQuestion = "Acme 的服务模块 1 主要解决哪些业务问题？";
    const started = await jsonRequest(
      "/projects/" + encodeURIComponent(ready.projectToken) + "/monitoring",
      ready.cookie,
      {
        method: "POST",
        body: {
          schemaVersion: 2,
          clientRequestId: "81818181-8181-4181-8181-818181818181",
          questionId: "product-scenario-01",
          monitoringEdition: "overseas",
          platformIds: ["chatgpt"],
        },
      },
    );

    expect(started.response.status).toBe(201);
    expect(started.body).toMatchObject({
      state: "started",
      project: {
        monitoringEdition: "overseas",
        selectedQuestionId: "product-scenario-01",
        selectedPlatformIds: ["chatgpt"],
      },
    });
    expect(broker.monitorQuestionTranslationTaskCount).toBe(1);
    expect(broker.monitorCreates).toBe(1);
    const translationPrompt = broker.prompts.find((prompt) =>
      prompt.includes("frontmind.geo.monitor-question-translation.v1"),
    );
    expect(translationPrompt).toContain(sourceQuestion);
    expect(broker.taskAttachments.at(-1)).toEqual([]);
    expect(broker.monitorRuns.get("monitor-1")).toMatchObject({
      question: "Which business problems does Acme 服务模块 1 primarily solve?",
      platforms: ["chatgpt"],
    });
    expect(paymentCalls).toHaveLength(0);
    expect(paymentCheckoutCalls).toHaveLength(0);
  });

  it("consumes a Dashboard-localized translation without downloading a Provider output file", async () => {
    broker.monitorQuestionTranslationUseOutputFile = true;
    const ready = await createReadyProject();
    const started = await jsonRequest(
      "/projects/" + encodeURIComponent(ready.projectToken) + "/monitoring",
      ready.cookie,
      {
        method: "POST",
        body: {
          schemaVersion: 2,
          clientRequestId: "82828282-8282-4282-8282-828282828282",
          questionId: "product-scenario-01",
          monitoringEdition: "overseas",
          platformIds: ["chatgpt"],
        },
      },
    );

    expect(started.response.status).toBe(201);
    expect(broker.downloadedFileIds).not.toContain(
      "monitor-question-translation-1-result-json",
    );
    expect(broker.monitorRuns.get("monitor-1")).toMatchObject({
      question:
        "Which business problems does Acme Service Module 1 primarily solve?",
      platforms: ["chatgpt"],
    });
    expect(paymentCalls).toHaveLength(0);
  });

  it("waits for succeeded status before consuming a typed translation", async () => {
    broker.monitorQuestionTranslationStatus = "running";
    const ready = await createReadyProject();
    const createTask = broker.createTask.bind(broker);
    broker.createTask = async (input) => {
      const task = await createTask(input);
      if (
        input.prompt.includes("frontmind.geo.monitor-question-translation.v1")
      ) {
        task.status = "running";
        task.output = monitorTranslationTaskOutput(
          "Acme 的服务模块 1 主要解决哪些业务问题？",
          "Which business problems does Acme Service Module 1 primarily solve?",
        );
      }
      return task;
    };

    const started = await jsonRequest(
      "/projects/" + encodeURIComponent(ready.projectToken) + "/monitoring",
      ready.cookie,
      {
        method: "POST",
        body: {
          schemaVersion: 2,
          clientRequestId: "83838383-8383-4383-8383-838383838383",
          questionId: "product-scenario-01",
          monitoringEdition: "overseas",
          platformIds: ["chatgpt"],
        },
      },
    );

    expect(started.response.status).toBe(202);
    expect(broker.monitorCreates).toBe(0);
  });

  it("fails closed before free overseas monitoring when translation is not source-bound", async () => {
    broker.monitorQuestionTranslationRawOutput = {
      schemaVersion: 1,
      sourceQuestionSha256: "0".repeat(64),
      questionEnglish: "Is this unrelated platform stable?",
    };
    const ready = await createReadyProject();
    const started = await jsonRequest(
      "/projects/" + encodeURIComponent(ready.projectToken) + "/monitoring",
      ready.cookie,
      {
        method: "POST",
        body: {
          schemaVersion: 2,
          clientRequestId: "84848484-8484-4484-8484-848484848484",
          questionId: "product-scenario-01",
          monitoringEdition: "overseas",
          platformIds: ["chatgpt"],
        },
      },
    );

    expect(started.response.status).toBe(502);
    expect(started.body).toMatchObject({
      error: {
        code: "QUESTION_TRANSLATION_FAILED",
        message:
          "海外监控问题准备未完成，尚未向 ChatGPT 监控接口提交；订单与项目进度已保留，可重试或重置后重新发起。",
      },
    });
    expect(broker.monitorQuestionTranslationTaskCount).toBe(1);
    expect(broker.monitorCreates).toBe(0);
    expect(paymentCalls).toHaveLength(0);
    expect(projectOrders.size).toBe(0);
  });

  it("rejects a source-mismatched translation without continuing the same task", async () => {
    broker.monitorQuestionTranslationRawOutput = {
      schemaVersion: 1,
      sourceQuestionSha256: "0".repeat(64),
      questionEnglish: "Is this unrelated platform stable?",
    };
    const ready = await createReadyProject();

    const started = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      {
        method: "POST",
        body: {
          schemaVersion: 2,
          clientRequestId: "85858585-8585-4585-8585-858585858585",
          questionId: "product-scenario-01",
          monitoringEdition: "overseas",
          platformIds: ["chatgpt"],
        },
      },
    );

    expect(started.response.status).toBe(502);
    expect(started.body).toMatchObject({
      error: { code: "QUESTION_TRANSLATION_FAILED" },
    });
    expect(broker.monitorQuestionTranslationTaskCount).toBe(1);
    expect(broker.monitorCreates).toBe(0);
    expect(broker.repairCalls).toHaveLength(0);
  });

  it("persists an existing recommended question as a no-active terminal receipt that old clients may ACK", async () => {
    const ready = await createReadyProject();
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const direct = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 的服务模块 1 主要解决哪些业务问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });

    expect(direct.response.status).toBe(200);
    expect(direct.body).toMatchObject({
      question: {
        id: "product-scenario-01",
        question: "Acme 的服务模块 1 主要解决哪些业务问题？",
      },
      validation: {
        schemaVersion: 1,
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        state: "completed",
        acknowledgement: "not_required",
        completionMode: "existing_recommended_question",
      },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(0);

    const statusPath = `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`;
    const recovered = await jsonRequest(statusPath, ready.cookie);
    expect(recovered.response.status).toBe(200);
    expect(recovered.body).toMatchObject({
      question: direct.body.question,
      validation: {
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        state: "completed",
        acknowledgement: "not_required",
        completionMode: "existing_recommended_question",
      },
    });

    // A response-lost POST replays the same receipt without creating a task.
    const replayed = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 的服务模块 1 主要解决哪些业务问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(replayed.response.status).toBe(200);
    expect(replayed.body).toMatchObject({
      question: direct.body.question,
      validation: {
        acknowledgement: "not_required",
        completionMode: "existing_recommended_question",
      },
    });

    // A cached pre-marker bundle still sends ACK. Both the first ACK and a
    // lost-response retry are idempotent successes.
    const acknowledgementPath = `${statusPath}/ack`;
    const acknowledged = await jsonRequest(acknowledgementPath, ready.cookie, {
      method: "POST",
      body: {},
    });
    expect(acknowledged.response.status).toBe(200);
    const replayedAcknowledgement = await jsonRequest(
      acknowledgementPath,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(replayedAcknowledgement.response.status).toBe(200);
    expect(replayedAcknowledgement.body).toEqual(acknowledged.body);
    expect(broker.customQuestionClassifierTaskCount).toBe(0);

    const active = await jsonRequest(`${pathname}/active`, ready.cookie);
    expect(active.response.status).toBe(404);
    expect(active.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_VALIDATION_NOT_FOUND" },
    });
  });

  it("does not let a direct-completion receipt overwrite a different active validation", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierPendingPolls = 99;
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const active = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(active.response.status).toBe(202);

    const receiptRequestId = "abababab-abab-4bab-8bab-abababababab";
    const conflictingReceipt = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 的服务模块 1 主要解决哪些业务问题？",
        clientRequestId: receiptRequestId,
      },
    });
    expect(conflictingReceipt.response.status).toBe(409);
    expect(conflictingReceipt.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_ACTIVE_RESERVATION_CONFLICT" },
      activeOperation: {
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });

    const stillActive = await jsonRequest(`${pathname}/active`, ready.cookie);
    expect(stillActive.response.status).toBe(202);
    expect(stillActive.body).toMatchObject({
      validation: { clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID },
    });
    const missingReceipt = await jsonRequest(
      `${pathname}/${receiptRequestId}`,
      ready.cookie,
    );
    expect(missingReceipt.response.status).toBe(404);
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it("binds a validated custom question to free monitoring and assessment", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierOutput = {
      ...broker.customQuestionClassifierOutput,
      questionEnglish:
        "What problems can Acme solve in university research scenarios?",
    };
    const custom = await jsonRequest(
      "/projects/" +
        encodeURIComponent(ready.projectToken) +
        "/questions/custom",
      ready.cookie,
      {
        method: "POST",
        body: {
          question: "  Acme 在高校科研场景中能解决什么问题? ",
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        },
      },
    );
    expect(custom.response.status).toBe(201);
    const customPayload = custom.body as Record<string, any>;
    expect(customPayload.question).toMatchObject({
      id: expect.stringMatching(/^custom-[a-f0-9]{20}$/),
      category: "product_scenario",
      question: "Acme 在高校科研场景中能解决什么问题？",
      selectable: true,
      evidenceRefs: ["evidence/S001.md"],
    });
    expect(customPayload.question).not.toHaveProperty("questionEnglish");
    expect(customPayload.project.questions).toHaveLength(21);
    expect(
      customPayload.project.questions.some(
        (question: Record<string, unknown>) => "questionEnglish" in question,
      ),
    ).toBe(false);

    const questionId = customPayload.question.id as string;
    const started = await jsonRequest(
      "/projects/" +
        encodeURIComponent(customPayload.projectToken) +
        "/monitoring",
      ready.cookie,
      {
        method: "POST",
        body: {
          schemaVersion: 2,
          clientRequestId: "86868686-8686-4686-8686-868686868686",
          questionId,
          monitoringEdition: "domestic",
          platformIds: ["doubao"],
        },
      },
    );
    expect(started.response.status).toBe(201);
    expect(paymentCalls).toHaveLength(0);
    expect(paymentCheckoutCalls).toHaveLength(0);
    expect(broker.monitorRuns.get("monitor-1")?.question).toBe(
      "Acme 在高校科研场景中能解决什么问题？",
    );

    const run = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...run,
      status: "completed",
      completedItems: 5,
      records: Array.from({ length: 5 }, (_, index) =>
        monitorRecord(index + 1, `自定义问题回答 ${index + 1}`),
      ),
    });
    broker.completeAssessmentImmediately = true;
    const startedPayload = started.body as Record<string, any>;
    const assessed = await jsonRequest(
      "/projects/" +
        encodeURIComponent(startedPayload.projectToken) +
        "/assessment",
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(assessed.response.status).toBe(201);
    expect(broker.prompts.at(-1)).not.toContain(
      "Acme 在高校科研场景中能解决什么问题？",
    );
    const taskInputAttachment = broker.taskAttachments
      .at(-1)!
      .find((attachment) => attachment.filename.endsWith("-task-input.json"))!;
    expect(
      JSON.parse(
        broker.taskInputUploads
          .get(taskInputAttachment.file_id)!
          .toString("utf8"),
      ).data.question.text,
    ).toBe("Acme 在高校科研场景中能解决什么问题？");
  });

  it("returns an async reservation and resumes the same upstream validation task", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierPendingPolls = 2;

    const custom = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/questions/custom`,
      ready.cookie,
      {
        method: "POST",
        body: {
          question: "Acme 在高校科研场景中能解决什么问题？",
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        },
      },
    );

    expect(custom.response.status).toBe(202);
    expect(custom.body).toMatchObject({
      validation: {
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        state: "submitted",
        acknowledgement: "required",
        completionMode: "reservation",
      },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);

    const statusPath = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`;
    const stillRunning = await jsonRequest(statusPath, ready.cookie);
    expect(stillRunning.response.status).toBe(202);
    expect(stillRunning.body).toMatchObject({
      validation: { state: "submitted" },
    });

    const completed = await jsonRequest(statusPath, ready.cookie);
    expect(completed.response.status).toBe(200);
    expect(completed.body).toMatchObject({
      question: {
        question: "Acme 在高校科研场景中能解决什么问题？",
      },
      validation: { state: "completed" },
    });
    expect(broker.customQuestionClassifierPolls).toBe(2);
    expect(broker.customQuestionClassifierTaskCount).toBe(1);

    const replayed = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/questions/custom`,
      ready.cookie,
      {
        method: "POST",
        body: {
          question: "Acme 在高校科研场景中能解决什么问题？",
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        },
      },
    );
    expect(replayed.response.status).toBe(201);
    expect(replayed.body).toMatchObject({
      question: completed.body.question,
      validation: { state: "completed" },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it("returns an async enterprise rejection without reloading unrelated task results on every status poll", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierPendingPolls = 2;
    broker.customQuestionClassifierOutput = {
      decision: "reject",
      category: "unrelated",
      enterpriseRelated: false,
      reasonCode: "enterprise_unrelated",
      reason: "知识库未提供将 FrontMind 与 Acme 关联的事实证据。",
      enterpriseAnchor: null,
      offeringAnchor: null,
      evidenceRefs: [],
    };
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const started = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "FrontMind是什么企业？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(started.response.status).toBe(202);

    // A status observation must depend on the frozen reservation and its
    // classifier task, not re-fetch the already completed KB/question tasks.
    // This reproduces the production 502 that interrupted the browser before
    // the background worker persisted the authoritative rejection.
    broker.taskResultErrors.set(
      "kb-1",
      new GeoBrokerError("Too Many Requests", 429, "AGENT_RATE_LIMITED"),
    );
    broker.taskResultErrors.set(
      "question-1",
      new GeoBrokerError("Too Many Requests", 429, "AGENT_RATE_LIMITED"),
    );

    const statusPath = `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`;
    const stillRunning = await jsonRequest(statusPath, ready.cookie);
    expect(stillRunning.response.status).toBe(202);
    expect(stillRunning.body).toMatchObject({
      validation: { state: "submitted" },
    });

    const rejected = await jsonRequest(statusPath, ready.cookie);
    expect(rejected.response.status).toBe(422);
    expect(rejected.body).toMatchObject({
      error: {
        code: "CUSTOM_QUESTION_ENTERPRISE_UNRELATED",
        message:
          "该问题与「Acme」没有明确关系，请重新输入与当前企业相关的非行业排名类问题。",
      },
      validation: {
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        state: "rejected",
        error: { retryable: false },
      },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it("keeps a terminal validation discoverable until owner ACK and makes a lost-response ACK retry idempotent", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierPendingPolls = 1;
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const started = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(started.response.status).toBe(202);

    const prematureAck = await jsonRequest(
      `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}/ack`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(prematureAck.response.status).toBe(409);
    expect(prematureAck.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_VALIDATION_NOT_TERMINAL" },
    });

    const completed = await jsonRequest(
      `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`,
      ready.cookie,
    );
    expect(completed.response.status).toBe(200);
    const activeTerminal = await jsonRequest(
      `${pathname}/active`,
      ready.cookie,
    );
    expect(activeTerminal.response.status).toBe(200);
    expect(activeTerminal.body).toMatchObject({
      validation: {
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        state: "completed",
      },
    });

    const otherBrowser = await verifyInvite();
    const forbidden = await jsonRequest(
      `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}/ack`,
      otherBrowser.cookie,
      { method: "POST", body: {} },
    );
    expect(forbidden.response.status).toBe(403);
    expect(forbidden.body).toMatchObject({
      error: { code: "PROJECT_SESSION_MISMATCH" },
    });

    const acknowledgePath = `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}/ack`;
    const acknowledged = await jsonRequest(acknowledgePath, ready.cookie, {
      method: "POST",
      body: {},
    });
    expect(acknowledged.response.status).toBe(200);
    expect(acknowledged.body).toEqual({
      ok: true,
      validation: {
        schemaVersion: 1,
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        state: "completed",
        acknowledged: true,
      },
    });
    const afterAck = await jsonRequest(`${pathname}/active`, ready.cookie);
    expect(afterAck.response.status).toBe(404);

    // Simulates the first 200 response being lost after the server committed
    // the ACK. The exact request remains an idempotent success.
    const replayedAck = await jsonRequest(acknowledgePath, ready.cookie, {
      method: "POST",
      body: {},
    });
    expect(replayedAck.response.status).toBe(200);
    expect(replayedAck.body).toEqual(acknowledged.body);
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it("keeps an unacknowledged completed result past 24 hours, then serves permanent 410 after ACK and GC", async () => {
    await restartWithCustomQuestionValidationStore(
      new MemoryGeoCustomQuestionValidationStore({
        now: () => customQuestionValidationNowMs,
      }),
    );
    const ready = await createReadyProject();
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const question = "Acme 在高校科研场景中能解决什么问题？";
    const completed = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question,
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(completed.response.status).toBe(201);

    customQuestionValidationNowMs += 24 * 60 * 60 * 1000 + 1;
    const worker = createGeoCustomQuestionRecoveryWorker({
      broker,
      store: customQuestionValidationStore,
      now: () => customQuestionValidationNowMs,
    });
    await worker.runOnce();

    const statusPath = `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`;
    const stillRecoverable = await jsonRequest(statusPath, ready.cookie);
    expect(stillRecoverable.response.status).toBe(200);
    expect(stillRecoverable.body).toMatchObject({
      validation: {
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        state: "completed",
      },
      question: { question },
    });

    const acknowledged = await jsonRequest(`${statusPath}/ack`, ready.cookie, {
      method: "POST",
      body: {},
    });
    expect(acknowledged.response.status).toBe(200);
    await worker.runOnce();

    const expiredGet = await jsonRequest(statusPath, ready.cookie);
    expect(expiredGet.response.status).toBe(410);
    expect(expiredGet.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_VALIDATION_EXPIRED" },
    });
    const expiredPost = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question,
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(expiredPost.response.status).toBe(410);
    expect(expiredPost.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_VALIDATION_EXPIRED" },
    });
    expect(broker.tasks.has("custom-question-classifier-1")).toBe(true);
  });

  it("coalesces double-clicks and rejects cross-session recovery", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierPendingPolls = 1;
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const request = {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    } as const;

    const [first, second] = await Promise.all([
      jsonRequest(pathname, ready.cookie, request),
      jsonRequest(pathname, ready.cookie, request),
    ]);
    expect([201, 202]).toContain(first.response.status);
    expect([201, 202]).toContain(second.response.status);
    expect(broker.customQuestionClassifierTaskCount).toBe(1);

    const statusPath = `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`;
    const completed = await jsonRequest(statusPath, ready.cookie);
    expect(completed.response.status).toBe(200);
    expect(completed.body).toMatchObject({
      validation: {
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        state: "completed",
      },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);

    const otherBrowser = await verifyInvite();
    const forbidden = await jsonRequest(statusPath, otherBrowser.cookie);
    expect(forbidden.response.status).toBe(403);
    expect(forbidden.body).toMatchObject({
      error: { code: "PROJECT_SESSION_MISMATCH" },
    });

    const conflict = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 靠谱吗？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(conflict.response.status).toBe(409);
    expect(conflict.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_IDEMPOTENCY_CONFLICT" },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it("returns the authority and permanently retires a different-UUID conflict loser", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierPendingPolls = 99;
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const first = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(first.response.status).toBe(202);

    const competingRequestId = "99999999-9999-4999-8999-999999999999";
    const competing = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 如何为企业部署私有化系统？",
        clientRequestId: competingRequestId,
      },
    });
    expect(competing.response.status).toBe(409);
    expect(competing.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_ACTIVE_RESERVATION_CONFLICT" },
      activeOperation: {
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        question: "Acme 在高校科研场景中能解决什么问题？",
      },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);

    const retiredLoser = await jsonRequest(
      `${pathname}/${competingRequestId}`,
      ready.cookie,
    );
    expect(retiredLoser.response.status).toBe(409);
    expect(retiredLoser.body).toMatchObject({
      validation: {
        clientRequestId: competingRequestId,
        state: "failed",
        error: {
          code: "CUSTOM_QUESTION_RESERVATION_SUPERSEDED",
          retryable: false,
        },
      },
      error: { code: "CUSTOM_QUESTION_RESERVATION_SUPERSEDED" },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);

    const active = await jsonRequest(`${pathname}/active`, ready.cookie);
    expect(active.response.status).toBe(202);
    expect(active.body).toMatchObject({
      validation: {
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        question: "Acme 在高校科研场景中能解决什么问题？",
      },
    });

    broker.tasks.set("custom-question-classifier-1", {
      id: "custom-question-classifier-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            { text: JSON.stringify(broker.customQuestionClassifierOutput) },
          ],
        },
      ],
    });
    const completed = await jsonRequest(
      `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`,
      ready.cookie,
    );
    expect(completed.response.status).toBe(200);

    const acknowledged = await jsonRequest(
      `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}/ack`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(acknowledged.response.status).toBe(200);

    const worker = createGeoCustomQuestionRecoveryWorker({
      broker,
      store: customQuestionValidationStore,
      now: () => customQuestionValidationNowMs,
    });
    await worker.runOnce();
    expect(broker.customQuestionClassifierTaskCount).toBe(1);

    broker.customQuestionClassifierPendingPolls = 1;
    const replayedLoser = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 如何为企业部署私有化系统？",
        clientRequestId: competingRequestId,
      },
    });
    expect(replayedLoser.response.status).toBe(409);
    expect(replayedLoser.body).toMatchObject({
      validation: {
        state: "failed",
        error: { code: "CUSTOM_QUESTION_RESERVATION_SUPERSEDED" },
      },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);

    const nextRequestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const nextOperation = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 如何为企业部署私有化系统？",
        clientRequestId: nextRequestId,
      },
    });
    expect(nextOperation.response.status).toBe(202);
    expect(broker.customQuestionClassifierTaskCount).toBe(2);
  });

  it("keeps active custom-question validation recoverable after local removal", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierPendingPolls = 99;
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const started = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(started.response.status).toBe(202);
    expect(broker.customQuestionClassifierTaskCount).toBe(1);

    const deleted = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );
    expect(deleted.response.status).toBe(200);
    expect(deleted.body).toMatchObject({ ok: true });

    const projectId = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ projectId: string }>(ready.projectToken, "project").value
      .projectId;
    await expect(
      customQuestionValidationStore.getActive(projectId),
    ).resolves.toMatchObject({ state: "submitted" });
    await expect(customQuestionValidationStore.listActive()).resolves.toEqual([
      expect.objectContaining({ state: "submitted" }),
    ]);

    const preciseStatus = await jsonRequest(
      `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`,
      ready.cookie,
    );
    expect(preciseStatus.response.status).toBe(202);
    expect(preciseStatus.body).toMatchObject({
      validation: { state: "submitted" },
    });

    const worker = createGeoCustomQuestionRecoveryWorker({
      broker,
      store: customQuestionValidationStore,
      now: () => customQuestionValidationNowMs,
    });
    await worker.runOnce();
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it("retains a record-only validation crash for later recovery", async () => {
    const ready = await createReadyProject();
    let crashOnce = true;
    const crashedStore = new MemoryGeoCustomQuestionValidationStore({
      afterInitialRecordCommit: () => {
        if (!crashOnce) return;
        crashOnce = false;
        throw new Error("simulated process exit before active slot commit");
      },
    });
    await restartWithCustomQuestionValidationStore(crashedStore);

    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const interrupted = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(interrupted.response.status).toBe(500);

    const deleted = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );
    expect(deleted.response.status).toBe(200);
    expect(deleted.body).toMatchObject({ ok: true });
    const project = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ knowledgeBaseTaskId: string; projectId: string }>(
      ready.projectToken,
      "project",
    ).value;
    expect(broker.tasks.has(project.knowledgeBaseTaskId)).toBe(true);
    await expect(crashedStore.listActive()).resolves.toEqual([
      expect.objectContaining({ state: "reserved" }),
    ]);
    await expect(
      crashedStore.get(project.projectId, CUSTOM_QUESTION_CLIENT_REQUEST_ID),
    ).resolves.toMatchObject({ state: "reserved" });
    await expect(
      crashedStore.getProjectDeletionTargets(project.projectId),
    ).resolves.toEqual({ localTaskIds: [], temporaryLocalAssetIds: [] });
    await expect(
      crashedStore.isProjectDeletionFenced(project.projectId),
    ).resolves.toBe(false);
  });

  it("bridges a cached client without clientRequestId to one deterministic upstream task", async () => {
    const ready = await createReadyProject();
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const request = {
      method: "POST",
      body: { question: "Acme 在高校科研场景中能解决什么问题？" },
    } as const;
    const first = await jsonRequest(pathname, ready.cookie, request);
    const replay = await jsonRequest(pathname, ready.cookie, request);

    expect(first.response.status).toBe(201);
    expect(replay.response.status).toBe(201);
    expect(first.body).toMatchObject({
      validation: {
        clientRequestId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
      },
    });
    expect(replay.body).toMatchObject({
      validation: {
        clientRequestId: (first.body as any).validation.clientRequestId,
      },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it("lets the precise GET reclaim a reservation whose process crashed before writing the active slot", async () => {
    let crashOnce = true;
    await restartWithCustomQuestionValidationStore(
      new MemoryGeoCustomQuestionValidationStore({
        afterInitialRecordCommit: () => {
          if (!crashOnce) return;
          crashOnce = false;
          throw new Error("simulated process exit before active-slot commit");
        },
      }),
    );
    const ready = await createReadyProject();
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const interrupted = await jsonRequest(pathname, ready.cookie, {
        method: "POST",
        body: {
          question: "Acme 在高校科研场景中能解决什么问题？",
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        },
      });
      expect(interrupted.response.status).toBe(500);

      const projectId = new GeoTokenCodec(
        "test-session-secret-at-least-16-characters",
      ).open<{ projectId: string }>(ready.projectToken, "project").value
        .projectId;
      await expect(
        customQuestionValidationStore.getActive(projectId),
      ).resolves.toBeUndefined();

      const recovered = await jsonRequest(
        `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`,
        ready.cookie,
      );
      expect(recovered.response.status).toBe(200);
      expect(recovered.body).toMatchObject({
        validation: {
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
          state: "completed",
        },
      });
      expect(broker.customQuestionClassifierTaskCount).toBe(1);
    } finally {
      log.mockRestore();
    }
  });

  it("lets the recovery worker discover and finish an orphan reservation without a browser poll", async () => {
    let crashOnce = true;
    await restartWithCustomQuestionValidationStore(
      new MemoryGeoCustomQuestionValidationStore({
        afterInitialRecordCommit: () => {
          if (!crashOnce) return;
          crashOnce = false;
          throw new Error("simulated worker recovery crash window");
        },
      }),
    );
    const ready = await createReadyProject();
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const interrupted = await jsonRequest(pathname, ready.cookie, {
        method: "POST",
        body: {
          question: "Acme 在高校科研场景中能解决什么问题？",
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        },
      });
      expect(interrupted.response.status).toBe(500);

      const worker = createGeoCustomQuestionRecoveryWorker({
        broker,
        store: customQuestionValidationStore,
        now: () => customQuestionValidationNowMs,
      });
      await worker.runOnce();

      const projectId = new GeoTokenCodec(
        "test-session-secret-at-least-16-characters",
      ).open<{ projectId: string }>(ready.projectToken, "project").value
        .projectId;
      await expect(
        customQuestionValidationStore.get(
          projectId,
          CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        ),
      ).resolves.toMatchObject({
        state: "completed",
        cleanupCompleted: true,
      });
      expect(broker.customQuestionClassifierTaskCount).toBe(1);
    } finally {
      log.mockRestore();
    }
  });

  it("polls an in-flight pre-upgrade classifier task without creating the new input attachment", async () => {
    const store = new MemoryGeoCustomQuestionValidationStore();
    const projectId = "rolling-upgrade-project";
    const clientRequestId = "22222222-2222-4222-8222-222222222222";
    const question = "Acme 在高校科研场景中能解决什么问题？";
    const reservation = await store.reserve({
      projectId,
      ownerSessionHash: "a".repeat(64),
      clientRequestId,
      requestHash: geoCustomQuestionRequestHash({
        projectId,
        knowledgeBaseTaskId: "knowledge-task-before-upgrade",
        question,
      }),
      question,
      questionHash: geoCustomQuestionHash(question),
      companyName: "Acme",
      knowledgeBaseTaskId: "knowledge-task-before-upgrade",
      knowledgeBaseValidationProfile: "website-lead-v1",
      knowledgeBaseArtifact: {
        artifactId: "knowledge-file-before-upgrade",
        filename: "Acme.zip",
        sha256: "1".repeat(64),
        packageManifestSha256: "2".repeat(64),
      },
      expiresAt: "2027-08-01T00:00:00.000Z",
    });
    const lease = await store.tryAcquireLease(projectId, clientRequestId);
    expect(lease).toBeDefined();
    const taskId = "custom-question-classifier-before-upgrade";
    await store.update(
      {
        ...reservation.record,
        state: "submitted",
        archiveAttachment: {
          localAssetId: "archive-before-upgrade",
          filename: "Acme.zip",
          temporary: false,
        },
        skillAttachment: {
          localAssetId: "skill-before-upgrade",
          filename: "geo-custom-question-classifier.skill.zip",
          temporary: false,
        },
        localTaskId: taskId,
      },
      lease!,
    );
    await store.releaseLease(lease!);
    broker.customQuestionClassifierOutput = {
      decision: "reject",
      category: "unrelated",
      enterpriseRelated: false,
      reasonCode: "enterprise_unrelated",
      reason: "问题与当前企业知识无关。",
      enterpriseAnchor: null,
      offeringAnchor: null,
      evidenceRefs: [],
    };
    broker.tasks.set(taskId, {
      id: taskId,
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            {
              text: JSON.stringify(broker.customQuestionClassifierOutput),
            },
          ],
        },
      ],
    });
    broker.regularUploadError = new Error(
      "new protocol uploads must not gate an existing task",
    );

    await createGeoCustomQuestionRecoveryWorker({ broker, store }).runOnce();

    await expect(store.get(projectId, clientRequestId)).resolves.toMatchObject({
      state: "rejected",
      localTaskId: taskId,
      cleanupCompleted: true,
    });
    expect(broker.taskInputUploads.size).toBe(0);
    expect(
      broker.createdFileIds.some((fileId) => fileId.startsWith("task-input-")),
    ).toBe(false);
  });

  it("recovers every reservation beyond the concurrency limit across competing workers without duplicate tasks", async () => {
    const store = new MemoryGeoCustomQuestionValidationStore();
    const question = "Acme 在高校科研场景中能解决什么问题？";
    const operationCount = 25;
    const operations: Array<{ projectId: string; clientRequestId: string }> =
      [];

    for (let index = 0; index < operationCount; index += 1) {
      const projectId = `fair-recovery-project-${String(index).padStart(2, "0")}`;
      const clientRequestId = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      const reservation = await store.reserve({
        projectId,
        ownerSessionHash: "a".repeat(64),
        clientRequestId,
        requestHash: geoCustomQuestionRequestHash({
          projectId,
          knowledgeBaseTaskId: `knowledge-task-${index}`,
          question,
        }),
        question,
        questionHash: geoCustomQuestionHash(question),
        companyName: "Acme",
        knowledgeBaseTaskId: `knowledge-task-${index}`,
        knowledgeBaseValidationProfile: "website-lead-v1",
        knowledgeBaseArtifact: {
          artifactId: `knowledge-file-${index}`,
          filename: "Acme.zip",
          sha256: "1".repeat(64),
          packageManifestSha256: "2".repeat(64),
        },
        expiresAt: "2027-08-01T00:00:00.000Z",
      });
      const lease = await store.tryAcquireLease(projectId, clientRequestId);
      expect(lease).toBeDefined();
      await store.update(
        {
          ...reservation.record,
          state: "prepared",
          archiveAttachment: {
            localAssetId: `prepared-archive-${index}`,
            filename: "Acme.zip",
            temporary: false,
          },
          skillAttachment: {
            localAssetId: `prepared-skill-${index}`,
            filename: "geo-custom-question-classifier.skill.zip",
            temporary: false,
          },
        },
        lease!,
      );
      await store.releaseLease(lease!);
      operations.push({ projectId, clientRequestId });
    }

    broker.customQuestionClassifierOutput = {
      decision: "reject",
      category: "unrelated",
      enterpriseRelated: false,
      reasonCode: "enterprise_unrelated",
      reason: "问题与当前企业知识无关。",
      enterpriseAnchor: null,
      offeringAnchor: null,
      evidenceRefs: [],
    };
    const createTask = broker.createTask.bind(broker);
    let loseFirstTaskResponse = true;
    broker.createTask = async (input) => {
      const task = await createTask(input);
      if (loseFirstTaskResponse) {
        loseFirstTaskResponse = false;
        throw new GeoBrokerError(
          "task was committed before the Website process exited",
          502,
          "AGENT_UNAVAILABLE",
        );
      }
      return task;
    };

    const firstProcess = createGeoCustomQuestionRecoveryWorker({
      broker,
      store,
      batchSize: 3,
    });
    const competingProcess = createGeoCustomQuestionRecoveryWorker({
      broker,
      store,
      batchSize: 3,
    });
    await Promise.all([firstProcess.runOnce(), competingProcess.runOnce()]);

    // A new process must converge the lost response through the original
    // idempotency key, while records after the former fixed prefix are not
    // starved by the three-operation concurrency limit.
    const restartedProcess = createGeoCustomQuestionRecoveryWorker({
      broker,
      store,
      batchSize: 3,
    });
    await restartedProcess.runOnce();
    await restartedProcess.runOnce();

    const recoveredRecords = await Promise.all(
      operations.map((operation) =>
        store.get(operation.projectId, operation.clientRequestId),
      ),
    );
    expect(
      recoveredRecords.map((record, index) => ({
        index,
        state: record?.state,
        cleanupCompleted: record?.cleanupCompleted,
        localTaskId: record?.localTaskId,
        error: record?.error?.code,
      })),
    ).toEqual(
      Array.from({ length: operationCount }, (_, index) => ({
        index,
        state: "rejected",
        cleanupCompleted: true,
        localTaskId: expect.stringMatching(/^custom-question-classifier-/),
        error: "CUSTOM_QUESTION_ENTERPRISE_UNRELATED",
      })),
    );
    expect(broker.customQuestionClassifierTaskCount).toBe(operationCount);
    expect(broker.idempotentTasks.size).toBe(operationCount);

    await restartedProcess.runOnce();
    expect(broker.customQuestionClassifierTaskCount).toBe(operationCount);
  });

  it("keeps the 15-second legacy compatibility contract while a timed-out refresh reuses the same task", async () => {
    expect(GEO_LEGACY_CUSTOM_QUESTION_COMPATIBILITY_WAIT_MS).toBe(15_000);

    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    const compatibilityApp = express();
    compatibilityApp.use(
      "/api/geo",
      createGeoRouter({
        broker,
        customQuestionValidationStore,
        projectOrderRegistry,
        legacyCustomQuestionCompatibilityWaitMs: 30,
        legacyCustomQuestionCompatibilityPollMs: 5,
        env: {
          NODE_ENV: "test",
          FRONTMIND_GEO_INVITE_CODE: "frontmind666",
          FRONTMIND_GEO_SESSION_SECRET:
            "test-session-secret-at-least-16-characters",
        },
      }),
    );
    server = compatibilityApp.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/geo`;

    const ready = await createReadyProject();
    broker.customQuestionClassifierPendingPolls = 99;
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const request = {
      method: "POST",
      body: { question: "Acme 在高校科研场景中能解决什么问题？" },
    } as const;

    const timedOut = await jsonRequest(pathname, ready.cookie, request);
    expect(timedOut.response.status).toBe(504);
    expect(timedOut.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_LEGACY_CLIENT_REFRESH_REQUIRED" },
    });
    const active = await jsonRequest(`${pathname}/active`, ready.cookie);
    expect(active.response.status).toBe(202);
    expect(active.body).toMatchObject({
      validation: {
        state: "submitted",
        clientRequestId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
      },
    });

    const refreshed = await jsonRequest(pathname, ready.cookie, request);
    expect(refreshed.response.status).toBe(504);
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it("converges repeated task-read failures to one retryable terminal result", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierPendingPolls = 99;
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const started = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(started.response.status).toBe(202);
    broker.taskErrors.set(
      "custom-question-classifier-1",
      new GeoBrokerError(
        "task permanently missing",
        404,
        "AGENT_REQUEST_FAILED",
      ),
    );
    const statusPath = `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`;
    const firstFailure = await jsonRequest(statusPath, ready.cookie);
    expect(firstFailure.response.status).toBe(202);
    customQuestionValidationNowMs += 15_000;
    const secondFailure = await jsonRequest(statusPath, ready.cookie);
    expect(secondFailure.response.status).toBe(202);
    customQuestionValidationNowMs += 15_000;
    const terminal = await jsonRequest(statusPath, ready.cookie);
    expect(terminal.response.status).toBe(502);
    expect(terminal.body).toMatchObject({
      validation: {
        state: "failed",
        error: {
          code: "CUSTOM_QUESTION_CLASSIFIER_TASK_UNAVAILABLE",
          retryable: true,
        },
      },
      error: { code: "CUSTOM_QUESTION_CLASSIFIER_TASK_UNAVAILABLE" },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it("stages one skill file before upload and bounds repeated preparation failures to one retryable terminal", async () => {
    const ready = await createReadyProject();
    const createdBefore = new Set(broker.createdFileIds);
    broker.skillUploadError = new GeoBrokerError(
      "skill upload unavailable",
      503,
      "AGENT_REQUEST_FAILED",
    );
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const first = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(first.response.status).toBe(202);
    expect(first.body).toMatchObject({ validation: { state: "prepared" } });

    const projectId = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ projectId: string }>(ready.projectToken, "project").value
      .projectId;
    const staged = await customQuestionValidationStore.get(
      projectId,
      CUSTOM_QUESTION_CLIENT_REQUEST_ID,
    );
    expect(staged).toMatchObject({
      skillStagingAttachment: {
        localAssetId: expect.stringMatching(/^skill-file-/),
        temporary: true,
      },
      transientErrorCount: 1,
    });
    expect(staged?.skillAttachment).toBeUndefined();
    const stagedFileId = staged!.skillStagingAttachment!.localAssetId;
    expect(staged!.temporaryLocalAssetIds).toContain(stagedFileId);
    expect(
      broker.createdFileIds.filter(
        (id) => !createdBefore.has(id) && id.startsWith("skill-file-"),
      ),
    ).toEqual([stagedFileId]);

    const worker = createGeoCustomQuestionRecoveryWorker({
      broker,
      store: customQuestionValidationStore,
      now: () => customQuestionValidationNowMs,
    });
    customQuestionValidationNowMs += 15_000;
    await worker.runOnce();
    await expect(
      customQuestionValidationStore.get(
        projectId,
        CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      ),
    ).resolves.toMatchObject({ state: "prepared", transientErrorCount: 2 });

    customQuestionValidationNowMs += 15_000;
    await worker.runOnce();
    await expect(
      customQuestionValidationStore.get(
        projectId,
        CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      ),
    ).resolves.toMatchObject({
      state: "failed",
      cleanupCompleted: true,
      error: {
        code: "CUSTOM_QUESTION_SKILL_PREPARATION_UNAVAILABLE",
        retryable: true,
      },
    });
    const terminal = await jsonRequest(
      `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`,
      ready.cookie,
    );
    expect(terminal.response.status).toBe(502);
    expect(terminal.body).toMatchObject({
      validation: {
        state: "failed",
        error: {
          code: "CUSTOM_QUESTION_SKILL_PREPARATION_UNAVAILABLE",
          retryable: true,
        },
      },
      error: { code: "CUSTOM_QUESTION_SKILL_PREPARATION_UNAVAILABLE" },
    });
    expect(
      broker.uploadAttempts.filter((id) => id === stagedFileId),
    ).toHaveLength(3);
    expect(broker.deletedFiles).toContain(stagedFileId);
    const createsAfterTerminal = broker.createdFileIds.length;
    const uploadsAfterTerminal = broker.uploadAttempts.length;
    await worker.runOnce();
    expect(broker.createdFileIds).toHaveLength(createsAfterTerminal);
    expect(broker.uploadAttempts).toHaveLength(uploadsAfterTerminal);
  });

  it("recovers the same temporary file after create succeeded but its response was lost", async () => {
    const ready = await createReadyProject();
    const filesBefore = new Set(broker.createdFileIds);
    broker.loseNextIdempotentFileCreateResponse = true;
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;

    const first = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(first.response.status).toBe(202);

    const projectId = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ projectId: string }>(ready.projectToken, "project").value
      .projectId;
    await expect(
      customQuestionValidationStore.get(
        projectId,
        CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      ),
    ).resolves.toMatchObject({
      state: "reserved",
      transientErrorCount: 1,
    });
    const createdAfterLostResponse = broker.createdFileIds.filter(
      (id) => !filesBefore.has(id),
    );
    expect(createdAfterLostResponse).toHaveLength(1);
    const upstreamFileId = createdAfterLostResponse[0]!;

    // A fresh recovery worker represents the Website process restarting. Its
    // retry carries the same operation key and receives the already-created
    // upstream file id, which is then persisted and cleaned normally.
    const worker = createGeoCustomQuestionRecoveryWorker({
      broker,
      store: customQuestionValidationStore,
      now: () => customQuestionValidationNowMs,
    });
    customQuestionValidationNowMs += 15_000;
    await worker.runOnce();

    const recovered = await customQuestionValidationStore.get(
      projectId,
      CUSTOM_QUESTION_CLIENT_REQUEST_ID,
    );
    expect(recovered).toMatchObject({
      state: "completed",
      cleanupCompleted: true,
    });
    expect(broker.createdFileIds.filter((id) => id === upstreamFileId)).toEqual(
      [upstreamFileId],
    );
    expect(broker.deletedFiles).toContain(upstreamFileId);
    const operationKeys = broker.fileCreateOperationKeys.filter((key) =>
      key.includes(":archive:0:v1"),
    );
    expect(operationKeys).toHaveLength(2);
    expect(new Set(operationKeys).size).toBe(1);
    expect(operationKeys[0]).toMatch(
      /^geo-custom-question-file:[a-f0-9]{64}:archive:0:v1$/,
    );
  });

  it("rebuilds both attachments under the current credential after rotation and a lost file response", async () => {
    const ready = await createReadyProject();
    const filesBefore = new Set(broker.createdFileIds);
    broker.enforceCurrentCredentialAttachments = true;
    broker.loseNextIdempotentFileCreateResponse = true;
    broker.rotateCredentialWhenFileResponseIsLost = true;
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;

    const first = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(first.response.status).toBe(202);
    expect(broker.currentCredentialVersion).toBe(2);

    const projectId = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ projectId: string }>(ready.projectToken, "project").value
      .projectId;
    const fileCreatedBeforeRotation = broker.createdFileIds.find(
      (id) => !filesBefore.has(id),
    );
    expect(fileCreatedBeforeRotation).toBeDefined();
    expect(broker.fileCredentialVersions.get(fileCreatedBeforeRotation!)).toBe(
      1,
    );

    // A fresh worker represents process restart. Its first cycle replays the
    // completed generation-0 file exactly once, then observes Dashboard's
    // current-credential conflict and atomically advances the attachment
    // generation without creating a task.
    const worker = createGeoCustomQuestionRecoveryWorker({
      broker,
      store: customQuestionValidationStore,
      now: () => customQuestionValidationNowMs,
    });
    customQuestionValidationNowMs += 15_000;
    await worker.runOnce();
    await expect(
      customQuestionValidationStore.get(
        projectId,
        CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      ),
    ).resolves.toMatchObject({
      state: "reserved",
      attachmentRebuildCount: 1,
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(0);
    expect(
      broker.createdFileIds.filter((id) => id === fileCreatedBeforeRotation),
    ).toEqual([fileCreatedBeforeRotation]);

    // The next cycle copies the ZIP and uploads the Skill under credential 2;
    // the task is then created once and terminal cleanup retires every
    // temporary file, including the replayed generation-0 file.
    customQuestionValidationNowMs += 15_000;
    await worker.runOnce();
    const completed = await customQuestionValidationStore.get(
      projectId,
      CUSTOM_QUESTION_CLIENT_REQUEST_ID,
    );
    expect(completed).toMatchObject({
      state: "completed",
      cleanupCompleted: true,
      attachmentRebuildCount: 1,
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
    const finalAttachments = broker.taskAttachments.at(-1)!;
    expect(finalAttachments).toHaveLength(3);
    expect(
      finalAttachments.map((attachment) =>
        broker.fileCredentialVersions.get(attachment.file_id),
      ),
    ).toEqual([2, 2, 2]);
    expect(broker.deletedFiles).toContain(fileCreatedBeforeRotation);

    const generationZeroArchiveKeys = broker.fileCreateOperationKeys.filter(
      (key) => key.includes(":archive:0:v1"),
    );
    expect(generationZeroArchiveKeys).toHaveLength(2);
    expect(new Set(generationZeroArchiveKeys).size).toBe(1);
    const generationOneKeys = broker.fileCreateOperationKeys.filter((key) =>
      /:(?:archive|skill):1:v1$/.test(key),
    );
    expect(generationOneKeys).toHaveLength(2);
  });

  it("stages and reuses one force-copied archive file, retaining every temporary ID for terminal cleanup", async () => {
    const ready = await createReadyProject();
    broker.createTaskErrors.push(
      new GeoBrokerError(
        "attachment no longer exists",
        404,
        "AGENT_REQUEST_FAILED",
      ),
    );
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const first = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(first.response.status).toBe(202);
    expect(first.body).toMatchObject({ validation: { state: "reserved" } });
    const filesBeforeCopy = new Set(broker.createdFileIds);
    broker.regularUploadError = new GeoBrokerError(
      "archive upload unavailable",
      503,
      "AGENT_REQUEST_FAILED",
    );

    const statusPath = `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`;
    const copyFailure = await jsonRequest(statusPath, ready.cookie);
    expect(copyFailure.response.status).toBe(202);
    const projectId = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ projectId: string }>(ready.projectToken, "project").value
      .projectId;
    const staged = await customQuestionValidationStore.get(
      projectId,
      CUSTOM_QUESTION_CLIENT_REQUEST_ID,
    );
    expect(staged).toMatchObject({
      attachmentRebuildCount: 1,
      archiveStagingAttachment: {
        localAssetId: expect.stringMatching(/^file-/),
        temporary: true,
      },
      transientErrorCount: 1,
    });
    expect(staged?.archiveAttachment).toBeUndefined();
    const archiveStagingId = staged!.archiveStagingAttachment!.localAssetId;
    const originalSkillId = staged!.temporaryLocalAssetIds.find((id) =>
      id.startsWith("skill-file-"),
    );
    expect(originalSkillId).toBeDefined();
    expect(staged!.temporaryLocalAssetIds).toEqual(
      expect.arrayContaining([archiveStagingId, originalSkillId]),
    );
    expect(
      broker.createdFileIds.filter(
        (id) => !filesBeforeCopy.has(id) && id.startsWith("file-"),
      ),
    ).toEqual([archiveStagingId]);

    customQuestionValidationNowMs += 15_000;
    const second = await jsonRequest(statusPath, ready.cookie);
    expect(second.response.status).toBe(202);
    customQuestionValidationNowMs += 15_000;
    const terminal = await jsonRequest(statusPath, ready.cookie);
    expect(terminal.response.status).toBe(502);
    expect(terminal.body).toMatchObject({
      validation: {
        state: "failed",
        error: {
          code: "CUSTOM_QUESTION_ARCHIVE_PREPARATION_UNAVAILABLE",
          retryable: true,
        },
      },
    });
    expect(
      broker.uploadAttempts.filter((id) => id === archiveStagingId),
    ).toHaveLength(3);
    expect(broker.deletedFiles).toEqual(
      expect.arrayContaining([archiveStagingId, originalSkillId]),
    );
    const worker = createGeoCustomQuestionRecoveryWorker({
      broker,
      store: customQuestionValidationStore,
      now: () => customQuestionValidationNowMs,
    });
    const createsAfterTerminal = broker.createdFileIds.length;
    await worker.runOnce();
    expect(broker.createdFileIds).toHaveLength(createsAfterTerminal);
  });

  it("rebuilds invalid frozen attachments without creating a second operation", async () => {
    const ready = await createReadyProject();
    broker.createTaskErrors.push(
      new GeoBrokerError(
        "attachment no longer exists",
        404,
        "AGENT_REQUEST_FAILED",
      ),
    );
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const first = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(first.response.status).toBe(202);
    expect(first.body).toMatchObject({
      validation: { state: "reserved" },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(0);

    const recovered = await jsonRequest(
      `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`,
      ready.cookie,
    );
    expect(recovered.response.status).toBe(200);
    expect(recovered.body).toMatchObject({
      validation: { state: "completed" },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
    const classifierAttachments = broker.taskAttachments.at(-1)!;
    expect(classifierAttachments[0]?.file_id).toMatch(/^skill-file-/);
    expect(classifierAttachments[1]?.file_id).toMatch(/^task-input-file-/);
    expect(classifierAttachments[2]?.file_id).toMatch(/^file-/);
  });

  it("retries terminal resource cleanup in the background before marking it complete", async () => {
    const ready = await createReadyProject();
    broker.failDeleteFile = true;
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const completed = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(completed.response.status).toBe(201);
    const projectId = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ projectId: string }>(ready.projectToken, "project").value
      .projectId;
    await expect(
      customQuestionValidationStore.get(
        projectId,
        CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      ),
    ).resolves.toMatchObject({ cleanupCompleted: false });

    const worker = createGeoCustomQuestionRecoveryWorker({
      broker,
      store: customQuestionValidationStore,
    });
    await worker.runOnce();
    await expect(
      customQuestionValidationStore.get(
        projectId,
        CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      ),
    ).resolves.toMatchObject({ cleanupCompleted: false });

    broker.failDeleteFile = false;
    await worker.runOnce();
    await expect(
      customQuestionValidationStore.get(
        projectId,
        CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      ),
    ).resolves.toMatchObject({ cleanupCompleted: true });
    expect(broker.tasks.has("custom-question-classifier-1")).toBe(true);
  });

  it("completes an active reservation in the background without another browser poll", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierPendingPolls = 99;
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const started = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(started.response.status).toBe(202);
    broker.tasks.set("custom-question-classifier-1", {
      id: "custom-question-classifier-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            { text: JSON.stringify(broker.customQuestionClassifierOutput) },
          ],
        },
      ],
    });

    const worker = createGeoCustomQuestionRecoveryWorker({
      broker,
      store: customQuestionValidationStore,
    });
    await worker.runOnce();

    const projectId = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ projectId: string }>(ready.projectToken, "project").value
      .projectId;
    await expect(
      customQuestionValidationStore.get(
        projectId,
        CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      ),
    ).resolves.toMatchObject({
      state: "completed",
      cleanupCompleted: true,
      result: {
        question: "Acme 在高校科研场景中能解决什么问题？",
      },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
    expect(broker.tasks.has("custom-question-classifier-1")).toBe(true);
  });

  it("accepts succeeded as the terminal v2 classifier status", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierPendingPolls = 99;
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const started = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(started.response.status).toBe(202);

    broker.tasks.set("custom-question-classifier-1", {
      localTaskId: "custom-question-classifier-1",
      operationId: "operation:custom-question-classifier-1",
      status: "succeeded",
      safeEvents: [],
      result: {
        structuredResult: broker.customQuestionClassifierOutput,
        artifacts: [],
      },
    });
    const completed = await jsonRequest(
      `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`,
      ready.cookie,
    );
    expect(completed.response.status).toBe(200);
    expect(completed.body).toMatchObject({
      validation: { state: "completed" },
      question: {
        question: "Acme 在高校科研场景中能解决什么问题？",
      },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it("keeps a Dashboard-normalized nonterminal classifier status pending", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierPendingPolls = 99;
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const started = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(started.response.status).toBe(202);
    broker.tasks.set("custom-question-classifier-1", {
      id: "custom-question-classifier-1",
      status: "provider-new-terminal-state",
      output: [],
    });
    const statusPath = `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`;

    for (let observation = 1; observation <= 2; observation += 1) {
      const pending = await jsonRequest(statusPath, ready.cookie);
      expect(pending.response.status).toBe(202);
      expect(pending.body).toMatchObject({
        validation: { state: "submitted" },
      });
    }
    const pending = await jsonRequest(statusPath, ready.cookie);
    expect(pending.response.status).toBe(202);
    expect(pending.body).toMatchObject({
      validation: { state: "submitted" },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it.each([
    "科研仪器行业排名前十的品牌有哪些？",
    "GEO 服务商哪家最好？",
    "有哪些企业知识库产品值得推荐？",
    "GEO 服务商有推荐的吗？",
    "推荐品牌有哪些？",
  ])(
    "rejects a custom industry-ranking question before payment: %s",
    async (question) => {
      const ready = await createReadyProject();
      const rejected = await jsonRequest(
        `/projects/${encodeURIComponent(ready.projectToken)}/questions/custom`,
        ready.cookie,
        {
          method: "POST",
          body: {
            question,
            clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
          },
        },
      );
      expect(rejected.response.status).toBe(422);
      expect(rejected.body).toMatchObject({
        error: { code: "INDUSTRY_RANKING_QUESTION" },
      });
      expect(paymentCheckoutCalls).toHaveLength(0);
      expect(broker.monitorCreates).toBe(0);
    },
  );

  it("rejects a question that the knowledge-base classifier identifies as enterprise-unrelated", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierOutput = {
      decision: "reject",
      category: "unrelated",
      enterpriseRelated: false,
      reasonCode: "enterprise_unrelated",
      reason: "问题讨论其他品牌手机，与 Acme 企业知识无关。",
      enterpriseAnchor: null,
      offeringAnchor: null,
      evidenceRefs: [],
    };

    const rejected = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/questions/custom`,
      ready.cookie,
      {
        method: "POST",
        body: {
          question: "苹果手机最近有什么新功能？",
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        },
      },
    );

    expect(rejected.response.status).toBe(422);
    expect(rejected.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_ENTERPRISE_UNRELATED" },
      validation: {
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        state: "rejected",
        error: { retryable: false },
      },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
    expect(paymentCheckoutCalls).toHaveLength(0);

    const deleted = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );
    expect(deleted.response.status).toBe(200);
    expect(deleted.body).toMatchObject({ ok: true });
  });

  it("does not salvage a quoted malformed classifier result", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierRawText = `{"decision":"reject","category":"unrelated","enterpriseRelated":false,"reasonCode":"enterprise_unrelated","reason":"问题询问"FrontMind"是什么企业，该名称在硅基流动企业知识库中无任何记录，既非硅基流动的产品、服务、别名，也未与硅基流动存在任何可验证的关联路径，无法将其绑定至被评估企业。","enterpriseAnchor":null,"offeringAnchor":null,"evidenceRefs":[]}`;

    const rejected = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/questions/custom`,
      ready.cookie,
      {
        method: "POST",
        body: {
          question: "FrontMind是什么企业？",
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        },
      },
    );

    expect(rejected.response.status).toBe(502);
    expect(rejected.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_CLASSIFIER_INVALID_RESPONSE" },
      validation: { state: "failed", error: { retryable: true } },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it("fails one malformed classifier result without continuing the same task", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierRawText = "not-json";
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;

    const started = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(started.response.status).toBe(502);
    expect(started.body).toMatchObject({
      validation: {
        state: "failed",
        error: { code: "CUSTOM_QUESTION_CLASSIFIER_INVALID_RESPONSE" },
      },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
    expect(broker.repairCalls).toHaveLength(0);
  });

  it("consumes a Dashboard-localized classifier result without downloading a Provider output file", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierUseOutputFile = true;
    broker.customQuestionClassifierOutput = {
      decision: "accept",
      category: "reputation",
      enterpriseRelated: true,
      reasonCode: "accepted",
      reason: "问题明确询问 Acme 在长期业务中的服务可靠性。",
      enterpriseAnchor: "Acme",
      offeringAnchor: null,
      evidenceRefs: ["evidence/S001.md"],
    };

    const accepted = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/questions/custom`,
      ready.cookie,
      {
        method: "POST",
        body: {
          question: "Acme 的长期服务可靠性如何？",
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        },
      },
    );

    expect(accepted.response.status).toBe(201);
    expect(accepted.body).toMatchObject({
      validation: { state: "completed" },
      question: { category: "reputation" },
    });
    expect(broker.downloadedFileIds).not.toContain(
      "custom-question-classifier-1-result-json",
    );
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it("fails closed on conflicting classifier objects", async () => {
    const ready = await createReadyProject();
    const accepted = {
      decision: "accept",
      category: "reputation",
      enterpriseRelated: true,
      reasonCode: "accepted",
      reason: "第一份结果依据企业知识库判断 Acme 可靠。",
      enterpriseAnchor: "Acme",
      offeringAnchor: null,
      evidenceRefs: ["evidence/S001.md"],
    };
    broker.customQuestionClassifierRawTexts = [
      `${JSON.stringify(accepted)}\n${JSON.stringify({
        ...accepted,
        reason: "第二份结果给出了不同的结构有效判断理由。",
      })}`,
      JSON.stringify({
        ...accepted,
        reason: "重验结果唯一且明确绑定 Acme 的服务可靠性。",
      }),
    ];

    const started = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/questions/custom`,
      ready.cookie,
      {
        method: "POST",
        body: {
          question: "Acme 靠谱吗？",
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        },
      },
    );
    expect(started.response.status).toBe(502);
    expect(started.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_CLASSIFIER_INVALID_RESPONSE" },
      validation: { state: "failed", error: { retryable: true } },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it("fails closed on one irreparable classifier result", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierRawTexts = [
      "not-json",
      JSON.stringify({
        decision: "accept",
        category: "reputation",
        enterpriseRelated: true,
        reasonCode: "accepted",
        reason: "问题明确询问 Acme 的服务可靠性。",
        enterpriseAnchor: "Acme",
        offeringAnchor: null,
        evidenceRefs: ["evidence/S001.md"],
      }),
    ];

    const started = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/questions/custom`,
      ready.cookie,
      {
        method: "POST",
        body: {
          question: "Acme 靠谱吗？",
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        },
      },
    );
    expect(started.response.status).toBe(502);
    expect(started.body).toMatchObject({
      validation: {
        state: "failed",
        question: "Acme 靠谱吗？",
        error: { retryable: true },
      },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
    expect(paymentCheckoutCalls).toHaveLength(0);
  });

  it("returns a retryable system error for an invalid typed result", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierRawTexts = ["not-json", "still-not-json"];

    const started = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/questions/custom`,
      ready.cookie,
      {
        method: "POST",
        body: {
          question: "Acme 靠谱吗？",
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        },
      },
    );
    expect(started.response.status).toBe(502);
    expect(started.body).toMatchObject({
      error: {
        code: "CUSTOM_QUESTION_CLASSIFIER_INVALID_RESPONSE",
        message: "验证结果格式异常，可重新验证当前问题",
      },
      validation: {
        state: "failed",
        error: { retryable: true },
      },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it("does not salvage a retained malformed result for a new operation", async () => {
    customQuestionValidationNowMs = Date.now();
    const ready = await createReadyProject();
    broker.customQuestionClassifierRawTexts = ["not-json", "still-not-json"];
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const question = "Acme 在高并发突发流量下的长期服务稳定性靠谱吗？";
    const firstClientRequestId = CUSTOM_QUESTION_CLIENT_REQUEST_ID;
    const secondClientRequestId = "22222222-2222-4222-8222-222222222222";

    const started = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: { question, clientRequestId: firstClientRequestId },
    });
    expect(started.response.status).toBe(502);
    expect(broker.customQuestionClassifierTaskCount).toBe(1);

    broker.customQuestionClassifierRawTexts = [];
    broker.customQuestionClassifierRawText = undefined;
    broker.customQuestionClassifierOutput = {
      decision: "accept",
      category: "reputation",
      enterpriseRelated: true,
      reasonCode: "accepted",
      reason: "问题明确以 Acme 为主语询问其可靠性。",
      enterpriseAnchor: "Acme",
      offeringAnchor: null,
      evidenceRefs: ["evidence/S001.md"],
    };

    const replayed = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: { question, clientRequestId: secondClientRequestId },
    });
    expect(replayed.response.status).toBe(201);
    expect(replayed.body).toMatchObject({
      validation: {
        clientRequestId: secondClientRequestId,
        state: "completed",
        question,
      },
      question: { question, category: "reputation" },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(2);
  });

  it("fails closed when a classifier accepts a question without a verified enterprise or offering anchor", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierOutput = {
      decision: "accept",
      category: "product_scenario",
      enterpriseRelated: true,
      reasonCode: "accepted",
      reason: "问题看似涉及一种通用产品场景。",
      enterpriseAnchor: null,
      offeringAnchor: null,
      evidenceRefs: ["evidence/S001.md"],
    };

    const rejected = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/questions/custom`,
      ready.cookie,
      {
        method: "POST",
        body: {
          question: "苹果手机最近有什么新功能？",
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        },
      },
    );

    expect(rejected.response.status).toBe(422);
    expect(rejected.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_ENTERPRISE_UNRELATED" },
    });
    expect(paymentCheckoutCalls).toHaveLength(0);
  });

  it("fails closed on an evidence path outside the enterprise knowledge base", async () => {
    const ready = await createReadyProject();
    const invalidEvidence = {
      decision: "accept",
      category: "reputation",
      enterpriseRelated: true,
      reasonCode: "accepted",
      reason: "问题明确询问 Acme 的可信度。",
      enterpriseAnchor: "Acme",
      offeringAnchor: null,
      evidenceRefs: ["external/nonexistent.md"],
    };
    broker.customQuestionClassifierRawTexts = [
      JSON.stringify(invalidEvidence),
      JSON.stringify({
        ...invalidEvidence,
        reason: "问题明确询问 Acme 在关键业务中的长期服务可靠性。",
        evidenceRefs: ["evidence/S001.md"],
      }),
    ];

    const started = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/questions/custom`,
      ready.cookie,
      {
        method: "POST",
        body: {
          question: "Acme 在关键业务中的长期服务可靠性如何？",
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        },
      },
    );
    expect(started.response.status).toBe(502);
    expect(started.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_CLASSIFIER_INVALID_RESPONSE" },
      validation: { state: "failed", error: { retryable: true } },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
    expect(paymentCheckoutCalls).toHaveLength(0);
  });

  it("returns one retryable system error for evidence outside the knowledge base", async () => {
    const ready = await createReadyProject();
    const invalidEvidence = JSON.stringify({
      decision: "accept",
      category: "reputation",
      enterpriseRelated: true,
      reasonCode: "accepted",
      reason: "问题明确询问 Acme 在关键业务中的长期服务可靠性。",
      enterpriseAnchor: "Acme",
      offeringAnchor: null,
      evidenceRefs: ["external/nonexistent.md"],
    });
    broker.customQuestionClassifierRawTexts = [
      invalidEvidence,
      invalidEvidence,
    ];
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const started = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在关键业务中的长期服务可靠性如何？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(started.response.status).toBe(502);
    expect(started.body).toMatchObject({
      error: {
        code: "CUSTOM_QUESTION_CLASSIFIER_INVALID_RESPONSE",
        message: "验证结果格式异常，可重新验证当前问题",
      },
      validation: { state: "failed", error: { retryable: true } },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it("uses the classifier category instead of the previous regex fallback", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierOutput = {
      decision: "accept",
      category: "competitor_comparison",
      enterpriseRelated: true,
      reasonCode: "accepted",
      reason: "问题要求在 Acme 与传统自建路线之间进行具体取舍。",
      enterpriseAnchor: "Acme",
      offeringAnchor: null,
      evidenceRefs: ["evidence/S001.md"],
    };

    const accepted = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/questions/custom`,
      ready.cookie,
      {
        method: "POST",
        body: {
          question: "Acme 与传统自建路线应如何取舍？",
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        },
      },
    );

    expect(accepted.response.status).toBe(201);
    expect(accepted.body).toMatchObject({
      question: {
        category: "competitor_comparison",
        enterpriseAnchor: "Acme",
      },
      project: {
        questions: expect.arrayContaining([
          expect.objectContaining({
            category: "competitor_comparison",
            question: "Acme 与传统自建路线应如何取舍？",
          }),
        ]),
      },
    });
  });

  it("returns the exact acknowledgement expected by a verified ZPAY notify", async () => {
    const response = await fetch(`${baseUrl}/payments/notify?sign=mock`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toBe("success");

    const duplicated = await fetch(
      `${baseUrl}/payments/notify?sign=first&sign=second`,
    );
    expect(duplicated.status).toBe(400);
    expect(await duplicated.text()).toBe("fail");

    const reviewRequired = await fetch(
      `${baseUrl}/payments/notify?sign=review`,
    );
    expect(reviewRequired.status).toBe(200);
    expect(await reviewRequired.text()).toBe("success");

    const ledgerUnavailable = await fetch(
      `${baseUrl}/payments/notify?sign=ledger-down`,
    );
    expect(ledgerUnavailable.status).toBe(400);
    expect(await ledgerUnavailable.text()).toBe("fail");
  });

  it("acknowledges a late callback but moves its cutover-closed monitor order to review", async () => {
    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    const projectId = "project-late-monitor-callback";
    const authorization = codec.seal(
      "payment",
      { projectId, purchaseType: "monitoring" },
      60 * 60 * 1000,
    );
    projectOrders.set("zpay-order-001", {
      orderId: "zpay-order-001",
      projectId,
      purchaseType: "monitoring",
      amountFen: 400,
      authorizationDigest: createHash("sha256")
        .update(authorization)
        .digest("hex"),
      state: "closed",
      checkoutExpiresAt: "2027-07-23T10:00:00.000Z",
      eventAt: "2026-08-01T00:00:00.000Z",
    });

    const response = await fetch(
      `${baseUrl}/payments/notify?sign=mock&param=${encodeURIComponent(authorization)}`,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("success");
    expect(projectOrders.get("zpay-order-001")?.state).toBe("review_required");
    expect(projectOrders.get("zpay-order-001")?.paidAt).toBe(
      "2026-07-22T10:05:00.000Z",
    );
    expect(broker.monitorCreates).toBe(0);
  });

  it("rejects HEAD payment callbacks without executing GET verification side effects", async () => {
    for (const callback of ["notify", "return"]) {
      const response = await fetch(
        `${baseUrl}/payments/${callback}?sign=mock`,
        { method: "HEAD" },
      );
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET");
      expect(await response.text()).toBe("");
    }
    expect(paymentCallbackCalls).toBe(0);
  });

  it("lists edition-scoped monitoring regions through the owned project route", async () => {
    const ready = await createReadyProject();

    const response = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring/regions?edition=domestic`,
      ready.cookie,
    );

    expect(response.response.status).toBe(200);
    expect(response.response.headers.get("cache-control")).toBe("no-store");
    expect(response.body).toEqual({
      catalog: {
        edition: "domestic",
        regions: broker.monitorRegions.domestic,
      },
    });
    expect(broker.monitorRegionReads).toEqual(["domestic"]);
  });

  it("submits region and screenshot once and trusts the Dashboard region snapshot", async () => {
    const ready = await createReadyProject();
    const body = {
      schemaVersion: 2,
      clientRequestId: "76767676-7676-4767-8767-767676767676",
      questionId: "product-scenario-01",
      monitoringEdition: "domestic",
      regionCode: "110000",
      screenshotEnabled: true,
      platformIds: ["deepseek"],
    };

    const started = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      { method: "POST", body },
    );

    expect(started.response.status).toBe(201);
    expect(broker.monitorRegionReads).toEqual([]);
    expect(broker.monitorCreateInputs).toHaveLength(1);
    expect(broker.monitorCreateInputs[0]).toMatchObject({
      monitorKeyword: "Acme",
      screenshot: 1,
      region: { scope: "domestic", code: "110000" },
    });
    expect(started.body).toMatchObject({
      project: {
        monitoringRegion: {
          edition: "domestic",
          code: "110000",
          label: "北京市",
        },
        monitoringScreenshotEnabled: true,
        monitoring: {
          region: {
            edition: "domestic",
            code: "110000",
            label: "北京市",
          },
          screenshotEnabled: true,
        },
      },
    });

    const changedRegion = await jsonRequest(
      `/projects/${encodeURIComponent(started.body.projectToken)}/monitoring`,
      ready.cookie,
      {
        method: "POST",
        body: {
          ...body,
          clientRequestId: "75757575-7575-4757-8757-757575757575",
          regionCode: "opaque:cn-east",
        },
      },
    );
    expect(changedRegion.response.status).toBe(409);
    expect(changedRegion.body).toMatchObject({
      error: { code: "MONITOR_SCOPE_CONFLICT" },
    });
    expect(broker.monitorCreateInputs).toHaveLength(1);
  });

  it("returns REGION_UNAVAILABLE without a second Website catalog lookup", async () => {
    const ready = await createReadyProject();
    const response = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      {
        method: "POST",
        body: {
          schemaVersion: 2,
          clientRequestId: "74747474-7474-4747-8747-747474747474",
          questionId: "product-scenario-01",
          monitoringEdition: "domestic",
          regionCode: "removed-node",
          platformIds: ["deepseek"],
        },
      },
    );

    expect(response.response.status).toBe(422);
    expect(response.body).toMatchObject({
      error: { code: "REGION_UNAVAILABLE" },
    });
    expect(broker.monitorRegionReads).toEqual([]);
    expect(broker.monitorCreateInputs).toHaveLength(1);
  });

  it("streams an owned monitor screenshot through the Website same-origin route", async () => {
    const ready = await createReadyProject();
    const started = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      {
        method: "POST",
        body: {
          schemaVersion: 2,
          clientRequestId: "73737373-7373-4737-8737-737373737373",
          questionId: "product-scenario-01",
          monitoringEdition: "domestic",
          screenshotEnabled: true,
          platformIds: ["deepseek"],
        },
      },
    );
    expect(started.response.status).toBe(201);
    broker.monitorRuns.set("monitor-1", {
      runId: "monitor-1",
      status: "polling",
      question: "Acme 服务模块 1 主要解决哪些业务问题？",
      platforms: ["deepseek"],
      repeatPerPlatform: 5,
      expectedItems: 5,
      completedItems: 1,
      failedItems: 0,
      screenshot: 1,
      records: [
        {
          recordId: "record-1",
          platform: "deepseek",
          runIndex: 1,
          status: "completed",
          answerText: "回答正文",
          media: [],
          sources: [],
          screenshot: { available: true, url: "/private/dashboard/url" },
        },
      ],
    });

    const response = await fetch(
      `${baseUrl}/projects/${encodeURIComponent(started.body.projectToken)}/monitoring/records/record-1/screenshot`,
      { headers: { cookie: ready.cookie } },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      broker.monitorScreenshotBytes,
    );
    expect(broker.monitorScreenshotDownloads).toEqual([
      { runId: "monitor-1", recordId: "record-1" },
    ]);
  });

  it("submits one free 5-per-platform text search run and replays idempotently", async () => {
    const ready = await createReadyProject();
    const body = {
      schemaVersion: 2,
      clientRequestId: "87878787-8787-4787-8787-878787878787",
      questionId: "product-scenario-01",
      monitoringEdition: "domestic",
      platformIds: [
        "doubao",
        "yuanbao",
        "deepseek",
        "baiduai",
        "qianwen",
        "kimi",
      ],
    };
    const started = await jsonRequest(
      "/projects/" + encodeURIComponent(ready.projectToken) + "/monitoring",
      ready.cookie,
      { method: "POST", body },
    );
    expect(started.response.status).toBe(201);
    expect(started.body).toMatchObject({
      state: "started",
      replayed: false,
      project: {
        stage: "monitoring",
        selectedQuestionId: "product-scenario-01",
        selectedPlatformIds: body.platformIds,
        monitoring: {
          status: "submitted",
          repeatPerPlatform: 5,
          expectedRecords: 30,
        },
      },
    });
    expect(broker.monitorCreates).toBe(1);

    const replayed = await jsonRequest(
      "/projects/" + encodeURIComponent(ready.projectToken) + "/monitoring",
      ready.cookie,
      { method: "POST", body },
    );
    expect(replayed.response.status).toBe(200);
    expect(replayed.body).toMatchObject({ state: "started", replayed: true });
    expect(broker.monitorCreates).toBe(1);
    expect(paymentCalls).toHaveLength(0);
  });

  it("keeps an unconfirmed free monitor submission in one recoverable reservation", async () => {
    const ready = await createReadyProject();
    broker.monitorCreateStatus = "submission_unknown";
    const body = {
      schemaVersion: 2,
      clientRequestId: "88888888-8888-4888-8888-888888888888",
      questionId: "product-scenario-01",
      monitoringEdition: "domestic",
      platformIds: ["doubao"],
    };

    const first = await jsonRequest(
      "/projects/" + encodeURIComponent(ready.projectToken) + "/monitoring",
      ready.cookie,
      { method: "POST", body },
    );
    expect(first.response.status).toBe(202);
    expect(first.body).toMatchObject({
      state: "processing",
      clientRequestId: body.clientRequestId,
      retryAfterMs: 3_000,
      projectToken: expect.any(String),
    });

    const replayed = await jsonRequest(
      "/projects/" + encodeURIComponent(ready.projectToken) + "/monitoring",
      ready.cookie,
      {
        method: "POST",
        body: {
          ...body,
          clientRequestId: "87878787-8787-4787-8787-878787878787",
        },
      },
    );
    expect(replayed.response.status).toBe(202);
    expect(replayed.body).toMatchObject({
      state: "processing",
      clientRequestId: body.clientRequestId,
    });
    expect(broker.monitorCreates).toBe(1);
    expect(projectOrders.size).toBe(0);
    expect(paymentCalls).toHaveLength(0);
  });

  it("recovers a lost provider acknowledgement after restart with the durable scope and a new client request id", async () => {
    const ready = await createReadyProject();
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "frontmind-router-monitor-free-"),
    );
    temporaryMonitorStoreDirectories.push(directory);
    monitorFreeReservationStore = new FileGeoMonitorFreeReservationStore(
      directory,
    );
    await monitorFreeReservationStore.assertReady();
    await restartWithCustomQuestionValidationStore(
      customQuestionValidationStore,
    );

    const createMonitorRun = broker.createMonitorRun.bind(broker);
    let loseFirstAcknowledgement = true;
    broker.createMonitorRun = async (input) => {
      const run = await createMonitorRun(input);
      if (loseFirstAcknowledgement) {
        loseFirstAcknowledgement = false;
        throw new GeoBrokerError(
          "provider accepted the run but the response was lost",
          503,
          "MONITOR_SUBMISSION_UNKNOWN",
        );
      }
      return run;
    };
    const originalRequest = {
      schemaVersion: 2,
      clientRequestId: "98989898-9898-4989-8989-989898989898",
      questionId: "product-scenario-01",
      monitoringEdition: "domestic",
      platformIds: ["doubao"],
    };
    const lost = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      { method: "POST", body: originalRequest },
    );
    expect(lost.response.status).toBe(202);
    expect(broker.monitorCreates).toBe(1);

    monitorFreeReservationStore = new FileGeoMonitorFreeReservationStore(
      directory,
    );
    await monitorFreeReservationStore.assertReady();
    await restartWithCustomQuestionValidationStore(
      customQuestionValidationStore,
    );

    const conflicting = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      {
        method: "POST",
        body: {
          ...originalRequest,
          clientRequestId: "97979797-9797-4979-8979-979797979797",
          platformIds: ["kimi"],
        },
      },
    );
    expect(conflicting.response.status).toBe(409);
    expect(conflicting.body).toMatchObject({
      error: { code: "MONITOR_SCOPE_CONFLICT" },
    });

    const recovered = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      {
        method: "POST",
        body: {
          ...originalRequest,
          clientRequestId: "96969696-9696-4969-8969-969696969696",
        },
      },
    );
    expect(recovered.response.status).toBe(200);
    expect(recovered.body).toMatchObject({
      state: "started",
      replayed: true,
    });
    expect(broker.monitorCreates).toBe(1);
    expect(
      Array.from(broker.monitorRuns.keys()).filter((key) =>
        key.startsWith("geo-monitor-free:v2:"),
      ),
    ).toHaveLength(1);
    const projectId = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ projectId: string }>(ready.projectToken, "project").value
      .projectId;
    await expect(
      monitorFreeReservationStore.get(projectId),
    ).resolves.toMatchObject({
      clientRequestId: originalRequest.clientRequestId,
      state: "started",
      runId: "monitor-1",
    });
  });

  it("recovers the same free scope after an explicit monitor rejection is repaired", async () => {
    const ready = await createReadyProject();
    broker.monitorCreateError = new GeoBrokerError(
      "监控服务已明确拒绝本次提交",
      502,
      "MONITOR_SUBMISSION_REJECTED",
    );
    const body = {
      schemaVersion: 2,
      clientRequestId: "89898989-8989-4989-8989-898989898989",
      questionId: "product-scenario-01",
      monitoringEdition: "domestic",
      platformIds: ["doubao"],
    };

    const rejected = await jsonRequest(
      "/projects/" + encodeURIComponent(ready.projectToken) + "/monitoring",
      ready.cookie,
      { method: "POST", body },
    );
    expect(rejected.response.status).toBe(502);
    expect(rejected.body).toMatchObject({
      error: { code: "MONITOR_SUBMISSION_REJECTED" },
    });
    expect(projectOrders.size).toBe(0);

    broker.monitorCreateError = undefined;
    const recovered = await jsonRequest(
      "/projects/" + encodeURIComponent(ready.projectToken) + "/monitoring",
      ready.cookie,
      { method: "POST", body },
    );
    expect(recovered.response.status).toBe(201);
    expect(recovered.body).toMatchObject({
      state: "started",
      replayed: false,
    });
    expect(broker.monitorCreates).toBe(1);
  });

  it("releases a pristine durable reservation after deterministic question validation fails", async () => {
    const ready = await createReadyProject();
    const rejected = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      {
        method: "POST",
        body: {
          schemaVersion: 2,
          clientRequestId: "95959595-9595-4959-8959-959595959595",
          questionId: "missing-question",
          monitoringEdition: "domestic",
          platformIds: ["doubao"],
        },
      },
    );
    expect(rejected.response.status).toBe(400);
    expect(broker.monitorCreates).toBe(0);

    const corrected = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      {
        method: "POST",
        body: {
          schemaVersion: 2,
          clientRequestId: "94949494-9494-4949-8949-949494949494",
          questionId: "product-scenario-01",
          monitoringEdition: "domestic",
          platformIds: ["doubao"],
        },
      },
    );
    expect(corrected.response.status).toBe(201);
    expect(broker.monitorCreates).toBe(1);
  });

  it("clears a deterministic pre-submission reservation so a corrected scope is not poisoned", async () => {
    const ready = await createReadyProject();
    const invalid = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      {
        method: "POST",
        body: {
          schemaVersion: 2,
          clientRequestId: "90909090-9090-4090-8090-909090909090",
          questionId: "missing-question-01",
          monitoringEdition: "domestic",
          platformIds: ["doubao"],
        },
      },
    );
    expect(invalid.response.status).toBe(400);
    expect(broker.monitorCreates).toBe(0);

    const corrected = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      {
        method: "POST",
        body: {
          schemaVersion: 2,
          clientRequestId: "91919191-9191-4191-8191-919191919191",
          questionId: "product-scenario-02",
          monitoringEdition: "domestic",
          platformIds: ["doubao"],
        },
      },
    );
    expect(corrected.response.status).toBe(201);
    expect(corrected.body).toMatchObject({ state: "started" });
    expect(broker.monitorCreates).toBe(1);
  });

  it("returns completed records from the result endpoint while monitoring is still running", async () => {
    const ready = await createReadyProject();
    const started = await startOnePlatformMonitor(ready);
    const status = broker.monitorRuns.get("monitor-1")!;
    broker.monitorResults.set("monitor-1", {
      ...status,
      status: "polling",
      completedItems: 1,
      records: [monitorRecord(1, "渐进返回的第一条真实回答")],
    });

    const refreshed = await jsonRequest(
      `/projects/${encodeURIComponent(started.projectToken)}`,
      ready.cookie,
    );

    expect(refreshed.response.status).toBe(200);
    expect(refreshed.body).toMatchObject({
      project: {
        monitoring: {
          status: "polling",
          completedRecords: 1,
          records: [
            {
              answerText: "渐进返回的第一条真实回答",
              sources: [
                { title: "Acme 官网", url: "https://acme.example/about" },
                {
                  title: "检索参考",
                  url: "https://search.example/result",
                },
              ],
            },
          ],
        },
      },
    });
    expect(broker.monitorResultReads).toBe(1);
    expect(broker.monitorCreates).toBe(1);
  });

  it("falls back to the normalized status when a running result is not ready", async () => {
    const ready = await createReadyProject();
    const started = await startOnePlatformMonitor(ready);
    broker.monitorResultError = new GeoBrokerError(
      "监控结果仍在生成",
      502,
      "MONITOR_RESULT_PENDING",
    );

    const refreshed = await jsonRequest(
      `/projects/${encodeURIComponent(started.projectToken)}`,
      ready.cookie,
    );

    expect(refreshed.response.status).toBe(200);
    expect(refreshed.body).toMatchObject({
      project: {
        monitoring: {
          status: "submitted",
          completedRecords: 0,
        },
      },
    });
    expect((refreshed.body as any).project.monitoring).not.toHaveProperty(
      "records",
    );
    expect(broker.monitorResultReads).toBe(1);
    expect(broker.monitorCreates).toBe(1);
  });

  it("keeps a submission-unknown monitor project running instead of marking it failed", async () => {
    const ready = await createReadyProject();
    const started = await startOnePlatformMonitor(ready);
    const submitted = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...submitted,
      status: "submission_unknown",
      nextPollAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const refreshed = await jsonRequest(
      `/projects/${encodeURIComponent(started.projectToken)}`,
      ready.cookie,
    );

    expect(refreshed.response.status).toBe(200);
    expect(refreshed.body).toMatchObject({
      project: {
        status: "running",
        stage: "monitoring",
        monitoring: { status: "submission_unknown" },
      },
    });
    expect((refreshed.body as any).project.status).not.toBe("failed");
    expect(broker.monitorCreates).toBe(1);
  });

  it("continues to resolve a completed run from its final result snapshot", async () => {
    const ready = await createReadyProject();
    const started = await startOnePlatformMonitor(ready);
    const submitted = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...submitted,
      status: "completed",
      completedItems: 5,
    });
    broker.monitorResults.set("monitor-1", {
      ...submitted,
      status: "completed",
      completedItems: 5,
      records: Array.from({ length: 5 }, (_, index) =>
        monitorRecord(index + 1, `最终结果 ${index + 1}`),
      ),
    });

    const refreshed = await jsonRequest(
      `/projects/${encodeURIComponent(started.projectToken)}`,
      ready.cookie,
    );

    expect(refreshed.response.status).toBe(200);
    expect((refreshed.body as any).project.monitoring).toMatchObject({
      status: "completed",
      completedRecords: 5,
      quality: {
        completeness: "complete",
        stats: { acceptedCount: 5, expectedCount: 5, droppedCount: 0 },
        downstreamEligible: true,
      },
    });
    expect(
      (refreshed.body as any).project.monitoring.records[0].answerText,
    ).toBe("最终结果 1");
    expect(broker.monitorResultReads).toBe(1);
    expect(broker.monitorCreates).toBe(1);
  });

  it("rejects locked ranking questions before payment or monitoring", async () => {
    const ready = await createReadyProject();
    const rejected = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      {
        method: "POST",
        body: {
          questionId: "industry-ranking-01",
          platformIds: ["kimi"],
          paymentAuthorization: "zpay-signed-authorization-placeholder",
        },
      },
    );
    expect(rejected.response.status).toBe(403);
    expect(paymentCalls).toHaveLength(0);
    expect(broker.monitorCreates).toBe(0);
  });

  it("rejects an open comparison target even when generated as a selectable competitor question", async () => {
    const generated = validQuestionSet();
    generated.questions[15] = {
      ...generated.questions[15],
      question: "Acme 和几个主流平台相比哪个更好？",
      competitorAnchor: "几个主流平台",
      category: "competitor_comparison",
      selectable: true,
    };
    broker.questionTaskOutput = generated;

    const ready = await createReadyProject();
    const rejected = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      {
        method: "POST",
        body: {
          questionId: "competitor-comparison-01",
          platformIds: ["kimi"],
          paymentAuthorization: "zpay-signed-authorization-placeholder",
        },
      },
    );

    expect(rejected.response.status).toBe(403);
    expect(rejected.body).toMatchObject({
      error: { code: "QUESTION_NOT_SELECTABLE" },
    });
    expect(paymentCalls).toHaveLength(0);
    expect(broker.monitorCreates).toBe(0);
  });

  it("starts Base assessment only after complete real monitor records", async () => {
    const ready = await createReadyProject();
    const startedPayload = await startOnePlatformMonitor(ready);

    const tooEarly = await jsonRequest(
      `/projects/${encodeURIComponent(startedPayload.projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(tooEarly.response.status).toBe(409);
    expect(broker.assessmentTaskCount).toBe(0);

    const run = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...run,
      status: "completed",
      completedItems: 5,
      records: Array.from({ length: 5 }, (_, index) => ({
        recordId: `record-${index + 1}`,
        platform: "doubao",
        runIndex: index + 1,
        status: "completed",
        answerText: `Acme 回答 ${index + 1}`,
        media: [
          {
            type: "video",
            url: "https://media.example/interview.mp4",
          },
        ],
        citations: [{ title: "Acme 官网", url: "https://acme.example/about" }],
        references: [
          { title: "检索参考", url: "https://search.example/result" },
        ],
      })),
    });
    broker.completeAssessmentImmediately = true;
    const assessed = await jsonRequest(
      `/projects/${encodeURIComponent(startedPayload.projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(assessed.response.status).toBe(201);
    expect(assessed.body).toMatchObject({
      project: {
        stage: "current_assessment",
        assessment: {
          status: "ready",
          totalScore: 52.5,
          grade: "C",
          coverage: 1,
          scopeLabel: "本题证据表现",
        },
      },
    });
    expect(broker.assessmentTaskCount).toBe(1);
    expect(broker.prompts.at(-1)).toContain(
      "此任务使用 Base 模型，只输出 schema 要求的事实四分类、confidence 与 0-1 原始指标",
    );
    expect(broker.prompts.at(-1)).toContain(
      "最终答案必须通过任务的 Structured Output 合同返回一个业务对象",
    );
    expect(broker.prompts.at(-1)).toContain(
      "禁止创建、上传或附加结果 JSON 文件",
    );
    expect(broker.prompts.at(-1)).toContain("在单次任务中完成");
    const assessmentAttachments = broker.taskAttachments.at(-1)!;
    expect(
      assessmentAttachments.map((attachment) => attachment.filename),
    ).toEqual([
      "geo-current-state-evaluator.skill.zip",
      "frontmind-current-state-assessment-task-input.json",
      "Acme_website_lead_knowledge_base.zip",
      "Acme-monitoring-records.json",
    ]);
    const monitoringAttachment = assessmentAttachments.find(
      (attachment) => attachment.filename === "Acme-monitoring-records.json",
    )!;
    const parsedMonitoring = JSON.parse(
      broker.uploads.get(monitoringAttachment.file_id)!.toString("utf8"),
    );
    expect(parsedMonitoring.records).toHaveLength(5);
    expect(parsedMonitoring.records[0].sources).toEqual([
      { title: "Acme 官网", url: "https://acme.example/about" },
      { title: "检索参考", url: "https://search.example/result" },
    ]);
    expect(parsedMonitoring.records[0].media).toBeUndefined();
  });

  it("replays one accepted assessment with the same generated evidence file ids after its response is lost", async () => {
    const ready = await createReadyProject();
    const monitored = await startOnePlatformMonitor(ready);
    const run = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...run,
      status: "completed",
      completedItems: 5,
      records: Array.from({ length: 5 }, (_, index) =>
        monitorRecord(index + 1, `Acme 回答 ${index + 1}`),
      ),
    });

    const createTask = broker.createTask.bind(broker);
    const submittedAttachments: Array<
      Array<{ file_id: string; filename: string }>
    > = [];
    let loseFirstAssessmentResponse = true;
    broker.createTask = async (input) => {
      if (!input.prompt.includes("geo-current-state-evaluator.skill.zip")) {
        return createTask(input);
      }
      submittedAttachments.push(
        input.localAssets.map(({ localAssetId, filename }) => ({
          file_id: localAssetId,
          filename,
        })),
      );
      const task = await createTask(input);
      if (loseFirstAssessmentResponse) {
        loseFirstAssessmentResponse = false;
        throw new GeoBrokerError(
          "assessment committed before the response was lost",
          502,
          "AGENT_UNAVAILABLE",
        );
      }
      return task;
    };

    const pathname = `/projects/${encodeURIComponent(monitored.projectToken)}/assessment`;
    const ambiguous = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {},
    });
    expect(ambiguous.response.status).toBe(502);
    const reorderedRun = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...reorderedRun,
      platforms: [...reorderedRun.platforms].reverse(),
      records: [...(reorderedRun.records || [])].reverse().map((record) => ({
        ...record,
        sources: [...record.sources].reverse(),
      })),
    });
    const replayed = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {},
    });

    expect(replayed.response.status).toBe(201);
    expect(broker.assessmentTaskCount).toBe(1);
    expect(submittedAttachments).toHaveLength(2);
    expect(submittedAttachments[1]).toEqual(submittedAttachments[0]);
    const evidenceFileId = submittedAttachments[0]!.find(
      (attachment) => attachment.filename === "Acme-monitoring-records.json",
    )!.file_id;
    expect(evidenceFileId).toBe(
      submittedAttachments[1]!.find(
        (attachment) => attachment.filename === "Acme-monitoring-records.json",
      )!.file_id,
    );
    expect(broker.deletedFiles).not.toContain(evidenceFileId);
    expect(
      broker.fileCreateOperationKeys.filter((key) =>
        key.startsWith("geo-generated-task-evidence-file:"),
      ),
    ).toHaveLength(2);
  });

  it("shows a scope-safe partial assessment and creates a fresh task on explicit retry", async () => {
    const ready = await createReadyProject();
    const monitored = await startOnePlatformMonitor(ready);
    const run = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...run,
      status: "completed",
      completedItems: 5,
      records: Array.from({ length: 5 }, (_, index) =>
        monitorRecord(index + 1, `Acme 回答 ${index + 1}`),
      ),
    });

    const first = await jsonRequest(
      `/projects/${encodeURIComponent(monitored.projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(first.response.status).toBe(201);
    expect(broker.assessmentTaskCount).toBe(1);
    const invalidAssessmentOutput = validAssessmentOutput();
    invalidAssessmentOutput.rankingDiagnostics = {
      ...invalidAssessmentOutput.rankingDiagnostics,
      totalObservations: 5,
      rankedObservations: 0,
      unmentionedObservations: 0,
    };
    broker.tasks.set("assessment-1", {
      id: "assessment-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify(invalidAssessmentOutput) }],
        },
      ],
    });
    const viewed = await jsonRequest(
      `/projects/${encodeURIComponent((first.body as any).projectToken)}`,
      ready.cookie,
    );
    expect(viewed.response.status).toBe(200);
    expect((viewed.body as any).project.assessment).toMatchObject({
      status: "ready",
      quality: {
        completeness: "partial",
        downstreamEligible: false,
      },
    });
    expect((viewed.body as any).project.assessment.totalScore).toBeUndefined();
    expect((viewed.body as any).project.optimizationForecast).toBeUndefined();
    expect((viewed.body as any).project.serviceActivation).toBeUndefined();
    expect(broker.assessmentTaskCount).toBe(1);
    expect(broker.repairCalls).toHaveLength(0);
    const repeated = await jsonRequest(
      `/projects/${encodeURIComponent((viewed.body as any).projectToken)}`,
      ready.cookie,
    );
    expect(repeated.response.status).toBe(200);
    expect(broker.assessmentTaskCount).toBe(1);
    expect(broker.repairCalls).toHaveLength(0);

    const manuallyRetried = await jsonRequest(
      `/projects/${encodeURIComponent((viewed.body as any).projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(manuallyRetried.response.status).toBe(201);
    expect((manuallyRetried.body as any).project.assessment).toMatchObject({
      status: "running",
    });
    expect(broker.assessmentTaskCount).toBe(2);
  });

  it("uses the Dashboard-localized assessment result without downloading a Provider output file", async () => {
    const ready = await createReadyProject();
    const monitored = await startOnePlatformMonitor(ready);
    const run = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...run,
      status: "completed",
      completedItems: 5,
      records: Array.from({ length: 5 }, (_, index) =>
        monitorRecord(index + 1, `Acme 回答 ${index + 1}`),
      ),
    });

    const started = await jsonRequest(
      `/projects/${encodeURIComponent(monitored.projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(started.response.status).toBe(201);
    expect(broker.assessmentTaskCount).toBe(1);

    const outputFileId = "assessment-json-output";
    broker.downloadOverrides.set(
      outputFileId,
      Buffer.from(JSON.stringify(validAssessmentOutput()), "utf8"),
    );
    broker.tasks.set("assessment-1", {
      id: "assessment-1",
      status: "completed",
      output: [
        {
          type: "output_text",
          text: "收到任务，正在解压技能包并读取相关文件，开始执行评估。",
        },
        {
          type: "output_text",
          text: "以下是符合 raw-output-schema.json 的单个 JSON 对象，已通过格式验证。",
        },
        {
          type: "output_file",
          file_id: outputFileId,
          filename: "raw-output.json",
          mime_type: "application/json",
        },
      ],
    });

    const viewed = await jsonRequest(
      `/projects/${encodeURIComponent((started.body as any).projectToken)}`,
      ready.cookie,
    );

    expect(viewed.response.status).toBe(200);
    expect((viewed.body as any).project).toMatchObject({
      assessment: {
        status: "ready",
        schemaVersion: 2,
      },
      assessmentRetryAvailable: false,
    });
    expect(
      (viewed.body as any).project.assessment.comparisons.length,
    ).toBeGreaterThan(0);
    expect(
      broker.downloadedFileIds.filter((fileId) => fileId === outputFileId),
    ).toHaveLength(0);
    expect(broker.assessmentTaskCount).toBe(1);
    expect(broker.forecastTaskCount).toBe(1);
  });

  it("reports an unavailable trusted assessment file with a safe retry code", async () => {
    const ready = await createReadyProject();
    const monitored = await startOnePlatformMonitor(ready);
    const run = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...run,
      status: "completed",
      completedItems: 5,
      records: Array.from({ length: 5 }, (_, index) =>
        monitorRecord(index + 1, `Acme 回答 ${index + 1}`),
      ),
    });
    const started = await jsonRequest(
      `/projects/${encodeURIComponent(monitored.projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    const outputFileId = "expired-assessment-json-output";
    broker.downloadErrors.set(outputFileId, new Error("upstream expired"));
    broker.tasks.set("assessment-1", {
      id: "assessment-1",
      status: "completed",
      output: [
        {
          type: "output_text",
          text: "结果已生成并通过格式验证，请查看附件。",
        },
        {
          type: "output_file",
          file_id: outputFileId,
          filename: "raw-output.json",
          mime_type: "application/json",
        },
      ],
    });

    const viewed = await jsonRequest(
      `/projects/${encodeURIComponent((started.body as any).projectToken)}`,
      ready.cookie,
    );

    expect(viewed.response.status).toBe(200);
    expect((viewed.body as any).project).toMatchObject({
      assessment: {
        status: "failed",
        failureCode: "INVALID_JSON",
        error: "现状评估结果不是可识别的 JSON，请重新评估",
      },
      assessmentRetryAvailable: true,
    });
    expect(broker.assessmentTaskCount).toBe(1);
    expect(broker.forecastTaskCount).toBe(0);
  });

  it("reuses a completed v2 reputation assessment without exposing ranking internals", async () => {
    const ready = await createReadyProject();
    const monitored = await startOnePlatformMonitor(ready, "reputation-01");
    const run = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...run,
      status: "completed",
      completedItems: 5,
      records: Array.from({ length: 5 }, (_, index) =>
        monitorRecord(index + 1, `Acme 声誉回答 ${index + 1}`),
      ),
    });

    const started = await jsonRequest(
      `/projects/${encodeURIComponent(monitored.projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(started.response.status).toBe(201);
    expect(broker.assessmentTaskCount).toBe(1);

    const reputationQuestion = validQuestionSet().questions.find(
      (question) => question.id === "reputation-01",
    )!;
    const legacyOutput = validAssessmentOutput(reputationQuestion);
    legacyOutput.rankingDiagnostics.totalObservations = 5;
    legacyOutput.platformBreakdown[0].verdict =
      "来自 doubao/run-01 的 unavailable 结论";
    legacyOutput.knowledgeVsAnswers[0].recommendedAction =
      "检查 citationList 后再处理";
    broker.tasks.set("assessment-1", {
      id: "assessment-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify(legacyOutput) }],
        },
      ],
    });

    const completed = await jsonRequest(
      `/projects/${encodeURIComponent((started.body as any).projectToken)}`,
      ready.cookie,
    );

    expect(completed.response.status).toBe(200);
    expect(completed.body).toMatchObject({
      project: {
        assessment: {
          status: "ready",
          schemaVersion: 2,
        },
        assessmentRetryAvailable: false,
      },
    });
    const publicAssessment = JSON.stringify(
      (completed.body as any).project.assessment,
    );
    expect(publicAssessment).not.toContain("doubao/run-01");
    expect(publicAssessment).not.toContain("evidenceRefs");
    expect(publicAssessment).not.toContain("runIndex");
    expect(publicAssessment).not.toContain("kbClaimId");
    expect((completed.body as any).project.assessment).toMatchObject({
      platformBreakdown: [{ verdict: "平台回答已完成事实与来源核验。" }],
      comparisons: [{ recommendedAction: "补充清晰、可追溯的事实说明。" }],
    });
    expect(broker.assessmentTaskCount).toBe(1);
  });

  it("upgrades a historical assessment to v2 exactly once when the project is opened", async () => {
    const ready = await createServiceReadyProject();
    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    const historicalValue = codec.open<Record<string, any>>(
      ready.projectToken,
      "project",
    ).value;
    delete historicalValue.assessmentVersion;
    delete historicalValue.optimizationForecastVersion;
    const historicalToken = codec.seal(
      "project",
      historicalValue,
      60 * 60 * 1000,
    );
    broker.idempotentTasks.clear();
    broker.completeAssessmentImmediately = false;

    const upgraded = await jsonRequest(
      `/projects/${encodeURIComponent(historicalToken)}`,
      ready.cookie,
    );

    expect(upgraded.response.status).toBe(200);
    expect((upgraded.body as any).project).toMatchObject({
      assessmentUpdatingToVersion2: true,
      assessment: { status: "running" },
    });
    expect((upgraded.body as any).project.optimizationForecast).toBeUndefined();
    expect(broker.assessmentTaskCount).toBe(2);
    const upgradedValue = codec.open<Record<string, any>>(
      (upgraded.body as any).projectToken,
      "project",
    ).value;
    expect(upgradedValue).toMatchObject({
      assessmentVersion: 2,
      assessmentTaskId: "assessment-2",
      previousAssessmentTaskIds: [ready.assessmentTaskId],
      previousOptimizationForecastTaskIds: [ready.forecastTaskId],
    });

    const repeated = await jsonRequest(
      `/projects/${encodeURIComponent((upgraded.body as any).projectToken)}`,
      ready.cookie,
    );
    expect(repeated.response.status).toBe(200);
    expect(broker.assessmentTaskCount).toBe(2);

    broker.tasks.set("assessment-2", {
      id: "assessment-2",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify(validAssessmentOutput()) }],
        },
      ],
    });
    broker.completeForecastImmediately = true;
    const completed = await jsonRequest(
      `/projects/${encodeURIComponent((repeated.body as any).projectToken)}`,
      ready.cookie,
    );
    expect(completed.response.status).toBe(200);
    expect((completed.body as any).project).toMatchObject({
      assessmentUpdatingToVersion2: false,
      assessment: { status: "ready", schemaVersion: 2 },
      optimizationForecast: { status: "ready", schemaVersion: 2 },
    });
    expect(broker.forecastTaskCount).toBe(2);
  });

  it("never reruns a cancelled assessment on GET and allows repeated explicit manual reruns", async () => {
    const ready = await createReadyProject();
    const monitored = await startOnePlatformMonitor(ready);
    const run = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...run,
      status: "completed",
      completedItems: 5,
      records: Array.from({ length: 5 }, (_, index) =>
        monitorRecord(index + 1, `Acme 回答 ${index + 1}`),
      ),
    });

    const first = await jsonRequest(
      `/projects/${encodeURIComponent(monitored.projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(first.response.status).toBe(201);
    expect(broker.assessmentTaskCount).toBe(1);
    broker.tasks.set("assessment-1", {
      id: "assessment-1",
      status: "cancelled",
      output: [],
    });

    const cancelledView = await jsonRequest(
      `/projects/${encodeURIComponent((first.body as any).projectToken)}`,
      ready.cookie,
    );

    expect(cancelledView.response.status).toBe(200);
    expect((cancelledView.body as any).project).toMatchObject({
      assessment: { status: "cancelled" },
      assessmentRetryAvailable: true,
    });
    expect(broker.assessmentTaskCount).toBe(1);

    const retried = await jsonRequest(
      `/projects/${encodeURIComponent((cancelledView.body as any).projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(retried.response.status).toBe(201);
    expect(broker.assessmentTaskCount).toBe(2);
    const retriedPayload = retried.body as Record<string, any>;
    const retriedValue = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<Record<string, unknown>>(
      retriedPayload.projectToken,
      "project",
    ).value;
    expect(retriedValue).toMatchObject({
      assessmentTaskId: "assessment-2",
      assessmentAttempt: 2,
      previousAssessmentTaskIds: ["assessment-1"],
    });

    broker.tasks.set("assessment-2", {
      id: "assessment-2",
      status: "cancelled",
      output: [],
    });
    const secondCancelledView = await jsonRequest(
      `/projects/${encodeURIComponent(retriedPayload.projectToken)}`,
      ready.cookie,
    );
    expect(secondCancelledView.response.status).toBe(200);
    expect((secondCancelledView.body as any).project).toMatchObject({
      assessment: { status: "cancelled" },
      assessmentRetryAvailable: true,
    });
    expect(broker.assessmentTaskCount).toBe(2);

    const retriedAgain = await jsonRequest(
      `/projects/${encodeURIComponent(retriedPayload.projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(retriedAgain.response.status).toBe(201);
    expect(broker.assessmentTaskCount).toBe(3);
    const retriedAgainValue = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<Record<string, unknown>>(
      (retriedAgain.body as any).projectToken,
      "project",
    ).value;
    expect(retriedAgainValue).toMatchObject({
      assessmentTaskId: "assessment-3",
      assessmentAttempt: 3,
      previousAssessmentTaskIds: ["assessment-1", "assessment-2"],
    });
  });

  it("renders noncanonical knowledge refs and replaces model source counts with canonical monitoring counts", async () => {
    const ready = await createReadyProject();
    const monitored = await startOnePlatformMonitor(ready);
    const run = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...run,
      status: "completed",
      completedItems: 5,
      records: Array.from({ length: 5 }, (_, index) =>
        monitorRecord(index + 1, `Acme 回答 ${index + 1}`),
      ),
    });

    const first = await jsonRequest(
      `/projects/${encodeURIComponent(monitored.projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(first.response.status).toBe(201);
    const invalidEvidenceOutput = validAssessmentOutput();
    invalidEvidenceOutput.knowledgeVsAnswers[0].kbEvidenceRefs = [
      "01_company_overview/nonexistent.md",
    ];
    invalidEvidenceOutput.platformBreakdown[0].sourceCount = 9_999;
    broker.tasks.set("assessment-1", {
      id: "assessment-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify(invalidEvidenceOutput) }],
        },
      ],
    });

    const completed = await jsonRequest(
      `/projects/${encodeURIComponent((first.body as any).projectToken)}`,
      ready.cookie,
    );
    expect(completed.response.status).toBe(200);
    expect((completed.body as any).project).toMatchObject({
      assessment: {
        status: "ready",
        platformBreakdown: [{ platform: "doubao", sourceCount: 2 }],
      },
      assessmentRetryAvailable: false,
    });
    expect(broker.assessmentTaskCount).toBe(1);
    expect(
      JSON.stringify((completed.body as any).project.assessment),
    ).not.toContain("nonexistent.md");
  });

  it("reuses a completed assessment with arbitrary internal evidence refs without rerunning", async () => {
    const ready = await createReadyProject();
    const monitored = await startOnePlatformMonitor(ready);
    const run = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...run,
      status: "completed",
      completedItems: 5,
      records: Array.from({ length: 5 }, (_, index) =>
        monitorRecord(index + 1, `Acme 回答 ${index + 1}`),
      ),
    });

    const first = await jsonRequest(
      `/projects/${encodeURIComponent(monitored.projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(first.response.status).toBe(201);
    const invalidEvidenceOutput = validAssessmentOutput();
    invalidEvidenceOutput.dimensions.semanticVisibility.aiSearchVisibility.evidenceRefs =
      ["invented/cross-task-evidence"];
    broker.tasks.set("assessment-1", {
      id: "assessment-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify(invalidEvidenceOutput) }],
        },
      ],
    });

    const reused = await jsonRequest(
      `/projects/${encodeURIComponent((first.body as any).projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );

    expect(reused.response.status).toBe(200);
    expect((reused.body as any).project).toMatchObject({
      assessment: { status: "ready" },
      assessmentRetryAvailable: false,
    });
    expect(broker.assessmentTaskCount).toBe(1);
    expect(
      JSON.stringify((reused.body as any).project.assessment),
    ).not.toContain("invented/cross-task-evidence");
  });

  it("creates one public optimization forecast only after assessment completes", async () => {
    const ready = await createReadyProject();
    const monitored = await startOnePlatformMonitor(ready);
    const run = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...run,
      status: "completed",
      completedItems: 5,
      records: Array.from({ length: 5 }, (_, index) =>
        monitorRecord(index + 1, `Acme 回答 ${index + 1}`),
      ),
    });

    const assessed = await jsonRequest(
      `/projects/${encodeURIComponent(monitored.projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(assessed.response.status).toBe(201);
    expect(broker.tasks.get("assessment-1")?.status).toBe("running");
    const assessedPayload = assessed.body as Record<string, any>;

    const tooEarly = await jsonRequest(
      `/projects/${encodeURIComponent(assessedPayload.projectToken)}/optimization-forecast`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(tooEarly.response.status).toBe(409);
    expect(tooEarly.body).toMatchObject({
      error: { code: "ASSESSMENT_NOT_READY" },
    });
    expect(broker.forecastTaskCount).toBe(0);

    broker.tasks.set("assessment-1", {
      id: "assessment-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify(validAssessmentOutput()) }],
        },
      ],
    });
    broker.completeForecastImmediately = true;
    const forecasted = await jsonRequest(
      `/projects/${encodeURIComponent(assessedPayload.projectToken)}/optimization-forecast`,
      ready.cookie,
      { method: "POST", body: {} },
    );

    expect(forecasted.response.status).toBe(201);
    const forecastedPayload = forecasted.body as Record<string, any>;
    expect(
      forecastedPayload.project.assessment.dimensions.competitive_advantage
        .summary,
    ).toBe("部分已验证差异点能够被回答准确表达。");
    expect(forecastedPayload.project.optimizationForecast).toMatchObject({
      status: "ready",
      horizonWeeks: 4,
      currentScore: 52.5,
      dimensions: expect.arrayContaining([
        expect.objectContaining({ id: "semantic_visibility" }),
        expect.objectContaining({ id: "semantic_coherence" }),
        expect.objectContaining({ id: "semantic_richness" }),
        expect.objectContaining({ id: "semantic_authority" }),
        expect.objectContaining({ id: "competitive_advantage" }),
      ]),
      assumptions: expect.any(Array),
      roadmap: expect.any(Array),
    });
    expect(
      forecastedPayload.project.optimizationForecast.dimensions.find(
        (dimension: Record<string, unknown>) =>
          dimension.id === "competitive_advantage",
      )?.summary,
    ).toBe("可核验差异点尚未形成稳定的统一表达。");
    expect(
      forecastedPayload.project.optimizationForecast.targetLow,
    ).toBeGreaterThan(
      forecastedPayload.project.optimizationForecast.currentScore,
    );
    expect(
      JSON.stringify(forecastedPayload.project.optimizationForecast),
    ).not.toContain("当前样本不支持");
    expect(forecastedPayload.project.optimizationForecast).not.toHaveProperty(
      "limitations",
    );
    expect(
      forecastedPayload.project.optimizationForecast.targetLow,
    ).toBeLessThanOrEqual(
      forecastedPayload.project.optimizationForecast.targetExpected,
    );
    expect(
      forecastedPayload.project.optimizationForecast.targetExpected,
    ).toBeLessThanOrEqual(
      forecastedPayload.project.optimizationForecast.targetHigh,
    );
    expect(forecastedPayload.project.optimizationForecast).not.toHaveProperty(
      "output",
    );
    expect(broker.forecastTaskCount).toBe(1);

    const attachments = broker.taskAttachments.at(-1)!;
    expect(attachments.map((attachment) => attachment.filename)).toEqual([
      "geo-optimization-outcome-forecaster.skill.zip",
      "optimization-forecast-output-template.json",
      "frontmind-optimization-forecast-task-input.json",
      "Acme_website_lead_knowledge_base.zip",
      "Acme-current-assessment.json",
      "frontmind-standard-one-month-scenario.json",
    ]);
    const assessmentAttachment = attachments.find((attachment) =>
      attachment.filename.endsWith("-current-assessment.json"),
    )!;
    const templateAttachment = attachments.find(
      (attachment) =>
        attachment.filename === "optimization-forecast-output-template.json",
    )!;
    const scenarioAttachment = attachments.find(
      (attachment) =>
        attachment.filename === "frontmind-standard-one-month-scenario.json",
    )!;
    expect(
      JSON.parse(
        broker.uploads.get(templateAttachment.file_id)!.toString("utf8"),
      ),
    ).toMatchObject({
      schemaVersion: 2,
      dimensions: {
        semanticAuthority: {
          structuredDataCompleteness: {
            gapClosureLow: null,
            effectType: "direct_asset",
          },
        },
      },
    });
    expect(broker.createdFileMimeTypes.get(templateAttachment.file_id)).toBe(
      "application/json",
    );
    expect(
      JSON.parse(
        broker.uploads.get(assessmentAttachment.file_id)!.toString("utf8"),
      ),
    ).toMatchObject({ assessment: { overview: { score: 52.5 } } });
    expect(
      JSON.parse(
        broker.uploads.get(scenarioAttachment.file_id)!.toString("utf8"),
      ),
    ).toMatchObject({
      name: "full_execution",
      horizonWeeks: 4,
      allowedActionIds: expect.arrayContaining(["GEO_A3_qa_assets"]),
    });
    expect(broker.prompts.at(-1)).toContain("始终使用 Base 模型");
    expect(broker.prompts.at(-1)).toContain("一个月（4 周）");
    expect(broker.prompts.at(-1)).toContain(
      "不得计算或返回分数、等级、分数增量",
    );

    const repeated = await jsonRequest(
      `/projects/${encodeURIComponent(forecastedPayload.projectToken)}/optimization-forecast`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(repeated.response.status).toBe(200);
    expect(repeated.body).toMatchObject({
      project: { optimizationForecast: { status: "ready" } },
    });
    expect(broker.forecastTaskCount).toBe(1);
  });

  it("replays one accepted forecast with identical assessment and scenario file ids after its response is lost", async () => {
    const ready = await createReadyProject();
    const monitored = await startOnePlatformMonitor(ready);
    const run = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...run,
      status: "completed",
      completedItems: 5,
      records: Array.from({ length: 5 }, (_, index) =>
        monitorRecord(index + 1, `Acme 回答 ${index + 1}`),
      ),
    });
    const assessed = await jsonRequest(
      `/projects/${encodeURIComponent(monitored.projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(assessed.response.status).toBe(201);
    broker.tasks.set("assessment-1", {
      id: "assessment-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify(validAssessmentOutput()) }],
        },
      ],
    });

    const createTask = broker.createTask.bind(broker);
    const submittedAttachments: Array<
      Array<{ file_id: string; filename: string }>
    > = [];
    let loseFirstForecastResponse = true;
    broker.createTask = async (input) => {
      if (
        !input.prompt.includes("geo-optimization-outcome-forecaster.skill.zip")
      ) {
        return createTask(input);
      }
      submittedAttachments.push(
        input.localAssets.map(({ localAssetId, filename }) => ({
          file_id: localAssetId,
          filename,
        })),
      );
      const task = await createTask(input);
      if (loseFirstForecastResponse) {
        loseFirstForecastResponse = false;
        throw new GeoBrokerError(
          "forecast committed before the response was lost",
          502,
          "AGENT_UNAVAILABLE",
        );
      }
      return task;
    };
    const evidenceKeyCountBefore = broker.fileCreateOperationKeys.filter(
      (key) => key.startsWith("geo-generated-task-evidence-file:"),
    ).length;
    const assessedPayload = assessed.body as Record<string, any>;
    const pathname = `/projects/${encodeURIComponent(assessedPayload.projectToken)}/optimization-forecast`;
    const ambiguous = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {},
    });
    expect(ambiguous.response.status).toBe(502);
    const replayed = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {},
    });

    expect(replayed.response.status).toBe(201);
    expect(broker.forecastTaskCount).toBe(1);
    expect(submittedAttachments).toHaveLength(2);
    expect(submittedAttachments[1]).toEqual(submittedAttachments[0]);
    const firstForecastAttachments = submittedAttachments[0]!;
    const secondForecastAttachments = submittedAttachments[1]!;
    for (const filename of [
      "Acme-current-assessment.json",
      "frontmind-standard-one-month-scenario.json",
    ]) {
      const fileId = firstForecastAttachments.find(
        (attachment) => attachment.filename === filename,
      )!.file_id;
      expect(
        secondForecastAttachments.find(
          (attachment) => attachment.filename === filename,
        )!.file_id,
      ).toBe(fileId);
      expect(broker.deletedFiles).not.toContain(fileId);
    }
    expect(
      broker.fileCreateOperationKeys.filter((key) =>
        key.startsWith("geo-generated-task-evidence-file:"),
      ).length - evidenceKeyCountBefore,
    ).toBe(4);
  });

  it("shows a safe partial forecast and creates a fresh task on explicit retry", async () => {
    const ready = await createReadyProject();
    const monitored = await startOnePlatformMonitor(ready);
    const run = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...run,
      status: "completed",
      completedItems: 5,
      records: Array.from({ length: 5 }, (_, index) =>
        monitorRecord(index + 1, `Acme 回答 ${index + 1}`),
      ),
    });
    broker.completeAssessmentImmediately = true;
    const assessed = await jsonRequest(
      `/projects/${encodeURIComponent(monitored.projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    const firstForecast = await jsonRequest(
      `/projects/${encodeURIComponent((assessed.body as any).projectToken)}/optimization-forecast`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(firstForecast.response.status).toBe(201);
    expect(broker.forecastTaskCount).toBe(1);
    const partialForecast = validForecastOutput() as Record<string, unknown>;
    delete partialForecast.dimensions;
    broker.tasks.set("forecast-1", {
      id: "forecast-1",
      status: "completed",
      output: [{ content: [{ text: JSON.stringify(partialForecast) }] }],
    });
    const viewed = await jsonRequest(
      `/projects/${encodeURIComponent((firstForecast.body as any).projectToken)}`,
      ready.cookie,
    );
    expect((viewed.body as any).project.optimizationForecast).toMatchObject({
      status: "ready",
      quality: {
        completeness: "partial",
        downstreamEligible: false,
      },
    });
    expect(
      (viewed.body as any).project.optimizationForecast.targetLow,
    ).toBeUndefined();
    expect((viewed.body as any).project.serviceActivation).toBeUndefined();
    expect(viewed.response.status).toBe(200);
    expect(broker.forecastTaskCount).toBe(1);
    expect(broker.repairCalls).toHaveLength(0);
    expect(
      (viewed.body as any).project.executionLog.currentEntryId,
    ).toBeUndefined();

    const retried = await jsonRequest(
      `/projects/${encodeURIComponent((viewed.body as any).projectToken)}/optimization-forecast`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(retried.response.status).toBe(201);
    expect((retried.body as any).project.optimizationForecast).toMatchObject({
      status: "running",
    });
    expect(broker.forecastTaskCount).toBe(2);
  });

  it("keeps one automatic retry and allows a later explicit manual forecast retry", async () => {
    const ready = await createServiceReadyProject();
    broker.tasks.set(ready.forecastTaskId, {
      id: ready.forecastTaskId,
      status: "cancelled",
      output: [],
    });

    const retried = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
    );

    expect(retried.response.status).toBe(200);
    expect(broker.forecastTaskCount).toBe(2);
    expect(broker.prompts.at(-1)).toContain("data.retryReason");
    const automaticRetryInputAttachment = broker.taskAttachments
      .at(-1)!
      .find((attachment) => attachment.filename.endsWith("-task-input.json"))!;
    expect(
      JSON.parse(
        broker.taskInputUploads
          .get(automaticRetryInputAttachment.file_id)!
          .toString("utf8"),
      ).data.retryReason,
    ).toContain("上一次优化效果评估任务已取消");
    const retriedPayload = retried.body as Record<string, any>;
    const retriedValue = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<Record<string, unknown>>(
      retriedPayload.projectToken,
      "project",
    ).value;
    expect(retriedValue).toMatchObject({
      optimizationForecastTaskId: "forecast-2",
      optimizationForecastAttempt: 2,
      previousOptimizationForecastTaskIds: [ready.forecastTaskId],
    });

    const replayed = await jsonRequest(
      `/projects/${encodeURIComponent(retriedPayload.projectToken)}/optimization-forecast`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(replayed.response.status).toBe(200);
    expect(broker.forecastTaskCount).toBe(2);
    broker.tasks.set("forecast-2", {
      id: "forecast-2",
      status: "cancelled",
      output: [],
    });
    const exhaustedView = await jsonRequest(
      `/projects/${encodeURIComponent(retriedPayload.projectToken)}`,
      ready.cookie,
    );
    expect(
      (exhaustedView.body as any).project.optimizationForecastRetryAvailable,
    ).toBe(true);
    expect(broker.forecastTaskCount).toBe(2);
    broker.completeForecastImmediately = false;
    const manuallyRetried = await jsonRequest(
      `/projects/${encodeURIComponent(retriedPayload.projectToken)}/optimization-forecast`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(manuallyRetried.response.status).toBe(201);
    expect(manuallyRetried.body).toMatchObject({
      project: { optimizationForecast: { status: "running" } },
    });
    expect(broker.forecastTaskCount).toBe(3);
    const manualValue = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<Record<string, unknown>>(
      (manuallyRetried.body as any).projectToken,
      "project",
    ).value;
    expect(manualValue).toMatchObject({
      optimizationForecastTaskId: "forecast-3",
      optimizationForecastAttempt: 3,
      previousOptimizationForecastTaskIds: [ready.forecastTaskId, "forecast-2"],
    });
  });

  it("caps repeated manual forecast retries before creating more files", async () => {
    const ready = await createServiceReadyProject();
    broker.tasks.set(ready.forecastTaskId, {
      id: ready.forecastTaskId,
      status: "cancelled",
      output: [],
    });
    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    const value = codec.open<Record<string, any>>(
      ready.projectToken,
      "project",
    ).value;
    const cappedToken = codec.seal(
      "project",
      {
        ...value,
        optimizationForecastAttempt: 5,
      },
      60 * 60 * 1000,
    );

    const view = await jsonRequest(
      `/projects/${encodeURIComponent(cappedToken)}`,
      ready.cookie,
    );
    expect(view.response.status).toBe(200);
    expect((view.body as any).project.optimizationForecastRetryAvailable).toBe(
      false,
    );

    const filesBeforeRetry = broker.createdFileIds.length;
    const rejected = await jsonRequest(
      `/projects/${encodeURIComponent(cappedToken)}/optimization-forecast`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(rejected.response.status).toBe(409);
    expect(rejected.body).toMatchObject({
      error: { code: "FORECAST_RETRY_EXHAUSTED" },
    });
    expect(broker.createdFileIds).toHaveLength(filesBeforeRetry);
  });

  it("keeps an unrecognized forecast task running without creating a duplicate", async () => {
    const ready = await createServiceReadyProject();
    broker.tasks.set(ready.forecastTaskId, {
      id: ready.forecastTaskId,
      status: "paused",
      output: [],
    });

    const current = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
    );
    expect(current.response.status).toBe(200);
    expect((current.body as any).project.optimizationForecast).toMatchObject({
      status: "running",
    });
    expect(
      (current.body as any).project.optimizationForecastRetryAvailable,
    ).toBe(false);

    const replayed = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/optimization-forecast`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(replayed.response.status).toBe(200);
    expect(broker.forecastTaskCount).toBe(1);
  });

  it("does not create a service payment before both assessment outputs are ready", async () => {
    const ready = await createReadyProject();
    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/services/payments`,
      ready.cookie,
      { method: "POST", body: { method: "alipay" } },
    );

    expect(checkout.response.status).toBe(409);
    expect(checkout.body).toMatchObject({
      error: { code: "SERVICE_ASSESSMENT_REQUIRED" },
    });
    expect(servicePaymentCheckoutCalls).toHaveLength(0);
  });

  it("reuses Dashboard-localized typed results across service validation and project rendering", async () => {
    const ready = await createServiceReadyProject();
    const assessmentFileId = "service-assessment-output-json";
    const forecastFileId = "service-forecast-output-json";
    broker.downloadOverrides.set(
      assessmentFileId,
      Buffer.from(
        JSON.stringify(validAssessmentOutput(ready.question)),
        "utf8",
      ),
    );
    broker.downloadOverrides.set(
      forecastFileId,
      Buffer.from(JSON.stringify(validForecastOutput()), "utf8"),
    );
    broker.tasks.set(ready.assessmentTaskId, {
      id: ready.assessmentTaskId,
      status: "completed",
      output: [
        { type: "output_text", text: "现状评估结果见附件。" },
        {
          type: "output_file",
          file_id: assessmentFileId,
          filename: "current-assessment.json",
          mime_type: "application/json",
        },
      ],
    });
    broker.tasks.set(ready.forecastTaskId, {
      id: ready.forecastTaskId,
      status: "completed",
      output: [
        { type: "output_text", text: "优化效果评估结果见附件。" },
        {
          type: "output_file",
          file_id: forecastFileId,
          filename: "optimization-forecast.json",
          mime_type: "application/json",
        },
      ],
    });
    broker.downloadedFileIds = [];

    const created = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/services/contracts`,
      ready.cookie,
      {
        method: "POST",
        body: {
          profile: validServiceContractProfile(),
          contractCode: CONTRACT_AUTH_CODE,
        },
      },
    );

    expect(created.response.status).toBe(201);
    expect(
      broker.downloadedFileIds.filter((fileId) => fileId === assessmentFileId),
    ).toHaveLength(0);
    expect(
      broker.downloadedFileIds.filter((fileId) => fileId === forecastFileId),
    ).toHaveLength(0);
  });

  it("rejects a forged payable status that has no contract evidence", async () => {
    const ready = await createServiceReadyProject();
    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    const value = codec.open<Record<string, any>>(
      ready.projectToken,
      "project",
    ).value;
    const forgedToken = codec.seal(
      "project",
      {
        ...value,
        serviceQuestionId: ready.question.id,
        serviceCategory: ready.question.category,
        serviceAmountFen: 150_000,
        serviceManualOrderReference: "forged-payable-order",
        serviceManualOrderStatus: "payment_required",
      },
      60 * 60 * 1000,
    );

    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(forgedToken)}/services/payments`,
      ready.cookie,
      { method: "POST", body: { method: "alipay" } },
    );

    expect(checkout.response.status).toBe(409);
    expect(checkout.body).toMatchObject({
      error: { code: "SERVICE_CONTRACT_EVIDENCE_REQUIRED" },
    });
    expect(servicePaymentCheckoutCalls).toHaveLength(0);
  });

  it("validates the contract code, creates one order, and advances it to payment", async () => {
    const ready = await createServiceReadyProject();
    const profile = validServiceContractProfile("深圳星辰科技有限公司");
    const created = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/services/contracts`,
      ready.cookie,
      { method: "POST", body: { profile, contractCode: CONTRACT_AUTH_CODE } },
    );

    expect(created.response.status).toBe(201);
    expect(manualOrderCreateCalls).toHaveLength(1);
    expect(manualOrderExternalAuthorizationCalls).toHaveLength(1);
    expect(manualOrderCreateCalls[0]).toMatchObject({
      marketEdition: "domestic",
      project: { companyName: "深圳星辰科技有限公司" },
      contract: {
        templateVersion: "basic-domestic-2026.08-v1",
        profile,
      },
    });
    expect(adminNotificationCalls).toEqual([
      {
        schemaVersion: 1,
        event: "manual_order_submitted",
        eventId: "geo-manual:manual-order-reference-001:submitted-v1",
        orderReference: "manual-order-reference-001",
        projectId: expect.any(String),
        companyName: "深圳星辰科技有限公司",
        serviceCategory: "product_scenario",
        amountFen: 150_000,
        submittedAt: "2026-07-22T10:12:00.000Z",
      },
    ]);
    for (const value of [
      created.body,
      adminNotificationCalls,
      manualOrderExternalAuthorizationCalls,
    ]) {
      expect(JSON.stringify(value)).not.toContain(CONTRACT_AUTH_CODE);
    }
    expect(JSON.stringify(adminNotificationCalls)).not.toMatch(
      /13800138000|contracts@example\.com|91440300MA5F12345X|科技园一号/,
    );
    expect(created.body).toMatchObject({
      project: {
        companyName: "深圳星辰科技有限公司",
        serviceActivation: {
          status: "payment_required",
          contractWorkflowReference: "manual-order-reference-001",
          manualOrderStatus: "payment_required",
          contractAuthorizationMode: "external_wechat",
        },
      },
    });
    const forgedStatus = await jsonRequest(
      `/projects/${encodeURIComponent((created.body as any).projectToken)}/services/contracts/status`,
      ready.cookie,
      {
        method: "POST",
        body: { status: "payment_required", paidAt: new Date().toISOString() },
      },
    );
    expect(forgedStatus.response.status).toBe(400);
    expect(manualOrderStatusReads).toHaveLength(0);

    const replayed = await jsonRequest(
      `/projects/${encodeURIComponent((created.body as any).projectToken)}/services/contracts`,
      ready.cookie,
      { method: "POST", body: { profile, contractCode: CONTRACT_AUTH_CODE } },
    );
    expect(replayed.response.status).toBe(200);
    expect(manualOrderCreateCalls).toHaveLength(1);
    expect(manualOrderStatusReads).toEqual(["manual-order-reference-001"]);
    expect(adminNotificationCalls).toHaveLength(1);

    const decoded = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<Record<string, unknown>>(
      (replayed.body as any).projectToken,
      "project",
    ).value;
    expect(decoded.companyName).toBe("深圳星辰科技有限公司");
    expect(JSON.stringify(decoded)).not.toContain(CONTRACT_AUTH_CODE);
    expect(JSON.stringify(decoded)).not.toMatch(
      /13800138000|contracts@example\.com|91440300MA5F12345X|科技园一号/,
    );

    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent((replayed.body as any).projectToken)}/services/payments`,
      ready.cookie,
      { method: "POST", body: { method: "alipay" } },
    );
    expect(checkout.response.status).toBe(201);
    expect(servicePaymentCheckoutCalls).toHaveLength(1);
  });

  it("carries the overseas contract, double price, and account edition through activation", async () => {
    const ready = await createServiceReadyProject(
      "product-scenario-01",
      "overseas",
    );
    expect(ready.project).toMatchObject({
      monitoringEdition: "overseas",
      serviceActivation: {
        status: "not_started",
        amountFen: 300_000,
      },
    });
    expect(ready.project.assessment.summary).toMatch(/[\u3400-\u9fff]/u);
    expect(ready.project.optimizationForecast.summary).toMatch(
      /[\u3400-\u9fff]/u,
    );

    const payable = await advanceManualOrder(ready);
    expect(manualOrderCreateCalls).toHaveLength(1);
    expect(manualOrderCreateCalls[0]).toMatchObject({
      marketEdition: "overseas",
      service: {
        purchasedQuestion: {
          id: "product-scenario-01",
          category: "product_scenario",
        },
      },
      contract: { templateVersion: "basic-overseas-2026.08-v1" },
    });
    expect(manualOrderResponse.order).toMatchObject({
      marketEdition: "overseas",
      amountFen: 300_000,
    });
    expect(adminNotificationCalls[0]).toMatchObject({ amountFen: 300_000 });

    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments`,
      payable.cookie,
      { method: "POST", body: { method: "alipay" } },
    );
    expect(checkout.response.status).toBe(201);
    expect(checkout.body).toMatchObject({
      payment: {
        monitoringEdition: "overseas",
        amountFen: 300_000,
        unitPriceFen: 300_000,
        fields: { money: "3000.00" },
      },
    });
    expect(servicePaymentCheckoutCalls[0]).toMatchObject({
      monitoringEdition: "overseas",
      expectedAmountFen: 300_000,
    });

    const started = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/start`,
      payable.cookie,
      {
        method: "POST",
        body: {
          authorization: (checkout.body as any).payment.authorization,
        },
      },
    );
    expect(started.response.status).toBe(201);
    expect(started.body).toMatchObject({
      project: {
        monitoringEdition: "overseas",
        serviceActivation: {
          status: "account_setup_required",
          amountFen: 300_000,
        },
      },
    });

    const activated = await jsonRequest(
      `/projects/${encodeURIComponent((started.body as any).projectToken)}/services/account`,
      payable.cookie,
      {
        method: "POST",
        body: {
          displayName: "Acme",
          username: "acme.overseas",
          password: "StrongPassword123",
        },
      },
    );
    expect(activated.response.status).toBe(201);
    expect(activated.body).toMatchObject({
      project: {
        monitoringEdition: "overseas",
        serviceActivation: {
          status: "active",
          amountFen: 300_000,
          accountUsername: "acme.overseas",
        },
      },
    });
    expect(manualOrderAccountCalls).toHaveLength(1);
    expect(purchaseProvisionCalls).toHaveLength(0);
  });

  it("switches an overseas service checkout with server-derived scope and stable order facts", async () => {
    const ready = await createServiceReadyProject("reputation-01", "overseas");
    const payable = await advanceManualOrder(ready);
    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments`,
      payable.cookie,
      { method: "POST", body: { method: "alipay" } },
    );
    paymentAccepted = false;
    const original = (checkout.body as any).payment;

    const switched = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments/switch`,
      payable.cookie,
      {
        method: "POST",
        body: { authorization: original.authorization, method: "wxpay" },
      },
    );

    expect(switched.response.status).toBe(200);
    expect(switched.body).toMatchObject({
      payment: {
        authorization: original.authorization,
        orderId: original.orderId,
        amountFen: 400_000,
        expiresAt: original.expiresAt,
        monitoringEdition: "overseas",
        fields: {
          type: "wxpay",
          param: original.authorization,
          out_trade_no: original.orderId,
        },
      },
    });
    expect(servicePaymentSwitchCalls).toHaveLength(1);
    expect(servicePaymentSwitchCalls[0]).toMatchObject({
      questionId: "reputation-01",
      category: "reputation",
      monitoringEdition: "overseas",
      expectedAmountFen: 400_000,
      method: "wxpay",
    });

    const forged = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments/switch`,
      payable.cookie,
      {
        method: "POST",
        body: {
          authorization: original.authorization,
          method: "alipay",
          amountFen: 1,
        },
      },
    );
    expect(forged.response.status).toBe(400);
    expect(servicePaymentSwitchCalls).toHaveLength(1);
  });

  it("confirms an overseas direct bank transfer once and never exposes its confirmation code", async () => {
    const ready = await createServiceReadyProject("reputation-01", "overseas");
    const payable = await advanceManualOrder(ready);
    const pathname = `/projects/${encodeURIComponent(payable.projectToken)}/services/payments/bank-transfer/confirm`;

    const confirmed = await jsonRequest(pathname, payable.cookie, {
      method: "POST",
      body: { confirmationCode: BANK_TRANSFER_CONFIRMATION_CODE },
    });

    expect(confirmed.response.status).toBe(201);
    expect(confirmed.body).toMatchObject({
      project: {
        monitoringEdition: "overseas",
        serviceActivation: {
          status: "account_setup_required",
          amountFen: 400_000,
          orderId: expect.stringMatching(/^\d{32}$/),
        },
      },
    });
    expect(serviceBankTransferCalls).toHaveLength(1);
    expect(serviceBankTransferCalls[0]).toMatchObject({
      orderId: expect.stringMatching(/^\d{32}$/),
      monitoringEdition: "overseas",
      category: "reputation",
      expectedAmountFen: 400_000,
    });
    expect(serviceBankTransferCalls[0]).not.toHaveProperty("authorization");
    expect(manualOrderPaymentCalls).toHaveLength(1);
    expect(manualOrderPaymentCalls[0].request.payment).toMatchObject({
      orderId: serviceBankTransferCalls[0].orderId,
      tradeNo: expect.stringMatching(/^bank:/),
      amountFen: 400_000,
    });
    expect(JSON.stringify(confirmed.body)).not.toContain(
      BANK_TRANSFER_CONFIRMATION_CODE,
    );

    const replayed = await jsonRequest(pathname, payable.cookie, {
      method: "POST",
      body: { confirmationCode: BANK_TRANSFER_CONFIRMATION_CODE },
    });
    expect(replayed.response.status).toBe(200);
    expect((replayed.body as any).project.serviceActivation.orderId).toBe(
      (confirmed.body as any).project.serviceActivation.orderId,
    );
    expect(serviceBankTransferCalls).toHaveLength(1);
    expect(manualOrderPaymentCalls).toHaveLength(1);

    const decoded = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<Record<string, unknown>>(
      (confirmed.body as any).projectToken,
      "project",
    ).value;
    expect(JSON.stringify(decoded)).not.toContain(
      BANK_TRANSFER_CONFIRMATION_CODE,
    );
  });

  it("persists a direct-bank pending order before the receipt and recovers after finalization is lost", async () => {
    const ready = await createServiceReadyProject();
    const payable = await advanceManualOrder(ready);
    const bankPath = `/projects/${encodeURIComponent(payable.projectToken)}/services/payments/bank-transfer/confirm`;
    let persistedReceipt:
      | {
          orderId: string;
          tradeNo: string;
          amountFen: number;
          paidAt: string;
        }
      | undefined;
    paymentGateway.confirmServiceBankTransfer = async (input) => {
      serviceBankTransferCalls.push(input);
      expect(projectOrders.get(input.orderId)).toMatchObject({
        orderId: input.orderId,
        purchaseType: "service",
        amountFen: input.expectedAmountFen,
        state: "pending",
      });
      expect(projectOrders.get(input.orderId)).not.toHaveProperty("paidAt");
      persistedReceipt ??= {
        orderId: input.orderId,
        tradeNo: `bank:${createHash("sha256")
          .update(input.orderId)
          .digest("hex")
          .slice(0, 48)}`,
        amountFen: input.expectedAmountFen,
        paidAt: servicePaymentPaidAt,
      };
      return persistedReceipt;
    };
    const originalUpsert = projectOrderRegistry.upsert;
    let loseFirstPaidTransition = true;
    projectOrderRegistry.upsert = async (order) => {
      if (
        loseFirstPaidTransition &&
        order.purchaseType === "service" &&
        /^\d{32}$/.test(order.orderId) &&
        order.state === "paid"
      ) {
        loseFirstPaidTransition = false;
        throw new Error("simulated crash after durable bank receipt");
      }
      return originalUpsert(order);
    };

    const interrupted = await jsonRequest(bankPath, payable.cookie, {
      method: "POST",
      body: { confirmationCode: BANK_TRANSFER_CONFIRMATION_CODE },
    });

    expect(interrupted.response.status).toBe(503);
    expect(interrupted.body).toMatchObject({
      error: { code: "PROJECT_ORDER_REGISTRY_UNAVAILABLE" },
    });
    expect(persistedReceipt).toBeDefined();
    expect(serviceBankTransferCalls).toHaveLength(1);
    expect(manualOrderPaymentCalls).toHaveLength(0);
    const pendingOrder = Array.from(projectOrders.values()).find(
      (order) => order.orderId === persistedReceipt!.orderId,
    );
    expect(pendingOrder).toMatchObject({
      orderId: expect.stringMatching(/^\d{32}$/),
      purchaseType: "service",
      amountFen: 150_000,
      authorizationDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      state: "pending",
      checkoutExpiresAt: expect.any(String),
      eventAt: expect.any(String),
    });
    expect(pendingOrder).not.toHaveProperty("paidAt");

    const onlineCheckout = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments`,
      payable.cookie,
      { method: "POST", body: { method: "alipay" } },
    );
    expect(onlineCheckout.response.status).toBe(409);
    expect(onlineCheckout.body).toMatchObject({
      error: { code: "PROJECT_ORDER_DELETE_BLOCKED" },
    });
    expect(servicePaymentCheckoutCalls).toHaveLength(0);

    const recovered = await jsonRequest(bankPath, payable.cookie, {
      method: "POST",
      body: { confirmationCode: BANK_TRANSFER_CONFIRMATION_CODE },
    });
    expect(recovered.response.status).toBe(201);
    expect(recovered.body).toMatchObject({
      project: {
        serviceActivation: {
          orderId: pendingOrder!.orderId,
          amountFen: 150_000,
          status: "account_setup_required",
        },
      },
    });
    expect(serviceBankTransferCalls).toHaveLength(2);
    expect(serviceBankTransferCalls[1].orderId).toBe(
      serviceBankTransferCalls[0].orderId,
    );
    expect(manualOrderPaymentCalls).toHaveLength(1);
    expect(projectOrders.get(pendingOrder!.orderId)).toMatchObject({
      authorizationDigest: pendingOrder!.authorizationDigest,
      checkoutExpiresAt: pendingOrder!.checkoutExpiresAt,
      state: "fulfilling",
      paidAt: servicePaymentPaidAt,
    });
  });

  it("reuses a pending online order for bank transfer and prevents later checkout switching", async () => {
    const ready = await createServiceReadyProject();
    const payable = await advanceManualOrder(ready);
    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments`,
      payable.cookie,
      { method: "POST", body: { method: "alipay" } },
    );
    const payment = (checkout.body as any).payment;
    paymentAccepted = false;

    const confirmed = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments/bank-transfer/confirm`,
      payable.cookie,
      {
        method: "POST",
        body: {
          confirmationCode: BANK_TRANSFER_CONFIRMATION_CODE,
          authorization: payment.authorization,
        },
      },
    );

    expect(confirmed.response.status).toBe(201);
    expect((confirmed.body as any).project.serviceActivation.orderId).toBe(
      payment.orderId,
    );
    expect(serviceBankTransferCalls).toHaveLength(1);
    expect(serviceBankTransferCalls[0]).toMatchObject({
      authorization: payment.authorization,
      orderId: payment.orderId,
      expectedAmountFen: 150_000,
    });

    const lateSwitch = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments/switch`,
      payable.cookie,
      {
        method: "POST",
        body: { authorization: payment.authorization, method: "wxpay" },
      },
    );
    expect(lateSwitch.response.status).toBe(409);
    expect(lateSwitch.body).toMatchObject({
      error: { code: "PAYMENT_ALREADY_CONFIRMED" },
    });
    expect(servicePaymentSwitchCalls).toHaveLength(0);
  });

  it("rejects bank confirmation when the online service order is already paid", async () => {
    const ready = await createServiceReadyProject();
    const payable = await advanceManualOrder(ready);
    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments`,
      payable.cookie,
      { method: "POST", body: { method: "alipay" } },
    );
    const payment = (checkout.body as any).payment;

    const rejected = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments/bank-transfer/confirm`,
      payable.cookie,
      {
        method: "POST",
        body: {
          confirmationCode: BANK_TRANSFER_CONFIRMATION_CODE,
          authorization: payment.authorization,
        },
      },
    );

    expect(rejected.response.status).toBe(409);
    expect(rejected.body).toMatchObject({
      error: { code: "PAYMENT_ALREADY_CONFIRMED" },
    });
    expect(serviceBankTransferCalls).toHaveLength(1);
    expect(manualOrderPaymentCalls).toHaveLength(0);
  });

  it("never returns a switched checkout while bank confirmation owns the service scope", async () => {
    const ready = await createServiceReadyProject();
    const payable = await advanceManualOrder(ready);
    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments`,
      payable.cookie,
      { method: "POST", body: { method: "alipay" } },
    );
    const payment = (checkout.body as any).payment;
    paymentAccepted = false;

    let bankStartedResolve!: () => void;
    const bankStarted = new Promise<void>((resolve) => {
      bankStartedResolve = resolve;
    });
    let bankReceiptResolve!: (receipt: {
      orderId: string;
      tradeNo: string;
      amountFen: number;
      paidAt: string;
    }) => void;
    const bankReceipt = new Promise<{
      orderId: string;
      tradeNo: string;
      amountFen: number;
      paidAt: string;
    }>((resolve) => {
      bankReceiptResolve = resolve;
    });
    paymentGateway.confirmServiceBankTransfer = async (input) => {
      serviceBankTransferCalls.push(input);
      bankStartedResolve();
      return bankReceipt;
    };

    const bankConfirmation = jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments/bank-transfer/confirm`,
      payable.cookie,
      {
        method: "POST",
        body: {
          confirmationCode: BANK_TRANSFER_CONFIRMATION_CODE,
          authorization: payment.authorization,
        },
      },
    );
    await bankStarted;

    const switchAttempt = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments/switch`,
      payable.cookie,
      {
        method: "POST",
        body: { authorization: payment.authorization, method: "wxpay" },
      },
    );
    expect(switchAttempt.response.status).toBe(409);
    expect(switchAttempt.body).toMatchObject({
      error: { code: "SERVICE_PAYMENT_MUTATION_IN_PROGRESS" },
    });
    expect(servicePaymentSwitchCalls).toHaveLength(0);

    bankReceiptResolve({
      orderId: payment.orderId,
      tradeNo: `bank:${"a".repeat(48)}`,
      amountFen: 150_000,
      paidAt: servicePaymentPaidAt,
    });
    const confirmed = await bankConfirmation;
    expect(confirmed.response.status).toBe(201);
    expect((confirmed.body as any).project.serviceActivation.orderId).toBe(
      payment.orderId,
    );
  });

  it("rate-limits bank confirmation code failures and accepts no browser payment facts", async () => {
    const ready = await createServiceReadyProject();
    const payable = await advanceManualOrder(ready);
    const pathname = `/projects/${encodeURIComponent(payable.projectToken)}/services/payments/bank-transfer/confirm`;
    const forgedFacts = await jsonRequest(pathname, payable.cookie, {
      method: "POST",
      body: {
        confirmationCode: "wrong-code",
        amountFen: 1,
        paidAt: new Date().toISOString(),
        status: "paid",
      },
    });
    expect(forgedFacts.response.status).toBe(400);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const rejected = await jsonRequest(pathname, payable.cookie, {
        method: "POST",
        body: { confirmationCode: "wrong-code" },
      });
      expect(rejected.response.status).toBe(403);
      expect(rejected.body).toMatchObject({
        error: { code: "BANK_TRANSFER_CODE_INVALID" },
      });
    }
    const limited = await jsonRequest(pathname, payable.cookie, {
      method: "POST",
      body: { confirmationCode: BANK_TRANSFER_CONFIRMATION_CODE },
    });
    expect(limited.response.status).toBe(429);
    expect(limited.response.headers.get("retry-after")).toBeTruthy();
    expect(limited.body).toMatchObject({
      error: { code: "BANK_TRANSFER_CODE_RATE_LIMITED" },
    });
    expect(serviceBankTransferCalls).toHaveLength(0);
    expect(manualOrderPaymentCalls).toHaveLength(0);
    expect(JSON.stringify(limited.body)).not.toContain(
      BANK_TRANSFER_CONFIRMATION_CODE,
    );
  });

  it("binds an existing account after a direct bank confirmation without sealing the purchase intent", async () => {
    const ready = await createServiceReadyProject();
    const payable = await advanceManualOrder(ready);
    const purchaseIntent = "one-time-existing-account-intent-001";
    const confirmed = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments/bank-transfer/confirm`,
      payable.cookie,
      {
        method: "POST",
        body: {
          confirmationCode: BANK_TRANSFER_CONFIRMATION_CODE,
          purchaseIntent,
        },
      },
    );

    expect(confirmed.response.status).toBe(201);
    expect(confirmed.body).toMatchObject({
      project: {
        serviceActivation: {
          status: "active",
          accountMode: "bind_existing",
          accountUsername: "existing.user",
        },
      },
    });
    expect(manualOrderAccountCalls).toEqual([
      {
        reference: "manual-order-reference-001",
        request: {
          schemaVersion: 1,
          account: { mode: "bind_existing", purchaseIntent },
        },
      },
    ]);
    const decoded = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<Record<string, unknown>>(
      (confirmed.body as any).projectToken,
      "project",
    ).value;
    expect(JSON.stringify(decoded)).not.toContain(purchaseIntent);
  });

  it("clears legacy electronic-signing fields when a historical order is authorized in WeChat", async () => {
    const ready = await createServiceReadyProject();
    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    const stored = codec.open<Record<string, any>>(
      ready.projectToken,
      "project",
    ).value;
    const historicalToken = codec.seal(
      "project",
      {
        ...stored,
        serviceManualOrderReference: "manual-order-reference-001",
        serviceManualOrderStatus: "signature_required",
        serviceManualContractId: "legacy-electronic-contract",
        serviceManualSigningUrl: "https://sign.example.com/legacy-contract",
        serviceManualSignedAt: "2026-07-22T10:10:00.000Z",
      },
      60 * 60 * 1000,
    );
    manualOrderResponse = {
      ...manualOrderResponse,
      order: {
        ...manualOrderResponse.order,
        projectId: stored.projectId,
        status: "signature_required",
        contractId: "legacy-electronic-contract",
        signingUrl: "https://sign.example.com/legacy-contract",
        signedAt: "2026-07-22T10:10:00.000Z",
      },
    };

    const result = await jsonRequest(
      `/projects/${encodeURIComponent(historicalToken)}/services/contracts`,
      ready.cookie,
      {
        method: "POST",
        body: {
          profile: validServiceContractProfile(),
          contractCode: CONTRACT_AUTH_CODE,
        },
      },
    );
    expect(result.response.status).toBe(200);
    const activation = (result.body as any).project.serviceActivation;
    expect(activation).toMatchObject({
      status: "payment_required",
      manualOrderStatus: "payment_required",
      contractAuthorizationMode: "external_wechat",
    });
    expect(activation).not.toHaveProperty("contractId");
    expect(activation).not.toHaveProperty("signingUrl");
    expect(activation).not.toHaveProperty("signedAt");
    const refreshed = codec.open<Record<string, unknown>>(
      (result.body as any).projectToken,
      "project",
    ).value;
    expect(refreshed).not.toHaveProperty("serviceManualContractId");
    expect(refreshed).not.toHaveProperty("serviceManualSigningUrl");
    expect(refreshed).not.toHaveProperty("serviceManualSignedAt");
  });

  it("rejects an invalid contract code before creating an order", async () => {
    const ready = await createServiceReadyProject();
    const result = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/services/contracts`,
      ready.cookie,
      {
        method: "POST",
        body: {
          profile: validServiceContractProfile(),
          contractCode: "incorrect-contract-code",
        },
      },
    );
    expect(result.response.status).toBe(403);
    expect(result.body).toEqual({
      ok: false,
      error: {
        code: "CONTRACT_CODE_INVALID",
        message: "合同码不正确，请联系管理员确认",
      },
    });
    expect(manualOrderCreateCalls).toHaveLength(0);
    expect(manualOrderExternalAuthorizationCalls).toHaveLength(0);
    expect(JSON.stringify(result.body)).not.toContain(
      "incorrect-contract-code",
    );
  });

  it("limits five failed contract codes for one session and project without blocking another", async () => {
    const limited = await createServiceReadyProject();
    const isolated = await createServiceReadyProject();
    const request = (projectToken: string, cookie: string) =>
      jsonRequest(
        `/projects/${encodeURIComponent(projectToken)}/services/contracts`,
        cookie,
        {
          method: "POST",
          body: {
            profile: validServiceContractProfile(),
            contractCode: "incorrect-contract-code",
          },
        },
      );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await request(limited.projectToken, limited.cookie);
      expect(failed.response.status).toBe(403);
    }
    const throttled = await request(limited.projectToken, limited.cookie);
    expect(throttled.response.status).toBe(429);
    expect(
      Number(throttled.response.headers.get("retry-after")),
    ).toBeGreaterThan(0);
    expect(
      Number(throttled.response.headers.get("retry-after")),
    ).toBeLessThanOrEqual(15 * 60);

    const isolatedFailure = await request(
      isolated.projectToken,
      isolated.cookie,
    );
    expect(isolatedFailure.response.status).toBe(403);
    expect(manualOrderCreateCalls).toHaveLength(0);
  });

  it.each([
    ["仍为待管理员状态", { status: "pending_admin" as const }],
    ["仍为待签署状态", { status: "signature_required" as const }],
    ["缺少授权方式", { contractAuthorizationMode: undefined }],
    ["缺少授权时间", { contractAuthorizedAt: undefined }],
    ["授权时间无效", { contractAuthorizedAt: "not-a-date" }],
  ])(
    "fails closed when Dashboard contract confirmation %s",
    async (_label, override) => {
      const ready = await createServiceReadyProject();
      manualOrderExternalAuthorizationOverride = override;
      const result = await jsonRequest(
        `/projects/${encodeURIComponent(ready.projectToken)}/services/contracts`,
        ready.cookie,
        {
          method: "POST",
          body: {
            profile: validServiceContractProfile(),
            contractCode: CONTRACT_AUTH_CODE,
          },
        },
      );
      expect(result.response.status).toBe(502);
      expect(result.body).toMatchObject({
        ok: false,
        error: { code: "MANUAL_ORDER_EXTERNAL_CONTRACT_INCOMPLETE" },
      });
      expect(result.body).not.toHaveProperty("projectToken");
      expect(adminNotificationCalls).toHaveLength(0);
    },
  );

  it("does not block an order when the administrator alert fails and retries it idempotently", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      adminNotificationShouldFail = true;
      const ready = await createServiceReadyProject();
      const profile = validServiceContractProfile();
      const created = await jsonRequest(
        `/projects/${encodeURIComponent(ready.projectToken)}/services/contracts`,
        ready.cookie,
        {
          method: "POST",
          body: { profile, contractCode: CONTRACT_AUTH_CODE },
        },
      );

      expect(created.response.status).toBe(201);
      expect(adminNotificationCalls).toHaveLength(1);
      expect(warn).toHaveBeenCalledWith(
        "[GEO admin notification] Delivery failed for geo-manual:manual-order-reference-001:submitted-v1",
      );

      adminNotificationShouldFail = false;
      const retried = await jsonRequest(
        `/projects/${encodeURIComponent((created.body as any).projectToken)}/services/contracts`,
        ready.cookie,
        {
          method: "POST",
          body: { profile, contractCode: CONTRACT_AUTH_CODE },
        },
      );

      expect(retried.response.status).toBe(200);
      expect(adminNotificationCalls).toHaveLength(2);
      expect(adminNotificationCalls[1].eventId).toBe(
        adminNotificationCalls[0].eventId,
      );
      const decoded = new GeoTokenCodec(
        "test-session-secret-at-least-16-characters",
      ).open<Record<string, unknown>>(
        (retried.body as any).projectToken,
        "project",
      ).value;
      expect(decoded.serviceAdminNotificationDeliveredAt).toEqual(
        expect.any(String),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it.each([
    ["product-scenario-01", "product_scenario", 150_000],
    ["reputation-01", "reputation", 200_000],
    ["competitor-comparison-01", "competitor_comparison", 200_000],
  ] as const)(
    "derives the %s monthly service price on the server",
    async (questionId, category, expectedAmountFen) => {
      const ready = await createServiceReadyProject(questionId);
      expect(ready.project.serviceActivation).toMatchObject({
        status: "not_started",
        questionId,
        category,
        amountFen: expectedAmountFen,
        billingMonths: 1,
      });
      if (category === "reputation") {
        expect(ready.project.assessment).toMatchObject({
          totalScore: 52.5,
          schemaVersion: 2,
        });
        expect(ready.project.optimizationForecast).toMatchObject({
          currentScore: 52.5,
          schemaVersion: 2,
        });
        expect(ready.project.optimizationForecast).not.toHaveProperty(
          "rawCurrentScore",
        );
        expect(ready.project.optimizationForecast).not.toHaveProperty(
          "scoreBasis",
        );
        const competitiveForecast =
          ready.project.optimizationForecast.dimensions.find(
            (dimension: Record<string, unknown>) =>
              dimension.id === "competitive_advantage",
          );
        expect(competitiveForecast.targetLow).toBeGreaterThan(
          competitiveForecast.currentScore,
        );
        expect(competitiveForecast.targetHigh).toBeGreaterThan(
          competitiveForecast.targetLow,
        );
      }
      const payable = await advanceManualOrder(ready);

      const checkout = await jsonRequest(
        `/projects/${encodeURIComponent(payable.projectToken)}/services/payments`,
        payable.cookie,
        {
          method: "POST",
          body: { method: "alipay" },
        },
      );

      expect(checkout.response.status).toBe(201);
      expect(checkout.body).toMatchObject({
        payment: {
          purchaseType: "service",
          questionId,
          category,
          amountFen: expectedAmountFen,
          unitPriceFen: expectedAmountFen,
          billingMonths: 1,
          fields: {
            type: "alipay",
            money: (expectedAmountFen / 100).toFixed(2),
          },
        },
      });
      expect(servicePaymentCheckoutCalls).toHaveLength(1);
      expect(servicePaymentCheckoutCalls[0]).toMatchObject({
        projectId: expect.any(String),
        ownerSessionId: expect.any(String),
        questionId,
        category,
        expectedAmountFen,
        method: "alipay",
      });
    },
  );

  it("locks one signed service cycle to one order and confirms payment idempotently", async () => {
    const ready = await createServiceReadyProject();
    const payable = await advanceManualOrder(ready);
    const pathname = `/projects/${encodeURIComponent(payable.projectToken)}/services/payments`;
    const created = await jsonRequest(pathname, payable.cookie, {
      method: "POST",
      body: { method: "alipay" },
    });
    const replayed = await jsonRequest(pathname, payable.cookie, {
      method: "POST",
      body: { method: "alipay" },
    });
    const switchedMethod = await jsonRequest(pathname, payable.cookie, {
      method: "POST",
      body: { method: "wxpay" },
    });

    expect(created.response.status).toBe(201);
    expect(replayed.response.status).toBe(200);
    expect((replayed.body as any).payment.orderId).toBe(
      (created.body as any).payment.orderId,
    );
    expect(switchedMethod.response.status).toBe(409);
    expect(switchedMethod.body).toMatchObject({
      error: { code: "SERVICE_PAYMENT_METHOD_LOCKED" },
    });
    expect(servicePaymentCheckoutCalls).toHaveLength(1);

    const authorization = (created.body as any).payment.authorization as string;
    paymentAccepted = false;
    const pending = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments/status`,
      payable.cookie,
      {
        method: "POST",
        body: { authorization },
      },
    );
    expect(pending.response.status).toBe(200);
    expect(pending.body).toMatchObject({
      payment: {
        status: "pending",
        amountFen: 150_000,
      },
    });
    expect(servicePaymentStatusCalls[0]).toMatchObject({
      questionId: "product-scenario-01",
      category: "product_scenario",
      expectedAmountFen: 150_000,
    });

    const unpaidStart = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/start`,
      payable.cookie,
      {
        method: "POST",
        body: { authorization },
      },
    );
    expect(unpaidStart.response.status).toBe(402);
    expect(servicePaymentCalls).toHaveLength(1);

    paymentAccepted = true;
    const started = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/start`,
      payable.cookie,
      {
        method: "POST",
        body: { authorization },
      },
    );
    expect(started.response.status).toBe(201);
    expect(started.body).toMatchObject({
      project: {
        stage: "service_activation",
        serviceActivation: {
          status: "account_setup_required",
          category: "product_scenario",
          amountFen: 150_000,
          billingMonths: 1,
          questionId: "product-scenario-01",
          orderId: "zpay-service-order-001",
          paidAt: servicePaymentPaidAt,
        },
      },
    });
    const startedPayload = started.body as Record<string, any>;
    const repeatedStart = await jsonRequest(
      `/projects/${encodeURIComponent(startedPayload.projectToken)}/services/start`,
      payable.cookie,
      {
        method: "POST",
        body: { authorization },
      },
    );
    expect(repeatedStart.response.status).toBe(200);
    expect(repeatedStart.body).toMatchObject({
      project: {
        stage: "service_activation",
        serviceActivation: { status: "account_setup_required" },
      },
    });
    expect(servicePaymentCalls).toHaveLength(2);
  });

  it("physically deletes a service project while its manual order is awaiting payment", async () => {
    const ready = await createServiceReadyProject();
    const payable = await advanceManualOrder(ready);
    const paymentRequiredDelete = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}`,
      payable.cookie,
      { method: "DELETE" },
    );
    expect(paymentRequiredDelete.response.status).toBe(200);
    expect(paymentRequiredDelete.body).toMatchObject({ ok: true });
  });

  it("physically deletes a paid service project while account setup is unfinished", async () => {
    const ready = await createServiceReadyProject();
    const payable = await advanceManualOrder(ready);
    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments`,
      payable.cookie,
      { method: "POST", body: { method: "alipay" } },
    );
    const started = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/start`,
      payable.cookie,
      {
        method: "POST",
        body: {
          authorization: (checkout.body as any).payment.authorization,
        },
      },
    );
    expect(started.response.status).toBe(201);
    const startedPayload = started.body as Record<string, any>;

    const paidUnfulfilledDelete = await jsonRequest(
      `/projects/${encodeURIComponent(startedPayload.projectToken)}`,
      payable.cookie,
      { method: "DELETE" },
    );
    expect(paidUnfulfilledDelete.response.status).toBe(200);
    expect(paidUnfulfilledDelete.body).toMatchObject({ ok: true });
    expect(manualOrderPaymentCalls).toHaveLength(1);
  });

  it("allows deletion after a paid service is fully activated and its knowledge base is ready", async () => {
    const ready = await createServiceReadyProject();
    const payable = await advanceManualOrder(ready);
    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments`,
      payable.cookie,
      { method: "POST", body: { method: "alipay" } },
    );
    const started = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/start`,
      payable.cookie,
      {
        method: "POST",
        body: {
          authorization: (checkout.body as any).payment.authorization,
        },
      },
    );
    const activated = await jsonRequest(
      `/projects/${encodeURIComponent((started.body as any).projectToken)}/services/account`,
      payable.cookie,
      {
        method: "POST",
        body: {
          displayName: "Acme",
          username: "acme.geo",
          password: "StrongPassword123",
        },
      },
    );
    expect(activated.response.status).toBe(201);
    expect(activated.body).toMatchObject({
      project: {
        serviceActivation: {
          status: "active",
          knowledgeImport: { status: "ready" },
        },
      },
    });

    const removed = await jsonRequest(
      `/projects/${encodeURIComponent((activated.body as any).projectToken)}`,
      payable.cookie,
      { method: "DELETE" },
    );
    expect(removed.response.status).toBe(200);
    expect(removed.body).toMatchObject({ ok: true });
  });

  it("blocks service checkout before charging when no public workspace URL is ready", async () => {
    const ready = await createServiceReadyProject();
    const payable = await advanceManualOrder(ready);
    broker.publicUrlConfigured = false;

    const response = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments`,
      payable.cookie,
      { method: "POST", body: { method: "alipay" } },
    );

    expect(response.response.status).toBe(503);
    expect(response.body).toMatchObject({
      error: { code: "SERVICE_WORKSPACE_NOT_READY" },
    });
    expect(servicePaymentCheckoutCalls).toHaveLength(0);
  });

  it("accepts customer credentials only after manual-order payment and never seals the password", async () => {
    const ready = await createServiceReadyProject();
    const payable = await advanceManualOrder(ready);
    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments`,
      payable.cookie,
      { method: "POST", body: { method: "alipay" } },
    );
    const started = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/start`,
      payable.cookie,
      {
        method: "POST",
        body: {
          authorization: (checkout.body as any).payment.authorization,
        },
      },
    );
    const attempted = await jsonRequest(
      `/projects/${encodeURIComponent((started.body as any).projectToken)}/services/account`,
      payable.cookie,
      {
        method: "POST",
        body: {
          displayName: "Acme",
          username: "acme.geo",
          password: "StrongPassword123",
          role: "admin",
        },
      },
    );

    expect(attempted.response.status).toBe(400);
    const password = "StrongPassword123";
    const validAttempt = await jsonRequest(
      `/projects/${encodeURIComponent((started.body as any).projectToken)}/services/account`,
      payable.cookie,
      {
        method: "POST",
        body: {
          displayName: "Acme",
          username: "acme.geo",
          password,
        },
      },
    );
    expect(validAttempt.response.status).toBe(201);
    expect(validAttempt.body).toMatchObject({
      project: {
        serviceActivation: {
          status: "active",
          manualOrderStatus: "active",
          accountMode: "create",
          accountUsername: "acme.geo",
          accountDisplayName: "Acme",
          workspaceUrl: "https://dashboard.frontmind.net/",
          knowledgeImport: { status: "ready" },
        },
      },
    });
    expect(manualOrderAccountCalls).toHaveLength(1);
    expect(manualOrderAccountCalls[0]).toMatchObject({
      reference: "manual-order-reference-001",
      request: {
        schemaVersion: 1,
        account: {
          mode: "create",
          displayName: "Acme",
          username: "acme.geo",
          password,
        },
      },
    });
    expect(accountProvisionCalls).toHaveLength(0);
    expect(JSON.stringify(validAttempt.body)).not.toContain(password);
    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    const stored = codec.open<Record<string, unknown>>(
      (validAttempt.body as any).projectToken,
      "project",
    ).value;
    expect(JSON.stringify(stored)).not.toContain(password);

    const replayed = await jsonRequest(
      `/projects/${encodeURIComponent((validAttempt.body as any).projectToken)}/services/account`,
      payable.cookie,
      {
        method: "POST",
        body: {
          displayName: "Acme",
          username: "acme.geo",
          password,
        },
      },
    );
    expect(replayed.response.status).toBe(200);
    expect(manualOrderAccountCalls).toHaveLength(2);

    const conflictingReplay = await jsonRequest(
      `/projects/${encodeURIComponent((validAttempt.body as any).projectToken)}/services/account`,
      payable.cookie,
      {
        method: "POST",
        body: {
          displayName: "Acme",
          username: "acme.geo",
          password: "DifferentPassword123",
        },
      },
    );
    expect(conflictingReplay.response.status).toBe(409);
    expect(conflictingReplay.body).toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });
    expect(manualOrderAccountCalls).toHaveLength(2);
  });

  it("does not forward manual-order credentials before verified payment", async () => {
    const ready = await createServiceReadyProject();
    const created = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/services/contracts`,
      ready.cookie,
      {
        method: "POST",
        body: {
          profile: validServiceContractProfile(),
          contractCode: CONTRACT_AUTH_CODE,
        },
      },
    );
    const attempted = await jsonRequest(
      `/projects/${encodeURIComponent((created.body as any).projectToken)}/services/account`,
      ready.cookie,
      {
        method: "POST",
        body: {
          displayName: "Acme",
          username: "acme.geo",
          password: "StrongPassword123",
        },
      },
    );

    expect(attempted.response.status).toBe(409);
    expect(attempted.body).toMatchObject({
      error: { code: "SERVICE_PAYMENT_REQUIRED" },
    });
    expect(manualOrderAccountCalls).toHaveLength(0);
  });

  it("fails closed when the account service does not activate immediately", async () => {
    const ready = await createServiceReadyProject();
    const payable = await advanceManualOrder(ready);
    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments`,
      payable.cookie,
      { method: "POST", body: { method: "alipay" } },
    );
    const started = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/start`,
      payable.cookie,
      {
        method: "POST",
        body: {
          authorization: (checkout.body as any).payment.authorization,
        },
      },
    );
    manualOrderAccountShouldRemainPending = true;
    const submitted = await jsonRequest(
      `/projects/${encodeURIComponent((started.body as any).projectToken)}/services/account`,
      payable.cookie,
      {
        method: "POST",
        body: {
          displayName: "Acme",
          username: "acme.geo",
          password: "StrongPassword123",
        },
      },
    );

    expect(submitted.response.status).toBe(502);
    expect(submitted.body).toMatchObject({
      error: {
        code: "MANUAL_ORDER_ACCOUNT_ACTIVATION_INCOMPLETE",
      },
    });
    expect(knowledgeImportCalls).toHaveLength(0);
  });

  it("hands off the knowledge base and becomes active when the customer submits an account", async () => {
    const ready = await createServiceReadyProject();
    const payable = await advanceManualOrder(ready);
    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments`,
      payable.cookie,
      { method: "POST", body: { method: "alipay" } },
    );
    const started = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/start`,
      payable.cookie,
      {
        method: "POST",
        body: {
          authorization: (checkout.body as any).payment.authorization,
        },
      },
    );
    expect(started.body).toMatchObject({
      project: {
        serviceActivation: {
          status: "account_setup_required",
          manualOrderStatus: "account_setup_required",
        },
      },
    });
    expect((started.body as any).project.serviceActivation).not.toHaveProperty(
      "contractId",
    );
    expect(knowledgeImportCalls).toHaveLength(0);

    const accountSubmitted = await jsonRequest(
      `/projects/${encodeURIComponent((started.body as any).projectToken)}/services/account`,
      payable.cookie,
      {
        method: "POST",
        body: {
          displayName: "Acme",
          username: "geo.acme",
          password: "StrongPassword123",
        },
      },
    );
    expect(accountSubmitted.body).toMatchObject({
      project: {
        serviceActivation: {
          status: "active",
          manualOrderStatus: "active",
          workspaceUrl: "https://dashboard.frontmind.net/",
          knowledgeImport: { status: "ready" },
        },
      },
    });
    const active = accountSubmitted;
    expect(knowledgeImportCalls).toHaveLength(1);
    expect(knowledgeImportCalls[0]).toMatchObject({
      request: {
        schemaVersion: 5,
        companyName: "Acme",
        candidateArtifactId: expect.any(String),
        finalArtifactId: expect.any(String),
        candidateSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        finalSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        packageManifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        finalizerVersion: "website-kb-finalizer-v1",
      },
    });
    const importedArchive = await broker.downloadArtifact(
      knowledgeImportCalls[0]!.request.finalArtifactId,
    );
    const importedZip = await JSZip.loadAsync(
      Buffer.from(await importedArchive.arrayBuffer()),
    );
    const importedFiles = Object.values(importedZip.files).filter(
      (entry) => !entry.dir,
    );
    expect(
      Array.from(
        new Set(importedFiles.map((entry) => entry.name.split("/")[0])),
      ),
    ).toEqual([WEBSITE_KB_ARCHIVE_ROOT]);
    expect(importedZip.file("00_package_manifest.json")).toBeNull();
    const accountPoll = await jsonRequest(
      `/projects/${encodeURIComponent((active.body as any).projectToken)}/services/account/status`,
      payable.cookie,
      { method: "POST", body: {} },
    );
    expect(accountPoll.body).toMatchObject({
      project: { serviceActivation: { status: "active" } },
    });
    expect(knowledgeImportCalls).toHaveLength(1);
  });

  it("keeps a knowledge-import parser error internal while preserving the retry state", async () => {
    const ready = await createServiceReadyProject();
    const payable = await advanceManualOrder(ready);
    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments`,
      payable.cookie,
      { method: "POST", body: { method: "alipay" } },
    );
    const started = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/start`,
      payable.cookie,
      {
        method: "POST",
        body: {
          authorization: (checkout.body as any).payment.authorization,
        },
      },
    );
    knowledgeImportShouldFail = true;

    const accountSubmitted = await jsonRequest(
      `/projects/${encodeURIComponent((started.body as any).projectToken)}/services/account`,
      payable.cookie,
      {
        method: "POST",
        body: {
          displayName: "Acme",
          username: "geo.acme",
          password: "StrongPassword123",
        },
      },
    );

    expect(accountSubmitted.response.status).toBe(201);
    expect(accountSubmitted.body).toMatchObject({
      project: {
        serviceActivation: {
          status: "failed",
          knowledgeImport: { status: "failed", retryable: true },
          error: "服务开通未完成，请重试",
        },
      },
    });
    expect(
      JSON.stringify((accountSubmitted.body as any).project.serviceActivation),
    ).not.toContain("知识库 ZIP 必须只包含一个企业知识库根目录");
    expect(knowledgeImportCalls).toHaveLength(1);
  });

  it("forwards an existing-account purchase intent once without storing it in the project token", async () => {
    const ready = await createServiceReadyProject();
    const payable = await advanceManualOrder(ready);
    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments`,
      payable.cookie,
      { method: "POST", body: { method: "alipay" } },
    );
    const purchaseIntent = "one-time-purchase-intent-001";
    const authorization = (checkout.body as any).payment.authorization;
    const started = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/start`,
      payable.cookie,
      {
        method: "POST",
        body: { authorization, schemaVersion: 2, purchaseIntent },
      },
    );

    expect(started.response.status).toBe(201);
    expect(started.body).toMatchObject({
      project: {
        serviceActivation: {
          status: "active",
          manualOrderStatus: "active",
          accountMode: "bind_existing",
          accountUsername: "existing.user",
          workspaceUrl: "https://dashboard.frontmind.net/",
          knowledgeImport: { status: "ready" },
        },
      },
    });
    expect(manualOrderPaymentCalls).toHaveLength(1);
    expect(manualOrderPaymentCalls[0]).toMatchObject({
      reference: "manual-order-reference-001",
      request: {
        payment: {
          orderId: "zpay-service-order-001",
          amountFen: 150_000,
        },
      },
    });
    expect(
      Object.prototype.hasOwnProperty.call(
        manualOrderPaymentCalls[0].request,
        "account",
      ),
    ).toBe(false);
    expect(manualOrderAccountCalls).toHaveLength(1);
    expect(manualOrderAccountCalls[0]).toMatchObject({
      reference: "manual-order-reference-001",
      request: {
        account: { mode: "bind_existing", purchaseIntent },
      },
    });
    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    const stored = codec.open<Record<string, unknown>>(
      (started.body as any).projectToken,
      "project",
    ).value;
    expect(JSON.stringify(stored)).not.toContain(purchaseIntent);
    expect(stored.serviceAccountMode).toBe("bind_existing");

    const replayed = await jsonRequest(
      `/projects/${encodeURIComponent((started.body as any).projectToken)}/services/start`,
      payable.cookie,
      {
        method: "POST",
        body: { authorization, schemaVersion: 2, purchaseIntent },
      },
    );
    expect(replayed.response.status).toBe(200);
    expect(manualOrderPaymentCalls).toHaveLength(1);
    expect(manualOrderAccountCalls).toHaveLength(1);
  });

  it.each(["assessment", "forecast"] as const)(
    "rejects service payment when the completed %s output is malformed",
    async (kind) => {
      const ready = await createServiceReadyProject();
      const taskId =
        kind === "assessment" ? ready.assessmentTaskId : ready.forecastTaskId;
      broker.tasks.set(taskId, {
        id: taskId,
        status: "completed",
        output: [{ content: [{ text: "{}" }] }],
      });

      const checkout = await jsonRequest(
        `/projects/${encodeURIComponent(ready.projectToken)}/services/payments`,
        ready.cookie,
        { method: "POST", body: { method: "alipay" } },
      );
      expect(checkout.response.status).toBe(409);
      expect(checkout.body).toMatchObject({
        error: { code: "SERVICE_ASSESSMENT_INVALID" },
      });
      expect(servicePaymentCheckoutCalls).toHaveLength(0);
    },
  );

  it("rejects industry-ranking service purchases before creating an order", async () => {
    const ready = await createServiceReadyProject();
    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    const project = codec.open<Record<string, unknown>>(
      ready.projectToken,
      "project",
    ).value;
    const industryToken = codec.seal(
      "project",
      { ...project, monitorQuestionId: "industry-ranking-01" },
      60 * 60 * 1000,
    );
    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(industryToken)}/services/payments`,
      ready.cookie,
      { method: "POST", body: { method: "alipay" } },
    );

    expect(checkout.response.status).toBe(403);
    expect(checkout.body).toMatchObject({
      error: { code: "QUESTION_NOT_SELECTABLE" },
    });
    expect(servicePaymentCheckoutCalls).toHaveLength(0);
  });

  it("keeps one question task after a transient read and uses a fresh task for an invalid result", async () => {
    const ready = await createReadyProject();
    broker.tasks.set("question-1", {
      id: "question-1",
      status: "completed",
      output: [],
    });
    broker.taskResultErrors.set(
      "question-1",
      new GeoBrokerError(
        "result is not readable yet",
        425,
        "AGENT_REQUEST_FAILED",
      ),
    );

    const unavailable = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/questions`,
      ready.cookie,
      { method: "POST", body: {} },
    );

    expect(unavailable.response.status).toBe(502);
    expect(unavailable.body).toMatchObject({
      error: { code: "TASK_RESULT_TEMPORARILY_UNAVAILABLE" },
    });
    expect(broker.questionTaskCount).toBe(1);
    expect(broker.prompts).toHaveLength(2);
    expect(broker.taskContracts.at(-1)).toBe(
      PRESALES_CONTRACTS.questionRecommendation,
    );

    broker.taskResultErrors.delete("question-1");
    broker.taskResults.set("question-1", {
      id: "question-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify({ questions: [] }) }],
        },
      ],
    });
    const structurallyInvalid = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/questions`,
      ready.cookie,
      { method: "POST", body: {} },
    );

    expect(structurallyInvalid.response.status).toBe(201);
    expect(structurallyInvalid.body).toMatchObject({
      project: {
        status: "completed",
        questionRecommendation: {
          status: "ready",
          quality: { completeness: "complete" },
        },
        questionRetryAvailable: false,
      },
    });
    expect(
      (structurallyInvalid.body as any).project.executionLog.currentEntryId,
    ).toBeUndefined();
    expect(broker.questionTaskCount).toBe(2);
    expect(broker.prompts).toHaveLength(3);
  });

  it("keeps safe questions visible when whole-set recommendation checks fail", async () => {
    const ready = await createReadyProject();
    const relaxed = validQuestionSet() as Record<string, any>;
    relaxed.questions[5].question =
      "Acme 服务模块 1 所在行业 Top 10 服务商有哪些？";
    relaxed.questions[5].selectable = true;
    delete relaxed.questions[15].competitorAnchor;
    delete relaxed.questions[15].rationale;
    delete relaxed.questions[15].evidenceRefs;
    relaxed.questions[16].id = relaxed.questions[15].id;

    broker.tasks.set("question-1", {
      id: "question-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify(relaxed) }],
        },
      ],
    });

    const refreshed = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
    );
    const project = (refreshed.body as Record<string, any>).project;

    expect(refreshed.response.status).toBe(200);
    expect(project).toMatchObject({
      status: "completed",
      stage: "question_recommendation",
      questionRecommendation: {
        status: "ready",
        quality: {
          completeness: "partial",
        },
      },
    });
    expect(project.questions.length).toBeGreaterThan(0);
    expect(project.questions.length).toBeLessThanOrEqual(20);
    expect(
      project.questions.filter((question: any) => !question.selectable).length,
    ).toBeGreaterThan(5);
    expect(project.questionValidationError).toBeUndefined();
    expect(broker.questionTaskCount).toBe(1);
  });

  it("shows the first partial recommendation while keeping unsafe questions locked", async () => {
    broker.questionTaskOutput = {
      questions: [
        {
          id: "reputation-01",
          category: "reputation",
          question: "Acme 靠谱吗？",
        },
        {
          id: "product-scenario-01",
          category: "product_scenario",
          question: "Acme 的企业知识库适合哪些使用场景？",
        },
        {
          id: "competitor-comparison-01",
          category: "competitor_comparison",
          question: "Acme 和 BetaCloud 方案相比有什么区别？",
        },
      ],
    };
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    const initialProject = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ knowledgeBaseTaskId: string }>(
      initial.projectToken,
      "project",
    ).value;
    broker.tasks.set(initialProject.knowledgeBaseTaskId, {
      id: initialProject.knowledgeBaseTaskId,
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            {
              type: "output_file",
              file_id: "archive-1",
              filename: "Acme.zip",
            },
          ],
        },
      ],
    });

    const recommended = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}/questions`,
      cookie,
      { method: "POST", body: {} },
    );
    const project = (recommended.body as Record<string, any>).project;

    expect(recommended.response.status).toBe(201);
    expect(project).toMatchObject({
      status: "completed",
      stage: "question_recommendation",
      questionRecommendation: {
        status: "ready",
        quality: {
          completeness: "partial",
          downstreamEligible: false,
        },
      },
    });
    expect(project.questions).toHaveLength(3);
    expect(
      project.questions.every((question: any) => !question.selectable),
    ).toBe(true);
    expect(project.questionValidationError).toBeUndefined();
    expect(broker.questionTaskCount).toBe(1);
  });

  it("keeps invalid question polling read-only and creates a fresh task only on explicit retry", async () => {
    broker.invalidFirstQuestionTask = true;
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            { type: "output_file", file_id: "archive-1", filename: "Acme.zip" },
          ],
        },
      ],
    });

    const firstQuestions = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}/questions`,
      cookie,
      { method: "POST", body: {} },
    );
    const firstPayload = firstQuestions.body as Record<string, any>;
    expect(firstPayload.project.questionValidationError).toBeTruthy();

    const readOnlyPoll = await jsonRequest(
      `/projects/${encodeURIComponent(firstPayload.projectToken)}`,
      cookie,
    );
    const readOnlyPayload = readOnlyPoll.body as Record<string, any>;
    expect(readOnlyPayload.project.questionValidationError).toBeTruthy();
    expect(readOnlyPayload.project.questionRetryAvailable).toBe(true);
    expect(broker.questionTaskCount).toBe(1);

    const replayed = await jsonRequest(
      `/projects/${encodeURIComponent(firstPayload.projectToken)}/questions`,
      cookie,
      { method: "POST", body: {} },
    );
    expect(replayed.response.status).toBe(201);
    expect(replayed.body).toMatchObject({
      project: {
        status: "completed",
        questionRecommendation: {
          status: "ready",
          quality: { completeness: "complete" },
        },
        questionRetryAvailable: false,
      },
    });
    expect(broker.questionTaskCount).toBe(2);
    expect(broker.taskContracts).toEqual([
      PRESALES_CONTRACTS.knowledgeBaseCandidate,
      PRESALES_CONTRACTS.questionRecommendation,
      PRESALES_CONTRACTS.questionRecommendation,
    ]);
  });

  it("creates a fresh question task after an explicitly retried cancellation", async () => {
    const ready = await createReadyProject();
    broker.tasks.set("question-1", {
      id: "question-1",
      status: "cancelled",
      output: [],
    });

    const replayed = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/questions`,
      ready.cookie,
      { method: "POST", body: {} },
    );

    expect(replayed.response.status).toBe(201);
    expect(replayed.body).toMatchObject({
      project: {
        status: "completed",
        questionRecommendation: {
          status: "ready",
          quality: { completeness: "complete" },
        },
        questionRetryAvailable: false,
      },
    });
    expect(broker.questionTaskCount).toBe(2);
  });

  it.each([
    "RESULT_INVALID_OR_MISSING",
    "RESULT_COORDINATE_AMBIGUOUS",
    "QUESTION_RESULT_VALIDATION_FAILED",
    "TASK_REPAIR_EXHAUSTED",
  ])("classifies %s as an invalid recommendation result", async (code) => {
    const ready = await createReadyProject();
    broker.tasks.set("question-1", {
      localTaskId: "question-1",
      operationId: "operation:question-1",
      status: "failed",
      safeEvents: [],
      error: { code, retryable: false },
    });

    const refreshed = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
    );

    expect(refreshed.response.status).toBe(200);
    expect(refreshed.body).toMatchObject({
      project: {
        status: "failed",
        questionRecommendation: {
          status: "failed",
          failureKind: "result_invalid",
        },
      },
    });
    expect(broker.questionTaskCount).toBe(1);
  });

  it.each(["PROVIDER_DEADLINE_EXCEEDED", "PROVIDER_UNAVAILABLE"])(
    "classifies %s as provider unavailable",
    async (code) => {
      const ready = await createReadyProject();
      broker.tasks.set("question-1", {
        localTaskId: "question-1",
        operationId: "operation:question-1",
        status: "failed",
        safeEvents: [],
        error: { code, retryable: false },
      });

      const refreshed = await jsonRequest(
        `/projects/${encodeURIComponent(ready.projectToken)}`,
        ready.cookie,
      );

      expect(refreshed.response.status).toBe(200);
      expect(refreshed.body).toMatchObject({
        project: {
          status: "failed",
          questionRecommendation: {
            status: "failed",
            failureKind: "provider_unavailable",
          },
        },
      });
      expect(broker.questionTaskCount).toBe(1);
    },
  );

  it("keeps a create response without status waiting and reuses the original task", async () => {
    broker.omitNextKnowledgeTaskStatus = true;
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;

    expect(initial.project).toMatchObject({
      status: "running",
      knowledgeBaseSupportRequired: false,
      kbTask: { status: "running" },
      executionLog: {
        entries: [
          expect.objectContaining({
            id: "enterprise-analysis",
            status: "running",
            startedAt: expect.any(String),
          }),
        ],
      },
    });
    expect(broker.prompts).toHaveLength(1);

    const refreshed = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}`,
      cookie,
    );
    expect(refreshed.response.status).toBe(200);
    expect((refreshed.body as any).project.status).toBe("running");
    expect(broker.prompts).toHaveLength(1);
  });

  it.each([
    [
      "FILE_UPLOAD_CONFIRMATION_UNKNOWN",
      "attention_required",
      undefined,
      false,
      "向分析服务提交资料未完成",
    ],
    [
      "CREATE_OUTCOME_UNKNOWN",
      "attention_required",
      undefined,
      false,
      "任务创建结果暂时无法确认",
    ],
    [
      "PROVIDER_RUNTIME_FAILED",
      "failed",
      "2026-08-17T00:00:00.000Z",
      true,
      "联系技术支持",
    ],
  ] as const)(
    "publishes %s as the correct knowledge-base terminal",
    async (
      code,
      status,
      providerStartedAt,
      supportRequired,
      expectedMessage,
    ) => {
      const { cookie } = await verifyInvite();
      const created = await jsonRequest("/projects", cookie, {
        method: "POST",
        body: { input: "Acme", attachments: [] },
      });
      const initial = created.body as Record<string, any>;
      broker.tasks.set("kb-1", {
        localTaskId: "kb-1",
        operationId: "operation:kb-1",
        status,
        safeEvents: [],
        error: { code, retryable: false },
        ...(providerStartedAt ? { providerStartedAt } : {}),
      });

      const refreshed = await jsonRequest(
        `/projects/${encodeURIComponent(initial.projectToken)}`,
        cookie,
      );
      expect(refreshed.body).toMatchObject({
        project: {
          status: "failed",
          knowledgeBaseSupportRequired: supportRequired,
          error: expect.stringContaining(expectedMessage),
          kbTask: {
            status: "failed",
            error: expect.stringContaining(expectedMessage),
          },
        },
      });
      expect(JSON.stringify(refreshed.body)).not.toContain(code);
    },
  );

  it("keeps unrecognized knowledge-base and question states waiting without duplicating tasks", async () => {
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "paused",
      output: [],
    });

    const unknownKnowledgeBase = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}`,
      cookie,
    );
    expect((unknownKnowledgeBase.body as any).project).toMatchObject({
      status: "running",
      knowledgeBaseSupportRequired: false,
      kbTask: {
        status: "running",
      },
      executionLog: {
        entries: [
          expect.objectContaining({
            id: "enterprise-analysis",
            status: "running",
          }),
        ],
      },
    });
    const knowledgeBaseReplay = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}/retry`,
      cookie,
      { method: "POST", body: { input: "Acme", attachments: [] } },
    );
    expect(knowledgeBaseReplay.response.status).toBe(404);
    expect(broker.prompts).toHaveLength(1);

    const ready = await createReadyProject();
    const readyProject = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ questionTaskId: string }>(ready.projectToken, "project").value;
    broker.tasks.set(readyProject.questionTaskId, {
      id: readyProject.questionTaskId,
      status: "paused",
      output: [],
    });
    const unknownQuestion = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
    );
    expect((unknownQuestion.body as any).project).toMatchObject({
      status: "running",
      questionRecommendation: { status: "pending" },
      questionRetryAvailable: false,
      questionTask: {
        status: "running",
      },
    });
    const questionReplay = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/questions`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(questionReplay.response.status).toBe(200);
    expect(broker.questionTaskCount).toBe(1);
  });

  it("keeps an invalid recommendation terminal and creates a fresh task on explicit retry", async () => {
    const ready = await createReadyProject();
    const stored = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ questionTaskId: string }>(ready.projectToken, "project").value;
    broker.tasks.set(stored.questionTaskId, {
      localTaskId: stored.questionTaskId,
      operationId: `operation:${stored.questionTaskId}`,
      status: "succeeded",
      safeEvents: [],
      result: { structuredResult: { questions: [] }, artifacts: [] },
    });
    const viewed = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
    );
    expect(viewed.response.status).toBe(200);
    expect((viewed.body as any).project).toMatchObject({
      questionRecommendation: { status: "failed" },
      questionRetryAvailable: true,
    });
    expect(broker.questionTaskCount).toBe(1);
    expect(broker.repairCalls).toHaveLength(0);

    const retried = await jsonRequest(
      `/projects/${encodeURIComponent((viewed.body as any).projectToken)}/questions`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(retried.response.status).toBe(201);
    expect((retried.body as any).project.questions).toHaveLength(20);
    expect(broker.questionTaskCount).toBe(2);
    expect(
      Array.from(broker.idempotentTasks.keys()).some((key) =>
        key.endsWith(":questions:2"),
      ),
    ).toBe(true);
    expect((retried.body as any).project.questionTask).not.toMatchObject({
      id: stored.questionTaskId,
    });
  });

  it("keeps Dashboard-normalized running state nonterminal regardless of local token age", async () => {
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "paused",
      output: [],
    });
    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    const stored = codec.open<Record<string, unknown>>(
      initial.projectToken,
      "project",
    ).value;
    const delayedToken = codec.seal(
      "project",
      {
        ...stored,
        knowledgeBaseSubmittedAt: "2026-07-28T00:00:00.000Z",
      },
      60 * 60 * 1000,
    );

    const delayed = await jsonRequest(
      `/projects/${encodeURIComponent(delayedToken)}`,
      cookie,
    );
    expect((delayed.body as any).project).toMatchObject({
      status: "running",
      knowledgeBaseSupportRequired: false,
      kbTask: { status: "running" },
    });
    expect(broker.prompts).toHaveLength(1);
  });

  it("retires monitoring checkout creation and switching before any payment side effect", async () => {
    const ready = await createReadyProject();
    const unavailableCreate = vi
      .spyOn(paymentGateway, "createCheckout")
      .mockRejectedValue(
        new GeoPaymentVerificationError(
          "payment configuration unavailable",
          "PAYMENT_NOT_CONFIGURED",
          503,
        ),
      );
    const unavailableSwitch = vi
      .spyOn(paymentGateway, "switchCheckoutMethod")
      .mockRejectedValue(
        new GeoPaymentVerificationError(
          "payment configuration unavailable",
          "PAYMENT_NOT_CONFIGURED",
          503,
        ),
      );
    const scope = {
      questionId: "product-scenario-01",
      monitoringEdition: "domestic",
      platformIds: ["doubao"],
    };
    const created = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/payments`,
      ready.cookie,
      { method: "POST", body: { ...scope, method: "alipay" } },
    );
    const switched = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/payments/switch`,
      ready.cookie,
      {
        method: "POST",
        body: {
          ...scope,
          method: "wxpay",
          authorization: "legacy-authorization-placeholder",
        },
      },
    );

    expect(created.response.status).toBe(410);
    expect(created.body).toMatchObject({
      error: { code: "MONITORING_PAYMENT_RETIRED" },
    });
    expect(switched.response.status).toBe(410);
    expect(switched.body).toMatchObject({
      error: { code: "MONITORING_PAYMENT_RETIRED" },
    });
    expect(paymentCheckoutCalls).toHaveLength(0);
    expect(paymentSwitchCalls).toHaveLength(0);
    expect(unavailableCreate).not.toHaveBeenCalled();
    expect(unavailableSwitch).not.toHaveBeenCalled();
    expect(projectOrders.size).toBe(0);
  });

  it("starts free domestic monitoring once with a stable scope key and no payment calls", async () => {
    const ready = await createReadyProject();
    const request = {
      schemaVersion: 2,
      clientRequestId: "22222222-2222-4222-8222-222222222222",
      questionId: "product-scenario-01",
      monitoringEdition: "domestic",
      platformIds: ["doubao", "kimi"],
    };
    const first = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      { method: "POST", body: request },
    );
    const replay = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      { method: "POST", body: request },
    );
    const conflict = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      {
        method: "POST",
        body: {
          ...request,
          clientRequestId: "33333333-3333-4333-8333-333333333333",
          platformIds: ["doubao"],
        },
      },
    );

    expect(first.response.status).toBe(201);
    expect(first.body).toMatchObject({
      state: "started",
      replayed: false,
      project: {
        monitoring: { status: "submitted", expectedRecords: 10 },
      },
    });
    expect(replay.response.status).toBe(200);
    expect(replay.body).toMatchObject({ state: "started", replayed: true });
    expect(conflict.response.status).toBe(409);
    expect(conflict.body).toMatchObject({
      error: { code: "MONITOR_SCOPE_CONFLICT" },
    });
    expect(broker.monitorCreates).toBe(1);
    expect(
      Array.from(broker.monitorRuns.keys()).some((key) =>
        key.startsWith("geo-monitor-free:v2:"),
      ),
    ).toBe(true);
    expect(paymentCalls).toHaveLength(0);
    expect(paymentCheckoutCalls).toHaveLength(0);
    expect(paymentStatusCalls).toHaveLength(0);
  });

  it("closes a pending legacy monitoring order before starting the free scope", async () => {
    const ready = await createReadyProject();
    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    const { projectId } = codec.open<{ projectId: string }>(
      ready.projectToken,
      "project",
    ).value;
    const authorization = "legacy-authorization-placeholder";
    projectOrders.set("zpay-order-001", {
      orderId: "zpay-order-001",
      projectId,
      purchaseType: "monitoring",
      amountFen: 200,
      authorizationDigest: createHash("sha256")
        .update(authorization)
        .digest("hex"),
      state: "pending",
      checkoutExpiresAt: "2027-07-23T10:00:00.000Z",
      eventAt: "2026-08-01T00:00:00.000Z",
    });
    paymentAccepted = false;

    const started = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      {
        method: "POST",
        body: {
          schemaVersion: 2,
          clientRequestId: "44444444-4444-4444-8444-444444444444",
          questionId: "product-scenario-01",
          monitoringEdition: "domestic",
          platformIds: ["doubao"],
          legacyPaymentAuthorization: authorization,
        },
      },
    );

    expect(started.response.status).toBe(201);
    expect(projectOrders.get("zpay-order-001")?.state).toBe("closed");
    expect(paymentStatusCalls).toHaveLength(1);
    expect(paymentCalls).toHaveLength(0);
    expect(broker.monitorCreates).toBe(1);
  });

  it("persists one overseas recovery reservation and does not consume create quota again", async () => {
    broker.monitorQuestionTranslationStatus = "running";
    const ready = await createReadyProject();
    const request = {
      schemaVersion: 2,
      clientRequestId: "45454545-4545-4545-8545-454545454545",
      questionId: "product-scenario-01",
      monitoringEdition: "overseas",
      platformIds: ["chatgpt"],
    };

    const initial = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      { method: "POST", body: request },
    );
    expect(initial.response.status).toBe(202);
    let projectToken = (initial.body as any).projectToken as string;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const processing = await jsonRequest(
        `/projects/${encodeURIComponent(projectToken)}/monitoring`,
        ready.cookie,
        { method: "POST", body: request },
      );
      expect(processing.response.status).toBe(202);
      expect(processing.body).toMatchObject({
        state: "processing",
        clientRequestId: request.clientRequestId,
        retryAfterMs: 3_000,
      });
      projectToken = (processing.body as any).projectToken;
      expect(projectToken).toEqual(expect.any(String));
    }
    const rateLimited = await jsonRequest(
      `/projects/${encodeURIComponent(projectToken)}/monitoring`,
      ready.cookie,
      { method: "POST", body: request },
    );
    expect(rateLimited.response.status).toBe(429);
    expect(rateLimited.body).toMatchObject({
      error: { code: "SESSION_RATE_LIMITED" },
    });
    expect(broker.monitorQuestionTranslationTaskCount).toBe(1);
    expect(broker.monitorCreates).toBe(0);

    const translationTask = broker.tasks.get("monitor-question-translation-1")!;
    translationTask.status = "succeeded";
    translationTask.result = {
      structuredResult: {
        schemaVersion: 1,
        sourceQuestionSha256: createHash("sha256")
          .update("Acme 的服务模块 1 主要解决哪些业务问题？", "utf8")
          .digest("hex"),
        questionEnglish:
          "Which business problems does Acme Service Module 1 primarily solve?",
      },
      artifacts: [],
    };
    await restartWithCustomQuestionValidationStore(
      customQuestionValidationStore,
    );

    const recovered = await jsonRequest(
      `/projects/${encodeURIComponent(projectToken)}/monitoring`,
      ready.cookie,
      { method: "POST", body: request },
    );
    expect(recovered.response.status).toBe(200);
    expect(recovered.body).toMatchObject({
      state: "started",
      replayed: true,
    });
    expect(broker.monitorCreates).toBe(1);
  });

  it.each(["paid", "review_required"] as const)(
    "fulfills a legacy %s order with its original stable key and never downgrades it",
    async (initialState) => {
      const ready = await createReadyProject();
      const codec = new GeoTokenCodec(
        "test-session-secret-at-least-16-characters",
      );
      const { projectId } = codec.open<{ projectId: string }>(
        ready.projectToken,
        "project",
      ).value;
      const authorization = "legacy-paid-authorization-placeholder";
      projectOrders.set("zpay-order-001", {
        orderId: "zpay-order-001",
        projectId,
        purchaseType: "monitoring",
        amountFen: 200,
        authorizationDigest: createHash("sha256")
          .update(authorization)
          .digest("hex"),
        state: initialState,
        checkoutExpiresAt: "2027-07-23T10:00:00.000Z",
        eventAt: "2026-08-01T00:00:00.000Z",
        paidAt: "2026-07-22T10:05:00.000Z",
      });

      const started = await jsonRequest(
        `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
        ready.cookie,
        {
          method: "POST",
          body: {
            schemaVersion: 2,
            clientRequestId: "56565656-5656-4656-8656-565656565656",
            questionId: "product-scenario-01",
            monitoringEdition: "domestic",
            platformIds: ["doubao"],
            legacyPaymentAuthorization: authorization,
          },
        },
      );

      expect(started.response.status).toBe(201);
      expect(projectOrders.get("zpay-order-001")?.state).toBe("fulfilling");
      expect(projectOrders.get("zpay-order-001")?.paidAt).toBe(
        "2026-07-22T10:05:00.000Z",
      );
      expect(broker.monitorCreates).toBe(1);
      expect(
        Array.from(broker.monitorRuns.keys()).filter((key) =>
          key.startsWith("geo-monitor:"),
        ),
      ).toHaveLength(1);
      expect(
        Array.from(broker.monitorRuns.keys()).some((key) =>
          key.startsWith("geo-monitor-free:v2:"),
        ),
      ).toBe(false);

      const replay = await jsonRequest(
        `/projects/${encodeURIComponent((started.body as any).projectToken)}/monitoring`,
        ready.cookie,
        {
          method: "POST",
          body: {
            schemaVersion: 2,
            clientRequestId: "56565656-5656-4656-8656-565656565656",
            questionId: "product-scenario-01",
            monitoringEdition: "domestic",
            platformIds: ["doubao"],
          },
        },
      );
      expect(replay.response.status).toBe(200);
      expect(broker.monitorCreates).toBe(1);
    },
  );

  it.each(["review_required", "fulfilling", "fulfilled"] as const)(
    "recovers a legacy %s order across restart from its durable order key",
    async (recoveryState) => {
      const ready = await createReadyProject();
      const codec = new GeoTokenCodec(
        "test-session-secret-at-least-16-characters",
      );
      const { projectId } = codec.open<{ projectId: string }>(
        ready.projectToken,
        "project",
      ).value;
      const authorization = "legacy-restart-authorization-placeholder";
      const baseOrder: GeoProjectOrder = {
        orderId: "zpay-order-001",
        projectId,
        purchaseType: "monitoring",
        amountFen: 200,
        authorizationDigest: createHash("sha256")
          .update(authorization)
          .digest("hex"),
        state: "paid",
        checkoutExpiresAt: "2027-07-23T10:00:00.000Z",
        eventAt: "2026-08-01T00:00:00.000Z",
        paidAt: "2026-07-22T10:05:00.000Z",
      };
      projectOrders.set(baseOrder.orderId, baseOrder);
      const request = {
        schemaVersion: 2,
        clientRequestId: "67676767-6767-4676-8676-676767676767",
        questionId: "product-scenario-01",
        monitoringEdition: "domestic",
        platformIds: ["doubao"],
        legacyPaymentAuthorization: authorization,
      };

      const initial = await jsonRequest(
        `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
        ready.cookie,
        { method: "POST", body: request },
      );
      expect(initial.response.status).toBe(201);
      expect(broker.monitorCreates).toBe(1);
      projectOrders.set(baseOrder.orderId, {
        ...projectOrders.get(baseOrder.orderId)!,
        state: recoveryState,
        ...(recoveryState === "fulfilled"
          ? { fulfilledAt: "2026-07-22T10:06:00.000Z" }
          : { fulfilledAt: undefined }),
      });
      paymentAccepted = recoveryState !== "review_required";
      await restartWithCustomQuestionValidationStore(
        customQuestionValidationStore,
      );

      const recovered = await jsonRequest(
        `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
        ready.cookie,
        { method: "POST", body: request },
      );

      expect(recovered.response.status).toBe(200);
      expect(broker.monitorCreates).toBe(1);
      expect(projectOrders.get(baseOrder.orderId)?.state).toBe(
        recoveryState === "fulfilled" ? "fulfilled" : "fulfilling",
      );
      expect(
        Array.from(broker.monitorRuns.keys()).filter((key) =>
          key.startsWith("geo-monitor:"),
        ),
      ).toHaveLength(1);
    },
  );

  it("fails closed for a durable terminal legacy order after restart", async () => {
    const ready = await createReadyProject();
    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    const { projectId } = codec.open<{ projectId: string }>(
      ready.projectToken,
      "project",
    ).value;
    const authorization = "legacy-terminal-authorization-placeholder";
    projectOrders.set("zpay-order-001", {
      orderId: "zpay-order-001",
      projectId,
      purchaseType: "monitoring",
      amountFen: 200,
      authorizationDigest: createHash("sha256")
        .update(authorization)
        .digest("hex"),
      state: "terminal_failed",
      checkoutExpiresAt: "2027-07-23T10:00:00.000Z",
      eventAt: "2026-08-01T00:00:00.000Z",
      paidAt: "2026-07-22T10:05:00.000Z",
    });
    await restartWithCustomQuestionValidationStore(
      customQuestionValidationStore,
    );

    const failed = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      {
        method: "POST",
        body: {
          schemaVersion: 2,
          clientRequestId: "68686868-6868-4686-8686-686868686868",
          questionId: "product-scenario-01",
          monitoringEdition: "domestic",
          platformIds: ["doubao"],
          legacyPaymentAuthorization: authorization,
        },
      },
    );

    expect(failed.response.status).toBe(409);
    expect(failed.body).toMatchObject({
      error: { code: "LEGACY_MONITOR_TERMINAL_FAILED" },
    });
    expect(paymentStatusCalls).toHaveLength(0);
    expect(broker.monitorCreates).toBe(0);
  });

  it("moves a late payment on a closed monitoring order into review without creating a run", async () => {
    const ready = await createReadyProject();
    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    const { projectId } = codec.open<{ projectId: string }>(
      ready.projectToken,
      "project",
    ).value;
    const authorization = "legacy-closed-authorization-placeholder";
    projectOrders.set("zpay-order-001", {
      orderId: "zpay-order-001",
      projectId,
      purchaseType: "monitoring",
      amountFen: 200,
      authorizationDigest: createHash("sha256")
        .update(authorization)
        .digest("hex"),
      state: "closed",
      checkoutExpiresAt: "2027-07-23T10:00:00.000Z",
      eventAt: "2026-08-01T00:00:00.000Z",
    });

    const late = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      {
        method: "POST",
        body: {
          schemaVersion: 2,
          clientRequestId: "78787878-7878-4787-8787-787878787878",
          questionId: "product-scenario-01",
          monitoringEdition: "domestic",
          platformIds: ["doubao"],
          legacyPaymentAuthorization: authorization,
        },
      },
    );

    expect(late.response.status).toBe(409);
    expect(late.body).toMatchObject({
      error: { code: "LEGACY_MONITOR_LATE_PAYMENT_REVIEW_REQUIRED" },
    });
    expect(projectOrders.get("zpay-order-001")?.state).toBe("review_required");
    expect(projectOrders.get("zpay-order-001")?.paidAt).toBe(
      "2026-07-22T10:05:00.000Z",
    );
    expect(broker.monitorCreates).toBe(0);
  });

  it("routes a status-poll payment arriving after free cutover to review without fulfillment", async () => {
    const ready = await createReadyProject();
    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    const { projectId } = codec.open<{ projectId: string }>(
      ready.projectToken,
      "project",
    ).value;
    const authorization = "legacy-status-late-authorization";
    projectOrders.set("zpay-order-001", {
      orderId: "zpay-order-001",
      projectId,
      purchaseType: "monitoring",
      amountFen: 200,
      authorizationDigest: createHash("sha256")
        .update(authorization)
        .digest("hex"),
      state: "closed",
      checkoutExpiresAt: "2027-07-23T10:00:00.000Z",
      eventAt: "2026-08-01T00:00:00.000Z",
    });

    const status = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/payments/status`,
      ready.cookie,
      {
        method: "POST",
        body: {
          questionId: "product-scenario-01",
          monitoringEdition: "domestic",
          platformIds: ["doubao"],
          authorization,
        },
      },
    );

    expect(status.response.status).toBe(409);
    expect(status.body).toMatchObject({
      error: { code: "LEGACY_MONITOR_LATE_PAYMENT_REVIEW_REQUIRED" },
    });
    expect(projectOrders.get("zpay-order-001")?.state).toBe("review_required");
    expect(projectOrders.get("zpay-order-001")?.paidAt).toBe(
      "2026-07-22T10:05:00.000Z",
    );
    expect(broker.monitorCreates).toBe(0);
  });
});

async function verifyInvite(
  existingCookie = "",
  businessOwnerName = "测试商务负责人",
) {
  const response = await fetch(`${baseUrl}/invite/verify`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(existingCookie ? { cookie: existingCookie } : {}),
    },
    body: JSON.stringify({
      code: "frontmind666",
      businessOwnerName,
    }),
  });
  const cookie = response.headers.get("set-cookie")?.split(";")[0] || "";
  const body = (await response.json()) as Record<string, unknown>;
  if (cookie && typeof body.inviteContextToken === "string") {
    inviteContextByCookie.set(cookie, body.inviteContextToken);
  }
  return {
    response,
    cookie,
    inviteContextToken:
      typeof body.inviteContextToken === "string"
        ? body.inviteContextToken
        : "",
    businessOwnerName:
      typeof body.businessOwnerName === "string" ? body.businessOwnerName : "",
  };
}

async function jsonRequest(
  pathname: string,
  cookie: string,
  options: { method?: string; body?: unknown } = {},
) {
  const requestBody =
    (pathname === "/projects" || pathname === "/uploads/init") &&
    (options.method || "GET") === "POST" &&
    options.body &&
    typeof options.body === "object" &&
    !Array.isArray(options.body) &&
    !("inviteContextToken" in options.body)
      ? {
          ...options.body,
          inviteContextToken: inviteContextByCookie.get(cookie),
        }
      : options.body;
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers: {
      cookie,
      ...(requestBody === undefined
        ? {}
        : { "content-type": "application/json" }),
    },
    body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
  });
  return { response, body: await response.json() };
}

async function restartWithUploadTimeouts(options: {
  uploadDataIdleMs: number;
  uploadConfirmationMs: number;
}) {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  const app = express();
  app.use(
    "/api/geo",
    createGeoRouter({
      broker,
      customQuestionValidationStore,
      monitorFreeReservationStore,
      projectOrderRegistry,
      uploadDataIdleMs: options.uploadDataIdleMs,
      uploadConfirmationMs: options.uploadConfirmationMs,
      env: {
        NODE_ENV: "test",
        FRONTMIND_GEO_INVITE_CODE: "frontmind666",
        FRONTMIND_GEO_SESSION_SECRET:
          "test-session-secret-at-least-16-characters",
      },
    }),
  );
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/geo`;
}

async function restartWithCustomQuestionValidationStore(
  store: MemoryGeoCustomQuestionValidationStore,
) {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  customQuestionValidationStore = store;
  const app = express();
  app.use(
    "/api/geo",
    createGeoRouter({
      broker,
      customQuestionValidationStore,
      monitorFreeReservationStore,
      projectOrderRegistry,
      paymentGateway,
      monitorQuestionTranslationWaitMs: 100,
      monitorQuestionTranslationPollMs: 2,
      customQuestionValidationNow: () => customQuestionValidationNowMs,
      env: {
        NODE_ENV: "test",
        FRONTMIND_GEO_INVITE_CODE: "frontmind666",
        FRONTMIND_GEO_SESSION_SECRET:
          "test-session-secret-at-least-16-characters",
      },
    }),
  );
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/geo`;
}

async function createReadyProject() {
  const { cookie } = await verifyInvite();
  const created = await jsonRequest("/projects", cookie, {
    method: "POST",
    body: { input: "Acme", attachments: [] },
  });
  const initial = created.body as Record<string, any>;
  const initialProject = new GeoTokenCodec(
    "test-session-secret-at-least-16-characters",
  ).open<{ knowledgeBaseTaskId: string }>(
    initial.projectToken,
    "project",
  ).value;
  broker.tasks.set(initialProject.knowledgeBaseTaskId, {
    id: initialProject.knowledgeBaseTaskId,
    status: "completed",
    output: [
      {
        id: `message-${initialProject.knowledgeBaseTaskId}`,
        type: "message",
        role: "assistant",
        content: [
          { type: "output_file", file_id: "archive-1", filename: "Acme.zip" },
        ],
      },
    ],
  });
  const recommended = await jsonRequest(
    `/projects/${encodeURIComponent(initial.projectToken)}/questions`,
    cookie,
    { method: "POST", body: {} },
  );
  return {
    cookie,
    projectToken: (recommended.body as Record<string, any>)
      .projectToken as string,
  };
}

async function startOnePlatformMonitor(
  ready: {
    cookie: string;
    projectToken: string;
  },
  questionId = "product-scenario-01",
  platformIds: GeoMonitorPlatformId[] = ["doubao"],
  monitoringEdition?: GeoMonitoringEdition,
) {
  const started = await jsonRequest(
    `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
    ready.cookie,
    {
      method: "POST",
      body: {
        schemaVersion: 2,
        clientRequestId: crypto.randomUUID(),
        questionId,
        platformIds,
        monitoringEdition: monitoringEdition ?? "domestic",
      },
    },
  );
  expect(started.response.status).toBe(201);
  return started.body as Record<string, any>;
}

async function createServiceReadyProject(
  questionId = "product-scenario-01",
  monitoringEdition: GeoMonitoringEdition = "domestic",
) {
  const questionSet = validQuestionSet();
  const question = questionSet.questions.find(
    (candidate) => candidate.id === questionId,
  );
  if (!question) throw new Error(`missing fixture question ${questionId}`);

  const ready = await createReadyProject();
  const platformId: GeoMonitorPlatformId =
    monitoringEdition === "overseas" ? "chatgpt" : "doubao";
  const monitored = await startOnePlatformMonitor(
    ready,
    questionId,
    [platformId],
    monitoringEdition,
  );
  const monitorRunId = `monitor-${broker.monitorCreates}`;
  const run = broker.monitorRuns.get(monitorRunId);
  if (!run) throw new Error(`missing fixture monitor run ${monitorRunId}`);
  broker.monitorRuns.set(monitorRunId, {
    ...run,
    status: "completed",
    completedItems: 5,
    records: Array.from({ length: 5 }, (_, index) =>
      monitorRecord(
        index + 1,
        monitoringEdition === "overseas"
          ? `Acme monitoring answer ${index + 1}`
          : `Acme 回答 ${index + 1}`,
        platformId,
      ),
    ),
  });

  broker.completeAssessmentImmediately = true;
  const assessed = await jsonRequest(
    `/projects/${encodeURIComponent(monitored.projectToken)}/assessment`,
    ready.cookie,
    { method: "POST", body: {} },
  );
  expect(assessed.response.status).toBe(201);
  const assessmentTaskId = `assessment-${broker.assessmentTaskCount}`;
  broker.tasks.set(assessmentTaskId, {
    id: assessmentTaskId,
    status: "completed",
    output: [
      {
        role: "assistant",
        content: [
          { text: JSON.stringify(validAssessmentOutput(question, platformId)) },
        ],
      },
    ],
  });

  broker.completeForecastImmediately = true;
  const assessedPayload = assessed.body as Record<string, any>;
  const forecasted = await jsonRequest(
    `/projects/${encodeURIComponent(assessedPayload.projectToken)}/optimization-forecast`,
    ready.cookie,
    { method: "POST", body: {} },
  );
  expect(forecasted.response.status).toBe(201);
  const forecastedPayload = forecasted.body as Record<string, any>;
  return {
    cookie: ready.cookie,
    projectToken: forecastedPayload.projectToken as string,
    project: forecastedPayload.project as Record<string, any>,
    question,
    assessmentTaskId,
    forecastTaskId: `forecast-${broker.forecastTaskCount}`,
  };
}

function validServiceContractProfile(legalName = "Acme") {
  return {
    legalName,
    creditCode: "91440300MA5F12345X",
    address: "深圳市南山区科技园一号",
    signatoryName: "张三",
    signatoryTitle: "运营负责人",
    mobile: "13800138000",
    email: "contracts@example.com",
    authorized: true as const,
  };
}

async function advanceManualOrder(
  ready: Awaited<ReturnType<typeof createServiceReadyProject>>,
  status: GeoManualServiceOrderResponse["order"]["status"] = "payment_required",
) {
  const created = await jsonRequest(
    `/projects/${encodeURIComponent(ready.projectToken)}/services/contracts`,
    ready.cookie,
    {
      method: "POST",
      body: {
        profile: validServiceContractProfile(),
        contractCode: CONTRACT_AUTH_CODE,
      },
    },
  );
  expect(created.response.status).toBe(201);
  const createdPayload = created.body as Record<string, any>;
  manualOrderResponse = {
    ...manualOrderResponse,
    order: {
      ...manualOrderResponse.order,
      status,
      contractId: "manual-contract-001",
      signingUrl:
        status === "pending_admin"
          ? undefined
          : "https://sign.example.com/manual-contract-001",
      signedAt:
        status === "payment_required" ||
        status === "account_setup_required" ||
        status === "activation_required" ||
        status === "active"
          ? "2026-07-22T10:16:00.000Z"
          : undefined,
      provisioningReference:
        status === "activation_required" || status === "active"
          ? "purchase-reference-001"
          : undefined,
      updatedAt: "2026-07-22T10:16:00.000Z",
    },
  };
  const refreshed = await jsonRequest(
    `/projects/${encodeURIComponent(createdPayload.projectToken)}/services/contracts/status`,
    ready.cookie,
    { method: "POST", body: {} },
  );
  expect(refreshed.response.status).toBe(200);
  const payload = refreshed.body as Record<string, any>;
  return {
    ...ready,
    projectToken: payload.projectToken as string,
    project: payload.project as Record<string, any>,
  };
}

function monitorRecord(
  runIndex: number,
  answerText: string,
  platform: GeoMonitorPlatformId = "doubao",
) {
  return {
    recordId: `record-${runIndex}`,
    platform,
    runIndex,
    status: "completed" as const,
    answerText,
    media: [],
    sources: [
      { title: "Acme 官网", url: "https://acme.example/about" },
      { title: "检索参考", url: "https://search.example/result" },
    ],
  };
}

function validQuestionSet() {
  return buildValidQuestionSet();
}

function validAssessmentOutput(
  question: Pick<GeoQuestion, "id" | "category" | "question"> = {
    id: "product-scenario-01",
    category: "product_scenario",
    question: "Acme 的服务模块 1 主要解决哪些业务问题？",
  },
  platform: GeoMonitorPlatformId = "doubao",
) {
  const rankingMetricEligible = question.category !== "reputation";
  const indicator = () => ({
    rawValue: 0.5,
    measurementStatus: "measured",
    confidence: 0.8,
    calculationBasis: "由五次真实回答与知识库证据逐项对照计算。",
    evidenceRefs: [`${platform}/run-01`, "01_company_overview/overview.md"],
    limitations: [],
  });
  return {
    schemaVersion: 2,
    assessmentType: "question_baseline",
    question: {
      id: question.id,
      text: question.question,
      category: question.category,
      rankingMetricEligible,
    },
    sample: {
      selectedPlatforms: [platform],
      repeatPerPlatform: 5,
      expectedResponses: 5,
      successfulResponses: 5,
      failedResponses: 0,
    },
    dimensions: {
      semanticVisibility: {
        aiSearchVisibility: indicator(),
        webSearchSov: indicator(),
        multiPlatformCoverage: indicator(),
      },
      semanticCoherence: {
        corePropositionHitRate: indicator(),
        toneConsistency: indicator(),
      },
      semanticRichness: {
        questionStageCoverage: indicator(),
        semanticEntityRichness: indicator(),
        contentFormatDiversity: indicator(),
      },
      semanticAuthority: {
        authoritativeSourceRatio: indicator(),
        structuredDataCompleteness: indicator(),
        thirdPartyEndorsement: indicator(),
      },
      competitiveAdvantage: {
        firstMentionRate: indicator(),
        exclusiveSemanticSpace: indicator(),
      },
    },
    rankingDiagnostics: rankingMetricEligible
      ? {
          eligible: true,
          totalObservations: 5,
          rankedObservations: 5,
          unmentionedObservations: 0,
          averageRank: 2,
          firstPlaceRate: 0.5,
          top3Rate: 0.8,
          top5Rate: 1,
          competitorRankGap: 1,
          calculationBasis: "由五次回答中的自然排序结构提取，未包含舆情题。",
        }
      : {
          eligible: false,
          totalObservations: 0,
          rankedObservations: 0,
          unmentionedObservations: 0,
          averageRank: null,
          firstPlaceRate: null,
          top3Rate: null,
          top5Rate: null,
          competitorRankGap: null,
          calculationBasis: "美誉舆情问题不纳入排名指标计算。",
        },
    platformBreakdown: [
      {
        platform,
        responseCount: 5,
        successfulResponses: 5,
        brandMentionRate: 0.5,
        averageRank: 2,
        factAccuracy: 0.5,
        propositionHitRate: 0.5,
        sourceCount: 2,
        sentiment: "neutral",
        verdict: "品牌已被提及，但核心主张和证据密度仍需提升。",
        evidenceRefs: [`${platform}/run-01`],
      },
    ],
    knowledgeVsAnswers: [
      {
        id: "comparison-01",
        topic: "企业定位",
        verdict: "supported",
        platform,
        runIndex: 1,
        answerExcerpt: "Acme 面向科研团队提供设备。",
        kbClaimId: "company-positioning",
        kbClaimText: "Acme 面向科研团队提供专业设备。",
        kbEvidenceRefs: ["01_company_overview/overview.md"],
        explanation: "回答与知识库中的企业定位一致。",
        recommendedAction: "继续在权威页面统一该企业定位。",
        confidence: 0.9,
      },
    ],
    summary:
      "该问题下品牌已有基础可见度，但核心主张、权威引用和差异化表达仍有提升空间。",
    executiveSummary:
      "当前回答已形成基础认知，但核心事实和权威来源仍需加强；本月应补齐证据页面与问答内容，并在月底按同一口径复测。",
    dimensionNarratives: {
      semanticVisibility: {
        currentFinding: "五次回答能够识别企业及其主要服务方向。",
        nextAction: "补齐核心能力与权威证据之间的引用路径。",
      },
      semanticCoherence: {
        currentFinding: "核心主张在不同回答中的表达基本一致。",
        nextAction: "统一定位、能力边界与风险说明的表达口径。",
      },
      semanticRichness: {
        currentFinding: "回答已覆盖部分关键方面但采购信息仍不完整。",
        nextAction: "补齐场景、部署和采购核验类问答。",
      },
      semanticAuthority: {
        currentFinding: "重要判断已有部分来源支持但独立证据偏少。",
        nextAction: "建设可追溯事实页并拓展独立来源。",
      },
      competitiveAdvantage: {
        currentFinding: "部分已验证差异点能够被回答准确表达。",
        nextAction: "围绕可核验差异点建立统一对比语言。",
      },
    },
    priorityActions: [
      {
        priority: 1,
        dimension: "semanticAuthority",
        action: "补齐可被 AI 直接引用的官网事实页与权威来源链接。",
        expectedImpact: "提升回答中的权威引用比例。",
        evidenceRefs: [`${platform}/run-01`],
      },
    ],
    limitations: ["仅覆盖一个问题和一个平台。"],
  };
}

function validForecastOutput() {
  const indicator = (
    effectType: "direct_asset" | "observed_outcome",
    actionIds: Array<
      | "GEO_A1_entity_facts"
      | "GEO_A2_ai_visibility"
      | "GEO_A3_qa_assets"
      | "GEO_A4_positioning_language"
      | "GEO_A5_site_schema"
      | "GEO_A6_distribution_citations"
    >,
  ) => ({
    measurementStatus: "projectable" as const,
    gapClosureLow: 0.2,
    gapClosureHigh: 0.4,
    effectType,
    confidence: 0.7,
    actionIds,
    rationale: "知识库差距与当前基线支持建立可复测的条件提升区间。",
    dependencies: ["完成内容建设、真实发布、抓取收录与质量检查"],
    evidenceRefs: ["current-assessment.json#/assessment/priorityActions/0"],
    timeToSignalWeeks: 4,
    verificationMetric: "使用相同问题、平台与每平台五次回答重新测量",
  });
  const observed = (actionIds: Parameters<typeof indicator>[1]) =>
    indicator("observed_outcome", actionIds);
  const direct = (actionIds: Parameters<typeof indicator>[1]) =>
    indicator("direct_asset", actionIds);
  return {
    schemaVersion: 2,
    forecastType: "conditional_4_week",
    horizonWeeks: 4,
    scenario: {
      name: "full_execution",
      actionIds: [
        "GEO_A1_entity_facts",
        "GEO_A2_ai_visibility",
        "GEO_A3_qa_assets",
        "GEO_A4_positioning_language",
        "GEO_A5_site_schema",
        "GEO_A6_distribution_citations",
      ],
      assumptions: [
        "企业按计划完成全部事实核验与内容资产建设",
        "发布页面能够被正常抓取、收录并保持稳定访问",
        "第 2 周检查执行进度，第 4 周严格使用相同问题与平台复测",
      ],
      verificationWeeks: [2, 4],
    },
    dimensions: {
      semanticVisibility: {
        aiSearchVisibility: observed([
          "GEO_A2_ai_visibility",
          "GEO_A3_qa_assets",
        ]),
        webSearchSov: observed([
          "GEO_A2_ai_visibility",
          "GEO_A6_distribution_citations",
        ]),
        multiPlatformCoverage: observed([
          "GEO_A3_qa_assets",
          "GEO_A6_distribution_citations",
        ]),
      },
      semanticCoherence: {
        corePropositionHitRate: observed([
          "GEO_A3_qa_assets",
          "GEO_A4_positioning_language",
        ]),
        toneConsistency: direct(["GEO_A4_positioning_language"]),
      },
      semanticRichness: {
        questionStageCoverage: direct(["GEO_A3_qa_assets"]),
        semanticEntityRichness: direct([
          "GEO_A1_entity_facts",
          "GEO_A3_qa_assets",
        ]),
        contentFormatDiversity: direct(["GEO_A3_qa_assets"]),
      },
      semanticAuthority: {
        authoritativeSourceRatio: observed(["GEO_A6_distribution_citations"]),
        structuredDataCompleteness: direct(["GEO_A5_site_schema"]),
        thirdPartyEndorsement: observed(["GEO_A6_distribution_citations"]),
      },
      competitiveAdvantage: {
        firstMentionRate: observed([
          "GEO_A4_positioning_language",
          "GEO_A6_distribution_citations",
        ]),
        exclusiveSemanticSpace: observed([
          "GEO_A1_entity_facts",
          "GEO_A4_positioning_language",
        ]),
      },
    },
    roadmap: [
      {
        phase: 1,
        weeks: "第 1 周",
        title: "事实与定位修复",
        actions: ["核验企业实体、核心定位、术语与支撑证据"],
        verificationGate: "全部关键主张都能追溯到知识库中的有效证据",
      },
      {
        phase: 2,
        weeks: "第 2 周",
        title: "问题资产建设",
        actions: ["建设问题、场景、比较与常见问答内容资产"],
        verificationGate: "所有内容资产均通过事实核验与质量检查",
      },
      {
        phase: 3,
        weeks: "第 3 周",
        title: "分发与权威建设",
        actions: ["发布内容并持续检查抓取、收录与引用路径"],
        verificationGate: "关键页面能够访问且收录状态已有完整记录",
      },
      {
        phase: 4,
        weeks: "第 4 周",
        title: "同口径复测",
        actions: ["按照原问题、平台与次数重新执行监控"],
        verificationGate: "复测样本范围与当前评估基线保持完全一致",
      },
    ],
    summary:
      "在完整执行、成功发布收录并按相同范围复测的前提下，企业语义资产存在可验证的一个月条件提升空间。",
    executiveSummary:
      "当前已有稳定的基础认知，但证据和内容覆盖仍需加强；未来四周先补齐事实与问答资产，并在月底按同一口径复测。",
    dimensionNarratives: {
      semanticVisibility: {
        currentFinding: "当前回答已能识别企业及其主要服务方向。",
        nextAction: "补齐核心能力内容并建立持续分发路径。",
      },
      semanticCoherence: {
        currentFinding: "核心主张仍有少量边界不清的问题。",
        nextAction: "统一定位、能力边界和风险说明语言。",
      },
      semanticRichness: {
        currentFinding: "采购决策所需的部分关键问题尚未覆盖。",
        nextAction: "补齐场景、部署和采购核验类问答。",
      },
      semanticAuthority: {
        currentFinding: "重要判断已有部分来源支持但仍不充分。",
        nextAction: "建设可追溯事实页并拓展独立来源。",
      },
      competitiveAdvantage: {
        currentFinding: "可核验差异点尚未形成稳定的统一表达。",
        nextAction: "围绕真实差异点完善对比内容和证据。",
      },
    },
    limitations: [
      "该预测仅覆盖当前选择的单一问题。",
      "模型更新与第三方引用不受企业直接控制。",
      "全部预测区间必须经过相同监控范围复测确认。",
    ],
    claimGuardrails: {
      isGuarantee: false,
      planningAssumptionOnly: true,
      requiresSameScopeRemeasurement: true,
    },
  };
}

async function fixtureCandidateArchive() {
  const zip = new JSZip();
  const sectionTitles = [
    "企业与品牌",
    "团队与组织",
    "产品与服务",
    "技术与交付",
    "客户与行业",
    "服务与合作",
    "可信优势",
  ] as const;
  const topicCounts = [1, 1, 2, 2, 1, 1, 1] as const;
  const floors = [500, 500, 2_500, 1_000, 600, 600, 600] as const;
  const urls = sectionTitles.map(
    (_, index) => `https://acme.example/section-${index + 1}`,
  );
  const factDimensions = [
    "企业基础",
    "团队",
    "产品服务",
    "技术能力",
    "客户案例",
    "资质认证",
    "财务融资",
    "竞争信息",
    "市场信息",
    "品牌资产",
    "渠道",
    "公开意图",
    "公共情报",
  ] as const;
  zip.file(
    "00_brand_facts.md",
    factDimensions
      .map((title, index) => {
        const dimension = String(index + 1).padStart(2, "0");
        return `## D${dimension} ${title}\n\n${"可核验企业事实".repeat(8)}。[来源](${urls[index % urls.length]})`;
      })
      .join("\n\n"),
  );
  zip.file(
    "01_customer_draft.md",
    sectionTitles
      .map((title, sectionIndex) => {
        const topicCount = topicCounts[sectionIndex];
        const perTopic = Math.ceil(floors[sectionIndex] / topicCount) + 12;
        return [
          `## ${title}`,
          "",
          ...Array.from({ length: topicCount }, (_, topicIndex) =>
            [
              `### ${title}主题${topicIndex + 1}`,
              "",
              `${String.fromCodePoint(
                0x4e00 + sectionIndex * 8 + topicIndex,
              ).repeat(
                sectionIndex === 2 && topicIndex === 0 ? 1_900 : perTopic,
              )}[来源](${urls[sectionIndex]})`,
            ].join("\n"),
          ),
        ].join("\n");
      })
      .join("\n\n"),
  );
  zip.file(
    "02_run.json",
    JSON.stringify({
      schemaVersion: 2,
      company: {
        name: "Acme",
        officialWebsite: "https://acme.example/",
        industryCluster: "C3",
      },
      sources: urls.map((url, index) => ({
        title: `Acme 公开来源 ${index + 1}`,
        kind: "official_web",
        status: "read",
        url,
      })),
      queries: ["Acme 产品"],
      stopReason: "coverage_complete",
      contentFloorExceptions: [],
      logoAcquisition: {
        status: "unavailable",
        attemptedPageUrls: urls.slice(0, 2),
        reason: "两个第一方页面均未提供可解码的官方 Logo 原始资源。",
      },
      assets: [],
    }),
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

async function fixtureLegacyCandidateArchive() {
  const zip = new JSZip();
  const source = "https://acme.example";
  const facts = [
    "# Acme 品牌事实",
    "",
    "## D01 企业基础",
    `Acme 提供企业技术服务。[来源](${source})`,
    "",
    "## D02 团队",
    "核心团队完整名单尚未发现公开资料。[待核验]",
    "",
    "## D03 产品服务",
    `Acme 提供面向企业客户的平台产品与交付服务。[来源](${source})`,
    "",
    "## D04 技术能力",
    `官网介绍了平台的接口集成与交付能力。[企业主张](${source})`,
    "",
    "## D05 客户案例",
    "公开案例的完整客户名单尚待核验。[待核验]",
    "",
    "## D06 资质认证",
    "公开资质信息尚待核验。[待核验]",
    "",
    "## D07 财务融资",
    "公开财务与融资信息尚待核验。[待核验]",
    "",
    "## D08 竞争信息",
    "未发布无证据的竞品优劣判断。[待核验]",
    "",
    "## D09 市场信息",
    `官网将企业客户列为主要服务对象。[来源](${source})`,
    "",
    "## D10 品牌资产",
    `企业以 Acme 名称对外提供服务。[来源](${source})`,
    "",
    "## D11 渠道",
    `官网提供产品、文档与联系入口。[来源](${source})`,
    "",
    "## D12 公开意图",
    `官网公开提供企业合作入口。[来源](${source})`,
    "",
    "## D13 公共情报",
    "本次公开资料未发现需要单列的权威监管信息。[待核验]",
  ].join("\n");
  const customer = [
    "# Acme 客户知识稿",
    "",
    "## 企业与品牌",
    "### 企业定位",
    `Acme 面向企业客户提供平台产品与技术服务。[来源](${source})`,
    "",
    "## 团队与组织",
    "### 公开团队信息",
    "核心团队完整名单尚未发现公开资料。[待核验]",
    "",
    "## 产品与服务",
    "### 平台产品",
    `Acme 提供平台产品、接口集成与配套交付服务。[来源](${source})`,
    "",
    "## 技术与交付",
    "### 技术能力",
    `官网称平台支持接口集成，并提供面向企业场景的交付能力。[企业主张](${source})`,
    "",
    "## 客户与行业",
    "### 服务对象",
    `官网将企业客户列为主要服务对象。[来源](${source})`,
    "",
    "## 服务与合作",
    "### 联系渠道",
    `企业官网提供产品、文档、联系与合作入口。[来源](${source})`,
    "",
    "## 可信优势",
    "### 已公开能力",
    `官网公开展示了产品、技术说明和企业合作渠道。[来源](${source})`,
  ].join("\n");
  zip.file("00_brand_facts.md", facts);
  zip.file("01_customer_draft.md", customer);
  zip.file(
    "02_run.json",
    JSON.stringify({
      schemaVersion: 1,
      company: {
        name: "Acme",
        officialWebsite: source,
        industryCluster: "C3",
      },
      sources: [
        {
          title: "Acme 官网",
          kind: "official_web",
          status: "read",
          url: source,
        },
      ],
      queries: [],
      assets: [],
    }),
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

async function fixtureArchive() {
  const zip = new JSZip();
  const root = zip.folder("Acme_knowledge_base")!;
  const packageDocuments: Array<Record<string, unknown>> = [];
  const evidenceDocuments: string[] = [];
  const addMarkdown = (
    entryPath: string,
    content: string,
    metadata: Record<string, unknown>,
  ) => {
    root.file(entryPath, content);
    packageDocuments.push({
      path: entryPath,
      customerVisible: false,
      ...metadata,
    });
    if (metadata.customerVisible !== true) evidenceDocuments.push(content);
  };
  addMarkdown(
    "README.md",
    "# Acme\n\nAcme 面向科研团队提供可核验的精密设备与技术支持。",
    {
      id: "doc-readme",
      kind: "report",
      title: "知识库说明",
    },
  );
  addMarkdown("00_knowledge_tree.md", "# 知识树\n\n已完成七分支。", {
    id: "doc-tree",
    kind: "index",
    title: "知识树",
  });
  root.file(
    "00_completeness.json",
    JSON.stringify({
      counts: {
        totalLeaves: 46,
        verifiedFirstParty: 24,
        verifiedAuthoritative: 5,
        supportedThirdParty: 3,
        inferred: 4,
        needsVerification: 8,
        notApplicable: 2,
      },
      acquisition: {
        officialPages: { completed: 18, total: 18 },
        images: { completed: 1, total: 1 },
        documents: { completed: 0, total: 0 },
        webQueries: { completed: 2, total: 2 },
      },
      gaps: ["部分团队与售后细节仍需企业核验"],
      evaluatedAt: "2026-07-28T10:00:00.000Z",
    }),
  );
  addMarkdown(
    "00_crawl_coverage_report.md",
    "# 抓取报告\n\n发现页面：18\n\n- https://example.com/acme/about",
    {
      id: "doc-crawl",
      kind: "report",
      title: "官网抓取覆盖报告",
    },
  );
  addMarkdown(
    "00_web_intelligence_report.md",
    "# 情报报告\n\n- https://example.org/registry/acme",
    {
      id: "doc-web",
      kind: "report",
      title: "全网企业情报报告",
    },
  );
  addMarkdown(
    "00_source_index.md",
    "# 来源\n\n- https://example.com/acme/about\n- https://example.org/registry/acme",
    {
      id: "doc-sources",
      kind: "index",
      title: "来源索引",
    },
  );
  const statuses = [
    "verified_first_party",
    "needs_verification",
    "verified_first_party",
    "verified_authoritative",
    "supported_third_party",
    "inferred",
    "not_applicable",
    ...Array(22).fill("verified_first_party"),
    ...Array(4).fill("verified_authoritative"),
    ...Array(2).fill("supported_third_party"),
    ...Array(3).fill("inferred"),
    ...Array(7).fill("needs_verification"),
    "not_applicable",
  ];
  const branches = [
    "01_company_overview",
    "02_team",
    "03_products/device",
    "04_technology",
    "05_manufacturing",
    "06_industries/research",
    "07_service",
    "08_competitive_advantages",
  ];
  const overviewGroups = new Set<string>();
  const productDocumentId = "doc-leaf-003";
  const assetId = "asset-001";
  statuses.forEach((status, index) => {
    const branch = branches[index % branches.length];
    const branchId = branch.split("/")[0];
    const displayBranch =
      branchId === "04_technology" || branchId === "05_manufacturing"
        ? "core-capabilities"
        : branchId;
    const kind = overviewGroups.has(displayBranch) ? "leaf" : "overview";
    overviewGroups.add(displayBranch);
    const filename =
      index === 0
        ? "profile.md"
        : `leaf-${String(index + 1).padStart(2, "0")}.md`;
    const documentId = `doc-leaf-${String(index + 1).padStart(3, "0")}`;
    addMarkdown(
      `${branch}/${filename}`,
      [
        `# 知识叶节点 ${index + 1}`,
        "",
        `> 最后更新: 2026-07-28 | 状态: ${status} | 来源: 企业官网`,
        "",
        "## 核心内容",
        "",
        String.fromCodePoint(0x4e00 + index).repeat(180),
        "",
        "## 原始来源",
        "",
        "https://example.com/acme/about",
      ].join("\n"),
      {
        id: documentId,
        kind,
        title: `知识叶节点 ${index + 1}`,
        branchId,
        order: index,
        evidenceStatus: status,
        sourceIds: ["source-official"],
        assetIds: documentId === productDocumentId ? [assetId] : [],
        customerVisible: true,
      },
    );
  });
  const imagePath = "09_media_assets/product_images/device.png";
  const imageBytes = fixturePng();
  root.file(imagePath, imageBytes);
  root.file(
    "00_package_manifest.json",
    JSON.stringify({
      schemaVersion: 1,
      profile: "website-lead-v1",
      documents: packageDocuments,
      assets: [
        {
          id: assetId,
          path: imagePath,
          sha256: createHash("sha256").update(imageBytes).digest("hex"),
          mimeType: "image/png",
          bytes: imageBytes.byteLength,
          width: 1,
          height: 1,
          caption: "Acme 精密设备",
          alt: "Acme 精密设备产品图",
          branchId: "03_products",
          documentIds: [productDocumentId],
          sourcePageUrl: "https://example.com/acme/products",
          ownership: "first_party",
        },
      ],
      counts: {
        totalFiles: packageDocuments.length + 3,
        customerVisibleCharacters: statuses.length * 180,
        evidenceCharacters: evidenceDocuments.reduce(
          (total, markdown) => total + fixtureEvidenceCharacterCount(markdown),
          0,
        ),
        packagedImages: 1,
      },
      imageSelection: {
        eligibleFirstPartyImages: 1,
        shortfallReason:
          "该测试企业仅提供一张经过验证且适合展示的第一方产品图片。",
      },
    }),
  );
  return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
}
