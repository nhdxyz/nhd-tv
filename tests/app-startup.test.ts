import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(
  new URL("../src/main/index.ts", import.meta.url),
  "utf8"
);

describe("desktop startup lifecycle", () => {
  it("presents a new window and raises the existing instance on repeat launch", () => {
    expect(mainSource).toContain("app.requestSingleInstanceLock()");
    expect(mainSource).toContain('app.on("second-instance"');
    expect(mainSource).toContain('app.on("activate"');
    expect(mainSource).toContain("function presentMainWindow()");
    expect(mainSource).toContain("window.restore()");
    expect(mainSource).toContain("app.focus({ steal: true })");
    expect(mainSource).toContain("window.show()");
    expect(mainSource).toContain("window.focus()");
    expect(mainSource).toContain("await mainWindow.loadURL(\"app://shell/index.html\")");
    expect(mainSource).toContain("presentMainWindow()");
  });
});
