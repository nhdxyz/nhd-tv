import { describe, expect, it } from "vitest";
import {
  GamepadActionMapper,
  type GamepadLike
} from "../src/renderer/gamepad-input";

function gamepad(
  pressedButtons: readonly number[] = [],
  axes: readonly number[] = [0, 0]
): GamepadLike {
  return {
    axes,
    buttons: Array.from({ length: 17 }, (_, index) => ({
      pressed: pressedButtons.includes(index),
      value: pressedButtons.includes(index) ? 1 : 0
    })),
    connected: true,
    id: "Xbox Controller",
    index: 0,
    mapping: "standard"
  };
}

describe("Xbox-style Gamepad input", () => {
  it("maps the D-pad and left stick with a dead zone", () => {
    const mapper = new GamepadActionMapper();

    expect(mapper.update([gamepad([15])], 0)).toEqual(["right"]);
    expect(mapper.update([gamepad([], [0.4, 0])], 10)).toEqual([]);
    expect(mapper.update([gamepad([], [-0.8, 0.2])], 20)).toEqual(["left"]);
    expect(mapper.update([gamepad([], [0.2, -0.9])], 30)).toEqual(["up"]);
  });

  it("uses an initial delay and bounded repeat cadence", () => {
    const mapper = new GamepadActionMapper();
    const right = gamepad([15]);

    expect(mapper.update([right], 1_000)).toEqual(["right"]);
    expect(mapper.update([right], 1_419)).toEqual([]);
    expect(mapper.update([right], 1_420)).toEqual(["right"]);
    expect(mapper.update([right], 1_534)).toEqual([]);
    expect(mapper.update([right], 1_535)).toEqual(["right"]);
    expect(mapper.update([gamepad()], 1_600)).toEqual([]);
  });

  it("maps A, B, Guide, and the View plus Menu fallback on rising edges", () => {
    const mapper = new GamepadActionMapper();

    expect(mapper.update([gamepad([0, 1, 16])], 0)).toEqual(["select", "back", "home"]);
    expect(mapper.update([gamepad([0, 1, 16])], 10)).toEqual([]);
    expect(mapper.update([gamepad()], 20)).toEqual([]);
    expect(mapper.update([gamepad([8, 9])], 30)).toEqual(["home"]);
  });

  it("maps standard face, bumper, and trigger buttons to media actions", () => {
    const mapper = new GamepadActionMapper();

    expect(mapper.update([gamepad([2, 3, 4, 5, 6, 7])], 0)).toEqual([
      "fast-forward",
      "mute",
      "play-pause",
      "rewind",
      "volume-down",
      "volume-up"
    ]);
    expect(mapper.update([gamepad([2, 3, 4, 5, 6, 7])], 10)).toEqual([]);
    expect(mapper.update([gamepad()], 20)).toEqual([]);
    expect(mapper.update([gamepad([2])], 30)).toEqual(["play-pause"]);
  });

  it("clears held state when a controller disconnects", () => {
    const mapper = new GamepadActionMapper();

    expect(mapper.update([gamepad([0, 15])], 0)).toEqual(["right", "select"]);
    expect(mapper.update([], 10)).toEqual([]);
    expect(mapper.update([gamepad([0, 15])], 20)).toEqual(["right", "select"]);
  });

  it("forces a return Home after Back is deliberately held", () => {
    const mapper = new GamepadActionMapper();
    const back = gamepad([1]);

    expect(mapper.update([back], 100)).toEqual(["back"]);
    expect(mapper.update([back], 1_299)).toEqual([]);
    expect(mapper.update([back], 1_300)).toEqual(["force-home"]);
    expect(mapper.update([back], 1_500)).toEqual([]);
    expect(mapper.update([gamepad()], 1_600)).toEqual([]);
    expect(mapper.update([back], 1_700)).toEqual(["back"]);
  });
});
