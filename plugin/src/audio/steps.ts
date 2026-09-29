/** Next volume (0..1) for `ticks` dial steps of `step` percent (1–10, default 2). */
export function stepVolume(volume: number, ticks: number, step: number | undefined): number {
    const s = Math.max(1, Math.min(10, step ?? 2)) / 100;
    return Math.round(Math.min(1, Math.max(0, volume + ticks * s)) * 100) / 100;
}
