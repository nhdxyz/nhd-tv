export type SpatialDirection = "down" | "left" | "right" | "up";

export interface SpatialRectangle {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
}

/**
 * Scores an on-screen candidate while strongly preferring the current visual
 * row/column. Kept dependency-free so the same function can run in a service
 * page and in unit tests.
 */
export function scoreSpatialCandidate(
  direction: SpatialDirection,
  current: SpatialRectangle,
  candidate: SpatialRectangle
): number {
  const currentX = current.left + current.width / 2;
  const currentY = current.top + current.height / 2;
  const candidateX = candidate.left + candidate.width / 2;
  const candidateY = candidate.top + candidate.height / 2;
  const deltaX = candidateX - currentX;
  const deltaY = candidateY - currentY;
  const horizontal = direction === "left" || direction === "right";
  const directional =
    (direction === "left" && deltaX < -8) ||
    (direction === "right" && deltaX > 8) ||
    (direction === "up" && deltaY < -8) ||
    (direction === "down" && deltaY > 8);

  if (!directional) {
    return Number.POSITIVE_INFINITY;
  }

  const primary = horizontal ? Math.abs(deltaX) : Math.abs(deltaY);
  const cross = horizontal ? Math.abs(deltaY) : Math.abs(deltaX);

  if (horizontal) {
    const overlap = Math.min(current.bottom, candidate.bottom) - Math.max(current.top, candidate.top);
    const requiredOverlap = Math.min(current.height, candidate.height) * 0.3;
    return overlap >= requiredOverlap
      ? primary * 3 + cross
      : Number.POSITIVE_INFINITY;
  }

  const overlap = Math.min(current.right, candidate.right) - Math.max(current.left, candidate.left);
  const aligned =
    overlap >= Math.min(current.width, candidate.width) * 0.15 ||
    cross <= Math.max(current.width, candidate.width) * 0.6;

  return primary * 3 + cross * 1.4 + (aligned ? 0 : 2_000);
}
