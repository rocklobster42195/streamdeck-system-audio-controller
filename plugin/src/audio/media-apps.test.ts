import { describe, expect, it } from "vitest";
import { candidates, mediaApp } from "./media-apps";

const apps = [
    { app: "spotify", name: "Spotify" },
    { app: "msedge", name: "Microsoft Edge" },
    { app: "firefox", name: "Firefox" },
    { app: "vlc", name: "VLC media player" },
];

describe("media session → app", () => {
    it("finds a Store app by its entry and package names", () => {
        expect(candidates("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify")).toEqual(["spotify", "spotifymusic", "spotifyab"]);
        expect(mediaApp("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify", apps)).toEqual({ app: "spotify", name: "Spotify", matched: true });
    });

    it("finds a program by its exe name, also with a path", () => {
        expect(mediaApp("Spotify.exe", apps).app).toBe("spotify");
        expect(mediaApp("{6D809377-6AF0-444B-8957-A3773F02200E}\\VideoLAN\\VLC\\vlc.exe", apps)).toEqual({ app: "vlc", name: "VLC media player", matched: true });
    });

    it("knows the ids that don't name their app", () => {
        expect(mediaApp("308046B0AF4A39CB", apps).app).toBe("firefox");
        expect(mediaApp("MSEdge", apps).name).toBe("Microsoft Edge");
    });

    it("keeps a second session of one app with the same app", () => {
        expect(mediaApp("MSEdge#2", apps).app).toBe("msedge");
    });

    it("falls back to a name from the id when the app has no sound session", () => {
        expect(mediaApp("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify", [])).toEqual({ app: "spotify", name: "Spotify", matched: false });
    });

    it("doesn't match on short fragments", () => {
        expect(mediaApp("Foo.exe", [{ app: "fo", name: "Fo" }]).matched).toBe(false);
    });
});
