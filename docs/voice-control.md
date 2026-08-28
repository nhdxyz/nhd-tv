# AI voice control

NHD-TV voice control is a phone-based push-to-talk feature. The existing session-only phone remote records one short command, sends it to the Electron main process, and receives a visual result. The television never grants provider pages or the phone direct access to the OpenAI credential.

The implementation is tracked in [GitHub issue #45](https://github.com/nhdxyz/nhd-tv/issues/45).

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
- The browser stream and recording chunks are stopped and released immediately after upload.
- Recordings and transcripts are not written to browser storage or the local database.

The upload boundary accepts only an approved controller over the exact active HTTPS origin. It allowlists supported audio MIME types, caps recordings at 8 MB and 20 seconds, permits one in-flight command, and rate-limits consecutive commands.

## Command path

1. [`gpt-4o-mini-transcribe`](https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe) transcribes English audio.
2. The Responses API converts the transcript to a strict, closed JSON schema.
3. NHD-TV validates the schema and builds its own deterministic command plan.
4. The model cannot provide URLs, selectors, service IDs, or executable code.
5. TV controls go through the existing remote action router.
6. Media commands go through NHD-TV's provider and subscription rules.

The current intent model default is [`gpt-5.6-luna`](https://developers.openai.com/api/docs/models/gpt-5.6-luna), a cost-sensitive Responses API model with Structured Outputs support. Both model names are isolated in the main-process client so they can be changed without altering the phone protocol.

## Provider behavior

### Netflix and where-to-watch discovery

Movies, shows, titles, and exact episodes use a private-project Google Where to watch adapter:

- A hidden, sandboxed, persistent Electron session is warmed in the background.
- A cookie-backed Google search request is attempted first.
- If the request does not contain usable provider data—or a complete provider list is required—the hidden page renders and expands the Where to watch panel.
- Google redirect links are resolved through an allowlisted HTTPS provider map.
- Direct Netflix `/watch/…` links are sanitized again through the existing Netflix navigation policy before opening.
- A provider is eligible for launch only if its mapped service is enabled in the active profile.
- Purchase and rental providers are reported with available price text, but are not treated as subscriptions or automatically launched.

Google markup and internal requests are not a supported public API and can change or present an automated-traffic page. The adapter returns a sanitized failure and falls back to the enabled provider's own search page when possible.

### Spotify

Songs, artists, albums, and playlists route to Spotify's provider-owned search. A bounded script looks only at visible Spotify result rows, cards, anchors, and play buttons. It can open an artist/profile or click the matching provider play control. If selectors no longer match within eight seconds, Spotify search stays open and the phone reports that fallback.

### YouTube

Videos and channels route to YouTube's provider-owned search. Channel commands select a visible channel result. Video commands select a visible video result. “Latest video” adds NHD-TV's fixed upload-date search token, keeps the creator constraint, and opens the first matching visible result. YouTube still owns playback, authentication, ads, and availability.

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

Check that a normal exit removes only the NHD-TV `8443` Serve route, that an unrelated `443` route remains unchanged, and that restarting creates a new short-lived pairing URL.
