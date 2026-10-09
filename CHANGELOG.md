# Changelog

All notable changes to SA-C (System Audio Controller) are documented here.

## [Unreleased]

### Added
- **App Output** key: plays one or more apps on another device (Discord on the headset, Spotify on the speakers); each press moves them to the next device of your list (e.g. headset → speakers → Windows default), each with its own name, icon and colour (the kit's Multi-state key). Windows keeps it for the app; an app that is closed gets it when it starts. Uses Windows' internal app routing (as EarTrumpet does).
- **Calls for other plugins:** SA-C tells deckbus when the computer is in a call (`call`: Teams, Discord, Zoom …, with the app), so other plugins can pause or lower music or show it; from Windows' own call detection (what it lowers other sounds for), else a known call app using the mic. Also which apps use the mic now (`mic.users`).
- **Music on your PC for other plugins' keys:** Windows' media sessions (Spotify, a browser tab, Media Player …) are players on deckbus (`players`), with title, artist, position and cover (made square, without black bars, at most 300 px: Stream Deck stretches pictures to the key, so a YouTube picture looked squashed). Sonos Controller's and MA-C's media keys can play/pause, skip, seek and set the volume of them (the volume is the app's volume in Windows' mixer). On by default; the global setting `othersMayControlPlayers` switches it off.
- **A closed app stays a player:** after you quit Spotify (or another app with music), its player stays on deckbus as closed (also after a restart), so a key bound to it keeps it; **Play starts the app and plays** (Store apps by their app id, programs by their file).
- The helper compiles with the C# compiler directly (instead of Add-Type), so it can use Windows' media sessions; on Windows before 1809 it runs without them.
- **Horseshoe** as a fifth look on the Output and App dials: the volume on a ring open at the bottom (from the kit, as in HA-C and Sonos Controller).
- **Keys in the family look** (the kit's key style, as MA-C and HA-C): large icons, bold names; the default output device is "on" with a tinted plate and frame. A press that can't do anything (app closed, device gone) shows the kit's alert instead of Stream Deck's. With a Stream Deck title on a key, SA-C draws no name of its own (they would overlap).
- **Panorama behind the Output and App dials** (from the kit): one effect for the whole row of dials, also across MA-C's, XR-C's and HA-C's dials, chosen in the settings window with a tick per dial; only text and meters get a dark backing.
- **Short settings panels with a settings window** on the Output and App dials (as in the family): step, Panorama and Other plugins are in the window behind "More settings …".
- The Output and App dials draw with the kit's level strip (shared with XR-C); they look exactly as before.
- **Output** dial (Windows): the default output device's volume (rotate) and mute (push or tap), with the level of what is playing in four looks: Digital, Classic (VU meters), Ring and Pie. Follows a change of the default device. Own name possible.
- **App** dial: one app's volume (Spotify, Firefox, Discord, …) with mute, the app's icon and its own level, in the same four looks. Greyed out with its last volume while the app is closed.
- **App Mute** key: mutes one app; its icon large, a small level, red while muted, grey while closed.
- App icons come from the programs (also in the settings' app list) and are kept, so they show while an app is closed.
- **Microphone** key: mutes the default mic, clearly red while muted; otherwise a small level (while an app records).
- **Output Device** key: makes a device the default, or switches between two (e.g. headphones and speakers); icon from the name, framed while active.
- A small helper for Windows Core Audio (PowerShell with a C# file, readable in the plugin folder), started once and restarted if it stops.
- deckbus: the mic's level is marked as an input (`input: true` in `streams`), and Windows' system sounds are not offered as a level, so lists like MA-C's "Moves with" stay short.
- **Ducking** for other plugins on deckbus, only those you allow (settings: "Other plugins", off by default): they may lower the output device (in real dB) or one app for a while; SA-C restores the exact volume afterwards, also when the plugin leaves or loses its permission. A volume you set in the meantime stays.
- **deckbus:** SA-C tells other plugins whether the system audio is available and offers levels (output `meters/system-output`, mic `meters/system-input`, every app `meters/app-<name>`), each sent only while another plugin uses it (e.g. MA-C's Panorama); shares the mic's muted state (`mic`) and where its actions are (`actions`).
