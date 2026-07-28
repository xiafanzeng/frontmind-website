import { describe, expect, it } from "vitest";
import { moveGeoWorkbenchGeometry } from "./workbench-geometry";

describe("moveGeoWorkbenchGeometry", () => {
  const viewport = { width: 1440, height: 900 };
  const geometry = { x: 120, y: 80, width: 900, height: 680 };

  it("moves by a keyboard step and uses Shift for a larger step", () => {
    expect(
      moveGeoWorkbenchGeometry(geometry, "ArrowRight", false, viewport).x,
    ).toBe(136);
    expect(
      moveGeoWorkbenchGeometry(geometry, "ArrowDown", true, viewport).y,
    ).toBe(128);
  });

  it("keeps the titlebar within the reachable viewport bounds", () => {
    expect(
      moveGeoWorkbenchGeometry(
        { ...geometry, x: 8, y: 8 },
        "ArrowLeft",
        true,
        viewport,
      ),
    ).toMatchObject({ x: 8, y: 8 });
    expect(
      moveGeoWorkbenchGeometry(
        { ...geometry, x: 532, y: 828 },
        "ArrowRight",
        true,
        viewport,
      ),
    ).toMatchObject({ x: 532, y: 828 });
  });
});
