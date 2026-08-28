import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { IPC_CHANNELS, type VoicePresentationState } from "../src/main/contracts";
import {
  createVoicePresentationState,
  MAX_VOICE_PRESENTATION_CHOICES,
  MAX_VOICE_PRESENTATION_CHOICE_PRIMARY_LENGTH,
  MAX_VOICE_PRESENTATION_TRANSCRIPT_LENGTH,
  remainingVoiceTranscriptDisplayMilliseconds,
  sanitizeVoicePresentationChoices,
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
      choices: [{ id: "stale", ordinal: 1, primaryLabel: "Stale result" }],
      detail: "stale",
      transcript: "stale"
    })).toEqual({ detail: null, phase: "hidden", transcript: null });
    expect(createVoicePresentationState("confirmation", {
      choices: [{ id: "stale", ordinal: 1, primaryLabel: "Stale result" }],
      detail: "Confirm this?"
    })).toEqual({
      detail: "Confirm this?",
      phase: "confirmation",
      transcript: null
    });
  });

  it("bounds clarification choices to a closed sanitized display schema", () => {
    const primaryLabel = "A".repeat(MAX_VOICE_PRESENTATION_CHOICE_PRIMARY_LENGTH + 20);
    expect(sanitizeVoicePresentationChoices([
      {
        id: "candidate:apollo-13",
        ordinal: 1,
        primaryLabel,
        secondaryLabel: "  Movie\u202e   · 1995  "
      },
      {
        id: "candidate:breaking-bad",
        ordinal: 2,
        primaryLabel: "Breaking Bad",
        secondaryLabel: "TV series · 2008"
      },
      {
        id: "candidate:duplicate-ordinal",
        ordinal: 2,
        primaryLabel: "Duplicate"
      },
      {
        id: "candidate:not-inspected",
        ordinal: 3,
        primaryLabel: "Fourth result"
      }
    ])).toEqual([
      {
        id: "candidate:apollo-13",
        ordinal: 1,
        primaryLabel: `${"A".repeat(MAX_VOICE_PRESENTATION_CHOICE_PRIMARY_LENGTH - 1)}…`,
        secondaryLabel: "Movie · 1995"
      },
      {
        id: "candidate:breaking-bad",
        ordinal: 2,
        primaryLabel: "Breaking Bad",
        secondaryLabel: "TV series · 2008"
      }
    ]);
    expect(MAX_VOICE_PRESENTATION_CHOICES).toBe(3);

    expect(sanitizeVoicePresentationChoices([
      {
        id: "https://example.com/watch/1",
        ordinal: 1,
        primaryLabel: "URL identity"
      },
      {
        html: "<strong>Injected</strong>",
        id: "candidate:extra-property",
        ordinal: 2,
        primaryLabel: "Arbitrary property"
      }
    ])).toEqual([]);

    expect(createVoicePresentationState("clarification", {
      choices: [
        { id: "movie:it-2017", ordinal: 1, primaryLabel: "It", secondaryLabel: "Movie · 2017" },
        { id: "movie:it-1990", ordinal: 2, primaryLabel: "It", secondaryLabel: "Miniseries · 1990" }
      ],
      detail: "Which version of It?",
      transcript: "must not survive"
    })).toEqual({
      choices: [
        { id: "movie:it-2017", ordinal: 1, primaryLabel: "It", secondaryLabel: "Movie · 2017" },
        { id: "movie:it-1990", ordinal: 2, primaryLabel: "It", secondaryLabel: "Miniseries · 1990" }
      ],
      detail: "Which version of It?",
      phase: "clarification",
      transcript: null
    });
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
      choices: [{ id: "movie:it-2017", ordinal: 1, primaryLabel: "It" }],
      detail: "Which version of It?",
      phase: "clarification",
      transcript: null
    })).toEqual({ copy: "Which version of It?", label: "Choose one" });
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
    expect(preload).toContain("function isVoicePresentationChoice");
    expect(preload).toContain('candidate.phase === "clarification"');
    expect(preload).toContain("if (isVoicePresentationState(presentation)) callback(presentation)");
    expect(preload).toContain("onVoicePresentationChanged");
    expect(preload).not.toContain("getVoicePresentation");

    const render = renderer.slice(renderer.indexOf("function renderVoicePresentation"));
    expect(render.slice(0, 4_500)).toContain(".textContent = copy.label");
    expect(render.slice(0, 4_500)).toContain(".textContent = copy.copy");
    expect(render.slice(0, 4_500)).toContain("ordinal.textContent = String(choice.ordinal)");
    expect(render.slice(0, 4_500)).toContain("primary.textContent = choice.primaryLabel");
    expect(render.slice(0, 4_500)).toContain("secondary.textContent = choice.secondaryLabel");
    expect(render.slice(0, 4_500)).not.toContain("innerHTML");
    expect(renderer).toContain("VOICE_PRESENTATION_FAILSAFE_MS = 150_000");
  });

  it("provides a non-blocking accessible TV surface", () => {
    expect(html).toContain('id="voice-presentation"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain('id="voice-presentation-choices"');
    expect(html).toContain('aria-label="Choices"');
    expect(css).toContain(".voice-presentation");
    expect(css).toContain("pointer-events: none");
    expect(css).toContain("-webkit-line-clamp: 3");
    expect(css).toContain("grid-template-columns: 3.7rem minmax(0, 1fr)");
    expect(css).toContain("font-size: clamp(1.18rem, 2vw, 1.5rem)");
    expect(css).toContain('.voice-presentation[data-phase="listening"]');
    expect(css).toContain('.voice-presentation[data-phase="clarification"]');
    expect(css).toContain('.voice-presentation[data-phase="confirmation"]');
    expect(css).toContain('.voice-presentation[data-phase="error"]');
  });

  it("accepts only closed voice activity events from the paired phone", () => {
    const commandId = "voice-command-test-1234";
    expect(parsePhoneRemoteVoiceActivity({ commandId, phase: "reserved" }))
      .toEqual({ commandId, phase: "reserved" });
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
