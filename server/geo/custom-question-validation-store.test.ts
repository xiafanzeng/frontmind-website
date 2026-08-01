import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createGeoCustomQuestionValidationStore,
  FileGeoCustomQuestionValidationStore,
  geoCustomQuestionHash,
  geoCustomQuestionRequestHash,
  MemoryGeoCustomQuestionValidationStore,
} from "./custom-question-validation-store";

const CLIENT_REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const QUESTION = "Acme 在高校科研场景中能解决什么问题？";
const temporaryDirectories: string[] = [];

async function makeStoreDirectory() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "frontmind-geo-custom-question-store-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function reservation(
  overrides: Partial<{
    ownerSessionHash: string;
    question: string;
    clientRequestId: string;
    expiresAt: string;
  }> = {},
) {
  const projectId = "project-persistent-recovery";
  const question = overrides.question ?? QUESTION;
  return {
    projectId,
    ownerSessionHash: overrides.ownerSessionHash ?? "a".repeat(64),
    clientRequestId: overrides.clientRequestId ?? CLIENT_REQUEST_ID,
    requestHash: geoCustomQuestionRequestHash({
      projectId,
      knowledgeBaseTaskId: "knowledge-task-1",
      question,
    }),
    question,
    questionHash: geoCustomQuestionHash(question),
    companyName: "Acme",
    knowledgeBaseTaskId: "knowledge-task-1",
    knowledgeBaseValidationProfile: "website-lead-v1" as const,
    knowledgeBaseArtifact: {
      fileId: "knowledge-file-1",
      filename: "Acme.zip",
      sha256: "1".repeat(64),
      packageManifestSha256: "2".repeat(64),
    },
    expiresAt: overrides.expiresAt ?? "2027-08-01T00:00:00.000Z",
  };
}

function productionStore(directory: string) {
  return createGeoCustomQuestionValidationStore({
    env: {
      NODE_ENV: "production",
      FRONTMIND_GEO_CUSTOM_QUESTION_STORE_DIR: directory,
    },
  });
}

function recommendedQuestion(question = QUESTION) {
  return {
    id: "product-scenario-01",
    category: "product_scenario" as const,
    question,
    rationale: "该问题与已核验的企业能力直接相关。",
    evidenceRefs: ["01_company_overview/overview.md"],
    selectable: true,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe("custom-question validation persistence", () => {
  it("persists direct-completion receipts without an active slot and acknowledges them idempotently", async () => {
    const directory = await makeStoreDirectory();
    const stores = [
      new MemoryGeoCustomQuestionValidationStore(),
      new FileGeoCustomQuestionValidationStore(directory),
    ];

    for (const store of stores) {
      const input = reservation();
      const result = recommendedQuestion();
      const created = await store.reserveCompletedReceipt(input, result);
      expect(created).toMatchObject({
        created: true,
        record: {
          state: "completed",
          completionMode: "existing_recommended_question",
          cleanupCompleted: true,
          result: { id: result.id, question: result.question },
        },
      });
      await expect(store.getActive(input.projectId)).resolves.toBeUndefined();

      await expect(
        store.reserveCompletedReceipt(input, result),
      ).resolves.toMatchObject({
        created: false,
        record: { commitId: created.record.commitId },
      });
      await expect(
        store.acknowledgeTerminal(
          input.projectId,
          input.clientRequestId,
          input.ownerSessionHash,
        ),
      ).resolves.toMatchObject({ state: "completed" });
      await expect(
        store.acknowledgeTerminal(
          input.projectId,
          input.clientRequestId,
          input.ownerSessionHash,
        ),
      ).resolves.toMatchObject({ state: "completed" });
      await expect(store.getActive(input.projectId)).resolves.toBeUndefined();
    }
  });

  it("recovers the same terminal receipt after its committed response is lost", async () => {
    const directory = await makeStoreDirectory();
    let loseResponse = true;
    const firstProcess = new FileGeoCustomQuestionValidationStore(directory, {
      afterInitialRecordCommit: (record) => {
        if (
          !loseResponse ||
          record.completionMode !== "existing_recommended_question"
        )
          return;
        loseResponse = false;
        throw new Error(
          "simulated response loss after terminal receipt commit",
        );
      },
    });
    const input = reservation();
    const result = recommendedQuestion();

    await expect(
      firstProcess.reserveCompletedReceipt(input, result),
    ).rejects.toThrow(/response loss/);

    const restartedProcess = new FileGeoCustomQuestionValidationStore(
      directory,
    );
    await expect(
      restartedProcess.get(input.projectId, input.clientRequestId),
    ).resolves.toMatchObject({
      state: "completed",
      completionMode: "existing_recommended_question",
      result: { id: result.id },
    });
    await expect(
      restartedProcess.getActive(input.projectId),
    ).resolves.toBeUndefined();
    await expect(
      restartedProcess.reserveCompletedReceipt(input, result),
    ).resolves.toMatchObject({ created: false });
  });

  it("never overwrites another active operation while replaying a completed receipt", async () => {
    const directory = await makeStoreDirectory();
    const stores = [
      new MemoryGeoCustomQuestionValidationStore(),
      new FileGeoCustomQuestionValidationStore(directory),
    ];

    for (const store of stores) {
      const receiptInput = reservation();
      const result = recommendedQuestion();
      await store.reserveCompletedReceipt(receiptInput, result);

      const activeInput = reservation({
        clientRequestId: "33333333-3333-4333-8333-333333333333",
        question: "Acme 如何支持制造企业的数据治理？",
      });
      await store.reserve(activeInput);
      await expect(
        store.reserveCompletedReceipt(receiptInput, result),
      ).resolves.toMatchObject({ created: false });
      await expect(
        store.getActive(activeInput.projectId),
      ).resolves.toMatchObject({
        clientRequestId: activeInput.clientRequestId,
      });

      const competingInput = reservation({
        clientRequestId: "44444444-4444-4444-8444-444444444444",
        question: "Acme 如何帮助零售企业构建知识库？",
      });
      await expect(
        store.reserveCompletedReceipt(
          competingInput,
          recommendedQuestion(competingInput.question),
        ),
      ).rejects.toMatchObject({
        code: "ACTIVE_RESERVATION_CONFLICT",
        activeOperation: { clientRequestId: activeInput.clientRequestId },
      });
      await expect(
        store.get(competingInput.projectId, competingInput.clientRequestId),
      ).resolves.toBeUndefined();
      await expect(
        store.getActive(activeInput.projectId),
      ).resolves.toMatchObject({
        clientRequestId: activeInput.clientRequestId,
      });
    }
  });

  it("garbage-collects an expired terminal receipt into a permanent 410 tombstone", async () => {
    const directory = await makeStoreDirectory();
    let now = Date.parse("2026-08-01T00:00:00.000Z");
    const stores = [
      new MemoryGeoCustomQuestionValidationStore({ now: () => now }),
      new FileGeoCustomQuestionValidationStore(directory, { now: () => now }),
    ];

    for (const store of stores) {
      const input = reservation({
        expiresAt: new Date(now + 1_000).toISOString(),
      });
      await store.reserveCompletedReceipt(input, recommendedQuestion());
      let cleanupCalls = 0;
      await store.collectGarbage({
        now: new Date(now),
        tombstoneTtlMs: 1_000,
        cleanup: async () => {
          cleanupCalls += 1;
        },
      });
      await expect(
        store.get(input.projectId, input.clientRequestId),
      ).resolves.toBeDefined();

      now += 2_000;
      await expect(
        store.collectGarbage({
          now: new Date(now),
          tombstoneTtlMs: 1_000,
          cleanup: async () => {
            cleanupCalls += 1;
          },
        }),
      ).resolves.toMatchObject({ deleted: 1 });
      expect(cleanupCalls).toBe(0);
      await expect(
        store.get(input.projectId, input.clientRequestId),
      ).rejects.toMatchObject({ code: "RESERVATION_EXPIRED" });

      now += 2_000;
      await store.collectGarbage({
        now: new Date(now),
        tombstoneTtlMs: 1_000,
        cleanup: async () => undefined,
      });
      await expect(
        store.get(input.projectId, input.clientRequestId),
      ).rejects.toMatchObject({ code: "RESERVATION_EXPIRED" });
      await expect(store.reserve(input)).rejects.toMatchObject({
        code: "RESERVATION_EXPIRED",
      });
      await expect(
        store.reserveCompletedReceipt(input, recommendedQuestion()),
      ).rejects.toMatchObject({ code: "RESERVATION_EXPIRED" });
    }
  });

  it("retains an expired completed authority until ACK, then expires it as an exact 410", async () => {
    const directory = await makeStoreDirectory();
    const start = Date.parse("2026-08-01T00:00:00.000Z");
    let memoryNow = start;
    let fileNow = start;

    for (const { store, expire } of [
      {
        store: new MemoryGeoCustomQuestionValidationStore({
          now: () => memoryNow,
        }),
        expire: () => {
          memoryNow = start + 2_000;
        },
      },
      {
        store: new FileGeoCustomQuestionValidationStore(directory, {
          now: () => fileNow,
        }),
        expire: () => {
          fileNow = start + 2_000;
        },
      },
    ]) {
      const input = reservation({
        expiresAt: new Date(start + 1_000).toISOString(),
      });
      const reserved = await store.reserve(input);
      const lease = await store.tryAcquireLease(
        input.projectId,
        input.clientRequestId,
      );
      const completed = await store.update(
        {
          ...reserved.record,
          state: "completed",
          result: recommendedQuestion(),
          taskId: "completed-task",
        },
        lease!,
      );
      await store.releaseLease(lease!);
      expire();

      const cleaned: string[] = [];
      const retained = await store.collectGarbage({
        now: new Date(start + 2_000),
        cleanup: async (target) => {
          if (target.taskId) cleaned.push(target.taskId);
        },
      });
      expect(retained.retained).toBeGreaterThan(0);
      expect(cleaned).toEqual(["completed-task"]);
      await expect(
        store.get(input.projectId, input.clientRequestId),
      ).resolves.toMatchObject({
        state: "completed",
        result: completed.result,
        cleanupCompleted: true,
      });
      await expect(store.getActive(input.projectId)).resolves.toMatchObject({
        clientRequestId: input.clientRequestId,
      });

      await store.acknowledgeTerminal(
        input.projectId,
        input.clientRequestId,
        input.ownerSessionHash,
      );
      await store.collectGarbage({
        now: new Date(start + 2_000),
        cleanup: async () => undefined,
      });
      await expect(store.getActive(input.projectId)).resolves.toBeUndefined();
      await expect(
        store.get(input.projectId, input.clientRequestId),
      ).rejects.toMatchObject({ code: "RESERVATION_EXPIRED" });
    }
  });

  it("repairs the real file-store crash window after the record commit and before the project slot commit", async () => {
    const directory = await makeStoreDirectory();
    let crashOnce = true;
    const crashedProcess = new FileGeoCustomQuestionValidationStore(directory, {
      afterInitialRecordCommit: () => {
        if (!crashOnce) return;
        crashOnce = false;
        throw new Error("simulated process exit before project slot commit");
      },
    });

    await expect(crashedProcess.reserve(reservation())).rejects.toThrow(
      /before project slot commit/,
    );
    const filesAfterCrash = await fs.readdir(directory);
    expect(filesAfterCrash.some((name) => name.includes(".record.v"))).toBe(
      true,
    );
    expect(filesAfterCrash.some((name) => name.includes(".project.v"))).toBe(
      false,
    );

    const restartedProcess = new FileGeoCustomQuestionValidationStore(
      directory,
    );
    await expect(
      restartedProcess.ensureActive(
        reservation().projectId,
        reservation().clientRequestId,
      ),
    ).resolves.toMatchObject({
      state: "reserved",
      clientRequestId: CLIENT_REQUEST_ID,
    });
    await expect(
      restartedProcess.getActive(reservation().projectId),
    ).resolves.toMatchObject({ clientRequestId: CLIENT_REQUEST_ID });
    await expect(
      restartedProcess.tryAcquireLease(
        reservation().projectId,
        reservation().clientRequestId,
      ),
    ).resolves.toBeDefined();
  });

  it("uses the same crash recovery semantics in the memory store", async () => {
    let crashOnce = true;
    const store = new MemoryGeoCustomQuestionValidationStore({
      afterInitialRecordCommit: () => {
        if (!crashOnce) return;
        crashOnce = false;
        throw new Error("simulated process exit before memory slot commit");
      },
    });
    await expect(store.reserve(reservation())).rejects.toThrow(
      /before memory slot commit/,
    );
    await expect(
      store.getActive(reservation().projectId),
    ).resolves.toBeUndefined();
    await expect(
      store.ensureActive(reservation().projectId, CLIENT_REQUEST_ID),
    ).resolves.toMatchObject({ clientRequestId: CLIENT_REQUEST_ID });
  });

  it("deterministically elects the oldest orphan and never overwrites an existing authority", async () => {
    const directory = await makeStoreDirectory();
    let now = Date.parse("2026-08-01T00:00:00.000Z");
    const crashingIds = new Set([
      CLIENT_REQUEST_ID,
      "33333333-3333-4333-8333-333333333333",
    ]);
    const crashedProcess = new FileGeoCustomQuestionValidationStore(directory, {
      now: () => now,
      afterInitialRecordCommit: (record) => {
        if (!crashingIds.delete(record.clientRequestId)) return;
        throw new Error(`simulated orphan ${record.clientRequestId}`);
      },
    });
    await expect(crashedProcess.reserve(reservation())).rejects.toThrow(
      /simulated orphan/,
    );
    now += 1_000;
    const newerId = "33333333-3333-4333-8333-333333333333";
    await expect(
      crashedProcess.reserve(reservation({ clientRequestId: newerId })),
    ).rejects.toThrow(/simulated orphan/);

    const restartedProcess = new FileGeoCustomQuestionValidationStore(
      directory,
      {
        now: () => now,
      },
    );
    const competingProcess = new FileGeoCustomQuestionValidationStore(
      directory,
      { now: () => now },
    );
    const [newerAttempt, olderAttempt] = await Promise.allSettled([
      restartedProcess.ensureActive(reservation().projectId, newerId),
      competingProcess.ensureActive(reservation().projectId, CLIENT_REQUEST_ID),
    ]);
    expect(newerAttempt).toMatchObject({
      status: "fulfilled",
      value: {
        state: "failed",
        supersededByClientRequestId: CLIENT_REQUEST_ID,
        cleanupCompleted: true,
        error: {
          code: "CUSTOM_QUESTION_RESERVATION_SUPERSEDED",
          retryable: false,
        },
      },
    });
    expect(olderAttempt).toMatchObject({
      status: "fulfilled",
      value: { clientRequestId: CLIENT_REQUEST_ID },
    });
    await expect(
      restartedProcess.getActive(reservation().projectId),
    ).resolves.toMatchObject({ clientRequestId: CLIENT_REQUEST_ID });

    const thirdId = "44444444-4444-4444-8444-444444444444";
    await expect(
      restartedProcess.reserve(reservation({ clientRequestId: thirdId })),
    ).rejects.toMatchObject({
      code: "ACTIVE_RESERVATION_CONFLICT",
      activeOperation: { clientRequestId: CLIENT_REQUEST_ID },
    });
    await expect(
      restartedProcess.ensureActive(reservation().projectId, thirdId),
    ).resolves.toMatchObject({
      state: "failed",
      supersededByClientRequestId: CLIENT_REQUEST_ID,
      error: { code: "CUSTOM_QUESTION_RESERVATION_SUPERSEDED" },
    });

    const fileWinner = await restartedProcess.get(
      reservation().projectId,
      CLIENT_REQUEST_ID,
    );
    const fileWinnerLease = await restartedProcess.tryAcquireLease(
      reservation().projectId,
      CLIENT_REQUEST_ID,
    );
    expect(fileWinner).toBeDefined();
    expect(fileWinnerLease).toBeDefined();
    await restartedProcess.update(
      {
        ...fileWinner!,
        state: "failed",
        error: {
          code: "TEST_WINNER_COMPLETE",
          message: "winner reached a terminal state",
          status: 500,
          retryable: false,
        },
      },
      fileWinnerLease!,
    );
    await restartedProcess.releaseLease(fileWinnerLease!);
    await restartedProcess.acknowledgeTerminal(
      reservation().projectId,
      CLIENT_REQUEST_ID,
      reservation().ownerSessionHash,
    );
    await expect(restartedProcess.listActive()).resolves.toEqual([]);
    await expect(
      restartedProcess.get(reservation().projectId, newerId),
    ).resolves.toMatchObject({
      state: "failed",
      supersededByClientRequestId: CLIENT_REQUEST_ID,
    });
    await expect(
      restartedProcess.get(reservation().projectId, thirdId),
    ).resolves.toMatchObject({
      state: "failed",
      supersededByClientRequestId: CLIENT_REQUEST_ID,
    });

    let memoryNow = Date.parse("2026-08-01T00:00:00.000Z");
    const memoryCrashingIds = new Set([CLIENT_REQUEST_ID, newerId]);
    const memoryStore = new MemoryGeoCustomQuestionValidationStore({
      now: () => memoryNow,
      afterInitialRecordCommit: (record) => {
        if (!memoryCrashingIds.delete(record.clientRequestId)) return;
        throw new Error(`simulated memory orphan ${record.clientRequestId}`);
      },
    });
    await expect(memoryStore.reserve(reservation())).rejects.toThrow(
      /memory orphan/,
    );
    memoryNow += 1_000;
    await expect(
      memoryStore.reserve(reservation({ clientRequestId: newerId })),
    ).rejects.toThrow(/memory orphan/);
    await expect(
      memoryStore.ensureActive(reservation().projectId, newerId),
    ).resolves.toMatchObject({
      state: "failed",
      supersededByClientRequestId: CLIENT_REQUEST_ID,
      error: { code: "CUSTOM_QUESTION_RESERVATION_SUPERSEDED" },
    });
    await expect(
      memoryStore.getActive(reservation().projectId),
    ).resolves.toMatchObject({ clientRequestId: CLIENT_REQUEST_ID });
  });

  it("persists every pristine active-conflict loser as an explicit terminal receipt", async () => {
    const loserId = "55555555-5555-4555-8555-555555555555";
    const stores = [
      new MemoryGeoCustomQuestionValidationStore(),
      new FileGeoCustomQuestionValidationStore(await makeStoreDirectory()),
    ];

    for (const store of stores) {
      await store.reserve(reservation());
      await expect(
        store.reserve(reservation({ clientRequestId: loserId })),
      ).rejects.toMatchObject({
        code: "ACTIVE_RESERVATION_CONFLICT",
        activeOperation: { clientRequestId: CLIENT_REQUEST_ID },
      });

      await expect(
        store.get(reservation().projectId, loserId),
      ).resolves.toMatchObject({
        state: "failed",
        supersededByClientRequestId: CLIENT_REQUEST_ID,
        supersededAt: expect.any(String),
        cleanupCompleted: true,
        error: {
          code: "CUSTOM_QUESTION_RESERVATION_SUPERSEDED",
          status: 409,
          retryable: false,
        },
      });
      await expect(
        store.ensureActive(reservation().projectId, loserId),
      ).resolves.toMatchObject({
        state: "failed",
        supersededByClientRequestId: CLIENT_REQUEST_ID,
      });
      await expect(store.listActive()).resolves.toEqual([
        expect.objectContaining({
          state: "reserved",
          clientRequestId: CLIENT_REQUEST_ID,
        }),
      ]);
    }
  });

  it("retries a crashed supersede commit before exposing work to a recovery worker", async () => {
    const directory = await makeStoreDirectory();
    const loserId = "66666666-6666-4666-8666-666666666666";
    let crashOnce = true;
    const crashedProcess = new FileGeoCustomQuestionValidationStore(directory, {
      beforeRecordCommit: ({ operation }) => {
        if (operation !== "supersede" || !crashOnce) return;
        crashOnce = false;
        throw new Error("simulated exit before supersede commit");
      },
    });
    await crashedProcess.reserve(reservation());
    await expect(
      crashedProcess.reserve(reservation({ clientRequestId: loserId })),
    ).rejects.toThrow(/before supersede commit/);
    await expect(
      crashedProcess.get(reservation().projectId, loserId),
    ).resolves.toMatchObject({ state: "reserved", storeVersion: 0 });

    const restartedProcess = new FileGeoCustomQuestionValidationStore(
      directory,
    );
    await expect(restartedProcess.listActive()).resolves.toEqual([
      expect.objectContaining({ clientRequestId: CLIENT_REQUEST_ID }),
    ]);
    await expect(
      restartedProcess.get(reservation().projectId, loserId),
    ).resolves.toMatchObject({
      state: "failed",
      supersededByClientRequestId: CLIENT_REQUEST_ID,
      error: { code: "CUSTOM_QUESTION_RESERVATION_SUPERSEDED" },
    });

    const winner = await restartedProcess.get(
      reservation().projectId,
      CLIENT_REQUEST_ID,
    );
    const lease = await restartedProcess.tryAcquireLease(
      reservation().projectId,
      CLIENT_REQUEST_ID,
    );
    expect(winner).toBeDefined();
    expect(lease).toBeDefined();
    await restartedProcess.update(
      {
        ...winner!,
        state: "failed",
        error: {
          code: "TEST_WINNER_COMPLETE",
          message: "winner reached a terminal state",
          status: 500,
          retryable: false,
        },
      },
      lease!,
    );
    await restartedProcess.releaseLease(lease!);
    await restartedProcess.acknowledgeTerminal(
      reservation().projectId,
      CLIENT_REQUEST_ID,
      reservation().ownerSessionHash,
    );
    await expect(restartedProcess.listActive()).resolves.toEqual([]);
  });

  it("retires a pre-terminal crash loser before terminal authority ACK releases the slot", async () => {
    const loserId = "67676767-6767-4767-8767-676767676767";

    const exercise = async (
      store:
        | MemoryGeoCustomQuestionValidationStore
        | FileGeoCustomQuestionValidationStore,
      acknowledgeWith = store,
    ) => {
      const authority = await store.reserve(reservation());
      await expect(
        store.reserve(reservation({ clientRequestId: loserId })),
      ).rejects.toThrow(/terminal ACK crash loser/);
      const lease = await store.tryAcquireLease(
        authority.record.projectId,
        authority.record.clientRequestId,
      );
      const current = await store.get(
        authority.record.projectId,
        authority.record.clientRequestId,
      );
      expect(lease).toBeDefined();
      expect(current).toBeDefined();
      await store.update(
        {
          ...current!,
          state: "failed",
          cleanupCompleted: true,
          error: {
            code: "TEST_TERMINAL_AUTHORITY",
            message: "authority reached terminal before loser recovery",
            status: 500,
            retryable: false,
          },
        },
        lease!,
      );
      await store.releaseLease(lease!);
      await acknowledgeWith.acknowledgeTerminal(
        authority.record.projectId,
        authority.record.clientRequestId,
        authority.record.ownerSessionHash,
      );
      await expect(
        acknowledgeWith.get(authority.record.projectId, loserId),
      ).resolves.toMatchObject({
        state: "failed",
        supersededByClientRequestId: authority.record.clientRequestId,
        error: { code: "CUSTOM_QUESTION_RESERVATION_SUPERSEDED" },
      });
      await expect(acknowledgeWith.listActive()).resolves.toEqual([]);
    };

    let memoryCrash = true;
    const memoryStore = new MemoryGeoCustomQuestionValidationStore({
      afterInitialRecordCommit: (record) => {
        if (record.clientRequestId !== loserId || !memoryCrash) return;
        memoryCrash = false;
        throw new Error("terminal ACK crash loser");
      },
    });
    await exercise(memoryStore);

    const directory = await makeStoreDirectory();
    let fileCrash = true;
    const fileStore = new FileGeoCustomQuestionValidationStore(directory, {
      afterInitialRecordCommit: (record) => {
        if (record.clientRequestId !== loserId || !fileCrash) return;
        fileCrash = false;
        throw new Error("terminal ACK crash loser");
      },
    });
    await exercise(
      fileStore,
      new FileGeoCustomQuestionValidationStore(directory),
    );
  });

  it("retires expired-authority losers before GC releases the slot", async () => {
    const loserId = "68686868-6868-4868-8868-686868686868";
    const rejectedId = "69696969-6969-4969-8969-696969696969";
    const start = Date.parse("2026-08-01T00:00:00.000Z");

    const exercise = async (
      store:
        | MemoryGeoCustomQuestionValidationStore
        | FileGeoCustomQuestionValidationStore,
      advanceClock: () => void,
    ) => {
      const authority = await store.reserve(
        reservation({
          expiresAt: new Date(start + 1_000).toISOString(),
        }),
      );
      await expect(
        store.reserve(reservation({ clientRequestId: loserId })),
      ).rejects.toThrow(/expired GC crash loser/);
      advanceClock();

      await expect(
        store.reserve(reservation({ clientRequestId: rejectedId })),
      ).rejects.toMatchObject({ code: "RESERVATION_EXPIRED" });
      await expect(
        store.get(authority.record.projectId, rejectedId),
      ).resolves.toMatchObject({
        state: "failed",
        supersededByClientRequestId: authority.record.clientRequestId,
      });

      await store.collectGarbage({
        now: new Date(start + 2_000),
        cleanup: async () => undefined,
      });
      await expect(
        store.get(authority.record.projectId, loserId),
      ).resolves.toMatchObject({
        state: "failed",
        supersededByClientRequestId: authority.record.clientRequestId,
        error: { code: "CUSTOM_QUESTION_RESERVATION_SUPERSEDED" },
      });
      await expect(store.listActive()).resolves.toEqual([]);
    };

    let memoryNow = start;
    let memoryCrash = true;
    const memoryStore = new MemoryGeoCustomQuestionValidationStore({
      now: () => memoryNow,
      afterInitialRecordCommit: (record) => {
        if (record.clientRequestId !== loserId || !memoryCrash) return;
        memoryCrash = false;
        throw new Error("expired GC crash loser");
      },
    });
    await exercise(memoryStore, () => {
      memoryNow = start + 2_000;
    });

    const directory = await makeStoreDirectory();
    let fileNow = start;
    let fileCrash = true;
    const fileStore = new FileGeoCustomQuestionValidationStore(directory, {
      now: () => fileNow,
      afterInitialRecordCommit: (record) => {
        if (record.clientRequestId !== loserId || !fileCrash) return;
        fileCrash = false;
        throw new Error("expired GC crash loser");
      },
    });
    await exercise(fileStore, () => {
      fileNow = start + 2_000;
    });
  });

  it("never supersedes a record that already owns upstream side effects", async () => {
    const directory = await makeStoreDirectory();
    const store = new FileGeoCustomQuestionValidationStore(directory);
    const sideEffectId = "77777777-7777-4777-8777-777777777777";
    const authorityId = "88888888-8888-4888-8888-888888888888";
    const sideEffect = await store.reserve(
      reservation({ clientRequestId: sideEffectId }),
    );
    const sideEffectLease = await store.tryAcquireLease(
      reservation().projectId,
      sideEffectId,
    );
    expect(sideEffectLease).toBeDefined();
    await store.update(
      {
        ...sideEffect.record,
        state: "submitted",
        archiveAttachment: {
          fileId: "archive-file-side-effect",
          filename: "Acme.zip",
          temporary: false,
        },
        skillAttachment: {
          fileId: "skill-file-side-effect",
          filename: "geo-custom-question-classifier.skill.zip",
          temporary: true,
        },
        taskId: "upstream-task-side-effect",
      },
      sideEffectLease!,
    );
    await store.releaseLease(sideEffectLease!);

    for (const name of await fs.readdir(directory)) {
      if (name.includes(".project.v")) {
        await fs.unlink(path.join(directory, name));
      }
    }
    await store.reserve(reservation({ clientRequestId: authorityId }));
    await expect(store.listActive()).resolves.toEqual([
      expect.objectContaining({ clientRequestId: authorityId }),
    ]);
    await expect(
      store.get(reservation().projectId, sideEffectId),
    ).resolves.toMatchObject({
      state: "submitted",
      taskId: "upstream-task-side-effect",
      archiveAttachment: { fileId: "archive-file-side-effect" },
      skillAttachment: { fileId: "skill-file-side-effect" },
    });
    const preserved = await store.get(reservation().projectId, sideEffectId);
    expect(preserved?.supersededByClientRequestId).toBeUndefined();
    expect(preserved?.error).toBeUndefined();
  });

  it("does not reactivate terminal or expired orphan records", async () => {
    let now = Date.parse("2026-08-01T00:00:00.000Z");
    const expiredId = "55555555-5555-4555-8555-555555555555";
    const store = new MemoryGeoCustomQuestionValidationStore({
      now: () => now,
      afterInitialRecordCommit: (record) => {
        if (record.clientRequestId === expiredId) {
          throw new Error("simulated expired orphan");
        }
      },
    });
    await expect(
      store.reserve(
        reservation({
          clientRequestId: expiredId,
          expiresAt: "2026-08-01T00:00:01.000Z",
        }),
      ),
    ).rejects.toThrow(/expired orphan/);
    now += 2_000;
    await expect(
      store.ensureActive(reservation().projectId, expiredId),
    ).rejects.toMatchObject({ code: "RESERVATION_EXPIRED" });
    await expect(store.listActive()).resolves.toEqual([]);
    await expect(
      store.getActive(reservation().projectId),
    ).resolves.toBeUndefined();

    const terminalStore = new MemoryGeoCustomQuestionValidationStore();
    const created = await terminalStore.reserve(reservation());
    const lease = await terminalStore.tryAcquireLease(
      created.record.projectId,
      created.record.clientRequestId,
    );
    const terminal = await terminalStore.update(
      {
        ...created.record,
        state: "failed",
        error: {
          code: "UPSTREAM_UNAVAILABLE",
          message: "temporary",
          status: 502,
          retryable: true,
        },
      },
      lease!,
    );
    await terminalStore.releaseLease(lease!);
    await terminalStore.acknowledgeTerminal(
      terminal.projectId,
      terminal.clientRequestId,
      terminal.ownerSessionHash,
    );
    await expect(
      terminalStore.ensureActive(terminal.projectId, terminal.clientRequestId),
    ).resolves.toMatchObject({ state: "failed" });
    await expect(
      terminalStore.getActive(terminal.projectId),
    ).resolves.toBeUndefined();
    await expect(terminalStore.listActive()).resolves.toEqual([]);
  });

  it("keeps memory terminal reservations discoverable until an idempotent owner acknowledgement", async () => {
    const store = new MemoryGeoCustomQuestionValidationStore();
    const created = await store.reserve(reservation());
    await expect(
      store.acknowledgeTerminal(
        created.record.projectId,
        created.record.clientRequestId,
        created.record.ownerSessionHash,
      ),
    ).rejects.toMatchObject({ code: "RESERVATION_NOT_TERMINAL" });

    const lease = await store.tryAcquireLease(
      created.record.projectId,
      created.record.clientRequestId,
    );
    await store.update(
      {
        ...created.record,
        state: "failed",
        error: {
          code: "UPSTREAM_UNAVAILABLE",
          message: "temporary",
          status: 502,
          retryable: true,
        },
      },
      lease!,
    );
    await store.releaseLease(lease!);

    await expect(
      store.getActive(created.record.projectId),
    ).resolves.toMatchObject({
      state: "failed",
      clientRequestId: created.record.clientRequestId,
    });
    await expect(
      store.acknowledgeTerminal(
        created.record.projectId,
        created.record.clientRequestId,
        "b".repeat(64),
      ),
    ).rejects.toMatchObject({ code: "RESERVATION_OWNER_MISMATCH" });

    await store.acknowledgeTerminal(
      created.record.projectId,
      created.record.clientRequestId,
      created.record.ownerSessionHash,
    );
    await expect(
      store.getActive(created.record.projectId),
    ).resolves.toBeUndefined();
    await expect(
      store.acknowledgeTerminal(
        created.record.projectId,
        created.record.clientRequestId,
        created.record.ownerSessionHash,
      ),
    ).resolves.toMatchObject({ state: "failed" });
  });

  it("keeps file-store terminal state across processes until ACK and does not let an old ACK clear a replacement", async () => {
    const directory = await makeStoreDirectory();
    const firstProcess = new FileGeoCustomQuestionValidationStore(directory);
    const restartedProcess = new FileGeoCustomQuestionValidationStore(
      directory,
    );
    const created = await firstProcess.reserve(reservation());
    const lease = await firstProcess.tryAcquireLease(
      created.record.projectId,
      created.record.clientRequestId,
    );
    await firstProcess.update(
      {
        ...created.record,
        state: "failed",
        error: {
          code: "UPSTREAM_UNAVAILABLE",
          message: "temporary",
          status: 502,
          retryable: true,
        },
      },
      lease!,
    );
    await firstProcess.releaseLease(lease!);

    await expect(
      restartedProcess.getActive(created.record.projectId),
    ).resolves.toMatchObject({
      state: "failed",
      clientRequestId: created.record.clientRequestId,
    });

    const replacementRequestId = "33333333-3333-4333-8333-333333333333";
    await restartedProcess.reserve(
      reservation({ clientRequestId: replacementRequestId }),
    );
    await restartedProcess.acknowledgeTerminal(
      created.record.projectId,
      created.record.clientRequestId,
      created.record.ownerSessionHash,
    );
    await expect(
      firstProcess.getActive(created.record.projectId),
    ).resolves.toMatchObject({
      state: "reserved",
      clientRequestId: replacementRequestId,
    });

    const isolatedProject = reservation({
      clientRequestId: "44444444-4444-4444-8444-444444444444",
    });
    isolatedProject.projectId = "project-ack-across-processes";
    isolatedProject.requestHash = geoCustomQuestionRequestHash({
      projectId: isolatedProject.projectId,
      knowledgeBaseTaskId: isolatedProject.knowledgeBaseTaskId,
      question: isolatedProject.question,
    });
    const isolated = await firstProcess.reserve(isolatedProject);
    const isolatedLease = await firstProcess.tryAcquireLease(
      isolated.record.projectId,
      isolated.record.clientRequestId,
    );
    await firstProcess.update(
      {
        ...isolated.record,
        state: "completed",
        result: {
          id: "custom-ack-terminal-1234",
          category: "product_scenario",
          question: QUESTION,
          rationale: "verified",
          evidenceRefs: ["knowledge-base"],
          selectable: true,
        },
      },
      isolatedLease!,
    );
    await firstProcess.releaseLease(isolatedLease!);
    await restartedProcess.acknowledgeTerminal(
      isolated.record.projectId,
      isolated.record.clientRequestId,
      isolated.record.ownerSessionHash,
    );
    await expect(
      firstProcess.getActive(isolated.record.projectId),
    ).resolves.toBeUndefined();
    await expect(
      firstProcess.acknowledgeTerminal(
        isolated.record.projectId,
        isolated.record.clientRequestId,
        isolated.record.ownerSessionHash,
      ),
    ).resolves.toMatchObject({ state: "completed" });
  });

  it("shares a reservation and lease across two store instances", async () => {
    const directory = await makeStoreDirectory();
    const firstProcess = new FileGeoCustomQuestionValidationStore(directory);
    const restartedProcess = new FileGeoCustomQuestionValidationStore(
      directory,
    );

    const created = await firstProcess.reserve(reservation());
    expect(created.created).toBe(true);

    const replayed = await restartedProcess.reserve(reservation());
    expect(replayed.created).toBe(false);
    expect(replayed.record.key).toBe(created.record.key);

    const lease = await firstProcess.tryAcquireLease(
      created.record.projectId,
      created.record.clientRequestId,
    );
    expect(lease).toBeDefined();
    await expect(
      restartedProcess.tryAcquireLease(
        created.record.projectId,
        created.record.clientRequestId,
      ),
    ).resolves.toBeUndefined();

    await firstProcess.update(
      {
        ...created.record,
        state: "submitted",
        archiveAttachment: {
          fileId: "archive-file-1",
          filename: "Acme.zip",
          temporary: false,
        },
        skillAttachment: {
          fileId: "skill-file-1",
          filename: "geo-custom-question-classifier.skill.zip",
          temporary: true,
        },
        taskId: "upstream-task-1",
      },
      lease!,
    );
    await firstProcess.releaseLease(lease!);

    await expect(
      restartedProcess.get(
        created.record.projectId,
        created.record.clientRequestId,
      ),
    ).resolves.toMatchObject({
      state: "submitted",
      taskId: "upstream-task-1",
      archiveAttachment: { fileId: "archive-file-1" },
      skillAttachment: { fileId: "skill-file-1" },
    });
  });

  it("keeps a terminal result replayable after process restart and cleanup", async () => {
    const directory = await makeStoreDirectory();
    const firstProcess = new FileGeoCustomQuestionValidationStore(directory);
    const created = await firstProcess.reserve(reservation());
    const lease = await firstProcess.tryAcquireLease(
      created.record.projectId,
      created.record.clientRequestId,
    );
    const completed = await firstProcess.update(
      {
        ...created.record,
        state: "completed",
        taskId: "upstream-task-1",
        cleanupCompleted: true,
        result: {
          id: "custom-1234567890abcdef1234",
          category: "product_scenario",
          question: QUESTION,
          rationale: "问题明确指向 Acme 的科研服务能力。",
          enterpriseAnchor: "Acme",
          evidenceRefs: ["01_company_overview/overview.md"],
          selectable: true,
        },
      },
      lease!,
    );
    await firstProcess.releaseLease(lease!);

    const restartedProcess = new FileGeoCustomQuestionValidationStore(
      directory,
    );
    const replayed = await restartedProcess.reserve(reservation());
    expect(replayed.created).toBe(false);
    expect(replayed.record).toMatchObject({
      key: completed.key,
      state: "completed",
      taskId: "upstream-task-1",
      cleanupCompleted: true,
      result: { question: QUESTION },
    });
  });

  it("rejects clientRequestId reuse with a different owner or request", async () => {
    const directory = await makeStoreDirectory();
    const store = new FileGeoCustomQuestionValidationStore(directory);
    await store.reserve(reservation());

    await expect(
      store.reserve(reservation({ ownerSessionHash: "b".repeat(64) })),
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
    await expect(
      store.reserve(reservation({ question: "Acme 靠谱吗？" })),
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
  });

  it("fails closed without an explicit absolute production directory", () => {
    expect(() =>
      createGeoCustomQuestionValidationStore({
        env: { NODE_ENV: "production" },
      }),
    ).toThrow(/must name a persistent directory/);
    expect(() =>
      createGeoCustomQuestionValidationStore({
        env: {
          NODE_ENV: "production",
          FRONTMIND_GEO_CUSTOM_QUESTION_STORE_DIR: "relative/state",
        },
      }),
    ).toThrow(/must be an absolute path/);
  });

  it("rejects a group/world-writable production bind mount", async () => {
    const directory = await makeStoreDirectory();
    await fs.chmod(directory, 0o777);

    await expect(
      productionStore(directory).assertReady(),
    ).rejects.toMatchObject({
      code: "STORE_CORRUPT",
      message: expect.stringContaining("不得允许同组或其他用户写入"),
    });
  });

  it("rejects a production store root that is a symbolic-link boundary", async () => {
    const parent = await makeStoreDirectory();
    const target = path.join(parent, "actual-store");
    const linkedRoot = path.join(parent, "linked-store");
    await fs.mkdir(target, { mode: 0o700 });
    await fs.symlink(target, linkedRoot);

    await expect(
      productionStore(linkedRoot).assertReady(),
    ).rejects.toMatchObject({
      code: "STORE_CORRUPT",
      message: expect.stringContaining("必须是真实目录"),
    });
    await expect(fs.readdir(target)).resolves.toEqual([]);
  });

  it("accepts a non-writable 0750 production directory and creates only 0600 state files", async () => {
    const directory = await makeStoreDirectory();
    await fs.chmod(directory, 0o750);
    const store = productionStore(directory);

    await store.assertReady();
    await store.reserve(reservation());

    const stateFiles = (await fs.readdir(directory)).filter((name) =>
      name.endsWith(".json"),
    );
    expect(stateFiles.length).toBeGreaterThanOrEqual(3);
    for (const name of stateFiles) {
      const metadata = await fs.lstat(path.join(directory, name));
      expect(metadata.isFile()).toBe(true);
      expect(metadata.mode & 0o777).toBe(0o600);
    }
    await expect(store.assertReady()).resolves.toBeUndefined();
  });

  it("removes only stale, regular 0600 store-owned temp files during readiness and GC", async () => {
    const directory = await makeStoreDirectory();
    const now = Date.parse("2026-08-01T12:00:00.000Z");
    const store = new FileGeoCustomQuestionValidationStore(directory, {
      now: () => now,
    });
    const oldOwned =
      ".persistence-sentinel.123.11111111-1111-4111-8111-111111111111.tmp";
    const newOwned = `.${"a".repeat(64)}.record.v000000000000.json.123.22222222-2222-4222-8222-222222222222.tmp`;
    const wrongMode = `.${"b".repeat(64)}.project.v000000000000.json.123.33333333-3333-4333-8333-333333333333.tmp`;
    const unrelated = ".customer-question.backup.tmp";
    const symlinkName = `.${"c".repeat(64)}.tombstone.json.123.44444444-4444-4444-8444-444444444444.tmp`;
    const symlinkTarget = path.join(directory, "symlink-target.txt");
    for (const name of [oldOwned, newOwned, wrongMode, unrelated]) {
      await fs.writeFile(path.join(directory, name), "private question\n", {
        mode: 0o600,
      });
    }
    await fs.writeFile(symlinkTarget, "must survive\n", { mode: 0o600 });
    await fs.symlink(symlinkTarget, path.join(directory, symlinkName));
    await fs.chmod(path.join(directory, wrongMode), 0o640);
    const oldDate = new Date(now - 2 * 60 * 60 * 1000);
    const newDate = new Date(now - 30 * 60 * 1000);
    await fs.utimes(path.join(directory, oldOwned), oldDate, oldDate);
    await fs.utimes(path.join(directory, newOwned), newDate, newDate);
    await fs.utimes(path.join(directory, wrongMode), oldDate, oldDate);
    await fs.utimes(path.join(directory, unrelated), oldDate, oldDate);

    await store.assertReady();
    await expect(fs.stat(path.join(directory, oldOwned))).rejects.toMatchObject(
      {
        code: "ENOENT",
      },
    );
    for (const name of [newOwned, wrongMode, unrelated, symlinkName]) {
      await expect(fs.lstat(path.join(directory, name))).resolves.toBeDefined();
    }
    await expect(fs.readFile(symlinkTarget, "utf8")).resolves.toBe(
      "must survive\n",
    );

    const gcOwned = `.${"d".repeat(64)}.cleanup-complete.json.123.55555555-5555-4555-8555-555555555555.tmp`;
    await fs.writeFile(path.join(directory, gcOwned), "private question\n", {
      mode: 0o600,
    });
    await fs.utimes(path.join(directory, gcOwned), oldDate, oldDate);
    await store.collectGarbage({
      now: new Date(now),
      cleanup: async () => undefined,
    });
    await expect(fs.stat(path.join(directory, gcOwned))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      fs.lstat(path.join(directory, symlinkName)),
    ).resolves.toMatchObject({});
  });

  it("durably ledgers a just-created file across a staging CAS crash and retries failed orphan deletion", async () => {
    const directory = await makeStoreDirectory();
    let now = Date.parse("2026-08-01T00:00:00.000Z");
    let crashBeforeRecordCommit = true;
    const store = new FileGeoCustomQuestionValidationStore(directory, {
      now: () => now,
      beforeRecordCommit: ({ operation }) => {
        if (operation === "retain" && crashBeforeRecordCommit) {
          crashBeforeRecordCommit = false;
          throw new Error("simulated process crash after orphan ledger fsync");
        }
      },
    });
    const created = await store.reserve(reservation());
    const justCreatedFileId = "upstream-file-created-before-cas";

    await expect(
      store.retainTemporaryFileForCleanup(
        created.record.projectId,
        created.record.clientRequestId,
        justCreatedFileId,
      ),
    ).rejects.toThrow(/simulated process crash/);
    const markerName = (await fs.readdir(directory)).find((name) =>
      name.endsWith(".orphan-file.json"),
    );
    expect(markerName).toBeDefined();
    const markerText = await fs.readFile(
      path.join(directory, markerName!),
      "utf8",
    );
    expect(markerText).toContain(justCreatedFileId);
    expect(markerText).not.toContain(QUESTION);
    await expect(
      store.get(created.record.projectId, created.record.clientRequestId),
    ).resolves.toMatchObject({ orphanedTemporaryFileIds: [] });

    const cleaned: string[] = [];
    now += 4 * 60 * 1000;
    await store.collectGarbage({
      now: new Date(now),
      cleanup: async (target) => cleaned.push(...target.temporaryFileIds),
    });
    expect(cleaned).toEqual([]);
    await expect(
      fs.stat(path.join(directory, markerName!)),
    ).resolves.toBeDefined();

    now += 2 * 60 * 1000;
    const failed = await store.collectGarbage({
      now: new Date(now),
      cleanup: async () => {
        throw new Error("upstream delete unavailable");
      },
    });
    expect(failed.retained).toBeGreaterThan(0);
    await expect(
      fs.stat(path.join(directory, markerName!)),
    ).resolves.toBeDefined();

    await store.collectGarbage({
      now: new Date(now),
      cleanup: async (target) => cleaned.push(...target.temporaryFileIds),
    });
    expect(cleaned).toEqual([justCreatedFileId]);
    await expect(
      fs.stat(path.join(directory, markerName!)),
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("fails closed when an orphan marker filename does not match its durable identity", async () => {
    const directory = await makeStoreDirectory();
    let failRetain = true;
    const store = new FileGeoCustomQuestionValidationStore(directory, {
      beforeRecordCommit: ({ operation }) => {
        if (operation === "retain" && failRetain) {
          failRetain = false;
          throw new Error("simulated crash after orphan marker creation");
        }
      },
    });
    const created = await store.reserve(reservation());
    await expect(
      store.retainTemporaryFileForCleanup(
        created.record.projectId,
        created.record.clientRequestId,
        "upstream-file-that-must-not-be-deleted",
      ),
    ).rejects.toThrow(/simulated crash/);

    const markerName = (await fs.readdir(directory)).find((name) =>
      name.endsWith(".orphan-file.json"),
    );
    expect(markerName).toBeDefined();
    const corruptName = markerName!.replace(/^[a-f0-9]{64}/, "f".repeat(64));
    await fs.rename(
      path.join(directory, markerName!),
      path.join(directory, corruptName),
    );

    const cleaned: string[] = [];
    await expect(
      store.collectGarbage({
        cleanup: async (target) => cleaned.push(...target.temporaryFileIds),
      }),
    ).rejects.toMatchObject({
      code: "STORE_CORRUPT",
      message: expect.stringContaining("身份与文件名不一致"),
    });
    expect(cleaned).toEqual([]);
    await expect(
      fs.stat(path.join(directory, corruptName)),
    ).resolves.toBeDefined();
  });

  it("rejects an existing production state file whose mode is not 0600", async () => {
    const directory = await makeStoreDirectory();
    const store = productionStore(directory);
    await store.assertReady();
    await store.reserve(reservation());
    const recordName = (await fs.readdir(directory)).find((name) =>
      name.includes(".record.v"),
    );
    expect(recordName).toBeDefined();
    await fs.chmod(path.join(directory, recordName!), 0o640);

    await expect(
      productionStore(directory).assertReady(),
    ).rejects.toMatchObject({
      code: "STORE_CORRUPT",
      message: expect.stringContaining("权限 0600"),
    });
  });

  it("fences an old owner that read before an expired-lease takeover", async () => {
    const directory = await makeStoreDirectory();
    let now = Date.parse("2026-08-01T00:00:00.000Z");
    let releaseOldCommit!: () => void;
    let oldCommitReached!: () => void;
    const oldCommitReady = new Promise<void>((resolve) => {
      oldCommitReached = resolve;
    });
    const oldCommitBarrier = new Promise<void>((resolve) => {
      releaseOldCommit = resolve;
    });
    const oldProcess = new FileGeoCustomQuestionValidationStore(directory, {
      now: () => now,
      beforeRecordCommit: async ({ operation }) => {
        if (operation !== "update") return;
        oldCommitReached();
        await oldCommitBarrier;
      },
    });
    const newProcess = new FileGeoCustomQuestionValidationStore(directory, {
      now: () => now,
    });
    const created = await oldProcess.reserve(
      reservation({ expiresAt: "2026-08-02T00:00:00.000Z" }),
    );
    const oldLease = await oldProcess.tryAcquireLease(
      created.record.projectId,
      created.record.clientRequestId,
      50,
    );
    expect(oldLease).toBeDefined();

    const staleUpdate = oldProcess.update(
      { ...created.record, state: "prepared" },
      oldLease!,
    );
    await oldCommitReady;
    now += 100;
    const newLease = await newProcess.tryAcquireLease(
      created.record.projectId,
      created.record.clientRequestId,
      5_000,
    );
    expect(newLease?.fence).toBeGreaterThan(oldLease!.fence);
    releaseOldCommit();
    await expect(staleUpdate).rejects.toMatchObject({ code: "LEASE_LOST" });

    const authority = await newProcess.get(
      created.record.projectId,
      created.record.clientRequestId,
    );
    const updated = await newProcess.update(
      { ...authority!, state: "submitted", taskId: "authoritative-task" },
      newLease!,
    );
    await oldProcess.releaseLease(oldLease!);
    await expect(
      newProcess.renewLease(newLease!, 5_000),
    ).resolves.toMatchObject({
      token: newLease!.token,
      fence: newLease!.fence,
    });
    await expect(
      newProcess.get(created.record.projectId, created.record.clientRequestId),
    ).resolves.toMatchObject({
      state: "submitted",
      taskId: "authoritative-task",
      fencingToken: updated.fencingToken,
      activeLease: { token: newLease!.token },
    });
  });

  it("allows only one active reservation per project and releases it at terminal state", async () => {
    const directory = await makeStoreDirectory();
    const firstProcess = new FileGeoCustomQuestionValidationStore(directory);
    const secondProcess = new FileGeoCustomQuestionValidationStore(directory);
    const first = await firstProcess.reserve(reservation());
    const competing = reservation({
      clientRequestId: "77777777-7777-4777-8777-777777777777",
      question: "Acme 的交付模式有哪些？",
    });
    await expect(secondProcess.reserve(competing)).rejects.toMatchObject({
      code: "ACTIVE_RESERVATION_CONFLICT",
      activeOperation: {
        clientRequestId: CLIENT_REQUEST_ID,
        question: QUESTION,
      },
    });

    const lease = await firstProcess.tryAcquireLease(
      first.record.projectId,
      first.record.clientRequestId,
    );
    await firstProcess.update(
      {
        ...first.record,
        state: "failed",
        error: {
          code: "TEST_TERMINAL",
          message: "terminal",
          status: 502,
          retryable: true,
        },
      },
      lease!,
    );
    await expect(secondProcess.reserve(competing)).resolves.toMatchObject({
      created: false,
      record: { clientRequestId: competing.clientRequestId },
    });
  });

  it("retries failed cleanup, expires plaintext records, and retains a permanent compact tombstone", async () => {
    const directory = await makeStoreDirectory();
    let now = Date.parse("2026-08-01T00:00:00.000Z");
    const store = new FileGeoCustomQuestionValidationStore(directory, {
      now: () => now,
    });
    const created = await store.reserve(
      reservation({ expiresAt: "2026-08-01T00:00:01.000Z" }),
    );
    const lease = await store.tryAcquireLease(
      created.record.projectId,
      created.record.clientRequestId,
      100,
    );
    await store.update(
      {
        ...created.record,
        state: "submitted",
        taskId: "task-to-delete",
        skillAttachment: {
          fileId: "temporary-skill",
          filename: "skill.zip",
          temporary: true,
        },
      },
      lease!,
    );
    await store.releaseLease(lease!);
    now += 2_000;

    const failed = await store.collectGarbage({
      now: new Date(now),
      tombstoneTtlMs: 1_000,
      cleanup: async () => {
        throw new Error("upstream unavailable");
      },
    });
    expect(failed).toMatchObject({ deleted: 1, retained: 1 });
    await expect(
      store.get(created.record.projectId, created.record.clientRequestId),
    ).rejects.toMatchObject({ code: "RESERVATION_EXPIRED" });
    const afterFailedCleanup = await Promise.all(
      (await fs.readdir(directory)).map((name) =>
        fs.readFile(path.join(directory, name), "utf8").catch(() => ""),
      ),
    );
    expect(afterFailedCleanup.join("\n")).not.toContain(QUESTION);
    expect(afterFailedCleanup.join("\n")).toContain("task-to-delete");

    const cleanedIds: string[] = [];
    const succeeded = await store.collectGarbage({
      now: new Date(now),
      tombstoneTtlMs: 1_000,
      cleanup: async (target) => {
        cleanedIds.push(target.taskId!, ...target.temporaryFileIds);
      },
    });
    expect(succeeded).toMatchObject({ deleted: 0, retained: 0 });
    expect(cleanedIds).toEqual(["task-to-delete", "temporary-skill"]);
    await expect(
      store.get(created.record.projectId, created.record.clientRequestId),
    ).rejects.toMatchObject({ code: "RESERVATION_EXPIRED" });
    const persistedText = await Promise.all(
      (await fs.readdir(directory)).map((name) =>
        fs.readFile(path.join(directory, name), "utf8").catch(() => ""),
      ),
    );
    expect(persistedText.join("\n")).not.toContain(QUESTION);
    await expect(store.reserve(reservation())).rejects.toMatchObject({
      code: "RESERVATION_EXPIRED",
    });

    now += 2_000;
    const pruned = await store.collectGarbage({
      now: new Date(now),
      tombstoneTtlMs: 1_000,
      cleanup: async () => undefined,
    });
    expect(pruned.tombstonesDeleted).toBe(0);
    await expect(
      store.get(created.record.projectId, created.record.clientRequestId),
    ).rejects.toMatchObject({ code: "RESERVATION_EXPIRED" });
  });

  it("keeps a stable persistence sentinel across store recreation", async () => {
    const directory = await makeStoreDirectory();
    const first = new FileGeoCustomQuestionValidationStore(directory);
    await first.assertReady();
    const firstIdentity = await first.persistenceIdentity();
    const restarted = new FileGeoCustomQuestionValidationStore(directory);
    await restarted.assertReady();
    expect(await restarted.persistenceIdentity()).toBe(firstIdentity);
  });

  it("removes expired plaintext during a cleanup outage and retains only retry metadata", async () => {
    const directory = await makeStoreDirectory();
    let now = Date.parse("2026-08-01T00:00:00.000Z");
    const store = new FileGeoCustomQuestionValidationStore(directory, {
      now: () => now,
    });
    const created = await store.reserve(
      reservation({ expiresAt: "2026-08-01T00:00:01.000Z" }),
    );
    const lease = await store.tryAcquireLease(
      created.record.projectId,
      created.record.clientRequestId,
      100,
    );
    await store.update(
      {
        ...created.record,
        state: "submitted",
        taskId: "retry-cleanup-task",
      },
      lease!,
    );
    await store.releaseLease(lease!);
    now += 2_000;

    const unavailable = async () => {
      throw new Error("upstream cleanup unavailable");
    };
    const first = await store.collectGarbage({
      now: new Date(now),
      tombstoneTtlMs: 1_000,
      cleanup: unavailable,
    });
    expect(first).toMatchObject({ deleted: 1, retained: 1 });
    now += 2_000;
    const afterTtl = await store.collectGarbage({
      now: new Date(now),
      tombstoneTtlMs: 1_000,
      cleanup: unavailable,
    });
    expect(afterTtl).toMatchObject({ tombstonesDeleted: 0, retained: 1 });

    const persistedAfterOutage = await Promise.all(
      (await fs.readdir(directory)).map((name) =>
        fs.readFile(path.join(directory, name), "utf8").catch(() => ""),
      ),
    );
    expect(persistedAfterOutage.join("\n")).not.toContain(QUESTION);
    expect(persistedAfterOutage.join("\n")).toContain("retry-cleanup-task");

    const cleaned: string[] = [];
    const recovered = await store.collectGarbage({
      now: new Date(now),
      tombstoneTtlMs: 1_000,
      cleanup: async (target) => {
        if (target.taskId) cleaned.push(target.taskId);
      },
    });
    expect(cleaned).toEqual(["retry-cleanup-task"]);
    expect(recovered).toMatchObject({ tombstonesDeleted: 0, retained: 0 });
    expect(
      (await fs.readdir(directory)).some((name) =>
        name.endsWith(".tombstone.json"),
      ),
    ).toBe(true);
  });

  it("keeps the tombstone and retries when physical record deletion fails", async () => {
    const directory = await makeStoreDirectory();
    let now = Date.parse("2026-08-01T00:00:00.000Z");
    let failDeletion = true;
    const store = new FileGeoCustomQuestionValidationStore(directory, {
      now: () => now,
      beforeDeleteRecordVersion: () => {
        if (failDeletion) throw new Error("simulated unlink failure");
      },
    });
    const created = await store.reserve(
      reservation({ expiresAt: "2026-08-01T00:00:01.000Z" }),
    );
    now += 2_000;

    const deferred = await store.collectGarbage({
      now: new Date(now),
      cleanup: async () => undefined,
    });
    expect(deferred).toMatchObject({ deleted: 0, retained: 1 });
    const afterFailure = await fs.readdir(directory);
    expect(afterFailure.some((name) => name.endsWith(".tombstone.json"))).toBe(
      true,
    );
    expect(afterFailure.some((name) => name.includes(".record.v"))).toBe(true);
    await expect(
      store.get(created.record.projectId, created.record.clientRequestId),
    ).rejects.toMatchObject({ code: "RESERVATION_EXPIRED" });

    failDeletion = false;
    const retried = await store.collectGarbage({
      now: new Date(now),
      cleanup: async () => undefined,
    });
    expect(retried).toMatchObject({ deleted: 1, retained: 0 });
    const afterRetry = await fs.readdir(directory);
    expect(afterRetry.some((name) => name.includes(".record.v"))).toBe(false);
    expect(afterRetry.some((name) => name.endsWith(".tombstone.json"))).toBe(
      true,
    );
  });

  it("recovers a record-only crash before refusing project deletion", async () => {
    const directory = await makeStoreDirectory();
    let fileCrash = true;
    let memoryCrash = true;
    const stores = [
      new MemoryGeoCustomQuestionValidationStore({
        afterInitialRecordCommit: () => {
          if (!memoryCrash) return;
          memoryCrash = false;
          throw new Error("memory crash before active slot");
        },
      }),
      new FileGeoCustomQuestionValidationStore(directory, {
        afterInitialRecordCommit: () => {
          if (!fileCrash) return;
          fileCrash = false;
          throw new Error("file crash before active slot");
        },
      }),
    ];

    for (const store of stores) {
      await expect(store.reserve(reservation())).rejects.toThrow(
        /crash before active slot/,
      );
      await expect(
        store.fenceProjectDeletion(reservation().projectId),
      ).rejects.toMatchObject({
        code: "PROJECT_DELETION_BLOCKED",
        activeOperation: { clientRequestId: CLIENT_REQUEST_ID },
      });
      await expect(store.listActive()).resolves.toEqual([
        expect.objectContaining({ clientRequestId: CLIENT_REQUEST_ID }),
      ]);
    }
  });

  it("serializes project deletion against a concurrent initial reservation", async () => {
    const exerciseReservationWins = async (
      store:
        | MemoryGeoCustomQuestionValidationStore
        | FileGeoCustomQuestionValidationStore,
      entered: Promise<void>,
      release: () => void,
    ) => {
      const reserving = store.reserve(reservation());
      await entered;
      await expect(
        store.fenceProjectDeletion(reservation().projectId),
      ).rejects.toMatchObject({ code: "PROJECT_DELETION_BLOCKED" });
      release();
      await expect(reserving).resolves.toMatchObject({
        record: { clientRequestId: CLIENT_REQUEST_ID },
      });
    };

    let releaseMemory!: () => void;
    let enterMemory!: () => void;
    const memoryEntered = new Promise<void>((resolve) => {
      enterMemory = resolve;
    });
    const memoryRelease = new Promise<void>((resolve) => {
      releaseMemory = resolve;
    });
    await exerciseReservationWins(
      new MemoryGeoCustomQuestionValidationStore({
        afterInitialRecordCommit: async () => {
          enterMemory();
          await memoryRelease;
        },
      }),
      memoryEntered,
      releaseMemory,
    );

    let releaseFile!: () => void;
    let enterFile!: () => void;
    const fileEntered = new Promise<void>((resolve) => {
      enterFile = resolve;
    });
    const fileRelease = new Promise<void>((resolve) => {
      releaseFile = resolve;
    });
    await exerciseReservationWins(
      new FileGeoCustomQuestionValidationStore(await makeStoreDirectory(), {
        afterInitialRecordCommit: async () => {
          enterFile();
          await fileRelease;
        },
      }),
      fileEntered,
      releaseFile,
    );

    const deletionFirstStores = [
      new MemoryGeoCustomQuestionValidationStore(),
      new FileGeoCustomQuestionValidationStore(await makeStoreDirectory()),
    ];
    for (const store of deletionFirstStores) {
      await expect(
        store.fenceProjectDeletion(reservation().projectId),
      ).resolves.toBeUndefined();
      await expect(store.reserve(reservation())).rejects.toMatchObject({
        code: "PROJECT_DELETION_FENCED",
      });
      await expect(store.listActive()).resolves.toEqual([]);
    }
  });

  it("allows deletion after terminal acknowledgement and persists the anti-resurrection fence", async () => {
    const directory = await makeStoreDirectory();
    const stores = [
      new MemoryGeoCustomQuestionValidationStore(),
      new FileGeoCustomQuestionValidationStore(directory),
    ];
    for (const store of stores) {
      const created = await store.reserve(reservation());
      const lease = await store.tryAcquireLease(
        created.record.projectId,
        created.record.clientRequestId,
      );
      expect(lease).toBeDefined();
      await store.update(
        {
          ...created.record,
          state: "failed",
          error: {
            code: "TEST_TERMINAL",
            message: "terminal",
            status: 500,
            retryable: false,
          },
        },
        lease!,
      );
      await store.releaseLease(lease!);
      await store.acknowledgeTerminal(
        created.record.projectId,
        created.record.clientRequestId,
        created.record.ownerSessionHash,
      );
      await expect(
        store.fenceProjectDeletion(created.record.projectId),
      ).resolves.toBeUndefined();
      await expect(store.listActive()).resolves.toEqual([]);
      await expect(store.reserve(reservation())).rejects.toMatchObject({
        code: "PROJECT_DELETION_FENCED",
      });
    }

    const restarted = new FileGeoCustomQuestionValidationStore(directory);
    await expect(restarted.listActive()).resolves.toEqual([]);
    await expect(restarted.reserve(reservation())).rejects.toMatchObject({
      code: "PROJECT_DELETION_FENCED",
    });
    await expect(
      restarted.fenceProjectDeletion(reservation().projectId),
    ).resolves.toBeUndefined();
  });
});
