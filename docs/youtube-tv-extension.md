# YouTube TV Mode extension

## Scope and safety boundary

NHD YouTube TV Mode is a presentation and input layer over the ordinary `https://www.youtube.com/` desktop application. YouTube remains responsible for authentication, accounts, recommendations, subscriptions, search, watch history, channels, playlists, playback, ads, accessibility semantics, and every network request. The extension does not include an ad blocker, request interceptor, analytics client, remote code, proprietary artwork, or a replacement player.

The extension requests only Chrome's `storage` permission. Its YouTube access comes from the single `content_scripts.matches` declaration. All JavaScript, CSS, and popup files are local to the extension.

## Repository audit

Before this work the repository did not contain a Manifest V3 extension or browser content-script bundle. It did contain a substantial Chromium integration:

- Castlabs Electron hosts each streaming service in one sandboxed `WebContentsView` with a persistent, isolated session.
- YouTube is already a declared service with narrow allowed origins, playback-route recognition, remote text-entry selectors, and a conservative host-injected DOM navigator.
- Keyboard, Xbox-style gamepad, and phone-remote adapters already normalize to `up`, `down`, `left`, `right`, `select`, and `back` actions.
- The host preserves native player input on watch routes and fullscreen pages.

The extension is loaded into the persistent YouTube session when NHD-TV opens YouTube. A DOM event bridge lets the existing keyboard/gamepad/phone action router use the extension navigator on browse routes. NHD-TV marks itself as the sole controller-input owner so its shell Gamepad adapter and the extension never generate duplicate moves. If the extension is unavailable or declines an action, the existing host navigator remains the fallback.

## Platform research

The four requested platforms do not expose four independently designed YouTube applications. Public material shows a largely shared, server-delivered living-room product with platform-specific controller labels and system Back/Home behavior. That is why this implementation extracts a common design language rather than copying one platform.

Sources reviewed in August 2026 include:

- YouTube's current [TV and game-console exploration guide](https://support.google.com/youtube/answer/7583931?hl=en), which documents left navigation, Home and Subscriptions grids, watch-page navigation, search, and remote control.
- YouTube's [smart-TV and game-console sign-in guide](https://support.google.com/youtube/answer/3015415?hl=en), which treats console and TV clients as the same living-room family and documents the left-hand navigation/account model.
- YouTube's design article, [Designing a richer YouTube experience for your TVs](https://blog.youtube/news-and-events/designing-a-richer-youtube-experience-for-your-tvs/), which emphasizes video-first presentation, remote simplicity, unobscured playback, and optional adjacent detail panels.
- YouTube's [2025 living-room strategy](https://blog.youtube/inside-youtube/our-big-bets-for-2025/), which identifies television as the primary US viewing device by watch time.
- The current [YouTube Apple TV listing](https://apps.apple.com/us/app/youtube/id544007664?platform=tv) and public tvOS captures, used to check card density, rail treatment, and focus scale.
- PlayStation's current [PS5 YouTube support page](https://www.playstation.com/es-es/support/hardware/ps5-youtube/) and the PS5 media-remote layout, used to check D-pad, Enter, Back, and transport expectations.
- Current Google TV reporting on the [2026 YouTube TV sidebar](https://9to5google.com/2026/05/08/youtube-app-tv-sidebar-subscription-library-access/) and [2025 TV-player redesign](https://www.androidauthority.com/youtube-tv-new-ui-rolling-out-3593165/), used to validate the compact rail and grouped player-control direction.
- Public Xbox captures and YouTube's console documentation. Current Xbox-specific application imagery is sparse, and older red-rail captures were deliberately not treated as a current visual source. Xbox contributes its stable D-pad/A/B interaction conventions, not an obsolete color treatment.

Shared patterns extracted from those sources:

- A nearly black, low-density canvas that makes thumbnails—not chrome—the dominant color.
- A narrow icon rail on the left that expands for labels and deeper destinations.
- A large route/category heading plus YouTube's real horizontal Home category chips, positioned below the TV-scale masthead instead of hidden behind it.
- Large 16:9 cards, usually three or four across at 1080p, arranged as vertical stacks of horizontal shelves.
- Shelf titles noticeably larger than card metadata, with substantial space between rows.
- Left/right movement contained within the current visual row and up/down movement preserving the viewer's approximate column.
- A highly visible rounded focus frame with only a small scale/lift animation.
- A player-first watch screen. Playback, ads, captions, settings, and transport controls stay official and unobscured; richer metadata can sit below or beside the player.
- Back closes the nearest transient surface before leaving the current route, and returning from playback restores the prior card/row when possible.

No YouTube, PlayStation, Xbox, Apple, or Google assets were copied into the extension.

## Extension architecture

- `manifest.json` declares MV3, the toolbar popup, the one YouTube match, document-start local scripts, the removable local stylesheet, and only `storage` permission.
- `src/selectors.js` centralizes custom-element, semantic, ARIA, and URL-pattern selectors, including YouTube's current category chip/tab renderers, plus route classification and visibility guards.
- `src/navigation.js` owns candidate reduction, modal confinement, spatial scoring, focus rendering, automatic scrolling, bounded infinite-scroll retries, per-route focus restoration, keyboard input, event-driven gamepad polling, player-first watch routing, and the NHD remote event bridge.
- `src/content.js` owns the enable/disable lifecycle, the extension-owned navigation rail, stylesheet injection/removal, route and fullscreen events, one mutation observer, route/card/shelf annotations, browser preferences, NHD-managed preferences, and selector-health diagnostics.
- `styles/tv.css` contains only rules rooted at `html.nhdtv-tv-mode`. It does not target YouTube's player control implementation.
- `popup/` contains the toolbar toggle, interface-size and safe-area selectors, and an active-page selector-health summary. Preferences apply immediately across open YouTube tabs and default to enabled/standard.

The lifecycle controller is a singleton. Repeated `yt-navigate-*` events and mutations reuse the same listener set and observer. Disabling TV Mode disconnects the observer, cancels animation/timer loops, removes all navigation/input listeners, clears focus state and restoration data, removes every extension attribute and class, and removes the stylesheet link. Only inert control-plane listeners remain in the isolated extension world: browser storage can re-enable the extension, NHD-TV can apply its persisted setting, and the popup can request a diagnostic snapshot. None performs page navigation while disabled.

TV Mode is installed at `document_start` using its default-on preference, before YouTube's desktop layout paints, and then reconciled with persisted browser or NHD-TV preferences. The compact Home/Search/Shorts/Subscriptions/You rail is extension-owned because YouTube's desktop mini-guide is not deterministic: current desktop builds may omit it until the hamburger control is activated. While TV Mode is on, that native hamburger/drawer is suppressed to prevent a duplicate or late-appearing sidebar. Rail destinations still use the corresponding native YouTube link when one is mounted, preserving client-side navigation; a normal same-origin YouTube link is the safe fallback. Turning TV Mode off removes the rail and its listener and restores the native guide immediately.

YouTube currently positions its Home category chip bar using the desktop `--ytd-toolbar-height` value (56px). TV Mode explicitly updates that layout contract to its 88px or UHD masthead height, scales the real category buttons for a remote, and adds a route-aware Home/Subscriptions/You heading ahead of the native content. The normal TV-width grid shows four of YouTube's own feed items at once, with five or more on wider displays and a smaller fallback on narrow windows. Tighter row and shelf spacing keeps the next personalized items visible without filtering ads, inventing recommendations, or replacing YouTube's category and feed data.

The Full screen player control remains YouTube's official control. A standard `fullscreenchange` listener marks the presentation state only; CSS then hides the extension rail and masthead, removes the rail's reserved page margin, and lets YouTube's fullscreen player occupy the complete viewport. Exiting fullscreen restores the exact prior TV layout. Theater mode remains a normal watch-page layout with the rail available.

## Spatial navigation and focus restoration

Candidate selection starts from native links, buttons, form fields, tabs, menu items, and semantic interactive roles. It then:

1. Rejects hidden, disabled, inert, zero-size, and player-contained elements.
2. Confines navigation to the top visible dialog or menu when one exists.
3. Collapses an ordinary video card to its primary watch/Shorts/playlist link so thumbnail, title, and wrapper links do not create duplicate stops.
4. Preserves every visible action inside YouTube advertising renderers.
5. Prefers real native controls over generic role/tabindex wrappers.

Horizontal scoring requires meaningful vertical overlap, keeping movement in one visual shelf. Vertical scoring favors the next row and the remembered horizontal center. The first Up action on a browse surface selects the visible, currently selected category tab when one exists; otherwise initial content focus starts in the topmost visible card row. Category focus scrolls only its horizontal chip container and never recenters the entire page. Moving left from the first content item enters the deterministic TV rail; Right returns to content. Focus uses the real DOM focus API plus a presentation attribute on the enclosing card/control. `scrollIntoView()` keeps content frames centered, while exhausted shelves/page ends trigger one bounded scroll and retry so YouTube can lazy-load more content.

The TV rail is intentionally not scrolled by `scrollIntoView()`. Its children fit the rail at both compact and expanded widths, horizontal overflow is clipped rather than scrollable, and moving within the rail resets any stale scroll offset. This prevents the clipped labels, jumping brand, and partially drawn focus frame that can otherwise occur when a wide menu item receives focus while the rail is still compact.

The extension remembers the latest focus identity for up to 20 routes in that tab's `sessionStorage`. Each entry contains only the route, normalized href/accessibility identity, shelf position, and candidate position. On any client-side return, bounded retries first match the original link/name, then the prior shelf column, then the prior route position as lazy content remounts. Records expire after 12 hours, and disabling TV Mode clears them.

Watch and Shorts routes start in player-first mode. Until a user explicitly focuses metadata, recommendations, or another control outside the player, the extension declines directional/selection keys so YouTube's official player keeps its normal shortcuts and the NHD host keeps its native media route. Visible YouTube dialogs still receive confined spatial navigation. In a standalone browser, gamepad B retains the expected Back behavior without taking over the player's directional controls.

## Install as an unpacked extension

Chrome:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select the absolute `extensions/youtube-tv` directory from this repository.
5. Pin **NHD YouTube TV Mode** from the Extensions menu.

Edge uses the equivalent `edge://extensions` page. Other Chromium browsers use their own extensions page but the same unpacked directory.

No build step is required. After editing an extension file, use **Reload** on the extension card and refresh YouTube once for the new code. Ordinary route changes after that do not require reloads.

## Operate TV Mode

- In a Chromium browser, open the extension toolbar popup to switch **TV Mode**, choose Compact/Standard/Large interface size, choose Compact/Standard/Wide screen margins, or inspect the current route's detected cards, shelves, and focus stops. Changes are immediate and persisted locally.
- In NHD-TV, open **Settings** and use **YouTube TV Mode**, **YouTube interface size**, and the shared **Screen margins** setting. These couch-accessible settings are authoritative for hosted YouTube and apply the next time it opens; if YouTube is already active, the host applies them immediately.
- Keyboard: Arrow keys move, Enter selects, and Escape or Backspace goes back. Escape remains native inside dialogs; text fields retain text-editing keys; the official player retains its normal shortcuts whenever it has focus.
- Standard gamepad: D-pad or left stick moves, A selects, and B goes back. Directional holds use a restrained delay/repeat rate. Polling runs only while a controller is connected.
- NHD-TV controller: D-pad/left stick and A/B follow the existing NHD mapping. The paired phone remote identifies YouTube as the active app, changes to its service accent, and uses the same directional path; holding a direction repeatedly advances a shelf at a controlled cadence. Media controls continue through the host's existing native-player route rather than DOM selectors.
- Mouse, touchpad, Tab navigation, links, dialogs, and YouTube accessibility behavior remain available.

On watch and Shorts pages player-first mode also protects native shortcuts when the document body—not an individual player button—has focus. The extension does not hide, overlay, or replace player controls or ads.

For controller qualification, open NHD-TV **Settings → Game controller**. The diagnostic identifies connected controller IDs/mappings and shows the last normalized input. This is the preferred way to record Apple TV/Google TV Bluetooth remote or HDMI-CEC adapters that do not present the standard Xbox/PlayStation mapping.

## Repair selectors after a YouTube DOM change

Start in `extensions/youtube-tv/src/selectors.js`; do not scatter a replacement selector through navigation or CSS.

1. Inspect the failing page in YouTube DevTools and identify a stable custom-element name, ARIA role/label, native element, or href pattern.
   The toolbar's **Page health** readout is the quickest first check: zero cards or focus stops on a populated browse page usually means a centralized selector needs repair.
2. Update the relevant centralized group: `cards`, `candidates`, `categoryBars`, `categoryTabs`, `dialogs`, `guideRoots`, `player`, `primaryCardLinks`, `searchFields`, `searchLaunchers`, or `shelves`.
3. Prefer a new custom-element selector such as `yt-…-view-model`, a semantic role, or a URL prefix. Avoid generated class names and positional selectors.
4. If a new card renderer needs TV typography, add it through the existing `[data-nhdtv-card]` annotation path rather than duplicating raw selectors throughout `tv.css`.
5. Run `pnpm typecheck`, `pnpm test`, and `pnpm build`. Reload the unpacked extension and repeat the manual matrix below.

Missing selectors are tolerated: empty candidate lists return control to YouTube or the NHD host fallback instead of throwing.

## Manual verification matrix

At both 1920×1080 and 3840×2160:

- Home: confirm the route heading and horizontal category text are visible below the masthead, confirm the TV rail is present before any click, move across category tabs and recommendation rows, enter/exit the rail, activate a video, then return and confirm focus restoration.
- Search: focus the real search input, type/edit/submit a query, then navigate result cards.
- Subscriptions, channel, and playlist: traverse grids, tabs, headers, and video entries.
- Shorts: verify the player and its controls keep native input.
- Watch: verify playback, ads, captions/settings, and seeking remain official and unobscured; enter fullscreen with YouTube's player button and confirm the video reaches the left edge with no TV rail or reserved gutter, then exit and confirm the rail returns. Verify the first directional key remains native, then navigate metadata/recommendations only after focus explicitly leaves the player.
- Dialog/menu: open a YouTube menu, verify focus remains inside it, close with Escape/B, and confirm the prior page focus remains sensible.
- Lazy/infinite content: hold Down near the end of mounted content and confirm one bounded scroll/retry loads the next cards without focus disappearing.
- SPA routes: repeat Home → video → Back → channel → video → Back without duplicate focus frames or repeated actions.
- Toggle: exercise both the browser popup and NHD-TV Settings. Turn TV Mode off while YouTube is open and verify the class, attributes, focus frame, style link, navigation listeners, observer, and gamepad polling are gone; turn it on without reloading.
- Controller: use NHD-TV's diagnostic with each physical remote/controller, verify one action per press and restrained repeat while held, and record any non-standard mapping before adding a narrowly scoped adapter.
- Console: repeat navigation for several minutes and confirm there are no extension errors.

Automated coverage validates the manifest/permission boundary, stylesheet scoping, teardown paths, spatial scoring, NHD remote bridge, existing host behavior, and the production build.

For an isolated live smoke pass, run `pnpm verify:youtube-tv`. It creates a temporary persistent Electron profile (required by Chromium extension loading), loads public YouTube pages, asserts that the route heading, rail, toolbar offset, and page offset exist on cold start without hamburger interaction, checks TV-scale category text, rail scroll stability, Search/Home/Subscriptions actions, the 1920×1080 and 3840×2160 layouts, and UHD typography. It sends the same native D-pad key codes as NHD-TV and exercises lazy loading, per-route restoration, search-field bypass, player-first watch input, dialog confinement, scale/safe-area preferences, repeated standalone and NHD-managed enable/disable cycles, sole host input ownership, and extension-attributed console errors. The temporary profile is removed when the verifier exits. Set `NHD_YOUTUBE_TV_SCREENSHOT_DIR` to capture visual-audit PNGs during the pass. A physical controller is still required for final hardware/Gamepad API qualification.
