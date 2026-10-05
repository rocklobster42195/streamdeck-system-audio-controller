// The computer's audio as the helper reports it: the default output and input (device, volume,
// mute), the output devices, the apps playing sound, and Windows' media sessions (what plays in
// Spotify, a browser …, with their covers), and whether a call runs (calls.ts). Changes from the deck are applied
// optimistically. Levels are measured only while anyone wants them (a visible dial or key, a peer
// on deckbus), per source: "out", "in" or "app:<key>".
import streamDeck from "@elgato/streamdeck";
import { CoverServer, LatestSender } from "@rocklobster42195/streamdeck-kit";
import { saveAppIcon } from "./app-icons";
import { CallTracker, type AppRef } from "./calls";
import { AudioHelper, type AppInfo, type Flow, type HelperMessage, type MediaCommand, type MediaSession, type OutputDevice } from "./helper";

export type { AppInfo, Flow, MediaCommand, MediaSession, OutputDevice };
export type AudioState = "unsupported" | "starting" | "ready" | "failed";
export type Meter = { l: number; r: number };
export type MeterSource = Flow | `app:${string}`;
export type Endpoint = { device: { id: string; name: string } | undefined; volume: number; muted: boolean; /** The level in dB, if the device reports it. */ db?: number };

/** After an own change, the helper's echoes of older values are ignored for this long. */
const HOLD_MS = 400;
/** A media command without an answer from the helper by then has failed. */
const MEDIA_TIMEOUT_MS = 5000;

class SystemAudio {
    state: AudioState = process.platform === "win32" || process.env.SAC_HELPER ? "starting" : "unsupported";
    readonly endpoints: Record<Flow, Endpoint> = { out: { device: undefined, volume: 0, muted: false }, in: { device: undefined, volume: 0, muted: false } };
    devices: OutputDevice[] = [];
    apps: AppInfo[] = [];
    /** Apps Windows ducks for (a communications stream: a call), and apps using the mic. */
    ducking: AppRef[] = [];
    micUsers: AppRef[] = [];
    /** The call now, from both (ends after a short quiet time). */
    readonly calls = new CallTracker(() => this.notify());
    /** Windows' media sessions, as the helper last reported them. */
    media: MediaSession[] = [];
    /** The sessions' covers, served on 127.0.0.1 for every plugin (kit), and their accent colours. */
    private readonly coverServer = new CoverServer({ log: { warn: (m) => streamDeck.logger.warn(m) } });
    private readonly coverColors = new Map<string, [number, number, number]>();
    readonly covers = {
        url: (key: string | undefined) => this.coverServer.url(key),
        rgb: (key: string | undefined) => (key ? this.coverColors.get(key) : undefined),
    };
    private mediaRef = 0;
    private readonly mediaPending = new Map<string, { resolve: () => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
    /** Every app seen since the plugin started, with its last state (for a dial or key while it is closed). */
    private readonly seen = new Map<string, AppInfo>();

    private helper: AudioHelper | undefined;
    private readonly listeners = new Set<() => void>();
    /** Told when the user sets a volume on the deck (target "out", "in" or "app:<key>"). */
    private readonly userVolumeListeners = new Set<(target: string) => void>();
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
                this.media = [];
                this.ducking = [];
                this.micUsers = [];
                this.calls.reset();
                for (const ref of [...this.mediaPending.keys()]) this.mediaDone(ref, "the audio helper ended");
                this.notify();
            },
            { info: (m) => streamDeck.logger.info(m), warn: (m) => streamDeck.logger.warn(m) },
        );
        this.helper.start();
    }

    stop(): void {
        this.helper?.stop();
        this.coverServer.stop();
    }

    /** The helper runs and the direction has a device. */
    ready(flow: Flow = "out"): boolean {
        return this.state === "ready" && !!this.endpoints[flow].device?.id;
    }

    app(key: string | undefined): AppInfo | undefined {
        return key ? this.apps.find((a) => a.app === key) : undefined;
    }

    /** The app's last known state, also after it closed (undefined if not seen since the start). */
    lastSeen(key: string | undefined): AppInfo | undefined {
        return key ? this.seen.get(key) : undefined;
    }

    onChange(fn: () => void): () => void {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    onUserVolume(fn: (target: string) => void): () => void {
        this.userVolumeListeners.add(fn);
        return () => this.userVolumeListeners.delete(fn);
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
        for (const fn of this.userVolumeListeners) fn(flow);
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
        for (const fn of this.userVolumeListeners) fn(`app:${key}`);
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

    /** A command for a media session (`id` as in MediaSession); rejects when Windows or the app refuses. */
    mediaCommand(id: string, command: MediaCommand, value?: number | boolean | string): Promise<void> {
        if (!this.helper || this.state !== "ready") return Promise.reject(new Error("the audio helper isn't running"));
        const ref = String(++this.mediaRef);
        return new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => this.mediaDone(ref, "no answer from the audio helper"), MEDIA_TIMEOUT_MS);
            this.mediaPending.set(ref, { resolve, reject, timer });
            this.helper?.send({ cmd: "media", ref, id, do: command, ...(value !== undefined ? { value } : {}) });
        });
    }

    // Ducking (see ducking.ts): sent as they are, no optimistic values; the helper reports the result

    duckDb(flow: Flow, db: number): void {
        this.helper?.send({ cmd: "volumedb", flow, db: Math.round(db * 10) / 10 });
    }

    duckVolume(flow: Flow, v: number): void {
        this.helper?.send({ cmd: "volume", flow, v: clamp(v) });
    }

    duckAppVolume(key: string, v: number): void {
        this.helper?.send({ cmd: "appvolume", app: key, v: Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000 });
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

    private mediaDone(ref: string, error?: string): void {
        const p = this.mediaPending.get(ref);
        if (!p) return;
        this.mediaPending.delete(ref);
        clearTimeout(p.timer);
        if (error) p.reject(new Error(error));
        else p.resolve();
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
                this.endpoints[msg.flow].db = msg.db;
                this.endpoints[msg.flow].muted = msg.muted;
                break;
            case "devices":
                if (this.isHeld("out")) return;
                this.devices = msg.list;
                break;
            case "apps":
                // Keep the optimistic values of apps changed just now
                this.apps = msg.list.map((a) => (this.isHeld(`app:${a.app}`) ? { ...a, v: this.app(a.app)?.v ?? a.v, muted: this.app(a.app)?.muted ?? a.muted } : a));
                for (const a of this.apps) this.seen.set(a.app, a);
                break;
            case "appicon":
                saveAppIcon(msg.app, msg.png, msg.grey);
                break;
            case "media":
                this.media = msg.list;
                break;
            case "mediacover":
                // Told once the server runs (the first cover starts it), so the URL is there
                if (msg.rgb) this.coverColors.set(msg.cover, msg.rgb);
                void this.coverServer.add(msg.data, msg.type, msg.cover).then(() => {
                    for (const key of [...this.coverColors.keys()]) if (!this.coverServer.has(key)) this.coverColors.delete(key);
                    this.notify();
                });
                return;
            case "calls":
                this.ducking = msg.list;
                this.calls.update(this.ducking, this.micUsers);
                break;
            case "micusers":
                this.micUsers = msg.list;
                this.calls.update(this.ducking, this.micUsers);
                break;
            case "mediadone":
                this.mediaDone(msg.ref, msg.error);
                return;
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
