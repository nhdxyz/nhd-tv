import { describe, expect, it } from "vitest";
import type { ContinueWatchingItem } from "../src/main/contracts";
import {
  normalizeMediaLabel,
  presentContinueWatching
} from "../src/renderer/content-presentation";

function item(overrides: Partial<ContinueWatchingItem>): ContinueWatchingItem {
  return {
    artworkDataUrl: null,
    durationSeconds: 2_400,
    id: "item",
    positionSeconds: 600,
    serviceId: "netflix",
    serviceName: "Netflix",
    subtitle: "S1 E2 · The Train",
    title: "Example Show",
    updatedAt: 1,
    ...overrides
  };
}

describe("media presentation copy", () => {
  it("separates episode tokens accidentally joined to Netflix labels", () => {
    expect(normalizeMediaLabel("Anne with an EE1Your Will Shall Decide Your Destiny"))
      .toBe("Anne with an E · E1 · Your Will Shall Decide Your Destiny");
    expect(normalizeMediaLabel("HomelandE10Representative Brody"))
      .toBe("Homeland · E10 · Representative Brody");
    expect(normalizeMediaLabel("Breaking BadS1E3...And the Bag's in the River"))
      .toBe("Breaking Bad · S1E3 · ...And the Bag's in the River");
  });

  it("collapses duplicated adjacent phrases", () => {
    expect(normalizeMediaLabel("Cody & Ko Cody & Ko")).toBe("Cody & Ko");
  });

  it("suppresses a subtitle that merely repeats the title", () => {
    expect(presentContinueWatching(item({ subtitle: "Cody & Ko Cody & Ko", title: "Cody & Ko" })))
      .toEqual({ subtitle: null, title: "Cody & Ko" });
  });

  it("falls back to the service name when the captured title is blank", () => {
    expect(presentContinueWatching(item({ title: "   " })))
      .toEqual({ subtitle: "S1 E2 · The Train", title: "Netflix" });
  });
});
