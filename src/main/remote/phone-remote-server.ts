import {
  createServer,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from "node:http";
import { networkInterfaces } from "node:os";
import QRCode from "qrcode";
import type {
  RemoteAction,
  RemotePointerInput,
  RemotePointerResult,
  RemoteStatus
} from "../contracts";
import { normalizeSearchQuery } from "../security/navigation-policy";
import {
  PairingManager,
  parseRemoteAction,
  parseRemotePointerInput
} from "./pairing-manager";
import { REMOTE_CSS, REMOTE_HTML, REMOTE_JS } from "./remote-assets";

const MAX_JSON_BYTES = 4_096;
const MIN_POINTER_INTERVAL_MS = 16;
const REMOTE_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'"
].join("; ");

export interface PhoneRemoteServerOptions {
  onAction: (action: RemoteAction) => void;
  onPointer: (input: RemotePointerInput) => RemotePointerResult | Promise<RemotePointerResult>;
  onSearch: (query: string) => void | Promise<void>;
  onStatusChanged: (status: RemoteStatus) => void;
  shouldAutoApproveFirstRemote: () => boolean;
}

export function shouldAutoApprovePairing(
  connectedControllers: number,
  autoApproveFirstRemote: boolean
): boolean {
  return connectedControllers === 0 && autoApproveFirstRemote;
}

function lanIpv4Address(): string | null {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal && !address.address.startsWith("169.254.")) {
        return address.address;
      }
    }
  }

  return null;
}

function setSecurityHeaders(response: ServerResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Security-Policy", REMOTE_CSP);
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
}

function writeText(
  response: ServerResponse,
  statusCode: number,
  contentType: string,
  body: string
): void {
  setSecurityHeaders(response);
  response.writeHead(statusCode, { "Content-Type": contentType });
  response.end(body);
}

function writeJson(response: ServerResponse, statusCode: number, body: object): void {
  writeText(response, statusCode, "application/json; charset=utf-8", JSON.stringify(body));
}

function requestOrigin(request: IncomingMessage): string | null {
  const host = request.headers.host;
  return typeof host === "string" ? `http://${host}` : null;
}

export function remotePostHeadersAreAllowed(
  headers: IncomingHttpHeaders,
  expectedOrigin: string | null
): boolean {
  const origin = headers.origin;
  const contentType = headers["content-type"];

  return (
    expectedOrigin !== null &&
    origin === expectedOrigin &&
    typeof contentType === "string" &&
    contentType.toLowerCase().startsWith("application/json")
  );
}

function isSameOriginPost(request: IncomingMessage, expectedOrigin: string | null): boolean {
  return remotePostHeadersAreAllowed(request.headers, expectedOrigin);
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;

    if (totalBytes > MAX_JSON_BYTES) {
      request.destroy();
      return null;
    }

    chunks.push(buffer);
  }

  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export class PhoneRemoteServer {
  readonly #manager = new PairingManager();
  readonly #onAction: PhoneRemoteServerOptions["onAction"];
  readonly #onPointer: PhoneRemoteServerOptions["onPointer"];
  readonly #onSearch: PhoneRemoteServerOptions["onSearch"];
  readonly #onStatusChanged: PhoneRemoteServerOptions["onStatusChanged"];
  readonly #shouldAutoApproveFirstRemote: PhoneRemoteServerOptions["shouldAutoApproveFirstRemote"];
  #expiresAt: number | null = null;
  #lastPointerAt = 0;
  #networkAddress: string | null = null;
  #qrDataUrl: string | null = null;
  #remoteOrigin: string | null = null;
  #server: Server | null = null;

  constructor(options: PhoneRemoteServerOptions) {
    this.#onAction = options.onAction;
    this.#onPointer = options.onPointer;
    this.#onSearch = options.onSearch;
    this.#onStatusChanged = options.onStatusChanged;
    this.#shouldAutoApproveFirstRemote = options.shouldAutoApproveFirstRemote;
  }

  get status(): RemoteStatus {
    if (this.#expiresAt !== null && this.#expiresAt <= Date.now()) {
      this.#expiresAt = null;
      this.#qrDataUrl = null;
    }

    if (this.#manager.hasPendingRequest) {
      return {
        connectedControllers: this.#manager.connectedControllers,
        detail: "A phone is asking to pair. Approve it on this television.",
        expiresAt: this.#expiresAt,
        networkAddress: this.#networkAddress,
        qrDataUrl: null,
        state: "awaiting-approval"
      };
    }

    if (this.#qrDataUrl !== null && this.#expiresAt !== null) {
      return {
        connectedControllers: this.#manager.connectedControllers,
        detail: "Scan the QR code with a phone on this trusted local network.",
        expiresAt: this.#expiresAt,
        networkAddress: this.#networkAddress,
        qrDataUrl: this.#qrDataUrl,
        state: "pairing"
      };
    }

    if (this.#manager.connectedControllers > 0) {
      return {
        connectedControllers: this.#manager.connectedControllers,
        detail: "Phone remote connected for this NHD-TV session.",
        expiresAt: null,
        networkAddress: this.#networkAddress,
        qrDataUrl: null,
        state: "ready"
      };
    }

    return {
      connectedControllers: 0,
      detail: "Start pairing to create a short-lived local QR code.",
      expiresAt: null,
      networkAddress: this.#networkAddress,
      qrDataUrl: null,
      state: "inactive"
    };
  }

  async startPairing(): Promise<RemoteStatus> {
    await this.#ensureListening();

    if (this.#networkAddress === null) {
      throw new Error("No active local IPv4 network was found for phone pairing.");
    }

    const address = this.#server?.address();
    if (address === null || typeof address === "string" || address === undefined) {
      throw new Error("The phone remote server did not expose a local port.");
    }

    const offer = this.#manager.beginPairing();
    this.#remoteOrigin = `http://${this.#networkAddress}:${address.port}`;
    const remoteUrl = `${this.#remoteOrigin}/#${offer.token}`;

    this.#expiresAt = offer.expiresAt;
    this.#qrDataUrl = await QRCode.toDataURL(remoteUrl, {
      color: { dark: "#06070b", light: "#ffffffff" },
      errorCorrectionLevel: "M",
      margin: 2,
      width: 360
    });
    this.#publishStatus();
    return this.status;
  }

  async ensurePairing(): Promise<RemoteStatus> {
    const status = this.status;
    if (
      status.connectedControllers > 0 ||
      status.state === "awaiting-approval" ||
      status.state === "pairing"
    ) {
      return status;
    }

    return this.startPairing();
  }

  approvePending(): RemoteStatus {
    if (!this.#manager.approvePending()) {
      throw new Error("There is no active phone pairing request to approve.");
    }

    this.#expiresAt = null;
    this.#qrDataUrl = null;
    this.#publishStatus();
    return this.status;
  }

  denyPending(): RemoteStatus {
    if (!this.#manager.denyPending()) {
      throw new Error("There is no active phone pairing request to deny.");
    }

    this.#expiresAt = null;
    this.#qrDataUrl = null;
    this.#publishStatus();
    return this.status;
  }

  async stop(): Promise<void> {
    this.#manager.revokeAll();
    this.#expiresAt = null;
    this.#networkAddress = null;
    this.#qrDataUrl = null;
    this.#remoteOrigin = null;

    const server = this.#server;
    this.#server = null;

    if (server !== null) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  async #ensureListening(): Promise<void> {
    if (this.#server !== null) {
      return;
    }

    this.#networkAddress = lanIpv4Address();
    const server = createServer((request, response) => {
      void this.#handleRequest(request, response).catch(() => {
        if (!response.headersSent) {
          writeJson(response, 500, { error: "Remote server error" });
        } else {
          response.end();
        }
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "0.0.0.0", () => {
        server.off("error", reject);
        resolve();
      });
    });
    this.#server = server;
  }

  async #handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const method = request.method ?? "GET";
    const origin = requestOrigin(request) ?? "http://invalid";
    const url = new URL(request.url ?? "/", origin);

    if (method === "GET" && url.pathname === "/") {
      writeText(response, 200, "text/html; charset=utf-8", REMOTE_HTML);
      return;
    }

    if (method === "GET" && url.pathname === "/remote.css") {
      writeText(response, 200, "text/css; charset=utf-8", REMOTE_CSS);
      return;
    }

    if (method === "GET" && url.pathname === "/remote.js") {
      writeText(response, 200, "text/javascript; charset=utf-8", REMOTE_JS);
      return;
    }

    if (method === "POST" && url.pathname === "/api/pair") {
      if (!isSameOriginPost(request, this.#remoteOrigin)) {
        writeJson(response, 403, { error: "Pairing request rejected" });
        return;
      }

      const body = await readJsonBody(request);
      const shouldAutoApprove = shouldAutoApprovePairing(
        this.#manager.connectedControllers,
        this.#shouldAutoApproveFirstRemote()
      );
      const pairing = this.#manager.requestPairing(body?.token);

      if (pairing === null) {
        writeJson(response, 401, { error: "Pairing code is invalid or expired" });
        return;
      }

      this.#expiresAt = pairing.expiresAt;
      this.#qrDataUrl = null;
      if (shouldAutoApprove) {
        this.#manager.approvePending();
        this.#expiresAt = null;
      }
      this.#publishStatus();
      writeJson(response, 202, { requestId: pairing.requestId });
      return;
    }

    const pairingMatch = method === "GET"
      ? /^\/api\/pair\/([A-Za-z0-9_-]+)$/.exec(url.pathname)
      : null;

    if (pairingMatch !== null) {
      const requestId = pairingMatch[1];
      const decision = this.#manager.pairingDecision(requestId);
      this.#publishStatus();
      writeJson(response, 200, decision);
      return;
    }

    if (method === "POST" && url.pathname === "/api/command") {
      if (!isSameOriginPost(request, this.#remoteOrigin)) {
        writeJson(response, 403, { error: "Command origin rejected" });
        return;
      }

      const authorization = request.headers.authorization;
      const token = typeof authorization === "string" && authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : null;

      if (!this.#manager.authorize(token)) {
        writeJson(response, 401, { error: "Remote session expired — rescan the QR code" });
        return;
      }

      const body = await readJsonBody(request);
      const action = parseRemoteAction(body?.action);

      if (action === null) {
        writeJson(response, 400, { error: "Unknown remote action" });
        return;
      }

      this.#onAction(action);
      writeJson(response, 200, { ok: true });
      return;
    }

    if (method === "POST" && url.pathname === "/api/search") {
      if (!isSameOriginPost(request, this.#remoteOrigin)) {
        writeJson(response, 403, { error: "Search origin rejected" });
        return;
      }

      const authorization = request.headers.authorization;
      const token = typeof authorization === "string" && authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : null;

      if (!this.#manager.authorize(token)) {
        writeJson(response, 401, { error: "Remote session expired — rescan the QR code" });
        return;
      }

      const body = await readJsonBody(request);
      const query = normalizeSearchQuery(body?.query);
      if (query === null) {
        writeJson(response, 400, { error: "Search must be between 1 and 120 characters" });
        return;
      }

      await this.#onSearch(query);
      writeJson(response, 200, { ok: true });
      return;
    }

    if (method === "POST" && url.pathname === "/api/pointer") {
      if (!isSameOriginPost(request, this.#remoteOrigin)) {
        writeJson(response, 403, { error: "Pointer origin rejected" });
        return;
      }

      const authorization = request.headers.authorization;
      const token = typeof authorization === "string" && authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : null;

      if (!this.#manager.authorize(token)) {
        writeJson(response, 401, { error: "Remote session expired — rescan the QR code" });
        return;
      }

      const body = await readJsonBody(request);
      const input = parseRemotePointerInput(body);
      if (input === null) {
        writeJson(response, 400, { error: "Pointer input is outside the safe boundary" });
        return;
      }

      const now = Date.now();
      if (now - this.#lastPointerAt < MIN_POINTER_INTERVAL_MS) {
        writeJson(response, 200, {
          ok: true,
          snapChanged: false,
          snapped: false,
          textEntryAvailable: false,
          throttled: true
        });
        return;
      }
      this.#lastPointerAt = now;

      const result = await this.#onPointer(input);
      writeJson(response, 200, { ok: true, ...result });
      return;
    }

    if (method === "POST" && url.pathname === "/api/disconnect") {
      if (!isSameOriginPost(request, this.#remoteOrigin)) {
        writeJson(response, 403, { error: "Disconnect origin rejected" });
        return;
      }

      const authorization = request.headers.authorization;
      const token = typeof authorization === "string" && authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : null;

      if (!this.#manager.revoke(token)) {
        writeJson(response, 401, { error: "Remote session is already disconnected" });
        return;
      }

      this.#publishStatus();
      writeJson(response, 200, { ok: true });
      void this.ensurePairing().catch(() => undefined);
      return;
    }

    writeJson(response, 404, { error: "Not found" });
  }

  #publishStatus(): void {
    this.#onStatusChanged(this.status);
  }
}
