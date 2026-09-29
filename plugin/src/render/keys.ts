// SA-C's keys (144×144): the Mic key (red and crossed out when muted, a small level otherwise) and
// the Device key (the output device with a fitting icon, framed while it is the default).
import { escapeXml, meterBar, wrap } from "@rocklobster42195/streamdeck-kit";
import { mdiAlertCircleOutline, mdiHeadphones, mdiMicrophone, mdiMicrophoneOff, mdiMonitorSpeaker, mdiSpeaker, mdiSpeakerMultiple } from "@mdi/js";
import { ACCENT } from "./output-strip";

const SIZE = 144;
/** House palette red. */
export const MUTE_RED = "#E30018";
const font = `font-family="Segoe UI, Arial, sans-serif"`;

export type MicKeyView = {
    muted: boolean;
    /** Label under the icon when muted ("MUTED"). */
    mutedLabel: string;
    /** Level in dBFS (the louder side) with peak, when shown. */
    levels?: number[];
    peaks?: number[];
};

export function renderMicKey(v: MicKeyView): string {
    if (v.muted) {
        return svgUri([
            `<rect width="${SIZE}" height="${SIZE}" fill="${MUTE_RED}"/>`,
            icon(mdiMicrophoneOff, 36, 18, 72, "#FFFFFF"),
            `<text x="${SIZE / 2}" y="122" ${font} font-size="20" font-weight="700" fill="#FFFFFF" text-anchor="middle" letter-spacing="1">${escapeXml(v.mutedLabel)}</text>`,
        ]);
    }
    const parts = [`<rect width="${SIZE}" height="${SIZE}" fill="#101010"/>`, icon(mdiMicrophone, 40, 22, 64, "#e0e0e0")];
    if (v.levels?.length) parts.push(...meterBar({ x: 16, y: 112, length: SIZE - 32, thickness: 12, levels: [Math.max(...v.levels)], peaks: v.peaks?.length ? [Math.max(...v.peaks)] : undefined, segments: 20 }));
    return svgUri(parts);
}

export type DeviceKeyView = { name: string; active: boolean };

/** Headphones, a monitor's speakers, several speakers, or plain speakers — guessed from the name. */
export function deviceIcon(name: string): string {
    const n = name.toLowerCase();
    if (/kopfh|headphone|headset|earbud|airpods|buds/.test(n)) return mdiHeadphones;
    if (/hdmi|displayport|monitor|display|tv\b|fernseh/.test(n)) return mdiMonitorSpeaker;
    if (/sonos|multi|group|gruppe/.test(n)) return mdiSpeakerMultiple;
    return mdiSpeaker;
}

export function renderDeviceKey(v: DeviceKeyView): string {
    const ink = v.active ? "#FFFFFF" : "#8a8a90";
    const lines = wrap(v.name, SIZE - 20, 18, 2);
    const parts = [
        `<rect width="${SIZE}" height="${SIZE}" fill="#101010"/>`,
        v.active ? `<rect x="3" y="3" width="${SIZE - 6}" height="${SIZE - 6}" rx="14" fill="none" stroke="${ACCENT}" stroke-width="6"/>` : "",
        icon(deviceIcon(v.name), 44, lines.length > 1 ? 16 : 24, 56, v.active ? ACCENT : "#6a6a70"),
        ...lines.map((l, i) => `<text x="${SIZE / 2}" y="${(lines.length > 1 ? 96 : 108) + i * 21}" ${font} font-size="18" font-weight="${v.active ? 700 : 400}" fill="${ink}" text-anchor="middle">${escapeXml(l)}</text>`),
    ];
    return svgUri(parts);
}

/** Not ready (helper starting or failed, not on Windows, nothing chosen): icon and a short text. */
export function renderKeyMessage(label: string, warn = false): string {
    const lines = wrap(label, SIZE - 16, 16, 2);
    return svgUri([
        `<rect width="${SIZE}" height="${SIZE}" fill="#101010"/>`,
        icon(warn ? mdiAlertCircleOutline : mdiSpeaker, 48, 26, 48, warn ? "#ff5a5a" : "#8a8a90"),
        ...lines.map((l, i) => `<text x="${SIZE / 2}" y="${100 + i * 19}" ${font} font-size="16" fill="#c8c8cc" text-anchor="middle">${escapeXml(l)}</text>`),
    ]);
}

function icon(path: string, x: number, y: number, size: number, color: string): string {
    return `<path transform="translate(${x} ${y}) scale(${size / 24})" fill="${color}" d="${path}"/>`;
}

function svgUri(parts: string[]): string {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">${parts.join("")}</svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
