// The apps that had a media session, kept after they close (and on disk, cache/media-apps.json), so
// their player stays on deckbus as "closed": a key bound to Spotify still shows it, and a press on
// Play starts the app and plays. Starting: a Store app by its model id (shell:AppsFolder), a
// program by its file.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type RememberedApp = {
    /** The session's model id ("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify", "Spotify.exe"). */
    player: string;
    app: string;
    name: string;
    /** The program file, for programs without a model id to start by. */
    path?: string;
    /** When it last started playing (ms). */
    since: number;
};

/** bin/plugin.js → ../cache/media-apps.json */
function defaultFile(): string {
    return process.env.SAC_CACHE_DIR ? path.join(process.env.SAC_CACHE_DIR, "media-apps.json") : path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "cache", "media-apps.json");
}

/** How many apps are remembered (the ones seen last). */
const KEEP = 12;

export class MediaMemory {
    private apps = new Map<string, RememberedApp>();
    private loaded = false;
    private saved = "";

    constructor(private readonly file = defaultFile()) {}

    /** Remembers the apps of the live sessions (by app, the newest session wins). */
    seen(list: readonly RememberedApp[]): void {
        this.load();
        for (const a of list) {
            const before = this.apps.get(a.app);
            this.apps.delete(a.app);
            this.apps.set(a.app, { ...a, path: a.path ?? before?.path, since: Math.max(a.since, before?.since ?? 0) });
        }
        while (this.apps.size > KEEP) this.apps.delete(this.apps.keys().next().value!);
        this.save();
    }

    all(): RememberedApp[] {
        this.load();
        return [...this.apps.values()];
    }

    get(app: string): RememberedApp | undefined {
        this.load();
        return this.apps.get(app);
    }

    /** Whether the app can be started at all. */
    static canStart(a: RememberedApp): boolean {
        return a.player.includes("!") || !!a.path;
    }

    /** Starts the app (not waiting for it); throws when there's no way to. */
    static start(a: RememberedApp): void {
        const [cmd, args] = a.player.includes("!") ? ["explorer.exe", [`shell:AppsFolder\\${a.player.replace(/#\d+$/, "")}`]] : a.path ? [a.path, []] : [];
        if (!cmd) throw new Error(`${a.name} can't be started from here`);
        const child = spawn(cmd as string, args as string[], { detached: true, stdio: "ignore", windowsHide: false });
        child.on("error", () => {});
        child.unref();
    }

    private load(): void {
        if (this.loaded) return;
        this.loaded = true;
        try {
            const list = JSON.parse(fs.readFileSync(this.file, "utf8")) as RememberedApp[];
            if (Array.isArray(list)) for (const a of list) if (a && typeof a.player === "string" && typeof a.app === "string" && typeof a.name === "string") this.apps.set(a.app, { ...a, since: Number(a.since) || 0 });
            this.saved = JSON.stringify([...this.apps.values()]);
        } catch {
            // nothing remembered yet
        }
    }

    private save(): void {
        const json = JSON.stringify([...this.apps.values()]);
        if (json === this.saved) return;
        this.saved = json;
        try {
            fs.mkdirSync(path.dirname(this.file), { recursive: true });
            fs.writeFileSync(this.file, json);
        } catch {
            // remembered until the plugin stops then
        }
    }
}
