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

- [ ] Fullscreen display selection and persistence
- [x] Controller-first home navigation foundation
- [x] Keyboard and mouse support
- [x] Shared input-action router
- [ ] Xbox-style Gamepad API adapter (#20)
- [x] Service hosting and root-level quit overlay foundation
- Crash, reload, offline, and emergency-return behavior

## Milestone 2: Profiles, Store, and sessions

- [ ] Local profiles and per-profile viewing history (#22)
- [x] Curated service catalog foundation
- [x] Add and remove services without clearing sessions
- [ ] Reorder and favorite services
- Declarative custom services
- Session clearing and privacy controls

## Milestone 3: Continue Watching

- [x] Basic playback qualification and preview filtering
- [x] Title and allowlisted artwork capture foundation
- [x] Periodic, pause, navigation, exit, and window-shutdown checkpoints
- [x] Observed completion rule
- [x] Manual local removal
- [ ] Per-profile history and persistent hide controls (#22)
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
- [ ] Trackpad controls
- [ ] Reconnection across app restarts and persistent device management
- [x] Multiple phones within one app session

## Milestone 5: Search and discovery

- [x] TV search overlay and enabled-service launcher
- [x] Declarative Netflix and YouTube query routes
- [x] Disney+ browse-search fallback
- [x] Contextual Netflix and YouTube search from the phone remote
- [ ] Licensed cross-service metadata and regional availability (#19)
- [ ] Trusted local HTTPS and opt-in direct microphone capture (#21)
- [ ] Watchlist, favorites, and recommendation controls

## Milestone 6: Packaging and platform expansion

- Windows installer and update path
- macOS packaging, signing, and platform validation
- Linux packaging and documented DRM limitations
- Startup behavior, audio output, sleep/wake, and accessibility hardening
