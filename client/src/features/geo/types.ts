export type GeoStage =
  | "enterprise_analysis"
  | "question_recommendation"
  | "monitoring"
  | "current_assessment"
  | "service_activation";

export type GeoProjectStatus =
  | "draft"
  | "queued"
  | "uploading"
  | "analyzing"
  | "recommending"
  | "ready"
  | "failed";

export type GeoQuestionCategory =
  | "reputation"
  | "product_scenario"
  | "industry_ranking"
  | "competitor_comparison";

export type GeoPlatformId =
  | "doubao"
  | "yuanbao"
  | "deepseek"
  | "baiduai"
  | "qianwen"
  | "kimi";

export type GeoMonitoringStatus =
  | "not_started"
  | "payment_pending"
  | "submitted"
  | "capturing"
  | "partial_review"
  | "completed"
  | "failed";

export type GeoAssessmentStatus =
  | "not_started"
  | "queued"
  | "running"
  | "ready"
  | "failed";

export type GeoExecutionStatus =
  | "queued"
  | "running"
  | "waiting"
  | "partial_review"
  | "completed"
  | "failed"
  | "unknown";

export type GeoExecutionEvent = {
  id: string;
  kind:
    | "status"
    | "model_output"
    | "result_summary"
    | "progress_summary"
    | "artifact"
    | "poll"
    | "error";
  message: string;
  createdAt?: string;
};

export type GeoExecutionCounters = {
  completed: number;
  failed: number;
  total: number;
};

export type GeoCrawlProgress = {
  schemaVersion: 1;
  reportedAt: string;
  phase:
    | "planning"
    | "crawling"
    | "extracting"
    | "assets"
    | "documents"
    | "finalizing"
    | "completed";
  visitedLinks: number;
  successfulPages: number;
  failedPages: number;
  textCharacters: number;
  imagesDiscovered: number;
  imagesDownloaded: number;
  documentsParsed: number;
  webQueriesExecuted: number;
};

export type GeoExecutionLogEntry = {
  id: string;
  stage: GeoStage;
  title: string;
  status: GeoExecutionStatus;
  progress?: number;
  startedAt?: string;
  updatedAt?: string;
  completedAt?: string;
  nextPollAt?: string;
  counters?: GeoExecutionCounters;
  crawlProgress?: GeoCrawlProgress;
  events: GeoExecutionEvent[];
};

export type GeoExecutionLog = {
  currentEntryId?: string;
  fetchedAt: string;
  updatedAt: string;
  entries: GeoExecutionLogEntry[];
};

export type GeoAnswerSource = {
  title: string;
  url?: string;
};

export type GeoAnswerMedia = {
  type: "image" | "video" | "audio" | "link";
  url: string;
  title?: string;
  thumbnailUrl?: string;
  source?: string;
};

export type GeoMonitoringAnswer = {
  id: string;
  platformId: GeoPlatformId;
  runIndex: number;
  status: "completed" | "failed" | "stopped" | "error" | "processing";
  answer: string;
  media: GeoAnswerMedia[];
  citations: GeoAnswerSource[];
  references: GeoAnswerSource[];
  capturedAt?: string;
  error?: string;
};

export type GeoMonitoringResult = {
  runId: string;
  status: GeoMonitoringStatus;
  platforms: GeoPlatformId[];
  expectedRecords: number;
  completedRecords: number;
  failedRecords: number;
  nextPollAt?: string;
  startedAt?: string;
  completedAt?: string;
  partialAccepted?: boolean;
  answers: GeoMonitoringAnswer[];
  error?: string;
};

export type GeoAssessmentDimensionId =
  | "semantic_visibility"
  | "semantic_coherence"
  | "semantic_richness"
  | "semantic_authority"
  | "competitive_advantage";

export type GeoAssessmentDimension = {
  id: GeoAssessmentDimensionId;
  label: string;
  score: number;
  maxScore: number;
  summary?: string;
};

export type GeoKnowledgeComparisonStatus =
  | "aligned"
  | "missing"
  | "conflict"
  | "opportunity";

export type GeoKnowledgeComparison = {
  id: string;
  topic: string;
  status: GeoKnowledgeComparisonStatus;
  knowledgeBaseFact?: string;
  answerFinding?: string;
  knowledgeClaimId?: string;
  answerExcerpt?: string;
  explanation?: string;
  recommendedAction?: string;
  runIndex?: number;
  confidence?: number;
  platforms: GeoPlatformId[];
  evidenceRefs: string[];
};

export type GeoAssessmentPlatformBreakdown = {
  platformId: GeoPlatformId;
  responseCount: number;
  successfulResponses: number;
  brandMentionRate: number | null;
  averageRank: number | null;
  factAccuracy: number | null;
  propositionHitRate: number | null;
  citationCount: number;
  referenceCount: number;
  sentiment: "positive" | "neutral" | "negative" | "mixed" | "unknown";
  verdict: string;
  evidenceRefs: string[];
};

export type GeoAssessmentPriorityAction = {
  priority: number;
  dimension: GeoAssessmentDimensionId;
  action: string;
  expectedImpact?: string;
  evidenceRefs: string[];
};

export type GeoAssessmentRankingDiagnostics = {
  eligible: boolean;
  totalObservations: number;
  rankedObservations: number;
  unmentionedObservations: number;
  averageRank: number | null;
  firstPlaceRate: number | null;
  top3Rate: number | null;
  top5Rate: number | null;
  competitorRankGap: number | null;
  calculationBasis?: string;
};

export type GeoAssessmentMethodology = {
  assessmentType?: string;
  isFullBsasAudit?: boolean;
  normalizedMeasuredScore?: number;
  applicableScore?: number;
  applicableMaxScore?: number;
  structuralExcludedMaxScore?: number;
  confidenceScore?: number;
};

export type GeoAssessmentResult = {
  status: GeoAssessmentStatus;
  totalScore?: number;
  rawTotalScore?: number;
  grade?: "A" | "B" | "C" | "D" | "E";
  rawGrade?: "A" | "B" | "C" | "D" | "E";
  structuralExcludedMaxScore?: number;
  applicableMaxScore?: number;
  coverage?: number;
  confidence?: "high" | "medium" | "low";
  scopeLabel?: string;
  summary?: string;
  dimensions: GeoAssessmentDimension[];
  comparisons: GeoKnowledgeComparison[];
  platformBreakdown?: GeoAssessmentPlatformBreakdown[];
  priorityActions?: GeoAssessmentPriorityAction[];
  limitations?: string[];
  rankingDiagnostics?: GeoAssessmentRankingDiagnostics;
  methodology?: GeoAssessmentMethodology;
  generatedAt?: string;
  error?: string;
};

export type GeoOptimizationForecastDimension = {
  id: GeoAssessmentDimensionId;
  label: string;
  currentScore: number;
  targetLow: number;
  targetExpected: number;
  targetHigh: number;
  maxScore: number;
  summary?: string;
  actions: string[];
};

export type GeoOptimizationForecastRoadmapPhase = {
  phase: number;
  weeks: string;
  title: string;
  actions: string[];
  verificationGate: string;
};

export type GeoOptimizationForecastResult = {
  status: GeoAssessmentStatus;
  horizonWeeks?: number;
  currentScore?: number;
  targetLow?: number;
  targetExpected?: number;
  targetHigh?: number;
  gradeLow?: "A" | "B" | "C" | "D" | "E";
  gradeHigh?: "A" | "B" | "C" | "D" | "E";
  challengeUpperOnly?: "A" | "B" | "C" | "D" | "E";
  rawCurrentScore?: number;
  rawTargetLow?: number;
  rawTargetExpected?: number;
  rawTargetHigh?: number;
  scoreBasis?: {
    type: "applicable_scope";
    applicableMaxScore: number;
    structuralExcludedMaxScore: number;
  };
  summary?: string;
  dimensions: GeoOptimizationForecastDimension[];
  assumptions: string[];
  roadmap: GeoOptimizationForecastRoadmapPhase[];
  limitations?: string[];
  generatedAt?: string;
  error?: string;
};

export type GeoFileReference = {
  id: string;
  name: string;
  size: number;
  type: string;
};

export type GeoKnowledgeMetric = {
  key: string;
  label: string;
  value: string | number;
  detail?: string;
};

export type GeoKnowledgePresentation = {
  summary?: string;
  markdown?: string;
  assetIds: string[];
};

export type GeoKnowledgeLeaf = {
  id: string;
  title: string;
  summary?: string;
  markdown?: string;
  evidenceCount?: number;
  status?: "verified" | "inferred" | "needs_verification" | "not_applicable";
  assetIds: string[];
};

export type GeoKnowledgeSection = {
  id: string;
  title: string;
  summary?: string;
  markdown?: string;
  evidenceCount?: number;
  status?: "verified" | "inferred" | "needs_verification" | "not_applicable";
  contentAvailability?: "complete" | "limited_evidence" | "needs_verification";
  /**
   * Customer-facing branch overview. Older archives only expose `summary` and
   * `markdown`; consumers must keep treating those fields as the fallback.
   */
  overview?: GeoKnowledgePresentation;
  leaves?: GeoKnowledgeLeaf[];
  assetIds?: string[];
};

export type GeoKnowledgeSource = {
  id: string;
  title: string;
  url?: string;
  domain?: string;
  type?: string;
  capturedAt?: string;
};

export type GeoKnowledgeAsset = {
  id: string;
  name: string;
  sectionId?: string;
  leafId?: string;
  url?: string;
  previewUrl?: string;
  type?: string;
  source?: string;
  caption?: string;
  alt?: string;
  /**
   * Validated relative entry path inside the locally persisted ZIP. This is
   * optional so historical API responses continue to use `previewUrl`.
   */
  archivePath?: string;
  width?: number;
  height?: number;
};

export type GeoKnowledgeCompletenessCounts = {
  totalLeaves: number;
  applicableLeaves: number;
  verifiedFirstParty: number;
  verifiedAuthoritative: number;
  supportedThirdParty: number;
  inferred: number;
  needsVerification: number;
  notApplicable: number;
};

export type GeoKnowledgeAcquisitionCount = {
  completed: number;
  total: number;
};

export type GeoKnowledgeCompleteness = {
  score: number;
  label: string;
  basis: string;
  counts: GeoKnowledgeCompletenessCounts;
  acquisition: {
    officialPages?: GeoKnowledgeAcquisitionCount;
    images?: GeoKnowledgeAcquisitionCount;
    documents?: GeoKnowledgeAcquisitionCount;
    webQueries?: GeoKnowledgeAcquisitionCount;
  };
  gaps: string[];
  evaluatedAt?: string;
  caveat: string;
};

export type GeoKnowledgeBase = {
  companyName?: string;
  summary?: string;
  generatedAt?: string;
  packageManifestSha256?: string;
  archiveName?: string;
  archiveUrl?: string;
  reportMarkdown?: string;
  metrics: GeoKnowledgeMetric[];
  sections: GeoKnowledgeSection[];
  sources: GeoKnowledgeSource[];
  assets: GeoKnowledgeAsset[];
  completeness?: GeoKnowledgeCompleteness;
};

export type GeoQuestion = {
  id: string;
  category: GeoQuestionCategory;
  question: string;
  rationale?: string;
  evidenceRefs?: string[];
  selectable: boolean;
};

export type GeoServiceCategory = Exclude<
  GeoQuestionCategory,
  "industry_ranking"
>;

export type GeoServiceActivationStatus =
  | "not_started"
  | "profile_required"
  | "contract_preparing"
  | "signature_required"
  | "payment_required"
  | "activation_pending"
  | "account_setup_required"
  | "provisioning"
  | "active"
  | "failed";

export type GeoServiceContractProfile = {
  legalName: string;
  creditCode: string;
  address: string;
  signatoryName: string;
  signatoryTitle: string;
  mobile: string;
  email: string;
  authorized: true;
};

export type GeoManualServiceOrderStatus =
  | "pending_admin"
  | "signature_required"
  | "payment_required"
  | "account_setup_required"
  | "activation_required"
  | "active"
  | "rejected"
  | "failed";

export type GeoServiceActivation = {
  status: GeoServiceActivationStatus;
  questionId: string;
  category: GeoServiceCategory;
  amountFen: number;
  billingMonths: 1;
  planCode?: "basic";
  serviceDays?: 30;
  orderId?: string;
  paidAt?: string;
  profileSubmittedAt?: string;
  contractId?: string;
  contractPreviewUrl?: string;
  signingUrl?: string;
  signedAt?: string;
  contractWorkflowReference?: string;
  manualOrderReference?: string;
  manualOrderStatus?: GeoManualServiceOrderStatus;
  provisioningVersion?: 2;
  provisioningReference?: string;
  provisioningStatus?: "pending_confirmation" | "provisioned" | "failed";
  provisioningMessage?: string;
  provisioningRetryable?: boolean;
  accountMode?: "create" | "bind_existing";
  accountUsername?: string;
  accountDisplayName?: string;
  accountSetupUrl?: string;
  workspaceUrl?: string;
  provisionedAt?: string;
  activatedAt?: string;
  knowledgeImport?: {
    status: "pending" | "importing" | "ready" | "failed";
    retryable?: boolean;
    message?: string;
    updatedAt?: string;
  };
  error?: string;
};

export type GeoProject = {
  id: string;
  preview?: boolean;
  remoteToken: string;
  remoteId?: string;
  title: string;
  input: string;
  createdAt: string;
  updatedAt: string;
  stage: GeoStage;
  status: GeoProjectStatus;
  progress: number;
  progressLabel?: string;
  knowledgeBaseRetryAvailable?: boolean;
  knowledgeBaseValidationCategory?:
    | "structure"
    | "media"
    | "content"
    | "unsafe";
  knowledgeBaseSupportRequired?: boolean;
  questionRetryAvailable?: boolean;
  assessmentRetryAvailable?: boolean;
  optimizationForecastRetryAvailable?: boolean;
  files: GeoFileReference[];
  knowledgeBase?: GeoKnowledgeBase;
  questions: GeoQuestion[];
  selectedQuestionId?: string;
  selectedPlatformIds: GeoPlatformId[];
  monitoring?: GeoMonitoringResult;
  assessment?: GeoAssessmentResult;
  optimizationForecast?: GeoOptimizationForecastResult;
  serviceActivation?: GeoServiceActivation;
  executionLog?: GeoExecutionLog;
  error?: string;
};

export type GeoPlatform = {
  id: GeoPlatformId;
  name: string;
  logo: string;
  answersPerRun: 5;
  unitPriceCny: 2;
  accent: string;
};

export const GEO_PLATFORMS: GeoPlatform[] = [
  {
    id: "doubao",
    name: "豆包",
    logo: "/geo-builder/platforms/doubao.png",
    answersPerRun: 5,
    unitPriceCny: 2,
    accent: "#3867f4",
  },
  {
    id: "yuanbao",
    name: "元宝",
    logo: "/geo-builder/platforms/yuanbao.png",
    answersPerRun: 5,
    unitPriceCny: 2,
    accent: "#08a66c",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    logo: "/geo-builder/platforms/deepseek.ico",
    answersPerRun: 5,
    unitPriceCny: 2,
    accent: "#4f73ff",
  },
  {
    id: "baiduai",
    name: "百度 AI+",
    logo: "/geo-builder/platforms/baiduai.svg",
    answersPerRun: 5,
    unitPriceCny: 2,
    accent: "#315efb",
  },
  {
    id: "qianwen",
    name: "通义千问",
    logo: "/geo-builder/platforms/qianwen.png",
    answersPerRun: 5,
    unitPriceCny: 2,
    accent: "#6f42d9",
  },
  {
    id: "kimi",
    name: "Kimi",
    logo: "/geo-builder/platforms/kimi.ico",
    answersPerRun: 5,
    unitPriceCny: 2,
    accent: "#111827",
  },
];

export const GEO_QUESTION_CATEGORIES: Array<{
  id: GeoQuestionCategory;
  title: string;
  description: string;
}> = [
  { id: "reputation", title: "美誉舆情", description: "信任证据与品牌口碑" },
  {
    id: "product_scenario",
    title: "产品与服务 Q&A",
    description: "具体产品、功能、场景与交付问答",
  },
  {
    id: "industry_ranking",
    title: "行业排名",
    description: "行业词与品牌优胜",
  },
  {
    id: "competitor_comparison",
    title: "竞品对比",
    description: "差异定位与选择依据",
  },
];
