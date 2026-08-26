import { describe, expect, it } from "vitest";
import {
  findDirectionalTarget,
  type SpatialRect
} from "../src/renderer/spatial-navigation";

function rect(left: number, top: number, width = 100, height = 60): SpatialRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width
  };
}

describe("spatial navigation", () => {
  it("moves horizontally within a service rail", () => {
    const rects = [rect(0, 100), rect(130, 100), rect(260, 100)];

    expect(findDirectionalTarget(1, rects, "left")).toBe(0);
    expect(findDirectionalTarget(1, rects, "right")).toBe(2);
  });

  it("prefers the closest aligned target on another row", () => {
    const rects = [rect(130, 0), rect(0, 120), rect(130, 120), rect(260, 120)];

    expect(findDirectionalTarget(0, rects, "down")).toBe(2);
  });

  it("ignores minor same-row alignment differences", () => {
    const rects = [rect(130, 0), rect(300, 4), rect(130, 120)];

    expect(findDirectionalTarget(0, rects, "down")).toBe(2);
  });

  it("prefers the next row over a farther aligned row", () => {
    const rects = [rect(500, 0), rect(0, 400), rect(500, 800)];

    expect(findDirectionalTarget(0, rects, "down")).toBe(1);
  });

  it("returns null at a directional edge", () => {
    const rects = [rect(0, 0), rect(130, 0)];

    expect(findDirectionalTarget(0, rects, "left")).toBeNull();
  });
});
