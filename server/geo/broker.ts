import {
  GEO_UPSTREAM_PROMPT_MAX_CODE_POINTS,
  geoPromptCodePointLength,
} from "./prompt-delivery";

export const PRESALES_CONTRACT_VERSION = 2 as const;

export const PRESALES_CAPABILITIES = [
  "local-assets",
  "typed-results",
  "local-artifacts",
  "safe-events",
] as const;

export const PRESALES_CONTRACTS = {
  questionRecommendation: {
    name: "website.question-recommendation",
    revision: 2,
    schemaHash:
      "c2410c0b93f1c67e589e716e254bf9ce6e3f4ec9bb845b99e5f85706315dabb4",
  },
  knowledgeBaseCandidate: {
    name: "website.knowledge-base-candidate",
    revision: 2,
    schemaHash:
      "f7d08256052c49acd99fff60ca19f8075430851c265072674c3271604a7db4ca",
  },
  customQuestionClassifier: {
    name: "website.custom-question-classifier",
    revision: 2,
    schemaHash:
      "f810e57e094582892e1434641d20858bd5d7c324d0722411b21ce8e062320c7c",
  },
  currentStateAssessment: {
    name: "website.current-state-assessment",
    revision: 2,
    schemaHash:
      "cc5c61ed7841239a2290a7077d7a8ad04296a84a88f6c64858e234d25532bb7c",
  },
  optimizationForecast: {
    name: "website.optimization-forecast",
    revision: 2,
    schemaHash:
      "96bdf3df50dbabaca2618e198c7599c2fc53b3e41bff9076b21efcc2a79886b2",
  },
  monitorQuestionTranslation: {
    name: "website.monitor-question-translation",
    revision: 2,
    schemaHash:
      "7c0ceb342ac3bf7410cf6d10fb6d4167f3648c820d79d4fd6600f4965fb02024",
  },
} as const;

export type PresalesContract =
  (typeof PRESALES_CONTRACTS)[keyof typeof PRESALES_CONTRACTS];

export type PresalesContractName = PresalesContract["name"];

export function expectedContractHashes(): Record<string, string> {
  return Object.fromEntries(
    Object.values(PRESALES_CONTRACTS).map((contract) => [
      contract.name,
      contract.schemaHash,
    ]),
  );
}

function contractByName(name: string): PresalesContract | undefined {
  return Object.values(PRESALES_CONTRACTS).find(
    (contract) => contract.name === name,
  );
}

function isMatchingContractHashes(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const hashes = value as Record<string, unknown>;
  const expected = expectedContractHashes();
  return (
    Object.keys(hashes).length === Object.keys(expected).length &&
    Object.entries(expected).every(([name, hash]) => hashes[name] === hash)
  );
}

function isMatchingCapabilities(value: unknown) {
  if (!Array.isArray(value) || value.length !== PRESALES_CAPABILITIES.length) {
    return false;
  }
  const capabilities = new Set(value);
  return (
    capabilities.size === PRESALES_CAPABILITIES.length &&
    PRESALES_CAPABILITIES.every((capability) => capabilities.has(capability))
  );
}

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

const FORWARDED_ERROR_CODES = new Set([
  "MONITOR_SUBMISSION_REJECTED",
  "MONITOR_SUBMISSION_UNKNOWN",
  "TASK_RESULT_PENDING",
  "TASK_SUBMISSION_UNKNOWN",
  "TASK_REPAIR_EXHAUSTED",
  "TASK_REPAIR_NOT_AVAILABLE",
  "PRESALES_CONTRACT_MISMATCH",
  "PRESALES_CREDENTIAL_REQUIRED",
  "LOCAL_ASSET_NOT_FOUND",
  "LOCAL_ARTIFACT_NOT_FOUND",
]);

export type BrokerLocalAsset = {
  localAssetId: string;
  filename: string;
  status: "pending" | "uploaded";
  uploadTicket?: string;
};

export type BrokerArtifact = {
  artifactId: string;
  filename: string;
  mimeType: string;
  bytes: number;
  sha256: string;
};

export type BrokerTaskStatus =
  | "queued"
  | "running"
  | "result_pending"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "attention_required";

export type BrokerSafeEvent = {
  id: string;
  type: string;
  timestamp?: number;
  createdAt?: string;
  message?: string;
};

export type BrokerTaskResult = {
  structuredResult?: unknown;
  artifacts: BrokerArtifact[];
};

export type BrokerTask = {
  localTaskId: string;
  operationId: string;
  status: BrokerTaskStatus;
  safeEvents: BrokerSafeEvent[];
  result?: BrokerTaskResult;
  error?: {
    code: string;
    retryable: boolean;
  };
};

function assertBrokerTask(value: BrokerTask): BrokerTask {
  const statuses: readonly BrokerTaskStatus[] = [
    "queued",
    "running",
    "result_pending",
    "succeeded",
    "failed",
    "cancelled",
    "attention_required",
  ];
  if (
    !value ||
    typeof value.localTaskId !== "string" ||
    !value.localTaskId.trim() ||
    typeof value.operationId !== "string" ||
    !value.operationId.trim() ||
    !statuses.includes(value.status) ||
    !Array.isArray(value.safeEvents) ||
    (value.status === "succeeded" && value.result === undefined) ||
    (value.status !== "succeeded" && value.result !== undefined) ||
    (value.result !== undefined &&
      (typeof value.result !== "object" ||
        !Array.isArray(value.result.artifacts))) ||
    (value.error !== undefined &&
      (!value.error ||
        typeof value.error.code !== "string" ||
        !value.error.code.trim() ||
        typeof value.error.retryable !== "boolean"))
  ) {
    throw new GeoBrokerError(
      "FrontMind 任务响应结构无效",
      502,
      "AGENT_INVALID_RESPONSE",
    );
  }
  return value;
}

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
    presalesContractVersion: 2;
    capabilities: readonly string[];
    contractHashes: Record<string, string>;
  }>;
  createAsset(input: BrokerCreateFileInput): Promise<BrokerLocalAsset>;
  uploadAsset(
    localAssetId: string,
    body: Buffer,
    contentType: string,
    uploadTicket?: string,
  ): Promise<unknown>;
  createTask(input: {
    projectId: string;
    prompt: string;
    localAssets: Array<{ localAssetId: string; filename: string }>;
    idempotencyKey: string;
    contract: PresalesContract;
  }): Promise<BrokerTask>;
  getTask(taskId: string): Promise<BrokerTask>;
  getTaskResult(taskId: string): Promise<BrokerTask>;
  repairTask(
    taskId: string,
    input: { idempotencyKey: string },
  ): Promise<BrokerTask>;
  deleteTask(taskId: string): Promise<void>;
  deleteProjectTasks(projectId: string): Promise<BrokerProjectTaskDeletion>;
  deleteAsset(localAssetId: string): Promise<void>;
  downloadAsset(localAssetId: string): Promise<Response>;
  promoteArtifact(input: {
    projectId: string;
    idempotencyKey: string;
    sourceLocalAssetId: string;
    filename: string;
    mimeType: "application/zip";
    bytes: number;
    sha256: string;
    kind: "website-final-knowledge-base";
  }): Promise<BrokerArtifact>;
  downloadArtifact(artifactId: string): Promise<Response>;
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
const PRESALES_PATH = "/api/internal/presales/v2";

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
      status.presalesContractVersion !== PRESALES_CONTRACT_VERSION ||
      !isMatchingCapabilities(status.capabilities) ||
      !isMatchingContractHashes(status.contractHashes) ||
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
      presalesContractVersion: PRESALES_CONTRACT_VERSION,
      capabilities: PRESALES_CAPABILITIES,
      contractHashes: expectedContractHashes(),
      ...(typeof status.publicUrlConfigured === "boolean"
        ? { publicUrlConfigured: status.publicUrlConfigured }
        : {}),
    };
  }

  async createAsset(input: BrokerCreateFileInput) {
    const asset = await this.requestJson<BrokerLocalAsset>("/assets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (
      !asset ||
      typeof asset.localAssetId !== "string" ||
      !asset.localAssetId.trim() ||
      typeof asset.filename !== "string" ||
      !["pending", "uploaded"].includes(asset.status)
    ) {
      throw new GeoBrokerError(
        "FrontMind 本地资产响应结构无效",
        502,
        "LOCAL_ASSET_INVALID",
      );
    }
    return asset;
  }

  async uploadAsset(
    localAssetId: string,
    body: Buffer,
    contentType: string,
    uploadTicket?: string,
  ) {
    return this.requestJson(
      `/assets/${encodeURIComponent(localAssetId)}/content`,
      {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "x-original-content-type": contentType || "application/octet-stream",
        ...(uploadTicket ? { "x-frontmind-upload-ticket": uploadTicket } : {}),
      },
      body,
      },
    );
  }

  async createTask(input: {
    projectId: string;
    prompt: string;
    localAssets: Array<{ localAssetId: string; filename: string }>;
    idempotencyKey: string;
    contract: PresalesContract;
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
    const expected = contractByName(input.contract.name);
    if (
      !expected ||
      expected.revision !== input.contract.revision ||
      expected.schemaHash !== input.contract.schemaHash
    ) {
      throw new GeoBrokerError(
        "Website 任务合同无效",
        500,
        "PRESALES_CONTRACT_MISMATCH",
      );
    }
    const task = await this.requestJson<BrokerTask>("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: input.projectId,
        prompt: input.prompt,
        localAssetIds: input.localAssets,
        idempotencyKey: input.idempotencyKey,
        contract: input.contract,
      }),
    });
    return assertBrokerTask(task);
  }

  async getTask(taskId: string) {
    return assertBrokerTask(
      await this.requestJson<BrokerTask>(
        `/tasks/${encodeURIComponent(taskId)}`,
      ),
    );
  }

  async getTaskResult(taskId: string) {
    return assertBrokerTask(
      await this.requestJson<BrokerTask>(
        `/tasks/${encodeURIComponent(taskId)}/result`,
      ),
    );
  }

  async repairTask(taskId: string, input: { idempotencyKey: string }) {
    return assertBrokerTask(
      await this.requestJson<BrokerTask>(
        `/tasks/${encodeURIComponent(taskId)}/repair`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idempotencyKey: input.idempotencyKey }),
        },
      ),
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

  async deleteAsset(localAssetId: string) {
    const response = await this.request(
      `/assets/${encodeURIComponent(localAssetId)}`,
      { method: "DELETE" },
    );
    if (response.body) await response.body.cancel().catch(() => undefined);
  }

  async downloadAsset(localAssetId: string) {
    return this.request(
      `/assets/${encodeURIComponent(localAssetId)}/content`,
    );
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
    return this.requestJson<BrokerArtifact>("/artifacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async downloadArtifact(artifactId: string) {
    return this.request(`/artifacts/${encodeURIComponent(artifactId)}/content`);
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
      const code = FORWARDED_ERROR_CODES.has(payload.code)
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
    "http://127.0.0.1:3001/api/internal/presales/v2";
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
