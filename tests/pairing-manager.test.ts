import { describe, expect, it } from "vitest";
import {
  PairingManager,
  parseRemoteAction,
  parseRemotePointerInput,
  parseRemoteTextInput
} from "../src/main/remote/pairing-manager";

describe("phone remote pairing", () => {
  it("requires the current short-lived pairing token", () => {
    let now = 1_000;
    const manager = new PairingManager({ now: () => now, offerLifetimeMs: 100 });
    const offer = manager.beginPairing();

    expect(manager.requestPairing("wrong-token")).toBeNull();
    now = offer.expiresAt;
    expect(manager.requestPairing(offer.token)).toBeNull();
  });

  it("issues a controller token only after television approval", () => {
    const manager = new PairingManager();
    const offer = manager.beginPairing();
    const request = manager.requestPairing(offer.token);

    expect(request).not.toBeNull();
    expect(manager.hasPendingRequest).toBe(true);
    expect(manager.pairingDecision(request?.requestId)).toEqual({ state: "pending" });
    expect(manager.approvePending()).toBe(true);

    const decision = manager.pairingDecision(request?.requestId);
    expect(decision.state).toBe("approved");

    if (decision.state === "approved") {
      expect(manager.authorize(decision.token)).toBe(true);
      expect(manager.revoke(decision.token)).toBe(true);
      expect(manager.authorize(decision.token)).toBe(false);
    }
  });

  it("tracks recent live presence without expiring a session token", () => {
    let now = 1_000;
    const manager = new PairingManager({ controllerActiveMs: 100, now: () => now });
    const offer = manager.beginPairing();
    const request = manager.requestPairing(offer.token);
    manager.approvePending();
    const decision = manager.pairingDecision(request?.requestId);

    expect(decision.state).toBe("approved");
    expect(manager.connectedControllers).toBe(1);
    now += 101;
    expect(manager.connectedControllers).toBe(0);

    if (decision.state === "approved") {
      expect(manager.authorize(decision.token)).toBe(true);
      expect(manager.connectedControllers).toBe(1);
    }
  });

  it("never authorizes denied pairing requests", () => {
    const manager = new PairingManager();
    const offer = manager.beginPairing();
    const request = manager.requestPairing(offer.token);

    expect(manager.denyPending()).toBe(true);
    expect(manager.pairingDecision(request?.requestId)).toEqual({ state: "denied" });
    expect(manager.connectedControllers).toBe(0);
  });

  it("accepts only the fixed remote action vocabulary", () => {
    expect(parseRemoteAction("left")).toBe("left");
    expect(parseRemoteAction("select")).toBe("select");
    expect(parseRemoteAction("play-pause")).toBe("play-pause");
    expect(parseRemoteAction("rewind")).toBe("rewind");
    expect(parseRemoteAction("fast-forward")).toBe("fast-forward");
    expect(parseRemoteAction("volume-down")).toBe("volume-down");
    expect(parseRemoteAction("volume-up")).toBe("volume-up");
    expect(parseRemoteAction("mute")).toBe("mute");
    expect(parseRemoteAction("launch-shell-command")).toBeNull();
    expect(parseRemoteAction({ action: "left" })).toBeNull();
  });

  it("accepts only bounded normalized precision-pointer input", () => {
    expect(parseRemotePointerInput({
      phase: "move",
      scroll: -1,
      scrollX: 0.5,
      x: 0.25,
      y: 0.75
    })).toEqual({ phase: "move", scroll: -1, scrollX: 0.5, x: 0.25, y: 0.75 });
    expect(parseRemotePointerInput({ phase: "tap", scroll: 0, scrollX: 0, x: 1, y: 0 })).not.toBeNull();
    expect(parseRemotePointerInput({ phase: "hide", scroll: 0, scrollX: 0, x: 0.5, y: 0.5 })).not.toBeNull();
    expect(parseRemotePointerInput({ phase: "drag", scroll: 0, scrollX: 0, x: 0.5, y: 0.5 })).toBeNull();
    expect(parseRemotePointerInput({ phase: "move", scroll: 0, scrollX: 0, x: 1.01, y: 0.5 })).toBeNull();
    expect(parseRemotePointerInput({ phase: "move", scroll: 2, scrollX: 0, x: 0.5, y: 0.5 })).toBeNull();
    expect(parseRemotePointerInput({ phase: "move", scroll: 0, scrollX: -1.1, x: 0.5, y: 0.5 })).toBeNull();
    expect(parseRemotePointerInput({
      phase: "move",
      scroll: 0,
      scrollX: 0,
      selector: "input",
      x: 0.5,
      y: 0.5
    })).toBeNull();
  });

  it("accepts only bounded remote search text with an explicit submit flag", () => {
    expect(parseRemoteTextInput({ submit: false, text: "Breaking Bad" })).toEqual({
      submit: false,
      text: "Breaking Bad"
    });
    expect(parseRemoteTextInput({ submit: true, text: "" })).toEqual({ submit: true, text: "" });
    expect(parseRemoteTextInput({ submit: false, text: "x".repeat(121) })).toBeNull();
    expect(parseRemoteTextInput({ submit: false, text: "query\nnext" })).toBeNull();
    expect(parseRemoteTextInput({ selector: "input", submit: false, text: "query" })).toBeNull();
    expect(parseRemoteTextInput({ submit: "yes", text: "query" })).toBeNull();
  });
});
