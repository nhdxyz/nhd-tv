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

  it("keeps horizontal movement inside the current navigation group", () => {
    const rects = [
      rect(0, 0),
      rect(0, 120),
      rect(130, 120),
      rect(145, 200)
    ];
    const groups = ["hero", "lineup", "lineup", "continue"];

    expect(findDirectionalTarget(1, rects, "right", groups)).toBe(2);
    expect(findDirectionalTarget(2, rects, "right", groups)).toBeNull();
  });

  it("allows vertical movement across navigation groups", () => {
    const rects = [rect(130, 0), rect(130, 120)];
    const groups = ["hero", "lineup"];

    expect(findDirectionalTarget(0, rects, "down", groups)).toBe(1);
  });

  it("prefers the closest aligned target on another row", () => {
    const rects = [rect(130, 0), rect(0, 120), rect(130, 120), rect(260, 120)];

    expect(findDirectionalTarget(0, rects, "down")).toBe(2);
  });

  it("ignores minor same-row alignment differences", () => {
    const rects = [rect(130, 0), rect(300, 4), rect(130, 120)];

    expect(findDirectionalTarget(0, rects, "down")).toBe(2);
  });

  it("does not treat a taller overlapping card as the next vertical row", () => {
    const rects = [
      rect(0, 100, 260, 220),
      rect(280, 100, 260, 260),
      rect(0, 390, 260, 220)
    ];

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
