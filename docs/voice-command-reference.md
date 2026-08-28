# Voice command reference

This page describes the current English voice-command contract. Each press-and-hold records one command. The TV shows the finalized transcript after the recording is transcribed; it does not show word-by-word live transcription.

App launch and media control have different boundaries:

- An exact app-launch request can open any uniquely matching app that is enabled in the active profile, including a custom app with an exact configured name.
- Content-aware search and playback route only through Netflix, Disney+, Spotify, and YouTube. Opening another app does not add voice search or playback automation for that app.
- The active profile's enabled lineup is the subscription boundary. Google may report other where-to-watch providers, including rent or purchase offers, but NHD-TV does not automatically launch those offers.

## Apps, search, and availability

| Say | Current behavior |
| --- | --- |
| “Open Netflix” | Opens Netflix when it is enabled. If it is already open, reports that without reopening it. |
| “Switch to YouTube” / “Go to Spotify” | Opens the exact enabled app. Common built-in aliases such as “Max,” “Prime Video,” and “Apple TV Plus” are recognized for app launch only. |
| “Open Movie Club” | Opens a custom app only when its normalized name matches exactly and uniquely. A disabled, missing, or ambiguous app name performs no navigation. |
| “Search for Breaking Bad” | Opens search results without playing anything. It searches the active supported media app when possible; otherwise it uses a provider implied by the media type, then the first eligible voice-media app in the profile lineup. |
| “Search Netflix for Breaking Bad” | Opens Netflix search results without autoplay or playback confirmation. |
| “Search YouTube for Outdoor Boys” | Opens YouTube search results without choosing or playing a result. |
| “Where can I watch Apollo 13?” | Uses Google Where to watch and reports the available providers. It does not open a provider or start playback. |
| “What service has Dune 2021?” | Performs the same availability-only lookup and preserves the spoken year to distinguish versions. If discovery cannot be verified, it reports that instead of guessing. |

“Search” means show provider results. “Where can I watch” or “what service has” means report availability only. “Open” may navigate to a matching title or provider result, but NHD-TV does not issue a playback action; the provider still owns any autoplay behavior on its page.

## Movies, shows, and episodes

| Say | Current behavior |
| --- | --- |
| “Apollo 13” / “Play Apollo 13” | Treats the exact title as a play request. In Confirm mode it waits for the phone; in Automatic mode it begins resolution immediately. |
| “Open Apollo 13 on Netflix” | Opens the matching Netflix title or search result without autoplay. |
| “Play Breaking Bad” | Resolves an eligible provider. On Netflix, show-level playback prefers the current Resume/Continue action and otherwise uses Play. |
| “Play Breaking Bad season 1 episode 3” | Requires and verifies both the season and episode, then targets only that episode. It does not fall through to a generic show Resume action. |
| “Play Dune 2021” | Preserves the year or other spoken edition, language, country, or remake qualifier during resolution. |
| “Play Moana on Disney Plus” | Restricts resolution to enabled Disney+ offers. NHD-TV reports honestly if it can open the title but cannot verify automatic playback. |

For a title offered by multiple enabled services, an explicitly named supported provider wins; otherwise the active profile's lineup order wins. Only eligible subscription or free offers can launch. If exact playback cannot be verified, the provider result stays open and the phone reports that playback did not start automatically.

## YouTube

| Say | Current behavior |
| --- | --- |
| “Go to the Outdoor Boys channel” | Opens an exact matching channel or handle result; it does not play a video. |
| “Play the Outdoor Boys latest video” | Searches for the creator with YouTube's upload-date ordering, requires a matching channel byline, and attempts to play the first eligible result. |
| “Play [video title] by [creator] on YouTube” | Requires the named creator's byline and ranks exact or close title matches before attempting playback. |
| “Search YouTube for [topic]” | Opens results only and does not choose an arbitrary video. |

A successful YouTube play request waits for actual playback and attempts fullscreen. If that cannot be verified, search or watch results remain open and NHD-TV reports the failure.

## Spotify

| Say | Current behavior |
| --- | --- |
| “Play Stronger by Kanye West” | Requires an exact track title and matching artist before attempting playback. |
| “Play a song from Kanye West” | Starts the named artist's playback without inventing a song title. |
| “Open Kanye West on Spotify” | Opens an exact artist result or profile without requesting playback. |
| “Play the album Graduation by Kanye West on Spotify” | Targets a matching album and artist. The same exact-match behavior applies to named playlists. |

Spotify must be enabled and signed in. A play request is reported as successful only after Spotify exposes matching local state and a global Pause state. Otherwise Spotify search remains open and NHD-TV says that playback could not be started automatically.

## Recommendations

| Say | Current behavior |
| --- | --- |
| “Show me a tense action movie with a clever lead” | Opens a bounded Netflix search that preserves the spoken constraints. It does not select or play a title. |
| “I want a funny family movie from the 1990s” | Opens Netflix discovery results without playback confirmation. |
| “Find movies similar to Inception” | Searches Netflix using only the named seed title so Netflix can show related catalog results. |

Recommendations currently mean Netflix-owned discovery results, not an AI-selected title. They are unavailable when Netflix is not enabled and never autoplay, even in Automatic mode.

## Navigation, playback, and volume

| Say | Current behavior |
| --- | --- |
| “Go home” / “Take me back” | Sends Home or Back once. The longer phrases avoid ambiguity with media titles named *Home*. |
| “Move left/right/up/down” / “Press select” | Sends one directional or Select action to the current TV surface. |
| “Pause” | Pauses only when playback is currently active; otherwise reports that playback is already paused. |
| “Resume” / “Continue playing” / “Play” | Resumes the current app when it is not already playing. A title must be named to start different media. |
| “Stop playback” | Stops or pauses current playback without closing the app. |
| “Exit this app” / “Close app” | Closes the active app and returns Home. |
| “Rewind” / “Fast forward” | Sends one provider-level rewind or fast-forward action; no duration is implied. |
| “Next song” / “Skip this song” / “Previous track” | Uses Spotify's next or previous track control only while Spotify is open. It never converts a track request into a video or movie seek. |
| “Volume up” / “Turn it down” | Changes system volume by one 5-point step. Raising or lowering volume also unmutes system audio. |
| “Mute” / “Unmute” | Sets the requested mute state explicitly; repeating the same request does not invert it. |

## Playback confirmation

- **Confirm before playback:** a Play request with at least one eligible enabled voice-media service creates a phone card for 30 seconds. Tap **Play** or **Cancel**. The microphone is disabled while that choice is pending, so spoken “yes” and “no” are not confirmation commands.
- **Play automatically:** an eligible Play request proceeds without the card.
- App launch, search, open, where-to-watch, recommendations, navigation, and volume controls never require playback confirmation.
- A request with no eligible enabled provider fails without showing a misleading confirmation.
- Provider eligibility is checked again when **Play** is tapped. If the response is interrupted after submission, **Check result** retrieves the same result without starting playback twice.

## Explicitly unsupported commands

These are outside the current closed command schema. Do not rely on NHD-TV to infer or approximate them:

| Unsupported request | Safe supported alternative |
| --- | --- |
| “Play it,” “put that on,” “the first one,” or “on Netflix instead” | Repeat the complete title, episode, creator, and provider in one command. NHD-TV does not keep conversational media references. |
| Spoken “yes” or “no” for a playback card | Use the phone's **Play** or **Cancel** button. |
| “Breaking Bad season 2” or “play episode 3” | Name both season and episode numbers. |
| “Rewind 30 seconds,” “skip to 12:30,” or “set volume to 20 percent” | Use one generic Rewind/Fast forward or Volume up/down action. Exact seek positions, durations, and volume values are not represented. |
| “Next episode,” “previous episode,” “skip intro,” “skip ad,” “shuffle,” or “repeat” | Use the provider's visible controls. Next/previous song is supported only while Spotify is open. |
| “Turn captions on,” “change audio language,” or “go fullscreen” | Use the provider's visible controls. Verified Netflix and YouTube play flows attempt fullscreen automatically, but fullscreen is not a standalone voice command. |
| Power, TV input, sleep timer, or general web questions | Use the TV/device controls or another assistant. |
| “Play [title] on Max/Hulu/Prime Video/Apple TV” | Content-aware voice routing is not supported for those providers. “Open Max,” for example, can still launch an enabled app for manual navigation. |
