# NHD YouTube TV Mode

This directory is a complete, build-free Manifest V3 extension. It restyles and adds remote navigation to the real `youtube.com` desktop application. It does not proxy requests, call YouTube APIs, replace the player, remove ads, or copy account data.

See [the implementation and operations guide](../../docs/youtube-tv-extension.md) for installation, controls, architecture, research, verification, and selector-repair instructions.

Quick load in Chrome, Edge, Brave, or another Chromium browser:

1. Open the browser's extensions page.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this `extensions/youtube-tv` directory.
5. Pin **NHD YouTube TV Mode** to the toolbar.

TV Mode is enabled by default. Open the toolbar popup to turn it off or on, adjust interface size and screen margins, or inspect selector health without reloading YouTube. When hosted by NHD-TV, use the couch-accessible YouTube settings in NHD-TV instead; the host owns controller input to prevent duplicate moves.
