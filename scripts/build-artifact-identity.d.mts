export type BuildArtifactFile = {
  path: string;
  bytes: number;
  sha256: string;
};

export type BuildArtifactManifest = {
  schemaVersion: 1;
  buildSourceSha: string;
  excludedPaths: ["artifact-manifest.json"];
  files: BuildArtifactFile[];
  rootSha256: string;
};

export type BuildArtifactIdentity = {
  schemaVersion: 1;
  buildSourceSha: string;
};

export function writeBuildArtifactIdentity(
  buildRoot: string,
  buildSourceSha: string,
): Promise<BuildArtifactIdentity>;
export function readBuildArtifactIdentity(
  buildRoot: string,
): Promise<BuildArtifactIdentity>;
export function writeBuildArtifactManifest(
  buildRoot: string,
  buildSourceSha: string,
): Promise<BuildArtifactManifest>;
export function readBuildArtifactManifest(
  buildRoot: string,
): Promise<BuildArtifactManifest>;
export function assertBuildArtifactLineage(options: {
  repositoryRoot: string;
  approvalSha: string;
  buildSourceSha: string;
}): {
  approvalSha: string;
  buildSourceSha: string;
  changedPaths: string[];
};

export function verifyBuildArtifactManifest(
  buildRoot: string,
  options?: { expectedBuildSourceSha?: string | null },
): Promise<BuildArtifactManifest>;
