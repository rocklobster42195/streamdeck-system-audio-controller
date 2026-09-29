// A stand-in for helper/sac-audio.ps1 (same JSON lines, see Helper.cs): two output devices, a
// mic, two apps with sound, invented music on the meters. The simulator runs the plugin with
// SAC_HELPER=<this file>; nothing touches the real system audio.
import readline from "node:readline";
import { createRequire } from "node:module";

// Invented app icons: a coloured disc with a letter (colour and greyed out, like the real helper)
const sharp = createRequire(import.meta.url)("sharp");
const disc = (color, letter) => `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><circle cx="64" cy="64" r="60" fill="${color}"/><text x="64" y="86" font-family="Arial" font-size="64" font-weight="bold" fill="#fff" text-anchor="middle">${letter}</text></svg>`;
const png = async (svg) => (await sharp(Buffer.from(svg)).png().toBuffer()).toString("base64");

const out = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const devices = [
    { id: "{sim-speakers}", name: "Speakers (Sim Audio)" },
    { id: "{sim-headphones}", name: "Headphones (Sim USB)" },
];
let defaultId = devices[0].id;
const ends = { out: { v: 0.42, muted: false }, in: { v: 0.8, muted: false } };
const apps = [
    { app: "spotify", name: "Spotify", v: 1, muted: false, active: true },
    { app: "firefox", name: "Firefox", v: 0.6, muted: false, active: false },
];
const metering = { out: false, in: false };
let meteredApps = [];

let seed = 5;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const t0 = Date.now();
const db = (t, o, gain = 1) => {
    const kick = Math.exp(-((t / 500 + o) % 1) * 9);
    const swell = 0.3 + 0.7 * (0.5 - 0.5 * Math.cos(t / 1300));
    const amp = Math.max(1e-4, (0.04 + 0.6 * kick + 0.06 * rnd()) * swell * gain);
    return Math.round((20 * Math.log10(amp) - 4) * 10) / 10;
};

const sendDevice = () => {
    const d = devices.find((x) => x.id === defaultId);
    out({ t: "device", flow: "out", id: d.id, name: d.name });
    out({ t: "devices", list: devices.map((x) => ({ ...x, default: x.id === defaultId })) });
};
const sendVolume = (flow) => out({ t: "volume", flow, v: ends[flow].v, muted: ends[flow].muted });

out({ t: "ready" });
sendDevice();
out({ t: "device", flow: "in", id: "{sim-mic}", name: "Microphone (Sim USB)" });
sendVolume("out");
sendVolume("in");
out({ t: "apps", list: apps });
for (const [app, color] of [["spotify", "#59A028"], ["firefox", "#F7A600"]]) {
    const letter = app[0].toUpperCase();
    out({ t: "appicon", app, png: await png(disc(color, letter)), grey: await png(disc("#8a8a90", letter).replace("<circle", '<circle opacity="0.55"')) });
}
// SAC_FAKE_QUIT=firefox: that app closes after 4 s (to see a dial or key greyed out)
if (process.env.SAC_FAKE_QUIT) {
    setTimeout(() => {
        const i = apps.findIndex((a) => a.app === process.env.SAC_FAKE_QUIT);
        if (i >= 0) apps.splice(i, 1);
        out({ t: "apps", list: apps });
    }, 4000);
}

readline
    .createInterface({ input: process.stdin })
    .on("line", (line) => {
        const cmd = JSON.parse(line);
        const flow = cmd.flow === "in" ? "in" : "out";
        switch (cmd.cmd) {
            case "quit":
                process.exit(0);
                break;
            case "volume":
                ends[flow].v = cmd.v;
                sendVolume(flow);
                break;
            case "mute":
                ends[flow].muted = cmd.on;
                sendVolume(flow);
                break;
            case "meters":
                metering[flow] = cmd.on;
                break;
            case "default":
                if (devices.some((d) => d.id === cmd.id)) defaultId = cmd.id;
                sendDevice();
                break;
            case "appvolume":
            case "appmute": {
                const app = apps.find((a) => a.app === cmd.app);
                if (app && cmd.cmd === "appvolume") app.v = cmd.v;
                if (app && cmd.cmd === "appmute") app.muted = cmd.on;
                out({ t: "apps", list: apps });
                break;
            }
            case "appmeters":
                meteredApps = cmd.apps ? cmd.apps.split(",") : [];
                break;
        }
    })
    .on("close", () => process.exit(0));

setInterval(() => {
    const t = Date.now() - t0;
    if (metering.out) out({ t: "meter", flow: "out", l: db(t, 0), r: db(t, 0.013) });
    if (metering.in) out({ t: "meter", flow: "in", l: db(t, 0.3, 0.4), r: db(t, 0.3, 0.4) });
    for (const app of meteredApps) {
        const gain = app === "spotify" ? 1 : 0.05;
        out({ t: "appmeter", app, l: db(t, 0.1, gain), r: db(t, 0.11, gain) });
    }
}, 50);
