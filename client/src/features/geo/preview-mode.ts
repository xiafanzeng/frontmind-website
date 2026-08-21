import type { GeoProject } from "./types";

export const GEO_STYLE_PREVIEW_ID = "geo-style-preview";
export const GEO_STYLE_PREVIEW_PARAM = "geo-preview";

export type GeoStylePreviewMode =
  | "assessment"
  | "monitoring"
  | "monitoring-setup";

export function geoStylePreviewMode(): GeoStylePreviewMode | undefined {
  if (!import.meta.env.DEV || typeof window === "undefined") return undefined;
  const value = new URLSearchParams(window.location.search).get(
    GEO_STYLE_PREVIEW_PARAM,
  );
  return ["assessment", "monitoring", "monitoring-setup"].includes(value || "")
    ? (value as GeoStylePreviewMode)
    : undefined;
}

export function isGeoStylePreviewEnabled(): boolean {
  return Boolean(geoStylePreviewMode());
}

export function isGeoStylePreviewProject(
  project?: Pick<GeoProject, "id" | "preview">,
): boolean {
  return Boolean(project?.preview && project.id === GEO_STYLE_PREVIEW_ID);
}
