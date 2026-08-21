import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { loadGeoStylePreview } from "./preview-loader";

describe("GEO style preview loader", () => {
  it("keeps all development preview entry data behind the lazy loader", async () => {
    const preview = await loadGeoStylePreview();

    expect(
      preview.createGeoStylePreviewProject("assessment").assessment,
    ).toBeDefined();
    expect(
      preview.createGeoStylePreviewProject("monitoring-setup").monitoring,
    ).toBeUndefined();
    expect(
      preview.createGeoStylePreviewProject("monitoring").monitoring?.answers,
    ).toHaveLength(5);
    expect(preview.geoStylePreviewRegions("domestic").regions).toHaveLength(31);
  });

  it("keeps the production loader disconnected from the fixture module", () => {
    const productionLoader = readFileSync(
      new URL("./preview-loader.production.ts", import.meta.url),
      "utf8",
    );
    const experience = readFileSync(
      new URL("./GeoBuildExperience.tsx", import.meta.url),
      "utf8",
    );
    const viteConfig = readFileSync(
      new URL("../../../../vite.config.ts", import.meta.url),
      "utf8",
    );

    expect(productionLoader).not.toContain('import("./preview")');
    expect(experience).not.toContain('import("./preview")');
    expect(experience).toContain("loadGeoStylePreview()");
    expect(viteConfig).toContain('"preview-loader.production.ts"');
  });
});
