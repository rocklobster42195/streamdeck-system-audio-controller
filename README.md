# SA-C — System Audio Controller for Stream Deck

Your computer's volume on a Stream Deck + dial, with a live level meter of whatever is playing: Spotify, YouTube, games, calls. SA-C also shares that level with other Stream Deck plugins through **deckbus**, so, for example, the Panorama of [MA-C (Music Assistant Controller)](https://github.com/rocklobster42195/streamdeck-music-assistant-controller) can move with the music on your PC.

> Unofficial community plugin. Not affiliated with Elgato or Microsoft.

**Status:** early. Windows only for now; macOS is planned.

## Contents

- [Actions](#actions)
- [Requirements](#requirements)
- [Works with other plugins (deckbus)](#works-with-other-plugins-deckbus)
- [How it works](#how-it-works)
- [Troubleshooting](#troubleshooting)
- [Planned](#planned)
- [Development](#development)
- [Credits and licence](#credits-and-licence)

## Actions

### Output *(dial, Stream Deck + only)*

The volume of your default output device (the one Windows plays through right now). If you switch from speakers to headphones in Windows, the dial follows.

| Control | What it does |
|---|---|
| Rotate | Volume (2 % per step, adjustable 1–10 %) |
| Push | Mute / unmute |
| Tap the display | Mute / unmute |

**Display** (in the dial's settings):

- **Digital**: LED bars for left and right with peak hold, a dBFS scale, and the volume as a slim bar underneath.
- **Classic**: two analog VU meters, like on an old tape deck.
- **Ring** and **Pie**: just the volume, no meter.

SA-C measures the level only while a dial that shows it is visible, or while another plugin uses it.

By default the display shows the device's name (e.g. "Speakers (Realtek Audio)"). Give it your own name in the settings.

## Requirements

- Windows 10 or 11
- Stream Deck 7.1 or later, and a Stream Deck + for the dial
- Windows PowerShell (part of Windows)

## Works with other plugins (deckbus)

SA-C talks to other Stream Deck plugins on your computer through **deckbus**, a small open bus between plugins. You don't need to set anything up: when the plugins run, they find each other.

**Offers:**
- whether the system audio is available, with the output device's name;
- the level of your computer's output, as the stream `meters/system-output`. It goes out only while another plugin actually uses it, for example MA-C's Panorama with **Audio source** set to your output device.

**Uses:** nothing yet.

**Only with your permission:** nothing yet. Later, other plugins may ask SA-C to lower the volume for a moment (for example MA-C during an announcement). That will need your OK per plugin, and SA-C will always put the volume back.

deckbus stays on your computer. It uses local pipes, plugins must know a key stored in your user profile, and nothing goes over the network. The protocol is open: [deckbus protocol](https://github.com/rocklobster42195/streamdeck-kit/blob/main/docs/deckbus-protocol.md).

## How it works

Node.js, which Stream Deck plugins run on, can't reach the Windows audio system by itself. SA-C therefore starts a small helper once: a PowerShell script (`helper/sac-audio.ps1`) that compiles a short C# file (`helper/CoreAudio.cs`) for Windows Core Audio. Both are plain text in the plugin folder, so you can read exactly what they do. There is no program to install and nothing that runs when Stream Deck is closed.

- The helper reads and sets the volume and mute of the default output device, and reads its level (about 20 times per second, only while needed).
- Plugin and helper talk through simple JSON lines.
- The helper needs about half a second to start, once per plugin start.
- SA-C sends nothing to the internet.

## Troubleshooting

- **"Audio not available"**: the helper stopped. SA-C restarts it by itself. If it stays, look at the plugin log (`logs/` in the plugin folder). Some company PCs block PowerShell scripts or compiling C# (`Add-Type`); then SA-C can't work there.
- **"No output device"**: Windows has no active output device. Plug in speakers or headphones, or choose one in the Windows sound settings.
- **The meter doesn't move**: nothing is playing, or the app plays to a device that isn't the default.

## Planned

- **Mic key**: mute the microphone, clearly red when muted; the mic state shared on deckbus.
- **Device key**: switch the default output device (e.g. headphones ↔ speakers).
- Volume per application (Spotify, browser, Discord).
- Lowering the volume for other plugins, with your permission (see above).
- macOS.

## Development

```sh
npm install
npm run build        # plugin bundle and PI
npm run check        # build, tests, lint, manifest validation
npm run icons        # action and plugin icons
npm run sim:output   # Output dials in all looks against a fake system audio, deckbus check → sim-out/output/
npm run link -w sac-plugin   # install the dev build into Stream Deck
```

The simulator never touches your real volume: it runs the plugin with `SAC_HELPER=tools/fake-helper.mjs`, a stand-in that speaks the helper's protocol.

The plugin is built on [`@rocklobster42195/streamdeck-kit`](https://github.com/rocklobster42195/streamdeck-kit) (rendering, meters, settings panels, deckbus).

## Credits and licence

- Icons: [Material Design Icons](https://pictogrammers.com) (Apache 2.0).
- Licence: MIT, see [LICENSE](LICENSE).
