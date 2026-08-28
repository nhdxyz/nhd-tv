import { describe, expect, it } from "vitest";
import { VoiceActivityLease } from "../src/main/remote/voice-activity-lease";

const COMMAND_A = "voice-command-a-1234";
const COMMAND_B = "voice-command-b-5678";

describe("voice activity lease", () => {
  it("keeps activity phases monotonic and tombstones a cancelled gesture", () => {
    const lease = new VoiceActivityLease();
    expect(lease.acceptActivity("phone-a", {
      commandId: COMMAND_A,
      phase: "understanding"
    })).toBe("accepted");
    expect(lease.acceptActivity("phone-a", {
      commandId: COMMAND_A,
      phase: "listening"
    })).toBe("ignored");
    expect(lease.acceptActivity("phone-a", {
      commandId: COMMAND_A,
      phase: "cancelled"
    })).toBe("accepted");
    expect(lease.acceptActivity("phone-a", {
      commandId: COMMAND_A,
      phase: "listening"
    })).toBe("ignored");
  });

  it("lets the first phone own a gesture and rejects late events from a competitor", () => {
    const lease = new VoiceActivityLease();
    expect(lease.acceptActivity("phone-a", {
      commandId: COMMAND_A,
      phase: "listening"
    })).toBe("accepted");
    expect(lease.acceptActivity("phone-b", {
      commandId: COMMAND_B,
      phase: "listening"
    })).toBe("busy");
    expect(lease.acceptActivity("phone-b", {
      commandId: COMMAND_B,
      phase: "cancelled"
    })).toBe("ignored");

    expect(lease.beginUpload("phone-a", COMMAND_A)).toBe(true);
    expect(lease.acceptActivity("phone-a", {
      commandId: COMMAND_A,
      phase: "cancelled"
    })).toBe("ignored");
    lease.finishUpload("phone-a", COMMAND_A);

    const nextCommand = "voice-command-b-next-9";
    expect(lease.acceptActivity("phone-b", {
      commandId: nextCommand,
      phase: "listening"
    })).toBe("accepted");
    expect(lease.acceptActivity("phone-a", {
      commandId: COMMAND_A,
      phase: "cancelled"
    })).toBe("ignored");
  });

  it("requires the upload to match the active controller and command", () => {
    const lease = new VoiceActivityLease();
    lease.acceptActivity("phone-a", { commandId: COMMAND_A, phase: "listening" });
    expect(lease.beginUpload("phone-b", COMMAND_A)).toBe(false);
    expect(lease.beginUpload("phone-a", COMMAND_B)).toBe(false);
    expect(lease.beginUpload("phone-a", COMMAND_A)).toBe(true);
    expect(lease.beginUpload("phone-a", COMMAND_A)).toBe(false);
  });

  it("expires abandoned ownership without allowing its old events to revive", () => {
    let now = 1_000;
    const lease = new VoiceActivityLease({
      leaseMs: 500,
      now: () => now,
      tombstoneMs: 2_000
    });
    lease.acceptActivity("phone-a", { commandId: COMMAND_A, phase: "listening" });
    now += 501;
    expect(lease.acceptActivity("phone-b", {
      commandId: COMMAND_B,
      phase: "listening"
    })).toBe("accepted");
    expect(lease.acceptActivity("phone-a", {
      commandId: COMMAND_A,
      phase: "understanding"
    })).toBe("ignored");
  });

  it("releases ownership when its controller disconnects", () => {
    const lease = new VoiceActivityLease();
    lease.acceptActivity("phone-a", { commandId: COMMAND_A, phase: "listening" });
    expect(lease.releaseController("phone-b")).toBe(false);
    expect(lease.releaseController("phone-a")).toBe(true);
    expect(lease.acceptActivity("phone-b", {
      commandId: COMMAND_B,
      phase: "listening"
    })).toBe("accepted");
  });
});
