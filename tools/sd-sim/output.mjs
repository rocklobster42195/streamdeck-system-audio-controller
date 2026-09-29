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

const sim = await startSim({ language: "en" });
const peer = new DeckBus({ id: "sim-listener", name: "Listener", version: "1", scanMs: 500 });
await peer.start();
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

    await sim.waitFor(() => peer.peers().some((p) => p.name === "SA-C" && p.state.streams?.length), 10000, "SA-C on the bus");
    const sac = peer.peers().find((p) => p.name === "SA-C");
    check("SA-C offers the system output", sac.state.streams[0]?.topic === "meters/system-output" && sac.state.status?.online, JSON.stringify(sac.state));
    let n = 0;
    let last;
    const off = peer.subscribe("meters/system-output", (data) => {
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
