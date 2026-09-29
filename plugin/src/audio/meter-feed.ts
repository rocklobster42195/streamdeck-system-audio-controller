// The output level for one dial: asks for meters while the dial shows them, and turns the raw
// values into what to draw (digital ballistics with peak hold, VU needles).
import { MeterBallistics, VuBallistics, dbfsToVu } from "@rocklobster42195/streamdeck-kit";
import { systemAudio } from "./system-audio";

export type MeterFrame = { levels: number[]; peaks: number[]; vus: number[] };

const SILENT = -128;

export class MeterFeed {
    private readonly meters = [new MeterBallistics(), new MeterBallistics()];
    private readonly needles = [new VuBallistics(), new VuBallistics()];
    private wanted = false;

    constructor(private readonly owner: string) {}

    update(wanted: boolean): void {
        if (wanted === this.wanted) return;
        this.wanted = wanted;
        systemAudio.wantMeters(this.owner, wanted);
    }

    get active(): boolean {
        return this.wanted;
    }

    stop(): void {
        this.update(false);
    }

    frame(now = Date.now()): MeterFrame {
        const m = systemAudio.meter;
        const measured = [m?.l ?? SILENT, m?.r ?? SILENT];
        const states = measured.map((db, i) => this.meters[i].update(db, now));
        return {
            levels: states.map((s) => s.level),
            peaks: states.map((s) => s.peak),
            vus: measured.map((db, i) => this.needles[i].update(dbfsToVu(db), now)),
        };
    }
}
