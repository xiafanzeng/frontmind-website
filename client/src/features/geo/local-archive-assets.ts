import type { GeoKnowledgeAsset } from "./types";
import { getGeoArchive } from "./storage";

const MAX_LOCAL_PREVIEW_ASSETS = 48;
const MAX_LOCAL_PREVIEW_BYTES = 64 * 1024 * 1024;
const MAX_LOCAL_PREVIEW_FILE_BYTES = 8 * 1024 * 1024;

type LocalAssetLimits = {
  maxAssets?: number;
  maxTotalBytes?: number;
  maxFileBytes?: number;
};

export function geoLocalArchiveAssetRefreshKey(
  projectId: string,
  assets: readonly GeoKnowledgeAsset[],
  archivePersistenceVersion = 0,
) {
  const archiveAssetSignature = assets
    .filter((asset) => asset.archivePath)
    .map((asset) => `${asset.id}:${asset.archivePath}`)
    .join("|");
  return `${projectId}\u0000${archivePersistenceVersion}\u0000${archiveAssetSignature}`;
}

export function paginateGeoKnowledgeAssets(
  assets: readonly GeoKnowledgeAsset[],
  requestedPage: number,
  pageSize = 12,
) {
  const safePageSize =
    Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : 12;
  const pageCount = Math.max(1, Math.ceil(assets.length / safePageSize));
  const page = Math.min(
    Math.max(0, Number.isSafeInteger(requestedPage) ? requestedPage : 0),
    pageCount - 1,
  );
  return {
    items: assets.slice(page * safePageSize, (page + 1) * safePageSize),
    page,
    pageCount,
  };
}

const MIME_BY_EXTENSION: Record<string, string> = {
  avif: "image/avif",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function ascii(bytes: Uint8Array, start: number, length: number) {
  let result = "";
  const end = Math.min(bytes.length, start + length);
  for (let index = start; index < end; index += 1) {
    result += String.fromCharCode(bytes[index] ?? 0);
  }
  return result;
}

function sniffRasterMime(bytes: Uint8Array): string | undefined {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 3) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return "image/png";
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return "image/jpeg";
  if (
    bytes.length >= 6 &&
    (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")
  )
    return "image/gif";
  if (
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 4) === "WEBP"
  )
    return "image/webp";
  if (
    bytes.length >= 16 &&
    ascii(bytes, 4, 4) === "ftyp" &&
    /(?:avif|avis)/.test(ascii(bytes, 8, Math.min(56, bytes.length - 8)))
  )
    return "image/avif";
  return undefined;
}

export function safeGeoArchiveAssetPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const path = value.trim();
  if (
    !path ||
    path.length > 500 ||
    path.includes("\0") ||
    path.includes("\\") ||
    path.startsWith("/") ||
    path.includes("//")
  )
    return undefined;
  const segments = path.split("/");
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  )
    return undefined;
  const extension = segments.at(-1)?.split(".").at(-1)?.toLowerCase();
  return extension && MIME_BY_EXTENSION[extension] ? path : undefined;
}

function safeZipEntryPath(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const path = value.trim();
  if (
    !path ||
    path.length > 700 ||
    path.includes("\0") ||
    path.includes("\\") ||
    path.startsWith("/") ||
    path.includes("//")
  )
    return undefined;
  const segments = path.split("/");
  return segments.some(
    (segment) => !segment || segment === "." || segment === "..",
  )
    ? undefined
    : path;
}

/**
 * Extract only API-allowlisted raster entries from an already validated local
 * archive. Extension and file signature must agree before a Blob is returned.
 */
export async function extractLocalGeoAssetBlobs(
  archive: Blob,
  assets: readonly GeoKnowledgeAsset[],
  limits: LocalAssetLimits = {},
): Promise<Map<string, Blob>> {
  const maxAssets = limits.maxAssets ?? MAX_LOCAL_PREVIEW_ASSETS;
  const maxTotalBytes = limits.maxTotalBytes ?? MAX_LOCAL_PREVIEW_BYTES;
  const maxFileBytes = limits.maxFileBytes ?? MAX_LOCAL_PREVIEW_FILE_BYTES;
  if (
    maxAssets <= 0 ||
    maxTotalBytes <= 0 ||
    maxFileBytes <= 0 ||
    archive.size > 100 * 1024 * 1024
  )
    return new Map();

  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await archive.arrayBuffer());
  const blobs = new Map<string, Blob>();
  const seenPaths = new Set<string>();
  let totalBytes = 0;

  for (const asset of assets) {
    if (blobs.size >= maxAssets) break;
    const archivePath = safeGeoArchiveAssetPath(asset.archivePath);
    if (!archivePath || seenPaths.has(archivePath)) continue;
    seenPaths.add(archivePath);
    const matchingEntries = Object.values(zip.files).filter((entry) => {
      if (entry.dir) return false;
      const unsafeOriginalName = (
        entry as typeof entry & { unsafeOriginalName?: string }
      ).unsafeOriginalName;
      const normalizedName = safeZipEntryPath(entry.name);
      const normalizedOriginal = unsafeOriginalName
        ? safeZipEntryPath(unsafeOriginalName)
        : normalizedName;
      if (
        !normalizedName ||
        !normalizedOriginal ||
        normalizedName !== normalizedOriginal
      )
        return false;
      return (
        normalizedName === archivePath ||
        normalizedName.endsWith(`/${archivePath}`)
      );
    });
    if (matchingEntries.length !== 1) continue;
    const entry = matchingEntries[0]!;

    const bytes = await entry.async("uint8array");
    if (
      bytes.byteLength === 0 ||
      bytes.byteLength > maxFileBytes ||
      totalBytes + bytes.byteLength > maxTotalBytes
    )
      continue;
    const mime = sniffRasterMime(bytes);
    const extension = archivePath.split(".").at(-1)?.toLowerCase();
    if (!mime || !extension || MIME_BY_EXTENSION[extension] !== mime) continue;

    totalBytes += bytes.byteLength;
    blobs.set(asset.id, new Blob([bytes], { type: mime }));
  }

  return blobs;
}

export async function loadLocalGeoAssetBlobs(
  projectId: string,
  assets: readonly GeoKnowledgeAsset[],
): Promise<Map<string, Blob> | undefined> {
  const stored = await getGeoArchive(projectId);
  if (!stored) return undefined;
  return extractLocalGeoAssetBlobs(stored.blob, assets);
}
