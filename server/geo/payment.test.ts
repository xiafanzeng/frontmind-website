import { describe, expect, it, vi } from "vitest";
import {
  assertGeoPaymentConfigurationFromEnv,
  canonicalizeZpayParameters,
  GeoPaymentConfigurationError,
  geoServiceMonthlyPriceFen,
  signZpayParameters,
  UnconfiguredGeoPaymentVerifier,
  verifyGeoPaymentProviderFromEnv,
  ZpayGeoPaymentGateway,
} from "./payment";
import type { GeoPaymentReceipt, GeoPaymentReceiptStore } from "./provisioning";
import { GeoTokenCodec } from "./tokens";

const codec = new GeoTokenCodec(
  "payment-test-session-secret-at-least-16-characters",
);

const scope = {
  ownerSessionId: "session-1",
  projectId: "project-1",
  questionId: "reputation-01",
  platformIds: ["doubao", "kimi"] as const,
  expectedAmountFen: 400,
  method: "alipay" as const,
};

const productServiceScope = {
  ownerSessionId: "session-1",
  projectId: "project-1",
  questionId: "product-scenario-01",
  category: "product_scenario" as const,
  expectedAmountFen: 150_000,
  method: "alipay" as const,
};

function inMemoryReceiptStore(): GeoPaymentReceiptStore {
  const receipts = new Map<string, GeoPaymentReceipt>();
  return {
    assertReady: vi.fn(async () => undefined),
    find: vi.fn(async ({ orderId, scopeHash, authorizationDigest }) => {
      const receipt = receipts.get(orderId);
      return receipt?.scopeHash === scopeHash &&
        receipt.authorizationDigest === authorizationDigest
        ? receipt
        : undefined;
    }),
    record: vi.fn(async (receipt) => {
      const existing = receipts.get(receipt.orderId);
      if (existing && JSON.stringify(existing) !== JSON.stringify(receipt)) {
        throw new Error("receipt conflict");
      }
      receipts.set(receipt.orderId, existing ?? receipt);
      return receipts.get(receipt.orderId)!;
    }),
  };
}

function gateway(
  fetchImpl: typeof fetch = vi.fn<typeof fetch>(),
  receiptStore = inMemoryReceiptStore(),
  now: () => Date = () => new Date("2026-07-22T10:00:00.000Z"),
) {
  return new ZpayGeoPaymentGateway(
    {
      pid: "merchant123",
      key: "merchant-secret",
      publicBaseUrl: "https://www.frontmind.net",
    },
    codec,
    {
      receiptStore,
      fetchImpl,
      now,
      orderId: () => "202607221800001234567890",
    },
  );
}

describe("ZPAY signature", () => {
  it("sorts ASCII keys and excludes empty/sign fields without URL encoding", () => {
    const params = {
      b: "二",
      sign_type: "MD5",
      empty: "",
      a: "A B",
      sign: "ignored",
    };

    expect(canonicalizeZpayParameters(params)).toBe("a=A B&b=二");
    expect(signZpayParameters(params, "merchant-secret")).toBe(
      "6993010cfb3ecd23f1bcd543f436753d",
    );
  });
});

describe("ZPAY GEO gateway", () => {
  it("fails production startup when live merchant configuration is absent or unsafe", () => {
    expect(() =>
      assertGeoPaymentConfigurationFromEnv({ NODE_ENV: "production" }),
    ).toThrow(GeoPaymentConfigurationError);
    expect(() =>
      assertGeoPaymentConfigurationFromEnv({
        NODE_ENV: "production",
        FRONTMIND_ZPAY_PID: "merchant123",
        FRONTMIND_ZPAY_KEY: "merchant-secret",
        FRONTMIND_PUBLIC_BASE_URL: "http://127.0.0.1:8891",
      }),
    ).toThrow(GeoPaymentConfigurationError);
    expect(() =>
      assertGeoPaymentConfigurationFromEnv({
        NODE_ENV: "production",
        FRONTMIND_ZPAY_PID: "merchant123",
        FRONTMIND_ZPAY_KEY: "merchant-secret",
        FRONTMIND_PUBLIC_BASE_URL: "https://www.frontmind.net",
      }),
    ).not.toThrow();
  });

  it("preflights the live merchant without creating an order or exposing account data", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 1,
          msg: "查询账户余额成功",
          balance: "999.99",
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    const readiness = await verifyGeoPaymentProviderFromEnv(
      {
        NODE_ENV: "production",
        FRONTMIND_ZPAY_PID: "merchant123",
        FRONTMIND_ZPAY_KEY: "merchant-secret",
        FRONTMIND_PUBLIC_BASE_URL: "https://www.frontmind.net",
      },
      fetchMock,
    );

    expect(readiness).toEqual({
      status: "ok",
      provider: "zpay",
      callbackOrigin: "https://www.frontmind.net",
    });
    expect(JSON.stringify(readiness)).not.toContain("merchant");
    expect(JSON.stringify(readiness)).not.toContain("999.99");
    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.origin + requestUrl.pathname).toBe(
      "https://zpayz.cn/api.php",
    );
    expect(requestUrl.searchParams.get("act")).toBe("balance");
  });

  it("accepts the live merchant balance response wrapped in one JSON string", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify(
          JSON.stringify({
            code: 1,
            msg: "查询账户余额成功！",
            balance: "0.00",
          }),
        ),
        { headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      verifyGeoPaymentProviderFromEnv(
        {
          NODE_ENV: "production",
          FRONTMIND_ZPAY_PID: "merchant123",
          FRONTMIND_ZPAY_KEY: "merchant-secret",
          FRONTMIND_PUBLIC_BASE_URL: "https://www.frontmind.net",
        },
        fetchMock,
      ),
    ).resolves.toEqual({
      status: "ok",
      provider: "zpay",
      callbackOrigin: "https://www.frontmind.net",
    });
  });

  it("fails the merchant preflight closed for rejected credentials", async () => {
    await expect(
      verifyGeoPaymentProviderFromEnv(
        {
          NODE_ENV: "production",
          FRONTMIND_ZPAY_PID: "merchant123",
          FRONTMIND_ZPAY_KEY: "merchant-secret",
          FRONTMIND_PUBLIC_BASE_URL: "https://www.frontmind.net",
        },
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            new Response(JSON.stringify({ code: -1, msg: "密钥错误" })),
          ),
      ),
    ).rejects.toMatchObject({
      code: "PAYMENT_PROVIDER_NOT_READY",
      status: 503,
    });
  });

  it("requires a public HTTPS callback origin in production", () => {
    expect(
      () =>
        new ZpayGeoPaymentGateway(
          {
            pid: "merchant123",
            key: "merchant-secret",
            publicBaseUrl: "http://127.0.0.1:8888",
            production: true,
          },
          codec,
          { receiptStore: inMemoryReceiptStore() },
        ),
    ).toThrow(/HTTPS|public hostname/);
  });

  it("derives one stable merchant order number for the same purchase scope across payment methods", async () => {
    const paymentGateway = new ZpayGeoPaymentGateway(
      {
        pid: "merchant123",
        key: "merchant-secret",
        publicBaseUrl: "https://www.frontmind.net",
      },
      codec,
      { receiptStore: inMemoryReceiptStore() },
    );
    const first = await paymentGateway.createCheckout({
      ...scope,
      platformIds: [...scope.platformIds],
    });
    const replay = await paymentGateway.createCheckout({
      ...scope,
      platformIds: [...scope.platformIds].reverse(),
    });
    const anotherMethod = await paymentGateway.createCheckout({
      ...scope,
      platformIds: [...scope.platformIds],
      method: "wxpay",
    });

    expect(first.orderId).toMatch(/^\d{32}$/);
    expect(replay.orderId).toBe(first.orderId);
    expect(anotherMethod.orderId).toBe(first.orderId);
  });

  it("creates an overseas checkout before monitoring-time translation", async () => {
    const paymentGateway = gateway();
    const overseasScope = {
      ...scope,
      platformIds: ["chatgpt"] as const,
      monitoringEdition: "overseas" as const,
      expectedAmountFen: 500,
    };

    await expect(
      paymentGateway.createCheckout(overseasScope),
    ).resolves.toMatchObject({ amountFen: 500 });
  });

  it("switches an unpaid checkout by re-signing the same authorization and order", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 1,
          status: 0,
          pid: "merchant123",
          out_trade_no: "202607221800001234567890",
          type: "alipay",
          money: "4.00",
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    const paymentGateway = gateway(fetchMock);
    const first = await paymentGateway.createCheckout({
      ...scope,
      platformIds: [...scope.platformIds],
    });
    const switched = await paymentGateway.switchCheckoutMethod({
      authorization: first.authorization,
      ownerSessionId: scope.ownerSessionId,
      projectId: scope.projectId,
      questionId: scope.questionId,
      platformIds: [...scope.platformIds],
      expectedAmountFen: scope.expectedAmountFen,
      method: "wxpay",
      checkoutExpiresAt: first.expiresAt,
    });

    expect(switched).toMatchObject({
      authorization: first.authorization,
      orderId: first.orderId,
      amountFen: first.amountFen,
      expiresAt: first.expiresAt,
      fields: {
        type: "wxpay",
        param: first.authorization,
        out_trade_no: first.orderId,
      },
    });
    expect(switched.fields.sign).not.toBe(first.fields.sign);
    expect(switched.fields.sign).toBe(
      signZpayParameters(switched.fields, "merchant-secret"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("switches an unpaid service checkout without changing its order facts", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 1,
          status: 0,
          pid: "merchant123",
          out_trade_no: "202607221800001234567890",
          type: "alipay",
          money: "1500.00",
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    const paymentGateway = gateway(fetchMock);
    const first = await paymentGateway.createServiceCheckout({
      ...productServiceScope,
    });

    const switched = await paymentGateway.switchServiceCheckoutMethod({
      authorization: first.authorization,
      ownerSessionId: productServiceScope.ownerSessionId,
      projectId: productServiceScope.projectId,
      questionId: productServiceScope.questionId,
      category: productServiceScope.category,
      expectedAmountFen: productServiceScope.expectedAmountFen,
      method: "wxpay",
      checkoutExpiresAt: first.expiresAt,
    });

    expect(switched).toMatchObject({
      authorization: first.authorization,
      orderId: first.orderId,
      amountFen: first.amountFen,
      expiresAt: first.expiresAt,
      fields: {
        type: "wxpay",
        param: first.authorization,
        out_trade_no: first.orderId,
      },
    });
    expect(switched.fields.sign).toBe(
      signZpayParameters(switched.fields, "merchant-secret"),
    );
  });

  it("records one bank receipt for a pending service order and rejects a late ZPAY callback", async () => {
    const receiptStore = inMemoryReceiptStore();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 1,
          status: 0,
          pid: "merchant123",
          out_trade_no: "202607221800001234567890",
          type: "alipay",
          money: "1500.00",
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    const paymentGateway = gateway(fetchMock, receiptStore);
    const checkout = await paymentGateway.createServiceCheckout({
      ...productServiceScope,
    });
    const bankInput = {
      authorization: checkout.authorization,
      orderId: checkout.orderId,
      ownerSessionId: productServiceScope.ownerSessionId,
      projectId: productServiceScope.projectId,
      questionId: productServiceScope.questionId,
      category: productServiceScope.category,
      expectedAmountFen: productServiceScope.expectedAmountFen,
    };

    const first = await paymentGateway.confirmServiceBankTransfer(bankInput);
    const replayed = await paymentGateway.confirmServiceBankTransfer(bankInput);

    expect(first).toEqual(replayed);
    expect(first).toMatchObject({
      orderId: checkout.orderId,
      amountFen: 150_000,
      tradeNo: expect.stringMatching(/^bank:[a-f0-9]{48}$/),
      paidAt: "2026-07-22T10:00:00.000Z",
    });
    expect(receiptStore.record).toHaveBeenCalledTimes(1);

    const callback: Record<string, string> = {
      pid: checkout.fields.pid,
      name: checkout.fields.name,
      money: checkout.fields.money,
      out_trade_no: checkout.orderId,
      trade_no: "zpay-late-service-payment",
      param: checkout.authorization,
      trade_status: "TRADE_SUCCESS",
      type: checkout.fields.type,
      sign_type: "MD5",
    };
    callback.sign = signZpayParameters(callback, "merchant-secret");
    await expect(paymentGateway.verifyCallback(callback)).rejects.toMatchObject(
      {
        code: "PAYMENT_RECEIPT_CONFLICT",
        status: 409,
      },
    );
  });

  it("derives an idempotent overseas direct-bank receipt without querying ZPAY", async () => {
    const receiptStore = inMemoryReceiptStore();
    const fetchMock = vi.fn<typeof fetch>();
    const paymentGateway = gateway(fetchMock, receiptStore);
    const input = {
      orderId: "21234567890123456789012345678901",
      ownerSessionId: "session-overseas",
      projectId: "project-overseas",
      questionId: "reputation-01",
      category: "reputation" as const,
      monitoringEdition: "overseas" as const,
      expectedAmountFen: 400_000,
    };

    const [first, replayed] = await Promise.all([
      paymentGateway.confirmServiceBankTransfer(input),
      paymentGateway.confirmServiceBankTransfer(input),
    ]);

    expect(first).toEqual(replayed);
    expect(first).toMatchObject({
      orderId: input.orderId,
      amountFen: 400_000,
      tradeNo: expect.stringMatching(/^bank:/),
    });
    expect(receiptStore.record).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses bank confirmation when the online service payment has settled", async () => {
    const receiptStore = inMemoryReceiptStore();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 1,
          status: 1,
          pid: "merchant123",
          out_trade_no: "202607221800001234567890",
          trade_no: "zpay-service-already-paid",
          type: "alipay",
          money: "1500.00",
          addtime: "2026-07-22 17:55:00",
          endtime: "2026-07-22 18:00:00",
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    const paymentGateway = gateway(fetchMock, receiptStore);
    const checkout = await paymentGateway.createServiceCheckout({
      ...productServiceScope,
    });

    await expect(
      paymentGateway.confirmServiceBankTransfer({
        authorization: checkout.authorization,
        orderId: checkout.orderId,
        ownerSessionId: productServiceScope.ownerSessionId,
        projectId: productServiceScope.projectId,
        questionId: productServiceScope.questionId,
        category: productServiceScope.category,
        expectedAmountFen: productServiceScope.expectedAmountFen,
      }),
    ).rejects.toMatchObject({
      code: "PAYMENT_ALREADY_CONFIRMED",
      status: 409,
    });
    expect(receiptStore.record).toHaveBeenCalledTimes(1);
  });

  it("blocks a payment-method switch once the provider has confirmed payment", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 1,
          status: 1,
          pid: "merchant123",
          out_trade_no: "202607221800001234567890",
          trade_no: "zpay-trade-already-paid",
          type: "alipay",
          money: "4.00",
          addtime: "2026-07-22 18:00:00",
          endtime: "2026-07-22 18:05:00",
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    const paymentGateway = gateway(fetchMock);
    const first = await paymentGateway.createCheckout({
      ...scope,
      platformIds: [...scope.platformIds],
    });

    await expect(
      paymentGateway.switchCheckoutMethod({
        authorization: first.authorization,
        ownerSessionId: scope.ownerSessionId,
        projectId: scope.projectId,
        questionId: scope.questionId,
        platformIds: [...scope.platformIds],
        expectedAmountFen: scope.expectedAmountFen,
        method: "wxpay",
        checkoutExpiresAt: first.expiresAt,
      }),
    ).rejects.toMatchObject({
      code: "PAYMENT_ALREADY_CONFIRMED",
      status: 409,
    });
  });

  it("keeps service and monitoring orders stable across payment methods", async () => {
    const paymentGateway = new ZpayGeoPaymentGateway(
      {
        pid: "merchant123",
        key: "merchant-secret",
        publicBaseUrl: "https://www.frontmind.net",
      },
      codec,
      { receiptStore: inMemoryReceiptStore() },
    );
    const alipayService = await paymentGateway.createServiceCheckout({
      ...productServiceScope,
    });
    const wxpayService = await paymentGateway.createServiceCheckout({
      ...productServiceScope,
      method: "wxpay",
    });
    const alipayMonitoring = await paymentGateway.createCheckout({
      ...scope,
      platformIds: [...scope.platformIds],
    });
    const wxpayMonitoring = await paymentGateway.createCheckout({
      ...scope,
      platformIds: [...scope.platformIds],
      method: "wxpay",
    });

    expect(alipayService.orderId).toMatch(/^\d{32}$/);
    expect(wxpayService.orderId).toBe(alipayService.orderId);
    expect(wxpayMonitoring.orderId).toBe(alipayMonitoring.orderId);
  });

  it("blocks every checkout before opening the cashier when the durable receipt ledger is unavailable", async () => {
    const receiptStore = inMemoryReceiptStore();
    vi.mocked(receiptStore.assertReady).mockRejectedValue(
      new Error("database unavailable"),
    );
    const paymentGateway = gateway(vi.fn<typeof fetch>(), receiptStore);

    await expect(
      paymentGateway.createCheckout({
        ...scope,
        platformIds: [...scope.platformIds],
      }),
    ).rejects.toMatchObject({
      code: "PAYMENT_LEDGER_UNAVAILABLE",
      status: 503,
    });
    await expect(
      paymentGateway.createServiceCheckout(productServiceScope),
    ).rejects.toMatchObject({
      code: "PAYMENT_LEDGER_UNAVAILABLE",
      status: 503,
    });
  });

  it.each([
    {
      category: "product_scenario" as const,
      questionId: "product-scenario-01",
      amountFen: 150_000,
      money: "1500.00",
      name: "产品与服务 Q&A",
    },
    {
      category: "reputation" as const,
      questionId: "reputation-01",
      amountFen: 200_000,
      money: "2000.00",
      name: "美誉舆情",
    },
    {
      category: "competitor_comparison" as const,
      questionId: "competitor-comparison-01",
      amountFen: 200_000,
      money: "2000.00",
      name: "竞品对比",
    },
  ])(
    "creates the server-priced $category 30-day service checkout",
    async ({ category, questionId, amountFen, money, name }) => {
      const checkout = await gateway().createServiceCheckout({
        ownerSessionId: "session-1",
        projectId: "project-1",
        questionId,
        category,
        expectedAmountFen: amountFen,
        method: "alipay",
      });

      expect(checkout.amountFen).toBe(amountFen);
      expect(checkout.fields.money).toBe(money);
      expect(checkout.fields.name).toContain(name);
      expect(checkout.fields.name).toContain("连续30天");
      expect(checkout.fields.param).toBe(checkout.authorization);
      expect(checkout.fields.sign).toBe(
        signZpayParameters(checkout.fields, "merchant-secret"),
      );
    },
  );

  it.each([
    ["product_scenario", 200_000],
    ["reputation", 150_000],
    ["competitor_comparison", 150_000],
  ] as const)(
    "rejects a client-supplied price for %s",
    async (category, expectedAmountFen) => {
      await expect(
        gateway().createServiceCheckout({
          ownerSessionId: "session-1",
          projectId: "project-1",
          questionId: `${category}-01`,
          category,
          expectedAmountFen,
          method: "alipay",
        }),
      ).rejects.toMatchObject({
        code: "PAYMENT_SCOPE_INVALID",
        status: 400,
      });
    },
  );

  it("creates a server-priced POST checkout without exposing the merchant key", async () => {
    const checkout = await gateway().createCheckout({
      ...scope,
      platformIds: [...scope.platformIds],
    });

    expect(checkout).toMatchObject({
      orderId: "202607221800001234567890",
      amountFen: 400,
      action: "https://zpayz.cn/submit.php",
      method: "POST",
    });
    expect(checkout.fields).toMatchObject({
      pid: "merchant123",
      type: "alipay",
      money: "4.00",
      out_trade_no: checkout.orderId,
      notify_url: "https://www.frontmind.net/api/geo/payments/notify",
      return_url: "https://www.frontmind.net/api/geo/payments/return",
      sign_type: "MD5",
    });
    expect(checkout.fields.name).toContain("2个平台");
    expect(checkout.fields.param).toBe(checkout.authorization);
    expect(JSON.stringify(checkout)).not.toContain("merchant-secret");
    expect(checkout.fields.sign).toBe(
      signZpayParameters(checkout.fields, "merchant-secret"),
    );
  });

  it("keeps an unpaid order pending and accepts only a fully matching paid order", async () => {
    const providerResponses = [
      {
        code: 1,
        status: 0,
        pid: "merchant123",
        out_trade_no: "202607221800001234567890",
        type: "alipay",
        name: "FrontMind GEO 问题现状监控（2个平台，每平台5次）",
        money: "4.00",
      },
      {
        code: 1,
        status: 1,
        pid: "merchant123",
        out_trade_no: "202607221800001234567890",
        trade_no: "zpay-trade-1",
        type: "alipay",
        name: "FrontMind GEO 问题现状监控（2个平台，每平台5次）",
        money: "4.00",
        addtime: "2026-07-22 18:00:00",
        endtime: "2026-07-22 18:05:00",
      },
    ];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(JSON.stringify(providerResponses.shift()), {
          headers: { "content-type": "application/json" },
        }),
    );
    const paymentGateway = gateway(fetchMock);
    const checkout = await paymentGateway.createCheckout({
      ...scope,
      platformIds: [...scope.platformIds],
    });
    const verification = {
      authorization: checkout.authorization,
      ownerSessionId: scope.ownerSessionId,
      projectId: scope.projectId,
      questionId: scope.questionId,
      platformIds: [...scope.platformIds],
      expectedAmountFen: scope.expectedAmountFen,
    };

    await expect(paymentGateway.getStatus(verification)).resolves.toMatchObject(
      {
        status: "pending",
        amountFen: 400,
      },
    );
    await expect(paymentGateway.verify(verification)).resolves.toEqual({
      orderId: checkout.orderId,
      tradeNo: "zpay-trade-1",
      amountFen: 400,
      paidAt: "2026-07-22T10:05:00.000Z",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const query = new URL(String(fetchMock.mock.calls[0][0]));
    expect(query.origin + query.pathname).toBe("https://zpayz.cn/api.php");
    expect(query.searchParams.get("act")).toBe("order");
    expect(query.searchParams.get("out_trade_no")).toBe(checkout.orderId);
  });

  it("accepts an order query response wrapped in one JSON string", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify(
          JSON.stringify({
            code: 1,
            status: 0,
            pid: "merchant123",
            out_trade_no: "202607221800001234567890",
            type: "alipay",
            name: "FrontMind GEO 问题现状监控（2个平台，每平台5次）",
            money: "4.00",
          }),
        ),
        { headers: { "content-type": "application/json" } },
      ),
    );
    const paymentGateway = gateway(fetchMock);
    const checkout = await paymentGateway.createCheckout({
      ...scope,
      platformIds: [...scope.platformIds],
    });

    await expect(
      paymentGateway.getStatus({
        authorization: checkout.authorization,
        ownerSessionId: scope.ownerSessionId,
        projectId: scope.projectId,
        questionId: scope.questionId,
        platformIds: [...scope.platformIds],
        expectedAmountFen: scope.expectedAmountFen,
      }),
    ).resolves.toMatchObject({
      status: "pending",
      orderId: checkout.orderId,
      amountFen: scope.expectedAmountFen,
    });
  });

  it.each(["direct", "wrapped"] as const)(
    "preserves oversized numeric ZPAY identifiers in a %s order response",
    async (responseShape) => {
      const merchantPid = "201901151314084206659771";
      const orderId = "10031293871242279000307640737676";
      const tradeNo = "20260803124100123456789012345678";
      const productName = "FrontMind GEO 问题现状监控（2个平台，每平台5次）";
      const providerJson =
        `{"code":1,"status":1,"pid":${merchantPid},` +
        `"out_trade_no":${orderId},"trade_no":${tradeNo},` +
        `"type":"wxpay2","name":${JSON.stringify(productName)},` +
        '"money":"4.00","addtime":"2026-08-03 12:40:00",' +
        '"endtime":"2026-08-03 12:41:00"}';
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(
            responseShape === "wrapped"
              ? JSON.stringify(providerJson)
              : providerJson,
            { headers: { "content-type": "application/json" } },
          ),
        );
      const paymentGateway = new ZpayGeoPaymentGateway(
        {
          pid: merchantPid,
          key: "merchant-secret",
          publicBaseUrl: "https://www.frontmind.net",
        },
        codec,
        {
          receiptStore: inMemoryReceiptStore(),
          fetchImpl: fetchMock,
          now: () => new Date("2026-08-03T04:45:00.000Z"),
          orderId: () => orderId,
        },
      );
      const checkout = await paymentGateway.createCheckout({
        ...scope,
        method: "wxpay",
        platformIds: [...scope.platformIds],
      });

      await expect(
        paymentGateway.getStatus({
          authorization: checkout.authorization,
          ownerSessionId: scope.ownerSessionId,
          projectId: scope.projectId,
          questionId: scope.questionId,
          platformIds: [...scope.platformIds],
          expectedAmountFen: scope.expectedAmountFen,
        }),
      ).resolves.toMatchObject({
        status: "paid",
        orderId,
        tradeNo,
        paidAt: "2026-08-03T04:41:00.000Z",
      });
    },
  );

  it("does not round an oversized numeric order ID into a false match", async () => {
    const merchantPid = "201901151314084206659771";
    const orderId = "10031293871242279000307640737676";
    const differentOrderId = "10031293871242279000307640737677";
    const productName = "FrontMind GEO 问题现状监控（2个平台，每平台5次）";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          `{"code":1,"status":1,"pid":${merchantPid},` +
            `"out_trade_no":${differentOrderId},` +
            '"trade_no":20260803124100123456789012345678,' +
            `"type":"wxpay","name":${JSON.stringify(productName)},` +
            '"money":"4.00","addtime":"2026-08-03 12:40:00",' +
            '"endtime":"2026-08-03 12:41:00"}',
          { headers: { "content-type": "application/json" } },
        ),
      );
    const paymentGateway = new ZpayGeoPaymentGateway(
      {
        pid: merchantPid,
        key: "merchant-secret",
        publicBaseUrl: "https://www.frontmind.net",
      },
      codec,
      {
        receiptStore: inMemoryReceiptStore(),
        fetchImpl: fetchMock,
        now: () => new Date("2026-08-03T04:45:00.000Z"),
        orderId: () => orderId,
      },
    );
    const checkout = await paymentGateway.createCheckout({
      ...scope,
      method: "wxpay",
      platformIds: [...scope.platformIds],
    });

    await expect(
      paymentGateway.getStatus({
        authorization: checkout.authorization,
        ownerSessionId: scope.ownerSessionId,
        projectId: scope.projectId,
        questionId: scope.questionId,
        platformIds: [...scope.platformIds],
        expectedAmountFen: scope.expectedAmountFen,
      }),
    ).rejects.toMatchObject({
      code: "PAYMENT_SCOPE_MISMATCH",
      status: 402,
    });
  });

  it("accepts identity-matched orders when provider display metadata is normalized", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 1,
          status: 1,
          pid: "merchant123",
          out_trade_no: "202607221800001234567890",
          trade_no: "zpay-trade-normalized-metadata",
          name: "FrontMind GEO 问题现状监控",
          money: "4.00",
          addtime: "2026-07-22 18:00:00",
          endtime: "2026-07-22 18:05:00",
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    const paymentGateway = gateway(fetchMock);
    const checkout = await paymentGateway.createCheckout({
      ...scope,
      method: "wxpay",
      platformIds: [...scope.platformIds],
    });

    await expect(
      paymentGateway.getStatus({
        authorization: checkout.authorization,
        ownerSessionId: scope.ownerSessionId,
        projectId: scope.projectId,
        questionId: scope.questionId,
        platformIds: [...scope.platformIds],
        expectedAmountFen: scope.expectedAmountFen,
      }),
    ).resolves.toMatchObject({
      status: "paid",
      orderId: checkout.orderId,
      tradeNo: "zpay-trade-normalized-metadata",
    });
  });

  it("recovers a paid order from the ledger after recreating its randomized checkout token", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 1,
          status: 1,
          pid: "merchant123",
          out_trade_no: "202607221800001234567890",
          trade_no: "zpay-trade-recreated-checkout",
          type: "alipay",
          name: "FrontMind GEO 问题现状监控（2个平台，每平台5次）",
          money: "4.00",
          addtime: "2026-07-22 18:00:00",
          endtime: "2026-07-22 18:05:00",
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    const receiptStore = inMemoryReceiptStore();
    const paymentGateway = gateway(fetchMock, receiptStore);
    const first = await paymentGateway.createCheckout({
      ...scope,
      platformIds: [...scope.platformIds],
    });
    const firstVerification = {
      authorization: first.authorization,
      ownerSessionId: scope.ownerSessionId,
      projectId: scope.projectId,
      questionId: scope.questionId,
      platformIds: [...scope.platformIds],
      expectedAmountFen: scope.expectedAmountFen,
    };
    await expect(
      paymentGateway.getStatus(firstVerification),
    ).resolves.toMatchObject({ status: "paid" });

    const recreated = await paymentGateway.createCheckout({
      ...scope,
      platformIds: [...scope.platformIds],
      method: "wxpay",
    });
    expect(recreated.orderId).toBe(first.orderId);
    expect(recreated.authorization).not.toBe(first.authorization);
    await expect(
      paymentGateway.getStatus({
        ...firstVerification,
        authorization: recreated.authorization,
      }),
    ).resolves.toMatchObject({
      status: "paid",
      tradeNo: "zpay-trade-recreated-checkout",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(receiptStore.record).toHaveBeenCalledTimes(1);
  });

  it("recovers the original provider order after changing payment method before any receipt exists", async () => {
    const providerResponses = [
      {
        code: 1,
        status: 0,
        pid: "merchant123",
        out_trade_no: "202607221800001234567890",
        type: "alipay",
        name: "FrontMind GEO 问题现状监控（2个平台，每平台5次）",
        money: "4.00",
        addtime: "2026-07-22 18:00:00",
        endtime: null,
      },
      {
        code: 1,
        status: 1,
        pid: "merchant123",
        out_trade_no: "202607221800001234567890",
        trade_no: "zpay-trade-original-method",
        type: "alipay",
        name: "FrontMind GEO 问题现状监控（2个平台，每平台5次）",
        money: "4.00",
        addtime: "2026-07-22 18:00:00",
        endtime: "2026-07-22 18:05:00",
      },
    ];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(JSON.stringify(providerResponses.shift()), {
          headers: { "content-type": "application/json" },
        }),
    );
    const receiptStore = inMemoryReceiptStore();
    const paymentGateway = gateway(fetchMock, receiptStore);
    const alipay = await paymentGateway.createCheckout({
      ...scope,
      platformIds: [...scope.platformIds],
    });
    const wxpay = await paymentGateway.createCheckout({
      ...scope,
      platformIds: [...scope.platformIds],
      method: "wxpay",
    });
    expect(wxpay.orderId).toBe(alipay.orderId);
    const verification = {
      authorization: wxpay.authorization,
      ownerSessionId: scope.ownerSessionId,
      projectId: scope.projectId,
      questionId: scope.questionId,
      platformIds: [...scope.platformIds],
      expectedAmountFen: scope.expectedAmountFen,
    };

    await expect(paymentGateway.getStatus(verification)).resolves.toMatchObject(
      {
        status: "pending",
      },
    );
    await expect(paymentGateway.getStatus(verification)).resolves.toMatchObject(
      {
        status: "paid",
        tradeNo: "zpay-trade-original-method",
      },
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(receiptStore.record).toHaveBeenCalledTimes(1);
  });

  it("stops on provider rejection and enforces the response limit while streaming", async () => {
    const rejectedGateway = gateway(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(JSON.stringify({ code: -1, msg: "商户密钥错误" })),
        ),
    );
    const rejectedCheckout = await rejectedGateway.createCheckout({
      ...scope,
      platformIds: [...scope.platformIds],
    });
    const verification = {
      authorization: rejectedCheckout.authorization,
      ownerSessionId: scope.ownerSessionId,
      projectId: scope.projectId,
      questionId: scope.questionId,
      platformIds: [...scope.platformIds],
      expectedAmountFen: scope.expectedAmountFen,
    };

    await expect(rejectedGateway.getStatus(verification)).rejects.toMatchObject(
      { code: "PAYMENT_QUERY_REJECTED" },
    );

    const oversizedGateway = gateway(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("x".repeat(64 * 1024 + 1))),
    );
    const oversizedCheckout = await oversizedGateway.createCheckout({
      ...scope,
      platformIds: [...scope.platformIds],
    });
    await expect(
      oversizedGateway.getStatus({
        ...verification,
        authorization: oversizedCheckout.authorization,
      }),
    ).rejects.toMatchObject({ code: "PAYMENT_QUERY_INVALID" });
  });

  it("rejects a paid provider response without canonical order-creation evidence", async () => {
    const paymentGateway = gateway(
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 1,
            status: 1,
            pid: "merchant123",
            out_trade_no: "202607221800001234567890",
            trade_no: "zpay-trade-missing-addtime",
            type: "alipay",
            name: "FrontMind GEO 问题现状监控（2个平台，每平台5次）",
            money: "4.00",
            endtime: "2026-07-22 18:05:00",
          }),
          { headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const checkout = await paymentGateway.createCheckout({
      ...scope,
      platformIds: [...scope.platformIds],
    });

    await expect(
      paymentGateway.getStatus({
        authorization: checkout.authorization,
        ownerSessionId: scope.ownerSessionId,
        projectId: scope.projectId,
        questionId: scope.questionId,
        platformIds: [...scope.platformIds],
        expectedAmountFen: scope.expectedAmountFen,
      }),
    ).rejects.toMatchObject({
      code: "PAYMENT_QUERY_INVALID",
      status: 502,
    });
  });

  it("rejects a paid provider response with an unsupported payment type", async () => {
    const paymentGateway = gateway(
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 1,
            status: 1,
            pid: "merchant123",
            out_trade_no: "202607221800001234567890",
            trade_no: "zpay-trade-unsupported-type",
            type: "unionpay",
            name: "FrontMind GEO 问题现状监控（2个平台，每平台5次）",
            money: "4.00",
            addtime: "2026-07-22 18:00:00",
            endtime: "2026-07-22 18:05:00",
          }),
          { headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const checkout = await paymentGateway.createCheckout({
      ...scope,
      platformIds: [...scope.platformIds],
    });

    await expect(
      paymentGateway.getStatus({
        authorization: checkout.authorization,
        ownerSessionId: scope.ownerSessionId,
        projectId: scope.projectId,
        questionId: scope.questionId,
        platformIds: [...scope.platformIds],
        expectedAmountFen: scope.expectedAmountFen,
      }),
    ).rejects.toMatchObject({
      code: "PAYMENT_SCOPE_MISMATCH",
      status: 402,
    });
  });

  it.each([
    ["creation after settlement", "2026-07-22 18:06:00", "2026-07-22 18:05:00"],
    [
      "settlement beyond clock skew",
      "2026-07-22 18:00:00",
      "2026-07-22 18:06:00",
    ],
  ])(
    "rejects paid provider time evidence with %s",
    async (_case, addtime, endtime) => {
      const paymentGateway = gateway(
        vi.fn<typeof fetch>().mockResolvedValue(
          new Response(
            JSON.stringify({
              code: 1,
              status: 1,
              pid: "merchant123",
              out_trade_no: "202607221800001234567890",
              trade_no: "zpay-trade-invalid-time",
              type: "alipay",
              name: "FrontMind GEO 问题现状监控（2个平台，每平台5次）",
              money: "4.00",
              addtime,
              endtime,
            }),
            { headers: { "content-type": "application/json" } },
          ),
        ),
      );
      const checkout = await paymentGateway.createCheckout({
        ...scope,
        platformIds: [...scope.platformIds],
      });

      await expect(
        paymentGateway.getStatus({
          authorization: checkout.authorization,
          ownerSessionId: scope.ownerSessionId,
          projectId: scope.projectId,
          questionId: scope.questionId,
          platformIds: [...scope.platformIds],
          expectedAmountFen: scope.expectedAmountFen,
        }),
      ).rejects.toMatchObject({
        code: "PAYMENT_QUERY_INVALID",
        status: 502,
      });
    },
  );

  it("rejects cross-project, cross-session, and cross-platform reuse before querying ZPAY", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const paymentGateway = gateway(fetchMock);
    const checkout = await paymentGateway.createCheckout({
      ...scope,
      platformIds: [...scope.platformIds],
    });

    await expect(
      paymentGateway.getStatus({
        authorization: checkout.authorization,
        ownerSessionId: scope.ownerSessionId,
        projectId: "another-project",
        questionId: scope.questionId,
        platformIds: [...scope.platformIds],
        expectedAmountFen: 400,
      }),
    ).rejects.toMatchObject({ code: "PAYMENT_SCOPE_MISMATCH" });
    await expect(
      paymentGateway.getStatus({
        authorization: checkout.authorization,
        ownerSessionId: "another-session",
        projectId: scope.projectId,
        questionId: scope.questionId,
        platformIds: [...scope.platformIds],
        expectedAmountFen: 400,
      }),
    ).rejects.toMatchObject({ code: "PAYMENT_SCOPE_MISMATCH" });
    await expect(
      paymentGateway.getStatus({
        authorization: checkout.authorization,
        ownerSessionId: scope.ownerSessionId,
        projectId: scope.projectId,
        questionId: scope.questionId,
        platformIds: ["doubao"],
        expectedAmountFen: 200,
      }),
    ).rejects.toMatchObject({ code: "PAYMENT_SCOPE_MISMATCH" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never accepts monitoring authorization for a service or service authorization for monitoring", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const paymentGateway = gateway(fetchMock);
    const monitoringCheckout = await paymentGateway.createCheckout({
      ...scope,
      platformIds: [...scope.platformIds],
    });
    const serviceCheckout =
      await paymentGateway.createServiceCheckout(productServiceScope);
    const serviceVerification = {
      authorization: monitoringCheckout.authorization,
      ownerSessionId: productServiceScope.ownerSessionId,
      projectId: productServiceScope.projectId,
      questionId: productServiceScope.questionId,
      category: productServiceScope.category,
      expectedAmountFen: productServiceScope.expectedAmountFen,
    };
    const monitoringVerification = {
      authorization: serviceCheckout.authorization,
      ownerSessionId: scope.ownerSessionId,
      projectId: scope.projectId,
      questionId: scope.questionId,
      platformIds: [...scope.platformIds],
      expectedAmountFen: scope.expectedAmountFen,
    };

    await expect(
      paymentGateway.getServiceStatus(serviceVerification),
    ).rejects.toMatchObject({ code: "PAYMENT_SCOPE_MISMATCH" });
    await expect(
      paymentGateway.verifyService(serviceVerification),
    ).rejects.toMatchObject({ code: "PAYMENT_SCOPE_MISMATCH" });
    await expect(
      paymentGateway.getStatus(monitoringVerification),
    ).rejects.toMatchObject({ code: "PAYMENT_SCOPE_MISMATCH" });
    await expect(
      paymentGateway.verify(monitoringVerification),
    ).rejects.toMatchObject({ code: "PAYMENT_SCOPE_MISMATCH" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps an unpaid service pending and verifies the matching paid service order", async () => {
    const productName =
      "FrontMind GEO 产品与服务 Q&A优化服务（1个问题 / 连续30天）";
    const providerResponses = [
      {
        code: 1,
        status: 0,
        pid: "merchant123",
        out_trade_no: "202607221800001234567890",
        type: "alipay",
        name: productName,
        money: "1500.00",
      },
      {
        code: 1,
        status: 0,
        pid: "merchant123",
        out_trade_no: "202607221800001234567890",
        type: "alipay",
        name: productName,
        money: "1500.00",
      },
      {
        code: 1,
        status: 1,
        pid: "merchant123",
        out_trade_no: "202607221800001234567890",
        trade_no: "zpay-service-trade-1",
        type: "alipay",
        name: productName,
        money: "1500.00",
        addtime: "2026-07-22 18:00:00",
        endtime: "2026-07-22 18:05:00",
      },
    ];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(JSON.stringify(providerResponses.shift()), {
          headers: { "content-type": "application/json" },
        }),
    );
    const paymentGateway = gateway(fetchMock);
    const checkout =
      await paymentGateway.createServiceCheckout(productServiceScope);
    const verification = {
      authorization: checkout.authorization,
      ownerSessionId: productServiceScope.ownerSessionId,
      projectId: productServiceScope.projectId,
      questionId: productServiceScope.questionId,
      category: productServiceScope.category,
      expectedAmountFen: productServiceScope.expectedAmountFen,
    };

    await expect(
      paymentGateway.getServiceStatus(verification),
    ).resolves.toMatchObject({
      status: "pending",
      amountFen: 150_000,
    });
    await expect(
      paymentGateway.verifyService(verification),
    ).rejects.toMatchObject({
      code: "PAYMENT_PENDING",
      status: 402,
    });
    await expect(paymentGateway.verifyService(verification)).resolves.toEqual({
      orderId: checkout.orderId,
      tradeNo: "zpay-service-trade-1",
      amountFen: 150_000,
      paidAt: "2026-07-22T10:05:00.000Z",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("verifies signed callbacks and rejects an altered amount", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 1,
          status: 1,
          pid: "merchant123",
          out_trade_no: "202607221800001234567890",
          trade_no: "zpay-trade-1",
          type: "alipay",
          name: "FrontMind GEO 问题现状监控（2个平台，每平台5次）",
          money: "4.00",
          addtime: "2026-07-22 18:00:00",
          endtime: "2026-07-22 18:05:00",
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    const receiptStore = inMemoryReceiptStore();
    const paymentGateway = gateway(fetchMock, receiptStore);
    const checkout = await paymentGateway.createCheckout({
      ...scope,
      platformIds: [...scope.platformIds],
    });
    const callback: Record<string, string> = {
      pid: checkout.fields.pid,
      name: checkout.fields.name,
      money: checkout.fields.money,
      out_trade_no: checkout.orderId,
      trade_no: "zpay-trade-1",
      param: checkout.authorization,
      trade_status: "TRADE_SUCCESS",
      type: checkout.fields.type,
      sign_type: "MD5",
    };
    callback.sign = signZpayParameters(callback, "merchant-secret");

    await expect(
      paymentGateway.verifyCallback(callback),
    ).resolves.toMatchObject({
      status: "paid",
      orderId: checkout.orderId,
      amountFen: 400,
    });
    await expect(
      paymentGateway.verifyCallback(callback),
    ).resolves.toMatchObject({
      status: "paid",
      tradeNo: "zpay-trade-1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(receiptStore.record).toHaveBeenCalledTimes(1);

    const altered = { ...callback, money: "0.01" };
    altered.sign = signZpayParameters(altered, "merchant-secret");
    await expect(paymentGateway.verifyCallback(altered)).rejects.toMatchObject({
      code: "PAYMENT_CALLBACK_MISMATCH",
    });
  });

  it("accepts a signed callback from the server-switched payment channel", async () => {
    const providerResponses = [
      {
        code: 1,
        status: 0,
        pid: "merchant123",
        out_trade_no: "202607221800001234567890",
        type: "alipay",
        money: "4.00",
      },
      {
        code: 1,
        status: 1,
        pid: "merchant123",
        out_trade_no: "202607221800001234567890",
        trade_no: "zpay-trade-switched-channel",
        type: "wxpay",
        money: "4.00",
        addtime: "2026-07-22 18:00:00",
        endtime: "2026-07-22 18:05:00",
      },
    ];
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(JSON.stringify(providerResponses.shift()), {
          headers: { "content-type": "application/json" },
        }),
    );
    const paymentGateway = gateway(fetchMock);
    const checkout = await paymentGateway.createCheckout({
      ...scope,
      platformIds: [...scope.platformIds],
    });
    const switched = await paymentGateway.switchCheckoutMethod({
      authorization: checkout.authorization,
      ownerSessionId: scope.ownerSessionId,
      projectId: scope.projectId,
      questionId: scope.questionId,
      platformIds: [...scope.platformIds],
      expectedAmountFen: scope.expectedAmountFen,
      method: "wxpay",
      checkoutExpiresAt: checkout.expiresAt,
    });
    const callback: Record<string, string> = {
      pid: switched.fields.pid,
      name: switched.fields.name,
      money: switched.fields.money,
      out_trade_no: switched.orderId,
      trade_no: "zpay-trade-switched-channel",
      param: switched.authorization,
      trade_status: "TRADE_SUCCESS",
      type: "wxpay",
      sign_type: "MD5",
    };
    callback.sign = signZpayParameters(callback, "merchant-secret");

    await expect(
      paymentGateway.verifyCallback(callback),
    ).resolves.toMatchObject({
      status: "paid",
      orderId: checkout.orderId,
      tradeNo: "zpay-trade-switched-channel",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects a signed callback when the provider query reports another payment channel", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 1,
          status: 1,
          pid: "merchant123",
          out_trade_no: "202607221800001234567890",
          trade_no: "zpay-trade-channel-mismatch",
          type: "wxpay",
          money: "4.00",
          addtime: "2026-07-22 18:00:00",
          endtime: "2026-07-22 18:05:00",
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    const receiptStore = inMemoryReceiptStore();
    const paymentGateway = gateway(fetchMock, receiptStore);
    const checkout = await paymentGateway.createCheckout({
      ...scope,
      platformIds: [...scope.platformIds],
    });
    const callback: Record<string, string> = {
      pid: checkout.fields.pid,
      name: checkout.fields.name,
      money: checkout.fields.money,
      out_trade_no: checkout.orderId,
      trade_no: "zpay-trade-channel-mismatch",
      param: checkout.authorization,
      trade_status: "TRADE_SUCCESS",
      type: "alipay",
      sign_type: "MD5",
    };
    callback.sign = signZpayParameters(callback, "merchant-secret");

    await expect(paymentGateway.verifyCallback(callback)).rejects.toMatchObject(
      {
        code: "PAYMENT_CALLBACK_NOT_SETTLED",
        status: 502,
      },
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(receiptStore.record).not.toHaveBeenCalled();
  });

  it("records and replays a signed wxpay2 callback backed by oversized numeric provider IDs", async () => {
    const merchantPid = "201901151314084206659771";
    const orderId = "10031293871242279000307640737676";
    const tradeNo = "20260803124100123456789012345678";
    const productName = "FrontMind GEO 问题现状监控（2个平台，每平台5次）";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          `{"code":1,"status":1,"pid":${merchantPid},` +
            `"out_trade_no":${orderId},"trade_no":${tradeNo},` +
            `"type":"wxpay2","name":${JSON.stringify(productName)},` +
            '"money":"4.00","addtime":"2026-08-03 12:40:00",' +
            '"endtime":"2026-08-03 12:41:00"}',
          { headers: { "content-type": "application/json" } },
        ),
      );
    const receiptStore = inMemoryReceiptStore();
    const paymentGateway = new ZpayGeoPaymentGateway(
      {
        pid: merchantPid,
        key: "merchant-secret",
        publicBaseUrl: "https://www.frontmind.net",
      },
      codec,
      {
        receiptStore,
        fetchImpl: fetchMock,
        now: () => new Date("2026-08-03T04:45:00.000Z"),
        orderId: () => orderId,
      },
    );
    const checkout = await paymentGateway.createCheckout({
      ...scope,
      method: "wxpay",
      platformIds: [...scope.platformIds],
    });
    const callback: Record<string, string> = {
      pid: merchantPid,
      name: "FrontMind GEO 问题现状监控",
      money: checkout.fields.money,
      out_trade_no: orderId,
      trade_no: tradeNo,
      param: checkout.authorization,
      trade_status: "TRADE_SUCCESS",
      type: "wxpay2",
      sign_type: "MD5",
    };
    callback.sign = signZpayParameters(callback, "merchant-secret");

    await expect(
      paymentGateway.verifyCallback(callback),
    ).resolves.toMatchObject({
      status: "paid",
      orderId,
      tradeNo,
    });
    await expect(
      paymentGateway.verifyCallback(callback),
    ).resolves.toMatchObject({
      status: "paid",
      orderId,
      tradeNo,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(receiptStore.record).toHaveBeenCalledTimes(1);

    const unsupportedType = { ...callback, type: "wxpay3" };
    unsupportedType.sign = signZpayParameters(
      unsupportedType,
      "merchant-secret",
    );
    await expect(
      paymentGateway.verifyCallback(unsupportedType),
    ).rejects.toMatchObject({ code: "PAYMENT_CALLBACK_MISMATCH" });
  });

  it("never acknowledges a paid callback until its receipt is durably recorded", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 1,
          status: 1,
          pid: "merchant123",
          out_trade_no: "202607221800001234567890",
          trade_no: "zpay-trade-ledger-down",
          type: "alipay",
          name: "FrontMind GEO 问题现状监控（2个平台，每平台5次）",
          money: "4.00",
          addtime: "2026-07-22 18:00:00",
          endtime: "2026-07-22 18:05:00",
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    const receiptStore = inMemoryReceiptStore();
    vi.mocked(receiptStore.record).mockRejectedValue(
      new Error("database unavailable"),
    );
    const paymentGateway = gateway(fetchMock, receiptStore);
    const checkout = await paymentGateway.createCheckout({
      ...scope,
      platformIds: [...scope.platformIds],
    });
    const callback: Record<string, string> = {
      pid: checkout.fields.pid,
      name: checkout.fields.name,
      money: checkout.fields.money,
      out_trade_no: checkout.orderId,
      trade_no: "zpay-trade-ledger-down",
      param: checkout.authorization,
      trade_status: "TRADE_SUCCESS",
      type: checkout.fields.type,
      sign_type: "MD5",
    };
    callback.sign = signZpayParameters(callback, "merchant-secret");

    await expect(paymentGateway.verifyCallback(callback)).rejects.toMatchObject(
      {
        code: "PAYMENT_LEDGER_UNAVAILABLE",
        status: 503,
      },
    );
    expect(receiptStore.record).toHaveBeenCalledTimes(1);
  });

  it("keeps concurrent callbacks from two randomized tokens idempotent at the website boundary", async () => {
    const providerOrder = {
      code: 1,
      status: 1,
      pid: "merchant123",
      out_trade_no: "202607221800001234567890",
      trade_no: "zpay-trade-concurrent-replay",
      type: "alipay",
      name: "FrontMind GEO 问题现状监控（2个平台，每平台5次）",
      money: "4.00",
      addtime: "2026-07-22 18:00:00",
      endtime: "2026-07-22 18:05:00",
    };
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(JSON.stringify(providerOrder), {
          headers: { "content-type": "application/json" },
        }),
    );
    const receiptStore = inMemoryReceiptStore();
    const paymentGateway = gateway(fetchMock, receiptStore);
    const checkouts = await Promise.all([
      paymentGateway.createCheckout({
        ...scope,
        platformIds: [...scope.platformIds],
      }),
      paymentGateway.createCheckout({
        ...scope,
        platformIds: [...scope.platformIds],
      }),
    ]);
    expect(checkouts[0].orderId).toBe(checkouts[1].orderId);
    expect(checkouts[0].authorization).not.toBe(checkouts[1].authorization);
    const callbacks = checkouts.map((checkout) => {
      const callback: Record<string, string> = {
        pid: checkout.fields.pid,
        name: checkout.fields.name,
        money: checkout.fields.money,
        out_trade_no: checkout.orderId,
        trade_no: "zpay-trade-concurrent-replay",
        param: checkout.authorization,
        trade_status: "TRADE_SUCCESS",
        type: checkout.fields.type,
        sign_type: "MD5",
      };
      callback.sign = signZpayParameters(callback, "merchant-secret");
      return callback;
    });

    await expect(
      Promise.all(callbacks.map((item) => paymentGateway.verifyCallback(item))),
    ).resolves.toEqual([
      expect.objectContaining({
        status: "paid",
        tradeNo: "zpay-trade-concurrent-replay",
      }),
      expect.objectContaining({
        status: "paid",
        tradeNo: "zpay-trade-concurrent-replay",
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(receiptStore.record).toHaveBeenCalledTimes(2);
  });

  it("uses the provider order creation time so recreating checkout cannot extend automatic fulfillment", async () => {
    let now = new Date("2026-07-22T10:00:00.000Z");
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 1,
          status: 1,
          pid: "merchant123",
          out_trade_no: "202607221800001234567890",
          trade_no: "zpay-trade-original-window",
          type: "alipay",
          name: "FrontMind GEO 问题现状监控（2个平台，每平台5次）",
          money: "4.00",
          addtime: "2026-07-22 18:00:00",
          endtime: "2026-07-23 18:31:00",
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    const paymentGateway = new ZpayGeoPaymentGateway(
      {
        pid: "merchant123",
        key: "merchant-secret",
        publicBaseUrl: "https://www.frontmind.net",
      },
      codec,
      {
        receiptStore: inMemoryReceiptStore(),
        fetchImpl: fetchMock,
        now: () => now,
        orderId: () => "202607221800001234567890",
      },
    );
    const original = await paymentGateway.createCheckout({
      ...scope,
      platformIds: [...scope.platformIds],
    });
    now = new Date("2026-07-24T10:00:00.000Z");
    const recreated = await paymentGateway.createCheckout({
      ...scope,
      platformIds: [...scope.platformIds],
    });
    expect(recreated.orderId).toBe(original.orderId);

    await expect(
      paymentGateway.getStatus({
        authorization: recreated.authorization,
        ownerSessionId: scope.ownerSessionId,
        projectId: scope.projectId,
        questionId: scope.questionId,
        platformIds: [...scope.platformIds],
        expectedAmountFen: scope.expectedAmountFen,
      }),
    ).resolves.toMatchObject({
      status: "review_required",
      tradeNo: "zpay-trade-original-window",
    });
  });

  it("records late payment for review and bounds automatic token recovery", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-07-22T10:00:00.000Z"));
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: 1,
            status: 1,
            pid: "merchant123",
            out_trade_no: "202607221800001234567890",
            trade_no: "zpay-late-trade-1",
            type: "alipay",
            name: "FrontMind GEO 问题现状监控（2个平台，每平台5次）",
            money: "4.00",
            addtime: "2026-07-22 18:00:00",
            endtime: "2026-07-23 18:31:00",
          }),
          { headers: { "content-type": "application/json" } },
        ),
      );
      const paymentGateway = gateway(
        fetchMock,
        inMemoryReceiptStore(),
        () => new Date(),
      );
      const checkout = await paymentGateway.createCheckout({
        ...scope,
        platformIds: [...scope.platformIds],
      });
      const verification = {
        authorization: checkout.authorization,
        ownerSessionId: scope.ownerSessionId,
        projectId: scope.projectId,
        questionId: scope.questionId,
        platformIds: [...scope.platformIds],
        expectedAmountFen: scope.expectedAmountFen,
      };

      vi.setSystemTime(new Date("2026-07-23T10:31:00.000Z"));
      await expect(
        paymentGateway.getStatus(verification),
      ).resolves.toMatchObject({
        status: "review_required",
        orderId: checkout.orderId,
        tradeNo: "zpay-late-trade-1",
      });
      await expect(paymentGateway.verify(verification)).rejects.toMatchObject({
        code: "PAYMENT_REVIEW_REQUIRED",
        status: 409,
      });

      vi.setSystemTime(new Date("2027-07-23T10:00:00.001Z"));
      await expect(
        paymentGateway.getStatus(verification),
      ).rejects.toMatchObject({
        code: "PAYMENT_RECONCILIATION_EXPIRED",
        status: 410,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("monitoring payment boundary", () => {
  it("prices overseas monitoring services at exactly twice domestic", () => {
    expect(geoServiceMonthlyPriceFen("product_scenario", "domestic")).toBe(
      150_000,
    );
    expect(geoServiceMonthlyPriceFen("product_scenario", "overseas")).toBe(
      300_000,
    );
    expect(geoServiceMonthlyPriceFen("reputation", "overseas")).toBe(400_000);
    expect(geoServiceMonthlyPriceFen("competitor_comparison", "overseas")).toBe(
      400_000,
    );
  });

  it("fails closed until the signed ZPAY gateway is configured", async () => {
    await expect(
      new UnconfiguredGeoPaymentVerifier().verify({
        authorization: "client-claimed-paid",
        ownerSessionId: "session-1",
        projectId: "project-1",
        questionId: "question-1",
        platformIds: ["doubao"],
        expectedAmountFen: 200,
      }),
    ).rejects.toMatchObject({
      code: "PAYMENT_NOT_CONFIGURED",
      status: 503,
    });
  });

  it("fails closed for every service payment operation until ZPAY is configured", async () => {
    const paymentGateway = new UnconfiguredGeoPaymentVerifier();
    const checkoutInput = { ...productServiceScope };
    const verificationInput = {
      authorization: "client-claimed-paid",
      ownerSessionId: productServiceScope.ownerSessionId,
      projectId: productServiceScope.projectId,
      questionId: productServiceScope.questionId,
      category: productServiceScope.category,
      expectedAmountFen: productServiceScope.expectedAmountFen,
    };

    await expect(
      paymentGateway.createServiceCheckout(checkoutInput),
    ).rejects.toMatchObject({
      code: "PAYMENT_NOT_CONFIGURED",
      status: 503,
    });
    await expect(
      paymentGateway.getServiceStatus(verificationInput),
    ).rejects.toMatchObject({
      code: "PAYMENT_NOT_CONFIGURED",
      status: 503,
    });
    await expect(
      paymentGateway.verifyService(verificationInput),
    ).rejects.toMatchObject({
      code: "PAYMENT_NOT_CONFIGURED",
      status: 503,
    });
  });
});
