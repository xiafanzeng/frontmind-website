import { describe, expect, it, vi } from "vitest";
import {
  createGeoPresalesBrokerFromEnv,
  FRONTMIND_BASE_PROFILE,
  FRONTMIND_PRO_PROFILE,
  HttpGeoPresalesBroker,
} from "./broker";

describe("HttpGeoPresalesBroker", () => {
  it("defaults to Base and sends the private service token", async () => {
    const fetchMock = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        return new Response(
          JSON.stringify({ id: "task-1", status: "running" }),
          {
            status: 201,
            headers: { "content-type": "application/json" },
          },
        );
      },
    );
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales",
      serviceToken: "private-token",
      fetchImpl: fetchMock as typeof fetch,
    });

    await broker.createTask({
      projectId: "project-1",
      prompt: "build",
      attachments: [],
      idempotencyKey: "geo:project:test",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "https://agent.example/api/internal/presales/tasks",
    );
    expect(new Headers(init?.headers).get("x-frontmind-service-token")).toBe(
      "private-token",
    );
    expect(JSON.parse(String(init?.body))).toMatchObject({
      agentProfile: FRONTMIND_BASE_PROFILE,
      taskMode: "agent",
      idempotencyKey: "geo:project:test",
      projectId: "project-1",
    });
  });

  it("allows only an explicit task to use Pro", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "task-pro", status: "running" }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
    );
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales",
      serviceToken: "private-token",
      fetchImpl: fetchMock as typeof fetch,
    });

    await broker.createTask({
      projectId: "project-1",
      prompt: "recommend questions",
      attachments: [],
      idempotencyKey: "geo:project:questions",
      agentProfile: FRONTMIND_PRO_PROFILE,
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      agentProfile: FRONTMIND_PRO_PROFILE,
      taskMode: "agent",
    });
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
      baseUrl: "https://agent.example/api/internal/presales",
      serviceToken: "private-token",
      fetchImpl: fetchMock as typeof fetch,
    });
    await broker.uploadFile(
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
      baseUrl: "https://agent.example/api/internal/presales",
      serviceToken: "private-token",
      fetchImpl: fetchMock as typeof fetch,
    });
    await broker.createMonitorRun({
      question: "Acme 适合科研团队吗？",
      platforms: ["doubao", "kimi"],
      idempotencyKey: "geo-monitor:stable-request-hash",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "https://agent.example/api/internal/presales/monitor-runs",
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      question: "Acme 适合科研团队吗？",
      platforms: ["doubao", "kimi"],
      idempotencyKey: "geo-monitor:stable-request-hash",
    });
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
      baseUrl: "https://agent.example/api/internal/presales",
      serviceToken: "private-token",
      fetchImpl: fetchMock as typeof fetch,
    });

    const result = await broker.getMonitorResult("monitor-run-1");

    expect(result.records).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      "https://agent.example/api/internal/presales/monitor-runs/monitor-run-1/result",
    );
    expect(init?.method).toBeUndefined();
    expect(new Headers(init?.headers).get("x-frontmind-service-token")).toBe(
      "private-token",
    );
  });

  it("reports HTTP 202 monitor results as safely retryable pending reads", async () => {
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "https://agent.example/api/internal/presales",
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
        "https://agent.example/api/internal/presales",
      FRONTMIND_PRESALES_SERVICE_TOKEN: "replace-with-the-same-random-token",
    });
    await expect(broker.getStatus()).rejects.toMatchObject({
      code: "AGENT_NOT_CONFIGURED",
      status: 503,
    });
  });

  it.each([
    "http://agent.example/api/internal/presales",
    "https://user:password@agent.example/api/internal/presales",
    "https://agent.example/api/internal/provisioning",
    "https://agent.example/api/internal/presales/tasks",
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
        "http://frontmind-dashboard:3001/api/internal/presales/status",
      );
      return new Response(
        JSON.stringify({
          ok: true,
          credentialConfigured: true,
          monitorCredentialConfigured: true,
          publicUrlConfigured: true,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const broker = new HttpGeoPresalesBroker({
      baseUrl: "http://frontmind-dashboard:3001/api/internal/presales",
      internalHttpHosts: ["frontmind-dashboard"],
      serviceToken: "presales-service-token-at-least-32-characters",
      fetchImpl: fetchMock as typeof fetch,
    });

    await expect(broker.getStatus()).resolves.toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
            "http://frontmind-dashboard:3001/api/internal/presales",
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
