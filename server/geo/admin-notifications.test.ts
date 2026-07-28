import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  createGeoAdminNotifierFromEnv,
  GeoAdminNotificationConfigurationError,
  GeoAdminNotificationDeliveryError,
  type GeoAdminNotification,
} from "./admin-notifications";

const notification: GeoAdminNotification = {
  schemaVersion: 1,
  event: "manual_order_submitted",
  eventId: "geo-manual:manual-order-001:submitted-v1",
  orderReference: "manual-order-001",
  projectId: "project-20260726",
  companyName: "Acme",
  serviceCategory: "product_scenario",
  amountFen: 150_000,
  submittedAt: "2026-07-26T11:00:00.000Z",
};

describe("GEO administrator notifications", () => {
  it("stays disabled when no channel is configured", async () => {
    const fetchImpl = vi.fn();
    const notifier = createGeoAdminNotifierFromEnv({
      env: {},
      fetchImpl,
    });

    await expect(notifier.notify(notification)).resolves.toEqual({
      delivery: "disabled",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    {
      FRONTMIND_GEO_ADMIN_WEBHOOK_URL: "https://notify.example.com/geo",
    },
    {
      FRONTMIND_GEO_ADMIN_WEBHOOK_SECRET: "a".repeat(48),
    },
    {
      FRONTMIND_GEO_ADMIN_WEBHOOK_URL: "http://notify.example.com/geo",
      FRONTMIND_GEO_ADMIN_WEBHOOK_SECRET: "a".repeat(48),
    },
    {
      FRONTMIND_GEO_ADMIN_WEBHOOK_URL:
        "https://notify.example.com/geo?token=secret",
      FRONTMIND_GEO_ADMIN_WEBHOOK_SECRET: "a".repeat(48),
    },
  ])("rejects incomplete or unsafe configuration", (env) => {
    expect(() => createGeoAdminNotifierFromEnv({ env })).toThrow(
      GeoAdminNotificationConfigurationError,
    );
  });

  it("signs a minimal PII-free event for an HTTPS relay", async () => {
    const secret = "a".repeat(48);
    const now = new Date("2026-07-26T11:01:00.000Z");
    const fetchImpl = vi.fn(async (_url: URL, init?: RequestInit) => {
      const body = String(init?.body);
      const signature = crypto
        .createHmac("sha256", secret)
        .update(`${now.toISOString()}.${body}`)
        .digest("hex");
      expect(_url.toString()).toBe("https://notify.example.com/geo");
      expect(init).toMatchObject({
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": notification.eventId,
          "X-FrontMind-Event": "manual_order_submitted",
          "X-FrontMind-Timestamp": now.toISOString(),
          "X-FrontMind-Signature": `sha256=${signature}`,
        },
      });
      expect(JSON.parse(body)).toEqual(notification);
      expect(body).not.toMatch(/mobile|email|password|creditCode/i);
      return new Response(null, { status: 204 });
    });
    const notifier = createGeoAdminNotifierFromEnv({
      env: {
        FRONTMIND_GEO_ADMIN_WEBHOOK_URL: "https://notify.example.com/geo",
        FRONTMIND_GEO_ADMIN_WEBHOOK_SECRET: secret,
      },
      fetchImpl,
      now: () => now,
    });

    await expect(notifier.notify(notification)).resolves.toEqual({
      delivery: "delivered",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns a sanitized delivery error without exposing endpoint secrets", async () => {
    const notifier = createGeoAdminNotifierFromEnv({
      env: {
        FRONTMIND_GEO_ADMIN_WEBHOOK_URL:
          "https://notify.example.com/private/relay",
        FRONTMIND_GEO_ADMIN_WEBHOOK_SECRET: "b".repeat(48),
      },
      fetchImpl: vi.fn(async () => new Response(null, { status: 503 })),
    });

    await expect(notifier.notify(notification)).rejects.toEqual(
      expect.objectContaining({
        name: GeoAdminNotificationDeliveryError.name,
        message: "GEO 管理员提醒接收端返回 HTTP 503",
      }),
    );
  });
});
