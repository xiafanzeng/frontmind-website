import fs from "node:fs";
import path from "node:path";

/**
 * The Dashboard repository was renamed from frontmind-agent. Keeping the
 * legacy fallback lets an existing checkout finish its release commit before
 * the local directory is renamed, while clean clones use the new name.
 */
export function siblingDashboardRepositoryRoot(cwd = process.cwd()) {
  const configured = process.env.FRONTMIND_DASHBOARD_REPOSITORY_ROOT?.trim();
  if (configured) return path.resolve(configured);

  const developmentSuffix = "-dev";
  const dashboardRepositoryName = "frontmind-dashboard";
  const dashboardDevelopmentRepositoryName = `${dashboardRepositoryName}${developmentSuffix}`;
  const parent = path.resolve(cwd, "..");
  const developmentWorkspace = path
    .basename(path.resolve(cwd))
    .endsWith(developmentSuffix);
  const candidates = (
    developmentWorkspace
      ? [
          dashboardDevelopmentRepositoryName,
          dashboardRepositoryName,
          "frontmind-agent",
        ]
      : [
          dashboardRepositoryName,
          "frontmind-agent",
          dashboardDevelopmentRepositoryName,
        ]
  ).map((name) => path.join(parent, name));
  return (
    candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0]
  );
}
