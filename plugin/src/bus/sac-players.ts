// SA-C's players on deckbus: Windows' media sessions (Spotify, a browser tab, Media Player) as
// players of kind "app" (the kit's players.ts, grill 2026-10-04; SA-C grill 2026-10-05), so SO-C's
// and MA-C's keys can control music on the computer too. A player's volume is its app's volume
// (Windows' volume mixer); everything else goes to the session through the helper.
import { PlayerBoard, readableCoverColor, type PlayerEntry, type Transport, type TransportCommand } from "@rocklobster42195/streamdeck-kit";
import type { MediaCommand, MediaSession } from "../audio/helper";
import { mediaApp } from "../audio/media-apps";
import { systemAudio, type AppInfo } from "../audio/system-audio";

export const sacPlayers = new PlayerBoard("SA-C");

const MEDIA: readonly MediaCommand[] = ["play-pause", "play", "pause", "next", "previous", "seek", "shuffle", "repeat"];

type Covers = { url(key: string | undefined): string | undefined; rgb(key: string | undefined): [number, number, number] | undefined };

/** Per session: whether it played last time, and when it last started (0: not since SA-C saw it). */
export type Starts = Map<string, { playing: boolean; since: number }>;

/** The players for the sessions; `starts` is kept up to date here. */
export function mediaPlayers(media: readonly MediaSession[], apps: readonly AppInfo[], covers: Covers, starts: Starts, now = Date.now()): PlayerEntry[] {
    for (const id of [...starts.keys()]) if (!media.some((m) => m.id === id)) starts.delete(id);
    return media.map((m) => {
        const playing = m.status === "playing";
        const start = starts.get(m.id) ?? { playing: false, since: 0 };
        if (playing && !start.playing) start.since = now;
        start.playing = playing;
        starts.set(m.id, start);
        const who = mediaApp(m.id, apps);
        const audio = who.matched ? apps.find((a) => a.app === who.app) : undefined;
        const can = m.can.split(",").filter((c): c is TransportCommand => (MEDIA as readonly string[]).includes(c));
        if (audio) can.push("volume", "volume-by", "mute");
        const rgb = covers.rgb(m.cover);
        return {
            player: m.id,
            name: who.name,
            kind: "app",
            app: who.app,
            direct: true,
            media: true,
            playing,
            since: start.since,
            ...(rgb ? { color: readableCoverColor(rgb) } : {}),
            ...(m.title ? { title: m.title } : {}),
            ...(m.artist ? { artist: m.artist } : {}),
            ...(m.album ? { album: m.album } : {}),
            ...(covers.url(m.cover) ? { cover: covers.url(m.cover) } : {}),
            ...(m.dur ? { position: m.pos ?? 0, duration: m.dur, at: m.at ?? now } : {}),
            ...(audio ? { volume: Math.round(audio.v * 100), muted: audio.muted } : {}),
            ...(m.shuffle !== undefined ? { shuffle: m.shuffle } : {}),
            ...(m.repeat ? { repeat: m.repeat } : {}),
            can,
        };
    });
}

const starts: Starts = new Map();

function publish(): void {
    sacPlayers.publish(mediaPlayers(systemAudio.media, systemAudio.apps, systemAudio.covers, starts));
}

/** Commands for SA-C's players, from its own keys and from other plugins (deckbus "transport"). */
async function transport({ player, command, value }: Transport): Promise<void> {
    const session = systemAudio.media.find((m) => m.id === player);
    if (!session) throw new Error(`transport: ${player} is not playing anything`);
    if ((MEDIA as readonly string[]).includes(command)) return systemAudio.mediaCommand(player, command as MediaCommand, value as number | boolean | string | undefined);
    const who = mediaApp(player, systemAudio.apps);
    const app = who.matched ? systemAudio.app(who.app) : undefined;
    if (!app) throw new Error(`transport: ${who.name} has no sound right now`);
    if (command === "volume") systemAudio.setAppVolume(app.app, (value as number) / 100);
    else if (command === "volume-by") systemAudio.setAppVolume(app.app, app.v + (value as number) / 100);
    else if (command === "mute") systemAudio.setAppMuted(app.app, value as boolean);
    else throw new Error(`transport: ${command} isn't possible here`);
}

/** Call once at start: follow the sessions and carry out commands. */
export function startSacPlayers(log: { warn(m: string): void }): void {
    sacPlayers.serve(transport, { failed: (t, e) => log.warn(`[players] ${t.command} on ${t.player} failed: ${e instanceof Error ? e.message : String(e)}`) });
    systemAudio.onChange(publish);
    publish();
}
