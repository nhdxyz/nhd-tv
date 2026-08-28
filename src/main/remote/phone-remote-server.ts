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
  RemoteControlContext,
  RemotePointerInput,
  RemotePointerResult,
  RemoteServiceShortcut,
  RemoteStatus,
  RemoteTextInput
} from "../contracts";
import { normalizeSearchQuery } from "../security/navigation-policy";
import {
  PairingManager,
  parseRemoteAction,
  parseRemotePointerInput,
  parseRemoteTextInput
} from "./pairing-manager";
import { REMOTE_CSS, REMOTE_HTML, REMOTE_JS } from "./remote-assets";
import type { TailscaleSecureRemoteResult } from "./tailscale-secure-remote";
import {
  MAX_VOICE_AUDIO_BYTES,
  MAX_VOICE_AUDIO_DURATION_MS,
  MIN_VOICE_AUDIO_DURATION_MS,
  type VoiceAudioClip
} from "../voice/openai-voice-client";

const MAX_JSON_BYTES = 4_096;
const MIN_COMMAND_INTERVAL_MS = 24;
const MIN_POINTER_INTERVAL_MS = 16;
const MIN_VOICE_INTERVAL_MS = 1_000;
const VOICE_AUDIO_TYPES = new Set([
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a"
]);
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
  onAction: (action: RemoteAction) =>
    { detail?: string; handled: boolean } |
    Promise<{ detail?: string; handled: boolean }>;
  onPointer: (input: RemotePointerInput) => RemotePointerResult | Promise<RemotePointerResult>;
  onPrepareSecureAccess?: (localPort: number) =>
    TailscaleSecureRemoteResult |
    Promise<TailscaleSecureRemoteResult>;
  onGetContext: () => RemoteControlContext | Promise<RemoteControlContext>;
  onGetVoiceStatus?: () => PhoneRemoteVoiceStatus | Promise<PhoneRemoteVoiceStatus>;
  onGetRecentServices: () =>
    readonly RemoteServiceShortcut[] |
    Promise<readonly RemoteServiceShortcut[]>;
  onLaunchService: (serviceId: string) => boolean | Promise<boolean>;
  onSearch: (query: string) => void | Promise<void>;
  onStatusChanged: (status: RemoteStatus) => void;
  onText: (input: RemoteTextInput) => boolean | Promise<boolean>;
  onConfirmVoice?: (confirmationId: string) =>
    PhoneRemoteVoiceResult |
    Promise<PhoneRemoteVoiceResult>;
  onVoiceActivity?: (activity: PhoneRemoteVoiceActivity) => void | Promise<void>;
  onVoice?: (clip: VoiceAudioClip) => PhoneRemoteVoiceResult | Promise<PhoneRemoteVoiceResult>;
  shouldAutoApproveFirstRemote: () => boolean;
}

export type PhoneRemoteVoiceActivity = "cancelled" | "listening" | "understanding";

export interface PhoneRemoteVoiceResult {
  confirmationId?: string;
  detail: string;
  outcome: "completed" | "confirmation-required" | "failed";
  transcript?: string;
}

export interface PhoneRemoteVoiceStatus {
  available: boolean;
  detail: string;
}

export interface VoiceUploadMetadata {
  durationMs: number;
  mimeType: string;
}

export function parsePhoneRemoteVoiceActivity(
  value: Record<string, unknown> | null
): PhoneRemoteVoiceActivity | null {
  if (
    value === null ||
    Object.keys(value).some((key) => key !== "phase") ||
    (value.phase !== "cancelled" &&
      value.phase !== "listening" &&
      value.phase !== "understanding")
  ) {
    return null;
  }
  return value.phase;
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

function setSecurityHeaders(response: ServerResponse, microphoneAllowed: boolean): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Security-Policy", REMOTE_CSP);
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader(
    "Permissions-Policy",
    microphoneAllowed
      ? "camera=(), microphone=(self), geolocation=()"
      : "camera=(), microphone=(), geolocation=()"
  );
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

export function secureRemoteHeadersAllowMicrophone(
  headers: IncomingHttpHeaders,
  expectedOrigin: string | null
): boolean {
  if (expectedOrigin === null) {
    return false;
  }

  try {
    const origin = new URL(expectedOrigin);
    return origin.protocol === "https:" &&
      headers.host?.toLowerCase() === origin.host.toLowerCase();
  } catch {
    return false;
  }
}

export function parseVoiceUploadMetadata(
  headers: IncomingHttpHeaders,
  expectedOrigin: string | null
): VoiceUploadMetadata | null {
  if (
    !secureRemoteHeadersAllowMicrophone(headers, expectedOrigin) ||
    headers.origin !== expectedOrigin
  ) {
    return null;
  }

  const rawContentType = headers["content-type"];
  const mimeType = typeof rawContentType === "string"
    ? rawContentType.split(";", 1)[0]?.trim().toLowerCase() ?? ""
    : "";
  const rawDuration = headers["x-nhd-tv-audio-duration-ms"];
  const durationMs = typeof rawDuration === "string" && /^\d{1,6}$/.test(rawDuration)
    ? Number(rawDuration)
    : Number.NaN;
  const rawContentLength = headers["content-length"];
  const contentLength = typeof rawContentLength === "string" && /^\d+$/.test(rawContentLength)
    ? Number(rawContentLength)
    : null;

  if (
    !VOICE_AUDIO_TYPES.has(mimeType) ||
    !Number.isInteger(durationMs) ||
    durationMs < MIN_VOICE_AUDIO_DURATION_MS ||
    durationMs > MAX_VOICE_AUDIO_DURATION_MS ||
    (contentLength !== null && (contentLength < 1 || contentLength > MAX_VOICE_AUDIO_BYTES))
  ) {
    return null;
  }
  return { durationMs, mimeType };
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

async function readVoiceBody(request: IncomingMessage): Promise<Uint8Array | null> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let tooLarge = false;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_VOICE_AUDIO_BYTES) {
      tooLarge = true;
      chunks.length = 0;
      continue;
    }
    if (!tooLarge) {
      chunks.push(buffer);
    }
  }

  return tooLarge || totalBytes === 0 ? null : new Uint8Array(Buffer.concat(chunks));
}

export class PhoneRemoteServer {
  readonly #manager = new PairingManager();
  readonly #onAction: PhoneRemoteServerOptions["onAction"];
  readonly #onGetContext: PhoneRemoteServerOptions["onGetContext"];
  readonly #onGetVoiceStatus: PhoneRemoteServerOptions["onGetVoiceStatus"];
  readonly #onPointer: PhoneRemoteServerOptions["onPointer"];
  readonly #onPrepareSecureAccess: PhoneRemoteServerOptions["onPrepareSecureAccess"];
  readonly #onGetRecentServices: PhoneRemoteServerOptions["onGetRecentServices"];
  readonly #onLaunchService: PhoneRemoteServerOptions["onLaunchService"];
  readonly #onSearch: PhoneRemoteServerOptions["onSearch"];
  readonly #onStatusChanged: PhoneRemoteServerOptions["onStatusChanged"];
  readonly #onText: PhoneRemoteServerOptions["onText"];
  readonly #onConfirmVoice: PhoneRemoteServerOptions["onConfirmVoice"];
  readonly #onVoiceActivity: PhoneRemoteServerOptions["onVoiceActivity"];
  readonly #onVoice: PhoneRemoteServerOptions["onVoice"];
  readonly #shouldAutoApproveFirstRemote: PhoneRemoteServerOptions["shouldAutoApproveFirstRemote"];
  #expiresAt: number | null = null;
  #lastCommandAt = 0;
  #lastPointerAt = 0;
  #lastVoiceAt = 0;
  #networkAddress: string | null = null;
  #qrDataUrl: string | null = null;
  #remoteOrigin: string | null = null;
  #secureAccess: TailscaleSecureRemoteResult = {
    detail: "Secure phone voice has not been prepared yet.",
    origin: null,
    state: "unavailable"
  };
  #server: Server | null = null;
  #voiceInFlight = false;

  constructor(options: PhoneRemoteServerOptions) {
    this.#onAction = options.onAction;
    this.#onGetContext = options.onGetContext;
    this.#onGetVoiceStatus = options.onGetVoiceStatus;
    this.#onGetRecentServices = options.onGetRecentServices;
    this.#onLaunchService = options.onLaunchService;
    this.#onPointer = options.onPointer;
    this.#onPrepareSecureAccess = options.onPrepareSecureAccess;
    this.#onSearch = options.onSearch;
    this.#onStatusChanged = options.onStatusChanged;
    this.#onText = options.onText;
    this.#onConfirmVoice = options.onConfirmVoice;
    this.#onVoiceActivity = options.onVoiceActivity;
    this.#onVoice = options.onVoice;
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
      const secure = this.#secureAccess.state === "ready";
      return {
        connectedControllers: this.#manager.connectedControllers,
        detail: secure
          ? "Scan the secure QR code with a phone connected to this Tailscale network."
          : `Scan the QR code on this trusted local network. ${this.#secureAccess.detail}`,
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

    const lanOrigin = `http://${this.#networkAddress}:${address.port}`;
    try {
      this.#secureAccess = await this.#onPrepareSecureAccess?.(address.port) ?? {
        detail: "Tailscale secure access is not configured for this build.",
        origin: null,
        state: "unavailable"
      };
    } catch {
      this.#secureAccess = {
        detail: "Tailscale secure access could not be prepared.",
        origin: null,
        state: "error"
      };
    }
    this.#remoteOrigin = this.#secureAccess.state === "ready" && this.#secureAccess.origin !== null
      ? this.#secureAccess.origin
      : lanOrigin;
    const offer = this.#manager.beginPairing();
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
    this.#secureAccess = {
      detail: "Secure phone voice has not been prepared yet.",
      origin: null,
      state: "unavailable"
    };

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
    setSecurityHeaders(
      response,
      secureRemoteHeadersAllowMicrophone(request.headers, this.#remoteOrigin)
    );
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

    if (method === "GET" && url.pathname === "/api/apps") {
      const authorization = request.headers.authorization;
      const token = typeof authorization === "string" && authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : null;

      if (!this.#authorize(token)) {
        writeJson(response, 401, { error: "Remote session expired — rescan the QR code" });
        return;
      }

      const [services, context] = await Promise.all([
        this.#onGetRecentServices(),
        this.#onGetContext()
      ]);
      writeJson(response, 200, {
        context,
        services: [...services].slice(0, 3),
        voice: await this.#voiceStatus(request)
      });
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

      if (!this.#authorize(token)) {
        writeJson(response, 401, { error: "Remote session expired — rescan the QR code" });
        return;
      }

      if (!this.#acceptCommand()) {
        writeJson(response, 429, { error: "Commands are arriving too quickly" });
        return;
      }

      const body = await readJsonBody(request);
      const action = parseRemoteAction(body?.action);

      if (action === null) {
        writeJson(response, 400, { error: "Unknown remote action" });
        return;
      }

      const result = await this.#onAction(action);
      writeJson(response, 200, { context: await this.#onGetContext(), ok: true, ...result });
      return;
    }

    if (method === "POST" && url.pathname === "/api/launch") {
      if (!isSameOriginPost(request, this.#remoteOrigin)) {
        writeJson(response, 403, { error: "App launch origin rejected" });
        return;
      }

      const authorization = request.headers.authorization;
      const token = typeof authorization === "string" && authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : null;
      if (!this.#authorize(token)) {
        writeJson(response, 401, { error: "Remote session expired — rescan the QR code" });
        return;
      }
      if (!this.#acceptCommand()) {
        writeJson(response, 429, { error: "Commands are arriving too quickly" });
        return;
      }

      const body = await readJsonBody(request);
      if (
        body === null ||
        Object.keys(body).some((key) => key !== "serviceId") ||
        typeof body.serviceId !== "string"
      ) {
        writeJson(response, 400, { error: "A recent app id is required" });
        return;
      }

      if (!await this.#onLaunchService(body.serviceId)) {
        writeJson(response, 409, { error: "That app is no longer in Recent Apps" });
        return;
      }

      writeJson(response, 200, {
        context: await this.#onGetContext(),
        handled: true,
        ok: true
      });
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

      if (!this.#authorize(token)) {
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
      writeJson(response, 200, { context: await this.#onGetContext(), ok: true });
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

      if (!this.#authorize(token)) {
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
      if (
        input.phase === "move" &&
        now - this.#lastPointerAt < MIN_POINTER_INTERVAL_MS
      ) {
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

    if (method === "POST" && url.pathname === "/api/text") {
      if (!isSameOriginPost(request, this.#remoteOrigin)) {
        writeJson(response, 403, { error: "Text-entry origin rejected" });
        return;
      }

      const authorization = request.headers.authorization;
      const token = typeof authorization === "string" && authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : null;

      if (!this.#authorize(token)) {
        writeJson(response, 401, { error: "Remote session expired — rescan the QR code" });
        return;
      }

      const body = await readJsonBody(request);
      const input = parseRemoteTextInput(body);
      if (input === null) {
        writeJson(response, 400, { error: "Remote text must be at most 120 safe characters" });
        return;
      }

      if (!await this.#onText(input)) {
        writeJson(response, 409, { error: "Select a supported search box on the TV first" });
        return;
      }

      writeJson(response, 200, { context: await this.#onGetContext(), ok: true });
      return;
    }

    if (method === "POST" && url.pathname === "/api/heartbeat") {
      if (!isSameOriginPost(request, this.#remoteOrigin)) {
        writeJson(response, 403, { error: "Heartbeat origin rejected" });
        return;
      }

      const authorization = request.headers.authorization;
      const token = typeof authorization === "string" && authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : null;

      if (!this.#authorize(token)) {
        writeJson(response, 401, { error: "Remote session expired — rescan the QR code" });
        return;
      }

      const body = await readJsonBody(request);
      if (body === null || Object.keys(body).length !== 0) {
        writeJson(response, 400, { error: "Heartbeat body must be empty" });
        return;
      }

      writeJson(response, 200, {
        context: await this.#onGetContext(),
        ok: true,
        voice: await this.#voiceStatus(request)
      });
      return;
    }

    if (method === "POST" && url.pathname === "/api/voice/activity") {
      if (
        !isSameOriginPost(request, this.#remoteOrigin) ||
        !secureRemoteHeadersAllowMicrophone(request.headers, this.#remoteOrigin)
      ) {
        writeJson(response, 403, { error: "Voice activity rejected" });
        return;
      }

      const authorization = request.headers.authorization;
      const token = typeof authorization === "string" && authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : null;
      if (!this.#authorize(token)) {
        writeJson(response, 401, { error: "Remote session expired — rescan the QR code" });
        return;
      }

      const activity = parsePhoneRemoteVoiceActivity(await readJsonBody(request));
      if (activity === null) {
        writeJson(response, 400, { error: "A valid voice activity phase is required" });
        return;
      }
      if (this.#onVoiceActivity === undefined) {
        writeJson(response, 503, { error: "Voice activity is unavailable" });
        return;
      }
      if (activity !== "cancelled") {
        const voiceStatus = await this.#voiceStatus(request);
        if (!voiceStatus.available) {
          writeJson(response, 503, { error: voiceStatus.detail });
          return;
        }
      }
      await this.#onVoiceActivity(activity);
      writeJson(response, 200, { ok: true });
      return;
    }

    if (method === "POST" && url.pathname === "/api/voice") {
      const metadata = parseVoiceUploadMetadata(request.headers, this.#remoteOrigin);
      if (metadata === null) {
        writeJson(response, 403, { error: "Voice upload rejected" });
        return;
      }

      const authorization = request.headers.authorization;
      const token = typeof authorization === "string" && authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : null;
      if (!this.#authorize(token)) {
        writeJson(response, 401, { error: "Remote session expired — rescan the QR code" });
        return;
      }
      const voiceStatus = await this.#voiceStatus(request);
      if (!voiceStatus.available || this.#onVoice === undefined) {
        writeJson(response, 503, { error: voiceStatus.detail });
        return;
      }
      const now = Date.now();
      if (this.#voiceInFlight || now - this.#lastVoiceAt < MIN_VOICE_INTERVAL_MS) {
        writeJson(response, 429, { error: "A voice command is already being processed" });
        return;
      }

      this.#lastVoiceAt = now;
      this.#voiceInFlight = true;
      try {
        const bytes = await readVoiceBody(request);
        if (bytes === null) {
          writeJson(response, 413, { error: "The voice recording is empty or too large" });
          return;
        }
        const result = await this.#onVoice({ bytes, ...metadata });
        writeJson(response, result.outcome === "failed" ? 422 : 200, result);
      } finally {
        this.#voiceInFlight = false;
      }
      return;
    }

    if (method === "POST" && url.pathname === "/api/voice/confirm") {
      if (
        !isSameOriginPost(request, this.#remoteOrigin) ||
        !secureRemoteHeadersAllowMicrophone(request.headers, this.#remoteOrigin)
      ) {
        writeJson(response, 403, { error: "Voice confirmation rejected" });
        return;
      }

      const authorization = request.headers.authorization;
      const token = typeof authorization === "string" && authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : null;
      if (!this.#authorize(token)) {
        writeJson(response, 401, { error: "Remote session expired — rescan the QR code" });
        return;
      }
      if (this.#onConfirmVoice === undefined) {
        writeJson(response, 503, { error: "Voice confirmation is unavailable" });
        return;
      }

      const body = await readJsonBody(request);
      if (
        body === null ||
        Object.keys(body).some((key) => key !== "confirmationId") ||
        typeof body.confirmationId !== "string" ||
        !/^[A-Za-z0-9_-]{16,128}$/.test(body.confirmationId)
      ) {
        writeJson(response, 400, { error: "A valid voice confirmation is required" });
        return;
      }
      const result = await this.#onConfirmVoice(body.confirmationId);
      writeJson(response, result.outcome === "failed" ? 422 : 200, result);
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

  async #voiceStatus(request: IncomingMessage): Promise<PhoneRemoteVoiceStatus> {
    if (!secureRemoteHeadersAllowMicrophone(request.headers, this.#remoteOrigin)) {
      return {
        available: false,
        detail: "Voice control requires the secure Tailscale remote."
      };
    }
    return await this.#onGetVoiceStatus?.() ?? {
      available: false,
      detail: "Voice control is not configured for this build."
    };
  }

  #acceptCommand(): boolean {
    const now = Date.now();
    if (now - this.#lastCommandAt < MIN_COMMAND_INTERVAL_MS) {
      return false;
    }
    this.#lastCommandAt = now;
    return true;
  }

  #authorize(token: unknown): boolean {
    const before = this.#manager.connectedControllers;
    if (!this.#manager.authorize(token)) {
      return false;
    }

    if (before === 0 && this.#manager.connectedControllers > 0) {
      if (!this.#manager.hasPendingRequest) {
        this.#manager.cancelPairingOffer();
        this.#expiresAt = null;
        this.#qrDataUrl = null;
      }
      this.#publishStatus();
    }
    return true;
  }
}
