// The computer's default output: device, volume and mute (from the helper, changed optimistically
// from the dial), and its level while anyone wants it (a visible dial, a peer on deckbus).
import streamDeck from "@elgato/streamdeck";
import { LatestSender } from "@rocklobster42195/streamdeck-kit";
import { AudioHelper, type HelperMessage } from "./helper";

export type AudioState = "unsupported" | "starting" | "ready" | "failed";
export type Meter = { l: number; r: number };

/** After an own change, the helper's echoes of older values are ignored for this long. */
const HOLD_MS = 400;

class SystemAudio {
    state: AudioState = process.platform === "win32" || process.env.SAC_HELPER ? "starting" : "unsupported";
    device: { id: string; name: string } | undefined;
    volume = 0;
    muted = false;
    /** The latest level in dBFS (left, right), undefined while not metering. */
    meter: Meter | undefined;

    private helper: AudioHelper | undefined;
    private readonly listeners = new Set<() => void>();
    private readonly meterListeners = new Set<(m: Meter) => void>();
    private readonly meterOwners = new Set<string>();
    private heldUntil = 0;
    private readonly volumeSender = new LatestSender<number>(async (v) => this.helper?.send({ cmd: "volume", v }), 40);

    start(): void {
        if (this.state === "unsupported" || this.helper) return;
        this.helper = new AudioHelper(
            (msg) => this.receive(msg),
            () => {
                this.state = "failed";
                this.meter = undefined;
                this.notify();
            },
            { info: (m) => streamDeck.logger.info(m), warn: (m) => streamDeck.logger.warn(m) },
        );
        this.helper.start();
    }

    stop(): void {
        this.helper?.stop();
    }

    get ready(): boolean {
        return this.state === "ready" && !!this.device?.id;
    }

    onChange(fn: () => void): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    onMeter(fn: (m: Meter) => void): () => void {
        this.meterListeners.add(fn);
        return () => this.meterListeners.delete(fn);
    }

    /** `owner` (a dial, "bus") wants the level or not; the helper meters while anyone does. */
    wantMeters(owner: string, on: boolean): void {
        const before = this.meterOwners.size > 0;
        if (on) this.meterOwners.add(owner);
        else this.meterOwners.delete(owner);
        const after = this.meterOwners.size > 0;
        if (before === after) return;
        if (!after) this.meter = undefined;
        this.helper?.send({ cmd: "meters", on: after });
    }

    setVolume(v: number): void {
        this.volume = Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;
        this.heldUntil = Date.now() + HOLD_MS;
        this.volumeSender.push(this.volume);
        this.notify();
    }

    setMuted(on: boolean): void {
        this.muted = on;
        this.heldUntil = Date.now() + HOLD_MS;
        this.helper?.send({ cmd: "mute", on });
        this.notify();
    }

    private receive(msg: HelperMessage): void {
        switch (msg.t) {
            case "ready":
                this.state = "ready";
                // A restarted helper starts without metering
                if (this.meterOwners.size) this.helper?.send({ cmd: "meters", on: true });
                break;
            case "device":
                this.device = msg.id ? { id: msg.id, name: msg.name } : undefined;
                break;
            case "volume":
                if (Date.now() < this.heldUntil) return;
                this.volume = msg.v;
                this.muted = msg.muted;
                break;
            case "meter":
                if (!this.meterOwners.size) return;
                this.meter = { l: msg.l, r: msg.r };
                for (const fn of this.meterListeners) fn(this.meter);
                return;
            case "error":
                streamDeck.logger.warn(`[helper] ${msg.message}`);
                return;
        }
        this.notify();
    }

    private notify(): void {
        for (const fn of this.listeners) fn();
    }
}

export const systemAudio = new SystemAudio();
