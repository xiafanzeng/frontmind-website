import { describe, expect, it } from "vitest";
import { geoLocalContentPaths, loadGeoLocalContent } from "./localContent";

describe("geo community local content loading", () => {
  it("keeps route paths unique while leaving content lazy", () => {
    expect(new Set(geoLocalContentPaths).size).toBe(
      geoLocalContentPaths.length,
    );
    expect(geoLocalContentPaths).toContain("/");
    expect(geoLocalContentPaths).toContain("/geo-framework");
    expect(geoLocalContentPaths).toContain("/resources/geo-glossary");
    expect(
      geoLocalContentPaths.some((path) => path.startsWith("/blogs/")),
    ).toBe(false);
  });

  it("loads the requested route without changing its frontmatter identity", async () => {
    const content = await loadGeoLocalContent("/geo-framework");

    expect(content?.path).toBe("/geo-framework");
    expect(content?.body).toContain("GEO framework");
    expect(content?.ready).toBe(true);
    await expect(
      loadGeoLocalContent("/not-a-real-page"),
    ).resolves.toBeUndefined();
  });
});
