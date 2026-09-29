import streamDeck from "@elgato/streamdeck";
import { setKitLogger } from "@rocklobster42195/streamdeck-kit";
import { AppDial } from "./actions/app-dial";
import { DeviceKey } from "./actions/device-key";
import { MicKey } from "./actions/mic-key";
import { OutputDial } from "./actions/output-dial";
import { systemAudio } from "./audio/system-audio";
import { startSacBus, trackSacActions } from "./bus/sac-bus";
import { initPiBridge } from "./pi/options";

streamDeck.logger.setLevel("info");
setKitLogger(streamDeck.logger);

streamDeck.actions.registerAction(new OutputDial());
streamDeck.actions.registerAction(new AppDial());
streamDeck.actions.registerAction(new MicKey());
streamDeck.actions.registerAction(new DeviceKey());
initPiBridge();
trackSacActions();

await streamDeck.connect();
systemAudio.start();
// deckbus: offer the computer's levels to other plugins (works without it if the bus can't start)
void startSacBus();
streamDeck.logger.info("SA-C started");
