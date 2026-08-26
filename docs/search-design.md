# Search design and research

## Current implementation

NHD-TV provides a TV-scale overlay that takes a bounded query and shows the enabled services able to handle it. Netflix and YouTube adapters declare allowlisted query URLs. Disney+ opens its own search page because the current adapter does not declare a query parameter. The user chooses the destination before any query leaves NHD-TV, and the query is not stored or logged.

The paired phone exposes the same search boundary. It has exactly one `type="search"` field with a 120-character limit. Submitting it closes any active service, presents the TV overlay, and lets the user choose a provider using the D-pad. iPhone Dictation and Gboard voice typing work in ordinary text fields, providing useful voice search without granting the LAN page microphone access.

## Why direct microphone capture is deferred

The [W3C Media Capture and Streams specification](https://www.w3.org/TR/mediacapture-streams/) defines `getUserMedia()` as a secure-context API. The current phone remote is served from a random port on a private-network HTTP address, so relying on direct browser microphone capture would be inconsistent and would weaken the remote's narrow permission model. NHD-TV explicitly sends `Permissions-Policy: microphone=(), camera=(), geolocation=()`.

The supported first path is native keyboard dictation: [Apple documents Dictation anywhere text can be typed](https://support.apple.com/guide/iphone/dictate-text-iph2c0651d2/ios), and [Google documents Gboard voice typing through the keyboard microphone](https://support.google.com/gboard/answer/11197787?hl=en).

## Product references

[Google TV search](https://support.google.com/googletv/answer/10059390?hl=en-GB) supports typed and spoken queries, while the [Google TV mobile remote](https://support.google.com/googletv/answer/10267283?hl=en) provides phone input. [Apple TV Search](https://support.apple.com/en-gb/guide/tvapp/atvb6e36d991/web) supports titles, cast, genres, and natural-language queries. NHD-TV mirrors the useful interaction pattern without presenting provider-neutral catalog claims it cannot yet substantiate.

## Metadata aggregation research

TMDB exposes an official [`search/tv` endpoint](https://developer.themoviedb.org/reference/search-tv) and [watch-provider data](https://developer.themoviedb.org/reference/movie-watch-providers) powered by JustWatch. Its [FAQ](https://developer.themoviedb.org/docs/faq) requires TMDB attribution, requires JustWatch attribution for watch-provider data, and distinguishes non-commercial from commercial use. Provider data describes availability but does not supply a reliable deep link into every streaming application.

The official [YouTube Data API `search.list` endpoint](https://developers.google.com/youtube/v3/docs/search/list) requires a Google Cloud project and credentials. Its search quota is separately constrained and may change, so NHD-TV should not silently embed a shared developer key in a distributed desktop client.

Before adding aggregated results, decide:

- whether the app is commercial and obtain compatible licenses;
- how region, subscription tier, rental, and purchase availability are represented;
- where required TMDB and JustWatch attribution appears at TV distance;
- whether users provide their own API key or NHD-TV operates a protected backend;
- how results deep-link into a service without persisting account or tracking parameters;
- cache duration, offline behavior, rate limits, and a provider outage fallback.
