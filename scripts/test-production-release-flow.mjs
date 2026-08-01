import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const testRoot = await mkdtemp(
  path.join(tmpdir(), "frontmind-real-production-release-"),
);
const sourceRepository = path.join(testRoot, "source");
const freshApprovalClone = path.join(testRoot, "approved-clone");

function git(repositoryRoot, args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd();
}

function run(repositoryRoot, command, args, env) {
  try {
    const output = execFileSync(command, args, {
      cwd: repositoryRoot,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (const line of output.split("\n")) {
      if (
        /(?:UNSEALED_BUILD_COMPLETE|Production user-content|PRODUCTION_RELEASE_CANDIDATE_BUILT|RUNTIME_ARTIFACT_ROOT_VERIFIED)/u.test(
          line,
        )
      ) {
        console.log(line);
      }
    }
  } catch (error) {
    if (error?.stdout) process.stderr.write(String(error.stdout));
    if (error?.stderr) process.stderr.write(String(error.stderr));
    throw error;
  }
}

function expectFailure(repositoryRoot, command, args, env, expectedPattern) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (result.status === 0 || !expectedPattern.test(output)) {
    throw new Error(
      `EXPECTED_RELEASE_FAILURE_MISSING status=${result.status} pattern=${expectedPattern} output=${output.slice(0, 4000)}`,
    );
  }
}

async function copyActualSourceFiles() {
  await mkdir(sourceRepository, { recursive: true });
  const files = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  )
    .split("\0")
    .filter(
      (relativePath) =>
        relativePath &&
        relativePath !== "dist" &&
        !relativePath.startsWith("dist/"),
    );
  for (const relativePath of files) {
    const sourcePath = path.join(projectRoot, relativePath);
    const destinationPath = path.join(sourceRepository, relativePath);
    const sourceStat = await lstat(sourcePath);
    await mkdir(path.dirname(destinationPath), { recursive: true });
    if (sourceStat.isSymbolicLink()) {
      await symlink(await readlink(sourcePath), destinationPath);
    } else if (sourceStat.isFile()) {
      await copyFile(sourcePath, destinationPath);
    } else {
      throw new Error(`REAL_RELEASE_SOURCE_ENTRY_UNSUPPORTED:${relativePath}`);
    }
  }
  await symlink(
    path.join(projectRoot, "node_modules"),
    path.join(sourceRepository, "node_modules"),
  );
}

function sourceBuildEnvironment(sourceSha) {
  return {
    ...process.env,
    FRONTMIND_BUILD_SHA: sourceSha,
    BUILD_SHA: sourceSha,
    GITHUB_SHA: sourceSha,
    COMMIT_SHA: sourceSha,
    RENDER_GIT_COMMIT: sourceSha,
    RAILWAY_GIT_COMMIT_SHA: sourceSha,
    VITE_CLIENT_PORTAL_URL: "https://dashboard.frontmind.net/login",
    VITE_SITE_URL: "https://www.frontmind.net",
    SITE_URL: "https://www.frontmind.net",
    BUILD_DATE: "2026-08-01",
  };
}

function approvalEnvironment(sourceSha, approvalSha, artifactRoot) {
  return {
    ...process.env,
    FRONTMIND_BUILD_SHA: sourceSha,
    BUILD_SHA: sourceSha,
    GITHUB_SHA: approvalSha,
    COMMIT_SHA: approvalSha,
    RENDER_GIT_COMMIT: approvalSha,
    RAILWAY_GIT_COMMIT_SHA: approvalSha,
    FRONTMIND_APPROVED_RELEASE_SHA: approvalSha,
    FRONTMIND_EXPECTED_ARTIFACT_ROOT_SHA256: artifactRoot,
  };
}

try {
  await copyActualSourceFiles();
  git(sourceRepository, ["init", "-q"]);
  await writeFile(
    path.join(sourceRepository, ".git", "info", "exclude"),
    "/node_modules\n",
    { flag: "a" },
  );
  git(sourceRepository, ["config", "user.email", "release@example.invalid"]);
  git(sourceRepository, ["config", "user.name", "FrontMind Release Test"]);
  await mkdir(path.join(sourceRepository, "dist"), { recursive: true });
  await writeFile(
    path.join(sourceRepository, "dist", "tracked-stale-artifact.js"),
    "previous approved artifact\n",
  );
  git(sourceRepository, ["add", "-A"]);
  git(sourceRepository, ["commit", "-qm", "source S with previous dist"]);
  const sourceSha = git(sourceRepository, ["rev-parse", "HEAD"]);
  const buildEnvironment = sourceBuildEnvironment(sourceSha);

  await writeFile(
    path.join(sourceRepository, "dist", "tracked-stale-artifact.js"),
    "modified before F\n",
  );
  expectFailure(
    sourceRepository,
    "pnpm",
    ["build:release"],
    buildEnvironment,
    /BUILD_RELEASE_WORKTREE_NOT_CLEAN:dist\/tracked-stale-artifact\.js/u,
  );
  git(sourceRepository, [
    "restore",
    "--staged",
    "--worktree",
    "dist/tracked-stale-artifact.js",
  ]);

  await writeFile(
    path.join(sourceRepository, "dist", "untracked-before-f.js"),
    "extra before F\n",
  );
  expectFailure(
    sourceRepository,
    "pnpm",
    ["build:release"],
    buildEnvironment,
    /BUILD_RELEASE_WORKTREE_NOT_CLEAN:dist\/untracked-before-f\.js/u,
  );
  await rm(path.join(sourceRepository, "dist", "untracked-before-f.js"));

  await writeFile(
    path.join(sourceRepository, "dist", "tracked-stale-artifact.js"),
    "staged before F\n",
  );
  git(sourceRepository, ["add", "dist/tracked-stale-artifact.js"]);
  expectFailure(
    sourceRepository,
    "pnpm",
    ["build:release"],
    buildEnvironment,
    /BUILD_RELEASE_WORKTREE_NOT_CLEAN:dist\/tracked-stale-artifact\.js/u,
  );
  git(sourceRepository, [
    "restore",
    "--staged",
    "--worktree",
    "dist/tracked-stale-artifact.js",
  ]);

  run(sourceRepository, "pnpm", ["build:release"], buildEnvironment);
  try {
    await lstat(
      path.join(sourceRepository, "dist", "tracked-stale-artifact.js"),
    );
    throw new Error("CLEAN_RELEASE_BUILD_RETAINED_STALE_DIST_FILE");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  expectFailure(
    sourceRepository,
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      'import { writeBuildArtifactManifest } from "./scripts/build-artifact-identity.mjs"; await writeBuildArtifactManifest("dist", process.env.FRONTMIND_BUILD_SHA);',
    ],
    buildEnvironment,
    /BUILD_ARTIFACT_MANIFEST_ALREADY_EXISTS/u,
  );

  const changedBeforeApproval = git(sourceRepository, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  const nonDistChanges = changedBeforeApproval
    .split("\n")
    .filter(Boolean)
    .filter((line) => !/^.. dist\//u.test(line));
  if (!changedBeforeApproval || nonDistChanges.length > 0) {
    throw new Error(
      `RELEASE_BUILD_CHANGED_NON_DIST_PATH:${nonDistChanges.join(",")}`,
    );
  }

  git(sourceRepository, ["add", "-A", "--", "dist"]);
  git(sourceRepository, ["commit", "-qm", "artifact approval F"]);
  const approvalSha = git(sourceRepository, ["rev-parse", "HEAD"]);
  if (approvalSha === sourceSha) throw new Error("RELEASE_F_EQUALS_S");
  git(sourceRepository, [
    "merge-base",
    "--is-ancestor",
    sourceSha,
    approvalSha,
  ]);
  const approvalPaths = git(sourceRepository, [
    "diff",
    "--name-only",
    sourceSha,
    approvalSha,
  ])
    .split("\n")
    .filter(Boolean);
  if (
    approvalPaths.length === 0 ||
    approvalPaths.some((relativePath) => !relativePath.startsWith("dist/"))
  ) {
    throw new Error(
      `RELEASE_APPROVAL_PATHS_INVALID:${approvalPaths.join(",")}`,
    );
  }

  execFileSync("git", ["clone", "-q", sourceRepository, freshApprovalClone], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  await writeFile(
    path.join(freshApprovalClone, ".git", "info", "exclude"),
    "/node_modules\n",
    { flag: "a" },
  );
  await symlink(
    path.join(projectRoot, "node_modules"),
    path.join(freshApprovalClone, "node_modules"),
  );
  const manifest = JSON.parse(
    await readFile(
      path.join(freshApprovalClone, "dist", "artifact-manifest.json"),
      "utf8",
    ),
  );
  const approvedEnvironment = approvalEnvironment(
    sourceSha,
    approvalSha,
    manifest.rootSha256,
  );
  run(
    freshApprovalClone,
    process.execPath,
    ["scripts/audit-production-bundle.mjs"],
    approvedEnvironment,
  );
  run(
    freshApprovalClone,
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      'import { verifyRuntimeReleaseArtifact } from "./scripts/runtime-artifact-integrity.mjs"; const result = await verifyRuntimeReleaseArtifact("dist", { buildSourceSha: process.env.FRONTMIND_BUILD_SHA, env: process.env }); console.log(`RUNTIME_ARTIFACT_ROOT_VERIFIED=${result.actualRootSha256}`);',
    ],
    approvedEnvironment,
  );

  await writeFile(
    path.join(freshApprovalClone, "dist", "index.js"),
    "tampered after F\n",
  );
  expectFailure(
    freshApprovalClone,
    process.execPath,
    ["scripts/audit-production-bundle.mjs"],
    approvedEnvironment,
    /BUILD_APPROVAL_ARTIFACT_NOT_COMMITTED|BUILD_ARTIFACT_BYTES_MISMATCH/u,
  );

  console.log(
    `REAL_REPOSITORY_RELEASE_FLOW_PASSED source=${sourceSha} approval=${approvalSha} root=${manifest.rootSha256}`,
  );
} finally {
  await rm(testRoot, { recursive: true, force: true });
}
