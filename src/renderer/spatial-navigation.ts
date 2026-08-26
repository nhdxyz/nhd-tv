export type SpatialDirection = "down" | "left" | "right" | "up";

export interface SpatialRect {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

const DIRECTIONAL_EPSILON = 8;

function center(rect: SpatialRect): { x: number; y: number } {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
}

export function findDirectionalTarget(
  currentIndex: number,
  rects: readonly SpatialRect[],
  direction: SpatialDirection,
  groups?: readonly (string | null)[]
): number | null {
  const current = rects[currentIndex];

  if (current === undefined) {
    return null;
  }

  const currentCenter = center(current);
  let bestIndex: number | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  rects.forEach((candidate, index) => {
    if (index === currentIndex) {
      return;
    }

    const currentGroup = groups?.[currentIndex];
    const isHorizontal = direction === "left" || direction === "right";

    if (isHorizontal && currentGroup != null && groups?.[index] !== currentGroup) {
      return;
    }

    const candidateCenter = center(candidate);
    const deltaX = candidateCenter.x - currentCenter.x;
    const deltaY = candidateCenter.y - currentCenter.y;
    // Center deltas alone make a taller card look "below" a shorter card in
    // the same visual row. Require directional edge separation so uneven
    // copy, badges, and focus scaling cannot pull navigation sideways.
    const isCandidate =
      (direction === "left" && candidate.right <= current.left + DIRECTIONAL_EPSILON) ||
      (direction === "right" && candidate.left >= current.right - DIRECTIONAL_EPSILON) ||
      (direction === "up" && candidate.bottom <= current.top + DIRECTIONAL_EPSILON) ||
      (direction === "down" && candidate.top >= current.bottom - DIRECTIONAL_EPSILON);

    if (!isCandidate) {
      return;
    }

    const primaryDistance = direction === "left" || direction === "right"
      ? Math.abs(deltaX)
      : Math.abs(deltaY);
    const crossAxisDistance = direction === "left" || direction === "right"
      ? Math.abs(deltaY)
      : Math.abs(deltaX);
    const score = primaryDistance * 3 + crossAxisDistance;

    if (score < bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });

  return bestIndex;
}
