import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NHD_TV_TAILSCALE_HTTPS_PORT,
  tailscaleHttpsHostname,
  TailscaleSecureRemote,
  type TailscaleCommandRunner
} from "../src/main/remote/tailscale-secure-remote";

const temporaryDirectories: string[] = [];
const HOSTNAME = "living-room.example.ts.net";

function status(overrides: Record<string, unknown> = {}) {
  return {
    BackendState: "Running",
    CertDomains: [HOSTNAME],
    CurrentTailnet: { MagicDNSEnabled: true },
    Self: {
      Capabilities: ["https"],
      DNSName: `${HOSTNAME}.`,
      Online: true
    },
    ...overrides
  };
}

function serveStatus(proxyTarget?: string, includeExisting443 = false) {
  return {
    TCP: {
      ...(includeExisting443 ? { "443": { HTTPS: true } } : {}),
      ...(proxyTarget === undefined ? {} : {
        [String(NHD_TV_TAILSCALE_HTTPS_PORT)]: { HTTPS: true }
      })
    },
    Web: {
      ...(includeExisting443 ? {
        [`${HOSTNAME}:443`]: { Handlers: { "/": { Proxy: "http://127.0.0.1:64020" } } }
      } : {}),
      ...(proxyTarget === undefined ? {} : {
        [`${HOSTNAME}:${NHD_TV_TAILSCALE_HTTPS_PORT}`]: {
          Handlers: { "/": { Proxy: proxyTarget } }
        }
      })
    }
  };
}

async function markerPath(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "nhd-tv-tailscale-"));
  temporaryDirectories.push(directory);
  return path.join(directory, "tailscale-serve.json");
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true }))
  );
});

describe("Tailscale secure remote", () => {
  it("requires running Tailscale, MagicDNS, and HTTPS", () => {
    expect(tailscaleHttpsHostname(status())).toBe(HOSTNAME);
    expect(tailscaleHttpsHostname(status({ BackendState: "Stopped" }))).toBeNull();
    expect(tailscaleHttpsHostname(status({ CurrentTailnet: { MagicDNSEnabled: false } })))
      .toBeNull();
    expect(tailscaleHttpsHostname(status({ CertDomains: [], Self: {
      Capabilities: [], DNSName: HOSTNAME, Online: true
    } }))).toBeNull();
    expect(tailscaleHttpsHostname(status({ CertDomains: ["not-tailscale.example.com"], Self: {
      Capabilities: ["https"], DNSName: "not-tailscale.example.com", Online: true
    } }))).toBeNull();
  });

  it("configures only the dedicated NHD-TV HTTPS listener", async () => {
    const desiredTarget = "http://127.0.0.1:43123";
    const responses = [status(), serveStatus(undefined, true), "", serveStatus(desiredTarget, true)];
    const run = vi.fn<TailscaleCommandRunner>(async () => JSON.stringify(responses.shift()));
    const statePath = await markerPath();
    const result = await new TailscaleSecureRemote(statePath, run).prepare(43_123);

    expect(result).toEqual({
      detail: "Secure phone voice is available through Tailscale.",
      origin: `https://${HOSTNAME}:${NHD_TV_TAILSCALE_HTTPS_PORT}`,
      state: "ready"
    });
    expect(run).toHaveBeenCalledWith([
      "serve",
      "--bg",
      "--yes",
      `--https=${NHD_TV_TAILSCALE_HTTPS_PORT}`,
      desiredTarget
    ]);
    expect(run.mock.calls.flat()).not.toContain("reset");
    expect(JSON.parse(await readFile(statePath, "utf8"))).toMatchObject({
      hostname: HOSTNAME,
      proxyTarget: desiredTarget
    });
  });

  it("reuses an exact existing route without invoking a mutation", async () => {
    const target = "http://127.0.0.1:43123";
    const responses = [status(), serveStatus(target)];
    const run = vi.fn<TailscaleCommandRunner>(async () => JSON.stringify(responses.shift()));
    const result = await new TailscaleSecureRemote(await markerPath(), run).prepare(43_123);
    expect(result.state).toBe("ready");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("updates a stale route only when the ownership marker matches", async () => {
    const statePath = await markerPath();
    const oldTarget = "http://127.0.0.1:41000";
    const initialResponses = [status(), serveStatus(), "", serveStatus(oldTarget)];
    const initialRun = vi.fn<TailscaleCommandRunner>(
      async () => JSON.stringify(initialResponses.shift())
    );
    await new TailscaleSecureRemote(statePath, initialRun).prepare(41_000);

    const nextTarget = "http://127.0.0.1:42000";
    const nextResponses = [status(), serveStatus(oldTarget), "", serveStatus(nextTarget)];
    const nextRun = vi.fn<TailscaleCommandRunner>(async () => JSON.stringify(nextResponses.shift()));
    const result = await new TailscaleSecureRemote(statePath, nextRun).prepare(42_000);
    expect(result.state).toBe("ready");
    expect(nextRun).toHaveBeenCalledWith(expect.arrayContaining([nextTarget]));
  });

  it("refuses to overwrite an unowned listener", async () => {
    const responses = [status(), serveStatus("http://127.0.0.1:9999")];
    const run = vi.fn<TailscaleCommandRunner>(async () => JSON.stringify(responses.shift()));
    const result = await new TailscaleSecureRemote(await markerPath(), run).prepare(43_123);
    expect(result).toMatchObject({ origin: null, state: "conflict" });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("degrades cleanly when the CLI is absent or disconnected", async () => {
    const run = vi.fn<TailscaleCommandRunner>(async () => {
      throw new Error("missing");
    });
    await expect(new TailscaleSecureRemote(await markerPath(), run).prepare(43_123)).resolves
      .toMatchObject({ origin: null, state: "unavailable" });
  });

  it("releases only the exact app-owned listener and preserves port 443", async () => {
    const statePath = await markerPath();
    const target = "http://127.0.0.1:43123";
    const responses = [
      status(),
      serveStatus(undefined, true),
      "",
      serveStatus(target, true),
      status(),
      serveStatus(target, true),
      "",
      serveStatus(undefined, true)
    ];
    const run = vi.fn<TailscaleCommandRunner>(async () => JSON.stringify(responses.shift()));
    const remote = new TailscaleSecureRemote(statePath, run);
    await remote.prepare(43_123);

    await expect(remote.release()).resolves.toBe(true);
    expect(run).toHaveBeenCalledWith([
      "serve",
      "--bg",
      "--yes",
      `--https=${NHD_TV_TAILSCALE_HTTPS_PORT}`,
      "off"
    ]);
    await expect(readFile(statePath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("does not release a listener changed by another owner", async () => {
    const statePath = await markerPath();
    const ownedTarget = "http://127.0.0.1:43123";
    const setupResponses = [status(), serveStatus(), "", serveStatus(ownedTarget)];
    const setupRun = vi.fn<TailscaleCommandRunner>(
      async () => JSON.stringify(setupResponses.shift())
    );
    await new TailscaleSecureRemote(statePath, setupRun).prepare(43_123);

    const responses = [status(), serveStatus("http://127.0.0.1:49999")];
    const run = vi.fn<TailscaleCommandRunner>(async () => JSON.stringify(responses.shift()));
    await expect(new TailscaleSecureRemote(statePath, run).release()).resolves.toBe(false);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
