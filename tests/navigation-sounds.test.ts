import { describe, expect, it } from "vitest";
import { soundEnabledFromPreference } from "../src/renderer/navigation-sounds";

describe("navigation sound preference", () => {
  it("defaults to enabled and recognizes only the stored opt-out", () => {
    expect(soundEnabledFromPreference(null)).toBe(true);
    expect(soundEnabledFromPreference("on")).toBe(true);
    expect(soundEnabledFromPreference("off")).toBe(false);
  });
});
