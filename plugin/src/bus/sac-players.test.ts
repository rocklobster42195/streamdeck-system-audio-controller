import { describe, expect, it, vi } from "vitest";

vi.mock("@elgato/streamdeck", () => ({ default: { logger: { info() {}, warn() {} } } }));

const { mediaPlayers } = await import("./sac-players");
type Starts = Parameters<typeof mediaPlayers>[3];

const spotify = {
    id: "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify",
    status: "playing" as const,
    title: "Sky Bird",
    artist: "Genix",
    album: "",
    pos: 15.6,
    dur: 199.7,
    at: 1000,
    shuffle: false,
    repeat: "off" as const,
    can: "play-pause,pause,next,previous,seek,shuffle,repeat",
    cover: "2f66",
};
const apps = [{ app: "spotify", name: "Spotify", v: 0.5, muted: false, active: true }];
const covers = { url: (k?: string) => (k ? `http://127.0.0.1:1234/cover/${k}` : undefined), rgb: (k?: string) => (k ? ([135, 65, 42] as [number, number, number]) : undefined) };

describe("media sessions as players", () => {
    it("makes an app player with the app's volume and the session's commands", () => {
        const [p] = mediaPlayers([spotify], apps, covers, new Map(), 5000);
        expect(p).toMatchObject({
            player: spotify.id,
            name: "Spotify",
            kind: "app",
            app: "spotify",
            direct: true,
            media: true,
            playing: true,
            since: 5000,
            title: "Sky Bird",
            artist: "Genix",
            cover: "http://127.0.0.1:1234/cover/2f66",
            position: 15.6,
            duration: 199.7,
            at: 1000,
            volume: 50,
            muted: false,
            shuffle: false,
            repeat: "off",
        });
        expect(p.album).toBeUndefined();
        expect(p.color).toMatch(/^#[0-9a-f]{6}$/i);
        expect(p.can).toEqual(["play-pause", "pause", "next", "previous", "seek", "shuffle", "repeat", "volume", "volume-by", "mute"]);
    });

    it("doesn't count a session as playing while its app makes no sound here (Spotify Connect, a muted tab)", () => {
        expect(mediaPlayers([spotify], [{ ...apps[0], active: false }], covers, new Map(), 5000)[0].playing).toBe(false);
        expect(mediaPlayers([spotify], [], covers, new Map(), 5000)[0]).toMatchObject({ playing: false, since: 0 });
    });

    it("offers no volume for a session whose app has no sound", () => {
        const [p] = mediaPlayers([spotify], [], covers, new Map(), 5000);
        expect(p.volume).toBeUndefined();
        expect(p.can).not.toContain("volume");
    });

    it("keeps the start time while paused and sets a new one when it plays again", () => {
        const starts: Starts = new Map();
        mediaPlayers([spotify], apps, covers, starts, 5000);
        expect(mediaPlayers([{ ...spotify, status: "paused" }], apps, covers, starts, 6000)[0]).toMatchObject({ playing: false, since: 5000 });
        expect(mediaPlayers([spotify], apps, covers, starts, 9000)[0].since).toBe(9000);
    });

    it("counts a paused session seen first as never started, and forgets closed sessions", () => {
        const starts: Starts = new Map();
        expect(mediaPlayers([{ ...spotify, status: "paused" }], apps, covers, starts, 5000)[0].since).toBe(0);
        mediaPlayers([], apps, covers, starts, 6000);
        expect(starts.size).toBe(0);
    });

    it("leaves out position, cover and colour when the session has none", () => {
        const [p] = mediaPlayers([{ ...spotify, dur: undefined, pos: undefined, cover: undefined }], apps, covers, new Map(), 5000);
        expect(p.position).toBeUndefined();
        expect(p.cover).toBeUndefined();
        expect(p.color).toBeUndefined();
    });
});

describe("closed apps", async () => {
    const { closedPlayers } = await import("./sac-players");
    const spotifyApp = { player: spotify.id, app: "spotify", name: "Spotify", since: 4000 };

    it("keeps a closed app as a player that only takes Play", () => {
        expect(closedPlayers([spotifyApp], [])).toEqual([
            { player: spotify.id, name: "Spotify", kind: "app", app: "spotify", direct: true, media: true, playing: false, since: 4000, can: ["play", "play-pause"], closed: true },
        ]);
    });

    it("leaves it out while the app has a session, or when it can't be started", () => {
        const live = mediaPlayers([spotify], apps, covers, new Map(), 5000);
        expect(closedPlayers([spotifyApp], live)).toEqual([]);
        expect(closedPlayers([{ player: "Foo.exe", app: "foo", name: "Foo", since: 0 }], [])).toEqual([]);
        expect(closedPlayers([{ player: "Foo.exe", app: "foo", name: "Foo", path: "C:\\Foo\\Foo.exe", since: 0 }], [])).toHaveLength(1);
    });
});
