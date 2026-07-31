// server/geo/provisioning.ts
import { z as z2 } from "zod";

// server/geo/schemas.ts
import { z } from "zod";

// server/geo/broker.ts
var GEO_MONITOR_PLATFORM_IDS = [
  "doubao",
  "yuanbao",
  "deepseek",
  "baiduai",
  "qianwen",
  "kimi"
];

// server/geo/schemas.ts
var GEO_QUESTION_CATEGORIES = [
  "reputation",
  "product_scenario",
  "industry_ranking",
  "competitor_comparison"
];
var GeoQuestionCategorySchema = z.enum(GEO_QUESTION_CATEGORIES);
var PRODUCT_QA_INTENTS = [
  "offering_definition",
  "feature_mechanism",
  "scenario_fit",
  "delivery_usage",
  "support_boundary"
];
var ProductQaIntentSchema = z.enum(PRODUCT_QA_INTENTS);
var GeoQuestionSchema = z.object({
  id: z.string().min(4).max(80),
  category: GeoQuestionCategorySchema,
  question: z.string().min(4).max(120).refine((value) => value.endsWith("\uFF1F"), {
    message: "question must end with a Chinese question mark"
  }),
  rationale: z.string().min(8).max(240),
  enterpriseAnchor: z.string().trim().min(2).max(120).optional(),
  offeringAnchor: z.string().trim().min(2).max(120).optional(),
  qaIntent: ProductQaIntentSchema.optional(),
  evidenceRefs: z.array(z.string().min(3).max(300)).min(1).max(8),
  selectable: z.boolean()
}).strict();
var idPrefixByCategory = {
  reputation: "reputation",
  product_scenario: "product-scenario",
  industry_ranking: "industry-ranking",
  competitor_comparison: "competitor-comparison"
};
var PRODUCT_QA_EVIDENCE_PATH = /(?:^|\/)(?:03_products|04_technology|05_manufacturing|06_industries|07_service)\//i;
function normalizeQuestionAnchor(value) {
  return value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(
    /[\s!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~，。！？、；：“”‘’（）【】《》·…—～￥]+/g,
    ""
  );
}
function questionContainsAnchor(question, anchor) {
  const normalizedAnchor = normalizeQuestionAnchor(anchor);
  return normalizedAnchor.length >= 2 && normalizeQuestionAnchor(question).includes(normalizedAnchor);
}
var FORBIDDEN_GENERATED_QUESTION_PATTERN = /\b(?:reputation|product_scenario|industry_ranking|competitor_comparison)\b|第\s*(?:\d+|[一二三四五六七八九十]+)\s*个(?:问题|问句)|测试问题|值得优化吗/i;
var REPUTATION_INTENT_PATTERN = /(?:背景|团队|资质|认证|专利|合规|安全|可靠|稳定|口碑|评价|声誉|客户|案例|交付|售后|服务|风险|投诉|正规|官方|认可|信任|可信|质量|融资|荣誉|实力)/;
var COMPETITOR_COMPARISON_PATTERN = /(?:对比|相比|比较|区别|差异|相较|取舍|还是|同类|传统方案|传统工具|自建|替代|与.+哪个|和.+哪个|vs)/i;
function normalizeGeneratedQuestion(value) {
  return value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(
    /[\s!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~，。！？、；：“”‘’（）【】《》·…—～￥]+/g,
    ""
  );
}
function questionTemplateSkeleton(item) {
  let skeleton = normalizeGeneratedQuestion(item.question);
  for (const anchor of [item.enterpriseAnchor, item.offeringAnchor]) {
    if (!anchor) continue;
    const normalizedAnchor = normalizeGeneratedQuestion(anchor);
    if (normalizedAnchor) skeleton = skeleton.split(normalizedAnchor).join("");
  }
  return skeleton.replace(/\d+|[一二三四五六七八九十]+/g, "#");
}
var GeoQuestionSetSchema = z.object({
  questions: z.array(GeoQuestionSchema).length(20)
}).strict().superRefine(({ questions }, context) => {
  const seenIds = /* @__PURE__ */ new Set();
  const seenQuestions = /* @__PURE__ */ new Set();
  const seenProductQaIntents = /* @__PURE__ */ new Set();
  const seenRationales = /* @__PURE__ */ new Map();
  const seenQuestionTemplates = /* @__PURE__ */ new Map();
  for (const category of GEO_QUESTION_CATEGORIES) {
    const categoryQuestions = questions.filter(
      (item) => item.category === category
    );
    if (categoryQuestions.length !== 5) {
      context.addIssue({
        code: "custom",
        message: `${category} must contain exactly five questions`,
        path: ["questions"]
      });
    }
  }
  questions.forEach((item, index) => {
    if (seenIds.has(item.id)) {
      context.addIssue({
        code: "custom",
        message: "duplicate id",
        path: ["questions", index, "id"]
      });
    }
    seenIds.add(item.id);
    const normalizedQuestion = item.question.replace(/\s+/g, "").toLocaleLowerCase("zh-CN");
    if (seenQuestions.has(normalizedQuestion)) {
      context.addIssue({
        code: "custom",
        message: "duplicate question",
        path: ["questions", index, "question"]
      });
    }
    seenQuestions.add(normalizedQuestion);
    if (FORBIDDEN_GENERATED_QUESTION_PATTERN.test(item.question)) {
      context.addIssue({
        code: "custom",
        message: "question contains an internal category token or placeholder template",
        path: ["questions", index, "question"]
      });
    }
    const normalizedRationale = normalizeGeneratedQuestion(item.rationale);
    const previousRationale = seenRationales.get(normalizedRationale);
    if (previousRationale !== void 0) {
      context.addIssue({
        code: "custom",
        message: `rationale duplicates question ${previousRationale + 1}`,
        path: ["questions", index, "rationale"]
      });
    } else {
      seenRationales.set(normalizedRationale, index);
    }
    const templateSkeleton = questionTemplateSkeleton(item);
    const previousTemplate = seenQuestionTemplates.get(templateSkeleton);
    if (templateSkeleton.length >= 6 && previousTemplate !== void 0) {
      context.addIssue({
        code: "custom",
        message: `question repeats the template of question ${previousTemplate + 1}`,
        path: ["questions", index, "question"]
      });
    } else {
      seenQuestionTemplates.set(templateSkeleton, index);
    }
    const expectedId = `${idPrefixByCategory[item.category]}-${String(
      questions.filter(
        (candidate, candidateIndex) => candidateIndex <= index && candidate.category === item.category
      ).length
    ).padStart(2, "0")}`;
    if (item.id !== expectedId) {
      context.addIssue({
        code: "custom",
        message: `expected stable id ${expectedId}`,
        path: ["questions", index, "id"]
      });
    }
    const expectedSelectable = item.category !== "industry_ranking";
    if (item.selectable !== expectedSelectable) {
      context.addIssue({
        code: "custom",
        message: `${item.category} selectable must be ${expectedSelectable}`,
        path: ["questions", index, "selectable"]
      });
    }
    if (item.category === "reputation" && !REPUTATION_INTENT_PATTERN.test(item.question)) {
      context.addIssue({
        code: "custom",
        message: "reputation question must express a trust, credibility, delivery, service, or risk-check intent",
        path: ["questions", index, "question"]
      });
    }
    if (item.category === "industry_ranking" && !isIndustryRankingQuestion(item.question)) {
      context.addIssue({
        code: "custom",
        message: "industry_ranking question must express ranking, shortlist, or open recommendation intent",
        path: ["questions", index, "question"]
      });
    }
    if (item.category === "competitor_comparison" && !COMPETITOR_COMPARISON_PATTERN.test(item.question)) {
      context.addIssue({
        code: "custom",
        message: "competitor_comparison question must express a concrete comparison or trade-off",
        path: ["questions", index, "question"]
      });
    }
    if (item.category === "product_scenario") {
      if (!item.enterpriseAnchor) {
        context.addIssue({
          code: "custom",
          message: "product_scenario must declare an enterprise or brand anchor",
          path: ["questions", index, "enterpriseAnchor"]
        });
      } else if (!questionContainsAnchor(item.question, item.enterpriseAnchor)) {
        context.addIssue({
          code: "custom",
          message: "product_scenario question must contain its enterpriseAnchor",
          path: ["questions", index, "question"]
        });
      }
      if (!item.offeringAnchor) {
        context.addIssue({
          code: "custom",
          message: "product_scenario must declare a concrete product, service, module, solution, or function anchor",
          path: ["questions", index, "offeringAnchor"]
        });
      } else if (!questionContainsAnchor(item.question, item.offeringAnchor)) {
        context.addIssue({
          code: "custom",
          message: "product_scenario question must contain its offeringAnchor",
          path: ["questions", index, "question"]
        });
      }
      if (!item.qaIntent) {
        context.addIssue({
          code: "custom",
          message: "product_scenario must declare a qaIntent",
          path: ["questions", index, "qaIntent"]
        });
      } else if (seenProductQaIntents.has(item.qaIntent)) {
        context.addIssue({
          code: "custom",
          message: `duplicate product_scenario qaIntent ${item.qaIntent}`,
          path: ["questions", index, "qaIntent"]
        });
      } else {
        seenProductQaIntents.add(item.qaIntent);
      }
      if (!item.evidenceRefs.some(
        (reference) => PRODUCT_QA_EVIDENCE_PATH.test(reference)
      )) {
        context.addIssue({
          code: "custom",
          message: "product_scenario must cite product, capability, scenario, or service evidence",
          path: ["questions", index, "evidenceRefs"]
        });
      }
    }
  });
  for (const intent of PRODUCT_QA_INTENTS) {
    if (!seenProductQaIntents.has(intent)) {
      context.addIssue({
        code: "custom",
        message: `product_scenario must include qaIntent ${intent} exactly once`,
        path: ["questions"]
      });
    }
  }
});
function normalizeCustomQuestionText(value) {
  const normalized = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "").replace(/\s+/g, " ").trim().replace(/[?？]+$/, "").trim();
  return normalized ? `${normalized}\uFF1F` : normalized;
}
var CreateCustomQuestionRequestSchema = z.object({
  question: z.string().max(240).transform(normalizeCustomQuestionText).pipe(z.string().min(4).max(120))
}).strict();
function isIndustryRankingQuestion(question) {
  const normalized = question.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "").replace(
    /[\s!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~，。！？、；：“”‘’（）【】《》·…—～￥]+/g,
    ""
  );
  if (!normalized) return false;
  const explicitRankingPatterns = [
    /(?:排名|排行|排行榜|榜单|榜首|名次|top\d+|no1|前(?:\d+|十|五|三)|十佳|十大|第一名|冠军)/,
    /(?:行业|市场|赛道|品类).{0,12}(?:最好|最佳|最强|首选|头部|领先者|领导者)/,
    /(?:最好|最佳|最强|首选|头部).{0,10}(?:品牌|产品|公司|企业|平台|机构|服务商|供应商|厂家|工具|方案)/,
    /(?:主流|热门|知名|领先).{0,10}(?:品牌|产品|公司|企业|平台|机构|服务商|供应商|厂家|工具|方案)/,
    /(?:品牌|产品|公司|企业|平台|机构|服务商|供应商|厂家|工具|方案).{0,10}(?:最好|最佳|最强|首选|头部)/,
    /哪(?:一)?(?:家|个|款|种).{0,12}(?:最好|最佳|最强|首选)/
  ];
  if (explicitRankingPatterns.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  const namedComparison = /(?:和|与|跟|对比|相比|vs).{0,30}(?:哪个好|哪家好|更好|更适合|优劣|区别)/.test(
    normalized
  );
  if (namedComparison) return false;
  const openRecommendationPatterns = [
    /(?:推荐品牌|品牌推荐|产品推荐|公司推荐|企业推荐|平台推荐|机构推荐|服务商推荐|供应商推荐|厂家推荐|工具推荐|方案推荐)/,
    /(?:有哪些|有哪(?:些|几)家).{0,16}(?:品牌|公司|企业|平台|机构|服务商|供应商|厂家|工具|方案)/,
    /(?:品牌|公司|企业|平台|机构|服务商|供应商|厂家|工具|方案).{0,16}(?:有哪些|有哪(?:些|几)家|都有谁|怎么选|如何选)/,
    /(?:推荐|值得选择|值得购买).{0,12}(?:哪些|哪(?:一)?家|哪个|哪款|什么|品牌|产品|公司|企业|平台|机构|服务商|供应商|厂家|工具|方案)/,
    /(?:哪些|哪(?:一)?家|哪个|哪款|什么|谁).{0,12}(?:品牌|产品|公司|企业|平台|机构|服务商|供应商|厂家|工具|方案).{0,12}(?:推荐|值得选择|值得购买|比较好|更好|好用|靠谱|专业)/,
    /(?:品牌|产品|公司|企业|平台|机构|服务商|供应商|厂家|工具|方案).{0,10}(?:有推荐|有哪些推荐|推荐哪些|推荐哪)/,
    /哪(?:一)?(?:家|个|款|种).{0,12}(?:好|比较好|更好|好用|靠谱|专业|值得选)/,
    /(?:做|采购|选择).{0,12}(?:找谁|选哪(?:一)?家)/
  ];
  return openRecommendationPatterns.some((pattern) => pattern.test(normalized));
}
var InviteRequestSchema = z.object({ code: z.string().min(1).max(128) }).strict();
var UploadInitRequestSchema = z.object({
  filename: z.string().min(1).max(180),
  contentType: z.string().max(160).optional(),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024)
}).strict();
var ProjectAttachmentSchema = z.object({
  fileId: z.string().min(1).max(240),
  filename: z.string().min(1).max(180),
  uploadToken: z.string().min(16).max(4096)
}).strict();
var CreateProjectRequestSchema = z.object({
  input: z.string().trim().max(4e3).default(""),
  clientRequestId: z.string().uuid().optional(),
  companyName: z.string().trim().min(1).max(200).optional(),
  companyWebsite: z.string().trim().max(2e3).optional(),
  operatorNotes: z.string().trim().max(3e3).optional(),
  attachments: z.array(ProjectAttachmentSchema).max(10).default([])
}).strict().refine((value) => Boolean(value.input || value.attachments.length), {
  message: "input or at least one attachment is required"
}).superRefine((value, context) => {
  const candidates = [
    value.companyWebsite,
    ...value.input.match(/https?:\/\/[^\s<>"']+/gi) || []
  ].filter((item) => Boolean(item));
  for (const candidate of candidates) {
    if (!isPublicHttpUrl(candidate)) {
      context.addIssue({
        code: "custom",
        message: "website URLs must use public HTTP(S) addresses",
        path: ["companyWebsite"]
      });
      break;
    }
  }
});
var RetryProjectRequestSchema = z.object({
  input: z.string().trim().max(4e3).default(""),
  trigger: z.enum(["automatic", "manual"]).optional().default("manual"),
  attachments: z.array(ProjectAttachmentSchema.pick({ fileId: true, filename: true })).max(10).default([])
}).strict().refine((value) => Boolean(value.input || value.attachments.length), {
  message: "input or at least one attachment is required"
}).superRefine((value, context) => {
  const candidates = value.input.match(/https?:\/\/[^\s<>"']+/gi) || [];
  if (candidates.some((candidate) => !isPublicHttpUrl(candidate))) {
    context.addIssue({
      code: "custom",
      message: "website URLs must use public HTTP(S) addresses",
      path: ["input"]
    });
  }
});
var GeoMonitorPlatformSchema = z.enum(GEO_MONITOR_PLATFORM_IDS);
var GeoPaymentMethodSchema = z.enum(["alipay", "wxpay"]);
var GeoPaymentScopeSchema = z.object({
  questionId: z.string().trim().min(4).max(80),
  platformIds: z.array(GeoMonitorPlatformSchema).min(1).max(GEO_MONITOR_PLATFORM_IDS.length)
}).superRefine(({ platformIds }, context) => {
  if (new Set(platformIds).size !== platformIds.length) {
    context.addIssue({
      code: "custom",
      path: ["platformIds"],
      message: "platformIds must be unique"
    });
  }
});
var CreatePaymentRequestSchema = GeoPaymentScopeSchema.safeExtend({
  method: GeoPaymentMethodSchema
}).strict();
var PaymentStatusRequestSchema = GeoPaymentScopeSchema.safeExtend({
  authorization: z.string().trim().min(16).max(4096)
}).strict();
var CreateServicePaymentRequestSchema = z.object({
  method: GeoPaymentMethodSchema
}).strict();
var GeoServiceContractProfileSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  creditCode: z.string().trim().transform((value) => value.toUpperCase()).pipe(z.string().regex(/^[0-9A-HJ-NPQRTUWXY]{18}$/)),
  address: z.string().trim().min(5).max(500),
  signatoryName: z.string().trim().min(2).max(128),
  signatoryTitle: z.string().trim().min(2).max(128),
  mobile: z.string().trim().regex(/^1\d{10}$/),
  email: z.string().trim().email().max(320),
  authorized: z.literal(true)
}).strict();
var CreateServiceContractRequestSchema = z.object({
  profile: GeoServiceContractProfileSchema
}).strict();
var ServiceStatusRequestSchema = z.object({}).strict();
var ServicePaymentAuthorizationSchema = z.object({
  authorization: z.string().trim().min(16).max(4096),
  schemaVersion: z.literal(2).optional(),
  purchaseIntent: z.string().trim().min(16).max(4096).optional()
}).strict();
var CreateServiceAccountRequestV1Schema = z.object({
  displayName: z.string().trim().min(2).max(128),
  username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(8).max(128)
}).strict();
var CreateServiceAccountRequestV2Schema = z.object({
  schemaVersion: z.literal(2),
  account: z.discriminatedUnion("mode", [
    z.object({
      mode: z.literal("create"),
      displayName: z.string().trim().min(2).max(128),
      username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/)
    }).strict(),
    z.object({
      mode: z.literal("bind_existing"),
      purchaseIntent: z.string().trim().min(16).max(4096)
    }).strict()
  ])
}).strict();
var CreateServiceAccountRequestSchema = z.union([
  CreateServiceAccountRequestV2Schema,
  CreateServiceAccountRequestV1Schema
]);
var StartMonitoringRequestSchema = z.object({
  questionId: z.string().trim().min(4).max(80),
  platformIds: z.array(GeoMonitorPlatformSchema).min(1).max(GEO_MONITOR_PLATFORM_IDS.length),
  paymentAuthorization: z.string().trim().min(16).max(4096)
}).strict().superRefine(({ platformIds }, context) => {
  if (new Set(platformIds).size !== platformIds.length) {
    context.addIssue({
      code: "custom",
      path: ["platformIds"],
      message: "platformIds must be unique"
    });
  }
});
function isPublicHttpUrl(value) {
  try {
    const url = new URL(value.replace(/[),.;，。；]+$/, ""));
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "metadata" || hostname === "metadata.google.internal") {
      return false;
    }
    if (hostname === "::1" || hostname === "0:0:0:0:0:0:0:1") return false;
    if (/^(?:fc|fd|fe[89ab])/i.test(hostname.replace(/:/g, ""))) return false;
    const octets = hostname.split(".").map(Number);
    if (octets.length === 4 && octets.every(
      (octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255
    )) {
      const [a, b] = octets;
      return !(a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a >= 224);
    }
    return true;
  } catch {
    return false;
  }
}

// server/geo/provisioning.ts
var serviceCategorySchema = z2.enum([
  "product_scenario",
  "reputation",
  "competitor_comparison"
]);
var isoDateTimeSchema = z2.string().datetime({ offset: true });
var canonicalUtcDateTimeSchema = z2.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/).refine(
  (value) => {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
  },
  { message: "timestamp must be canonical UTC with millisecond precision" }
);
var sha256Schema = z2.string().regex(/^[a-f0-9]{64}$/i);
var identifierSchema = z2.string().trim().min(4).max(128);
var NON_PUBLIC_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home",
  ".lan"
];
function normalizedHostname(url) {
  return url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
}
function isLoopbackHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
function isIpLiteral(hostname) {
  return hostname.includes(":") || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname);
}
function isTrustedExternalAppUrl(value, options = {}) {
  try {
    const url = new URL(value);
    const hostname = normalizedHostname(url);
    if (!hostname || url.username || url.password) return false;
    if (isLoopbackHost(hostname)) {
      return Boolean(options.allowLocalDevelopment && url.protocol === "http:");
    }
    return Boolean(
      url.protocol === "https:" && !isIpLiteral(hostname) && hostname.includes(".") && !NON_PUBLIC_HOST_SUFFIXES.some(
        (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix)
      )
    );
  } catch {
    return false;
  }
}
var publicExternalAppUrlSchema = z2.string().trim().url().max(2048).refine((value) => isTrustedExternalAppUrl(value), {
  message: "external app URL must be a public credential-free HTTPS URL"
});
var workspaceHandoffUrlSchema = z2.string().trim().url().max(2048).refine(
  (value) => isTrustedExternalAppUrl(value, {
    allowLocalDevelopment: process.env.NODE_ENV !== "production"
  }),
  {
    message: "workspace URL must be public HTTPS or an explicit local-development HTTP URL"
  }
);
var GeoAccountProvisionRequestSchema = z2.object({
  schemaVersion: z2.literal(1),
  project: z2.object({
    id: z2.string().trim().min(8).max(80),
    companyName: z2.string().trim().min(1).max(200)
  }).strict(),
  order: z2.object({
    id: z2.string().trim().min(8).max(64),
    tradeNo: z2.string().trim().min(1).max(128),
    status: z2.literal("paid"),
    amountFen: z2.number().int().positive().max(1e7),
    paidAt: z2.string().datetime({ offset: true }),
    serviceCategory: serviceCategorySchema,
    questionId: z2.string().trim().min(4).max(80),
    question: z2.string().trim().min(4).max(500)
  }).strict(),
  contract: z2.object({
    id: z2.string().trim().min(8).max(128),
    status: z2.literal("signed"),
    projectId: z2.string().trim().min(8).max(80),
    orderId: z2.string().trim().min(8).max(64),
    questionId: z2.string().trim().min(4).max(80),
    templateVersion: z2.string().trim().min(1).max(64),
    documentSha256: z2.string().regex(/^[a-f0-9]{64}$/i),
    signedAt: z2.string().datetime({ offset: true }),
    signatoryId: z2.string().trim().min(1).max(128)
  }).strict(),
  account: z2.object({
    username: z2.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/),
    password: z2.string().min(6).max(128),
    displayName: z2.string().trim().min(1).max(128)
  }).strict()
}).strict();
var GeoAccountProvisionResponseSchema = z2.object({
  provision: z2.object({
    id: z2.string().min(1),
    projectId: z2.string().min(1),
    orderId: z2.string().min(1),
    contractId: z2.string().min(1),
    status: z2.literal("completed"),
    completedAt: z2.string().datetime({ offset: true })
  }).strict(),
  user: z2.object({
    id: z2.number().int().positive(),
    username: z2.string().min(1),
    displayName: z2.string().nullable(),
    role: z2.literal("user"),
    isActive: z2.boolean()
  }).strict()
}).strict();
var GeoBasicPurchasedQuestionSchema = z2.object({
  id: z2.string().trim().min(4).max(80),
  category: serviceCategorySchema,
  question: z2.string().trim().min(4).max(500)
}).strict();
var GeoBasicServiceContractSchema = z2.object({
  planCode: z2.literal("basic"),
  serviceDays: z2.literal(30),
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  purchasedQuestion: GeoBasicPurchasedQuestionSchema
}).strict().superRefine(({ startsAt, endsAt }, context) => {
  if (Date.parse(endsAt) - Date.parse(startsAt) !== 30 * 24 * 60 * 60 * 1e3) {
    context.addIssue({
      code: "custom",
      path: ["endsAt"],
      message: "basic service must cover exactly 30 days"
    });
  }
});
var GeoSystemAdminContractEvidenceSchema = z2.object({
  type: z2.literal("system_admin_confirmation"),
  artifact: z2.object({
    taskId: z2.string().trim().min(1).max(128).nullable(),
    fileId: z2.string().trim().min(1).max(128).nullable(),
    outputDescriptor: z2.string().trim().min(1).max(500).nullable(),
    sha256: sha256Schema.nullable()
  }).strict()
}).strict();
var GeoPurchaseContractSchema = z2.object({
  id: identifierSchema,
  status: z2.literal("pending_admin_confirmation"),
  projectId: z2.string().trim().min(8).max(80),
  orderId: z2.string().trim().min(8).max(64),
  questionId: z2.string().trim().min(4).max(80),
  templateVersion: z2.string().trim().min(1).max(64),
  evidence: GeoSystemAdminContractEvidenceSchema
}).strict();
var GeoPurchaseAccountCreateSchema = z2.object({
  mode: z2.literal("create"),
  username: z2.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/),
  displayName: z2.string().trim().min(2).max(128)
}).strict();
var GeoPurchaseAccountBindingSchema = z2.object({
  mode: z2.literal("bind_existing"),
  purchaseIntent: z2.string().trim().min(16).max(4096)
}).strict();
var GeoPurchaseAccountTargetSchema = z2.discriminatedUnion("mode", [
  GeoPurchaseAccountCreateSchema,
  GeoPurchaseAccountBindingSchema
]);
var GeoPurchaseProvisionRequestV2Schema = z2.object({
  schemaVersion: z2.literal(2),
  project: z2.object({
    id: z2.string().trim().min(8).max(80),
    companyName: z2.string().trim().min(1).max(200)
  }).strict(),
  order: z2.object({
    id: z2.string().trim().min(8).max(64),
    tradeNo: z2.string().trim().min(1).max(128),
    status: z2.literal("paid"),
    amountFen: z2.number().int().positive().max(1e7),
    paidAt: isoDateTimeSchema
  }).strict(),
  service: GeoBasicServiceContractSchema,
  contract: GeoPurchaseContractSchema,
  account: GeoPurchaseAccountTargetSchema
}).strict().superRefine((value, context) => {
  const mismatches = [
    [
      ["contract", "projectId"],
      value.contract.projectId === value.project.id ? "" : "contract projectId must match project.id"
    ],
    [
      ["contract", "orderId"],
      value.contract.orderId === value.order.id ? "" : "contract orderId must match order.id"
    ],
    [
      ["contract", "questionId"],
      value.contract.questionId === value.service.purchasedQuestion.id ? "" : "contract questionId must match purchased question"
    ],
    [
      ["service", "startsAt"],
      value.service.startsAt === value.order.paidAt ? "" : "service startsAt must match order paidAt"
    ]
  ];
  mismatches.forEach(([path, message]) => {
    if (message) context.addIssue({ code: "custom", path, message });
  });
});
var purchaseStatusSchema = z2.enum([
  "pending_confirmation",
  "provisioned",
  "failed"
]);
var GeoPurchaseProvisionResponseV2Schema = z2.object({
  schemaVersion: z2.literal(2),
  purchase: z2.object({
    reference: identifierSchema,
    projectId: z2.string().trim().min(8).max(80),
    orderId: z2.string().trim().min(8).max(64),
    status: purchaseStatusSchema,
    updatedAt: isoDateTimeSchema,
    retryable: z2.boolean().optional(),
    message: z2.string().trim().min(1).max(1e3).optional(),
    errorCode: z2.string().trim().min(1).max(128).optional()
  }).strict(),
  account: z2.object({
    username: z2.string().trim().min(1).max(64).optional(),
    displayName: z2.string().trim().min(1).max(128).optional(),
    accountSetupUrl: workspaceHandoffUrlSchema.optional(),
    workspaceUrl: workspaceHandoffUrlSchema.optional()
  }).strict().optional()
}).strict().superRefine((value, context) => {
  if (value.account?.accountSetupUrl && value.purchase.status !== "provisioned") {
    context.addIssue({
      code: "custom",
      path: ["account", "accountSetupUrl"],
      message: "accountSetupUrl is only valid after provisioning"
    });
  }
});
var GeoKnowledgeImportRequestBaseSchema = z2.object({
  companyName: z2.string().trim().min(1).max(200),
  taskId: z2.string().trim().min(1).max(255),
  outputItemId: z2.string().trim().min(1).max(255),
  fileId: z2.string().trim().min(1).max(255).optional(),
  descriptorHash: sha256Schema,
  artifactSha256: sha256Schema,
  filename: z2.string().trim().min(1).max(512)
});
var GeoKnowledgeImportRequestV2Schema = GeoKnowledgeImportRequestBaseSchema.extend({
  schemaVersion: z2.literal(2)
}).strict();
var GeoKnowledgeImportRequestV3Schema = GeoKnowledgeImportRequestBaseSchema.extend({
  schemaVersion: z2.literal(3),
  archiveContractVersion: z2.union([z2.literal(1), z2.literal(2), z2.literal(3)]),
  validationProfile: z2.literal("website-lead-v1"),
  packageManifestSha256: sha256Schema
}).strict();
var GeoKnowledgeImportRequestV4Schema = z2.object({
  schemaVersion: z2.literal(4),
  companyName: z2.string().trim().min(1).max(200),
  candidate: z2.object({
    taskId: z2.string().trim().min(1).max(255),
    outputItemId: z2.string().trim().min(1).max(255),
    fileId: z2.string().trim().min(1).max(255).optional(),
    descriptorHash: sha256Schema,
    sha256: sha256Schema
  }).strict(),
  finalArtifact: z2.object({
    fileId: z2.string().trim().min(1).max(255),
    filename: z2.string().trim().min(1).max(512),
    sha256: sha256Schema,
    archiveContractVersion: z2.literal(3),
    validationProfile: z2.literal("website-lead-v1"),
    packageManifestSha256: sha256Schema,
    finalizerVersion: z2.literal("website-kb-finalizer-v1")
  }).strict()
}).strict();
var GeoKnowledgeImportRequestSchema = z2.discriminatedUnion(
  "schemaVersion",
  [
    GeoKnowledgeImportRequestV2Schema,
    GeoKnowledgeImportRequestV3Schema,
    GeoKnowledgeImportRequestV4Schema
  ]
);
var knowledgeImportStatusSchema = z2.enum([
  "pending",
  "importing",
  "ready",
  "failed"
]);
var GeoKnowledgeImportResponsePayloadSchema = z2.object({
  id: identifierSchema,
  projectId: z2.string().trim().min(8).max(80),
  status: knowledgeImportStatusSchema,
  updatedAt: isoDateTimeSchema,
  retryable: z2.boolean().optional(),
  message: z2.string().trim().min(1).max(1e3).optional(),
  workspaceUrl: workspaceHandoffUrlSchema.optional()
}).strict();
var GeoKnowledgeImportResponseV2Schema = z2.object({
  schemaVersion: z2.literal(2),
  knowledgeImport: GeoKnowledgeImportResponsePayloadSchema
}).strict();
var GeoKnowledgeImportResponseV3Schema = z2.object({
  schemaVersion: z2.literal(3),
  knowledgeImport: GeoKnowledgeImportResponsePayloadSchema
}).strict();
var GeoKnowledgeImportResponseV4Schema = z2.object({
  schemaVersion: z2.literal(4),
  knowledgeImport: GeoKnowledgeImportResponsePayloadSchema
}).strict();
var GeoKnowledgeImportResponseSchema = z2.discriminatedUnion(
  "schemaVersion",
  [
    GeoKnowledgeImportResponseV2Schema,
    GeoKnowledgeImportResponseV3Schema,
    GeoKnowledgeImportResponseV4Schema
  ]
);
var GEO_MANUAL_SERVICE_ORDER_STATUSES = [
  "pending_admin",
  "signature_required",
  "payment_required",
  "account_setup_required",
  "activation_required",
  "active",
  "rejected",
  "failed"
];
var GeoManualServiceOrderStatusSchema = z2.enum(
  GEO_MANUAL_SERVICE_ORDER_STATUSES
);
var GeoManualServiceOrderCreateRequestSchema = z2.object({
  schemaVersion: z2.literal(1),
  project: z2.object({
    id: z2.string().trim().min(8).max(80),
    companyName: z2.string().trim().min(1).max(200)
  }).strict(),
  service: z2.object({
    planCode: z2.literal("basic"),
    serviceDays: z2.literal(30),
    purchasedQuestion: GeoBasicPurchasedQuestionSchema
  }).strict(),
  contract: z2.object({
    templateVersion: z2.string().trim().min(1).max(64),
    profile: GeoServiceContractProfileSchema
  }).strict()
}).strict().superRefine((value, context) => {
  const normalize = (text) => text.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
  if (normalize(value.project.companyName) !== normalize(value.contract.profile.legalName)) {
    context.addIssue({
      code: "custom",
      path: ["contract", "profile", "legalName"],
      message: "contract legalName must match project companyName"
    });
  }
});
var GeoManualServiceOrderPaymentRequestSchema = z2.object({
  schemaVersion: z2.literal(1),
  payment: z2.object({
    orderId: z2.string().trim().min(8).max(64),
    tradeNo: z2.string().trim().min(1).max(128),
    amountFen: z2.number().int().positive().max(1e7),
    paidAt: isoDateTimeSchema
  }).strict()
}).strict();
var GeoManualServiceOrderAccountRequestSchema = z2.object({
  schemaVersion: z2.literal(1),
  account: z2.discriminatedUnion("mode", [
    z2.object({
      mode: z2.literal("create"),
      username: z2.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/),
      displayName: z2.string().trim().min(2).max(128),
      password: z2.string().min(8).max(128)
    }).strict(),
    GeoPurchaseAccountBindingSchema
  ])
}).strict();
var GeoManualServiceOrderResponseSchema = z2.object({
  schemaVersion: z2.literal(1),
  order: z2.object({
    reference: identifierSchema,
    projectId: z2.string().trim().min(8).max(80),
    status: GeoManualServiceOrderStatusSchema,
    amountFen: z2.number().int().positive().max(1e7),
    contractId: identifierSchema.optional(),
    signingUrl: publicExternalAppUrlSchema.optional(),
    signedAt: isoDateTimeSchema.optional(),
    provisioningReference: identifierSchema.optional(),
    message: z2.string().trim().min(1).max(1e3).optional(),
    retryable: z2.boolean().optional(),
    updatedAt: isoDateTimeSchema
  }).strict(),
  account: z2.object({
    username: z2.string().trim().min(1).max(64).optional(),
    displayName: z2.string().trim().min(1).max(128).optional(),
    accountSetupUrl: workspaceHandoffUrlSchema.optional(),
    workspaceUrl: workspaceHandoffUrlSchema.optional()
  }).strict().optional()
}).strict().superRefine((value, context) => {
  if (value.account?.accountSetupUrl && value.order.status !== "active") {
    context.addIssue({
      code: "custom",
      path: ["account"],
      message: "account URLs are only valid for an active order"
    });
  }
});
var GeoProjectOrderStateSchema = z2.enum([
  "pending",
  "paid",
  "fulfilling",
  "fulfilled",
  "terminal_failed",
  "closed",
  "review_required"
]);
var GeoProjectOrderSchema = z2.object({
  orderId: identifierSchema,
  projectId: z2.string().trim().min(8).max(80),
  purchaseType: z2.enum(["monitoring", "service"]),
  amountFen: z2.number().int().positive().max(1e7),
  authorizationDigest: sha256Schema.transform((value) => value.toLowerCase()),
  state: GeoProjectOrderStateSchema,
  checkoutExpiresAt: isoDateTimeSchema,
  eventAt: isoDateTimeSchema,
  paidAt: isoDateTimeSchema.optional(),
  fulfilledAt: isoDateTimeSchema.optional()
}).strict();
var GeoProjectOrderEnvelopeSchema = z2.object({
  schemaVersion: z2.literal(1),
  order: GeoProjectOrderSchema
}).strict();
var GeoProjectOrderIntentCommitEnvelopeSchema = z2.object({
  schemaVersion: z2.literal(1),
  intent: GeoProjectOrderSchema,
  order: GeoProjectOrderSchema
}).strict().superRefine((value, context) => {
  if (value.intent.state !== "closed" || value.intent.projectId !== value.order.projectId || value.intent.purchaseType !== value.order.purchaseType || value.intent.amountFen !== value.order.amountFen) {
    context.addIssue({
      code: "custom",
      path: ["intent"],
      message: "closed intent does not match the committed checkout"
    });
  }
});
var GeoProjectOrdersByProjectSchema = z2.object({
  schemaVersion: z2.literal(1),
  projectId: z2.string().trim().min(8).max(80),
  blockDeletion: z2.boolean(),
  orders: z2.array(GeoProjectOrderSchema).max(100)
}).strict().superRefine((value, context) => {
  if (value.orders.some((order) => order.projectId !== value.projectId)) {
    context.addIssue({
      code: "custom",
      path: ["orders"],
      message: "all orders must belong to the requested project"
    });
  }
  const expectedBlockDeletion = value.orders.some(
    (order) => order.state !== "fulfilled" && order.state !== "terminal_failed" && order.state !== "closed"
  );
  if (value.blockDeletion !== expectedBlockDeletion) {
    context.addIssue({
      code: "custom",
      path: ["blockDeletion"],
      message: "blockDeletion must match the persisted order states"
    });
  }
});
var GeoProjectOrderRegistryReadySchema = z2.object({
  schemaVersion: z2.literal(1),
  ready: z2.literal(true)
}).strict();
var GeoPaymentReceiptSchema = z2.object({
  orderId: z2.string().trim().regex(/^\d{1,32}$/),
  tradeNo: z2.string().min(8).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  amountFen: z2.number().int().positive().max(1e7),
  paidAt: canonicalUtcDateTimeSchema,
  purchaseType: z2.enum(["monitoring", "service"]),
  reviewRequired: z2.boolean(),
  scopeHash: sha256Schema.transform((value) => value.toLowerCase()),
  authorizationDigest: sha256Schema.transform((value) => value.toLowerCase())
}).strict();
var GeoPaymentReceiptEnvelopeSchema = z2.object({
  schemaVersion: z2.literal(1),
  receipt: GeoPaymentReceiptSchema
}).strict();
var GeoPaymentReceiptReadySchema = z2.object({
  schemaVersion: z2.literal(1),
  ready: z2.literal(true)
}).strict();
var GeoPaymentReceiptLookupSchema = z2.object({
  orderId: z2.string().trim().regex(/^\d{1,32}$/),
  scopeHash: sha256Schema.transform((value) => value.toLowerCase()),
  authorizationDigest: sha256Schema.transform((value) => value.toLowerCase())
}).strict();

// server/geo/payment.ts
var ZPAY_ORDER_QUERY_URL = "https://zpayz.cn/api.php";
var PAYMENT_TOKEN_TTL_MS = 24 * 60 * 60 * 1e3;
var PAYMENT_AUTOMATIC_FULFILLMENT_GRACE_MS = 30 * 60 * 1e3;
var PAYMENT_CALLBACK_RECORDING_GRACE_MS = 365 * 24 * 60 * 60 * 1e3;
var EARLIEST_SUPPORTED_PAYMENT_MS = Date.parse(
  "2020-01-01T00:00:00.000Z"
);
var MAX_PROVIDER_CLOCK_SKEW_MS = 5 * 60 * 1e3;
var MAX_ZPAY_RESPONSE_BYTES = 64 * 1024;
var GeoPaymentVerificationError = class extends Error {
  constructor(message, code = "PAYMENT_NOT_VERIFIED", status = 402) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "GeoPaymentVerificationError";
  }
};
var GeoPaymentConfigurationError = class extends Error {
  constructor(message = "ZPAY payment configuration is invalid") {
    super(message);
    this.name = "GeoPaymentConfigurationError";
  }
};
function assertGeoPaymentConfigurationFromEnv(env) {
  const config = zpayConfigurationFromEnv(env);
  if (!config) {
    throw new GeoPaymentConfigurationError(
      "Required ZPAY payment configuration is missing"
    );
  }
  try {
    assertZpayConfiguration(config);
  } catch {
    throw new GeoPaymentConfigurationError();
  }
}
async function verifyGeoPaymentProviderFromEnv(env, fetchImpl = fetch) {
  assertGeoPaymentConfigurationFromEnv(env);
  const config = zpayConfigurationFromEnv(env);
  const query = new URL(ZPAY_ORDER_QUERY_URL);
  query.searchParams.set("act", "balance");
  query.searchParams.set("pid", config.pid);
  query.searchParams.set("key", config.key);
  let response;
  try {
    response = await fetchImpl(query, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8e3)
    });
  } catch {
    throw paymentProviderReadinessError();
  }
  if (!response.ok) throw paymentProviderReadinessError();
  let result2;
  try {
    result2 = parseZpayResponseRecord(
      await readBoundedResponseText(response)
    );
  } catch (error) {
    if (error instanceof GeoPaymentVerificationError) throw error;
    throw paymentProviderReadinessError();
  }
  if (String(result2.code ?? "") !== "1") {
    throw paymentProviderReadinessError();
  }
  return {
    status: "ok",
    provider: "zpay",
    callbackOrigin: new URL(config.publicBaseUrl).origin
  };
}
function zpayConfigurationFromEnv(env) {
  const pid = env.FRONTMIND_ZPAY_PID?.trim() || "";
  const key = env.FRONTMIND_ZPAY_KEY?.trim() || "";
  const publicBaseUrl = env.FRONTMIND_PUBLIC_BASE_URL?.trim() || env.FRONTMIND_PUBLIC_URL?.trim() || "";
  if (!pid || !key || !publicBaseUrl) return void 0;
  return {
    pid,
    key,
    publicBaseUrl,
    channelIds: env.FRONTMIND_ZPAY_CID?.trim() || void 0,
    production: env.NODE_ENV === "production"
  };
}
function assertZpayConfiguration(config) {
  if (!/^[A-Za-z0-9]{2,64}$/.test(config.pid)) {
    throw new Error("Invalid ZPAY pid");
  }
  if (config.key.length < 8) throw new Error("Invalid ZPAY key");
  const publicBaseUrl = new URL(config.publicBaseUrl);
  if (!["http:", "https:"].includes(publicBaseUrl.protocol) || publicBaseUrl.username || publicBaseUrl.password || publicBaseUrl.search || publicBaseUrl.hash) {
    throw new Error("Invalid public base URL");
  }
  if (config.production && publicBaseUrl.protocol !== "https:") {
    throw new Error("Production payment callbacks require HTTPS");
  }
  if (config.production && !isPublicCallbackHostname(publicBaseUrl.hostname)) {
    throw new Error("Production payment callbacks require a public hostname");
  }
  if (config.channelIds && !/^\d+(?:,\d+)*$/.test(config.channelIds)) {
    throw new Error("Invalid ZPAY channel ids");
  }
}
function isPublicCallbackHostname(value) {
  const hostname = value.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname === "0.0.0.0" || hostname === "::1")
    return false;
  if (hostname.includes(":") && (/^f[cd]/.test(hostname) || /^fe[89ab]/.test(hostname)))
    return false;
  const ipv4 = hostname.match(/^(\d{1,3})(?:\.(\d{1,3})){3}$/);
  if (!ipv4) return true;
  const octets = hostname.split(".").map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return false;
  return !(octets[0] === 10 || octets[0] === 127 || octets[0] === 169 && octets[1] === 254 || octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31 || octets[0] === 192 && octets[1] === 168);
}
async function readBoundedResponseText(response) {
  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader) {
    const declaredLength = Number(lengthHeader);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_ZPAY_RESPONSE_BYTES) {
      throw new GeoPaymentVerificationError(
        "\u652F\u4ED8\u7ED3\u679C\u54CD\u5E94\u5F02\u5E38",
        "PAYMENT_QUERY_INVALID",
        502
      );
    }
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_ZPAY_RESPONSE_BYTES) {
        await reader.cancel().catch(() => void 0);
        throw new GeoPaymentVerificationError(
          "\u652F\u4ED8\u7ED3\u679C\u54CD\u5E94\u5F02\u5E38",
          "PAYMENT_QUERY_INVALID",
          502
        );
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, totalBytes).toString("utf8");
}
function paymentProviderReadinessError() {
  return new GeoPaymentVerificationError(
    "ZPAY \u5546\u6237\u8FDE\u63A5\u9A8C\u8BC1\u5931\u8D25",
    "PAYMENT_PROVIDER_NOT_READY",
    503
  );
}
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function parseZpayResponseRecord(body) {
  const parsed = JSON.parse(body);
  const unwrapped = typeof parsed === "string" ? JSON.parse(parsed) : parsed;
  return asRecord(unwrapped);
}

// scripts/verify-live-payment.ts
var result = await verifyGeoPaymentProviderFromEnv({
  ...process.env,
  NODE_ENV: "production"
});
console.log(JSON.stringify(result, null, 2));
