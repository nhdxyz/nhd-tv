import { describe, expect, it } from "vitest";
import { isTrustedShellUrl } from "../src/main/security/sender-policy";

describe("trusted shell sender policy", () => {
  it("accepts only the packaged shell origin", () => {
    expect(isTrustedShellUrl("app://shell/index.html")).toBe(true);
    expect(isTrustedShellUrl("app://service/index.html")).toBe(false);
    expect(isTrustedShellUrl("https://shell/index.html")).toBe(false);
    expect(isTrustedShellUrl("not-a-url")).toBe(false);
  });
});
