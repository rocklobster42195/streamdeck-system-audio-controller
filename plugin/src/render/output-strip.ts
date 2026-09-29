// The Output dial's touch-strip segment (200×100), in XR-C's four looks: "Digital" (LED bars and
// a volume bar), "Classic" (analog VU meters), or just the volume as a ring or a pie.
import { METER_TICKS, arc, escapeXml, meterBar, meterScaleMarks, mdi, pie, stripImage, text, textWidth, vuMeter } from "@rocklobster42195/streamdeck-kit";
import { mdiAlertCircleOutline, mdiApplicationOutline, mdiSleep, mdiSpeaker, mdiVolumeOff } from "@mdi/js";

export type OutputStyle = "digital" | "classic" | "ring" | "pie";

/** Styles that show the level (and need meters from the helper). */
export function showsMeter(style: OutputStyle): boolean {
    return style === "digital" || style === "classic";
}

export type OutputView = {
    name: string;
    /** 0..1 */
    volume: number;
    muted: boolean;
    /** dBFS, left and right. */
    levels: number[];
    peaks: number[];
    vus: number[];
    style: OutputStyle;
};

/** SA-C's colour (Cerise, house palette). */
export const ACCENT = "#E14190";
const MUTED = "#ff5a5a";

export const percent = (v: number) => `${Math.round(v * 100)} %`;

export function renderOutputStrip(v: OutputView): string {
    if (v.style === "classic") return classic(v);
    if (v.style === "ring" || v.style === "pie") return gauge(v);
    return digital(v);
}

function gauge(v: OutputView): string {
    const color = v.muted ? "#5a5a60" : ACCENT;
    const parts = v.style === "pie" ? pie(50, 50, 38, v.muted ? 0 : v.volume, color) : arc(50, 50, 34, v.volume, color);
    if (v.muted) parts.push(mdi(mdiVolumeOff, 34, 34, 32, MUTED));
    parts.push(text(100, 44, v.name, { size: 14, weight: "bold", maxWidth: 94 }));
    parts.push(v.muted ? text(100, 64, "MUTE", { size: 13, weight: "bold", color: MUTED }) : text(100, 64, percent(v.volume), { size: 14, weight: "bold", color: ACCENT }));
    return stripImage(parts);
}

function digital(v: OutputView): string {
    const w = 184;
    const bx = 8;
    const right = v.muted ? textWidth("MUTE", 12, { bold: true }) + 22 : textWidth(percent(v.volume), 13, { bold: true });
    const parts = [
        text(8, 18, v.name, { size: 14, weight: "bold", maxWidth: Math.max(60, 184 - right - 10) }),
        v.muted
            ? `${mdi(mdiVolumeOff, 192 - textWidth("MUTE", 12, { bold: true }) - 22, 4, 18, MUTED)}${text(192, 18, "MUTE", { size: 12, weight: "bold", color: MUTED, anchor: "end" })}`
            : text(192, 18, percent(v.volume), { size: 13, weight: "bold", color: ACCENT, anchor: "end" }),
        ...meterBar({ x: bx, y: 30, length: w, thickness: 22, levels: v.levels, peaks: v.peaks, segments: 36, off: v.muted ? "#1a1c20" : undefined }),
        ...meterScaleMarks(bx, 57, w, METER_TICKS),
        // The volume as a slim bar under the scale
        `<rect x="${bx}" y="86" width="${w}" height="5" rx="2.5" fill="#2a2b30"/>`,
        `<rect x="${bx}" y="86" width="${(w * v.volume).toFixed(1)}" height="5" rx="2.5" fill="${v.muted ? "#5a5a60" : ACCENT}"/>`,
    ];
    if (v.muted) parts.push(`<rect x="${bx}" y="30" width="${w}" height="22" fill="#000" opacity="0.45"/>`);
    return stripImage(parts);
}

function classic(v: OutputView): string {
    const parts = [
        ...vuMeter({ x: 4, y: 6, width: 94, height: 80, vu: v.vus[0], label: "LEFT", id: "vl" }),
        ...vuMeter({ x: 102, y: 6, width: 94, height: 80, vu: v.vus[1], label: "RIGHT", id: "vr" }),
    ];
    const caption = `${escapeXml(v.name.toUpperCase())} · ${v.muted ? "MUTE" : percent(v.volume)}`;
    parts.push(`<text x="100" y="97" font-family="Arial,sans-serif" font-size="9" fill="${v.muted ? MUTED : "#bfa76a"}" text-anchor="middle" letter-spacing="1.5">${caption}</text>`);
    return stripImage(parts, "#141210");
}

export type MessageKind = "starting" | "failed" | "unsupported" | "no-device" | "choose" | "not-running";

const MESSAGE_ICONS: Record<MessageKind, string> = {
    starting: mdiSpeaker,
    "no-device": mdiSpeaker,
    failed: mdiAlertCircleOutline,
    unsupported: mdiAlertCircleOutline,
    choose: mdiApplicationOutline,
    "not-running": mdiSleep,
};

/** Not ready: starting, failed, no output device, not on Windows, no app chosen, app not running. */
export function renderOutputMessage(kind: MessageKind, label: string, hint: string): string {
    const icon = MESSAGE_ICONS[kind];
    const color = kind === "failed" ? MUTED : "#8a8a90";
    return stripImage([mdi(icon, 16, 34, 32, color), text(60, 46, label, { size: 14, weight: "bold", maxWidth: 132 }), text(60, 64, hint, { size: 11, color: "#a4a4aa", maxWidth: 132 })]);
}
