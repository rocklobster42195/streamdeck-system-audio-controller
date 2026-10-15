// Animated README pictures from the simulator: the real plugin against a fake system audio
// (tools/fake-helper.mjs, invented music on the meters), one GIF frame for every picture the plugin
// sends. Does not touch the real system audio.
//   node tools/sd-sim/readme-gifs.mjs [scene]      scenes: output-looks
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
/** How many of the last frames blend into the first, for a loop without a jump. */
const FADE_FRAMES = 7;
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
    // A loop without a jump: the last frames blend into the first one
    const k = Math.min(FADE_FRAMES, Math.floor(frames.length / 2));
    const first = frames[0].raw;
    for (let i = 0; i < k; i++) {
        const f = frames[frames.length - k + i];
        const t = (i + 1) / k;
        const mixed = Buffer.alloc(f.raw.length);
        for (let b = 0; b < mixed.length; b++) mixed[b] = Math.round(f.raw[b] * (1 - t) + first[b] * t);
        f.raw = mixed;
    }
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

/** Turns every dial down a few clicks and back up again, so the volume (and the level that follows it) visibly moves and the loop closes. */
async function turn(sim, dials) {
    await sleep(600);
    // One click is about 8 % here: down 5 clicks (no stop at 0) and up 5 again, so the volume ends where it began
    for (const ticks of [-2, -2, -1, 1, 2, 2]) {
        for (const d of dials) sim.rotate(d, ticks);
        await sleep(450);
    }
    await sleep(700);
}

const scenes = {
    // The Output dial in Digital, Classic VU, Open ring and Pie, side by side, turned down and up again
    async "output-looks"(sim) {
        const dials = ["digital", "classic", "open", "pie"].map((style, c) => dial(sim, "output-dial", { style }, c));
        await sim.sleep(2500);
        await record(path.join(OUT, "output-looks.gif"), dials.map((c) => sim.state.slots.get(c)), () => turn(sim, dials));
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
