# Search design and research

## Current implementation

NHD-TV provides a TV-scale overlay that takes a bounded query and shows the enabled services able to handle it. Netflix and YouTube adapters declare allowlisted query URLs. Disney+ opens its own search page because the current adapter does not declare a query parameter. The user chooses the destination before any query leaves NHD-TV, and the query is not stored or logged.

The paired phone exposes the same bounded `type="search"` field with a 120-character limit, but defaults to the current viewing context:

- while Netflix is open, the query navigates that same service view to Netflix search with the text prefilled;
- while YouTube is open, the query navigates that same service view to YouTube results with the text prefilled;
- while Disney+ is open, the service's search page opens because its adapter has no supported query parameter;
- from Home or a service without a search route, NHD-TV presents the TV provider chooser.

This routing occurs in the trusted main process and accepts only adapter-declared, allowlisted destinations. Search never types into the focused web page, so it cannot accidentally target a login or payment field. The query is not stored or logged. iPhone Dictation and Gboard voice typing work in ordinary text fields, providing useful voice search without granting the LAN page microphone access.

## Why direct microphone capture is deferred

The [W3C Media Capture and Streams specification](https://www.w3.org/TR/mediacapture-streams/) defines `getUserMedia()` as a secure-context API. The current phone remote is served from a random port on a private-network HTTP address, so relying on direct browser microphone capture would be inconsistent and would weaken the remote's narrow permission model. NHD-TV explicitly sends `Permissions-Policy: microphone=(), camera=(), geolocation=()`.

The supported first path is native keyboard dictation: [Apple documents Dictation anywhere text can be typed](https://support.apple.com/guide/iphone/dictate-text-iph2c0651d2/ios), and [Google documents Gboard voice typing through the keyboard microphone](https://support.google.com/gboard/answer/11197787?hl=en).

## Product references

[Google TV search](https://support.google.com/googletv/answer/10059390?hl=en-GB) supports typed and spoken queries, while the [Google TV mobile remote](https://support.google.com/googletv/answer/10267283?hl=en) provides phone input. [Apple TV Search](https://support.apple.com/en-gb/guide/tvapp/atvb6e36d991/web) supports titles, cast, genres, and natural-language queries. NHD-TV mirrors the useful interaction pattern without presenting provider-neutral catalog claims it cannot yet substantiate.

## Metadata aggregation research

TMDB exposes an official [`search/multi` endpoint](https://developer.themoviedb.org/reference/search-multi) for movies, shows, and people, plus [watch-provider data](https://developer.themoviedb.org/reference/movie-watch-providers) powered by JustWatch. Its [FAQ](https://developer.themoviedb.org/docs/faq) requires TMDB attribution, requires JustWatch attribution for watch-provider data, and distinguishes non-commercial from commercial use. Provider data describes regional streaming, rental, and purchase availability, but explicitly does not supply full provider deep links.

The official [YouTube Data API `search.list` endpoint](https://developers.google.com/youtube/v3/docs/search/list) returns videos, channels, and playlists and supports region and language hints. It requires a Google Cloud project and credentials, and its search quota is separately constrained and may change. NHD-TV should not silently embed a shared developer key in a distributed desktop client.

## Recommended dynamic-results path

1. Keep contextual provider search as the fast, private default while a service is open.
2. Add an optional Home discovery provider that queries TMDB for debounced title/person results and resolves regional availability only for the highlighted result.
3. Display provider badges only when the configured region and availability type are known. Label unknown availability honestly.
4. Selecting a result should open an enabled provider's supported search route, not manufacture an unsupported title deep link. The user makes the final match inside the service.
5. Add YouTube result cards through its official API as a separate adapter. Use a protected NHD-TV backend for a distributed build, or an explicit bring-your-own-key developer mode; never ship a reusable secret in the desktop bundle.
6. Cache only public metadata with a short expiry. Keep viewing history, enabled services, queries, and account state local.
7. Do not scrape provider catalogs or inject discovery code into signed-in service pages. Provider adapters remain narrow navigation integrations.

This produces a dynamic Apple TV/Google TV-style result surface without pretending NHD-TV has a licensed, real-time view of every subscription catalog.

Before adding aggregated results, decide:

- whether the app is commercial and obtain compatible licenses;
- how region, subscription tier, rental, and purchase availability are represented;
- where required TMDB and JustWatch attribution appears at TV distance;
- whether users provide their own API key or NHD-TV operates a protected backend;
- how results deep-link into a service without persisting account or tracking parameters;
- cache duration, offline behavior, rate limits, and a provider outage fallback.
