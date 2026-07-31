import { describe, expect, it } from "vitest";
import {
  CreateCustomQuestionRequestSchema,
  CreatePaymentRequestSchema,
  CreateProjectRequestSchema,
  CreateServiceContractRequestSchema,
  CreateServicePaymentRequestSchema,
  GeoQuestionSetSchema,
  inferCustomQuestionCategory,
  isIndustryRankingQuestion,
  RetryProjectRequestSchema,
  ServicePaymentAuthorizationSchema,
  ServiceStatusRequestSchema,
  StartMonitoringRequestSchema,
} from "./schemas";
import { buildValidQuestionSet } from "./question-set.test-fixture";

function validQuestions() {
  return buildValidQuestionSet("FrontMind").questions;
}

describe("GeoQuestionSetSchema", () => {
  it("accepts exactly five grounded questions in each category", () => {
    const result = GeoQuestionSetSchema.parse({ questions: validQuestions() });
    expect(result.questions).toHaveLength(20);
  });

  it("rejects selectable industry-ranking questions", () => {
    const questions = validQuestions();
    questions[10] = { ...questions[10], selectable: true };
    expect(() => GeoQuestionSetSchema.parse({ questions })).toThrow(
      /selectable/,
    );
  });

  it("rejects duplicated questions and unstable ids", () => {
    const questions = validQuestions();
    questions[1] = {
      ...questions[1],
      id: "reputation-05",
      question: questions[0].question,
    };
    expect(() => GeoQuestionSetSchema.parse({ questions })).toThrow();
  });

  it("rejects fact retrieval disguised as reputation questions", () => {
    const backgroundLookup = validQuestions();
    backgroundLookup[0] = {
      ...backgroundLookup[0],
      question: "FrontMind 的企业背景是什么？",
    };
    expect(() =>
      GeoQuestionSetSchema.parse({ questions: backgroundLookup }),
    ).toThrow(/direct reputation judgment/);

    const certificationLookup = validQuestions();
    certificationLookup[1] = {
      ...certificationLookup[1],
      question: "FrontMind 获得了哪些信息安全认证？",
    };
    expect(() =>
      GeoQuestionSetSchema.parse({ questions: certificationLookup }),
    ).toThrow(/direct reputation judgment/);
  });

  it("requires the current brand in every reputation question", () => {
    const questions = validQuestions();
    questions[0] = {
      ...questions[0],
      question: "这家公司靠谱吗？",
    };
    expect(() => GeoQuestionSetSchema.parse({ questions })).toThrow(
      /enterpriseAnchor/,
    );
  });

  it("rejects internal enum leaks, numbered placeholders, repeated templates, and repeated rationales", () => {
    const internalEnum = validQuestions();
    internalEnum[0] = {
      ...internalEnum[0],
      question: "FrontMind 在 reputation 方面的公开口碑怎么样？",
    };
    expect(() =>
      GeoQuestionSetSchema.parse({ questions: internalEnum }),
    ).toThrow(/internal category token|placeholder/);

    const numberedPlaceholder = validQuestions();
    numberedPlaceholder[0] = {
      ...numberedPlaceholder[0],
      question: "FrontMind 的第 1 个问题值得优化吗？",
    };
    expect(() =>
      GeoQuestionSetSchema.parse({ questions: numberedPlaceholder }),
    ).toThrow(/placeholder/);

    const repeatedTemplate = validQuestions();
    repeatedTemplate[6] = {
      ...repeatedTemplate[6],
      question: "FrontMind 的服务模块 2 适合哪些客户与应用场景？",
    };
    repeatedTemplate[7] = {
      ...repeatedTemplate[7],
      question: "FrontMind 的服务模块 3 适合哪些客户与应用场景？",
    };
    expect(() =>
      GeoQuestionSetSchema.parse({ questions: repeatedTemplate }),
    ).toThrow(/repeats the template/);

    const repeatedRationale = validQuestions();
    repeatedRationale[1] = {
      ...repeatedRationale[1],
      rationale: repeatedRationale[0].rationale,
    };
    expect(() =>
      GeoQuestionSetSchema.parse({ questions: repeatedRationale }),
    ).toThrow(/rationale duplicates/);
  });

  it("rejects generic product questions without their declared enterprise and offering anchors", () => {
    const questions = validQuestions();
    questions[5] = {
      ...questions[5],
      question: "企业如何系统搭建可被 AI 理解的知识库？",
    };
    expect(() => GeoQuestionSetSchema.parse({ questions })).toThrow(
      /enterpriseAnchor|offeringAnchor/,
    );
  });

  it("requires explicit enterprise, offering, and intent metadata on every product Q&A", () => {
    const questions = validQuestions();
    questions[5] = {
      ...questions[5],
      enterpriseAnchor: undefined,
      offeringAnchor: undefined,
      qaIntent: undefined,
    };
    expect(() => GeoQuestionSetSchema.parse({ questions })).toThrow(
      /enterprise|offering|qaIntent/,
    );
  });

  it("requires five distinct product Q&A intents", () => {
    const questions = validQuestions();
    questions[6] = {
      ...questions[6],
      qaIntent: questions[5].qaIntent,
    };
    expect(() => GeoQuestionSetSchema.parse({ questions })).toThrow(/qaIntent/);
  });

  it("requires product, capability, scenario, or service evidence for product Q&A", () => {
    const questions = validQuestions();
    questions[5] = {
      ...questions[5],
      evidenceRefs: ["00_source_index.md"],
    };
    expect(() => GeoQuestionSetSchema.parse({ questions })).toThrow(
      /product, capability, scenario, or service evidence/,
    );
  });
});

describe("custom GEO question policy", () => {
  it("normalizes customer input into a monitor-ready Chinese question", () => {
    expect(
      CreateCustomQuestionRequestSchema.parse({
        question: "  FrontMind 适合科研企业使用吗?  ",
      }),
    ).toEqual({ question: "FrontMind 适合科研企业使用吗？" });
    expect(() =>
      CreateCustomQuestionRequestSchema.parse({ question: "好" }),
    ).toThrow();
  });

  it.each([
    "科研仪器行业排名前十的品牌有哪些？",
    "GEO 服务商哪家最好？",
    "推荐品牌有哪些？",
    "有哪些企业知识库产品值得推荐？",
    "GEO 服务商有推荐的吗？",
    "做 GEO 应该找谁？",
    "行业里哪些 GEO 品牌更好？",
    "主流 GEO 服务商有哪些？",
    "国内企业 GEO 服务商有哪些？",
    "企业 AI 品牌建设服务商怎么选？",
    "科研仪器行业排\u200b名有哪些？",
    "2026 年行业 TOP 10 是谁？",
  ])(
    "rejects industry ranking and open recommendation intent: %s",
    (question) => {
      expect(isIndustryRankingQuestion(question)).toBe(true);
    },
  );

  it.each([
    "FrontMind 好不好？",
    "FrontMind 和竞争产品相比有哪些优势？",
    "FrontMind 与 Acme 哪个更适合科研企业？",
    "FrontMind 在高校科研场景中能解决什么问题？",
  ])("keeps non-ranking questions selectable: %s", (question) => {
    expect(isIndustryRankingQuestion(question)).toBe(false);
  });

  it("infers only selectable categories without trusting a client category", () => {
    expect(inferCustomQuestionCategory("FrontMind 靠谱吗？")).toBe(
      "reputation",
    );
    expect(inferCustomQuestionCategory("FrontMind 和 Acme 有什么区别？")).toBe(
      "competitor_comparison",
    );
    expect(inferCustomQuestionCategory("FrontMind 能用于哪些科研场景？")).toBe(
      "product_scenario",
    );
  });
});

describe("StartMonitoringRequestSchema", () => {
  it("accepts only a unique non-empty subset of the six fixed platforms", () => {
    expect(
      StartMonitoringRequestSchema.parse({
        questionId: "product-scenario-01",
        platformIds: [
          "doubao",
          "yuanbao",
          "deepseek",
          "baiduai",
          "qianwen",
          "kimi",
        ],
        paymentAuthorization: "signed-zpay-authorization",
      }).platformIds,
    ).toHaveLength(6);
    expect(() =>
      StartMonitoringRequestSchema.parse({
        questionId: "product-scenario-01",
        platformIds: ["doubao", "doubao"],
        paymentAuthorization: "signed-zpay-authorization",
      }),
    ).toThrow(/unique/);
    expect(() =>
      StartMonitoringRequestSchema.parse({
        questionId: "product-scenario-01",
        platformIds: ["chatgpt"],
        paymentAuthorization: "signed-zpay-authorization",
      }),
    ).toThrow();
  });
});

describe("CreatePaymentRequestSchema", () => {
  it("accepts only支付宝或微信 and a unique priced platform scope", () => {
    expect(
      CreatePaymentRequestSchema.parse({
        questionId: "product-scenario-01",
        platformIds: ["doubao", "kimi"],
        method: "alipay",
      }),
    ).toMatchObject({ method: "alipay" });
    expect(() =>
      CreatePaymentRequestSchema.parse({
        questionId: "product-scenario-01",
        platformIds: ["doubao", "doubao"],
        method: "wxpay",
      }),
    ).toThrow(/unique/);
    expect(() =>
      CreatePaymentRequestSchema.parse({
        questionId: "product-scenario-01",
        platformIds: ["doubao"],
        method: "qqpay",
      }),
    ).toThrow();
  });
});

describe("service payment schemas", () => {
  it("normalizes a strict, authorized enterprise contract profile", () => {
    const parsed = CreateServiceContractRequestSchema.parse({
      profile: {
        legalName: " 深圳星辰科技有限公司 ",
        creditCode: "91440300ma5f12345x",
        address: "深圳市南山区科技园一号",
        signatoryName: "张三",
        signatoryTitle: "运营负责人",
        mobile: "13800138000",
        email: "contracts@example.com",
        authorized: true,
      },
    });

    expect(parsed.profile).toMatchObject({
      legalName: "深圳星辰科技有限公司",
      creditCode: "91440300MA5F12345X",
      authorized: true,
    });
    expect(() =>
      CreateServiceContractRequestSchema.parse({
        profile: { ...parsed.profile, authorized: false },
      }),
    ).toThrow();
    expect(() =>
      CreateServiceContractRequestSchema.parse({
        profile: { ...parsed.profile, mobile: "12345" },
      }),
    ).toThrow();
    expect(() =>
      CreateServiceContractRequestSchema.parse({
        profile: { ...parsed.profile, status: "payment_required" },
      }),
    ).toThrow();
  });

  it("accepts only a payment method when creating a service order", () => {
    expect(
      CreateServicePaymentRequestSchema.parse({ method: "alipay" }),
    ).toEqual({ method: "alipay" });
    expect(
      CreateServicePaymentRequestSchema.parse({ method: "wxpay" }),
    ).toEqual({ method: "wxpay" });
    expect(() =>
      CreateServicePaymentRequestSchema.parse({ method: "qqpay" }),
    ).toThrow();
    expect(() =>
      CreateServicePaymentRequestSchema.parse({
        method: "alipay",
        amountFen: 1,
        category: "product_scenario",
      }),
    ).toThrow();
  });

  it("accepts only an opaque service payment authorization", () => {
    expect(
      ServicePaymentAuthorizationSchema.parse({
        authorization: "signed-service-payment-authorization",
        purchaseIntent: "one-time-purchase-intent-001",
      }),
    ).toEqual({
      authorization: "signed-service-payment-authorization",
      purchaseIntent: "one-time-purchase-intent-001",
    });
    expect(() =>
      ServicePaymentAuthorizationSchema.parse({ authorization: "short" }),
    ).toThrow();
    expect(() =>
      ServicePaymentAuthorizationSchema.parse({
        authorization: "signed-service-payment-authorization",
        category: "product_scenario",
      }),
    ).toThrow();
  });

  it("never accepts browser-supplied contract or activation status", () => {
    expect(ServiceStatusRequestSchema.parse({})).toEqual({});
    expect(() =>
      ServiceStatusRequestSchema.parse({ status: "payment_required" }),
    ).toThrow();
    expect(() =>
      ServiceStatusRequestSchema.parse({ paidAt: new Date().toISOString() }),
    ).toThrow();
  });
});

describe("CreateProjectRequestSchema", () => {
  it("accepts public company URLs", () => {
    expect(
      CreateProjectRequestSchema.parse({
        input: "Acme https://www.example.com/about",
        attachments: [],
      }).input,
    ).toContain("example.com");
  });

  it.each([
    "http://127.0.0.1/admin",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.8/",
    "http://[::1]/",
    "http://metadata.google.internal/",
  ])("rejects non-public crawl targets: %s", (target) => {
    expect(() =>
      CreateProjectRequestSchema.parse({ input: target, attachments: [] }),
    ).toThrow(/public HTTP/);
  });
});

describe("RetryProjectRequestSchema", () => {
  it("accepts a local project input without attachments", () => {
    expect(
      RetryProjectRequestSchema.parse({ input: "Acme", attachments: [] }),
    ).toEqual({ input: "Acme", attachments: [], trigger: "manual" });
  });

  it("accepts the explicit automatic recovery trigger", () => {
    expect(
      RetryProjectRequestSchema.parse({
        input: "Acme",
        attachments: [],
        trigger: "automatic",
      }).trigger,
    ).toBe("automatic");
  });

  it("reuses public URL validation for retry input", () => {
    expect(() =>
      RetryProjectRequestSchema.parse({
        input: "Acme http://127.0.0.1/admin",
        attachments: [],
      }),
    ).toThrow(/public HTTP/);
  });
});
