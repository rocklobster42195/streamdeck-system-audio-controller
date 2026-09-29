// App icons from the helper (colour and greyed out), kept in memory and on disk next to the
// plugin (cache/icons/), so a dial or key can show an app's icon while the app isn't running,
// also after a restart. SAC_CACHE_DIR moves the cache (the simulator keeps its invented icons apart).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type Icons = { color: string; grey: string };

const icons = new Map<string, Icons | null>();

/** bin/plugin.js → ../cache/icons */
function dir(): string {
    return process.env.SAC_CACHE_DIR ? path.join(process.env.SAC_CACHE_DIR, "icons") : path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "cache", "icons");
}

const file = (key: string, grey: boolean) => path.join(dir(), `${key.replace(/[^a-z0-9._-]/gi, "_")}${grey ? ".grey" : ""}.png`);
const uri = (base64: string) => `data:image/png;base64,${base64}`;

export function saveAppIcon(key: string, png: string, grey: string): void {
    icons.set(key, { color: uri(png), grey: uri(grey) });
    try {
        fs.mkdirSync(dir(), { recursive: true });
        fs.writeFileSync(file(key, false), Buffer.from(png, "base64"));
        fs.writeFileSync(file(key, true), Buffer.from(grey, "base64"));
    } catch {
        // no cache then; the helper sends it again next time
    }
}

/** The app's icon as a data URI (greyed out on request), or undefined. */
export function appIcon(key: string | undefined, grey = false): string | undefined {
    if (!key) return undefined;
    if (!icons.has(key)) {
        try {
            icons.set(key, { color: uri(fs.readFileSync(file(key, false)).toString("base64")), grey: uri(fs.readFileSync(file(key, true)).toString("base64")) });
        } catch {
            icons.set(key, null);
        }
    }
    const found = icons.get(key);
    return found ? (grey ? found.grey : found.color) : undefined;
}
