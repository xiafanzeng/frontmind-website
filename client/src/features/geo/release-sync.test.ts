import { describe, expect, it, vi } from "vitest";
import {
  ReleaseSyncBlockerRegistry,
  ReleaseSyncController,
} from "@/lib/release-sync";

const CLIENT_SHA = "a".repeat(40);
const TARGET_SHA = "b".repeat(40);

function health(
  buildSha = CLIENT_SHA,
  overrides: Record<string, unknown> = {},
) {
  return {
    ok: true,
    json: async () => ({
      status: "ok",
      service: "frontmind-website",
      channel: "development",
      releaseChannel: "development",
      buildSha,
      ...overrides,
    }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createHarness(
  options: {
    href?: string;
    fetchHealth?: (signal: AbortSignal) => Promise<ReturnType<typeof health>>;
    visible?: boolean;
    storedTarget?: string;
  } = {},
) {
  let href = options.href ?? "https://website.test/?project=p-1#monitor";
  let visible = options.visible ?? true;
  const storage = new Map<string, string>();
  if (options.storedTarget) {
    storage.set("frontmind.release-sync.target-sha", options.storedTarget);
  }
  const windowListeners = new Map<string, Set<EventListener>>();
  const documentListeners = new Map<string, Set<EventListener>>();
  const intervalCallbacks: Array<() => void> = [];
  const replace = vi.fn((next: string) => {
    href = next;
  });
  const replaceHistory = vi.fn((next: string) => {
    href = next;
  });
  const timeoutDelays: number[] = [];
  const fetchHealth = options.fetchHealth ?? (async () => health(CLIENT_SHA));

  const add = (
    entries: Map<string, Set<EventListener>>,
    type: string,
    listener: EventListener,
  ) => {
    const listeners = entries.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    entries.set(type, listeners);
  };
  const remove = (
    entries: Map<string, Set<EventListener>>,
    type: string,
    listener: EventListener,
  ) => entries.get(type)?.delete(listener);
  const dispatch = (
    entries: Map<string, Set<EventListener>>,
    type: string,
    event = new Event(type, { cancelable: true }),
  ) => {
    entries.get(type)?.forEach((listener) => listener(event));
    return event;
  };

  return {
    runtime: {
      fetchHealth,
      href: () => href,
      replace,
      replaceHistory,
      isVisible: () => visible,
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      addWindowListener: (type: string, listener: EventListener) =>
        add(windowListeners, type, listener),
      removeWindowListener: (type: string, listener: EventListener) =>
        remove(windowListeners, type, listener),
      addDocumentListener: (type: string, listener: EventListener) =>
        add(documentListeners, type, listener),
      removeDocumentListener: (type: string, listener: EventListener) =>
        remove(documentListeners, type, listener),
      setInterval: (callback: () => void, delayMs: number) => {
        expect(delayMs).toBe(30_000);
        intervalCallbacks.push(callback);
        return intervalCallbacks.length;
      },
      clearInterval: vi.fn(),
      setTimeout: (callback: () => void, delayMs: number) => {
        timeoutDelays.push(delayMs);
        if (delayMs === 0) return globalThis.setTimeout(callback, 0);
        return { callback };
      },
      clearTimeout: (handle: unknown) => {
        if (typeof handle === "number") globalThis.clearTimeout(handle);
      },
    },
    replace,
    replaceHistory,
    storage,
    timeoutDelays,
    intervalCallbacks,
    setVisible(value: boolean) {
      visible = value;
    },
    dispatchWindow(type: string, event?: Event) {
      return dispatch(windowListeners, type, event);
    },
    dispatchDocument(type: string, event?: Event) {
      return dispatch(documentListeners, type, event);
    },
  };
}

function controllerFor(
  harness: ReturnType<typeof createHarness>,
  blockers = new ReleaseSyncBlockerRegistry(),
) {
  return new ReleaseSyncController({
    clientBuildSha: CLIENT_SHA,
    releaseChannel: "development",
    runtime: harness.runtime,
    blockers,
  });
}

async function flushChecks() {
  await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
}

describe("Website release synchronizer", () => {
  it("does not reload for the same build and uses one five-second health request", async () => {
    const harness = createHarness();
    const controller = controllerFor(harness);

    await controller.checkNow();

    expect(harness.replace).not.toHaveBeenCalled();
    expect(controller.getSnapshot().status).toBe("current");
    expect(harness.timeoutDelays).toEqual([5_000]);
  });

  it("preserves route/query/hash and reloads once with the target SHA", async () => {
    const harness = createHarness({
      fetchHealth: async () => health(TARGET_SHA),
    });
    const controller = controllerFor(harness);

    await controller.checkNow();
    await controller.checkNow();

    expect(harness.replace).toHaveBeenCalledTimes(1);
    const replacement = new URL(harness.replace.mock.calls[0]![0]);
    expect(replacement.pathname).toBe("/");
    expect(replacement.searchParams.get("project")).toBe("p-1");
    expect(replacement.searchParams.get("__frontmind_build")).toBe(TARGET_SHA);
    expect(replacement.hash).toBe("#monitor");
    expect(controller.getSnapshot().status).toBe("refresh_guarded");
  });

  it("waits for critical writes and refreshes automatically after the last blocker", async () => {
    const blockers = new ReleaseSyncBlockerRegistry();
    const releaseFirst = blockers.begin("geo-post");
    const releaseSecond = blockers.begin("geo-upload");
    const harness = createHarness({
      fetchHealth: async () => health(TARGET_SHA),
    });
    const controller = controllerFor(harness, blockers);

    await controller.checkNow();
    expect(harness.replace).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({
      status: "update_available",
      blocked: true,
      message: "系统已更新，当前操作完成后自动同步",
    });

    releaseFirst();
    expect(harness.replace).not.toHaveBeenCalled();
    releaseSecond();
    await flushChecks();
    expect(harness.replace).toHaveBeenCalledTimes(1);
    expect(controller.getSnapshot().status).toBe("refreshing");
  });

  it("deduplicates concurrent checks", async () => {
    const response = deferred<ReturnType<typeof health>>();
    const fetchHealth = vi.fn(() => response.promise);
    const harness = createHarness({ fetchHealth });
    const controller = controllerFor(harness);

    const first = controller.checkNow();
    const second = controller.checkNow();
    response.resolve(health());
    await Promise.all([first, second]);

    expect(fetchHealth).toHaveBeenCalledTimes(1);
  });

  it("rejects wrong service, channel, malformed SHA and HTTP failures", async () => {
    const responses = [
      health(TARGET_SHA, { service: "frontmind-dashboard" }),
      health(TARGET_SHA, { channel: "production" }),
      health("short"),
      { ok: false, json: async () => health(TARGET_SHA) },
    ];
    const fetchHealth = vi.fn(async () => responses.shift()!);
    const harness = createHarness({ fetchHealth });
    const controller = controllerFor(harness);

    for (let index = 0; index < 4; index += 1) {
      await controller.checkNow();
    }

    expect(harness.replace).not.toHaveBeenCalled();
    expect(controller.getSnapshot().status).toBe("current");
  });

  it("checks on startup, pageshow, focus, visible resume and visible intervals", async () => {
    const fetchHealth = vi.fn(async () => health());
    const harness = createHarness({ fetchHealth });
    const controller = controllerFor(harness);

    controller.start();
    await flushChecks();
    expect(fetchHealth).toHaveBeenCalledTimes(1);

    harness.dispatchWindow("pageshow");
    await flushChecks();
    harness.dispatchWindow("focus");
    await flushChecks();
    harness.setVisible(false);
    harness.intervalCallbacks[0]!();
    await flushChecks();
    harness.setVisible(true);
    harness.dispatchDocument("visibilitychange");
    await flushChecks();
    harness.intervalCallbacks[0]!();
    await flushChecks();

    expect(fetchHealth).toHaveBeenCalledTimes(5);
    controller.dispose();
  });

  it("confirms identity before recovering a missing dynamic chunk", async () => {
    const harness = createHarness();
    const controller = controllerFor(harness);
    controller.start();
    await flushChecks();

    const preloadError = harness.dispatchWindow("vite:preloadError");
    await flushChecks();

    expect(preloadError.defaultPrevented).toBe(true);
    expect(harness.replace).toHaveBeenCalledTimes(1);
    expect(
      new URL(harness.replace.mock.calls[0]![0]).searchParams.get(
        "__frontmind_build",
      ),
    ).toBe(CLIENT_SHA);
    controller.dispose();
  });

  it("retains a preload recovery request while the startup check is in flight", async () => {
    const response = deferred<ReturnType<typeof health>>();
    const harness = createHarness({ fetchHealth: () => response.promise });
    const controller = controllerFor(harness);
    controller.start();

    const preloadError = harness.dispatchWindow("vite:preloadError");
    response.resolve(health());
    await flushChecks();

    expect(preloadError.defaultPrevented).toBe(true);
    expect(harness.replace).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it("removes the successful cache-bust marker when the new bundle starts", async () => {
    const harness = createHarness({
      href: `https://website.test/workbench?foo=1&__frontmind_build=${CLIENT_SHA}#result`,
      storedTarget: CLIENT_SHA,
    });
    const controller = controllerFor(harness);

    controller.start();
    await flushChecks();

    expect(harness.replaceHistory).toHaveBeenCalledTimes(1);
    const cleaned = new URL(harness.replaceHistory.mock.calls[0]![0]);
    expect(cleaned.searchParams.get("foo")).toBe("1");
    expect(cleaned.searchParams.has("__frontmind_build")).toBe(false);
    expect(cleaned.hash).toBe("#result");
    expect(harness.storage.has("frontmind.release-sync.target-sha")).toBe(
      false,
    );
    controller.dispose();
  });
});
