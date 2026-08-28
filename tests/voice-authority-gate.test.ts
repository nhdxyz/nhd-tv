import { describe, expect, it } from "vitest";
import { VoiceAuthorityGate } from "../src/main/remote/voice-authority-gate";

describe("voice authority gate", () => {
  it("stays closed until the exact active suspension resumes it", () => {
    const gate = new VoiceAuthorityGate();
    const first = gate.suspend();
    const second = gate.suspend();

    expect(gate.suspended).toBe(true);
    expect(gate.resume(first)).toBe(false);
    expect(gate.suspended).toBe(true);
    expect(gate.resume(second)).toBe(true);
    expect(gate.suspended).toBe(false);
  });

  it("resets without making an old token authoritative", () => {
    const gate = new VoiceAuthorityGate();
    const old = gate.suspend();
    gate.reset();

    expect(gate.suspended).toBe(false);
    expect(gate.resume(old)).toBe(false);
  });
});
