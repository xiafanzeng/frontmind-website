import { describe, expect, it, vi } from "vitest";

import { commitRemoteProjectObservation } from "./remote-observation";
import type { GeoProject } from "./types";

function project(remoteToken: string): GeoProject {
  return {
    id: "project-remote-observation",
    remoteToken,
    title: "Acme",
    input: "Acme",
    createdAt: "2026-08-04T00:00:00.000Z",
    updatedAt: "2026-08-04T00:00:01.000Z",
    stage: "current_assessment",
    status: "processing",
    progress: 80,
    files: [],
    questions: [],
    selectedPlatformIds: [],
  };
}

describe("remote GEO project observation commit", () => {
  it("persists with CAS and commits the new token to memory exactly once", async () => {
    const operationProject = project("token-before");
    const updated = project("token-after");
    const persistIfCurrent = vi.fn(async () => true);
    const commit = vi.fn();
    const onPersistenceFailure = vi.fn();

    await expect(
      commitRemoteProjectObservation({
        operationProject,
        updated,
        persistIfCurrent,
        commit,
        onPersistenceFailure,
      }),
    ).resolves.toBe(true);

    expect(persistIfCurrent).toHaveBeenCalledWith(updated, "token-before");
    expect(commit).toHaveBeenCalledOnce();
    expect(commit).toHaveBeenCalledWith(updated, {
      expectedRemoteToken: "token-before",
      skipPersistence: true,
    });
    expect(onPersistenceFailure).not.toHaveBeenCalled();
  });

  it("does not revive a deleted or newer project when CAS returns false", async () => {
    const commit = vi.fn();

    await expect(
      commitRemoteProjectObservation({
        operationProject: project("token-before"),
        updated: project("token-after"),
        persistIfCurrent: vi.fn(async () => false),
        commit,
        onPersistenceFailure: vi.fn(),
      }),
    ).resolves.toBe(false);

    expect(commit).not.toHaveBeenCalled();
  });

  it("keeps the successful remote token in memory when IndexedDB is unavailable", async () => {
    const updated = project("token-after");
    const commit = vi.fn();
    const onPersistenceFailure = vi.fn();

    await expect(
      commitRemoteProjectObservation({
        operationProject: project("token-before"),
        updated,
        persistIfCurrent: vi.fn(async () => {
          throw new Error("IndexedDB blocked");
        }),
        commit,
        onPersistenceFailure,
      }),
    ).resolves.toBe(true);

    expect(commit).toHaveBeenCalledWith(updated, {
      expectedRemoteToken: "token-before",
      skipPersistence: true,
    });
    expect(onPersistenceFailure).toHaveBeenCalledOnce();
  });
});
