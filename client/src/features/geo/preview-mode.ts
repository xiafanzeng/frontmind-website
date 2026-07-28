import type { GeoProject } from "./types";

export const GEO_STYLE_PREVIEW_ID = "geo-style-preview";
export const GEO_STYLE_PREVIEW_PARAM = "geo-preview";

export function isGeoStylePreviewEnabled(): boolean {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  return (
    new URLSearchParams(window.location.search).get(GEO_STYLE_PREVIEW_PARAM) ===
    "assessment"
  );
}

export function isGeoStylePreviewProject(
  project?: Pick<GeoProject, "id" | "preview">,
): boolean {
  return Boolean(project?.preview && project.id === GEO_STYLE_PREVIEW_ID);
}
