import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MediaMemory } from "./media-memory";

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sac-mem-")), "media-apps.json");

describe("MediaMemory", () => {
    it("remembers apps across restarts, keeping a known path and the latest start", () => {
        const file = tmp();
        const a = new MediaMemory(file);
        a.seen([{ player: "Spotify.exe", app: "spotify", name: "Spotify", path: "C:\\S\\Spotify.exe", since: 10 }]);
        a.seen([{ player: "Spotify.exe", app: "spotify", name: "Spotify", since: 5 }]);
        const b = new MediaMemory(file);
        expect(b.get("spotify")).toEqual({ player: "Spotify.exe", app: "spotify", name: "Spotify", path: "C:\\S\\Spotify.exe", since: 10 });
    });

    it("keeps the apps seen last", () => {
        const m = new MediaMemory(tmp());
        for (let i = 0; i < 15; i++) m.seen([{ player: `A${i}.exe`, app: `a${i}`, name: `A${i}`, since: i }]);
        expect(m.all()).toHaveLength(12);
        expect(m.get("a0")).toBeUndefined();
        expect(m.get("a14")).toBeDefined();
    });

    it("starts Store apps by model id, programs by file", () => {
        expect(MediaMemory.canStart({ player: "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify", app: "spotify", name: "Spotify", since: 0 })).toBe(true);
        expect(MediaMemory.canStart({ player: "Foo.exe", app: "foo", name: "Foo", since: 0 })).toBe(false);
        expect(MediaMemory.canStart({ player: "Foo.exe", app: "foo", name: "Foo", path: "C:\\Foo.exe", since: 0 })).toBe(true);
    });

    it("starts empty without a file", () => {
        expect(new MediaMemory(path.join(os.tmpdir(), "sac-none", "x.json")).all()).toEqual([]);
    });
});
