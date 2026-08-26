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

The one-active-service rule remains a stability boundary. Future multiview work (#28) must use separately isolated service views, one explicit audio-focus owner, bounded two-up/four-up layouts, and platform resource qualification. It must not reuse one service partition or renderer across tiles, and it cannot ship until simultaneous DRM/player behavior is proven.

Service pages never receive direct access to the application database, filesystem, remote server, or another service's session.

## Input routing

Keyboard, controller, and phone adapters emit normalized actions such as `up`, `down`, `left`, `right`, `select`, and `back`.

The shell's Gamepad API adapter polls connected standard-mapped controllers, applies a left-stick dead zone and bounded directional repeat, and submits only the normalized action vocabulary over a sender-validated IPC channel. The main process then applies the same overlay, shell, and active-service routing used by phone commands. It does not expose raw controller state to a service page.

The host decides whether an action belongs to the shell, the service, or an NHD-TV overlay. Back handling is stateful:

1. Let active fullscreen or service UI consume Back when appropriate.
2. Traverse service navigation.
3. At an adapter-defined root state, display the host-owned quit confirmation.
4. Provide a hold-to-force-return escape path.

The shell locks horizontal movement to the current labeled rail while vertical movement can cross sections. Curated service adapters can add a DOM-spatial layer on browse routes; it applies both an element marker and a fixed, pointer-transparent overlay so provider carousel clipping cannot hide focus. It falls back to native key events when no safe target is found. Watch/player routes and HTML fullscreen bypass and clear that layer.

On a non-root browse route, Back first sends one native Escape to the service. NHD-TV treats it as consumed when an editable field had focus, an in-service dialog/menu closes, or the service changes its route. Only otherwise does the host traverse Chromium navigation history. Declared roots still open the host-owned quit confirmation immediately.

The current phone-remote slice starts an HTTP server on a random port when the shell detects that no phone is connected. Its QR secret is 256-bit random data held in memory and expires quickly. A compact top-right invite shows that current code and disappears after a controller connects. A device-wide setting, enabled by default, permits only the first valid scan to be approved automatically when the connected-controller count is zero; disabling it restores explicit TV approval, and every additional phone always requires approval. The server returns a separate session-only controller token. Pairing and controller tokens are stored as hashes in the host, never logged, and revoked at app shutdown or an orderly phone-page disconnect. The local page has a restrictive Content Security Policy and accepts a fixed action vocabulary, one authenticated same-origin length-bounded search message, a narrowly allowlisted provider-text message, and a rate-bounded normalized pointer message.

The first implementation uses small authenticated HTTP requests for commands rather than a persistent WebSocket. A ten-second authenticated heartbeat distinguishes recently live phone pages from dormant but still session-authorized tokens, allowing the zero-remote QR to recover after an abrupt mobile close without forcing a sleeping phone to re-pair when it returns. This keeps the exposed local surface narrow while retaining adequate D-pad latency; the normalized action layer allows the transport to change later without changing shell or service routing.

The remote defaults to explicit arrows and offers a relative precision surface as an alternate input adapter. The phone owns one session-local virtual cursor and converts finger deltas into bounded, accelerated movement; touch-down never replaces the cursor with an absolute pad coordinate. The phone does not duplicate the cursor marker—the user follows it on the TV. Lifting and recentering the finger preserves the cursor, and a short tap anywhere submits a `tap` at its current position. The transport sends only coordinates in the closed `[0,1]` range, bounded horizontal and vertical edge-drag values, and a `hide`, `move`, or `tap` phase at a throttled rate. The host maps these to the visible shell or active service viewport, reuses one lightly interpolated pointer node, snaps to nearby visible controls, plays the same shell navigation cue when the locked target changes, and applies one high-contrast target marker before forwarding a native click. The free cursor fades while a target is locked so it does not compete with the focus frame. The app-owned Home shell scrolls its page directly so a horizontal rail cannot consume a vertical edge drag; a horizontal edge drag scrolls only the overflowing rail beneath the cursor. Services retain native wheel input. Snap hysteresis keeps the prior target through boundary jitter but yields immediately when the pointer enters a different control. When a visible service modal exists, candidate selection is confined to its outermost modal root; Netflix episode targets expand the frame to the enclosing episode row so dimmed browse cards and nested image links do not compete. The TV cursor and focus marker fade and are removed after 3.5 seconds without movement, while the phone retains the virtual position for the next swipe. Hover markers do not call DOM focus, terminal taps preempt a pending transport timer, and resting inside an edge zone never scrolls. Sign-in popups, credential/payment forms, hidden service views, and permission UI are excluded. Netflix and YouTube may declare narrowly qualified search fields and launchers; snapping to one returns only a boolean capability so a tap can synchronously open the phone's bounded search keyboard. After the native click, the host waits through a short bounded settle window and binds the single visible declared input or textarea that the provider focused or mounted. Phone input replaces text only in that safe provider field, uses the provider's native input event path, and submits with Enter. No DOM selector, target text, URL, or page content is accepted from or returned to the phone.

The service host owns exit confirmation. Before temporarily detaching a service view, it captures an in-memory frame and presents that frozen context behind the shell dialog. The preview never leaves the local renderer and is discarded when the user cancels or confirms. Precision cursors are hosted inside an open shell dialog's top layer, keeping its controls visible and selectable above the backdrop.

The host also owns failure recovery. Main-frame load failures, renderer termination, hangs, and failed post-resume probes detach the service view and emit only a sanitized service ID, name, failure kind, and user-facing detail to the shell. Retry reopens the last internally retained URL, Reload app starts from the service adapter's trusted start URL, and Return Home discards the recovery target. None of these paths clears the isolated service partition. Suspend checkpoints are bounded so a stalled provider cannot block the application lifecycle, and an emergency Back hold closes the service through the main process even when its renderer cannot respond.

Service permissions are denied by default and checked in both Electron permission paths. DRM and immersive fullscreen each use separate per-service HTTPS-origin allowlists. This lets a qualified playback origin such as `www.youtube.com` use its own fullscreen player while authentication origins and unqualified or custom services remain denied.

The LAN page is deliberately served without microphone permission. Browser media capture is a secure-context capability, while the current QR address is plain HTTP on a private-network IP. Voice input therefore uses native iOS or Android keyboard dictation in the bounded Search field until NHD-TV has a trusted local HTTPS design.

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

The custom-service MVP uses declarative manifests containing a local ID, name, and HTTPS start page. The host derives one exact allowed origin, a dedicated persistent partition, and a root URL. Playback observation, artwork capture, search routes, extra origins, and executable code are disabled. Arbitrary plugin execution requires a future permissions and signing model.

The App Library distinguishes core integrations from experimental catalog entries. Experimental entries may declare only their official start page, exact navigation origins, isolated partition, and DOM navigation mode. Search, playback observation, artwork capture, and compatibility stay disabled until each capability is individually qualified. This keeps catalog visibility separate from claims that a provider works.

Service popup policy never creates an unrestricted child window. A popup URL on the adapter's exact origin allowlist may open as a sandboxed, app-owned modal using the service's isolated session, preserving authentication opener/close semantics without weakening the navigation boundary. Its redirects are checked against the same allowlist. Every other popup is denied and only its origin is retained for diagnostics.

## Local data

Local profiles and per-profile preferences live in a separate versioned, owner-readable state file. Profile creation and switching pass through sender-validated IPC. Each profile has its own Continue Watching document and lineup preferences, while streaming-service session partitions remain shared initially. On first launch after the profile migration, the legacy Continue Watching document is copied into the default profile without deleting the source.

The first Continue Watching slice uses a versioned, owner-readable JSON document in the active profile's application-data directory. Version two adds optional episode/subtitle metadata while migrating version-one history in place. Writes use a temporary file and atomic rename. Private watch URLs never cross renderer IPC; service, title/subtitle, progress, duration, timestamp, and cached JPEG artwork form the renderer-safe view. The passive page observer remembers artwork from the most recently activated browse tile before a single-page transition to playback. Artwork is downloaded only over HTTPS from per-adapter host suffixes, checked again after redirects, size-limited, decoded, resized, and re-encoded before storage. Manual removal uses a narrow item-ID IPC action and never touches the service partition.

SQLite remains the target once profiles, ordering, migrations, manual removal, and larger libraries justify it. Browser cookies and other service session state remain in the runtime's session storage rather than being copied into application tables.

Lineup removal and service-data clearing are deliberately separate. The first changes only active-profile preferences. The second requires host-owned confirmation, closes that service if active, and calls Electron session storage clearing only for the selected registered partition.

Application-owned secrets must use operating-system-backed encryption where available. Linux must expose degraded-security states rather than silently treating weak storage as secure.

Device preferences share the versioned local-state document but are not profile-scoped. The host owns display enumeration, window movement, and fullscreen state; the shell receives only display labels/counts and submits a narrow preference object. Safe-area and reduced-motion choices are expressed as fixed enums rather than arbitrary CSS.

## Search boundary

Search adapters declare an allowlisted HTTPS search page and optionally a query parameter. The main process normalizes a maximum 120-character query, constructs the destination URL, and reuses the service's isolated partition. The query is not retained in application history or diagnostics. Services without a safe documented query parameter open their own search page instead.

The shell presents recent Continue Watching items before typing, then matches the normalized query against renderer-safe title, subtitle, and service fields already present in the active profile's Continue Watching view. These local results update while typing and resume through item-ID IPC; they do not expose stored watch URLs.

For two-character-or-longer Home queries, a separate narrow IPC route queries TVmaze's public show-search endpoint after a debounce. The trusted main process caps the query, JSON response, result count, poster bytes, image dimensions, cache lifetime, and accepted hosts. The shell receives sanitized public metadata and local poster data URLs. TVmaze attribution is visible, and the UI does not treat its title results as subscription availability. Provider search remains federated launching: NHD-TV does not scrape provider catalogs, and an enabled service receives a selected result title only after a user invokes that service's action.

## Performance strategy

- Keep only one service renderer active.
- Lazy-load and cache artwork with explicit size limits.
- Virtualize large home rows.
- Keep high-frequency playback observation outside shell render state.
- Measure cold startup, time to interactive, navigation latency, memory, dropped frames, hardware video decode, and recovery after sleep.
