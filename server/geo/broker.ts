import {
  GEO_UPSTREAM_PROMPT_MAX_CODE_POINTS,
  geoPromptCodePointLength,
} from "./prompt-delivery";

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

const FORWARDED_MONITOR_ERROR_CODES = new Set([
  "MONITOR_SUBMISSION_REJECTED",
  "MONITOR_SUBMISSION_UNKNOWN",
]);

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

export const GEO_DOMESTIC_MONITOR_PLATFORM_IDS = [
  "doubao",
  "yuanbao",
  "deepseek",
  "baiduai",
  "qianwen",
  "kimi",
] as const;

export const GEO_OVERSEAS_MONITOR_PLATFORM_IDS = ["chatgpt"] as const;

export const GEO_MONITOR_PLATFORM_IDS = [
  ...GEO_DOMESTIC_MONITOR_PLATFORM_IDS,
  ...GEO_OVERSEAS_MONITOR_PLATFORM_IDS,
] as const;

export const GEO_MONITORING_EDITIONS = ["domestic", "overseas"] as const;

export type GeoMonitoringEdition = (typeof GEO_MONITORING_EDITIONS)[number];

export type GeoMonitorPlatformId = (typeof GEO_MONITOR_PLATFORM_IDS)[number];

export function normalizedGeoMonitoringEdition(
  edition?: GeoMonitoringEdition,
): GeoMonitoringEdition {
  return edition === "overseas" ? "overseas" : "domestic";
}

export function isValidGeoMonitoringScope(
  edition: GeoMonitoringEdition | undefined,
  platformIds: readonly GeoMonitorPlatformId[],
) {
  const normalizedEdition = normalizedGeoMonitoringEdition(edition);
  const unique = new Set(platformIds);
  if (!platformIds.length || unique.size !== platformIds.length) return false;
  if (normalizedEdition === "overseas") {
    return platformIds.length === 1 && platformIds[0] === "chatgpt";
  }
  const allowed = new Set<GeoMonitorPlatformId>(
    GEO_DOMESTIC_MONITOR_PLATFORM_IDS,
  );
  return platformIds.every((platformId) => allowed.has(platformId));
}

export function geoMonitoringPriceFen(
  edition: GeoMonitoringEdition | undefined,
  platformIds: readonly GeoMonitorPlatformId[],
) {
  if (!isValidGeoMonitoringScope(edition, platformIds)) return undefined;
  return normalizedGeoMonitoringEdition(edition) === "overseas"
    ? 500
    : platformIds.length * 200;
}

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
  sources: BrokerMonitorSource[];
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

export type BrokerProjectTaskDeletion =
  | {
      schemaVersion: 1;
      projectId: string;
      status: "deleted";
      deletedTasks: number;
      deletedFiles: number;
      pendingReservations: 0;
    }
  | {
      schemaVersion: 1;
      projectId: string;
      status: "deleting";
      deletedTasks: number;
      deletedFiles: number;
      pendingReservations: number;
      remainingTasks: number;
      retryAfterMs: number;
    };

type BrokerCreateFileInput = {
  filename: string;
  mimeType?: string;
  sizeBytes: number;
} & (
  | {
      projectId: string;
      idempotencyKey: string;
    }
  | {
      projectId?: undefined;
      idempotencyKey?: string;
    }
);

export interface GeoPresalesBroker {
  getStatus(options?: { freshMonitorCredential?: boolean }): Promise<{
    ok: boolean;
    credentialConfigured: boolean;
    monitorCredentialConfigured: boolean;
    monitorCredentialAuthenticated: boolean;
    publicUrlConfigured?: boolean;
  }>;
  createFile(input: BrokerCreateFileInput): Promise<BrokerFile>;
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
  deleteProjectTasks(projectId: string): Promise<BrokerProjectTaskDeletion>;
  deleteFile(fileId: string): Promise<void>;
  downloadFile(fileId: string): Promise<Response>;
  downloadTaskOutput(
    taskId: string,
    url: string,
    filename?: string,
  ): Promise<Response>;
  createMonitorRun(input: {
    projectId: string;
    question: string;
    platforms: GeoMonitorPlatformId[];
    idempotencyKey: string;
  }): Promise<BrokerMonitorRun>;
  getMonitorRun(runId: string): Promise<BrokerMonitorRun>;
  getMonitorResult(runId: string): Promise<BrokerMonitorRun>;
  deleteMonitorRun(
    projectId: string,
    runId: string,
  ): Promise<"deleted" | "deleting">;
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

  async getStatus(options: { freshMonitorCredential?: boolean } = {}) {
    const status = await this.requestJson<Record<string, unknown>>(
      options.freshMonitorCredential
        ? "/status?monitorCredentialProbe=fresh"
        : "/status",
    );
    if (
      typeof status.ok !== "boolean" ||
      typeof status.credentialConfigured !== "boolean" ||
      typeof status.monitorCredentialConfigured !== "boolean" ||
      typeof status.monitorCredentialAuthenticated !== "boolean" ||
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
      monitorCredentialAuthenticated: status.monitorCredentialAuthenticated,
      ...(typeof status.publicUrlConfigured === "boolean"
        ? { publicUrlConfigured: status.publicUrlConfigured }
        : {}),
    };
  }

  async createFile(input: BrokerCreateFileInput) {
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
    const promptCodePoints = geoPromptCodePointLength(input.prompt);
    if (promptCodePoints > GEO_UPSTREAM_PROMPT_MAX_CODE_POINTS) {
      throw new GeoBrokerError(
        `FrontMind task prompt exceeds ${GEO_UPSTREAM_PROMPT_MAX_CODE_POINTS} Unicode code points`,
        500,
        "TASK_PROMPT_TOO_LONG",
        {
          maximumCodePoints: GEO_UPSTREAM_PROMPT_MAX_CODE_POINTS,
          actualCodePoints: promptCodePoints,
        },
      );
    }
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
    if (response.headers.get("x-frontmind-task-retention") === "retained") {
      if (response.body) await response.body.cancel().catch(() => undefined);
      throw new GeoBrokerError(
        "FrontMind task deletion is not enabled",
        503,
        "TASK_DELETE_RETAINED",
      );
    }
    if (response.body) await response.body.cancel().catch(() => undefined);
  }

  async deleteProjectTasks(projectId: string) {
    const response = await this.request(
      `/projects/${encodeURIComponent(projectId)}/tasks`,
      { method: "DELETE" },
    );
    const payload = (await response.json()) as BrokerProjectTaskDeletion;
    if (
      payload?.schemaVersion !== 1 ||
      payload.projectId !== projectId ||
      !["deleted", "deleting"].includes(payload.status) ||
      !Number.isSafeInteger(payload.deletedTasks) ||
      payload.deletedTasks < 0 ||
      !Number.isSafeInteger(payload.deletedFiles) ||
      payload.deletedFiles < 0 ||
      !Number.isSafeInteger(payload.pendingReservations) ||
      payload.pendingReservations < 0 ||
      (payload.status === "deleted" && payload.pendingReservations !== 0) ||
      (payload.status === "deleting" &&
        (!Number.isSafeInteger(payload.remainingTasks) ||
          payload.remainingTasks < 0 ||
          !Number.isSafeInteger(payload.retryAfterMs) ||
          payload.retryAfterMs <= 0))
    ) {
      throw new GeoBrokerError(
        "FrontMind project task deletion returned an invalid response",
        502,
        "PROJECT_TASK_DELETE_INVALID_RESPONSE",
      );
    }
    return payload;
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
    projectId: string;
    question: string;
    platforms: GeoMonitorPlatformId[];
    idempotencyKey: string;
  }) {
    return this.requestJson<BrokerMonitorRun>("/monitor-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: input.projectId,
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

  async deleteMonitorRun(projectId: string, runId: string) {
    try {
      const response = await this.request(
        `/projects/${encodeURIComponent(projectId)}/monitor-runs/${encodeURIComponent(runId)}`,
        { method: "DELETE" },
      );
      if (response.body) await response.body.cancel().catch(() => undefined);
      return "deleted" as const;
    } catch (error) {
      if (error instanceof GeoBrokerError && error.status === 425) {
        return "deleting" as const;
      }
      throw error;
    }
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
        // Never forward the high-privilege service token across a redirect.
        // Dashboard output URLs are redeemed by its own guarded endpoint.
        redirect: "error",
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
      const code = FORWARDED_MONITOR_ERROR_CODES.has(payload.code)
        ? payload.code
        : response.status === 428
          ? "PRESALES_CREDENTIAL_REQUIRED"
          : response.status === 503
            ? "AGENT_NOT_CONFIGURED"
            : "AGENT_REQUEST_FAILED";
      throw new GeoBrokerError(
        payload.message ? payload.message : "FrontMind 售前服务请求失败",
        status,
        code,
      );
    }

    return response;
  }
}

async function readErrorPayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text) return { message: "", code: "" };
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const nested = parsed.error;
    if (typeof nested === "string") {
      return { message: nested.slice(0, 240), code: "" };
    }
    if (
      nested &&
      typeof nested === "object" &&
      typeof (nested as Record<string, unknown>).message === "string"
    ) {
      const error = nested as Record<string, unknown>;
      return {
        message: String(error.message).slice(0, 240),
        code: typeof error.code === "string" ? error.code : "",
      };
    }
    if (typeof parsed.message === "string") {
      return {
        message: parsed.message.slice(0, 240),
        code: typeof parsed.code === "string" ? parsed.code : "",
      };
    }
  } catch {
    // Return the short upstream text below.
  }
  return { message: text.slice(0, 240), code: "" };
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
