export interface SpatialCandidateDescriptor {
  hasHref: boolean;
  role: string | null;
  tabIndex: number;
  tagName: string;
}

export const NETFLIX_SPATIAL_TARGET_SELECTORS = [
  '[data-uia="play-button"]',
  '[data-uia="add-to-my-list"]',
  '[data-uia*="thumbs-up"]',
  '[data-uia*="thumbs-down"]',
  '[data-uia*="episode-item"]',
  '[data-uia*="season-selector"]',
  '.episodeSelector .episode',
  '[class*="episodeSelector"] [class*="episode"]',
  '[class*="episode-item"]'
] as const;

export function spatialCandidatePriority(candidate: SpatialCandidateDescriptor): number {
  const tagName = candidate.tagName.toUpperCase();
  if (["BUTTON", "INPUT", "SELECT", "SUMMARY", "TEXTAREA"].includes(tagName)) return 4;
  if (tagName === "A" && candidate.hasHref) return 4;
  if (candidate.role === "button" || candidate.role === "link") return 3;
  if (candidate.tabIndex >= 0) return 2;
  return 0;
}
