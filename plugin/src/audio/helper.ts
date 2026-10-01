// The audio helper process (helper/sac-audio.ps1 on Windows): started once, restarted with a
// growing pause when it dies, JSON lines both ways (see helper/Helper.cs for the messages).
// SAC_HELPER=<file.mjs> runs a Node stand-in instead (the simulator's fake system audio).
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type Flow = "out" | "in";
export type OutputDevice = { id: string; name: string; default: boolean };
export type AppInfo = { app: string; name: string; v: number; muted: boolean; active: boolean };

export type HelperMessage =
    | { t: "ready" }
    | { t: "device"; flow: Flow; id: string; name: string }
    | { t: "volume"; flow: Flow; v: number; db?: number; muted: boolean }
    | { t: "meter"; flow: Flow; l: number; r: number }
    | { t: "devices"; list: OutputDevice[] }
    | { t: "apps"; list: AppInfo[] }
    | { t: "appmeter"; app: string; l: number; r: number }
    | { t: "appicon"; app: string; png: string; grey: string }
    | { t: "error"; message: string };

export type HelperCommand =
    | { cmd: "volume"; flow: Flow; v: number }
    | { cmd: "volumedb"; flow: Flow; db: number }
    | { cmd: "mute"; flow: Flow; on: boolean }
    | { cmd: "meters"; flow: Flow; on: boolean }
    | { cmd: "default"; id: string }
    | { cmd: "appvolume"; app: string; v: number }
    | { cmd: "appmute"; app: string; on: boolean }
    | { cmd: "appmeters"; apps: string }
    | { cmd: "quit" };

const RESTART_MS = [1000, 2000, 5000, 10_000, 30_000];

/** Splits a stream into lines and parses each as a helper message (bad lines are skipped). */
export class LineParser {
    private rest = "";

    push(chunk: string): HelperMessage[] {
        const lines = (this.rest + chunk).split("\n");
        this.rest = lines.pop() ?? "";
        const out: HelperMessage[] = [];
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                const msg = JSON.parse(trimmed) as HelperMessage;
                if (msg && typeof msg.t === "string") out.push(msg);
            } catch {
                // not JSON (e.g. a PowerShell warning): ignore
            }
        }
        return out;
    }
}

export class AudioHelper {
    private child: ChildProcess | undefined;
    private restarts = 0;
    private timer: ReturnType<typeof setTimeout> | undefined;
    private stopped = false;

    constructor(
        private readonly onMessage: (msg: HelperMessage) => void,
        private readonly onExit: (reason: string) => void,
        private readonly log: { info(m: string): void; warn(m: string): void } = console,
    ) {}

    start(): void {
        this.stopped = false;
        const parser = new LineParser();
        const child = spawnHelper();
        this.child = child;
        child.stdout?.setEncoding("utf8");
        child.stdout?.on("data", (chunk: string) => {
            for (const msg of parser.push(chunk)) {
                if (msg.t === "ready") this.restarts = 0;
                this.onMessage(msg);
            }
        });
        child.stderr?.setEncoding("utf8");
        child.stderr?.on("data", (chunk: string) => this.log.warn(`[helper] ${chunk.trim()}`));
        child.on("error", (e) => this.log.warn(`[helper] could not start: ${e.message}`));
        child.on("exit", (code) => {
            if (this.child !== child) return;
            this.child = undefined;
            this.onExit(`exit ${code}`);
            if (this.stopped) return;
            const wait = RESTART_MS[Math.min(this.restarts++, RESTART_MS.length - 1)];
            this.log.info(`[helper] ended (${code}), restarting in ${wait} ms`);
            this.timer = setTimeout(() => this.start(), wait);
        });
    }

    send(cmd: HelperCommand): void {
        if (this.child?.stdin?.writable) this.child.stdin.write(`${JSON.stringify(cmd)}\n`);
    }

    stop(): void {
        this.stopped = true;
        clearTimeout(this.timer);
        this.send({ cmd: "quit" });
        this.child?.stdin?.end();
    }
}

function spawnHelper(): ChildProcess {
    const fake = process.env.SAC_HELPER;
    if (fake) return spawn(process.execPath, [fake], { stdio: ["pipe", "pipe", "pipe"] });
    // bin/plugin.js → ../helper/sac-audio.ps1
    const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "helper", "sac-audio.ps1");
    return spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
}
