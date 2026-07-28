import { describe, expect, it, vi } from "vitest";

import {
  createGeoAccountProvisioner,
  createGeoKnowledgeImporter,
  createGeoManualServiceOrderAccountSubmitter,
  createGeoManualServiceOrderCreator,
  createGeoManualServiceOrderPaymentConfirmer,
  createGeoManualServiceOrderStatusReader,
  createGeoPaymentReceiptStore,
  createGeoProjectOrderRegistry,
  createGeoPurchaseProvisioner,
  createGeoPurchaseStatusReader,
  GeoAccountProvisioningError,
  GeoKnowledgeImportRequestV2Schema,
  GeoManualServiceOrderResponseSchema,
  GeoPurchaseProvisionRequestV2Schema,
  GeoPurchaseProvisionResponseV2Schema,
  isTrustedExternalAppUrl,
  type GeoAccountProvisionRequest,
  type GeoManualServiceOrderCreateRequest,
  type GeoPurchaseProvisionRequestV2,
} from "./provisioning";

describe("provisioning URL trust boundary", () => {
  it("accepts only public credential-free HTTPS app links", () => {
    expect(
      isTrustedExternalAppUrl(
        "https://dashboard.frontmind.net/workspaces/acme",
      ),
    ).toBe(true);
    for (const url of [
      "https://user:secret@dashboard.frontmind.net/workspaces/acme",
      "http://dashboard.frontmind.net/workspaces/acme",
      "https://127.0.0.1/admin",
      "https://192.168.1.10/admin",
      "https://[::1]/admin",
      "https://agent.local/admin",
      "https://agent.internal/admin",
      "https://agent/admin",
    ]) {
      expect(isTrustedExternalAppUrl(url), url).toBe(false);
    }
  });

  it("rejects unsafe signing and workspace URLs in provider responses", () => {
    const unsafeSigning = GeoManualServiceOrderResponseSchema.safeParse({
      schemaVersion: 1,
      order: {
        reference: "manual-order-001",
        projectId: "project-20260724",
        status: "signature_required",
        amountFen: 200_000,
        signingUrl: "https://user:secret@sign.example.com/task/001",
        updatedAt: "2026-07-24T08:00:00.000Z",
      },
    });
    const unsafeWorkspace = GeoPurchaseProvisionResponseV2Schema.safeParse({
      schemaVersion: 2,
      purchase: {
        reference: "provision-001",
        projectId: "project-20260724",
        orderId: "FM202607240001",
        status: "provisioned",
        updatedAt: "2026-07-24T08:00:00.000Z",
      },
      account: {
        workspaceUrl: "https://192.168.1.10/admin",
      },
    });

    expect(unsafeSigning.success).toBe(false);
    expect(unsafeWorkspace.success).toBe(false);
  });
});

describe("website to Agent project-order registry", () => {
  const serviceToken = "project-order-registry-token-20260728-secure";
  const env = {
    FRONTMIND_AGENT_PROVISIONING_URL:
      "http://127.0.0.1:3001/api/internal/provisioning",
    FRONTMIND_PROVISIONING_SERVICE_TOKEN: serviceToken,
  } as NodeJS.ProcessEnv;
  const order = {
    orderId: "zpay-order-20260728",
    projectId: "project-20260728",
    purchaseType: "monitoring",
    amountFen: 400,
    authorizationDigest: "A".repeat(64),
    state: "pending",
    checkoutExpiresAt: "2026-07-29T03:45:00.000Z",
    eventAt: "2026-07-28T03:45:00.000Z",
  } as const;
  const normalizedOrder = {
    ...order,
    authorizationDigest: "a".repeat(64),
  };

  it("uses authenticated strict PUT and project-scoped GET contracts", async () => {
    const fetchImpl = vi.fn(async (url: URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("x-frontmind-provisioning-token")).toBe(serviceToken);
      expect(headers.get("accept")).toBe("application/json");
      if (url.pathname.endsWith("/project-orders/ready")) {
        expect(init?.method).toBe("GET");
        return new Response(JSON.stringify({ schemaVersion: 1, ready: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      if (init?.method === "PUT") {
        expect(url.pathname).toBe(
          `/api/internal/provisioning/project-orders/${order.orderId}`,
        );
        expect(headers.get("content-type")).toBe("application/json");
        expect(JSON.parse(String(init.body))).toEqual({
          schemaVersion: 1,
          order: normalizedOrder,
        });
        return new Response(
          JSON.stringify({ schemaVersion: 1, order: normalizedOrder }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }
      if (init?.method === "POST") {
        expect(url.pathname).toBe(
          `/api/internal/provisioning/project-order-intents/intent-20260728/commit`,
        );
        expect(JSON.parse(String(init.body))).toEqual({
          schemaVersion: 1,
          order: normalizedOrder,
        });
        return new Response(
          JSON.stringify({ schemaVersion: 1, order: normalizedOrder }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      expect(init?.method).toBe("GET");
      expect(url.pathname).toBe(
        `/api/internal/provisioning/project-orders/projects/${order.projectId}`,
      );
      return new Response(
        JSON.stringify({
          schemaVersion: 1,
          projectId: order.projectId,
          blockDeletion: true,
          orders: [normalizedOrder],
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    });
    const registry = createGeoProjectOrderRegistry({ env, fetchImpl });

    await expect(registry.assertReady()).resolves.toBeUndefined();
    await expect(registry.upsert(order)).resolves.toEqual(normalizedOrder);
    await expect(
      registry.commitIntent("intent-20260728", order),
    ).resolves.toEqual(normalizedOrder);
    await expect(registry.findByProject(order.projectId)).resolves.toEqual({
      schemaVersion: 1,
      projectId: order.projectId,
      blockDeletion: true,
      orders: [normalizedOrder],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("rejects inconsistent deletion decisions and mismatched write envelopes", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schemaVersion: 1,
            order: { ...normalizedOrder, projectId: "another-project" },
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schemaVersion: 1,
            projectId: order.projectId,
            blockDeletion: false,
            orders: [normalizedOrder],
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      );
    const registry = createGeoProjectOrderRegistry({ env, fetchImpl });

    await expect(registry.upsert(order)).rejects.toMatchObject({
      code: "PROJECT_ORDER_REGISTRY_MISMATCH",
      status: 502,
    } satisfies Partial<GeoAccountProvisioningError>);
    await expect(registry.findByProject(order.projectId)).rejects.toMatchObject(
      {
        code: "INVALID_PROVISIONING_RESPONSE",
        status: 502,
      } satisfies Partial<GeoAccountProvisioningError>,
    );
  });
});

describe("website to Agent payment receipt ledger", () => {
  const rawAuthorization =
    "v1.raw-payment-authorization-that-must-never-leave-the-payment-gateway";
  const ledgerServiceToken = "s3cure-ledger-credential-20260728-abcdef";
  const receipt = {
    orderId: "202607281234567890123456",
    tradeNo: "zpay-trade-20260728",
    amountFen: 400,
    paidAt: "2026-07-28T03:45:00.000Z",
    purchaseType: "monitoring",
    reviewRequired: false,
    scopeHash: "A".repeat(64),
    authorizationDigest: "B".repeat(64),
  } as const;
  const normalizedReceipt = {
    ...receipt,
    scopeHash: "a".repeat(64),
    authorizationDigest: "b".repeat(64),
  };
  const ledgerEnv = {
    FRONTMIND_AGENT_PROVISIONING_URL:
      "http://127.0.0.1:3001/api/internal/provisioning/?discarded=1#fragment",
    FRONTMIND_PROVISIONING_SERVICE_TOKEN: ledgerServiceToken,
  } as NodeJS.ProcessEnv;

  it("uses exact authenticated URLs and sends only normalized receipt facts", async () => {
    const fetchImpl = vi.fn(async (url: URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(url.username).toBe("");
      expect(url.password).toBe("");
      expect(url.toString()).not.toContain(rawAuthorization);
      expect(url.toString()).not.toContain(ledgerServiceToken);
      expect(headers.get("accept")).toBe("application/json");
      expect(headers.get("x-frontmind-provisioning-token")).toBe(
        ledgerServiceToken,
      );
      expect(JSON.stringify(init?.headers)).not.toContain(rawAuthorization);

      if (url.pathname.endsWith("/payment-receipts/ready")) {
        expect(url.toString()).toBe(
          "http://127.0.0.1:3001/api/internal/provisioning/payment-receipts/ready",
        );
        expect(init?.method).toBe("GET");
        expect(init?.body).toBeUndefined();
        return new Response(JSON.stringify({ schemaVersion: 1, ready: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (init?.method === "POST") {
        expect(url.toString()).toBe(
          "http://127.0.0.1:3001/api/internal/provisioning/payment-receipts",
        );
        expect(headers.get("content-type")).toBe("application/json");
        expect(headers.get("idempotency-key")).toBe(
          `geo-payment-receipt:${receipt.orderId}:${"b".repeat(16)}:v1`,
        );
        const body = JSON.parse(String(init.body));
        expect(body).toEqual({
          schemaVersion: 1,
          receipt: normalizedReceipt,
        });
        expect(JSON.stringify(body)).not.toContain(rawAuthorization);
        expect(body.receipt).not.toHaveProperty("authorization");
        expect(JSON.stringify(body)).not.toContain(ledgerServiceToken);
        return new Response(
          JSON.stringify({
            schemaVersion: 1,
            receipt: normalizedReceipt,
          }),
          {
            status: 201,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      expect(init?.method).toBe("GET");
      expect(init?.body).toBeUndefined();
      expect(url.pathname).toBe(
        `/api/internal/provisioning/payment-receipts/${receipt.orderId}`,
      );
      expect(url.searchParams.get("scopeHash")).toBe("a".repeat(64));
      expect(url.searchParams.get("authorizationDigest")).toBe("b".repeat(64));
      expect(Array.from(url.searchParams.keys())).toEqual([
        "scopeHash",
        "authorizationDigest",
      ]);
      return new Response(
        JSON.stringify({
          schemaVersion: 1,
          receipt: normalizedReceipt,
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    });
    const store = createGeoPaymentReceiptStore({
      env: ledgerEnv,
      fetchImpl,
    });

    await expect(store.assertReady()).resolves.toBeUndefined();
    await expect(store.record(receipt)).resolves.toEqual(normalizedReceipt);
    await expect(
      store.find({
        orderId: receipt.orderId,
        scopeHash: receipt.scopeHash,
        authorizationDigest: receipt.authorizationDigest,
      }),
    ).resolves.toEqual(normalizedReceipt);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("rejects unknown or path-shaping request fields before any network call", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const store = createGeoPaymentReceiptStore({
      env: ledgerEnv,
      fetchImpl,
    });

    await expect(
      store.record({
        ...receipt,
        authorization: rawAuthorization,
      } as never),
    ).rejects.toMatchObject({ name: "ZodError" });
    await expect(
      store.find({
        orderId: "../../admin",
        scopeHash: receipt.scopeHash,
        authorizationDigest: receipt.authorizationDigest,
      }),
    ).rejects.toMatchObject({ name: "ZodError" });
    await expect(
      store.find({
        orderId: receipt.orderId,
        scopeHash: receipt.scopeHash,
        authorizationDigest: receipt.authorizationDigest,
        authorization: rawAuthorization,
      } as never),
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects secret-bearing or otherwise non-strict ledger responses", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          schemaVersion: 1,
          receipt: {
            ...normalizedReceipt,
            authorization: rawAuthorization,
          },
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    const store = createGeoPaymentReceiptStore({
      env: ledgerEnv,
      fetchImpl,
    });

    const error = await store.record(receipt).catch((caught) => caught);
    expect(error).toMatchObject({
      code: "INVALID_PROVISIONING_RESPONSE",
      status: 502,
      message: "支付回执账本返回了无效写入结果",
    } satisfies Partial<GeoAccountProvisioningError>);
    expect(String(error)).not.toContain(rawAuthorization);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects a well-formed receipt response when it is not bound to the exact request", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schemaVersion: 1,
            receipt: {
              ...normalizedReceipt,
              tradeNo: "zpay-trade-different",
            },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schemaVersion: 1,
            receipt: {
              ...normalizedReceipt,
              authorizationDigest: "c".repeat(64),
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      );
    const store = createGeoPaymentReceiptStore({
      env: ledgerEnv,
      fetchImpl,
    });

    await expect(store.record(receipt)).rejects.toMatchObject({
      code: "PAYMENT_RECEIPT_MISMATCH",
      status: 502,
    } satisfies Partial<GeoAccountProvisioningError>);
    await expect(
      store.find({
        orderId: receipt.orderId,
        scopeHash: receipt.scopeHash,
        authorizationDigest: receipt.authorizationDigest,
      }),
    ).rejects.toMatchObject({
      code: "PAYMENT_RECEIPT_MISMATCH",
      status: 502,
    } satisfies Partial<GeoAccountProvisioningError>);
  });

  it("maps only the explicit not-found contract to an empty lookup", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: "PAYMENT_RECEIPT_NOT_FOUND",
              message: "支付回执不存在",
            },
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: "NOT_FOUND", message: "接口不存在" },
          }),
          {
            status: 404,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    const store = createGeoPaymentReceiptStore({
      env: ledgerEnv,
      fetchImpl,
    });
    const lookup = {
      orderId: receipt.orderId,
      scopeHash: receipt.scopeHash,
      authorizationDigest: receipt.authorizationDigest,
    };

    await expect(store.find(lookup)).resolves.toBeUndefined();
    await expect(store.find(lookup)).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
      message: "接口不存在",
    } satisfies Partial<GeoAccountProvisioningError>);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("preserves an immutable-receipt conflict without retrying or weakening it", async () => {
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: "PAYMENT_RECEIPT_CONFLICT",
            message: "同一订单已存在不同的支付事实",
          },
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    const store = createGeoPaymentReceiptStore({
      env: ledgerEnv,
      fetchImpl,
    });

    await expect(store.record(receipt)).rejects.toMatchObject({
      code: "PAYMENT_RECEIPT_CONFLICT",
      status: 409,
      message: "同一订单已存在不同的支付事实",
    } satisfies Partial<GeoAccountProvisioningError>);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails closed on missing credentials and a non-strict readiness result", async () => {
    const unauthenticatedFetch = vi.fn<typeof fetch>();
    const unauthenticatedStore = createGeoPaymentReceiptStore({
      env: {
        FRONTMIND_AGENT_PROVISIONING_URL:
          "http://127.0.0.1:3001/api/internal/provisioning",
      } as NodeJS.ProcessEnv,
      fetchImpl: unauthenticatedFetch,
    });

    await expect(unauthenticatedStore.assertReady()).rejects.toMatchObject({
      code: "PROVISIONING_NOT_CONFIGURED",
      status: 503,
    } satisfies Partial<GeoAccountProvisioningError>);
    expect(unauthenticatedFetch).not.toHaveBeenCalled();

    const invalidReadyStore = createGeoPaymentReceiptStore({
      env: ledgerEnv,
      fetchImpl: vi.fn(async () => {
        return new Response(
          JSON.stringify({
            schemaVersion: 1,
            ready: true,
            authorization: rawAuthorization,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }),
    });
    await expect(invalidReadyStore.assertReady()).rejects.toMatchObject({
      code: "INVALID_PROVISIONING_RESPONSE",
      status: 502,
      message: "支付回执账本返回了无效就绪结果",
    } satisfies Partial<GeoAccountProvisioningError>);

    const credentialedUrlFetch = vi.fn<typeof fetch>();
    const credentialedUrlStore = createGeoPaymentReceiptStore({
      env: {
        FRONTMIND_AGENT_PROVISIONING_URL:
          "https://user:password@dashboard.frontmind.net/api/internal/provisioning",
        FRONTMIND_PROVISIONING_SERVICE_TOKEN: ledgerServiceToken,
      } as NodeJS.ProcessEnv,
      fetchImpl: credentialedUrlFetch,
    });
    await expect(credentialedUrlStore.assertReady()).rejects.toMatchObject({
      code: "PROVISIONING_NOT_CONFIGURED",
      status: 503,
    } satisfies Partial<GeoAccountProvisioningError>);
    expect(credentialedUrlFetch).not.toHaveBeenCalled();
  });
});

const request: GeoAccountProvisionRequest = {
  schemaVersion: 1,
  project: {
    id: "project-20260724",
    companyName: "验收企业",
  },
  order: {
    id: "FM202607240001",
    tradeNo: "zpay-202607240001",
    status: "paid",
    amountFen: 200_000,
    paidAt: "2026-07-24T08:00:00.000Z",
    serviceCategory: "reputation",
    questionId: "reputation-01",
    question: "验收企业的方案适合哪些业务场景？",
  },
  contract: {
    id: "esign-contract-202607240001",
    status: "signed",
    projectId: "project-20260724",
    orderId: "FM202607240001",
    questionId: "reputation-01",
    templateVersion: "2026.07",
    documentSha256: "a".repeat(64),
    signedAt: "2026-07-24T08:05:00.000Z",
    signatoryId: "esign-signatory-1",
  },
  account: {
    username: "cuhksz.geo",
    password: "StrongPassword123",
    displayName: "验收企业",
  },
};

const env = {
  FRONTMIND_AGENT_PROVISIONING_URL:
    "http://127.0.0.1:3001/api/internal/provisioning",
  FRONTMIND_PROVISIONING_SERVICE_TOKEN: "a".repeat(48),
} as NodeJS.ProcessEnv;

const purchaseRequest: GeoPurchaseProvisionRequestV2 = {
  schemaVersion: 2,
  project: {
    id: "project-20260724",
    companyName: "验收企业",
  },
  order: {
    id: "FM202607240001",
    tradeNo: "zpay-202607240001",
    status: "paid",
    amountFen: 200_000,
    paidAt: "2026-07-24T08:00:00.000Z",
  },
  service: {
    planCode: "basic",
    serviceDays: 30,
    startsAt: "2026-07-24T08:00:00.000Z",
    endsAt: "2026-08-23T08:00:00.000Z",
    purchasedQuestion: {
      id: "reputation-01",
      category: "reputation",
      question: "验收企业的方案适合哪些业务场景？",
    },
  },
  contract: {
    id: "basic-contract:FM202607240001",
    status: "pending_admin_confirmation",
    projectId: "project-20260724",
    orderId: "FM202607240001",
    questionId: "reputation-01",
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
  account: {
    mode: "create",
    username: "cuhksz.geo",
    displayName: "验收企业",
  },
};

const manualOrderRequest: GeoManualServiceOrderCreateRequest = {
  schemaVersion: 1,
  project: {
    id: "project-20260724",
    companyName: "深圳星辰科技有限公司",
  },
  service: {
    planCode: "basic",
    serviceDays: 30,
    purchasedQuestion: {
      id: "reputation-01",
      category: "reputation",
      question: "深圳星辰科技有限公司是一家怎样的企业？",
    },
  },
  contract: {
    templateVersion: "basic-2026.07-v1",
    profile: {
      legalName: "深圳星辰科技有限公司",
      creditCode: "91440300MA5F12345X",
      address: "深圳市南山区科技园一号",
      signatoryName: "张三",
      signatoryTitle: "运营负责人",
      mobile: "13800138000",
      email: "contracts@example.com",
      authorized: true,
    },
  },
};

function purchaseResponse(
  status: "pending_confirmation" | "provisioned" | "failed",
) {
  return {
    schemaVersion: 2,
    purchase: {
      reference: "purchase-reference-20260724",
      projectId: purchaseRequest.project.id,
      orderId: purchaseRequest.order.id,
      status,
      updatedAt: "2026-07-24T08:06:00.000Z",
      retryable: status === "failed",
    },
    ...(status === "provisioned"
      ? {
          account: {
            username: "cuhksz.geo",
            displayName: "验收企业",
            accountSetupUrl:
              "https://dashboard.frontmind.net/account/setup/one-time",
          },
        }
      : {}),
  };
}

describe("website to Agent account provisioner", () => {
  it("uses the signed order as a stable idempotency boundary", async () => {
    const fetchImpl = vi.fn(async (_url: URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        "Idempotency-Key": "geo-service:FM202607240001:account-v1",
        "x-frontmind-provisioning-token": "a".repeat(48),
      });
      expect(JSON.parse(String(init?.body))).not.toHaveProperty("role");
      return new Response(
        JSON.stringify({
          provision: {
            id: "provision-1",
            projectId: request.project.id,
            orderId: request.order.id,
            contractId: request.contract.id,
            status: "completed",
            completedAt: "2026-07-24T08:06:00.000Z",
          },
          user: {
            id: 21,
            username: "cuhksz.geo",
            displayName: request.project.companyName,
            role: "user",
            isActive: true,
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    });
    const provision = createGeoAccountProvisioner({ env, fetchImpl });

    const result = await provision(request);

    expect(result.user).toMatchObject({
      username: "cuhksz.geo",
      role: "user",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the dedicated service token is missing", async () => {
    const provision = createGeoAccountProvisioner({
      env: {
        FRONTMIND_AGENT_PROVISIONING_URL:
          "http://127.0.0.1:3001/api/internal/provisioning",
      } as NodeJS.ProcessEnv,
      fetchImpl: vi.fn(),
    });

    await expect(provision(request)).rejects.toMatchObject({
      code: "PROVISIONING_NOT_CONFIGURED",
      status: 503,
    } satisfies Partial<GeoAccountProvisioningError>);
  });

  it("does not permit an insecure remote provisioning URL", async () => {
    const provision = createGeoAccountProvisioner({
      env: {
        ...env,
        FRONTMIND_AGENT_PROVISIONING_URL:
          "http://agent.frontmind.example/api/internal/provisioning",
      } as NodeJS.ProcessEnv,
      fetchImpl: vi.fn(),
    });

    await expect(provision(request)).rejects.toMatchObject({
      code: "PROVISIONING_NOT_CONFIGURED",
      status: 503,
    } satisfies Partial<GeoAccountProvisioningError>);
  });

  it("permits only an exact allowlisted Docker hostname over internal HTTP", async () => {
    const fetchImpl = vi.fn(async (url: URL) => {
      expect(url.toString()).toBe(
        "http://frontmind-dashboard:3001/api/internal/provisioning/users",
      );
      return new Response(
        JSON.stringify({
          provision: {
            id: "provision-1",
            projectId: request.project.id,
            orderId: request.order.id,
            contractId: request.contract.id,
            status: "completed",
            completedAt: "2026-07-24T08:06:00.000Z",
          },
          user: {
            id: 21,
            username: "cuhksz.geo",
            displayName: request.project.companyName,
            role: "user",
            isActive: true,
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    });
    const provision = createGeoAccountProvisioner({
      env: {
        ...env,
        FRONTMIND_AGENT_PROVISIONING_URL:
          "http://frontmind-dashboard:3001/api/internal/provisioning",
        FRONTMIND_AGENT_INTERNAL_HTTP_HOSTS: "frontmind-dashboard",
      } as NodeJS.ProcessEnv,
      fetchImpl,
    });

    await expect(provision(request)).resolves.toMatchObject({
      user: { username: "cuhksz.geo" },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed internal HTTP allowlist entries", async () => {
    const fetchImpl = vi.fn();
    const provision = createGeoAccountProvisioner({
      env: {
        ...env,
        FRONTMIND_AGENT_PROVISIONING_URL:
          "http://frontmind-dashboard:3001/api/internal/provisioning",
        FRONTMIND_AGENT_INTERNAL_HTTP_HOSTS:
          "http://frontmind-dashboard:3001,*.internal",
      } as NodeJS.ProcessEnv,
      fetchImpl,
    });

    await expect(provision(request)).rejects.toMatchObject({
      code: "PROVISIONING_NOT_CONFIGURED",
      status: 503,
    } satisfies Partial<GeoAccountProvisioningError>);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("submits a strict v2 basic purchase without password or userId", async () => {
    const fetchImpl = vi.fn(async (url: URL, init?: RequestInit) => {
      expect(url.toString()).toBe(
        "http://127.0.0.1:3001/api/internal/provisioning/purchases",
      );
      expect(init?.headers).toMatchObject({
        "Idempotency-Key": "geo-basic:FM202607240001:purchase-v2",
      });
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual(purchaseRequest);
      expect(JSON.stringify(body)).not.toMatch(/password|userId/);
      return new Response(
        JSON.stringify(purchaseResponse("pending_confirmation")),
        {
          status: 202,
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    await expect(
      createGeoPurchaseProvisioner({ env, fetchImpl })(purchaseRequest),
    ).resolves.toMatchObject({
      purchase: { status: "pending_confirmation" },
    });
  });

  it("binds an existing account only through the one-time purchase intent", async () => {
    const fetchImpl = vi.fn(async (_url: URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.account).toEqual({
        mode: "bind_existing",
        purchaseIntent: "purchase-intent-one-time-123",
      });
      expect(JSON.stringify(body)).not.toMatch(/password|userId|\"username\"/);
      return new Response(
        JSON.stringify(purchaseResponse("pending_confirmation")),
        {
          status: 202,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    const provision = createGeoPurchaseProvisioner({ env, fetchImpl });

    await provision({
      ...purchaseRequest,
      account: {
        mode: "bind_existing",
        purchaseIntent: "purchase-intent-one-time-123",
      },
    });
  });

  it("creates, polls, and confirms a manual order through authenticated idempotent calls", async () => {
    const fetchImpl = vi.fn(async (url: URL, init?: RequestInit) => {
      const pathname = url.pathname;
      if (pathname.endsWith("/manual-orders")) {
        expect(init?.method).toBe("POST");
        expect(init?.headers).toMatchObject({
          "Idempotency-Key":
            "geo-manual:project-20260724:reputation-01:contract-v1",
          "x-frontmind-provisioning-token": "a".repeat(48),
        });
        expect(JSON.parse(String(init?.body))).toEqual(manualOrderRequest);
        return new Response(
          JSON.stringify({
            schemaVersion: 1,
            order: {
              reference: "manual-order-20260724",
              projectId: manualOrderRequest.project.id,
              status: "pending_admin",
              amountFen: 200_000,
              updatedAt: "2026-07-24T08:01:00.000Z",
            },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }
      if (pathname.endsWith("/status")) {
        expect(init?.method).toBe("GET");
        return new Response(
          JSON.stringify({
            schemaVersion: 1,
            order: {
              reference: "manual-order-20260724",
              projectId: manualOrderRequest.project.id,
              status: "payment_required",
              amountFen: 200_000,
              contractId: "contract-20260724",
              signingUrl: "https://sign.example.com/contract-20260724",
              signedAt: "2026-07-24T08:30:00.000Z",
              updatedAt: "2026-07-24T08:30:00.000Z",
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      if (pathname.endsWith("/payment")) {
        expect(init?.headers).toMatchObject({
          "Idempotency-Key":
            "geo-manual:manual-order-20260724:zpay-order-20260724:payment-v1",
        });
        expect(JSON.parse(String(init?.body))).toEqual({
          schemaVersion: 1,
          payment: {
            orderId: "zpay-order-20260724",
            tradeNo: "zpay-trade-20260724",
            amountFen: 200_000,
            paidAt: "2026-07-24T08:35:00.000Z",
          },
        });
        return new Response(
          JSON.stringify({
            schemaVersion: 1,
            order: {
              reference: "manual-order-20260724",
              projectId: manualOrderRequest.project.id,
              status: "account_setup_required",
              amountFen: 200_000,
              contractId: "contract-20260724",
              signedAt: "2026-07-24T08:30:00.000Z",
              updatedAt: "2026-07-24T08:35:00.000Z",
            },
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }
      expect(pathname.endsWith("/account")).toBe(true);
      expect(init?.headers).toMatchObject({
        "Idempotency-Key": "geo-manual:manual-order-20260724:account-v1",
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        schemaVersion: 1,
        account: {
          mode: "bind_existing",
          purchaseIntent: "one-time-purchase-intent-20260724",
        },
      });
      return new Response(
        JSON.stringify({
          schemaVersion: 1,
          order: {
            reference: "manual-order-20260724",
            projectId: manualOrderRequest.project.id,
            status: "active",
            amountFen: 200_000,
            contractId: "contract-20260724",
            signedAt: "2026-07-24T08:30:00.000Z",
            provisioningReference: "purchase-reference-20260724",
            updatedAt: "2026-07-24T08:36:00.000Z",
          },
          account: {
            username: "existing.user",
            displayName: "Existing User",
            workspaceUrl: "https://dashboard.frontmind.net/",
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    });

    const created = await createGeoManualServiceOrderCreator({
      env,
      fetchImpl,
    })(manualOrderRequest);
    expect(created.order.status).toBe("pending_admin");

    const polled = await createGeoManualServiceOrderStatusReader({
      env,
      fetchImpl,
    })("manual-order-20260724");
    expect(polled.order).toMatchObject({
      status: "payment_required",
      contractId: "contract-20260724",
    });

    const confirmed = await createGeoManualServiceOrderPaymentConfirmer({
      env,
      fetchImpl,
    })("manual-order-20260724", {
      schemaVersion: 1,
      payment: {
        orderId: "zpay-order-20260724",
        tradeNo: "zpay-trade-20260724",
        amountFen: 200_000,
        paidAt: "2026-07-24T08:35:00.000Z",
      },
    });
    expect(confirmed.order.status).toBe("account_setup_required");

    const accountSubmitted = await createGeoManualServiceOrderAccountSubmitter({
      env,
      fetchImpl,
    })("manual-order-20260724", {
      schemaVersion: 1,
      account: {
        mode: "bind_existing",
        purchaseIntent: "one-time-purchase-intent-20260724",
      },
    });
    expect(accountSubmitted.order.status).toBe("active");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("forwards a new manual-order password only in the account request body", async () => {
    const password = "StrongPassword123";
    const fetchImpl = vi.fn(async (url: URL, init?: RequestInit) => {
      expect(url.pathname).toMatch(
        /\/manual-orders\/manual-order-20260724\/account$/,
      );
      expect(init?.headers).toMatchObject({
        "Idempotency-Key": "geo-manual:manual-order-20260724:account-v1",
        "x-frontmind-provisioning-token": "a".repeat(48),
      });
      expect(JSON.parse(String(init?.body))).toEqual({
        schemaVersion: 1,
        account: {
          mode: "create",
          username: "acme.geo",
          displayName: "Acme",
          password,
        },
      });
      expect(JSON.stringify(init?.headers)).not.toContain(password);
      return new Response(
        JSON.stringify({
          schemaVersion: 1,
          order: {
            reference: "manual-order-20260724",
            projectId: manualOrderRequest.project.id,
            status: "active",
            amountFen: 200_000,
            updatedAt: "2026-07-24T08:36:00.000Z",
          },
          account: {
            username: "acme.geo",
            displayName: "Acme",
            workspaceUrl: "https://dashboard.frontmind.net/",
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      );
    });

    const response = await createGeoManualServiceOrderAccountSubmitter({
      env,
      fetchImpl,
    })("manual-order-20260724", {
      schemaVersion: 1,
      account: {
        mode: "create",
        username: "acme.geo",
        displayName: "Acme",
        password,
      },
    });
    expect(response).toMatchObject({
      order: { status: "active" },
      account: { username: "acme.geo" },
    });
    expect(JSON.stringify(response)).not.toContain(password);
  });

  it("polls by opaque purchase reference and only accepts setup URLs after provisioning", async () => {
    const fetchImpl = vi.fn(async (url: URL, init?: RequestInit) => {
      expect(url.toString()).toBe(
        "http://127.0.0.1:3001/api/internal/provisioning/purchases/purchase-reference-20260724/status",
      );
      expect(init?.method).toBe("GET");
      return new Response(JSON.stringify(purchaseResponse("provisioned")), {
        headers: { "Content-Type": "application/json" },
      });
    });

    await expect(
      createGeoPurchaseStatusReader({ env, fetchImpl })(
        "purchase-reference-20260724",
      ),
    ).resolves.toMatchObject({
      purchase: { status: "provisioned" },
      account: {
        accountSetupUrl:
          "https://dashboard.frontmind.net/account/setup/one-time",
      },
    });
  });

  it("hands off the exact project-scoped knowledge contract with hash idempotency", async () => {
    const fetchImpl = vi.fn(async (url: URL, init?: RequestInit) => {
      expect(url.toString()).toBe(
        "http://127.0.0.1:3001/api/internal/provisioning/projects/project-20260724/knowledge-imports",
      );
      expect(init?.headers).toMatchObject({
        "Idempotency-Key": `geo-basic:project-20260724:${"a".repeat(64)}:${"b".repeat(64)}:knowledge-v2`,
      });
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({
        schemaVersion: 2,
        companyName: "验收企业",
        taskId: "task-website-kb-1",
        outputItemId: "output:0",
        fileId: "file-1",
        descriptorHash: "a".repeat(64),
        artifactSha256: "b".repeat(64),
        filename: "cuhksz_knowledge_base.zip",
      });
      expect(body).not.toHaveProperty("userId");
      return new Response(
        JSON.stringify({
          schemaVersion: 2,
          knowledgeImport: {
            id: "receipt-knowledge-1",
            projectId: "project-20260724",
            status: "ready",
            updatedAt: "2026-07-24T08:07:00.000Z",
            retryable: false,
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    });

    await expect(
      createGeoKnowledgeImporter({ env, fetchImpl })("project-20260724", {
        schemaVersion: 2,
        companyName: "验收企业",
        taskId: "task-website-kb-1",
        outputItemId: "output:0",
        fileId: "file-1",
        descriptorHash: "a".repeat(64),
        artifactSha256: "b".repeat(64),
        filename: "cuhksz_knowledge_base.zip",
      }),
    ).resolves.toMatchObject({
      knowledgeImport: { status: "ready" },
    });
  });

  it("fails closed on cross-scope, non-30-day, secret-bearing, or premature-link contracts", () => {
    expect(
      GeoPurchaseProvisionRequestV2Schema.safeParse({
        ...purchaseRequest,
        service: {
          ...purchaseRequest.service,
          endsAt: "2026-08-22T08:00:00.000Z",
        },
      }).success,
    ).toBe(false);
    expect(
      GeoPurchaseProvisionRequestV2Schema.safeParse({
        ...purchaseRequest,
        userId: 42,
      }).success,
    ).toBe(false);
    expect(
      GeoPurchaseProvisionResponseV2Schema.safeParse({
        ...purchaseResponse("pending_confirmation"),
        account: {
          accountSetupUrl:
            "https://dashboard.frontmind.net/account/setup/too-early",
        },
      }).success,
    ).toBe(false);
    expect(
      GeoKnowledgeImportRequestV2Schema.safeParse({
        schemaVersion: 2,
        companyName: "验收企业",
        taskId: "task-website-kb-1",
        outputItemId: "output:0",
        descriptorHash: "a".repeat(64),
        artifactSha256: "b".repeat(64),
        filename: "cuhksz_knowledge_base.zip",
        userId: 42,
      }).success,
    ).toBe(false);
  });
});
