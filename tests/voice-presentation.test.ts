import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IPC_CHANNELS, type VoicePresentationState } from "../src/main/contracts";
import {
  createVoicePresentationState,
  MAX_VOICE_PRESENTATION_TRANSCRIPT_LENGTH,
  remainingVoiceTranscriptDisplayMilliseconds,
  sanitizeVoicePresentationText
} from "../src/main/voice/voice-presentation";
import { parsePhoneRemoteVoiceActivity } from "../src/main/remote/phone-remote-server";
import { voicePresentationCopy } from "../src/renderer/voice-presentation";

const html = readFileSync(new URL("../src/renderer/index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/renderer/style.css", import.meta.url), "utf8");
const renderer = readFileSync(new URL("../src/renderer/index.ts", import.meta.url), "utf8");
const preload = readFileSync(new URL("../src/main/shell-preload.ts", import.meta.url), "utf8");
const remoteServer = readFileSync(
  new URL("../src/main/remote/phone-remote-server.ts", import.meta.url),
  "utf8"
);

describe("TV voice presentation", () => {
  it("sanitizes control and bidirectional text and bounds the ephemeral transcript", () => {
    expect(sanitizeVoicePresentationText(
      "  Play\u0000   Breaking\u202e Bad\nnow  ",
      80
    )).toBe("Play Breaking Bad now");

    const longTranscript = "🎬".repeat(MAX_VOICE_PRESENTATION_TRANSCRIPT_LENGTH + 20);
    const sanitized = sanitizeVoicePresentationText(
      longTranscript,
      MAX_VOICE_PRESENTATION_TRANSCRIPT_LENGTH
    );
    expect(Array.from(sanitized ?? "")).toHaveLength(MAX_VOICE_PRESENTATION_TRANSCRIPT_LENGTH);
    expect(sanitized?.endsWith("…")).toBe(true);
  });

  it("never carries a transcript into non-transcript phases", () => {
    expect(createVoicePresentationState("understanding", {
      detail: "Understanding…",
      transcript: "should not survive"
    })).toEqual({
      detail: "Understanding…",
      phase: "understanding",
      transcript: null
    });
    expect(createVoicePresentationState("hidden", {
      detail: "stale",
      transcript: "stale"
    })).toEqual({ detail: null, phase: "hidden", transcript: null });
  });

  it("keeps a final transcript readable without delaying command execution", () => {
    expect(remainingVoiceTranscriptDisplayMilliseconds("transcript", 1_000, 1_100, 1_400))
      .toBe(1_300);
    expect(remainingVoiceTranscriptDisplayMilliseconds("transcript", 1_000, 2_500, 1_400))
      .toBe(0);
    expect(remainingVoiceTranscriptDisplayMilliseconds("success", 1_000, 1_100, 1_400))
      .toBe(0);
  });

  it("renders honest phase copy without implying live partial transcription", () => {
    const transcript: VoicePresentationState = {
      detail: "You said",
      phase: "transcript",
      transcript: "Play the latest Cody Ko video"
    };
    expect(voicePresentationCopy(transcript)).toEqual({
      copy: "“Play the latest Cody Ko video”",
      label: "You said"
    });
    expect(voicePresentationCopy({
      detail: "Listening…",
      phase: "listening",
      transcript: null
    })).toEqual({ copy: "Listening…", label: "AI Voice" });
    expect(voicePresentationCopy({
      detail: "Confirm on your phone — Play Breaking Bad?",
      phase: "confirmation",
      transcript: null
    })).toEqual({
      copy: "Confirm on your phone — Play Breaking Bad?",
      label: "Confirm on phone"
    });
  });

  it("exposes one validated event channel and renders only through textContent", () => {
    expect(IPC_CHANNELS.voicePresentationChanged).toBe("nhd:voice:presentation:changed");
    expect(preload).toContain("function isVoicePresentationState");
    expect(preload).toContain("if (isVoicePresentationState(presentation)) callback(presentation)");
    expect(preload).toContain("onVoicePresentationChanged");
    expect(preload).not.toContain("getVoicePresentation");

    const render = renderer.slice(renderer.indexOf("function renderVoicePresentation"));
    expect(render.slice(0, 2_200)).toContain(".textContent = copy.label");
    expect(render.slice(0, 2_200)).toContain(".textContent = copy.copy");
    expect(render.slice(0, 2_200)).not.toContain("innerHTML");
    expect(render.slice(0, 2_200)).toContain("75_000");
  });

  it("provides a non-blocking accessible TV surface", () => {
    expect(html).toContain('id="voice-presentation"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
    expect(css).toContain(".voice-presentation");
    expect(css).toContain("pointer-events: none");
    expect(css).toContain('.voice-presentation[data-phase="listening"]');
    expect(css).toContain('.voice-presentation[data-phase="confirmation"]');
    expect(css).toContain('.voice-presentation[data-phase="error"]');
  });

  it("accepts only closed voice activity events from the paired phone", () => {
    const commandId = "voice-command-test-1234";
    expect(parsePhoneRemoteVoiceActivity({ commandId, phase: "listening" }))
      .toEqual({ commandId, phase: "listening" });
    expect(parsePhoneRemoteVoiceActivity({ commandId, phase: "understanding" }))
      .toEqual({ commandId, phase: "understanding" });
    expect(parsePhoneRemoteVoiceActivity({ commandId, phase: "cancelled" }))
      .toEqual({ commandId, phase: "cancelled" });
    expect(parsePhoneRemoteVoiceActivity({ commandId, phase: "partial", transcript: "untrusted" }))
      .toBeNull();
    expect(parsePhoneRemoteVoiceActivity({ commandId, phase: "listening", extra: true })).toBeNull();
    expect(parsePhoneRemoteVoiceActivity({ commandId: "short", phase: "listening" })).toBeNull();

    const endpoint = remoteServer.slice(remoteServer.indexOf('url.pathname === "/api/voice/activity"'));
    expect(endpoint.slice(0, 2_500)).toContain("isSameOriginPost(request, this.#remoteOrigin)");
    expect(endpoint.slice(0, 2_500)).toContain("secureRemoteHeadersAllowMicrophone");
    expect(endpoint.slice(0, 2_500)).toContain("this.#authorizeController(token)");
    expect(endpoint.slice(0, 2_500)).toContain("this.#voiceActivityLease.acceptActivity");
    expect(endpoint.slice(0, 2_500)).toContain("voiceStatus.available");
  });
});
