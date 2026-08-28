# Spotify TV Mode

## Goal and research basis

NHD-TV uses Spotify's real Web Player rather than recreating its catalog or audio stack. The local Manifest V3 extension reshapes that provider-owned surface into a ten-foot UI aligned with Spotify's current television experience: horizontal Home/Search/Your Library destinations, large recommendation shelves, an always-available player, a dedicated Now Playing state, and strong focus feedback.

The implementation direction comes from Spotify's official [redesigned TV experience](https://newsroom.spotify.com/2023-11-09/find-your-favorite-audio-more-easily-with-the-redesigned-spotify-on-tv-experience/), its [Spotify on TV support guidance](https://support.spotify.com/us/article/spotify-on-tv/), and the protected-playback requirements in the official [Web Playback SDK documentation](https://developer.spotify.com/documentation/web-playback-sdk). NHD-TV does not claim to reproduce private console binaries or layouts pixel for pixel. It follows the documented interaction model while leaving dynamic content and playback under Spotify's control.

## Host fixes

Spotify served its compact preview experience when the embedded browser advertised an `Electron/<version>` token. NHD-TV removes only that token for Spotify while preserving the underlying Chromium user agent. The result is Spotify's complete Web Player: signed-in recommendations, library routes, track controls, and the bottom player.

The desktop preview attempted to open playback in another small window. Spotify-owned HTTPS window requests now navigate the existing service view instead. Lookalike hosts, custom ports, unrelated protocols, downloads, and native `spotify:` handoffs remain blocked. Protected-content permission remains restricted to `https://open.spotify.com`.

## TV presentation

The extension is loaded only into Spotify's persistent service partition. On `open.spotify.com` it adds:

- a compact television navigation bar with Home, Search, Your Library, and account access;
- a signed-out entry screen with one large **Sign in to Spotify** target;
- full-width recommendation shelves built from Spotify's own cards and data;
- larger detail heroes, track rows, action controls, and a persistent bottom player;
- removal of the desktop sidebar, native-app/download prompts, and desktop-only layout gaps;
- reduced-motion support and responsive television safe margins.

The provider's DOM remains the source of truth. Stable semantic attributes such as `data-encore-id="card"` and documented `data-testid` values are annotated instead of copying catalog data or injecting a replacement player. Annotation changes are diffed so the mutation observer settles rather than continuously rewriting the page.

## Playback from NHD-TV Home

The ordinary Home action backgrounds an open Spotify view instead of destroying it. Audio and Spotify's queue stay in the isolated persistent renderer, while the trusted NHD-TV shell regains focus and shows a compact Spotify panel with Previous, Play/Pause, Next, and Return to Spotify controls. Those buttons use the same normalized native-key route as the physical controller and phone remote; the shell does not call Spotify APIs or reproduce the queue.

Only Spotify receives this background-audio behavior. Opening another app closes the background Spotify renderer through the existing checkpoint path, while Force Home remains an explicit escape hatch that closes it immediately. The ambient display remains blocked while Spotify reports active playback.

The account page receives CSS-only ten-foot sizing plus a narrow remote-navigation annotation script. Spotify still owns every field, submission, identity decision, error, CAPTCHA, and redirect. NHD-TV never reads or fills credentials. Phone-remote text entry continues to reject login, email, username, password, payment, and other sensitive fields.

## Remote behavior

NHD-TV remains the sole input owner. Keyboard, controller, and paired-phone D-pad actions are normalized by the host and dispatched as one cancelable `nhdtv-remote-action` event. The Spotify navigator:

- selects the large sign-in action first while signed out;
- restricts candidates to visible TV targets;
- groups nested links and buttons into one card or track focus frame;
- preserves the intended column during vertical movement;
- keeps horizontal moves in the current row;
- scrolls the selected target into view;
- exposes player controls and the TV search field without giving the extension shell access.

Spotify's login page uses the same remote event path, with the email field as the initial D-pad target and the provider's Continue/social-login controls following geometrically. A physical keyboard may enter credentials after the remote selects a field. The local phone remote deliberately does not transmit credential text.

## Authentication persistence

The partition name starts with `persist:`, which retains normal DOM storage and persistent cookies. Electron's [Cookies documentation](https://www.electronjs.org/docs/latest/api/cookies) states that cookies without an expiration date are session cookies and are not retained between sessions. Spotify used such a cookie during the observed login, which explained why a successful session disappeared after a full process restart.

NHD-TV now promotes only cookies that satisfy every one of these conditions:

- the cookie is currently session-only;
- it is marked Secure;
- its domain is `spotify.com` or a dot-delimited Spotify subdomain;
- its name is not associated with CSRF, OAuth state, nonce, flow, CAPTCHA, PKCE, or challenge state.

The promoted cookie receives a maximum 30-day expiration and stays inside Spotify's isolated Electron cookie store. Cookie values are not logged, copied into NHD-TV state, sent to the shell, or exported. Provider logout/removal is respected, and **Clear data** deletes the entire Spotify partition.

## Qualification checklist

- Signed out: launch Spotify, press Down once, confirm the large sign-in action receives the only primary focus, and press Select.
- Login: confirm the account page stays inside NHD-TV, uses TV-scale fields and buttons, and can be traversed with the D-pad. Enter credentials yourself.
- Signed in: confirm personalized shortcuts and several provider recommendation shelves render without the desktop sidebar or Open/Install App actions.
- Browse: move through at least three shelves, then use Home, Search, and Your Library. Confirm one focus move per press and bounded repeat while held.
- Playback: start a track and confirm the same window displays an active bottom player whose time advances; test play/pause and previous/next from the remote.
- Home playback: while a track is playing, press Home and confirm audio continues, the Spotify Home panel reports Playing, and Previous, Play/Pause, Next, and Return to Spotify work from the remote.
- Persistence: close NHD-TV normally, relaunch, and confirm Spotify opens signed in. Repeat after an operating-system restart on the Windows release target.
- Logout/clear: log out through Spotify, then verify the sign-in screen returns. Separately verify NHD-TV's confirmed **Clear data** action removes the Spotify session without changing the local app lineup.

Automated coverage validates manifest scope, stable annotation, TV CSS scoping, signed-out routing, remote event ownership, visible card targeting, session-cookie boundaries, user-agent normalization, same-view navigation, type safety, and the production build. Provider DOM changes and physical controller behavior still require the manual matrix above.
