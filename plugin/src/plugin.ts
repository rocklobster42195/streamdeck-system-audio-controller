import streamDeck from "@elgato/streamdeck";
import { piBridge } from "@rocklobster42195/streamdeck-kit/bridge";
import { setKitLogger } from "@rocklobster42195/streamdeck-kit";
import { OutputDial } from "./actions/output-dial";
import { systemAudio } from "./audio/system-audio";
import { startSacBus } from "./bus/sac-bus";

streamDeck.logger.setLevel("info");
setKitLogger(streamDeck.logger);

streamDeck.actions.registerAction(new OutputDial());
piBridge.init();

await streamDeck.connect();
systemAudio.start();
// deckbus: offer the computer's level to other plugins (works without it if the bus can't start)
void startSacBus();
streamDeck.logger.info("SA-C started");
