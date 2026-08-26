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

## Home

The first home experience contains:

- Continue Watching
- Enabled services
- Profile access
- Store access
- Settings

Universal cross-service search, algorithmic recommendations, voice control, and cloud synchronization are not MVP requirements.

## Store

The Store is a catalog of available service integrations, not a payment or binary-download marketplace.

- Adding a service enables its home tile.
- Removing a service hides it but preserves its login and local history.
- Clearing service data is a separate, explicit action.
- Users can reorder or favorite enabled services.
- Services display platform support and integration status.
- A custom-service flow accepts declarative configuration such as name, icon, URL, allowed origins, and root-page rules.

Executable third-party plugins and remotely downloaded adapter code are excluded from the first version.

The current Store foundation saves the enabled Home lineup locally. Removing an item from Home never clears its isolated service partition.

## Profiles and sessions

NHD-TV profiles have separate preferences and local viewing history. Streaming-service sessions are shared across NHD-TV profiles initially, and each service retains its own account/profile selection experience. Isolated service accounts per NHD-TV profile can be added later.

All profile information is stored locally in the first version.

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

The listener checkpoints active playback periodically and immediately on pause, navigation, service exit, shutdown, and completion. Service adapters distinguish meaningful playback from previews and background media. Reopening an item returns to its service URL and allows the service to apply its cloud-saved resume position.

## Phone remote

The desktop app exposes a local controller page and displays a QR code containing a short-lived pairing credential. The television requires confirmation before issuing a revocable device token.

The first remote slice provides directional navigation, Select, Back, and Home. It is session-only, requires television approval, and deliberately excludes all text entry so a phone cannot forward passwords or payment details. The phone gives haptic feedback only after a command is accepted when the browser supports vibration. Trackpad and carefully scoped non-sensitive text entry remain later capabilities; password entry is excluded until the channel has an appropriate encryption design.

## Desktop behavior

- Remember the selected television display.
- Reopen borderless and fullscreen.
- Hide the pointer after inactivity.
- Restore focus predictably when returning home.
- Handle sleep, wake, offline state, service crashes, and application updates.
- Avoid preventing system sleep unless active playback requires it.
