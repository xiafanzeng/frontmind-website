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

import { trackedDistPaths } from "./assert-clean-build-source.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const trackedDist = trackedDistPaths(projectRoot);
if (trackedDist.length > 0) {
  throw new Error(
    `BUILD_RELEASE_DIST_MUST_NOT_BE_TRACKED:${trackedDist
      .slice(0, 20)
      .join(",")}`,
  );
}
const testRoot = await mkdtemp(path.join(tmpdir(), "frontmind-image-release-"));
const sourceRepository = path.join(testRoot, "source");

execFileSync(
  process.execPath,
  ["--test", path.join(projectRoot, "scripts/promotion-prebuild-gate.node-test.mjs")],
  { cwd: projectRoot, stdio: "inherit" },
);
execFileSync(
  process.execPath,
  [
    "--test",
    path.join(projectRoot, "scripts/promotion-prebuild-gate-runtime.node-test.mjs"),
  ],
  { cwd: projectRoot, stdio: "inherit" },
);

function git(repositoryRoot, args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trimEnd();
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
    let sourceStat;
    try {
      sourceStat = await lstat(sourcePath);
    } catch (error) {
      // A local implementation run may contain unstaged deletions. They are
      // part of the candidate source snapshot and must simply stay deleted.
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    await mkdir(path.dirname(destinationPath), { recursive: true });
    if (sourceStat.isSymbolicLink()) {
      await symlink(await readlink(sourcePath), destinationPath);
    } else if (sourceStat.isFile()) {
      await copyFile(sourcePath, destinationPath);
    }
  }
  await symlink(
    path.join(projectRoot, "node_modules"),
    path.join(sourceRepository, "node_modules"),
  );
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
  git(sourceRepository, ["add", "-A"]);
  git(sourceRepository, ["commit", "-qm", "source image release"]);
  const sourceSha = git(sourceRepository, ["rev-parse", "HEAD"]);
  const environment = {
    ...process.env,
    FRONTMIND_BUILD_SHA: sourceSha,
    GITHUB_SHA: sourceSha,
    VITE_CLIENT_PORTAL_URL: "https://dashboard.frontmind.net/login",
    VITE_SITE_URL: "https://www.frontmind.net",
    SITE_URL: "https://www.frontmind.net",
    BUILD_DATE: "2026-08-02",
  };

  execFileSync("pnpm", ["build:release"], {
    cwd: sourceRepository,
    env: environment,
    stdio: "inherit",
  });
  const manifest = JSON.parse(
    await readFile(
      path.join(sourceRepository, "dist", "artifact-manifest.json"),
      "utf8",
    ),
  );
  if (manifest.buildSourceSha !== sourceSha || manifest.files.length < 10) {
    throw new Error("IMAGE_BUILD_MANIFEST_IDENTITY_INVALID");
  }
  if (git(sourceRepository, ["status", "--porcelain=v1"])) {
    throw new Error("IMAGE_BUILD_CHANGED_SOURCE_OR_TRACKED_OUTPUT");
  }

  await writeFile(
    path.join(sourceRepository, "dist", "index.js"),
    "tampered\n",
  );
  expectFailure(
    sourceRepository,
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      'import { verifyBuildArtifactManifest } from "./scripts/build-artifact-identity.mjs"; await verifyBuildArtifactManifest("dist", { expectedBuildSourceSha: process.env.FRONTMIND_BUILD_SHA });',
    ],
    environment,
    /BUILD_ARTIFACT_BYTES_MISMATCH/u,
  );

  const dockerfile = await readFile(
    path.join(sourceRepository, "Dockerfile"),
    "utf8",
  );
  const workflow = await readFile(
    path.join(sourceRepository, ".github", "workflows", "ci-release.yml"),
    "utf8",
  );
  for (const required of [
    "ARG NODE_IMAGE=1panel/node:22.22.2@sha256:",
    "pnpm build:release",
    "USER 10002:10002",
    "org.opencontainers.image.revision",
  ]) {
    if (!dockerfile.includes(required)) {
      throw new Error(`WEBSITE_DOCKERFILE_CONTRACT_MISSING:${required}`);
    }
  }
  for (const required of [
    "pull_request:",
    "branches: [main]",
    "cosign sign --yes",
    "needs.build.outputs.digest",
    "StrictHostKeyChecking=yes",
    "GHCR_USERNAME: ${{ github.actor }}",
    "GHCR_TOKEN: ${{ secrets.GITHUB_TOKEN }}",
    `printf '%s\\n%s\\n' "$GHCR_USERNAME" "$GHCR_TOKEN" |`,
    "${IMAGE_NAME}@${IMAGE_DIGEST} ${{ needs.promotion-gate.outputs.source_sha }}",
  ]) {
    if (!workflow.includes(required)) {
      throw new Error(`WEBSITE_WORKFLOW_CONTRACT_MISSING:${required}`);
    }
  }
  if (/\b(?:mysql|migration|pdf)\b/iu.test(workflow)) {
    throw new Error("WEBSITE_WORKFLOW_MUST_NOT_COUPLE_DB_OR_PDF");
  }

  console.log(
    `WEBSITE_IMAGE_RELEASE_FLOW_PASSED source=${sourceSha} files=${manifest.files.length}`,
  );
} finally {
  await rm(testRoot, { recursive: true, force: true });
}
