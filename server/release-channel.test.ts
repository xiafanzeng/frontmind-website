import { describe, expect, it } from "vitest";
import {
  releaseProfile,
  type FrontMindReleaseChannel,
  type FrontMindReleaseProfile,
} from "../config/release-profile.mjs";
import {
  assertFrontMindReleaseRuntime,
  frontmindReleaseChannel,
  resolveFrontMindPaymentMode,
} from "./release-channel";

const expectedRuntimeEnvironment = {
  FRONTMIND_PUBLIC_BASE_URL: "https://site.example.invalid",
  FRONTMIND_PRESALES_AGENT_URL:
    "http://agent.internal.invalid/api/internal/presales/v2",
  FRONTMIND_AGENT_PROVISIONING_URL:
    "http://agent.internal.invalid/api/internal/provisioning",
  FRONTMIND_AGENT_INTERNAL_HTTP_HOSTS: "agent.internal.invalid",
} as const;

function profile(channel: FrontMindReleaseChannel): FrontMindReleaseProfile {
  return {
    deploymentTarget: "net",
    channel,
    siteUrl: "https://site.example.invalid",
    clientPortalUrl: "https://portal.example.invalid/login",
    robotsDirective: channel === "production" ? "index, follow" : "noindex",
    publishSearchIndexes: channel === "production",
    requireAgentCredential: channel === "production",
    expectedRuntimeEnvironment,
  };
}

describe("Website release channel", () => {
  it.each(["development", "production"] as const)(
    "uses the signed ZPAY gateway in %s",
    (channel) => {
      expect(resolveFrontMindPaymentMode({}, channel)).toBe("zpay");
      expect(
        resolveFrontMindPaymentMode(
          { FRONTMIND_PAYMENT_MODE: "zpay" },
          channel,
        ),
      ).toBe("zpay");
      expect(() =>
        resolveFrontMindPaymentMode(
          { FRONTMIND_PAYMENT_MODE: "disabled" },
          channel,
        ),
      ).toThrow(
        channel === "development"
          ? "FRONTMIND_DEV_PAYMENT_MUST_USE_ZPAY"
          : "FRONTMIND_PRODUCTION_PAYMENT_MUST_USE_ZPAY",
      );
    },
  );

  it.each(["development", "production"] as const)(
    "pins the %s runtime to its compiled profile",
    (channel) => {
      const selectedProfile = profile(channel);
      const validEnvironment = {
        FRONTMIND_RELEASE_CHANNEL: channel,
        FRONTMIND_PAYMENT_MODE: "zpay",
        ...selectedProfile.expectedRuntimeEnvironment,
      };
      expect(
        assertFrontMindReleaseRuntime(validEnvironment, selectedProfile),
      ).toEqual({ channel, paymentMode: "zpay" });
      expect(() =>
        assertFrontMindReleaseRuntime(
          {
            ...validEnvironment,
            FRONTMIND_PUBLIC_BASE_URL: "https://wrong.example.invalid",
          },
          selectedProfile,
        ),
      ).toThrow(
        `FRONTMIND_${channel === "development" ? "DEV" : "PRODUCTION"}_ENDPOINT_INVALID:FRONTMIND_PUBLIC_BASE_URL`,
      );
    },
  );

  it("rejects a runtime attempt to change the compiled channel", () => {
    const selectedProfile = profile("development");
    expect(() =>
      assertFrontMindReleaseRuntime(
        {
          FRONTMIND_RELEASE_CHANNEL: "production",
          FRONTMIND_PAYMENT_MODE: "zpay",
          ...selectedProfile.expectedRuntimeEnvironment,
        },
        selectedProfile,
      ),
    ).toThrow("FRONTMIND_RELEASE_CHANNEL_RUNTIME_OVERRIDE_REJECTED");
  });

  it("keeps the checked-in profile internally consistent", () => {
    expect(frontmindReleaseChannel(releaseProfile)).toBe(
      releaseProfile.channel,
    );
    expect(new URL(releaseProfile.siteUrl).protocol).toBe("https:");
    expect(new URL(releaseProfile.clientPortalUrl).protocol).toBe("https:");
    expect(releaseProfile.publishSearchIndexes).toBe(
      releaseProfile.channel === "production",
    );
    expect(releaseProfile.requireAgentCredential).toBe(
      releaseProfile.channel === "production",
    );
  });
});
