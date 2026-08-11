import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { GeoQuestionSchema, type GeoQuestion } from "./schemas";

const STORE_SCHEMA_VERSION = 1 as const;
const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_TEMPORARY_FILE_AGE_MS = 60 * 60 * 1000;
const ORPHAN_FILE_MARKER_GRACE_MS = 5 * 60 * 1000;
const VERSION_WIDTH = 12;

const StoredAttachmentSchema = z
  .object({
    fileId: z.string().min(1).max(200),
    filename: z.string().min(1).max(512),
    temporary: z.boolean(),
  })
  .strict();

const StoredErrorSchema = z
  .object({
    code: z.string().min(1).max(120),
    message: z.string().min(1).max(500),
    status: z.number().int().min(400).max(599),
    retryable: z.boolean(),
  })
  .strict();

const ActiveLeaseSchema = z
  .object({
    token: z.string().uuid(),
    fence: z.number().int().nonnegative(),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

const KnowledgeBaseArtifactSchema = z
  .object({
    fileId: z.string().min(1).max(200),
    filename: z.string().min(1).max(512),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    packageManifestSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();

const CleanupTargetSchema = z
  .object({
    // Accepted only for backward compatibility with cleanup tombstones written
    // before upstream tasks became permanent evidence. The transform strips it
    // so no cleanup callback can request task deletion.
    taskId: z.string().min(1).max(200).optional(),
    temporaryFileIds: z.array(z.string().min(1).max(200)).max(26).default([]),
  })
  .strict()
  .transform(({ temporaryFileIds }) => ({ temporaryFileIds }));

const CustomQuestionValidationRecordSchema = z
  .object({
    schemaVersion: z.literal(STORE_SCHEMA_VERSION),
    key: z.string().regex(/^[a-f0-9]{64}$/),
    storeVersion: z.number().int().nonnegative(),
    commitId: z.string().uuid(),
    fencingToken: z.number().int().nonnegative(),
    activeLease: ActiveLeaseSchema.optional(),
    projectId: z.string().min(1).max(200),
    ownerSessionHash: z.string().regex(/^[a-f0-9]{64}$/),
    clientRequestId: z.string().uuid(),
    requestHash: z.string().regex(/^[a-f0-9]{64}$/),
    question: z.string().min(1).max(240),
    questionHash: z.string().regex(/^[a-f0-9]{64}$/),
    companyName: z.string().min(1).max(200),
    knowledgeBaseTaskId: z.string().min(1).max(200),
    knowledgeBaseValidationProfile: z.literal("website-lead-v1").optional(),
    knowledgeBaseArtifact: KnowledgeBaseArtifactSchema,
    state: z.enum([
      "reserved",
      "prepared",
      "submitted",
      "completed",
      "rejected",
      "failed",
    ]),
    archiveAttachment: StoredAttachmentSchema.optional(),
    skillAttachment: StoredAttachmentSchema.optional(),
    promptInputAttachment: StoredAttachmentSchema.optional(),
    archiveStagingAttachment: StoredAttachmentSchema.optional(),
    skillStagingAttachment: StoredAttachmentSchema.optional(),
    promptInputStagingAttachment: StoredAttachmentSchema.optional(),
    orphanedTemporaryFileIds: z
      .array(z.string().min(1).max(200))
      .max(20)
      .default([]),
    attachmentRebuildCount: z.number().int().min(0).max(10).default(0),
    formatRetryCount: z.number().int().min(0).max(1).default(0),
    taskId: z.string().min(1).max(200).optional(),
    priorTaskIds: z
      .array(z.string().min(1).max(200))
      .max(1)
      .default([]),
    result: GeoQuestionSchema.optional(),
    completionMode: z.literal("existing_recommended_question").optional(),
    error: StoredErrorSchema.optional(),
    supersededByClientRequestId: z.string().uuid().optional(),
    supersededAt: z.string().datetime({ offset: true }).optional(),
    unknownStatusCount: z.number().int().min(0).max(100).default(0),
    firstUnknownStatusAt: z.string().datetime({ offset: true }).optional(),
    transientErrorCount: z.number().int().min(0).max(100).default(0),
    firstTransientErrorAt: z.string().datetime({ offset: true }).optional(),
    lastObservedStatus: z.string().max(100).optional(),
    lastTransientError: z.string().max(500).optional(),
    cleanupCompleted: z.boolean().default(false),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

const ProjectSlotSchema = z
  .object({
    schemaVersion: z.literal(STORE_SCHEMA_VERSION),
    projectHash: z.string().regex(/^[a-f0-9]{64}$/),
    storeVersion: z.number().int().nonnegative(),
    commitId: z.string().uuid(),
    active: z
      .object({
        key: z.string().regex(/^[a-f0-9]{64}$/),
        clientRequestId: z.string().uuid(),
        expiresAt: z.string().datetime({ offset: true }),
      })
      .strict()
      .optional(),
    deletionFence: z
      .object({
        token: z.string().uuid(),
        createdAt: z.string().datetime({ offset: true }),
      })
      .strict()
      .optional(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.active && value.deletionFence) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "project slot cannot be active while deletion is fenced",
      });
    }
  });

const TombstoneSchema = z
  .object({
    schemaVersion: z.literal(STORE_SCHEMA_VERSION),
    key: z.string().regex(/^[a-f0-9]{64}$/),
    deletedAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
    projectHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    cleanupTarget: CleanupTargetSchema.optional(),
  })
  .strict();

const CleanupCompleteMarkerSchema = z
  .object({
    schemaVersion: z.literal(STORE_SCHEMA_VERSION),
    key: z.string().regex(/^[a-f0-9]{64}$/),
    completedAt: z.string().datetime({ offset: true }),
  })
  .strict();

const OrphanFileMarkerSchema = z
  .object({
    schemaVersion: z.literal(STORE_SCHEMA_VERSION),
    recordKey: z.string().regex(/^[a-f0-9]{64}$/),
    fileId: z.string().min(1).max(200),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type GeoCustomQuestionValidationRecord = z.infer<
  typeof CustomQuestionValidationRecordSchema
>;

export type GeoCustomQuestionValidationLease = {
  key: string;
  token: string;
  fence: number;
  expiresAt: string;
};

export type GeoCustomQuestionValidationReservation = {
  projectId: string;
  ownerSessionHash: string;
  clientRequestId: string;
  requestHash: string;
  question: string;
  questionHash: string;
  companyName: string;
  knowledgeBaseTaskId: string;
  knowledgeBaseValidationProfile?: "website-lead-v1";
  knowledgeBaseArtifact: {
    fileId: string;
    filename: string;
    sha256?: string;
    packageManifestSha256?: string;
  };
  expiresAt: string;
};

export type GeoCustomQuestionActiveOperation = {
  clientRequestId: string;
  question: string;
  state: GeoCustomQuestionValidationRecord["state"];
  expiresAt: string;
};

export type GeoCustomQuestionValidationGarbageCollectionResult = {
  scanned: number;
  deleted: number;
  retained: number;
  tombstonesDeleted: number;
};

export type GeoCustomQuestionValidationCleanupTarget = z.infer<
  typeof CleanupTargetSchema
>;

export type GeoProjectDeletionFenceOptions = {
  force?: boolean;
};

export type GeoProjectDeletionTargets = {
  taskIds: string[];
  temporaryFileIds: string[];
};

export interface GeoCustomQuestionValidationStore {
  assertReady(): Promise<void>;
  persistenceIdentity(): Promise<string>;
  reserve(
    input: GeoCustomQuestionValidationReservation,
  ): Promise<{ record: GeoCustomQuestionValidationRecord; created: boolean }>;
  reserveCompletedReceipt(
    input: GeoCustomQuestionValidationReservation,
    result: GeoQuestion,
  ): Promise<{ record: GeoCustomQuestionValidationRecord; created: boolean }>;
  get(
    projectId: string,
    clientRequestId: string,
  ): Promise<GeoCustomQuestionValidationRecord | undefined>;
  getActive(
    projectId: string,
  ): Promise<GeoCustomQuestionValidationRecord | undefined>;
  findReplayableInvalid(
    projectId: string,
    ownerSessionHash: string,
    questionHash: string,
  ): Promise<GeoCustomQuestionValidationRecord | undefined>;
  ensureActive(
    projectId: string,
    clientRequestId: string,
  ): Promise<GeoCustomQuestionValidationRecord>;
  fenceProjectDeletion(
    projectId: string,
    options?: GeoProjectDeletionFenceOptions,
  ): Promise<void>;
  isProjectDeletionFenced(projectId: string): Promise<boolean>;
  getProjectDeletionTargets(
    projectId: string,
  ): Promise<GeoProjectDeletionTargets>;
  purgeProjectRecords(projectId: string): Promise<number>;
  acknowledgeTerminal(
    projectId: string,
    clientRequestId: string,
    ownerSessionHash: string,
  ): Promise<GeoCustomQuestionValidationRecord>;
  retainTemporaryFileForCleanup(
    projectId: string,
    clientRequestId: string,
    fileId: string,
  ): Promise<GeoCustomQuestionValidationRecord>;
  listActive(limit?: number): Promise<GeoCustomQuestionValidationRecord[]>;
  tryAcquireLease(
    projectId: string,
    clientRequestId: string,
    leaseMs?: number,
  ): Promise<GeoCustomQuestionValidationLease | undefined>;
  renewLease(
    lease: GeoCustomQuestionValidationLease,
    leaseMs?: number,
  ): Promise<GeoCustomQuestionValidationLease>;
  update(
    record: GeoCustomQuestionValidationRecord,
    lease: GeoCustomQuestionValidationLease,
  ): Promise<GeoCustomQuestionValidationRecord>;
  releaseLease(lease: GeoCustomQuestionValidationLease): Promise<void>;
  collectGarbage(input: {
    now?: Date;
    cleanup: (
      target: GeoCustomQuestionValidationCleanupTarget,
    ) => Promise<void>;
    tombstoneTtlMs?: number;
  }): Promise<GeoCustomQuestionValidationGarbageCollectionResult>;
}

type StoreTestHooks = {
  now?: () => number;
  afterInitialRecordCommit?: (
    record: GeoCustomQuestionValidationRecord,
  ) => Promise<void> | void;
  beforeDeleteRecordVersion?: (target: string) => Promise<void> | void;
  beforeRecordCommit?: (input: {
    operation:
      | "acquire"
      | "renew"
      | "update"
      | "release"
      | "retain"
      | "supersede"
      | "gc";
    current: GeoCustomQuestionValidationRecord;
    next: GeoCustomQuestionValidationRecord;
  }) => Promise<void> | void;
};

type FileStoreSecurityOptions = {
  requireSecurePermissions?: boolean;
};

function cloneRecord(record: GeoCustomQuestionValidationRecord) {
  return structuredClone(record);
}

function recordKey(projectId: string, clientRequestId: string) {
  return crypto
    .createHash("sha256")
    .update(`${projectId}\n${clientRequestId}`, "utf8")
    .digest("hex");
}

function projectHash(projectId: string) {
  return crypto.createHash("sha256").update(projectId, "utf8").digest("hex");
}

function parseRecord(value: unknown) {
  return CustomQuestionValidationRecordSchema.parse(value);
}

function isTerminal(record: GeoCustomQuestionValidationRecord) {
  return ["completed", "rejected", "failed"].includes(record.state);
}

function compareRecoveryCandidates(
  left: GeoCustomQuestionValidationRecord,
  right: GeoCustomQuestionValidationRecord,
) {
  return (
    Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
    left.key.localeCompare(right.key)
  );
}

function isRecoverableNonterminal(
  record: GeoCustomQuestionValidationRecord,
  nowMs: number,
) {
  return !isTerminal(record) && Date.parse(record.expiresAt) > nowMs;
}

function isPristineReservationLoser(record: GeoCustomQuestionValidationRecord) {
  return (
    record.state === "reserved" &&
    record.storeVersion === 0 &&
    record.fencingToken === 0 &&
    !record.activeLease &&
    !record.archiveAttachment &&
    !record.skillAttachment &&
    !record.promptInputAttachment &&
    !record.archiveStagingAttachment &&
    !record.skillStagingAttachment &&
    !record.promptInputStagingAttachment &&
    record.orphanedTemporaryFileIds.length === 0 &&
    record.attachmentRebuildCount === 0 &&
    record.formatRetryCount === 0 &&
    !record.taskId &&
    record.priorTaskIds.length === 0 &&
    !record.result &&
    !record.error &&
    record.unknownStatusCount === 0 &&
    !record.firstUnknownStatusAt &&
    record.transientErrorCount === 0 &&
    !record.firstTransientErrorAt &&
    !record.lastObservedStatus &&
    !record.lastTransientError &&
    !record.cleanupCompleted
  );
}

function supersededReservation(
  current: GeoCustomQuestionValidationRecord,
  winnerClientRequestId: string,
  nowMs: number,
) {
  const now = new Date(nowMs).toISOString();
  return parseRecord({
    ...current,
    storeVersion: current.storeVersion + 1,
    commitId: crypto.randomUUID(),
    state: "failed",
    error: {
      code: "CUSTOM_QUESTION_RESERVATION_SUPERSEDED",
      message: "该问题验证请求未获得项目执行权，已由当前权威请求替代",
      status: 409,
      retryable: false,
    },
    supersededByClientRequestId: winnerClientRequestId,
    supersededAt: now,
    cleanupCompleted: true,
    updatedAt: now,
  });
}

function cleanupTargetFromRecord(
  record: GeoCustomQuestionValidationRecord,
): GeoCustomQuestionValidationCleanupTarget {
  return CleanupTargetSchema.parse({
    temporaryFileIds: Array.from(
      new Set([
        ...record.orphanedTemporaryFileIds,
        ...(record.skillAttachment?.temporary
          ? [record.skillAttachment.fileId]
          : []),
        ...(record.promptInputAttachment?.temporary
          ? [record.promptInputAttachment.fileId]
          : []),
        ...(record.archiveAttachment?.temporary
          ? [record.archiveAttachment.fileId]
          : []),
        ...(record.skillStagingAttachment?.temporary
          ? [record.skillStagingAttachment.fileId]
          : []),
        ...(record.promptInputStagingAttachment?.temporary
          ? [record.promptInputStagingAttachment.fileId]
          : []),
        ...(record.archiveStagingAttachment?.temporary
          ? [record.archiveStagingAttachment.fileId]
          : []),
      ]),
    ),
  });
}

function projectDeletionTargetsFromRecords(
  records: GeoCustomQuestionValidationRecord[],
): GeoProjectDeletionTargets {
  return {
    taskIds: Array.from(
      new Set(
        records.flatMap((record) => [
          ...record.priorTaskIds,
          ...(record.taskId ? [record.taskId] : []),
        ]),
      ),
    ),
    temporaryFileIds: Array.from(
      new Set(
        records.flatMap(
          (record) => cleanupTargetFromRecord(record).temporaryFileIds,
        ),
      ),
    ),
  };
}

function initialRecord(
  input: GeoCustomQuestionValidationReservation,
  nowMs: number,
): GeoCustomQuestionValidationRecord {
  const now = new Date(nowMs).toISOString();
  return parseRecord({
    schemaVersion: STORE_SCHEMA_VERSION,
    key: recordKey(input.projectId, input.clientRequestId),
    storeVersion: 0,
    commitId: crypto.randomUUID(),
    fencingToken: 0,
    ...input,
    state: "reserved",
    orphanedTemporaryFileIds: [],
    attachmentRebuildCount: 0,
    formatRetryCount: 0,
    priorTaskIds: [],
    unknownStatusCount: 0,
    transientErrorCount: 0,
    cleanupCompleted: false,
    createdAt: now,
    updatedAt: now,
  });
}

function initialCompletedReceipt(
  input: GeoCustomQuestionValidationReservation,
  result: GeoQuestion,
  nowMs: number,
): GeoCustomQuestionValidationRecord {
  return parseRecord({
    ...initialRecord(input, nowMs),
    state: "completed",
    result: GeoQuestionSchema.parse(result),
    completionMode: "existing_recommended_question",
    cleanupCompleted: true,
  });
}

function assertReservationMatches(
  record: GeoCustomQuestionValidationRecord,
  input: GeoCustomQuestionValidationReservation,
) {
  if (
    record.projectId !== input.projectId ||
    record.clientRequestId !== input.clientRequestId ||
    record.ownerSessionHash !== input.ownerSessionHash ||
    record.requestHash !== input.requestHash ||
    record.questionHash !== input.questionHash ||
    record.question !== input.question ||
    record.companyName !== input.companyName ||
    record.knowledgeBaseTaskId !== input.knowledgeBaseTaskId ||
    record.knowledgeBaseArtifact.fileId !== input.knowledgeBaseArtifact.fileId
  ) {
    throw new GeoCustomQuestionValidationStoreError(
      "IDEMPOTENCY_CONFLICT",
      "该 clientRequestId 已用于不同的自定义问题验证请求",
    );
  }
}

function assertCompletedReceiptMatches(
  record: GeoCustomQuestionValidationRecord,
  input: GeoCustomQuestionValidationReservation,
  result: GeoQuestion,
) {
  assertReservationMatches(record, input);
  const expectedResult = GeoQuestionSchema.parse(result);
  if (
    record.state !== "completed" ||
    record.completionMode !== "existing_recommended_question" ||
    !record.result ||
    JSON.stringify(record.result) !== JSON.stringify(expectedResult)
  ) {
    throw new GeoCustomQuestionValidationStoreError(
      "IDEMPOTENCY_CONFLICT",
      "该 clientRequestId 已用于不同的自定义问题验证请求",
    );
  }
}

export class GeoCustomQuestionValidationStoreError extends Error {
  constructor(
    public readonly code:
      | "IDEMPOTENCY_CONFLICT"
      | "ACTIVE_RESERVATION_CONFLICT"
      | "RESERVATION_EXPIRED"
      | "RESERVATION_OWNER_MISMATCH"
      | "RESERVATION_NOT_TERMINAL"
      | "PROJECT_DELETION_FENCED"
      | "PROJECT_DELETION_BLOCKED"
      | "LEASE_LOST"
      | "STORE_CORRUPT",
    message: string,
    public readonly activeOperation?: GeoCustomQuestionActiveOperation,
  ) {
    super(message);
    this.name = "GeoCustomQuestionValidationStoreError";
  }
}

function activeOperation(
  record: GeoCustomQuestionValidationRecord,
): GeoCustomQuestionActiveOperation {
  return {
    clientRequestId: record.clientRequestId,
    question: record.question,
    state: record.state,
    expiresAt: record.expiresAt,
  };
}

function assertLeaseOwner(
  record: GeoCustomQuestionValidationRecord,
  lease: GeoCustomQuestionValidationLease,
  nowMs: number,
) {
  if (
    record.activeLease?.token !== lease.token ||
    record.activeLease.fence !== lease.fence ||
    Date.parse(record.activeLease.expiresAt) <= nowMs
  ) {
    throw new GeoCustomQuestionValidationStoreError(
      "LEASE_LOST",
      "自定义问题验证租约已失效",
    );
  }
}

function storedLease(lease: GeoCustomQuestionValidationLease) {
  return {
    token: lease.token,
    fence: lease.fence,
    expiresAt: lease.expiresAt,
  };
}

function nextRecord(
  current: GeoCustomQuestionValidationRecord,
  value: GeoCustomQuestionValidationRecord,
  nowMs: number,
) {
  return parseRecord({
    ...value,
    key: current.key,
    projectId: current.projectId,
    clientRequestId: current.clientRequestId,
    storeVersion: current.storeVersion + 1,
    commitId: crypto.randomUUID(),
    fencingToken: current.fencingToken,
    activeLease: current.activeLease,
    createdAt: current.createdAt,
    updatedAt: new Date(nowMs).toISOString(),
  });
}

function cancelledForProjectDeletion(
  current: GeoCustomQuestionValidationRecord,
  nowMs: number,
) {
  return parseRecord({
    ...current,
    storeVersion: current.storeVersion + 1,
    commitId: crypto.randomUUID(),
    fencingToken: current.fencingToken + 1,
    activeLease: undefined,
    state: "failed",
    result: undefined,
    completionMode: undefined,
    error: {
      code: "PROJECT_DELETED",
      message: "项目已确认删除，自定义问题验证已终止",
      status: 410,
      retryable: false,
    },
    updatedAt: new Date(nowMs).toISOString(),
  });
}

export class MemoryGeoCustomQuestionValidationStore
  implements GeoCustomQuestionValidationStore
{
  private readonly records = new Map<
    string,
    GeoCustomQuestionValidationRecord
  >();
  private readonly activeByProject = new Map<string, string>();
  private readonly deletionFences = new Set<string>();
  private readonly tombstones = new Map<
    string,
    {
      projectId?: string;
      expiresAt: number;
      cleanupTarget?: GeoCustomQuestionValidationCleanupTarget;
      cleanupCompleted: boolean;
    }
  >();
  private readonly identity = crypto.randomUUID();

  constructor(private readonly hooks: StoreTestHooks = {}) {}

  private now() {
    return this.hooks.now?.() ?? Date.now();
  }

  private async supersedePristineRecord(
    key: string,
    winnerClientRequestId: string,
  ) {
    const current = this.records.get(key);
    if (!current || !isPristineReservationLoser(current)) return current;
    const next = supersededReservation(
      current,
      winnerClientRequestId,
      this.now(),
    );
    await this.hooks.beforeRecordCommit?.({
      operation: "supersede",
      current: cloneRecord(current),
      next: cloneRecord(next),
    });
    if (this.deletionFences.has(current.projectId)) return undefined;
    if (this.records.get(key)?.commitId !== current.commitId) {
      return this.records.get(key);
    }
    this.records.set(key, next);
    if (this.activeByProject.get(current.projectId) === key) {
      this.activeByProject.delete(current.projectId);
    }
    return next;
  }

  private async supersedePristineProjectLosers(
    projectId: string,
    winner: GeoCustomQuestionValidationRecord,
  ) {
    const losers = Array.from(this.records.values())
      .filter(
        (record) => record.projectId === projectId && record.key !== winner.key,
      )
      .sort(compareRecoveryCandidates);
    for (const loser of losers) {
      await this.supersedePristineRecord(loser.key, winner.clientRequestId);
    }
  }

  async assertReady() {}

  async persistenceIdentity() {
    return this.identity;
  }

  async isProjectDeletionFenced(projectId: string) {
    return this.deletionFences.has(projectId);
  }

  async getProjectDeletionTargets(projectId: string) {
    const recordTargets = projectDeletionTargetsFromRecords(
      Array.from(this.records.values()).filter(
        (record) => record.projectId === projectId,
      ),
    );
    const tombstoneFileIds = Array.from(this.tombstones.values()).flatMap(
      (tombstone) =>
        tombstone.projectId === projectId &&
        !tombstone.cleanupCompleted &&
        tombstone.cleanupTarget
          ? tombstone.cleanupTarget.temporaryFileIds
          : [],
    );
    return {
      taskIds: recordTargets.taskIds,
      temporaryFileIds: Array.from(
        new Set([...recordTargets.temporaryFileIds, ...tombstoneFileIds]),
      ),
    };
  }

  async purgeProjectRecords(projectId: string) {
    if (!this.deletionFences.has(projectId)) {
      throw new GeoCustomQuestionValidationStoreError(
        "STORE_CORRUPT",
        "项目尚未建立删除栅栏，不能清除验证记录",
      );
    }
    const keys = Array.from(this.records.values())
      .filter((record) => record.projectId === projectId)
      .map((record) => record.key);
    for (const key of keys) {
      this.records.delete(key);
    }
    for (const [key, tombstone] of Array.from(this.tombstones.entries())) {
      if (tombstone.projectId !== projectId) continue;
      this.tombstones.delete(key);
    }
    this.activeByProject.delete(projectId);
    return keys.length;
  }

  async reserve(input: GeoCustomQuestionValidationReservation) {
    if (this.deletionFences.has(input.projectId)) {
      throw this.projectDeletionFenced();
    }
    const now = this.now();
    const key = recordKey(input.projectId, input.clientRequestId);
    const tombstone = this.tombstones.get(key);
    if (tombstone) {
      throw new GeoCustomQuestionValidationStoreError(
        "RESERVATION_EXPIRED",
        "该自定义问题验证请求已过期，请刷新后重新提交",
      );
    }

    let record = this.records.get(key);
    const created = !record;
    if (!record) {
      record = initialRecord(input, now);
      this.records.set(key, record);
      await this.hooks.afterInitialRecordCommit?.(cloneRecord(record));
    } else {
      assertReservationMatches(record, input);
    }
    if (isTerminal(record)) {
      if (this.deletionFences.has(input.projectId)) {
        throw this.projectDeletionFenced();
      }
      return { record: cloneRecord(record), created };
    }
    if (this.deletionFences.has(input.projectId)) {
      throw this.projectDeletionFenced();
    }

    const activeKey = this.activeByProject.get(input.projectId);
    if (activeKey && activeKey !== key) {
      const active = this.records.get(activeKey);
      if (active && !isTerminal(active)) {
        await this.supersedePristineRecord(key, active.clientRequestId);
        if (Date.parse(active.expiresAt) <= now) {
          throw new GeoCustomQuestionValidationStoreError(
            "RESERVATION_EXPIRED",
            "项目中已有过期验证正在安全清理，请稍后重试",
            activeOperation(active),
          );
        }
        throw new GeoCustomQuestionValidationStoreError(
          "ACTIVE_RESERVATION_CONFLICT",
          "当前项目已有另一个问题正在验证",
          activeOperation(active),
        );
      }
    }
    this.activeByProject.set(input.projectId, key);
    return { record: cloneRecord(record), created };
  }

  async reserveCompletedReceipt(
    input: GeoCustomQuestionValidationReservation,
    result: GeoQuestion,
  ) {
    if (this.deletionFences.has(input.projectId)) {
      throw this.projectDeletionFenced();
    }
    const now = this.now();
    const key = recordKey(input.projectId, input.clientRequestId);
    const tombstone = this.tombstones.get(key);
    if (tombstone) {
      throw new GeoCustomQuestionValidationStoreError(
        "RESERVATION_EXPIRED",
        "该自定义问题验证请求已过期，请刷新后重新提交",
      );
    }

    const existing = this.records.get(key);
    if (existing) {
      if (this.deletionFences.has(input.projectId)) {
        throw this.projectDeletionFenced();
      }
      assertCompletedReceiptMatches(existing, input, result);
      if (this.activeByProject.get(input.projectId) === key) {
        this.activeByProject.delete(input.projectId);
      }
      return { record: cloneRecord(existing), created: false };
    }

    const activeKey = this.activeByProject.get(input.projectId);
    if (activeKey && activeKey !== key) {
      const active = this.records.get(activeKey);
      if (active && !isTerminal(active)) {
        if (Date.parse(active.expiresAt) <= now) {
          throw new GeoCustomQuestionValidationStoreError(
            "RESERVATION_EXPIRED",
            "项目中已有过期验证正在安全清理，请稍后重试",
            activeOperation(active),
          );
        }
        throw new GeoCustomQuestionValidationStoreError(
          "ACTIVE_RESERVATION_CONFLICT",
          "当前项目已有另一个问题正在验证",
          activeOperation(active),
        );
      }
    }

    const record = initialCompletedReceipt(input, result, now);
    this.records.set(key, record);
    // A stale slot for this UUID must be gone before any response is emitted.
    // Never touch a slot owned by another (possibly newer) operation.
    if (this.activeByProject.get(input.projectId) === key) {
      this.activeByProject.delete(input.projectId);
    }
    await this.hooks.afterInitialRecordCommit?.(cloneRecord(record));
    if (this.deletionFences.has(input.projectId)) {
      throw this.projectDeletionFenced();
    }
    return { record: cloneRecord(record), created: true };
  }

  async get(projectId: string, clientRequestId: string) {
    const key = recordKey(projectId, clientRequestId);
    const record = this.records.get(key);
    const projectDeletionFenced = this.deletionFences.has(projectId);
    if (record && projectDeletionFenced) return cloneRecord(record);
    if (this.tombstones.has(key)) {
      throw new GeoCustomQuestionValidationStoreError(
        "RESERVATION_EXPIRED",
        "该自定义问题验证请求已过期",
      );
    }
    if (record) return cloneRecord(record);
    if (projectDeletionFenced) throw this.projectDeletionFenced();
    return undefined;
  }

  async getActive(projectId: string) {
    if (this.deletionFences.has(projectId)) return undefined;
    const key = this.activeByProject.get(projectId);
    const record = key ? this.records.get(key) : undefined;
    if (!record) return undefined;
    return cloneRecord(record);
  }

  async ensureActive(projectId: string, clientRequestId: string) {
    if (this.deletionFences.has(projectId)) {
      throw this.projectDeletionFenced();
    }
    const key = recordKey(projectId, clientRequestId);
    const requested = this.records.get(key);
    if (!requested) {
      throw new GeoCustomQuestionValidationStoreError(
        "RESERVATION_EXPIRED",
        "该自定义问题验证请求不存在或已过期",
      );
    }
    if (isTerminal(requested)) return cloneRecord(requested);
    const now = this.now();
    if (Date.parse(requested.expiresAt) <= now) {
      throw new GeoCustomQuestionValidationStoreError(
        "RESERVATION_EXPIRED",
        "该自定义问题验证请求已过期",
        activeOperation(requested),
      );
    }

    const currentKey = this.activeByProject.get(projectId);
    if (currentKey) {
      const current = this.records.get(currentKey);
      if (current) {
        if (current.key === key) {
          await this.supersedePristineProjectLosers(projectId, current);
          return cloneRecord(current);
        }
        if (!isTerminal(current) && Date.parse(current.expiresAt) <= now) {
          throw new GeoCustomQuestionValidationStoreError(
            "RESERVATION_EXPIRED",
            "项目中已有过期验证正在安全清理，请稍后重试",
            activeOperation(current),
          );
        }
        const superseded = await this.supersedePristineRecord(
          key,
          current.clientRequestId,
        );
        if (superseded && isTerminal(superseded)) {
          return cloneRecord(superseded);
        }
        throw new GeoCustomQuestionValidationStoreError(
          "ACTIVE_RESERVATION_CONFLICT",
          "当前项目已有另一个问题正在验证",
          activeOperation(current),
        );
      }
      this.activeByProject.delete(projectId);
    }

    const winner = Array.from(this.records.values())
      .filter(
        (candidate) =>
          candidate.projectId === projectId &&
          isRecoverableNonterminal(candidate, now),
      )
      .sort(compareRecoveryCandidates)[0];
    if (!winner) {
      throw new GeoCustomQuestionValidationStoreError(
        "RESERVATION_EXPIRED",
        "该自定义问题验证请求已过期",
      );
    }
    this.activeByProject.set(projectId, winner.key);
    await this.supersedePristineProjectLosers(projectId, winner);
    if (winner.key !== key) {
      const superseded = this.records.get(key);
      if (superseded && isTerminal(superseded)) {
        return cloneRecord(superseded);
      }
      throw new GeoCustomQuestionValidationStoreError(
        "ACTIVE_RESERVATION_CONFLICT",
        "当前项目已有另一个问题正在验证",
        activeOperation(winner),
      );
    }
    return cloneRecord(winner);
  }

  async fenceProjectDeletion(
    projectId: string,
    options: GeoProjectDeletionFenceOptions = {},
  ) {
    if (options.force) {
      this.deletionFences.add(projectId);
      this.activeByProject.delete(projectId);
      for (const [key, current] of Array.from(this.records.entries())) {
        if (current.projectId !== projectId || isTerminal(current)) continue;
        this.records.set(key, cancelledForProjectDeletion(current, this.now()));
      }
      return;
    }
    if (this.deletionFences.has(projectId)) return;
    const activeKey = this.activeByProject.get(projectId);
    const active = activeKey ? this.records.get(activeKey) : undefined;
    if (active) throw this.projectDeletionBlocked(active);
    if (activeKey) this.activeByProject.delete(projectId);

    const orphan = Array.from(this.records.values())
      .filter((record) => record.projectId === projectId && !isTerminal(record))
      .sort(compareRecoveryCandidates)[0];
    if (orphan) {
      this.activeByProject.set(projectId, orphan.key);
      throw this.projectDeletionBlocked(orphan);
    }
    this.deletionFences.add(projectId);
  }

  async acknowledgeTerminal(
    projectId: string,
    clientRequestId: string,
    ownerSessionHash: string,
  ) {
    const key = recordKey(projectId, clientRequestId);
    const record = this.records.get(key);
    if (!record) {
      throw new GeoCustomQuestionValidationStoreError(
        "RESERVATION_EXPIRED",
        "该自定义问题验证请求不存在或已过期",
      );
    }
    if (
      record.projectId !== projectId ||
      record.ownerSessionHash !== ownerSessionHash
    ) {
      throw new GeoCustomQuestionValidationStoreError(
        "RESERVATION_OWNER_MISMATCH",
        "该自定义问题验证请求不属于当前项目",
      );
    }
    if (!isTerminal(record)) {
      throw new GeoCustomQuestionValidationStoreError(
        "RESERVATION_NOT_TERMINAL",
        "问题验证尚未完成，不能确认持久化",
      );
    }
    if (this.activeByProject.get(projectId) === key) {
      await this.supersedePristineProjectLosers(projectId, record);
      this.activeByProject.delete(projectId);
    }
    return cloneRecord(record);
  }

  async retainTemporaryFileForCleanup(
    projectId: string,
    clientRequestId: string,
    fileId: string,
  ) {
    const key = recordKey(projectId, clientRequestId);
    const current = this.records.get(key);
    if (!current) {
      throw new GeoCustomQuestionValidationStoreError(
        "RESERVATION_EXPIRED",
        "该自定义问题验证请求不存在或已过期",
      );
    }
    if (current.orphanedTemporaryFileIds.includes(fileId)) {
      return cloneRecord(current);
    }
    const next = parseRecord({
      ...current,
      storeVersion: current.storeVersion + 1,
      commitId: crypto.randomUUID(),
      orphanedTemporaryFileIds: [...current.orphanedTemporaryFileIds, fileId],
      updatedAt: new Date(this.now()).toISOString(),
    });
    await this.hooks.beforeRecordCommit?.({
      operation: "retain",
      current: cloneRecord(current),
      next: cloneRecord(next),
    });
    if (this.deletionFences.has(current.projectId)) {
      throw this.projectDeletionFenced();
    }
    this.records.set(key, next);
    return cloneRecord(next);
  }

  async listActive(limit = 100) {
    const records: GeoCustomQuestionValidationRecord[] = [];
    const now = this.now();
    const projectIds = new Set([
      ...Array.from(this.activeByProject.keys()),
      ...Array.from(this.records.values()).map((record) => record.projectId),
    ]);
    for (const projectId of Array.from(projectIds).sort()) {
      if (this.deletionFences.has(projectId)) continue;
      let key = this.activeByProject.get(projectId);
      let record = key ? this.records.get(key) : undefined;
      if (key && !record) {
        this.activeByProject.delete(projectId);
        key = undefined;
      }
      if (!key) {
        record = Array.from(this.records.values())
          .filter(
            (candidate) =>
              candidate.projectId === projectId &&
              isRecoverableNonterminal(candidate, now),
          )
          .sort(compareRecoveryCandidates)[0];
        if (record) this.activeByProject.set(projectId, record.key);
      }
      if (record && this.activeByProject.get(projectId) === record.key) {
        await this.supersedePristineProjectLosers(projectId, record);
      }
      if (record && isRecoverableNonterminal(record, now)) {
        records.push(cloneRecord(record));
      }
      if (records.length >= limit) break;
    }
    return records;
  }

  async findReplayableInvalid(
    projectId: string,
    ownerSessionHash: string,
    questionHash: string,
  ) {
    const now = this.now();
    return Array.from(this.records.values())
      .filter(
        (record) =>
          record.projectId === projectId &&
          record.ownerSessionHash === ownerSessionHash &&
          record.questionHash === questionHash &&
          record.taskId &&
          record.error?.code ===
            "CUSTOM_QUESTION_CLASSIFIER_INVALID_RESPONSE" &&
          Date.parse(record.expiresAt) > now,
      )
      .sort(
        (left, right) =>
          Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
      )
      .map(cloneRecord)[0];
  }

  async tryAcquireLease(
    projectId: string,
    clientRequestId: string,
    leaseMs = DEFAULT_LEASE_MS,
  ) {
    const key = recordKey(projectId, clientRequestId);
    const current = this.records.get(key);
    if (!current || this.activeByProject.get(projectId) !== key)
      return undefined;
    if (isTerminal(current)) {
      if (
        current.supersededByClientRequestId &&
        this.activeByProject.get(projectId) === key
      ) {
        this.activeByProject.delete(projectId);
      }
      return undefined;
    }
    const now = this.now();
    if (Date.parse(current.expiresAt) <= now) {
      throw new GeoCustomQuestionValidationStoreError(
        "RESERVATION_EXPIRED",
        "该自定义问题验证请求已过期",
      );
    }
    if (
      current.activeLease &&
      Date.parse(current.activeLease.expiresAt) > now
    ) {
      return undefined;
    }
    const fence = current.fencingToken + 1;
    const lease = {
      key,
      token: crypto.randomUUID(),
      fence,
      expiresAt: new Date(now + leaseMs).toISOString(),
    };
    const next = parseRecord({
      ...current,
      storeVersion: current.storeVersion + 1,
      commitId: crypto.randomUUID(),
      fencingToken: fence,
      activeLease: storedLease(lease),
      updatedAt: new Date(now).toISOString(),
    });
    await this.hooks.beforeRecordCommit?.({
      operation: "acquire",
      current: cloneRecord(current),
      next: cloneRecord(next),
    });
    if (this.deletionFences.has(current.projectId)) {
      throw this.projectDeletionFenced();
    }
    if (this.records.get(key)?.commitId !== current.commitId) return undefined;
    this.records.set(key, next);
    return lease;
  }

  async renewLease(
    lease: GeoCustomQuestionValidationLease,
    leaseMs = DEFAULT_LEASE_MS,
  ) {
    const current = this.records.get(lease.key);
    if (!current) throw this.leaseLost();
    if (this.deletionFences.has(current.projectId)) {
      throw this.projectDeletionFenced();
    }
    assertLeaseOwner(current, lease, this.now());
    const renewed = {
      ...lease,
      expiresAt: new Date(this.now() + leaseMs).toISOString(),
    };
    const next = parseRecord({
      ...current,
      storeVersion: current.storeVersion + 1,
      commitId: crypto.randomUUID(),
      activeLease: storedLease(renewed),
      updatedAt: new Date(this.now()).toISOString(),
    });
    await this.hooks.beforeRecordCommit?.({
      operation: "renew",
      current: cloneRecord(current),
      next: cloneRecord(next),
    });
    if (this.deletionFences.has(current.projectId)) {
      throw this.projectDeletionFenced();
    }
    if (this.records.get(lease.key)?.commitId !== current.commitId)
      throw this.leaseLost();
    this.records.set(lease.key, next);
    return renewed;
  }

  async update(
    record: GeoCustomQuestionValidationRecord,
    lease: GeoCustomQuestionValidationLease,
  ) {
    const current = this.records.get(record.key);
    if (!current) throw this.leaseLost();
    if (this.deletionFences.has(current.projectId)) {
      throw this.projectDeletionFenced();
    }
    assertLeaseOwner(current, lease, this.now());
    const parsed = nextRecord(current, record, this.now());
    await this.hooks.beforeRecordCommit?.({
      operation: "update",
      current: cloneRecord(current),
      next: cloneRecord(parsed),
    });
    if (this.deletionFences.has(current.projectId)) {
      throw this.projectDeletionFenced();
    }
    if (this.records.get(record.key)?.commitId !== current.commitId)
      throw this.leaseLost();
    this.records.set(record.key, parsed);
    return cloneRecord(parsed);
  }

  async releaseLease(lease: GeoCustomQuestionValidationLease) {
    const current = this.records.get(lease.key);
    if (
      !current ||
      current.activeLease?.token !== lease.token ||
      current.activeLease.fence !== lease.fence
    ) {
      return;
    }
    const next = parseRecord({
      ...current,
      storeVersion: current.storeVersion + 1,
      commitId: crypto.randomUUID(),
      activeLease: undefined,
      updatedAt: new Date(this.now()).toISOString(),
    });
    await this.hooks.beforeRecordCommit?.({
      operation: "release",
      current: cloneRecord(current),
      next: cloneRecord(next),
    });
    if (this.deletionFences.has(current.projectId)) return;
    if (this.records.get(lease.key)?.commitId === current.commitId)
      this.records.set(lease.key, next);
  }

  async collectGarbage(input: {
    now?: Date;
    cleanup: (
      target: GeoCustomQuestionValidationCleanupTarget,
    ) => Promise<void>;
    tombstoneTtlMs?: number;
  }) {
    const now = input.now?.getTime() ?? this.now();
    const result: GeoCustomQuestionValidationGarbageCollectionResult = {
      scanned: 0,
      deleted: 0,
      retained: 0,
      tombstonesDeleted: 0,
    };
    const createdTombstones = new Set<string>();
    for (const [key, record] of Array.from(this.records.entries())) {
      result.scanned += 1;
      if (this.deletionFences.has(record.projectId)) {
        if (!record.cleanupCompleted) {
          try {
            await input.cleanup(cleanupTargetFromRecord(record));
          } catch {
            result.retained += 1;
            continue;
          }
        }
        this.records.delete(key);
        if (this.activeByProject.get(record.projectId) === key) {
          this.activeByProject.delete(record.projectId);
        }
        result.deleted += 1;
        continue;
      }
      const expired = Date.parse(record.expiresAt) <= now;
      const terminalCleanupPending =
        isTerminal(record) && !record.cleanupCompleted;
      if (!expired && !terminalCleanupPending) continue;
      if (
        record.activeLease &&
        Date.parse(record.activeLease.expiresAt) > now
      ) {
        result.retained += 1;
        continue;
      }
      let cleanupCompleted = record.cleanupCompleted;
      const cleanupTarget = cleanupTargetFromRecord(record);
      if (!cleanupCompleted) {
        try {
          await input.cleanup(cleanupTarget);
          cleanupCompleted = true;
        } catch {
          result.retained += 1;
          if (!expired) continue;
        }
      }
      if (this.records.get(key)?.commitId !== record.commitId) {
        result.retained += 1;
        continue;
      }
      if (this.deletionFences.has(record.projectId)) {
        this.records.delete(key);
        if (this.activeByProject.get(record.projectId) === key) {
          this.activeByProject.delete(record.projectId);
        }
        result.deleted += 1;
        continue;
      }
      // A completed result is the authority needed to recover a caller whose
      // IndexedDB commit or ACK response was lost. Keep it while this exact
      // record still owns the project slot; ACK is what releases that slot.
      // Rejected/failed records may expire because the client can safely ACK
      // them after displaying the terminal decision.
      if (
        record.state === "completed" &&
        this.activeByProject.get(record.projectId) === key
      ) {
        this.records.set(key, {
          ...record,
          storeVersion: record.storeVersion + 1,
          commitId: crypto.randomUUID(),
          cleanupCompleted,
          activeLease: undefined,
          updatedAt: new Date(now).toISOString(),
        });
        result.retained += 1;
        continue;
      }
      if (!expired) {
        this.records.set(key, {
          ...record,
          storeVersion: record.storeVersion + 1,
          commitId: crypto.randomUUID(),
          cleanupCompleted,
          activeLease: undefined,
          updatedAt: new Date(now).toISOString(),
        });
        continue;
      }
      if (this.activeByProject.get(record.projectId) === key) {
        await this.supersedePristineProjectLosers(record.projectId, record);
      }
      this.records.delete(key);
      if (this.activeByProject.get(record.projectId) === key)
        this.activeByProject.delete(record.projectId);
      this.tombstones.set(key, {
        projectId: record.projectId,
        expiresAt: now + (input.tombstoneTtlMs ?? DEFAULT_TOMBSTONE_TTL_MS),
        cleanupTarget: cleanupCompleted ? undefined : cleanupTarget,
        cleanupCompleted,
      });
      createdTombstones.add(key);
      result.deleted += 1;
    }
    for (const [key, tombstone] of Array.from(this.tombstones.entries())) {
      if (createdTombstones.has(key)) continue;
      if (!tombstone.cleanupCompleted && tombstone.cleanupTarget) {
        try {
          await input.cleanup(tombstone.cleanupTarget);
          tombstone.cleanupCompleted = true;
          tombstone.cleanupTarget = undefined;
          this.tombstones.set(key, tombstone);
        } catch {
          result.retained += 1;
          continue;
        }
      }
      // Keep the compact tombstone as the permanent exactly-once replay
      // barrier. Exact recovery must continue to produce a recognizable 410,
      // never decay into an ambiguous 404 that leaves a browser UUID locked.
    }
    return result;
  }

  private leaseLost() {
    return new GeoCustomQuestionValidationStoreError(
      "LEASE_LOST",
      "自定义问题验证租约已失效",
    );
  }

  private projectDeletionFenced() {
    return new GeoCustomQuestionValidationStoreError(
      "PROJECT_DELETION_FENCED",
      "项目正在删除，不能再创建或恢复自定义问题验证",
    );
  }

  private projectDeletionBlocked(record: GeoCustomQuestionValidationRecord) {
    return new GeoCustomQuestionValidationStoreError(
      "PROJECT_DELETION_BLOCKED",
      "当前项目仍有自定义问题验证等待恢复、持久化或确认，完成后才能删除",
      activeOperation(record),
    );
  }
}

export class FileGeoCustomQuestionValidationStore
  implements GeoCustomQuestionValidationStore
{
  constructor(
    private readonly directory: string,
    private readonly hooks: StoreTestHooks = {},
    private readonly security: FileStoreSecurityOptions = {},
  ) {}

  private now() {
    return this.hooks.now?.() ?? Date.now();
  }

  async assertReady() {
    await this.assertDirectory();
    await this.cleanupStaleTemporaryFiles(this.now());
    await this.assertManagedFilePermissions();
    await this.persistenceIdentity();
    const probe = path.join(
      this.directory,
      `.readiness-${process.pid}-${crypto.randomUUID()}`,
    );
    await this.writeDurableFile(probe, "ok\n", "wx");
    await fs.unlink(probe);
    await this.syncDirectory();
    await this.assertManagedFilePermissions();
  }

  async persistenceIdentity(): Promise<string> {
    await this.assertDirectory();
    const target = path.join(this.directory, ".persistence-sentinel.json");
    try {
      const value = JSON.parse(await fs.readFile(target, "utf8")) as {
        id?: unknown;
      };
      if (typeof value.id === "string" && /^[0-9a-f-]{36}$/i.test(value.id))
        return value.id;
      throw new Error("invalid persistence sentinel");
    } catch (error) {
      if (!isFileNotFoundError(error)) {
        throw new GeoCustomQuestionValidationStoreError(
          "STORE_CORRUPT",
          "自定义问题验证持久卷标识无法读取",
        );
      }
    }
    const id = crypto.randomUUID();
    const temporary = this.temporaryPath("persistence-sentinel");
    try {
      await this.writeDurableFile(
        temporary,
        `${JSON.stringify({ id, createdAt: new Date(this.now()).toISOString() })}\n`,
        "wx",
      );
      try {
        await fs.link(temporary, target);
        await this.syncDirectory();
        return id;
      } catch (error) {
        if (!isFileExistsError(error)) throw error;
      }
    } finally {
      await fs.unlink(temporary).catch(() => undefined);
    }
    return this.persistenceIdentity();
  }

  async isProjectDeletionFenced(projectId: string) {
    await this.assertDirectory();
    const slot = await this.readCurrentProjectSlot(projectHash(projectId));
    return Boolean(slot?.deletionFence);
  }

  async getProjectDeletionTargets(projectId: string) {
    await this.assertDirectory();
    const records = await this.readProjectRecords(projectId);
    const tombstones = await this.readProjectTombstones(projectId);
    const recordTargets = projectDeletionTargetsFromRecords(records);
    const tombstoneFileIds: string[] = [];
    for (const tombstone of tombstones) {
      if (
        tombstone.cleanupTarget &&
        !(await this.hasCleanupCompleteMarker(tombstone.key))
      ) {
        tombstoneFileIds.push(...tombstone.cleanupTarget.temporaryFileIds);
      }
    }
    const orphanFileIds = await this.readOrphanFileIds(
      new Set([
        ...records.map((record) => record.key),
        ...tombstones.map((tombstone) => tombstone.key),
      ]),
    );
    return {
      taskIds: recordTargets.taskIds,
      temporaryFileIds: Array.from(
        new Set([
          ...recordTargets.temporaryFileIds,
          ...tombstoneFileIds,
          ...orphanFileIds,
        ]),
      ),
    };
  }

  async purgeProjectRecords(projectId: string) {
    await this.assertDirectory();
    if (!(await this.isProjectDeletionFenced(projectId))) {
      throw new GeoCustomQuestionValidationStoreError(
        "STORE_CORRUPT",
        "项目尚未建立删除栅栏，不能清除验证记录",
      );
    }
    const records = await this.readProjectRecords(projectId);
    const existingTombstones = await this.readProjectTombstones(projectId);
    const keys = new Set([
      ...records.map((record) => record.key),
      ...existingTombstones.map((tombstone) => tombstone.key),
    ]);
    for (const key of Array.from(keys)) {
      await this.deleteRecordVersions(key);
      await this.deleteRecordAuxiliaryFiles(key);
    }
    await this.syncDirectory();
    return records.length;
  }

  async reserve(input: GeoCustomQuestionValidationReservation) {
    await this.assertDirectory();
    const key = recordKey(input.projectId, input.clientRequestId);
    await this.assertProjectNotDeletionFenced(input.projectId);
    if (await this.hasLiveTombstone(key)) {
      throw new GeoCustomQuestionValidationStoreError(
        "RESERVATION_EXPIRED",
        "该自定义问题验证请求已过期，请刷新后重新提交",
      );
    }
    let record = await this.readCurrentRecord(key);
    let created = false;
    if (!record) {
      const candidate = initialRecord(input, this.now());
      created = await this.commitInitialRecord(candidate);
      record = await this.readCurrentRecord(key);
      if (!record) {
        await this.assertProjectNotDeletionFenced(input.projectId);
        throw this.storeCorrupt("自定义问题验证预留未能持久化");
      }
      if (created) {
        await this.hooks.afterInitialRecordCommit?.(cloneRecord(record));
      }
    }
    assertReservationMatches(record, input);
    if (isTerminal(record)) {
      await this.assertProjectNotDeletionFenced(input.projectId);
      return { record, created };
    }

    const hash = projectHash(input.projectId);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const slot = await this.readCurrentProjectSlot(hash);
      if (slot?.deletionFence) throw this.projectDeletionFenced();
      if (slot?.active?.key === key) return { record, created };
      if (slot?.active) {
        const active = await this.readCurrentRecord(slot.active.key);
        if (active && !isTerminal(active)) {
          await this.supersedePristineRecord(key, active.clientRequestId);
          if (Date.parse(active.expiresAt) <= this.now()) {
            throw new GeoCustomQuestionValidationStoreError(
              "RESERVATION_EXPIRED",
              "项目中已有过期验证正在安全清理，请稍后重试",
              activeOperation(active),
            );
          }
          throw new GeoCustomQuestionValidationStoreError(
            "ACTIVE_RESERVATION_CONFLICT",
            "当前项目已有另一个问题正在验证",
            activeOperation(active),
          );
        }
      }
      const claimed = await this.commitProjectSlot(hash, slot, {
        key,
        clientRequestId: input.clientRequestId,
        expiresAt: input.expiresAt,
      });
      if (claimed) return { record, created };
    }
    throw this.storeCorrupt("自定义问题验证项目占位竞争未能收敛");
  }

  async reserveCompletedReceipt(
    input: GeoCustomQuestionValidationReservation,
    result: GeoQuestion,
  ) {
    await this.assertDirectory();
    const key = recordKey(input.projectId, input.clientRequestId);
    await this.assertProjectNotDeletionFenced(input.projectId);
    if (await this.hasLiveTombstone(key)) {
      throw new GeoCustomQuestionValidationStoreError(
        "RESERVATION_EXPIRED",
        "该自定义问题验证请求已过期，请刷新后重新提交",
      );
    }

    let record = await this.readCurrentRecord(key);
    if (record) {
      await this.assertProjectNotDeletionFenced(input.projectId);
      assertCompletedReceiptMatches(record, input, result);
      await this.clearProjectSlotIfOwned(record);
      return { record, created: false };
    }

    const slot = await this.readCurrentProjectSlot(
      projectHash(input.projectId),
    );
    if (slot?.active?.key !== key) {
      const active = slot?.active
        ? await this.readCurrentRecord(slot.active.key)
        : undefined;
      if (active && !isTerminal(active)) {
        if (Date.parse(active.expiresAt) <= this.now()) {
          throw new GeoCustomQuestionValidationStoreError(
            "RESERVATION_EXPIRED",
            "项目中已有过期验证正在安全清理，请稍后重试",
            activeOperation(active),
          );
        }
        throw new GeoCustomQuestionValidationStoreError(
          "ACTIVE_RESERVATION_CONFLICT",
          "当前项目已有另一个问题正在验证",
          activeOperation(active),
        );
      }
    }

    const candidate = initialCompletedReceipt(input, result, this.now());
    const created = await this.commitInitialRecord(candidate);
    record = await this.readCurrentRecord(key);
    if (!record) {
      await this.assertProjectNotDeletionFenced(input.projectId);
      throw this.storeCorrupt("自定义问题验证终态回执未能持久化");
    }
    assertCompletedReceiptMatches(record, input, result);
    await this.assertProjectNotDeletionFenced(input.projectId);
    // The receipt itself never claims project authority. Clear only a stale
    // slot for this exact UUID; a newer/different active operation is intact.
    await this.clearProjectSlotIfOwned(record);
    if (created) {
      await this.hooks.afterInitialRecordCommit?.(cloneRecord(record));
    }
    return { record, created };
  }

  async get(projectId: string, clientRequestId: string) {
    await this.assertDirectory();
    const key = recordKey(projectId, clientRequestId);
    const record = await this.readCurrentRecord(key);
    const projectDeletionFenced = await this.isProjectDeletionFenced(projectId);
    if (record && projectDeletionFenced) return record;
    if (await this.hasLiveTombstone(key)) {
      throw new GeoCustomQuestionValidationStoreError(
        "RESERVATION_EXPIRED",
        "该自定义问题验证请求已过期",
      );
    }
    if (record) return record;
    if (projectDeletionFenced) throw this.projectDeletionFenced();
    return undefined;
  }

  async getActive(projectId: string) {
    await this.assertDirectory();
    const slot = await this.readCurrentProjectSlot(projectHash(projectId));
    if (slot?.deletionFence) return undefined;
    if (!slot?.active) return undefined;
    const record = await this.readCurrentRecord(slot.active.key);
    return record;
  }

  async ensureActive(projectId: string, clientRequestId: string) {
    await this.assertDirectory();
    const key = recordKey(projectId, clientRequestId);
    await this.assertProjectNotDeletionFenced(projectId);
    let requested = await this.readCurrentRecord(key);
    if (!requested || (await this.hasLiveTombstone(key))) {
      throw new GeoCustomQuestionValidationStoreError(
        "RESERVATION_EXPIRED",
        "该自定义问题验证请求不存在或已过期",
      );
    }
    if (requested.projectId !== projectId) {
      throw this.storeCorrupt("自定义问题验证预留项目身份冲突");
    }
    if (isTerminal(requested)) return requested;
    if (Date.parse(requested.expiresAt) <= this.now()) {
      throw new GeoCustomQuestionValidationStoreError(
        "RESERVATION_EXPIRED",
        "该自定义问题验证请求已过期",
        activeOperation(requested),
      );
    }

    const authority = await this.recoverProjectAuthority(projectId);
    requested = (await this.readCurrentRecord(key)) ?? requested;
    if (isTerminal(requested)) return requested;
    if (Date.parse(requested.expiresAt) <= this.now()) {
      throw new GeoCustomQuestionValidationStoreError(
        "RESERVATION_EXPIRED",
        "该自定义问题验证请求已过期",
        activeOperation(requested),
      );
    }
    if (!authority) {
      throw this.storeCorrupt("自定义问题验证孤立预留未能恢复权威占位");
    }
    if (authority.key === key) return authority;
    if (
      !isTerminal(authority) &&
      Date.parse(authority.expiresAt) <= this.now()
    ) {
      throw new GeoCustomQuestionValidationStoreError(
        "RESERVATION_EXPIRED",
        "项目中已有过期验证正在安全清理，请稍后重试",
        activeOperation(authority),
      );
    }
    throw new GeoCustomQuestionValidationStoreError(
      "ACTIVE_RESERVATION_CONFLICT",
      "当前项目已有另一个问题正在验证",
      activeOperation(authority),
    );
  }

  async fenceProjectDeletion(
    projectId: string,
    options: GeoProjectDeletionFenceOptions = {},
  ) {
    await this.assertDirectory();
    const hash = projectHash(projectId);
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const slot = await this.readCurrentProjectSlot(hash);
      if (options.force) {
        if (!slot?.deletionFence) {
          const fenced = await this.commitProjectSlot(hash, slot, undefined, {
            token: crypto.randomUUID(),
            createdAt: new Date(this.now()).toISOString(),
          });
          if (!fenced) continue;
        }
        await this.cancelProjectRecordsForDeletion(projectId);
        return;
      }
      if (slot?.active) {
        const current = await this.readCurrentRecord(slot.active.key);
        if (current && !(await this.hasLiveTombstone(current.key))) {
          throw this.projectDeletionBlocked(current);
        }
        if (await this.commitProjectSlot(hash, slot, undefined)) continue;
        continue;
      }

      if (!slot?.deletionFence) {
        const fenced = await this.commitProjectSlot(hash, slot, undefined, {
          token: crypto.randomUUID(),
          createdAt: new Date(this.now()).toISOString(),
        });
        if (!fenced) continue;
        continue;
      }

      const orphan = (await this.readProjectRecords(projectId))
        .filter((record) => !isTerminal(record))
        .sort(compareRecoveryCandidates)[0];
      if (!orphan) return;

      const restored = await this.commitProjectSlot(hash, slot, {
        key: orphan.key,
        clientRequestId: orphan.clientRequestId,
        expiresAt: orphan.expiresAt,
      });
      if (!restored) continue;
      await this.supersedePristineProjectLosers(projectId, orphan);
      throw this.projectDeletionBlocked(orphan);
    }
    throw this.storeCorrupt("自定义问题验证删除栅栏竞争未能收敛");
  }

  async acknowledgeTerminal(
    projectId: string,
    clientRequestId: string,
    ownerSessionHash: string,
  ) {
    await this.assertDirectory();
    const key = recordKey(projectId, clientRequestId);
    const record = await this.readCurrentRecord(key);
    if (!record || (await this.hasLiveTombstone(key))) {
      throw new GeoCustomQuestionValidationStoreError(
        "RESERVATION_EXPIRED",
        "该自定义问题验证请求不存在或已过期",
      );
    }
    if (
      record.projectId !== projectId ||
      record.ownerSessionHash !== ownerSessionHash
    ) {
      throw new GeoCustomQuestionValidationStoreError(
        "RESERVATION_OWNER_MISMATCH",
        "该自定义问题验证请求不属于当前项目",
      );
    }
    if (!isTerminal(record)) {
      throw new GeoCustomQuestionValidationStoreError(
        "RESERVATION_NOT_TERMINAL",
        "问题验证尚未完成，不能确认持久化",
      );
    }

    const hash = projectHash(projectId);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const slot = await this.readCurrentProjectSlot(hash);
      // A repeated acknowledgement, or an acknowledgement after a new
      // reservation won the project slot, is an idempotent success.
      if (!slot?.active || slot.active.key !== key) return record;
      await this.supersedePristineProjectLosers(projectId, record);
      if (await this.commitProjectSlot(hash, slot, undefined)) return record;
    }
    throw this.storeCorrupt("自定义问题验证确认竞争未能收敛");
  }

  async retainTemporaryFileForCleanup(
    projectId: string,
    clientRequestId: string,
    fileId: string,
  ) {
    await this.assertDirectory();
    const key = recordKey(projectId, clientRequestId);
    const marker = OrphanFileMarkerSchema.parse({
      schemaVersion: STORE_SCHEMA_VERSION,
      recordKey: key,
      fileId,
      createdAt: new Date(this.now()).toISOString(),
    });
    await this.createOrphanFileMarker(marker);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const current = await this.readCurrentRecord(key);
      if (!current || (await this.hasLiveTombstone(key))) {
        throw new GeoCustomQuestionValidationStoreError(
          "RESERVATION_EXPIRED",
          "该自定义问题验证请求不存在或已过期",
        );
      }
      if (current.orphanedTemporaryFileIds.includes(fileId)) {
        await this.removeOrphanFileMarker(marker).catch(() => undefined);
        return current;
      }
      const next = nextRecord(
        current,
        {
          ...current,
          orphanedTemporaryFileIds: [
            ...current.orphanedTemporaryFileIds,
            fileId,
          ],
        },
        this.now(),
      );
      await this.hooks.beforeRecordCommit?.({
        operation: "retain",
        current: cloneRecord(current),
        next: cloneRecord(next),
      });
      if (await this.commitRecord(current, next)) {
        await this.removeOrphanFileMarker(marker).catch(() => undefined);
        return next;
      }
    }
    throw this.storeCorrupt("自定义问题验证临时文件追踪竞争未能收敛");
  }

  async listActive(limit = 100) {
    await this.assertDirectory();
    const names = await fs.readdir(this.directory);
    const keys = new Set<string>();
    for (const name of names) {
      const match = /^([a-f0-9]{64})\.record\.v\d{12}\.json$/.exec(name);
      if (match?.[1]) keys.add(match[1]);
    }
    const projectIds = new Set<string>();
    for (const key of Array.from(keys).sort()) {
      if (await this.hasLiveTombstone(key)) continue;
      const record = await this.readCurrentRecord(key);
      if (record) projectIds.add(record.projectId);
    }
    const records: GeoCustomQuestionValidationRecord[] = [];
    for (const projectId of Array.from(projectIds).sort()) {
      const record = await this.recoverProjectAuthority(projectId);
      if (record && isRecoverableNonterminal(record, this.now())) {
        records.push(record);
      }
      if (records.length >= limit) break;
    }
    return records;
  }

  async findReplayableInvalid(
    projectId: string,
    ownerSessionHash: string,
    questionHash: string,
  ) {
    await this.assertDirectory();
    const now = this.now();
    return (await this.readProjectRecords(projectId))
      .filter(
        (record) =>
          record.ownerSessionHash === ownerSessionHash &&
          record.questionHash === questionHash &&
          record.taskId &&
          record.error?.code ===
            "CUSTOM_QUESTION_CLASSIFIER_INVALID_RESPONSE" &&
          Date.parse(record.expiresAt) > now,
      )
      .sort(
        (left, right) =>
          Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
      )[0];
  }

  async tryAcquireLease(
    projectId: string,
    clientRequestId: string,
    leaseMs = DEFAULT_LEASE_MS,
  ) {
    const key = recordKey(projectId, clientRequestId);
    const active = await this.getActive(projectId);
    if (!active || active.key !== key) return undefined;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const current = await this.readCurrentRecord(key);
      if (!current) return undefined;
      if (isTerminal(current)) {
        if (current.supersededByClientRequestId) {
          await this.clearProjectSlotIfOwned(current);
        }
        return undefined;
      }
      const now = this.now();
      if (Date.parse(current.expiresAt) <= now) {
        throw new GeoCustomQuestionValidationStoreError(
          "RESERVATION_EXPIRED",
          "该自定义问题验证请求已过期",
        );
      }
      if (
        current.activeLease &&
        Date.parse(current.activeLease.expiresAt) > now
      ) {
        return undefined;
      }
      const fence = current.fencingToken + 1;
      const lease = {
        key,
        token: crypto.randomUUID(),
        fence,
        expiresAt: new Date(now + leaseMs).toISOString(),
      };
      const next = parseRecord({
        ...current,
        storeVersion: current.storeVersion + 1,
        commitId: crypto.randomUUID(),
        fencingToken: fence,
        activeLease: storedLease(lease),
        updatedAt: new Date(now).toISOString(),
      });
      await this.hooks.beforeRecordCommit?.({
        operation: "acquire",
        current: cloneRecord(current),
        next: cloneRecord(next),
      });
      if (await this.commitRecord(current, next)) return lease;
    }
    return undefined;
  }

  async renewLease(
    lease: GeoCustomQuestionValidationLease,
    leaseMs = DEFAULT_LEASE_MS,
  ) {
    const current = await this.readCurrentRecord(lease.key);
    if (!current) throw this.leaseLost();
    await this.assertProjectNotDeletionFenced(current.projectId);
    assertLeaseOwner(current, lease, this.now());
    const renewed = {
      ...lease,
      expiresAt: new Date(this.now() + leaseMs).toISOString(),
    };
    const next = parseRecord({
      ...current,
      storeVersion: current.storeVersion + 1,
      commitId: crypto.randomUUID(),
      activeLease: storedLease(renewed),
      updatedAt: new Date(this.now()).toISOString(),
    });
    await this.hooks.beforeRecordCommit?.({
      operation: "renew",
      current: cloneRecord(current),
      next: cloneRecord(next),
    });
    if (!(await this.commitRecord(current, next))) throw this.leaseLost();
    return renewed;
  }

  async update(
    record: GeoCustomQuestionValidationRecord,
    lease: GeoCustomQuestionValidationLease,
  ) {
    const current = await this.readCurrentRecord(record.key);
    if (!current) throw this.leaseLost();
    await this.assertProjectNotDeletionFenced(current.projectId);
    assertLeaseOwner(current, lease, this.now());
    const parsed = nextRecord(current, record, this.now());
    await this.hooks.beforeRecordCommit?.({
      operation: "update",
      current: cloneRecord(current),
      next: cloneRecord(parsed),
    });
    if (!(await this.commitRecord(current, parsed))) throw this.leaseLost();
    return parsed;
  }

  async releaseLease(lease: GeoCustomQuestionValidationLease) {
    const current = await this.readCurrentRecord(lease.key);
    if (
      !current ||
      current.activeLease?.token !== lease.token ||
      current.activeLease.fence !== lease.fence
    ) {
      return;
    }
    const next = parseRecord({
      ...current,
      storeVersion: current.storeVersion + 1,
      commitId: crypto.randomUUID(),
      activeLease: undefined,
      updatedAt: new Date(this.now()).toISOString(),
    });
    await this.hooks.beforeRecordCommit?.({
      operation: "release",
      current: cloneRecord(current),
      next: cloneRecord(next),
    });
    await this.commitRecord(current, next);
  }

  async collectGarbage(input: {
    now?: Date;
    cleanup: (
      target: GeoCustomQuestionValidationCleanupTarget,
    ) => Promise<void>;
    tombstoneTtlMs?: number;
  }) {
    await this.assertDirectory();
    const now = input.now?.getTime() ?? this.now();
    await this.cleanupStaleTemporaryFiles(now);
    const result: GeoCustomQuestionValidationGarbageCollectionResult = {
      scanned: 0,
      deleted: 0,
      retained: 0,
      tombstonesDeleted: 0,
    };
    const orphanMarkers = await this.cleanupOrphanFileMarkers(
      now,
      input.cleanup,
    );
    result.scanned += orphanMarkers.scanned;
    result.retained += orphanMarkers.retained;
    const names = await fs.readdir(this.directory);
    const recordKeys = new Set<string>();
    const tombstoneKeys = new Set<string>();
    for (const name of names) {
      const recordMatch = /^([a-f0-9]{64})\.record\.v\d{12}\.json$/.exec(name);
      if (recordMatch?.[1]) recordKeys.add(recordMatch[1]);
      const tombstoneMatch = /^([a-f0-9]{64})\.tombstone\.json$/.exec(name);
      if (tombstoneMatch?.[1]) tombstoneKeys.add(tombstoneMatch[1]);
    }
    const keys = new Set([
      ...Array.from(recordKeys),
      ...Array.from(tombstoneKeys),
    ]);
    for (const key of Array.from(keys)) {
      result.scanned += 1;
      const existingTombstone = await this.readTombstone(key);
      if (existingTombstone) {
        let cleanupCompleted =
          !existingTombstone.cleanupTarget ||
          (await this.hasCleanupCompleteMarker(key));
        if (!cleanupCompleted && existingTombstone.cleanupTarget) {
          try {
            await input.cleanup(existingTombstone.cleanupTarget);
            await this.createCleanupCompleteMarker(key, now);
            cleanupCompleted = true;
          } catch {
            result.retained += 1;
          }
        }
        try {
          await this.deleteRecordVersions(key);
          if (recordKeys.has(key)) result.deleted += 1;
        } catch {
          result.retained += 1;
        }
        // Tombstones are intentionally permanent and compact. They preserve
        // the exactly-once replay barrier and let exact GET/POST recovery keep
        // returning 410 instead of eventually becoming an ambiguous 404.
        continue;
      }
      const record = await this.readCurrentRecord(key);
      if (!record) continue;
      if (await this.isProjectDeletionFenced(record.projectId)) {
        if (!record.cleanupCompleted) {
          try {
            await input.cleanup(cleanupTargetFromRecord(record));
          } catch {
            result.retained += 1;
            continue;
          }
        }
        try {
          await this.deleteRecordVersions(key);
          await this.deleteRecordAuxiliaryFiles(key);
          result.deleted += 1;
        } catch {
          result.retained += 1;
        }
        continue;
      }
      const expired = Date.parse(record.expiresAt) <= now;
      const terminalCleanupPending =
        isTerminal(record) && !record.cleanupCompleted;
      if (!expired && !terminalCleanupPending) continue;
      if (
        record.activeLease &&
        Date.parse(record.activeLease.expiresAt) > now
      ) {
        result.retained += 1;
        continue;
      }
      const fence = record.fencingToken + 1;
      const lease: GeoCustomQuestionValidationLease = {
        key,
        token: crypto.randomUUID(),
        fence,
        expiresAt: new Date(now + DEFAULT_LEASE_MS).toISOString(),
      };
      const claimed = parseRecord({
        ...record,
        storeVersion: record.storeVersion + 1,
        commitId: crypto.randomUUID(),
        fencingToken: fence,
        activeLease: storedLease(lease),
        updatedAt: new Date(now).toISOString(),
      });
      await this.hooks.beforeRecordCommit?.({
        operation: "gc",
        current: cloneRecord(record),
        next: cloneRecord(claimed),
      });
      if (!(await this.commitRecord(record, claimed))) {
        result.retained += 1;
        continue;
      }
      const cleanupTarget = cleanupTargetFromRecord(claimed);
      let cleanupCompleted = claimed.cleanupCompleted;
      if (!cleanupCompleted) {
        try {
          await input.cleanup(cleanupTarget);
          cleanupCompleted = true;
        } catch {
          result.retained += 1;
          if (!expired) {
            await this.releaseLease(lease).catch(() => undefined);
            continue;
          }
        }
      }
      const authoritative = await this.readCurrentRecord(key);
      if (
        !authoritative ||
        authoritative.activeLease?.token !== lease.token ||
        authoritative.activeLease.fence !== lease.fence
      ) {
        result.retained += 1;
        continue;
      }
      if (!expired) {
        const cleaned = parseRecord({
          ...authoritative,
          storeVersion: authoritative.storeVersion + 1,
          commitId: crypto.randomUUID(),
          cleanupCompleted,
          activeLease: undefined,
          updatedAt: new Date(now).toISOString(),
        });
        if (!(await this.commitRecord(authoritative, cleaned))) {
          result.retained += 1;
        }
        continue;
      }
      const projectSlot = await this.readCurrentProjectSlot(
        projectHash(authoritative.projectId),
      );
      if (
        authoritative.state === "completed" &&
        projectSlot?.active?.key === authoritative.key
      ) {
        const retained = parseRecord({
          ...authoritative,
          storeVersion: authoritative.storeVersion + 1,
          commitId: crypto.randomUUID(),
          cleanupCompleted,
          activeLease: undefined,
          updatedAt: new Date(now).toISOString(),
        });
        await this.commitRecord(authoritative, retained);
        result.retained += 1;
        continue;
      }
      const tombstone = TombstoneSchema.parse({
        schemaVersion: STORE_SCHEMA_VERSION,
        key,
        deletedAt: new Date(now).toISOString(),
        expiresAt: new Date(
          now + (input.tombstoneTtlMs ?? DEFAULT_TOMBSTONE_TTL_MS),
        ).toISOString(),
        projectHash: projectHash(authoritative.projectId),
        cleanupTarget: cleanupCompleted ? undefined : cleanupTarget,
      });
      if (projectSlot?.active?.key === authoritative.key) {
        await this.supersedePristineProjectLosers(
          authoritative.projectId,
          authoritative,
        );
      }
      await this.createTombstone(tombstone);
      if (cleanupCompleted) await this.createCleanupCompleteMarker(key, now);
      await this.clearProjectSlotIfOwned(authoritative);
      try {
        await this.deleteRecordVersions(key);
        result.deleted += 1;
      } catch {
        // Keep the tombstone authoritative and retry physical deletion later.
        result.retained += 1;
      }
    }

    await this.syncDirectory();
    return result;
  }

  private async commitInitialRecord(record: GeoCustomQuestionValidationRecord) {
    if (await this.isProjectDeletionFenced(record.projectId)) return false;
    const target = this.recordVersionPath(record.key, 0);
    const linked = await this.linkImmutableJson(target, record);
    if (await this.isProjectDeletionFenced(record.projectId)) {
      if (linked) {
        await fs.unlink(target).catch((error) => {
          if (!isFileNotFoundError(error)) throw error;
        });
        await this.syncDirectory();
      }
      return false;
    }
    return linked;
  }

  private async readProjectRecords(projectId: string) {
    const keys = new Set<string>();
    for (const name of await fs.readdir(this.directory)) {
      const match = /^([a-f0-9]{64})\.record\.v\d{12}\.json$/.exec(name);
      if (match?.[1]) keys.add(match[1]);
    }
    const records: GeoCustomQuestionValidationRecord[] = [];
    for (const key of Array.from(keys).sort()) {
      if (await this.hasLiveTombstone(key)) continue;
      const record = await this.readCurrentRecord(key);
      if (record?.projectId === projectId) records.push(record);
    }
    return records;
  }

  private async supersedePristineRecord(
    key: string,
    winnerClientRequestId: string,
  ) {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const current = await this.readCurrentRecord(key);
      if (!current || (await this.hasLiveTombstone(key))) return current;
      if (!isPristineReservationLoser(current)) return current;
      const next = supersededReservation(
        current,
        winnerClientRequestId,
        this.now(),
      );
      await this.hooks.beforeRecordCommit?.({
        operation: "supersede",
        current: cloneRecord(current),
        next: cloneRecord(next),
      });
      if (!(await this.commitRecord(current, next))) continue;
      await this.clearProjectSlotIfOwned(next);
      return next;
    }
    throw this.storeCorrupt("自定义问题验证冲突预留淘汰竞争未能收敛");
  }

  private async supersedePristineProjectLosers(
    projectId: string,
    winner: GeoCustomQuestionValidationRecord,
  ) {
    const losers = (await this.readProjectRecords(projectId))
      .filter((record) => record.key !== winner.key)
      .sort(compareRecoveryCandidates);
    for (const loser of losers) {
      await this.supersedePristineRecord(loser.key, winner.clientRequestId);
    }
  }

  private async recoverProjectAuthority(projectId: string) {
    const hash = projectHash(projectId);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const slot = await this.readCurrentProjectSlot(hash);
      if (slot?.deletionFence) return undefined;
      if (slot?.active) {
        const current = await this.readCurrentRecord(slot.active.key);
        const tombstoned = await this.hasLiveTombstone(slot.active.key);
        if (current && !tombstoned) {
          if (current.projectId !== projectId) {
            throw this.storeCorrupt("自定义问题验证项目占位身份冲突");
          }
          if (current.supersededByClientRequestId) {
            await this.clearProjectSlotIfOwned(current);
            continue;
          }
          await this.supersedePristineProjectLosers(projectId, current);
          return current;
        }
      }

      const candidate = (await this.readProjectRecords(projectId))
        .filter((record) => isRecoverableNonterminal(record, this.now()))
        .sort(compareRecoveryCandidates)[0];
      if (!candidate) {
        if (!slot?.active) return undefined;
        if (await this.commitProjectSlot(hash, slot, undefined))
          return undefined;
        continue;
      }
      const claimed = await this.commitProjectSlot(hash, slot, {
        key: candidate.key,
        clientRequestId: candidate.clientRequestId,
        expiresAt: candidate.expiresAt,
      });
      if (!claimed) continue;
      const authority = await this.readCurrentRecord(candidate.key);
      if (!authority || (await this.hasLiveTombstone(candidate.key))) continue;
      if (authority.projectId !== projectId) {
        throw this.storeCorrupt("自定义问题验证恢复占位身份冲突");
      }
      if (authority.supersededByClientRequestId) {
        await this.clearProjectSlotIfOwned(authority);
        continue;
      }
      if (isRecoverableNonterminal(authority, this.now())) {
        await this.supersedePristineProjectLosers(projectId, authority);
      }
      const latest = await this.readCurrentRecord(authority.key);
      if (latest?.supersededByClientRequestId) {
        await this.clearProjectSlotIfOwned(latest);
        continue;
      }
      return latest ?? authority;
    }
    throw this.storeCorrupt("自定义问题验证恢复占位竞争未能收敛");
  }

  private async commitRecord(
    current: GeoCustomQuestionValidationRecord,
    next: GeoCustomQuestionValidationRecord,
    allowDuringProjectDeletion = false,
  ) {
    if (
      !allowDuringProjectDeletion &&
      (await this.isProjectDeletionFenced(current.projectId))
    ) {
      return false;
    }
    if (await this.hasLiveTombstone(current.key)) return false;
    const target = this.recordVersionPath(
      current.key,
      current.storeVersion + 1,
    );
    const linked = await this.linkImmutableJson(target, next);
    if (
      (!allowDuringProjectDeletion &&
        (await this.isProjectDeletionFenced(current.projectId))) ||
      (await this.hasLiveTombstone(current.key))
    ) {
      if (linked) {
        await fs.unlink(target).catch((error) => {
          if (!isFileNotFoundError(error)) throw error;
        });
        await this.syncDirectory();
      }
      return false;
    }
    const authority = await this.readCurrentRecord(current.key);
    const won =
      linked &&
      authority?.storeVersion === next.storeVersion &&
      authority.commitId === next.commitId;
    if (won) await this.compactRecordVersions(current.key, next.storeVersion);
    return won;
  }

  private async commitProjectSlot(
    hash: string,
    current: z.infer<typeof ProjectSlotSchema> | undefined,
    active: z.infer<typeof ProjectSlotSchema>["active"],
    deletionFence?: z.infer<typeof ProjectSlotSchema>["deletionFence"],
  ) {
    const version = (current?.storeVersion ?? -1) + 1;
    const next = ProjectSlotSchema.parse({
      schemaVersion: STORE_SCHEMA_VERSION,
      projectHash: hash,
      storeVersion: version,
      commitId: crypto.randomUUID(),
      active,
      deletionFence,
      updatedAt: new Date(this.now()).toISOString(),
    });
    const linked = await this.linkImmutableJson(
      this.projectVersionPath(hash, version),
      next,
    );
    const authority = await this.readCurrentProjectSlot(hash);
    const won =
      linked &&
      authority?.storeVersion === version &&
      authority.commitId === next.commitId;
    if (won) await this.compactProjectVersions(hash, version);
    return won;
  }

  private async clearProjectSlotIfOwned(
    record: GeoCustomQuestionValidationRecord,
  ) {
    const hash = projectHash(record.projectId);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const slot = await this.readCurrentProjectSlot(hash);
      if (!slot?.active || slot.active.key !== record.key) return;
      if (await this.commitProjectSlot(hash, slot, undefined)) return;
    }
  }

  private async cancelProjectRecordsForDeletion(projectId: string) {
    const records = await this.readProjectRecords(projectId);
    for (const record of records) {
      for (let attempt = 0; attempt < 16; attempt += 1) {
        const current = await this.readCurrentRecord(record.key);
        if (
          !current ||
          isTerminal(current) ||
          (await this.hasLiveTombstone(record.key))
        ) {
          break;
        }
        if (
          await this.commitRecord(
            current,
            cancelledForProjectDeletion(current, this.now()),
            true,
          )
        ) {
          break;
        }
        if (attempt === 15) {
          throw this.storeCorrupt("自定义问题验证删除终止状态竞争未能收敛");
        }
      }
    }
  }

  private async assertProjectNotDeletionFenced(projectId: string) {
    const slot = await this.readCurrentProjectSlot(projectHash(projectId));
    if (slot?.deletionFence) throw this.projectDeletionFenced();
  }

  private async readCurrentRecord(key: string) {
    return this.readLatestVersion(
      new RegExp(`^${key}\\.record\\.v(\\d{${VERSION_WIDTH}})\\.json$`),
      (version) => this.recordVersionPath(key, version),
      parseRecord,
    );
  }

  private async readCurrentProjectSlot(hash: string) {
    return this.readLatestVersion(
      new RegExp(`^${hash}\\.project\\.v(\\d{${VERSION_WIDTH}})\\.json$`),
      (version) => this.projectVersionPath(hash, version),
      (value) => ProjectSlotSchema.parse(value),
    );
  }

  private async readLatestVersion<T>(
    pattern: RegExp,
    target: (version: number) => string,
    parse: (value: unknown) => T,
  ): Promise<T | undefined> {
    for (let retry = 0; retry < 3; retry += 1) {
      const versions = (await fs.readdir(this.directory))
        .map((name) => Number(pattern.exec(name)?.[1] ?? -1))
        .filter((version) => Number.isSafeInteger(version) && version >= 0)
        .sort((left, right) => right - left);
      if (!versions.length) return undefined;
      for (const version of versions) {
        try {
          return parse(JSON.parse(await fs.readFile(target(version), "utf8")));
        } catch (error) {
          if (isFileNotFoundError(error)) continue;
          throw this.storeCorrupt("自定义问题验证状态文件无法读取");
        }
      }
    }
    return undefined;
  }

  private async hasLiveTombstone(key: string) {
    return Boolean(await this.readTombstone(key));
  }

  private async readTombstone(key: string) {
    try {
      return TombstoneSchema.parse(
        JSON.parse(await fs.readFile(this.tombstonePath(key), "utf8")),
      );
    } catch (error) {
      if (isFileNotFoundError(error)) return undefined;
      throw this.storeCorrupt("自定义问题验证清理标记无法读取");
    }
  }

  private async readProjectTombstones(projectId: string) {
    const expectedProjectHash = projectHash(projectId);
    const tombstones: Array<z.infer<typeof TombstoneSchema>> = [];
    for (const name of await fs.readdir(this.directory)) {
      const identity = /^([a-f0-9]{64})\.tombstone\.json$/.exec(name);
      if (!identity?.[1]) continue;
      const tombstone = await this.readTombstone(identity[1]);
      if (tombstone?.projectHash === expectedProjectHash) {
        tombstones.push(tombstone);
      }
    }
    return tombstones;
  }

  private async readOrphanFileIds(recordKeys: Set<string>) {
    const fileIds: string[] = [];
    const pattern = /^([a-f0-9]{64})\.([a-f0-9]{64})\.orphan-file\.json$/;
    for (const name of await fs.readdir(this.directory)) {
      const identity = pattern.exec(name);
      if (!identity?.[1] || !recordKeys.has(identity[1])) continue;
      const marker = OrphanFileMarkerSchema.parse(
        JSON.parse(await fs.readFile(path.join(this.directory, name), "utf8")),
      );
      fileIds.push(marker.fileId);
    }
    return fileIds;
  }

  private async hasCleanupCompleteMarker(key: string) {
    try {
      const marker = CleanupCompleteMarkerSchema.parse(
        JSON.parse(
          await fs.readFile(this.cleanupCompleteMarkerPath(key), "utf8"),
        ),
      );
      if (marker.key !== key)
        throw this.storeCorrupt("自定义问题验证清理完成标记冲突");
      return true;
    } catch (error) {
      if (isFileNotFoundError(error)) return false;
      if (error instanceof GeoCustomQuestionValidationStoreError) throw error;
      throw this.storeCorrupt("自定义问题验证清理完成标记无法读取");
    }
  }

  private async createCleanupCompleteMarker(key: string, now: number) {
    const marker = CleanupCompleteMarkerSchema.parse({
      schemaVersion: STORE_SCHEMA_VERSION,
      key,
      completedAt: new Date(now).toISOString(),
    });
    const target = this.cleanupCompleteMarkerPath(key);
    const created = await this.linkImmutableJson(target, marker);
    if (created) return;
    if (!(await this.hasCleanupCompleteMarker(key))) {
      throw this.storeCorrupt("自定义问题验证清理完成标记未能持久化");
    }
  }

  private async createOrphanFileMarker(
    marker: z.infer<typeof OrphanFileMarkerSchema>,
  ) {
    const target = this.orphanFileMarkerPath(marker.recordKey, marker.fileId);
    const created = await this.linkImmutableJson(target, marker);
    if (created) return;
    const existing = OrphanFileMarkerSchema.parse(
      JSON.parse(await fs.readFile(target, "utf8")),
    );
    if (
      existing.recordKey !== marker.recordKey ||
      existing.fileId !== marker.fileId
    ) {
      throw this.storeCorrupt("自定义问题验证孤儿文件标记冲突");
    }
  }

  private async removeOrphanFileMarker(
    marker: z.infer<typeof OrphanFileMarkerSchema>,
  ) {
    await fs
      .unlink(this.orphanFileMarkerPath(marker.recordKey, marker.fileId))
      .catch((error) => {
        if (!isFileNotFoundError(error)) throw error;
      });
    await this.syncDirectory();
  }

  private async cleanupOrphanFileMarkers(
    nowMs: number,
    cleanup: (
      target: GeoCustomQuestionValidationCleanupTarget,
    ) => Promise<void>,
  ) {
    const result = { scanned: 0, retained: 0 };
    const pattern = /^([a-f0-9]{64})\.([a-f0-9]{64})\.orphan-file\.json$/;
    for (const name of await fs.readdir(this.directory)) {
      const identity = pattern.exec(name);
      if (!identity) continue;
      result.scanned += 1;
      const target = path.join(this.directory, name);
      const metadata = await fs.lstat(target);
      if (
        !metadata.isFile() ||
        metadata.isSymbolicLink() ||
        (metadata.mode & 0o777) !== 0o600
      ) {
        throw this.storeCorrupt("自定义问题验证孤儿文件标记权限无效");
      }
      const marker = OrphanFileMarkerSchema.parse(
        JSON.parse(await fs.readFile(target, "utf8")),
      );
      const expectedFileHash = crypto
        .createHash("sha256")
        .update(marker.fileId, "utf8")
        .digest("hex");
      if (
        marker.recordKey !== identity[1] ||
        expectedFileHash !== identity[2]
      ) {
        throw this.storeCorrupt("自定义问题验证孤儿文件标记身份与文件名不一致");
      }
      const current = await this.readCurrentRecord(marker.recordKey);
      const tracked = Boolean(
        current &&
          [
            ...current.orphanedTemporaryFileIds,
            current.archiveAttachment?.fileId,
            current.skillAttachment?.fileId,
            current.promptInputAttachment?.fileId,
            current.archiveStagingAttachment?.fileId,
            current.skillStagingAttachment?.fileId,
            current.promptInputStagingAttachment?.fileId,
          ].includes(marker.fileId),
      );
      if (tracked) {
        await this.removeOrphanFileMarker(marker);
        continue;
      }
      if (
        current &&
        !isTerminal(current) &&
        nowMs - Date.parse(marker.createdAt) < ORPHAN_FILE_MARKER_GRACE_MS
      ) {
        result.retained += 1;
        continue;
      }
      try {
        await cleanup({ temporaryFileIds: [marker.fileId] });
        await this.removeOrphanFileMarker(marker);
      } catch {
        result.retained += 1;
      }
    }
    return result;
  }

  private async createTombstone(value: z.infer<typeof TombstoneSchema>) {
    const target = this.tombstonePath(value.key);
    const created = await this.linkImmutableJson(target, value);
    if (created) return;
    const existing = TombstoneSchema.parse(
      JSON.parse(await fs.readFile(target, "utf8")),
    );
    if (existing.key !== value.key)
      throw this.storeCorrupt("自定义问题验证清理标记冲突");
  }

  private async linkImmutableJson(target: string, value: unknown) {
    const temporary = this.temporaryPath(path.basename(target));
    try {
      await this.writeDurableFile(
        temporary,
        `${JSON.stringify(value)}\n`,
        "wx",
      );
      try {
        await fs.link(temporary, target);
        await this.syncDirectory();
        return true;
      } catch (error) {
        if (isFileExistsError(error)) return false;
        throw error;
      }
    } finally {
      await fs.unlink(temporary).catch(() => undefined);
    }
  }

  private async writeDurableFile(
    target: string,
    content: string,
    flag: "wx" | "w",
  ) {
    const handle = await fs.open(target, flag, 0o600);
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private async compactRecordVersions(key: string, keepVersion: number) {
    await this.compactVersions(
      new RegExp(`^${key}\\.record\\.v(\\d{${VERSION_WIDTH}})\\.json$`),
      keepVersion,
    );
  }

  private async compactProjectVersions(hash: string, keepVersion: number) {
    await this.compactVersions(
      new RegExp(`^${hash}\\.project\\.v(\\d{${VERSION_WIDTH}})\\.json$`),
      keepVersion,
    );
  }

  private async compactVersions(pattern: RegExp, keepVersion: number) {
    const names = await fs.readdir(this.directory);
    await Promise.all(
      names.map(async (name) => {
        const version = Number(pattern.exec(name)?.[1] ?? -1);
        if (version < 0 || version >= keepVersion) return;
        await fs.unlink(path.join(this.directory, name)).catch(() => undefined);
      }),
    );
  }

  private async deleteRecordVersions(key: string) {
    const pattern = new RegExp(
      `^${key}\\.record\\.v\\d{${VERSION_WIDTH}}\\.json$`,
    );
    const names = await fs.readdir(this.directory);
    for (const name of names.filter((candidate) => pattern.test(candidate))) {
      const target = path.join(this.directory, name);
      await this.hooks.beforeDeleteRecordVersion?.(target);
      try {
        await fs.unlink(target);
      } catch (error) {
        if (!isFileNotFoundError(error)) throw error;
      }
    }
    const remaining = (await fs.readdir(this.directory)).filter((name) =>
      pattern.test(name),
    );
    if (remaining.length > 0) {
      throw new Error("custom-question record versions remain after cleanup");
    }
  }

  private async deleteRecordAuxiliaryFiles(key: string) {
    const names = await fs.readdir(this.directory);
    const exact = new Set([
      `${key}.cleanup-complete.json`,
      `${key}.tombstone.json`,
    ]);
    const orphanPrefix = `${key}.`;
    for (const name of names) {
      if (
        !exact.has(name) &&
        !(name.startsWith(orphanPrefix) && name.endsWith(".orphan-file.json"))
      ) {
        continue;
      }
      await fs.unlink(path.join(this.directory, name)).catch((error) => {
        if (!isFileNotFoundError(error)) throw error;
      });
    }
  }

  private async assertDirectory() {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    if (!this.security.requireSecurePermissions) return;
    const metadata = await fs.lstat(this.directory);
    const [realDirectory, realParent] = await Promise.all([
      fs.realpath(this.directory),
      fs.realpath(path.dirname(this.directory)),
    ]);
    const expectedRealDirectory = path.join(
      realParent,
      path.basename(this.directory),
    );
    if (
      metadata.isSymbolicLink() ||
      !metadata.isDirectory() ||
      path.resolve(realDirectory) !== path.resolve(expectedRealDirectory) ||
      (metadata.mode & 0o022) !== 0
    ) {
      throw this.storeCorrupt(
        "自定义问题验证持久目录必须是真实目录，且不得允许同组或其他用户写入",
      );
    }
  }

  private async assertManagedFilePermissions() {
    if (!this.security.requireSecurePermissions) return;
    const managedFilePattern =
      /^(?:\.persistence-sentinel\.json|[a-f0-9]{64}\.(?:record\.v\d{12}|project\.v\d{12}|tombstone|cleanup-complete)\.json|[a-f0-9]{64}\.[a-f0-9]{64}\.orphan-file\.json)$/;
    for (const name of await fs.readdir(this.directory)) {
      if (!managedFilePattern.test(name)) continue;
      const metadata = await fs.lstat(path.join(this.directory, name));
      if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600) {
        throw this.storeCorrupt(
          "自定义问题验证持久文件必须是权限 0600 的普通文件",
        );
      }
    }
  }

  private async cleanupStaleTemporaryFiles(nowMs: number) {
    const ownedTemporaryPattern = new RegExp(
      "^\\.(?:persistence-sentinel|[a-f0-9]{64}\\.(?:record\\.v\\d{12}|project\\.v\\d{12}|tombstone|cleanup-complete)\\.json|[a-f0-9]{64}\\.[a-f0-9]{64}\\.orphan-file\\.json)\\.\\d+\\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.tmp$",
    );
    for (const name of await fs.readdir(this.directory)) {
      if (!ownedTemporaryPattern.test(name)) continue;
      const target = path.join(this.directory, name);
      let metadata: Awaited<ReturnType<typeof fs.lstat>>;
      try {
        metadata = await fs.lstat(target);
      } catch (error) {
        if (isFileNotFoundError(error)) continue;
        throw error;
      }
      if (
        !metadata.isFile() ||
        metadata.isSymbolicLink() ||
        (metadata.mode & 0o777) !== 0o600 ||
        nowMs - metadata.mtimeMs < STALE_TEMPORARY_FILE_AGE_MS
      ) {
        continue;
      }
      await fs.unlink(target).catch((error) => {
        if (!isFileNotFoundError(error)) throw error;
      });
    }
    await this.syncDirectory();
  }

  private recordVersionPath(key: string, version: number) {
    return path.join(
      this.directory,
      `${key}.record.v${String(version).padStart(VERSION_WIDTH, "0")}.json`,
    );
  }

  private projectVersionPath(hash: string, version: number) {
    return path.join(
      this.directory,
      `${hash}.project.v${String(version).padStart(VERSION_WIDTH, "0")}.json`,
    );
  }

  private tombstonePath(key: string) {
    return path.join(this.directory, `${key}.tombstone.json`);
  }

  private cleanupCompleteMarkerPath(key: string) {
    return path.join(this.directory, `${key}.cleanup-complete.json`);
  }

  private orphanFileMarkerPath(recordKeyValue: string, fileId: string) {
    const fileHash = crypto
      .createHash("sha256")
      .update(fileId, "utf8")
      .digest("hex");
    return path.join(
      this.directory,
      `${recordKeyValue}.${fileHash}.orphan-file.json`,
    );
  }

  private temporaryPath(key: string) {
    return path.join(
      this.directory,
      `.${key}.${process.pid}.${crypto.randomUUID()}.tmp`,
    );
  }

  private async syncDirectory() {
    const handle = await fs.open(this.directory, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private leaseLost() {
    return new GeoCustomQuestionValidationStoreError(
      "LEASE_LOST",
      "自定义问题验证租约已失效",
    );
  }

  private projectDeletionFenced() {
    return new GeoCustomQuestionValidationStoreError(
      "PROJECT_DELETION_FENCED",
      "项目正在删除，不能再创建或恢复自定义问题验证",
    );
  }

  private projectDeletionBlocked(record: GeoCustomQuestionValidationRecord) {
    return new GeoCustomQuestionValidationStoreError(
      "PROJECT_DELETION_BLOCKED",
      "当前项目仍有自定义问题验证等待恢复、持久化或确认，完成后才能删除",
      activeOperation(record),
    );
  }

  private storeCorrupt(message: string) {
    return new GeoCustomQuestionValidationStoreError("STORE_CORRUPT", message);
  }
}

export function createGeoCustomQuestionValidationStore(
  options: {
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  const env = options.env ?? process.env;
  const configured = env.FRONTMIND_GEO_CUSTOM_QUESTION_STORE_DIR?.trim();
  if (env.NODE_ENV === "production" && !configured) {
    throw new Error(
      "FRONTMIND_GEO_CUSTOM_QUESTION_STORE_DIR must name a persistent directory in production",
    );
  }
  if (configured && !path.isAbsolute(configured)) {
    throw new Error(
      "FRONTMIND_GEO_CUSTOM_QUESTION_STORE_DIR must be an absolute path",
    );
  }
  const directory = configured
    ? path.resolve(configured)
    : path.resolve(
        process.cwd(),
        ".frontmind-state",
        "custom-question-validations",
      );
  return new FileGeoCustomQuestionValidationStore(
    directory,
    {},
    {
      requireSecurePermissions: env.NODE_ENV === "production",
    },
  );
}

export function geoCustomQuestionOwnerSessionHash(sessionId: string) {
  return crypto.createHash("sha256").update(sessionId, "utf8").digest("hex");
}

export function geoCustomQuestionRequestHash(input: {
  projectId: string;
  knowledgeBaseTaskId: string;
  question: string;
}) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        projectId: input.projectId,
        knowledgeBaseTaskId: input.knowledgeBaseTaskId,
        question: input.question,
      }),
      "utf8",
    )
    .digest("hex");
}

export function geoCustomQuestionHash(question: string) {
  return crypto.createHash("sha256").update(question, "utf8").digest("hex");
}

export function legacyGeoCustomQuestionClientRequestId(input: {
  projectId: string;
  ownerSessionHash: string;
  questionHash: string;
}) {
  const bytes = crypto
    .createHash("sha256")
    .update(
      `legacy-custom-question\n${input.projectId}\n${input.ownerSessionHash}\n${input.questionHash}`,
      "utf8",
    )
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function geoCustomQuestionOperationKey(record: {
  projectId: string;
  clientRequestId: string;
  questionHash: string;
  formatRetryCount?: number;
}) {
  return [
    "geo",
    record.projectId,
    "custom-question-classifier",
    record.clientRequestId,
    record.questionHash.slice(0, 24),
    `format-${record.formatRetryCount ?? 0}`,
  ].join(":");
}

export function terminalCustomQuestionValidationResult(
  record: GeoCustomQuestionValidationRecord,
): GeoQuestion | undefined {
  return record.state === "completed" ? record.result : undefined;
}

function isFileExistsError(error: unknown) {
  return (error as NodeJS.ErrnoException)?.code === "EEXIST";
}

function isFileNotFoundError(error: unknown) {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}
