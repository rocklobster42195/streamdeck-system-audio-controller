// Output dials in all four looks against a fake system audio (tools/fake-helper.mjs), plus
// deckbus: a peer subscribes to the level. Writes deck snapshots to <outDir>/output/. Doesn't
// touch the real volume.
//   node tools/sd-sim/output.mjs [outDir]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DeckBus } from "@rocklobster42195/streamdeck-kit/bus";
import { startSim } from "./sim.mjs";

process.env.SAC_HELPER = fileURLToPath(new URL("../fake-helper.mjs", import.meta.url));
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
} finally {
    await sim.stop();
    peer.stop();
}
const failed = results.filter((r) => !r).length;
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
