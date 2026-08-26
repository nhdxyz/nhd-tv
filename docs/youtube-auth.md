# YouTube authentication decision

## Current result

YouTube playback and browsing can run in the isolated service partition, but Google account authentication inside that embedded renderer is not a production-ready path. OTP or passkey pages can stall, and adding more navigation exceptions would not resolve the underlying policy and platform constraints.

Google's current [OAuth 2.0 policy](https://developers.google.com/identity/protocols/oauth2/policies) prohibits developers from directing OAuth authorization requests to an embedded user-agent under their control. NHD-TV therefore must not treat script injection, TV-user-agent spoofing, broader Google-origin access, or credential forwarding as an authentication fix.

YouTube documents phone/QR and activation-code sign-in for its [smart-TV and game-console app](https://support.google.com/youtube/answer/3015415?hl=en). That code is issued by the supported living-room client; opening `yt.be/activate` alone cannot attach a Google account to NHD-TV's ordinary YouTube web partition.

## Safe paths to evaluate

1. Determine whether NHD-TV can qualify for an authorized YouTube living-room integration and its activation flow.
2. If NHD-TV needs YouTube Data API features, register an NHD-TV OAuth client and use the system browser with an owned, verified redirect origin. Those API tokens must remain separate from service cookies and do not automatically sign in `youtube.com`.
3. Keep signed-out YouTube browsing/playback available while authentication is unresolved.
4. Retest the current web partition only as a documented feasibility observation; do not ship it as the promised production login path.

Issue #11 remains open until a supported path is both eligible and validated in a signed build.
