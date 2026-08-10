import { describe, expect, it, vi } from "vitest";
import { collectWebsiteRuntimeReadiness } from "./runtime-readiness";

describe("Website runtime readiness", () => {
  it("reports deep dependencies and hashes the private persistence identity", async () => {
    const assertReady = vi.fn(async () => undefined);
    const readiness = await collectWebsiteRuntimeReadiness({
      releaseChannel: "development",
      paymentMode: "zpay",
      buildSha: "a".repeat(40),
      imageDigest: `sha256:${"b".repeat(64)}`,
      requireReleaseIdentity: true,
      getSkills: async () => [{ name: "website-one-shot-kb-builder" }],
      getDependencies: async () => ({ agent: { ready: true } }),
      getVisitorStats: async () => ({ ready: true as const }),
      validationStore: {
        assertReady,
        persistenceIdentity: async () => "private-store-identity",
      },
    });

    expect(assertReady).toHaveBeenCalledOnce();
    expect(readiness).toMatchObject({
      status: "ok",
      channel: "development",
      releaseChannel: "development",
      paymentMode: "zpay",
      buildSha: "a".repeat(40),
      imageDigest: `sha256:${"b".repeat(64)}`,
      skills: [{ name: "website-one-shot-kb-builder" }],
      dependencies: {
        agent: { ready: true },
        visitorStats: { ready: true },
        customQuestionValidationStore: {
          ready: true,
          persistenceIdentitySha256:
            "081f96b84cfd9c324883029d8e83b40e3778cb0ee3a29c9b281c41965693eab7",
        },
      },
    });
  });

  it("fails readiness when a required dependency is unavailable", async () => {
    await expect(
      collectWebsiteRuntimeReadiness({
        releaseChannel: "development",
        paymentMode: "zpay",
        buildSha: null,
        imageDigest: null,
        getSkills: async () => [],
        getDependencies: async () => {
          throw new Error("agent unavailable");
        },
        getVisitorStats: async () => ({ ready: true as const }),
        validationStore: {
          assertReady: async () => undefined,
          persistenceIdentity: async () => "store",
        },
      }),
    ).rejects.toThrow("agent unavailable");
  });

  it("fails startup and readiness before probing dependencies when configuration is unsafe", async () => {
    const getDependencies = vi.fn(async () => ({}));
    await expect(
      collectWebsiteRuntimeReadiness({
        releaseChannel: "development",
        paymentMode: "zpay",
        buildSha: null,
        imageDigest: null,
        assertConfiguration: () => {
          throw new Error("GEO_RUNTIME_CONFIGURATION_INVALID");
        },
        getSkills: async () => [],
        getDependencies,
        getVisitorStats: async () => ({ ready: true as const }),
        validationStore: {
          assertReady: async () => undefined,
          persistenceIdentity: async () => "store",
        },
      }),
    ).rejects.toThrow("GEO_RUNTIME_CONFIGURATION_INVALID");
    expect(getDependencies).not.toHaveBeenCalled();
  });

  it("fails production preflight without an immutable source and image identity", async () => {
    await expect(
      collectWebsiteRuntimeReadiness({
        releaseChannel: "production",
        paymentMode: "zpay",
        buildSha: "a".repeat(40),
        imageDigest: null,
        requireReleaseIdentity: true,
        getSkills: async () => [],
        getDependencies: async () => ({}),
        getVisitorStats: async () => ({ ready: true as const }),
        validationStore: {
          assertReady: async () => undefined,
          persistenceIdentity: async () => "store",
        },
      }),
    ).rejects.toThrow("WEBSITE_RELEASE_IDENTITY_INVALID");
  });
});
