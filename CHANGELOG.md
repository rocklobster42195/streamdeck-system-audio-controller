# Changelog

All notable changes to SA-C (System Audio Controller) are documented here.

## [Unreleased]

### Added
- **Output** dial (Windows): the default output device's volume (rotate) and mute (push or tap), with the level of what is playing in four looks: Digital, Classic (VU meters), Ring and Pie. Follows a change of the default device. Own name possible.
- **App** dial: one app's volume (Spotify, Firefox, Discord, …) with mute, the app's icon and its own level, in the same four looks. Greyed out with its last volume while the app is closed.
- **App Mute** key: mutes one app; its icon large, a small level, red while muted, grey while closed.
- App icons come from the programs (also in the settings' app list) and are kept, so they show while an app is closed.
- **Microphone** key: mutes the default mic, clearly red while muted; otherwise a small level (while an app records).
- **Output Device** key: makes a device the default, or switches between two (e.g. headphones and speakers); icon from the name, framed while active.
- A small helper for Windows Core Audio (PowerShell with a C# file, readable in the plugin folder), started once and restarted if it stops.
- **deckbus:** SA-C tells other plugins whether the system audio is available and offers levels (output `meters/system-output`, mic `meters/system-input`, every app `meters/app-<name>`), each sent only while another plugin uses it (e.g. MA-C's Panorama); shares the mic's muted state (`mic`) and where its actions are (`actions`).
