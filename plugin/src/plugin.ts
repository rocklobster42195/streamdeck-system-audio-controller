import streamDeck from "@elgato/streamdeck";
import { setKitLogger } from "@rocklobster42195/streamdeck-kit";
import { AppDial } from "./actions/app-dial";
import { AppKey } from "./actions/app-key";
import { DeviceKey } from "./actions/device-key";
import { AppOutputKey } from "./actions/app-output-key";
import { PlayPauseKey } from "./actions/play-pause-key";
import { PlaybackControlKey } from "./actions/playback-control-key";
import { VolumeKey } from "./actions/volume-key";
import { MicKey } from "./actions/mic-key";
import { OutputDial } from "./actions/output-dial";
import { systemAudio } from "./audio/system-audio";
import { initDuckPermissions, loadDuckPermissions } from "./bus/duck-permissions";
import { startSacBus, trackSacActions } from "./bus/sac-bus";
import { initPiBridge } from "./pi/options";

streamDeck.logger.setLevel("info");
setKitLogger(streamDeck.logger);

streamDeck.actions.registerAction(new OutputDial());
streamDeck.actions.registerAction(new AppDial());
streamDeck.actions.registerAction(new AppKey());
streamDeck.actions.registerAction(new MicKey());
streamDeck.actions.registerAction(new DeviceKey());
streamDeck.actions.registerAction(new AppOutputKey());
streamDeck.actions.registerAction(new PlayPauseKey());
streamDeck.actions.registerAction(new PlaybackControlKey());
streamDeck.actions.registerAction(new VolumeKey());
initPiBridge();
trackSacActions();
initDuckPermissions();

await streamDeck.connect();
systemAudio.start();
await loadDuckPermissions();
// deckbus: offer the computer's levels to other plugins (works without it if the bus can't start)
void startSacBus();
streamDeck.logger.info("SA-C started");
