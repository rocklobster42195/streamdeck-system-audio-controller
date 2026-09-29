# Changelog

All notable changes to SA-C (System Audio Controller) are documented here.

## [Unreleased]

### Added
- **Output** dial (Windows): the default output device's volume (rotate) and mute (push or tap), with the level of what is playing in four looks: Digital, Classic (VU meters), Ring and Pie. Follows a change of the default device. Own name possible.
- A small helper for Windows Core Audio (PowerShell with a C# file, readable in the plugin folder), started once and restarted if it stops.
- **deckbus:** SA-C tells other plugins whether the system audio is available and offers the output level as `meters/system-output`, sent only while another plugin uses it (e.g. MA-C's Panorama).
