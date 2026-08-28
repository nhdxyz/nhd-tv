import { execFile } from "node:child_process";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

export const NHD_TV_TAILSCALE_HTTPS_PORT = 8_443;
const COMMAND_TIMEOUT_MS = 8_000;
const MAX_COMMAND_OUTPUT_BYTES = 2 * 1024 * 1024;

interface TailscaleMarker {
  hostname: string;
  proxyTarget: string;
  version: 1;
}

export interface TailscaleSecureRemoteResult {
  detail: string;
  origin: string | null;
  state: "conflict" | "error" | "ready" | "unavailable";
}

export type TailscaleCommandRunner = (args: readonly string[]) => Promise<string>;

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseJson(value: string): Record<string, unknown> | null {
  try {
    return objectValue(JSON.parse(value));
  } catch {
    return null;
  }
}

function normalizedHostname(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const hostname = value.trim().toLowerCase().replace(/\.$/, "");
  return /^[a-z0-9](?:[a-z0-9-]{0,62}\.)+[a-z]{2,}$/.test(hostname)
    ? hostname
    : null;
}

function isTailscaleHostname(hostname: string): boolean {
  return hostname.endsWith(".ts.net");
}

export function tailscaleHttpsHostname(statusValue: unknown): string | null {
  const status = objectValue(statusValue);
  const self = objectValue(status?.Self);
  const tailnet = objectValue(status?.CurrentTailnet);
  const hostname = normalizedHostname(self?.DNSName);
  if (
    status?.BackendState !== "Running" ||
    self?.Online !== true ||
    tailnet?.MagicDNSEnabled !== true ||
    hostname === null ||
    !isTailscaleHostname(hostname)
  ) {
    return null;
  }

  const certDomains = Array.isArray(status?.CertDomains)
    ? status.CertDomains.map(normalizedHostname)
    : [];
  const capabilities = Array.isArray(self?.Capabilities) ? self.Capabilities : [];
  const hasHttps = certDomains.includes(hostname) || capabilities.includes("https");
  return hasHttps ? hostname : null;
}

function serveProxyTarget(
  serveStatusValue: unknown,
  hostname: string,
  httpsPort = NHD_TV_TAILSCALE_HTTPS_PORT
): { occupied: boolean; proxyTarget: string | null } {
  const serveStatus = objectValue(serveStatusValue);
  const tcp = objectValue(serveStatus?.TCP);
  const web = objectValue(serveStatus?.Web);
  const listener = objectValue(tcp?.[String(httpsPort)]);
  const host = objectValue(web?.[`${hostname}:${httpsPort}`]);
  const handlers = objectValue(host?.Handlers);
  const root = objectValue(handlers?.["/"]);
  return {
    occupied: listener !== null || host !== null,
    proxyTarget: typeof root?.Proxy === "string" ? root.Proxy : null
  };
}

function validMarker(value: unknown): TailscaleMarker | null {
  const marker = objectValue(value);
  const hostname = normalizedHostname(marker?.hostname);
  const proxyTarget = typeof marker?.proxyTarget === "string" ? marker.proxyTarget : null;
  const targetMatch = proxyTarget === null
    ? null
    : /^http:\/\/127\.0\.0\.1:(\d{1,5})$/.exec(proxyTarget)
  const targetPort = targetMatch === null ? null : Number(targetMatch[1]);
  if (
    marker?.version !== 1 ||
    hostname === null ||
    !isTailscaleHostname(hostname) ||
    proxyTarget === null ||
    targetMatch === null ||
    targetPort === null ||
    targetPort < 1 ||
    targetPort > 65_535
  ) {
    return null;
  }
  return { hostname, proxyTarget, version: 1 };
}

export function createTailscaleCommandRunner(executable = "tailscale"): TailscaleCommandRunner {
  return (args) => new Promise<string>((resolve, reject) => {
    execFile(executable, [...args], {
      encoding: "utf8",
      maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
      timeout: COMMAND_TIMEOUT_MS
    }, (error, stdout) => {
      if (error !== null) {
        reject(new Error("The Tailscale command failed."));
        return;
      }
      resolve(stdout);
    });
  });
}

export class TailscaleSecureRemote {
  readonly #markerPath: string;
  readonly #run: TailscaleCommandRunner;
  #sequence: Promise<void> = Promise.resolve();

  constructor(markerPath: string, run: TailscaleCommandRunner = createTailscaleCommandRunner()) {
    this.#markerPath = markerPath;
    this.#run = run;
  }

  prepare(localPort: number): Promise<TailscaleSecureRemoteResult> {
    return this.#enqueue(() => this.#prepare(localPort));
  }

  release(): Promise<boolean> {
    return this.#enqueue(() => this.#release());
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#sequence.catch(() => undefined).then(operation);
    this.#sequence = result.then(() => undefined, () => undefined);
    return result;
  }

  async #prepare(localPort: number): Promise<TailscaleSecureRemoteResult> {
    if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65_535) {
      return { detail: "The phone remote exposed an invalid local port.", origin: null, state: "error" };
    }

    let hostname: string;
    let serveStatus: Record<string, unknown>;
    try {
      const status = parseJson(await this.#run(["status", "--json"]));
      const parsedHostname = tailscaleHttpsHostname(status);
      if (parsedHostname === null) {
        return {
          detail: "Tailscale is not connected with MagicDNS and HTTPS enabled.",
          origin: null,
          state: "unavailable"
        };
      }
      hostname = parsedHostname;
      serveStatus = parseJson(await this.#run(["serve", "status", "--json"])) ?? {};
    } catch {
      return {
        detail: "Tailscale could not be reached. The LAN remote remains available without voice.",
        origin: null,
        state: "unavailable"
      };
    }

    const origin = `https://${hostname}:${NHD_TV_TAILSCALE_HTTPS_PORT}`;
    const desiredTarget = `http://127.0.0.1:${localPort}`;
    const current = serveProxyTarget(serveStatus, hostname);
    const marker = await this.#readMarker();
    const ownsCurrent = marker?.hostname === hostname &&
      marker.proxyTarget === current.proxyTarget;

    if (current.proxyTarget === desiredTarget) {
      await this.#writeMarker({ hostname, proxyTarget: desiredTarget, version: 1 });
      return { detail: "Secure phone voice is available through Tailscale.", origin, state: "ready" };
    }

    if (current.occupied && !ownsCurrent) {
      return {
        detail: `Tailscale HTTPS port ${NHD_TV_TAILSCALE_HTTPS_PORT} is already used by another local service.`,
        origin: null,
        state: "conflict"
      };
    }

    try {
      await this.#run([
        "serve",
        "--bg",
        "--yes",
        `--https=${NHD_TV_TAILSCALE_HTTPS_PORT}`,
        desiredTarget
      ]);
      const verifiedStatus = parseJson(
        await this.#run(["serve", "status", "--json"])
      ) ?? {};
      const verified = serveProxyTarget(verifiedStatus, hostname);
      if (verified.proxyTarget !== desiredTarget) {
        return {
          detail: "Tailscale did not publish the NHD-TV secure remote route.",
          origin: null,
          state: "error"
        };
      }
      await this.#writeMarker({ hostname, proxyTarget: desiredTarget, version: 1 });
      return { detail: "Secure phone voice is available through Tailscale.", origin, state: "ready" };
    } catch {
      return {
        detail: "Tailscale could not publish the secure phone remote route.",
        origin: null,
        state: "error"
      };
    }
  }

  async #release(): Promise<boolean> {
    const marker = await this.#readMarker();
    if (marker === null) return false;

    try {
      const hostname = tailscaleHttpsHostname(
        parseJson(await this.#run(["status", "--json"]))
      );
      if (hostname === null || hostname !== marker.hostname) return false;
      const serveStatus = parseJson(await this.#run(["serve", "status", "--json"])) ?? {};
      const current = serveProxyTarget(serveStatus, hostname);
      if (current.proxyTarget === null) {
        await this.#deleteMarker();
        return false;
      }
      if (current.proxyTarget !== marker.proxyTarget) return false;

      await this.#run([
        "serve",
        "--bg",
        "--yes",
        `--https=${NHD_TV_TAILSCALE_HTTPS_PORT}`,
        "off"
      ]);
      const verifiedStatus = parseJson(
        await this.#run(["serve", "status", "--json"])
      ) ?? {};
      if (serveProxyTarget(verifiedStatus, hostname).occupied) return false;
      await this.#deleteMarker();
      return true;
    } catch {
      return false;
    }
  }

  async #readMarker(): Promise<TailscaleMarker | null> {
    try {
      return validMarker(JSON.parse(await readFile(this.#markerPath, "utf8")));
    } catch {
      return null;
    }
  }

  async #writeMarker(marker: TailscaleMarker): Promise<void> {
    const directory = path.dirname(this.#markerPath);
    const temporaryPath = `${this.#markerPath}.tmp`;
    await mkdir(directory, { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(marker, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600
    });
    await rename(temporaryPath, this.#markerPath);
  }

  async #deleteMarker(): Promise<void> {
    try {
      await unlink(this.#markerPath);
    } catch (error) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error;
      }
    }
  }
}
