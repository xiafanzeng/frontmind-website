export type FrontMindReleaseChannel = "production" | "development";

export type FrontMindDeploymentTarget = "net" | "cn";

export type FrontMindReleaseProfile = Readonly<{
  deploymentTarget: FrontMindDeploymentTarget;
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

export function createReleaseProfile(
  deploymentTarget?: string,
): FrontMindReleaseProfile;

export const releaseProfile: FrontMindReleaseProfile;
