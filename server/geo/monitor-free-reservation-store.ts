import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

const RECORD_SCHEMA_VERSION = 1;
const DEFAULT_PRISTINE_TTL_MS = 10 * 60 * 1000;
const LOCK_STALE_MS = 30_000;
const LOCK_RETRY_MS = 20;
const LOCK_WAIT_MS = 5_000;
const TEMP_FILE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const ReservationStateSchema = z.enum([
  "reserved",
  "submitting",
  "submitted",
  "started",
  "failed",
]);

const ReservationRecordSchema = z
  .object({
    schemaVersion: z.literal(RECORD_SCHEMA_VERSION),
    projectId: z.string().min(1).max(256),
    projectHash: z.string().regex(/^[a-f0-9]{64}$/),
    scopeHash: z.string().regex(/^[a-f0-9]{64}$/),
    clientRequestId: z.string().uuid(),
    idempotencyKey: z.string().regex(/^geo-monitor-free:v2:[a-f0-9]{64}$/),
    submissionKey: z.string().min(16).max(512).optional(),
    state: ReservationStateSchema,
    runId: z.string().min(1).max(256).optional(),
    runStatus: z.string().min(1).max(80).optional(),
    revision: z.number().int().nonnegative(),
    commitId: z.string().uuid(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    pristineExpiresAt: z.string().datetime(),
  })
  .strict()
  .superRefine((record, context) => {
    if (record.projectHash !== monitorFreeProjectHash(record.projectId)) {
      context.addIssue({
        code: "custom",
        path: ["projectHash"],
        message: "project hash mismatch",
      });
    }
    if (record.state === "reserved") {
      if (record.submissionKey || record.runId || record.runStatus) {
        context.addIssue({
          code: "custom",
          path: ["state"],
          message: "reserved record contains submission state",
        });
      }
      return;
    }
    if (!record.submissionKey) {
      context.addIssue({
        code: "custom",
        path: ["submissionKey"],
        message: "submission key is required after submission begins",
      });
    }
    if (["submitted", "started", "failed"].includes(record.state)) {
      if (!record.runId || !record.runStatus) {
        context.addIssue({
          code: "custom",
          path: ["runId"],
          message: "provider run identity is required",
        });
      }
    }
  });

const DeletionFenceSchema = z
  .object({
    schemaVersion: z.literal(RECORD_SCHEMA_VERSION),
    projectId: z.string().min(1).max(256),
    projectHash: z.string().regex(/^[a-f0-9]{64}$/),
    createdAt: z.string().datetime(),
  })
  .strict();

export type GeoMonitorFreeReservationRecord = z.infer<
  typeof ReservationRecordSchema
>;

export type GeoMonitorFreeReservationState = z.infer<
  typeof ReservationStateSchema
>;

export type GeoMonitorFreeReservationStoreErrorCode =
  | "SCOPE_CONFLICT"
  | "CLIENT_REQUEST_CONFLICT"
  | "PROJECT_DELETION_FENCED"
  | "PROJECT_DELETION_BLOCKED"
  | "RESERVATION_NOT_FOUND"
  | "RESERVATION_STATE_CONFLICT"
  | "STORE_BUSY"
  | "STORE_CORRUPT"
  | "STORE_UNAVAILABLE";

export class GeoMonitorFreeReservationStoreError extends Error {
  constructor(
    readonly code: GeoMonitorFreeReservationStoreErrorCode,
    message: string,
    readonly record?: GeoMonitorFreeReservationRecord,
  ) {
    super(message);
    this.name = "GeoMonitorFreeReservationStoreError";
  }
}

export type GeoMonitorFreeReserveInput = {
  projectId: string;
  scopeHash: string;
  clientRequestId: string;
  idempotencyKey: string;
};

export interface GeoMonitorFreeReservationStore {
  assertReady(): Promise<void>;
  persistenceIdentity(): Promise<string>;
  isProjectDeletionFenced(projectId: string): Promise<boolean>;
  get(projectId: string): Promise<GeoMonitorFreeReservationRecord | undefined>;
  reserve(input: GeoMonitorFreeReserveInput): Promise<{
    record: GeoMonitorFreeReservationRecord;
    created: boolean;
  }>;
  markSubmitting(input: {
    projectId: string;
    scopeHash: string;
    idempotencyKey: string;
    submissionKey: string;
  }): Promise<GeoMonitorFreeReservationRecord>;
  markRun(input: {
    projectId: string;
    scopeHash: string;
    idempotencyKey: string;
    submissionKey: string;
    runId: string;
    runStatus: string;
    state: Extract<
      GeoMonitorFreeReservationState,
      "submitted" | "started" | "failed"
    >;
  }): Promise<GeoMonitorFreeReservationRecord>;
  releasePristine(input: {
    projectId: string;
    scopeHash: string;
    idempotencyKey: string;
  }): Promise<boolean>;
  releaseConfirmedRejected(input: {
    projectId: string;
    scopeHash: string;
    idempotencyKey: string;
    submissionKey: string;
  }): Promise<boolean>;
  fenceProjectDeletion(projectId: string): Promise<{
    runId?: string;
    hadReservation: boolean;
  }>;
  purgeProject(projectId: string): Promise<void>;
  collectGarbage(options?: { now?: number }): Promise<{
    expiredReservations: number;
    temporaryFiles: number;
  }>;
}

type StoreOptions = {
  now?: () => number;
  pristineTtlMs?: number;
  requireSecurePermissions?: boolean;
  lockStaleMs?: number;
  lockHeartbeatMs?: number;
  lockWaitMs?: number;
  beforeCommit?: () => Promise<void>;
};

function cloneRecord(record: GeoMonitorFreeReservationRecord) {
  return structuredClone(record);
}

export function monitorFreeProjectHash(projectId: string) {
  return crypto.createHash("sha256").update(projectId, "utf8").digest("hex");
}

function reservationIdentityMatches(
  record: GeoMonitorFreeReservationRecord,
  input: {
    projectId: string;
    scopeHash: string;
    idempotencyKey: string;
  },
) {
  return (
    record.projectId === input.projectId &&
    record.scopeHash === input.scopeHash &&
    record.idempotencyKey === input.idempotencyKey
  );
}

function assertReservationIdentity(
  record: GeoMonitorFreeReservationRecord,
  input: {
    projectId: string;
    scopeHash: string;
    idempotencyKey: string;
  },
) {
  if (!reservationIdentityMatches(record, input)) {
    throw new GeoMonitorFreeReservationStoreError(
      record.scopeHash === input.scopeHash
        ? "RESERVATION_STATE_CONFLICT"
        : "SCOPE_CONFLICT",
      "该项目已有不同范围的免费监控 reservation",
      cloneRecord(record),
    );
  }
}

function nextRecord(
  record: GeoMonitorFreeReservationRecord,
  nowMs: number,
  patch: Partial<GeoMonitorFreeReservationRecord>,
) {
  return ReservationRecordSchema.parse({
    ...record,
    ...patch,
    revision: record.revision + 1,
    commitId: crypto.randomUUID(),
    updatedAt: new Date(nowMs).toISOString(),
  });
}

function newRecord(
  input: GeoMonitorFreeReserveInput,
  nowMs: number,
  pristineTtlMs: number,
) {
  const timestamp = new Date(nowMs).toISOString();
  return ReservationRecordSchema.parse({
    schemaVersion: RECORD_SCHEMA_VERSION,
    projectId: input.projectId,
    projectHash: monitorFreeProjectHash(input.projectId),
    scopeHash: input.scopeHash,
    clientRequestId: input.clientRequestId,
    idempotencyKey: input.idempotencyKey,
    state: "reserved",
    revision: 0,
    commitId: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    pristineExpiresAt: new Date(nowMs + pristineTtlMs).toISOString(),
  });
}

export class MemoryGeoMonitorFreeReservationStore
  implements GeoMonitorFreeReservationStore
{
  private readonly records = new Map<string, GeoMonitorFreeReservationRecord>();
  private readonly deletionFences = new Set<string>();
  private readonly identity = crypto.randomUUID();

  constructor(private readonly options: StoreOptions = {}) {}

  private now() {
    return this.options.now?.() ?? Date.now();
  }

  async assertReady() {}

  async persistenceIdentity() {
    return this.identity;
  }

  async isProjectDeletionFenced(projectId: string) {
    return this.deletionFences.has(projectId);
  }

  async get(projectId: string) {
    const record = this.records.get(projectId);
    return record ? cloneRecord(record) : undefined;
  }

  async reserve(input: GeoMonitorFreeReserveInput) {
    if (this.deletionFences.has(input.projectId)) {
      throw new GeoMonitorFreeReservationStoreError(
        "PROJECT_DELETION_FENCED",
        "项目正在删除，不能创建或恢复免费监控",
      );
    }
    const current = this.records.get(input.projectId);
    if (current) {
      if (current.scopeHash !== input.scopeHash) {
        throw new GeoMonitorFreeReservationStoreError(
          "SCOPE_CONFLICT",
          "该项目已有一项不同范围的监控任务",
          cloneRecord(current),
        );
      }
      assertReservationIdentity(current, input);
      return { record: cloneRecord(current), created: false };
    }
    const record = newRecord(
      input,
      this.now(),
      this.options.pristineTtlMs ?? DEFAULT_PRISTINE_TTL_MS,
    );
    this.records.set(input.projectId, record);
    return { record: cloneRecord(record), created: true };
  }

  async markSubmitting(
    input: Parameters<GeoMonitorFreeReservationStore["markSubmitting"]>[0],
  ) {
    const current = this.records.get(input.projectId);
    if (!current) {
      throw new GeoMonitorFreeReservationStoreError(
        "RESERVATION_NOT_FOUND",
        "免费监控 reservation 不存在",
      );
    }
    assertReservationIdentity(current, input);
    if (current.state !== "reserved") {
      if (current.submissionKey !== input.submissionKey) {
        throw new GeoMonitorFreeReservationStoreError(
          "RESERVATION_STATE_CONFLICT",
          "免费监控 submission identity 不一致",
          cloneRecord(current),
        );
      }
      return cloneRecord(current);
    }
    const next = nextRecord(current, this.now(), {
      state: "submitting",
      submissionKey: input.submissionKey,
    });
    this.records.set(input.projectId, next);
    return cloneRecord(next);
  }

  async markRun(
    input: Parameters<GeoMonitorFreeReservationStore["markRun"]>[0],
  ) {
    const current = this.records.get(input.projectId);
    if (!current) {
      throw new GeoMonitorFreeReservationStoreError(
        "RESERVATION_NOT_FOUND",
        "免费监控 reservation 不存在",
      );
    }
    assertReservationIdentity(current, input);
    if (
      current.submissionKey !== input.submissionKey ||
      (current.runId && current.runId !== input.runId)
    ) {
      throw new GeoMonitorFreeReservationStoreError(
        "RESERVATION_STATE_CONFLICT",
        "免费监控 provider identity 不一致",
        cloneRecord(current),
      );
    }
    if (current.state === "reserved") {
      throw new GeoMonitorFreeReservationStoreError(
        "RESERVATION_STATE_CONFLICT",
        "免费监控尚未进入 provider submission",
        cloneRecord(current),
      );
    }
    if (current.state === "started" && input.state !== "started") {
      return cloneRecord(current);
    }
    if (current.state === "failed" && input.state !== "failed") {
      return cloneRecord(current);
    }
    const next = nextRecord(current, this.now(), {
      state: input.state,
      runId: input.runId,
      runStatus: input.runStatus,
      submissionKey: input.submissionKey,
    });
    this.records.set(input.projectId, next);
    return cloneRecord(next);
  }

  async releasePristine(
    input: Parameters<GeoMonitorFreeReservationStore["releasePristine"]>[0],
  ) {
    const current = this.records.get(input.projectId);
    if (!current) return false;
    assertReservationIdentity(current, input);
    if (current.state !== "reserved") return false;
    this.records.delete(input.projectId);
    return true;
  }

  async releaseConfirmedRejected(
    input: Parameters<
      GeoMonitorFreeReservationStore["releaseConfirmedRejected"]
    >[0],
  ) {
    const current = this.records.get(input.projectId);
    if (!current) return false;
    assertReservationIdentity(current, input);
    if (
      current.state !== "submitting" ||
      current.submissionKey !== input.submissionKey ||
      current.runId
    ) {
      return false;
    }
    this.records.delete(input.projectId);
    return true;
  }

  async fenceProjectDeletion(projectId: string) {
    const current = this.records.get(projectId);
    if (current?.state === "submitting" && !current.runId) {
      throw new GeoMonitorFreeReservationStoreError(
        "PROJECT_DELETION_BLOCKED",
        "监控创建结果仍未知，确认结果前不能删除项目",
        cloneRecord(current),
      );
    }
    this.deletionFences.add(projectId);
    if (current?.state === "reserved") this.records.delete(projectId);
    return {
      runId: current?.runId,
      hadReservation: Boolean(current),
    };
  }

  async purgeProject(projectId: string) {
    this.records.delete(projectId);
  }

  async collectGarbage(options: { now?: number } = {}) {
    const now = options.now ?? this.now();
    let expiredReservations = 0;
    for (const [projectId, record] of Array.from(this.records.entries())) {
      if (
        record.state === "reserved" &&
        Date.parse(record.pristineExpiresAt) <= now &&
        !this.deletionFences.has(projectId)
      ) {
        this.records.delete(projectId);
        expiredReservations += 1;
      }
    }
    return { expiredReservations, temporaryFiles: 0 };
  }
}

export class FileGeoMonitorFreeReservationStore
  implements GeoMonitorFreeReservationStore
{
  private readonly now: () => number;
  private readonly pristineTtlMs: number;
  private readonly requireSecurePermissions: boolean;
  private readonly lockStaleMs: number;
  private readonly lockHeartbeatMs: number;
  private readonly lockWaitMs: number;
  private readonly beforeCommit?: () => Promise<void>;
  private startupRecovery?: Promise<void>;

  constructor(
    readonly directory: string,
    options: StoreOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.pristineTtlMs = options.pristineTtlMs ?? DEFAULT_PRISTINE_TTL_MS;
    this.requireSecurePermissions = options.requireSecurePermissions ?? false;
    this.lockStaleMs = options.lockStaleMs ?? LOCK_STALE_MS;
    this.lockHeartbeatMs =
      options.lockHeartbeatMs ?? Math.max(5, Math.floor(this.lockStaleMs / 3));
    this.lockWaitMs = options.lockWaitMs ?? LOCK_WAIT_MS;
    this.beforeCommit = options.beforeCommit;
  }

  async assertReady() {
    await this.ensureDirectory();
    this.startupRecovery ??= this.recoverStartupLocks();
    await this.startupRecovery;
    const stat = await fs.stat(this.directory);
    if (!stat.isDirectory()) throw this.unavailable("持久路径不是目录");
    if (this.requireSecurePermissions && (stat.mode & 0o077) !== 0) {
      throw this.unavailable("免费监控 reservation 目录权限过宽");
    }
    await this.ensureIdentity();
    const probe = path.join(
      this.directory,
      `.ready.${process.pid}.${crypto.randomUUID()}.tmp`,
    );
    const handle = await fs.open(probe, "wx", 0o600);
    try {
      await handle.writeFile("ready\n", "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.unlink(probe);
    await this.syncDirectory();
  }

  async persistenceIdentity() {
    await this.ensureDirectory();
    return this.ensureIdentity();
  }

  async isProjectDeletionFenced(projectId: string) {
    await this.ensureDirectory();
    try {
      await fs.access(this.fencePath(monitorFreeProjectHash(projectId)));
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw this.unavailable("无法读取项目删除 fence", error);
    }
  }

  async get(projectId: string) {
    await this.ensureDirectory();
    return this.readRecord(projectId);
  }

  async reserve(input: GeoMonitorFreeReserveInput) {
    return this.withProjectLock(input.projectId, async (projectHash) => {
      if (await this.fileExists(this.fencePath(projectHash))) {
        throw new GeoMonitorFreeReservationStoreError(
          "PROJECT_DELETION_FENCED",
          "项目正在删除，不能创建或恢复免费监控",
        );
      }
      const current = await this.readRecord(input.projectId);
      if (current) {
        if (current.scopeHash !== input.scopeHash) {
          throw new GeoMonitorFreeReservationStoreError(
            "SCOPE_CONFLICT",
            "该项目已有一项不同范围的监控任务",
            current,
          );
        }
        assertReservationIdentity(current, input);
        return { record: current, created: false };
      }
      const record = newRecord(input, this.now(), this.pristineTtlMs);
      await this.writeRecord(projectHash, record);
      return { record, created: true };
    });
  }

  async markSubmitting(
    input: Parameters<GeoMonitorFreeReservationStore["markSubmitting"]>[0],
  ) {
    return this.withProjectLock(input.projectId, async (projectHash) => {
      const current = await this.requireRecord(input.projectId);
      assertReservationIdentity(current, input);
      if (current.state !== "reserved") {
        if (current.submissionKey !== input.submissionKey) {
          throw this.stateConflict(current);
        }
        return current;
      }
      const next = nextRecord(current, this.now(), {
        state: "submitting",
        submissionKey: input.submissionKey,
      });
      await this.writeRecord(projectHash, next);
      return next;
    });
  }

  async markRun(
    input: Parameters<GeoMonitorFreeReservationStore["markRun"]>[0],
  ) {
    return this.withProjectLock(input.projectId, async (projectHash) => {
      const current = await this.requireRecord(input.projectId);
      assertReservationIdentity(current, input);
      if (
        current.submissionKey !== input.submissionKey ||
        (current.runId && current.runId !== input.runId) ||
        current.state === "reserved"
      ) {
        throw this.stateConflict(current);
      }
      if (current.state === "started" && input.state !== "started") {
        return current;
      }
      if (current.state === "failed" && input.state !== "failed") {
        return current;
      }
      const next = nextRecord(current, this.now(), {
        state: input.state,
        runId: input.runId,
        runStatus: input.runStatus,
        submissionKey: input.submissionKey,
      });
      await this.writeRecord(projectHash, next);
      return next;
    });
  }

  async releasePristine(
    input: Parameters<GeoMonitorFreeReservationStore["releasePristine"]>[0],
  ) {
    return this.withProjectLock(input.projectId, async (projectHash) => {
      const current = await this.readRecord(input.projectId);
      if (!current) return false;
      assertReservationIdentity(current, input);
      if (current.state !== "reserved") return false;
      await this.unlinkIfExists(this.recordPath(projectHash));
      await this.syncDirectory();
      return true;
    });
  }

  async releaseConfirmedRejected(
    input: Parameters<
      GeoMonitorFreeReservationStore["releaseConfirmedRejected"]
    >[0],
  ) {
    return this.withProjectLock(input.projectId, async (projectHash) => {
      const current = await this.readRecord(input.projectId);
      if (!current) return false;
      assertReservationIdentity(current, input);
      if (
        current.state !== "submitting" ||
        current.submissionKey !== input.submissionKey ||
        current.runId
      ) {
        return false;
      }
      await this.unlinkIfExists(this.recordPath(projectHash));
      await this.syncDirectory();
      return true;
    });
  }

  async fenceProjectDeletion(projectId: string) {
    return this.withProjectLock(projectId, async (projectHash) => {
      const current = await this.readRecord(projectId);
      if (current?.state === "submitting" && !current.runId) {
        throw new GeoMonitorFreeReservationStoreError(
          "PROJECT_DELETION_BLOCKED",
          "监控创建结果仍未知，确认结果前不能删除项目",
          current,
        );
      }
      if (!(await this.fileExists(this.fencePath(projectHash)))) {
        await this.atomicWrite(
          this.fencePath(projectHash),
          `${JSON.stringify({
            schemaVersion: RECORD_SCHEMA_VERSION,
            projectId,
            projectHash,
            createdAt: new Date(this.now()).toISOString(),
          })}\n`,
        );
      }
      if (current?.state === "reserved") {
        await this.unlinkIfExists(this.recordPath(projectHash));
        await this.syncDirectory();
      }
      return {
        runId: current?.runId,
        hadReservation: Boolean(current),
      };
    });
  }

  async purgeProject(projectId: string) {
    await this.withProjectLock(projectId, async (projectHash) => {
      await this.unlinkIfExists(this.recordPath(projectHash));
      await this.syncDirectory();
    });
  }

  async collectGarbage(options: { now?: number } = {}) {
    await this.ensureDirectory();
    const now = options.now ?? this.now();
    const entries = await fs.readdir(this.directory, { withFileTypes: true });
    let expiredReservations = 0;
    let temporaryFiles = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fullPath = path.join(this.directory, entry.name);
      if (entry.name.startsWith(".") && entry.name.endsWith(".tmp")) {
        try {
          const stat = await fs.stat(fullPath);
          if (stat.mtimeMs <= now - TEMP_FILE_MAX_AGE_MS) {
            await fs.unlink(fullPath);
            temporaryFiles += 1;
          }
        } catch (error) {
          if (!isNotFound(error)) throw error;
        }
        continue;
      }
      if (!/^[a-f0-9]{64}\.reservation\.json$/.test(entry.name)) continue;
      let parsed: GeoMonitorFreeReservationRecord;
      try {
        parsed = ReservationRecordSchema.parse(
          JSON.parse(await fs.readFile(fullPath, "utf8")),
        );
      } catch (error) {
        throw this.corrupt("免费监控 reservation 文件损坏", error);
      }
      if (
        parsed.state === "reserved" &&
        Date.parse(parsed.pristineExpiresAt) <= now
      ) {
        const released = await this.releasePristine(parsed);
        if (released) expiredReservations += 1;
      }
    }
    if (temporaryFiles > 0) await this.syncDirectory();
    return { expiredReservations, temporaryFiles };
  }

  private async ensureDirectory() {
    try {
      const created = await fs.mkdir(this.directory, {
        recursive: true,
        mode: 0o700,
      });
      if (this.requireSecurePermissions) await fs.chmod(this.directory, 0o700);
      if (created) {
        const parent = await fs.open(path.dirname(this.directory), "r");
        try {
          await parent.sync();
        } finally {
          await parent.close();
        }
      }
    } catch (error) {
      throw this.unavailable("无法准备免费监控 reservation 目录", error);
    }
  }

  private async recoverStartupLocks() {
    // Dashboard Dev runs one Website process. A lock present at process
    // startup therefore has no live owner. Recovery runs once before traffic;
    // runtime contenders never steal a lock based on mtime.
    const entries = await fs.readdir(this.directory, { withFileTypes: true });
    let removed = 0;
    for (const entry of entries) {
      if (!entry.isFile() || !/^[a-f0-9]{64}\.lock$/.test(entry.name)) {
        continue;
      }
      await this.unlinkIfExists(path.join(this.directory, entry.name));
      removed += 1;
    }
    if (removed > 0) await this.syncDirectory();
  }

  private async ensureIdentity() {
    const identityPath = path.join(this.directory, ".store-identity");
    try {
      return (await fs.readFile(identityPath, "utf8")).trim();
    } catch (error) {
      if (!isNotFound(error)) {
        throw this.unavailable("无法读取持久卷 identity", error);
      }
    }
    const identity = crypto.randomUUID();
    try {
      const handle = await fs.open(identityPath, "wx", 0o600);
      try {
        await handle.writeFile(`${identity}\n`, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await this.syncDirectory();
      return identity;
    } catch (error) {
      if (isExists(error)) {
        return (await fs.readFile(identityPath, "utf8")).trim();
      }
      throw this.unavailable("无法创建持久卷 identity", error);
    }
  }

  private async withProjectLock<T>(
    projectId: string,
    operation: (projectHash: string) => Promise<T>,
  ) {
    await this.ensureDirectory();
    const projectHash = monitorFreeProjectHash(projectId);
    const lockPath = this.lockPath(projectHash);
    const deadline = Date.now() + this.lockWaitMs;
    const lockNonce = crypto.randomUUID();
    let lockAcquired = false;
    while (!lockAcquired) {
      try {
        const handle = await fs.open(lockPath, "wx", 0o600);
        try {
          await handle.writeFile(
            `${JSON.stringify({
              pid: process.pid,
              nonce: lockNonce,
              createdAt: new Date().toISOString(),
            })}\n`,
            "utf8",
          );
          await handle.sync();
        } finally {
          await handle.close();
        }
        await this.syncDirectory();
        lockAcquired = true;
      } catch (error) {
        if (!isExists(error)) {
          throw this.unavailable("无法取得免费监控 project lock", error);
        }
        if (Date.now() >= deadline) {
          throw new GeoMonitorFreeReservationStoreError(
            "STORE_BUSY",
            "免费监控 reservation 正在由另一请求更新",
          );
        }
        await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
      }
    }
    let heartbeatLost = false;
    let heartbeatTail = Promise.resolve();
    const heartbeat = () => {
      heartbeatTail = heartbeatTail.then(async () => {
        try {
          const lock = JSON.parse(await fs.readFile(lockPath, "utf8")) as {
            nonce?: unknown;
          };
          if (lock.nonce !== lockNonce) {
            heartbeatLost = true;
            return;
          }
          const now = new Date();
          await fs.utimes(lockPath, now, now);
        } catch (error) {
          heartbeatLost = true;
          if (!isNotFound(error)) {
            // The operation checks heartbeatLost before committing.  Avoid an
            // unhandled rejection from the timer while preserving fail-close.
          }
        }
      });
    };
    const heartbeatTimer = setInterval(heartbeat, this.lockHeartbeatMs);
    heartbeatTimer.unref();
    try {
      const result = await operation(projectHash);
      await heartbeatTail;
      if (heartbeatLost) {
        throw new GeoMonitorFreeReservationStoreError(
          "STORE_BUSY",
          "免费监控 project lock 在提交期间失效",
        );
      }
      return result;
    } finally {
      clearInterval(heartbeatTimer);
      await heartbeatTail;
      try {
        const lock = JSON.parse(await fs.readFile(lockPath, "utf8")) as {
          nonce?: unknown;
        };
        if (lock.nonce === lockNonce) {
          await fs.unlink(lockPath);
          await this.syncDirectory();
        }
      } catch (error) {
        if (!isNotFound(error)) {
          throw this.unavailable("无法释放免费监控 project lock", error);
        }
      }
    }
  }

  private async readRecord(projectId: string) {
    const projectHash = monitorFreeProjectHash(projectId);
    try {
      const record = ReservationRecordSchema.parse(
        JSON.parse(await fs.readFile(this.recordPath(projectHash), "utf8")),
      );
      if (record.projectId !== projectId) {
        throw this.corrupt("免费监控 reservation project identity 不一致");
      }
      return record;
    } catch (error) {
      if (isNotFound(error)) return undefined;
      if (error instanceof GeoMonitorFreeReservationStoreError) throw error;
      throw this.corrupt("免费监控 reservation 文件损坏", error);
    }
  }

  private async requireRecord(projectId: string) {
    const record = await this.readRecord(projectId);
    if (!record) {
      throw new GeoMonitorFreeReservationStoreError(
        "RESERVATION_NOT_FOUND",
        "免费监控 reservation 不存在",
      );
    }
    return record;
  }

  private async writeRecord(
    projectHash: string,
    record: GeoMonitorFreeReservationRecord,
  ) {
    await this.atomicWrite(
      this.recordPath(projectHash),
      `${JSON.stringify(ReservationRecordSchema.parse(record))}\n`,
    );
  }

  private async atomicWrite(target: string, contents: string) {
    const temporary = path.join(
      this.directory,
      `.${path.basename(target)}.${process.pid}.${crypto.randomUUID()}.tmp`,
    );
    let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
      handle = await fs.open(temporary, "wx", 0o600);
      await handle.writeFile(contents, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await this.beforeCommit?.();
      await fs.rename(temporary, target);
      await this.syncDirectory();
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await this.unlinkIfExists(temporary);
      if (error instanceof GeoMonitorFreeReservationStoreError) throw error;
      throw this.unavailable("无法原子保存免费监控 reservation", error);
    }
  }

  private async syncDirectory() {
    const handle = await fs.open(this.directory, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private recordPath(projectHash: string) {
    return path.join(this.directory, `${projectHash}.reservation.json`);
  }

  private fencePath(projectHash: string) {
    return path.join(this.directory, `${projectHash}.deleting.json`);
  }

  private lockPath(projectHash: string) {
    return path.join(this.directory, `${projectHash}.lock`);
  }

  private async fileExists(filename: string) {
    try {
      await fs.access(filename);
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw this.unavailable("无法读取免费监控 reservation 状态", error);
    }
  }

  private async unlinkIfExists(filename: string) {
    try {
      await fs.unlink(filename);
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  private stateConflict(record: GeoMonitorFreeReservationRecord) {
    return new GeoMonitorFreeReservationStoreError(
      "RESERVATION_STATE_CONFLICT",
      "免费监控 reservation 状态冲突",
      record,
    );
  }

  private corrupt(message: string, cause?: unknown) {
    return new GeoMonitorFreeReservationStoreError(
      "STORE_CORRUPT",
      `${message}${cause instanceof Error ? `: ${cause.message}` : ""}`,
    );
  }

  private unavailable(message: string, cause?: unknown) {
    return new GeoMonitorFreeReservationStoreError(
      "STORE_UNAVAILABLE",
      `${message}${cause instanceof Error ? `: ${cause.message}` : ""}`,
    );
  }
}

export function createGeoMonitorFreeReservationStore(
  options: { env?: NodeJS.ProcessEnv } = {},
) {
  const env = options.env ?? process.env;
  const explicit = env.FRONTMIND_GEO_MONITOR_FREE_RESERVATION_STORE_DIR?.trim();
  const customQuestionDirectory =
    env.FRONTMIND_GEO_CUSTOM_QUESTION_STORE_DIR?.trim();
  if (explicit && !path.isAbsolute(explicit)) {
    throw new Error(
      "FRONTMIND_GEO_MONITOR_FREE_RESERVATION_STORE_DIR must be an absolute path",
    );
  }
  if (customQuestionDirectory && !path.isAbsolute(customQuestionDirectory)) {
    throw new Error(
      "FRONTMIND_GEO_CUSTOM_QUESTION_STORE_DIR must be an absolute path",
    );
  }
  if (env.NODE_ENV === "test" && !explicit && !customQuestionDirectory) {
    return new MemoryGeoMonitorFreeReservationStore();
  }
  const directory = explicit
    ? path.resolve(explicit)
    : customQuestionDirectory
      ? path.join(
          path.dirname(path.resolve(customQuestionDirectory)),
          "monitor-free-reservations",
        )
      : path.resolve(
          process.cwd(),
          ".frontmind-state",
          "monitor-free-reservations",
        );
  return new FileGeoMonitorFreeReservationStore(directory, {
    requireSecurePermissions: env.NODE_ENV === "production",
  });
}

function isExists(error: unknown) {
  return (error as NodeJS.ErrnoException)?.code === "EEXIST";
}

function isNotFound(error: unknown) {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}
