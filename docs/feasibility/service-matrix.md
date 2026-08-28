# Commercial-service compatibility matrix

Status: in progress

Issue: #2

Primary acceptance platform: Windows 11 on the TV-connected PC

This document separates preliminary host checks from the acceptance run. A service is not marked compatible until manual login, persistence, normal playback, fullscreen, resolution, decode behavior, resource use, and errors have all been recorded on the Windows target.

Never paste account identifiers, credentials, verification codes, cookies, service URLs containing session state, or captured browser-session data into this file, terminal logs, commits, or GitHub comments.

## Host configuration

| Component | Current value |
| --- | --- |
| Castlabs ECS | `v43.2.0+wvcus` |
| Electron | `43.2.0` |
| Chromium | `150.0.7871.129` |
| Node.js | `24.18.0` |
| Widevine CDM | `4.10.3050.0` on the preliminary macOS run |
| Service isolation | One `persist:service-*` partition per service |
| Renderer policy | Sandbox and context isolation enabled; Node.js disabled |
| Built-in diagnostics | GPU video-decode capability, fullscreen state, blocked-navigation origin, and service/GPU process CPU and working-set memory; no page paths, query strings, account data, or content |

## Preliminary macOS run

Verified 2026-08-25 and 2026-08-27 on Apple silicon (`darwin arm64`). These results exercise the harness but do not satisfy the Windows acceptance criteria.

| Service | Entry page | Login flow reached | Playback | Fullscreen | Notes |
| --- | --- | --- | --- | --- | --- |
| Netflix | Pass | Pass; restart persistence confirmed | Pass after EVS production signing | Retest pending | Castlabs' production VMP Lab returned `PLATFORM_SOFTWARE_VERIFIED`. A sanitized in-app smoke test opened Netflix's official Test Patterns title, decoded video, accumulated real played time, and qualified the passive Continue Watching observer without E100. |
| YouTube | Pass | Previously observed; current smoke inconclusive | Pass | Pass | Google sign-in opens in a controlled, sandboxed NHD-TV window using YouTube's isolated session. The unsigned macOS passkey prompt remains unavailable, but Google's password fallback previously completed and an earlier smoke check observed YouTube's saved account control without reading account details. Two 2026-08-26 reruns showed neither a visible account nor Sign in control before timeout, so durable authentication needs a manual unlocked-window retest. On 2026-08-26, a public long-form video rendered and advanced in the embedded view; YouTube's own player button entered immersive fullscreen and its Exit full screen control returned cleanly to the watch page. Fullscreen permission is restricted to the declared `www.youtube.com` playback origin. |
| Disney+ | Pass | Pass | Pending user login | Pending | The isolated service reached the MyDisney login page without a renderer error. |
| Spotify | Pass | Pass; provider login completed in the active view | Pass; active track and advancing player observed | Not applicable | On 2026-08-27, the official Web Player loaded after the Electron product token was removed from Spotify's view-level user agent. A user-controlled login returned to signed-in recommendation shelves, and an active track with an advancing progress display remained in the one NHD-TV window. The dedicated TV Mode rendered Home/Search/Your Library navigation, a large signed-out entry screen, TV-scale shelves and player controls, and deterministic remote focus. A forced development-process restart confirmed Spotify's session-only login cookie was the remaining persistence failure; the adapter now promotes only secure Spotify-owned, non-transient session cookies to a maximum 30-day local lifetime. A repeat authenticated restart test is still required after signing in once on the updated build. |

## Experimental App Library entries

Prime Video, Hulu, HBO Max, Peacock, Paramount+, Apple TV, Plex, and Twitch are present in the App Library but are not compatibility claims. They are disabled on Home by default, use separate persistent partitions and exact official HTTPS origin boundaries, and expose no search or Continue Watching adapter yet. Each requires its own login, playback, DRM, fullscreen, Back/root, spatial-navigation, and resource qualification before its status can advance.

The initial YouTube load uncovered an expected same-origin redirect reported by Chromium as `ERR_ABORTED (-3)`. The host now tolerates that code only when the replacement URL remains on the service's exact allowlist; other load failures still close the service and surface an error.

## Windows 11 acceptance run

Record the exact Windows edition, version, OS build, CPU, GPU, display resolution and refresh rate, active audio output, and NHD-TV commit before testing. Use the target PC and television connection, not a remote browser session.

| Service | Manual login | Persists after full restart | Normal playback | Fullscreen enter/exit | Observed resolution | Hardware decode | CPU/GPU | Errors and limitations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Netflix | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| YouTube | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Disney+ | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Spotify | Pending | Pending | Pending | Not applicable | Audio only | Pending | Pending | Confirm account tier, protected playback, native media shortcuts, and Spotify Connect behavior. |

For each service:

1. Start NHD-TV and open the service from the matrix.
2. Enter credentials directly into the service page. Do not enable application logging while entering credentials.
3. Close NHD-TV completely, restart it, reopen the service, and record whether the session persists.
4. Play ordinary subscription content for at least five minutes. Record visible player errors and the highest stable resolution the service itself reports.
5. Enter and exit the service's own fullscreen mode. Confirm NHD-TV remains the parent application and Escape does not strand a hidden window.
6. Use Windows Task Manager's GPU engine view to record whether the service renderer uses the GPU's Video Decode engine. Record approximate steady-state application CPU and GPU ranges after the first minute.
7. Return to NHD-TV and repeat once to catch session- or lifecycle-dependent failures.

## Current limitations

- Netflix authentication persistence and preliminary macOS playback are verified after EVS production streaming signing. Reinstalling or updating ECS replaces the locally signed runtime, so the signing command must be rerun. Disney+ authentication remains pending.
- YouTube previously exposed its saved account control in the isolated session, but the latest automated reruns were inconclusive. Recheck the visible state in an unlocked window before marking persistence stable. Google's supported television activation remains worth evaluating for controller-only onboarding and is tracked in Issue #11.
- macOS platform passkeys are unavailable in the unsigned feasibility build. Electron requires app-specific WebAuthn configuration plus a matching code-signing keychain entitlement, and its Touch ID credentials are device-bound rather than inherited from an existing browser. The shell shows Google's tested password fallback; Windows Hello remains part of the Windows 11 acceptance run. Production macOS support is tracked in Issue #9.
- NHD-TV's built-in video-decode value reports Chromium capability, not proof that a particular frame was hardware-decoded. Confirm active use with Windows Task Manager's Video Decode engine.
- The fullscreen bridge needs a clean Netflix retest; playback is now unblocked.
- Spotify's entry and account controls render, but authenticated playback, session persistence, account-tier behavior, Spotify Connect handoff, and Windows media-key behavior remain unqualified. Spotify is intentionally excluded from video-oriented Continue Watching.
- Popups are allowed only when their URL matches the service adapter's exact origin allowlist or a narrowly declared provider-owned HTTPS host family. They open as sandboxed, app-owned modal windows in the same isolated service session; lookalike suffixes, custom ports on host-family matches, nested popups, and unexpected origins remain denied. DRM and fullscreen permissions stay exact-origin only.
- Service-specific origin additions must be justified by an observed top-level login or playback navigation. Broad wildcard allowlists are not acceptable.
