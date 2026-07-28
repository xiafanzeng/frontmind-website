import { describe, expect, it, vi } from "vitest";
import { retryGeoArchivePersistence } from "./storage";

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
