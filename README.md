# SA-C — System Audio Controller for Stream Deck

Your computer's sound on your Stream Deck: the volume with a live level meter, each app's volume (Spotify, Firefox, Discord, …), a mic mute key, and a key to switch between headphones and speakers. SA-C also shares that level with other Stream Deck plugins through **deckbus**, so, for example, the Panorama of [MA-C (Music Assistant Controller)](https://github.com/rocklobster42195/streamdeck-music-assistant-controller) can move with the music on your PC.

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

### App *(dial, Stream Deck + only)*

One app's volume, like in the Windows volume mixer: Spotify, Firefox, Discord, a game. Choose the app in the dial's settings; the list shows the apps that have played sound since they started, playing ones first.

| Control | What it does |
|---|---|
| Rotate | The app's volume |
| Push / tap | Mute / unmute the app |

- The app's volume is relative to the output volume: 100 % means "as loud as the output".
- The display has the same four looks as the Output dial, with the app's icon next to its name (in the ring for Ring and Pie); the meter shows only this app's sound.
- While the app is closed, the dial turns **grey** with its icon and last volume, and waits. It comes back when the app plays again.
- Apps with several audio streams (browsers) are changed together.

### App Mute *(key)*

Mute one app with a key: the app's icon large with its name, and a small level while it plays (can be turned off). Press to mute or unmute. While muted, the key is **red**; while the app is closed, it is **grey**.

SA-C takes the icons from the programs themselves and keeps a copy, so a key shows the right icon even while its app is closed.

### Microphone *(key)*

Press to mute or unmute your default microphone. While muted, the key is **red** with a crossed-out mic, so you see it from across the room. Otherwise it shows a small level. The level moves only while an app records (a call, a recording): Windows measures a mic only then.

### Output Device *(key)*

Switches the default output device.

- **One device chosen:** a press makes it the default (e.g. one key for the headphones, one for the speakers).
- **Two devices chosen:** a press switches between them.

The key shows the device with a matching icon (headphones, speakers, monitor) and gets a frame while it is the default. SA-C sets it as the default for everything: music, videos and calls.

## Requirements

- Windows 10 or 11
- Stream Deck 7.1 or later, and a Stream Deck + for the dial
- Windows PowerShell (part of Windows)

## Works with other plugins (deckbus)

SA-C talks to other Stream Deck plugins on your computer through **deckbus**, a small open bus between plugins. You don't need to set anything up: when the plugins run, they find each other.

**Offers:**
- whether the system audio is available, with the output device's name;
- whether the mic is muted (`mic`), so other plugins could show it;
- levels, each sent only while another plugin actually uses it:
  - your computer's output as `meters/system-output` (e.g. MA-C's Panorama with **Audio source** set to your output device);
  - the mic as `meters/system-input` (marked as an input, so MA-C's Panorama doesn't list it);
  - every app with sound, e.g. `meters/app-spotify`, so MA-C's Panorama can move with Spotify only (not Windows' system sounds).

**Uses:** nothing yet.

**Only with your permission:** lowering the volume for a moment (*ducking*), e.g. MA-C during an announcement. Nobody may by default. Switch it on per plugin in the settings of an Output dial, App dial or App Mute key, under **Other plugins** (the list shows the plugins on deckbus right now).

- A plugin can lower your output device or one app (by a few dB, for at most a few minutes).
- Afterwards SA-C puts back exactly the volume from before, also when that plugin stops or you switch its permission off.
- You win: if you change the volume during a duck (on the deck or in Windows), it stays as you set it.

deckbus stays on your computer. It uses local pipes, plugins must know a key stored in your user profile, and nothing goes over the network. The protocol is open: [deckbus protocol](https://github.com/rocklobster42195/streamdeck-kit/blob/main/docs/deckbus-protocol.md).

## How it works

Node.js, which Stream Deck plugins run on, can't reach the Windows audio system by itself. SA-C therefore starts a small helper once: a PowerShell script (`helper/sac-audio.ps1`) that compiles three short C# files (`helper/Interop.cs`, `helper/Icons.cs`, `helper/Helper.cs`) for Windows Core Audio. Both are plain text in the plugin folder, so you can read exactly what they do. There is no program to install and nothing that runs when Stream Deck is closed.

- The helper reads and sets the volume and mute of the default output and input device and of each app, and reads their levels (about 20 times per second, only while needed).
- Switching the default device uses the same Windows interface as the Windows sound settings (`IPolicyConfig`, not officially documented, but stable since Windows 7).
- Plugin and helper talk through simple JSON lines.
- The helper needs about half a second to start, once per plugin start.
- SA-C sends nothing to the internet.

## Troubleshooting

- **"Audio not available"**: the helper stopped. SA-C restarts it by itself. If it stays, look at the plugin log (`logs/` in the plugin folder). Some company PCs block PowerShell scripts or compiling C# (`Add-Type`); then SA-C can't work there.
- **"No output device"**: Windows has no active output device. Plug in speakers or headphones, or choose one in the Windows sound settings.
- **The meter doesn't move**: nothing is playing, or the app plays to a device that isn't the default.
- **An app is missing from the App list**: it hasn't played sound yet since it started. Play something, then open the list again.

## Planned

- macOS.

## Development

```sh
npm install
npm run build        # plugin bundle and PI
npm run check        # build, tests, lint, manifest validation
npm run icons        # action and plugin icons
npm run sim:output   # all actions against a fake system audio, deckbus checks → sim-out/output/
npm run sim:apps     # App dials and keys with icons; an app closes and turns grey → sim-out/apps/
npm run sim:duck     # another plugin ducks the output and an app: permission, restore, "you win" → sim-out/duck/
npm run link -w sac-plugin   # install the dev build into Stream Deck
```

The simulator never touches your real volume: it runs the plugin with `SAC_HELPER=tools/fake-helper.mjs`, a stand-in that speaks the helper's protocol.

The plugin is built on [`@rocklobster42195/streamdeck-kit`](https://github.com/rocklobster42195/streamdeck-kit) (rendering, meters, settings panels, deckbus).

## Credits and licence

- Icons: [Material Design Icons](https://pictogrammers.com) (Apache 2.0).
- Licence: MIT, see [LICENSE](LICENSE).
