import type { VoiceVerifiedActionKind } from "./voice-context-store";
import type {
  VoiceSemanticControlRequest,
  VoiceSemanticControlResult
} from "./voice-semantic-control";

export interface VoiceSemanticControlOutcome {
  detail: string;
  handled: boolean;
}

function duration(seconds: number): string {
  const absolute = Math.abs(seconds);
  if (absolute % 3_600 === 0) {
    const hours = absolute / 3_600;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (absolute % 60 === 0) {
    const minutes = absolute / 60;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${absolute} second${absolute === 1 ? "" : "s"}`;
}

function playbackRate(rate: number): string {
  return rate === 1 ? "normal speed" : `${rate}\u00d7`;
}

function actionDescription(request: VoiceSemanticControlRequest): string {
  switch (request.action) {
    case "seek-relative":
      return request.offsetSeconds > 0
        ? `skip forward ${duration(request.offsetSeconds)}`
        : `go back ${duration(request.offsetSeconds)}`;
    case "seek-absolute":
      return `go to ${duration(request.positionSeconds)}`;
    case "set-playback-rate":
      return `set playback speed to ${playbackRate(request.playbackRate)}`;
    case "shuffle-on": return "turn shuffle on";
    case "shuffle-off": return "turn shuffle off";
    case "repeat-all": return "repeat all";
    case "repeat-one": return "repeat one";
    case "repeat-off": return "turn repeat off";
    case "restart": return "restart playback";
    case "next": return "go to the next item";
    case "previous": return "go to the previous item";
    case "skip-intro": return "skip the intro";
    case "skip-recap": return "skip the recap";
    case "skip-ad": return "skip the ad";
    case "captions-on": return "turn captions on";
    case "captions-off": return "turn captions off";
    case "fullscreen-enter": return "enter full screen";
    case "fullscreen-exit": return "exit full screen";
  }
}

function successDetail(request: VoiceSemanticControlRequest, complete: boolean): string {
  switch (request.action) {
    case "seek-relative":
      return request.offsetSeconds > 0
        ? `Skipped forward ${duration(request.offsetSeconds)}.`
        : `Went back ${duration(request.offsetSeconds)}.`;
    case "seek-absolute":
      return complete
        ? `Playback is already at ${duration(request.positionSeconds)}.`
        : `Moved playback to ${duration(request.positionSeconds)}.`;
    case "set-playback-rate":
      if (complete) return `Playback is already at ${playbackRate(request.playbackRate)}.`;
      return request.playbackRate === 1
        ? "Restored normal playback speed."
        : `Set playback speed to ${playbackRate(request.playbackRate)}.`;
    case "shuffle-on": return complete ? "Shuffle is already on." : "Turned shuffle on.";
    case "shuffle-off": return complete ? "Shuffle is already off." : "Turned shuffle off.";
    case "repeat-all": return complete ? "Repeat all is already on." : "Set repeat to all.";
    case "repeat-one": return complete ? "Repeat one is already on." : "Set repeat to one.";
    case "repeat-off": return complete ? "Repeat is already off." : "Turned repeat off.";
    case "restart": return complete ? "Playback is already at the beginning." : "Restarted playback.";
    case "next": return "Started the next item.";
    case "previous": return "Started the previous item.";
    case "skip-intro": return "Skipped the intro.";
    case "skip-recap": return "Skipped the recap.";
    case "skip-ad": return "Skipped the ad.";
    case "captions-on": return complete ? "Captions are already on." : "Turned captions on.";
    case "captions-off": return complete ? "Captions are already off." : "Turned captions off.";
    case "fullscreen-enter": return complete ? "Playback is already full screen." : "Entered full screen.";
    case "fullscreen-exit": return complete ? "Playback is already out of full screen." : "Exited full screen.";
  }
}

export function voiceSemanticControlOutcome(
  request: VoiceSemanticControlRequest,
  result: VoiceSemanticControlResult,
  serviceName: string
): VoiceSemanticControlOutcome {
  if (result === "complete" || result === "verified") {
    return { detail: successDetail(request, result === "complete"), handled: true };
  }
  const description = actionDescription(request);
  if (result === "acted") {
    return {
      detail: `Sent a request to ${description} in ${serviceName}.`,
      handled: true
    };
  }
  return result === "unsupported"
    ? {
      detail: `${serviceName} does not support the command to ${description}.`,
      handled: false
    }
    : {
      detail: `I couldn't find a safe way to ${description} in ${serviceName} right now.`,
      handled: false
    };
}

export function verifiedActionForSemanticControl(
  request: VoiceSemanticControlRequest
): VoiceVerifiedActionKind {
  switch (request.action) {
    case "seek-relative":
    case "seek-absolute": return "seek";
    case "set-playback-rate": return "playback-rate";
    case "shuffle-on":
    case "shuffle-off": return "shuffle";
    case "repeat-all":
    case "repeat-one":
    case "repeat-off": return "repeat";
    case "restart": return "restart";
    case "next": return "next";
    case "previous": return "previous";
    case "skip-intro": return "skip-intro";
    case "skip-recap": return "skip-recap";
    case "skip-ad": return "skip-ad";
    case "captions-on": return "captions-on";
    case "captions-off": return "captions-off";
    case "fullscreen-enter": return "fullscreen-enter";
    case "fullscreen-exit": return "fullscreen-exit";
  }
}
