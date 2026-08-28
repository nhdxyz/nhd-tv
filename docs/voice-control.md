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
- Speak for 150 milliseconds to about 19.5 seconds. The phone stops slightly before the server's 20-second ceiling so recorder scheduling cannot turn a valid hold into an over-limit upload.
- Release to send the command.
- The phone shows listening, processing, confirmation, success, and sanitized error states.
- The television mirrors Listening and Understanding, then shows the finalized transcript before the result. The current file-transcription path does not claim word-by-word live partials.
- The browser stream and recording chunks are stopped and released immediately after upload.
- Recordings and transcripts are not written to browser storage or the local database.

The upload boundary accepts only an approved controller over the exact active HTTPS origin. It allowlists supported audio MIME types, caps recordings at 8 MB and 20 seconds, applies a 15-second body-upload deadline, permits one in-flight command, and rate-limits consecutive commands. Each hold gets an ephemeral command ID bound to the paired controller. A first-wins in-memory lease rejects reordered events and prevents a second phone or late cancellation from replacing the active command's TV feedback. Abandoned listening leases expire shortly after the maximum recording window. The complete transcription, interpretation, discovery, and provider operation has a server-owned 120-second deadline; confirmed playback has a 60-second deadline. Either deadline aborts in-progress hidden navigation, publishes a terminal TV error, and releases the shared voice lease even if an underlying provider stops responding. Confirmation tokens remain bound to that controller and command, and confirmation playback reacquires the same one-command lease. Cancel invalidates only that exact pending confirmation, while any newly accepted voice upload supersedes older pending confirmations across all phones. IDs and lease state are never persisted.

## Command path

1. [`gpt-4o-mini-transcribe`](https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe) transcribes English audio.
2. The Responses API converts the transcript to a strict, closed JSON schema.
3. NHD-TV validates the schema and builds its own deterministic command plan.
4. The model cannot provide URLs, selectors, service IDs, or executable code.
5. TV controls go through the existing remote action router.
6. Media commands go through NHD-TV's provider and subscription rules.

The current intent model default is [`gpt-5.6-luna`](https://developers.openai.com/api/docs/models/gpt-5.6-luna), a cost-sensitive Responses API model with Structured Outputs support. Both model names are isolated in the main-process client so they can be changed without altering the phone protocol.

The finalized transcript is reported as soon as transcription completes, before intent interpretation finishes, and remains readable on the TV for a short minimum interval. True word-by-word captions would be a separate Realtime transcription upgrade using a streaming model such as [`gpt-live-transcribe`](https://developers.openai.com/api/docs/models/gpt-live-transcribe); it is not simulated by the current UI.

## Provider behavior

### Ambiguity and multiple services

NHD-TV never lets the model choose a URL or silently treat every enabled app as a subscription offer. For an exact movie, show, or episode available from several providers, selection follows this order:

1. an explicitly named provider such as Netflix or Disney+;
2. the active profile's visible TV-lineup order;
3. Google's offer order within the selected provider.

Only subscription and free offers may launch. Price-bearing rent/buy offers are reported but never opened automatically. A sparse, price-free Google label is treated as subscribed only for subscription-only Netflix and Disney+ destinations; an unlabeled YouTube movie is not. The provider list and order are recalculated when a 30-second phone confirmation is tapped, so switching profiles or disabling a service cannot use stale permissions.

Confirmation choices expire visibly after 30 seconds. A network-interrupted Play request changes to a controller-bound **Check result** state for up to two minutes; it replays the same in-progress or terminal result without executing the command twice and does not offer a misleading Cancel after submission may have occurred. iPhone Safari revalidates the controller after a back/forward-cache restore. A normal page exit quarantines the controller token immediately. If Safari delivers the unload before an already-tapped Play request, the server grants only that exact confirmation a five-second arrival window; every unrelated request is rejected, and the token is revoked when playback finishes or its deadline fires. Starting another recording supersedes the old choice only after the microphone has actually begun recording, so a denied or failed microphone start does not destroy a valid confirmation.

Before a direct provider URL opens, the normalized Google panel title must equal the requested title after harmless labels such as “movie” or “series” are removed. An exact episode also requires visible matching season and episode coordinates. A mismatch falls back to the provider's own search rather than claiming playback succeeded.

Underspecified commands such as “play it” or “put that on” return a retry message and perform no navigation. Spoken release years, editions, languages, countries, and remake qualifiers remain part of the search title.

A bare exact title such as “Apollo 13” is treated as a play request. In confirmation mode it still waits for approval on the phone; an explicit “open” request never auto-plays.

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
- Google redirect links are resolved through an allowlisted HTTPS provider map.
- Direct Netflix `/watch/…` links are sanitized again through the existing Netflix navigation policy before opening.
- A provider is eligible for launch only if its mapped service is enabled in the active profile.
- Purchase and rental providers are reported with available price text, but are not treated as subscriptions or automatically launched.
- Netflix's profile gate selects the active local profile name when it is available, with a bounded normal-profile fallback.
- A show-level Play request prefers Netflix Resume/Continue, then Play. An explicit season and episode selects only that exact episode and never falls through to a generic Resume control.
- Playback controls are scoped to an exact-title detail surface or a trusted Netflix content ID, preventing an unrelated Continue Watching button from starting the wrong title.
- Successful play waits for actual provider playback and fullscreen verification. If a provider fullscreen button ignores a synthetic click, NHD-TV sends one bounded keyboard fallback and verifies again.

Google markup and internal requests are not a supported public API and can change or present an automated-traffic page. The adapter returns a sanitized failure and falls back to the enabled provider's own search page when possible.

### Spotify

Songs, artists, albums, and playlists route to Spotify's provider-owned search. “Play a song from Kanye West” starts the named artist without inventing a track title. A bounded script looks only at visible Spotify result rows, cards, anchors, and play buttons. Exact songs require both title and artist. Artist, album, and playlist playback requires matching local state plus Spotify's global Pause state before success is reported. If verification fails, Spotify search stays open and the phone reports that playback could not be started automatically.

### YouTube

Videos and channels route to YouTube's provider-owned search. A YouTuber/profile request prioritizes dedicated channel result cards and exact normalized channel names or handles. Video requests rank exact titles and require the named creator's byline; a shorter prefix or fan upload that merely mentions the creator in its title is skipped. A one-character transcription correction such as “Cody Co” → “Cody Ko” is allowed only at equal length. “Latest video” searches only for the creator, adds NHD-TV's fixed upload-date token, and opens the first visible result whose channel byline matches. Play requests wait for video playback and fullscreen verification; otherwise results stay open and the phone reports the failure honestly. YouTube still owns playback, authentication, ads, and availability.

## Local discovery cache

Google results are stored in `voice-watch-results.sqlite` under Electron's user-data directory with a 24-hour expiration. The schema records:

- normalized and original query;
- resolved title/subtitle and exact season/episode coordinates;
- region and source URL;
- retrieval mode and request/render timing;
- whether offers are complete;
- provider, host, provider content ID, monetization type, price, direct URL, and order.

The `discovery_export` SQLite view is intentionally flat and export-ready. A future Settings action can export that view or use the same rows to seed an independent API. The cache stores provider discovery metadata only; it does not store audio, transcripts, OpenAI credentials, or provider cookies.

## Verification

Without an API key, verify startup, settings, Tailscale routing, microphone gating, local cache creation, and all mocked tests. No live OpenAI request is made.

```sh
pnpm typecheck
pnpm test
pnpm build
```

After adding a key, qualify these commands on a paired iPhone in both confirmation modes:

- “Pause” and “volume up”
- “Play Apollo 13”
- “Play Breaking Bad season 1 episode 3”
- “Where can I watch Apollo 13?”
- “Play Stronger by Kanye West”
- “Open Kanye West on Spotify”
- “Play the Outdoor Boys latest video”
- “Go to the Outdoor Boys channel”
- “Show me a tense action movie with a clever lead”
- “Find movies similar to Inception”
- “Play Moana on Disney Plus”
- “Play Dune 2021”

Also verify that “play it” performs no navigation, a YouTube fan upload is not selected for a named creator, a rent/buy offer is not launched, and changing profiles while a confirmation is visible causes the current profile's provider lineup to be re-evaluated.

With two paired phones, begin a hold on one phone and then try the other. The first gesture should retain the TV presentation, the second upload should report busy, and its late cancellation must not hide the first command's transcript or result. In confirmation mode, verify that a confirmation cannot be used by the other phone, that Cancel invalidates the pending choice, and that a busy confirmation can be retried after the active command completes.

Check that a normal exit removes only the NHD-TV `8443` Serve route, that an unrelated `443` route remains unchanged, and that restarting creates a new short-lived pairing URL.
