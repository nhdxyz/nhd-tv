# Voice command reference

This page describes the current English voice-command contract. Each press-and-hold records one command. The TV shows the finalized transcript after the recording is transcribed; it does not show word-by-word live transcription. Short-lived conversational context belongs to the active TV profile and is shared by every paired phone controlling that TV.

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
| “Go to my YouTube subscriptions” | Opens YouTube's fixed Subscriptions destination when YouTube is enabled. |
| “Open my Spotify library” / “Open my YouTube library” | Opens the named provider's fixed library destination without searching or accepting a model-generated URL. |
| “Open my library” | Uses the active capable Spotify or YouTube app, or the only enabled capable provider. If both are enabled and neither is active, it asks which library instead of guessing. |
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
| “Play Breaking Bad” | Resolves eligible providers. If more than one enabled service has it, the TV shows numbered service choices instead of silently guessing. On Netflix, show-level playback prefers the current Resume/Continue action and otherwise uses Play. |
| “Play Breaking Bad season 1 episode 3” | Requires and verifies both the season and episode, then targets only that episode. It does not fall through to a generic show Resume action. |
| “Play Dune 2021” | Preserves the year or other spoken edition, language, country, or remake qualifier during resolution. |
| “Play Moana on Disney Plus” | Restricts resolution to enabled Disney+ offers. NHD-TV reports honestly if it can open the title but cannot verify automatic playback. |

For a title offered by multiple enabled services, an explicitly named supported provider wins. A generic Play request with multiple eligible offers shows numbered choices; saying “the first one,” for example, selects only the displayed choice and counts as explicit playback consent. Only eligible subscription or free offers can launch. If exact playback cannot be verified, the provider result stays open and the phone reports that playback did not start automatically.

## YouTube

| Say | Current behavior |
| --- | --- |
| “Go to the Outdoor Boys channel” | Opens an exact matching channel or handle result; it does not play a video. |
| “Play the Outdoor Boys latest video” | Searches for the creator with YouTube's upload-date ordering, requires a matching channel byline, skips Shorts, and attempts to play the first eligible full video. |
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

## Conversation and current media

| Say | Current behavior |
| --- | --- |
| “Play it” / “Put that on” | Reuses the most recent explicit media target while that short-lived TV context is still valid. It asks for the full title again when no safe target remains. |
| “Where can I watch it?” | Looks up the most recent explicit title without requiring it to be repeated. |
| “Netflix instead” | Retries the most recent media target on the named compatible, enabled provider. |
| “The first one” / “The second one” | Selects only a numbered provider choice that NHD-TV displayed on the TV. It never guesses from an unobserved provider search page. |
| “Play this” | Resumes media that is currently paused. If a safe current-media identity is available, it can reuse that identity; otherwise it asks for a complete title. |
| “What am I watching?” / “What is playing?” | Reports the current locally observed title and provider without navigating. |
| “What episode is this?” / “What song is this?” | Reports locally observed episode or song metadata when the provider exposes enough information. |
| “How far into this am I?” / “What timestamp are we at?” | Reports the current locally observed playback position without seeking. |
| “How long is this?” / “What's the runtime?” | Reports the observed total runtime and distinguishes it from time remaining. |
| “How much longer?” / “When will this end?” | Uses fresh position, duration, playback state, and observed speed. It does not invent a finish clock while playback is paused or its rate is unavailable. |

Context is memory-only: no transcript, audio, provider URL, or cookie is retained in it. Media identity—including observed season and episode coordinates—expires, numbered choices expire more quickly, and changing the active profile or provider invalidates incompatible context. A follow-up fails closed instead of guessing when its target is missing, expired, ambiguous, or incompatible with the requested provider.

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
| “Rewind 30 seconds” / “Skip ahead two minutes” | Seeks by the explicit bounded duration in Netflix or YouTube. |
| “Go to 12:30” / “Start over” | Seeks to the explicit position or restarts the current Netflix or YouTube video. |
| “Next episode” / “Previous video” | Uses the active provider's visible next/previous control when available. |
| “Skip intro” / “Skip recap” / “Skip ad” | Uses only a matching visible provider control; unsupported or unavailable controls are reported honestly. |
| “Turn captions on/off” | Sets YouTube captions idempotently and uses Netflix's visible subtitle options when available. |
| “Go fullscreen” / “Exit fullscreen” | Requests the matching Netflix or YouTube player state. |
| “Play this at one-and-a-half speed” / “Normal speed” | Sets an active Netflix or YouTube finite video to an exact supported rate: 0.5×, 0.75×, 1×, 1.25×, or 1.5×. The command verifies settled provider state and never rounds unsupported rates. |
| “Next song” / “Skip this song” / “Previous track” | Uses Spotify's next or previous track control only while Spotify is open. It never converts a track request into a video or movie seek. |
| “Turn shuffle on/off” | Sets Spotify's current shuffle state explicitly and verifies the settled switch state. A repeated request is a no-op rather than a toggle. |
| “Repeat everything” / “Repeat this song” / “Turn repeat off” | Selects Spotify repeat-all, repeat-one, or repeat-off explicitly. Each transition is re-read and verified; a failed multi-step change is restored when possible or reported as a partial setting change. Bare “repeat,” toggle requests, named-playlist shuffle requests, and unsupported state cycles fail closed. |
| “Volume up” / “Turn it down” | Changes system volume by one 5-point step. Raising or lowering volume also unmutes system audio. |
| “Set volume to 20 percent” | Sets the system volume to an explicit whole-number level from 0–100. Spoken numbers such as “twenty” are accepted; vague, decimal, negative, and out-of-range values fail closed. |
| “Mute” / “Unmute” | Sets the requested mute state explicitly; repeating the same request does not invert it. |

## Playback confirmation

- **Confirm before playback:** a Play request with at least one eligible enabled voice-media service creates a phone card for 30 seconds. Tap **Play**/**Cancel**, or hold the microphone on that same phone and give a bare “yes”/“no” answer. The confirmation ID is bound to that controller and cannot be borrowed by another phone.
- **Play automatically:** an eligible Play request proceeds without the card.
- App launch, search, open, where-to-watch, recommendations, navigation, and volume controls never require playback confirmation.
- A request with no eligible enabled provider fails without showing a misleading confirmation.
- Provider eligibility is checked again when **Play** is tapped. If the response is interrupted after submission, **Check result** retrieves the same result without starting playback twice.
- While transcription, lookup, or confirmed playback is actively processing, the initiating phone can tap **Cancel** and immediately give a corrected command. Another phone cannot cancel it, and already-completed provider actions cannot be rolled back.

## Explicitly unsupported commands

These are outside the current closed command schema. Do not rely on NHD-TV to infer or approximate them:

| Unsupported request | Safe supported alternative |
| --- | --- |
| “Breaking Bad season 2” or “play episode 3” | Name both season and episode numbers. |
| Bare “repeat,” “toggle shuffle,” “shuffle this playlist,” or “add this to my queue” | Name the desired current Spotify state, such as “turn shuffle on” or “repeat this song.” Queue mutation and commands that combine content selection with a playback mode are not represented. |
| “Play Breaking Bad at 1.5×” | Start the title first, then give a separate speed command. Combined launch-and-speed requests fail closed so neither half is silently dropped. |
| “Change audio language to Spanish” | Use the provider's visible audio-language menu. Captions on/off are supported, but language selection is not. |
| Power, TV input, sleep timer, or general web questions | Use the TV/device controls or another assistant. |
| “Play [title] on Max/Hulu/Prime Video/Apple TV” | Content-aware voice routing is not supported for those providers. “Open Max,” for example, can still launch an enabled app for manual navigation. |
