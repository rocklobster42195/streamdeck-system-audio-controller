// App dials and App Mute keys with their icons against the fake system audio: Spotify plays,
// Firefox closes after 4 s (SAC_FAKE_QUIT) and turns grey. Writes snapshots to <outDir>/apps/.
//   node tools/sd-sim/apps.mjs [outDir]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startSim } from "./sim.mjs";

process.env.SAC_HELPER = fileURLToPath(new URL("../fake-helper.mjs", import.meta.url));
process.env.SAC_FAKE_QUIT = "firefox";
const out = path.resolve(process.argv[2] ?? "sim-out", "apps");

const sim = await startSim({ language: "en" });
try {
    sim.add("app-dial", { app: "spotify", appName: "Spotify" }, { column: 0, controller: "Encoder" });
    sim.add("app-dial", { app: "firefox", appName: "Firefox" }, { column: 1, controller: "Encoder" });
    sim.add("app-dial", { app: "spotify", appName: "Spotify", style: "ring" }, { column: 2, controller: "Encoder" });
    sim.add("app-dial", { app: "firefox", appName: "Firefox", style: "pie" }, { column: 3, controller: "Encoder" });
    const spotifyKey = sim.add("app-key", { app: "spotify", appName: "Spotify" }, { column: 0, row: 0, controller: "Keypad" });
    sim.add("app-key", { app: "firefox", appName: "Firefox" }, { column: 1, row: 0, controller: "Keypad" });
    sim.add("app-key", { app: "discord", appName: "Discord" }, { column: 2, row: 0, controller: "Keypad" });
    sim.add("app-key", { app: "spotify", appName: "Spotify", showLevel: false }, { column: 3, row: 0, controller: "Keypad" });
    await sim.sleep(2500);
    await sim.snapshot(out, "1-playing");
    await sim.sleep(3000);
    await sim.snapshot(out, "2-firefox-closed");
    sim.press(spotifyKey);
    await sim.sleep(800);
    await sim.snapshot(out, "3-spotify-muted");
} finally {
    await sim.stop();
}
process.exit(0);
