# NHD Spotify TV Mode

This build-free Manifest V3 extension reshapes Spotify's real Web Player into a ten-foot interface for NHD-TV. It keeps Spotify responsible for authentication, catalog data, recommendations, playback, ads, and account availability. The extension adds a remote-first signed-out screen, TV navigation bar, provider-owned search route, large-screen styling, stable card/track annotations, and deterministic visible-target focus. Spotify's own account page receives larger television controls and the same host-owned D-pad bridge.

It does not use Spotify developer credentials, call Spotify APIs, replace audio playback, fill credentials, copy account data, or expose service-page content to the NHD-TV shell. NHD-TV loads it only into the isolated persistent Spotify session. See [the full design, security boundary, research, and qualification checklist](../../docs/spotify-tv-extension.md).
