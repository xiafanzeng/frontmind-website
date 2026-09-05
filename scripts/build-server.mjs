import { releaseProfile } from "../config/release-profile.mjs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { resolveProductionBuildSource } from "./assert-clean-build-source.mjs";
import { writeBuildArtifactIdentity } from "./build-artifact-identity.mjs";

const projectRoot = resolve(import.meta.dirname, "..");
const buildSha = resolveProductionBuildSource({
  repositoryRoot: projectRoot,
  env: process.env,
});

await build({
  entryPoints: {
    index: resolve(projectRoot, "server", "index.ts"),
    "verify-live-payment": resolve(
      projectRoot,
      "scripts",
      "verify-live-payment.ts",
    ),
  },
  outdir: resolve(projectRoot, "dist"),
  platform: "node",
  packages: "external",
  bundle: true,
  format: "esm",
  define: {
    __FRONTMIND_BUILD_SHA__: JSON.stringify(buildSha),
    __FRONTMIND_DEPLOYMENT_TARGET__: JSON.stringify(
      releaseProfile.deploymentTarget,
    ),
  },
});
await writeBuildArtifactIdentity(resolve(projectRoot, "dist"), buildSha);

console.log(`Server and payment-verification bundles built from ${buildSha}.`);
