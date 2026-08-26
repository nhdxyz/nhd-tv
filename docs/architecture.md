# Architecture Notes

## Status

These notes record the current direction, not a final framework commitment. The DRM and service-host feasibility milestone is a release gate.

## Runtime candidate

Castlabs Electron for Content Security is the leading candidate because it provides a consistent Chromium runtime and a supported path for installing Widevine. Stock Electron is not assumed to satisfy commercial DRM requirements. Tauri remains unattractive for this product because it uses different system webviews across Windows, macOS, and Linux.

The host must await `components.whenReady()` before creating any browser window or service session. ECS downloads are development VMP-signed and can prove the media pipeline against Widevine UAT, but production services require a production VMP signature. NHD-TV uses Castlabs EVS for that signing step. On macOS it must run before application code-signing; on Windows it must run after application code-signing. The local development bundle is not re-signed with an ad-hoc Apple identity; application code-signing belongs to the packaged-build pipeline.

## Process and view boundaries

The desktop host owns one fullscreen window on the chosen display.

- A trusted shell renderer displays NHD-TV.
- At most one active service `WebContentsView` is presented above the shell.
- Service views use sandboxing, context isolation, disabled Node.js integration, and narrow IPC.
- Each service uses an explicit persistent session partition.
- Leaving a service may suspend it briefly for fast return, then destroy its renderer while preserving session data.

Service pages never receive direct access to the application database, filesystem, remote server, or another service's session.

## Input routing

Keyboard, controller, and phone adapters emit normalized actions such as `up`, `down`, `left`, `right`, `select`, and `back`.

The host decides whether an action belongs to the shell, the service, or an NHD-TV overlay. Back handling is stateful:

1. Let active fullscreen or service UI consume Back when appropriate.
2. Traverse service navigation.
3. At an adapter-defined root state, display the host-owned quit confirmation.
4. Provide a hold-to-force-return escape path.

The shell locks horizontal movement to the current labeled rail while vertical movement can cross sections. Curated service adapters can add a DOM-spatial layer on browse routes; it applies a visible focus marker and falls back to native key events when no safe target is found. Watch/player routes and HTML fullscreen bypass that layer.

The current phone-remote slice starts an HTTP server on a random port only when pairing is requested. Its QR secret is 256-bit random data held in memory and expires quickly. Scanning creates a pending request; the TV must approve it before the server returns a separate session-only controller token. Pairing and controller tokens are stored as hashes in the host, never logged, and revoked at app shutdown. The local page has a restrictive Content Security Policy and accepts only a fixed action vocabulary. It intentionally has no text-entry channel.

The first implementation uses small authenticated HTTP requests for commands rather than a persistent WebSocket. This keeps the exposed local surface narrow while retaining adequate D-pad latency; the normalized action layer allows the transport to change later without changing shell or service routing.

## Service adapters

A versioned adapter contract will separate common hosting from service-specific behavior. Expected capabilities include:

- Allowed origins and navigation policy
- Home and root-state detection
- Authentication popup handling
- Playback-route recognition
- Passive media observation
- Metadata and artwork extraction
- Optional spatial-navigation enhancement
- Platform support declarations

The custom-service MVP uses declarative manifests. Arbitrary plugin execution requires a future permissions and signing model.

Service popup policy never creates an unrestricted child window. A popup URL on the adapter's exact origin allowlist may open as a sandboxed, app-owned modal using the service's isolated session, preserving authentication opener/close semantics without weakening the navigation boundary. Its redirects are checked against the same allowlist. Every other popup is denied and only its origin is retained for diagnostics.

## Local data

SQLite is the leading store for profiles, enabled services, ordering, viewing progress, paired remotes, and settings. Browser cookies and other service session state remain in the runtime's session storage rather than being copied into application tables.

Application-owned secrets must use operating-system-backed encryption where available. Linux must expose degraded-security states rather than silently treating weak storage as secure.

## Performance strategy

- Keep only one service renderer active.
- Lazy-load and cache artwork with explicit size limits.
- Virtualize large home rows.
- Keep high-frequency playback observation outside shell render state.
- Measure cold startup, time to interactive, navigation latency, memory, dropped frames, hardware video decode, and recovery after sleep.
