import type { GeoProject } from "./types";

const DATABASE_NAME = "frontmind-geo-projects";
const DATABASE_VERSION = 1;
const PROJECT_STORE = "projects";
const ARCHIVE_STORE = "archives";

export const GEO_ARCHIVE_PERSIST_RETRY_DELAYS_MS = [
  2_000, 6_000, 15_000,
] as const;

type GeoArchiveRetryOptions = {
  delaysMs?: readonly number[];
  signal?: AbortSignal;
  wait?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
};

export type GeoStoredArchive = {
  projectId: string;
  blob: Blob;
  filename: string;
  savedAt: string;
};

function waitForGeoArchiveRetry(
  delayMs: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("自动归档已取消。"));
      return;
    }

    const handleAbort = () => {
      window.clearTimeout(timer);
      reject(signal?.reason ?? new Error("自动归档已取消。"));
    };
    const timer = window.setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

/**
 * Retries the whole download-and-persist operation with a bounded backoff.
 * Callers should only mark an archive as persisted after this resolves.
 */
export async function retryGeoArchivePersistence<T>(
  operation: () => Promise<T>,
  options: GeoArchiveRetryOptions = {},
): Promise<T> {
  const delays = options.delaysMs ?? GEO_ARCHIVE_PERSIST_RETRY_DELAYS_MS;
  const wait = options.wait ?? waitForGeoArchiveRetry;

  for (let attempt = 0; ; attempt += 1) {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new Error("自动归档已取消。");
    }
    try {
      return await operation();
    } catch (error) {
      const delay = delays[attempt];
      if (delay === undefined || options.signal?.aborted) throw error;
      await wait(delay, options.signal);
    }
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("当前浏览器不支持本地项目存储。"));
      return;
    }

    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROJECT_STORE)) {
        database.createObjectStore(PROJECT_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(ARCHIVE_STORE)) {
        database.createObjectStore(ARCHIVE_STORE, { keyPath: "projectId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("无法打开本地项目存储。"));
    request.onblocked = () =>
      reject(new Error("本地项目存储正在被其他页面占用。"));
  });
}

function runRequest<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(storeName, mode);
        const request = action(transaction.objectStore(storeName));
        let result: T;
        let settled = false;

        request.onsuccess = () => {
          result = request.result;
        };
        request.onerror = () => {
          if (settled) return;
          settled = true;
          database.close();
          reject(request.error ?? new Error("本地项目存储操作失败。"));
        };
        transaction.oncomplete = () => {
          if (settled) return;
          settled = true;
          database.close();
          resolve(result);
        };
        const rejectTransaction = () => {
          if (settled) return;
          settled = true;
          database.close();
          reject(transaction.error ?? new Error("本地项目存储操作失败。"));
        };
        transaction.onerror = rejectTransaction;
        transaction.onabort = rejectTransaction;
      }),
  );
}

export async function requestPersistentGeoStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function listGeoProjects(): Promise<GeoProject[]> {
  const projects = await runRequest<GeoProject[]>(
    PROJECT_STORE,
    "readonly",
    (store) => store.getAll(),
  );
  return projects.sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

export function saveGeoProject(project: GeoProject): Promise<IDBValidKey> {
  return runRequest(PROJECT_STORE, "readwrite", (store) => store.put(project));
}

export async function removeGeoProject(projectId: string): Promise<void> {
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(
      [PROJECT_STORE, ARCHIVE_STORE],
      "readwrite",
    );
    transaction.objectStore(PROJECT_STORE).delete(projectId);
    transaction.objectStore(ARCHIVE_STORE).delete(projectId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("无法删除本地项目。"));
  }).finally(() => database.close());
}

export function saveGeoArchive(
  archive: GeoStoredArchive,
): Promise<IDBValidKey> {
  return runRequest(ARCHIVE_STORE, "readwrite", (store) => store.put(archive));
}

export function getGeoArchive(
  projectId: string,
): Promise<GeoStoredArchive | undefined> {
  return runRequest<GeoStoredArchive | undefined>(
    ARCHIVE_STORE,
    "readonly",
    (store) => store.get(projectId),
  );
}
