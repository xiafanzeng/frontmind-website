import path from "node:path";
import type { Response } from "express";

export const WEBSITE_HEALTH_CACHE_CONTROL = "private, no-store";
export const WEBSITE_HTML_CACHE_CONTROL =
  "no-cache, max-age=0, must-revalidate";
export const WEBSITE_REVALIDATE_CACHE_CONTROL =
  "public, max-age=0, must-revalidate";
export const WEBSITE_HASHED_ASSET_CACHE_CONTROL =
  "public, max-age=31536000, immutable";

const VITE_HASHED_ASSET_PATTERN =
  /(?:^|\/)[^/]+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/;

export function isViteHashedAsset(relativePath: string): boolean {
  return (
    relativePath.startsWith("assets/") &&
    VITE_HASHED_ASSET_PATTERN.test(relativePath)
  );
}

export function setWebsiteHealthCacheHeaders(
  response: Pick<Response, "setHeader">,
): void {
  response.setHeader("Cache-Control", WEBSITE_HEALTH_CACHE_CONTROL);
}

export function setWebsiteHtmlCacheHeaders(
  response: Pick<Response, "setHeader">,
): void {
  response.setHeader("Cache-Control", WEBSITE_HTML_CACHE_CONTROL);
}

export function setWebsiteStaticCacheHeaders(
  response: Pick<Response, "setHeader">,
  filePath: string,
  staticPath: string,
): void {
  const relativePath = path
    .relative(staticPath, filePath)
    .split(path.sep)
    .join("/");

  if (relativePath === "index.html" || relativePath.endsWith("/index.html")) {
    setWebsiteHtmlCacheHeaders(response);
    return;
  }
  response.setHeader(
    "Cache-Control",
    isViteHashedAsset(relativePath)
      ? WEBSITE_HASHED_ASSET_CACHE_CONTROL
      : WEBSITE_REVALIDATE_CACHE_CONTROL,
  );
}
