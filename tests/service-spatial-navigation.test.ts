import { describe, expect, it } from "vitest";
import {
  scoreSpatialCandidate,
  type SpatialRectangle
} from "../src/main/spatial-navigation";
import { serviceSpatialNavigationScript } from "../src/main/service-host";

function rect(left: number, top: number, width = 220, height = 124): SpatialRectangle {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width
  };
}

describe("service spatial navigation", () => {
  it("confines Netflix detail navigation to the visible modal and prioritizes Play", () => {
    const script = serviceSpatialNavigationScript("down");

    expect(script).toContain("visibleModalRoots");
    expect(script).toContain("modalRoot.contains(element)");
    expect(script).toContain("element !== modalRoot");
    expect(script).toContain("candidates = modalCandidates");
    expect(script).toContain("primaryModalTargets");
    expect(script).toContain("primaryModalTargets.includes(current)");
    expect(script).toContain("play|resume|watch now|continue watching");
    expect(script).toContain("location.hostname === 'www.netflix.com'");
    expect(script).toContain("element.contains(descendant)");
    expect(script).toContain("descendantPriority > priority");
    expect(script).toContain("modalArea * 0.55");
  });

  it("keeps horizontal movement in the current visual row", () => {
    const current = rect(320, 200);
    const sameRow = rect(560, 205);
    const diagonalNextRow = rect(440, 360);

    expect(scoreSpatialCandidate("right", current, sameRow)).toBeLessThan(
      scoreSpatialCandidate("right", current, diagonalNextRow)
    );
    expect(scoreSpatialCandidate("right", current, diagonalNextRow)).toBe(Number.POSITIVE_INFINITY);
  });

  it("prefers an aligned next-row card over a closer sidebar control", () => {
    const current = rect(360, 180);
    const alignedCard = rect(360, 340);
    const sidebar = rect(40, 250, 160, 48);

    expect(scoreSpatialCandidate("down", current, alignedCard)).toBeLessThan(
      scoreSpatialCandidate("down", current, sidebar)
    );
  });

  it("rejects candidates behind the requested direction", () => {
    expect(scoreSpatialCandidate("left", rect(300, 100), rect(560, 100))).toBe(
      Number.POSITIVE_INFINITY
    );
  });
});
