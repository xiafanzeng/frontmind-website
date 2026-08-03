import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { deflateSync } from "node:zlib";
import express from "express";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FRONTMIND_BASE_PROFILE,
  FRONTMIND_PRO_PROFILE,
  GeoBrokerError,
  type BrokerFile,
  type BrokerMonitorRun,
  type BrokerTask,
  type GeoMonitorPlatformId,
  type GeoPresalesBroker,
  type FrontMindAgentProfile,
} from "./broker";
import {
  GeoAdminNotificationConfigurationError,
  type GeoAdminNotification,
} from "./admin-notifications";
import {
  createGeoCustomQuestionRecoveryWorker,
  createGeoRouter,
  GEO_LEGACY_CUSTOM_QUESTION_COMPATIBILITY_WAIT_MS,
} from "./router";
import {
  geoCustomQuestionHash,
  geoCustomQuestionRequestHash,
  MemoryGeoCustomQuestionValidationStore,
} from "./custom-question-validation-store";
import { parseKnowledgeBaseArchive } from "./archive";
import { finalizeKnowledgeBaseCandidate } from "./knowledge-base-finalizer";
import { buildValidQuestionSet } from "./question-set.test-fixture";
import type { GeoQuestion } from "./schemas";
import { GeoTokenCodec } from "./tokens";
import { GeoAccountProvisioningError } from "./provisioning";
import {
  type GeoPaymentCheckoutInput,
  GeoPaymentVerificationError,
  type GeoPaymentVerificationInput,
  type GeoPaymentGateway,
  type GeoServicePaymentCheckoutInput,
  type GeoServicePaymentVerificationInput,
} from "./payment";
import type {
  GeoAccountProvisionRequest,
  GeoKnowledgeImportRequest,
  GeoManualServiceOrderAccountRequest,
  GeoManualServiceOrderCreateRequest,
  GeoManualServiceOrderExternalAuthorizationRequest,
  GeoManualServiceOrderPaymentRequest,
  GeoManualServiceOrderResponse,
  GeoProjectOrder,
  GeoProjectOrderRegistry,
  GeoPurchaseProvisionRequestV2,
  GeoPurchaseProvisionResponseV2,
} from "./provisioning";

function fixtureCrc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function fixturePngChunk(type: string, data: Buffer) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(fixtureCrc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, checksum]);
}

function fixturePng(seed = 1) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    fixturePngChunk("IHDR", header),
    fixturePngChunk("IDAT", deflateSync(Buffer.from([0, seed % 256, 31, 97]))),
    fixturePngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function fixtureEvidenceCharacterCount(markdown: string) {
  return Array.from(
    markdown
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/!\[[^\]]*]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
      .replace(/https?:\/\/[^\s)>\]]+/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\s/g, "")
      .replace(
        /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~，。！？；：“”‘’（）【】《》…—·]/g,
        "",
      ),
  ).length;
}

class MockBroker implements GeoPresalesBroker {
  tasks = new Map<string, BrokerTask>();
  prompts: string[] = [];
  taskAgentProfiles: Array<FrontMindAgentProfile | undefined> = [];
  uploads = new Map<string, Buffer>();
  skillUploads = new Map<string, Buffer>();
  archive = Buffer.alloc(0);
  nextTask = 1;
  nextSkillFile = 1;
  nextRegularFile = 1;
  questionTaskCount = 0;
  customQuestionClassifierTaskCount = 0;
  customQuestionClassifierPendingPolls = 0;
  customQuestionClassifierPolls = 0;
  assessmentTaskCount = 0;
  forecastTaskCount = 0;
  completeAssessmentImmediately = false;
  completeForecastImmediately = false;
  invalidFirstQuestionTask = false;
  questionTaskOutput?: unknown;
  idempotentTasks = new Map<string, BrokerTask>();
  idempotentFiles = new Map<string, BrokerFile>();
  fileCredentialVersions = new Map<string, number>();
  fileCreateOperationKeys: string[] = [];
  loseNextIdempotentFileCreateResponse = false;
  rotateCredentialWhenFileResponseIsLost = false;
  enforceCurrentCredentialAttachments = false;
  currentCredentialVersion = 1;
  deletedFiles: string[] = [];
  failDeleteFile = false;
  createdFileIds: string[] = [];
  uploadAttempts: string[] = [];
  skillUploadError?: Error;
  regularUploadError?: Error;
  taskAttachments: Array<Array<{ file_id: string; filename: string }>> = [];
  monitorRuns = new Map<string, BrokerMonitorRun>();
  monitorResults = new Map<string, BrokerMonitorRun>();
  monitorCreates = 0;
  monitorResultReads = 0;
  monitorResultError?: Error;
  taskResultErrors = new Map<string, Error>();
  taskErrors = new Map<string, Error>();
  createTaskErrors: Error[] = [];
  taskResults = new Map<string, BrokerTask>();
  monitorCredentialConfigured = true;
  publicUrlConfigured = true;
  omitNextKnowledgeTaskStatus = false;
  downloadErrors = new Map<string, Error>();
  downloadOverrides = new Map<string, Buffer>();
  customQuestionClassifierOutput: Record<string, unknown> = {
    decision: "accept",
    category: "product_scenario",
    enterpriseRelated: true,
    reasonCode: "accepted",
    reason: "问题明确指向 Acme 及其科研场景服务能力。",
    enterpriseAnchor: "Acme",
    offeringAnchor: null,
    evidenceRefs: ["01_company_overview/overview.md"],
  };

  async getStatus() {
    return {
      ok: true,
      credentialConfigured: true,
      monitorCredentialConfigured: this.monitorCredentialConfigured,
      publicUrlConfigured: this.publicUrlConfigured,
    };
  }

  async createFile(input: {
    filename: string;
    idempotencyKey?: string;
  }): Promise<BrokerFile> {
    if (input.idempotencyKey) {
      this.fileCreateOperationKeys.push(input.idempotencyKey);
      const replay = this.idempotentFiles.get(input.idempotencyKey);
      if (replay) return replay;
    }
    let file: BrokerFile;
    if (input.filename.endsWith(".skill.zip")) {
      file = {
        id: `skill-file-${this.nextSkillFile++}`,
        filename: input.filename,
        status: "pending",
      };
    } else {
      file = {
        id: `file-${this.nextRegularFile++}`,
        filename: input.filename,
        status: "pending",
      };
    }
    this.createdFileIds.push(file.id);
    this.fileCredentialVersions.set(file.id, this.currentCredentialVersion);
    if (input.idempotencyKey) {
      this.idempotentFiles.set(input.idempotencyKey, file);
      if (this.loseNextIdempotentFileCreateResponse) {
        this.loseNextIdempotentFileCreateResponse = false;
        if (this.rotateCredentialWhenFileResponseIsLost) {
          this.currentCredentialVersion += 1;
        }
        throw new GeoBrokerError(
          "Dashboard committed the file but the response was lost",
          502,
          "AGENT_UNAVAILABLE",
        );
      }
    }
    return file;
  }

  async uploadFile(fileId: string, body: Buffer) {
    this.uploadAttempts.push(fileId);
    if (fileId.startsWith("skill-file-") && this.skillUploadError) {
      throw this.skillUploadError;
    }
    if (!fileId.startsWith("skill-file-") && this.regularUploadError) {
      throw this.regularUploadError;
    }
    if (fileId.startsWith("skill-file-")) {
      this.skillUploads.set(fileId, body);
    } else {
      this.uploads.set(fileId, body);
    }
    return { status: "uploaded" };
  }

  async createTask(input: {
    prompt: string;
    attachments: Array<{ file_id: string; filename: string }>;
    idempotencyKey: string;
    agentProfile?: FrontMindAgentProfile;
  }) {
    const configuredError = this.createTaskErrors.shift();
    if (configuredError) throw configuredError;
    if (
      this.enforceCurrentCredentialAttachments &&
      input.attachments.some(
        (attachment) =>
          this.fileCredentialVersions.get(attachment.file_id) !==
          this.currentCredentialVersion,
      )
    ) {
      throw new GeoBrokerError(
        "attachments belong to a retired credential generation",
        409,
        "AGENT_REQUEST_FAILED",
      );
    }
    const existing = this.idempotentTasks.get(input.idempotencyKey);
    if (existing) return existing;
    this.prompts.push(input.prompt);
    this.taskAgentProfiles.push(input.agentProfile);
    this.taskAttachments.push(input.attachments);
    const isQuestionTask = input.prompt.includes(
      "geo-question-recommender.skill.zip",
    );
    const isCustomQuestionClassifierTask = input.prompt.includes(
      "geo-custom-question-classifier.skill.zip",
    );
    const isAssessmentTask = input.prompt.includes(
      "geo-current-state-evaluator.skill.zip",
    );
    const isForecastTask = input.prompt.includes(
      "geo-optimization-outcome-forecaster.skill.zip",
    );
    const id = isCustomQuestionClassifierTask
      ? `custom-question-classifier-${++this.customQuestionClassifierTaskCount}`
      : isQuestionTask
        ? `question-${++this.questionTaskCount}`
        : isAssessmentTask
          ? `assessment-${++this.assessmentTaskCount}`
          : isForecastTask
            ? `forecast-${++this.forecastTaskCount}`
            : `kb-${this.nextTask++}`;
    const task: BrokerTask = isCustomQuestionClassifierTask
      ? this.customQuestionClassifierPendingPolls > 0
        ? {
            id,
            status: "running",
            progress: 0.25,
            output: [],
          }
        : {
            id,
            status: "completed",
            output: [
              {
                role: "assistant",
                content: [
                  { text: JSON.stringify(this.customQuestionClassifierOutput) },
                ],
              },
            ],
          }
      : isQuestionTask
        ? {
            id,
            status: "completed",
            output: [
              {
                role: "assistant",
                content: [
                  {
                    text:
                      this.questionTaskOutput !== undefined
                        ? (JSON.stringify(this.questionTaskOutput) ?? "")
                        : this.invalidFirstQuestionTask &&
                            this.questionTaskCount === 1
                          ? JSON.stringify({ questions: [] })
                          : JSON.stringify(validQuestionSet()),
                  },
                ],
              },
            ],
          }
        : isAssessmentTask && this.completeAssessmentImmediately
          ? {
              id,
              status: "completed",
              output: [
                {
                  role: "assistant",
                  content: [{ text: JSON.stringify(validAssessmentOutput()) }],
                },
              ],
            }
          : isForecastTask && this.completeForecastImmediately
            ? {
                id,
                status: "completed",
                output: [
                  {
                    role: "assistant",
                    content: [{ text: JSON.stringify(validForecastOutput()) }],
                  },
                ],
              }
            : !isQuestionTask &&
                !isAssessmentTask &&
                !isForecastTask &&
                this.omitNextKnowledgeTaskStatus
              ? { id, progress: 0.25, output: [] }
              : { id, status: "running", progress: 0.25, output: [] };
    this.tasks.set(id, task);
    this.idempotentTasks.set(input.idempotencyKey, task);
    return task;
  }

  async getTask(taskId: string) {
    const configuredError = this.taskErrors.get(taskId);
    if (configuredError) throw configuredError;
    let task = this.tasks.get(taskId);
    if (!task) throw new Error("missing task");
    if (
      taskId.startsWith("custom-question-classifier-") &&
      task.status === "running"
    ) {
      this.customQuestionClassifierPolls += 1;
      this.customQuestionClassifierPendingPolls -= 1;
      if (this.customQuestionClassifierPendingPolls <= 0) {
        task = {
          id: taskId,
          status: "completed",
          output: [
            {
              role: "assistant",
              content: [
                { text: JSON.stringify(this.customQuestionClassifierOutput) },
              ],
            },
          ],
        };
        this.tasks.set(taskId, task);
      }
    }
    return task;
  }

  async getTaskResult(taskId: string) {
    const error = this.taskResultErrors.get(taskId);
    if (error) throw error;
    return this.taskResults.get(taskId) ?? this.getTask(taskId);
  }

  async deleteFile(fileId: string) {
    if (this.failDeleteFile) throw new Error("delete failed");
    this.deletedFiles.push(fileId);
    this.uploads.delete(fileId);
    this.skillUploads.delete(fileId);
  }

  async downloadFile(fileId?: string) {
    if (fileId) {
      const error = this.downloadErrors.get(fileId);
      if (error) throw error;
    }
    const bytes =
      (fileId && this.downloadOverrides.get(fileId)) ||
      (fileId && this.uploads.get(fileId)) ||
      this.archive;
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-length": String(bytes.length),
      },
    });
  }

  async downloadTaskOutput() {
    return this.downloadFile();
  }

  async createMonitorRun(input: {
    question: string;
    platforms: GeoMonitorPlatformId[];
    idempotencyKey: string;
  }) {
    const existing = this.monitorRuns.get(input.idempotencyKey);
    if (existing) return existing;
    this.monitorCreates += 1;
    const run: BrokerMonitorRun = {
      runId: `monitor-${this.monitorCreates}`,
      status: "submitted",
      question: input.question,
      platforms: input.platforms,
      repeatPerPlatform: 5,
      expectedItems: input.platforms.length * 5,
      completedItems: 0,
      failedItems: 0,
      nextPollAt: new Date(Date.now() + 300_000).toISOString(),
    };
    this.monitorRuns.set(input.idempotencyKey, run);
    this.monitorRuns.set(run.runId, run);
    return run;
  }

  async getMonitorRun(runId: string) {
    const run = this.monitorRuns.get(runId);
    if (!run) throw new Error("missing monitor run");
    return run;
  }

  async getMonitorResult(runId: string) {
    this.monitorResultReads += 1;
    if (this.monitorResultError) throw this.monitorResultError;
    return this.monitorResults.get(runId) ?? this.getMonitorRun(runId);
  }

  async deleteMonitorRun(runId: string) {
    this.monitorRuns.delete(runId);
  }
}

let server: Server;
let baseUrl: string;
let broker: MockBroker;
let paymentCalls: GeoPaymentVerificationInput[];
let paymentCheckoutCalls: GeoPaymentCheckoutInput[];
let paymentStatusCalls: GeoPaymentVerificationInput[];
let servicePaymentCalls: GeoServicePaymentVerificationInput[];
let servicePaymentCheckoutCalls: GeoServicePaymentCheckoutInput[];
let servicePaymentStatusCalls: GeoServicePaymentVerificationInput[];
let accountProvisionCalls: GeoAccountProvisionRequest[];
let purchaseProvisionCalls: GeoPurchaseProvisionRequestV2[];
let purchaseStatusReads: string[];
let knowledgeImportCalls: Array<{
  projectId: string;
  request: GeoKnowledgeImportRequest;
}>;
let purchaseProvisionResponse: GeoPurchaseProvisionResponseV2;
let manualOrderCreateCalls: GeoManualServiceOrderCreateRequest[];
let manualOrderExternalAuthorizationCalls: Array<{
  reference: string;
  request: GeoManualServiceOrderExternalAuthorizationRequest;
}>;
let manualOrderExternalAuthorizationOverride:
  | Partial<GeoManualServiceOrderResponse["order"]>
  | undefined;
let manualOrderStatusReads: string[];
let manualOrderPaymentCalls: Array<{
  reference: string;
  request: GeoManualServiceOrderPaymentRequest;
}>;
let manualOrderAccountCalls: Array<{
  reference: string;
  request: GeoManualServiceOrderAccountRequest;
}>;
let adminNotificationCalls: GeoAdminNotification[];
let manualOrderResponse: GeoManualServiceOrderResponse;
let knowledgeImportShouldFail: boolean;
let adminNotificationShouldFail: boolean;
let manualOrderAccountShouldRemainPending: boolean;
let paymentAccepted: boolean;
let servicePaymentPaidAt: string;
let projectOrders: Map<string, GeoProjectOrder>;
let projectOrderRegistry: GeoProjectOrderRegistry;
let paymentGateway: GeoPaymentGateway;
let customQuestionValidationStore: MemoryGeoCustomQuestionValidationStore;
let customQuestionValidationNowMs: number;

const CUSTOM_QUESTION_CLIENT_REQUEST_ID =
  "11111111-1111-4111-8111-111111111111";
const CONTRACT_AUTH_CODE = "contract-code-from-server-env";

beforeEach(async () => {
  broker = new MockBroker();
  customQuestionValidationNowMs = Date.parse("2026-08-01T00:00:00.000Z");
  customQuestionValidationStore = new MemoryGeoCustomQuestionValidationStore();
  broker.archive = await fixtureCandidateArchive();
  paymentCalls = [];
  paymentCheckoutCalls = [];
  paymentStatusCalls = [];
  servicePaymentCalls = [];
  servicePaymentCheckoutCalls = [];
  servicePaymentStatusCalls = [];
  accountProvisionCalls = [];
  purchaseProvisionCalls = [];
  purchaseStatusReads = [];
  manualOrderCreateCalls = [];
  manualOrderExternalAuthorizationCalls = [];
  manualOrderExternalAuthorizationOverride = undefined;
  manualOrderStatusReads = [];
  manualOrderPaymentCalls = [];
  manualOrderAccountCalls = [];
  adminNotificationCalls = [];
  knowledgeImportCalls = [];
  knowledgeImportShouldFail = false;
  adminNotificationShouldFail = false;
  manualOrderAccountShouldRemainPending = false;
  purchaseProvisionResponse = {
    schemaVersion: 2,
    purchase: {
      reference: "purchase-reference-001",
      projectId: "placeholder-project",
      orderId: "zpay-service-order-001",
      status: "pending_confirmation",
      updatedAt: "2026-07-22T10:12:00.000Z",
      retryable: false,
    },
  };
  manualOrderResponse = {
    schemaVersion: 1,
    order: {
      reference: "manual-order-reference-001",
      projectId: "placeholder-project",
      status: "pending_admin",
      amountFen: 150_000,
      updatedAt: "2026-07-22T10:12:00.000Z",
      retryable: false,
    },
  };
  paymentAccepted = true;
  servicePaymentPaidAt = new Date(Date.now() + 60_000).toISOString();
  projectOrders = new Map();
  projectOrderRegistry = {
    async assertReady() {},
    async upsert(order) {
      projectOrders.set(order.orderId, order);
      return order;
    },
    async commitIntent(intentOrderId, order) {
      const intent = projectOrders.get(intentOrderId);
      if (!intent) throw new Error("missing checkout intent");
      projectOrders.set(intentOrderId, {
        ...intent,
        state: "closed",
        eventAt: order.eventAt,
      });
      projectOrders.set(order.orderId, order);
      return order;
    },
    async findByProject(projectId) {
      const orders = Array.from(projectOrders.values()).filter(
        (order) => order.projectId === projectId,
      );
      return {
        schemaVersion: 1,
        projectId,
        blockDeletion: orders.some(
          (order) =>
            order.state !== "fulfilled" &&
            order.state !== "terminal_failed" &&
            order.state !== "closed",
        ),
        orders,
      };
    },
  };
  paymentGateway = {
    async createCheckout(input) {
      paymentCheckoutCalls.push(input);
      return {
        authorization: "zpay-signed-authorization-placeholder",
        orderId: "zpay-order-001",
        amountFen: input.expectedAmountFen,
        expiresAt: "2027-07-23T10:00:00.000Z",
        action: "https://zpayz.cn/submit.php",
        method: "POST",
        fields: {
          pid: "merchant-test",
          type: input.method,
          money: (input.expectedAmountFen / 100).toFixed(2),
          sign: "test-signature",
          sign_type: "MD5",
        },
      };
    },
    async getStatus(input) {
      paymentStatusCalls.push(input);
      return {
        status: paymentAccepted ? "paid" : "pending",
        orderId: "zpay-order-001",
        amountFen: input.expectedAmountFen,
        paidAt: paymentAccepted ? "2026-07-22T10:05:00.000Z" : undefined,
      };
    },
    async createServiceCheckout(input) {
      servicePaymentCheckoutCalls.push(input);
      return {
        authorization: "zpay-service-authorization-placeholder",
        orderId: "zpay-service-order-001",
        amountFen: input.expectedAmountFen,
        expiresAt: "2027-07-23T10:00:00.000Z",
        action: "https://zpayz.cn/submit.php",
        method: "POST",
        fields: {
          pid: "merchant-test",
          type: input.method,
          money: (input.expectedAmountFen / 100).toFixed(2),
          sign: "test-service-signature",
          sign_type: "MD5",
        },
      };
    },
    async getServiceStatus(input) {
      servicePaymentStatusCalls.push(input);
      return {
        status: paymentAccepted ? "paid" : "pending",
        orderId: "zpay-service-order-001",
        amountFen: input.expectedAmountFen,
        paidAt: paymentAccepted ? servicePaymentPaidAt : undefined,
      };
    },
    async verifyCallback(params) {
      if (params.sign === "ledger-down") {
        throw new GeoPaymentVerificationError(
          "付款已确认，但支付回执暂未安全保存",
          "PAYMENT_LEDGER_UNAVAILABLE",
          503,
        );
      }
      return {
        status:
          params.sign === "review"
            ? ("review_required" as const)
            : ("paid" as const),
        orderId: "zpay-order-001",
        amountFen: 400,
        tradeNo: "zpay-trade-router-test",
        paidAt: "2026-07-22T10:05:00.000Z",
      };
    },
    async verify(input) {
      paymentCalls.push(input);
      if (!paymentAccepted) {
        throw new GeoPaymentVerificationError("payment denied");
      }
      return {
        orderId: "zpay-order-001",
        amountFen: input.expectedAmountFen,
        paidAt: new Date().toISOString(),
      };
    },
    async verifyService(input) {
      servicePaymentCalls.push(input);
      if (!paymentAccepted) {
        throw new GeoPaymentVerificationError("service payment denied");
      }
      return {
        orderId: "zpay-service-order-001",
        amountFen: input.expectedAmountFen,
        paidAt: servicePaymentPaidAt,
      };
    },
  };
  const app = express();
  app.use(
    "/api/geo",
    createGeoRouter({
      broker,
      customQuestionValidationStore,
      customQuestionValidationNow: () => customQuestionValidationNowMs,
      paymentGateway,
      accountProvisioner: async (request) => {
        accountProvisionCalls.push(request);
        return {
          provision: {
            id: "provision-001",
            projectId: request.project.id,
            orderId: request.order.id,
            contractId: request.contract.id,
            status: "completed",
            completedAt: "2026-07-22T10:20:00.000Z",
          },
          user: {
            id: 42,
            username: request.account.username,
            displayName: request.account.displayName,
            role: "user",
            isActive: true,
          },
        };
      },
      purchaseProvisioner: async (request) => {
        purchaseProvisionCalls.push(request);
        return {
          ...purchaseProvisionResponse,
          purchase: {
            ...purchaseProvisionResponse.purchase,
            projectId: request.project.id,
            orderId: request.order.id,
          },
        };
      },
      purchaseStatusReader: async (reference) => {
        purchaseStatusReads.push(reference);
        return purchaseProvisionResponse;
      },
      manualOrderCreator: async (request) => {
        manualOrderCreateCalls.push(request);
        const response: GeoManualServiceOrderResponse = {
          ...manualOrderResponse,
          order: {
            ...manualOrderResponse.order,
            projectId: request.project.id,
            amountFen:
              request.service.purchasedQuestion.category === "product_scenario"
                ? 150_000
                : 200_000,
          },
        };
        manualOrderResponse = response;
        return response;
      },
      manualOrderExternalAuthorizer: async (reference, request) => {
        manualOrderExternalAuthorizationCalls.push({ reference, request });
        const {
          contractId: _contractId,
          signingUrl: _signingUrl,
          signedAt: _signedAt,
          ...orderWithoutElectronicContract
        } = manualOrderResponse.order;
        manualOrderResponse = {
          ...manualOrderResponse,
          order: {
            ...orderWithoutElectronicContract,
            status: "payment_required",
            contractAuthorizationMode: "external_wechat",
            contractAuthorizedAt: request.authorization.authorizedAt,
            updatedAt: request.authorization.authorizedAt,
            ...manualOrderExternalAuthorizationOverride,
          },
        };
        return manualOrderResponse;
      },
      manualOrderStatusReader: async (reference) => {
        manualOrderStatusReads.push(reference);
        return manualOrderResponse;
      },
      manualOrderPaymentConfirmer: async (reference, request) => {
        manualOrderPaymentCalls.push({ reference, request });
        manualOrderResponse = {
          ...manualOrderResponse,
          order: {
            ...manualOrderResponse.order,
            status: "account_setup_required",
            updatedAt: "2026-07-22T10:18:00.000Z",
          },
        };
        return manualOrderResponse;
      },
      manualOrderAccountSubmitter: async (reference, request) => {
        const existing = manualOrderAccountCalls.find(
          (call) => call.reference === reference,
        );
        if (
          existing &&
          JSON.stringify(existing.request) !== JSON.stringify(request)
        ) {
          throw new GeoAccountProvisioningError(
            "账号资料与首次提交不一致",
            409,
            "IDEMPOTENCY_CONFLICT",
          );
        }
        manualOrderAccountCalls.push({ reference, request });
        manualOrderResponse = {
          ...manualOrderResponse,
          order: {
            ...manualOrderResponse.order,
            status: manualOrderAccountShouldRemainPending
              ? "activation_required"
              : "active",
            provisioningReference: "purchase-reference-001",
            updatedAt: "2026-07-22T10:19:00.000Z",
          },
          account:
            request.account.mode === "create"
              ? {
                  username: request.account.username,
                  displayName: request.account.displayName,
                  workspaceUrl: "https://dashboard.frontmind.net/",
                }
              : {
                  username: "existing.user",
                  displayName: "Existing User",
                  workspaceUrl: "https://dashboard.frontmind.net/",
                },
        };
        return manualOrderResponse;
      },
      adminNotifier: {
        async notify(notification) {
          adminNotificationCalls.push(notification);
          if (adminNotificationShouldFail) {
            throw new Error("notification unavailable");
          }
          return { delivery: "delivered" };
        },
      },
      knowledgeImporter: async (projectId, request) => {
        knowledgeImportCalls.push({ projectId, request });
        if (knowledgeImportShouldFail) {
          return {
            schemaVersion: 2,
            knowledgeImport: {
              id: "knowledge-import-001",
              projectId,
              status: "failed",
              updatedAt: "2026-07-22T10:14:00.000Z",
              retryable: true,
              message: "知识库导入暂时失败",
            },
          };
        }
        return {
          schemaVersion: 2,
          knowledgeImport: {
            id: "knowledge-import-001",
            projectId,
            status: "ready",
            updatedAt: "2026-07-22T10:14:00.000Z",
            retryable: false,
            workspaceUrl: "https://dashboard.frontmind.net/",
          },
        };
      },
      projectOrderRegistry,
      env: {
        NODE_ENV: "test",
        FRONTMIND_GEO_INVITE_CODE: "frontmind666",
        FRONTMIND_GEO_SESSION_SECRET:
          "test-session-secret-at-least-16-characters",
        FRONTMIND_GEO_CONTRACT_AUTH_CODE: CONTRACT_AUTH_CODE,
      },
    }),
  );
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/geo`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe("GEO API", () => {
  it("fails GEO router initialization when the admin webhook is only partially configured", () => {
    expect(() =>
      createGeoRouter({
        broker,
        customQuestionValidationStore:
          new MemoryGeoCustomQuestionValidationStore(),
        env: {
          NODE_ENV: "test",
          FRONTMIND_GEO_INVITE_CODE: "frontmind666",
          FRONTMIND_GEO_SESSION_SECRET:
            "test-session-secret-at-least-16-characters",
          FRONTMIND_GEO_ADMIN_WEBHOOK_URL:
            "https://notifications.example.com/frontmind/geo",
        },
      }),
    ).toThrow(GeoAdminNotificationConfigurationError);
  });

  it("validates invitations with an HttpOnly session cookie", async () => {
    const denied = await fetch(`${baseUrl}/invite/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "wrong" }),
    });
    expect(denied.status).toBe(401);
    expect(await denied.json()).toMatchObject({
      ok: false,
      error: { code: "INVALID_INVITE_CODE" },
    });

    const allowed = await verifyInvite();
    expect(allowed.response.status).toBe(200);
    expect(allowed.response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(allowed.response.headers.get("set-cookie")).toContain(
      "Max-Age=31536000",
    );
  });

  it("refreshes an existing browser session without changing project ownership", async () => {
    const first = await verifyInvite();
    const created = await jsonRequest("/projects", first.cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const projectToken = (created.body as Record<string, string>).projectToken;

    const refreshed = await verifyInvite(first.cookie);
    expect(refreshed.response.status).toBe(200);
    expect(refreshed.cookie).not.toBe(first.cookie);

    const restored = await jsonRequest(
      `/projects/${encodeURIComponent(projectToken)}`,
      refreshed.cookie,
    );
    expect(restored.response.status).toBe(200);
  });

  it("never writes an unknown error payload, question, or credential to logs", async () => {
    const privateMarkers = [
      "PRIVATE_QUESTION_MARKER",
      "PRIVATE_TASK_OUTPUT_MARKER",
      "PRIVATE_CREDENTIAL_MARKER",
    ];
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    broker.createTaskErrors.push(new Error(privateMarkers.join(" ")));

    try {
      const { cookie } = await verifyInvite();
      const response = await jsonRequest("/projects", cookie, {
        method: "POST",
        body: { input: "Acme", attachments: [] },
      });
      expect(response.response.status).toBe(500);
      expect(response.body).toMatchObject({
        error: { code: "INTERNAL_ERROR" },
      });
      const serializedLogs = JSON.stringify(log.mock.calls);
      for (const marker of privateMarkers) {
        expect(serializedLogs).not.toContain(marker);
      }
      expect(log).toHaveBeenCalledWith("[GEO API]", {
        event: "unhandled_error",
        diagnosticCode: "INTERNAL_ERROR",
      });
    } finally {
      log.mockRestore();
    }
  });

  it("rejects every project-token operation from another browser session", async () => {
    const owner = await verifyInvite();
    const otherBrowser = await verifyInvite();
    const created = await jsonRequest("/projects", owner.cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const projectToken = (created.body as Record<string, string>).projectToken;
    const encoded = encodeURIComponent(projectToken);

    for (const [pathname, method, body] of [
      [`/projects/${encoded}`, "GET", undefined],
      [`/projects/${encoded}/questions`, "POST", {}],
      [
        `/projects/${encoded}/questions/custom`,
        "POST",
        {
          question: "Acme 好不好？",
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        },
      ],
      [`/projects/${encoded}/payments`, "POST", {}],
      [`/projects/${encoded}/payments/status`, "POST", {}],
      [`/projects/${encoded}/services/contracts`, "POST", {}],
      [`/projects/${encoded}/services/contracts/status`, "POST", {}],
      [`/projects/${encoded}/services/payments`, "POST", {}],
      [`/projects/${encoded}/services/payments/status`, "POST", {}],
      [`/projects/${encoded}/services/start`, "POST", {}],
      [`/projects/${encoded}/services/account`, "POST", {}],
      [`/projects/${encoded}/services/account/status`, "POST", {}],
      [`/projects/${encoded}/monitoring`, "POST", {}],
      [`/projects/${encoded}/assessment`, "POST", {}],
      [`/projects/${encoded}/optimization-forecast`, "POST", {}],
      [`/projects/${encoded}/archive`, "GET", undefined],
      [`/projects/${encoded}`, "DELETE", undefined],
    ] as const) {
      const response = await jsonRequest(pathname, otherBrowser.cookie, {
        method,
        body,
      });
      expect(response.response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: { code: "PROJECT_SESSION_MISMATCH" },
      });
    }
  });

  it("fails closed when production uses a public placeholder session secret", async () => {
    const app = express();
    app.use(
      "/api/geo",
      createGeoRouter({
        broker,
        customQuestionValidationStore:
          new MemoryGeoCustomQuestionValidationStore(),
        env: {
          NODE_ENV: "production",
          FRONTMIND_GEO_INVITE_CODE: "frontmind666",
          FRONTMIND_GEO_SESSION_SECRET:
            "replace-with-at-least-32-random-characters",
        },
      }),
    );
    const placeholderServer = app.listen(0);
    await new Promise<void>((resolve) =>
      placeholderServer.once("listening", resolve),
    );
    try {
      const port = (placeholderServer.address() as AddressInfo).port;
      const response = await fetch(
        `http://127.0.0.1:${port}/api/geo/invite/verify`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code: "frontmind666" }),
        },
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        error: { code: "GEO_NOT_CONFIGURED" },
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        placeholderServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it.each(["frontmind666", "short-code", "replace-with-invite-code"])(
    "fails closed when production uses an unsafe invite code: %s",
    async (unsafeInviteCode) => {
      const app = express();
      app.use(
        "/api/geo",
        createGeoRouter({
          broker,
          projectOrderRegistry,
          customQuestionValidationStore:
            new MemoryGeoCustomQuestionValidationStore(),
          env: {
            NODE_ENV: "production",
            FRONTMIND_GEO_INVITE_CODE: unsafeInviteCode,
            FRONTMIND_GEO_SESSION_SECRET:
              "production-session-secret-with-enough-entropy-20260728",
          },
        }),
      );
      const unsafeInviteServer = app.listen(0);
      await new Promise<void>((resolve) =>
        unsafeInviteServer.once("listening", resolve),
      );
      try {
        const port = (unsafeInviteServer.address() as AddressInfo).port;
        const response = await fetch(
          `http://127.0.0.1:${port}/api/geo/invite/verify`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ code: unsafeInviteCode }),
          },
        );
        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({
          error: { code: "GEO_NOT_CONFIGURED" },
        });
      } finally {
        await new Promise<void>((resolve, reject) =>
          unsafeInviteServer.close((error) =>
            error ? reject(error) : resolve(),
          ),
        );
      }
    },
  );

  it.each([
    "",
    "frontmind666",
    "short-contract-code",
    "replace-with-contract-auth-code",
  ])(
    "fails closed when production uses an unsafe contract authorization code: %s",
    async (unsafeContractCode) => {
      const app = express();
      app.use(
        "/api/geo",
        createGeoRouter({
          broker,
          projectOrderRegistry,
          customQuestionValidationStore:
            new MemoryGeoCustomQuestionValidationStore(),
          env: {
            NODE_ENV: "production",
            FRONTMIND_GEO_INVITE_CODE: "secure-production-invite-20260802",
            FRONTMIND_GEO_SESSION_SECRET:
              "production-session-secret-with-enough-entropy-20260802",
            FRONTMIND_GEO_CONTRACT_AUTH_CODE: unsafeContractCode,
          },
        }),
      );
      const unsafeContractServer = app.listen(0);
      await new Promise<void>((resolve) =>
        unsafeContractServer.once("listening", resolve),
      );
      try {
        const port = (unsafeContractServer.address() as AddressInfo).port;
        const response = await fetch(
          `http://127.0.0.1:${port}/api/geo/invite/verify`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              code: "secure-production-invite-20260802",
            }),
          },
        );
        expect(response.status).toBe(503);
        expect(await response.json()).toMatchObject({
          error: { code: "GEO_NOT_CONFIGURED" },
        });
      } finally {
        await new Promise<void>((resolve, reject) =>
          unsafeContractServer.close((error) =>
            error ? reject(error) : resolve(),
          ),
        );
      }
    },
  );

  it("fails closed when a production session secret has fewer than 32 characters", async () => {
    const app = express();
    app.use(
      "/api/geo",
      createGeoRouter({
        broker,
        projectOrderRegistry,
        customQuestionValidationStore:
          new MemoryGeoCustomQuestionValidationStore(),
        env: {
          NODE_ENV: "production",
          FRONTMIND_GEO_INVITE_CODE: "secure-production-invite-20260728",
          FRONTMIND_GEO_SESSION_SECRET: "only-24-characters-long",
        },
      }),
    );
    const shortSecretServer = app.listen(0);
    await new Promise<void>((resolve) =>
      shortSecretServer.once("listening", resolve),
    );
    try {
      const port = (shortSecretServer.address() as AddressInfo).port;
      const response = await fetch(
        `http://127.0.0.1:${port}/api/geo/invite/verify`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            code: "secure-production-invite-20260728",
          }),
        },
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        error: { code: "GEO_NOT_CONFIGURED" },
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        shortSecretServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("supports proxy upload and attachment-only project creation with opaque task ids", async () => {
    const { cookie } = await verifyInvite();
    const initialized = await jsonRequest("/uploads/init", cookie, {
      method: "POST",
      body: {
        filename: "catalog.pdf",
        contentType: "application/pdf",
        sizeBytes: 3,
      },
    });
    expect(initialized.response.status).toBe(201);
    const ticket = initialized.body as Record<string, string>;

    const uploaded = await fetch(`${baseUrl}/uploads/proxy`, {
      method: "PUT",
      headers: {
        cookie,
        "content-type": "application/pdf",
        "x-geo-upload-token": ticket.uploadToken,
      },
      body: Buffer.from("pdf"),
    });
    expect(uploaded.status).toBe(200);

    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: {
        input: "",
        attachments: [
          {
            fileId: ticket.fileId,
            filename: ticket.filename,
            uploadToken: ticket.uploadToken,
          },
        ],
      },
    });
    expect(created.response.status).toBe(201);
    const payload = created.body as Record<string, any>;
    expect(payload.projectToken).not.toContain("kb-1");
    expect(payload.project.kbTask.id).toBe("knowledge-base");
    expect(payload.project.kbTask.progress).toBe(25);
    expect(payload.project.kbTask.output).toEqual([]);
    expect(payload.project.executionLog).toMatchObject({
      currentEntryId: "enterprise-analysis",
      entries: [
        {
          id: "enterprise-analysis",
          stage: "enterprise_analysis",
          status: "running",
          progress: 25,
        },
      ],
    });
    expect(broker.prompts[0]).toContain("不要询问、等待确认");
    expect(broker.prompts[0]).toContain("catalog.pdf");
    expect(broker.prompts[0]).not.toContain("# FILE: SKILL.md");
    expect(broker.taskAgentProfiles).toEqual([FRONTMIND_BASE_PROFILE]);
    expect(broker.taskAttachments[0]).toEqual([
      {
        file_id: "skill-file-1",
        filename: "website-one-shot-kb-builder.skill.zip",
      },
      { file_id: ticket.fileId, filename: "catalog.pdf" },
    ]);
    expect(
      broker.skillUploads.get("skill-file-1")?.subarray(0, 4).toString("hex"),
    ).toBe("504b0304");
  });

  it("binds upload tickets to the invitation session and declared size", async () => {
    const first = await verifyInvite();
    const second = await verifyInvite();
    const initialized = await jsonRequest("/uploads/init", first.cookie, {
      method: "POST",
      body: {
        filename: "catalog.pdf",
        contentType: "application/pdf",
        sizeBytes: 3,
      },
    });
    const ticket = initialized.body as Record<string, string>;

    const wrongSession = await fetch(`${baseUrl}/uploads/proxy`, {
      method: "PUT",
      headers: {
        cookie: second.cookie,
        "content-type": "application/pdf",
        "x-geo-upload-token": ticket.uploadToken,
      },
      body: Buffer.from("pdf"),
    });
    expect(wrongSession.status).toBe(403);

    const wrongSize = await fetch(`${baseUrl}/uploads/proxy`, {
      method: "PUT",
      headers: {
        cookie: first.cookie,
        "content-type": "application/pdf",
        "x-geo-upload-token": ticket.uploadToken,
      },
      body: Buffer.from("four"),
    });
    expect(wrongSize.status).toBe(400);
  });

  it("finalizes a candidate, returns fixed knowledge sections and strict questions, then retains both tasks", async () => {
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "https://acme.example", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            { type: "output_file", file_id: "archive-1", filename: "Acme.zip" },
          ],
        },
      ],
    });

    const completed = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}`,
      cookie,
    );
    const completedPayload = completed.body as Record<string, any>;
    expect(completedPayload.project.companyName).toBe("Acme");
    expect(completedPayload.project.knowledgeBase.companyName).toBe("Acme");
    expect(
      completedPayload.project.knowledgeBase.evidencePaths,
    ).toBeUndefined();
    expect(completedPayload.project.knowledgeBase.sections).toHaveLength(7);
    expect(
      completedPayload.project.knowledgeBase.sections.map(
        (section: { title: string }) => section.title,
      ),
    ).toEqual([
      "企业与品牌",
      "团队与组织",
      "产品与服务",
      "技术与交付",
      "客户与行业",
      "服务与合作",
      "可信优势",
    ]);
    expect(completedPayload.project.knowledgeBase.sources).toEqual([]);
    expect(completedPayload.project.knowledgeBase.assets).toEqual([]);
    expect(completedPayload.project.kbTask.output).toEqual([]);
    expect(
      completedPayload.project.knowledgeBase.packageManifestSha256,
    ).toMatch(/^[a-f0-9]{64}$/);
    expect(completedPayload.project.archive.downloadUrl).toContain(
      "/api/geo/projects/",
    );

    const recommended = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}/questions`,
      cookie,
      { method: "POST", body: {} },
    );
    expect(recommended.response.status).toBe(201);
    const recommendedPayload = recommended.body as Record<string, any>;
    expect(recommendedPayload.project.questions).toHaveLength(20);
    expect(recommendedPayload.project.stage).toBe("question_recommendation");
    expect(recommendedPayload.projectToken).not.toBe(initial.projectToken);
    expect(broker.prompts[1]).toContain(
      "最终响应只能是符合 schema 的 JSON 对象",
    );
    expect(broker.prompts[1]).toContain('"companyName": "Acme"');

    const replayedOldToken = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}/questions`,
      cookie,
      { method: "POST", body: {} },
    );
    expect(replayedOldToken.response.status).toBe(201);
    expect(broker.questionTaskCount).toBe(1);

    const archiveResponse = await fetch(
      `${baseUrl}/projects/${encodeURIComponent(recommendedPayload.projectToken)}/archive`,
      { headers: { cookie } },
    );
    expect(archiveResponse.status).toBe(200);
    const finalBytes = Buffer.from(await archiveResponse.arrayBuffer());
    expect(finalBytes).not.toEqual(broker.archive);
    await expect(
      parseKnowledgeBaseArchive(finalBytes, {
        companyName: "Acme",
        validationProfile: "website-lead-v1",
      }),
    ).resolves.toMatchObject({ archiveContractVersion: 3 });

    const removed = await jsonRequest(
      `/projects/${encodeURIComponent(recommendedPayload.projectToken)}`,
      cookie,
      { method: "DELETE" },
    );
    expect(removed.body).toMatchObject({
      ok: true,
      deletedTasks: 0,
      retainedTasks: 2,
    });
    expect(broker.tasks.has("kb-1")).toBe(true);
    expect(broker.tasks.has("question-1")).toBe(true);
  });

  it("finalizes the single candidate pipeline once and serves the same final ZIP everywhere", async () => {
    const v2Broker = new MockBroker();
    v2Broker.archive = await fixtureCandidateArchive();
    const secret = "v2-test-session-secret-at-least-32-characters";
    const app = express();
    app.use(
      "/api/geo",
      createGeoRouter({
        broker: v2Broker,
        projectOrderRegistry,
        env: {
          NODE_ENV: "test",
          FRONTMIND_GEO_INVITE_CODE: "frontmind666",
          FRONTMIND_GEO_SESSION_SECRET: secret,
        },
      }),
    );
    const v2Server = app.listen(0);
    await new Promise<void>((resolve) => v2Server.once("listening", resolve));
    try {
      const origin = `http://127.0.0.1:${(v2Server.address() as AddressInfo).port}`;
      const invited = await fetch(`${origin}/api/geo/invite/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "frontmind666" }),
      });
      const cookie = invited.headers.get("set-cookie")!.split(";")[0]!;
      const created = await fetch(`${origin}/api/geo/projects`, {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ input: "Acme", attachments: [] }),
      });
      const initial = (await created.json()) as Record<string, any>;
      v2Broker.tasks.set("kb-1", {
        id: "kb-1",
        status: "completed",
        completed_at: "2026-07-30T04:00:00.000Z",
        output: [
          {
            role: "assistant",
            content: [
              {
                type: "output_file",
                file_id: "candidate-v2",
                filename: "Acme_candidate.zip",
              },
            ],
          },
        ],
      });

      const polled = await fetch(
        `${origin}/api/geo/projects/${encodeURIComponent(initial.projectToken)}`,
        { headers: { cookie } },
      );
      expect(polled.status).toBe(200);
      const completed = (await polled.json()) as Record<string, any>;
      expect(completed).toMatchObject({
        project: {
          archive: { downloadUrl: expect.stringContaining("/archive") },
        },
      });
      expect(completed.project.knowledgeBase.sections).toHaveLength(7);
      expect(completed.projectToken).not.toBe(initial.projectToken);
      expect(v2Broker.uploads.size).toBe(1);
      expect(v2Broker.nextRegularFile).toBe(2);

      const codec = new GeoTokenCodec(secret);
      const value = codec.open<any>(completed.projectToken, "project").value;
      expect(value).toMatchObject({
        knowledgeBaseArtifact: {
          finalizerVersion: "website-kb-finalizer-v3",
          candidate: {
            taskId: "kb-1",
            fileId: "candidate-v2",
            sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          },
          final: {
            archiveContractVersion: 3,
            validationProfile: "website-lead-v1",
            sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
            packageManifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          },
        },
      });
      const finalBytes = v2Broker.uploads.get(
        value.knowledgeBaseArtifact.final.fileId,
      )!;
      expect(finalBytes).toBeDefined();
      await expect(
        parseKnowledgeBaseArchive(finalBytes, {
          companyName: "Acme",
          validationProfile: "website-lead-v1",
          generatedAt: "2026-07-30T04:00:00.000Z",
        }),
      ).resolves.toMatchObject({
        archiveContractVersion: 3,
        packageManifestSha256:
          value.knowledgeBaseArtifact.final.packageManifestSha256,
      });

      const downloaded = await fetch(
        `${origin}${completed.project.archive.downloadUrl}`,
        { headers: { cookie } },
      );
      expect(downloaded.status).toBe(200);
      expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(finalBytes);
      expect(finalBytes).not.toEqual(v2Broker.archive);

      const uploadCount = v2Broker.uploads.size;
      const legacyV2Token = codec.seal(
        "project",
        {
          ...value,
          knowledgeBaseFinalization: undefined,
          knowledgeBaseArtifact: {
            ...value.knowledgeBaseArtifact,
            finalizerVersion: "website-kb-finalizer-v2",
          },
        },
        60_000,
      );
      const legacyV2 = await fetch(
        `${origin}/api/geo/projects/${encodeURIComponent(legacyV2Token)}`,
        { headers: { cookie } },
      );
      expect(legacyV2.status).toBe(200);
      const legacyV2Payload = (await legacyV2.json()) as Record<string, any>;
      expect(legacyV2Payload.project.knowledgeBaseFinalization).toMatchObject({
        finalizationState: "completed",
        finalizerVersion: "website-kb-finalizer-v2",
      });
      expect(v2Broker.uploads.size).toBe(uploadCount);
    } finally {
      await new Promise<void>((resolve, reject) =>
        v2Server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("does not issue a completed project token when uploaded final ZIP readback fails", async () => {
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            {
              type: "output_file",
              file_id: "candidate-readback-failure",
              filename: "website-lead-candidate-v1.zip",
            },
          ],
        },
      ],
    });
    broker.downloadErrors.set(
      "file-1",
      new GeoBrokerError(
        "canonical file content unavailable",
        502,
        "AGENT_REQUEST_FAILED",
      ),
    );

    const failed = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}`,
      cookie,
    );
    expect(failed.response.status).toBe(503);
    expect(failed.body).toMatchObject({
      error: { code: "FINAL_ARCHIVE_READBACK_FAILED" },
    });
    expect((failed.body as any).projectToken).toBeUndefined();
    expect(broker.deletedFiles).toContain("file-1");
    expect(broker.uploads.has("file-1")).toBe(false);

    const backedOff = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}`,
      cookie,
    );
    expect(backedOff.response.status).toBe(503);
    expect(backedOff.body).toMatchObject({
      error: { code: "KB_FINALIZATION_TRANSIENT_BACKOFF" },
    });
    expect(broker.nextRegularFile).toBe(2);
  });

  it("does not issue a completed project token when uploaded final ZIP changes bytes", async () => {
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            {
              type: "output_file",
              file_id: "candidate-readback",
              filename: "website-lead-candidate-v1.zip",
            },
          ],
        },
      ],
    });
    broker.downloadOverrides.set("file-1", Buffer.from("changed-after-upload"));

    const failed = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}`,
      cookie,
    );
    expect(failed.response.status).toBe(503);
    expect(failed.body).toMatchObject({
      error: { code: "FINAL_ARCHIVE_HASH_MISMATCH" },
    });
    expect((failed.body as any).projectToken).toBeUndefined();
    expect(broker.deletedFiles).toContain("file-1");
    expect(broker.uploads.has("file-1")).toBe(false);
  });

  it("does not run a candidate rebuild when a previously recorded final ZIP cannot be read", async () => {
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "completed",
      completed_at: "2026-07-30T04:00:00.000Z",
      output: [
        {
          role: "assistant",
          content: [
            {
              type: "output_file",
              file_id: "candidate-no-rebuild",
              filename: "website-lead-candidate-v1.zip",
            },
          ],
        },
      ],
    });

    const completed = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}`,
      cookie,
    );
    expect(completed.response.status).toBe(200);
    const completedPayload = completed.body as Record<string, any>;
    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    const completedValue = codec.open<any>(
      completedPayload.projectToken,
      "project",
    ).value;
    const finalFileId = completedValue.knowledgeBaseArtifact.final.fileId;

    const noRebuildBroker = new MockBroker();
    noRebuildBroker.archive = broker.archive;
    noRebuildBroker.tasks = new Map(broker.tasks);
    noRebuildBroker.uploads = new Map(broker.uploads);
    noRebuildBroker.nextRegularFile = broker.nextRegularFile;
    noRebuildBroker.downloadErrors.set(
      finalFileId,
      new GeoBrokerError(
        "stored file unavailable",
        502,
        "AGENT_REQUEST_FAILED",
      ),
    );
    const noRebuildApp = express();
    noRebuildApp.use(
      "/api/geo",
      createGeoRouter({
        broker: noRebuildBroker,
        projectOrderRegistry,
        env: {
          NODE_ENV: "test",
          FRONTMIND_GEO_INVITE_CODE: "frontmind666",
          FRONTMIND_GEO_SESSION_SECRET:
            "test-session-secret-at-least-16-characters",
        },
      }),
    );
    const noRebuildServer = noRebuildApp.listen(0);
    await new Promise<void>((resolve) =>
      noRebuildServer.once("listening", resolve),
    );
    try {
      const origin = `http://127.0.0.1:${
        (noRebuildServer.address() as AddressInfo).port
      }`;
      const response = await fetch(
        `${origin}/api/geo/projects/${encodeURIComponent(
          completedPayload.projectToken,
        )}`,
        { headers: { cookie } },
      );
      expect(response.status).toBe(502);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "ARCHIVE_READ_FAILED" },
      });
      expect(noRebuildBroker.uploads.size).toBe(1);
      expect(noRebuildBroker.nextRegularFile).toBe(2);
      expect(noRebuildBroker.prompts).toHaveLength(0);
    } finally {
      await new Promise<void>((resolve, reject) =>
        noRebuildServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("rejects a read-back ZIP when its package manifest hash disagrees with the finalizer result", async () => {
    const mismatchBroker = new MockBroker();
    mismatchBroker.archive = await fixtureCandidateArchive();
    const secret = "manifest-mismatch-secret-at-least-32-characters";
    const app = express();
    app.use(
      "/api/geo",
      createGeoRouter({
        broker: mismatchBroker,
        knowledgeBaseFinalizer: async (input) => {
          const finalized = await finalizeKnowledgeBaseCandidate(input);
          return {
            ...finalized,
            packageManifestSha256: "0".repeat(64),
          };
        },
        projectOrderRegistry,
        env: {
          NODE_ENV: "test",
          FRONTMIND_GEO_INVITE_CODE: "frontmind666",
          FRONTMIND_GEO_SESSION_SECRET: secret,
        },
      }),
    );
    const mismatchServer = app.listen(0);
    await new Promise<void>((resolve) =>
      mismatchServer.once("listening", resolve),
    );
    try {
      const origin = `http://127.0.0.1:${
        (mismatchServer.address() as AddressInfo).port
      }`;
      const invited = await fetch(`${origin}/api/geo/invite/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "frontmind666" }),
      });
      const cookie = invited.headers.get("set-cookie")!.split(";")[0]!;
      const created = await fetch(`${origin}/api/geo/projects`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ input: "Acme", attachments: [] }),
      });
      const initial = (await created.json()) as Record<string, any>;
      mismatchBroker.tasks.set("kb-1", {
        id: "kb-1",
        status: "completed",
        completed_at: "2026-07-30T04:00:00.000Z",
        output: [
          {
            role: "assistant",
            content: [
              {
                type: "output_file",
                file_id: "candidate-manifest-mismatch",
                filename: "website-lead-candidate-v1.zip",
              },
            ],
          },
        ],
      });

      const failed = await fetch(
        `${origin}/api/geo/projects/${encodeURIComponent(
          initial.projectToken,
        )}`,
        { headers: { cookie } },
      );
      expect(failed.status).toBe(503);
      await expect(failed.json()).resolves.toMatchObject({
        error: { code: "FINAL_ARCHIVE_MANIFEST_MISMATCH" },
      });
      expect(mismatchBroker.deletedFiles).toContain("file-1");
      expect(mismatchBroker.uploads.has("file-1")).toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) =>
        mismatchServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("keeps deterministic finalizer failures stable without exposing a retry", async () => {
    const failureBroker = new MockBroker();
    failureBroker.archive = await fixtureCandidateArchive();
    const finalizer = vi.fn(async () => {
      throw new Error("deterministic contract failure");
    });
    const secret = "finalizer-failure-secret-at-least-32-characters";
    const app = express();
    app.use(
      "/api/geo",
      createGeoRouter({
        broker: failureBroker,
        knowledgeBaseFinalizer: finalizer,
        projectOrderRegistry,
        env: {
          NODE_ENV: "test",
          FRONTMIND_GEO_INVITE_CODE: "frontmind666",
          FRONTMIND_GEO_SESSION_SECRET: secret,
        },
      }),
    );
    const failureServer = app.listen(0);
    await new Promise<void>((resolve) =>
      failureServer.once("listening", resolve),
    );
    try {
      const origin = `http://127.0.0.1:${
        (failureServer.address() as AddressInfo).port
      }`;
      const invited = await fetch(`${origin}/api/geo/invite/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: "frontmind666" }),
      });
      const cookie = invited.headers.get("set-cookie")!.split(";")[0]!;
      const created = await fetch(`${origin}/api/geo/projects`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ input: "Acme", attachments: [] }),
      });
      const initial = (await created.json()) as Record<string, any>;
      failureBroker.tasks.set("kb-1", {
        id: "kb-1",
        status: "completed",
        completed_at: "2026-07-30T04:00:00.000Z",
        output: [
          {
            role: "assistant",
            content: [
              {
                type: "output_file",
                file_id: "candidate-finalization-failure",
                filename: "website-lead-candidate-v1.zip",
              },
            ],
          },
        ],
      });

      const firstPoll = await fetch(
        `${origin}/api/geo/projects/${encodeURIComponent(
          initial.projectToken,
        )}`,
        { headers: { cookie } },
      );
      expect(firstPoll.status).toBe(200);
      const first = (await firstPoll.json()) as Record<string, any>;
      expect(first.project).toMatchObject({
        status: "failed",
        error: "企业知识库最终整理未通过校验，请联系技术支持。",
        knowledgeBaseFinalization: {
          finalizationState: "failed_internal",
          finalizerVersion: "website-kb-finalizer-v3",
          candidateSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          errorCode: "KB_FINALIZER_CONTRACT_VIOLATION",
        },
      });
      expect(finalizer).toHaveBeenCalledTimes(1);
      const promptCount = failureBroker.prompts.length;

      const stablePoll = await fetch(
        `${origin}/api/geo/projects/${encodeURIComponent(first.projectToken)}`,
        { headers: { cookie } },
      );
      expect(stablePoll.status).toBe(200);
      const stable = (await stablePoll.json()) as Record<string, any>;
      expect(finalizer).toHaveBeenCalledTimes(1);
      expect(stable.project.knowledgeBaseFinalization.candidateSha256).toBe(
        first.project.knowledgeBaseFinalization.candidateSha256,
      );

      const retryUrl = `${origin}/api/geo/projects/${encodeURIComponent(
        stable.projectToken,
      )}/knowledge-base/finalization/retry`;
      const retries = await Promise.all([
        fetch(retryUrl, { method: "POST", headers: { cookie } }),
        fetch(retryUrl, { method: "POST", headers: { cookie } }),
      ]);
      expect(retries.map((response) => response.status)).toEqual([404, 404]);
      expect(finalizer).toHaveBeenCalledTimes(1);
      expect(failureBroker.prompts).toHaveLength(promptCount);
    } finally {
      await new Promise<void>((resolve, reject) =>
        failureServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("selects the fixed candidate ZIP when the assistant returns multiple archives", async () => {
    const wrong = new JSZip();
    wrong.file("notes.md", "not a candidate");
    broker.uploads.set(
      "generic-archive",
      await wrong.generateAsync({ type: "nodebuffer" }),
    );
    broker.uploads.set("fixed-candidate", broker.archive);
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            {
              type: "output_file",
              file_id: "generic-archive",
              filename: "research-workspace.zip",
            },
            {
              type: "output_file",
              file_id: "fixed-candidate",
              filename: "website-lead-candidate-v1.zip",
            },
          ],
        },
      ],
    });

    const completed = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}`,
      cookie,
    );
    expect(completed.response.status).toBe(200);
    expect((completed.body as any).project.knowledgeBase.sections).toHaveLength(
      7,
    );
    const tokenValue = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<any>((completed.body as any).projectToken, "project").value;
    expect(tokenValue.knowledgeBaseArtifact.candidate.fileId).toBe(
      "fixed-candidate",
    );
  });

  it("fails closed when the explicitly named candidate ZIP is unsafe", async () => {
    const unsafe = new JSZip();
    unsafe.file("../outside.md", "unsafe");
    broker.uploads.set(
      "unsafe-candidate",
      await unsafe.generateAsync({ type: "nodebuffer" }),
    );
    broker.uploads.set("generic-valid", broker.archive);
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            {
              type: "output_file",
              file_id: "generic-valid",
              filename: "fallback.zip",
            },
            {
              type: "output_file",
              file_id: "unsafe-candidate",
              filename: "website-lead-candidate-v1.zip",
            },
          ],
        },
      ],
    });

    const rejected = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}`,
      cookie,
    );
    expect(rejected.response.status).toBe(200);
    expect(rejected.body).toMatchObject({
      project: {
        status: "failed",
        knowledgeBaseValidationCategory: "unsafe",
        knowledgeBaseSupportRequired: true,
      },
    });
    expect((rejected.body as any).project.knowledgeBase).toBeUndefined();
  });

  it("continues to a generic ZIP after a named candidate has only a structural mismatch", async () => {
    const structurallyInvalid = new JSZip();
    structurallyInvalid.file("02_run.json", '{"schemaVersion":1}');
    broker.uploads.set(
      "named-invalid",
      await structurallyInvalid.generateAsync({ type: "nodebuffer" }),
    );
    broker.uploads.set("generic-valid", broker.archive);
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            {
              type: "output_file",
              file_id: "named-invalid",
              filename: "knowledge-base-candidate-draft.zip",
            },
            {
              type: "output_file",
              file_id: "generic-valid",
              filename: "final-output.zip",
            },
          ],
        },
      ],
    });

    const completed = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}`,
      cookie,
    );
    expect(completed.response.status).toBe(200);
    expect((completed.body as any).project.knowledgeBase.sections).toHaveLength(
      7,
    );
    const tokenValue = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<any>((completed.body as any).projectToken, "project").value;
    expect(tokenValue.knowledgeBaseArtifact.candidate.fileId).toBe(
      "generic-valid",
    );
  });

  it("uses ZIP validation as a gate for preview, recommendation, and download", async () => {
    const unsafeArchive = new JSZip();
    unsafeArchive.file("../outside.md", "# unsafe");
    broker.archive = await unsafeArchive.generateAsync({ type: "nodebuffer" });
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            { type: "output_file", file_id: "archive-1", filename: "Acme.zip" },
          ],
        },
      ],
    });

    const projectResponse = await fetch(
      `${baseUrl}/projects/${encodeURIComponent(initial.projectToken)}`,
      { headers: { cookie } },
    );
    expect(projectResponse.status).toBe(200);
    const failedProject = (await projectResponse.json()) as Record<string, any>;
    expect(failedProject.project).toMatchObject({
      status: "failed",
      stage: "enterprise_analysis",
      kbTask: {
        status: "failed",
        error:
          "知识库文件存在安全风险，已阻止下载及后续分析。请勿继续处理该文件，并联系技术支持。",
      },
      error:
        "知识库文件存在安全风险，已阻止下载及后续分析。请勿继续处理该文件，并联系技术支持。",
      knowledgeBaseValidationCategory: "unsafe",
      knowledgeBaseSupportRequired: true,
    });
    expect(failedProject.project.archive).toBeUndefined();
    expect(JSON.stringify(failedProject)).not.toContain("../outside");

    for (const [pathname, method] of [
      [
        `/projects/${encodeURIComponent(initial.projectToken)}/questions`,
        "POST",
      ],
      [`/projects/${encodeURIComponent(initial.projectToken)}/archive`, "GET"],
    ] as const) {
      const response = await fetch(`${baseUrl}${pathname}`, {
        method,
        headers: {
          cookie,
          ...(method === "POST" ? { "content-type": "application/json" } : {}),
        },
        body: method === "POST" ? "{}" : undefined,
      });
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        error: { code: "ARCHIVE_UNSAFE_VALIDATION_FAILED" },
      });
    }
    expect(broker.questionTaskCount).toBe(0);
  });

  it("creates exactly one Base knowledge-base task and never regenerates it", async () => {
    const invalidArchive = new JSZip();
    invalidArchive.file(
      "02_run.json",
      JSON.stringify({ schemaVersion: 1, company: { name: "Acme" } }),
    );
    broker.archive = await invalidArchive.generateAsync({ type: "nodebuffer" });
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            {
              type: "output_file",
              file_id: "archive-1",
              filename: "Acme.zip",
            },
          ],
        },
      ],
    });

    const first = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}`,
      cookie,
    );
    expect(first.response.status).toBe(200);
    expect(first.body).toMatchObject({
      project: {
        status: "failed",
        knowledgeBaseValidationCategory: "structure",
        knowledgeBaseSupportRequired: true,
        kbTask: {
          status: "failed",
          error: "企业知识库生成结果未通过结构校验，请联系技术支持。",
        },
      },
    });
    expect((first.body as any).project).not.toHaveProperty(
      "knowledgeBaseRetryAvailable",
    );
    expect(broker.prompts).toHaveLength(1);
    expect(broker.taskAgentProfiles).toEqual([FRONTMIND_BASE_PROFILE]);

    const stable = await jsonRequest(
      `/projects/${encodeURIComponent((first.body as any).projectToken)}`,
      cookie,
    );
    expect(stable.response.status).toBe(200);
    expect((stable.body as any).project.kbTask.id).toBe(
      (first.body as any).project.kbTask.id,
    );

    for (const suffix of ["retry", "knowledge-base/finalization/retry"]) {
      const removedRoute = await fetch(
        `${baseUrl}/projects/${encodeURIComponent(
          (stable.body as any).projectToken,
        )}/${suffix}`,
        { method: "POST", headers: { cookie } },
      );
      expect(removedRoute.status).toBe(404);
    }
    expect(broker.prompts).toHaveLength(1);
    expect(broker.tasks.has("kb-2")).toBe(false);
  });

  it("rejects tampered project and upload tokens", async () => {
    const { cookie } = await verifyInvite();
    const response = await fetch(
      `${baseUrl}/projects/v1.invalid.invalid.invalid`,
      { headers: { cookie } },
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_TOKEN" },
    });
  });

  it("reports incomplete remote cleanup and allows an idempotent retry", async () => {
    const { cookie } = await verifyInvite();
    const initialized = await jsonRequest("/uploads/init", cookie, {
      method: "POST",
      body: {
        filename: "catalog.pdf",
        contentType: "application/pdf",
        sizeBytes: 3,
      },
    });
    const ticket = initialized.body as Record<string, string>;
    await fetch(`${baseUrl}/uploads/proxy`, {
      method: "PUT",
      headers: {
        cookie,
        "content-type": "application/pdf",
        "x-geo-upload-token": ticket.uploadToken,
      },
      body: Buffer.from("pdf"),
    });
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: {
        input: "",
        attachments: [
          {
            fileId: ticket.fileId,
            filename: ticket.filename,
            uploadToken: ticket.uploadToken,
          },
        ],
      },
    });
    const payload = created.body as Record<string, any>;
    const retainedTaskIds = [...broker.tasks.keys()];
    broker.failDeleteFile = true;
    const failed = await jsonRequest(
      `/projects/${encodeURIComponent(payload.projectToken)}`,
      cookie,
      { method: "DELETE" },
    );
    expect(failed.response.status).toBe(502);
    expect(failed.body).toMatchObject({
      error: { code: "PROJECT_DELETE_INCOMPLETE" },
    });

    broker.failDeleteFile = false;
    const retried = await jsonRequest(
      `/projects/${encodeURIComponent(payload.projectToken)}`,
      cookie,
      { method: "DELETE" },
    );
    expect(retried.response.status).toBe(200);
    expect(retried.body).toMatchObject({
      ok: true,
      deletedTasks: 0,
      retainedTasks: 1,
      deletedFiles: 2,
    });
    expect(retainedTaskIds.every((taskId) => broker.tasks.has(taskId))).toBe(
      true,
    );
  });

  it("treats resources hidden by a rotated API Key as already deleted", async () => {
    const ready = await createReadyProject();
    broker.deleteFile = async () => {
      throw new GeoBrokerError(
        "resource is not visible to the current credential",
        404,
        "FILE_NOT_FOUND",
      );
    };

    const deleted = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );

    expect(deleted.response.status).toBe(200);
    expect(deleted.body).toMatchObject({ ok: true });
  });

  it("blocks deletion for a pending monitoring order and until paid monitoring is fulfilled", async () => {
    const ready = await createReadyProject();
    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/payments`,
      ready.cookie,
      {
        method: "POST",
        body: {
          questionId: "product-scenario-01",
          platformIds: ["doubao"],
          method: "alipay",
        },
      },
    );
    expect(checkout.response.status).toBe(201);

    const pendingDelete = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );
    expect(pendingDelete.response.status).toBe(409);
    expect(pendingDelete.body).toMatchObject({
      ok: false,
      error: { code: "PROJECT_ORDER_DELETE_BLOCKED" },
    });

    const restartedApp = express();
    restartedApp.use(
      "/api/geo",
      createGeoRouter({
        broker,
        paymentGateway,
        projectOrderRegistry,
        env: {
          NODE_ENV: "test",
          FRONTMIND_GEO_INVITE_CODE: "frontmind666",
          FRONTMIND_GEO_SESSION_SECRET:
            "test-session-secret-at-least-16-characters",
        },
      }),
    );
    const restartedServer = restartedApp.listen(0);
    await new Promise<void>((resolve) =>
      restartedServer.once("listening", resolve),
    );
    try {
      const restartedPort = (restartedServer.address() as AddressInfo).port;
      const restartedDelete = await fetch(
        `http://127.0.0.1:${restartedPort}/api/geo/projects/${encodeURIComponent(ready.projectToken)}`,
        { method: "DELETE", headers: { cookie: ready.cookie } },
      );
      expect(restartedDelete.status).toBe(409);
      expect(await restartedDelete.json()).toMatchObject({
        error: { code: "PROJECT_ORDER_DELETE_BLOCKED" },
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        restartedServer.close((error) => (error ? reject(error) : resolve())),
      );
    }

    const monitored = await startOnePlatformMonitor(ready);
    const unfulfilledDelete = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );
    expect(unfulfilledDelete.response.status).toBe(409);
    expect(unfulfilledDelete.body).toMatchObject({
      error: { code: "PROJECT_ORDER_DELETE_BLOCKED" },
    });

    const run = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...run,
      status: "partial_review_required",
      failedItems: 1,
      error: "一项监控结果需要人工对账",
    });
    const reconciliationDelete = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );
    expect(reconciliationDelete.response.status).toBe(409);
    expect(reconciliationDelete.body).toMatchObject({
      error: { code: "PROJECT_ORDER_DELETE_BLOCKED" },
    });

    broker.monitorRuns.set("monitor-1", {
      ...run,
      status: "completed",
      completedItems: 5,
      records: Array.from({ length: 5 }, (_, index) =>
        monitorRecord(index + 1, `Acme 回答 ${index + 1}`),
      ),
    });
    const fulfilledDelete = await jsonRequest(
      `/projects/${encodeURIComponent(monitored.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );
    expect(fulfilledDelete.response.status).toBe(200);
    expect(fulfilledDelete.body).toMatchObject({
      ok: true,
      deletedMonitorRuns: 1,
    });
    expect(broker.monitorRuns.has("monitor-1")).toBe(false);
  });

  it("allows deletion after a paid monitoring run has explicitly terminated", async () => {
    const ready = await createReadyProject();
    await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/payments`,
      ready.cookie,
      {
        method: "POST",
        body: {
          questionId: "product-scenario-01",
          platformIds: ["doubao"],
          method: "alipay",
        },
      },
    );
    const monitored = await startOnePlatformMonitor(ready);
    const run = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...run,
      status: "remote_failed",
      failedItems: 5,
      error: "上游已明确终止任务",
    });

    const removed = await jsonRequest(
      `/projects/${encodeURIComponent(monitored.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );
    expect(removed.response.status).toBe(200);
    expect(removed.body).toMatchObject({
      ok: true,
      deletedMonitorRuns: 1,
    });
  });

  it("allows deletion when a completed order's old monitor history is no longer visible", async () => {
    const ready = await createReadyProject();
    const monitored = await startOnePlatformMonitor(ready);
    const projectId = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ projectId: string }>(monitored.projectToken, "project").value
      .projectId;
    const fulfilledAt = new Date().toISOString();
    for (const [orderId, order] of Array.from(projectOrders.entries())) {
      if (
        order.projectId === projectId &&
        order.purchaseType === "monitoring"
      ) {
        projectOrders.set(orderId, {
          ...order,
          state: "fulfilled",
          fulfilledAt,
          eventAt: fulfilledAt,
        });
      }
    }
    broker.getMonitorRun = async () => {
      throw new GeoBrokerError(
        "run belongs to a retired credential",
        404,
        "MONITOR_RUN_NOT_FOUND",
      );
    };
    broker.deleteMonitorRun = async () => {
      throw new GeoBrokerError(
        "run belongs to a retired credential",
        404,
        "MONITOR_RUN_NOT_FOUND",
      );
    };

    const deleted = await jsonRequest(
      `/projects/${encodeURIComponent(monitored.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );
    expect(deleted.response.status).toBe(200);
    expect(deleted.body).toMatchObject({
      ok: true,
      deletedMonitorRuns: 1,
    });
  });

  it("fails closed before remote deletion when the durable order registry cannot be read", async () => {
    const ready = await createReadyProject();
    projectOrderRegistry.findByProject = async () => {
      throw new Error("database unavailable");
    };

    const removed = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );
    expect(removed.response.status).toBe(503);
    expect(removed.body).toMatchObject({
      ok: false,
      error: { code: "PROJECT_ORDER_REGISTRY_UNAVAILABLE" },
    });
    expect(broker.tasks.has("kb-1")).toBe(true);
    expect(broker.tasks.has("question-1")).toBe(true);
  });

  it("closes a durable checkout intent after an explicit gateway failure and does not leave a phantom delete block", async () => {
    const ready = await createReadyProject();
    paymentGateway.createCheckout = async () => {
      throw new Error("gateway rejected checkout");
    };

    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/payments`,
      ready.cookie,
      {
        method: "POST",
        body: {
          questionId: "product-scenario-01",
          platformIds: ["doubao"],
          method: "alipay",
        },
      },
    );
    expect(checkout.response.status).toBe(500);
    expect(Array.from(projectOrders.values())).toEqual([
      expect.objectContaining({ state: "closed" }),
    ]);

    const removed = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );
    expect(removed.response.status).toBe(200);
  });

  it("never calls the payment gateway when the durable checkout intent cannot be written", async () => {
    const ready = await createReadyProject();
    const originalUpsert = projectOrderRegistry.upsert;
    projectOrderRegistry.upsert = async () => {
      throw new Error("intent database unavailable");
    };
    const originalCreateCheckout = paymentGateway.createCheckout;
    paymentGateway.createCheckout = vi.fn(originalCreateCheckout);

    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/payments`,
      ready.cookie,
      {
        method: "POST",
        body: {
          questionId: "product-scenario-01",
          platformIds: ["doubao"],
          method: "alipay",
        },
      },
    );
    expect(checkout.response.status).toBe(503);
    expect(paymentGateway.createCheckout).not.toHaveBeenCalled();
    expect(projectOrders.size).toBe(0);

    projectOrderRegistry.upsert = originalUpsert;
    const removed = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );
    expect(removed.response.status).toBe(200);
  });

  it("keeps the durable intent blocking deletion when checkout commit is unavailable", async () => {
    const ready = await createReadyProject();
    projectOrderRegistry.commitIntent = async () => {
      throw new Error("commit result unavailable");
    };

    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/payments`,
      ready.cookie,
      {
        method: "POST",
        body: {
          questionId: "product-scenario-01",
          platformIds: ["doubao"],
          method: "alipay",
        },
      },
    );
    expect(checkout.response.status).toBe(503);
    expect(Array.from(projectOrders.values())).toEqual([
      expect.objectContaining({ state: "pending" }),
    ]);

    const removed = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );
    expect(removed.response.status).toBe(409);
    expect(removed.body).toMatchObject({
      error: { code: "PROJECT_ORDER_DELETE_BLOCKED" },
    });
  });

  it("deduplicates a replayed initial project request within the same session", async () => {
    const { cookie } = await verifyInvite();
    const body = {
      input: "https://acme.example",
      clientRequestId: "1f3f39ef-46ea-4ea6-a7d8-68f9ea9e60a8",
      attachments: [],
    };

    const first = await jsonRequest("/projects", cookie, {
      method: "POST",
      body,
    });
    const replay = await jsonRequest("/projects", cookie, {
      method: "POST",
      body,
    });

    expect(first.response.status).toBe(201);
    expect(replay.response.status).toBe(201);
    expect((replay.body as any).project.id).toBe(
      (first.body as any).project.id,
    );
    expect(broker.prompts).toHaveLength(1);
  });

  it("uses a trusted completed knowledge-base snapshot when the result endpoint is temporarily unavailable", async () => {
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            {
              type: "output_file",
              file_id: "archive-1",
              filename: "Acme.zip",
            },
          ],
        },
      ],
    });
    broker.taskResultErrors.set(
      "kb-1",
      new GeoBrokerError(
        "result service unavailable",
        503,
        "AGENT_UNAVAILABLE",
      ),
    );

    const restored = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}`,
      cookie,
    );

    expect(restored.response.status).toBe(200);
    expect(restored.body).toMatchObject({
      project: {
        kbTask: { status: "completed" },
        knowledgeBase: { companyName: "Acme" },
      },
    });
    expect(broker.prompts).toHaveLength(1);
  });

  it("keeps long source input out of the opaque project token", async () => {
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: `Acme ${"research ".repeat(300)}`, attachments: [] },
    });
    const payload = created.body as Record<string, any>;

    expect(created.response.status).toBe(201);
    expect(payload.projectToken.length).toBeLessThan(1200);
  });

  it("limits task creation for a shared invitation session", async () => {
    const { cookie } = await verifyInvite();
    for (let index = 0; index < 5; index += 1) {
      const created = await jsonRequest("/projects", cookie, {
        method: "POST",
        body: { input: `Acme ${index}`, attachments: [] },
      });
      expect(created.response.status).toBe(201);
    }
    const limited = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme overflow", attachments: [] },
    });
    expect(limited.response.status).toBe(429);
    expect(limited.body).toMatchObject({
      error: { code: "SESSION_RATE_LIMITED" },
    });
  });

  it("shares project creation quota across new sessions from the same IP", async () => {
    const first = await verifyInvite();
    for (let index = 0; index < 5; index += 1) {
      const created = await jsonRequest("/projects", first.cookie, {
        method: "POST",
        body: { input: `Acme ${index}`, attachments: [] },
      });
      expect(created.response.status).toBe(201);
    }

    const freshSession = await verifyInvite();
    const limited = await jsonRequest("/projects", freshSession.cookie, {
      method: "POST",
      body: { input: "Acme from a fresh session", attachments: [] },
    });
    expect(limited.response.status).toBe(429);
    expect(limited.body).toMatchObject({
      error: { code: "IDENTITY_RATE_LIMITED" },
    });
  });

  it("never submits monitoring before a verified, scope-matched payment", async () => {
    const ready = await createReadyProject();
    paymentAccepted = false;

    const denied = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      {
        method: "POST",
        body: {
          questionId: "product-scenario-01",
          platformIds: ["doubao", "deepseek"],
          paymentAuthorization: "zpay-signed-authorization-placeholder",
        },
      },
    );
    expect(denied.response.status).toBe(402);
    expect(broker.monitorCreates).toBe(0);
    expect(paymentCalls[0]).toMatchObject({
      questionId: "product-scenario-01",
      expectedAmountFen: 400,
      platformIds: ["doubao", "deepseek"],
    });

    const malformed = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      {
        method: "POST",
        body: {
          questionId: "product-scenario-01",
          platformIds: ["doubao", "doubao"],
          paymentAuthorization: "zpay-signed-authorization-placeholder",
        },
      },
    );
    expect(malformed.response.status).toBe(400);
    expect(broker.monitorCreates).toBe(0);
  });

  it("creates a server-priced ZPAY checkout and exposes authenticated status only", async () => {
    const ready = await createReadyProject();
    const scope = {
      questionId: "product-scenario-01",
      platformIds: ["doubao", "deepseek"],
    };
    const created = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/payments`,
      ready.cookie,
      {
        method: "POST",
        body: { ...scope, method: "wxpay" },
      },
    );

    expect(created.response.status).toBe(201);
    expect(created.body).toMatchObject({
      payment: {
        amountFen: 400,
        unitPriceFen: 200,
        answersPerPlatform: 5,
        action: "https://zpayz.cn/submit.php",
        method: "POST",
        fields: { type: "wxpay", money: "4.00" },
      },
    });
    expect(paymentCheckoutCalls).toHaveLength(1);
    expect(paymentCheckoutCalls[0]).toMatchObject({
      projectId: expect.any(String),
      questionId: scope.questionId,
      platformIds: scope.platformIds,
      expectedAmountFen: 400,
      method: "wxpay",
    });
    expect(paymentCheckoutCalls[0].ownerSessionId).toBeTruthy();

    const replayed = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/payments`,
      ready.cookie,
      {
        method: "POST",
        body: { ...scope, method: "wxpay" },
      },
    );
    expect(replayed.response.status).toBe(200);
    expect((replayed.body as any).payment.orderId).toBe(
      (created.body as any).payment.orderId,
    );
    const switchedMethod = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/payments`,
      ready.cookie,
      {
        method: "POST",
        body: { ...scope, method: "alipay" },
      },
    );
    expect(switchedMethod.response.status).toBe(409);
    expect(switchedMethod.body).toMatchObject({
      error: { code: "PAYMENT_METHOD_LOCKED" },
    });
    expect(paymentCheckoutCalls).toHaveLength(1);

    paymentAccepted = false;
    const status = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/payments/status`,
      ready.cookie,
      {
        method: "POST",
        body: {
          ...scope,
          authorization: "zpay-signed-authorization-placeholder",
        },
      },
    );
    expect(status.response.status).toBe(200);
    expect(status.body).toMatchObject({
      payment: { status: "pending", amountFen: 400 },
    });
    expect(paymentStatusCalls[0]).toMatchObject({
      projectId: paymentCheckoutCalls[0].projectId,
      questionId: scope.questionId,
      platformIds: scope.platformIds,
      expectedAmountFen: 400,
    });
    expect(paymentStatusCalls[0].ownerSessionId).toBeTruthy();
    expect(broker.monitorCreates).toBe(0);
  });

  it("blocks checkout before charging when the dedicated monitor API is not ready", async () => {
    const ready = await createReadyProject();
    broker.monitorCredentialConfigured = false;

    const response = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/payments`,
      ready.cookie,
      {
        method: "POST",
        body: {
          questionId: "product-scenario-01",
          platformIds: ["doubao"],
          method: "wxpay",
        },
      },
    );

    expect(response.response.status).toBe(503);
    expect(response.body).toMatchObject({
      error: { code: "MONITOR_PROVIDER_NOT_READY" },
    });
    expect(paymentCheckoutCalls).toHaveLength(0);
  });

  it("persists an existing recommended question as a no-active terminal receipt that old clients may ACK", async () => {
    const ready = await createReadyProject();
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const direct = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 的服务模块 1 主要解决哪些业务问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });

    expect(direct.response.status).toBe(200);
    expect(direct.body).toMatchObject({
      question: {
        id: "product-scenario-01",
        question: "Acme 的服务模块 1 主要解决哪些业务问题？",
      },
      validation: {
        schemaVersion: 1,
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        state: "completed",
        acknowledgement: "not_required",
        completionMode: "existing_recommended_question",
      },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(0);

    const statusPath = `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`;
    const recovered = await jsonRequest(statusPath, ready.cookie);
    expect(recovered.response.status).toBe(200);
    expect(recovered.body).toMatchObject({
      question: direct.body.question,
      validation: {
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        state: "completed",
        acknowledgement: "not_required",
        completionMode: "existing_recommended_question",
      },
    });

    // A response-lost POST replays the same receipt without creating a task.
    const replayed = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 的服务模块 1 主要解决哪些业务问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(replayed.response.status).toBe(200);
    expect(replayed.body).toMatchObject({
      question: direct.body.question,
      validation: {
        acknowledgement: "not_required",
        completionMode: "existing_recommended_question",
      },
    });

    // A cached pre-marker bundle still sends ACK. Both the first ACK and a
    // lost-response retry are idempotent successes.
    const acknowledgementPath = `${statusPath}/ack`;
    const acknowledged = await jsonRequest(acknowledgementPath, ready.cookie, {
      method: "POST",
      body: {},
    });
    expect(acknowledged.response.status).toBe(200);
    const replayedAcknowledgement = await jsonRequest(
      acknowledgementPath,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(replayedAcknowledgement.response.status).toBe(200);
    expect(replayedAcknowledgement.body).toEqual(acknowledged.body);
    expect(broker.customQuestionClassifierTaskCount).toBe(0);

    const active = await jsonRequest(`${pathname}/active`, ready.cookie);
    expect(active.response.status).toBe(404);
    expect(active.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_VALIDATION_NOT_FOUND" },
    });
  });

  it("does not let a direct-completion receipt overwrite a different active validation", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierPendingPolls = 99;
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const active = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(active.response.status).toBe(202);

    const receiptRequestId = "abababab-abab-4bab-8bab-abababababab";
    const conflictingReceipt = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 的服务模块 1 主要解决哪些业务问题？",
        clientRequestId: receiptRequestId,
      },
    });
    expect(conflictingReceipt.response.status).toBe(409);
    expect(conflictingReceipt.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_ACTIVE_RESERVATION_CONFLICT" },
      activeOperation: {
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });

    const stillActive = await jsonRequest(`${pathname}/active`, ready.cookie);
    expect(stillActive.response.status).toBe(202);
    expect(stillActive.body).toMatchObject({
      validation: { clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID },
    });
    const missingReceipt = await jsonRequest(
      `${pathname}/${receiptRequestId}`,
      ready.cookie,
    );
    expect(missingReceipt.response.status).toBe(404);
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it("binds a validated custom question to the project, payment, monitor, and assessment", async () => {
    const ready = await createReadyProject();
    const custom = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/questions/custom`,
      ready.cookie,
      {
        method: "POST",
        body: {
          question: "  Acme 在高校科研场景中能解决什么问题? ",
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        },
      },
    );
    expect(custom.response.status).toBe(201);
    const customPayload = custom.body as Record<string, any>;
    expect(customPayload.question).toMatchObject({
      id: expect.stringMatching(/^custom-[a-f0-9]{20}$/),
      category: "product_scenario",
      question: "Acme 在高校科研场景中能解决什么问题？",
      selectable: true,
      evidenceRefs: ["01_company_overview/overview.md"],
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
    expect(
      broker.taskAttachments
        .at(-1)
        ?.some(
          (attachment) =>
            attachment.filename === "geo-custom-question-classifier.skill.zip",
        ),
    ).toBe(true);
    expect(customPayload.project.questions).toHaveLength(21);
    expect(customPayload.projectToken).not.toBe(ready.projectToken);

    const questionId = customPayload.question.id as string;
    const staleTokenCheckout = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/payments`,
      ready.cookie,
      {
        method: "POST",
        body: { questionId, platformIds: ["doubao"], method: "alipay" },
      },
    );
    expect(staleTokenCheckout.response.status).toBe(400);
    expect(staleTokenCheckout.body).toMatchObject({
      error: { code: "QUESTION_NOT_OWNED" },
    });

    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(customPayload.projectToken)}/payments`,
      ready.cookie,
      {
        method: "POST",
        body: { questionId, platformIds: ["doubao"], method: "alipay" },
      },
    );
    expect(checkout.response.status).toBe(201);
    expect(paymentCheckoutCalls.at(-1)).toMatchObject({
      questionId,
      expectedAmountFen: 200,
      platformIds: ["doubao"],
    });

    const started = await jsonRequest(
      `/projects/${encodeURIComponent(customPayload.projectToken)}/monitoring`,
      ready.cookie,
      {
        method: "POST",
        body: {
          questionId,
          platformIds: ["doubao"],
          paymentAuthorization: "zpay-signed-authorization-placeholder",
        },
      },
    );
    expect(started.response.status).toBe(201);
    expect(paymentCalls.at(-1)).toMatchObject({
      questionId,
      expectedAmountFen: 200,
    });
    expect(broker.monitorRuns.get("monitor-1")?.question).toBe(
      "Acme 在高校科研场景中能解决什么问题？",
    );

    const run = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...run,
      status: "completed",
      completedItems: 5,
      records: Array.from({ length: 5 }, (_, index) =>
        monitorRecord(index + 1, `自定义问题回答 ${index + 1}`),
      ),
    });
    broker.completeAssessmentImmediately = true;
    const startedPayload = started.body as Record<string, any>;
    const assessed = await jsonRequest(
      `/projects/${encodeURIComponent(startedPayload.projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(assessed.response.status).toBe(201);
    expect(broker.prompts.at(-1)).toContain(
      "Acme 在高校科研场景中能解决什么问题？",
    );
  });

  it("returns an async reservation and resumes the same upstream validation task", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierPendingPolls = 2;

    const custom = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/questions/custom`,
      ready.cookie,
      {
        method: "POST",
        body: {
          question: "Acme 在高校科研场景中能解决什么问题？",
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        },
      },
    );

    expect(custom.response.status).toBe(202);
    expect(custom.body).toMatchObject({
      validation: {
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        state: "submitted",
        acknowledgement: "required",
        completionMode: "reservation",
      },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);

    const statusPath = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`;
    const stillRunning = await jsonRequest(statusPath, ready.cookie);
    expect(stillRunning.response.status).toBe(202);
    expect(stillRunning.body).toMatchObject({
      validation: { state: "submitted" },
    });

    const completed = await jsonRequest(statusPath, ready.cookie);
    expect(completed.response.status).toBe(200);
    expect(completed.body).toMatchObject({
      question: {
        question: "Acme 在高校科研场景中能解决什么问题？",
      },
      validation: { state: "completed" },
    });
    expect(broker.customQuestionClassifierPolls).toBe(2);
    expect(broker.customQuestionClassifierTaskCount).toBe(1);

    const replayed = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/questions/custom`,
      ready.cookie,
      {
        method: "POST",
        body: {
          question: "Acme 在高校科研场景中能解决什么问题？",
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        },
      },
    );
    expect(replayed.response.status).toBe(201);
    expect(replayed.body).toMatchObject({
      question: completed.body.question,
      validation: { state: "completed" },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it("returns an async enterprise rejection without reloading unrelated task results on every status poll", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierPendingPolls = 2;
    broker.customQuestionClassifierOutput = {
      decision: "reject",
      category: "unrelated",
      enterpriseRelated: false,
      reasonCode: "enterprise_unrelated",
      reason: "知识库未提供将 FrontMind 与 Acme 关联的事实证据。",
      enterpriseAnchor: null,
      offeringAnchor: null,
      evidenceRefs: [],
    };
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const started = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "FrontMind是什么企业？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(started.response.status).toBe(202);

    // A status observation must depend on the frozen reservation and its
    // classifier task, not re-fetch the already completed KB/question tasks.
    // This reproduces the production 502 that interrupted the browser before
    // the background worker persisted the authoritative rejection.
    broker.taskResultErrors.set(
      "kb-1",
      new GeoBrokerError("Too Many Requests", 429, "AGENT_RATE_LIMITED"),
    );
    broker.taskResultErrors.set(
      "question-1",
      new GeoBrokerError("Too Many Requests", 429, "AGENT_RATE_LIMITED"),
    );

    const statusPath = `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`;
    const stillRunning = await jsonRequest(statusPath, ready.cookie);
    expect(stillRunning.response.status).toBe(202);
    expect(stillRunning.body).toMatchObject({
      validation: { state: "submitted" },
    });

    const rejected = await jsonRequest(statusPath, ready.cookie);
    expect(rejected.response.status).toBe(422);
    expect(rejected.body).toMatchObject({
      error: {
        code: "CUSTOM_QUESTION_ENTERPRISE_UNRELATED",
        message:
          "该问题与「Acme」没有明确关系，请重新输入与当前企业相关的非行业排名类问题。",
      },
      validation: {
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        state: "rejected",
        error: { retryable: false },
      },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it("keeps a terminal validation discoverable until owner ACK and makes a lost-response ACK retry idempotent", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierPendingPolls = 1;
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const started = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(started.response.status).toBe(202);

    const prematureAck = await jsonRequest(
      `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}/ack`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(prematureAck.response.status).toBe(409);
    expect(prematureAck.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_VALIDATION_NOT_TERMINAL" },
    });

    const completed = await jsonRequest(
      `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`,
      ready.cookie,
    );
    expect(completed.response.status).toBe(200);
    const activeTerminal = await jsonRequest(
      `${pathname}/active`,
      ready.cookie,
    );
    expect(activeTerminal.response.status).toBe(200);
    expect(activeTerminal.body).toMatchObject({
      validation: {
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        state: "completed",
      },
    });

    const otherBrowser = await verifyInvite();
    const forbidden = await jsonRequest(
      `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}/ack`,
      otherBrowser.cookie,
      { method: "POST", body: {} },
    );
    expect(forbidden.response.status).toBe(403);
    expect(forbidden.body).toMatchObject({
      error: { code: "PROJECT_SESSION_MISMATCH" },
    });

    const acknowledgePath = `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}/ack`;
    const acknowledged = await jsonRequest(acknowledgePath, ready.cookie, {
      method: "POST",
      body: {},
    });
    expect(acknowledged.response.status).toBe(200);
    expect(acknowledged.body).toEqual({
      ok: true,
      validation: {
        schemaVersion: 1,
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        state: "completed",
        acknowledged: true,
      },
    });
    const afterAck = await jsonRequest(`${pathname}/active`, ready.cookie);
    expect(afterAck.response.status).toBe(404);

    // Simulates the first 200 response being lost after the server committed
    // the ACK. The exact request remains an idempotent success.
    const replayedAck = await jsonRequest(acknowledgePath, ready.cookie, {
      method: "POST",
      body: {},
    });
    expect(replayedAck.response.status).toBe(200);
    expect(replayedAck.body).toEqual(acknowledged.body);
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it("keeps an unacknowledged completed result past 24 hours, then serves permanent 410 after ACK and GC", async () => {
    await restartWithCustomQuestionValidationStore(
      new MemoryGeoCustomQuestionValidationStore({
        now: () => customQuestionValidationNowMs,
      }),
    );
    const ready = await createReadyProject();
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const question = "Acme 在高校科研场景中能解决什么问题？";
    const completed = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question,
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(completed.response.status).toBe(201);

    customQuestionValidationNowMs += 24 * 60 * 60 * 1000 + 1;
    const worker = createGeoCustomQuestionRecoveryWorker({
      broker,
      store: customQuestionValidationStore,
      now: () => customQuestionValidationNowMs,
    });
    await worker.runOnce();

    const statusPath = `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`;
    const stillRecoverable = await jsonRequest(statusPath, ready.cookie);
    expect(stillRecoverable.response.status).toBe(200);
    expect(stillRecoverable.body).toMatchObject({
      validation: {
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        state: "completed",
      },
      question: { question },
    });

    const acknowledged = await jsonRequest(`${statusPath}/ack`, ready.cookie, {
      method: "POST",
      body: {},
    });
    expect(acknowledged.response.status).toBe(200);
    await worker.runOnce();

    const expiredGet = await jsonRequest(statusPath, ready.cookie);
    expect(expiredGet.response.status).toBe(410);
    expect(expiredGet.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_VALIDATION_EXPIRED" },
    });
    const expiredPost = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question,
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(expiredPost.response.status).toBe(410);
    expect(expiredPost.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_VALIDATION_EXPIRED" },
    });
    expect(broker.tasks.has("custom-question-classifier-1")).toBe(true);
  });

  it("coalesces double-clicks and rejects cross-session recovery", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierPendingPolls = 1;
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const request = {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    } as const;

    const [first, second] = await Promise.all([
      jsonRequest(pathname, ready.cookie, request),
      jsonRequest(pathname, ready.cookie, request),
    ]);
    expect([201, 202]).toContain(first.response.status);
    expect([201, 202]).toContain(second.response.status);
    expect(broker.customQuestionClassifierTaskCount).toBe(1);

    const statusPath = `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`;
    const completed = await jsonRequest(statusPath, ready.cookie);
    expect(completed.response.status).toBe(200);
    expect(completed.body).toMatchObject({
      validation: {
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        state: "completed",
      },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);

    const otherBrowser = await verifyInvite();
    const forbidden = await jsonRequest(statusPath, otherBrowser.cookie);
    expect(forbidden.response.status).toBe(403);
    expect(forbidden.body).toMatchObject({
      error: { code: "PROJECT_SESSION_MISMATCH" },
    });

    const conflict = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 靠谱吗？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(conflict.response.status).toBe(409);
    expect(conflict.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_IDEMPOTENCY_CONFLICT" },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it("returns the authority and permanently retires a different-UUID conflict loser", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierPendingPolls = 99;
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const first = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(first.response.status).toBe(202);

    const competingRequestId = "99999999-9999-4999-8999-999999999999";
    const competing = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 如何为企业部署私有化系统？",
        clientRequestId: competingRequestId,
      },
    });
    expect(competing.response.status).toBe(409);
    expect(competing.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_ACTIVE_RESERVATION_CONFLICT" },
      activeOperation: {
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        question: "Acme 在高校科研场景中能解决什么问题？",
      },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);

    const retiredLoser = await jsonRequest(
      `${pathname}/${competingRequestId}`,
      ready.cookie,
    );
    expect(retiredLoser.response.status).toBe(409);
    expect(retiredLoser.body).toMatchObject({
      validation: {
        clientRequestId: competingRequestId,
        state: "failed",
        error: {
          code: "CUSTOM_QUESTION_RESERVATION_SUPERSEDED",
          retryable: false,
        },
      },
      error: { code: "CUSTOM_QUESTION_RESERVATION_SUPERSEDED" },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);

    const active = await jsonRequest(`${pathname}/active`, ready.cookie);
    expect(active.response.status).toBe(202);
    expect(active.body).toMatchObject({
      validation: {
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        question: "Acme 在高校科研场景中能解决什么问题？",
      },
    });

    broker.tasks.set("custom-question-classifier-1", {
      id: "custom-question-classifier-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            { text: JSON.stringify(broker.customQuestionClassifierOutput) },
          ],
        },
      ],
    });
    const completed = await jsonRequest(
      `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`,
      ready.cookie,
    );
    expect(completed.response.status).toBe(200);

    const acknowledged = await jsonRequest(
      `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}/ack`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(acknowledged.response.status).toBe(200);

    const worker = createGeoCustomQuestionRecoveryWorker({
      broker,
      store: customQuestionValidationStore,
      now: () => customQuestionValidationNowMs,
    });
    await worker.runOnce();
    expect(broker.customQuestionClassifierTaskCount).toBe(1);

    broker.customQuestionClassifierPendingPolls = 1;
    const replayedLoser = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 如何为企业部署私有化系统？",
        clientRequestId: competingRequestId,
      },
    });
    expect(replayedLoser.response.status).toBe(409);
    expect(replayedLoser.body).toMatchObject({
      validation: {
        state: "failed",
        error: { code: "CUSTOM_QUESTION_RESERVATION_SUPERSEDED" },
      },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);

    const nextRequestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const nextOperation = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 如何为企业部署私有化系统？",
        clientRequestId: nextRequestId,
      },
    });
    expect(nextOperation.response.status).toBe(202);
    expect(broker.customQuestionClassifierTaskCount).toBe(2);
  });

  it("allows confirmed deletion to terminate an active custom-question validation", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierPendingPolls = 99;
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const started = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(started.response.status).toBe(202);
    expect(broker.customQuestionClassifierTaskCount).toBe(1);

    const deleted = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );
    expect(deleted.response.status).toBe(200);
    expect(deleted.body).toMatchObject({ ok: true });

    const projectId = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ projectId: string }>(ready.projectToken, "project").value
      .projectId;
    await expect(
      customQuestionValidationStore.getActive(projectId),
    ).resolves.toBeUndefined();
    await expect(customQuestionValidationStore.listActive()).resolves.toEqual(
      [],
    );

    const preciseStatus = await jsonRequest(
      `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`,
      ready.cookie,
    );
    expect(preciseStatus.response.status).toBe(409);
    expect(preciseStatus.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_PROJECT_DELETION_FENCED" },
    });

    const worker = createGeoCustomQuestionRecoveryWorker({
      broker,
      store: customQuestionValidationStore,
      now: () => customQuestionValidationNowMs,
    });
    await worker.runOnce();
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it("force-fences a record-only validation crash and still deletes the project", async () => {
    const ready = await createReadyProject();
    let crashOnce = true;
    const crashedStore = new MemoryGeoCustomQuestionValidationStore({
      afterInitialRecordCommit: () => {
        if (!crashOnce) return;
        crashOnce = false;
        throw new Error("simulated process exit before active slot commit");
      },
    });
    await restartWithCustomQuestionValidationStore(crashedStore);

    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const interrupted = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(interrupted.response.status).toBe(500);

    const deleted = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );
    expect(deleted.response.status).toBe(200);
    expect(deleted.body).toMatchObject({ ok: true });
    const project = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ knowledgeBaseTaskId: string; projectId: string }>(
      ready.projectToken,
      "project",
    ).value;
    expect(broker.tasks.has(project.knowledgeBaseTaskId)).toBe(true);
    await expect(crashedStore.listActive()).resolves.toEqual([]);
    await expect(
      crashedStore.get(project.projectId, CUSTOM_QUESTION_CLIENT_REQUEST_ID),
    ).resolves.toMatchObject({
      state: "failed",
      error: { code: "PROJECT_DELETED", retryable: false },
    });
  });

  it("bridges a cached client without clientRequestId to one deterministic upstream task", async () => {
    const ready = await createReadyProject();
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const request = {
      method: "POST",
      body: { question: "Acme 在高校科研场景中能解决什么问题？" },
    } as const;
    const first = await jsonRequest(pathname, ready.cookie, request);
    const replay = await jsonRequest(pathname, ready.cookie, request);

    expect(first.response.status).toBe(201);
    expect(replay.response.status).toBe(201);
    expect(first.body).toMatchObject({
      validation: {
        clientRequestId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
      },
    });
    expect(replay.body).toMatchObject({
      validation: {
        clientRequestId: (first.body as any).validation.clientRequestId,
      },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it("lets the precise GET reclaim a reservation whose process crashed before writing the active slot", async () => {
    let crashOnce = true;
    await restartWithCustomQuestionValidationStore(
      new MemoryGeoCustomQuestionValidationStore({
        afterInitialRecordCommit: () => {
          if (!crashOnce) return;
          crashOnce = false;
          throw new Error("simulated process exit before active-slot commit");
        },
      }),
    );
    const ready = await createReadyProject();
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const interrupted = await jsonRequest(pathname, ready.cookie, {
        method: "POST",
        body: {
          question: "Acme 在高校科研场景中能解决什么问题？",
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        },
      });
      expect(interrupted.response.status).toBe(500);

      const projectId = new GeoTokenCodec(
        "test-session-secret-at-least-16-characters",
      ).open<{ projectId: string }>(ready.projectToken, "project").value
        .projectId;
      await expect(
        customQuestionValidationStore.getActive(projectId),
      ).resolves.toBeUndefined();

      const recovered = await jsonRequest(
        `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`,
        ready.cookie,
      );
      expect(recovered.response.status).toBe(200);
      expect(recovered.body).toMatchObject({
        validation: {
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
          state: "completed",
        },
      });
      expect(broker.customQuestionClassifierTaskCount).toBe(1);
    } finally {
      log.mockRestore();
    }
  });

  it("lets the recovery worker discover and finish an orphan reservation without a browser poll", async () => {
    let crashOnce = true;
    await restartWithCustomQuestionValidationStore(
      new MemoryGeoCustomQuestionValidationStore({
        afterInitialRecordCommit: () => {
          if (!crashOnce) return;
          crashOnce = false;
          throw new Error("simulated worker recovery crash window");
        },
      }),
    );
    const ready = await createReadyProject();
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const interrupted = await jsonRequest(pathname, ready.cookie, {
        method: "POST",
        body: {
          question: "Acme 在高校科研场景中能解决什么问题？",
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        },
      });
      expect(interrupted.response.status).toBe(500);

      const worker = createGeoCustomQuestionRecoveryWorker({
        broker,
        store: customQuestionValidationStore,
        now: () => customQuestionValidationNowMs,
      });
      await worker.runOnce();

      const projectId = new GeoTokenCodec(
        "test-session-secret-at-least-16-characters",
      ).open<{ projectId: string }>(ready.projectToken, "project").value
        .projectId;
      await expect(
        customQuestionValidationStore.get(
          projectId,
          CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        ),
      ).resolves.toMatchObject({
        state: "completed",
        cleanupCompleted: true,
      });
      expect(broker.customQuestionClassifierTaskCount).toBe(1);
    } finally {
      log.mockRestore();
    }
  });

  it("recovers every reservation beyond the concurrency limit across competing workers without duplicate tasks", async () => {
    const store = new MemoryGeoCustomQuestionValidationStore();
    const question = "Acme 在高校科研场景中能解决什么问题？";
    const operationCount = 25;
    const operations: Array<{ projectId: string; clientRequestId: string }> =
      [];

    for (let index = 0; index < operationCount; index += 1) {
      const projectId = `fair-recovery-project-${String(index).padStart(2, "0")}`;
      const clientRequestId = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      const reservation = await store.reserve({
        projectId,
        ownerSessionHash: "a".repeat(64),
        clientRequestId,
        requestHash: geoCustomQuestionRequestHash({
          projectId,
          knowledgeBaseTaskId: `knowledge-task-${index}`,
          question,
        }),
        question,
        questionHash: geoCustomQuestionHash(question),
        companyName: "Acme",
        knowledgeBaseTaskId: `knowledge-task-${index}`,
        knowledgeBaseValidationProfile: "website-lead-v1",
        knowledgeBaseArtifact: {
          fileId: `knowledge-file-${index}`,
          filename: "Acme.zip",
          sha256: "1".repeat(64),
          packageManifestSha256: "2".repeat(64),
        },
        expiresAt: "2027-08-01T00:00:00.000Z",
      });
      const lease = await store.tryAcquireLease(projectId, clientRequestId);
      expect(lease).toBeDefined();
      await store.update(
        {
          ...reservation.record,
          state: "prepared",
          archiveAttachment: {
            fileId: `prepared-archive-${index}`,
            filename: "Acme.zip",
            temporary: false,
          },
          skillAttachment: {
            fileId: `prepared-skill-${index}`,
            filename: "geo-custom-question-classifier.skill.zip",
            temporary: false,
          },
        },
        lease!,
      );
      await store.releaseLease(lease!);
      operations.push({ projectId, clientRequestId });
    }

    broker.customQuestionClassifierOutput = {
      decision: "reject",
      category: "unrelated",
      enterpriseRelated: false,
      reasonCode: "enterprise_unrelated",
      reason: "问题与当前企业知识无关。",
      enterpriseAnchor: null,
      offeringAnchor: null,
      evidenceRefs: [],
    };
    const createTask = broker.createTask.bind(broker);
    let loseFirstTaskResponse = true;
    broker.createTask = async (input) => {
      const task = await createTask(input);
      if (loseFirstTaskResponse) {
        loseFirstTaskResponse = false;
        throw new GeoBrokerError(
          "task was committed before the Website process exited",
          502,
          "AGENT_UNAVAILABLE",
        );
      }
      return task;
    };

    const firstProcess = createGeoCustomQuestionRecoveryWorker({
      broker,
      store,
      batchSize: 3,
    });
    const competingProcess = createGeoCustomQuestionRecoveryWorker({
      broker,
      store,
      batchSize: 3,
    });
    await Promise.all([firstProcess.runOnce(), competingProcess.runOnce()]);

    // A new process must converge the lost response through the original
    // idempotency key, while records after the former fixed prefix are not
    // starved by the three-operation concurrency limit.
    const restartedProcess = createGeoCustomQuestionRecoveryWorker({
      broker,
      store,
      batchSize: 3,
    });
    await restartedProcess.runOnce();
    await restartedProcess.runOnce();

    const recoveredRecords = await Promise.all(
      operations.map((operation) =>
        store.get(operation.projectId, operation.clientRequestId),
      ),
    );
    expect(
      recoveredRecords.map((record, index) => ({
        index,
        state: record?.state,
        cleanupCompleted: record?.cleanupCompleted,
        taskId: record?.taskId,
        error: record?.error?.code,
      })),
    ).toEqual(
      Array.from({ length: operationCount }, (_, index) => ({
        index,
        state: "rejected",
        cleanupCompleted: true,
        taskId: expect.stringMatching(/^custom-question-classifier-/),
        error: "CUSTOM_QUESTION_ENTERPRISE_UNRELATED",
      })),
    );
    expect(broker.customQuestionClassifierTaskCount).toBe(operationCount);
    expect(broker.idempotentTasks.size).toBe(operationCount);

    await restartedProcess.runOnce();
    expect(broker.customQuestionClassifierTaskCount).toBe(operationCount);
  });

  it("keeps the 15-second legacy compatibility contract while a timed-out refresh reuses the same task", async () => {
    expect(GEO_LEGACY_CUSTOM_QUESTION_COMPATIBILITY_WAIT_MS).toBe(15_000);

    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    const compatibilityApp = express();
    compatibilityApp.use(
      "/api/geo",
      createGeoRouter({
        broker,
        customQuestionValidationStore,
        projectOrderRegistry,
        legacyCustomQuestionCompatibilityWaitMs: 30,
        legacyCustomQuestionCompatibilityPollMs: 5,
        env: {
          NODE_ENV: "test",
          FRONTMIND_GEO_INVITE_CODE: "frontmind666",
          FRONTMIND_GEO_SESSION_SECRET:
            "test-session-secret-at-least-16-characters",
        },
      }),
    );
    server = compatibilityApp.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/geo`;

    const ready = await createReadyProject();
    broker.customQuestionClassifierPendingPolls = 99;
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const request = {
      method: "POST",
      body: { question: "Acme 在高校科研场景中能解决什么问题？" },
    } as const;

    const timedOut = await jsonRequest(pathname, ready.cookie, request);
    expect(timedOut.response.status).toBe(504);
    expect(timedOut.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_LEGACY_CLIENT_REFRESH_REQUIRED" },
    });
    const active = await jsonRequest(`${pathname}/active`, ready.cookie);
    expect(active.response.status).toBe(202);
    expect(active.body).toMatchObject({
      validation: {
        state: "submitted",
        clientRequestId: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        ),
      },
    });

    const refreshed = await jsonRequest(pathname, ready.cookie, request);
    expect(refreshed.response.status).toBe(504);
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it("converges repeated task-read failures to one retryable terminal result", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierPendingPolls = 99;
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const started = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(started.response.status).toBe(202);
    broker.taskErrors.set(
      "custom-question-classifier-1",
      new GeoBrokerError(
        "task permanently missing",
        404,
        "AGENT_REQUEST_FAILED",
      ),
    );
    const statusPath = `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`;
    const firstFailure = await jsonRequest(statusPath, ready.cookie);
    expect(firstFailure.response.status).toBe(202);
    customQuestionValidationNowMs += 15_000;
    const secondFailure = await jsonRequest(statusPath, ready.cookie);
    expect(secondFailure.response.status).toBe(202);
    customQuestionValidationNowMs += 15_000;
    const terminal = await jsonRequest(statusPath, ready.cookie);
    expect(terminal.response.status).toBe(502);
    expect(terminal.body).toMatchObject({
      validation: {
        state: "failed",
        error: {
          code: "CUSTOM_QUESTION_CLASSIFIER_TASK_UNAVAILABLE",
          retryable: true,
        },
      },
      error: { code: "CUSTOM_QUESTION_CLASSIFIER_TASK_UNAVAILABLE" },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it("stages one skill file before upload and bounds repeated preparation failures to one retryable terminal", async () => {
    const ready = await createReadyProject();
    const createdBefore = new Set(broker.createdFileIds);
    broker.skillUploadError = new GeoBrokerError(
      "skill upload unavailable",
      503,
      "AGENT_REQUEST_FAILED",
    );
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const first = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(first.response.status).toBe(202);
    expect(first.body).toMatchObject({ validation: { state: "prepared" } });

    const projectId = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ projectId: string }>(ready.projectToken, "project").value
      .projectId;
    const staged = await customQuestionValidationStore.get(
      projectId,
      CUSTOM_QUESTION_CLIENT_REQUEST_ID,
    );
    expect(staged).toMatchObject({
      skillStagingAttachment: {
        fileId: expect.stringMatching(/^skill-file-/),
        temporary: true,
      },
      transientErrorCount: 1,
    });
    expect(staged?.skillAttachment).toBeUndefined();
    const stagedFileId = staged!.skillStagingAttachment!.fileId;
    expect(staged!.orphanedTemporaryFileIds).toContain(stagedFileId);
    expect(
      broker.createdFileIds.filter(
        (id) => !createdBefore.has(id) && id.startsWith("skill-file-"),
      ),
    ).toEqual([stagedFileId]);

    const worker = createGeoCustomQuestionRecoveryWorker({
      broker,
      store: customQuestionValidationStore,
      now: () => customQuestionValidationNowMs,
    });
    customQuestionValidationNowMs += 15_000;
    await worker.runOnce();
    await expect(
      customQuestionValidationStore.get(
        projectId,
        CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      ),
    ).resolves.toMatchObject({ state: "prepared", transientErrorCount: 2 });

    customQuestionValidationNowMs += 15_000;
    await worker.runOnce();
    await expect(
      customQuestionValidationStore.get(
        projectId,
        CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      ),
    ).resolves.toMatchObject({
      state: "failed",
      cleanupCompleted: true,
      error: {
        code: "CUSTOM_QUESTION_SKILL_PREPARATION_UNAVAILABLE",
        retryable: true,
      },
    });
    const terminal = await jsonRequest(
      `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`,
      ready.cookie,
    );
    expect(terminal.response.status).toBe(502);
    expect(terminal.body).toMatchObject({
      validation: {
        state: "failed",
        error: {
          code: "CUSTOM_QUESTION_SKILL_PREPARATION_UNAVAILABLE",
          retryable: true,
        },
      },
      error: { code: "CUSTOM_QUESTION_SKILL_PREPARATION_UNAVAILABLE" },
    });
    expect(
      broker.uploadAttempts.filter((id) => id === stagedFileId),
    ).toHaveLength(3);
    expect(broker.deletedFiles).toContain(stagedFileId);
    const createsAfterTerminal = broker.createdFileIds.length;
    const uploadsAfterTerminal = broker.uploadAttempts.length;
    await worker.runOnce();
    expect(broker.createdFileIds).toHaveLength(createsAfterTerminal);
    expect(broker.uploadAttempts).toHaveLength(uploadsAfterTerminal);
  });

  it("recovers the same temporary file after create succeeded but its response was lost", async () => {
    const ready = await createReadyProject();
    const filesBefore = new Set(broker.createdFileIds);
    broker.loseNextIdempotentFileCreateResponse = true;
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;

    const first = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(first.response.status).toBe(202);

    const projectId = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ projectId: string }>(ready.projectToken, "project").value
      .projectId;
    await expect(
      customQuestionValidationStore.get(
        projectId,
        CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      ),
    ).resolves.toMatchObject({
      state: "reserved",
      transientErrorCount: 1,
    });
    const createdAfterLostResponse = broker.createdFileIds.filter(
      (id) => !filesBefore.has(id),
    );
    expect(createdAfterLostResponse).toHaveLength(1);
    const upstreamFileId = createdAfterLostResponse[0]!;

    // A fresh recovery worker represents the Website process restarting. Its
    // retry carries the same operation key and receives the already-created
    // upstream file id, which is then persisted and cleaned normally.
    const worker = createGeoCustomQuestionRecoveryWorker({
      broker,
      store: customQuestionValidationStore,
      now: () => customQuestionValidationNowMs,
    });
    customQuestionValidationNowMs += 15_000;
    await worker.runOnce();

    const recovered = await customQuestionValidationStore.get(
      projectId,
      CUSTOM_QUESTION_CLIENT_REQUEST_ID,
    );
    expect(recovered).toMatchObject({
      state: "completed",
      cleanupCompleted: true,
    });
    expect(broker.createdFileIds.filter((id) => id === upstreamFileId)).toEqual(
      [upstreamFileId],
    );
    expect(broker.deletedFiles).toContain(upstreamFileId);
    const operationKeys = broker.fileCreateOperationKeys.filter((key) =>
      key.includes(":archive:0:v1"),
    );
    expect(operationKeys).toHaveLength(2);
    expect(new Set(operationKeys).size).toBe(1);
    expect(operationKeys[0]).toMatch(
      /^geo-custom-question-file:[a-f0-9]{64}:archive:0:v1$/,
    );
  });

  it("rebuilds both attachments under the current credential after rotation and a lost file response", async () => {
    const ready = await createReadyProject();
    const filesBefore = new Set(broker.createdFileIds);
    broker.enforceCurrentCredentialAttachments = true;
    broker.loseNextIdempotentFileCreateResponse = true;
    broker.rotateCredentialWhenFileResponseIsLost = true;
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;

    const first = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(first.response.status).toBe(202);
    expect(broker.currentCredentialVersion).toBe(2);

    const projectId = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ projectId: string }>(ready.projectToken, "project").value
      .projectId;
    const fileCreatedBeforeRotation = broker.createdFileIds.find(
      (id) => !filesBefore.has(id),
    );
    expect(fileCreatedBeforeRotation).toBeDefined();
    expect(broker.fileCredentialVersions.get(fileCreatedBeforeRotation!)).toBe(
      1,
    );

    // A fresh worker represents process restart. Its first cycle replays the
    // completed generation-0 file exactly once, then observes Dashboard's
    // current-credential conflict and atomically advances the attachment
    // generation without creating a task.
    const worker = createGeoCustomQuestionRecoveryWorker({
      broker,
      store: customQuestionValidationStore,
      now: () => customQuestionValidationNowMs,
    });
    customQuestionValidationNowMs += 15_000;
    await worker.runOnce();
    await expect(
      customQuestionValidationStore.get(
        projectId,
        CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      ),
    ).resolves.toMatchObject({
      state: "reserved",
      attachmentRebuildCount: 1,
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(0);
    expect(
      broker.createdFileIds.filter((id) => id === fileCreatedBeforeRotation),
    ).toEqual([fileCreatedBeforeRotation]);

    // The next cycle copies the ZIP and uploads the Skill under credential 2;
    // the task is then created once and terminal cleanup retires every
    // temporary file, including the replayed generation-0 file.
    customQuestionValidationNowMs += 15_000;
    await worker.runOnce();
    const completed = await customQuestionValidationStore.get(
      projectId,
      CUSTOM_QUESTION_CLIENT_REQUEST_ID,
    );
    expect(completed).toMatchObject({
      state: "completed",
      cleanupCompleted: true,
      attachmentRebuildCount: 1,
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
    const finalAttachments = broker.taskAttachments.at(-1)!;
    expect(finalAttachments).toHaveLength(2);
    expect(
      finalAttachments.map((attachment) =>
        broker.fileCredentialVersions.get(attachment.file_id),
      ),
    ).toEqual([2, 2]);
    expect(broker.deletedFiles).toContain(fileCreatedBeforeRotation);

    const generationZeroArchiveKeys = broker.fileCreateOperationKeys.filter(
      (key) => key.includes(":archive:0:v1"),
    );
    expect(generationZeroArchiveKeys).toHaveLength(2);
    expect(new Set(generationZeroArchiveKeys).size).toBe(1);
    const generationOneKeys = broker.fileCreateOperationKeys.filter((key) =>
      /:(?:archive|skill):1:v1$/.test(key),
    );
    expect(generationOneKeys).toHaveLength(2);
  });

  it("stages and reuses one force-copied archive file, retaining every temporary ID for terminal cleanup", async () => {
    const ready = await createReadyProject();
    broker.createTaskErrors.push(
      new GeoBrokerError(
        "attachment no longer exists",
        404,
        "AGENT_REQUEST_FAILED",
      ),
    );
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const first = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(first.response.status).toBe(202);
    expect(first.body).toMatchObject({ validation: { state: "reserved" } });
    const filesBeforeCopy = new Set(broker.createdFileIds);
    broker.regularUploadError = new GeoBrokerError(
      "archive upload unavailable",
      503,
      "AGENT_REQUEST_FAILED",
    );

    const statusPath = `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`;
    const copyFailure = await jsonRequest(statusPath, ready.cookie);
    expect(copyFailure.response.status).toBe(202);
    const projectId = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ projectId: string }>(ready.projectToken, "project").value
      .projectId;
    const staged = await customQuestionValidationStore.get(
      projectId,
      CUSTOM_QUESTION_CLIENT_REQUEST_ID,
    );
    expect(staged).toMatchObject({
      attachmentRebuildCount: 1,
      archiveStagingAttachment: {
        fileId: expect.stringMatching(/^file-/),
        temporary: true,
      },
      transientErrorCount: 1,
    });
    expect(staged?.archiveAttachment).toBeUndefined();
    const archiveStagingId = staged!.archiveStagingAttachment!.fileId;
    const originalSkillId = staged!.orphanedTemporaryFileIds.find((id) =>
      id.startsWith("skill-file-"),
    );
    expect(originalSkillId).toBeDefined();
    expect(staged!.orphanedTemporaryFileIds).toEqual(
      expect.arrayContaining([archiveStagingId, originalSkillId]),
    );
    expect(
      broker.createdFileIds.filter(
        (id) => !filesBeforeCopy.has(id) && id.startsWith("file-"),
      ),
    ).toEqual([archiveStagingId]);

    customQuestionValidationNowMs += 15_000;
    const second = await jsonRequest(statusPath, ready.cookie);
    expect(second.response.status).toBe(202);
    customQuestionValidationNowMs += 15_000;
    const terminal = await jsonRequest(statusPath, ready.cookie);
    expect(terminal.response.status).toBe(502);
    expect(terminal.body).toMatchObject({
      validation: {
        state: "failed",
        error: {
          code: "CUSTOM_QUESTION_ARCHIVE_PREPARATION_UNAVAILABLE",
          retryable: true,
        },
      },
    });
    expect(
      broker.uploadAttempts.filter((id) => id === archiveStagingId),
    ).toHaveLength(3);
    expect(broker.deletedFiles).toEqual(
      expect.arrayContaining([archiveStagingId, originalSkillId]),
    );
    const worker = createGeoCustomQuestionRecoveryWorker({
      broker,
      store: customQuestionValidationStore,
      now: () => customQuestionValidationNowMs,
    });
    const createsAfterTerminal = broker.createdFileIds.length;
    await worker.runOnce();
    expect(broker.createdFileIds).toHaveLength(createsAfterTerminal);
  });

  it("rebuilds invalid frozen attachments without creating a second operation", async () => {
    const ready = await createReadyProject();
    broker.createTaskErrors.push(
      new GeoBrokerError(
        "attachment no longer exists",
        404,
        "AGENT_REQUEST_FAILED",
      ),
    );
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const first = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(first.response.status).toBe(202);
    expect(first.body).toMatchObject({
      validation: { state: "reserved" },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(0);

    const recovered = await jsonRequest(
      `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`,
      ready.cookie,
    );
    expect(recovered.response.status).toBe(200);
    expect(recovered.body).toMatchObject({
      validation: { state: "completed" },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
    const classifierAttachments = broker.taskAttachments.at(-1)!;
    expect(classifierAttachments[0]?.file_id).toMatch(/^skill-file-/);
    expect(classifierAttachments[1]?.file_id).toMatch(/^file-/);
  });

  it("retries terminal resource cleanup in the background before marking it complete", async () => {
    const ready = await createReadyProject();
    broker.failDeleteFile = true;
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const completed = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(completed.response.status).toBe(201);
    const projectId = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ projectId: string }>(ready.projectToken, "project").value
      .projectId;
    await expect(
      customQuestionValidationStore.get(
        projectId,
        CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      ),
    ).resolves.toMatchObject({ cleanupCompleted: false });

    const worker = createGeoCustomQuestionRecoveryWorker({
      broker,
      store: customQuestionValidationStore,
    });
    await worker.runOnce();
    await expect(
      customQuestionValidationStore.get(
        projectId,
        CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      ),
    ).resolves.toMatchObject({ cleanupCompleted: false });

    broker.failDeleteFile = false;
    await worker.runOnce();
    await expect(
      customQuestionValidationStore.get(
        projectId,
        CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      ),
    ).resolves.toMatchObject({ cleanupCompleted: true });
    expect(broker.tasks.has("custom-question-classifier-1")).toBe(true);
  });

  it("completes an active reservation in the background without another browser poll", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierPendingPolls = 99;
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const started = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(started.response.status).toBe(202);
    broker.tasks.set("custom-question-classifier-1", {
      id: "custom-question-classifier-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            { text: JSON.stringify(broker.customQuestionClassifierOutput) },
          ],
        },
      ],
    });

    const worker = createGeoCustomQuestionRecoveryWorker({
      broker,
      store: customQuestionValidationStore,
    });
    await worker.runOnce();

    const projectId = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ projectId: string }>(ready.projectToken, "project").value
      .projectId;
    await expect(
      customQuestionValidationStore.get(
        projectId,
        CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      ),
    ).resolves.toMatchObject({
      state: "completed",
      cleanupCompleted: true,
      result: {
        question: "Acme 在高校科研场景中能解决什么问题？",
      },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
    expect(broker.tasks.has("custom-question-classifier-1")).toBe(true);
  });

  it("accepts finished as a terminal classifier status", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierPendingPolls = 99;
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const started = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(started.response.status).toBe(202);

    broker.tasks.set("custom-question-classifier-1", {
      id: "custom-question-classifier-1",
      status: "finished",
      output: [
        {
          role: "assistant",
          content: [
            { text: JSON.stringify(broker.customQuestionClassifierOutput) },
          ],
        },
      ],
    });
    const completed = await jsonRequest(
      `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`,
      ready.cookie,
    );
    expect(completed.response.status).toBe(200);
    expect(completed.body).toMatchObject({
      validation: { state: "completed" },
      question: {
        question: "Acme 在高校科研场景中能解决什么问题？",
      },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it("fails an unknown classifier status after three stable observations", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierPendingPolls = 99;
    const pathname = `/projects/${encodeURIComponent(
      ready.projectToken,
    )}/questions/custom`;
    const started = await jsonRequest(pathname, ready.cookie, {
      method: "POST",
      body: {
        question: "Acme 在高校科研场景中能解决什么问题？",
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
      },
    });
    expect(started.response.status).toBe(202);
    broker.tasks.set("custom-question-classifier-1", {
      id: "custom-question-classifier-1",
      status: "provider-new-terminal-state",
      output: [],
    });
    const statusPath = `${pathname}/${CUSTOM_QUESTION_CLIENT_REQUEST_ID}`;

    for (let observation = 1; observation <= 2; observation += 1) {
      const pending = await jsonRequest(statusPath, ready.cookie);
      expect(pending.response.status).toBe(202);
      expect(pending.body).toMatchObject({
        validation: { state: "submitted" },
      });
    }
    const failed = await jsonRequest(statusPath, ready.cookie);
    expect(failed.response.status).toBe(502);
    expect(failed.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_CLASSIFIER_UNKNOWN_STATUS" },
      validation: { state: "failed" },
    });
    const replayed = await jsonRequest(statusPath, ready.cookie);
    expect(replayed.response.status).toBe(502);
    expect(replayed.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_CLASSIFIER_UNKNOWN_STATUS" },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
  });

  it.each([
    "科研仪器行业排名前十的品牌有哪些？",
    "GEO 服务商哪家最好？",
    "有哪些企业知识库产品值得推荐？",
    "GEO 服务商有推荐的吗？",
    "推荐品牌有哪些？",
  ])(
    "rejects a custom industry-ranking question before payment: %s",
    async (question) => {
      const ready = await createReadyProject();
      const rejected = await jsonRequest(
        `/projects/${encodeURIComponent(ready.projectToken)}/questions/custom`,
        ready.cookie,
        {
          method: "POST",
          body: {
            question,
            clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
          },
        },
      );
      expect(rejected.response.status).toBe(422);
      expect(rejected.body).toMatchObject({
        error: { code: "INDUSTRY_RANKING_QUESTION" },
      });
      expect(paymentCheckoutCalls).toHaveLength(0);
      expect(broker.monitorCreates).toBe(0);
    },
  );

  it("rejects a question that the knowledge-base classifier identifies as enterprise-unrelated", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierOutput = {
      decision: "reject",
      category: "unrelated",
      enterpriseRelated: false,
      reasonCode: "enterprise_unrelated",
      reason: "问题讨论其他品牌手机，与 Acme 企业知识无关。",
      enterpriseAnchor: null,
      offeringAnchor: null,
      evidenceRefs: [],
    };

    const rejected = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/questions/custom`,
      ready.cookie,
      {
        method: "POST",
        body: {
          question: "苹果手机最近有什么新功能？",
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        },
      },
    );

    expect(rejected.response.status).toBe(422);
    expect(rejected.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_ENTERPRISE_UNRELATED" },
      validation: {
        clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        state: "rejected",
        error: { retryable: false },
      },
    });
    expect(broker.customQuestionClassifierTaskCount).toBe(1);
    expect(paymentCheckoutCalls).toHaveLength(0);

    const deleted = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
      { method: "DELETE" },
    );
    expect(deleted.response.status).toBe(200);
    expect(deleted.body).toMatchObject({ ok: true });
  });

  it("fails closed when a classifier accepts a question without a verified enterprise or offering anchor", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierOutput = {
      decision: "accept",
      category: "product_scenario",
      enterpriseRelated: true,
      reasonCode: "accepted",
      reason: "问题看似涉及一种通用产品场景。",
      enterpriseAnchor: null,
      offeringAnchor: null,
      evidenceRefs: ["01_company_overview/overview.md"],
    };

    const rejected = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/questions/custom`,
      ready.cookie,
      {
        method: "POST",
        body: {
          question: "苹果手机最近有什么新功能？",
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        },
      },
    );

    expect(rejected.response.status).toBe(422);
    expect(rejected.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_ENTERPRISE_UNRELATED" },
    });
    expect(paymentCheckoutCalls).toHaveLength(0);
  });

  it("fails closed when the classifier returns an evidence path outside the enterprise knowledge base", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierOutput = {
      decision: "accept",
      category: "reputation",
      enterpriseRelated: true,
      reasonCode: "accepted",
      reason: "问题明确询问 Acme 的可信度。",
      enterpriseAnchor: "Acme",
      offeringAnchor: null,
      evidenceRefs: ["external/nonexistent.md"],
    };

    const rejected = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/questions/custom`,
      ready.cookie,
      {
        method: "POST",
        body: {
          question: "Acme 靠谱吗？",
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        },
      },
    );

    expect(rejected.response.status).toBe(502);
    expect(rejected.body).toMatchObject({
      error: { code: "CUSTOM_QUESTION_CLASSIFIER_INVALID_RESPONSE" },
    });
    expect(paymentCheckoutCalls).toHaveLength(0);
  });

  it("uses the classifier category instead of the previous regex fallback", async () => {
    const ready = await createReadyProject();
    broker.customQuestionClassifierOutput = {
      decision: "accept",
      category: "competitor_comparison",
      enterpriseRelated: true,
      reasonCode: "accepted",
      reason: "问题要求在 Acme 与传统自建路线之间进行具体取舍。",
      enterpriseAnchor: "Acme",
      offeringAnchor: null,
      evidenceRefs: ["01_company_overview/overview.md"],
    };

    const accepted = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/questions/custom`,
      ready.cookie,
      {
        method: "POST",
        body: {
          question: "Acme 与传统自建路线应如何取舍？",
          clientRequestId: CUSTOM_QUESTION_CLIENT_REQUEST_ID,
        },
      },
    );

    expect(accepted.response.status).toBe(201);
    expect(accepted.body).toMatchObject({
      question: {
        category: "competitor_comparison",
        enterpriseAnchor: "Acme",
      },
      project: {
        questions: expect.arrayContaining([
          expect.objectContaining({
            category: "competitor_comparison",
            question: "Acme 与传统自建路线应如何取舍？",
          }),
        ]),
      },
    });
  });

  it("returns the exact acknowledgement expected by a verified ZPAY notify", async () => {
    const response = await fetch(`${baseUrl}/payments/notify?sign=mock`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(await response.text()).toBe("success");

    const duplicated = await fetch(
      `${baseUrl}/payments/notify?sign=first&sign=second`,
    );
    expect(duplicated.status).toBe(400);
    expect(await duplicated.text()).toBe("fail");

    const reviewRequired = await fetch(
      `${baseUrl}/payments/notify?sign=review`,
    );
    expect(reviewRequired.status).toBe(200);
    expect(await reviewRequired.text()).toBe("success");

    const ledgerUnavailable = await fetch(
      `${baseUrl}/payments/notify?sign=ledger-down`,
    );
    expect(ledgerUnavailable.status).toBe(400);
    expect(await ledgerUnavailable.text()).toBe("fail");
  });

  it("submits one 5-per-platform text search run and replays idempotently", async () => {
    const ready = await createReadyProject();
    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/payments`,
      ready.cookie,
      {
        method: "POST",
        body: {
          questionId: "product-scenario-01",
          platformIds: [
            "doubao",
            "yuanbao",
            "deepseek",
            "baiduai",
            "qianwen",
            "kimi",
          ],
          method: "alipay",
        },
      },
    );
    const body = {
      questionId: "product-scenario-01",
      platformIds: [
        "doubao",
        "yuanbao",
        "deepseek",
        "baiduai",
        "qianwen",
        "kimi",
      ],
      paymentAuthorization: (checkout.body as any).payment.authorization,
    };
    const started = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      { method: "POST", body },
    );
    expect(started.response.status).toBe(201);
    expect(started.body).toMatchObject({
      project: {
        stage: "monitoring",
        selectedQuestionId: "product-scenario-01",
        selectedPlatformIds: body.platformIds,
        monitoring: {
          status: "submitted",
          repeatPerPlatform: 5,
          expectedRecords: 30,
        },
      },
    });
    expect(broker.monitorCreates).toBe(1);

    const replayed = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      { method: "POST", body },
    );
    expect(replayed.response.status).toBe(201);
    expect(broker.monitorCreates).toBe(1);
  });

  it("returns completed records from the result endpoint while monitoring is still running", async () => {
    const ready = await createReadyProject();
    const started = await startOnePlatformMonitor(ready);
    const status = broker.monitorRuns.get("monitor-1")!;
    broker.monitorResults.set("monitor-1", {
      ...status,
      status: "polling",
      completedItems: 1,
      records: [monitorRecord(1, "渐进返回的第一条真实回答")],
    });

    const refreshed = await jsonRequest(
      `/projects/${encodeURIComponent(started.projectToken)}`,
      ready.cookie,
    );

    expect(refreshed.response.status).toBe(200);
    expect(refreshed.body).toMatchObject({
      project: {
        monitoring: {
          status: "polling",
          completedRecords: 1,
          records: [
            {
              answerText: "渐进返回的第一条真实回答",
              sources: [
                { title: "Acme 官网", url: "https://acme.example/about" },
                {
                  title: "检索参考",
                  url: "https://search.example/result",
                },
              ],
            },
          ],
        },
      },
    });
    expect(broker.monitorResultReads).toBe(1);
    expect(broker.monitorCreates).toBe(1);
  });

  it("falls back to the normalized status when a running result is not ready", async () => {
    const ready = await createReadyProject();
    const started = await startOnePlatformMonitor(ready);
    broker.monitorResultError = new GeoBrokerError(
      "监控结果仍在生成",
      502,
      "MONITOR_RESULT_PENDING",
    );

    const refreshed = await jsonRequest(
      `/projects/${encodeURIComponent(started.projectToken)}`,
      ready.cookie,
    );

    expect(refreshed.response.status).toBe(200);
    expect(refreshed.body).toMatchObject({
      project: {
        monitoring: {
          status: "submitted",
          completedRecords: 0,
        },
      },
    });
    expect((refreshed.body as any).project.monitoring).not.toHaveProperty(
      "records",
    );
    expect(broker.monitorResultReads).toBe(1);
    expect(broker.monitorCreates).toBe(1);
  });

  it("keeps a submission-unknown monitor project running instead of marking it failed", async () => {
    const ready = await createReadyProject();
    const started = await startOnePlatformMonitor(ready);
    const submitted = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...submitted,
      status: "submission_unknown",
      nextPollAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const refreshed = await jsonRequest(
      `/projects/${encodeURIComponent(started.projectToken)}`,
      ready.cookie,
    );

    expect(refreshed.response.status).toBe(200);
    expect(refreshed.body).toMatchObject({
      project: {
        status: "running",
        stage: "monitoring",
        monitoring: { status: "submission_unknown" },
      },
    });
    expect((refreshed.body as any).project.status).not.toBe("failed");
    expect(broker.monitorCreates).toBe(1);
  });

  it("continues to resolve a completed run from its final result snapshot", async () => {
    const ready = await createReadyProject();
    const started = await startOnePlatformMonitor(ready);
    const submitted = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...submitted,
      status: "completed",
      completedItems: 5,
    });
    broker.monitorResults.set("monitor-1", {
      ...submitted,
      status: "completed",
      completedItems: 5,
      records: Array.from({ length: 5 }, (_, index) =>
        monitorRecord(index + 1, `最终结果 ${index + 1}`),
      ),
    });

    const refreshed = await jsonRequest(
      `/projects/${encodeURIComponent(started.projectToken)}`,
      ready.cookie,
    );

    expect(refreshed.response.status).toBe(200);
    expect((refreshed.body as any).project.monitoring).toMatchObject({
      status: "completed",
      completedRecords: 5,
    });
    expect(
      (refreshed.body as any).project.monitoring.records[0].answerText,
    ).toBe("最终结果 1");
    expect(broker.monitorResultReads).toBe(1);
    expect(broker.monitorCreates).toBe(1);
  });

  it("rejects locked ranking questions before payment or monitoring", async () => {
    const ready = await createReadyProject();
    const rejected = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      {
        method: "POST",
        body: {
          questionId: "industry-ranking-01",
          platformIds: ["kimi"],
          paymentAuthorization: "zpay-signed-authorization-placeholder",
        },
      },
    );
    expect(rejected.response.status).toBe(403);
    expect(paymentCalls).toHaveLength(0);
    expect(broker.monitorCreates).toBe(0);
  });

  it("rejects an open comparison target even when generated as a selectable competitor question", async () => {
    const generated = validQuestionSet();
    generated.questions[15] = {
      ...generated.questions[15],
      question: "Acme 和几个主流平台相比哪个更好？",
      competitorAnchor: "几个主流平台",
      category: "competitor_comparison",
      selectable: true,
    };
    broker.questionTaskOutput = generated;

    const ready = await createReadyProject();
    const rejected = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
      ready.cookie,
      {
        method: "POST",
        body: {
          questionId: "competitor-comparison-01",
          platformIds: ["kimi"],
          paymentAuthorization: "zpay-signed-authorization-placeholder",
        },
      },
    );

    expect(rejected.response.status).toBe(403);
    expect(rejected.body).toMatchObject({
      error: { code: "QUESTION_NOT_SELECTABLE" },
    });
    expect(paymentCalls).toHaveLength(0);
    expect(broker.monitorCreates).toBe(0);
  });

  it("starts Base assessment only after complete real monitor records", async () => {
    const ready = await createReadyProject();
    const startedPayload = await startOnePlatformMonitor(ready);

    const tooEarly = await jsonRequest(
      `/projects/${encodeURIComponent(startedPayload.projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(tooEarly.response.status).toBe(409);
    expect(broker.assessmentTaskCount).toBe(0);

    const run = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...run,
      status: "completed",
      completedItems: 5,
      records: Array.from({ length: 5 }, (_, index) => ({
        recordId: `record-${index + 1}`,
        platform: "doubao",
        runIndex: index + 1,
        status: "completed",
        answerText: `Acme 回答 ${index + 1}`,
        media: [
          {
            type: "video",
            url: "https://media.example/interview.mp4",
          },
        ],
        citations: [{ title: "Acme 官网", url: "https://acme.example/about" }],
        references: [
          { title: "检索参考", url: "https://search.example/result" },
        ],
      })),
    });
    broker.completeAssessmentImmediately = true;
    const assessed = await jsonRequest(
      `/projects/${encodeURIComponent(startedPayload.projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(assessed.response.status).toBe(201);
    expect(assessed.body).toMatchObject({
      project: {
        stage: "current_assessment",
        assessment: {
          status: "ready",
          totalScore: 52.5,
          grade: "C",
          coverage: 1,
          scopeLabel: "本题证据表现",
        },
      },
    });
    expect(broker.assessmentTaskCount).toBe(1);
    expect(broker.prompts.at(-1)).toContain(
      "此任务使用 Base 模型，只输出 schema 要求的事实四分类、confidence 与 0-1 原始指标",
    );
    expect(broker.prompts.at(-1)).toContain("在单次任务中完成");
    const assessmentAttachments = broker.taskAttachments.at(-1)!;
    expect(
      assessmentAttachments.map((attachment) => attachment.filename),
    ).toEqual([
      "geo-current-state-evaluator.skill.zip",
      "Acme_website_lead_knowledge_base.zip",
      "Acme-monitoring-records.json",
    ]);
    const monitoringAttachment = assessmentAttachments.find(
      (attachment) => attachment.filename === "Acme-monitoring-records.json",
    )!;
    const parsedMonitoring = JSON.parse(
      broker.uploads.get(monitoringAttachment.file_id)!.toString("utf8"),
    );
    expect(parsedMonitoring.records).toHaveLength(5);
    expect(parsedMonitoring.records[0].sources).toEqual([
      { title: "Acme 官网", url: "https://acme.example/about" },
      { title: "检索参考", url: "https://search.example/result" },
    ]);
    expect(parsedMonitoring.records[0].media).toBeUndefined();
  });

  it("keeps invalid completed assessment terminal on GET and only reruns it after an explicit POST", async () => {
    const ready = await createReadyProject();
    const monitored = await startOnePlatformMonitor(ready);
    const run = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...run,
      status: "completed",
      completedItems: 5,
      records: Array.from({ length: 5 }, (_, index) =>
        monitorRecord(index + 1, `Acme 回答 ${index + 1}`),
      ),
    });

    const first = await jsonRequest(
      `/projects/${encodeURIComponent(monitored.projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(first.response.status).toBe(201);
    expect(broker.assessmentTaskCount).toBe(1);
    const invalidAssessmentOutput = validAssessmentOutput();
    invalidAssessmentOutput.rankingDiagnostics = {
      ...invalidAssessmentOutput.rankingDiagnostics,
      totalObservations: 5,
      rankedObservations: 0,
      unmentionedObservations: 0,
    };
    broker.tasks.set("assessment-1", {
      id: "assessment-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify(invalidAssessmentOutput) }],
        },
      ],
    });

    const viewed = await jsonRequest(
      `/projects/${encodeURIComponent((first.body as any).projectToken)}`,
      ready.cookie,
    );
    expect(viewed.response.status).toBe(200);
    expect((viewed.body as any).project).toMatchObject({
      assessment: { status: "failed" },
      assessmentRetryAvailable: true,
    });
    expect(broker.assessmentTaskCount).toBe(1);
    expect((viewed.body as any).project.executionLog.currentEntryId).toBe(
      "current-assessment",
    );
    const repeated = await jsonRequest(
      `/projects/${encodeURIComponent((viewed.body as any).projectToken)}`,
      ready.cookie,
    );
    expect(repeated.response.status).toBe(200);
    expect(broker.assessmentTaskCount).toBe(1);

    const manuallyRetried = await jsonRequest(
      `/projects/${encodeURIComponent((viewed.body as any).projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(manuallyRetried.response.status).toBe(201);
    expect((manuallyRetried.body as any).project.assessment).toMatchObject({
      status: "running",
    });
    expect(broker.assessmentTaskCount).toBe(2);
    expect(broker.prompts.at(-1)).toContain("在单次任务中完成");
    expect(broker.prompts.at(-1)).not.toContain("结构校验重试");
    expect(broker.prompts.at(-1)).not.toContain(
      "geo-knowledge-answer-verifier",
    );
  });

  it("reuses a completed v2 reputation assessment without exposing ranking internals", async () => {
    const ready = await createReadyProject();
    const monitored = await startOnePlatformMonitor(ready, "reputation-01");
    const run = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...run,
      status: "completed",
      completedItems: 5,
      records: Array.from({ length: 5 }, (_, index) =>
        monitorRecord(index + 1, `Acme 声誉回答 ${index + 1}`),
      ),
    });

    const started = await jsonRequest(
      `/projects/${encodeURIComponent(monitored.projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(started.response.status).toBe(201);
    expect(broker.assessmentTaskCount).toBe(1);

    const reputationQuestion = validQuestionSet().questions.find(
      (question) => question.id === "reputation-01",
    )!;
    const legacyOutput = validAssessmentOutput(reputationQuestion);
    legacyOutput.rankingDiagnostics.totalObservations = 5;
    legacyOutput.platformBreakdown[0].verdict =
      "来自 doubao/run-01 的 unavailable 结论";
    legacyOutput.knowledgeVsAnswers[0].recommendedAction =
      "检查 citationList 后再处理";
    broker.tasks.set("assessment-1", {
      id: "assessment-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify(legacyOutput) }],
        },
      ],
    });

    const completed = await jsonRequest(
      `/projects/${encodeURIComponent((started.body as any).projectToken)}`,
      ready.cookie,
    );

    expect(completed.response.status).toBe(200);
    expect(completed.body).toMatchObject({
      project: {
        assessment: {
          status: "ready",
          schemaVersion: 2,
        },
        assessmentRetryAvailable: false,
      },
    });
    const publicAssessment = JSON.stringify(
      (completed.body as any).project.assessment,
    );
    expect(publicAssessment).not.toContain("doubao/run-01");
    expect(publicAssessment).not.toContain("evidenceRefs");
    expect(publicAssessment).not.toContain("runIndex");
    expect(publicAssessment).not.toContain("kbClaimId");
    expect((completed.body as any).project.assessment).toMatchObject({
      platformBreakdown: [{ verdict: "平台回答已完成事实与来源核验。" }],
      comparisons: [{ recommendedAction: "补充清晰、可追溯的事实说明。" }],
    });
    expect(broker.assessmentTaskCount).toBe(1);
  });

  it("upgrades a historical assessment to v2 exactly once when the project is opened", async () => {
    const ready = await createServiceReadyProject();
    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    const historicalValue = codec.open<Record<string, any>>(
      ready.projectToken,
      "project",
    ).value;
    delete historicalValue.assessmentVersion;
    delete historicalValue.optimizationForecastVersion;
    const historicalToken = codec.seal(
      "project",
      historicalValue,
      60 * 60 * 1000,
    );
    broker.idempotentTasks.clear();
    broker.completeAssessmentImmediately = false;

    const upgraded = await jsonRequest(
      `/projects/${encodeURIComponent(historicalToken)}`,
      ready.cookie,
    );

    expect(upgraded.response.status).toBe(200);
    expect((upgraded.body as any).project).toMatchObject({
      assessmentUpdatingToVersion2: true,
      assessment: { status: "running" },
    });
    expect((upgraded.body as any).project.optimizationForecast).toBeUndefined();
    expect(broker.assessmentTaskCount).toBe(2);
    const upgradedValue = codec.open<Record<string, any>>(
      (upgraded.body as any).projectToken,
      "project",
    ).value;
    expect(upgradedValue).toMatchObject({
      assessmentVersion: 2,
      assessmentTaskId: "assessment-2",
      previousAssessmentTaskIds: [ready.assessmentTaskId],
      previousOptimizationForecastTaskIds: [ready.forecastTaskId],
    });

    const repeated = await jsonRequest(
      `/projects/${encodeURIComponent((upgraded.body as any).projectToken)}`,
      ready.cookie,
    );
    expect(repeated.response.status).toBe(200);
    expect(broker.assessmentTaskCount).toBe(2);

    broker.tasks.set("assessment-2", {
      id: "assessment-2",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify(validAssessmentOutput()) }],
        },
      ],
    });
    broker.completeForecastImmediately = true;
    const completed = await jsonRequest(
      `/projects/${encodeURIComponent((repeated.body as any).projectToken)}`,
      ready.cookie,
    );
    expect(completed.response.status).toBe(200);
    expect((completed.body as any).project).toMatchObject({
      assessmentUpdatingToVersion2: false,
      assessment: { status: "ready", schemaVersion: 2 },
      optimizationForecast: { status: "ready", schemaVersion: 2 },
    });
    expect(broker.forecastTaskCount).toBe(2);
  });

  it("never reruns a cancelled assessment on GET and allows repeated explicit manual reruns", async () => {
    const ready = await createReadyProject();
    const monitored = await startOnePlatformMonitor(ready);
    const run = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...run,
      status: "completed",
      completedItems: 5,
      records: Array.from({ length: 5 }, (_, index) =>
        monitorRecord(index + 1, `Acme 回答 ${index + 1}`),
      ),
    });

    const first = await jsonRequest(
      `/projects/${encodeURIComponent(monitored.projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(first.response.status).toBe(201);
    expect(broker.assessmentTaskCount).toBe(1);
    broker.tasks.set("assessment-1", {
      id: "assessment-1",
      status: "cancelled",
      output: [],
    });

    const cancelledView = await jsonRequest(
      `/projects/${encodeURIComponent((first.body as any).projectToken)}`,
      ready.cookie,
    );

    expect(cancelledView.response.status).toBe(200);
    expect((cancelledView.body as any).project).toMatchObject({
      assessment: { status: "cancelled" },
      assessmentRetryAvailable: true,
    });
    expect(broker.assessmentTaskCount).toBe(1);

    const retried = await jsonRequest(
      `/projects/${encodeURIComponent((cancelledView.body as any).projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(retried.response.status).toBe(201);
    expect(broker.assessmentTaskCount).toBe(2);
    const retriedPayload = retried.body as Record<string, any>;
    const retriedValue = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<Record<string, unknown>>(
      retriedPayload.projectToken,
      "project",
    ).value;
    expect(retriedValue).toMatchObject({
      assessmentTaskId: "assessment-2",
      assessmentAttempt: 2,
      previousAssessmentTaskIds: ["assessment-1"],
    });

    broker.tasks.set("assessment-2", {
      id: "assessment-2",
      status: "cancelled",
      output: [],
    });
    const secondCancelledView = await jsonRequest(
      `/projects/${encodeURIComponent(retriedPayload.projectToken)}`,
      ready.cookie,
    );
    expect(secondCancelledView.response.status).toBe(200);
    expect((secondCancelledView.body as any).project).toMatchObject({
      assessment: { status: "cancelled" },
      assessmentRetryAvailable: true,
    });
    expect(broker.assessmentTaskCount).toBe(2);

    const retriedAgain = await jsonRequest(
      `/projects/${encodeURIComponent(retriedPayload.projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(retriedAgain.response.status).toBe(201);
    expect(broker.assessmentTaskCount).toBe(3);
    const retriedAgainValue = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<Record<string, unknown>>(
      (retriedAgain.body as any).projectToken,
      "project",
    ).value;
    expect(retriedAgainValue).toMatchObject({
      assessmentTaskId: "assessment-3",
      assessmentAttempt: 3,
      previousAssessmentTaskIds: ["assessment-1", "assessment-2"],
    });
  });

  it("renders noncanonical knowledge refs and replaces model source counts with canonical monitoring counts", async () => {
    const ready = await createReadyProject();
    const monitored = await startOnePlatformMonitor(ready);
    const run = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...run,
      status: "completed",
      completedItems: 5,
      records: Array.from({ length: 5 }, (_, index) =>
        monitorRecord(index + 1, `Acme 回答 ${index + 1}`),
      ),
    });

    const first = await jsonRequest(
      `/projects/${encodeURIComponent(monitored.projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(first.response.status).toBe(201);
    const invalidEvidenceOutput = validAssessmentOutput();
    invalidEvidenceOutput.knowledgeVsAnswers[0].kbEvidenceRefs = [
      "01_company_overview/nonexistent.md",
    ];
    invalidEvidenceOutput.platformBreakdown[0].sourceCount = 9_999;
    broker.tasks.set("assessment-1", {
      id: "assessment-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify(invalidEvidenceOutput) }],
        },
      ],
    });

    const completed = await jsonRequest(
      `/projects/${encodeURIComponent((first.body as any).projectToken)}`,
      ready.cookie,
    );
    expect(completed.response.status).toBe(200);
    expect((completed.body as any).project).toMatchObject({
      assessment: {
        status: "ready",
        platformBreakdown: [{ platform: "doubao", sourceCount: 2 }],
      },
      assessmentRetryAvailable: false,
    });
    expect(broker.assessmentTaskCount).toBe(1);
    expect(
      JSON.stringify((completed.body as any).project.assessment),
    ).not.toContain("nonexistent.md");
  });

  it("reuses a completed assessment with arbitrary internal evidence refs without rerunning", async () => {
    const ready = await createReadyProject();
    const monitored = await startOnePlatformMonitor(ready);
    const run = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...run,
      status: "completed",
      completedItems: 5,
      records: Array.from({ length: 5 }, (_, index) =>
        monitorRecord(index + 1, `Acme 回答 ${index + 1}`),
      ),
    });

    const first = await jsonRequest(
      `/projects/${encodeURIComponent(monitored.projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(first.response.status).toBe(201);
    const invalidEvidenceOutput = validAssessmentOutput();
    invalidEvidenceOutput.dimensions.semanticVisibility.aiSearchVisibility.evidenceRefs =
      ["invented/cross-task-evidence"];
    broker.tasks.set("assessment-1", {
      id: "assessment-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify(invalidEvidenceOutput) }],
        },
      ],
    });

    const reused = await jsonRequest(
      `/projects/${encodeURIComponent((first.body as any).projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );

    expect(reused.response.status).toBe(200);
    expect((reused.body as any).project).toMatchObject({
      assessment: { status: "ready" },
      assessmentRetryAvailable: false,
    });
    expect(broker.assessmentTaskCount).toBe(1);
    expect(
      JSON.stringify((reused.body as any).project.assessment),
    ).not.toContain("invented/cross-task-evidence");
  });

  it("creates one public optimization forecast only after assessment completes", async () => {
    const ready = await createReadyProject();
    const monitored = await startOnePlatformMonitor(ready);
    const run = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...run,
      status: "completed",
      completedItems: 5,
      records: Array.from({ length: 5 }, (_, index) =>
        monitorRecord(index + 1, `Acme 回答 ${index + 1}`),
      ),
    });

    const assessed = await jsonRequest(
      `/projects/${encodeURIComponent(monitored.projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(assessed.response.status).toBe(201);
    expect(broker.tasks.get("assessment-1")?.status).toBe("running");
    const assessedPayload = assessed.body as Record<string, any>;

    const tooEarly = await jsonRequest(
      `/projects/${encodeURIComponent(assessedPayload.projectToken)}/optimization-forecast`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(tooEarly.response.status).toBe(409);
    expect(tooEarly.body).toMatchObject({
      error: { code: "ASSESSMENT_NOT_READY" },
    });
    expect(broker.forecastTaskCount).toBe(0);

    broker.tasks.set("assessment-1", {
      id: "assessment-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify(validAssessmentOutput()) }],
        },
      ],
    });
    broker.completeForecastImmediately = true;
    const forecasted = await jsonRequest(
      `/projects/${encodeURIComponent(assessedPayload.projectToken)}/optimization-forecast`,
      ready.cookie,
      { method: "POST", body: {} },
    );

    expect(forecasted.response.status).toBe(201);
    const forecastedPayload = forecasted.body as Record<string, any>;
    expect(
      forecastedPayload.project.assessment.dimensions.competitive_advantage
        .summary,
    ).toBe("部分已验证差异点能够被回答准确表达。");
    expect(forecastedPayload.project.optimizationForecast).toMatchObject({
      status: "ready",
      horizonWeeks: 4,
      currentScore: 52.5,
      dimensions: expect.arrayContaining([
        expect.objectContaining({ id: "semantic_visibility" }),
        expect.objectContaining({ id: "semantic_coherence" }),
        expect.objectContaining({ id: "semantic_richness" }),
        expect.objectContaining({ id: "semantic_authority" }),
        expect.objectContaining({ id: "competitive_advantage" }),
      ]),
      assumptions: expect.any(Array),
      roadmap: expect.any(Array),
    });
    expect(
      forecastedPayload.project.optimizationForecast.dimensions.find(
        (dimension: Record<string, unknown>) =>
          dimension.id === "competitive_advantage",
      )?.summary,
    ).toBe("可核验差异点尚未形成稳定的统一表达。");
    expect(
      forecastedPayload.project.optimizationForecast.targetLow,
    ).toBeGreaterThan(
      forecastedPayload.project.optimizationForecast.currentScore,
    );
    expect(
      JSON.stringify(forecastedPayload.project.optimizationForecast),
    ).not.toContain("当前样本不支持");
    expect(forecastedPayload.project.optimizationForecast).not.toHaveProperty(
      "limitations",
    );
    expect(
      forecastedPayload.project.optimizationForecast.targetLow,
    ).toBeLessThanOrEqual(
      forecastedPayload.project.optimizationForecast.targetExpected,
    );
    expect(
      forecastedPayload.project.optimizationForecast.targetExpected,
    ).toBeLessThanOrEqual(
      forecastedPayload.project.optimizationForecast.targetHigh,
    );
    expect(forecastedPayload.project.optimizationForecast).not.toHaveProperty(
      "output",
    );
    expect(broker.forecastTaskCount).toBe(1);

    const attachments = broker.taskAttachments.at(-1)!;
    expect(attachments.map((attachment) => attachment.filename)).toEqual([
      "geo-optimization-outcome-forecaster.skill.zip",
      "Acme_website_lead_knowledge_base.zip",
      "Acme-current-assessment.json",
      "frontmind-standard-one-month-scenario.json",
    ]);
    const assessmentAttachment = attachments.find((attachment) =>
      attachment.filename.endsWith("-current-assessment.json"),
    )!;
    const scenarioAttachment = attachments.find(
      (attachment) =>
        attachment.filename === "frontmind-standard-one-month-scenario.json",
    )!;
    expect(
      JSON.parse(
        broker.uploads.get(assessmentAttachment.file_id)!.toString("utf8"),
      ),
    ).toMatchObject({ assessment: { overview: { score: 52.5 } } });
    expect(
      JSON.parse(
        broker.uploads.get(scenarioAttachment.file_id)!.toString("utf8"),
      ),
    ).toMatchObject({
      name: "full_execution",
      horizonWeeks: 4,
      allowedActionIds: expect.arrayContaining(["GEO_A3_qa_assets"]),
    });
    expect(broker.prompts.at(-1)).toContain("始终使用 Base 模型");
    expect(broker.prompts.at(-1)).toContain("一个月（4 周）");
    expect(broker.prompts.at(-1)).toContain(
      "不得计算或返回分数、等级、分数增量",
    );

    const repeated = await jsonRequest(
      `/projects/${encodeURIComponent(forecastedPayload.projectToken)}/optimization-forecast`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(repeated.response.status).toBe(200);
    expect(repeated.body).toMatchObject({
      project: { optimizationForecast: { status: "ready" } },
    });
    expect(broker.forecastTaskCount).toBe(1);
  });

  it("retries one invalid optimization forecast output", async () => {
    const ready = await createReadyProject();
    const monitored = await startOnePlatformMonitor(ready);
    const run = broker.monitorRuns.get("monitor-1")!;
    broker.monitorRuns.set("monitor-1", {
      ...run,
      status: "completed",
      completedItems: 5,
      records: Array.from({ length: 5 }, (_, index) =>
        monitorRecord(index + 1, `Acme 回答 ${index + 1}`),
      ),
    });
    broker.completeAssessmentImmediately = true;
    const assessed = await jsonRequest(
      `/projects/${encodeURIComponent(monitored.projectToken)}/assessment`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    const firstForecast = await jsonRequest(
      `/projects/${encodeURIComponent((assessed.body as any).projectToken)}/optimization-forecast`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(firstForecast.response.status).toBe(201);
    expect(broker.forecastTaskCount).toBe(1);
    broker.tasks.set("forecast-1", {
      id: "forecast-1",
      status: "completed",
      output: [{ content: [{ text: '{"assessmentType":"not-a-forecast"}' }] }],
    });

    const retried = await jsonRequest(
      `/projects/${encodeURIComponent((firstForecast.body as any).projectToken)}`,
      ready.cookie,
    );
    expect((retried.body as any).project.optimizationForecast).toMatchObject({
      status: "running",
    });
    expect(retried.response.status).toBe(200);
    expect(broker.forecastTaskCount).toBe(2);
    expect((retried.body as any).project.executionLog.currentEntryId).toBe(
      "optimization-forecast",
    );
    expect(broker.prompts.at(-1)).toContain("唯一一次结构校验重试");
  });

  it("retries one cancelled optimization forecast with an explicit cancellation reason", async () => {
    const ready = await createServiceReadyProject();
    broker.tasks.set(ready.forecastTaskId, {
      id: ready.forecastTaskId,
      status: "cancelled",
      output: [],
    });

    const retried = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
    );

    expect(retried.response.status).toBe(200);
    expect(broker.forecastTaskCount).toBe(2);
    expect(broker.prompts.at(-1)).toContain("唯一一次结构校验重试");
    expect(broker.prompts.at(-1)).toContain("上一次优化效果评估任务已取消");
    const retriedPayload = retried.body as Record<string, any>;
    const retriedValue = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<Record<string, unknown>>(
      retriedPayload.projectToken,
      "project",
    ).value;
    expect(retriedValue).toMatchObject({
      optimizationForecastTaskId: "forecast-2",
      optimizationForecastAttempt: 2,
      previousOptimizationForecastTaskIds: [ready.forecastTaskId],
    });

    const replayed = await jsonRequest(
      `/projects/${encodeURIComponent(retriedPayload.projectToken)}/optimization-forecast`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(replayed.response.status).toBe(200);
    expect(broker.forecastTaskCount).toBe(2);
    broker.tasks.set("forecast-2", {
      id: "forecast-2",
      status: "cancelled",
      output: [],
    });
    const exhaustedView = await jsonRequest(
      `/projects/${encodeURIComponent(retriedPayload.projectToken)}`,
      ready.cookie,
    );
    expect(
      (exhaustedView.body as any).project.optimizationForecastRetryAvailable,
    ).toBe(false);
    const exhausted = await jsonRequest(
      `/projects/${encodeURIComponent(retriedPayload.projectToken)}/optimization-forecast`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(exhausted.response.status).toBe(409);
    expect(exhausted.body).toMatchObject({
      error: { code: "FORECAST_RETRY_EXHAUSTED" },
    });
    expect(broker.forecastTaskCount).toBe(2);
  });

  it("keeps an unrecognized forecast task running without creating a duplicate", async () => {
    const ready = await createServiceReadyProject();
    broker.tasks.set(ready.forecastTaskId, {
      id: ready.forecastTaskId,
      status: "paused",
      output: [],
    });

    const current = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
    );
    expect(current.response.status).toBe(200);
    expect((current.body as any).project.optimizationForecast).toMatchObject({
      status: "running",
    });
    expect(
      (current.body as any).project.optimizationForecastRetryAvailable,
    ).toBe(false);

    const replayed = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/optimization-forecast`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(replayed.response.status).toBe(200);
    expect(broker.forecastTaskCount).toBe(1);
  });

  it("does not create a service payment before both assessment outputs are ready", async () => {
    const ready = await createReadyProject();
    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/services/payments`,
      ready.cookie,
      { method: "POST", body: { method: "alipay" } },
    );

    expect(checkout.response.status).toBe(409);
    expect(checkout.body).toMatchObject({
      error: { code: "SERVICE_ASSESSMENT_REQUIRED" },
    });
    expect(servicePaymentCheckoutCalls).toHaveLength(0);
  });

  it("rejects a forged payable status that has no contract evidence", async () => {
    const ready = await createServiceReadyProject();
    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    const value = codec.open<Record<string, any>>(
      ready.projectToken,
      "project",
    ).value;
    const forgedToken = codec.seal(
      "project",
      {
        ...value,
        serviceQuestionId: ready.question.id,
        serviceCategory: ready.question.category,
        serviceAmountFen: 150_000,
        serviceManualOrderReference: "forged-payable-order",
        serviceManualOrderStatus: "payment_required",
      },
      60 * 60 * 1000,
    );

    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(forgedToken)}/services/payments`,
      ready.cookie,
      { method: "POST", body: { method: "alipay" } },
    );

    expect(checkout.response.status).toBe(409);
    expect(checkout.body).toMatchObject({
      error: { code: "SERVICE_CONTRACT_EVIDENCE_REQUIRED" },
    });
    expect(servicePaymentCheckoutCalls).toHaveLength(0);
  });

  it("validates the contract code, creates one order, and advances it to payment", async () => {
    const ready = await createServiceReadyProject();
    const profile = validServiceContractProfile("深圳星辰科技有限公司");
    const created = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/services/contracts`,
      ready.cookie,
      { method: "POST", body: { profile, contractCode: CONTRACT_AUTH_CODE } },
    );

    expect(created.response.status).toBe(201);
    expect(manualOrderCreateCalls).toHaveLength(1);
    expect(manualOrderExternalAuthorizationCalls).toHaveLength(1);
    expect(manualOrderCreateCalls[0]).toMatchObject({
      project: { companyName: "深圳星辰科技有限公司" },
      contract: { templateVersion: "basic-2026.07-v2", profile },
    });
    expect(adminNotificationCalls).toEqual([
      {
        schemaVersion: 1,
        event: "manual_order_submitted",
        eventId: "geo-manual:manual-order-reference-001:submitted-v1",
        orderReference: "manual-order-reference-001",
        projectId: expect.any(String),
        companyName: "深圳星辰科技有限公司",
        serviceCategory: "product_scenario",
        amountFen: 150_000,
        submittedAt: "2026-07-22T10:12:00.000Z",
      },
    ]);
    for (const value of [
      created.body,
      adminNotificationCalls,
      manualOrderExternalAuthorizationCalls,
    ]) {
      expect(JSON.stringify(value)).not.toContain(CONTRACT_AUTH_CODE);
    }
    expect(JSON.stringify(adminNotificationCalls)).not.toMatch(
      /13800138000|contracts@example\.com|91440300MA5F12345X|科技园一号/,
    );
    expect(created.body).toMatchObject({
      project: {
        companyName: "深圳星辰科技有限公司",
        serviceActivation: {
          status: "payment_required",
          contractWorkflowReference: "manual-order-reference-001",
          manualOrderStatus: "payment_required",
          contractAuthorizationMode: "external_wechat",
        },
      },
    });
    const forgedStatus = await jsonRequest(
      `/projects/${encodeURIComponent((created.body as any).projectToken)}/services/contracts/status`,
      ready.cookie,
      {
        method: "POST",
        body: { status: "payment_required", paidAt: new Date().toISOString() },
      },
    );
    expect(forgedStatus.response.status).toBe(400);
    expect(manualOrderStatusReads).toHaveLength(0);

    const replayed = await jsonRequest(
      `/projects/${encodeURIComponent((created.body as any).projectToken)}/services/contracts`,
      ready.cookie,
      { method: "POST", body: { profile, contractCode: CONTRACT_AUTH_CODE } },
    );
    expect(replayed.response.status).toBe(200);
    expect(manualOrderCreateCalls).toHaveLength(1);
    expect(manualOrderStatusReads).toEqual(["manual-order-reference-001"]);
    expect(adminNotificationCalls).toHaveLength(1);

    const decoded = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<Record<string, unknown>>(
      (replayed.body as any).projectToken,
      "project",
    ).value;
    expect(decoded.companyName).toBe("深圳星辰科技有限公司");
    expect(JSON.stringify(decoded)).not.toContain(CONTRACT_AUTH_CODE);
    expect(JSON.stringify(decoded)).not.toMatch(
      /13800138000|contracts@example\.com|91440300MA5F12345X|科技园一号/,
    );

    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent((replayed.body as any).projectToken)}/services/payments`,
      ready.cookie,
      { method: "POST", body: { method: "alipay" } },
    );
    expect(checkout.response.status).toBe(201);
    expect(servicePaymentCheckoutCalls).toHaveLength(1);
  });

  it("clears legacy electronic-signing fields when a historical order is authorized in WeChat", async () => {
    const ready = await createServiceReadyProject();
    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    const stored = codec.open<Record<string, any>>(
      ready.projectToken,
      "project",
    ).value;
    const historicalToken = codec.seal(
      "project",
      {
        ...stored,
        serviceManualOrderReference: "manual-order-reference-001",
        serviceManualOrderStatus: "signature_required",
        serviceManualContractId: "legacy-electronic-contract",
        serviceManualSigningUrl: "https://sign.example.com/legacy-contract",
        serviceManualSignedAt: "2026-07-22T10:10:00.000Z",
      },
      60 * 60 * 1000,
    );
    manualOrderResponse = {
      ...manualOrderResponse,
      order: {
        ...manualOrderResponse.order,
        projectId: stored.projectId,
        status: "signature_required",
        contractId: "legacy-electronic-contract",
        signingUrl: "https://sign.example.com/legacy-contract",
        signedAt: "2026-07-22T10:10:00.000Z",
      },
    };

    const result = await jsonRequest(
      `/projects/${encodeURIComponent(historicalToken)}/services/contracts`,
      ready.cookie,
      {
        method: "POST",
        body: {
          profile: validServiceContractProfile(),
          contractCode: CONTRACT_AUTH_CODE,
        },
      },
    );
    expect(result.response.status).toBe(200);
    const activation = (result.body as any).project.serviceActivation;
    expect(activation).toMatchObject({
      status: "payment_required",
      manualOrderStatus: "payment_required",
      contractAuthorizationMode: "external_wechat",
    });
    expect(activation).not.toHaveProperty("contractId");
    expect(activation).not.toHaveProperty("signingUrl");
    expect(activation).not.toHaveProperty("signedAt");
    const refreshed = codec.open<Record<string, unknown>>(
      (result.body as any).projectToken,
      "project",
    ).value;
    expect(refreshed).not.toHaveProperty("serviceManualContractId");
    expect(refreshed).not.toHaveProperty("serviceManualSigningUrl");
    expect(refreshed).not.toHaveProperty("serviceManualSignedAt");
  });

  it("rejects an invalid contract code before creating an order", async () => {
    const ready = await createServiceReadyProject();
    const result = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/services/contracts`,
      ready.cookie,
      {
        method: "POST",
        body: {
          profile: validServiceContractProfile(),
          contractCode: "incorrect-contract-code",
        },
      },
    );
    expect(result.response.status).toBe(403);
    expect(result.body).toEqual({
      ok: false,
      error: {
        code: "CONTRACT_CODE_INVALID",
        message: "合同码不正确，请联系管理员确认",
      },
    });
    expect(manualOrderCreateCalls).toHaveLength(0);
    expect(manualOrderExternalAuthorizationCalls).toHaveLength(0);
    expect(JSON.stringify(result.body)).not.toContain(
      "incorrect-contract-code",
    );
  });

  it("limits five failed contract codes for one session and project without blocking another", async () => {
    const limited = await createServiceReadyProject();
    const isolated = await createServiceReadyProject();
    const request = (projectToken: string, cookie: string) =>
      jsonRequest(
        `/projects/${encodeURIComponent(projectToken)}/services/contracts`,
        cookie,
        {
          method: "POST",
          body: {
            profile: validServiceContractProfile(),
            contractCode: "incorrect-contract-code",
          },
        },
      );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const failed = await request(limited.projectToken, limited.cookie);
      expect(failed.response.status).toBe(403);
    }
    const throttled = await request(limited.projectToken, limited.cookie);
    expect(throttled.response.status).toBe(429);
    expect(
      Number(throttled.response.headers.get("retry-after")),
    ).toBeGreaterThan(0);
    expect(
      Number(throttled.response.headers.get("retry-after")),
    ).toBeLessThanOrEqual(15 * 60);

    const isolatedFailure = await request(
      isolated.projectToken,
      isolated.cookie,
    );
    expect(isolatedFailure.response.status).toBe(403);
    expect(manualOrderCreateCalls).toHaveLength(0);
  });

  it.each([
    ["仍为待管理员状态", { status: "pending_admin" as const }],
    ["仍为待签署状态", { status: "signature_required" as const }],
    ["缺少授权方式", { contractAuthorizationMode: undefined }],
    ["缺少授权时间", { contractAuthorizedAt: undefined }],
    ["授权时间无效", { contractAuthorizedAt: "not-a-date" }],
  ])(
    "fails closed when Dashboard contract confirmation %s",
    async (_label, override) => {
      const ready = await createServiceReadyProject();
      manualOrderExternalAuthorizationOverride = override;
      const result = await jsonRequest(
        `/projects/${encodeURIComponent(ready.projectToken)}/services/contracts`,
        ready.cookie,
        {
          method: "POST",
          body: {
            profile: validServiceContractProfile(),
            contractCode: CONTRACT_AUTH_CODE,
          },
        },
      );
      expect(result.response.status).toBe(502);
      expect(result.body).toMatchObject({
        ok: false,
        error: { code: "MANUAL_ORDER_EXTERNAL_CONTRACT_INCOMPLETE" },
      });
      expect(result.body).not.toHaveProperty("projectToken");
      expect(adminNotificationCalls).toHaveLength(0);
    },
  );

  it("does not block an order when the administrator alert fails and retries it idempotently", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      adminNotificationShouldFail = true;
      const ready = await createServiceReadyProject();
      const profile = validServiceContractProfile();
      const created = await jsonRequest(
        `/projects/${encodeURIComponent(ready.projectToken)}/services/contracts`,
        ready.cookie,
        {
          method: "POST",
          body: { profile, contractCode: CONTRACT_AUTH_CODE },
        },
      );

      expect(created.response.status).toBe(201);
      expect(adminNotificationCalls).toHaveLength(1);
      expect(warn).toHaveBeenCalledWith(
        "[GEO admin notification] Delivery failed for geo-manual:manual-order-reference-001:submitted-v1",
      );

      adminNotificationShouldFail = false;
      const retried = await jsonRequest(
        `/projects/${encodeURIComponent((created.body as any).projectToken)}/services/contracts`,
        ready.cookie,
        {
          method: "POST",
          body: { profile, contractCode: CONTRACT_AUTH_CODE },
        },
      );

      expect(retried.response.status).toBe(200);
      expect(adminNotificationCalls).toHaveLength(2);
      expect(adminNotificationCalls[1].eventId).toBe(
        adminNotificationCalls[0].eventId,
      );
      const decoded = new GeoTokenCodec(
        "test-session-secret-at-least-16-characters",
      ).open<Record<string, unknown>>(
        (retried.body as any).projectToken,
        "project",
      ).value;
      expect(decoded.serviceAdminNotificationDeliveredAt).toEqual(
        expect.any(String),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it.each([
    ["product-scenario-01", "product_scenario", 150_000],
    ["reputation-01", "reputation", 200_000],
    ["competitor-comparison-01", "competitor_comparison", 200_000],
  ] as const)(
    "derives the %s monthly service price on the server",
    async (questionId, category, expectedAmountFen) => {
      const ready = await createServiceReadyProject(questionId);
      expect(ready.project.serviceActivation).toMatchObject({
        status: "not_started",
        questionId,
        category,
        amountFen: expectedAmountFen,
        billingMonths: 1,
      });
      if (category === "reputation") {
        expect(ready.project.assessment).toMatchObject({
          totalScore: 52.5,
          schemaVersion: 2,
        });
        expect(ready.project.optimizationForecast).toMatchObject({
          currentScore: 52.5,
          schemaVersion: 2,
        });
        expect(ready.project.optimizationForecast).not.toHaveProperty(
          "rawCurrentScore",
        );
        expect(ready.project.optimizationForecast).not.toHaveProperty(
          "scoreBasis",
        );
        const competitiveForecast =
          ready.project.optimizationForecast.dimensions.find(
            (dimension: Record<string, unknown>) =>
              dimension.id === "competitive_advantage",
          );
        expect(competitiveForecast.targetLow).toBeGreaterThan(
          competitiveForecast.currentScore,
        );
        expect(competitiveForecast.targetHigh).toBeGreaterThan(
          competitiveForecast.targetLow,
        );
      }
      const payable = await advanceManualOrder(ready);

      const checkout = await jsonRequest(
        `/projects/${encodeURIComponent(payable.projectToken)}/services/payments`,
        payable.cookie,
        {
          method: "POST",
          body: { method: "alipay" },
        },
      );

      expect(checkout.response.status).toBe(201);
      expect(checkout.body).toMatchObject({
        payment: {
          purchaseType: "service",
          questionId,
          category,
          amountFen: expectedAmountFen,
          unitPriceFen: expectedAmountFen,
          billingMonths: 1,
          fields: {
            type: "alipay",
            money: (expectedAmountFen / 100).toFixed(2),
          },
        },
      });
      expect(servicePaymentCheckoutCalls).toHaveLength(1);
      expect(servicePaymentCheckoutCalls[0]).toMatchObject({
        projectId: expect.any(String),
        ownerSessionId: expect.any(String),
        questionId,
        category,
        expectedAmountFen,
        method: "alipay",
      });
    },
  );

  it("locks one signed service cycle to one order and confirms payment idempotently", async () => {
    const ready = await createServiceReadyProject();
    const payable = await advanceManualOrder(ready);
    const pathname = `/projects/${encodeURIComponent(payable.projectToken)}/services/payments`;
    const created = await jsonRequest(pathname, payable.cookie, {
      method: "POST",
      body: { method: "alipay" },
    });
    const replayed = await jsonRequest(pathname, payable.cookie, {
      method: "POST",
      body: { method: "alipay" },
    });
    const switchedMethod = await jsonRequest(pathname, payable.cookie, {
      method: "POST",
      body: { method: "wxpay" },
    });

    expect(created.response.status).toBe(201);
    expect(replayed.response.status).toBe(200);
    expect((replayed.body as any).payment.orderId).toBe(
      (created.body as any).payment.orderId,
    );
    expect(switchedMethod.response.status).toBe(409);
    expect(switchedMethod.body).toMatchObject({
      error: { code: "SERVICE_PAYMENT_METHOD_LOCKED" },
    });
    expect(servicePaymentCheckoutCalls).toHaveLength(1);

    const authorization = (created.body as any).payment.authorization as string;
    paymentAccepted = false;
    const pending = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments/status`,
      payable.cookie,
      {
        method: "POST",
        body: { authorization },
      },
    );
    expect(pending.response.status).toBe(200);
    expect(pending.body).toMatchObject({
      payment: {
        status: "pending",
        amountFen: 150_000,
      },
    });
    expect(servicePaymentStatusCalls[0]).toMatchObject({
      questionId: "product-scenario-01",
      category: "product_scenario",
      expectedAmountFen: 150_000,
    });

    const unpaidStart = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/start`,
      payable.cookie,
      {
        method: "POST",
        body: { authorization },
      },
    );
    expect(unpaidStart.response.status).toBe(402);
    expect(servicePaymentCalls).toHaveLength(1);

    paymentAccepted = true;
    const started = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/start`,
      payable.cookie,
      {
        method: "POST",
        body: { authorization },
      },
    );
    expect(started.response.status).toBe(201);
    expect(started.body).toMatchObject({
      project: {
        stage: "service_activation",
        serviceActivation: {
          status: "account_setup_required",
          category: "product_scenario",
          amountFen: 150_000,
          billingMonths: 1,
          questionId: "product-scenario-01",
          orderId: "zpay-service-order-001",
          paidAt: servicePaymentPaidAt,
        },
      },
    });
    const startedPayload = started.body as Record<string, any>;
    const repeatedStart = await jsonRequest(
      `/projects/${encodeURIComponent(startedPayload.projectToken)}/services/start`,
      payable.cookie,
      {
        method: "POST",
        body: { authorization },
      },
    );
    expect(repeatedStart.response.status).toBe(200);
    expect(repeatedStart.body).toMatchObject({
      project: {
        stage: "service_activation",
        serviceActivation: { status: "account_setup_required" },
      },
    });
    expect(servicePaymentCalls).toHaveLength(2);
  });

  it("blocks deletion after service payment until fulfillment or an explicit non-retryable terminal failure", async () => {
    const ready = await createServiceReadyProject();
    const payable = await advanceManualOrder(ready);
    const paymentRequiredDelete = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}`,
      payable.cookie,
      { method: "DELETE" },
    );
    expect(paymentRequiredDelete.response.status).toBe(409);
    expect(paymentRequiredDelete.body).toMatchObject({
      error: { code: "PROJECT_ORDER_DELETE_BLOCKED" },
    });

    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments`,
      payable.cookie,
      { method: "POST", body: { method: "alipay" } },
    );
    const started = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/start`,
      payable.cookie,
      {
        method: "POST",
        body: {
          authorization: (checkout.body as any).payment.authorization,
        },
      },
    );
    expect(started.response.status).toBe(201);
    const startedPayload = started.body as Record<string, any>;

    const paidUnfulfilledDelete = await jsonRequest(
      `/projects/${encodeURIComponent(startedPayload.projectToken)}`,
      payable.cookie,
      { method: "DELETE" },
    );
    expect(paidUnfulfilledDelete.response.status).toBe(409);
    expect(paidUnfulfilledDelete.body).toMatchObject({
      ok: false,
      error: { code: "PROJECT_ORDER_DELETE_BLOCKED" },
    });

    manualOrderResponse = {
      ...manualOrderResponse,
      order: {
        ...manualOrderResponse.order,
        status: "failed",
        retryable: false,
        message: "订单已明确终止，无需后续人工处理",
        updatedAt: "2026-07-22T10:30:00.000Z",
      },
    };
    const terminal = await jsonRequest(
      `/projects/${encodeURIComponent(startedPayload.projectToken)}/services/contracts/status`,
      payable.cookie,
      { method: "POST", body: {} },
    );
    expect(terminal.response.status).toBe(200);

    const terminalDelete = await jsonRequest(
      `/projects/${encodeURIComponent((terminal.body as any).projectToken)}`,
      payable.cookie,
      { method: "DELETE" },
    );
    expect(terminalDelete.response.status).toBe(200);
    expect(terminalDelete.body).toMatchObject({ ok: true });
  });

  it("allows deletion after a paid service is fully activated and its knowledge base is ready", async () => {
    const ready = await createServiceReadyProject();
    const payable = await advanceManualOrder(ready);
    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments`,
      payable.cookie,
      { method: "POST", body: { method: "alipay" } },
    );
    const started = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/start`,
      payable.cookie,
      {
        method: "POST",
        body: {
          authorization: (checkout.body as any).payment.authorization,
        },
      },
    );
    const activated = await jsonRequest(
      `/projects/${encodeURIComponent((started.body as any).projectToken)}/services/account`,
      payable.cookie,
      {
        method: "POST",
        body: {
          displayName: "Acme",
          username: "acme.geo",
          password: "StrongPassword123",
        },
      },
    );
    expect(activated.response.status).toBe(201);
    expect(activated.body).toMatchObject({
      project: {
        serviceActivation: {
          status: "active",
          knowledgeImport: { status: "ready" },
        },
      },
    });

    const removed = await jsonRequest(
      `/projects/${encodeURIComponent((activated.body as any).projectToken)}`,
      payable.cookie,
      { method: "DELETE" },
    );
    expect(removed.response.status).toBe(200);
    expect(removed.body).toMatchObject({ ok: true });
  });

  it("blocks service checkout before charging when no public workspace URL is ready", async () => {
    const ready = await createServiceReadyProject();
    const payable = await advanceManualOrder(ready);
    broker.publicUrlConfigured = false;

    const response = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments`,
      payable.cookie,
      { method: "POST", body: { method: "alipay" } },
    );

    expect(response.response.status).toBe(503);
    expect(response.body).toMatchObject({
      error: { code: "SERVICE_WORKSPACE_NOT_READY" },
    });
    expect(servicePaymentCheckoutCalls).toHaveLength(0);
  });

  it("accepts customer credentials only after manual-order payment and never seals the password", async () => {
    const ready = await createServiceReadyProject();
    const payable = await advanceManualOrder(ready);
    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments`,
      payable.cookie,
      { method: "POST", body: { method: "alipay" } },
    );
    const started = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/start`,
      payable.cookie,
      {
        method: "POST",
        body: {
          authorization: (checkout.body as any).payment.authorization,
        },
      },
    );
    const attempted = await jsonRequest(
      `/projects/${encodeURIComponent((started.body as any).projectToken)}/services/account`,
      payable.cookie,
      {
        method: "POST",
        body: {
          displayName: "Acme",
          username: "acme.geo",
          password: "StrongPassword123",
          role: "admin",
        },
      },
    );

    expect(attempted.response.status).toBe(400);
    const password = "StrongPassword123";
    const validAttempt = await jsonRequest(
      `/projects/${encodeURIComponent((started.body as any).projectToken)}/services/account`,
      payable.cookie,
      {
        method: "POST",
        body: {
          displayName: "Acme",
          username: "acme.geo",
          password,
        },
      },
    );
    expect(validAttempt.response.status).toBe(201);
    expect(validAttempt.body).toMatchObject({
      project: {
        serviceActivation: {
          status: "active",
          manualOrderStatus: "active",
          accountMode: "create",
          accountUsername: "acme.geo",
          accountDisplayName: "Acme",
          workspaceUrl: "https://dashboard.frontmind.net/",
          knowledgeImport: { status: "ready" },
        },
      },
    });
    expect(manualOrderAccountCalls).toHaveLength(1);
    expect(manualOrderAccountCalls[0]).toMatchObject({
      reference: "manual-order-reference-001",
      request: {
        schemaVersion: 1,
        account: {
          mode: "create",
          displayName: "Acme",
          username: "acme.geo",
          password,
        },
      },
    });
    expect(accountProvisionCalls).toHaveLength(0);
    expect(JSON.stringify(validAttempt.body)).not.toContain(password);
    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    const stored = codec.open<Record<string, unknown>>(
      (validAttempt.body as any).projectToken,
      "project",
    ).value;
    expect(JSON.stringify(stored)).not.toContain(password);

    const replayed = await jsonRequest(
      `/projects/${encodeURIComponent((validAttempt.body as any).projectToken)}/services/account`,
      payable.cookie,
      {
        method: "POST",
        body: {
          displayName: "Acme",
          username: "acme.geo",
          password,
        },
      },
    );
    expect(replayed.response.status).toBe(200);
    expect(manualOrderAccountCalls).toHaveLength(2);

    const conflictingReplay = await jsonRequest(
      `/projects/${encodeURIComponent((validAttempt.body as any).projectToken)}/services/account`,
      payable.cookie,
      {
        method: "POST",
        body: {
          displayName: "Acme",
          username: "acme.geo",
          password: "DifferentPassword123",
        },
      },
    );
    expect(conflictingReplay.response.status).toBe(409);
    expect(conflictingReplay.body).toMatchObject({
      error: { code: "IDEMPOTENCY_CONFLICT" },
    });
    expect(manualOrderAccountCalls).toHaveLength(2);
  });

  it("does not forward manual-order credentials before verified payment", async () => {
    const ready = await createServiceReadyProject();
    const created = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/services/contracts`,
      ready.cookie,
      {
        method: "POST",
        body: {
          profile: validServiceContractProfile(),
          contractCode: CONTRACT_AUTH_CODE,
        },
      },
    );
    const attempted = await jsonRequest(
      `/projects/${encodeURIComponent((created.body as any).projectToken)}/services/account`,
      ready.cookie,
      {
        method: "POST",
        body: {
          displayName: "Acme",
          username: "acme.geo",
          password: "StrongPassword123",
        },
      },
    );

    expect(attempted.response.status).toBe(409);
    expect(attempted.body).toMatchObject({
      error: { code: "SERVICE_PAYMENT_REQUIRED" },
    });
    expect(manualOrderAccountCalls).toHaveLength(0);
  });

  it("fails closed when the account service does not activate immediately", async () => {
    const ready = await createServiceReadyProject();
    const payable = await advanceManualOrder(ready);
    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments`,
      payable.cookie,
      { method: "POST", body: { method: "alipay" } },
    );
    const started = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/start`,
      payable.cookie,
      {
        method: "POST",
        body: {
          authorization: (checkout.body as any).payment.authorization,
        },
      },
    );
    manualOrderAccountShouldRemainPending = true;
    const submitted = await jsonRequest(
      `/projects/${encodeURIComponent((started.body as any).projectToken)}/services/account`,
      payable.cookie,
      {
        method: "POST",
        body: {
          displayName: "Acme",
          username: "acme.geo",
          password: "StrongPassword123",
        },
      },
    );

    expect(submitted.response.status).toBe(502);
    expect(submitted.body).toMatchObject({
      error: {
        code: "MANUAL_ORDER_ACCOUNT_ACTIVATION_INCOMPLETE",
      },
    });
    expect(knowledgeImportCalls).toHaveLength(0);
  });

  it("hands off the knowledge base and becomes active when the customer submits an account", async () => {
    const ready = await createServiceReadyProject();
    const payable = await advanceManualOrder(ready);
    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments`,
      payable.cookie,
      { method: "POST", body: { method: "alipay" } },
    );
    const started = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/start`,
      payable.cookie,
      {
        method: "POST",
        body: {
          authorization: (checkout.body as any).payment.authorization,
        },
      },
    );
    expect(started.body).toMatchObject({
      project: {
        serviceActivation: {
          status: "account_setup_required",
          manualOrderStatus: "account_setup_required",
        },
      },
    });
    expect((started.body as any).project.serviceActivation).not.toHaveProperty(
      "contractId",
    );
    expect(knowledgeImportCalls).toHaveLength(0);

    const accountSubmitted = await jsonRequest(
      `/projects/${encodeURIComponent((started.body as any).projectToken)}/services/account`,
      payable.cookie,
      {
        method: "POST",
        body: {
          displayName: "Acme",
          username: "geo.acme",
          password: "StrongPassword123",
        },
      },
    );
    expect(accountSubmitted.body).toMatchObject({
      project: {
        serviceActivation: {
          status: "active",
          manualOrderStatus: "active",
          workspaceUrl: "https://dashboard.frontmind.net/",
          knowledgeImport: { status: "ready" },
        },
      },
    });
    const active = accountSubmitted;
    expect(knowledgeImportCalls).toHaveLength(1);
    expect(knowledgeImportCalls[0]).toMatchObject({
      request: {
        schemaVersion: 4,
        companyName: "Acme",
        candidate: {
          taskId: "kb-1",
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
        finalArtifact: {
          filename: "Acme_website_lead_knowledge_base.zip",
          archiveContractVersion: 3,
          validationProfile: "website-lead-v1",
          packageManifestSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          finalizerVersion: "website-kb-finalizer-v1",
        },
      },
    });
    const accountPoll = await jsonRequest(
      `/projects/${encodeURIComponent((active.body as any).projectToken)}/services/account/status`,
      payable.cookie,
      { method: "POST", body: {} },
    );
    expect(accountPoll.body).toMatchObject({
      project: { serviceActivation: { status: "active" } },
    });
    expect(knowledgeImportCalls).toHaveLength(1);
  });

  it("forwards an existing-account purchase intent once without storing it in the project token", async () => {
    const ready = await createServiceReadyProject();
    const payable = await advanceManualOrder(ready);
    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/payments`,
      payable.cookie,
      { method: "POST", body: { method: "alipay" } },
    );
    const purchaseIntent = "one-time-purchase-intent-001";
    const authorization = (checkout.body as any).payment.authorization;
    const started = await jsonRequest(
      `/projects/${encodeURIComponent(payable.projectToken)}/services/start`,
      payable.cookie,
      {
        method: "POST",
        body: { authorization, schemaVersion: 2, purchaseIntent },
      },
    );

    expect(started.response.status).toBe(201);
    expect(started.body).toMatchObject({
      project: {
        serviceActivation: {
          status: "active",
          manualOrderStatus: "active",
          accountMode: "bind_existing",
          accountUsername: "existing.user",
          workspaceUrl: "https://dashboard.frontmind.net/",
          knowledgeImport: { status: "ready" },
        },
      },
    });
    expect(manualOrderPaymentCalls).toHaveLength(1);
    expect(manualOrderPaymentCalls[0]).toMatchObject({
      reference: "manual-order-reference-001",
      request: {
        payment: {
          orderId: "zpay-service-order-001",
          amountFen: 150_000,
        },
      },
    });
    expect(
      Object.prototype.hasOwnProperty.call(
        manualOrderPaymentCalls[0].request,
        "account",
      ),
    ).toBe(false);
    expect(manualOrderAccountCalls).toHaveLength(1);
    expect(manualOrderAccountCalls[0]).toMatchObject({
      reference: "manual-order-reference-001",
      request: {
        account: { mode: "bind_existing", purchaseIntent },
      },
    });
    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    const stored = codec.open<Record<string, unknown>>(
      (started.body as any).projectToken,
      "project",
    ).value;
    expect(JSON.stringify(stored)).not.toContain(purchaseIntent);
    expect(stored.serviceAccountMode).toBe("bind_existing");

    const replayed = await jsonRequest(
      `/projects/${encodeURIComponent((started.body as any).projectToken)}/services/start`,
      payable.cookie,
      {
        method: "POST",
        body: { authorization, schemaVersion: 2, purchaseIntent },
      },
    );
    expect(replayed.response.status).toBe(200);
    expect(manualOrderPaymentCalls).toHaveLength(1);
    expect(manualOrderAccountCalls).toHaveLength(1);
  });

  it.each(["assessment", "forecast"] as const)(
    "rejects service payment when the completed %s output is malformed",
    async (kind) => {
      const ready = await createServiceReadyProject();
      const taskId =
        kind === "assessment" ? ready.assessmentTaskId : ready.forecastTaskId;
      broker.tasks.set(taskId, {
        id: taskId,
        status: "completed",
        output: [{ content: [{ text: "{}" }] }],
      });

      const checkout = await jsonRequest(
        `/projects/${encodeURIComponent(ready.projectToken)}/services/payments`,
        ready.cookie,
        { method: "POST", body: { method: "alipay" } },
      );
      expect(checkout.response.status).toBe(409);
      expect(checkout.body).toMatchObject({
        error: { code: "SERVICE_ASSESSMENT_INVALID" },
      });
      expect(servicePaymentCheckoutCalls).toHaveLength(0);
    },
  );

  it("rejects industry-ranking service purchases before creating an order", async () => {
    const ready = await createServiceReadyProject();
    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    const project = codec.open<Record<string, unknown>>(
      ready.projectToken,
      "project",
    ).value;
    const industryToken = codec.seal(
      "project",
      { ...project, monitorQuestionId: "industry-ranking-01" },
      60 * 60 * 1000,
    );
    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(industryToken)}/services/payments`,
      ready.cookie,
      { method: "POST", body: { method: "alipay" } },
    );

    expect(checkout.response.status).toBe(403);
    expect(checkout.body).toMatchObject({
      error: { code: "QUESTION_NOT_SELECTABLE" },
    });
    expect(servicePaymentCheckoutCalls).toHaveLength(0);
  });

  it("keeps one Pro question task after a transient result read failure", async () => {
    const ready = await createReadyProject();
    broker.tasks.set("question-1", {
      id: "question-1",
      status: "completed",
      output: [],
    });
    broker.taskResultErrors.set(
      "question-1",
      new GeoBrokerError(
        "result is not readable yet",
        425,
        "AGENT_REQUEST_FAILED",
      ),
    );

    const unavailable = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/questions`,
      ready.cookie,
      { method: "POST", body: {} },
    );

    expect(unavailable.response.status).toBe(502);
    expect(unavailable.body).toMatchObject({
      error: { code: "TASK_RESULT_TEMPORARILY_UNAVAILABLE" },
    });
    expect(broker.questionTaskCount).toBe(1);
    expect(broker.prompts).toHaveLength(2);
    expect(broker.taskAgentProfiles.at(-1)).toBe(FRONTMIND_PRO_PROFILE);

    broker.taskResultErrors.delete("question-1");
    broker.taskResults.set("question-1", {
      id: "question-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify({ questions: [] }) }],
        },
      ],
    });
    const structurallyInvalid = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/questions`,
      ready.cookie,
      { method: "POST", body: {} },
    );

    expect(structurallyInvalid.response.status).toBe(200);
    expect(structurallyInvalid.body).toMatchObject({
      project: {
        status: "failed",
        questionRetryAvailable: false,
        questionValidationError: "推荐任务未返回可展示的问题，请联系技术支持",
      },
    });
    expect(broker.questionTaskCount).toBe(1);
    expect(broker.prompts).toHaveLength(2);
  });

  it("publishes renderable recommendations when only quality checks fail", async () => {
    const ready = await createReadyProject();
    const relaxed = validQuestionSet() as Record<string, any>;
    relaxed.questions[5].question =
      "Acme 服务模块 1 所在行业 Top 10 服务商有哪些？";
    relaxed.questions[5].selectable = true;
    delete relaxed.questions[15].competitorAnchor;
    delete relaxed.questions[15].rationale;
    delete relaxed.questions[15].evidenceRefs;
    relaxed.questions[16].id = relaxed.questions[15].id;

    broker.tasks.set("question-1", {
      id: "question-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [{ text: JSON.stringify(relaxed) }],
        },
      ],
    });

    const refreshed = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
    );
    const project = (refreshed.body as Record<string, any>).project;

    expect(refreshed.response.status).toBe(200);
    expect(project).toMatchObject({
      status: "completed",
      stage: "question_recommendation",
    });
    expect(project.questions).toHaveLength(20);
    expect(project.questionValidationError).toBeUndefined();
    expect(new Set(project.questions.map((item: any) => item.id)).size).toBe(
      20,
    );
    expect(project.questions[5]).toMatchObject({
      category: "industry_ranking",
      selectable: false,
    });
    expect(broker.questionTaskCount).toBe(1);
  });

  it("completes the first recommendation request with a partial question set", async () => {
    broker.questionTaskOutput = {
      questions: [
        {
          id: "reputation-01",
          category: "reputation",
          question: "Acme 靠谱吗？",
        },
        {
          id: "product-scenario-01",
          category: "product_scenario",
          question: "Acme 的企业知识库适合哪些使用场景？",
        },
        {
          id: "competitor-comparison-01",
          category: "competitor_comparison",
          question: "Acme 和 BetaCloud 方案相比有什么区别？",
        },
      ],
    };
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    const initialProject = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ knowledgeBaseTaskId: string }>(
      initial.projectToken,
      "project",
    ).value;
    broker.tasks.set(initialProject.knowledgeBaseTaskId, {
      id: initialProject.knowledgeBaseTaskId,
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            {
              type: "output_file",
              file_id: "archive-1",
              filename: "Acme.zip",
            },
          ],
        },
      ],
    });

    const recommended = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}/questions`,
      cookie,
      { method: "POST", body: {} },
    );
    const project = (recommended.body as Record<string, any>).project;

    expect(recommended.response.status).toBe(201);
    expect(project).toMatchObject({
      status: "completed",
      stage: "question_recommendation",
    });
    expect(project.questions).toHaveLength(3);
    expect(project.questionValidationError).toBeUndefined();
    expect(
      project.questions.every((question: any) => question.selectable),
    ).toBe(true);
    expect(broker.questionTaskCount).toBe(1);

    const projectToken = (recommended.body as Record<string, any>)
      .projectToken as string;
    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(projectToken)}/payments`,
      cookie,
      {
        method: "POST",
        body: {
          questionId: "product-scenario-01",
          platformIds: ["doubao"],
          method: "alipay",
        },
      },
    );
    expect(checkout.response.status).toBe(201);

    const monitoring = await jsonRequest(
      `/projects/${encodeURIComponent(projectToken)}/monitoring`,
      cookie,
      {
        method: "POST",
        body: {
          questionId: "product-scenario-01",
          platformIds: ["doubao"],
          paymentAuthorization: (checkout.body as any).payment.authorization,
        },
      },
    );
    expect(monitoring.response.status).toBe(201);
    expect(monitoring.body).toMatchObject({
      project: {
        selectedQuestionId: "product-scenario-01",
        monitoring: { status: "submitted", expectedRecords: 5 },
      },
    });
  });

  it("never creates a second task for an invalid question result", async () => {
    broker.invalidFirstQuestionTask = true;
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "completed",
      output: [
        {
          role: "assistant",
          content: [
            { type: "output_file", file_id: "archive-1", filename: "Acme.zip" },
          ],
        },
      ],
    });

    const firstQuestions = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}/questions`,
      cookie,
      { method: "POST", body: {} },
    );
    const firstPayload = firstQuestions.body as Record<string, any>;
    expect(firstPayload.project.questionValidationError).toBeTruthy();

    const readOnlyPoll = await jsonRequest(
      `/projects/${encodeURIComponent(firstPayload.projectToken)}`,
      cookie,
    );
    const readOnlyPayload = readOnlyPoll.body as Record<string, any>;
    expect(readOnlyPayload.project.questionValidationError).toBeTruthy();
    expect(broker.questionTaskCount).toBe(1);

    const replayed = await jsonRequest(
      `/projects/${encodeURIComponent(firstPayload.projectToken)}/questions`,
      cookie,
      { method: "POST", body: {} },
    );
    expect(replayed.response.status).toBe(200);
    expect(replayed.body).toMatchObject({
      project: {
        status: "failed",
        questionRetryAvailable: false,
      },
    });
    expect(broker.questionTaskCount).toBe(1);
    expect(broker.taskAgentProfiles).toEqual([
      FRONTMIND_BASE_PROFILE,
      FRONTMIND_PRO_PROFILE,
    ]);
  });

  it("does not retry a cancelled question task", async () => {
    const ready = await createReadyProject();
    broker.tasks.set("question-1", {
      id: "question-1",
      status: "cancelled",
      output: [],
    });

    const replayed = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/questions`,
      ready.cookie,
      { method: "POST", body: {} },
    );

    expect(replayed.response.status).toBe(200);
    expect(replayed.body).toMatchObject({
      project: {
        status: "failed",
        questionRetryAvailable: false,
      },
    });
    expect(broker.questionTaskCount).toBe(1);
  });

  it("keeps a create response without status waiting and reuses the original task", async () => {
    broker.omitNextKnowledgeTaskStatus = true;
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;

    expect(initial.project).toMatchObject({
      status: "running",
      knowledgeBaseSupportRequired: false,
      kbTask: { status: "running" },
      executionLog: {
        entries: [
          expect.objectContaining({
            id: "enterprise-analysis",
            status: "waiting",
            startedAt: expect.any(String),
          }),
        ],
      },
    });
    expect(broker.prompts).toHaveLength(1);

    const refreshed = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}`,
      cookie,
    );
    expect(refreshed.response.status).toBe(200);
    expect((refreshed.body as any).project.status).toBe("running");
    expect(broker.prompts).toHaveLength(1);
  });

  it("keeps unrecognized knowledge-base and question states waiting without duplicating tasks", async () => {
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "paused",
      output: [],
    });

    const unknownKnowledgeBase = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}`,
      cookie,
    );
    expect((unknownKnowledgeBase.body as any).project).toMatchObject({
      status: "running",
      knowledgeBaseSupportRequired: false,
      kbTask: {
        status: "running",
      },
      executionLog: {
        entries: [
          expect.objectContaining({
            id: "enterprise-analysis",
            status: "waiting",
          }),
        ],
      },
    });
    const knowledgeBaseReplay = await jsonRequest(
      `/projects/${encodeURIComponent(initial.projectToken)}/retry`,
      cookie,
      { method: "POST", body: { input: "Acme", attachments: [] } },
    );
    expect(knowledgeBaseReplay.response.status).toBe(404);
    expect(broker.prompts).toHaveLength(1);

    const ready = await createReadyProject();
    const readyProject = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    ).open<{ questionTaskId: string }>(ready.projectToken, "project").value;
    broker.tasks.set(readyProject.questionTaskId, {
      id: readyProject.questionTaskId,
      status: "paused",
      output: [],
    });
    const unknownQuestion = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}`,
      ready.cookie,
    );
    expect((unknownQuestion.body as any).project).toMatchObject({
      status: "running",
      questionRetryAvailable: false,
      questionTask: {
        status: "running",
      },
    });
    const questionReplay = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/questions`,
      ready.cookie,
      { method: "POST", body: {} },
    );
    expect(questionReplay.response.status).toBe(200);
    expect(broker.questionTaskCount).toBe(1);
  });

  it("offers support after 15 minutes of unknown state while remaining non-terminal", async () => {
    const { cookie } = await verifyInvite();
    const created = await jsonRequest("/projects", cookie, {
      method: "POST",
      body: { input: "Acme", attachments: [] },
    });
    const initial = created.body as Record<string, any>;
    broker.tasks.set("kb-1", {
      id: "kb-1",
      status: "paused",
      output: [],
    });
    const codec = new GeoTokenCodec(
      "test-session-secret-at-least-16-characters",
    );
    const stored = codec.open<Record<string, unknown>>(
      initial.projectToken,
      "project",
    ).value;
    const delayedToken = codec.seal(
      "project",
      {
        ...stored,
        knowledgeBaseSubmittedAt: "2026-07-28T00:00:00.000Z",
      },
      60 * 60 * 1000,
    );

    const delayed = await jsonRequest(
      `/projects/${encodeURIComponent(delayedToken)}`,
      cookie,
    );
    expect((delayed.body as any).project).toMatchObject({
      status: "running",
      knowledgeBaseSupportRequired: true,
      kbTask: { status: "running" },
    });
    expect(broker.prompts).toHaveLength(1);
  });
});

async function verifyInvite(existingCookie = "") {
  const response = await fetch(`${baseUrl}/invite/verify`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(existingCookie ? { cookie: existingCookie } : {}),
    },
    body: JSON.stringify({ code: "frontmind666" }),
  });
  const cookie = response.headers.get("set-cookie")?.split(";")[0] || "";
  return { response, cookie };
}

async function jsonRequest(
  pathname: string,
  cookie: string,
  options: { method?: string; body?: unknown } = {},
) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || "GET",
    headers: {
      cookie,
      ...(options.body === undefined
        ? {}
        : { "content-type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { response, body: await response.json() };
}

async function restartWithCustomQuestionValidationStore(
  store: MemoryGeoCustomQuestionValidationStore,
) {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  customQuestionValidationStore = store;
  const app = express();
  app.use(
    "/api/geo",
    createGeoRouter({
      broker,
      customQuestionValidationStore,
      projectOrderRegistry,
      customQuestionValidationNow: () => customQuestionValidationNowMs,
      env: {
        NODE_ENV: "test",
        FRONTMIND_GEO_INVITE_CODE: "frontmind666",
        FRONTMIND_GEO_SESSION_SECRET:
          "test-session-secret-at-least-16-characters",
      },
    }),
  );
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/geo`;
}

async function createReadyProject() {
  const { cookie } = await verifyInvite();
  const created = await jsonRequest("/projects", cookie, {
    method: "POST",
    body: { input: "Acme", attachments: [] },
  });
  const initial = created.body as Record<string, any>;
  const initialProject = new GeoTokenCodec(
    "test-session-secret-at-least-16-characters",
  ).open<{ knowledgeBaseTaskId: string }>(
    initial.projectToken,
    "project",
  ).value;
  broker.tasks.set(initialProject.knowledgeBaseTaskId, {
    id: initialProject.knowledgeBaseTaskId,
    status: "completed",
    output: [
      {
        id: `message-${initialProject.knowledgeBaseTaskId}`,
        type: "message",
        role: "assistant",
        content: [
          { type: "output_file", file_id: "archive-1", filename: "Acme.zip" },
        ],
      },
    ],
  });
  const recommended = await jsonRequest(
    `/projects/${encodeURIComponent(initial.projectToken)}/questions`,
    cookie,
    { method: "POST", body: {} },
  );
  return {
    cookie,
    projectToken: (recommended.body as Record<string, any>)
      .projectToken as string,
  };
}

async function startOnePlatformMonitor(
  ready: {
    cookie: string;
    projectToken: string;
  },
  questionId = "product-scenario-01",
  platformIds: GeoMonitorPlatformId[] = ["doubao"],
) {
  const projectId = new GeoTokenCodec(
    "test-session-secret-at-least-16-characters",
  ).open<{ projectId: string }>(ready.projectToken, "project").value.projectId;
  const existingOrder = Array.from(projectOrders.values()).find(
    (order) =>
      order.projectId === projectId && order.purchaseType === "monitoring",
  );
  let authorization = "zpay-signed-authorization-placeholder";
  if (!existingOrder) {
    const checkout = await jsonRequest(
      `/projects/${encodeURIComponent(ready.projectToken)}/payments`,
      ready.cookie,
      {
        method: "POST",
        body: {
          questionId,
          platformIds,
          method: "alipay",
        },
      },
    );
    expect(checkout.response.status).toBe(201);
    authorization = (checkout.body as any).payment.authorization;
  }
  const started = await jsonRequest(
    `/projects/${encodeURIComponent(ready.projectToken)}/monitoring`,
    ready.cookie,
    {
      method: "POST",
      body: {
        questionId,
        platformIds,
        paymentAuthorization: authorization,
      },
    },
  );
  expect(started.response.status).toBe(201);
  return started.body as Record<string, any>;
}

async function createServiceReadyProject(questionId = "product-scenario-01") {
  const question = validQuestionSet().questions.find(
    (candidate) => candidate.id === questionId,
  );
  if (!question) throw new Error(`missing fixture question ${questionId}`);

  const ready = await createReadyProject();
  const monitored = await startOnePlatformMonitor(ready, questionId);
  const monitorRunId = `monitor-${broker.monitorCreates}`;
  const run = broker.monitorRuns.get(monitorRunId);
  if (!run) throw new Error(`missing fixture monitor run ${monitorRunId}`);
  broker.monitorRuns.set(monitorRunId, {
    ...run,
    status: "completed",
    completedItems: 5,
    records: Array.from({ length: 5 }, (_, index) =>
      monitorRecord(index + 1, `Acme 回答 ${index + 1}`),
    ),
  });

  broker.completeAssessmentImmediately = true;
  const assessed = await jsonRequest(
    `/projects/${encodeURIComponent(monitored.projectToken)}/assessment`,
    ready.cookie,
    { method: "POST", body: {} },
  );
  expect(assessed.response.status).toBe(201);
  const assessmentTaskId = `assessment-${broker.assessmentTaskCount}`;
  broker.tasks.set(assessmentTaskId, {
    id: assessmentTaskId,
    status: "completed",
    output: [
      {
        role: "assistant",
        content: [{ text: JSON.stringify(validAssessmentOutput(question)) }],
      },
    ],
  });

  broker.completeForecastImmediately = true;
  const assessedPayload = assessed.body as Record<string, any>;
  const forecasted = await jsonRequest(
    `/projects/${encodeURIComponent(assessedPayload.projectToken)}/optimization-forecast`,
    ready.cookie,
    { method: "POST", body: {} },
  );
  expect(forecasted.response.status).toBe(201);
  const forecastedPayload = forecasted.body as Record<string, any>;
  return {
    cookie: ready.cookie,
    projectToken: forecastedPayload.projectToken as string,
    project: forecastedPayload.project as Record<string, any>,
    question,
    assessmentTaskId,
    forecastTaskId: `forecast-${broker.forecastTaskCount}`,
  };
}

function validServiceContractProfile(legalName = "Acme") {
  return {
    legalName,
    creditCode: "91440300MA5F12345X",
    address: "深圳市南山区科技园一号",
    signatoryName: "张三",
    signatoryTitle: "运营负责人",
    mobile: "13800138000",
    email: "contracts@example.com",
    authorized: true as const,
  };
}

async function advanceManualOrder(
  ready: Awaited<ReturnType<typeof createServiceReadyProject>>,
  status: GeoManualServiceOrderResponse["order"]["status"] = "payment_required",
) {
  const created = await jsonRequest(
    `/projects/${encodeURIComponent(ready.projectToken)}/services/contracts`,
    ready.cookie,
    {
      method: "POST",
      body: {
        profile: validServiceContractProfile(),
        contractCode: CONTRACT_AUTH_CODE,
      },
    },
  );
  expect(created.response.status).toBe(201);
  const createdPayload = created.body as Record<string, any>;
  manualOrderResponse = {
    ...manualOrderResponse,
    order: {
      ...manualOrderResponse.order,
      status,
      contractId: "manual-contract-001",
      signingUrl:
        status === "pending_admin"
          ? undefined
          : "https://sign.example.com/manual-contract-001",
      signedAt:
        status === "payment_required" ||
        status === "account_setup_required" ||
        status === "activation_required" ||
        status === "active"
          ? "2026-07-22T10:16:00.000Z"
          : undefined,
      provisioningReference:
        status === "activation_required" || status === "active"
          ? "purchase-reference-001"
          : undefined,
      updatedAt: "2026-07-22T10:16:00.000Z",
    },
  };
  const refreshed = await jsonRequest(
    `/projects/${encodeURIComponent(createdPayload.projectToken)}/services/contracts/status`,
    ready.cookie,
    { method: "POST", body: {} },
  );
  expect(refreshed.response.status).toBe(200);
  const payload = refreshed.body as Record<string, any>;
  return {
    ...ready,
    projectToken: payload.projectToken as string,
    project: payload.project as Record<string, any>,
  };
}

function monitorRecord(runIndex: number, answerText: string) {
  return {
    recordId: `record-${runIndex}`,
    platform: "doubao" as const,
    runIndex,
    status: "completed" as const,
    answerText,
    media: [],
    sources: [
      { title: "Acme 官网", url: "https://acme.example/about" },
      { title: "检索参考", url: "https://search.example/result" },
    ],
  };
}

function validQuestionSet() {
  return buildValidQuestionSet();
}

function validAssessmentOutput(
  question: Pick<GeoQuestion, "id" | "category" | "question"> = {
    id: "product-scenario-01",
    category: "product_scenario",
    question: "Acme 的服务模块 1 主要解决哪些业务问题？",
  },
) {
  const rankingMetricEligible = question.category !== "reputation";
  const indicator = () => ({
    rawValue: 0.5,
    measurementStatus: "measured",
    confidence: 0.8,
    calculationBasis: "由五次真实回答与知识库证据逐项对照计算。",
    evidenceRefs: ["doubao/run-01", "01_company_overview/overview.md"],
    limitations: [],
  });
  return {
    schemaVersion: 2,
    assessmentType: "question_baseline",
    question: {
      id: question.id,
      text: question.question,
      category: question.category,
      rankingMetricEligible,
    },
    sample: {
      selectedPlatforms: ["doubao"],
      repeatPerPlatform: 5,
      expectedResponses: 5,
      successfulResponses: 5,
      failedResponses: 0,
    },
    dimensions: {
      semanticVisibility: {
        aiSearchVisibility: indicator(),
        webSearchSov: indicator(),
        multiPlatformCoverage: indicator(),
      },
      semanticCoherence: {
        corePropositionHitRate: indicator(),
        toneConsistency: indicator(),
      },
      semanticRichness: {
        questionStageCoverage: indicator(),
        semanticEntityRichness: indicator(),
        contentFormatDiversity: indicator(),
      },
      semanticAuthority: {
        authoritativeSourceRatio: indicator(),
        structuredDataCompleteness: indicator(),
        thirdPartyEndorsement: indicator(),
      },
      competitiveAdvantage: {
        firstMentionRate: indicator(),
        exclusiveSemanticSpace: indicator(),
      },
    },
    rankingDiagnostics: rankingMetricEligible
      ? {
          eligible: true,
          totalObservations: 5,
          rankedObservations: 5,
          unmentionedObservations: 0,
          averageRank: 2,
          firstPlaceRate: 0.5,
          top3Rate: 0.8,
          top5Rate: 1,
          competitorRankGap: 1,
          calculationBasis: "由五次回答中的自然排序结构提取，未包含舆情题。",
        }
      : {
          eligible: false,
          totalObservations: 0,
          rankedObservations: 0,
          unmentionedObservations: 0,
          averageRank: null,
          firstPlaceRate: null,
          top3Rate: null,
          top5Rate: null,
          competitorRankGap: null,
          calculationBasis: "美誉舆情问题不纳入排名指标计算。",
        },
    platformBreakdown: [
      {
        platform: "doubao",
        responseCount: 5,
        successfulResponses: 5,
        brandMentionRate: 0.5,
        averageRank: 2,
        factAccuracy: 0.5,
        propositionHitRate: 0.5,
        sourceCount: 2,
        sentiment: "neutral",
        verdict: "品牌已被提及，但核心主张和证据密度仍需提升。",
        evidenceRefs: ["doubao/run-01"],
      },
    ],
    knowledgeVsAnswers: [
      {
        id: "comparison-01",
        topic: "企业定位",
        verdict: "supported",
        platform: "doubao",
        runIndex: 1,
        answerExcerpt: "Acme 面向科研团队提供设备。",
        kbClaimId: "company-positioning",
        kbClaimText: "Acme 面向科研团队提供专业设备。",
        kbEvidenceRefs: ["01_company_overview/overview.md"],
        explanation: "回答与知识库中的企业定位一致。",
        recommendedAction: "继续在权威页面统一该企业定位。",
        confidence: 0.9,
      },
    ],
    summary:
      "该问题下品牌已有基础可见度，但核心主张、权威引用和差异化表达仍有提升空间。",
    executiveSummary:
      "当前回答已形成基础认知，但核心事实和权威来源仍需加强；本月应补齐证据页面与问答内容，并在月底按同一口径复测。",
    dimensionNarratives: {
      semanticVisibility: {
        currentFinding: "五次回答能够识别企业及其主要服务方向。",
        nextAction: "补齐核心能力与权威证据之间的引用路径。",
      },
      semanticCoherence: {
        currentFinding: "核心主张在不同回答中的表达基本一致。",
        nextAction: "统一定位、能力边界与风险说明的表达口径。",
      },
      semanticRichness: {
        currentFinding: "回答已覆盖部分关键方面但采购信息仍不完整。",
        nextAction: "补齐场景、部署和采购核验类问答。",
      },
      semanticAuthority: {
        currentFinding: "重要判断已有部分来源支持但独立证据偏少。",
        nextAction: "建设可追溯事实页并拓展独立来源。",
      },
      competitiveAdvantage: {
        currentFinding: "部分已验证差异点能够被回答准确表达。",
        nextAction: "围绕可核验差异点建立统一对比语言。",
      },
    },
    priorityActions: [
      {
        priority: 1,
        dimension: "semanticAuthority",
        action: "补齐可被 AI 直接引用的官网事实页与权威来源链接。",
        expectedImpact: "提升回答中的权威引用比例。",
        evidenceRefs: ["doubao/run-01"],
      },
    ],
    limitations: ["仅覆盖一个问题和一个平台。"],
  };
}

function validForecastOutput() {
  const indicator = (
    effectType: "direct_asset" | "observed_outcome",
    actionIds: Array<
      | "GEO_A1_entity_facts"
      | "GEO_A2_ai_visibility"
      | "GEO_A3_qa_assets"
      | "GEO_A4_positioning_language"
      | "GEO_A5_site_schema"
      | "GEO_A6_distribution_citations"
    >,
  ) => ({
    measurementStatus: "projectable" as const,
    gapClosureLow: 0.2,
    gapClosureHigh: 0.4,
    effectType,
    confidence: 0.7,
    actionIds,
    rationale: "知识库差距与当前基线支持建立可复测的条件提升区间。",
    dependencies: ["完成内容建设、真实发布、抓取收录与质量检查"],
    evidenceRefs: ["current-assessment.json#/assessment/priorityActions/0"],
    timeToSignalWeeks: 4,
    verificationMetric: "使用相同问题、平台与每平台五次回答重新测量",
  });
  const observed = (actionIds: Parameters<typeof indicator>[1]) =>
    indicator("observed_outcome", actionIds);
  const direct = (actionIds: Parameters<typeof indicator>[1]) =>
    indicator("direct_asset", actionIds);
  return {
    schemaVersion: 2,
    forecastType: "conditional_4_week",
    horizonWeeks: 4,
    scenario: {
      name: "full_execution",
      actionIds: [
        "GEO_A1_entity_facts",
        "GEO_A2_ai_visibility",
        "GEO_A3_qa_assets",
        "GEO_A4_positioning_language",
        "GEO_A5_site_schema",
        "GEO_A6_distribution_citations",
      ],
      assumptions: [
        "企业按计划完成全部事实核验与内容资产建设",
        "发布页面能够被正常抓取、收录并保持稳定访问",
        "第 2 周检查执行进度，第 4 周严格使用相同问题与平台复测",
      ],
      verificationWeeks: [2, 4],
    },
    dimensions: {
      semanticVisibility: {
        aiSearchVisibility: observed([
          "GEO_A2_ai_visibility",
          "GEO_A3_qa_assets",
        ]),
        webSearchSov: observed([
          "GEO_A2_ai_visibility",
          "GEO_A6_distribution_citations",
        ]),
        multiPlatformCoverage: observed([
          "GEO_A3_qa_assets",
          "GEO_A6_distribution_citations",
        ]),
      },
      semanticCoherence: {
        corePropositionHitRate: observed([
          "GEO_A3_qa_assets",
          "GEO_A4_positioning_language",
        ]),
        toneConsistency: direct(["GEO_A4_positioning_language"]),
      },
      semanticRichness: {
        questionStageCoverage: direct(["GEO_A3_qa_assets"]),
        semanticEntityRichness: direct([
          "GEO_A1_entity_facts",
          "GEO_A3_qa_assets",
        ]),
        contentFormatDiversity: direct(["GEO_A3_qa_assets"]),
      },
      semanticAuthority: {
        authoritativeSourceRatio: observed(["GEO_A6_distribution_citations"]),
        structuredDataCompleteness: direct(["GEO_A5_site_schema"]),
        thirdPartyEndorsement: observed(["GEO_A6_distribution_citations"]),
      },
      competitiveAdvantage: {
        firstMentionRate: observed([
          "GEO_A4_positioning_language",
          "GEO_A6_distribution_citations",
        ]),
        exclusiveSemanticSpace: observed([
          "GEO_A1_entity_facts",
          "GEO_A4_positioning_language",
        ]),
      },
    },
    roadmap: [
      {
        phase: 1,
        weeks: "第 1 周",
        title: "事实与定位修复",
        actions: ["核验企业实体、核心定位、术语与支撑证据"],
        verificationGate: "全部关键主张都能追溯到知识库中的有效证据",
      },
      {
        phase: 2,
        weeks: "第 2 周",
        title: "问题资产建设",
        actions: ["建设问题、场景、比较与常见问答内容资产"],
        verificationGate: "所有内容资产均通过事实核验与质量检查",
      },
      {
        phase: 3,
        weeks: "第 3 周",
        title: "分发与权威建设",
        actions: ["发布内容并持续检查抓取、收录与引用路径"],
        verificationGate: "关键页面能够访问且收录状态已有完整记录",
      },
      {
        phase: 4,
        weeks: "第 4 周",
        title: "同口径复测",
        actions: ["按照原问题、平台与次数重新执行监控"],
        verificationGate: "复测样本范围与当前评估基线保持完全一致",
      },
    ],
    summary:
      "在完整执行、成功发布收录并按相同范围复测的前提下，企业语义资产存在可验证的一个月条件提升空间。",
    executiveSummary:
      "当前已有稳定的基础认知，但证据和内容覆盖仍需加强；未来四周先补齐事实与问答资产，并在月底按同一口径复测。",
    dimensionNarratives: {
      semanticVisibility: {
        currentFinding: "当前回答已能识别企业及其主要服务方向。",
        nextAction: "补齐核心能力内容并建立持续分发路径。",
      },
      semanticCoherence: {
        currentFinding: "核心主张仍有少量边界不清的问题。",
        nextAction: "统一定位、能力边界和风险说明语言。",
      },
      semanticRichness: {
        currentFinding: "采购决策所需的部分关键问题尚未覆盖。",
        nextAction: "补齐场景、部署和采购核验类问答。",
      },
      semanticAuthority: {
        currentFinding: "重要判断已有部分来源支持但仍不充分。",
        nextAction: "建设可追溯事实页并拓展独立来源。",
      },
      competitiveAdvantage: {
        currentFinding: "可核验差异点尚未形成稳定的统一表达。",
        nextAction: "围绕真实差异点完善对比内容和证据。",
      },
    },
    limitations: [
      "该预测仅覆盖当前选择的单一问题。",
      "模型更新与第三方引用不受企业直接控制。",
      "全部预测区间必须经过相同监控范围复测确认。",
    ],
    claimGuardrails: {
      isGuarantee: false,
      planningAssumptionOnly: true,
      requiresSameScopeRemeasurement: true,
    },
  };
}

async function fixtureCandidateArchive() {
  const zip = new JSZip();
  const source = "https://acme.example";
  const facts = [
    "# Acme 品牌事实",
    "",
    "## D01 企业基础",
    `Acme 提供企业技术服务。[来源](${source})`,
    "",
    "## D02 团队",
    "核心团队完整名单尚未发现公开资料。[待核验]",
    "",
    "## D03 产品服务",
    `Acme 提供面向企业客户的平台产品与交付服务。[来源](${source})`,
    "",
    "## D04 技术能力",
    `官网介绍了平台的接口集成与交付能力。[企业主张](${source})`,
    "",
    "## D05 客户案例",
    "公开案例的完整客户名单尚待核验。[待核验]",
    "",
    "## D06 资质认证",
    "公开资质信息尚待核验。[待核验]",
    "",
    "## D07 财务融资",
    "公开财务与融资信息尚待核验。[待核验]",
    "",
    "## D08 竞争信息",
    "未发布无证据的竞品优劣判断。[待核验]",
    "",
    "## D09 市场信息",
    `官网将企业客户列为主要服务对象。[来源](${source})`,
    "",
    "## D10 品牌资产",
    `企业以 Acme 名称对外提供服务。[来源](${source})`,
    "",
    "## D11 渠道",
    `官网提供产品、文档与联系入口。[来源](${source})`,
    "",
    "## D12 公开意图",
    `官网公开提供企业合作入口。[来源](${source})`,
    "",
    "## D13 公共情报",
    "本次公开资料未发现需要单列的权威监管信息。[待核验]",
  ].join("\n");
  const customer = [
    "# Acme 客户知识稿",
    "",
    "## 企业与品牌",
    "### 企业定位",
    `Acme 面向企业客户提供平台产品与技术服务。[来源](${source})`,
    "",
    "## 团队与组织",
    "### 公开团队信息",
    "核心团队完整名单尚未发现公开资料。[待核验]",
    "",
    "## 产品与服务",
    "### 平台产品",
    `Acme 提供平台产品、接口集成与配套交付服务。[来源](${source})`,
    "",
    "## 技术与交付",
    "### 技术能力",
    `官网称平台支持接口集成，并提供面向企业场景的交付能力。[企业主张](${source})`,
    "",
    "## 客户与行业",
    "### 服务对象",
    `官网将企业客户列为主要服务对象。[来源](${source})`,
    "",
    "## 服务与合作",
    "### 联系渠道",
    `企业官网提供产品、文档、联系与合作入口。[来源](${source})`,
    "",
    "## 可信优势",
    "### 已公开能力",
    `官网公开展示了产品、技术说明和企业合作渠道。[来源](${source})`,
  ].join("\n");
  zip.file("00_brand_facts.md", facts);
  zip.file("01_customer_draft.md", customer);
  zip.file(
    "02_run.json",
    JSON.stringify({
      schemaVersion: 1,
      company: {
        name: "Acme",
        officialWebsite: source,
        industryCluster: "C3",
      },
      sources: [
        {
          title: "Acme 官网",
          kind: "official_web",
          status: "read",
          url: source,
        },
      ],
      queries: [],
      assets: [],
    }),
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

async function fixtureArchive() {
  const zip = new JSZip();
  const root = zip.folder("Acme_knowledge_base")!;
  const packageDocuments: Array<Record<string, unknown>> = [];
  const evidenceDocuments: string[] = [];
  const addMarkdown = (
    entryPath: string,
    content: string,
    metadata: Record<string, unknown>,
  ) => {
    root.file(entryPath, content);
    packageDocuments.push({
      path: entryPath,
      customerVisible: false,
      ...metadata,
    });
    if (metadata.customerVisible !== true) evidenceDocuments.push(content);
  };
  addMarkdown(
    "README.md",
    "# Acme\n\nAcme 面向科研团队提供可核验的精密设备与技术支持。",
    {
      id: "doc-readme",
      kind: "report",
      title: "知识库说明",
    },
  );
  addMarkdown("00_knowledge_tree.md", "# 知识树\n\n已完成七分支。", {
    id: "doc-tree",
    kind: "index",
    title: "知识树",
  });
  root.file(
    "00_completeness.json",
    JSON.stringify({
      counts: {
        totalLeaves: 46,
        verifiedFirstParty: 24,
        verifiedAuthoritative: 5,
        supportedThirdParty: 3,
        inferred: 4,
        needsVerification: 8,
        notApplicable: 2,
      },
      acquisition: {
        officialPages: { completed: 18, total: 18 },
        images: { completed: 1, total: 1 },
        documents: { completed: 0, total: 0 },
        webQueries: { completed: 2, total: 2 },
      },
      gaps: ["部分团队与售后细节仍需企业核验"],
      evaluatedAt: "2026-07-28T10:00:00.000Z",
    }),
  );
  addMarkdown(
    "00_crawl_coverage_report.md",
    "# 抓取报告\n\n发现页面：18\n\n- https://example.com/acme/about",
    {
      id: "doc-crawl",
      kind: "report",
      title: "官网抓取覆盖报告",
    },
  );
  addMarkdown(
    "00_web_intelligence_report.md",
    "# 情报报告\n\n- https://example.org/registry/acme",
    {
      id: "doc-web",
      kind: "report",
      title: "全网企业情报报告",
    },
  );
  addMarkdown(
    "00_source_index.md",
    "# 来源\n\n- https://example.com/acme/about\n- https://example.org/registry/acme",
    {
      id: "doc-sources",
      kind: "index",
      title: "来源索引",
    },
  );
  const statuses = [
    "verified_first_party",
    "needs_verification",
    "verified_first_party",
    "verified_authoritative",
    "supported_third_party",
    "inferred",
    "not_applicable",
    ...Array(22).fill("verified_first_party"),
    ...Array(4).fill("verified_authoritative"),
    ...Array(2).fill("supported_third_party"),
    ...Array(3).fill("inferred"),
    ...Array(7).fill("needs_verification"),
    "not_applicable",
  ];
  const branches = [
    "01_company_overview",
    "02_team",
    "03_products/device",
    "04_technology",
    "05_manufacturing",
    "06_industries/research",
    "07_service",
    "08_competitive_advantages",
  ];
  const overviewGroups = new Set<string>();
  const productDocumentId = "doc-leaf-003";
  const assetId = "asset-001";
  statuses.forEach((status, index) => {
    const branch = branches[index % branches.length];
    const branchId = branch.split("/")[0];
    const displayBranch =
      branchId === "04_technology" || branchId === "05_manufacturing"
        ? "core-capabilities"
        : branchId;
    const kind = overviewGroups.has(displayBranch) ? "leaf" : "overview";
    overviewGroups.add(displayBranch);
    const filename =
      index === 0
        ? "profile.md"
        : `leaf-${String(index + 1).padStart(2, "0")}.md`;
    const documentId = `doc-leaf-${String(index + 1).padStart(3, "0")}`;
    addMarkdown(
      `${branch}/${filename}`,
      [
        `# 知识叶节点 ${index + 1}`,
        "",
        `> 最后更新: 2026-07-28 | 状态: ${status} | 来源: 企业官网`,
        "",
        "## 核心内容",
        "",
        String.fromCodePoint(0x4e00 + index).repeat(180),
        "",
        "## 原始来源",
        "",
        "https://example.com/acme/about",
      ].join("\n"),
      {
        id: documentId,
        kind,
        title: `知识叶节点 ${index + 1}`,
        branchId,
        order: index,
        evidenceStatus: status,
        sourceIds: ["source-official"],
        assetIds: documentId === productDocumentId ? [assetId] : [],
        customerVisible: true,
      },
    );
  });
  const imagePath = "09_media_assets/product_images/device.png";
  const imageBytes = fixturePng();
  root.file(imagePath, imageBytes);
  root.file(
    "00_package_manifest.json",
    JSON.stringify({
      schemaVersion: 1,
      profile: "website-lead-v1",
      documents: packageDocuments,
      assets: [
        {
          id: assetId,
          path: imagePath,
          sha256: createHash("sha256").update(imageBytes).digest("hex"),
          mimeType: "image/png",
          bytes: imageBytes.byteLength,
          width: 1,
          height: 1,
          caption: "Acme 精密设备",
          alt: "Acme 精密设备产品图",
          branchId: "03_products",
          documentIds: [productDocumentId],
          sourcePageUrl: "https://example.com/acme/products",
          ownership: "first_party",
        },
      ],
      counts: {
        totalFiles: packageDocuments.length + 3,
        customerVisibleCharacters: statuses.length * 180,
        evidenceCharacters: evidenceDocuments.reduce(
          (total, markdown) => total + fixtureEvidenceCharacterCount(markdown),
          0,
        ),
        packagedImages: 1,
      },
      imageSelection: {
        eligibleFirstPartyImages: 1,
        shortfallReason:
          "该测试企业仅提供一张经过验证且适合展示的第一方产品图片。",
      },
    }),
  );
  return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
}
