# Search design and research

## Current implementation

NHD-TV provides a TV-scale, result-first overlay. With an empty query it shows recent Continue Watching items. As the user types a bounded query, it filters the active profile's renderer-safe title, subtitle, and provider metadata immediately. At two characters, a 450 ms debounce sends the query to the public [TVmaze show-search endpoint](https://www.tvmaze.com/api#show-search), which returns fuzzy TV-show matches and poster metadata. The main process accepts only exact TVmaze API and image hosts, bounds the response and image sizes, converts posters to local data URLs, and caches public results in memory for 15 minutes. The query is not stored by NHD-TV.

TVmaze results are title discovery, not provider-availability claims. Each result offers explicit search actions for the enabled apps that support a safe search route. Netflix and YouTube accept the selected title as an allowlisted query; Disney+ opens its own search page. The service receives a title only after the user selects that action. The user makes the final catalog match inside the service.

The paired phone exposes the same bounded `type="search"` field with a 120-character limit, but defaults to the current viewing context:

- while Netflix is open, the query navigates that same service view to Netflix search with the text prefilled;
- while YouTube is open, the query navigates that same service view to YouTube results with the text prefilled;
- while Disney+ is open, the service's search page opens because its adapter has no supported query parameter;
- from Home or a service without a search route, NHD-TV presents the TV provider chooser.

As a convenience, tapping the qualified search field in Netflix or YouTube with the precision cursor opens this same bounded field and the phone's native keyboard. The phone is told only that the current safe target supports text entry; it never receives a DOM selector, field content, URL, or service-page text. Submitting still uses the adapter-declared search destination instead of injecting keystrokes into the page.

This routing occurs in the trusted main process and accepts only adapter-declared, allowlisted destinations. Search never types into the focused web page, so it cannot accidentally target a login or payment field. Queries are not stored or logged. The TV UI discloses that two-character-or-longer Home queries are sent to TVmaze. iPhone Dictation and Gboard voice typing work in ordinary text fields, providing useful voice search without granting the LAN page microphone access.

## Why direct microphone capture is deferred

The [W3C Media Capture and Streams specification](https://www.w3.org/TR/mediacapture-streams/) defines `getUserMedia()` as a secure-context API. The current phone remote is served from a random port on a private-network HTTP address, so relying on direct browser microphone capture would be inconsistent and would weaken the remote's narrow permission model. NHD-TV explicitly sends `Permissions-Policy: microphone=(), camera=(), geolocation=()`.

The supported first path is native keyboard dictation: [Apple documents Dictation anywhere text can be typed](https://support.apple.com/guide/iphone/dictate-text-iph2c0651d2/ios), and [Google documents Gboard voice typing through the keyboard microphone](https://support.google.com/gboard/answer/11197787?hl=en).

## Product references

[Google TV search](https://support.google.com/googletv/answer/10059390?hl=en-GB) supports typed and spoken queries, while the [Google TV mobile remote](https://support.google.com/googletv/answer/10267283?hl=en) provides phone input. [Apple TV Search](https://support.apple.com/en-gb/guide/tvapp/atvb6e36d991/web) supports titles, cast, genres, and natural-language queries. NHD-TV mirrors the useful interaction pattern without presenting provider-neutral catalog claims it cannot yet substantiate.

## Metadata aggregation research

The current zero-key discovery slice uses [TVmaze's public API](https://www.tvmaze.com/api), which permits image hotlinking but recommends caching. Its free data is licensed under CC BY-SA, so the UI visibly credits TVmaze. It covers television shows and does not establish where a title is available. Before public distribution, the project must confirm that the intended product/data distribution model satisfies the license and attribution requirements.

TMDB exposes an official [`search/multi` endpoint](https://developer.themoviedb.org/reference/search-multi) for movies, shows, and people, plus [watch-provider data](https://developer.themoviedb.org/reference/movie-watch-providers) powered by JustWatch. Its [FAQ](https://developer.themoviedb.org/docs/faq) requires TMDB attribution, requires JustWatch attribution for watch-provider data, and distinguishes non-commercial from commercial use. Provider data describes regional streaming, rental, and purchase availability, but explicitly does not supply full provider deep links.

The official [YouTube Data API `search.list` endpoint](https://developers.google.com/youtube/v3/docs/search/list) returns videos, channels, and playlists and supports region and language hints. It requires a Google Cloud project and credentials, and its search quota is separately constrained and may change. NHD-TV should not silently embed a shared developer key in a distributed desktop client.

## Recommended expansion path

1. Keep contextual provider search as the fast, private default while a service is open.
2. Keep TVmaze as a clearly attributed, TV-show-only discovery adapter while its license remains compatible with the distribution model.
3. Add an optional TMDB adapter for movies, people, and regional availability only after credentials and commercial-use terms are settled.
4. Display provider badges only when the configured region and availability type are known. Label unknown availability honestly.
5. Selecting a result should open an enabled provider's supported search route, not manufacture an unsupported title deep link. The user makes the final match inside the service.
6. Add YouTube result cards through its official API as a separate adapter. Use a protected NHD-TV backend for a distributed build, or an explicit bring-your-own-key developer mode; never ship a reusable secret in the desktop bundle.
7. Cache only public metadata with a short expiry. Keep viewing history, enabled services, queries, and account state local.
8. Do not scrape provider catalogs or inject discovery code into signed-in service pages. Provider adapters remain narrow navigation integrations.

This produces a dynamic Apple TV/Google TV-style result surface without pretending NHD-TV has a licensed, real-time view of every subscription catalog.

Before adding aggregated results, decide:

- whether the app is commercial and obtain compatible licenses;
- how region, subscription tier, rental, and purchase availability are represented;
- where required TMDB and JustWatch attribution appears at TV distance;
- whether users provide their own API key or NHD-TV operates a protected backend;
- how results deep-link into a service without persisting account or tracking parameters;
- cache duration, offline behavior, rate limits, and a provider outage fallback.
