import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import {
  extractLocalGeoAssetBlobs,
  geoLocalArchiveAssetRefreshKey,
  paginateGeoKnowledgeAssets,
  safeGeoArchiveAssetPath,
} from "./local-archive-assets";

describe("local knowledge archive assets", () => {
  it("changes the local extraction key when a ZIP finishes persisting", () => {
    const assets = [
      {
        id: "logo",
        name: "logo.webp",
        archivePath: "09_media_assets/logo.webp",
        previewUrl: "/api/geo/fallback/logo",
      },
    ];

    const beforePersistence = geoLocalArchiveAssetRefreshKey(
      "project-1",
      assets,
      0,
    );
    const afterPersistence = geoLocalArchiveAssetRefreshKey(
      "project-1",
      assets,
      1,
    );

    expect(afterPersistence).not.toBe(beforePersistence);
    expect(
      geoLocalArchiveAssetRefreshKey(
        "project-1",
        [{ ...assets[0], previewUrl: "/api/geo/fallback/logo-v2" }],
        1,
      ),
    ).toBe(afterPersistence);
  });

  it("paginates the full material library without piling assets into a branch", () => {
    const assets = Array.from({ length: 25 }, (_, index) => ({
      id: `asset-${index + 1}`,
      name: `asset-${index + 1}.webp`,
    }));

    expect(paginateGeoKnowledgeAssets(assets, 0)).toMatchObject({
      page: 0,
      pageCount: 3,
    });
    expect(paginateGeoKnowledgeAssets(assets, 0).items).toHaveLength(12);
    expect(paginateGeoKnowledgeAssets(assets, 99)).toMatchObject({
      page: 2,
      pageCount: 3,
      items: [assets[24]],
    });
  });

  it("accepts only relative raster entry paths", () => {
    expect(safeGeoArchiveAssetPath("03_products/images/product.webp")).toBe(
      "03_products/images/product.webp",
    );
    expect(safeGeoArchiveAssetPath("../secret.png")).toBeUndefined();
    expect(safeGeoArchiveAssetPath("/absolute.png")).toBeUndefined();
    expect(safeGeoArchiveAssetPath("03_products\\image.png")).toBeUndefined();
    expect(safeGeoArchiveAssetPath("09_media_assets/logo.svg")).toBeUndefined();
  });

  it("extracts signature-matched images and rejects disguised files", async () => {
    const zip = new JSZip();
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
    ]);
    zip.file("03_products/images/real.png", pngBytes);
    zip.file("03_products/images/disguised.jpg", pngBytes);
    zip.file("03_products/images/vector.svg", "<svg />");
    const archive = await zip.generateAsync({ type: "blob" });

    const blobs = await extractLocalGeoAssetBlobs(archive, [
      {
        id: "real",
        name: "real.png",
        archivePath: "03_products/images/real.png",
      },
      {
        id: "disguised",
        name: "disguised.jpg",
        archivePath: "03_products/images/disguised.jpg",
      },
      {
        id: "vector",
        name: "vector.svg",
        archivePath: "03_products/images/vector.svg",
      },
    ]);

    expect(Array.from(blobs.keys())).toEqual(["real"]);
    expect(blobs.get("real")).toMatchObject({
      size: pngBytes.byteLength,
      type: "image/png",
    });
  });

  it("deduplicates ZIP paths and obeys the local preview budget", async () => {
    const zip = new JSZip();
    const gifBytes = new TextEncoder().encode("GIF89a-preview");
    zip.file("09_media_assets/one.gif", gifBytes);
    zip.file("09_media_assets/two.gif", gifBytes);
    const archive = await zip.generateAsync({ type: "blob" });

    const blobs = await extractLocalGeoAssetBlobs(
      archive,
      [
        {
          id: "one",
          name: "one.gif",
          archivePath: "09_media_assets/one.gif",
        },
        {
          id: "duplicate",
          name: "one-copy.gif",
          archivePath: "09_media_assets/one.gif",
        },
        {
          id: "two",
          name: "two.gif",
          archivePath: "09_media_assets/two.gif",
        },
      ],
      { maxAssets: 1 },
    );

    expect(Array.from(blobs.keys())).toEqual(["one"]);
  });

  it("resolves a validated relative image beneath one archive root", async () => {
    const zip = new JSZip();
    const gifBytes = new TextEncoder().encode("GIF89a-preview");
    zip.file("示例企业_knowledge_base/09_media_assets/rooted.gif", gifBytes);
    const archive = await zip.generateAsync({ type: "blob" });

    const blobs = await extractLocalGeoAssetBlobs(archive, [
      {
        id: "rooted",
        name: "rooted.gif",
        archivePath: "09_media_assets/rooted.gif",
      },
    ]);

    expect(blobs.get("rooted")?.type).toBe("image/gif");
  });
});
