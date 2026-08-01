import crypto from "node:crypto";
import { Readable } from "node:stream";
import express, {
  type NextFunction,
  type Request,
  type Response,
  type Router,
} from "express";
import { ZodError } from "zod";
import {
  extractKnowledgeBaseAssetPreviews,
  KnowledgeBaseArchiveValidationError as ArchiveContractValidationError,
  parseKnowledgeBaseArchive,
  type KnowledgeBaseAssetPreview,
  type KnowledgeBaseManifest,
  type KnowledgeBaseValidationCategory,
} from "./archive";
import {
  createGeoAdminNotifierFromEnv,
  type GeoAdminNotifier,
} from "./admin-notifications";
import {
  ASSESSMENT_SKILL_ARCHIVE_FILENAME,
  assertAssessmentOutputScope,
  buildGeoCurrentStateEvaluatorSkillArchive,
  buildGeoKnowledgeAnswerVerifierSkillArchive,
  buildAssessmentPrompt,
  calculateQuestionBaselineAssessment,
  determineBsasGrade,
  KNOWLEDGE_VERIFIER_SKILL_ARCHIVE_FILENAME,
  parseAssessmentTaskOutput,
} from "./assessment";
import {
  buildGeoOptimizationOutcomeForecasterSkillArchive,
  buildOptimizationOutcomeForecastPrompt,
  calculateOptimizationOutcomeForecast,
  FORECAST_SKILL_ARCHIVE_FILENAME,
  FORECAST_HORIZON_WEEKS,
  parseOptimizationOutcomeForecastTaskOutput,
} from "./forecast";
import { buildGeoExecutionLog } from "./execution";
import {
  createGeoPresalesBrokerFromEnv,
  FRONTMIND_PRO_PROFILE,
  type BrokerMonitorRun,
  GEO_MONITOR_PLATFORM_IDS,
  GeoBrokerError,
  type BrokerTask,
  type FrontMindAgentProfile,
  type GeoPresalesBroker,
  type GeoMonitorPlatformId,
} from "./broker";
import {
  GeoMonitorContractError,
  normalizeMonitorRun,
  toPublicMonitorView,
} from "./monitoring";
import {
  isExplicitKnowledgeCandidateDescriptor,
  knowledgeArchiveDescriptorHash,
  MAX_KNOWLEDGE_ARCHIVE_CANDIDATE_BYTES,
  MAX_KNOWLEDGE_ARCHIVE_TOTAL_BYTES,
  rankedKnowledgeArchiveDescriptors,
} from "./knowledge-base-artifact";
import {
  KnowledgeBaseCandidateError,
  parseKnowledgeBaseCandidate,
} from "./knowledge-base-candidate";
import {
  assessKnowledgeBaseCandidate,
  finalizeKnowledgeBaseCandidate,
  WEBSITE_KB_FINALIZER_VERSION,
} from "./knowledge-base-finalizer";
import {
  createGeoPaymentGatewayFromEnv,
  GEO_SERVICE_MONTHLY_PRICE_FEN,
  type GeoPaymentCheckout,
  type GeoPaymentGateway,
  type GeoPaymentMethod,
  GeoPaymentVerificationError,
  type GeoPaymentVerifier,
  type GeoServiceCategory,
} from "./payment";
import {
  findArchiveDescriptor,
  normalizeTask,
  normalizeTaskStatus,
  parseQuestionSetFromTask,
} from "./output";
import {
  parseCustomQuestionClassificationTaskOutput,
  validateAcceptedCustomQuestionGrounding,
} from "./custom-question-classifier";
import { trustedAssistantOutputTexts } from "./trusted-task-output";
import {
  buildGeoCustomQuestionClassifierPrompt,
  buildGeoQuestionPrompt,
  buildWebsiteKnowledgeBasePrompt,
} from "./prompts";
import {
  buildGeoCustomQuestionClassifierSkillArchive,
  buildGeoQuestionRecommenderSkillArchive,
  buildWebsiteKnowledgeBaseSkillArchive,
  CUSTOM_QUESTION_CLASSIFIER_SKILL_ARCHIVE_FILENAME,
  QUESTION_SKILL_ARCHIVE_FILENAME,
  WEBSITE_KB_SKILL_ARCHIVE_FILENAME,
} from "./skills";
import {
  createGeoAccountProvisioner,
  createGeoKnowledgeImporter,
  createGeoManualServiceOrderAccountSubmitter,
  createGeoManualServiceOrderCreator,
  createGeoManualServiceOrderPaymentConfirmer,
  createGeoManualServiceOrderStatusReader,
  createGeoProjectOrderRegistry,
  createGeoPurchaseProvisioner,
  createGeoPurchaseStatusReader,
  type GeoAccountProvisioner,
  GeoAccountProvisioningError,
  type GeoKnowledgeImporter,
  type GeoKnowledgeImportResponse,
  type GeoManualServiceOrderAccountSubmitter,
  type GeoManualServiceOrderCreator,
  type GeoManualServiceOrderPaymentConfirmer,
  type GeoManualServiceOrderResponse,
  type GeoManualServiceOrderStatus,
  type GeoManualServiceOrderStatusReader,
  type GeoProjectOrder,
  type GeoProjectOrderRegistry,
  type GeoProjectOrderState,
  type GeoPurchaseProvisioner,
  type GeoPurchaseProvisionResponseV2,
  type GeoPurchaseStatusReader,
} from "./provisioning";
import {
  CreateServiceContractRequestSchema,
  CreateServiceAccountRequestSchema,
  CreateServiceAccountRequestV1Schema,
  CreateCustomQuestionRequestSchema,
  CreatePaymentRequestSchema,
  CreateProjectRequestSchema,
  CreateServicePaymentRequestSchema,
  GeoQuestionSchema,
  InviteRequestSchema,
  isIndustryRankingQuestion,
  PaymentStatusRequestSchema,
  RetryProjectRequestSchema,
  ServicePaymentAuthorizationSchema,
  ServiceStatusRequestSchema,
  StartMonitoringRequestSchema,
  UploadInitRequestSchema,
  type CreateProjectRequest,
  type GeoQuestion,
  type RetryProjectRequest,
} from "./schemas";
import {
  GeoTokenCodec,
  GeoTokenError,
  parseCookies,
  safeSecretEqual,
} from "./tokens";
import {
  assertResponseLengthWithinLimit,
  createByteLimitTransform,
  GeoByteLimitError,
  readResponseBufferLimited,
} from "./streams";

const SESSION_COOKIE = "frontmind_geo_session";
const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const PROJECT_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const PAYMENT_INTENT_TTL_MS = 24 * 60 * 60 * 1000;
const UPLOAD_TTL_MS = 60 * 60 * 1000;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_ARCHIVE_COPY_BYTES = 150 * 1024 * 1024;
const MAX_VALIDATED_ARCHIVE_BYTES = MAX_KNOWLEDGE_ARCHIVE_CANDIDATE_BYTES;
const MAX_ASSESSMENT_INPUT_BYTES = 12 * 1024 * 1024;
const MAX_FORECAST_INPUT_BYTES = 12 * 1024 * 1024;
const CUSTOM_QUESTION_CLASSIFIER_TIMEOUT_MS = 15_000;
const CUSTOM_QUESTION_CLASSIFIER_POLL_MS = 400;
const SESSION_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const GEO_MANUAL_CONTRACT_TEMPLATE_VERSION = "basic-2026.07-v2";
const KNOWLEDGE_BASE_VALIDATION_PUBLIC_ERRORS: Record<
  KnowledgeBaseValidationCategory,
  string
> = {
  structure: "知识库候选文件暂未完成安全整理，可在当前项目中重新生成。",
  media: "Logo 素材未通过校验，系统会忽略该素材并继续整理文字知识库。",
  content: "知识库文字暂未完成结构化整理，可在当前项目中重新生成。",
  unsafe:
    "知识库文件存在安全风险，已阻止下载及后续分析。请勿继续处理该文件，并联系技术支持。",
};
const KNOWLEDGE_BASE_FINALIZATION_PUBLIC_ERROR =
  "候选资料已安全保留，系统最终整理校验异常；修复后可直接重试整理，无需重新上传。";

function knowledgeCandidateDiagnosticCode(value: string) {
  if (value.startsWith("Selected candidate root:"))
    return "candidate_root_selected";
  if (value.startsWith("Ignored ") && value.includes("outside candidate root"))
    return "outside_files_ignored";
  if (value.startsWith("Ignored non-logo image:"))
    return "non_logo_image_ignored";
  if (value.startsWith("Ignored image without"))
    return "unregistered_logo_ignored";
  if (value.startsWith("Ignored invalid logo path"))
    return "invalid_logo_path_ignored";
  if (value.startsWith("Recovered missing"))
    return "missing_document_recovered";
  if (value.startsWith("Recovered unreadable"))
    return "unreadable_document_recovered";
  if (value.startsWith("Recovered fact heading"))
    return "fact_heading_recovered";
  if (value.startsWith("Recovered customer heading"))
    return "customer_heading_recovered";
  if (value.startsWith("02_run.json")) return "run_metadata_ignored";
  return "candidate_recovered";
}

type UploadTokenValue = {
  fileId: string;
  filename: string;
  sessionId: string;
  sizeBytes: number;
  contentType?: string;
  upstreamUploadTicket?: string;
};

type SessionTokenValue = {
  scope: "geo";
  nonce: string;
};

type ProjectTokenValue = {
  projectId: string;
  ownerSessionId: string;
  companyName: string;
  companyNameSource?: "explicit" | "input" | "website" | "attachment";
  knowledgeBaseTaskId: string;
  knowledgeBaseSubmittedAt?: string;
  knowledgeBaseValidationProfile?: "website-lead-v1";
  knowledgeBaseAutomaticRetryUsed?: true;
  knowledgeBaseRecovery?: {
    automaticSourceTaskId?: string;
    automaticAttemptedAt?: string;
    automaticResult?: "submitted" | "failed";
  };
  knowledgeBaseCandidateFailure?: {
    category: "unsafe" | "structure" | "content";
    message: string;
  };
  knowledgeBaseFinalization?: {
    state: "pending" | "failed_internal" | "completed";
    finalizerVersion: string;
    candidateSha256?: string;
    errorCode?: "KB_FINALIZER_CONTRACT_VIOLATION";
    retryAvailable: boolean;
    updatedAt: string;
  };
  knowledgeBaseArtifact?: {
    finalizerVersion:
      | "website-kb-finalizer-v2"
      | typeof WEBSITE_KB_FINALIZER_VERSION;
    candidate: {
      taskId: string;
      outputItemId: string;
      fileId?: string;
      descriptorHash: string;
      sha256: string;
    };
    final: {
      fileId: string;
      filename: string;
      sha256: string;
      packageManifestSha256: string;
      archiveContractVersion: 3;
      validationProfile: "website-lead-v1";
      finalizedAt: string;
    };
  };
  uploadFileIds?: string[];
  archiveFileIds?: string[];
  temporaryFileIds?: string[];
  questionTaskId?: string;
  questionSubmittedAt?: string;
  previousKnowledgeBaseTaskIds?: string[];
  previousQuestionTaskIds?: string[];
  customQuestion?: GeoQuestion;
  monitorRunId?: string;
  monitorQuestionId?: string;
  monitorPlatformIds?: GeoMonitorPlatformId[];
  monitorOrderId?: string;
  monitorAmountFen?: number;
  monitorAuthorizationDigest?: string;
  monitorCheckoutExpiresAt?: string;
  monitorPaidAt?: string;
  assessmentTaskId?: string;
  assessmentSubmittedAt?: string;
  assessmentAttempt?: 1 | 2;
  previousAssessmentTaskIds?: string[];
  optimizationForecastTaskId?: string;
  optimizationForecastSubmittedAt?: string;
  optimizationForecastAttempt?: 1 | 2;
  previousOptimizationForecastTaskIds?: string[];
  serviceOrderId?: string;
  serviceQuestionId?: string;
  serviceCategory?: GeoServiceCategory;
  serviceAmountFen?: number;
  serviceTradeNo?: string;
  servicePaidAt?: string;
  serviceAuthorizationDigest?: string;
  serviceCheckoutExpiresAt?: string;
  serviceContractId?: string;
  serviceContractTemplateVersion?: string;
  serviceContractDocumentSha256?: string;
  serviceContractSignedAt?: string;
  serviceContractSignatoryId?: string;
  serviceAccountUserId?: number;
  serviceAccountUsername?: string;
  serviceAccountDisplayName?: string;
  serviceProvisionedAt?: string;
  serviceActivatedAt?: string;
  serviceProvisioningVersion?: 2;
  serviceAccountMode?: "create" | "bind_existing";
  serviceProvisioningReference?: string;
  serviceProvisioningStatus?: "pending_confirmation" | "provisioned" | "failed";
  serviceProvisioningMessage?: string;
  serviceProvisioningRetryable?: boolean;
  serviceProvisioningErrorCode?: string;
  serviceProvisioningUpdatedAt?: string;
  serviceAccountSetupUrl?: string;
  serviceWorkspaceUrl?: string;
  serviceKnowledgeImportId?: string;
  serviceKnowledgeImportStatus?: "pending" | "importing" | "ready" | "failed";
  serviceKnowledgeImportMessage?: string;
  serviceKnowledgeImportRetryable?: boolean;
  serviceKnowledgeImportUpdatedAt?: string;
  serviceKnowledgeArtifactSha256?: string;
  serviceKnowledgeIdempotencyKey?: string;
  serviceManualOrderReference?: string;
  serviceManualOrderStatus?: GeoManualServiceOrderStatus;
  serviceManualOrderMessage?: string;
  serviceManualOrderRetryable?: boolean;
  serviceManualOrderUpdatedAt?: string;
  serviceManualContractId?: string;
  serviceManualSigningUrl?: string;
  serviceManualSignedAt?: string;
  serviceProfileSubmittedAt?: string;
  serviceAdminNotificationDeliveredAt?: string;
};

type GeoRouterOptions = {
  broker?: GeoPresalesBroker;
  paymentGateway?: GeoPaymentGateway;
  paymentVerifier?: GeoPaymentVerifier;
  accountProvisioner?: GeoAccountProvisioner;
  purchaseProvisioner?: GeoPurchaseProvisioner;
  purchaseStatusReader?: GeoPurchaseStatusReader;
  manualOrderCreator?: GeoManualServiceOrderCreator;
  manualOrderStatusReader?: GeoManualServiceOrderStatusReader;
  manualOrderPaymentConfirmer?: GeoManualServiceOrderPaymentConfirmer;
  manualOrderAccountSubmitter?: GeoManualServiceOrderAccountSubmitter;
  adminNotifier?: GeoAdminNotifier;
  knowledgeImporter?: GeoKnowledgeImporter;
  projectOrderRegistry?: GeoProjectOrderRegistry;
  knowledgeBaseFinalizer?: typeof finalizeKnowledgeBaseCandidate;
  env?: NodeJS.ProcessEnv;
};

type FailedInviteWindow = { count: number; resetAt: number };
type RateWindow = { count: number; resetAt: number };
type ServiceOrderLock = {
  method: GeoPaymentMethod;
  expiresAt: number;
  intent?: GeoProjectOrder;
  intentPromise?: Promise<GeoProjectOrder>;
  checkout?: GeoPaymentCheckout;
  checkoutCommitted?: boolean;
  checkoutPromise?: Promise<GeoPaymentCheckout>;
};

type ProjectOrderProtection = {
  expiresAt: number;
  monitoring?: {
    runId?: string;
  };
  service?: {
    value?: ProjectTokenValue;
  };
};

async function verifyUploadedKnowledgeBaseArchive(
  broker: GeoPresalesBroker,
  input: {
    fileId: string;
    companyName: string;
    generatedAt: string;
    expectedBytes: Buffer;
    expectedSha256: string;
    expectedPackageManifestSha256: string;
  },
) {
  let bytes: Buffer;
  try {
    const response = await broker.downloadFile(input.fileId);
    bytes = await readResponseBufferLimited(
      response,
      MAX_VALIDATED_ARCHIVE_BYTES,
    );
  } catch (error) {
    throw new GeoHttpError(
      "知识库正式文件传输暂时不可用，请稍后重试",
      error instanceof GeoByteLimitError ? 502 : 503,
      "FINAL_ARCHIVE_READBACK_FAILED",
    );
  }
  if (!bytes.length) {
    throw new GeoHttpError(
      "知识库正式文件传输暂时不可用，请稍后重试",
      503,
      "FINAL_ARCHIVE_READBACK_FAILED",
    );
  }
  const actualSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  if (
    actualSha256 !== input.expectedSha256 ||
    !bytes.equals(input.expectedBytes)
  ) {
    throw new GeoHttpError(
      "知识库正式文件传输校验失败，请稍后重试",
      503,
      "FINAL_ARCHIVE_HASH_MISMATCH",
    );
  }

  let manifest: KnowledgeBaseManifest;
  try {
    manifest = await parseKnowledgeBaseArchive(bytes, {
      companyName: input.companyName,
      validationProfile: "website-lead-v1",
      generatedAt: input.generatedAt,
    });
  } catch {
    throw new GeoHttpError(
      "知识库正式文件结构校验失败，请稍后重试",
      503,
      "FINAL_ARCHIVE_CONTRACT_MISMATCH",
    );
  }
  if (manifest.packageManifestSha256 !== input.expectedPackageManifestSha256) {
    throw new GeoHttpError(
      "知识库正式文件清单校验失败，请稍后重试",
      503,
      "FINAL_ARCHIVE_MANIFEST_MISMATCH",
    );
  }
  return manifest;
}

export function createGeoRouter(options: GeoRouterOptions = {}): Router {
  const env = options.env ?? process.env;
  const production = env.NODE_ENV === "production";
  const inviteCode =
    env.FRONTMIND_GEO_INVITE_CODE?.trim() || (production ? "" : "frontmind666");
  const sessionSecret =
    env.FRONTMIND_GEO_SESSION_SECRET?.trim() ||
    (production ? "" : "frontmind-geo-local-development-secret");
  const unsafeProductionInvite =
    production &&
    (inviteCode.length < 16 ||
      inviteCode === "frontmind666" ||
      isUnsafePlaceholder(inviteCode));
  const unsafeProductionSessionSecret = production && sessionSecret.length < 32;
  const configurationError =
    !inviteCode ||
    unsafeProductionInvite ||
    sessionSecret.length < 16 ||
    unsafeProductionSessionSecret ||
    isUnsafePlaceholder(sessionSecret)
      ? "GEO 邀请码或会话密钥尚未配置"
      : "";
  const codec = new GeoTokenCodec(
    sessionSecret.length >= 16
      ? sessionSecret
      : "frontmind-geo-disabled-secret",
  );
  const broker = options.broker ?? createGeoPresalesBrokerFromEnv(env);
  const paymentGateway =
    options.paymentGateway ?? createGeoPaymentGatewayFromEnv(env, codec);
  const paymentVerifier = options.paymentVerifier ?? paymentGateway;
  const accountProvisioner =
    options.accountProvisioner ?? createGeoAccountProvisioner({ env });
  const purchaseProvisioner =
    options.purchaseProvisioner ?? createGeoPurchaseProvisioner({ env });
  const purchaseStatusReader =
    options.purchaseStatusReader ?? createGeoPurchaseStatusReader({ env });
  const manualOrderCreator =
    options.manualOrderCreator ?? createGeoManualServiceOrderCreator({ env });
  const manualOrderStatusReader =
    options.manualOrderStatusReader ??
    createGeoManualServiceOrderStatusReader({ env });
  const manualOrderPaymentConfirmer =
    options.manualOrderPaymentConfirmer ??
    createGeoManualServiceOrderPaymentConfirmer({ env });
  const manualOrderAccountSubmitter =
    options.manualOrderAccountSubmitter ??
    createGeoManualServiceOrderAccountSubmitter({ env });
  const adminNotifier =
    options.adminNotifier ?? createGeoAdminNotifierFromEnv({ env });
  const knowledgeImporter =
    options.knowledgeImporter ?? createGeoKnowledgeImporter({ env });
  const projectOrderRegistry =
    options.projectOrderRegistry ?? createGeoProjectOrderRegistry({ env });
  const knowledgeBaseFinalizer =
    options.knowledgeBaseFinalizer ?? finalizeKnowledgeBaseCandidate;
  const failedInvites = new Map<string, FailedInviteWindow>();
  const sessionRates = new Map<string, RateWindow>();
  const identityRates = new Map<string, RateWindow>();
  const serviceOrderLocks = new Map<string, ServiceOrderLock>();
  const monitoringOrderLocks = new Map<string, ServiceOrderLock>();
  // Payment checkout does not currently rotate the project capability token.
  // This registry prevents stale-token deletion within one router lifetime;
  // durable cross-restart enforcement still requires the payment ledger to
  // expose an ownerSessionId + projectId order lookup.
  const projectOrderProtections = new Map<string, ProjectOrderProtection>();
  const activeUploadsBySession = new Map<string, number>();
  let activeUploads = 0;
  const knowledgeBaseFinalizations = new Map<
    string,
    {
      expiresAt: number;
      settled: boolean;
      promise: Promise<{
        value: ProjectTokenValue;
        manifest?: KnowledgeBaseManifest;
      }>;
    }
  >();
  const knowledgeBaseFinalizationBackoffs = new Map<
    string,
    { attempts: number; retryAt: number }
  >();
  const knowledgeBaseAutomaticRetries = new Map<
    string,
    {
      expiresAt: number;
      promise: Promise<{
        value: ProjectTokenValue;
        knowledgeBaseTask: BrokerTask;
      }>;
    }
  >();
  const knowledgeBaseSourceInputs = new Map<
    string,
    {
      expiresAt: number;
      input: {
        input: string;
        companyName?: string;
        companyWebsite?: string;
        operatorNotes?: string;
        attachments: Array<{ fileId: string; filename: string }>;
      };
    }
  >();
  const router = express.Router();

  const ensureFinalizedKnowledgeBase = async (
    value: ProjectTokenValue,
    task: BrokerTask,
    options: { force?: boolean } = {},
  ): Promise<{
    value: ProjectTokenValue;
    manifest?: KnowledgeBaseManifest;
  }> => {
    if (normalizeTaskStatus(task.status) !== "completed") {
      return { value };
    }
    const existingArtifact = value.knowledgeBaseArtifact;
    if (
      existingArtifact?.candidate.taskId === value.knowledgeBaseTaskId &&
      ["website-kb-finalizer-v2", WEBSITE_KB_FINALIZER_VERSION].includes(
        existingArtifact.finalizerVersion,
      )
    ) {
      const descriptor = resolveKnowledgeBaseArtifact(value, task);
      if (!descriptor) return { value };
      const manifest = await loadKnowledgeBaseManifest(
        broker,
        value.knowledgeBaseTaskId,
        task,
        value.companyName,
        descriptor,
        "website-lead-v1",
      );
      return {
        value: value.knowledgeBaseFinalization
          ? value
          : {
              ...value,
              knowledgeBaseFinalization: {
                state: "completed",
                finalizerVersion: existingArtifact.finalizerVersion,
                candidateSha256: existingArtifact.candidate.sha256,
                retryAvailable: false,
                updatedAt: existingArtifact.final.finalizedAt,
              },
            },
        manifest,
      };
    }

    const candidateDescriptors = rankedKnowledgeArchiveDescriptors(task.output);
    if (!candidateDescriptors.length) {
      return {
        value: {
          ...value,
          knowledgeBaseCandidateFailure: {
            category: "structure",
            message: "上游任务未返回候选 ZIP 文件",
          },
        },
      };
    }
    if (
      value.knowledgeBaseFinalization?.state === "failed_internal" &&
      value.knowledgeBaseFinalization.finalizerVersion ===
        WEBSITE_KB_FINALIZER_VERSION &&
      value.knowledgeBaseFinalization.candidateSha256 &&
      !options.force
    ) {
      return { value };
    }

    const candidateDownloadStartedAt = Date.now();
    let downloadedCandidateBytes = 0;
    let candidateDescriptor: (typeof candidateDescriptors)[number] | undefined;
    let candidateBytes: Buffer | undefined;
    let candidate:
      | Awaited<ReturnType<typeof parseKnowledgeBaseCandidate>>
      | undefined;
    let candidateParseMs = 0;
    let bestFailure:
      | {
          category: "unsafe" | "structure" | "content";
          message: string;
          score: number;
        }
      | undefined;

    for (const descriptor of candidateDescriptors) {
      console.info("[GEO KB]", {
        event: "candidate_descriptor_selected",
        projectId: value.projectId,
        taskId: value.knowledgeBaseTaskId,
        filename: descriptor.filename,
        outputItemId: descriptor.outputItemId,
      });
      let bytes: Buffer;
      try {
        const response = descriptor.fileId
          ? await broker.downloadFile(descriptor.fileId)
          : await broker.downloadTaskOutput(
              value.knowledgeBaseTaskId,
              descriptor.url || "",
              descriptor.filename,
            );
        const declaredLength = Number(
          response.headers.get("content-length") || 0,
        );
        if (
          Number.isFinite(declaredLength) &&
          declaredLength > 0 &&
          downloadedCandidateBytes + declaredLength >
            MAX_KNOWLEDGE_ARCHIVE_TOTAL_BYTES
        ) {
          throw new GeoByteLimitError(MAX_KNOWLEDGE_ARCHIVE_TOTAL_BYTES);
        }
        bytes = await readResponseBufferLimited(
          response,
          MAX_VALIDATED_ARCHIVE_BYTES,
        );
        downloadedCandidateBytes += bytes.byteLength;
        if (downloadedCandidateBytes > MAX_KNOWLEDGE_ARCHIVE_TOTAL_BYTES) {
          throw new GeoByteLimitError(MAX_KNOWLEDGE_ARCHIVE_TOTAL_BYTES);
        }
      } catch (error) {
        if (!(error instanceof GeoByteLimitError)) throw error;
        const failure = {
          category: "unsafe" as const,
          message: "候选 ZIP 超出允许大小",
          score: 3,
        };
        bestFailure = failure;
        console.warn("[GEO KB]", {
          event: "candidate_parse_rejected",
          projectId: value.projectId,
          taskId: value.knowledgeBaseTaskId,
          filename: descriptor.filename,
          category: failure.category,
          diagnosticCode: "candidate_byte_budget_exceeded",
        });
        if (isExplicitKnowledgeCandidateDescriptor(descriptor)) {
          return {
            value: {
              ...value,
              knowledgeBaseCandidateFailure: {
                category: failure.category,
                message: failure.message,
              },
            },
          };
        }
        continue;
      }

      const parseStartedAt = Date.now();
      try {
        candidate = await parseKnowledgeBaseCandidate(bytes);
        candidateParseMs = Date.now() - parseStartedAt;
        candidateDescriptor = descriptor;
        candidateBytes = bytes;
        break;
      } catch (error) {
        if (!(error instanceof KnowledgeBaseCandidateError)) throw error;
        const score =
          error.category === "unsafe"
            ? 3
            : error.category === "content"
              ? 2
              : 1;
        if (!bestFailure || score > bestFailure.score) {
          bestFailure = {
            category: error.category,
            message: error.message,
            score,
          };
        }
        console.warn("[GEO KB]", {
          event: "candidate_parse_rejected",
          projectId: value.projectId,
          taskId: value.knowledgeBaseTaskId,
          filename: descriptor.filename,
          category: error.category,
          diagnosticCode: "candidate_contract_rejected",
        });
        if (
          error.category === "unsafe" &&
          isExplicitKnowledgeCandidateDescriptor(descriptor)
        ) {
          return {
            value: {
              ...value,
              knowledgeBaseCandidateFailure: {
                category: error.category,
                message: error.message,
              },
            },
          };
        }
      }
    }

    if (!candidateDescriptor || !candidateBytes || !candidate) {
      return {
        value: {
          ...value,
          knowledgeBaseCandidateFailure: {
            category: bestFailure?.category || "structure",
            message:
              bestFailure?.message || "上游任务未返回可识别的候选 ZIP 文件",
          },
        },
      };
    }
    const candidateSha = crypto
      .createHash("sha256")
      .update(candidateBytes)
      .digest("hex");
    const recordedFinalization = value.knowledgeBaseFinalization;
    if (
      recordedFinalization?.state === "failed_internal" &&
      recordedFinalization.finalizerVersion === WEBSITE_KB_FINALIZER_VERSION &&
      recordedFinalization.candidateSha256 === candidateSha &&
      !options.force
    ) {
      return { value };
    }
    if (
      options.force &&
      recordedFinalization?.state === "failed_internal" &&
      recordedFinalization.candidateSha256 &&
      recordedFinalization.candidateSha256 !== candidateSha
    ) {
      throw new GeoHttpError(
        "候选资料版本已变化，请刷新项目状态后重试",
        409,
        "KB_FINALIZATION_CANDIDATE_CHANGED",
      );
    }
    const candidateDownloadMs = Date.now() - candidateDownloadStartedAt;
    const descriptorHash = knowledgeArchiveDescriptorHash(candidateDescriptor);
    const selectedCandidate = candidate;
    const selectedCandidateDescriptor = candidateDescriptor;
    const finalizationKey = [
      value.projectId,
      value.knowledgeBaseTaskId,
      candidateSha,
      WEBSITE_KB_FINALIZER_VERSION,
    ].join(":");
    const now = Date.now();
    pruneExpiringMap(knowledgeBaseFinalizations, now, 200);
    const transientBackoff =
      knowledgeBaseFinalizationBackoffs.get(finalizationKey);
    if (transientBackoff && transientBackoff.retryAt > now && !options.force) {
      throw new GeoHttpError(
        "知识库最终整理文件传输暂时不可用，请稍后重试",
        503,
        "KB_FINALIZATION_TRANSIENT_BACKOFF",
      );
    }
    const running = knowledgeBaseFinalizations.get(finalizationKey);
    // Manual retries bypass a recorded failure/backoff, but concurrent retries
    // for the same candidate must still share one finalization/upload promise.
    if (running && running.expiresAt > now) {
      if (!options.force || !running.settled) return running.promise;
      knowledgeBaseFinalizations.delete(finalizationKey);
    }

    let promise: Promise<{
      value: ProjectTokenValue;
      manifest?: KnowledgeBaseManifest;
    }>;
    promise = (async () => {
      const assessment = assessKnowledgeBaseCandidate(selectedCandidate);
      const recoveredHeadingCount = selectedCandidate.diagnostics.filter(
        (item) => item.startsWith("Recovered "),
      ).length;
      const ignoredFileCount = selectedCandidate.diagnostics.reduce(
        (total, item) => {
          const match = item.match(/^Ignored (\d+) file/);
          return total + Number(match?.[1] || 0);
        },
        0,
      );
      console.info("[GEO KB]", {
        event:
          candidate.diagnostics.length > 1
            ? "candidate_parse_recovered"
            : "candidate_parse_succeeded",
        projectId: value.projectId,
        taskId: value.knowledgeBaseTaskId,
        candidateSha,
        filename: selectedCandidateDescriptor.filename,
        finalizerVersion: WEBSITE_KB_FINALIZER_VERSION,
        candidateRoot:
          selectedCandidate.diagnostics.find((item) =>
            item.startsWith("Selected candidate root:"),
          ) || "unknown",
        ignoredFileCount,
        recoveredHeadingCount,
        diagnosticCodes: Array.from(
          new Set(
            selectedCandidate.diagnostics.map(knowledgeCandidateDiagnosticCode),
          ),
        ),
        tier: assessment.tier,
        citedSourceCount: selectedCandidate.metrics.citedSourceCount,
        factCharacters: selectedCandidate.metrics.factCharacters,
        customerCharacters: selectedCandidate.metrics.customerCharacters,
        coveredFactDimensions: selectedCandidate.metrics.coveredFactDimensions,
        discoveredImages: selectedCandidate.assets.length,
        requiresSupplement: assessment.requiresSupplement,
        supplementReasons: assessment.reasons,
        candidateDownloadMs,
        candidateParseMs,
      });
      const evaluatedAt =
        typeof task.completed_at === "string"
          ? task.completed_at
          : typeof task.updated_at === "string"
            ? task.updated_at
            : value.knowledgeBaseSubmittedAt || new Date(0).toISOString();
      const candidateCompanyName = selectedCandidate.run?.company.name.trim();
      const finalCompanyName =
        candidateCompanyName &&
        (value.companyNameSource === "website" ||
          value.companyNameSource === "attachment" ||
          looksLikeHostname(value.companyName))
          ? candidateCompanyName
          : value.companyName;
      let finalized;
      const finalizeStartedAt = Date.now();
      try {
        finalized = await knowledgeBaseFinalizer({
          candidate: selectedCandidate,
          companyName: finalCompanyName,
          evaluatedAt,
        });
      } catch (error) {
        console.error("[GEO API] KB_FINALIZER_CONTRACT_VIOLATION", {
          finalizerVersion: WEBSITE_KB_FINALIZER_VERSION,
          candidateSha,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          value: {
            ...value,
            knowledgeBaseCandidateFailure: undefined,
            knowledgeBaseFinalization: {
              state: "failed_internal" as const,
              finalizerVersion: WEBSITE_KB_FINALIZER_VERSION,
              candidateSha256: candidateSha,
              errorCode: "KB_FINALIZER_CONTRACT_VIOLATION" as const,
              retryAvailable: true,
              updatedAt: new Date().toISOString(),
            },
          },
        };
      }

      const filename = `${sanitizeFilename(
        finalCompanyName,
        "company",
      )}_website_lead_knowledge_base.zip`;
      const file = await broker.createFile({
        filename,
        mimeType: "application/zip",
        sizeBytes: finalized.bytes.length,
      });
      let verifiedManifest: KnowledgeBaseManifest;
      try {
        const uploadStartedAt = Date.now();
        await broker.uploadFile(
          file.id,
          finalized.bytes,
          "application/zip",
          file.proxy_upload_ticket,
        );
        const uploadMs = Date.now() - uploadStartedAt;
        const readbackStartedAt = Date.now();
        verifiedManifest = await verifyUploadedKnowledgeBaseArchive(broker, {
          fileId: file.id,
          companyName: finalCompanyName,
          generatedAt: evaluatedAt,
          expectedBytes: finalized.bytes,
          expectedSha256: finalized.sha256,
          expectedPackageManifestSha256: finalized.packageManifestSha256,
        });
        console.info("[GEO KB]", {
          event: "knowledge_base_finalized",
          projectId: value.projectId,
          taskId: value.knowledgeBaseTaskId,
          candidateSha,
          finalizerVersion: WEBSITE_KB_FINALIZER_VERSION,
          finalSha: finalized.sha256,
          packageManifestSha: finalized.packageManifestSha256,
          tier: finalized.assessment.tier,
          leafCount: finalized.metrics.leafCount,
          customerCharacters: finalized.metrics.customerCharacters,
          evidenceCharacters: finalized.metrics.evidenceCharacters,
          discoveredImages: selectedCandidate.assets.length,
          packagedImages: finalized.metrics.packagedImages,
          rejectedImages:
            selectedCandidate.assets.length - finalized.metrics.packagedImages,
          finalizeMs: Date.now() - finalizeStartedAt,
          uploadMs,
          readbackMs: Date.now() - readbackStartedAt,
        });
      } catch (error) {
        console.warn("[GEO KB]", {
          event: "final_archive_readback_failed",
          projectId: value.projectId,
          taskId: value.knowledgeBaseTaskId,
          finalFileId: file.id,
          diagnosticCode:
            error instanceof GeoHttpError
              ? error.code
              : "FINAL_ARCHIVE_UPLOAD_OR_READBACK_FAILED",
        });
        await broker.deleteFile(file.id).catch(() => undefined);
        throw error;
      }
      const nextValue: ProjectTokenValue = {
        ...value,
        companyName: finalCompanyName,
        ...(finalCompanyName !== value.companyName
          ? { companyNameSource: "input" as const }
          : {}),
        knowledgeBaseCandidateFailure: undefined,
        knowledgeBaseFinalization: {
          state: "completed",
          finalizerVersion: WEBSITE_KB_FINALIZER_VERSION,
          candidateSha256: candidateSha,
          retryAvailable: false,
          updatedAt: new Date().toISOString(),
        },
        archiveFileIds: Array.from(
          new Set([
            ...(value.archiveFileIds || []),
            ...(selectedCandidateDescriptor.fileId
              ? [selectedCandidateDescriptor.fileId]
              : []),
            file.id,
          ]),
        ),
        knowledgeBaseArtifact: {
          finalizerVersion: WEBSITE_KB_FINALIZER_VERSION,
          candidate: {
            taskId: value.knowledgeBaseTaskId,
            outputItemId: selectedCandidateDescriptor.outputItemId,
            ...(selectedCandidateDescriptor.fileId
              ? { fileId: selectedCandidateDescriptor.fileId }
              : {}),
            descriptorHash,
            sha256: candidateSha,
          },
          final: {
            fileId: file.id,
            filename: file.filename || filename,
            sha256: finalized.sha256,
            packageManifestSha256: finalized.packageManifestSha256,
            archiveContractVersion: 3,
            validationProfile: "website-lead-v1",
            finalizedAt: new Date().toISOString(),
          },
        },
      };
      return { value: nextValue, manifest: verifiedManifest };
    })()
      .then((result) => {
        knowledgeBaseFinalizationBackoffs.delete(finalizationKey);
        return result;
      })
      .catch((error) => {
        knowledgeBaseFinalizations.delete(finalizationKey);
        const attempts =
          (knowledgeBaseFinalizationBackoffs.get(finalizationKey)?.attempts ??
            0) + 1;
        knowledgeBaseFinalizationBackoffs.set(finalizationKey, {
          attempts,
          retryAt:
            Date.now() +
            Math.min(60_000, 2_000 * Math.pow(2, Math.min(attempts - 1, 5))),
        });
        throw error;
      })
      .finally(() => {
        const current = knowledgeBaseFinalizations.get(finalizationKey);
        if (current?.promise === promise) current.settled = true;
      });
    knowledgeBaseFinalizations.set(finalizationKey, {
      expiresAt: now + 10 * 60 * 1000,
      settled: false,
      promise,
    });
    return promise;
  };

  const maybeAutomaticallyRegenerateKnowledgeBase = async (
    value: ProjectTokenValue,
    knowledgeBaseTask: BrokerTask,
  ) => {
    const status = normalizeTaskStatus(knowledgeBaseTask.status);
    const failure = value.knowledgeBaseCandidateFailure;
    const retainedSource = knowledgeBaseSourceInputs.get(value.projectId);
    const shouldRetry =
      !value.knowledgeBaseAutomaticRetryUsed &&
      !value.knowledgeBaseRecovery?.automaticAttemptedAt &&
      Boolean(retainedSource && retainedSource.expiresAt > Date.now()) &&
      (["failed", "cancelled"].includes(status) ||
        Boolean(failure && failure.category !== "unsafe"));
    if (!shouldRetry) return { value, knowledgeBaseTask };

    const retryKey = `${value.projectId}:${value.knowledgeBaseTaskId}:automatic`;
    const now = Date.now();
    pruneExpiringMap(knowledgeBaseAutomaticRetries, now, 200);
    const running = knowledgeBaseAutomaticRetries.get(retryKey);
    if (running && running.expiresAt > now) return running.promise;

    const promise = (async () => {
      const source = retainedSource!.input;
      try {
        const created = await createWebsiteKnowledgeBaseTaskWithSkill(broker, {
          projectId: value.projectId,
          prompt: await buildWebsiteKnowledgeBasePrompt(source),
          attachments: source.attachments.map((attachment) => ({
            file_id: attachment.fileId,
            filename: attachment.filename,
          })),
          idempotencyKey: `geo:${value.projectId}:knowledge-base:automatic-regenerate`,
        });
        const taskId = taskIdFrom(created.task);
        if (!taskId) {
          await broker
            .deleteFile(created.skillAttachment.file_id)
            .catch(() => undefined);
          throw new Error("automatic knowledge-base task is missing an ID");
        }
        console.info("[GEO KB]", {
          event: "knowledge_base_auto_recovery_submitted",
          projectId: value.projectId,
          taskId,
          sourceTaskId: value.knowledgeBaseTaskId,
          idempotent: false,
        });
        return {
          value: {
            ...trackArchiveFile(value, knowledgeBaseTask),
            knowledgeBaseTaskId: taskId,
            knowledgeBaseSubmittedAt: new Date().toISOString(),
            knowledgeBaseAutomaticRetryUsed: true as const,
            knowledgeBaseRecovery: {
              automaticSourceTaskId: value.knowledgeBaseTaskId,
              automaticAttemptedAt: new Date().toISOString(),
              automaticResult: "submitted" as const,
            },
            knowledgeBaseCandidateFailure: undefined,
            knowledgeBaseFinalization: undefined,
            knowledgeBaseArtifact: undefined,
            temporaryFileIds: Array.from(
              new Set([
                ...(value.temporaryFileIds || []),
                created.skillAttachment.file_id,
              ]),
            ),
            previousKnowledgeBaseTaskIds: Array.from(
              new Set([
                ...(value.previousKnowledgeBaseTaskIds || []),
                value.knowledgeBaseTaskId,
              ]),
            ),
          },
          knowledgeBaseTask: created.task,
        };
      } catch (error) {
        console.warn("[GEO KB] automatic regeneration failed", {
          event: "knowledge_base_auto_recovery_skipped",
          projectId: value.projectId,
          taskId: value.knowledgeBaseTaskId,
          diagnosticCode:
            error instanceof Error ? error.name : "automatic_retry_error",
        });
        return {
          value: {
            ...value,
            knowledgeBaseAutomaticRetryUsed: true as const,
            knowledgeBaseRecovery: {
              automaticSourceTaskId: value.knowledgeBaseTaskId,
              automaticAttemptedAt: new Date().toISOString(),
              automaticResult: "failed" as const,
            },
            knowledgeBaseCandidateFailure: {
              category: "structure" as const,
              message: "自动重新生成未能启动，原始资料已保留",
            },
          },
          knowledgeBaseTask,
        };
      }
    })();
    knowledgeBaseAutomaticRetries.set(retryKey, {
      expiresAt: now + 10 * 60 * 1000,
      promise,
    });
    return promise;
  };

  const trackProjectOrder = (
    value: ProjectTokenValue,
    update: Omit<ProjectOrderProtection, "expiresAt">,
  ) => {
    const now = Date.now();
    pruneExpiringMap(projectOrderProtections, now, 20_000);
    const current = projectOrderProtections.get(value.projectId);
    projectOrderProtections.set(value.projectId, {
      expiresAt: now + PROJECT_TTL_MS,
      monitoring: update.monitoring
        ? { ...current?.monitoring, ...update.monitoring }
        : current?.monitoring,
      service: update.service ?? current?.service,
    });
  };

  const trackServiceOrder = (value: ProjectTokenValue) =>
    trackProjectOrder(value, { service: { value } });

  const writeProjectOrder = async (order: GeoProjectOrder) => {
    try {
      return await projectOrderRegistry.upsert(order);
    } catch {
      throw new GeoHttpError(
        "项目订单状态暂时无法安全保存，请稍后重试",
        503,
        "PROJECT_ORDER_REGISTRY_UNAVAILABLE",
      );
    }
  };

  const readProjectOrders = async (projectId: string) => {
    try {
      return await projectOrderRegistry.findByProject(projectId);
    } catch {
      throw new GeoHttpError(
        "暂时无法确认项目订单状态，已阻止继续操作",
        503,
        "PROJECT_ORDER_REGISTRY_UNAVAILABLE",
      );
    }
  };

  const createCheckoutIntent = async (
    value: ProjectTokenValue,
    purchaseType: GeoProjectOrder["purchaseType"],
    amountFen: number,
  ) => {
    const eventAt = new Date().toISOString();
    const nonce = crypto.randomUUID();
    return writeProjectOrder({
      orderId: `intent-${nonce}`,
      projectId: value.projectId,
      purchaseType,
      amountFen,
      authorizationDigest: sha256(`intent:${nonce}`),
      state: "pending",
      checkoutExpiresAt: new Date(
        Date.parse(eventAt) + PAYMENT_INTENT_TTL_MS,
      ).toISOString(),
      eventAt,
    });
  };

  const commitCheckoutIntent = async (
    intent: GeoProjectOrder,
    checkout: GeoPaymentCheckout,
  ) => {
    const order: GeoProjectOrder = {
      orderId: checkout.orderId,
      projectId: intent.projectId,
      purchaseType: intent.purchaseType,
      amountFen: checkout.amountFen,
      authorizationDigest: sha256(checkout.authorization),
      state: "pending",
      checkoutExpiresAt: checkout.expiresAt,
      eventAt: new Date().toISOString(),
    };
    try {
      return await projectOrderRegistry.commitIntent(intent.orderId, order);
    } catch {
      throw new GeoHttpError(
        "收银台订单暂时无法安全提交，请稍后重试",
        503,
        "PROJECT_ORDER_REGISTRY_UNAVAILABLE",
      );
    }
  };

  const closeCheckoutIntent = async (intent: GeoProjectOrder) =>
    writeProjectOrder({
      ...intent,
      state: "closed",
      eventAt: new Date().toISOString(),
    });

  const createDurableCheckout = async (input: {
    locks: Map<string, ServiceOrderLock>;
    lockKey: string;
    value: ProjectTokenValue;
    purchaseType: GeoProjectOrder["purchaseType"];
    amountFen: number;
    method: GeoPaymentMethod;
    methodLockedCode: string;
    createCheckout: () => Promise<GeoPaymentCheckout>;
  }) => {
    const now = Date.now();
    pruneExpiringMap(input.locks, now, 20_000);
    let lock = input.locks.get(input.lockKey);
    if (lock && lock.method !== input.method) {
      throw new GeoHttpError(
        `当前订单已选择${lock.method === "alipay" ? "支付宝" : "微信支付"}，请继续使用原支付方式`,
        409,
        input.methodLockedCode,
      );
    }
    const activeCheckout =
      lock?.checkout &&
      lock.checkoutCommitted &&
      Number.isFinite(Date.parse(lock.checkout.expiresAt)) &&
      Date.parse(lock.checkout.expiresAt) > now + 60_000
        ? lock.checkout
        : undefined;
    if (activeCheckout) {
      return { payment: activeCheckout, replayed: true };
    }
    if (lock?.checkout && lock.checkoutCommitted) {
      const closedOrder = await transitionProjectOrder(
        input.value.projectId,
        lock.checkout.orderId,
        "closed",
      );
      if (closedOrder.state !== "closed") {
        throw new GeoHttpError(
          "原订单已经进入付款或对账流程，不能创建新的收银台",
          409,
          "PROJECT_ORDER_DELETE_BLOCKED",
        );
      }
      lock.intent = undefined;
      lock.intentPromise = undefined;
      lock.checkout = undefined;
      lock.checkoutCommitted = false;
      lock.checkoutPromise = undefined;
    }
    if (!lock) {
      const persisted = await readProjectOrders(input.value.projectId);
      const existingBlockingOrder = persisted.orders.find(
        (order) =>
          order.purchaseType === input.purchaseType &&
          order.state !== "fulfilled" &&
          order.state !== "terminal_failed" &&
          order.state !== "closed",
      );
      if (existingBlockingOrder) {
        throw new GeoHttpError(
          "该项目已有未决或对账中的订单，请继续原订单或联系技术支持",
          409,
          "PROJECT_ORDER_DELETE_BLOCKED",
        );
      }
      lock = {
        method: input.method,
        expiresAt: now + PROJECT_TTL_MS,
      };
      input.locks.set(input.lockKey, lock);
    }
    if (!lock.intentPromise && !lock.intent) {
      lock.intentPromise = createCheckoutIntent(
        input.value,
        input.purchaseType,
        input.amountFen,
      );
    }
    const intent = lock.intent ?? (await lock.intentPromise!);
    lock.intent = intent;
    lock.intentPromise = undefined;
    if (!lock.checkoutPromise && !lock.checkout) {
      lock.checkoutPromise = input.createCheckout();
    }
    let payment: GeoPaymentCheckout;
    try {
      payment = lock.checkout ?? (await lock.checkoutPromise!);
      lock.checkout = payment;
      lock.checkoutPromise = undefined;
    } catch (error) {
      await closeCheckoutIntent(intent);
      if (input.locks.get(input.lockKey) === lock) {
        input.locks.delete(input.lockKey);
      }
      throw error;
    }
    await commitCheckoutIntent(intent, payment);
    lock.checkoutCommitted = true;
    return { payment, replayed: false };
  };

  const transitionProjectOrder = async (
    projectId: string,
    orderId: string,
    state: GeoProjectOrderState,
    facts: { paidAt?: string } = {},
  ) => {
    const projectOrders = await readProjectOrders(projectId);
    const current = projectOrders.orders.find(
      (order) => order.orderId === orderId,
    );
    if (!current) {
      throw new GeoHttpError(
        "项目订单账本缺少本次订单，已阻止继续操作",
        503,
        "PROJECT_ORDER_REGISTRY_UNAVAILABLE",
      );
    }
    if (current.state === "fulfilled" || current.state === "terminal_failed") {
      return current;
    }
    if (state === "closed" && current.state !== "pending") {
      return current;
    }
    if (
      current.state === "review_required" &&
      state !== "fulfilled" &&
      state !== "terminal_failed"
    ) {
      return current;
    }
    const progressRank: Partial<Record<GeoProjectOrderState, number>> = {
      pending: 0,
      paid: 1,
      fulfilling: 2,
    };
    if (
      progressRank[current.state] !== undefined &&
      progressRank[state] !== undefined &&
      progressRank[state]! < progressRank[current.state]!
    ) {
      return current;
    }
    const eventAt = new Date().toISOString();
    return writeProjectOrder({
      ...current,
      state,
      eventAt,
      paidAt: facts.paidAt || current.paidAt,
      fulfilledAt: state === "fulfilled" ? eventAt : current.fulfilledAt,
    });
  };

  const syncMonitoringOrder = async (
    value: ProjectTokenValue,
    run?: BrokerMonitorRun,
  ) => {
    if (!value.monitorOrderId || !run) return value;
    const state =
      run.status === "completed"
        ? "fulfilled"
        : run.status === "remote_failed"
          ? "terminal_failed"
          : run.status === "partial_review_required" ||
              run.status === "shape_mismatch"
            ? "review_required"
            : undefined;
    if (!state) return value;
    await transitionProjectOrder(value.projectId, value.monitorOrderId, state, {
      paidAt: value.monitorPaidAt,
    });
    return value;
  };

  const syncServiceOrder = async (value: ProjectTokenValue) => {
    if (!value.serviceOrderId) return value;
    const state: GeoProjectOrderState = isCompletedServiceOrder(value)
      ? "fulfilled"
      : isTerminalFailedServiceOrder(value)
        ? "terminal_failed"
        : value.serviceManualOrderStatus === "failed" ||
            value.serviceManualOrderStatus === "rejected" ||
            value.serviceProvisioningStatus === "failed" ||
            value.serviceKnowledgeImportStatus === "failed"
          ? "review_required"
          : "fulfilling";
    const order = await transitionProjectOrder(
      value.projectId,
      value.serviceOrderId,
      state,
      { paidAt: value.servicePaidAt },
    );
    return {
      ...value,
      serviceAuthorizationDigest: order.authorizationDigest,
      serviceCheckoutExpiresAt: order.checkoutExpiresAt,
    };
  };

  const assertProjectOrderAllowsDeletion = async (value: ProjectTokenValue) => {
    const now = Date.now();
    pruneExpiringMap(projectOrderProtections, now, 20_000);
    const protection = projectOrderProtections.get(value.projectId);
    const trackedServiceValue = protection?.service?.value;
    const serviceValue = latestServiceOrderValue(value, trackedServiceValue);
    if (
      (protection?.service || hasServiceOrderFacts(serviceValue)) &&
      !isCompletedServiceOrder(serviceValue) &&
      !isTerminalFailedServiceOrder(serviceValue)
    ) {
      throw new GeoHttpError(
        "当前项目存在未决、对账中或尚未完成履约的服务订单，暂不能删除",
        409,
        "PROJECT_ORDER_DELETE_BLOCKED",
      );
    }

    const monitorRunId =
      protection?.monitoring?.runId || value.monitorRunId || undefined;
    if (protection?.monitoring || value.monitorRunId) {
      if (!monitorRunId) {
        throw new GeoHttpError(
          "当前项目存在未决或对账中的监控订单，暂不能删除",
          409,
          "PROJECT_ORDER_DELETE_BLOCKED",
        );
      }
      let monitorRun: BrokerMonitorRun;
      try {
        monitorRun = await getResolvedMonitorRun(broker, monitorRunId, {
          platforms: value.monitorPlatformIds,
        });
      } catch {
        throw new GeoHttpError(
          "暂时无法确认监控订单已经完成或明确终止，已阻止删除",
          409,
          "PROJECT_ORDER_DELETE_BLOCKED",
        );
      }
      if (
        monitorRun.status !== "completed" &&
        monitorRun.status !== "remote_failed"
      ) {
        throw new GeoHttpError(
          "当前项目存在未决、对账中或尚未完成履约的监控订单，暂不能删除",
          409,
          "PROJECT_ORDER_DELETE_BLOCKED",
        );
      }
    }
  };

  // Project responses contain opaque capability tokens and must never be
  // retained by browsers, CDNs, or reverse-proxy caches.
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    next();
  });

  const resolveMonitorQuestion = async (
    value: ProjectTokenValue,
    questionId: string,
  ) => {
    if (!value.questionTaskId) {
      throw new GeoHttpError(
        "请先完成问题推荐并选择一个问题",
        409,
        "QUESTIONS_NOT_READY",
      );
    }
    const [knowledgeBaseTask, questionTask] = await Promise.all([
      getResolvedTask(broker, value.knowledgeBaseTaskId),
      getResolvedTask(broker, value.questionTaskId),
    ]);
    const questionSet = parseQuestionSetFromTask(questionTask);
    const question = findOwnedQuestion(
      value,
      questionSet?.questions,
      questionId,
    );
    if (!question) {
      throw new GeoHttpError(
        "所选问题不属于当前项目",
        400,
        "QUESTION_NOT_OWNED",
      );
    }
    if (!question.selectable || question.category === "industry_ranking") {
      throw new GeoHttpError(
        "行业排名类问题需要全域营销权限，不能在当前流程中购买监控",
        403,
        "QUESTION_NOT_SELECTABLE",
      );
    }
    return { knowledgeBaseTask, questionTask, question };
  };

  const resolveServiceScope = async (value: ProjectTokenValue) => {
    if (!value.monitorQuestionId || !value.monitorRunId) {
      throw new GeoHttpError(
        "请先完成问题监控与现状评估",
        409,
        "SERVICE_ASSESSMENT_REQUIRED",
      );
    }
    const resolved = await resolveMonitorQuestion(
      value,
      value.monitorQuestionId,
    );
    const category = resolved.question.category;
    if (
      category !== "reputation" &&
      category !== "product_scenario" &&
      category !== "competitor_comparison"
    ) {
      throw new GeoHttpError(
        "当前问题不支持自助启动服务",
        403,
        "SERVICE_CATEGORY_NOT_SUPPORTED",
      );
    }
    if (!value.assessmentTaskId || !value.optimizationForecastTaskId) {
      throw new GeoHttpError(
        "现状评估与优化效果评估完成后才能启动服务",
        409,
        "SERVICE_ASSESSMENT_REQUIRED",
      );
    }
    const [assessmentTask, forecastTask, monitorRun] = await Promise.all([
      getResolvedTask(broker, value.assessmentTaskId),
      getResolvedTask(broker, value.optimizationForecastTaskId),
      getResolvedMonitorRun(broker, value.monitorRunId, {
        question: resolved.question.question,
        platforms: value.monitorPlatformIds,
      }),
    ]);
    if (
      normalizeTaskStatus(assessmentTask.status) !== "completed" ||
      normalizeTaskStatus(forecastTask.status) !== "completed"
    ) {
      throw new GeoHttpError(
        "现状评估仍在生成，请完成后再启动服务",
        409,
        "SERVICE_ASSESSMENT_NOT_READY",
      );
    }
    const knowledgeEvidencePaths = await loadKnowledgeEvidencePaths(
      broker,
      value,
      value.knowledgeBaseTaskId,
      resolved.knowledgeBaseTask,
      value.companyName,
      value.knowledgeBaseValidationProfile,
    );
    try {
      validateServiceAssessmentOutputs(
        resolved.question,
        assessmentTask,
        forecastTask,
        monitorRun.platforms,
        monitorRun,
        knowledgeEvidencePaths,
      );
    } catch (error) {
      throw new GeoHttpError(
        error instanceof Error
          ? `现状评估或优化效果评估未通过结构校验：${error.message}`
          : "现状评估或优化效果评估未通过结构校验",
        409,
        "SERVICE_ASSESSMENT_INVALID",
      );
    }
    return {
      ...resolved,
      assessmentTask,
      forecastTask,
      monitorRun,
      category: category as GeoServiceCategory,
      amountFen: GEO_SERVICE_MONTHLY_PRICE_FEN[category],
    };
  };

  const mergePurchaseProvision = (
    value: ProjectTokenValue,
    response: GeoPurchaseProvisionResponseV2,
  ): ProjectTokenValue => {
    if (
      response.purchase.projectId !== value.projectId ||
      response.purchase.orderId !== value.serviceOrderId ||
      (value.serviceProvisioningReference &&
        response.purchase.reference !== value.serviceProvisioningReference)
    ) {
      throw new GeoHttpError(
        "服务开通结果与当前订单不匹配",
        502,
        "PURCHASE_PROVISIONING_SCOPE_MISMATCH",
      );
    }
    return {
      ...value,
      serviceProvisioningVersion: 2,
      serviceProvisioningReference: response.purchase.reference,
      serviceProvisioningStatus: response.purchase.status,
      serviceProvisioningMessage: response.purchase.message,
      serviceProvisioningRetryable: response.purchase.retryable,
      serviceProvisioningErrorCode: response.purchase.errorCode,
      serviceProvisioningUpdatedAt: response.purchase.updatedAt,
      serviceAccountUsername: response.account
        ? response.account.username
        : value.serviceAccountUsername,
      serviceAccountDisplayName: response.account
        ? response.account.displayName
        : value.serviceAccountDisplayName,
      serviceAccountSetupUrl: response.account
        ? response.account.accountSetupUrl
        : value.serviceAccountSetupUrl,
      serviceWorkspaceUrl: response.account
        ? response.account.workspaceUrl
        : value.serviceWorkspaceUrl,
      serviceProvisionedAt:
        response.purchase.status === "provisioned"
          ? response.purchase.updatedAt
          : value.serviceProvisionedAt,
    };
  };

  const mergeManualOrder = (
    value: ProjectTokenValue,
    response: GeoManualServiceOrderResponse,
  ): ProjectTokenValue => {
    if (
      response.order.projectId !== value.projectId ||
      response.order.amountFen !== value.serviceAmountFen ||
      (value.serviceManualOrderReference &&
        response.order.reference !== value.serviceManualOrderReference)
    ) {
      throw new GeoHttpError(
        "合同订单与当前服务范围不匹配",
        502,
        "MANUAL_ORDER_SCOPE_MISMATCH",
      );
    }
    return {
      ...value,
      serviceManualOrderReference: response.order.reference,
      serviceManualOrderStatus: response.order.status,
      serviceManualOrderMessage: response.order.message,
      serviceManualOrderRetryable: response.order.retryable,
      serviceManualOrderUpdatedAt: response.order.updatedAt,
      serviceManualContractId:
        response.order.contractId || value.serviceManualContractId,
      serviceManualSigningUrl:
        response.order.signingUrl || value.serviceManualSigningUrl,
      serviceManualSignedAt:
        response.order.signedAt || value.serviceManualSignedAt,
      serviceProvisioningReference:
        response.order.provisioningReference ||
        value.serviceProvisioningReference,
      serviceAccountUsername: response.account
        ? response.account.username
        : value.serviceAccountUsername,
      serviceAccountDisplayName: response.account
        ? response.account.displayName
        : value.serviceAccountDisplayName,
      serviceAccountSetupUrl: response.account
        ? response.account.accountSetupUrl
        : value.serviceAccountSetupUrl,
      serviceWorkspaceUrl: response.account
        ? response.account.workspaceUrl
        : value.serviceWorkspaceUrl,
      serviceProvisionedAt:
        response.order.status === "active"
          ? response.order.updatedAt
          : value.serviceProvisionedAt,
    };
  };

  const mergeKnowledgeImport = (
    value: ProjectTokenValue,
    response: GeoKnowledgeImportResponse,
    sha256: string,
    idempotencyKey: string,
  ): ProjectTokenValue => {
    if (response.knowledgeImport.projectId !== value.projectId) {
      throw new GeoHttpError(
        "知识库接入结果与当前项目不匹配",
        502,
        "KNOWLEDGE_IMPORT_SCOPE_MISMATCH",
      );
    }
    return {
      ...value,
      serviceKnowledgeImportId: response.knowledgeImport.id,
      serviceKnowledgeImportStatus: response.knowledgeImport.status,
      serviceKnowledgeImportMessage: response.knowledgeImport.message,
      serviceKnowledgeImportRetryable: response.knowledgeImport.retryable,
      serviceKnowledgeImportUpdatedAt: response.knowledgeImport.updatedAt,
      serviceKnowledgeArtifactSha256: sha256,
      serviceKnowledgeIdempotencyKey: idempotencyKey,
      serviceWorkspaceUrl:
        response.knowledgeImport.workspaceUrl || value.serviceWorkspaceUrl,
      serviceActivatedAt:
        response.knowledgeImport.status === "ready"
          ? response.knowledgeImport.updatedAt
          : value.serviceActivatedAt,
    };
  };

  const handoffKnowledgeBase = async (
    value: ProjectTokenValue,
    knowledgeBaseTask: BrokerTask,
  ): Promise<ProjectTokenValue> => {
    const purchaseProvisionReady = Boolean(
      value.serviceProvisioningVersion === 2 &&
        value.serviceProvisioningStatus === "provisioned" &&
        value.serviceProvisioningReference &&
        value.serviceOrderId,
    );
    const manualOrderReady = Boolean(
      value.serviceManualOrderReference &&
        value.serviceManualOrderStatus === "active" &&
        value.serviceProvisioningReference &&
        value.serviceOrderId,
    );
    if (!purchaseProvisionReady && !manualOrderReady) {
      return value;
    }
    if (value.serviceKnowledgeImportStatus === "ready") return value;

    try {
      if (normalizeTaskStatus(knowledgeBaseTask.status) !== "completed") {
        throw new GeoHttpError(
          "基础版知识库尚未生成完成，请稍后重试同步",
          409,
          "ARCHIVE_NOT_READY",
        );
      }
      value = (
        await ensureFinalizedKnowledgeBase(
          trackArchiveFile(value, knowledgeBaseTask),
          knowledgeBaseTask,
        )
      ).value;
      const artifact = value.knowledgeBaseArtifact;
      if (!artifact || value.knowledgeBaseCandidateFailure) {
        throw new GeoHttpError(
          "基础版知识库尚未完成确定性整理",
          409,
          "ARCHIVE_NOT_READY",
        );
      }
      // The Agent import endpoint still uses the v1 wire-contract literal.
      // The archive itself remains tagged with the internal v2 finalizer version.
      const importFinalizerVersion = "website-kb-finalizer-v1" as const;
      const idempotencyKey = [
        "geo-basic",
        value.projectId,
        artifact.final.sha256,
        artifact.final.packageManifestSha256,
        importFinalizerVersion,
        "knowledge-v4",
      ].join(":");
      const imported = await knowledgeImporter(value.projectId, {
        schemaVersion: 4,
        companyName: value.companyName,
        candidate: artifact.candidate,
        finalArtifact: {
          fileId: artifact.final.fileId,
          filename: artifact.final.filename,
          sha256: artifact.final.sha256,
          archiveContractVersion: 3,
          validationProfile: "website-lead-v1",
          packageManifestSha256: artifact.final.packageManifestSha256,
          finalizerVersion: importFinalizerVersion,
        },
      });
      return mergeKnowledgeImport(
        value,
        imported,
        artifact.final.sha256,
        idempotencyKey,
      );
    } catch (error) {
      const normalized = normalizeError(error);
      return {
        ...value,
        serviceKnowledgeImportStatus: "failed",
        serviceKnowledgeImportMessage: normalized.message,
        serviceKnowledgeImportRetryable:
          [408, 409, 425, 429].includes(normalized.status) ||
          normalized.status >= 500,
        serviceKnowledgeImportUpdatedAt: new Date().toISOString(),
      };
    }
  };

  const requireConfiguration = (
    _req: Request,
    _res: Response,
    next: NextFunction,
  ) => {
    if (configurationError) {
      next(new GeoHttpError(configurationError, 503, "GEO_NOT_CONFIGURED"));
      return;
    }
    next();
  };

  const assertMonitorProviderReady = async () => {
    const status = await broker.getStatus();
    if (
      !status.ok ||
      !status.credentialConfigured ||
      !status.monitorCredentialConfigured
    ) {
      throw new GeoHttpError(
        "监控服务尚未通过上线就绪检查，请稍后再支付",
        503,
        "MONITOR_PROVIDER_NOT_READY",
      );
    }
  };

  const assertServiceWorkspaceReady = async () => {
    const status = await broker.getStatus();
    if (
      !status.ok ||
      !status.credentialConfigured ||
      status.publicUrlConfigured !== true
    ) {
      throw new GeoHttpError(
        "企业工作台尚未通过上线就绪检查，请稍后再支付",
        503,
        "SERVICE_WORKSPACE_NOT_READY",
      );
    }
  };

  const requireSession = (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = parseCookies(req.headers.cookie).get(SESSION_COOKIE);
      if (!token) throw new GeoTokenError();
      const session = codec.open<SessionTokenValue>(token, "session").value;
      if (!session.nonce) throw new GeoTokenError();
      _res.locals.geoSessionId = session.nonce;
      next();
    } catch {
      next(new GeoHttpError("请先输入有效邀请码", 401, "INVITE_REQUIRED"));
    }
  };

  const consumeSessionRate = (
    res: Response,
    action: string,
    limit: number,
    amount = 1,
    windowMs = SESSION_RATE_LIMIT_WINDOW_MS,
  ) => {
    const sessionId = String(res.locals.geoSessionId || "");
    if (!sessionId)
      throw new GeoHttpError("请先输入有效邀请码", 401, "INVITE_REQUIRED");
    const now = Date.now();
    pruneExpiringMap(sessionRates, now, 10_000);
    const key = `${sessionId}:${action}`;
    const current = sessionRates.get(key);
    const active =
      current && current.resetAt > now
        ? current
        : { count: 0, resetAt: now + windowMs };
    if (active.count + amount > limit) {
      throw new GeoHttpError(
        "当前邀请会话请求过于频繁，请稍后再试",
        429,
        "SESSION_RATE_LIMITED",
      );
    }
    active.count += amount;
    sessionRates.set(key, active);
  };

  const consumeIdentityRate = (
    req: Request,
    action: string,
    limit: number,
    amount = 1,
    windowMs = SESSION_RATE_LIMIT_WINDOW_MS,
  ) => {
    const now = Date.now();
    pruneExpiringMap(identityRates, now, 10_000);
    const key = `${requestRateLimitKey(req)}:${action}`;
    const current = identityRates.get(key);
    const active =
      current && current.resetAt > now
        ? current
        : { count: 0, resetAt: now + windowMs };
    if (active.count + amount > limit) {
      throw new GeoHttpError(
        "当前网络来源请求过于频繁，请稍后再试",
        429,
        "IDENTITY_RATE_LIMITED",
      );
    }
    active.count += amount;
    identityRates.set(key, active);
  };

  const requireSessionRate =
    (action: string, limit: number, windowMs = SESSION_RATE_LIMIT_WINDOW_MS) =>
    (_req: Request, res: Response, next: NextFunction) => {
      try {
        consumeSessionRate(res, action, limit, 1, windowMs);
        next();
      } catch (error) {
        next(error);
      }
    };

  const requireCostRate =
    (action: string, limit: number, windowMs = SESSION_RATE_LIMIT_WINDOW_MS) =>
    (req: Request, res: Response, next: NextFunction) => {
      try {
        consumeSessionRate(res, action, limit, 1, windowMs);
        consumeIdentityRate(req, action, limit, 1, windowMs);
        next();
      } catch (error) {
        next(error);
      }
    };

  const openOwnedProject = (req: Request, res: Response) => {
    const { value } = codec.open<ProjectTokenValue>(
      req.params.projectToken,
      "project",
    );
    if (
      !value.ownerSessionId ||
      value.ownerSessionId !== String(res.locals.geoSessionId || "")
    ) {
      throw new GeoHttpError(
        "项目不属于当前邀请会话",
        403,
        "PROJECT_SESSION_MISMATCH",
      );
    }
    return value;
  };

  const limitUploadConcurrency = (
    _req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    const sessionId = String(res.locals.geoSessionId || "");
    const sessionActive = activeUploadsBySession.get(sessionId) || 0;
    if (activeUploads >= 2 || sessionActive >= 1) {
      next(
        new GeoHttpError(
          "已有文件正在上传，请等待当前上传完成",
          429,
          "UPLOAD_CONCURRENCY_LIMITED",
        ),
      );
      return;
    }
    activeUploads += 1;
    activeUploadsBySession.set(sessionId, sessionActive + 1);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      activeUploads = Math.max(0, activeUploads - 1);
      const remaining = (activeUploadsBySession.get(sessionId) || 1) - 1;
      if (remaining > 0) activeUploadsBySession.set(sessionId, remaining);
      else activeUploadsBySession.delete(sessionId);
    };
    res.once("finish", release);
    res.once("close", release);
    next();
  };

  const requireUploadToken = (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const token =
        headerValue(req, "x-geo-upload-token") || stringQuery(req.query.token);
      if (!token)
        throw new GeoHttpError("缺少上传令牌", 400, "UPLOAD_TOKEN_REQUIRED");
      const payload = codec.open<UploadTokenValue>(token, "upload").value;
      if (
        !payload.sessionId ||
        payload.sessionId !== String(res.locals.geoSessionId || "")
      ) {
        throw new GeoHttpError(
          "上传令牌不属于当前邀请会话",
          403,
          "UPLOAD_TOKEN_SESSION_MISMATCH",
        );
      }
      const contentLength = Number(req.headers["content-length"] || 0);
      if (
        contentLength &&
        (!Number.isSafeInteger(contentLength) ||
          contentLength < 0 ||
          contentLength !== payload.sizeBytes)
      ) {
        throw new GeoHttpError(
          "上传文件大小与申请记录不一致",
          400,
          "UPLOAD_SIZE_MISMATCH",
        );
      }
      res.locals.geoUpload = payload;
      next();
    } catch (error) {
      next(error);
    }
  };

  router.put(
    "/uploads/proxy",
    requireConfiguration,
    requireSession,
    requireSessionRate("upload-content", 30),
    requireUploadToken,
    limitUploadConcurrency,
    express.raw({ type: "*/*", limit: MAX_UPLOAD_BYTES }),
    asyncHandler(async (req, res) => {
      const payload = res.locals.geoUpload as UploadTokenValue;
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      if (!body.length)
        throw new GeoHttpError("上传内容为空", 400, "EMPTY_UPLOAD");
      if (body.length !== payload.sizeBytes)
        throw new GeoHttpError(
          "上传文件大小与申请记录不一致",
          400,
          "UPLOAD_SIZE_MISMATCH",
        );
      const originalContentType =
        headerValue(req, "x-original-content-type") ||
        req.headers["content-type"] ||
        "";
      if (
        payload.contentType &&
        String(originalContentType).split(";")[0].trim().toLowerCase() !==
          payload.contentType.split(";")[0].trim().toLowerCase()
      ) {
        throw new GeoHttpError(
          "上传文件类型与申请记录不一致",
          400,
          "UPLOAD_TYPE_MISMATCH",
        );
      }
      const result = await broker.uploadFile(
        payload.fileId,
        body,
        String(originalContentType),
        payload.upstreamUploadTicket,
      );
      res.json({
        ok: true,
        fileId: payload.fileId,
        filename: payload.filename,
        status: uploadStatus(result),
      });
    }),
  );

  router.use(express.json({ limit: "1mb" }));

  router.get("/payments/notify", async (req, res) => {
    try {
      const result = await paymentGateway.verifyCallback(
        paymentCallbackParameters(req.query),
      );
      if (!["paid", "review_required"].includes(result.status)) {
        throw new Error("payment is not complete");
      }
      res.status(200).type("text/plain").send("success");
    } catch (error) {
      console.warn(
        "[GEO payment] Rejected ZPAY notification:",
        error instanceof GeoPaymentVerificationError
          ? error.code
          : "PAYMENT_CALLBACK_INVALID",
      );
      res.status(400).type("text/plain").send("fail");
    }
  });

  router.get("/payments/return", async (req, res) => {
    let returnStatus: "paid" | "review_required" | "unverified" = "unverified";
    try {
      const result = await paymentGateway.verifyCallback(
        paymentCallbackParameters(req.query),
      );
      if (result.status === "paid" || result.status === "review_required") {
        returnStatus = result.status;
      }
    } catch {
      returnStatus = "unverified";
    }
    const verified = returnStatus !== "unverified";
    res
      .status(verified ? 200 : 400)
      .setHeader(
        "Content-Security-Policy",
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      );
    res.type("html").send(paymentReturnPage(returnStatus));
  });

  router.post(
    "/invite/verify",
    requireConfiguration,
    asyncHandler(async (req, res) => {
      const key = requestRateLimitKey(req);
      const now = Date.now();
      pruneExpiringMap(failedInvites, now, 2000);
      const current = failedInvites.get(key);
      if (current && current.resetAt > now && current.count >= 5) {
        res.setHeader(
          "Retry-After",
          String(Math.max(1, Math.ceil((current.resetAt - now) / 1000))),
        );
        throw new GeoHttpError(
          "尝试次数过多，请稍后再试",
          429,
          "INVITE_RATE_LIMITED",
        );
      }

      const { code } = InviteRequestSchema.parse(req.body);
      if (!safeSecretEqual(code.trim(), inviteCode)) {
        const active =
          current && current.resetAt > now
            ? current
            : { count: 0, resetAt: now + 15 * 60 * 1000 };
        active.count += 1;
        failedInvites.set(key, active);
        pruneExpiringMap(failedInvites, now, 2000);
        throw new GeoHttpError("邀请码不正确", 401, "INVALID_INVITE_CODE");
      }

      consumeIdentityRate(req, "invite-success", 12);
      failedInvites.delete(key);
      const expiresAt = now + SESSION_TTL_MS;
      const existingToken = parseCookies(req.headers.cookie).get(
        SESSION_COOKIE,
      );
      let nonce = "";
      if (existingToken) {
        try {
          const existingSession = codec.open<SessionTokenValue>(
            existingToken,
            "session",
          ).value;
          if (existingSession.scope === "geo" && existingSession.nonce) {
            nonce = existingSession.nonce;
          }
        } catch {
          // An absent, expired, or invalid cookie starts a new browser session.
        }
      }
      const token = codec.seal(
        "session",
        { scope: "geo", nonce: nonce || crypto.randomUUID() },
        SESSION_TTL_MS,
      );
      res.cookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: production,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_TTL_MS,
      });
      res.json({ ok: true, expiresAt });
    }),
  );

  router.get("/session", requireConfiguration, requireSession, (_req, res) =>
    res.json({ ok: true }),
  );

  router.post(
    "/uploads/init",
    requireConfiguration,
    requireSession,
    requireSessionRate("upload-init", 20),
    asyncHandler(async (req, res) => {
      const input = UploadInitRequestSchema.parse(req.body);
      consumeSessionRate(
        res,
        "upload-bytes",
        200 * 1024 * 1024,
        input.sizeBytes,
      );
      consumeIdentityRate(
        req,
        "upload-bytes",
        200 * 1024 * 1024,
        input.sizeBytes,
      );
      const filename = sanitizeFilename(input.filename, "company-material");
      const file = await broker.createFile({
        filename,
        mimeType: input.contentType,
        sizeBytes: input.sizeBytes,
      });
      if (!file.id)
        throw new GeoHttpError("创建上传文件失败", 502, "UPLOAD_INIT_FAILED");
      const uploadToken = codec.seal<UploadTokenValue>(
        "upload",
        {
          fileId: file.id,
          filename: file.filename || filename,
          sessionId: String(res.locals.geoSessionId || ""),
          sizeBytes: input.sizeBytes,
          contentType: input.contentType,
          upstreamUploadTicket: file.proxy_upload_ticket,
        },
        UPLOAD_TTL_MS,
      );
      res.status(201).json({
        fileId: file.id,
        filename: file.filename || filename,
        uploadToken,
        directUploadUrl: file.upload_url || undefined,
        uploadExpiresAt: file.upload_expires_at || undefined,
      });
    }),
  );

  router.post(
    "/projects",
    requireConfiguration,
    requireSession,
    requireCostRate("project-create", 5),
    asyncHandler(async (req, res) => {
      const input = CreateProjectRequestSchema.parse(req.body);
      const uploads = validateProjectAttachments(
        input,
        codec,
        String(res.locals.geoSessionId || ""),
      );
      const projectId = input.clientRequestId
        ? deterministicProjectId(
            String(res.locals.geoSessionId || ""),
            input.clientRequestId,
            input,
          )
        : crypto.randomUUID();
      const created = await createWebsiteKnowledgeBaseTaskWithSkill(broker, {
        projectId,
        prompt: await buildWebsiteKnowledgeBasePrompt(input),
        attachments: input.attachments.map((attachment) => ({
          file_id: attachment.fileId,
          filename: sanitizeFilename(attachment.filename, "company-material"),
        })),
        idempotencyKey: `geo:${projectId}:knowledge-base:1`,
      });
      const task = created.task;
      const taskId = taskIdFrom(task);
      if (!taskId) {
        await broker
          .deleteFile(created.skillAttachment.file_id)
          .catch(() => undefined);
        throw new GeoHttpError(
          "创建知识库任务失败：缺少任务 ID",
          502,
          "TASK_ID_MISSING",
        );
      }

      const companyIdentity = deriveCompanyIdentity(input);
      pruneExpiringMap(knowledgeBaseSourceInputs, Date.now(), 20_000);
      knowledgeBaseSourceInputs.set(projectId, {
        expiresAt: Date.now() + PROJECT_TTL_MS,
        input: {
          input: input.input,
          ...(input.companyName ? { companyName: input.companyName } : {}),
          ...(input.companyWebsite
            ? { companyWebsite: input.companyWebsite }
            : {}),
          ...(input.operatorNotes
            ? { operatorNotes: input.operatorNotes }
            : {}),
          attachments: input.attachments.map((attachment) => ({
            fileId: attachment.fileId,
            filename: sanitizeFilename(attachment.filename, "company-material"),
          })),
        },
      });
      const value: ProjectTokenValue = {
        projectId,
        ownerSessionId: String(res.locals.geoSessionId || ""),
        companyName: companyIdentity.name,
        companyNameSource: companyIdentity.source,
        knowledgeBaseTaskId: taskId,
        knowledgeBaseSubmittedAt: new Date().toISOString(),
        knowledgeBaseValidationProfile: "website-lead-v1",
        uploadFileIds: uploads.map((upload) => upload.fileId),
        temporaryFileIds: [created.skillAttachment.file_id],
      };
      const projectToken = codec.seal("project", value, PROJECT_TTL_MS);
      const project = await buildProjectView(
        broker,
        value,
        projectToken,
        task,
        undefined,
      );
      res.status(201).json({ projectToken, project });
    }),
  );

  router.get(
    "/projects/:projectToken",
    requireConfiguration,
    requireSession,
    requireSessionRate("project-read", 120, 60 * 1000),
    asyncHandler(async (req, res) => {
      const value = openOwnedProject(req, res);
      const [
        knowledgeBaseTask,
        initialQuestionTask,
        rawMonitorRun,
        assessmentTask,
        optimizationForecastTask,
      ] = await Promise.all([
        getResolvedTask(broker, value.knowledgeBaseTaskId),
        value.questionTaskId
          ? getResolvedTask(broker, value.questionTaskId)
          : Promise.resolve(undefined),
        value.monitorRunId
          ? getResolvedMonitorRun(broker, value.monitorRunId, {
              platforms: value.monitorPlatformIds,
            })
          : Promise.resolve(undefined),
        value.assessmentTaskId
          ? getResolvedTask(broker, value.assessmentTaskId)
          : Promise.resolve(undefined),
        value.optimizationForecastTaskId
          ? getResolvedTask(broker, value.optimizationForecastTaskId)
          : Promise.resolve(undefined),
      ]);
      const previousFinalFileId = value.knowledgeBaseArtifact?.final.fileId;
      const finalizedKnowledgeBase = await ensureFinalizedKnowledgeBase(
        trackArchiveFile(value, knowledgeBaseTask),
        knowledgeBaseTask,
      );
      const automaticRegeneration =
        await maybeAutomaticallyRegenerateKnowledgeBase(
          finalizedKnowledgeBase.value,
          knowledgeBaseTask,
        );
      const currentKnowledgeBaseTask = automaticRegeneration.knowledgeBaseTask;
      const automaticRecoveryFailed =
        automaticRegeneration.value.knowledgeBaseRecovery?.automaticResult ===
          "submitted" &&
        (["failed", "cancelled"].includes(
          normalizeTaskStatus(currentKnowledgeBaseTask.status),
        ) ||
          Boolean(automaticRegeneration.value.knowledgeBaseCandidateFailure));
      const recoveredValue = automaticRecoveryFailed
        ? {
            ...automaticRegeneration.value,
            knowledgeBaseRecovery: {
              ...automaticRegeneration.value.knowledgeBaseRecovery,
              automaticResult: "failed" as const,
            },
          }
        : automaticRegeneration.value;
      let currentValue = await resolveCanonicalCompanyIdentity(
        broker,
        recoveredValue,
        currentKnowledgeBaseTask,
        { allowInvalidArchiveForProjectView: true },
      );
      currentValue = await syncMonitoringOrder(currentValue, rawMonitorRun);
      currentValue = await syncServiceOrder(currentValue);
      let currentToken: string;
      try {
        currentToken =
          currentValue === value
            ? req.params.projectToken
            : codec.seal("project", currentValue, PROJECT_TTL_MS);
      } catch (error) {
        const currentFinalFileId =
          currentValue.knowledgeBaseArtifact?.final.fileId;
        if (currentFinalFileId && currentFinalFileId !== previousFinalFileId) {
          await broker.deleteFile(currentFinalFileId).catch(() => undefined);
        }
        throw error;
      }
      const project = await buildProjectView(
        broker,
        currentValue,
        currentToken,
        currentKnowledgeBaseTask,
        initialQuestionTask,
        rawMonitorRun,
        assessmentTask,
        optimizationForecastTask,
      );
      res.json({ projectToken: currentToken, project });
    }),
  );

  router.post(
    "/projects/:projectToken/knowledge-base/finalization/retry",
    requireConfiguration,
    requireSession,
    requireSessionRate("knowledge-base-finalization-retry", 8, 60 * 1000),
    asyncHandler(async (req, res) => {
      const value = openOwnedProject(req, res);
      if (
        value.knowledgeBaseFinalization?.state !== "failed_internal" ||
        value.knowledgeBaseFinalization.retryAvailable !== true
      ) {
        throw new GeoHttpError(
          "当前项目没有可重试的知识库最终整理任务",
          409,
          "KB_FINALIZATION_RETRY_NOT_AVAILABLE",
        );
      }
      const knowledgeBaseTask = await getResolvedTask(
        broker,
        value.knowledgeBaseTaskId,
      );
      if (normalizeTaskStatus(knowledgeBaseTask.status) !== "completed") {
        throw new GeoHttpError(
          "候选资料尚未生成完成，暂不能重试最终整理",
          409,
          "KB_FINALIZATION_CANDIDATE_NOT_READY",
        );
      }
      const previousFinalFileId = value.knowledgeBaseArtifact?.final.fileId;
      const finalized = await ensureFinalizedKnowledgeBase(
        trackArchiveFile(value, knowledgeBaseTask),
        knowledgeBaseTask,
        { force: true },
      );
      const nextValue = await resolveCanonicalCompanyIdentity(
        broker,
        finalized.value,
        knowledgeBaseTask,
        { allowInvalidArchiveForProjectView: true },
      );
      let projectToken: string;
      try {
        projectToken = codec.seal("project", nextValue, PROJECT_TTL_MS);
      } catch (error) {
        const currentFinalFileId =
          nextValue.knowledgeBaseArtifact?.final.fileId;
        if (currentFinalFileId && currentFinalFileId !== previousFinalFileId) {
          await broker.deleteFile(currentFinalFileId).catch(() => undefined);
        }
        throw error;
      }
      const questionTask = nextValue.questionTaskId
        ? await getResolvedTask(broker, nextValue.questionTaskId)
        : undefined;
      const project = await buildProjectView(
        broker,
        nextValue,
        projectToken,
        knowledgeBaseTask,
        questionTask,
      );
      res.json({ projectToken, project });
    }),
  );

  router.post(
    "/projects/:projectToken/retry",
    requireConfiguration,
    requireSession,
    requireCostRate("project-retry", 4),
    asyncHandler(async (req, res) => {
      let value = openOwnedProject(req, res);
      const originalValue = value;
      const retryInput = RetryProjectRequestSchema.parse(req.body);
      const retryAttachments = validateRetryProjectAttachments(
        retryInput,
        value,
      );
      const currentTask = await getResolvedTask(
        broker,
        value.knowledgeBaseTaskId,
      );
      const currentStatus = normalizeTaskStatus(currentTask.status);
      if (currentStatus === "completed") {
        value = (
          await ensureFinalizedKnowledgeBase(
            trackArchiveFile(value, currentTask),
            currentTask,
          )
        ).value;
      }
      if (
        !["failed", "cancelled"].includes(currentStatus) &&
        !value.knowledgeBaseCandidateFailure
      ) {
        const currentToken =
          value === originalValue
            ? req.params.projectToken
            : codec.seal("project", value, PROJECT_TTL_MS);
        const project = await buildProjectView(
          broker,
          value,
          currentToken,
          currentTask,
          undefined,
        );
        res.json({ projectToken: currentToken, project });
        return;
      }
      if (value.knowledgeBaseCandidateFailure?.category === "unsafe") {
        throw new GeoHttpError(
          KNOWLEDGE_BASE_VALIDATION_PUBLIC_ERRORS.unsafe,
          422,
          "KNOWLEDGE_BASE_UNSAFE_BLOCKED",
        );
      }
      if (
        retryInput.trigger === "automatic" &&
        (value.knowledgeBaseAutomaticRetryUsed ||
          Boolean(value.knowledgeBaseRecovery?.automaticAttemptedAt))
      ) {
        console.info("[GEO KB]", {
          event: "knowledge_base_auto_recovery_skipped",
          projectId: value.projectId,
          taskId: value.knowledgeBaseTaskId,
          diagnosticCode: "automatic_recovery_already_attempted",
          idempotent: true,
        });
        const currentToken =
          value === originalValue
            ? req.params.projectToken
            : codec.seal("project", value, PROJECT_TTL_MS);
        const project = await buildProjectView(
          broker,
          value,
          currentToken,
          currentTask,
          undefined,
        );
        res.json({ projectToken: currentToken, project });
        return;
      }
      const normalizedRetryInput: RetryProjectRequest = {
        ...retryInput,
        attachments: retryAttachments,
      };
      const created = await createWebsiteKnowledgeBaseTaskWithSkill(broker, {
        projectId: value.projectId,
        prompt: await buildWebsiteKnowledgeBasePrompt(normalizedRetryInput),
        attachments: normalizedRetryInput.attachments.map((attachment) => ({
          file_id: attachment.fileId,
          filename: attachment.filename,
        })),
        idempotencyKey: `geo:${value.projectId}:knowledge-base:regenerate:${value.knowledgeBaseTaskId}`,
      });
      const task = created.task;
      const taskId = taskIdFrom(task);
      if (!taskId) {
        await broker
          .deleteFile(created.skillAttachment.file_id)
          .catch(() => undefined);
        throw new GeoHttpError(
          "重新创建企业分析任务失败：缺少任务 ID",
          502,
          "TASK_ID_MISSING",
        );
      }
      const retrySubmittedAt = new Date().toISOString();
      console.info("[GEO KB]", {
        event:
          retryInput.trigger === "automatic"
            ? "knowledge_base_auto_recovery_submitted"
            : "knowledge_base_manual_retry_submitted",
        projectId: value.projectId,
        taskId,
        sourceTaskId: value.knowledgeBaseTaskId,
        idempotent: false,
      });
      const nextValue: ProjectTokenValue = {
        ...trackArchiveFile(value, currentTask),
        knowledgeBaseTaskId: taskId,
        knowledgeBaseSubmittedAt: retrySubmittedAt,
        knowledgeBaseValidationProfile: "website-lead-v1",
        knowledgeBaseAutomaticRetryUsed: true,
        knowledgeBaseRecovery:
          retryInput.trigger === "automatic"
            ? {
                automaticSourceTaskId: value.knowledgeBaseTaskId,
                automaticAttemptedAt: retrySubmittedAt,
                automaticResult: "submitted",
              }
            : value.knowledgeBaseRecovery
              ? {
                  ...value.knowledgeBaseRecovery,
                  automaticResult: "failed",
                }
              : undefined,
        knowledgeBaseCandidateFailure: undefined,
        knowledgeBaseFinalization: undefined,
        knowledgeBaseArtifact: undefined,
        temporaryFileIds: Array.from(
          new Set([
            ...(value.temporaryFileIds || []),
            created.skillAttachment.file_id,
          ]),
        ),
        previousKnowledgeBaseTaskIds: Array.from(
          new Set([
            ...(value.previousKnowledgeBaseTaskIds || []),
            value.knowledgeBaseTaskId,
          ]),
        ),
      };
      const projectToken = codec.seal("project", nextValue, PROJECT_TTL_MS);
      const project = await buildProjectView(
        broker,
        nextValue,
        projectToken,
        task,
        undefined,
      );
      res.status(201).json({ projectToken, project });
    }),
  );

  router.post(
    "/projects/:projectToken/questions",
    requireConfiguration,
    requireSession,
    requireCostRate("question-create", 12),
    asyncHandler(async (req, res) => {
      let value = openOwnedProject(req, res);
      if (value.questionTaskId) {
        const [knowledgeBaseTask, questionTask] = await Promise.all([
          getResolvedTask(broker, value.knowledgeBaseTaskId),
          getResolvedTask(broker, value.questionTaskId),
        ]);
        const currentValue = trackArchiveFile(value, knowledgeBaseTask);
        const currentToken =
          currentValue === value
            ? req.params.projectToken
            : codec.seal("project", currentValue, PROJECT_TTL_MS);
        const project = await buildProjectView(
          broker,
          currentValue,
          currentToken,
          knowledgeBaseTask,
          questionTask,
        );
        res.json({ projectToken: currentToken, project });
        return;
      }

      const knowledgeBaseTask = await getResolvedTask(
        broker,
        value.knowledgeBaseTaskId,
      );
      if (normalizeTaskStatus(knowledgeBaseTask.status) !== "completed") {
        throw new GeoHttpError(
          "企业知识库完成后才能生成推荐问题",
          409,
          "KNOWLEDGE_BASE_NOT_READY",
        );
      }
      const finalizedKnowledgeBase = await ensureFinalizedKnowledgeBase(
        trackArchiveFile(value, knowledgeBaseTask),
        knowledgeBaseTask,
      );
      value = finalizedKnowledgeBase.value;
      if (value.knowledgeBaseCandidateFailure) {
        if (value.knowledgeBaseCandidateFailure.category === "unsafe") {
          throw new GeoHttpError(
            KNOWLEDGE_BASE_VALIDATION_PUBLIC_ERRORS.unsafe,
            422,
            "ARCHIVE_UNSAFE_VALIDATION_FAILED",
          );
        }
        throw new GeoHttpError(
          "企业知识库候选文件需要在当前项目中重新生成",
          409,
          "KNOWLEDGE_BASE_RETRY_REQUIRED",
        );
      }
      const archive = resolveKnowledgeBaseArtifact(value, knowledgeBaseTask);
      if (!archive)
        throw new GeoHttpError(
          "知识库任务尚未返回 ZIP 文件",
          409,
          "ARCHIVE_NOT_READY",
        );
      const trackedValue = await resolveCanonicalCompanyIdentity(
        broker,
        trackArchiveFile(value, knowledgeBaseTask),
        knowledgeBaseTask,
      );
      const archiveAttachment = await materializeArchiveAttachment(
        broker,
        trackedValue.knowledgeBaseTaskId,
        archive,
      );
      const { task: questionTask, skillAttachments } =
        await createGeoTaskWithSkillPackages(
          broker,
          {
            projectId: trackedValue.projectId,
            prompt: await buildGeoQuestionPrompt({
              companyName: trackedValue.companyName,
              archiveFilename: archiveAttachment.filename,
            }),
            attachments: [archiveAttachment],
            idempotencyKey: `geo:${trackedValue.projectId}:questions:1`,
            agentProfile: FRONTMIND_PRO_PROFILE,
          },
          [
            {
              filename: QUESTION_SKILL_ARCHIVE_FILENAME,
              body: await buildGeoQuestionRecommenderSkillArchive(),
            },
          ],
        );
      const questionTaskId = taskIdFrom(questionTask);
      if (!questionTaskId)
        throw new GeoHttpError(
          "创建推荐问题任务失败：缺少任务 ID",
          502,
          "TASK_ID_MISSING",
        );

      const nextValue: ProjectTokenValue = {
        ...trackedValue,
        questionTaskId,
        questionSubmittedAt: new Date().toISOString(),
        temporaryFileIds: Array.from(
          new Set([
            ...(trackedValue.temporaryFileIds || []),
            ...skillAttachments.map((item) => item.file_id),
            ...(archiveAttachment.temporary ? [archiveAttachment.file_id] : []),
          ]),
        ),
      };
      const projectToken = codec.seal("project", nextValue, PROJECT_TTL_MS);
      const project = await buildProjectView(
        broker,
        nextValue,
        projectToken,
        knowledgeBaseTask,
        questionTask,
      );
      res.status(201).json({ projectToken, project });
    }),
  );

  router.post(
    "/projects/:projectToken/questions/custom",
    requireConfiguration,
    requireSession,
    requireCostRate("custom-question-create", 12),
    asyncHandler(async (req, res) => {
      const value = openOwnedProject(req, res);
      const input = CreateCustomQuestionRequestSchema.parse(req.body);
      if (value.monitorRunId) {
        throw new GeoHttpError(
          "该项目的监控任务已经创建，不能再更换问题",
          409,
          "MONITOR_ALREADY_CREATED",
        );
      }
      if (!value.questionTaskId) {
        throw new GeoHttpError(
          "推荐问题生成后才能添加自定义问题",
          409,
          "QUESTIONS_NOT_READY",
        );
      }

      const [knowledgeBaseTask, questionTask] = await Promise.all([
        getResolvedTask(broker, value.knowledgeBaseTaskId),
        getResolvedTask(broker, value.questionTaskId),
      ]);
      const trackedValue = await resolveCanonicalCompanyIdentity(
        broker,
        value,
        knowledgeBaseTask,
      );
      const generatedQuestions =
        parseQuestionSetFromTask(questionTask)?.questions;
      if (!generatedQuestions) {
        throw new GeoHttpError(
          "推荐问题尚未准备完成",
          409,
          "QUESTIONS_NOT_READY",
        );
      }
      if (isIndustryRankingQuestion(input.question)) {
        throw new GeoHttpError(
          "该问题属于行业排名或品牌推荐类问题，需要全域营销权限",
          422,
          "INDUSTRY_RANKING_QUESTION",
        );
      }

      const duplicate = generatedQuestions.find(
        (candidate) =>
          normalizeQuestionIdentity(candidate.question) ===
          normalizeQuestionIdentity(input.question),
      );
      if (duplicate) {
        const project = await buildProjectView(
          broker,
          trackedValue,
          req.params.projectToken,
          knowledgeBaseTask,
          questionTask,
        );
        res.json({
          projectToken: req.params.projectToken,
          question: duplicate,
          project,
        });
        return;
      }

      const classification = await classifyCustomQuestion({
        broker,
        value: trackedValue,
        knowledgeBaseTask,
        question: input.question,
      });
      if (classification.decision === "reject") {
        if (classification.category === "industry_ranking") {
          throw new GeoHttpError(
            "该问题属于行业排名或品牌推荐类问题，需要全域营销权限",
            422,
            "INDUSTRY_RANKING_QUESTION",
          );
        }
        if (classification.category === "ambiguous") {
          throw new GeoHttpError(
            `无法确认该问题与「${trackedValue.companyName}」的关系，请明确写出企业、品牌或知识库中的具体产品名称`,
            422,
            "CUSTOM_QUESTION_AMBIGUOUS",
          );
        }
        throw new GeoHttpError(
          `该问题与「${trackedValue.companyName}」的企业、产品或服务没有明确关系，请修改后重试`,
          422,
          "CUSTOM_QUESTION_ENTERPRISE_UNRELATED",
        );
      }

      const id = customQuestionId(input.question);
      const question = GeoQuestionSchema.parse({
        id,
        category: classification.category,
        question: input.question,
        rationale: classification.reason,
        ...(classification.enterpriseAnchor
          ? { enterpriseAnchor: classification.enterpriseAnchor }
          : {}),
        ...(classification.offeringAnchor
          ? { offeringAnchor: classification.offeringAnchor }
          : {}),
        evidenceRefs: classification.evidenceRefs,
        selectable: true,
      });
      const nextValue: ProjectTokenValue = {
        ...trackedValue,
        customQuestion: question,
      };
      const projectToken = codec.seal("project", nextValue, PROJECT_TTL_MS);
      const project = await buildProjectView(
        broker,
        nextValue,
        projectToken,
        knowledgeBaseTask,
        questionTask,
      );
      res.status(201).json({ projectToken, question, project });
    }),
  );

  router.post(
    "/projects/:projectToken/payments",
    requireConfiguration,
    requireSession,
    requireCostRate("payment-create", 10),
    asyncHandler(async (req, res) => {
      const value = openOwnedProject(req, res);
      const input = CreatePaymentRequestSchema.parse(req.body);
      if (value.monitorRunId) {
        throw new GeoHttpError(
          "该项目的监控任务已经创建，无需重复支付",
          409,
          "MONITOR_ALREADY_CREATED",
        );
      }
      await resolveMonitorQuestion(value, input.questionId);
      await assertMonitorProviderReady();
      const platformIds = input.platformIds as GeoMonitorPlatformId[];
      const expectedAmountFen = platformIds.length * 200;
      const ownerSessionId = String(res.locals.geoSessionId || "");
      const checkout = await createDurableCheckout({
        locks: monitoringOrderLocks,
        lockKey: JSON.stringify({
          ownerSessionId,
          projectId: value.projectId,
          questionId: input.questionId,
          platformIds: [...platformIds].sort(),
        }),
        value,
        purchaseType: "monitoring",
        amountFen: expectedAmountFen,
        method: input.method,
        methodLockedCode: "PAYMENT_METHOD_LOCKED",
        createCheckout: () =>
          paymentGateway.createCheckout({
            ownerSessionId,
            projectId: value.projectId,
            questionId: input.questionId,
            platformIds,
            expectedAmountFen,
            method: input.method,
          }),
      });
      trackProjectOrder(value, { monitoring: {} });
      res.status(checkout.replayed ? 200 : 201).json({
        payment: {
          ...checkout.payment,
          unitPriceFen: 200,
          answersPerPlatform: 5,
        },
      });
    }),
  );

  router.post(
    "/projects/:projectToken/payments/status",
    requireConfiguration,
    requireSession,
    requireSessionRate("payment-status", 30, 60 * 1000),
    asyncHandler(async (req, res) => {
      const value = openOwnedProject(req, res);
      const input = PaymentStatusRequestSchema.parse(req.body);
      const platformIds = input.platformIds as GeoMonitorPlatformId[];
      const payment = await paymentGateway.getStatus({
        authorization: input.authorization,
        ownerSessionId: String(res.locals.geoSessionId || ""),
        projectId: value.projectId,
        questionId: input.questionId,
        platformIds,
        expectedAmountFen: platformIds.length * 200,
      });
      if (payment.status === "paid" || payment.status === "review_required") {
        await transitionProjectOrder(
          value.projectId,
          payment.orderId,
          payment.status,
          { paidAt: payment.paidAt },
        );
      }
      res.json({ payment });
    }),
  );

  router.post(
    "/projects/:projectToken/monitoring",
    requireConfiguration,
    requireSession,
    requireCostRate("monitor-create", 6),
    asyncHandler(async (req, res) => {
      const value = openOwnedProject(req, res);
      const input = StartMonitoringRequestSchema.parse(req.body);
      const requestedPlatforms = input.platformIds as GeoMonitorPlatformId[];

      if (value.monitorRunId) {
        if (
          value.monitorQuestionId !== input.questionId ||
          !sameStringSet(value.monitorPlatformIds || [], requestedPlatforms)
        ) {
          throw new GeoHttpError(
            "该项目已有一项不同范围的监控任务",
            409,
            "MONITOR_SCOPE_CONFLICT",
          );
        }
        const run = await getResolvedMonitorRun(broker, value.monitorRunId, {
          platforms: requestedPlatforms,
        });
        const [
          knowledgeBaseTask,
          questionTask,
          assessmentTask,
          optimizationForecastTask,
        ] = await Promise.all([
          getResolvedTask(broker, value.knowledgeBaseTaskId),
          value.questionTaskId
            ? getResolvedTask(broker, value.questionTaskId)
            : Promise.resolve(undefined),
          value.assessmentTaskId
            ? getResolvedTask(broker, value.assessmentTaskId)
            : Promise.resolve(undefined),
          value.optimizationForecastTaskId
            ? getResolvedTask(broker, value.optimizationForecastTaskId)
            : Promise.resolve(undefined),
        ]);
        const project = await buildProjectView(
          broker,
          value,
          req.params.projectToken,
          knowledgeBaseTask,
          questionTask,
          run,
          assessmentTask,
          optimizationForecastTask,
        );
        res.json({ projectToken: req.params.projectToken, project });
        return;
      }

      const { knowledgeBaseTask, questionTask, question } =
        await resolveMonitorQuestion(value, input.questionId);
      await assertMonitorProviderReady();

      const expectedAmountFen = requestedPlatforms.length * 200;
      const receipt = await paymentVerifier.verify({
        authorization: input.paymentAuthorization,
        projectId: value.projectId,
        ownerSessionId: String(res.locals.geoSessionId || ""),
        questionId: question.id,
        platformIds: requestedPlatforms,
        expectedAmountFen,
      });
      if (
        !receipt.orderId.trim() ||
        receipt.amountFen !== expectedAmountFen ||
        !Number.isFinite(Date.parse(receipt.paidAt))
      ) {
        throw new GeoPaymentVerificationError(
          "支付订单金额或状态与本次监控不匹配",
          "PAYMENT_SCOPE_MISMATCH",
          402,
        );
      }
      const paidOrder = await transitionProjectOrder(
        value.projectId,
        receipt.orderId,
        "paid",
        { paidAt: receipt.paidAt },
      );

      const idempotencyKey = `geo-monitor:${crypto
        .createHash("sha256")
        .update(
          JSON.stringify({
            projectId: value.projectId,
            orderId: receipt.orderId,
            questionId: question.id,
            question: question.question,
            platforms: [...requestedPlatforms].sort(),
          }),
        )
        .digest("hex")}`;
      const run = normalizeMonitorRun(
        await broker.createMonitorRun({
          question: question.question,
          platforms: requestedPlatforms,
          idempotencyKey,
        }),
        { question: question.question, platforms: requestedPlatforms },
      );
      const fulfillingOrder = await transitionProjectOrder(
        value.projectId,
        receipt.orderId,
        "fulfilling",
        { paidAt: receipt.paidAt },
      );
      trackProjectOrder(value, { monitoring: { runId: run.runId } });
      const nextValue: ProjectTokenValue = {
        ...value,
        monitorRunId: run.runId,
        monitorQuestionId: question.id,
        monitorPlatformIds: requestedPlatforms,
        monitorOrderId: fulfillingOrder.orderId,
        monitorAmountFen: fulfillingOrder.amountFen,
        monitorAuthorizationDigest: fulfillingOrder.authorizationDigest,
        monitorCheckoutExpiresAt: fulfillingOrder.checkoutExpiresAt,
        monitorPaidAt: fulfillingOrder.paidAt || paidOrder.paidAt,
      };
      const projectToken = codec.seal("project", nextValue, PROJECT_TTL_MS);
      const project = await buildProjectView(
        broker,
        nextValue,
        projectToken,
        knowledgeBaseTask,
        questionTask,
        run,
        undefined,
      );
      res.status(201).json({ projectToken, project });
    }),
  );

  router.post(
    "/projects/:projectToken/assessment",
    requireConfiguration,
    requireSession,
    requireCostRate("assessment-create", 8),
    asyncHandler(async (req, res) => {
      let value = openOwnedProject(req, res);
      let assessmentRetryReason: string | undefined;
      if (!value.monitorRunId || !value.monitorQuestionId) {
        throw new GeoHttpError(
          "真实监控任务提交后才能生成现状评估",
          409,
          "MONITOR_NOT_STARTED",
        );
      }
      const [knowledgeBaseTask, questionTask, monitorRun] = await Promise.all([
        getResolvedTask(broker, value.knowledgeBaseTaskId),
        value.questionTaskId
          ? getResolvedTask(broker, value.questionTaskId)
          : Promise.resolve(undefined),
        getResolvedMonitorRun(broker, value.monitorRunId, {
          platforms: value.monitorPlatformIds,
        }),
      ]);
      if (!questionTask) {
        throw new GeoHttpError(
          "推荐问题记录不存在",
          409,
          "QUESTIONS_NOT_READY",
        );
      }
      const question = findOwnedQuestion(
        value,
        parseQuestionSetFromTask(questionTask)?.questions,
        value.monitorQuestionId,
      );
      if (!question) {
        throw new GeoHttpError(
          "监控问题与当前项目不匹配",
          409,
          "MONITOR_QUESTION_MISMATCH",
        );
      }
      const knowledgeEvidencePaths = await loadKnowledgeEvidencePaths(
        broker,
        value,
        value.knowledgeBaseTaskId,
        knowledgeBaseTask,
        value.companyName,
        value.knowledgeBaseValidationProfile,
      );

      if (value.assessmentTaskId) {
        const [assessmentTask, optimizationForecastTask] = await Promise.all([
          getResolvedTask(broker, value.assessmentTaskId),
          value.optimizationForecastTaskId
            ? getResolvedTask(broker, value.optimizationForecastTaskId)
            : Promise.resolve(undefined),
        ]);
        const assessmentStatus = normalizeTaskStatus(assessmentTask.status);
        if (["failed", "cancelled"].includes(assessmentStatus)) {
          assessmentRetryReason =
            assessmentStatus === "cancelled"
              ? "上一次现状评估任务已取消"
              : normalizeTask(assessmentTask, "assessment").error ||
                "上一次现状评估任务执行失败";
        } else if (assessmentStatus === "completed") {
          try {
            calculateQuestionBaselineAssessment(
              parseScopedAssessmentTaskOutput(
                assessmentTask,
                question,
                monitorRun.platforms,
                monitorRun,
                knowledgeEvidencePaths,
              ),
            );
          } catch (error) {
            assessmentRetryReason =
              error instanceof Error
                ? error.message
                : "上一次现状评估输出未通过结构校验";
          }
        }
        if (assessmentRetryReason && (value.assessmentAttempt || 1) < 2) {
          value = {
            ...value,
            assessmentTaskId: undefined,
            assessmentAttempt: 2,
            optimizationForecastTaskId: undefined,
            previousAssessmentTaskIds: Array.from(
              new Set([
                ...(value.previousAssessmentTaskIds || []),
                value.assessmentTaskId,
              ]),
            ),
            previousOptimizationForecastTaskIds:
              value.optimizationForecastTaskId
                ? Array.from(
                    new Set([
                      ...(value.previousOptimizationForecastTaskIds || []),
                      value.optimizationForecastTaskId,
                    ]),
                  )
                : value.previousOptimizationForecastTaskIds,
          };
        } else {
          if (assessmentRetryReason) {
            throw new GeoHttpError(
              "现状评估自动重试次数已用完，请联系技术支持",
              409,
              "ASSESSMENT_RETRY_EXHAUSTED",
            );
          }
          const project = await buildProjectView(
            broker,
            value,
            req.params.projectToken,
            knowledgeBaseTask,
            questionTask,
            monitorRun,
            assessmentTask,
            optimizationForecastTask,
          );
          res.json({ projectToken: req.params.projectToken, project });
          return;
        }
      }
      if (monitorRun.status !== "completed" || !monitorRun.records) {
        throw new GeoHttpError(
          monitorRun.status === "partial_review_required"
            ? "监控结果不完整，需由技术人员确认后才能生成评估"
            : "监控仍在采集中，完成后将自动生成现状评估",
          409,
          "MONITOR_NOT_COMPLETE",
        );
      }

      const archive = resolveKnowledgeBaseArtifact(value, knowledgeBaseTask);
      if (!archive) {
        throw new GeoHttpError(
          "企业知识库 ZIP 尚未就绪",
          409,
          "ARCHIVE_NOT_READY",
        );
      }
      await loadKnowledgeBaseManifest(
        broker,
        value.knowledgeBaseTaskId,
        knowledgeBaseTask,
        value.companyName,
        archive,
        value.knowledgeBaseValidationProfile,
      );

      const monitoringDocument = {
        schemaVersion: 1,
        question: {
          id: question.id,
          text: question.question,
          category: question.category,
          rankingMetricEligible: question.category !== "reputation",
        },
        platforms: monitorRun.platforms,
        repeatPerPlatform: 5,
        expectedResponses: monitorRun.expectedItems,
        successfulResponses: monitorRun.records.filter(
          (record) =>
            record.status === "completed" && Boolean(record.answerText),
        ).length,
        // The assessment remains text/evidence based. Structured media is
        // returned to the customer UI but is not sent to the evaluator, and
        // page screenshots/reasoning never enter the monitor contract.
        records: monitorRun.records.map((record) => ({
          recordId: record.recordId,
          platform: record.platform,
          runIndex: record.runIndex,
          status: record.status,
          answerText: record.answerText,
          citations: record.citations,
          references: record.references,
          error: record.error,
          completedAt: record.completedAt,
        })),
      };
      const monitoringBytes = Buffer.from(
        JSON.stringify(monitoringDocument),
        "utf8",
      );
      if (monitoringBytes.length > MAX_ASSESSMENT_INPUT_BYTES) {
        throw new GeoHttpError(
          "监控文字结果超过现状评估输入上限",
          413,
          "ASSESSMENT_INPUT_TOO_LARGE",
        );
      }

      const monitoringFilename = `${sanitizeFilename(
        value.companyName,
        "company",
      )}-monitoring-records.json`;
      const monitoringFile = await broker.createFile({
        filename: monitoringFilename,
        mimeType: "application/json",
        sizeBytes: monitoringBytes.length,
      });
      try {
        await broker.uploadFile(
          monitoringFile.id,
          monitoringBytes,
          "application/json",
          monitoringFile.proxy_upload_ticket,
        );
      } catch (error) {
        await broker.deleteFile(monitoringFile.id).catch(() => undefined);
        throw error;
      }

      let archiveAttachment: Awaited<
        ReturnType<typeof materializeArchiveAttachment>
      >;
      try {
        archiveAttachment = await materializeArchiveAttachment(
          broker,
          value.knowledgeBaseTaskId,
          archive,
        );
      } catch (error) {
        await broker.deleteFile(monitoringFile.id).catch(() => undefined);
        throw error;
      }

      const successfulResponses = monitoringDocument.successfulResponses;
      const prompt = await buildAssessmentPrompt({
        companyName: value.companyName,
        archiveFilename: archiveAttachment.filename,
        monitoringFilename: monitoringFile.filename || monitoringFilename,
        question: monitoringDocument.question,
        monitoring: {
          platforms: monitorRun.platforms,
          repeatPerPlatform: 5,
          expectedResponses: monitorRun.expectedItems,
          successfulResponses,
          failedResponses: monitorRun.expectedItems - successfulResponses,
        },
        retryReason: assessmentRetryReason,
      });
      let assessmentTask: BrokerTask;
      let skillAttachments: Array<{ file_id: string; filename: string }>;
      try {
        const created = await createGeoTaskWithSkillPackages(
          broker,
          {
            projectId: value.projectId,
            prompt,
            attachments: [
              {
                file_id: archiveAttachment.file_id,
                filename: archiveAttachment.filename,
              },
              {
                file_id: monitoringFile.id,
                filename: monitoringFile.filename || monitoringFilename,
              },
            ],
            idempotencyKey: `geo:${value.projectId}:assessment:${value.monitorRunId}:${value.assessmentAttempt || 1}`,
          },
          [
            {
              filename: KNOWLEDGE_VERIFIER_SKILL_ARCHIVE_FILENAME,
              body: await buildGeoKnowledgeAnswerVerifierSkillArchive(),
            },
            {
              filename: ASSESSMENT_SKILL_ARCHIVE_FILENAME,
              body: await buildGeoCurrentStateEvaluatorSkillArchive(),
            },
          ],
        );
        assessmentTask = created.task;
        skillAttachments = created.skillAttachments;
      } catch (error) {
        await Promise.allSettled([
          broker.deleteFile(monitoringFile.id),
          ...(archiveAttachment.temporary
            ? [broker.deleteFile(archiveAttachment.file_id)]
            : []),
        ]);
        throw error;
      }
      const assessmentTaskId = taskIdFrom(assessmentTask);
      if (!assessmentTaskId) {
        throw new GeoHttpError(
          "创建现状评估任务失败：缺少任务 ID",
          502,
          "TASK_ID_MISSING",
        );
      }
      const nextValue: ProjectTokenValue = {
        ...value,
        assessmentTaskId,
        assessmentSubmittedAt: new Date().toISOString(),
        assessmentAttempt: value.assessmentAttempt || 1,
        temporaryFileIds: Array.from(
          new Set([
            ...(value.temporaryFileIds || []),
            monitoringFile.id,
            ...skillAttachments.map((item) => item.file_id),
            ...(archiveAttachment.temporary ? [archiveAttachment.file_id] : []),
          ]),
        ),
      };
      const projectToken = codec.seal("project", nextValue, PROJECT_TTL_MS);
      const project = await buildProjectView(
        broker,
        nextValue,
        projectToken,
        knowledgeBaseTask,
        questionTask,
        monitorRun,
        assessmentTask,
      );
      res.status(201).json({ projectToken, project });
    }),
  );

  router.post(
    "/projects/:projectToken/optimization-forecast",
    requireConfiguration,
    requireSession,
    requireCostRate("optimization-forecast-create", 6),
    asyncHandler(async (req, res) => {
      let value = openOwnedProject(req, res);
      let forecastRetryReason: string | undefined;
      if (!value.assessmentTaskId) {
        throw new GeoHttpError(
          "当前评估完成后才能生成优化效果评估",
          409,
          "ASSESSMENT_NOT_READY",
        );
      }

      const [knowledgeBaseTask, questionTask, monitorRun, assessmentTask] =
        await Promise.all([
          getResolvedTask(broker, value.knowledgeBaseTaskId),
          value.questionTaskId
            ? getResolvedTask(broker, value.questionTaskId)
            : Promise.resolve(undefined),
          value.monitorRunId
            ? getResolvedMonitorRun(broker, value.monitorRunId, {
                platforms: value.monitorPlatformIds,
              })
            : Promise.resolve(undefined),
          getResolvedTask(broker, value.assessmentTaskId),
        ]);
      const question =
        questionTask && value.monitorQuestionId
          ? findOwnedQuestion(
              value,
              parseQuestionSetFromTask(questionTask)?.questions,
              value.monitorQuestionId,
            )
          : undefined;
      if (!question || !monitorRun) {
        throw new GeoHttpError(
          "当前评估与监控问题范围不匹配",
          409,
          "ASSESSMENT_SCOPE_MISMATCH",
        );
      }
      const knowledgeEvidencePaths = await loadKnowledgeEvidencePaths(
        broker,
        value,
        value.knowledgeBaseTaskId,
        knowledgeBaseTask,
        value.companyName,
        value.knowledgeBaseValidationProfile,
      );

      if (normalizeTaskStatus(assessmentTask.status) !== "completed") {
        throw new GeoHttpError(
          "当前评估仍在生成，完成后将自动建立优化目标区间",
          409,
          "ASSESSMENT_NOT_READY",
        );
      }

      let scoredAssessment: ReturnType<
        typeof calculateQuestionBaselineAssessment
      >;
      try {
        scoredAssessment = calculateQuestionBaselineAssessment(
          parseScopedAssessmentTaskOutput(
            assessmentTask,
            question,
            monitorRun?.platforms || value.monitorPlatformIds || [],
            monitorRun,
            knowledgeEvidencePaths,
          ),
        );
      } catch (error) {
        throw new GeoHttpError(
          error instanceof Error
            ? `当前评估未通过结构校验：${error.message}`
            : "当前评估未通过结构校验",
          409,
          "ASSESSMENT_INVALID",
        );
      }

      if (value.optimizationForecastTaskId) {
        const optimizationForecastTask = await getResolvedTask(
          broker,
          value.optimizationForecastTaskId,
        );
        const forecastStatus = normalizeTaskStatus(
          optimizationForecastTask.status,
        );
        if (["failed", "cancelled"].includes(forecastStatus)) {
          forecastRetryReason =
            forecastStatus === "cancelled"
              ? "上一次优化效果评估任务已取消"
              : normalizeTask(optimizationForecastTask, "optimization-forecast")
                  .error || "上一次优化效果评估任务执行失败";
        } else if (forecastStatus === "completed") {
          try {
            calculateOptimizationOutcomeForecast(
              scoredAssessment,
              parseOptimizationOutcomeForecastTaskOutput(
                optimizationForecastTask,
              ),
            );
          } catch (error) {
            forecastRetryReason =
              error instanceof Error
                ? error.message
                : "上一次优化效果评估输出未通过结构校验";
          }
        }
        if (
          forecastRetryReason &&
          (value.optimizationForecastAttempt || 1) < 2
        ) {
          value = {
            ...value,
            optimizationForecastTaskId: undefined,
            optimizationForecastAttempt: 2,
            previousOptimizationForecastTaskIds: Array.from(
              new Set([
                ...(value.previousOptimizationForecastTaskIds || []),
                value.optimizationForecastTaskId,
              ]),
            ),
          };
        } else {
          if (forecastRetryReason) {
            throw new GeoHttpError(
              "优化效果评估自动重试次数已用完，请联系技术支持",
              409,
              "FORECAST_RETRY_EXHAUSTED",
            );
          }
          const project = await buildProjectView(
            broker,
            value,
            req.params.projectToken,
            knowledgeBaseTask,
            questionTask,
            monitorRun,
            assessmentTask,
            optimizationForecastTask,
          );
          res.json({ projectToken: req.params.projectToken, project });
          return;
        }
      }

      const archive = resolveKnowledgeBaseArtifact(value, knowledgeBaseTask);
      if (!archive) {
        throw new GeoHttpError(
          "企业知识库 ZIP 尚未就绪",
          409,
          "ARCHIVE_NOT_READY",
        );
      }
      await loadKnowledgeBaseManifest(
        broker,
        value.knowledgeBaseTaskId,
        knowledgeBaseTask,
        value.companyName,
        archive,
        value.knowledgeBaseValidationProfile,
      );

      const assessmentFilename = `${sanitizeFilename(
        value.companyName,
        "company",
      )}-current-assessment.json`;
      const assessmentDocument = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        sourceAssessmentTaskId: value.assessmentTaskId,
        assessment: scoredAssessment,
      };
      const assessmentBytes = Buffer.from(
        JSON.stringify(assessmentDocument),
        "utf8",
      );
      const scenarioFilename = "frontmind-standard-one-month-scenario.json";
      const scenarioDocument = {
        schemaVersion: 1,
        name: "full_execution",
        horizonWeeks: FORECAST_HORIZON_WEEKS,
        allowedActionIds: [
          "GEO_A1_entity_facts",
          "GEO_A2_ai_visibility",
          "GEO_A3_qa_assets",
          "GEO_A4_positioning_language",
          "GEO_A5_site_schema",
          "GEO_A6_distribution_citations",
        ],
        executionAssumptions: [
          "企业事实、定位、产品、案例与合规边界完成核验",
          "内容完成真实发布并通过抓取与收录检查",
          "第三方信源由独立、可追溯页面提供",
          "第 2 周检查执行进度，第 4 周按相同问题、平台和每平台五次回答复测",
        ],
      };
      const scenarioBytes = Buffer.from(
        JSON.stringify(scenarioDocument),
        "utf8",
      );
      if (
        assessmentBytes.length + scenarioBytes.length >
        MAX_FORECAST_INPUT_BYTES
      ) {
        throw new GeoHttpError(
          "优化效果评估输入超过安全上限",
          413,
          "FORECAST_INPUT_TOO_LARGE",
        );
      }

      const temporaryFiles: string[] = [];
      const { forecastTask, forecastTaskId } = await (async () => {
        try {
          const assessmentFile = await broker.createFile({
            filename: assessmentFilename,
            mimeType: "application/json",
            sizeBytes: assessmentBytes.length,
          });
          temporaryFiles.push(assessmentFile.id);
          await broker.uploadFile(
            assessmentFile.id,
            assessmentBytes,
            "application/json",
            assessmentFile.proxy_upload_ticket,
          );
          const scenarioFile = await broker.createFile({
            filename: scenarioFilename,
            mimeType: "application/json",
            sizeBytes: scenarioBytes.length,
          });
          temporaryFiles.push(scenarioFile.id);
          await broker.uploadFile(
            scenarioFile.id,
            scenarioBytes,
            "application/json",
            scenarioFile.proxy_upload_ticket,
          );

          const archiveAttachment = await materializeArchiveAttachment(
            broker,
            value.knowledgeBaseTaskId,
            archive,
          );
          if (archiveAttachment.temporary)
            temporaryFiles.push(archiveAttachment.file_id);

          const created = await createGeoTaskWithSkillPackages(
            broker,
            {
              projectId: value.projectId,
              prompt: await buildOptimizationOutcomeForecastPrompt({
                currentAssessmentFilename:
                  assessmentFile.filename || assessmentFilename,
                knowledgeBaseArchiveFilename: archiveAttachment.filename,
                executionScenarioFilename:
                  scenarioFile.filename || scenarioFilename,
                scenarioName: "full_execution",
                retryReason: forecastRetryReason,
              }),
              attachments: [
                {
                  file_id: archiveAttachment.file_id,
                  filename: archiveAttachment.filename,
                },
                {
                  file_id: assessmentFile.id,
                  filename: assessmentFile.filename || assessmentFilename,
                },
                {
                  file_id: scenarioFile.id,
                  filename: scenarioFile.filename || scenarioFilename,
                },
              ],
              idempotencyKey: `geo:${value.projectId}:optimization-forecast:${value.assessmentTaskId}:standard-4w-v2:${value.optimizationForecastAttempt || 1}`,
            },
            [
              {
                filename: FORECAST_SKILL_ARCHIVE_FILENAME,
                body: await buildGeoOptimizationOutcomeForecasterSkillArchive(),
              },
            ],
          );
          const task = created.task;
          temporaryFiles.push(
            ...created.skillAttachments.map((item) => item.file_id),
          );
          const taskId = taskIdFrom(task);
          if (!taskId) {
            throw new GeoHttpError(
              "创建优化效果评估任务失败：缺少任务 ID",
              502,
              "TASK_ID_MISSING",
            );
          }
          return { forecastTask: task, forecastTaskId: taskId };
        } catch (error) {
          await Promise.allSettled(
            temporaryFiles.map((fileId) => broker.deleteFile(fileId)),
          );
          throw error;
        }
      })();

      const nextValue: ProjectTokenValue = {
        ...value,
        optimizationForecastTaskId: forecastTaskId,
        optimizationForecastSubmittedAt: new Date().toISOString(),
        optimizationForecastAttempt: value.optimizationForecastAttempt || 1,
        temporaryFileIds: Array.from(
          new Set([...(value.temporaryFileIds || []), ...temporaryFiles]),
        ),
      };
      const projectToken = codec.seal("project", nextValue, PROJECT_TTL_MS);
      const project = await buildProjectView(
        broker,
        nextValue,
        projectToken,
        knowledgeBaseTask,
        questionTask,
        monitorRun,
        assessmentTask,
        forecastTask,
      );
      res.status(201).json({ projectToken, project });
    }),
  );

  router.post(
    "/projects/:projectToken/services/contracts",
    requireConfiguration,
    requireSession,
    requireCostRate("service-contract-create", 8),
    asyncHandler(async (req, res) => {
      const value = openOwnedProject(req, res);
      const input = CreateServiceContractRequestSchema.parse(req.body);
      const scope = await resolveServiceScope(value);
      if (value.serviceOrderId || value.servicePaidAt) {
        throw new GeoHttpError(
          "当前服务已经完成付款，不能重新提交签约资料",
          409,
          "SERVICE_ALREADY_PAID",
        );
      }

      const preparedValue: ProjectTokenValue = {
        ...value,
        companyName: value.serviceManualOrderReference
          ? value.companyName
          : input.profile.legalName,
        companyNameSource: value.serviceManualOrderReference
          ? value.companyNameSource
          : "explicit",
        serviceQuestionId: scope.question.id,
        serviceCategory: scope.category,
        serviceAmountFen: scope.amountFen,
      };
      const response = value.serviceManualOrderReference
        ? await manualOrderStatusReader(value.serviceManualOrderReference)
        : await manualOrderCreator({
            schemaVersion: 1,
            project: {
              id: value.projectId,
              companyName: input.profile.legalName,
            },
            service: {
              planCode: "basic",
              serviceDays: 30,
              purchasedQuestion: {
                id: scope.question.id,
                category: scope.category,
                question: scope.question.question,
              },
            },
            contract: {
              templateVersion: GEO_MANUAL_CONTRACT_TEMPLATE_VERSION,
              profile: input.profile,
            },
          });
      let nextValue = mergeManualOrder(preparedValue, response);
      nextValue = {
        ...nextValue,
        serviceProfileSubmittedAt:
          value.serviceProfileSubmittedAt || response.order.updatedAt,
      };
      if (!nextValue.serviceAdminNotificationDeliveredAt) {
        const eventId = `geo-manual:${response.order.reference}:submitted-v1`;
        try {
          const notification = await adminNotifier.notify({
            schemaVersion: 1,
            event: "manual_order_submitted",
            eventId,
            orderReference: response.order.reference,
            projectId: value.projectId,
            companyName: nextValue.companyName,
            serviceCategory: scope.category,
            amountFen: scope.amountFen,
            submittedAt: nextValue.serviceProfileSubmittedAt!,
          });
          if (notification.delivery === "delivered") {
            nextValue = {
              ...nextValue,
              serviceAdminNotificationDeliveredAt: new Date().toISOString(),
            };
          }
        } catch {
          console.warn(
            `[GEO admin notification] Delivery failed for ${eventId}`,
          );
        }
      }
      nextValue = await syncServiceOrder(nextValue);
      trackServiceOrder(nextValue);
      const projectToken = codec.seal("project", nextValue, PROJECT_TTL_MS);
      const monitorRun = nextValue.monitorRunId
        ? await getResolvedMonitorRun(broker, nextValue.monitorRunId, {
            platforms: nextValue.monitorPlatformIds,
          })
        : undefined;
      const project = await buildProjectView(
        broker,
        nextValue,
        projectToken,
        scope.knowledgeBaseTask,
        scope.questionTask,
        monitorRun,
        scope.assessmentTask,
        scope.forecastTask,
      );
      res
        .status(value.serviceManualOrderReference ? 200 : 201)
        .json({ projectToken, project });
    }),
  );

  router.post(
    "/projects/:projectToken/services/contracts/status",
    requireConfiguration,
    requireSession,
    requireSessionRate("service-contract-status", 30, 60 * 1000),
    asyncHandler(async (req, res) => {
      const value = openOwnedProject(req, res);
      ServiceStatusRequestSchema.parse(req.body);
      if (!value.serviceManualOrderReference) {
        throw new GeoHttpError(
          "尚未提交签约资料",
          409,
          "MANUAL_ORDER_NOT_STARTED",
        );
      }
      const scope = await resolveServiceScope(value);
      const response = await manualOrderStatusReader(
        value.serviceManualOrderReference,
      );
      let nextValue = mergeManualOrder(value, response);
      if (nextValue.serviceManualOrderStatus === "active") {
        nextValue = await handoffKnowledgeBase(
          nextValue,
          scope.knowledgeBaseTask,
        );
      }
      nextValue = await syncServiceOrder(nextValue);
      trackServiceOrder(nextValue);
      const projectToken = codec.seal("project", nextValue, PROJECT_TTL_MS);
      const monitorRun = nextValue.monitorRunId
        ? await getResolvedMonitorRun(broker, nextValue.monitorRunId, {
            platforms: nextValue.monitorPlatformIds,
          })
        : undefined;
      const project = await buildProjectView(
        broker,
        nextValue,
        projectToken,
        scope.knowledgeBaseTask,
        scope.questionTask,
        monitorRun,
        scope.assessmentTask,
        scope.forecastTask,
      );
      res.json({ projectToken, project });
    }),
  );

  router.post(
    "/projects/:projectToken/services/payments",
    requireConfiguration,
    requireSession,
    requireCostRate("service-payment-create", 8),
    asyncHandler(async (req, res) => {
      const value = openOwnedProject(req, res);
      const input = CreateServicePaymentRequestSchema.parse(req.body);
      const scope = await resolveServiceScope(value);
      if (
        !value.serviceManualOrderReference ||
        value.serviceManualOrderStatus !== "payment_required"
      ) {
        throw new GeoHttpError(
          value.serviceManualOrderReference
            ? "合同尚未完成签署确认，暂不能付款"
            : "请先提交签约资料并等待合同签署完成",
          409,
          "SERVICE_PAYMENT_NOT_ALLOWED",
        );
      }
      if (value.serviceOrderId) {
        throw new GeoHttpError(
          "该问题的首月服务已经启动，无需重复支付",
          409,
          "SERVICE_ALREADY_ACTIVE",
        );
      }
      await assertServiceWorkspaceReady();

      const ownerSessionId = String(res.locals.geoSessionId || "");
      const lockKey = JSON.stringify({
        ownerSessionId,
        projectId: value.projectId,
        questionId: scope.question.id,
        category: scope.category,
        billingMonths: 1,
      });
      const checkout = await createDurableCheckout({
        locks: serviceOrderLocks,
        lockKey,
        value,
        purchaseType: "service",
        amountFen: scope.amountFen,
        method: input.method,
        methodLockedCode: "SERVICE_PAYMENT_METHOD_LOCKED",
        createCheckout: () =>
          paymentGateway.createServiceCheckout({
            ownerSessionId,
            projectId: value.projectId,
            questionId: scope.question.id,
            category: scope.category,
            expectedAmountFen: scope.amountFen,
            method: input.method,
          }),
      });
      trackServiceOrder(value);
      res.status(checkout.replayed ? 200 : 201).json({
        payment: {
          ...checkout.payment,
          purchaseType: "service",
          category: scope.category,
          questionId: scope.question.id,
          billingMonths: 1,
          unitPriceFen: scope.amountFen,
        },
      });
    }),
  );

  router.post(
    "/projects/:projectToken/services/payments/status",
    requireConfiguration,
    requireSession,
    requireSessionRate("service-payment-status", 30, 60 * 1000),
    asyncHandler(async (req, res) => {
      const value = openOwnedProject(req, res);
      const input = ServicePaymentAuthorizationSchema.parse(req.body);
      const scope = await resolveServiceScope(value);
      if (
        !value.serviceManualOrderReference ||
        value.serviceManualOrderStatus !== "payment_required"
      ) {
        throw new GeoHttpError(
          "当前合同订单不在待付款状态",
          409,
          "SERVICE_PAYMENT_NOT_ALLOWED",
        );
      }
      const payment = await paymentGateway.getServiceStatus({
        authorization: input.authorization,
        ownerSessionId: String(res.locals.geoSessionId || ""),
        projectId: value.projectId,
        questionId: scope.question.id,
        category: scope.category,
        expectedAmountFen: scope.amountFen,
      });
      if (payment.status === "paid" || payment.status === "review_required") {
        await transitionProjectOrder(
          value.projectId,
          payment.orderId,
          payment.status,
          { paidAt: payment.paidAt },
        );
      }
      res.json({ payment });
    }),
  );

  router.post(
    "/projects/:projectToken/services/start",
    requireConfiguration,
    requireSession,
    requireCostRate("service-start", 8),
    asyncHandler(async (req, res) => {
      const value = openOwnedProject(req, res);
      const input = ServicePaymentAuthorizationSchema.parse(req.body);
      const scope = await resolveServiceScope(value);
      await assertServiceWorkspaceReady();
      const loadMonitorRun = () =>
        value.monitorRunId
          ? getResolvedMonitorRun(broker, value.monitorRunId, {
              platforms: value.monitorPlatformIds,
            })
          : Promise.resolve(undefined);

      if (value.serviceOrderId) {
        trackServiceOrder(value);
        const paidAt = value.servicePaidAt;
        if (
          !value.serviceManualOrderReference ||
          value.serviceQuestionId !== scope.question.id ||
          value.serviceCategory !== scope.category ||
          value.serviceAmountFen !== scope.amountFen ||
          !paidAt
        ) {
          throw new GeoHttpError(
            "已启动服务与当前问题范围不一致",
            409,
            "SERVICE_SCOPE_CONFLICT",
          );
        }
        const monitorRun = await loadMonitorRun();
        const project = await buildProjectView(
          broker,
          value,
          req.params.projectToken,
          scope.knowledgeBaseTask,
          scope.questionTask,
          monitorRun,
          scope.assessmentTask,
          scope.forecastTask,
        );
        res.json({ projectToken: req.params.projectToken, project });
        return;
      }
      if (
        !value.serviceManualOrderReference ||
        value.serviceManualOrderStatus !== "payment_required"
      ) {
        throw new GeoHttpError(
          "人工合同尚未签署完成，不能确认付款并开通服务",
          409,
          "SERVICE_PAYMENT_NOT_ALLOWED",
        );
      }

      const receipt = await paymentGateway.verifyService({
        authorization: input.authorization,
        ownerSessionId: String(res.locals.geoSessionId || ""),
        projectId: value.projectId,
        questionId: scope.question.id,
        category: scope.category,
        expectedAmountFen: scope.amountFen,
      });
      if (
        !receipt.orderId.trim() ||
        receipt.amountFen !== scope.amountFen ||
        !Number.isFinite(Date.parse(receipt.paidAt))
      ) {
        throw new GeoPaymentVerificationError(
          "支付订单金额或状态与本次服务不匹配",
          "PAYMENT_SCOPE_MISMATCH",
          402,
        );
      }
      const paidOrder = await transitionProjectOrder(
        value.projectId,
        receipt.orderId,
        "paid",
        { paidAt: receipt.paidAt },
      );

      const preparedValue: ProjectTokenValue = {
        ...value,
        serviceOrderId: receipt.orderId,
        serviceQuestionId: scope.question.id,
        serviceCategory: scope.category,
        serviceAmountFen: scope.amountFen,
        serviceTradeNo: receipt.tradeNo || receipt.orderId,
        servicePaidAt: receipt.paidAt,
        serviceAuthorizationDigest: paidOrder.authorizationDigest,
        serviceCheckoutExpiresAt: paidOrder.checkoutExpiresAt,
        serviceAccountMode: input.purchaseIntent ? "bind_existing" : "create",
      };
      const confirmed = await manualOrderPaymentConfirmer(
        value.serviceManualOrderReference,
        {
          schemaVersion: 1,
          payment: {
            orderId: receipt.orderId,
            tradeNo: receipt.tradeNo || receipt.orderId,
            amountFen: receipt.amountFen,
            paidAt: receipt.paidAt,
          },
        },
      );
      let nextValue = mergeManualOrder(preparedValue, confirmed);
      if (input.purchaseIntent) {
        const accountSubmitted = await manualOrderAccountSubmitter(
          value.serviceManualOrderReference,
          {
            schemaVersion: 1,
            account: {
              mode: "bind_existing",
              purchaseIntent: input.purchaseIntent,
            },
          },
        );
        nextValue = mergeManualOrder(nextValue, accountSubmitted);
        if (nextValue.serviceManualOrderStatus !== "active") {
          throw new GeoHttpError(
            "已有账号已经绑定，但服务账号未能立即激活",
            502,
            "MANUAL_ORDER_ACCOUNT_ACTIVATION_INCOMPLETE",
          );
        }
      }
      if (nextValue.serviceManualOrderStatus === "active") {
        nextValue = await handoffKnowledgeBase(
          nextValue,
          scope.knowledgeBaseTask,
        );
      }
      nextValue = await syncServiceOrder(nextValue);
      trackServiceOrder(nextValue);
      const projectToken = codec.seal("project", nextValue, PROJECT_TTL_MS);
      const monitorRun = await loadMonitorRun();
      const project = await buildProjectView(
        broker,
        nextValue,
        projectToken,
        scope.knowledgeBaseTask,
        scope.questionTask,
        monitorRun,
        scope.assessmentTask,
        scope.forecastTask,
      );
      res.status(201).json({ projectToken, project });
    }),
  );

  router.post(
    "/projects/:projectToken/services/account",
    requireConfiguration,
    requireSession,
    requireCostRate("service-account", 8),
    asyncHandler(async (req, res) => {
      const value = openOwnedProject(req, res);
      const input = CreateServiceAccountRequestSchema.parse(req.body);
      const scope = await resolveServiceScope(value);
      const paidAt = value.servicePaidAt ?? value.serviceActivatedAt;
      if (
        !value.serviceOrderId ||
        !value.serviceQuestionId ||
        !value.serviceCategory ||
        !value.serviceAmountFen ||
        !paidAt ||
        value.serviceQuestionId !== scope.question.id ||
        value.serviceCategory !== scope.category ||
        value.serviceAmountFen !== scope.amountFen
      ) {
        throw new GeoHttpError(
          "服务订单尚未完成付款确认",
          409,
          "SERVICE_PAYMENT_REQUIRED",
        );
      }

      if (value.serviceManualOrderReference) {
        if ("schemaVersion" in input) {
          throw new GeoHttpError(
            "新账号必须设置登录密码；已有账号只能在付款确认时绑定",
            409,
            "MANUAL_ORDER_ACCOUNT_PASSWORD_REQUIRED",
          );
        }
        const accountInput = CreateServiceAccountRequestV1Schema.parse(input);
        if (
          value.serviceManualOrderStatus !== "account_setup_required" &&
          value.serviceManualOrderStatus !== "activation_required" &&
          value.serviceManualOrderStatus !== "active"
        ) {
          throw new GeoHttpError(
            "当前合同订单尚未进入账号设置阶段",
            409,
            "MANUAL_ORDER_ACCOUNT_NOT_ALLOWED",
          );
        }

        const firstSubmission =
          value.serviceManualOrderStatus === "account_setup_required";
        const submitted = await manualOrderAccountSubmitter(
          value.serviceManualOrderReference,
          {
            schemaVersion: 1,
            account: {
              mode: "create",
              displayName: accountInput.displayName,
              username: accountInput.username,
              password: accountInput.password,
            },
          },
        );
        let nextValue = mergeManualOrder(
          {
            ...value,
            serviceAccountMode: "create",
            serviceAccountUsername: accountInput.username,
            serviceAccountDisplayName: accountInput.displayName,
          },
          submitted,
        );
        if (nextValue.serviceManualOrderStatus !== "active") {
          throw new GeoHttpError(
            "账号资料已提交，但服务账号未能立即激活",
            502,
            "MANUAL_ORDER_ACCOUNT_ACTIVATION_INCOMPLETE",
          );
        }
        nextValue = await handoffKnowledgeBase(
          nextValue,
          scope.knowledgeBaseTask,
        );
        nextValue = await syncServiceOrder(nextValue);
        trackServiceOrder(nextValue);
        const projectToken = codec.seal("project", nextValue, PROJECT_TTL_MS);
        const monitorRun = nextValue.monitorRunId
          ? await getResolvedMonitorRun(broker, nextValue.monitorRunId, {
              platforms: nextValue.monitorPlatformIds,
            })
          : undefined;
        const project = await buildProjectView(
          broker,
          nextValue,
          projectToken,
          scope.knowledgeBaseTask,
          scope.questionTask,
          monitorRun,
          scope.assessmentTask,
          scope.forecastTask,
        );
        res.status(firstSubmission ? 201 : 200).json({ projectToken, project });
        return;
      }

      if ("schemaVersion" in input && input.schemaVersion === 2) {
        let nextValue: ProjectTokenValue;
        if (
          value.serviceProvisioningVersion === 2 &&
          value.serviceProvisioningReference
        ) {
          const latest = await purchaseStatusReader(
            value.serviceProvisioningReference,
          );
          nextValue = mergePurchaseProvision(value, latest);
        } else {
          const startsAt = new Date(paidAt);
          const endsAt = new Date(
            startsAt.getTime() + 30 * 24 * 60 * 60 * 1000,
          );
          const preparedValue: ProjectTokenValue = {
            ...value,
            serviceProvisioningVersion: 2,
            serviceAccountMode: input.account.mode,
            serviceAccountUsername:
              input.account.mode === "create"
                ? input.account.username
                : undefined,
            serviceAccountDisplayName:
              input.account.mode === "create"
                ? input.account.displayName
                : undefined,
          };
          const provisioned = await purchaseProvisioner({
            schemaVersion: 2,
            project: {
              id: value.projectId,
              companyName: value.companyName,
            },
            order: {
              id: value.serviceOrderId,
              tradeNo: value.serviceTradeNo || value.serviceOrderId,
              status: "paid",
              amountFen: value.serviceAmountFen,
              paidAt,
            },
            service: {
              planCode: "basic",
              serviceDays: 30,
              startsAt: startsAt.toISOString(),
              endsAt: endsAt.toISOString(),
              purchasedQuestion: {
                id: value.serviceQuestionId,
                category: value.serviceCategory,
                question: scope.question.question,
              },
            },
            contract: {
              id: `basic-contract:${value.serviceOrderId}`,
              status: "pending_admin_confirmation",
              projectId: value.projectId,
              orderId: value.serviceOrderId,
              questionId: value.serviceQuestionId,
              templateVersion: "basic-2026.07-v1",
              evidence: {
                type: "system_admin_confirmation",
                artifact: {
                  taskId: null,
                  fileId: null,
                  outputDescriptor: null,
                  sha256: null,
                },
              },
            },
            account: input.account,
          });
          nextValue = mergePurchaseProvision(preparedValue, provisioned);
        }
        nextValue = await handoffKnowledgeBase(
          nextValue,
          scope.knowledgeBaseTask,
        );
        nextValue = await syncServiceOrder(nextValue);
        trackServiceOrder(nextValue);
        const projectToken = codec.seal("project", nextValue, PROJECT_TTL_MS);
        const monitorRun = nextValue.monitorRunId
          ? await getResolvedMonitorRun(broker, nextValue.monitorRunId, {
              platforms: nextValue.monitorPlatformIds,
            })
          : undefined;
        const project = await buildProjectView(
          broker,
          nextValue,
          projectToken,
          scope.knowledgeBaseTask,
          scope.questionTask,
          monitorRun,
          scope.assessmentTask,
          scope.forecastTask,
        );
        res
          .status(
            nextValue.serviceKnowledgeImportStatus === "ready" ? 201 : 202,
          )
          .json({ projectToken, project });
        return;
      }
      const legacyInput = CreateServiceAccountRequestV1Schema.parse(input);

      const signedContractReady =
        Boolean(value.serviceContractId) &&
        Boolean(value.serviceContractTemplateVersion) &&
        /^[a-f0-9]{64}$/i.test(value.serviceContractDocumentSha256 || "") &&
        Boolean(value.serviceContractSignedAt) &&
        Boolean(value.serviceContractSignatoryId);
      if (!signedContractReady) {
        throw new GeoHttpError(
          "电子合同尚未完成签署确认",
          409,
          "SERVICE_SIGNATURE_REQUIRED",
        );
      }

      if (
        value.serviceAccountUserId &&
        value.serviceAccountUsername &&
        value.serviceProvisionedAt
      ) {
        trackServiceOrder(value);
        const monitorRun = value.monitorRunId
          ? await getResolvedMonitorRun(broker, value.monitorRunId, {
              platforms: value.monitorPlatformIds,
            })
          : undefined;
        const project = await buildProjectView(
          broker,
          value,
          req.params.projectToken,
          scope.knowledgeBaseTask,
          scope.questionTask,
          monitorRun,
          scope.assessmentTask,
          scope.forecastTask,
        );
        res.json({ projectToken: req.params.projectToken, project });
        return;
      }

      const provisioned = await accountProvisioner({
        schemaVersion: 1,
        project: {
          id: value.projectId,
          companyName: value.companyName,
        },
        order: {
          id: value.serviceOrderId,
          tradeNo: value.serviceTradeNo || value.serviceOrderId,
          status: "paid",
          amountFen: value.serviceAmountFen,
          paidAt,
          serviceCategory: value.serviceCategory,
          questionId: value.serviceQuestionId,
          question: scope.question.question,
        },
        contract: {
          id: value.serviceContractId!,
          status: "signed",
          projectId: value.projectId,
          orderId: value.serviceOrderId,
          questionId: value.serviceQuestionId,
          templateVersion: value.serviceContractTemplateVersion!,
          documentSha256: value.serviceContractDocumentSha256!,
          signedAt: value.serviceContractSignedAt!,
          signatoryId: value.serviceContractSignatoryId!,
        },
        account: legacyInput,
      });
      if (
        provisioned.user.role !== "user" ||
        !provisioned.user.isActive ||
        provisioned.provision.status !== "completed"
      ) {
        throw new GeoHttpError(
          "FrontMind 账号未能完成分配",
          502,
          "ACCOUNT_PROVISIONING_INCOMPLETE",
        );
      }

      const nextValue: ProjectTokenValue = {
        ...value,
        serviceProvisioningVersion: undefined,
        serviceAccountUserId: provisioned.user.id,
        serviceAccountUsername: provisioned.user.username,
        serviceAccountDisplayName:
          provisioned.user.displayName || legacyInput.displayName,
        serviceProvisionedAt: provisioned.provision.completedAt,
      };
      const syncedValue = await syncServiceOrder(nextValue);
      trackServiceOrder(syncedValue);
      const projectToken = codec.seal("project", syncedValue, PROJECT_TTL_MS);
      const monitorRun = syncedValue.monitorRunId
        ? await getResolvedMonitorRun(broker, syncedValue.monitorRunId, {
            platforms: syncedValue.monitorPlatformIds,
          })
        : undefined;
      const project = await buildProjectView(
        broker,
        syncedValue,
        projectToken,
        scope.knowledgeBaseTask,
        scope.questionTask,
        monitorRun,
        scope.assessmentTask,
        scope.forecastTask,
      );
      res.status(201).json({ projectToken, project });
    }),
  );

  router.post(
    "/projects/:projectToken/services/account/status",
    requireConfiguration,
    requireSession,
    requireCostRate("service-account-status", 30),
    asyncHandler(async (req, res) => {
      const value = openOwnedProject(req, res);
      ServiceStatusRequestSchema.parse(req.body);
      const scope = await resolveServiceScope(value);
      let nextValue: ProjectTokenValue;
      if (value.serviceManualOrderReference) {
        const latest = await manualOrderStatusReader(
          value.serviceManualOrderReference,
        );
        nextValue = mergeManualOrder(value, latest);
        if (nextValue.serviceManualOrderStatus === "active") {
          nextValue = await handoffKnowledgeBase(
            nextValue,
            scope.knowledgeBaseTask,
          );
        }
      } else if (
        value.serviceProvisioningVersion === 2 &&
        value.serviceProvisioningReference
      ) {
        const latest = await purchaseStatusReader(
          value.serviceProvisioningReference,
        );
        nextValue = mergePurchaseProvision(value, latest);
        nextValue = await handoffKnowledgeBase(
          nextValue,
          scope.knowledgeBaseTask,
        );
      } else {
        throw new GeoHttpError(
          "尚未提交基础版服务开通请求",
          409,
          "PURCHASE_PROVISIONING_NOT_STARTED",
        );
      }
      nextValue = await syncServiceOrder(nextValue);
      trackServiceOrder(nextValue);
      const projectToken = codec.seal("project", nextValue, PROJECT_TTL_MS);
      const monitorRun = nextValue.monitorRunId
        ? await getResolvedMonitorRun(broker, nextValue.monitorRunId, {
            platforms: nextValue.monitorPlatformIds,
          })
        : undefined;
      const project = await buildProjectView(
        broker,
        nextValue,
        projectToken,
        scope.knowledgeBaseTask,
        scope.questionTask,
        monitorRun,
        scope.assessmentTask,
        scope.forecastTask,
      );
      res.json({ projectToken, project });
    }),
  );

  router.get(
    "/projects/:projectToken/archive",
    requireConfiguration,
    requireSession,
    requireSessionRate("archive-download", 12),
    asyncHandler(async (req, res, next) => {
      let value = openOwnedProject(req, res);
      const task = await getResolvedTask(broker, value.knowledgeBaseTaskId);
      if (normalizeTaskStatus(task.status) !== "completed") {
        throw new GeoHttpError("知识库 ZIP 尚未生成", 409, "ARCHIVE_NOT_READY");
      }
      value = (
        await ensureFinalizedKnowledgeBase(trackArchiveFile(value, task), task)
      ).value;
      if (value.knowledgeBaseCandidateFailure?.category === "unsafe") {
        throw new GeoHttpError(
          KNOWLEDGE_BASE_VALIDATION_PUBLIC_ERRORS.unsafe,
          422,
          "ARCHIVE_UNSAFE_VALIDATION_FAILED",
        );
      }
      const archive = resolveKnowledgeBaseArtifact(value, task);
      if (!archive)
        throw new GeoHttpError(
          "知识库任务未返回 ZIP 文件",
          404,
          "ARCHIVE_NOT_FOUND",
        );
      await loadKnowledgeBaseManifest(
        broker,
        value.knowledgeBaseTaskId,
        task,
        value.companyName,
        archive,
        value.knowledgeBaseValidationProfile,
      );
      const upstream = archive.fileId
        ? await broker.downloadFile(archive.fileId)
        : await broker.downloadTaskOutput(
            value.knowledgeBaseTaskId,
            archive.url || "",
            archive.filename,
          );
      assertResponseLengthWithinLimit(upstream, MAX_VALIDATED_ARCHIVE_BYTES);
      res.status(upstream.status);
      res.setHeader(
        "Content-Type",
        upstream.headers.get("content-type") || "application/zip",
      );
      res.setHeader(
        "Content-Disposition",
        contentDisposition(archive.filename),
      );
      res.setHeader("Cache-Control", "private, no-store");
      const length = upstream.headers.get("content-length");
      if (
        length &&
        /^\d+$/.test(length) &&
        Number(length) <= MAX_VALIDATED_ARCHIVE_BYTES
      )
        res.setHeader("Content-Length", length);
      if (!upstream.body) {
        res.end();
        return;
      }
      const stream = Readable.fromWeb(upstream.body as never);
      const limiter = createByteLimitTransform(MAX_VALIDATED_ARCHIVE_BYTES);
      const handleStreamError = (error: Error) => {
        if (res.headersSent) res.destroy(error);
        else next(error);
      };
      stream.once("error", handleStreamError);
      limiter.once("error", handleStreamError);
      req.once("close", () => {
        if (!res.writableEnded) {
          stream.destroy();
          limiter.destroy();
        }
      });
      stream.pipe(limiter).pipe(res);
    }),
  );

  router.get(
    "/projects/:projectToken/knowledge-assets/:assetId",
    requireConfiguration,
    requireSession,
    requireSessionRate("knowledge-asset-preview", 60),
    asyncHandler(async (req, res) => {
      let value = openOwnedProject(req, res);
      const task = await getResolvedTask(broker, value.knowledgeBaseTaskId);
      if (normalizeTaskStatus(task.status) !== "completed") {
        throw new GeoHttpError("企业素材尚未生成", 409, "ASSET_NOT_READY");
      }
      value = (
        await ensureFinalizedKnowledgeBase(trackArchiveFile(value, task), task)
      ).value;
      const archive = resolveKnowledgeBaseArtifact(value, task);
      if (!archive) {
        throw new GeoHttpError(
          "知识库任务未返回素材归档",
          404,
          "ASSET_NOT_FOUND",
        );
      }
      const manifest = await loadKnowledgeBaseManifest(
        broker,
        value.knowledgeBaseTaskId,
        task,
        value.companyName,
        archive,
        value.knowledgeBaseValidationProfile,
      );
      const asset = manifest.assets.find(
        (candidate) => candidate.id === req.params.assetId,
      );
      if (!asset || asset.type !== "图片") {
        throw new GeoHttpError("企业素材不存在", 404, "ASSET_NOT_FOUND");
      }
      const previews = await loadKnowledgeBaseAssetPreviews(
        broker,
        value.knowledgeBaseTaskId,
        archive,
        manifest,
      );
      const preview = previews.get(asset.id);
      if (!preview) {
        throw new GeoHttpError(
          "该素材暂不支持在线预览",
          404,
          "ASSET_PREVIEW_UNAVAILABLE",
        );
      }

      res.setHeader("Content-Type", preview.contentType);
      res.setHeader("Content-Length", preview.bytes.byteLength);
      res.setHeader(
        "Content-Disposition",
        inlineContentDisposition(preview.filename),
      );
      res.setHeader("Cache-Control", "private, max-age=600");
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.end(preview.bytes);
    }),
  );

  router.delete(
    "/projects/:projectToken",
    requireConfiguration,
    requireSession,
    requireSessionRate("project-delete", 20),
    asyncHandler(async (req, res) => {
      let value = openOwnedProject(req, res);
      const terminalMonitorRun = value.monitorRunId
        ? await getResolvedMonitorRun(broker, value.monitorRunId, {
            platforms: value.monitorPlatformIds,
          })
        : undefined;
      value = await syncMonitoringOrder(value, terminalMonitorRun);
      value = await syncServiceOrder(value);
      const projectOrders = await readProjectOrders(value.projectId);
      if (projectOrders.blockDeletion) {
        throw new GeoHttpError(
          "当前项目存在未决、对账中或尚未完成履约的订单，暂不能删除",
          409,
          "PROJECT_ORDER_DELETE_BLOCKED",
        );
      }
      await assertProjectOrderAllowsDeletion(value);
      const protectedMonitorRunId = projectOrderProtections.get(value.projectId)
        ?.monitoring?.runId;
      const taskIds = [
        value.knowledgeBaseTaskId,
        value.questionTaskId,
        value.assessmentTaskId,
        value.optimizationForecastTaskId,
        ...(value.previousKnowledgeBaseTaskIds || []),
        ...(value.previousQuestionTaskIds || []),
        ...(value.previousAssessmentTaskIds || []),
        ...(value.previousOptimizationForecastTaskIds || []),
      ].filter((item): item is string => Boolean(item));
      const monitorRunIds = [value.monitorRunId, protectedMonitorRunId].filter(
        (item): item is string => Boolean(item),
      );
      const fileIds = [
        ...(value.uploadFileIds || []),
        ...(value.archiveFileIds || []),
        ...(value.temporaryFileIds || []),
      ];
      const operations = [
        ...Array.from(new Set(taskIds)).map(() => "task"),
        ...Array.from(new Set(fileIds)).map(() => "file"),
        ...Array.from(new Set(monitorRunIds)).map(() => "monitor"),
      ];
      const results = await Promise.allSettled([
        ...Array.from(new Set(taskIds)).map((taskId) =>
          broker.deleteTask(taskId),
        ),
        ...Array.from(new Set(fileIds)).map((fileId) =>
          broker.deleteFile(fileId),
        ),
        ...Array.from(new Set(monitorRunIds)).map((runId) =>
          broker.deleteMonitorRun(runId),
        ),
      ]);
      const deleted = results.filter(
        (result) => result.status === "fulfilled",
      ).length;
      const failed = results.length - deleted;
      if (failed > 0) {
        throw new GeoHttpError(
          `远端项目清理未完成（成功 ${deleted}/${operations.length}），请重试删除`,
          502,
          "PROJECT_DELETE_INCOMPLETE",
        );
      }
      projectOrderProtections.delete(value.projectId);
      res.json({
        ok: true,
        deletedTasks: new Set(taskIds).size,
        deletedFiles: new Set(fileIds).size,
        deletedMonitorRuns: new Set(monitorRunIds).size,
      });
    }),
  );

  router.use((_req, _res, next) =>
    next(new GeoHttpError("接口不存在", 404, "NOT_FOUND")),
  );
  router.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      const normalized = normalizeError(error);
      res.status(normalized.status).json({
        ok: false,
        error: { code: normalized.code, message: normalized.message },
      });
    },
  );

  return router;
}

function normalizeQuestionIdentity(question: string) {
  return question
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "")
    .replace(/[\s?？]+/g, "");
}

function customQuestionId(question: string) {
  return `custom-${crypto
    .createHash("sha256")
    .update(normalizeQuestionIdentity(question))
    .digest("hex")
    .slice(0, 20)}`;
}

function validCustomQuestion(value: ProjectTokenValue) {
  const parsed = GeoQuestionSchema.safeParse(value.customQuestion);
  if (!parsed.success) return undefined;
  const question = parsed.data;
  if (
    !question.selectable ||
    question.category === "industry_ranking" ||
    isIndustryRankingQuestion(question.question) ||
    question.id !== customQuestionId(question.question)
  ) {
    return undefined;
  }
  return question;
}

function mergeProjectQuestions(
  value: ProjectTokenValue,
  generatedQuestions: GeoQuestion[],
) {
  const customQuestion = validCustomQuestion(value);
  return customQuestion
    ? [...generatedQuestions, customQuestion]
    : generatedQuestions;
}

function findOwnedQuestion(
  value: ProjectTokenValue,
  generatedQuestions: GeoQuestion[] | undefined,
  questionId: string,
) {
  return mergeProjectQuestions(value, generatedQuestions || []).find(
    (candidate) => candidate.id === questionId,
  );
}

function validateServiceAssessmentOutputs(
  question: GeoQuestion,
  assessmentTask: BrokerTask,
  forecastTask: BrokerTask,
  platforms: GeoMonitorPlatformId[],
  monitorRun?: BrokerMonitorRun,
  knowledgeEvidencePaths?: readonly string[],
) {
  const assessmentOutput = parseScopedAssessmentTaskOutput(
    assessmentTask,
    question,
    platforms,
    monitorRun,
    knowledgeEvidencePaths,
  );
  const assessment = calculateQuestionBaselineAssessment(assessmentOutput);
  calculateOptimizationOutcomeForecast(
    assessment,
    parseOptimizationOutcomeForecastTaskOutput(forecastTask),
  );
}

function parseScopedAssessmentTaskOutput(
  task: BrokerTask,
  question: GeoQuestion,
  platforms: GeoMonitorPlatformId[],
  monitorRun?: BrokerMonitorRun,
  knowledgeEvidencePaths?: readonly string[],
) {
  const scoped = assertAssessmentOutputScope(parseAssessmentTaskOutput(task), {
    question: {
      id: question.id,
      text: question.question,
      category: question.category,
      rankingMetricEligible: question.category !== "reputation",
    },
    platforms,
    ...(monitorRun
      ? {
          successfulResponses: monitorRun.completedItems,
          failedResponses: monitorRun.failedItems,
        }
      : {}),
  });
  if (!monitorRun) return scoped;

  const successfulSlots = new Set(
    (monitorRun.records || [])
      .filter(
        (record) =>
          record.status === "completed" && Boolean(record.answerText?.trim()),
      )
      .map((record) => `${record.platform}:${record.runIndex}`),
  );
  const allowedEvidenceRefs = new Set(knowledgeEvidencePaths || []);
  for (const record of monitorRun.records || []) {
    allowedEvidenceRefs.add(record.recordId);
    allowedEvidenceRefs.add(
      `${record.platform}/run-${String(record.runIndex).padStart(2, "0")}`,
    );
  }
  if (successfulSlots.size !== monitorRun.completedItems) {
    throw new Error(
      "monitoring successful-response records do not match the reported count",
    );
  }
  for (const comparison of scoped.knowledgeVsAnswers) {
    if (comparison.verdict === "omitted") continue;
    const slot = `${comparison.platform}:${comparison.runIndex}`;
    if (!successfulSlots.has(slot)) {
      throw new Error(
        "assessment comparison references a monitoring response that did not complete",
      );
    }
  }
  if (knowledgeEvidencePaths) {
    const allowedPaths = new Set(knowledgeEvidencePaths);
    for (const comparison of scoped.knowledgeVsAnswers) {
      for (const evidenceRef of comparison.kbEvidenceRefs) {
        if (!allowedPaths.has(evidenceRef)) {
          throw new Error(
            "assessment comparison references knowledge evidence outside the packaged ZIP",
          );
        }
      }
    }
  }
  const conclusionEvidenceRefs = [
    ...Object.values(scoped.dimensions).flatMap((dimension) =>
      Object.values(dimension).flatMap((indicator) => indicator.evidenceRefs),
    ),
    ...scoped.platformBreakdown.flatMap((platform) => platform.evidenceRefs),
    ...scoped.priorityActions.flatMap((action) => action.evidenceRefs),
  ];
  for (const evidenceRef of conclusionEvidenceRefs) {
    if (!allowedEvidenceRefs.has(evidenceRef)) {
      throw new Error(
        "assessment conclusion references evidence outside the current knowledge ZIP or monitoring run",
      );
    }
  }
  return scoped;
}

async function buildProjectView(
  broker: GeoPresalesBroker,
  value: ProjectTokenValue,
  projectToken: string,
  knowledgeBaseTask: BrokerTask,
  questionTask: BrokerTask | undefined,
  monitorRun?: BrokerMonitorRun,
  assessmentTask?: BrokerTask,
  optimizationForecastTask?: BrokerTask,
) {
  const knowledgeBase = normalizeTask(knowledgeBaseTask, "knowledge-base");
  const questionsTaskView = questionTask
    ? normalizeTask(questionTask, "questions")
    : undefined;
  const assessmentTaskView = assessmentTask
    ? normalizeTask(assessmentTask, "assessment")
    : undefined;
  const optimizationForecastTaskView = optimizationForecastTask
    ? normalizeTask(optimizationForecastTask, "optimization-forecast")
    : undefined;
  const statusSyncPending = (status: string | undefined) =>
    status === "unknown" || status === "waiting";
  const publicQuestionsTaskView = statusSyncPending(questionsTaskView?.status)
    ? {
        ...questionsTaskView,
        status: "running" as const,
        error: undefined,
      }
    : questionsTaskView;
  const archiveDescriptor =
    knowledgeBase.status === "completed"
      ? resolveKnowledgeBaseArtifact(value, knowledgeBaseTask)
      : null;
  const knowledgeBaseFinalizationFailure =
    knowledgeBase.status === "completed" &&
    value.knowledgeBaseFinalization?.state === "failed_internal"
      ? value.knowledgeBaseFinalization
      : undefined;
  let knowledgeBaseValidationFailure:
    | KnowledgeBaseArchiveValidationError
    | undefined;
  let knowledgeBaseManifest: KnowledgeBaseManifest | undefined;
  if (
    knowledgeBase.status === "completed" &&
    value.knowledgeBaseCandidateFailure
  ) {
    knowledgeBaseValidationFailure = new KnowledgeBaseArchiveValidationError(
      value.knowledgeBaseCandidateFailure.message,
      value.knowledgeBaseCandidateFailure.category,
    );
  } else if (
    knowledgeBase.status === "completed" &&
    !archiveDescriptor &&
    !knowledgeBaseFinalizationFailure
  ) {
    knowledgeBaseValidationFailure = new KnowledgeBaseArchiveValidationError(
      "completed task does not contain a ZIP artifact",
      "structure",
    );
  } else if (archiveDescriptor) {
    try {
      knowledgeBaseManifest = await loadKnowledgeBaseManifest(
        broker,
        value.knowledgeBaseTaskId,
        knowledgeBaseTask,
        value.companyName,
        archiveDescriptor,
        value.knowledgeBaseValidationProfile,
      );
    } catch (error) {
      if (!(error instanceof KnowledgeBaseArchiveValidationError)) throw error;
      knowledgeBaseValidationFailure = error;
    }
  }
  const knowledgeBaseRetryAvailable =
    !knowledgeBaseFinalizationFailure &&
    ((Boolean(knowledgeBaseValidationFailure) &&
      knowledgeBaseValidationFailure?.category !== "unsafe") ||
      ["failed", "cancelled"].includes(knowledgeBase.status));
  const knowledgeBaseAutoRetryAvailable =
    knowledgeBaseRetryAvailable &&
    knowledgeBaseValidationFailure?.category !== "unsafe" &&
    !value.knowledgeBaseAutomaticRetryUsed &&
    !value.knowledgeBaseRecovery?.automaticAttemptedAt;
  const knowledgeBaseRecoveryState:
    | "none"
    | "automatic_in_progress"
    | "manual_required"
    | "recovered" =
    knowledgeBaseManifest && value.knowledgeBaseRecovery?.automaticAttemptedAt
      ? "recovered"
      : value.knowledgeBaseRecovery?.automaticResult === "submitted" &&
          !knowledgeBaseRetryAvailable &&
          !knowledgeBaseManifest
        ? "automatic_in_progress"
        : value.knowledgeBaseRecovery?.automaticAttemptedAt &&
            knowledgeBaseRetryAvailable
          ? "manual_required"
          : "none";
  const knowledgeBaseValidationPublicError = knowledgeBaseValidationFailure
    ? KNOWLEDGE_BASE_VALIDATION_PUBLIC_ERRORS[
        knowledgeBaseValidationFailure.category
      ]
    : KNOWLEDGE_BASE_VALIDATION_PUBLIC_ERRORS.structure;
  const archiveUrl =
    archiveDescriptor && knowledgeBaseManifest
      ? `/api/geo/projects/${encodeURIComponent(projectToken)}/archive`
      : undefined;
  const publicKnowledgeBaseTask = knowledgeBaseFinalizationFailure
    ? {
        ...knowledgeBase,
        status: "failed" as const,
        progress: 100,
        error: KNOWLEDGE_BASE_FINALIZATION_PUBLIC_ERROR,
      }
    : knowledgeBaseValidationFailure
      ? {
          ...knowledgeBase,
          status: "failed" as const,
          progress: 100,
          error: knowledgeBaseValidationPublicError,
        }
      : statusSyncPending(knowledgeBase.status)
        ? {
            ...knowledgeBase,
            status: "running" as const,
            error: undefined,
          }
        : knowledgeBase;
  const executionKnowledgeBaseTask = knowledgeBaseFinalizationFailure
    ? {
        ...knowledgeBaseTask,
        status: "failed",
        output: [],
        error: { message: KNOWLEDGE_BASE_FINALIZATION_PUBLIC_ERROR },
      }
    : knowledgeBaseValidationFailure
      ? {
          ...knowledgeBaseTask,
          status: "failed",
          output: [],
          error: { message: knowledgeBaseValidationPublicError },
        }
      : knowledgeBaseTask;
  const generatedQuestions =
    questionTask && questionsTaskView?.status === "completed"
      ? parseQuestionSetFromTask(questionTask)?.questions
      : undefined;
  const questions = generatedQuestions
    ? mergeProjectQuestions(value, generatedQuestions)
    : undefined;
  const invalidQuestionResult =
    Boolean(questionTask) &&
    questionsTaskView?.status === "completed" &&
    !generatedQuestions;
  const serviceQuestion =
    questions && value.monitorQuestionId
      ? questions.find((question) => question.id === value.monitorQuestionId)
      : undefined;
  const serviceCategory =
    serviceQuestion?.category === "reputation" ||
    serviceQuestion?.category === "product_scenario" ||
    serviceQuestion?.category === "competitor_comparison"
      ? serviceQuestion.category
      : undefined;
  let serviceAssessmentReady = false;
  if (
    knowledgeBaseManifest &&
    serviceQuestion &&
    serviceCategory &&
    assessmentTask &&
    optimizationForecastTask &&
    assessmentTaskView?.status === "completed" &&
    optimizationForecastTaskView?.status === "completed"
  ) {
    try {
      validateServiceAssessmentOutputs(
        serviceQuestion,
        assessmentTask,
        optimizationForecastTask,
        monitorRun?.platforms || value.monitorPlatformIds || [],
        monitorRun,
        knowledgeBaseManifest.evidencePaths,
      );
      serviceAssessmentReady = true;
    } catch {
      serviceAssessmentReady = false;
    }
  }
  const servicePaidAt = value.servicePaidAt ?? value.serviceActivatedAt;
  const servicePaid =
    Boolean(value.serviceOrderId) &&
    Boolean(value.serviceQuestionId) &&
    Boolean(value.serviceCategory) &&
    Boolean(servicePaidAt) &&
    Number.isSafeInteger(value.serviceAmountFen) &&
    value.serviceAmountFen ===
      (value.serviceCategory
        ? GEO_SERVICE_MONTHLY_PRICE_FEN[value.serviceCategory]
        : undefined);
  const serviceSigned =
    servicePaid &&
    value.serviceProvisioningVersion !== 2 &&
    Boolean(value.serviceContractId) &&
    Boolean(value.serviceContractTemplateVersion) &&
    /^[a-f0-9]{64}$/i.test(value.serviceContractDocumentSha256 || "") &&
    Boolean(value.serviceContractSignedAt) &&
    Boolean(value.serviceContractSignatoryId);
  const legacyServiceActive =
    serviceSigned &&
    Number.isSafeInteger(value.serviceAccountUserId) &&
    Boolean(value.serviceAccountUsername) &&
    Boolean(value.serviceProvisionedAt);
  const v2ServiceActive =
    servicePaid &&
    value.serviceProvisioningVersion === 2 &&
    value.serviceProvisioningStatus === "provisioned" &&
    value.serviceKnowledgeImportStatus === "ready";
  const manualServiceOrder = Boolean(
    value.serviceManualOrderReference &&
      value.serviceManualOrderStatus &&
      value.serviceQuestionId &&
      value.serviceCategory &&
      Number.isSafeInteger(value.serviceAmountFen),
  );
  const manualServiceActive =
    manualServiceOrder &&
    servicePaid &&
    value.serviceManualOrderStatus === "active" &&
    value.serviceKnowledgeImportStatus === "ready";
  const serviceActive =
    legacyServiceActive || v2ServiceActive || manualServiceActive;
  const v2ActivationStatus =
    value.serviceProvisioningStatus === "failed" ||
    value.serviceKnowledgeImportStatus === "failed"
      ? "failed"
      : v2ServiceActive
        ? "active"
        : value.serviceProvisioningStatus === "pending_confirmation"
          ? "signature_required"
          : value.serviceProvisioningStatus === "provisioned"
            ? "provisioning"
            : "account_setup_required";
  const manualActivationStatus =
    value.serviceManualOrderStatus === "failed" ||
    value.serviceManualOrderStatus === "rejected" ||
    value.serviceKnowledgeImportStatus === "failed"
      ? "failed"
      : manualServiceActive
        ? "active"
        : value.serviceManualOrderStatus === "pending_admin"
          ? "contract_preparing"
          : value.serviceManualOrderStatus === "signature_required"
            ? "signature_required"
            : value.serviceManualOrderStatus === "payment_required"
              ? "payment_required"
              : value.serviceManualOrderStatus === "account_setup_required"
                ? "account_setup_required"
                : value.serviceManualOrderStatus === "activation_required" ||
                    value.serviceManualOrderStatus === "active"
                  ? "provisioning"
                  : "contract_preparing";

  const failed =
    ["failed", "cancelled"].includes(publicKnowledgeBaseTask.status) ||
    (questionsTaskView &&
      ["failed", "cancelled"].includes(questionsTaskView.status)) ||
    (assessmentTaskView &&
      ["failed", "cancelled"].includes(assessmentTaskView.status)) ||
    (optimizationForecastTaskView &&
      ["failed", "cancelled"].includes(optimizationForecastTaskView.status)) ||
    (monitorRun &&
      ["remote_failed", "shape_mismatch"].includes(monitorRun.status)) ||
    invalidQuestionResult;
  const taskProjectStatus = (taskStatus: string) =>
    statusSyncPending(taskStatus) ? "running" : taskStatus;
  const status = failed
    ? "failed"
    : optimizationForecastTaskView
      ? taskProjectStatus(optimizationForecastTaskView.status)
      : assessmentTaskView
        ? taskProjectStatus(assessmentTaskView.status)
        : monitorRun &&
            [
              "submission_in_progress",
              "submission_unknown",
              "submitted",
              "polling",
            ].includes(monitorRun.status)
          ? "running"
          : questions
            ? "completed"
            : publicQuestionsTaskView
              ? taskProjectStatus(publicQuestionsTaskView.status)
              : knowledgeBaseManifest
                ? "ready_for_questions"
                : taskProjectStatus(publicKnowledgeBaseTask.status);
  const stage =
    servicePaid || manualServiceOrder
      ? "service_activation"
      : assessmentTask
        ? "current_assessment"
        : monitorRun
          ? "monitoring"
          : knowledgeBaseManifest
            ? "question_recommendation"
            : "enterprise_analysis";
  const publicMonitoring = monitorRun
    ? toPublicMonitorView(monitorRun)
    : undefined;
  const publicAssessment = assessmentTask
    ? toPublicAssessmentView(
        assessmentTask,
        serviceQuestion,
        monitorRun,
        knowledgeBaseManifest?.evidencePaths,
      )
    : undefined;
  const publicOptimizationForecast =
    optimizationForecastTask && assessmentTask
      ? toPublicOptimizationForecastView(
          optimizationForecastTask,
          assessmentTask,
          serviceQuestion,
          monitorRun,
          knowledgeBaseManifest?.evidencePaths,
        )
      : undefined;
  const questionRetryAvailable = false;
  const assessmentRetryAvailable =
    Boolean(assessmentTask) &&
    (value.assessmentAttempt || 1) < 2 &&
    assessmentTaskView?.status !== "unknown" &&
    (publicAssessment?.status === "failed" ||
      ["failed", "cancelled"].includes(assessmentTaskView?.status || ""));
  const optimizationForecastRetryAvailable =
    Boolean(optimizationForecastTask) &&
    (value.optimizationForecastAttempt || 1) < 2 &&
    optimizationForecastTaskView?.status !== "unknown" &&
    (publicOptimizationForecast?.status === "failed" ||
      ["failed", "cancelled"].includes(
        optimizationForecastTaskView?.status || "",
      ));
  const executionLog = buildGeoExecutionLog({
    knowledgeBaseTask: executionKnowledgeBaseTask,
    questionTask,
    monitorRun,
    assessmentTask,
    optimizationForecastTask,
    submittedAt: {
      knowledgeBase: value.knowledgeBaseSubmittedAt,
      question: value.questionSubmittedAt,
      assessment: value.assessmentSubmittedAt,
      optimizationForecast: value.optimizationForecastSubmittedAt,
    },
    validated: {
      knowledgeBaseSummary: knowledgeBaseManifest?.summary,
      knowledgeBaseArchiveName: knowledgeBaseManifest
        ? archiveDescriptor?.filename
        : undefined,
      questionCount: questions?.length,
      assessmentReady: publicAssessment?.status === "ready",
      assessmentSummary:
        publicAssessment?.status === "ready"
          ? publicAssessment.summary
          : undefined,
      comparisonCount:
        publicAssessment?.status === "ready"
          ? publicAssessment.comparisons.length
          : undefined,
      forecastReady: publicOptimizationForecast?.status === "ready",
      forecastSummary:
        publicOptimizationForecast?.status === "ready"
          ? publicOptimizationForecast.summary
          : undefined,
      serviceActivatedAt: serviceActive
        ? value.serviceActivatedAt || value.serviceProvisionedAt
        : undefined,
    },
  });

  return {
    id: value.projectId,
    createdAt: value.knowledgeBaseSubmittedAt,
    companyName: value.companyName,
    stage,
    status,
    // Raw task output may contain structured JSON, tool records, or model
    // internals. Parsed public results and the allowlisted execution log are
    // the only task content exposed to the browser.
    kbTask: { ...publicKnowledgeBaseTask, output: [] },
    questionTask: publicQuestionsTaskView
      ? { ...publicQuestionsTaskView, output: [] }
      : undefined,
    assessmentTask: assessmentTaskView
      ? { ...assessmentTaskView, output: [] }
      : undefined,
    optimizationForecastTask: optimizationForecastTaskView
      ? { ...optimizationForecastTaskView, output: [] }
      : undefined,
    archive:
      archiveDescriptor && knowledgeBaseManifest
        ? {
            filename: archiveDescriptor.filename,
            contentType: "application/zip",
            downloadUrl: archiveUrl,
          }
        : undefined,
    knowledgeBase: knowledgeBaseManifest
      ? {
          ...omitKnowledgeEvidencePaths(knowledgeBaseManifest),
          assets: knowledgeBaseManifest.assets.map(({ zipPath, ...asset }) => ({
            ...asset,
            archivePath: zipPath,
            previewUrl: /\.(?:avif|webp|png|jpe?g|gif)$/i.test(asset.name)
              ? `/api/geo/projects/${encodeURIComponent(
                  projectToken,
                )}/knowledge-assets/${encodeURIComponent(asset.id)}`
              : undefined,
          })),
          archiveName: archiveDescriptor?.filename,
          archiveUrl,
        }
      : undefined,
    questions,
    selectedQuestionId: value.monitorQuestionId,
    selectedPlatformIds: value.monitorPlatformIds || [],
    knowledgeBaseRetryAvailable,
    knowledgeBaseAutoRetryAvailable,
    knowledgeBaseRecoveryState,
    knowledgeBaseValidationCategory: knowledgeBaseValidationFailure?.category,
    knowledgeBaseSupportRequired:
      !knowledgeBaseFinalizationFailure &&
      (knowledgeBaseValidationFailure?.category === "unsafe" ||
        (statusSyncPending(knowledgeBase.status) &&
          hasElapsed(value.knowledgeBaseSubmittedAt, 15 * 60 * 1_000))),
    knowledgeBaseFinalization: {
      finalizationState:
        value.knowledgeBaseFinalization?.state ??
        (knowledgeBaseManifest ? "completed" : "pending"),
      finalizerVersion:
        value.knowledgeBaseFinalization?.finalizerVersion ??
        value.knowledgeBaseArtifact?.finalizerVersion ??
        WEBSITE_KB_FINALIZER_VERSION,
      candidateSha256:
        value.knowledgeBaseFinalization?.candidateSha256 ??
        value.knowledgeBaseArtifact?.candidate.sha256,
      errorCode: value.knowledgeBaseFinalization?.errorCode,
      retryAvailable:
        value.knowledgeBaseFinalization?.state === "failed_internal" &&
        value.knowledgeBaseFinalization.retryAvailable === true,
    },
    questionRetryAvailable,
    assessmentRetryAvailable,
    optimizationForecastRetryAvailable,
    monitoring: publicMonitoring,
    assessment: publicAssessment,
    optimizationForecast: publicOptimizationForecast,
    executionLog,
    serviceActivation:
      manualServiceOrder &&
      value.serviceCategory &&
      value.serviceQuestionId &&
      value.serviceAmountFen
        ? {
            status: manualActivationStatus,
            category: value.serviceCategory,
            amountFen: value.serviceAmountFen,
            billingMonths: 1,
            planCode: "basic",
            serviceDays: 30,
            questionId: value.serviceQuestionId,
            orderId: value.serviceOrderId,
            paidAt: value.servicePaidAt,
            profileSubmittedAt: value.serviceProfileSubmittedAt,
            contractId: value.serviceManualContractId,
            signingUrl: value.serviceManualSigningUrl,
            signedAt: value.serviceManualSignedAt,
            contractWorkflowReference: value.serviceManualOrderReference,
            manualOrderReference: value.serviceManualOrderReference,
            manualOrderStatus: value.serviceManualOrderStatus,
            provisioningReference: value.serviceProvisioningReference,
            provisioningMessage: value.serviceManualOrderMessage,
            provisioningRetryable: value.serviceManualOrderRetryable,
            accountMode: value.serviceAccountMode,
            accountUsername: value.serviceAccountUsername,
            accountDisplayName: value.serviceAccountDisplayName,
            accountSetupUrl: serviceActive
              ? value.serviceAccountSetupUrl
              : undefined,
            workspaceUrl: serviceActive ? value.serviceWorkspaceUrl : undefined,
            provisionedAt: value.serviceProvisionedAt,
            activatedAt: serviceActive
              ? value.serviceActivatedAt || value.serviceProvisionedAt
              : undefined,
            knowledgeImport: value.serviceKnowledgeImportStatus
              ? {
                  status: value.serviceKnowledgeImportStatus,
                  retryable: value.serviceKnowledgeImportRetryable,
                  message: value.serviceKnowledgeImportMessage,
                  updatedAt: value.serviceKnowledgeImportUpdatedAt,
                }
              : undefined,
            error:
              manualActivationStatus === "failed"
                ? value.serviceKnowledgeImportMessage ||
                  value.serviceManualOrderMessage ||
                  (value.serviceManualOrderStatus === "rejected"
                    ? "签约资料未通过管理员审核"
                    : "服务开通未完成，请重试")
                : undefined,
          }
        : servicePaid
          ? {
              status:
                value.serviceProvisioningVersion === 2
                  ? v2ActivationStatus
                  : serviceActive
                    ? "active"
                    : serviceSigned
                      ? "account_setup_required"
                      : "profile_required",
              category: value.serviceCategory,
              amountFen: value.serviceAmountFen,
              billingMonths: 1,
              planCode:
                value.serviceProvisioningVersion === 2 ? "basic" : undefined,
              serviceDays:
                value.serviceProvisioningVersion === 2 ? 30 : undefined,
              questionId: value.serviceQuestionId,
              orderId: value.serviceOrderId,
              paidAt: servicePaidAt,
              signedAt: value.serviceContractSignedAt,
              provisioningVersion: value.serviceProvisioningVersion,
              provisioningReference: value.serviceProvisioningReference,
              provisioningStatus: value.serviceProvisioningStatus,
              provisioningMessage: value.serviceProvisioningMessage,
              provisioningRetryable: value.serviceProvisioningRetryable,
              accountMode: value.serviceAccountMode,
              accountUsername: value.serviceAccountUsername,
              accountDisplayName: value.serviceAccountDisplayName,
              accountSetupUrl: serviceActive
                ? value.serviceAccountSetupUrl
                : undefined,
              workspaceUrl: serviceActive
                ? value.serviceWorkspaceUrl
                : undefined,
              provisionedAt: value.serviceProvisionedAt,
              activatedAt: serviceActive
                ? value.serviceActivatedAt || value.serviceProvisionedAt
                : undefined,
              knowledgeImport:
                value.serviceProvisioningVersion === 2
                  ? {
                      status: value.serviceKnowledgeImportStatus || "pending",
                      retryable: value.serviceKnowledgeImportRetryable,
                      message: value.serviceKnowledgeImportMessage,
                      updatedAt: value.serviceKnowledgeImportUpdatedAt,
                    }
                  : undefined,
              error:
                v2ActivationStatus === "failed"
                  ? value.serviceKnowledgeImportMessage ||
                    value.serviceProvisioningMessage ||
                    "服务开通未完成，请重试"
                  : undefined,
            }
          : serviceAssessmentReady && serviceCategory && serviceQuestion
            ? {
                status: "not_started",
                category: serviceCategory,
                amountFen: GEO_SERVICE_MONTHLY_PRICE_FEN[serviceCategory],
                billingMonths: 1,
                questionId: serviceQuestion.id,
              }
            : undefined,
    questionValidationError: invalidQuestionResult
      ? "推荐结果未通过四类各五题的结构校验，请联系技术支持"
      : undefined,
    error: knowledgeBaseFinalizationFailure
      ? KNOWLEDGE_BASE_FINALIZATION_PUBLIC_ERROR
      : knowledgeBaseValidationFailure
        ? knowledgeBaseValidationPublicError
        : undefined,
  };
}

function toPublicAssessmentView(
  task: BrokerTask,
  question?: GeoQuestion,
  monitorRun?: BrokerMonitorRun,
  knowledgeEvidencePaths?: readonly string[],
) {
  const taskView = normalizeTask(task, "assessment");
  if (taskView.status !== "completed") {
    const syncing = ["unknown", "waiting"].includes(taskView.status);
    return {
      status: syncing ? ("running" as const) : taskView.status,
      dimensions: {},
      comparisons: [],
      error: syncing ? undefined : taskView.error,
    };
  }
  try {
    const raw =
      question && monitorRun
        ? parseScopedAssessmentTaskOutput(
            task,
            question,
            monitorRun.platforms,
            monitorRun,
            knowledgeEvidencePaths,
          )
        : parseAssessmentTaskOutput(task);
    const result = calculateQuestionBaselineAssessment(raw);
    const dimensionEntries = [
      ["semantic_visibility", result.dimensions.semanticVisibility],
      ["semantic_coherence", result.dimensions.semanticCoherence],
      ["semantic_richness", result.dimensions.semanticRichness],
      ["semantic_authority", result.dimensions.semanticAuthority],
      ["competitive_advantage", result.dimensions.competitiveAdvantage],
    ] as const;
    const verdictStatus = {
      supported: "aligned",
      contradicted: "conflict",
      omitted: "missing",
      unverifiable: "opportunity",
    } as const;
    const allowedPlatforms = new Set<string>(GEO_MONITOR_PLATFORM_IDS);
    const confidenceScore = result.overview.confidence.score;
    return {
      status: "ready",
      totalScore: result.overview.applicableScore,
      rawTotalScore: result.overview.score,
      grade: determineBsasGrade(result.overview.applicableScore),
      rawGrade: result.overview.grade,
      structuralExcludedMaxScore: result.overview.structuralExcludedMaxScore,
      applicableMaxScore: result.overview.applicableMaxScore,
      coverage: result.overview.coverage.ratio,
      confidence:
        confidenceScore >= 0.75
          ? "high"
          : confidenceScore >= 0.5
            ? "medium"
            : "low",
      scopeLabel:
        result.overview.structuralExcludedMaxScore > 0
          ? "本题可测项表现"
          : result.scope.label,
      summary: result.overview.summary,
      dimensions: Object.fromEntries(
        dimensionEntries.map(([id, dimension]) => [
          id,
          {
            id,
            label: dimension.label,
            score: dimension.score,
            maxScore: dimension.maxScore,
            coverage: dimension.coverage,
            summary: Object.values(dimension.indicators)
              .filter(
                (indicator) => indicator.measurementStatus !== "unavailable",
              )
              .slice(0, 2)
              .map((indicator) => indicator.calculationBasis)
              .join("；"),
          },
        ]),
      ),
      comparisons: result.knowledgeVsAnswers.map((comparison) => ({
        id: comparison.id,
        topic:
          comparison.topic ||
          comparison.kbClaimText ||
          (comparison.verdict === "unverifiable"
            ? "AI 新增但知识库未证实"
            : "知识库事实对照"),
        status: verdictStatus[comparison.verdict],
        knowledgeBaseFact: comparison.kbClaimText || undefined,
        knowledgeClaimId: comparison.kbClaimId || undefined,
        answerExcerpt: comparison.answerExcerpt || undefined,
        explanation: comparison.explanation,
        answerFinding: comparison.explanation || comparison.answerExcerpt,
        recommendedAction: comparison.recommendedAction,
        runIndex: comparison.runIndex || undefined,
        confidence: comparison.confidence,
        platforms:
          comparison.platform && allowedPlatforms.has(comparison.platform)
            ? [comparison.platform]
            : [],
        evidenceRefs: comparison.kbEvidenceRefs,
      })),
      platformBreakdown: result.platformBreakdown,
      priorityActions: result.priorityActions,
      limitations: result.scope.limitations,
      rankingDiagnostics: result.rankingDiagnostics,
      methodology: {
        assessmentType: result.assessmentType,
        isFullBsasAudit: result.scope.isFullBsasAudit,
        normalizedMeasuredScore: result.overview.normalizedMeasuredScore,
        applicableScore: result.overview.applicableScore,
        applicableMaxScore: result.overview.applicableMaxScore,
        structuralExcludedMaxScore: result.overview.structuralExcludedMaxScore,
        confidenceScore,
      },
    };
  } catch (error) {
    return {
      status: "failed",
      dimensions: {},
      comparisons: [],
      error:
        error instanceof Error
          ? `现状评估结果未通过结构校验：${error.message}`
          : "现状评估结果未通过结构校验",
    };
  }
}

function toPublicOptimizationForecastView(
  task: BrokerTask,
  assessmentTask: BrokerTask,
  question?: GeoQuestion,
  monitorRun?: BrokerMonitorRun,
  knowledgeEvidencePaths?: readonly string[],
) {
  const taskView = normalizeTask(task, "optimization-forecast");
  if (taskView.status !== "completed") {
    const syncing = ["unknown", "waiting"].includes(taskView.status);
    return {
      status: syncing ? ("running" as const) : taskView.status,
      dimensions: [],
      assumptions: [],
      roadmap: [],
      error: syncing ? undefined : taskView.error,
    };
  }

  try {
    const rawAssessment =
      question && monitorRun
        ? parseScopedAssessmentTaskOutput(
            assessmentTask,
            question,
            monitorRun.platforms,
            monitorRun,
            knowledgeEvidencePaths,
          )
        : parseAssessmentTaskOutput(assessmentTask);
    const assessment = calculateQuestionBaselineAssessment(rawAssessment);
    const result = calculateOptimizationOutcomeForecast(
      assessment,
      parseOptimizationOutcomeForecastTaskOutput(task),
    );
    const dimensionEntries = [
      ["semantic_visibility", result.dimensions.semanticVisibility],
      ["semantic_coherence", result.dimensions.semanticCoherence],
      ["semantic_richness", result.dimensions.semanticRichness],
      ["semantic_authority", result.dimensions.semanticAuthority],
      ["competitive_advantage", result.dimensions.competitiveAdvantage],
    ] as const;
    const actionLabelById = new Map(
      result.actions.map((action) => [action.id, action.label]),
    );

    return {
      status: "ready",
      horizonWeeks: result.horizonWeeks,
      currentScore: result.applicableTotal.current,
      targetLow: result.applicableTotal.low,
      targetExpected: result.applicableTotal.expected,
      targetHigh: result.applicableTotal.high,
      gradeLow: result.applicableGradeRange.low,
      gradeHigh: result.applicableGradeRange.high,
      challengeUpperOnly: result.applicableGradeRange.challengeUpperOnly,
      rawCurrentScore: result.total.current,
      rawTargetLow: result.total.low,
      rawTargetExpected: result.total.expected,
      rawTargetHigh: result.total.high,
      scoreBasis: {
        type: "applicable_scope",
        applicableMaxScore: result.applicableTotal.rawApplicableMaxScore,
        structuralExcludedMaxScore:
          result.applicableTotal.structuralExcludedMaxScore,
      },
      summary: result.summary,
      dimensions: dimensionEntries.flatMap(([id, dimension]) => {
        const projected = Object.values(dimension.indicators).filter(
          (indicator) => indicator.measurementStatus === "projectable",
        );
        if (projected.length === 0) return [];
        return [
          {
            id,
            label: dimension.label,
            currentScore: dimension.current,
            targetLow: dimension.low,
            targetExpected: dimension.expected,
            targetHigh: dimension.high,
            maxScore: dimension.maxScore,
            summary: Array.from(
              new Set(projected.map((indicator) => indicator.rationale)),
            )
              .slice(0, 2)
              .join("；"),
            actions: Array.from(
              new Set(
                projected.flatMap((indicator) =>
                  indicator.actionIds.map(
                    (actionId) => actionLabelById.get(actionId) || actionId,
                  ),
                ),
              ),
            ),
          },
        ];
      }),
      assumptions: result.assumptions,
      roadmap: result.roadmap,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: "failed",
      dimensions: [],
      assumptions: [],
      roadmap: [],
      error:
        error instanceof Error
          ? `优化效果评估未通过结构校验：${error.message}`
          : "优化效果评估未通过结构校验",
    };
  }
}

const manifestCacheByBroker = new WeakMap<
  GeoPresalesBroker,
  Map<string, { expiresAt: number; promise: Promise<KnowledgeBaseManifest> }>
>();
const assetPreviewCacheByBroker = new WeakMap<
  GeoPresalesBroker,
  Map<
    string,
    {
      expiresAt: number;
      promise: Promise<Map<string, KnowledgeBaseAssetPreview>>;
    }
  >
>();

function omitKnowledgeEvidencePaths(manifest: KnowledgeBaseManifest) {
  const { evidencePaths: _evidencePaths, ...publicManifest } = manifest;
  return publicManifest;
}

async function loadKnowledgeEvidencePaths(
  broker: GeoPresalesBroker,
  value: ProjectTokenValue,
  taskId: string,
  task: BrokerTask,
  companyName: string,
  validationProfile?: "website-lead-v1",
) {
  const archive = resolveKnowledgeBaseArtifact(value, task);
  if (!archive) {
    throw new GeoHttpError("知识库 ZIP 尚未准备完成", 409, "ARCHIVE_NOT_READY");
  }
  const manifest = await loadKnowledgeBaseManifest(
    broker,
    taskId,
    task,
    companyName,
    archive,
    validationProfile,
  );
  return manifest.evidencePaths;
}

async function loadKnowledgeBaseManifest(
  broker: GeoPresalesBroker,
  taskId: string,
  task: BrokerTask,
  companyName: string,
  archive: {
    fileId?: string;
    url?: string;
    filename: string;
    sha256?: string;
    packageManifestSha256?: string;
  },
  validationProfile?: "website-lead-v1",
) {
  let cache = manifestCacheByBroker.get(broker);
  if (!cache) {
    cache = new Map();
    manifestCacheByBroker.set(broker, cache);
  }
  const cacheKey = `${taskId}:${archive.fileId || archive.url || archive.filename}:${
    validationProfile || "historical-compatible"
  }:${archive.sha256 || "unverified"}:${
    archive.packageManifestSha256 || "unverified"
  }`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = (async () => {
    let bytes: Buffer;
    try {
      const response = archive.fileId
        ? await broker.downloadFile(archive.fileId)
        : await broker.downloadTaskOutput(
            taskId,
            archive.url || "",
            archive.filename,
          );
      bytes = await readResponseBufferLimited(
        response,
        MAX_VALIDATED_ARCHIVE_BYTES,
      );
    } catch (error) {
      if (error instanceof GeoByteLimitError) {
        throw new KnowledgeBaseArchiveValidationError(
          "Knowledge-base archive exceeds the compressed size limit",
          "unsafe",
        );
      }
      console.warn("[GEO KB]", {
        event: "archive_download_failed",
        taskId,
        fileId: archive.fileId,
        filename: archive.filename,
        diagnosticCode:
          error instanceof GeoBrokerError ? error.code : "ARCHIVE_READ_FAILED",
        upstreamStatus:
          error instanceof GeoBrokerError ? error.status : undefined,
      });
      throw new GeoHttpError(
        "知识库 ZIP 暂时无法读取，请稍后重试",
        502,
        "ARCHIVE_READ_FAILED",
      );
    }
    if (
      archive.sha256 &&
      crypto.createHash("sha256").update(bytes).digest("hex") !== archive.sha256
    ) {
      throw new GeoHttpError(
        "知识库正式文件传输校验失败，请稍后重试",
        502,
        "FINAL_ARCHIVE_HASH_MISMATCH",
      );
    }
    let manifest: KnowledgeBaseManifest;
    try {
      if (!bytes.length) throw new Error("Knowledge-base archive is empty");
      manifest = await parseKnowledgeBaseArchive(bytes, {
        companyName,
        validationProfile,
        generatedAt:
          typeof task.completed_at === "string"
            ? task.completed_at
            : typeof task.updated_at === "string"
              ? task.updated_at
              : undefined,
      });
    } catch (error) {
      console.warn(
        "[GEO API] Rejected an invalid knowledge-base archive:",
        error instanceof Error ? error.message : String(error),
      );
      const category =
        error instanceof ArchiveContractValidationError
          ? error.category
          : ("structure" as const);
      throw new KnowledgeBaseArchiveValidationError(
        knowledgeBaseValidationReason(error),
        category,
      );
    }
    if (
      archive.packageManifestSha256 &&
      manifest.packageManifestSha256 !== archive.packageManifestSha256
    ) {
      throw new GeoHttpError(
        "知识库正式文件清单校验失败，请稍后重试",
        502,
        "FINAL_ARCHIVE_MANIFEST_MISMATCH",
      );
    }
    return manifest;
  })();

  cache.set(cacheKey, { expiresAt: Date.now() + 10 * 60 * 1000, promise });
  while (cache.size > 20) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
  try {
    return await promise;
  } catch (error) {
    if (!(error instanceof KnowledgeBaseArchiveValidationError))
      cache.delete(cacheKey);
    throw error;
  }
}

async function loadKnowledgeBaseAssetPreviews(
  broker: GeoPresalesBroker,
  taskId: string,
  archive: { fileId?: string; url?: string; filename: string },
  manifest: KnowledgeBaseManifest,
) {
  let cache = assetPreviewCacheByBroker.get(broker);
  if (!cache) {
    cache = new Map();
    assetPreviewCacheByBroker.set(broker, cache);
  }
  const cacheKey = `${taskId}:${archive.fileId || archive.url || archive.filename}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = (async () => {
    const response = archive.fileId
      ? await broker.downloadFile(archive.fileId)
      : await broker.downloadTaskOutput(
          taskId,
          archive.url || "",
          archive.filename,
        );
    const bytes = await readResponseBufferLimited(
      response,
      MAX_VALIDATED_ARCHIVE_BYTES,
    );
    if (!bytes.length) throw new Error("Knowledge-base archive is empty");
    return extractKnowledgeBaseAssetPreviews(bytes, manifest);
  })();

  cache.set(cacheKey, { expiresAt: Date.now() + 10 * 60 * 1000, promise });
  while (cache.size > 5) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
  try {
    return await promise;
  } catch (error) {
    cache.delete(cacheKey);
    console.warn(
      "[GEO API] Failed to build knowledge asset previews:",
      error instanceof Error ? error.message : String(error),
    );
    throw new GeoHttpError("企业素材暂时无法预览", 502, "ASSET_PREVIEW_FAILED");
  }
}

async function getResolvedTask(broker: GeoPresalesBroker, taskId: string) {
  const task = await broker.getTask(taskId);
  if (normalizeTaskStatus(task.status) !== "completed") return task;
  try {
    return await broker.getTaskResult(taskId);
  } catch (error) {
    if (hasTrustedCompletedTaskOutput(task)) return task;
    if (isRecoverableTaskResultError(error)) {
      throw new GeoHttpError(
        "任务已完成，但结果暂时无法读取，请稍后重试",
        502,
        "TASK_RESULT_TEMPORARILY_UNAVAILABLE",
      );
    }
    throw error;
  }
}

function hasTrustedCompletedTaskOutput(task: BrokerTask): boolean {
  return (
    Boolean(findArchiveDescriptor(task)) ||
    trustedAssistantOutputTexts(task).length > 0
  );
}

function isRecoverableTaskResultError(error: unknown): boolean {
  if (!(error instanceof GeoBrokerError)) return false;
  if (
    [
      "TASK_RESULT_PENDING",
      "AGENT_UNAVAILABLE",
      "AGENT_INVALID_RESPONSE",
    ].includes(error.code)
  ) {
    return true;
  }
  return (
    [404, 409, 425, 429].includes(error.status) ||
    (error.status >= 500 && error.status <= 599)
  );
}

async function getResolvedMonitorRun(
  broker: GeoPresalesBroker,
  runId: string,
  expected?: {
    question?: string;
    platforms?: GeoMonitorPlatformId[];
  },
) {
  const status = normalizeMonitorRun(await broker.getMonitorRun(runId), {
    ...expected,
    runId,
  });
  const terminal = [
    "completed",
    "partial_review_required",
    "remote_failed",
    "shape_mismatch",
  ].includes(status.status);
  try {
    return normalizeMonitorRun(await broker.getMonitorResult(runId), {
      ...expected,
      runId,
    });
  } catch (error) {
    if (["remote_failed", "shape_mismatch"].includes(status.status))
      return status;
    if (!terminal && isRecoverableMonitorResultError(error)) return status;
    throw error;
  }
}

function isRecoverableMonitorResultError(error: unknown): boolean {
  if (error instanceof GeoMonitorContractError) return true;
  if (!(error instanceof GeoBrokerError)) return false;
  if (
    [
      "MONITOR_RESULT_PENDING",
      "AGENT_UNAVAILABLE",
      "AGENT_INVALID_RESPONSE",
    ].includes(error.code)
  ) {
    return true;
  }
  return (
    [404, 409, 425, 429].includes(error.status) ||
    (error.status >= 500 && error.status <= 599)
  );
}

async function materializeArchiveAttachment(
  broker: GeoPresalesBroker,
  taskId: string,
  archive: { fileId?: string; url?: string; filename: string },
) {
  if (archive.fileId)
    return {
      file_id: archive.fileId,
      filename: archive.filename,
      temporary: false,
    };
  if (!archive.url)
    throw new GeoHttpError("知识库 ZIP 缺少下载地址", 409, "ARCHIVE_NOT_READY");

  const response = await broker.downloadTaskOutput(
    taskId,
    archive.url,
    archive.filename,
  );
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_ARCHIVE_COPY_BYTES) {
    throw new GeoHttpError(
      "知识库 ZIP 超出推荐任务附件上限",
      413,
      "ARCHIVE_TOO_LARGE",
    );
  }
  let body: Buffer;
  try {
    body = await readResponseBufferLimited(response, MAX_ARCHIVE_COPY_BYTES);
  } catch (error) {
    if (error instanceof GeoByteLimitError) {
      throw new GeoHttpError(
        "知识库 ZIP 超出推荐任务附件上限",
        413,
        "ARCHIVE_TOO_LARGE",
      );
    }
    throw error;
  }
  if (!body.length || body.length > MAX_ARCHIVE_COPY_BYTES) {
    throw new GeoHttpError("知识库 ZIP 无效或过大", 413, "ARCHIVE_TOO_LARGE");
  }
  const file = await broker.createFile({
    filename: archive.filename,
    mimeType: "application/zip",
    sizeBytes: body.length,
  });
  await broker.uploadFile(
    file.id,
    body,
    "application/zip",
    file.proxy_upload_ticket,
  );
  return {
    file_id: file.id,
    filename: file.filename || archive.filename,
    temporary: true,
  };
}

async function classifyCustomQuestion(input: {
  broker: GeoPresalesBroker;
  value: ProjectTokenValue;
  knowledgeBaseTask: BrokerTask;
  question: string;
}) {
  const archive = resolveKnowledgeBaseArtifact(
    input.value,
    input.knowledgeBaseTask,
  );
  if (!archive) {
    throw new GeoHttpError(
      "企业知识库准备完成后才能验证自定义问题",
      409,
      "ARCHIVE_NOT_READY",
    );
  }
  const manifest = await loadKnowledgeBaseManifest(
    input.broker,
    input.value.knowledgeBaseTaskId,
    input.knowledgeBaseTask,
    input.value.companyName,
    archive,
    input.value.knowledgeBaseValidationProfile,
  );
  const archiveAttachment = await materializeArchiveAttachment(
    input.broker,
    input.value.knowledgeBaseTaskId,
    archive,
  );
  let taskId: string | undefined;
  let skillFileIds: string[] = [];

  try {
    const created = await createGeoTaskWithSkillPackages(
      input.broker,
      {
        projectId: input.value.projectId,
        prompt: buildGeoCustomQuestionClassifierPrompt({
          companyName: input.value.companyName,
          question: input.question,
          archiveFilename: archiveAttachment.filename,
        }),
        attachments: [archiveAttachment],
        idempotencyKey: [
          "geo",
          input.value.projectId,
          "custom-question-classifier",
          crypto
            .createHash("sha256")
            .update(normalizeQuestionIdentity(input.question))
            .digest("hex")
            .slice(0, 24),
          crypto.randomUUID(),
        ].join(":"),
      },
      [
        {
          filename: CUSTOM_QUESTION_CLASSIFIER_SKILL_ARCHIVE_FILENAME,
          body: await buildGeoCustomQuestionClassifierSkillArchive(),
        },
      ],
    );
    skillFileIds = created.skillAttachments.map(
      (attachment) => attachment.file_id,
    );
    taskId = taskIdFrom(created.task);
    if (!taskId) {
      throw new GeoHttpError(
        "创建问题验证任务失败：缺少任务 ID",
        502,
        "CUSTOM_QUESTION_CLASSIFIER_TASK_ID_MISSING",
      );
    }

    const resolvedTask = await waitForCustomQuestionClassification(
      input.broker,
      taskId,
      created.task,
    );
    const classification =
      parseCustomQuestionClassificationTaskOutput(resolvedTask);
    if (!classification) {
      console.warn("[GEO custom question]", {
        event: "classifier_output_rejected",
        projectId: input.value.projectId,
        taskId,
        diagnosticCode: "CUSTOM_QUESTION_CLASSIFIER_INVALID_RESPONSE",
      });
      throw new GeoHttpError(
        "问题验证结果暂时无法读取，请稍后重试",
        502,
        "CUSTOM_QUESTION_CLASSIFIER_INVALID_RESPONSE",
      );
    }

    if (classification.decision === "accept") {
      const grounding = validateAcceptedCustomQuestionGrounding(
        classification,
        {
          question: input.question,
          companyName: input.value.companyName,
          manifest,
        },
      );
      if (!grounding.ok) {
        console.warn("[GEO custom question]", {
          event: "classifier_acceptance_blocked",
          projectId: input.value.projectId,
          taskId,
          diagnosticCode:
            grounding.kind === "invalid_evidence"
              ? "CUSTOM_QUESTION_CLASSIFIER_INVALID_EVIDENCE"
              : "CUSTOM_QUESTION_ENTERPRISE_ANCHOR_MISSING",
          reason: grounding.reason,
        });
        if (grounding.kind === "invalid_evidence") {
          throw new GeoHttpError(
            "问题验证结果未通过知识库证据校验，请稍后重试",
            502,
            "CUSTOM_QUESTION_CLASSIFIER_INVALID_RESPONSE",
          );
        }
        throw new GeoHttpError(
          `无法确认该问题与「${input.value.companyName}」的关系，请明确写出企业、品牌或知识库中的具体产品名称`,
          422,
          "CUSTOM_QUESTION_ENTERPRISE_UNRELATED",
        );
      }
    }
    return classification;
  } finally {
    await Promise.allSettled([
      ...(taskId ? [input.broker.deleteTask(taskId)] : []),
      ...skillFileIds.map((fileId) => input.broker.deleteFile(fileId)),
      ...(archiveAttachment.temporary
        ? [input.broker.deleteFile(archiveAttachment.file_id)]
        : []),
    ]);
  }
}

async function waitForCustomQuestionClassification(
  broker: GeoPresalesBroker,
  taskId: string,
  initialTask: BrokerTask,
) {
  const deadline = Date.now() + CUSTOM_QUESTION_CLASSIFIER_TIMEOUT_MS;
  let task = initialTask;
  while (true) {
    const status = normalizeTaskStatus(task.status);
    if (status === "completed") return getResolvedTask(broker, taskId);
    if (status === "failed" || status === "cancelled") {
      throw new GeoHttpError(
        "问题验证暂时未完成，请稍后重试",
        502,
        "CUSTOM_QUESTION_CLASSIFIER_FAILED",
      );
    }
    if (Date.now() >= deadline) {
      throw new GeoHttpError(
        "问题验证超时，请稍后重试",
        504,
        "CUSTOM_QUESTION_CLASSIFIER_TIMEOUT",
      );
    }
    await new Promise((resolve) =>
      setTimeout(resolve, CUSTOM_QUESTION_CLASSIFIER_POLL_MS),
    );
    task = await broker.getTask(taskId);
  }
}

type GeoTaskSkillPackage = {
  filename: string;
  body: Buffer;
};

async function createGeoTaskWithSkillPackages(
  broker: GeoPresalesBroker,
  input: {
    projectId: string;
    prompt: string;
    attachments: Array<{ file_id: string; filename: string }>;
    idempotencyKey: string;
    agentProfile?: FrontMindAgentProfile;
  },
  skillPackages: GeoTaskSkillPackage[],
) {
  const skillAttachments: Array<{ file_id: string; filename: string }> = [];
  try {
    for (const skillPackage of skillPackages) {
      const file = await broker.createFile({
        filename: skillPackage.filename,
        mimeType: "application/zip",
        sizeBytes: skillPackage.body.length,
      });
      skillAttachments.push({
        file_id: file.id,
        filename: file.filename || skillPackage.filename,
      });
      await broker.uploadFile(
        file.id,
        skillPackage.body,
        "application/zip",
        file.proxy_upload_ticket,
      );
    }
    const task = await broker.createTask({
      ...input,
      attachments: [...skillAttachments, ...input.attachments],
    });
    if (!taskIdFrom(task)) {
      throw new GeoHttpError(
        "创建上游任务失败：缺少任务 ID",
        502,
        "TASK_ID_MISSING",
      );
    }
    return { task, skillAttachments };
  } catch (error) {
    await Promise.allSettled(
      skillAttachments.map((attachment) =>
        broker.deleteFile(attachment.file_id),
      ),
    );
    throw error;
  }
}

async function createWebsiteKnowledgeBaseTaskWithSkill(
  broker: GeoPresalesBroker,
  input: {
    projectId: string;
    prompt: string;
    attachments: Array<{ file_id: string; filename: string }>;
    idempotencyKey: string;
  },
) {
  const result = await createGeoTaskWithSkillPackages(
    broker,
    {
      ...input,
      agentProfile: FRONTMIND_PRO_PROFILE,
    },
    [
      {
        filename: WEBSITE_KB_SKILL_ARCHIVE_FILENAME,
        body: await buildWebsiteKnowledgeBaseSkillArchive(),
      },
    ],
  );
  return {
    task: result.task,
    skillAttachment: result.skillAttachments[0],
  };
}

function trackArchiveFile(
  value: ProjectTokenValue,
  task: BrokerTask,
): ProjectTokenValue {
  const fileId = findArchiveDescriptor(task)?.fileId;
  if (!fileId || value.archiveFileIds?.includes(fileId)) return value;
  return {
    ...value,
    archiveFileIds: Array.from(
      new Set([...(value.archiveFileIds || []), fileId]),
    ),
  };
}

function resolveKnowledgeBaseArtifact(
  value: ProjectTokenValue,
  _task: BrokerTask,
): {
  fileId?: string;
  url?: string;
  filename: string;
  sha256?: string;
  packageManifestSha256?: string;
} | null {
  const finalArtifact = value.knowledgeBaseArtifact?.final;
  if (!finalArtifact) return null;
  return {
    fileId: finalArtifact.fileId,
    filename: finalArtifact.filename,
    sha256: finalArtifact.sha256,
    packageManifestSha256: finalArtifact.packageManifestSha256,
  };
}

function validateProjectAttachments(
  input: CreateProjectRequest,
  codec: GeoTokenCodec,
  sessionId: string,
) {
  return input.attachments.map((attachment) => {
    const value = codec.open<UploadTokenValue>(
      attachment.uploadToken,
      "upload",
    ).value;
    if (
      value.fileId !== attachment.fileId ||
      value.sessionId !== sessionId ||
      sanitizeFilename(value.filename, "company-material") !==
        sanitizeFilename(attachment.filename, "company-material")
    ) {
      throw new GeoHttpError(
        "附件令牌与文件不匹配",
        400,
        "UPLOAD_TOKEN_MISMATCH",
      );
    }
    return value;
  });
}

function validateRetryProjectAttachments(
  input: RetryProjectRequest,
  value: ProjectTokenValue,
) {
  const uploadFileIds = new Set(value.uploadFileIds || []);
  return input.attachments.map((attachment) => {
    if (!uploadFileIds.has(attachment.fileId)) {
      throw new GeoHttpError(
        "重试附件不属于当前项目",
        400,
        "RETRY_ATTACHMENT_NOT_OWNED",
      );
    }
    return {
      fileId: attachment.fileId,
      filename: sanitizeFilename(attachment.filename, "company-material"),
    };
  });
}

async function resolveCanonicalCompanyIdentity(
  broker: GeoPresalesBroker,
  value: ProjectTokenValue,
  knowledgeBaseTask: BrokerTask,
  options: { allowInvalidArchiveForProjectView?: boolean } = {},
): Promise<ProjectTokenValue> {
  if (normalizeTaskStatus(knowledgeBaseTask.status) !== "completed")
    return value;
  const archive = resolveKnowledgeBaseArtifact(value, knowledgeBaseTask);
  if (!archive) return value;
  let manifest: KnowledgeBaseManifest;
  try {
    manifest = await loadKnowledgeBaseManifest(
      broker,
      value.knowledgeBaseTaskId,
      knowledgeBaseTask,
      value.companyName,
      archive,
      value.knowledgeBaseValidationProfile,
    );
  } catch (error) {
    if (
      options.allowInvalidArchiveForProjectView &&
      error instanceof KnowledgeBaseArchiveValidationError
    ) {
      return value;
    }
    throw error;
  }
  const candidate = manifest.companyName.trim().slice(0, 200);
  const provisionalIdentity =
    value.companyNameSource === "website" ||
    value.companyNameSource === "attachment" ||
    (!value.companyNameSource && looksLikeHostname(value.companyName));
  if (
    !provisionalIdentity ||
    !candidate ||
    candidate === value.companyName ||
    looksLikeHostname(candidate)
  ) {
    return value;
  }
  return {
    ...value,
    companyName: candidate,
    companyNameSource: "input",
  };
}

function looksLikeHostname(value: string) {
  return /^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,}$/i.test(
    value.trim(),
  );
}

function deriveCompanyIdentity(input: CreateProjectRequest): {
  name: string;
  source: NonNullable<ProjectTokenValue["companyNameSource"]>;
} {
  if (input.companyName)
    return { name: input.companyName.slice(0, 200), source: "explicit" };
  const inputWithoutUrls = input.input
    .replace(/https?:\/\/[^\s<>"']+/gi, " ")
    .replace(
      /(?:企业名称|公司名称|品牌名称|官网|官方网站|网址|website)\s*[:：]?\s*/gi,
      " ",
    )
    .replace(/^[\s,，;；|/·:：-]+|[\s,，;；|/·:：-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (inputWithoutUrls) {
    return { name: inputWithoutUrls.slice(0, 200), source: "input" };
  }
  const url =
    input.companyWebsite || input.input.match(/https?:\/\/[^\s]+/i)?.[0];
  if (url) {
    try {
      return {
        name: new URL(url).hostname.replace(/^www\./, "").slice(0, 200),
        source: "website",
      };
    } catch {
      // Fall through to the input label.
    }
  }
  const attachmentName = input.attachments[0]?.filename.replace(/\.[^.]+$/, "");
  if (attachmentName)
    return { name: attachmentName.slice(0, 200), source: "attachment" };
  return { name: "企业知识库", source: "input" };
}

function taskIdFrom(task: BrokerTask) {
  const value = task.id || task.task_id;
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function sameStringSet(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    Array.from(new Set(left)).sort().join("\u0000") ===
      Array.from(new Set(right)).sort().join("\u0000")
  );
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function hasServiceOrderFacts(value: ProjectTokenValue) {
  return Boolean(
    value.serviceManualOrderReference ||
      value.serviceOrderId ||
      value.serviceProvisioningReference ||
      value.serviceProvisioningStatus ||
      value.serviceKnowledgeImportStatus,
  );
}

function latestServiceOrderValue(
  current: ProjectTokenValue,
  tracked?: ProjectTokenValue,
) {
  if (!tracked) return current;
  const latestTimestamp = (value: ProjectTokenValue) =>
    Math.max(
      ...[
        value.serviceManualOrderUpdatedAt,
        value.serviceProvisioningUpdatedAt,
        value.serviceKnowledgeImportUpdatedAt,
        value.serviceActivatedAt,
        value.serviceProvisionedAt,
        value.servicePaidAt,
      ].map((item) => {
        const timestamp = Date.parse(item || "");
        return Number.isFinite(timestamp) ? timestamp : 0;
      }),
    );
  return latestTimestamp(current) > latestTimestamp(tracked)
    ? current
    : tracked;
}

function isCompletedServiceOrder(value: ProjectTokenValue) {
  const legacyCompleted = Boolean(
    value.serviceOrderId &&
      value.serviceContractId &&
      value.serviceContractSignedAt &&
      value.serviceAccountUserId &&
      value.serviceAccountUsername &&
      value.serviceProvisionedAt,
  );
  const v2Completed = Boolean(
    value.serviceOrderId &&
      value.serviceProvisioningVersion === 2 &&
      value.serviceProvisioningStatus === "provisioned" &&
      value.serviceKnowledgeImportStatus === "ready",
  );
  const manualCompleted = Boolean(
    value.serviceOrderId &&
      value.serviceManualOrderReference &&
      value.serviceManualOrderStatus === "active" &&
      value.serviceKnowledgeImportStatus === "ready",
  );
  return legacyCompleted || v2Completed || manualCompleted;
}

function isTerminalFailedServiceOrder(value: ProjectTokenValue) {
  const knowledgeImportSettled =
    value.serviceKnowledgeImportStatus !== "pending" &&
    value.serviceKnowledgeImportStatus !== "importing";
  const manualFailed =
    (value.serviceManualOrderStatus === "failed" ||
      value.serviceManualOrderStatus === "rejected") &&
    value.serviceManualOrderRetryable === false &&
    knowledgeImportSettled;
  const provisioningFailed =
    value.serviceProvisioningStatus === "failed" &&
    value.serviceProvisioningRetryable === false &&
    knowledgeImportSettled;
  const knowledgeImportFailed =
    value.serviceKnowledgeImportStatus === "failed" &&
    value.serviceKnowledgeImportRetryable === false &&
    (value.serviceProvisioningStatus === "provisioned" ||
      value.serviceProvisioningStatus === "failed" ||
      value.serviceManualOrderStatus === "active" ||
      value.serviceManualOrderStatus === "failed" ||
      value.serviceManualOrderStatus === "rejected");
  return manualFailed || provisioningFailed || knowledgeImportFailed;
}

function deterministicProjectId(
  sessionId: string,
  clientRequestId: string,
  input: CreateProjectRequest,
) {
  const digest = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        sessionId,
        clientRequestId,
        input: input.input,
        companyName: input.companyName,
        companyWebsite: input.companyWebsite,
        operatorNotes: input.operatorNotes,
        attachments: input.attachments.map(({ fileId, filename }) => ({
          fileId,
          filename,
        })),
      }),
    )
    .digest();
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.subarray(0, 16).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function uploadStatus(value: unknown) {
  if (value && typeof value === "object") {
    const status = (value as Record<string, unknown>).status;
    if (typeof status === "string") return status;
  }
  return "uploaded";
}

function sanitizeFilename(value: string, fallback: string) {
  const sanitized = String(value || "")
    .replace(/[\\/\0\r\n"]/g, "_")
    .replace(/^\.+$/, "")
    .trim()
    .slice(0, 180);
  return sanitized || fallback;
}

function contentDisposition(filename: string) {
  const safe = sanitizeFilename(filename, "enterprise-knowledge-base.zip");
  const ascii = safe.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

function inlineContentDisposition(filename: string) {
  const safe = sanitizeFilename(filename, "enterprise-asset");
  const ascii = safe.replace(/[^\x20-\x7E]/g, "_");
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

function paymentCallbackParameters(query: Request["query"]) {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value !== "string") {
      throw new GeoPaymentVerificationError(
        "支付通知参数格式无效",
        "PAYMENT_CALLBACK_INVALID",
        400,
      );
    }
    result[key] = value;
  }
  return result;
}

function paymentReturnPage(status: "paid" | "review_required" | "unverified") {
  const title =
    status === "paid"
      ? "支付结果已确认"
      : status === "review_required"
        ? "付款已安全入账"
        : "支付结果暂未确认";
  const message =
    status === "paid"
      ? "付款已完成，您可以关闭此页面并返回 FrontMind 工作台。"
      : status === "review_required"
        ? "付款已记录，但超过自动履约窗口，需要人工核对。请关闭此页面并返回工作台联系技术支持，勿重复支付。"
        : "暂未查询到付款结果，请返回 FrontMind 工作台查看订单状态。";
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${title} · FrontMind</title>
    <style>
      :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { display:grid; min-height:100vh; place-items:center; margin:0; background:#f7f3f8; color:#352b39; }
      main { width:min(520px,calc(100% - 40px)); border:1px solid #ded5e2; background:white; padding:38px; box-shadow:0 20px 60px rgba(54,34,63,.12); }
      span { color:#6d477d; font-size:13px; font-weight:800; letter-spacing:.12em; }
      h1 { margin:12px 0; font-family:Georgia,serif; font-size:30px; }
      p { margin:0; color:#706775; font-size:15px; line-height:1.75; }
    </style>
  </head>
  <body><main><span>FRONTMIND · 安全支付</span><h1>${title}</h1><p>${message}</p></main></body>
</html>`;
}

function headerValue(req: Request, name: string) {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] || "" : String(value || "");
}

function stringQuery(value: unknown) {
  return typeof value === "string" ? value : "";
}

function hasElapsed(
  startedAt: string | undefined,
  durationMs: number,
  nowMs = Date.now(),
) {
  const startedMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  return (
    Number.isFinite(startedMs) &&
    nowMs >= startedMs &&
    nowMs - startedMs >= durationMs
  );
}

function requestRateLimitKey(req: Request) {
  return String(req.ip || req.socket.remoteAddress || "unknown").slice(0, 160);
}

function isUnsafePlaceholder(value: string) {
  return /^(?:replace[-_ ]?with|change[-_ ]?me|example|placeholder|your[-_ ])/i.test(
    value.trim(),
  );
}

function pruneExpiringMap<T extends { expiresAt?: number; resetAt?: number }>(
  map: Map<string, T>,
  now: number,
  maxEntries: number,
) {
  for (const [key, value] of Array.from(map.entries())) {
    const expiresAt = value.expiresAt ?? value.resetAt ?? 0;
    if (expiresAt <= now) map.delete(key);
  }
  while (map.size > maxEntries) {
    const oldestKey = map.keys().next().value;
    if (!oldestKey) break;
    map.delete(oldestKey);
  }
}

function asyncHandler(
  handler: (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => Promise<void> | void,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

class GeoHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "GeoHttpError";
  }
}

class KnowledgeBaseArchiveValidationError extends GeoHttpError {
  constructor(
    readonly validationReason: string,
    readonly category: KnowledgeBaseValidationCategory = "structure",
  ) {
    super(
      KNOWLEDGE_BASE_VALIDATION_PUBLIC_ERRORS[category],
      422,
      `ARCHIVE_${category.toUpperCase()}_VALIDATION_FAILED`,
    );
    this.name = "KnowledgeBaseArchiveValidationError";
  }
}

function knowledgeBaseValidationReason(error: unknown) {
  const raw =
    error instanceof Error && error.message.trim()
      ? error.message
      : "unknown archive validation error";
  return raw
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(
      /(?:\/(?:Users|private|var|tmp|home)\/[^\s"'`]+)/gi,
      "[internal path]",
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

function normalizeError(error: unknown) {
  if (error instanceof GeoHttpError || error instanceof GeoBrokerError)
    return error;
  if (error instanceof GeoPaymentVerificationError) return error;
  if (error instanceof GeoAccountProvisioningError) return error;
  if (error instanceof GeoMonitorContractError)
    return new GeoHttpError(error.message, 502, "MONITOR_INVALID_RESPONSE");
  if (error instanceof GeoByteLimitError)
    return new GeoHttpError(
      "知识库 ZIP 超出安全大小上限",
      413,
      "ARCHIVE_TOO_LARGE",
    );
  if (error instanceof GeoTokenError)
    return new GeoHttpError(error.message, 401, "INVALID_TOKEN");
  if (error instanceof ZodError) {
    return new GeoHttpError(
      error.issues.map((issue) => issue.message).join("；") || "请求参数不正确",
      400,
      "INVALID_REQUEST",
    );
  }
  if (
    error instanceof Error &&
    error.message.includes("request entity too large")
  ) {
    return new GeoHttpError("文件大小不能超过 50 MB", 413, "UPLOAD_TOO_LARGE");
  }
  console.error("[GEO API]", error);
  return new GeoHttpError("服务暂时不可用，请稍后重试", 500, "INTERNAL_ERROR");
}
