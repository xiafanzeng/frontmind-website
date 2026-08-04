import { z } from "zod";
import { GEO_MONITOR_PLATFORM_IDS } from "./broker";

export const GEO_QUESTION_CATEGORIES = [
  "reputation",
  "product_scenario",
  "industry_ranking",
  "competitor_comparison",
] as const;

export const GeoQuestionCategorySchema = z.enum(GEO_QUESTION_CATEGORIES);

export const PRODUCT_QA_INTENTS = [
  "offering_definition",
  "feature_mechanism",
  "scenario_fit",
  "delivery_usage",
  "support_boundary",
] as const;

export const ProductQaIntentSchema = z.enum(PRODUCT_QA_INTENTS);

export const GeoQuestionSchema = z
  .object({
    id: z.string().min(4).max(80),
    category: GeoQuestionCategorySchema,
    question: z
      .string()
      .min(4)
      .max(120)
      .refine((value) => !/[,，]/.test(value), {
        message: "question must be one direct sentence without commas",
      })
      .refine((value) => value.endsWith("？"), {
        message: "question must end with a Chinese question mark",
      }),
    rationale: z.string().min(8).max(240),
    enterpriseAnchor: z.string().trim().min(2).max(120).optional(),
    offeringAnchor: z.string().trim().min(2).max(120).optional(),
    competitorAnchor: z.string().trim().min(2).max(120).optional(),
    qaIntent: ProductQaIntentSchema.optional(),
    evidenceRefs: z.array(z.string().min(3).max(300)).min(1).max(8),
    selectable: z.boolean(),
  })
  .strict();

const idPrefixByCategory: Record<
  (typeof GEO_QUESTION_CATEGORIES)[number],
  string
> = {
  reputation: "reputation",
  product_scenario: "product-scenario",
  industry_ranking: "industry-ranking",
  competitor_comparison: "competitor-comparison",
};

const PRODUCT_QA_EVIDENCE_PATH =
  /(?:^|\/)(?:03_products|04_technology|05_manufacturing|06_industries|07_service)\//i;

function normalizeQuestionAnchor(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(
      /[\s!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~，。！？、；：“”‘’（）【】《》·…—～￥]+/g,
      "",
    );
}

function questionContainsAnchor(question: string, anchor: string) {
  const normalizedAnchor = normalizeQuestionAnchor(anchor);
  return (
    normalizedAnchor.length >= 2 &&
    normalizeQuestionAnchor(question).includes(normalizedAnchor)
  );
}

const GENERIC_COMPETITOR_ANCHOR_PATTERN =
  /^(?:竞品[甲乙丙丁一二三四五\d]*|(?:同类|其他|传统|原生|自建|替代|第三方|开源|主流|类似)(?:产品|平台|方案|工具|接口|集群|服务|厂商|品牌|公司)?|竞品|对手|友商)$/i;

function isExplicitCompetitorBrand(anchor: string) {
  return !GENERIC_COMPETITOR_ANCHOR_PATTERN.test(
    anchor.normalize("NFKC").replace(/\s+/g, "").trim(),
  );
}

const FORBIDDEN_GENERATED_QUESTION_PATTERN =
  /\b(?:reputation|product_scenario|industry_ranking|competitor_comparison)\b|第\s*(?:\d+|[一二三四五六七八九十]+)\s*个(?:问题|问句)|测试问题|值得优化吗/i;
const REPUTATION_JUDGMENT_PATTERN =
  /(?:怎么样|好不好|好吗|靠谱吗|靠不靠谱|可靠吗|稳不稳定|稳定吗|安全(?:吗|性如何)|正规吗|可信(?:吗|度如何)|值得信赖吗|是否(?:值得信赖|可信|可靠|稳定|安全|正规)|是不是(?:正规|官方|正品|可信|可靠|安全)|口碑(?:如何|怎么样|好吗)|评价(?:如何|怎么样)|如何评价|售后(?:服务)?(?:如何|怎么样|好吗)|投诉(?:多吗|严重吗)|风险(?:高吗|大吗)|满意(?:吗|度如何))/;
const REPUTATION_FACT_RETRIEVAL_PATTERN =
  /(?:背景是什么|什么背景|成立时间|创立时间|有哪些(?:资质|认证|专利|奖项|渠道)|获得了哪些|如何验证|如何核验|怎么验证|怎么核验|提供哪些(?:渠道|服务|支持))/;
const COMPETITOR_COMPARISON_PATTERN =
  /(?:对比|相比|比较|区别|差异|不同|相较|取舍|还是|同类|传统方案|传统工具|自建|替代|与.+哪个|和.+哪个|(?:如何|怎么)评估.+(?:与|和|跟).+|(?:与|和|跟).+(?:应|应该)?(?:如何|怎么)评估|评估.+(?:与|和|跟).+(?:关注|考察|考虑|权衡)|vs)/i;

function normalizeGeneratedQuestion(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(
      /[\s!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~，。！？、；：“”‘’（）【】《》·…—～￥]+/g,
      "",
    );
}

function questionTemplateSkeleton(item: z.infer<typeof GeoQuestionSchema>) {
  let skeleton = normalizeGeneratedQuestion(item.question);
  for (const anchor of [
    item.enterpriseAnchor,
    item.offeringAnchor,
    item.competitorAnchor,
  ]) {
    if (!anchor) continue;
    const normalizedAnchor = normalizeGeneratedQuestion(anchor);
    if (normalizedAnchor) skeleton = skeleton.split(normalizedAnchor).join("");
  }
  return skeleton.replace(/\d+|[一二三四五六七八九十]+/g, "#");
}

export const GeoQuestionSetSchema = z
  .object({
    questions: z.array(GeoQuestionSchema).length(20),
  })
  .strict()
  .superRefine(({ questions }, context) => {
    const seenIds = new Set<string>();
    const seenQuestions = new Set<string>();
    const seenProductQaIntents = new Set<string>();
    const seenRationales = new Map<string, number>();
    const seenQuestionTemplates = new Map<string, number>();

    for (const category of GEO_QUESTION_CATEGORIES) {
      const categoryQuestions = questions.filter(
        (item) => item.category === category,
      );
      if (categoryQuestions.length !== 5) {
        context.addIssue({
          code: "custom",
          message: `${category} must contain exactly five questions`,
          path: ["questions"],
        });
      }
    }

    questions.forEach((item, index) => {
      if (seenIds.has(item.id)) {
        context.addIssue({
          code: "custom",
          message: "duplicate id",
          path: ["questions", index, "id"],
        });
      }
      seenIds.add(item.id);

      const normalizedQuestion = item.question
        .replace(/\s+/g, "")
        .toLocaleLowerCase("zh-CN");
      if (seenQuestions.has(normalizedQuestion)) {
        context.addIssue({
          code: "custom",
          message: "duplicate question",
          path: ["questions", index, "question"],
        });
      }
      seenQuestions.add(normalizedQuestion);

      if (FORBIDDEN_GENERATED_QUESTION_PATTERN.test(item.question)) {
        context.addIssue({
          code: "custom",
          message:
            "question contains an internal category token or placeholder template",
          path: ["questions", index, "question"],
        });
      }

      const normalizedRationale = normalizeGeneratedQuestion(item.rationale);
      const previousRationale = seenRationales.get(normalizedRationale);
      if (previousRationale !== undefined) {
        context.addIssue({
          code: "custom",
          message: `rationale duplicates question ${previousRationale + 1}`,
          path: ["questions", index, "rationale"],
        });
      } else {
        seenRationales.set(normalizedRationale, index);
      }

      const templateSkeleton = questionTemplateSkeleton(item);
      const previousTemplate = seenQuestionTemplates.get(templateSkeleton);
      if (templateSkeleton.length >= 6 && previousTemplate !== undefined) {
        context.addIssue({
          code: "custom",
          message: `question repeats the template of question ${previousTemplate + 1}`,
          path: ["questions", index, "question"],
        });
      } else {
        seenQuestionTemplates.set(templateSkeleton, index);
      }

      const expectedId = `${idPrefixByCategory[item.category]}-${String(
        questions.filter(
          (candidate, candidateIndex) =>
            candidateIndex <= index && candidate.category === item.category,
        ).length,
      ).padStart(2, "0")}`;
      if (item.id !== expectedId) {
        context.addIssue({
          code: "custom",
          message: `expected stable id ${expectedId}`,
          path: ["questions", index, "id"],
        });
      }

      const expectedSelectable = item.category !== "industry_ranking";
      if (item.selectable !== expectedSelectable) {
        context.addIssue({
          code: "custom",
          message: `${item.category} selectable must be ${expectedSelectable}`,
          path: ["questions", index, "selectable"],
        });
      }

      if (item.category === "reputation") {
        if (!item.enterpriseAnchor) {
          context.addIssue({
            code: "custom",
            message:
              "reputation question must declare the current enterprise or brand anchor",
            path: ["questions", index, "enterpriseAnchor"],
          });
        } else if (
          !questionContainsAnchor(item.question, item.enterpriseAnchor)
        ) {
          context.addIssue({
            code: "custom",
            message: "reputation question must contain its enterpriseAnchor",
            path: ["questions", index, "question"],
          });
        }

        if (
          !REPUTATION_JUDGMENT_PATTERN.test(item.question) ||
          REPUTATION_FACT_RETRIEVAL_PATTERN.test(item.question)
        ) {
          context.addIssue({
            code: "custom",
            message:
              "reputation question must be a direct reputation judgment such as reliable, stable, safe, service quality, or customer reputation",
            path: ["questions", index, "question"],
          });
        }
      }

      if (
        item.category === "industry_ranking" &&
        !isIndustryRankingQuestion(item.question)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "industry_ranking question must express ranking, shortlist, or open recommendation intent",
          path: ["questions", index, "question"],
        });
      }

      if (
        item.category === "competitor_comparison" &&
        !COMPETITOR_COMPARISON_PATTERN.test(item.question)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "competitor_comparison question must express a concrete comparison or trade-off",
          path: ["questions", index, "question"],
        });
      }

      if (item.category === "competitor_comparison") {
        if (!item.enterpriseAnchor) {
          context.addIssue({
            code: "custom",
            message:
              "competitor comparison must declare the current enterprise or brand anchor",
            path: ["questions", index, "enterpriseAnchor"],
          });
        } else if (
          !questionContainsAnchor(item.question, item.enterpriseAnchor)
        ) {
          context.addIssue({
            code: "custom",
            message:
              "competitor comparison must contain its declared enterpriseAnchor",
            path: ["questions", index, "question"],
          });
        }

        if (!item.competitorAnchor) {
          context.addIssue({
            code: "custom",
            message:
              "competitor comparison must declare an explicit competitor company or brand anchor",
            path: ["questions", index, "competitorAnchor"],
          });
        } else if (
          !questionContainsAnchor(item.question, item.competitorAnchor)
        ) {
          context.addIssue({
            code: "custom",
            message:
              "competitor comparison must contain its declared competitorAnchor",
            path: ["questions", index, "question"],
          });
        }

        if (
          item.competitorAnchor &&
          !isExplicitCompetitorBrand(item.competitorAnchor)
        ) {
          context.addIssue({
            code: "custom",
            message:
              "competitorAnchor must be an explicit company or brand name rather than a generic alternative",
            path: ["questions", index, "competitorAnchor"],
          });
        }

        if (
          item.enterpriseAnchor &&
          item.competitorAnchor &&
          normalizeQuestionAnchor(item.enterpriseAnchor) ===
            normalizeQuestionAnchor(item.competitorAnchor)
        ) {
          context.addIssue({
            code: "custom",
            message:
              "competitorAnchor must identify a brand other than enterpriseAnchor",
            path: ["questions", index, "competitorAnchor"],
          });
        }
      } else if (item.competitorAnchor) {
        context.addIssue({
          code: "custom",
          message:
            "competitorAnchor is allowed only for competitor comparisons",
          path: ["questions", index, "competitorAnchor"],
        });
      }

      if (item.category === "product_scenario") {
        if (!item.enterpriseAnchor) {
          context.addIssue({
            code: "custom",
            message:
              "product_scenario must declare an enterprise or brand anchor",
            path: ["questions", index, "enterpriseAnchor"],
          });
        } else if (
          !questionContainsAnchor(item.question, item.enterpriseAnchor)
        ) {
          context.addIssue({
            code: "custom",
            message:
              "product_scenario question must contain its enterpriseAnchor",
            path: ["questions", index, "question"],
          });
        }

        if (!item.offeringAnchor) {
          context.addIssue({
            code: "custom",
            message:
              "product_scenario must declare a concrete product, service, module, solution, or function anchor",
            path: ["questions", index, "offeringAnchor"],
          });
        } else if (
          !questionContainsAnchor(item.question, item.offeringAnchor)
        ) {
          context.addIssue({
            code: "custom",
            message:
              "product_scenario question must contain its offeringAnchor",
            path: ["questions", index, "question"],
          });
        }

        if (!item.qaIntent) {
          context.addIssue({
            code: "custom",
            message: "product_scenario must declare a qaIntent",
            path: ["questions", index, "qaIntent"],
          });
        } else if (seenProductQaIntents.has(item.qaIntent)) {
          context.addIssue({
            code: "custom",
            message: `duplicate product_scenario qaIntent ${item.qaIntent}`,
            path: ["questions", index, "qaIntent"],
          });
        } else {
          seenProductQaIntents.add(item.qaIntent);
        }

        if (
          !item.evidenceRefs.some((reference) =>
            PRODUCT_QA_EVIDENCE_PATH.test(reference),
          )
        ) {
          context.addIssue({
            code: "custom",
            message:
              "product_scenario must cite product, capability, scenario, or service evidence",
            path: ["questions", index, "evidenceRefs"],
          });
        }
      }
    });

    for (const intent of PRODUCT_QA_INTENTS) {
      if (!seenProductQaIntents.has(intent)) {
        context.addIssue({
          code: "custom",
          message: `product_scenario must include qaIntent ${intent} exactly once`,
          path: ["questions"],
        });
      }
    }

    const namedCompetitorComparisons = questions.filter(
      (item) =>
        item.category === "competitor_comparison" &&
        item.competitorAnchor &&
        isExplicitCompetitorBrand(item.competitorAnchor),
    );
    if (namedCompetitorComparisons.length < 5) {
      context.addIssue({
        code: "custom",
        message:
          "all five competitor comparisons must name a sourced competitor brand",
        path: ["questions"],
      });
    }
  });

export type GeoQuestion = z.infer<typeof GeoQuestionSchema>;
export type GeoQuestionSet = z.infer<typeof GeoQuestionSetSchema>;

function normalizeCustomQuestionText(value: string) {
  const normalized = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[?？]+$/, "")
    .trim();
  return normalized ? `${normalized}？` : normalized;
}

export const CreateCustomQuestionRequestSchema = z
  .object({
    // Optional only for the bounded legacy bridge. Current clients always send
    // a UUID; old cached clients are mapped to a deterministic server UUID.
    clientRequestId: z.string().uuid().optional(),
    question: z
      .string()
      .max(240)
      .transform(normalizeCustomQuestionText)
      .pipe(z.string().min(4).max(120)),
  })
  .strict();

export type CreateCustomQuestionRequest = z.infer<
  typeof CreateCustomQuestionRequestSchema
>;

/**
 * A deterministic, deliberately conservative policy boundary for the
 * self-service monitor. It rejects open-ended market ranking/recommendation
 * intent while keeping named competitor comparisons selectable.
 */
export function isIndustryRankingQuestion(question: string) {
  const normalized = question
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "")
    .replace(
      /[\s!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~，。！？、；：“”‘’（）【】《》·…—～￥]+/g,
      "",
    );

  if (!normalized) return false;

  // Keep a two-brand comparison selectable, but classify an open or generic
  // comparison target before applying that exemption.
  const openComparisonTarget =
    /(?:和|与|跟|对比|相比|vs)(?:(?:市面上|市场上|行业内|目前|国内|主流|其他|同类)(?:的)?)?(?:哪些|哪(?:些|几)?家|哪个|哪款|什么).{0,8}(?:品牌|产品|公司|企业|平台|机构|服务商|供应商|厂商|厂家|工具|方案|竞品)/.test(
      normalized,
    ) ||
    /(?:和|与|跟|vs)谁/.test(normalized) ||
    /(?:和|与|跟|对比|相比|vs)(?:市面上|市场上|市场|行业内|行业|目前|国内|主流|其他|同类|同行|竞品)(?:的)?(?:品牌|产品|公司|企业|平台|机构|服务商|供应商|厂商|厂家|工具|方案|竞品)?(?:哪(?:一)?(?:个|家|款)|相比|更好|最好|更适合|最适合)/.test(
      normalized,
    ) ||
    /(?:和|与|跟|对比|相比|vs)(?:(?:几个|几家|几款|若干|某些|多个|多家|多款|各家|一众|[两三四五六七八九十\d]+(?:个|家|款))(?:主流|其他|同类|同行|知名|热门|领先)?|(?:主流|其他|同类|同行|知名|热门|领先)(?:(?:几|多)(?:个|家|款)|若干|某些|各家|一众)?)(?:品牌|产品|公司|企业|平台|机构|服务商|供应商|厂商|厂家|工具|方案|竞品).{0,12}(?:哪(?:一)?(?:个|家|款)|相比|更好|最好|更适合|最适合|好)/.test(
      normalized,
    );
  if (openComparisonTarget) return true;

  const namedComparison =
    /(?:和|与|跟|对比|相比|vs).{1,30}(?:哪(?:一)?(?:个|家).{0,8}(?:最好|更好|最适合|更适合|好)|更好|最好|更适合|最适合|优劣|区别)/.test(
      normalized,
    );
  if (namedComparison) return false;

  const explicitRankingPatterns = [
    /(?:排名|排行|排行榜|榜单|榜首|名次|top\d+|no1|前(?:\d+|十|五|三)|十佳|十大|第一名|冠军)/,
    /(?:选型|候选|评估|采购)(?:厂商|品牌|产品|平台|服务商|供应商)?名单/,
    /(?:行业|市场|赛道|品类).{0,12}(?:最好|最佳|最强|首选|头部|领先者|领导者)/,
    /(?:最好|最佳|最强|首选|头部).{0,10}(?:品牌|产品|公司|企业|平台|机构|服务商|供应商|厂商|厂家|工具|方案)/,
    /(?:主流|热门|知名|领先).{0,10}(?:品牌|产品|公司|企业|平台|机构|服务商|供应商|厂商|厂家|工具|方案)/,
    /(?:品牌|产品|公司|企业|平台|机构|服务商|供应商|厂商|厂家|工具|方案).{0,10}(?:最好|最佳|最强|首选|头部)/,
    /哪(?:一)?(?:家|个|款|种).{0,12}(?:最好|最佳|最强|首选)/,
  ];
  if (explicitRankingPatterns.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  const openRecommendationPatterns = [
    /(?:推荐品牌|品牌推荐|产品推荐|公司推荐|企业推荐|平台推荐|机构推荐|服务商推荐|供应商推荐|厂家推荐|工具推荐|方案推荐)/,
    /(?:有哪些|有哪(?:些|几)家).{0,16}(?:品牌|公司|企业|平台|机构|服务商|供应商|厂家|工具|方案)/,
    /(?:品牌|公司|企业|平台|机构|服务商|供应商|厂家|工具|方案).{0,16}(?:有哪些|有哪(?:些|几)家|都有谁|怎么选|如何选)/,
    /(?:推荐|值得选择|值得购买).{0,12}(?:哪些|哪(?:一)?家|哪个|哪款|什么|品牌|产品|公司|企业|平台|机构|服务商|供应商|厂家|工具|方案)/,
    /(?:哪些|哪(?:一)?家|哪个|哪款|什么|谁).{0,12}(?:品牌|产品|公司|企业|平台|机构|服务商|供应商|厂家|厂商|工具|方案).{0,12}(?:推荐|值得选择|值得购买|值得(?:优先)?(?:考虑|考察|评估)|比较好|更好|更适合|适合|好用|靠谱|专业)/,
    /(?:适合|应该|应当|可以|可)(?:优先)?(?:选择|考虑|考察|评估)(?:哪些|哪(?:一)?家|哪个|哪款).{0,12}(?:品牌|产品|公司|企业|平台|机构|服务商|供应商|厂商|厂家|工具|方案)/,
    /优先(?:考察|考虑|评估|选择).{0,20}(?:哪些|哪(?:一)?家|哪个|哪款).{0,12}(?:品牌|产品|公司|企业|平台|机构|服务商|供应商|厂家|厂商|工具|方案)/,
    /(?:品牌|产品|公司|企业|平台|机构|服务商|供应商|厂家|工具|方案).{0,10}(?:有推荐|有哪些推荐|推荐哪些|推荐哪)/,
    /哪(?:一)?(?:家|个|款|种).{0,12}(?:好|比较好|更好|好用|靠谱|专业|值得选)/,
    /(?:做|采购|选择).{0,12}(?:找谁|选哪(?:一)?家|(?:考虑|评估|考察)谁)/,
  ];
  return openRecommendationPatterns.some((pattern) => pattern.test(normalized));
}

export function inferCustomQuestionCategory(
  question: string,
): Exclude<z.infer<typeof GeoQuestionCategorySchema>, "industry_ranking"> {
  const normalized = question
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/\s+/g, "");
  if (
    /(?:对比|相比|比较|区别|差异|优于|vs|和.+哪个好|与.+哪个好)/.test(
      normalized,
    )
  ) {
    return "competitor_comparison";
  }
  if (
    /(?:好不好|怎么样|靠谱吗|可信|口碑|评价|声誉|质量|安全吗|值得信赖)/.test(
      normalized,
    )
  ) {
    return "reputation";
  }
  return "product_scenario";
}

export const InviteRequestSchema = z
  .object({ code: z.string().min(1).max(128) })
  .strict();

export const UploadInitRequestSchema = z
  .object({
    filename: z.string().min(1).max(180),
    contentType: z.string().max(160).optional(),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(50 * 1024 * 1024),
  })
  .strict();

export const ProjectAttachmentSchema = z
  .object({
    fileId: z.string().min(1).max(240),
    filename: z.string().min(1).max(180),
    uploadToken: z.string().min(16).max(4096),
  })
  .strict();

export const CreateProjectRequestSchema = z
  .object({
    input: z.string().trim().max(4000).default(""),
    clientRequestId: z.string().uuid().optional(),
    companyName: z.string().trim().min(1).max(200).optional(),
    companyWebsite: z.string().trim().max(2000).optional(),
    operatorNotes: z.string().trim().max(3000).optional(),
    attachments: z.array(ProjectAttachmentSchema).max(10).default([]),
  })
  .strict()
  .refine((value) => Boolean(value.input || value.attachments.length), {
    message: "input or at least one attachment is required",
  })
  .superRefine((value, context) => {
    const candidates = [
      value.companyWebsite,
      ...(value.input.match(/https?:\/\/[^\s<>"']+/gi) || []),
    ].filter((item): item is string => Boolean(item));
    for (const candidate of candidates) {
      if (!isPublicHttpUrl(candidate)) {
        context.addIssue({
          code: "custom",
          message: "website URLs must use public HTTP(S) addresses",
          path: ["companyWebsite"],
        });
        break;
      }
    }
  });

export type CreateProjectRequest = z.infer<typeof CreateProjectRequestSchema>;

export const GeoMonitorPlatformSchema = z.enum(GEO_MONITOR_PLATFORM_IDS);

export const GeoPaymentMethodSchema = z.enum(["alipay", "wxpay"]);

const GeoPaymentScopeSchema = z
  .object({
    questionId: z.string().trim().min(4).max(80),
    platformIds: z
      .array(GeoMonitorPlatformSchema)
      .min(1)
      .max(GEO_MONITOR_PLATFORM_IDS.length),
  })
  .superRefine(({ platformIds }, context) => {
    if (new Set(platformIds).size !== platformIds.length) {
      context.addIssue({
        code: "custom",
        path: ["platformIds"],
        message: "platformIds must be unique",
      });
    }
  });

export const CreatePaymentRequestSchema = GeoPaymentScopeSchema.safeExtend({
  method: GeoPaymentMethodSchema,
}).strict();

export const PaymentStatusRequestSchema = GeoPaymentScopeSchema.safeExtend({
  authorization: z.string().trim().min(16).max(4096),
}).strict();

export const SwitchPaymentRequestSchema = GeoPaymentScopeSchema.safeExtend({
  authorization: z.string().trim().min(16).max(4096),
  method: GeoPaymentMethodSchema,
}).strict();

export const CreateServicePaymentRequestSchema = z
  .object({
    method: GeoPaymentMethodSchema,
  })
  .strict();

export const GeoServiceContractProfileSchema = z
  .object({
    legalName: z.string().trim().min(2).max(200),
    creditCode: z
      .string()
      .trim()
      .transform((value) => value.toUpperCase())
      .pipe(z.string().regex(/^[0-9A-HJ-NPQRTUWXY]{18}$/)),
    address: z.string().trim().min(5).max(500),
    signatoryName: z.string().trim().min(2).max(128),
    signatoryTitle: z.string().trim().min(2).max(128),
    mobile: z
      .string()
      .trim()
      .regex(/^1\d{10}$/),
    email: z.string().trim().email().max(320),
    authorized: z.literal(true),
  })
  .strict();

export type GeoServiceContractProfile = z.infer<
  typeof GeoServiceContractProfileSchema
>;

export const CreateServiceContractRequestSchema = z
  .object({
    profile: GeoServiceContractProfileSchema,
    contractCode: z.string().trim().min(1).max(128),
  })
  .strict();

export const ServiceStatusRequestSchema = z.object({}).strict();

export const ServicePaymentAuthorizationSchema = z
  .object({
    authorization: z.string().trim().min(16).max(4096),
    schemaVersion: z.literal(2).optional(),
    purchaseIntent: z.string().trim().min(16).max(4096).optional(),
  })
  .strict();

export const CreateServiceAccountRequestV1Schema = z
  .object({
    displayName: z.string().trim().min(2).max(128),
    username: z
      .string()
      .trim()
      .min(3)
      .max(64)
      .regex(/^[a-zA-Z0-9._-]+$/),
    password: z.string().min(8).max(128),
  })
  .strict();

export const CreateServiceAccountRequestV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    account: z.discriminatedUnion("mode", [
      z
        .object({
          mode: z.literal("create"),
          displayName: z.string().trim().min(2).max(128),
          username: z
            .string()
            .trim()
            .min(3)
            .max(64)
            .regex(/^[a-zA-Z0-9._-]+$/),
        })
        .strict(),
      z
        .object({
          mode: z.literal("bind_existing"),
          purchaseIntent: z.string().trim().min(16).max(4096),
        })
        .strict(),
    ]),
  })
  .strict();

export const CreateServiceAccountRequestSchema = z.union([
  CreateServiceAccountRequestV2Schema,
  CreateServiceAccountRequestV1Schema,
]);

export const StartMonitoringRequestSchema = z
  .object({
    questionId: z.string().trim().min(4).max(80),
    platformIds: z
      .array(GeoMonitorPlatformSchema)
      .min(1)
      .max(GEO_MONITOR_PLATFORM_IDS.length),
    paymentAuthorization: z.string().trim().min(16).max(4096),
  })
  .strict()
  .superRefine(({ platformIds }, context) => {
    if (new Set(platformIds).size !== platformIds.length) {
      context.addIssue({
        code: "custom",
        path: ["platformIds"],
        message: "platformIds must be unique",
      });
    }
  });

export type StartMonitoringRequest = z.infer<
  typeof StartMonitoringRequestSchema
>;

function isPublicHttpUrl(value: string) {
  try {
    const url = new URL(value.replace(/[),.;，。；]+$/, ""));
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      !hostname ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "metadata" ||
      hostname === "metadata.google.internal"
    ) {
      return false;
    }
    if (hostname === "::1" || hostname === "0:0:0:0:0:0:0:1") return false;
    if (/^(?:fc|fd|fe[89ab])/i.test(hostname.replace(/:/g, ""))) return false;
    const octets = hostname.split(".").map(Number);
    if (
      octets.length === 4 &&
      octets.every(
        (octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255,
      )
    ) {
      const [a, b] = octets;
      return !(
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        a >= 224
      );
    }
    return true;
  } catch {
    return false;
  }
}
