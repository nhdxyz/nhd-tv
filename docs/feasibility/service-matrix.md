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

## Preliminary macOS run

Verified 2026-08-25 on Apple silicon (`darwin arm64`). These results exercise the harness but do not satisfy the Windows acceptance criteria.

| Service | Entry page | Login flow reached | Playback | Fullscreen | Notes |
| --- | --- | --- | --- | --- | --- |
| Netflix | Pass | Pass | Pending user login | Pending | The isolated app partition correctly started signed out even though the external browser already had a session. The user-controlled flow reached email verification; no identifier or code was captured. |
| YouTube | Pass | Pass | Pass, signed out | Retest pending | Google sign-in loaded through its explicit navigation-only origin. A public 10:34 video rendered and advanced in the embedded view. A child-view fullscreen bridge was added after the first request did not resize the host. |
| Disney+ | Pass | Pass | Pending user login | Pending | The isolated service reached the MyDisney login page without a renderer error. |

The initial YouTube load uncovered an expected same-origin redirect reported by Chromium as `ERR_ABORTED (-3)`. The host now tolerates that code only when the replacement URL remains on the service's exact allowlist; other load failures still close the service and surface an error.

## Windows 11 acceptance run

Record the exact Windows edition, version, OS build, CPU, GPU, display resolution and refresh rate, active audio output, and NHD-TV commit before testing. Use the target PC and television connection, not a remote browser session.

| Service | Manual login | Persists after full restart | Normal playback | Fullscreen enter/exit | Observed resolution | Hardware decode | CPU/GPU | Errors and limitations |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Netflix | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| YouTube | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |
| Disney+ | Pending | Pending | Pending | Pending | Pending | Pending | Pending | Pending |

For each service:

1. Start NHD-TV and open the service from the matrix.
2. Enter credentials directly into the service page. Do not enable application logging while entering credentials.
3. Close NHD-TV completely, restart it, reopen the service, and record whether the session persists.
4. Play ordinary subscription content for at least five minutes. Record visible player errors and the highest stable resolution the service itself reports.
5. Enter and exit the service's own fullscreen mode. Confirm NHD-TV remains the parent application and Escape does not strand a hidden window.
6. Use Windows Task Manager's GPU engine view to record whether the service renderer uses the GPU's Video Decode engine. Record approximate steady-state application CPU and GPU ranges after the first minute.
7. Return to NHD-TV and repeat once to catch session- or lifecycle-dependent failures.

## Current limitations

- Commercial playback and session persistence are not yet verified because the preliminary run did not receive or store user credentials.
- The fullscreen bridge needs a clean retest after the user-controlled Netflix verification flow is complete.
- Popup creation remains denied. If a service requires a popup rather than same-view authentication, document the failure before adding a narrowly scoped host-owned popup policy.
- Service-specific origin additions must be justified by an observed top-level login or playback navigation. Broad wildcard allowlists are not acceptable.
