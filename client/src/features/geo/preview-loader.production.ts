export function loadGeoStylePreview(): Promise<never> {
  return Promise.reject(new Error("Development preview is unavailable."));
}
