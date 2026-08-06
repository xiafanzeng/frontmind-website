export const releaseProfile = Object.freeze({
  channel: "production",
  siteUrl: "https://www.frontmind.net",
  clientPortalUrl: "https://dashboard.frontmind.net/login",
  robotsDirective:
    "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
  publishSearchIndexes: true,
  requireAgentCredential: true,
  expectedRuntimeEnvironment: Object.freeze({
    FRONTMIND_PUBLIC_BASE_URL: "https://www.frontmind.net",
    FRONTMIND_PRESALES_AGENT_URL:
      "http://frontmind-dashboard:3001/api/internal/presales",
    FRONTMIND_AGENT_PROVISIONING_URL:
      "http://frontmind-dashboard:3001/api/internal/provisioning",
    FRONTMIND_AGENT_INTERNAL_HTTP_HOSTS: "frontmind-dashboard",
  }),
});
