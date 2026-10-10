// SA-C on deckbus (see the kit's docs/deckbus-protocol.md): tells the other plugins whether the
// system audio is available and whether the mic is muted, and offers levels: the computer's output
// ("meters/system-output"), the mic ("meters/system-input") and each app with sound
// ("meters/app-spotify", …). A level is measured and sent only while some peer subscribes.
// Plugins the user allowed may lower the output or an app for a while ("duck", see ducking.ts).
// Whether the computer is in a call ("call", see calls.ts) and which apps use the mic ("mic").
// Windows' media sessions are players ("players", see sac-players.ts) that other plugins' keys control.
// The Panorama behind SA-C's dials is shared with the other dials of the row (one effect per row,
// see the kit's panorama/rows.ts).
import streamDeck from "@elgato/streamdeck";
import { trackActions } from "@rocklobster42195/streamdeck-kit/bridge";
import { PanoramaEngine, PanoramaRows, SharedPanorama } from "@rocklobster42195/streamdeck-kit";
import { ActionsState, DeckBus, serveDucking } from "@rocklobster42195/streamdeck-kit/bus";
import { Ducker, type DuckTarget } from "../audio/ducking";
import { systemAudio, type MeterSource } from "../audio/system-audio";
import { isDuckAllowed, onDuckRevoked, setDuckPeers } from "./duck-permissions";
import { sacPlayers, startSacPlayers } from "./sac-players";

type Offer = { topic: string; label: string; stereo: boolean; input?: true; source: MeterSource };

let bus: DeckBus | undefined;
let offers: Offer[] = [];
let lastState = "";
/** Topic → its source, and how to stop watching its subscriber count. */
const watchers = new Map<string, { source: MeterSource; off: () => void }>();
/** Where SA-C's actions are visible ("actions" state); collected from the start, shared once the bus exists. */
const actions = new ActionsState({ setState: (key, value) => bus?.setState(key, value) });

/** SA-C's Panorama (effects behind the dials), shared with the other plugins' dials once the bus runs. */
export const panorama = new SharedPanorama(new PanoramaEngine({ defaultColor: "#E14190" }), actions);

/** One effect per row of dials, agreed with the other plugins. */
export const panoramaRows = new PanoramaRows(panorama, { name: "SA-C", actions });

// Global setting "othersMayControlPlayers" (default on, as in SO-C): other plugins' keys may control
// the computer's media sessions over deckbus ("transport"). Off: they get "not allowed".
let othersMay = true;
const readOthersMay = (s: Record<string, unknown>) => (othersMay = s.othersMayControlPlayers !== false);

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
    panorama.connect(bus);
    panoramaRows.connect(bus);
    sacPlayers.connect(bus, { allow: () => othersMay });
    // The Panorama's colour ("Cover": the active player) counts SA-C's own players too, also when an
    // SA-C dial leads the row
    const shareCovers = () =>
        panoramaRows.covers.publish(
            sacPlayers
                .ownPlayers()
                .filter((p) => p.color)
                .map((p) => ({ player: p.player, name: p.name, color: p.color!, playing: p.playing, since: p.since })),
        );
    sacPlayers.onChange(shareCovers);
    shareCovers();
    streamDeck.settings.onDidReceiveGlobalSettings((ev) => readOthersMay(ev.settings as Record<string, unknown>));
    readOthersMay(await streamDeck.settings.getGlobalSettings().catch(() => ({})));
    startSacPlayers(streamDeck.logger);
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
        // The mic is marked as an input: plugins that move with music (MA-C's Panorama) leave it out
        ...(systemAudio.ready("in") ? [{ topic: topicOf("in"), label: input.device?.name || "Microphone", stereo: true, input: true as const, source: "in" as const }] : []),
        // Windows' system sounds (beeps, notifications) are no source anyone wants to follow
        ...(systemAudio.ready("out") ? systemAudio.apps.filter((a) => a.app !== "system").map((a) => ({ topic: topicOf(`app:${a.app}`), label: a.name, stereo: true, source: `app:${a.app}` as const })) : []),
    ];
    const status = { online: systemAudio.ready("out"), detail: systemAudio.ready("out") ? out.device?.name : systemAudio.state };
    const mic = systemAudio.ready("in") ? { muted: input.muted, users: systemAudio.micUsers } : undefined;
    const call = systemAudio.calls.call;
    const callState = systemAudio.state === "ready" ? (call ? { active: true, app: call.app, name: call.name, since: call.since } : { active: false }) : undefined;
    const streams = offers.map(({ topic, label, stereo, input }) => ({ topic, label, stereo, ...(input ? { input } : {}) }));
    const json = JSON.stringify([status, mic, streams, callState]);
    if (json !== lastState) {
        lastState = json;
        bus.setState("status", status);
        bus.setState("mic", mic);
        bus.setState("streams", streams);
        bus.setState("call", callState);
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

/** The other plugins on deckbus (name and version), for the diagnostics report. */
export function deckPeers(): { name: string; version: string }[] {
    return (bus ?? { peers: () => [] }).peers().map((p) => ({ name: p.name, version: p.version }));
}
