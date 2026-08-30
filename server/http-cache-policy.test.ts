import { describe, expect, it, vi } from "vitest";
import {
  isViteHashedAsset,
  setWebsiteHealthCacheHeaders,
  setWebsiteHtmlCacheHeaders,
  setWebsiteStaticCacheHeaders,
  WEBSITE_HASHED_ASSET_CACHE_CONTROL,
  WEBSITE_HEALTH_CACHE_CONTROL,
  WEBSITE_HTML_CACHE_CONTROL,
  WEBSITE_REVALIDATE_CACHE_CONTROL,
} from "./http-cache-policy";

function responseRecorder() {
  const setHeader = vi.fn();
  return { response: { setHeader }, setHeader };
}

describe("Website release cache policy", () => {
  it("keeps health and every HTML response out of reusable caches", () => {
    const health = responseRecorder();
    const html = responseRecorder();

    setWebsiteHealthCacheHeaders(health.response);
    setWebsiteHtmlCacheHeaders(html.response);

    expect(health.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      WEBSITE_HEALTH_CACHE_CONTROL,
    );
    expect(html.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      WEBSITE_HTML_CACHE_CONTROL,
    );
  });

  it("only grants immutable caching to Vite content-hashed assets", () => {
    expect(isViteHashedAsset("assets/index-D0xYz_12.js")).toBe(true);
    expect(isViteHashedAsset("assets/permission-demo-Bi11aBc9.mp4")).toBe(true);
    expect(isViteHashedAsset("assets/runtime.js")).toBe(false);
    expect(isViteHashedAsset("images/logo-12345678.svg")).toBe(false);

    const hashed = responseRecorder();
    const stable = responseRecorder();
    setWebsiteStaticCacheHeaders(
      hashed.response,
      "/srv/public/assets/index-D0xYz_12.js",
      "/srv/public",
    );
    setWebsiteStaticCacheHeaders(
      stable.response,
      "/srv/public/home/hero.webp",
      "/srv/public",
    );

    expect(hashed.setHeader).toHaveBeenLastCalledWith(
      "Cache-Control",
      WEBSITE_HASHED_ASSET_CACHE_CONTROL,
    );
    expect(stable.setHeader).toHaveBeenLastCalledWith(
      "Cache-Control",
      WEBSITE_REVALIDATE_CACHE_CONTROL,
    );
  });

  it("applies the HTML policy to generated nested route documents", () => {
    const nested = responseRecorder();
    setWebsiteStaticCacheHeaders(
      nested.response,
      "/srv/public/blog/example/index.html",
      "/srv/public",
    );
    expect(nested.setHeader).toHaveBeenLastCalledWith(
      "Cache-Control",
      WEBSITE_HTML_CACHE_CONTROL,
    );
  });
});
