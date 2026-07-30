import { z } from "zod";
import { GeoServiceContractProfileSchema } from "./schemas";

const PROVISIONING_TIMEOUT_MS = 15_000;
const PUBLIC_PLACEHOLDER_MARKERS = [
  "replace-with",
  "replace_with",
  "change-me",
  "change_me",
  "placeholder",
  "example",
  "your-token",
  "your_token",
];

const serviceCategorySchema = z.enum([
  "product_scenario",
  "reputation",
  "competitor_comparison",
]);
const isoDateTimeSchema = z.string().datetime({ offset: true });
const canonicalUtcDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine(
    (value) => {
      const timestamp = Date.parse(value);
      return (
        Number.isFinite(timestamp) &&
        new Date(timestamp).toISOString() === value
      );
    },
    { message: "timestamp must be canonical UTC with millisecond precision" },
  );
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/i);
const identifierSchema = z.string().trim().min(4).max(128);
const NON_PUBLIC_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".home",
  ".lan",
] as const;

function normalizedHostname(url: URL) {
  return url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
}

function isLoopbackHost(hostname: string) {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  );
}

function isIpLiteral(hostname: string) {
  return hostname.includes(":") || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname);
}

export function isTrustedExternalAppUrl(
  value: string,
  options: { allowLocalDevelopment?: boolean } = {},
) {
  try {
    const url = new URL(value);
    const hostname = normalizedHostname(url);
    if (!hostname || url.username || url.password) return false;
    if (isLoopbackHost(hostname)) {
      return Boolean(options.allowLocalDevelopment && url.protocol === "http:");
    }
    return Boolean(
      url.protocol === "https:" &&
        !isIpLiteral(hostname) &&
        hostname.includes(".") &&
        !NON_PUBLIC_HOST_SUFFIXES.some(
          (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
        ),
    );
  } catch {
    return false;
  }
}

const publicExternalAppUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((value) => isTrustedExternalAppUrl(value), {
    message: "external app URL must be a public credential-free HTTPS URL",
  });
const workspaceHandoffUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine(
    (value) =>
      isTrustedExternalAppUrl(value, {
        allowLocalDevelopment: process.env.NODE_ENV !== "production",
      }),
    {
      message:
        "workspace URL must be public HTTPS or an explicit local-development HTTP URL",
    },
  );

export const GeoAccountProvisionRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    project: z
      .object({
        id: z.string().trim().min(8).max(80),
        companyName: z.string().trim().min(1).max(200),
      })
      .strict(),
    order: z
      .object({
        id: z.string().trim().min(8).max(64),
        tradeNo: z.string().trim().min(1).max(128),
        status: z.literal("paid"),
        amountFen: z.number().int().positive().max(10_000_000),
        paidAt: z.string().datetime({ offset: true }),
        serviceCategory: serviceCategorySchema,
        questionId: z.string().trim().min(4).max(80),
        question: z.string().trim().min(4).max(500),
      })
      .strict(),
    contract: z
      .object({
        id: z.string().trim().min(8).max(128),
        status: z.literal("signed"),
        projectId: z.string().trim().min(8).max(80),
        orderId: z.string().trim().min(8).max(64),
        questionId: z.string().trim().min(4).max(80),
        templateVersion: z.string().trim().min(1).max(64),
        documentSha256: z.string().regex(/^[a-f0-9]{64}$/i),
        signedAt: z.string().datetime({ offset: true }),
        signatoryId: z.string().trim().min(1).max(128),
      })
      .strict(),
    account: z
      .object({
        username: z
          .string()
          .trim()
          .min(3)
          .max(64)
          .regex(/^[a-zA-Z0-9._-]+$/),
        password: z.string().min(6).max(128),
        displayName: z.string().trim().min(1).max(128),
      })
      .strict(),
  })
  .strict();

const GeoAccountProvisionResponseSchema = z
  .object({
    provision: z
      .object({
        id: z.string().min(1),
        projectId: z.string().min(1),
        orderId: z.string().min(1),
        contractId: z.string().min(1),
        status: z.literal("completed"),
        completedAt: z.string().datetime({ offset: true }),
      })
      .strict(),
    user: z
      .object({
        id: z.number().int().positive(),
        username: z.string().min(1),
        displayName: z.string().nullable(),
        role: z.literal("user"),
        isActive: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type GeoAccountProvisionRequest = z.infer<
  typeof GeoAccountProvisionRequestSchema
>;
export type GeoAccountProvisionResponse = z.infer<
  typeof GeoAccountProvisionResponseSchema
>;

export const GeoBasicPurchasedQuestionSchema = z
  .object({
    id: z.string().trim().min(4).max(80),
    category: serviceCategorySchema,
    question: z.string().trim().min(4).max(500),
  })
  .strict();

export const GeoBasicServiceContractSchema = z
  .object({
    planCode: z.literal("basic"),
    serviceDays: z.literal(30),
    startsAt: isoDateTimeSchema,
    endsAt: isoDateTimeSchema,
    purchasedQuestion: GeoBasicPurchasedQuestionSchema,
  })
  .strict()
  .superRefine(({ startsAt, endsAt }, context) => {
    if (
      Date.parse(endsAt) - Date.parse(startsAt) !==
      30 * 24 * 60 * 60 * 1000
    ) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "basic service must cover exactly 30 days",
      });
    }
  });

export const GeoSystemAdminContractEvidenceSchema = z
  .object({
    type: z.literal("system_admin_confirmation"),
    artifact: z
      .object({
        taskId: z.string().trim().min(1).max(128).nullable(),
        fileId: z.string().trim().min(1).max(128).nullable(),
        outputDescriptor: z.string().trim().min(1).max(500).nullable(),
        sha256: sha256Schema.nullable(),
      })
      .strict(),
  })
  .strict();

export const GeoPurchaseContractSchema = z
  .object({
    id: identifierSchema,
    status: z.literal("pending_admin_confirmation"),
    projectId: z.string().trim().min(8).max(80),
    orderId: z.string().trim().min(8).max(64),
    questionId: z.string().trim().min(4).max(80),
    templateVersion: z.string().trim().min(1).max(64),
    evidence: GeoSystemAdminContractEvidenceSchema,
  })
  .strict();

const GeoPurchaseAccountCreateSchema = z
  .object({
    mode: z.literal("create"),
    username: z
      .string()
      .trim()
      .min(3)
      .max(64)
      .regex(/^[a-zA-Z0-9._-]+$/),
    displayName: z.string().trim().min(2).max(128),
  })
  .strict();

const GeoPurchaseAccountBindingSchema = z
  .object({
    mode: z.literal("bind_existing"),
    purchaseIntent: z.string().trim().min(16).max(4096),
  })
  .strict();

export const GeoPurchaseAccountTargetSchema = z.discriminatedUnion("mode", [
  GeoPurchaseAccountCreateSchema,
  GeoPurchaseAccountBindingSchema,
]);

export const GeoPurchaseProvisionRequestV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    project: z
      .object({
        id: z.string().trim().min(8).max(80),
        companyName: z.string().trim().min(1).max(200),
      })
      .strict(),
    order: z
      .object({
        id: z.string().trim().min(8).max(64),
        tradeNo: z.string().trim().min(1).max(128),
        status: z.literal("paid"),
        amountFen: z.number().int().positive().max(10_000_000),
        paidAt: isoDateTimeSchema,
      })
      .strict(),
    service: GeoBasicServiceContractSchema,
    contract: GeoPurchaseContractSchema,
    account: GeoPurchaseAccountTargetSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const mismatches: Array<[string[], string]> = [
      [
        ["contract", "projectId"],
        value.contract.projectId === value.project.id
          ? ""
          : "contract projectId must match project.id",
      ],
      [
        ["contract", "orderId"],
        value.contract.orderId === value.order.id
          ? ""
          : "contract orderId must match order.id",
      ],
      [
        ["contract", "questionId"],
        value.contract.questionId === value.service.purchasedQuestion.id
          ? ""
          : "contract questionId must match purchased question",
      ],
      [
        ["service", "startsAt"],
        value.service.startsAt === value.order.paidAt
          ? ""
          : "service startsAt must match order paidAt",
      ],
    ];
    mismatches.forEach(([path, message]) => {
      if (message) context.addIssue({ code: "custom", path, message });
    });
  });

const purchaseStatusSchema = z.enum([
  "pending_confirmation",
  "provisioned",
  "failed",
]);

export const GeoPurchaseProvisionResponseV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    purchase: z
      .object({
        reference: identifierSchema,
        projectId: z.string().trim().min(8).max(80),
        orderId: z.string().trim().min(8).max(64),
        status: purchaseStatusSchema,
        updatedAt: isoDateTimeSchema,
        retryable: z.boolean().optional(),
        message: z.string().trim().min(1).max(1000).optional(),
        errorCode: z.string().trim().min(1).max(128).optional(),
      })
      .strict(),
    account: z
      .object({
        username: z.string().trim().min(1).max(64).optional(),
        displayName: z.string().trim().min(1).max(128).optional(),
        accountSetupUrl: workspaceHandoffUrlSchema.optional(),
        workspaceUrl: workspaceHandoffUrlSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.account?.accountSetupUrl &&
      value.purchase.status !== "provisioned"
    ) {
      context.addIssue({
        code: "custom",
        path: ["account", "accountSetupUrl"],
        message: "accountSetupUrl is only valid after provisioning",
      });
    }
  });

const GeoKnowledgeImportRequestBaseSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  taskId: z.string().trim().min(1).max(255),
  outputItemId: z.string().trim().min(1).max(255),
  fileId: z.string().trim().min(1).max(255).optional(),
  descriptorHash: sha256Schema,
  artifactSha256: sha256Schema,
  filename: z.string().trim().min(1).max(512),
});

export const GeoKnowledgeImportRequestV2Schema =
  GeoKnowledgeImportRequestBaseSchema.extend({
    schemaVersion: z.literal(2),
  }).strict();

export const GeoKnowledgeImportRequestV3Schema =
  GeoKnowledgeImportRequestBaseSchema.extend({
    schemaVersion: z.literal(3),
    archiveContractVersion: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    validationProfile: z.literal("website-lead-v1"),
    packageManifestSha256: sha256Schema,
  }).strict();

export const GeoKnowledgeImportRequestSchema = z.discriminatedUnion(
  "schemaVersion",
  [GeoKnowledgeImportRequestV2Schema, GeoKnowledgeImportRequestV3Schema],
);

const knowledgeImportStatusSchema = z.enum([
  "pending",
  "importing",
  "ready",
  "failed",
]);

const GeoKnowledgeImportResponsePayloadSchema = z
  .object({
    id: identifierSchema,
    projectId: z.string().trim().min(8).max(80),
    status: knowledgeImportStatusSchema,
    updatedAt: isoDateTimeSchema,
    retryable: z.boolean().optional(),
    message: z.string().trim().min(1).max(1000).optional(),
    workspaceUrl: workspaceHandoffUrlSchema.optional(),
  })
  .strict();

export const GeoKnowledgeImportResponseV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    knowledgeImport: GeoKnowledgeImportResponsePayloadSchema,
  })
  .strict();

export const GeoKnowledgeImportResponseV3Schema = z
  .object({
    schemaVersion: z.literal(3),
    knowledgeImport: GeoKnowledgeImportResponsePayloadSchema,
  })
  .strict();

export const GeoKnowledgeImportResponseSchema = z.discriminatedUnion(
  "schemaVersion",
  [GeoKnowledgeImportResponseV2Schema, GeoKnowledgeImportResponseV3Schema],
);

/*
 * Keep the v2 schemas and types exported during the receiver-first rollout.
 * Existing Website deployments can continue importing historical archives
 * while v3 binds new archives to their validation profile and manifest hash.
 */
export type GeoKnowledgeImportRequest = z.infer<
  typeof GeoKnowledgeImportRequestSchema
>;
export type GeoKnowledgeImportResponse = z.infer<
  typeof GeoKnowledgeImportResponseSchema
>;

/*
 * These aliases remain part of the public provisioning contract until every
 * in-flight v2 task has settled.
 */
export type GeoKnowledgeImportRequestV2 = z.infer<
  typeof GeoKnowledgeImportRequestV2Schema
>;
export type GeoKnowledgeImportResponseV2 = z.infer<
  typeof GeoKnowledgeImportResponseV2Schema
>;

/*
 * v3 is used only for newly validated website-lead-v1 products.
 */
export type GeoKnowledgeImportRequestV3 = z.infer<
  typeof GeoKnowledgeImportRequestV3Schema
>;
export type GeoKnowledgeImportResponseV3 = z.infer<
  typeof GeoKnowledgeImportResponseV3Schema
>;

export type GeoPurchaseProvisionRequestV2 = z.infer<
  typeof GeoPurchaseProvisionRequestV2Schema
>;
export type GeoPurchaseProvisionResponseV2 = z.infer<
  typeof GeoPurchaseProvisionResponseV2Schema
>;
export const GEO_MANUAL_SERVICE_ORDER_STATUSES = [
  "pending_admin",
  "signature_required",
  "payment_required",
  "account_setup_required",
  "activation_required",
  "active",
  "rejected",
  "failed",
] as const;

export const GeoManualServiceOrderStatusSchema = z.enum(
  GEO_MANUAL_SERVICE_ORDER_STATUSES,
);

export const GeoManualServiceOrderCreateRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    project: z
      .object({
        id: z.string().trim().min(8).max(80),
        companyName: z.string().trim().min(1).max(200),
      })
      .strict(),
    service: z
      .object({
        planCode: z.literal("basic"),
        serviceDays: z.literal(30),
        purchasedQuestion: GeoBasicPurchasedQuestionSchema,
      })
      .strict(),
    contract: z
      .object({
        templateVersion: z.string().trim().min(1).max(64),
        profile: GeoServiceContractProfileSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    const normalize = (text: string) =>
      text.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
    if (
      normalize(value.project.companyName) !==
      normalize(value.contract.profile.legalName)
    ) {
      context.addIssue({
        code: "custom",
        path: ["contract", "profile", "legalName"],
        message: "contract legalName must match project companyName",
      });
    }
  });

export const GeoManualServiceOrderPaymentRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    payment: z
      .object({
        orderId: z.string().trim().min(8).max(64),
        tradeNo: z.string().trim().min(1).max(128),
        amountFen: z.number().int().positive().max(10_000_000),
        paidAt: isoDateTimeSchema,
      })
      .strict(),
  })
  .strict();

export const GeoManualServiceOrderAccountRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    account: z.discriminatedUnion("mode", [
      z
        .object({
          mode: z.literal("create"),
          username: z
            .string()
            .trim()
            .min(3)
            .max(64)
            .regex(/^[a-zA-Z0-9._-]+$/),
          displayName: z.string().trim().min(2).max(128),
          password: z.string().min(8).max(128),
        })
        .strict(),
      GeoPurchaseAccountBindingSchema,
    ]),
  })
  .strict();

export const GeoManualServiceOrderResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    order: z
      .object({
        reference: identifierSchema,
        projectId: z.string().trim().min(8).max(80),
        status: GeoManualServiceOrderStatusSchema,
        amountFen: z.number().int().positive().max(10_000_000),
        contractId: identifierSchema.optional(),
        signingUrl: publicExternalAppUrlSchema.optional(),
        signedAt: isoDateTimeSchema.optional(),
        provisioningReference: identifierSchema.optional(),
        message: z.string().trim().min(1).max(1000).optional(),
        retryable: z.boolean().optional(),
        updatedAt: isoDateTimeSchema,
      })
      .strict(),
    account: z
      .object({
        username: z.string().trim().min(1).max(64).optional(),
        displayName: z.string().trim().min(1).max(128).optional(),
        accountSetupUrl: workspaceHandoffUrlSchema.optional(),
        workspaceUrl: workspaceHandoffUrlSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.account?.accountSetupUrl && value.order.status !== "active") {
      context.addIssue({
        code: "custom",
        path: ["account"],
        message: "account URLs are only valid for an active order",
      });
    }
  });

export type GeoManualServiceOrderStatus = z.infer<
  typeof GeoManualServiceOrderStatusSchema
>;
export type GeoManualServiceOrderCreateRequest = z.infer<
  typeof GeoManualServiceOrderCreateRequestSchema
>;
export type GeoManualServiceOrderPaymentRequest = z.infer<
  typeof GeoManualServiceOrderPaymentRequestSchema
>;
export type GeoManualServiceOrderAccountRequest = z.infer<
  typeof GeoManualServiceOrderAccountRequestSchema
>;
export type GeoManualServiceOrderResponse = z.infer<
  typeof GeoManualServiceOrderResponseSchema
>;

export type GeoManualServiceOrderCreator = (
  request: GeoManualServiceOrderCreateRequest,
) => Promise<GeoManualServiceOrderResponse>;
export type GeoManualServiceOrderStatusReader = (
  reference: string,
) => Promise<GeoManualServiceOrderResponse>;
export type GeoManualServiceOrderPaymentConfirmer = (
  reference: string,
  request: GeoManualServiceOrderPaymentRequest,
) => Promise<GeoManualServiceOrderResponse>;
export type GeoManualServiceOrderAccountSubmitter = (
  reference: string,
  request: GeoManualServiceOrderAccountRequest,
) => Promise<GeoManualServiceOrderResponse>;

export class GeoAccountProvisioningError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code = "ACCOUNT_PROVISIONING_FAILED",
  ) {
    super(message);
    this.name = "GeoAccountProvisioningError";
  }
}

export type GeoAccountProvisionerOptions = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type GeoAccountProvisioner = (
  request: GeoAccountProvisionRequest,
) => Promise<GeoAccountProvisionResponse>;
export type GeoPurchaseProvisioner = (
  request: GeoPurchaseProvisionRequestV2,
) => Promise<GeoPurchaseProvisionResponseV2>;
export type GeoPurchaseStatusReader = (
  reference: string,
) => Promise<GeoPurchaseProvisionResponseV2>;
export type GeoKnowledgeImporter = (
  projectId: string,
  request: GeoKnowledgeImportRequest,
) => Promise<GeoKnowledgeImportResponse>;

export const GeoProjectOrderStateSchema = z.enum([
  "pending",
  "paid",
  "fulfilling",
  "fulfilled",
  "terminal_failed",
  "closed",
  "review_required",
]);

export const GeoProjectOrderSchema = z
  .object({
    orderId: identifierSchema,
    projectId: z.string().trim().min(8).max(80),
    purchaseType: z.enum(["monitoring", "service"]),
    amountFen: z.number().int().positive().max(10_000_000),
    authorizationDigest: sha256Schema.transform((value) => value.toLowerCase()),
    state: GeoProjectOrderStateSchema,
    checkoutExpiresAt: isoDateTimeSchema,
    eventAt: isoDateTimeSchema,
    paidAt: isoDateTimeSchema.optional(),
    fulfilledAt: isoDateTimeSchema.optional(),
  })
  .strict();

export const GeoProjectOrderEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    order: GeoProjectOrderSchema,
  })
  .strict();

export const GeoProjectOrderIntentCommitEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    intent: GeoProjectOrderSchema,
    order: GeoProjectOrderSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.intent.state !== "closed" ||
      value.intent.projectId !== value.order.projectId ||
      value.intent.purchaseType !== value.order.purchaseType ||
      value.intent.amountFen !== value.order.amountFen
    ) {
      context.addIssue({
        code: "custom",
        path: ["intent"],
        message: "closed intent does not match the committed checkout",
      });
    }
  });

export const GeoProjectOrdersByProjectSchema = z
  .object({
    schemaVersion: z.literal(1),
    projectId: z.string().trim().min(8).max(80),
    blockDeletion: z.boolean(),
    orders: z.array(GeoProjectOrderSchema).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.orders.some((order) => order.projectId !== value.projectId)) {
      context.addIssue({
        code: "custom",
        path: ["orders"],
        message: "all orders must belong to the requested project",
      });
    }
    const expectedBlockDeletion = value.orders.some(
      (order) =>
        order.state !== "fulfilled" &&
        order.state !== "terminal_failed" &&
        order.state !== "closed",
    );
    if (value.blockDeletion !== expectedBlockDeletion) {
      context.addIssue({
        code: "custom",
        path: ["blockDeletion"],
        message: "blockDeletion must match the persisted order states",
      });
    }
  });

const GeoProjectOrderRegistryReadySchema = z
  .object({
    schemaVersion: z.literal(1),
    ready: z.literal(true),
  })
  .strict();

export type GeoProjectOrder = z.infer<typeof GeoProjectOrderSchema>;
export type GeoProjectOrderState = z.infer<typeof GeoProjectOrderStateSchema>;
export type GeoProjectOrdersByProject = z.infer<
  typeof GeoProjectOrdersByProjectSchema
>;
export type GeoProjectOrderRegistry = {
  assertReady: () => Promise<void>;
  upsert: (order: GeoProjectOrder) => Promise<GeoProjectOrder>;
  commitIntent: (
    intentOrderId: string,
    order: GeoProjectOrder,
  ) => Promise<GeoProjectOrder>;
  findByProject: (projectId: string) => Promise<GeoProjectOrdersByProject>;
};

export const GeoPaymentReceiptSchema = z
  .object({
    orderId: z
      .string()
      .trim()
      .regex(/^\d{1,32}$/),
    tradeNo: z
      .string()
      .min(8)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
    amountFen: z.number().int().positive().max(10_000_000),
    paidAt: canonicalUtcDateTimeSchema,
    purchaseType: z.enum(["monitoring", "service"]),
    reviewRequired: z.boolean(),
    scopeHash: sha256Schema.transform((value) => value.toLowerCase()),
    authorizationDigest: sha256Schema.transform((value) => value.toLowerCase()),
  })
  .strict();

export const GeoPaymentReceiptEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    receipt: GeoPaymentReceiptSchema,
  })
  .strict();

const GeoPaymentReceiptReadySchema = z
  .object({
    schemaVersion: z.literal(1),
    ready: z.literal(true),
  })
  .strict();

const GeoPaymentReceiptLookupSchema = z
  .object({
    orderId: z
      .string()
      .trim()
      .regex(/^\d{1,32}$/),
    scopeHash: sha256Schema.transform((value) => value.toLowerCase()),
    authorizationDigest: sha256Schema.transform((value) => value.toLowerCase()),
  })
  .strict();

export type GeoPaymentReceipt = z.infer<typeof GeoPaymentReceiptSchema>;
export type GeoPaymentReceiptLookup = z.infer<
  typeof GeoPaymentReceiptLookupSchema
>;
export type GeoPaymentReceiptStore = {
  assertReady: () => Promise<void>;
  record: (receipt: GeoPaymentReceipt) => Promise<GeoPaymentReceipt>;
  find: (
    lookup: GeoPaymentReceiptLookup,
  ) => Promise<GeoPaymentReceipt | undefined>;
};

function usableToken(value: string | undefined) {
  const normalized = value?.trim() ?? "";
  const lower = normalized.toLowerCase();
  return (
    normalized.length >= 32 &&
    !PUBLIC_PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker))
  );
}

const INTERNAL_SERVICE_HOSTNAME_RE =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;

function configuredInternalHttpHosts(env: NodeJS.ProcessEnv) {
  const hosts = new Set<string>();
  for (const entry of (env.FRONTMIND_AGENT_INTERNAL_HTTP_HOSTS ?? "").split(
    ",",
  )) {
    const hostname = entry.trim().toLowerCase().replace(/\.$/, "");
    if (!hostname) continue;
    if (!INTERNAL_SERVICE_HOSTNAME_RE.test(hostname) || isIpLiteral(hostname)) {
      throw new Error(
        "FRONTMIND_AGENT_INTERNAL_HTTP_HOSTS must contain exact DNS hostnames",
      );
    }
    hosts.add(hostname);
  }
  return hosts;
}

function provisioningBaseEndpoint(env: NodeJS.ProcessEnv) {
  const raw = env.FRONTMIND_AGENT_PROVISIONING_URL?.trim() ?? "";
  let url: URL;
  let internalHttpHosts: Set<string>;
  try {
    url = new URL(raw);
    internalHttpHosts = configuredInternalHttpHosts(env);
  } catch {
    throw new GeoAccountProvisioningError(
      "FrontMind 账号服务尚未配置",
      503,
      "PROVISIONING_NOT_CONFIGURED",
    );
  }
  const hostname = normalizedHostname(url);
  const allowedHttpHost =
    isLoopbackHost(hostname) || internalHttpHosts.has(hostname);
  if (
    !hostname ||
    url.username ||
    url.password ||
    (url.protocol !== "https:" &&
      !(allowedHttpHost && url.protocol === "http:"))
  ) {
    throw new GeoAccountProvisioningError(
      "FrontMind 账号服务地址必须使用 HTTPS 或显式允许的内部 HTTP 主机",
      503,
      "PROVISIONING_NOT_CONFIGURED",
    );
  }
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
}

function stableIdempotencyKey(orderId: string) {
  return `geo-service:${orderId}:account-v1`;
}

async function parseError(
  response: Response,
  fallbackCode = "ACCOUNT_PROVISIONING_FAILED",
  fallbackMessage = "FrontMind 账号暂未创建成功",
) {
  try {
    const payload = (await response.json()) as {
      error?: { code?: unknown; message?: unknown };
    };
    return {
      code:
        typeof payload.error?.code === "string"
          ? payload.error.code
          : fallbackCode,
      message:
        typeof payload.error?.message === "string"
          ? payload.error.message
          : fallbackMessage,
    };
  } catch {
    return {
      code: fallbackCode,
      message: fallbackMessage,
    };
  }
}

function serviceToken(env: NodeJS.ProcessEnv) {
  const token = env.FRONTMIND_PROVISIONING_SERVICE_TOKEN?.trim();
  if (!usableToken(token)) {
    throw new GeoAccountProvisioningError(
      "FrontMind 账号服务尚未配置",
      503,
      "PROVISIONING_NOT_CONFIGURED",
    );
  }
  return token!;
}

async function fetchProvisioningJson<T>({
  endpoint,
  init,
  fetchImpl,
  timeoutMs,
  responseSchema,
  invalidResponseMessage,
  unavailableMessage,
  timeoutMessage,
  fallbackCode,
  fallbackMessage,
}: {
  endpoint: URL;
  init: RequestInit;
  fetchImpl: typeof fetch;
  timeoutMs: number;
  responseSchema: z.ZodType<T>;
  invalidResponseMessage: string;
  unavailableMessage: string;
  timeoutMessage: string;
  fallbackCode: string;
  fallbackMessage: string;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(endpoint, {
      ...init,
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await parseError(response, fallbackCode, fallbackMessage);
      throw new GeoAccountProvisioningError(
        detail.message,
        response.status,
        detail.code,
      );
    }
    return responseSchema.parse(await response.json());
  } catch (error) {
    if (error instanceof GeoAccountProvisioningError) throw error;
    if (error instanceof z.ZodError) {
      throw new GeoAccountProvisioningError(
        invalidResponseMessage,
        502,
        "INVALID_PROVISIONING_RESPONSE",
      );
    }
    if (controller.signal.aborted) {
      throw new GeoAccountProvisioningError(
        timeoutMessage,
        504,
        "PROVISIONING_TIMEOUT",
      );
    }
    throw new GeoAccountProvisioningError(
      unavailableMessage,
      502,
      "PROVISIONING_UNAVAILABLE",
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function createGeoAccountProvisioner(
  options: GeoAccountProvisionerOptions = {},
): GeoAccountProvisioner {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? PROVISIONING_TIMEOUT_MS;

  return async function provisionGeoAccount(
    rawRequest: GeoAccountProvisionRequest,
  ): Promise<GeoAccountProvisionResponse> {
    const request = GeoAccountProvisionRequestSchema.parse(rawRequest);
    const token = serviceToken(env);
    const endpoint = provisioningBaseEndpoint(env);
    endpoint.pathname = `${endpoint.pathname}/users`;
    return fetchProvisioningJson({
      endpoint,
      fetchImpl,
      timeoutMs,
      responseSchema: GeoAccountProvisionResponseSchema,
      invalidResponseMessage: "账号服务返回了无效结果",
      unavailableMessage: "账号服务暂时不可用，请稍后重试",
      timeoutMessage: "账号创建超时，请稍后重试",
      fallbackCode: "ACCOUNT_PROVISIONING_FAILED",
      fallbackMessage: "FrontMind 账号暂未创建成功",
      init: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Idempotency-Key": stableIdempotencyKey(request.order.id),
          "x-frontmind-provisioning-token": token,
        },
        body: JSON.stringify(request),
      },
    });
  };
}

export function createGeoPurchaseProvisioner(
  options: GeoAccountProvisionerOptions = {},
): GeoPurchaseProvisioner {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? PROVISIONING_TIMEOUT_MS;
  return async (rawRequest) => {
    const request = GeoPurchaseProvisionRequestV2Schema.parse(rawRequest);
    const endpoint = provisioningBaseEndpoint(env);
    endpoint.pathname = `${endpoint.pathname}/purchases`;
    const response = await fetchProvisioningJson({
      endpoint,
      fetchImpl,
      timeoutMs,
      responseSchema: GeoPurchaseProvisionResponseV2Schema,
      invalidResponseMessage: "服务开通接口返回了无效结果",
      unavailableMessage: "服务开通接口暂时不可用，请稍后重试",
      timeoutMessage: "服务开通请求超时，请稍后重试",
      fallbackCode: "PURCHASE_PROVISIONING_FAILED",
      fallbackMessage: "服务暂未开通成功",
      init: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Idempotency-Key": `geo-basic:${request.order.id}:purchase-v2`,
          "x-frontmind-provisioning-token": serviceToken(env),
        },
        body: JSON.stringify(request),
      },
    });
    return response;
  };
}

export function createGeoPurchaseStatusReader(
  options: GeoAccountProvisionerOptions = {},
): GeoPurchaseStatusReader {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? PROVISIONING_TIMEOUT_MS;
  return async (reference) => {
    const parsedReference = identifierSchema.parse(reference);
    const endpoint = provisioningBaseEndpoint(env);
    endpoint.pathname = `${endpoint.pathname}/purchases/${encodeURIComponent(parsedReference)}/status`;
    return fetchProvisioningJson({
      endpoint,
      fetchImpl,
      timeoutMs,
      responseSchema: GeoPurchaseProvisionResponseV2Schema,
      invalidResponseMessage: "服务状态接口返回了无效结果",
      unavailableMessage: "服务状态接口暂时不可用，请稍后重试",
      timeoutMessage: "服务状态查询超时，请稍后重试",
      fallbackCode: "PURCHASE_STATUS_FAILED",
      fallbackMessage: "暂时无法查询服务开通状态",
      init: {
        method: "GET",
        headers: {
          Accept: "application/json",
          "x-frontmind-provisioning-token": serviceToken(env),
        },
      },
    });
  };
}

export function createGeoManualServiceOrderCreator(
  options: GeoAccountProvisionerOptions = {},
): GeoManualServiceOrderCreator {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? PROVISIONING_TIMEOUT_MS;
  return async (rawRequest) => {
    const request = GeoManualServiceOrderCreateRequestSchema.parse(rawRequest);
    const endpoint = provisioningBaseEndpoint(env);
    endpoint.pathname = `${endpoint.pathname}/manual-orders`;
    return fetchProvisioningJson({
      endpoint,
      fetchImpl,
      timeoutMs,
      responseSchema: GeoManualServiceOrderResponseSchema,
      invalidResponseMessage: "合同订单接口返回了无效结果",
      unavailableMessage: "合同订单接口暂时不可用，请稍后重试",
      timeoutMessage: "合同订单提交超时，请稍后重试",
      fallbackCode: "MANUAL_ORDER_CREATE_FAILED",
      fallbackMessage: "合同订单暂未创建成功",
      init: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Idempotency-Key": `geo-manual:${request.project.id}:${request.service.purchasedQuestion.id}:contract-v1`,
          "x-frontmind-provisioning-token": serviceToken(env),
        },
        body: JSON.stringify(request),
      },
    });
  };
}

export function createGeoManualServiceOrderStatusReader(
  options: GeoAccountProvisionerOptions = {},
): GeoManualServiceOrderStatusReader {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? PROVISIONING_TIMEOUT_MS;
  return async (reference) => {
    const parsedReference = identifierSchema.parse(reference);
    const endpoint = provisioningBaseEndpoint(env);
    endpoint.pathname = `${endpoint.pathname}/manual-orders/${encodeURIComponent(parsedReference)}/status`;
    return fetchProvisioningJson({
      endpoint,
      fetchImpl,
      timeoutMs,
      responseSchema: GeoManualServiceOrderResponseSchema,
      invalidResponseMessage: "合同状态接口返回了无效结果",
      unavailableMessage: "合同状态接口暂时不可用，请稍后重试",
      timeoutMessage: "合同状态查询超时，请稍后重试",
      fallbackCode: "MANUAL_ORDER_STATUS_FAILED",
      fallbackMessage: "暂时无法查询合同状态",
      init: {
        method: "GET",
        headers: {
          Accept: "application/json",
          "x-frontmind-provisioning-token": serviceToken(env),
        },
      },
    });
  };
}

export function createGeoManualServiceOrderPaymentConfirmer(
  options: GeoAccountProvisionerOptions = {},
): GeoManualServiceOrderPaymentConfirmer {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? PROVISIONING_TIMEOUT_MS;
  return async (reference, rawRequest) => {
    const parsedReference = identifierSchema.parse(reference);
    const request = GeoManualServiceOrderPaymentRequestSchema.parse(rawRequest);
    const endpoint = provisioningBaseEndpoint(env);
    endpoint.pathname = `${endpoint.pathname}/manual-orders/${encodeURIComponent(parsedReference)}/payment`;
    return fetchProvisioningJson({
      endpoint,
      fetchImpl,
      timeoutMs,
      responseSchema: GeoManualServiceOrderResponseSchema,
      invalidResponseMessage: "合同订单付款确认接口返回了无效结果",
      unavailableMessage: "合同订单付款确认接口暂时不可用，请稍后重试",
      timeoutMessage: "合同订单付款确认超时，请稍后重试",
      fallbackCode: "MANUAL_ORDER_PAYMENT_FAILED",
      fallbackMessage: "付款已经完成，但服务开通请求暂未确认",
      init: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Idempotency-Key": `geo-manual:${parsedReference}:${request.payment.orderId}:payment-v1`,
          "x-frontmind-provisioning-token": serviceToken(env),
        },
        body: JSON.stringify(request),
      },
    });
  };
}

export function createGeoManualServiceOrderAccountSubmitter(
  options: GeoAccountProvisionerOptions = {},
): GeoManualServiceOrderAccountSubmitter {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? PROVISIONING_TIMEOUT_MS;
  return async (reference, rawRequest) => {
    const parsedReference = identifierSchema.parse(reference);
    const request = GeoManualServiceOrderAccountRequestSchema.parse(rawRequest);
    const endpoint = provisioningBaseEndpoint(env);
    endpoint.pathname = `${endpoint.pathname}/manual-orders/${encodeURIComponent(parsedReference)}/account`;
    return fetchProvisioningJson({
      endpoint,
      fetchImpl,
      timeoutMs,
      responseSchema: GeoManualServiceOrderResponseSchema,
      invalidResponseMessage: "看板账号接口返回了无效结果",
      unavailableMessage: "看板账号接口暂时不可用，请稍后重试",
      timeoutMessage: "看板账号提交超时，请稍后重试",
      fallbackCode: "MANUAL_ORDER_ACCOUNT_FAILED",
      fallbackMessage: "账号设置暂未提交成功",
      init: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Idempotency-Key": `geo-manual:${parsedReference}:account-v1`,
          "x-frontmind-provisioning-token": serviceToken(env),
        },
        body: JSON.stringify(request),
      },
    });
  };
}

export function createGeoKnowledgeImporter(
  options: GeoAccountProvisionerOptions = {},
): GeoKnowledgeImporter {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? PROVISIONING_TIMEOUT_MS;
  return async (projectId, rawRequest) => {
    const parsedProjectId = z.string().trim().min(8).max(80).parse(projectId);
    const request = GeoKnowledgeImportRequestSchema.parse(rawRequest);
    const endpoint = provisioningBaseEndpoint(env);
    endpoint.pathname = `${endpoint.pathname}/projects/${encodeURIComponent(parsedProjectId)}/knowledge-imports`;
    const response = await fetchProvisioningJson({
      endpoint,
      fetchImpl,
      timeoutMs,
      responseSchema: GeoKnowledgeImportResponseSchema,
      invalidResponseMessage: "知识库接入接口返回了无效结果",
      unavailableMessage: "知识库接入接口暂时不可用，请稍后重试",
      timeoutMessage: "知识库接入超时，请稍后重试",
      fallbackCode: "KNOWLEDGE_IMPORT_FAILED",
      fallbackMessage: "知识库暂未接入成功",
      init: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Idempotency-Key":
            request.schemaVersion === 3
              ? [
                  "geo-basic",
                  parsedProjectId,
                  request.descriptorHash,
                  request.artifactSha256,
                  request.packageManifestSha256,
                  "knowledge-v3",
                ].join(":")
              : `geo-basic:${parsedProjectId}:${request.descriptorHash}:${request.artifactSha256}:knowledge-v2`,
          "x-frontmind-provisioning-token": serviceToken(env),
        },
        body: JSON.stringify(request),
      },
    });
    if (response.schemaVersion !== request.schemaVersion) {
      throw new GeoAccountProvisioningError(
        "知识库接入接口返回了不匹配的归档合同版本",
        502,
        "KNOWLEDGE_IMPORT_VERSION_MISMATCH",
      );
    }
    return response;
  };
}

export function createGeoPaymentReceiptStore(
  options: GeoAccountProvisionerOptions = {},
): GeoPaymentReceiptStore {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? PROVISIONING_TIMEOUT_MS;
  const authenticatedHeaders = () => ({
    Accept: "application/json",
    "x-frontmind-provisioning-token": serviceToken(env),
  });

  return {
    async assertReady() {
      const endpoint = provisioningBaseEndpoint(env);
      endpoint.pathname = `${endpoint.pathname}/payment-receipts/ready`;
      await fetchProvisioningJson({
        endpoint,
        fetchImpl,
        timeoutMs,
        responseSchema: GeoPaymentReceiptReadySchema,
        invalidResponseMessage: "支付回执账本返回了无效就绪结果",
        unavailableMessage: "支付回执账本暂时不可用，请稍后重试",
        timeoutMessage: "支付回执账本就绪检查超时，请稍后重试",
        fallbackCode: "PAYMENT_LEDGER_UNAVAILABLE",
        fallbackMessage: "支付回执账本暂时不可用",
        init: {
          method: "GET",
          headers: authenticatedHeaders(),
        },
      });
    },

    async record(rawReceipt) {
      const receipt = GeoPaymentReceiptSchema.parse(rawReceipt);
      const endpoint = provisioningBaseEndpoint(env);
      endpoint.pathname = `${endpoint.pathname}/payment-receipts`;
      const result = await fetchProvisioningJson({
        endpoint,
        fetchImpl,
        timeoutMs,
        responseSchema: GeoPaymentReceiptEnvelopeSchema,
        invalidResponseMessage: "支付回执账本返回了无效写入结果",
        unavailableMessage: "支付回执暂未安全保存，请稍后重试",
        timeoutMessage: "支付回执保存超时，请稍后重试",
        fallbackCode: "PAYMENT_LEDGER_WRITE_FAILED",
        fallbackMessage: "支付回执暂未安全保存",
        init: {
          method: "POST",
          headers: {
            ...authenticatedHeaders(),
            "Content-Type": "application/json",
            "Idempotency-Key": `geo-payment-receipt:${receipt.orderId}:${receipt.authorizationDigest.slice(0, 16)}:v1`,
          },
          body: JSON.stringify({ schemaVersion: 1, receipt }),
        },
      });
      if (!samePaymentReceipt(result.receipt, receipt)) {
        throw new GeoAccountProvisioningError(
          "支付回执账本返回了与写入请求不一致的结果",
          502,
          "PAYMENT_RECEIPT_MISMATCH",
        );
      }
      return result.receipt;
    },

    async find(rawLookup) {
      const lookup = GeoPaymentReceiptLookupSchema.parse(rawLookup);
      const endpoint = provisioningBaseEndpoint(env);
      endpoint.pathname = `${endpoint.pathname}/payment-receipts/${encodeURIComponent(lookup.orderId)}`;
      endpoint.searchParams.set("scopeHash", lookup.scopeHash);
      endpoint.searchParams.set(
        "authorizationDigest",
        lookup.authorizationDigest,
      );
      try {
        const result = await fetchProvisioningJson({
          endpoint,
          fetchImpl,
          timeoutMs,
          responseSchema: GeoPaymentReceiptEnvelopeSchema,
          invalidResponseMessage: "支付回执账本返回了无效查询结果",
          unavailableMessage: "支付回执账本暂时不可用，请稍后重试",
          timeoutMessage: "支付回执查询超时，请稍后重试",
          fallbackCode: "PAYMENT_LEDGER_READ_FAILED",
          fallbackMessage: "暂时无法查询支付回执",
          init: {
            method: "GET",
            headers: authenticatedHeaders(),
          },
        });
        if (
          result.receipt.orderId !== lookup.orderId ||
          result.receipt.scopeHash !== lookup.scopeHash ||
          result.receipt.authorizationDigest !== lookup.authorizationDigest
        ) {
          throw new GeoAccountProvisioningError(
            "支付回执账本返回了与查询范围不一致的结果",
            502,
            "PAYMENT_RECEIPT_MISMATCH",
          );
        }
        return result.receipt;
      } catch (error) {
        if (
          error instanceof GeoAccountProvisioningError &&
          error.status === 404 &&
          error.code === "PAYMENT_RECEIPT_NOT_FOUND"
        ) {
          return undefined;
        }
        throw error;
      }
    },
  };
}

export function createGeoProjectOrderRegistry(
  options: GeoAccountProvisionerOptions = {},
): GeoProjectOrderRegistry {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? PROVISIONING_TIMEOUT_MS;
  const authenticatedHeaders = () => ({
    Accept: "application/json",
    "x-frontmind-provisioning-token": serviceToken(env),
  });

  return {
    async assertReady() {
      const endpoint = provisioningBaseEndpoint(env);
      endpoint.pathname = `${endpoint.pathname}/project-orders/ready`;
      await fetchProvisioningJson({
        endpoint,
        fetchImpl,
        timeoutMs,
        responseSchema: GeoProjectOrderRegistryReadySchema,
        invalidResponseMessage: "项目订单账本返回了无效就绪结果",
        unavailableMessage: "项目订单账本暂时不可用，请稍后重试",
        timeoutMessage: "项目订单账本就绪检查超时，请稍后重试",
        fallbackCode: "PROJECT_ORDER_REGISTRY_UNAVAILABLE",
        fallbackMessage: "项目订单账本暂时不可用",
        init: {
          method: "GET",
          headers: authenticatedHeaders(),
        },
      });
    },

    async upsert(rawOrder) {
      const order = GeoProjectOrderSchema.parse(rawOrder);
      const endpoint = provisioningBaseEndpoint(env);
      endpoint.pathname = `${endpoint.pathname}/project-orders/${encodeURIComponent(order.orderId)}`;
      const response = await fetchProvisioningJson({
        endpoint,
        fetchImpl,
        timeoutMs,
        responseSchema: GeoProjectOrderEnvelopeSchema,
        invalidResponseMessage: "项目订单账本返回了无效写入结果",
        unavailableMessage: "项目订单账本暂时不可用，请稍后重试",
        timeoutMessage: "项目订单账本写入超时，请稍后重试",
        fallbackCode: "PROJECT_ORDER_REGISTRY_WRITE_FAILED",
        fallbackMessage: "项目订单状态暂未安全保存",
        init: {
          method: "PUT",
          headers: {
            ...authenticatedHeaders(),
            "Content-Type": "application/json",
            "Idempotency-Key": `geo-project-order:${order.orderId}:${order.state}:${cryptoSafeIdempotencyPart(order.eventAt)}:v1`,
          },
          body: JSON.stringify({ schemaVersion: 1, order }),
        },
      });
      if (!sameProjectOrder(response.order, order)) {
        throw new GeoAccountProvisioningError(
          "项目订单账本返回了与写入请求不一致的结果",
          502,
          "PROJECT_ORDER_REGISTRY_MISMATCH",
        );
      }
      return response.order;
    },

    async commitIntent(rawIntentOrderId, rawOrder) {
      const intentOrderId = identifierSchema.parse(rawIntentOrderId);
      const order = GeoProjectOrderSchema.parse(rawOrder);
      const endpoint = provisioningBaseEndpoint(env);
      endpoint.pathname = `${endpoint.pathname}/project-order-intents/${encodeURIComponent(intentOrderId)}/commit`;
      const response = await fetchProvisioningJson({
        endpoint,
        fetchImpl,
        timeoutMs,
        responseSchema: GeoProjectOrderIntentCommitEnvelopeSchema,
        invalidResponseMessage: "项目订单账本返回了无效提交结果",
        unavailableMessage: "项目订单账本暂时不可用，请稍后重试",
        timeoutMessage: "项目订单提交超时，请稍后重试",
        fallbackCode: "PROJECT_ORDER_REGISTRY_COMMIT_FAILED",
        fallbackMessage: "收银台订单暂未安全提交",
        init: {
          method: "POST",
          headers: {
            ...authenticatedHeaders(),
            "Content-Type": "application/json",
            "Idempotency-Key": `geo-project-order-intent:${intentOrderId}:commit-v1`,
          },
          body: JSON.stringify({ schemaVersion: 1, order }),
        },
      });
      if (!sameProjectOrder(response.order, order)) {
        throw new GeoAccountProvisioningError(
          "项目订单账本返回了与提交请求不一致的结果",
          502,
          "PROJECT_ORDER_REGISTRY_MISMATCH",
        );
      }
      if (response.intent.orderId !== intentOrderId) {
        throw new GeoAccountProvisioningError(
          "项目订单账本返回了不匹配的收银台意向",
          502,
          "PROJECT_ORDER_REGISTRY_MISMATCH",
        );
      }
      return response.order;
    },

    async findByProject(rawProjectId) {
      const projectId = z.string().trim().min(8).max(80).parse(rawProjectId);
      const endpoint = provisioningBaseEndpoint(env);
      endpoint.pathname = `${endpoint.pathname}/project-orders/projects/${encodeURIComponent(projectId)}`;
      const response = await fetchProvisioningJson({
        endpoint,
        fetchImpl,
        timeoutMs,
        responseSchema: GeoProjectOrdersByProjectSchema,
        invalidResponseMessage: "项目订单账本返回了无效查询结果",
        unavailableMessage: "项目订单账本暂时不可用，请稍后重试",
        timeoutMessage: "项目订单账本查询超时，请稍后重试",
        fallbackCode: "PROJECT_ORDER_REGISTRY_READ_FAILED",
        fallbackMessage: "暂时无法确认项目订单状态",
        init: {
          method: "GET",
          headers: authenticatedHeaders(),
        },
      });
      if (response.projectId !== projectId) {
        throw new GeoAccountProvisioningError(
          "项目订单账本返回了其他项目的状态",
          502,
          "PROJECT_ORDER_REGISTRY_MISMATCH",
        );
      }
      return response;
    },
  };
}

function cryptoSafeIdempotencyPart(value: string) {
  return value.replace(/[^A-Za-z0-9]/g, "").slice(0, 32);
}

function sameProjectOrder(left: GeoProjectOrder, right: GeoProjectOrder) {
  return (
    left.orderId === right.orderId &&
    left.projectId === right.projectId &&
    left.purchaseType === right.purchaseType &&
    left.amountFen === right.amountFen &&
    left.authorizationDigest === right.authorizationDigest &&
    left.state === right.state &&
    left.checkoutExpiresAt === right.checkoutExpiresAt &&
    left.eventAt === right.eventAt &&
    left.paidAt === right.paidAt &&
    left.fulfilledAt === right.fulfilledAt
  );
}

function samePaymentReceipt(left: GeoPaymentReceipt, right: GeoPaymentReceipt) {
  return (
    left.orderId === right.orderId &&
    left.tradeNo === right.tradeNo &&
    left.amountFen === right.amountFen &&
    left.paidAt === right.paidAt &&
    left.purchaseType === right.purchaseType &&
    left.reviewRequired === right.reviewRequired &&
    left.scopeHash === right.scopeHash &&
    left.authorizationDigest === right.authorizationDigest
  );
}
