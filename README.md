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
- The initial feasibility matrix covers Netflix, YouTube, and Disney+.
- Keyboard and mouse, Xbox-style controllers, and a locally paired phone remote are first-class input methods.

## Current host spike

The first spike uses Castlabs Electron for Content Security (ECS) to run a trusted local shell beside an isolated streaming-service view. Its full-bleed TV shell includes Home, a local Store, Settings, passive Continue Watching with cached artwork, federated service search, branded service rails, row-aware spatial focus, configurable navigation sounds, secure QR phone pairing, and a collapsed engineering panel. The host includes a Shaka Player Widevine test service, narrow IPC, strict navigation rules, service-aware Back/quit behavior, privacy-safe compatibility diagnostics, and automated security-policy tests.

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

In the feasibility shell, select a service from Home or the Store. The Shaka entry is the public Widevine test; commercial-service credentials must be entered directly into their isolated service pages. Back/Escape traverses the service first. At a declared service root, NHD-TV shows its own confirmation before returning Home. Authentication popups on exact adapter origins open as sandboxed, app-owned windows using the same isolated service session; unexpected origins remain blocked.

To use a phone as a session-only remote, choose **Pair a phone** in the top bar or Settings, scan the short-lived QR code from a phone on the same trusted network, and approve the request on the TV. The local controller sends directional, Select, Back, and Home actions plus one bounded search phrase. It cannot target credential or payment fields. Use the microphone on the phone's native keyboard for voice dictation. Supported phones provide light haptic confirmation after the TV accepts an action. Restarting NHD-TV revokes all paired phones.

Continue Watching observes recognized long-form playback every ten seconds and on key lifecycle events. It stores progress and sanitized resume links only in local application data; the shell never receives the private link. Search starts in NHD-TV and opens the selected enabled service. Netflix and YouTube accept a prefilled query; Disney+ opens its own search page.

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
- [Roadmap](docs/roadmap.md)
- [DRM host feasibility result](docs/feasibility/drm-host.md)
- [Commercial-service compatibility matrix](docs/feasibility/service-matrix.md)
- [Search design and research](docs/search-design.md)

Streaming-service credentials and cookies stay in per-service persistent Electron session partitions and must never be committed.

## Development workflow

Work is tracked with GitHub issues and milestones. Each meaningful change should:

1. Reference an issue with explicit acceptance criteria.
2. Be developed on a focused branch.
3. Be committed in small, coherent, working checkpoints.
4. Be verified before its issue is closed.

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.
