import crypto from "node:crypto";
import type { GeoMonitorPlatformId } from "./broker";
import {
  createGeoPaymentReceiptStore,
  GeoAccountProvisioningError,
  type GeoPaymentReceipt as GeoStoredPaymentReceipt,
  type GeoPaymentReceiptStore,
} from "./provisioning";
import { GeoTokenCodec, GeoTokenError, GeoTokenExpiredError } from "./tokens";

const ZPAY_SUBMIT_URL = "https://zpayz.cn/submit.php";
const ZPAY_ORDER_QUERY_URL = "https://zpayz.cn/api.php";
const PAYMENT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const PAYMENT_AUTOMATIC_FULFILLMENT_GRACE_MS = 30 * 60 * 1000;
// ZPAY does not enforce our UI expiry. Keep an authenticated recovery boundary
// long enough to record a late signed callback, while routing late payments to
// human review instead of automatic fulfillment.
const PAYMENT_CALLBACK_RECORDING_GRACE_MS = 365 * 24 * 60 * 60 * 1000;
const EARLIEST_SUPPORTED_PAYMENT_MS = Date.parse(
  "2020-01-01T00:00:00.000Z",
);
const MAX_PROVIDER_CLOCK_SKEW_MS = 5 * 60 * 1000;
const MAX_ZPAY_RESPONSE_BYTES = 64 * 1024;

export type GeoPaymentMethod = "alipay" | "wxpay";
export type GeoServiceCategory =
  | "reputation"
  | "product_scenario"
  | "competitor_comparison";

export const GEO_SERVICE_MONTHLY_PRICE_FEN: Record<GeoServiceCategory, number> =
  {
    reputation: 200_000,
    product_scenario: 150_000,
    competitor_comparison: 200_000,
  };

export type GeoPaymentVerificationInput = {
  authorization: string;
  projectId: string;
  ownerSessionId: string;
  questionId: string;
  platformIds: GeoMonitorPlatformId[];
  expectedAmountFen: number;
};

export type GeoPaymentCheckoutInput = Omit<
  GeoPaymentVerificationInput,
  "authorization" | "ownerSessionId"
> & {
  ownerSessionId: string;
  method: GeoPaymentMethod;
};

export type GeoServicePaymentVerificationInput = {
  authorization: string;
  projectId: string;
  ownerSessionId: string;
  questionId: string;
  category: GeoServiceCategory;
  expectedAmountFen: number;
};

export type GeoServicePaymentCheckoutInput = Omit<
  GeoServicePaymentVerificationInput,
  "authorization" | "ownerSessionId"
> & {
  ownerSessionId: string;
  method: GeoPaymentMethod;
};

export type GeoPaymentReceipt = {
  orderId: string;
  tradeNo?: string;
  amountFen: number;
  paidAt: string;
};

export type GeoPaymentCheckout = {
  authorization: string;
  orderId: string;
  amountFen: number;
  expiresAt: string;
  action: typeof ZPAY_SUBMIT_URL;
  method: "POST";
  fields: Record<string, string>;
};

export type GeoPaymentStatus = {
  status: "pending" | "paid" | "review_required";
  orderId: string;
  amountFen: number;
  tradeNo?: string;
  paidAt?: string;
  message?: string;
};

export interface GeoPaymentVerifier {
  verify(input: GeoPaymentVerificationInput): Promise<GeoPaymentReceipt>;
}

export interface GeoPaymentGateway extends GeoPaymentVerifier {
  createCheckout(input: GeoPaymentCheckoutInput): Promise<GeoPaymentCheckout>;
  createServiceCheckout(
    input: GeoServicePaymentCheckoutInput,
  ): Promise<GeoPaymentCheckout>;
  getStatus(input: GeoPaymentVerificationInput): Promise<GeoPaymentStatus>;
  getServiceStatus(
    input: GeoServicePaymentVerificationInput,
  ): Promise<GeoPaymentStatus>;
  verifyService(
    input: GeoServicePaymentVerificationInput,
  ): Promise<GeoPaymentReceipt>;
  verifyCallback(params: Record<string, string>): Promise<GeoPaymentStatus>;
}

export class GeoPaymentVerificationError extends Error {
  constructor(
    message: string,
    public readonly code = "PAYMENT_NOT_VERIFIED",
    public readonly status = 402,
  ) {
    super(message);
    this.name = "GeoPaymentVerificationError";
  }
}

type ZpayPaymentTokenCommon = {
  outTradeNo: string;
  ownerSessionId: string;
  projectId: string;
  questionId: string;
  amountFen: number;
  method: GeoPaymentMethod;
  productName: string;
  createdAt: string;
};

type ZpayMonitoringPaymentTokenValue = ZpayPaymentTokenCommon & {
  purchaseType?: "monitoring";
  platformIds: GeoMonitorPlatformId[];
};

type ZpayServicePaymentTokenValue = ZpayPaymentTokenCommon & {
  purchaseType: "service";
  category: GeoServiceCategory;
};

type ZpayPaymentTokenValue =
  | ZpayMonitoringPaymentTokenValue
  | ZpayServicePaymentTokenValue;

type OpenedZpayPayment = {
  checkoutExpiresAt: number;
  payment: ZpayPaymentTokenValue;
};

type ProviderPaymentStatus = GeoPaymentStatus & {
  providerCreatedAt?: string;
};

type ZpayGatewayConfig = {
  pid: string;
  key: string;
  publicBaseUrl: string;
  channelIds?: string;
  production?: boolean;
};

type ZpayGatewayOptions = {
  receiptStore: GeoPaymentReceiptStore;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  orderId?: (
    input: GeoPaymentCheckoutInput | GeoServicePaymentCheckoutInput,
  ) => string;
};

export class GeoPaymentConfigurationError extends Error {
  constructor(message = "ZPAY payment configuration is invalid") {
    super(message);
    this.name = "GeoPaymentConfigurationError";
  }
}

export function canonicalizeZpayParameters(params: Record<string, string>) {
  return Object.entries(params)
    .filter(
      ([key, value]) =>
        key !== "sign" && key !== "sign_type" && value.trim() !== "",
    )
    .sort(([left], [right]) => (left === right ? 0 : left < right ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export function signZpayParameters(
  params: Record<string, string>,
  key: string,
) {
  return crypto
    .createHash("md5")
    .update(`${canonicalizeZpayParameters(params)}${key}`, "utf8")
    .digest("hex");
}

export class ZpayGeoPaymentGateway implements GeoPaymentGateway {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly orderId: (
    input: GeoPaymentCheckoutInput | GeoServicePaymentCheckoutInput,
  ) => string;
  private readonly publicBaseUrl: URL;
  private readonly receiptStore: GeoPaymentReceiptStore;

  constructor(
    private readonly config: ZpayGatewayConfig,
    private readonly codec: GeoTokenCodec,
    options: ZpayGatewayOptions,
  ) {
    assertZpayConfiguration(config);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.orderId =
      options.orderId ??
      ((input) => createNumericOrderId(input, this.config.key));
    this.publicBaseUrl = new URL(config.publicBaseUrl);
    this.receiptStore = options.receiptStore;
  }

  async createCheckout(
    input: GeoPaymentCheckoutInput,
  ): Promise<GeoPaymentCheckout> {
    assertPaymentScope(input);
    await this.assertReceiptStoreReady();
    if (!input.ownerSessionId.trim()) {
      throw new GeoPaymentVerificationError(
        "支付订单缺少有效的邀请会话",
        "PAYMENT_SESSION_REQUIRED",
        401,
      );
    }

    const outTradeNo = this.orderId(input);
    if (!/^\d{1,32}$/.test(outTradeNo)) {
      throw new GeoPaymentVerificationError(
        "支付订单号生成失败",
        "PAYMENT_ORDER_INVALID",
        500,
      );
    }
    const productName = `FrontMind GEO 问题现状监控（${input.platformIds.length}个平台，每平台5次）`;
    const createdAt = this.now().toISOString();
    const authorization = this.codec.seal<ZpayPaymentTokenValue>(
      "payment",
      {
        purchaseType: "monitoring",
        outTradeNo,
        ownerSessionId: input.ownerSessionId,
        projectId: input.projectId,
        questionId: input.questionId,
        platformIds: normalizedPlatforms(input.platformIds),
        amountFen: input.expectedAmountFen,
        method: input.method,
        productName,
        createdAt,
      },
      PAYMENT_TOKEN_TTL_MS,
    );
    const notifyUrl = new URL(
      "/api/geo/payments/notify",
      this.publicBaseUrl,
    ).toString();
    const returnUrl = new URL(
      "/api/geo/payments/return",
      this.publicBaseUrl,
    ).toString();
    const fields: Record<string, string> = {
      pid: this.config.pid,
      type: input.method,
      out_trade_no: outTradeNo,
      notify_url: notifyUrl,
      return_url: returnUrl,
      name: productName,
      money: formatMoney(input.expectedAmountFen),
      param: authorization,
    };
    if (this.config.channelIds) fields.cid = this.config.channelIds;
    fields.sign = signZpayParameters(fields, this.config.key);
    fields.sign_type = "MD5";

    return {
      authorization,
      orderId: outTradeNo,
      amountFen: input.expectedAmountFen,
      expiresAt: new Date(
        this.now().getTime() + PAYMENT_TOKEN_TTL_MS,
      ).toISOString(),
      action: ZPAY_SUBMIT_URL,
      method: "POST",
      fields,
    };
  }

  async createServiceCheckout(
    input: GeoServicePaymentCheckoutInput,
  ): Promise<GeoPaymentCheckout> {
    assertServicePaymentScope(input);
    await this.assertReceiptStoreReady();
    if (!input.ownerSessionId.trim()) {
      throw new GeoPaymentVerificationError(
        "支付订单缺少有效的邀请会话",
        "PAYMENT_SESSION_REQUIRED",
        401,
      );
    }

    const outTradeNo = this.orderId(input);
    if (!/^\d{1,32}$/.test(outTradeNo)) {
      throw new GeoPaymentVerificationError(
        "支付订单号生成失败",
        "PAYMENT_ORDER_INVALID",
        500,
      );
    }
    const productName = `FrontMind GEO ${serviceCategoryLabel(input.category)}优化服务（1个问题 / 连续30天）`;
    const createdAt = this.now().toISOString();
    const authorization = this.codec.seal<ZpayPaymentTokenValue>(
      "payment",
      {
        purchaseType: "service",
        outTradeNo,
        ownerSessionId: input.ownerSessionId,
        projectId: input.projectId,
        questionId: input.questionId,
        category: input.category,
        amountFen: input.expectedAmountFen,
        method: input.method,
        productName,
        createdAt,
      },
      PAYMENT_TOKEN_TTL_MS,
    );
    const notifyUrl = new URL(
      "/api/geo/payments/notify",
      this.publicBaseUrl,
    ).toString();
    const returnUrl = new URL(
      "/api/geo/payments/return",
      this.publicBaseUrl,
    ).toString();
    const fields: Record<string, string> = {
      pid: this.config.pid,
      type: input.method,
      out_trade_no: outTradeNo,
      notify_url: notifyUrl,
      return_url: returnUrl,
      name: productName,
      money: formatMoney(input.expectedAmountFen),
      param: authorization,
    };
    if (this.config.channelIds) fields.cid = this.config.channelIds;
    fields.sign = signZpayParameters(fields, this.config.key);
    fields.sign_type = "MD5";

    return {
      authorization,
      orderId: outTradeNo,
      amountFen: input.expectedAmountFen,
      expiresAt: new Date(
        this.now().getTime() + PAYMENT_TOKEN_TTL_MS,
      ).toISOString(),
      action: ZPAY_SUBMIT_URL,
      method: "POST",
      fields,
    };
  }

  async getStatus(
    input: GeoPaymentVerificationInput,
  ): Promise<GeoPaymentStatus> {
    const opened = this.openAndVerifyScope(input);
    return this.resolvePaymentStatus(opened);
  }

  async getServiceStatus(
    input: GeoServicePaymentVerificationInput,
  ): Promise<GeoPaymentStatus> {
    const opened = this.openAndVerifyServiceScope(input);
    return this.resolvePaymentStatus(opened);
  }

  private async resolvePaymentStatus(
    opened: OpenedZpayPayment,
  ): Promise<GeoPaymentStatus> {
    const stored = await this.findStoredReceipt(opened);
    if (stored) return this.statusFromStoredReceipt(opened, stored);

    const providerStatus = await this.queryProviderPaymentStatus(
      opened.payment,
    );
    if (providerStatus.status !== "paid") return providerStatus;
    return this.persistPaidStatus(opened, providerStatus);
  }

  private async queryProviderPaymentStatus(
    payment: ZpayPaymentTokenValue,
  ): Promise<ProviderPaymentStatus> {
    const query = new URL(ZPAY_ORDER_QUERY_URL);
    query.searchParams.set("act", "order");
    query.searchParams.set("pid", this.config.pid);
    query.searchParams.set("key", this.config.key);
    query.searchParams.set("out_trade_no", payment.outTradeNo);

    let response: Response;
    try {
      response = await this.fetchImpl(query, {
        method: "GET",
        headers: { accept: "application/json" },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw new GeoPaymentVerificationError(
        "暂时无法查询支付结果，请稍后重试",
        "PAYMENT_QUERY_FAILED",
        502,
      );
    }

    let body: string;
    try {
      body = await readBoundedResponseText(response);
    } catch (error) {
      if (error instanceof GeoPaymentVerificationError) throw error;
      throw new GeoPaymentVerificationError(
        "暂时无法查询支付结果，请稍后重试",
        "PAYMENT_QUERY_FAILED",
        502,
      );
    }
    if (!response.ok) {
      throw new GeoPaymentVerificationError(
        "暂时无法查询支付结果，请稍后重试",
        "PAYMENT_QUERY_FAILED",
        502,
      );
    }

    let order: Record<string, unknown>;
    try {
      const parsed = JSON.parse(body) as unknown;
      order = asRecord(parsed);
    } catch {
      throw new GeoPaymentVerificationError(
        "支付结果格式异常",
        "PAYMENT_QUERY_INVALID",
        502,
      );
    }

    if (String(order.code ?? "") !== "1") {
      const message = textValue(order.msg) || "";
      if (isMissingProviderOrder(message)) {
        return {
          status: "pending",
          orderId: payment.outTradeNo,
          amountFen: payment.amountFen,
          message: "等待收银台创建订单",
        };
      }
      throw new GeoPaymentVerificationError(
        "支付服务暂时不可用，请稍后重试或联系技术人员",
        "PAYMENT_QUERY_REJECTED",
        502,
      );
    }
    assertOrderMatchesPayment(order, payment, this.config.pid);
    if (String(order.status ?? "") !== "1") {
      return {
        status: "pending",
        orderId: payment.outTradeNo,
        amountFen: payment.amountFen,
        message: "等待支付完成",
      };
    }

    const tradeNo = textValue(order.trade_no);
    if (
      !tradeNo ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(tradeNo)
    ) {
      throw new GeoPaymentVerificationError(
        "已支付订单缺少有效的平台交易号",
        "PAYMENT_QUERY_INVALID",
        502,
      );
    }
    const paidAt = normalizeZpayDate(textValue(order.endtime));
    const providerCreatedAt = normalizeZpayDate(textValue(order.addtime));
    if (
      !paidAt ||
      !providerCreatedAt ||
      Date.parse(providerCreatedAt) > Date.parse(paidAt)
    ) {
      throw new GeoPaymentVerificationError(
        "已支付订单缺少可核验的创建或结算时间",
        "PAYMENT_QUERY_INVALID",
        502,
      );
    }
    return {
      status: "paid",
      orderId: payment.outTradeNo,
      amountFen: payment.amountFen,
      tradeNo,
      paidAt,
      providerCreatedAt,
    };
  }

  async verify(input: GeoPaymentVerificationInput): Promise<GeoPaymentReceipt> {
    const status = await this.getStatus(input);
    if (status.status === "review_required") {
      throw new GeoPaymentVerificationError(
        "该付款已安全入账，但超过自动履约窗口，需要人工核对后处理",
        "PAYMENT_REVIEW_REQUIRED",
        409,
      );
    }
    if (status.status !== "paid" || !status.paidAt) {
      throw new GeoPaymentVerificationError(
        "支付尚未完成",
        "PAYMENT_PENDING",
        402,
      );
    }
    return {
      orderId: status.orderId,
      tradeNo: status.tradeNo,
      amountFen: status.amountFen,
      paidAt: status.paidAt,
    };
  }

  async verifyService(
    input: GeoServicePaymentVerificationInput,
  ): Promise<GeoPaymentReceipt> {
    const status = await this.getServiceStatus(input);
    if (status.status === "review_required") {
      throw new GeoPaymentVerificationError(
        "该付款已安全入账，但超过自动履约窗口，需要人工核对后处理",
        "PAYMENT_REVIEW_REQUIRED",
        409,
      );
    }
    if (status.status !== "paid" || !status.paidAt) {
      throw new GeoPaymentVerificationError(
        "支付尚未完成",
        "PAYMENT_PENDING",
        402,
      );
    }
    return {
      orderId: status.orderId,
      tradeNo: status.tradeNo,
      amountFen: status.amountFen,
      paidAt: status.paidAt,
    };
  }

  async verifyCallback(
    params: Record<string, string>,
  ): Promise<GeoPaymentStatus> {
    const sign = params.sign?.toLowerCase();
    if (
      params.sign_type?.toUpperCase() !== "MD5" ||
      !sign ||
      !/^[a-f0-9]{32}$/.test(sign)
    ) {
      throw callbackError();
    }
    const expected = signZpayParameters(params, this.config.key);
    if (!safeDigestEqual(sign, expected) || params.pid !== this.config.pid) {
      throw callbackError();
    }

    const authorization = params.param;
    if (!authorization) throw callbackError();
    const opened = this.openPaymentToken(authorization);
    const payment = opened.payment;
    if (
      params.out_trade_no !== payment.outTradeNo ||
      moneyToFen(params.money) !== payment.amountFen ||
      params.type !== payment.method ||
      params.name !== payment.productName
    ) {
      throw new GeoPaymentVerificationError(
        "支付通知与原订单不匹配",
        "PAYMENT_CALLBACK_MISMATCH",
        400,
      );
    }

    if (params.trade_status !== "TRADE_SUCCESS") {
      return {
        status: "pending",
        orderId: payment.outTradeNo,
        amountFen: payment.amountFen,
        message: "支付平台尚未确认交易成功",
      };
    }
    if (!params.trade_no?.trim()) throw callbackError();
    const stored = await this.findStoredReceipt(opened);
    if (stored) {
      if (stored.tradeNo !== params.trade_no.trim()) {
        throw new GeoPaymentVerificationError(
          "支付通知交易号与已保存回执不一致",
          "PAYMENT_RECEIPT_CONFLICT",
          409,
        );
      }
      return this.statusFromStoredReceipt(opened, stored);
    }

    const providerStatus = await this.queryProviderPaymentStatus(payment);
    if (
      providerStatus.status !== "paid" ||
      !providerStatus.paidAt ||
      providerStatus.tradeNo !== params.trade_no.trim()
    ) {
      throw new GeoPaymentVerificationError(
        "支付平台尚未返回可持久化的最终交易结果",
        "PAYMENT_CALLBACK_NOT_SETTLED",
        502,
      );
    }
    return this.persistPaidStatus(opened, providerStatus);
  }

  private openAndVerifyScope(input: GeoPaymentVerificationInput) {
    assertPaymentScope(input);
    const opened = this.openPaymentToken(input.authorization);
    const payment = opened.payment;
    if (
      payment.purchaseType === "service" ||
      payment.projectId !== input.projectId ||
      payment.questionId !== input.questionId ||
      payment.amountFen !== input.expectedAmountFen ||
      !samePlatforms(payment.platformIds, input.platformIds) ||
      payment.ownerSessionId !== input.ownerSessionId
    ) {
      throw new GeoPaymentVerificationError(
        "支付订单与本次监控范围不匹配",
        "PAYMENT_SCOPE_MISMATCH",
        402,
      );
    }
    return opened;
  }

  private openAndVerifyServiceScope(input: GeoServicePaymentVerificationInput) {
    assertServicePaymentScope(input);
    const opened = this.openPaymentToken(input.authorization);
    const payment = opened.payment;
    if (
      payment.purchaseType !== "service" ||
      payment.projectId !== input.projectId ||
      payment.questionId !== input.questionId ||
      payment.category !== input.category ||
      payment.amountFen !== input.expectedAmountFen ||
      payment.ownerSessionId !== input.ownerSessionId
    ) {
      throw new GeoPaymentVerificationError(
        "支付订单与本次服务范围不匹配",
        "PAYMENT_SCOPE_MISMATCH",
        402,
      );
    }
    return opened;
  }

  private openPaymentToken(authorization: string) {
    try {
      const opened = this.codec.open<ZpayPaymentTokenValue>(
        authorization,
        "payment",
        {
          expirationGraceMs: PAYMENT_CALLBACK_RECORDING_GRACE_MS,
        },
      );
      return {
        checkoutExpiresAt: opened.expiresAt,
        payment: opened.value,
      } satisfies OpenedZpayPayment;
    } catch (error) {
      if (error instanceof GeoTokenExpiredError) {
        throw new GeoPaymentVerificationError(
          "支付凭证已超过最长自动记录窗口，请联系技术支持并提供订单号；在人工核对前请勿重复支付",
          "PAYMENT_RECONCILIATION_EXPIRED",
          410,
        );
      }
      if (error instanceof GeoTokenError) {
        throw new GeoPaymentVerificationError(
          "支付订单凭证无效或已过期",
          "PAYMENT_AUTHORIZATION_INVALID",
          401,
        );
      }
      throw error;
    }
  }

  private receiptLookup(opened: OpenedZpayPayment) {
    const scopeHash = paymentScopeHash(opened.payment);
    return {
      orderId: opened.payment.outTradeNo,
      scopeHash,
      // Sealed checkout tokens intentionally use a random IV. Bind the ledger
      // to the authenticated purchase scope so recreating the same checkout
      // cannot turn a legitimate paid order into a receipt conflict.
      authorizationDigest: sha256(
        JSON.stringify({
          schemaVersion: 1,
          orderId: opened.payment.outTradeNo,
          scopeHash,
        }),
      ),
    };
  }

  private async assertReceiptStoreReady() {
    await this.withReceiptStore(
      () => this.receiptStore.assertReady(),
      "支付回执账本暂时不可用，已阻止创建收银台",
    );
  }

  private async findStoredReceipt(opened: OpenedZpayPayment) {
    const receipt = await this.withReceiptStore(
      () => this.receiptStore.find(this.receiptLookup(opened)),
      "暂时无法查询已保存的支付回执",
    );
    if (receipt) this.assertStoredReceiptMatches(opened, receipt);
    return receipt;
  }

  private async persistPaidStatus(
    opened: OpenedZpayPayment,
    status: ProviderPaymentStatus,
  ) {
    if (
      status.status !== "paid" ||
      !status.tradeNo?.trim() ||
      !status.paidAt ||
      !status.providerCreatedAt ||
      !Number.isFinite(Date.parse(status.providerCreatedAt)) ||
      !Number.isFinite(Date.parse(status.paidAt)) ||
      Date.parse(status.providerCreatedAt) < EARLIEST_SUPPORTED_PAYMENT_MS ||
      Date.parse(status.paidAt) < EARLIEST_SUPPORTED_PAYMENT_MS ||
      Date.parse(status.paidAt) >
        this.now().getTime() + MAX_PROVIDER_CLOCK_SKEW_MS
    ) {
      throw new GeoPaymentVerificationError(
        "支付结果缺少可持久化的交易事实",
        "PAYMENT_QUERY_INVALID",
        502,
      );
    }
    const lookup = this.receiptLookup(opened);
    const automaticFulfillmentCutoff = Math.min(
      opened.checkoutExpiresAt + PAYMENT_AUTOMATIC_FULFILLMENT_GRACE_MS,
      Date.parse(status.providerCreatedAt) +
        PAYMENT_TOKEN_TTL_MS +
        PAYMENT_AUTOMATIC_FULFILLMENT_GRACE_MS,
    );
    const receipt: GeoStoredPaymentReceipt = {
      ...lookup,
      tradeNo: status.tradeNo.trim(),
      amountFen: opened.payment.amountFen,
      paidAt: status.paidAt,
      purchaseType:
        opened.payment.purchaseType === "service" ? "service" : "monitoring",
      reviewRequired: Date.parse(status.paidAt) > automaticFulfillmentCutoff,
    };
    const stored = await this.withReceiptStore(
      () => this.receiptStore.record(receipt),
      "付款已确认，但支付回执暂未安全保存",
    );
    this.assertStoredReceiptMatches(opened, stored);
    if (
      stored.tradeNo !== receipt.tradeNo ||
      stored.paidAt !== receipt.paidAt ||
      stored.reviewRequired !== receipt.reviewRequired
    ) {
      throw new GeoPaymentVerificationError(
        "支付回执与本次交易事实不一致",
        "PAYMENT_RECEIPT_CONFLICT",
        409,
      );
    }
    return this.statusFromStoredReceipt(opened, stored);
  }

  private statusFromStoredReceipt(
    opened: OpenedZpayPayment,
    receipt: GeoStoredPaymentReceipt,
  ): GeoPaymentStatus {
    this.assertStoredReceiptMatches(opened, receipt);
    return {
      status: receipt.reviewRequired ? "review_required" : "paid",
      orderId: receipt.orderId,
      amountFen: receipt.amountFen,
      tradeNo: receipt.tradeNo,
      paidAt: receipt.paidAt,
      ...(receipt.reviewRequired
        ? { message: "付款已安全入账，但超过自动履约窗口，需要人工核对" }
        : {}),
    };
  }

  private assertStoredReceiptMatches(
    opened: OpenedZpayPayment,
    receipt: GeoStoredPaymentReceipt,
  ) {
    const lookup = this.receiptLookup(opened);
    const expectedPurchaseType =
      opened.payment.purchaseType === "service" ? "service" : "monitoring";
    if (
      receipt.orderId !== lookup.orderId ||
      receipt.scopeHash !== lookup.scopeHash ||
      receipt.authorizationDigest !== lookup.authorizationDigest ||
      receipt.amountFen !== opened.payment.amountFen ||
      receipt.purchaseType !== expectedPurchaseType ||
      !receipt.tradeNo.trim() ||
      !Number.isFinite(Date.parse(receipt.paidAt))
    ) {
      throw new GeoPaymentVerificationError(
        "支付回执与原订单范围不一致",
        "PAYMENT_RECEIPT_MISMATCH",
        502,
      );
    }
  }

  private async withReceiptStore<T>(
    operation: () => Promise<T>,
    fallbackMessage: string,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof GeoPaymentVerificationError) throw error;
      if (error instanceof GeoAccountProvisioningError) {
        throw new GeoPaymentVerificationError(
          error.message || fallbackMessage,
          error.code,
          error.status,
        );
      }
      throw new GeoPaymentVerificationError(
        fallbackMessage,
        "PAYMENT_LEDGER_UNAVAILABLE",
        503,
      );
    }
  }
}

export function createGeoPaymentGatewayFromEnv(
  env: NodeJS.ProcessEnv,
  codec: GeoTokenCodec,
): GeoPaymentGateway {
  const config = zpayConfigurationFromEnv(env);
  if (!config) {
    return new UnconfiguredGeoPaymentGateway();
  }
  try {
    return new ZpayGeoPaymentGateway(
      config,
      codec,
      {
        receiptStore: createGeoPaymentReceiptStore({ env }),
      },
    );
  } catch {
    return new UnconfiguredGeoPaymentGateway(
      "在线支付服务暂不可用，请联系技术人员",
    );
  }
}

/**
 * Production startup guard. Payment must never be presented as available when
 * the merchant identity, signing key, or public callback origin is absent or
 * malformed. The error deliberately excludes all configured values.
 */
export function assertGeoPaymentConfigurationFromEnv(
  env: NodeJS.ProcessEnv,
): void {
  const config = zpayConfigurationFromEnv(env);
  if (!config) {
    throw new GeoPaymentConfigurationError(
      "Required ZPAY payment configuration is missing",
    );
  }
  try {
    assertZpayConfiguration(config);
  } catch {
    throw new GeoPaymentConfigurationError();
  }
}

/**
 * Read-only live merchant preflight used by the release gate. It validates the
 * exact credentials against ZPAY without creating an order or exposing balance
 * or credential values in its result.
 */
export async function verifyGeoPaymentProviderFromEnv(
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<{ status: "ok"; provider: "zpay"; callbackOrigin: string }> {
  assertGeoPaymentConfigurationFromEnv(env);
  const config = zpayConfigurationFromEnv(env)!;
  const query = new URL(ZPAY_ORDER_QUERY_URL);
  query.searchParams.set("act", "balance");
  query.searchParams.set("pid", config.pid);
  query.searchParams.set("key", config.key);

  let response: Response;
  try {
    response = await fetchImpl(query, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw paymentProviderReadinessError();
  }
  if (!response.ok) throw paymentProviderReadinessError();

  let result: Record<string, unknown>;
  try {
    result = asRecord(JSON.parse(await readBoundedResponseText(response)));
  } catch (error) {
    if (error instanceof GeoPaymentVerificationError) throw error;
    throw paymentProviderReadinessError();
  }
  if (String(result.code ?? "") !== "1") {
    throw paymentProviderReadinessError();
  }

  return {
    status: "ok",
    provider: "zpay",
    callbackOrigin: new URL(config.publicBaseUrl).origin,
  };
}

export class UnconfiguredGeoPaymentGateway implements GeoPaymentGateway {
  constructor(
    private readonly message = "在线支付服务暂不可用，请联系技术人员",
  ) {}

  async createCheckout(): Promise<GeoPaymentCheckout> {
    throw this.error();
  }

  async createServiceCheckout(): Promise<GeoPaymentCheckout> {
    throw this.error();
  }

  async getStatus(): Promise<GeoPaymentStatus> {
    throw this.error();
  }

  async getServiceStatus(): Promise<GeoPaymentStatus> {
    throw this.error();
  }

  async verifyCallback(): Promise<GeoPaymentStatus> {
    throw this.error();
  }

  async verify(): Promise<GeoPaymentReceipt> {
    throw this.error();
  }

  async verifyService(): Promise<GeoPaymentReceipt> {
    throw this.error();
  }

  private error() {
    return new GeoPaymentVerificationError(
      this.message,
      "PAYMENT_NOT_CONFIGURED",
      503,
    );
  }
}

/**
 * Compatibility boundary for callers that only inject payment verification.
 * Production uses the complete gateway created from server-side environment.
 */
export class UnconfiguredGeoPaymentVerifier extends UnconfiguredGeoPaymentGateway {}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function paymentScopeHash(payment: ZpayPaymentTokenValue) {
  return sha256(
    JSON.stringify({
      purchaseType:
        payment.purchaseType === "service" ? "service" : "monitoring",
      ownerSessionDigest: sha256(payment.ownerSessionId),
      projectIdDigest: sha256(payment.projectId),
      questionIdDigest: sha256(payment.questionId),
      amountFen: payment.amountFen,
      ...(payment.purchaseType === "service"
        ? { category: payment.category }
        : { platformIds: normalizedPlatforms(payment.platformIds) }),
    }),
  );
}

function zpayConfigurationFromEnv(
  env: NodeJS.ProcessEnv,
): ZpayGatewayConfig | undefined {
  const pid = env.FRONTMIND_ZPAY_PID?.trim() || "";
  const key = env.FRONTMIND_ZPAY_KEY?.trim() || "";
  const publicBaseUrl =
    env.FRONTMIND_PUBLIC_BASE_URL?.trim() ||
    env.FRONTMIND_PUBLIC_URL?.trim() ||
    "";
  if (!pid || !key || !publicBaseUrl) return undefined;
  return {
    pid,
    key,
    publicBaseUrl,
    channelIds: env.FRONTMIND_ZPAY_CID?.trim() || undefined,
    production: env.NODE_ENV === "production",
  };
}

function assertZpayConfiguration(config: ZpayGatewayConfig) {
  if (!/^[A-Za-z0-9]{2,64}$/.test(config.pid)) {
    throw new Error("Invalid ZPAY pid");
  }
  if (config.key.length < 8) throw new Error("Invalid ZPAY key");
  const publicBaseUrl = new URL(config.publicBaseUrl);
  if (
    !["http:", "https:"].includes(publicBaseUrl.protocol) ||
    publicBaseUrl.username ||
    publicBaseUrl.password ||
    publicBaseUrl.search ||
    publicBaseUrl.hash
  ) {
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

function isPublicCallbackHostname(value: string) {
  const hostname = value.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname === "0.0.0.0" ||
    hostname === "::1"
  )
    return false;
  if (
    hostname.includes(":") &&
    (/^f[cd]/.test(hostname) || /^fe[89ab]/.test(hostname))
  )
    return false;
  const ipv4 = hostname.match(/^(\d{1,3})(?:\.(\d{1,3})){3}$/);
  if (!ipv4) return true;
  const octets = hostname.split(".").map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return false;
  return !(
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

function assertPaymentScope(
  input: Pick<
    GeoPaymentVerificationInput,
    "projectId" | "questionId" | "platformIds" | "expectedAmountFen"
  >,
) {
  if (
    !input.projectId.trim() ||
    !input.questionId.trim() ||
    input.platformIds.length === 0 ||
    normalizedPlatforms(input.platformIds).length !==
      input.platformIds.length ||
    !Number.isSafeInteger(input.expectedAmountFen) ||
    input.expectedAmountFen !== input.platformIds.length * 200
  ) {
    throw new GeoPaymentVerificationError(
      "支付订单范围无效",
      "PAYMENT_SCOPE_INVALID",
      400,
    );
  }
}

function assertServicePaymentScope(
  input: Pick<
    GeoServicePaymentVerificationInput,
    "projectId" | "questionId" | "category" | "expectedAmountFen"
  >,
) {
  if (
    !input.projectId.trim() ||
    !input.questionId.trim() ||
    !Object.hasOwn(GEO_SERVICE_MONTHLY_PRICE_FEN, input.category) ||
    !Number.isSafeInteger(input.expectedAmountFen) ||
    input.expectedAmountFen !== GEO_SERVICE_MONTHLY_PRICE_FEN[input.category]
  ) {
    throw new GeoPaymentVerificationError(
      "服务订单范围无效",
      "PAYMENT_SCOPE_INVALID",
      400,
    );
  }
}

function serviceCategoryLabel(category: GeoServiceCategory) {
  if (category === "product_scenario") return "产品与服务 Q&A";
  if (category === "competitor_comparison") return "竞品对比";
  return "美誉舆情";
}

function assertOrderMatchesPayment(
  order: Record<string, unknown>,
  payment: ZpayPaymentTokenValue,
  pid: string,
) {
  if (
    textValue(order.out_trade_no) !== payment.outTradeNo ||
    moneyToFen(textValue(order.money)) !== payment.amountFen ||
    textValue(order.pid) !== pid ||
    !["alipay", "wxpay"].includes(textValue(order.type) || "") ||
    textValue(order.name) !== payment.productName
  ) {
    throw new GeoPaymentVerificationError(
      "支付平台返回的订单范围不匹配",
      "PAYMENT_SCOPE_MISMATCH",
      402,
    );
  }
}

function normalizedPlatforms(platformIds: GeoMonitorPlatformId[]) {
  return Array.from(new Set(platformIds)).sort() as GeoMonitorPlatformId[];
}

function samePlatforms(
  left: GeoMonitorPlatformId[],
  right: GeoMonitorPlatformId[],
) {
  const normalizedLeft = normalizedPlatforms(left);
  const normalizedRight = normalizedPlatforms(right);
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  );
}

function createNumericOrderId(
  input: GeoPaymentCheckoutInput | GeoServicePaymentCheckoutInput,
  merchantKey: string,
) {
  const purchaseScope =
    "platformIds" in input
      ? {
          purchaseType: "monitoring",
          platformIds: normalizedPlatforms(input.platformIds),
        }
      : {
          purchaseType: "service",
          category: input.category,
        };
  const digest = crypto
    .createHmac("sha256", merchantKey)
    .update(
      JSON.stringify({
        projectId: input.projectId,
        questionId: input.questionId,
        ...purchaseScope,
        amountFen: input.expectedAmountFen,
      }),
      "utf8",
    )
    .digest("hex");
  const decimal = BigInt(`0x${digest}`).toString(10).padStart(78, "0");
  return `1${decimal.slice(0, 31)}`;
}

async function readBoundedResponseText(response: Response) {
  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader) {
    const declaredLength = Number(lengthHeader);
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > MAX_ZPAY_RESPONSE_BYTES
    ) {
      throw new GeoPaymentVerificationError(
        "支付结果响应异常",
        "PAYMENT_QUERY_INVALID",
        502,
      );
    }
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_ZPAY_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new GeoPaymentVerificationError(
          "支付结果响应异常",
          "PAYMENT_QUERY_INVALID",
          502,
        );
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, totalBytes).toString("utf8");
}

function isMissingProviderOrder(message: string) {
  return /(?:订单.*(?:不存在|未找到|未创建)|查询不到.*订单|order.*(?:not\s+found|missing))/i.test(
    message,
  );
}

function formatMoney(amountFen: number) {
  return (amountFen / 100).toFixed(2);
}

function moneyToFen(value: unknown) {
  const text = textValue(value);
  if (!text || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) return NaN;
  const [yuan, decimal = ""] = text.split(".");
  const amount = Number(yuan) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? amount : NaN;
}

function normalizeZpayDate(value?: string) {
  if (!value) return undefined;
  const chinaTime = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/,
  );
  const normalized = chinaTime
    ? `${chinaTime[1]}-${chinaTime[2]}-${chinaTime[3]}T${chinaTime[4]}:${chinaTime[5]}:${chinaTime[6]}+08:00`
    : value;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : undefined;
}

function safeDigestEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return (
    leftBytes.length === rightBytes.length &&
    crypto.timingSafeEqual(leftBytes, rightBytes)
  );
}

function callbackError() {
  return new GeoPaymentVerificationError(
    "支付通知验签失败",
    "PAYMENT_CALLBACK_INVALID",
    400,
  );
}

function paymentProviderReadinessError() {
  return new GeoPaymentVerificationError(
    "ZPAY 商户连接验证失败",
    "PAYMENT_PROVIDER_NOT_READY",
    503,
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function textValue(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}
