export type GeoRuntimeConfiguration = {
  inviteCode: string;
  contractAuthCode: string;
  bankTransferConfirmationCode: string;
  sessionSecret: string;
  configurationError: string;
};

// This is a shared business workflow code, not a deployment secret. Keep it
// server-side so stale production environment variables cannot change the code
// administrators give customers after confirming a contract.
export const GEO_CONTRACT_AUTH_CODE = "frontmind666";

// This code confirms that an administrator has independently verified a bank
// transfer. It is deliberately separate from the contract authorization code
// and remains server-only so it cannot enter a browser bundle or project token.
export const GEO_BANK_TRANSFER_CONFIRMATION_CODE = "frontmind888";

function isUnsafePlaceholder(value: string) {
  return /^(?:replace[-_ ]?with|change[-_ ]?me|example|placeholder|your[-_ ])/i.test(
    value.trim(),
  );
}

export function resolveGeoRuntimeConfiguration(
  env: NodeJS.ProcessEnv = process.env,
): GeoRuntimeConfiguration {
  const production = env.NODE_ENV === "production";
  const inviteCode =
    env.FRONTMIND_GEO_INVITE_CODE?.trim() || (production ? "" : "frontmind666");
  const contractAuthCode = GEO_CONTRACT_AUTH_CODE;
  const bankTransferConfirmationCode = GEO_BANK_TRANSFER_CONFIRMATION_CODE;
  const sessionSecret =
    env.FRONTMIND_GEO_SESSION_SECRET?.trim() ||
    (production ? "" : "frontmind-geo-local-development-secret");
  const unsafeProductionInvite =
    production &&
    (inviteCode.length < 16 ||
      inviteCode === "frontmind666" ||
      isUnsafePlaceholder(inviteCode));
  const unsafeProductionSessionSecret = production && sessionSecret.length < 32;
  const configurationError =
    !inviteCode ||
    unsafeProductionInvite ||
    sessionSecret.length < 16 ||
    unsafeProductionSessionSecret ||
    isUnsafePlaceholder(sessionSecret)
      ? "GEO 邀请码或会话密钥尚未安全配置"
      : "";

  return {
    inviteCode,
    contractAuthCode,
    bankTransferConfirmationCode,
    sessionSecret,
    configurationError,
  };
}

export function assertGeoRuntimeConfigurationFromEnv(
  env: NodeJS.ProcessEnv = process.env,
) {
  const configuration = resolveGeoRuntimeConfiguration(env);
  if (configuration.configurationError) {
    throw new Error("GEO_RUNTIME_CONFIGURATION_INVALID");
  }
  return configuration;
}
