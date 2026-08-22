import crypto from "node:crypto";
import { Readable, Transform } from "node:stream";
import express, {
  type NextFunction,
  type Request,
  type Response,
  type Router,
} from "express";
import { z, ZodError } from "zod";
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
  ASSESSMENT_TASK_INPUT_FILENAME,
  ASSESSMENT_SKILL_ARCHIVE_FILENAME,
  AssessmentTaskOutputValidationError,
  assertAssessmentOutputScope,
  buildAssessmentDisplayOnlyProjection,
  buildGeoCurrentStateEvaluatorSkillArchive,
  buildAssessmentPrompt,
  buildAssessmentTaskInput,
  calculateQuestionBaselineAssessment,
  determineBsasGrade,
  isCompleteAssessment,
  resolveAssessmentTaskOutput as resolveAssessmentTaskOutputRaw,
} from "./assessment";
import {
  buildGeoOptimizationOutcomeForecastTemplate,
  buildGeoOptimizationOutcomeForecasterSkillArchive,
  buildBrandMentionRateForecast,
  buildOptimizationOutcomeForecastPrompt,
  buildOptimizationOutcomeForecastTaskInput,
  calculateOptimizationOutcomeForecast,
  buildForecastDisplayOnlyProjection,
  FORECAST_HORIZON_WEEKS,
  FORECAST_OUTPUT_RESULT_FILENAME,
  FORECAST_OUTPUT_TEMPLATE_FILENAME,
  FORECAST_SKILL_ARCHIVE_FILENAME,
  FORECAST_TASK_INPUT_FILENAME,
  ForecastTaskOutputValidationError,
  isCompleteForecast,
  resolveOptimizationOutcomeForecastTaskOutput as resolveOptimizationOutcomeForecastTaskOutputRaw,
} from "./forecast";
import { buildGeoExecutionLog } from "./execution";
import {
  createGeoPresalesBrokerFromEnv,
  PRESALES_CONTRACTS,
  type BrokerArtifact,
  type BrokerLocalAsset,
  type BrokerMonitorRun,
  geoMonitoringPriceFen,
  GEO_MONITOR_PLATFORM_IDS,
  GeoBrokerError,
  normalizedGeoMonitoringEdition,
  type BrokerTask,
  type PresalesContract,
  type GeoPresalesBroker,
  type GeoMonitorPlatformId,
  type GeoMonitoringEdition,
} from "./broker";
import {
  GeoMonitorContractError,
  monitorBrandMentionRate,
  normalizeMonitorRun,
  toPublicMonitorView,
} from "./monitoring";
import {
  KnowledgeArchiveSelectionError,
  knowledgeArchiveDescriptorHash,
  MAX_KNOWLEDGE_ARCHIVE_CANDIDATE_BYTES,
  MAX_KNOWLEDGE_ARCHIVE_TOTAL_BYTES,
  selectUniqueKnowledgeArchiveDescriptor,
} from "./knowledge-base-artifact";
import {
  inspectAcceptedUploadCoverage,
  KnowledgeBaseCandidateError,
  parseKnowledgeBaseCandidate,
  type CandidateQualityWarningCode,
} from "./knowledge-base-candidate";
import {
  assessKnowledgeBaseCandidate,
  finalizeKnowledgeBaseCandidate,
  WEBSITE_KB_FINALIZER_VERSION,
} from "./knowledge-base-finalizer";
import {
  finalizeKnowledgeBaseCandidate as finalizeKnowledgeBaseCandidateV3,
  WEBSITE_KB_FINALIZER_VERSION as WEBSITE_KB_FINALIZER_V3_VERSION,
} from "./knowledge-base-finalizer-v3";
import {
  createGeoPaymentGatewayFromEnv,
  geoServiceMonthlyPriceFen,
  type GeoPaymentCheckout,
  type GeoPaymentGateway,
  type GeoPaymentMethod,
  type GeoPaymentReceipt,
  GeoPaymentVerificationError,
  type GeoPaymentVerifier,
  type GeoServiceCategory,
} from "./payment";
import {
  findArchiveDescriptor,
  knowledgeBaseTaskFailurePresentation,
  normalizeTask,
  normalizeTaskStatus,
  parseQuestionSetFromTask,
  questionSetQualityFromTask,
} from "./output";
import {
  resolveCustomQuestionClassificationTaskOutput,
  validateAcceptedCustomQuestionGrounding,
} from "./custom-question-classifier";
import {
  geoCustomQuestionHash,
  geoCustomQuestionOperationKey,
  geoCustomQuestionOwnerSessionHash,
  geoCustomQuestionRequestHash,
  legacyGeoCustomQuestionClientRequestId,
  GeoCustomQuestionValidationStoreError,
  type GeoCustomQuestionValidationLease,
  type GeoCustomQuestionValidationRecord,
  type GeoCustomQuestionValidationStore,
} from "./custom-question-validation-store";
import {
  createGeoMonitorFreeReservationStore,
  GeoMonitorFreeReservationStoreError,
  type GeoMonitorFreeReservationRecord,
  type GeoMonitorFreeReservationStore,
} from "./monitor-free-reservation-store";
import {
  buildGeoMonitorQuestionTranslationPrompt,
  geoMonitorQuestionTranslationOperationKey,
  resolveGeoMonitorQuestionTranslationTaskOutput,
} from "./monitor-question-translation";
import {
  buildGeoCustomQuestionClassifierTaskInput,
  buildGeoCustomQuestionClassifierPrompt,
  buildGeoQuestionPrompt,
  buildGeoQuestionTaskInput,
  buildWebsiteKnowledgeBasePrompt,
  buildWebsiteKnowledgeBaseTaskInput,
  CUSTOM_QUESTION_TASK_INPUT_FILENAME,
  QUESTION_TASK_INPUT_FILENAME,
  WEBSITE_KB_TASK_INPUT_FILENAME,
} from "./prompts";
import {
  buildGeoCustomQuestionClassifierSkillArchive,
  buildGeoQuestionRecommenderSkillArchive,
  buildWebsiteKnowledgeBaseSkillArchive,
  CUSTOM_QUESTION_CLASSIFIER_SKILL_ARCHIVE_FILENAME,
  QUESTION_SKILL_ARCHIVE_FILENAME,
  WEBSITE_KB_SKILL_ARCHIVE_FILENAME,
  resolveWebsiteKnowledgeBaseWriterVersion,
  WEBSITE_KB_LEGACY_SKILL_VERSION,
  WEBSITE_KB_SKILL_VERSION,
  type WebsiteKnowledgeBaseWriterVersion,
} from "./skills";
import {
  createGeoAccountProvisioner,
  createGeoKnowledgeImporter,
  createGeoManualServiceOrderAccountSubmitter,
  createGeoManualServiceOrderCreator,
  createGeoManualServiceOrderExternalAuthorizer,
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
  type GeoManualServiceOrderExternalAuthorizer,
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
  ConfirmServiceBankTransferRequestSchema,
  CreateCustomQuestionRequestSchema,
  CreatePaymentRequestSchema,
  CreateProjectRequestSchema,
  CreateServicePaymentRequestSchema,
  GeoQuestionSchema,
  InviteRequestSchema,
  isIndustryRankingQuestion,
  PaymentStatusRequestSchema,
  ServicePaymentAuthorizationSchema,
  ServiceStatusRequestSchema,
  StartMonitoringRequestSchema,
  SwitchPaymentRequestSchema,
  SwitchServicePaymentRequestSchema,
  UploadInitRequestSchema,
  type CreateProjectRequest,
  type GeoQuestion,
} from "./schemas";
import {
  GeoTokenCodec,
  GeoTokenError,
  parseCookies,
  safeSecretEqual,
} from "./tokens";
import { resolveGeoRuntimeConfiguration } from "./runtime-config";
import {
  assertResponseLengthWithinLimit,
  createByteLimitTransform,
  GeoByteLimitError,
  readResponseBufferLimited,
} from "./streams";
import { normalizeBusinessOwnerName } from "../../shared/business-owner-name";

const SESSION_COOKIE = "frontmind_geo_session";
export const GEO_LEGACY_CUSTOM_QUESTION_COMPATIBILITY_WAIT_MS = 15_000;
const GEO_LEGACY_CUSTOM_QUESTION_COMPATIBILITY_POLL_MS = 500;
const SESSION_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const INVITE_CONTEXT_TTL_MS = 24 * 60 * 60 * 1000;
const PROJECT_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const PAYMENT_INTENT_TTL_MS = 24 * 60 * 60 * 1000;
const UPLOAD_TTL_MS = 60 * 60 * 1000;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const UPLOAD_PREFLIGHT_TIMEOUT_MS = 30_000;
const UPLOAD_DATA_IDLE_MS = 120_000;
const UPLOAD_CONFIRMATION_MS = 6 * 60 * 1000;
const MAX_ARCHIVE_COPY_BYTES = 150 * 1024 * 1024;
const MAX_VALIDATED_ARCHIVE_BYTES = MAX_KNOWLEDGE_ARCHIVE_CANDIDATE_BYTES;
const MAX_MONITOR_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const MONITOR_SCREENSHOT_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const MAX_ASSESSMENT_INPUT_BYTES = 12 * 1024 * 1024;
const MAX_FORECAST_INPUT_BYTES = 12 * 1024 * 1024;
const MAX_OPTIMIZATION_FORECAST_ATTEMPTS = 5;
// Keep two tabs below the shared 120/minute session status limit.
const CUSTOM_QUESTION_CLASSIFIER_CLIENT_POLL_MS = 1_500;
const CUSTOM_QUESTION_CLASSIFIER_UNKNOWN_MAX_OBSERVATIONS = 3;
const CUSTOM_QUESTION_CLASSIFIER_TRANSIENT_MAX_OBSERVATIONS = 3;
const CUSTOM_QUESTION_CLASSIFIER_TRANSIENT_MAX_MS = 30_000;
const CUSTOM_QUESTION_CLASSIFIER_ATTACHMENT_REBUILD_MAX = 2;
const CUSTOM_QUESTION_CLASSIFIER_LEASE_MS = 30_000;
const CUSTOM_QUESTION_CLASSIFIER_LEASE_RENEW_MS = 10_000;
const CUSTOM_QUESTION_VALIDATION_TTL_MS = 24 * 60 * 60 * 1000;
const CUSTOM_QUESTION_TERMINAL_RETENTION_MS = 24 * 60 * 60 * 1000;
const SESSION_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const FREE_MONITOR_RECOVERY_RATE_LIMIT = 30;
const FREE_MONITOR_RECOVERY_RATE_WINDOW_MS = 60 * 1000;
// A reservation only bridges the client's bounded recovery loop. Keeping the
// process-local flight short prevents a deterministic bad request from
// blocking a corrected scope for the lifetime of the project capability.
const FREE_MONITOR_START_FLIGHT_TTL_MS = 10 * 60 * 1000;
const MONITOR_QUESTION_TRANSLATION_WAIT_MS = 25_000;
const MONITOR_QUESTION_TRANSLATION_POLL_MS = 1_000;
const PAID_MONITOR_START_RATE_LIMIT = 30;
const PAID_MONITOR_START_RATE_WINDOW_MS = 60 * 1000;
const GEO_MANUAL_CONTRACT_TEMPLATE_VERSION = {
  domestic: "basic-domestic-2026.08-v1",
  overseas: "basic-overseas-2026.08-v1",
} as const;
const KNOWLEDGE_BASE_VALIDATION_PUBLIC_ERRORS: Record<
  KnowledgeBaseValidationCategory,
  string
> = {
  structure: "企业知识库生成结果未通过结构校验，请联系技术支持。",
  media: "Logo 素材未通过校验，系统会忽略该素材并继续整理文字知识库。",
  content: "企业知识库生成结果未通过内容校验，请联系技术支持。",
  unsafe:
    "知识库文件存在安全风险，已阻止下载及后续分析。请勿继续处理该文件，并联系技术支持。",
};
const KNOWLEDGE_BASE_FINALIZATION_PUBLIC_ERROR =
  "企业知识库最终整理未通过校验，请联系技术支持。";

function calculateCompleteAssessment(value: unknown) {
  if (!isCompleteAssessment(value)) {
    throw new AssessmentTaskOutputValidationError("SCHEMA_MISMATCH");
  }
  return calculateQuestionBaselineAssessment(value);
}

function calculateCompleteForecast(
  assessment: ReturnType<typeof calculateQuestionBaselineAssessment>,
  value: unknown,
) {
  if (!isCompleteForecast(value)) {
    throw new ForecastTaskOutputValidationError("SCHEMA_MISMATCH");
  }
  return calculateOptimizationOutcomeForecast(assessment, value);
}

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
  traceId: string;
  attachmentIndex?: number;
  contentType?: string;
  upstreamUploadTicket?: string;
};

type SessionTokenValue = {
  scope: "geo";
  nonce: string;
};

type InviteContextTokenValue = {
  schemaVersion: 1;
  sessionNonce: string;
  businessOwnerName: string;
  contextId: string;
};

type ProjectTokenValue = {
  projectContractVersion: 2;
  projectId: string;
  ownerSessionId: string;
  businessOwnerName?: string;
  companyName: string;
  companyNameSource?: "explicit" | "input" | "website" | "attachment";
  knowledgeBaseTaskId: string;
  knowledgeBaseSubmittedAt?: string;
  knowledgeBaseValidationProfile?: "website-lead-v1";
  knowledgeBaseSkillVersion?: number;
  knowledgeBaseSkillSha256?: string;
  knowledgeBaseCandidateFailure?: {
    category: "unsafe" | "structure" | "content";
    message: string;
  };
  knowledgeBaseFinalization?: {
    state: "pending" | "failed_internal" | "completed";
    finalizerVersion: string;
    candidateSha256?: string;
    errorCode?: "KB_FINALIZER_CONTRACT_VIOLATION";
    skillVersion?: number;
    skillSha256?: string;
    updatedAt: string;
  };
  knowledgeBaseArtifact?: {
    finalizerVersion:
      | "website-kb-finalizer-v2"
      | "website-kb-finalizer-v3"
      | "website-kb-finalizer-v4"
      | "website-kb-finalizer-v5"
      | typeof WEBSITE_KB_FINALIZER_VERSION;
    candidate: {
      taskId: string;
      outputItemId: string;
      artifactId: string;
      descriptorHash: string;
      sha256: string;
      quality?: {
        state: "complete" | "partial";
        requiresSupplement: boolean;
        warningCodes: CandidateQualityWarningCode[];
      };
    };
    final: {
      artifactId: string;
      filename: string;
      sha256: string;
      packageManifestSha256: string;
      archiveContractVersion: 3 | 4;
      validationProfile: "website-lead-v1";
      finalizedAt: string;
    };
  };
  uploadFileIds?: string[];
  uploadFilenames?: string[];
  archiveFileIds?: string[];
  temporaryFileIds?: string[];
  questionTaskId?: string;
  questionSubmittedAt?: string;
  previousKnowledgeBaseTaskIds?: string[];
  previousQuestionTaskIds?: string[];
  customQuestion?: GeoQuestion;
  monitorRunId?: string;
  industryRankingMonitorRunId?: string;
  monitoringEdition?: GeoMonitoringEdition;
  monitorRegion?: {
    edition: GeoMonitoringEdition;
    code: string;
    label: string;
  };
  monitorScreenshotEnabled?: boolean;
  monitorQuestionId?: string;
  industryRankingQuestionId?: string;
  monitorPlatformIds?: GeoMonitorPlatformId[];
  monitorOrderId?: string;
  monitorAmountFen?: number;
  monitorAuthorizationDigest?: string;
  monitorCheckoutExpiresAt?: string;
  monitorPaidAt?: string;
  monitorFreeReservation?: {
    schemaVersion: 2;
    clientRequestId: string;
    scopeHash: string;
    createdAt: string;
    monitoringEdition?: GeoMonitoringEdition;
    regionCode?: string;
    screenshotEnabled?: boolean;
  };
  industryRankingMonitorFreeReservation?: {
    schemaVersion: 2;
    clientRequestId: string;
    scopeHash: string;
    createdAt: string;
    monitoringEdition?: GeoMonitoringEdition;
    regionCode?: string;
    screenshotEnabled?: boolean;
  };
  assessmentTaskId?: string;
  assessmentSubmittedAt?: string;
  assessmentAttempt?: number;
  assessmentVersion?: 2;
  assessmentUpgradeFromV1?: boolean;
  previousAssessmentTaskIds?: string[];
  optimizationForecastTaskId?: string;
  optimizationForecastSubmittedAt?: string;
  optimizationForecastAttempt?: number;
  optimizationForecastVersion?: 2;
  previousOptimizationForecastTaskIds?: string[];
  industryRankingAssessmentTaskId?: string;
  industryRankingAssessmentSubmittedAt?: string;
  industryRankingAssessmentAttempt?: number;
  industryRankingAssessmentVersion?: 2;
  previousIndustryRankingAssessmentTaskIds?: string[];
  industryRankingOptimizationForecastTaskId?: string;
  industryRankingOptimizationForecastSubmittedAt?: string;
  industryRankingOptimizationForecastAttempt?: number;
  industryRankingOptimizationForecastVersion?: 2;
  previousIndustryRankingOptimizationForecastTaskIds?: string[];
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
  serviceContractAuthorizationMode?: "external_wechat";
  serviceContractAuthorizedAt?: string;
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
  manualOrderExternalAuthorizer?: GeoManualServiceOrderExternalAuthorizer;
  manualOrderStatusReader?: GeoManualServiceOrderStatusReader;
  manualOrderPaymentConfirmer?: GeoManualServiceOrderPaymentConfirmer;
  manualOrderAccountSubmitter?: GeoManualServiceOrderAccountSubmitter;
  adminNotifier?: GeoAdminNotifier;
  knowledgeImporter?: GeoKnowledgeImporter;
  projectOrderRegistry?: GeoProjectOrderRegistry;
  /** Retained only so older embedders can upgrade without a constructor break. */
  customQuestionValidationStore?: GeoCustomQuestionValidationStore;
  monitorFreeReservationStore?: GeoMonitorFreeReservationStore;
  knowledgeBaseFinalizer?: typeof finalizeKnowledgeBaseCandidate;
  legacyCustomQuestionCompatibilityWaitMs?: number;
  legacyCustomQuestionCompatibilityPollMs?: number;
  monitorQuestionTranslationWaitMs?: number;
  monitorQuestionTranslationPollMs?: number;
  customQuestionValidationNow?: () => number;
  uploadDataIdleMs?: number;
  uploadConfirmationMs?: number;
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

type MonitoringPaymentSwitchFlight = {
  authorizationDigest: string;
  method: GeoPaymentMethod;
  expiresAt: number;
  promise: Promise<GeoPaymentCheckout>;
};

type FreeMonitoringStart = {
  clientRequestId: string;
  scopeHash: string;
  idempotencyKey: string;
  expiresAt: number;
  promise?: Promise<BrokerMonitorRun>;
  run?: BrokerMonitorRun;
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
    artifactId: string;
    companyName: string;
    generatedAt: string;
    expectedBytes: Buffer;
    expectedSha256: string;
    expectedPackageManifestSha256: string;
  },
) {
  let bytes: Buffer;
  try {
    const response = await broker.downloadArtifact(input.artifactId);
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
  const {
    inviteCode,
    contractAuthCode,
    bankTransferConfirmationCode,
    sessionSecret,
    configurationError,
  } = resolveGeoRuntimeConfiguration(env);
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
  const manualOrderExternalAuthorizer =
    options.manualOrderExternalAuthorizer ??
    createGeoManualServiceOrderExternalAuthorizer({ env });
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
  const monitorFreeReservationStore =
    options.monitorFreeReservationStore ??
    createGeoMonitorFreeReservationStore({ env });
  const knowledgeBaseFinalizerV4 =
    options.knowledgeBaseFinalizer ?? finalizeKnowledgeBaseCandidate;
  const websiteKnowledgeBaseWriterVersion =
    resolveWebsiteKnowledgeBaseWriterVersion(env);
  const legacyCustomQuestionCompatibilityWaitMs =
    options.legacyCustomQuestionCompatibilityWaitMs ??
    GEO_LEGACY_CUSTOM_QUESTION_COMPATIBILITY_WAIT_MS;
  const legacyCustomQuestionCompatibilityPollMs =
    options.legacyCustomQuestionCompatibilityPollMs ??
    GEO_LEGACY_CUSTOM_QUESTION_COMPATIBILITY_POLL_MS;
  const monitorQuestionTranslationWaitMs =
    options.monitorQuestionTranslationWaitMs ??
    MONITOR_QUESTION_TRANSLATION_WAIT_MS;
  const monitorQuestionTranslationPollMs =
    options.monitorQuestionTranslationPollMs ??
    MONITOR_QUESTION_TRANSLATION_POLL_MS;
  const customQuestionValidationNow =
    options.customQuestionValidationNow ?? Date.now;
  const uploadDataIdleMs = options.uploadDataIdleMs ?? UPLOAD_DATA_IDLE_MS;
  const uploadConfirmationMs =
    options.uploadConfirmationMs ?? UPLOAD_CONFIRMATION_MS;
  if (
    !Number.isInteger(legacyCustomQuestionCompatibilityWaitMs) ||
    legacyCustomQuestionCompatibilityWaitMs <= 0 ||
    !Number.isInteger(legacyCustomQuestionCompatibilityPollMs) ||
    legacyCustomQuestionCompatibilityPollMs <= 0 ||
    !Number.isInteger(monitorQuestionTranslationWaitMs) ||
    monitorQuestionTranslationWaitMs <= 0 ||
    !Number.isInteger(monitorQuestionTranslationPollMs) ||
    monitorQuestionTranslationPollMs <= 0 ||
    monitorQuestionTranslationPollMs > monitorQuestionTranslationWaitMs ||
    !Number.isInteger(uploadDataIdleMs) ||
    uploadDataIdleMs <= 0 ||
    !Number.isInteger(uploadConfirmationMs) ||
    uploadConfirmationMs <= 0
  ) {
    throw new Error("GEO asynchronous compatibility timing is invalid");
  }
  const failedInvites = new Map<string, FailedInviteWindow>();
  const failedContractCodes = new Map<string, FailedInviteWindow>();
  const failedBankTransferCodes = new Map<string, FailedInviteWindow>();
  const sessionRates = new Map<string, RateWindow>();
  const identityRates = new Map<string, RateWindow>();
  const serviceOrderLocks = new Map<string, ServiceOrderLock>();
  const monitoringOrderLocks = new Map<string, ServiceOrderLock>();
  // The production release contract currently permits one Website Node
  // runtime. Replace this process-local flight with a registry-backed CAS
  // before scaling the payment-switch endpoint across multiple replicas.
  const monitoringPaymentSwitches = new Map<
    string,
    MonitoringPaymentSwitchFlight
  >();
  // Dashboard Dev currently runs one Website Node process.  This flight is a
  // local contention guard; the broker idempotency key remains the durable
  // duplicate-submission boundary across process restarts.
  const freeMonitoringStarts = new Map<string, FreeMonitoringStart>();
  const servicePaymentSwitches = new Map<
    string,
    MonitoringPaymentSwitchFlight
  >();
  type ServicePaymentResult = {
    projectToken: string;
    project: Awaited<ReturnType<typeof buildProjectView>>;
  };
  const serviceBankConfirmations = new Map<
    string,
    {
      authorizationDigest: string;
      purchaseIntentDigest: string;
      expiresAt: number;
      promise: Promise<ServicePaymentResult>;
    }
  >();
  const servicePaymentMutations = new Map<
    string,
    { kind: "online" | "bank"; expiresAt: number }
  >();
  // Payment checkout does not currently rotate the project capability token.
  // This registry prevents stale-token deletion within one router lifetime;
  // durable cross-restart enforcement still requires the payment ledger to
  // expose an ownerSessionId + projectId order lookup.
  const projectOrderProtections = new Map<string, ProjectOrderProtection>();
  const activeUploadsBySession = new Map<string, number>();
  const activeUploadsByAsset = new Map<
    string,
    {
      traceId: string;
      declaredBytes: number;
      receivedBytes: number;
      startedAt: number;
    }
  >();
  const chargedUploadOperations = new Map<string, { expiresAt: number }>();
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
  const router = express.Router();

  const withServicePaymentMutation = async <T>(
    key: string,
    kind: "online" | "bank",
    operation: () => Promise<T>,
  ) => {
    const now = Date.now();
    pruneExpiringMap(servicePaymentMutations, now, 2000);
    const active = servicePaymentMutations.get(key);
    if (active) {
      throw new GeoHttpError(
        active.kind === "bank"
          ? "对公付款确认正在处理，不能同时更换在线支付方式"
          : "在线收银台正在创建或切换，请完成后再确认对公付款",
        409,
        "SERVICE_PAYMENT_MUTATION_IN_PROGRESS",
      );
    }
    const mutation = { kind, expiresAt: now + PROJECT_TTL_MS } as const;
    servicePaymentMutations.set(key, mutation);
    try {
      return await operation();
    } finally {
      if (servicePaymentMutations.get(key) === mutation) {
        servicePaymentMutations.delete(key);
      }
    }
  };

  const ensureFinalizedKnowledgeBase = async (
    value: ProjectTokenValue,
    task: BrokerTask,
  ): Promise<{
    value: ProjectTokenValue;
    manifest?: KnowledgeBaseManifest;
  }> => {
    if (normalizeTaskStatus(task.status) !== "completed") {
      return { value };
    }
    const selectedSkillVersion =
      value.knowledgeBaseSkillVersion ?? WEBSITE_KB_LEGACY_SKILL_VERSION;
    const selectedFinalizerVersion =
      selectedSkillVersion === WEBSITE_KB_SKILL_VERSION
        ? WEBSITE_KB_FINALIZER_VERSION
        : WEBSITE_KB_FINALIZER_V3_VERSION;
    const selectedFinalizer =
      selectedSkillVersion === WEBSITE_KB_SKILL_VERSION
        ? knowledgeBaseFinalizerV4
        : finalizeKnowledgeBaseCandidateV3;
    const existingArtifact = value.knowledgeBaseArtifact;
    if (
      existingArtifact?.candidate.taskId === value.knowledgeBaseTaskId &&
      [
        "website-kb-finalizer-v2",
        "website-kb-finalizer-v3",
        "website-kb-finalizer-v4",
        "website-kb-finalizer-v5",
        WEBSITE_KB_FINALIZER_VERSION,
      ].includes(existingArtifact.finalizerVersion)
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
                skillVersion: value.knowledgeBaseSkillVersion,
                skillSha256: value.knowledgeBaseSkillSha256,
                updatedAt: existingArtifact.final.finalizedAt,
              },
            },
        manifest,
      };
    }

    let selectedDescriptor;
    try {
      selectedDescriptor = selectUniqueKnowledgeArchiveDescriptor(
        task.result?.artifacts,
      );
    } catch (error) {
      if (!(error instanceof KnowledgeArchiveSelectionError)) throw error;
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
    const candidateDescriptors = selectedDescriptor ? [selectedDescriptor] : [];
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
        selectedFinalizerVersion &&
      value.knowledgeBaseFinalization.candidateSha256
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
        if (descriptor.bytes > MAX_KNOWLEDGE_ARCHIVE_CANDIDATE_BYTES) {
          throw new GeoByteLimitError(MAX_KNOWLEDGE_ARCHIVE_CANDIDATE_BYTES);
        }
        const response = await broker.downloadArtifact(descriptor.artifactId);
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
        if (
          bytes.byteLength !== descriptor.bytes ||
          crypto.createHash("sha256").update(bytes).digest("hex") !==
            descriptor.sha256
        ) {
          throw new KnowledgeBaseCandidateError(
            "候选 ZIP 的实际字节或 SHA 与输出描述不一致",
            "unsafe",
          );
        }
        downloadedCandidateBytes += bytes.byteLength;
        if (downloadedCandidateBytes > MAX_KNOWLEDGE_ARCHIVE_TOTAL_BYTES) {
          throw new GeoByteLimitError(MAX_KNOWLEDGE_ARCHIVE_TOTAL_BYTES);
        }
      } catch (error) {
        if (
          !(error instanceof GeoByteLimitError) &&
          !(error instanceof KnowledgeBaseCandidateError)
        ) {
          throw error;
        }
        const failure = {
          category: "unsafe" as const,
          message:
            error instanceof KnowledgeBaseCandidateError
              ? error.message
              : "候选 ZIP 超出允许大小",
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

      const parseStartedAt = Date.now();
      try {
        candidate = await parseKnowledgeBaseCandidate(bytes);
        inspectAcceptedUploadCoverage(
          candidate,
          value.uploadFilenames || [],
          (value.uploadFileIds || []).length,
        );
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
      recordedFinalization.finalizerVersion === selectedFinalizerVersion &&
      recordedFinalization.candidateSha256 === candidateSha
    ) {
      return { value };
    }
    const candidateDownloadMs = Date.now() - candidateDownloadStartedAt;
    const descriptorHash = knowledgeArchiveDescriptorHash(candidateDescriptor);
    const selectedCandidate = candidate;
    const selectedCandidateDescriptor = candidateDescriptor;
    const finalizationKey = [
      value.projectId,
      value.knowledgeBaseTaskId,
      candidateSha,
      selectedFinalizerVersion,
    ].join(":");
    const now = Date.now();
    pruneExpiringMap(knowledgeBaseFinalizations, now, 200);
    const transientBackoff =
      knowledgeBaseFinalizationBackoffs.get(finalizationKey);
    if (transientBackoff && transientBackoff.retryAt > now) {
      throw new GeoHttpError(
        "知识库最终整理文件传输暂时不可用，请稍后重试",
        503,
        "KB_FINALIZATION_TRANSIENT_BACKOFF",
      );
    }
    const running = knowledgeBaseFinalizations.get(finalizationKey);
    if (running && running.expiresAt > now) {
      return running.promise;
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
        finalizerVersion: selectedFinalizerVersion,
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
        normalizedIsoTimestamp(
          task.safeEvents.at(-1)?.createdAt ??
            task.safeEvents.at(-1)?.timestamp,
        ) ||
        value.knowledgeBaseSubmittedAt ||
        new Date(0).toISOString();
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
        finalized = await selectedFinalizer({
          candidate: selectedCandidate,
          companyName: finalCompanyName,
          evaluatedAt,
        });
      } catch (error) {
        console.error("[GEO API] KB_FINALIZER_CONTRACT_VIOLATION", {
          finalizerVersion: selectedFinalizerVersion,
          candidateSha,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          value: {
            ...value,
            knowledgeBaseCandidateFailure: undefined,
            knowledgeBaseFinalization: {
              state: "failed_internal" as const,
              finalizerVersion: selectedFinalizerVersion,
              candidateSha256: candidateSha,
              errorCode: "KB_FINALIZER_CONTRACT_VIOLATION" as const,
              skillVersion: value.knowledgeBaseSkillVersion,
              skillSha256: value.knowledgeBaseSkillSha256,
              updatedAt: new Date().toISOString(),
            },
          },
        };
      }

      const filename = `${sanitizeFilename(
        finalCompanyName,
        "company",
      )}_website_lead_knowledge_base.zip`;
      const finalAsset = await broker.createAsset({
        projectId: value.projectId,
        idempotencyKey: `geo:${value.projectId}:knowledge-base-final:${candidateSha}:${selectedFinalizerVersion}`,
        filename,
        mimeType: "application/zip",
        sizeBytes: finalized.bytes.length,
      });
      let verifiedManifest: KnowledgeBaseManifest;
      let promotedArtifact: BrokerArtifact;
      try {
        const uploadStartedAt = Date.now();
        await broker.uploadAsset(
          finalAsset.localAssetId,
          finalized.bytes,
          "application/zip",
          finalAsset.uploadTicket,
        );
        const uploadMs = Date.now() - uploadStartedAt;
        promotedArtifact = await broker.promoteArtifact({
          projectId: value.projectId,
          idempotencyKey: `geo:${value.projectId}:knowledge-base-final-artifact:${finalized.sha256}:${selectedFinalizerVersion}`,
          sourceLocalAssetId: finalAsset.localAssetId,
          filename,
          mimeType: "application/zip",
          bytes: finalized.bytes.length,
          sha256: finalized.sha256,
          kind: "website-final-knowledge-base",
        });
        const readbackStartedAt = Date.now();
        verifiedManifest = await verifyUploadedKnowledgeBaseArchive(broker, {
          artifactId: promotedArtifact.artifactId,
          companyName: finalCompanyName,
          generatedAt: evaluatedAt,
          expectedBytes: finalized.bytes,
          expectedSha256: finalized.sha256,
          expectedPackageManifestSha256: finalized.packageManifestSha256,
        });
        const finalizedAt = new Date().toISOString();
        const submittedAtMs = Date.parse(value.knowledgeBaseSubmittedAt || "");
        const finalizedAtMs = Date.parse(finalizedAt);
        const totalDurationMs = Number.isFinite(submittedAtMs)
          ? finalizedAtMs - submittedAtMs
          : undefined;
        const publicPageCount = new Set(
          selectedCandidate.sources
            .filter(
              (source) =>
                !["official_document", "user_upload"].includes(source.kind),
            )
            .map((source) => source.normalizedUrl || source.url)
            .filter((url): url is string => Boolean(url)),
        ).size;
        const officialDocumentCount = selectedCandidate.sources.filter(
          (source) => source.kind === "official_document",
        ).length;
        const uploadCount = new Set(
          selectedCandidate.sources
            .filter((source) => source.kind === "user_upload")
            .map((source) => source.attachmentName)
            .filter((name): name is string => Boolean(name)),
        ).size;
        const productFamilyCount =
          verifiedManifest.sections.find(
            (section) => section.id === "products-services",
          )?.leaves?.length || 0;
        if (totalDurationMs !== undefined && totalDurationMs > 30 * 60_000) {
          console.warn("[GEO KB]", {
            event: "website_knowledge_base_long_run",
            projectId: value.projectId,
            taskId: value.knowledgeBaseTaskId,
            submittedAt: value.knowledgeBaseSubmittedAt,
            finalizedAt,
            totalDurationMs,
            thresholdMs: 30 * 60_000,
            cancelled: false,
          });
        }
        console.info("[GEO KB]", {
          event: "knowledge_base_finalized",
          projectId: value.projectId,
          taskId: value.knowledgeBaseTaskId,
          candidateSha,
          finalizerVersion: selectedFinalizerVersion,
          finalSha: finalized.sha256,
          packageManifestSha: finalized.packageManifestSha256,
          skillVersion: selectedSkillVersion,
          skillSha256: value.knowledgeBaseSkillSha256,
          archiveContractVersion: verifiedManifest.archiveContractVersion,
          submittedAt: value.knowledgeBaseSubmittedAt,
          upstreamCompletedAt: evaluatedAt,
          finalizedAt,
          totalDurationMs,
          tier: finalized.assessment.tier,
          leafCount: finalized.metrics.leafCount,
          publicPageCount,
          queryCount: selectedCandidate.run?.queries.length || 0,
          officialDocumentCount,
          uploadCount,
          sourceCount: selectedCandidate.sources.length,
          productFamilyCount,
          stopReason:
            selectedCandidate.run?.schemaVersion === 2
              ? selectedCandidate.run.stopReason
              : "legacy_candidate",
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
          finalFileId: finalAsset.localAssetId,
          diagnosticCode:
            error instanceof GeoHttpError
              ? error.code
              : "FINAL_ARCHIVE_UPLOAD_OR_READBACK_FAILED",
        });
        await broker
          .deleteAsset(finalAsset.localAssetId)
          .catch(() => undefined);
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
          finalizerVersion: selectedFinalizerVersion,
          candidateSha256: candidateSha,
          skillVersion: value.knowledgeBaseSkillVersion,
          skillSha256: value.knowledgeBaseSkillSha256,
          updatedAt: new Date().toISOString(),
        },
        archiveFileIds: Array.from(
          new Set([...(value.archiveFileIds || []), finalAsset.localAssetId]),
        ),
        knowledgeBaseArtifact: {
          finalizerVersion: selectedFinalizerVersion,
          candidate: {
            taskId: value.knowledgeBaseTaskId,
            outputItemId: selectedCandidateDescriptor.outputItemId,
            artifactId: selectedCandidateDescriptor.artifactId,
            descriptorHash,
            sha256: candidateSha,
            quality: {
              state: assessment.state,
              requiresSupplement: assessment.requiresSupplement,
              warningCodes: assessment.warningCodes,
            },
          },
          final: {
            artifactId: promotedArtifact.artifactId,
            filename: promotedArtifact.filename || filename,
            sha256: finalized.sha256,
            packageManifestSha256: finalized.packageManifestSha256,
            archiveContractVersion:
              verifiedManifest.archiveContractVersion === 4 ? 4 : 3,
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

  const ensureDirectBankTransferOrder = async (input: {
    value: ProjectTokenValue;
    orderId: string;
    questionId: string;
    category: GeoServiceCategory;
    monitoringEdition: GeoMonitoringEdition;
    amountFen: number;
  }) => {
    const eventAt = normalizedIsoTimestamp(
      input.value.serviceContractAuthorizedAt,
      input.value.serviceManualSignedAt,
      input.value.serviceContractSignedAt,
      input.value.serviceProfileSubmittedAt,
      input.value.serviceManualOrderUpdatedAt,
    );
    if (!eventAt) {
      throw new GeoHttpError(
        "合同确认记录缺少有效时间，不能创建对公付款订单",
        409,
        "SERVICE_CONTRACT_EVIDENCE_REQUIRED",
      );
    }
    const expectedOrder: GeoProjectOrder = {
      orderId: input.orderId,
      projectId: input.value.projectId,
      purchaseType: "service",
      amountFen: input.amountFen,
      authorizationDigest: serviceBankTransferAuthorizationDigest({
        projectId: input.value.projectId,
        manualOrderReference: input.value.serviceManualOrderReference!,
        orderId: input.orderId,
        questionId: input.questionId,
        category: input.category,
        monitoringEdition: input.monitoringEdition,
        amountFen: input.amountFen,
      }),
      state: "pending",
      checkoutExpiresAt: new Date(
        Date.parse(eventAt) + PROJECT_TTL_MS,
      ).toISOString(),
      eventAt,
    };
    const projectOrders = await readProjectOrders(input.value.projectId);
    const existing = projectOrders.orders.find(
      (order) => order.orderId === input.orderId,
    );
    const conflictingOrder = projectOrders.orders.find(
      (order) =>
        order.purchaseType === "service" &&
        order.orderId !== input.orderId &&
        order.state !== "closed" &&
        order.state !== "terminal_failed",
    );
    if (conflictingOrder) {
      throw new GeoHttpError(
        "已有在线合同订单，请从该订单选择改为对公付款",
        409,
        "SERVICE_BANK_TRANSFER_AUTHORIZATION_REQUIRED",
      );
    }
    if (existing) {
      if (
        existing.projectId !== expectedOrder.projectId ||
        existing.purchaseType !== "service" ||
        existing.amountFen !== expectedOrder.amountFen ||
        (existing.state === "pending" &&
          (!safeSecretEqual(
            existing.authorizationDigest,
            expectedOrder.authorizationDigest,
          ) ||
            existing.checkoutExpiresAt !== expectedOrder.checkoutExpiresAt ||
            existing.eventAt !== expectedOrder.eventAt))
      ) {
        throw new GeoHttpError(
          "对公付款订单与当前服务范围不匹配",
          409,
          "PAYMENT_SCOPE_MISMATCH",
        );
      }
      if (
        existing.state === "review_required" ||
        existing.state === "terminal_failed" ||
        existing.state === "closed"
      ) {
        throw new GeoHttpError(
          "该对公付款订单正在复核或已关闭，不能继续确认",
          409,
          existing.state === "review_required"
            ? "PAYMENT_REVIEW_REQUIRED"
            : "PAYMENT_ALREADY_CONFIRMED",
        );
      }
      return existing;
    }
    return writeProjectOrder(expectedOrder);
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
    facts: { paidAt?: string; allowReviewRecovery?: boolean } = {},
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
      state !== "terminal_failed" &&
      !(state === "fulfilling" && facts.allowReviewRecovery === true)
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
    if (current.state === state && (current.paidAt || !facts.paidAt)) {
      return current;
    }
    const nextPaidAt = facts.paidAt || current.paidAt;
    const eventAt = new Date().toISOString();
    return writeProjectOrder({
      ...current,
      state,
      eventAt,
      paidAt: nextPaidAt,
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

  // Project responses contain opaque capability tokens and must never be
  // retained by browsers, CDNs, or reverse-proxy caches.
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    next();
  });

  const resolveMonitorQuestion = async (
    value: ProjectTokenValue,
    questionId: string,
    perspective: "product_opinion" | "industry_ranking" = "product_opinion",
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
      getResolvedQuestionTask(broker, value.questionTaskId),
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
    const categoryAllowed =
      perspective === "industry_ranking"
        ? question.category === "industry_ranking"
        : ["reputation", "product_scenario", "competitor_comparison"].includes(
            question.category,
          );
    if (perspective === "product_opinion" && !question.selectable) {
      throw new GeoHttpError(
        "该问题当前不可用于监控",
        403,
        "QUESTION_NOT_SELECTABLE",
      );
    }
    if (!categoryAllowed) {
      throw new GeoHttpError(
        perspective === "industry_ranking"
          ? "请选择当前项目中的行业排名问题"
          : "请选择产品与舆情范围内的问题",
        400,
        "QUESTION_SCOPE_MISMATCH",
      );
    }
    return { knowledgeBaseTask, questionTask, question };
  };

  const industryRankingReservationProjectId = (projectId: string) =>
    `geo-industry-${crypto
      .createHash("sha256")
      .update(projectId, "utf8")
      .digest("hex")}`;

  const ensureIndustryRankingMonitorRun = async (input: {
    value: ProjectTokenValue;
    clientRequestId: string;
    question: GeoQuestion;
    monitorQuestion: string;
    platforms: GeoMonitorPlatformId[];
    monitoringEdition: GeoMonitoringEdition;
    regionCode?: string;
    screenshotEnabled: boolean;
  }): Promise<
    | {
        state: "started";
        run: BrokerMonitorRun;
        scopeHash: string;
        reservation?: GeoMonitorFreeReservationRecord;
      }
    | {
        state: "processing";
        scopeHash: string;
        reservation: GeoMonitorFreeReservationRecord;
      }
  > => {
    const sortedPlatforms = [...input.platforms].sort();
    const reservationProjectId = industryRankingReservationProjectId(
      input.value.projectId,
    );
    const scopeHash = crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          projectId: input.value.projectId,
          knowledgeBaseTaskId: input.value.knowledgeBaseTaskId,
          perspective: "industry_ranking",
          questionId: input.question.id,
          monitoringEdition: input.monitoringEdition,
          platformIds: sortedPlatforms,
          ...(input.regionCode ? { regionCode: input.regionCode } : {}),
          ...(input.screenshotEnabled ? { screenshotEnabled: true } : {}),
        }),
      )
      .digest("hex");
    const idempotencyKey = `geo-monitor-free:v2:${scopeHash}`;

    if (input.value.industryRankingMonitorRunId) {
      const run = await getResolvedMonitorRun(
        broker,
        input.value.industryRankingMonitorRunId,
        { question: input.monitorQuestion, platforms: input.platforms },
      );
      return {
        state: "started",
        run,
        scopeHash,
      };
    }

    let reserved: Awaited<
      ReturnType<GeoMonitorFreeReservationStore["reserve"]>
    >;
    try {
      reserved = await monitorFreeReservationStore.reserve({
        projectId: reservationProjectId,
        scopeHash,
        clientRequestId: input.clientRequestId,
        idempotencyKey,
      });
    } catch (error) {
      if (
        error instanceof GeoMonitorFreeReservationStoreError &&
        error.code === "SCOPE_CONFLICT"
      ) {
        throw new GeoHttpError(
          "该项目已有一项不同范围的行业排名监控任务",
          409,
          "MONITOR_SCOPE_CONFLICT",
        );
      }
      if (
        error instanceof GeoMonitorFreeReservationStoreError &&
        error.code === "CLIENT_REQUEST_CONFLICT"
      ) {
        throw new GeoHttpError(
          error.message,
          409,
          "MONITOR_CLIENT_REQUEST_CONFLICT",
        );
      }
      throw error;
    }
    let reservation = reserved.record;
    const flightKey = reservationProjectId;
    let freeStart = freeMonitoringStarts.get(flightKey);
    if (!freeStart) {
      freeStart = {
        clientRequestId: reservation.clientRequestId,
        scopeHash,
        idempotencyKey,
        expiresAt: Date.now() + FREE_MONITOR_START_FLIGHT_TTL_MS,
      };
      freeMonitoringStarts.set(flightKey, freeStart);
    } else if (
      freeStart.scopeHash !== scopeHash ||
      freeStart.clientRequestId !== reservation.clientRequestId
    ) {
      throw new GeoHttpError(
        "行业排名监控进程状态与持久 reservation 不一致",
        503,
        "MONITOR_RESERVATION_STATE_CONFLICT",
      );
    }

    let run: BrokerMonitorRun;
    if (reservation.runId) {
      run = await getResolvedMonitorRun(broker, reservation.runId, {
        question: input.monitorQuestion,
        platforms: input.platforms,
      });
    } else {
      reservation = await monitorFreeReservationStore.markSubmitting({
        projectId: reservationProjectId,
        scopeHash,
        idempotencyKey,
        submissionKey: idempotencyKey,
      });
      if (!freeStart.promise) {
        freeStart.promise = broker
          .createMonitorRun({
            projectId: input.value.projectId,
            question: input.monitorQuestion,
            platforms: input.platforms,
            idempotencyKey,
            monitorKeyword: input.value.companyName,
            ...(input.screenshotEnabled ? { screenshot: 1 } : {}),
            ...(input.regionCode
              ? {
                  region: {
                    scope: input.monitoringEdition,
                    code: input.regionCode,
                  },
                }
              : {}),
          })
          .then((candidate) =>
            normalizeMonitorRun(candidate, {
              question: input.monitorQuestion,
              platforms: input.platforms,
            }),
          );
      }
      try {
        run = await freeStart.promise;
        freeStart.run = run;
      } catch (error) {
        freeStart.promise = undefined;
        if (
          error instanceof GeoBrokerError &&
          error.code === "MONITOR_SUBMISSION_UNKNOWN"
        ) {
          return { state: "processing", scopeHash, reservation };
        }
        if (
          error instanceof GeoBrokerError &&
          ["REGION_UNAVAILABLE", "MONITOR_SUBMISSION_REJECTED"].includes(
            error.code,
          )
        ) {
          freeMonitoringStarts.delete(flightKey);
          await monitorFreeReservationStore.releaseConfirmedRejected({
            projectId: reservationProjectId,
            scopeHash,
            idempotencyKey,
            submissionKey: idempotencyKey,
          });
          if (error.code === "REGION_UNAVAILABLE") {
            throw new GeoHttpError(
              "所选监控地区已不可用，请刷新列表后重新选择",
              422,
              "REGION_UNAVAILABLE",
            );
          }
        }
        throw error;
      }
    }

    if (input.regionCode) {
      if (
        !run.region ||
        run.region.edition !== input.monitoringEdition ||
        run.region.code !== input.regionCode
      ) {
        throw new GeoMonitorContractError(
          "行业排名监控地区快照与提交范围不匹配",
        );
      }
    } else if (run.region) {
      throw new GeoMonitorContractError("行业排名监控返回了未请求的地区快照");
    }
    if (Boolean(run.screenshotEnabled) !== input.screenshotEnabled) {
      throw new GeoMonitorContractError("行业排名监控截图设置与提交范围不匹配");
    }
    if (
      run.status === "submission_in_progress" ||
      run.status === "submission_unknown"
    ) {
      reservation = await monitorFreeReservationStore.markRun({
        projectId: reservationProjectId,
        scopeHash,
        idempotencyKey,
        submissionKey: reservation.submissionKey || idempotencyKey,
        runId: run.runId,
        runStatus: run.status,
        state: "submitted",
      });
      freeStart.promise = undefined;
      freeStart.run = undefined;
      return { state: "processing", scopeHash, reservation };
    }
    if (run.status === "remote_failed" || run.status === "shape_mismatch") {
      await monitorFreeReservationStore.markRun({
        projectId: reservationProjectId,
        scopeHash,
        idempotencyKey,
        submissionKey: reservation.submissionKey || idempotencyKey,
        runId: run.runId,
        runStatus: run.status,
        state: "failed",
      });
      freeMonitoringStarts.delete(flightKey);
      throw new GeoHttpError(
        "行业排名监控服务已明确拒绝或无法校验本次任务",
        502,
        "MONITOR_SUBMISSION_REJECTED",
      );
    }
    reservation = await monitorFreeReservationStore.markRun({
      projectId: reservationProjectId,
      scopeHash,
      idempotencyKey,
      submissionKey: reservation.submissionKey || idempotencyKey,
      runId: run.runId,
      runStatus: run.status,
      state: "started",
    });
    freeMonitoringStarts.delete(flightKey);
    return { state: "started", run, scopeHash, reservation };
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
      getResolvedMonitorRun(
        broker,
        value.monitorRunId,
        monitorRunExpectation(value),
      ),
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
    let preResolvedOutputs: {
      assessment: ReturnType<typeof resolveAssessmentTaskOutput>;
      forecast: ReturnType<typeof resolveOptimizationOutcomeForecastTaskOutput>;
    };
    try {
      const validatedOutputs = await validateServiceAssessmentOutputs(
        broker,
        resolved.question,
        assessmentTask,
        forecastTask,
        monitorRun.platforms,
        monitorRun,
      );
      preResolvedOutputs = {
        assessment: Promise.resolve(validatedOutputs.assessmentOutput),
        forecast: Promise.resolve(validatedOutputs.forecastOutput),
      };
    } catch (error) {
      logAssessmentOutputValidation(
        error,
        error instanceof ForecastTaskOutputValidationError
          ? forecastTask
          : assessmentTask,
      );
      throw new GeoHttpError(
        "现状评估或优化效果评估结果暂未通过校验，系统未采用不完整结果",
        409,
        "SERVICE_ASSESSMENT_INVALID",
      );
    }
    return {
      ...resolved,
      assessmentTask,
      forecastTask,
      monitorRun,
      preResolvedOutputs,
      category: category as GeoServiceCategory,
      amountFen: geoServiceMonthlyPriceFen(
        category as GeoServiceCategory,
        value.monitoringEdition,
      ),
    };
  };

  const mergePurchaseProvision = (
    value: ProjectTokenValue,
    response: GeoPurchaseProvisionResponseV2,
  ): ProjectTokenValue => {
    if (
      response.purchase.projectId !== value.projectId ||
      response.purchase.orderId !== value.serviceOrderId ||
      normalizedGeoMonitoringEdition(response.purchase.marketEdition) !==
        normalizedGeoMonitoringEdition(value.monitoringEdition) ||
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
      normalizedGeoMonitoringEdition(response.order.marketEdition) !==
        normalizedGeoMonitoringEdition(value.monitoringEdition) ||
      (response.order.amountFen !== undefined &&
        response.order.amountFen !== value.serviceAmountFen) ||
      (value.serviceManualOrderReference &&
        response.order.reference !== value.serviceManualOrderReference)
    ) {
      throw new GeoHttpError(
        "合同订单与当前服务范围不匹配",
        502,
        "MANUAL_ORDER_SCOPE_MISMATCH",
      );
    }
    const externallyAuthorized =
      response.order.contractAuthorizationMode === "external_wechat";
    return {
      ...value,
      serviceManualOrderReference: response.order.reference,
      serviceManualOrderStatus: response.order.status,
      serviceManualOrderMessage: response.order.message,
      serviceManualOrderRetryable: response.order.retryable,
      serviceManualOrderUpdatedAt: response.order.updatedAt,
      serviceManualContractId: externallyAuthorized
        ? undefined
        : response.order.contractId || value.serviceManualContractId,
      serviceManualSigningUrl: externallyAuthorized
        ? undefined
        : response.order.signingUrl || value.serviceManualSigningUrl,
      serviceManualSignedAt: externallyAuthorized
        ? undefined
        : response.order.signedAt || value.serviceManualSignedAt,
      serviceContractAuthorizationMode:
        response.order.contractAuthorizationMode ||
        value.serviceContractAuthorizationMode,
      serviceContractAuthorizedAt:
        response.order.contractAuthorizedAt ||
        value.serviceContractAuthorizedAt,
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
      const importFinalizerVersion = "website-kb-finalizer-v1" as const;
      const idempotencyKey = [
        "geo-basic",
        value.projectId,
        artifact.final.sha256,
        artifact.final.packageManifestSha256,
        importFinalizerVersion,
        "knowledge-v5",
      ].join(":");
      const imported = await knowledgeImporter(value.projectId, {
        schemaVersion: 5,
        companyName: value.companyName,
        candidateArtifactId: artifact.candidate.artifactId,
        finalArtifactId: artifact.final.artifactId,
        candidateSha256: artifact.candidate.sha256,
        finalSha256: artifact.final.sha256,
        packageManifestSha256: artifact.final.packageManifestSha256,
        finalizerVersion: importFinalizerVersion,
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
    const status = await broker.getStatus({ freshMonitorCredential: true });
    if (
      !status.ok ||
      !status.credentialConfigured ||
      !status.monitorCredentialConfigured ||
      !status.monitorCredentialAuthenticated
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

  const requireInviteContext = (
    inviteContextToken: string,
    sessionId: string,
  ) => {
    let inviteContext: InviteContextTokenValue;
    try {
      inviteContext = codec.open<InviteContextTokenValue>(
        inviteContextToken,
        "invite-context",
      ).value;
    } catch {
      throw new GeoHttpError(
        "邀请码验证上下文无效或已过期，请重新验证",
        401,
        "INVITE_CONTEXT_INVALID",
      );
    }
    let businessOwnerName: string;
    try {
      businessOwnerName = normalizeBusinessOwnerName(
        inviteContext.businessOwnerName,
      );
    } catch {
      throw new GeoHttpError(
        "邀请码验证上下文无效或已过期，请重新验证",
        401,
        "INVITE_CONTEXT_INVALID",
      );
    }
    if (
      inviteContext.schemaVersion !== 1 ||
      inviteContext.sessionNonce !== sessionId ||
      inviteContext.businessOwnerName !== businessOwnerName ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        inviteContext.contextId,
      )
    ) {
      throw new GeoHttpError(
        inviteContext.sessionNonce !== sessionId
          ? "邀请码验证上下文不属于当前会话"
          : "邀请码验证上下文无效或已过期，请重新验证",
        inviteContext.sessionNonce !== sessionId ? 403 : 401,
        inviteContext.sessionNonce !== sessionId
          ? "INVITE_CONTEXT_SESSION_MISMATCH"
          : "INVITE_CONTEXT_INVALID",
      );
    }
    return { ...inviteContext, businessOwnerName };
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

  const consumeMonitoringStartRate = async (
    req: Request,
    res: Response,
    value: ProjectTokenValue,
    paymentAuthorization: string,
  ) => {
    const authorizationDigest = sha256(paymentAuthorization);
    const ledger = await readProjectOrders(value.projectId);
    const isPaidFulfillmentRetry = ledger.orders.some(
      (order) =>
        order.purchaseType === "monitoring" &&
        safeSecretEqual(order.authorizationDigest, authorizationDigest) &&
        ["paid", "fulfilling", "fulfilled", "review_required"].includes(
          order.state,
        ),
    );
    if (isPaidFulfillmentRetry) {
      // Payment-status verification has already moved this exact opaque order
      // capability into fulfillment. Do not strand a paid customer behind the
      // low hourly quota used for unauthenticated/cost-incurring starts, while
      // still bounding accidental retry storms per session and network source.
      consumeSessionRate(
        res,
        "monitor-paid-start",
        PAID_MONITOR_START_RATE_LIMIT,
        1,
        PAID_MONITOR_START_RATE_WINDOW_MS,
      );
      consumeIdentityRate(
        req,
        "monitor-paid-start",
        PAID_MONITOR_START_RATE_LIMIT,
        1,
        PAID_MONITOR_START_RATE_WINDOW_MS,
      );
      return;
    }
    consumeSessionRate(res, "monitor-create", 6);
    consumeIdentityRate(req, "monitor-create", 6);
  };

  const openOwnedProject = (req: Request, res: Response) => {
    const { value } = codec.open<ProjectTokenValue>(
      req.params.projectToken,
      "project",
    );
    if (
      value.projectContractVersion !== 2 ||
      !value.ownerSessionId ||
      value.ownerSessionId !== String(res.locals.geoSessionId || "")
    ) {
      throw new GeoHttpError(
        value.projectContractVersion !== 2
          ? "项目使用旧版任务合同，请重新创建项目"
          : "项目不属于当前邀请会话",
        value.projectContractVersion !== 2 ? 409 : 403,
        value.projectContractVersion !== 2
          ? "PROJECT_CONTRACT_RESET_REQUIRED"
          : "PROJECT_SESSION_MISMATCH",
      );
    }
    return value;
  };

  const requireUploadToken = (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      // Upload capabilities are header-only. Query-string tokens can be
      // copied into reverse-proxy request lines and error logs.
      const token = headerValue(req, "x-geo-upload-token");
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
      const contentLengthHeader = req.headers["content-length"];
      if (req.method === "PUT" && contentLengthHeader !== undefined) {
        const contentLength = Number(contentLengthHeader);
        if (
          !Number.isSafeInteger(contentLength) ||
          contentLength < 0 ||
          contentLength !== payload.sizeBytes
        ) {
          throw new GeoHttpError(
            "上传文件大小与申请记录不一致",
            400,
            "UPLOAD_SIZE_MISMATCH",
          );
        }
      }
      res.locals.geoUpload = {
        ...payload,
        traceId:
          typeof payload.traceId === "string" && payload.traceId.trim()
            ? payload.traceId
            : `upload-${sha256(
                JSON.stringify({
                  sessionId: payload.sessionId,
                  fileId: payload.fileId,
                  sizeBytes: payload.sizeBytes,
                }),
              ).slice(0, 24)}`,
      } satisfies UploadTokenValue;
      next();
    } catch (error) {
      next(error);
    }
  };

  const assertUploadAssetMatches = (
    asset: BrokerLocalAsset,
    payload: UploadTokenValue,
  ) => {
    if (
      asset.localAssetId !== payload.fileId ||
      asset.filename !== payload.filename
    ) {
      throw new GeoHttpError(
        "上传文件归属与申请记录不一致",
        409,
        "UPLOAD_ASSET_CONFLICT",
      );
    }
    if (
      asset.status === "uploaded" &&
      asset.bytes !== undefined &&
      asset.bytes !== payload.sizeBytes
    ) {
      throw new GeoHttpError(
        "已上传文件大小与申请记录不一致",
        409,
        "UPLOAD_ASSET_CONFLICT",
      );
    }
  };

  router.put(
    "/uploads/proxy",
    requireConfiguration,
    requireSession,
    requireSessionRate("upload-content", 30),
    requireUploadToken,
    asyncHandler(async (req, res) => {
      const payload = res.locals.geoUpload as UploadTokenValue;
      const uploadAttemptHeader = headerValue(
        req,
        "x-geo-upload-attempt",
      ).trim();
      if (uploadAttemptHeader && !/^[1-3]$/.test(uploadAttemptHeader)) {
        throw new GeoHttpError(
          "上传重试序号无效",
          400,
          "UPLOAD_ATTEMPT_INVALID",
        );
      }
      const uploadAttempt = uploadAttemptHeader
        ? Number(uploadAttemptHeader)
        : 1;
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
      if (activeUploadsByAsset.has(payload.fileId)) {
        res.setHeader("Retry-After", "1");
        throw new GeoHttpError(
          "该文件正在上传，请等待当前传输完成",
          429,
          "UPLOAD_IN_PROGRESS",
        );
      }
      const sessionId = String(res.locals.geoSessionId || "");
      const sessionActive = activeUploadsBySession.get(sessionId) || 0;
      if (activeUploads >= 2 || sessionActive >= 1) {
        throw new GeoHttpError(
          "已有文件正在上传，请等待当前上传完成",
          429,
          "UPLOAD_CONCURRENCY_LIMITED",
        );
      }

      const startedAt = Date.now();
      const flight = {
        traceId: payload.traceId,
        declaredBytes: payload.sizeBytes,
        receivedBytes: 0,
        startedAt,
      };
      activeUploads += 1;
      activeUploadsBySession.set(sessionId, sessionActive + 1);
      activeUploadsByAsset.set(payload.fileId, flight);

      const downstreamController = new AbortController();
      let abortReason:
        | "client_aborted"
        | "client_closed"
        | "response_closed"
        | "data_idle"
        | "confirmation_timeout"
        | "size_mismatch"
        | undefined;
      let dataIdleTimer: NodeJS.Timeout | undefined;
      let confirmationTimer: NodeJS.Timeout | undefined;
      let outcome = "failed";
      let responseUnavailable = false;
      let transportError:
        | { source: "stream" | "socket"; code: string }
        | undefined;
      const progressMilestones = [25, 50, 75, 100] as const;
      let nextProgressMilestone = 0;
      const abortDownstream = (reason: NonNullable<typeof abortReason>) => {
        if (abortReason) return;
        abortReason = reason;
        downstreamController.abort();
      };
      const clearDataIdleTimer = () => {
        if (dataIdleTimer) clearTimeout(dataIdleTimer);
        dataIdleTimer = undefined;
      };
      const resetDataIdleTimer = () => {
        clearDataIdleTimer();
        dataIdleTimer = setTimeout(() => {
          abortDownstream("data_idle");
          req.unpipe(uploadStream);
          req.resume();
          uploadStream.destroy();
        }, uploadDataIdleMs);
        dataIdleTimer.unref?.();
      };
      const recordTransportError = (
        source: "stream" | "socket",
        error: unknown,
      ) => {
        const rawCode =
          error && typeof error === "object" && "code" in error
            ? String((error as { code?: unknown }).code || "")
            : "";
        const code = /^[A-Z0-9_]{1,80}$/.test(rawCode)
          ? rawCode
          : source === "socket"
            ? "SOCKET_ERROR"
            : "STREAM_ERROR";
        if (!transportError) transportError = { source, code };
        console.warn("[GEO upload]", {
          event: "transport_error",
          traceId: payload.traceId,
          fileId: payload.fileId,
          attachmentIndex: payload.attachmentIndex ?? null,
          attempt: uploadAttempt,
          source,
          code,
        });
      };
      const uploadStream = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          flight.receivedBytes += chunk.byteLength;
          if (
            flight.receivedBytes > payload.sizeBytes ||
            flight.receivedBytes > MAX_UPLOAD_BYTES
          ) {
            abortDownstream("size_mismatch");
            const sizeError = new Error() as NodeJS.ErrnoException;
            sizeError.code = "UPLOAD_SIZE_MISMATCH";
            callback(sizeError);
            return;
          }
          while (
            nextProgressMilestone < progressMilestones.length &&
            flight.receivedBytes * 100 >=
              payload.sizeBytes * progressMilestones[nextProgressMilestone]!
          ) {
            console.info("[GEO upload]", {
              event: "proxy_progress",
              traceId: payload.traceId,
              fileId: payload.fileId,
              attachmentIndex: payload.attachmentIndex ?? null,
              attempt: uploadAttempt,
              milestone: progressMilestones[nextProgressMilestone],
              declaredBytes: payload.sizeBytes,
              receivedBytes: flight.receivedBytes,
              durationMs: Date.now() - startedAt,
            });
            nextProgressMilestone += 1;
          }
          resetDataIdleTimer();
          callback(null, chunk);
        },
      });
      const onUploadStreamError = (error: Error) =>
        recordTransportError("stream", error);
      const onRequestStreamError = (error: Error) =>
        recordTransportError("stream", error);
      const onSocketError = (error: Error) =>
        recordTransportError("socket", error);
      // fetch consumes the stream error; this listener records only its safe,
      // normalized code and also prevents an uncaught local stream failure.
      uploadStream.on("error", onUploadStreamError);
      req.on("error", onRequestStreamError);
      req.socket.on("error", onSocketError);
      const onRequestAborted = () => {
        if (req.complete) responseUnavailable = true;
        else abortDownstream("client_aborted");
      };
      const onRequestClose = () => {
        if (!req.complete) abortDownstream("client_closed");
      };
      const onResponseClose = () => {
        if (res.writableFinished) return;
        responseUnavailable = true;
        if (!req.complete) abortDownstream("response_closed");
      };
      const onRequestEnd = () => {
        clearDataIdleTimer();
        if (flight.receivedBytes !== payload.sizeBytes) {
          abortDownstream("size_mismatch");
          return;
        }
        confirmationTimer = setTimeout(() => {
          abortDownstream("confirmation_timeout");
        }, uploadConfirmationMs);
        confirmationTimer.unref?.();
      };
      req.once("aborted", onRequestAborted);
      req.once("close", onRequestClose);
      req.once("end", onRequestEnd);
      res.once("close", onResponseClose);
      console.info("[GEO upload]", {
        event: "proxy_started",
        traceId: payload.traceId,
        fileId: payload.fileId,
        attachmentIndex: payload.attachmentIndex ?? null,
        attempt: uploadAttempt,
        declaredBytes: payload.sizeBytes,
      });

      try {
        const asset = await broker.getAsset(payload.fileId, {
          signal: AbortSignal.any([
            downstreamController.signal,
            AbortSignal.timeout(UPLOAD_PREFLIGHT_TIMEOUT_MS),
          ]),
        });
        assertUploadAssetMatches(asset, payload);
        if (asset.status === "uploaded") {
          if (!req.complete) req.resume();
          throw new GeoHttpError(
            "该文件已完整提交，请核对上传状态",
            409,
            "UPLOAD_ALREADY_COMMITTED",
          );
        }
        resetDataIdleTimer();
        const downstream = broker.uploadAsset(
          payload.fileId,
          uploadStream,
          String(originalContentType),
          payload.upstreamUploadTicket,
          {
            signal: downstreamController.signal,
            sizeBytes: payload.sizeBytes,
          },
        );
        console.info("[GEO upload]", {
          event: "downstream_started",
          traceId: payload.traceId,
          fileId: payload.fileId,
          attachmentIndex: payload.attachmentIndex ?? null,
          attempt: uploadAttempt,
          declaredBytes: payload.sizeBytes,
        });
        req.pipe(uploadStream);
        const result = await downstream;
        const resultStatus = uploadStatus(result);
        if (
          resultStatus === "uploaded" &&
          (!req.complete || flight.receivedBytes !== payload.sizeBytes)
        ) {
          req.unpipe(uploadStream);
          if (!req.aborted) req.resume();
          throw new GeoHttpError(
            "上传结果需要通过状态接口核对",
            409,
            "UPLOAD_ALREADY_COMMITTED",
          );
        }
        if (resultStatus !== "uploaded") {
          throw new GeoHttpError(
            "上传服务未返回完整提交状态",
            502,
            "UPLOAD_CONFIRMATION_INVALID",
          );
        }
        if (abortReason === "size_mismatch") {
          throw new GeoHttpError(
            "上传文件大小与申请记录不一致",
            400,
            "UPLOAD_SIZE_MISMATCH",
          );
        }
        if (abortReason === "data_idle") {
          throw new GeoHttpError(
            "上传长时间没有收到新数据，请重试当前文件",
            408,
            "UPLOAD_DATA_IDLE_TIMEOUT",
          );
        }
        if (abortReason === "confirmation_timeout") {
          throw new GeoHttpError(
            "文件已发送，服务端确认暂未返回，请先核对上传状态",
            504,
            "UPLOAD_CONFIRMATION_TIMEOUT",
          );
        }
        if (
          abortReason === "client_aborted" ||
          abortReason === "client_closed" ||
          abortReason === "response_closed"
        ) {
          outcome = abortReason;
          return;
        }
        if (responseUnavailable || res.destroyed || !res.writable) {
          outcome = "uploaded_response_unavailable";
          return;
        }
        if (!req.complete) {
          req.unpipe(uploadStream);
          req.resume();
        }
        outcome = "uploaded";
        res.json({
          ok: true,
          fileId: payload.fileId,
          filename: payload.filename,
          status: resultStatus,
          traceId: payload.traceId,
        });
      } catch (error) {
        if (!req.complete && !req.aborted) req.resume();
        outcome =
          error instanceof GeoHttpError || error instanceof GeoBrokerError
            ? error.code
            : "upload_failed";
        if (abortReason === "data_idle") {
          outcome = "UPLOAD_DATA_IDLE_TIMEOUT";
          throw new GeoHttpError(
            "上传长时间没有收到新数据，请重试当前文件",
            408,
            "UPLOAD_DATA_IDLE_TIMEOUT",
          );
        }
        if (abortReason === "confirmation_timeout") {
          outcome = "UPLOAD_CONFIRMATION_TIMEOUT";
          throw new GeoHttpError(
            "文件已发送，服务端确认暂未返回，请先核对上传状态",
            504,
            "UPLOAD_CONFIRMATION_TIMEOUT",
          );
        }
        if (abortReason === "size_mismatch") {
          outcome = "UPLOAD_SIZE_MISMATCH";
          throw new GeoHttpError(
            "上传文件大小与申请记录不一致",
            400,
            "UPLOAD_SIZE_MISMATCH",
          );
        }
        if (
          abortReason === "client_aborted" ||
          abortReason === "client_closed" ||
          abortReason === "response_closed"
        ) {
          outcome = abortReason;
          return;
        }
        if (responseUnavailable || res.destroyed || !res.writable) {
          outcome = `${outcome}_response_unavailable`;
          return;
        }
        throw error;
      } finally {
        clearDataIdleTimer();
        if (confirmationTimer) clearTimeout(confirmationTimer);
        req.off("aborted", onRequestAborted);
        req.off("close", onRequestClose);
        req.off("end", onRequestEnd);
        res.off("close", onResponseClose);
        uploadStream.off("error", onUploadStreamError);
        req.off("error", onRequestStreamError);
        req.socket.off("error", onSocketError);
        req.unpipe(uploadStream);
        if (!uploadStream.destroyed) uploadStream.destroy();
        if (activeUploadsByAsset.get(payload.fileId) === flight) {
          activeUploadsByAsset.delete(payload.fileId);
        }
        activeUploads = Math.max(0, activeUploads - 1);
        const remaining = (activeUploadsBySession.get(sessionId) || 1) - 1;
        if (remaining > 0) activeUploadsBySession.set(sessionId, remaining);
        else activeUploadsBySession.delete(sessionId);
        console.info("[GEO upload]", {
          event: "proxy_finished",
          traceId: payload.traceId,
          fileId: payload.fileId,
          attachmentIndex: payload.attachmentIndex ?? null,
          attempt: uploadAttempt,
          declaredBytes: payload.sizeBytes,
          receivedBytes: flight.receivedBytes,
          durationMs: Date.now() - startedAt,
          requestAborted: req.aborted,
          requestComplete: req.complete,
          outcome,
          abortReason: abortReason ?? null,
          responseUnavailable,
          transportErrorSource: transportError?.source ?? null,
          transportErrorCode: transportError?.code ?? null,
        });
      }
    }),
  );

  router.get(
    "/uploads/status",
    requireConfiguration,
    requireSession,
    requireSessionRate("upload-status", 120, 60 * 1000),
    requireUploadToken,
    asyncHandler(async (_req, res) => {
      const payload = res.locals.geoUpload as UploadTokenValue;
      const asset = await broker.getAsset(payload.fileId);
      assertUploadAssetMatches(asset, payload);
      const flight = activeUploadsByAsset.get(payload.fileId);
      res.json({
        fileId: payload.fileId,
        assetStatus: asset.status,
        transferState: flight ? "uploading" : "idle",
        declaredBytes: payload.sizeBytes,
        receivedBytes:
          asset.status === "uploaded"
            ? (asset.bytes ?? payload.sizeBytes)
            : (flight?.receivedBytes ?? asset.bytes ?? 0),
        ...(asset.sha256 ? { sha256: asset.sha256 } : {}),
        traceId: payload.traceId,
      });
    }),
  );

  router.use(express.json({ limit: "1mb" }));

  const rejectPaymentCallbackHead = (_req: Request, res: Response) => {
    res.setHeader("Allow", "GET");
    res.status(405).end();
  };
  const reconcileClosedMonitoringCallback = async (
    parameters: Record<string, string>,
    result: {
      status: "pending" | "paid" | "review_required";
      orderId: string;
      paidAt?: string;
    },
  ) => {
    if (result.status !== "paid" && result.status !== "review_required") {
      return false;
    }
    const authorization = parameters.param;
    if (!authorization) return false;
    let capability: { projectId?: string; purchaseType?: string };
    try {
      capability = codec.open<typeof capability>(
        authorization,
        "payment",
      ).value;
    } catch {
      return false;
    }
    if (!capability.projectId || capability.purchaseType === "service") {
      return false;
    }
    const projectOrders = await readProjectOrders(capability.projectId);
    const authorizationDigest = sha256(authorization);
    const matchingOrder = projectOrders.orders.find(
      (order) =>
        order.purchaseType === "monitoring" &&
        order.orderId === result.orderId &&
        safeSecretEqual(order.authorizationDigest, authorizationDigest),
    );
    if (matchingOrder?.state !== "closed") return false;
    await transitionProjectOrder(
      capability.projectId,
      matchingOrder.orderId,
      "review_required",
      { paidAt: result.paidAt },
    );
    return true;
  };
  // Express normally treats HEAD as GET when no explicit HEAD handler exists.
  // Keep callback verification side effects exclusive to the signed GET path,
  // even if a reverse-proxy method gate is accidentally removed later.
  router.head("/payments/notify", rejectPaymentCallbackHead);
  router.head("/payments/return", rejectPaymentCallbackHead);

  router.get("/payments/notify", async (req, res) => {
    try {
      const parameters = paymentCallbackParameters(req.query);
      const result = await paymentGateway.verifyCallback(parameters);
      if (!["paid", "review_required"].includes(result.status)) {
        throw new Error("payment is not complete");
      }
      await reconcileClosedMonitoringCallback(parameters, result);
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
      const parameters = paymentCallbackParameters(req.query);
      const result = await paymentGateway.verifyCallback(parameters);
      if (result.status === "paid" || result.status === "review_required") {
        const lateClosedMonitoring = await reconcileClosedMonitoringCallback(
          parameters,
          result,
        );
        returnStatus = lateClosedMonitoring ? "review_required" : result.status;
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

      const { code, businessOwnerName } = InviteRequestSchema.parse(req.body);
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
      const sessionNonce = nonce || crypto.randomUUID();
      const token = codec.seal(
        "session",
        { scope: "geo", nonce: sessionNonce },
        SESSION_TTL_MS,
      );
      const inviteContextExpiresAt = now + INVITE_CONTEXT_TTL_MS;
      const inviteContextToken = codec.seal<InviteContextTokenValue>(
        "invite-context",
        {
          schemaVersion: 1,
          sessionNonce,
          businessOwnerName,
          contextId: crypto.randomUUID(),
        },
        INVITE_CONTEXT_TTL_MS,
      );
      res.cookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: production,
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_TTL_MS,
      });
      res.json({
        ok: true,
        expiresAt,
        inviteContextExpiresAt,
        inviteContextToken,
        businessOwnerName,
      });
    }),
  );

  router.get("/session", requireConfiguration, requireSession, (_req, res) =>
    res.json({ ok: true }),
  );

  router.post(
    "/uploads/init",
    requireConfiguration,
    requireSession,
    asyncHandler(async (req, res) => {
      const input = UploadInitRequestSchema.parse(req.body);
      const sessionId = String(res.locals.geoSessionId || "");
      requireInviteContext(input.inviteContextToken, sessionId);
      // Every init invocation consumes the cheap request-count budget. Only
      // the byte-cost budget is idempotent by the stable upload operation.
      consumeSessionRate(res, "upload-init", 20);
      const filename = safeCustomerUploadFilename(input.filename);
      const requestIdentity =
        input.clientRequestId !== undefined &&
        input.attachmentIndex !== undefined
          ? {
              clientRequestId: input.clientRequestId,
              attachmentIndex: input.attachmentIndex,
            }
          : { legacyRequestNonce: crypto.randomUUID() };
      const idempotencyKey = `geo-upload-init:v1:${sha256(
        JSON.stringify({ schemaVersion: 1, sessionId, ...requestIdentity }),
      )}`;
      const traceId = `upload-${sha256(idempotencyKey).slice(0, 24)}`;
      const now = Date.now();
      pruneExpiringMap(chargedUploadOperations, now, 10_000);
      if (!chargedUploadOperations.has(idempotencyKey)) {
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
        chargedUploadOperations.set(idempotencyKey, {
          expiresAt: now + UPLOAD_TTL_MS,
        });
      }
      let asset: BrokerLocalAsset;
      try {
        asset = await broker.createAsset({
          filename,
          mimeType: input.contentType,
          sizeBytes: input.sizeBytes,
          idempotencyKey,
        });
      } catch (error) {
        if (
          error instanceof GeoBrokerError &&
          (error.status === 400 || error.status === 422)
        ) {
          console.error("[GEO API]", {
            event: "upload_init_broker_contract_error",
            diagnosticCode: "GEO_UPLOAD_BROKER_CONTRACT_ERROR",
            brokerStatus: error.status,
            brokerCode: error.code,
          });
          throw new GeoHttpError(
            "附件上传服务合同暂时不一致，请稍后重试",
            502,
            "GEO_UPLOAD_BROKER_CONTRACT_ERROR",
          );
        }
        throw error;
      }
      if (!asset.localAssetId)
        throw new GeoHttpError("创建上传文件失败", 502, "UPLOAD_INIT_FAILED");
      const uploadToken = codec.seal<UploadTokenValue>(
        "upload",
        {
          fileId: asset.localAssetId,
          filename: asset.filename || filename,
          sessionId: String(res.locals.geoSessionId || ""),
          sizeBytes: input.sizeBytes,
          traceId,
          ...(input.attachmentIndex !== undefined
            ? { attachmentIndex: input.attachmentIndex }
            : {}),
          contentType: input.contentType,
          upstreamUploadTicket: asset.uploadTicket,
        },
        UPLOAD_TTL_MS,
      );
      console.info("[GEO upload]", {
        event: "init_reserved",
        traceId,
        fileId: asset.localAssetId,
        attachmentIndex: input.attachmentIndex ?? null,
        declaredBytes: input.sizeBytes,
        assetStatus: asset.status,
        replayed: asset.replayed === true,
      });
      res.status(asset.replayed ? 200 : 201).json({
        fileId: asset.localAssetId,
        filename: asset.filename || filename,
        uploadToken,
        status: asset.status,
        replayed: asset.replayed === true,
        traceId,
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
      const sessionId = String(res.locals.geoSessionId || "");
      const inviteContext = requireInviteContext(
        input.inviteContextToken,
        sessionId,
      );
      const businessOwnerName = inviteContext.businessOwnerName;
      const uploads = validateProjectAttachments(input, codec, sessionId);
      const projectId = input.clientRequestId
        ? deterministicProjectId(sessionId, input.clientRequestId, input)
        : crypto.randomUUID();
      const customerAttachments = input.attachments.map(
        (attachment, index) => ({
          localAssetId: attachment.fileId,
          filename: safeCustomerUploadFilename(
            uploads[index]?.filename || attachment.filename,
          ),
        }),
      );
      const normalizedAttachmentNames = customerAttachments.map((attachment) =>
        attachment.filename.normalize("NFKC").trim().toLowerCase(),
      );
      if (
        new Set(normalizedAttachmentNames).size !==
        normalizedAttachmentNames.length
      ) {
        throw new GeoHttpError(
          "上传文件名不得重复，请重命名后重试",
          422,
          "DUPLICATE_ATTACHMENT_FILENAME",
        );
      }
      const {
        inviteContextToken: _inviteContextToken,
        ...customerProjectInput
      } = input;
      const promptInput = {
        ...customerProjectInput,
        attachments: customerAttachments.map(({ filename }) => ({ filename })),
      };
      const created = await createWebsiteKnowledgeBaseTaskWithSkill(broker, {
        projectId,
        skillVersion: websiteKnowledgeBaseWriterVersion,
        prompt: await buildWebsiteKnowledgeBasePrompt(promptInput),
        taskInput: buildWebsiteKnowledgeBaseTaskInput(promptInput),
        localAssets: customerAttachments,
        idempotencyKey: `geo:${projectId}:knowledge-base:1`,
        businessOwnerName,
      });
      const task = created.task;
      const taskId = taskIdFrom(task);
      if (!taskId) {
        await Promise.allSettled(
          created.generatedAttachments.map((attachment) =>
            broker.deleteAsset(attachment.localAssetId),
          ),
        );
        throw new GeoHttpError(
          "创建知识库任务失败：缺少任务 ID",
          502,
          "TASK_ID_MISSING",
        );
      }

      const companyIdentity = deriveCompanyIdentity(input);
      const value: ProjectTokenValue = {
        projectContractVersion: 2,
        projectId,
        ownerSessionId: String(res.locals.geoSessionId || ""),
        businessOwnerName,
        companyName: companyIdentity.name,
        companyNameSource: companyIdentity.source,
        knowledgeBaseTaskId: taskId,
        knowledgeBaseSubmittedAt: new Date().toISOString(),
        knowledgeBaseValidationProfile: "website-lead-v1",
        knowledgeBaseSkillVersion: created.skillVersion,
        knowledgeBaseSkillSha256: created.skillSha256,
        uploadFileIds: uploads.map((upload) => upload.fileId),
        uploadFilenames: customerAttachments.map(
          (attachment) => attachment.filename,
        ),
        temporaryFileIds: created.generatedAttachments.map(
          (attachment) => attachment.localAssetId,
        ),
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

  const createAutomaticAssessmentTask = async (
    value: ProjectTokenValue,
    knowledgeBaseTask: BrokerTask,
    questionTask: BrokerTask,
    monitorRun: BrokerMonitorRun,
    perspective: "product_opinion" | "industry_ranking" = "product_opinion",
  ) => {
    const questionId =
      perspective === "industry_ranking"
        ? value.industryRankingQuestionId
        : value.monitorQuestionId;
    const monitorRunId =
      perspective === "industry_ranking"
        ? value.industryRankingMonitorRunId
        : value.monitorRunId;
    const assessmentAttempt =
      perspective === "industry_ranking"
        ? value.industryRankingAssessmentAttempt
        : value.assessmentAttempt;
    const question = questionId
      ? findOwnedQuestion(
          value,
          parseQuestionSetFromTask(questionTask)?.questions,
          questionId,
        )
      : undefined;
    if (!question) {
      throw new GeoHttpError(
        "监控问题与当前项目不匹配",
        409,
        "MONITOR_QUESTION_MISMATCH",
      );
    }
    if (monitorRun.status !== "completed" || !monitorRun.records) {
      throw new GeoHttpError(
        "监控仍在采集中，完成后将自动生成现状评估",
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
        rankingMetricEligible: question.category === "industry_ranking",
      },
      platforms: [...monitorRun.platforms].sort(compareCanonicalText),
      repeatPerPlatform: 5,
      expectedResponses: monitorRun.expectedItems,
      successfulResponses: monitorRun.records.filter(
        (record) => record.status === "completed" && Boolean(record.answerText),
      ).length,
      records: canonicalAssessmentMonitorRecords(monitorRun.records),
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
    )}-${perspective === "industry_ranking" ? "industry-ranking-" : ""}monitoring-records.json`;
    const assessmentTaskOperationKey = `geo:${value.projectId}:assessment:${perspective}:v3-top10:${monitorRunId}:${assessmentAttempt || 1}`;
    const temporaryFiles: string[] = [];
    try {
      const monitoringFile = await createGeoTaskEvidenceFile(broker, {
        projectId: value.projectId,
        taskOperationKey: assessmentTaskOperationKey,
        role: "monitoring-records",
        filename: monitoringFilename,
        mimeType: "application/json",
        body: monitoringBytes,
      });
      temporaryFiles.push(monitoringFile.localAssetId);
      const archiveAttachment = await materializeArchiveAttachment(
        broker,
        value.knowledgeBaseTaskId,
        archive,
        {
          projectId: value.projectId,
          idempotencyKey: `${assessmentTaskOperationKey}:knowledge-base-archive`,
        },
      );
      if (archiveAttachment.temporary) {
        temporaryFiles.push(archiveAttachment.localAssetId);
      }
      const successfulResponses = monitoringDocument.successfulResponses;
      const assessmentPromptInput = {
        companyName: value.companyName,
        archiveFilename: archiveAttachment.filename,
        monitoringFilename: monitoringFile.filename || monitoringFilename,
        question: monitoringDocument.question,
        monitoring: {
          platforms: monitorRun.platforms,
          repeatPerPlatform: 5 as const,
          expectedResponses: monitorRun.expectedItems,
          successfulResponses,
          failedResponses: monitorRun.expectedItems - successfulResponses,
        },
      };
      const created = await createGeoTaskWithSkillPackages(
        broker,
        {
          projectId: value.projectId,
          prompt: await buildAssessmentPrompt(assessmentPromptInput),
          localAssets: [
            {
              localAssetId: archiveAttachment.localAssetId,
              filename: archiveAttachment.filename,
            },
            {
              localAssetId: monitoringFile.localAssetId,
              filename: monitoringFile.filename || monitoringFilename,
            },
          ],
          idempotencyKey: assessmentTaskOperationKey,
          contract: PRESALES_CONTRACTS.currentStateAssessment,
        },
        [
          {
            filename: ASSESSMENT_SKILL_ARCHIVE_FILENAME,
            body: await buildGeoCurrentStateEvaluatorSkillArchive(),
          },
          buildAssessmentTaskInput(assessmentPromptInput),
        ],
      );
      temporaryFiles.push(
        ...created.skillAttachments.map((item) => item.localAssetId),
      );
      const assessmentTaskId = taskIdFrom(created.task);
      if (!assessmentTaskId) {
        throw new GeoHttpError(
          "创建现状评估任务失败：缺少任务 ID",
          502,
          "TASK_ID_MISSING",
        );
      }
      const submittedAt = new Date().toISOString();
      return {
        task: created.task,
        value: {
          ...value,
          ...(perspective === "industry_ranking"
            ? {
                industryRankingAssessmentTaskId: assessmentTaskId,
                industryRankingAssessmentSubmittedAt: submittedAt,
                industryRankingAssessmentAttempt:
                  value.industryRankingAssessmentAttempt || 1,
                industryRankingAssessmentVersion: 2 as const,
              }
            : {
                assessmentTaskId,
                assessmentSubmittedAt: submittedAt,
                assessmentAttempt: value.assessmentAttempt || 1,
                assessmentVersion: 2 as const,
              }),
          temporaryFileIds: Array.from(
            new Set([...(value.temporaryFileIds || []), ...temporaryFiles]),
          ),
        },
      };
    } catch (error) {
      if (!shouldRetainGeneratedTaskFilesForReplay(error)) {
        await Promise.allSettled(
          temporaryFiles.map((fileId) => broker.deleteAsset(fileId)),
        );
      }
      throw error;
    }
  };

  const createAutomaticOptimizationForecastTask = async (
    value: ProjectTokenValue,
    knowledgeBaseTask: BrokerTask,
    scoredAssessment: ReturnType<typeof calculateQuestionBaselineAssessment>,
    retryReason?: string,
    perspective: "product_opinion" | "industry_ranking" = "product_opinion",
    monitorRun?: BrokerMonitorRun,
  ) => {
    const assessmentTaskId =
      perspective === "industry_ranking"
        ? value.industryRankingAssessmentTaskId
        : value.assessmentTaskId;
    const assessmentSubmittedAt =
      perspective === "industry_ranking"
        ? value.industryRankingAssessmentSubmittedAt
        : value.assessmentSubmittedAt;
    const forecastAttempt =
      perspective === "industry_ranking"
        ? value.industryRankingOptimizationForecastAttempt
        : value.optimizationForecastAttempt;
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
    )}-${perspective === "industry_ranking" ? "industry-ranking-" : ""}current-assessment.json`;
    const assessmentBytes = Buffer.from(
      JSON.stringify({
        schemaVersion: 2,
        generatedAt: assessmentSubmittedAt || new Date(0).toISOString(),
        sourceAssessmentTaskId: assessmentTaskId,
        assessment: scoredAssessment,
      }),
      "utf8",
    );
    const scenarioFilename = "frontmind-standard-one-month-scenario.json";
    const scenarioBytes = Buffer.from(
      JSON.stringify({
        schemaVersion: 2,
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
      }),
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

    const forecastTaskOperationKey = `geo:${value.projectId}:optimization-forecast:${perspective}:${assessmentTaskId}:planning-target-4w-v5:${forecastAttempt || 1}`;
    const temporaryFiles: string[] = [];
    try {
      const assessmentFile = await createGeoTaskEvidenceFile(broker, {
        projectId: value.projectId,
        taskOperationKey: forecastTaskOperationKey,
        role: "current-assessment",
        filename: assessmentFilename,
        mimeType: "application/json",
        body: assessmentBytes,
      });
      temporaryFiles.push(assessmentFile.localAssetId);
      const scenarioFile = await createGeoTaskEvidenceFile(broker, {
        projectId: value.projectId,
        taskOperationKey: forecastTaskOperationKey,
        role: "execution-scenario",
        filename: scenarioFilename,
        mimeType: "application/json",
        body: scenarioBytes,
      });
      temporaryFiles.push(scenarioFile.localAssetId);
      const archiveAttachment = await materializeArchiveAttachment(
        broker,
        value.knowledgeBaseTaskId,
        archive,
        {
          projectId: value.projectId,
          idempotencyKey: `${forecastTaskOperationKey}:knowledge-base-archive`,
        },
      );
      if (archiveAttachment.temporary) {
        temporaryFiles.push(archiveAttachment.localAssetId);
      }
      const forecastPromptInput = {
        currentAssessmentFilename:
          assessmentFile.filename || assessmentFilename,
        knowledgeBaseArchiveFilename: archiveAttachment.filename,
        executionScenarioFilename: scenarioFile.filename || scenarioFilename,
        scenarioName: "full_execution" as const,
        brandMentionRateObservation:
          scoredAssessment.question.category === "industry_ranking" &&
          monitorRun
            ? monitorBrandMentionRate(monitorRun)
            : undefined,
        retryReason,
      };
      const created = await createGeoTaskWithSkillPackages(
        broker,
        {
          projectId: value.projectId,
          prompt:
            await buildOptimizationOutcomeForecastPrompt(forecastPromptInput),
          localAssets: [
            {
              localAssetId: archiveAttachment.localAssetId,
              filename: archiveAttachment.filename,
            },
            {
              localAssetId: assessmentFile.localAssetId,
              filename: assessmentFile.filename || assessmentFilename,
            },
            {
              localAssetId: scenarioFile.localAssetId,
              filename: scenarioFile.filename || scenarioFilename,
            },
          ],
          idempotencyKey: forecastTaskOperationKey,
          contract: PRESALES_CONTRACTS.optimizationForecast,
        },
        [
          {
            filename: FORECAST_SKILL_ARCHIVE_FILENAME,
            body: await buildGeoOptimizationOutcomeForecasterSkillArchive(),
          },
          {
            filename: FORECAST_OUTPUT_TEMPLATE_FILENAME,
            body: await buildGeoOptimizationOutcomeForecastTemplate(),
            mimeType: "application/json",
          },
          buildOptimizationOutcomeForecastTaskInput(forecastPromptInput),
        ],
      );
      temporaryFiles.push(
        ...created.skillAttachments.map((item) => item.localAssetId),
      );
      const forecastTaskId = taskIdFrom(created.task);
      if (!forecastTaskId) {
        throw new GeoHttpError(
          "创建优化效果评估任务失败：缺少任务 ID",
          502,
          "TASK_ID_MISSING",
        );
      }
      const submittedAt = new Date().toISOString();
      return {
        task: created.task,
        value: {
          ...value,
          ...(perspective === "industry_ranking"
            ? {
                industryRankingOptimizationForecastTaskId: forecastTaskId,
                industryRankingOptimizationForecastSubmittedAt: submittedAt,
                industryRankingOptimizationForecastAttempt:
                  value.industryRankingOptimizationForecastAttempt || 1,
                industryRankingOptimizationForecastVersion: 2 as const,
              }
            : {
                optimizationForecastTaskId: forecastTaskId,
                optimizationForecastSubmittedAt: submittedAt,
                optimizationForecastAttempt:
                  value.optimizationForecastAttempt || 1,
                optimizationForecastVersion: 2 as const,
              }),
          temporaryFileIds: Array.from(
            new Set([...(value.temporaryFileIds || []), ...temporaryFiles]),
          ),
        },
      };
    } catch (error) {
      if (!shouldRetainGeneratedTaskFilesForReplay(error)) {
        await Promise.allSettled(
          temporaryFiles.map((fileId) => broker.deleteAsset(fileId)),
        );
      }
      throw error;
    }
  };

  router.use(
    "/projects/:projectToken",
    requireConfiguration,
    requireSession,
    asyncHandler(async (req, res, next) => {
      if (req.method === "DELETE") {
        next();
        return;
      }
      const value = openOwnedProject(req, res);
      if (
        (
          await Promise.all([
            monitorFreeReservationStore.isProjectDeletionFenced(
              value.projectId,
            ),
            monitorFreeReservationStore.isProjectDeletionFenced(
              industryRankingReservationProjectId(value.projectId),
            ),
          ])
        ).some(Boolean)
      ) {
        throw new GeoHttpError(
          "该项目已删除，不能继续访问或创建新任务",
          410,
          "PROJECT_DELETED",
        );
      }
      next();
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
        initialAssessmentTask,
        initialOptimizationForecastTask,
        rawIndustryRankingMonitorRun,
        initialIndustryRankingAssessmentTask,
        initialIndustryRankingOptimizationForecastTask,
      ] = await Promise.all([
        getResolvedTask(broker, value.knowledgeBaseTaskId),
        value.questionTaskId
          ? getResolvedQuestionTask(broker, value.questionTaskId)
          : Promise.resolve(undefined),
        value.monitorRunId
          ? getResolvedMonitorRun(
              broker,
              value.monitorRunId,
              monitorRunExpectation(value),
            )
          : Promise.resolve(undefined),
        value.assessmentTaskId
          ? getResolvedTask(broker, value.assessmentTaskId)
          : Promise.resolve(undefined),
        value.optimizationForecastTaskId
          ? getResolvedTask(broker, value.optimizationForecastTaskId)
          : Promise.resolve(undefined),
        value.industryRankingMonitorRunId
          ? getResolvedMonitorRun(
              broker,
              value.industryRankingMonitorRunId,
              monitorRunExpectation(value),
            )
          : Promise.resolve(undefined),
        value.industryRankingAssessmentTaskId
          ? getResolvedTask(broker, value.industryRankingAssessmentTaskId)
          : Promise.resolve(undefined),
        value.industryRankingOptimizationForecastTaskId
          ? getResolvedTask(
              broker,
              value.industryRankingOptimizationForecastTaskId,
            )
          : Promise.resolve(undefined),
      ]);
      const previousFinalFileId = value.knowledgeBaseArtifact?.final.artifactId;
      const finalizedKnowledgeBase = await ensureFinalizedKnowledgeBase(
        trackArchiveFile(value, knowledgeBaseTask),
        knowledgeBaseTask,
      );
      const currentKnowledgeBaseTask = knowledgeBaseTask;
      let currentValue = await resolveCanonicalCompanyIdentity(
        broker,
        finalizedKnowledgeBase.value,
        currentKnowledgeBaseTask,
        { allowInvalidArchiveForProjectView: true },
      );
      currentValue = await syncMonitoringOrder(currentValue, rawMonitorRun);
      currentValue = await syncServiceOrder(currentValue);
      let currentAssessmentTask = initialAssessmentTask;
      let currentOptimizationForecastTask = initialOptimizationForecastTask;
      let currentIndustryRankingAssessmentTask =
        initialIndustryRankingAssessmentTask;
      let currentIndustryRankingOptimizationForecastTask =
        initialIndustryRankingOptimizationForecastTask;
      let currentAssessmentOutputPromise:
        | ReturnType<typeof resolveAssessmentTaskOutput>
        | undefined;
      let currentForecastOutputPromise:
        | ReturnType<typeof resolveOptimizationOutcomeForecastTaskOutput>
        | undefined;
      let currentIndustryRankingAssessmentOutputPromise:
        | ReturnType<typeof resolveAssessmentTaskOutput>
        | undefined;
      let currentIndustryRankingForecastOutputPromise:
        | ReturnType<typeof resolveOptimizationOutcomeForecastTaskOutput>
        | undefined;
      const question =
        initialQuestionTask && currentValue.monitorQuestionId
          ? findOwnedQuestion(
              currentValue,
              parseQuestionSetFromTask(initialQuestionTask)?.questions,
              currentValue.monitorQuestionId,
            )
          : undefined;
      const automationReady = Boolean(
        initialQuestionTask &&
          question &&
          rawMonitorRun?.status === "completed" &&
          rawMonitorRun.records,
      );
      if (automationReady && initialQuestionTask && rawMonitorRun && question) {
        if (
          currentValue.assessmentTaskId &&
          currentValue.assessmentVersion !== 2
        ) {
          const previousAssessmentTaskId = currentValue.assessmentTaskId;
          const previousForecastTaskId =
            currentValue.optimizationForecastTaskId;
          currentValue = {
            ...currentValue,
            assessmentTaskId: undefined,
            assessmentSubmittedAt: undefined,
            assessmentAttempt: 1,
            assessmentVersion: 2,
            assessmentUpgradeFromV1: true,
            optimizationForecastTaskId: undefined,
            optimizationForecastSubmittedAt: undefined,
            optimizationForecastAttempt: 1,
            optimizationForecastVersion: 2,
            previousAssessmentTaskIds: Array.from(
              new Set([
                ...(currentValue.previousAssessmentTaskIds || []),
                previousAssessmentTaskId,
              ]),
            ),
            previousOptimizationForecastTaskIds: previousForecastTaskId
              ? Array.from(
                  new Set([
                    ...(currentValue.previousOptimizationForecastTaskIds || []),
                    previousForecastTaskId,
                  ]),
                )
              : currentValue.previousOptimizationForecastTaskIds,
          };
          currentAssessmentTask = undefined;
          currentOptimizationForecastTask = undefined;
        }

        if (!currentValue.assessmentTaskId) {
          try {
            const created = await createAutomaticAssessmentTask(
              currentValue,
              currentKnowledgeBaseTask,
              initialQuestionTask,
              rawMonitorRun,
            );
            currentValue = created.value;
            currentAssessmentTask = created.task;
          } catch (error) {
            console.warn("[GEO assessment automation] Task start deferred", {
              projectId: currentValue.projectId,
              error:
                error instanceof GeoHttpError
                  ? error.code
                  : error instanceof GeoBrokerError
                    ? error.code
                    : "ASSESSMENT_AUTOMATION_FAILED",
            });
          }
        }

        let scoredAssessment:
          | ReturnType<typeof calculateQuestionBaselineAssessment>
          | undefined;
        if (
          currentAssessmentTask &&
          normalizeTaskStatus(currentAssessmentTask.status) === "completed"
        ) {
          try {
            currentAssessmentOutputPromise ??= parseScopedAssessmentTaskOutput(
              broker,
              currentAssessmentTask,
              question,
              rawMonitorRun.platforms,
              rawMonitorRun,
            );
            scoredAssessment = calculateCompleteAssessment(
              await currentAssessmentOutputPromise,
            );
          } catch {
            scoredAssessment = undefined;
          }
        }

        if (scoredAssessment) {
          let forecastRetryReason: string | undefined;
          if (
            currentValue.optimizationForecastTaskId &&
            currentValue.optimizationForecastVersion !== 2
          ) {
            const previousForecastTaskId =
              currentValue.optimizationForecastTaskId;
            currentValue = {
              ...currentValue,
              optimizationForecastTaskId: undefined,
              optimizationForecastSubmittedAt: undefined,
              optimizationForecastAttempt: 1,
              optimizationForecastVersion: 2,
              previousOptimizationForecastTaskIds: Array.from(
                new Set([
                  ...(currentValue.previousOptimizationForecastTaskIds || []),
                  previousForecastTaskId,
                ]),
              ),
            };
            currentOptimizationForecastTask = undefined;
          }
          if (
            currentValue.optimizationForecastTaskId &&
            currentOptimizationForecastTask
          ) {
            const forecastStatus = normalizeTaskStatus(
              currentOptimizationForecastTask.status,
            );
            if (["failed", "cancelled"].includes(forecastStatus)) {
              forecastRetryReason =
                forecastStatus === "cancelled"
                  ? "上一次优化效果评估任务已取消"
                  : normalizeTask(
                      currentOptimizationForecastTask,
                      "optimization-forecast",
                    ).failure?.code || "上一次优化效果评估任务执行失败";
            } else if (forecastStatus === "completed") {
              try {
                currentForecastOutputPromise ??=
                  resolveOptimizationOutcomeForecastTaskOutput(
                    broker,
                    currentOptimizationForecastTask,
                    {
                      taskId: taskIdFrom(currentOptimizationForecastTask),
                    },
                  );
                calculateCompleteForecast(
                  scoredAssessment,
                  await currentForecastOutputPromise,
                );
              } catch (error) {
                // A completed-but-invalid forecast is displayable as a failed
                // attempt. It is never continued on the same Provider task;
                // an explicit retry creates a fresh task below.
                logAssessmentOutputValidation(
                  error,
                  currentOptimizationForecastTask,
                );
              }
            }
            if (
              forecastRetryReason &&
              (currentValue.optimizationForecastAttempt || 1) < 2
            ) {
              const previousForecastTaskId =
                currentValue.optimizationForecastTaskId;
              currentValue = {
                ...currentValue,
                optimizationForecastTaskId: undefined,
                optimizationForecastSubmittedAt: undefined,
                optimizationForecastAttempt: 2,
                optimizationForecastVersion: 2,
                previousOptimizationForecastTaskIds: Array.from(
                  new Set([
                    ...(currentValue.previousOptimizationForecastTaskIds || []),
                    previousForecastTaskId,
                  ]),
                ),
              };
              currentOptimizationForecastTask = undefined;
              currentForecastOutputPromise = undefined;
            }
          }
          if (!currentValue.optimizationForecastTaskId) {
            try {
              const created = await createAutomaticOptimizationForecastTask(
                currentValue,
                currentKnowledgeBaseTask,
                scoredAssessment,
                forecastRetryReason,
                "product_opinion",
                rawMonitorRun,
              );
              currentValue = created.value;
              currentOptimizationForecastTask = created.task;
              currentForecastOutputPromise = undefined;
            } catch (error) {
              console.warn("[GEO forecast automation] Task start deferred", {
                projectId: currentValue.projectId,
                error:
                  error instanceof GeoHttpError
                    ? error.code
                    : error instanceof GeoBrokerError
                      ? error.code
                      : "FORECAST_AUTOMATION_FAILED",
              });
            }
          }
        }
      }

      const industryRankingQuestion =
        initialQuestionTask && currentValue.industryRankingQuestionId
          ? findOwnedQuestion(
              currentValue,
              parseQuestionSetFromTask(initialQuestionTask)?.questions,
              currentValue.industryRankingQuestionId,
            )
          : undefined;
      const industryAutomationReady = Boolean(
        initialQuestionTask &&
          industryRankingQuestion?.category === "industry_ranking" &&
          rawIndustryRankingMonitorRun?.status === "completed" &&
          rawIndustryRankingMonitorRun.records,
      );
      if (
        industryAutomationReady &&
        initialQuestionTask &&
        rawIndustryRankingMonitorRun &&
        industryRankingQuestion
      ) {
        if (!currentValue.industryRankingAssessmentTaskId) {
          try {
            const created = await createAutomaticAssessmentTask(
              currentValue,
              currentKnowledgeBaseTask,
              initialQuestionTask,
              rawIndustryRankingMonitorRun,
              "industry_ranking",
            );
            currentValue = created.value;
            currentIndustryRankingAssessmentTask = created.task;
          } catch (error) {
            console.warn(
              "[GEO industry ranking assessment automation] Task start deferred",
              {
                projectId: currentValue.projectId,
                error:
                  error instanceof GeoHttpError
                    ? error.code
                    : error instanceof GeoBrokerError
                      ? error.code
                      : "ASSESSMENT_AUTOMATION_FAILED",
              },
            );
          }
        }

        let industryScoredAssessment:
          | ReturnType<typeof calculateQuestionBaselineAssessment>
          | undefined;
        if (
          currentIndustryRankingAssessmentTask &&
          normalizeTaskStatus(currentIndustryRankingAssessmentTask.status) ===
            "completed"
        ) {
          try {
            currentIndustryRankingAssessmentOutputPromise ??=
              parseScopedAssessmentTaskOutput(
                broker,
                currentIndustryRankingAssessmentTask,
                industryRankingQuestion,
                rawIndustryRankingMonitorRun.platforms,
                rawIndustryRankingMonitorRun,
              );
            industryScoredAssessment = calculateCompleteAssessment(
              await currentIndustryRankingAssessmentOutputPromise,
            );
          } catch {
            industryScoredAssessment = undefined;
          }
        }

        if (industryScoredAssessment) {
          let forecastRetryReason: string | undefined;
          if (
            currentValue.industryRankingOptimizationForecastTaskId &&
            currentIndustryRankingOptimizationForecastTask
          ) {
            const forecastStatus = normalizeTaskStatus(
              currentIndustryRankingOptimizationForecastTask.status,
            );
            if (["failed", "cancelled"].includes(forecastStatus)) {
              forecastRetryReason =
                forecastStatus === "cancelled"
                  ? "上一次行业排名优化效果评估任务已取消"
                  : normalizeTask(
                      currentIndustryRankingOptimizationForecastTask,
                      "optimization-forecast",
                    ).failure?.code || "上一次行业排名优化效果评估任务执行失败";
            } else if (forecastStatus === "completed") {
              try {
                currentIndustryRankingForecastOutputPromise ??=
                  resolveOptimizationOutcomeForecastTaskOutput(
                    broker,
                    currentIndustryRankingOptimizationForecastTask,
                    {
                      taskId: taskIdFrom(
                        currentIndustryRankingOptimizationForecastTask,
                      ),
                    },
                  );
                calculateCompleteForecast(
                  industryScoredAssessment,
                  await currentIndustryRankingForecastOutputPromise,
                );
              } catch (error) {
                logAssessmentOutputValidation(
                  error,
                  currentIndustryRankingOptimizationForecastTask,
                );
              }
            }
            if (
              forecastRetryReason &&
              (currentValue.industryRankingOptimizationForecastAttempt || 1) < 2
            ) {
              const previousTaskId =
                currentValue.industryRankingOptimizationForecastTaskId;
              currentValue = {
                ...currentValue,
                industryRankingOptimizationForecastTaskId: undefined,
                industryRankingOptimizationForecastSubmittedAt: undefined,
                industryRankingOptimizationForecastAttempt: 2,
                industryRankingOptimizationForecastVersion: 2,
                previousIndustryRankingOptimizationForecastTaskIds: Array.from(
                  new Set([
                    ...(currentValue.previousIndustryRankingOptimizationForecastTaskIds ||
                      []),
                    previousTaskId,
                  ]),
                ),
              };
              currentIndustryRankingOptimizationForecastTask = undefined;
              currentIndustryRankingForecastOutputPromise = undefined;
            }
          }
          if (!currentValue.industryRankingOptimizationForecastTaskId) {
            try {
              const created = await createAutomaticOptimizationForecastTask(
                currentValue,
                currentKnowledgeBaseTask,
                industryScoredAssessment,
                forecastRetryReason,
                "industry_ranking",
                rawIndustryRankingMonitorRun,
              );
              currentValue = created.value;
              currentIndustryRankingOptimizationForecastTask = created.task;
              currentIndustryRankingForecastOutputPromise = undefined;
            } catch (error) {
              console.warn(
                "[GEO industry ranking forecast automation] Task start deferred",
                {
                  projectId: currentValue.projectId,
                  error:
                    error instanceof GeoHttpError
                      ? error.code
                      : error instanceof GeoBrokerError
                        ? error.code
                        : "FORECAST_AUTOMATION_FAILED",
                },
              );
            }
          }
        }
      }
      let currentToken: string;
      try {
        currentToken =
          currentValue === value
            ? req.params.projectToken
            : codec.seal("project", currentValue, PROJECT_TTL_MS);
      } catch (error) {
        const currentFinalFileId =
          currentValue.knowledgeBaseArtifact?.final.artifactId;
        if (currentFinalFileId && currentFinalFileId !== previousFinalFileId) {
          await broker.deleteAsset(currentFinalFileId).catch(() => undefined);
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
        currentAssessmentTask,
        currentOptimizationForecastTask,
        {
          assessment: currentAssessmentOutputPromise,
          forecast: currentForecastOutputPromise,
        },
        rawIndustryRankingMonitorRun,
        currentIndustryRankingAssessmentTask,
        currentIndustryRankingOptimizationForecastTask,
        {
          assessment: currentIndustryRankingAssessmentOutputPromise,
          forecast: currentIndustryRankingForecastOutputPromise,
        },
      );
      res.json({ projectToken: currentToken, project });
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
        const previousQuestionTaskId = value.questionTaskId;
        const [knowledgeBaseTask, questionTask] = await Promise.all([
          getResolvedTask(broker, value.knowledgeBaseTaskId),
          getResolvedQuestionTask(broker, value.questionTaskId),
        ]);
        const currentValue = trackArchiveFile(value, knowledgeBaseTask);
        const questionStatus = normalizeTaskStatus(questionTask.status);
        const retryWithFreshTask =
          ["failed", "cancelled"].includes(questionStatus) ||
          (questionStatus === "completed" &&
            !parseQuestionSetFromTask(questionTask)?.questions.length);
        if (!retryWithFreshTask) {
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
        value = {
          ...currentValue,
          questionTaskId: undefined,
          questionSubmittedAt: undefined,
          previousQuestionTaskIds: Array.from(
            new Set([
              ...(currentValue.previousQuestionTaskIds || []),
              previousQuestionTaskId,
            ]),
          ),
        };
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
          "企业知识库生成结果未通过校验，请联系技术支持",
          409,
          "KNOWLEDGE_BASE_VALIDATION_FAILED",
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
      const archiveAttachment = await (async () => {
        try {
          return await materializeArchiveAttachment(
            broker,
            trackedValue.knowledgeBaseTaskId,
            archive,
            {
              projectId: trackedValue.projectId,
              idempotencyKey: `geo:${trackedValue.projectId}:questions:1:knowledge-base-archive`,
            },
          );
        } catch (error) {
          throw mapGeoQuestionBrokerContractError(error);
        }
      })();
      const questionPromptInput = {
        companyName: trackedValue.companyName,
        archiveFilename: archiveAttachment.filename,
      };
      const questionAttempt =
        (trackedValue.previousQuestionTaskIds?.length || 0) + 1;
      const { task: questionTask, skillAttachments } = await (async () => {
        try {
          return await createGeoTaskWithSkillPackages(
            broker,
            {
              projectId: trackedValue.projectId,
              prompt: await buildGeoQuestionPrompt(questionPromptInput),
              localAssets: [archiveAttachment],
              idempotencyKey: `geo:${trackedValue.projectId}:questions:${questionAttempt}`,
              contract: PRESALES_CONTRACTS.questionRecommendation,
            },
            [
              {
                filename: QUESTION_SKILL_ARCHIVE_FILENAME,
                body: await buildGeoQuestionRecommenderSkillArchive(),
              },
              buildGeoQuestionTaskInput(questionPromptInput),
            ],
          );
        } catch (error) {
          throw mapGeoQuestionBrokerContractError(error);
        }
      })();
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
            ...skillAttachments.map((item) => item.localAssetId),
            ...(archiveAttachment.temporary
              ? [archiveAttachment.localAssetId]
              : []),
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

  const sendCustomQuestionValidationObservation = async (input: {
    res: Response;
    projectToken: string;
    value: ProjectTokenValue;
    context?: {
      trackedValue: ProjectTokenValue;
      knowledgeBaseTask: BrokerTask;
      questionTask: BrokerTask;
    };
    record: GeoCustomQuestionValidationRecord;
    completedStatus?: number;
  }) => {
    const isExistingRecommendedQuestion =
      input.record.state === "completed" &&
      input.record.completionMode === "existing_recommended_question";
    const validation = {
      schemaVersion: 1,
      clientRequestId: input.record.clientRequestId,
      question: input.record.question,
      state: input.record.state,
      acknowledgement: isExistingRecommendedQuestion
        ? ("not_required" as const)
        : ("required" as const),
      completionMode: isExistingRecommendedQuestion
        ? ("existing_recommended_question" as const)
        : ("reservation" as const),
      nextPollMs: CUSTOM_QUESTION_CLASSIFIER_CLIENT_POLL_MS,
      ...(input.record.lastTransientError
        ? { notice: "问题验证仍在恢复中，系统将继续查询同一任务。" }
        : {}),
      ...(input.record.error ? { error: input.record.error } : {}),
    };
    if (input.record.state === "completed" && input.record.result) {
      // Pending and rejected observations are fully described by the durable
      // reservation. Only a successful result needs the heavier project view.
      // Deferring these reads prevents every 1.5-second status poll from
      // reloading the knowledge-base and recommendation task results.
      const context =
        input.context ?? (await loadCustomQuestionContext(input.value));
      const nextValue: ProjectTokenValue = isExistingRecommendedQuestion
        ? context.trackedValue
        : {
            ...context.trackedValue,
            customQuestion: input.record.result,
          };
      const projectToken = isExistingRecommendedQuestion
        ? input.projectToken
        : codec.seal("project", nextValue, PROJECT_TTL_MS);
      const project = await buildProjectView(
        broker,
        nextValue,
        projectToken,
        context.knowledgeBaseTask,
        context.questionTask,
      );
      input.res.status(input.completedStatus ?? 200).json({
        validation,
        projectToken,
        question: publicGeoQuestion(input.record.result),
        project,
      });
      return;
    }
    if (
      input.record.error &&
      isTerminalCustomQuestionValidation(input.record)
    ) {
      input.res.status(input.record.error.status).json({
        ok: false,
        validation,
        error: {
          code: input.record.error.code,
          message: input.record.error.message,
        },
      });
      return;
    }
    input.res.status(202).json({ validation });
  };

  const loadCustomQuestionContext = async (value: ProjectTokenValue) => {
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
      getResolvedQuestionTask(broker, value.questionTaskId),
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
    return {
      knowledgeBaseTask,
      questionTask,
      trackedValue,
      generatedQuestions,
    };
  };

  // Self-service custom-question endpoints are retired. Historical project
  // tokens remain readable, but no mutation, polling, retry, or ACK route is
  // registered and the legacy reservation directory is never consulted.
  router.post(
    "/projects/:projectToken/payments",
    requireConfiguration,
    requireSession,
    asyncHandler(async (req, res) => {
      openOwnedProject(req, res);
      throw new GeoHttpError(
        "问题监控现已免费，请直接获取监控答案",
        410,
        "MONITORING_PAYMENT_RETIRED",
      );
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
      const expectedAmountFen = geoMonitoringPriceFen(
        input.monitoringEdition,
        platformIds,
      );
      if (expectedAmountFen === undefined) {
        throw new GeoHttpError(
          "监控版本与平台范围不匹配",
          400,
          "MONITOR_SCOPE_INVALID",
        );
      }
      const payment = await paymentGateway.getStatus({
        authorization: input.authorization,
        ownerSessionId: String(res.locals.geoSessionId || ""),
        projectId: value.projectId,
        questionId: input.questionId,
        platformIds,
        monitoringEdition: input.monitoringEdition,
        expectedAmountFen,
      });
      if (payment.status === "paid" || payment.status === "review_required") {
        const authorizationDigest = sha256(input.authorization);
        const projectOrders = await readProjectOrders(value.projectId);
        const matchingOrder = projectOrders.orders.find(
          (order) =>
            order.purchaseType === "monitoring" &&
            order.orderId === payment.orderId &&
            safeSecretEqual(order.authorizationDigest, authorizationDigest),
        );
        if (matchingOrder?.state === "closed") {
          await transitionProjectOrder(
            value.projectId,
            matchingOrder.orderId,
            "review_required",
            { paidAt: payment.paidAt },
          );
          throw new GeoHttpError(
            "旧版监控订单关闭后收到付款结果，需要人工退款复核",
            409,
            "LEGACY_MONITOR_LATE_PAYMENT_REVIEW_REQUIRED",
          );
        }
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
    "/projects/:projectToken/payments/switch",
    requireConfiguration,
    requireSession,
    asyncHandler(async (req, res) => {
      openOwnedProject(req, res);
      throw new GeoHttpError(
        "问题监控现已免费，请直接获取监控答案",
        410,
        "MONITORING_PAYMENT_RETIRED",
      );
    }),
  );

  router.get(
    "/projects/:projectToken/monitoring/regions",
    requireConfiguration,
    requireSession,
    asyncHandler(async (req, res) => {
      openOwnedProject(req, res);
      const edition =
        req.query.edition === "overseas"
          ? ("overseas" as const)
          : req.query.edition === "domestic"
            ? ("domestic" as const)
            : undefined;
      if (!edition) {
        throw new GeoHttpError(
          "请选择国内版或海外版后再加载监控地区",
          400,
          "REGION_EDITION_REQUIRED",
        );
      }
      let catalog: Awaited<ReturnType<typeof broker.getMonitorRegions>>;
      try {
        catalog = await broker.getMonitorRegions(edition);
      } catch (error) {
        throw new GeoHttpError(
          "监控地区列表暂不可用，请稍后重试",
          503,
          error instanceof GeoBrokerError
            ? error.code
            : "REGION_CATALOG_UNAVAILABLE",
        );
      }
      if (catalog.edition !== edition || !Array.isArray(catalog.regions)) {
        throw new GeoHttpError(
          "监控地区列表与当前版本不匹配",
          502,
          "REGION_CATALOG_INVALID",
        );
      }
      const seen = new Set<string>();
      const regions = catalog.regions.flatMap((region) => {
        const code = typeof region.code === "string" ? region.code.trim() : "";
        const label =
          typeof region.label === "string" ? region.label.trim() : "";
        if (
          !code ||
          !label ||
          code.length > 64 ||
          label.length > 100 ||
          seen.has(code)
        ) {
          return [];
        }
        seen.add(code);
        return [{ code, label }];
      });
      res.setHeader("Cache-Control", "no-store");
      res.json({ catalog: { edition, regions } });
    }),
  );

  router.get(
    [
      "/projects/:projectToken/monitoring/records/:recordId/screenshot",
      "/projects/:projectToken/monitoring/:perspective(product-opinion|industry-ranking)/records/:recordId/screenshot",
    ],
    requireConfiguration,
    requireSession,
    requireSessionRate("monitor-screenshot", 60),
    asyncHandler(async (req, res, next) => {
      const value = openOwnedProject(req, res);
      const perspective =
        req.params.perspective === "industry-ranking"
          ? "industry-ranking"
          : "product-opinion";
      const monitorRunId =
        perspective === "industry-ranking"
          ? value.industryRankingMonitorRunId
          : value.monitorRunId;
      if (!monitorRunId || !value.monitorScreenshotEnabled) {
        throw new GeoHttpError(
          "当前监控任务没有可查看的页面截图",
          404,
          "MONITOR_SCREENSHOT_NOT_FOUND",
        );
      }
      const recordId = String(req.params.recordId || "");
      const run = await getResolvedMonitorRun(
        broker,
        monitorRunId,
        monitorRunExpectation(value),
      );
      const record = run.records?.find(
        (candidate) => candidate.recordId === recordId,
      );
      if (!record?.screenshotAvailable) {
        throw new GeoHttpError(
          "当前回答没有可查看的页面截图",
          404,
          "MONITOR_SCREENSHOT_NOT_FOUND",
        );
      }

      let upstream: Awaited<
        ReturnType<typeof broker.downloadMonitorScreenshot>
      >;
      try {
        upstream = await broker.downloadMonitorScreenshot(
          monitorRunId,
          recordId,
        );
      } catch (error) {
        if (
          error instanceof GeoBrokerError &&
          [404, 410].includes(error.status)
        ) {
          throw new GeoHttpError(
            "页面截图已失效，请返回监控结果继续查看文字内容",
            404,
            "MONITOR_SCREENSHOT_EXPIRED",
          );
        }
        throw new GeoHttpError(
          "页面截图暂时无法读取，请稍后重试",
          502,
          "MONITOR_SCREENSHOT_UNAVAILABLE",
        );
      }

      try {
        assertResponseLengthWithinLimit(upstream, MAX_MONITOR_SCREENSHOT_BYTES);
      } catch (error) {
        if (upstream.body) {
          await upstream.body.cancel().catch(() => undefined);
        }
        if (error instanceof GeoByteLimitError) {
          throw new GeoHttpError(
            "页面截图超过可查看的大小上限",
            413,
            "MONITOR_SCREENSHOT_TOO_LARGE",
          );
        }
        throw error;
      }
      const contentType = (upstream.headers.get("content-type") || "")
        .split(";", 1)[0]
        .trim()
        .toLowerCase();
      if (!MONITOR_SCREENSHOT_CONTENT_TYPES.has(contentType)) {
        if (upstream.body) {
          await upstream.body.cancel().catch(() => undefined);
        }
        throw new GeoHttpError(
          "页面截图格式无法识别",
          502,
          "MONITOR_SCREENSHOT_INVALID_RESPONSE",
        );
      }
      if (!upstream.body) {
        throw new GeoHttpError(
          "页面截图暂时无法读取，请稍后重试",
          502,
          "MONITOR_SCREENSHOT_INVALID_RESPONSE",
        );
      }

      res.status(200);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      const length = upstream.headers.get("content-length");
      if (
        length &&
        /^\d+$/.test(length) &&
        Number(length) <= MAX_MONITOR_SCREENSHOT_BYTES
      ) {
        res.setHeader("Content-Length", length);
      }
      const stream = Readable.fromWeb(upstream.body as never);
      const limiter = createByteLimitTransform(MAX_MONITOR_SCREENSHOT_BYTES);
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

  router.post(
    "/projects/:projectToken/monitoring",
    requireConfiguration,
    requireSession,
    asyncHandler(async (req, res) => {
      const value = openOwnedProject(req, res);
      const input = StartMonitoringRequestSchema.parse(req.body);
      if ("schemaVersion" in input && input.schemaVersion === 2) {
        const requestedPlatforms = input.platformIds as GeoMonitorPlatformId[];
        const sortedPlatforms = [...requestedPlatforms].sort();
        const requestedIndustryRankingQuestionId =
          input.industryRankingQuestionId?.trim();
        const requestedRegionCode = input.regionCode?.trim();
        const requestedScreenshotEnabled = input.screenshotEnabled === true;
        const scopeHash = crypto
          .createHash("sha256")
          .update(
            JSON.stringify({
              projectId: value.projectId,
              knowledgeBaseTaskId: value.knowledgeBaseTaskId,
              questionId: input.questionId,
              ...(requestedIndustryRankingQuestionId
                ? {
                    industryRankingQuestionId:
                      requestedIndustryRankingQuestionId,
                  }
                : {}),
              monitoringEdition: input.monitoringEdition,
              platformIds: sortedPlatforms,
              ...(requestedRegionCode
                ? { regionCode: requestedRegionCode }
                : {}),
              ...(requestedScreenshotEnabled
                ? { screenshotEnabled: true }
                : {}),
            }),
          )
          .digest("hex");
        const idempotencyKey = `geo-monitor-free:v2:${scopeHash}`;

        if (value.monitorRunId) {
          if (
            value.monitorQuestionId !== input.questionId ||
            (requestedIndustryRankingQuestionId &&
              value.industryRankingQuestionId &&
              value.industryRankingQuestionId !==
                requestedIndustryRankingQuestionId) ||
            normalizedGeoMonitoringEdition(value.monitoringEdition) !==
              input.monitoringEdition ||
            (value.monitorRegion?.code ?? undefined) !== requestedRegionCode ||
            Boolean(value.monitorScreenshotEnabled) !==
              requestedScreenshotEnabled ||
            !sameStringSet(value.monitorPlatformIds || [], requestedPlatforms)
          ) {
            throw new GeoHttpError(
              "该项目已有一项不同范围的监控任务",
              409,
              "MONITOR_SCOPE_CONFLICT",
            );
          }
          const run = await getResolvedMonitorRun(
            broker,
            value.monitorRunId,
            monitorRunExpectation(value, requestedPlatforms),
          );
          const [knowledgeBaseTask, questionTask] = await Promise.all([
            getResolvedTask(broker, value.knowledgeBaseTaskId),
            value.questionTaskId
              ? getResolvedQuestionTask(broker, value.questionTaskId)
              : Promise.resolve(undefined),
          ]);
          let nextValue = value;
          let industryRankingRun: BrokerMonitorRun | undefined;
          if (requestedIndustryRankingQuestionId) {
            const resolvedIndustryQuestion = await resolveMonitorQuestion(
              value,
              requestedIndustryRankingQuestionId,
              "industry_ranking",
            );
            const translatedIndustryQuestion =
              await resolveMonitorQuestionForEdition(
                broker,
                value,
                resolvedIndustryQuestion.question,
                input.monitoringEdition,
                {
                  waitMs: monitorQuestionTranslationWaitMs,
                  pollMs: monitorQuestionTranslationPollMs,
                },
              );
            const ensuredIndustryRun = await ensureIndustryRankingMonitorRun({
              value,
              clientRequestId: input.clientRequestId,
              question: resolvedIndustryQuestion.question,
              monitorQuestion: translatedIndustryQuestion,
              platforms: requestedPlatforms,
              monitoringEdition: input.monitoringEdition,
              regionCode: requestedRegionCode,
              screenshotEnabled: requestedScreenshotEnabled,
            });
            if (ensuredIndustryRun.state === "processing") {
              const projectToken = codec.seal(
                "project",
                {
                  ...value,
                  industryRankingQuestionId: requestedIndustryRankingQuestionId,
                  industryRankingMonitorFreeReservation: {
                    schemaVersion: 2,
                    clientRequestId:
                      ensuredIndustryRun.reservation.clientRequestId,
                    scopeHash: ensuredIndustryRun.scopeHash,
                    createdAt: ensuredIndustryRun.reservation.createdAt,
                    monitoringEdition: input.monitoringEdition,
                    ...(requestedRegionCode
                      ? { regionCode: requestedRegionCode }
                      : {}),
                    ...(requestedScreenshotEnabled
                      ? { screenshotEnabled: true }
                      : {}),
                  },
                },
                PROJECT_TTL_MS,
              );
              res.setHeader("Retry-After", "3");
              res.status(202).json({
                state: "processing",
                retryAfterMs: 3_000,
                clientRequestId: input.clientRequestId,
                projectToken,
              });
              return;
            }
            industryRankingRun = ensuredIndustryRun.run;
            nextValue = {
              ...value,
              industryRankingQuestionId: requestedIndustryRankingQuestionId,
              industryRankingMonitorRunId: industryRankingRun.runId,
              industryRankingMonitorFreeReservation: undefined,
            };
          }
          const nextProjectToken =
            nextValue === value
              ? req.params.projectToken
              : codec.seal("project", nextValue, PROJECT_TTL_MS);
          const project = await buildProjectView(
            broker,
            nextValue,
            nextProjectToken,
            knowledgeBaseTask,
            questionTask,
            run,
            undefined,
            undefined,
            undefined,
            industryRankingRun,
          );
          res.status(200).json({
            state: "started",
            replayed: true,
            projectToken: nextProjectToken,
            project,
          });
          return;
        }

        let resolvedRegion: ProjectTokenValue["monitorRegion"];

        const now = Date.now();
        pruneExpiringMap(freeMonitoringStarts, now, 20_000);
        let durableReservation: GeoMonitorFreeReservationRecord;
        let reservationCreated = false;
        try {
          const reserved = await monitorFreeReservationStore.reserve({
            projectId: value.projectId,
            scopeHash,
            clientRequestId: input.clientRequestId,
            idempotencyKey,
          });
          durableReservation = reserved.record;
          reservationCreated = reserved.created;
          if (reservationCreated) {
            try {
              consumeSessionRate(res, "monitor-free-create", 6);
              consumeIdentityRate(req, "monitor-free-create", 6);
            } catch (error) {
              await monitorFreeReservationStore.releasePristine({
                projectId: value.projectId,
                scopeHash,
                idempotencyKey,
              });
              throw error;
            }
          } else {
            consumeSessionRate(
              res,
              "monitor-free-recovery",
              FREE_MONITOR_RECOVERY_RATE_LIMIT,
              1,
              FREE_MONITOR_RECOVERY_RATE_WINDOW_MS,
            );
            consumeIdentityRate(
              req,
              "monitor-free-recovery",
              FREE_MONITOR_RECOVERY_RATE_LIMIT,
              1,
              FREE_MONITOR_RECOVERY_RATE_WINDOW_MS,
            );
          }
        } catch (error) {
          if (
            error instanceof GeoMonitorFreeReservationStoreError &&
            error.code === "SCOPE_CONFLICT"
          ) {
            throw new GeoHttpError(
              error.message,
              409,
              "MONITOR_SCOPE_CONFLICT",
            );
          }
          if (
            error instanceof GeoMonitorFreeReservationStoreError &&
            error.code === "CLIENT_REQUEST_CONFLICT"
          ) {
            throw new GeoHttpError(
              error.message,
              409,
              "MONITOR_CLIENT_REQUEST_CONFLICT",
            );
          }
          throw error;
        }
        let freeStart = freeMonitoringStarts.get(value.projectId);
        if (freeStart && freeStart.scopeHash !== scopeHash) {
          throw new GeoHttpError(
            "该项目已有一项不同范围的监控任务",
            409,
            "MONITOR_SCOPE_CONFLICT",
          );
        }
        if (
          freeStart &&
          freeStart.clientRequestId !== durableReservation.clientRequestId
        ) {
          throw new GeoHttpError(
            "免费监控进程状态与持久 reservation 不一致",
            503,
            "MONITOR_RESERVATION_STATE_CONFLICT",
          );
        }
        const recovering = !reservationCreated;
        if (!freeStart) {
          freeStart = {
            clientRequestId: durableReservation.clientRequestId,
            scopeHash: durableReservation.scopeHash,
            idempotencyKey: durableReservation.idempotencyKey,
            expiresAt: now + FREE_MONITOR_START_FLIGHT_TTL_MS,
          };
          freeMonitoringStarts.set(value.projectId, freeStart);
        }

        const clearLocalFreeStart = () => {
          if (freeMonitoringStarts.get(value.projectId) === freeStart) {
            freeMonitoringStarts.delete(value.projectId);
          }
        };

        const releasePristineFreeStart = async () => {
          clearLocalFreeStart();
          return monitorFreeReservationStore.releasePristine({
            projectId: value.projectId,
            scopeHash,
            idempotencyKey,
          });
        };

        const createRecoveryProjectToken = () =>
          codec.seal(
            "project",
            {
              ...value,
              ...(requestedIndustryRankingQuestionId
                ? {
                    industryRankingQuestionId:
                      requestedIndustryRankingQuestionId,
                  }
                : {}),
              monitorFreeReservation: {
                schemaVersion: 2 as const,
                clientRequestId: durableReservation.clientRequestId,
                scopeHash: durableReservation.scopeHash,
                createdAt: durableReservation.createdAt,
                monitoringEdition: input.monitoringEdition,
                ...(requestedRegionCode
                  ? { regionCode: requestedRegionCode }
                  : {}),
                ...(requestedScreenshotEnabled
                  ? { screenshotEnabled: true }
                  : {}),
              },
              ...(resolvedRegion ? { monitorRegion: resolvedRegion } : {}),
              ...(requestedScreenshotEnabled
                ? { monitorScreenshotEnabled: true }
                : {}),
            },
            PROJECT_TTL_MS,
          );

        const sendProcessing = () => {
          const projectToken = createRecoveryProjectToken();
          res.setHeader("Retry-After", "3");
          res.status(202).json({
            state: "processing",
            retryAfterMs: 3_000,
            clientRequestId: durableReservation.clientRequestId,
            projectToken,
          });
        };

        const projectOrders = await readProjectOrders(value.projectId);
        const monitoringOrders = projectOrders.orders.filter(
          (order) => order.purchaseType === "monitoring",
        );
        const activeLegacyOrders = monitoringOrders.filter((order) =>
          [
            "pending",
            "paid",
            "fulfilling",
            "fulfilled",
            "review_required",
            "terminal_failed",
          ].includes(order.state),
        );
        if (activeLegacyOrders.length > 1) {
          await releasePristineFreeStart();
          throw new GeoHttpError(
            "检测到多个旧版监控订单，请保留原记录并联系技术支持",
            409,
            "LEGACY_MONITOR_PAYMENT_RECOVERY_REQUIRED",
          );
        }
        const activeLegacyOrder = activeLegacyOrders[0];
        let legacyOrder: GeoProjectOrder | undefined;
        if (input.legacyPaymentAuthorization) {
          const authorizationDigest = sha256(input.legacyPaymentAuthorization);
          legacyOrder = monitoringOrders.find((order) =>
            safeSecretEqual(order.authorizationDigest, authorizationDigest),
          );
          if (!legacyOrder) {
            await releasePristineFreeStart();
            throw new GeoHttpError(
              "无法核对旧版监控订单，请保留记录并联系技术支持",
              409,
              "LEGACY_MONITOR_PAYMENT_RECOVERY_REQUIRED",
            );
          }
          if (
            activeLegacyOrder &&
            activeLegacyOrder.orderId !== legacyOrder.orderId
          ) {
            await releasePristineFreeStart();
            throw new GeoHttpError(
              "旧版监控订单与当前未决订单不一致，请保留记录并联系技术支持",
              409,
              "LEGACY_MONITOR_PAYMENT_RECOVERY_REQUIRED",
            );
          }
          if (legacyOrder.state === "terminal_failed") {
            await releasePristineFreeStart();
            throw new GeoHttpError(
              "旧版监控任务已确定失败，不能自动创建新的监控任务",
              409,
              "LEGACY_MONITOR_TERMINAL_FAILED",
            );
          }
          const expectedAmountFen = geoMonitoringPriceFen(
            input.monitoringEdition,
            requestedPlatforms,
          );
          if (expectedAmountFen === undefined) {
            await releasePristineFreeStart();
            throw new GeoHttpError(
              "监控版本与平台范围不匹配",
              400,
              "MONITOR_SCOPE_INVALID",
            );
          }
          let paymentStatus: Awaited<
            ReturnType<GeoPaymentGateway["getStatus"]>
          >;
          try {
            paymentStatus = await paymentGateway.getStatus({
              authorization: input.legacyPaymentAuthorization,
              projectId: value.projectId,
              ownerSessionId: String(res.locals.geoSessionId || ""),
              questionId: input.questionId,
              platformIds: requestedPlatforms,
              monitoringEdition: input.monitoringEdition,
              expectedAmountFen,
            });
          } catch (error) {
            if (
              error instanceof GeoPaymentVerificationError &&
              error.status < 500
            ) {
              await releasePristineFreeStart();
            }
            throw error;
          }
          if (
            paymentStatus.orderId !== legacyOrder.orderId ||
            paymentStatus.amountFen !== legacyOrder.amountFen
          ) {
            await releasePristineFreeStart();
            throw new GeoHttpError(
              "旧版监控订单与当前范围不匹配",
              409,
              "PAYMENT_SCOPE_MISMATCH",
            );
          }
          if (legacyOrder.state === "closed") {
            if (paymentStatus.status !== "pending") {
              await transitionProjectOrder(
                value.projectId,
                legacyOrder.orderId,
                "review_required",
                { paidAt: paymentStatus.paidAt },
              );
              await releasePristineFreeStart();
              throw new GeoHttpError(
                "旧版监控订单在免费切换后收到付款结果，需要人工退款复核",
                409,
                "LEGACY_MONITOR_LATE_PAYMENT_REVIEW_REQUIRED",
              );
            }
            legacyOrder = undefined;
          } else if (paymentStatus.status === "pending") {
            if (legacyOrder.state === "pending") {
              await transitionProjectOrder(
                value.projectId,
                legacyOrder.orderId,
                "closed",
              );
              legacyOrder = undefined;
            }
          } else {
            legacyOrder = await transitionProjectOrder(
              value.projectId,
              legacyOrder.orderId,
              paymentStatus.status === "review_required"
                ? "review_required"
                : "paid",
              { paidAt: paymentStatus.paidAt },
            );
          }
        } else if (activeLegacyOrder) {
          await releasePristineFreeStart();
          throw new GeoHttpError(
            "检测到旧版监控订单，请从原页面记录继续恢复",
            409,
            "LEGACY_MONITOR_PAYMENT_RECOVERY_REQUIRED",
          );
        }

        let resolvedQuestion: Awaited<
          ReturnType<typeof resolveMonitorQuestion>
        >;
        let resolvedIndustryRankingQuestion:
          | Awaited<ReturnType<typeof resolveMonitorQuestion>>
          | undefined;
        try {
          resolvedQuestion = await resolveMonitorQuestion(
            value,
            input.questionId,
          );
          resolvedIndustryRankingQuestion = requestedIndustryRankingQuestionId
            ? await resolveMonitorQuestion(
                value,
                requestedIndustryRankingQuestionId,
                "industry_ranking",
              )
            : undefined;
        } catch (error) {
          if (error instanceof GeoHttpError && error.status < 500) {
            await releasePristineFreeStart();
          }
          throw error;
        }
        const { knowledgeBaseTask, questionTask, question } = resolvedQuestion;
        await assertMonitorProviderReady();
        let monitorQuestion: string;
        let industryRankingMonitorQuestion: string | undefined;
        try {
          monitorQuestion = await resolveMonitorQuestionForEdition(
            broker,
            value,
            question,
            input.monitoringEdition,
            {
              waitMs: monitorQuestionTranslationWaitMs,
              pollMs: monitorQuestionTranslationPollMs,
            },
          );
          industryRankingMonitorQuestion = resolvedIndustryRankingQuestion
            ? await resolveMonitorQuestionForEdition(
                broker,
                value,
                resolvedIndustryRankingQuestion.question,
                input.monitoringEdition,
                {
                  waitMs: monitorQuestionTranslationWaitMs,
                  pollMs: monitorQuestionTranslationPollMs,
                },
              )
            : undefined;
        } catch (error) {
          if (
            error instanceof GeoHttpError &&
            error.code === "QUESTION_TRANSLATION_PENDING"
          ) {
            sendProcessing();
            return;
          }
          if (
            error instanceof GeoHttpError &&
            error.code === "QUESTION_TRANSLATION_FAILED"
          ) {
            await releasePristineFreeStart();
          }
          throw error;
        }

        const submissionKey = legacyOrder
          ? `geo-monitor:${crypto
              .createHash("sha256")
              .update(
                JSON.stringify({
                  projectId: value.projectId,
                  orderId: legacyOrder.orderId,
                  questionId: question.id,
                  monitoringEdition: input.monitoringEdition,
                  question: monitorQuestion,
                  platforms: sortedPlatforms,
                  ...(requestedRegionCode
                    ? { regionCode: requestedRegionCode }
                    : {}),
                  ...(requestedScreenshotEnabled
                    ? { screenshotEnabled: true }
                    : {}),
                }),
              )
              .digest("hex")}`
          : idempotencyKey;
        let run: BrokerMonitorRun;
        if (durableReservation.runId) {
          run = await getResolvedMonitorRun(broker, durableReservation.runId, {
            question: monitorQuestion,
            platforms: requestedPlatforms,
          });
        } else {
          durableReservation = await monitorFreeReservationStore.markSubmitting(
            {
              projectId: value.projectId,
              scopeHash,
              idempotencyKey,
              submissionKey,
            },
          );
          const durableSubmissionKey = durableReservation.submissionKey;
          if (!durableSubmissionKey) {
            throw new GeoMonitorFreeReservationStoreError(
              "STORE_CORRUPT",
              "免费监控 reservation 缺少 provider submission identity",
            );
          }
          if (freeStart.run) {
            run = freeStart.run;
          } else {
            if (!freeStart.promise) {
              freeStart.promise = broker
                .createMonitorRun({
                  projectId: value.projectId,
                  question: monitorQuestion,
                  platforms: requestedPlatforms,
                  idempotencyKey: durableSubmissionKey,
                  monitorKeyword: value.companyName,
                  ...(requestedScreenshotEnabled ? { screenshot: 1 } : {}),
                  ...(requestedRegionCode
                    ? {
                        region: {
                          scope: input.monitoringEdition,
                          code: requestedRegionCode,
                        },
                      }
                    : {}),
                })
                .then((candidate) =>
                  normalizeMonitorRun(candidate, {
                    question: monitorQuestion,
                    platforms: requestedPlatforms,
                  }),
                );
            }
            try {
              run = await freeStart.promise;
              freeStart.run = run;
            } catch (error) {
              freeStart.promise = undefined;
              if (
                error instanceof GeoBrokerError &&
                error.code === "MONITOR_SUBMISSION_UNKNOWN"
              ) {
                sendProcessing();
                return;
              }
              if (
                error instanceof GeoBrokerError &&
                error.code === "REGION_UNAVAILABLE"
              ) {
                clearLocalFreeStart();
                await monitorFreeReservationStore.releaseConfirmedRejected({
                  projectId: value.projectId,
                  scopeHash,
                  idempotencyKey,
                  submissionKey: durableSubmissionKey,
                });
                throw new GeoHttpError(
                  "所选监控地区已不可用，请刷新列表后重新选择",
                  422,
                  "REGION_UNAVAILABLE",
                );
              }
              if (
                error instanceof GeoBrokerError &&
                error.code === "MONITOR_SUBMISSION_REJECTED"
              ) {
                clearLocalFreeStart();
                await monitorFreeReservationStore.releaseConfirmedRejected({
                  projectId: value.projectId,
                  scopeHash,
                  idempotencyKey,
                  submissionKey: durableSubmissionKey,
                });
                if (legacyOrder) {
                  await transitionProjectOrder(
                    value.projectId,
                    legacyOrder.orderId,
                    "review_required",
                    { paidAt: legacyOrder.paidAt },
                  );
                }
                throw new GeoHttpError(
                  "监控服务已明确拒绝本次任务，请联系技术支持",
                  502,
                  "MONITOR_SUBMISSION_REJECTED",
                );
              }
              throw error;
            }
          }
        }
        if (requestedRegionCode) {
          if (
            !run.region ||
            run.region.edition !== input.monitoringEdition ||
            run.region.code !== requestedRegionCode
          ) {
            throw new GeoMonitorContractError("监控地区快照与提交范围不匹配");
          }
          resolvedRegion = run.region;
        } else if (run.region) {
          throw new GeoMonitorContractError("监控服务返回了未请求的地区快照");
        }
        if (Boolean(run.screenshotEnabled) !== requestedScreenshotEnabled) {
          throw new GeoMonitorContractError("监控截图设置与提交范围不匹配");
        }
        const durableSubmissionKey =
          durableReservation.submissionKey || submissionKey;
        if (
          run.status === "submission_in_progress" ||
          run.status === "submission_unknown"
        ) {
          durableReservation = await monitorFreeReservationStore.markRun({
            projectId: value.projectId,
            scopeHash,
            idempotencyKey,
            submissionKey: durableSubmissionKey,
            runId: run.runId,
            runStatus: run.status,
            state: "submitted",
          });
          freeStart.run = undefined;
          freeStart.promise = undefined;
          sendProcessing();
          return;
        }
        if (run.status === "remote_failed" || run.status === "shape_mismatch") {
          durableReservation = await monitorFreeReservationStore.markRun({
            projectId: value.projectId,
            scopeHash,
            idempotencyKey,
            submissionKey: durableSubmissionKey,
            runId: run.runId,
            runStatus: run.status,
            state: "failed",
          });
          clearLocalFreeStart();
          if (legacyOrder) {
            await transitionProjectOrder(
              value.projectId,
              legacyOrder.orderId,
              "review_required",
              { paidAt: legacyOrder.paidAt },
            );
          }
          throw new GeoHttpError(
            "监控服务已明确拒绝或无法校验本次任务，请联系技术支持",
            502,
            "MONITOR_SUBMISSION_REJECTED",
          );
        }
        durableReservation = await monitorFreeReservationStore.markRun({
          projectId: value.projectId,
          scopeHash,
          idempotencyKey,
          submissionKey: durableSubmissionKey,
          runId: run.runId,
          runStatus: run.status,
          state: "started",
        });

        let industryRankingRun: BrokerMonitorRun | undefined;
        if (
          requestedIndustryRankingQuestionId &&
          resolvedIndustryRankingQuestion &&
          industryRankingMonitorQuestion
        ) {
          const ensuredIndustryRun = await ensureIndustryRankingMonitorRun({
            value,
            clientRequestId: input.clientRequestId,
            question: resolvedIndustryRankingQuestion.question,
            monitorQuestion: industryRankingMonitorQuestion,
            platforms: requestedPlatforms,
            monitoringEdition: input.monitoringEdition,
            regionCode: requestedRegionCode,
            screenshotEnabled: requestedScreenshotEnabled,
          });
          if (ensuredIndustryRun.state === "processing") {
            freeStart.run = undefined;
            freeStart.promise = undefined;
            sendProcessing();
            return;
          }
          industryRankingRun = ensuredIndustryRun.run;
        }

        let fulfillingOrder: GeoProjectOrder | undefined;
        if (legacyOrder) {
          fulfillingOrder = await transitionProjectOrder(
            value.projectId,
            legacyOrder.orderId,
            "fulfilling",
            { paidAt: legacyOrder.paidAt, allowReviewRecovery: true },
          );
        }
        trackProjectOrder(value, { monitoring: { runId: run.runId } });
        const nextValue: ProjectTokenValue = {
          ...value,
          monitorFreeReservation: undefined,
          monitorRunId: run.runId,
          monitoringEdition: input.monitoringEdition,
          monitorQuestionId: question.id,
          ...(requestedIndustryRankingQuestionId && industryRankingRun
            ? {
                industryRankingQuestionId: requestedIndustryRankingQuestionId,
                industryRankingMonitorRunId: industryRankingRun.runId,
                industryRankingMonitorFreeReservation: undefined,
              }
            : {}),
          monitorPlatformIds: requestedPlatforms,
          ...(resolvedRegion ? { monitorRegion: resolvedRegion } : {}),
          ...(requestedScreenshotEnabled
            ? { monitorScreenshotEnabled: true }
            : {}),
          ...(fulfillingOrder
            ? {
                monitorOrderId: fulfillingOrder.orderId,
                monitorAmountFen: fulfillingOrder.amountFen,
                monitorAuthorizationDigest: fulfillingOrder.authorizationDigest,
                monitorCheckoutExpiresAt: fulfillingOrder.checkoutExpiresAt,
                monitorPaidAt: fulfillingOrder.paidAt,
              }
            : {}),
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
          undefined,
          undefined,
          industryRankingRun,
        );
        res.status(recovering ? 200 : 201).json({
          state: "started",
          replayed: recovering,
          projectToken,
          project,
        });
        return;
      }
      if (!("paymentAuthorization" in input)) {
        throw new GeoHttpError("请求参数不正确", 400, "INVALID_REQUEST");
      }
      await consumeMonitoringStartRate(
        req,
        res,
        value,
        input.paymentAuthorization,
      );
      const requestedPlatforms = input.platformIds as GeoMonitorPlatformId[];

      if (value.monitorRunId) {
        if (
          value.monitorQuestionId !== input.questionId ||
          normalizedGeoMonitoringEdition(value.monitoringEdition) !==
            input.monitoringEdition ||
          !sameStringSet(value.monitorPlatformIds || [], requestedPlatforms)
        ) {
          throw new GeoHttpError(
            "该项目已有一项不同范围的监控任务",
            409,
            "MONITOR_SCOPE_CONFLICT",
          );
        }
        const run = await getResolvedMonitorRun(
          broker,
          value.monitorRunId,
          monitorRunExpectation(value, requestedPlatforms),
        );
        const [
          knowledgeBaseTask,
          questionTask,
          assessmentTask,
          optimizationForecastTask,
        ] = await Promise.all([
          getResolvedTask(broker, value.knowledgeBaseTaskId),
          value.questionTaskId
            ? getResolvedQuestionTask(broker, value.questionTaskId)
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
      const expectedAmountFen = geoMonitoringPriceFen(
        input.monitoringEdition,
        requestedPlatforms,
      );
      if (expectedAmountFen === undefined) {
        throw new GeoHttpError(
          "监控版本与平台范围不匹配",
          400,
          "MONITOR_SCOPE_INVALID",
        );
      }
      const receipt = await paymentVerifier.verify({
        authorization: input.paymentAuthorization,
        projectId: value.projectId,
        ownerSessionId: String(res.locals.geoSessionId || ""),
        questionId: question.id,
        platformIds: requestedPlatforms,
        monitoringEdition: input.monitoringEdition,
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

      let monitorQuestion: string;
      try {
        monitorQuestion = await resolveMonitorQuestionForEdition(
          broker,
          value,
          question,
          input.monitoringEdition,
          {
            waitMs: monitorQuestionTranslationWaitMs,
            pollMs: monitorQuestionTranslationPollMs,
          },
        );
      } catch (error) {
        if (
          error instanceof GeoHttpError &&
          error.code === "QUESTION_TRANSLATION_FAILED"
        ) {
          await transitionProjectOrder(
            value.projectId,
            receipt.orderId,
            "review_required",
            { paidAt: receipt.paidAt },
          );
        }
        throw error;
      }

      const idempotencyKey = `geo-monitor:${crypto
        .createHash("sha256")
        .update(
          JSON.stringify({
            projectId: value.projectId,
            orderId: receipt.orderId,
            questionId: question.id,
            monitoringEdition: input.monitoringEdition,
            question: monitorQuestion,
            platforms: [...requestedPlatforms].sort(),
          }),
        )
        .digest("hex")}`;
      let run: BrokerMonitorRun;
      try {
        run = normalizeMonitorRun(
          await broker.createMonitorRun({
            projectId: value.projectId,
            question: monitorQuestion,
            platforms: requestedPlatforms,
            idempotencyKey,
          }),
          { question: monitorQuestion, platforms: requestedPlatforms },
        );
      } catch (error) {
        if (
          error instanceof GeoBrokerError &&
          error.code === "MONITOR_SUBMISSION_UNKNOWN"
        ) {
          throw new GeoHttpError(
            "监控服务尚未确认任务已经创建；付款与订单已保留，请稍后使用同一订单重试",
            503,
            "MONITOR_SUBMISSION_UNCONFIRMED",
          );
        }
        if (
          error instanceof GeoBrokerError &&
          error.code === "MONITOR_SUBMISSION_REJECTED"
        ) {
          await transitionProjectOrder(
            value.projectId,
            receipt.orderId,
            "review_required",
            { paidAt: receipt.paidAt },
          );
          throw new GeoHttpError(
            "监控服务已明确拒绝本次任务；付款与订单已保留，请联系技术支持",
            502,
            "MONITOR_SUBMISSION_REJECTED",
          );
        }
        throw error;
      }
      if (
        run.status === "submission_in_progress" ||
        run.status === "submission_unknown"
      ) {
        throw new GeoHttpError(
          "监控服务尚未确认任务已经创建；付款与订单已保留，请稍后使用同一订单重试",
          503,
          "MONITOR_SUBMISSION_UNCONFIRMED",
        );
      }
      if (run.status === "remote_failed" || run.status === "shape_mismatch") {
        await transitionProjectOrder(
          value.projectId,
          receipt.orderId,
          "review_required",
          { paidAt: receipt.paidAt },
        );
        throw new GeoHttpError(
          "监控服务已明确拒绝或无法校验本次任务；付款与订单已保留，请联系技术支持",
          502,
          "MONITOR_SUBMISSION_REJECTED",
        );
      }
      const fulfillingOrder = await transitionProjectOrder(
        value.projectId,
        receipt.orderId,
        "fulfilling",
        { paidAt: receipt.paidAt, allowReviewRecovery: true },
      );
      trackProjectOrder(value, { monitoring: { runId: run.runId } });
      const nextValue: ProjectTokenValue = {
        ...value,
        monitorRunId: run.runId,
        monitoringEdition: input.monitoringEdition,
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
          ? getResolvedQuestionTask(broker, value.questionTaskId)
          : Promise.resolve(undefined),
        getResolvedMonitorRun(
          broker,
          value.monitorRunId,
          monitorRunExpectation(value),
        ),
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
      if (value.assessmentTaskId && value.assessmentVersion !== 2) {
        value = {
          ...value,
          assessmentTaskId: undefined,
          assessmentSubmittedAt: undefined,
          assessmentAttempt: 1,
          assessmentVersion: 2,
          assessmentUpgradeFromV1: true,
          optimizationForecastTaskId: undefined,
          optimizationForecastSubmittedAt: undefined,
          optimizationForecastAttempt: 1,
          optimizationForecastVersion: 2,
          previousAssessmentTaskIds: Array.from(
            new Set([
              ...(value.previousAssessmentTaskIds || []),
              value.assessmentTaskId,
            ]),
          ),
          previousOptimizationForecastTaskIds: value.optimizationForecastTaskId
            ? Array.from(
                new Set([
                  ...(value.previousOptimizationForecastTaskIds || []),
                  value.optimizationForecastTaskId,
                ]),
              )
            : value.previousOptimizationForecastTaskIds,
        };
      }

      if (value.assessmentTaskId) {
        const [assessmentTask, optimizationForecastTask] = await Promise.all([
          getResolvedTask(broker, value.assessmentTaskId),
          value.optimizationForecastTaskId
            ? getResolvedTask(broker, value.optimizationForecastTaskId)
            : Promise.resolve(undefined),
        ]);
        let assessmentOutputPromise:
          | ReturnType<typeof resolveAssessmentTaskOutput>
          | undefined;
        const assessmentStatus = normalizeTaskStatus(assessmentTask.status);
        let manualRestart = ["failed", "cancelled"].includes(assessmentStatus);
        if (assessmentStatus === "completed") {
          try {
            assessmentOutputPromise = parseScopedAssessmentTaskOutput(
              broker,
              assessmentTask,
              question,
              monitorRun.platforms,
              monitorRun,
            );
            calculateCompleteAssessment(await assessmentOutputPromise);
          } catch (error) {
            logAssessmentOutputValidation(error, assessmentTask);
            manualRestart = true;
          }
        }
        if (manualRestart) {
          const previousAssessmentTaskId = value.assessmentTaskId;
          const previousForecastTaskId = value.optimizationForecastTaskId;
          value = {
            ...value,
            assessmentTaskId: undefined,
            assessmentSubmittedAt: undefined,
            assessmentAttempt: Math.max(
              2,
              Math.floor(value.assessmentAttempt || 1) + 1,
            ),
            assessmentVersion: 2,
            optimizationForecastTaskId: undefined,
            optimizationForecastSubmittedAt: undefined,
            optimizationForecastAttempt: 1,
            optimizationForecastVersion: 2,
            previousAssessmentTaskIds: Array.from(
              new Set([
                ...(value.previousAssessmentTaskIds || []),
                previousAssessmentTaskId,
              ]),
            ),
            previousOptimizationForecastTaskIds: previousForecastTaskId
              ? Array.from(
                  new Set([
                    ...(value.previousOptimizationForecastTaskIds || []),
                    previousForecastTaskId,
                  ]),
                )
              : value.previousOptimizationForecastTaskIds,
          };
        } else {
          const project = await buildProjectView(
            broker,
            value,
            req.params.projectToken,
            knowledgeBaseTask,
            questionTask,
            monitorRun,
            assessmentTask,
            optimizationForecastTask,
            { assessment: assessmentOutputPromise },
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
          rankingMetricEligible: question.category === "industry_ranking",
        },
        platforms: [...monitorRun.platforms].sort(compareCanonicalText),
        repeatPerPlatform: 5,
        expectedResponses: monitorRun.expectedItems,
        successfulResponses: monitorRun.records.filter(
          (record) =>
            record.status === "completed" && Boolean(record.answerText),
        ).length,
        // The assessment remains text/evidence based. Structured media is
        // returned to the customer UI but is not sent to the evaluator, and
        // page screenshots/reasoning never enter the monitor contract.
        records: canonicalAssessmentMonitorRecords(monitorRun.records),
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
      const assessmentTaskOperationKey = `geo:${value.projectId}:assessment:v3-top10:${value.monitorRunId}:${value.assessmentAttempt || 1}`;
      const monitoringFile = await createGeoTaskEvidenceFile(broker, {
        projectId: value.projectId,
        taskOperationKey: assessmentTaskOperationKey,
        role: "monitoring-records",
        filename: monitoringFilename,
        mimeType: "application/json",
        body: monitoringBytes,
      });

      let archiveAttachment: Awaited<
        ReturnType<typeof materializeArchiveAttachment>
      >;
      try {
        archiveAttachment = await materializeArchiveAttachment(
          broker,
          value.knowledgeBaseTaskId,
          archive,
          {
            projectId: value.projectId,
            idempotencyKey: `${assessmentTaskOperationKey}:knowledge-base-archive`,
          },
        );
      } catch (error) {
        if (!shouldRetainGeneratedTaskFilesForReplay(error)) {
          await broker
            .deleteAsset(monitoringFile.localAssetId)
            .catch(() => undefined);
        }
        throw error;
      }

      const successfulResponses = monitoringDocument.successfulResponses;
      const assessmentPromptInput = {
        companyName: value.companyName,
        archiveFilename: archiveAttachment.filename,
        monitoringFilename: monitoringFile.filename || monitoringFilename,
        question: monitoringDocument.question,
        monitoring: {
          platforms: monitorRun.platforms,
          repeatPerPlatform: 5 as const,
          expectedResponses: monitorRun.expectedItems,
          successfulResponses,
          failedResponses: monitorRun.expectedItems - successfulResponses,
        },
      };
      const prompt = await buildAssessmentPrompt(assessmentPromptInput);
      let assessmentTask: BrokerTask;
      let skillAttachments: Array<{ localAssetId: string; filename: string }>;
      try {
        const created = await createGeoTaskWithSkillPackages(
          broker,
          {
            projectId: value.projectId,
            prompt,
            localAssets: [
              {
                localAssetId: archiveAttachment.localAssetId,
                filename: archiveAttachment.filename,
              },
              {
                localAssetId: monitoringFile.localAssetId,
                filename: monitoringFile.filename || monitoringFilename,
              },
            ],
            idempotencyKey: assessmentTaskOperationKey,
            contract: PRESALES_CONTRACTS.currentStateAssessment,
          },
          [
            {
              filename: ASSESSMENT_SKILL_ARCHIVE_FILENAME,
              body: await buildGeoCurrentStateEvaluatorSkillArchive(),
            },
            buildAssessmentTaskInput(assessmentPromptInput),
          ],
        );
        assessmentTask = created.task;
        skillAttachments = created.skillAttachments;
      } catch (error) {
        if (!shouldRetainGeneratedTaskFilesForReplay(error)) {
          await Promise.allSettled([
            broker.deleteAsset(monitoringFile.localAssetId),
            ...(archiveAttachment.temporary
              ? [broker.deleteAsset(archiveAttachment.localAssetId)]
              : []),
          ]);
        }
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
        assessmentVersion: 2,
        temporaryFileIds: Array.from(
          new Set([
            ...(value.temporaryFileIds || []),
            monitoringFile.localAssetId,
            ...skillAttachments.map((item) => item.localAssetId),
            ...(archiveAttachment.temporary
              ? [archiveAttachment.localAssetId]
              : []),
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
            ? getResolvedQuestionTask(broker, value.questionTaskId)
            : Promise.resolve(undefined),
          value.monitorRunId
            ? getResolvedMonitorRun(
                broker,
                value.monitorRunId,
                monitorRunExpectation(value),
              )
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
      const assessmentOutputPromise = parseScopedAssessmentTaskOutput(
        broker,
        assessmentTask,
        question,
        monitorRun?.platforms || value.monitorPlatformIds || [],
        monitorRun,
      );
      try {
        scoredAssessment = calculateCompleteAssessment(
          await assessmentOutputPromise,
        );
        if (scoredAssessment.schemaVersion !== 2) {
          throw new Error("Optimization forecast requires assessment v2");
        }
      } catch (error) {
        logAssessmentOutputValidation(error, assessmentTask);
        throw new GeoHttpError(
          publicAssessmentValidationMessage(error),
          409,
          "ASSESSMENT_INVALID",
        );
      }

      if (
        value.optimizationForecastTaskId &&
        value.optimizationForecastVersion !== 2
      ) {
        value = {
          ...value,
          optimizationForecastTaskId: undefined,
          optimizationForecastSubmittedAt: undefined,
          optimizationForecastAttempt: 1,
          optimizationForecastVersion: 2,
          previousOptimizationForecastTaskIds: Array.from(
            new Set([
              ...(value.previousOptimizationForecastTaskIds || []),
              value.optimizationForecastTaskId,
            ]),
          ),
        };
      }

      let existingForecastOutputPromise:
        | ReturnType<typeof resolveOptimizationOutcomeForecastTaskOutput>
        | undefined;
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
                  .failure?.code || "上一次优化效果评估任务执行失败";
        } else if (forecastStatus === "completed") {
          try {
            existingForecastOutputPromise =
              resolveOptimizationOutcomeForecastTaskOutput(
                broker,
                optimizationForecastTask,
                { taskId: taskIdFrom(optimizationForecastTask) },
              );
            calculateCompleteForecast(
              scoredAssessment,
              await existingForecastOutputPromise,
            );
          } catch (error) {
            logAssessmentOutputValidation(error, optimizationForecastTask);
            forecastRetryReason = publicForecastValidationMessage(error);
          }
        }
        if (forecastRetryReason) {
          if (
            (value.optimizationForecastAttempt || 1) >=
            MAX_OPTIMIZATION_FORECAST_ATTEMPTS
          ) {
            throw new GeoHttpError(
              "优化效果评估重新评估次数已用完，请联系技术支持",
              409,
              "FORECAST_RETRY_EXHAUSTED",
            );
          }
          const previousForecastTaskId = value.optimizationForecastTaskId;
          value = {
            ...value,
            optimizationForecastTaskId: undefined,
            optimizationForecastSubmittedAt: undefined,
            optimizationForecastAttempt: Math.max(
              2,
              Math.floor(value.optimizationForecastAttempt || 1) + 1,
            ),
            previousOptimizationForecastTaskIds: Array.from(
              new Set([
                ...(value.previousOptimizationForecastTaskIds || []),
                previousForecastTaskId,
              ]),
            ),
          };
        } else {
          const project = await buildProjectView(
            broker,
            value,
            req.params.projectToken,
            knowledgeBaseTask,
            questionTask,
            monitorRun,
            assessmentTask,
            optimizationForecastTask,
            {
              assessment: assessmentOutputPromise,
              forecast: existingForecastOutputPromise,
            },
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
        generatedAt: value.assessmentSubmittedAt || new Date(0).toISOString(),
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

      const forecastTaskOperationKey = `geo:${value.projectId}:optimization-forecast:${value.assessmentTaskId}:planning-target-4w-v5:${value.optimizationForecastAttempt || 1}`;
      const temporaryFiles: string[] = [];
      const { forecastTask, forecastTaskId } = await (async () => {
        try {
          const assessmentFile = await createGeoTaskEvidenceFile(broker, {
            projectId: value.projectId,
            taskOperationKey: forecastTaskOperationKey,
            role: "current-assessment",
            filename: assessmentFilename,
            mimeType: "application/json",
            body: assessmentBytes,
          });
          temporaryFiles.push(assessmentFile.localAssetId);
          const scenarioFile = await createGeoTaskEvidenceFile(broker, {
            projectId: value.projectId,
            taskOperationKey: forecastTaskOperationKey,
            role: "execution-scenario",
            filename: scenarioFilename,
            mimeType: "application/json",
            body: scenarioBytes,
          });
          temporaryFiles.push(scenarioFile.localAssetId);

          const archiveAttachment = await materializeArchiveAttachment(
            broker,
            value.knowledgeBaseTaskId,
            archive,
            {
              projectId: value.projectId,
              idempotencyKey: `${forecastTaskOperationKey}:knowledge-base-archive`,
            },
          );
          if (archiveAttachment.temporary)
            temporaryFiles.push(archiveAttachment.localAssetId);

          const forecastPromptInput = {
            currentAssessmentFilename:
              assessmentFile.filename || assessmentFilename,
            knowledgeBaseArchiveFilename: archiveAttachment.filename,
            executionScenarioFilename:
              scenarioFile.filename || scenarioFilename,
            scenarioName: "full_execution" as const,
            brandMentionRateObservation:
              question.category === "industry_ranking"
                ? monitorBrandMentionRate(monitorRun)
                : undefined,
            retryReason: forecastRetryReason,
          };
          const created = await createGeoTaskWithSkillPackages(
            broker,
            {
              projectId: value.projectId,
              prompt:
                await buildOptimizationOutcomeForecastPrompt(
                  forecastPromptInput,
                ),
              localAssets: [
                {
                  localAssetId: archiveAttachment.localAssetId,
                  filename: archiveAttachment.filename,
                },
                {
                  localAssetId: assessmentFile.localAssetId,
                  filename: assessmentFile.filename || assessmentFilename,
                },
                {
                  localAssetId: scenarioFile.localAssetId,
                  filename: scenarioFile.filename || scenarioFilename,
                },
              ],
              idempotencyKey: forecastTaskOperationKey,
              contract: PRESALES_CONTRACTS.optimizationForecast,
            },
            [
              {
                filename: FORECAST_SKILL_ARCHIVE_FILENAME,
                body: await buildGeoOptimizationOutcomeForecasterSkillArchive(),
              },
              {
                filename: FORECAST_OUTPUT_TEMPLATE_FILENAME,
                body: await buildGeoOptimizationOutcomeForecastTemplate(),
                mimeType: "application/json",
              },
              buildOptimizationOutcomeForecastTaskInput(forecastPromptInput),
            ],
          );
          const task = created.task;
          temporaryFiles.push(
            ...created.skillAttachments.map((item) => item.localAssetId),
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
          if (!shouldRetainGeneratedTaskFilesForReplay(error)) {
            await Promise.allSettled(
              temporaryFiles.map((fileId) => broker.deleteAsset(fileId)),
            );
          }
          throw error;
        }
      })();

      const nextValue: ProjectTokenValue = {
        ...value,
        optimizationForecastTaskId: forecastTaskId,
        optimizationForecastSubmittedAt: new Date().toISOString(),
        optimizationForecastAttempt: value.optimizationForecastAttempt || 1,
        optimizationForecastVersion: 2,
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
        { assessment: assessmentOutputPromise },
      );
      res.status(201).json({ projectToken, project });
    }),
  );

  router.post(
    "/projects/:projectToken/industry-ranking/assessment",
    requireConfiguration,
    requireSession,
    requireCostRate("industry-ranking-assessment-create", 8),
    asyncHandler(async (req, res) => {
      let value = openOwnedProject(req, res);
      if (
        !value.industryRankingMonitorRunId ||
        !value.industryRankingQuestionId
      ) {
        throw new GeoHttpError(
          "行业排名监控任务提交后才能生成现状评估",
          409,
          "MONITOR_NOT_STARTED",
        );
      }
      const [knowledgeBaseTask, questionTask, monitorRun] = await Promise.all([
        getResolvedTask(broker, value.knowledgeBaseTaskId),
        value.questionTaskId
          ? getResolvedQuestionTask(broker, value.questionTaskId)
          : Promise.resolve(undefined),
        getResolvedMonitorRun(
          broker,
          value.industryRankingMonitorRunId,
          monitorRunExpectation(value),
        ),
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
        value.industryRankingQuestionId,
      );
      if (question?.category !== "industry_ranking") {
        throw new GeoHttpError(
          "行业排名监控问题与当前项目不匹配",
          409,
          "MONITOR_QUESTION_MISMATCH",
        );
      }

      if (value.industryRankingAssessmentTaskId) {
        const [assessmentTask, forecastTask] = await Promise.all([
          getResolvedTask(broker, value.industryRankingAssessmentTaskId),
          value.industryRankingOptimizationForecastTaskId
            ? getResolvedTask(
                broker,
                value.industryRankingOptimizationForecastTaskId,
              )
            : Promise.resolve(undefined),
        ]);
        const assessmentStatus = normalizeTaskStatus(assessmentTask.status);
        let restart = ["failed", "cancelled"].includes(assessmentStatus);
        let assessmentOutputPromise:
          | ReturnType<typeof resolveAssessmentTaskOutput>
          | undefined;
        if (assessmentStatus === "completed") {
          try {
            assessmentOutputPromise = parseScopedAssessmentTaskOutput(
              broker,
              assessmentTask,
              question,
              monitorRun.platforms,
              monitorRun,
            );
            calculateCompleteAssessment(await assessmentOutputPromise);
          } catch (error) {
            logAssessmentOutputValidation(error, assessmentTask);
            restart = true;
          }
        }
        if (!restart) {
          const project = await buildProjectView(
            broker,
            value,
            req.params.projectToken,
            knowledgeBaseTask,
            questionTask,
            undefined,
            undefined,
            undefined,
            undefined,
            monitorRun,
            assessmentTask,
            forecastTask,
            { assessment: assessmentOutputPromise },
          );
          res.json({ projectToken: req.params.projectToken, project });
          return;
        }

        const previousAssessmentTaskId = value.industryRankingAssessmentTaskId;
        const previousForecastTaskId =
          value.industryRankingOptimizationForecastTaskId;
        value = {
          ...value,
          industryRankingAssessmentTaskId: undefined,
          industryRankingAssessmentSubmittedAt: undefined,
          industryRankingAssessmentAttempt: Math.max(
            2,
            Math.floor(value.industryRankingAssessmentAttempt || 1) + 1,
          ),
          industryRankingAssessmentVersion: 2,
          industryRankingOptimizationForecastTaskId: undefined,
          industryRankingOptimizationForecastSubmittedAt: undefined,
          industryRankingOptimizationForecastAttempt: 1,
          industryRankingOptimizationForecastVersion: 2,
          previousIndustryRankingAssessmentTaskIds: Array.from(
            new Set([
              ...(value.previousIndustryRankingAssessmentTaskIds || []),
              previousAssessmentTaskId,
            ]),
          ),
          previousIndustryRankingOptimizationForecastTaskIds:
            previousForecastTaskId
              ? Array.from(
                  new Set([
                    ...(value.previousIndustryRankingOptimizationForecastTaskIds ||
                      []),
                    previousForecastTaskId,
                  ]),
                )
              : value.previousIndustryRankingOptimizationForecastTaskIds,
        };
      }

      const created = await createAutomaticAssessmentTask(
        value,
        knowledgeBaseTask,
        questionTask,
        monitorRun,
        "industry_ranking",
      );
      value = created.value;
      const projectToken = codec.seal("project", value, PROJECT_TTL_MS);
      const project = await buildProjectView(
        broker,
        value,
        projectToken,
        knowledgeBaseTask,
        questionTask,
        undefined,
        undefined,
        undefined,
        undefined,
        monitorRun,
        created.task,
      );
      res.status(201).json({ projectToken, project });
    }),
  );

  router.post(
    "/projects/:projectToken/industry-ranking/optimization-forecast",
    requireConfiguration,
    requireSession,
    requireCostRate("industry-ranking-forecast-create", 6),
    asyncHandler(async (req, res) => {
      let value = openOwnedProject(req, res);
      if (
        !value.industryRankingMonitorRunId ||
        !value.industryRankingQuestionId ||
        !value.industryRankingAssessmentTaskId
      ) {
        throw new GeoHttpError(
          "行业排名现状评估完成后才能生成优化效果评估",
          409,
          "ASSESSMENT_NOT_READY",
        );
      }
      const [knowledgeBaseTask, questionTask, monitorRun, assessmentTask] =
        await Promise.all([
          getResolvedTask(broker, value.knowledgeBaseTaskId),
          value.questionTaskId
            ? getResolvedQuestionTask(broker, value.questionTaskId)
            : Promise.resolve(undefined),
          getResolvedMonitorRun(
            broker,
            value.industryRankingMonitorRunId,
            monitorRunExpectation(value),
          ),
          getResolvedTask(broker, value.industryRankingAssessmentTaskId),
        ]);
      const question =
        questionTask && value.industryRankingQuestionId
          ? findOwnedQuestion(
              value,
              parseQuestionSetFromTask(questionTask)?.questions,
              value.industryRankingQuestionId,
            )
          : undefined;
      if (question?.category !== "industry_ranking") {
        throw new GeoHttpError(
          "行业排名评估与监控问题范围不匹配",
          409,
          "ASSESSMENT_SCOPE_MISMATCH",
        );
      }
      if (normalizeTaskStatus(assessmentTask.status) !== "completed") {
        throw new GeoHttpError(
          "行业排名现状评估仍在生成",
          409,
          "ASSESSMENT_NOT_READY",
        );
      }

      const assessmentOutputPromise = parseScopedAssessmentTaskOutput(
        broker,
        assessmentTask,
        question,
        monitorRun.platforms,
        monitorRun,
      );
      let scoredAssessment: ReturnType<
        typeof calculateQuestionBaselineAssessment
      >;
      try {
        scoredAssessment = calculateCompleteAssessment(
          await assessmentOutputPromise,
        );
      } catch (error) {
        logAssessmentOutputValidation(error, assessmentTask);
        throw new GeoHttpError(
          publicAssessmentValidationMessage(error),
          409,
          "ASSESSMENT_INVALID",
        );
      }

      let forecastRetryReason: string | undefined;
      if (value.industryRankingOptimizationForecastTaskId) {
        const forecastTask = await getResolvedTask(
          broker,
          value.industryRankingOptimizationForecastTaskId,
        );
        const forecastStatus = normalizeTaskStatus(forecastTask.status);
        let forecastOutputPromise:
          | ReturnType<typeof resolveOptimizationOutcomeForecastTaskOutput>
          | undefined;
        if (["failed", "cancelled"].includes(forecastStatus)) {
          forecastRetryReason =
            forecastStatus === "cancelled"
              ? "上一次行业排名优化效果评估任务已取消"
              : normalizeTask(forecastTask, "optimization-forecast").failure
                  ?.code || "上一次行业排名优化效果评估任务执行失败";
        } else if (forecastStatus === "completed") {
          try {
            forecastOutputPromise =
              resolveOptimizationOutcomeForecastTaskOutput(
                broker,
                forecastTask,
                {
                  taskId: taskIdFrom(forecastTask),
                },
              );
            calculateCompleteForecast(
              scoredAssessment,
              await forecastOutputPromise,
            );
          } catch (error) {
            logAssessmentOutputValidation(error, forecastTask);
            forecastRetryReason = publicForecastValidationMessage(error);
          }
        }
        if (!forecastRetryReason) {
          const project = await buildProjectView(
            broker,
            value,
            req.params.projectToken,
            knowledgeBaseTask,
            questionTask,
            undefined,
            undefined,
            undefined,
            undefined,
            monitorRun,
            assessmentTask,
            forecastTask,
            {
              assessment: assessmentOutputPromise,
              forecast: forecastOutputPromise,
            },
          );
          res.json({ projectToken: req.params.projectToken, project });
          return;
        }
        if (
          (value.industryRankingOptimizationForecastAttempt || 1) >=
          MAX_OPTIMIZATION_FORECAST_ATTEMPTS
        ) {
          throw new GeoHttpError(
            "行业排名优化效果评估重新评估次数已用完，请联系技术支持",
            409,
            "FORECAST_RETRY_EXHAUSTED",
          );
        }
        const previousTaskId = value.industryRankingOptimizationForecastTaskId;
        value = {
          ...value,
          industryRankingOptimizationForecastTaskId: undefined,
          industryRankingOptimizationForecastSubmittedAt: undefined,
          industryRankingOptimizationForecastAttempt: Math.max(
            2,
            Math.floor(value.industryRankingOptimizationForecastAttempt || 1) +
              1,
          ),
          industryRankingOptimizationForecastVersion: 2,
          previousIndustryRankingOptimizationForecastTaskIds: Array.from(
            new Set([
              ...(value.previousIndustryRankingOptimizationForecastTaskIds ||
                []),
              previousTaskId,
            ]),
          ),
        };
      }

      const created = await createAutomaticOptimizationForecastTask(
        value,
        knowledgeBaseTask,
        scoredAssessment,
        forecastRetryReason,
        "industry_ranking",
        monitorRun,
      );
      value = created.value;
      const projectToken = codec.seal("project", value, PROJECT_TTL_MS);
      const project = await buildProjectView(
        broker,
        value,
        projectToken,
        knowledgeBaseTask,
        questionTask,
        undefined,
        undefined,
        undefined,
        undefined,
        monitorRun,
        assessmentTask,
        created.task,
        { assessment: assessmentOutputPromise },
      );
      res.status(201).json({ projectToken, project });
    }),
  );

  const buildServicePaymentResult = async (
    value: ProjectTokenValue,
    scope: Awaited<ReturnType<typeof resolveServiceScope>>,
    projectToken: string,
  ) => {
    const monitorRun = value.monitorRunId
      ? await getResolvedMonitorRun(
          broker,
          value.monitorRunId,
          monitorRunExpectation(value),
        )
      : undefined;
    const project = await buildProjectView(
      broker,
      value,
      projectToken,
      scope.knowledgeBaseTask,
      scope.questionTask,
      monitorRun,
      scope.assessmentTask,
      scope.forecastTask,
      scope.preResolvedOutputs,
    );
    return { projectToken, project };
  };

  const finalizeVerifiedServicePayment = async (input: {
    value: ProjectTokenValue;
    scope: Awaited<ReturnType<typeof resolveServiceScope>>;
    receipt: GeoPaymentReceipt;
    purchaseIntent?: string;
    allowDirectBankOrder: boolean;
  }) => {
    const { value, scope, receipt } = input;
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
    const contractAuthorizedAt = normalizedIsoTimestamp(
      value.serviceContractAuthorizedAt,
    );
    if (
      value.serviceContractAuthorizationMode === "external_wechat" &&
      contractAuthorizedAt &&
      Date.parse(receipt.paidAt) <= Date.parse(contractAuthorizedAt)
    ) {
      throw new GeoPaymentVerificationError(
        "支付时间必须晚于合同确认时间",
        "PAYMENT_PRECEDES_CONTRACT_AUTHORIZATION",
        409,
      );
    }

    const projectOrders = await readProjectOrders(value.projectId);
    const existingOrder = projectOrders.orders.find(
      (order) => order.orderId === receipt.orderId,
    );
    let paidOrder: GeoProjectOrder;
    if (existingOrder) {
      if (
        existingOrder.purchaseType !== "service" ||
        existingOrder.amountFen !== scope.amountFen
      ) {
        throw new GeoPaymentVerificationError(
          "支付订单与本次服务范围不匹配",
          "PAYMENT_SCOPE_MISMATCH",
          409,
        );
      }
      if (
        existingOrder.state === "review_required" ||
        existingOrder.state === "terminal_failed" ||
        existingOrder.state === "closed"
      ) {
        throw new GeoPaymentVerificationError(
          "该订单当前不能自动确认付款",
          "PAYMENT_REVIEW_REQUIRED",
          409,
        );
      }
      paidOrder = await transitionProjectOrder(
        value.projectId,
        receipt.orderId,
        "paid",
        { paidAt: receipt.paidAt },
      );
    } else {
      if (!input.allowDirectBankOrder) {
        throw new GeoHttpError(
          "项目订单账本缺少本次订单，已阻止继续操作",
          503,
          "PROJECT_ORDER_REGISTRY_UNAVAILABLE",
        );
      }
      const conflictingOrder = projectOrders.orders.find(
        (order) =>
          order.purchaseType === "service" &&
          order.orderId !== receipt.orderId &&
          order.state !== "closed" &&
          order.state !== "terminal_failed",
      );
      if (conflictingOrder) {
        throw new GeoPaymentVerificationError(
          "该项目已有另一项付款或对账记录",
          "PAYMENT_RECEIPT_CONFLICT",
          409,
        );
      }
      paidOrder = await writeProjectOrder({
        orderId: receipt.orderId,
        projectId: value.projectId,
        purchaseType: "service",
        amountFen: receipt.amountFen,
        authorizationDigest: sha256(
          JSON.stringify({
            schemaVersion: 1,
            kind: "service-bank-transfer",
            projectId: value.projectId,
            orderId: receipt.orderId,
            tradeNo: receipt.tradeNo || receipt.orderId,
          }),
        ),
        state: "paid",
        checkoutExpiresAt: receipt.paidAt,
        eventAt: receipt.paidAt,
        paidAt: receipt.paidAt,
      });
    }

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
      value.serviceManualOrderReference!,
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
        value.serviceManualOrderReference!,
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
    return buildServicePaymentResult(nextValue, scope, projectToken);
  };

  router.post(
    "/projects/:projectToken/services/contracts",
    requireConfiguration,
    requireSession,
    requireCostRate("service-contract-create", 8),
    asyncHandler(async (req, res) => {
      const value = openOwnedProject(req, res);
      const input = CreateServiceContractRequestSchema.parse(req.body);
      const contractCodeKey = `${String(res.locals.geoSessionId || "")}:${value.projectId}`;
      const contractCodeNow = Date.now();
      pruneExpiringMap(failedContractCodes, contractCodeNow, 2000);
      const failedContractCode = failedContractCodes.get(contractCodeKey);
      if (
        failedContractCode &&
        failedContractCode.resetAt > contractCodeNow &&
        failedContractCode.count >= 5
      ) {
        res.setHeader(
          "Retry-After",
          String(
            Math.max(
              1,
              Math.ceil((failedContractCode.resetAt - contractCodeNow) / 1000),
            ),
          ),
        );
        throw new GeoHttpError(
          "合同码尝试次数过多，请 15 分钟后再试",
          429,
          "CONTRACT_CODE_RATE_LIMITED",
        );
      }
      if (!safeSecretEqual(input.contractCode, contractAuthCode)) {
        const activeFailure =
          failedContractCode && failedContractCode.resetAt > contractCodeNow
            ? failedContractCode
            : { count: 0, resetAt: contractCodeNow + 15 * 60 * 1000 };
        activeFailure.count += 1;
        failedContractCodes.set(contractCodeKey, activeFailure);
        pruneExpiringMap(failedContractCodes, contractCodeNow, 2000);
        throw new GeoHttpError(
          "合同码不正确，请联系管理员确认",
          403,
          "CONTRACT_CODE_INVALID",
        );
      }
      failedContractCodes.delete(contractCodeKey);
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
      let response = value.serviceManualOrderReference
        ? await manualOrderStatusReader(value.serviceManualOrderReference)
        : await manualOrderCreator({
            schemaVersion: 1,
            marketEdition: normalizedGeoMonitoringEdition(
              value.monitoringEdition,
            ),
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
              templateVersion:
                GEO_MANUAL_CONTRACT_TEMPLATE_VERSION[
                  normalizedGeoMonitoringEdition(value.monitoringEdition)
                ],
              profile: input.profile,
            },
          });
      const profileSubmittedAt =
        value.serviceProfileSubmittedAt || response.order.updatedAt;
      if (
        response.order.status === "pending_admin" ||
        response.order.status === "signature_required"
      ) {
        const eventReference = `wechat-${crypto
          .createHash("sha256")
          .update(
            `${value.projectId}:${response.order.reference}:external-contract-v1`,
            "utf8",
          )
          .digest("hex")
          .slice(0, 48)}`;
        response = await manualOrderExternalAuthorizer(
          response.order.reference,
          {
            schemaVersion: 1,
            authorization: {
              mode: "external_wechat",
              eventReference,
              authorizedAt: new Date().toISOString(),
            },
          },
        );
        const authorizedAt = Date.parse(
          response.order.contractAuthorizedAt || "",
        );
        if (
          response.order.status !== "payment_required" ||
          response.order.contractAuthorizationMode !== "external_wechat" ||
          !Number.isFinite(authorizedAt) ||
          authorizedAt > Date.now() + 5 * 60 * 1000
        ) {
          throw new GeoHttpError(
            "合同确认结果不完整，请联系管理员后重试",
            502,
            "MANUAL_ORDER_EXTERNAL_CONTRACT_INCOMPLETE",
          );
        }
      }
      let nextValue = mergeManualOrder(preparedValue, response);
      nextValue = {
        ...nextValue,
        serviceProfileSubmittedAt: profileSubmittedAt,
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
        ? await getResolvedMonitorRun(
            broker,
            nextValue.monitorRunId,
            monitorRunExpectation(nextValue),
          )
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
        scope.preResolvedOutputs,
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
        ? await getResolvedMonitorRun(
            broker,
            nextValue.monitorRunId,
            monitorRunExpectation(nextValue),
          )
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
        scope.preResolvedOutputs,
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
            ? "合同尚未完成确认，暂不能付款"
            : "请先提交签约资料并联系管理员确认合同",
          409,
          "SERVICE_PAYMENT_NOT_ALLOWED",
        );
      }
      assertServiceContractEvidence(value);
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
        monitoringEdition: normalizedGeoMonitoringEdition(
          value.monitoringEdition,
        ),
        billingMonths: 1,
      });
      const mutationKey = `${ownerSessionId}:${value.projectId}`;
      const checkout = await withServicePaymentMutation(
        mutationKey,
        "online",
        () =>
          createDurableCheckout({
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
                monitoringEdition: normalizedGeoMonitoringEdition(
                  value.monitoringEdition,
                ),
                expectedAmountFen: scope.amountFen,
                method: input.method,
              }),
          }),
      );
      trackServiceOrder(value);
      res.status(checkout.replayed ? 200 : 201).json({
        payment: {
          ...checkout.payment,
          purchaseType: "service",
          category: scope.category,
          monitoringEdition: normalizedGeoMonitoringEdition(
            value.monitoringEdition,
          ),
          questionId: scope.question.id,
          billingMonths: 1,
          unitPriceFen: scope.amountFen,
        },
      });
    }),
  );

  router.post(
    "/projects/:projectToken/services/payments/switch",
    requireConfiguration,
    requireSession,
    requireCostRate("service-payment-switch", 10),
    asyncHandler(async (req, res) => {
      const value = openOwnedProject(req, res);
      const input = SwitchServicePaymentRequestSchema.parse(req.body);
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
      assertServiceContractEvidence(value);
      if (value.serviceOrderId || value.servicePaidAt) {
        throw new GeoHttpError(
          "该问题的首月服务已经付款，不能再更换支付方式",
          409,
          "SERVICE_ALREADY_PAID",
        );
      }
      await assertServiceWorkspaceReady();

      const authorizationDigest = sha256(input.authorization);
      const projectOrders = await readProjectOrders(value.projectId);
      const currentOrder = projectOrders.orders.find(
        (order) =>
          order.purchaseType === "service" &&
          safeSecretEqual(order.authorizationDigest, authorizationDigest),
      );
      if (!currentOrder) {
        throw new GeoHttpError(
          "未找到可更换支付方式的合同订单，请刷新后重试",
          409,
          "PAYMENT_CHECKOUT_NOT_FOUND",
        );
      }
      if (currentOrder.state !== "pending") {
        throw new GeoHttpError(
          "当前合同订单已经进入付款或处理流程，不能再更换支付方式",
          409,
          currentOrder.state === "review_required"
            ? "PAYMENT_REVIEW_REQUIRED"
            : "PAYMENT_ALREADY_CONFIRMED",
        );
      }
      if (currentOrder.amountFen !== scope.amountFen) {
        throw new GeoHttpError(
          "支付订单与本次服务范围不匹配",
          409,
          "PAYMENT_SCOPE_MISMATCH",
        );
      }

      const ownerSessionId = String(res.locals.geoSessionId || "");
      const edition = normalizedGeoMonitoringEdition(value.monitoringEdition);
      const switchInput = {
        authorization: input.authorization,
        ownerSessionId,
        projectId: value.projectId,
        questionId: scope.question.id,
        category: scope.category,
        monitoringEdition: edition,
        expectedAmountFen: scope.amountFen,
        method: input.method,
        checkoutExpiresAt: currentOrder.checkoutExpiresAt,
      };
      const statusInput = {
        authorization: input.authorization,
        ownerSessionId,
        projectId: value.projectId,
        questionId: scope.question.id,
        category: scope.category,
        monitoringEdition: edition,
        expectedAmountFen: scope.amountFen,
      };
      const lockKey = JSON.stringify({
        ownerSessionId,
        projectId: value.projectId,
        questionId: scope.question.id,
        category: scope.category,
        monitoringEdition: edition,
        billingMonths: 1,
      });
      const mutationKey = `${ownerSessionId}:${value.projectId}`;
      const switchStartedAt = Date.now();
      pruneExpiringMap(servicePaymentSwitches, switchStartedAt, 20_000);
      const activeSwitch = servicePaymentSwitches.get(lockKey);
      let checkout: GeoPaymentCheckout;
      if (activeSwitch) {
        if (
          !safeSecretEqual(
            activeSwitch.authorizationDigest,
            authorizationDigest,
          ) ||
          activeSwitch.method !== input.method
        ) {
          throw new GeoHttpError(
            "当前支付方式正在切换，请等待完成后重试",
            409,
            "PAYMENT_SWITCH_IN_PROGRESS",
          );
        }
        checkout = await activeSwitch.promise;
      } else {
        const promise = withServicePaymentMutation(
          mutationKey,
          "online",
          async () => {
            try {
              return await paymentGateway.switchServiceCheckoutMethod(
                switchInput,
              );
            } catch (error) {
              if (
                error instanceof GeoPaymentVerificationError &&
                error.code === "PAYMENT_ALREADY_CONFIRMED"
              ) {
                const payment =
                  await paymentGateway.getServiceStatus(statusInput);
                if (
                  (payment.status === "paid" ||
                    payment.status === "review_required") &&
                  payment.orderId === currentOrder.orderId &&
                  payment.amountFen === currentOrder.amountFen
                ) {
                  await transitionProjectOrder(
                    value.projectId,
                    currentOrder.orderId,
                    payment.status,
                    { paidAt: payment.paidAt },
                  );
                }
              }
              throw error;
            }
          },
        );
        const switchFlight: MonitoringPaymentSwitchFlight = {
          authorizationDigest,
          method: input.method,
          expiresAt: switchStartedAt + PROJECT_TTL_MS,
          promise,
        };
        servicePaymentSwitches.set(lockKey, switchFlight);
        try {
          checkout = await promise;
        } finally {
          if (servicePaymentSwitches.get(lockKey) === switchFlight) {
            servicePaymentSwitches.delete(lockKey);
          }
        }
      }
      if (
        !safeSecretEqual(checkout.authorization, input.authorization) ||
        checkout.orderId !== currentOrder.orderId ||
        checkout.amountFen !== currentOrder.amountFen ||
        checkout.expiresAt !== currentOrder.checkoutExpiresAt ||
        checkout.fields.type !== input.method ||
        checkout.fields.param !== input.authorization ||
        checkout.fields.out_trade_no !== currentOrder.orderId
      ) {
        throw new GeoHttpError(
          "支付服务返回了不一致的切换结果，已阻止打开收银台",
          502,
          "PAYMENT_SWITCH_INVALID",
        );
      }

      const now = Date.now();
      pruneExpiringMap(serviceOrderLocks, now, 20_000);
      const lock = serviceOrderLocks.get(lockKey);
      if (
        lock?.checkout &&
        !safeSecretEqual(lock.checkout.authorization, input.authorization)
      ) {
        throw new GeoHttpError(
          "当前收银台已被另一项操作更新，请刷新后重试",
          409,
          "PAYMENT_CHECKOUT_REPLACED",
        );
      }
      serviceOrderLocks.set(lockKey, {
        ...lock,
        method: input.method,
        expiresAt: now + PROJECT_TTL_MS,
        checkout,
        checkoutCommitted: true,
        checkoutPromise: undefined,
      });
      trackServiceOrder(value);
      res.status(200).json({
        payment: {
          ...checkout,
          purchaseType: "service",
          category: scope.category,
          monitoringEdition: edition,
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
      assertServiceContractEvidence(value);
      const payment = await paymentGateway.getServiceStatus({
        authorization: input.authorization,
        ownerSessionId: String(res.locals.geoSessionId || ""),
        projectId: value.projectId,
        questionId: scope.question.id,
        category: scope.category,
        monitoringEdition: normalizedGeoMonitoringEdition(
          value.monitoringEdition,
        ),
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
    "/projects/:projectToken/services/payments/bank-transfer/confirm",
    requireConfiguration,
    requireSession,
    requireCostRate("service-bank-transfer-confirm", 8),
    asyncHandler(async (req, res) => {
      const openedValue = openOwnedProject(req, res);
      const value = latestServiceOrderValue(
        openedValue,
        projectOrderProtections.get(openedValue.projectId)?.service?.value,
      );
      const input = ConfirmServiceBankTransferRequestSchema.parse(req.body);
      const ownerSessionId = String(res.locals.geoSessionId || "");
      const confirmationKey = `${ownerSessionId}:${value.projectId}`;
      const confirmationNow = Date.now();
      pruneExpiringMap(failedBankTransferCodes, confirmationNow, 2000);
      const failedConfirmation = failedBankTransferCodes.get(confirmationKey);
      if (
        failedConfirmation &&
        failedConfirmation.resetAt > confirmationNow &&
        failedConfirmation.count >= 5
      ) {
        res.setHeader(
          "Retry-After",
          String(
            Math.max(
              1,
              Math.ceil((failedConfirmation.resetAt - confirmationNow) / 1000),
            ),
          ),
        );
        throw new GeoHttpError(
          "对公付款确认码尝试次数过多，请 15 分钟后再试",
          429,
          "BANK_TRANSFER_CODE_RATE_LIMITED",
        );
      }
      if (
        !safeSecretEqual(input.confirmationCode, bankTransferConfirmationCode)
      ) {
        const activeFailure =
          failedConfirmation && failedConfirmation.resetAt > confirmationNow
            ? failedConfirmation
            : { count: 0, resetAt: confirmationNow + 15 * 60 * 1000 };
        activeFailure.count += 1;
        failedBankTransferCodes.set(confirmationKey, activeFailure);
        pruneExpiringMap(failedBankTransferCodes, confirmationNow, 2000);
        throw new GeoHttpError(
          "对公付款确认码不正确，请联系管理员确认",
          403,
          "BANK_TRANSFER_CODE_INVALID",
        );
      }
      failedBankTransferCodes.delete(confirmationKey);

      const scope = await resolveServiceScope(value);
      const alreadyConfirmedBankTransfer =
        Boolean(value.serviceOrderId) &&
        value.serviceTradeNo?.startsWith("bank:") === true;
      if (value.serviceOrderId && !alreadyConfirmedBankTransfer) {
        throw new GeoHttpError(
          "在线付款已经确认，不能改为对公付款",
          409,
          "SERVICE_ALREADY_PAID",
        );
      }
      if (alreadyConfirmedBankTransfer) {
        if (
          !value.serviceManualOrderReference ||
          value.serviceQuestionId !== scope.question.id ||
          value.serviceCategory !== scope.category ||
          value.serviceAmountFen !== scope.amountFen ||
          !value.servicePaidAt ||
          (input.purchaseIntent && value.serviceAccountMode !== "bind_existing")
        ) {
          throw new GeoHttpError(
            "已确认的对公付款与当前服务范围不一致",
            409,
            "SERVICE_SCOPE_CONFLICT",
          );
        }
        trackServiceOrder(value);
        const replayProjectToken = codec.seal("project", value, PROJECT_TTL_MS);
        res
          .status(200)
          .json(
            await buildServicePaymentResult(value, scope, replayProjectToken),
          );
        return;
      }
      if (
        !value.serviceManualOrderReference ||
        value.serviceManualOrderStatus !== "payment_required"
      ) {
        throw new GeoHttpError(
          "合同尚未完成确认，不能确认对公付款",
          409,
          "SERVICE_PAYMENT_NOT_ALLOWED",
        );
      }
      assertServiceContractEvidence(value);
      await assertServiceWorkspaceReady();

      const edition = normalizedGeoMonitoringEdition(value.monitoringEdition);
      const directOrderId = serviceBankTransferOrderId({
        projectId: value.projectId,
        manualOrderReference: value.serviceManualOrderReference,
        questionId: scope.question.id,
        category: scope.category,
        monitoringEdition: edition,
        amountFen: scope.amountFen,
      });
      const projectOrders = await readProjectOrders(value.projectId);
      const authorizationDigest = input.authorization
        ? sha256(input.authorization)
        : "";
      const currentOrder = input.authorization
        ? projectOrders.orders.find(
            (order) =>
              order.purchaseType === "service" &&
              safeSecretEqual(order.authorizationDigest, authorizationDigest),
          )
        : projectOrders.orders.find(
            (order) =>
              order.purchaseType === "service" &&
              order.orderId === directOrderId,
          );
      if (input.authorization && !currentOrder) {
        throw new GeoHttpError(
          "未找到可改为对公付款的在线合同订单",
          409,
          "PAYMENT_CHECKOUT_NOT_FOUND",
        );
      }
      if (
        currentOrder &&
        (currentOrder.amountFen !== scope.amountFen ||
          currentOrder.purchaseType !== "service")
      ) {
        throw new GeoHttpError(
          "付款订单与当前服务范围不匹配",
          409,
          "PAYMENT_SCOPE_MISMATCH",
        );
      }
      if (
        currentOrder &&
        (currentOrder.state === "review_required" ||
          currentOrder.state === "terminal_failed" ||
          currentOrder.state === "closed")
      ) {
        throw new GeoHttpError(
          "该订单正在复核或已关闭，不能确认对公付款",
          409,
          currentOrder.state === "review_required"
            ? "PAYMENT_REVIEW_REQUIRED"
            : "PAYMENT_ALREADY_CONFIRMED",
        );
      }
      if (!input.authorization) {
        const conflictingOrder = projectOrders.orders.find(
          (order) =>
            order.purchaseType === "service" &&
            order.orderId !== directOrderId &&
            order.state !== "closed" &&
            order.state !== "terminal_failed",
        );
        if (conflictingOrder) {
          throw new GeoHttpError(
            "已有在线合同订单，请从该订单选择改为对公付款",
            409,
            "SERVICE_BANK_TRANSFER_AUTHORIZATION_REQUIRED",
          );
        }
      }

      const orderId = currentOrder?.orderId ?? directOrderId;
      const flightKey = `${ownerSessionId}:${value.projectId}`;
      const bankAuthorizationDigest = sha256(
        input.authorization || `direct:${orderId}`,
      );
      const purchaseIntentDigest = sha256(input.purchaseIntent || "create");
      pruneExpiringMap(serviceBankConfirmations, confirmationNow, 2000);
      const activeConfirmation = serviceBankConfirmations.get(flightKey);
      let result: ServicePaymentResult;
      if (activeConfirmation) {
        if (
          !safeSecretEqual(
            activeConfirmation.authorizationDigest,
            bankAuthorizationDigest,
          ) ||
          !safeSecretEqual(
            activeConfirmation.purchaseIntentDigest,
            purchaseIntentDigest,
          )
        ) {
          throw new GeoHttpError(
            "另一项对公付款确认正在处理，请等待完成后重试",
            409,
            "BANK_TRANSFER_CONFIRMATION_IN_PROGRESS",
          );
        }
        result = await activeConfirmation.promise;
      } else {
        const promise = withServicePaymentMutation(
          flightKey,
          "bank",
          async () => {
            if (!input.authorization) {
              await ensureDirectBankTransferOrder({
                value,
                orderId,
                questionId: scope.question.id,
                category: scope.category,
                monitoringEdition: edition,
                amountFen: scope.amountFen,
              });
            }
            const receipt = await paymentGateway.confirmServiceBankTransfer({
              ...(input.authorization
                ? { authorization: input.authorization }
                : {}),
              orderId,
              ownerSessionId,
              projectId: value.projectId,
              questionId: scope.question.id,
              category: scope.category,
              monitoringEdition: edition,
              expectedAmountFen: scope.amountFen,
            });
            return finalizeVerifiedServicePayment({
              value,
              scope,
              receipt,
              purchaseIntent: input.purchaseIntent,
              allowDirectBankOrder: false,
            });
          },
        );
        const confirmationFlight = {
          authorizationDigest: bankAuthorizationDigest,
          purchaseIntentDigest,
          expiresAt: confirmationNow + PROJECT_TTL_MS,
          promise,
        };
        serviceBankConfirmations.set(flightKey, confirmationFlight);
        try {
          result = await promise;
        } finally {
          if (serviceBankConfirmations.get(flightKey) === confirmationFlight) {
            serviceBankConfirmations.delete(flightKey);
          }
        }
      }
      res.status(201).json(result);
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
        res.json(
          await buildServicePaymentResult(
            value,
            scope,
            req.params.projectToken,
          ),
        );
        return;
      }
      if (
        !value.serviceManualOrderReference ||
        value.serviceManualOrderStatus !== "payment_required"
      ) {
        throw new GeoHttpError(
          "合同尚未完成确认，不能确认付款并开通服务",
          409,
          "SERVICE_PAYMENT_NOT_ALLOWED",
        );
      }
      assertServiceContractEvidence(value);

      const receipt = await paymentGateway.verifyService({
        authorization: input.authorization,
        ownerSessionId: String(res.locals.geoSessionId || ""),
        projectId: value.projectId,
        questionId: scope.question.id,
        category: scope.category,
        monitoringEdition: normalizedGeoMonitoringEdition(
          value.monitoringEdition,
        ),
        expectedAmountFen: scope.amountFen,
      });
      res.status(201).json(
        await finalizeVerifiedServicePayment({
          value,
          scope,
          receipt,
          purchaseIntent: input.purchaseIntent,
          allowDirectBankOrder: false,
        }),
      );
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
          ? await getResolvedMonitorRun(
              broker,
              nextValue.monitorRunId,
              monitorRunExpectation(nextValue),
            )
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
          scope.preResolvedOutputs,
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
            marketEdition: normalizedGeoMonitoringEdition(
              value.monitoringEdition,
            ),
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
          ? await getResolvedMonitorRun(
              broker,
              nextValue.monitorRunId,
              monitorRunExpectation(nextValue),
            )
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
          scope.preResolvedOutputs,
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
          ? await getResolvedMonitorRun(
              broker,
              value.monitorRunId,
              monitorRunExpectation(value),
            )
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
          scope.preResolvedOutputs,
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
        ? await getResolvedMonitorRun(
            broker,
            syncedValue.monitorRunId,
            monitorRunExpectation(syncedValue),
          )
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
        scope.preResolvedOutputs,
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
        ? await getResolvedMonitorRun(
            broker,
            nextValue.monitorRunId,
            monitorRunExpectation(nextValue),
          )
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
        scope.preResolvedOutputs,
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
      const upstream = await broker.downloadArtifact(archive.artifactId);
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
    requireSession,
    requireSessionRate("project-delete", 150, 10 * 60 * 1000),
    asyncHandler(async (req, res) => {
      const value = openOwnedProject(req, res);
      const reservationProjectIds = [
        value.projectId,
        industryRankingReservationProjectId(value.projectId),
      ];
      const reservations = await Promise.all(
        reservationProjectIds.map((projectId) =>
          monitorFreeReservationStore.get(projectId),
        ),
      );
      if (
        reservations.some(
          (reservation) =>
            reservation?.state === "submitting" && !reservation.runId,
        )
      ) {
        throw new GeoHttpError(
          "监控创建结果仍在确认，确认完成前不能删除项目",
          409,
          "PROJECT_DELETION_BLOCKED",
        );
      }
      await Promise.all(
        reservationProjectIds.map((projectId) =>
          monitorFreeReservationStore.fenceProjectDeletion(projectId),
        ),
      );
      await Promise.all(
        reservationProjectIds.map((projectId) =>
          monitorFreeReservationStore.purgeProject(projectId),
        ),
      );
      // Provider tasks, answers and uploaded evidence remain retained. Only
      // the two local free-monitor reservation identities are fenced and
      // released so neither perspective can be resumed after deletion.
      res.json({
        ok: true,
        projectId: value.projectId,
        retention: "provider_records_retained",
        reservationState: "released",
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
        error: {
          code: normalized.code,
          message: normalized.message,
          ...(normalized instanceof GeoBrokerError &&
          typeof normalized.retryable === "boolean"
            ? { retryable: normalized.retryable }
            : {}),
        },
        ...(error instanceof GeoCustomQuestionValidationStoreError &&
        error.activeOperation
          ? { activeOperation: error.activeOperation }
          : {}),
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

function publicGeoQuestion(
  question: GeoQuestion,
): Omit<GeoQuestion, "questionEnglish"> {
  const { questionEnglish: _legacyQuestionEnglish, ...publicQuestion } =
    question;
  return publicQuestion;
}

function mergeProjectQuestions(
  value: ProjectTokenValue,
  generatedQuestions: GeoQuestion[],
): GeoQuestion[] {
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
  const question = mergeProjectQuestions(value, generatedQuestions || []).find(
    (candidate) => candidate.id === questionId,
  );
  return question?.classificationState === "unclassified"
    ? undefined
    : question;
}

async function validateServiceAssessmentOutputs(
  broker: GeoPresalesBroker,
  question: GeoQuestion,
  assessmentTask: BrokerTask,
  forecastTask: BrokerTask,
  platforms: GeoMonitorPlatformId[],
  monitorRun?: BrokerMonitorRun,
) {
  const assessmentOutput = await parseScopedAssessmentTaskOutput(
    broker,
    assessmentTask,
    question,
    platforms,
    monitorRun,
  );
  const assessment = calculateCompleteAssessment(assessmentOutput);
  const forecastOutput = await resolveOptimizationOutcomeForecastTaskOutput(
    broker,
    forecastTask,
    {
      taskId: taskIdFrom(forecastTask),
    },
  );
  calculateCompleteForecast(assessment, forecastOutput);
  return { assessmentOutput, forecastOutput };
}

async function parseScopedAssessmentTaskOutput(
  broker: GeoPresalesBroker,
  task: BrokerTask,
  question: GeoQuestion,
  platforms: GeoMonitorPlatformId[],
  monitorRun?: BrokerMonitorRun,
) {
  const raw = await resolveAssessmentTaskOutput(broker, task, {
    taskId: taskIdFrom(task),
  });
  // The selected Website question is authoritative for ranking eligibility.
  // A provider may echo a broader flag or ranking values for another question
  // type; normalize those fields away instead of rejecting the whole semantic
  // asset assessment.
  const scoped =
    question.category === "industry_ranking"
      ? raw
      : {
          ...raw,
          question: {
            ...raw.question,
            rankingMetricEligible: false,
          },
          platformBreakdown: raw.platformBreakdown.map((platform) => ({
            ...platform,
            brandMentionRate: null,
            averageRank: null,
          })),
          rankingDiagnostics: {
            eligible: false,
            totalObservations: 0,
            rankedObservations: 0,
            unmentionedObservations: 0,
            averageRank: null,
            firstPlaceRate: null,
            top3Rate: null,
            top5Rate: null,
            competitorRankGap: null,
            calculationBasis: "非行业排名问题不计算品牌排名指标。",
          },
        };
  assertAssessmentOutputScope(scoped, {
    question: {
      id: question.id,
      text: question.question,
      category: question.category,
      rankingMetricEligible: question.category === "industry_ranking",
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

  const sourceCounts = monitorSourceCountsByPlatform(monitorRun);
  return {
    ...scoped,
    platformBreakdown: scoped.platformBreakdown.map((platform) => ({
      ...platform,
      sourceCount: sourceCounts.get(platform.platform) ?? 0,
    })),
  };
}

function monitorSourceCountsByPlatform(monitorRun: BrokerMonitorRun) {
  const sourceCounts = new Map<string, Set<string>>();
  for (const record of monitorRun.records || []) {
    if (record.status !== "completed") continue;
    const identities = sourceCounts.get(record.platform) || new Set<string>();
    for (const source of record.sources) {
      identities.add(
        source.url
          ? `url:${source.url}`
          : `label:${source.title || ""}\u0000${source.domain || ""}`,
      );
    }
    sourceCounts.set(record.platform, identities);
  }
  return new Map<string, number>(
    monitorRun.platforms.map((platform) => [
      platform,
      sourceCounts.get(platform)?.size ?? 0,
    ]),
  );
}

function publicAssessmentFailureCode(
  error: unknown,
):
  | "OUTPUT_FILE_UNAVAILABLE"
  | "INVALID_JSON"
  | "SCHEMA_MISMATCH"
  | "SCOPE_MISMATCH" {
  if (error instanceof ForecastTaskOutputValidationError) {
    return error.code;
  }
  if (error instanceof AssessmentTaskOutputValidationError) {
    return error.code === "NO_TRUSTED_OUTPUT" ? "INVALID_JSON" : error.code;
  }
  return "SCHEMA_MISMATCH";
}

function publicAssessmentValidationMessage(error: unknown) {
  switch (publicAssessmentFailureCode(error)) {
    case "OUTPUT_FILE_UNAVAILABLE":
      return "现状评估结果文件暂时无法读取，请稍后刷新或重新评估";
    case "INVALID_JSON":
      return "现状评估结果不是可识别的 JSON，请重新评估";
    case "SCOPE_MISMATCH":
      return "现状评估结果与本次问题或平台范围不一致，请重新评估";
    default:
      return "现状评估结果字段未通过校验，请重新评估";
  }
}

function publicForecastValidationMessage(error: unknown) {
  switch (publicAssessmentFailureCode(error)) {
    case "OUTPUT_FILE_UNAVAILABLE":
      return "优化效果评估结果文件暂时无法读取，请稍后刷新或重新评估";
    case "INVALID_JSON":
      return "优化效果评估结果不是可识别的 JSON，请重新评估";
    case "SCOPE_MISMATCH":
      return "优化效果评估结果与本次评估范围不一致，请重新评估";
    default:
      return "优化效果评估结果字段未通过校验，请重新评估";
  }
}

function logAssessmentOutputValidation(error: unknown, task?: BrokerTask) {
  if (process.env.NODE_ENV === "test") return;
  const diagnosticCode =
    error instanceof AssessmentTaskOutputValidationError ||
    error instanceof ForecastTaskOutputValidationError
      ? error.code
      : "ASSESSMENT_VALIDATION_FAILED";
  const issuePaths =
    error instanceof AssessmentTaskOutputValidationError
      ? error.issues.map((issue) => issue.path)
      : error instanceof ForecastTaskOutputValidationError
        ? error.issues.map((issue) => issue.path)
        : [];
  const diagnostics =
    error instanceof AssessmentTaskOutputValidationError ||
    error instanceof ForecastTaskOutputValidationError
      ? error.diagnostics
      : undefined;
  const taskId = task ? taskIdFrom(task) : undefined;
  console.warn("[GEO assessment]", {
    event: "assessment_output_validation_failed",
    diagnosticCode,
    issuePaths,
    ...(taskId
      ? {
          taskHash: crypto
            .createHash("sha256")
            .update(taskId)
            .digest("hex")
            .slice(0, 16),
        }
      : {}),
    ...(diagnostics
      ? {
          outputChannel: diagnostics.channel,
          outputByteCount: diagnostics.byteCount,
          outputFileCandidateCount: diagnostics.fileCandidateCount,
        }
      : {}),
  });
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
  preResolvedOutputs?: {
    assessment?: ReturnType<typeof resolveAssessmentTaskOutput>;
    forecast?: ReturnType<typeof resolveOptimizationOutcomeForecastTaskOutput>;
  },
  industryRankingMonitorRun?: BrokerMonitorRun,
  industryRankingAssessmentTask?: BrokerTask,
  industryRankingOptimizationForecastTask?: BrokerTask,
  industryRankingPreResolvedOutputs?: {
    assessment?: ReturnType<typeof resolveAssessmentTaskOutput>;
    forecast?: ReturnType<typeof resolveOptimizationOutcomeForecastTaskOutput>;
  },
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
  const industryRankingAssessmentTaskView = industryRankingAssessmentTask
    ? normalizeTask(industryRankingAssessmentTask, "assessment")
    : undefined;
  const industryRankingOptimizationForecastTaskView =
    industryRankingOptimizationForecastTask
      ? normalizeTask(
          industryRankingOptimizationForecastTask,
          "optimization-forecast",
        )
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
      value.knowledgeBaseCandidateFailure.category,
      value.knowledgeBaseCandidateFailure.message,
    );
  } else if (
    knowledgeBase.status === "completed" &&
    !archiveDescriptor &&
    !knowledgeBaseFinalizationFailure
  ) {
    knowledgeBaseValidationFailure = new KnowledgeBaseArchiveValidationError(
      "structure",
      "completed task does not contain a ZIP artifact",
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
  const knowledgeBaseValidationPublicError = knowledgeBaseValidationFailure
    ? KNOWLEDGE_BASE_VALIDATION_PUBLIC_ERRORS[
        knowledgeBaseValidationFailure.category
      ]
    : KNOWLEDGE_BASE_VALIDATION_PUBLIC_ERRORS.structure;
  const knowledgeBaseTaskFailure = ["failed", "cancelled"].includes(
    knowledgeBase.status,
  )
    ? knowledgeBaseTaskFailurePresentation(knowledgeBaseTask)
    : undefined;
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
        : knowledgeBaseTaskFailure
          ? {
              ...knowledgeBase,
              status: "failed" as const,
              progress: 100,
              error: knowledgeBaseTaskFailure.message,
            }
          : knowledgeBase;
  const executionKnowledgeBaseTask = knowledgeBaseFinalizationFailure
    ? {
        ...knowledgeBaseTask,
        status: "failed" as const,
        error: {
          code: KNOWLEDGE_BASE_FINALIZATION_PUBLIC_ERROR,
          retryable: true,
        },
      }
    : knowledgeBaseValidationFailure
      ? {
          ...knowledgeBaseTask,
          status: "failed" as const,
          error: { code: knowledgeBaseValidationPublicError, retryable: false },
        }
      : knowledgeBaseTaskFailure
        ? {
            ...knowledgeBaseTask,
            status: "failed" as const,
            error: {
              code: knowledgeBaseTaskFailure.message,
              retryable: false,
            },
          }
        : knowledgeBaseTask;
  const generatedQuestions =
    questionTask && questionsTaskView?.status === "completed"
      ? parseQuestionSetFromTask(questionTask)?.questions
      : undefined;
  const questionResultQuality =
    questionTask && questionsTaskView?.status === "completed"
      ? questionSetQualityFromTask(questionTask)
      : null;
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
  const industryRankingQuestion =
    questions && value.industryRankingQuestionId
      ? questions.find(
          (question) =>
            question.id === value.industryRankingQuestionId &&
            question.category === "industry_ranking",
        )
      : undefined;
  const serviceCategory =
    serviceQuestion?.category === "reputation" ||
    serviceQuestion?.category === "product_scenario" ||
    serviceQuestion?.category === "competitor_comparison"
      ? serviceQuestion.category
      : undefined;
  let assessmentOutputPromise = preResolvedOutputs?.assessment;
  const resolveAssessmentOutputForView =
    assessmentTask && assessmentTaskView?.status === "completed"
      ? () => {
          assessmentOutputPromise ??=
            serviceQuestion && monitorRun
              ? parseScopedAssessmentTaskOutput(
                  broker,
                  assessmentTask,
                  serviceQuestion,
                  monitorRun.platforms,
                  monitorRun,
                )
              : resolveAssessmentTaskOutput(broker, assessmentTask, {
                  taskId: taskIdFrom(assessmentTask),
                });
          return assessmentOutputPromise;
        }
      : undefined;
  let forecastOutputPromise = preResolvedOutputs?.forecast;
  const resolveForecastOutputForView =
    optimizationForecastTask &&
    optimizationForecastTaskView?.status === "completed"
      ? () => {
          forecastOutputPromise ??=
            resolveOptimizationOutcomeForecastTaskOutput(
              broker,
              optimizationForecastTask,
              { taskId: taskIdFrom(optimizationForecastTask) },
            );
          return forecastOutputPromise;
        }
      : undefined;
  let industryRankingAssessmentOutputPromise =
    industryRankingPreResolvedOutputs?.assessment;
  const resolveIndustryRankingAssessmentOutputForView =
    industryRankingAssessmentTask &&
    industryRankingAssessmentTaskView?.status === "completed"
      ? () => {
          industryRankingAssessmentOutputPromise ??=
            industryRankingQuestion && industryRankingMonitorRun
              ? parseScopedAssessmentTaskOutput(
                  broker,
                  industryRankingAssessmentTask,
                  industryRankingQuestion,
                  industryRankingMonitorRun.platforms,
                  industryRankingMonitorRun,
                )
              : resolveAssessmentTaskOutput(
                  broker,
                  industryRankingAssessmentTask,
                  { taskId: taskIdFrom(industryRankingAssessmentTask) },
                );
          return industryRankingAssessmentOutputPromise;
        }
      : undefined;
  let industryRankingForecastOutputPromise =
    industryRankingPreResolvedOutputs?.forecast;
  const resolveIndustryRankingForecastOutputForView =
    industryRankingOptimizationForecastTask &&
    industryRankingOptimizationForecastTaskView?.status === "completed"
      ? () => {
          industryRankingForecastOutputPromise ??=
            resolveOptimizationOutcomeForecastTaskOutput(
              broker,
              industryRankingOptimizationForecastTask,
              { taskId: taskIdFrom(industryRankingOptimizationForecastTask) },
            );
          return industryRankingForecastOutputPromise;
        }
      : undefined;
  let serviceAssessmentReady = false;
  if (
    knowledgeBaseManifest &&
    serviceQuestion &&
    serviceCategory &&
    value.assessmentVersion === 2 &&
    value.optimizationForecastVersion === 2 &&
    assessmentTask &&
    optimizationForecastTask &&
    assessmentTaskView?.status === "completed" &&
    optimizationForecastTaskView?.status === "completed" &&
    resolveAssessmentOutputForView &&
    resolveForecastOutputForView
  ) {
    try {
      const assessment = calculateCompleteAssessment(
        await resolveAssessmentOutputForView(),
      );
      calculateCompleteForecast(
        assessment,
        await resolveForecastOutputForView(),
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
        ? geoServiceMonthlyPriceFen(
            value.serviceCategory,
            value.monitoringEdition,
          )
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
    (() => {
      const productExists = Boolean(
        value.monitorQuestionId ||
          monitorRun ||
          assessmentTaskView ||
          optimizationForecastTaskView,
      );
      const industryExists = Boolean(
        value.industryRankingQuestionId ||
          industryRankingMonitorRun ||
          industryRankingAssessmentTaskView ||
          industryRankingOptimizationForecastTaskView,
      );
      const productFailed = Boolean(
        (assessmentTaskView &&
          ["failed", "cancelled"].includes(assessmentTaskView.status)) ||
          (optimizationForecastTaskView &&
            ["failed", "cancelled"].includes(
              optimizationForecastTaskView.status,
            )) ||
          (monitorRun &&
            ["remote_failed", "shape_mismatch"].includes(monitorRun.status)),
      );
      const industryFailed = Boolean(
        (industryRankingAssessmentTaskView &&
          ["failed", "cancelled"].includes(
            industryRankingAssessmentTaskView.status,
          )) ||
          (industryRankingOptimizationForecastTaskView &&
            ["failed", "cancelled"].includes(
              industryRankingOptimizationForecastTaskView.status,
            )) ||
          (industryRankingMonitorRun &&
            ["remote_failed", "shape_mismatch"].includes(
              industryRankingMonitorRun.status,
            )),
      );
      const activeFailures = [
        ...(productExists ? [productFailed] : []),
        ...(industryExists ? [industryFailed] : []),
      ];
      return activeFailures.length > 0 && activeFailures.every(Boolean);
    })() ||
    invalidQuestionResult;
  const taskProjectStatus = (taskStatus: string) =>
    statusSyncPending(taskStatus) ? "running" : taskStatus;
  const perspectiveProjectStatus = (
    run: BrokerMonitorRun | undefined,
    assessmentView: ReturnType<typeof normalizeTask> | undefined,
    forecastView: ReturnType<typeof normalizeTask> | undefined,
  ) => {
    if (forecastView) return taskProjectStatus(forecastView.status);
    if (assessmentView) return taskProjectStatus(assessmentView.status);
    if (
      run &&
      [
        "submission_in_progress",
        "submission_unknown",
        "submitted",
        "polling",
      ].includes(run.status)
    ) {
      return "running";
    }
    if (run) {
      return ["remote_failed", "shape_mismatch"].includes(run.status)
        ? "failed"
        : "completed";
    }
    return undefined;
  };
  const perspectiveStatuses = [
    perspectiveProjectStatus(
      monitorRun,
      assessmentTaskView,
      optimizationForecastTaskView,
    ),
    perspectiveProjectStatus(
      industryRankingMonitorRun,
      industryRankingAssessmentTaskView,
      industryRankingOptimizationForecastTaskView,
    ),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const status = failed
    ? "failed"
    : perspectiveStatuses.includes("running")
      ? "running"
      : perspectiveStatuses.some((candidate) => candidate !== "failed")
        ? "completed"
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
      : assessmentTask || industryRankingAssessmentTask
        ? "current_assessment"
        : monitorRun || industryRankingMonitorRun
          ? "monitoring"
          : knowledgeBaseManifest
            ? "question_recommendation"
            : "enterprise_analysis";
  const publicMonitoringFor = (
    run: BrokerMonitorRun | undefined,
    perspective: "product-opinion" | "industry-ranking",
  ) => {
    if (!run) return undefined;
    const view = toPublicMonitorView(run);
    return {
      ...view,
      ...(value.monitorRegion ? { region: value.monitorRegion } : {}),
      screenshotEnabled: Boolean(value.monitorScreenshotEnabled),
      records: view.records?.map((record) => ({
        ...record,
        ...(value.monitorScreenshotEnabled && record.screenshotAvailable
          ? {
              screenshotUrl: `/api/geo/projects/${encodeURIComponent(
                projectToken,
              )}/monitoring/${perspective}/records/${encodeURIComponent(
                record.recordId,
              )}/screenshot`,
            }
          : {}),
      })),
    };
  };
  const publicMonitoring = publicMonitoringFor(monitorRun, "product-opinion");
  const publicIndustryRankingMonitoring = publicMonitoringFor(
    industryRankingMonitorRun,
    "industry-ranking",
  );
  const publicAssessment = assessmentTask
    ? await toPublicAssessmentView(
        broker,
        assessmentTask,
        serviceQuestion,
        monitorRun,
        resolveAssessmentOutputForView,
      )
    : undefined;
  const publicOptimizationForecast =
    optimizationForecastTask && assessmentTask
      ? await toPublicOptimizationForecastView(
          broker,
          optimizationForecastTask,
          assessmentTask,
          serviceQuestion,
          monitorRun,
          resolveAssessmentOutputForView,
          resolveForecastOutputForView,
        )
      : undefined;
  const publicIndustryRankingAssessment = industryRankingAssessmentTask
    ? await toPublicAssessmentView(
        broker,
        industryRankingAssessmentTask,
        industryRankingQuestion,
        industryRankingMonitorRun,
        resolveIndustryRankingAssessmentOutputForView,
      )
    : undefined;
  const publicIndustryRankingOptimizationForecast =
    industryRankingOptimizationForecastTask && industryRankingAssessmentTask
      ? await toPublicOptimizationForecastView(
          broker,
          industryRankingOptimizationForecastTask,
          industryRankingAssessmentTask,
          industryRankingQuestion,
          industryRankingMonitorRun,
          resolveIndustryRankingAssessmentOutputForView,
          resolveIndustryRankingForecastOutputForView,
        )
      : undefined;
  const isCompleteAssessmentView =
    publicAssessment?.status === "ready" &&
    publicAssessment.quality?.completeness === "complete";
  const isCompleteForecastView =
    publicOptimizationForecast?.status === "ready" &&
    publicOptimizationForecast.quality?.completeness === "complete";
  const questionRetryAvailable =
    Boolean(questionTask) &&
    (invalidQuestionResult ||
      ["failed", "cancelled"].includes(questionsTaskView?.status || ""));
  const assessmentRetryAvailable =
    Boolean(assessmentTask) &&
    assessmentTaskView?.status !== "unknown" &&
    (publicAssessment?.status === "failed" ||
      publicAssessment?.quality?.completeness === "partial" ||
      ["failed", "cancelled"].includes(assessmentTaskView?.status || ""));
  const optimizationForecastRetryAvailable =
    Boolean(optimizationForecastTask) &&
    (value.optimizationForecastAttempt || 1) <
      MAX_OPTIMIZATION_FORECAST_ATTEMPTS &&
    optimizationForecastTaskView?.status !== "unknown" &&
    (publicOptimizationForecast?.status === "failed" ||
      publicOptimizationForecast?.quality?.completeness === "partial" ||
      ["failed", "cancelled"].includes(
        optimizationForecastTaskView?.status || "",
      ));
  const industryRankingAssessmentRetryAvailable =
    Boolean(industryRankingAssessmentTask) &&
    industryRankingAssessmentTaskView?.status !== "unknown" &&
    (publicIndustryRankingAssessment?.status === "failed" ||
      publicIndustryRankingAssessment?.quality?.completeness === "partial" ||
      ["failed", "cancelled"].includes(
        industryRankingAssessmentTaskView?.status || "",
      ));
  const industryRankingOptimizationForecastRetryAvailable =
    Boolean(industryRankingOptimizationForecastTask) &&
    (value.industryRankingOptimizationForecastAttempt || 1) <
      MAX_OPTIMIZATION_FORECAST_ATTEMPTS &&
    industryRankingOptimizationForecastTaskView?.status !== "unknown" &&
    (publicIndustryRankingOptimizationForecast?.status === "failed" ||
      publicIndustryRankingOptimizationForecast?.quality?.completeness ===
        "partial" ||
      ["failed", "cancelled"].includes(
        industryRankingOptimizationForecastTaskView?.status || "",
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
      questionResultInvalid: invalidQuestionResult,
      assessmentReady: isCompleteAssessmentView,
      assessmentFailureCode:
        publicAssessment?.status === "failed"
          ? publicAssessment.failureCode
          : undefined,
      assessmentSummary: isCompleteAssessmentView
        ? publicAssessment.summary
        : undefined,
      comparisonCount: isCompleteAssessmentView
        ? publicAssessment.comparisons.length
        : undefined,
      forecastReady: isCompleteForecastView,
      forecastSummary: isCompleteForecastView
        ? publicOptimizationForecast.summary
        : undefined,
      serviceActivatedAt: serviceActive
        ? value.serviceActivatedAt || value.serviceProvisionedAt
        : undefined,
    },
  });
  const questionExecutionEntry = executionLog.entries.find(
    (entry) => entry.id === "question-recommendation",
  );
  const questionFailureCode = String(questionsTaskView?.failure?.code || "")
    .trim()
    .toUpperCase();
  const questionFailureKind =
    invalidQuestionResult ||
    [
      "RESULT_INVALID_OR_MISSING",
      "RESULT_COORDINATE_AMBIGUOUS",
      // Read-only compatibility for tasks that reached the legacy repair
      // terminal before same-task repair was removed. No repair is attempted.
      "TASK_REPAIR_EXHAUSTED",
    ].includes(questionFailureCode) ||
    (questionFailureCode.includes("QUESTION") &&
      questionFailureCode.includes("VALIDATION"))
      ? "result_invalid"
      : "provider_unavailable";
  const questionRecommendation = !questionTask
    ? ({ status: "not_started" } as const)
    : generatedQuestions?.length
      ? ({
          status: "ready",
          startedAt:
            questionTask.providerStartedAt ?? value.questionSubmittedAt,
          terminalAt:
            questionTask.terminalAt ?? questionExecutionEntry?.completedAt,
          ...(questionResultQuality ? { quality: questionResultQuality } : {}),
        } as const)
      : invalidQuestionResult
        ? ({
            status: "failed",
            startedAt:
              questionTask.providerStartedAt ?? value.questionSubmittedAt,
            terminalAt:
              questionTask.terminalAt ?? questionExecutionEntry?.completedAt,
            failureKind: "result_invalid",
          } as const)
        : ["failed", "cancelled"].includes(questionsTaskView?.status || "")
          ? ({
              status: "failed",
              startedAt:
                questionTask.providerStartedAt ?? value.questionSubmittedAt,
              terminalAt:
                questionTask.terminalAt ?? questionExecutionEntry?.completedAt,
              failureKind: questionFailureKind,
            } as const)
          : ({
              status: "pending",
              startedAt:
                questionTask.providerStartedAt ?? value.questionSubmittedAt,
            } as const);
  const publicKnowledgeImportMessage =
    value.serviceKnowledgeImportStatus === "failed"
      ? undefined
      : value.serviceKnowledgeImportMessage;

  return {
    id: value.projectId,
    createdAt: value.knowledgeBaseSubmittedAt,
    companyName: value.companyName,
    monitoringEdition: normalizedGeoMonitoringEdition(value.monitoringEdition),
    monitoringRegion: value.monitorRegion,
    monitoringScreenshotEnabled: Boolean(value.monitorScreenshotEnabled),
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
    industryRankingAssessmentTask: industryRankingAssessmentTaskView
      ? { ...industryRankingAssessmentTaskView, output: [] }
      : undefined,
    industryRankingOptimizationForecastTask:
      industryRankingOptimizationForecastTaskView
        ? { ...industryRankingOptimizationForecastTaskView, output: [] }
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
    questionRecommendation,
    questions: questions?.map(publicGeoQuestion),
    selectedQuestionId: value.monitorQuestionId,
    selectedIndustryRankingQuestionId: value.industryRankingQuestionId,
    selectedPlatformIds: value.monitorPlatformIds || [],
    knowledgeBaseValidationCategory: knowledgeBaseValidationFailure?.category,
    knowledgeBaseSupportRequired:
      Boolean(knowledgeBaseFinalizationFailure) ||
      Boolean(knowledgeBaseValidationFailure) ||
      knowledgeBaseTaskFailure?.supportRequired === true ||
      (!knowledgeBaseFinalizationFailure &&
        statusSyncPending(knowledgeBase.status) &&
        hasElapsed(value.knowledgeBaseSubmittedAt, 15 * 60 * 1_000)),
    error: knowledgeBaseFinalizationFailure
      ? KNOWLEDGE_BASE_FINALIZATION_PUBLIC_ERROR
      : knowledgeBaseValidationFailure
        ? knowledgeBaseValidationPublicError
        : knowledgeBaseTaskFailure?.message,
    knowledgeBaseFinalization: {
      finalizationState:
        value.knowledgeBaseFinalization?.state ??
        (knowledgeBaseManifest ? "completed" : "pending"),
      finalizerVersion:
        value.knowledgeBaseFinalization?.finalizerVersion ??
        value.knowledgeBaseArtifact?.finalizerVersion ??
        (value.knowledgeBaseSkillVersion === WEBSITE_KB_SKILL_VERSION
          ? WEBSITE_KB_FINALIZER_VERSION
          : WEBSITE_KB_FINALIZER_V3_VERSION),
      candidateSha256:
        value.knowledgeBaseFinalization?.candidateSha256 ??
        value.knowledgeBaseArtifact?.candidate.sha256,
      errorCode: value.knowledgeBaseFinalization?.errorCode,
    },
    questionRetryAvailable,
    assessmentRetryAvailable,
    optimizationForecastRetryAvailable,
    industryRankingAssessmentRetryAvailable,
    industryRankingOptimizationForecastRetryAvailable,
    assessmentUpdatingToVersion2: Boolean(
      value.assessmentUpgradeFromV1 && publicAssessment?.status !== "ready",
    ),
    monitoring: publicMonitoring,
    industryRankingMonitoring: publicIndustryRankingMonitoring,
    assessment: publicAssessment,
    industryRankingAssessment: publicIndustryRankingAssessment,
    optimizationForecast: publicOptimizationForecast,
    industryRankingOptimizationForecast:
      publicIndustryRankingOptimizationForecast,
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
            contractAuthorizationMode: value.serviceContractAuthorizationMode,
            contractAuthorizedAt: value.serviceContractAuthorizedAt,
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
                  message: publicKnowledgeImportMessage,
                  updatedAt: value.serviceKnowledgeImportUpdatedAt,
                }
              : undefined,
            error:
              manualActivationStatus === "failed"
                ? value.serviceManualOrderMessage ||
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
                      message: publicKnowledgeImportMessage,
                      updatedAt: value.serviceKnowledgeImportUpdatedAt,
                    }
                  : undefined,
              error:
                v2ActivationStatus === "failed"
                  ? value.serviceProvisioningMessage || "服务开通未完成，请重试"
                  : undefined,
            }
          : serviceAssessmentReady && serviceCategory && serviceQuestion
            ? {
                status: "not_started",
                category: serviceCategory,
                amountFen: geoServiceMonthlyPriceFen(
                  serviceCategory,
                  value.monitoringEdition,
                ),
                billingMonths: 1,
                questionId: serviceQuestion.id,
              }
            : undefined,
    questionValidationError: invalidQuestionResult
      ? "推荐任务未返回可展示的问题，请联系技术支持"
      : undefined,
  };
}

async function toPublicAssessmentView(
  broker: GeoPresalesBroker,
  task: BrokerTask,
  question?: GeoQuestion,
  monitorRun?: BrokerMonitorRun,
  resolveRaw?: () => ReturnType<typeof resolveAssessmentTaskOutput>,
) {
  const taskView = normalizeTask(task, "assessment");
  if (taskView.status !== "completed") {
    const syncing = ["unknown", "waiting"].includes(taskView.status);
    return {
      status: syncing ? ("running" as const) : taskView.status,
      dimensions: {},
      comparisons: [],
      error:
        syncing || !taskView.failure
          ? undefined
          : "现状评估任务未能完成，请联系技术支持。",
    };
  }
  try {
    const raw = resolveRaw
      ? await resolveRaw()
      : question && monitorRun
        ? await parseScopedAssessmentTaskOutput(
            broker,
            task,
            question,
            monitorRun.platforms,
            monitorRun,
          )
        : await resolveAssessmentTaskOutput(broker, task, {
            taskId: taskIdFrom(task),
          });
    if (raw.schemaVersion !== 2) {
      return {
        status: "not_started" as const,
        dimensions: {},
        comparisons: [],
      };
    }
    const result = calculateCompleteAssessment(raw);
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
    const narratives = result.customerNarratives;
    return {
      status: "ready",
      schemaVersion: 2 as const,
      quality: {
        completeness: "complete" as const,
        downstreamEligible: true,
      },
      totalScore: result.overview.score,
      grade: result.overview.grade,
      coverage: result.overview.coverage.ratio,
      confidence:
        confidenceScore >= 0.75
          ? "high"
          : confidenceScore >= 0.5
            ? "medium"
            : "low",
      scopeLabel: result.scope.label,
      summary: publicAssessmentText(
        result.overview.executiveSummary,
        "当前问题已完成回答、知识事实与来源核验。",
      ),
      executiveSummary: publicAssessmentText(
        result.overview.executiveSummary,
        "当前问题已完成回答、知识事实与来源核验。",
      ),
      dimensions: Object.fromEntries(
        dimensionEntries.map(([id, dimension]) => [
          id,
          {
            id,
            label: dimension.label,
            score: dimension.score,
            maxScore: dimension.maxScore,
            coverage: dimension.coverage,
            summary: publicAssessmentText(
              narratives?.[
                id === "semantic_visibility"
                  ? "semanticVisibility"
                  : id === "semantic_coherence"
                    ? "semanticCoherence"
                    : id === "semantic_richness"
                      ? "semanticRichness"
                      : id === "semantic_authority"
                        ? "semanticAuthority"
                        : "competitiveAdvantage"
              ]?.currentFinding,
              "本维度已依据当前回答与知识库完成核验。",
            ),
            currentFinding: publicAssessmentText(
              narratives?.[
                id === "semantic_visibility"
                  ? "semanticVisibility"
                  : id === "semantic_coherence"
                    ? "semanticCoherence"
                    : id === "semantic_richness"
                      ? "semanticRichness"
                      : id === "semantic_authority"
                        ? "semanticAuthority"
                        : "competitiveAdvantage"
              ]?.currentFinding,
              "本维度已依据当前回答与知识库完成核验。",
            ),
            nextAction: publicAssessmentText(
              narratives?.[
                id === "semantic_visibility"
                  ? "semanticVisibility"
                  : id === "semantic_coherence"
                    ? "semanticCoherence"
                    : id === "semantic_richness"
                      ? "semanticRichness"
                      : id === "semantic_authority"
                        ? "semanticAuthority"
                        : "competitiveAdvantage"
              ]?.nextAction,
              "本月围绕该维度补齐可核验内容，并在同口径下复测。",
            ),
          },
        ]),
      ),
      comparisons: result.knowledgeVsAnswers.map((comparison) => ({
        id: comparison.id,
        topic: publicAssessmentText(
          comparison.topic || comparison.kbClaimText,
          comparison.verdict === "unverifiable"
            ? "AI 新增但知识库未证实"
            : "知识库事实对照",
        ),
        status: verdictStatus[comparison.verdict],
        knowledgeBaseFact: publicAssessmentText(
          comparison.kbClaimText,
          "知识库暂未提供对应事实。",
        ),
        answerExcerpt: publicAssessmentText(
          comparison.answerExcerpt,
          "当前回答未直接覆盖该事实。",
        ),
        explanation: publicAssessmentText(
          comparison.explanation,
          "已完成该项事实与回答对照。",
        ),
        answerFinding: publicAssessmentText(
          comparison.explanation || comparison.answerExcerpt,
          "已完成该项事实与回答对照。",
        ),
        recommendedAction: publicAssessmentText(
          comparison.recommendedAction,
          "补充清晰、可追溯的事实说明。",
        ),
        platforms:
          comparison.platform && allowedPlatforms.has(comparison.platform)
            ? [comparison.platform]
            : [],
      })),
      platformBreakdown: result.platformBreakdown.map((platform) => ({
        platform: platform.platform,
        responseCount: platform.responseCount,
        successfulResponses: platform.successfulResponses,
        ...(question?.category === "industry_ranking"
          ? {
              brandMentionRate: platform.brandMentionRate,
              averageRank: platform.averageRank,
            }
          : {}),
        factAccuracy: platform.factAccuracy,
        propositionHitRate: platform.propositionHitRate,
        sourceCount: platform.sourceCount,
        sentiment: platform.sentiment,
        verdict: publicAssessmentText(
          platform.verdict,
          "平台回答已完成事实与来源核验。",
        ),
      })),
      priorityActions: result.priorityActions.map((action) => ({
        priority: action.priority,
        dimension: action.dimension,
        action: publicAssessmentText(action.action, "补齐该维度的可核验内容。"),
        expectedImpact: publicAssessmentText(
          action.expectedImpact,
          "提升回答的准确性与可追溯性。",
        ),
      })),
      limitations: [
        "本结果反映当前问题在所选平台的回答表现，不代表全网自然排名。",
      ],
    };
  } catch (error) {
    logAssessmentOutputValidation(error, task);
    const partial =
      question && monitorRun
        ? buildAssessmentDisplayOnlyProjection(task, {
            question: {
              id: question.id,
              text: question.question,
              category: question.category,
              rankingMetricEligible: question.category === "industry_ranking",
            },
            platforms: monitorRun.platforms,
            successfulResponses: monitorRun.completedItems,
            failedResponses: monitorRun.failedItems,
            sourceCountByPlatform: monitorSourceCountsByPlatform(monitorRun),
          })
        : undefined;
    if (partial) {
      const dimensionMetadata = {
        semanticVisibility: {
          id: "semantic_visibility",
          label: "语义可见度",
        },
        semanticCoherence: {
          id: "semantic_coherence",
          label: "语义一致性",
        },
        semanticRichness: {
          id: "semantic_richness",
          label: "语义多样性与深度",
        },
        semanticAuthority: {
          id: "semantic_authority",
          label: "语义权威性",
        },
        competitiveAdvantage: {
          id: "competitive_advantage",
          label: "竞品占优度",
        },
      } as const;
      const verdictStatus = {
        supported: "aligned",
        contradicted: "conflict",
        omitted: "missing",
        unverifiable: "opportunity",
      } as const;
      const allowedPlatforms = new Set<string>(GEO_MONITOR_PLATFORM_IDS);
      return {
        status: "ready" as const,
        schemaVersion: 2 as const,
        quality: {
          completeness: "partial" as const,
          warnings: [
            { code: "RESULT_INCOMPLETE" as const, area: "assessment" },
            { code: "AGGREGATE_UNAVAILABLE" as const, area: "assessment" },
          ],
          downstreamEligible: false,
        },
        summary: partial.executiveSummary,
        executiveSummary: partial.executiveSummary,
        dimensions: Object.entries(partial.dimensionNarratives).map(
          ([key, narrative]) => ({
            ...dimensionMetadata[key as keyof typeof dimensionMetadata],
            currentFinding: narrative.currentFinding,
            summary: narrative.currentFinding,
            nextAction: narrative.nextAction,
          }),
        ),
        comparisons: partial.knowledgeVsAnswers.map((comparison) => ({
          id: comparison.id,
          topic: publicAssessmentText(
            comparison.topic || comparison.kbClaimText,
            "知识库事实对照",
          ),
          status: verdictStatus[comparison.verdict],
          knowledgeBaseFact: publicAssessmentText(
            comparison.kbClaimText,
            "知识库暂未提供对应事实。",
          ),
          answerExcerpt: publicAssessmentText(
            comparison.answerExcerpt,
            "当前回答未直接覆盖该事实。",
          ),
          explanation: publicAssessmentText(
            comparison.explanation,
            "已完成该项事实与回答对照。",
          ),
          answerFinding: publicAssessmentText(
            comparison.explanation || comparison.answerExcerpt,
            "已完成该项事实与回答对照。",
          ),
          recommendedAction: publicAssessmentText(
            comparison.recommendedAction,
            "补充清晰、可追溯的事实说明。",
          ),
          platforms:
            comparison.platform && allowedPlatforms.has(comparison.platform)
              ? [comparison.platform]
              : [],
        })),
        platformBreakdown: partial.platformBreakdown.map((platform) => {
          const {
            brandMentionRate: _brandMentionRate,
            averageRank: _averageRank,
            ...basePlatform
          } = platform;
          return {
            ...basePlatform,
            ...(question?.category === "industry_ranking"
              ? {
                  brandMentionRate: platform.brandMentionRate,
                  averageRank: platform.averageRank,
                }
              : {}),
            verdict: publicAssessmentText(
              platform.verdict,
              "当前平台已返回可展示的观察结论。",
            ),
          };
        }),
        priorityActions: partial.priorityActions.map((action) => ({
          priority: action.priority,
          dimension: action.dimension,
          action: publicAssessmentText(
            action.action,
            "补齐该维度的可核验内容。",
          ),
          expectedImpact: publicAssessmentText(
            action.expectedImpact,
            "提升回答的准确性与可追溯性。",
          ),
        })),
        limitations: Array.from(
          new Set([
            ...partial.limitations,
            "本次仅展示已通过逐项校验的文字与行动；聚合分数、等级和预测入口不可用。",
          ]),
        ),
      };
    }
    return {
      status: "failed",
      dimensions: {},
      comparisons: [],
      error: publicAssessmentValidationMessage(error),
      failureCode: publicAssessmentFailureCode(error),
    };
  }
}

async function toPublicOptimizationForecastView(
  broker: GeoPresalesBroker,
  task: BrokerTask,
  assessmentTask: BrokerTask,
  question?: GeoQuestion,
  monitorRun?: BrokerMonitorRun,
  resolveAssessmentRaw?: () => ReturnType<typeof resolveAssessmentTaskOutput>,
  resolveForecastRaw?: () => ReturnType<
    typeof resolveOptimizationOutcomeForecastTaskOutput
  >,
) {
  const taskView = normalizeTask(task, "optimization-forecast");
  if (taskView.status !== "completed") {
    const syncing = ["unknown", "waiting"].includes(taskView.status);
    return {
      status: syncing ? ("running" as const) : taskView.status,
      dimensions: [],
      assumptions: [],
      roadmap: [],
      error:
        syncing || !taskView.failure
          ? undefined
          : "优化效果评估任务未能完成，请联系技术支持。",
    };
  }

  let completeAssessmentAvailable = false;
  try {
    const rawAssessment = resolveAssessmentRaw
      ? await resolveAssessmentRaw()
      : question && monitorRun
        ? await parseScopedAssessmentTaskOutput(
            broker,
            assessmentTask,
            question,
            monitorRun.platforms,
            monitorRun,
          )
        : await resolveAssessmentTaskOutput(broker, assessmentTask, {
            taskId: taskIdFrom(assessmentTask),
          });
    const assessment = calculateCompleteAssessment(rawAssessment);
    completeAssessmentAvailable = true;
    const rawForecast = resolveForecastRaw
      ? await resolveForecastRaw()
      : await resolveOptimizationOutcomeForecastTaskOutput(broker, task, {
          taskId: taskIdFrom(task),
        });
    if (rawForecast.schemaVersion !== 2) {
      return {
        status: "not_started" as const,
        dimensions: [],
        assumptions: [],
        roadmap: [],
      };
    }
    const result = calculateCompleteForecast(assessment, rawForecast);
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
    const narrativeKeyById = {
      semantic_visibility: "semanticVisibility",
      semantic_coherence: "semanticCoherence",
      semantic_richness: "semanticRichness",
      semantic_authority: "semanticAuthority",
      competitive_advantage: "competitiveAdvantage",
    } as const;
    const brandMentionRateObservation =
      question?.category === "industry_ranking" && monitorRun
        ? monitorBrandMentionRate(monitorRun)
        : undefined;
    const rawBrandMentionRateTarget = rawForecast.brandMentionRateTarget;
    const brandMentionRateForecast = buildBrandMentionRateForecast(
      brandMentionRateObservation,
      rawBrandMentionRateTarget,
    );
    return {
      status: "ready",
      schemaVersion: 2 as const,
      quality: {
        completeness: "complete" as const,
        downstreamEligible: true,
      },
      horizonWeeks: result.horizonWeeks,
      currentScore: result.applicableTotal.current,
      targetLow: result.applicableTotal.low,
      targetExpected: result.applicableTotal.expected,
      targetHigh: result.applicableTotal.high,
      summary: publicAssessmentText(
        result.executiveSummary,
        "本月将围绕当前缺口补齐内容与来源，并在第 4 周按相同口径复测。",
      ),
      executiveSummary: publicAssessmentText(
        result.executiveSummary,
        "本月将围绕当前缺口补齐内容与来源，并在第 4 周按相同口径复测。",
      ),
      targetCondition:
        "本区间是完成四周路线后的规划目标，不是效果承诺；第 4 周将按相同问题、平台和采样次数复测确认。",
      ...(brandMentionRateForecast ? { brandMentionRateForecast } : {}),
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
            summary: publicAssessmentText(
              result.customerNarratives?.[narrativeKeyById[id]]?.currentFinding,
              "当前表现已按本题证据完成核验。",
            ),
            currentFinding: publicAssessmentText(
              result.customerNarratives?.[narrativeKeyById[id]]?.currentFinding,
              "当前表现已按本题证据完成核验。",
            ),
            nextAction: publicAssessmentText(
              result.customerNarratives?.[narrativeKeyById[id]]?.nextAction,
              "本月补齐可核验内容，并在同口径下复测。",
            ),
            actions: Array.from(
              new Set(
                projected.flatMap((indicator) =>
                  indicator.actionIds.map((actionId) =>
                    publicAssessmentText(
                      actionLabelById.get(actionId),
                      "补齐对应内容与来源",
                    ),
                  ),
                ),
              ),
            ),
          },
        ];
      }),
      assumptions: [],
      roadmap: result.roadmap.map((phase) => ({
        ...phase,
        title: publicAssessmentText(phase.title, `第 ${phase.phase} 周重点`),
        actions: phase.actions
          .slice(0, 3)
          .map((action) => publicAssessmentText(action, "完成对应优化动作。")),
        verificationGate: publicAssessmentText(
          phase.verificationGate,
          "检查本周交付物是否完整、可访问且可追溯。",
        ),
      })),
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    logAssessmentOutputValidation(
      error,
      error instanceof ForecastTaskOutputValidationError
        ? task
        : assessmentTask,
    );
    const partial = completeAssessmentAvailable
      ? buildForecastDisplayOnlyProjection(task)
      : undefined;
    if (partial) {
      const dimensionMetadata = {
        semanticVisibility: {
          id: "semantic_visibility",
          label: "语义可见度",
        },
        semanticCoherence: {
          id: "semantic_coherence",
          label: "语义一致性",
        },
        semanticRichness: {
          id: "semantic_richness",
          label: "语义多样性与深度",
        },
        semanticAuthority: {
          id: "semantic_authority",
          label: "语义权威性",
        },
        competitiveAdvantage: {
          id: "competitive_advantage",
          label: "竞品占优度",
        },
      } as const;
      return {
        status: "ready" as const,
        schemaVersion: 2 as const,
        quality: {
          completeness: "partial" as const,
          warnings: [
            { code: "RESULT_INCOMPLETE" as const, area: "forecast" },
            { code: "AGGREGATE_UNAVAILABLE" as const, area: "forecast" },
          ],
          downstreamEligible: false,
        },
        horizonWeeks: partial.horizonWeeks,
        summary: partial.executiveSummary,
        executiveSummary: partial.executiveSummary,
        dimensions: Object.entries(partial.dimensionNarratives).map(
          ([key, narrative]) => ({
            ...dimensionMetadata[key as keyof typeof dimensionMetadata],
            currentFinding: narrative.currentFinding,
            summary: narrative.currentFinding,
            nextAction: narrative.nextAction,
            actions: [narrative.nextAction],
          }),
        ),
        assumptions: [],
        roadmap: partial.roadmap.map((phase) => ({
          ...phase,
          title: publicAssessmentText(phase.title, `第 ${phase.phase} 周重点`),
          actions: phase.actions
            .slice(0, 3)
            .map((action) =>
              publicAssessmentText(action, "完成对应优化动作。"),
            ),
          verificationGate: publicAssessmentText(
            phase.verificationGate,
            "检查本周交付物是否完整、可访问且可追溯。",
          ),
        })),
        limitations: Array.from(
          new Set([
            ...partial.limitations,
            "本次仅展示已通过逐项校验的叙事与路线；整体目标区间和服务入口不可用。",
          ]),
        ),
      };
    }
    return {
      status: "failed",
      dimensions: [],
      assumptions: [],
      roadmap: [],
      error: publicForecastValidationMessage(error),
      failureCode: publicAssessmentFailureCode(error),
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
  const {
    evidencePaths: _evidencePaths,
    allPaths: _allPaths,
    documents: _documents,
    generatedAt: rawGeneratedAt,
    sources,
    ...publicManifest
  } = manifest;
  const generatedAt = normalizedIsoTimestamp(rawGeneratedAt);
  return {
    ...publicManifest,
    ...(generatedAt ? { generatedAt } : {}),
    sources: sources.map(({ capturedAt, ...source }) => {
      const normalizedCapturedAt = normalizedIsoTimestamp(capturedAt);
      return {
        ...source,
        ...(normalizedCapturedAt ? { capturedAt: normalizedCapturedAt } : {}),
      };
    }),
  };
}

async function loadKnowledgeBaseManifest(
  broker: GeoPresalesBroker,
  taskId: string,
  task: BrokerTask,
  companyName: string,
  archive: {
    artifactId: string;
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
  const cacheKey = `${taskId}:${archive.artifactId}:${
    validationProfile || "historical-compatible"
  }:${archive.sha256 || "unverified"}:${
    archive.packageManifestSha256 || "unverified"
  }`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = (async () => {
    let bytes: Buffer;
    try {
      const response = await broker.downloadArtifact(archive.artifactId);
      bytes = await readResponseBufferLimited(
        response,
        MAX_VALIDATED_ARCHIVE_BYTES,
      );
    } catch (error) {
      if (error instanceof GeoByteLimitError) {
        throw new KnowledgeBaseArchiveValidationError(
          "unsafe",
          "Knowledge-base archive exceeds the compressed size limit",
        );
      }
      console.warn("[GEO KB]", {
        event: "archive_download_failed",
        taskId,
        artifactId: archive.artifactId,
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
        generatedAt: normalizedIsoTimestamp(
          task.safeEvents.at(-1)?.createdAt ??
            task.safeEvents.at(-1)?.timestamp,
        ),
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
        category,
        knowledgeBaseValidationReason(error),
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
  archive: { artifactId: string; filename: string },
  manifest: KnowledgeBaseManifest,
) {
  let cache = assetPreviewCacheByBroker.get(broker);
  if (!cache) {
    cache = new Map();
    assetPreviewCacheByBroker.set(broker, cache);
  }
  const cacheKey = `${taskId}:${archive.artifactId}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = (async () => {
    const response = await broker.downloadArtifact(archive.artifactId);
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

async function getResolvedQuestionTask(
  broker: GeoPresalesBroker,
  taskId: string,
) {
  return await getResolvedTask(broker, taskId);
}

async function resolveAssessmentTaskOutput(
  broker: GeoPresalesBroker,
  task: BrokerTask,
  options: Parameters<typeof resolveAssessmentTaskOutputRaw>[2] = {},
) {
  return await resolveAssessmentTaskOutputRaw(broker, task, options);
}

async function resolveOptimizationOutcomeForecastTaskOutput(
  broker: GeoPresalesBroker,
  task: BrokerTask,
  options: Parameters<
    typeof resolveOptimizationOutcomeForecastTaskOutputRaw
  >[2] = {},
) {
  return await resolveOptimizationOutcomeForecastTaskOutputRaw(
    broker,
    task,
    options,
  );
}

function hasTrustedCompletedTaskOutput(task: BrokerTask): boolean {
  return (
    Boolean(task.result?.structuredResult) ||
    Boolean(findArchiveDescriptor(task))
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
  const status = normalizeMonitorRun(
    await broker.getMonitorRun(runId),
    {
      ...expected,
      runId,
    },
    { allowTerminalSummaryWithoutRecords: true },
  );
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

async function resolveMonitorQuestionForEdition(
  broker: GeoPresalesBroker,
  value: ProjectTokenValue,
  question: GeoQuestion,
  edition?: GeoMonitoringEdition,
  timing: { waitMs: number; pollMs: number } = {
    waitMs: MONITOR_QUESTION_TRANSLATION_WAIT_MS,
    pollMs: MONITOR_QUESTION_TRANSLATION_POLL_MS,
  },
) {
  if (normalizedGeoMonitoringEdition(edition) !== "overseas") {
    return question.question;
  }
  const deadline = Date.now() + timing.waitMs;
  const pending = () =>
    new GeoHttpError(
      "付款已确认，正在启动监控，请稍候",
      503,
      "QUESTION_TRANSLATION_PENDING",
    );
  const failed = () =>
    new GeoHttpError(
      "海外监控问题准备未完成，尚未向 ChatGPT 监控接口提交；订单与项目进度已保留，可重试或重置后重新发起。",
      502,
      "QUESTION_TRANSLATION_FAILED",
    );
  const waitForNextObservation = async () => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return false;
    await new Promise<void>((resolve) =>
      setTimeout(resolve, Math.min(timing.pollMs, remaining)),
    );
    return true;
  };

  let task: BrokerTask | undefined;
  while (!task) {
    try {
      task = await createMonitorQuestionTranslationTask(
        broker,
        value,
        question,
      );
    } catch (error) {
      if (
        !(error instanceof GeoBrokerError) ||
        !isRecoverableTaskResultError(error)
      ) {
        throw failed();
      }
      if (!(await waitForNextObservation())) throw pending();
    }
  }

  // An idempotent create replay can already contain the complete answer even
  // while the status endpoint is still eventually consistent. A strict schema
  // plus source digest makes that complete typed assistant output authoritative.
  let createdTranslation = await resolveGeoMonitorQuestionTranslationTaskOutput(
    broker,
    task,
    question.question,
    { taskId: taskIdFrom(task) || undefined },
  );
  if (createdTranslation) return createdTranslation;
  let createdStatus = normalizeTaskStatus(task.status);
  if (["failed", "cancelled"].includes(createdStatus)) throw failed();
  if (createdStatus === "completed") throw failed();

  const taskId = taskIdFrom(task);
  if (!taskId) throw failed();
  while (true) {
    let resolved: BrokerTask;
    try {
      resolved = await getResolvedTask(broker, taskId);
    } catch (error) {
      const recoverable =
        (error instanceof GeoHttpError &&
          error.code === "TASK_RESULT_TEMPORARILY_UNAVAILABLE") ||
        (error instanceof GeoBrokerError &&
          isRecoverableTaskResultError(error));
      if (!recoverable) throw failed();
      if (!(await waitForNextObservation())) throw pending();
      continue;
    }

    const translated = await resolveGeoMonitorQuestionTranslationTaskOutput(
      broker,
      resolved,
      question.question,
      { taskId },
    );
    if (translated) return translated;

    const status = normalizeTaskStatus(resolved.status);
    if (["failed", "cancelled"].includes(status)) throw failed();
    if (status === "completed") throw failed();
    if (!(await waitForNextObservation())) throw pending();
  }
}

function createMonitorQuestionTranslationTask(
  broker: GeoPresalesBroker,
  value: ProjectTokenValue,
  question: GeoQuestion,
) {
  return broker.createTask({
    projectId: value.projectId,
    prompt: buildGeoMonitorQuestionTranslationPrompt(question.question),
    localAssets: [],
    idempotencyKey: geoMonitorQuestionTranslationOperationKey({
      projectId: value.projectId,
      questionId: question.id,
      question: question.question,
    }),
    contract: PRESALES_CONTRACTS.monitorQuestionTranslation,
  });
}

async function prewarmMonitorQuestionTranslation(
  broker: GeoPresalesBroker,
  value: ProjectTokenValue,
  question: GeoQuestion,
) {
  try {
    await createMonitorQuestionTranslationTask(broker, value, question);
  } catch (error) {
    // Translation is not a payment prerequisite. A later monitoring request
    // retries the same deterministic operation key before calling ChatGPT.
    console.warn("[GEO monitor translation]", {
      event: "prewarm_deferred",
      projectId: value.projectId,
      diagnosticCode:
        error instanceof GeoBrokerError ? error.code : "TASK_CREATE_FAILED",
    });
  }
}

function monitorRunExpectation(
  value: ProjectTokenValue,
  platforms = value.monitorPlatformIds,
) {
  return platforms ? { platforms } : undefined;
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
  _taskId: string,
  archive: { artifactId: string; filename: string },
  options: {
    projectId: string;
    forceCopy?: boolean;
    idempotencyKey: string;
    stagingAttachment?: {
      fileId: string;
      filename: string;
      temporary: true;
    };
    onTemporaryFileCreated?: (attachment: {
      fileId: string;
      filename: string;
      temporary: true;
    }) => Promise<void>;
  },
) {
  const response = await broker.downloadArtifact(archive.artifactId);
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
  const asset = options.stagingAttachment
    ? {
        localAssetId: options.stagingAttachment.fileId,
        filename: options.stagingAttachment.filename,
        uploadTicket: undefined,
      }
    : await broker.createAsset({
        projectId: options.projectId,
        idempotencyKey: options.idempotencyKey,
        filename: archive.filename,
        mimeType: "application/zip",
        sizeBytes: body.length,
      });
  if (!options.stagingAttachment) {
    try {
      await options.onTemporaryFileCreated?.({
        fileId: asset.localAssetId,
        filename: asset.filename || archive.filename,
        temporary: true,
      });
    } catch (error) {
      // The store writes an independent fsynced orphan marker before its
      // record CAS. Delete immediately when possible; if deletion also fails,
      // the marker survives the crash window and the recovery GC retries it.
      await broker.deleteAsset(asset.localAssetId).catch(() => undefined);
      throw error;
    }
  }
  await broker.uploadAsset(
    asset.localAssetId,
    body,
    "application/zip",
    asset.uploadTicket,
  );
  return {
    localAssetId: asset.localAssetId,
    filename: asset.filename || archive.filename,
    temporary: true,
  };
}

async function advanceCustomQuestionValidation(input: {
  broker: GeoPresalesBroker;
  store: GeoCustomQuestionValidationStore;
  record: GeoCustomQuestionValidationRecord;
  knowledgeBaseTask: BrokerTask;
  now?: () => number;
}) {
  const validationNow = input.now ?? Date.now;
  const lease = await input.store.tryAcquireLease(
    input.record.projectId,
    input.record.clientRequestId,
    CUSTOM_QUESTION_CLASSIFIER_LEASE_MS,
  );
  if (!lease) {
    return (
      (await input.store.get(
        input.record.projectId,
        input.record.clientRequestId,
      )) ?? input.record
    );
  }

  let activeLease = lease;
  let leaseFailure: unknown;
  let leaseOperations: Promise<void> = Promise.resolve();
  const enqueueLeaseOperation = <T>(operation: () => Promise<T>) => {
    const current = leaseOperations.then(async () => {
      if (leaseFailure) throw leaseFailure;
      return operation();
    });
    // Attach a rejection handler immediately. Node 24 must never observe a
    // rejected interval promise before the request reaches its finally block.
    leaseOperations = current.then(
      () => undefined,
      (error) => {
        leaseFailure ??= error;
      },
    );
    return current;
  };
  const renewLease = () => {
    void enqueueLeaseOperation(async () => {
      activeLease = await input.store.renewLease(
        activeLease,
        CUSTOM_QUESTION_CLASSIFIER_LEASE_MS,
      );
    }).catch((error) => {
      leaseFailure ??= error;
    });
  };
  const leaseTimer = setInterval(
    renewLease,
    CUSTOM_QUESTION_CLASSIFIER_LEASE_RENEW_MS,
  );
  leaseTimer.unref?.();

  try {
    let record =
      (await input.store.get(
        input.record.projectId,
        input.record.clientRequestId,
      )) ?? input.record;
    const persist = async (
      next: GeoCustomQuestionValidationRecord,
    ): Promise<GeoCustomQuestionValidationRecord> => {
      record = await enqueueLeaseOperation(() =>
        input.store.update(next, activeLease),
      );
      return record;
    };
    const cleanup = (current: GeoCustomQuestionValidationRecord) =>
      cleanupCustomQuestionValidation(input.broker, current, persist);
    const persistTransientFailure = async (
      error: unknown,
      code: string,
      message: string,
    ) => {
      const now = validationNow();
      const diagnostic = safeCustomQuestionDiagnostic(error);
      const sameObservation = record.lastTransientError === diagnostic;
      const firstTransientErrorAt =
        sameObservation && record.firstTransientErrorAt
          ? record.firstTransientErrorAt
          : new Date(now).toISOString();
      // The persisted schema deliberately caps this counter at 100. A burst
      // of concurrent status requests can observe the same failure more than
      // 100 times before the 30-second time gate expires; saturating keeps the
      // next post-gate observation valid instead of making the reservation
      // permanently unparsable at 101.
      const transientErrorCount = nextCustomQuestionTransientErrorCount(
        record.transientErrorCount,
        sameObservation,
      );
      const exhausted =
        transientErrorCount >=
          CUSTOM_QUESTION_CLASSIFIER_TRANSIENT_MAX_OBSERVATIONS &&
        now - Date.parse(firstTransientErrorAt) >=
          CUSTOM_QUESTION_CLASSIFIER_TRANSIENT_MAX_MS;
      record = await persist({
        ...record,
        ...(exhausted
          ? {
              state: "failed" as const,
              expiresAt: new Date(
                now + CUSTOM_QUESTION_TERMINAL_RETENTION_MS,
              ).toISOString(),
              error: {
                code,
                message,
                status: 502,
                retryable: true,
              },
            }
          : {}),
        transientErrorCount,
        firstTransientErrorAt,
        lastTransientError: diagnostic,
      });
      return exhausted ? cleanup(record) : record;
    };
    const scheduleFormatRetryOrFail = async () => {
      record = await persist({
        ...record,
        state: "failed",
        expiresAt: new Date(
          validationNow() + CUSTOM_QUESTION_TERMINAL_RETENTION_MS,
        ).toISOString(),
        error: {
          code: "CUSTOM_QUESTION_CLASSIFIER_INVALID_RESPONSE",
          message: "验证结果格式异常，可重新验证当前问题",
          status: 502,
          retryable: true,
        },
      });
      return await cleanup(record);
    };
    if (isTerminalCustomQuestionValidation(record)) {
      return await cleanup(record);
    }

    const archive = record.knowledgeBaseArtifact;
    const attachmentOperationKey = (kind: "archive" | "skill" | "input") =>
      `geo-custom-question-file:${record.key}:${kind}:${record.attachmentRebuildCount}:v1`;

    if (!record.archiveAttachment) {
      try {
        const attachment = await materializeArchiveAttachment(
          input.broker,
          record.knowledgeBaseTaskId,
          archive,
          {
            projectId: record.projectId,
            // The durable knowledge-base artifact can belong to a credential
            // retired after API-key rotation. Always copy it into the current
            // credential generation before combining it with the current
            // classifier Skill. If rotation lands between the two creates,
            // the Dashboard rejects the mixed task and the next generation
            // rebuilds both attachments under the then-current credential.
            forceCopy: true,
            idempotencyKey: attachmentOperationKey("archive"),
            stagingAttachment: record.archiveStagingAttachment
              ? {
                  fileId: record.archiveStagingAttachment.localAssetId,
                  filename: record.archiveStagingAttachment.filename,
                  temporary: true,
                }
              : undefined,
            onTemporaryFileCreated: async (stagingAttachment) => {
              record = await enqueueLeaseOperation(() =>
                input.store.retainTemporaryFileForCleanup(
                  record.projectId,
                  record.clientRequestId,
                  stagingAttachment.fileId,
                ),
              );
              await persist({
                ...record,
                state: "prepared",
                archiveStagingAttachment: {
                  localAssetId: stagingAttachment.fileId,
                  filename: stagingAttachment.filename,
                  temporary: true,
                },
              });
            },
          },
        );
        await persist({
          ...record,
          state: "prepared",
          archiveAttachment: {
            localAssetId: attachment.localAssetId,
            filename: attachment.filename,
            temporary: attachment.temporary,
          },
          archiveStagingAttachment: undefined,
          transientErrorCount: 0,
          firstTransientErrorAt: undefined,
          lastTransientError: undefined,
        });
      } catch (error) {
        return await persistTransientFailure(
          error,
          "CUSTOM_QUESTION_ARCHIVE_PREPARATION_UNAVAILABLE",
          "企业知识库附件持续无法准备，请重试当前问题",
        );
      }
    }

    if (!record.skillAttachment) {
      try {
        const body = await buildGeoCustomQuestionClassifierSkillArchive();
        let stagingAttachment = record.skillStagingAttachment;
        let uploadTicket: string | undefined;
        if (!stagingAttachment) {
          const file = await input.broker.createAsset({
            projectId: record.projectId,
            filename: CUSTOM_QUESTION_CLASSIFIER_SKILL_ARCHIVE_FILENAME,
            mimeType: "application/zip",
            sizeBytes: body.length,
            idempotencyKey: attachmentOperationKey("skill"),
          });
          uploadTicket = file.uploadTicket;
          stagingAttachment = {
            localAssetId: file.localAssetId,
            filename:
              file.filename ||
              CUSTOM_QUESTION_CLASSIFIER_SKILL_ARCHIVE_FILENAME,
            temporary: true,
          };
          try {
            record = await enqueueLeaseOperation(() =>
              input.store.retainTemporaryFileForCleanup(
                record.projectId,
                record.clientRequestId,
                stagingAttachment!.localAssetId,
              ),
            );
            await persist({
              ...record,
              state: "prepared",
              skillStagingAttachment: stagingAttachment,
            });
          } catch (error) {
            await input.broker
              .deleteAsset(file.localAssetId)
              .catch(() => undefined);
            throw error;
          }
        }
        await input.broker.uploadAsset(
          stagingAttachment.localAssetId,
          body,
          "application/zip",
          uploadTicket,
        );
        await persist({
          ...record,
          state: "prepared",
          skillAttachment: stagingAttachment,
          skillStagingAttachment: undefined,
          transientErrorCount: 0,
          firstTransientErrorAt: undefined,
          lastTransientError: undefined,
        });
      } catch (error) {
        return await persistTransientFailure(
          error,
          "CUSTOM_QUESTION_SKILL_PREPARATION_UNAVAILABLE",
          "问题验证协议附件持续无法准备，请重试当前问题",
        );
      }
    }

    // Records submitted by an older Website build already carry their complete
    // inline prompt. They must remain pollable during a rolling deployment and
    // must not acquire a new, unused protocol attachment before observation.
    if (!record.localTaskId && !record.promptInputAttachment) {
      try {
        const taskInput = buildGeoCustomQuestionClassifierTaskInput({
          companyName: record.companyName,
          question: record.question,
          archiveFilename: record.archiveAttachment!.filename,
        });
        let stagingAttachment = record.promptInputStagingAttachment;
        let uploadTicket: string | undefined;
        if (!stagingAttachment) {
          const file = await input.broker.createAsset({
            projectId: record.projectId,
            filename: taskInput.filename,
            mimeType: taskInput.mimeType,
            sizeBytes: taskInput.body.length,
            idempotencyKey: attachmentOperationKey("input"),
          });
          uploadTicket = file.uploadTicket;
          stagingAttachment = {
            localAssetId: file.localAssetId,
            filename: file.filename || taskInput.filename,
            temporary: true,
          };
          try {
            record = await enqueueLeaseOperation(() =>
              input.store.retainTemporaryFileForCleanup(
                record.projectId,
                record.clientRequestId,
                stagingAttachment!.localAssetId,
              ),
            );
            await persist({
              ...record,
              state: "prepared",
              promptInputStagingAttachment: stagingAttachment,
            });
          } catch (error) {
            await input.broker
              .deleteAsset(file.localAssetId)
              .catch(() => undefined);
            throw error;
          }
        }
        await input.broker.uploadAsset(
          stagingAttachment.localAssetId,
          taskInput.body,
          taskInput.mimeType,
          uploadTicket,
        );
        await persist({
          ...record,
          state: "prepared",
          promptInputAttachment: stagingAttachment,
          promptInputStagingAttachment: undefined,
          transientErrorCount: 0,
          firstTransientErrorAt: undefined,
          lastTransientError: undefined,
        });
      } catch (error) {
        return await persistTransientFailure(
          error,
          "CUSTOM_QUESTION_INPUT_PREPARATION_UNAVAILABLE",
          "问题验证输入附件持续无法准备，请重试当前问题",
        );
      }
    }

    let observedTask: BrokerTask | undefined;
    if (!record.localTaskId) {
      try {
        observedTask = await input.broker.createTask({
          projectId: record.projectId,
          prompt: await buildGeoCustomQuestionClassifierPrompt({
            companyName: record.companyName,
            question: record.question,
            archiveFilename: record.archiveAttachment!.filename,
          }),
          localAssets: [
            {
              localAssetId: record.skillAttachment!.localAssetId,
              filename: record.skillAttachment!.filename,
            },
            {
              localAssetId: record.promptInputAttachment!.localAssetId,
              filename: record.promptInputAttachment!.filename,
            },
            {
              localAssetId: record.archiveAttachment!.localAssetId,
              filename: record.archiveAttachment!.filename,
            },
          ],
          idempotencyKey: geoCustomQuestionOperationKey(record),
          contract: PRESALES_CONTRACTS.customQuestionClassifier,
        });
      } catch (error) {
        if (isInvalidCustomQuestionAttachmentError(error)) {
          if (
            record.attachmentRebuildCount >=
            CUSTOM_QUESTION_CLASSIFIER_ATTACHMENT_REBUILD_MAX
          ) {
            return await persistTransientFailure(
              error,
              "CUSTOM_QUESTION_CLASSIFIER_ATTACHMENTS_INVALID",
              "问题验证附件持续失效，请重新提交问题",
            );
          }
          const temporaryLocalAssetIds = Array.from(
            new Set([
              ...record.temporaryLocalAssetIds,
              ...(record.skillAttachment?.temporary
                ? [record.skillAttachment.localAssetId]
                : []),
              ...(record.promptInputAttachment?.temporary
                ? [record.promptInputAttachment.localAssetId]
                : []),
              ...(record.archiveAttachment?.temporary
                ? [record.archiveAttachment.localAssetId]
                : []),
              ...(record.skillStagingAttachment?.temporary
                ? [record.skillStagingAttachment.localAssetId]
                : []),
              ...(record.promptInputStagingAttachment?.temporary
                ? [record.promptInputStagingAttachment.localAssetId]
                : []),
              ...(record.archiveStagingAttachment?.temporary
                ? [record.archiveStagingAttachment.localAssetId]
                : []),
            ]),
          ).slice(-20);
          return await persist({
            ...record,
            state: "reserved",
            archiveAttachment: undefined,
            skillAttachment: undefined,
            promptInputAttachment: undefined,
            archiveStagingAttachment: undefined,
            skillStagingAttachment: undefined,
            promptInputStagingAttachment: undefined,
            temporaryLocalAssetIds,
            attachmentRebuildCount: record.attachmentRebuildCount + 1,
            transientErrorCount: 0,
            firstTransientErrorAt: undefined,
            lastTransientError: "问题验证附件已失效，正在安全重建同一请求。",
          });
        }
        if (isRecoverableCustomQuestionSubmissionError(error)) {
          return await persistTransientFailure(
            error,
            "CUSTOM_QUESTION_CLASSIFIER_SUBMISSION_UNAVAILABLE",
            "问题验证任务暂时无法提交，请重试当前问题",
          );
        }
        return await persistTransientFailure(
          error,
          "CUSTOM_QUESTION_CLASSIFIER_SUBMISSION_FAILED",
          "问题验证任务提交失败，请重试当前问题",
        );
      }
      const taskId = taskIdFrom(observedTask);
      if (!taskId) {
        return await persist({
          ...record,
          state: "failed",
          expiresAt: new Date(
            validationNow() + CUSTOM_QUESTION_TERMINAL_RETENTION_MS,
          ).toISOString(),
          error: {
            code: "CUSTOM_QUESTION_CLASSIFIER_TASK_ID_MISSING",
            message: "创建问题验证任务失败，请稍后重试",
            status: 502,
            retryable: true,
          },
        });
      }
      try {
        await persist({
          ...record,
          state: "submitted",
          localTaskId: taskId,
          transientErrorCount: 0,
          firstTransientErrorAt: undefined,
          lastTransientError: undefined,
        });
      } catch (error) {
        // Keep the idempotently-created task. The durable reservation/orphan
        // marker adopts it on a later read; Website rollback must never delete
        // a Manus record after task creation succeeds.
        throw error;
      }
    }

    if (!observedTask) {
      try {
        observedTask = await input.broker.getTask(record.localTaskId!);
      } catch (error) {
        return await persistTransientFailure(
          error,
          "CUSTOM_QUESTION_CLASSIFIER_TASK_UNAVAILABLE",
          "问题验证任务持续无法读取，请重试当前问题",
        );
      }
    }

    const normalizedStatus = normalizeTaskStatus(observedTask.status);
    const rawStatus = String(observedTask.status ?? "unknown").slice(0, 100);
    if (["queued", "running", "waiting"].includes(normalizedStatus)) {
      return await persist({
        ...record,
        state: "submitted",
        unknownStatusCount: 0,
        firstUnknownStatusAt: undefined,
        transientErrorCount: 0,
        firstTransientErrorAt: undefined,
        lastObservedStatus: rawStatus,
        lastTransientError: undefined,
      });
    }
    if (normalizedStatus === "failed" || normalizedStatus === "cancelled") {
      record = await persist({
        ...record,
        state: "failed",
        expiresAt: new Date(
          validationNow() + CUSTOM_QUESTION_TERMINAL_RETENTION_MS,
        ).toISOString(),
        lastObservedStatus: rawStatus,
        error: {
          code: "CUSTOM_QUESTION_CLASSIFIER_FAILED",
          message: "问题验证服务执行失败，可重新验证当前问题",
          status: 502,
          retryable: true,
        },
      });
      return await cleanup(record);
    }
    if (normalizedStatus === "unknown") {
      const unknownStatusCount = record.unknownStatusCount + 1;
      if (
        unknownStatusCount >=
        CUSTOM_QUESTION_CLASSIFIER_UNKNOWN_MAX_OBSERVATIONS
      ) {
        record = await persist({
          ...record,
          state: "failed",
          expiresAt: new Date(
            validationNow() + CUSTOM_QUESTION_TERMINAL_RETENTION_MS,
          ).toISOString(),
          unknownStatusCount,
          firstUnknownStatusAt:
            record.firstUnknownStatusAt ??
            new Date(validationNow()).toISOString(),
          lastObservedStatus: rawStatus,
          error: {
            code: "CUSTOM_QUESTION_CLASSIFIER_UNKNOWN_STATUS",
            message: "问题验证任务返回了无法识别的状态，可重新验证当前问题",
            status: 502,
            retryable: true,
          },
        });
        return await cleanup(record);
      }
      return await persist({
        ...record,
        state: "submitted",
        unknownStatusCount,
        firstUnknownStatusAt:
          record.firstUnknownStatusAt ??
          new Date(validationNow()).toISOString(),
        lastObservedStatus: rawStatus,
      });
    }

    let resolvedTask: BrokerTask;
    try {
      resolvedTask = await getResolvedTask(input.broker, record.localTaskId!);
    } catch (error) {
      return await persistTransientFailure(
        error,
        "CUSTOM_QUESTION_CLASSIFIER_RESULT_UNAVAILABLE",
        "问题验证结果持续无法读取，请重试当前问题",
      );
    }
    record = await persist({
      ...record,
      state: "submitted",
      lastObservedStatus: "completed",
      transientErrorCount: 0,
      firstTransientErrorAt: undefined,
      lastTransientError: undefined,
    });
    const classification = await resolveCustomQuestionClassificationTaskOutput(
      input.broker,
      resolvedTask,
      { taskId: record.localTaskId },
    );
    if (!classification) {
      console.warn("[GEO custom question]", {
        event: "classifier_output_rejected",
        projectId: record.projectId,
        taskId: record.localTaskId,
        diagnosticCode: "CUSTOM_QUESTION_CLASSIFIER_INVALID_RESPONSE",
      });
      return await scheduleFormatRetryOrFail();
    }

    if (classification.decision === "reject") {
      record = await persist({
        ...record,
        state: "rejected",
        error: rejectedCustomQuestionError(
          classification.category,
          record.companyName,
        ),
        expiresAt: new Date(
          validationNow() + CUSTOM_QUESTION_TERMINAL_RETENTION_MS,
        ).toISOString(),
      });
      return await cleanup(record);
    }

    let manifest: KnowledgeBaseManifest;
    try {
      manifest = await loadKnowledgeBaseManifest(
        input.broker,
        record.knowledgeBaseTaskId,
        input.knowledgeBaseTask,
        record.companyName,
        archive,
        record.knowledgeBaseValidationProfile,
      );
    } catch (error) {
      return await persistTransientFailure(
        error,
        "CUSTOM_QUESTION_KNOWLEDGE_BASE_UNAVAILABLE",
        "企业知识库持续无法读取，请重试当前问题",
      );
    }
    const grounding = validateAcceptedCustomQuestionGrounding(classification, {
      question: record.question,
      companyName: record.companyName,
      manifest,
    });
    if (!grounding.ok) {
      console.warn("[GEO custom question]", {
        event: "classifier_acceptance_blocked",
        projectId: record.projectId,
        taskId: record.localTaskId,
        diagnosticCode:
          grounding.kind === "invalid_evidence"
            ? "CUSTOM_QUESTION_CLASSIFIER_INVALID_EVIDENCE"
            : "CUSTOM_QUESTION_ENTERPRISE_ANCHOR_MISSING",
        reason: grounding.reason,
      });
      if (grounding.kind === "invalid_evidence") {
        return await scheduleFormatRetryOrFail();
      }
      record = await persist({
        ...record,
        state: "rejected",
        expiresAt: new Date(
          validationNow() + CUSTOM_QUESTION_TERMINAL_RETENTION_MS,
        ).toISOString(),
        error: {
          code: "CUSTOM_QUESTION_ENTERPRISE_UNRELATED",
          message: `该问题与「${record.companyName}」没有明确关系，请重新输入与当前企业相关的非行业排名类问题。`,
          status: 422,
          retryable: false,
        },
      });
      return await cleanup(record);
    }

    const question = GeoQuestionSchema.parse({
      id: customQuestionId(record.question),
      category: classification.category,
      question: record.question,
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
    record = await persist({
      ...record,
      state: "completed",
      expiresAt: new Date(
        validationNow() + CUSTOM_QUESTION_TERMINAL_RETENTION_MS,
      ).toISOString(),
      result: question,
      error: undefined,
      transientErrorCount: 0,
      firstTransientErrorAt: undefined,
      lastTransientError: undefined,
    });
    return await cleanup(record);
  } finally {
    clearInterval(leaseTimer);
    await leaseOperations;
    await input.store.releaseLease(activeLease).catch(() => undefined);
  }
}

function isTerminalCustomQuestionValidation(
  record: GeoCustomQuestionValidationRecord,
) {
  return ["completed", "rejected", "failed"].includes(record.state);
}

async function cleanupCustomQuestionValidation(
  broker: GeoPresalesBroker,
  record: GeoCustomQuestionValidationRecord,
  persist: (
    next: GeoCustomQuestionValidationRecord,
  ) => Promise<GeoCustomQuestionValidationRecord>,
) {
  if (record.cleanupCompleted) return record;
  const temporaryLocalAssetIds = Array.from(
    new Set([
      ...record.temporaryLocalAssetIds,
      ...(record.skillAttachment?.temporary
        ? [record.skillAttachment.localAssetId]
        : []),
      ...(record.promptInputAttachment?.temporary
        ? [record.promptInputAttachment.localAssetId]
        : []),
      ...(record.archiveAttachment?.temporary
        ? [record.archiveAttachment.localAssetId]
        : []),
      ...(record.skillStagingAttachment?.temporary
        ? [record.skillStagingAttachment.localAssetId]
        : []),
      ...(record.promptInputStagingAttachment?.temporary
        ? [record.promptInputStagingAttachment.localAssetId]
        : []),
      ...(record.archiveStagingAttachment?.temporary
        ? [record.archiveStagingAttachment.localAssetId]
        : []),
    ]),
  );
  const results = await Promise.allSettled([
    ...temporaryLocalAssetIds.map((localAssetId) =>
      broker.deleteAsset(localAssetId),
    ),
  ]);
  const failed = results.filter(
    (result) =>
      result.status === "rejected" &&
      !isAlreadyDeletedGeoResource(result.reason),
  );
  if (failed.length > 0) {
    return persist({
      ...record,
      cleanupCompleted: false,
      lastTransientError: `问题验证资源仍在清理中（${failed.length}/${results.length}）`,
    });
  }
  return persist({ ...record, cleanupCompleted: true });
}

function isAlreadyDeletedGeoResource(error: unknown) {
  return error instanceof GeoBrokerError && error.status === 404;
}

function rejectedCustomQuestionError(category: string, companyName: string) {
  if (category === "industry_ranking") {
    return {
      code: "INDUSTRY_RANKING_QUESTION",
      message: "该问题属于行业排名或品牌推荐类问题，需要全域营销权限",
      status: 422,
      retryable: false,
    } as const;
  }
  if (category === "ambiguous") {
    return {
      code: "CUSTOM_QUESTION_AMBIGUOUS",
      message: `无法确认该问题与「${companyName}」的关系，请明确写出企业、品牌或知识库中的具体产品名称`,
      status: 422,
      retryable: false,
    } as const;
  }
  return {
    code: "CUSTOM_QUESTION_ENTERPRISE_UNRELATED",
    message: `该问题与「${companyName}」没有明确关系，请重新输入与当前企业相关的非行业排名类问题。`,
    status: 422,
    retryable: false,
  } as const;
}

function isRecoverableCustomQuestionSubmissionError(error: unknown) {
  return (
    error instanceof GeoBrokerError &&
    ([409, 425, 429].includes(error.status) || error.status >= 500)
  );
}

function isInvalidCustomQuestionAttachmentError(error: unknown) {
  return (
    error instanceof GeoBrokerError &&
    [400, 404, 409, 410, 422].includes(error.status)
  );
}

function waitForCustomQuestionRecovery(delayMs: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

export function nextCustomQuestionTransientErrorCount(
  currentCount: number,
  sameObservation: boolean,
) {
  return sameObservation ? Math.min(100, currentCount + 1) : 1;
}

function safeCustomQuestionDiagnostic(error: unknown) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function compareCanonicalText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalAssessmentMonitorRecords(
  records: NonNullable<BrokerMonitorRun["records"]>,
) {
  return [...records]
    .sort((left, right) =>
      compareCanonicalText(
        `${left.platform}\0${String(left.runIndex).padStart(2, "0")}\0${left.recordId}`,
        `${right.platform}\0${String(right.runIndex).padStart(2, "0")}\0${right.recordId}`,
      ),
    )
    .map((record) => ({
      recordId: record.recordId,
      platform: record.platform,
      runIndex: record.runIndex,
      status: record.status,
      answerText: record.answerText,
      sources: [...record.sources].sort((left, right) =>
        compareCanonicalText(
          `${left.url || ""}\0${left.title || ""}\0${left.domain || ""}`,
          `${right.url || ""}\0${right.title || ""}\0${right.domain || ""}`,
        ),
      ),
      error: record.error,
      completedAt: record.completedAt,
    }));
}

type GeoTaskSkillPackage = {
  filename: string;
  body: Buffer;
  mimeType?: string;
};

function generatedTaskFileOperationKey(
  taskOperationKey: string,
  packageIndex: number,
  skillPackage: GeoTaskSkillPackage,
) {
  const digest = crypto
    .createHash("sha256")
    .update(taskOperationKey, "utf8")
    .update("\0")
    .update(String(packageIndex), "utf8")
    .update("\0")
    .update(skillPackage.filename, "utf8")
    .update("\0")
    .update(skillPackage.mimeType || "application/zip", "utf8")
    .update("\0")
    .update(skillPackage.body)
    .digest("hex");
  return `geo-generated-task-file:${digest}`;
}

function generatedTaskEvidenceFileOperationKey(
  taskOperationKey: string,
  role: string,
  evidence: GeoTaskSkillPackage,
) {
  const digest = crypto
    .createHash("sha256")
    .update(taskOperationKey, "utf8")
    .update("\0evidence\0", "utf8")
    .update(role, "utf8")
    .update("\0", "utf8")
    .update(evidence.filename, "utf8")
    .update("\0", "utf8")
    .update(evidence.mimeType || "application/octet-stream", "utf8")
    .update("\0", "utf8")
    .update(evidence.body)
    .digest("hex");
  return `geo-generated-task-evidence-file:${digest}`;
}

function isAmbiguousGeneratedAttachmentError(error: unknown) {
  return (
    (error instanceof GeoBrokerError || error instanceof GeoHttpError) &&
    ([409, 425, 429].includes(error.status) || error.status >= 500)
  );
}

function shouldRetainGeneratedTaskFilesForReplay(error: unknown) {
  return (
    isAmbiguousGeneratedAttachmentError(error) ||
    (!(error instanceof GeoBrokerError) && !(error instanceof GeoHttpError))
  );
}

async function createGeoTaskEvidenceFile(
  broker: GeoPresalesBroker,
  input: {
    projectId: string;
    taskOperationKey: string;
    role: string;
    filename: string;
    body: Buffer;
    mimeType: string;
  },
) {
  const asset = await broker.createAsset({
    projectId: input.projectId,
    filename: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.body.length,
    idempotencyKey: generatedTaskEvidenceFileOperationKey(
      input.taskOperationKey,
      input.role,
      input,
    ),
  });
  try {
    await broker.uploadAsset(
      asset.localAssetId,
      input.body,
      input.mimeType,
      asset.uploadTicket,
    );
  } catch (error) {
    // Generated task inputs use deterministic operation keys. Retaining the
    // asset lets a retry recover the same object and avoids a deleted-asset
    // tombstone winning over the idempotency record.
    throw error;
  }
  return asset;
}

async function createGeoTaskWithSkillPackages(
  broker: GeoPresalesBroker,
  input: {
    projectId: string;
    prompt: string;
    localAssets: Array<{ localAssetId: string; filename: string }>;
    idempotencyKey: string;
    contract: PresalesContract;
    businessOwnerName?: string;
  },
  skillPackages: GeoTaskSkillPackage[],
) {
  const skillAttachments: Array<{
    localAssetId: string;
    filename: string;
  }> = [];
  try {
    for (
      let packageIndex = 0;
      packageIndex < skillPackages.length;
      packageIndex += 1
    ) {
      const skillPackage = skillPackages[packageIndex]!;
      const mimeType = skillPackage.mimeType || "application/zip";
      const asset = await broker.createAsset({
        projectId: input.projectId,
        filename: skillPackage.filename,
        mimeType,
        sizeBytes: skillPackage.body.length,
        idempotencyKey: generatedTaskFileOperationKey(
          input.idempotencyKey,
          packageIndex,
          skillPackage,
        ),
      });
      skillAttachments.push({
        localAssetId: asset.localAssetId,
        filename: asset.filename || skillPackage.filename,
      });
      await broker.uploadAsset(
        asset.localAssetId,
        skillPackage.body,
        mimeType,
        asset.uploadTicket,
      );
    }
    const task = await broker.createTask({
      ...input,
      localAssets: [...skillAttachments, ...input.localAssets].map(
        (attachment) => ({
          localAssetId: attachment.localAssetId,
          filename: attachment.filename,
        }),
      ),
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
    // Always retain deterministic generated files after a failed attempt.
    // A synchronous delete used to leave the Dashboard idempotency index
    // pointing at a tombstone, so the next click failed with an invalid local
    // asset response instead of replaying the original operation safely.
    throw error;
  }
}

async function createWebsiteKnowledgeBaseTaskWithSkill(
  broker: GeoPresalesBroker,
  input: {
    projectId: string;
    skillVersion: WebsiteKnowledgeBaseWriterVersion;
    prompt: string;
    taskInput: GeoTaskSkillPackage;
    localAssets: Array<{ localAssetId: string; filename: string }>;
    idempotencyKey: string;
    businessOwnerName: string;
  },
) {
  const { taskInput, skillVersion, ...taskInputWithoutGeneratedAttachment } =
    input;
  const skillArchive =
    await buildWebsiteKnowledgeBaseSkillArchive(skillVersion);
  const skillSha256 = crypto
    .createHash("sha256")
    .update(skillArchive)
    .digest("hex");
  const result = await createGeoTaskWithSkillPackages(
    broker,
    {
      ...taskInputWithoutGeneratedAttachment,
      contract: PRESALES_CONTRACTS.knowledgeBaseCandidate,
    },
    [
      {
        filename: WEBSITE_KB_SKILL_ARCHIVE_FILENAME,
        body: skillArchive,
      },
      taskInput,
    ],
  );
  return {
    task: result.task,
    skillAttachment: result.skillAttachments[0]!,
    generatedAttachments: result.skillAttachments,
    skillVersion,
    skillSha256,
  };
}

function trackArchiveFile(
  value: ProjectTokenValue,
  _task: BrokerTask,
): ProjectTokenValue {
  return value;
}

function resolveKnowledgeBaseArtifact(
  value: ProjectTokenValue,
  _task: BrokerTask,
): {
  artifactId: string;
  filename: string;
  sha256?: string;
  packageManifestSha256?: string;
} | null {
  const finalArtifact = value.knowledgeBaseArtifact?.final;
  if (!finalArtifact) return null;
  return {
    artifactId: finalArtifact.artifactId,
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
      safeCustomerUploadFilename(value.filename) !==
        safeCustomerUploadFilename(attachment.filename)
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
  const value = task.localTaskId;
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

function serviceBankTransferOrderId(input: {
  projectId: string;
  manualOrderReference: string;
  questionId: string;
  category: GeoServiceCategory;
  monitoringEdition: GeoMonitoringEdition;
  amountFen: number;
}) {
  const digest = sha256(
    JSON.stringify({
      schemaVersion: 1,
      purchaseType: "service-bank-transfer",
      projectId: input.projectId,
      manualOrderReference: input.manualOrderReference,
      questionId: input.questionId,
      category: input.category,
      monitoringEdition: input.monitoringEdition,
      amountFen: input.amountFen,
    }),
  );
  const decimal = BigInt(`0x${digest}`).toString(10).padStart(78, "0");
  return `2${decimal.slice(0, 31)}`;
}

function serviceBankTransferAuthorizationDigest(input: {
  projectId: string;
  manualOrderReference: string;
  orderId: string;
  questionId: string;
  category: GeoServiceCategory;
  monitoringEdition: GeoMonitoringEdition;
  amountFen: number;
}) {
  return sha256(
    JSON.stringify({
      schemaVersion: 1,
      purchaseType: "service-bank-transfer",
      projectId: input.projectId,
      manualOrderReference: input.manualOrderReference,
      orderId: input.orderId,
      questionId: input.questionId,
      category: input.category,
      monitoringEdition: input.monitoringEdition,
      amountFen: input.amountFen,
    }),
  );
}

function normalizedIsoTimestamp(...values: unknown[]) {
  for (const value of values) {
    const normalized =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim()
          ? /^\d{10,13}$/.test(value.trim())
            ? Number(value.trim())
            : value.trim()
          : undefined;
    if (normalized === undefined) continue;
    const timestamp =
      typeof normalized === "number"
        ? normalized < 100_000_000_000
          ? normalized * 1000
          : normalized
        : Date.parse(normalized);
    if (!Number.isFinite(timestamp)) continue;
    return new Date(timestamp).toISOString();
  }
  return undefined;
}

function hasServiceContractEvidence(value: ProjectTokenValue) {
  const externalWechatEvidence =
    value.serviceContractAuthorizationMode === "external_wechat" &&
    Boolean(normalizedIsoTimestamp(value.serviceContractAuthorizedAt));
  const legacyManualEvidence = Boolean(
    value.serviceManualOrderReference &&
      value.serviceManualContractId &&
      normalizedIsoTimestamp(value.serviceManualSignedAt),
  );
  const legacyElectronicEvidence = Boolean(
    value.serviceContractId &&
      value.serviceContractTemplateVersion &&
      /^[a-f0-9]{64}$/i.test(value.serviceContractDocumentSha256 || "") &&
      normalizedIsoTimestamp(value.serviceContractSignedAt) &&
      value.serviceContractSignatoryId,
  );
  return (
    externalWechatEvidence || legacyManualEvidence || legacyElectronicEvidence
  );
}

function assertServiceContractEvidence(value: ProjectTokenValue) {
  if (hasServiceContractEvidence(value)) return;
  throw new GeoHttpError(
    "合同确认记录不完整，请联系管理员后再付款",
    409,
    "SERVICE_CONTRACT_EVIDENCE_REQUIRED",
  );
}

const PUBLIC_ASSESSMENT_INTERNAL_PATTERN =
  /\b(?:unavailable|unknown|question_baseline(?:_v2)?|citationlist|referencelist|evidencerefs|calculationbasis|observed_outcome|direct_asset|not_applicable|measurementstatus|sourcecount|rationale|schemaversion|(?:raw-)?output-schema(?:\.json)?)\b|\b(?:[a-z][a-z0-9_-]*\/)?run[-_ ]?\d+\b/i;

function publicAssessmentText(value: unknown, fallback: string) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const normalized = value.trim();
  return normalized.toLowerCase() === "schema" ||
    PUBLIC_ASSESSMENT_INTERNAL_PATTERN.test(normalized) ||
    !/[\u3400-\u9fff]/.test(normalized)
    ? fallback
    : normalized;
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

const GEO_SERVER_RESERVED_ATTACHMENT_FILENAMES = new Set(
  [
    WEBSITE_KB_SKILL_ARCHIVE_FILENAME,
    QUESTION_SKILL_ARCHIVE_FILENAME,
    CUSTOM_QUESTION_CLASSIFIER_SKILL_ARCHIVE_FILENAME,
    ASSESSMENT_SKILL_ARCHIVE_FILENAME,
    FORECAST_SKILL_ARCHIVE_FILENAME,
    WEBSITE_KB_TASK_INPUT_FILENAME,
    QUESTION_TASK_INPUT_FILENAME,
    CUSTOM_QUESTION_TASK_INPUT_FILENAME,
    ASSESSMENT_TASK_INPUT_FILENAME,
    FORECAST_TASK_INPUT_FILENAME,
    FORECAST_OUTPUT_TEMPLATE_FILENAME,
    FORECAST_OUTPUT_RESULT_FILENAME,
    "frontmind-standard-one-month-scenario.json",
    "website-lead-candidate-v1.zip",
  ].map((filename) => filename.normalize("NFKC").toLowerCase()),
);

function safeCustomerUploadFilename(value: string) {
  const sanitized = sanitizeFilename(value, "company-material");
  if (
    !GEO_SERVER_RESERVED_ATTACHMENT_FILENAMES.has(
      sanitized.normalize("NFKC").toLowerCase(),
    )
  ) {
    return sanitized;
  }
  const digest = crypto
    .createHash("sha256")
    .update(sanitized, "utf8")
    .digest("hex")
    .slice(0, 12);
  return `customer-upload-${digest}-${sanitized}`.slice(0, 180);
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

function mapGeoQuestionBrokerContractError(error: unknown): unknown {
  if (error instanceof GeoBrokerError && [400, 422].includes(error.status)) {
    console.warn("[GEO question creation]", {
      event: "broker_contract_rejected",
      diagnosticCode: error.code,
      status: error.status,
    });
    return new GeoHttpError(
      "问题生成服务合同异常，知识库已保留，请重试或重置项目",
      502,
      "GEO_QUESTION_BROKER_CONTRACT_ERROR",
    );
  }
  return error;
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

export class KnowledgeBaseArchiveValidationError extends GeoHttpError {
  constructor(
    category: KnowledgeBaseValidationCategory,
    readonly validationReason: string,
  ) {
    const safeCategory: KnowledgeBaseValidationCategory = [
      "structure",
      "media",
      "content",
      "unsafe",
    ].includes(category)
      ? category
      : "structure";
    super(
      KNOWLEDGE_BASE_VALIDATION_PUBLIC_ERRORS[safeCategory],
      422,
      `ARCHIVE_${safeCategory.toUpperCase()}_VALIDATION_FAILED`,
    );
    this.name = "KnowledgeBaseArchiveValidationError";
    this.category = safeCategory;
  }

  readonly category: KnowledgeBaseValidationCategory;
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
  if (error instanceof GeoMonitorFreeReservationStoreError) {
    if (error.code === "SCOPE_CONFLICT") {
      return new GeoHttpError(error.message, 409, "MONITOR_SCOPE_CONFLICT");
    }
    if (error.code === "CLIENT_REQUEST_CONFLICT") {
      return new GeoHttpError(
        error.message,
        409,
        "MONITOR_CLIENT_REQUEST_CONFLICT",
      );
    }
    if (error.code === "PROJECT_DELETION_BLOCKED") {
      return new GeoHttpError(
        error.message,
        409,
        "MONITOR_PROJECT_DELETE_BLOCKED",
      );
    }
    if (error.code === "PROJECT_DELETION_FENCED") {
      return new GeoHttpError(error.message, 410, "PROJECT_DELETED");
    }
    return new GeoHttpError(
      "免费监控恢复状态暂时无法安全保存，请使用原请求重试",
      503,
      "MONITOR_RESERVATION_STORE_UNAVAILABLE",
    );
  }
  if (error instanceof GeoCustomQuestionValidationStoreError) {
    if (error.code === "IDEMPOTENCY_CONFLICT") {
      return new GeoHttpError(
        error.message,
        409,
        "CUSTOM_QUESTION_IDEMPOTENCY_CONFLICT",
      );
    }
    if (error.code === "ACTIVE_RESERVATION_CONFLICT") {
      return new GeoHttpError(
        error.message,
        409,
        "CUSTOM_QUESTION_ACTIVE_RESERVATION_CONFLICT",
      );
    }
    if (error.code === "RESERVATION_EXPIRED") {
      return new GeoHttpError(
        error.message,
        410,
        "CUSTOM_QUESTION_VALIDATION_EXPIRED",
      );
    }
    if (error.code === "RESERVATION_OWNER_MISMATCH") {
      return new GeoHttpError(
        error.message,
        403,
        "CUSTOM_QUESTION_VALIDATION_FORBIDDEN",
      );
    }
    if (error.code === "RESERVATION_NOT_TERMINAL") {
      return new GeoHttpError(
        error.message,
        409,
        "CUSTOM_QUESTION_VALIDATION_NOT_TERMINAL",
      );
    }
    if (error.code === "PROJECT_DELETION_BLOCKED") {
      return new GeoHttpError(
        error.message,
        409,
        "CUSTOM_QUESTION_VALIDATION_DELETE_BLOCKED",
      );
    }
    if (error.code === "PROJECT_DELETION_FENCED") {
      return new GeoHttpError(
        error.message,
        409,
        "CUSTOM_QUESTION_PROJECT_DELETION_FENCED",
      );
    }
    return new GeoHttpError(
      "问题验证状态暂时无法安全保存，请使用原请求重试",
      503,
      "CUSTOM_QUESTION_VALIDATION_STORE_UNAVAILABLE",
    );
  }
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
  // Unknown errors can wrap upstream request bodies. Never emit their message,
  // stack, task output, customer question, or credentials to production logs.
  console.error("[GEO API]", {
    event: "unhandled_error",
    diagnosticCode: "INTERNAL_ERROR",
  });
  return new GeoHttpError("服务暂时不可用，请稍后重试", 500, "INTERNAL_ERROR");
}
