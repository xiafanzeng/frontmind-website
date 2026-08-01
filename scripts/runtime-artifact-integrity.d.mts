import type { BuildArtifactManifest } from "./build-artifact-identity.mjs";

export type RuntimeReleaseArtifact = {
  approvalSha: string;
  buildSourceSha: string;
  expectedRootSha256: string;
  actualRootSha256: string;
  manifest: BuildArtifactManifest;
};

export type RuntimeReleaseArtifactProof = RuntimeReleaseArtifact & {
  verifiedAtEpochMs: number;
  proofExpiresAtEpochMs: number;
  proofTtlMs: number;
};

export const RUNTIME_ARTIFACT_PROOF_TTL_MS: 5000;

export function verifyRuntimeReleaseArtifact(
  buildRoot: string,
  options: {
    buildSourceSha: string | null | undefined;
    approvalSha?: string;
    expectedRootSha256?: string;
    env?: NodeJS.ProcessEnv;
  },
): Promise<RuntimeReleaseArtifact>;

export function createRuntimeReleaseArtifactVerifier(options: {
  buildRoot: string;
  buildSourceSha: string | null | undefined;
  approvalSha?: string;
  expectedRootSha256?: string;
  env?: NodeJS.ProcessEnv;
  ttlMs?: number;
  now?: () => number;
  verifyArtifact?: () => Promise<RuntimeReleaseArtifact>;
}): {
  verify(options?: { force?: boolean }): Promise<RuntimeReleaseArtifactProof>;
};

export function runtimeReleaseArtifactHealth(
  artifact: RuntimeReleaseArtifact | RuntimeReleaseArtifactProof,
): {
  verified: true;
  schemaVersion: 1;
  approvalSha: string;
  buildSourceSha: string;
  expectedRootSha256: string;
  actualRootSha256: string;
  rootSha256: string;
  fileCount: number;
  verifiedAt?: string;
  proofTtlMs?: number;
};
