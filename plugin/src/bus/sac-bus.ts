// SA-C on deckbus (see the kit's docs/deckbus-protocol.md): tells the other plugins whether the
// system audio is available and whether the mic is muted, and offers levels: the computer's output
// ("meters/system-output"), the mic ("meters/system-input") and each app with sound
// ("meters/app-spotify", …). A level is measured and sent only while some peer subscribes.
// Plugins the user allowed may lower the output or an app for a while ("duck", see ducking.ts).
import streamDeck from "@elgato/streamdeck";
import { trackActions } from "@rocklobster42195/streamdeck-kit/bridge";
import { ActionsState, DeckBus, serveDucking } from "@rocklobster42195/streamdeck-kit/bus";
import { Ducker, type DuckTarget } from "../audio/ducking";
import { systemAudio, type MeterSource } from "../audio/system-audio";
import { isDuckAllowed, onDuckRevoked, setDuckPeers } from "./duck-permissions";

type Offer = { topic: string; label: string; stereo: boolean; source: MeterSource };

let bus: DeckBus | undefined;
let offers: Offer[] = [];
let lastState = "";
/** Topic → its source, and how to stop watching its subscriber count. */
const watchers = new Map<string, { source: MeterSource; off: () => void }>();
/** Where SA-C's actions are visible ("actions" state); collected from the start, shared once the bus exists. */
const actions = new ActionsState({ setState: (key, value) => bus?.setState(key, value) });

/** Call before streamDeck.connect(), so no willAppear is missed. */
export function trackSacActions(): void {
    trackActions(actions);
}

/** Ducking works on the topics of the output and the apps (not the mic). */
const ducker = new Ducker(systemAudio, (topic) => (topic === "meters/system-output" ? "out" : topic.startsWith("meters/app-") ? (`app:${topic.slice(11)}` as DuckTarget) : undefined), (m) =>
    streamDeck.logger.info(m),
);

/** The bus topic of a level source. */
export function topicOf(source: MeterSource): string {
    return source === "out" ? "meters/system-output" : source === "in" ? "meters/system-input" : `meters/app-${source.slice(4)}`;
}

/** Call after streamDeck.connect() (the plugin version comes from there). */
export async function startSacBus(): Promise<void> {
    bus = new DeckBus({ id: "de.boriskemper.system-audio-controller", name: "SA-C", version: streamDeck.info.plugin.version, caps: ["meters", "duck"] });
    bus.setState("actions", actions.list());
    if (!(await bus.start())) return;
    streamDeck.logger.info(`[deckbus] SA-C in slot ${bus.slot}`);
    systemAudio.onChange(share);
    share();
    serveDucking(bus, ducker.leases, { allow: (peer) => isDuckAllowed(peer.id), has: (topic) => ducker.has(topic) });
    systemAudio.onChange(() => ducker.check());
    systemAudio.onUserVolume((target) => ducker.userChanged(target));
    onDuckRevoked((id) => ducker.leases.leave(id));
    bus.onPeers(setDuckPeers);
    systemAudio.onMeter((source, m) => {
        const offer = offers.find((o) => o.source === source);
        if (offer) bus?.publish(offer.topic, { l: m.l, r: m.r });
    });
}

/** Status, the mic state and the offered streams; watch who subscribes to which. */
function share(): void {
    if (!bus) return;
    const out = systemAudio.endpoints.out;
    const input = systemAudio.endpoints.in;
    offers = [
        ...(systemAudio.ready("out") ? [{ topic: topicOf("out"), label: out.device?.name || "System output", stereo: true, source: "out" as const }] : []),
        ...(systemAudio.ready("in") ? [{ topic: topicOf("in"), label: input.device?.name || "Microphone", stereo: true, source: "in" as const }] : []),
        ...(systemAudio.ready("out") ? systemAudio.apps.map((a) => ({ topic: topicOf(`app:${a.app}`), label: a.name, stereo: true, source: `app:${a.app}` as const })) : []),
    ];
    const status = { online: systemAudio.ready("out"), detail: systemAudio.ready("out") ? out.device?.name : systemAudio.state };
    const mic = systemAudio.ready("in") ? { muted: input.muted } : undefined;
    const streams = offers.map(({ topic, label, stereo }) => ({ topic, label, stereo }));
    const json = JSON.stringify([status, mic, streams]);
    if (json !== lastState) {
        lastState = json;
        bus.setState("status", status);
        bus.setState("mic", mic);
        bus.setState("streams", streams);
    }
    for (const [topic, w] of watchers) {
        if (offers.some((o) => o.topic === topic)) continue;
        w.off();
        systemAudio.wantMeters(w.source, `bus:${topic}`, false);
        watchers.delete(topic);
    }
    for (const offer of offers) {
        if (watchers.has(offer.topic)) continue;
        const off = bus.onSubscribers(offer.topic, (count) => systemAudio.wantMeters(offer.source, `bus:${offer.topic}`, count > 0));
        watchers.set(offer.topic, { source: offer.source, off });
    }
}

export function stopSacBus(): void {
    bus?.stop();
}
