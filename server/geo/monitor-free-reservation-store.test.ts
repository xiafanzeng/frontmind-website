import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createGeoMonitorFreeReservationStore,
  FileGeoMonitorFreeReservationStore,
  GeoMonitorFreeReservationStoreError,
  monitorFreeProjectHash,
} from "./monitor-free-reservation-store";

const PROJECT_ID = "project-monitor-free-ledger";
const SCOPE_HASH = "a".repeat(64);
const OTHER_SCOPE_HASH = "b".repeat(64);
const CLIENT_REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const NEW_CLIENT_REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const IDEMPOTENCY_KEY = `geo-monitor-free:v2:${SCOPE_HASH}`;
const SUBMISSION_KEY = IDEMPOTENCY_KEY;

const temporaryDirectories: string[] = [];

async function temporaryDirectory() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "frontmind-monitor-free-store-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

function reserveInput(
  overrides: Partial<{
    projectId: string;
    scopeHash: string;
    clientRequestId: string;
    idempotencyKey: string;
  }> = {},
) {
  return {
    projectId: PROJECT_ID,
    scopeHash: SCOPE_HASH,
    clientRequestId: CLIENT_REQUEST_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    ...overrides,
  };
}

describe("FileGeoMonitorFreeReservationStore", () => {
  it("uses the retired store path only as a persistent sibling hint without reading its JSON", async () => {
    const parent = await temporaryDirectory();
    const retiredDirectory = path.join(parent, "custom-question-validations");
    await fs.mkdir(retiredDirectory);
    const legacyFile = path.join(retiredDirectory, "legacy.json");
    await fs.writeFile(legacyFile, "{malformed legacy state", "utf8");

    const store = createGeoMonitorFreeReservationStore({
      env: {
        NODE_ENV: "test",
        FRONTMIND_GEO_CUSTOM_QUESTION_STORE_DIR: retiredDirectory,
      },
    });
    await store.assertReady();
    await store.reserve(reserveInput());

    await expect(fs.readFile(legacyFile, "utf8")).resolves.toBe(
      "{malformed legacy state",
    );
    await expect(
      fs.access(
        path.join(
          parent,
          "monitor-free-reservations",
          `${monitorFreeProjectHash(PROJECT_ID)}.reservation.json`,
        ),
      ),
    ).resolves.toBeUndefined();
  });

  it("removes a crash-left lock during startup before the first reservation", async () => {
    const directory = await temporaryDirectory();
    const lockPath = path.join(
      directory,
      `${monitorFreeProjectHash(PROJECT_ID)}.lock`,
    );
    await fs.writeFile(
      lockPath,
      `${JSON.stringify({ nonce: "dead-process" })}\n`,
      "utf8",
    );
    const store = new FileGeoMonitorFreeReservationStore(directory, {
      lockWaitMs: 50,
    });

    await store.assertReady();
    await expect(fs.access(lockPath)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(store.collectGarbage()).resolves.toMatchObject({
      expiredReservations: 0,
    });
    await expect(store.reserve(reserveInput())).resolves.toMatchObject({
      created: true,
    });
  });

  it("persists one canonical scope and provider run across store restarts", async () => {
    const directory = await temporaryDirectory();
    const firstStore = new FileGeoMonitorFreeReservationStore(directory);
    await firstStore.assertReady();

    const created = await firstStore.reserve(reserveInput());
    expect(created.created).toBe(true);
    expect(created.record.state).toBe("reserved");

    const restartedStore = new FileGeoMonitorFreeReservationStore(directory);
    await restartedStore.assertReady();
    const adopted = await restartedStore.reserve(
      reserveInput({ clientRequestId: NEW_CLIENT_REQUEST_ID }),
    );
    expect(adopted).toMatchObject({
      created: false,
      record: {
        clientRequestId: CLIENT_REQUEST_ID,
        scopeHash: SCOPE_HASH,
        idempotencyKey: IDEMPOTENCY_KEY,
      },
    });

    await expect(
      restartedStore.reserve(
        reserveInput({
          scopeHash: OTHER_SCOPE_HASH,
          idempotencyKey: `geo-monitor-free:v2:${OTHER_SCOPE_HASH}`,
        }),
      ),
    ).rejects.toMatchObject({ code: "SCOPE_CONFLICT" });

    const submitting = await restartedStore.markSubmitting({
      projectId: PROJECT_ID,
      scopeHash: SCOPE_HASH,
      idempotencyKey: IDEMPOTENCY_KEY,
      submissionKey: SUBMISSION_KEY,
    });
    expect(submitting.state).toBe("submitting");

    const started = await restartedStore.markRun({
      projectId: PROJECT_ID,
      scopeHash: SCOPE_HASH,
      idempotencyKey: IDEMPOTENCY_KEY,
      submissionKey: SUBMISSION_KEY,
      runId: "monitor-run-1",
      runStatus: "running",
      state: "started",
    });
    expect(started).toMatchObject({
      state: "started",
      runId: "monitor-run-1",
      runStatus: "running",
    });

    await expect(
      new FileGeoMonitorFreeReservationStore(directory).get(PROJECT_ID),
    ).resolves.toMatchObject({ runId: "monitor-run-1", state: "started" });
    await expect(
      restartedStore.fenceProjectDeletion(PROJECT_ID),
    ).resolves.toEqual({ runId: "monitor-run-1", hadReservation: true });
    await restartedStore.purgeProject(PROJECT_ID);
    await expect(restartedStore.get(PROJECT_ID)).resolves.toBeUndefined();
    await expect(
      restartedStore.isProjectDeletionFenced(PROJECT_ID),
    ).resolves.toBe(true);
  });

  it("never expires or releases a submission whose provider result is unknown", async () => {
    const directory = await temporaryDirectory();
    let now = Date.parse("2026-08-12T00:00:00.000Z");
    const store = new FileGeoMonitorFreeReservationStore(directory, {
      now: () => now,
      pristineTtlMs: 1_000,
    });
    await store.assertReady();
    await store.reserve(reserveInput());
    await store.markSubmitting({
      projectId: PROJECT_ID,
      scopeHash: SCOPE_HASH,
      idempotencyKey: IDEMPOTENCY_KEY,
      submissionKey: SUBMISSION_KEY,
    });

    now += 24 * 60 * 60 * 1000;
    await expect(store.collectGarbage({ now })).resolves.toMatchObject({
      expiredReservations: 0,
    });
    await expect(
      store.releasePristine({
        projectId: PROJECT_ID,
        scopeHash: SCOPE_HASH,
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).resolves.toBe(false);
    await expect(
      store.reserve(
        reserveInput({
          scopeHash: OTHER_SCOPE_HASH,
          idempotencyKey: `geo-monitor-free:v2:${OTHER_SCOPE_HASH}`,
        }),
      ),
    ).rejects.toMatchObject({ code: "SCOPE_CONFLICT" });
    await expect(store.fenceProjectDeletion(PROJECT_ID)).rejects.toMatchObject({
      code: "PROJECT_DELETION_BLOCKED",
      record: { state: "submitting" },
    });

    const restartedStore = new FileGeoMonitorFreeReservationStore(directory);
    await restartedStore.assertReady();
    await expect(restartedStore.get(PROJECT_ID)).resolves.toMatchObject({
      state: "submitting",
      submissionKey: SUBMISSION_KEY,
    });
  });

  it("releases only pristine deterministic failures and sweeps expired pristine records", async () => {
    const directory = await temporaryDirectory();
    let now = Date.parse("2026-08-12T00:00:00.000Z");
    const store = new FileGeoMonitorFreeReservationStore(directory, {
      now: () => now,
      pristineTtlMs: 1_000,
    });
    await store.assertReady();
    await store.reserve(reserveInput());
    await expect(
      store.releasePristine({
        projectId: PROJECT_ID,
        scopeHash: SCOPE_HASH,
        idempotencyKey: IDEMPOTENCY_KEY,
      }),
    ).resolves.toBe(true);
    await expect(store.get(PROJECT_ID)).resolves.toBeUndefined();

    await store.reserve(reserveInput());
    now += 1_001;
    await expect(store.collectGarbage({ now })).resolves.toMatchObject({
      expiredReservations: 1,
    });
    await expect(store.get(PROJECT_ID)).resolves.toBeUndefined();
  });

  it("does not steal a live lock during an operation longer than the stale threshold", async () => {
    const directory = await temporaryDirectory();
    let enterCommit!: () => void;
    const commitEntered = new Promise<void>((resolve) => {
      enterCommit = resolve;
    });
    let releaseCommit!: () => void;
    const commitReleased = new Promise<void>((resolve) => {
      releaseCommit = resolve;
    });
    let blockFirstCommit = true;
    const firstStore = new FileGeoMonitorFreeReservationStore(directory, {
      lockStaleMs: 40,
      lockHeartbeatMs: 10,
      lockWaitMs: 1_000,
      beforeCommit: async () => {
        if (!blockFirstCommit) return;
        blockFirstCommit = false;
        enterCommit();
        await commitReleased;
      },
    });
    const contender = new FileGeoMonitorFreeReservationStore(directory, {
      lockStaleMs: 40,
      lockHeartbeatMs: 10,
      lockWaitMs: 1_000,
    });
    await firstStore.assertReady();
    await contender.assertReady();

    const first = firstStore.reserve(reserveInput());
    await commitEntered;
    await new Promise((resolve) => setTimeout(resolve, 100));
    // This is the same call used by a live /readyz probe. Startup recovery has
    // already completed, so it must not remove the active project lock.
    await expect(firstStore.assertReady()).resolves.toBeUndefined();
    let contenderSettled = false;
    const second = contender
      .reserve(reserveInput({ clientRequestId: NEW_CLIENT_REQUEST_ID }))
      .finally(() => {
        contenderSettled = true;
      });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(contenderSettled).toBe(false);

    releaseCommit();
    await expect(first).resolves.toMatchObject({ created: true });
    await expect(second).resolves.toMatchObject({
      created: false,
      record: { clientRequestId: CLIENT_REQUEST_ID },
    });
    const files = await fs.readdir(directory);
    expect(files.some((filename) => filename.endsWith(".lock"))).toBe(false);
  });

  it("fails closed on a corrupt durable record", async () => {
    const directory = await temporaryDirectory();
    const store = new FileGeoMonitorFreeReservationStore(directory);
    await store.assertReady();
    await store.reserve(reserveInput());
    const reservation = (await fs.readdir(directory)).find((filename) =>
      filename.endsWith(".reservation.json"),
    );
    expect(reservation).toBeDefined();
    await fs.writeFile(path.join(directory, reservation!), "{}\n", "utf8");

    await expect(store.get(PROJECT_ID)).rejects.toBeInstanceOf(
      GeoMonitorFreeReservationStoreError,
    );
    await expect(store.get(PROJECT_ID)).rejects.toMatchObject({
      code: "STORE_CORRUPT",
    });
  });
});
