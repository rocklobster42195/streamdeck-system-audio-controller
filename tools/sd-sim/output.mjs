// Output dials in all four looks, then App dials, Mic and Device keys, against a fake system
// audio (tools/fake-helper.mjs), plus deckbus: streams, the mic state, a subscriber. Writes deck
// snapshots to <outDir>/output/. Does not touch the real system audio.
//   node tools/sd-sim/output.mjs [outDir]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DeckBus } from "@rocklobster42195/streamdeck-kit/bus";
import { startSim } from "./sim.mjs";

process.env.SAC_HELPER = fileURLToPath(new URL("../fake-helper.mjs", import.meta.url));
// The invented icons stay out of the real plugin's cache
process.env.SAC_CACHE_DIR = fileURLToPath(new URL("../../sim-out/cache", import.meta.url));
const out = path.resolve(process.argv[2] ?? "sim-out", "output");
const results = [];
const check = (name, ok, detail = "") => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const peer = new DeckBus({ id: "sim-listener", name: "Listener", version: "1", scanMs: 500 });
await peer.start();
// Plugins already on the bus (e.g. SA-C in the real Stream Deck, same id and name) aren't the one under test
await new Promise((r) => setTimeout(r, 1200));
const before = new Set(peer.peers().map((p) => p.slot));
const simSac = () => peer.peers().find((p) => p.name === "SA-C" && !before.has(p.slot));
const sim = await startSim({ language: "en" });
try {
    const dials = ["digital", "classic", "ring", "pie"].map((style, column) => sim.add("output-dial", { style }, { column, controller: "Encoder" }));
    await sim.sleep(1500);
    await sim.snapshot(out, "1-styles");

    sim.rotate(dials[0], 3);
    await sim.sleep(600);
    await sim.snapshot(out, "2-louder");
    sim.dialPress(dials[0]);
    await sim.sleep(600);
    await sim.snapshot(out, "3-muted");
    sim.dialPress(dials[0]);
    await sim.sleep(300);

    await sim.waitFor(() => simSac()?.state.streams?.length, 10000, "SA-C on the bus");
    const sac = simSac();
    check("SA-C offers the system output", sac.state.streams[0]?.topic === "meters/system-output" && sac.state.status?.online, JSON.stringify(sac.state));
    check("SA-C shares its four visible dials", sac.state.actions?.length === 4 && sac.state.actions.every((a, i) => a.column === i && a.controller === "Encoder"), JSON.stringify(sac.state.actions?.[0]));
    let n = 0;
    let last;
    const off = peer.subscribe("meters/system-output", (data, from) => {
        if (from.slot !== sac.slot) return;
        n++;
        last = data;
    });
    await sim.sleep(2000);
    check("the level streams to a subscriber", n > 20 && typeof last?.l === "number" && typeof last?.r === "number", `${n} values in 2 s, last ${JSON.stringify(last)}`);
    off();

    // Apps, mic and devices: dials for Spotify, Firefox and an app that isn't running; keys below
    for (const d of dials) sim.remove(d);
    sim.add("output-dial", {}, { column: 0, controller: "Encoder" });
    const spotify = sim.add("app-dial", { app: "spotify", appName: "Spotify" }, { column: 1, controller: "Encoder" });
    sim.add("app-dial", { app: "firefox", appName: "Firefox", style: "ring" }, { column: 2, controller: "Encoder" });
    sim.add("app-dial", { app: "discord", appName: "Discord", style: "pie" }, { column: 3, controller: "Encoder" });
    const mic = sim.add("mic-key", {}, { column: 0, row: 0, controller: "Keypad" });
    const toggle = sim.add("device-key", { device: "{sim-speakers}", deviceName: "Speakers (Sim Audio)", device2: "{sim-headphones}", device2Name: "Headphones (Sim USB)" }, { column: 1, row: 0, controller: "Keypad" });
    sim.add("device-key", { device: "{sim-headphones}", deviceName: "Headphones (Sim USB)" }, { column: 2, row: 0, controller: "Keypad" });
    sim.add("mic-key", {}, { column: 3, row: 0, controller: "Keypad" });
    await sim.sleep(1500);
    await sim.snapshot(out, "4-apps-mic-devices");
    const topics = simSac().state.streams.map((s) => s.topic);
    check("apps and the mic are offered as streams", ["meters/system-input", "meters/app-spotify", "meters/app-firefox"].every((t) => topics.includes(t)), topics.join(", "));
    const micStream = simSac().state.streams.find((s) => s.topic === "meters/system-input");
    check("the mic is marked as an input, the output is not", micStream?.input === true && !simSac().state.streams.find((s) => s.topic === "meters/system-output")?.input, JSON.stringify(micStream));

    sim.rotate(spotify, -10);
    sim.press(mic);
    sim.press(toggle);
    await sim.waitFor(() => simSac()?.state.mic?.muted === true && /Headphones/.test(simSac()?.state.status?.detail ?? ""), 5000, "mic muted, headphones default");
    check("the Mic key mutes the mic (shared on the bus)", simSac().state.mic.muted === true);
    check("the Device key switches to the headphones", /Headphones/.test(simSac().state.status.detail), simSac().state.status.detail);
    await sim.sleep(600);
    await sim.snapshot(out, "5-switched");
    sim.press(toggle);
    sim.press(mic);
    await sim.waitFor(() => simSac()?.state.mic?.muted === false && /Speakers/.test(simSac()?.state.status?.detail ?? ""), 5000, "back");
    check("pressed again: speakers and mic back", true);
} finally {
    await sim.stop();
    peer.stop();
}
const failed = results.filter((r) => !r).length;
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
