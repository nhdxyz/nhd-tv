# Roadmap

## Milestone 0: Feasibility

Prove the high-risk assumptions before building the product shell.

- Bootstrap the DRM-enabled desktop host.
- Test Netflix, YouTube, and Disney+ login and playback.
- Verify persistent and isolated service sessions.
- Prove navigation/root detection and quit behavior.
- Observe meaningful playback position without controlling the player.
- Benchmark startup, memory, hardware decode, and input latency.

The milestone passes only when results and limitations are documented. Unsupported service/platform combinations must be reported explicitly.

## Milestone 1: TV shell

- [x] Fullscreen display selection and persistence foundation (#27)
- [x] Controller-first home navigation foundation
- [x] Geometrically centered Home/Apps navigation with Settings moved to utilities (#29; unlocked macOS 1224×768 logical-viewport pass complete, 1080p/4K target validation remains)
- [x] Keyboard and mouse support
- [x] Shared input-action router
- [x] Shared phone, keyboard, and gamepad media controls with service-independent host volume (#43; Windows/HDMI qualification remains)
- [x] Xbox-style Gamepad API adapter foundation (#20; physical Windows validation remains)
- [x] Service hosting and root-level quit overlay foundation
- [x] In-service Back consumption and unclipped focus-overlay foundation (#18)
- [x] Crash, reload, offline, sleep/wake, and emergency-return foundation (#42; packaged platform qualification remains)

## Milestone 2: Profiles, Store, and sessions

- [x] Local profile creation, switching, lineup preferences, and per-profile viewing history foundation (#22)
- [x] Curated service catalog foundation
- [x] Experimental catalog and branded-card expansion (#30; provider qualification remains)
- [x] Add and remove services without clearing sessions
- [x] Reorder and favorite services (#26)
- [x] Same-origin declarative custom-service foundation (#26)
- [x] Confirmed per-service session clearing foundation (#3, #26)
- [ ] Custom icons, edit flow, multi-origin permission review, and broader privacy controls (#26)

## Milestone 3: Continue Watching

- [x] Basic playback qualification and preview filtering
- [x] Title and allowlisted artwork capture foundation
- [x] Periodic, pause, navigation, exit, and window-shutdown checkpoints
- [x] Observed completion rule
- [x] Manual local removal
- [x] Per-profile history foundation (#22)
- [ ] Profile rename/removal and persistent hide controls (#22)
- [ ] Per-service adapter qualification tests (#18)
- [x] Automated Netflix passive-observer qualification (#24)
- [x] Resume through service-owned watch URLs

## Milestone 4: Phone remote

- [x] Session-only local controller server
- [x] Short-lived QR pairing and television approval
- [x] Revocable in-memory device tokens
- [x] Directional, Select, Back, and Home controls
- [x] Bounded phone search with native keyboard dictation
- [x] Active-service contextual search routing
- [x] Optional bounded precision-pad navigation with target snapping and edge scrolling (#25)
- [x] Full-height phone layout with icon system controls and explicit precision-target feedback (#35)
- [x] Directional edge-drag scrolling, tap stabilization, free TV cursor, and scoped YouTube fullscreen (#36)
- [x] Adaptive pointer smoothing, snap hysteresis, proportional scrolling, and focus-safe hover (#37)
- [x] Continuous relative trackpad with lift-to-recenter and tap-anywhere selection (#38)
- [x] App-owned Home scrolling, idle cursor fade, and scoped provider keyboard handoff (#39)
- [x] Active-rail edge scrolling and provider search-field keyboard reliability (#39)
- [x] Single-layer service focus, contextual quit preview, and multi-row Store catalog (#40)
- [x] Zero-remote top-right QR invite and default-on first-scan auto-connect (#41)
- [x] Direct allowlisted Netflix/YouTube phone typing, precision navigation sound, and modal-scoped targeting (#39, #40)
- [x] Profile-scoped three-app Quick Launch and Netflix detail-modal Play/Resume focus (#43)
- [ ] Remembered-phone credentials and device management (#25)
- [ ] Reconnection across app restarts and persistent device management
- [x] Multiple phones within one app session

## Milestone 5: Search and discovery

- [x] Result-first TV search overlay with secondary provider actions (#31)
- [x] Recent Continue Watching discovery before typing
- [x] Dynamic active-profile Continue Watching matches
- [x] Declarative Netflix and YouTube query routes
- [x] Disney+ browse-search fallback
- [x] Contextual Netflix and YouTube search from the phone remote
- [x] Debounced TVmaze TV-show results with poster cards and explicit attribution (#31)
- [x] Per-result search actions for enabled services (#31)
- [ ] Supported YouTube television activation or external OAuth path (#11)
- [ ] Licensed cross-service metadata and regional availability (#19)
- [ ] Trusted local HTTPS and opt-in direct microphone capture (#21)
- [ ] Watchlist, favorites, and recommendation controls

## Milestone 5.5: Multiview feasibility

- [ ] Define two-up and four-up interaction and layout models (#28)
- [ ] Prove single-audio focus and independent per-tile service isolation
- [ ] Qualify simultaneous DRM sessions, hardware decoders, GPU, memory, and bandwidth on Windows
- [ ] Define Back, Home, fullscreen, failure, sleep/wake, and remote behavior before adding production UI

## Milestone 6: Packaging and platform expansion

- Windows installer and update path
- macOS packaging, signing, and platform validation
- Linux packaging and documented DRM limitations
- Startup behavior, audio output, sleep/wake, and accessibility hardening

Device-settings groundwork already includes persisted fullscreen, display cycling, safe-area margins, and reduced motion (#27). Audio routing, startup-at-login, and platform validation remain here.
