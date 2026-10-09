// SA-C's players on deckbus: Windows' media sessions (Spotify, a browser tab, Media Player) as
// players of kind "app" (the kit's players.ts, grill 2026-10-04; SA-C grill 2026-10-05), so SO-C's
// and MA-C's keys can control music on the computer too. A player's volume is its app's volume
// (Windows' volume mixer); everything else goes to the session through the helper. An app that
// closed stays as a "closed" player (media-memory.ts): Play starts it and plays.
import { PlayerBoard, readableCoverColor, type PlayerEntry, type Transport, type TransportCommand } from "@rocklobster42195/streamdeck-kit";
import type { MediaCommand, MediaSession } from "../audio/helper";
import { appIcon } from "../audio/app-icons";
import { mediaApp } from "../audio/media-apps";
import { MediaMemory, type RememberedApp } from "../audio/media-memory";
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
        const who = mediaApp(m.id, apps);
        const audio = who.matched ? apps.find((a) => a.app === who.app) : undefined;
        // Playing only while the app makes sound here: Spotify showing a Spotify Connect playback
        // on other speakers (it even shows the next track early, seen 2026-10-09 with Music
        // Assistant) or a muted tab says "playing" without a sound on this computer, and would
        // otherwise become the active player (the Panorama's colour)
        const playing = m.status === "playing" && audio?.active === true;
        const start = starts.get(m.id) ?? { playing: false, since: 0 };
        if (playing && !start.playing) start.since = now;
        start.playing = playing;
        starts.set(m.id, start);
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

/**
 * Remembered apps without a session now, as players that only take Play (which starts the app).
 * They carry `closed: true` (peers may add fields), so a key can show them as closed.
 */
export function closedPlayers(remembered: readonly RememberedApp[], live: readonly PlayerEntry[]): PlayerEntry[] {
    return remembered
        .filter((a) => MediaMemory.canStart(a) && !live.some((p) => p.app === a.app))
        .map((a) => ({ player: a.player, name: a.name, kind: "app", app: a.app, direct: true, media: true, playing: false, since: a.since, can: ["play", "play-pause"], closed: true }) as PlayerEntry);
}

/** After starting an app, how long to wait for its session before giving up on playing it. */
const START_WAIT_MS = 20_000;

const starts: Starts = new Map();
const memory = new MediaMemory();

function publish(): void {
    const live = mediaPlayers(systemAudio.media, systemAudio.apps, systemAudio.covers, starts);
    if (systemAudio.state === "unsupported") return sacPlayers.publish(live.map(withSource));
    memory.seen(live.map((p) => ({ player: p.player, app: p.app!, name: p.name, path: systemAudio.app(p.app)?.path, since: p.since })));
    sacPlayers.publish([...live, ...closedPlayers(memory.all(), live)].map(withSource));
}

/** Where it plays from, for the universal keys' "source" corner: the app, with its icon (grey while closed). */
function withSource(p: PlayerEntry): PlayerEntry {
    const icon = appIcon(p.app, (p as { closed?: boolean }).closed === true);
    return { ...p, source: p.name, ...(icon ? { sourceIcon: icon } : {}) };
}

/** Starts a closed app, then plays it once its session shows up (in the background: a start takes long). */
function startAndPlay(a: RememberedApp, log: { warn(m: string): void }): void {
    MediaMemory.start(a);
    const sessionOf = () => systemAudio.media.find((m) => mediaApp(m.id, systemAudio.apps).app === a.app);
    let off = () => {};
    const timer = setTimeout(() => {
        off();
        log.warn(`[players] ${a.name} started, but no media session showed up`);
    }, START_WAIT_MS);
    const check = () => {
        const s = sessionOf();
        if (!s) return;
        off();
        clearTimeout(timer);
        if (s.status !== "playing") void systemAudio.mediaCommand(s.id, "play").catch((e: unknown) => log.warn(`[players] play after starting ${a.name}: ${e instanceof Error ? e.message : String(e)}`));
    };
    off = systemAudio.onChange(check);
}

let log: { warn(m: string): void } = console;

/** Commands for SA-C's players, from its own keys and from other plugins (deckbus "transport"). */
async function transport({ player, command, value }: Transport): Promise<void> {
    const session = systemAudio.media.find((m) => m.id === player);
    if (!session) {
        const closed = memory.all().find((a) => a.player === player);
        if (!closed) throw new Error(`transport: ${player} is not playing anything`);
        if (command !== "play" && command !== "play-pause") throw new Error(`transport: ${closed.name} is closed`);
        return startAndPlay(closed, log);
    }
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
export function startSacPlayers(logger: { warn(m: string): void }): void {
    log = logger;
    sacPlayers.serve(transport, { failed: (t, e) => log.warn(`[players] ${t.command} on ${t.player} failed: ${e instanceof Error ? e.message : String(e)}`) });
    systemAudio.onChange(publish);
    publish();
}
