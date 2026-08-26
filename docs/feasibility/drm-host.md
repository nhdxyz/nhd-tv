# DRM host feasibility result

Status: passed on the primary development machine

Verified: 2026-08-25

Platform: macOS, Apple silicon (`darwin arm64`)

This result covers the secure desktop host and Widevine pipeline. Preliminary commercial-service results are covered by the playback matrix in Issue #2 and still require Windows 11 validation on the target television PC.

## Runtime

| Component | Verified version |
| --- | --- |
| Castlabs ECS release | `v43.2.0+wvcus` |
| Electron | `43.2.0` |
| Chromium | `150.0.7871.129` |
| Node.js | `24.18.0` |
| Widevine CDM | `4.10.3050.0` |
| Shaka Player demo | `5.2.7` (uncompiled demo) |

The ECS dependency is pinned in `package.json` rather than floating on a release channel.

## First-launch behavior

`pnpm install` installs the JavaScript dependency graph. `pnpm runtime:install` explicitly downloads the matching ECS native application bundle. On the first application launch, ECS installs or discovers the Widevine component. NHD-TV now awaits `components.whenReady()` before creating its first browser window or service session, as required by ECS.

The downloaded ECS runtime begins with a development-only VMP signature. The project-local `evs:*` commands set up, production-sign, and verify that runtime without committing EVS tooling or credentials. After EVS signing, Castlabs' official production VMP Lab returned `PLATFORM_SOFTWARE_VERIFIED`, and the Netflix Test Patterns smoke test decoded and advanced beyond two seconds without E100.

The shell applies a 30-second component-readiness timeout and displays the resulting status. The verified first launch reported Widevine as `new` and ready. Later launches may report a different lifecycle status while keeping the same installed version.

First launch requires network access. The native runtime and Widevine component are local generated dependencies and are excluded from version control.

## Manual verification

1. Ran `pnpm check` successfully.
2. Started the host with `pnpm start`.
3. Confirmed the trusted shell loaded from `app://shell/index.html`.
4. Opened the configured Shaka Player HTTPS service in a `WebContentsView`.
5. Selected `Sintel 4k (multicodec, Widevine, ads)`, whose manifest declares Widevine DRM.
6. Confirmed all three preroll ads completed and the encrypted main presentation advanced to `1:51 / 14:48`.
7. Pressed Escape and confirmed the service view was removed, the shell remained active, and the active-service value returned to `None`.
8. Observed no application errors in the launch terminal during playback or service removal.

Automated verification passed with seven test files and 23 tests. TypeScript checking, renderer production build, and compiled-preload verification also passed.

## Isolation controls

The service view is created with:

- sandboxing enabled;
- context isolation enabled;
- Node.js integration disabled;
- a dedicated persistent session partition;
- an exact HTTPS top-level-origin allowlist;
- popups and downloads denied;
- media-key-system permission limited to the configured service origin; and
- no preload script or direct IPC bridge.

The host shell also uses sandboxing, context isolation, disabled Node.js integration, a restrictive Content Security Policy, and a small self-contained preload allowlist.

## Known limits

- This verification is macOS-only. Windows 11 is the primary product target and remains mandatory for the service playback matrix.
- The spike is not packaged or application code-signed. The current local ECS runtime has a production streaming VMP signature, but reinstalling or updating the runtime replaces it and requires `pnpm evs:sign:dev` again.
- Because the macOS spike is unsigned, Electron's app-specific Touch ID WebAuthn integration is not configured. Google sign-in remains available through its `Try another way` password fallback.
- Popup handling is intentionally denied pending an explicit OAuth and service-popup policy.
- Escape immediately removes the service for this spike. Nested Back detection, a quit prompt at the service root, and emergency return behavior are tracked in Issue #4.
- The Netflix compatibility smoke test used its isolated saved service session. No credentials, cookies, profile names, titles from viewing history, or tokenized URLs were logged or copied.
