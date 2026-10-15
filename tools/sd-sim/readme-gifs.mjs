// Animated README pictures from the simulator: the real plugin against a fake system audio
// (tools/fake-helper.mjs, invented music on the meters), one GIF frame for every picture the plugin
// sends. Does not touch the real system audio.
//   node tools/sd-sim/readme-gifs.mjs [scene]      scenes: output-looks, apps
// Writes docs/screenshots/<scene>.gif.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import GIFEncoder from "gif-encoder-2";
import { startSim } from "./sim.mjs";

process.env.SAC_HELPER = fileURLToPath(new URL("../fake-helper.mjs", import.meta.url));
// The invented icons stay out of the real plugin's cache
process.env.SAC_CACHE_DIR = fileURLToPath(new URL("../../sim-out/cache", import.meta.url));

const root = fileURLToPath(new URL("../..", import.meta.url));
const sharp = createRequire(path.join(root, "plugin/package.json"))("sharp");
const OUT = path.join(root, "docs", "screenshots");
fs.mkdirSync(OUT, { recursive: true });

const SCALE = 1;
/** At most this many frames a second: the meters move 20 times a second, a README GIF doesn't need that. */
const MIN_FRAME_MS = 80;
const GAP = 4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The pixmap URI of a dial slot (feedback), to see when it changes. */
function uriOf(slot) {
    const fb = slot.feedback ?? {};
    const key = Object.keys(fb).find((k) => typeof fb[k] === "string" && fb[k].startsWith("data:image"));
    const nested = Object.values(fb).find((v) => v && typeof v === "object" && typeof v.value === "string" && v.value.startsWith("data:image"));
    return key ? fb[key] : nested?.value;
}

/** A dial's picture at 200 × 100 times SCALE (SVGs are drawn at that size, not scaled up). */
async function strip(slot) {
    const [w, h] = [200 * SCALE, 100 * SCALE];
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(uriOf(slot) ?? "");
    if (!m) return sharp({ create: { width: w, height: h, channels: 4, background: "#111" } }).png().toBuffer();
    const buf = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]));
    return sharp(buf, { density: 72 * SCALE }).resize(w, h).png().toBuffer();
}

/** Records the dials side by side while `during()` runs and writes the GIF. */
async function record(file, slots, during) {
    const w = 200 * SCALE, h = 100 * SCALE, gap = GAP * SCALE;
    const total = slots.length * w + (slots.length - 1) * gap;
    const frames = [];
    let running = true;
    let last = "";
    const sampler = (async () => {
        while (running) {
            const now = slots.map(uriOf).join("|");
            if (now === last || Date.now() - (frames.at(-1)?.at ?? 0) < MIN_FRAME_MS) {
                await sleep(5);
                continue;
            }
            last = now;
            const at = Date.now();
            const parts = await Promise.all(slots.map(strip));
            const raw = await sharp({ create: { width: total, height: h, channels: 4, background: "#000000" } })
                .composite(parts.map((input, i) => ({ input, left: i * (w + gap), top: 0 })))
                .ensureAlpha()
                .raw()
                .toBuffer();
            frames.push({ raw, at });
        }
    })();
    await during();
    running = false;
    await sampler;
    const enc = new GIFEncoder(total, h, "neuquant", true, frames.length);
    enc.setRepeat(0);
    enc.setQuality(20);
    enc.start();
    frames.forEach((f, i) => {
        enc.setDelay(Math.max(20, Math.min(1000, (frames[i + 1]?.at ?? f.at + 100) - f.at)));
        enc.addFrame(new Uint8ClampedArray(f.raw));
    });
    enc.finish();
    const data = enc.out.getData();
    fs.writeFileSync(file, data);
    console.log(`wrote ${path.relative(root, file)} (${frames.length} frames, ${(data.length / 1024).toFixed(0)} KB)`);
}

const dial = (sim, suffix, settings, column) => sim.add(suffix, settings, { column, controller: "Encoder" });

const scenes = {
    // The four meter looks of the Output dial, side by side
    async "output-looks"(sim) {
        const dials = ["digital", "classic", "ring", "pie"].map((style, c) => dial(sim, "output-dial", { style }, c));
        await sim.sleep(2500);
        await record(path.join(OUT, "output-looks.gif"), dials.map((c) => sim.state.slots.get(c)), async () => {
            await sleep(3500);
        });
    },
    // The Output dial as a horseshoe and two apps, each with its own level
    async apps(sim) {
        const dials = [
            dial(sim, "output-dial", { style: "open" }, 0),
            dial(sim, "app-dial", { app: "spotify", appName: "Spotify" }, 1),
            dial(sim, "app-dial", { app: "firefox", appName: "Firefox", style: "ring" }, 2),
        ];
        await sim.sleep(2500);
        await record(path.join(OUT, "apps.gif"), dials.map((c) => sim.state.slots.get(c)), async () => {
            await sleep(3500);
        });
    },
};

const only = process.argv[2];
for (const [name, run] of Object.entries(scenes)) {
    if (only && only !== name) continue;
    const sim = await startSim({ language: "en" });
    try {
        await run(sim);
    } finally {
        await sim.stop();
    }
}
process.exit(0);
