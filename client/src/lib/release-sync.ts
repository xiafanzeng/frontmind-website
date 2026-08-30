declare const __FRONTMIND_BUILD_SHA__: string | null | undefined;
declare const __FRONTMIND_RELEASE_CHANNEL__: string | undefined;

const SHA_PATTERN = /^[a-f0-9]{40}$/;
const HEALTH_PATH = "/healthz";
const CACHE_BUST_PARAMETER = "__frontmind_build";
const SESSION_TARGET_KEY = "frontmind.release-sync.target-sha";
const CHECK_INTERVAL_MS = 30_000;
const CHECK_TIMEOUT_MS = 5_000;
const UPDATE_MESSAGE = "系统已更新，当前操作完成后自动同步";

export const FRONTMIND_RELEASE_SYNC_EVENT = "frontmind:release-sync";

export type ReleaseSyncStatus =
  | "disabled"
  | "current"
  | "checking"
  | "update_available"
  | "refreshing"
  | "refresh_guarded";

export type ReleaseSyncSnapshot = {
  status: ReleaseSyncStatus;
  clientBuildSha: string | null;
  targetBuildSha: string | null;
  blocked: boolean;
  message: string;
};

type ReleaseSyncListener = (snapshot: ReleaseSyncSnapshot) => void;
type FetchResponse = Pick<Response, "ok" | "json">;

type ReleaseSyncRuntime = {
  fetchHealth: (signal: AbortSignal) => Promise<FetchResponse>;
  href: () => string;
  replace: (url: string) => void;
  replaceHistory: (url: string) => void;
  isVisible: () => boolean;
  sessionStorage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  addWindowListener: (type: string, listener: EventListener) => void;
  removeWindowListener: (type: string, listener: EventListener) => void;
  addDocumentListener: (type: string, listener: EventListener) => void;
  removeDocumentListener: (type: string, listener: EventListener) => void;
  setInterval: (callback: () => void, delayMs: number) => unknown;
  clearInterval: (handle: unknown) => void;
  setTimeout: (callback: () => void, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  dispatchSnapshot?: (snapshot: ReleaseSyncSnapshot) => void;
};

type HealthIdentity = {
  buildSha: string;
};

export class ReleaseSyncBlockerRegistry {
  private readonly blockers = new Set<string>();
  private readonly listeners = new Set<() => void>();
  private sequence = 0;

  set(key: string, active: boolean): void {
    const normalized = key.trim();
    if (!normalized) return;
    const changed = active
      ? !this.blockers.has(normalized)
      : this.blockers.has(normalized);
    if (!changed) return;
    if (active) this.blockers.add(normalized);
    else this.blockers.delete(normalized);
    this.listeners.forEach((listener) => listener());
  }

  begin(label = "critical-write"): () => void {
    const key = `${label}:${++this.sequence}`;
    this.set(key, true);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.set(key, false);
    };
  }

  hasActive(): boolean {
    return this.blockers.size > 0;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export type ReleaseSyncControllerOptions = {
  clientBuildSha: string | null;
  releaseChannel: string;
  runtime: ReleaseSyncRuntime;
  blockers?: ReleaseSyncBlockerRegistry;
};

function normalizedSha(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim().toLowerCase();
  return SHA_PATTERN.test(candidate) ? candidate : null;
}

function parseHealthIdentity(
  payload: unknown,
  expectedChannel: string,
): HealthIdentity | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const health = payload as Record<string, unknown>;
  const buildSha = normalizedSha(health.buildSha);
  if (
    health.status !== "ok" ||
    health.service !== "frontmind-website" ||
    health.channel !== expectedChannel ||
    health.releaseChannel !== expectedChannel ||
    !buildSha
  ) {
    return null;
  }
  return { buildSha };
}

function safeStorageRead(
  storage: Pick<Storage, "getItem">,
  key: string,
): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageWrite(
  storage: Pick<Storage, "setItem">,
  key: string,
  value: string,
): void {
  try {
    storage.setItem(key, value);
  } catch {
    // A disabled session store must not prevent a safe version check.
  }
}

function safeStorageRemove(
  storage: Pick<Storage, "removeItem">,
  key: string,
): void {
  try {
    storage.removeItem(key);
  } catch {
    // A disabled session store must not prevent the application from loading.
  }
}

export class ReleaseSyncController {
  private readonly clientBuildSha: string | null;
  private readonly releaseChannel: string;
  private readonly runtime: ReleaseSyncRuntime;
  private readonly blockers: ReleaseSyncBlockerRegistry;
  private readonly listeners = new Set<ReleaseSyncListener>();
  private readonly releaseBlockerSubscription: () => void;
  private snapshot: ReleaseSyncSnapshot;
  private inFlight: Promise<void> | null = null;
  private intervalHandle: unknown;
  private deferredRefreshHandle: unknown;
  private started = false;
  private pendingTargetSha: string | null = null;
  private refreshCurrentAfterInFlight = false;

  private readonly checkFromPageShow = () => {
    void this.checkNow("pageshow");
  };
  private readonly checkFromFocus = () => {
    void this.checkNow("focus");
  };
  private readonly checkFromVisibility = () => {
    if (this.runtime.isVisible()) void this.checkNow("visible");
  };
  private readonly handlePreloadError = (event: Event) => {
    event.preventDefault();
    void this.checkNow("preload_error", true);
  };

  constructor(options: ReleaseSyncControllerOptions) {
    this.clientBuildSha = normalizedSha(options.clientBuildSha);
    this.releaseChannel = options.releaseChannel;
    this.runtime = options.runtime;
    this.blockers = options.blockers ?? new ReleaseSyncBlockerRegistry();
    this.snapshot = {
      status:
        this.clientBuildSha && this.releaseChannel ? "current" : "disabled",
      clientBuildSha: this.clientBuildSha,
      targetBuildSha: null,
      blocked: false,
      message: "",
    };
    this.releaseBlockerSubscription = this.blockers.subscribe(() => {
      this.handleBlockerChange();
    });
  }

  start(): void {
    if (this.started || !this.clientBuildSha || !this.releaseChannel) return;
    this.started = true;
    this.cleanupSuccessfulCacheBust();
    this.runtime.addWindowListener("pageshow", this.checkFromPageShow);
    this.runtime.addWindowListener("focus", this.checkFromFocus);
    this.runtime.addWindowListener(
      "vite:preloadError",
      this.handlePreloadError,
    );
    this.runtime.addDocumentListener(
      "visibilitychange",
      this.checkFromVisibility,
    );
    this.intervalHandle = this.runtime.setInterval(() => {
      if (this.runtime.isVisible()) void this.checkNow("interval");
    }, CHECK_INTERVAL_MS);
    void this.checkNow("startup");
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.runtime.removeWindowListener("pageshow", this.checkFromPageShow);
    this.runtime.removeWindowListener("focus", this.checkFromFocus);
    this.runtime.removeWindowListener(
      "vite:preloadError",
      this.handlePreloadError,
    );
    this.runtime.removeDocumentListener(
      "visibilitychange",
      this.checkFromVisibility,
    );
    if (this.intervalHandle !== undefined) {
      this.runtime.clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }
    if (this.deferredRefreshHandle !== undefined) {
      this.runtime.clearTimeout(this.deferredRefreshHandle);
      this.deferredRefreshHandle = undefined;
    }
  }

  dispose(): void {
    this.stop();
    this.releaseBlockerSubscription();
    this.listeners.clear();
  }

  getSnapshot(): ReleaseSyncSnapshot {
    return { ...this.snapshot };
  }

  subscribe(listener: ReleaseSyncListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  checkNow(reason = "manual", refreshIfCurrent = false): Promise<void> {
    if (!this.clientBuildSha || !this.releaseChannel) {
      return Promise.resolve();
    }
    if (this.inFlight) {
      if (refreshIfCurrent) this.refreshCurrentAfterInFlight = true;
      return this.inFlight;
    }

    const previous = this.snapshot;
    this.publish({ ...previous, status: "checking" });
    this.inFlight = this.fetchHealthIdentity()
      .then((identity) => {
        if (!identity) {
          this.refreshCurrentAfterInFlight = false;
          this.publish(previous);
          return;
        }
        if (identity.buildSha !== this.clientBuildSha) {
          this.refreshCurrentAfterInFlight = false;
          this.requestRefresh(identity.buildSha, reason);
          return;
        }
        const shouldRefreshCurrent =
          refreshIfCurrent || this.refreshCurrentAfterInFlight;
        this.refreshCurrentAfterInFlight = false;
        this.pendingTargetSha = null;
        this.cleanupSuccessfulCacheBust();
        this.publish({
          status: "current",
          clientBuildSha: this.clientBuildSha,
          targetBuildSha: null,
          blocked: false,
          message: "",
        });
        if (shouldRefreshCurrent) {
          this.requestRefresh(identity.buildSha, "preload_error");
        }
      })
      .catch(() => {
        // Deploy hand-over and network failures are transient. The next normal
        // trigger retries without interrupting the current application.
        this.refreshCurrentAfterInFlight = false;
        this.publish(previous);
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }

  private async fetchHealthIdentity(): Promise<HealthIdentity | null> {
    const controller = new AbortController();
    const timeout = this.runtime.setTimeout(
      () =>
        controller.abort(
          new DOMException("Health check timed out", "TimeoutError"),
        ),
      CHECK_TIMEOUT_MS,
    );
    try {
      const response = await this.runtime.fetchHealth(controller.signal);
      if (!response.ok) return null;
      return parseHealthIdentity(await response.json(), this.releaseChannel);
    } finally {
      this.runtime.clearTimeout(timeout);
    }
  }

  private requestRefresh(targetSha: string, _reason: string): void {
    this.pendingTargetSha = targetSha;
    if (this.blockers.hasActive()) {
      this.publish({
        status: "update_available",
        clientBuildSha: this.clientBuildSha,
        targetBuildSha: targetSha,
        blocked: true,
        message: UPDATE_MESSAGE,
      });
      return;
    }

    let url: URL;
    try {
      url = new URL(this.runtime.href());
    } catch {
      return;
    }
    const attemptedTarget = safeStorageRead(
      this.runtime.sessionStorage,
      SESSION_TARGET_KEY,
    );
    if (
      attemptedTarget === targetSha ||
      url.searchParams.get(CACHE_BUST_PARAMETER) === targetSha
    ) {
      this.publish({
        status: "refresh_guarded",
        clientBuildSha: this.clientBuildSha,
        targetBuildSha: targetSha,
        blocked: false,
        message: "系统新版本已就绪，请重新打开当前页面完成同步。",
      });
      return;
    }

    safeStorageWrite(
      this.runtime.sessionStorage,
      SESSION_TARGET_KEY,
      targetSha,
    );
    url.searchParams.set(CACHE_BUST_PARAMETER, targetSha);
    this.publish({
      status: "refreshing",
      clientBuildSha: this.clientBuildSha,
      targetBuildSha: targetSha,
      blocked: false,
      message: "正在同步系统新版本",
    });
    this.runtime.replace(url.toString());
  }

  private handleBlockerChange(): void {
    if (!this.pendingTargetSha) return;
    if (this.blockers.hasActive()) {
      if (this.snapshot.status === "update_available") return;
      this.publish({
        status: "update_available",
        clientBuildSha: this.clientBuildSha,
        targetBuildSha: this.pendingTargetSha,
        blocked: true,
        message: UPDATE_MESSAGE,
      });
      return;
    }
    if (this.deferredRefreshHandle !== undefined) return;
    // Release the navigation on the next task. This gives the caller that
    // awaited a successful write time to persist its returned project/token
    // before location.replace tears down the old application.
    this.deferredRefreshHandle = this.runtime.setTimeout(() => {
      this.deferredRefreshHandle = undefined;
      if (!this.pendingTargetSha) return;
      this.requestRefresh(this.pendingTargetSha, "blocker_released");
    }, 0);
  }

  private cleanupSuccessfulCacheBust(): void {
    if (!this.clientBuildSha) return;
    let url: URL;
    try {
      url = new URL(this.runtime.href());
    } catch {
      return;
    }
    if (url.searchParams.get(CACHE_BUST_PARAMETER) !== this.clientBuildSha) {
      return;
    }
    url.searchParams.delete(CACHE_BUST_PARAMETER);
    safeStorageRemove(this.runtime.sessionStorage, SESSION_TARGET_KEY);
    this.runtime.replaceHistory(url.toString());
  }

  private publish(snapshot: ReleaseSyncSnapshot): void {
    this.snapshot = { ...snapshot };
    const value = this.getSnapshot();
    this.listeners.forEach((listener) => listener(value));
    this.runtime.dispatchSnapshot?.(value);
  }
}

function browserRuntime(): ReleaseSyncRuntime | null {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }
  return {
    fetchHealth: (signal) =>
      window.fetch(HEALTH_PATH, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
        signal,
      }),
    href: () => window.location.href,
    replace: (url) => window.location.replace(url),
    replaceHistory: (url) =>
      window.history.replaceState(window.history.state, "", url),
    isVisible: () => document.visibilityState === "visible",
    sessionStorage: window.sessionStorage,
    addWindowListener: (type, listener) =>
      window.addEventListener(type, listener),
    removeWindowListener: (type, listener) =>
      window.removeEventListener(type, listener),
    addDocumentListener: (type, listener) =>
      document.addEventListener(type, listener),
    removeDocumentListener: (type, listener) =>
      document.removeEventListener(type, listener),
    setInterval: (callback, delayMs) => window.setInterval(callback, delayMs),
    clearInterval: (handle) => window.clearInterval(handle as number),
    setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimeout: (handle) => window.clearTimeout(handle as number),
    dispatchSnapshot: (snapshot) =>
      window.dispatchEvent(
        new CustomEvent(FRONTMIND_RELEASE_SYNC_EVENT, { detail: snapshot }),
      ),
  };
}

const defaultBlockers = new ReleaseSyncBlockerRegistry();
let defaultController: ReleaseSyncController | null = null;

function getDefaultController(): ReleaseSyncController | null {
  if (defaultController) return defaultController;
  const runtime = browserRuntime();
  if (!runtime) return null;
  const clientBuildSha =
    typeof __FRONTMIND_BUILD_SHA__ === "string"
      ? __FRONTMIND_BUILD_SHA__
      : null;
  const releaseChannel =
    typeof __FRONTMIND_RELEASE_CHANNEL__ === "string"
      ? __FRONTMIND_RELEASE_CHANNEL__
      : "";
  defaultController = new ReleaseSyncController({
    clientBuildSha,
    releaseChannel,
    runtime,
    blockers: defaultBlockers,
  });
  return defaultController;
}

export function startReleaseSync(): () => void {
  const controller = getDefaultController();
  controller?.start();
  return () => controller?.stop();
}

export function getReleaseSyncSnapshot(): ReleaseSyncSnapshot {
  return (
    getDefaultController()?.getSnapshot() ?? {
      status: "disabled",
      clientBuildSha: null,
      targetBuildSha: null,
      blocked: false,
      message: "",
    }
  );
}

export function subscribeReleaseSync(
  listener: ReleaseSyncListener,
): () => void {
  const controller = getDefaultController();
  if (!controller) {
    listener(getReleaseSyncSnapshot());
    return () => undefined;
  }
  return controller.subscribe(listener);
}

export function setReleaseSyncBlocker(key: string, active: boolean): void {
  defaultBlockers.set(key, active);
}

export function beginReleaseSyncWrite(label = "geo-write"): () => void {
  return defaultBlockers.begin(label);
}
