import { describe, expect, it } from "vitest";
import { spatialCandidatePriority } from "../src/main/spatial-focus";

describe("spatial focus targets", () => {
  it("prefers actual controls over generic role and tabindex wrappers", () => {
    expect(spatialCandidatePriority({
      hasHref: false,
      role: null,
      tabIndex: 0,
      tagName: "div"
    })).toBe(2);
    expect(spatialCandidatePriority({
      hasHref: false,
      role: "button",
      tabIndex: 0,
      tagName: "div"
    })).toBe(3);
    expect(spatialCandidatePriority({
      hasHref: false,
      role: null,
      tabIndex: 0,
      tagName: "button"
    })).toBe(4);
    expect(spatialCandidatePriority({
      hasHref: true,
      role: null,
      tabIndex: 0,
      tagName: "a"
    })).toBe(4);
    expect(spatialCandidatePriority({
      hasHref: false,
      role: "searchbox",
      tabIndex: 0,
      tagName: "input"
    })).toBe(4);
  });
});
