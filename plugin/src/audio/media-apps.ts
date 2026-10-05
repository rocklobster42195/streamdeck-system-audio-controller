// Which app a media session belongs to. Windows names a session by the app's model id
// ("SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify", "Spotify.exe", "MSEdge", "308046B0AF4A39CB"),
// SA-C's apps are process names ("spotify", "msedge", "firefox"). The same key on both sides makes
// a player's volume the app's volume, and a key's choice "app:spotify" the same app everywhere.

/** Model ids that don't name their app (Firefox registers a hash of its install path). */
const KNOWN: Record<string, string> = {
    "308046b0af4a39cb": "firefox",
    "6f193ccc56814779": "firefox",
    "e7cf176e110c211b": "firefox",
    msedge: "msedge",
    chrome: "chrome",
};

/** The names a model id might mean, most likely first (lower case). */
export function candidates(id: string): string[] {
    const bare = id.replace(/#\d+$/, "");
    const out: string[] = [];
    const add = (s: string | undefined) => {
        const c = s?.trim().toLowerCase().replace(/\.exe$/, "");
        if (c && !out.includes(c)) out.push(c);
    };
    add(KNOWN[bare.toLowerCase()]);
    const bang = bare.indexOf("!");
    if (bang >= 0) {
        // A Store app: "<publisher>.<name>_<hash>!<entry>"
        add(bare.slice(bang + 1));
        const pkg = bare.slice(0, bang).replace(/_[a-z0-9]+$/i, "");
        for (const part of pkg.split(".").reverse()) add(part);
    } else {
        // A program: its exe name, sometimes with a path
        add(bare.split(/[\\/]/).pop());
    }
    return out;
}

/** The app (key and name) of a media session, given the apps with sound right now. */
export function mediaApp(id: string, apps: readonly { app: string; name: string }[]): { app: string; name: string; matched: boolean } {
    const names = candidates(id);
    for (const c of names) {
        const a = apps.find((x) => x.app === c);
        if (a) return { app: a.app, name: a.name, matched: true };
    }
    // "spotifyab" ↔ "spotify": one contains the other (only for names long enough to mean something)
    for (const c of names) {
        const a = apps.find((x) => x.app.length >= 4 && c.length >= 4 && (c.includes(x.app) || x.app.includes(c)));
        if (a) return { app: a.app, name: a.name, matched: true };
    }
    const app = names[0] ?? id.toLowerCase();
    return { app, name: app.charAt(0).toUpperCase() + app.slice(1), matched: false };
}
