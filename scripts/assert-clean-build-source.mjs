import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

function git(repositoryRoot, args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function gitPathList(repositoryRoot, args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
    .split("\0")
    .filter(Boolean);
}

export function changedSourcePaths(repositoryRoot) {
  const sourcePathspec = ["--", ".", ":(exclude)dist", ":(exclude)dist/**"];
  const groups = [
    gitPathList(repositoryRoot, [
      "diff",
      "--name-only",
      "-z",
      ...sourcePathspec,
    ]),
    gitPathList(repositoryRoot, [
      "diff",
      "--cached",
      "--name-only",
      "-z",
      ...sourcePathspec,
    ]),
    gitPathList(repositoryRoot, [
      "ls-files",
      "-z",
      "--others",
      "--exclude-standard",
      ...sourcePathspec,
    ]),
  ];
  return Array.from(new Set(groups.flat())).sort();
}

export function changedArtifactPaths(repositoryRoot) {
  const artifactPathspec = ["--", "dist"];
  const groups = [
    gitPathList(repositoryRoot, [
      "diff",
      "--name-only",
      "-z",
      ...artifactPathspec,
    ]),
    gitPathList(repositoryRoot, [
      "diff",
      "--cached",
      "--name-only",
      "-z",
      ...artifactPathspec,
    ]),
    gitPathList(repositoryRoot, [
      "ls-files",
      "-z",
      "--others",
      "--exclude-standard",
      ...artifactPathspec,
    ]),
    gitPathList(repositoryRoot, [
      "ls-files",
      "-z",
      "--others",
      "--ignored",
      "--exclude-standard",
      ...artifactPathspec,
    ]),
  ];
  return Array.from(new Set(groups.flat())).sort();
}

export function changedWorktreePaths(repositoryRoot) {
  return Array.from(
    new Set([
      ...changedSourcePaths(repositoryRoot),
      ...changedArtifactPaths(repositoryRoot),
    ]),
  ).sort();
}

function normalizedFullSha(value, errorCode) {
  const sha = String(value || "")
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{40}$/u.test(sha)) throw new Error(errorCode);
  return sha;
}

/**
 * Approval runs happen from the dist-only approval commit F, while the
 * artifact was built from its source ancestor S. CI checkout variables name F;
 * the explicit build identity variables, when present, must continue to name
 * S. This deliberately differs from the build-time assertion below, where
 * HEAD and every supplied SHA must all be S.
 */
export function assertCleanProductionApprovalSource(options = {}) {
  const repositoryRoot = path.resolve(
    options.repositoryRoot || path.resolve(import.meta.dirname, ".."),
  );
  const approvalSha = normalizedFullSha(
    options.approvalSha || git(repositoryRoot, ["rev-parse", "HEAD"]),
    "BUILD_APPROVAL_SHA_INVALID",
  );
  const buildSourceSha = normalizedFullSha(
    options.buildSourceSha,
    "BUILD_ARTIFACT_SOURCE_SHA_INVALID",
  );
  const repositorySha = normalizedFullSha(
    git(repositoryRoot, ["rev-parse", "HEAD"]),
    "BUILD_APPROVAL_SHA_INVALID",
  );
  if (repositorySha !== approvalSha) {
    throw new Error("BUILD_APPROVAL_COMMIT_MISMATCH");
  }

  const env = options.env || {};
  if (!env.FRONTMIND_APPROVED_RELEASE_SHA) {
    throw new Error("BUILD_APPROVAL_ENV_SHA_REQUIRED");
  }
  if (
    normalizedFullSha(
      env.FRONTMIND_APPROVED_RELEASE_SHA,
      "BUILD_APPROVAL_ENV_SHA_INVALID",
    ) !== approvalSha
  ) {
    throw new Error("BUILD_APPROVAL_ENV_SHA_MISMATCH");
  }
  for (const value of [
    env.GITHUB_SHA,
    env.COMMIT_SHA,
    env.RENDER_GIT_COMMIT,
    env.RAILWAY_GIT_COMMIT_SHA,
  ].filter(Boolean)) {
    if (
      normalizedFullSha(value, "BUILD_APPROVAL_ENV_SHA_INVALID") !== approvalSha
    ) {
      throw new Error("BUILD_APPROVAL_ENV_SHA_MISMATCH");
    }
  }
  for (const value of [env.FRONTMIND_BUILD_SHA, env.BUILD_SHA].filter(
    Boolean,
  )) {
    if (
      normalizedFullSha(value, "BUILD_SOURCE_ENV_SHA_INVALID") !==
      buildSourceSha
    ) {
      throw new Error("BUILD_SOURCE_COMMIT_MISMATCH");
    }
  }

  const dirtyPaths = changedSourcePaths(repositoryRoot);
  if (dirtyPaths.length > 0) {
    throw new Error(
      `BUILD_SOURCE_NOT_COMMITTED:${dirtyPaths.slice(0, 20).join(",")}`,
    );
  }
  const dirtyArtifactPaths = changedArtifactPaths(repositoryRoot);
  if (dirtyArtifactPaths.length > 0) {
    throw new Error(
      `BUILD_APPROVAL_ARTIFACT_NOT_COMMITTED:${dirtyArtifactPaths
        .slice(0, 20)
        .join(",")}`,
    );
  }
  return approvalSha;
}

/**
 * The public production-build entrance is stricter than the internal build
 * stages: before it deletes and recreates dist, every Git-visible tracked,
 * staged and untracked path (including dist) must be clean. Ignored local
 * dependencies and secrets remain outside Git's release artifact contract.
 */
export function assertCleanProductionReleaseWorktree(options = {}) {
  const repositoryRoot = path.resolve(
    options.repositoryRoot || path.resolve(import.meta.dirname, ".."),
  );
  const sha = assertCleanProductionBuildSource({
    ...options,
    repositoryRoot,
  });
  const dirtyPaths = changedWorktreePaths(repositoryRoot);
  if (dirtyPaths.length > 0) {
    throw new Error(
      `BUILD_RELEASE_WORKTREE_NOT_CLEAN:${dirtyPaths.slice(0, 20).join(",")}`,
    );
  }
  return sha;
}

/**
 * A production artifact may only describe one immutable source commit.
 * Generated dist files may drift between builds; source, tests and Skills may
 * not. Any build SHA supplied by the platform must identify the same HEAD.
 */
export function assertCleanProductionBuildSource(options = {}) {
  const repositoryRoot = path.resolve(
    options.repositoryRoot || path.resolve(import.meta.dirname, ".."),
  );
  const repositorySha = git(repositoryRoot, [
    "rev-parse",
    "HEAD",
  ]).toLowerCase();
  if (!/^[a-f0-9]{40}$/u.test(repositorySha)) {
    throw new Error("BUILD_SOURCE_COMMIT_INVALID");
  }

  const env = options.env || {};
  const expectedBuildSha = String(options.expectedBuildSha || repositorySha)
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{40}$/u.test(expectedBuildSha)) {
    throw new Error("BUILD_SOURCE_EXPECTED_SHA_INVALID");
  }
  if (repositorySha !== expectedBuildSha) {
    throw new Error("BUILD_SOURCE_COMMIT_MISMATCH");
  }
  const requestedShas = [
    env.FRONTMIND_BUILD_SHA,
    env.BUILD_SHA,
    env.COMMIT_SHA,
    env.RENDER_GIT_COMMIT,
    env.RAILWAY_GIT_COMMIT_SHA,
    env.GITHUB_SHA,
  ]
    .map((value) =>
      String(value || "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
  for (const requestedSha of requestedShas) {
    if (!/^[a-f0-9]{40}$/u.test(requestedSha)) {
      throw new Error("BUILD_SOURCE_ENV_SHA_INVALID");
    }
    if (requestedSha !== expectedBuildSha) {
      throw new Error("BUILD_SOURCE_COMMIT_MISMATCH");
    }
  }

  const dirtyPaths = changedSourcePaths(repositoryRoot);
  if (dirtyPaths.length > 0) {
    throw new Error(
      `BUILD_SOURCE_NOT_COMMITTED:${dirtyPaths.slice(0, 20).join(",")}`,
    );
  }
  return repositorySha;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const sha = assertCleanProductionBuildSource({ env: process.env });
    console.log(`BUILD_SOURCE_COMMITTED=${sha}`);
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "BUILD_SOURCE_CHECK_FAILED",
    );
    process.exitCode = 1;
  }
}
