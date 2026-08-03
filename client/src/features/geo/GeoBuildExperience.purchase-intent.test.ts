import { describe, expect, it } from "vitest";

import {
  clearGeoPurchaseIntentFromUrl,
  geoPaymentRecoveryStatusForError,
  geoPaidStartNotice,
  isGeoDeleteProtectionError,
  isGeoProjectFulfillmentProtected,
  isGeoProjectPaymentProtected,
  isGeoQuestionSelectionLocked,
  normalizeStoredPendingGeoPayment,
  readGeoPurchaseIntentFromUrl,
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
      platformIds: ["deepseek"],
    });
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
});

describe("GEO payment-query recovery state", () => {
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
});

describe("GEO irreversible-scope guards", () => {
  it("recognizes server order guards that must never offer local-only deletion", () => {
    expect(
      isGeoDeleteProtectionError(
        new GeoApiError("blocked", 409, "PROJECT_ORDER_DELETE_BLOCKED"),
      ),
    ).toBe(true);
    expect(
      isGeoDeleteProtectionError(
        new GeoApiError(
          "unavailable",
          503,
          "PROJECT_ORDER_REGISTRY_UNAVAILABLE",
        ),
      ),
    ).toBe(true);
    expect(
      isGeoDeleteProtectionError(
        new GeoApiError("ordinary failure", 502, "PROJECT_DELETE_INCOMPLETE"),
      ),
    ).toBe(false);
  });

  it("protects a project from deletion while any order for it is retained", () => {
    expect(isGeoProjectPaymentProtected("project-1", "project-1")).toBe(true);
    expect(isGeoProjectPaymentProtected("project-1", "project-2")).toBe(false);
  });

  it("protects paid monitoring and service fulfillment until delivery is complete", () => {
    expect(
      isGeoProjectFulfillmentProtected({
        monitoring: {
          runId: "monitor-run-1",
          status: "capturing",
        },
      } as never),
    ).toBe(true);
    expect(
      isGeoProjectFulfillmentProtected({
        monitoring: {
          runId: "monitor-run-1",
          status: "completed",
        },
      } as never),
    ).toBe(false);
    expect(
      isGeoProjectFulfillmentProtected({
        serviceActivation: {
          status: "provisioning",
          orderId: "service-order-1",
        },
      } as never),
    ).toBe(true);
    expect(
      isGeoProjectFulfillmentProtected({
        serviceActivation: {
          status: "active",
          orderId: "service-order-1",
        },
      } as never),
    ).toBe(false);
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
