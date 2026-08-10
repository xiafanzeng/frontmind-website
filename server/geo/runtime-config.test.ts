import { describe, expect, it } from "vitest";

import {
  assertGeoRuntimeConfigurationFromEnv,
  resolveGeoRuntimeConfiguration,
} from "./runtime-config";

const secureProductionEnv = {
  NODE_ENV: "production",
  FRONTMIND_GEO_INVITE_CODE: "invite-code-that-is-long-enough",
  FRONTMIND_GEO_SESSION_SECRET: "s".repeat(32),
} as NodeJS.ProcessEnv;

describe("GEO runtime configuration", () => {
  it("accepts production with a secure invite code and session secret", () => {
    expect(() =>
      assertGeoRuntimeConfigurationFromEnv(secureProductionEnv),
    ).not.toThrow();
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["stale", "previous-production-contract-code"],
  ])(
    "uses the fixed business contract code when the legacy environment value is %s",
    (_label, value) => {
      const configuration = resolveGeoRuntimeConfiguration({
        ...secureProductionEnv,
        FRONTMIND_GEO_CONTRACT_AUTH_CODE: value,
      });

      expect(configuration).toMatchObject({
        contractAuthCode: "frontmind666",
        bankTransferConfirmationCode: "frontmind888",
        configurationError: "",
      });
      expect(() =>
        assertGeoRuntimeConfigurationFromEnv({
          ...secureProductionEnv,
          FRONTMIND_GEO_CONTRACT_AUTH_CODE: value,
        }),
      ).not.toThrow();
    },
  );

  it("keeps the public development fallback outside production only", () => {
    expect(resolveGeoRuntimeConfiguration({ NODE_ENV: "test" })).toMatchObject({
      inviteCode: "frontmind666",
      contractAuthCode: "frontmind666",
      bankTransferConfirmationCode: "frontmind888",
      configurationError: "",
    });
  });

  it("ignores legacy environment overrides for the fixed bank confirmation code", () => {
    expect(
      resolveGeoRuntimeConfiguration({
        ...secureProductionEnv,
        FRONTMIND_GEO_BANK_TRANSFER_CONFIRMATION_CODE: "stale-bank-code",
      }),
    ).toMatchObject({
      bankTransferConfirmationCode: "frontmind888",
      configurationError: "",
    });
  });
});
