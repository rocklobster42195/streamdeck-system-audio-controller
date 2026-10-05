// A stand-in for helper/sac-audio.ps1 (same JSON lines, see Helper.cs and Media.cs): two output
// devices, a mic, two apps with sound, invented music on the meters, and two media sessions
// (Spotify playing, a Firefox tab that only takes play/pause). The simulator runs the plugin with
// SAC_HELPER=<this file>; nothing touches the real system audio.
import fs from "node:fs";
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
// A device volume curve like many Windows drivers: 50 % ≈ -10 dB, 0 % = -65.25 dB
const CURVE = 33.22;
const levelDb = (v) => (v > 0.0001 ? Math.max(-65.25, CURVE * Math.log10(v)) : -65.25);
const sendVolume = (flow) => out({ t: "volume", flow, v: ends[flow].v, db: Math.round(levelDb(ends[flow].v) * 10) / 10, muted: ends[flow].muted });

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

// Media sessions (Media.cs): "next" moves on through the tracks, a refused command gets an error
const tracks = [
    { title: "Sim Song One", artist: "The Simulators", album: "Fake Hits", dur: 200, color: "#E14190" },
    { title: "Sim Song Two", artist: "The Simulators", album: "Fake Hits", dur: 180, color: "#009FDF" },
];
let track = 0;
const sessions = [
    { id: "Spotify.exe", status: "playing", pos: 30, at: Date.now(), shuffle: false, repeat: "off", can: "play-pause,play,pause,next,previous,seek,shuffle,repeat" },
    { id: "308046B0AF4A39CB", status: "paused", title: "A video", artist: "", album: "", can: "play-pause,play,pause" },
];
const coverOf = async (t) => {
    const cover = `c${tracks.indexOf(t)}`;
    const data = (await sharp(Buffer.from(disc(t.color, String(tracks.indexOf(t) + 1)))).png().toBuffer()).toString("base64");
    const hex = t.color.slice(1);
    out({ t: "mediacover", cover, type: "image/png", data, rgb: [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) });
    return cover;
};
const sendMedia = async () => {
    const t = tracks[track];
    const spotify = sessions[0];
    Object.assign(spotify, { title: t.title, artist: t.artist, album: t.album, dur: t.dur, cover: await coverOf(t) });
    out({ t: "media", list: sessions });
};
await sendMedia();
const media = (cmd) => {
    const s = sessions.find((x) => x.id === cmd.id);
    if (!s) return `no media session ${cmd.id}`;
    if (!s.can.split(",").includes(cmd.do)) return `${cmd.id} refused ${cmd.do}`;
    const now = Date.now();
    if (s.status === "playing" && s.pos !== undefined) s.pos += (now - s.at) / 1000;
    s.at = now;
    switch (cmd.do) {
        case "play-pause": s.status = s.status === "playing" ? "paused" : "playing"; break;
        case "play": s.status = "playing"; break;
        case "pause": s.status = "paused"; break;
        case "next": track = (track + 1) % tracks.length; s.pos = 0; break;
        case "previous": track = (track + tracks.length - 1) % tracks.length; s.pos = 0; break;
        case "seek": s.pos = Number(cmd.value); break;
        case "shuffle": s.shuffle = cmd.value === true; break;
        case "repeat": s.repeat = cmd.value; break;
    }
    return undefined;
};

// SAC_FAKE_CALL=<start ms>,<end ms>: a Teams call (Windows ducks for it, the mic opens ~3 s later
// and closes just before the end), as seen with a real Teams test call
out({ t: "calls", list: [] });
out({ t: "micusers", list: [] });
if (process.env.SAC_FAKE_CALL) {
    const [start, end] = process.env.SAC_FAKE_CALL.split(",").map(Number);
    const teams = { app: "ms-teams", name: "Microsoft Teams" };
    setTimeout(() => out({ t: "calls", list: [teams] }), start);
    setTimeout(() => out({ t: "micusers", list: [teams] }), start + 300);
    setTimeout(() => out({ t: "micusers", list: [] }), end - 300);
    setTimeout(() => out({ t: "calls", list: [] }), end);
}

// SAC_FAKE_STATE=<file>: the volumes after every command, for the simulator's checks
const dumpState = () => process.env.SAC_FAKE_STATE && fs.writeFileSync(process.env.SAC_FAKE_STATE, JSON.stringify({ out: ends.out, apps, media: sessions }));
dumpState();

readline
    .createInterface({ input: process.stdin })
    .on("line", (line) => {
        const cmd = JSON.parse(line);
        setImmediate(dumpState);
        const flow = cmd.flow === "in" ? "in" : "out";
        switch (cmd.cmd) {
            case "quit":
                process.exit(0);
                break;
            case "volume":
                ends[flow].v = cmd.v;
                sendVolume(flow);
                break;
            case "volumedb":
                ends[flow].v = Math.round(Math.min(1, 10 ** (Math.min(0, cmd.db) / CURVE)) * 1000) / 1000;
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
            case "media": {
                const error = media(cmd);
                out({ t: "mediadone", ref: cmd.ref, ...(error ? { error } : {}) });
                void sendMedia();
                break;
            }
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
