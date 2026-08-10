import {
  releaseProfile,
  type FrontMindReleaseChannel,
  type FrontMindReleaseProfile,
} from "../config/release-profile.mjs";

export type { FrontMindReleaseChannel };
export type FrontMindPaymentMode = "zpay";

export function frontmindReleaseChannel(
  profile: FrontMindReleaseProfile = releaseProfile,
): FrontMindReleaseChannel {
  if (profile.channel !== "production" && profile.channel !== "development") {
    throw new Error("FRONTMIND_RELEASE_CHANNEL_INVALID");
  }
  return profile.channel;
}

export function resolveFrontMindPaymentMode(
  env: NodeJS.ProcessEnv = process.env,
  channel: FrontMindReleaseChannel = frontmindReleaseChannel(),
): FrontMindPaymentMode {
  const configured = env.FRONTMIND_PAYMENT_MODE?.trim().toLowerCase() || "";
  if (configured && configured !== "zpay") {
    throw new Error(
      channel === "development"
        ? "FRONTMIND_DEV_PAYMENT_MUST_USE_ZPAY"
        : "FRONTMIND_PRODUCTION_PAYMENT_MUST_USE_ZPAY",
    );
  }
  return "zpay";
}

export function assertFrontMindReleaseRuntime(
  env: NodeJS.ProcessEnv = process.env,
  profile: FrontMindReleaseProfile = releaseProfile,
) {
  const channel = frontmindReleaseChannel(profile);
  const runtimeOverride = env.FRONTMIND_RELEASE_CHANNEL?.trim().toLowerCase();
  if (runtimeOverride && runtimeOverride !== channel) {
    throw new Error("FRONTMIND_RELEASE_CHANNEL_RUNTIME_OVERRIDE_REJECTED");
  }

  const paymentMode = resolveFrontMindPaymentMode(env, channel);
  for (const [name, expected] of Object.entries(
    profile.expectedRuntimeEnvironment,
  )) {
    if (env[name]?.trim() !== expected) {
      const channelLabel = channel === "development" ? "DEV" : "PRODUCTION";
      throw new Error(`FRONTMIND_${channelLabel}_ENDPOINT_INVALID:${name}`);
    }
  }

  return { channel, paymentMode } as const;
}
