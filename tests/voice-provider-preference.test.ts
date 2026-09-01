import { describe, expect, it } from "vitest";
import {
  chooseVoiceProviderPreference,
  prioritizeVoiceProvider
} from "../src/main/voice/voice-provider-preference";

describe("voice provider preference", () => {
  it("uses the highest-ranked offered favorite", () => {
    expect(chooseVoiceProviderPreference(
      ["netflix", "disney-plus"],
      ["netflix", "disney-plus"],
      ["disney-plus", "netflix"],
      "netflix"
    )).toEqual({
      detail: "I used your highest-ranked favorite app.",
      serviceId: "disney-plus"
    });
  });

  it("uses the already-open app only when no offered favorite exists", () => {
    expect(chooseVoiceProviderPreference(
      ["netflix", "disney-plus"],
      ["spotify"],
      ["spotify", "netflix", "disney-plus"],
      "netflix"
    )).toEqual({
      detail: "I used the app that was already open.",
      serviceId: "netflix"
    });
  });

  it("keeps an explicit choice when there is no strong preference", () => {
    expect(chooseVoiceProviderPreference(
      ["netflix", "disney-plus"],
      [],
      ["netflix", "disney-plus"],
      null
    )).toBeNull();
  });

  it("moves only the trusted preferred provider to the front", () => {
    expect(prioritizeVoiceProvider(["netflix", "disney-plus"], "disney-plus"))
      .toEqual(["disney-plus", "netflix"]);
    expect(prioritizeVoiceProvider(["netflix"], "youtube")).toEqual(["netflix"]);
  });
});
