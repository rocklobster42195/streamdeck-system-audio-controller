// SA-C on deckbus (see the kit's docs/deckbus-protocol.md): tells the other plugins whether the
// system audio is available, and offers the level of what plays on the computer as
// "meters/system-output" — sent only while some peer subscribes (e.g. MA-C's Panorama).
import streamDeck from "@elgato/streamdeck";
import { DeckBus } from "@rocklobster42195/streamdeck-kit/bus";
import { systemAudio } from "../audio/system-audio";

const OUTPUT = "meters/system-output";

let bus: DeckBus | undefined;
let lastState = "";
let subscribed = false;

/** Call after streamDeck.connect() (the plugin version comes from there). */
export async function startSacBus(): Promise<void> {
    bus = new DeckBus({ id: "de.boriskemper.system-audio-controller", name: "SA-C", version: streamDeck.info.plugin.version, caps: ["meters"] });
    if (!(await bus.start())) return;
    streamDeck.logger.info(`[deckbus] SA-C in slot ${bus.slot}`);
    systemAudio.onChange(share);
    share();
    bus.onSubscribers(OUTPUT, (count) => {
        subscribed = count > 0;
        systemAudio.wantMeters("bus", subscribed);
    });
    systemAudio.onMeter((m) => {
        if (subscribed) bus?.publish(OUTPUT, { l: m.l, r: m.r });
    });
}

/** Status and the offered stream (named after the output device). */
function share(): void {
    if (!bus) return;
    const online = systemAudio.ready;
    const name = systemAudio.device?.name ?? "";
    const json = JSON.stringify([online, name]);
    if (json === lastState) return;
    lastState = json;
    bus.setState("status", { online, detail: online ? name : systemAudio.state });
    bus.setState("streams", online ? [{ topic: OUTPUT, label: name || "System output", stereo: true }] : []);
}

export function stopSacBus(): void {
    bus?.stop();
}
