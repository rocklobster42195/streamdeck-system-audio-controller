// The Output and App dials' touch-strip segment (200×100), in XR-C's four looks: "Digital" (LED
// bars and a volume bar), "Classic" (analog VU meters), or just the volume as a ring or a pie.
// An app's icon sits next to its name (in the ring for Ring and Pie). An app that isn't running is
// drawn greyed out, with its last known volume.
import { METER_TICKS, arc, escapeXml, meterBar, meterScaleMarks, mdi, pie, stripImage, text, textWidth, vuMeter } from "@rocklobster42195/streamdeck-kit";
import { mdiAlertCircleOutline, mdiApplicationOutline, mdiSpeaker, mdiVolumeOff } from "@mdi/js";

export type OutputStyle = "digital" | "classic" | "ring" | "pie";

/** Styles that show the level (and need meters from the helper). */
export function showsMeter(style: OutputStyle): boolean {
    return style === "digital" || style === "classic";
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
};

/** SA-C's colour (Cerise, house palette). */
export const ACCENT = "#E14190";
const MUTED = "#ff5a5a";
const GREY = "#5a5a60";
const INK_GREY = "#8a8a90";

export const percent = (v: number | undefined) => (v === undefined ? "–" : `${Math.round(v * 100)} %`);

export function renderOutputStrip(v: OutputView): string {
    if (v.style === "classic") return classic(v);
    if (v.style === "ring" || v.style === "pie") return gauge(v);
    return digital(v);
}

const image = (href: string, x: number, y: number, size: number) => `<image href="${href}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;

function gauge(v: OutputView): string {
    const color = v.inactive || v.muted ? GREY : ACCENT;
    const volume = v.volume ?? 0;
    const parts = v.style === "pie" ? pie(50, 50, 38, v.muted ? 0 : volume, color) : arc(50, 50, 34, volume, color);
    if (v.muted && !v.inactive) parts.push(mdi(mdiVolumeOff, 34, 34, 32, MUTED));
    else if (v.icon) parts.push(image(v.icon, v.style === "pie" ? 30 : 32, v.style === "pie" ? 30 : 32, v.style === "pie" ? 40 : 36));
    parts.push(text(100, 44, v.name, { size: 14, weight: "bold", maxWidth: 94, color: v.inactive ? INK_GREY : undefined }));
    if (v.muted && !v.inactive) parts.push(text(100, 64, "MUTE", { size: 13, weight: "bold", color: MUTED }));
    else parts.push(text(100, 64, percent(v.volume), { size: 14, weight: "bold", color: v.inactive ? GREY : ACCENT }));
    return stripImage(parts);
}

function digital(v: OutputView): string {
    const w = 184;
    const bx = 8;
    const showMute = v.muted && !v.inactive;
    const right = showMute ? textWidth("MUTE", 12, { bold: true }) + 22 : textWidth(percent(v.volume), 13, { bold: true });
    const nameX = v.icon ? 32 : 8;
    const parts = [
        v.icon ? image(v.icon, 6, 3, 20) : "",
        text(nameX, 18, v.name, { size: 14, weight: "bold", maxWidth: Math.max(60, 192 - nameX - right - 10), color: v.inactive ? INK_GREY : undefined }),
        showMute
            ? `${mdi(mdiVolumeOff, 192 - textWidth("MUTE", 12, { bold: true }) - 22, 4, 18, MUTED)}${text(192, 18, "MUTE", { size: 12, weight: "bold", color: MUTED, anchor: "end" })}`
            : text(192, 18, percent(v.volume), { size: 13, weight: "bold", color: v.inactive ? GREY : ACCENT, anchor: "end" }),
        ...meterBar({ x: bx, y: 30, length: w, thickness: 22, levels: v.inactive ? [-128, -128] : v.levels, peaks: v.inactive ? undefined : v.peaks, segments: 36, off: v.muted || v.inactive ? "#1a1c20" : undefined }),
        ...meterScaleMarks(bx, 57, w, METER_TICKS),
        // The volume as a slim bar under the scale
        `<rect x="${bx}" y="86" width="${w}" height="5" rx="2.5" fill="#2a2b30"/>`,
        `<rect x="${bx}" y="86" width="${(w * (v.volume ?? 0)).toFixed(1)}" height="5" rx="2.5" fill="${v.muted || v.inactive ? GREY : ACCENT}"/>`,
    ];
    if (showMute) parts.push(`<rect x="${bx}" y="30" width="${w}" height="22" fill="#000" opacity="0.45"/>`);
    return stripImage(parts);
}

function classic(v: OutputView): string {
    const parts = [
        ...vuMeter({ x: 4, y: 6, width: 94, height: 80, vu: v.vus[0], label: "LEFT", id: "vl" }),
        ...vuMeter({ x: 102, y: 6, width: 94, height: 80, vu: v.vus[1], label: "RIGHT", id: "vr" }),
    ];
    const caption = `${escapeXml(v.name.toUpperCase())} · ${v.muted && !v.inactive ? "MUTE" : percent(v.volume)}`;
    // Not running: the meters dimmed like a switched-off device
    if (v.inactive) parts.push(`<rect width="200" height="100" fill="#000" opacity="0.55"/>`);
    parts.push(`<text x="100" y="97" font-family="Arial,sans-serif" font-size="9" fill="${v.inactive ? INK_GREY : v.muted ? MUTED : "#bfa76a"}" text-anchor="middle" letter-spacing="1.5">${caption}</text>`);
    return stripImage(parts, "#141210");
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
    const icon = MESSAGE_ICONS[kind];
    const color = kind === "failed" ? MUTED : INK_GREY;
    return stripImage([mdi(icon, 16, 34, 32, color), text(60, 46, label, { size: 14, weight: "bold", maxWidth: 132 }), text(60, 64, hint, { size: 11, color: "#a4a4aa", maxWidth: 132 })]);
}
