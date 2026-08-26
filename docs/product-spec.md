# Product Specification

## Vision

NHD-TV turns a desktop computer connected to a television into a cohesive TV environment. It should feel closer to Google TV or Apple TV than to a collection of browser bookmarks while remaining locally controlled and extensible.

## Core lifecycle

1. NHD-TV opens fullscreen on the user's selected television display.
2. The home screen shows only services the active profile has enabled.
3. Selecting a service opens it inside NHD-TV using its persistent browser session.
4. The service owns browsing, playback, subtitles, seeking, and account behavior.
5. Back traverses the service's own navigation state.
6. Back at the service root displays a consistent NHD-TV quit confirmation.
7. Quitting checkpoints observed progress, closes or suspends the service, and restores home-screen focus.

Holding Back provides an emergency return when a service is frozen or its root state cannot be identified.

## Inputs

NHD-TV supports multiple input adapters that produce a shared set of application actions:

- Keyboard and mouse
- Xbox-style and compatible game controllers
- QR-paired phone remote over the local network

The NHD-TV shell uses row-aware spatial D-pad navigation. Service adapters may opt into a conservative DOM focus layer for browse screens, with a fixed host-provided focus overlay that remains visible above clipped carousels. Playback routes and fullscreen players retain the service's native keyboard behavior. Pointer input remains available through a mouse, and the phone remote provides an optional bounded precision pad.

The architecture must support both focused operation and a future native/global controller mode for cases where another application owns desktop focus.

The current controller foundation maps a standard Gamepad API layout: D-pad or left stick moves focus, A selects, B goes back, and Guide returns Home. View plus Menu is the Home fallback where Guide is unavailable. X toggles play/pause, Y sends mute, the bumpers seek, and the triggers send volume down/up. Hardware media keys and Command-or-Control plus Shift fallbacks use the same normalized action route. Services receive native media-key or keyboard events rather than player DOM manipulation; Netflix play/pause is normalized to Space. Volume bypasses the service and adjusts the host output in bounded steps. Physical Windows and HDMI-output validation plus nonstandard controller mappings remain release work.

## Home

The first home experience contains:

- Continue Watching
- Result-first TV-show discovery, local history matches, and app-owned catalog actions
- Enabled services
- Profile access
- App Library access
- Settings utility access

The first search slice is a privacy-scoped discovery surface. Before typing, it presents the active profile's recent Continue Watching items. While typing, it immediately filters renderer-safe local titles, subtitles, and service names. Queries of two or more characters are also sent to TVmaze after a debounce to retrieve attributed TV-show titles and posters; NHD-TV does not retain those queries. TVmaze results do not claim service availability. App-owned search actions appear on each discovered title and receive that title only when selected. From the phone remote while a searchable service is open, that service is still the default destination. Search routing never types into arbitrary focused fields. Movie/person aggregation, verified regional availability, algorithmic recommendations, direct microphone capture, and cloud synchronization remain later capabilities.

## Store

Apps and Store are separate TV destinations. Apps contains only installed launchers and a single Manage entry point per app. Store contains only uninstalled integrations, provides a local name filter, and retains the custom-service form. Store is not a payment or binary-download marketplace. Core, experimental, custom, and diagnostic integrations are visually separated so a new provider is never mistaken for a qualified one. Experimental providers use a compact multi-row grid that exposes the full catalog to mouse, D-pad, and precision navigation without clipping it into one long carousel.

- Adding a service enables its home tile.
- Removing a service hides it but preserves its login and local history.
- Clearing service data is a separate, explicit action.
- Users can reorder or favorite enabled services.
- Services display platform support and integration status.
- A custom-service flow accepts declarative configuration such as name, icon, URL, allowed origins, and root-page rules.

Executable third-party plugins and remotely downloaded adapter code are excluded from the first version. The current custom-service foundation accepts a name and HTTPS start page, allows only that exact origin, and creates a dedicated isolated session. Removing a custom integration also clears its partition and removes it from all profiles.

The current Apps foundation saves the enabled, ordered, and favorited Home lineup per local profile. Favorite, order, removal, and data controls live in the app-management dialog rather than under every card. Removing an item from Apps never clears its isolated service partition. Clearing a service session is a separately labeled, confirmed action that keeps the NHD-TV lineup and viewing history.

The current experimental catalog includes Prime Video, Hulu, HBO Max, Peacock, Paramount+, Apple TV, Plex, and Twitch. These use official HTTPS entry points, exact-origin navigation boundaries, and separate persistent partitions. They remain disabled by default and do not advertise search, playback observation, or compatibility until per-platform qualification is complete.

## Profiles and sessions

NHD-TV profiles have separate preferences and local viewing history. Streaming-service sessions are shared across NHD-TV profiles initially, and each service retains its own account/profile selection experience. Isolated service accounts per NHD-TV profile can be added later.

All profile information is stored locally in the first version. The current foundation supports creating and switching up to eight profiles. A profile switch checkpoints and closes the active service before replacing the lineup and Continue Watching view, preventing playback from being attributed to the wrong profile.

## Continue Watching

Continue Watching is passive. NHD-TV does not replace service playback controls or force local seeking.

For recognized playback, store:

- NHD-TV profile
- Service identifier
- Service content identifier when available
- Watch URL
- Title and episode metadata
- Artwork reference
- Observed playback position and duration
- Last engagement time

The listener qualifies actual played ranges, then checkpoints active playback shortly after engagement, periodically, and immediately on pause, navigation, service exit, shutdown, and completion. Service adapters distinguish meaningful visible playback from previews, cloud-position seeks, and background media. Reopening an item returns to its service URL and allows the service to apply its cloud-saved resume position. A local Remove action deletes only the NHD-TV history item and does not affect the service session or provider account.

The current foundation recognizes declared Netflix, YouTube, and Disney+ watch routes, requires a visible long-form media element and at least five seconds in its actual played ranges, strips undeclared URL parameters, and checkpoints shortly after qualification plus every ten seconds, pause, navigation, service exit, and window shutdown. It removes items observed at 95% completion or manually removed on Home. Resume URLs remain in the main process; the shell receives only display metadata and locally cached artwork.

## Phone remote

The desktop app exposes a local controller page and displays a compact top-right QR invite whenever no phone remote is connected. The invite disappears after connection. A default-on device setting may auto-approve only the first valid scan when no controller exists; users can disable it to require television approval for every scan, and additional phones always require approval before receiving a revocable device token.

The first remote slice provides a full-height phone controller with one flat minimalist surface: a circular directional pad, icon-only Back, Home, and tool actions, compact segmented playback and volume rows, a single bounded Search field, a three-app Quick Launch panel, and an optional relative precision pad. Its controls use non-selectable surfaces so an iPhone drag does not start a text-selection gesture; the intentional search input remains selectable. Quick Launch uses a profile-scoped most-recently-launched list that is persisted separately from Continue Watching and sends only service IDs through an authenticated endpoint. The remote itself is session-only. Global Search text is delivered to trusted main-process routing; it opens the active service's declared search destination or returns to the Home chooser. When the precision cursor selects an explicitly declared Netflix or YouTube search field or launcher, the same phone field switches into direct-entry mode and mirrors bounded text into the provider field, including native keyboard dictation and Enter submission. Launchers advertise the safe capability before selection, while a short post-click settle step handles providers that mount their input or textarea lazily. The host admits only the adapter's declared selectors and rejects login, password, payment, popup, custom-app, hidden, ambiguous, and arbitrary fields. The clean phone surface controls a persistent virtual cursor shown on the TV rather than duplicating its position under the user's finger. Swipes move that cursor with bounded acceleration, lifting preserves it for a recentered follow-up swipe, and a tap anywhere activates its current safe target. Vertical edge motion scrolls the page; horizontal edge motion scrolls only the active overflowing rail. Nearby controls add a hysteresis-backed locked-target state and one high-contrast focus frame without taking DOM focus. Native buttons, links, and declared fields outrank generic role or tabindex containers. Provider modals constrain snapping and directional focus to the visible modal without falling back to the obscured page. When Netflix opens title details without an existing in-modal focus, the actual Play or Resume control is the primary target; oversized wrappers and dimmed browse-page elements no longer compete. Netflix episodes highlight as full rows. The free cursor fades while locked, and all pointer treatment disappears after a short idle period without resetting the virtual cursor. The phone gives haptic feedback and the TV plays its navigation cue when the precision pad snaps to a new target.

Voice search initially uses the phone keyboard's native dictation button. Direct browser microphone capture requires a trusted HTTPS origin and a separate permission/privacy design; the LAN remote intentionally denies microphone, camera, and location access. The optional precision pad sends the resulting bounded virtual coordinates and a movement-scaled edge-drag value only after deliberate vertical movement. Coalesced touch samples reduce event noise, subpixel jitter is discarded, each input delta is capped, and a terminal tap bypasses a pending throttle timer. The host snaps only to visible controls plus a service's explicitly declared search input and performs a native tap only after a safe snap; arbitrary selectors, target metadata, credential/payment fields, popup windows, and permission surfaces remain out of scope.

## Desktop behavior

- Remember the selected television display.
- Reopen borderless and fullscreen.
- Hide the pointer after inactivity.
- Restore focus predictably when returning home.
- Handle sleep, wake, offline state, service crashes, and application updates.
- Avoid preventing system sleep unless active playback requires it.

The current device-settings foundation remembers fullscreen, selected display, compact/standard/wide safe-area margins, reduced motion, and first-remote auto-connect. The host checkpoints before suspend, probes an active service after resume, returns control to a host-owned recovery screen after a load failure, renderer crash, or hang, and offers Retry, Reload app, and Return Home without clearing service data. The phone and gamepad Back buttons provide a deliberate 1.2-second emergency return. Audio output, startup-at-login, pointer inactivity, packaged sleep/wake behavior, and updater behavior still require platform-specific qualification.

## Future multiview

Multiview is a planned, gated capability rather than an extension of the current one-active-service model. A spike must first prove two-up and four-up layouts, one active audio source, deterministic focus and Back behavior, independent service isolation, and acceptable decoder, GPU, memory, and bandwidth use on the Windows target. Simultaneous DRM sessions and provider restrictions must be tested before any production control is exposed.
