import crypto from "node:crypto";

const DEFAULT_TIMEOUT_MS = 5_000;
const PLACEHOLDER_MARKERS = [
  "replace-with",
  "replace_with",
  "change-me",
  "change_me",
  "placeholder",
  "example",
  "your-secret",
  "your_secret",
];

export type GeoAdminNotification = {
  schemaVersion: 1;
  event: "manual_order_submitted";
  eventId: string;
  orderReference: string;
  projectId: string;
  companyName: string;
  serviceCategory: "product_scenario" | "reputation" | "competitor_comparison";
  amountFen: number;
  submittedAt: string;
};

export type GeoAdminNotificationResult = {
  delivery: "delivered" | "disabled";
};

export type GeoAdminNotifier = {
  notify(
    notification: GeoAdminNotification,
  ): Promise<GeoAdminNotificationResult>;
};

export class GeoAdminNotificationConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeoAdminNotificationConfigurationError";
  }
}

export class GeoAdminNotificationDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeoAdminNotificationDeliveryError";
  }
}

type GeoAdminNotifierOptions = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
};

const disabledNotifier: GeoAdminNotifier = {
  async notify() {
    return { delivery: "disabled" };
  },
};

function usableSecret(value: string) {
  const normalized = value.trim();
  const lower = normalized.toLowerCase();
  return (
    normalized.length >= 32 &&
    !PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker))
  );
}

function configuredEndpoint(raw: string) {
  let endpoint: URL;
  try {
    endpoint = new URL(raw);
  } catch {
    throw new GeoAdminNotificationConfigurationError(
      "GEO 管理员提醒 Webhook 地址无效",
    );
  }
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new GeoAdminNotificationConfigurationError(
      "GEO 管理员提醒 Webhook 必须使用无凭据、无查询参数的 HTTPS 地址",
    );
  }
  return endpoint;
}

/**
 * Relay receiver contract:
 * - verify HMAC-SHA256(secret, `${timestamp}.${rawBody}`) in
 *   X-FrontMind-Signature with a constant-time comparison;
 * - reject stale X-FrontMind-Timestamp values;
 * - deduplicate the stable Idempotency-Key before forwarding to email or
 *   enterprise WeChat.
 */
export function createGeoAdminNotifierFromEnv(
  options: GeoAdminNotifierOptions = {},
): GeoAdminNotifier {
  const env = options.env ?? process.env;
  const rawEndpoint = env.FRONTMIND_GEO_ADMIN_WEBHOOK_URL?.trim() ?? "";
  const secret = env.FRONTMIND_GEO_ADMIN_WEBHOOK_SECRET?.trim() ?? "";
  if (!rawEndpoint && !secret) return disabledNotifier;
  if (!rawEndpoint || !usableSecret(secret)) {
    throw new GeoAdminNotificationConfigurationError(
      "GEO 管理员提醒 Webhook 必须同时配置 HTTPS 地址和至少 32 位随机密钥",
    );
  }

  const endpoint = configuredEndpoint(rawEndpoint);
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async notify(notification) {
      const body = JSON.stringify(notification);
      const timestamp = now().toISOString();
      const signature = crypto
        .createHmac("sha256", secret)
        .update(`${timestamp}.${body}`)
        .digest("hex");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(endpoint, {
          method: "POST",
          redirect: "error",
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "Idempotency-Key": notification.eventId,
            "X-FrontMind-Event": notification.event,
            "X-FrontMind-Timestamp": timestamp,
            "X-FrontMind-Signature": `sha256=${signature}`,
          },
          body,
        });
        if (!response.ok) {
          throw new GeoAdminNotificationDeliveryError(
            `GEO 管理员提醒接收端返回 HTTP ${response.status}`,
          );
        }
        return { delivery: "delivered" };
      } catch (error) {
        if (error instanceof GeoAdminNotificationDeliveryError) throw error;
        throw new GeoAdminNotificationDeliveryError(
          controller.signal.aborted
            ? "GEO 管理员提醒发送超时"
            : "GEO 管理员提醒暂时无法送达",
        );
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
