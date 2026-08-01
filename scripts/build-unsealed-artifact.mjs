import { execFileSync } from "node:child_process";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { assertCleanProductionBuildSource } from "./assert-clean-build-source.mjs";
import { BUILD_ARTIFACT_MANIFEST_FILENAME } from "./build-artifact-identity.mjs";

const projectRoot = path.resolve(import.meta.dirname, "..");
const buildSourceSha = assertCleanProductionBuildSource({
  repositoryRoot: projectRoot,
  env: process.env,
});
const buildRoot = path.join(projectRoot, "dist");

// A direct/internal build must never leave a prior production seal in place.
// Only build-production-release.mjs creates a new immutable manifest after all
// stages complete.
await unlink(path.join(buildRoot, BUILD_ARTIFACT_MANIFEST_FILENAME)).catch(
  (error) => {
    if (error?.code !== "ENOENT") throw error;
  },
);

function run(command, args) {
  execFileSync(command, args, {
    cwd: projectRoot,
    env: {
      ...process.env,
      FRONTMIND_BUILD_SHA: buildSourceSha,
    },
    stdio: "inherit",
  });
}

run("pnpm", [
  "exec",
  "tsx",
  "scripts/generate-geo-community-summary.ts",
  "--check",
]);
run("pnpm", ["exec", "vite", "build"]);
run("pnpm", ["exec", "tsx", "scripts/generate-seo-assets.ts", "--dist-only"]);
run(process.execPath, ["scripts/build-server.mjs"]);
run(process.execPath, ["scripts/copy-server-skills.mjs"]);

console.log(
  `UNSEALED_BUILD_COMPLETE source=${buildSourceSha}; production requires pnpm build:release`,
);
