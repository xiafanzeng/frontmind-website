import path from "node:path";
import { verifyBuildArtifactManifest } from "./build-artifact-identity.mjs";

export const RUNTIME_ARTIFACT_PROOF_TTL_MS = 5_000;

function requiredSha256(value, errorCode) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(normalized)) throw new Error(errorCode);
  return normalized;
}

function requiredGitSha(value, errorCode) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!/^[a-f0-9]{40}$/u.test(normalized)) throw new Error(errorCode);
  return normalized;
}

/**
 * Verify dist bytes against both its in-tree manifest and the independently
 * injected release root. The external root prevents a replaced artifact and a
 * replaced co-located manifest from blessing each other.
 */
export async function verifyRuntimeReleaseArtifact(buildRoot, options = {}) {
  const env = options.env || process.env;
  const buildSourceSha = requiredGitSha(
    options.buildSourceSha,
    "FRONTMIND_RUNTIME_BUILD_SOURCE_SHA_INVALID",
  );
  const approvalSha = requiredGitSha(
    options.approvalSha || env.FRONTMIND_APPROVED_RELEASE_SHA,
    "FRONTMIND_APPROVED_RELEASE_SHA_REQUIRED",
  );
  if (approvalSha === buildSourceSha) {
    throw new Error("FRONTMIND_APPROVED_RELEASE_SHA_MUST_DIFFER_FROM_SOURCE");
  }
  const expectedRootSha256 = requiredSha256(
    options.expectedRootSha256 || env.FRONTMIND_EXPECTED_ARTIFACT_ROOT_SHA256,
    "FRONTMIND_EXPECTED_ARTIFACT_ROOT_SHA256_REQUIRED",
  );
  const manifest = await verifyBuildArtifactManifest(path.resolve(buildRoot), {
    expectedBuildSourceSha: buildSourceSha,
  });
  if (manifest.rootSha256 !== expectedRootSha256) {
    throw new Error("FRONTMIND_ARTIFACT_EXTERNAL_ROOT_MISMATCH");
  }
  return {
    approvalSha,
    buildSourceSha,
    expectedRootSha256,
    actualRootSha256: manifest.rootSha256,
    manifest,
  };
}

/**
 * Coalesce concurrent health checks and reuse only a very recent complete-byte
 * proof. Startup uses force=true. After five seconds the next request performs
 * another full manifest walk; all concurrent callers share that one promise.
 */
export function createRuntimeReleaseArtifactVerifier(options) {
  const ttlMs = Number(
    options.ttlMs === undefined ? RUNTIME_ARTIFACT_PROOF_TTL_MS : options.ttlMs,
  );
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 5_000) {
    throw new Error("FRONTMIND_ARTIFACT_PROOF_TTL_INVALID");
  }
  const now = options.now || Date.now;
  const verifyArtifact =
    options.verifyArtifact ||
    (() =>
      verifyRuntimeReleaseArtifact(options.buildRoot, {
        buildSourceSha: options.buildSourceSha,
        approvalSha: options.approvalSha,
        expectedRootSha256: options.expectedRootSha256,
        env: options.env,
      }));
  let cachedProof;
  let cachedFailure;
  let inFlight;

  async function verify(verifyOptions = {}) {
    const observedAt = now();
    if (
      verifyOptions.force !== true &&
      cachedFailure &&
      observedAt < cachedFailure.expiresAtEpochMs
    ) {
      throw cachedFailure.error;
    }
    if (
      verifyOptions.force !== true &&
      cachedProof &&
      observedAt < cachedProof.proofExpiresAtEpochMs
    ) {
      return cachedProof;
    }
    if (inFlight) return inFlight;

    const currentVerification = Promise.resolve()
      .then(() => verifyArtifact())
      .then((artifact) => {
        const verifiedAtEpochMs = now();
        cachedFailure = undefined;
        cachedProof = {
          ...artifact,
          verifiedAtEpochMs,
          proofExpiresAtEpochMs: verifiedAtEpochMs + ttlMs,
          proofTtlMs: ttlMs,
        };
        return cachedProof;
      })
      .catch((error) => {
        cachedProof = undefined;
        cachedFailure = {
          error,
          expiresAtEpochMs: now() + ttlMs,
        };
        throw error;
      });
    inFlight = currentVerification;
    try {
      return await currentVerification;
    } finally {
      if (inFlight === currentVerification) inFlight = undefined;
    }
  }

  return { verify };
}

export function runtimeReleaseArtifactHealth(artifact) {
  return {
    verified: true,
    schemaVersion: artifact.manifest.schemaVersion,
    approvalSha: artifact.approvalSha,
    buildSourceSha: artifact.buildSourceSha,
    expectedRootSha256: artifact.expectedRootSha256,
    actualRootSha256: artifact.actualRootSha256,
    rootSha256: artifact.actualRootSha256,
    fileCount: artifact.manifest.files.length,
    ...(Number.isSafeInteger(artifact.verifiedAtEpochMs)
      ? {
          verifiedAt: new Date(artifact.verifiedAtEpochMs).toISOString(),
          proofTtlMs: artifact.proofTtlMs,
        }
      : {}),
  };
}
