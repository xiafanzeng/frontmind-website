import { describe, expect, it, vi } from "vitest";
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

  it("sends only the server-owned contract and local asset identities", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        return new Response(
          JSON.stringify(taskFixture("task-1")),
          {
            status: 201,
            headers: { "content-type": "application/json" },
          },
        );
      },
    );
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales/v2",
      serviceToken: "private-token",
      fetchImpl: fetchMock as typeof fetch,
    });

    await broker.createTask({
      projectId: "project-1",
      prompt: "build",
      localAssets: [{ localAssetId: "asset-1", filename: "source.pdf" }],
      idempotencyKey: "geo:project:test",
      contract: PRESALES_CONTRACTS.knowledgeBaseCandidate,
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
    });
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

    await expect(broker.getTask(responseBody.localTaskId)).rejects.toMatchObject(
      {
        code: "AGENT_INVALID_RESPONSE",
        status: 502,
      },
    );
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

  it.each(["MONITOR_SUBMISSION_REJECTED", "MONITOR_SUBMISSION_UNKNOWN"])(
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
      return new Response(
        JSON.stringify(statusFixture()),
        { status: 200, headers: { "content-type": "application/json" } },
      );
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
  ])("fails readiness when the v2 capability/hash surface is not exact", async (status) => {
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
  });

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
