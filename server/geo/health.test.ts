import { describe, expect, it, vi } from "vitest";
import type { GeoPresalesBroker } from "./broker";
import type {
  GeoPaymentReceiptStore,
  GeoProjectOrderRegistry,
} from "./provisioning";
import {
  createGeoDependencyHealthChecker,
  geoPublicBuildSha,
  geoReadinessErrorLabel,
} from "./health";

function dependencies() {
  const broker = {
    getStatus: vi.fn(async () => ({
      ok: true,
      credentialConfigured: true,
      monitorCredentialConfigured: true,
      publicUrlConfigured: true,
    })),
  } as unknown as GeoPresalesBroker;
  const projectOrderRegistry = {
    assertReady: vi.fn(async () => undefined),
  } as unknown as GeoProjectOrderRegistry;
  const paymentReceiptStore = {
    assertReady: vi.fn(async () => undefined),
  } as unknown as GeoPaymentReceiptStore;
  return { broker, projectOrderRegistry, paymentReceiptStore };
}

describe("GEO dependency health", () => {
  it("exposes only a validated non-secret build SHA", () => {
    expect(geoPublicBuildSha({ FRONTMIND_BUILD_SHA: "AbCdEf1234567" })).toBe(
      "abcdef1234567",
    );
    expect(geoPublicBuildSha({ FRONTMIND_BUILD_SHA: "deploy-secret" })).toBeNull();
    expect(geoPublicBuildSha({})).toBeNull();
  });

  it("reduces readiness errors to a secret-free class label", () => {
    const sensitive = new Error(
      "https://agent.internal/api?token=super-secret-value",
    );
    expect(geoReadinessErrorLabel(sensitive)).toBe("Error");
    expect(geoReadinessErrorLabel("super-secret-value")).toBe("UnknownError");
    expect(JSON.stringify(geoReadinessErrorLabel(sensitive))).not.toContain(
      "agent.internal",
    );
    expect(JSON.stringify(geoReadinessErrorLabel(sensitive))).not.toContain(
      "super-secret-value",
    );
  });

  it("requires both the Agent capabilities and durable order registry", async () => {
    const ready = dependencies();
    const check = createGeoDependencyHealthChecker(ready);
    await expect(check()).resolves.toMatchObject({
      status: "ok",
      agent: {
        credentialConfigured: true,
        monitorCredentialConfigured: true,
        publicUrlConfigured: true,
      },
      projectOrderRegistry: { ready: true },
      paymentReceiptLedger: { ready: true },
    });

    const agentUnavailable = dependencies();
    vi.mocked(agentUnavailable.broker.getStatus).mockResolvedValue({
      ok: true,
      credentialConfigured: true,
      monitorCredentialConfigured: false,
      publicUrlConfigured: true,
    });
    await expect(
      createGeoDependencyHealthChecker(agentUnavailable)(),
    ).rejects.toThrow("not ready");

    const registryUnavailable = dependencies();
    vi.mocked(
      registryUnavailable.projectOrderRegistry.assertReady,
    ).mockRejectedValue(new Error("database unavailable"));
    await expect(
      createGeoDependencyHealthChecker(registryUnavailable)(),
    ).rejects.toThrow("database unavailable");

    const receiptLedgerUnavailable = dependencies();
    vi.mocked(
      receiptLedgerUnavailable.paymentReceiptStore.assertReady,
    ).mockRejectedValue(new Error("payment receipt table unavailable"));
    await expect(
      createGeoDependencyHealthChecker(receiptLedgerUnavailable)(),
    ).rejects.toThrow("payment receipt table unavailable");
  });

  it("coalesces concurrent checks and briefly caches successful readiness", async () => {
    const ready = dependencies();
    let now = 1_000;
    const check = createGeoDependencyHealthChecker({
      ...ready,
      cacheTtlMs: 2_000,
      now: () => now,
    });

    await Promise.all([check(), check(), check()]);
    await check();
    expect(ready.broker.getStatus).toHaveBeenCalledTimes(1);
    expect(ready.projectOrderRegistry.assertReady).toHaveBeenCalledTimes(1);
    expect(ready.paymentReceiptStore.assertReady).toHaveBeenCalledTimes(1);

    now += 2_001;
    await check();
    expect(ready.broker.getStatus).toHaveBeenCalledTimes(2);
    expect(ready.projectOrderRegistry.assertReady).toHaveBeenCalledTimes(2);
    expect(ready.paymentReceiptStore.assertReady).toHaveBeenCalledTimes(2);
  });
});
