# Continue Watching adapter notes

## Shared observer

NHD-TV observes rather than controls the service player. On a declared playback route, the host selects the largest visible, healthy video that is at least 60 seconds long. Qualification requires at least five seconds in the element's actual `played` ranges; a provider cloud-resume seek or merely loading at a later timestamp does not qualify. The host checks shortly after playback begins, every ten seconds, and on pause, same-service navigation, service exit, and normal window shutdown. It never invokes play, pause, seek, or skip.

The stored watch URL is rebuilt from the service origin and path. Only adapter-declared query keys survive; fragments and all other parameters are removed. Renderer IPC omits the watch URL completely. Artwork is optional and is stored only after an HTTPS host/redirect check, a five-megabyte input limit, image decoding, resizing, and JPEG re-encoding.

An item is removed when playback reports `ended`, reaches 95%, or the user chooses the controller-accessible Remove action on Home. Manual removal changes only NHD-TV's local history; it does not clear service cookies, account history, or provider data. The service—not NHD-TV—decides where playback resumes after the watch URL opens.

## Adapter state

### Netflix

- Recognized route: `/watch/…`
- Stored query parameters: none
- Artwork hosts: `nflximg.net` and `nflxso.net`, including subdomains
- Title candidates: adapter-declared Netflix player title and episode selectors, Open Graph title, then document title
- Automated macOS check: Netflix Test Patterns decoded, accumulated real played time, and qualified through the same passive observer and sanitized watch-route policy
- Remaining validation: confirm episode-level title quality, poster availability, pause checkpoints, completion, manual removal, and cloud resume with ordinary account content on Windows

### YouTube

- Recognized routes: `/watch` and `/shorts/…`
- Stored query parameter: `v` only
- Artwork host: `i.ytimg.com`, including subdomains
- Title candidates: `h1.ytd-watch-metadata`, Open Graph title, then document title
- Remaining validation: confirm signed-in and signed-out title/artwork behavior, playlist URL stripping, Shorts longer than 60 seconds, live streams, and cloud resume

### Disney+

- Recognized routes: `/play/…` and `/video/…`
- Stored query parameters: none
- Artwork host: `disney-plus.net`, including subdomains
- Title candidates: Open Graph title, then document title
- Remaining validation: the account is not yet available for an ordinary playback test; confirm actual playback routes, metadata markup, completion, and cloud resume before calling the adapter qualified

## Known limitations

- A hard process kill can lose activity after the last ten-second checkpoint.
- Provider markup and routes can change without notice; an item may retain progress but fall back to service branding when artwork extraction fails.
- Live channels and unknown-duration media are excluded because a finite duration is required.
- The first slice has manual removal but no per-NHD-TV-profile history or persistent hide/suppression list.
- Resuming may open the correct title but use the provider's cloud position rather than the locally observed second.
