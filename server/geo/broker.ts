export const FRONTMIND_BASE_PROFILE = "frontmind-base" as const;
export const FRONTMIND_PRO_PROFILE = "frontmind-pro" as const;

export type FrontMindAgentProfile =
  | typeof FRONTMIND_BASE_PROFILE
  | typeof FRONTMIND_PRO_PROFILE;

export class GeoBrokerError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "GeoBrokerError";
  }
}

export type BrokerFile = {
  id: string;
  filename: string;
  status: string;
  upload_url?: string;
  upload_expires_at?: string;
  proxy_upload_ticket?: string;
};

export type BrokerTask = Record<string, unknown> & {
  id?: string;
  task_id?: string;
  status?: string;
  output?: unknown;
};

export const GEO_MONITOR_PLATFORM_IDS = [
  "doubao",
  "yuanbao",
  "deepseek",
  "baiduai",
  "qianwen",
  "kimi",
] as const;

export type GeoMonitorPlatformId = (typeof GEO_MONITOR_PLATFORM_IDS)[number];

export type BrokerMonitorSource = {
  title?: string;
  url?: string;
  domain?: string;
  [key: string]: unknown;
};

export type BrokerMonitorMedia = {
  type: "image" | "video" | "audio" | "link";
  url: string;
  title?: string;
  thumbnailUrl?: string;
};

export type BrokerMonitorRecord = {
  recordId: string;
  platform: GeoMonitorPlatformId;
  runIndex: number;
  status: "queued" | "running" | "completed" | "failed" | "stopped" | "error";
  answerText?: string;
  media: BrokerMonitorMedia[];
  citations: BrokerMonitorSource[];
  references: BrokerMonitorSource[];
  error?: string;
  completedAt?: string;
};

export type BrokerMonitorRun = {
  runId: string;
  status:
    | "submission_in_progress"
    | "submission_unknown"
    | "submitted"
    | "polling"
    | "completed"
    | "partial_review_required"
    | "remote_failed"
    | "shape_mismatch";
  question: string;
  platforms: GeoMonitorPlatformId[];
  repeatPerPlatform: 5;
  expectedItems: number;
  completedItems: number;
  failedItems: number;
  submittedAt?: string;
  nextPollAt?: string;
  records?: BrokerMonitorRecord[];
  error?: string;
};

export interface GeoPresalesBroker {
  getStatus(): Promise<{
    ok: boolean;
    credentialConfigured: boolean;
    monitorCredentialConfigured: boolean;
    publicUrlConfigured?: boolean;
  }>;
  createFile(input: {
    filename: string;
    mimeType?: string;
    sizeBytes: number;
    idempotencyKey?: string;
  }): Promise<BrokerFile>;
  uploadFile(
    fileId: string,
    body: Buffer,
    contentType: string,
    uploadTicket?: string,
  ): Promise<unknown>;
  createTask(input: {
    projectId?: string;
    prompt: string;
    attachments: Array<{ file_id: string; filename: string }>;
    idempotencyKey: string;
    agentProfile?: FrontMindAgentProfile;
  }): Promise<BrokerTask>;
  getTask(taskId: string): Promise<BrokerTask>;
  getTaskResult(taskId: string): Promise<BrokerTask>;
  deleteTask(taskId: string): Promise<void>;
  deleteFile(fileId: string): Promise<void>;
  downloadFile(fileId: string): Promise<Response>;
  downloadTaskOutput(
    taskId: string,
    url: string,
    filename?: string,
  ): Promise<Response>;
  createMonitorRun(input: {
    question: string;
    platforms: GeoMonitorPlatformId[];
    idempotencyKey: string;
  }): Promise<BrokerMonitorRun>;
  getMonitorRun(runId: string): Promise<BrokerMonitorRun>;
  getMonitorResult(runId: string): Promise<BrokerMonitorRun>;
  deleteMonitorRun(runId: string): Promise<void>;
}

type BrokerConfig = {
  baseUrl: string;
  serviceToken: string;
  internalHttpHosts?: Iterable<string>;
  fetchImpl?: typeof fetch;
};

const INTERNAL_SERVICE_HOSTNAME_RE =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
const PRESALES_PATH = "/api/internal/presales";

function normalizedHostname(url: URL) {
  return url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
}

function isLoopbackHost(hostname: string) {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  );
}

function isIpLiteral(hostname: string) {
  return hostname.includes(":") || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname);
}

function invalidAgentConfiguration(message: string): never {
  throw new GeoBrokerError(message, 503, "AGENT_NOT_CONFIGURED");
}

function normalizeInternalHttpHosts(values: Iterable<string>) {
  const hosts = new Set<string>();
  for (const entry of Array.from(values)) {
    const hostname = entry.trim().toLowerCase().replace(/\.$/, "");
    if (!hostname) continue;
    if (!INTERNAL_SERVICE_HOSTNAME_RE.test(hostname) || isIpLiteral(hostname)) {
      invalidAgentConfiguration(
        "FRONTMIND_AGENT_INTERNAL_HTTP_HOSTS 必须只包含精确 DNS 主机名",
      );
    }
    hosts.add(hostname);
  }
  return hosts;
}

function configuredInternalHttpHosts(env: NodeJS.ProcessEnv) {
  return normalizeInternalHttpHosts(
    (env.FRONTMIND_AGENT_INTERNAL_HTTP_HOSTS ?? "").split(","),
  );
}

function validatedPresalesBaseUrl(
  value: string,
  internalHttpHosts: Iterable<string> = [],
) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    invalidAgentConfiguration("FrontMind 售前代理服务地址无效");
  }
  const hostname = normalizedHostname(url);
  const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
  const allowedInternalHttpHost =
    isLoopbackHost(hostname) ||
    normalizeInternalHttpHosts(internalHttpHosts).has(hostname);
  if (
    !hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    normalizedPath !== PRESALES_PATH ||
    (url.protocol !== "https:" &&
      !(url.protocol === "http:" && allowedInternalHttpHost))
  ) {
    invalidAgentConfiguration(
      "FrontMind 售前代理服务地址必须是 HTTPS，或使用显式允许的内部 HTTP 主机，并指向固定售前接口",
    );
  }
  return `${url.origin}${PRESALES_PATH}`;
}

export class HttpGeoPresalesBroker implements GeoPresalesBroker {
  private readonly baseUrl: string;
  private readonly serviceToken: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: BrokerConfig) {
    this.baseUrl = validatedPresalesBaseUrl(
      config.baseUrl,
      config.internalHttpHosts,
    );
    this.serviceToken = config.serviceToken;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async getStatus() {
    const status = await this.requestJson<Record<string, unknown>>("/status");
    if (
      typeof status.ok !== "boolean" ||
      typeof status.credentialConfigured !== "boolean" ||
      typeof status.monitorCredentialConfigured !== "boolean" ||
      (status.publicUrlConfigured !== undefined &&
        typeof status.publicUrlConfigured !== "boolean")
    ) {
      throw new GeoBrokerError(
        "FrontMind 售前服务 readiness 响应结构无效",
        502,
        "AGENT_STATUS_INVALID",
      );
    }
    return {
      ok: status.ok,
      credentialConfigured: status.credentialConfigured,
      monitorCredentialConfigured: status.monitorCredentialConfigured,
      ...(typeof status.publicUrlConfigured === "boolean"
        ? { publicUrlConfigured: status.publicUrlConfigured }
        : {}),
    };
  }

  async createFile(input: {
    filename: string;
    mimeType?: string;
    sizeBytes: number;
    idempotencyKey?: string;
  }) {
    return this.requestJson<BrokerFile>("/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async uploadFile(
    fileId: string,
    body: Buffer,
    contentType: string,
    uploadTicket?: string,
  ) {
    return this.requestJson(`/files/${encodeURIComponent(fileId)}/content`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "x-original-content-type": contentType || "application/octet-stream",
        ...(uploadTicket ? { "x-frontmind-upload-ticket": uploadTicket } : {}),
      },
      body,
    });
  }

  async createTask(input: {
    projectId?: string;
    prompt: string;
    attachments: Array<{ file_id: string; filename: string }>;
    idempotencyKey: string;
    agentProfile?: FrontMindAgentProfile;
  }) {
    return this.requestJson<BrokerTask>("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(input.projectId ? { projectId: input.projectId } : {}),
        prompt: input.prompt,
        attachments: input.attachments,
        idempotencyKey: input.idempotencyKey,
        agentProfile: input.agentProfile ?? FRONTMIND_BASE_PROFILE,
        taskMode: "agent",
      }),
    });
  }

  async getTask(taskId: string) {
    return this.requestJson<BrokerTask>(`/tasks/${encodeURIComponent(taskId)}`);
  }

  async getTaskResult(taskId: string) {
    return this.requestJson<BrokerTask>(
      `/tasks/${encodeURIComponent(taskId)}/result`,
    );
  }

  async deleteTask(taskId: string) {
    const response = await this.request(
      `/tasks/${encodeURIComponent(taskId)}`,
      { method: "DELETE" },
    );
    if (response.body) await response.body.cancel().catch(() => undefined);
  }

  async deleteFile(fileId: string) {
    const response = await this.request(
      `/files/${encodeURIComponent(fileId)}`,
      { method: "DELETE" },
    );
    if (response.body) await response.body.cancel().catch(() => undefined);
  }

  async downloadFile(fileId: string) {
    return this.request(
      `/files/${encodeURIComponent(fileId)}/content?download=1`,
    );
  }

  async downloadTaskOutput(taskId: string, url: string, filename?: string) {
    const search = new URLSearchParams({ url });
    if (filename) search.set("filename", filename);
    return this.request(
      `/tasks/${encodeURIComponent(taskId)}/output?${search.toString()}`,
    );
  }

  async createMonitorRun(input: {
    question: string;
    platforms: GeoMonitorPlatformId[];
    idempotencyKey: string;
  }) {
    return this.requestJson<BrokerMonitorRun>("/monitor-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: input.question,
        platforms: input.platforms,
        idempotencyKey: input.idempotencyKey,
      }),
    });
  }

  async getMonitorRun(runId: string) {
    return this.requestJson<BrokerMonitorRun>(
      `/monitor-runs/${encodeURIComponent(runId)}`,
    );
  }

  async getMonitorResult(runId: string) {
    return this.requestJson<BrokerMonitorRun>(
      `/monitor-runs/${encodeURIComponent(runId)}/result`,
      {},
      { rejectAccepted: true },
    );
  }

  async deleteMonitorRun(runId: string) {
    const response = await this.request(
      `/monitor-runs/${encodeURIComponent(runId)}`,
      { method: "DELETE" },
    );
    if (response.body) await response.body.cancel().catch(() => undefined);
  }

  private async requestJson<T>(
    pathname: string,
    init: RequestInit = {},
    responseOptions: { rejectAccepted?: boolean } = {},
  ) {
    const response = await this.request(pathname, init);
    if (responseOptions.rejectAccepted && response.status === 202) {
      if (response.body) await response.body.cancel().catch(() => undefined);
      throw new GeoBrokerError(
        "监控结果仍在生成",
        502,
        "MONITOR_RESULT_PENDING",
        { upstreamStatus: 202 },
      );
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw new GeoBrokerError(
        "Agent 返回了无法识别的数据",
        502,
        "AGENT_INVALID_RESPONSE",
      );
    }
    return (await response.json()) as T;
  }

  private async request(pathname: string, init: RequestInit = {}) {
    if (!this.baseUrl || !this.serviceToken) {
      throw new GeoBrokerError(
        "售前代理服务尚未配置",
        503,
        "AGENT_NOT_CONFIGURED",
      );
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${pathname}`, {
        ...init,
        headers: {
          Accept: "application/json, application/octet-stream;q=0.9, */*;q=0.8",
          "x-frontmind-service-token": this.serviceToken,
          ...(init.headers || {}),
        },
        signal: AbortSignal.timeout(120_000),
      });
    } catch (error) {
      throw new GeoBrokerError(
        "暂时无法连接 FrontMind 售前服务",
        502,
        "AGENT_UNAVAILABLE",
        error instanceof Error ? error.message : String(error),
      );
    }

    if (!response.ok) {
      const payload = await readErrorPayload(response);
      const status =
        response.status === 401 || response.status === 403
          ? 502
          : response.status;
      const code =
        response.status === 428
          ? "PRESALES_CREDENTIAL_REQUIRED"
          : response.status === 503
            ? "AGENT_NOT_CONFIGURED"
            : "AGENT_REQUEST_FAILED";
      throw new GeoBrokerError(
        typeof payload === "string" && payload
          ? payload
          : "FrontMind 售前服务请求失败",
        status,
        code,
      );
    }

    return response;
  }
}

async function readErrorPayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return "";
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const nested = parsed.error;
    if (typeof nested === "string") return nested;
    if (
      nested &&
      typeof nested === "object" &&
      typeof (nested as Record<string, unknown>).message === "string"
    ) {
      return String((nested as Record<string, unknown>).message);
    }
    if (typeof parsed.message === "string") return parsed.message;
  } catch {
    // Return the short upstream text below.
  }
  return text.slice(0, 240);
}

export function createGeoPresalesBrokerFromEnv(
  env: NodeJS.ProcessEnv = process.env,
) {
  const baseUrl =
    env.FRONTMIND_PRESALES_AGENT_URL?.trim() ||
    "http://127.0.0.1:3001/api/internal/presales";
  const configuredToken = env.FRONTMIND_PRESALES_SERVICE_TOKEN?.trim() || "";
  const serviceToken =
    /^(?:replace[-_ ]?with|change[-_ ]?me|example|placeholder|your[-_ ])/i.test(
      configuredToken,
    )
      ? ""
      : configuredToken;
  return new HttpGeoPresalesBroker({
    baseUrl,
    serviceToken,
    internalHttpHosts: configuredInternalHttpHosts(env),
  });
}
