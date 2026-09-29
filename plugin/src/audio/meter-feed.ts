// The level for one dial or key: asks for a source's meters while it shows them, and turns the raw
// values into what to draw (digital ballistics with peak hold, VU needles).
import { MeterBallistics, VuBallistics, dbfsToVu } from "@rocklobster42195/streamdeck-kit";
import { systemAudio, type MeterSource } from "./system-audio";

export type MeterFrame = { levels: number[]; peaks: number[]; vus: number[] };

const SILENT = -128;

export class MeterFeed {
    private readonly meters = [new MeterBallistics(), new MeterBallistics()];
    private readonly needles = [new VuBallistics(), new VuBallistics()];
    private source: MeterSource | undefined;

    constructor(private readonly owner: string) {}

    /** Show the level of `source` (undefined = none). Safe to call often. */
    update(source: MeterSource | undefined): void {
        if (source === this.source) return;
        if (this.source) systemAudio.wantMeters(this.source, this.owner, false);
        this.source = source;
        if (source) systemAudio.wantMeters(source, this.owner, true);
    }

    get active(): boolean {
        return !!this.source;
    }

    stop(): void {
        this.update(undefined);
    }

    frame(now = Date.now()): MeterFrame {
        const m = this.source ? systemAudio.meter(this.source) : undefined;
        const measured = [m?.l ?? SILENT, m?.r ?? SILENT];
        const states = measured.map((db, i) => this.meters[i].update(db, now));
        return {
            levels: states.map((s) => s.level),
            peaks: states.map((s) => s.peak),
            vus: measured.map((db, i) => this.needles[i].update(dbfsToVu(db), now)),
        };
    }
}
