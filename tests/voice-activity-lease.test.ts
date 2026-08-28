import { describe, expect, it } from "vitest";
import { VoiceActivityLease } from "../src/main/remote/voice-activity-lease";

const COMMAND_A = "voice-command-a-1234";
const COMMAND_B = "voice-command-b-5678";

describe("voice activity lease", () => {
  it("ignores a cancellation for a command it has never observed", () => {
    const lease = new VoiceActivityLease();

    expect(lease.acceptActivity("phone-a", {
      commandId: COMMAND_A,
      phase: "cancelled"
    })).toBe("ignored");
    expect(lease.acceptActivity("phone-b", {
      commandId: COMMAND_B,
      phase: "listening"
    })).toBe("accepted");
  });

  it("keeps activity phases monotonic and tombstones a cancelled gesture", () => {
    const lease = new VoiceActivityLease();
    expect(lease.acceptActivity("phone-a", {
      commandId: COMMAND_A,
      phase: "reserved"
    })).toBe("accepted");
    expect(lease.acceptActivity("phone-a", {
      commandId: COMMAND_A,
      phase: "listening"
    })).toBe("accepted");
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
    expect(lease.busy).toBe(false);
    expect(lease.acceptActivity("phone-a", {
      commandId: COMMAND_A,
      phase: "listening"
    })).toBe("accepted");
    expect(lease.busy).toBe(true);
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
    expect(lease.busy).toBe(false);

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

  it("expires an abandoned default listening lease shortly after a maximum recording", () => {
    let now = 1_000;
    const lease = new VoiceActivityLease({ now: () => now });
    lease.acceptActivity("phone-a", { commandId: COMMAND_A, phase: "listening" });

    now += 25_001;
    expect(lease.acceptActivity("phone-b", {
      commandId: COMMAND_B,
      phase: "listening"
    })).toBe("accepted");
  });

  it("expires an abandoned reservation before microphone permission can stall the TV", () => {
    let now = 1_000;
    const lease = new VoiceActivityLease({ now: () => now });
    expect(lease.acceptActivity("phone-a", {
      commandId: COMMAND_A,
      phase: "reserved"
    })).toBe("accepted");

    now += 5_001;
    expect(lease.acceptActivity("phone-b", {
      commandId: COMMAND_B,
      phase: "reserved"
    })).toBe("accepted");
    expect(lease.acceptActivity("phone-a", {
      commandId: COMMAND_A,
      phase: "listening"
    })).toBe("ignored");
  });

  it("releases ownership when its controller disconnects", () => {
    const lease = new VoiceActivityLease();
    lease.acceptActivity("phone-a", { commandId: COMMAND_A, phase: "listening" });
    expect(lease.releaseController("phone-b")).toBe(false);
    expect(lease.releaseControllerCommand("phone-a")).toBe(COMMAND_A);
    expect(lease.acceptActivity("phone-b", {
      commandId: COMMAND_B,
      phase: "listening"
    })).toBe("accepted");
  });

  it("keeps a locked operation owned after its ordinary lease duration", () => {
    let now = 1_000;
    const lease = new VoiceActivityLease({ leaseMs: 500, now: () => now });

    expect(lease.beginUpload("phone-a", COMMAND_A)).toBe(true);
    now += 501;
    expect(lease.acceptActivity("phone-b", {
      commandId: COMMAND_B,
      phase: "listening"
    })).toBe("busy");

    lease.finishUpload("phone-a", COMMAND_A);
    expect(lease.acceptActivity("phone-b", {
      commandId: "voice-command-b-next-9",
      phase: "listening"
    })).toBe("accepted");
  });

  it("keeps a locked operation owned when its controller disconnects", () => {
    const lease = new VoiceActivityLease();

    expect(lease.beginUpload("phone-a", COMMAND_A)).toBe(true);
    lease.releaseController("phone-a");
    expect(lease.acceptActivity("phone-b", {
      commandId: COMMAND_B,
      phase: "listening"
    })).toBe("busy");

    lease.finishUpload("phone-a", COMMAND_A);
    expect(lease.acceptActivity("phone-b", {
      commandId: "voice-command-b-next-9",
      phase: "listening"
    })).toBe("accepted");
  });

  it("rebinds a completed command as a new locked operation", () => {
    const lease = new VoiceActivityLease();

    expect(lease.beginUpload("phone-a", COMMAND_A)).toBe(true);
    expect(lease.beginBoundOperation("phone-a", COMMAND_A)).toBe(false);
    lease.finishUpload("phone-a", COMMAND_A);

    expect(lease.beginBoundOperation("phone-a", COMMAND_A)).toBe(true);
    expect(lease.acceptActivity("phone-a", {
      commandId: COMMAND_A,
      phase: "cancelled"
    })).toBe("ignored");
    expect(lease.acceptActivity("phone-b", {
      commandId: COMMAND_B,
      phase: "listening"
    })).toBe("busy");
  });
});
