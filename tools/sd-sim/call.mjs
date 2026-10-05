// Calls on deckbus: state "call" (active, app, since) starts with Windows' ducking notification
// and ends a moment after it; state "mic" lists the apps using the mic. Against the fake system
// audio (a Teams call from 2 s to 6 s); --real waits up to 10 minutes for a real call instead
// (start and end one, e.g. a Teams test call) and only watches.
//   node tools/sd-sim/call.mjs [--real]
import { fileURLToPath } from "node:url";
import { DeckBus } from "@rocklobster42195/streamdeck-kit/bus";
import { startSim } from "./sim.mjs";

const real = process.argv.includes("--real");
if (!real) {
    process.env.SAC_HELPER = fileURLToPath(new URL("../fake-helper.mjs", import.meta.url));
    process.env.SAC_FAKE_CALL = "2000,6000";
}
process.env.SAC_CACHE_DIR = fileURLToPath(new URL("../../sim-out/cache", import.meta.url));
const results = [];
const check = (name, ok, detail = "") => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const peer = new DeckBus({ id: "sim-call-listener", name: "Listener", version: "1", scanMs: 500 });
await peer.start();
await new Promise((r) => setTimeout(r, 1200));
const before = new Set(peer.peers().map((p) => p.slot));
const simSac = () => peer.peers().find((p) => p.name === "SA-C" && !before.has(p.slot));
const sim = await startSim({ language: "en" });
const until = async (test, ms, label) => {
    for (const end = Date.now() + ms; Date.now() < end; await sim.sleep(50)) if (test()) return;
    throw new Error(`timeout waiting for ${label} (call: ${JSON.stringify(simSac()?.state.call)}, mic: ${JSON.stringify(simSac()?.state.mic)})`);
};
try {
    await until(() => simSac()?.state.call?.active === false, 15_000, "no call at the start");
    check("no call at the start", true);
    if (real) console.log("      now start a call (e.g. Teams: Settings → Devices → Make a test call) …");
    await until(() => simSac()?.state.call?.active === true, real ? 600_000 : 10_000, "a call");
    const started = Date.now();
    const call = simSac().state.call;
    check("the call starts, with its app", typeof call.since === "number" && !!call.app, `${call.name} (${call.app})`);
    await until(() => simSac()?.state.mic?.users?.some((u) => u.app === call.app), real ? 30_000 : 5000, "the call app on the mic");
    check("the call app shows as using the mic", true, `after ${Date.now() - started} ms`);
    await until(() => simSac()?.state.call?.active === false, real ? 600_000 : 10_000, "the call's end");
    check("the call ends", true, `${Math.round((Date.now() - started) / 100) / 10} s after its start`);
    check("nobody on the mic after the call", !(simSac().state.mic?.users ?? []).some((u) => u.app === call.app));
} finally {
    await sim.stop();
    peer.stop();
}
const failed = results.filter((r) => !r).length;
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
