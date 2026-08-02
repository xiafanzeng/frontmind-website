export type GeoRuntimeConfiguration = {
  inviteCode: string;
  contractAuthCode: string;
  sessionSecret: string;
  configurationError: string;
};

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
  const contractAuthCode =
    env.FRONTMIND_GEO_CONTRACT_AUTH_CODE?.trim() ||
    (production ? "" : "frontmind666");
  const sessionSecret =
    env.FRONTMIND_GEO_SESSION_SECRET?.trim() ||
    (production ? "" : "frontmind-geo-local-development-secret");
  const unsafeProductionInvite =
    production &&
    (inviteCode.length < 16 ||
      inviteCode === "frontmind666" ||
      isUnsafePlaceholder(inviteCode));
  const unsafeProductionSessionSecret = production && sessionSecret.length < 32;
  const unsafeProductionContractAuthCode =
    production &&
    (contractAuthCode.length < 32 ||
      contractAuthCode === "frontmind666" ||
      isUnsafePlaceholder(contractAuthCode));
  const configurationError =
    !inviteCode ||
    unsafeProductionInvite ||
    sessionSecret.length < 16 ||
    unsafeProductionSessionSecret ||
    isUnsafePlaceholder(sessionSecret) ||
    !contractAuthCode ||
    unsafeProductionContractAuthCode
      ? "GEO 邀请码、会话密钥或合同授权码尚未安全配置"
      : "";

  return {
    inviteCode,
    contractAuthCode,
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
