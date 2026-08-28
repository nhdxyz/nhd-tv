import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isMediaAction,
  mediaActionForKeyInput,
  nativeMediaKeyCode
} from "../src/main/media-actions";

const noModifiers = {
  alt: false,
  control: false,
  meta: false,
  shift: false
};

describe("shared media actions", () => {
  it("maps hardware media keys into the normalized action vocabulary", () => {
    expect(mediaActionForKeyInput({ ...noModifiers, key: "MediaPlayPause" })).toBe("play-pause");
    expect(mediaActionForKeyInput({ ...noModifiers, key: "MediaRewind" })).toBe("rewind");
    expect(mediaActionForKeyInput({ ...noModifiers, key: "MediaFastForward" })).toBe("fast-forward");
    expect(mediaActionForKeyInput({ ...noModifiers, key: "AudioVolumeDown" })).toBe("volume-down");
    expect(mediaActionForKeyInput({ ...noModifiers, key: "AudioVolumeUp" })).toBe("volume-up");
    expect(mediaActionForKeyInput({ ...noModifiers, key: "AudioVolumeMute" })).toBe("mute");
  });

  it("requires Command-or-Control plus Shift for fallback shortcuts", () => {
    expect(mediaActionForKeyInput({ ...noModifiers, control: true, key: " ", shift: true })).toBe("play-pause");
    expect(mediaActionForKeyInput({ ...noModifiers, key: "ArrowLeft", meta: true, shift: true })).toBe("rewind");
    expect(mediaActionForKeyInput({ ...noModifiers, control: true, key: "ArrowRight", shift: true })).toBe("fast-forward");
    expect(mediaActionForKeyInput({ ...noModifiers, control: true, key: "-", shift: true })).toBe("volume-down");
    expect(mediaActionForKeyInput({ ...noModifiers, control: true, key: "=", shift: true })).toBe("volume-up");
    expect(mediaActionForKeyInput({ ...noModifiers, control: true, key: "m", shift: true })).toBe("mute");
    expect(mediaActionForKeyInput({ ...noModifiers, key: "ArrowLeft" })).toBeNull();
  });

  it("dispatches only native Electron accelerator or provider keyboard keys", () => {
    expect(nativeMediaKeyCode("play-pause")).toBe("MediaPlayPause");
    expect(nativeMediaKeyCode("play-pause", "netflix")).toBe("Space");
    expect(nativeMediaKeyCode("play-pause", "spotify")).toBe("Space");
    expect(nativeMediaKeyCode("rewind", "spotify")).toBe("Up");
    expect(nativeMediaKeyCode("fast-forward", "spotify")).toBe("Down");
    expect(nativeMediaKeyCode("rewind")).toBe("Left");
    expect(nativeMediaKeyCode("fast-forward")).toBe("Right");
    expect(nativeMediaKeyCode("volume-down")).toBe("VolumeDown");
    expect(nativeMediaKeyCode("volume-up")).toBe("VolumeUp");
    expect(nativeMediaKeyCode("mute")).toBe("VolumeMute");
    expect(isMediaAction("select")).toBe(false);
    expect(isMediaAction("mute")).toBe(true);
  });

  it("wires keyboard and remote media actions into native service input events", () => {
    const source = readFileSync(
      new URL("../src/main/service-host.ts", import.meta.url),
      "utf8"
    );

    expect(source).toContain("mediaActionForKeyInput({");
    expect(source).toContain("if (isMediaAction(action))");
    expect(source).toContain("this.#sendMediaKey(mediaAction)");
    expect(source).toContain("const keyCode = nativeMediaKeyCode(action,");
    expect(source).toContain('sendInputEvent({ keyCode, type: "keyDown" })');
    expect(source).toContain('sendInputEvent({ keyCode, type: "keyUp" })');
    const dispatchBody = source.slice(
      source.lastIndexOf("  #sendMediaKey(action"),
      source.indexOf("#resize(): void")
    );
    expect(dispatchBody).not.toContain("executeJavaScript");
    expect(dispatchBody).not.toContain("querySelector");
  });
});
