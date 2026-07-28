import fs from "node:fs";
import path from "node:path";

/**
 * The Dashboard repository was renamed from frontmind-agent. Keeping the
 * legacy fallback lets an existing checkout finish its release commit before
 * the local directory is renamed, while clean clones use the new name.
 */
export function siblingDashboardRepositoryRoot(cwd = process.cwd()) {
  const parent = path.resolve(cwd, "..");
  const candidates = ["frontmind-dashboard", "frontmind-agent"].map((name) =>
    path.join(parent, name),
  );
  return (
    candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0]
  );
}
