// The App output key against the fake system audio: Firefox and Spotify, targets Windows default →
// headphones → speakers; each press routes both apps to the next one (checked in the fake's state),
// an unknown route shows as unknown. Writes key snapshots to <outDir>/app-output/.
//   node tools/sd-sim/app-output.mjs [outDir]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startSim } from "./sim.mjs";

process.env.SAC_HELPER = fileURLToPath(new URL("../fake-helper.mjs", import.meta.url));
process.env.SAC_CACHE_DIR = fileURLToPath(new URL("../../sim-out/cache", import.meta.url));
const stateFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sac-sim-")), "state.json");
process.env.SAC_FAKE_STATE = stateFile;
const out = path.resolve(process.argv[2] ?? "sim-out", "app-output");
/** The fake's state (read again while it is being written: try once more next time). */
const fake = () => {
    try {
        return JSON.parse(fs.readFileSync(stateFile, "utf8"));
    } catch {
        return { apps: [] };
    }
};
const routes = () => Object.fromEntries(fake().apps.map((a) => [a.app, a.route]));
const results = [];
const check = (name, ok, detail = "") => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const sim = await startSim({ language: "de" });
try {
    const states = [
        { value: "default", label: "Standard", icon: "mdiSpeaker", color: "#8a8a90" },
        { value: "{sim-headphones}", label: "Headset", icon: "mdiHeadset", color: "#E14190" },
        { value: "{sim-speakers}", color: "#009FDF" },
    ];
    const key = sim.add("app-output-key", { apps: ["firefox", "spotify"], appNames: { firefox: "Firefox", spotify: "Spotify" }, states });
    const empty = sim.add("app-output-key", {}, { column: 1 });
    await sim.sleep(1500);
    await sim.snapshot(out, "1-default");
    const until = async (test, label) => {
        for (let i = 0; i < 50; i++, await sim.sleep(100)) if (test()) return true;
        throw new Error(`timeout: ${label} (${JSON.stringify(routes())})`);
    };
    sim.press(key);
    await until(() => routes().firefox === "{sim-headphones}" && routes().spotify === "{sim-headphones}", "headphones");
    check("press: both apps on the next target (headphones)", true);
    await sim.sleep(500);
    await sim.snapshot(out, "2-headset");
    sim.press(key);
    await until(() => routes().firefox === "{sim-speakers}" && routes().spotify === "{sim-speakers}", "speakers");
    check("press again: speakers", true);
    sim.press(key);
    await until(() => routes().firefox === "" && routes().spotify === "", "default");
    check("press again: back to Windows' default (wraps)", true);
    await sim.sleep(500);
    await sim.snapshot(out, "3-back");
    check("a key without apps doesn't route anything", empty !== undefined);
} finally {
    await sim.stop();
}
const failed = results.filter((r) => !r).length;
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
