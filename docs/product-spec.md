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

The NHD-TV shell uses row-aware spatial D-pad navigation. Service adapters may opt into a conservative DOM focus layer for browse screens, with a visible host-provided focus ring. Playback routes and fullscreen players retain the service's native keyboard behavior. Pointer input remains available through a mouse, and a phone trackpad can be added later.

The architecture must support both focused operation and a future native/global controller mode for cases where another application owns desktop focus.

The current controller foundation maps a standard Gamepad API layout: D-pad or left stick moves focus, A selects, B goes back, and Guide returns Home. View plus Menu is the Home fallback where Guide is unavailable. Physical Windows validation and nonstandard controller mappings remain release qualification work.

## Home

The first home experience contains:

- Continue Watching
- Search across enabled service integrations
- Enabled services
- Profile access
- Store access
- Settings

The first search slice is a privacy-scoped launcher: NHD-TV accepts a title, person, genre, or topic and lets the user choose an enabled service. From Home, integrations with a declared query URL receive the text only after they are selected; integrations without one open their own search screen. From the phone remote while a searchable service is open, that service is the default destination and its adapter opens the supported search route directly. Search routing never types into arbitrary focused fields. Aggregated cross-service metadata results, algorithmic recommendations, direct microphone capture, and cloud synchronization are later capabilities.

## Store

The Store is a catalog of available service integrations, not a payment or binary-download marketplace.

- Adding a service enables its home tile.
- Removing a service hides it but preserves its login and local history.
- Clearing service data is a separate, explicit action.
- Users can reorder or favorite enabled services.
- Services display platform support and integration status.
- A custom-service flow accepts declarative configuration such as name, icon, URL, allowed origins, and root-page rules.

Executable third-party plugins and remotely downloaded adapter code are excluded from the first version.

The current Store foundation saves the enabled, ordered, and favorited Home lineup per local profile. Removing an item from Home never clears its isolated service partition. Clearing a service session is a separately labeled, confirmed action that keeps the NHD-TV lineup and viewing history.

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

The desktop app exposes a local controller page and displays a QR code containing a short-lived pairing credential. The television requires confirmation before issuing a revocable device token.

The first remote slice provides directional navigation, Select, Back, Home, and a single bounded Search field. It is session-only and requires television approval. Search text is delivered only to trusted main-process routing; it opens the active service's declared search destination or returns to the Home chooser. It cannot target a service login, password, payment, or arbitrary form field. The phone gives haptic feedback only after an action is accepted when the browser supports vibration.

Voice search initially uses the phone keyboard's native dictation button. Direct browser microphone capture requires a trusted HTTPS origin and a separate permission/privacy design; the LAN remote intentionally denies microphone, camera, and location access. The current optional swipe pad converts a tap or completed cardinal swipe into the same narrow actions as the arrow buttons; free cursor control and raw coordinate forwarding remain out of scope.

## Desktop behavior

- Remember the selected television display.
- Reopen borderless and fullscreen.
- Hide the pointer after inactivity.
- Restore focus predictably when returning home.
- Handle sleep, wake, offline state, service crashes, and application updates.
- Avoid preventing system sleep unless active playback requires it.

The current device-settings foundation remembers fullscreen, selected display, compact/standard/wide safe-area margins, and reduced motion. Audio output, startup-at-login, pointer inactivity, sleep/wake recovery, and updater behavior still require platform-specific qualification.
