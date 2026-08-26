import { describe, expect, it } from "vitest";
import { buildPrecisionPointerTargetScript } from "../src/main/precision-pointer";

describe("precision pointer page boundary", () => {
  it("uses normalized coordinates and snaps only to visible interactive targets", () => {
    const script = buildPrecisionPointerTargetScript(0.25, 0.75);

    expect(script).toContain("Math.max(0, Math.min(1, 0.25)) * innerWidth");
    expect(script).toContain("Math.max(0, Math.min(1, 0.75)) * innerHeight");
    expect(script).toContain("distance <= snapRadius");
    expect(script).toContain('a[href^="/watch"]');
    expect(script).toContain("candidate.closest('[aria-hidden=\"true\"],[inert]') === null");
    expect(script).not.toContain(".click()");
  });

  it("excludes editable, credential, and payment surfaces", () => {
    const script = buildPrecisionPointerTargetScript(0.5, 0.5);

    expect(script).toContain("input,textarea,select");
    expect(script).toContain("password|payment|checkout|billing");
    expect(script).not.toContain("ipcRenderer");
    expect(script).not.toContain("fetch(");
  });
});
