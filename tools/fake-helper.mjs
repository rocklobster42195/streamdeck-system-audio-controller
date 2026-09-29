// A stand-in for helper/sac-audio.ps1 (same JSON lines): a fake output device with invented music
// on the meters. The simulator runs the plugin with SAC_HELPER=<this file>; nothing touches the
// real system volume.
import readline from "node:readline";

const out = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
let volume = 0.42;
let muted = false;
let metering = false;

let seed = 5;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const t0 = Date.now();
const db = (t, o) => {
    const kick = Math.exp(-((t / 500 + o) % 1) * 9);
    const swell = 0.3 + 0.7 * (0.5 - 0.5 * Math.cos(t / 1300));
    const amp = Math.max(1e-4, (0.04 + 0.6 * kick + 0.06 * rnd()) * swell);
    return Math.round((20 * Math.log10(amp) - 4) * 10) / 10;
};

out({ t: "ready" });
out({ t: "device", id: "{sim}", name: "Speakers (Sim Audio)" });
out({ t: "volume", v: volume, muted });

readline.createInterface({ input: process.stdin }).on("line", (line) => {
    const cmd = JSON.parse(line);
    if (cmd.cmd === "quit") process.exit(0);
    if (cmd.cmd === "volume") volume = cmd.v;
    if (cmd.cmd === "mute") muted = cmd.on;
    if (cmd.cmd === "meters") metering = cmd.on;
    if (cmd.cmd === "volume" || cmd.cmd === "mute") out({ t: "volume", v: volume, muted });
}).on("close", () => process.exit(0));

setInterval(() => {
    if (!metering) return;
    const t = Date.now() - t0;
    out({ t: "meter", l: db(t, 0), r: db(t, 0.013) });
}, 50);
