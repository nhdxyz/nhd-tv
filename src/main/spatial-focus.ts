export interface SpatialCandidateDescriptor {
  hasHref: boolean;
  role: string | null;
  tabIndex: number;
  tagName: string;
}

export function spatialCandidatePriority(candidate: SpatialCandidateDescriptor): number {
  const tagName = candidate.tagName.toUpperCase();
  if (["BUTTON", "INPUT", "SELECT", "SUMMARY", "TEXTAREA"].includes(tagName)) return 4;
  if (tagName === "A" && candidate.hasHref) return 4;
  if (candidate.role === "button" || candidate.role === "link") return 3;
  if (candidate.tabIndex >= 0) return 2;
  return 0;
}
