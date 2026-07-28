export type GeoWorkbenchGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GeoWorkbenchMoveKey =
  | "ArrowLeft"
  | "ArrowRight"
  | "ArrowUp"
  | "ArrowDown";

export function isGeoWorkbenchMoveKey(key: string): key is GeoWorkbenchMoveKey {
  return ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key);
}

export function moveGeoWorkbenchGeometry(
  current: GeoWorkbenchGeometry,
  key: GeoWorkbenchMoveKey,
  largeStep: boolean,
  viewport: { width: number; height: number },
): GeoWorkbenchGeometry {
  const step = largeStep ? 48 : 16;
  const deltaX = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
  const deltaY = key === "ArrowUp" ? -step : key === "ArrowDown" ? step : 0;
  const maxX = Math.max(8, viewport.width - current.width - 8);
  const maxY = Math.max(8, viewport.height - 72);

  return {
    ...current,
    x: Math.max(8, Math.min(current.x + deltaX, maxX)),
    y: Math.max(8, Math.min(current.y + deltaY, maxY)),
  };
}
