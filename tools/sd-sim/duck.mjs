// Ducking over deckbus against the fake system audio: a stand-in plugin asks SA-C to lower the
// output and Spotify. Not allowed by default; allowed in the global settings, it works and the
// exact volume comes back (on unduck, when the plugin leaves, when the permission is taken back);
// a volume set by hand during a duck stays. Snapshots to <outDir>/duck/. Never touches the real
// system audio.
//   node tools/sd-sim/duck.mjs [outDir]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DeckBus } from "@rocklobster42195/streamdeck-kit/bus";
import { startSim } from "./sim.mjs";

process.env.SAC_HELPER = fileURLToPath(new URL("../fake-helper.mjs", import.meta.url));
process.env.SAC_CACHE_DIR = fileURLToPath(new URL("../../sim-out/cache", import.meta.url));
process.env.SAC_FAKE_STATE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sac-duck-")), "state.json");
const out = path.resolve(process.argv[2] ?? "sim-out", "duck");
const results = [];
const check = (name, ok, detail = "") => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};
const fake = () => JSON.parse(fs.readFileSync(process.env.SAC_FAKE_STATE, "utf8"));
const outV = () => fake().out.v;
const spotifyV = () => fake().apps.find((a) => a.app === "spotify")?.v;
const error = (p) => p.then(() => "ok", (e) => e.message);

const ID = "sim-announcer";
const SYSTEM = "meters/system-output";
let announcer = new DeckBus({ id: ID, name: "Announcer", version: "1", scanMs: 300 });
await announcer.start();
// SA-C in the real Stream Deck (same id) isn't the one under test
await new Promise((r) => setTimeout(r, 1200));
const before = new Set(announcer.peers().map((p) => p.slot));
const sim = await startSim({ language: "en" });
const simSac = () => announcer.peers().find((p) => p.name === "SA-C" && !before.has(p.slot));
const duck = (params) => announcer.request(simSac(), "duck", { rampMs: 200, maxMs: 30_000, ...params });
const unduck = (target) => announcer.request(simSac(), "unduck", { target });
try {
    const dial = sim.add("output-dial", {}, { column: 0, controller: "Encoder" });
    sim.add("app-dial", { app: "spotify", appName: "Spotify" }, { column: 1, controller: "Encoder" });
    await sim.waitFor(() => !!simSac(), 10_000, "SA-C on the bus");
    await sim.sleep(800);
    const start = outV();

    // The settings panel lists the plugin, not allowed
    let rows = [];
    sim.onPiMessage((msg) => msg?.event === "duck-peers" && (rows = msg.peers));
    sim.piOpen(dial);
    sim.piSend(dial, { event: "pi-ready" });
    await sim.waitFor(() => rows.some((r) => r.id === ID), 5000, "duck-peers in the PI");
    check("the settings panel lists the other plugin, switched off", rows.find((r) => r.id === ID)?.allowed === false, JSON.stringify(rows));

    check("not allowed by default", (await error(duck({ target: SYSTEM, by: -12 }))) === "not allowed");
    check("the volume is untouched", outV() === start, `${outV()}`);

    sim.setGlobalSettings({ duckPeers: { [ID]: "Announcer" } });
    await sim.sleep(200);
    check("allowed: the duck is accepted", JSON.stringify(await duck({ target: SYSTEM, by: -12 })) === '{"db":-12}');
    await sim.sleep(600);
    await sim.snapshot(out, "1-ducked");
    check("the output is lower (−12 dB on a 50 % ≈ −10 dB curve)", outV() < start * 0.5, `${start} → ${outV()}`);
    await unduck(SYSTEM);
    await sim.sleep(600);
    await sim.snapshot(out, "2-back");
    check("unduck: exactly the volume from before", outV() === start, `${outV()}`);

    const spotify = spotifyV();
    await duck({ target: "meters/app-spotify", by: -12, rampMs: 0 });
    await sim.sleep(300);
    check("an app is lowered by a factor (−12 dB ≈ ×0.25)", Math.abs(spotifyV() - spotify * 0.251) < 0.01, `${spotify} → ${spotifyV()}`);
    await unduck("meters/app-spotify");
    await sim.sleep(600);
    check("and comes back exactly", spotifyV() === spotify, `${spotifyV()}`);

    check("the mic can't be ducked", /unknown target/.test(await error(duck({ target: "meters/system-input", by: -12 }))));

    // The user wins
    await duck({ target: SYSTEM, by: -12, rampMs: 0 });
    await sim.sleep(500);
    sim.rotate(dial, 3);
    await sim.sleep(500);
    const byHand = outV();
    await unduck(SYSTEM);
    await sim.sleep(600);
    check("set by hand during a duck: the user's volume stays", outV() === byHand && byHand !== start, `${byHand} → ${outV()}`);
    sim.rotate(dial, -3);
    await sim.sleep(600);
    const start2 = outV();

    // Permission taken back while ducked
    await duck({ target: SYSTEM, by: -20, rampMs: 0 });
    await sim.sleep(500);
    sim.setGlobalSettings({});
    await sim.sleep(800);
    check("permission taken back: the volume comes back", outV() === start2, `${start2} → ${outV()}`);

    // The plugin leaves the bus while ducked
    sim.setGlobalSettings({ duckPeers: { [ID]: "Announcer" } });
    await sim.sleep(200);
    await duck({ target: SYSTEM, by: -20, rampMs: 0 });
    await sim.sleep(500);
    announcer.stop();
    await sim.sleep(1500);
    check("the plugin left the bus: the volume comes back", outV() === start2, `${start2} → ${outV()}`);
} finally {
    await sim.stop();
    announcer.stop();
}
const failed = results.filter((r) => !r).length;
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
