import { describe, expect, it, vi } from "vitest";
import { PassThrough } from "node:stream";
import {
  createGeoPresalesBrokerFromEnv,
  expectedContractHashes,
  HttpGeoPresalesBroker,
  PRESALES_CAPABILITIES,
  PRESALES_CONTRACTS,
  PRESALES_CONTRACT_VERSION,
} from "./broker";

function taskFixture(id: string) {
  return {
    localTaskId: id,
    operationId: `operation:${id}`,
    status: "running",
    safeEvents: [],
  };
}

function statusFixture(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    credentialConfigured: true,
    monitorCredentialConfigured: true,
    monitorCredentialAuthenticated: true,
    publicUrlConfigured: true,
    presalesContractVersion: PRESALES_CONTRACT_VERSION,
    capabilities: PRESALES_CAPABILITIES,
    contractHashes: expectedContractHashes(),
    ...overrides,
  };
}

describe("HttpGeoPresalesBroker", () => {
  it("rejects an over-budget task prompt before any outbound request", async () => {
    const fetchMock = vi.fn();
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales/v2",
      serviceToken: "private-token",
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(
      broker.createTask({
        projectId: "project-over-budget",
        prompt: "😀".repeat(3_001),
        localAssets: [],
        idempotencyKey: "geo:over-budget",
        contract: PRESALES_CONTRACTS.knowledgeBaseCandidate,
      }),
    ).rejects.toMatchObject({
      code: "TASK_PROMPT_TOO_LONG",
      status: 500,
      details: { maximumCodePoints: 3_000, actualCodePoints: 3_001 },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards a stable file operation key only to the trusted Dashboard proxy", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            localAssetId: "asset-1",
            filename: "archive.zip",
            status: "pending",
          }),
          {
            status: 201,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales/v2",
      serviceToken: "private-token",
      fetchImpl: fetchMock as typeof fetch,
    });

    await broker.createAsset({
      projectId: "project-file-1",
      filename: "archive.zip",
      mimeType: "application/zip",
      sizeBytes: 10,
      idempotencyKey: "geo-custom-question-file:stable-operation:archive:0:v1",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "https://agent.example/api/internal/presales/v2/assets",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      projectId: "project-file-1",
      filename: "archive.zip",
      mimeType: "application/zip",
      sizeBytes: 10,
      idempotencyKey: "geo-custom-question-file:stable-operation:archive:0:v1",
    });
  });

  it("marks a Dashboard 200 asset reservation as an idempotent replay", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            localAssetId: "asset-replay",
            filename: "archive.zip",
            status: "uploaded",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales/v2",
      serviceToken: "private-token",
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(
      broker.createAsset({
        filename: "archive.zip",
        mimeType: "application/zip",
        sizeBytes: 10,
        idempotencyKey: "stable-replay",
      }),
    ).resolves.toMatchObject({
      localAssetId: "asset-replay",
      status: "uploaded",
      replayed: true,
    });
  });

  it("normalizes pending Dashboard asset null content fields", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            localAssetId: "asset-pending",
            filename: "archive.zip",
            status: "pending",
            bytes: null,
            sha256: null,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales/v2",
      serviceToken: "private-token",
      fetchImpl: fetchMock as typeof fetch,
    });
    const controller = new AbortController();

    await expect(
      broker.getAsset("asset-pending", { signal: controller.signal }),
    ).resolves.toEqual({
      localAssetId: "asset-pending",
      filename: "archive.zip",
      status: "pending",
    });
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  it("sends only the server-owned contract and local asset identities", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        return new Response(JSON.stringify(taskFixture("task-1")), {
          status: 201,
          headers: { "content-type": "application/json" },
        });
      },
    );
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales/v2",
      serviceToken: "private-token",
      fetchImpl: fetchMock as typeof fetch,
    });
    const richLocalAsset = {
      localAssetId: "asset-1",
      filename: "source.pdf",
      temporary: true,
    };

    await broker.createTask({
      projectId: "project-1",
      prompt: "build",
      localAssets: [richLocalAsset],
      idempotencyKey: "geo:project:test",
      contract: PRESALES_CONTRACTS.knowledgeBaseCandidate,
      businessOwnerName: "  Ａｌｉｃｅ　张三  ",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "https://agent.example/api/internal/presales/v2/tasks",
    );
    expect(new Headers(init?.headers).get("x-frontmind-service-token")).toBe(
      "private-token",
    );
    expect(init?.redirect).toBe("error");
    expect(JSON.parse(String(init?.body))).toEqual({
      idempotencyKey: "geo:project:test",
      projectId: "project-1",
      prompt: "build",
      localAssetIds: [{ localAssetId: "asset-1", filename: "source.pdf" }],
      contract: PRESALES_CONTRACTS.knowledgeBaseCandidate,
      businessOwnerName: "Alice 张三",
    });
  });

  it("uses the dedicated 60 second create-task budget and accepts durable queued 202", async () => {
    const timeoutSignal = new AbortController().signal;
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(timeoutSignal);
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            localTaskId: "queued-task-1",
            operationId: "operation:queued-task-1",
            status: "queued",
            safeEvents: [],
          }),
          {
            status: 202,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales/v2",
      serviceToken: "private-token",
      fetchImpl: fetchMock as typeof fetch,
    });

    try {
      await expect(
        broker.createTask({
          projectId: "project-queued-1",
          prompt: "build",
          localAssets: [],
          idempotencyKey: "geo:project-queued-1:knowledge-base:1",
          contract: PRESALES_CONTRACTS.knowledgeBaseCandidate,
          businessOwnerName: "Alice 张三",
        }),
      ).resolves.toMatchObject({
        localTaskId: "queued-task-1",
        status: "queued",
      });
      expect(timeoutSpy).toHaveBeenCalledTimes(1);
      expect(timeoutSpy).toHaveBeenCalledWith(60_000);
      expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(timeoutSignal);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it("requires the business owner only on the initial knowledge-base task", async () => {
    const fetchMock = vi.fn();
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales/v2",
      serviceToken: "private-token",
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(
      broker.createTask({
        projectId: "project-1",
        prompt: "build",
        localAssets: [],
        idempotencyKey: "geo:project:knowledge-base",
        contract: PRESALES_CONTRACTS.knowledgeBaseCandidate,
      }),
    ).rejects.toMatchObject({
      code: "PROJECT_BUSINESS_OWNER_CONTRACT_INVALID",
      status: 500,
    });
    await expect(
      broker.createTask({
        projectId: "project-1",
        prompt: "recommend questions",
        localAssets: [],
        idempotencyKey: "geo:project:questions",
        contract: PRESALES_CONTRACTS.questionRecommendation,
        businessOwnerName: "Alice 张三",
      }),
    ).rejects.toMatchObject({
      code: "PROJECT_BUSINESS_OWNER_CONTRACT_INVALID",
      status: 500,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      localTaskId: "task-null-result",
      operationId: "operation-null-result",
      status: "running",
      safeEvents: [],
      result: null,
    },
    {
      localTaskId: "task-premature-result",
      operationId: "operation-premature-result",
      status: "running",
      safeEvents: [],
      result: { structuredResult: {}, artifacts: [] },
    },
    {
      localTaskId: "task-incomplete-error",
      operationId: "operation-incomplete-error",
      status: "failed",
      safeEvents: [],
      error: { code: "TASK_FAILED" },
    },
  ])("rejects non-exact v2 task DTOs", async (responseBody) => {
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales/v2",
      serviceToken: "private-token",
      fetchImpl: vi.fn(
        async () =>
          new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ) as typeof fetch,
    });

    await expect(
      broker.getTask(responseBody.localTaskId),
    ).rejects.toMatchObject({
      code: "AGENT_INVALID_RESPONSE",
      status: 502,
    });
  });

  it("accepts ISO provider lifecycle timestamps", async () => {
    const responseBody = {
      ...taskFixture("task-with-times"),
      providerStartedAt: "2026-08-15T13:00:00.000Z",
      terminalAt: "2026-08-15T13:12:00.000Z",
    };
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales/v2",
      serviceToken: "private-token",
      fetchImpl: vi.fn(
        async () =>
          new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ) as typeof fetch,
    });

    await expect(broker.getTask("task-with-times")).resolves.toMatchObject({
      providerStartedAt: "2026-08-15T13:00:00.000Z",
      terminalAt: "2026-08-15T13:12:00.000Z",
    });
  });

  it.each(["not-a-date", "1786798800000"])(
    "rejects a non-ISO provider lifecycle timestamp: %s",
    async (providerStartedAt) => {
      const responseBody = {
        ...taskFixture("task-with-invalid-time"),
        providerStartedAt,
      };
      const broker = new HttpGeoPresalesBroker({
        baseUrl: "https://agent.example/api/internal/presales/v2",
        serviceToken: "private-token",
        fetchImpl: vi.fn(
          async () =>
            new Response(JSON.stringify(responseBody), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
        ) as typeof fetch,
      });

      await expect(
        broker.getTask("task-with-invalid-time"),
      ).rejects.toMatchObject({ code: "AGENT_INVALID_RESPONSE" });
    },
  );

  it("preserves a nested retryable code without exposing the raw Dashboard payload", async () => {
    const secretPayload = {
      error: {
        code: "REGION_CATALOG_UNAVAILABLE",
        retryable: true,
        internalContext: "private upstream catalog trace",
      },
    };
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales/v2",
      serviceToken: "private-token",
      fetchImpl: vi.fn(
        async () =>
          new Response(JSON.stringify(secretPayload), {
            status: 503,
            headers: { "content-type": "application/json" },
          }),
      ) as typeof fetch,
    });

    const error = await broker
      .getMonitorRegions("domestic")
      .catch((value) => value);
    expect(error).toMatchObject({
      code: "REGION_CATALOG_UNAVAILABLE",
      status: 503,
      retryable: true,
      message: "FrontMind 售前服务请求失败",
    });
    expect(String(error.message)).not.toContain("internalContext");
    expect(String(error.message)).not.toContain("private upstream");
  });

  it("keeps recommendation Pro in the immutable server contract", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(taskFixture("task-pro")), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
    );
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales/v2",
      serviceToken: "private-token",
      fetchImpl: fetchMock as typeof fetch,
    });

    await broker.createTask({
      projectId: "project-1",
      prompt: "recommend questions",
      localAssets: [],
      idempotencyKey: "geo:project:questions",
      contract: PRESALES_CONTRACTS.questionRecommendation,
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.contract).toEqual(PRESALES_CONTRACTS.questionRecommendation);
    expect(body).not.toHaveProperty("agentProfile");
    expect(body).not.toHaveProperty("model");
    expect(body).not.toHaveProperty("taskMode");
  });

  it("submits one same-task repair with only the stable local operation key", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify(taskFixture("task-repair")), {
          status: 202,
          headers: { "content-type": "application/json" },
        }),
    );
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales/v2",
      serviceToken: "private-token",
      fetchImpl: fetchMock as typeof fetch,
    });

    await broker.repairTask("task-repair", {
      idempotencyKey:
        "geo:structured-repair:website.question-recommendation:task-repair:1",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "https://agent.example/api/internal/presales/v2/tasks/task-repair/repair",
    );
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      idempotencyKey:
        "geo:structured-repair:website.question-recommendation:task-repair:1",
    });
    expect(JSON.parse(String(init?.body))).not.toHaveProperty("agentProfile");
    expect(JSON.parse(String(init?.body))).not.toHaveProperty("model");
    expect(JSON.parse(String(init?.body))).not.toHaveProperty("taskMode");
  });

  it("uses Agent's raw upload fallback contract", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: "uploaded" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales/v2",
      serviceToken: "private-token",
      fetchImpl: fetchMock as typeof fetch,
    });
    await broker.uploadAsset(
      "file-1",
      Buffer.from("pdf"),
      "application/pdf",
      "signed-upload-ticket",
    );
    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("content-type")).toBe("application/octet-stream");
    expect(headers.get("x-original-content-type")).toBe("application/pdf");
    expect(headers.get("x-frontmind-upload-ticket")).toBe(
      "signed-upload-ticket",
    );
    expect(headers.get("content-length")).toBe("3");
  });

  it("starts a streamed Dashboard upload before browser EOF and preserves the caller signal", async () => {
    const firstChunkSeen = Promise.withResolvers<void>();
    const received: Buffer[] = [];
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        for await (const chunk of init?.body as unknown as AsyncIterable<Uint8Array>) {
          received.push(Buffer.from(chunk));
          if (received.length === 1) firstChunkSeen.resolve();
        }
        return new Response(JSON.stringify({ status: "uploaded" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales/v2",
      serviceToken: "private-token",
      fetchImpl: fetchMock as typeof fetch,
    });
    const body = new PassThrough();
    const controller = new AbortController();
    const uploaded = broker.uploadAsset(
      "file-stream",
      body,
      "application/pdf",
      "signed-upload-ticket",
      { signal: controller.signal, sizeBytes: 6 },
    );

    body.write("abc");
    await firstChunkSeen.promise;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(uploaded).toBeInstanceOf(Promise);
    body.end("def");
    await uploaded;

    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("content-length")).toBe("6");
    expect((init as RequestInit & { duplex?: string }).duplex).toBe("half");
    expect(init?.signal).toBe(controller.signal);
    expect(Buffer.concat(received).toString("utf8")).toBe("abcdef");
  });

  it("submits monitoring as one fixed text-search batch", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) =>
        new Response(
          JSON.stringify({
            runId: "monitor-run-1",
            status: "submitted",
            question: "Acme 适合科研团队吗？",
            platforms: ["doubao", "kimi"],
            repeatPerPlatform: 5,
            expectedItems: 10,
            completedItems: 0,
            failedItems: 0,
          }),
          {
            status: 201,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales/v2",
      serviceToken: "private-token",
      fetchImpl: fetchMock as typeof fetch,
    });
    await broker.createMonitorRun({
      projectId: "project-monitor-1",
      question: "Acme 适合科研团队吗？",
      platforms: ["doubao", "kimi"],
      idempotencyKey: "geo-monitor:stable-request-hash",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "https://agent.example/api/internal/presales/v2/monitor-runs",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      projectId: "project-monitor-1",
      question: "Acme 适合科研团队吗？",
      platforms: ["doubao", "kimi"],
      idempotencyKey: "geo-monitor:stable-request-hash",
    });
  });

  it("forwards the server-owned monitor keyword, screenshot and one region", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            runId: "monitor-run-2",
            status: "submitted",
            question: "国内医药流通企业应该如何选择？",
            platforms: ["deepseek"],
            repeatPerPlatform: 5,
            expectedItems: 5,
            completedItems: 0,
            failedItems: 0,
            screenshot: 1,
            region: { scope: "domestic", code: "110000", label: "北京市" },
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        ),
    );
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales/v2",
      serviceToken: "private-token",
      fetchImpl: fetchMock as typeof fetch,
    });

    await broker.createMonitorRun({
      projectId: "project-monitor-2",
      question: "国内医药流通企业应该如何选择？",
      platforms: ["deepseek"],
      idempotencyKey: "geo-monitor:enriched-request-hash",
      monitorKeyword: "华润医药",
      screenshot: 1,
      region: { scope: "domestic", code: "110000" },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "https://agent.example/api/internal/presales/v2/monitor-runs",
    );
    expect(JSON.parse(String(init?.body))).toMatchObject({
      monitorKeyword: "华润医药",
      screenshot: 1,
      region: { scope: "domestic", code: "110000" },
    });
  });

  it("reads Dashboard region catalogs through the monitor-runs scope route", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            scope: "domestic",
            regions: [{ code: "110000", label: "北京市" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales/v2",
      serviceToken: "private-token",
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(broker.getMonitorRegions("domestic")).resolves.toEqual({
      edition: "domestic",
      regions: [{ code: "110000", label: "北京市" }],
    });
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://agent.example/api/internal/presales/v2/monitor-runs/regions?scope=domestic",
    );
  });

  it("downloads a monitor screenshot from the Dashboard record endpoint", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
    );
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales/v2",
      serviceToken: "private-token",
      fetchImpl: fetchMock as typeof fetch,
    });

    const response = await broker.downloadMonitorScreenshot(
      "monitor run/1",
      "record/1",
    );
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://agent.example/api/internal/presales/v2/monitor-runs/monitor%20run%2F1/records/record%2F1/screenshot",
    );
  });

  it("physically deletes the project-scoped local monitor record", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales/v2",
      serviceToken: "private-token",
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(
      broker.deleteMonitorRun("project-monitor-1", "monitor-run-1"),
    ).resolves.toBe("deleted");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "https://agent.example/api/internal/presales/v2/projects/project-monitor-1/monitor-runs/monitor-run-1",
    );
    expect(init?.method).toBe("DELETE");
  });

  it("keeps a project monitor deletion pending while submission is in flight", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "MONITOR_DELETION_PENDING",
              message: "monitor submission is still settling",
            },
          }),
          {
            status: 425,
            headers: { "content-type": "application/json", "retry-after": "2" },
          },
        ),
    );
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales/v2",
      serviceToken: "private-token",
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(
      broker.deleteMonitorRun("project-monitor-1", "monitor-run-1"),
    ).resolves.toBe("deleting");
  });

  it("preserves the project purge deletion receipt", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            schemaVersion: 1,
            projectId: "project-delete-1",
            status: "deleted",
            deletedTasks: 2,
            deletedFiles: 3,
            pendingReservations: 0,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales/v2",
      serviceToken: "private-token",
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(
      broker.deleteProjectTasks("project-delete-1"),
    ).resolves.toEqual({
      schemaVersion: 1,
      projectId: "project-delete-1",
      status: "deleted",
      deletedTasks: 2,
      deletedFiles: 3,
      pendingReservations: 0,
    });
  });

  it.each([
    "MONITOR_SUBMISSION_REJECTED",
    "MONITOR_SUBMISSION_UNKNOWN",
    "REGION_UNAVAILABLE",
    "REGION_CATALOG_UNAVAILABLE",
  ])(
    "preserves the allowlisted Dashboard monitor error code %s",
    async (code) => {
      const broker = new HttpGeoPresalesBroker({
        baseUrl: "https://agent.example/api/internal/presales/v2",
        serviceToken: "private-token",
        fetchImpl: vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                error: { code, message: "监控提交未确认" },
              }),
              {
                status: 502,
                headers: { "content-type": "application/json" },
              },
            ),
        ) as typeof fetch,
      });

      await expect(
        broker.createMonitorRun({
          projectId: "project-monitor-1",
          question: "Acme 适合科研团队吗？",
          platforms: ["doubao"],
          idempotencyKey: "geo-monitor:stable-request-hash",
        }),
      ).rejects.toMatchObject({ code, status: 502 });
    },
  );

  it("does not forward an unrecognized Dashboard error code", async () => {
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales/v2",
      serviceToken: "private-token",
      fetchImpl: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: { code: "INTERNAL_SECRET_CODE", message: "请求失败" },
            }),
            {
              status: 502,
              headers: { "content-type": "application/json" },
            },
          ),
      ) as typeof fetch,
    });

    await expect(
      broker.createMonitorRun({
        projectId: "project-monitor-1",
        question: "Acme 适合科研团队吗？",
        platforms: ["doubao"],
        idempotencyKey: "geo-monitor:stable-request-hash",
      }),
    ).rejects.toMatchObject({ code: "AGENT_REQUEST_FAILED", status: 502 });
  });

  it("reads progressive monitor records through the result GET endpoint", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            runId: "monitor-run-1",
            status: "polling",
            question: "Acme 适合科研团队吗？",
            platforms: ["doubao"],
            repeatPerPlatform: 5,
            expectedItems: 5,
            completedItems: 1,
            failedItems: 0,
            records: [
              {
                recordId: "record-1",
                platform: "doubao",
                runIndex: 1,
                status: "completed",
                answerText: "第一条回答",
                media: [],
                citations: [],
                references: [],
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    );
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales/v2",
      serviceToken: "private-token",
      fetchImpl: fetchMock as typeof fetch,
    });

    const result = await broker.getMonitorResult("monitor-run-1");

    expect(result.records).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "https://agent.example/api/internal/presales/v2/monitor-runs/monitor-run-1/result",
    );
    expect(init?.method).toBeUndefined();
    expect(new Headers(init?.headers).get("x-frontmind-service-token")).toBe(
      "private-token",
    );
  });

  it("reports HTTP 202 monitor results as safely retryable pending reads", async () => {
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales/v2",
      serviceToken: "private-token",
      fetchImpl: vi.fn(
        async () => new Response(null, { status: 202 }),
      ) as typeof fetch,
    });

    await expect(
      broker.getMonitorResult("monitor-run-1"),
    ).rejects.toMatchObject({
      code: "MONITOR_RESULT_PENDING",
      status: 502,
      details: { upstreamStatus: 202 },
    });
  });

  it("rejects a public placeholder service token", async () => {
    const broker = createGeoPresalesBrokerFromEnv({
      FRONTMIND_PRESALES_AGENT_URL:
        "https://agent.example/api/internal/presales/v2",
      FRONTMIND_PRESALES_SERVICE_TOKEN: "replace-with-the-same-random-token",
    });
    await expect(broker.getStatus()).rejects.toMatchObject({
      code: "AGENT_NOT_CONFIGURED",
      status: 503,
    });
  });

  it.each([
    "http://agent.example/api/internal/presales/v2",
    "https://user:password@agent.example/api/internal/presales/v2",
    "https://agent.example/api/internal/provisioning",
    "https://agent.example/api/internal/presales/v2/tasks",
    "https://agent.example/api/internal/presales?target=elsewhere",
    "https://agent.example/api/internal/presales#fragment",
  ])(
    "rejects an unsafe presales endpoint before any request: %s",
    (baseUrl) => {
      const fetchMock = vi.fn();
      expect(
        () =>
          new HttpGeoPresalesBroker({
            baseUrl,
            serviceToken: "presales-service-token-at-least-32-characters",
            fetchImpl: fetchMock as typeof fetch,
          }),
      ).toThrowError(
        expect.objectContaining({
          code: "AGENT_NOT_CONFIGURED",
          status: 503,
        }),
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("allows an exact Docker DNS hostname only when explicitly allowlisted", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe(
        "http://frontmind-dashboard:3001/api/internal/presales/v2/status",
      );
      return new Response(JSON.stringify(statusFixture()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "http://frontmind-dashboard:3001/api/internal/presales/v2",
      internalHttpHosts: ["frontmind-dashboard"],
      serviceToken: "presales-service-token-at-least-32-characters",
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(broker.getStatus()).resolves.toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("requests an uncached monitor credential probe for payment preflight", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe(
        "http://frontmind-dashboard:3001/api/internal/presales/v2/status?monitorCredentialProbe=fresh",
      );
      return new Response(
        JSON.stringify(
          statusFixture({
            ok: false,
            monitorCredentialAuthenticated: false,
          }),
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "http://frontmind-dashboard:3001/api/internal/presales/v2",
      internalHttpHosts: ["frontmind-dashboard"],
      serviceToken: "presales-service-token-at-least-32-characters",
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(
      broker.getStatus({ freshMonitorCredential: true }),
    ).resolves.toMatchObject({
      ok: false,
      monitorCredentialConfigured: true,
      monitorCredentialAuthenticated: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    statusFixture({
      capabilities: [...PRESALES_CAPABILITIES, "provider-identities"],
    }),
    statusFixture({
      contractHashes: {
        ...expectedContractHashes(),
        "website.unknown-contract": "a".repeat(64),
      },
    }),
  ])(
    "fails readiness when the v2 capability/hash surface is not exact",
    async (status) => {
      const broker = new HttpGeoPresalesBroker({
        baseUrl: "https://agent.example/api/internal/presales/v2",
        serviceToken: "private-token",
        fetchImpl: vi.fn(
          async () =>
            new Response(JSON.stringify(status), {
              status: 200,
              headers: { "content-type": "application/json" },
            }),
        ) as typeof fetch,
      });

      await expect(broker.getStatus()).rejects.toMatchObject({
        code: "AGENT_STATUS_INVALID",
        status: 502,
      });
    },
  );

  it("rejects malformed or near-match internal host allowlists", () => {
    for (const internalHosts of [
      "http://frontmind-dashboard:3001",
      "*.internal",
      "127.0.0.2",
      "frontmind-agent.example",
    ]) {
      expect(() =>
        createGeoPresalesBrokerFromEnv({
          FRONTMIND_PRESALES_AGENT_URL:
            "http://frontmind-dashboard:3001/api/internal/presales/v2",
          FRONTMIND_AGENT_INTERNAL_HTTP_HOSTS: internalHosts,
          FRONTMIND_PRESALES_SERVICE_TOKEN:
            "presales-service-token-at-least-32-characters",
        }),
      ).toThrowError(
        expect.objectContaining({
          code: "AGENT_NOT_CONFIGURED",
          status: 503,
        }),
      );
    }
  });
});
