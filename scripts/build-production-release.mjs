import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  assertCleanProductionReleaseWorktree,
  changedSourcePaths,
} from "./assert-clean-build-source.mjs";
import { writeBuildArtifactManifest } from "./build-artifact-identity.mjs";
import { recreateEmptyProductionBuildRoot } from "./production-build-root.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const buildRoot = path.join(projectRoot, "dist");
const buildSourceSha = assertCleanProductionReleaseWorktree({
  repositoryRoot: projectRoot,
  env: process.env,
});

await recreateEmptyProductionBuildRoot({
  repositoryRoot: projectRoot,
  buildRoot,
});

const releaseEnvironment = {
  ...process.env,
  FRONTMIND_BUILD_SHA: buildSourceSha,
};
execFileSync(process.execPath, ["scripts/build-unsealed-artifact.mjs"], {
  cwd: projectRoot,
  env: releaseEnvironment,
  stdio: "inherit",
});

const dirtySourcePaths = changedSourcePaths(projectRoot);
if (dirtySourcePaths.length > 0) {
  throw new Error(
    `BUILD_RELEASE_GENERATED_SOURCE_CHANGES:${dirtySourcePaths
      .slice(0, 20)
      .join(",")}`,
  );
}

const manifest = await writeBuildArtifactManifest(buildRoot, buildSourceSha);
execFileSync(process.execPath, ["scripts/audit-production-bundle.mjs"], {
  cwd: projectRoot,
  env: releaseEnvironment,
  stdio: "inherit",
});

console.log(
  `PRODUCTION_IMAGE_CONTENT_BUILT source=${buildSourceSha} files=${manifest.files.length} root=${manifest.rootSha256}`,
);
