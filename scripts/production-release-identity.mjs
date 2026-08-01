import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { assertCleanProductionApprovalSource } from "./assert-clean-build-source.mjs";
import {
  assertBuildArtifactLineage,
  readBuildArtifactIdentity,
} from "./build-artifact-identity.mjs";

function optionalFullSha(value, label) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return undefined;
  }
  const sha = String(value).trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error(label);
  return sha;
}

/**
 * Resolve the two immutable release identities used by production approval:
 * source build commit S and dist-only approval commit F. This is the shared
 * preflight used by the live verifier, so tests cannot accidentally exercise a
 * weaker identity path than production.
 */
export async function resolveProductionReleaseIdentity(options) {
  const projectRoot = resolve(options.projectRoot);
  const buildIdentity = await readBuildArtifactIdentity(
    options.buildRoot || resolve(projectRoot, "dist"),
  );
  const repositorySha = String(
    options.repositorySha ||
      execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: projectRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
  )
    .trim()
    .toLowerCase();
  const approvalSha =
    optionalFullSha(
      options.approvalSha,
      "--approval-sha must be a full 40-character hexadecimal Git SHA",
    ) || repositorySha;
  if (approvalSha !== repositorySha) {
    throw new Error("--approval-sha must equal the immutable local Git HEAD");
  }

  const legacyBuildSourceSha = optionalFullSha(
    options.legacyBuildSourceSha,
    "--sha must be a full 40-character hexadecimal Git SHA",
  );
  const explicitBuildSourceSha = optionalFullSha(
    options.buildSourceSha,
    "--build-source-sha must be a full 40-character hexadecimal Git SHA",
  );
  if (
    legacyBuildSourceSha &&
    explicitBuildSourceSha &&
    legacyBuildSourceSha !== explicitBuildSourceSha
  ) {
    throw new Error("--sha and --build-source-sha identify different commits");
  }
  const buildSourceSha =
    explicitBuildSourceSha ||
    legacyBuildSourceSha ||
    buildIdentity.buildSourceSha;
  if (buildSourceSha !== buildIdentity.buildSourceSha) {
    throw new Error(
      "Build-source SHA differs from the immutable local dist identity",
    );
  }

  assertCleanProductionApprovalSource({
    repositoryRoot: projectRoot,
    approvalSha,
    buildSourceSha,
    env: options.env || {},
  });

  const lineage = assertBuildArtifactLineage({
    repositoryRoot: projectRoot,
    approvalSha,
    buildSourceSha,
  });
  return {
    approvalSha,
    buildSourceSha,
    buildIdentity,
    changedPaths: lineage.changedPaths,
  };
}
