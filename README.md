# NHD-TV

NHD-TV is a controller-friendly desktop TV environment for Windows, macOS, and Linux. The project is currently in Milestone 0: feasibility, where the highest-risk assumptions are tested before the full product shell is built.

## Product model

- NHD-TV is the parent TV environment.
- Streaming services run as child applications inside NHD-TV.
- Each service owns its browsing and playback interfaces.
- Back traverses the service until its root screen, where NHD-TV asks whether to quit the service.
- Continue Watching observes service playback without replacing service controls or resume behavior.
- The Store lets users enable only the services they want on their home screen.

## Initial targets

- Windows is the first polished platform.
- macOS and Linux remain architectural targets from the beginning.
- The core app catalog covers Netflix, YouTube, Disney+, and Spotify.
- Keyboard and mouse, Xbox-style controllers, and a locally paired phone remote are first-class input methods.

## Current host spike

The first spike uses Castlabs Electron for Content Security (ECS) to run a trusted local shell beside an isolated streaming-service view. Its full-bleed TV shell includes Home, a local Store with Netflix, YouTube, Disney+, Spotify, and preview integrations, local profiles with separate lineups and viewing history, Settings, passive Continue Watching with cached artwork, federated service search, branded service rails, row-aware spatial focus, configurable navigation sounds, Xbox-style Gamepad API input, secure QR phone pairing, and a collapsed engineering panel. The host includes a Shaka Player Widevine test service, narrow IPC, strict navigation rules, service-aware Back/quit behavior, host-owned offline and crash recovery, privacy-safe compatibility diagnostics, and automated security-policy tests.

YouTube also has a local, build-free [Manifest V3 TV Mode extension](extensions/youtube-tv/README.md). NHD-TV loads it into the isolated YouTube session, applies the persisted TV Mode/scale/safe-area settings, and bridges the existing keyboard, gamepad, and paired-phone action router into its richer 10-foot navigator. NHD-TV remains the sole controller-input owner, preventing duplicate actions. The same directory can be loaded unpacked in Chrome-family browsers, where its toolbar popup enables or completely disables TV Mode, adjusts presentation scale, and reports selector health without reloading the page.

## Development setup

Prerequisites:

- Node.js 24.3 or newer
- pnpm 11.9.0
- Internet access on first launch so ECS can install its native runtime and Widevine component

Install and verify:

```sh
pnpm install
pnpm runtime:install
pnpm check
pnpm start
```

In the feasibility shell, select a service from Home or the Store. The Shaka entry is the public Widevine test; commercial-service credentials must be entered directly into their isolated service pages. Back/Escape first lets an editable field, open dialog, or expanded in-service menu consume the action, then traverses service history. At a declared service root, NHD-TV shows its own confirmation before returning Home. Authentication popups on exact adapter origins or explicitly declared provider-owned HTTPS subdomains open as sandboxed, app-owned windows using the same isolated service session; lookalike domains, arbitrary ports, unrelated identity-provider domains, and unexpected custom protocols remain blocked. Spotify's redundant native-app handoff is hidden because Spotify already runs inside NHD-TV.

To use a phone as a session-only remote, choose **Pair a phone** in the top bar or Settings, scan the short-lived QR code from a phone on the same trusted network, and approve the request on the TV. The full-height controller is styled as one restrained matte hardware remote rather than a stack of decorative cards: icon-only Back and Home controls, a circular directional pad, a segmented volume rocker, compact transport keys, and labeled Pointer, Apps, and Search tools. A slim status strip identifies the app being controlled and uses a small YouTube, Netflix, Disney+, or Spotify accent instead of changing the whole surface. Hold any direction to move repeatedly through a long shelf; the first repeat waits 380 ms and then advances at a restrained television cadence. It can switch to an optional Apple-style relative precision pad. Playback and volume controls provide rewind, an SVG play/pause control, fast-forward, volume down, mute, and volume up. The recent-apps tool opens the active profile's three most recently launched apps; this small launch history is stored independently of Continue Watching. Hold Back for 1.2 seconds to force an emergency return Home if a service is frozen. The pad is a clean, non-selectable gesture surface while the TV shows the persistent cursor: swipe from anywhere to move it, lift and recenter the finger to continue, or tap anywhere on the pad to select its current safe target. Movement uses a jitter dead zone and bounded acceleration. Dragging outward at the top or bottom scrolls the page proportionally; dragging left or right while the cursor is over an overflowing rail scrolls only that rail. Nearby visible controls use target hysteresis before snapping into one high-contrast focus frame on the TV, with the free cursor hidden while locked. Native buttons and links outrank generic role or tabindex wrappers, preventing a large layout container from stealing the focus frame. The TV cursor and focus treatment fade after 3.5 seconds of inactivity without resetting their stored position. Hover does not take DOM focus. When Netflix opens a title-detail modal, directional focus is confined to that modal and the actual Play or Resume control becomes the initial action instead of a wrapper or dimmed browse-page element. The remote also sends one bounded search phrase. While Netflix, YouTube, or Spotify is open, phone search stays in that service and opens its prefilled search results; selecting one of those services' explicitly declared search fields or launchers opens the phone keyboard, then NHD-TV binds the provider field after any lazy UI transition. Disney+ opens its search page. From Home, search uses the enabled-service chooser. Pointer routing cannot target credential, payment, permission, popup, hidden, custom-app, or undeclared editable surfaces. Use the microphone on the phone's native keyboard for voice dictation. Supported phones provide light haptic confirmation after the TV accepts an action or locks onto a new target. Restarting NHD-TV revokes all paired phones.

Continue Watching qualifies recognized, visible long-form playback from actual played media ranges, then checkpoints after initial engagement, every ten seconds, and on key lifecycle events. It stores progress and sanitized resume links only in local application data; the shell never receives the private link. Home cards can be resumed through the provider or removed locally without clearing the provider session. Search updates as the user types, offers matching items from the active profile's Continue Watching history, and then opens the selected enabled service. Netflix, YouTube, and Spotify accept a prefilled query; Disney+ opens its own search page.

An Xbox-style controller uses the D-pad or left stick for navigation, A for Select, B for Back, and Guide for Home. If a browser does not expose Guide, pressing View and Menu together provides the Home fallback. X toggles play/pause, Y sends mute, the bumpers rewind and fast-forward, and the triggers send volume down and up. Directional holds have a bounded repeat delay and use the same host action router as the phone remote. Hardware media keys use that router too. Fallback keyboard controls hold Command-or-Control plus Shift with Space for play/pause, Left/Right for seeking, Minus/Plus for volume, or M for mute. Volume actions now adjust the host operating system's output in five-percent steps instead of depending on a streaming page to honor a media key, and the remote reports when that route is unavailable. Netflix and Spotify play/pause use their supported Space-key path; Spotify maps the transport pair to its documented previous/next shortcuts instead of the library and queue shortcuts on Left/Right. HDMI/television volume still depends on the selected output and platform rather than CEC control from NHD-TV.

Store choices belong to the active local profile. Services can be favorited and reordered for Home. Removing a service from Home keeps its login; **Clear data** is a separate confirmed action that clears only that service's isolated local session.

The Store also accepts declarative custom services with a name and HTTPS start page. NHD-TV derives an exact same-origin navigation boundary and a dedicated local session; custom entries cannot execute plugin code, observe playback, or inject search behavior. Removing a custom integration clears its partition and removes it from all local profiles.

Device-wide television settings persist the selected display, launch-fullscreen behavior, safe-area margin, reduced-motion preference, and ambient-display choices. The default-on ambient display appears after ten idle minutes, pauses while video is playing, and offers Digital, Analog, Minimal, Flip, Neon, and Orbit clock themes with five-, ten-, or thirty-minute delays plus an immediate Preview action. The display card cycles NHD-TV across connected screens; audio routing and startup-at-login remain platform milestones.

### Production Widevine signing

The ECS download is VMP-signed for development. Public Widevine test content works with that signature, but commercial production license services require a production signature. Castlabs provides free production signing through its EVS service; signup requires a user-controlled email verification and password. The current macOS development runtime has been EVS-signed and passes both Castlabs' production VMP endpoint and Netflix Test Patterns playback.

```sh
pnpm evs:setup
pnpm evs:signup
pnpm evs:sign:dev
pnpm evs:verify:dev
```

Run signup yourself in a private terminal; do not share the account password or verification code. Re-run `evs:sign:dev` after reinstalling or updating the ECS runtime. The optional `pnpm start -- --netflix-smoke-test` command uses the saved Netflix service session to play Netflix's official Test Patterns title and emits only a sanitized pass/fail result. `pnpm start -- --youtube-auth-smoke-test` verifies the visible YouTube account state or Sign in route without reading account details. Packaged releases will run production VMP signing before application code-signing on macOS and after application code-signing on Windows.

## Project documents

- [Product specification](docs/product-spec.md)
- [Architecture](docs/architecture.md)
- [Continue Watching adapter notes](docs/continue-watching.md)
- [Roadmap](docs/roadmap.md)
- [DRM host feasibility result](docs/feasibility/drm-host.md)
- [Commercial-service compatibility matrix](docs/feasibility/service-matrix.md)
- [Search design and research](docs/search-design.md)
- [YouTube authentication decision](docs/youtube-auth.md)
- [YouTube TV Mode extension, research, controls, and selector repair](docs/youtube-tv-extension.md)

Streaming-service credentials and cookies stay in per-service persistent Electron session partitions and must never be committed.

## Development workflow

Work is tracked with GitHub issues and milestones. Each meaningful change should:

1. Reference an issue with explicit acceptance criteria.
2. Be developed on a focused branch.
3. Be committed in small, coherent, working checkpoints.
4. Be verified before its issue is closed.

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.
