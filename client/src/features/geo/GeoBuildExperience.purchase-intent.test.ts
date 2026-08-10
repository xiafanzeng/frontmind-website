import { describe, expect, it } from "vitest";

import {
  buildServiceContractHref,
  clearGeoPurchaseIntentFromUrl,
  geoActivationRetryDecision,
  geoPaymentRecoveryStatusForError,
  geoPaidStartNotice,
  isGeoMonitoringStartPendingError,
  isGeoProjectPaymentProtected,
  isGeoQuestionSelectionLocked,
  normalizeStoredPendingGeoPayment,
  readGeoPurchaseIntentFromUrl,
  switchedGeoCheckoutKeepsOrderFacts,
} from "./GeoBuildExperience";
import { GeoApiError } from "./api";

describe("GEO repeat-purchase intent URL contract", () => {
  it("reads the canonical query parameter before the builder anchor", () => {
    expect(
      readGeoPurchaseIntentFromUrl(
        "https://www.frontmind.net/?purchaseIntent=one-time-purchase-token-123#geo-builder",
      ),
    ).toBe("one-time-purchase-token-123");
  });

  it("keeps compatibility with the legacy snake-case hash query", () => {
    expect(
      readGeoPurchaseIntentFromUrl(
        "https://www.frontmind.net/#geo-builder?purchase_intent=legacy-purchase-token-123",
      ),
    ).toBe("legacy-purchase-token-123");
  });

  it("removes either token form without removing the builder anchor", () => {
    const canonical = clearGeoPurchaseIntentFromUrl(
      "https://www.frontmind.net/?purchaseIntent=one-time-purchase-token-123#geo-builder",
    );
    expect(canonical.searchParams.has("purchaseIntent")).toBe(false);
    expect(canonical.hash).toBe("#geo-builder");

    const legacy = clearGeoPurchaseIntentFromUrl(
      "https://www.frontmind.net/#geo-builder?purchase_intent=legacy-purchase-token-123",
    );
    expect(legacy.hash).toBe("#geo-builder");
  });
});

describe("GEO service contract URL contract", () => {
  it("carries the resolved edition while keeping the Chinese contract route", () => {
    const href = buildServiceContractHref({
      category: "product_scenario",
      question: "FrontMind 适合哪些企业？",
      client: "示例企业",
      edition: "overseas",
    });
    const url = new URL(href, "https://www.frontmind.net");

    expect(url.pathname).toBe(
      "/contracts/frontmind-geo-monthly-optimization-service-agreement.html",
    );
    expect(url.searchParams.get("edition")).toBe("overseas");
    expect(url.searchParams.get("question")).toBe("FrontMind 适合哪些企业？");
  });

  it("defaults historical projects to the domestic contract", () => {
    const url = new URL(
      buildServiceContractHref({ category: "reputation" }),
      "https://www.frontmind.net",
    );
    expect(url.searchParams.get("edition")).toBe("domestic");
  });
});

describe("GEO pending-payment persistence contract", () => {
  const pending = {
    kind: "monitoring",
    projectId: "project-1",
    projectToken: "signed-project-token-123456789",
    questionId: "question-1",
    platformIds: ["deepseek"],
    status: "pending",
    checkout: {
      authorization: "signed-authorization",
      orderId: "order-1",
      amountFen: 200,
      unitPriceFen: 200,
      answersPerPlatform: 5,
      expiresAt: "2026-07-28T12:30:00.000Z",
      action: "https://zpayz.cn/submit.php",
      method: "POST",
      fields: {
        type: "alipay",
        out_trade_no: "order-1",
        money: "2.00",
        sign: "signed",
      },
    },
  };

  it("restores a bounded unexpired checkout", () => {
    expect(
      normalizeStoredPendingGeoPayment(
        pending,
        Date.parse("2026-07-28T12:00:00.000Z"),
      ),
    ).toMatchObject({
      kind: "monitoring",
      projectId: "project-1",
      projectToken: "signed-project-token-123456789",
      monitoringEdition: "domestic",
      platformIds: ["deepseek"],
    });
  });

  it("restores an overseas ChatGPT checkout and rejects cross-edition scope", () => {
    expect(
      normalizeStoredPendingGeoPayment({
        ...pending,
        monitoringEdition: "overseas",
        platformIds: ["chatgpt"],
        checkout: {
          ...pending.checkout,
          amountFen: 500,
          unitPriceFen: 500,
          fields: {
            ...pending.checkout.fields,
            money: "5.00",
          },
        },
      }),
    ).toMatchObject({
      kind: "monitoring",
      monitoringEdition: "overseas",
      platformIds: ["chatgpt"],
      checkout: { amountFen: 500, unitPriceFen: 500 },
    });
    expect(
      normalizeStoredPendingGeoPayment({
        ...pending,
        monitoringEdition: "overseas",
        platformIds: ["deepseek"],
      }),
    ).toBeUndefined();
    expect(
      normalizeStoredPendingGeoPayment({
        ...pending,
        monitoringEdition: "domestic",
        platformIds: ["chatgpt"],
      }),
    ).toBeUndefined();
  });

  it("keeps the project token required to reconcile an order after local-record loss", () => {
    expect(
      normalizeStoredPendingGeoPayment(
        pending,
        Date.parse("2026-07-28T12:00:00.000Z"),
      ),
    ).toMatchObject({
      projectId: "project-1",
      projectToken: "signed-project-token-123456789",
      checkout: { authorization: "signed-authorization" },
    });
  });

  it("retains expired checkout authorization for final reconciliation but drops scope mismatches", () => {
    const expired = normalizeStoredPendingGeoPayment(
      pending,
      Date.parse("2026-07-28T13:00:00.000Z"),
    );
    expect(expired).toMatchObject({
      kind: "monitoring",
      status: "pending",
      checkout: {
        authorization: "signed-authorization",
        orderId: "order-1",
      },
      statusMessage:
        "收银台展示时间已结束，正在核对最终支付结果；请勿重复支付或创建新订单。",
    });
    expect(
      normalizeStoredPendingGeoPayment({
        ...pending,
        checkout: {
          ...pending.checkout,
          fields: {
            ...pending.checkout.fields,
            out_trade_no: "another-order",
          },
        },
      }),
    ).toBeUndefined();
  });

  it("restores a terminal reconciliation state without reopening checkout", () => {
    expect(
      normalizeStoredPendingGeoPayment(
        {
          ...pending,
          status: "reconciliation_required",
          statusMessage: "请人工核对",
        },
        Date.parse("2026-07-28T13:00:00.000Z"),
      ),
    ).toMatchObject({
      status: "reconciliation_required",
      statusMessage: "请人工核对",
      checkout: { orderId: "order-1" },
    });
  });

  it("restores a service order in bank-transfer mode without reviving online reconciliation copy", () => {
    const servicePending = {
      kind: "service",
      projectId: "project-1",
      projectToken: "signed-project-token-123456789",
      questionId: "question-1",
      monitoringEdition: "overseas",
      category: "reputation",
      selectedChannel: "bank_transfer",
      status: "pending",
      statusMessage: "已选择对公账户支付，等待管理员确认到账。",
      checkout: {
        authorization: "signed-service-authorization",
        orderId: "service-order-1",
        amountFen: 400_000,
        category: "reputation",
        billingMonths: 1,
        expiresAt: "2026-07-28T12:30:00.000Z",
        action: "https://zpayz.cn/submit.php",
        method: "POST",
        fields: {
          type: "wxpay",
          out_trade_no: "service-order-1",
          money: "4000.00",
          sign: "signed",
        },
      },
    };

    expect(
      normalizeStoredPendingGeoPayment(
        servicePending,
        Date.parse("2026-07-28T13:00:00.000Z"),
      ),
    ).toMatchObject({
      kind: "service",
      monitoringEdition: "overseas",
      selectedChannel: "bank_transfer",
      status: "pending",
      statusMessage: "已选择对公账户支付，等待管理员确认到账。",
      checkout: {
        authorization: "signed-service-authorization",
        orderId: "service-order-1",
        amountFen: 400_000,
        fields: { type: "wxpay" },
      },
    });
  });

  it("persists a bounded paid-activation retry count", () => {
    expect(
      normalizeStoredPendingGeoPayment({
        ...pending,
        status: "paid",
        activationAttempts: 2,
      }),
    ).toMatchObject({ status: "paid", activationAttempts: 2 });
    expect(
      normalizeStoredPendingGeoPayment({
        ...pending,
        status: "paid",
        activationAttempts: 99,
      }),
    ).toMatchObject({ activationAttempts: 3 });
  });

  it("recovers historical overseas translation-pending and session-limit failures on refresh", () => {
    for (const [status, statusMessage] of [
      ["paid", "付款已确认，但监控任务暂未启动：英文监控问题正在准备。"],
      [
        "activation_support_required",
        "付款已确认，但监控任务未能自动启动：英文监控问题正在准备；请联系技术支持。",
      ],
      [
        "activation_support_required",
        "付款已确认，但连续 3 次无法启动：当前邀请会话请求过于频繁，请稍后再试。",
      ],
      [
        "activation_support_required",
        "付款已确认，但监控任务未能自动启动：提交内容有误，请检查后重试。。请联系技术支持并提供订单号。",
      ],
    ] as const) {
      expect(
        normalizeStoredPendingGeoPayment({
          ...pending,
          monitoringEdition: "overseas",
          platformIds: ["chatgpt"],
          status,
          statusMessage,
          activationAttempts: 3,
          checkout: {
            ...pending.checkout,
            amountFen: 500,
            unitPriceFen: 500,
            fields: { ...pending.checkout.fields, money: "5.00" },
          },
        }),
      ).toMatchObject({
        kind: "monitoring",
        status: "paid",
        activationAttempts: 0,
        statusMessage: "付款已确认，正在启动监控",
      });
    }

    expect(
      normalizeStoredPendingGeoPayment({
        ...pending,
        monitoringEdition: "overseas",
        platformIds: ["chatgpt"],
        status: "activation_support_required",
        statusMessage:
          "付款已确认，但监控任务未能自动启动：英文监控问题翻译失败；请联系技术支持。",
        activationAttempts: 3,
        checkout: {
          ...pending.checkout,
          amountFen: 500,
          unitPriceFen: 500,
          fields: { ...pending.checkout.fields, money: "5.00" },
        },
      }),
    ).toMatchObject({
      status: "activation_support_required",
      activationAttempts: 3,
      statusMessage:
        "付款已确认，但监控任务未能自动启动：英文监控问题翻译失败；请联系技术支持。",
    });

    expect(
      normalizeStoredPendingGeoPayment({
        ...pending,
        status: "activation_support_required",
        statusMessage:
          "付款已确认，但监控任务未能自动启动：提交内容有误，请检查后重试。。请联系技术支持并提供订单号。",
        activationAttempts: 3,
      }),
    ).toMatchObject({
      monitoringEdition: "domestic",
      status: "activation_support_required",
      activationAttempts: 3,
    });

    expect(
      normalizeStoredPendingGeoPayment({
        ...pending,
        monitoringEdition: "overseas",
        platformIds: ["chatgpt"],
        status: "activation_support_required",
        statusMessage:
          "付款已确认，但监控任务未能自动启动：支付订单金额或状态与本次监控不匹配。请联系技术支持。",
        activationAttempts: 3,
        checkout: {
          ...pending.checkout,
          amountFen: 500,
          unitPriceFen: 500,
          fields: { ...pending.checkout.fields, money: "5.00" },
        },
      }),
    ).toMatchObject({
      monitoringEdition: "overseas",
      status: "activation_support_required",
      activationAttempts: 3,
    });
  });
});

describe("GEO checkout switching invariants", () => {
  const serviceCheckout = {
    authorization: "signed-service-authorization",
    orderId: "20260806123456789012345678901234",
    amountFen: 150_000,
    category: "product_scenario" as const,
    billingMonths: 1 as const,
    expiresAt: "2026-08-06T12:00:00.000Z",
    action: "https://zpayz.cn/submit.php" as const,
    method: "POST" as const,
    fields: { type: "alipay" },
  };

  it("accepts only a newly signed cashier for the exact same service order", () => {
    expect(
      switchedGeoCheckoutKeepsOrderFacts(serviceCheckout, {
        ...serviceCheckout,
        fields: { type: "wxpay", sign: "new-signature" },
      }),
    ).toBe(true);
    for (const changed of [
      { authorization: "different-authorization" },
      { orderId: "20260806123456789012345678909999" },
      { amountFen: 300_000 },
      { expiresAt: "2026-08-06T13:00:00.000Z" },
      { category: "reputation" as const },
    ]) {
      expect(
        switchedGeoCheckoutKeepsOrderFacts(serviceCheckout, {
          ...serviceCheckout,
          ...changed,
          fields: { type: "wxpay", sign: "new-signature" },
        }),
      ).toBe(false);
    }
  });
});

describe("GEO payment-query recovery state", () => {
  it("retries transient monitor preparation within the bounded activation budget", () => {
    for (const code of [
      "QUESTION_TRANSLATION_PENDING",
      "SESSION_RATE_LIMITED",
      "REQUEST_TIMEOUT",
    ]) {
      expect(
        isGeoMonitoringStartPendingError(
          new GeoApiError("internal preparation detail", 503, code),
        ),
      ).toBe(true);
    }
    expect(
      isGeoMonitoringStartPendingError(
        new GeoApiError(
          "submission state cannot be confirmed",
          503,
          "MONITOR_SUBMISSION_UNCONFIRMED",
        ),
      ),
    ).toBe(false);
    expect(
      geoPaymentRecoveryStatusForError(
        new GeoApiError(
          "submission state cannot be confirmed",
          503,
          "MONITOR_SUBMISSION_UNCONFIRMED",
        ),
        true,
      ),
    ).toBe("activation_support_required");
    expect(
      isGeoMonitoringStartPendingError(
        new GeoApiError(
          "explicit rejection",
          502,
          "MONITOR_SUBMISSION_REJECTED",
        ),
      ),
    ).toBe(false);
    expect(
      isGeoMonitoringStartPendingError(
        new GeoApiError(
          "terminal translation failure",
          502,
          "QUESTION_TRANSLATION_FAILED",
        ),
      ),
    ).toBe(false);
    expect(
      geoPaymentRecoveryStatusForError(
        new GeoApiError(
          "terminal translation failure",
          502,
          "QUESTION_TRANSLATION_FAILED",
        ),
        true,
      ),
    ).toBe("activation_support_required");
  });

  it("moves terminal verification failures out of the misleading pending state", () => {
    expect(
      geoPaymentRecoveryStatusForError(
        new GeoApiError(
          "支付平台返回的订单范围不匹配",
          402,
          "PAYMENT_SCOPE_MISMATCH",
        ),
      ),
    ).toBe("reconciliation_required");
    expect(
      geoPaymentRecoveryStatusForError(
        new GeoApiError("查询被拒绝", 502, "PAYMENT_QUERY_REJECTED"),
      ),
    ).toBe("reconciliation_required");
  });

  it("keeps transient failures retryable and separates paid activation failures", () => {
    expect(
      geoPaymentRecoveryStatusForError(
        new GeoApiError("网关超时", 502, "PAYMENT_QUERY_FAILED"),
      ),
    ).toBeUndefined();
    expect(
      geoPaymentRecoveryStatusForError(
        new GeoApiError("自动窗口结束", 410, "PAYMENT_RECONCILIATION_EXPIRED"),
        true,
      ),
    ).toBe("activation_support_required");
  });

  it("bounds transient activation retries and stops immediately for explicit provider rejection", () => {
    const transient = new GeoApiError(
      "上游暂时不可达",
      502,
      "AGENT_UNAVAILABLE",
    );
    expect(geoActivationRetryDecision(transient, 0)).toEqual({
      attempts: 1,
      terminal: false,
      retryDelayMs: 5_000,
    });
    expect(geoActivationRetryDecision(transient, 2)).toEqual({
      attempts: 3,
      terminal: true,
      retryDelayMs: undefined,
    });
    expect(
      geoActivationRetryDecision(
        new GeoApiError("监控凭据无效", 502, "MONITOR_SUBMISSION_REJECTED"),
        0,
      ),
    ).toEqual({ attempts: 1, terminal: true, retryDelayMs: undefined });
  });
});

describe("GEO irreversible-scope guards", () => {
  it("recognizes the project currently bound to a local checkout", () => {
    expect(isGeoProjectPaymentProtected("project-1", "project-1")).toBe(true);
    expect(isGeoProjectPaymentProtected("project-1", "project-2")).toBe(false);
  });

  it("locks question selection after monitoring starts or while checkout is unresolved", () => {
    const project = {
      id: "project-1",
      monitoring: { runId: "monitor-run-1" },
    };
    expect(isGeoQuestionSelectionLocked(project as never)).toBe(true);
    expect(
      isGeoQuestionSelectionLocked(
        { id: "project-1", monitoring: undefined } as never,
        "project-1",
      ),
    ).toBe(true);
    expect(
      isGeoQuestionSelectionLocked(
        { ...project, preview: true } as never,
        "project-1",
      ),
    ).toBe(false);
  });
});

describe("GEO paid-order result copy", () => {
  it("describes the returned monitoring state instead of always claiming startup", () => {
    expect(
      geoPaidStartNotice(
        { monitoring: { status: "failed" } } as never,
        "monitoring",
      ),
    ).toContain("未能完成");
    expect(
      geoPaidStartNotice(
        { monitoring: { status: "completed" } } as never,
        "monitoring",
      ),
    ).toContain("已完成");
  });

  it("distinguishes a retryable knowledge import from manual intervention", () => {
    expect(
      geoPaidStartNotice(
        {
          serviceActivation: {
            status: "failed",
            provisioningStatus: "provisioned",
            knowledgeImport: { status: "failed", retryable: true },
          },
        } as never,
        "service",
      ),
    ).toContain("重试同步");
    expect(
      geoPaidStartNotice(
        {
          serviceActivation: {
            status: "failed",
            provisioningStatus: "failed",
            knowledgeImport: { status: "failed", retryable: true },
          },
        } as never,
        "service",
      ),
    ).toContain("人工处理");
  });
});
