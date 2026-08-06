export type FrontMindReleaseChannel = "production" | "development";

export type FrontMindReleaseProfile = Readonly<{
  channel: FrontMindReleaseChannel;
  siteUrl: string;
  clientPortalUrl: string;
  robotsDirective: string;
  publishSearchIndexes: boolean;
  requireAgentCredential: boolean;
  expectedRuntimeEnvironment: Readonly<
    Record<
      | "FRONTMIND_PUBLIC_BASE_URL"
      | "FRONTMIND_PRESALES_AGENT_URL"
      | "FRONTMIND_AGENT_PROVISIONING_URL"
      | "FRONTMIND_AGENT_INTERNAL_HTTP_HOSTS",
      string
    >
  >;
}>;

export const releaseProfile: FrontMindReleaseProfile;
