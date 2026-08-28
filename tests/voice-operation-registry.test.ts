import { describe, expect, it } from "vitest";
import {
  VoiceOperationCancelledError,
  VoiceOperationRegistry
} from "../src/main/remote/voice-operation-registry";

function beginCommand(registry: VoiceOperationRegistry, operationId = "voice-command-a-1234") {
  const operation = registry.begin({
    commandId: "voice-command-a-1234",
    confirmationId: null,
    controllerId: "phone-a",
    kind: "command",
    operationId
  });
  if (operation === null) throw new Error("operation was not reserved");
  return operation;
}

describe("voice operation registry", () => {
  it("only lets the owning phone cancel the exact active execution", async () => {
    const registry = new VoiceOperationRegistry();
    const operation = beginCommand(registry);

    expect(registry.cancel("phone-b", operation.operationId)).toMatchObject({
      operation: null,
      state: "not-owner"
    });
    expect(operation.controller.signal.aborted).toBe(false);
    expect(registry.cancel("phone-a", "voice-command-stale-9")).toMatchObject({
      operation: null,
      state: "not-active"
    });

    const cancellation = registry.cancel("phone-a", operation.operationId);
    expect(cancellation.state).toBe("accepted");
    expect(operation.controller.signal.aborted).toBe(true);
    expect(operation.controller.signal.reason).toBeInstanceOf(VoiceOperationCancelledError);
    expect(registry.finish(operation)).toBe(true);
    await expect(operation.finished).resolves.toBeUndefined();
  });

  it("makes duplicate cancellation idempotent without targeting a later operation", () => {
    const registry = new VoiceOperationRegistry();
    const first = beginCommand(registry);
    registry.cancel("phone-a", first.operationId);
    registry.finish(first);

    expect(registry.cancel("phone-a", first.operationId)).toEqual({
      operation: null,
      state: "already-cancelled"
    });
    const next = beginCommand(registry, "voice-command-next-5678");
    expect(registry.cancel("phone-a", first.operationId)).toEqual({
      operation: null,
      state: "not-active"
    });
    expect(next.controller.signal.aborted).toBe(false);
  });

  it("ignores late cleanup from an older operation", () => {
    const registry = new VoiceOperationRegistry();
    const first = beginCommand(registry);
    registry.finish(first);
    const next = beginCommand(registry, "voice-command-next-5678");

    expect(registry.finish(first)).toBe(false);
    expect(registry.active).toBe(next);
    expect(registry.busy).toBe(true);
  });

  it("tombstones an owner-authorized cancellation before operation registration", () => {
    const registry = new VoiceOperationRegistry();

    expect(registry.cancel("phone-a", "voice-command-pending-1")).toEqual({
      operation: null,
      state: "not-active"
    });
    expect(registry.cancel("phone-a", "voice-command-pending-1", {
      acceptPending: true
    })).toEqual({
      operation: null,
      state: "accepted-pending"
    });
    expect(registry.cancel("phone-a", "voice-command-pending-1")).toEqual({
      operation: null,
      state: "already-cancelled"
    });
    expect(registry.isCancelled("phone-a", "voice-command-pending-1")).toBe(true);
    expect(registry.begin({
      commandId: "voice-command-pending-1",
      confirmationId: null,
      controllerId: "phone-a",
      kind: "command",
      operationId: "voice-command-pending-1"
    })).toBeNull();

    const otherOwner = registry.begin({
      commandId: "voice-command-pending-1",
      confirmationId: null,
      controllerId: "phone-b",
      kind: "command",
      operationId: "voice-command-pending-1"
    });
    expect(otherOwner).not.toBeNull();
    if (otherOwner === null) throw new Error("other owner operation was not reserved");
    expect(registry.finish(otherOwner)).toBe(true);

    const futureCommand = beginCommand(registry, "voice-command-future-9");
    expect(futureCommand.controller.signal.aborted).toBe(false);
  });

  it("expires and bounds pre-registration cancellation tombstones", () => {
    let now = 1_000;
    const registry = new VoiceOperationRegistry({
      cancellationTombstoneMs: 500,
      maximumCancellationTombstones: 2,
      now: () => now
    });
    for (const operationId of [
      "voice-command-pending-1",
      "voice-command-pending-2",
      "voice-command-pending-3"
    ]) {
      expect(registry.cancel("phone-a", operationId, { acceptPending: true }).state)
        .toBe("accepted-pending");
    }

    expect(registry.isCancelled("phone-a", "voice-command-pending-1")).toBe(false);
    expect(registry.isCancelled("phone-a", "voice-command-pending-2")).toBe(true);
    now += 501;
    expect(registry.isCancelled("phone-a", "voice-command-pending-2")).toBe(false);
    expect(beginCommand(registry, "voice-command-pending-2")).not.toBeNull();
  });
});
