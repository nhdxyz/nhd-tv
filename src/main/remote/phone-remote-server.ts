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
  RemoteTextInput,
  VoicePresentationChoice
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
import { VoiceConfirmationReplayCache } from "./voice-confirmation-replay";
import {
  VoiceActivityLease,
  VOICE_COMMAND_ID_PATTERN,
  type VoiceActivityEvent
} from "./voice-activity-lease";
import {
  VoiceOperationCancelledError,
  VoiceOperationRegistry,
  type VoiceOperationHandle
} from "./voice-operation-registry";
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
const VOICE_CONFIRMATION_TTL_MS = 30_000;
const VOICE_CONFIRMATION_REPLAY_TTL_MS = 120_000;
const VOICE_CONFIRMATION_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const VOICE_COMMAND_OPERATION_TIMEOUT_MS = 60_000;
const VOICE_CONFIRM_OPERATION_TIMEOUT_MS = 60_000;
const VOICE_UPLOAD_BODY_TIMEOUT_MS = 15_000;
const VOICE_DISCONNECT_CONFIRM_GRACE_MS = 5_000;
const VOICE_CANCELLATION_SETTLE_MS = 1_000;
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
  onCancelVoice?: (confirmationId: string, commandId: string) =>
    boolean |
    Promise<boolean>;
  onConfirmVoice?: (
    confirmationId: string,
    commandId: string,
    signal: AbortSignal
  ) =>
    PhoneRemoteVoiceResult |
    Promise<PhoneRemoteVoiceResult>;
  onVoiceActivity?: (
    activity: PhoneRemoteVoiceActivity,
    controllerId: string
  ) => void | Promise<void>;
  onVoice?: (
    clip: VoiceAudioClip,
    commandId: string,
    signal: AbortSignal,
    confirmationId: string | null
  ) => PhoneRemoteVoiceResult | Promise<PhoneRemoteVoiceResult>;
  onVoiceTimeout?: (commandId: string) => void | Promise<void>;
  shouldAutoApproveFirstRemote: () => boolean;
}

export type PhoneRemoteVoiceActivity = VoiceActivityEvent;

export interface PhoneRemoteVoiceResult {
  choices?: readonly VoicePresentationChoice[];
  confirmationId?: string;
  confirmationExpiresAt?: number;
  detail: string;
  outcome: "completed" | "confirmation-required" | "failed";
  transcript?: string;
}

export interface PhoneRemoteVoiceStatus {
  available: boolean;
  busy: boolean;
  detail: string;
}

export interface VoiceUploadMetadata {
  commandId: string;
  confirmationId: string | null;
  durationMs: number;
  mimeType: string;
}

interface PendingVoiceConfirmationBinding {
  commandId: string;
  controllerId: string;
  expiresAt: number;
}

interface VoiceConfirmationExecutionResponse {
  result: PhoneRemoteVoiceResult;
  statusCode: number;
}

function parseVoiceConfirmationId(
  value: Record<string, unknown> | null
): string | null {
  if (
    value === null ||
    Object.keys(value).some((key) => key !== "confirmationId") ||
    typeof value.confirmationId !== "string" ||
    !VOICE_CONFIRMATION_ID_PATTERN.test(value.confirmationId)
  ) {
    return null;
  }
  return value.confirmationId;
}

export function parseVoiceOperationId(
  value: Record<string, unknown> | null
): string | null {
  if (
    value === null ||
    Object.keys(value).some((key) => key !== "operationId") ||
    typeof value.operationId !== "string" ||
    (!VOICE_COMMAND_ID_PATTERN.test(value.operationId) &&
      !VOICE_CONFIRMATION_ID_PATTERN.test(value.operationId))
  ) {
    return null;
  }
  return value.operationId;
}

export function parseDisconnectVoiceConfirmationId(
  value: Record<string, unknown> | null
): string | null | undefined {
  if (
    value === null ||
    Object.keys(value).some((key) => key !== "confirmationId")
  ) {
    return undefined;
  }
  if (value.confirmationId === undefined) return null;
  return typeof value.confirmationId === "string" &&
    VOICE_CONFIRMATION_ID_PATTERN.test(value.confirmationId)
    ? value.confirmationId
    : undefined;
}

export function parsePhoneRemoteVoiceActivity(
  value: Record<string, unknown> | null
): PhoneRemoteVoiceActivity | null {
  if (
    value === null ||
    Object.keys(value).some((key) => key !== "commandId" && key !== "phase") ||
    typeof value.commandId !== "string" ||
    !VOICE_COMMAND_ID_PATTERN.test(value.commandId) ||
    (value.phase !== "cancelled" &&
      value.phase !== "reserved" &&
      value.phase !== "listening" &&
      value.phase !== "understanding")
  ) {
    return null;
  }
  return { commandId: value.commandId, phase: value.phase };
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
  const rawCommandId = headers["x-nhd-tv-voice-command-id"];
  const commandId = typeof rawCommandId === "string" && VOICE_COMMAND_ID_PATTERN.test(rawCommandId)
    ? rawCommandId
    : null;
  const rawConfirmationId = headers["x-nhd-tv-voice-confirmation-id"];
  const confirmationId = rawConfirmationId === undefined
    ? null
    : typeof rawConfirmationId === "string" &&
        VOICE_CONFIRMATION_ID_PATTERN.test(rawConfirmationId)
      ? rawConfirmationId
      : undefined;

  if (
    commandId === null ||
    confirmationId === undefined ||
    !VOICE_AUDIO_TYPES.has(mimeType) ||
    !Number.isInteger(durationMs) ||
    durationMs < MIN_VOICE_AUDIO_DURATION_MS ||
    durationMs > MAX_VOICE_AUDIO_DURATION_MS ||
    (contentLength !== null && (contentLength < 1 || contentLength > MAX_VOICE_AUDIO_BYTES))
  ) {
    return null;
  }
  return { commandId, confirmationId, durationMs, mimeType };
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

function voiceAbortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new VoiceOperationCancelledError();
}

async function waitForVoiceSignal<T>(value: T | Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw voiceAbortReason(signal);
  let abortHandler: (() => void) | null = null;
  const aborted = new Promise<never>((_resolve, reject) => {
    abortHandler = () => reject(voiceAbortReason(signal));
    signal.addEventListener("abort", abortHandler, { once: true });
  });
  try {
    return await Promise.race([Promise.resolve(value), aborted]);
  } finally {
    if (abortHandler !== null) signal.removeEventListener("abort", abortHandler);
  }
}

async function voiceOperationFinishedWithin(
  operation: VoiceOperationHandle,
  timeoutMs: number
): Promise<boolean> {
  let timeout: NodeJS.Timeout | null = null;
  const deadline = new Promise<false>((resolve) => {
    timeout = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([operation.finished.then(() => true as const), deadline]);
  } finally {
    if (timeout !== null) clearTimeout(timeout);
  }
}

export async function readVoiceBody(
  request: IncomingMessage,
  timeoutMs = VOICE_UPLOAD_BODY_TIMEOUT_MS,
  signal?: AbortSignal
): Promise<Uint8Array | null> {
  if (signal?.aborted) throw voiceAbortReason(signal);
  let timeout: NodeJS.Timeout | null = null;
  let abortHandler: (() => void) | null = null;
  const read = (async () => {
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
  })();
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      const error = new VoiceUploadBodyTimeoutError();
      reject(error);
      request.destroy(error);
    }, timeoutMs);
  });
  const aborted = signal === undefined
    ? null
    : new Promise<never>((_resolve, reject) => {
      abortHandler = () => {
        const error = voiceAbortReason(signal);
        reject(error);
        request.destroy(error);
      };
      signal.addEventListener("abort", abortHandler, { once: true });
    });

  try {
    return await Promise.race(aborted === null ? [read, deadline] : [read, deadline, aborted]);
  } finally {
    if (timeout !== null) clearTimeout(timeout);
    if (signal !== undefined && abortHandler !== null) {
      signal.removeEventListener("abort", abortHandler);
    }
  }
}

class VoiceUploadBodyTimeoutError extends Error {
  constructor() {
    super("Voice upload body timed out");
    this.name = "VoiceUploadBodyTimeoutError";
  }
}

export class VoiceOperationTimeoutError extends Error {
  constructor() {
    super("Voice operation timed out");
    this.name = "VoiceOperationTimeoutError";
  }
}

export async function runVoiceOperationWithDeadline<T>(
  operation: (signal: AbortSignal) => T | Promise<T>,
  timeoutMs: number,
  controller = new AbortController()
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("A positive voice operation timeout is required");
  }
  if (controller.signal.aborted) throw voiceAbortReason(controller.signal);
  let timeout: NodeJS.Timeout | null = null;
  let abortHandler: (() => void) | null = null;
  const aborted = new Promise<never>((_resolve, reject) => {
    abortHandler = () => reject(voiceAbortReason(controller.signal));
    controller.signal.addEventListener("abort", abortHandler, { once: true });
  });
  timeout = setTimeout(() => {
    controller.abort(new VoiceOperationTimeoutError());
  }, timeoutMs);

  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      aborted
    ]);
  } finally {
    if (timeout !== null) clearTimeout(timeout);
    if (abortHandler !== null) controller.signal.removeEventListener("abort", abortHandler);
  }
}

export class PhoneRemoteServer {
  readonly #manager = new PairingManager();
  readonly #voiceActivityLease = new VoiceActivityLease();
  readonly #voiceOperations = new VoiceOperationRegistry();
  readonly #pendingVoiceConfirmations = new Map<string, PendingVoiceConfirmationBinding>();
  readonly #voiceConfirmationReplays =
    new VoiceConfirmationReplayCache<VoiceConfirmationExecutionResponse>(
      VOICE_CONFIRMATION_REPLAY_TTL_MS
    );
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
  readonly #onCancelVoice: PhoneRemoteServerOptions["onCancelVoice"];
  readonly #onConfirmVoice: PhoneRemoteServerOptions["onConfirmVoice"];
  readonly #onVoiceActivity: PhoneRemoteServerOptions["onVoiceActivity"];
  readonly #onVoice: PhoneRemoteServerOptions["onVoice"];
  readonly #onVoiceTimeout: PhoneRemoteServerOptions["onVoiceTimeout"];
  readonly #shouldAutoApproveFirstRemote: PhoneRemoteServerOptions["shouldAutoApproveFirstRemote"];
  readonly #deferredVoiceDisconnects = new Set<string>();
  readonly #deferredDisconnectConfirmationIds = new Map<string, string>();
  readonly #deferredDisconnectTimers = new Map<string, NodeJS.Timeout>();
  readonly #disconnectingControllers = new Set<string>();
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
    this.#onCancelVoice = options.onCancelVoice;
    this.#onConfirmVoice = options.onConfirmVoice;
    this.#onVoiceActivity = options.onVoiceActivity;
    this.#onVoice = options.onVoice;
    this.#onVoiceTimeout = options.onVoiceTimeout;
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
    this.#voiceActivityLease.reset();
    this.#voiceOperations.reset();
    this.#pendingVoiceConfirmations.clear();
    this.#voiceConfirmationReplays.clear();
    this.#deferredVoiceDisconnects.clear();
    this.#deferredDisconnectConfirmationIds.clear();
    for (const timeout of this.#deferredDisconnectTimers.values()) clearTimeout(timeout);
    this.#deferredDisconnectTimers.clear();
    this.#disconnectingControllers.clear();
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
        if (response.destroyed || response.writableEnded) {
          return;
        }
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
      const controllerId = this.#authorizeController(token);
      if (controllerId === null) {
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
      if (activity.phase !== "cancelled") {
        const voiceStatus = await this.#voiceStatus(request);
        if (!voiceStatus.available) {
          writeJson(response, 503, { error: voiceStatus.detail });
          return;
        }
      }
      if (
        activity.phase === "reserved" &&
        (this.#voiceOperations.busy || Date.now() - this.#lastVoiceAt < MIN_VOICE_INTERVAL_MS)
      ) {
        writeJson(response, 409, { error: "Another voice command is already active" });
        return;
      }
      const decision = this.#voiceActivityLease.acceptActivity(controllerId, activity);
      if (decision === "busy") {
        writeJson(response, 409, { error: "Another voice command is already active" });
        return;
      }
      if (decision === "ignored") {
        writeJson(response, 200, { ignored: true, ok: true });
        return;
      }
      if (activity.phase !== "reserved") {
        await this.#onVoiceActivity(activity, controllerId);
      }
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
      const controllerId = this.#authorizeController(token);
      if (controllerId === null) {
        writeJson(response, 401, { error: "Remote session expired — rescan the QR code" });
        return;
      }
      if (
        metadata.confirmationId !== null &&
        this.#voiceConfirmationForController(metadata.confirmationId, controllerId) === null
      ) {
        writeJson(response, 410, {
          error: "That voice confirmation expired — hold the microphone and try again"
        });
        return;
      }
      if (this.#voiceOperations.isCancelled(controllerId, metadata.commandId)) {
        writeJson(response, 409, {
          code: "voice_cancelled",
          error: "Voice command cancelled"
        });
        return;
      }
      const voiceStatus = await this.#voiceStatus(request);
      if (this.#voiceOperations.isCancelled(controllerId, metadata.commandId)) {
        writeJson(response, 409, {
          code: "voice_cancelled",
          error: "Voice command cancelled"
        });
        return;
      }
      if (!voiceStatus.available || this.#onVoice === undefined) {
        writeJson(response, 503, { error: voiceStatus.detail });
        return;
      }
      const now = Date.now();
      if (this.#voiceOperations.busy || now - this.#lastVoiceAt < MIN_VOICE_INTERVAL_MS) {
        writeJson(response, 429, { error: "A voice command is already being processed" });
        return;
      }
      if (!this.#voiceActivityLease.beginUpload(controllerId, metadata.commandId)) {
        if (this.#voiceOperations.isCancelled(controllerId, metadata.commandId)) {
          writeJson(response, 409, {
            code: "voice_cancelled",
            error: "Voice command cancelled"
          });
        } else {
          writeJson(response, 409, { error: "This voice recording is no longer active" });
        }
        return;
      }
      const operation = this.#voiceOperations.begin({
        commandId: metadata.commandId,
        confirmationId: metadata.confirmationId,
        controllerId,
        kind: "command",
        operationId: metadata.commandId
      });
      if (operation === null) {
        this.#voiceActivityLease.finishUpload(controllerId, metadata.commandId);
        writeJson(response, 429, { error: "A voice command is already being processed" });
        return;
      }
      this.#lastVoiceAt = now;

      try {
        // Upload can overtake the phone's fire-and-forget "understanding"
        // activity request. End capture-only side effects at this authenticated,
        // command-bound boundary so AI processing never remains muted.
        await waitForVoiceSignal(this.#onVoiceActivity?.({
          commandId: metadata.commandId,
          phase: "understanding"
        }, controllerId), operation.controller.signal);

        if (metadata.confirmationId === null) {
          await waitForVoiceSignal(
            this.#cancelAllVoiceConfirmations(),
            operation.controller.signal
          );
        } else {
          await waitForVoiceSignal(
            this.#cancelAllVoiceConfirmations(metadata.confirmationId),
            operation.controller.signal
          );
        }
        let bytes: Uint8Array | null;
        try {
          bytes = await readVoiceBody(
            request,
            VOICE_UPLOAD_BODY_TIMEOUT_MS,
            operation.controller.signal
          );
        } catch (error) {
          if (error instanceof VoiceUploadBodyTimeoutError) {
            await this.#publishVoiceCancellation(metadata.commandId, controllerId);
            if (!response.destroyed && !response.writableEnded) {
              writeJson(response, 408, { error: "The voice upload timed out" });
            }
            return;
          }
          throw error;
        }
        if (bytes === null) {
          await this.#onVoiceActivity?.({
            commandId: metadata.commandId,
            phase: "cancelled"
          }, controllerId);
          writeJson(response, 413, { error: "The voice recording is empty or too large" });
          return;
        }
        let result: PhoneRemoteVoiceResult;
        try {
          result = await runVoiceOperationWithDeadline(
            (signal) => this.#onVoice?.({
              bytes,
              durationMs: metadata.durationMs,
              mimeType: metadata.mimeType
            }, metadata.commandId, signal, metadata.confirmationId) ?? Promise.resolve({
              detail: "Voice control is unavailable.",
              outcome: "failed" as const
            }),
            VOICE_COMMAND_OPERATION_TIMEOUT_MS,
            operation.controller
          );
        } catch (error) {
          if (error instanceof VoiceOperationTimeoutError) {
            this.#publishVoiceTimeout(metadata.commandId);
            if (!response.destroyed && !response.writableEnded) {
              writeJson(response, 504, {
                detail: "The voice command timed out before it could finish.",
                outcome: "failed"
              } satisfies PhoneRemoteVoiceResult);
            }
            return;
          }
          throw error;
        }
        if (metadata.confirmationId !== null) {
          this.#pendingVoiceConfirmations.delete(metadata.confirmationId);
        }
        let responseResult = result;
        if (
          result.outcome === "confirmation-required" &&
          result.confirmationId !== undefined &&
          VOICE_CONFIRMATION_ID_PATTERN.test(result.confirmationId)
        ) {
          if (this.#manager.authorizeController(token) !== controllerId) {
            await this.#notifyVoiceConfirmationCancelled(
              result.confirmationId,
              metadata.commandId
            );
            if (!response.destroyed && !response.writableEnded) {
              writeJson(response, 401, {
                error: "Remote disconnected before voice confirmation was ready"
              });
            }
            return;
          }
          const confirmationExpiresAt = this.#bindVoiceConfirmation(
            result.confirmationId,
            controllerId,
            metadata.commandId
          );
          responseResult = { ...result, confirmationExpiresAt };
        }
        if (!response.destroyed && !response.writableEnded) {
          writeJson(response, responseResult.outcome === "failed" ? 422 : 200, responseResult);
        }
      } catch (error) {
        if (error instanceof VoiceOperationCancelledError) {
          this.#lastVoiceAt = 0;
          if (metadata.confirmationId !== null) {
            this.#pendingVoiceConfirmations.delete(metadata.confirmationId);
            await this.#notifyVoiceConfirmationCancelled(
              metadata.confirmationId,
              metadata.commandId
            );
          }
          await this.#publishVoiceCancellation(metadata.commandId, controllerId);
          if (!response.destroyed && !response.writableEnded) {
            writeJson(response, 409, {
              code: "voice_cancelled",
              error: "Voice command cancelled"
            });
          }
          return;
        }
        throw error;
      } finally {
        await this.#finishVoiceOperation(operation);
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
      const controllerId = this.#manager.authorizeController(token);
      if (controllerId === null) {
        writeJson(response, 401, { error: "Remote session expired — rescan the QR code" });
        return;
      }
      if (this.#onConfirmVoice === undefined) {
        writeJson(response, 503, { error: "Voice confirmation is unavailable" });
        return;
      }

      const confirmationId = parseVoiceConfirmationId(await readJsonBody(request));
      if (confirmationId === null) {
        writeJson(response, 400, { error: "A valid voice confirmation is required" });
        return;
      }
      const deferredConfirmationId = this.#deferredDisconnectConfirmationIds.get(controllerId);
      const disconnecting = this.#disconnectingControllers.has(controllerId);
      const replay = this.#voiceConfirmationReplays.get(confirmationId, controllerId);
      if (replay !== null && (!disconnecting || deferredConfirmationId === confirmationId)) {
        const cached = await replay;
        writeJson(response, cached.statusCode, cached.result);
        return;
      }
      if (disconnecting && deferredConfirmationId !== confirmationId) {
        writeJson(response, 401, { error: "Remote session is disconnecting" });
        return;
      }
      const binding = this.#voiceConfirmationForController(confirmationId, controllerId);
      if (binding === null) {
        writeJson(response, 410, {
          error: "That voice confirmation expired — hold the microphone and try again"
        });
        return;
      }
      if (
        this.#voiceOperations.busy ||
        !this.#voiceActivityLease.beginBoundOperation(controllerId, binding.commandId)
      ) {
        writeJson(response, 409, { error: "Another voice command is already active" });
        return;
      }
      const operation = this.#voiceOperations.begin({
        commandId: binding.commandId,
        confirmationId,
        controllerId,
        kind: "confirmation",
        operationId: confirmationId
      });
      if (operation === null) {
        this.#voiceActivityLease.finishUpload(controllerId, binding.commandId);
        writeJson(response, 409, { error: "Another voice command is already active" });
        return;
      }

      this.#pendingVoiceConfirmations.delete(confirmationId);
      const execution = (async (): Promise<VoiceConfirmationExecutionResponse> => {
        try {
          const result = await runVoiceOperationWithDeadline(
            (signal) => this.#onConfirmVoice?.(
              confirmationId,
              binding.commandId,
              signal
            ) ?? Promise.resolve({
              detail: "Voice confirmation is unavailable.",
              outcome: "failed" as const
            }),
            VOICE_CONFIRM_OPERATION_TIMEOUT_MS,
            operation.controller
          );
          return {
            result,
            statusCode: result.outcome === "failed" ? 422 : 200
          };
        } catch (error) {
          if (error instanceof VoiceOperationTimeoutError) {
            this.#publishVoiceTimeout(binding.commandId);
            return {
              result: {
                detail: "Playback did not start before the voice confirmation timed out.",
                outcome: "failed"
              },
              statusCode: 504
            };
          }
          if (error instanceof VoiceOperationCancelledError) {
            this.#lastVoiceAt = 0;
            await this.#publishVoiceCancellation(binding.commandId, controllerId);
            return {
              result: {
                detail: "Voice command cancelled.",
                outcome: "failed"
              },
              statusCode: 409
            };
          }
          return {
            result: {
              detail: "Voice confirmation could not be completed.",
              outcome: "failed"
            },
            statusCode: 422
          };
        } finally {
          await this.#finishVoiceOperation(operation);
        }
      })();
      this.#voiceConfirmationReplays.set(confirmationId, controllerId, execution);
      const completed = await execution;
      if (!response.destroyed && !response.writableEnded) {
        writeJson(response, completed.statusCode, completed.result);
      }
      return;
    }

    if (method === "POST" && url.pathname === "/api/voice/cancel") {
      if (
        !isSameOriginPost(request, this.#remoteOrigin) ||
        !secureRemoteHeadersAllowMicrophone(request.headers, this.#remoteOrigin)
      ) {
        writeJson(response, 403, { error: "Voice cancellation rejected" });
        return;
      }

      const authorization = request.headers.authorization;
      const token = typeof authorization === "string" && authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : null;
      const controllerId = this.#authorizeController(token);
      if (controllerId === null) {
        writeJson(response, 401, { error: "Remote session expired — rescan the QR code" });
        return;
      }
      const operationId = parseVoiceOperationId(await readJsonBody(request));
      if (operationId === null) {
        writeJson(response, 400, { error: "A valid active voice operation is required" });
        return;
      }

      let cancellation = this.#voiceOperations.cancel(controllerId, operationId);
      if (
        cancellation.state === "not-active" &&
        this.#voiceActivityLease.cancelPendingUpload(controllerId, operationId)
      ) {
        cancellation = this.#voiceOperations.cancel(controllerId, operationId, {
          acceptPending: true
        });
      }
      if (cancellation.state === "not-owner") {
        writeJson(response, 403, { error: "Only the phone that started voice can cancel it" });
        return;
      }
      if (cancellation.state === "not-active") {
        writeJson(response, 409, { error: "That voice command already finished" });
        return;
      }
      if (cancellation.state === "already-cancelled") {
        writeJson(response, 200, { cancelled: true, ok: true, ready: true });
        return;
      }
      if (cancellation.state === "accepted-pending") {
        await this.#publishVoiceCancellation(operationId, controllerId);
        writeJson(response, 200, {
          cancelled: true,
          ok: true,
          preemptive: true,
          ready: true
        });
        return;
      }
      if (cancellation.operation === null) {
        writeJson(response, 409, { error: "That voice command is no longer active" });
        return;
      }

      const ready = await voiceOperationFinishedWithin(
        cancellation.operation,
        VOICE_CANCELLATION_SETTLE_MS
      );
      writeJson(response, ready ? 200 : 202, { cancelled: true, ok: true, ready });
      return;
    }

    if (method === "POST" && url.pathname === "/api/voice/confirm/cancel") {
      if (
        !isSameOriginPost(request, this.#remoteOrigin) ||
        !secureRemoteHeadersAllowMicrophone(request.headers, this.#remoteOrigin)
      ) {
        writeJson(response, 403, { error: "Voice confirmation cancellation rejected" });
        return;
      }

      const authorization = request.headers.authorization;
      const token = typeof authorization === "string" && authorization.startsWith("Bearer ")
        ? authorization.slice("Bearer ".length)
        : null;
      const controllerId = this.#authorizeController(token);
      if (controllerId === null) {
        writeJson(response, 401, { error: "Remote session expired — rescan the QR code" });
        return;
      }
      if (this.#onCancelVoice === undefined) {
        writeJson(response, 503, { error: "Voice confirmation cancellation is unavailable" });
        return;
      }

      const confirmationId = parseVoiceConfirmationId(await readJsonBody(request));
      if (confirmationId === null) {
        writeJson(response, 400, { error: "A valid voice confirmation is required" });
        return;
      }
      const binding = this.#voiceConfirmationForController(confirmationId, controllerId);
      if (binding === null) {
        writeJson(response, 410, {
          error: "That voice confirmation has already expired"
        });
        return;
      }

      this.#pendingVoiceConfirmations.delete(confirmationId);
      await this.#onCancelVoice(confirmationId, binding.commandId);
      writeJson(response, 200, { ok: true });
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

      const controllerId = this.#manager.authorizeController(token);
      if (controllerId === null) {
        writeJson(response, 401, { error: "Remote session is already disconnected" });
        return;
      }
      const confirmationId = parseDisconnectVoiceConfirmationId(await readJsonBody(request));
      if (confirmationId === undefined) {
        this.#disconnectingControllers.add(controllerId);
        await this.#completeControllerDisconnect(controllerId);
        writeJson(response, 400, { error: "Disconnect body is invalid" });
        return;
      }
      if (this.#disconnectingControllers.has(controllerId)) {
        writeJson(response, 202, { deferred: true, ok: true });
        return;
      }
      const activeVoiceOperation = this.#voiceOperations.active;
      if (activeVoiceOperation?.controllerId === controllerId) {
        this.#deferControllerDisconnect(
          controllerId,
          activeVoiceOperation.confirmationId === confirmationId
            ? confirmationId ?? undefined
            : undefined
        );
        writeJson(response, 202, { deferred: true, ok: true });
        return;
      }
      if (
        confirmationId !== null &&
        this.#voiceConfirmationForController(confirmationId, controllerId) !== null
      ) {
        this.#deferControllerDisconnect(controllerId, confirmationId);
        writeJson(response, 202, { deferred: true, ok: true });
        return;
      }

      this.#disconnectingControllers.add(controllerId);
      await this.#completeControllerDisconnect(controllerId);
      writeJson(response, 200, { ok: true });
      return;
    }

    writeJson(response, 404, { error: "Not found" });
  }

  async #completeControllerDisconnect(controllerId: string): Promise<void> {
    const graceTimer = this.#deferredDisconnectTimers.get(controllerId);
    if (graceTimer !== undefined) clearTimeout(graceTimer);
    this.#deferredDisconnectTimers.delete(controllerId);
    this.#deferredDisconnectConfirmationIds.delete(controllerId);
    this.#deferredVoiceDisconnects.delete(controllerId);
    this.#disconnectingControllers.delete(controllerId);
    this.#voiceConfirmationReplays.deleteController(controllerId);
    this.#manager.revokeControllerId(controllerId);
    await this.#cancelVoiceConfirmationsForController(controllerId);
    const releasedCommandId = this.#voiceActivityLease.releaseControllerCommand(controllerId);
    if (releasedCommandId !== null) {
      await this.#onVoiceActivity?.({
        commandId: releasedCommandId,
        phase: "cancelled"
      }, controllerId);
    }
    this.#publishStatus();
    void this.ensurePairing().catch(() => undefined);
  }

  #deferControllerDisconnect(
    controllerId: string,
    confirmationId?: string
  ): void {
    this.#disconnectingControllers.add(controllerId);
    this.#deferredVoiceDisconnects.add(controllerId);
    if (confirmationId === undefined) return;

    this.#deferredDisconnectConfirmationIds.set(controllerId, confirmationId);
    this.#scheduleDeferredDisconnectCompletion(controllerId);
  }

  #scheduleDeferredDisconnectCompletion(controllerId: string): void {
    const existingTimer = this.#deferredDisconnectTimers.get(controllerId);
    if (existingTimer !== undefined) clearTimeout(existingTimer);
    const timer = setTimeout(() => {
      this.#deferredDisconnectTimers.delete(controllerId);
      if (this.#voiceOperations.active?.controllerId === controllerId) return;
      this.#deferredDisconnectConfirmationIds.delete(controllerId);
      void this.#completeControllerDisconnect(controllerId);
    }, VOICE_DISCONNECT_CONFIRM_GRACE_MS);
    this.#deferredDisconnectTimers.set(controllerId, timer);
  }

  async #finishVoiceOperation(operation: VoiceOperationHandle): Promise<void> {
    const { commandId, confirmationId: activeConfirmationId, controllerId } = operation;
    this.#voiceActivityLease.finishUpload(controllerId, commandId);
    if (!this.#voiceOperations.finish(operation)) return;
    if (!this.#deferredVoiceDisconnects.has(controllerId)) return;

    const deferredConfirmationId = this.#deferredDisconnectConfirmationIds.get(controllerId);
    if (
      activeConfirmationId !== null &&
      deferredConfirmationId === activeConfirmationId
    ) {
      this.#scheduleDeferredDisconnectCompletion(controllerId);
      return;
    }
    this.#deferredVoiceDisconnects.delete(controllerId);
    await this.#completeControllerDisconnect(controllerId);
  }

  #bindVoiceConfirmation(
    confirmationId: string,
    controllerId: string,
    commandId: string
  ): number {
    this.#cleanupVoiceConfirmations();
    this.#voiceConfirmationReplays.delete(confirmationId);
    this.#pendingVoiceConfirmations.delete(confirmationId);
    const expiresAt = Date.now() + VOICE_CONFIRMATION_TTL_MS;
    this.#pendingVoiceConfirmations.set(confirmationId, {
      commandId,
      controllerId,
      expiresAt
    });
    return expiresAt;
  }

  async #cancelAllVoiceConfirmations(
    preservedConfirmationId: string | null = null
  ): Promise<void> {
    this.#cleanupVoiceConfirmations();
    const pending = [...this.#pendingVoiceConfirmations.entries()]
      .filter(([confirmationId]) => confirmationId !== preservedConfirmationId);
    for (const [confirmationId] of pending) {
      this.#pendingVoiceConfirmations.delete(confirmationId);
    }
    for (const [confirmationId, binding] of pending) {
      await this.#notifyVoiceConfirmationCancelled(confirmationId, binding.commandId);
    }
  }

  async #cancelVoiceConfirmationsForController(controllerId: string): Promise<void> {
    this.#cleanupVoiceConfirmations();
    const matches = [...this.#pendingVoiceConfirmations.entries()]
      .filter(([, binding]) => binding.controllerId === controllerId);
    for (const [confirmationId, binding] of matches) {
      this.#pendingVoiceConfirmations.delete(confirmationId);
      await this.#notifyVoiceConfirmationCancelled(confirmationId, binding.commandId);
    }
  }

  #cleanupVoiceConfirmations(): void {
    const now = Date.now();
    for (const [confirmationId, binding] of this.#pendingVoiceConfirmations) {
      if (binding.expiresAt <= now) {
        this.#pendingVoiceConfirmations.delete(confirmationId);
      }
    }
  }

  async #notifyVoiceConfirmationCancelled(
    confirmationId: string,
    commandId: string
  ): Promise<void> {
    try {
      await this.#onCancelVoice?.(confirmationId, commandId);
    } catch {
      // Confirmation invalidation must not make a new recording or disconnect fail.
    }
  }

  async #publishVoiceCancellation(commandId: string, controllerId: string): Promise<void> {
    try {
      await this.#onVoiceActivity?.({ commandId, phase: "cancelled" }, controllerId);
    } catch {
      // Cancellation must still release the exact operation and activity lease.
    }
  }

  #publishVoiceTimeout(commandId: string): void {
    try {
      void Promise.resolve(this.#onVoiceTimeout?.(commandId)).catch(() => undefined);
    } catch {
      // The operation deadline must always release the shared voice lease.
    }
  }

  #voiceConfirmationForController(
    confirmationId: string,
    controllerId: string
  ): PendingVoiceConfirmationBinding | null {
    this.#cleanupVoiceConfirmations();
    const binding = this.#pendingVoiceConfirmations.get(confirmationId);
    return binding?.controllerId === controllerId ? binding : null;
  }

  #publishStatus(): void {
    this.#onStatusChanged(this.status);
  }

  async #voiceStatus(request: IncomingMessage): Promise<PhoneRemoteVoiceStatus> {
    if (!secureRemoteHeadersAllowMicrophone(request.headers, this.#remoteOrigin)) {
      return {
        available: false,
        busy: false,
        detail: "Voice control requires the secure Tailscale remote."
      };
    }
    const status = await this.#onGetVoiceStatus?.() ?? {
      available: false,
      busy: false,
      detail: "Voice control is not configured for this build."
    };
    return {
      ...status,
      busy: this.#voiceOperations.busy ||
        this.#voiceActivityLease.busy ||
        Date.now() - this.#lastVoiceAt < MIN_VOICE_INTERVAL_MS
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
    return this.#authorizeController(token) !== null;
  }

  #authorizeController(token: unknown): string | null {
    const before = this.#manager.connectedControllers;
    const controllerId = this.#manager.authorizeController(token);
    if (controllerId === null || this.#disconnectingControllers.has(controllerId)) return null;

    if (before === 0 && this.#manager.connectedControllers > 0) {
      if (!this.#manager.hasPendingRequest) {
        this.#manager.cancelPairingOffer();
        this.#expiresAt = null;
        this.#qrDataUrl = null;
      }
      this.#publishStatus();
    }
    return controllerId;
  }
}
