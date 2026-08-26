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
- [x] Service hosting and root-level quit overlay foundation
- Crash, reload, offline, and emergency-return behavior

## Milestone 2: Profiles, Store, and sessions

- [ ] Local profiles
- [x] Curated service catalog foundation
- [x] Add and remove services without clearing sessions
- [ ] Reorder and favorite services
- Declarative custom services
- Session clearing and privacy controls

## Milestone 3: Continue Watching

- Playback qualification and preview filtering
- Metadata and artwork capture
- Periodic and lifecycle checkpoints
- Completion and manual-removal rules
- Resume through service-owned watch URLs

## Milestone 4: Phone remote

- [x] Session-only local controller server
- [x] Short-lived QR pairing and television approval
- [x] Revocable in-memory device tokens
- [x] Directional, Select, Back, and Home controls
- [ ] Trackpad controls
- [ ] Reconnection across app restarts and persistent device management
- [x] Multiple phones within one app session

## Milestone 5: Packaging and platform expansion

- Windows installer and update path
- macOS packaging, signing, and platform validation
- Linux packaging and documented DRM limitations
- Startup behavior, audio output, sleep/wake, and accessibility hardening
