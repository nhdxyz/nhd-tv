import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  classifyServiceFailure,
  serviceRecoveryRequest
} from "../src/main/service-recovery";

describe("service recovery policy", () => {
  it("classifies offline network errors without exposing failed URLs", () => {
    expect(classifyServiceFailure("load-failed", true, -106)).toBe("offline");
    expect(classifyServiceFailure("load-failed", false, -7)).toBe("offline");
    expect(classifyServiceFailure("load-failed", true, -7)).toBe("load-failed");
  });

  it("produces renderer-safe service recovery copy", () => {
    const request = serviceRecoveryRequest("crashed", "netflix", "Netflix");

    expect(request).toEqual({
      detail: "Netflix stopped unexpectedly. Your local sign-in data is still intact.",
      kind: "crashed",
      serviceId: "netflix",
      serviceName: "Netflix"
    });
    expect(JSON.stringify(request)).not.toContain("https://");
  });

  it("connects crashes, load failures, sleep, and shell recovery through owned boundaries", async () => {
    const [host, main, renderer] = await Promise.all([
      readFile(new URL("../src/main/service-host.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/main/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../src/renderer/index.ts", import.meta.url), "utf8")
    ]);

    expect(host).toContain('"did-fail-load"');
    expect(host).toContain('"render-process-gone"');
    expect(host).toContain('"unresponsive"');
    expect(host).toContain("async forceReturnHome(");
    expect(host).toContain("operationToken?: ServiceOperationToken");
    expect(main).toContain('powerMonitor.on("suspend"');
    expect(main).toContain('powerMonitor.on("resume"');
    expect(renderer).toContain("onServiceRecoveryRequested(showServiceRecovery)");
    expect(renderer).toContain('runServiceRecovery("retry")');
    expect(renderer).toContain('runServiceRecovery("reload")');
  });
});
