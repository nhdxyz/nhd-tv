import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseDisconnectVoiceConfirmationId,
  parseVoiceUploadMetadata,
  remotePostHeadersAreAllowed,
  secureRemoteHeadersAllowMicrophone,
  shouldAutoApprovePairing
} from "../src/main/remote/phone-remote-server";
import {
  movePrecisionPoint,
  precisionEdgeScroll,
  precisionHorizontalScroll,
  precisionRelativeDelta,
  REMOTE_CSS,
  REMOTE_HTML,
  REMOTE_JS
} from "../src/main/remote/remote-assets";

describe("phone remote boundary", () => {
  const expectedOrigin = "http://192.0.2.10:43123";
  const serverSource = readFileSync(
    new URL("../src/main/remote/phone-remote-server.ts", import.meta.url),
    "utf8"
  );

  it("serves syntactically valid standalone JavaScript", () => {
    expect(() => new Function(REMOTE_JS)).not.toThrow();
  });

  it("requires JSON from the exact QR-code origin", () => {
    expect(remotePostHeadersAreAllowed({
      "content-type": "application/json",
      origin: expectedOrigin
    }, expectedOrigin)).toBe(true);
    expect(remotePostHeadersAreAllowed({
      "content-type": "application/json",
      origin: "http://example.test"
    }, expectedOrigin)).toBe(false);
    expect(remotePostHeadersAreAllowed({
      "content-type": "text/plain",
      origin: expectedOrigin
    }, expectedOrigin)).toBe(false);
    expect(remotePostHeadersAreAllowed({
      "content-type": "application/json",
      origin: expectedOrigin
    }, null)).toBe(false);
  });

  it("enables microphone permission only for the exact secure remote host", () => {
    const secureOrigin = "https://living-room.example.ts.net:8443";
    expect(secureRemoteHeadersAllowMicrophone({
      host: "living-room.example.ts.net:8443"
    }, secureOrigin)).toBe(true);
    expect(secureRemoteHeadersAllowMicrophone({
      host: "living-room.example.ts.net:8443"
    }, expectedOrigin)).toBe(false);
    expect(secureRemoteHeadersAllowMicrophone({ host: "192.0.2.10:43123" }, secureOrigin))
      .toBe(false);
    expect(secureRemoteHeadersAllowMicrophone({
      host: "living-room.example.ts.net:8443",
      "x-forwarded-proto": "https"
    }, null)).toBe(false);
  });

  it("accepts only bounded audio uploads from the exact secure origin", () => {
    const secureOrigin = "https://living-room.example.ts.net:8443";
    const validHeaders = {
      "content-length": "4096",
      "content-type": "audio/webm;codecs=opus",
      host: "living-room.example.ts.net:8443",
      origin: secureOrigin,
      "x-nhd-tv-audio-duration-ms": "2500",
      "x-nhd-tv-voice-command-id": "voice-command-test-1234"
    };
    expect(parseVoiceUploadMetadata(validHeaders, secureOrigin)).toEqual({
      commandId: "voice-command-test-1234",
      confirmationId: null,
      durationMs: 2500,
      mimeType: "audio/webm"
    });
    expect(parseVoiceUploadMetadata({
      ...validHeaders,
      "x-nhd-tv-voice-confirmation-id": "confirmation_token_1234"
    }, secureOrigin)).toMatchObject({
      confirmationId: "confirmation_token_1234"
    });
    expect(parseVoiceUploadMetadata({
      ...validHeaders,
      "x-nhd-tv-voice-confirmation-id": "short"
    }, secureOrigin)).toBeNull();
    expect(parseVoiceUploadMetadata({ ...validHeaders, origin: "https://example.test" }, secureOrigin))
      .toBeNull();
    expect(parseVoiceUploadMetadata({ ...validHeaders, "content-type": "application/octet-stream" }, secureOrigin))
      .toBeNull();
    expect(parseVoiceUploadMetadata({ ...validHeaders, "content-length": String(9 * 1024 * 1024) }, secureOrigin))
      .toBeNull();
    expect(parseVoiceUploadMetadata({ ...validHeaders, "x-nhd-tv-audio-duration-ms": "20001" }, secureOrigin))
      .toBeNull();
    expect(parseVoiceUploadMetadata({
      ...validHeaders,
      "x-nhd-tv-voice-command-id": "short"
    }, secureOrigin)).toBeNull();
  });

  it("auto-approves only the first remote when the device preference allows it", () => {
    expect(shouldAutoApprovePairing(0, true)).toBe(true);
    expect(shouldAutoApprovePairing(0, false)).toBe(false);
    expect(shouldAutoApprovePairing(1, true)).toBe(false);
    expect(shouldAutoApprovePairing(2, true)).toBe(false);
  });

  it("accepts only an exact confirmation binding on unload disconnects", () => {
    expect(parseDisconnectVoiceConfirmationId({})).toBeNull();
    expect(parseDisconnectVoiceConfirmationId({
      confirmationId: "confirmation_token_1234"
    })).toBe("confirmation_token_1234");
    expect(parseDisconnectVoiceConfirmationId({ confirmationId: "short" })).toBeUndefined();
    expect(parseDisconnectVoiceConfirmationId({ extra: true })).toBeUndefined();
    expect(parseDisconnectVoiceConfirmationId(null)).toBeUndefined();
  });

  it("exposes only the bounded search text field and no credential controls", () => {
    expect(() => new Function(REMOTE_JS)).not.toThrow();
    expect(REMOTE_HTML.match(/<input\b/g)).toHaveLength(1);
    expect(REMOTE_HTML).toContain('type="search"');
    expect(REMOTE_HTML).toContain('maxlength="120"');
    expect(REMOTE_HTML).not.toMatch(/type="(?:email|password|tel)"/);
    expect(REMOTE_HTML).not.toContain("textarea");
    expect(REMOTE_JS).not.toContain("innerHTML");
    expect(REMOTE_JS).not.toMatch(/https?:\/\//);
    expect(REMOTE_JS).toContain('await jsonRequest("/api/search"');
    expect(REMOTE_JS).toContain('await jsonRequest("/api/text"');
    expect(REMOTE_JS).toContain('body: JSON.stringify({ submit, text })');
    expect(REMOTE_JS).toContain('fetch("/api/disconnect"');
    expect(REMOTE_JS).toContain('await jsonRequest("/api/heartbeat"');
    expect(REMOTE_JS).toContain('setInterval(() => void sendHeartbeat(), 10_000)');
    expect(REMOTE_JS).toContain('window.addEventListener("pagehide", (event) => {');
    expect(REMOTE_JS).toContain('window.addEventListener("pageshow", (event) => {');
    expect(REMOTE_JS).toContain("if (event.persisted) return;");
    expect(REMOTE_JS).toContain("activeVoiceConfirmationId = confirmationId;");
    expect(REMOTE_JS).toContain("disconnectRemote();");
    expect(REMOTE_JS).toContain("JSON.stringify(confirmationId === null ? {} : { confirmationId })");
    expect(REMOTE_JS).toContain("void sendHeartbeat(true);");
    expect(REMOTE_JS).toContain("state.textContent === stateBeforeRequest");
    expect(serverSource).toContain('url.pathname === "/api/voice/confirm"');
    expect(serverSource).toContain('url.pathname === "/api/voice/confirm/cancel"');
    expect(serverSource).toContain("beginBoundOperation(controllerId, binding.commandId)");
    expect(serverSource).toContain("secureRemoteHeadersAllowMicrophone(request.headers");
    expect(serverSource).toContain("MAX_VOICE_AUDIO_BYTES");
    expect(serverSource).toContain("VOICE_UPLOAD_BODY_TIMEOUT_MS");
    expect(serverSource).toContain("VOICE_COMMAND_OPERATION_TIMEOUT_MS = 60_000");
    expect(serverSource).toContain("VOICE_CONFIRM_OPERATION_TIMEOUT_MS");
    expect(serverSource).toContain("#voiceConfirmationReplays.get(confirmationId, controllerId)");
    expect(serverSource).toContain(
      "#voiceConfirmationReplays.set(confirmationId, controllerId, execution)"
    );
    expect(serverSource).toContain("#disconnectingControllers.has(controllerId)");
    const confirmationRoute = serverSource.slice(
      serverSource.indexOf('url.pathname === "/api/voice/confirm"'),
      serverSource.indexOf('url.pathname === "/api/voice/confirm/cancel"')
    );
    expect(confirmationRoute.indexOf("#voiceConfirmationReplays.get"))
      .toBeLessThan(confirmationRoute.indexOf("if (disconnecting &&"));
    expect(confirmationRoute).toContain(
      "replay !== null && (!disconnecting || deferredConfirmationId === confirmationId)"
    );
    expect(confirmationRoute).toContain("#activeVoiceConfirmationId = confirmationId");
    expect(serverSource).toContain("#activeVoiceConfirmationId === confirmationId");
    expect(serverSource).toContain(
      "deferredConfirmationId === activeConfirmationId"
    );
    expect(serverSource).toContain("#scheduleDeferredDisconnectCompletion(controllerId)");
    expect(serverSource).toContain("await this.#cancelAllVoiceConfirmations()");
    expect(serverSource).toContain("await this.#cancelAllVoiceConfirmations(metadata.confirmationId)");
    expect(serverSource).toContain(
      "this.#voiceConfirmationForController(metadata.confirmationId, controllerId)"
    );
  });

  it("records voice only while the secure push-to-talk control is held", () => {
    expect(REMOTE_HTML).toContain('id="voice-button"');
    expect(REMOTE_HTML).toContain('id="voice-confirm"');
    expect(REMOTE_HTML).toContain('id="voice-confirm-play"');
    expect(REMOTE_JS).toContain("navigator.mediaDevices.getUserMedia");
    expect(REMOTE_JS).toContain("new MediaRecorder(stream");
    expect(REMOTE_JS).toContain('jsonRequest("/api/voice"');
    expect(REMOTE_JS).toContain('jsonRequest("/api/voice/confirm"');
    expect(REMOTE_JS).toContain('jsonRequest("/api/voice/confirm/cancel"');
    expect(REMOTE_JS).toContain("VOICE_CONFIRMATION_REQUEST_TIMEOUT_MS");
    expect(REMOTE_JS).toContain("VOICE_COMMAND_REQUEST_TIMEOUT_MS = 65_000");
    expect(REMOTE_JS).toContain("error.status !== 422 && error.status !== 504");
    expect(REMOTE_JS).toContain("VOICE_CONFIRMATION_REPLAY_TTL_MS");
    expect(REMOTE_JS).toContain("VOICE_CANCELLATION_REQUEST_TIMEOUT_MS");
    expect(REMOTE_JS).toContain("status >= 500 && status !== 504");
    expect(REMOTE_JS).toContain('voiceConfirmPlay.textContent = retry ? "Check result" : "Play"');
    expect(REMOTE_JS).toContain("voiceConfirmCancel.hidden = retry");
    expect(REMOTE_JS).toContain("submitted: true");
    expect(REMOTE_JS).toContain(
      "voiceButton.disabled = !ready || voiceProcessing || awaitingSubmittedResult"
    );
    expect(REMOTE_JS).toContain(
      "Say yes or no, or tap Play or Cancel."
    );
    expect(REMOTE_JS).toContain(
      "Check the playback result before starting another voice command."
    );
    expect(REMOTE_CSS).toContain('.voice-confirm[data-mode="retry"]');
    expect(REMOTE_JS).toContain("keepalive: true");
    expect(REMOTE_JS).toContain("voiceConfirmCancel.disabled = disabled");
    expect(REMOTE_JS).toContain("voiceConfirmPlay.disabled = disabled");
    expect(REMOTE_JS).toContain('fetch("/api/voice/activity"');
    expect(REMOTE_JS).toContain("createVoiceCommandId");
    expect(REMOTE_JS).toContain("JSON.stringify({ commandId, phase })");
    expect(REMOTE_JS).toContain('"X-NHD-TV-Voice-Command-Id": commandId');
    expect(REMOTE_JS).toContain('"X-NHD-TV-Voice-Confirmation-Id": confirmationId');
    expect(REMOTE_JS).toContain("const spokenConfirmationId = pendingVoiceConfirmation?.submitted === true");
    expect(REMOTE_JS).toContain('sendVoiceActivity("listening", false, commandId)');
    expect(REMOTE_JS).toContain('sendVoiceActivity("understanding")');
    expect(REMOTE_JS).toContain('sendVoiceActivity("cancelled"');
    expect(REMOTE_JS).not.toContain(
      'sendVoiceActivity("cancelled", false, createVoiceCommandId())'
    );
    expect(REMOTE_JS).toContain('error.status !== 422');
    expect(REMOTE_JS).toContain(".catch(() => {})");
    expect(REMOTE_JS).toContain("finishVoiceRecording");
    expect(REMOTE_JS).toContain("stopVoiceStream");
    const recorderStart = REMOTE_JS.indexOf("recorder.start(250)");
    const recorderAssignment = REMOTE_JS.indexOf("voiceRecorder = recorder", recorderStart);
    expect(recorderStart).toBeGreaterThan(-1);
    expect(recorderAssignment).toBeGreaterThan(recorderStart);
    expect(REMOTE_JS).not.toContain("const supersededConfirmation = closeVoiceConfirmation()");
    const microphoneCatch = REMOTE_JS.indexOf("} catch (error) {", recorderAssignment);
    expect(REMOTE_JS.slice(microphoneCatch, microphoneCatch + 500))
      .toContain("voiceRecorder = null");
    expect(REMOTE_JS.slice(microphoneCatch, microphoneCatch + 500))
      .toContain("voiceChunks = []");
    expect(REMOTE_JS).toContain("}, 19_500);");
    expect(REMOTE_JS).not.toContain("localStorage");
    expect(REMOTE_JS).not.toMatch(/sessionStorage\.(?:setItem|getItem)\([^)]*(?:audio|voice|transcript)/i);
  });

  it("binds capture side effects to the accepted controller and command lease", () => {
    const activityRoute = serverSource.slice(
      serverSource.indexOf('url.pathname === "/api/voice/activity"'),
      serverSource.indexOf('url.pathname === "/api/voice"')
    );
    const accepted = activityRoute.indexOf(
      "#voiceActivityLease.acceptActivity(controllerId, activity)"
    );
    const notified = activityRoute.indexOf(
      "await this.#onVoiceActivity(activity, controllerId)"
    );
    expect(accepted).toBeGreaterThan(-1);
    expect(notified).toBeGreaterThan(accepted);

    const uploadRoute = serverSource.slice(
      serverSource.indexOf('url.pathname === "/api/voice"'),
      serverSource.indexOf('url.pathname === "/api/voice/confirm"')
    );
    const uploadLease = uploadRoute.indexOf(
      "#voiceActivityLease.beginUpload(controllerId, metadata.commandId)"
    );
    const understanding = uploadRoute.indexOf('phase: "understanding"', uploadLease);
    const bodyRead = uploadRoute.indexOf("bytes = await readVoiceBody(request)", uploadLease);
    expect(uploadLease).toBeGreaterThan(-1);
    expect(understanding).toBeGreaterThan(uploadLease);
    expect(bodyRead).toBeGreaterThan(understanding);
    expect(uploadRoute.slice(understanding, bodyRead)).toContain("controllerId");

    const disconnect = serverSource.slice(
      serverSource.indexOf("async #completeControllerDisconnect"),
      serverSource.indexOf("#deferControllerDisconnect", serverSource.indexOf(
        "async #completeControllerDisconnect"
      ))
    );
    expect(disconnect).toContain("releaseControllerCommand(controllerId)");
    expect(disconnect).toContain('phase: "cancelled"');
    expect(disconnect).toContain("}, controllerId)");
  });

  it("uses a minimalist circular directional surface without selectable arrow copy", () => {
    expect(REMOTE_HTML).toContain('class="up" data-action="up"');
    expect(REMOTE_HTML).toContain('class="left" data-action="left"');
    expect(REMOTE_HTML).toContain('class="right" data-action="right"');
    expect(REMOTE_HTML).toContain('class="down" data-action="down"');
    expect(REMOTE_HTML).not.toMatch(/[↑←→↓]/);
    expect(REMOTE_CSS).toContain(".dpad {");
    expect(REMOTE_CSS).toContain("border-radius: 50%;");
    expect(REMOTE_HTML).not.toContain("Living room");
    expect(REMOTE_HTML).not.toContain(">OK<");
    expect(REMOTE_HTML).not.toContain("↩");
    expect(REMOTE_HTML).not.toContain("⌂");
  });

  it("fills the phone viewport, exposes live context, and keeps system actions in the top corners", () => {
    expect(REMOTE_CSS).toContain("height: 100dvh");
    expect(REMOTE_CSS).toContain(".remote-shell {");
    expect(REMOTE_CSS).toContain("height: 100%;");
    expect(REMOTE_CSS).toContain(".remote-card {");
    expect(REMOTE_CSS).toContain("flex: 1;");
    expect(REMOTE_HTML).toContain('class="remote-top-actions"');
    expect(REMOTE_HTML).toContain('data-action="back" type="button" disabled aria-label="Back. Hold to force return Home"');
    expect(REMOTE_HTML).toContain('data-action="home" type="button" disabled aria-label="NHD Home"');
    expect(REMOTE_HTML.match(/<svg\b/g)).toHaveLength(10);
    expect(REMOTE_HTML).not.toContain(">Back<");
    expect(REMOTE_HTML).toContain('id="active-service-label">NHD Home<');
    expect(REMOTE_HTML).toContain('class="remote-context" aria-live="polite"');
    expect(REMOTE_HTML).toContain('class="brand-wordmark"');
    expect(REMOTE_CSS).toContain("background: #090909;");
    expect(REMOTE_CSS).toContain("border: 2px solid var(--accent);");
    expect(REMOTE_CSS).toContain('body[data-active-service="spotify"]');
    expect(REMOTE_CSS).not.toContain("--accent-glow");
  });

  it("keeps zoom available while reserving gestures on interactive surfaces", () => {
    expect(REMOTE_HTML).toContain("width=device-width, initial-scale=1, viewport-fit=cover");
    expect(REMOTE_HTML).not.toContain("maximum-scale");
    expect(REMOTE_HTML).not.toContain("user-scalable");
    expect(REMOTE_JS).not.toContain('"gesturestart"');
    expect(REMOTE_JS).not.toContain("event.ctrlKey");
    expect(REMOTE_CSS).not.toMatch(/html,\s*body\s*\{[^}]*touch-action:/s);
    expect(REMOTE_CSS).not.toMatch(/\nbutton\s*\{[^}]*touch-action:/s);
    expect(REMOTE_CSS).toMatch(/\.dpad button\s*\{[^}]*touch-action:\s*manipulation;/s);
    expect(REMOTE_CSS).toMatch(/\.voice-button\s*\{[^}]*touch-action:\s*none;/s);
    expect(REMOTE_CSS).toMatch(/\.precision-pad\s*\{[^}]*touch-action:\s*none;/s);
  });

  it("confirms accepted commands with optional haptic feedback", () => {
    const commandRequest = REMOTE_JS.indexOf('await jsonRequest("/api/command"');
    const confirmation = REMOTE_JS.indexOf("confirmCommand(button, !quiet);", commandRequest);

    expect(commandRequest).toBeGreaterThan(-1);
    expect(confirmation).toBeGreaterThan(commandRequest);
    expect(REMOTE_JS).toContain("navigator.vibrate(10)");
  });

  it("exposes accessible media controls and clearly qualifies volume routing", () => {
    for (const action of [
      "play-pause",
      "rewind",
      "fast-forward",
      "volume-down",
      "volume-up",
      "mute"
    ]) {
      expect(REMOTE_HTML).toContain(`data-action="${action}"`);
    }
    expect(REMOTE_HTML).toContain('aria-label="Playback controls"');
    expect(REMOTE_HTML).toContain('aria-label="Volume controls"');
    expect(REMOTE_HTML).toContain('aria-label="Play or pause"');
    expect(REMOTE_HTML).toContain('class="play-pause-icon"');
    expect(REMOTE_HTML).not.toContain("⏯");
    expect(REMOTE_HTML).toContain("TV support varies");
    expect(REMOTE_CSS).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(REMOTE_CSS).toContain(".playback-controls button { min-height: 2.85rem; }");
    expect(REMOTE_CSS).toContain("border-radius: 999px;");
    expect(REMOTE_JS).toContain("error.status = response.status");
    expect(serverSource).toContain("MIN_COMMAND_INTERVAL_MS");
    expect(serverSource).toContain("writeJson(response, 429");
  });

  it("offers a deliberate long-press emergency return without double-sending Back", () => {
    expect(REMOTE_HTML).toContain("Hold to force return Home");
    expect(REMOTE_JS).toContain('sendAction("force-home", button)');
    expect(REMOTE_JS).toContain("backHoldTriggered = true");
    expect(REMOTE_JS).toContain("}, 1_200)");
  });

  it("prevents iPhone text selection outside the intentional search field", () => {
    expect(REMOTE_CSS).toContain("-webkit-touch-callout: none");
    expect(REMOTE_CSS).toContain("-webkit-user-select: none");
    expect(REMOTE_CSS).toContain("-webkit-user-select: text");
    expect(REMOTE_JS).toContain('document.addEventListener("selectstart"');
    expect(REMOTE_JS).toContain('event.target.closest("input") === null');
  });

  it("makes push-to-talk the thumb-zone hero and removes the app launcher", () => {
    const navigationIndex = REMOTE_HTML.indexOf('class="control-surface"');
    const voiceIndex = REMOTE_HTML.indexOf('class="voice-control"');
    const playbackIndex = REMOTE_HTML.indexOf('class="playback-controls"');

    expect(navigationIndex).toBeGreaterThan(-1);
    expect(voiceIndex).toBeGreaterThan(navigationIndex);
    expect(playbackIndex).toBeGreaterThan(voiceIndex);
    expect(REMOTE_HTML).toContain('class="voice-control" aria-label="AI voice control"');
    expect(REMOTE_HTML).toContain('id="voice-button-copy">Hold to talk<');
    expect(REMOTE_HTML).toContain("<small>Ask NHD-TV</small>");
    expect(REMOTE_HTML).toContain('id="control-mode-copy">Pointer<');
    expect(REMOTE_HTML).toContain('id="search-toggle-copy">Search<');
    expect(REMOTE_CSS).toContain("min-height: 4.5rem;");
    expect(REMOTE_CSS).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(REMOTE_HTML).not.toContain("quick-launch");
    expect(REMOTE_HTML).not.toContain(">Apps<");
    expect(REMOTE_JS).not.toContain('jsonRequest("/api/apps"');
    expect(REMOTE_JS).not.toContain('jsonRequest("/api/launch"');
    expect(REMOTE_JS).not.toContain("startUrl");
  });

  it("keeps the remote synchronized with the active service without exposing page data", () => {
    expect(REMOTE_JS).toContain("function renderContext(context)");
    expect(REMOTE_JS).toContain("activeServiceLabel.textContent = serviceName");
    expect(REMOTE_JS).toContain("document.body.dataset.activeService = serviceId");
    expect(REMOTE_JS).toContain('searchToggle.setAttribute("aria-label", currentSearchLabel)');
    expect(serverSource).toContain('onGetContext: () => RemoteControlContext');
    expect(serverSource).toContain("context: await this.#onGetContext()");
    expect(serverSource).not.toContain("watchTitle");
    expect(serverSource).not.toContain("currentUrl");
  });

  it("repeats held directions at a controlled television-navigation cadence", () => {
    expect(REMOTE_HTML.match(/data-repeat="true"/g)).toHaveLength(4);
    expect(REMOTE_JS).toContain("DIRECTION_REPEAT_DELAY_MS = 380");
    expect(REMOTE_JS).toContain("DIRECTION_REPEAT_INTERVAL_MS = 115");
    expect(REMOTE_JS).toContain("directionRepeatTimer = setInterval");
    expect(REMOTE_JS).toContain("sendAction(button.dataset.action, button, true)");
    expect(REMOTE_JS).toContain("clearInterval(directionRepeatTimer)");
  });

  it("keeps arrows as the default and offers a bounded relative precision pad", () => {
    expect(REMOTE_HTML).toContain('class="dpad"');
    expect(REMOTE_HTML).toContain('id="precision-pad"');
    expect(REMOTE_HTML).not.toContain('class="precision-dot"');
    expect(REMOTE_HTML).not.toContain('class="precision-guide');
    expect(REMOTE_HTML).toContain('class="precision-status"');
    expect(REMOTE_HTML).toContain('id="control-mode"');
    expect(REMOTE_CSS).toContain('.dpad[hidden] { display: none; }');
    expect(REMOTE_JS).toContain("usePrecisionMode(false)");
    expect(REMOTE_JS).toContain("POINTER_INTERVAL_MS = 32");
    expect(REMOTE_JS).toContain('await jsonRequest("/api/pointer"');
    expect(REMOTE_JS).toContain('queuePointer(pointerInput(virtualPointer, "move", 0), true)');
    expect(REMOTE_JS).toContain("pointerGesture.totalDistance < 18 && elapsed < 650");
    expect(REMOTE_JS).toContain("edgeScroll(point.y, verticalDelta)");
    expect(REMOTE_JS).toContain("horizontalScroll(horizontalDelta, verticalDelta)");
    expect(REMOTE_JS).toContain("virtualPointer = movePrecisionPoint(");
    expect(REMOTE_JS).toContain("event.getCoalescedEvents");
    expect(REMOTE_JS).toContain("clearTimeout(pointerFlushTimer)");
    expect(REMOTE_JS).toContain("event.isPrimary === false");
    expect(REMOTE_JS).toContain('queuePointer({ phase: "hide", scroll: 0, scrollX: 0, x: 0.5, y: 0.5 }, true)');
    expect(REMOTE_JS).toContain('classList.toggle("has-snap", result.snapped === true)');
    expect(REMOTE_JS).toContain('precisionTextEntryAvailable = result.textEntryAvailable === true');
    expect(REMOTE_JS).toContain('phase === "tap" && precisionTextEntryAvailable');
    expect(REMOTE_JS).toContain("searchQuery.focus()");
    expect(REMOTE_JS).toContain('searchPanel.scrollIntoView({ block: "nearest" })');
    expect(REMOTE_JS).toContain('searchQuery.addEventListener("input"');
    expect(REMOTE_JS).toContain('if (phase === "tap" && precisionTextEntryAvailable) openProviderKeyboard()');
    expect(REMOTE_JS).toContain('result.throttled !== true');
    expect(REMOTE_HTML).not.toContain("Swipe to move");
    expect(REMOTE_HTML).not.toContain("Follow the cursor on your TV");
    expect(REMOTE_HTML).not.toContain("precision-status-copy");
    expect(REMOTE_CSS).toContain("-webkit-user-select: none");
    expect(REMOTE_JS).not.toContain("renderPointerPoint");
    expect(REMOTE_JS).not.toContain("event.clientX - rect.left");
    expect(REMOTE_JS).not.toContain('y < 0.12 ? -1 : y > 0.88 ? 1 : 0');
    expect(REMOTE_JS).not.toContain("movementX");
    expect(REMOTE_JS).not.toContain("movementY");
  });

  it("uses a bounded relative delta with jitter rejection and acceleration", () => {
    expect(precisionRelativeDelta(0.2, 300)).toBe(0);
    expect(precisionRelativeDelta(3, 300)).toBeCloseTo(0.0106);
    expect(precisionRelativeDelta(15, 300)).toBeCloseTo(0.061);
    expect(precisionRelativeDelta(30, 300)).toBeCloseTo(0.14);
    expect(precisionRelativeDelta(-30, 300)).toBeCloseTo(-0.14);
    expect(precisionRelativeDelta(300, 300)).toBe(0.24);
    expect(precisionRelativeDelta(3, 0)).toBe(0);
  });

  it("continues the virtual cursor across independent swipes", () => {
    const firstSwipe = movePrecisionPoint({ x: 0.5, y: 0.5 }, 60, -60, 300, 300);
    const secondSwipe = movePrecisionPoint(firstSwipe, 60, -60, 300, 300);

    expect(firstSwipe).toEqual({ x: 0.74, y: 0.26 });
    expect(secondSwipe.x).toBeCloseTo(0.98);
    expect(secondSwipe.y).toBeCloseTo(0.02);
    expect(movePrecisionPoint(secondSwipe, 60, -60, 300, 300)).toEqual({ x: 1, y: 0 });
  });

  it("does not teleport on touch-down and taps from the persistent cursor", () => {
    const pointerDownStart = REMOTE_JS.indexOf('precisionPad.addEventListener("pointerdown"');
    const pointerMoveStart = REMOTE_JS.indexOf('precisionPad.addEventListener("pointermove"');
    const pointerDownHandler = REMOTE_JS.slice(pointerDownStart, pointerMoveStart);

    expect(pointerDownHandler).not.toContain("moveVirtualPointer");
    expect(pointerDownHandler).not.toContain("queuePointer");
    expect(pointerDownHandler).not.toContain("openProviderKeyboard");
    expect(REMOTE_JS).toContain('? virtualPointer\n      : moveVirtualPointer');
    expect(REMOTE_HTML).not.toContain("Follow the cursor on your TV");
  });

  it("serializes direct text updates and waits for confirmed TV-field readiness", () => {
    expect(REMOTE_JS).toContain("const textPump = createTextPump(sendRemoteText, () => {");
    expect(REMOTE_JS).toContain("if (inFlight || pending === null) return");
    expect(REMOTE_JS).toContain("pending = {");
    expect(REMOTE_JS).toContain("if (pending?.submit === true && !submit) return");
    expect(REMOTE_JS).toContain("directTextEntryReady = false");
    expect(REMOTE_JS).toContain("confirmProviderKeyboard()");
    expect(REMOTE_JS).toContain("rejectProviderKeyboard()");
    expect(REMOTE_JS).toContain("TEXT_ENTRY_DEBOUNCE_MS = 120");
    expect(REMOTE_JS).toContain("function resetTextEntry() {");
    expect(REMOTE_JS).toContain('if (document.body.classList.contains("is-typing")) {');
    expect(REMOTE_JS).toContain('if (action === "back")');
    expect(REMOTE_JS).toContain("function showNavigationMode() {");
    expect(REMOTE_JS).toContain('remoteModeLabel.textContent = dpad.hidden ? "Pointer" : "Navigate"');
  });

  it("waits for committed phone keyboard composition before sending text", () => {
    expect(REMOTE_JS).toContain("event.isComposing");
    expect(REMOTE_JS).toContain('searchQuery.addEventListener("compositionend"');
  });

  it("scales edge scrolling with deliberate movement and preserves direction", () => {
    expect(precisionEdgeScroll(0.5, 12)).toBe(0);
    expect(precisionEdgeScroll(0.05, 8)).toBe(0);
    expect(precisionEdgeScroll(0.05, -1)).toBe(0);
    expect(precisionEdgeScroll(0.05, -3)).toBe(-0.17);
    expect(precisionEdgeScroll(0.95, 9)).toBe(0.5);
    expect(precisionEdgeScroll(0.95, 30)).toBe(1);
  });

  it("turns deliberate horizontal swipes into rail scrolling without stealing vertical motion", () => {
    expect(precisionHorizontalScroll(2, 0)).toBe(0);
    expect(precisionHorizontalScroll(12, 14)).toBe(0);
    expect(precisionHorizontalScroll(4, 1)).toBe(0.18);
    expect(precisionHorizontalScroll(11, 1)).toBe(0.5);
    expect(precisionHorizontalScroll(-11, 1)).toBe(-0.5);
    expect(precisionHorizontalScroll(40, 1)).toBe(1);
  });
});
