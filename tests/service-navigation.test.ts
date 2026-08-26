import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  serviceConsumedBack,
  type ServiceBackState
} from "../src/main/service-navigation";

const idle: ServiceBackState = {
  editable: false,
  expanded: 0,
  overlays: 0,
  url: "https://example.test/browse/title"
};

describe("service navigation adapter", () => {
  it("lets editable fields, closed overlays, collapsed menus, and service routes consume Back", () => {
    expect(serviceConsumedBack({ ...idle, editable: true }, idle)).toBe(true);
    expect(serviceConsumedBack({ ...idle, overlays: 1 }, idle)).toBe(true);
    expect(serviceConsumedBack({ ...idle, expanded: 1 }, idle)).toBe(true);
    expect(serviceConsumedBack(idle, { ...idle, url: "https://example.test/browse" })).toBe(true);
    expect(serviceConsumedBack(idle, idle)).toBe(false);
  });

  it("uses an unclipped fixed focus overlay above provider carousels", async () => {
    const source = await readFile(new URL("../src/main/service-host.ts", import.meta.url), "utf8");
    expect(source).toContain('html[data-nhd-tv-has-focus="true"]::after');
    expect(source).toContain("z-index: 2147483647");
    expect(source).toContain("pointer-events: none");
    expect(source).toContain("setTimeout(updateOverlay, 80)");
  });
});
