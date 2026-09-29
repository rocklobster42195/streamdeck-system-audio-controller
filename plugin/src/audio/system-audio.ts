// The computer's audio as the helper reports it: the default output and input (device, volume,
// mute), the output devices, and the apps playing sound. Changes from the deck are applied
// optimistically. Levels are measured only while anyone wants them (a visible dial or key, a peer
// on deckbus), per source: "out", "in" or "app:<key>".
import streamDeck from "@elgato/streamdeck";
import { LatestSender } from "@rocklobster42195/streamdeck-kit";
import { AudioHelper, type AppInfo, type Flow, type HelperMessage, type OutputDevice } from "./helper";

export type { AppInfo, Flow, OutputDevice };
export type AudioState = "unsupported" | "starting" | "ready" | "failed";
export type Meter = { l: number; r: number };
export type MeterSource = Flow | `app:${string}`;
export type Endpoint = { device: { id: string; name: string } | undefined; volume: number; muted: boolean };

/** After an own change, the helper's echoes of older values are ignored for this long. */
const HOLD_MS = 400;

class SystemAudio {
    state: AudioState = process.platform === "win32" || process.env.SAC_HELPER ? "starting" : "unsupported";
    readonly endpoints: Record<Flow, Endpoint> = { out: { device: undefined, volume: 0, muted: false }, in: { device: undefined, volume: 0, muted: false } };
    devices: OutputDevice[] = [];
    apps: AppInfo[] = [];

    private helper: AudioHelper | undefined;
    private readonly listeners = new Set<() => void>();
    private readonly meterListeners = new Set<(source: MeterSource, m: Meter) => void>();
    /** Per source: who wants its level, and the latest one. */
    private readonly owners = new Map<MeterSource, Set<string>>();
    private readonly meters = new Map<MeterSource, Meter>();
    /** Per target ("out", "in", "app:<key>"): until when helper echoes are ignored. */
    private readonly held = new Map<string, number>();
    private readonly senders = new Map<string, LatestSender<number>>();

    start(): void {
        if (this.state === "unsupported" || this.helper) return;
        this.helper = new AudioHelper(
            (msg) => this.receive(msg),
            () => {
                this.state = "failed";
                this.meters.clear();
                this.notify();
            },
            { info: (m) => streamDeck.logger.info(m), warn: (m) => streamDeck.logger.warn(m) },
        );
        this.helper.start();
    }

    stop(): void {
        this.helper?.stop();
    }

    /** The helper runs and the direction has a device. */
    ready(flow: Flow = "out"): boolean {
        return this.state === "ready" && !!this.endpoints[flow].device?.id;
    }

    app(key: string | undefined): AppInfo | undefined {
        return key ? this.apps.find((a) => a.app === key) : undefined;
    }

    onChange(fn: () => void): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    onMeter(fn: (source: MeterSource, m: Meter) => void): () => void {
        this.meterListeners.add(fn);
        return () => this.meterListeners.delete(fn);
    }

    meter(source: MeterSource): Meter | undefined {
        return this.meters.get(source);
    }

    /** `owner` (a dial, a key, "bus") wants the level of `source` or not; measured while anyone does. */
    wantMeters(source: MeterSource, owner: string, on: boolean): void {
        const set = this.owners.get(source) ?? new Set<string>();
        const before = set.size > 0;
        if (on) set.add(owner);
        else set.delete(owner);
        this.owners.set(source, set);
        if (before === set.size > 0) return;
        if (!set.size) this.meters.delete(source);
        if (source === "out" || source === "in") this.helper?.send({ cmd: "meters", flow: source, on: set.size > 0 });
        else this.sendAppMeters();
    }

    setVolume(flow: Flow, v: number): void {
        const e = this.endpoints[flow];
        e.volume = clamp(v);
        this.hold(flow);
        this.sender(flow, (value) => this.helper?.send({ cmd: "volume", flow, v: value })).push(e.volume);
        this.notify();
    }

    setMuted(flow: Flow, on: boolean): void {
        this.endpoints[flow].muted = on;
        this.hold(flow);
        this.helper?.send({ cmd: "mute", flow, on });
        this.notify();
    }

    setAppVolume(key: string, v: number): void {
        const app = this.app(key);
        if (!app) return;
        app.v = clamp(v);
        this.hold(`app:${key}`);
        this.sender(`app:${key}`, (value) => this.helper?.send({ cmd: "appvolume", app: key, v: value })).push(app.v);
        this.notify();
    }

    setAppMuted(key: string, on: boolean): void {
        const app = this.app(key);
        if (!app) return;
        app.muted = on;
        this.hold(`app:${key}`);
        this.helper?.send({ cmd: "appmute", app: key, on });
        this.notify();
    }

    /** Make `id` the default output device (for all uses: console, multimedia, communications). */
    setDefault(id: string): void {
        const device = this.devices.find((d) => d.id === id);
        if (!device) return;
        this.devices = this.devices.map((d) => ({ ...d, default: d.id === id }));
        this.endpoints.out.device = { id, name: device.name };
        this.hold("out");
        this.helper?.send({ cmd: "default", id });
        this.notify();
    }

    private hold(target: string): void {
        this.held.set(target, Date.now() + HOLD_MS);
    }

    private isHeld(target: string): boolean {
        return Date.now() < (this.held.get(target) ?? 0);
    }

    private sender(target: string, send: (v: number) => void): LatestSender<number> {
        let s = this.senders.get(target);
        if (!s) this.senders.set(target, (s = new LatestSender<number>(async (v) => send(v), 40)));
        return s;
    }

    private sendAppMeters(): void {
        const apps = [...this.owners].filter(([source, set]) => source.startsWith("app:") && set.size > 0).map(([source]) => source.slice(4));
        this.helper?.send({ cmd: "appmeters", apps: apps.join(",") });
    }

    private receive(msg: HelperMessage): void {
        switch (msg.t) {
            case "ready":
                this.state = "ready";
                // A restarted helper starts without metering
                for (const flow of ["out", "in"] as const) if (this.owners.get(flow)?.size) this.helper?.send({ cmd: "meters", flow, on: true });
                this.sendAppMeters();
                break;
            case "device":
                this.endpoints[msg.flow].device = msg.id ? { id: msg.id, name: msg.name } : undefined;
                break;
            case "volume":
                if (this.isHeld(msg.flow)) return;
                this.endpoints[msg.flow].volume = msg.v;
                this.endpoints[msg.flow].muted = msg.muted;
                break;
            case "devices":
                if (this.isHeld("out")) return;
                this.devices = msg.list;
                break;
            case "apps":
                // Keep the optimistic values of apps changed just now
                this.apps = msg.list.map((a) => (this.isHeld(`app:${a.app}`) ? { ...a, v: this.app(a.app)?.v ?? a.v, muted: this.app(a.app)?.muted ?? a.muted } : a));
                break;
            case "meter":
                this.meterIn(msg.flow, msg);
                return;
            case "appmeter":
                this.meterIn(`app:${msg.app}`, msg);
                return;
            case "error":
                streamDeck.logger.warn(`[helper] ${msg.message}`);
                return;
        }
        this.notify();
    }

    private meterIn(source: MeterSource, m: Meter): void {
        if (!this.owners.get(source)?.size) return;
        const meter = { l: m.l, r: m.r };
        this.meters.set(source, meter);
        for (const fn of this.meterListeners) fn(source, meter);
    }

    private notify(): void {
        for (const fn of this.listeners) fn();
    }
}

const clamp = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 100) / 100;

export const systemAudio = new SystemAudio();
