import { describe, expect, it, vi } from "vitest";
import { ServiceOperationOwner } from "../src/main/service-operation-owner";

describe("service operation ownership", () => {
  it("supersedes operation A when operation B begins", () => {
    const owner = new ServiceOperationOwner();
    const operationA = owner.begin();

    expect(owner.owns(operationA)).toBe(true);
    expect(() => owner.throwIfSuperseded(operationA)).not.toThrow();

    const operationB = owner.begin();

    expect(owner.owns(operationA)).toBe(false);
    expect(owner.owns(operationB)).toBe(true);
    expect(() => owner.throwIfSuperseded(operationA)).toThrow(
      "Service operation was superseded"
    );
    expect(() => owner.throwIfSuperseded(operationB)).not.toThrow();
  });

  it("prevents stale publication and cleanup while allowing the current owner", () => {
    const owner = new ServiceOperationOwner();
    const operationA = owner.begin();
    const operationB = owner.begin();
    const stalePublication = vi.fn();
    const staleCleanup = vi.fn();
    const currentPublication = vi.fn();
    const currentCleanup = vi.fn();

    expect(owner.runIfOwned(operationA, stalePublication)).toBe(false);
    expect(owner.runIfOwned(operationA, staleCleanup)).toBe(false);
    expect(stalePublication).not.toHaveBeenCalled();
    expect(staleCleanup).not.toHaveBeenCalled();

    expect(owner.runIfOwned(operationB, currentPublication)).toBe(true);
    expect(owner.runIfOwned(operationB, currentCleanup)).toBe(true);
    expect(currentPublication).toHaveBeenCalledOnce();
    expect(currentCleanup).toHaveBeenCalledOnce();
  });

  it("does not let delayed operation A overwrite operation B", async () => {
    const owner = new ServiceOperationOwner();
    const operationA = owner.begin();
    let releaseOperationA!: () => void;
    const operationAReleased = new Promise<void>((resolve) => {
      releaseOperationA = resolve;
    });
    let publishedValue = "initial";
    const delayedOperationA = (async () => {
      await operationAReleased;
      return owner.runIfOwned(operationA, () => {
        publishedValue = "operation-a";
      });
    })();

    const operationB = owner.begin();
    expect(owner.runIfOwned(operationB, () => {
      publishedValue = "operation-b";
    })).toBe(true);

    releaseOperationA();

    await expect(delayedOperationA).resolves.toBe(false);
    expect(publishedValue).toBe("operation-b");
  });
});
