import { describe, expect, it } from "vitest";
import {
  soundEnabledFromPreference,
  voiceSoundCue
} from "../src/renderer/navigation-sounds";

describe("navigation sound preference", () => {
  it("defaults to enabled and recognizes only the stored opt-out", () => {
    expect(soundEnabledFromPreference(null)).toBe(true);
    expect(soundEnabledFromPreference("on")).toBe(true);
    expect(soundEnabledFromPreference("off")).toBe(false);
  });

  it("emits restrained voice cues only when a meaningful phase changes", () => {
    expect(voiceSoundCue("hidden", "listening")).toBe("listening");
    expect(voiceSoundCue("understanding", "clarification")).toBe("attention");
    expect(voiceSoundCue("understanding", "confirmation")).toBe("attention");
    expect(voiceSoundCue("understanding", "error")).toBe("attention");
    expect(voiceSoundCue("understanding", "success")).toBe("success");
    expect(voiceSoundCue("success", "success")).toBeNull();
    expect(voiceSoundCue("listening", "understanding")).toBeNull();
  });
});
