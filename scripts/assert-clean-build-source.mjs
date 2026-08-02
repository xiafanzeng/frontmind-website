import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

function tryGit(repositoryRoot, args) {
  try {
    return execFileSync("git", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return undefined;
  }
}

function gitPathList(repositoryRoot, args) {
  try {
    return execFileSync("git", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
      .split("\0")
      .filter(Boolean);
  } catch {
    return [];
  }
}

function fullSha(value, errorCode) {
  const sha = String(value || "")
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{40}$/u.test(sha)) throw new Error(errorCode);
  return sha;
}

export function changedSourcePaths(repositoryRoot) {
  const sourcePathspec = ["--", ".", ":(exclude)dist", ":(exclude)dist/**"];
  return Array.from(
    new Set(
      [
        ["diff", "--name-only", "-z", ...sourcePathspec],
        ["diff", "--cached", "--name-only", "-z", ...sourcePathspec],
        ["ls-files", "-z", "--others", "--exclude-standard", ...sourcePathspec],
      ].flatMap((args) => gitPathList(repositoryRoot, args)),
    ),
  ).sort();
}

export function trackedDistPaths(repositoryRoot) {
  return gitPathList(repositoryRoot, ["ls-files", "-z", "--", "dist"]).sort();
}

/**
 * Resolve the source identity embedded in the image. A Docker build normally
 * has no .git directory, so CI must provide FRONTMIND_BUILD_SHA. Local builds
 * may use HEAD. Every supplied CI SHA must agree when Git metadata exists.
 */
export function resolveProductionBuildSource(options = {}) {
  const repositoryRoot = path.resolve(
    options.repositoryRoot || path.resolve(import.meta.dirname, ".."),
  );
  const env = options.env || process.env;
  const repositorySha = tryGit(repositoryRoot, ["rev-parse", "HEAD"]);
  const explicitSha =
    options.expectedBuildSha || env.FRONTMIND_BUILD_SHA || env.GITHUB_SHA;
  const sourceSha = fullSha(
    explicitSha || repositorySha,
    "BUILD_SOURCE_SHA_REQUIRED",
  );

  if (
    repositorySha &&
    fullSha(repositorySha, "BUILD_SOURCE_COMMIT_INVALID") !== sourceSha
  ) {
    throw new Error("BUILD_SOURCE_COMMIT_MISMATCH");
  }
  for (const value of [
    env.FRONTMIND_BUILD_SHA,
    env.BUILD_SHA,
    env.COMMIT_SHA,
    env.RENDER_GIT_COMMIT,
    env.RAILWAY_GIT_COMMIT_SHA,
    env.GITHUB_SHA,
  ].filter(Boolean)) {
    if (fullSha(value, "BUILD_SOURCE_ENV_SHA_INVALID") !== sourceSha) {
      throw new Error("BUILD_SOURCE_COMMIT_MISMATCH");
    }
  }
  return sourceSha;
}

export function assertCleanProductionBuildSource(options = {}) {
  const repositoryRoot = path.resolve(
    options.repositoryRoot || path.resolve(import.meta.dirname, ".."),
  );
  const sourceSha = resolveProductionBuildSource({
    ...options,
    repositoryRoot,
  });
  // Image builds intentionally exclude .git. The clean checkout is enforced
  // by the CI job before Buildx receives the context.
  if (tryGit(repositoryRoot, ["rev-parse", "--is-inside-work-tree"])) {
    const trackedDist = trackedDistPaths(repositoryRoot);
    if (trackedDist.length > 0) {
      throw new Error(
        `BUILD_RELEASE_DIST_MUST_NOT_BE_TRACKED:${trackedDist
          .slice(0, 20)
          .join(",")}`,
      );
    }
    const dirtyPaths = changedSourcePaths(repositoryRoot);
    if (dirtyPaths.length > 0) {
      throw new Error(
        `BUILD_SOURCE_NOT_COMMITTED:${dirtyPaths.slice(0, 20).join(",")}`,
      );
    }
  }
  return sourceSha;
}

// Kept as the public release entry name; dist is now an ignored build output,
// so the release gate checks only source cleanliness.
export const assertCleanProductionReleaseWorktree =
  assertCleanProductionBuildSource;

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    console.log(
      `BUILD_SOURCE_COMMITTED=${assertCleanProductionBuildSource({ env: process.env })}`,
    );
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "BUILD_SOURCE_CHECK_FAILED",
    );
    process.exitCode = 1;
  }
}
