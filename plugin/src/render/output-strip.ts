// The Output and App dials' touch-strip segment (200×100): the kit's level strip (renderLevelStrip,
// the same as in XR-C) in its four looks, "Digital", "Classic", "Ring" and "Pie", with SA-C's
// parts: the volume in percent, an app's icon next to its name (in the ring for Ring and Pie), and
// an app that isn't running drawn greyed out with its last known volume.
import { levelStyleShowsMeter, renderLevelMessage, renderLevelStrip, type LevelStyle } from "@rocklobster42195/streamdeck-kit";
import { mdiAlertCircleOutline, mdiApplicationOutline, mdiSpeaker } from "@mdi/js";

export type OutputStyle = LevelStyle;

/** Styles that show the level (and need meters from the helper). */
export function showsMeter(style: OutputStyle): boolean {
    return levelStyleShowsMeter(style);
}

export type OutputView = {
    name: string;
    /** 0..1; undefined = unknown (an app not seen since the start). */
    volume: number | undefined;
    muted: boolean;
    /** dBFS, left and right. */
    levels: number[];
    peaks: number[];
    vus: number[];
    style: OutputStyle;
    /** The app's icon (data URI). */
    icon?: string;
    /** The app isn't running: everything grey, no level. */
    inactive?: boolean;
    /** The Panorama effect's slice behind the dial (SVG fragment), if it shows one. */
    background?: string;
};

/** SA-C's colour (Cerise, house palette). */
export const ACCENT = "#E14190";
const MUTED = "#ff5a5a";
const INK_GREY = "#8a8a90";

export const percent = (v: number | undefined) => (v === undefined ? "–" : `${Math.round(v * 100)} %`);

export function renderOutputStrip(v: OutputView): string {
    return renderLevelStrip({
        style: v.style,
        name: v.name,
        valueText: percent(v.volume),
        position: v.volume,
        color: ACCENT,
        muted: v.muted,
        inactive: v.inactive,
        icon: v.icon,
        levels: v.levels,
        peaks: v.peaks,
        vus: v.vus,
        background: v.background,
    });
}

export type MessageKind = "starting" | "failed" | "unsupported" | "no-device" | "choose";

const MESSAGE_ICONS: Record<MessageKind, string> = {
    starting: mdiSpeaker,
    "no-device": mdiSpeaker,
    failed: mdiAlertCircleOutline,
    unsupported: mdiAlertCircleOutline,
    choose: mdiApplicationOutline,
};

/** Not ready: starting, failed, no output device, not on Windows, no app chosen. */
export function renderOutputMessage(kind: MessageKind, label: string, hint: string): string {
    return renderLevelMessage(MESSAGE_ICONS[kind], kind === "failed" ? MUTED : INK_GREY, label, hint);
}
