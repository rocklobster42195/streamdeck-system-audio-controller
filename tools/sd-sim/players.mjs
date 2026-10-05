// Windows' media sessions as deckbus players: the plugin publishes them ("players"), serves their
// covers on 127.0.0.1, and carries out "transport" requests from another plugin. Against the fake
// system audio (tools/fake-helper.mjs) by default; --real reads the real media sessions instead and
// sends no commands (nothing plays, pauses or changes volume). --real --control also controls the
// real Spotify (pause, play, next, previous, seek, its app volume, put back afterwards); the device
// volume is never touched.
//   node tools/sd-sim/players.mjs [--real [--control]]
import { fileURLToPath } from "node:url";
import { DeckBus } from "@rocklobster42195/streamdeck-kit/bus";
import { startSim } from "./sim.mjs";

const real = process.argv.includes("--real");
const control = real && process.argv.includes("--control");
if (!real) process.env.SAC_HELPER = fileURLToPath(new URL("../fake-helper.mjs", import.meta.url));
process.env.SAC_CACHE_DIR = fileURLToPath(new URL("../../sim-out/cache", import.meta.url));
const results = [];
const check = (name, ok, detail = "") => {
    results.push(ok);
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const peer = new DeckBus({ id: "sim-player-keys", name: "Keys", version: "1", scanMs: 500 });
await peer.start();
// Plugins already on the bus (e.g. SA-C in the real Stream Deck, same id and name) aren't the one under test
await new Promise((r) => setTimeout(r, 1200));
const before = new Set(peer.peers().map((p) => p.slot));
const simSac = () => peer.peers().find((p) => p.name === "SA-C" && !before.has(p.slot));
const players = () => simSac()?.state.players ?? [];
const sim = await startSim({ language: "en" });
/** Polls (bus state changes don't wake sim.waitFor). */
const until = async (check, ms, label) => {
    for (const end = Date.now() + ms; Date.now() < end; await sim.sleep(100)) if (check()) return;
    throw new Error(`timeout waiting for ${label} (players: ${JSON.stringify(players())})`);
};
const transport = (player, command, value) => peer.request(simSac(), "transport", { player, command, ...(value !== undefined ? { value } : {}) }, 10_000);
try {
    await until(() => players().length > 0 && players().some((p) => p.cover), 15_000, "players with a cover");
    for (const p of players()) console.log(`      ${p.playing ? "▶" : "Ⅱ"} ${p.name} (${p.app}): ${p.title ?? "–"}${p.artist ? ` · ${p.artist}` : ""}  vol ${p.volume ?? "–"}  can ${p.can.join(",")}`);
    const first = players().find((p) => p.cover);
    check("players are apps, direct, with media", players().every((p) => p.kind === "app" && p.direct && p.media));
    const res = await fetch(first.cover);
    const bytes = (await res.arrayBuffer()).byteLength;
    check("the cover loads from 127.0.0.1", res.ok && /^http:\/\/127\.0\.0\.1:\d+\/cover\//.test(first.cover) && res.headers.get("content-type")?.startsWith("image/") && bytes > 100, `${first.cover}, ${bytes} bytes`);
    check("the cover gives a colour", /^#[0-9a-f]{6}$/i.test(first.color ?? ""), first.color);
    check("an unknown cover is not found", (await fetch(first.cover.replace(/\/cover\/.*/, "/cover/ffff"))).status === 404);

    if (control) {
        const find = () => players().find((p) => p.app === "spotify");
        const start = find();
        if (!start) throw new Error("Spotify isn't playing anything");
        const { player } = start;
        const step = async (label, command, value, done) => {
            const t0 = Date.now();
            await transport(player, command, value);
            await until(() => done(find()), 8000, label);
            check(label, true, `${Date.now() - t0} ms`);
        };
        if (!start.playing) await step("play (to start from playing)", "play", undefined, (p) => p?.playing);
        await step("pause", "pause", undefined, (p) => p?.playing === false);
        await step("play", "play", undefined, (p) => p?.playing === true);
        await step("play-pause pauses", "play-pause", undefined, (p) => p?.playing === false);
        await step("play-pause plays", "play-pause", undefined, (p) => p?.playing === true);
        const title = find().title;
        await step("next: another title", "next", undefined, (p) => p?.title && p.title !== title);
        const nextCover = find().cover;
        check("the new track brings its own cover", !!nextCover, nextCover);
        await step("seek to 1:00", "seek", 60, (p) => p?.position !== undefined && Math.abs(p.position - 60) < 3);
        await step("previous: back to the start of the track", "previous", undefined, (p) => p?.position !== undefined && p.position < 5);
        await step("previous again: the first title", "previous", undefined, (p) => p?.title === title);
        if (start.volume !== undefined) {
            await step("the app's volume to 40", "volume", 40, (p) => p?.volume === 40);
            await step("the app's volume back", "volume", start.volume, (p) => p?.volume === start.volume);
        }
        check("still playing at the end", find()?.playing === true);
    }

    if (!real) {
        const spotify = players().find((p) => p.app === "spotify");
        const tab = players().find((p) => p.app === "firefox");
        check("the sessions find their apps (volume from the mixer)", spotify?.volume === 100 && tab?.volume === 60 && tab?.name === "Firefox", `${spotify?.volume}, ${tab?.volume}, ${tab?.name}`);
        check("position and length are there", spotify?.duration === 200 && typeof spotify.position === "number" && typeof spotify.at === "number");

        await transport(spotify.player, "next");
        await until(() => players().find((p) => p.app === "spotify")?.title === "Sim Song Two", 5000, "next track");
        const two = players().find((p) => p.app === "spotify");
        check("next over deckbus: new title, new cover and colour", two.cover !== spotify.cover && two.color !== spotify.color, `${spotify.color} → ${two.color}`);

        await transport(spotify.player, "play-pause");
        await until(() => players().find((p) => p.app === "spotify")?.playing === false, 5000, "paused");
        check("play-pause over deckbus pauses, the start time stays", players().find((p) => p.app === "spotify").since === spotify.since);

        await transport(spotify.player, "seek", 90);
        await until(() => players().find((p) => p.app === "spotify")?.position === 90, 5000, "seek");
        check("seek over deckbus", true);

        await transport(spotify.player, "volume", 35);
        await until(() => players().find((p) => p.app === "spotify")?.volume === 35, 5000, "volume");
        check("volume over deckbus sets the app's volume", true);

        let refused = "";
        await transport(tab.player, "next").catch((e) => (refused = e instanceof Error ? e.message : String(e)));
        check("a command the session doesn't take is refused", /refused next/.test(refused), refused);

        await sim.setGlobalSettings({ othersMayControlPlayers: false });
        await sim.sleep(300);
        let blocked = "";
        await transport(spotify.player, "play-pause").catch((e) => (blocked = e instanceof Error ? e.message : String(e)));
        check("switched off: other plugins may not control the players", /not allowed/.test(blocked), blocked);
    }
} finally {
    await sim.stop();
    peer.stop();
}
const failed = results.filter((r) => !r).length;
console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
