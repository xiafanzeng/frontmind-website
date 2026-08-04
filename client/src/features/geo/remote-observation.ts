import type { GeoProject } from "./types";

export type CommitRemoteProjectOptions = {
  expectedRemoteToken: string;
  skipPersistence: true;
};

type CommitRemoteProjectObservationInput = {
  operationProject: GeoProject;
  updated: GeoProject;
  persistIfCurrent: (
    project: GeoProject,
    expectedRemoteToken: string,
  ) => Promise<boolean>;
  commit: (project: GeoProject, options: CommitRemoteProjectOptions) => void;
  onPersistenceFailure: () => void;
};

/**
 * Keep the IndexedDB compare-and-swap authoritative when it is available.
 * If local storage itself is unavailable after a successful remote operation,
 * preserve the new token in React memory without attempting a non-atomic write.
 */
export async function commitRemoteProjectObservation({
  operationProject,
  updated,
  persistIfCurrent,
  commit,
  onPersistenceFailure,
}: CommitRemoteProjectObservationInput): Promise<boolean> {
  const expectedRemoteToken = operationProject.remoteToken;
  if (!expectedRemoteToken) return false;

  try {
    const saved = await persistIfCurrent(updated, expectedRemoteToken);
    if (!saved) return false;
  } catch {
    commit(updated, { expectedRemoteToken, skipPersistence: true });
    onPersistenceFailure();
    return true;
  }

  commit(updated, { expectedRemoteToken, skipPersistence: true });
  return true;
}
