import { describe, expect, it, vi } from "vitest";
import {
  canCommitGeoProjectObservation,
  retryGeoArchivePersistence,
} from "./storage";
import type { GeoProject } from "./types";

function project(remoteToken: string): GeoProject {
  return {
    id: "project-cas",
    remoteToken,
    title: "Acme",
    input: "Acme",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    stage: "question_recommendation",
    status: "ready",
    progress: 100,
    files: [],
    questions: [],
    selectedPlatformIds: [],
  };
}

describe("custom-question project observation fencing", () => {
  it("accepts only the operation input token or an idempotent result token", () => {
    const next = project("token-result-a");
    expect(
      canCommitGeoProjectObservation(
        project("token-before-a"),
        next,
        "token-before-a",
      ),
    ).toBe(true);
    expect(canCommitGeoProjectObservation(next, next, "token-before-a")).toBe(
      true,
    );
    expect(
      canCommitGeoProjectObservation(
        project("token-newer-b"),
        next,
        "token-before-a",
      ),
    ).toBe(false);
    expect(
      canCommitGeoProjectObservation(undefined, next, "token-before-a"),
    ).toBe(false);
  });
});

describe("retryGeoArchivePersistence", () => {
  it("retries network or IndexedDB failures with bounded backoff and completes on success", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("network"))
      .mockRejectedValueOnce(new Error("indexeddb"))
      .mockResolvedValue("saved");
    const wait = vi.fn(async () => undefined);

    await expect(
      retryGeoArchivePersistence(operation, {
        delaysMs: [2_000, 6_000, 15_000],
        wait,
      }),
    ).resolves.toBe("saved");

    expect(operation).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls.map(([delay]) => delay)).toEqual([2_000, 6_000]);
  });

  it("stops after the configured retry budget instead of looping", async () => {
    const failure = new Error("still unavailable");
    const operation = vi.fn<() => Promise<never>>().mockRejectedValue(failure);
    const wait = vi.fn(async () => undefined);

    await expect(
      retryGeoArchivePersistence(operation, {
        delaysMs: [1, 2, 3],
        wait,
      }),
    ).rejects.toBe(failure);

    expect(operation).toHaveBeenCalledTimes(4);
    expect(wait).toHaveBeenCalledTimes(3);
  });

  it("does not start another attempt after cancellation", async () => {
    const controller = new AbortController();
    controller.abort(new Error("project changed"));
    const operation = vi.fn<() => Promise<void>>();

    await expect(
      retryGeoArchivePersistence(operation, { signal: controller.signal }),
    ).rejects.toThrow("project changed");
    expect(operation).not.toHaveBeenCalled();
  });
});
