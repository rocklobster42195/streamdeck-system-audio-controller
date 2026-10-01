# SA-C — System Audio Controller: Concept

Decided in the grill of 2026-09-29 (`C:\dev\streamdeck-kit\notes\2026-09-29-deckbus-readme-snapshot-sysaudio-grill.md`, Q3–Q7).

## What it is

A Stream Deck plugin for the computer's own audio: the volume of output and input devices, mute, and switching devices. Plugins that do this already exist, e.g. BarRaider's audio mixer. SA-C's difference is **deckbus**:

- **Offers meters:** the level of whatever plays on the computer as `meters/system-output`, and the mic as `meters/system-input`. MA-C's Panorama moves with any PC audio (Spotify app, YouTube, games), even **without a mixer**. This makes the bus useful beyond X-Air owners, and lets the user test the audio-reactive Panorama at work.
- **Accepts ducking:** MA-C's Announcement key can lower the PC volume for a while. The rules are the same as for XR-C: a lease that restores itself, and only for peers the user allowed.
- **Shares the mic state:** "mic muted" as bus state, which other plugins can show.

## Identity

- Display name **System Audio Controller**, public short name **SA-C**, internally SAC.
- UUID `de.boriskemper.system-audio-controller`.
- Folder `C:\dev\system-audio-controller`; GitHub `rocklobster42195/streamdeck-system-audio-controller`, private until release.
- Logo: the Rocklobster lobster on a **Cerise `#E14190`** circle (house palette).
- Unofficial community plugin (disclaimer: not affiliated with Elgato, Microsoft or Apple).

## v1 (Windows)

1. **Output dial:**
   - the volume of the default output device, or of a fixed one; push = mute;
   - the display shows the level of what is playing, in the kit's four styles (Digital, Classic, Ring, Pie), largely XR-C's rendering.
2. **Mic key:** press = mute the microphone; clearly red when muted, otherwise a small level.
3. **Device key:** switches the default output device (e.g. headphones ↔ speakers) and shows the active one.
4. **deckbus:**
   - state `status`, `streams`, and the mic's muted state;
   - meters only while someone subscribes;
   - `duck`/`unduck`, allowed per peer (done 2026-10-01: output in dB, apps by factor, "the user wins");
   - the README section "Works with other plugins (deckbus)".

**Later:**
- volume per application (Spotify, Discord, browser): good on Windows, hardly possible on macOS without an extra driver;
- a mic gain dial;
- an input device switch.

**Order:** first a minimal SA-C (helper, output dial with meter, meters on the bus), right after the XR-C/MA-C bus work; then the rest of v1.

## Technology

- Node can't reach the OS audio APIs by itself. **Windows first**, through a **long-running PowerShell helper** that compiles a small C# wrapper for Core Audio at start (`Add-Type`):
  - `IAudioEndpointVolume` for volume and mute;
  - `IAudioMeterInformation` for meters;
  - `IMMDeviceEnumerator` for devices;
  - the undocumented `IPolicyConfig` for switching the default device.

  There is no binary to ship and nothing to sign, and the source is readable. The cost is a start of about 1–2 s, once per plugin start.
- Plugin ↔ helper: **JSON lines over stdin/stdout**, platform-neutral, so a macOS helper can slot in later.
- **macOS later (v1.x):** a small Swift helper. It needs signing and notarization (Gatekeeper), so an Apple developer account (open: does the user have one?). Volume, mute and device switching are straightforward. The output meter needs Core Audio taps (macOS 14.2+) and the "record system audio" permission.
- Built on the kit: gauges and meters, PI kit, `deckbus`, `deviceFrame` for pictures.

## Open points

- Apple developer account for the macOS helper (later).
- Meter rate and CPU cost of polling `IAudioMeterInformation` from PowerShell (aim: ~20 values per second).
