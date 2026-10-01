// Ducking for other plugins (deckbus "duck"/"unduck", the kit's DuckLeases): lowers the output
// device or one app by some dB for a while and puts the exact volume back afterwards.
// - The output device is set in dB (a real -12 dB, whatever the device's volume curve); an app's
//   volume is a linear factor, so -12 dB there is ×0.25.
// - The user wins: setting the volume by hand (on the deck or in Windows) ends the duck there, and
//   SA-C leaves the volume as the user set it. The same when the device changes or the app closes.
import { DuckLeases, type DuckChange } from "@rocklobster42195/streamdeck-kit/bus";
import type { AppInfo, Endpoint } from "./system-audio";

/** What ducking needs of the system audio (systemAudio; a stand-in in tests). */
export type DuckAudio = {
    readonly endpoints: { out: Endpoint };
    app(key: string): AppInfo | undefined;
    duckDb(flow: "out", db: number): void;
    duckVolume(flow: "out", v: number): void;
    duckAppVolume(key: string, v: number): void;
};

/** "out" or "app:<key>", the same keys as the meter sources. */
export type DuckTarget = "out" | `app:${string}`;

type Base = {
    topic: string;
    target: DuckTarget;
    /** The volume before the duck (restored exactly), the device's dB level then, and the device. */
    v: number;
    db: number;
    device: string;
    /** The gain SA-C applies now (dB). */
    gain: number;
    ramp?: ReturnType<typeof setInterval>;
    /** Until then the helper may still report older values (no "changed by hand" check). */
    settleUntil: number;
};

const STEP_MS = 50;
/** The helper reports a device's volume within ~50 ms, the apps every 500 ms. */
const SETTLE_MS = { out: 400, app: 1200 };
/** A level that differs this much from what SA-C set was changed by someone else. */
const OUT_TOLERANCE_DB = 1.5;
const APP_TOLERANCE = 0.03;

export class Ducker {
    readonly leases: DuckLeases;
    private readonly bases = new Map<DuckTarget, Base>();

    constructor(
        private readonly audio: DuckAudio,
        /** Bus topic → own target, undefined when it is nothing SA-C can lower. */
        private readonly resolve: (topic: string) => DuckTarget | undefined,
        private readonly log: (message: string) => void = () => {},
        private readonly now: () => number = Date.now,
    ) {
        this.leases = new DuckLeases((c) => this.apply(c));
    }

    /** Whether a bus target can be ducked right now. */
    has(topic: string): boolean {
        const target = this.resolve(topic);
        if (!target) return false;
        return target === "out" ? !!this.audio.endpoints.out.device && this.audio.endpoints.out.db !== undefined : !!this.audio.app(target.slice(4));
    }

    /** The current gain of a target in dB (0 = not ducked). */
    gain(target: DuckTarget): number {
        return this.bases.get(target)?.gain ?? 0;
    }

    /** The user set a volume on the deck: ducks of that target end without a restore. */
    userChanged(target: string): void {
        const base = this.bases.get(target as DuckTarget);
        if (base) this.drop(base, "set by hand");
    }

    /** After every system audio change: notice a new device, a closed app or a volume set elsewhere. */
    check(): void {
        for (const base of [...this.bases.values()]) {
            if (base.ramp || this.now() < base.settleUntil) continue;
            if (base.target === "out") {
                const e = this.audio.endpoints.out;
                if (e.device?.id !== base.device) this.drop(base, "device changed");
                else if (e.db !== undefined && Math.abs(e.db - (base.db + base.gain)) > OUT_TOLERANCE_DB) this.drop(base, "changed in Windows");
            } else {
                const app = this.audio.app(base.target.slice(4));
                if (!app) this.drop(base, "app closed");
                else if (Math.abs(app.v - appVolume(base.v, base.gain)) > APP_TOLERANCE) this.drop(base, "changed in Windows");
            }
        }
    }

    /** End a duck without restoring: the volume stays as it is now. */
    private drop(base: Base, why: string): void {
        this.log(`[duck] ${base.topic} ended: ${why}`);
        clearInterval(base.ramp);
        this.bases.delete(base.target);
        this.leases.release(base.topic);
    }

    private apply({ target: topic, db, rampMs }: DuckChange): void {
        const target = this.resolve(topic);
        if (!target) return;
        let base = this.bases.get(target);
        if (!base) {
            if (db === 0) return;
            base = this.capture(topic, target);
            if (!base) return;
            this.bases.set(target, base);
        }
        this.log(`[duck] ${topic} → ${db} dB`);
        this.rampTo(base, db, rampMs);
    }

    private capture(topic: string, target: DuckTarget): Base | undefined {
        if (target === "out") {
            const e = this.audio.endpoints.out;
            return e.device && e.db !== undefined ? { topic, target, v: e.volume, db: e.db, device: e.device.id, gain: 0, settleUntil: 0 } : undefined;
        }
        const app = this.audio.app(target.slice(4));
        return app ? { topic, target, v: app.v, db: 0, device: "", gain: 0, settleUntil: 0 } : undefined;
    }

    private rampTo(base: Base, to: number, rampMs: number): void {
        clearInterval(base.ramp);
        base.ramp = undefined;
        const from = base.gain;
        const steps = Math.max(1, Math.round(rampMs / STEP_MS));
        let step = 0;
        const tick = () => {
            step++;
            this.set(base, step >= steps ? to : from + ((to - from) * step) / steps);
            if (step < steps) return;
            clearInterval(base.ramp);
            base.ramp = undefined;
            if (to === 0) this.restore(base);
        };
        if (steps > 1) base.ramp = setInterval(tick, STEP_MS);
        tick();
    }

    private set(base: Base, gain: number): void {
        base.gain = gain;
        base.settleUntil = this.now() + (base.target === "out" ? SETTLE_MS.out : SETTLE_MS.app);
        if (base.target === "out") this.audio.duckDb("out", base.db + gain);
        else this.audio.duckAppVolume(base.target.slice(4), appVolume(base.v, gain));
    }

    /** Back to the exact volume from before (a dB round trip may be off by a hair). */
    private restore(base: Base): void {
        if (base.target === "out") this.audio.duckVolume("out", base.v);
        else this.audio.duckAppVolume(base.target.slice(4), base.v);
        this.bases.delete(base.target);
    }
}

const appVolume = (v: number, db: number) => v * 10 ** (db / 20);
