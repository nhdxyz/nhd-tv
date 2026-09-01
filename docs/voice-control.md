# AI voice control

NHD-TV voice control is a phone-based push-to-talk feature. The existing session-only phone remote records one short command, sends it to the Electron main process, and receives a visual result. The television never grants provider pages or the phone direct access to the OpenAI credential.

The implementation is tracked in [GitHub issue #45](https://github.com/nhdxyz/nhd-tv/issues/45).

For supported phrases and current limits, see the [voice command reference](voice-command-reference.md).

## First-time setup

1. Install Tailscale on the NHD-TV computer and phone, sign both into the same tailnet, enable MagicDNS, and [enable HTTPS certificates](https://tailscale.com/docs/how-to/set-up-https-certificates) for the tailnet.
2. Open NHD-TV Settings → AI Voice Control.
3. Save an OpenAI API key. The key is encrypted with Electron `safeStorage`, retained only in the main process, and never returned through IPC.
4. Enable voice control.
5. Choose **Confirm before playback** or **Play automatically**. Direct controls such as pause and volume never require confirmation.
6. Leave Region on automatic detection or enter a two-letter region such as `US`.
7. Pair the phone remote by scanning the TV QR code. The QR should use `https://<device>.<tailnet>.ts.net:8443` when secure access is ready.

The app owns only Tailscale HTTPS port `8443`. It does not reset Tailscale Serve and does not change an unrelated port `443` route. If `8443` is already occupied without NHD-TV's ownership marker, pairing falls back to LAN HTTP and voice remains disabled. On a normal exit, NHD-TV uses [Tailscale Serve's endpoint-specific `off` command](https://tailscale.com/docs/reference/tailscale-cli/serve#disable-tailscale-serve) to remove only the exact `8443` route matching its ownership marker.

## Phone interaction

- Press and hold the center microphone button.
- Wait for the short ready ding. The microphone icon becomes a live five-bar input meter only after recording has actually started.
- Speak for 150 milliseconds to about 19.5 seconds. The phone stops slightly before the server's 20-second ceiling so recorder scheduling cannot turn a valid hold into an over-limit upload.
- Release to send the command.
- Before opening the microphone, the phone acquires a five-second TV-wide reservation. A competing phone is disabled and told that voice control is already in use; an abandoned reservation expires without muting the TV.
- The phone shows listening, processing, confirmation, success, and sanitized error states. While a command or confirmed playback is still processing, the initiating phone also gets a Cancel button.
- The television mirrors Listening and Understanding, then shows the finalized transcript before the result. The current file-transcription path does not claim word-by-word live partials.
- The browser stream and recording chunks are stopped and released immediately after upload.
- Recordings and transcripts are not written to browser storage or the local database.

The upload boundary accepts only an approved controller over the exact active HTTPS origin. It allowlists supported audio MIME types, caps recordings at 8 MB and 20 seconds, applies a 15-second body-upload deadline, permits one in-flight command, and rate-limits consecutive commands. Each hold gets an ephemeral command ID bound to the paired controller. A first-wins in-memory lease rejects reordered events and prevents a second phone or late cancellation from replacing the active command's TV feedback. Reservations expire after five seconds and abandoned listening leases expire shortly after the maximum recording window. A cancellation that arrives after capture but just before upload registration creates a short-lived, controller-bound tombstone, so the late upload cannot revive the command. The complete command has a 50-second application deadline inside a 60-second server hard limit, while discovery, provider navigation, and playback automation share a stricter 20-second cumulative deadline after interpretation; Google playback discovery may consume at most eight seconds of that budget. Confirmed playback has a 32-second application deadline and uses the same 20-second media bound. A deadline aborts in-progress hidden navigation before superseding its provider-operation token, publishes a terminal TV error, and releases the shared voice lease even if an underlying provider stops responding. The processing Cancel action is bound to the exact operation and initiating controller; it cannot cancel another phone's work or a later command, and it cannot undo a provider action that finished before cancellation was observed. Confirmation tokens remain bound to that controller, command, active profile generation, enabled-service lineup, voice-enabled state, configured-credential state, and a server authority revision. Confirmation playback reacquires the same one-command lease and fails closed if that authority or live voice availability has changed. Cancel on a pending confirmation invalidates only that exact choice, while any newly accepted voice upload supersedes older pending confirmations across all phones. IDs and lease state are never persisted.

## Command path

1. [`gpt-transcribe`](https://developers.openai.com/api/docs/models/gpt-transcribe) transcribes English audio after the phone releases the push-to-talk button. A short television-command vocabulary prompt supplies context for terms such as play, playing, Continue Watching, provider names, and media controls; deterministic shortcuts also correct `plain` only in unambiguous play/playing control grammar.
2. The Responses API converts the transcript to a strict, closed JSON schema.
3. NHD-TV validates the schema and builds its own deterministic command plan.
4. The model cannot provide URLs, selectors, service IDs, or executable code.
5. TV controls go through the existing remote action router.
6. Media commands go through NHD-TV's provider and subscription rules.

The current intent model default is [`gpt-5.6-luna`](https://developers.openai.com/api/docs/models/gpt-5.6-luna), a cost-sensitive Responses API model with Structured Outputs support. Intent extraction uses `reasoning.effort: none` because this is a bounded latency-sensitive classification task, while NHD-TV performs deterministic validation and execution. Both model names are isolated in the main-process client so they can be changed without altering the phone protocol.

The finalized transcript is reported as soon as transcription completes, before intent interpretation finishes, and remains readable on the TV for a short minimum interval. True word-by-word captions would be a separate Realtime transcription upgrade using a streaming model such as [`gpt-live-transcribe`](https://developers.openai.com/api/docs/models/gpt-live-transcribe); it is not simulated by the current UI.

## Provider behavior

### Ambiguity and multiple services

NHD-TV never lets the model choose a URL or silently treat every enabled app as a subscription offer. For an exact movie, show, or episode, provider selection follows these rules:

1. an explicitly named enabled provider such as Netflix or Disney+ is used;
2. one eligible enabled offer can be selected directly;
3. several eligible enabled offers are shown as numbered TV choices and require an explicit selection.

Only subscription and free offers may launch. Price-bearing rent/buy offers are reported but never opened automatically. A sparse, price-free Google label is treated as subscribed only for subscription-only Netflix and Disney+ destinations; an unlabeled YouTube movie is not. The provider list and order are recalculated when a 30-second phone confirmation is tapped, so switching profiles or disabling a service cannot use stale permissions.

Confirmation choices expire visibly after 30 seconds. A network-interrupted Play request changes to a controller-bound **Check result** state for up to two minutes; it replays the same in-progress or terminal result without executing the command twice and does not offer a misleading Cancel after submission may have occurred. iPhone Safari revalidates the controller after a back/forward-cache restore. A normal page exit quarantines the controller token immediately. If Safari delivers the unload before an already-tapped Play request, the server grants only that exact confirmation a five-second arrival window; every unrelated request is rejected, and the token is revoked when playback finishes or its deadline fires. Starting another recording supersedes the old choice only after the microphone has actually begun recording, so a denied or failed microphone start does not destroy a valid confirmation.

Before a direct provider URL opens, the normalized Google panel title must equal the requested title after harmless labels such as “movie” or “series” are removed. An exact episode also requires visible matching season and episode coordinates. A mismatch falls back to the provider's own search rather than claiming playback succeeded.

Follow-ups such as “play it,” “put that on,” “where can I watch it,” a displayed numbered provider choice, or “Netflix instead” resolve only from fresh, structured TV-wide context for the active profile. Every paired phone controlling the same TV shares that one memory-only context; the phone that established it does not own it. The context stores media identity, provider identity, current playback state, displayed candidates, and verified action metadata in memory; it never stores audio, transcripts, URLs, or cookies. A new explicit media target begins a transactional context update: if that target fails, the prior target is invalidated so a later “play it” cannot unexpectedly launch old media; if the command is cancelled before completion, the pre-command context is restored. Missing, expired, ambiguous, cross-profile, or provider-incompatible references return a retry message and perform no navigation. Spoken release years, editions, languages, countries, and remake qualifiers remain part of the search title.

Read-only questions such as “what am I watching,” “what episode is this,” “what song is this,” “how far into this am I,” “what's the runtime,” “how much longer,” and “when will this end” use a fresh provider observation and never trigger search or navigation. Finish-time answers require actively playing media plus an observed playback rate; paused, ended, stale, and rate-unknown state is reported instead of producing a false clock estimate. Playback follow-ups include bounded relative and absolute seeking, restart, next/previous item, Netflix intro/recap controls, provider ad-skip controls, captions on/off, fullscreen enter/exit, exact playback speed, and explicit Spotify shuffle/repeat states. Speed accepts only 0.5×, 0.75×, 1×, 1.25×, or 1.5× on a trusted Netflix/YouTube playback URL with a finite video, then waits for settled DOM read-back before reporting success. Spotify shuffle and repeat use exact provider state attributes, require one unambiguous connected and enabled control, re-query React-replaced controls after every transition, and require a stable requested state before reporting success. Repeat issues at most one synchronously authorized click per host round trip; cancellation prevents every later click. Because Electron cannot recall a page script already dispatched, a delayed first click is reported as an unverified partial change unless the previous state can be stably restored. Each action uses a fixed provider-owned selector set or the active media element; arbitrary selectors and executable model output never cross into a service page.

A bare exact title such as “Apollo 13” is treated as a play request. In confirmation mode it still waits for approval on the phone; an explicit “open” request never auto-plays.

Provider-owned destinations use a separate closed command path. YouTube Subscriptions, YouTube Library, and Spotify Library map to three compiled-in, allowlisted URLs; the model can choose only `library` or `subscriptions` plus a provider hint. Generic “my library” uses an active capable provider or the only enabled capable provider, and asks the user to name Spotify or YouTube when both are enabled and neither is active. The enabled lineup and route allowlist are checked again immediately before navigation, and success requires the provider to finish on the requested canonical origin and path rather than a sign-in, consent, or home redirect.

Provider automation recognizes terminal sign-in, consent, unavailable-content, private-content, and age-check surfaces instead of waiting through the full navigation deadline. These states fail fast and give an actionable phone/TV message: sign in, finish the provider consent prompt, choose different content when it is unavailable or private, or complete the age check on the TV before retrying. A terminal provider page is never reported as successful playback or navigation.

### Open-ended recommendations

Voice discovery recognizes genre, mood, era, actor, theme, and natural-language descriptions, plus requests for titles similar to a named movie or show. Examples include:

- “Show me a tense action movie with a clever lead.”
- “I want a funny family movie from the 1990s.”
- “Find movies similar to Inception.”

These requests open Netflix's own discovery results using a bounded search phrase. They never guess one title and auto-play it, even when automatic playback is enabled. “Similar to” searches preserve only the named seed title so Netflix can present its own related catalog results. If Netflix is not enabled in the profile, the phone explains that recommendation discovery is unavailable instead of rerouting the request to YouTube.

### Netflix and where-to-watch discovery

Movies, shows, titles, and exact episodes use a private-project Google Where to watch adapter:

- A hidden, sandboxed, persistent Electron session is warmed in the background.
- A cookie-backed Google search request is attempted first.
- If the request does not contain usable provider data—or a complete provider list is required—the hidden page renders and expands the Where to watch panel.
- Google redirect links are resolved concurrently through a bounded allowlisted HTTPS provider map; the browser-render fallback remains serialized to protect the warmed session.
- Direct Netflix `/watch/…` links are sanitized again through the existing Netflix navigation policy before opening.
- A provider is eligible for launch only if its mapped service is enabled in the active profile.
- Each media command is bound to the profile generation that created it. Slow discovery continually intersects its original candidates with the live lineup, so switching profiles fails closed and a newly enabled service cannot join an in-flight command. A server-owned authority gate serializes profile switches, built-in and custom-service removals, disabling voice control, and removing the OpenAI credential. NHD-TV blocks new voice activity, uploads, and confirmation execution; synchronously tombstones any reserved or listening capture; publishes cancellation so temporary muting is released; cancels pending confirmations and registered voice work; aborts Google lookup; supersedes provider operations; closes a removed active provider; and only then commits the authority reduction. Device-setting changes arrive as partial patches and merge against the latest state inside that serialized queue, so a rapid unrelated toggle cannot undo an explicit voice disable. The gate remains closed across asynchronous cleanup and rechecks authority before reopening. Ordering, favorites, playback-mode changes, service additions, and credential additions do not broaden an in-flight command's frozen candidates.
- Purchase and rental providers are reported with available price text, but are not treated as subscriptions or automatically launched.
- Netflix's profile gate preserves an already-active Netflix profile. When Netflix instead presents “Who's watching?”, voice playback selects an exact active local profile-name match when available, otherwise it selects the first visible normal profile, reloads the verified title/search destination, and continues the same command through Play/Resume and playback verification. Management controls are never treated as profiles; if Netflix exposes no usable profile, the phone asks the user to choose on the TV.
- A show-level Play request prefers Netflix Resume/Continue, then Play. An explicit season and episode selects only that exact episode and never falls through to a generic Resume control. Observed episode coordinates are retained in short-lived TV context for safe follow-up questions.
- Search-result identity remains exact after safe spoken-number canonicalization, so a request transcribed as “Too Fast Too Furious” can match the visibly labeled Netflix title *2 Fast 2 Furious* without accepting a sequel, subtitle, or unrelated first result.
- Playback controls are scoped to an exact-title detail surface or a trusted Netflix content ID, preventing an unrelated Continue Watching button from starting the wrong title.
- Successful video play waits for actual provider playback and attempts verified fullscreen. If a provider fullscreen button ignores a synthetic click, NHD-TV sends one bounded keyboard fallback and verifies again. Verified playback that remains windowed is reported as playing with a fullscreen caveat rather than as full success or a false playback failure.

Google markup and internal requests are not a supported public API and can change or present an automated-traffic page. The adapter returns a sanitized failure and falls back to the enabled provider's own search page when possible.

### Spotify

Songs, artists, albums, and playlists route to Spotify's provider-owned search. “Play a song from Kanye West” starts the named artist without inventing a track title. A bounded script looks only at visible Spotify result rows, cards, anchors, and play buttons. Exact songs require both title and artist; the resulting track route and artist attribution are verified before success. Artist navigation accepts an exact name or a provider-ranked, visibly expanded single-name match such as `Kanye` → `Kanye West`, then requires the matching artist/profile route. Artist, album, and playlist playback still requires matching local state plus Spotify's global Pause state before success is reported. If verification fails, Spotify search stays open and the phone reports that playback could not be started automatically.

### YouTube

Videos and channels route to YouTube's provider-owned search. A YouTuber/profile request prioritizes dedicated channel result cards and exact normalized channel names or handles, then verifies the resulting canonical channel route before reporting success. Video requests rank exact titles and require the named creator's byline; a shorter prefix or fan upload that merely mentions the creator in its title is skipped. A one-character transcription correction such as “Cody Co” → “Cody Ko” is allowed only at equal length. “Latest video” searches only for the creator, adds NHD-TV's fixed upload-date token, skips Shorts, and opens the first visible full-video result whose channel byline matches. Play requests verify actual video playback and then make a bounded fullscreen attempt; windowed playback and playback failure are reported distinctly. YouTube still owns playback, authentication, ads, and availability.

## Local discovery cache

Google results are stored in `voice-watch-results.sqlite` under Electron's user-data directory with a 24-hour expiration. The schema records:

- normalized and original query;
- resolved title/subtitle and exact season/episode coordinates;
- region and source URL;
- retrieval mode and request/render timing;
- whether offers are complete;
- provider, host, provider content ID, monetization type, price, direct URL, and order.

The `discovery_export` SQLite view is intentionally flat and export-ready. A future Settings action can export that view or use the same rows to seed an independent API. The cache stores provider discovery metadata only; it does not store audio, transcripts, OpenAI credentials, or provider cookies.

To test the private Google adapter without touching the main app's Netflix, YouTube, or Spotify sessions, run the isolated warmed-session probe. Omit `--complete` to exercise the fast request-first Play path; include it to force complete provider expansion for a Where-to-watch response. Probe rows stay under the git-ignored `.cache/google-watch-probe` directory.

```sh
pnpm exec electron scripts/probe-google-watch-session.mjs "Breaking Bad season 1 episode 3"
pnpm exec electron scripts/probe-google-watch-session.mjs "Breaking Bad season 1 episode 3" --complete
```

## Verification

Without an API key, verify startup, settings, Tailscale routing, microphone gating, local cache creation, and all mocked tests. No live OpenAI request is made.

```sh
pnpm typecheck
pnpm test
pnpm build
```

After adding a key, qualify these commands on a paired iPhone in both confirmation modes:

- “Pause” and “volume up”
- “Set volume to 20 percent” and “set volume to zero”
- “What am I watching?”, “How far into this am I?”, “What's the runtime?”, and “How much longer?”
- “Rewind 30 seconds”, “skip intro”, “turn captions on”, and “go fullscreen”
- “Play this at one-and-a-half speed” and “back to normal speed”
- “Turn shuffle on”, “repeat this song”, “repeat everything”, and “turn repeat off”
- “Play Apollo 13”
- “Resume my Continue Watching”
- “Resume playing my Continue Watching”
- “Play Too Fast Too Furious on Netflix”
- “Play Breaking Bad season 1 episode 3”
- “Where can I watch Apollo 13?”
- “Play Stronger by Kanye West”
- “Play Kanye on Spotify”
- “Open Kanye West on Spotify”
- “Open my Spotify library” and “Go to my YouTube subscriptions”
- “Play the Outdoor Boys latest video”
- “Go to the Outdoor Boys channel”
- “Show me a tense action movie with a clever lead”
- “Find movies similar to Inception”
- “Play Moana on Disney Plus”
- “Play Dune 2021”

Also verify a safe two-turn follow-up such as “Where can I watch Apollo 13?” → “the first one,” then verify that “play it” with no prior target performs no navigation. Confirm that a YouTube fan upload is not selected for a named creator, a rent/buy offer is not launched, expired or cross-profile context is rejected, and changing profiles or disabling a service during a slow provider lookup fails closed before the stale result can authorize playback.

With two paired phones, begin a hold on one phone and then try the other. The first phone should reserve voice before opening its microphone; the second should show Voice in use and must not start recording. The first gesture should retain the TV presentation, and a late cancellation from the losing phone must not hide the first command's transcript or result. Both phones should share the same active-profile media context after the first command completes. In confirmation mode, verify that a confirmation cannot be used by the other phone, that tap or spoken Cancel invalidates the pending choice, that a bare spoken Yes on the owning phone executes once, and that a busy confirmation can be retried after the active command completes.

While one phone is still holding the microphone, switch profiles, remove its destination service, disable voice control, and remove the OpenAI credential in separate runs. Each change must immediately release temporary muting, reject the old upload after the setting finishes, leave no usable confirmation card, and allow a fresh command only after voice is enabled and a credential is configured again. Rapidly toggle an unrelated device setting immediately after disabling voice and confirm that voice remains off.

During one intentionally slow lookup, tap the processing Cancel button on the initiating phone. Also test cancelling immediately after release, before the upload can register. Both should return to “hold to correct,” release the TV-wide busy state, and prevent the late command from executing; the second phone must not be able to cancel that operation.

On a Netflix multi-profile gate, verify an exact local profile-name match and a missing-name case. The missing-name case must select the first normal profile, continue to the requested title, press Play/Resume, and verify playback without requiring the voice command to be repeated. If a Netflix profile was already active, it must remain unchanged.

Check that a normal exit removes only the NHD-TV `8443` Serve route, that an unrelated `443` route remains unchanged, and that restarting creates a new short-lived pairing URL.
