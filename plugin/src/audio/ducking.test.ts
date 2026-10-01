import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Ducker, type DuckAudio, type DuckTarget } from "./ducking";
import type { AppInfo, Endpoint } from "./system-audio";

/** A stand-in system audio that applies the ducker's commands at once (curve: 50 % ≈ -10 dB). */
function fakeAudio() {
    const curve = 33.22;
    const out: Endpoint = { device: { id: "spk", name: "Speakers" }, volume: 0.5, db: curve * Math.log10(0.5), muted: false };
    const apps: AppInfo[] = [{ app: "spotify", name: "Spotify", v: 0.8, muted: false, active: true }];
    const calls: string[] = [];
    const audio: DuckAudio = {
        endpoints: { out },
        app: (key) => apps.find((a) => a.app === key),
        duckDb: (_flow, db) => {
            calls.push(`db ${db.toFixed(1)}`);
            out.db = db;
            out.volume = 10 ** (db / curve);
        },
        duckVolume: (_flow, v) => {
            calls.push(`v ${v}`);
            out.volume = v;
            out.db = curve * Math.log10(v);
        },
        duckAppVolume: (key, v) => {
            calls.push(`${key} ${v.toFixed(3)}`);
            apps.find((a) => a.app === key)!.v = v;
        },
    };
    return { audio, out, apps, calls };
}

const resolve = (topic: string): DuckTarget | undefined =>
    topic === "meters/system-output" ? "out" : topic.startsWith("meters/app-") ? `app:${topic.slice(11)}` : undefined;

const duck = (by: number, target = "meters/system-output", rampMs = 200) => ({ target, by, rampMs, maxMs: 30_000 });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Ducker", () => {
    it("lowers the device by real dB in steps and restores the exact volume", () => {
        const { audio, out, calls } = fakeAudio();
        const d = new Ducker(audio, resolve);
        const before = out.db!;
        d.leases.duck("mac", duck(-12));
        vi.advanceTimersByTime(200);
        expect(out.db).toBeCloseTo(before - 12, 5);
        expect(calls.length).toBe(4);
        d.leases.unduck("mac", "meters/system-output");
        vi.advanceTimersByTime(200);
        expect(out.volume).toBe(0.5);
        expect(calls.at(-1)).toBe("v 0.5");
        expect(d.gain("out")).toBe(0);
    });

    it("lowers an app by a linear factor (-12 dB ≈ ×0.25)", () => {
        const { audio, apps } = fakeAudio();
        const d = new Ducker(audio, resolve);
        d.leases.duck("mac", duck(-12, "meters/app-spotify", 0));
        expect(apps[0].v).toBeCloseTo(0.8 * 0.251, 2);
        d.leases.unduck("mac", "meters/app-spotify");
        vi.advanceTimersByTime(300);
        expect(apps[0].v).toBe(0.8);
    });

    it("knows which targets it can lower", () => {
        const { audio, out } = fakeAudio();
        const d = new Ducker(audio, resolve);
        expect(d.has("meters/system-output")).toBe(true);
        expect(d.has("meters/app-spotify")).toBe(true);
        expect(d.has("meters/app-discord")).toBe(false);
        expect(d.has("meters/system-input")).toBe(false);
        out.db = undefined;
        expect(d.has("meters/system-output")).toBe(false);
    });

    it("the user wins: a volume set on the deck ends the duck and stays", () => {
        const { audio, out, calls } = fakeAudio();
        const d = new Ducker(audio, resolve);
        d.leases.duck("mac", duck(-12, undefined, 0));
        d.userChanged("out");
        out.volume = 0.3;
        const n = calls.length;
        d.leases.unduck("mac", "meters/system-output");
        vi.advanceTimersByTime(1000);
        expect(calls.length).toBe(n);
        expect(out.volume).toBe(0.3);
        expect(d.leases.depth("meters/system-output")).toBe(0);
    });

    it("a volume changed in Windows ends the duck, but only after the helper settled", () => {
        const { audio, out } = fakeAudio();
        const d = new Ducker(audio, resolve);
        d.leases.duck("mac", duck(-12, undefined, 0));
        out.db = -3;
        d.check();
        expect(d.gain("out")).toBe(-12);
        vi.advanceTimersByTime(500);
        d.check();
        expect(d.gain("out")).toBe(0);
        expect(d.leases.depth("meters/system-output")).toBe(0);
    });

    it("a new default device ends the duck without touching the new device", () => {
        const { audio, out, calls } = fakeAudio();
        const d = new Ducker(audio, resolve);
        d.leases.duck("mac", duck(-12, undefined, 0));
        out.device = { id: "headset", name: "Headset" };
        vi.advanceTimersByTime(500);
        d.check();
        const n = calls.length;
        d.leases.unduck("mac", "meters/system-output");
        expect(calls.length).toBe(n);
    });
});
