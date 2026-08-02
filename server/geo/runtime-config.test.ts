import { describe, expect, it } from "vitest";

import {
  assertGeoRuntimeConfigurationFromEnv,
  resolveGeoRuntimeConfiguration,
} from "./runtime-config";

const secureProductionEnv = {
  NODE_ENV: "production",
  FRONTMIND_GEO_INVITE_CODE: "invite-code-that-is-long-enough",
  FRONTMIND_GEO_SESSION_SECRET: "s".repeat(32),
  FRONTMIND_GEO_CONTRACT_AUTH_CODE: "c".repeat(32),
} as NodeJS.ProcessEnv;

describe("GEO runtime configuration", () => {
  it("accepts a production configuration with independent high-entropy values", () => {
    expect(() =>
      assertGeoRuntimeConfigurationFromEnv(secureProductionEnv),
    ).not.toThrow();
  });

  it.each([
    ["missing", undefined],
    ["short", "short-contract-code"],
    ["known development default", "frontmind666"],
    ["placeholder", "replace-with-production-contract-code"],
  ])("rejects a %s production contract authorization code", (_label, value) => {
    expect(() =>
      assertGeoRuntimeConfigurationFromEnv({
        ...secureProductionEnv,
        FRONTMIND_GEO_CONTRACT_AUTH_CODE: value,
      }),
    ).toThrow("GEO_RUNTIME_CONFIGURATION_INVALID");
  });

  it("keeps the public development fallback outside production only", () => {
    expect(resolveGeoRuntimeConfiguration({ NODE_ENV: "test" })).toMatchObject({
      inviteCode: "frontmind666",
      contractAuthCode: "frontmind666",
      configurationError: "",
    });
  });
});
