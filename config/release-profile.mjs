/** Select a deployment at build time; existing .net releases remain the default. */
export function createReleaseProfile(deploymentTarget = "net") {
  const target = deploymentTarget?.trim() || "net";
  if (target !== "net" && target !== "cn") {
    throw new Error(`FRONTMIND_DEPLOYMENT_TARGET_INVALID:${target}`);
  }
  const cn = target === "cn";
  const siteUrl = cn ? "https://www.frontmind.cn" : "https://www.frontmind.net";
  const dashboardHost = cn ? "dashboard" : "frontmind-dashboard";
  return Object.freeze({
    deploymentTarget: target,
    channel: "production",
    siteUrl,
    clientPortalUrl: cn
      ? "https://dashboard.frontmind.cn/login"
      : "https://dashboard.frontmind.net/login",
    robotsDirective:
      "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
    publishSearchIndexes: true,
    requireAgentCredential: true,
    expectedRuntimeEnvironment: Object.freeze({
      FRONTMIND_PUBLIC_BASE_URL: siteUrl,
      FRONTMIND_PRESALES_AGENT_URL: `http://${dashboardHost}:3001/api/internal/presales/v2`,
      FRONTMIND_AGENT_PROVISIONING_URL: `http://${dashboardHost}:3001/api/internal/provisioning`,
      FRONTMIND_AGENT_INTERNAL_HTTP_HOSTS: dashboardHost,
    }),
  });
}

// Server bundling replaces this constant, so runtime environment changes cannot
// switch a built .cn artifact back to .net or disagree with its client/SEO assets.
export const releaseProfile = createReleaseProfile(
  typeof __FRONTMIND_DEPLOYMENT_TARGET__ !== "undefined"
    ? __FRONTMIND_DEPLOYMENT_TARGET__
    : process.env.FRONTMIND_DEPLOYMENT_TARGET,
);
